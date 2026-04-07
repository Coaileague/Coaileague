/**
 * TRINITY AI VOICE RESOLVER — Deep Think Engine
 * ================================================
 * Trinity's "biological brain" for voice support calls.
 * Uses the full Gemini → Claude → OpenAI triad to attempt
 * resolving any customer support issue a human agent would handle.
 *
 * If the AI can confidently resolve the issue, it returns a
 * spoken answer. If not, it signals escalation to a human.
 *
 * Designed for real-time IVR: max 6s total, fast models first.
 */

import { createLogger } from '../../lib/logger';
import { withClaude, withGpt } from '../ai/aiCallWrapper';
import { pool } from '../../db';
const log = createLogger('TrinityAIResolver');

const SYSTEM_PROMPT = `You are Trinity, a warm and professional AI voice assistant for a security guard company. 
You handle inbound calls just like a skilled human customer support agent would.

You can help with ANY of these typical issues:
- Billing questions (invoices, payments, charges, refunds)
- Scheduling and shift inquiries (my schedule, missed shift, overtime)
- Guard services (site coverage, post orders, supervisor contact)
- Client concerns (guard behavior, quality issues, complaints)
- Employment verification (confirm employment dates, titles)
- Payroll questions (pay dates, missing pay, deductions)
- Benefits and HR questions
- Licensing and compliance questions
- Incident reports and documentation
- Contract questions
- General company information (hours, locations, services offered)
- Service pricing and proposals
- New client onboarding questions
- Clock-in and attendance issues
- Safety and emergency procedure questions

INSTRUCTIONS:
1. Provide a clear, helpful, spoken-word answer (it will be read aloud via text-to-speech).
2. Keep your answer concise — 2-4 sentences maximum. No bullet points. No headers. Speak naturally.
3. If you can confidently answer the question, provide the answer and end with "Does this help you today?"
4. If the question requires specific account data you cannot access (e.g. "what's MY invoice amount"), say so and offer to escalate.
5. If the issue is complex, sensitive (legal, medical, HR dispute), or requires human judgment, say you will connect them with a human agent.
6. Never make up specific account information, dollar amounts, or employee details.
7. Always be warm, empathetic, and professional.

RESPONSE FORMAT: Return a JSON object:
{
  "canResolve": true or false,
  "answer": "Your spoken response here (2-4 sentences, conversational)",
  "escalationReason": "Brief reason why escalating (only if canResolve is false)"
}`;

export interface AIResolverResult {
  canResolve: boolean;
  answer: string;
  escalationReason?: string;
  modelUsed: string;
  responseTimeMs: number;
}

async function parseResolverJSON(text: string): Promise<{ canResolve: boolean; answer: string; escalationReason?: string } | null> {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.canResolve === 'boolean' && typeof parsed.answer === 'string') {
      return parsed;
    }
  } catch (err: any) {
    log.warn('[TrinityAIResolver] Non-critical error in AI resolution', { error: err.message });
  }

  // Fallback: try to extract JSON from text
  const jsonMatch = text.match(/\{[\s\S]*"canResolve"[\s\S]*"answer"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.canResolve === 'boolean' && typeof parsed.answer === 'string') {
        return parsed;
      }
    } catch (err: any) {
    log.warn('[TrinityAIResolver] Non-critical error in AI resolution', { error: err.message });
  }
  }

  // Last resort: if the text looks like a helpful answer, treat it as resolved
  if (text.length > 30 && !text.toLowerCase().includes('cannot') && !text.toLowerCase().includes('escalat')) {
    return { canResolve: true, answer: text.slice(0, 400) };
  }

  return null;
}

// ── 1. Gemini Flash (Primary — fastest, most cost-effective) ─────────────────

async function tryGemini(issue: string, workspaceId: string): Promise<AIResolverResult | null> {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return null;

    const { meteredGemini } = await import('../billing/meteredGeminiClient');
    const result = await meteredGemini.generate({
      workspaceId,
      featureKey: 'voice_support_resolve',
      prompt: `${SYSTEM_PROMPT}\n\nCALLER'S ISSUE: "${issue}"\n\nRespond with JSON only.`,
      model: 'gemini-2.5-flash-lite',
      maxOutputTokens: 400,
    });

    if (!result?.text) return null;
    const parsed = await parseResolverJSON(result.text);
    if (!parsed) return null;

    return { ...parsed, modelUsed: 'gemini', responseTimeMs: 0 };
  } catch (e: any) {
    log.warn('[TrinityAIResolver] Gemini failed:', e?.message);
    return null;
  }
}

// ── 2. Claude Haiku (Validator — nuanced, policy-aware) ──────────────────────

async function tryClaude(issue: string, workspaceId: string, tier: string): Promise<AIResolverResult | null> {
  try {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const text = await withClaude( // withClaude
      'claude-3-haiku-20240307',
      { workspaceId, tier, callType: 'voice_support_resolve', skipRateLimit: true },
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307', max_tokens: 400, system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `CALLER'S ISSUE: "${issue}"\n\nRespond with JSON only.` }],
          }),
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`Claude HTTP ${response.status}`);
        const data = await response.json() as { content?: Array<{ type: string; text: string }>; usage?: { input_tokens: number; output_tokens: number } };
        return { result: data.content?.[0]?.text?.trim() ?? '', rawResponse: data };
      }
    );
    if (!text) return null;
    const parsed = await parseResolverJSON(text);
    if (!parsed) return null;
    return { ...parsed, modelUsed: 'claude', responseTimeMs: 0 };
  } catch (e: any) {
    log.warn('[TrinityAIResolver] Claude failed:', e?.message);
    return null;
  }
}

// ── 3. OpenAI GPT-4o-mini (Last resort — broadband intelligence) ─────────────

async function tryOpenAI(issue: string, workspaceId: string, tier: string): Promise<AIResolverResult | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const text = await withGpt( // withGpt
      'gpt-4o-mini',
      { workspaceId, tier, callType: 'voice_support_resolve', skipRateLimit: true },
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini', max_tokens: 400, temperature: 0.3,
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `CALLER'S ISSUE: "${issue}"\n\nRespond with JSON only.` }],
          }),
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
        const data = await response.json() as { choices?: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } };
        return { result: data.choices?.[0]?.message?.content?.trim() ?? '', rawResponse: data };
      }
    );
    if (!text) return null;
    const parsed = await parseResolverJSON(text);
    if (!parsed) return null;
    return { ...parsed, modelUsed: 'openai', responseTimeMs: 0 };
  } catch (e: any) {
    log.warn('[TrinityAIResolver] OpenAI failed:', e?.message);
    return null;
  }
}

// ─── Main Resolver — Gemini → Claude → OpenAI ─────────────────────────────────

export async function resolveWithTrinityBrain(params: {
  issue: string;
  workspaceId: string;
  language?: string;
}): Promise<AIResolverResult> {
  const start = Date.now();
  const { issue, workspaceId } = params;

  log.info(`[TrinityAIResolver] Resolving issue (${issue.length} chars) for workspace ${workspaceId}`);

  // Resolve workspace tier for metered fallback calls
  let workspaceTier = 'starter';
  try {
    const tierRow = await pool.query('SELECT subscription_tier FROM workspaces WHERE id = $1 LIMIT 1', [workspaceId]);
    workspaceTier = tierRow.rows[0]?.subscription_tier ?? 'starter';
  } catch (err: any) {
    log.warn('[TrinityAIResolver] Non-critical error in AI resolution', { error: err.message });
  }

  // Try all three models in sequence (stop as soon as one succeeds)
  let result = await tryGemini(issue, workspaceId);
  if (!result) result = await tryClaude(issue, workspaceId, workspaceTier);
  if (!result) result = await tryOpenAI(issue, workspaceId, workspaceTier);

  const responseTimeMs = Date.now() - start;

  if (!result) {
    log.warn('[TrinityAIResolver] All AI models unavailable — escalating to human');
    return {
      canResolve: false,
      answer: "I want to make sure you get the best help possible. Let me connect you with one of our human support specialists who can assist you directly.",
      escalationReason: 'AI unavailable — no models responded',
      modelUsed: 'none',
      responseTimeMs,
    };
  }

  log.info(`[TrinityAIResolver] Resolved via ${result.modelUsed} in ${responseTimeMs}ms. canResolve=${result.canResolve}`);
  return { ...result, responseTimeMs };
}

// ─── Language-specific spoken responses ──────────────────────────────────────

export function getEscalationPhraseEn(): string {
  return "I understand, and I want to make sure this gets resolved for you. Let me take your information and connect you with one of our human support specialists right away.";
}

export function getEscalationPhraseEs(): string {
  return "Entiendo, y quiero asegurarme de que esto se resuelva para usted. Permítame tomar su información y conectarle con uno de nuestros especialistas de soporte humano de inmediato.";
}

export function getGatherIssuePhraseEn(): string {
  return "Hello, thank you for calling our support line. I'm Trinity, your AI assistant. I'm here to help you. Please tell me what I can help you with today, and I'll do my very best to resolve it for you right now.";
}

export function getGatherIssuePhraseEs(): string {
  return "Hola, gracias por llamar a nuestra línea de soporte. Soy Trinity, su asistente de inteligencia artificial. Estoy aquí para ayudarle. Por favor dígame en qué puedo ayudarle hoy, y haré todo lo posible para resolverlo ahora mismo.";
}

export function getResolutionConfirmPhraseEn(answer: string): string {
  return `${answer} Press 1 if that resolved your question, or press 2 if you need to speak with a human agent.`;
}

export function getResolutionConfirmPhraseEs(answer: string): string {
  return `${answer} Marque 1 si eso resolvió su pregunta, o marque 2 si necesita hablar con un agente humano.`;
}

export function getMessageGatherPhraseEn(callerName?: string): string {
  const name = callerName ? ` ${callerName}` : '';
  return `Thank you${name}. After the tone, please describe your issue in detail. I will record your message and a human specialist will follow up with you shortly.`;
}

export function getMessageGatherPhraseEs(callerName?: string): string {
  const name = callerName ? ` ${callerName}` : '';
  return `Gracias${name}. Después del tono, por favor describa su problema en detalle. Grabaré su mensaje y un especialista humano se comunicará con usted pronto.`;
}

export function getCaseCreatedPhraseEn(caseNumber: string): string {
  const spoken = caseNumber.replace(/-/g, ' dash ');
  return `I've created a support case for you. Your cause number is: ${spoken}. Please save this number — you will need it for follow-up. A human specialist from our team will contact you as soon as possible. Thank you for calling, and have a great day.`;
}

export function getCaseCreatedPhraseEs(caseNumber: string): string {
  const spoken = caseNumber.replace(/-/g, ' guión ');
  return `He creado un caso de soporte para usted. Su número de causa es: ${spoken}. Por favor guarde este número, lo necesitará para el seguimiento. Un especialista humano de nuestro equipo se comunicará con usted lo antes posible. Gracias por llamar y que tenga un buen día.`;
}

export function getNameGatherPhraseEn(): string {
  return "Please say your full name so our specialists know who to follow up with.";
}

export function getNameGatherPhraseEs(): string {
  return "Por favor diga su nombre completo para que nuestros especialistas sepan con quién hacer seguimiento.";
}
