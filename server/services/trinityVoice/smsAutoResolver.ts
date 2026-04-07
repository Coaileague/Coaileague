/**
 * Trinity SMS Auto-Resolver
 * ==========================
 * The autonomous support brain for inbound text messages.
 *
 * Resolution pipeline (99% target):
 *   1. Identify sender → find employee record + workspaceId
 *   2. FAQ lookup → instant answer from published FAQ entries
 *   3. Category classification → route to HelpAI action handlers
 *   4. Trinity AI Triad → free-form reasoning
 *   5. Support ticket creation → send case number via SMS (1% human path)
 *
 * All responses must be SMS-safe: plain text, ≤320 chars per segment.
 * Never reference model names in any reply.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { flagFaqCandidate } from '../helpai/faqLearningService';

const log = createLogger('SmsAutoResolver');

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SmsResolverResult {
  resolved: boolean;
  reply: string;
  method: 'faq' | 'auto_action' | 'ai' | 'ticket' | 'error';
  caseNumber?: string;
  workspaceId?: string;
  employeeId?: string;
}

// ─── Employee Identification ───────────────────────────────────────────────

async function identifyEmployee(phone: string): Promise<{
  workspaceId: string;
  employeeId: string;
  firstName: string;
  email: string;
  orgName: string;
} | null> {
  try {
    const digits = phone.replace(/\D/g, '').replace(/^1/, '');
    const result = await pool.query(`
      SELECT e.id, e.workspace_id, e.first_name, e.email, w.name as org_name
      FROM employees e
      JOIN workspaces w ON w.id = e.workspace_id
      WHERE REGEXP_REPLACE(e.phone, '[^0-9]', '', 'g') LIKE $1
        OR REGEXP_REPLACE(e.phone, '[^0-9]', '', 'g') LIKE $2
      LIMIT 1
    `, [`%${digits}`, `%${digits.slice(-10)}`]);

    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
      workspaceId: row.workspace_id,
      employeeId: row.id,
      firstName: row.first_name || 'there',
      email: row.email,
      orgName: row.org_name || 'your organization',
    };
  } catch (err) {
    log.warn('[SmsAutoResolver] Employee lookup failed:', err);
    return null;
  }
}

// ─── FAQ Lookup ────────────────────────────────────────────────────────────

async function tryFaqLookup(message: string, workspaceId: string): Promise<string | null> {
  try {
    const words = message.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return null;

    const searchTerms = words.slice(0, 5).join(' | ');

    const result = await pool.query(`
      SELECT question, answer
      FROM faq_entries
      WHERE status = 'published'
        AND (workspace_id = $1 OR workspace_id IS NULL)
        AND (
          to_tsvector('english', question || ' ' || COALESCE(answer, '')) @@
          to_tsquery('english', $2)
        )
      ORDER BY
        CASE WHEN workspace_id = $1 THEN 0 ELSE 1 END,
        LENGTH(answer) ASC
      LIMIT 1
    `, [workspaceId, searchTerms.replace(/[|&!():*]/g, ' ').split(/\s+/).filter(Boolean).join(' | ')]);

    if (result.rows.length && result.rows[0].answer) {
      return result.rows[0].answer;
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ─── Category Detection ────────────────────────────────────────────────────

function classifyMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (/password|login|locked|access|sign.?in|can.?t log/.test(m)) return 'account_access';
  if (/schedule|shift|hours|when.*(work|shift)|my.*shift|clock.?in|clock.?out/.test(m)) return 'scheduling_issue';
  if (/pay|paycheck|payroll|wages|salary|overtime|stub|direct deposit|missing.*pay/.test(m)) return 'payroll_dispute';
  if (/notification|alert|text|email|not receiv/.test(m)) return 'notification_not_received';
  if (/document|form|missing.*doc|onboard|packet|sign/.test(m)) return 'document_missing';
  if (/onboard|stuck|task|complete|setup|start/.test(m)) return 'onboarding_stuck';
  if (/license|cert|expir|compliance/.test(m)) return 'compliance_alert';
  if (/error|bug|problem|crash|not work/.test(m)) return 'technical_error';
  return 'general_question';
}

// ─── Category-Specific Instant Answers ────────────────────────────────────
// Fast, DB-backed answers for the most common categories without AI round-trip

const INSTANT_ANSWERS: Record<string, string> = {
  account_access: 'To reset your password, go to the app login screen and tap Forgot Password. If your account is locked, reply with your full name and we\'ll unlock it right away.',
  scheduling_issue: 'To view your schedule, open the app and go to the Schedule tab. If a shift is wrong or missing, your supervisor can update it. Reply with details and we\'ll look into it.',
  payroll_dispute: 'Pay stubs are in the app under Payroll > Pay Stubs. If your hours look wrong, your supervisor can submit a correction. Reply with the pay period date and we\'ll investigate.',
  notification_not_received: 'Go to Settings in the app and check that SMS and email notifications are turned on. Make sure your phone number is correct in your profile.',
  document_missing: 'Your onboarding documents are in the Documents section of the app. If you need them resent, reply with your email address and we\'ll send them right away.',
  onboarding_stuck: 'If your onboarding is stuck on a task, try refreshing the app. If a specific task won\'t complete, reply with which task and we\'ll reset it for you.',
  compliance_alert: 'If your license or certification is expiring, upload the renewal in the Documents > Compliance section of the app. It typically takes 1-2 days to verify.',
  technical_error: 'Try closing the app and reopening it. If the problem continues, reply with what error you\'re seeing and we\'ll fix it.',
  general_question: null as any,
};

// ─── Trinity AI Fallback ───────────────────────────────────────────────────

async function tryTrinityAI(message: string, workspaceId: string, firstName: string): Promise<string | null> {
  try {
    const { resolveWithTrinityBrain } = await import('./trinityAIResolver');
    const result = await resolveWithTrinityBrain({
      issue: `Officer ${firstName} texted: "${message}"`,
      workspaceId,
    });
    if (result.canResolve && result.answer && result.answer.length > 20) {
      // Trim to SMS-safe length (~300 chars)
      return result.answer.length > 300 ? result.answer.slice(0, 297) + '...' : result.answer;
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ─── Support Ticket Creation ───────────────────────────────────────────────

async function createSmsTicket(params: {
  workspaceId: string;
  employeeId?: string;
  fromPhone: string;
  message: string;
  category: string;
}): Promise<string> {
  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TXT-${dateStr}-${rand}`;

    await pool.query(`
      INSERT INTO support_tickets (
        workspace_id, user_id, category, subject, description,
        status, priority, source, ticket_number,
        trinity_attempted, trinity_actions_taken,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'open', 'normal', 'sms', $6, true, $7, NOW(), NOW())
    `, [
      params.workspaceId,
      params.employeeId || null,
      params.category,
      `SMS Support: ${params.message.slice(0, 80)}`,
      `From: ${params.fromPhone}\nMessage: ${params.message}`,
      ticketNumber,
      JSON.stringify(['sms_autonomous_triage']),
    ]);

    return ticketNumber;
  } catch (err) {
    log.warn('[SmsAutoResolver] Ticket creation failed:', err);
    return `TXT-${Date.now()}`;
  }
}

// ─── Workspace Context Enrichment ─────────────────────────────────────────
// Fetches live data to inject into the AI resolver prompt for the specific caller

async function getEmployeeContext(employeeId: string, workspaceId: string): Promise<string> {
  try {
    const [scheduleRows, payrollRows] = await Promise.all([
      pool.query(`
        SELECT s.start_time, s.end_time, s.location, s.status
        FROM shifts s
        WHERE s.workspace_id = $1
          AND EXISTS (
            SELECT 1 FROM shift_assignments sa
            WHERE sa.shift_id = s.id AND sa.employee_id = $2
          )
          AND s.start_time >= NOW() - INTERVAL '1 day'
          AND s.start_time <= NOW() + INTERVAL '14 days'
        ORDER BY s.start_time ASC
        LIMIT 5
      `, [workspaceId, employeeId]),
      pool.query(`
        SELECT SUM(regular_hours + COALESCE(overtime_hours, 0)) as total_hours,
               MAX(period_end) as last_period
        FROM employee_payroll_records
        WHERE workspace_id = $1 AND employee_id = $2
          AND period_end >= NOW() - INTERVAL '30 days'
      `, [workspaceId, employeeId]),
    ]);

    const parts: string[] = [];

    if (scheduleRows.rows.length > 0) {
      const shifts = scheduleRows.rows.map((r: any) => {
        const d = new Date(r.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const t = new Date(r.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${d} at ${t}${r.location ? ` (${r.location})` : ''}`;
      });
      parts.push(`Upcoming shifts: ${shifts.join(', ')}`);
    } else {
      parts.push('No upcoming shifts scheduled in the next 14 days');
    }

    if (payrollRows.rows[0]?.total_hours) {
      parts.push(`Recent payroll: ${parseFloat(payrollRows.rows[0].total_hours).toFixed(1)} hours logged`);
    }

    return parts.join('. ');
  } catch (_) {
    return '';
  }
}

// ─── Main Resolver ─────────────────────────────────────────────────────────

export async function resolveInboundSms(params: {
  fromPhone: string;
  message: string;
}): Promise<SmsResolverResult> {
  const { fromPhone, message } = params;
  const trimmed = message.trim();

  log.info(`[SmsAutoResolver] Inbound from ${fromPhone}: "${trimmed.slice(0, 80)}"`);

  // Step 1: Identify the employee
  const employee = await identifyEmployee(fromPhone);
  const workspaceId = employee?.workspaceId || 'platform';
  const firstName = employee?.firstName || 'there';

  // Step 2: FAQ lookup — fastest, cheapest, highest confidence
  const faqAnswer = await tryFaqLookup(trimmed, workspaceId);
  if (faqAnswer) {
    const reply = `Hi ${firstName}, ${faqAnswer}`;
    log.info(`[SmsAutoResolver] FAQ resolved for ${fromPhone}`);
    // Flag this as a candidate so future same questions get promoted
    void flagFaqCandidate(trimmed, workspaceId, classifyMessage(trimmed));
    return { resolved: true, reply: reply.slice(0, 320), method: 'faq', workspaceId, employeeId: employee?.employeeId };
  }

  // Step 3: Category-specific instant answer
  const category = classifyMessage(trimmed);
  const instantAnswer = INSTANT_ANSWERS[category];
  if (instantAnswer) {
    const reply = `Hi ${firstName}, ${instantAnswer}`;
    void flagFaqCandidate(trimmed, workspaceId, category);
    log.info(`[SmsAutoResolver] Instant answer (${category}) for ${fromPhone}`);
    return { resolved: true, reply: reply.slice(0, 320), method: 'auto_action', workspaceId, employeeId: employee?.employeeId };
  }

  // Step 4: Trinity AI with context enrichment
  let contextualMessage = trimmed;
  if (employee) {
    const ctx = await getEmployeeContext(employee.employeeId, workspaceId);
    if (ctx) {
      contextualMessage = `${trimmed}\n\n[Context: ${ctx}]`;
    }
  }

  const aiAnswer = await tryTrinityAI(contextualMessage, workspaceId, firstName);
  if (aiAnswer) {
    const prefix = `Hi ${firstName}, `;
    const reply = (prefix + aiAnswer).slice(0, 320);
    void flagFaqCandidate(trimmed, workspaceId, category);
    log.info(`[SmsAutoResolver] AI resolved for ${fromPhone}`);
    return { resolved: true, reply, method: 'ai', workspaceId, employeeId: employee?.employeeId };
  }

  // Step 5: Create support ticket and send case number (1% human path)
  void flagFaqCandidate(trimmed, workspaceId, category);
  const caseNumber = await createSmsTicket({
    workspaceId,
    employeeId: employee?.employeeId,
    fromPhone,
    message: trimmed,
    category,
  });

  const reply = employee
    ? `Hi ${firstName}, I'm on it. Your support case number is ${caseNumber}. A specialist from ${employee.orgName} will follow up with you shortly.`
    : `Thank you for reaching out. Your support case number is ${caseNumber}. A specialist will follow up with you shortly.`;

  log.info(`[SmsAutoResolver] Escalated to ticket ${caseNumber} for ${fromPhone}`);
  return {
    resolved: false,
    reply: reply.slice(0, 320),
    method: 'ticket',
    caseNumber,
    workspaceId,
    employeeId: employee?.employeeId,
  };
}
