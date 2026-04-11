// Universal authentication system - portable to any platform
// Secure password-based auth with bcrypt, rate limiting, and session management

import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db, isDbCircuitOpen } from "./db";
import { users, authSessions } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import "./types";
import { trinityOrchestration } from "./services/trinity/trinityOrchestrationAdapter";
import { createLogger } from './lib/logger';
import { AUTH } from './config/platformConfig';
import { isProduction as isProductionEnv } from './lib/isProduction';

const log = createLogger('auth');

// ============================================================================
// Password Security
// ============================================================================

const SALT_ROUNDS = 12; // High security, slower hashing
const MAX_LOGIN_ATTEMPTS = AUTH.maxLoginAttempts;
const LOCK_DURATION_MINUTES = 15;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ============================================================================
// Password Validation
// ============================================================================

export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Account Security
// ============================================================================

export async function checkAccountLocked(
  userId: string
): Promise<{ locked: boolean; message?: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { locked: false };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000
    );
    return {
      locked: true,
      message: `Account locked. Try again in ${minutesLeft} minutes.`,
    };
  }

  // Unlock if lock period expired
  if (user.lockedUntil && user.lockedUntil <= new Date()) {
    await db
      .update(users)
      .set({
        loginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  return { locked: false };
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  const attempts = (user.loginAttempts || 0) + 1;
  const updates: any = {
    loginAttempts: attempts,
    updatedAt: new Date(),
  };

  // Lock account after max attempts
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + LOCK_DURATION_MINUTES);
    updates.lockedUntil = lockUntil;
    log.warn(`[Auth] ACCOUNT LOCKED: userId=${userId} after ${attempts} failed attempts — locked until ${lockUntil.toISOString()}`);
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * FaultTolerantSessionStore wraps connect-pg-simple with a hard timeout.
 * When the DB is unavailable, store operations resolve immediately (returning
 * null for get, no-op for set/destroy) so requests are never blocked.
 * Timeout is intentionally short: 1500ms.
 *
 * Includes an in-memory LRU-style cache so sessions survive 30-second DB
 * circuit-breaker outages without forcing users to re-login.
 * Cache: max 1000 entries, 15-minute TTL, pruned every 5 minutes.
 */
interface CacheEntry { data: session.SessionData; expiresAt: number; }

class FaultTolerantStore extends session.Store {
  private inner: any;
  private timeoutMs: number;
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000;
  private readonly CACHE_MAX = 1000;

  constructor(inner: any, timeoutMs = 1500) {
    super();
    this.inner = inner;
    this.timeoutMs = timeoutMs;
    setInterval(() => this.pruneCache(), 5 * 60 * 1000).unref();
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }

  private cacheSet(sid: string, data: session.SessionData): void {
    if (this.cache.size >= this.CACHE_MAX) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(sid, { data, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }

  private cacheGet(sid: string): session.SessionData | undefined {
    const entry = this.cache.get(sid);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { this.cache.delete(sid); return undefined; }
    return entry.data;
  }

  private withTimeout<T>(
    fn: (cb: (err: any, result?: T) => void) => void,
    cb: (err: any, result?: T) => void
  ): void {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cb(null, undefined); // graceful no-op on timeout
      }
    }, this.timeoutMs);

    fn((err, result) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        cb(err, result);
      }
    });
  }

  get(sid: string, cb: (err: any, session?: session.SessionData | null) => void): void {
    this.withTimeout<session.SessionData | null>(
      (done) => this.inner.get(sid, done),
      (err, result) => {
        if (result) {
          this.cacheSet(sid, result);
          cb(err, result);
        } else {
          const cached = this.cacheGet(sid);
          cb(null, cached ?? null);
        }
      }
    );
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: any) => void): void {
    this.cacheSet(sid, sess);
    this.withTimeout(
      (done) => this.inner.set(sid, sess, done),
      (err) => cb?.(err)
    );
  }

  destroy(sid: string, cb?: (err?: any) => void): void {
    this.cache.delete(sid);
    this.withTimeout(
      (done) => this.inner.destroy(sid, done),
      (err) => cb?.(err)
    );
  }

  touch(sid: string, sess: session.SessionData, cb?: () => void): void {
    this.cacheSet(sid, sess);
    if (typeof this.inner.touch === 'function') {
      this.withTimeout(
        (done) => this.inner.touch(sid, sess, done),
        () => cb?.()
      );
    } else {
      cb?.();
    }
  }
}

export function getSession() {
  const sessionTtl = AUTH.sessionTtlMs; // 1 week
  const PgStore = connectPg(session);
  const pgStoreInstance = new PgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const sessionStore = new FaultTolerantStore(pgStoreInstance, 1500);

  // Production-aware cookie config (CLAUDE.md §A canonical isProduction).
  // The previous config had sameSite:'strict' + no domain, which broke
  // session sending on Railway with the custom domain because:
  //   1. sameSite:'strict' refused the cookie on subdomain navigations
  //   2. no explicit domain meant the cookie was scoped to the bare host
  //      and not shared across coaileague.com / www.coaileague.com /
  //      *.coaileague.com (subdomain client portals).
  // Switching to sameSite:'lax' allows top-level GET navigation to send
  // the cookie (the standard for app sessions), and adding the leading-
  // dot domain in production scopes the cookie to all subdomains.
  const inProd = isProductionEnv();
  // Allow operators to override the cookie domain via env (e.g. for
  // multi-tenant subdomain deployments). Default to .coaileague.com in
  // prod, undefined (host-only) in dev.
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN
    || (inProd ? '.coaileague.com' : undefined);

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: inProd, // HTTPS-only in production
      maxAge: sessionTtl,
      sameSite: 'lax', // 'lax' lets the cookie ride top-level GETs (auth flows)
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    },
    // Trust proxy for Railway / Cloud Run / any reverse-proxied host so
    // express-session sees the original protocol (HTTPS) and sets secure
    // cookies correctly.
    proxy: inProd,
  } as any);
}

// ============================================================================
// Test Mode Configuration (for crawlers/diagnostics)
// ============================================================================

const TEST_MODE_SECRET = process.env.DIAG_BYPASS_SECRET || process.env.TEST_MODE_SECRET;
// Playwright test key for development E2E testing - only works in development
const PLAYWRIGHT_TEST_KEY = process.env.PLAYWRIGHT_TEST_KEY;
// Use canonical isProduction() helper (CLAUDE.md Section A) so test-mode
// bypass is correctly disabled on Railway/Cloud Run, not just on Replit.
const IS_PRODUCTION = isProductionEnv();
const IS_DEVELOPMENT = !IS_PRODUCTION;

// ============================================================================
// Trinity Bot / System Actor Bypass
// ============================================================================
//
// Allows Trinity autonomous pipelines (cron jobs, event handlers, subagents)
// to make authenticated internal HTTP calls without a human user session.
// The token is an HMAC secret stored in TRINITY_BOT_TOKEN env var.
//
// Header: x-trinity-bot-token
// Identity set on the request: platformRole='Bot', isTrinityBot=true
// Works in all environments (unlike x-test-key which is dev-only).
// Routes that should accept Bot actors must include 'Bot' in their
// requirePlatformRole([...]) allowed-roles list.
//
const TRINITY_BOT_TOKEN = process.env.TRINITY_BOT_TOKEN;

function validateTrinityBotToken(token: string | undefined): boolean {
  if (!token || !TRINITY_BOT_TOKEN) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(TRINITY_BOT_TOKEN);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Synthetic Bot user record attached to req.user when the bot bypass fires.
// It has no real DB row — it is only used within the request lifecycle.
const TRINITY_BOT_USER = {
  id: 'trinity-bot-system',
  email: 'system@trinity.internal',
  firstName: 'Trinity',
  lastName: 'Bot',
  role: 'Bot',
  emailVerified: true,
  workspaceId: null,
  currentWorkspaceId: null,
  platformRole: 'Bot',
  employeeId: null,
} as const;

// Dev bypass identifiers — Acme Security sandbox org (DFW, TX)
// Used for all test/diagnostic access in development only
const TEST_MODE_USER_ID = 'dev-owner-001';
const TEST_MODE_WORKSPACE_ID = 'dev-acme-security-ws';
const TEST_MODE_EMPLOYEE_ID = 'dev-acme-emp-004';

// Rate limiting for test mode access
interface TestModeRateLimitEntry {
  count: number;
  windowStart: number;
}
const testModeRateLimits = new Map<string, TestModeRateLimitEntry>();
const TEST_MODE_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const TEST_MODE_RATE_LIMIT_MAX_REQUESTS = AUTH.testModeRateLimitMax; // Max requests per minute per IP

// Auth failure tracking by IP
const authFailuresByIp = new Map<string, { count: number; lastFailure: number }>();
const IP_AUTH_FAILURE_THRESHOLD = 20; // Alert if 20 failures from same IP
const IP_AUTH_FAILURE_WINDOW = 60 * 60 * 1000; // 1 hour window

/**
 * Record a failed login attempt from an IP address
 */
export function recordIpAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = authFailuresByIp.get(ip) || { count: 0, lastFailure: now };
  
  if (now - entry.lastFailure > IP_AUTH_FAILURE_WINDOW) {
    entry.count = 1;
  } else {
    entry.count++;
  }
  entry.lastFailure = now;
  authFailuresByIp.set(ip, entry);

  if (entry.count >= IP_AUTH_FAILURE_THRESHOLD) {
    log.error(`[Auth] CRITICAL ALERT: Repeated auth failures from same IP (${ip}): ${entry.count} attempts in the last hour`);
  }
}

/**
 * Check rate limit for test mode access
 */
function checkTestModeRateLimit(ipAddress: string): { allowed: boolean; remaining: number } {
  // In development the bypass is used by agents and automated tests — no rate cap.
  if (IS_DEVELOPMENT) {
    return { allowed: true, remaining: 9999 };
  }

  const now = Date.now();
  const entry = testModeRateLimits.get(ipAddress);

  if (!entry || now - entry.windowStart > TEST_MODE_RATE_LIMIT_WINDOW_MS) {
    testModeRateLimits.set(ipAddress, { count: 1, windowStart: now });
    return { allowed: true, remaining: TEST_MODE_RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (entry.count >= TEST_MODE_RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: TEST_MODE_RATE_LIMIT_MAX_REQUESTS - entry.count };
}

// Clean up old rate limit entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of testModeRateLimits.entries()) {
    if (now - entry.windowStart > TEST_MODE_RATE_LIMIT_WINDOW_MS * 2) {
      testModeRateLimits.delete(ip);
    }
  }
}, 5 * 60 * 1000);

interface TestModeContext {
  isTestMode: boolean;
  testUserId: string;
  allowedRoutes: RegExp[];
}

// Routes allowed in test mode - all API routes allowed for diagnostic crawlers
const TEST_MODE_ALLOWED_ROUTES = [
  /^\/api\//, // Allow all /api/ routes for crawlers
  /^\/$/,  // Root page
  /^\/(dashboard|schedule|employees|clients|reports|settings)/,
  /^\/api\/shifts/,
  /^\/api\/time-entries/,
  /^\/api\/stripe/,
  /^\/api\/platform/,
  /^\/api\/disputes/,
  /^\/api\/chat/,
];

/**
 * Validate x-test-key header for crawler/diagnostic access
 * Returns true if the key is valid and test mode should be enabled
 * Supports both DIAG_BYPASS_SECRET (production) and PLAYWRIGHT_TEST_KEY (development)
 */
export function validateTestKey(testKey: string | undefined): boolean {
  if (!testKey) {
    return false;
  }
  
  // Check playwright test key first (development only)
  if (IS_DEVELOPMENT && PLAYWRIGHT_TEST_KEY && testKey === PLAYWRIGHT_TEST_KEY) {
    log.info('Playwright test key validated for development testing');
    return true;
  }
  
  // Check diagnostic bypass secret
  if (!TEST_MODE_SECRET) {
    return false;
  }
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    const keyBuffer = Buffer.from(testKey);
    const secretBuffer = Buffer.from(TEST_MODE_SECRET);
    if (keyBuffer.length !== secretBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(keyBuffer, secretBuffer);
  } catch {
    return false;
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
  const endpoint = req.originalUrl?.split('?')[0] || req.path;
  const method = req.method;
  const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || 'unknown';

  // Check for test mode (x-test-key header) - allows crawlers to bypass auth
  const testKey = req.get('x-test-key');

  if (testKey && validateTestKey(testKey)) {
    // CRITICAL SECURITY: Block test mode in production environment
    // Test mode MUST ONLY work in development/test environments
    if (IS_PRODUCTION) {
      log.error('SECURITY ALERT: Test mode authentication attempted in PRODUCTION', {
        ip: ipAddress,
        userAgent,
        endpoint,
        method,
        xForwardedFor: req.get('x-forwarded-for'),
        xRealIp: req.get('x-real-ip'),
      });
      return res.status(403).json({ message: "Test mode is disabled in production" });
    }

    // Apply rate limiting for test mode access
    const rateLimitResult = checkTestModeRateLimit(ipAddress);
    if (!rateLimitResult.allowed) {
      log.warn('Test mode RATE LIMITED', {
        ip: ipAddress,
        endpoint,
        method,
      });
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ message: "Test mode rate limit exceeded. Try again later." });
    }
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());

    // Check if route is allowed in test mode
    const isAllowedRoute = TEST_MODE_ALLOWED_ROUTES.some(pattern => pattern.test(endpoint));
    if (!isAllowedRoute && method !== 'GET') {
      log.warn('Test mode blocked - not in allowed routes', {
        method,
        endpoint,
        ip: ipAddress,
      });
      return res.status(403).json({ message: "Test mode not allowed for this endpoint" });
    }

    // SECURITY: x-test-workspace header is NOT supported
    // All test mode access uses the dedicated synthetic test workspace
    // This prevents attackers from accessing arbitrary workspaces
    const testWorkspaceHeader = req.get('x-test-workspace');
    if (testWorkspaceHeader) {
      log.warn('Rejected x-test-workspace header override attempt', {
        ip: ipAddress,
        attemptedWorkspace: testWorkspaceHeader,
        endpoint,
      });
      // Silently ignore the header - do not use it
    }

    // Bypass uses Acme Security sandbox org (DFW TX) — dev-owner-001
    const testUser = {
      id: TEST_MODE_USER_ID,
      email: 'owner@acmesecurity.com',
      firstName: 'Acme',
      lastName: 'Owner',
      role: 'org_owner',
      emailVerified: true,
      workspaceId: TEST_MODE_WORKSPACE_ID,
      currentWorkspaceId: TEST_MODE_WORKSPACE_ID,
      platformRole: 'none',
      employeeId: TEST_MODE_EMPLOYEE_ID,
    };

    log.warn('DEV BYPASS access granted (Acme Security)', {
      ip: ipAddress,
      userAgent,
      endpoint,
      method,
      userId: TEST_MODE_USER_ID,
      workspaceId: TEST_MODE_WORKSPACE_ID,
      role: testUser.role,
      rateLimitRemaining: rateLimitResult.remaining,
    });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    req.user = testUser;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    req.user = testUser.id;
    req.isTestMode = true;
    req.workspaceId = TEST_MODE_WORKSPACE_ID;
    req.workspaceRole = 'org_owner';
    req.platformRole = 'none';

    // Populate session so ensureWorkspaceAccess fast-path fires without a DB lookup
    if (!req.session) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      req.session = {};
    }
    (req as any).session.userId = testUser.id;
    (req as any).session.workspaceId = TEST_MODE_WORKSPACE_ID;
    (req as any).session.workspaceRole = 'org_owner';
    (req as any).session.employeeId = TEST_MODE_EMPLOYEE_ID;

    return next();
  }

  // ── Trinity Bot / System Actor bypass ────────────────────────────────────
  // Allows Trinity autonomous pipelines to make authenticated internal calls
  // without a human user session.  The TRINITY_BOT_TOKEN env var must be set;
  // if it is not set the bypass is disabled (fail-closed).
  const botToken = req.get('x-trinity-bot-token');
  if (botToken && validateTrinityBotToken(botToken)) {
    log.info('Trinity bot bypass granted', { endpoint, method, ip: ipAddress });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    req.user = TRINITY_BOT_USER;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    req.user = TRINITY_BOT_USER.id;
    req.platformRole = 'Bot';
    req.workspaceRole = undefined;
    (req as any).isTrinityBot = true;
    return next();
  }

  // Support session-based auth, Passport auth, and auth_token cookie
  let authenticatedUserId = req.session?.userId;
  
  // Fallback: check auth_token cookie (set during login for non-session auth)
  if (!authenticatedUserId && req.cookies?.auth_token) {
    try {
      const { authService } = await import('./services/authService');
      const tokenResult = await authService.validateSession(req.cookies.auth_token);
      if (tokenResult.success && tokenResult.user) {
        authenticatedUserId = tokenResult.user.id;
        if (req.session) {
          req.session.userId = authenticatedUserId;
        }
      }
    } catch (e) {
      log.warn('[requireAuth] auth_token cookie validation error (treating as unauthenticated):', e instanceof Error ? e.message : String(e));
    }
  }

  if (!authenticatedUserId) {
    trinityOrchestration.auth.requestUnauthenticated(endpoint, method, 'no_session', ipAddress);
    return res.status(401).json({ message: "Unauthorized - Please login" });
  }

  // Guard: if DB circuit is open, serve from session data instead of hanging.
  // This keeps the user logged in and shows a degraded-mode banner instead of
  // a white screen.  The /api/auth/me handler has a matching fast-path that
  // returns _dbDegraded:true so the frontend knows to show the amber banner.
  if (isDbCircuitOpen()) {
    const wsId = (req as any).session?.workspaceId || (req as any).session?.currentWorkspaceId || null;
    const degradedUser: any = {
      id: authenticatedUserId,
      email: '',
      firstName: null,
      lastName: null,
      username: null,
      role: 'employee',
      currentWorkspaceId: wsId,
      _dbDegraded: true,
    };
    req.user = degradedUser;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    req.user = authenticatedUserId;
    if (wsId && !req.workspaceId) req.workspaceId = wsId;
    log.warn('[requireAuth] DB circuit open — using session-based degraded auth', { userId: authenticatedUserId, path: endpoint });
    return next();
  }

  // Verify user still exists
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, authenticatedUserId))
    .limit(1);

  if (!user) {
    trinityOrchestration.auth.requestUnauthenticated(endpoint, method, 'user_not_found', ipAddress);
    req.session.destroy(() => {});
    return res.status(401).json({ message: "User not found" });
  }

  // Check if account is locked
  const lockStatus = await checkAccountLocked(user.id);
  if (lockStatus.locked) {
    trinityOrchestration.auth.requestUnauthenticated(endpoint, method, 'account_locked', ipAddress);
    return res.status(403).json({ message: lockStatus.message });
  }

  trinityOrchestration.auth.requestAuthenticated(user.id, endpoint, method, user.currentWorkspaceId || undefined);

  // Attach user to request
  req.user = user;

  if (req.session && !(req as any).session.activeWorkspaceId) {
    const wsId = req.session.workspaceId || user.currentWorkspaceId;
    if (wsId) {
      (req as any).session.activeWorkspaceId = wsId;
      if (!req.session.workspaceId) {
        req.session.workspaceId = wsId;
      }
    }
  }

  // Ensure req.workspaceId is set even for routes that don't use RBAC middleware
  if (!req.workspaceId) {
    const wsId = (req as any).session?.workspaceId || user.currentWorkspaceId;
    if (wsId) req.workspaceId = wsId;
  }

  // Propagate workspaceId onto req.user so routes reading (req as any).user?.workspaceId work correctly.
  // The user DB model has 'currentWorkspaceId' but many routes expect '(req as any).user?.workspaceId'.
  // @ts-expect-error — TS migration: fix in refactoring sprint
  if (req.workspaceId && !(req.user).workspaceId) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    (req.user).workspaceId = req.workspaceId;
  }

  next();
  } catch (err: any) {
    if (err?.message?.includes('CircuitBreaker') || err?.message?.includes('circuit is open')) {
      return res.status(503).json({ message: "Database temporarily unavailable — please try again shortly" });
    }
    log.error('requireAuth unexpected error', { error: err?.message, path: req.path });
    return res.status(500).json({ message: "Authentication error" });
  }
};

/**
 * Enhanced auth middleware that also checks for elevated support sessions
 * This allows support roles and AI services to bypass redundant auth checks
 * during automated workflows while maintaining security
 * 
 * IMPORTANT: Even elevated sessions must pass account lock checks for security
 */
export const requireAuthWithElevation: RequestHandler = async (req, res, next) => {
  const userId = req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized - Please login" });
  }

  // Check for elevated session first (for support/AI services)
  try {
    const { isElevatedSupportSession, revokeElevation } = await import("./services/session/elevatedSessionService");
    const elevationContext = await isElevatedSupportSession(req);
    
    if (elevationContext.isElevated) {
      // Elevated session found - still verify user exists and is not locked
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (!user) {
        // User deleted - revoke elevation
        if (elevationContext.elevationId) {
          await revokeElevation(elevationContext.elevationId, userId, 'user_not_found');
        }
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Check if account is locked even for elevated sessions
      const lockStatus = await checkAccountLocked(user.id);
      if (lockStatus.locked) {
        // Revoke elevation for locked accounts to prevent reuse
        if (elevationContext.elevationId) {
          await revokeElevation(elevationContext.elevationId, userId, 'account_locked');
          log.info('Revoked elevation due to locked account', { elevationId: elevationContext.elevationId });
        }
        return res.status(403).json({ message: lockStatus.message });
      }

      req.user = user;
      req.auditContext = {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        isSupportElevated: true,
        elevationId: elevationContext.elevationId,
        platformRole: elevationContext.platformRole,
        actionsExecuted: elevationContext.actionsExecuted
      };
      return next();
    }
  } catch (error) {
    // Fall through to normal auth if elevation check fails
    log.warn('Elevation check failed, using standard auth', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Standard auth flow
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "User not found" });
  }

  const lockStatus = await checkAccountLocked(user.id);
  if (lockStatus.locked) {
    return res.status(403).json({ message: lockStatus.message });
  }

  req.user = user;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  req.auditContext = { isSupportElevated: false };
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.session.userId))
    .limit(1);

  if (!user || !["platform-admin", "platform_staff", "root_admin", "sysop"].includes(user.role || "")) {
    return res.status(403).json({ message: "Admin access required" });
  }

  req.user = user;
  next();
};

export const requireSupportStaff: RequestHandler = async (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.session.userId))
    .limit(1);

  if (!user || !["platform-admin", "platform_staff", "support_staff", "root_admin", "sysop", "support_manager", "support_agent"].includes(user.role || "")) {
    return res
      .status(403)
      .json({ message: "Support staff access required" });
  }

  req.user = user;
  next();
};

// Dual auth middleware: Supports both session-based AND Replit OAuth
export const requireAnyAuth: RequestHandler = async (req: any, res, next) => {
  // Try session-based auth first
  if (req.session?.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
    if (user) {
      req.user = user;
      return next();
    }
  }
  
  // Try Replit OAuth
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
    const userId = req.user?.id || req.user?.claims?.sub;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user) {
      req.user = user;
      return next();
    }
  }
  
  return res.status(401).json({ message: "Unauthorized" });
};

// ============================================================================
// Email Verification
// ============================================================================

export async function createVerificationToken(userId: string): Promise<string> {
  const token = generateSecureToken();
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 24); // 24 hour expiry

  await db
    .update(users)
    .set({
      verificationToken: token,
      verificationTokenExpiry: expiry,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return token;
}

export async function verifyEmailToken(
  token: string
): Promise<{ success: boolean; userId?: string; message?: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.verificationToken, token),
        gt(users.verificationTokenExpiry!, new Date())
      )
    )
    .limit(1);

  if (!user) {
    return { success: false, message: "Invalid or expired verification token" };
  }

  await db
    .update(users)
    .set({
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { success: true, userId: user.id };
}

// ============================================================================
// Password Reset
// ============================================================================

export async function createPasswordResetToken(
  email: string
): Promise<{ success: boolean; token?: string; user?: typeof users.$inferSelect; message?: string; code?: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return { success: false, code: "no_account", message: "No account with this email" };
  }

  if (!user.emailVerified) {
    return { success: false, code: "email_unverified", message: "Please verify your email first" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { success: false, code: "account_locked", message: "Account is locked. Contact support." };
  }

  const token = generateSecureToken();
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 1); // 1 hour expiry

  await db
    .update(users)
    .set({
      resetToken: token,
      resetTokenExpiry: expiry,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { success: true, token, user };
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; message?: string; userId?: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.resetToken, token),
        gt(users.resetTokenExpiry!, new Date())
      )
    )
    .limit(1);

  if (!user) {
    return { success: false, message: "Invalid or expired reset token" };
  }

  const validation = validatePassword(newPassword);
  if (!validation.isValid) {
    return { success: false, message: validation.errors.join(", ") };
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
      loginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // SECURITY: Invalidate all active sessions after a password reset.
  // A stolen session must not survive a credential change.
  try {
    await db
      .update(authSessions)
      .set({ isValid: false })
      .where(eq(authSessions.userId, user.id));
  } catch (sessionErr: unknown) {
    log.error('[auth] Failed to invalidate sessions after password reset:', sessionErr);
  }

  return { success: true, userId: user.id };
}

// ============================================================================
// Setup Authentication
// ============================================================================

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}
