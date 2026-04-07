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

import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
import { aiCreditGateway } from './aiCreditGateway';
import { usageMeteringService } from './usageMetering';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface MeteredGenerateOptions {
  workspaceId: string;
  userId?: string | null;
  featureKey: string;
  prompt: string;
  systemInstruction?: string;
  // Accept any string so callers can use newer Gemini model names without
  // editing this union every time Google ships a model. Validated at runtime
  // by the Google SDK.
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, any>;
}

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
      console.warn('[MeteredGemini] Gemini API not configured');
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
      // Default userId to null (not "system") because ai_usage_events.user_id
      // is a FK to users.id and the literal string "system" violates the
      // constraint. Callers without a real user (system-internal calls) get
      // null and the metering row is still recorded for billing.
      userId = null,
      featureKey,
      prompt,
      systemInstruction,
      // Default to gemini-2.5-flash. The previous default `gemini-1.5-flash`
      // was deprecated and returns 404 from generativelanguage.googleapis.com.
      model = 'gemini-2.5-flash',
      temperature = 0.7,
      maxOutputTokens = 2048,
      metadata = {}
    } = options;
    // Normalize empty/legacy "system" sentinel to null at this layer so we
    // never pass it to recordUsage / preAuthorize.
    const effectiveUserId = userId && userId !== 'system' ? userId : null;

    console.log(`[MeteredGemini] Request: workspace=${workspaceId}, feature=${featureKey}`);

    // Step 1: Pre-authorize the request
    // preAuthorize/finalizeBilling expect a string userId for credit lookups;
    // empty string is safe (no user matches '') and avoids the FK violation
    // that would happen if we wrote 'system' into ai_usage_events.
    const userIdForGateway = effectiveUserId ?? '';
    const authResult = await aiCreditGateway.preAuthorize(
      workspaceId,
      userIdForGateway,
      featureKey
    );

    if (!authResult.authorized) {
      console.warn(`[MeteredGemini] BLOCKED: ${authResult.reason}`);
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
    try {
      const generationConfig: GenerationConfig = {
        temperature,
        maxOutputTokens,
      };

      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      });

      const response = result.response;
      const text = response.text();
      
      // Estimate tokens (Gemini doesn't always return exact counts)
      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(text.length / 4);
      const totalTokens = inputTokens + outputTokens;

      // Step 4: Finalize billing
      const billingResult = await aiCreditGateway.finalizeBilling(
        workspaceId,
        userIdForGateway,
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

      console.log(`[MeteredGemini] SUCCESS: ${totalTokens} tokens, ${billingResult.creditsDeducted} credits charged`);

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
          creditsDeducted: billingResult.creditsDeducted,
          tier: authResult.classification.tier
        }
      };

    } catch (error: any) {
      console.error(`[MeteredGemini] ERROR: ${error.message}`);
      
      // Still record the attempt for audit
      await usageMeteringService.recordUsage({
        workspaceId,
        userId: effectiveUserId,
        featureKey,
        usageType: 'api_call',
        usageAmount: 1,
        usageUnit: 'failed_call',
        metadata: {
          error: error.message,
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
    const summary = aiCreditGateway.getBillingSummary(featureKey);
    return {
      isFree: summary.isFree,
      tier: summary.tier,
      estimatedCredits: summary.creditCost
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
