/**
 * CSRF (Cross-Site Request Forgery) Protection Middleware
 * ========================================================
 *
 * Implements the Synchronizer Token Pattern for CSRF protection.
 *
 * Security Features:
 * - Cryptographically secure token generation
 * - Session-bound tokens (tokens are tied to user sessions)
 * - Automatic token rotation on generation
 * - Protection for all state-changing HTTP methods (POST, PUT, PATCH, DELETE)
 * - Exemptions for webhooks and API key authenticated routes
 *
 * Usage:
 * 1. Apply csrfProtection middleware to routes that need protection
 * 2. Frontend must include X-CSRF-Token header with the token from /api/csrf-token
 * 3. Webhooks and API key routes are automatically exempted
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import '../types'; // Import session type extensions

// CSRF token configuration
const CSRF_TOKEN_LENGTH = 32; // 256 bits
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = '_csrf';
const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Session type extension is in server/types.ts

// Routes that are exempt from CSRF protection (webhooks, external integrations)
const CSRF_EXEMPT_PATHS: RegExp[] = [
  // Webhook endpoints - these use their own signature verification
  // Include both /api/... and /... versions since middleware mounted at /api strips prefix
  /^\/api\/webhooks\//,
  /^\/webhooks\//,
  /^\/api\/stripe\/webhook$/,
  /^\/stripe\/webhook$/,
  /^\/api\/billing\/webhooks\/stripe$/,
  /^\/billing\/webhooks\/stripe$/,

  // Health check endpoints
  /^\/health$/,
  /^\/api\/health$/,

  // WebSocket token — called by browser with session cookie, not CSRF-vulnerable
  // because it only issues a short-lived WS auth token and requires valid session
  /^\/api\/auth\/ws-token$/,
  /^\/auth\/ws-token$/,

  // Public authentication endpoints (login/register don't have session yet)
  // Support both /api/auth/* and /auth/* patterns (some routes may strip /api prefix)
  /^\/api\/auth\/login$/,
  /^\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/auth\/register$/,

  /^\/api\/auth\/forgot-password$/,
  /^\/auth\/forgot-password$/,
  /^\/api\/auth\/reset-password$/,
  /^\/auth\/reset-password$/,
  /^\/api\/auth\/reset-password-request$/,
  /^\/auth\/reset-password-request$/,
  /^\/api\/auth\/reset-password-confirm$/,
  /^\/auth\/reset-password-confirm$/,
  /^\/api\/auth\/resend-verification$/,
  /^\/auth\/resend-verification$/,
  /^\/api\/auth\/verify-email$/,
  /^\/auth\/verify-email$/,

  // OAuth callback endpoints (all OAuth flows)
  /^\/api\/oauth\//,
  /^\/oauth\//,
  /^\/api\/auth\/callback/,
  /^\/auth\/callback/,
  /^\/api\/login\/callback/,
  /^\/login\/callback/,

  // QuickBooks integration endpoints
  /^\/api\/quickbooks\//,
  /^\/quickbooks\//,
  /^\/api\/webhooks\/quickbooks/,
  
  // QuickBooks via /api/integrations path (preflight, refresh, status, etc.)
  /^\/api\/integrations\/quickbooks\//,

  // HRIS OAuth callbacks
  /^\/api\/hris\/callback\//,
  /^\/hris\/callback\//,
  /^\/api\/hris\/connect\//,

  // Calendar OAuth callbacks
  /^\/api\/calendar\/google\/callback/,
  /^\/calendar\/google\/callback/,

  // Integration management endpoints
  /^\/api\/integrations\/.*\/connect$/,
  /^\/api\/integrations\/.*\/renew$/,
  /^\/api\/integrations\/.*\/callback$/,
  /^\/integrations\/.*\/connect$/,
  /^\/integrations\/.*\/renew$/,

  // Gusto integration
  /^\/api\/gusto\//,
  /^\/gusto\//,

  // Trinity staffing public webhook
  /^\/api\/trinity-staffing\/public\/webhook$/,

  // Trinity Voice IVR — Twilio webhook callbacks (validated by Twilio HMAC, not CSRF)
  // Note: CSRF middleware is mounted at /api so req.path has /api stripped.
  // Include both /api/voice/* and /voice/* patterns to handle all mount scenarios.
  /^\/api\/voice\/inbound$/,
  /^\/voice\/inbound$/,
  /^\/api\/voice\/language-select$/,
  /^\/voice\/language-select$/,
  /^\/api\/voice\/main-menu-route$/,
  /^\/voice\/main-menu-route$/,
  /^\/api\/voice\/staff-menu$/,
  /^\/voice\/staff-menu$/,
  /^\/api\/voice\/clock-in-pin$/,
  /^\/voice\/clock-in-pin$/,
  /^\/api\/voice\/clock-in-verify$/,
  /^\/voice\/clock-in-verify$/,
  /^\/api\/voice\/recording-done$/,
  /^\/voice\/recording-done$/,
  /^\/api\/voice\/transcription-done$/,
  /^\/voice\/transcription-done$/,
  /^\/api\/voice\/status-callback$/,
  /^\/voice\/status-callback$/,
  /^\/api\/voice\/support-resolve$/,
  /^\/voice\/support-resolve$/,
  /^\/api\/voice\/support-confirm$/,
  /^\/voice\/support-confirm$/,
  /^\/api\/voice\/support-gather-name$/,
  /^\/voice\/support-gather-name$/,
  /^\/api\/voice\/support-create-case$/,
  /^\/voice\/support-create-case$/,
  /^\/api\/voice\/case-check$/,
  /^\/voice\/case-check$/,
  /^\/api\/voice\/agent-clear$/,
  /^\/voice\/agent-clear$/,

  // Regulatory Auditor Portal — public lookup, credential submission, dashboard (token-auth)
  /^\/api\/compliance\/regulatory-portal\/lookup$/,
  /^\/compliance\/regulatory-portal\/lookup$/,
  /^\/api\/compliance\/regulatory-portal\/request(\/[^/]+)*(\/dispute)?$/,
  /^\/compliance\/regulatory-portal\/request(\/[^/]+)*(\/dispute)?$/,
  /^\/api\/compliance\/regulatory-portal\/dashboard\//,
  /^\/compliance\/regulatory-portal\/dashboard\//,

  // Trinity internal scheduling (server-side test runs)
  /^\/api\/trinity\/scheduling\/auto-fill-internal$/,
  /^\/trinity\/scheduling\/auto-fill-internal$/,

  // Inbound email webhooks (Resend) - ALL Resend webhook paths
  // Include both /api/... and /... versions since middleware mounted at /api strips prefix
  /^\/api\/webhooks\/resend/,
  /^\/webhooks\/resend/,
  /^\/api\/webhooks\/inbound-email$/,
  /^\/webhooks\/inbound-email$/,
  /^\/api\/inbound-email$/,
  /^\/inbound-email$/,
  // Inbound email Resend webhook — root and all sub-paths
  /^\/api\/inbound\/email$/,
  /^\/inbound\/email$/,
  /^\/api\/inbound\/email\//,
  /^\/inbound\/email\//,

  // CSRF token endpoint itself
  /^\/api\/csrf-token$/,
  /^\/csrf-token$/,

  // Sandbox development endpoints (dev bypass auth)
  /^\/api\/sandbox\//,
  /^\/sandbox\//,

  // Public employee onboarding wizard (unauthenticated candidate flow)
  /^\/api\/onboarding\/application$/,
  /^\/api\/onboarding\/application\//,
  /^\/onboarding\/application$/,
  /^\/onboarding\/application\//,
  /^\/api\/onboarding\/invite\/[^/]+\/opened$/,
  /^\/onboarding\/invite\/[^/]+\/opened$/,
  /^\/api\/onboarding\/contracts\/[^/]+\/sign$/,
  /^\/onboarding\/contracts\/[^/]+\/sign$/,
  /^\/api\/onboarding\/submit\//,
  /^\/onboarding\/submit\//,
  /^\/api\/onboarding\/signatures$/,
  /^\/onboarding\/signatures$/,
  /^\/api\/onboarding\/certifications$/,
  /^\/onboarding\/certifications$/,

  // Mega Phase: Platform forms public submission (token-based, no session)
  /^\/api\/forms\/public\//,
  /^\/forms\/public\//,
  // Public signing (eSignature) — token-based, no session
  /^\/api\/forms\/sign\//,
  /^\/forms\/sign\//,
  // Online proposals — public client accept/decline (token-based)
  /^\/api\/forms\/proposals\/public\//,
  /^\/forms\/proposals\/public\//,

  // Mega Phase: Interview chatroom candidate endpoints (token-based, no session)
  /^\/api\/interview\/room\//,
  /^\/interview\/room\//,

  // Mega Phase: Onboarding pipeline public self-service (token-based)
  /^\/api\/onboarding-pipeline\/public\//,
  /^\/onboarding-pipeline\/public\//,

  // Workspace invite accept flow — new user has no CSRF token in session yet
  /^\/api\/onboarding\/workspace-invite\/register$/,
  /^\/onboarding\/workspace-invite\/register$/,
  /^\/api\/onboarding\/workspace-invite\/accept-existing$/,
  /^\/onboarding\/workspace-invite\/accept-existing$/,
  /^\/api\/onboarding\/workspace-invite\/[^/]+$/, // GET invite lookup
  /^\/onboarding\/workspace-invite\/[^/]+$/,
];

// Headers that indicate API key or service-to-service authentication
const API_AUTH_HEADERS = [
  'x-api-key',
  'x-service-key',
  'authorization', // Bearer tokens for API access
];

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Check if a route is exempt from CSRF protection
 */
function isExemptRoute(path: string): boolean {
  return CSRF_EXEMPT_PATHS.some(pattern => pattern.test(path));
}

/**
 * Check if request uses API key authentication (exempt from CSRF)
 * API key authenticated requests are typically from external services
 * or programmatic access, not browser-based
 */
function isApiKeyAuthenticated(req: Request): boolean {
  // Check for API key headers
  for (const header of API_AUTH_HEADERS) {
    const value = req.get(header);
    if (value) {
      // For Authorization header, only exempt Bearer tokens (not session-based)
      if (header === 'authorization') {
        // Bearer tokens indicate programmatic API access, exempt from CSRF
        if (value.toLowerCase().startsWith('bearer ')) {
          return true;
        }
        // Other auth schemes continue to CSRF check
        continue;
      }
      return true;
    }
  }

  // Check for test mode (crawler access)
  const testKey = req.get('x-test-key');
  if (testKey) {
    return true;
  }

  return false;
}

/**
 * Check if the request method requires CSRF validation
 */
function isStateChangingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

/**
 * Validate the CSRF token from the request
 */
function validateCsrfToken(req: Request): { valid: boolean; reason?: string } {
  // Get session token
  const sessionToken = req.session?.csrfToken;
  const tokenCreatedAt = req.session?.csrfTokenCreatedAt;

  if (!sessionToken) {
    return { valid: false, reason: 'No CSRF token in session' };
  }

  // Check token expiry
  if (tokenCreatedAt && Date.now() - tokenCreatedAt > CSRF_TOKEN_EXPIRY_MS) {
    return { valid: false, reason: 'CSRF token expired' };
  }

  // Get token from request header
  const requestToken = req.get(CSRF_HEADER_NAME);

  if (!requestToken) {
    return { valid: false, reason: 'No CSRF token in request header' };
  }

  // Timing-safe comparison to prevent timing attacks
  try {
    const sessionBuffer = Buffer.from(sessionToken);
    const requestBuffer = Buffer.from(requestToken);

    if (sessionBuffer.length !== requestBuffer.length) {
      return { valid: false, reason: 'CSRF token length mismatch' };
    }

    if (!crypto.timingSafeEqual(sessionBuffer, requestBuffer)) {
      return { valid: false, reason: 'CSRF token mismatch' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'CSRF token validation error' };
  }
}

/**
 * CSRF Protection Middleware
 *
 * Validates CSRF tokens for state-changing requests.
 * Automatically exempts webhooks and API key authenticated routes.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip non-state-changing methods (GET, HEAD, OPTIONS)
  if (!isStateChangingMethod(req.method)) {
    return next();
  }

  // Skip exempt routes (webhooks, auth endpoints)
  if (isExemptRoute(req.path)) {
    return next();
  }

  // Skip API key authenticated requests
  if (isApiKeyAuthenticated(req)) {
    return next();
  }

  // Skip if no session (unauthenticated requests will be rejected by auth middleware)
  if (!req.session) {
    return next();
  }

  // Validate CSRF token
  const validation = validateCsrfToken(req);

  if (!validation.valid) {
    res.status(403).json({
      error: 'CSRF validation failed',
      message: 'Your session may have expired. Please refresh the page and try again.',
      code: 'CSRF_TOKEN_INVALID',
    });
    return;
  }

  next();
}

/**
 * Middleware to ensure a CSRF token exists in the session
 * Should be applied after session middleware
 */
export function ensureCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
    req.session.csrfTokenCreatedAt = Date.now();
  }
  next();
}

/**
 * Get or create CSRF token for the current session
 */
export function getCsrfToken(req: Request): string | null {
  if (!req.session) {
    return null;
  }

  // Generate new token if none exists or if expired
  const tokenCreatedAt = req.session.csrfTokenCreatedAt;
  const isExpired = tokenCreatedAt && Date.now() - tokenCreatedAt > CSRF_TOKEN_EXPIRY_MS;

  if (!req.session.csrfToken || isExpired) {
    req.session.csrfToken = generateCsrfToken();
    req.session.csrfTokenCreatedAt = Date.now();
  }

  return req.session.csrfToken;
}

/**
 * Rotate CSRF token (call after sensitive operations)
 */
export function rotateCsrfToken(req: Request): string | null {
  if (!req.session) {
    return null;
  }

  req.session.csrfToken = generateCsrfToken();
  req.session.csrfTokenCreatedAt = Date.now();

  return req.session.csrfToken;
}

/**
 * Express route handler for getting the CSRF token
 * Frontend should call this endpoint to get the token
 */
export function csrfTokenHandler(req: Request, res: Response): void {
  const token = getCsrfToken(req);

  if (!token) {
    res.status(401).json({
      error: 'Session required',
      message: 'Please login to get a CSRF token',
    });
    return;
  }

  // Set cookie as backup for form submissions
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Accessible to JavaScript for header inclusion
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY_MS,
  });

  res.json({
    token,
    expiresIn: CSRF_TOKEN_EXPIRY_MS,
    header: CSRF_HEADER_NAME,
  });
}

/**
 * Create CSRF protection middleware with custom options
 */
export function createCsrfProtection(options?: {
  exemptPaths?: RegExp[];
  tokenHeader?: string;
  cookieName?: string;
}) {
  const exemptPaths = options?.exemptPaths || CSRF_EXEMPT_PATHS;
  const tokenHeader = options?.tokenHeader || CSRF_HEADER_NAME;

  return function customCsrfProtection(req: Request, res: Response, next: NextFunction): void {
    // Skip non-state-changing methods
    if (!isStateChangingMethod(req.method)) {
      return next();
    }

    // Skip exempt routes
    if (exemptPaths.some(pattern => pattern.test(req.path))) {
      return next();
    }

    // Skip API key authenticated requests
    if (isApiKeyAuthenticated(req)) {
      return next();
    }

    // Skip if no session
    if (!req.session) {
      return next();
    }

    // Get session token
    const sessionToken = req.session.csrfToken;
    const requestToken = req.get(tokenHeader);

    if (!sessionToken || !requestToken) {
      res.status(403).json({
        error: 'CSRF validation failed',
        message: 'Missing CSRF token',
        code: 'CSRF_TOKEN_MISSING',
      });
      return;
    }

    // Timing-safe comparison
    try {
      const sessionBuffer = Buffer.from(sessionToken);
      const requestBuffer = Buffer.from(requestToken);

      if (sessionBuffer.length !== requestBuffer.length ||
          !crypto.timingSafeEqual(sessionBuffer, requestBuffer)) {
        res.status(403).json({
          error: 'CSRF validation failed',
          message: 'Invalid CSRF token',
          code: 'CSRF_TOKEN_INVALID',
        });
        return;
      }

      next();
    } catch (error) {
      res.status(403).json({
        error: 'CSRF validation failed',
        message: 'Token validation error',
        code: 'CSRF_TOKEN_ERROR',
      });
    }
  };
}

// Export constants for use in other modules
export const CSRF_CONFIG = {
  HEADER_NAME: CSRF_HEADER_NAME,
  COOKIE_NAME: CSRF_COOKIE_NAME,
  TOKEN_EXPIRY_MS: CSRF_TOKEN_EXPIRY_MS,
  EXEMPT_PATHS: CSRF_EXEMPT_PATHS,
};
