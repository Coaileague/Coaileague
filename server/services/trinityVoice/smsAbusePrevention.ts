/**
 * SMS Abuse Prevention — Phase 18D
 * =================================
 * Two complementary controls applied to every inbound SMS keyword:
 *
 *   1. Rate limit: max RATE_LIMIT_PER_HOUR commands per From phone per hour
 *      (sliding window). Blocks SMS spam, brute-force PIN attempts, and
 *      runaway scripts from a compromised device.
 *
 *   2. Welfare-on-failure: when a single phone fails verification 3+ times
 *      within FAILURE_WINDOW_HOURS, Trinity initiates an outbound voice
 *      welfare-check call to the matched officer's listed supervisor so
 *      a human notices that someone is poking at an officer's account.
 *
 * Both use idempotent SQL tables that are created on first use. They are
 * intentionally cheap (no Redis dep) — Postgres is already a hard
 * dependency and the volume here is negligible.
 */

import { createLogger } from '../../lib/logger';
const log = createLogger('SmsAbusePrevention');

const RATE_LIMIT_PER_HOUR = parseInt(process.env.SMS_RATE_LIMIT_PER_HOUR || '20', 10);
const FAILURE_WINDOW_HOURS = parseInt(process.env.SMS_FAILURE_WINDOW_HOURS || '24', 10);
const FAILURE_THRESHOLD = parseInt(process.env.SMS_FAILURE_THRESHOLD || '3', 10);

let bootstrapped = false;
async function ensureTables(): Promise<void> {
  if (bootstrapped) return;
  try {
    const { pool } = await import('../../db');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_command_rate (
        id          BIGSERIAL PRIMARY KEY,
        from_phone  VARCHAR NOT NULL,
        keyword     VARCHAR,
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS sms_command_rate_phone_time_idx
        ON sms_command_rate(from_phone, occurred_at);

      CREATE TABLE IF NOT EXISTS sms_verification_failures (
        id          BIGSERIAL PRIMARY KEY,
        from_phone  VARCHAR NOT NULL,
        reason      VARCHAR,
        keyword     VARCHAR,
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
        welfare_call_triggered BOOLEAN NOT NULL DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS sms_verification_failures_phone_time_idx
        ON sms_verification_failures(from_phone, occurred_at);
    `);
    bootstrapped = true;
  } catch (err: unknown) {
    log.warn('[SmsAbusePrevention] Bootstrap failed (non-fatal):', err?.message);
  }
}

/**
 * Returns true when the request should proceed; false when it's rate-limited.
 * Records the attempt regardless so the next call sees an accurate count.
 */
export async function checkAndRecordRate(fromPhone: string, keyword?: string): Promise<{
  allowed: boolean;
  countLastHour: number;
}> {
  await ensureTables();
  if (!fromPhone) return { allowed: true, countLastHour: 0 };
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM sms_command_rate
        WHERE from_phone = $1 AND occurred_at > NOW() - INTERVAL '1 hour'`,
      [fromPhone]
    );
    const countLastHour = r.rows[0]?.n ?? 0;
    if (countLastHour >= RATE_LIMIT_PER_HOUR) {
      return { allowed: false, countLastHour };
    }
    await pool.query(
      `INSERT INTO sms_command_rate (from_phone, keyword) VALUES ($1, $2)`,
      [fromPhone, (keyword || '').slice(0, 32)]
    );
    return { allowed: true, countLastHour: countLastHour + 1 };
  } catch (err: unknown) {
    log.warn('[SmsAbusePrevention] rate-check failed (open):', err?.message);
    return { allowed: true, countLastHour: 0 };
  }
}

export function rateLimitMessage(): string {
  return (
    `Trinity: This number has hit the hourly safety limit for commands. ` +
    `Try again in a little while, or call (866) 464-4151 if it's urgent. — Trinity`
  );
}

/**
 * Records a verification failure and, if the threshold is reached, returns
 * `triggerWelfareCheck: true` so the caller can place a Trinity outbound
 * call to the matched officer's supervisor.
 */
export async function recordVerificationFailure(params: {
  fromPhone: string;
  reason?: string;
  keyword?: string;
}): Promise<{ triggerWelfareCheck: boolean; failuresInWindow: number }> {
  await ensureTables();
  const { fromPhone, reason, keyword } = params;
  if (!fromPhone) return { triggerWelfareCheck: false, failuresInWindow: 0 };

  try {
    const { pool } = await import('../../db');
    await pool.query(
      `INSERT INTO sms_verification_failures (from_phone, reason, keyword)
       VALUES ($1, $2, $3)`,
      [fromPhone, (reason || '').slice(0, 64), (keyword || '').slice(0, 32)]
    );

    const r = await pool.query(
      `SELECT COUNT(*)::int AS n,
              BOOL_OR(welfare_call_triggered) AS already_triggered
         FROM sms_verification_failures
        WHERE from_phone = $1 AND occurred_at > NOW() - ($2::int * INTERVAL '1 hour')`,
      [fromPhone, FAILURE_WINDOW_HOURS]
    );
    const failuresInWindow = r.rows[0]?.n ?? 0;
    const alreadyTriggered = !!r.rows[0]?.already_triggered;

    const trigger = failuresInWindow >= FAILURE_THRESHOLD && !alreadyTriggered;
    if (trigger) {
      await pool.query(
        `UPDATE sms_verification_failures
            SET welfare_call_triggered = true
          WHERE from_phone = $1
            AND occurred_at > NOW() - ($2::int * INTERVAL '1 hour')`,
        [fromPhone, FAILURE_WINDOW_HOURS]
      );
    }
    return { triggerWelfareCheck: trigger, failuresInWindow };
  } catch (err: unknown) {
    log.warn('[SmsAbusePrevention] failure-record failed:', err?.message);
    return { triggerWelfareCheck: false, failuresInWindow: 0 };
  }
}

/**
 * Best-effort: identify the officer (by the failed phone number) and find
 * a supervisor user to call. The actual Twilio call is placed by
 * trinityOutboundService.
 */
export async function placeSupervisorWelfareCall(params: {
  fromPhone: string;
  baseUrl: string;
}): Promise<{ placed: boolean; reason?: string }> {
  try {
    const { pool } = await import('../../db');
    const digits = params.fromPhone.replace(/\D/g, '').replace(/^1/, '');
    if (digits.length < 7) return { placed: false, reason: 'no_phone_match' };

    const empRes = await pool.query(
      `SELECT id, workspace_id, first_name, last_name
         FROM employees
        WHERE REGEXP_REPLACE(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE $1
        LIMIT 1`,
      [`%${digits.slice(-10)}`]
    );
    if (!empRes.rows.length) return { placed: false, reason: 'officer_not_found' };
    const emp = empRes.rows[0];

    // Find a supervisor's phone via workspace_members → users
    const supRes = await pool.query(
      `SELECT u.phone
         FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
          AND wm.role IN ('org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'supervisor')
          AND u.phone IS NOT NULL
        ORDER BY wm.role
        LIMIT 1`,
      [emp.workspace_id]
    );
    const supervisorPhone = supRes.rows[0]?.phone;
    if (!supervisorPhone) return { placed: false, reason: 'no_supervisor_phone' };

    const { makeOutboundCall } = await import('./trinityOutboundService');
    const message =
      `This is Trinity from Co-League with a security alert. ` +
      `We've seen multiple failed verification attempts from a phone associated with ${emp.first_name} ${emp.last_name}. ` +
      `If this isn't expected, please reach out to them and review their account.`;
    const result = await makeOutboundCall({
      toPhone: supervisorPhone,
      message,
      workspaceId: emp.workspace_id,
      baseUrl: params.baseUrl,
    });
    return { placed: !!result.success, reason: result.error };
  } catch (err: unknown) {
    log.warn('[SmsAbusePrevention] welfare-call placement failed:', err?.message);
    return { placed: false, reason: err?.message };
  }
}
