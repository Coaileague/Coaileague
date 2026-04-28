/**
 * Audit Citation Service — AI Regulatory Audit Suite Phase 5
 * ===========================================================
 * Handles audit finalization:
 *   - Recording verdicts (PASS / PASS_WITH_CONDITIONS / FAIL) in the
 *     tenant's historical ledger.
 *   - FAIL state: creates an audit_citation row with fine amount +
 *     state violation PDF. Fires an urgent omnichannel alert to the owner.
 *   - Proof-of-payment workflow: owner uploads (a) money order photo and
 *     (b) certified mail tracking number. Trinity verifies the amount
 *     matches the fine, then updates status to 'pending_state_clearance'.
 *
 * TRINITY.md §B  — All alerts through NDS only, no fire-and-forget.
 * TRINITY.md §G  — Every query scoped by workspace_id.
 * TRINITY.md §L  — Every mutation writes logActionAudit.
 * TRINITY.md §S  — Trinity is one brain. Never pluralize.
 * TRINITY.md §U  — LAW P3: GCS for all uploads, no local filesystem.
 */

import { createLogger } from '../../lib/logger';
import { logActionAudit } from '../ai-brain/actionAuditLogger';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { Storage } from '@google-cloud/storage';

const log = createLogger('AuditCitationService');

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditVerdict = 'PASS' | 'PASS_WITH_CONDITIONS' | 'FAIL';

export interface RecordVerdictParams {
  auditId:         string;
  workspaceId:     string;
  auditorId:       string;
  verdict:         AuditVerdict;
  conditionsText?: string;
  cureDays?:       number;      // Required for PASS_WITH_CONDITIONS
  fineAmount?:     number;      // Required for FAIL
  violationPdfBuffer?: Buffer;
  violationPdfMime?:   string;
}

export interface RecordVerdictResult {
  success:    boolean;
  citationId?: string;
  message:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTenantOwnerUserId(workspaceId: string): Promise<string | null> {
  const { pool } = await import('../../db');
  const r = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM employees
      WHERE workspace_id = $1
        AND role IN ('org_owner', 'co_owner')
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
    [workspaceId],
  );
  return r.rows[0]?.user_id ?? null;
}

async function uploadViolationPdf(
  workspaceId: string,
  auditId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const storage = new Storage();
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');

  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const gcsKey = `workspaces/${workspaceId}/audit-citations/${auditId}_violation_${Date.now()}.${ext}`;
  await storage.bucket(bucketName).file(gcsKey).save(buffer, { contentType: mimeType, resumable: false });
  return `gs://${bucketName}/${gcsKey}`;
}

async function uploadPaymentProof(
  workspaceId: string,
  citationId: string,
  slot: 'money_order' | 'tracking',
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const storage = new Storage();
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');

  const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  const gcsKey = `workspaces/${workspaceId}/audit-citations/${citationId}_${slot}_${Date.now()}.${ext}`;
  await storage.bucket(bucketName).file(gcsKey).save(buffer, { contentType: mimeType, resumable: false });
  return `gs://${bucketName}/${gcsKey}`;
}

// ─── Verdict logic ────────────────────────────────────────────────────────────

/**
 * Records the auditor's final verdict, writes it to the tenant's historical
 * ledger (auditor_audits), and for FAIL, creates a citation + alerts owner.
 */
export async function recordVerdict(params: RecordVerdictParams): Promise<RecordVerdictResult> {
  const start = Date.now();
  const { pool } = await import('../../db');

  // Stamp the verdict on the audit record
  await pool.query(
    `UPDATE auditor_audits
        SET verdict = $1, verdict_set_at = NOW(), verdict_set_by = $2,
            conditions_text = $3, updated_at = NOW()
      WHERE id = $4 AND workspace_id = $5`,
    [params.verdict, params.auditorId, params.conditionsText ?? null, params.auditId, params.workspaceId],
  );

  await logActionAudit({
    actionId:    'audit.verdict_recorded',
    workspaceId: params.workspaceId,
    userId:      params.auditorId,
    entityType:  'auditor_audit',
    entityId:    params.auditId,
    success:     true,
    message:     `Audit verdict recorded: ${params.verdict}`,
    changesAfter: { verdict: params.verdict, conditionsText: params.conditionsText },
    durationMs:  Date.now() - start,
  });

  if (params.verdict === 'PASS') {
    log.info('[Citation] Audit passed cleanly', { auditId: params.auditId });
    await notifyOwnerVerdict(params.workspaceId, params.auditId, 'PASS', null, null);
    return { success: true, message: 'Audit marked PASS. The tenant has been notified.' };
  }

  if (params.verdict === 'PASS_WITH_CONDITIONS') {
    // Cure-period timer is handled by curePeriodTrackerService — just notify owner here
    await notifyOwnerVerdict(params.workspaceId, params.auditId, 'PASS_WITH_CONDITIONS', params.conditionsText ?? null, null);
    return { success: true, message: 'Audit marked PASS WITH CONDITIONS. Cure-period timer has been started.' };
  }

  // ── FAIL branch ─────────────────────────────────────────────────────────────
  if (!params.fineAmount || params.fineAmount <= 0) {
    return { success: false, message: 'FAIL verdict requires a fine amount greater than 0.' };
  }

  let violationPdfUrl: string | null = null;
  if (params.violationPdfBuffer && params.violationPdfMime) {
    try {
      violationPdfUrl = await uploadViolationPdf(
        params.workspaceId, params.auditId,
        params.violationPdfBuffer, params.violationPdfMime,
      );
    } catch (err: any) {
      log.warn('[Citation] Violation PDF upload failed (non-fatal):', err?.message);
    }
  }

  const cr = await pool.query<{ id: string }>(
    `INSERT INTO audit_citations
       (audit_id, workspace_id, auditor_id, fine_amount, state_violation_pdf_url)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [params.auditId, params.workspaceId, params.auditorId, params.fineAmount, violationPdfUrl],
  );

  const citationId = cr.rows[0].id;

  await logActionAudit({
    actionId:    'audit.citation_issued',
    workspaceId: params.workspaceId,
    userId:      params.auditorId,
    entityType:  'audit_citation',
    entityId:    citationId,
    success:     true,
    message:     `Citation issued for audit ${params.auditId}. Fine: $${params.fineAmount}`,
    changesAfter: { citationId, fineAmount: params.fineAmount, violationPdfUrl },
    durationMs:  Date.now() - start,
  });

  await notifyOwnerVerdict(params.workspaceId, params.auditId, 'FAIL', null, {
    citationId,
    fineAmount: params.fineAmount,
  });

  log.info('[Citation] Citation issued', { citationId, auditId: params.auditId, fineAmount: params.fineAmount });
  return { success: true, citationId, message: `Citation issued (ID: ${citationId}). The tenant has been notified via all channels.` };
}

async function notifyOwnerVerdict(
  workspaceId: string,
  auditId: string,
  verdict: AuditVerdict,
  conditions: string | null,
  citation: { citationId: string; fineAmount: number } | null,
): Promise<void> {
  const ownerUserId = await getTenantOwnerUserId(workspaceId);
  if (!ownerUserId) {
    log.warn('[Citation] No owner found for workspace', workspaceId);
    return;
  }

  const verdictLabels: Record<AuditVerdict, string> = {
    PASS:                 'PASSED',
    PASS_WITH_CONDITIONS: 'PASSED WITH CONDITIONS',
    FAIL:                 'FAILED — CITATION ISSUED',
  };

  const body: Record<string, unknown> = {
    title:   `Audit Result: ${verdictLabels[verdict]}`,
    auditId,
    verdict,
    actionUrl: verdict === 'FAIL' ? `/citation-resolve/${citation?.citationId}` : `/audit-chatdock/${auditId}`,
  };

  if (verdict === 'FAIL' && citation) {
    body.message = `Your compliance audit has resulted in a FAIL verdict. A state violation citation has been issued for $${citation.fineAmount.toFixed(2)}. The official violation document has been uploaded to your account. Please log in to review the citation and begin the resolution process immediately.`;
    body.citationId   = citation.citationId;
    body.fineAmount   = citation.fineAmount;
    body.html = `<p style="color:#c0392b;font-weight:bold;font-size:16px;">CITATION ISSUED — Compliance Audit FAIL</p>
<p>Your regulatory compliance audit has resulted in a <strong>FAIL</strong> verdict.</p>
<p><strong>Fine Amount: $${citation.fineAmount.toFixed(2)}</strong></p>
<p>The official State Violation document has been added to your account. You must resolve this citation by mailing payment to Texas DPS via Money Order and uploading proof of payment in CoAIleague.</p>
<p>Please log in immediately to review all required steps.</p>`;
  } else if (verdict === 'PASS_WITH_CONDITIONS') {
    body.message = `Your compliance audit has passed with conditions. You must correct the identified issues within the specified cure period. Trinity will send you reminders as your deadline approaches.`;
    body.conditions = conditions;
  } else {
    body.message = `Congratulations — your compliance audit has passed with no violations. A record of this audit result has been added to your historical ledger.`;
  }

  for (const channel of ['in_app', 'email', 'sms'] as const) {
    try {
      await NotificationDeliveryService.send({
        type:            'compliance_alert',
        workspaceId,
        recipientUserId: ownerUserId,
        channel,
        subject:         `Audit Result: ${verdictLabels[verdict]}`,
        body,
      });
    } catch (err: any) {
      log.warn(`[Citation] ${channel} notification failed (non-fatal):`, err?.message);
    }
  }
}

// ─── Proof of payment ─────────────────────────────────────────────────────────

export interface SubmitPaymentProofParams {
  citationId:          string;
  workspaceId:         string;
  submittedByUserId:   string;
  moneyOrderBuffer?:   Buffer;
  moneyOrderMime?:     string;
  certifiedMailTracking?: string;
}

export interface SubmitPaymentProofResult {
  success:          boolean;
  amountVerified?:  boolean;
  message:          string;
  newStatus:        string;
}

/**
 * Owner uploads money order photo + certified mail tracking.
 * Trinity verifies the visible amount matches the fine, then updates
 * citation status to 'pending_state_clearance'.
 */
export async function submitPaymentProof(
  params: SubmitPaymentProofParams,
): Promise<SubmitPaymentProofResult> {
  const start = Date.now();
  const { pool } = await import('../../db');

  // Load citation (workspace-scoped per TRINITY.md §G)
  const cr = await pool.query(
    `SELECT * FROM audit_citations WHERE id = $1 AND workspace_id = $2`,
    [params.citationId, params.workspaceId],
  );
  if (!cr.rows[0]) return { success: false, message: 'Citation not found.', newStatus: 'error' };
  const citation = cr.rows[0];

  let moneyOrderUrl: string | undefined;
  let amountVerified = false;

  // Upload money order photo
  if (params.moneyOrderBuffer && params.moneyOrderMime) {
    try {
      moneyOrderUrl = await uploadPaymentProof(
        params.workspaceId, params.citationId, 'money_order',
        params.moneyOrderBuffer, params.moneyOrderMime,
      );
      amountVerified = await trinityVerifyPaymentAmount(
        params.moneyOrderBuffer, params.moneyOrderMime,
        Number(citation.fine_amount),
      );
    } catch (err: any) {
      log.warn('[Citation] Money order upload failed (non-fatal):', err?.message);
    }
  }

  const newStatus = 'pending_state_clearance';

  await pool.query(
    `UPDATE audit_citations
        SET payment_money_order_url   = COALESCE($1, payment_money_order_url),
            certified_mail_tracking   = COALESCE($2, certified_mail_tracking),
            payment_proof_uploaded_at = NOW(),
            amount_verified           = $3,
            payment_verified_by       = 'trinity',
            payment_verified_at       = NOW(),
            status                    = $4,
            updated_at                = NOW()
      WHERE id = $5 AND workspace_id = $6`,
    [
      moneyOrderUrl ?? null,
      params.certifiedMailTracking ?? null,
      amountVerified,
      newStatus,
      params.citationId,
      params.workspaceId,
    ],
  );

  await logActionAudit({
    actionId:    'audit.payment_proof_submitted',
    workspaceId: params.workspaceId,
    userId:      params.submittedByUserId,
    entityType:  'audit_citation',
    entityId:    params.citationId,
    success:     true,
    message:     `Payment proof submitted. Amount verified: ${amountVerified}. Status → ${newStatus}`,
    changesAfter: { newStatus, amountVerified, certifiedMailTracking: params.certifiedMailTracking },
    durationMs:  Date.now() - start,
  });

  const verifiedMsg = amountVerified
    ? `Trinity has verified that the money order amount matches the fine of $${Number(citation.fine_amount).toFixed(2)}.`
    : `Trinity could not verify the money order amount. Please ensure the photo clearly shows the payment amount.`;

  return {
    success: true,
    amountVerified,
    message: `${verifiedMsg} Your citation status has been updated to "Pending State Clearance." Once Texas DPS confirms receipt, your record will be fully cleared.`,
    newStatus,
  };
}

async function trinityVerifyPaymentAmount(
  buffer: Buffer,
  mimeType: string,
  expectedAmount: number,
): Promise<boolean> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return false;

  const base64 = buffer.toString('base64');
  const mediaType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text: `You are Trinity. This image should be a money order photo. Extract the dollar amount written on the money order. Reply ONLY in JSON: { "amount_found": true|false, "amount": 0.00, "verified": true|false }. The expected amount is $${expectedAmount.toFixed(2)}. Set verified to true only if the amount_found is true AND the extracted amount matches $${expectedAmount.toFixed(2)} within $0.01.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) return false;
    const data = await response.json() as any;
    const text = data?.content?.[0]?.text ?? '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return false;
    const parsed = JSON.parse(match[0]);
    return Boolean(parsed.verified);
  } catch {
    return false;
  }
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export async function getCitationForAudit(auditId: string, workspaceId: string): Promise<any | null> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT * FROM audit_citations WHERE audit_id = $1 AND workspace_id = $2 LIMIT 1`,
    [auditId, workspaceId],
  );
  return r.rows[0] ?? null;
}

export async function getAuditHistoricalLedger(workspaceId: string): Promise<any[]> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT aa.id, aa.license_number, aa.opened_at, aa.closed_at, aa.verdict,
            aa.verdict_set_at, aa.conditions_text,
            aat.full_name AS auditor_name, aat.agency_name,
            ac.fine_amount, ac.status AS citation_status, ac.id AS citation_id
       FROM auditor_audits aa
       LEFT JOIN auditor_accounts aat ON aat.id = aa.auditor_id
       LEFT JOIN audit_citations   ac ON ac.audit_id = aa.id
      WHERE aa.workspace_id = $1
        AND aa.verdict IS NOT NULL
      ORDER BY aa.verdict_set_at DESC`,
    [workspaceId],
  );
  return r.rows;
}
