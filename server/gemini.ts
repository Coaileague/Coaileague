import { createLogger } from './lib/logger';
const log = createLogger('gemini');
import { GoogleGenerativeAI } from "@google/generative-ai";
import { aiMeteringService } from './services/billing/aiMeteringService';
import { withGemini } from './services/ai/aiCallWrapper';
// Use the canonical rich persona from trinityPersona — single source of truth.
// The previous thin "under-caffeinated engineer" string was a shadow copy that
// diverged from the authoritative 2,200-line persona. All Gemini calls now use
// the same identity Trinity uses in the full chat service.
import { PERSONA_SYSTEM_INSTRUCTION } from './services/ai-brain/trinityPersona';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  log.warn("⚠️ GEMINI_API_KEY not found - Gemini AI features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// TRINITY_PERSONA removed — now using PERSONA_SYSTEM_INSTRUCTION imported above.
// This eliminates the diverged copy that made Gemini quick-calls use a different
// voice/identity than Trinity's full chat sessions.

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
      systemInstruction: options.systemPrompt || PERSONA_SYSTEM_INSTRUCTION,
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
  } catch (error : unknown) {
    log.error("Gemini API error:", error);
    throw new Error(`AI assistant error: ${error.message || 'Unknown error'}`);
  }
}

export function isGeminiAvailable(): boolean {
  return !!genAI;
}
