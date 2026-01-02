// Authentication API routes - registration, login, password reset
import { Router } from "express";
import { z } from "zod";
import { db } from "./db";
import { users, platformRoles, employees, workspaces, expenseCategories } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// Type for User from database queries
type User = typeof users.$inferSelect;
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  recordFailedLogin,
  recordSuccessfulLogin,
  checkAccountLocked,
  createVerificationToken,
  createPasswordResetToken,
  resetPassword,
  requireAuth,
} from "./auth";
import { checkWorkspacePaymentStatus, hasPlatformWideAccess, getUserPlatformRole } from "./rbac";
import { emailService } from "./services/emailService";
import { platformEventBus } from "./services/platformEventBus";
import { systemAuditLogs } from "@shared/schema";
import { verifyRecaptcha } from "./services/recaptchaService";

const router = Router();

// ============================================================================
// Registration
// ============================================================================

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  recaptchaToken: z.string().optional(),
});

router.post("/api/auth/register", async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    // Verify reCAPTCHA (only blocks obvious bots, gracefully degrades if not configured)
    const recaptchaResult = await verifyRecaptcha(data.recaptchaToken, 'register');
    if (!recaptchaResult.isHuman) {
      console.warn(`[Registration] Bot detected - Score: ${recaptchaResult.score}, Email: ${data.email}`);
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

    console.log(`[Registration] Created user ${newUser.id} (${newUser.email}) - needs org setup`);

    // Create verification token
    const verificationToken = await createVerificationToken(newUser.id);

    // Send verification email
    await emailService.sendVerificationEmail(
      newUser.id,
      newUser.email,
      verificationToken,
      newUser.firstName || undefined
    );

    // Auto-login after registration - CRITICAL: explicitly save session to database immediately
    req.session.userId = newUser.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('[Registration] Session save error:', err);
          reject(err);
        } else {
          console.log('[Registration] Session persisted to database for user', newUser.id);
          resolve();
        }
      });
    });

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
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors,
      });
    }
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ============================================================================
// Login
// ============================================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  rememberMe: z.boolean().optional().default(false),
  recaptchaToken: z.string().optional(),
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const rememberMe = data.rememberMe === true;

    // Verify reCAPTCHA (only blocks obvious bots, gracefully degrades if not configured)
    const recaptchaResult = await verifyRecaptcha(data.recaptchaToken, 'login');
    if (!recaptchaResult.isHuman) {
      console.warn(`[Login] Bot detected - Score: ${recaptchaResult.score}, Email: ${data.email}`);
      return res.status(429).json({ message: "Suspicious activity detected. Please try again later." });
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if account is locked
    const lockStatus = await checkAccountLocked(user.id);
    if (lockStatus.locked) {
      return res.status(403).json({ message: lockStatus.message });
    }

    // Verify password
    if (!user.passwordHash) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isValidPassword = await verifyPassword(
      data.password,
      user.passwordHash
    );

    if (!isValidPassword) {
      await recordFailedLogin(user.id);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Record successful login
    await recordSuccessfulLogin(user.id);

    // AUTO-ASSIGN WORKSPACE: If user has no workspace context, assign their first workspace
    let workspaceId = user.currentWorkspaceId;
    if (!workspaceId) {
      // Find first workspace where user is an employee
      const [employeeRecord] = await db
        .select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (employeeRecord) {
        workspaceId = employeeRecord.workspaceId;
        // Update user's currentWorkspaceId in database
        await db
          .update(users)
          .set({ currentWorkspaceId: workspaceId, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }
    }

    // Check for platform role (root_admin, sysop, compliance_officer)
    const userPlatformRoles = await db
      .select()
      .from(platformRoles)
      .where(eq(platformRoles.userId, user.id));
    
    const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);

    // Create session - CRITICAL: explicitly save session to database immediately
    req.session.userId = user.id;
    
    // Extend session duration if "Remember Me" is checked (30 days vs 1 week)
    if (rememberMe && req.session.cookie) {
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      req.session.cookie.maxAge = thirtyDays;
      console.log('[Login] Remember Me enabled - session extended to 30 days');
    }
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('[Login] Session save error:', err);
          reject(err);
        } else {
          console.log('[Login] Session persisted to database for user', user.id);
          resolve();
        }
      });
    });

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
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
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

// ============================================================================
// Logout
// ============================================================================

router.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout failed" });
    }
    res.clearCookie("connect.sid");
    res.json({ message: "Logout successful" });
  });
});

// ============================================================================
// Get Current User
// ============================================================================

router.get("/api/auth/me", requireAuth, async (req, res) => {
  const sessionUser = req.user as User; // Get user ID from session
  
  // CRITICAL FIX: Fetch FRESH user data from database instead of using stale session data
  // This ensures workspace assignments from login are immediately visible
  const [freshUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!freshUser) {
    return res.status(401).json({ message: "User not found" });
  }
  
  // GATEKEEPER: Check for platform role (root_admin, sysop, compliance_officer)
  const userPlatformRoles = await db
    .select()
    .from(platformRoles)
    .where(eq(platformRoles.userId, freshUser.id));
  
  const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
  
  // RBAC: Fetch workspace role from employee record for current workspace
  let workspaceRole: string | null = null;
  let employeeId: string | null = null;
  let organizationalTitle: string | null = null;
  
  if (freshUser.currentWorkspaceId) {
    // Check if user is the workspace owner first
    const [ownedWorkspace] = await db
      .select()
      .from(workspaces)
      .where(and(
        eq(workspaces.id, freshUser.currentWorkspaceId),
        eq(workspaces.ownerId, freshUser.id)
      ))
      .limit(1);
    
    if (ownedWorkspace) {
      workspaceRole = 'org_owner';
    }
    
    // Get employee record for additional details and workspaceRole if not owner
    const employeeRecord = await db.query.employees.findFirst({
      where: and(
        eq(employees.userId, freshUser.id),
        eq(employees.workspaceId, freshUser.currentWorkspaceId)
      ),
    });
    
    if (employeeRecord) {
      employeeId = employeeRecord.id;
      organizationalTitle = (employeeRecord as any).organizationalTitle || null;
      // Use employee workspaceRole only if not already set as owner
      if (!workspaceRole) {
        workspaceRole = employeeRecord.workspaceRole || 'staff';
      }
    }
  }
  
  // PAYMENT ENFORCEMENT: Check workspace subscription status
  // Platform staff bypass this check
  const workspaceId = freshUser.currentWorkspaceId;
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
            category: 'billing',
            severity: 'warning',
            userId: freshUser.id,
            workspaceId: paymentResult.workspaceId,
            details: {
              reason: paymentResult.reason,
              workspaceName: paymentResult.workspaceName,
              blockedAt: new Date().toISOString(),
            },
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
          });
          
          // Emit event for Trinity AI monitoring
          platformEventBus.emit({
            type: 'subscription.payment_blocked',
            payload: {
              userId: freshUser.id,
              workspaceId: paymentResult.workspaceId,
              workspaceName: paymentResult.workspaceName,
              reason: paymentResult.reason,
              isOwner: true,
            },
          });
        } catch (logError) {
          console.error('[PaymentEnforcement] Failed to log audit:', logError);
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
      
      // End user: 404 + force logout
      return res.status(404).json({
        code: 'ORGANIZATION_INACTIVE',
        message: 'This organization is currently unavailable.',
        reason: paymentResult.reason,
        forceLogout: true,
        redirectTo: '/',
        isOwner: false
      });
    }
  }
  
  res.json({
    user: {
      id: freshUser.id,
      email: freshUser.email,
      firstName: freshUser.firstName ?? "",
      lastName: freshUser.lastName ?? "",
      role: freshUser.role ?? "user",
      emailVerified: freshUser.emailVerified ?? false,
      currentWorkspaceId: freshUser.currentWorkspaceId ?? null,
      platformRole: activePlatformRole?.role || null, // GATEKEEPER: Include platform role
      workspaceRole: workspaceRole, // RBAC: Include workspace role for permissions
      employeeId: employeeId,
      organizationalTitle: organizationalTitle,
      simpleMode: freshUser.simpleMode ?? false, // Easy View display preference
    },
  });
});

// ============================================================================
// Update User Display Preferences
// ============================================================================

const preferencesSchema = z.object({
  simpleMode: z.boolean().optional(),
});

router.patch("/api/user/preferences", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.user as User;
    const data = preferencesSchema.parse(req.body);
    
    const updates: Record<string, any> = {};
    if (data.simpleMode !== undefined) {
      updates.simpleMode = data.simpleMode;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid preferences to update" });
    }
    
    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, sessionUser.id));
    
    res.json({ message: "Preferences updated", ...updates });
  } catch (error) {
    console.error("Preferences update error:", error);
    res.status(500).json({ message: "Failed to update preferences" });
  }
});

// ============================================================================
// Password Reset Request
// ============================================================================

const resetRequestSchema = z.object({
  email: z.string().email(),
});

router.post("/api/auth/reset-password-request", async (req, res) => {
  try {
    const data = resetRequestSchema.parse(req.body);

    const result = await createPasswordResetToken(data.email);

    if (result.token && result.user) {
      // Send password reset email
      await emailService.sendPasswordResetEmail(
        result.user.id,
        data.email,
        result.token,
        result.user.firstName || undefined
      );
    }

    // Always return success to prevent email enumeration
    res.json({
      message:
        "If an account exists with that email, a reset link has been sent",
    });
  } catch (error) {
    console.error("Reset request error:", error);
    res.status(500).json({ message: "Reset request failed" });
  }
});

// ============================================================================
// Password Reset Confirm
// ============================================================================

const resetConfirmSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

router.post("/api/auth/reset-password-confirm", async (req, res) => {
  try {
    const data = resetConfirmSchema.parse(req.body);

    const result = await resetPassword(data.token, data.password);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset confirm error:", error);
    res.status(500).json({ message: "Password reset failed" });
  }
});

// ============================================================================
// Change Password (authenticated)
// ============================================================================

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

router.post("/api/auth/change-password", requireAuth, async (req, res) => {
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

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Password change failed" });
  }
});

export default router;
