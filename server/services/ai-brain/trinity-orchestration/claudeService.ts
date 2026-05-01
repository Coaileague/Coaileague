/**
 * Claude Service — Anthropic API integration for Trinity's Claude brain.
 *
 * The SDK is loaded dynamically so the service file typechecks even when
 * @anthropic-ai/sdk is not installed (e.g. CI image without optional deps).
 * When the SDK is missing, calls return an empty string and log a warning
 * instead of crashing — Trinity continues to operate without the LLM tier.
 */

import { createLogger } from '../../../lib/logger';

const log = createLogger('ClaudeService');

const MODEL = process.env.NODE_ENV === 'production' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

let cachedClient: any = null;
let sdkUnavailable = false;

async function getClient(): Promise<any | null> {
  if (cachedClient) return cachedClient;
  if (sdkUnavailable) return null;
  try {
    // @ts-ignore — optional dependency
    const mod = await import('@anthropic-ai/sdk');
    const Anthropic = (mod as any).default ?? mod;
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return cachedClient;
  } catch (err: any) {
    sdkUnavailable = true;
    log.warn('[ClaudeService] @anthropic-ai/sdk not installed — Claude tier disabled');
    return null;
  }
}

export const claudeService = {
  async call(prompt: string, systemPrompt?: string, maxTokens = 1024): Promise<string> {
    const client = await getClient();
    if (!client) return '';
    try {
      const response: any = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt ?? 'You are Trinity, an intelligent AI operations assistant for security workforce management.',
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content.find((b: any) => b.type === 'text')?.text ?? '';
      log.debug(`[ClaudeService] ${MODEL} responded (${response.usage?.output_tokens ?? 0} tokens)`);
      return text;
    } catch (err: any) {
      log.error(`[ClaudeService] API call failed: ${err?.message}`);
      throw err;
    }
  },

  async callWithContext(messages: Array<{ role: string; content: string }>, systemPrompt?: string): Promise<string> {
    const client = await getClient();
    if (!client) return '';
    try {
      const response: any = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt ?? 'You are Trinity, an intelligent AI operations assistant.',
        messages,
      });
      return response.content.find((b: any) => b.type === 'text')?.text ?? '';
    } catch (err: any) {
      log.error(`[ClaudeService] Context call failed: ${err?.message}`);
      throw err;
    }
  },
};
