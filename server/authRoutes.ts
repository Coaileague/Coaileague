// Authentication API routes - registration, login, password reset
import { Router } from "express";
import { z } from "zod";
import { db } from "./db";
import { users, platformRoles, employees } from "@shared/schema";
import { eq } from "drizzle-orm";
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

const router = Router();

// ============================================================================
// Registration
// ============================================================================

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
});

router.post("/api/auth/register", async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

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

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        emailVerified: false,
        role: "user",
      })
      .returning();

    // Auto-create workspace for new user
    const { storage } = await import("./storage");
    const workspace = await storage.createWorkspace({
      name: `${data.firstName}'s Workspace`,
      ownerId: newUser.id,
      subscriptionTier: "free",
      subscriptionStatus: "active",
    });

    console.log(`[Registration] Created workspace ${workspace.id} for user ${newUser.id}`);

    // Update user with workspace ID
    await db
      .update(users)
      .set({ currentWorkspaceId: workspace.id })
      .where(eq(users.id, newUser.id));

    // Ensure org identifiers exist before creating employee (retry if needed)
    const { ensureOrgIdentifiers } = await import('./services/identityService');
    try {
      await ensureOrgIdentifiers(workspace.id, workspace.name);
      console.log(`[Registration] Ensured org identifiers for workspace ${workspace.id}`);
    } catch (orgError: any) {
      console.error(`[Registration] Failed to ensure org identifiers:`, orgError.message);
      // Don't fail registration - external IDs can be retried later
    }

    // Create employee record for the workspace owner (separate from external ID attachment)
    const [newEmployee] = await db.insert(employees).values({
      userId: newUser.id,
      workspaceId: workspace.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      workspaceRole: 'org_owner',
      isActive: true,
    }).returning();

    console.log(`[Registration] Created employee ${newEmployee.id} for workspace ${workspace.id}`);

    // Try to attach employee external ID (in separate transaction - won't rollback employee creation)
    try {
      const { attachEmployeeExternalId } = await import('./services/identityService');
      const result = await attachEmployeeExternalId(newEmployee.id, workspace.id);
      console.log(`[Registration] Attached external ID ${result.externalId} to employee ${newEmployee.id}`);
    } catch (extIdError: any) {
      console.error(`[Registration] Failed to attach external ID:`, extIdError.message);
      console.log(`[Registration] Employee ${newEmployee.id} created successfully - external ID can be attached later`);
      // Don't fail registration - external IDs can be attached later via retry mechanism
    }

    // Create verification token
    const verificationToken = await createVerificationToken(newUser.id);

    // TODO: Send verification email
    // await sendVerificationEmail(newUser.email, verificationToken);

    // Auto-login after registration
    req.session.userId = newUser.id;

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        currentWorkspaceId: workspace.id,
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
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

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

    // Check for platform role (root_admin, sysop, compliance_officer)
    const userPlatformRoles = await db
      .select()
      .from(platformRoles)
      .where(eq(platformRoles.userId, user.id));
    
    const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);

    // Create session
    req.session.userId = user.id;

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
  const user = req.user!; // requireAuth ensures user exists
  
  // GATEKEEPER: Check for platform role (root_admin, sysop, compliance_officer)
  const userPlatformRoles = await db
    .select()
    .from(platformRoles)
    .where(eq(platformRoles.userId, user.id));
  
  const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
  
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      role: user.role ?? "user",
      emailVerified: user.emailVerified ?? false,
      currentWorkspaceId: user.currentWorkspaceId ?? null,
      platformRole: activePlatformRole?.role || null, // GATEKEEPER: Include platform role
    },
  });
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

    if (result.token) {
      // TODO: Send password reset email
      // await sendPasswordResetEmail(data.email, result.token);
      console.log("Password reset token:", result.token); // Dev only
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
    const user = req.user!;

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
