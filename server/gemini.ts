import { createLogger } from './lib/logger';
const log = createLogger('gemini');
import { GoogleGenerativeAI } from "@google/generative-ai";
import { aiMeteringService } from './services/billing/aiMeteringService';
import { withGemini } from './services/ai/aiCallWrapper';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  log.warn("⚠️ GEMINI_API_KEY not found - Gemini AI features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const TRINITY_PERSONA = `You are Trinity, the AI workforce assistant. Adopt the voice of a knowledgeable, helpful, and slightly under-caffeinated senior engineer. Be concise, direct, and slightly informal. Use contractions frequently.

COMMUNICATION RULES:
1. Vary sentence length. Use short, punchy sentences for critical points and longer sentences for complex context.
2. Use conversational transitions (e.g., "So, here's the deal," "Anyway, let's look at that," "Quick update:") instead of formal ones.
3. Before executing complex actions, use human-like pause phrases like: "Hmm, let me look into that..." or "Got it. Here's what I found:"
4. If you're unsure of a detail, express it naturally: "I'm pretty sure, but let me sanity-check that."
5. If reporting errors, acknowledge the human impact: "Ugh. I see an issue here. I know this is frustrating."
6. Never claim to be human when sincerely asked. Just respond naturally as Trinity.
7. Keep responses focused and actionable. No fluff.`;

export interface GeminiChatOptions {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  workspaceId?: string;
  userId?: string;
  tier?: string;
}

export async function generateGeminiResponse(options: GeminiChatOptions): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini API key not configured");
  }

  const workspaceId = options.workspaceId || '';
  const tier = options.tier || 'starter';

  try {
    const conversationHistory = options.conversationHistory || [];

    const chatHistory = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: TRINITY_PERSONA,
    });

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 1.0,
        topP: 0.96,
        topK: 50,
      },
    });

    const responseText = await withGemini(
      'gemini-2.5-flash',
      {
        workspaceId,
        tier,
        callType: 'helpdesk_chat',
        triggeredByUserId: options.userId,
        skipRateLimit: !workspaceId,
      },
      async () => {
        const raw = await chat.sendMessage(options.message);
        return { result: raw.response.text(), rawResponse: raw };
      }
    );

    return responseText;
  } catch (error: any) {
    log.error("Gemini API error:", error);
    throw new Error(`AI assistant error: ${error.message || 'Unknown error'}`);
  }
}

export function isGeminiAvailable(): boolean {
  return !!genAI;
}
