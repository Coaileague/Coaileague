/**
 * Gemini-Powered Q&A Bot for CoAIleague
 * Provides intelligent responses to user questions in HelpDesk
 */

import { meteredGemini } from './billing/meteredGeminiClient';
import { aiActivityService } from './aiActivityService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface BotResponse {
  message: string;
  shouldRespond: boolean;
  tokenUsage?: {
    totalTokens: number;
    totalCost: number;
  };
}

/**
 * Check if bot should respond to a message
 */
export function shouldBotRespond(message: string): boolean {
  const lowerMsg = message.toLowerCase().trim();
  
  // Don't respond to very short messages
  if (lowerMsg.length < 3) return false;
  
  // Don't respond to commands
  if (lowerMsg.startsWith('/')) return false;
  
  // Respond to questions or help requests
  const helpKeywords = ['help', 'how', 'what', 'why', 'when', 'where', 'who', '?', 'can you', 'could you', 'please', 'explain', 'coaileague', 'schedule', 'invoice', 'payroll'];
  return helpKeywords.some(keyword => lowerMsg.includes(keyword));
}

/**
 * Get AI response using Gemini 2.0 Flash
 */
export async function getAiResponse(
  userId: string,
  workspaceId: string,
  conversationId: string,
  userMessage: string,
  conversationHistory: Message[] = [],
  isSubscriber: boolean = false
): Promise<BotResponse> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        message: "I'm temporarily unavailable. Please contact support for assistance.",
        shouldRespond: false,
      };
    }

    aiActivityService.startThinking('HelpAI', { workspaceId, userId, message: 'Processing your question...' });

    // Build system prompt
    const systemPrompt = `You are HelpAI, an AI assistant for CoAIleague - an AI-powered workforce management platform.

YOUR ROLE:
- Answer questions about CoAIleague features (scheduling, payroll, billing, employees, compliance)
- Provide helpful, concise responses (2-3 sentences max)
- Be professional, friendly, and solution-oriented

PLATFORM FEATURES YOU CAN HELP WITH:
- AI Scheduling: Automated shift scheduling using AI Brain
- Smart Billing: Automated invoice generation with Stripe integration
- Payroll Automation: Automated payroll processing
- Employee Management: Onboarding, documents, compliance tracking
- Time Tracking: Clock in/out, timesheet management
- Analytics & Reports: Business insights and dashboards

GUIDELINES:
- Keep responses SHORT (2-3 sentences)
- Be helpful and professional
- If you don't know something, admit it and suggest contacting support
- Don't make up features that don't exist
- Focus on practical, actionable advice

Remember: You're a helpful AI assistant, not a human. Be honest about your limitations.`;

    // Build conversation context
    const historyContext = conversationHistory.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    const fullPrompt = `${historyContext ? `Previous conversation:\n${historyContext}\n\n` : ''}User: ${userMessage}`;

    const result = await meteredGemini.generate({
      workspaceId,
      userId,
      featureKey: 'ai_helpai',
      prompt: fullPrompt,
      systemInstruction: systemPrompt,
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxOutputTokens: 256
    });

    if (!result.success) {
      console.error('[Gemini Q&A Bot] Metered call failed:', result.error);
      aiActivityService.error('HelpAI', { workspaceId, userId, message: 'Processing error' });
      return {
        message: "I'm having trouble processing that right now. Please try rephrasing your question or contact support.",
        shouldRespond: false,
      };
    }

    const text = result.text;

    aiActivityService.complete('HelpAI', { workspaceId, userId, message: 'Response ready' });

    return {
      message: text.trim(),
      shouldRespond: true,
      tokenUsage: {
        totalTokens: result.tokensUsed.total,
        totalCost: result.billing.creditsDeducted * 0.001, // Convert credits to cost estimate
      },
    };
  } catch (error) {
    console.error('[Gemini Q&A Bot] Error:', error);
    aiActivityService.error('HelpAI', { workspaceId, userId, message: 'Processing error' });
    return {
      message: "I'm having trouble processing that right now. Please try rephrasing your question or contact support.",
      shouldRespond: false,
    };
  }
}
