/**
 * Phase H — Bilingual EN/ES Translation Service
 * CoAIleague Legal/Safety Sprint
 *
 * Provides English ↔ Spanish translations for:
 * - Incident report narratives
 * - Post orders
 * - Employee communications
 * - Platform UI strings (static keys)
 *
 * Translation method: OpenAI GPT-4o-mini (Gemini fallback).
 * All AI translations carry the mandatory legal disclaimer.
 */

import { pool, db } from "../db";
import { getMeteredOpenAICompletion } from "./billing/universalAIBillingInterceptor";
import { meteredGemini } from "./billing/meteredGeminiClient";
import { typedPool, typedPoolExec } from '../lib/typedSql';
import { incidentReports } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('translationService');


async function logTranslationCost(workspaceId: string | undefined, userId: string | undefined, charCount: number) {
  if (!workspaceId) return;
  try {
    const costMicrocents = charCount * 20;
    // CATEGORY C — Raw SQL retained: Translation cost logging INSERT | Tables: external_cost_log | Verified: 2026-03-23
    await typedPoolExec(
      `INSERT INTO external_cost_log (workspace_id, user_id, service_name, call_type, units_consumed, cost_microcents, metadata)
       VALUES ($1, $2, 'deepl_translation', 'incident_translation', $3, $4, $5)`,
      [workspaceId, userId || null, charCount, costMicrocents, JSON.stringify({ char_count: charCount })]
    );
  } catch {}
}

export type SupportedLanguage = "en" | "es";

export const TRANSLATION_DISCLAIMER_EN =
  "AI-generated translation for reference only. Original text is the official record. Verify critical information with a certified translator.";

export const TRANSLATION_DISCLAIMER_ES =
  "Traducción generada por IA solo como referencia. El texto original es el registro oficial. Verifique información crítica con un traductor certificado.";

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  method: "openai" | "gemini" | "cache";
  disclaimer: string;
  translatedAt: string;
}

// ─── Core Translation Function ─────────────────────────────────────────────

export async function translateText(params: {
  text: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  workspaceId?: string;
  userId?: string;
  context?: string;
}): Promise<TranslationResult> {
  const { text, sourceLanguage, targetLanguage, workspaceId, userId, context } = params;

  if (sourceLanguage === targetLanguage) {
    return {
      originalText: text,
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      method: "cache",
      disclaimer: "",
      translatedAt: new Date().toISOString(),
    };
  }

  const langName = targetLanguage === "es" ? "Spanish (Latin American)" : "English";
  const sourceLangName = sourceLanguage === "en" ? "English" : "Spanish";

  const systemPrompt = `You are a professional translator specializing in security industry and law enforcement terminology. Translate the following ${sourceLangName} text to ${langName} with high accuracy. Preserve all names, numbers, dates, and proper nouns exactly. For security/legal terms, use standard industry terminology. Return ONLY the translated text with no preamble or explanation.${context ? `\n\nContext: ${context}` : ""}`;

  let translatedText = "";
  let method: TranslationResult["method"] = "openai";

  try {
    const result = await getMeteredOpenAICompletion({
      workspaceId,
      userId,
      featureKey: "translation",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      model: "gpt-4o-mini",
      maxTokens: Math.max(500, Math.ceil(text.length * 1.5)),
      temperature: 0.1,
    });

    if (result.success && result.content) {
      translatedText = result.content.trim();
    } else {
      throw new Error(result.error || "OpenAI translation failed");
    }
  } catch (openaiErr) {
    log.warn("[TranslationService] OpenAI failed, falling back to Gemini:", openaiErr);
    method = "gemini";
    try {
      const geminiResult = await meteredGemini.generate({
        workspaceId: workspaceId || "platform",
        userId: userId || "system",
        featureKey: "translation",
        prompt: `${systemPrompt}\n\nText to translate:\n${text}`,
      });
      translatedText = geminiResult.text.trim();
    } catch (geminiErr) {
      log.error("[TranslationService] Both translation providers failed:", geminiErr);
      throw new Error("Translation service temporarily unavailable. Please try again.");
    }
  }

  const disclaimer =
    targetLanguage === "es" ? TRANSLATION_DISCLAIMER_ES : TRANSLATION_DISCLAIMER_EN;

  logTranslationCost(workspaceId, userId, text.length).catch((err) => log.warn('[translationService] Fire-and-forget failed:', err));

  return {
    originalText: text,
    translatedText,
    sourceLanguage,
    targetLanguage,
    method,
    disclaimer,
    translatedAt: new Date().toISOString(),
  };
}

// ─── Translate Incident Report ─────────────────────────────────────────────

export async function translateIncidentReport(params: {
  reportId: string;
  workspaceId: string;
  targetLanguage: SupportedLanguage;
  userId?: string;
}): Promise<TranslationResult | null> {
  const { reportId, workspaceId, targetLanguage, userId } = params;

  const result = await typedPool(
    `SELECT id, raw_description, polished_description, original_language, translated_text, translation_method, translation_generated_at
     FROM incident_reports WHERE id = $1 AND workspace_id = $2`,
    [reportId, workspaceId]
  );
  if (!result.length) return null;

  const report = result[0];
  const originalLanguage: SupportedLanguage = (report.original_language as SupportedLanguage) || "en";
  const textToTranslate = report.polished_description || report.raw_description || "";

  if (!textToTranslate) return null;

  // Use cached translation if available and target matches stored language
  if (report.translated_text && report.translation_method && originalLanguage !== targetLanguage) {
    return {
      originalText: textToTranslate,
      translatedText: report.translated_text,
      sourceLanguage: originalLanguage,
      targetLanguage,
      method: "cache",
      disclaimer: targetLanguage === "es" ? TRANSLATION_DISCLAIMER_ES : TRANSLATION_DISCLAIMER_EN,
      translatedAt: report.translation_generated_at?.toISOString() || new Date().toISOString(),
    };
  }

  // Generate fresh translation
  const translation = await translateText({
    text: textToTranslate,
    sourceLanguage: originalLanguage,
    targetLanguage,
    workspaceId,
    userId,
    context: "Security incident report narrative",
  });

  // Converted to Drizzle ORM
  await db.update(incidentReports).set({
    translatedText: translation.translatedText,
    translationMethod: translation.method,
    translationGeneratedAt: sql`now()`,
    translationDisclaimer: translation.disclaimer,
  }).where(and(eq(incidentReports.id, reportId), eq(incidentReports.workspaceId, workspaceId)));

  return translation;
}

// ─── Supported Platform UI Strings (static translations) ──────────────────

export const UI_STRINGS: Record<string, { en: string; es: string }> = {
  "incident.report.title": { en: "Incident Report", es: "Informe de Incidente" },
  "incident.status.draft": { en: "Draft", es: "Borrador" },
  "incident.status.submitted": { en: "Submitted", es: "Enviado" },
  "incident.status.reviewed": { en: "Reviewed", es: "Revisado" },
  "shift.clock_in": { en: "Clock In", es: "Registrar Entrada" },
  "shift.clock_out": { en: "Clock Out", es: "Registrar Salida" },
  "emergency.call_911": { en: "Call 911 Immediately", es: "Llame al 911 Inmediatamente" },
  "emergency.panic_button": { en: "Emergency Panic Button", es: "Botón de Pánico de Emergencia" },
  "emergency.supervisor_notified": { en: "Your supervisor has been notified.", es: "Su supervisor ha sido notificado." },
  "compliance.license_required": { en: "Valid security license required", es: "Se requiere licencia de seguridad válida" },
  "disclaimer.translation": { en: TRANSLATION_DISCLAIMER_EN, es: TRANSLATION_DISCLAIMER_ES },
  "disclaimer.ai_content": {
    en: "AI-generated content for operational reference only. Not legal advice.",
    es: "Contenido generado por IA solo para referencia operativa. No es asesoramiento legal.",
  },
  "disclaimer.emergency": {
    en: "In any life-threatening emergency, call 911 directly.",
    es: "En cualquier emergencia que amenace la vida, llame al 911 directamente.",
  },
  "sos.protocol_initiated": { en: "Emergency protocol initiated", es: "Protocolo de emergencia iniciado" },
};

export function getUIString(key: string, language: SupportedLanguage = "en"): string {
  return UI_STRINGS[key]?.[language] ?? UI_STRINGS[key]?.["en"] ?? key;
}
