/**
 * CoAI Status Engine — Shared Logic for Trinity + HelpAI Status Components
 *
 * Single source of truth for:
 * - State derivation (what state should each entity be in?)
 * - Color resolution (which color token for this state?)
 * - Phrase selection (which library for this state?)
 * - Model availability heartbeat (30s polling)
 *
 * Both TrinityThoughtBar and HelpAIStatusMessage import from here.
 * No duplicated logic between the two components.
 */

import {
  TRINITY_OPERATIONAL, TRINITY_CRITICAL, TRINITY_FALLBACK, TRINITY_IDLE,
  HELPAI_OPERATIONAL, HELPAI_CRITICAL, HELPAI_FALLBACK, HELPAI_UNAVAILABLE,
  getNextPhrase,
} from "./phrases";

// ─── Types ─────────────────────────────────────────────────────────────────

export type CoAIEntity = "trinity" | "helpai";

export type CoAIStatusState =
  | "idle"
  | "active"
  | "critical"
  | "fallback"
  | "offline"
  | "unavailable";

export type ModelName = "gpt" | "claude" | "gemini";
export type ModelAvailability = "online" | "degraded" | "offline";
export type OverallAvailability = "full" | "partial" | "fallback";

export interface ModelStatus {
  gpt: ModelAvailability;
  claude: ModelAvailability;
  gemini: ModelAvailability;
  overall: OverallAvailability;
  lastChecked: number;
}

export interface ColorToken {
  primary: string;
  dim: string;
  glow: string;
  text: string;
  border: string;
}

export type Priority =
  | "low"
  | "normal"
  | "high"
  | "urgent"
  | "critical"
  | "911_override";

// ─── Color Tokens ──────────────────────────────────────────────────────────

export const TRINITY_COLORS: Record<CoAIStatusState, ColorToken> = {
  idle: {
    primary: "#8B5CF6",
    dim: "#8B5CF633",
    glow: "#8B5CF644",
    text: "#DDD6FE",
    border: "#8B5CF666",
  },
  active: {
    primary: "#7C3AED",
    dim: "#7C3AED33",
    glow: "#7C3AED66",
    text: "#C4B5FD",
    border: "#7C3AED88",
  },
  critical: {
    primary: "#EF4444",
    dim: "#EF444433",
    glow: "#EF444466",
    text: "#FCA5A5",
    border: "#EF4444",
  },
  fallback: {
    primary: "#B45309",
    dim: "#B4530933",
    glow: "#B4530966",
    text: "#FCD34D",
    border: "#B45309",
  },
  offline: {
    primary: "#6B7280",
    dim: "#6B728033",
    glow: "#6B728033",
    text: "#9CA3AF",
    border: "#6B728066",
  },
  unavailable: {
    primary: "#6B7280",
    dim: "#6B728033",
    glow: "#6B728033",
    text: "#9CA3AF",
    border: "#6B728066",
  },
};

export const HELPAI_COLORS: Record<CoAIStatusState, ColorToken> = {
  idle: {
    primary: "#D97706",
    dim: "#D9770633",
    glow: "#D9770644",
    text: "#FCD34D",
    border: "#D9770644",
  },
  active: {
    primary: "#D97706",
    dim: "#D9770633",
    glow: "#D9770666",
    text: "#FCD34D",
    border: "#D9770688",
  },
  critical: {
    primary: "#EF4444",
    dim: "#EF444433",
    glow: "#EF444466",
    text: "#FCA5A5",
    border: "#EF4444",
  },
  fallback: {
    primary: "#B45309",
    dim: "#B4530933",
    glow: "#B4530966",
    text: "#FCD34D",
    border: "#B45309",
  },
  offline: {
    primary: "#6B7280",
    dim: "#6B728033",
    glow: "#6B728033",
    text: "#9CA3AF",
    border: "#6B728066",
  },
  unavailable: {
    primary: "#6B7280",
    dim: "#6B728033",
    glow: "#6B728033",
    text: "#9CA3AF",
    border: "#6B728066",
  },
};

// ─── State Derivation ──────────────────────────────────────────────────────

/**
 * Derives the correct visual state for an entity given model status and priority.
 */
export function getStatusState(
  entity: CoAIEntity,
  modelStatus: ModelStatus,
  priority: Priority,
  isProcessing: boolean
): CoAIStatusState {
  // CRITICAL priority always wins
  if (priority === "critical" || priority === "911_override") return "critical";

  // All models offline → fallback
  if (modelStatus.overall === "fallback") return "fallback";

  // No connection at all → offline
  if (modelStatus.gpt === "offline" && modelStatus.claude === "offline" && modelStatus.gemini === "offline") {
    return "offline";
  }

  // HelpAI unavailable when explicitly not processing and not connected
  // @ts-expect-error — TS migration: fix in refactoring sprint
  if (entity === "helpai" && !isProcessing && modelStatus.overall === "fallback") {
    return "unavailable";
  }

  // Normal operation
  return isProcessing ? "active" : "idle";
}

/**
 * Returns the color token set for an entity in a given state.
 */
export function getBroadcastColor(entity: CoAIEntity, state: CoAIStatusState): ColorToken {
  return entity === "trinity" ? TRINITY_COLORS[state] : HELPAI_COLORS[state];
}

/**
 * Returns the appropriate phrase library for an entity in a given state.
 */
export function getPhraseLibrary(entity: CoAIEntity, state: CoAIStatusState): string[] {
  if (entity === "trinity") {
    switch (state) {
      case "critical": return TRINITY_CRITICAL;
      case "fallback": return TRINITY_FALLBACK;
      case "offline": return ["TRINITY OFFLINE"];
      case "idle": return TRINITY_IDLE;
      default: return TRINITY_OPERATIONAL;
    }
  } else {
    switch (state) {
      case "critical": return HELPAI_CRITICAL;
      case "fallback": return HELPAI_FALLBACK;
      case "offline":
      case "unavailable": return HELPAI_UNAVAILABLE;
      default: return HELPAI_OPERATIONAL;
    }
  }
}

/**
 * Returns the next phrase, no consecutive repeat, from the appropriate library.
 */
export function getStatusPhrase(
  entity: CoAIEntity,
  state: CoAIStatusState,
  lastPhraseRef: { current: string }
): string {
  const lib = getPhraseLibrary(entity, state);
  return getNextPhrase(lib, lastPhraseRef);
}

// ─── Model Availability Heartbeat ─────────────────────────────────────────

const MODEL_HEARTBEAT_INTERVAL_MS = 30_000;
let _modelStatus: ModelStatus = {
  gpt: "online",
  claude: "online",
  gemini: "online",
  overall: "full",
  lastChecked: 0,
};
const _listeners = new Set<(s: ModelStatus) => void>();

function _notifyListeners() {
  _listeners.forEach((fn) => fn({ ..._modelStatus }));
}

async function _checkModelHealth(): Promise<void> {
  try {
    const res = await fetch("/api/health/ai-status", { credentials: "include" });
    if (!res.ok) {
      // 4xx auth errors mean the server is up — treat models as online
      // Only 5xx or network failures indicate real AI problems
      if (res.status < 500) {
        _modelStatus = { gpt: "online", claude: "online", gemini: "online", overall: "full", lastChecked: Date.now() };
        _notifyListeners();
        return;
      }
      throw new Error(`AI status check returned ${res.status}`);
    }
    const data = await res.json();
    const aiHealthy = data?.aiHealthy !== false;
    const overall: OverallAvailability = data?.overall === "partial" ? "partial" : aiHealthy ? "full" : "fallback";
    const newStatus: ModelStatus = {
      gpt: (data?.gpt === "degraded" ? "degraded" : data?.gpt === "offline" ? "offline" : "online") as ModelAvailability,
      claude: (data?.claude === "degraded" ? "degraded" : data?.claude === "offline" ? "offline" : "online") as ModelAvailability,
      gemini: (data?.gemini === "degraded" ? "degraded" : data?.gemini === "offline" ? "offline" : "online") as ModelAvailability,
      overall,
      lastChecked: Date.now(),
    };
    _modelStatus = newStatus;
    _notifyListeners();
  } catch {
    // Network error only — mark as partial (degraded) not full fallback
    // This prevents a brief network blip from triggering the FALLBACK banner
    _modelStatus = {
      gpt: "degraded",
      claude: "degraded",
      gemini: "degraded",
      overall: "partial",
      lastChecked: Date.now(),
    };
    _notifyListeners();
  }
}

let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startModelHeartbeat(): () => void {
  if (_heartbeatTimer) return () => {};
  _checkModelHealth();
  _heartbeatTimer = setInterval(_checkModelHealth, MODEL_HEARTBEAT_INTERVAL_MS);
  return () => {
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
  };
}

export function subscribeModelStatus(listener: (s: ModelStatus) => void): () => void {
  _listeners.add(listener);
  listener({ ..._modelStatus });
  return () => _listeners.delete(listener);
}

export function getModelStatus(): ModelStatus {
  return { ..._modelStatus };
}

// ─── Trinity Thread State ─────────────────────────────────────────────────

export type TrinityThreadName =
  | "SCHED"
  | "INCIDENT"
  | "CLOCK"
  | "HIRE"
  | "COMPLY"
  | "CLIENT"
  | "HELPAI"
  | "AGENTS";

export interface TrinityThreadStatus {
  name: TrinityThreadName;
  active: boolean;
  critical: boolean;
}

export const DEFAULT_TRINITY_THREADS: TrinityThreadStatus[] = [
  { name: "SCHED", active: false, critical: false },
  { name: "INCIDENT", active: false, critical: false },
  { name: "CLOCK", active: false, critical: false },
  { name: "HIRE", active: false, critical: false },
  { name: "COMPLY", active: false, critical: false },
  { name: "CLIENT", active: false, critical: false },
  { name: "HELPAI", active: false, critical: false },
  { name: "AGENTS", active: false, critical: false },
];

// Simulates active thread rotation for Acme stress test
export function getSimulatedThreads(tick: number): TrinityThreadStatus[] {
  const activeIndex = tick % 8;
  return DEFAULT_TRINITY_THREADS.map((t, i) => ({
    ...t,
    active: i === activeIndex || i === (activeIndex + 2) % 8,
    critical: false,
  }));
}

// Which cognitive model is currently engaged (maps from real log data)
export type ActiveCognitiveModel = "gpt" | "claude" | "gemini" | "fallback" | null;

export function getCognitiveModelFromThread(thread: TrinityThreadName): ActiveCognitiveModel {
  switch (thread) {
    case "INCIDENT":
    case "COMPLY": return "claude";  // Ethics/safety/deliberation
    case "SCHED":
    case "HIRE":
    case "CLIENT": return "gpt";    // Execution/drafting
    case "AGENTS":
    case "HELPAI": return "gemini"; // Large data/monitoring
    default: return "gpt";
  }
}
