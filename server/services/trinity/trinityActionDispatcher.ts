/**
 * Trinity Action Dispatcher
 *
 * Sits between Trinity's reasoning (chat, voice, email) and the action
 * registry. Routes intent-detected commands into the platform action
 * pipeline:
 *   - Low-risk, high-confidence → execute immediately via helpaiOrchestrator
 *   - Medium/high-risk or low-confidence → queue as governance_approvals
 *     with a stable idempotency_key so duplicate commands collapse into
 *     one pending approval
 *   - No intent → no-op; caller keeps existing response
 *
 * Used by:
 *   - trinityChatService (chat-mode intent dispatch)
 *   - trinity-talk voice route (voice transcripts)
 *   - trinityInboundEmailProcessor (email command path)
 *   - trinityEventBrain (autonomous action queueing)
 *   - ChatServerHub (voice-message transcripts)
 *
 * Exports are intentionally backward-compatible with both the
 * {detected, status} shape (autonomous supervisor) and the
 * {executed, queued} shape (event brain) so every caller continues to work.
 */

import { randomUUID, createHash } from 'crypto';
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionRequest, ActionResult } from '../helpai/platformActionHub';
import { automationGovernanceService } from '../ai-brain/automationGovernanceService';
import { meteredGemini } from '../billing/meteredGeminiClient';

const log = createLogger('TrinityActionDispatcher');

export type RiskLevel = 'low' | 'medium' | 'high';

export interface DispatchContext {
  workspaceId: string;
  userId: string;
  userRole: string;
  sessionId?: string;
  source?: string;
  platformRole?: string;
}

/**
 * Unified result shape. Contains fields from both the autonomous-supervisor
 * (`detected`, `status`) and event-brain (`executed`, `queued`) APIs so
 * every caller — legacy or new — gets the data it expects.
 */
export interface DispatchResult {
  // Event-brain shape
  executed: boolean;
  queued: boolean;
  approvalId?: string;
  actionId?: string;
  appendToResponse?: string;
  error?: string;

  // Autonomous-supervisor shape (compatibility layer)
  detected: boolean;
  status: 'executed' | 'queued' | 'none' | 'error' | 'blocked';
  executionResult?: ActionResult;
  wasExisting?: boolean;
}

interface IntentMatch {
  actionId: string;
  risk: RiskLevel;
  category: string;
  payload: Record<string, any>;
  reason: string;
}

// ── Unified intent patterns (merged: autonomous supervisor + event brain) ─
// Ordered most-specific first so more granular matches win.
const ACTION_INTENT_PATTERNS: Array<{
  pattern: RegExp;
  actionId: string;
  risk: RiskLevel;
  category: string;
  extract: (match: RegExpMatchArray, text: string) => Record<string, any>;
  reason: string;
}> = [
  // Payroll — highest risk, never auto-execute
  {
    pattern: /\b(run|process|start|execute)\s+payroll\b/i,
    actionId: 'payroll.run',
    risk: 'high',
    category: 'payroll',
    extract: () => ({}),
    reason: 'Run payroll requested',
  },
  // Employee termination / deactivation
  {
    pattern: /\b(deactivate|suspend|disable|terminate)\b.{0,40}\b(employee|officer|guard|user)\b/i,
    actionId: 'employees.deactivate',
    risk: 'high',
    category: 'user_access_revocation',
    extract: () => ({}),
    reason: 'Deactivate/terminate employee requested',
  },
  // Mass SMS broadcast
  {
    pattern: /\b(send|blast|text|sms)\b[^.]{0,40}\b(all|every)\b.{0,40}\b(officer|staff|guard|team)\b/i,
    actionId: 'notify.send',
    risk: 'medium',
    category: 'notification',
    extract: (_m, text) => ({ targetGroup: 'available_officers', message: text.slice(0, 500), channels: ['sms'] }),
    reason: 'Broadcast SMS to officers requested',
  },
  // General notification
  {
    pattern: /\b(send|text|notify|message|broadcast)\b.{0,40}\b(all|everyone|officers|team|staff)\b/i,
    actionId: 'notify.send',
    risk: 'medium',
    category: 'notification',
    extract: (_m, text) => ({ message: text.slice(0, 500) }),
    reason: 'Notify group requested',
  },
  // Scheduling
  {
    pattern: /\b(fill|cover|backfill|find.*coverage)\b.{0,40}\bshift\b/i,
    actionId: 'scheduling.fill_open_shift',
    risk: 'low',
    category: 'scheduling',
    extract: () => ({ urgency: 'normal' }),
    reason: 'Fill open shift requested',
  },
  {
    pattern: /\b(cancel|remove|delete)\b.{0,20}\bshift\b/i,
    actionId: 'scheduling.cancel_shift',
    risk: 'medium',
    category: 'scheduling',
    extract: () => ({}),
    reason: 'Cancel shift requested',
  },
  {
    pattern: /\b(reassign|move|transfer)\b.{0,30}\bshift\b/i,
    actionId: 'scheduling.reassign_shift',
    risk: 'medium',
    category: 'scheduling',
    extract: () => ({}),
    reason: 'Reassign shift requested',
  },
  {
    pattern: /\b(create|add|schedule|put)\b.{0,30}\bshift\b/i,
    actionId: 'scheduling.create_shift',
    risk: 'medium',
    category: 'scheduling',
    extract: () => ({}),
    reason: 'Create shift requested',
  },
  // Time tracking
  {
    pattern: /\b(clock\s*out|end.*shift)\b.{0,30}(for\s+)?\w+/i,
    actionId: 'time_tracking.clock_out',
    risk: 'low',
    category: 'time_tracking',
    extract: () => ({}),
    reason: 'Clock out requested',
  },
  // Billing
  {
    pattern: /\b(send|email|generate|issue)\b.{0,20}invoice/i,
    actionId: 'billing.invoice_send',
    risk: 'medium',
    category: 'billing',
    extract: () => ({}),
    reason: 'Send invoice requested',
  },
  {
    pattern: /\b(create|generate|make)\b.{0,20}invoice/i,
    actionId: 'billing.invoice_create',
    risk: 'medium',
    category: 'billing',
    extract: () => ({}),
    reason: 'Create invoice requested',
  },
];

/** Base-confidence table keyed by risk tier. Used when governance is consulted. */
const RISK_CONFIDENCE: Record<RiskLevel, number> = { low: 85, medium: 65, high: 30 };

export function detectIntent(text: string): IntentMatch | null {
  if (!text) return null;
  for (const rule of ACTION_INTENT_PATTERNS) {
    const m = text.match(rule.pattern);
    if (m) {
      return {
        actionId: rule.actionId,
        risk: rule.risk,
        category: rule.category,
        payload: rule.extract(m, text),
        reason: rule.reason,
      };
    }
  }
  return null;
}

export function buildIdempotencyKey(
  workspaceId: string,
  actionId: string,
  payload: Record<string, any>,
): string {
  const digest = createHash('sha256').update(JSON.stringify(payload || {})).digest('hex').slice(0, 32);
  return `${workspaceId}:${actionId}:${digest}`;
}

/**
 * Queue a pending action for manager approval. Uses idempotency_key when
 * available so duplicate commands collapse. Falls back to plain INSERT when
 * the column does not yet exist (graceful degradation).
 */
export async function queueForApproval(
  context: DispatchContext,
  actionId: string,
  payload: Record<string, any>,
  reason: string,
  risk: RiskLevel,
): Promise<{ approvalId: string; wasExisting: boolean }> {
  const approvalId = randomUUID();
  const idempotencyKey = buildIdempotencyKey(context.workspaceId, actionId, payload);
  const expiresAt = new Date(Date.now() + (risk === 'high' ? 4 * 3600_000 : 24 * 3600_000));

  let resolvedId = approvalId;
  let wasExisting = false;

  try {
    const { rows } = await pool.query(
      `INSERT INTO governance_approvals
         (id, workspace_id, action_type, requester_id, requester_role,
          parameters, reason, status, expires_at, idempotency_key,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, NOW(), NOW())
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING id, (xmax = 0) AS inserted`,
      [
        approvalId,
        context.workspaceId,
        actionId,
        context.userId,
        context.userRole,
        JSON.stringify(payload),
        reason,
        expiresAt,
        idempotencyKey,
      ],
    );
    const row = rows[0];
    resolvedId = row?.id || approvalId;
    wasExisting = row ? row.inserted === false : false;
  } catch (err: any) {
    // Fallback path: schema may not yet include idempotency_key. Plain insert.
    try {
      await pool.query(
        `INSERT INTO governance_approvals
           (id, workspace_id, action_type, requester_id, requester_role,
            parameters, reason, status, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW(), NOW())`,
        [
          approvalId,
          context.workspaceId,
          actionId,
          context.userId,
          context.userRole,
          JSON.stringify(payload),
          reason,
          expiresAt,
        ],
      );
    } catch (fallbackErr: any) {
      log.warn('[Dispatcher] approval insert failed:', fallbackErr?.message);
    }
  }

  scheduleNonBlocking('trinity.approval.notify', async () => {
    try {
      const { platformEventBus } = await import('../platformEventBus');
      await platformEventBus.publish({
        type: 'trinity_action_pending_approval',
        category: 'system',
        title: `Trinity Action Needs Approval${risk === 'high' ? ' 🚨' : ''}`,
        description: reason,
        workspaceId: context.workspaceId,
        metadata: { actionType: actionId, risk, approvalId: resolvedId },
      } as any);
    } catch (err: any) {
      log.warn('[Dispatcher] pending_approval event publish failed (non-fatal):', err?.message);
    }
  });

  return { approvalId: resolvedId, wasExisting };
}

async function enrichPayload(
  actionId: string,
  basePayload: Record<string, any>,
  userMessage: string,
  context: DispatchContext,
): Promise<Record<string, any>> {
  const base = {
    ...basePayload,
    rawCommand: userMessage,
    source: context.source || 'trinity_chat',
    workspaceId: context.workspaceId,
  };
  try {
    const prompt = `Extract structured parameters from this command for the action "${actionId}".
Command: "${userMessage}"
Workspace: ${context.workspaceId}

Return ONLY a JSON object with the parameters needed to execute this action.
Common parameters: employeeId, shiftId, date, time, siteId, amount, message.
Use null for values you cannot determine. Return {} if nothing can be extracted.`;

    const response = await meteredGemini.generate({
      featureKey: 'trinity_action_dispatch',
      workspaceId: context.workspaceId,
      userId: context.userId || null,
      systemInstruction: 'You extract structured parameters from natural language commands. Return only valid JSON.',
      prompt,
      temperature: 0.1,
      maxOutputTokens: 400,
      jsonMode: true,
    });

    if (!response.success || !response.text) return base;
    const clean = response.text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);
    return { ...base, ...extracted };
  } catch {
    return base;
  }
}

async function executeImmediate(
  context: DispatchContext,
  actionId: string,
  category: string,
  payload: Record<string, any>,
): Promise<ActionResult> {
  const request: ActionRequest = {
    actionId,
    category: (category || actionId.split('.')[0] || 'system') as any,
    name: actionId,
    payload: { ...payload, workspaceId: context.workspaceId },
    workspaceId: context.workspaceId,
    userId: context.userId,
    userRole: context.userRole,
    platformRole: context.platformRole,
    metadata: {
      source: context.source || 'trinity-dispatcher',
      sessionId: context.sessionId,
    },
  };

  const result = await helpaiOrchestrator.executeAction(request);

  // Audit trail — trinity_action_logs (non-fatal)
  await pool.query(
    `INSERT INTO trinity_action_logs
       (id, session_id, workspace_id, user_id, action_type, action_name, parameters, result, status, duration_ms, created_at)
     VALUES ($1, $2, $3, $4, 'tool_call', $5, $6, $7, $8, $9, NOW())`,
    [
      randomUUID(),
      context.sessionId || 'dispatcher',
      context.workspaceId,
      context.userId,
      actionId,
      JSON.stringify(payload),
      JSON.stringify(result),
      result.success ? 'completed' : 'failed',
      result.executionTimeMs || 0,
    ],
  ).catch(() => {});

  return result;
}

/**
 * Primary entrypoint for chat / voice / email intent dispatch.
 */
export async function dispatchFromChat(
  message: string,
  _priorResponse: string,
  context: DispatchContext,
): Promise<DispatchResult> {
  if (!message || !context.workspaceId) {
    return { detected: false, executed: false, queued: false, status: 'none' };
  }

  const intent = detectIntent(message);
  if (!intent) {
    return { detected: false, executed: false, queued: false, status: 'none' };
  }

  log.info(`[Dispatcher] Intent detected: ${intent.actionId} (risk=${intent.risk})`, {
    workspaceId: context.workspaceId,
  });

  const enrichedPayload = await enrichPayload(intent.actionId, intent.payload, message, context);

  // Consult governance — gracefully fall back to risk-tier defaults on failure
  let governance: any;
  try {
    governance = await automationGovernanceService.evaluateExecution(
      {
        actionId: intent.actionId,
        actionName: intent.actionId,
        actionCategory: intent.category,
        workspaceId: context.workspaceId,
        userId: context.userId,
        executorType: 'trinity',
        trinitySessionId: context.sessionId,
        payload: enrichedPayload,
      },
      { baseScore: RISK_CONFIDENCE[intent.risk] },
      context.platformRole,
    );
  } catch (govErr: any) {
    log.warn('[Dispatcher] Governance evaluation error (falling back to risk tier):', govErr?.message);
    governance = {
      canExecute: true,
      requiresApproval: intent.risk !== 'low',
      blockingReason: undefined,
    };
  }

  if (governance?.canExecute === false) {
    return {
      detected: true,
      executed: false,
      queued: false,
      status: 'blocked',
      actionId: intent.actionId,
      appendToResponse: `\n\n🚫 I can't run that action here — ${governance.blockingReason || 'missing consent or policy'}.`,
    };
  }

  try {
    if (!governance?.requiresApproval) {
      const result = await executeImmediate(context, intent.actionId, intent.category, enrichedPayload);
      return {
        detected: true,
        executed: result.success,
        queued: false,
        status: result.success ? 'executed' : 'error',
        actionId: intent.actionId,
        executionResult: result,
        appendToResponse: result.success
          ? `\n\n✅ **Done** — ${result.message || intent.actionId + ' executed'}`
          : `\n\n⚠️ Action attempted but encountered an issue: ${result.error || result.message || 'unknown error'}`,
        error: result.success ? undefined : result.error || result.message,
      };
    }

    const { approvalId, wasExisting } = await queueForApproval(
      context,
      intent.actionId,
      enrichedPayload,
      intent.reason,
      intent.risk,
    );
    return {
      detected: true,
      executed: false,
      queued: true,
      status: 'queued',
      actionId: intent.actionId,
      approvalId,
      wasExisting,
      appendToResponse: wasExisting
        ? `\n\n⏳ An identical request for \`${intent.actionId}\` is already pending approval.`
        : `\n\n⏳ **Approval needed** — I've queued \`${intent.actionId}\` for manager approval (${intent.risk} risk). Reason: ${intent.reason}. Check **Approvals** in your dashboard. Expires in ${intent.risk === 'high' ? '4' : '24'} hours.`,
    };
  } catch (err: any) {
    log.warn('[Dispatcher] Dispatch failed:', err?.message);
    return {
      detected: true,
      executed: false,
      queued: false,
      status: 'error',
      actionId: intent.actionId,
      error: err?.message,
      appendToResponse: `\n\n⚠️ I understood what you want but hit an error executing it: ${err?.message}.`,
    };
  }
}

export const trinityActionDispatcher = {
  detectIntent,
  dispatchFromChat,
  queueForApproval,
  buildIdempotencyKey,
};
