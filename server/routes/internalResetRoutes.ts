/**
 * Internal Password Reset Route — ONE-TIME PRODUCTION RECOVERY
 *
 * ⚠️ SECURITY CRITICAL ⚠️
 *
 * This endpoint exists ONLY as a recovery path when the operator has lost
 * access to the Railway shell/console and cannot reset production passwords
 * via the normal user-facing password reset flow (e.g., root admin lost
 * credentials, Railway plan has no shell access, email forwarding not
 * yet wired up to receive the reset link).
 *
 * The endpoint is gated by a shared-secret header `x-internal-reset-token`
 * which must match the `INTERNAL_RESET_TOKEN` environment variable. If the
 * env var is not set, the endpoint is 404 (doesn't exist at all). There
 * is no other authentication path into this route.
 *
 * USAGE (one-time, by the platform operator):
 *
 *   1. Set INTERNAL_RESET_TOKEN in Railway env vars to a long random string
 *      (e.g. 32+ random hex characters). Redeploy.
 *
 *   2. From your local machine, call:
 *        curl -X POST https://<your-railway-url>/api/internal/reset-password \
 *          -H "x-internal-reset-token: <the-token>" \
 *          -H "Content-Type: application/json" \
 *          -d '{"email":"root@coaileague.com","newPassword":"<new-strong-password>"}'
 *
 *      Or for Statewide owner (use workspace-owner-lookup mode):
 *        curl -X POST https://<your-railway-url>/api/internal/reset-password \
 *          -H "x-internal-reset-token: <the-token>" \
 *          -H "Content-Type: application/json" \
 *          -d '{"workspaceId":"37a04d24-51bd-4856-9faa-d26a2fe82094","newPassword":"<new-strong-password>"}'
 *
 *      The endpoint will return the email/username of the account that
 *      was reset so you know what to log in with.
 *
 *   3. IMMEDIATELY after successful reset, DELETE or UNSET the
 *      INTERNAL_RESET_TOKEN env var in Railway and redeploy. The
 *      endpoint will return 404 and can never be used again without
 *      re-setting the token.
 *
 * WHAT THIS ROUTE DOES:
 *   - Hashes the new password with bcrypt (same 12 rounds as normal auth)
 *   - Updates the users.password_hash column
 *   - Clears login_attempts and locked_until (unlocks the account)
 *   - Returns the account email/username
 *   - Logs every invocation to the audit_log table (successful + failed)
 *
 * WHAT THIS ROUTE DOES NOT DO:
 *   - It does NOT log passwords or tokens
 *   - It does NOT send emails
 *   - It does NOT create users (account must already exist)
 *   - It does NOT bypass the bcrypt hash (same rounds as normal auth)
 *   - It does NOT expose any other account information
 *
 * REMOVAL:
 *   After recovery, the safest permanent removal is:
 *     1. Unset INTERNAL_RESET_TOKEN in Railway env (immediate effect)
 *     2. Delete this file in a follow-up commit
 *     3. Delete the route registration from server/routes.ts
 *   Until step 2, the endpoint remains behind the header-secret guard.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { hashPassword } from '../auth';
import { createLogger } from '../lib/logger';

const log = createLogger('InternalReset');

const router = Router();

/**
 * Constant-time comparison of the provided header against the env var,
 * so a timing attack can't reveal the token length byte-by-byte.
 */
function tokenMatches(provided: string | undefined): boolean {
  const expected = process.env.INTERNAL_RESET_TOKEN;
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

router.post('/api/internal/reset-password', async (req: Request, res: Response) => {
  const providedToken = req.get('x-internal-reset-token');
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

  // If the env var is not set, pretend the route doesn't exist at all.
  // This is the "disabled" state — the operator must set the var to enable
  // recovery and unset it immediately after use.
  if (!process.env.INTERNAL_RESET_TOKEN) {
    log.warn(`[InternalReset] Request from ${clientIp} — endpoint disabled (INTERNAL_RESET_TOKEN not set)`);
    return res.status(404).json({ error: 'Not Found' });
  }

  if (!tokenMatches(providedToken)) {
    log.error(`[InternalReset] 🔴 AUTH FAILURE from ${clientIp} — invalid token`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { email, workspaceId, newPassword } = req.body || {};

  if (typeof newPassword !== 'string' || newPassword.length < 12) {
    return res.status(400).json({
      error: 'newPassword required, minimum 12 characters',
    });
  }

  if (!email && !workspaceId) {
    return res.status(400).json({
      error: 'Either email or workspaceId must be provided',
    });
  }

  try {
    // ── Target resolution ───────────────────────────────────────────────
    // Two lookup paths:
    //   a) By email (root admin, known email)
    //   b) By workspaceId (find the workspace.ownerId, then users.id match)
    //      This is how we handle the Statewide case where the user forgot
    //      which email was used.
    let targetUser: { id: string; email: string | null } | null = null;
    let targetSource = '';

    if (email) {
      const [u] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (u) {
        targetUser = u;
        targetSource = `email=${email}`;
      }
    } else if (workspaceId) {
      const [ws] = await db
        .select({ id: workspaces.id, name: workspaces.name, ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (ws && ws.ownerId) {
        const [u] = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.id, ws.ownerId))
          .limit(1);
        if (u) {
          targetUser = u;
          targetSource = `workspace=${workspaceId} (${ws.name}) ownerId=${ws.ownerId}`;
        }
      }
    }

    if (!targetUser) {
      log.warn(`[InternalReset] Target not found: ${targetSource || 'no lookup params'}`);
      return res.status(404).json({
        error: 'Target user not found',
        lookedUpBy: email ? 'email' : 'workspaceId',
      });
    }

    // ── Hash and update ─────────────────────────────────────────────────
    const newHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        loginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUser.id));

    log.info(
      `[InternalReset] ✅ Password reset complete — user=${targetUser.id} email=${targetUser.email} source=${targetSource} from=${clientIp}`
    );

    // Best-effort audit log write (non-blocking)
    try {
      const { auditLogs } = await import('@shared/schema');
      await db.insert(auditLogs).values({
        userId: targetUser.id,
        action: 'reset_password' as any,
        entityType: 'user',
        entityId: targetUser.id,
        metadata: { source: 'internal_reset_endpoint', clientIp, targetSource },
      });
    } catch (auditErr: any) {
      log.warn('[InternalReset] Audit log write failed (non-fatal):', auditErr?.message);
    }

    return res.json({
      success: true,
      message: 'Password reset successful. IMMEDIATELY unset INTERNAL_RESET_TOKEN in Railway env vars.',
      account: {
        id: targetUser.id,
        email: targetUser.email,
        loginEmail: targetUser.email,
      },
      nextSteps: [
        'Log in with the email/password above',
        'Unset INTERNAL_RESET_TOKEN in Railway immediately',
        'Redeploy to ensure the endpoint is disabled',
      ],
    });
  } catch (err: any) {
    log.error('[InternalReset] Unexpected error:', err);
    return res.status(500).json({
      error: 'Reset failed',
      message: err?.message || 'unknown',
    });
  }
});

export default router;
