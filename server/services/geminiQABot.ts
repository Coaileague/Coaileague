/**
 * Gemini-Powered Q&A Bot for CoAIleague
 * Provides intelligent responses to user questions in HelpDesk
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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

    // Convert conversation history to Gemini format
    const chatHistory = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 256, // Keep responses concise
        temperature: 0.7,
      },
      systemInstruction: {
        parts: [{ text: systemPrompt }],
        role: 'user'
      }
    });

    const result = await chat.sendMessage(userMessage);
    const response = result.response;
    const text = response.text();

    // Estimate token usage (Gemini doesn't provide exact counts in response)
    const estimatedTokens = Math.ceil((userMessage.length + text.length) / 4);
    const costPerMillionTokens = 0.075; // Gemini 2.0 Flash pricing (very cheap!)
    const estimatedCost = (estimatedTokens / 1_000_000) * costPerMillionTokens;

    return {
      message: text.trim(),
      shouldRespond: true,
      tokenUsage: {
        totalTokens: estimatedTokens,
        totalCost: estimatedCost,
      },
    };
  } catch (error) {
    console.error('[Gemini Q&A Bot] Error:', error);
    return {
      message: "I'm having trouble processing that right now. Please try rephrasing your question or contact support.",
      shouldRespond: false,
    };
  }
}
