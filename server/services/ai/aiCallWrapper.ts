import { aiMeteringService } from '../billing/aiMeteringService';
import {
  extractGeminiTokens,
  extractClaudeTokens,
  extractGptTokens,
} from './tokenExtractor';
import { createLogger } from '../../lib/logger';
import { pool } from '../../db';

const log = createLogger('aiCallWrapper');

export interface AiCallContext {
  workspaceId: string;
  tier: string;
  callType: string;
  triggeredByUserId?: string;
  triggeredBySessionId?: string;
  trinityActionId?: string;
  employeeId?: string;
  skipRateLimit?: boolean;
  skipClaudeValidation?: boolean;
}

const RATE_LIMITS: Record<string, number> = {
  free_trial: 20,
  free: 20,
  starter: 60,
  professional: 200,
  business: 500,
  enterprise: 2000,
  strategic: 5000,
};

async function checkRateLimit(
  workspaceId: string,
  tier: string
): Promise<boolean> {
  const limit = RATE_LIMITS[tier] ?? 60;
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);

  try {
    const r = await pool.query(
      `INSERT INTO trinity_rate_limit_log (workspace_id, window_start, request_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (workspace_id, window_start)
       DO UPDATE SET request_count = trinity_rate_limit_log.request_count + 1
       RETURNING request_count`,
      [workspaceId, windowStart.toISOString()]
    );
    return (r.rows[0]?.request_count ?? 0) <= limit;
  } catch {
    return true;
  }
}

export async function withGemini<T>(
  modelName: string,
  ctx: AiCallContext,
  fn: () => Promise<{ result: T; rawResponse?: unknown }>
): Promise<T> {
  if (!ctx.skipRateLimit) {
    const withinLimit = await checkRateLimit(ctx.workspaceId, ctx.tier);
    if (!withinLimit) {
      throw new Error(
        "I'm handling many requests right now. Please wait a moment before sending another."
      );
    }
  }

  const guard = await aiMeteringService.checkUsageAllowed(
    ctx.workspaceId,
    ctx.tier
  );
  if (!guard.allowed) {
    throw new Error(
      guard.warning ?? 'Monthly AI limit reached. Please upgrade to continue.'
    );
  }

  const start = Date.now();
  try {
    const { result, rawResponse } = await fn();
    const tokens = extractGeminiTokens(rawResponse);
    const responseTimeMs = Date.now() - start;

    aiMeteringService.recordAiCall({
      workspaceId: ctx.workspaceId,
      workspaceTier: ctx.tier,
      modelName,
      callType: ctx.callType,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      responseTimeMs,
      triggeredByUserId: ctx.triggeredByUserId,
      triggeredBySessionId: ctx.triggeredBySessionId,
      trinityActionId: ctx.trinityActionId,
      employeeId: ctx.employeeId,
    });

    return result;
  } catch (err) {
    aiMeteringService.recordAiCall({
      workspaceId: ctx.workspaceId,
      workspaceTier: ctx.tier,
      modelName,
      callType: `${ctx.callType}_failed`,
      inputTokens: 0,
      outputTokens: 0,
      responseTimeMs: Date.now() - start,
    });
    throw err;
  }
}

export async function withClaude<T>(
  modelName: string,
  ctx: AiCallContext & {
    claudeValidationAction?: 'approved' | 'rewritten' | 'rejected';
  },
  fn: () => Promise<{ result: T; rawResponse?: unknown }>
): Promise<T> {
  if (!ctx.skipRateLimit) {
    const withinLimit = await checkRateLimit(ctx.workspaceId, ctx.tier);
    if (!withinLimit) {
      throw new Error(
        "I'm handling many requests right now. Please wait a moment before sending another."
      );
    }
  }

  const guard = await aiMeteringService.checkUsageAllowed(ctx.workspaceId, ctx.tier);
  if (!guard.allowed) {
    throw new Error(guard.warning ?? 'Monthly AI limit reached. Please upgrade to continue.');
  }

  const start = Date.now();
  try {
    const { result, rawResponse } = await fn();
    const tokens = extractClaudeTokens(rawResponse);

    aiMeteringService.recordAiCall({
      workspaceId: ctx.workspaceId,
      workspaceTier: ctx.tier,
      modelName,
      callType: ctx.callType,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      responseTimeMs: Date.now() - start,
      triggeredByUserId: ctx.triggeredByUserId,
      triggeredBySessionId: ctx.triggeredBySessionId,
      claudeValidated: true,
      claudeValidationPassed: ctx.claudeValidationAction !== 'rejected',
      claudeValidationAction: ctx.claudeValidationAction ?? 'approved',
    });

    return result;
  } catch (err) {
    log.error('Claude call failed', { callType: ctx.callType, err: String(err) });
    throw err;
  }
}

export async function withGpt<T>(
  modelName: string,
  ctx: AiCallContext,
  fn: () => Promise<{ result: T; rawResponse?: unknown }>
): Promise<T> {
  if (!ctx.skipRateLimit) {
    const withinLimit = await checkRateLimit(ctx.workspaceId, ctx.tier);
    if (!withinLimit) {
      throw new Error(
        "I'm handling many requests right now. Please wait a moment before sending another."
      );
    }
  }

  const guard = await aiMeteringService.checkUsageAllowed(ctx.workspaceId, ctx.tier);
  if (!guard.allowed) {
    throw new Error(guard.warning ?? 'Monthly AI limit reached. Please upgrade to continue.');
  }

  const start = Date.now();
  try {
    const { result, rawResponse } = await fn();
    const tokens = extractGptTokens(rawResponse);

    aiMeteringService.recordAiCall({
      workspaceId: ctx.workspaceId,
      workspaceTier: ctx.tier,
      modelName,
      callType: ctx.callType,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      responseTimeMs: Date.now() - start,
      triggeredByUserId: ctx.triggeredByUserId,
      triggeredBySessionId: ctx.triggeredBySessionId,
    });

    return result;
  } catch (err) {
    log.error('GPT call failed', { callType: ctx.callType, err: String(err) });
    throw err;
  }
}
