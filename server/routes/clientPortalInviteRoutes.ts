import { Router } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { clients, clientPortalInviteTokens, auditLogs, notifications, users, employees } from '@shared/schema';
import { requireManagerOrPlatformStaff, type AuthenticatedRequest } from '../rbac';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { createLogger } from '../lib/logger';
import { sanitizeError } from '../middleware/errorHandler';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const log = createLogger('ClientPortalInviteRoutes');
const router = Router();

/**
 * GET /api/clients/portal/setup/:token
 * Validates a client portal invite token.
 */
router.get('/portal/setup/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const [invite] = await db.select().from(clientPortalInviteTokens)
      .where(eq(clientPortalInviteTokens.token, token))
      .limit(1);

    if (!invite) return res.status(404).json({ message: 'Invitation not found.' });
    if (new Date() > new Date(invite.expiresAt)) return res.status(410).json({ message: 'Invitation expired.' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (invite.status !== 'pending') return res.status(409).json({ message: 'Invitation already used.' });

    const [client] = await db.select().from(clients)
      .where(eq(clients.id, invite.clientId))
      .limit(1);

    res.json({
      token: invite.token,
      email: invite.email,
      companyName: client?.companyName || 'Valued Client',
      workspaceId: invite.workspaceId,
    });
  } catch (error) {
    log.error('Error validating portal invite:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/clients/portal/setup/:token
 * Accepts a client portal invite, creates a user, and links to client.
 */
router.post('/portal/setup/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password, firstName, lastName } = req.body;

    if (!password || !firstName || !lastName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [invite] = await db.select().from(clientPortalInviteTokens)
      .where(eq(clientPortalInviteTokens.token, token))
      .limit(1);

    if (!invite) return res.status(404).json({ message: 'Invitation not found.' });
    if (new Date() > new Date(invite.expiresAt)) return res.status(410).json({ message: 'Invitation expired.' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (invite.status !== 'pending') return res.status(409).json({ message: 'Invitation already used.' });

    const normalizedEmail = invite.email.toLowerCase().trim();
    const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    await db.transaction(async (tx) => {
      // Create user
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

      // Link client to user
      await tx.update(clients)
        .set({ userId, updatedAt: new Date() })
        .where(eq(clients.id, invite.clientId));

      // Mark invite used
      await tx.update(clientPortalInviteTokens)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(clientPortalInviteTokens.id, invite.id));
    });

    // GAP-SEC-SESS: Regenerate session on portal invite acceptance to prevent session fixation.
    if (req.session) {
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            log.error('[PortalInvite] Session regeneration failed:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      req.session.userId = userId;
    }

    res.json({ success: true, message: 'Portal account created successfully' });
  } catch (error) {
    log.error('Error accepting portal invite:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/invite
 * Generates a 48-hour client portal invitation token and sends via NDS.
 * Restricts to Managers+ and read-only production tenants.
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
    if (!client.email && !client.pocEmail) {
      return res.status(400).json({ message: 'Client has no email or POC email configured.' });
    }

    const email = client.email || client.pocEmail!;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await db.insert(clientPortalInviteTokens).values({
      workspaceId,
      clientId,
      email,
      token,
      expiresAt,
    });

    const inviteUrl = `${req.protocol}://${req.get('host')}/client-portal/setup?token=${token}`;

    await NotificationDeliveryService.send({
      type: 'client_portal_invite',
      workspaceId,
      recipientUserId: email, // NDS handles email delivery if userId is not found
      channel: 'email',
      subject: 'Invitation to Client Portal',
      body: {
        to: email,
        clientName: client.companyName || `${client.firstName} ${client.lastName}`,
        inviteUrl,
        expiresIn: '48 hours'
      }
    });

    // Audit Log
    await db.insert(auditLogs).values({
      workspaceId,
      userId: req.user?.id || 'system',
      userEmail: req.user?.email || 'system',
      action: 'client_portal_invite_sent' as any,
      entityType: 'client',
      entityId: clientId,
      changes: { email, expiresAt: expiresAt.toISOString() },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    } as any);

    res.json({ success: true, message: 'Invitation sent' });
  } catch (error) {
    log.error('Error sending client portal invite:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Internal server error' });
  }
});

export default router;
