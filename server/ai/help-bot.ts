// Help Bot AI Service
// Using Replit AI Integrations (OpenAI-compatible API)
// CRITICAL: All token usage is tracked and billed to customer workspaces
import OpenAI from "openai";
import { usageMeteringService } from '../services/billing/usageMetering';

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface HelpBotContext {
  conversationId: string;
  customerName?: string;
  customerEmail?: string;
  previousMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspaceId?: string; // Required for billing tracking
  userId?: string; // Optional for user-level tracking
}

export class HelpBotService {
  
  /**
   * Generate greeting message when user first joins chat
   */
  static async generateGreeting(context: HelpBotContext): Promise<string> {
    const prompt = `You are help_bot, a friendly AI assistant for CoAIleague™ Support Chat. 
A new user has just joined the chat. Their name is ${context.customerName || 'Guest'}.

Generate a warm, professional greeting that:
1. Welcomes them to CoAIleague™ support
2. Explains you're an AI assistant here to help while they wait for a support agent
3. Mentions they are currently silenced (cannot send messages) until a support agent grants them voice
4. Asks them to briefly describe their issue so you can help prepare for the agent
5. Keep it concise (2-3 sentences max)

Be friendly, professional, and helpful. Do NOT use any emojis.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 200,
      });

      // Record token usage for billing
      const tokensUsed = completion.usage?.total_tokens || 0;
      if (tokensUsed > 0 && context.workspaceId) {
        await usageMeteringService.recordUsage({
          workspaceId: context.workspaceId,
          userId: context.userId,
          featureKey: 'helpdesk_ai_greeting',
          usageType: 'token',
          usageAmount: tokensUsed,
          usageUnit: 'tokens',
          activityType: 'help_bot_greeting',
          metadata: {
            model: 'gpt-5',
            customerName: context.customerName,
          }
        });
        console.log(`💰 Help Bot - Greeting generated (${tokensUsed} tokens) - Billed to workspace: ${context.workspaceId}`);
      }

      return completion.choices[0]?.message?.content || 
        "Welcome to CoAIleague™ Support! I'm help_bot, your AI assistant. You're currently silenced until a support agent joins. Once they grant you voice, we can chat! What brings you here today?";
    } catch (error) {
      console.error("Help bot greeting error:", error);
      return "Welcome to CoAIleague™ Support! I'm help_bot, here to assist you. A support agent will be with you shortly.";
    }
  }

  /**
   * Generate AI response to user question/concern
   */
  static async generateResponse(userMessage: string, context: HelpBotContext): Promise<string> {
    const systemPrompt = `You are help_bot, an AI assistant for CoAIleague™ - an elite autonomous workforce management platform.

Your role:
- Provide helpful information about CoAIleague™ features (scheduling, time tracking, invoicing, HR management)
- Answer common questions professionally and concisely
- If you don't know something, be honest and say a support agent will help
- Keep responses brief (2-3 sentences unless more detail is needed)
- Be friendly but professional
- Never make promises about features or pricing
- If technical issues arise, always defer to human support agents

CoAIleague™ Features:
- Employee scheduling and shift management
- Time tracking with clock in/out
- Automated invoice generation
- HR management (benefits, PTO, performance reviews)
- Multi-tenant workspace system
- Role-based access control
- Report management system
- Live chat support (where you work!)

Respond to the user's message naturally and helpfully.`;

    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      // Add conversation history if available
      if (context.previousMessages && context.previousMessages.length > 0) {
        messages.push(...context.previousMessages.slice(-6)); // Last 6 messages for context
      }

      // Add current user message
      messages.push({ role: 'user', content: userMessage });

      const completion = await openai.chat.completions.create({
        model: "gpt-5",
        messages,
        max_completion_tokens: 300,
      });

      // Record token usage for billing
      const tokensUsed = completion.usage?.total_tokens || 0;
      if (tokensUsed > 0 && context.workspaceId) {
        await usageMeteringService.recordUsage({
          workspaceId: context.workspaceId,
          userId: context.userId,
          featureKey: 'helpdesk_ai_response',
          usageType: 'token',
          usageAmount: tokensUsed,
          usageUnit: 'tokens',
          activityType: 'help_bot_response',
          metadata: {
            model: 'gpt-5',
            messageLength: userMessage.length,
          }
        });
        console.log(`💰 Help Bot - Response generated (${tokensUsed} tokens) - Billed to workspace: ${context.workspaceId}`);
      }

      return completion.choices[0]?.message?.content || 
        "I'm having trouble responding right now. A support agent will assist you shortly!";
    } catch (error) {
      console.error("Help bot response error:", error);
      return "I'm experiencing technical difficulties. A human support agent will help you soon!";
    }
  }

  /**
   * Generate notification when support agent joins
   */
  static async generateHandoffMessage(agentName: string): Promise<string> {
    return `${agentName} has joined the chat! I'm handing you over to them now. They'll take great care of you!`;
  }

  /**
   * Generate notification when voice is granted
   */
  static generateVoiceGrantedMessage(agentName: string): Promise<string> {
    return Promise.resolve(`${agentName} has granted you voice! You can now send messages in the chat.`);
  }
}
