/**
 * HelpOS™ AI Intelligence Service
 * Client-pays-all model - AI costs are tracked and billed to the customer
 * Can be toggled on/off by support staff
 */

import OpenAI from "openai";

// Using AI Integrations service for OpenAI-compatible API access
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface HelpOSAIConfig {
  enabled: boolean;
  model: 'gpt-3.5-turbo' | 'gpt-4o-mini'; // Using cost-effective models
  maxTokens: number;
  temperature: number;
}

// Default configuration - using most cost-effective model
const defaultConfig: HelpOSAIConfig = {
  enabled: false, // Disabled by default - staff must enable
  model: 'gpt-3.5-turbo', // Cheapest model for basic chat support
  maxTokens: 500, // Keep responses concise to minimize costs
  temperature: 0.7 // Balanced creativity
};

// In-memory storage for AI toggle state (per workspace)
const aiEnabledMap = new Map<string, boolean>();

export class HelpOSAI {
  private config: HelpOSAIConfig;
  private workspaceId: string;

  constructor(workspaceId: string = 'default', config: Partial<HelpOSAIConfig> = {}) {
    this.workspaceId = workspaceId;
    this.config = {
      ...defaultConfig,
      ...config,
      enabled: aiEnabledMap.get(workspaceId) ?? defaultConfig.enabled
    };
  }

  /**
   * Toggle AI on/off (staff only)
   */
  toggleAI(enabled: boolean): boolean {
    this.config.enabled = enabled;
    aiEnabledMap.set(this.workspaceId, enabled);
    console.log(`🤖 HelpOS AI ${enabled ? 'ENABLED' : 'DISABLED'} for workspace: ${this.workspaceId}`);
    return this.config.enabled;
  }

  /**
   * Check if AI is currently enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Generate AI greeting for new user
   * Cost tracking: ~50-100 tokens per greeting (billed to customer)
   */
  async generateGreeting(userName: string, userType: string, context?: string): Promise<string | null> {
    if (!this.config.enabled) {
      return null; // AI disabled - return null to use fallback greeting
    }

    try {
      const prompt = `You are HelpOS™, a friendly AI support assistant for AutoForce™.

User just joined: ${userName} (${userType})
${context ? `Context: ${context}` : ''}

Generate a warm, professional greeting that:
1. Welcomes them by name
2. Acknowledges their user type (customer, subscriber, staff, etc.)
3. Offers to help and mentions the support team is available
4. Keep it under 30 words

Return ONLY the greeting text, no extra formatting.`;

      const completion = await openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      const greeting = completion.choices[0]?.message?.content?.trim();
      
      // Log token usage for billing tracking
      const tokensUsed = completion.usage?.total_tokens || 0;
      console.log(`💰 HelpOS AI - Greeting generated (${tokensUsed} tokens) - Workspace: ${this.workspaceId}`);

      return greeting || null;
    } catch (error) {
      console.error('HelpOS AI greeting failed:', error);
      return null; // Fallback to default greeting on error
    }
  }

  /**
   * Generate smart response suggestion for support staff
   * Cost tracking: ~100-300 tokens per response (billed to customer)
   */
  async generateResponseSuggestion(
    userMessage: string,
    chatHistory: Array<{ role: 'user' | 'assistant', content: string }>,
    userContext?: string
  ): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const systemPrompt = `You are HelpOS™, an AI assistant helping support staff respond to customers.

${userContext ? `Customer Context: ${userContext}` : ''}

Based on the conversation, suggest a helpful, professional response that:
1. Addresses the customer's question/issue directly
2. Is empathetic and professional
3. Provides actionable next steps when appropriate
4. Keeps it under 50 words

Return ONLY the suggested response text.`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.slice(-5).map(msg => ({ // Only last 5 messages to save tokens
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const completion = await openai.chat.completions.create({
        model: this.config.model,
        messages,
        max_completion_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      const response = completion.choices[0]?.message?.content?.trim();
      
      // Log token usage for billing
      const tokensUsed = completion.usage?.total_tokens || 0;
      console.log(`💰 HelpOS AI - Response suggested (${tokensUsed} tokens) - Workspace: ${this.workspaceId}`);

      return response || null;
    } catch (error) {
      console.error('HelpOS AI response suggestion failed:', error);
      return null;
    }
  }

  /**
   * Analyze message sentiment and urgency
   * Cost tracking: ~50-150 tokens per analysis (billed to customer)
   */
  async analyzeMessageUrgency(message: string): Promise<{ urgency: 'low' | 'medium' | 'high' | 'critical', reason: string } | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const prompt = `Analyze this customer message for urgency level:

"${message}"

Return JSON with:
{
  "urgency": "low" | "medium" | "high" | "critical",
  "reason": "brief explanation in 10 words or less"
}

Critical: security breach, data loss, system down, legal issue
High: can't login, payment failed, urgent deadline
Medium: feature not working, slow performance
Low: general question, feature request`;

      const completion = await openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 150,
        temperature: 0.3 // Lower temperature for more consistent analysis
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      // Log token usage
      const tokensUsed = completion.usage?.total_tokens || 0;
      console.log(`💰 HelpOS AI - Urgency analyzed (${tokensUsed} tokens) - Workspace: ${this.workspaceId}`);

      return result.urgency ? result : null;
    } catch (error) {
      console.error('HelpOS AI urgency analysis failed:', error);
      return null;
    }
  }

  /**
   * Get AI usage stats for billing (tokens used in current session)
   */
  getUsageStats(): { workspaceId: string, enabled: boolean, model: string } {
    return {
      workspaceId: this.workspaceId,
      enabled: this.config.enabled,
      model: this.config.model
    };
  }
}

// Export singleton instance for main workspace
export const mainHelpOSAI = new HelpOSAI('main');
