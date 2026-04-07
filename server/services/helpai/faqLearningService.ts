/**
 * FAQ Learning Service
 * ====================
 * Closes Trinity's learning loop. Every time HelpAI receives a question it cannot
 * answer from the FAQ, it logs a candidate. When enough officers ask the same
 * question (threshold: 3+), Trinity promotes it to a published FAQ entry
 * autonomously — no human required.
 *
 * Also provides the FAQ candidate flagging function used by the triage route.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';

const log = createLogger('FAQLearningService');

// ─── Category auto-answers ────────────────────────────────────────────────

const CATEGORY_AUTO_ANSWERS: Record<string, string> = {
  account_access: 'To reset your access, use the Forgot Password link on the login screen. If your account is locked, a support agent will unlock it within minutes. For clock-in PIN issues, contact your supervisor who can reset it from the management portal.',
  scheduling_issue: 'To view your schedule, go to the Schedule section in your main menu. If a shift is missing or incorrectly assigned, contact your supervisor. They can update your schedule from the management portal.',
  payroll_dispute: 'To review your pay, visit the Payroll section and select Pay Stubs. If you believe your hours are incorrect, submit a timesheet correction request. Your supervisor will review and correct any discrepancies within 24 hours.',
  notification_not_received: 'If you are not receiving notifications, go to Settings > Notifications and ensure both SMS and email alerts are enabled. Check that your phone number and email are correct in your profile.',
  document_missing: 'To find your documents, go to Documents in your main menu. If you cannot find your onboarding documents, check your email for a link. If the link is expired, contact support and we will resend it.',
  onboarding_stuck: 'If your onboarding is stuck, try refreshing the page and completing each task in order. If a specific task is not completing, contact support with the task name and we will reset it for you.',
  compliance_alert: 'If your license or certificate is expiring, upload the renewed document in Documents > Compliance Evidence. Renewals typically take 1-2 business days to verify.',
  technical_error: 'If you are experiencing a technical error, try clearing your browser cache (Ctrl+Shift+Delete) and refreshing. If the issue persists, note the error message and contact support with details.',
  billing_question: 'For billing questions, visit Settings > Billing to view your current plan, invoices, and payment methods. For urgent billing issues, contact billing@coaileague.com.',
  safety: 'For emergency situations, use the Panic Button in your app for immediate alert. For non-emergency safety questions, contact your supervisor or site manager.',
  general_question: 'For assistance with this question, please contact your organization administrator or reach out to support. We typically respond within the same business day.'
};

// ─── Flag FAQ Candidate ────────────────────────────────────────────────────

export async function flagFaqCandidate(message: string, workspaceId: string, category: string): Promise<void> {
  try {
    const existing = await pool.query(
      `SELECT id, occurrence_count FROM faq_candidates
       WHERE workspace_id = $1 AND LOWER(question) LIKE $2`,
      [workspaceId, `%${message.toLowerCase().slice(0, 50)}%`]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE faq_candidates SET occurrence_count = occurrence_count + 1, last_asked_at = NOW() WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO faq_candidates (workspace_id, question, category, occurrence_count, created_at)
         VALUES ($1,$2,$3,1,NOW())`,
        [workspaceId, message.slice(0, 500), category]
      );
    }
  } catch (err) {
    log.warn('[FAQLearning] Failed to flag candidate', { err });
  }
}

// ─── Promote Qualified FAQ Candidates ─────────────────────────────────────
// Called by:
//   1. HelpAI triage route — after every triage (background, fire-and-forget)
//   2. TrinityResolutionFabric — when recurring_ticket_pattern is detected
//   3. HelpAI Proactive Monitor — when recurring_ticket_pattern alert fires

export async function promoteQualifiedFaqCandidates(workspaceId?: string): Promise<number> {
  try {
    const wsFilter = workspaceId ? `AND fc.workspace_id = '${workspaceId.replace(/'/g, "''")}'` : '';

    const candidates = await pool.query(`
      SELECT fc.id, fc.workspace_id, fc.question, fc.category, fc.occurrence_count
      FROM faq_candidates fc
      WHERE fc.occurrence_count >= 3 ${wsFilter}
        AND NOT EXISTS (
          SELECT 1 FROM faq_entries fe
          WHERE (fe.workspace_id = fc.workspace_id OR fe.workspace_id IS NULL)
            AND LOWER(fe.question) LIKE '%' || LOWER(LEFT(fc.question, 40)) || '%'
            AND fe.status = 'published'
        )
      ORDER BY fc.occurrence_count DESC
      LIMIT 30
    `);

    let promoted = 0;
    for (const c of candidates.rows) {
      const answer = CATEGORY_AUTO_ANSWERS[c.category] || CATEGORY_AUTO_ANSWERS.general_question;

      try {
        await pool.query(`
          INSERT INTO faq_entries (workspace_id, question, answer, category, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'published', NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, [c.workspace_id, c.question.slice(0, 500), answer, c.category]);

        await pool.query(`DELETE FROM faq_candidates WHERE id = $1`, [c.id]);
        promoted++;
        log.info(`[FAQLearning] Promoted FAQ candidate: "${c.question.slice(0, 60)}" (asked ${c.occurrence_count}×)`);
      } catch (rowErr) {
        log.warn(`[FAQLearning] Failed to promote candidate ${c.id}`, { err: rowErr });
      }
    }

    if (promoted > 0) {
      log.info(`[FAQLearning] Promoted ${promoted} FAQ candidate(s) to published entries`);
    }
    return promoted;
  } catch (err) {
    log.warn('[FAQLearning] promoteQualifiedFaqCandidates failed', { err });
    return 0;
  }
}

// ─── FAQ Candidate Summary (for Trinity introspection) ────────────────────

export async function getFaqCandidateSummary(workspaceId: string): Promise<{
  totalCandidates: number;
  readyToPromote: number;
  topCategories: Array<{ category: string; count: number }>;
}> {
  try {
    const [total, ready, categories] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM faq_candidates WHERE workspace_id = $1`, [workspaceId]),
      pool.query(`SELECT COUNT(*) FROM faq_candidates WHERE workspace_id = $1 AND occurrence_count >= 3`, [workspaceId]),
      pool.query(`
        SELECT category, SUM(occurrence_count) AS count
        FROM faq_candidates WHERE workspace_id = $1
        GROUP BY category ORDER BY count DESC LIMIT 5
      `, [workspaceId])
    ]);
    return {
      totalCandidates: parseInt(total.rows[0].count),
      readyToPromote: parseInt(ready.rows[0].count),
      topCategories: categories.rows.map(r => ({ category: r.category, count: parseInt(r.count) }))
    };
  } catch (_err) {
    return { totalCandidates: 0, readyToPromote: 0, topCategories: [] };
  }
}
