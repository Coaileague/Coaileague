/**
 * SRA Findings Routes — Phase 33 (Updated: all 32 checks)
 *
 * Check 11: 5 finding types — observation | violation | citation | enforcement_action | commendation
 * Check 12: citation → NDS to org_owner + compliance officers
 * Check 13: enforcement_action → NDS to org_owner + Trinity conscience flag via PlatformEventBus
 * Check 17: Evidence delivery NDS on finding closure
 * Check 18: Compliance rating calculated and stored on session closure
 *
 * GET    /api/sra/findings               — List findings for current session
 * POST   /api/sra/findings               — Create a new finding
 * PATCH  /api/sra/findings/:id           — Update finding status/details
 * POST   /api/sra/findings/close-session — Close audit session + compute compliance rating
 * GET    /api/sra/findings/:id/messages  — Get messages for finding thread
 * POST   /api/sra/findings/:id/messages  — Add message to finding thread
 */

import { Router, Response } from 'express';
import { db } from '../../db';
import { sraFindings, sraFindingMessages, sraAuditSessions, workspaceMembers, notifications } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireSRAAuth, SRARequest, logSraAction } from '../../middleware/sraAuth';
import { platformEventBus } from '../../services/platformEventBus';
import { createLogger } from '../../lib/logger';
import { z } from 'zod';
const log = createLogger('SraFindingsRoutes');


const router = Router();

// Check 11: The 5 canonical finding types from the Phase 33 spec
const VALID_TYPES = ['observation', 'violation', 'citation', 'enforcement_action', 'commendation'];
const VALID_SEVERITIES = ['critical', 'major', 'minor', 'informational'];

// Severity weights for compliance rating (Check 18) — critical carries 4× the weight of informational
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  informational: 1,
};

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getWorkspaceOwnerIds(workspaceId: string): Promise<string[]> {
  const owners = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.role, 'org_owner')
    ));
  return owners.map(o => o.userId);
}

async function getComplianceOfficerIds(workspaceId: string): Promise<string[]> {
  const officers = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      inArray(workspaceMembers.role, ['compliance_officer', 'org_admin'])
    ));
  return officers.map(o => o.userId);
}

async function sendNDSToUsers(
  userIds: string[],
  workspaceId: string,
  type: 'audit_access_request' | 'regulatory_violation',
  title: string,
  message: string
): Promise<void> {
  if (!userIds.length) return;
  const now = new Date();
  for (const userId of userIds) {
    await db.insert(notifications).values({
      userId,
      workspaceId,
      scope: 'workspace',
      category: 'compliance',
      type,
      title,
      message,
      isRead: false,
      createdAt: now,
    } as any);
  }
}

// ── GET /api/sra/findings ─────────────────────────────────────────────────────

router.get('/', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const findings = await db.select()
      .from(sraFindings)
      .where(and(
        eq(sraFindings.sessionId, sraSession.sessionId),
        eq(sraFindings.workspaceId, sraSession.workspaceId)
      ))
      .orderBy(sraFindings.createdAt);

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'data_view',
      { resource: 'findings', count: findings.length }, req);

    return res.json({ success: true, data: findings });
  } catch (err) {
    log.error('[SRA Findings] List error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load findings.' });
  }
});

// ── POST /api/sra/findings ────────────────────────────────────────────────────

router.post('/', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  const {
    findingType, severity, occupationCodeReference, description,
    evidenceUrls, recommendedAction, complianceDeadline, fineAmount,
    paymentInstructions, followUpRequired, followUpDate,
    linkedResourceType, linkedResourceId,
  } = req.body;

  if (!findingType || !description) {
    return res.status(400).json({ success: false, error: 'Finding type and description are required.' });
  }

  // Check 11: Validate against the 5 canonical finding types
  if (!VALID_TYPES.includes(findingType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid finding type. Must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }

  const resolvedSeverity = VALID_SEVERITIES.includes(severity) ? severity : 'minor';

  try {
    const [finding] = await db.insert(sraFindings).values({
      sessionId: sraSession.sessionId,
      workspaceId: sraSession.workspaceId,
      findingType,
      severity: resolvedSeverity,
      occupationCodeReference: occupationCodeReference || null,
      description: description.trim(),
      evidenceUrls: evidenceUrls || [],
      recommendedAction: recommendedAction || null,
      complianceDeadline: complianceDeadline ? new Date(complianceDeadline) : null,
      fineAmount: fineAmount || null,
      paymentInstructions: paymentInstructions || null,
      followUpRequired: followUpRequired || false,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      linkedResourceType: linkedResourceType || null,
      linkedResourceId: linkedResourceId || null,
      status: 'open',
    }).returning();

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'finding_created', {
      findingId: finding.id,
      findingType,
      severity: resolvedSeverity,
    }, req);

    // Check 12: Citation → immediate NDS to org_owner + compliance officers
    if (findingType === 'citation') {
      try {
        const ownerIds = await getWorkspaceOwnerIds(sraSession.workspaceId);
        const complianceIds = await getComplianceOfficerIds(sraSession.workspaceId);
        const recipientIds = [...new Set([...ownerIds, ...complianceIds])];
        await sendNDSToUsers(
          recipientIds,
          sraSession.workspaceId,
          'regulatory_violation',
          'Regulatory Citation Issued',
          `A formal regulatory citation (${resolvedSeverity} severity) has been issued against your workspace by a state auditor. Description: "${description.slice(0, 200)}". Immediate review and response is required.`
        );
      } catch (ndsErr) {
        log.error('[SRA Findings] Citation NDS failed (non-fatal):', ndsErr);
      }
    }

    // Check 13: Enforcement action → NDS to org_owner + Trinity conscience flag
    if (findingType === 'enforcement_action') {
      try {
        const ownerIds = await getWorkspaceOwnerIds(sraSession.workspaceId);
        await sendNDSToUsers(
          ownerIds,
          sraSession.workspaceId,
          'regulatory_violation',
          'Enforcement Action Initiated',
          `A regulatory enforcement action (${resolvedSeverity} severity) has been initiated against your workspace. This is a serious compliance matter requiring immediate response and legal counsel.`
        );

        // Trinity conscience flag — published to PlatformEventBus for Trinity oversight system
        platformEventBus.publish({
          type: 'sra_enforcement_action',
          category: 'compliance',
          title: 'SRA Enforcement Action — Conscience Flag',
          description: `Enforcement action finding (${resolvedSeverity}) logged for workspace ${sraSession.workspaceId}.`,
          workspaceId: sraSession.workspaceId,
          metadata: {
            findingId: finding.id,
            sessionId: sraSession.sessionId,
            sraAccountId: sraSession.sraAccountId,
            severity: resolvedSeverity,
            findingDescription: description.slice(0, 500),
          },
        }).catch((flagErr: any) => log.warn('[SRA Findings] Enforcement action event publish failed:', flagErr?.message));
      } catch (enfErr) {
        log.error('[SRA Findings] Enforcement action NDS/flag failed (non-fatal):', enfErr);
      }
    }

    return res.status(201).json({ success: true, data: finding });
  } catch (err) {
    log.error('[SRA Findings] Create error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create finding.' });
  }
});

// ── PATCH /api/sra/findings/:id ───────────────────────────────────────────────

router.patch('/:id', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  const { id } = req.params;
  const { status, description, recommendedAction, complianceDeadline, fineAmount, severity, followUpRequired, followUpDate } = req.body;

  try {
    const [existing] = await db.select()
      .from(sraFindings)
      .where(and(eq(sraFindings.id, id), eq(sraFindings.sessionId, sraSession.sessionId)))
      .limit(1);

    if (!existing) return res.status(404).json({ success: false, error: 'Finding not found.' });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (description) updates.description = description;
    if (recommendedAction !== undefined) updates.recommendedAction = recommendedAction;
    if (complianceDeadline) updates.complianceDeadline = new Date(complianceDeadline);
    if (fineAmount !== undefined) updates.fineAmount = fineAmount;
    if (severity) updates.severity = severity;
    if (followUpRequired !== undefined) updates.followUpRequired = followUpRequired;
    if (followUpDate) updates.followUpDate = new Date(followUpDate);
    if (status === 'closed') updates.closedAt = new Date();

    const [updated] = await db.update(sraFindings).set(updates).where(eq(sraFindings.id, id)).returning();

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'finding_updated', {
      findingId: id,
      changes: Object.keys(updates),
    }, req);

    // Check 17: Deliver evidence package NDS when a finding is individually closed
    if (status === 'closed') {
      try {
        const ownerIds = await getWorkspaceOwnerIds(sraSession.workspaceId);
        const evidenceList = (existing.evidenceUrls as string[] | null) || [];
        await sendNDSToUsers(
          ownerIds,
          sraSession.workspaceId,
          'audit_access_request',
          'Audit Finding Closed — Evidence Package Delivered',
          `Finding "${existing.description?.slice(0, 100)}" has been closed. Evidence package (${evidenceList.length} item${evidenceList.length !== 1 ? 's' : ''}): ${evidenceList.length > 0 ? evidenceList.slice(0, 3).join(', ') : 'None attached'}. Full evidence package is available in your SRA portal.`
        );
      } catch (evErr) {
        log.error('[SRA Findings] Evidence delivery NDS failed (non-fatal):', evErr);
      }
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    log.error('[SRA Findings] Update error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update finding.' });
  }
});

// ── POST /api/sra/findings/close-session ─────────────────────────────────────
// Check 18: Close the audit session and calculate weighted compliance rating

router.post('/close-session', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const allFindings = await db.select({
      id: sraFindings.id,
      findingType: sraFindings.findingType,
      severity: sraFindings.severity,
      status: sraFindings.status,
    })
    .from(sraFindings)
    .where(eq(sraFindings.sessionId, sraSession.sessionId));

    // Commendations and observations are excluded from the compliance score
    const scoredFindings = allFindings.filter(f =>
      f.findingType !== 'commendation' && f.findingType !== 'observation'
    );

    let totalWeight = 0;
    let remediatedWeight = 0;
    const bySeverity: Record<string, { total: number; remediated: number }> = {
      critical: { total: 0, remediated: 0 },
      major: { total: 0, remediated: 0 },
      minor: { total: 0, remediated: 0 },
      informational: { total: 0, remediated: 0 },
    };

    for (const f of scoredFindings) {
      const sev = f.severity || 'minor';
      const weight = SEVERITY_WEIGHT[sev] ?? 1;
      totalWeight += weight;
      if (bySeverity[sev]) bySeverity[sev].total++;
      if (f.status === 'remediated' || f.status === 'closed') {
        remediatedWeight += weight;
        if (bySeverity[sev]) bySeverity[sev].remediated++;
      }
    }

    // 0 scored findings = fully compliant (100%)
    const complianceRating = totalWeight === 0
      ? 100
      : Math.round((remediatedWeight / totalWeight) * 10000) / 100;

    const detail = {
      total: scoredFindings.length,
      totalAll: allFindings.length,
      remediatedWeight,
      totalWeight,
      bySeverity,
      commendations: allFindings.filter(f => f.findingType === 'commendation').length,
      observations: allFindings.filter(f => f.findingType === 'observation').length,
    };

    await db.update(sraAuditSessions)
      .set({
        status: 'closed',
        closedAt: new Date(),
        complianceRating: complianceRating.toFixed(2) as any,
        complianceRatingDetail: detail as any,
      })
      .where(eq(sraAuditSessions.id, sraSession.sessionId));

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'session_closed', {
      complianceRating,
      totalFindings: scoredFindings.length,
    }, req);

    // Check 17: Deliver full evidence package to org_owner on audit closure
    try {
      const ownerIds = await getWorkspaceOwnerIds(sraSession.workspaceId);
      await sendNDSToUsers(
        ownerIds,
        sraSession.workspaceId,
        'audit_access_request',
        'Regulatory Audit Closed — Final Report & Evidence Package',
        `The regulatory audit conducted by the state auditor has concluded. Compliance Rating: ${complianceRating.toFixed(1)}% (${scoredFindings.length} scored findings). The final signed audit report and complete evidence package are now available in the SRA Enforcement Documents section of your portal.`
      );
    } catch (evErr) {
      log.error('[SRA Close] Audit closure NDS failed (non-fatal):', evErr);
    }

    return res.json({
      success: true,
      complianceRating,
      complianceRatingDetail: detail,
      message: 'Audit session closed and compliance rating calculated.',
    });
  } catch (err) {
    log.error('[SRA Findings] Close session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to close audit session.' });
  }
});

// ── GET /api/sra/findings/:id/messages ───────────────────────────────────────

router.get('/:id/messages', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  const { id } = req.params;

  try {
    const messages = await db.select()
      .from(sraFindingMessages)
      .where(and(
        eq(sraFindingMessages.findingId, id),
        eq(sraFindingMessages.sessionId, sraSession.sessionId)
      ))
      .orderBy(sraFindingMessages.createdAt);

    return res.json({ success: true, data: messages });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load messages.' });
  }
});

// ── POST /api/sra/findings/:id/messages ──────────────────────────────────────

router.post('/:id/messages', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  const { id } = req.params;
  const { message, attachments } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required.' });
  }

  try {
    const [msg] = await db.insert(sraFindingMessages).values({
      findingId: id,
      sessionId: sraSession.sessionId,
      authorType: 'sra_auditor',
      authorId: sraSession.sraAccountId,
      message: message.trim(),
      attachments: attachments || [],
    }).returning();

    return res.status(201).json({ success: true, data: msg });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to add message.' });
  }
});

export default router;
