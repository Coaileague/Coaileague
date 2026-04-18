/**
 * Trinity SMS Auto-Resolver — Full Implementation (Phase 18C)
 * =============================================================
 * Complete SMS handling with identity verification, approvals, shift workflows,
 * and Trinity's biological brain for complex queries.
 *
 * Message routing:
 *   STOP/START/HELP      → TCPA compliance (handled in voiceRoutes.ts before this)
 *   YES/NO               → Shift offer acceptance/decline
 *   APPROVE/DENY         → Manager approval workflows
 *   EMP-XXXX-* / 4-8 #s  → Employee number verification
 *   SCHEDULE/PAY/HOURS   → Requires TIER 1 verification
 *   General text         → Trinity AI brain
 *   Unknown sender       → Soft verification request + management notice
 *
 * All responses must be SMS-safe: plain text, ≤320 chars per segment.
 * Never reference model names in any reply.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { flagFaqCandidate } from '../helpai/faqLearningService';
import type { VerifiedIdentity, VerificationResult } from './smsIdentityService';

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
        workspace_id, employee_id, type, subject, description,
        status, priority, submission_method, ticket_number,
        created_at, updated_at
      ) VALUES ($1, $2, 'support', $3, $4, 'open', 'normal', 'sms', $5, NOW(), NOW())
    `, [
      params.workspaceId,
      params.employeeId || null,
      `SMS Support: ${params.message.slice(0, 80)}`,
      `From: ${params.fromPhone}\nCategory: ${params.category}\nMessage: ${params.message}`,
      ticketNumber,
    ]);

    return ticketNumber;
  } catch (err) {
    log.warn('[SmsAutoResolver] Ticket creation failed:', err);
    return `TXT-${Date.now()}`;
  }
}

// ─── Workspace Context Enrichment ─────────────────────────────────────────

async function getEmployeeContext(employeeId: string, workspaceId: string): Promise<string> {
  try {
    const [scheduleRows, payrollRows] = await Promise.all([
      pool.query(`
        SELECT s.start_time, s.end_time, s.location, s.status
        FROM shifts s
        WHERE s.workspace_id = $1
          AND s.employee_id = $2
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

// ─── Bilingual Helper ──────────────────────────────────────────────────────

/**
 * Pick the English or Spanish version based on the employee's preferred_language.
 */
function t(en: string, es: string, lang: string): string {
  return lang === 'es' ? es : en;
}

/**
 * Look up the employee's preferred_language (falls back to 'en').
 */
async function getEmployeeLanguage(employeeId: string, workspaceId: string): Promise<'en' | 'es'> {
  try {
    const { rows } = await pool.query(
      `SELECT preferred_language FROM employees WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [employeeId, workspaceId]
    );
    const val = rows[0]?.preferred_language;
    return val === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

// ─── Shift Offer Acceptance ────────────────────────────────────────────────

async function handleShiftOfferAcceptance(
  fromPhone: string,
  identity: VerifiedIdentity
): Promise<SmsResolverResult> {
  const lang = await getEmployeeLanguage(identity.employeeId, identity.workspaceId);

  try {
    // Pull the most recent offer for this employee regardless of status/expiry so
    // we can recognize late YES replies and respond with a graceful message.
    const offer = await pool.query(`
      SELECT ao.id, ao.staged_shift_id, ao.status, ao.offer_expires_at,
             s.start_time, s.end_time, s.location, s.workspace_id
      FROM automated_shift_offers ao
      LEFT JOIN shifts s ON s.id = ao.staged_shift_id
      WHERE ao.employee_id = $1
      ORDER BY ao.created_at DESC
      LIMIT 1
    `, [identity.employeeId]);

    if (!offer.rows.length) {
      return {
        resolved: true,
        reply: t(
          `Hi ${identity.firstName}! Thanks for the YES, but I don't see any active shift offers for you right now. I'll reach out when something comes up! — Trinity`,
          `¡Hola ${identity.firstName}! Gracias por decir SÍ, pero no veo ninguna oferta de turno activa para ti ahora mismo. ¡Te avisaré cuando surja algo! — Trinity`,
          lang
        ),
        method: 'auto_action',
        workspaceId: identity.workspaceId,
        employeeId: identity.employeeId,
      };
    }

    const row = offer.rows[0];

    // Late YES — the offer was already claimed or withdrawn by someone else
    if (['accepted', 'withdrawn'].includes(row.status)) {
      log.info(`[SMS] Late YES from ${identity.firstName} — offer ${row.id} already ${row.status}`);
      return {
        resolved: true,
        reply: t(
          `Hi ${identity.firstName}! This shift has already been filled — you were just a moment too late. Don't worry, I'll send you the next opportunity! — Trinity`,
          `¡Hola ${identity.firstName}! Este turno ya fue asignado — llegaste un momento tarde. ¡No te preocupes, te enviaré la próxima oportunidad! — Trinity`,
          lang
        ),
        method: 'auto_action',
        workspaceId: identity.workspaceId,
        employeeId: identity.employeeId,
      };
    }

    // Expired offer
    if (row.status === 'expired' || (row.offer_expires_at && new Date(row.offer_expires_at) < new Date())) {
      log.info(`[SMS] Late YES from ${identity.firstName} — offer ${row.id} expired`);
      return {
        resolved: true,
        reply: t(
          `Hi ${identity.firstName}! This shift offer has expired. Keep an eye out — I'll text you when the next one comes up! — Trinity`,
          `¡Hola ${identity.firstName}! Esta oferta de turno ha vencido. ¡Estate atento, te escribiré cuando salga la próxima! — Trinity`,
          lang
        ),
        method: 'auto_action',
        workspaceId: identity.workspaceId,
        employeeId: identity.employeeId,
      };
    }

    // Only pending_response offers proceed from here
    if (row.status !== 'pending_response') {
      return {
        resolved: true,
        reply: t(
          `Hi ${identity.firstName}! Thanks for the YES — I'll check with your supervisor and follow up. — Trinity`,
          `¡Hola ${identity.firstName}! Gracias por el SÍ — consultaré con tu supervisor y te avisaré. — Trinity`,
          lang
        ),
        method: 'auto_action',
        workspaceId: identity.workspaceId,
        employeeId: identity.employeeId,
      };
    }

    await pool.query(`
      UPDATE automated_shift_offers SET status = 'accepted', responded_at = NOW()
      WHERE id = $1
    `, [row.id]);

    if (row.staged_shift_id) {
      await pool.query(`
        UPDATE shifts SET employee_id = $1, status = 'assigned', updated_at = NOW()
        WHERE id = $2 AND workspace_id = $3
      `, [identity.employeeId, row.staged_shift_id, identity.workspaceId]);
    }

    // Notify supervisors in-app — pick the workspace owner as the recipient
    try {
      const supervisor = await pool.query(
        `SELECT owner_id FROM workspaces WHERE id = $1 LIMIT 1`,
        [identity.workspaceId]
      );
      const ownerId = supervisor.rows[0]?.owner_id;
      if (ownerId) {
        await pool.query(`
          INSERT INTO notifications
            (workspace_id, user_id, scope, type, title, message, created_at)
          VALUES ($1, $2, 'workspace', 'shift_assignment', $3, $4, NOW())
        `, [
          identity.workspaceId,
          ownerId,
          'Shift Filled by Trinity',
          `${identity.firstName} ${identity.lastName} accepted the open shift via SMS. Trinity has assigned the shift.`,
        ]);
      }
    } catch (nErr: any) {
      log.warn('[SMS] Supervisor notification failed (non-fatal):', nErr?.message);
    }

    // Trigger Stage C — InboundOpportunityAgent auto-staffing pipeline for any
    // staged-shift rows now ready to be validated/assigned. Non-fatal on failure.
    try {
      const { inboundOpportunityAgent } = await import('../inboundOpportunityAgent');
      await inboundOpportunityAgent.triggerAutoStaffing(identity.workspaceId);
      log.info(`[SMS] Stage C triggered for workspace ${identity.workspaceId}`);
    } catch (stageErr: any) {
      log.warn('[SMS] Stage C trigger failed (non-fatal):', stageErr?.message);
    }

    log.info(`[SMS] ${identity.firstName} accepted shift ${row.staged_shift_id}`);

    const startFormatted = row.start_time
      ? new Date(row.start_time).toLocaleString(lang === 'es' ? 'es-US' : 'en-US', {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
      : t('your scheduled time', 'tu hora programada', lang);

    return {
      resolved: true,
      reply: t(
        `You're confirmed, ${identity.firstName}! Shift at ${row.location || 'your assigned site'} starting ${startFormatted}. ` +
          `Your supervisor has been notified. Text HELP if you need anything before your shift. — Trinity`,
        `¡Estás confirmado, ${identity.firstName}! Turno en ${row.location || 'tu sitio asignado'} comenzando ${startFormatted}. ` +
          `Tu supervisor ha sido notificado. Escribe HELP si necesitas algo antes de tu turno. — Trinity`,
        lang
      ),
      method: 'auto_action',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  } catch (err: any) {
    log.error('[SMS] Shift acceptance error:', err?.message);
    return {
      resolved: true,
      reply: t(
        `Thanks ${identity.firstName}! There was a brief issue confirming your shift. Please confirm directly with your supervisor. — Trinity`,
        `¡Gracias ${identity.firstName}! Hubo un problema momentáneo al confirmar tu turno. Por favor confirma directamente con tu supervisor. — Trinity`,
        lang
      ),
      method: 'error',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  }
}

// ─── Manager Approval / Denial ─────────────────────────────────────────────

async function handleManagerApproval(
  fromPhone: string,
  verification: VerificationResult,
  approved: boolean
): Promise<SmsResolverResult> {
  if (!verification.verified || !verification.identity) {
    return {
      resolved: true,
      reply: `I wasn't able to verify your identity as a manager. Please log in to the app to approve requests. — Trinity`,
      method: 'auto_action',
    };
  }

  const identity = verification.identity;

  try {
    const pending = await pool.query(`
      SELECT sa.id, sa.action_type, sa.requested_by, sa.reason,
             e.first_name as emp_first, e.last_name as emp_last
      FROM shift_actions sa
      LEFT JOIN employees e ON e.id = sa.requested_by
      WHERE sa.workspace_id = $1
        AND sa.status = 'pending'
        AND sa.requires_approval = true
      ORDER BY sa.created_at DESC
      LIMIT 1
    `, [identity.workspaceId]);

    if (!pending.rows.length) {
      return {
        resolved: true,
        reply: `Hi ${identity.firstName}! No pending approvals found in your workspace right now. Check the app for the full list. — Trinity`,
        method: 'auto_action',
        workspaceId: identity.workspaceId,
        employeeId: identity.employeeId,
      };
    }

    const req = pending.rows[0];
    const newStatus = approved ? 'approved' : 'denied';
    const empName = `${req.emp_first || ''} ${req.emp_last || ''}`.trim() || 'the employee';
    const actionLabel = (req.action_type || 'request').toString().replace(/_/g, ' ');

    await pool.query(`
      UPDATE shift_actions
      SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $3 AND workspace_id = $4
    `, [newStatus, identity.employeeId, req.id, identity.workspaceId]);

    // Notify the requesting employee — look up their user_id for notifications
    try {
      if (req.requested_by) {
        const empUser = await pool.query(
          `SELECT user_id FROM employees WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
          [req.requested_by, identity.workspaceId]
        );
        const userId = empUser.rows[0]?.user_id;
        if (userId) {
          await pool.query(`
            INSERT INTO notifications
              (workspace_id, user_id, scope, type, title, message, created_at)
            VALUES ($1, $2, 'user', 'approval_decision', $3, $4, NOW())
          `, [
            identity.workspaceId,
            userId,
            approved ? 'Request Approved' : 'Request Denied',
            `Your ${actionLabel} was ${newStatus} by ${identity.firstName} ${identity.lastName}.`,
          ]);
        }
      }
    } catch (nErr: any) {
      log.warn('[SMS] Employee notification failed (non-fatal):', nErr?.message);
    }

    log.info(`[SMS] Manager ${identity.firstName} ${newStatus} request ${req.id}`);

    return {
      resolved: true,
      reply:
        `Got it ${identity.firstName}! ` +
        `${empName}'s ${actionLabel} has been ${newStatus}. ` +
        `They've been notified. — Trinity`,
      method: 'auto_action',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  } catch (err: any) {
    log.error('[SMS] Approval workflow error:', err?.message);
    return {
      resolved: true,
      reply: `There was an issue processing your ${approved ? 'approval' : 'denial'}. Please use the app. — Trinity`,
      method: 'error',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  }
}

// ─── Employee Number Verification ──────────────────────────────────────────

async function handleEmployeeNumberVerification(
  fromPhone: string,
  employeeNumber: string
): Promise<SmsResolverResult> {
  const { verifyByEmployeeNumber } = await import('./smsIdentityService');
  const result = await verifyByEmployeeNumber(fromPhone, employeeNumber);

  if (result.verified && result.identity) {
    return {
      resolved: true,
      reply:
        `Welcome, ${result.identity.firstName}! I've verified your identity. ` +
        `I'm Trinity, your Co-League AI assistant. You can now ask me about your schedule, shifts, pay periods, or anything else. ` +
        `What can I help you with?`,
      method: 'auto_action',
      workspaceId: result.identity.workspaceId,
      employeeId: result.identity.employeeId,
    };
  }

  return {
    resolved: true,
    reply:
      `I wasn't able to match that employee number to your phone number. ` +
      `Please double-check your employee number in the app under Profile, or contact your supervisor. ` +
      `If you just started, it may take 24 hours to appear in the system. — Trinity`,
    method: 'auto_action',
  };
}

// ─── Main Resolver ─────────────────────────────────────────────────────────

export async function resolveInboundSms(params: {
  fromPhone: string;
  message: string;
}): Promise<SmsResolverResult> {
  const { fromPhone, message } = params;
  const trimmed = message.trim();
  const upper = trimmed.toUpperCase();

  log.info(`[SmsAutoResolver] Inbound from ${fromPhone}: "${trimmed.slice(0, 80)}"`);

  // Step 1: Verify identity by phone
  const { verifyByPhone, notifyManagementUnverified, logFailedVerification } =
    await import('./smsIdentityService');
  const verification = await verifyByPhone(fromPhone);

  // Step 2: Shift offer responses (YES/NO)
  if (['YES', 'Y'].includes(upper) && verification.verified && verification.identity) {
    return handleShiftOfferAcceptance(fromPhone, verification.identity);
  }
  if (['NO', 'N'].includes(upper) && verification.verified && verification.identity) {
    return {
      resolved: true,
      reply: `No problem, ${verification.identity.firstName}! We'll keep you in mind for the next opportunity. — Trinity`,
      method: 'auto_action',
      workspaceId: verification.identity.workspaceId,
      employeeId: verification.identity.employeeId,
    };
  }

  // Step 3: Manager approval / denial
  if (['APPROVE', 'APPROVED', 'YES APPROVE'].includes(upper)) {
    return handleManagerApproval(fromPhone, verification, true);
  }
  if (['DENY', 'DENIED', 'DECLINE', 'REJECT'].includes(upper)) {
    return handleManagerApproval(fromPhone, verification, false);
  }

  // Step 4: Employee number verification attempt
  if (/^EMP-[A-Z0-9]+-\d+$/i.test(trimmed) || /^\d{4,8}$/.test(trimmed)) {
    return handleEmployeeNumberVerification(fromPhone, trimmed);
  }

  // Step 5: Unverified sender — soft challenge + management notice
  if (!verification.verified) {
    await logFailedVerification(fromPhone, 'phone_not_in_system');
    const isNewOfficerLikely = /help|schedule|shift|work|new|start|begin|how/i.test(trimmed);

    if (isNewOfficerLikely) {
      await notifyManagementUnverified(fromPhone, trimmed);
      return {
        resolved: true,
        reply:
          `Hi! I'm Trinity, Co-League's AI assistant. I wasn't able to find your profile in our system — ` +
          `you might be new, or your phone number may not be registered yet. ` +
          `Reply with your employee number (like EMP-1234-00001) so I can look you up, ` +
          `or contact your supervisor to get set up. Your supervisor has been notified. — Trinity`,
        method: 'auto_action',
      };
    }

    await notifyManagementUnverified(fromPhone, trimmed);
    return {
      resolved: true,
      reply:
        `Hi! I'm Trinity from Co-League. I couldn't verify your identity in our system. ` +
        `If you're a Co-League employee, please reply with your employee number. ` +
        `If you need general help, visit www.coaileague.com. — Trinity`,
      method: 'auto_action',
    };
  }

  // Step 6: Verified sender — Trinity brain with context
  const identity = verification.identity!;
  const category = classifyMessage(trimmed);

  // FAQ lookup first
  const faqAnswer = await tryFaqLookup(trimmed, identity.workspaceId);
  if (faqAnswer) {
    const reply = `Hi ${identity.firstName}, ${faqAnswer}`;
    void flagFaqCandidate(trimmed, identity.workspaceId, category);
    log.info(`[SmsAutoResolver] FAQ resolved for ${fromPhone}`);
    return {
      resolved: true,
      reply: reply.slice(0, 320),
      method: 'faq',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  }

  // Instant answer for common categories
  const instantAnswer = INSTANT_ANSWERS[category];
  if (instantAnswer) {
    const reply = `Hi ${identity.firstName}! ${instantAnswer}`;
    void flagFaqCandidate(trimmed, identity.workspaceId, category);
    log.info(`[SmsAutoResolver] Instant answer (${category}) for ${fromPhone}`);
    return {
      resolved: true,
      reply: reply.slice(0, 320),
      method: 'auto_action',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  }

  // Trinity AI with full context
  const ctx = await getEmployeeContext(identity.employeeId, identity.workspaceId);
  const contextualMessage = ctx ? `${trimmed}\n\n[Context: ${ctx}]` : trimmed;
  const aiAnswer = await tryTrinityAI(contextualMessage, identity.workspaceId, identity.firstName);

  if (aiAnswer) {
    const prefix = `Hi ${identity.firstName}, `;
    const reply = (prefix + aiAnswer).slice(0, 320);
    void flagFaqCandidate(trimmed, identity.workspaceId, category);
    log.info(`[SmsAutoResolver] AI resolved for ${fromPhone}`);
    return {
      resolved: true,
      reply,
      method: 'ai',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  }

  // Final fallback: create support ticket
  void flagFaqCandidate(trimmed, identity.workspaceId, category);
  const caseNumber = await createSmsTicket({
    workspaceId: identity.workspaceId,
    employeeId: identity.employeeId,
    fromPhone,
    message: trimmed,
    category,
  });

  log.info(`[SmsAutoResolver] Escalated to ticket ${caseNumber} for ${fromPhone}`);
  return {
    resolved: false,
    reply:
      `Got it ${identity.firstName}! I've created support case ${caseNumber} for your request. ` +
      `A specialist from ${identity.orgName} will follow up with you shortly. — Trinity`.slice(0, 320),
    method: 'ticket',
    caseNumber,
    workspaceId: identity.workspaceId,
    employeeId: identity.employeeId,
  };
}
