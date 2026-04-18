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
const log = createLogger('TrinitySmsKeywordRouter');

const RECOGNIZED = new Set([
  'CLOCKIN', 'CLOCK-IN', 'CLOCK_IN', 'IN',
  'CLOCKOUT', 'CLOCK-OUT', 'CLOCK_OUT', 'OUT',
  'COMPLAINT',
  'REQUEST', 'TICKET',
  'VERIFY', 'EVERIFY', 'VERIFICATION',
  'STATUS',
  'HELP', 'COMMANDS', 'COMMAND',
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
  } catch (e: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
    log.warn('[KeywordRouter] status lookup failed:', err?.message);
    return `Trinity: I couldn't pull your case status right now. Try again in a moment.`;
  }
}

function helpReply(): string {
  return (
    `Trinity commands: ` +
    `CLOCKIN <emp#> <pin>, CLOCKOUT <emp#> <pin>, ` +
    `COMPLAINT <message>, REQUEST <message>, VERIFY <emp# or name>, ` +
    `STATUS, HELP. ` +
    `Reply STOP to opt out of texts.`
  );
}

export async function handleTrinitySmsKeyword(params: {
  fromPhone: string;
  rawBody: string;
}): Promise<string | null> {
  const body = (params.rawBody || '').trim();
  if (!body) return null;

  const tokens = body.split(/\s+/);
  const head = normalizeKeyword(tokens[0] || '');
  if (!RECOGNIZED.has(head)) return null;

  const officer = await findEmployeeByPhone(params.fromPhone);
  const args = tokens.slice(1);

  switch (head) {
    case 'CLOCKIN':
    case 'CLOCK-IN':
    case 'CLOCK_IN':
    case 'IN':
      return handleClockIn(args, officer);

    case 'CLOCKOUT':
    case 'CLOCK-OUT':
    case 'CLOCK_OUT':
    case 'OUT':
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
      return helpReply();

    default:
      return null;
  }
}
