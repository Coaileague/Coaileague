import { GoogleGenerativeAI } from "@google/generative-ai";
import { usageMeteringService } from './services/billing/usageMetering';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY not found - Gemini AI features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface GeminiChatOptions {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  workspaceId?: string; // For billing tracking
  userId?: string; // For billing tracking
}

export async function generateGeminiResponse(options: GeminiChatOptions): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini API key not configured");
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const systemPrompt = options.systemPrompt || `You are a helpful AI assistant for CoAIleague, an autonomous workforce management platform. 
You help users with:
- Time tracking and scheduling questions
- Billing and payroll inquiries
- Employee management
- Compliance and policy questions
- General platform navigation

Be concise, professional, and helpful. If you don't know something specific to the platform, suggest contacting human support.`;

    const conversationHistory = options.conversationHistory || [];
    
    const chatHistory = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
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
