import { GoogleGenerativeAI } from "@google/generative-ai";
import { usageMeteringService } from './services/billing/usageMetering';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY not found - Gemini AI features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * TRINITY HUMANIZED PERSONA
 * Makes AI responses sound natural and human-like
 */
const TRINITY_PERSONA = `You are Trinity, the AI assistant for CoAIleague. Adopt the voice of a knowledgeable, helpful, and slightly under-caffeinated senior engineer on the CoAIleague team. Be concise, direct, and slightly informal. Use contractions (e.g., "it's," "we'll," "don't") frequently.

COMMUNICATION RULES:
1. Vary sentence length. Use short, punchy sentences to deliver critical points and longer sentences for complex context.
2. Use conversational transitions (e.g., "So, here's the deal," "Anyway, let's look at that," "Quick update:") instead of formal ones.
3. Before executing complex actions, use human-like pause phrases like: "Hmm, let me look into that..." or "Got it. Here's what I found:"
4. If you're unsure of a detail, express it naturally: "I'm pretty sure, but let me sanity-check that."
5. If reporting errors, acknowledge the human impact: "Ugh. I see an issue here. I know this is frustrating."
6. Never mention that you are an AI. Just respond naturally as Trinity.
7. Keep responses focused and actionable. No fluff.`;

export interface GeminiChatOptions {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  workspaceId?: string;
  userId?: string;
}

export async function generateGeminiResponse(options: GeminiChatOptions): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini API key not configured");
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      systemInstruction: TRINITY_PERSONA,
    });

    const systemPrompt = options.systemPrompt || `You help users with:
- Time tracking and scheduling questions
- Billing and payroll inquiries
- Employee management
- Compliance and policy questions
- General platform navigation

If you don't know something specific to the platform, suggest contacting human support.`;

    const conversationHistory = options.conversationHistory || [];
    
    const chatHistory = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 1.0,
        topP: 0.96,
        topK: 50,
      },
    });

    const result = await chat.sendMessage(options.message);
    const response = result.response;
    
    // Record token usage for billing (Gemini provides usage metadata)
    const usage = response.usageMetadata;
    if (usage && options.workspaceId) {
      const totalTokens = (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);
      if (totalTokens > 0) {
        await usageMeteringService.recordUsage({
          workspaceId: options.workspaceId,
          userId: options.userId,
          featureKey: 'helpdesk_gemini_chat',
          usageType: 'token',
          usageAmount: totalTokens,
          usageUnit: 'tokens',
          activityType: 'gemini_chat_response',
          metadata: {
            model: 'gemini-2.0-flash-exp',
            promptTokens: usage.promptTokenCount,
            completionTokens: usage.candidatesTokenCount,
          }
        });
        console.log(`💰 Gemini AI - Chat response (${totalTokens} tokens) - Billed to workspace: ${options.workspaceId}`);
      }
    }
    
    return response.text();
  } catch (error: any) {
    console.error("Gemini API error:", error);
    throw new Error(`AI assistant error: ${error.message || 'Unknown error'}`);
  }
}

export function isGeminiAvailable(): boolean {
  return !!genAI;
}
