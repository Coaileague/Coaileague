// AI Bot service for HelpDesk - greets and assists customers until human help arrives
// Uses Replit AI Integrations (OpenAI-compatible) - no API key needed, charges to Replit credits
import OpenAI from "openai";
import { storage } from '../storage';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

const FREE_GUEST_LIMIT = 3; // Free guests get 3 AI responses as trial

interface AiBotResponse {
  message: string;
  usageCount: number;
  limitReached: boolean;
}

/**
 * Generate greeting message when user joins HelpDesk
 */
export async function generateGreeting(userName: string, isGuest: boolean): Promise<string> {
  if (isGuest) {
    return `👋 Welcome ${userName}! I'm your AI assistant. I can help answer questions while you wait for our team. You have ${FREE_GUEST_LIMIT} free AI responses to try out our service!`;
  }
  
  return `👋 Welcome back ${userName}! I'm your AI assistant, ready to help with any questions about WorkforceOS.`;
}

/**
 * Get AI response to user question with tier-based limits
 */
export async function getAiResponse(
  userId: string,
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
    // Generate AI response using GPT-5
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a helpful AI assistant for WorkforceOS HelpDesk. WorkforceOS is an elite workforce management platform that automates HR functions including time tracking, payroll, scheduling, hiring, and analytics.

Be friendly, professional, and concise. If you don't know something specific about WorkforceOS features, be honest and suggest they speak with a team member.

Key features you can mention:
- Time Tracking & Invoicing
- Smart Scheduling with AI auto-scheduling
- Employee Onboarding (HireOS)
- Payroll Management
- Analytics Dashboard
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
      limitReached: false
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
