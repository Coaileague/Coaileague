// AI Bot service for HelpOS - greets and assists customers until human help arrives
// Subscriber-Pays Model: WorkforceOS subscribers pay for AI usage, we track costs and bill monthly
import OpenAI from "openai";
import { storage } from '../storage';

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

// Cost-efficient model for chat support (subscribers pay for usage)
const AI_MODEL = "gpt-4o-mini"; // Much cheaper than GPT-4/5, perfect for support chat

// Pricing per 1M tokens (USD) - Subscribers pay these costs
const PRICING = {
  "gpt-4o-mini": {
    input: 0.15,    // $0.15 per 1M input tokens
    output: 0.60    // $0.60 per 1M output tokens
  }
};

const FREE_GUEST_LIMIT = 3; // Free guests get 3 AI responses as trial

interface AiBotResponse {
  message: string;
  usageCount: number;
  limitReached: boolean;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalCost: number; // USD
  };
}

/**
 * Generate greeting message when user joins HelpDesk
 */
export async function generateGreeting(userName: string, isGuest: boolean): Promise<string> {
  if (isGuest) {
    return `👋 Welcome to HelpDesk, ${userName}! I'm HelpOS™, your AI assistant. I can help answer questions while you wait for our team. You have ${FREE_GUEST_LIMIT} free AI responses to try out our service!`;
  }
  
  return `👋 Welcome back to HelpDesk, ${userName}! I'm HelpOS™, your AI assistant, ready to help with any questions about WorkforceOS.`;
}

/**
 * Generate staff introduction announcement (MACRO)
 * When support staff initiates help with a user, bot announces their arrival
 * This gives staff time to prepare while bot handles the initial greeting
 */
export async function generateStaffIntroduction(staffName: string, customerName: string): Promise<string> {
  return `📢 Support staff ${staffName} is now ready to help you${customerName ? `, ${customerName}` : ''}! Please provide your full name and organization ID so we can assist you better. 🙌`;
}

/**
 * Calculate cost in USD based on token usage
 */
function calculateCost(promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[AI_MODEL];
  const promptCost = (promptTokens / 1_000_000) * pricing.input;
  const completionCost = (completionTokens / 1_000_000) * pricing.output;
  return promptCost + completionCost;
}

/**
 * Get AI response to user question with tier-based limits and cost tracking
 */
export async function getAiResponse(
  userId: string,
  workspaceId: string,
  conversationId: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>,
  isSubscriber: boolean
): Promise<AiBotResponse> {
  
  // Check usage limits for free guests
  const usageCount = await storage.getAiUsageCount(userId);
  
  if (!isSubscriber && usageCount >= FREE_GUEST_LIMIT) {
    return {
      message: `🎯 You've used all ${FREE_GUEST_LIMIT} free AI responses! Want unlimited AI support? Subscribe to WorkforceOS or contact our team directly - a human will assist you shortly!`,
      usageCount,
      limitReached: true
    };
  }

  try {
    // Generate AI response using cost-efficient GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a helpful AI assistant for WorkforceOS HelpOS™. WorkforceOS is an elite workforce management platform that automates HR functions including time tracking, payroll, scheduling, hiring, and analytics.

Be friendly, professional, and concise. If you don't know something specific about WorkforceOS features, be honest and suggest they speak with a team member.

Key features you can mention:
- Time Tracking & Invoicing (TrackOS™, BillOS™)
- Smart Scheduling with AI auto-scheduling (ScheduleOS™)
- Employee Onboarding (HireOS™)
- Payroll Management (PayrollOS™)
- Report Management (ReportOS™)
- Analytics Dashboard (AnalyticsOS™)
- Live Support Chat (HelpOS™)
- Multi-tenant workspaces
- Role-based access control

Keep responses under 150 words.`
        },
        ...conversationHistory,
        {
          role: "user",
          content: userMessage
        }
      ],
      max_completion_tokens: 300,
      temperature: 0.7
    });

    const aiMessage = completion.choices[0]?.message?.content || "I'm having trouble responding right now. Please try again or contact our team.";
    
    // Extract token usage for cost calculation
    const usage = completion.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const totalCost = calculateCost(promptTokens, completionTokens);
    
    // Log AI usage for subscriber billing (they pay, we don't)
    const billingMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    await storage.logAiUsage({
      conversationId,
      workspaceId,
      userId,
      messageId: null, // Will be set after message is saved
      requestType: 'question',
      model: AI_MODEL,
      promptTokens,
      completionTokens,
      totalTokens,
      promptCost: ((promptTokens / 1_000_000) * PRICING[AI_MODEL].input).toString(),
      completionCost: ((completionTokens / 1_000_000) * PRICING[AI_MODEL].output).toString(),
      totalCost: totalCost.toString(),
      userTier: isSubscriber ? 'subscriber' : 'free_guest',
      usageCount: usageCount + 1,
      billingMonth
    });
    
    // Increment usage count for free guests
    if (!isSubscriber) {
      await storage.incrementAiUsage(userId);
    }

    const newUsageCount = isSubscriber ? 0 : usageCount + 1;
    const remaining = isSubscriber ? Infinity : FREE_GUEST_LIMIT - newUsageCount;
    
    // Add usage reminder for free guests
    let responseMessage = aiMessage;
    if (!isSubscriber && remaining > 0 && remaining <= 2) {
      responseMessage += `\n\n💡 ${remaining} free AI response${remaining === 1 ? '' : 's'} remaining. Subscribe for unlimited!`;
    }

    return {
      message: responseMessage,
      usageCount: newUsageCount,
      limitReached: false,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens,
        totalCost
      }
    };

  } catch (error) {
    console.error('AI Bot error:', error);
    return {
      message: "I'm experiencing technical difficulties. Our team will assist you shortly!",
      usageCount,
      limitReached: false
    };
  }
}

/**
 * Detect if message is asking for AI help or should trigger bot response
 */
export function shouldBotRespond(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Keywords that trigger bot response
  const triggers = [
    'help', 'question', 'what is', 'how do', 'can you',
    'tell me', 'explain', 'pricing', 'features', 'cost',
    'workforceos', 'workforce', 'schedule', 'payroll', 'time tracking'
  ];
  
  return triggers.some(trigger => lowerMessage.includes(trigger));
}
