// Terms of Service Routes — canonical file for TOS sign/status/link routes
// Canonical prefix: /api/tos
// Public routes (no auth required — signed before account exists)
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { pool, db } from "../db";
import { tosAgreements } from '@shared/schema';
import { typedPool, typedPoolExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('TosRoutes');


const tosRouter = Router();

tosRouter.get("/text", (_req, res) => {
  res.json({ version: "2026-03-01", lastUpdated: "March 1, 2026" });
});

tosRouter.post("/sign", async (req: any, res) => {
  try {
    const { email, fullName, initials, agreementType, orgName, inviteToken } = req.body;
    if (!email || !fullName || !initials || !agreementType) {
      return res.status(400).json({ error: "email, fullName, initials, and agreementType are required" });
    }
    if (!['org_registration', 'user_onboarding'].includes(agreementType)) {
      return res.status(400).json({ error: "agreementType must be org_registration or user_onboarding" });
    }

    const userId      = req.user?.id || req.session?.userId || null;
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.session?.workspaceId || req.session?.activeWorkspaceId || null;
    const ipAddress   = req.ip || req.connection?.remoteAddress || null;
    const userAgent   = req.get('user-agent') || null;

    const [record] = await db
      .insert(tosAgreements)
      .values({
        email,
        fullName,
        initials,
        agreementType,
        orgName: orgName || null,
        inviteToken: inviteToken || null,
        userId,
        workspaceId,
        ipAddress,
        userAgent,
        tosVersion: '2026-03-01',
      })
      .returning({ id: tosAgreements.id, agreedAt: tosAgreements.agreedAt });

    res.json({ success: true, agreementId: record.id, agreedAt: record.agreedAt });
  } catch (err: unknown) {
    log.error('[TOS] Sign error:', sanitizeError(err));
    res.status(500).json({ error: "Failed to record agreement" });
  }
});

tosRouter.get("/status", async (req: any, res) => {
  try {
    if (!req.session?.userId) return res.json({ hasSigned: false, agreements: [] });
    const userId      = req.session.userId;
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.session.activeWorkspaceId || req.session.workspaceId;

    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: tos_agreements | Verified: 2026-03-23
    const { rows } = await typedPool(
      `SELECT id, agreement_type, agreed_at, tos_version
       FROM tos_agreements
       WHERE user_id = $1
       ORDER BY agreed_at DESC`,
      [userId]
    );

    res.json({ hasSigned: rows.length > 0, agreements: rows, workspaceId });
  } catch (err: unknown) {
    log.error('[TOS] Status error:', sanitizeError(err));
    res.status(500).json({ error: "Failed to check status" });
  }
});

tosRouter.patch("/link-workspace", async (req: any, res) => {
  try {
    const { agreementId, workspaceId } = req.body;
    if (!agreementId || !workspaceId) return res.status(400).json({ error: "agreementId and workspaceId required" });

    // CATEGORY C — Raw SQL retained: COALESCE in SET clause for conditional update | Tables: tos_agreements | Verified: 2026-03-23
    await typedPoolExec(
      `UPDATE tos_agreements SET workspace_id = $1, user_id = COALESCE($2, user_id)
       WHERE id = $3`,
      [workspaceId, req.session?.userId || null, agreementId]
    );

    res.json({ success: true });
  } catch (err: unknown) {
    log.error('[TOS] Link error:', sanitizeError(err));
    res.status(500).json({ error: "Failed to link workspace" });
  }
});

export default tosRouter;
