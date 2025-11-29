/**
 * UNIFIED GEMINI CLIENT - Enhanced with Tool Calling & Business Insights
 * 
 * This is the ONE Gemini interface used by the entire platform.
 * All AI operations flow through here for consistency and observability.
 * 
 * Features:
 * - Gemini Tool Calling (function declarations)
 * - Retry/validation pipeline for malformed responses
 * - Business insights generation
 * - FAQ learning and updates
 * - Self-selling platform promotion
 */

import { GoogleGenerativeAI, GenerativeModel, FunctionDeclarationsTool, FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { usageMeteringService } from '../../billing/usageMetering';
import { aiGuardRails, type AIRequestContext } from '../../aiGuardRails';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY not found - AI Brain features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface GeminiRequest {
  workspaceId?: string;
  userId?: string;
  featureKey: string;
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: FunctionDeclarationsTool[];
  enableToolCalling?: boolean;
}

export interface GeminiResponse {
  text: string;
  tokensUsed: number;
  confidenceScore?: number;
  metadata?: any;
  functionCalls?: Array<{ name: string; args: any }>;
  structuredOutput?: any;
}

// Define available AI Brain tools for Gemini
const AI_BRAIN_TOOLS: FunctionDeclaration[] = [
  {
    name: "search_faqs",
    description: "Search the FAQ database for relevant answers to user questions",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "The search query" },
        category: { type: SchemaType.STRING, description: "Optional category filter" },
        limit: { type: SchemaType.NUMBER, description: "Max results to return" }
      },
      required: ["query"]
    }
  },
  {
    name: "create_support_ticket",
    description: "Create a new support ticket for the user",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        subject: { type: SchemaType.STRING, description: "Ticket subject" },
        description: { type: SchemaType.STRING, description: "Detailed description" },
        priority: { type: SchemaType.STRING, description: "low, normal, high, or urgent" },
        category: { type: SchemaType.STRING, description: "Ticket category" }
      },
      required: ["subject", "description"]
    }
  },
  {
    name: "get_business_insights",
    description: "Generate business insights and recommendations for the organization",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        insightType: { 
          type: SchemaType.STRING, 
          description: "Type of insight: sales, finance, operations, automation, growth" 
        },
        timeframe: { type: SchemaType.STRING, description: "weekly, monthly, quarterly" },
        focusArea: { type: SchemaType.STRING, description: "Specific area to analyze" }
      },
      required: ["insightType"]
    }
  },
  {
    name: "suggest_automation",
    description: "Suggest automation opportunities to save time and money",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        currentProcess: { type: SchemaType.STRING, description: "Description of current manual process" },
        painPoints: { type: SchemaType.STRING, description: "What's causing friction" }
      },
      required: ["currentProcess"]
    }
  },
  {
    name: "recommend_platform_feature",
    description: "Recommend platform features that could help the user",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userNeed: { type: SchemaType.STRING, description: "What the user is trying to accomplish" },
        currentPlan: { type: SchemaType.STRING, description: "User's current subscription tier" }
      },
      required: ["userNeed"]
    }
  },
  {
    name: "update_faq",
    description: "Update or create a new FAQ entry based on successful resolution",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        question: { type: SchemaType.STRING, description: "The question that was asked" },
        answer: { type: SchemaType.STRING, description: "The answer that helped" },
        category: { type: SchemaType.STRING, description: "FAQ category" },
        tags: { type: SchemaType.STRING, description: "Comma-separated tags" }
      },
      required: ["question", "answer"]
    }
  }
];

export class UnifiedGeminiClient {
  private model: GenerativeModel | null;
  private toolsModel: GenerativeModel | null;

  constructor() {
    this.model = genAI ? genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp" 
    }) : null;
    
    // Model with tool calling enabled
    this.toolsModel = genAI ? genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      tools: [{ functionDeclarations: AI_BRAIN_TOOLS }]
    }) : null;
  }

  /**
   * Generate AI response - UNIVERSAL METHOD for all features
   */
  async generate(request: GeminiRequest): Promise<GeminiResponse> {
    if (!this.model) {
      throw new Error("Gemini API not configured - AI Brain disabled");
    }

    const requestContext: AIRequestContext = {
      workspaceId: request.workspaceId || 'unknown',
      userId: request.userId || 'unknown',
      organizationId: 'platform',
      requestId: Math.random().toString(36).substring(7),
      timestamp: new Date(),
      operation: request.featureKey
    };

    const validation = aiGuardRails.validateRequest(request.userMessage, requestContext, request.featureKey);
    if (!validation.isValid) {
      return {
        text: 'Input validation failed. Please check your message and try again.',
        tokensUsed: 0
      };
    }

    try {
      console.log(`🧠 [AI Brain] Processing ${request.featureKey} request`);
      
      const history = (request.conversationHistory || []).map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: msg.content }]
      }));

      // Use tools model if tool calling enabled
      const modelToUse = request.enableToolCalling ? this.toolsModel : this.model;
      if (!modelToUse) throw new Error("Model not available");

      const chat = modelToUse.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: request.maxTokens || 2048,
          temperature: request.temperature || 0.7,
        },
      });

      // Retry logic for malformed responses
      let attempts = 0;
      const maxAttempts = 3;
      let lastError: Error | null = null;

      while (attempts < maxAttempts) {
        try {
          const result = await chat.sendMessage(validation.sanitizedInput);
          const response = result.response;
          
          // Extract function calls if present
          const functionCalls: Array<{ name: string; args: any }> = [];
          const candidates = response.candidates;
          
          if (candidates && candidates[0]?.content?.parts) {
            for (const part of candidates[0].content.parts) {
              if ('functionCall' in part && part.functionCall) {
                functionCalls.push({
                  name: part.functionCall.name,
                  args: part.functionCall.args
                });
              }
            }
          }

          const responseText = response.text();
          
          // Validate response
          const responseValidation = aiGuardRails.validateResponse(responseText, 0, request.featureKey);
          if (!responseValidation.isValid) {
            attempts++;
            lastError = new Error('Response validation failed');
            continue;
          }

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
              activityType: 'ai_brain_inference',
              metadata: {
                model: 'gemini-2.0-flash-exp',
                promptTokens: usage?.promptTokenCount,
                completionTokens: usage?.candidatesTokenCount,
                feature: request.featureKey,
                hasFunctionCalls: functionCalls.length > 0
              }
            });
            
            console.log(`💰 [AI Brain] ${request.featureKey} - ${tokensUsed} tokens billed`);
          }

          // Log operation
          aiGuardRails.logAIOperation(requestContext, validation.sanitizedInput, responseText, {
            success: true,
            creditsUsed: validation.estimatedCredits,
            tokensUsed,
            duration: Date.now() - requestContext.timestamp.getTime()
          });

          return {
            text: responseText,
            tokensUsed,
            functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
            metadata: {
              model: 'gemini-2.0-flash-exp',
              timestamp: new Date().toISOString(),
              attempts: attempts + 1
            }
          };

        } catch (error: any) {
          attempts++;
          lastError = error;
          console.warn(`⚠️ [AI Brain] Attempt ${attempts}/${maxAttempts} failed:`, error.message);
          
          if (attempts >= maxAttempts) break;
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }

      throw lastError || new Error('All retry attempts failed');

    } catch (error: any) {
      console.error(`❌ [AI Brain] Gemini error for ${request.featureKey}:`, error);
      throw new Error(`AI Brain inference failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Generate with structured tool calling for business insights
   */
  async generateWithTools(request: GeminiRequest): Promise<GeminiResponse> {
    return this.generate({
      ...request,
      enableToolCalling: true
    });
  }

  /**
   * Generate business insights with structured output
   */
  async generateBusinessInsight(params: {
    workspaceId: string;
    userId?: string;
    insightType: 'sales' | 'finance' | 'operations' | 'automation' | 'growth';
    context: any;
  }): Promise<GeminiResponse> {
    const systemPrompt = `You are CoAIleague Business Intelligence AI, an expert business analyst.
    
Your role is to provide actionable business insights that help organizations:
- Increase revenue and sales effectiveness
- Optimize financial operations and cash flow
- Improve workforce productivity and scheduling
- Identify automation opportunities to save time and money
- Accelerate business growth

Always provide:
1. Key metrics and trends
2. Specific, actionable recommendations
3. Estimated ROI or time savings
4. Priority ranking (high/medium/low)

Be data-driven, specific, and focus on measurable outcomes.
When relevant, suggest CoAIleague platform features that can help.`;

    const userMessage = `Generate ${params.insightType} insights based on this context:
${JSON.stringify(params.context, null, 2)}

Provide actionable recommendations with estimated impact.`;

    return this.generate({
      workspaceId: params.workspaceId,
      userId: params.userId,
      featureKey: `business_insight_${params.insightType}`,
      systemPrompt,
      userMessage,
      temperature: 0.5,
      enableToolCalling: true
    });
  }

  /**
   * Self-selling: Recommend platform features based on user needs
   */
  async generatePlatformRecommendation(params: {
    workspaceId: string;
    userId?: string;
    userNeed: string;
    currentPlan?: string;
    currentUsage?: any;
  }): Promise<GeminiResponse> {
    const systemPrompt = `You are CoAIleague Platform Advisor, helping users get the most from the platform.

CoAIleague Features by Tier:
- STARTER ($29/mo): Time tracking, basic scheduling, 5 employees, basic reports
- PROFESSIONAL ($79/mo): AI scheduling, payroll automation, invoicing, 25 employees, advanced analytics
- ENTERPRISE ($199/mo): Full AI Brain, predictive analytics, unlimited employees, custom integrations, dedicated support

Your role:
1. Understand what the user is trying to accomplish
2. Recommend the most relevant CoAIleague features
3. Explain how these features solve their specific problems
4. Suggest upgrade paths if current plan limits apply
5. Highlight ROI and time savings

Be helpful, not pushy. Focus on genuine value.`;

    const userMessage = `User need: ${params.userNeed}
Current plan: ${params.currentPlan || 'Unknown'}
Current usage: ${JSON.stringify(params.currentUsage || {}, null, 2)}

Recommend the best platform features to help this user.`;

    return this.generate({
      workspaceId: params.workspaceId,
      userId: params.userId,
      featureKey: 'platform_recommendation',
      systemPrompt,
      userMessage,
      temperature: 0.6
    });
  }

  /**
   * Generate FAQ answer and optionally update the FAQ database
   */
  async generateFAQResponse(params: {
    workspaceId?: string;
    userId?: string;
    question: string;
    existingFaqs?: Array<{ question: string; answer: string; score: number }>;
    shouldLearn?: boolean;
  }): Promise<GeminiResponse & { suggestedFAQ?: { question: string; answer: string; category: string } }> {
    const systemPrompt = `You are CoAIleague Support AI, providing helpful answers to user questions.

Available FAQs (use these first if relevant):
${params.existingFaqs?.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n') || 'No FAQs available'}

Guidelines:
1. If an FAQ matches, use that answer (with personalization)
2. If no FAQ matches, provide a helpful, accurate answer
3. Be concise but complete
4. If you're unsure, suggest contacting human support
5. Always be friendly and professional`;

    const response = await this.generate({
      workspaceId: params.workspaceId,
      userId: params.userId,
      featureKey: 'faq_response',
      systemPrompt,
      userMessage: params.question,
      temperature: 0.5
    });

    // If learning is enabled and we generated a good answer, suggest FAQ entry
    let suggestedFAQ: { question: string; answer: string; category: string } | undefined;
    
    if (params.shouldLearn && response.text.length > 50) {
      suggestedFAQ = {
        question: params.question,
        answer: response.text,
        category: 'general' // Could be AI-categorized
      };
    }

    return {
      ...response,
      suggestedFAQ
    };
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
            mimeType: "image/png"
          }
        }
      ]);

      const response = result.response;
      const responseText = response.text();
      const usage = response.usageMetadata;
      const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

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

  /**
   * Get available AI Brain tools for client reference
   */
  getAvailableTools(): string[] {
    return AI_BRAIN_TOOLS.map(t => t.name);
  }
}

// Export singleton instance - ONE brain for all features
export const geminiClient = new UnifiedGeminiClient();
