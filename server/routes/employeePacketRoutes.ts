import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { documentSignatures } from '@shared/schema';
import { eq, and, desc, like } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('EmployeePacketRoutes');


export const employeePacketRouter = Router();
export const employeePacketPublicRouter = Router();

type PacketType = 'unarmed' | 'armed' | 'ppo' | 'contractor';

const PACKET_DISPLAY: Record<PacketType, string> = {
  unarmed: 'Unarmed Security Officer (Level II) — Texas',
  armed: 'Armed Security Officer (Level III) — Texas',
  ppo: 'Personal Protection Officer (PPO) — Texas',
  contractor: 'Independent Security Contractor — Texas',
};

// POST /api/employee-packets — Create and send a new onboarding packet
employeePacketRouter.post('/', async (req: any, res) => {
  try {
    const input = z.object({
      packetType: z.enum(['unarmed', 'armed', 'ppo', 'contractor']),
      recipientName: z.string().min(1),
      recipientEmail: z.string().email(),
      employeeId: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const token = randomUUID();
    const docType = `employee_packet_${input.packetType === 'contractor' ? 'unarmed' : input.packetType}` as any;
    const docTitle = PACKET_DISPLAY[input.packetType];

    const [packet] = await db.insert(documentSignatures).values({
      id: randomUUID(),
      workspaceId,
      applicationId: token,
      employeeId: input.employeeId || null,
      documentType: docType,
      documentTitle: docTitle,
      documentContent: JSON.stringify({
        packetType: input.packetType,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        notes: input.notes || '',
        formData: {},
        sectionInitials: {},
        sentAt: new Date().toISOString(),
        sentBy: (req.user)?.id,
      }),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    res.status(201).json({
      packet,
      portalUrl: `/packet-portal/${token}`,
      message: 'Packet created. Share the portal URL with the recipient.',
    });
  } catch (error: unknown) {
    log.error('[EmployeePackets] Create error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to create packet' });
  }
});

// GET /api/employee-packets — List all packets for workspace
employeePacketRouter.get('/', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const allSigs = await db.select().from(documentSignatures)
      .where(eq(documentSignatures.workspaceId, workspaceId))
      .orderBy(desc(documentSignatures.createdAt));

    const packets = allSigs.filter(s =>
      s.documentType === 'employee_packet_unarmed' ||
      s.documentType === 'employee_packet_armed' ||
      s.documentType === 'employee_packet_ppo' ||
      s.documentType === 'tx_service_contract'
    );

    res.json({ packets });
  } catch (error: unknown) {
    log.error('[EmployeePackets] List error:', error);
    res.status(500).json({ error: 'Failed to list packets' });
  }
});

// GET /api/employee-packets/:id — Single packet detail
employeePacketRouter.get('/:id', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const [packet] = await db.select().from(documentSignatures)
      .where(and(
        eq(documentSignatures.id, req.params.id),
        eq(documentSignatures.workspaceId, workspaceId)
      ));

    if (!packet) return res.status(404).json({ error: 'Packet not found' });
    res.json({ packet });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get packet' });
  }
});

// DELETE /api/employee-packets/:id — Void a packet
employeePacketRouter.delete('/:id', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    await db.update(documentSignatures)
      .set({ status: 'declined', updatedAt: new Date() })
      .where(and(
        eq(documentSignatures.id, req.params.id),
        eq(documentSignatures.workspaceId, workspaceId)
      ));
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to void packet' });
  }
});

// ─── PUBLIC PORTAL ROUTES (no auth) ──────────────────────────────────────────

// GET /api/public/packets/:token — Load packet data for portal
employeePacketPublicRouter.get('/:token', async (req, res) => {
  try {
    const [packet] = await db.select().from(documentSignatures)
      .where(eq(documentSignatures.applicationId, req.params.token));

    if (!packet) return res.status(404).json({ error: 'Packet not found or expired' });
    if (packet.status === 'signed') {
      return res.status(410).json({ error: 'This packet has already been completed', completed: true });
    }
    if (packet.status === 'declined') {
      return res.status(410).json({ error: 'This packet has been voided', voided: true });
    }

    await db.update(documentSignatures).set({
      viewedAt: packet.viewedAt || new Date(),
      viewCount: (packet.viewCount || 0) + 1,
      updatedAt: new Date(),
    }).where(eq(documentSignatures.applicationId, req.params.token));

    const data = JSON.parse(packet.documentContent || '{}');
    res.json({
      id: packet.id,
      packetType: data.packetType,
      documentTitle: packet.documentTitle,
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail,
      formData: data.formData || {},
      sectionInitials: data.sectionInitials || {},
      status: packet.status,
    });
  } catch (error: unknown) {
    log.error('[PacketPortal] Load error:', error);
    res.status(500).json({ error: 'Failed to load packet' });
  }
});

// POST /api/public/packets/:token/save — Save in-progress form data
employeePacketPublicRouter.post('/:token/save', async (req, res) => {
  try {
    const { formData, sectionInitials } = z.object({
      formData: z.record(z.any()),
      sectionInitials: z.record(z.boolean()),
    }).parse(req.body);

    const [packet] = await db.select().from(documentSignatures)
      .where(eq(documentSignatures.applicationId, req.params.token));
    if (!packet) return res.status(404).json({ error: 'Packet not found' });
    if (packet.status === 'signed') return res.status(409).json({ error: 'Already completed' });

    const existing = JSON.parse(packet.documentContent || '{}');
    await db.update(documentSignatures).set({
      documentContent: JSON.stringify({ ...existing, formData, sectionInitials }),
      updatedAt: new Date(),
    }).where(eq(documentSignatures.applicationId, req.params.token));

    res.json({ saved: true });
  } catch (error: unknown) {
    res.status(400).json({ error: sanitizeError(error) || 'Failed to save' });
  }
});

// POST /api/public/packets/:token/submit — Final submission with signature
employeePacketPublicRouter.post('/:token/submit', async (req, res) => {
  try {
    const input = z.object({
      formData: z.record(z.any()),
      sectionInitials: z.record(z.boolean()),
      signatureData: z.string().min(1),
      signedByName: z.string().min(1),
      signatureDate: z.string(),
    }).parse(req.body);

    const [packet] = await db.select().from(documentSignatures)
      .where(eq(documentSignatures.applicationId, req.params.token));
    if (!packet) return res.status(404).json({ error: 'Packet not found' });
    if (packet.status === 'signed') return res.status(409).json({ error: 'Already completed' });

    const existing = JSON.parse(packet.documentContent || '{}');
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';

    await db.update(documentSignatures).set({
      status: 'signed',
      signatureData: input.signatureData,
      signedByName: input.signedByName,
      signedAt: new Date(input.signatureDate),
      ipAddress: ip,
      userAgent: req.headers['user-agent'] || '',
      documentContent: JSON.stringify({
        ...existing,
        formData: input.formData,
        sectionInitials: input.sectionInitials,
        completedAt: new Date().toISOString(),
      }),
      updatedAt: new Date(),
    }).where(eq(documentSignatures.applicationId, req.params.token));

    res.json({ success: true, message: 'Packet completed and signed successfully.' });
  } catch (error: unknown) {
    log.error('[PacketPortal] Submit error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to submit' });
  }
});
