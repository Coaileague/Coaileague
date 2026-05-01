/**
 * Claude Service — real Anthropic API integration for Trinity's Claude brain
 * Uses the actual claude-sonnet-4-6 model (production) or claude-haiku-4-5 (dev)
 */
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../../../lib/logger';
const log = createLogger('ClaudeService');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.NODE_ENV === 'production' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

export const claudeService = {
  async call(prompt: string, systemPrompt?: string, maxTokens = 1024): Promise<string> {
    try {
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt ?? 'You are Trinity, an intelligent AI operations assistant for security workforce management.',
        messages,
      });
      const text = response.content.find(b => b.type === 'text')?.text ?? '';
      log.debug(`[ClaudeService] ${MODEL} responded (${response.usage.output_tokens} tokens)`);
      return text;
    } catch (err: unknown) {
      log.error(`[ClaudeService] API call failed: ${err?.message}`);
      throw err;
    }
  },

  async callWithContext(messages: Anthropic.MessageParam[], systemPrompt?: string): Promise<string> {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt ?? 'You are Trinity, an intelligent AI operations assistant.',
        messages,
      });
      return response.content.find(b => b.type === 'text')?.text ?? '';
    } catch (err: unknown) {
      log.error(`[ClaudeService] Context call failed: ${err?.message}`);
      throw err;
    }
  },
};
