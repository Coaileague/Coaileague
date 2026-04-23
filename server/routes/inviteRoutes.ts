import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db';
import { onboardingInvites, users, employees, workspaceMembers } from '@shared/schema';
import { and, eq, gt } from 'drizzle-orm';
import { requireManager, type AuthenticatedRequest } from '../rbac';
import { storage } from '../storage';
import { emailService } from '../services/emailService';
import { createLogger } from '../lib/logger';
import { sanitizeError } from '../middleware/errorHandler';
const log = createLogger('InviteRoutes');

export const inviteRouter = Router();
export const publicInviteRouter = Router();

const inviteCreateSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  workspaceRole: z.string().default('staff'),
  roleTitle: z.string().optional(),
  position: z.string().optional(),
  offeredPayRate: z.number().optional(),
});

const inviteAcceptSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

inviteRouter.post('/', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'Workspace and user required' });

    const parsed = inviteCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid invite data', details: parsed.error.flatten() });
    }

    const { email, firstName, lastName, workspaceRole, roleTitle, position, offeredPayRate } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await db.select({ id: onboardingInvites.id })
      .from(onboardingInvites)
      .where(and(
        eq(onboardingInvites.workspaceId, workspaceId),
        eq(onboardingInvites.email, normalizedEmail),
        eq(onboardingInvites.status, 'sent'),
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'An active invite already exists for this email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invite] = await db.insert(onboardingInvites).values({
      workspaceId,
      email: normalizedEmail,
      firstName,
      lastName,
      role: roleTitle || null,
      workspaceRole: workspaceRole as any,
      position: position || null,
      offeredPayRate: offeredPayRate ? offeredPayRate.toString() : null,
      inviteToken: tokenHash,
      expiresAt,
      status: 'sent',
      sentBy: userId,
    } as any).returning();

    const workspace = await storage.getWorkspace(workspaceId);
    const inviter = await storage.getUser(userId);
    const inviterName = inviter
      ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.email
      : 'Your Manager';

    let emailSent = false;
    try {
      await emailService.sendEmployeeInvitation(workspaceId, normalizedEmail, token, {
        firstName,
        inviterName,
        workspaceName: workspace?.name || 'Your Organization',
        roleName: workspaceRole,
        expiresInDays: 7,
      });
      emailSent = true;
    } catch (emailErr: unknown) {
      log.warn('[InviteRoutes] Invite email failed (non-blocking):', (emailErr as any)?.message);
    }

    await storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'create',
      entityType: 'invite',
      entityId: invite.id,
      actionDescription: `Invite sent to ${normalizedEmail}`,
      changes: { inviteeEmail: normalizedEmail, workspaceRole },
      isSensitiveData: false,
    }).catch(err => log.warn('[InviteRoutes] Audit log failed (non-blocking):', err?.message));

    res.status(201).json({
      success: true,
      inviteId: invite.id,
      inviteToken: token,
      expiresAt,
      emailSent,
    });
  } catch (error: unknown) {
    log.error('[InviteRoutes] Create error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

publicInviteRouter.get('/accept-invite', async (req, res) => {
  try {
    const token = typeof req.query.code === 'string' ? req.query.code : null;
    if (!token) return res.status(400).json({ error: 'Invite token required' });

    const tokenHash = hashInviteToken(token);
    const [invite] = await db.select().from(onboardingInvites)
      .where(and(
        eq(onboardingInvites.inviteToken, tokenHash),
        eq(onboardingInvites.isUsed, false),
        gt(onboardingInvites.expiresAt, new Date()),
      ))
      .limit(1);

    if (!invite) return res.status(404).json({ error: 'Invite not found or expired' });

    if (invite.status === 'sent') {
      await db.update(onboardingInvites)
        .set({ status: 'opened', openedAt: new Date() })
        .where(eq(onboardingInvites.id, invite.id));
    }

    res.json({
      workspaceId: invite.workspaceId,
      email: invite.email,
      firstName: invite.firstName,
      lastName: invite.lastName,
      workspaceRole: invite.workspaceRole,
      expiresAt: invite.expiresAt,
    });
  } catch (error: unknown) {
    log.error('[InviteRoutes] Validate error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

publicInviteRouter.post('/accept-invite', async (req, res) => {
  try {
    const parsed = inviteAcceptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid acceptance payload', details: parsed.error.flatten() });
    }

    const { token, password } = parsed.data;
    const tokenHash = hashInviteToken(token);

    const [invite] = await db.select().from(onboardingInvites)
      .where(and(
        eq(onboardingInvites.inviteToken, tokenHash),
        eq(onboardingInvites.isUsed, false),
        gt(onboardingInvites.expiresAt, new Date()),
      ))
      .limit(1);

    if (!invite) return res.status(404).json({ error: 'Invite not found or expired' });

    const normalizedEmail = invite.email.toLowerCase();
    const existingUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: normalizedEmail,
        firstName: invite.firstName,
        lastName: invite.lastName,
        passwordHash,
        authProvider: 'email',
        emailVerified: true,
        currentWorkspaceId: invite.workspaceId,
        role: invite.workspaceRole || 'staff',
        createdAt: new Date(),
      });

      await tx.insert(workspaceMembers).values({
        userId,
        workspaceId: invite.workspaceId,
        role: invite.workspaceRole || 'staff',
        status: 'active',
        joinedAt: new Date(),
      });

      await tx.insert(employees).values({
        workspaceId: invite.workspaceId,
        userId,
        firstName: invite.firstName,
        lastName: invite.lastName,
        email: normalizedEmail,
        workspaceRole: (invite.workspaceRole as any) || 'staff',
        position: invite.position || null,
        hireDate: new Date(),
        isActive: true,
        onboardingStatus: 'in_progress',
      });

      await tx.update(onboardingInvites)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          isUsed: true,
          updatedAt: new Date(),
        } as any)
        .where(eq(onboardingInvites.id, invite.id));
    });

    await storage.createAuditLog({
      workspaceId: invite.workspaceId,
      userId,
      userEmail: normalizedEmail,
      userRole: invite.workspaceRole || 'staff',
      action: 'update',
      entityType: 'invite',
      entityId: invite.id,
      actionDescription: `Invite accepted by ${normalizedEmail}`,
      changes: { before: { status: 'sent' }, after: { status: 'accepted' } },
      isSensitiveData: false,
    }).catch(err => log.warn('[InviteRoutes] Accept audit log failed (non-blocking):', err?.message));

    res.json({ success: true, message: 'Invite accepted. Account created.' });
  } catch (error: unknown) {
    log.error('[InviteRoutes] Accept error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default inviteRouter;
