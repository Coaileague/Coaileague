/**
 * AUTONOMY AUDIT PHASE 1: Idempotency & Rate Versioning Helpers
 * 
 * Critical production safeguards for AutoForce™ autonomous operations:
 * 1. Idempotency - Prevent duplicate invoice/payroll/timesheet processing
 * 2. Rate Versioning - Historical rate accuracy for reproducible invoicing/payroll
 */

import { db } from '../../db';
import { 
  idempotencyKeys, 
  employeeRateHistory, 
  workspaceRateHistory, 
  clientRateHistory,
  employees,
  workspaces,
  clients
} from '../../../shared/schema';
import { eq, and, isNull, lte, or, gte, sql } from 'drizzle-orm';
import crypto from 'crypto';

// ============================================================================
// IDEMPOTENCY HELPERS
// ============================================================================

export type OperationType = 'invoice_generation' | 'payroll_run' | 'timesheet_ingest' | 'schedule_generation' | 'payment_processing';
export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

interface IdempotencyParams {
  workspaceId: string;
  operationType: OperationType;
  requestData: Record<string, any>; // Hash these params for fingerprint
  ttlDays?: number; // Default: 7 days
}

interface IdempotencyResult {
  isNew: boolean; // True if this is first time seeing this operation
  existingResultId?: string; // If duplicate, return existing result
  idempotencyKeyId: string; // ID of idempotency record
  status?: IdempotencyStatus;
}

/**
 * Generate fingerprint hash from request parameters
 * Ensures identical requests produce identical hashes
 */
function generateFingerprint(params: Record<string, any>): string {
  // Sort keys to ensure consistent ordering
  const sorted = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key];
    return acc;
  }, {} as Record<string, any>);
  
  const canonical = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * PRODUCTION-READY IDEMPOTENCY GUARD
 * 
 * Single-transaction Postgres-first implementation with:
 * - Atomic INSERT ... ON CONFLICT DO UPDATE
 * - Database-side timestamp comparison (statement_timestamp())
 * - Status versioning for deterministic duplicate detection
 * - Inflight token to distinguish resurrected vs active duplicates
 * - Retry middleware with exponential backoff
 */
async function executeIdempotencyCheck(params: IdempotencyParams): Promise<IdempotencyResult> {
  const { workspaceId, operationType, requestData, ttlDays = 7 } = params;
  
  const fingerprint = generateFingerprint(requestData);
  const inflightToken = crypto.randomBytes(16).toString('hex');

  const result = await db.execute(sql`
    WITH upsert AS (
      INSERT INTO idempotency_keys (
        workspace_id,
        operation_type,
        request_fingerprint,
        status,
        expires_at,
        status_version,
        inflight_token
      )
      VALUES (
        ${workspaceId},
        ${operationType},
        ${fingerprint},
        'processing',
        statement_timestamp() + make_interval(days => ${ttlDays}),
        1,
        ${inflightToken}
      )
      ON CONFLICT (workspace_id, operation_type, request_fingerprint)
      DO UPDATE SET
        status = CASE
          WHEN idempotency_keys.expires_at <= statement_timestamp() 
          THEN 'processing'
          ELSE idempotency_keys.status
        END,
        expires_at = CASE
          WHEN idempotency_keys.expires_at <= statement_timestamp()
          THEN statement_timestamp() + make_interval(days => ${ttlDays})
          ELSE idempotency_keys.expires_at
        END,
        status_version = CASE
          WHEN idempotency_keys.expires_at <= statement_timestamp()
          THEN idempotency_keys.status_version + 1
          ELSE idempotency_keys.status_version
        END,
        inflight_token = CASE
          WHEN idempotency_keys.expires_at <= statement_timestamp()
          THEN ${inflightToken}
          ELSE idempotency_keys.inflight_token
        END,
        completed_at = CASE
          WHEN idempotency_keys.expires_at <= statement_timestamp()
          THEN NULL
          ELSE idempotency_keys.completed_at
        END,
        result_id = CASE
          WHEN idempotency_keys.expires_at <= statement_timestamp()
          THEN NULL
          ELSE idempotency_keys.result_id
        END,
        error_message = CASE
          WHEN idempotency_keys.expires_at <= statement_timestamp()
          THEN NULL
          ELSE idempotency_keys.error_message
        END
      RETURNING
        id,
        workspace_id,
        operation_type,
        status,
        result_id,
        error_message,
        completed_at,
        status_version,
        inflight_token,
        (xmax = 0) AS is_fresh_insert,
        (xmax != 0 AND inflight_token = ${inflightToken}) AS is_resurrected
    )
    SELECT * FROM upsert
  `);

  if (!result.rows || result.rows.length === 0) {
    throw new Error('[IDEMPOTENCY] No rows returned from atomic upsert');
  }

  const row = result.rows[0] as any;
  const isNew = row.is_fresh_insert || row.is_resurrected;

  if (isNew) {
    const logPrefix = row.is_fresh_insert ? 'New' : 'Resurrected expired';
    console.log(`[IDEMPOTENCY] ${logPrefix} ${operationType} (v${row.status_version}) for workspace ${workspaceId}`);
    console.log(`[IDEMPOTENCY] Key: ${row.id}, Token: ${row.inflight_token}`);
    
    return {
      isNew: true,
      idempotencyKeyId: row.id,
    };
  }

  console.log(`[IDEMPOTENCY] Duplicate ${operationType} detected (v${row.status_version}) for workspace ${workspaceId}`);
  console.log(`[IDEMPOTENCY] Status: ${row.status}, ResultId: ${row.result_id}`);
  
  return {
    isNew: false,
    existingResultId: row.result_id || undefined,
    idempotencyKeyId: row.id,
    status: row.status as IdempotencyStatus,
  };
}

/**
 * Retry wrapper with exponential backoff for serialization/lock errors
 */
export async function checkIdempotency(params: IdempotencyParams): Promise<IdempotencyResult> {
  const maxAttempts = 5;
  const baseDelayMs = 100;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await executeIdempotencyCheck(params);
    } catch (error: any) {
      const isRetryable = 
        error.code === '40001' || // serialization_failure
        error.code === '40P01' || // deadlock_detected
        error.code === '55P03';   // lock_not_available

      if (!isRetryable || attempt === maxAttempts) {
        console.error(`[IDEMPOTENCY] Fatal error on attempt ${attempt}/${maxAttempts}: ${error.message}`);
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[IDEMPOTENCY] Retryable error on attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('[IDEMPOTENCY] Unreachable - retry loop exhausted');
}

/**
 * Mark idempotency operation as completed
 */
export async function completeIdempotencyKey(
  idempotencyKeyId: string,
  resultId: string,
  resultMetadata?: Record<string, any>
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({
      status: 'completed',
      resultId,
      resultMetadata,
      completedAt: new Date(),
    })
    .where(eq(idempotencyKeys.id, idempotencyKeyId));

  console.log(`[IDEMPOTENCY] Operation completed: ${idempotencyKeyId} → ${resultId}`);
}

/**
 * Mark idempotency operation as failed
 */
export async function failIdempotencyKey(
  idempotencyKeyId: string,
  errorMessage: string,
  errorStack?: string
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({
      status: 'failed',
      errorMessage,
      errorStack: errorStack?.substring(0, 2000), // Truncate long stacks
      completedAt: new Date(),
    })
    .where(eq(idempotencyKeys.id, idempotencyKeyId));

  console.log(`[IDEMPOTENCY] Operation failed: ${idempotencyKeyId}`);
  console.error(`[IDEMPOTENCY] Error: ${errorMessage}`);
}

/**
 * Cleanup expired idempotency keys (run daily via cron)
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const result = await db
    .delete(idempotencyKeys)
    .where(lte(idempotencyKeys.expiresAt, new Date()))
    .returning();

  console.log(`[IDEMPOTENCY] Cleaned up ${result.length} expired keys`);
  return result.length;
}

// ============================================================================
// RATE VERSIONING HELPERS
// ============================================================================

interface RateVersionParams {
  workspaceId: string;
  employeeId?: string;
  clientId?: string;
  effectiveDate: Date; // Date to query rate for
}

interface EmployeeRateResult {
  hourlyRate: string; // Decimal as string
  validFrom: Date;
  validTo: Date | null;
  source: 'employee_history' | 'employee_current' | 'workspace_default';
}

interface WorkspaceRateResult {
  defaultBillableRate: string | null;
  defaultHourlyRate: string | null;
  validFrom: Date;
  validTo: Date | null;
}

interface ClientRateResult {
  billableRate: string;
  roleRateOverrides: Record<string, number> | null;
  validFrom: Date;
  validTo: Date | null;
}

/**
 * Get employee payroll rate effective on a specific date
 * 
 * Resolution order:
 * 1. Check employeeRateHistory for effective rate
 * 2. Fall back to current employee.hourlyRate
 * 3. Fall back to workspace defaultHourlyRate
 */
export async function getEmployeeRateAtDate(params: RateVersionParams): Promise<EmployeeRateResult | null> {
  const { workspaceId, employeeId, effectiveDate } = params;
  
  if (!employeeId) {
    throw new Error('employeeId required for getEmployeeRateAtDate');
  }

  // 1. Check rate history first
  const [historicalRate] = await db
    .select()
    .from(employeeRateHistory)
    .where(
      and(
        eq(employeeRateHistory.workspaceId, workspaceId),
        eq(employeeRateHistory.employeeId, employeeId),
        lte(employeeRateHistory.validFrom, effectiveDate),
        or(
          isNull(employeeRateHistory.validTo),
          gte(employeeRateHistory.validTo, effectiveDate)
        )
      )
    )
    .orderBy(employeeRateHistory.validFrom)
    .limit(1);

  if (historicalRate) {
    return {
      hourlyRate: historicalRate.hourlyRate,
      validFrom: historicalRate.validFrom,
      validTo: historicalRate.validTo,
      source: 'employee_history',
    };
  }

  // 2. Fall back to current employee rate
  const [employee] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.id, employeeId),
        eq(employees.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (employee?.hourlyRate) {
    return {
      hourlyRate: employee.hourlyRate,
      validFrom: employee.createdAt || new Date(),
      validTo: null,
      source: 'employee_current',
    };
  }

  // 3. Fall back to workspace default
  const workspaceRate = await getWorkspaceRateAtDate({ workspaceId, effectiveDate });
  if (workspaceRate?.defaultHourlyRate) {
    return {
      hourlyRate: workspaceRate.defaultHourlyRate,
      validFrom: workspaceRate.validFrom,
      validTo: workspaceRate.validTo,
      source: 'workspace_default',
    };
  }

  return null;
}

/**
 * Get workspace default rates effective on a specific date
 */
export async function getWorkspaceRateAtDate(params: RateVersionParams): Promise<WorkspaceRateResult | null> {
  const { workspaceId, effectiveDate } = params;

  // Check history first
  const [historicalRate] = await db
    .select()
    .from(workspaceRateHistory)
    .where(
      and(
        eq(workspaceRateHistory.workspaceId, workspaceId),
        lte(workspaceRateHistory.validFrom, effectiveDate),
        or(
          isNull(workspaceRateHistory.validTo),
          gte(workspaceRateHistory.validTo, effectiveDate)
        )
      )
    )
    .orderBy(workspaceRateHistory.validFrom)
    .limit(1);

  if (historicalRate) {
    return {
      defaultBillableRate: historicalRate.defaultBillableRate,
      defaultHourlyRate: historicalRate.defaultHourlyRate,
      validFrom: historicalRate.validFrom,
      validTo: historicalRate.validTo,
    };
  }

  // Fall back to current workspace rates
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (workspace) {
    return {
      defaultBillableRate: workspace.defaultBillableRate,
      defaultHourlyRate: workspace.defaultHourlyRate,
      validFrom: workspace.createdAt || new Date(),
      validTo: null,
    };
  }

  return null;
}

/**
 * Get client billing rate effective on a specific date
 */
export async function getClientRateAtDate(params: RateVersionParams): Promise<ClientRateResult | null> {
  const { workspaceId, clientId, effectiveDate } = params;
  
  if (!clientId) {
    throw new Error('clientId required for getClientRateAtDate');
  }

  // Check history
  const [historicalRate] = await db
    .select()
    .from(clientRateHistory)
    .where(
      and(
        eq(clientRateHistory.workspaceId, workspaceId),
        eq(clientRateHistory.clientId, clientId),
        lte(clientRateHistory.validFrom, effectiveDate),
        or(
          isNull(clientRateHistory.validTo),
          gte(clientRateHistory.validTo, effectiveDate)
        )
      )
    )
    .orderBy(clientRateHistory.validFrom)
    .limit(1);

  if (historicalRate) {
    return {
      billableRate: historicalRate.billableRate,
      roleRateOverrides: historicalRate.roleRateOverrides as Record<string, number> | null,
      validFrom: historicalRate.validFrom,
      validTo: historicalRate.validTo,
    };
  }

  return null; // No client-specific rate configured
}

/**
 * Create new rate version (when admin changes a rate)
 * 
 * This supersedes the previous rate by setting its validTo date
 */
export async function createEmployeeRateVersion(params: {
  workspaceId: string;
  employeeId: string;
  newRate: string;
  changedBy: string;
  changeReason: string;
  effectiveFrom?: Date;
}): Promise<string> {
  const { workspaceId, employeeId, newRate, changedBy, changeReason, effectiveFrom = new Date() } = params;

  // Close out previous active rate (validTo = NULL → validTo = now)
  await db
    .update(employeeRateHistory)
    .set({
      validTo: effectiveFrom,
    })
    .where(
      and(
        eq(employeeRateHistory.workspaceId, workspaceId),
        eq(employeeRateHistory.employeeId, employeeId),
        isNull(employeeRateHistory.validTo)
      )
    );

  // Create new rate version
  const [newVersion] = await db
    .insert(employeeRateHistory)
    .values({
      workspaceId,
      employeeId,
      hourlyRate: newRate,
      validFrom: effectiveFrom,
      validTo: null, // Active rate
      changedBy,
      changeReason,
    })
    .returning();

  console.log(`[RATE VERSION] Employee ${employeeId} rate changed: $${newRate}/hr (effective ${effectiveFrom.toISOString()})`);
  console.log(`[RATE VERSION] Changed by: ${changedBy}, reason: ${changeReason}`);

  return newVersion.id;
}

/**
 * Create workspace rate version
 */
export async function createWorkspaceRateVersion(params: {
  workspaceId: string;
  defaultBillableRate?: string;
  defaultHourlyRate?: string;
  changedBy: string;
  changeReason: string;
  effectiveFrom?: Date;
}): Promise<string> {
  const { workspaceId, defaultBillableRate, defaultHourlyRate, changedBy, changeReason, effectiveFrom = new Date() } = params;

  // Close out previous active rate
  await db
    .update(workspaceRateHistory)
    .set({
      validTo: effectiveFrom,
    })
    .where(
      and(
        eq(workspaceRateHistory.workspaceId, workspaceId),
        isNull(workspaceRateHistory.validTo)
      )
    );

  // Create new rate version
  const [newVersion] = await db
    .insert(workspaceRateHistory)
    .values({
      workspaceId,
      defaultBillableRate,
      defaultHourlyRate,
      validFrom: effectiveFrom,
      validTo: null,
      changedBy,
      changeReason,
    })
    .returning();

  console.log(`[RATE VERSION] Workspace ${workspaceId} rates changed (effective ${effectiveFrom.toISOString()})`);
  console.log(`[RATE VERSION] Billable: $${defaultBillableRate}/hr, Payroll: $${defaultHourlyRate}/hr`);

  return newVersion.id;
}
