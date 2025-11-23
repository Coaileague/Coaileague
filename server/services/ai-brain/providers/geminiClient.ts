/**
 * UNIFIED GEMINI CLIENT - Single AI Provider for All Features
 * 
 * This is the ONE Gemini interface used by the entire platform.
 * All AI operations flow through here for consistency and observability.
 * With AI Guard Rails: Input validation, rate limiting, audit logging
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { usageMeteringService } from '../../billing/usageMetering';
import { aiGuardRails, type AIRequestContext } from '../aiGuardRails';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY not found - AI Brain features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface GeminiRequest {
  workspaceId?: string;
  userId?: string;
  featureKey: string; // For usage metering
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResponse {
  text: string;
  tokensUsed: number;
  confidenceScore?: number; // If AI provides confidence
  metadata?: any;
}

export class UnifiedGeminiClient {
  private model: GenerativeModel | null;

  constructor() {
    this.model = genAI ? genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp" 
    }) : null;
  }

  /**
   * Generate AI response - UNIVERSAL METHOD for all features
   */
  async generate(request: GeminiRequest): Promise<GeminiResponse> {
    if (!this.model) {
      throw new Error("Gemini API not configured - AI Brain disabled");
    }

    // Guard Rails: Create request context
    const requestContext: AIRequestContext = {
      workspaceId: request.workspaceId || 'unknown',
      userId: request.userId || 'unknown',
      organizationId: 'platform',
      requestId: Math.random().toString(36).substring(7),
      timestamp: new Date(),
      operation: request.featureKey
    };

    // Guard Rails: Validate request
    const validation = aiGuardRails.validateRequest(request.userMessage, requestContext, request.featureKey);
    if (!validation.isValid) {
      return {
        text: 'Input validation failed. Please check your message and try again.',
        tokensUsed: 0
      };
    }

    try {
      console.log(`🧠 [AI Brain] Processing ${request.featureKey} request`);
      
      // Build conversation history
      const history = (request.conversationHistory || []).map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: msg.content }]
      }));

      // Start chat with system prompt in history
      const chat = this.model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: request.maxTokens || 2048,
          temperature: request.temperature || 0.7,
        },
      });

      // Send user message
      const result = await chat.sendMessage(validation.sanitizedInput);
      const response = result.response;
      const responseText = response.text();

      // Guard Rails: Validate response
      const responseValidation = aiGuardRails.validateResponse(responseText, 0, request.featureKey);
      if (!responseValidation.isValid) {
        return {
          text: 'Response validation failed. Please try again.',
          tokensUsed: 0
        };
      }

      // Extract token usage
      const usage = response.usageMetadata;
      const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

      // Record usage for billing (cross-org learning)
      if (tokensUsed > 0 && request.workspaceId) {
        await usageMeteringService.recordUsage({
          workspaceId: request.workspaceId,
          userId: request.userId,
          featureKey: request.featureKey,
          usageType: 'token',
          usageAmount: tokensUsed,
          usageUnit: 'tokens',
          activityType: 'ai_brain_inference',
          metadata: {
            model: 'gemini-2.0-flash-exp',
            promptTokens: usage?.promptTokenCount,
            completionTokens: usage?.candidatesTokenCount,
            feature: request.featureKey
          }
        });
        
        console.log(`💰 [AI Brain] ${request.featureKey} - ${tokensUsed} tokens billed to workspace ${request.workspaceId}`);
      }

      // Guard Rails: Audit log
      aiGuardRails.logAIOperation(requestContext, validation.sanitizedInput, responseText, {
        success: true,
        creditsUsed: validation.estimatedCredits,
        tokensUsed,
        duration: Date.now() - requestContext.timestamp.getTime()
      });

      return {
        text: responseText,
        tokensUsed,
        metadata: {
          model: 'gemini-2.0-flash-exp',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: any) {
      console.error(`❌ [AI Brain] Gemini error for ${request.featureKey}:`, error);
      throw new Error(`AI Brain inference failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if AI Brain is available
   */
  isAvailable(): boolean {
    return !!this.model;
  }

  /**
   * Generate vision response (for schedule migration, etc.)
   */
  async generateVision(request: GeminiRequest & { imageData: string }): Promise<GeminiResponse> {
    if (!this.model) {
      throw new Error("Gemini API not configured");
    }

    try {
      const visionModel = genAI!.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      const result = await visionModel.generateContent([
        request.systemPrompt + "\n\n" + request.userMessage,
        {
          inlineData: {
            data: request.imageData,
            mimeType: "image/png" // Adjust based on actual image type
          }
        }
      ]);

      const response = result.response;
      const responseText = response.text();
      const usage = response.usageMetadata;
      const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

      // Record usage
      if (tokensUsed > 0 && request.workspaceId) {
        await usageMeteringService.recordUsage({
          workspaceId: request.workspaceId,
          userId: request.userId,
          featureKey: request.featureKey,
          usageType: 'token',
          usageAmount: tokensUsed,
          usageUnit: 'tokens',
          activityType: 'ai_brain_vision',
          metadata: {
            model: 'gemini-2.0-flash-exp',
            hasImage: true
          }
        });
      }

      return {
        text: responseText,
        tokensUsed
      };

    } catch (error: any) {
      console.error(`❌ [AI Brain] Vision error:`, error);
      throw new Error(`AI Brain vision failed: ${error.message}`);
    }
  }
}

// Export singleton instance - ONE brain for all features
export const geminiClient = new UnifiedGeminiClient();
