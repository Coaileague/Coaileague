/**
 * ENTITY PIN SERVICE — Phase 23
 * ==============================
 * Unified PIN management for the three entity types tied to the universal
 * identity codes:
 *
 *   owner    → workspaces.owner_pin_hash    (ORG-XXX-NN)
 *   employee → employees.clockin_pin_hash   (EMP-XXX-NNNNN)
 *   client   → clients.client_pin_hash      (CLT-XXX-NNNNN)
 *
 * The PIN is the secondary factor that prevents a caller who learned another
 * tenant's universal code (or another employee's employee_number) from
 * impersonating them to Trinity or a human support agent.
 *
 * Authorized PIN-set paths:
 *   - During onboarding (the entity sets their own PIN the first time)
 *   - Self-service reset from the entity's dashboard
 *   - Tenant manager reset on behalf of an employee / client (audited)
 *   - Platform support reset with break-glass + audit (handled separately
 *     by identityOverrideService + adminRoutes.ts /identity/reset-pin)
 */

import { pool } from '../db';
import {
  hashPin,
  verifyPin,
  validatePinFormat,
  normalizePin,
} from '../lib/pinService';
import { createLogger } from '../lib/logger';
import { logActionAudit } from './ai-brain/actionAuditLogger';

const log = createLogger('entityPinService');

export type PinEntity = 'owner' | 'employee' | 'client';

interface EntityColumnSpec {
  table: string;
  pinColumn: string;
  idColumn: 'id';
  workspaceFk: 'id' | 'workspace_id';
}

const SPEC: Record<PinEntity, EntityColumnSpec> = {
  owner:    { table: 'workspaces', pinColumn: 'owner_pin_hash',   idColumn: 'id', workspaceFk: 'id' },
  employee: { table: 'employees',  pinColumn: 'clockin_pin_hash', idColumn: 'id', workspaceFk: 'workspace_id' },
  client:   { table: 'clients',    pinColumn: 'client_pin_hash',  idColumn: 'id', workspaceFk: 'workspace_id' },
};

export interface PinSetParams {
  entity: PinEntity;
  entityId: string;
  pin: string;
  /** The workspace the caller is acting in. Enforces tenant isolation. */
  workspaceId: string;
  /** User performing the set (actor). Used for audit trail. */
  actorUserId: string;
  actorPlatformRole?: string | null;
}

export interface PinStatusParams {
  entity: PinEntity;
  entityId: string;
  workspaceId: string;
}

export interface PinVerifyParams {
  entity: PinEntity;
  entityId: string;
  workspaceId: string;
  pin: string;
}

export interface PinClearParams {
  entity: PinEntity;
  entityId: string;
  workspaceId: string;
  actorUserId: string;
  actorPlatformRole?: string | null;
}

/** Set (or overwrite) the PIN on the given entity. Tenant-scoped. */
export async function setEntityPin(params: PinSetParams): Promise<void> {
  const { entity, entityId, pin, workspaceId, actorUserId, actorPlatformRole } = params;
  const spec = SPEC[entity];
  if (!spec) throw new Error(`UNSUPPORTED_ENTITY: ${entity}`);

  const validationError = validatePinFormat(pin);
  if (validationError) throw new Error(`INVALID_PIN: ${validationError}`);

  const hash = await hashPin(pin);
  const start = Date.now();

  // Tenant isolation — the WHERE clause MUST include workspaceId so nobody
  // can rewrite a PIN in a workspace they don't belong to (TRINITY.md §G).
  const result = await pool.query(
    `UPDATE ${spec.table}
        SET ${spec.pinColumn} = $1
      WHERE ${spec.idColumn} = $2
        AND ${spec.workspaceFk} = $3`,
    [hash, entityId, workspaceId],
  );

  if (result.rowCount === 0) {
    throw new Error(`PIN_TARGET_NOT_FOUND: ${entity} ${entityId} not in workspace ${workspaceId}`);
  }

  await logActionAudit({
    actionId: `identity.pin.set.${entity}`,
    workspaceId,
    userId: actorUserId,
    platformRole: actorPlatformRole ?? null,
    entityType: entity,
    entityId,
    success: true,
    // Hash and raw PIN intentionally NOT logged.
    payload: { action: 'set', entity },
    durationMs: Date.now() - start,
  });
}

/** Clear the PIN on the given entity. Tenant-scoped. */
export async function clearEntityPin(params: PinClearParams): Promise<void> {
  const { entity, entityId, workspaceId, actorUserId, actorPlatformRole } = params;
  const spec = SPEC[entity];
  if (!spec) throw new Error(`UNSUPPORTED_ENTITY: ${entity}`);
  const start = Date.now();

  const result = await pool.query(
    `UPDATE ${spec.table}
        SET ${spec.pinColumn} = NULL
      WHERE ${spec.idColumn} = $1
        AND ${spec.workspaceFk} = $2`,
    [entityId, workspaceId],
  );

  if (result.rowCount === 0) {
    throw new Error(`PIN_TARGET_NOT_FOUND: ${entity} ${entityId} not in workspace ${workspaceId}`);
  }

  await logActionAudit({
    actionId: `identity.pin.clear.${entity}`,
    workspaceId,
    userId: actorUserId,
    platformRole: actorPlatformRole ?? null,
    entityType: entity,
    entityId,
    success: true,
    payload: { action: 'clear', entity },
    durationMs: Date.now() - start,
  });
}

/** Does this entity have a PIN configured? Tenant-scoped. */
export async function getEntityPinStatus(params: PinStatusParams): Promise<{
  hasPin: boolean;
  entity: PinEntity;
  entityId: string;
}> {
  const { entity, entityId, workspaceId } = params;
  const spec = SPEC[entity];
  if (!spec) throw new Error(`UNSUPPORTED_ENTITY: ${entity}`);

  const { rows } = await pool.query(
    `SELECT ${spec.pinColumn} AS pin_hash
       FROM ${spec.table}
      WHERE ${spec.idColumn} = $1
        AND ${spec.workspaceFk} = $2
      LIMIT 1`,
    [entityId, workspaceId],
  );

  if (!rows.length) {
    throw new Error(`PIN_TARGET_NOT_FOUND: ${entity} ${entityId} not in workspace ${workspaceId}`);
  }
  return { hasPin: !!rows[0].pin_hash, entity, entityId };
}

/** Verify a PIN for the given entity. Tenant-scoped. Never throws. */
export async function verifyEntityPin(params: PinVerifyParams): Promise<{
  valid: boolean;
  reason: 'ok' | 'not_found' | 'no_pin' | 'wrong_pin' | 'invalid_format';
}> {
  const { entity, entityId, workspaceId, pin } = params;
  const spec = SPEC[entity];
  if (!spec) return { valid: false, reason: 'not_found' };

  const clean = normalizePin(pin);
  if (!clean) return { valid: false, reason: 'invalid_format' };

  try {
    const { rows } = await pool.query(
      `SELECT ${spec.pinColumn} AS pin_hash
         FROM ${spec.table}
        WHERE ${spec.idColumn} = $1
          AND ${spec.workspaceFk} = $2
        LIMIT 1`,
      [entityId, workspaceId],
    );
    if (!rows.length) return { valid: false, reason: 'not_found' };
    const hash = rows[0].pin_hash;
    if (!hash) return { valid: false, reason: 'no_pin' };
    const ok = await verifyPin(clean, hash);
    return { valid: ok, reason: ok ? 'ok' : 'wrong_pin' };
  } catch (err: any) {
    log.warn(`[EntityPinService] Verify failed for ${entity} ${entityId}: ${err?.message}`);
    return { valid: false, reason: 'wrong_pin' };
  }
}

// ─── Identity-code-based verification (used by Trinity / HelpAI) ─────────────
//
// Trinity callers do NOT identify themselves by row UUID — they identify
// themselves by the universal code. These helpers accept the code and PIN
// together and do the right lookup.

export interface IdentityPinVerifyResult {
  valid: boolean;
  reason: 'ok' | 'not_found' | 'no_pin' | 'wrong_pin' | 'invalid_format';
  entity?: PinEntity;
  entityId?: string;
  workspaceId?: string;
  name?: string;
}

export async function verifyIdentityAndPin(params: {
  code: string;
  pin: string;
}): Promise<IdentityPinVerifyResult> {
  const code = params.code?.trim().toUpperCase();
  if (!code || !params.pin) return { valid: false, reason: 'invalid_format' };
  const clean = normalizePin(params.pin);
  if (!clean) return { valid: false, reason: 'invalid_format' };

  // ORG-XXX-NN → owner
  if (/^ORG-[A-Z0-9]+-?/i.test(code)) {
    try {
      const { rows } = await pool.query(
        `SELECT id, owner_pin_hash, coalesce(company_name, name) AS name
           FROM workspaces WHERE upper(org_id) = $1 LIMIT 1`,
        [code],
      );
      if (!rows.length) return { valid: false, reason: 'not_found' };
      if (!rows[0].owner_pin_hash) return { valid: false, reason: 'no_pin' };
      const ok = await verifyPin(clean, rows[0].owner_pin_hash);
      return {
        valid: ok,
        reason: ok ? 'ok' : 'wrong_pin',
        entity: 'owner',
        entityId: rows[0].id,
        workspaceId: rows[0].id,
        name: rows[0].name,
      };
    } catch (err: any) {
      log.warn('[EntityPinService] owner verify failed:', err?.message);
      return { valid: false, reason: 'wrong_pin' };
    }
  }

  // EMP-XXX-NNNNN → employee
  if (/^EMP-[A-Z0-9]+-/i.test(code)) {
    try {
      const { rows } = await pool.query(
        `SELECT id, workspace_id, clockin_pin_hash,
                trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) AS name
           FROM employees WHERE upper(employee_number) = $1 LIMIT 1`,
        [code],
      );
      if (!rows.length) return { valid: false, reason: 'not_found' };
      if (!rows[0].clockin_pin_hash) return { valid: false, reason: 'no_pin' };
      const ok = await verifyPin(clean, rows[0].clockin_pin_hash);
      return {
        valid: ok,
        reason: ok ? 'ok' : 'wrong_pin',
        entity: 'employee',
        entityId: rows[0].id,
        workspaceId: rows[0].workspace_id,
        name: rows[0].name,
      };
    } catch (err: any) {
      log.warn('[EntityPinService] employee verify failed:', err?.message);
      return { valid: false, reason: 'wrong_pin' };
    }
  }

  // CLT-XXX-NNNNN → client
  if (/^CLT-[A-Z0-9]+-/i.test(code)) {
    try {
      const { rows } = await pool.query(
        `SELECT id, workspace_id, client_pin_hash,
                coalesce(company_name, trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) AS name
           FROM clients WHERE upper(client_number) = $1 LIMIT 1`,
        [code],
      );
      if (!rows.length) return { valid: false, reason: 'not_found' };
      if (!rows[0].client_pin_hash) return { valid: false, reason: 'no_pin' };
      const ok = await verifyPin(clean, rows[0].client_pin_hash);
      return {
        valid: ok,
        reason: ok ? 'ok' : 'wrong_pin',
        entity: 'client',
        entityId: rows[0].id,
        workspaceId: rows[0].workspace_id,
        name: rows[0].name,
      };
    } catch (err: any) {
      log.warn('[EntityPinService] client verify failed:', err?.message);
      return { valid: false, reason: 'wrong_pin' };
    }
  }

  return { valid: false, reason: 'not_found' };
}
