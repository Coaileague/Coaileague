/**
 * TRINITY VOICE ACTIONS — Phase 56
 * ===================================
 * Three Trinity AI actions for the voice phone system:
 *   voice.call.summary      — AI summarizes a call transcript (Gemini → Claude → OpenAI triad)
 *   voice.credits.status    — get current credit balance
 *   voice.calls.recent      — list recent calls
 *
 * Registered with helpaiOrchestrator.registerAction()
 *
 * AI Triad Priority (per Trinity Architecture spec):
 *   1. Gemini  — Primary orchestrator (cost-effective, fast)
 *   2. Claude  — Validator / fallback (nuanced, policy-aware)
 *   3. OpenAI  — Last-resort (broadband general intelligence)
 */

import { db, pool } from '../../db';
import { voiceCallSessions } from '../../../shared/schema/domains/voice';
import { voiceSmsMeteringService } from '../billing/voiceSmsMeteringService';
import { eq, desc, and } from 'drizzle-orm';
import type { ActionRequest, ActionResult, ActionHandler } from '../helpai/platformActionHub';
import { withClaude, withGpt } from '../ai/aiCallWrapper';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityVoiceActions');


// ─── Triad: Gemini → Claude → OpenAI ─────────────────────────────────────────

async function summarizeWithTriad(params: {
  transcript: string;
  workspaceId: string;
  extensionLabel?: string | null;
}): Promise<{ summary: string; modelUsed: string }> {
  const { transcript, workspaceId, extensionLabel } = params;
  const context = extensionLabel ? ` (${extensionLabel} extension)` : '';
  const prompt =
    `You are Trinity, an empathetic AI assistant for a professional security guard company. ` +
    `Summarize this voice call transcript${context} in 2-3 sentences for a security company manager. ` +
    `Be warm, factual, and highlight any action items or concerns:\n\n${transcript.slice(0, 3000)}`;

  // ── 1. Try Gemini (Primary) ───────────────────────────────────────────────
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const { meteredGemini } = await import('../billing/meteredGeminiClient');
      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'voice_call_summary',
        prompt,
        model: 'gemini-2.5-flash',
        maxOutputTokens: 300,
      });
      if (result?.text) {
        return { summary: result.text.trim(), modelUsed: 'gemini' };
      }
    }
  } catch (err: any) {
    log.warn('[TrinityVoiceActions] Non-critical error in voice action', { error: err.message });
  }

  // ── Resolve workspace tier once for fallback metering ───────────────────
  let workspaceTier = 'starter';
  try {
    const tierRow = await pool.query('SELECT subscription_tier FROM workspaces WHERE id = $1 LIMIT 1', [workspaceId]);
    workspaceTier = tierRow.rows[0]?.subscription_tier ?? 'starter';
  } catch (err: any) {
    log.warn('[TrinityVoiceActions] Non-critical error in voice action', { error: err.message });
  }

  // ── 2. Try Claude (Secondary Validator) ──────────────────────────────────
  try {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      const text = await withClaude( // withClaude
        'claude-3-haiku-20240307',
        { workspaceId, tier: workspaceTier, callType: 'voice_call_summary', skipRateLimit: true },
        async () => {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
          });
          const data = await response.json() as { content?: Array<{ type: string; text: string }>; usage?: { input_tokens: number; output_tokens: number } };
          return { result: data.content?.[0]?.text?.trim() ?? '', rawResponse: data };
        }
      );
      if (text) return { summary: text, modelUsed: 'claude' };
    }
  } catch (err: any) {
    log.warn('[TrinityVoiceActions] Non-critical error in voice action', { error: err.message });
  }

  // ── 3. Try OpenAI (Last Resort) ──────────────────────────────────────────
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const text = await withGpt( // withGpt
        'gpt-4o-mini',
        { workspaceId, tier: workspaceTier, callType: 'voice_call_summary', skipRateLimit: true },
        async () => {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
          });
          const data = await response.json() as { choices?: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } };
          return { result: data.choices?.[0]?.message?.content?.trim() ?? '', rawResponse: data };
        }
      );
      if (text) return { summary: text, modelUsed: 'openai' };
    }
  } catch (err: any) {
    log.warn('[TrinityVoiceActions] Non-critical error in voice action', { error: err.message });
  }

  return { summary: 'AI summarization unavailable at this time. Please review the transcript manually.', modelUsed: 'none' };
}

interface ActionRegistrar {
  registerAction(handler: ActionHandler): void;
}

export function registerVoiceActions(orchestrator: ActionRegistrar): void {
  log.info('[TrinityVoice] Registering voice Trinity actions...');

  // ── voice.credits.status ──────────────────────────────────────────────────

  orchestrator.registerAction({
    actionId: 'voice.credits.status',
    name: 'Voice Credits Status',
    category: 'billing',
    description: 'Get the current Trinity Voice credit balance and recent transactions for the workspace.',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const workspaceId = request.workspaceId;

      if (!workspaceId) {
        return { success: false, actionId: request.actionId, message: 'Workspace ID required', executionTimeMs: Date.now() - startTime };
      }

      // Phase 16: voice_credit_accounts dropped — use voiceSmsMeteringService instead
      const usage = await voiceSmsMeteringService.getCurrentPeriodUsage(workspaceId);

      const minutesUsed = usage.minutesUsed;
      const includedMinutes = usage.includedMinutes;
      const remainingMinutes = Math.max(0, includedMinutes - minutesUsed);
      const overageDollars = (usage.overageChargesCents / 100).toFixed(2);
      const isLow = includedMinutes > 0 && remainingMinutes < 30;

      return {
        success: true,
        actionId: request.actionId,
        message: `Voice usage: ${minutesUsed} of ${includedMinutes} included minutes used this period${isLow ? ' — WARNING: Under 30 minutes remaining.' : ''}.`,
        data: {
          minutesUsed,
          includedMinutes,
          remainingMinutes,
          smsUsed: usage.smsUsed,
          includedSms: usage.includedSms,
          overageDollars,
          overageCents: usage.overageChargesCents,
          isLow,
          hasPlatinumVoice: usage.hasPlatinum,
        },
        executionTimeMs: Date.now() - startTime,
      };
    },
  });

  // ── voice.calls.recent ────────────────────────────────────────────────────

  orchestrator.registerAction({
    actionId: 'voice.calls.recent',
    name: 'Recent Voice Calls',
    category: 'communication',
    description: 'Retrieve a list of recent inbound voice calls for the workspace, including extension routing and duration.',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const workspaceId = request.workspaceId;
      const limit = Math.min(parseInt(request.payload?.limit ?? '10'), 50);

      if (!workspaceId) {
        return { success: false, actionId: request.actionId, message: 'Workspace ID required', executionTimeMs: Date.now() - startTime };
      }

      const calls = await db.select()
        .from(voiceCallSessions)
        .where(eq(voiceCallSessions.workspaceId, workspaceId))
        .orderBy(desc(voiceCallSessions.startedAt))
        .limit(limit);

      const summary = calls.map(c => ({
        callerNumber: c.callerNumber,
        extension: c.extensionLabel || 'unknown',
        status: c.status,
        durationSeconds: c.durationSeconds,
        language: c.language,
        clockInSuccess: c.clockInSuccess,
        at: c.startedAt,
      }));

      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${calls.length} recent call(s).`,
        data: { calls: summary, total: calls.length },
        executionTimeMs: Date.now() - startTime,
      };
    },
  });

  // ── voice.call.summary ────────────────────────────────────────────────────

  orchestrator.registerAction({
    actionId: 'voice.call.summary',
    name: 'Voice Call Summary',
    category: 'communication',
    description: 'Summarize a voice call transcript using AI. Provide a callId or callSid.',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const workspaceId = request.workspaceId;
      const { callId, callSid } = request.payload || {};

      if (!workspaceId || (!callId && !callSid)) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'callId or callSid required',
          executionTimeMs: Date.now() - startTime,
        };
      }

      const callFilter = callId
        ? eq(voiceCallSessions.id, callId)
        : eq(voiceCallSessions.twilioCallSid, callSid);

      const [session] = await db.select()
        .from(voiceCallSessions)
        .where(and(eq(voiceCallSessions.workspaceId, workspaceId), callFilter))
        .limit(1);

      if (!session) {
        return { success: false, actionId: request.actionId, message: 'Call not found', executionTimeMs: Date.now() - startTime };
      }

      if (!session.transcript) {
        return {
          success: true,
          actionId: request.actionId,
          message: 'No transcript available for this call.',
          data: { session: { id: session.id, status: session.status, extension: session.extensionLabel } },
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Use the Trinity AI triad: Gemini → Claude → OpenAI
      const { summary, modelUsed } = await summarizeWithTriad({
        transcript: session.transcript,
        workspaceId,
        extensionLabel: session.extensionLabel,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: summary,
        data: {
          callId: session.id,
          summary,
          modelUsed,
          extension: session.extensionLabel,
          durationSeconds: session.durationSeconds,
          callerNumber: session.callerNumber,
          at: session.startedAt,
        },
        executionTimeMs: Date.now() - startTime,
      };
    },
  });
}
