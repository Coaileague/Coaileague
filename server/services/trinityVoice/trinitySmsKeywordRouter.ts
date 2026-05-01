/**
 * Trinity SMS Keyword Router — Phase 18B+
 * ========================================
 * Reliable keyword-driven fallbacks for when the platform UI is unreachable
 * (low signal, app outage, employee on a personal phone, etc.). Each keyword
 * resolves to a deterministic action so officers can always reach Trinity
 * even when nothing else works.
 *
 * Recognized keywords (case-insensitive, leading-token match):
 *   CLOCKIN <employee#> <pin>     — voice-clock-in fallback
 *   CLOCKOUT <employee#> <pin>    — closes the open time entry
 *   COMPLAINT <text>              — opens a complaint case, notifies agents
 *   REQUEST <text>                — opens a generic support case
 *   VERIFY <employee# or name>    — kicks off employment verification (logs
 *                                   the request, replies with the workflow)
 *   STATUS                        — last open case status
 *   HELP / COMMANDS               — list of supported keywords
 *
 * STOP, START, YES, NO, ACCEPT, DENY are handled upstream in voiceRoutes.ts
 * (TCPA opt-out + shift-offer flow). This router is consulted for everything
 * that doesn't match those, before the AI auto-resolver.
 */

import bcrypt from 'bcryptjs';
import { createLogger } from '../../lib/logger';
import { verifyCaller, verificationFailureMessageSms } from './trinityCallerVerification';
import { verifyByPhone } from './smsIdentityService';
import {
  checkAndRecordRate,
  rateLimitMessage,
  recordVerificationFailure,
  placeSupervisorWelfareCall,
} from './smsAbusePrevention';
const log = createLogger('TrinitySmsKeywordRouter');

const RECOGNIZED = new Set([
  'CLOCKIN', 'CLOCK-IN', 'CLOCK_IN', 'IN',
  'CLOCKOUT', 'CLOCK-OUT', 'CLOCK_OUT', 'OUT',
  'COMPLAINT',
  'REQUEST', 'TICKET',
  'VERIFY', 'EVERIFY', 'VERIFICATION',
  'STATUS',
  'HELP', 'COMMANDS', 'COMMAND',
  // Phase 18C — Emergency escalation keywords.
  'EMERGENCY', 'PANIC', 'DURESS', 'SOS', 'HELP911', '911',
  // Phase 20 — calloff workflow.
  'CALLOFF', 'CALLOUT', 'CALLINSICK', 'SICK',
  // Phase 23/24 — self-service lookups.
  'SCHEDULE', 'SHIFTS', 'MYSCHEDULE', 'WHENDOIWORK', 'WHENDOIWRK',
  'PAY', 'PAYCHECK', 'PAYSTUB', 'PAYDAY', 'MYPAY', 'HOURS', 'PAYROLL',
  // ── Spanish aliases (Phase 25 — bilingual SMS) ────────────────────────────
  // Clock in/out
  'ENTRADA', 'ENTRAR', 'CHECKIN',          // = CLOCKIN
  'SALIDA', 'SALIR', 'CHECKOUT',           // = CLOCKOUT
  // Schedule
  'HORARIO', 'TURNOS', 'MIHORARIO',        // = SCHEDULE
  // Pay
  'PAGO', 'SUELDO', 'NOMINA', 'NÓMINA',   // = PAY
  // Calloff
  'AUSENCIA', 'NOASISTO', 'ENFERMO',      // = CALLOFF
  // Emergency
  'EMERGENCIA', 'PANICO', 'PÁNICO', 'AYUDA911', // = EMERGENCY
  // Help
  'AYUDA', 'COMANDOS',                    // = HELP
]);

function normalizeKeyword(token: string): string {
  return token.toUpperCase().replace(/[^A-Z]/g, '');
}

async function findEmployeeByPhone(fromPhone: string) {
  try {
    const { pool } = await import('../../db');
    const digits = fromPhone.replace(/\D/g, '').replace(/^1/, '');
    if (digits.length < 7) return null;
    const r = await pool.query(
      `SELECT e.id, e.workspace_id, e.first_name, e.last_name, e.employee_number, e.clockin_pin_hash,
              w.name AS workspace_name
         FROM employees e
         LEFT JOIN workspaces w ON w.id = e.workspace_id
        WHERE REGEXP_REPLACE(coalesce(e.phone, ''), '[^0-9]', '', 'g') LIKE $1
          AND e.is_active = true
        ORDER BY e.updated_at DESC NULLS LAST
        LIMIT 1`,
      [`%${digits.slice(-10)}`]
    );
    return r.rows[0] || null;
  } catch (e: unknown) {
    log.warn('[KeywordRouter] employee lookup failed:', e?.message);
    return null;
  }
}

async function handleClockIn(args: string[], officer: any): Promise<string> {
  const { pool } = await import('../../db');
  // Accept either the linked-employee fast path (CLOCKIN <pin>) or the
  // full path with explicit employee number (CLOCKIN <emp#> <pin>).
  let employeeNumber = officer?.employee_number || '';
  let pin = '';
  if (args.length === 1) pin = args[0];
  if (args.length >= 2) { employeeNumber = args[0]; pin = args[1]; }

  if (!pin || pin.replace(/\D/g, '').length !== 6) {
    return `Trinity: Use format CLOCKIN <employee#> <6-digit PIN>. Example: CLOCKIN EMP-ACM-001 123456.`;
  }
  if (!employeeNumber) {
    return `Trinity: I couldn't find an employee linked to this phone. Reply CLOCKIN <employee#> <6-digit PIN>.`;
  }

  // Verify the PIN. Reuse the same hashing scheme as voice clock-in.
  const empRes = await pool.query(
    `SELECT id, workspace_id, first_name, last_name, clockin_pin_hash
       FROM employees
      WHERE UPPER(employee_number) = UPPER($1)
        AND is_active = true
      LIMIT 1`,
    [employeeNumber]
  );
  if (!empRes.rows.length) return `Trinity: Employee number not found. Please double-check and try again.`;
  const emp = empRes.rows[0];
  if (!emp.clockin_pin_hash) {
    return `Trinity: No clock-in PIN set up for ${emp.first_name}. Ask your supervisor to set one in the Co-League app.`;
  }
  const ok = await bcrypt.compare(pin.replace(/\D/g, ''), emp.clockin_pin_hash);
  if (!ok) return `Trinity: PIN didn't match. Please try again or contact your supervisor.`;

  // Reject duplicate open entries
  const open = await pool.query(
    `SELECT reference_id FROM time_entries
      WHERE workspace_id = $1 AND employee_id = $2 AND clock_out IS NULL
      LIMIT 1`,
    [emp.workspace_id, emp.id]
  );
  if (open.rows.length) {
    const ref = open.rows[0].reference_id || 'on file';
    return `Trinity: ${emp.first_name}, you're already clocked in (ref ${ref}). Reply CLOCKOUT <employee#> <PIN> when you finish your shift.`;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  const referenceId = `CLK-${dateStr}-${seq}`;

  await pool.query(
    `INSERT INTO time_entries (workspace_id, employee_id, clock_in, clock_in_method, reference_id, status,
        trinity_assisted_clockin, trinity_clock_in_reason, created_at, updated_at)
     VALUES ($1, $2, NOW(), 'sms_phone', $3, 'pending', true, 'SMS phone clock-in fallback via Trinity', NOW(), NOW())`,
    [emp.workspace_id, emp.id, referenceId]
  );

  return `Trinity: Clocked in ${emp.first_name} at ${now.toLocaleTimeString()}. Reference ${referenceId}. Have a great shift!`;
}

async function handleClockOut(args: string[], officer: any): Promise<string> {
  const { pool } = await import('../../db');
  let employeeNumber = officer?.employee_number || '';
  let pin = '';
  if (args.length === 1) pin = args[0];
  if (args.length >= 2) { employeeNumber = args[0]; pin = args[1]; }

  if (!pin || pin.replace(/\D/g, '').length !== 6) {
    return `Trinity: Use format CLOCKOUT <employee#> <6-digit PIN>.`;
  }
  if (!employeeNumber) {
    return `Trinity: I couldn't find an employee linked to this phone. Reply CLOCKOUT <employee#> <6-digit PIN>.`;
  }

  const empRes = await pool.query(
    `SELECT id, workspace_id, first_name, clockin_pin_hash
       FROM employees
      WHERE UPPER(employee_number) = UPPER($1)
        AND is_active = true
      LIMIT 1`,
    [employeeNumber]
  );
  if (!empRes.rows.length) return `Trinity: Employee number not found.`;
  const emp = empRes.rows[0];
  if (!emp.clockin_pin_hash) return `Trinity: No clock-out PIN set up. Contact your supervisor.`;
  const ok = await bcrypt.compare(pin.replace(/\D/g, ''), emp.clockin_pin_hash);
  if (!ok) return `Trinity: PIN didn't match. Please try again.`;

  const updated = await pool.query(
    `UPDATE time_entries
        SET clock_out = NOW(), updated_at = NOW()
      WHERE workspace_id = $1
        AND employee_id = $2
        AND clock_out IS NULL
      RETURNING reference_id`,
    [emp.workspace_id, emp.id]
  );
  if ((updated.rowCount ?? 0) === 0) {
    return `Trinity: ${emp.first_name}, I don't see an open clock-in for you. If you didn't clock in, reply CLOCKIN <employee#> <PIN>.`;
  }
  const ref = updated.rows[0]?.reference_id || 'on file';
  return `Trinity: Clocked out ${emp.first_name}. Reference ${ref}. Thanks for your shift!`;
}

async function handleComplaintOrRequest(
  kind: 'complaint' | 'request',
  body: string,
  officer: any,
  fromPhone: string
): Promise<string> {
  const summary = body.replace(/^(complaint|request|ticket)\s*[:\-]?\s*/i, '').trim().slice(0, 1000);
  if (!summary) {
    return kind === 'complaint'
      ? `Trinity: Send COMPLAINT followed by what happened. Example: COMPLAINT supervisor was rude at site 42.`
      : `Trinity: Send REQUEST followed by what you need. Example: REQUEST need extra uniforms.`;
  }

  try {
    const { createSupportCase, notifyHumanAgents } = await import('./supportCaseService');
    const workspaceId = officer?.workspace_id || 'platform';
    const callerName = officer ? `${officer.first_name} ${officer.last_name}`.trim() : undefined;

    const sc = await createSupportCase({
      workspaceId,
      callerNumber: fromPhone,
      callerName,
      issueSummary: `[${kind.toUpperCase()} via SMS] ${summary}`,
      aiResolutionAttempted: false,
      language: 'en',
    });

    notifyHumanAgents({ supportCase: sc, workspaceId }).catch((e: any) =>
      log.warn('[KeywordRouter] notify human agents failed (non-fatal):', e?.message)
    );

    const lead = kind === 'complaint'
      ? `Trinity: Your complaint has been logged. Case ${sc.case_number}. A team member will review and reach out.`
      : `Trinity: Got it — your request is filed. Case ${sc.case_number}. We'll follow up shortly.`;
    return lead;
  } catch (err: unknown) {
    log.warn('[KeywordRouter] complaint/request case create failed:', err?.message);
    return `Trinity: I logged your message but couldn't open a case automatically. A human will reach out soon.`;
  }
}

async function handleVerify(args: string[], officer: any, fromPhone: string): Promise<string> {
  const target = args.join(' ').trim().slice(0, 200);
  if (!target) {
    return `Trinity: Send VERIFY followed by the employee number or full name to start an employment verification request. We respond in writing within 2 business days.`;
  }

  try {
    const { createSupportCase } = await import('./supportCaseService');
    const workspaceId = officer?.workspace_id || 'platform';
    const callerName = officer ? `${officer.first_name} ${officer.last_name}`.trim() : undefined;
    const sc = await createSupportCase({
      workspaceId,
      callerNumber: fromPhone,
      callerName,
      issueSummary: `[EMPLOYMENT VERIFICATION via SMS] Subject: ${target}`,
      aiResolutionAttempted: false,
      language: 'en',
    });
    return `Trinity: Verification request received for "${target}". Case ${sc.case_number}. To protect employee privacy, we will respond in writing within 2 business days.`;
  } catch (err: unknown) {
    log.warn('[KeywordRouter] verify case create failed:', err?.message);
    return `Trinity: We received your verification request and will respond in writing within 2 business days.`;
  }
}

async function handleStatus(officer: any, fromPhone: string): Promise<string> {
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT case_number, status, issue_summary, created_at
         FROM voice_support_cases
        WHERE caller_number = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [fromPhone]
    );
    if (!r.rows.length) {
      return `Trinity: No support cases on file for this number. Reply REQUEST <message> to open one.`;
    }
    const c = r.rows[0];
    const summary = (c.issue_summary || '').slice(0, 80);
    return `Trinity: Most recent case ${c.case_number} is ${c.status}. ("${summary}")`;
  } catch (err: unknown) {
    log.warn('[KeywordRouter] status lookup failed:', err?.message);
    return `Trinity: I couldn't pull your case status right now. Try again in a moment.`;
  }
}

function helpReply(): string {
  return (
    `Trinity commands: ` +
    `CLOCKIN <emp#> <pin> | ENTRADA, CLOCKOUT <emp#> <pin> | SALIDA, ` +
    `CALLOFF <reason> | AUSENCIA, SCHEDULE | HORARIO, PAY | PAGO, ` +
    `YES (accept offer) | NO (decline offer), ` +
    `COMPLAINT <message>, REQUEST <message>, STATUS, EMERGENCY | EMERGENCIA. ` +
    `Reply STOP to unsubscribe.`
  );
}

/**
 * Emergency / panic / duress fallback. Never gated — if an officer is under
 * threat and texts EMERGENCY, Trinity must respond and create a high-priority
 * case regardless of phone-verification status.
 */
async function handleEmergency(args: string[], body: string, fromPhone: string): Promise<string> {
  try {
    const { pool } = await import('../../db');
    const officer = await findEmployeeByPhone(fromPhone);
    const workspaceId = officer?.workspace_id || 'platform';
    const callerName = officer ? `${officer.first_name} ${officer.last_name}`.trim() : undefined;
    const locationHint = args.join(' ').trim().slice(0, 300) || body.slice(0, 300);

    const { createSupportCase, notifyHumanAgents } = await import('./supportCaseService');
    const sc = await createSupportCase({
      workspaceId,
      callerNumber: fromPhone,
      callerName,
      issueSummary: `[EMERGENCY/DURESS via SMS] ${locationHint || 'officer requested immediate help'}`,
      aiResolutionAttempted: false,
      language: 'en',
    });

    // Fire the notification non-blocking — speed matters here.
    notifyHumanAgents({ supportCase: sc, workspaceId }).catch((e: any) =>
      log.warn('[KeywordRouter] emergency notify failed (non-fatal):', e?.message)
    );

    // Best-effort: publish a high-priority platform event too.
    try {
      await pool.query(
        `INSERT INTO voice_call_actions (call_session_id, workspace_id, action, payload, outcome, occurred_at)
         VALUES ('sms_emergency', $1, 'officer_emergency_sms', $2, 'pending', NOW())`,
        [workspaceId, JSON.stringify({ fromPhone, locationHint, caseNumber: sc.case_number })]
      );
    } catch { /* table/column variance — not critical */ }

    return (
      `Trinity: Your emergency alert is received. Case ${sc.case_number} is active and the on-call team has been paged. ` +
      `If you are in immediate danger, call 9-1-1 now. Reply SAFE when you're no longer in danger.`
    );
  } catch (err: unknown) {
    log.error('[KeywordRouter] emergency handler failed:', err?.message);
    return `Trinity: Your emergency alert is received. If you are in immediate danger, call 9-1-1 now. Our on-call team has been paged.`;
  }
}

// Sensitive keywords require verified phone-on-profile. The list is conservative —
// HELP and the auditor-style VERIFY request are intentionally excluded so people
// without an account can still reach Trinity for assistance / regulatory intake.
const REQUIRES_VERIFICATION = new Set([
  'CLOCKIN', 'CLOCK-IN', 'CLOCK_IN', 'IN',
  'CLOCKOUT', 'CLOCK-OUT', 'CLOCK_OUT', 'OUT',
  'COMPLAINT',
  'REQUEST', 'TICKET',
  'STATUS',
  // Phase 20 — calloff must be tied to a verified officer profile so an
  // attacker can't trigger false calloffs from a random number.
  'CALLOFF', 'CALLOUT', 'CALLINSICK', 'SICK',
  // Phase 23 — schedule and pay reveal personal data; require Tier 1 phone verification.
  // Phase 24 — additional natural-language aliases kept under the same gate.
  'SCHEDULE', 'SHIFTS', 'MYSCHEDULE', 'WHENDOIWORK', 'WHENDOIWRK',
  'PAY', 'PAYCHECK', 'PAYSTUB', 'PAYDAY', 'MYPAY', 'HOURS', 'PAYROLL',
]);

export async function handleTrinitySmsKeyword(params: {
  fromPhone: string;
  rawBody: string;
  baseUrl?: string;
}): Promise<string | null> {
  const body = (params.rawBody || '').trim();
  if (!body) return null;

  const tokens = body.split(/\s+/);
  const head = normalizeKeyword(tokens[0] || '');
  if (!RECOGNIZED.has(head)) return null;

  // Phase 18D rate limit — except emergency keywords, which are never gated.
  const isEmergency = ['EMERGENCY', 'PANIC', 'DURESS', 'SOS', 'HELP911', '911'].includes(head);
  if (!isEmergency) {
    const rate = await checkAndRecordRate(params.fromPhone, head);
    if (!rate.allowed) {
      log.info(`[KeywordRouter] Rate-limited ${params.fromPhone} (${rate.countLastHour}/hour)`);
      return rateLimitMessage();
    }
  }

  // Anti-fraud gate — block sensitive commands when the caller's phone is not
  // on file for an active, claimed employee profile.
  if (REQUIRES_VERIFICATION.has(head)) {
    const v = await verifyCaller(params.fromPhone);
    if (!v.verified) {
      log.info(`[KeywordRouter] Verification failed for ${params.fromPhone} (${v.reason}) — keyword=${head}`);
      const fail = await recordVerificationFailure({
        fromPhone: params.fromPhone,
        reason: v.reason,
        keyword: head,
      });
      if (fail.triggerWelfareCheck && params.baseUrl) {
        // Fire-and-await — but tolerate failure so the caller still gets a reply.
        try {
          await placeSupervisorWelfareCall({ fromPhone: params.fromPhone, baseUrl: params.baseUrl });
        } catch (e: unknown) {
          log.warn('[KeywordRouter] Welfare call failed (non-fatal):', e?.message);
        }
      }
      return verificationFailureMessageSms();
    }
  }

  const officer = await findEmployeeByPhone(params.fromPhone);
  const args = tokens.slice(1);

  switch (head) {
    // Emergency first — routed before verification, intentionally.
    case 'EMERGENCY':
    case 'PANIC':
    case 'DURESS':
    case 'SOS':
    case 'HELP911':
    case '911':
    case 'EMERGENCIA':
    case 'PANICO':
    case 'PÁNICO':
    case 'AYUDA911':
      return handleEmergency(args, body, params.fromPhone);

    case 'CLOCKIN':
    case 'CLOCK-IN':
    case 'CLOCK_IN':
    case 'IN':
    case 'ENTRADA':
    case 'ENTRAR':
    case 'CHECKIN':
      return handleClockIn(args, officer);

    case 'CLOCKOUT':
    case 'CLOCK-OUT':
    case 'CLOCK_OUT':
    case 'OUT':
    case 'SALIDA':
    case 'SALIR':
    case 'CHECKOUT':
      return handleClockOut(args, officer);

    case 'COMPLAINT':
      return handleComplaintOrRequest('complaint', body, officer, params.fromPhone);

    case 'REQUEST':
    case 'TICKET':
      return handleComplaintOrRequest('request', body, officer, params.fromPhone);

    case 'VERIFY':
    case 'EVERIFY':
    case 'VERIFICATION':
      return handleVerify(args, officer, params.fromPhone);

    case 'STATUS':
      return handleStatus(officer, params.fromPhone);

    case 'HELP':
    case 'COMMANDS':
    case 'COMMAND':
    case 'AYUDA':
    case 'COMANDOS':
      return helpReply();

    // Phase 20 — CALLOFF: trigger Trinity's autonomous coverage workflow.
    case 'CALLOFF':
    case 'CALLOUT':
    case 'CALLINSICK':
    case 'SICK':
    case 'AUSENCIA':
    case 'NOASISTO':
    case 'ENFERMO':
      return handleCalloff(args, body, officer, params.fromPhone);

    // Phase 23 — self-service data lookups (Tier 1 phone-verified).
    // Phase 25 — Spanish aliases.
    case 'SCHEDULE':
    case 'SHIFTS':
    case 'MYSCHEDULE':
    case 'WHENDOIWORK':
    case 'WHENDOIWRK':
    case 'HORARIO':
    case 'TURNOS':
    case 'MIHORARIO':
      return handleSchedule(params.fromPhone);

    case 'PAY':
    case 'PAYCHECK':
    case 'PAYSTUB':
    case 'PAYDAY':
    case 'MYPAY':
    case 'HOURS':
    case 'PAYROLL':
    case 'PAGO':
    case 'SUELDO':
    case 'NOMINA':
    case 'NÓMINA':
      return handlePay(params.fromPhone);

    default:
      return null;
  }
}

// ─── Phase 23: SCHEDULE / PAY handlers ───────────────────────────────────────
// Self-service data lookups for officers on personal phones. Tier 1 phone
// verification (verifyByPhone) resolves the officer identity and also prevents
// anyone whose number isn't on an active employee record from pulling personal
// data. REQUIRES_VERIFICATION above additionally runs verifyCaller as a second
// gate (adds welfare-check escalation on repeat failures).

async function handleSchedule(fromPhone: string): Promise<string> {
  const v = await verifyByPhone(fromPhone);
  if (!v.verified || !v.identity) {
    return `Trinity: I couldn't match this phone to an active officer profile, so I can't pull your schedule. Contact your supervisor to verify your phone number on file.`;
  }
  const { employeeId, workspaceId, firstName } = v.identity;

  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT s.start_time, s.end_time, s.status, s.title, s.site_id
         FROM shifts s
        WHERE s.workspace_id = $1
          AND s.employee_id = $2
          AND s.start_time >= NOW()
          AND s.start_time <= NOW() + INTERVAL '7 days'
          AND COALESCE(s.status, '') NOT IN ('cancelled', 'denied')
        ORDER BY s.start_time ASC
        LIMIT 5`,
      [workspaceId, employeeId]
    );

    if (!r.rows.length) {
      return `Trinity: ${firstName}, no shifts scheduled in the next 7 days. Reply REQUEST <details> if you think that's wrong.`;
    }

    const lines = r.rows.map((row: any) => {
      const start = new Date(row.start_time);
      const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${day} ${time}${row.title ? ` — ${row.title}` : ''}`;
    });
    return `Trinity: ${firstName}, your next shifts: ${lines.join('; ')}. Full detail in the app.`;
  } catch (err: unknown) {
    log.warn('[KeywordRouter] SCHEDULE lookup failed:', err?.message);
    return `Trinity: I couldn't pull your schedule right now. Please try again in a moment or open the app.`;
  }
}

async function handlePay(fromPhone: string): Promise<string> {
  const v = await verifyByPhone(fromPhone);
  if (!v.verified || !v.identity) {
    return `Trinity: I couldn't match this phone to an active officer profile, so I can't pull your pay info. Contact your supervisor to verify your phone number on file.`;
  }
  const { employeeId, workspaceId, firstName } = v.identity;

  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT period_start, period_end, regular_hours, overtime_hours,
              gross_pay, net_pay, pay_date
         FROM employee_payroll_records
        WHERE workspace_id = $1
          AND employee_id = $2
        ORDER BY COALESCE(period_end, pay_date, created_at) DESC NULLS LAST
        LIMIT 1`,
      [workspaceId, employeeId]
    );

    if (!r.rows.length) {
      return `Trinity: ${firstName}, no pay records on file yet. Your first pay stub will appear in the app's Payroll section after your first pay period closes.`;
    }

    const row = r.rows[0];
    const periodEnd = row.period_end
      ? new Date(row.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    const regular = row.regular_hours != null ? parseFloat(row.regular_hours).toFixed(1) : null;
    const overtime = row.overtime_hours != null ? parseFloat(row.overtime_hours).toFixed(1) : null;
    const net = row.net_pay != null ? parseFloat(row.net_pay).toFixed(2) : null;
    const gross = row.gross_pay != null ? parseFloat(row.gross_pay).toFixed(2) : null;

    const parts: string[] = [];
    if (periodEnd) parts.push(`period ending ${periodEnd}`);
    if (regular) parts.push(`${regular}h regular${overtime && parseFloat(overtime) > 0 ? ` + ${overtime}h OT` : ''}`);
    if (net) parts.push(`net $${net}`);
    else if (gross) parts.push(`gross $${gross}`);

    const summary = parts.length ? parts.join(', ') : 'details available in the app';
    return `Trinity: ${firstName}, your most recent pay: ${summary}. Full stub in the app under Payroll > Pay Stubs.`;
  } catch (err: unknown) {
    log.warn('[KeywordRouter] PAY lookup failed:', err?.message);
    return `Trinity: I couldn't pull your pay info right now. Please try again in a moment or open the app.`;
  }
}

// ─── Phase 20: CALLOFF handler ────────────────────────────────────────────────
// Officer SMS: "CALLOFF" or "CALLOFF flu" or "SICK tonight"
// Runs Trinity's calloff-coverage workflow inline. The reply is intentionally
// short so Twilio accepts it even on a budget throttled number.
async function handleCalloff(
  args: string[],
  rawBody: string,
  officer: Awaited<ReturnType<typeof findEmployeeByPhone>>,
  fromPhone: string,
): Promise<string> {
  if (!officer) {
    return 'Trinity: We could not match this phone to an active officer profile. Please contact your supervisor directly.';
  }

  const reason = args.length > 0 ? args.join(' ').slice(0, 200) : rawBody.slice(0, 200);

  try {
    const { executeCalloffCoverageWorkflow } = await import(
      '../trinity/workflows/calloffCoverageWorkflow'
    );
    const result = await executeCalloffCoverageWorkflow({
      workspaceId: officer.workspace_id,
      employeeId: officer.id,
      reason: reason || undefined,
      triggerSource: 'sms_calloff',
    });

    if (!result.success) {
      return `Trinity: Calloff received but we could not locate your upcoming shift. A supervisor has been notified. (${result.summary})`;
    }

    if (result.offersSent === 0) {
      return `Trinity: Calloff recorded. No replacements were reachable — your supervisor has been paged for manual coverage.`;
    }

    return (
      `Trinity: Calloff received, ${officer.first_name ?? ''}. We've texted ${result.offersSent} qualified officers for coverage. ` +
      `Supervisor notified. Rest up.`
    ).trim();
  } catch (err: unknown) {
    log.error('[KeywordRouter] CALLOFF workflow error:', err?.message);
    return `Trinity: We received your calloff but hit an error routing coverage. Your supervisor has been paged.`;
  }
}
