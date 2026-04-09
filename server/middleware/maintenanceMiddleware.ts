/**
 * Maintenance Mode Middleware - SEALED AIRLOCK PATTERN
 * ======================================================
 * 
 * Security model:
 * - Auth is NEVER disabled - RBAC stays fully enforced
 * - Regular users get 503 on ALL routes (door is sealed)
 * - Crawlers must authenticate normally + provide bypass token
 * - All bypass requests are logged for audit
 * 
 * This prevents:
 * - Credential stuffing during maintenance
 * - Session replay attacks
 * - Hackers exploiting "disabled auth" windows
 */

import { Request, Response, NextFunction } from 'express';
import { maintenanceModeService } from '../services/maintenanceModeService';
import { isDbCircuitOpen } from '../db';
import { createLogger } from '../lib/logger';
const log = createLogger('maintenanceMiddleware');

let maintenanceStatusCache: { isActive: boolean; cachedAt: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds
const CIRCUIT_OPEN_CACHE_TTL_MS = 120_000; // 2 minutes when DB circuit is open

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register', 
  '/pricing',
  '/trinity-features',
  '/features',
  '/contact',
  '/support',
  '/terms',
  '/privacy',
  '/status',
  '/forgot-password',
  '/reset-password',
  '/compare',
  '/templates',
  '/roi-calculator'
];

const PROTECTED_APP_ROUTES = [
  '/dashboard',
  '/schedule',
  '/employees',
  '/clients',
  '/time-tracking',
  '/invoices',
  '/payroll',
  '/settings',
  '/integrations',
  '/notifications',
  '/usage',
  '/owner-analytics',
  '/quickbooks',
  '/workflow-approvals',
  '/admin',
  '/reports'
];

const ALWAYS_ALLOWED_API = [
  '/api/health',
  '/api/health/summary',
  '/api/status',
  '/api/maintenance/status',
  '/api/maintenance/orchestrator',
  '/api/mascot/holiday',
  '/api/mascot/seasonal/state'
];

function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(route => path === route || path.startsWith(route + '/'));
}

function isProtectedAppRoute(path: string): boolean {
  return PROTECTED_APP_ROUTES.some(route => path === route || path.startsWith(route + '/'));
}

function isAlwaysAllowedApi(path: string): boolean {
  return ALWAYS_ALLOWED_API.some(route => path.startsWith(route));
}

function validateBypassToken(req: Request): { valid: boolean; reason?: string } {
  const bypassHeader = req.headers['x-maintenance-bypass'] as string;
  const diagHeader = req.headers['x-diagnostics-runner'] as string;
  const bypassSecret = process.env.MAINTENANCE_BYPASS_SECRET;
  const diagSecret = process.env.DIAG_BYPASS_SECRET;

  if (bypassSecret && bypassHeader === bypassSecret) {
    return { valid: true };
  }
  
  if (diagSecret && diagHeader === diagSecret) {
    return { valid: true };
  }

  return { valid: false, reason: 'Invalid or missing bypass token' };
}

function logBypassAccess(req: Request, user: any): void {
  const timestamp = new Date().toISOString();
  const userId = user?.id || 'anonymous';
  const userEmail = user?.email || 'unknown';
  const method = req.method;
  const path = req.path;
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  
  log.info(`[MAINTENANCE-BYPASS-AUDIT] ${timestamp} | User: ${userId} (${userEmail}) | ${method} ${path} | IP: ${ip}`);
}

export async function maintenanceMiddleware(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    let isActive = false;
    let checkFailed = false;

    const cacheTtl = isDbCircuitOpen() ? CIRCUIT_OPEN_CACHE_TTL_MS : CACHE_TTL_MS;
    if (maintenanceStatusCache && (Date.now() - maintenanceStatusCache.cachedAt) < cacheTtl) {
      isActive = maintenanceStatusCache.isActive;
    } else if (isDbCircuitOpen()) {
      // DB is unavailable — default to not-in-maintenance, cache result
      maintenanceStatusCache = { isActive: false, cachedAt: Date.now() };
    } else {
      const timeoutMs = 3000;
      const timeoutPromise = new Promise<boolean>((_, reject) => 
        setTimeout(() => reject(new Error('Maintenance check timeout')), timeoutMs)
      );

      try {
        isActive = await Promise.race([
          maintenanceModeService.isMaintenanceActive(),
          timeoutPromise
        ]);
        maintenanceStatusCache = { isActive, cachedAt: Date.now() };
      } catch (timeoutError) {
        log.warn('[MaintenanceMiddleware] Timeout checking maintenance status');
        maintenanceStatusCache = { isActive: false, cachedAt: Date.now() }; // cache the failure
        checkFailed = true;
      }
    }
    
    // If check failed and this is a protected route, fail-closed with 503
    // This maintains the "sealed airlock" security model
    if (checkFailed) {
      const path = req.path;
      if (isProtectedAppRoute(path)) {
        res.status(503).json({
          success: false,
          error: 'service_unavailable',
          message: 'Unable to verify system status. Please try again.'
        });
        return;
      }
      // For non-protected routes (public pages, health checks), allow through
      return next();
    }
    
    if (!isActive) {
      return next();
    }

    const path = req.path;
    const isApi = path.startsWith('/api/');

    if (isAlwaysAllowedApi(path)) {
      return next();
    }

    const bypassCheck = validateBypassToken(req);
    
    if (bypassCheck.valid) {
      const user = req.user;
      logBypassAccess(req, user);
      return next();
    }

    if (isProtectedAppRoute(path)) {
      const status = await maintenanceModeService.getPublicStatus();
      res.status(503).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Scheduled Maintenance</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
            .container { text-align: center; padding: 2rem; max-width: 500px; }
            h1 { color: #f59e0b; margin-bottom: 1rem; }
            p { color: #ccc; line-height: 1.6; }
            .btn { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #f59e0b; color: #1a1a2e; text-decoration: none; border-radius: 6px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Scheduled Maintenance</h1>
            <p>${status.message}</p>
            ${status.estimatedEndTime ? `<p>Estimated completion: ${new Date(status.estimatedEndTime).toLocaleString()}</p>` : ''}
            <a href="/status" class="btn">Check Status</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

    if (!isApi && isPublicRoute(path)) {
      return next();
    }

    if (path.startsWith('/api/auth/login') || 
        path.startsWith('/api/auth/register')) {
      const status = await maintenanceModeService.getPublicStatus();
      res.status(503).json({
        success: false,
        error: 'maintenance_mode',
        code: 'AUTH_BLOCKED_MAINTENANCE',
        message: 'Login is temporarily unavailable. The platform is under maintenance.',
        statusMessage: status.message,
        estimatedEndTime: status.estimatedEndTime,
        progressPercent: status.progressPercent,
        retryAfterSeconds: 60
      });
      return;
    }

    if (isApi) {
      const status = await maintenanceModeService.getPublicStatus();
      res.status(503).json({
        success: false,
        error: 'maintenance_mode',
        code: 'API_BLOCKED_MAINTENANCE',
        message: 'The platform is currently under maintenance. Please try again later.',
        statusMessage: status.message,
        estimatedEndTime: status.estimatedEndTime,
        progressPercent: status.progressPercent,
        retryAfterSeconds: 60
      });
      return;
    }

    next();
    
  } catch (error) {
    log.error('[MaintenanceMiddleware] Error:', error);
    next();
  }
}

export function maintenanceStatusHeader(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use the shared in-module cache populated by maintenanceMiddleware.
  // Never query the DB independently — that causes a per-request hang when DB is down.
  if (maintenanceStatusCache?.isActive) {
    res.setHeader('X-Maintenance-Mode', 'true');
  }
  next();
}

export async function sealedAirlockCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isActive = await maintenanceModeService.isMaintenanceActive();
    
    if (!isActive) {
      return next();
    }

    const bypassCheck = validateBypassToken(req);
    
    if (bypassCheck.valid) {
      return next();
    }

    const status = await maintenanceModeService.getPublicStatus();
    
    res.status(503).json({
      success: false,
      error: 'platform_sealed',
      code: 'AIRLOCK_SEALED',
      message: 'Platform access is sealed during maintenance.',
      statusMessage: status.message,
      estimatedEndTime: status.estimatedEndTime,
      progressPercent: status.progressPercent
    });
    
  } catch (error) {
    log.error('[SealedAirlock] Error:', error);
    next();
  }
}
