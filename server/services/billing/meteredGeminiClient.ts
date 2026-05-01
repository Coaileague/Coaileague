/**
 * METERED GEMINI CLIENT
 * =====================
 * Centralized AI client that ALL services MUST use for Gemini calls.
 * Ensures every token is tracked and billed to the correct workspace.
 * 
 * SUBSCRIBER-PAYS-ALL MODEL:
 * - Every AI call is attributed to a workspace
 * - Usage is tracked and billed
 * - No untracked "leaking" tokens
 * 
 * USAGE:
 * import { meteredGemini } from '@/services/billing/meteredGeminiClient';
 * const result = await meteredGemini.generate({
 *   workspaceId: 'ws-123',
 *   userId: 'user-456',
 *   featureKey: 'invoice_subagent',
 *   prompt: 'Analyze this invoice...',
 *   model: 'gemini-2.5-flash'
 * });
 */

import { createLogger } from '../../lib/logger';
import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
import { aiTokenGateway } from './aiTokenGateway';
import { usageMeteringService } from './usageMetering';

const log = createLogger('meteredGeminiClient');
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface MeteredGenerateOptions {
  workspaceId: string;
  // Nullable for system-initiated calls (no real user). Previously some
  // callers passed `'system'` as a sentinel which propagated into
  // ai_usage_events and triggered a FK violation against the users
  // table. Pass `null` or omit for system calls. (Railway log
  // forensics 2026-04-08, FIX 10.)
  userId?: string | null;
  featureKey: string;
  prompt: string;
  systemInstruction?: string;
  model?: 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-exp-1206';
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, unknown>;
  feature?: string;
  /** When true, forces the model to return valid JSON (responseMimeType: application/json) */
  jsonMode?: boolean;
}

// Model tier mapping for cost optimization
export const GEMINI_MODEL_TIERS = {
  FLASH: 'gemini-2.5-flash',           // Fast, cost-effective (5 credits)
  PRO: 'gemini-2.5-pro',               // Advanced reasoning (15 credits)
  EXPERIMENTAL: 'gemini-exp-1206',     // Gemini 3 experimental (20 credits)
} as const;

export interface MeteredGenerateResult {
  success: boolean;
  text: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  billing: {
    authorized: boolean;
    charged: boolean;
    creditsDeducted: number;
    tier: string;
  };
  error?: string;
}

class MeteredGeminiClient {
  private modelCache: Map<string, GenerativeModel> = new Map();

  private getModel(modelName: string, systemInstruction?: string): GenerativeModel | null {
    if (!genAI) {
      log.warn('[MeteredGemini] Gemini API not configured');
      return null;
    }

    const cacheKey = `${modelName}-${systemInstruction || 'default'}`;
    
    if (!this.modelCache.has(cacheKey)) {
      const config: any = {};
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      this.modelCache.set(cacheKey, genAI.getGenerativeModel({ model: modelName, ...config }));
    }
    
    return this.modelCache.get(cacheKey)!;
  }

  /**
   * Generate AI response with full billing enforcement
   * This is the ONLY way subagents should call Gemini
   */
  async generate(options: MeteredGenerateOptions): Promise<MeteredGenerateResult> {
    const {
      workspaceId,
      userId = 'system',
      featureKey,
      prompt,
      systemInstruction,
      model = 'gemini-2.5-flash',
      temperature = 0.7,
      maxOutputTokens = 2048,
      metadata = {}
    } = options;

    log.info(`[MeteredGemini] Request: workspace=${workspaceId}, feature=${featureKey}`);

    // Step 1: Pre-authorize the request
    const authResult = await aiTokenGateway.preAuthorize(
      workspaceId,
      userId,
      featureKey
    );

    if (!authResult.authorized) {
      log.warn(`[MeteredGemini] BLOCKED: ${authResult.reason}`);
      return {
        success: false,
        text: '',
        tokensUsed: { input: 0, output: 0, total: 0 },
        billing: {
          authorized: false,
          charged: false,
          creditsDeducted: 0,
          tier: authResult.classification.tier
        },
        error: authResult.reason
      };
    }

    // Step 2: Get the model
    const geminiModel = this.getModel(model, systemInstruction);
    if (!geminiModel) {
      return {
        success: false,
        text: '',
        tokensUsed: { input: 0, output: 0, total: 0 },
        billing: {
          authorized: true,
          charged: false,
          creditsDeducted: 0,
          tier: authResult.classification.tier
        },
        error: 'Gemini API not configured'
      };
    }

    // Step 3: Execute the AI call
    const startTime = Date.now();
    const { jsonMode } = options;
    try {
      const generationConfig: GenerationConfig = {
        temperature,
        maxOutputTokens,
        // NOTE: responseMimeType: 'application/json' was removed — SDK v0.24.1 causes
        // truncated responses (only first ~7 tokens returned). JSON output is enforced
        // via the system prompt instead. The parseAIResponse parser handles code fences.
      };

      const result = await geminiModel.generateContent({ // withGemini
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      });

      const response = result.response;
      const text = response.text();
      
      // Prefer actual token counts from API; fall back to character-length estimate
      const inputTokens = response.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4);
      const outputTokens = response.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);
      const totalTokens = inputTokens + outputTokens;

      // Step 4: Finalize billing
      const billingResult = await aiTokenGateway.finalizeBilling(
        workspaceId,
        userId,
        featureKey,
        totalTokens,
        {
          ...metadata,
          model,
          inputTokens,
          outputTokens,
          durationMs: Date.now() - startTime
        }
      );

      log.info(`[MeteredGemini] SUCCESS: ${totalTokens} tokens, ${billingResult.tokensUsed} credits charged`);

      if (workspaceId) {
        import('./aiMeteringService').then(({ aiMeteringService }) => {
          aiMeteringService.recordAiCall({
            workspaceId: workspaceId!,
            modelName: model,
            callType: featureKey || 'gemini_metered',
            inputTokens,
            outputTokens,
            triggeredByUserId: userId,
            responseTimeMs: Date.now() - startTime,
          });
        }).catch(() => {});
      }

      return {
        success: true,
        text,
        tokensUsed: {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens
        },
        billing: {
          authorized: true,
          charged: billingResult.charged,
          creditsDeducted: billingResult.tokensUsed,
          tier: authResult.classification.tier
        }
      };

    } catch (error: any) {
      log.error(`[MeteredGemini] ERROR: ${(error instanceof Error ? error.message : String(error))}`);
      
      // Still record the attempt for audit
      await usageMeteringService.recordUsage({
        workspaceId,
        userId,
        featureKey,
        usageType: 'api_call',
        usageAmount: 1,
        usageUnit: 'failed_call',
        metadata: {
          error: (error instanceof Error ? error.message : String(error)),
          model,
          durationMs: Date.now() - startTime
        }
      });

      return {
        success: false,
        text: '',
        tokensUsed: { input: 0, output: 0, total: 0 },
        billing: {
          authorized: true,
          charged: false,
          creditsDeducted: 0,
          tier: authResult.classification.tier
        },
        error: error.message
      };
    }
  }

  /**
   * Check if a request would be billable (for UI preview)
   */
  getBillingPreview(featureKey: string): {
    isFree: boolean;
    tier: string;
    estimatedCredits: number;
  } {
    const summary = aiTokenGateway.getBillingSummary(featureKey);
    return {
      isFree: (summary as any).isFree,
      tier: (summary as any).tier,
      estimatedCredits: (summary as any).creditCost
    };
  }

  /**
   * Check if Gemini is configured
   */
  isConfigured(): boolean {
    return !!genAI;
  }
}

export const meteredGemini = new MeteredGeminiClient();
