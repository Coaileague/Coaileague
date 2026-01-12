// Universal authentication system - portable to any platform
// Secure password-based auth with bcrypt, rate limiting, and session management

import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import "./types"; // Import session type extensions
import { trinityOrchestration } from "./services/trinity/trinityOrchestrationAdapter";

// ============================================================================
// Password Security
// ============================================================================

const SALT_ROUNDS = 12; // High security, slower hashing
const MAX_LOGIN_ATTEMPTS = 5;
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

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  // Detect if running on Replit (always HTTPS) or locally
  const isReplit = !!process.env.REPLIT_DOMAINS || !!process.env.REPL_ID;
  const isProduction = process.env.NODE_ENV === "production";
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Replit always uses HTTPS, so secure should be true when on Replit
      secure: isReplit || isProduction,
      maxAge: sessionTtl,
      sameSite: "lax",
    },
    // Trust proxy for Replit's reverse proxy
    proxy: isReplit,
  } as any);
}

// ============================================================================
// Authentication Middleware
// ============================================================================

export const requireAuth: RequestHandler = async (req, res, next) => {
  const endpoint = req.path;
  const method = req.method;
  const ipAddress = req.ip || req.socket?.remoteAddress;

  if (!req.session?.userId) {
    trinityOrchestration.auth.requestUnauthenticated(endpoint, method, 'no_session', ipAddress);
    return res.status(401).json({ message: "Unauthorized - Please login" });
  }

  // Verify user still exists
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.session.userId))
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
  next();
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
          console.log(`[Auth] Revoked elevation ${elevationContext.elevationId} due to locked account`);
        }
        return res.status(403).json({ message: lockStatus.message });
      }

      req.user = user;
      (req as any).authContext = {
        isSupportElevated: true,
        elevationId: elevationContext.elevationId,
        platformRole: elevationContext.platformRole,
        actionsExecuted: elevationContext.actionsExecuted
      };
      return next();
    }
  } catch (error) {
    // Fall through to normal auth if elevation check fails
    console.warn('[Auth] Elevation check failed, using standard auth:', error);
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
  (req as any).authContext = { isSupportElevated: false };
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

  if (!user || user.role !== "admin") {
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

  if (!user || !["admin", "support_staff"].includes(user.role || "")) {
    return res
      .status(403)
      .json({ message: "Support staff access required" });
  }

  req.user = user;
  next();
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
): Promise<{ success: boolean; token?: string; user?: typeof users.$inferSelect; message?: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Don't reveal if email exists
    return { success: true, message: "If email exists, reset link sent" };
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
): Promise<{ success: boolean; message?: string }> {
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

  return { success: true };
}

// ============================================================================
// Setup Authentication
// ============================================================================

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}
