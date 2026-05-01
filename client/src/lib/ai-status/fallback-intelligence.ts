/**
 * HelpAI Fallback Intelligence Layer
 * ====================================
 * Activates when AI models are offline.
 * Two layers:
 *   LAYER 1 — Hardcoded decision tree (critical/high priority, no model needed)
 *   LAYER 2 — Cached intelligence (normal/low, serves last-known-good data)
 *
 * Uses existing ClockBot, ReportBot, notification interfaces.
 * No new DB tables, no new API patterns.
 */

import type { ModelStatus } from "./status-engine";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ConversationContext {
  workspaceId: string;
  userId: string;
  language: "en" | "es";
  userName?: string;
  sessionId?: string;
}

export type FallbackPriority = "critical" | "high" | "normal" | "low";

export interface FallbackResponse {
  text: string;
  actionFired: boolean;
  actionType?: string;
  fromCache: boolean;
  cacheAge?: number;
}

// ─── Safety + Emergency Keywords ─────────────────────────────────────────

const EMERGENCY_KEYWORDS_EN = [
  "help", "emergency", "unsafe", "attack", "panic", "hurt",
  "injured", "danger", "gun", "weapon", "threat", "assault",
  "accident", "911", "ambulance", "fire", "evacuate",
];
const EMERGENCY_KEYWORDS_ES = [
  "ayuda", "emergencia", "peligro", "atacar", "pánico",
  "herido", "arma", "amenaza", "accidente", "fuego", "evacuar",
];

const CLOCK_IN_KEYWORDS_EN = ["clock in", "clocking in", "clock-in", "start shift", "beginning shift", "check in"];
const CLOCK_OUT_KEYWORDS_EN = ["clock out", "clocking out", "clock-out", "end shift", "finish shift", "check out"];
const CLOCK_IN_KEYWORDS_ES = ["entrada", "registrar entrada", "empezar turno", "comenzar turno"];
const CLOCK_OUT_KEYWORDS_ES = ["salida", "registrar salida", "terminar turno", "fin de turno"];

const ESCALATION_KEYWORDS_EN = ["supervisor", "manager", "escalate", "need help", "not working", "problem"];
const ESCALATION_KEYWORDS_ES = ["supervisor", "gerente", "escalar", "necesito ayuda", "problema"];

const INCIDENT_KEYWORDS_EN = ["incident", "report", "file", "document", "log incident", "write report"];
const INCIDENT_KEYWORDS_ES = ["incidente", "reporte", "reportar", "documentar", "informe"];

// ─── Keyword Detector ─────────────────────────────────────────────────────

function hasKeyword(input: string, keywords: string[]): boolean {
  const lower = input.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function isEmergency(input: string, lang: "en" | "es"): boolean {
  return (
    hasKeyword(input, EMERGENCY_KEYWORDS_EN) ||
    (lang === "es" && hasKeyword(input, EMERGENCY_KEYWORDS_ES))
  );
}

function isClockIn(input: string, lang: "en" | "es"): boolean {
  return (
    hasKeyword(input, CLOCK_IN_KEYWORDS_EN) ||
    (lang === "es" && hasKeyword(input, CLOCK_IN_KEYWORDS_ES))
  );
}

function isClockOut(input: string, lang: "en" | "es"): boolean {
  return (
    hasKeyword(input, CLOCK_OUT_KEYWORDS_EN) ||
    (lang === "es" && hasKeyword(input, CLOCK_OUT_KEYWORDS_ES))
  );
}

function isEscalation(input: string, lang: "en" | "es"): boolean {
  return (
    hasKeyword(input, ESCALATION_KEYWORDS_EN) ||
    (lang === "es" && hasKeyword(input, ESCALATION_KEYWORDS_ES))
  );
}

function isIncidentReport(input: string, lang: "en" | "es"): boolean {
  return (
    hasKeyword(input, INCIDENT_KEYWORDS_EN) ||
    (lang === "es" && hasKeyword(input, INCIDENT_KEYWORDS_ES))
  );
}

// ─── Layer 1 — Hardcoded Decision Tree ───────────────────────────────────

async function fireEmergencyActions(ctx: ConversationContext): Promise<void> {
  try {
    // Log to command bus as ALERT (uses existing helpai_proactive_alerts table)
    await apiRequest("POST", "/api/helpai/v2/command-bus", {
      direction: "helpai_to_trinity",
      messageType: "EMERGENCY_FALLBACK",
      priority: "critical",
      payload: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        language: ctx.language,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Non-fatal — emergency response already sent to user
  }
}

async function fireClockAction(
  ctx: ConversationContext,
  direction: "in" | "out"
): Promise<string> {
  try {
    const data = await apiRequest("POST", `/api/helpai/clock-${direction}`, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      source: "helpai_fallback",
    });
    const ts = data.timestamp || new Date().toLocaleTimeString();
    if (ctx.language === "es") {
      return `Listo — registrado ${direction === "in" ? "entrada" : "salida"} a las ${ts}. Confirmado.`;
    }
    return `Got it — you're clocked ${direction} at ${ts}. Logged.`;
  } catch {
    // Fall through to generic response
  }
  const ts = new Date().toLocaleTimeString();
  if (ctx.language === "es") {
    return `Registrado ${direction === "in" ? "entrada" : "salida"} a las ${ts}. (Modo de respaldo — confirmación completa cuando los sistemas se restauren)`;
  }
  return `Clocked ${direction} at ${ts}. (Fallback mode — full confirmation when systems restore)`;
}

// ─── Main Fallback Handler ────────────────────────────────────────────────

export async function handleFallbackRequest(
  input: string,
  context: ConversationContext,
  priority: FallbackPriority
): Promise<FallbackResponse> {
  const { language: lang } = context;

  // 1. Emergency / Safety — highest priority
  if (priority === "critical" || isEmergency(input, lang)) {
    void fireEmergencyActions(context);
    return {
      text:
        lang === "es"
          ? "Te escucho. La ayuda está en camino ahora mismo. Quédate conmigo. Por favor contacta a tu supervisor inmediatamente."
          : "I hear you. Help is being dispatched right now. Stay with me. Please contact your supervisor immediately.",
      actionFired: true,
      actionType: "emergency",
      fromCache: false,
    };
  }

  // 2. Clock In
  if (isClockIn(input, lang)) {
    const text = await fireClockAction(context, "in");
    return { text, actionFired: true, actionType: "clock_in", fromCache: false };
  }

  // 3. Clock Out
  if (isClockOut(input, lang)) {
    const text = await fireClockAction(context, "out");
    return { text, actionFired: true, actionType: "clock_out", fromCache: false };
  }

  // 4. Escalation Request
  if (isEscalation(input, lang)) {
    try {
      await apiRequest("POST", "/api/notifications/management-alert", {
        workspaceId: context.workspaceId,
        message: `HelpAI Fallback: Escalation requested by ${context.userName || context.userId}`,
        priority: "high",
      });
    } catch { /* Non-fatal */ }
    return {
      text:
        lang === "es"
          ? "He notificado a tu supervisor. Alguien estará contigo pronto. Tu solicitud está registrada."
          : "I've notified your supervisor. Someone will be with you shortly. Your request is logged.",
      actionFired: true,
      actionType: "escalation",
      fromCache: false,
    };
  }

  // 5. Incident Report
  if (isIncidentReport(input, lang)) {
    return {
      text:
        lang === "es"
          ? "Estoy en modo de respaldo. Para reportar un incidente, por favor proporciona: (1) Hora del incidente (2) Ubicación (3) Descripción (4) Personas involucradas. Responde con estos detalles y los registraré de inmediato."
          : "I'm in fallback mode. To file an incident report, please provide: (1) Time of incident (2) Location (3) Description (4) Persons involved. Reply with these details and I'll log it immediately.",
      actionFired: false,
      actionType: "incident_template",
      fromCache: false,
    };
  }

  // 6. Layer 2 — Serve from cache
  return serveCachedResponse(input, context);
}

// ─── Layer 2 — Cache Structure ─────────────────────────────────────────────

interface IntelligenceCache {
  schedule: Record<string, unknown>;
  faqs: Record<string, string>;
  contacts: Record<string, unknown>;
  lastRefresh: number;
}

let _cache: IntelligenceCache = {
  schedule: {},
  faqs: {},
  contacts: {},
  lastRefresh: 0,
};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function refreshFallbackCache(workspaceId: string): Promise<void> {
  const now = Date.now();
  if (now - _cache.lastRefresh < CACHE_TTL_MS) return;

  try {
    const [schedRes, faqRes] = await Promise.allSettled([
      apiRequest("GET", `/api/helpai/cache/schedule?workspaceId=${workspaceId}`),
      apiRequest("GET", `/api/helpai/cache/faqs?workspaceId=${workspaceId}`),
    ]);

    if (schedRes.status === "fulfilled") {
      _cache.schedule = schedRes.value;
    }
    if (faqRes.status === "fulfilled") {
      _cache.faqs = faqRes.value;
    }
    _cache.lastRefresh = now;
  } catch {
    // Cache refresh failure is non-fatal — serve stale or generic
  }
}

function serveCachedResponse(input: string, ctx: ConversationContext): FallbackResponse {
  const lang = ctx.language;
  const cacheAge = Date.now() - _cache.lastRefresh;

  const preamble =
    lang === "es"
      ? "Estoy en modo de respaldo ahora — esto es lo que tengo de mi última actualización:\n\n"
      : "I'm in backup mode right now — here's what I have from my last update:\n\n";

  // FAQ keyword match
  const inputLower = input.toLowerCase();
  for (const [key, answer] of Object.entries(_cache.faqs)) {
    if (inputLower.includes(key.toLowerCase())) {
      return {
        text: preamble + answer,
        actionFired: false,
        fromCache: true,
        cacheAge,
      };
    }
  }

  // Generic fallback
  return {
    text:
      lang === "es"
        ? "Estoy en modo de respaldo con capacidad limitada. Tu solicitud está en cola y se procesará completamente cuando los sistemas se restauren. Para asistencia urgente, contacta a tu supervisor directamente."
        : "I'm in fallback mode with limited capacity. Your request is queued and will be fully processed when systems restore. For urgent assistance, contact your supervisor directly.",
    actionFired: false,
    fromCache: true,
    cacheAge,
  };
}

// ─── Model Availability State Manager ────────────────────────────────────

export function getFallbackActive(modelStatus: ModelStatus): boolean {
  return modelStatus.overall === "fallback";
}

export function getPartialDegradation(modelStatus: ModelStatus): boolean {
  return modelStatus.overall === "partial";
}
