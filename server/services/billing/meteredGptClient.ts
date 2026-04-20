/**
 * METERED GPT CLIENT
 * ==================
 * Cost-optimized GPT service for simple/cheap tasks.
 * 
 * Uses YOUR OWN OpenAI API key (OPENAI_API_KEY) - no middleman markup.
 * All usage is tracked and billed directly to orgs via workspace credits.
 * 
 * Model Tiers (cost optimization):
 * - gpt-4o-mini: Fastest, cheapest - simple classification, formatting
 * - gpt-4o: Cost-effective - standard tasks, data extraction  
 * - o4-mini: Thinking model - complex reasoning when needed
 * 
 * Use Cases:
 * - Data formatting and cleanup
 * - Simple text classification
 * - Template filling
 * - Basic extraction tasks
 * - Quick lookups and queries
 */

import { createLogger } from '../../lib/logger';
import OpenAI from 'openai';
import { aiTokenGateway } from './aiTokenGateway';

const log = createLogger('meteredGptClient');
// GPT model tiers for cost optimization
export type GptModelTier = 'NANO' | 'MINI' | 'STANDARD' | 'REASONING';

export const GPT_MODELS: Record<GptModelTier, string> = {
  NANO: 'gpt-4o-mini',     // Fastest, cheapest ($0.15/1M input, $0.60/1M output)
  MINI: 'gpt-4o',          // Standard ($2.50/1M input, $10/1M output)
  STANDARD: 'gpt-4o',      // Same as MINI for compatibility
  REASONING: 'o4-mini',    // Thinking model for complex tasks
};

// Credit costs per tier - based on actual OpenAI pricing + margin
// Priced to be cheaper than Gemini for simple tasks
export const GPT_CREDIT_COSTS: Record<GptModelTier, number> = {
  NANO: 1,       // Very cheap - simple grunt work
  MINI: 3,       // Moderate 
  STANDARD: 3,   // Same as MINI
  REASONING: 8,  // Thinking model - still cheaper than Gemini 3
};

// OpenAI client using YOUR OWN API key
let openaiClient: OpenAI | null = null;
let gptInitialized = false;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured - required for GPT operations');
    }
    openaiClient = new OpenAI({ apiKey });
    if (!gptInitialized) {
      log.info('[MeteredGPT] OpenAI client initialized with user API key');
      gptInitialized = true;
    }
  }
  return openaiClient;
}

// Check if GPT is available (key configured)
export function isGptAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Log availability at module load
if (process.env.OPENAI_API_KEY) {
  log.info('[MeteredGPT] OpenAI API key detected - GPT tier available');
} else {
  log.info('[MeteredGPT] No OpenAI API key - GPT tier will fallback to Gemini');
}

export interface GptRequest {
  prompt: string;
  systemPrompt?: string;
  tier?: GptModelTier;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  workspaceId: string;
  userId?: string;
  featureKey?: string;
}

export interface GptResponse {
  content: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
  tier: GptModelTier;
  latencyMs: number;
  creditsCharged: number;
  confidence?: number;
}

export interface GptConfidenceResult extends GptResponse {
  confidence: number;
  needsEscalation: boolean;
  escalationReason?: string;
}

class MeteredGptClient {
  private requestCount = 0;
  private totalTokens = 0;

  /**
   * Execute a GPT request with automatic metering and billing
   */
  async execute(request: GptRequest): Promise<GptResponse> {
    const startTime = Date.now();
    const tier = request.tier || 'NANO';
    const model = GPT_MODELS[tier];
    const featureKey = request.featureKey || 'gpt_general';

    if (!isGptAvailable()) {
      log.warn('[MeteredGPT] GPT service not available - OPENAI_API_KEY not configured');
      return {
        content: '',
        tokensUsed: 0,
        inputTokens: 0,
        outputTokens: 0,
        model,
        tier,
        latencyMs: 0,
        creditsCharged: 0,
      };
    }

    const client = getOpenAIClient();

    try {
      const preAuth = await aiTokenGateway.preAuthorize(
        request.workspaceId,
        request.userId,
        featureKey
      );
      if (!preAuth.authorized) {
        throw new Error(preAuth.reason || 'Insufficient credits for GPT request');
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      
      messages.push({ role: 'user', content: request.prompt });

      const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages,
        max_completion_tokens: request.maxTokens || 1000,
      };

      if (request.jsonMode) {
        completionParams.response_format = { type: 'json_object' };
      }

      const response = await client.chat.completions.create(completionParams); // withGpt

      const content = response.choices[0]?.message?.content || '';
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const tokensUsed = inputTokens + outputTokens;
      const latencyMs = Date.now() - startTime;

      await aiTokenGateway.finalizeBilling(
        request.workspaceId,
        request.userId,
        featureKey,
        tokensUsed,
        {
          inputTokens,
          outputTokens,
          model,
        },
      );

      if (request.workspaceId) {
        import('./aiMeteringService').then(({ aiMeteringService }) => {
          aiMeteringService.recordAiCall({
            workspaceId: request.workspaceId!,
            modelName: model,
            callType: request.featureKey || `gpt_${tier}`,
            inputTokens,
            outputTokens,
            triggeredByUserId: request.userId,
            responseTimeMs: latencyMs,
          });
        }).catch(() => {});
      }

      this.requestCount++;
      this.totalTokens += tokensUsed;

      log.info(`[MeteredGptClient] ${tier} request completed: ${tokensUsed} tokens, ${latencyMs}ms`);

      return {
        content,
        tokensUsed,
        inputTokens,
        outputTokens,
        model,
        tier,
        latencyMs,
        creditsCharged: GPT_CREDIT_COSTS[tier],
      };
    } catch (error: any) {
      log.error(`[MeteredGptClient] Error:`, (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  /**
   * Execute with confidence scoring - returns whether escalation is needed
   */
  async executeWithConfidence(request: GptRequest): Promise<GptConfidenceResult> {
    const confidencePrompt = `${request.systemPrompt || ''}

IMPORTANT: After your response, you MUST include a confidence assessment in this exact format on a new line:
CONFIDENCE: [0.0-1.0] - Brief reason

Where:
- 0.0-0.3: Very uncertain, likely need human/expert review
- 0.4-0.6: Moderate confidence, may benefit from verification
- 0.7-0.8: High confidence but complex task
- 0.9-1.0: Very confident, straightforward task

Example:
CONFIDENCE: 0.85 - Clear formatting task with obvious solution`;

    const response = await this.execute({
      ...request,
      systemPrompt: confidencePrompt,
    });

    // Parse confidence from response
    const { content, confidence, reason } = this.parseConfidence(response.content);

    const needsEscalation = confidence < 0.6;

    return {
      ...response,
      content,
      confidence,
      needsEscalation,
      escalationReason: needsEscalation ? reason || 'Low confidence score' : undefined,
    };
  }

  /**
   * Quick classification task - uses NANO tier
   */
  async classify(
    text: string,
    categories: string[],
    workspaceId: string,
    userId?: string
  ): Promise<{ category: string; confidence: number }> {
    const response = await this.execute({
      prompt: `Classify this text into one of these categories: ${categories.join(', ')}

Text: "${text}"

Respond with JSON: {"category": "chosen_category", "confidence": 0.0-1.0}`,
      systemPrompt: 'You are a precise text classifier. Always respond with valid JSON.',
      tier: 'NANO',
      jsonMode: true,
      workspaceId,
      userId,
      featureKey: 'gpt_classification',
    });

    try {
      const result = JSON.parse(response.content);
      return {
        category: result.category || categories[0],
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      };
    } catch {
      return { category: categories[0], confidence: 0.3 };
    }
  }

  /**
   * Data extraction task - uses NANO or MINI tier
   */
  async extract(
    text: string,
    fields: string[],
    workspaceId: string,
    userId?: string
  ): Promise<Record<string, any>> {
    const response = await this.execute({
      prompt: `Extract the following fields from this text: ${fields.join(', ')}

Text: "${text}"

Respond with JSON containing only the requested fields. Use null for missing values.`,
      systemPrompt: 'You are a precise data extractor. Always respond with valid JSON.',
      tier: 'NANO',
      jsonMode: true,
      workspaceId,
      userId,
      featureKey: 'gpt_extraction',
    });

    try {
      return JSON.parse(response.content);
    } catch {
      return {};
    }
  }

  /**
   * Text formatting/cleanup - uses NANO tier
   */
  async format(
    text: string,
    format: 'clean' | 'professional' | 'casual' | 'technical',
    workspaceId: string,
    userId?: string
  ): Promise<string> {
    const response = await this.execute({
      prompt: `Reformat this text to be more ${format}:\n\n${text}`,
      systemPrompt: `You are a text formatter. Make the text more ${format} while preserving the meaning.`,
      tier: 'NANO',
      workspaceId,
      userId,
      featureKey: 'gpt_formatting',
    });

    return response.content;
  }

  /**
   * Simple summarization - uses MINI tier
   */
  async summarize(
    text: string,
    maxWords: number = 50,
    workspaceId: string,
    userId?: string
  ): Promise<string> {
    const response = await this.execute({
      prompt: `Summarize this text in ${maxWords} words or less:\n\n${text}`,
      systemPrompt: 'You are a concise summarizer. Keep key points only.',
      tier: 'MINI',
      workspaceId,
      userId,
      featureKey: 'gpt_summarization',
    });

    return response.content;
  }

  /**
   * Parse confidence from response
   */
  private parseConfidence(content: string): { content: string; confidence: number; reason?: string } {
    const lines = content.split('\n');
    let confidence = 0.5; // Default moderate confidence
    let reason: string | undefined;
    let cleanContent = content;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('CONFIDENCE:')) {
        const match = line.match(/CONFIDENCE:\s*([\d.]+)\s*-?\s*(.*)/i);
        if (match) {
          confidence = parseFloat(match[1]);
          reason = match[2] || undefined;
          // Remove confidence line from content
          cleanContent = lines.slice(0, i).join('\n').trim();
          break;
        }
      }
    }

    return { content: cleanContent, confidence, reason };
  }


  /**
   * Get client stats
   */
  getStats(): { requestCount: number; totalTokens: number } {
    return {
      requestCount: this.requestCount,
      totalTokens: this.totalTokens,
    };
  }
}

// Singleton instance
export const meteredGptClient = new MeteredGptClient();

// Export convenience functions
export async function gptExecute(request: GptRequest): Promise<GptResponse> {
  return meteredGptClient.execute(request);
}

export async function gptExecuteWithConfidence(request: GptRequest): Promise<GptConfidenceResult> {
  return meteredGptClient.executeWithConfidence(request);
}

export async function gptClassify(
  text: string,
  categories: string[],
  workspaceId: string,
  userId?: string
): Promise<{ category: string; confidence: number }> {
  return meteredGptClient.classify(text, categories, workspaceId, userId);
}

export async function gptExtract(
  text: string,
  fields: string[],
  workspaceId: string,
  userId?: string
): Promise<Record<string, any>> {
  return meteredGptClient.extract(text, fields, workspaceId, userId);
}

export async function gptFormat(
  text: string,
  format: 'clean' | 'professional' | 'casual' | 'technical',
  workspaceId: string,
  userId?: string
): Promise<string> {
  return meteredGptClient.format(text, format, workspaceId, userId);
}

export async function gptSummarize(
  text: string,
  maxWords: number,
  workspaceId: string,
  userId?: string
): Promise<string> {
  return meteredGptClient.summarize(text, maxWords, workspaceId, userId);
}
