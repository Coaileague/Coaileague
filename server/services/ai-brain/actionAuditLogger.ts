/**
 * Action Audit Logger — Phase 17
 * ===============================
 * Canonical entry point for logging Trinity / AI-Brain action executions
 * to `audit_logs` (aka `systemAuditLogs`).
 *
 * The Phase 17A audit found zero `db.insert(systemAuditLogs)` writes in
 * `actionRegistry.ts` across 88 registered actions. This helper closes
 * that gap: every mutation handler must call `logActionAudit(...)` on
 * both success and failure.
 *
 * Sensitive-key redaction mirrors `trinityOrchestrationGateway.ts:245`
 * so we can't log passwords/tokens/ssn/etc. by accident.
 */

import { db } from '../../db';
import { auditLogs } from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('actionAuditLogger');

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'key', 'auth', 'credit_card', 'ssn'];

function sanitize<T extends Record<string, any> | undefined | null>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = Array.isArray(value) ? [...value] : { ...value };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk))) {
      out[k] = '[REDACTED]';
    } else if (out[k] && typeof out[k] === 'object') {
      out[k] = sanitize(out[k]);
    }
  }
  return out as T;
}

export interface ActionAuditInput {
  actionId: string;
  workspaceId: string | null | undefined;
  userId?: string | null;
  userRole?: string | null;
  platformRole?: string | null;
  entityType?: string;
  entityId?: string | null;
  success: boolean;
  message?: string;
  payload?: Record<string, any> | null;
  changesBefore?: Record<string, any> | null;
  changesAfter?: Record<string, any> | null;
  errorMessage?: string | null;
  durationMs?: number;
}

/**
 * Persist an action execution to the canonical audit log.
 * Non-fatal: failure to log must not break the action.
 */
export async function logActionAudit(input: ActionAuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      userRole: input.userRole ?? null,
      platformRole: input.platformRole ?? null,
      action: `action:${input.actionId}`,
      rawAction: input.actionId,
      entityType: input.entityType ?? input.actionId.split('.')[0] ?? 'action',
      entityId: input.entityId ?? null,
      success: input.success,
      errorMessage: input.errorMessage ?? null,
      payload: sanitize(input.payload ?? null) as any,
      changesBefore: sanitize(input.changesBefore ?? null) as any,
      changesAfter: sanitize(input.changesAfter ?? null) as any,
      metadata: {
        source: 'ai-brain',
        durationMs: input.durationMs ?? null,
        message: input.message ?? null,
      },
      source: 'system',
      actorType: 'trinity',
    });
  } catch (err) {
    log.warn('[actionAuditLogger] Non-fatal: audit write failed', {
      actionId: input.actionId,
      error: (err as any)?.message,
    });
  }
}
