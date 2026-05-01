/**
 * Invite Reaper Service — Synapse-Standard Onboarding
 * 
 * THE REAPER RULE: Every 24h sweep all pending/invited tokens.
 * IF status IN ('pending','invited') AND age > 7 days → status = 'expired'
 * 
 * Visual State Machine:
 *   pending  → ORANGE border (invite in-flight, not yet confirmed)
 *   invited  → ORANGE border (email delivered, awaiting action)
 *   accepted → GREEN  border (handshake complete)
 *   expired  → RED    border (> 7 days or manually revoked)
 */
import { db, pool } from '../../db';
import { clientPortalInviteTokens, orgInvitations } from '@shared/schema';
import { sql, lt, inArray, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('InviteReaper');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function runInviteReaper(): Promise<void> {
  const cutoff = new Date(Date.now() - INVITE_TTL_MS);
  let reaped = 0;

  try {
    // Reap client portal invites — flip invite_status to 'expired'
    // Layer 3 Rule: UI reads status from DB — Reaper must have ALREADY flipped it
    const clientResult = await pool.query(`
      UPDATE client_portal_invite_tokens
      SET invite_status = 'expired',
          updated_at = NOW()
      WHERE
        created_at < $1
        AND is_used = false
        AND COALESCE(invite_status, 'invited') NOT IN ('active', 'expired', 'locked')
    `, [cutoff]);
    reaped += (clientResult as Record<string,unknown>).rowCount || 0;
  } catch (err) {
    log.warn('[Reaper] client_portal_invite_tokens sweep failed (non-fatal):', err);
  }

  try {
    // Reap org invitations (orgInvitations — tenant/client onboarding)
    const orgResult = await db.execute(sql`
      UPDATE org_invitations
      SET status = 'expired', updated_at = NOW()
      WHERE
        status IN ('pending', 'invited')
        AND sent_at < ${cutoff}
    `);
    reaped += (orgResult as Record<string,unknown>).rowCount || 0;
  } catch (err) {
    log.warn('[Reaper] org_invitations sweep failed (non-fatal):', err);
  }

  try {
    // Reap employee invitations
    const empResult = await db.execute(sql`
      UPDATE employee_invitations
      SET invite_status = 'expired', updated_at = NOW()
      WHERE
        invite_status IN ('pending', 'invited')
        AND created_at < ${cutoff}
    `);
    reaped += (empResult as Record<string,unknown>).rowCount || 0;
  } catch (err) {
    log.warn('[Reaper] employee_invitations sweep failed (non-fatal):', err);
  }

  // Orphan-user cleanup: occasionally a user row is created during invite
  // acceptance but the post-creation steps (workspace_members insert, email
  // provisioning) fail and leave a user with no membership and no email
  // slug. Vacuum them after 7 days so they don't accumulate forever and
  // don't block re-registration with the same email.
  let orphans = 0;
  try {
    const orphanResult = await pool.query(`
      DELETE FROM users u
       WHERE u.created_at < $1
         AND NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
         AND (u.email_slug IS NULL OR u.email_slug = '')
         AND u.password_hash IS NOT NULL
    `, [cutoff]);
    orphans = (orphanResult as Record<string,unknown>).rowCount || 0;
    if (orphans > 0) {
      log.info(`[Reaper] Vacuumed ${orphans} orphan users (no membership, no email slug, > 7 days old)`);
    }
  } catch (err) {
    log.warn('[Reaper] orphan-user vacuum failed (non-fatal):', err);
  }

  log.info(`[Reaper] Daily sweep complete — ${reaped} invites expired, ${orphans} orphan users vacuumed`);
}

export function registerInviteReaperCron(scheduler: { register: Function }): void {
  scheduler.register('Invite Reaper — 24h sweep', {
    interval: '0 2 * * *', // 2 AM daily
    handler: runInviteReaper,
  });
  log.info('[Reaper] Invite Reaper registered — daily 2 AM sweep active');
}
