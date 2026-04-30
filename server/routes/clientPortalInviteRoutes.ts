/**
 * Client Portal Invite Routes — Synapse-Standard
 * 
 * STATUS MACHINE: pending → invited → accepted | expired
 * ATOMIC RULE: Every write is in db.transaction()
 * UNIQUE GUARD: No duplicate pending/invited tokens for same email+workspace
 * REAPER: inviteReaperService sweeps daily — age > 7 days → expired
 * SESSION: After accept, session carries { userId, clientId, workspaceId, orgCode }
 */
import { z } from 'zod';
import { Router } from 'express';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { clients, clientPortalInviteTokens, auditLogs, users, workspaces } from '@shared/schema';
import { requireManagerOrPlatformStaff, type AuthenticatedRequest , requireManager } from '../rbac';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { validateHandshakePayload } from '../services/onboarding/onboardingHandshakeService';
import { createLogger } from '../lib/logger';
import { sanitizeError } from '../middleware/errorHandler';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const log = createLogger('ClientPortalInviteRoutes');
const router = Router();

// ─── Visual State Machine helpers ─────────────────────────────────────────────
// pending  → ORANGE border — token generated, email in-flight
// invited  → ORANGE border — email delivered, awaiting client action
// accepted → GREEN  border — handshake complete, client is ACTIVE
// expired  → RED    border — > 7 days or manually revoked
function getInviteVisualStatus(invite: {
  isUsed: boolean | null;
  expiresAt: Date | string;
  createdAt?: Date | string | null;
}): 'pending' | 'invited' | 'accepted' | 'expired' {
  if (invite.isUsed) return 'accepted';
  const now = Date.now();
  const expires = new Date(invite.expiresAt).getTime();
  const created = invite.createdAt ? new Date(invite.createdAt).getTime() : now;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  if (now > expires || now - created > SEVEN_DAYS) return 'expired';
  return 'invited';
}

/**
 * GET /api/clients/portal/setup/:token
 * Validates a portal invite token and returns status for the frontend state machine.
 */
router.get('/portal/setup/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const workspaceIdParam = typeof req.query.workspace === 'string' ? req.query.workspace : null;

    const [invite] = await db.select().from(clientPortalInviteTokens)
      .where(and(
        eq(clientPortalInviteTokens.token, token),
        ...(workspaceIdParam ? [eq(clientPortalInviteTokens.workspaceId, workspaceIdParam)] : [])
      ))
      .limit(1);

    if (!invite) return res.status(404).json({ message: 'Invitation not found.' });

    const visualStatus = getInviteVisualStatus(invite);

    if (visualStatus === 'accepted') return res.status(409).json({ message: 'Invitation already accepted.' });
    if (visualStatus === 'expired') return res.status(410).json({ message: 'Invitation expired.', visualStatus: 'expired' });

    const [client] = await db.select({
      id: clients.id,
      companyName: clients.companyName,
      pocEmail: clients.pocEmail,
    }).from(clients)
      .where(eq(clients.id, invite.clientId))
      .limit(1);

    res.json({
      token: invite.token,
      email: invite.email,
      companyName: client?.companyName || 'Valued Client',
      workspaceId: invite.workspaceId,
      visualStatus,
      // Pre-populate verification screen with existing POC data if present
      pocEmail: client?.pocEmail || invite.email,
    });
  } catch (error) {
    log.error('Error validating portal invite:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/clients/portal/setup/:token
 * Accepts invite + creates user. ATOMIC transaction. Session gets full context.
 */
router.post('/portal/setup/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const schema = z.object({
      password: z.string().min(8).max(128),
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      workspaceId: z.string().optional(),
      // Verification screen fields (spec: POC Email, Address, Bill Rate, Service Hours)
      pocEmail: z.string().email().optional(),
      address: z.string().optional(),
      billRate: z.number().positive().optional(),
      serviceHours: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Validation failed', details: parsed.error.flatten() });
    const { password, firstName, lastName, workspaceId: bodyWorkspaceId, pocEmail, address, billRate, serviceHours } = parsed.data;

    // Load invite
    const [invite] = await db.select().from(clientPortalInviteTokens)
      .where(eq(clientPortalInviteTokens.token, token))
      .limit(1);

    if (!invite) return res.status(404).json({ message: 'Invitation not found.' });

    const visualStatus = getInviteVisualStatus(invite);
    if (visualStatus === 'accepted') return res.status(409).json({ message: 'Invitation already accepted.' });
    if (visualStatus === 'expired') return res.status(410).json({ message: 'Invitation expired.' });

    // Workspace guard
    if (bodyWorkspaceId && bodyWorkspaceId !== invite.workspaceId) {
      return res.status(403).json({ message: 'Workspace mismatch.' });
    }

    const normalizedEmail = invite.email.toLowerCase().trim();

    // UNIQUE guard — no duplicate accounts
    const [existingUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existingUser) return res.status(409).json({ message: 'An account with this email already exists.' });

    // Load org code from workspace for session context
    const [ws] = await db.select({ orgCode: (workspaces as any).orgCode })
      .from(workspaces)
      .where(eq((workspaces as any).id, invite.workspaceId))
      .limit(1);
    const orgCode = ws?.orgCode || 'ORG';

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    // ── ATOMIC: Create user + link client + flip invite ──────────────────────
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        role: 'client',
        currentWorkspaceId: invite.workspaceId,
        emailVerified: true,
      });

      await tx.update(clients)
        .set({
          userId,
          // Persist verified POC data if provided on verification screen
          ...(pocEmail ? { pocEmail } : {}),
          // @ts-expect-error — TS migration
          ...(address ? { address } : {}),
          ...(billRate ? { contractRate: billRate } : {}),
          // @ts-expect-error — TS migration
          clientOnboardingStatus: 'active',
          updatedAt: new Date(),
        })
        .where(eq(clients.id, invite.clientId));

      await tx.update(clientPortalInviteTokens)
        .set({ isUsed: true, updatedAt: new Date() })
        .where(eq(clientPortalInviteTokens.id, invite.id));

      await tx.insert(auditLogs).values({
        workspaceId: invite.workspaceId,
        userId,
        userEmail: normalizedEmail,
        action: 'portal_account_created' as any,
        entityType: 'client_portal',
        entityId: invite.clientId,
        changes: { firstName, lastName, email: normalizedEmail, pocEmail, address, billRate, serviceHours, statusFlip: 'invited → active' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      } as any);
    });
    // ── END ATOMIC ───────────────────────────────────────────────────────────

    // Session fixation prevention + full context injection
    if (req.session) {
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => err ? reject(err) : resolve());
      });
      // Spec: session widget must hold { userId, clientId, tenantId, orgCode }
      req.session.userId = userId;
      (req.session as any).clientId = invite.clientId;
      (req.session as any).tenantId = invite.workspaceId; // tenantId = workspaceId
      (req.session as any).orgCode = orgCode;
    }

    res.json({
      success: true,
      message: 'Portal account created successfully',
      // Return context for frontend widget
      context: {
        userId,
        clientId: invite.clientId,
        tenantId: invite.workspaceId,
        orgCode,
        visualStatus: 'accepted',
      },
    });
  } catch (error) {
    log.error('Error accepting portal invite:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/invite
 * ATOMIC: Generate token + log audit. Duplicate guard enforced.
 */
router.post('/:id/invite', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const { id: clientId } = req.params;

    const [client] = await db.select().from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1);

    if (!client) return res.status(404).json({ message: 'Client not found' });

    const email = client.email || client.pocEmail;
    if (!email) return res.status(400).json({ message: 'Client has no email or POC email configured.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days (Reaper TTL)

    // ── LAYER 2 TRINITY STEPS: Logic Gate ────────────────────────────────────
    // Step 1: Search — find any existing invite for this email+workspace
    const [existingInvite] = await db.select({
      id: clientPortalInviteTokens.id,
      isUsed: clientPortalInviteTokens.isUsed,
      expiresAt: clientPortalInviteTokens.expiresAt,
    }).from(clientPortalInviteTokens)
      .where(and(
        eq(clientPortalInviteTokens.email, email.toLowerCase().trim()),
        eq(clientPortalInviteTokens.workspaceId, workspaceId),
      ))
      .orderBy(desc(clientPortalInviteTokens.createdAt))
      .limit(1);

    // Step 2: Logic Gate — three branches
    if (existingInvite) {
      const isExpired = new Date(existingInvite.expiresAt as any) < new Date();

      // Gate A: ACTIVE — block entirely ("User already active")
      if (existingInvite.isUsed) {
        return res.status(409).json({
          message: 'This client already has an active portal account.',
          code: 'ALREADY_ACTIVE',
          visualStatus: 'active',
        });
      }

      // Gate B: INVITED (still valid) — prompt resend ("Invite already pending")
      if (!isExpired) {
        return res.status(409).json({
          message: 'An invitation is already pending for this email. Would you like to resend it?',
          code: 'INVITE_PENDING',
          existingInviteId: existingInvite.id,
          visualStatus: 'invited',
          canResend: true,
        });
      }

      // Gate C: EXPIRED — reactivate record, update created_at, resend
      // Rule: never create a duplicate row — update the existing one atomically
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE client_portal_invite_tokens
              SET token = ${token},
                  expires_at = ${expiresAt},
                  is_used = false,
                  invite_status = 'invited',
                  created_at = NOW(),
                  updated_at = NOW(),
                  activated_at = NULL
              WHERE id = ${existingInvite.id}`
        );
        // Trinity Audit — Who, What, Where, When, Why (rollback if this fails)
        await tx.insert(auditLogs).values({
          workspaceId,
          userId: req.user?.id || 'system',
          userEmail: req.user?.email || 'system',
          action: 'client_portal_invite_reactivated' as any,
          entityType: 'client',
          entityId: clientId,
          changes: {
            who: req.user?.email || 'system',
            what: 'invite_reactivated',
            where: req.ip,
            when: new Date().toISOString(),
            why: 'Previous invite expired; manager requested reactivation',
            email, newExpiresAt: expiresAt.toISOString(),
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
        } as any);
      });

      const [wsRec] = await db.select({ orgCode: (workspaces as any).orgCode }).from(workspaces).where(eq((workspaces as any).id, workspaceId)).limit(1);
      const reactivateOrgCode = wsRec?.orgCode || 'ORG';
      const reactivateUrl = `${req.protocol}://${req.get('host')}/client-portal/setup?token=${token}&workspace=${workspaceId}&org=${reactivateOrgCode}`;

      NotificationDeliveryService.send({
        idempotencyKey: `portal-reactivate-${token.slice(0, 16)}`,
        type: 'client_portal_invite',
        workspaceId,
        recipientUserId: email,
        channel: 'email',
        subject: 'Your Invitation Has Been Renewed',
        body: { to: email, clientName: client.companyName || '', inviteUrl: reactivateUrl, expiresIn: '7 days', orgCode: reactivateOrgCode },
      }).catch(err => log.warn('[PortalInvite] Reactivation NDS failed (non-fatal):', err));

      return res.json({
        success: true, message: 'Expired invitation reactivated and resent.',
        inviteUrl: reactivateUrl, visualStatus: 'invited',
      });
    }
    // ── END LOGIC GATE ────────────────────────────────────────────────────────

    // ── ATOMIC: insert token + audit log ─────────────────────────────────────
    await db.transaction(async (tx) => {
      await tx.insert(clientPortalInviteTokens).values({
        workspaceId,
        clientId,
        email: email.toLowerCase().trim(),
        token,
        expiresAt,
        // Step 3: Persist — status is canonical DB truth, not calculated in UI
        ...(({ inviteStatus: 'invited' }) as any),
      });

      await tx.insert(auditLogs).values({
        workspaceId,
        userId: req.user?.id || 'system',
        userEmail: req.user?.email || 'system',
        action: 'client_portal_invite_sent' as any,
        entityType: 'client',
        entityId: clientId,
        changes: { email, expiresAt: expiresAt.toISOString(), ttlDays: 7 },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      } as any);
    });
    // ── END ATOMIC ───────────────────────────────────────────────────────────

    // Load org code for the invite URL (spec §4: link maps to /{org_code}/login)
    const [ws] = await db.select({ orgCode: (workspaces as any).orgCode })
      .from(workspaces)
      .where(eq((workspaces as any).id, workspaceId))
      .limit(1);
    const orgCode = ws?.orgCode || 'ORG';

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    // Spec §4: /{org_code}/login as the unified login entry point
    const inviteUrl = `${baseUrl}/client-portal/setup?token=${token}&workspace=${workspaceId}&org=${orgCode}`;

    // NDS send — fire after transaction committed (non-blocking to client)
    NotificationDeliveryService.send({
      idempotencyKey: `portal-invite-${token.slice(0, 16)}`,
      type: 'client_portal_invite',
      workspaceId,
      recipientUserId: email,
      channel: 'email',
      subject: 'Invitation to Client Portal',
      body: {
        to: email,
        clientName: client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim(),
        inviteUrl,
        expiresIn: '7 days',
        orgCode,
      },
    }).catch((err) => log.warn('[PortalInvite] NDS send failed (non-fatal):', err));

    res.json({
      success: true,
      message: 'Invitation sent',
      inviteUrl, // Return for admin display
      expiresAt: expiresAt.toISOString(),
      visualStatus: 'invited', // ORANGE border state
    });
  } catch (error) {
    log.error('Error sending client portal invite:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Internal server error' });
  }
});

/**
 * DELETE /api/clients/portal/invite/:inviteId/revoke
 * Manually revoke a pending invite — sets expired state (RED border).
 */
router.delete('/portal/invite/:inviteId/revoke', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const [invite] = await db.select().from(clientPortalInviteTokens)
      .where(and(
        eq(clientPortalInviteTokens.id, req.params.inviteId),
        eq(clientPortalInviteTokens.workspaceId, workspaceId),
      ))
      .limit(1);

    if (!invite) return res.status(404).json({ message: 'Invite not found.' });
    if (invite.isUsed) return res.status(409).json({ message: 'Cannot revoke an accepted invite.' });

    await db.transaction(async (tx) => {
      // Force-expire: set expiresAt to the past (Reaper canonical pattern)
      await tx.update(clientPortalInviteTokens)
        .set({ expiresAt: new Date(0), updatedAt: new Date() })
        .where(eq(clientPortalInviteTokens.id, invite.id));

      await tx.insert(auditLogs).values({
        workspaceId,
        userId: req.user?.id || 'system',
        userEmail: req.user?.email || 'system',
        action: 'client_portal_invite_revoked' as any,
        entityType: 'client_portal',
        entityId: invite.clientId,
        changes: { revokedInviteId: invite.id, email: invite.email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      } as any);
    });

    res.json({ success: true, message: 'Invitation revoked.', visualStatus: 'expired' });
  } catch (error) {
    log.error('Error revoking invite:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Internal server error' });
  }
});

/**
 * GET /api/clients/portal/invite/status
 * Returns all invites for the workspace with visual state machine status.
 * Used to render the Orange/Red/Green border system in the UI.
 */
router.get('/portal/invite/status', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const invites = await db.select().from(clientPortalInviteTokens)
      .where(eq(clientPortalInviteTokens.workspaceId, workspaceId));

    const withVisualStatus = invites.map((inv) => ({
      ...inv,
      visualStatus: getInviteVisualStatus(inv),
      // Border colors for frontend: orange=invited/pending, green=accepted, red=expired
      borderClass: (() => {
        const s = getInviteVisualStatus(inv);
        if (s === 'accepted') return 'border-green-500';
        if (s === 'expired') return 'border-red-500';
        return 'border-orange-500'; // pending | invited
      })(),
    }));

    res.json(withVisualStatus);
  } catch (error) {
    log.error('Error fetching invite status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
