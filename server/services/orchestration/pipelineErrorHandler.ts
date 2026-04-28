/**
 * PIPELINE ERROR HANDLER
 * ======================
 * Centralized error handling for ALL automation pipelines and workflow actions.
 *
 * Provides:
 *   withRetry()          — exponential backoff with jitter, configurable attempts, per-attempt logging
 *   withPipelineGuard()  — wraps a pipeline step: retry → log final failure →
 *                           fail the execution record → notify org owner in-app + email
 *   notifyWorkspaceFailure() — creates an in-app 'action_required' notification for the org
 *                              owner AND sends an email with failure details + remediation hints
 *   classifyPipelineError()  — maps any thrown error to a structured { code, retryable, userMessage }
 *
 * Usage (quick):
 *   import { withPipelineGuard } from '../orchestration/pipelineErrorHandler';
 *
 *   const result = await withPipelineGuard(
 *     () => myRiskyOperation(),
 *     {
 *       workspaceId: ws.id,
 *       pipelineName: 'invoice-generation',
 *       stepName: 'generate-pdf',
 *       executionId: execId,           // optional — links to automationExecutions row
 *       maxAttempts: 3,
 *       baseDelayMs: 1000,
 *     }
 *   );
 */

import { pool } from '../../db';
import { emailService } from '../emailService';
import { createLogger } from '../../lib/logger';
import { automationExecutionTracker } from './automationExecutionTracker';

const log = createLogger('PipelineErrorHandler');

// ─────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────

export type PipelineErrorCode =
  | 'TIMEOUT'
  | 'DB_CONNECTION_FAILED'
  | 'EXTERNAL_SERVICE_DOWN'
  | 'RATE_LIMITED'
  | 'RESOURCE_LOCKED'
  | 'INSUFFICIENT_CREDITS'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_FAILED'
  | 'DATA_INTEGRITY_ERROR'
  | 'UNKNOWN';

export interface ClassifiedError {
  code: PipelineErrorCode;
  retryable: boolean;
  userMessage: string;
  technicalDetail: string;
}

const ERROR_CLASSIFICATIONS: Record<
  PipelineErrorCode,
  { retryable: boolean; userMessage: string }
> = {
  TIMEOUT: {
    retryable: true,
    userMessage:
      'The operation took too long to respond. Our system will retry automatically.',
  },
  DB_CONNECTION_FAILED: {
    retryable: true,
    userMessage:
      'A database connection issue occurred. Our system will retry automatically.',
  },
  EXTERNAL_SERVICE_DOWN: {
    retryable: true,
    userMessage:
      'An external service (e.g. payment processor or integration) is temporarily unavailable. Our system will retry once it recovers.',
  },
  RATE_LIMITED: {
    retryable: true,
    userMessage:
      'A rate limit was reached. Our system will retry after a brief cooldown.',
  },
  RESOURCE_LOCKED: {
    retryable: true,
    userMessage:
      'The resource is temporarily locked by another process. Our system will retry automatically.',
  },
  INSUFFICIENT_CREDITS: {
    retryable: false,
    userMessage:
      'Your workspace has reached its AI operation limit for this billing period. Please contact support to review your plan.',
  },
  PERMISSION_DENIED: {
    retryable: false,
    userMessage:
      'The automation lacks the required permissions to complete this action. Please check your configuration.',
  },
  VALIDATION_FAILED: {
    retryable: false,
    userMessage:
      'The data required for this automation is incomplete or invalid. Please review the inputs and try again.',
  },
  DATA_INTEGRITY_ERROR: {
    retryable: false,
    userMessage:
      'A data integrity error was detected. This may require manual review.',
  },
  UNKNOWN: {
    retryable: false,
    userMessage:
      'An unexpected error occurred in the automation pipeline. Please contact support if this persists.',
  },
};

export function classifyPipelineError(error: unknown): ClassifiedError {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown');
  const lower = message.toLowerCase();

  let code: PipelineErrorCode = 'UNKNOWN';

  if (lower.includes('timeout') || lower.includes('timed out'))
    code = 'TIMEOUT';
  else if (
    lower.includes('connection') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound')
  )
    code = 'DB_CONNECTION_FAILED';
  else if (lower.includes('service') && lower.includes('unavailable'))
    code = 'EXTERNAL_SERVICE_DOWN';
  else if (lower.includes('rate limit') || lower.includes('429'))
    code = 'RATE_LIMITED';
  else if (lower.includes('locked') || lower.includes('concurrent'))
    code = 'RESOURCE_LOCKED';
  else if (
    lower.includes('insufficient credits') ||
    lower.includes('no credits') ||
    lower.includes('quota exceeded')
  )
    code = 'INSUFFICIENT_CREDITS';
  else if (lower.includes('permission') || lower.includes('unauthorized'))
    code = 'PERMISSION_DENIED';
  else if (lower.includes('validation') || lower.includes('invalid input'))
    code = 'VALIDATION_FAILED';
  else if (
    lower.includes('integrity') ||
    lower.includes('constraint') ||
    lower.includes('duplicate key')
  )
    code = 'DATA_INTEGRITY_ERROR';

  const classification = ERROR_CLASSIFICATIONS[code];

  return {
    code,
    retryable: classification.retryable,
    userMessage: classification.userMessage,
    technicalDetail: message,
  };
}

// ─────────────────────────────────────────────────────────────
// Retry loop
// ─────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
  /** If provided, only retries when this returns true. Defaults to classifyPipelineError().retryable */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export class PipelineRetryExhaustedError extends Error {
  constructor(
    public readonly label: string,
    public readonly attempts: number,
    public readonly cause: unknown
  ) {
    const msg =
      cause instanceof Error ? cause.message : String(cause ?? 'unknown');
    super(
      `Pipeline step "${label}" failed after ${attempts} attempt(s): ${msg}`
    );
    this.name = 'PipelineRetryExhaustedError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const label = opts.label ?? 'pipeline-step';

  let lastError: unknown = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const classified = classifyPipelineError(err);
      const canRetry =
        opts.shouldRetry != null
          ? opts.shouldRetry(err, attempt)
          : classified.retryable;

      if (attempt < maxAttempts && canRetry) {
        const jitter = Math.random() * 300;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        log.warn(
          `[Retry ${attempt}/${maxAttempts}] "${label}" — ${classified.code}: ${classified.technicalDetail}. Retrying in ${Math.round(delay)}ms…`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } else {
        const reason = canRetry
          ? 'max attempts reached'
          : 'error is not retryable';
        log.error(
          `[Retry] "${label}" permanently failed (${reason}) after attempt ${attempt}/${maxAttempts}: ${classified.technicalDetail}`
        );
        break;
      }
    }
  }

  throw new PipelineRetryExhaustedError(label, maxAttempts, lastError);
}

// ─────────────────────────────────────────────────────────────
// Workspace failure notification
// ─────────────────────────────────────────────────────────────

export interface WorkspaceFailureOptions {
  actionUrl?: string;
  remediationHints?: string[];
  executionId?: string;
  pipelineName?: string;
  stepName?: string;
  errorCode?: PipelineErrorCode;
}

/**
 * Creates an in-app 'action_required' notification for the workspace org owner
 * AND sends an email so the failure is always surfaced — even if they're offline.
 */
export async function notifyWorkspaceFailure(
  workspaceId: string,
  title: string,
  userMessage: string,
  opts: WorkspaceFailureOptions = {}
): Promise<void> {
  try {
    const ownerResult = await pool.query<{
      id: string;
      email: string;
      first_name: string;
    }>(
      `
      SELECT u.id, u.email, u.first_name
      FROM users u
      JOIN employees e ON e.user_id = u.id
      WHERE e.workspace_id = $1
        AND e.workspace_role = 'org_owner'
      LIMIT 1
    `,
      [workspaceId]
    );

    if (ownerResult.rows.length === 0) {
      log.warn(`notifyWorkspaceFailure: no org owner found for workspace ${workspaceId}`);
      return;
    }

    const owner = ownerResult.rows[0];

    // In-app notification (dynamic import to avoid circular deps with notificationService)
    try {
      const { createNotification } = await import('../notificationService');
      await createNotification({
        workspaceId,
        userId: owner.id,
        type: 'action_required',
        title,
        message: userMessage,
        actionUrl: opts.actionUrl ?? '/settings/automations',
        relatedEntityType: 'automation',
        relatedEntityId: opts.executionId,
        metadata: {
          pipelineName: opts.pipelineName,
          stepName: opts.stepName,
          errorCode: opts.errorCode,
          remediationHints: opts.remediationHints,
          source: 'pipelineErrorHandler',
        },
        createdBy: 'system',
        idempotencyKey: `action_required-${opts.executionId}-${owner.id}`
      });
    } catch (notifErr) {
      log.warn('notifyWorkspaceFailure: in-app notification failed', { notifErr });
    }

    // Email notification
    try {
      const hints =
        opts.remediationHints && opts.remediationHints.length > 0
          ? `<ul>${opts.remediationHints.map((h) => `<li>${h}</li>`).join('')}</ul>`
          : '<p>Please review your automation settings or contact support if the issue persists.</p>';

      await emailService.send({
        to: owner.email,
        subject: `Action Required: ${title}`,
        html: `
          <p>Hello ${owner.first_name || 'there'},</p>
          <p>An automation in your organization has failed and requires your attention:</p>
          <h3>${title}</h3>
          <p>${userMessage}</p>
          ${
            opts.pipelineName
              ? `<p><strong>Pipeline:</strong> ${opts.pipelineName}${opts.stepName ? ` › ${opts.stepName}` : ''}</p>`
              : ''
          }
          ${
            opts.errorCode
              ? `<p><strong>Error code:</strong> ${opts.errorCode}</p>`
              : ''
          }
          <h4>What to do next:</h4>
          ${hints}
          ${
            opts.executionId
              ? `<p><small>Execution ID: ${opts.executionId}</small></p>`
              : ''
          }
          <p>— CoAIleague Automation System</p>
        `,
        workspaceId,
      });
    } catch (emailErr) {
      log.warn('notifyWorkspaceFailure: email send failed', { emailErr });
    }
  } catch (outerErr) {
    // Never let notification failure cascade into the caller
    log.error('notifyWorkspaceFailure: unexpected error', { outerErr });
  }
}

// ─────────────────────────────────────────────────────────────
// Pipeline Guard — the all-in-one wrapper
// ─────────────────────────────────────────────────────────────

export interface PipelineGuardContext {
  workspaceId?: string;
  pipelineName: string;
  stepName?: string;
  executionId?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Additional hints shown to org owner on failure */
  remediationHints?: string[];
  /** URL to navigate to in the in-app notification */
  actionUrl?: string;
  /** If true, a permanent failure does NOT send a user notification (use for non-critical background steps) */
  silent?: boolean;
}

export interface PipelineGuardResult<T> {
  success: boolean;
  data?: T;
  error?: ClassifiedError;
  attempts: number;
}

/**
 * Wraps any async pipeline step with:
 *  1. Retry loop with exponential backoff (only retries retryable errors)
 *  2. On permanent failure:
 *     a. Calls automationExecutionTracker.failExecution() if executionId is provided
 *     b. Calls notifyWorkspaceFailure() if workspaceId is provided and silent !== true
 *  3. Returns a structured result — never throws (swallowed is logged, never silent)
 */
export async function withPipelineGuard<T>(
  fn: () => Promise<T>,
  ctx: PipelineGuardContext
): Promise<PipelineGuardResult<T>> {
  const label = `${ctx.pipelineName}${ctx.stepName ? `/${ctx.stepName}` : ''}`;
  const maxAttempts = ctx.maxAttempts ?? 3;
  const baseDelayMs = ctx.baseDelayMs ?? 1000;

  let attempts = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    try {
      const data = await fn();
      if (attempt > 1) {
        log.info(`[PipelineGuard] "${label}" succeeded on attempt ${attempt}/${maxAttempts}`);
      }
      return { success: true, data, attempts };
    } catch (err) {
      lastError = err;
      const classified = classifyPipelineError(err);

      if (attempt < maxAttempts && classified.retryable) {
        const jitter = Math.random() * 300;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        log.warn(
          `[PipelineGuard] "${label}" attempt ${attempt}/${maxAttempts} failed (${classified.code}) — retrying in ${Math.round(delay)}ms: ${classified.technicalDetail}`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } else {
        const reason = classified.retryable ? 'max attempts reached' : 'not retryable';
        log.error(
          `[PipelineGuard] "${label}" permanently FAILED (${reason}, attempts=${attempt}): [${classified.code}] ${classified.technicalDetail}`
        );
        break;
      }
    }
  }

  // All attempts exhausted — handle failure
  const classified = classifyPipelineError(lastError);

  // 1. Record in automationExecutions
  if (ctx.executionId) {
    try {
      await automationExecutionTracker.failExecution(ctx.executionId, {
        failureReason: classified.userMessage,
        failureCode: classified.code,
        remediationSteps: ctx.remediationHints?.map((h, i) => ({
          step: i + 1,
          description: h,
        })),
      });
    } catch (trackErr) {
      log.warn('[PipelineGuard] automationExecutionTracker.failExecution failed', { trackErr });
    }
  }

  // 2. Notify org owner
  if (ctx.workspaceId && !ctx.silent) {
    const title = `Automation Failed: ${ctx.pipelineName}`;
    await notifyWorkspaceFailure(ctx.workspaceId, title, classified.userMessage, {
      actionUrl: ctx.actionUrl ?? '/settings/automations',
      remediationHints: ctx.remediationHints ?? [
        'Review the automation configuration in Settings > Automations.',
        'Check that all required integrations are connected and active.',
        'Contact support if the issue persists.',
      ],
      executionId: ctx.executionId,
      pipelineName: ctx.pipelineName,
      stepName: ctx.stepName,
      errorCode: classified.code,
    });
  }

  return { success: false, error: classified, attempts };
}

/**
 * Fire-and-forget event bus publish helper — logs on failure instead of swallowing silently.
 * Use this instead of `.catch(() => {})` on platformEventBus.publish() calls.
 */
export function publishEvent(
  publisher: () => Promise<void>,
  label: string
): void {
  publisher().catch((err) => {
    log.warn(`[PipelineErrorHandler] Event publish failed for "${label}": ${err instanceof Error ? err.message : String(err)}`);
  });
}
