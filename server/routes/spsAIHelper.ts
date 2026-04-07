/**
 * SPS AI Helper — Thin wrapper for Trinity AI calls used in the SPS document domain.
 * Uses GPT-4o-mini (text) or GPT-4o (vision) via the project's existing OpenAI client.
 */
import { sanitizeError } from '../middleware/errorHandler';
import { generateWithOpenAI } from '../services/ai-brain/providers/openaiClient';
import { aiMeteringService } from '../services/billing/aiMeteringService';
import { createLogger } from '../lib/logger';
const log = createLogger('SpsAIHelper');


interface SpsAICallOptions {
  prompt: string;
  systemPrompt?: string;
  imageBase64?: string;
  maxTokens?: number;
}

export async function callSpsAI(options: SpsAICallOptions): Promise<string> {
  const { prompt, systemPrompt, maxTokens = 1024 } = options;
  const result = await generateWithOpenAI({
    prompt,
    systemPrompt,
    modelId: 'gpt-4o-mini',
    maxTokens,
    context: { workspaceId: 'sps-system', userId: 'sps-system' },
  });
  return result.content || '';
}

export async function callSpsVisionAI(
  prompt: string,
  imageBase64: string,
  maxTokens = 1024,
): Promise<string> {
  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const dataUrl = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const resp = await client.chat.completions.create({ // withGpt
      model: 'gpt-4o',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    });
    aiMeteringService.recordAiCall({
      workspaceId: 'sps-system',
      modelName: 'gpt-4o',
      callType: 'sps_vision_ocr',
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    });
    return resp.choices[0]?.message?.content || '';
  } catch (err: unknown) {
    log.error('[callSpsVisionAI] error:', sanitizeError(err));
    throw err;
  }
}
