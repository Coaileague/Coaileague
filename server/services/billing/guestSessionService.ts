/**
 * Guest Session Billing Service
 *
 * Tracks and enforces token budgets for unauthenticated (guest) sessions
 * across voice, SMS, and email channels.
 *
 * Billing model:
 *   - Guest session on TENANT number → billed to that tenant's workspace
 *   - Guest session on PLATFORM number → absorbed (PLATFORM_WORKSPACE_ID)
 *   - All sessions capped to prevent runaway cost
 *
 * Guest types and caps:
 *   complaint                 → 2,000 tokens
 *   general_inquiry           → 1,500 tokens
 *   employment_verification   →   500 tokens
 *   job_seeker                → 1,500 tokens
 *   platform_support          → 1,000 tokens (absorbed)
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';

const log = createLogger('GuestSessionService');

export type GuestSessionType =
  | 'complaint'
  | 'general_inquiry'
  | 'employment_verification'
  | 'job_seeker'
  | 'platform_support';

export type GuestChannel = 'voice' | 'sms' | 'email';

const TOKEN_CAPS: Record<GuestSessionType, number> = {
  complaint: 2000,
  general_inquiry: 1500,
  employment_verification: 500,
  job_seeker: 1500,
  platform_support: 1000,
};

// Token cost in micro-cents per 1K tokens (platform margin included)
const TOKEN_COST_MICROCENTS_PER_1K = 5000; // $0.005 per 1K tokens

/**
 * Idempotent table bootstrap. Callable at startup.
 */
export async function bootstrapGuestSessionTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guest_session_log (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    VARCHAR NOT NULL,
        session_id      VARCHAR NOT NULL UNIQUE,
        guest_type      VARCHAR NOT NULL,
        channel         VARCHAR NOT NULL,
        tokens_used     INTEGER NOT NULL DEFAULT 0,
        token_cap       INTEGER NOT NULL,
        cost_microcents BIGINT  NOT NULL DEFAULT 0,
        capped_out      BOOLEAN NOT NULL DEFAULT FALSE,
        resolved        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_guest_session_workspace
        ON guest_session_log (workspace_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_guest_session_sid
        ON guest_session_log (session_id)
    `);
  } catch (err: unknown) {
    log.warn('[GuestSession] Table bootstrap failed (non-fatal):', err?.message);
  }
}

export async function recordGuestSessionUsage(params: {
  workspaceId: string;
  sessionId: string;
  guestType: GuestSessionType;
  channel: GuestChannel;
  tokensUsed: number;
}): Promise<{ cappedOut: boolean; tokensRemaining: number }> {
  const { workspaceId, sessionId, guestType, channel, tokensUsed } = params;
  const cap = TOKEN_CAPS[guestType];
  const costMicrocents = Math.round((tokensUsed / 1000) * TOKEN_COST_MICROCENTS_PER_1K);

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO guest_session_log
        (workspace_id, session_id, guest_type, channel, tokens_used, token_cap, cost_microcents)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (session_id) DO UPDATE
        SET tokens_used     = guest_session_log.tokens_used + EXCLUDED.tokens_used,
            cost_microcents = guest_session_log.cost_microcents + EXCLUDED.cost_microcents,
            updated_at      = NOW()
      RETURNING tokens_used, token_cap, capped_out
    `,
      [workspaceId, sessionId, guestType, channel, tokensUsed, cap, costMicrocents],
    );

    const row = rows[0];
    const cappedOut = row.tokens_used >= row.token_cap;

    if (cappedOut && !row.capped_out) {
      await pool.query(
        `UPDATE guest_session_log SET capped_out = TRUE WHERE session_id = $1`,
        [sessionId],
      );
      log.info(
        `[GuestSession] Session ${sessionId} (${guestType}/${channel}) hit token cap ${cap}`,
      );
    }

    return {
      cappedOut,
      tokensRemaining: Math.max(0, cap - row.tokens_used),
    };
  } catch (err: unknown) {
    log.warn('[GuestSession] recordGuestSessionUsage failed (non-fatal):', err?.message);
    return { cappedOut: false, tokensRemaining: cap };
  }
}

export async function isSessionCapped(sessionId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT capped_out, tokens_used, token_cap FROM guest_session_log WHERE session_id = $1 LIMIT 1`,
      [sessionId],
    );
    if (!rows[0]) return false;
    return rows[0].capped_out || rows[0].tokens_used >= rows[0].token_cap;
  } catch {
    return false;
  }
}

export function getTokenCap(guestType: GuestSessionType): number {
  return TOKEN_CAPS[guestType];
}
