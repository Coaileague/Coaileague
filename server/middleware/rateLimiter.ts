import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { RATE_LIMITS } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
const log = createLogger('rateLimiter');

/**
 * Trusted IP extraction for rate limiting.
 *
 * Uses req.ip which Express populates from the trusted portion of X-Forwarded-For
 * based on app.set('trust proxy', 1) in index.ts. This prevents IP spoofing via
 * client-controlled X-Forwarded-For headers — only the proxy-verified leftmost IP
 * outside the trusted proxy chain is used.
 *
 * We deliberately do NOT parse X-Forwarded-For directly here, as raw header values
 * are client-controlled and would allow attackers to bypass rate limiting.
 *
 * Infrastructure note: CoAIleague is deployed on Replit which runs a single
 * reverse-proxy in front of the app origin. Direct connections to the origin are
 * not possible in this deployment topology, so 'trust proxy: 1' is the correct
 * and safe configuration. If the deployment topology ever changes (e.g. multi-hop
 * CDN in front of the app), update app.set('trust proxy', N) accordingly.
 */
function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Rate Limit Violation Logger
 *
 * Logs every 429 response. On repeat violations (3+ in 10 minutes from same IP),
 * fires an admin-level alert via platform event bus.
 *
 * G24-04 fix: Rate limit violations logged and admin alerted on repeat violations.
 */
const violationLog = new Map<string, { count: number; windowStart: number }>();
const VIOLATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const VIOLATION_ALERT_THRESHOLD = 3;

// Evict stale entries every 30 minutes to prevent unbounded Map growth.
// Module-level interval intentionally uncleaned — lives for process lifetime.
setInterval(() => {
  const cutoff = Date.now() - VIOLATION_WINDOW_MS;
  for (const [key, entry] of violationLog) {
    if (entry.windowStart < cutoff) violationLog.delete(key);
  }
}, 30 * 60 * 1000).unref();

function logRateLimitViolation(req: Request, limitType: string): void {
  const ip = getClientIp(req);
  const key = `${ip}:${limitType}`;
  const now = Date.now();

  const entry = violationLog.get(key);
  if (!entry || now - entry.windowStart > VIOLATION_WINDOW_MS) {
    violationLog.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
    if (entry.count >= VIOLATION_ALERT_THRESHOLD) {
      log.warn(`[RateLimiter] REPEAT_VIOLATION: ip=${ip} limiter=${limitType} count=${entry.count} in ${VIOLATION_WINDOW_MS / 60000} min — admin alert fired`);
      // Fire admin alert via platform event bus (non-blocking — dynamic import avoids circular deps + ESM compat)
      scheduleNonBlocking('rate-limiter.violation-alert', async () => {
        const { platformEventBus } = await import('../services/platformEventBus');
        platformEventBus.publish('rate_limit_violation', {
          ip,
          limitType,
          count: entry.count,
          windowMs: VIOLATION_WINDOW_MS,
          path: req.path,
          userAgent: req.headers['user-agent'],
        });
      });
    }
  }
}

/**
 * Helper to set Retry-After HTTP header (G24-02 fix).
 * express-rate-limit v8 sets RateLimit-* draft-6 headers via standardHeaders: true,
 * but does NOT set the legacy Retry-After header automatically. This helper
 * ensures all 429 responses include the standard Retry-After header.
 */
function setRetryAfterHeader(res: Response, retryAfterSeconds: number): void {
  res.setHeader('Retry-After', String(retryAfterSeconds));
}

/**
 * Rate Limiting Middleware for API Protection
 *
 * Implements rate limiting to protect against:
 * - API abuse and DDoS attacks
 * - Brute force authentication attempts
 * - Resource exhaustion
 *
 * Note: Current implementation is IP-based only. For full SOC2 compliance,
 * per-workspace/user rate limiting should be added (requires Redis or similar).
 */

// General API rate limiter - applies to all API routes
// Higher threshold to accommodate shared NAT/proxy environments
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.general.windowMs,
  max: RATE_LIMITS.general.max,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),

  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 900);
    logRateLimitViolation(req, 'api_general');
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Stricter rate limiter for authentication endpoints
// SECURITY: 5 attempts per 15-minute window per IP — prevents brute force.
export const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.auth.windowMs,
  max: RATE_LIMITS.auth.max,
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => getClientIp(req),

  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 900);
    logRateLimitViolation(req, 'auth');
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Your account has been temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

// Moderate rate limiter for mutation operations (create/update/delete)
export const mutationLimiter = rateLimit({
  windowMs: RATE_LIMITS.mutation.windowMs,
  max: RATE_LIMITS.mutation.max,
  message: {
    error: 'Too many operations from this IP, please slow down.',
    retryAfter: '1 minute'
  },
  keyGenerator: (req: Request) => getClientIp(req),

  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    logRateLimitViolation(req, 'mutation');
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are performing operations too quickly. Please wait a moment and try again.',
      retryAfter: '1 minute'
    });
  }
});

// Lenient rate limiter for read operations
export const readLimiter = rateLimit({
  windowMs: RATE_LIMITS.read.windowMs,
  max: RATE_LIMITS.read.max,
  message: {
    error: 'Too many requests from this IP, please slow down.',
    retryAfter: '1 minute'
  },
  keyGenerator: (req: Request) => getClientIp(req),

  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many read requests. Please slow down.',
      retryAfter: '1 minute'
    });
  }
});

// Password reset rate limiter - prevent brute force and email flooding
// SECURITY: Very strict to prevent reset token enumeration and email spam
export const passwordResetLimiter = rateLimit({
  windowMs: RATE_LIMITS.passwordReset.windowMs,
  max: RATE_LIMITS.passwordReset.max,
  message: {
    error: 'Too many password reset requests. Please try again later.',
    retryAfter: '1 hour'
  },
  keyGenerator: (req: Request) => {
    const email = req.body?.email?.toLowerCase() || '';
    const ip = getClientIp(req);
    return `${ip}-${email}`;
  },

  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 3600);
    logRateLimitViolation(req, 'password_reset');
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many password reset requests. For security reasons, please wait before trying again.',
      retryAfter: '1 hour'
    });
  }
});

/**
 * Signup / Trial-Start Rate Limiter
 * OMEGA-L1: Prevents automated account farming on the trial workspace provisioning endpoint.
 * 3 workspace creations per hour per IP. Keyed by IP only (no auth context available yet
 * for unauthenticated provisioning paths; auth-protected paths benefit from dual key).
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 3600);
    logRateLimitViolation(req, 'signup');
    res.status(429).json({
      error: 'Signup rate limit exceeded',
      message: 'Too many workspace creation attempts from this IP. Please try again in an hour.',
      retryAfter: '1 hour',
      limit: 3,
      window: '1 hour',
    });
  }
});

/**
 * Chat-Specific Rate Limiters
 * Implements tiered protection for chat/messaging features
 */

// Chat message rate limiter - 30 messages per minute per user
export const chatMessageLimiter = rateLimit({
  windowMs: RATE_LIMITS.chatMessages.windowMs,
  max: RATE_LIMITS.chatMessages.max,
  message: {
    error: 'Too many messages sent',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    if (req.user?.id) return req.user.id;
    return getClientIp(req);
  },

  skipFailedRequests: false,
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are sending messages too quickly. Please slow down.',
      retryAfter: '1 minute',
      limit: 30,
      window: '1 minute'
    });
  }
});

// Chat file upload limiter - 5 uploads per hour per user
export const chatUploadLimiter = rateLimit({
  windowMs: RATE_LIMITS.chatUploads.windowMs,
  max: RATE_LIMITS.chatUploads.max,
  message: {
    error: 'Too many file uploads',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    if (req.user?.id) return req.user.id;
    return getClientIp(req);
  },

  skipFailedRequests: false,
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 3600);
    res.status(429).json({
      error: 'Upload limit exceeded',
      message: 'You have reached the maximum number of file uploads per hour (5). Please try again later.',
      retryAfter: '1 hour',
      limit: 5,
      window: '1 hour'
    });
  }
});

// Public form rate limiter — applies to public job board / onboarding form submissions
// SECURITY: 3 submissions per 60 seconds per IP to block automated form spam
export const publicFormLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: {
    error: 'Too many submissions',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),

  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    logRateLimitViolation(req, 'public_form');
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many form submissions from this IP. Please wait before trying again.',
      retryAfter: '1 minute',
      limit: 3,
      window: '1 minute'
    });
  }
});

// Chat conversation creation limiter - prevent spam
export const chatConversationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 conversations per 15 minutes
  message: {
    error: 'Too many chat conversations created',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    if (req.user?.id) return req.user.id;
    return getClientIp(req);
  },

  skipFailedRequests: false,
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 900);
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are creating chat conversations too frequently. Please slow down.',
      retryAfter: '15 minutes',
      limit: 10,
      window: '15 minutes'
    });
  }
});

/**
 * Financial Endpoint Rate Limiter
 * G24-05 fix: Dedicated limiter for payroll, billing, invoice, and financial mutation endpoints.
 * 30 requests per minute per workspace (keyed by workspaceId + IP composite).
 * Covers: /api/payroll, /api/invoices, /api/billing, /api/expenses, /api/payments
 */
export const financialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const workspaceId = (req as any).workspaceId || (req as any).user?.workspaceId || 'unknown';
    return `${workspaceId}:${getClientIp(req)}`;
  },
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    logRateLimitViolation(req, 'financial');
    res.status(429).json({
      error: 'Financial rate limit exceeded',
      message: 'Too many financial operations. Please wait before making additional requests.',
      retryAfter: '1 minute',
      limit: 30,
      window: '1 minute'
    });
  }
});

/**
 * Export/Bulk Data Rate Limiter
 * G24-05 fix: Prevents bulk data scraping via CSV/PDF export endpoints.
 * 10 exports per 10 minutes per workspace.
 * Covers: /api/[any]/export, /api/[any]/csv, /api/[any]/pdf, /api/reports
 */
export const exportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const workspaceId = (req as any).workspaceId || (req as any).user?.workspaceId || 'unknown';
    return `${workspaceId}:${getClientIp(req)}`;
  },
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 600);
    logRateLimitViolation(req, 'export');
    res.status(429).json({
      error: 'Export rate limit exceeded',
      message: 'You have exported too many reports in a short period. Please wait 10 minutes before exporting again.',
      retryAfter: '10 minutes',
      limit: 10,
      window: '10 minutes'
    });
  }
});

/**
 * Portal Token Rate Limiter
 * G24-05 fix: Moderate limits for client/officer portal endpoints per token.
 * 60 requests per minute per portal token.
 * Covers: /api/portal/*, /api/client-portal/*, /api/officer-portal/*
 */
export const portalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query?.token || getClientIp(req);
    return String(token).slice(0, 32); // Use first 32 chars of token as key
  },
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    logRateLimitViolation(req, 'portal');
    res.status(429).json({
      error: 'Portal rate limit exceeded',
      message: 'Too many portal requests. Please slow down.',
      retryAfter: '1 minute',
      limit: 60,
      window: '1 minute'
    });
  }
});

/**
 * Per-Workspace Trinity Action Velocity Limiter
 * OMEGA-L7: Token DDoS Guard — directive §XIV.E
 *
 * Limits inbound Trinity Triad triggers to MAX_ACTIONS_PER_MINUTE per workspace
 * per rolling 60-second window. Uses an in-memory sliding-window counter keyed
 * by workspaceId. Safe for single-node Replit deployment; replace Map with Redis
 * when horizontal scaling is required.
 *
 * Bursts exceeding the limit are rejected with 429. The caller should retry after
 * the window resets (indicated by Retry-After header). No concurrent draining of
 * the AI credit ledger occurs because excess requests never reach the Triad gateway.
 */
const TRINITY_VELOCITY_WINDOW_MS = 60 * 1000; // 1 minute
const TRINITY_MAX_ACTIONS_PER_WINDOW = 50;

// Authenticated routes limiter: 200 requests per minute
export const authenticatedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as any).user?.id || getClientIp(req),
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    logRateLimitViolation(req, 'authenticated');
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit for authenticated users. Please try again later.',
      retryAfter: '1 minute'
    });
  }
});

// Public routes limiter: 20/min (covered by apiLimiter if configured correctly, but we ensure it here)
export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 60);
    logRateLimitViolation(req, 'public_api');
    res.status(429).json({
      error: 'Too many requests',
      message: 'Public API rate limit exceeded. Please try again later.',
      retryAfter: '1 minute'
    });
  }
});

interface VelocityEntry {
  count: number;
  windowStart: number;
}

const trinityVelocityMap = new Map<string, VelocityEntry>();

// Evict stale entries every 2 minutes to prevent unbounded growth.
setInterval(() => {
  const cutoff = Date.now() - TRINITY_VELOCITY_WINDOW_MS;
  for (const [key, entry] of trinityVelocityMap) {
    if (entry.windowStart < cutoff) trinityVelocityMap.delete(key);
  }
}, 2 * 60 * 1000).unref();

/**
 * Express middleware that enforces per-workspace Trinity velocity limiting.
 * Must be applied to all Trinity Triad trigger endpoints (email ingest,
 * voice trigger, action dispatch, etc.).
 */
export function workspaceTrinityLimiter(req: Request, res: Response, next: Function): void {
  const workspaceId =
    (req as any).workspaceId ||
    (req as any).user?.workspaceId ||
    (req as any).user?.currentWorkspaceId ||
    req.headers['x-workspace-id'] as string;

  if (!workspaceId) {
    // No workspace context — let downstream auth handle it
    next();
    return;
  }

  const now = Date.now();
  const entry = trinityVelocityMap.get(workspaceId);

  if (!entry || now - entry.windowStart >= TRINITY_VELOCITY_WINDOW_MS) {
    // New window
    trinityVelocityMap.set(workspaceId, { count: 1, windowStart: now });
    next();
    return;
  }

  entry.count += 1;

  if (entry.count > TRINITY_MAX_ACTIONS_PER_WINDOW) {
    const retryAfterMs = TRINITY_VELOCITY_WINDOW_MS - (now - entry.windowStart);
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);

    log.warn(`[TrinityVelocity] Workspace ${workspaceId} burst limit exceeded: ${entry.count}/${TRINITY_MAX_ACTIONS_PER_WINDOW} actions in window`);

    logRateLimitViolation(req, 'trinity_velocity');

    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: 'Trinity velocity limit exceeded',
      message: `Your workspace has exceeded ${TRINITY_MAX_ACTIONS_PER_WINDOW} Trinity actions per minute. Retry after ${retryAfterSec} seconds.`,
      retryAfter: retryAfterSec,
      limit: TRINITY_MAX_ACTIONS_PER_WINDOW,
      window: '1 minute',
      code: 'TRINITY_VELOCITY_EXCEEDED',
    });
    return;
  }

  next();
}

/**
 * Clock-in PIN verify rate limiter — prevents brute force of 4-8 digit kiosk PINs.
 *
 * SECURITY: PIN space is 10,000–100,000,000 combinations (4–8 digits).
 * A 4-digit PIN is guessable in seconds without this guard.
 * Key combines IP + employeeId so that per-employee lockouts are granular
 * and rotating to a different employee target doesn't reset the counter.
 *
 * Limits: 10 failed attempts per 15 minutes per IP+employee combination.
 * Successful verifications are NOT skipped (skipSuccessfulRequests: false) so
 * an attacker who gets lucky on attempt 7 still consumes the remaining budget.
 */
export const pinVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = getClientIp(req);
    const employeeId = (req.params?.employeeId || req.body?.employeeNumber || '').slice(0, 64);
    return `pin-verify:${ip}:${employeeId}`;
  },
  handler: (req: Request, res: Response) => {
    setRetryAfterHeader(res, 900);
    logRateLimitViolation(req, 'pin_verify');
    res.status(429).json({
      error: 'Too many PIN verification attempts',
      message: 'This account has been temporarily locked due to too many failed PIN attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
      valid: false,
    });
  },
});
