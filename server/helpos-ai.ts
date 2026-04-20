/**
 * HelpAI Intelligence Service
 * Client-pays-all model - AI costs are tracked and billed to the customer
 * Can be toggled on/off by support staff
 * ALL billing routed through universal aiTokenGateway - ZERO TOKEN LOSS
 */

import { getMeteredOpenAICompletion } from './services/billing/universalAIBillingInterceptor';
import { createLogger } from './lib/logger';
const log = createLogger('helposAI');


export interface HelpAIConfig {
  enabled: boolean;
  model: 'gpt-3.5-turbo' | 'gpt-4o-mini'; // Using cost-effective models
  maxTokens: number;
  temperature: number;
}

// Default configuration - using most cost-effective model
const defaultConfig: HelpAIConfig = {
  enabled: false, // Disabled by default - staff must enable
  model: 'gpt-3.5-turbo', // Cheapest model for basic chat support
  maxTokens: 500, // Keep responses concise to minimize costs
  temperature: 0.7 // Balanced creativity
};

// In-memory storage for AI toggle state (per workspace)
const aiEnabledMap = new Map<string, boolean>();

export class HelpAIService {
  private config: HelpAIConfig;
  private workspaceId: string;

  constructor(workspaceId: string = 'default', config: Partial<HelpAIConfig> = {}) {
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
    log.info(`[HelpAI] ${enabled ? 'ENABLED' : 'DISABLED'} for workspace: ${this.workspaceId}`);
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
      const prompt = `You are HelpAI, a friendly AI support assistant for CoAIleague.

User just joined: ${userName} (${userType})
${context ? `Context: ${context}` : ''}

Generate a warm, professional greeting that:
1. Welcomes them by name
2. Acknowledges their user type (customer, subscriber, staff, etc.)
3. Offers to help and mentions the support team is available
4. Keep it under 30 words

Return ONLY the greeting text, no extra formatting.`;

      const result = await getMeteredOpenAICompletion({
        workspaceId: this.workspaceId,
        featureKey: 'helpdesk_ai_greeting',
        messages: [{ role: 'user', content: prompt }],
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      if (result.blocked) {
        log.warn(`[HelpAI] Greeting blocked: ${result.error}`);
        return null;
      }

      if (result.success && result.content) {
        log.info(`[HelpAI] Greeting generated (${result.tokensUsed} tokens) - Billed to workspace: ${this.workspaceId}`);
        return result.content.trim();
      }

      return null;
    } catch (error) {
      log.error('[HelpAI] Greeting failed:', error);
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
      const systemPrompt = `You are HelpAI, an AI assistant helping support staff respond to customers.

${userContext ? `Customer Context: ${userContext}` : ''}

Based on the conversation, suggest a helpful, professional response that:
1. Addresses the customer's question/issue directly
2. Is empathetic and professional
3. Provides actionable next steps when appropriate
4. Keeps it under 50 words

Return ONLY the suggested response text.`;

      const allMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...chatHistory.slice(-5).map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        { role: 'user' as const, content: userMessage }
      ];

      const result = await getMeteredOpenAICompletion({
        workspaceId: this.workspaceId,
        featureKey: 'helpdesk_ai_response',
        messages: allMessages,
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      if (result.blocked) {
        log.warn(`[HelpAI] Response suggestion blocked: ${result.error}`);
        return null;
      }

      if (result.success && result.content) {
        log.info(`[HelpAI] Response suggested (${result.tokensUsed} tokens) - Billed to workspace: ${this.workspaceId}`);
        return result.content.trim();
      }

      return null;
    } catch (error) {
      log.error('[HelpAI] Response suggestion failed:', error);
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

      const aiResult = await getMeteredOpenAICompletion({
        workspaceId: this.workspaceId,
        featureKey: 'helpdesk_ai_analysis',
        messages: [{ role: 'user', content: prompt }],
        model: this.config.model,
        maxTokens: 150,
        temperature: 0.3,
        jsonMode: true,
      });

      if (aiResult.blocked) {
        log.warn(`[HelpAI] Urgency analysis blocked: ${aiResult.error}`);
        return null;
      }

      if (aiResult.success && aiResult.content) {
        const parsed = JSON.parse(aiResult.content);
        log.info(`[HelpAI] Urgency analyzed (${aiResult.tokensUsed} tokens) - Billed to workspace: ${this.workspaceId}`);
        return parsed.urgency ? parsed : null;
      }

      return null;
    } catch (error) {
      log.error('[HelpAI] Urgency analysis failed:', error);
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
export const mainHelpAI = new HelpAIService('main');
