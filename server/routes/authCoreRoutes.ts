// Authentication API routes - registration, login, password reset
import { Router } from "express";
import { z } from "zod";
import { AUTH } from '../config/platformConfig';
import { db, pool, isDbCircuitOpen } from "../db";
import { users, platformRoles, employees, workspaces, expenseCategories } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
// Phase 53: 2FA / Device Trust / Session Limit
import {
  isDeviceTrusted,
  trustDevice,
  revokeAllDeviceTrust,
  issuePendingMfaToken,
  validatePendingMfaToken,
  registerSession,
  removeSession,
  getActiveSessions,
  isMfaMandatory,
  adminResetUserMfa,
} from '../services/auth/twoFactorSessionService';
import { verifyMfaToken } from '../services/auth/mfa';
import {
  SUPPORT_PLATFORM_ROLES,
  generateAndSendSupportOtp,
  verifySupportOtp,
} from '../services/auth/supportSmsOtpService';
import { requireAuth } from '../auth';
import { isProduction } from '../lib/isProduction';

/**
 * Canonical cookie options for the auth_token cookie. Centralized so the
 * login and MFA-verify handlers can't drift. Mirrors the express-session
 * cookie config in server/auth.ts:
 *   - secure in production (HTTPS only)
 *   - sameSite 'lax' so the cookie rides top-level navigations (the only
 *     correct setting for an app session — 'strict' breaks magic-link
 *     style flows and most CSRF-safe app patterns)
 *   - explicit domain in production so the cookie is shared across
 *     coaileague.com / www.coaileague.com / *.coaileague.com (subdomain
 *     client portals). Override via SESSION_COOKIE_DOMAIN env var.
 */
function authCookieOptions() {
  const inProd = isProduction();
  const domain = process.env.SESSION_COOKIE_DOMAIN
    || (inProd ? '.coaileague.com' : undefined);
  return {
    httpOnly: true,
    secure: inProd,
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

// ── Per-IP rate limiter for pre-auth endpoints (no workspace/session context) ─
// The global tenant-based rate limiter does not apply to unauthenticated routes.
// This in-memory limiter is a lightweight guard against email-flood abuse.
interface IpRateBucket { count: number; resetAt: number; }
const _authIpBuckets = new Map<string, IpRateBucket>();
function _checkIpRateLimit(ip: string, key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucketKey = `${key}:${ip}`;
  const existing = _authIpBuckets.get(bucketKey);
  if (!existing || now >= existing.resetAt) {
    _authIpBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count++;
  return existing.count <= maxRequests;
}
// Prune stale buckets every 5 minutes to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _authIpBuckets.entries()) {
    if (now >= v.resetAt) _authIpBuckets.delete(k);
  }
}, 5 * 60 * 1000).unref();

// Type for User from database queries
type User = typeof users.$inferSelect;
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  recordFailedLogin,
  recordSuccessfulLogin,
  recordIpAuthFailure,
  checkAccountLocked,
  createVerificationToken,
  createPasswordResetToken,
  resetPassword,
  verifyEmailToken,
} from "../auth";
import { checkWorkspacePaymentStatus, hasPlatformWideAccess, getUserPlatformRole } from "../rbac";
import { emailService } from "../services/emailService";
import { platformEventBus } from "../services/platformEventBus";
// Rate limiters applied globally in server/routes.ts — no inline imports needed
import { systemAuditLogs } from "@shared/schema";
import { rotateCsrfToken } from "../middleware/csrf";
import { verifyRecaptcha } from "../services/recaptchaService";
import { mutationLimiter } from "../middleware/rateLimiter";

const router = Router();

// ============================================================================
// Registration
// ============================================================================

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must not exceed 72 characters"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  recaptchaToken: z.string().nullish(), // Allow null when reCAPTCHA not configured
});

router.post("/api/auth/register", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!_checkIpRateLimit(ip, 'register', 5, 60 * 60 * 1000)) {
      return res.status(429).json({ message: "Too many registration attempts from this IP. Please try again later." });
    }

    const data = registerSchema.parse(req.body);

    // Verify reCAPTCHA (only blocks obvious bots, gracefully degrades if not configured)
    const diagnosticsHeader = req.get('X-Diagnostics-Runner') as string | undefined;
    const recaptchaResult = await verifyRecaptcha(data.recaptchaToken, 'register', diagnosticsHeader);
    if (!recaptchaResult.isHuman) {
      log.warn(`[Registration] Bot detected - Score: ${recaptchaResult.score}, Email: ${data.email}`);
      return res.status(429).json({ message: "Suspicious activity detected. Please try again later." });
    }

    // Check if email already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Validate password strength
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: "Password does not meet requirements",
        errors: passwordValidation.errors,
      });
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create ONLY the user account - NO workspace/employee yet
    // User will be redirected to /create-org to set up their organization
    const [newUser] = await db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        emailVerified: false,
        role: "user",
        // currentWorkspaceId is left null - user needs to create org first
      })
      .returning();

    log.info(`[Registration] Created user ${newUser.id} (${newUser.email}) - needs org setup`);

    // Create verification token
    const verificationToken = await createVerificationToken(newUser.id);

    // Send verification email (non-blocking - don't fail registration if email fails)
    try {
      await emailService.sendVerificationEmail( // infra
        newUser.id,
        newUser.email,
        verificationToken,
        newUser.firstName || undefined
      );
    } catch (emailError: unknown) {
      // Log but don't fail registration - user can request resend later
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.warn(`[Registration] Verification email failed for ${newUser.email}:`, emailError.message);
    }

    // Auto-login after registration - CRITICAL: Rotate session ID and explicitly save to database
    const priorHrisState = (req as any).session.hrisOAuthState;
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          log.error('[Registration] Session regeneration failed:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
    if (priorHrisState) (req as any).session.hrisOAuthState = priorHrisState;

    req.session.userId = newUser.id;
    const { saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
    await saveSessionAsync(req);

    res.status(201).json({
      message: "Registration successful",
      needsOrgSetup: true, // User needs to create their organization
      redirectTo: "/create-org", // Redirect user to org creation wizard
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        currentWorkspaceId: null, // No workspace yet
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.error("[Registration] Zod validation failed:", error.errors);
      const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return res.status(400).json({
        message: fieldErrors || "Please check your form fields",
        errors: error.errors,
      });
    }
    log.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ============================================================================
// Email Verification
// ============================================================================

import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
const log = createLogger('AuthCoreRoutes');


router.post("/api/auth/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: "Verification token required" });
    }

    const result = await verifyEmailToken(token);

    if (!result.success) {
      return res.status(400).json({ message: result.message || "Invalid or expired token" });
    }

    res.json({
      message: "Email verified successfully",
      verified: true,
      userId: result.userId,
    });
  } catch (error) {
    log.error("Email verification error:", error);
    res.status(500).json({ message: "Verification failed" });
  }
});

router.get("/api/auth/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.redirect("/?error=invalid_token");
    }

    const result = await verifyEmailToken(token);

    if (!result.success) {
      return res.redirect("/?error=expired_token");
    }

    res.redirect("/login?verified=true");
  } catch (error) {
    log.error("Email verification error:", error);
    res.redirect("/?error=verification_failed");
  }
});

// ============================================================================
// Resend Verification Email
// ============================================================================

router.post("/api/auth/resend-verification", async (req, res) => {
  try {
    // M01: Per-IP rate limit — max 3 resend attempts per IP per 15 min
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!_checkIpRateLimit(ip, 'resend-verification', 3, 15 * 60 * 1000)) {
      log.warn(`[ResendVerification] Rate limit exceeded for IP: ${ip}`);
      return res.status(429).json({ message: "Too many verification email requests. Please wait 15 minutes before trying again." });
    }

    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [user] = await db
      .select({ id: users.id, email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user || user.emailVerified) {
      return res.json({ message: "If an unverified account exists, a verification link has been sent" });
    }

    const verificationToken = await createVerificationToken(user.id);

    try {
      await emailService.sendVerificationEmail( // infra
        user.id,
        user.email,
        verificationToken,
        undefined
      );
    } catch (emailError: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.warn(`[ResendVerification] Email send failed for ${user.email}:`, emailError.message);
    }

    res.json({ message: "If an unverified account exists, a verification link has been sent" });
  } catch (error) {
    log.error("Resend verification error:", error);
    res.status(500).json({ message: "Failed to resend verification" });
  }
});

// ============================================================================
// Login
// ============================================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  rememberMe: z.boolean().optional().default(false),
  recaptchaToken: z.string().nullish(), // Allow null when reCAPTCHA not configured
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!_checkIpRateLimit(ip, 'login', 10, 15 * 60 * 1000)) {
      return res.status(429).json({ message: "Too many login attempts. Please try again in 15 minutes." });
    }

    const data = loginSchema.parse(req.body);
    const rememberMe = data.rememberMe === true;

    // Verify reCAPTCHA (only blocks obvious bots, gracefully degrades if not configured)
    const diagnosticsHeader = req.get('X-Diagnostics-Runner') as string | undefined;
    const recaptchaResult = await verifyRecaptcha(data.recaptchaToken, 'login', diagnosticsHeader);
    if (!recaptchaResult.isHuman) {
      log.warn(`[Login] Bot detected - Score: ${recaptchaResult.score}, Email: ${data.email}`);
      return res.status(429).json({ message: "Suspicious activity detected. Please try again later." });
    }

    // Find user (case-insensitive email lookup)
    const normalizedEmail = data.email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);

    if (!user) {
      log.warn(`[Login] User not found for email: ${normalizedEmail}`);
      recordIpAuthFailure(ip);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if account is locked
    const lockStatus = await checkAccountLocked(user.id);
    if (lockStatus.locked) {
      return res.status(403).json({ message: lockStatus.message });
    }

    // OAuth-only accounts (no password set) trigger the reset-password
    // flow via the `needsPasswordReset` flag; all other cases return a
    // generic "invalid credentials" to prevent enumeration.
    if (!user.passwordHash) {
      log.warn(`[Login] User ${user.id} has no password set (OAuth-only account)`);
      return res.status(401).json({
        message: "Invalid email or password",
        needsPasswordReset: true,
      });
    }

    const isValidPassword = await verifyPassword(
      data.password,
      user.passwordHash
    );

    if (!isValidPassword) {
      await recordFailedLogin(user.id);
      recordIpAuthFailure(ip);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Platform-critical roles must have MFA enabled at account level.
    // Enforced before session establishment to block non-MFA admin logins.
    const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, user.id));
    const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
    const mustEnforceAdminMfa = activePlatformRole && ['root_admin', 'sysop'].includes(activePlatformRole.role);
    if (mustEnforceAdminMfa && !user.mfaEnabled) {
      return res.status(403).json({
        error: 'MFA_REQUIRED',
        message: 'Root admin accounts must have MFA enabled. Please set up MFA before continuing.',
        setupUrl: '/settings?tab=security&action=mfa',
      });
    }

    // ── PHASE 53: MFA / Device Trust Gate ───────────────────────────────────
    const ipAddr = req.ip || req.socket?.remoteAddress || 'unknown';
    const ua = req.get('user-agent') || '';
    if (user.mfaEnabled) {
      const dtCookie = (req as any).cookies?.['dt_token'];
      const deviceTrusted = await isDeviceTrusted(user.id, dtCookie, ipAddr, ua);
      if (!deviceTrusted) {
        // Pause login — client must complete 2FA via /api/auth/mfa/verify
        const pendingToken = issuePendingMfaToken(user.id);
        return res.status(202).json({
          mfaRequired: true,
          pendingMfaToken: pendingToken,
          message: 'Two-factor authentication required. Submit your TOTP code to /api/auth/mfa/verify.',
        });
      }
    }
    // Mandatory MFA advisory (org_owner / platform_staff without MFA flagged in response)
    const mfaMandatory = isMfaMandatory(user.role || '');
    const mfaAdvisory = (mfaMandatory && !user.mfaEnabled) ? 'mfa_setup_required' : undefined;

    // ── SMS OTP Gate for Platform Support Roles ───────────────────────────
    // Platform staff (root_admin, deputy_admin, sysop, support_manager, etc.)
    // must verify a daily-rotating SMS PIN in addition to password (+ TOTP).
    // This gate only activates when Twilio is configured and the user has a
    // phone on file.  If either is missing, login continues with a warning.
    if (activePlatformRole && SUPPORT_PLATFORM_ROLES.has(activePlatformRole.role)) {
      if (user.phone) {
        const pendingToken = issuePendingMfaToken(user.id);
        const maskedPhone = user.phone.replace(
          /(\+?\d{1,3})(\d+)(\d{4})$/,
          (_: string, cc: string, mid: string, last4: string) => `${cc}${'*'.repeat(mid.length)}${last4}`
        );
        return res.status(202).json({
          smsPinRequired: true,
          pendingSmsPinToken: pendingToken,
          phoneHint: maskedPhone,
          message: 'A daily PIN will be sent to your registered number. Use POST /api/auth/sms-otp/request to receive it, then POST /api/auth/sms-otp/verify to complete login.',
        });
      } else {
        // No phone on file — log security gap but do not block login so the
        // account owner can still access settings to add a phone number.
        log.warn(`[Auth] SECURITY: Platform-role user ${user.id} (${activePlatformRole.role}) has no phone for SMS OTP gate`);
      }
    }

    // FIX [SESSION FIXATION]: Rotate the session ID before assigning the authenticated
    // userId. Without regenerate(), an attacker who planted a pre-login session cookie
    // (via XSS or physical access) can keep the same session ID and hijack the session
    // after the victim logs in. Capture pre-auth session values so they survive rotation.
    const priorHrisState = (req as any).session.hrisOAuthState;
    const priorSessionData = { ...req.session };
    delete (priorSessionData as any).cookie; // Don't copy cookie config

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          log.error('[Login] Session regeneration failed:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Restore prior session data and set userId
    Object.assign(req.session, priorSessionData);
    if (priorHrisState) (req as any).session.hrisOAuthState = priorHrisState;
    req.session.userId = user.id;

    // SECURITY: Ensure session is regenerated on every login
    log.info(`[Auth] Session regenerated for user ${user.id}`);

    // Issue auth_token cookie with canonical cross-subdomain options.
    // Was previously sameSite:'strict' + no domain, which broke session
    // sending on Railway with the custom domain (TRINITY.md §A).
    try {
      const { authService } = await import('../services/authService');
      const sessionResult = await authService.createSessionToken(user.id, req.ip || req.socket?.remoteAddress, req.get('user-agent'));
      if (sessionResult.sessionToken) {
        res.cookie('auth_token', sessionResult.sessionToken, authCookieOptions());
      }
    } catch (tokenErr) {
      log.warn('[Auth] Failed to create auth_token cookie:', tokenErr);
    }

    // Extend session duration if "Remember Me" is checked (30 days vs 1 week)
    if (rememberMe && req.session.cookie) {
      const thirtyDays = AUTH.rememberMeTtlMs;
      req.session.cookie.maxAge = thirtyDays;
      log.info('[Login] Remember Me enabled - session extended to 30 days');
    }

    // Resolve workspace for this user (needed for session context + response)
    let workspaceId = user.currentWorkspaceId;
    if (!workspaceId) {
      const [emp] = await db.select().from(employees).where(eq(employees.userId, user.id)).limit(1);
      if (emp) {
        workspaceId = emp.workspaceId;
        await db.update(users).set({ currentWorkspaceId: workspaceId, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
    }

    // ── S4: PER-WORKSPACE is_active GATE ───────────────────────────────────
    // Before: login did not consult employees.is_active, so a deactivated
    // officer in workspace A could still authenticate and (pre-S1 session
    // kill) stay in A. After S1 deactivation sets a grace window, a user
    // whose grace window has expired must not be silently logged into the
    // deactivated workspace. If they have ANOTHER workspace where they are
    // active, switch currentWorkspaceId to that one. Otherwise 403.
    if (workspaceId) {
      try {
        const [currentEmp] = await db.select({
          id: employees.id,
          isActive: employees.isActive,
          documentAccessExpiresAt: sql<string | null>`"employees"."document_access_expires_at"`,
        })
          .from(employees)
          .where(and(eq(employees.userId, user.id), eq(employees.workspaceId, workspaceId)))
          .limit(1);

        const now = Date.now();
        const graceExpired = !!(currentEmp && currentEmp.isActive === false
          && currentEmp.documentAccessExpiresAt
          && new Date(currentEmp.documentAccessExpiresAt).getTime() < now);

        if (graceExpired) {
          // Look for any active workspace membership to swap into.
          const activeEmployments = await db.select({ workspaceId: employees.workspaceId })
            .from(employees)
            .where(and(eq(employees.userId, user.id), eq(employees.isActive, true)))
            .limit(1);

          if (activeEmployments.length > 0) {
            workspaceId = activeEmployments[0].workspaceId;
            await db.update(users).set({ currentWorkspaceId: workspaceId, updatedAt: new Date() }).where(eq(users.id, user.id));
            log.info(`[Auth] User ${user.id} suspended in prior workspace; switched currentWorkspaceId to ${workspaceId}`);
          } else {
            log.warn(`[Auth] Login blocked: user ${user.id} has no active workspace membership`);
            return res.status(403).json({
              error: 'ACCOUNT_SUSPENDED',
              message: 'Your account has been deactivated and your record-access grace period has expired. Contact your employer if this is in error.',
            });
          }
        }
      } catch (activeCheckErr: unknown) {
        log.warn('[Auth] Per-workspace is_active check failed (fail-open):', (activeCheckErr as any)?.message || String(activeCheckErr));
      }
    }

    // Resolve platform role for response (needed for frontend routing)

    // Cache workspace/org context in session to avoid redundant DB lookups
    if (workspaceId) {
      const { resolveAndCacheWorkspaceContext } = await import('../services/session/sessionWorkspaceService');
      await resolveAndCacheWorkspaceContext(req, user.id, workspaceId);
    }

    const { saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
    await saveSessionAsync(req);

    // Phase 53: Register session for concurrent session limit tracking
    await registerSession(
      user.id,
      req.session.id,
      ipAddr,
      ua,
      req.session.cookie?.expires || undefined
    );

    res.json({
      message: "Login successful",
      mfaAdvisory, // 'mfa_setup_required' for mandatory-MFA roles without MFA enabled; undefined otherwise
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled ?? false,
        platformRole: activePlatformRole?.role || null, // GATEKEEPER: Include platform role for routing
        currentWorkspaceId: workspaceId, // Include assigned workspace for proper redirect
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors,
      });
    }
    log.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

// ============================================================================
// PHASE 53 — MFA Verification (second step of login when 2FA is required)
// ============================================================================

const mfaVerifySchema = z.object({
  pendingMfaToken: z.string(),
  totpCode: z.string().min(4).max(12),
  trustDevice: z.boolean().optional().default(false),
});

router.post("/api/auth/mfa/verify", async (req, res) => {
  try {
    const data = mfaVerifySchema.parse(req.body);

    // Validate pending token and extract userId
    let userId: string;
    try {
      userId = validatePendingMfaToken(data.pendingMfaToken);
    } catch {
      return res.status(401).json({ message: "MFA session expired. Please log in again." });
    }

    // Verify TOTP or backup code
    const mfaResult = await verifyMfaToken(userId, data.totpCode);
    if (!mfaResult.valid) {
      recordIpAuthFailure(req.ip || req.socket?.remoteAddress || 'unknown');
      return res.status(401).json({ message: "Invalid authentication code. Please try again." });
    }

    // Re-fetch user (pending token only holds userId)
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(401).json({ message: "User not found" });

    // Record successful login
    const {
      recordSuccessfulLogin: _recordSuccessful,
      checkAccountLocked: _checkLock,
    } = await import('../auth');
    const lockStatus = await _checkLock(user.id);
    if (lockStatus.locked) return res.status(403).json({ message: lockStatus.message });
    await _recordSuccessful(user.id);

    const ipAddr = req.ip || req.socket?.remoteAddress || 'unknown';
    const ua = req.get('user-agent') || '';

    // Issue device trust cookie if requested
    if (data.trustDevice) {
      await trustDevice(user.id, ipAddr, ua, res);
    }

    // Resolve workspace
    let workspaceId = user.currentWorkspaceId;
    if (!workspaceId) {
      const [emp] = await db.select().from(employees).where(eq(employees.userId, user.id)).limit(1);
      if (emp) {
        workspaceId = emp.workspaceId;
        await db.update(users).set({ currentWorkspaceId: workspaceId, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
    }

    // Check platform role
    const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, user.id));
    const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);

    // Create session
    const priorHrisState = (req as any).session.hrisOAuthState;
    const priorSessionData = { ...req.session };
    delete (priorSessionData as any).cookie;

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    
    Object.assign(req.session, priorSessionData);
    if (priorHrisState) (req as any).session.hrisOAuthState = priorHrisState;
    req.session.userId = user.id;

    log.info(`[MFA Verify] Session regenerated for user ${user.id}`);

    // Issue auth_token cookie with canonical cross-subdomain options.
    try {
      const { authService } = await import('../services/authService');
      const sessionResult = await authService.createSessionToken(user.id, req.ip || req.socket?.remoteAddress, req.get('user-agent'));
      if (sessionResult.sessionToken) {
        res.cookie('auth_token', sessionResult.sessionToken, authCookieOptions());
      }
    } catch (tokenErr) {
      log.warn('[Auth] Failed to create auth_token cookie after MFA:', tokenErr);
    }

    if (workspaceId) {
      const { resolveAndCacheWorkspaceContext } = await import('../services/session/sessionWorkspaceService');
      await resolveAndCacheWorkspaceContext(req, user.id, workspaceId);
    }
    const { saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
    await saveSessionAsync(req);

    // Register session for concurrent session limit tracking
    await registerSession(user.id, req.session.id, ipAddr, ua);

    return res.json({
      message: "Login successful",
      usedBackupCode: mfaResult.isBackupCode ?? false,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled ?? false,
        platformRole: activePlatformRole?.role || null,
        currentWorkspaceId: workspaceId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    log.error("[MFA Verify] error:", error);
    return res.status(500).json({ message: "MFA verification failed" });
  }
});

// ============================================================================
// PHASE 53 — Active Sessions Management
// ============================================================================

router.get("/api/auth/sessions", requireAuth, async (req: any, res) => {
  try {
    const sessions = await getActiveSessions(req.user.id);
    return res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        createdAt: s.created_at,
        lastActiveAt: s.last_active_at,
        isCurrent: s.session_id === req.session?.id,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.delete("/api/auth/sessions/:id", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT session_id FROM user_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Session not found' });
    await removeSession(rows[0].session_id);
    await pool.query(`DELETE FROM user_sessions WHERE id = $1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ============================================================================
// PHASE 53 — Admin MFA Reset (org_owner / platform_staff only)
// ============================================================================

router.post("/api/mfa/admin-reset", requireAuth, async (req: any, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

    const { role, id: actorId, workspaceId } = req.user;
    if (!['org_owner', 'co_owner', 'platform_staff'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions to reset 2FA' });
    }

    await adminResetUserMfa(targetUserId, actorId, role, workspaceId);
    return res.json({ success: true, message: `2FA reset for user ${targetUserId}. They will need to re-enroll.` });
  } catch (err: any) {
    log.error('[MFA AdminReset] error:', err.message);
    return res.status(500).json({ error: 'Failed to reset MFA. Please try again.' });
  }
});

// ============================================================================
// Development Bypass Login (dev only - sandbox + root accounts)
// Keyed by userId + workspaceId for stability (immune to email changes)
// ============================================================================

const DEV_ACCOUNTS = {
  owner: {
    userId: 'dev-owner-001',
    workspaceId: 'dev-acme-security-ws',
    label: 'Workspace Owner (Acme Security)',
  },
  anvil: {
    userId: 'anvil-owner-001',
    workspaceId: 'dev-anvil-security-ws',
    label: 'Workspace Owner (Anvil Security Group)',
  },
  root: {
    userId: 'root-user-00000000',
    workspaceId: PLATFORM_WORKSPACE_ID,
    label: 'Root Admin',
  },
  officer: {
    userId: 'dev-officer-bypass',
    workspaceId: 'dev-acme-security-ws',
    label: 'Security Officer (Acme Security)',
  },
  supervisor: {
    userId: 'dev-supervisor-bypass',
    workspaceId: 'dev-acme-security-ws',
    label: 'Field Supervisor (Acme Security)',
  },
  compliance: {
    userId: 'dev-compliance-bypass',
    workspaceId: 'dev-acme-security-ws',
    label: 'Compliance Officer (Acme Security)',
  },
} as const;

async function devLoginById(userId: string, targetWorkspaceId: string, label: string, req: any, res: any) {
  if (isProduction()) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ message: `User ID ${userId} (${label}) not found. Run dev seed first.` });
    }

    let workspaceId = user.currentWorkspaceId || targetWorkspaceId;
    if (!user.currentWorkspaceId && targetWorkspaceId) {
      const [employeeRecord] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.userId, user.id), eq(employees.workspaceId, targetWorkspaceId)))
        .limit(1);
      if (employeeRecord) {
        workspaceId = targetWorkspaceId;
        await db.update(users).set({ currentWorkspaceId: workspaceId, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
    }

    const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, user.id));
    const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);

    req.session.userId = user.id;
    const { resolveAndCacheWorkspaceContext, saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
    if (workspaceId) {
      await resolveAndCacheWorkspaceContext(req, user.id, workspaceId);
    }

    // Always clear any account lock so dev bypass is never blocked by rate-limiter lockouts
    await recordSuccessfulLogin(user.id);

    // Rotate CSRF token BEFORE saving so the token is persisted in the session store
    const freshCsrfToken = rotateCsrfToken(req);
    await saveSessionAsync(req);

    log.info(`[DevLogin] Bypassed login for ${user.email} (${user.id}) as ${label}, role=${activePlatformRole?.role || user.role}`);
    res.json({
      message: "Dev login successful",
      csrfToken: freshCsrfToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
        platformRole: activePlatformRole?.role || null,
        currentWorkspaceId: workspaceId,
      },
    });
  } catch (error) {
    log.error("[DevLogin] Error:", error);
    res.status(500).json({ message: "Dev login failed" });
  }
}

router.get("/api/auth/dev-login", (req, res) =>
  devLoginById(DEV_ACCOUNTS.owner.userId, DEV_ACCOUNTS.owner.workspaceId, DEV_ACCOUNTS.owner.label, req, res)
);
router.get("/api/auth/dev-login-anvil", (req, res) =>
  devLoginById(DEV_ACCOUNTS.anvil.userId, DEV_ACCOUNTS.anvil.workspaceId, DEV_ACCOUNTS.anvil.label, req, res)
);
router.get("/api/auth/dev-login-root", (req, res) =>
  devLoginById(DEV_ACCOUNTS.root.userId, DEV_ACCOUNTS.root.workspaceId, DEV_ACCOUNTS.root.label, req, res)
);
router.get("/api/auth/dev-login-officer", (req, res) =>
  devLoginById(DEV_ACCOUNTS.officer.userId, DEV_ACCOUNTS.officer.workspaceId, DEV_ACCOUNTS.officer.label, req, res)
);
router.get("/api/auth/dev-login-supervisor", (req, res) =>
  devLoginById(DEV_ACCOUNTS.supervisor.userId, DEV_ACCOUNTS.supervisor.workspaceId, DEV_ACCOUNTS.supervisor.label, req, res)
);
router.get("/api/auth/dev-login-compliance", (req, res) =>
  devLoginById(DEV_ACCOUNTS.compliance.userId, DEV_ACCOUNTS.compliance.workspaceId, DEV_ACCOUNTS.compliance.label, req, res)
);

// ============================================================================
// Auth Status Check (for diagnostics/crawlers)
// ============================================================================

router.get("/api/auth/check", async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.json({ authenticated: false });
    }
    
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);
    
    if (!user) {
      return res.json({ authenticated: false });
    }
    
    res.json({ authenticated: true, userId: user.id });
  } catch (error) {
    log.error("[AuthCheck] Session validation error:", error);
    res.status(500).json({ authenticated: false, error: 'Check failed' });
  }
});

// ============================================================================
// Logout
// ============================================================================

router.post("/api/auth/logout", async (req, res) => {
  // Invalidate auth_token in database if present
  if (req.cookies?.auth_token) {
    try {
      const { authService } = await import('../services/authService');
      await authService.logout(req.cookies.auth_token);
    } catch (e) {
      // Best-effort token invalidation
    }
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout failed" });
    }
    // Clear cookies with the same domain they were set with so the
    // browser actually removes them on the production custom domain.
    const inProd = isProduction();
    const domain = process.env.SESSION_COOKIE_DOMAIN
      || (inProd ? '.coaileague.com' : undefined);
    res.clearCookie("connect.sid", domain ? { path: '/', domain } : { path: '/' });
    res.clearCookie("auth_token", domain ? { path: '/', domain } : { path: '/' });
    res.json({ message: "Logout successful" });
  });
});

// ============================================================================
// Get Current User
// ============================================================================

router.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
  const sessionUser = req.user as User; // Get user ID from session

  // ── CIRCUIT-BREAKER FAST-PATH ──────────────────────────────────────────────
  // When the DB circuit is open (startup lag / pool exhaustion), avoid hitting
  // the DB at all. Return a minimal auth response based on session data so the
  // frontend stays logged-in instead of getting a 500 and being force-signed-out.
  // The _dbDegraded flag triggers an amber degraded-mode banner in the UI.
  if (isDbCircuitOpen() || (sessionUser as any)._dbDegraded) {
    const wsId = sessionUser.currentWorkspaceId || (req as any).workspaceId || null;
    log.warn(`[Auth /me] DB circuit open — returning session-based fallback for user ${sessionUser.id}`);
    return res.json({
      user: {
        id: sessionUser.id,
        email: sessionUser.email || '',
        firstName: sessionUser.firstName ?? null,
        lastName: sessionUser.lastName ?? null,
        username: (sessionUser as any).username ?? null,
        role: sessionUser.role ?? 'employee',
        currentWorkspaceId: wsId,
        workspaceRole: null,
        employeeId: null,
        platformRole: null,
      },
      _dbDegraded: true,
    });
  }
  // ── END CIRCUIT-BREAKER FAST-PATH ─────────────────────────────────────────

  // PERFORMANCE OPTIMIZATION: Run all independent queries in parallel
  // This reduces latency from 5-6 sequential queries (~1000ms) to parallel execution (~200ms)
  
  // First, fetch fresh user data (required for subsequent logic)
  const [freshUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!freshUser) {
    return res.status(401).json({ message: "User not found" });
  }
  
  // DYNAMIC WORKSPACE RESOLUTION: If currentWorkspaceId not set, find owned workspace
  // This handles cases where OIDC auth creates users without workspace context
  let effectiveWorkspaceId = freshUser.currentWorkspaceId;
  let workspaceWasDynamicallyResolved = false;
  if (!effectiveWorkspaceId) {
    const ownedWorkspace = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, freshUser.id))
      .limit(1);
    if (ownedWorkspace.length > 0) {
      effectiveWorkspaceId = ownedWorkspace[0].id;
      workspaceWasDynamicallyResolved = true;
      
      // PERSIST: Update user record with dynamically resolved workspace
      // This ensures subsequent requests have proper context
      await db.update(users)
        .set({ currentWorkspaceId: effectiveWorkspaceId, updatedAt: new Date() })
        .where(eq(users.id, freshUser.id));
      log.info(`[Auth] Dynamically linked user ${freshUser.id} to owned workspace ${effectiveWorkspaceId}`);
    }
  }
  
  // Run platform roles, workspace ownership, and employee record queries in PARALLEL
  const [userPlatformRoles, ownedWorkspaceResult, employeeRecord] = await Promise.all([
    // GATEKEEPER: Check for platform role (root_admin, sysop, compliance_officer)
    db.select().from(platformRoles).where(eq(platformRoles.userId, freshUser.id)),
    
    // Check if user is the workspace owner (using effectiveWorkspaceId for dynamic resolution)
    effectiveWorkspaceId 
      ? db.select().from(workspaces).where(and(
          eq(workspaces.id, effectiveWorkspaceId),
          eq(workspaces.ownerId, freshUser.id)
        )).limit(1)
      : Promise.resolve([]),
    
    // Get employee record for additional details
    effectiveWorkspaceId
      ? db.query.employees.findFirst({
          where: and(
            eq(employees.userId, freshUser.id),
            eq(employees.workspaceId, effectiveWorkspaceId)
          ),
        })
      : Promise.resolve(null),
  ]);
  
  const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
  
  // RBAC: Determine workspace role from parallel query results (using effectiveWorkspaceId)
  let workspaceRole: string | null = null;
  let employeeId: string | null = null;
  let organizationalTitle: string | null = null;
  let currentEmployeeRecord = employeeRecord;
  
  if (effectiveWorkspaceId) {
    const ownedWorkspace = ownedWorkspaceResult[0];
    if (ownedWorkspace) {
      workspaceRole = 'org_owner';
      
      // AUTO-CREATE EMPLOYEE RECORD: If owner has no employee record, create one
      // This ensures org_owners always have proper workspace membership
      if (!employeeRecord && workspaceWasDynamicallyResolved) {
        try {
          const [newEmployee] = await db.insert(employees).values({
            userId: freshUser.id,
            workspaceId: effectiveWorkspaceId,
            workspaceRole: 'org_owner',
            firstName: freshUser.firstName || 'Owner',
            lastName: freshUser.lastName || '',
            email: freshUser.email || `${freshUser.id}@coaileague.internal`,
          }).returning();
          currentEmployeeRecord = newEmployee;
          log.info(`[Auth] Created employee record for org_owner ${freshUser.id}`);
        } catch (createError: any) {
          log.warn(`[Auth] Failed to create employee record for org_owner:`, createError?.message || createError);
        }
      }
    }
    
    if (currentEmployeeRecord) {
      employeeId = currentEmployeeRecord.id;
      organizationalTitle = (currentEmployeeRecord as any).organizationalTitle || null;
      // Use employee workspaceRole only if not already set as owner
      if (!workspaceRole) {
        workspaceRole = currentEmployeeRecord.workspaceRole || 'staff';
      }
    }
  }
  
  // PAYMENT ENFORCEMENT: Check workspace subscription status
  // Platform staff bypass this check
  // Use effectiveWorkspaceId for proper context
  const workspaceId = effectiveWorkspaceId;
  if (workspaceId && !hasPlatformWideAccess(activePlatformRole?.role)) {
    const paymentResult = await checkWorkspacePaymentStatus(freshUser.id, workspaceId);
    
    if (!paymentResult.allowed) {
      // Different responses for org owners vs end users
      if (paymentResult.isOwner) {
        // Log to Trinity Orchestration for audit trail
        try {
          await db.insert(systemAuditLogs).values({
        action: 'payment_block_owner',
        entityType: 'workspace',
        entityId: paymentResult.workspaceId,
        userId: freshUser.id,
        workspaceId: paymentResult.workspaceId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: { category: 'billing', severity: 'warning', details: { reason: paymentResult.reason, workspaceName: paymentResult.workspaceName, blockedAt: new Date().toISOString() } },
      });
          
          // Emit event for Trinity AI monitoring
          platformEventBus.publish({
            type: 'subscription_payment_blocked',
            category: 'automation',
            title: 'Subscription Payment Blocked',
            description: `Login blocked for workspace '${paymentResult.workspaceName}' — ${paymentResult.reason}`,
            workspaceId: paymentResult.workspaceId,
            metadata: { userId: freshUser.id, workspaceName: paymentResult.workspaceName, reason: paymentResult.reason, isOwner: true },
          }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
        } catch (logError) {
          log.error('[PaymentEnforcement] Failed to log audit:', logError);
        }
        
        // Org owner: Return user data WITH payment required flag
        // This keeps them authenticated but shows the payment modal
        return res.status(402).json({
          code: 'PAYMENT_REQUIRED',
          message: 'Your organization subscription is inactive. Please update your payment to continue.',
          reason: paymentResult.reason,
          workspaceId: paymentResult.workspaceId,
          workspaceName: paymentResult.workspaceName,
          redirectTo: '/org-management',
          isOwner: true,
          // Include actual user data so app doesn't treat as logged out
          user: {
            id: freshUser.id,
            email: freshUser.email,
            firstName: freshUser.firstName ?? "",
            lastName: freshUser.lastName ?? "",
            role: freshUser.role ?? "user",
            emailVerified: freshUser.emailVerified ?? false,
            currentWorkspaceId: freshUser.currentWorkspaceId ?? null,
            platformRole: activePlatformRole?.role || null,
            workspaceRole: workspaceRole,
            employeeId: employeeId,
            organizationalTitle: organizationalTitle,
          },
        });
      }
      
      // End user: org is inactive — return user data so frontend can show a proper
      // "org unavailable" screen instead of silently kicking them to login
      return res.status(404).json({
        code: 'ORGANIZATION_INACTIVE',
        message: 'This organization is currently unavailable.',
        reason: paymentResult.reason,
        forceLogout: false,
        redirectTo: '/org-unavailable',
        isOwner: paymentResult.isOwner ?? false,
        workspaceName: paymentResult.workspaceName,
        // Include basic user info so the frontend can show a personalised message
        user: {
          id: freshUser.id,
          email: freshUser.email,
          firstName: freshUser.firstName ?? "",
          lastName: freshUser.lastName ?? "",
          role: freshUser.role ?? "user",
          emailVerified: freshUser.emailVerified ?? false,
          currentWorkspaceId: freshUser.currentWorkspaceId ?? null,
          platformRole: activePlatformRole?.role || null,
          workspaceRole: workspaceRole,
          employeeId: employeeId,
        },
      });
    }
  }
  
  // Ensure session has latest workspace context cached
  if (effectiveWorkspaceId && !req.session?.workspaceId) {
    const { resolveAndCacheWorkspaceContext, saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
    await resolveAndCacheWorkspaceContext(req, freshUser.id, effectiveWorkspaceId);
    await saveSessionAsync(req);
  }

  res.json({
    user: {
      id: freshUser.id,
      email: freshUser.email,
      firstName: freshUser.firstName ?? "",
      lastName: freshUser.lastName ?? "",
      role: freshUser.role ?? "user",
      emailVerified: freshUser.emailVerified ?? false,
      pendingEmail: freshUser.pendingEmail ?? null,
      currentWorkspaceId: effectiveWorkspaceId ?? null,
      platformRole: activePlatformRole?.role || null,
      workspaceRole: workspaceRole,
      employeeId: employeeId,
      organizationalTitle: organizationalTitle,
      simpleMode: freshUser.simpleMode ?? false,
      preferredLanguage: freshUser.preferredLanguage ?? "en",
      profileImageUrl: freshUser.profileImageUrl ?? null,
      userNumber: freshUser.userNumber ?? null,
      phone: freshUser.phone ?? null,
      sessionContext: {
        workspaceId: req.session?.workspaceId || effectiveWorkspaceId || null,
        workspaceRole: req.session?.workspaceRole || workspaceRole || null,
        employeeId: req.session?.employeeId || employeeId || null,
        workspaceName: req.session?.workspaceName || null,
      },
    },
  });
  } catch (error: any) {
    log.error('[Auth] /api/auth/me error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================================
// Update User Display Preferences
// Supports workspace-aware view modes:
// - User-level simpleMode (global fallback)
// - Employee-level viewModePreference (per-workspace override)
// - Workspace-level forceSimpleMode (org admin override)
// ============================================================================

const preferencesSchema = z.object({
  simpleMode: z.boolean().optional(),
  viewModePreference: z.enum(['inherit', 'simple', 'pro']).optional(),
});

router.patch("/api/user/preferences", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.user as User;
    const data = preferencesSchema.parse(req.body);
    
    // Get current workspace to update employee-level preference
    const workspaceId = req.workspaceId || (sessionUser as any).workspaceId || sessionUser.currentWorkspaceId;
    
    // If viewModePreference is set and we have a workspace, update employee record
    if (data.viewModePreference !== undefined && workspaceId) {
      const [employee] = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, sessionUser.id),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (employee) {
        await db
          .update(employees)
          .set({ 
            viewModePreference: data.viewModePreference,
            viewModeUpdatedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(employees.id, employee.id));
      }
    }
    
    // Update user-level simpleMode (global fallback)
    const userUpdates: Record<string, any> = {};
    if (data.simpleMode !== undefined) {
      userUpdates.simpleMode = data.simpleMode;
    }
    
    if (Object.keys(userUpdates).length > 0) {
      await db
        .update(users)
        .set(userUpdates)
        .where(eq(users.id, sessionUser.id));
    }
    
    res.json({ 
      message: "Preferences updated", 
      simpleMode: data.simpleMode,
      viewModePreference: data.viewModePreference
    });
  } catch (error) {
    log.error("Preferences update error:", error);
    res.status(500).json({ message: "Failed to update preferences" });
  }
});

// ============================================================================
// Get Effective View Mode for Current Session
// Resolves: Employee override → Workspace force → Workspace default → User fallback
// ============================================================================

router.get("/api/user/view-mode", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.user as User;
    const workspaceId = req.workspaceId || (sessionUser as any).workspaceId || sessionUser.currentWorkspaceId;
    
    let effectiveMode: 'simple' | 'pro' = sessionUser.simpleMode ? 'simple' : 'pro';
    let source = 'user_fallback';
    
    if (workspaceId) {
      // Get workspace settings
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      if (workspace) {
        // Check if org forces simple mode
        if (workspace.forceSimpleMode) {
          effectiveMode = 'simple';
          source = 'workspace_forced';
        } else {
          // Check employee-level preference
          const [employee] = await db
            .select()
            .from(employees)
            .where(and(
              eq(employees.userId, sessionUser.id),
              eq(employees.workspaceId, workspaceId)
            ))
            .limit(1);
          
          if (employee?.viewModePreference && employee.viewModePreference !== 'inherit') {
            effectiveMode = employee.viewModePreference as 'simple' | 'pro';
            source = 'employee_preference';
          } else if (workspace.defaultViewMode && workspace.defaultViewMode !== 'auto') {
            effectiveMode = workspace.defaultViewMode as 'simple' | 'pro';
            source = 'workspace_default';
          }
        }
      }
    }
    
    res.json({
      effectiveMode,
      source,
      isSimpleMode: effectiveMode === 'simple',
      workspaceId,
    });
  } catch (error) {
    log.error("View mode error:", error);
    res.status(500).json({ message: "Failed to get view mode" });
  }
});

// ============================================================================
// Password Reset Request
// ============================================================================

const resetRequestSchema = z.object({
  email: z.string().email(),
});

// M02: Global tenant-based rate limiter does NOT apply to pre-auth routes.
// This per-IP limiter prevents email-flood abuse on the password reset endpoint.
router.post("/api/auth/reset-password-request", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!_checkIpRateLimit(ip, 'reset-password-request', 5, 15 * 60 * 1000)) {
      return res.status(429).json({ message: "Too many password reset requests. Please wait 15 minutes before trying again." });
    }

    const data = resetRequestSchema.parse(req.body);

    const result = await createPasswordResetToken(data.email);

    if (!result.success) {
      log.warn(`[Auth] Password reset rejected for ${data.email}: ${result.code}`);
      return res.status(400).json({ success: false, error: result.code, message: result.message });
    }

    if (result.token && result.user) {
      log.info(`[Auth] Password reset: user found for ${data.email}, attempting email delivery`);
      try {
        const emailResult = await emailService.sendPasswordResetEmail( // infra
          result.user.id,
          data.email,
          result.token,
          result.user.firstName || undefined
        );
        if (!emailResult?.success) {
          log.error(`[Auth] Password reset email delivery failed for ${data.email}: ${emailResult?.error}`);
          return res.status(500).json({ success: false, error: "email_failed", message: "Could not send reset email. Try again later." });
        }
        log.info(`[Auth] Password reset email sent OK for ${data.email}`);
      } catch (emailError: unknown) {
        log.error(`[Auth] Password reset email delivery error:`, (emailError as any)?.message || emailError);
        return res.status(500).json({ success: false, error: "email_failed", message: "Could not send reset email. Try again later." });
      }
    }

    res.json({
      success: true,
      message: "Reset link sent to your email",
    });
  } catch (error) {
    log.error("Reset request error:", error);
    res.status(500).json({ message: "Reset request failed" });
  }
});

// ============================================================================
// Password Reset Confirm
// ============================================================================

const resetConfirmSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(72, "Password must not exceed 72 characters"),
});

router.post("/api/auth/reset-password-confirm", async (req, res) => {
  try {
    const data = resetConfirmSchema.parse(req.body);

    const result = await resetPassword(data.token, data.password);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    log.info('[Security] Password reset completed', {
      userId: result.userId,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
      event: 'password_reset_confirmed',
    });

    res.json({ message: "Password reset successful" });
  } catch (error) {
    log.error("Reset confirm error:", error);
    res.status(500).json({ message: "Password reset failed" });
  }
});

// ============================================================================
// Change Password (authenticated)
// ============================================================================

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(72, "Password must not exceed 72 characters"),
});

router.post("/api/auth/change-password", requireAuth, mutationLimiter, async (req, res) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    const user = req.user as User;

    // Verify current password
    if (!user.passwordHash || user.passwordHash === null) {
      return res.status(400).json({ message: "No password set" });
    }

    const isValid = await verifyPassword(
      data.currentPassword,
      user.passwordHash
    );

    if (!isValid) {
      return res.status(401).json({ message: "Current password incorrect" });
    }

    // Validate new password
    const validation = validatePassword(data.newPassword);
    if (!validation.isValid) {
      return res.status(400).json({
        message: "New password does not meet requirements",
        errors: validation.errors,
      });
    }

    // Update password
    const newHash = await hashPassword(data.newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // D1-GAP-FIX: Invalidate ALL active sessions for this user after password change.
    // A password change must revoke all existing sessions so no stale session can
    // continue to authenticate with the old credential.
    try {
      const { authService: _authSvc } = await import('../services/authService');
      await _authSvc.logoutAllSessions(user.id);
    } catch (sessionErr: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error('[AuthCoreRoutes] Failed to invalidate sessions after password change:', sessionErr.message);
    }
    // Destroy the current session last (after persisting the password update)
    req.session.destroy(() => {});
    res.clearCookie('connect.sid');

    res.json({ message: "Password changed successfully. Please log in again." });
  } catch (error) {
    log.error("Change password error:", error);
    res.status(500).json({ message: "Password change failed" });
  }
});

// ============================================================================
// Demo Login (passwordless access to demo workspace)
// ============================================================================

router.get("/api/demo-login", async (req, res) => {
  // Demo login is disabled in production to prevent unauthorized access
  if (isProduction()) {
    return res.status(404).json({ message: 'Not found' });
  }
  try {
    const crypto = await import('crypto');
    const { DEMO_USER_ID } = await import('../seed-demo');
    const { authSessions } = await import('@shared/schema');
    const demoUser = await db.select().from(users).where(eq(users.id, DEMO_USER_ID));

    if (demoUser.length === 0) {
      const isFetch = req.headers.accept?.includes('application/json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
      if (isFetch) return res.status(404).json({ success: false, message: 'Demo workspace not available' });
      return res.redirect('/?error=demo_unavailable');
    }

    const user = demoUser[0];

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(authSessions).values({
      userId: user.id,
      sessionToken: sessionHash,
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null,
      expiresAt,
      isValid: true,
    });

    res.cookie('auth_token', sessionToken, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    req.session.userId = user.id;
    req.session.passport = {
      user: {
        claims: {
          sub: user.id,
          email: user.email,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          first_name: user.firstName,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          last_name: user.lastName,
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
      },
    };

    const { resolveAndCacheWorkspaceContext, saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
    if (user.currentWorkspaceId) {
      await resolveAndCacheWorkspaceContext(req, user.id, user.currentWorkspaceId);
    }
    await saveSessionAsync(req);

    const isFetch = req.headers.accept?.includes('application/json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isFetch) {
      return res.json({
        success: true,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          currentWorkspaceId: user.currentWorkspaceId,
        },
      });
    }
    res.redirect('/dashboard');
  } catch (error) {
    log.error('Demo login error:', error);
    const isFetch = req.headers.accept?.includes('application/json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isFetch) return res.status(500).json({ success: false, message: 'Demo login failed' });
    res.redirect('/?error=demo_failed');
  }
});

// ============================================================================
// Language Preference — Phase 32 Bilingual Support
// ============================================================================

router.get("/api/auth/language-preference", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const [user] = await db.select({ preferredLanguage: users.preferredLanguage })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ preferredLanguage: user.preferredLanguage ?? "en" });
  } catch (err) {
    log.error("[LanguagePref] GET error:", err);
    res.status(500).json({ message: "Failed to fetch language preference" });
  }
});

router.patch("/api/auth/language-preference", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { preferredLanguage } = req.body;
    if (!["en", "es"].includes(preferredLanguage)) {
      return res.status(400).json({ message: "Invalid language. Supported: en, es" });
    }
    await db.update(users).set({ preferredLanguage, updatedAt: new Date() }).where(eq(users.id, userId));
    // Update session so downstream reads work immediately
    (req as any).session.preferredLanguage = preferredLanguage;
    res.json({ preferredLanguage, message: "Language preference updated" });
  } catch (err) {
    log.error("[LanguagePref] PATCH error:", err);
    res.status(500).json({ message: "Failed to update language preference" });
  }
});

// ============================================================================
// Platform Capabilities (public — no auth required)
// ============================================================================

router.get("/api/auth/capabilities", (_req, res) => {
  const devLoginEnabled = !isProduction();
  res.json({ devLoginEnabled });
});

// ============================================================================
// SMS OTP — Support / Platform Role Second Factor
//
// Two-step flow after a successful password check for platform roles:
//   1. POST /api/auth/sms-otp/request  — generate + send PIN (or resend)
//   2. POST /api/auth/sms-otp/verify   — verify PIN, complete session
//
// Both endpoints accept `pendingSmsPinToken` (same encrypted token that
// carries `userId` through the login pause, issued by the login route).
// Rate-limited to 3 send-attempts per 10 min per IP.
// ============================================================================

const smsPinRequestSchema = z.object({
  pendingSmsPinToken: z.string(),
});

router.post("/api/auth/sms-otp/request", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!_checkIpRateLimit(ip, 'sms-otp-request', 3, 10 * 60 * 1000)) {
      return res.status(429).json({ message: "Too many PIN requests. Please wait a few minutes." });
    }

    const { pendingSmsPinToken } = smsPinRequestSchema.parse(req.body);

    let userId: string;
    try {
      userId = validatePendingMfaToken(pendingSmsPinToken);
    } catch {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    const [user] = await db.select({ id: users.id, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(401).json({ message: "User not found." });
    if (!user.phone) {
      return res.status(400).json({ message: "No phone number on file. Please add a phone number in your account settings." });
    }

    const result = await generateAndSendSupportOtp(userId, user.phone);
    if (!result.success) {
      if (result.notConfigured) {
        return res.status(503).json({ message: "SMS service not configured. Contact platform administrator." });
      }
      return res.status(500).json({ message: "Failed to send PIN. Please try again." });
    }

    const maskedPhone = user.phone.replace(
      /(\+?\d{1,3})(\d+)(\d{4})$/,
      (_: string, cc: string, mid: string, last4: string) => `${cc}${'*'.repeat(mid.length)}${last4}`
    );

    return res.json({
      success: true,
      message: `PIN sent to ${maskedPhone}. Valid until midnight UTC.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request", errors: error.errors });
    }
    log.error("[SMS OTP Request] error:", error);
    return res.status(500).json({ message: "Failed to send PIN" });
  }
});

const smsPinVerifySchema = z.object({
  pendingSmsPinToken: z.string(),
  pin: z.string().length(6).regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
});

router.post("/api/auth/sms-otp/verify", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!_checkIpRateLimit(ip, 'sms-otp-verify', 10, 15 * 60 * 1000)) {
      return res.status(429).json({ message: "Too many verification attempts. Please wait 15 minutes." });
    }

    const data = smsPinVerifySchema.parse(req.body);

    let userId: string;
    try {
      userId = validatePendingMfaToken(data.pendingSmsPinToken);
    } catch {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    const isValid = await verifySupportOtp(userId, data.pin);
    if (!isValid) {
      recordIpAuthFailure(ip);
      return res.status(401).json({ message: "Invalid or expired PIN. Request a new one if needed." });
    }

    // PIN verified — complete the login session
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(401).json({ message: "User not found." });

    const { checkAccountLocked: _checkLock, recordSuccessfulLogin: _recordSuccessful } = await import('../auth');
    const lockStatus = await _checkLock(userId);
    if (lockStatus.locked) return res.status(403).json({ message: lockStatus.message });
    await _recordSuccessful(userId);

    const ipAddr = ip;
    const ua = req.get('user-agent') || '';

    // Session fixation protection
    const priorSessionData = { ...req.session };
    delete (priorSessionData as any).cookie;
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    Object.assign(req.session, priorSessionData);
    req.session.userId = userId;

    // Issue auth_token cookie
    try {
      const { authService } = await import('../services/authService');
      const sessionResult = await authService.createSessionToken(userId, ipAddr, ua);
      if (sessionResult.sessionToken) {
        res.cookie('auth_token', sessionResult.sessionToken, authCookieOptions());
      }
    } catch (tokenErr) {
      log.warn('[SMS OTP Verify] Failed to create auth_token cookie:', tokenErr);
    }

    // Resolve workspace
    let workspaceId = user.currentWorkspaceId;
    if (!workspaceId) {
      const [emp] = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
      if (emp) {
        workspaceId = emp.workspaceId;
        await db.update(users).set({ currentWorkspaceId: workspaceId, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    }

    if (workspaceId) {
      const { resolveAndCacheWorkspaceContext } = await import('../services/session/sessionWorkspaceService');
      await resolveAndCacheWorkspaceContext(req, userId, workspaceId);
    }
    const { saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
    await saveSessionAsync(req);

    await registerSession(userId, req.session.id, ipAddr, ua);

    const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);

    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled ?? false,
        platformRole: activePlatformRole?.role || null,
        currentWorkspaceId: workspaceId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    log.error("[SMS OTP Verify] error:", error);
    return res.status(500).json({ message: "SMS PIN verification failed" });
  }
});

export default router;
