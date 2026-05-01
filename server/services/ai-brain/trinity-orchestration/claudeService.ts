/**
 * Claude Service — real Anthropic API integration for Trinity's Claude brain
 * Uses the actual claude-sonnet-4-6 model (production) or claude-haiku-4-5 (dev)
 *
 * NOTE: We do not depend on the `@anthropic-ai/sdk` package — instead we hit
 * the Anthropic Messages API over `fetch` directly. The shapes below are a
 * minimal typed projection of the API request/response — enough for our
 * call sites without pulling in the full SDK.
 */
import { createLogger } from '../../../lib/logger';
const log = createLogger('ClaudeService');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MODEL = process.env.NODE_ENV === 'production' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

export interface MessageParam {
  role: 'user' | 'assistant';
  content: string;
}

interface ContentBlock {
  type: string;
  text?: string;
}

interface MessagesResponse {
  content: ContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function callMessages(body: Record<string, unknown>): Promise<MessagesResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }
  return (await res.json()) as MessagesResponse;
}

export const claudeService = {
  async call(prompt: string, systemPrompt?: string, maxTokens = 1024): Promise<string> {
    try {
      const messages: MessageParam[] = [{ role: 'user', content: prompt }];
      const response = await callMessages({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt ?? 'You are Trinity, an intelligent AI operations assistant for security workforce management.',
        messages,
      });
      const text = response.content.find((b: ContentBlock) => b.type === 'text')?.text ?? '';
      log.debug(`[ClaudeService] ${MODEL} responded (${response.usage?.output_tokens ?? 0} tokens)`);
      return text;
    } catch (err: any) {
      log.error(`[ClaudeService] API call failed: ${err?.message}`);
      throw err;
    }
  },

  async callWithContext(messages: MessageParam[], systemPrompt?: string): Promise<string> {
    try {
      const response = await callMessages({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt ?? 'You are Trinity, an intelligent AI operations assistant.',
        messages,
      });
      return response.content.find((b: ContentBlock) => b.type === 'text')?.text ?? '';
    } catch (err: any) {
      log.error(`[ClaudeService] Context call failed: ${err?.message}`);
      throw err;
    }
  },
};
