/**
 * Request Timeout Middleware
 * Kills hung requests before they exhaust server resources.
 * Standard routes: 20s. AI routes: 90s. Webhook routes: 10s.
 */
import { Request, Response, NextFunction } from 'express';

const AI_ROUTE_PREFIXES = ['/api/trinity', '/api/ai-brain', '/api/ai-orchestra', '/api/insights'];
const LONG_RUNNING_ROUTE_PREFIXES = [
  '/api/automation/invoice/anchor-close',
  '/api/automation/payroll/anchor-close',
];
const WEBHOOK_ROUTE_PREFIXES = ['/api/stripe/webhook', '/api/webhooks'];
const EXEMPT_PREFIXES = ['/health', '/api/csrf-token'];

function getTimeoutMs(path: string): number {
  if (EXEMPT_PREFIXES.some(p => path.startsWith(p))) return 0;
  if (WEBHOOK_ROUTE_PREFIXES.some(p => path.startsWith(p))) return 10_000;
  if (AI_ROUTE_PREFIXES.some(p => path.startsWith(p))) return 90_000;
  if (LONG_RUNNING_ROUTE_PREFIXES.some(p => path.startsWith(p))) return 90_000;
  return 20_000;
}

export function requestTimeout(req: Request, res: Response, next: NextFunction): void {
  const ms = getTimeoutMs(req.path);
  if (ms === 0) { next(); return; }

  const timer = setTimeout(() => {
    if (res.headersSent) return;
    const err: any = new Error(`Request timed out after ${ms}ms`);
    err.code = 'REQUEST_TIMEOUT';
    err.status = 408;
    next(err);
  }, ms);

  // Clean up timer when response finishes
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));

  next();
}
