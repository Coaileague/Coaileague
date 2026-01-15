import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db";
import { users, authTokens, authSessions } from "@shared/schema";
import { eq, and, gt, lt, isNull, sql } from "drizzle-orm";
import { Resend } from "resend";

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const SESSION_DURATION_DAYS = 7;
const MAGIC_LINK_EXPIRY_MINUTES = 15;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const EMAIL_VERIFY_EXPIRY_HOURS = 24;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
    return process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.BASE_URL || "http://localhost:5000";
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
    } catch (error) {
      console.error("[AuthService] Registration error:", error);
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
        if (user.authProvider === "replit_legacy") {
          return {
            success: false,
            error: "Please use Replit login or set a password via forgot password",
            code: "REPLIT_AUTH_REQUIRED",
          };
        }
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
    } catch (error) {
      console.error("[AuthService] Login error:", error);
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
    } catch (error) {
      console.error("[AuthService] Session validation error:", error);
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
    } catch (error) {
      console.error("[AuthService] Logout error:", error);
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
    } catch (error) {
      console.error("[AuthService] Logout all error:", error);
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
    } catch (error) {
      console.error("[AuthService] Magic link error:", error);
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
    } catch (error) {
      console.error("[AuthService] Magic link verification error:", error);
      return { success: false, error: "Verification failed", code: "VERIFICATION_ERROR" };
    }
  }

  async requestPasswordReset(email: string): Promise<TokenResult> {
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
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

      await db.insert(authTokens).values({
        userId: user.id,
        tokenHash,
        tokenType: "password_reset",
        expiresAt,
      });

      await this.sendPasswordResetEmail(user.email, token);

      return { success: true };
    } catch (error) {
      console.error("[AuthService] Password reset request error:", error);
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

      await db
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(eq(authTokens.id, authToken.id));

      await db
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

      await db
        .update(authSessions)
        .set({ isValid: false })
        .where(eq(authSessions.userId, authToken.userId));

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
    } catch (error) {
      console.error("[AuthService] Password reset error:", error);
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
    } catch (error) {
      console.error("[AuthService] Email verification error:", error);
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
    } catch (error) {
      console.error("[AuthService] Resend verification error:", error);
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
    } catch (error) {
      console.error("[AuthService] Change password error:", error);
      return { success: false, error: "Password change failed", code: "CHANGE_ERROR" };
    }
  }

  private async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verifyUrl = `${this.getBaseUrl()}/auth/verify-email?token=${token}`;
    
    if (!resend) {
      console.log(`[AuthService] Email verification link for ${email}: ${verifyUrl}`);
      return;
    }

    try {
      await resend.emails.send({
        from: "CoAIleague <noreply@coaileague.com>",
        to: email,
        subject: "Verify your email - CoAIleague",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #0ea5e9;">Verify Your Email</h1>
            <p>Click the button below to verify your email address:</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Verify Email</a>
            <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
            <p style="color: #666; font-size: 14px;">If you didn't create an account, ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      console.error("[AuthService] Failed to send verification email:", error);
    }
  }

  private async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    const loginUrl = `${this.getBaseUrl()}/auth/magic-link?token=${token}`;
    
    if (!resend) {
      console.log(`[AuthService] Magic link for ${email}: ${loginUrl}`);
      return;
    }

    try {
      await resend.emails.send({
        from: "CoAIleague <noreply@coaileague.com>",
        to: email,
        subject: "Your login link - CoAIleague",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #0ea5e9;">Login to CoAIleague</h1>
            <p>Click the button below to log in:</p>
            <a href="${loginUrl}" style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Log In</a>
            <p style="color: #666; font-size: 14px;">This link expires in 15 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      console.error("[AuthService] Failed to send magic link email:", error);
    }
  }

  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.getBaseUrl()}/auth/reset-password?token=${token}`;
    
    if (!resend) {
      console.log(`[AuthService] Password reset link for ${email}: ${resetUrl}`);
      return;
    }

    try {
      await resend.emails.send({
        from: "CoAIleague <noreply@coaileague.com>",
        to: email,
        subject: "Reset your password - CoAIleague",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #0ea5e9;">Reset Your Password</h1>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      console.error("[AuthService] Failed to send password reset email:", error);
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
      console.error("[AuthService] Token cleanup error:", error);
    }
  }
}

export const authService = new AuthService();
