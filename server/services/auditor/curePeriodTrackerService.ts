/**
 * Cure Period Tracker Service — AI Regulatory Audit Suite Phase 6
 * ===============================================================
 * Manages the "Days to Cure" countdown for PASS_WITH_CONDITIONS audits.
 *
 * Lifecycle:
 *   1. When a PASS_WITH_CONDITIONS verdict is recorded, `startCurePeriod()`
 *      creates an audit_condition_timers row with deadline_at.
 *   2. The daily "Audit Cure Period Heartbeat" cron (autonomousScheduler.ts)
 *      calls `runCureHeartbeat()` once per day at 6AM.
 *   3. The heartbeat sends escalating reminders via NDS (3-strike system):
 *        7 days remaining → gentle Chatdock nudge
 *       72 hours remaining → elevated Chatdock message + email
 *       24 hours remaining → final warning in-app + SMS
 *   4. If the tenant uploads corrections and Trinity verifies them:
 *      `verifyCureCorrections()` cancels all future reminders, marks PASS.
 *   5. If the deadline passes without verification:
 *      `runCureHeartbeat()` auto-converts to FAIL, assesses a default fine,
 *      and alerts the auditor.
 *
 * TRINITY.md §B  — All notifications through NDS, no fire-and-forget.
 * TRINITY.md §G  — All DB queries scoped by workspace_id.
 * TRINITY.md §L  — All mutations write logActionAudit.
 * TRINITY.md §Q  — isWorkspaceServiceable gate before spending tokens.
 * TRINITY.md §S  — Trinity is one brain; never pluralize.
 * TRINITY.md §U  — LAW P3: GCS for all uploads.
 */

import { createLogger } from '../../lib/logger';
import { logActionAudit } from '../ai-brain/actionAuditLogger';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { Storage } from '@google-cloud/storage';

const log = createLogger('CurePeriodTracker');

// Default fine assessed if cure period expires without resolution (§6 spec)
const DEFAULT_EXPIRY_FINE = 500.00;

// ─── Public: start a cure period (called immediately after PASS_WITH_CONDITIONS) ─

export async function startCurePeriod(params: {
  auditId:        string;
  workspaceId:    string;
  conditionsText: string;
  cureDays:       number;
  setByAuditorId: string;
}): Promise<{ timerId: string; deadlineAt: Date }> {
  const { pool } = await import('../../db');
  const deadlineAt = new Date();
  deadlineAt.setDate(deadlineAt.getDate() + params.cureDays);

  const r = await pool.query<{ id: string }>(
    `INSERT INTO audit_condition_timers
       (audit_id, workspace_id, conditions_text, cure_days, deadline_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (audit_id) DO UPDATE
       SET conditions_text = EXCLUDED.conditions_text,
           cure_days       = EXCLUDED.cure_days,
           deadline_at     = EXCLUDED.deadline_at,
           status          = 'active',
           updated_at      = NOW()
     RETURNING id`,
    [params.auditId, params.workspaceId, params.conditionsText, params.cureDays, deadlineAt],
  );

  const timerId = r.rows[0].id;

  await logActionAudit({
    actionId:    'cure_period.started',
    workspaceId: params.workspaceId,
    userId:      params.setByAuditorId,
    entityType:  'audit_condition_timer',
    entityId:    timerId,
    success:     true,
    message:     `Cure period started. ${params.cureDays} days to cure. Deadline: ${deadlineAt.toISOString()}`,
    changesAfter: { cureDays: params.cureDays, deadlineAt, conditionsText: params.conditionsText },
  });

  log.info('[CurePeriod] Timer started', { timerId, auditId: params.auditId, deadlineAt });
  return { timerId, deadlineAt };
}

// ─── Get cure status for UI ────────────────────────────────────────────────────

export interface CureStatus {
  timerId:         string;
  status:          string;
  conditionsText:  string;
  cureDays:        number;
  deadlineAt:      Date;
  hoursRemaining:  number;
  daysRemaining:   number;
  isExpired:       boolean;
  remindersSent:   { sevenDay: boolean; seventyTwoHour: boolean; twentyFourHour: boolean };
}

export async function getCureStatus(auditId: string, workspaceId: string): Promise<CureStatus | null> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT * FROM audit_condition_timers WHERE audit_id = $1 AND workspace_id = $2 LIMIT 1`,
    [auditId, workspaceId],
  );
  if (!r.rows[0]) return null;

  const row = r.rows[0];
  const deadline = new Date(row.deadline_at);
  const now = new Date();
  const msRemaining = deadline.getTime() - now.getTime();
  const hoursRemaining = Math.max(0, Math.floor(msRemaining / (1000 * 60 * 60)));
  const daysRemaining  = Math.max(0, Math.floor(hoursRemaining / 24));

  return {
    timerId:        row.id,
    status:         row.status,
    conditionsText: row.conditions_text,
    cureDays:       row.cure_days,
    deadlineAt:     deadline,
    hoursRemaining,
    daysRemaining,
    isExpired:      msRemaining <= 0 && row.status === 'active',
    remindersSent: {
      sevenDay:      row.reminder_7d_sent,
      seventyTwoHour: row.reminder_72h_sent,
      twentyFourHour: row.reminder_24h_sent,
    },
  };
}

// ─── Owner user resolver ──────────────────────────────────────────────────────

async function getOwnerForWorkspace(workspaceId: string): Promise<string | null> {
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

async function getAuditorEmailForAudit(auditId: string): Promise<string | null> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT aa.email FROM auditor_accounts aa
       JOIN auditor_audits aud ON aud.auditor_id = aa.id
      WHERE aud.id = $1
      LIMIT 1`,
    [auditId],
  );
  return r.rows[0]?.email ?? null;
}

// ─── Strike-based reminder sender ────────────────────────────────────────────

type ReminderStrike = '7d' | '72h' | '24h';

async function sendReminderStrike(
  timer: any,
  ownerUserId: string,
  strike: ReminderStrike,
): Promise<void> {
  const strikeConfig = {
    '7d':  {
      channel: 'in_app' as const,
      subject: 'Compliance Cure Period: 7 Days Remaining',
      message: `A friendly reminder: you have 7 days remaining to address the conditions identified in your recent compliance audit. Please upload your corrective documentation as soon as possible. Trinity is here to help — ask any questions in your Audit Chatdock.`,
      alsoEmail: false,
      alsoSms: false,
    },
    '72h': {
      channel: 'in_app' as const,
      subject: 'IMPORTANT: Compliance Cure Period — 72 Hours Remaining',
      message: `IMPORTANT: Your compliance cure period expires in 72 hours. You must upload verified corrections before the deadline or your audit status will automatically convert to FAIL and a default fine will be assessed. Please log in immediately.`,
      alsoEmail: true,
      alsoSms: false,
    },
    '24h': {
      channel: 'in_app' as const,
      subject: 'FINAL WARNING: Compliance Cure Period Expires in 24 Hours',
      message: `FINAL WARNING: Your compliance cure period expires in less than 24 hours. If corrections are not uploaded and verified by Trinity before the deadline, your audit status will convert to FAIL and a $${DEFAULT_EXPIRY_FINE.toFixed(2)} default fine will be assessed. Act now.`,
      alsoEmail: false,
      alsoSms: true,
    },
  };

  const config = strikeConfig[strike];

  const body = {
    title:     config.subject,
    message:   config.message,
    auditId:   timer.audit_id,
    timerId:   timer.id,
    actionUrl: `/audit-chatdock/${timer.audit_id}`,
    strike,
  };

  // In-app always
  try {
    await NotificationDeliveryService.send({
      type:            'compliance_alert',
      workspaceId:     timer.workspace_id,
      recipientUserId: ownerUserId,
      channel:         'in_app',
      subject:         config.subject,
      body,
    });
  } catch (err: any) {
    log.warn(`[CurePeriod] In-app ${strike} alert failed (non-fatal):`, err?.message);
  }

  if (config.alsoEmail) {
    try {
      await NotificationDeliveryService.send({
        type:            'compliance_alert',
        workspaceId:     timer.workspace_id,
        recipientUserId: ownerUserId,
        channel:         'email',
        subject:         config.subject,
        body: { ...body, html: `<p style="font-weight:bold;color:#e74c3c;">${config.message}</p>` },
      });
    } catch (err: any) {
      log.warn(`[CurePeriod] Email ${strike} alert failed (non-fatal):`, err?.message);
    }
  }

  if (config.alsoSms) {
    try {
      await NotificationDeliveryService.send({
        type:            'compliance_alert',
        workspaceId:     timer.workspace_id,
        recipientUserId: ownerUserId,
        channel:         'sms',
        subject:         config.subject,
        body:            { message: config.message },
      });
    } catch (err: any) {
      log.warn(`[CurePeriod] SMS ${strike} alert failed (non-fatal):`, err?.message);
    }
  }
}

// ─── Auto-FAIL conversion ─────────────────────────────────────────────────────

async function convertToAutoFail(timer: any): Promise<void> {
  const { pool } = await import('../../db');

  // Convert verdict
  await pool.query(
    `UPDATE auditor_audits
        SET verdict = 'FAIL', verdict_set_at = NOW(), verdict_set_by = 'trinity',
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2`,
    [timer.audit_id, timer.workspace_id],
  );

  // Insert default citation
  const cr = await pool.query<{ id: string }>(
    `INSERT INTO audit_citations
       (audit_id, workspace_id, auditor_id, fine_amount, issued_at)
     VALUES ($1,$2,'trinity',$3,NOW())
     RETURNING id`,
    [timer.audit_id, timer.workspace_id, DEFAULT_EXPIRY_FINE],
  );

  // Mark timer expired
  await pool.query(
    `UPDATE audit_condition_timers
        SET status = 'expired', default_fine_assessed = true, updated_at = NOW()
      WHERE id = $1`,
    [timer.id],
  );

  await logActionAudit({
    actionId:    'cure_period.expired_auto_fail',
    workspaceId: timer.workspace_id,
    userId:      'trinity',
    entityType:  'audit_condition_timer',
    entityId:    timer.id,
    success:     true,
    message:     `Cure period expired. Auto-converted audit ${timer.audit_id} to FAIL. Default fine: $${DEFAULT_EXPIRY_FINE}`,
    changesAfter: { newVerdict: 'FAIL', citationId: cr.rows[0]?.id, defaultFine: DEFAULT_EXPIRY_FINE },
  });

  // Alert owner
  const ownerUserId = await getOwnerForWorkspace(timer.workspace_id);
  if (ownerUserId) {
    for (const channel of ['in_app', 'email', 'sms'] as const) {
      try {
        await NotificationDeliveryService.send({
          type:            'compliance_alert',
          workspaceId:     timer.workspace_id,
          recipientUserId: ownerUserId,
          channel,
          subject:         'URGENT: Compliance Cure Period Expired — Audit Converted to FAIL',
          body: {
            title:   'Cure Period Expired — FAIL',
            message: `Your compliance cure period has expired without verified corrections. Your audit status has automatically been converted to FAIL and a default fine of $${DEFAULT_EXPIRY_FINE.toFixed(2)} has been assessed. Please log in to begin the citation resolution process.`,
            auditId: timer.audit_id,
            fineAmount: DEFAULT_EXPIRY_FINE,
            actionUrl: `/citation-resolve/${cr.rows[0]?.id}`,
          },
        });
      } catch (err: any) {
        log.warn(`[CurePeriod] Auto-FAIL ${channel} alert failed (non-fatal):`, err?.message);
      }
    }
  }

  // Alert auditor via email (auditor has a separate account system)
  const auditorEmail = await getAuditorEmailForAudit(timer.audit_id);
  if (auditorEmail) {
    try {
      const { sendCanSpamCompliantEmail } = await import('../emailCore');
      await sendCanSpamCompliantEmail({
        to:        auditorEmail,
        subject:   `Cure Period Expired — Audit ${timer.audit_id} Auto-Converted to FAIL`,
        html:      `<p>The cure period for audit <strong>${timer.audit_id}</strong> has expired without verified corrections being submitted. The audit has been automatically converted to <strong>FAIL</strong> status. A default fine of $${DEFAULT_EXPIRY_FINE.toFixed(2)} has been assessed per the audit terms.</p>`,
        emailType: 'compliance_alert',
      });
    } catch (err: any) {
      log.warn('[CurePeriod] Auditor auto-FAIL email failed (non-fatal):', err?.message);
    }
  }

  log.warn('[CurePeriod] Audit auto-converted to FAIL', { auditId: timer.audit_id, timerId: timer.id });
}

// ─── Daily heartbeat (called by autonomousScheduler cron) ────────────────────

/**
 * Runs daily at 6AM. Scans all active cure timers across all workspaces.
 * Sends escalating reminders and auto-converts expired timers to FAIL.
 * Returns a summary for cron logging.
 */
export async function runCureHeartbeat(): Promise<{
  processed: number;
  reminders7d: number;
  reminders72h: number;
  reminders24h: number;
  autoFailed: number;
}> {
  const { pool } = await import('../../db');
  let processed = 0, reminders7d = 0, reminders72h = 0, reminders24h = 0, autoFailed = 0;

  const r = await pool.query(
    `SELECT * FROM audit_condition_timers WHERE status = 'active' ORDER BY deadline_at ASC`,
  );

  for (const timer of r.rows) {
    processed++;
    const now = new Date();
    const deadline = new Date(timer.deadline_at);
    const msRemaining = deadline.getTime() - now.getTime();
    const hoursRemaining = msRemaining / (1000 * 60 * 60);

    // Subscription gate (TRINITY.md §Q) — skip if workspace not serviceable
    try {
      const { isWorkspaceServiceable } = await import('../billing/billingConstants');
      const serviceable = await isWorkspaceServiceable(timer.workspace_id);
      if (!serviceable) {
        log.info('[CurePeriod] Workspace not serviceable, skipping', { workspaceId: timer.workspace_id });
        continue;
      }
    } catch {
      // Fail open — don't block cure tracking for billing check errors
    }

    const ownerUserId = await getOwnerForWorkspace(timer.workspace_id);
    if (!ownerUserId) continue;

    // Expired — auto-convert to FAIL
    if (hoursRemaining <= 0) {
      try {
        await convertToAutoFail(timer);
        autoFailed++;
      } catch (err: any) {
        log.error('[CurePeriod] Auto-FAIL conversion error:', err?.message);
      }
      continue;
    }

    // 24h reminder
    if (hoursRemaining <= 24 && !timer.reminder_24h_sent) {
      try {
        await sendReminderStrike(timer, ownerUserId, '24h');
        await pool.query(
          `UPDATE audit_condition_timers SET reminder_24h_sent = true, updated_at = NOW() WHERE id = $1`,
          [timer.id],
        );
        reminders24h++;
      } catch (err: any) {
        log.warn('[CurePeriod] 24h reminder failed (non-fatal):', err?.message);
      }
      continue;
    }

    // 72h reminder
    if (hoursRemaining <= 72 && !timer.reminder_72h_sent) {
      try {
        await sendReminderStrike(timer, ownerUserId, '72h');
        await pool.query(
          `UPDATE audit_condition_timers SET reminder_72h_sent = true, updated_at = NOW() WHERE id = $1`,
          [timer.id],
        );
        reminders72h++;
      } catch (err: any) {
        log.warn('[CurePeriod] 72h reminder failed (non-fatal):', err?.message);
      }
      continue;
    }

    // 7d reminder (168 hours)
    if (hoursRemaining <= 168 && !timer.reminder_7d_sent) {
      try {
        await sendReminderStrike(timer, ownerUserId, '7d');
        await pool.query(
          `UPDATE audit_condition_timers SET reminder_7d_sent = true, updated_at = NOW() WHERE id = $1`,
          [timer.id],
        );
        reminders7d++;
      } catch (err: any) {
        log.warn('[CurePeriod] 7d reminder failed (non-fatal):', err?.message);
      }
    }
  }

  log.info('[CurePeriod] Heartbeat complete', { processed, reminders7d, reminders72h, reminders24h, autoFailed });
  return { processed, reminders7d, reminders72h, reminders24h, autoFailed };
}

// ─── Cure verification (owner uploads corrections) ───────────────────────────

export async function verifyCureCorrections(params: {
  auditId:            string;
  workspaceId:        string;
  submittedByUserId:  string;
  correctionsBuffer:  Buffer;
  correctionsMime:    string;
}): Promise<{ success: boolean; message: string }> {
  const start = Date.now();
  const { pool } = await import('../../db');

  const storage = new Storage();
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');

  const ext = params.correctionsMime === 'application/pdf' ? 'pdf' : 'jpg';
  const gcsKey = `workspaces/${params.workspaceId}/audit-corrections/${params.auditId}_${Date.now()}.${ext}`;
  await storage.bucket(bucketName).file(gcsKey).save(params.correctionsBuffer, {
    contentType: params.correctionsMime, resumable: false,
  });
  const correctionsUrl = `gs://${bucketName}/${gcsKey}`;

  // Trinity verifies the corrections document
  const verified = await trinityVerifyCorrections(
    params.correctionsBuffer, params.correctionsMime,
  );

  if (verified) {
    // Cancel all future reminders, mark cured, update audit verdict to PASS
    await pool.query(
      `UPDATE audit_condition_timers
          SET status = 'cured', cured_at = NOW(), verified_by = 'trinity',
              corrections_url = $1, corrections_uploaded_at = NOW(),
              updated_at = NOW()
        WHERE audit_id = $2 AND workspace_id = $3`,
      [correctionsUrl, params.auditId, params.workspaceId],
    );

    await pool.query(
      `UPDATE auditor_audits
          SET verdict = 'PASS', verdict_set_at = NOW(), verdict_set_by = 'trinity',
              updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2`,
      [params.auditId, params.workspaceId],
    );

    await logActionAudit({
      actionId:    'cure_period.corrections_verified',
      workspaceId: params.workspaceId,
      userId:      params.submittedByUserId,
      entityType:  'audit_condition_timer',
      entityId:    params.auditId,
      success:     true,
      message:     `Corrections verified by Trinity. Audit ${params.auditId} upgraded to PASS.`,
      changesAfter: { newVerdict: 'PASS', correctionsUrl },
      durationMs:   Date.now() - start,
    });

    const ownerUserId = await getOwnerForWorkspace(params.workspaceId);
    if (ownerUserId) {
      try {
        await NotificationDeliveryService.send({
          type: 'compliance_alert', workspaceId: params.workspaceId,
          recipientUserId: ownerUserId, channel: 'in_app',
          subject: 'Compliance Cure Accepted — Audit Now PASS',
          body: { title: 'Correction Verified', message: 'Trinity has verified your corrections. Your audit status has been upgraded to PASS. All cure period reminders have been cancelled.', auditId: params.auditId },
        });
      } catch { /* non-fatal */ }
    }

    return { success: true, message: 'Corrections verified by Trinity. Your audit status has been upgraded to PASS and all future reminders have been cancelled.' };
  } else {
    // Record the upload but note verification failed
    await pool.query(
      `UPDATE audit_condition_timers
          SET corrections_url = $1, corrections_uploaded_at = NOW(), updated_at = NOW()
        WHERE audit_id = $2 AND workspace_id = $3`,
      [correctionsUrl, params.auditId, params.workspaceId],
    );

    return { success: false, message: 'Trinity could not verify the corrections document. Please ensure the uploaded document clearly shows the corrective actions taken and resubmit. The cure period is still active.' };
  }
}

async function trinityVerifyCorrections(buffer: Buffer, mimeType: string): Promise<boolean> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return true; // Fail open in dev

  const base64 = buffer.toString('base64');
  const isImage = mimeType.startsWith('image/');

  const content: any[] = [];
  if (isImage) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mimeType === 'image/png' ? 'image/png' : 'image/jpeg', data: base64 } });
  }
  content.push({ type: 'text', text: `You are Trinity. A security company owner has uploaded a corrections document to cure compliance audit deficiencies. Does this document appear to be a genuine corrective action document (photos of corrected uniforms/premises, updated license paperwork, corrected vehicle documentation, etc.)? Reply ONLY in JSON: { "verified": true|false, "reason": "..." }` });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 128, messages: [{ role: 'user', content }] }),
    });
    if (!response.ok) return false;
    const data = await response.json() as any;
    const text = data?.content?.[0]?.text ?? '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return false;
    return Boolean(JSON.parse(match[0]).verified);
  } catch {
    return false;
  }
}
