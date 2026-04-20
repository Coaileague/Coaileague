/**
 * TrinityThoughtBar — Persistent Operating System Status Bar
 * ===========================================================
 * Sits above the ChatDock message thread. Always visible when ChatDock is open.
 * NOT inside the scroll area — it belongs to the layout layer.
 *
 * Desktop (≥640px): 48px, full sections, thread pills, cognitive layer indicator
 * Mobile (<640px): 36px compact, tap to expand
 *
 * Subscribes to: model heartbeat, simulated thread state (real data via activity API)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  getStatusState,
  getBroadcastColor,
  getStatusPhrase,
  startModelHeartbeat,
  subscribeModelStatus,
  getSimulatedThreads,
  getCognitiveModelFromThread,
  DEFAULT_TRINITY_THREADS,
  type ModelStatus,
  type CoAIStatusState,
  type TrinityThreadStatus,
  type TrinityThreadName,
  type ActiveCognitiveModel,
} from "@/lib/ai-status/status-engine";

// ─── Props ─────────────────────────────────────────────────────────────────

interface TrinityThoughtBarProps {
  isProcessing?: boolean;
  priority?: "low" | "normal" | "high" | "urgent" | "critical" | "911_override";
  className?: string;
}

// ─── Model indicator config ────────────────────────────────────────────────

const MODEL_COLORS: Record<string, string> = {
  gpt: "#22C55E",
  claude: "#F97316",
  gemini: "#3B82F6",
  fallback: "#FBBF24",
};

const MODEL_LABELS: Record<string, string> = {
  gpt: "REASON",
  claude: "VALIDATE",
  gemini: "EXECUTE",
  fallback: "FALLBACK",
};

// ─── Component ─────────────────────────────────────────────────────────────

export function TrinityThoughtBar({
  isProcessing = false,
  priority = "normal",
  className,
}: TrinityThoughtBarProps) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>({
    gpt: "online",
    claude: "online",
    gemini: "online",
    overall: "full",
    lastChecked: 0,
  });
  const [state, setState] = useState<CoAIStatusState>("idle");
  const [phrase, setPhrase] = useState("Standing by...");
  const [phraseVisible, setPhraseVisible] = useState(true);
  const [threads, setThreads] = useState<TrinityThreadStatus[]>(DEFAULT_TRINITY_THREADS);
  const [activeModel, setActiveModel] = useState<ActiveCognitiveModel>(null);
  const [tick, setTick] = useState(0);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [completionFlash, setCompletionFlash] = useState(false);
  const lastPhraseRef = useRef<string>("Standing by...");
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Real proactive scanner data (60s refresh) ───────────────────────────
  const { data: thoughtStatus } = useQuery<{
    threads: Array<{ name: string; active: boolean; critical: boolean; count?: number }>;
    lastScanned: string;
  }>({
    queryKey: ['/api/trinity/thought-status'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });

  // ─── Bootstrap ───────────────────────────────────────────────────────────
  useEffect(() => {
    const stop = startModelHeartbeat();
    const unsub = subscribeModelStatus(setModelStatus);
    return () => { stop(); unsub(); };
  }, []);

  // ─── Derive state ─────────────────────────────────────────────────────────
  useEffect(() => {
    const newState = getStatusState("trinity", modelStatus, priority, isProcessing);
    setState(newState);
  }, [modelStatus, priority, isProcessing]);

  // ─── Thread tick (real-time simulation, 4s cycle) ─────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state === "active" || state === "idle") {
      // Prefer real scanner data; fall back to simulation when unavailable
      if (thoughtStatus?.threads?.length) {
        const realThreads = thoughtStatus.threads as TrinityThreadStatus[];
        setThreads(realThreads);
        const activeThread = realThreads.find((t) => t.active || t.critical);
        if (activeThread) {
          setActiveModel(getCognitiveModelFromThread(activeThread.name as TrinityThreadName));
        }
      } else {
        const newThreads = getSimulatedThreads(tick);
        setThreads(newThreads);
        const activeThread = newThreads.find((t) => t.active);
        if (activeThread) {
          setActiveModel(getCognitiveModelFromThread(activeThread.name));
        }
      }
    }
  }, [tick, state, thoughtStatus]);

  // ─── Phrase rotation with crossfade ──────────────────────────────────────
  const rotatePhrase = useCallback(() => {
    setPhraseVisible(false);
    phraseTimerRef.current = setTimeout(() => {
      const next = getStatusPhrase("trinity", state, lastPhraseRef);
      setPhrase(next);
      setPhraseVisible(true);
    }, 300);
  }, [state]);

  useEffect(() => {
    const next = getStatusPhrase("trinity", state, lastPhraseRef);
    setPhrase(next);
    setPhraseVisible(true);

    if (state === "offline") return;
    const interval = setInterval(rotatePhrase, 4000);
    return () => {
      clearInterval(interval);
      if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
    };
  }, [state, rotatePhrase]);

  // ─── Completion flash ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isProcessing && state === "idle") {
      setCompletionFlash(true);
      const t = setTimeout(() => setCompletionFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [isProcessing, state]);

  const colors = getBroadcastColor("trinity", state);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={cn("trinity-thought-bar relative flex-shrink-0 overflow-hidden", className)}
      style={{
        height: undefined, // set via CSS classes
        backgroundColor: "#0F172A",
        borderBottom: `1px solid ${colors.border}`,
      }}
      role="status"
      aria-live={state === "critical" ? "assertive" : "polite"}
      aria-label="Trinity AI status"
      data-testid="trinity-thought-bar"
      data-state={state}
    >
      {/* Scan line — Trinity bar only, very subtle */}
      {state !== "offline" && state !== "fallback" && (
        <div
          className="absolute inset-x-0 pointer-events-none"
          style={{
            height: "1px",
            background: `linear-gradient(90deg, transparent, ${colors.primary}22, transparent)`,
            animation: "coai-scan-line 5s linear infinite",
            top: 0,
          }}
          aria-hidden="true"
        />
      )}

      {/* Shimmer sweep when active */}
      {state === "active" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${colors.primary}08 50%, transparent 100%)`,
            animation: "coai-shimmer-sweep 2.5s linear infinite",
            backgroundSize: "200% 100%",
          }}
          aria-hidden="true"
        />
      )}

      {/* ── MOBILE LAYOUT (hidden on sm+) ─────────────────────────────────── */}
      <button
        className="sm:hidden w-full h-9 flex items-center gap-2 px-2"
        onClick={() => setMobileExpanded((v) => !v)}
        aria-label="Expand Trinity status"
        aria-expanded={mobileExpanded}
      >
        {/* Icon */}
        <TrinityIcon color={colors.primary} active={state === "active"} />

        {/* Phrase */}
        <span
          className="flex-1 text-left truncate"
          style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.text,
            opacity: phraseVisible ? 1 : 0,
            transition: "opacity 0.3s",
          }}
        >
          {state === "offline" ? "TRINITY OFFLINE" : phrase}
        </span>

        {/* Dots */}
        <BouncingDots color={colors.primary} active={state === "active"} />
      </button>

      {/* Mobile expanded panel */}
      {mobileExpanded && (
        <div
          className="sm:hidden px-3 pb-2 space-y-2"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <ThreadPills threads={threads} colors={colors} state={state} />
          <CognitiveLayers activeModel={activeModel} modelStatus={modelStatus} state={state} />
        </div>
      )}

      {/* ── DESKTOP LAYOUT (hidden below sm) ──────────────────────────────── */}
      <div className="hidden sm:flex items-center h-12 px-3 gap-3">
        {/* Left: Trinity identity */}
        <div className="flex items-center gap-1.5 flex-shrink-0 w-36">
          <TrinityIcon color={colors.primary} active={state === "active"} />
          <span
            style={{
              fontSize: "10px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: colors.text,
              fontWeight: 600,
            }}
          >
            TRINITY
          </span>
          {state === "fallback" && (
            <span
              style={{
                fontSize: "8px",
                color: "#FBBF24",
                letterSpacing: "0.1em",
                animation: "coai-fallback-amber-blink 3s infinite",
              }}
            >
              FALLBACK
            </span>
          )}
        </div>

        {/* Left-center: Current action */}
        <div className="flex-shrink-0 w-52 min-w-0">
          <div style={{ fontSize: "8px", color: colors.dim === "#7C3AED33" ? "#8B5CF6" : colors.text, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1px" }}>
            {state === "critical" ? "CRITICAL ALERT" : state === "fallback" ? "FALLBACK MODE" : "CURRENT ACTION"}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: colors.text,
              opacity: phraseVisible ? 1 : 0,
              transition: "opacity 0.3s ease",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {state === "offline" ? "TRINITY OFFLINE" : phrase}
          </div>
        </div>

        {/* Center: Thread pills (fluid) */}
        <div className="flex-1 min-w-0">
          <ThreadPills threads={threads} colors={colors} state={state} />
        </div>

        {/* Right-center: Cognitive layer */}
        <div className="flex-shrink-0 w-36">
          <CognitiveLayers activeModel={activeModel} modelStatus={modelStatus} state={state} />
        </div>

        {/* Right: Dots / status indicator */}
        <div className="flex-shrink-0 w-16 flex items-center justify-end gap-1">
          {state === "critical" ? (
            <span
              style={{
                fontSize: "10px",
                color: "#EF4444",
                animation: "coai-critical-pulse 1s infinite",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              ALERT
            </span>
          ) : completionFlash ? (
            <span style={{ color: "#22C55E", fontSize: "12px", fontWeight: 700 }}>&#10003;</span>
          ) : (
            <BouncingDots color={colors.primary} active={state === "active"} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TrinityIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: `1.5px solid ${color}`,
        color,
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
        animation: active ? "coai-pulse-glow 2s ease-in-out infinite" : undefined,
        boxShadow: active ? `0 0 6px ${color}55` : "none",
      }}
      aria-hidden="true"
    >
      T
    </span>
  );
}

function BouncingDots({ color, active }: { color: string; active: boolean }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: color,
            opacity: active ? 1 : 0.25,
            animation: active ? "coai-bounce-dot 1.2s ease-in-out infinite" : undefined,
            animationDelay: active ? `${i * 0.15}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}

function ThreadPills({
  threads,
  colors,
  state,
}: {
  threads: TrinityThreadStatus[];
  colors: ReturnType<typeof getBroadcastColor>;
  state: CoAIStatusState;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {threads.map((t) => {
        const isActive = t.active && state !== "offline";
        const isCrit = t.critical;
        return (
          <span
            key={t.name}
            style={{
              fontSize: "8px",
              letterSpacing: "0.06em",
              padding: "1px 5px",
              borderRadius: "3px",
              border: `1px solid ${isCrit ? "#EF4444" : isActive ? colors.primary : colors.border}`,
              backgroundColor: isCrit
                ? "#EF444422"
                : isActive
                ? `${colors.primary}22`
                : "transparent",
              color: isCrit ? "#FCA5A5" : isActive ? colors.text : `${colors.text}55`,
              animation: isCrit ? "coai-critical-pulse 1s infinite" : undefined,
              whiteSpace: "nowrap",
            }}
            data-testid={`thread-pill-${t.name}`}
          >
            {t.name}
          </span>
        );
      })}
    </div>
  );
}

function CognitiveLayers({
  activeModel,
  modelStatus,
  state,
}: {
  activeModel: ActiveCognitiveModel;
  modelStatus: ModelStatus;
  state: CoAIStatusState;
}) {
  if (state === "fallback" || state === "offline") {
    const isOffline = state === "offline";
    const badgeColor = isOffline ? "#9CA3AF" : "#FBBF24";
    const borderColor = isOffline ? "#6B7280" : "#F59E0B";
    return (
      <div className="flex items-center gap-1">
        <span
          style={{
            fontSize: "8px",
            letterSpacing: "0.1em",
            color: badgeColor,
            animation: isOffline ? undefined : "coai-fallback-amber-blink 3s infinite",
            padding: "1px 5px",
            border: `1px solid ${borderColor}`,
            borderRadius: "3px",
          }}
        >
          {isOffline ? "OFFLINE" : "FALLBACK"}
        </span>
      </div>
    );
  }

  const models: Array<{ key: "gpt" | "claude" | "gemini"; label: string }> = [
    { key: "gpt", label: "REASON" },
    { key: "claude", label: "VALIDATE" },
    { key: "gemini", label: "EXECUTE" },
  ];

  return (
    <div className="flex items-center gap-1">
      {models.map(({ key, label }) => {
        const isActive = activeModel === key;
        const isOnline = modelStatus[key] !== "offline";
        const baseColor = MODEL_COLORS[key];
        return (
          <span
            key={key}
            style={{
              fontSize: "8px",
              letterSpacing: "0.06em",
              padding: "1px 4px",
              borderRadius: "3px",
              border: `1px solid ${isActive ? baseColor : `${baseColor}33`}`,
              backgroundColor: isActive ? `${baseColor}22` : "transparent",
              color: isActive ? baseColor : isOnline ? `${baseColor}66` : "#6B728055",
              transition: "all 0.4s",
            }}
            data-testid={`cognitive-${key}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
