/**
 * Global API Error Handler — Fortune-500 grade normalized error responses
 * Maps known error types to correct HTTP codes, strips stack traces in production.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../lib/logger';
import { monitoringService } from '../monitoring';

const log = createLogger('ErrorHandler');

/**
 * M14 — Production error message sanitizer.
 *
 * Route-level catch blocks frequently do `res.json({ error: error.message })` which
 * can leak internal implementation details (DB query text, file paths, service names)
 * in production. Use this helper in any catch block that surfaces an error to the client.
 *
 * Usage:
 *   res.status(500).json({ error: sanitizeError(error) });
 *
 * In production:  always returns the generic fallback string.
 * In development: returns the real error.message for debugging.
 */
export function sanitizeError(error: unknown, fallback = 'An unexpected error occurred'): string {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;
  if (isProduction) return fallback;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

function buildErrorResponse(req: Request, status: number, message: string, code: string, details?: unknown) {
  return {
    error: {
      code,
      message,
    },
    requestId: req.requestId || 'unknown',
    workspaceId: req.workspaceId,
    timestamp: new Date().toISOString(),
    ...(details !== undefined && { details }),
  };
}

export function globalErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  // Match sanitizeError: also treat Replit deployments as production
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

  // --- Zod validation errors ---
  if (err instanceof ZodError) {
    const issues = err.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
    res.status(400).json(buildErrorResponse(req, 400, 'Validation failed', 'VALIDATION_ERROR', issues));
    return;
  }

  // --- Workspace isolation errors ---
  if (err.name === 'WorkspaceNotFoundError') {
    res.status(404).json(buildErrorResponse(req, 404, err.message, 'WORKSPACE_NOT_FOUND'));
    return;
  }
  if (err.name === 'WorkspaceInactiveError') {
    res.status(403).json(buildErrorResponse(req, 403, err.message, 'WORKSPACE_INACTIVE'));
    return;
  }
  if (err.name === 'OrgIsolationError') {
    res.status(403).json(buildErrorResponse(req, 403, err.message, 'ORG_ISOLATION_VIOLATION'));
    return;
  }

  // --- Timeout ---
  if (err.code === 'REQUEST_TIMEOUT' || err.status === 408) {
    res.status(408).json(buildErrorResponse(req, 408, 'Request timed out', 'REQUEST_TIMEOUT'));
    return;
  }

  // --- Concurrent operation conflict ---
  if (err.code === 'WORKSPACE_LOCKED' || err.status === 409) {
    res.status(409).json(buildErrorResponse(req, 409, err.message || 'Concurrent operation in progress', 'CONCURRENT_OPERATION'));
    return;
  }

  // --- AI / credit rate limits ---
  if (err.status === 429 || err.code === 'RATE_LIMITED' || err.code === 'ORG_AI_LIMIT_EXCEEDED') {
    res.status(429).json(buildErrorResponse(req, 429, err.message || 'Too many concurrent requests', 'RATE_LIMITED'));
    return;
  }

  // --- Database constraint errors ---
  if (err.message?.includes('[CircuitBreaker] DB')) {
    res.status(503).json(buildErrorResponse(req, 503, 'Database is temporarily unavailable', 'DATABASE_CIRCUIT_OPEN'));
    return;
  }

  if ((err as any).constraint || (err as any).code?.startsWith('23')) {
    log.warn('DB constraint violation', { path: req.path, code: (err as any).code, constraint: (err as any).constraint, requestId: req.requestId });
    res.status(409).json(buildErrorResponse(req, 409, 'Data conflict — operation would violate a data constraint', 'DB_CONSTRAINT'));
    return;
  }

  // --- Generic ---
  const status = err.statusCode || err.status || 500;
  const clientMessage = status < 500
    ? (err.message || 'Request error')
    : isProd ? 'Internal server error' : (err.message || 'Internal server error');

  const logCtx: Record<string, unknown> = {
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    workspaceId: req.workspaceId,
    severity: (status >= 500 || err.name === 'OrgIsolationError' || err.code === 'SECURITY_VIOLATION') ? 'critical' : (status >= 400 ? 'error' : 'warn'),
  };
  if (!isProd) logCtx.stack = err.stack;

  monitoringService.logError(err, {
    userId: (req as any).user?.id || (req as any).user?.userId,
    workspaceId: req.workspaceId,
    requestId: req.requestId,
    severity: logCtx.severity as any,
    additionalData: logCtx,
  });

  res.status(status).json(
    buildErrorResponse(req, status, clientMessage, err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'))
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(buildErrorResponse(req, 404, `Route not found: ${req.method} ${req.path}`, 'NOT_FOUND'));
}
