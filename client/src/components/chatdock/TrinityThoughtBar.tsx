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
import { TrinityArrowMark } from "@/components/trinity-logo";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
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
  /** Current chat session id, used to stream Trinity's live thought phase. */
  sessionId?: string;
}

// ─── Thought stream phase labels ──────────────────────────────────────────
const THOUGHT_PHASE_LABELS: Record<string, string> = {
  perception:        "Reading your message…",
  deliberation:      "Considering options…",
  planning:          "Forming a plan…",
  execution:         "Taking action…",
  reflection:        "Reviewing…",
  mathVerification:  "Double-checking numbers…",
};

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
  sessionId,
}: TrinityThoughtBarProps) {
  const { workspaceId } = useWorkspaceAccess();
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

  // ─── Live thought-phase stream while Trinity is thinking (1s poll) ───────
  const { data: thoughtStream } = useQuery<{
    currentPhase: string | null;
    isThinking: boolean;
    lastThoughtAt: string | null;
    thoughts: Array<{ phase: string | null; content: string; confidence: number }>;
    activeSignals: Record<string, number>;
  }>({
    queryKey: ['/api/trinity/chat/thought-stream', sessionId],
    queryFn: async () => {
      const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      const res = await fetch(`/api/trinity/chat/thought-stream${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('thought-stream fetch failed');
      return res.json();
    },
    refetchInterval: isProcessing ? 1_000 : false,
    enabled: isProcessing,
    retry: false,
  });

  const livePhaseLabel = thoughtStream?.currentPhase
    ? THOUGHT_PHASE_LABELS[thoughtStream.currentPhase] ?? null
    : null;
  const thinkingLabel = livePhaseLabel ?? "Thinking";

  const { data: activeOperations = [] } = useQuery<Array<{
    orchestrationId: string;
    domain: string;
    actionName: string;
    currentStep: string;
    stepStatus: string;
    progress?: number;
    modelUsed?: 'gpt' | 'claude' | 'gemini';
  }>>({
    queryKey: ['/api/trinity/active-operations', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const res = await fetch(
        `/api/trinity/active-operations?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: 'include' }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!workspaceId && !sessionId,
    refetchInterval: sessionId ? false : 5000,  // 5s (was 2s causing rate limits)
    staleTime: 1000,
    retry: false,
  });

  // Get the MOST IMPORTANT active operation (Trinity's current action)
  // Priority: critical > high > normal > low
  const getOperationPriority = (op: typeof activeOperations[0]) => {
    if (op.stepStatus === 'error' || op.stepStatus === 'critical') return 5;
    if (op.domain === 'compliance') return 4; // Compliance highest priority
    if (op.domain === 'payroll') return 3;
    if (op.domain === 'scheduling') return 2;
    return 1;
  };

  const currentTrinityAction = activeOperations.length > 0
    ? activeOperations.sort((a, b) => getOperationPriority(b) - getOperationPriority(a))[0]
    : null;

  // Map domain to readable action phrase
  const getActionPhrase = (action: typeof currentTrinityAction) => {
    if (!action) return null;
    
    const stepPhrase = action.currentStep?.toUpperCase() || '';
    const actionName = action.actionName || '';
    
    // Show what Trinity is ACTIVELY DOING
    const domainActions: Record<string, string> = {
      'scheduling': `Scheduling: ${actionName} — ${stepPhrase}`,
      'payroll': `Processing payroll: ${actionName} — ${stepPhrase}`,
      'compliance': `Ensuring compliance: ${actionName} — ${stepPhrase}`,
      'invoicing': `Managing invoices: ${actionName} — ${stepPhrase}`,
      'timesheets': `Approving timesheets: ${actionName} — ${stepPhrase}`,
      'reports': `Generating reports: ${actionName} — ${stepPhrase}`,
    };
    
    return domainActions[action.domain] || `${actionName}: ${stepPhrase}`;
  };

  const activeSchedulingOperation = activeOperations.find((operation) => operation.domain === "scheduling");

  const schedulingLabel = (() => {
    if (!activeSchedulingOperation) return null;
    const step = activeSchedulingOperation.currentStep?.toUpperCase();
    switch (step) {
      case "TRIGGER":
        return "Waking Trinity scheduling systems...";
      case "FETCH":
        return "Scanning live shift coverage...";
      case "VALIDATE":
        return "Verifying staffing and compliance rules...";
      case "PROCESS":
        return "Matching officers to open shifts...";
      case "MUTATE":
        return "Preparing schedule changes for review...";
      case "CONFIRM":
        return "Cross-checking proposed assignments...";
      case "NOTIFY":
        return "Broadcasting schedule updates...";
      default:
        return "Running autonomous scheduling...";
    }
  })();

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

  // ─── Wire Trinity's actual actions to thought phrase ───────────────────────
  useEffect(() => {
    if (currentTrinityAction) {
      // Trinity is actively performing an action
      const actionPhrase = getActionPhrase(currentTrinityAction);
      if (actionPhrase) {
        setPhrase(actionPhrase);
        setPhraseVisible(true);
        // Set active model based on which AI is handling this action
        if (currentTrinityAction.modelUsed) {
          setActiveModel(currentTrinityAction.modelUsed);
        }
      }
    }
  }, [currentTrinityAction]);

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
  const hasAutonomousScheduleActivity = !!activeSchedulingOperation;
  const isTrinityActive = isProcessing || state === "active" || hasAutonomousScheduleActivity;
  const displayPhrase = state === "offline"
    ? "TRINITY OFFLINE"
    : isProcessing
    ? thinkingLabel
    : schedulingLabel ?? phrase;

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
      <style>{`
        @keyframes trinity-icon-breathe {
          0%, 100% { transform: scale(1); box-shadow: 0 0 8px currentColor, 0 0 0 0 transparent; }
          50% { transform: scale(1.05); box-shadow: 0 0 14px currentColor, 0 0 0 6px transparent; }
        }
        @keyframes trinity-icon-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes trinity-icon-bounce {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1.5px); }
        }
        @keyframes trinity-icon-halo {
          0% { transform: scale(0.9); opacity: 0.28; }
          70% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
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
      {isTrinityActive && (
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
        <TrinityIcon color={colors.primary} active={isTrinityActive} critical={state === "critical"} />

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
          {displayPhrase}
        </span>

        {/* Dots */}
        <BouncingDots color={colors.primary} active={isTrinityActive} />
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
          <TrinityIcon color={colors.primary} active={isTrinityActive} critical={state === "critical"} />
          <span
            style={{
              fontSize: "11px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: colors.text,
              fontWeight: 700,
            }}
          >
            TRINITY
          </span>
          {state === "fallback" && (
            <span
              style={{
                fontSize: "10px",
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
          <div style={{ fontSize: "10px", color: colors.dim === "#7C3AED33" ? "#8B5CF6" : colors.text, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1px" }}>
            {currentTrinityAction 
              ? `TRINITY ACTION (${currentTrinityAction.domain.toUpperCase()})`
              : state === "critical" ? "CRITICAL ALERT" : state === "fallback" ? "FALLBACK MODE" : "CURRENT ACTION"}
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
              fontWeight: currentTrinityAction ? 600 : 400,  // Bold when Trinity actively working
            }}
          >
            {currentTrinityAction 
              ? displayPhrase  // Show Trinity's actual current action
              : displayPhrase} {/* Fall back to thought phrase */}
          </div>
          {currentTrinityAction?.progress && (
            <div style={{ 
              fontSize: "9px", 
              marginTop: "2px",
              color: colors.text + "99",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}>
              <div style={{
                height: "4px",
                width: "40px",
                backgroundColor: colors.text + "22",
                borderRadius: "2px",
                overflow: "hidden"
              }}>
                <div style={{
                  height: "100%",
                  width: `${currentTrinityAction.progress}%`,
                  backgroundColor: colors.primary,
                  transition: "width 0.3s ease"
                }} />
              </div>
              <span>{Math.round(currentTrinityAction.progress)}%</span>
            </div>
          )}
        </div>

        {/* Center: Thread pills (fluid) */}
        <div className="flex-1 min-w-0">
          <ThreadPills threads={threads} colors={colors} state={state} />
        </div>

        {/* Right-center: Cognitive layer */}
        <div className="flex-shrink-0" style={{ minWidth: "160px" }}>
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
            <BouncingDots color={colors.primary} active={isTrinityActive} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TrinityIcon({
  color,
  active,
  critical = false,
}: {
  color: string;
  active: boolean;
  critical?: boolean;
}) {
  const ringAnimation = critical
    ? "coai-critical-pulse 1s infinite"
    : active
    ? "trinity-icon-breathe 2.1s ease-in-out infinite"
    : "trinity-icon-breathe 4.8s ease-in-out infinite";
  const markAnimation = active
    ? "trinity-icon-spin 2.6s linear infinite, trinity-icon-bounce 1.6s ease-in-out infinite"
    : undefined;
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: "50%",
        border: `2px solid ${color}`,
        color,
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
        boxShadow: `0 0 8px ${color}44`,
        animation: ringAnimation,
      }}
      aria-hidden="true"
    >
      {active && (
        <span
          style={{
            position: "absolute",
            inset: -5,
            borderRadius: "50%",
            border: `1px solid ${color}55`,
            animation: "trinity-icon-halo 1.8s ease-out infinite",
          }}
        />
      )}
      <span style={{ display: "inline-flex", animation: markAnimation }}>
        <TrinityArrowMark size={13} />
      </span>
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
              fontSize: "10px",
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
      <div className="flex items-center gap-1.5 px-2">
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: badgeColor,
            animation: isOffline ? undefined : "coai-fallback-amber-blink 3s infinite",
            padding: "2px 8px",
            border: `1px solid ${borderColor}`,
            borderRadius: "4px",
            backgroundColor: isOffline ? "#6B728011" : "#F59E0B22",
            whiteSpace: "nowrap",
          }}
          data-testid={`fallback-badge-${isOffline ? 'offline' : 'fallback'}`}
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
    <div className="flex items-center gap-1 px-2" style={{ minWidth: "140px" }}>
      {models.map(({ key, label }) => {
        const isActive = activeModel === key;
        const isOnline = modelStatus[key] !== "offline";
        const baseColor = MODEL_COLORS[key];
        
        return (
          <span
            key={key}
            style={{
              fontSize: "11px",
              fontWeight: isActive ? 700 : 600,
              letterSpacing: "0.08em",
              padding: "2px 6px",
              borderRadius: "3px",
              border: `1px solid ${isActive ? baseColor : isOnline ? `${baseColor}99` : `${baseColor}44`}`,
              backgroundColor: isActive 
                ? `${baseColor}33`  // Active: solid 33 alpha background
                : isOnline
                ? `${baseColor}11`  // Online but inactive: very subtle background
                : "transparent",
              color: isActive 
                ? baseColor  // Active: full color
                : isOnline
                ? `${baseColor}cc`  // Online: 80% opacity
                : `${baseColor}66`, // Offline: 40% opacity (dimmed)
              transition: "all 0.4s",
              whiteSpace: "nowrap",
              cursor: "default",
            }}
            title={`${label} (${isActive ? 'Active' : isOnline ? 'Online' : 'Offline'})`}
            data-testid={`cognitive-${key}`}
            role="status"
            aria-label={`${label} cognitive layer ${isActive ? 'active' : isOnline ? 'online' : 'offline'}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
