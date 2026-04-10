/**
 * Staffing Broadcast Routes
 *
 * POST /api/staffing/broadcast                  — manager creates an open-shift broadcast  [requireAuth]
 * POST /api/staffing/calloff                    — officer submits call-off, fires 3-email sequence [requireAuth]
 * GET  /api/staffing/accept/:token              — officer clicks accept link in email (intentionally public)
 * POST /api/staffing/replacement/assign         — manager assigns replacement officer   [requireAuth]
 * GET  /api/staffing/replacement/confirm/:token — officer confirms replacement via email link (public)
 * GET  /api/staffing/replacement/decline/:token — officer declines replacement via email link (public)
 *
 * MIXED AUTH PATTERN: GET /accept/:token and /replacement/(confirm|decline)/:token are public
 * (token-controlled access via emailed link). All mutation routes use requireAuth middleware.
 * Do NOT add mount-level requireAuth in scheduling.ts as it would break public token routes.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('StaffingBroadcastRoutes');

import {
  createShiftBroadcast,
  acceptShiftToken,
  fireCallOffSequence,
  sendReplacementAssignmentEmail,
  resolveReplacementToken,
} from '../services/staffingBroadcastService';

export const staffingBroadcastRouter = Router();

// ─── POST /api/staffing/broadcast ─────────────────────────────────────────────
// Manager broadcasts an open shift to a list of officers. Requires auth.

const broadcastSchema = z.object({
  shiftId: z.string().min(1),
  siteName: z.string().min(1),
  shiftDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  postType: z.string().min(1),
  payRate: z.string().optional(),
  officerIds: z.array(z.string()).min(1, 'At least one officer required'),
  expiryHours: z.number().int().min(1).max(72).optional(),
  orgName: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

staffingBroadcastRouter.post('/broadcast', requireAuth, async (req: Request, res: Response) => {
  const user = req.user;
  const workspaceId = req.workspaceId || user?.currentWorkspaceId || (user as any)?.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace ID required' });

  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const result = await createShiftBroadcast({
      workspaceId,
      broadcastedBy: user?.id || (user as any)?.claims?.sub || 'system',
      ...parsed.data,
    });

    return res.json({
      broadcastId: result.broadcastId,
      sent: result.sent,
      failed: result.failed,
      message: `Broadcast sent to ${result.sent} officer(s)`,
    });
  } catch (err: unknown) {
    log.error('[StaffingBroadcastRoutes] Broadcast error:', sanitizeError(err));
    return res.status(500).json({ error: 'Failed to create broadcast' });
  }
});

// ─── POST /api/staffing/calloff ───────────────────────────────────────────────
// Officer submits a call-off; fires confirmation + manager alert + replacement broadcast.

const calloffSchema = z.object({
  shiftId: z.string().min(1),
  officerEmployeeId: z.string().min(1),
  siteName: z.string().min(1),
  shiftDate: z.string().min(1),
  shiftStart: z.string().min(1),
  shiftEnd: z.string().min(1),
  supervisorUserId: z.string().min(1),
  replacementCandidateEmployeeIds: z.array(z.string()).optional(),
  orgName: z.string().min(1),
  baseUrl: z.string().url().optional(),
  reason: z.string().optional(),
});

staffingBroadcastRouter.post('/calloff', requireAuth, async (req: Request, res: Response) => {
  const user = req.user;
  const workspaceId = req.workspaceId || user?.currentWorkspaceId || (user as any)?.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace ID required' });

  const parsed = calloffSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const result = await fireCallOffSequence({ workspaceId, ...parsed.data });
    return res.json({
      officerEmailSent: result.officerEmailSent,
      managerEmailSent: result.managerEmailSent,
      broadcastId: result.broadcastId,
      message: 'Call-off processed and notifications sent',
    });
  } catch (err: unknown) {
    log.error('[StaffingBroadcastRoutes] Call-off error:', sanitizeError(err));
    return res.status(500).json({ error: 'Failed to process call-off' });
  }
});

// ─── GET /api/staffing/accept/:token ─────────────────────────────────────────
// Public route — officer clicks the accept link in their email.
// Validates token, marks shift accepted, redirects to app success page.
// NO requireAuth — token is the credential, emailed directly to the officer.

staffingBroadcastRouter.get('/accept/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token || token.length < 30) {
    return res.redirect('/shift-accept?status=invalid');
  }

  try {
    const result = await acceptShiftToken(token);

    if (result.notFound) return res.redirect('/shift-accept?status=invalid');
    if (result.expired) return res.redirect('/shift-accept?status=expired');
    if (result.alreadyTaken) return res.redirect('/shift-accept?status=taken');
    if (!result.success) return res.redirect('/shift-accept?status=error');

    const name = encodeURIComponent(result.officerName ?? 'Officer');
    return res.redirect(`/shift-accept?status=success&officer=${name}&shiftId=${result.shiftId ?? ''}`);
  } catch (err: unknown) {
    log.error('[StaffingBroadcastRoutes] Accept token error:', sanitizeError(err));
    return res.redirect('/shift-accept?status=error');
  }
});

// ─── POST /api/staffing/replacement/assign ────────────────────────────────────
// Manager sends replacement assignment email to confirmed officer. Requires auth.

const assignSchema = z.object({
  replacementEmployeeId: z.string().min(1),
  siteName: z.string().min(1),
  siteAddress: z.string().min(1),
  shiftDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  supervisorName: z.string().min(1),
  supervisorPhone: z.string().optional(),
  postOrdersSummary: z.string().optional(),
  responseDeadline: z.string().min(1),
  orgName: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

staffingBroadcastRouter.post('/replacement/assign', requireAuth, async (req: Request, res: Response) => {
  const user = req.user;
  const workspaceId = req.workspaceId || user?.currentWorkspaceId || (user as any)?.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace ID required' });

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const sent = await sendReplacementAssignmentEmail({ workspaceId, ...parsed.data });
    if (!sent) return res.status(500).json({ error: 'Failed to send assignment email — officer may have no email on file' });
    return res.json({ sent: true, message: 'Replacement assignment email sent' });
  } catch (err: unknown) {
    log.error('[StaffingBroadcastRoutes] Replacement assign error:', sanitizeError(err));
    return res.status(500).json({ error: 'Failed to send assignment email' });
  }
});

// ─── GET /api/staffing/replacement/confirm/:token ─────────────────────────────
// Officer confirms a replacement assignment by clicking the link in their email.
// Intentionally public — the token IS the credential (same pattern as /accept/:token).

staffingBroadcastRouter.get('/replacement/confirm/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const result = await resolveReplacementToken(token, 'confirm');
    if (!result.valid) {
      if (result.expired) return res.redirect('/shift-accept?status=expired&type=replacement');
      return res.redirect('/shift-accept?status=invalid&type=replacement');
    }
    const siteName = encodeURIComponent(result.siteName ?? '');
    const shiftDate = encodeURIComponent(result.shiftDate ?? '');
    return res.redirect(`/shift-accept?status=confirmed&type=replacement&site=${siteName}&date=${shiftDate}`);
  } catch (err: unknown) {
    log.error('[StaffingBroadcastRoutes] Replacement confirm error:', sanitizeError(err));
    return res.redirect('/shift-accept?status=error&type=replacement');
  }
});

// ─── GET /api/staffing/replacement/decline/:token ─────────────────────────────
// Officer declines a replacement assignment by clicking the link in their email.
// Intentionally public — the token IS the credential.

staffingBroadcastRouter.get('/replacement/decline/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const result = await resolveReplacementToken(token, 'decline');
    if (!result.valid) {
      if (result.expired) return res.redirect('/shift-accept?status=expired&type=replacement');
      return res.redirect('/shift-accept?status=invalid&type=replacement');
    }
    const siteName = encodeURIComponent(result.siteName ?? '');
    const shiftDate = encodeURIComponent(result.shiftDate ?? '');
    return res.redirect(`/shift-accept?status=declined&type=replacement&site=${siteName}&date=${shiftDate}`);
  } catch (err: unknown) {
    log.error('[StaffingBroadcastRoutes] Replacement decline error:', sanitizeError(err));
    return res.redirect('/shift-accept?status=error&type=replacement');
  }
});
