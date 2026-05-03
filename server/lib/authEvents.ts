/**
 * authEvents — Authentication event bus + session lifecycle helpers
 * ──────────────────────────────────────────────────────────────────
 * Two responsibilities:
 *   1. authEvents EventEmitter — fires login/logout events consumed by auth.ts
 *   2. revokeClientPortalSessions() — called by the RBAC guillotine on TERMINATED clients
 */

import { EventEmitter } from 'events';
import { createLogger } from './logger';

const log = createLogger('authEvents');

// ── Auth event bus (pre-existing — do not remove) ──────────────────────────
export const authEvents = new EventEmitter();

// ── Session revocation for client lifecycle transitions ────────────────────

/**
 * Revoke all active portal sessions for a given client contact.
 * Called by requireActiveClientAgreement when a client is TERMINATED.
 * Non-fatal: if the sessions table lacks a client_id column, silently succeeds.
 */
export async function revokeClientPortalSessions(clientId: string): Promise<void> {
  if (!clientId) return;

  try {
    const { db } = await import('../db');
    await (db as unknown as {
      execute: (q: { sql: string; params: unknown[] }) => Promise<unknown>;
    }).execute({
      sql: `UPDATE sessions
            SET revoked_at = NOW(), revoke_reason = 'client_terminated'
            WHERE client_id = $1 AND revoked_at IS NULL`,
      params: [clientId],
    });
    log.info('[authEvents] Revoked portal sessions for terminated client', { clientId });
  } catch {
    // Sessions table may not have client_id column in all environments — non-fatal
    log.warn('[authEvents] revokeClientPortalSessions: non-fatal (sessions table schema mismatch)', { clientId });
  }
}
