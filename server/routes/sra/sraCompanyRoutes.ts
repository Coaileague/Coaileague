/**
 * SRA Company Response Routes — Phase 33 (Check 14)
 *
 * These endpoints allow the workspace org_owner / compliance officer to
 * respond to SRA findings from within the CoAIleague platform using
 * the standard CoAIleague auth (NOT the SRA session auth).
 *
 * All responses are recorded as threaded messages on the finding with
 * authorType = 'workspace_owner' and logged to sra_audit_log.
 *
 * POST /api/sra/company/findings/:id/acknowledge          — Acknowledge receipt
 * POST /api/sra/company/findings/:id/remediation-evidence — Submit remediation evidence
 * POST /api/sra/company/findings/:id/payment-confirmation — Submit fine payment confirmation
 * POST /api/sra/company/findings/:id/appeal               — Submit formal appeal
 * POST /api/sra/company/findings/:id/extension            — Request a compliance deadline extension
 */

import { Router, Response } from 'express';
import { db } from '../../db';
import { sraFindings, sraFindingMessages, sraAuditLog } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../../auth';
import { createLogger } from '../../lib/logger';
const log = createLogger('SraCompanyRoutes');


const router = Router();

/** All company response routes require standard CoAIleague auth */
router.use(requireAuth);

// ── Utility: verify finding belongs to requester's workspace ──────────────────

async function getFindingForWorkspace(findingId: string, workspaceId: string) {
  const [finding] = await db.select()
    .from(sraFindings)
    .where(and(
      eq(sraFindings.id, findingId),
      eq(sraFindings.workspaceId, workspaceId)
    ))
    .limit(1);
  return finding;
}

/** Append a thread message from the workspace side and log to sra_audit_log */
async function recordCompanyResponse(
  findingId: string,
  sessionId: string,
  workspaceId: string,
  userId: string,
  message: string,
  attachments: unknown[],
  actionType: string,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  req: ReturnType<typeof Router>['get'] extends (path: string, ...handlers: infer H) => void ? never : Parameters<Parameters<typeof Router>[0]>[0]
): Promise<void> {
  await db.insert(sraFindingMessages).values({
    findingId,
    sessionId,
    authorType: 'workspace_owner',
    authorId: userId,
    message,
    attachments: attachments || [],
  });

  await db.insert(sraAuditLog).values({
    sessionId,
    sraAccountId: 'workspace_response',
    workspaceId,
    actionType,
    ipAddress: (req as any).ip || undefined,
    userAgent: (req as any).headers?.['user-agent'] || undefined,
    metadata: { findingId, userId, message: message.slice(0, 200) },
  });
}

// ── POST /api/sra/company/findings/:id/acknowledge ───────────────────────────

router.post('/findings/:id/acknowledge', async (req: any, res: Response) => {
  const findingId = req.params.id;
  const workspaceId = req.workspaceId;
  const userId = req.userId;

  if (!workspaceId) return res.status(403).json({ success: false, error: 'Workspace context required.' });

  try {
    const finding = await getFindingForWorkspace(findingId, workspaceId);
    if (!finding) return res.status(404).json({ success: false, error: 'Finding not found in your workspace.' });

    const { acknowledgementNote } = req.body;
    const message = `ACKNOWLEDGEMENT: This workspace acknowledges receipt of finding ID ${findingId}. ${acknowledgementNote ? `Note: ${acknowledgementNote}` : ''}`.trim();

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await recordCompanyResponse(findingId, finding.sessionId, workspaceId, userId, message, [], 'company_acknowledged', req);
    return res.json({ success: true, message: 'Finding acknowledged.' });
  } catch (err) {
    log.error('[SRA Company] Acknowledge error:', err);
    return res.status(500).json({ success: false, error: 'Failed to acknowledge finding.' });
  }
});

// ── POST /api/sra/company/findings/:id/remediation-evidence ──────────────────

router.post('/findings/:id/remediation-evidence', async (req: any, res: Response) => {
  const findingId = req.params.id;
  const workspaceId = req.workspaceId;
  const userId = req.userId;

  if (!workspaceId) return res.status(403).json({ success: false, error: 'Workspace context required.' });

  try {
    const finding = await getFindingForWorkspace(findingId, workspaceId);
    if (!finding) return res.status(404).json({ success: false, error: 'Finding not found in your workspace.' });

    const { description, evidenceUrls } = req.body;
    if (!description) return res.status(400).json({ success: false, error: 'Remediation description is required.' });

    const urlList: string[] = Array.isArray(evidenceUrls) ? evidenceUrls : [];
    const message = `REMEDIATION EVIDENCE SUBMITTED: ${description}. Evidence files: ${urlList.length > 0 ? urlList.join(', ') : 'None attached'}.`;

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await recordCompanyResponse(findingId, finding.sessionId, workspaceId, userId, message, urlList, 'company_remediation_submitted', req);
    await db.update(sraFindings)
      .set({ status: 'remediated', updatedAt: new Date() })
      .where(eq(sraFindings.id, findingId));
    return res.json({ success: true, message: 'Remediation evidence submitted and finding marked as remediated.' });
  } catch (err) {
    log.error('[SRA Company] Remediation evidence error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit remediation evidence.' });
  }
});

// ── POST /api/sra/company/findings/:id/payment-confirmation ──────────────────

router.post('/findings/:id/payment-confirmation', async (req: any, res: Response) => {
  const findingId = req.params.id;
  const workspaceId = req.workspaceId;
  const userId = req.userId;

  if (!workspaceId) return res.status(403).json({ success: false, error: 'Workspace context required.' });

  try {
    const finding = await getFindingForWorkspace(findingId, workspaceId);
    if (!finding) return res.status(404).json({ success: false, error: 'Finding not found in your workspace.' });

    const { paymentReference, amount, paymentDate, receiptUrl } = req.body;
    if (!paymentReference) return res.status(400).json({ success: false, error: 'Payment reference number is required.' });

    const message = `PAYMENT CONFIRMATION: Reference #${paymentReference}. Amount: ${amount ? `$${amount}` : 'Not specified'}. Payment Date: ${paymentDate || 'Not specified'}. Receipt: ${receiptUrl || 'Not attached'}.`;

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await recordCompanyResponse(findingId, finding.sessionId, workspaceId, userId, message, receiptUrl ? [receiptUrl] : [], 'company_payment_confirmed', req);
    return res.json({ success: true, message: 'Payment confirmation submitted.' });
  } catch (err) {
    log.error('[SRA Company] Payment confirmation error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit payment confirmation.' });
  }
});

// ── POST /api/sra/company/findings/:id/appeal ────────────────────────────────

router.post('/findings/:id/appeal', async (req: any, res: Response) => {
  const findingId = req.params.id;
  const workspaceId = req.workspaceId;
  const userId = req.userId;

  if (!workspaceId) return res.status(403).json({ success: false, error: 'Workspace context required.' });

  try {
    const finding = await getFindingForWorkspace(findingId, workspaceId);
    if (!finding) return res.status(404).json({ success: false, error: 'Finding not found in your workspace.' });

    const { groundsForAppeal, supportingDocumentUrls } = req.body;
    if (!groundsForAppeal) return res.status(400).json({ success: false, error: 'Grounds for appeal are required.' });

    const docList: string[] = Array.isArray(supportingDocumentUrls) ? supportingDocumentUrls : [];
    const message = `FORMAL APPEAL SUBMITTED: Grounds: ${groundsForAppeal}. Supporting documents: ${docList.length > 0 ? docList.join(', ') : 'None attached'}. This appeal is formally submitted for regulatory review.`;

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await recordCompanyResponse(findingId, finding.sessionId, workspaceId, userId, message, docList, 'company_appeal_submitted', req);
    await db.update(sraFindings)
      .set({ status: 'appealed', updatedAt: new Date() })
      .where(eq(sraFindings.id, findingId));
    return res.json({ success: true, message: 'Appeal submitted. Finding status set to appealed.' });
  } catch (err) {
    log.error('[SRA Company] Appeal error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit appeal.' });
  }
});

// ── POST /api/sra/company/findings/:id/extension ─────────────────────────────

router.post('/findings/:id/extension', async (req: any, res: Response) => {
  const findingId = req.params.id;
  const workspaceId = req.workspaceId;
  const userId = req.userId;

  if (!workspaceId) return res.status(403).json({ success: false, error: 'Workspace context required.' });

  try {
    const finding = await getFindingForWorkspace(findingId, workspaceId);
    if (!finding) return res.status(404).json({ success: false, error: 'Finding not found in your workspace.' });

    const { requestedExtensionDate, justification } = req.body;
    if (!requestedExtensionDate || !justification) {
      return res.status(400).json({ success: false, error: 'Requested extension date and justification are required.' });
    }

    const message = `EXTENSION REQUEST: Requesting extension of compliance deadline to ${new Date(requestedExtensionDate).toLocaleDateString()}. Justification: ${justification}.`;

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await recordCompanyResponse(findingId, finding.sessionId, workspaceId, userId, message, [], 'company_extension_requested', req);
    return res.json({ success: true, message: 'Extension request submitted to the auditor.' });
  } catch (err) {
    log.error('[SRA Company] Extension request error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit extension request.' });
  }
});

export default router;
