import { Router, Request } from "express";
import crypto from 'crypto';
import { storage } from "../storage";
import { db } from "../db";
import {
  users,
  employees,
  clients,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { csrfTokenHandler } from "../middleware/csrf";
import {
  generateMfaSecret,
  verifyMfaToken,
  enableMfa,
  disableMfa,
  regenerateBackupCodes,
  checkMfaStatus,
} from "../services/auth/mfa";
import type { AuthenticatedRequest } from "../rbac";
import { authLimiter, passwordResetLimiter, mutationLimiter } from "../middleware/rateLimiter";
import { createLogger } from '../lib/logger';
const log = createLogger('AuthRoutes');


const router = Router();

// REGISTER: Handled by server/authRoutes.ts (canonical handler, registered first)
// Do NOT add a duplicate register route here.

// LOGIN: Handled exclusively by server/authRoutes.ts (the universal login handler)
// Do NOT add a duplicate login route here — it was removed to prevent auth conflicts.

// LOGOUT: Handled by server/authRoutes.ts (canonical handler, registered first)
// Do NOT add a duplicate logout route here.

router.get('/csrf-token', csrfTokenHandler);
router.post('/csrf-token', csrfTokenHandler);

router.post('/logout-all', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { authService } = await import('../services/authService');
    await authService.logoutAllSessions(userId);

    res.clearCookie('auth_token', { path: '/' });

    // Send response only after session is fully destroyed to close the window
    // where a concurrent request could still find the old session valid.
    req.session.destroy((err) => {
      if (err) log.error('[Auth] Session destroy error:', err);
      res.json({ success: true, message: 'All sessions logged out' });
    });
  } catch (error: unknown) {
    log.error('[Auth] Logout all error:', error);
    res.status(500).json({ message: 'Failed to logout all sessions' });
  }
});

router.post('/forgot-password', passwordResetLimiter, async (req: Request, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const { authService } = await import('../services/authService');
    const result = await authService.requestPasswordReset(email);

    if (!result.success) {
      const statusCode = result.code === 'email_failed' ? 500 : 400;
      return res.status(statusCode).json({ success: false, error: result.code, message: result.error });
    }

    res.json({ success: true, message: 'Reset link sent to your email' });
  } catch (error: unknown) {
    log.error('[Auth] Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process request' });
  }
});

router.post('/reset-password', async (req: Request, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const { authService } = await import('../services/authService');
    const result = await authService.resetPassword(token, password);

    if (!result.success) {
      return res.status(400).json({ message: result.error, code: result.code });
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: unknown) {
    log.error('[Auth] Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// VERIFY-EMAIL: Handled by server/authRoutes.ts (canonical handler, registered first)
// RESEND-VERIFICATION: Handled by server/authRoutes.ts (canonical handler, registered first)

router.post('/magic-link', passwordResetLimiter, async (req: Request, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const { authService } = await import('../services/authService');
    await authService.requestMagicLink(email);

    res.json({ success: true, message: 'If an account exists, a magic link has been sent' });
  } catch (error: unknown) {
    log.error('[Auth] Magic link request error:', error);
    res.status(500).json({ message: 'Failed to send magic link' });
  }
});

router.get('/magic-link/verify', async (req: Request, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: 'Token is required' });
    }

    const { authService } = await import('../services/authService');
    const result = await authService.verifyMagicLink(
      token,
      req.ip || req.socket?.remoteAddress,
      req.get('user-agent')
    );

    if (!result.success) {
      return res.status(400).json({ message: result.error, code: result.code });
    }

    res.cookie('auth_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    if (result.user) {
      const priorSession = { ...req.session };
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            log.error('[Auth] Magic link session regeneration failed:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // Restore session data if needed (excluding userId which we're about to set)
      Object.assign(req.session, priorSession);

      req.session.userId = result.user.id;
      req.session.passport = {
        user: {
          claims: {
            sub: result.user.id,
            email: result.user.email,
            first_name: result.user.firstName,
            last_name: result.user.lastName,
          },
          expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
        },
      };
      const { resolveAndCacheWorkspaceContext, saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
      if ((result as any).user.currentWorkspaceId) {
        await resolveAndCacheWorkspaceContext(req, result.user.id, (result as any).user.currentWorkspaceId);
      }
      await saveSessionAsync(req);
    }

    log.info('[Security] Magic link verified and session established', {
      userId: result.user?.id,
      workspaceId: (result as any).user?.currentWorkspaceId,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
      event: 'magic_link_verified',
    });

    res.json({ success: true, user: result.user });
  } catch (error: unknown) {
    log.error('[Auth] Magic link verify error:', error);
    res.status(500).json({ message: 'Failed to verify magic link' });
  }
});

// CHANGE-PASSWORD: Handled by server/authRoutes.ts (canonical handler, registered first)

router.get('/session', async (req: Request, res) => {
  try {
    const authToken = req.cookies?.auth_token;

    if (!authToken) {
      return res.status(401).json({ authenticated: false, message: 'No session' });
    }

    const { authService } = await import('../services/authService');
    const result = await authService.validateSession(authToken);

    if (!result.success) {
      res.clearCookie('auth_token', { path: '/' });
      return res.status(401).json({ authenticated: false, message: result.error });
    }

    res.json({ authenticated: true, user: result.user });
  } catch (error: unknown) {
    log.error('[Auth] Session validation error:', error);
    res.status(500).json({ authenticated: false, message: 'Session validation failed' });
  }
});

router.post('/register-simple', authLimiter, async (req: Request, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const { authService } = await import('../services/authService');
    const result = await authService.register(email, password, firstName, lastName);

    if (!result.success) {
      const status = result.code === 'EMAIL_EXISTS' ? 409 : 400;
      return res.status(status).json({ message: result.error, code: result.code });
    }

    res.status(201).json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      user: result.user,
    });
  } catch (error: unknown) {
    log.error('[Auth] Simple registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

router.get('/user', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized - Please login" });
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { passwordHash, mfaSecret, mfaBackupCodes, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    log.error("Error fetching user:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

router.patch('/profile', mutationLimiter, async (req: any, res) => {
  try {
    let userId: string | null = null;
    
    if (req.user?.id) {
      userId = req.user?.id;
    } else if (req.session?.userId) {
      userId = req.session.userId;
    }
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { firstName, lastName, phone, personalForwardEmail } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "First name and last name are required" });
    }

    if (personalForwardEmail !== undefined && personalForwardEmail !== null && personalForwardEmail !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(personalForwardEmail))) {
        return res.status(400).json({ message: 'Invalid forward email format' });
      }
    }

    const updateData: any = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      updatedAt: new Date(),
    };

    if (phone !== undefined) {
      updateData.phone = phone ? phone.trim() : phone;
    }

    if (personalForwardEmail !== undefined) {
      updateData.personalForwardEmail = personalForwardEmail
        ? String(personalForwardEmail).toLowerCase().trim()
        : null;
    }

    const updatedUser = await storage.updateUser(userId, updateData);

    if (updatedUser) {
      try {
        const employeeSync: Record<string, unknown> = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          updatedAt: new Date(),
          ...(phone !== undefined && { phone: phone ? phone.trim() : null }),
          ...(personalForwardEmail !== undefined && {
            personalForwardEmail: personalForwardEmail
              ? String(personalForwardEmail).toLowerCase().trim()
              : null,
          }),
        };
        await db.update(employees)
          .set(employeeSync)
          .where(eq(employees.userId, userId));
      } catch (syncError) {
        log.warn('[Auth] Name sync to employee records failed (non-fatal):', (syncError as any).message);
      }
    }

    res.json({ 
      success: true, 
      message: "Profile updated successfully",
      user: updatedUser 
    });
  } catch (error) {
    log.error("Error updating profile:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// ============================================================
// Email Change Flow (Verified)
// ============================================================

router.post('/request-email-change', mutationLimiter, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { newEmail } = req.body;
    if (!newEmail || typeof newEmail !== 'string') {
      return res.status(400).json({ success: false, error: 'A new email address is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email format.' });
    }

    const { authService } = await import('../services/authService');
    const result = await authService.initiateEmailChange(userId, newEmail.trim());

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, message: 'Verification email sent. Please check your inbox to confirm the change.' });
  } catch (error) {
    log.error('[Auth] request-email-change error:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate email change.' });
  }
});

router.post('/cancel-email-change', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { authService } = await import('../services/authService');
    await authService.cancelEmailChange(userId);

    res.json({ success: true, message: 'Email change cancelled.' });
  } catch (error) {
    log.error('[Auth] cancel-email-change error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel email change.' });
  }
});

// GET endpoint: invoked from the verification link in the email
router.get('/confirm-email-change', async (req: any, res) => {
  const token = req.query.token as string | undefined;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  if (!token) {
    return res.redirect(`${baseUrl}/employee/profile?email_change=invalid`);
  }

  try {
    const { authService } = await import('../services/authService');
    const result = await authService.confirmEmailChange(token);

    if (!result.success) {
      return res.redirect(`${baseUrl}/employee/profile?email_change=error&msg=${encodeURIComponent(result.error || 'Unknown error')}`);
    }

    return res.redirect(`${baseUrl}/employee/profile?email_change=success`);
  } catch (error) {
    log.error('[Auth] confirm-email-change error:', error);
    return res.redirect(`${baseUrl}/employee/profile?email_change=error`);
  }
});

router.get('/mfa/status', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const status = await checkMfaStatus(userId);
    res.json(status);
  } catch (error) {
    log.error("Error checking MFA status:", error);
    res.status(500).json({ message: "Failed to check MFA status" });
  }
});

router.post('/mfa/setup', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userEmail = req.user?.email || '';

    if (!userEmail) {
      return res.status(400).json({ message: "Email required for MFA setup" });
    }

    const mfaSetup = await generateMfaSecret(userId, userEmail);
    res.json({
      success: true,
      qrCodeUrl: mfaSetup.qrCodeUrl,
      backupCodes: mfaSetup.backupCodes,
    });
  } catch (error) {
    log.error("Error setting up MFA:", error);
    res.status(500).json({ message: "Failed to setup MFA" });
  }
});

router.post('/mfa/enable', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token required" });
    }

    const verification = await verifyMfaToken(userId, token);

    if (!verification.valid) {
      return res.status(400).json({ message: "Invalid token" });
    }

    await enableMfa(userId);

    res.json({
      success: true,
      message: "MFA enabled successfully",
    });
  } catch (error) {
    log.error("Error enabling MFA:", error);
    res.status(500).json({ message: "Failed to enable MFA" });
  }
});

router.post('/mfa/verify', async (req: any, res) => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ message: "User ID and token required" });
    }

    const verification = await verifyMfaToken(userId, token);

    if (!verification.valid) {
      return res.status(400).json({ message: "Invalid token" });
    }

    res.json({
      success: true,
      isBackupCode: verification.isBackupCode || false,
    });
  } catch (error) {
    log.error("Error verifying MFA token:", error);
    res.status(500).json({ message: "Failed to verify token" });
  }
});

router.post('/mfa/disable', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { password, token } = req.body;

    if (!password && !token) {
      return res.status(400).json({ 
        message: "Password or MFA token required to disable MFA" 
      });
    }

    if (password) {
      const user = await storage.getUser(userId);
      if (!user?.passwordHash) {
        return res.status(400).json({ 
          message: "Password authentication not available. Use MFA token instead." 
        });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ message: "Invalid password" });
      }
    }

    if (token && !password) {
      const verification = await verifyMfaToken(userId, token);
      if (!verification.valid) {
        return res.status(400).json({ message: "Invalid MFA token" });
      }
    }

    await disableMfa(userId);

    res.json({
      success: true,
      message: "MFA disabled successfully",
    });
  } catch (error) {
    log.error("Error disabling MFA:", error);
    res.status(500).json({ message: "Failed to disable MFA" });
  }
});

router.post('/mfa/regenerate-backup-codes', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const newBackupCodes = await regenerateBackupCodes(userId);

    res.json({
      success: true,
      backupCodes: newBackupCodes,
    });
  } catch (error) {
    log.error("Error regenerating backup codes:", error);
    res.status(500).json({ message: "Failed to regenerate backup codes" });
  }
});

// WS Auth Token — issues a 60-second one-time token for WebSocket authentication
// Needed when session cookie lookup fails at WS connection time (DB hiccup, Replit env edge cases)
async function issueWsToken(req: any, res: any) {
  const userId = req.user?.id || req.session?.userId;
  const workspaceId = req.user?.workspaceId || req.session?.workspaceId || req.session?.currentWorkspaceId;
  const role = req.user?.role || req.session?.workspaceRole;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const { createWsAuthToken } = await import('../websocket');
    const token = createWsAuthToken(userId, workspaceId, role);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create WS auth token' });
  }
}

router.get('/ws-token', issueWsToken);
router.post('/ws-token', issueWsToken);

export default router;
