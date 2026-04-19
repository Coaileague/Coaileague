/**
 * IDENTITY OVERRIDE SERVICE — Phase 22
 * =====================================
 * Authorized rewrite path for the three universal identity codes
 * (workspaces.org_id, employees.employee_number, clients.client_number).
 *
 * The identity-immutability trigger installed by
 * `identityIntegrityBootstrap.ts` blocks direct UPDATEs to these columns.
 * This service is the ONLY legitimate way to bypass that trigger — it:
 *   1. Validates the caller has a platform-staff role that allows overrides
 *      (sysop / deputy / root / support_manager).
 *   2. Sets the `app.identity_override` session GUC to 'true' inside a
 *      transaction so the trigger lets the UPDATE through.
 *   3. Writes an audit row (actor, entity, old value, new value, reason)
 *      to the canonical audit_logs sink via logActionAudit.
 *   4. Unsets the GUC before commit so no other write in the same
 *      connection can escape the trigger by accident.
 *
 * Typical use case: two workspaces end up with a colliding org_id
 * because a legacy row pre-dated the uniqueness index. Support staff
 * call this with a fresh org_id to heal the collision. The change is
 * irrevocable but fully replayable from audit_logs.
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { logActionAudit } from './ai-brain/actionAuditLogger';

const log = createLogger('identityOverrideService');

export type IdentityEntity = 'workspace' | 'employee' | 'client';

interface EntitySpec {
  table: string;
  column: string;
  auditEntityType: string;
  /** Extra where column used to preserve workspace scoping for audits */
  workspaceIdColumn: 'id' | 'workspace_id';
}

const ENTITY_SPEC: Record<IdentityEntity, EntitySpec> = {
  workspace: {
    table: 'workspaces',
    column: 'org_id',
    auditEntityType: 'workspace',
    workspaceIdColumn: 'id',
  },
  employee: {
    table: 'employees',
    column: 'employee_number',
    auditEntityType: 'employee',
    workspaceIdColumn: 'workspace_id',
  },
  client: {
    table: 'clients',
    column: 'client_number',
    auditEntityType: 'client',
    workspaceIdColumn: 'workspace_id',
  },
};

// Roles allowed to invoke this rewrite. Support agents cannot — only
// support-manager and above can resolve identity conflicts.
const ALLOWED_PLATFORM_ROLES = new Set([
  'sysop',
  'deputy',
  'root',
  'support_manager',
  'platform_admin',
]);

export interface IdentityRewriteParams {
  entity: IdentityEntity;
  entityId: string;
  newCode: string;
  reason: string;
  actorUserId: string;
  actorPlatformRole: string;
}

export interface IdentityRewriteResult {
  success: boolean;
  oldCode: string | null;
  newCode: string;
  workspaceId: string | null;
}

export async function rewriteUniversalId(
  params: IdentityRewriteParams,
): Promise<IdentityRewriteResult> {
  const { entity, entityId, newCode, reason, actorUserId, actorPlatformRole } = params;

  if (!ALLOWED_PLATFORM_ROLES.has(actorPlatformRole)) {
    throw new Error(`IDENTITY_OVERRIDE_FORBIDDEN: role ${actorPlatformRole} cannot rewrite identity codes`);
  }

  if (!newCode || !newCode.trim()) {
    throw new Error('IDENTITY_OVERRIDE_INVALID: newCode must be a non-empty string');
  }

  if (!reason || reason.trim().length < 8) {
    throw new Error('IDENTITY_OVERRIDE_INVALID: reason must be at least 8 characters');
  }

  const spec = ENTITY_SPEC[entity];
  if (!spec) throw new Error(`IDENTITY_OVERRIDE_INVALID: unknown entity type ${entity}`);

  const client = await pool.connect();
  const start = Date.now();
  let oldCode: string | null = null;
  let workspaceId: string | null = null;

  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.identity_override', 'true', true)`);

    // Capture pre-state for audit.
    const pre = await client.query(
      `SELECT ${spec.column} AS code, ${spec.workspaceIdColumn} AS ws
         FROM ${spec.table} WHERE id = $1 LIMIT 1`,
      [entityId],
    );
    if (!pre.rows.length) {
      await client.query('ROLLBACK');
      throw new Error(`IDENTITY_OVERRIDE_NOT_FOUND: ${entity} ${entityId} does not exist`);
    }
    oldCode = pre.rows[0].code ?? null;
    workspaceId = pre.rows[0].ws ?? null;

    if (oldCode === newCode) {
      await client.query('ROLLBACK');
      return { success: true, oldCode, newCode, workspaceId };
    }

    // The immutability trigger honors the transaction-local GUC we set above.
    await client.query(
      `UPDATE ${spec.table} SET ${spec.column} = $1 WHERE id = $2`,
      [newCode, entityId],
    );

    await client.query('COMMIT');
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (_) { /* best effort */ }
    log.error(
      `[identityOverride] Rewrite failed for ${entity} ${entityId}: ${err?.message}`,
    );

    await logActionAudit({
      actionId: 'identity.rewrite',
      workspaceId: workspaceId ?? '',
      userId: actorUserId,
      platformRole: actorPlatformRole,
      entityType: spec.auditEntityType,
      entityId,
      success: false,
      errorMessage: err?.message,
      payload: { entity, oldCode, newCode, reason },
      durationMs: Date.now() - start,
    });

    throw err;
  } finally {
    try {
      await client.query(`SELECT set_config('app.identity_override', '', true)`);
    } catch (_) { /* best effort — transaction already closed */ }
    client.release();
  }

  await logActionAudit({
    actionId: 'identity.rewrite',
    workspaceId: workspaceId ?? '',
    userId: actorUserId,
    platformRole: actorPlatformRole,
    entityType: spec.auditEntityType,
    entityId,
    success: true,
    changesBefore: { [spec.column]: oldCode } as any,
    changesAfter: { [spec.column]: newCode } as any,
    payload: { entity, reason },
    durationMs: Date.now() - start,
  });

  log.info(
    `[identityOverride] ${entity} ${entityId} rewrote ${spec.column} ${oldCode} → ${newCode} (actor=${actorUserId} role=${actorPlatformRole})`,
  );

  return { success: true, oldCode, newCode, workspaceId };
}
