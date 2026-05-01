/**
 * Trinity Workflow Logger — Phase 20
 * ===================================
 * Lightweight execution tracker for the Phase 20 autonomous workflow family
 * (calloff coverage, missed clock-in, shift reminders, invoice lifecycle,
 * compliance monitor, payroll anomaly).
 *
 * Why this exists:
 *   A multi-step workflow (TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE →
 *   CONFIRM → NOTIFY) is not a single action. The canonical audit log
 *   (audit_logs) captures individual action executions, but replaying an
 *   entire workflow requires a single row that ties the steps together.
 *
 *   logWorkflowStart(...) writes a workflow record (kept in audit_logs under
 *   entity_type = 'workflow' so no new table is introduced — per the project
 *   law, no new tables without Bryan's explicit approval), and subsequent
 *   step calls append to that record's metadata trail.
 *
 * Storage:
 *   Workflow rows live in `audit_logs` with:
 *     - action        = 'workflow:<name>'
 *     - rawAction     = '<name>'
 *     - entityType    = 'workflow'
 *     - source        = 'system'
 *     - actorType     = 'trinity'
 *     - metadata.trail = [{ step, ts, ok, detail }, ...]
 *
 *   Optional per-step calls to `logActionAudit` still fire for any
 *   individual action (shift update, SMS send, etc.) that the workflow
 *   invokes through the action registry.
 */

import { db } from '../../../db';
import { auditLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../../lib/logger';

const log = createLogger('trinityWorkflowLogger');

export type WorkflowStep =
  | 'trigger'
  | 'fetch'
  | 'validate'
  | 'process'
  | 'mutate'
  | 'confirm'
  | 'notify'
  | 'escalate'
  | 'complete';

export interface WorkflowTrailEntry {
  step: WorkflowStep;
  ts: string;
  ok: boolean;
  detail?: string;
  data?: Record<string, any> | null;
}

export interface WorkflowStartParams {
  workspaceId: string;
  workflowName: string;
  triggeredBy?: string | null;
  triggerSource?: string; // 'sms_calloff' | 'voice_calloff' | 'cron' | 'chat' | ...
  triggerData?: Record<string, unknown>;
  userId?: string | null;
}

export interface WorkflowRecord {
  id: string | null;
  workflowName: string;
  workspaceId: string;
  startedAt: Date;
}

/**
 * Create the root workflow record. Returns an id that step/complete calls
 * reference. Non-fatal: returns id=null if the DB insert fails, and the
 * workflow keeps running without persistence.
 */
export async function logWorkflowStart(
  params: WorkflowStartParams,
): Promise<WorkflowRecord> {
  const startedAt = new Date();
  const initialTrail: WorkflowTrailEntry[] = [
    {
      step: 'trigger',
      ts: startedAt.toISOString(),
      ok: true,
      detail: params.triggerSource ?? 'unknown',
      data: sanitizeForLog(params.triggerData),
    },
  ];

  try {
    const [row] = await db
      .insert(auditLogs)
      .values({
        workspaceId: params.workspaceId,
        userId: params.userId ?? null,
        action: `workflow:${params.workflowName}`,
        rawAction: params.workflowName,
        entityType: 'workflow',
        entityId: null,
        success: true,
        metadata: {
          source: 'workflow',
          phase: '20',
          triggerSource: params.triggerSource ?? null,
          triggeredBy: params.triggeredBy ?? null,
          trail: initialTrail,
          startedAt: startedAt.toISOString(),
          status: 'running',
        } as any,
        source: 'system',
        actorType: 'trinity',
      } as any)
      .returning({ id: auditLogs.id });

    return {
      id: row?.id ?? null,
      workflowName: params.workflowName,
      workspaceId: params.workspaceId,
      startedAt,
    };
  } catch (err: unknown) {
    log.warn('[workflowLogger] Non-fatal: start insert failed', {
      workflow: params.workflowName,
      error: err?.message,
    });
    return {
      id: null,
      workflowName: params.workflowName,
      workspaceId: params.workspaceId,
      startedAt,
    };
  }
}

/**
 * Append a step to a running workflow's trail.
 * Non-fatal: audit-log failures don't break workflow execution.
 */
export async function logWorkflowStep(
  record: WorkflowRecord | null,
  step: WorkflowStep,
  ok: boolean,
  detail?: string,
  data?: Record<string, any> | null,
): Promise<void> {
  if (!record?.id) return;
  try {
    const [existing] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.id, record.id))
      .limit(1);

    const currentMeta = (existing?.metadata ?? {}) as Record<string, any>;
    const trail: WorkflowTrailEntry[] = Array.isArray(currentMeta.trail)
      ? currentMeta.trail
      : [];
    trail.push({
      step,
      ts: new Date().toISOString(),
      ok,
      detail,
      data: sanitizeForLog(data),
    });

    await db
      .update(auditLogs)
      .set({
        metadata: { ...currentMeta, trail } as any,
      })
      .where(eq(auditLogs.id, record.id));
  } catch (err: unknown) {
    log.warn('[workflowLogger] Non-fatal: step update failed', {
      workflow: record.workflowName,
      step,
      error: err?.message,
    });
  }
}

export interface WorkflowCompleteParams {
  success: boolean;
  summary?: string;
  errorMessage?: string;
  result?: Record<string, any> | null;
  escalated?: boolean;
}

/**
 * Finalise a workflow — records the terminal status, duration, and summary.
 */
export async function logWorkflowComplete(
  record: WorkflowRecord | null,
  params: WorkflowCompleteParams,
): Promise<void> {
  if (!record?.id) return;

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - record.startedAt.getTime();

  try {
    const [existing] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.id, record.id))
      .limit(1);

    const currentMeta = (existing?.metadata ?? {}) as Record<string, any>;
    const trail: WorkflowTrailEntry[] = Array.isArray(currentMeta.trail)
      ? currentMeta.trail
      : [];
    trail.push({
      step: 'complete',
      ts: finishedAt.toISOString(),
      ok: params.success,
      detail: params.summary ?? params.errorMessage,
      data: sanitizeForLog(params.result),
    });

    const status = params.escalated
      ? 'escalated'
      : params.success
      ? 'completed'
      : 'failed';

    await db
      .update(auditLogs)
      .set({
        success: params.success,
        errorMessage: params.errorMessage ?? null,
        changesAfter: sanitizeForLog(params.result) as any,
        metadata: {
          ...currentMeta,
          trail,
          status,
          finishedAt: finishedAt.toISOString(),
          durationMs,
          summary: params.summary ?? null,
        } as any,
      })
      .where(eq(auditLogs.id, record.id));
  } catch (err: unknown) {
    log.warn('[workflowLogger] Non-fatal: complete update failed', {
      workflow: record.workflowName,
      error: err?.message,
    });
  }
}

/** Redaction mirror of actionAuditLogger.sanitize — keep in sync if extended. */
const SENSITIVE_KEYS = ['password', 'token', 'secret', 'key', 'auth', 'credit_card', 'ssn'];

function sanitizeForLog<T extends Record<string, any> | null | undefined>(
  value: T,
): T {
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = Array.isArray(value) ? [...value] : { ...value };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_KEYS.some((sk) => k.toLowerCase().includes(sk))) {
      out[k] = '[REDACTED]';
    } else if (out[k] && typeof out[k] === 'object') {
      out[k] = sanitizeForLog(out[k]);
    }
  }
  return out as T;
}
