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
import { detectLanguage } from './smsLanguageDetector';

const log = createLogger('SmsAutoResolver');

// ─── Bilingual string helper ────────────────────────────────────────────────
// Tiny helper: pick English or Spanish based on the resolved language.
// Usage: t('Hello', 'Hola', lang)
const t = (en: string, es: string, lang: 'en' | 'es'): string => (lang === 'es' ? es : en);

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

const INSTANT_ANSWERS_ES: Record<string, string> = {
  account_access: 'Para restablecer tu contraseña, ve a la pantalla de inicio de sesión y toca "Olvidé mi contraseña". Si tu cuenta está bloqueada, responde con tu nombre completo y la desbloquearemos de inmediato.',
  scheduling_issue: 'Para ver tu horario, abre la aplicación y ve a la pestaña de Horario. Si un turno está incorrecto o falta, tu supervisor puede actualizarlo. Responde con los detalles y lo revisaremos.',
  payroll_dispute: 'Los comprobantes de pago están en la aplicación en Nómina > Comprobantes. Si tus horas parecen incorrectas, tu supervisor puede enviar una corrección. Responde con la fecha del período de pago y lo investigaremos.',
  notification_not_received: 'Ve a Configuración en la aplicación y verifica que las notificaciones por SMS y correo electrónico estén activadas. Asegúrate de que tu número de teléfono sea correcto en tu perfil.',
  document_missing: 'Tus documentos de incorporación están en la sección de Documentos de la aplicación. Si necesitas que te los reenvíen, responde con tu dirección de correo electrónico.',
  onboarding_stuck: 'Si tu incorporación está atascada en una tarea, intenta actualizar la aplicación. Si una tarea específica no se completa, responde con cuál es la tarea y la reiniciaremos.',
  compliance_alert: 'Si tu licencia o certificación está por vencer, sube la renovación en la sección de Documentos > Cumplimiento de la aplicación. Normalmente tarda 1-2 días en verificarse.',
  technical_error: 'Intenta cerrar la aplicación y volver a abrirla. Si el problema continúa, responde con el error que estás viendo y lo resolveremos.',
  general_question: null as any,
};

// ─── Trinity AI Fallback ───────────────────────────────────────────────────

async function tryTrinityAI(message: string, workspaceId: string, firstName: string, lang: 'en' | 'es' = 'en'): Promise<string | null> {
  try {
    const { resolveWithTrinityBrain } = await import('./trinityAIResolver');
    const langPrefix = lang === 'es'
      ? `El oficial ${firstName} envió un mensaje de texto en español: "${message}". Responde ENTERAMENTE en español.`
      : `Officer ${firstName} texted: "${message}"`;
    const result = await resolveWithTrinityBrain({
      issue: langPrefix,
      workspaceId,
      language: lang,
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

// ─── Shift Offer Acceptance ────────────────────────────────────────────────

async function handleShiftOfferAcceptance(
  fromPhone: string,
  identity: VerifiedIdentity,
  lang: 'en' | 'es' = 'en'
): Promise<SmsResolverResult> {
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
  approved: boolean,
  lang: 'en' | 'es' = 'en'
): Promise<SmsResolverResult> {
  if (!verification.verified || !verification.identity) {
    return {
      resolved: true,
      reply: t(
        `I wasn't able to verify your identity as a manager. Please log in to the app to approve requests. — Trinity`,
        `No pude verificar tu identidad como gerente. Por favor inicia sesión en la aplicación para aprobar solicitudes. — Trinity`,
        lang
      ),
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
        reply: t(
          `Hi ${identity.firstName}! No pending approvals found in your workspace right now. Check the app for the full list. — Trinity`,
          `¡Hola ${identity.firstName}! No se encontraron aprobaciones pendientes en tu espacio de trabajo en este momento. Consulta la aplicación para la lista completa. — Trinity`,
          lang
        ),
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

    const esStatus = approved ? 'aprobada' : 'denegada';

    return {
      resolved: true,
      reply: t(
        `Got it ${identity.firstName}! ` +
          `${empName}'s ${actionLabel} has been ${newStatus}. ` +
          `They've been notified. — Trinity`,
        `¡Entendido ${identity.firstName}! ` +
          `La solicitud de ${actionLabel} de ${empName} ha sido ${esStatus}. ` +
          `Ya se les notificó. — Trinity`,
        lang
      ),
      method: 'auto_action',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  } catch (err: any) {
    log.error('[SMS] Approval workflow error:', err?.message);
    return {
      resolved: true,
      reply: t(
        `There was an issue processing your ${approved ? 'approval' : 'denial'}. Please use the app. — Trinity`,
        `Hubo un problema procesando tu ${approved ? 'aprobación' : 'denegación'}. Por favor usa la aplicación. — Trinity`,
        lang
      ),
      method: 'error',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  }
}

// ─── Employee Number Verification ──────────────────────────────────────────

async function handleEmployeeNumberVerification(
  fromPhone: string,
  employeeNumber: string,
  lang: 'en' | 'es' = 'en'
): Promise<SmsResolverResult> {
  const { verifyByEmployeeNumber } = await import('./smsIdentityService');
  const result = await verifyByEmployeeNumber(fromPhone, employeeNumber);

  if (result.verified && result.identity) {
    // Prefer the employee's stored preference if set, otherwise use inbound detection.
    const replyLang: 'en' | 'es' =
      result.identity.preferredLanguage === 'es' ? 'es' : lang;
    return {
      resolved: true,
      reply: t(
        `Welcome, ${result.identity.firstName}! I've verified your identity. ` +
          `I'm Trinity, your Co-League AI assistant. You can now ask me about your schedule, shifts, pay periods, or anything else. ` +
          `What can I help you with?`,
        `¡Bienvenido, ${result.identity.firstName}! He verificado tu identidad. ` +
          `Soy Trinity, tu asistente IA de Co-League. Ahora puedes preguntarme sobre tu horario, turnos, períodos de pago o cualquier otra cosa. ` +
          `¿En qué puedo ayudarte?`,
        replyLang
      ),
      method: 'auto_action',
      workspaceId: result.identity.workspaceId,
      employeeId: result.identity.employeeId,
    };
  }

  return {
    resolved: true,
    reply: t(
      `I wasn't able to match that employee number to your phone number. ` +
        `Please double-check your employee number in the app under Profile, or contact your supervisor. ` +
        `If you just started, it may take 24 hours to appear in the system. — Trinity`,
      `No pude asociar ese número de empleado con tu número de teléfono. ` +
        `Por favor verifica tu número de empleado en la aplicación bajo Perfil, o contacta a tu supervisor. ` +
        `Si acabas de empezar, puede tardar 24 horas en aparecer en el sistema. — Trinity`,
      lang
    ),
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

  // Detect inbound language early — used as a fallback when the employee
  // has no stored preferred_language.
  const inboundLang: 'en' | 'es' = detectLanguage(trimmed);

  // Step 1: Verify identity by phone
  const { verifyByPhone, notifyManagementUnverified, logFailedVerification } =
    await import('./smsIdentityService');
  const verification = await verifyByPhone(fromPhone);

  // Resolved language: employee's stored preference wins; otherwise detected.
  const lang: 'en' | 'es' =
    verification.identity?.preferredLanguage === 'es' ? 'es' : inboundLang;

  // Step 2: Shift offer responses (YES/NO/SI/SÍ)
  if (['YES', 'Y', 'SI', 'SÍ'].includes(upper) && verification.verified && verification.identity) {
    return handleShiftOfferAcceptance(fromPhone, verification.identity, lang);
  }
  if (['NO', 'N'].includes(upper) && verification.verified && verification.identity) {
    return {
      resolved: true,
      reply: t(
        `No problem, ${verification.identity.firstName}! We'll keep you in mind for the next opportunity. — Trinity`,
        `¡Sin problema, ${verification.identity.firstName}! Te tendremos en cuenta para la próxima oportunidad. — Trinity`,
        lang
      ),
      method: 'auto_action',
      workspaceId: verification.identity.workspaceId,
      employeeId: verification.identity.employeeId,
    };
  }

  // Step 3: Manager approval / denial (bilingual keywords)
  if (['APPROVE', 'APPROVED', 'YES APPROVE', 'APROBAR', 'APROBADO', 'APROBADA'].includes(upper)) {
    return handleManagerApproval(fromPhone, verification, true, lang);
  }
  if (['DENY', 'DENIED', 'DECLINE', 'REJECT', 'NEGAR', 'DENEGAR', 'DENEGADO', 'DENEGADA', 'RECHAZAR'].includes(upper)) {
    return handleManagerApproval(fromPhone, verification, false, lang);
  }

  // Step 4: Employee number verification attempt
  if (/^EMP-[A-Z0-9]+-\d+$/i.test(trimmed) || /^\d{4,8}$/.test(trimmed)) {
    return handleEmployeeNumberVerification(fromPhone, trimmed, lang);
  }

  // Step 5: Unverified sender — soft challenge + management notice
  if (!verification.verified) {
    await logFailedVerification(fromPhone, 'phone_not_in_system');
    const isNewOfficerLikely =
      /help|schedule|shift|work|new|start|begin|how/i.test(trimmed) ||
      /ayuda|horario|turno|trabajo|nuevo|empezar|comenzar|cómo|como/i.test(trimmed);

    if (isNewOfficerLikely) {
      await notifyManagementUnverified(fromPhone, trimmed);
      return {
        resolved: true,
        reply: t(
          `Hi! I'm Trinity, Co-League's AI assistant. I wasn't able to find your profile in our system — ` +
            `you might be new, or your phone number may not be registered yet. ` +
            `Reply with your employee number (like EMP-1234-00001) so I can look you up, ` +
            `or contact your supervisor to get set up. Your supervisor has been notified. — Trinity`,
          `¡Hola! Soy Trinity, la asistente IA de Co-League. No pude encontrar tu perfil en nuestro sistema — ` +
            `puede que seas nuevo, o que tu número de teléfono aún no esté registrado. ` +
            `Responde con tu número de empleado (como EMP-1234-00001) para buscarte, ` +
            `o contacta a tu supervisor para que te configuren. Tu supervisor ha sido notificado. — Trinity`,
          lang
        ),
        method: 'auto_action',
      };
    }

    await notifyManagementUnverified(fromPhone, trimmed);
    return {
      resolved: true,
      reply: t(
        `Hi! I'm Trinity from Co-League. I couldn't verify your identity in our system. ` +
          `If you're a Co-League employee, please reply with your employee number. ` +
          `If you need general help, visit www.coaileague.com. — Trinity`,
        `¡Hola! Soy Trinity de Co-League. No pude verificar tu identidad en nuestro sistema. ` +
          `Si eres empleado de Co-League, por favor responde con tu número de empleado. ` +
          `Si necesitas ayuda general, visita www.coaileague.com. — Trinity`,
        lang
      ),
      method: 'auto_action',
    };
  }

  // Step 6: Verified sender — Trinity brain with context
  const identity = verification.identity!;
  const category = classifyMessage(trimmed);

  // FAQ lookup first
  const faqAnswer = await tryFaqLookup(trimmed, identity.workspaceId);
  if (faqAnswer) {
    const reply = t(
      `Hi ${identity.firstName}, ${faqAnswer}`,
      `Hola ${identity.firstName}, ${faqAnswer}`,
      lang
    );
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

  // Instant answer for common categories (bilingual)
  const instantAnswer = lang === 'es'
    ? INSTANT_ANSWERS_ES[category]
    : INSTANT_ANSWERS[category];
  if (instantAnswer) {
    const reply = t(
      `Hi ${identity.firstName}! ${instantAnswer}`,
      `¡Hola ${identity.firstName}! ${instantAnswer}`,
      lang
    );
    void flagFaqCandidate(trimmed, identity.workspaceId, category);
    log.info(`[SmsAutoResolver] Instant answer (${category}, ${lang}) for ${fromPhone}`);
    return {
      resolved: true,
      reply: reply.slice(0, 320),
      method: 'auto_action',
      workspaceId: identity.workspaceId,
      employeeId: identity.employeeId,
    };
  }

  // Trinity AI with full context — reply matches resolved language
  const ctx = await getEmployeeContext(identity.employeeId, identity.workspaceId);
  const contextualMessage = ctx ? `${trimmed}\n\n[Context: ${ctx}]` : trimmed;

  // Token hard-cap pre-check — free/trial tenants at cap must not invoke AI.
  // aiMeteringService.checkUsageAllowedById is the same gate used by every
  // AI provider through aiCreditGateway.preAuthorize(). Protected workspaces
  // (platform + grandfathered) are internally bypassed by that service.
  let tokenCapExhausted = false;
  if (identity.workspaceId && identity.workspaceId !== 'platform') {
    try {
      const { aiMeteringService } = await import('../billing/aiMeteringService');
      const guard = await aiMeteringService.checkUsageAllowedById(identity.workspaceId);
      if (!guard.allowed) {
        tokenCapExhausted = true;
        log.warn(`[SmsAutoResolver] Token hard cap exhausted for workspace ${identity.workspaceId} — falling through to ticket`);
      }
    } catch (capErr: any) {
      log.warn('[SmsAutoResolver] Token cap check failed (non-fatal):', capErr?.message);
    }
  }

  const aiAnswer = tokenCapExhausted
    ? null
    : await tryTrinityAI(contextualMessage, identity.workspaceId, identity.firstName, lang);

  if (aiAnswer) {
    const prefix = t(`Hi ${identity.firstName}, `, `Hola ${identity.firstName}, `, lang);
    const reply = (prefix + aiAnswer).slice(0, 320);
    void flagFaqCandidate(trimmed, identity.workspaceId, category);
    log.info(`[SmsAutoResolver] AI resolved for ${fromPhone} (lang=${lang})`);

    // Record AI-resolved SMS for billing/metering. Awaited with a non-fatal
    // try/catch per CLAUDE.md §B — no fire-and-forget. The carrier cost of
    // the outbound Trinity reply is recorded separately by the SMS sender,
    // so twilioCostCents=0 here. The synthetic messageSid lets the row be
    // inserted before Twilio returns the real SID.
    try {
      const { voiceSmsMeteringService } = await import('../billing/voiceSmsMeteringService');
      await voiceSmsMeteringService.recordSmsMessage({
        workspaceId: identity.workspaceId,
        messageSid: `ai-sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        callType: 'trinity_ai_response',
        twilioCostCents: 0,
      });
    } catch (e: any) {
      log.warn('[SmsAutoResolver] SMS metering failed (non-fatal):', e?.message);
    }

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
    reply: t(
      `Got it ${identity.firstName}! I've created support case ${caseNumber} for your request. ` +
        `A specialist from ${identity.orgName} will follow up with you shortly. — Trinity`,
      `¡Entendido ${identity.firstName}! He creado el caso de soporte ${caseNumber} para tu solicitud. ` +
        `Un especialista de ${identity.orgName} se comunicará contigo pronto. — Trinity`,
      lang
    ).slice(0, 320),
    method: 'ticket',
    caseNumber,
    workspaceId: identity.workspaceId,
    employeeId: identity.employeeId,
  };
}
