// Service Health & Status Monitoring Routes
// Consolidated module for health checks, workspace status, and diagnostics

import { sanitizeError } from '../middleware/errorHandler';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { User } from '@shared/schema';
import { z } from 'zod';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { db, pool } from '../db';
import { storage } from '../storage';
import { captureTestEvent } from '../lib/errorTracker';
import { 
  getHealthSummary, 
  getServiceHealth, 
  getGatewayHealth, 
  checkDatabase,
  checkChatWebSocket,
  checkStripe,
  checkGeminiAI,
  getIntegrationHealthSummary
} from '../services/healthCheck';
import { 
  getDetailedHealthReport, 
  getSystemMetrics, 
  getResponseTimeHistory, 
  getErrorLogs, 
  runTrinityFastDiagnostics, 
  DIAGNOSTIC_SERVICE_REGISTRY, 
  DOMAIN_LABELS, 
  getAllDomains 
} from '../services/healthService';
import type { ServiceIncidentReportPayload } from '../../shared/healthTypes';
import { objectStorageClient } from '../objectStorage';
import { users } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { FEATURES } from '../featureFlags';
import { emailService } from '../services/emailService';
import { createHealthCheckTicket } from '../services/autoTicketCreation';
import { strictVirusScan } from '../middleware/virusScan';
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('Health');


// Authenticated request type
interface AuthenticatedRequest extends Request {
  user?: Request["user"];
  workspaceId?: string;
}

// Rate limiter for incident reporting (stricter than general API)
const incidentReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 incident reports per 15 minutes per IP
  message: 'Too many incident reports from this IP. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer configuration for screenshot uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for screenshots
    files: 1, // Only one screenshot per report
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, JPEG, WEBP) are allowed'));
    }
  },
});

// Zod schema for incident report validation
const serviceIncidentReportSchema = z.object({
  serviceKey: z.enum(['database', 'chat_websocket', 'gemini_ai', 'object_storage', 'stripe', 'email']),
  errorType: z.enum(['connection_failed', 'timeout', 'server_error', 'unknown']),
  userMessage: z.string().max(1000).optional(),
  errorMessage: z.string().max(2000).optional(),
  stackTrace: z.string().max(5000).optional(),
  metadata: z.object({
    url: z.string().optional(),
    userAgent: z.string().optional(),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
    }).optional(),
  }).passthrough().optional(),
});

// Create root router for /health endpoint (non-API)
const rootRouter = Router();

// GET /health - Simple health check (for monitoring services like Render)
rootRouter.get('/health', async (_req: Request, res: Response) => {
  const requestStart = Date.now();
  const health: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    features: [],
    dependencies: {},
    pool: {
      total: (pool as any).totalCount ?? 0,
      idle: (pool as any).idleCount ?? 0,
      waiting: (pool as any).waitingCount ?? 0,
    },
  };

  // Test database connection
  try {
    await db.select().from(users).limit(1);
    health.dependencies.database = 'ok';
  } catch (error) {
    log.error('Health check database error:', error);
    health.status = 'degraded';
    health.dependencies.database = 'error';
    return res.status(503).json(health);
  }

  // Test session store
  try {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: sessions | Verified: 2026-03-23
    await typedPool('SELECT 1 FROM sessions LIMIT 1');
    health.dependencies.sessions = 'ok';
  } catch (error) {
    log.error('Health check sessions error:', error);
    health.dependencies.sessions = 'degraded';
  }

  // Test Stripe connection if enabled
  if (FEATURES.STRIPE_PAYMENTS) {
    try {
      const { getStripe } = await import('../services/billing/stripeClient');
      const stripe = getStripe();
      await Promise.race([
        stripe.prices.list({ limit: 1 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Stripe timeout')), 2000))
      ]);
      health.dependencies.stripe = 'ok';
    } catch (error) {
      log.error('Health check Stripe error:', error);
      health.status = 'degraded';
      health.dependencies.stripe = 'error';
    }
  }

  health.latencyMs = Date.now() - requestStart;
  health.uptime_readable = new Date(process.uptime() * 1000).toISOString().substr(11, 8);
  res.json(health);
});

// Create /api/health/* router
const apiHealthRouter = Router();

// GET /api/health - Comprehensive health check with service status
apiHealthRouter.get('/', async (req: Request, res: Response) => {
  const checks: Record<string, { status: string; message?: string }> = {};
  
  try {
    // Use real health check functions from healthCheck service
    const dbHealth = await checkDatabase();
    checks.database = { status: dbHealth.status === 'operational' ? 'up' : dbHealth.status === 'degraded' ? 'degraded' : 'down', message: dbHealth.message };
    
    const chatHealth = await checkChatWebSocket();
    checks.websocket = { status: chatHealth.status === 'operational' ? 'up' : 'down', message: chatHealth.message };
    
    const stripeHealth = await checkStripe();
    checks.stripe = { status: stripeHealth.status === 'operational' ? 'up' : 'down', message: stripeHealth.message };
    
    const geminiHealth = await checkGeminiAI();
    checks.gemini = { status: geminiHealth.status === 'operational' ? 'up' : 'down', message: geminiHealth.message };
    
    // Email service health check
    checks.resend = { status: emailService ? 'up' : 'unconfigured' };

    // Create auto-tickets for critical failures
    if (dbHealth.status === 'down') {
      await createHealthCheckTicket('default', 'database', 'Database connection failed - auto-created by health check');
    }
    if (stripeHealth.status === 'down') {
      await createHealthCheckTicket('default', 'stripe', 'Stripe API unreachable - auto-created by health check');
    }
    if (geminiHealth.status === 'down') {
      await createHealthCheckTicket('default', 'gemini_ai', 'Gemini API unreachable - auto-created by health check');
    }

    const isHealthy = !Object.values(checks).some(c => c.status === 'down');
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      services: checks
    });
  } catch (error) {
    log.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      services: checks
    });
  }
});

// GET /api/health/slo — Readiness Section 22
// Returns the codified SLO targets. Pairs with docs/OBSERVABILITY.md §1.
// Consumers: internal operator dashboards, external status page embed.
apiHealthRouter.get('/slo', async (_req: Request, res: Response) => {
  try {
    const { SLO_TARGETS } = await import('../lib/sloConfig');
    res.json({ ok: true, targets: SLO_TARGETS });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to load SLO config' });
  }
});

// POST /api/health/error-tracker-test — Readiness Section 12
// Fires a synthetic event through the configured error tracker adapter
// so operators can verify ERROR_TRACKING_WEBHOOK_URL works end-to-end
// without waiting for a real error. Not gated (no workspace payload,
// no tenant data), but harmless — the adapter is no-op when unconfigured.
apiHealthRouter.post('/error-tracker-test', (_req: Request, res: Response) => {
  try {
    captureTestEvent();
    res.json({
      ok: true,
      note: 'Synthetic event fired. Check the configured observability backend. If no backend is configured, the event was no-op.',
    });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err?.message || 'Unknown failure' });
  }
});

// GET /api/health/ai-status - Lightweight AI status check (any authenticated user)
// Returns model availability without requiring admin role.
// Used by the client-side TrinityThoughtBar heartbeat.
apiHealthRouter.get('/ai-status', async (req: Request, res: Response) => {
  try {
    const gatewayHealth = await getGatewayHealth();
    const geminiHealth = await checkGeminiAI();
    const gatewayStatus = (gatewayHealth as any)?.status;
    const geminiOk = geminiHealth?.status === 'operational';
    const aiHealthy = gatewayStatus === 'operational' || gatewayStatus === 'healthy' || geminiOk;
    const overall = aiHealthy ? 'full' : 'partial';
    res.json({
      aiHealthy,
      overall,
      gpt: aiHealthy ? 'online' : 'degraded',
      claude: aiHealthy ? 'online' : 'degraded',
      gemini: geminiOk ? 'online' : 'degraded',
      checkedAt: new Date().toISOString(),
    });
  } catch {
    res.json({ aiHealthy: true, overall: 'full', gpt: 'online', claude: 'online', gemini: 'online', checkedAt: new Date().toISOString() });
  }
});

// GET /api/health/gateway - Gateway health check
apiHealthRouter.get('/gateway', async (req: Request, res: Response) => {
  try {
    const gatewayHealth = await getGatewayHealth();
    res.json(gatewayHealth);
  } catch (error: unknown) {
    log.error('Error fetching gateway health:', error);
    res.status(500).json({
      gateway: {
        status: 'down',
        isInitialized: false,
        version: 'unknown',
        lastChecked: new Date().toISOString(),
      },
      systems: {},
      rooms: {
        totalCount: 0,
        byType: { support: 0, work: 0, meeting: 0, org: 0 },
        totalParticipants: 0,
      },
      eventProcessing: {
        activeConnections: 0,
        averageConnectionDuration: 0,
        averageMessageCount: 0,
      },
      platformReadiness: 'critical' as const,
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch gateway health',
    });
  }
});

// In-memory cache for health summary (reduces DB hits on frequently-polled endpoint)
let healthSummaryCache: { data: any; timestamp: number } | null = null;
const HEALTH_CACHE_TTL = 30000; // 30 seconds

// GET /api/health/summary - Overall health summary (all services)
apiHealthRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (healthSummaryCache && (now - healthSummaryCache.timestamp) < HEALTH_CACHE_TTL) {
      return res.json(healthSummaryCache.data);
    }
    const summary = await getHealthSummary();
    healthSummaryCache = { data: summary, timestamp: now };
    res.json(summary);
  } catch (error: unknown) {
    log.error('Error fetching health summary:', error);
    res.status(500).json({
      overall: 'down',
      services: [],
      timestamp: new Date().toISOString(),
      criticalServicesCount: 0,
      operationalServicesCount: 0,
      error: 'Failed to fetch health summary',
    });
  }
});

// GET /api/health/db - check if this path exists in health.ts or server/index.ts. If not, add: query pool for `SELECT 1` to test DB, return {status, poolTotal, poolIdle, poolWaiting, latencyMs}. No auth required.
apiHealthRouter.get('/db', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    // CATEGORY C — Raw SQL retained: health check ping | Tables: N/A | Verified: 2026-03-23
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - startTime;
    
    res.json({
      status: 'ok',
      poolTotal: pool.totalCount,
      poolIdle: pool.idleCount,
      poolWaiting: pool.waitingCount,
      latencyMs
    });
  } catch (error: unknown) {
    log.error('Health check DB error:', error);
    res.status(503).json({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startTime
    });
  }
});

// GET /api/health/detailed - Detailed health report with system metrics
apiHealthRouter.get('/detailed', async (req: Request, res: Response) => {
  try {
    // Gate to platform_staff role
    const authReq = req as AuthenticatedRequest;
    if (authReq.workspaceRole !== 'platform_staff' && authReq.workspaceRole !== 'org_owner') {
      return res.status(403).json({ error: 'Unauthorized. Platform staff access required.' });
    }

    const dbHealth = await checkDatabase();
    const stripeHealth = await checkStripe();
    const geminiHealth = await checkGeminiAI();
    
    // Check if email service key exists
    const emailConfigured = !!process.env.RESEND_API_KEY;

    res.json({
      db: dbHealth,
      stripe: stripeHealth,
      gemini: geminiHealth,
      email: {
        status: emailConfigured ? 'operational' : 'down',
        configured: emailConfigured
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    log.error('Error fetching detailed health report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch detailed health report',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/health/metrics - System metrics (memory, CPU, uptime)
apiHealthRouter.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = getSystemMetrics();
    res.json({ success: true, data: metrics });
  } catch (error: unknown) {
    log.error('Error fetching system metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system metrics',
    });
  }
});

// GET /api/health/response-times - Response time history
apiHealthRouter.get('/response-times', async (req: Request, res: Response) => {
  try {
    const service = req.query.service as string | undefined;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const history = getResponseTimeHistory(service, limit);
    res.json({ success: true, data: history });
  } catch (error: unknown) {
    log.error('Error fetching response time history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch response time history',
    });
  }
});

// GET /api/health/errors - Error logs
apiHealthRouter.get('/errors', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 200);
    const logs = getErrorLogs(limit);
    res.json({ success: true, data: logs });
  } catch (error: unknown) {
    log.error('Error fetching error logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error logs',
    });
  }
});

// GET /api/health/comprehensive - Comprehensive platform diagnostics
apiHealthRouter.get('/comprehensive', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const mode = (req.query.mode as string) === 'quick' ? 'quick' : 'full';
    log.info(`[Health] Running comprehensive diagnostics (${mode} mode) for user ${authReq.user?.id}`);
    
    const result = await runTrinityFastDiagnostics(mode);
    
    res.json({
      success: true,
      ...result,
      registeredServices: DIAGNOSTIC_SERVICE_REGISTRY.length,
      domains: getAllDomains().map(d => ({
        id: d,
        label: DOMAIN_LABELS[d],
        status: result.byDomain[d]?.status || 'operational',
        serviceCount: result.byDomain[d]?.services?.length || 0,
      })),
    });
  } catch (error: unknown) {
    log.error('[Health] Comprehensive diagnostics failed:', sanitizeError(error));
    res.status(500).json({
      success: false,
      error: 'Comprehensive diagnostics failed',
      message: sanitizeError(error),
    });
  }
});

// GET /api/health/data-integrity - Data integrity scan results
apiHealthRouter.get('/data-integrity', async (req: Request, res: Response) => {
  try {
    const { trinityDataIntegrityScanner } = await import('../services/trinityDataIntegrityScanner');
    const result = await trinityDataIntegrityScanner.scan();
    const hardcodedReport = trinityDataIntegrityScanner.getHardcodedPatternsReport();
    
    res.json({
      success: true,
      ...result,
      hardcodedPatterns: {
        fixedCount: hardcodedReport.fixed.length,
        intentionallyStaticCount: hardcodedReport.intentionallyStatic.length,
        needsAttentionCount: hardcodedReport.needsAttention.length,
        details: hardcodedReport,
      },
      conversationalSummary: trinityDataIntegrityScanner.getConversationalSummary(),
    });
  } catch (error: unknown) {
    log.error('[Health] Data integrity scan failed:', sanitizeError(error));
    res.status(500).json({
      success: false,
      error: 'Data integrity scan failed',
      message: sanitizeError(error),
    });
  }
});

// GET /api/health/:service - Individual service health
apiHealthRouter.get('/:service', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;
    
    // Validate service key
    const validServices = ['database', 'chat_websocket', 'gemini_ai', 'object_storage', 'stripe', 'email'];
    if (!validServices.includes(service)) {
      return res.status(400).json({ error: 'Invalid service key' });
    }

    const health = await getServiceHealth(service);
    
    if (!health) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(health);
  } catch (error: unknown) {
    log.error(`Error fetching health for service ${req.params.service}:`, error);
    res.status(500).json({ error: 'Failed to fetch service health' });
  }
});

// Create /api/workspace/* router
const workspaceRouter = Router();

// NOTE: /api/workspace/health is handled in routes.ts with requireAuth middleware

// GET /api/workspace/status - Organization status endpoint
workspaceRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Determine org status based on workspace state
    type OrgStatusType = 'active' | 'suspended_payment' | 'suspended_violation' | 'suspended_other' | 'maintenance' | 'restricted' | 'trial_ending' | 'trial_expired';
    let status: OrgStatusType = 'active';

    if (workspace.isFrozen) {
      status = 'suspended_payment';
    } else if (workspace.isSuspended) {
      status = 'suspended_violation';
    } else if (workspace.isLocked) {
      status = 'suspended_other';
    }

    res.json({
      workspaceId,
      status,
      statusReason: workspace.suspendedReason || workspace.frozenReason || workspace.lockedReason || null,
      lastChecked: new Date().toISOString(),
      metadata: {},
    });
  } catch (error) {
    log.error('Failed to fetch workspace status:', error);
    res.status(500).json({ error: 'Failed to fetch workspace status' });
  }
});

// GET /api/workspace/custom-messages - Get custom organization status messages
workspaceRouter.get('/custom-messages', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Return empty customization (future: store in DB per org)
    res.json({
      workspaceId,
      statusOverrides: {},
      customMessages: {},
    });
  } catch (error) {
    log.error('Failed to fetch custom messages:', error);
    res.status(500).json({ error: 'Failed to fetch custom messages' });
  }
});

// Create /api/integrations/health router
const integrationsHealthRouter = Router();

// GET /api/integrations/health - Integration health check (QuickBooks and Gusto status)
integrationsHealthRouter.get('/health', async (req: Request, res: Response) => {
  try {
    const healthData = await getIntegrationHealthSummary();
    res.json(healthData);
  } catch (error: unknown) {
    log.error('[IntegrationHealth] Error:', sanitizeError(error));
    res.status(500).json({ 
      error: 'Failed to check integration health',
      quickbooks: { service: 'quickbooks', status: 'down', isCritical: false, message: 'Health check failed', lastChecked: new Date().toISOString() },
      gusto: { service: 'gusto', status: 'down', isCritical: false, message: 'Health check failed', lastChecked: new Date().toISOString() },
      overall: 'down',
      timestamp: new Date().toISOString()
    });
  }
});

// Create /api/support/* router
const supportRouter = Router();

// POST /api/support/service-incidents - Create service incident report with optional screenshot
supportRouter.post(
  '/service-incidents',
  incidentReportLimiter,
  upload.single('screenshot'),
  strictVirusScan, // CRITICAL: Scan screenshot for malware
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user!.id;
      const user = await storage.getUser(userId);

      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ error: 'No workspace selected' });
      }

      const workspaceId = req.workspaceId || (user as any)?.workspaceId || user.currentWorkspaceId;

      // Parse and validate request body
      let reportData: ServiceIncidentReportPayload;
      try {
        // If multipart, data will be in req.body as strings
        const parsedBody = {
          ...req.body,
          metadata: req.body.metadata ? JSON.parse(req.body.metadata) : undefined,
        };
        reportData = serviceIncidentReportSchema.parse(parsedBody);
      } catch (validationError: unknown) {
        return res.status(400).json({
          error: 'Invalid report data',
          details: validationError.errors || validationError.message,
        });
      }

      // Determine if service is critical
      const criticalServices = new Set(['database', 'chat_websocket', 'gemini_ai']);
      const isCriticalService = criticalServices.has(reportData.serviceKey);

      // Handle screenshot upload if provided
      let screenshotUrl: string | undefined;
      let screenshotKey: string | undefined;

      if (req.file) {
        try {
          // Upload screenshot to object storage
          const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
          
          if (!bucketId) {
            log.warn('Object storage not configured - screenshot will not be saved');
          } else {
            // Use shared objectStorageClient with sidecar credentials
            const bucket = objectStorageClient.bucket(bucketId);
            
            // Generate unique filename (guard against empty post-sanitization)
            const timestamp = Date.now();
            const sanitizedFilename = (req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_') || 'screenshot';
            
            // Entity ID is the path relative to PRIVATE_OBJECT_DIR
            const entityId = `service-incidents/${workspaceId}/${timestamp}_${sanitizedFilename}`;
            
            // Object name for bucket.file() is just the object segment (.private/...)
            const objectName = `.private/${entityId}`;
            
            // Upload to object storage
            const blob = bucket.file(objectName);
            const blobStream = blob.createWriteStream({
              resumable: false,
              metadata: {
                contentType: (req.file.mimetype),
                metadata: {
                  uploadedBy: userId,
                  workspace: workspaceId,
                  serviceKey: reportData.serviceKey,
                  timestamp: new Date().toISOString(),
                },
              },
            });
            
            await new Promise<void>((resolve, reject) => {
              blobStream.on('error', reject);
              blobStream.on('finish', resolve);
              blobStream.end((req.file!.buffer));
            });
            
            // Store canonical object path for access-controlled retrieval via ObjectStorageService
            screenshotUrl = `/objects/${entityId}`;
            screenshotKey = entityId;
            
            log.info(`Screenshot uploaded successfully: ${screenshotUrl}`);
          }
        } catch (uploadError: unknown) {
          log.error('Failed to upload screenshot:', uploadError);
          // Continue without screenshot - don't fail the entire incident report
        }
      }

      // Create incident report in database
      // Cast serviceKey to database enum type - validated by zod schema above
      const dbServiceKey = reportData.serviceKey as 'database' | 'chat_websocket' | 'gemini_ai' | 'object_storage' | 'stripe' | 'email';
      const incident = await storage.createServiceIncidentReport({
        workspaceId,
        userId,
        serviceKey: dbServiceKey,
        errorType: reportData.errorType,
        isCriticalService,
        userMessage: reportData.userMessage,
        errorMessage: reportData.errorMessage,
        stackTrace: reportData.stackTrace,
        metadata: reportData.metadata || {},
        screenshotUrl,
        screenshotKey,
        status: 'submitted',
      });

      // Auto-create support ticket for critical services
      if (isCriticalService) {
        try {
          const ticketNumber = `TKT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
          const supportTicket = await storage.createSupportTicket({
            workspaceId,
            ticketNumber,
            type: 'support',
            subject: `[CRITICAL] ${reportData.serviceKey} failure - ${reportData.errorType}`,
            description: `Auto-generated from incident report:\n\nService: ${reportData.serviceKey}\nError: ${reportData.errorMessage}\n\nUser Message: ${reportData.userMessage}\n\nIncident ID: ${incident.id}`,
            priority: 'high',
            status: 'open',
          });
          log.info(`[AUTO-TICKET] Support ticket created: ${supportTicket.id} for incident ${incident.id}`);
        } catch (ticketError: unknown) {
          log.error(`[AUTO-TICKET] Failed to create support ticket:`, ticketError);
          // Don't fail the incident report if ticket creation fails
        }
      }

      res.status(201).json({
        success: true,
        incidentId: incident.id,
        message: 'Incident report submitted successfully',
      });
    } catch (error: unknown) {
      log.error('Error creating service incident report:', error);
      res.status(500).json({ error: 'Failed to submit incident report' });
    }
  }
);

// Export the root router with all sub-routers mounted
const router = Router();
router.use(rootRouter); // Mount /health
router.use('/api/health', apiHealthRouter); // Mount /api/health/*
router.use('/api/workspace', workspaceRouter); // Mount /api/workspace/*
router.use('/api/integrations', integrationsHealthRouter); // Mount /api/integrations/health
router.use('/api/support', supportRouter); // Mount /api/support/*

export default router;

// ============================================================================
// LEGACY EXPORT (for backward compatibility with registerHealthRoutes)
// ============================================================================
export function registerHealthRoutes(app: any, requireAuth: any) {
  // Mount the router at root level
  app.use(router);
}
