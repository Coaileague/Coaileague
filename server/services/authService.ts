import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db";
import { users, authTokens, authSessions, employees, clients } from "@shared/schema";
import { eq, and, gt, lt, isNull, sql } from "drizzle-orm";
import { getAppBaseUrl } from "../utils/getAppBaseUrl";
import { EMAIL, AUTH, PLATFORM } from '../config/platformConfig';
import { getUncachableResendClient } from './emailCore';
import { createLogger } from '../lib/logger';
const log = createLogger('authService');


const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = AUTH.maxLoginAttempts;
const LOCKOUT_DURATION_MINUTES = Math.round(AUTH.lockoutDurationMs / 60000);
const SESSION_DURATION_DAYS = Math.round(AUTH.sessionTtlMs / (24 * 60 * 60 * 1000));
const MAGIC_LINK_EXPIRY_MINUTES = 15;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const EMAIL_VERIFY_EXPIRY_HOURS = 24;

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    emailVerified: boolean;
    authProvider: string | null;
  };
  sessionToken?: string;
  error?: string;
  code?: string;
}

export interface TokenResult {
  success: boolean;
  token?: string;
  error?: string;
}

export class AuthService {
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private getBaseUrl(): string {
    return getAppBaseUrl();
  }

  async createSessionToken(userId: string, ipAddress?: string, userAgent?: string): Promise<{ sessionToken: string }> {
    const sessionToken = this.generateSecureToken();
    const sessionHash = this.hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(authSessions).values({
      userId,
      sessionToken: sessionHash,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
      isValid: true,
    });

    return { sessionToken };
  }

  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<AuthResult> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        return { success: false, error: "Email already registered", code: "EMAIL_EXISTS" };
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const verificationToken = this.generateSecureToken();
      const verificationExpiry = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_HOURS * 60 * 60 * 1000);

      const [newUser] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash,
          firstName: firstName || null,
          lastName: lastName || null,
          authProvider: "email",
          emailVerified: false,
          verificationToken: this.hashToken(verificationToken),
          verificationTokenExpiry: verificationExpiry,
          createdAt: new Date(),
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerified: users.emailVerified,
          authProvider: users.authProvider,
        });

      await this.sendVerificationEmail(normalizedEmail, verificationToken);

      return {
        success: true,
        user: {
          ...newUser,
          emailVerified: newUser.emailVerified ?? false,
        },
      };
    } catch (error: unknown) {
      log.error("[AuthService] Registration error:", error);
      return { success: false, error: "Registration failed", code: "REGISTRATION_ERROR" };
    }
  }

  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResult> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!user) {
        // Perform a dummy bcrypt compare to equalize response time and prevent
        // user enumeration via timing side-channel attacks.
        await bcrypt.compare(password, '$2b$12$dummyhashfortimingequalizationXXXXXXXXXXXXXXXXXXXXXXX');
        return { success: false, error: "Invalid email or password", code: "INVALID_CREDENTIALS" };
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        return {
          success: false,
          error: `Account locked. Try again in ${remainingMinutes} minutes.`,
          code: "ACCOUNT_LOCKED",
        };
      }

      if (!user.passwordHash) {
        // Legacy `authProvider === "replit_legacy"` accounts are now
        // handled by the same code path as any other OAuth-only account:
        // they must set a password via the forgot-password flow.
        return { success: false, error: "Password not set", code: "NO_PASSWORD" };
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);

      if (!isValid) {
        const newAttempts = (user.loginAttempts || 0) + 1;
        const updates: Record<string, any> = { loginAttempts: newAttempts };

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
          updates.loginAttempts = 0;
        }

        await db.update(users).set(updates).where(eq(users.id, user.id));

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          return {
            success: false,
            error: `Account locked for ${LOCKOUT_DURATION_MINUTES} minutes due to too many failed attempts`,
            code: "ACCOUNT_LOCKED",
          };
        }

        return {
          success: false,
          error: "Invalid email or password",
          code: "INVALID_CREDENTIALS",
        };
      }

      await db
        .update(users)
        .set({ loginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));

      const sessionToken = this.generateSecureToken();
      const sessionHash = this.hashToken(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(authSessions).values({
        userId: user.id,
        sessionToken: sessionHash,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
        isValid: true,
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified ?? false,
          authProvider: user.authProvider,
        },
        sessionToken,
      };
    } catch (error: unknown) {
      log.error("[AuthService] Login error:", error);
      return { success: false, error: "Login failed", code: "LOGIN_ERROR" };
    }
  }

  async validateSession(sessionToken: string): Promise<AuthResult> {
    try {
      const sessionHash = this.hashToken(sessionToken);

      const [session] = await db
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.sessionToken, sessionHash),
            eq(authSessions.isValid, true),
            gt(authSessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!session) {
        return { success: false, error: "Invalid or expired session", code: "INVALID_SESSION" };
      }

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerified: users.emailVerified,
          authProvider: users.authProvider,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (!user) {
        return { success: false, error: "User not found", code: "USER_NOT_FOUND" };
      }

      await db
        .update(authSessions)
        .set({ lastActivityAt: new Date() })
        .where(eq(authSessions.id, session.id));

      return {
        success: true,
        user: {
          ...user,
          emailVerified: user.emailVerified ?? false,
        },
      };
    } catch (error: unknown) {
      log.error("[AuthService] Session validation error:", error);
      return { success: false, error: "Session validation failed", code: "VALIDATION_ERROR" };
    }
  }

  async logout(sessionToken: string): Promise<{ success: boolean }> {
    try {
      const sessionHash = this.hashToken(sessionToken);
      await db
        .update(authSessions)
        .set({ isValid: false })
        .where(eq(authSessions.sessionToken, sessionHash));
      return { success: true };
    } catch (error: unknown) {
      log.error("[AuthService] Logout error:", error);
      return { success: false };
    }
  }

  async logoutAllSessions(userId: string): Promise<{ success: boolean }> {
    try {
      await db
        .update(authSessions)
        .set({ isValid: false })
        .where(eq(authSessions.userId, userId));
      return { success: true };
    } catch (error: unknown) {
      log.error("[AuthService] Logout all error:", error);
      return { success: false };
    }
  }

  async requestMagicLink(email: string): Promise<TokenResult> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!user) {
        return { success: true };
      }

      const token = this.generateSecureToken();
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

      await db.insert(authTokens).values({
        userId: user.id,
        tokenHash,
        tokenType: "magic_link",
        expiresAt,
      });

      await this.sendMagicLinkEmail(user.email, token);

      return { success: true };
    } catch (error: unknown) {
      log.error("[AuthService] Magic link error:", error);
      return { success: false, error: "Failed to send magic link" };
    }
  }

  async verifyMagicLink(
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResult> {
    try {
      const tokenHash = this.hashToken(token);

      const [authToken] = await db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, tokenHash),
            eq(authTokens.tokenType, "magic_link"),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!authToken) {
        return { success: false, error: "Invalid or expired magic link", code: "INVALID_TOKEN" };
      }

      await db
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(eq(authTokens.id, authToken.id));

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerified: users.emailVerified,
          authProvider: users.authProvider,
        })
        .from(users)
        .where(eq(users.id, authToken.userId))
        .limit(1);

      if (!user) {
        return { success: false, error: "User not found", code: "USER_NOT_FOUND" };
      }

      if (!user.emailVerified) {
        await db
          .update(users)
          .set({ emailVerified: true, emailVerifiedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      const sessionToken = this.generateSecureToken();
      const sessionHash = this.hashToken(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(authSessions).values({
        userId: user.id,
        sessionToken: sessionHash,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
        isValid: true,
      });

      return {
        success: true,
        user: {
          ...user,
          emailVerified: true,
        },
        sessionToken,
      };
    } catch (error: unknown) {
      log.error("[AuthService] Magic link verification error:", error);
      return { success: false, error: "Verification failed", code: "VERIFICATION_ERROR" };
    }
  }

  async requestPasswordReset(email: string): Promise<TokenResult> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      const [user] = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!user) {
        return { success: true };
      }

      const token = this.generateSecureToken();
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

      await db.insert(authTokens).values({
        userId: user.id,
        tokenHash,
        tokenType: "password_reset",
        expiresAt,
      });

      const { emailService } = await import('./emailService');
      await emailService.sendPasswordResetEmail(user.id, user.email, token, user.firstName ?? undefined);

      return { success: true };
    } catch (error: unknown) {
      log.error("[AuthService] Password reset request error:", error);
      return { success: false, error: "Failed to send reset email" };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    try {
      const tokenHash = this.hashToken(token);

      const [authToken] = await db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, tokenHash),
            eq(authTokens.tokenType, "password_reset"),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!authToken) {
        return { success: false, error: "Invalid or expired reset link", code: "INVALID_TOKEN" };
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await db.transaction(async (tx) => {
        await tx
          .update(authTokens)
          .set({ usedAt: new Date() })
          .where(eq(authTokens.id, authToken.id));

        await tx
          .update(users)
          .set({
            passwordHash,
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: new Date(),
            lockedUntil: null,
            loginAttempts: 0,
          })
          .where(eq(users.id, authToken.userId));

        // SECURITY: Invalidate ALL active sessions for this user on password reset
        await tx
          .update(authSessions)
          .set({ isValid: false })
          .where(eq(authSessions.userId, authToken.userId));
      });

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerified: users.emailVerified,
          authProvider: users.authProvider,
        })
        .from(users)
        .where(eq(users.id, authToken.userId))
        .limit(1);

      return {
        success: true,
        user: user
          ? { ...user, emailVerified: user.emailVerified ?? false }
          : undefined,
      };
    } catch (error: unknown) {
      log.error("[AuthService] Password reset error:", error);
      return { success: false, error: "Password reset failed", code: "RESET_ERROR" };
    }
  }

  async verifyEmail(token: string): Promise<AuthResult> {
    try {
      const tokenHash = this.hashToken(token);

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerified: users.emailVerified,
          authProvider: users.authProvider,
          verificationToken: users.verificationToken,
          verificationTokenExpiry: users.verificationTokenExpiry,
        })
        .from(users)
        .where(eq(users.verificationToken, tokenHash))
        .limit(1);

      if (!user) {
        return { success: false, error: "Invalid verification link", code: "INVALID_TOKEN" };
      }

      if (user.verificationTokenExpiry && user.verificationTokenExpiry < new Date()) {
        return { success: false, error: "Verification link expired", code: "TOKEN_EXPIRED" };
      }

      await db
        .update(users)
        .set({
          emailVerified: true,
          emailVerifiedAt: new Date(),
          verificationToken: null,
          verificationTokenExpiry: null,
        })
        .where(eq(users.id, user.id));

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: true,
          authProvider: user.authProvider,
        },
      };
    } catch (error: unknown) {
      log.error("[AuthService] Email verification error:", error);
      return { success: false, error: "Verification failed", code: "VERIFICATION_ERROR" };
    }
  }

  async resendVerification(email: string): Promise<TokenResult> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      const [user] = await db
        .select({ id: users.id, email: users.email, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!user) {
        return { success: true };
      }

      if (user.emailVerified) {
        return { success: true };
      }

      const verificationToken = this.generateSecureToken();
      const verificationExpiry = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_HOURS * 60 * 60 * 1000);

      await db
        .update(users)
        .set({
          verificationToken: this.hashToken(verificationToken),
          verificationTokenExpiry: verificationExpiry,
        })
        .where(eq(users.id, user.id));

      await this.sendVerificationEmail(user.email, verificationToken);

      return { success: true };
    } catch (error: unknown) {
      log.error("[AuthService] Resend verification error:", error);
      return { success: false, error: "Failed to resend verification" };
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { success: false, error: "User not found", code: "USER_NOT_FOUND" };
      }

      if (!user.passwordHash) {
        return { success: false, error: "No password set", code: "NO_PASSWORD" };
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return { success: false, error: "Current password incorrect", code: "INVALID_PASSWORD" };
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, userId));

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified ?? false,
          authProvider: user.authProvider,
        },
      };
    } catch (error: unknown) {
      log.error("[AuthService] Change password error:", error);
      return { success: false, error: "Password change failed", code: "CHANGE_ERROR" };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transactional Auth Emails
  //
  // NOTE — NDS bypass (approved exception):
  // These methods send emails before a workspace exists or before the user
  // is authenticated (registration verification, password reset, magic link,
  // email change confirmation).  NDS requires workspace context and is used
  // for all post-auth tenant notifications.  These four methods are the only
  // legitimate callers of Resend outside NDS.  All branding is sourced from
  // PLATFORM.name (PLATFORM_DISPLAY_NAME env var) — never hardcoded.
  // ─────────────────────────────────────────────────────────────────────────

  private async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verifyUrl = `${this.getBaseUrl()}/auth/verify-email?token=${token}`;

    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `${PLATFORM.name} <${fromEmail}>`,
        to: [email],
        subject: `Verify your email - ${PLATFORM.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Verify Your Email</h2>
            <p>Click the button below to verify your email address:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Verify Email</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't create an account, ignore this email.</p>
          </div>
        `,
      });
      log.info(`[AuthService] Verification email sent to ${email}`);
    } catch (error) {
      log.error("[AuthService] Failed to send verification email:", error);
    }
  }

  private async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    const loginUrl = `${this.getBaseUrl()}/auth/magic-link?token=${token}`;

    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `${PLATFORM.name} <${fromEmail}>`,
        to: [email],
        subject: `Your login link - ${PLATFORM.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Login to ${PLATFORM.name}</h2>
            <p>Click the button below to log in:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Log In</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This link expires in 15 minutes.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this, ignore this email.</p>
          </div>
        `,
      });
      log.info(`[AuthService] Magic link email sent to ${email}`);
    } catch (error) {
      log.error("[AuthService] Failed to send magic link email:", error);
    }
  }

  async cleanupExpiredTokens(): Promise<void> {
    try {
      await db
        .delete(authTokens)
        .where(lt(authTokens.expiresAt, new Date()));
      
      await db
        .delete(authSessions)
        .where(lt(authSessions.expiresAt, new Date()));
    } catch (error) {
      log.error("[AuthService] Token cleanup error:", error);
    }
  }

  // ============================================================
  // Email Change Flow
  // ============================================================

  async initiateEmailChange(userId: string, newEmail: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Normalise
      const normalised = newEmail.trim().toLowerCase();

      // Reject if already in use by another user
      const [conflict] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalised))
        .limit(1);
      if (conflict && conflict.id !== userId) {
        return { success: false, error: 'That email address is already in use by another account.' };
      }
      if (conflict && conflict.id === userId) {
        return { success: false, error: 'That is already your current email address.' };
      }

      // SECURITY: Fetch the current email BEFORE writing pendingEmail so we can
      // notify the original address that a change was requested.
      const [currentUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const oldEmail = currentUser?.email;

      const rawToken = this.generateSecureToken();
      const tokenHash = this.hashToken(rawToken);
      const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

      await db
        .update(users)
        .set({
          pendingEmail: normalised,
          pendingEmailToken: tokenHash,
          pendingEmailExpiry: expiry,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      await this.sendEmailChangeVerification(normalised, rawToken); // infra

      // SECURITY: Alert the old email address so the account owner knows a
      // change was requested. Non-fatal — do not block the initiation.
      if (oldEmail && oldEmail !== normalised) {
        this.sendEmailChangeSecurityNotice(oldEmail, normalised).catch((err) =>
          log.warn('[AuthService] Failed to send email-change security notice to old address:', err)
        );
      }

      return { success: true };
    } catch (error) {
      log.error('[AuthService] initiateEmailChange error:', error);
      return { success: false, error: 'Failed to initiate email change. Please try again.' };
    }
  }

  async confirmEmailChange(rawToken: string): Promise<{ success: boolean; newEmail?: string; error?: string }> {
    try {
      const tokenHash = this.hashToken(rawToken);

      const [user] = await db
        .select({
          id: users.id,
          pendingEmail: users.pendingEmail,
          pendingEmailToken: users.pendingEmailToken,
          pendingEmailExpiry: users.pendingEmailExpiry,
        })
        .from(users)
        .where(eq(users.pendingEmailToken, tokenHash))
        .limit(1);

      if (!user) {
        return { success: false, error: 'Invalid or expired email change link.' };
      }

      if (!user.pendingEmail) {
        return { success: false, error: 'No pending email change found.' };
      }

      if (user.pendingEmailExpiry && new Date() > new Date(user.pendingEmailExpiry)) {
        // Clear expired token
        await db
          .update(users)
          .set({ pendingEmail: null, pendingEmailToken: null, pendingEmailExpiry: null, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        return { success: false, error: 'Email change link has expired. Please request a new one.' };
      }

      const newEmail = user.pendingEmail;

      // Swap email
      await db
        .update(users)
        .set({
          email: newEmail,
          pendingEmail: null,
          pendingEmailToken: null,
          pendingEmailExpiry: null,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Sync to employees + clients (non-fatal)
      try {
        await db.update(employees).set({ email: newEmail, updatedAt: new Date() }).where(eq(employees.userId, user.id));
        await db.update(clients).set({ email: newEmail, updatedAt: new Date() }).where(eq(clients.userId, user.id));
      } catch (syncErr) {
        log.warn('[AuthService] Email sync to employee/client failed (non-fatal):', (syncErr as any).message);
      }

      // SECURITY: Invalidate all active sessions so any pre-change session
      // (including one an attacker may hold) cannot persist after an email swap.
      // The user must log in fresh with the new email address.
      try {
        await db
          .update(authSessions)
          .set({ isValid: false })
          .where(eq(authSessions.userId, user.id));
        log.info(`[AuthService] All sessions invalidated after email change for userId=${user.id}`);
      } catch (sessionErr) {
        log.warn('[AuthService] Failed to invalidate sessions after email change (non-fatal):', sessionErr);
      }

      return { success: true, newEmail };
    } catch (error) {
      log.error('[AuthService] confirmEmailChange error:', error);
      return { success: false, error: 'Failed to confirm email change. Please try again.' };
    }
  }

  async cancelEmailChange(userId: string): Promise<{ success: boolean }> {
    try {
      await db
        .update(users)
        .set({ pendingEmail: null, pendingEmailToken: null, pendingEmailExpiry: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { success: true };
    } catch (error) {
      log.error('[AuthService] cancelEmailChange error:', error);
      return { success: false };
    }
  }

  private async sendEmailChangeVerification(newEmail: string, token: string): Promise<void> { // infra
    const confirmUrl = `${this.getBaseUrl()}/api/auth/confirm-email-change?token=${token}`;
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `${PLATFORM.name} <${fromEmail}>`,
        to: [newEmail],
        subject: `Confirm your new email address - ${PLATFORM.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Confirm Email Change</h2>
            <p>You requested to change your ${PLATFORM.name} account email address to <strong>${newEmail}</strong>.</p>
            <p>Click the button below to confirm this change:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Confirm New Email</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This link expires in 2 hours.</p>
            <p style="color: #6b7280; font-size: 14px;">If you did not request this change, you can safely ignore this email — your current email address remains unchanged.</p>
          </div>
        `,
      });
      log.info(`[AuthService] Email change verification sent to ${newEmail}`);
    } catch (error) {
      log.error('[AuthService] Failed to send email change verification:', error);
      throw error;
    }
  }

  // SECURITY: Notifies the original email address that an email-change request
  // was initiated, so the account owner can act if this was not them.
  private async sendEmailChangeSecurityNotice(oldEmail: string, newEmail: string): Promise<void> {
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: `${PLATFORM.name} <${fromEmail}>`,
        to: [oldEmail],
        subject: `Security notice: Email change requested - ${PLATFORM.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Security Notice</h2>
            <p>A request was made to change the email address on your <strong>${PLATFORM.name}</strong> account to <strong>${newEmail}</strong>.</p>
            <p>If you made this request, no action is needed — a confirmation link has been sent to the new address.</p>
            <p style="color: #dc2626; font-weight: 600;">If you did NOT make this request, your account may be compromised. Please log in immediately and change your password.</p>
            <p style="color: #6b7280; font-size: 14px;">If you do not confirm the change within 2 hours, the request will expire and your email address will remain unchanged.</p>
          </div>
        `,
      });
      log.info(`[AuthService] Email-change security notice sent to old address`);
    } catch (error) {
      log.error('[AuthService] Failed to send email-change security notice:', error);
      throw error;
    }
  }
}

export const authService = new AuthService();
