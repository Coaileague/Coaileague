/**
 * HelpAIStatusMessage — Inline Thread Status Bubble
 * ==================================================
 * Renders inside the ChatDock message thread as a HelpAI "thinking" bubble.
 * Appears before HelpAI's actual response is ready.
 * Transitions smoothly into the completed message on resolution.
 *
 * States: PROCESSING → CRITICAL → FALLBACK → COMPLETE
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getStatusPhrase,
  getBroadcastColor,
  type CoAIStatusState,
} from "@/lib/ai-status/status-engine";

// ─── Props ─────────────────────────────────────────────────────────────────

interface HelpAIStatusMessageProps {
  state?: CoAIStatusState;
  completedText?: string;
  onComplete?: () => void;
  overridePhrase?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function HelpAIStatusMessage({
  state = "active",
  completedText,
  onComplete,
  overridePhrase,
}: HelpAIStatusMessageProps) {
  const [phrase, setPhrase] = useState("Looking into this...");
  const [phraseVisible, setPhraseVisible] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const lastPhraseRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isComplete = !!completedText;
  const colors = getBroadcastColor("helpai", isComplete ? "idle" : state);

  // ─── Phrase rotation ────────────────────────────────────────────────────
  const rotatePhrase = useCallback(() => {
    if (overridePhrase) return;
    setPhraseVisible(false);
    timerRef.current = setTimeout(() => {
      const next = getStatusPhrase("helpai", state, lastPhraseRef);
      setPhrase(next);
      setPhraseVisible(true);
    }, 300);
  }, [state, overridePhrase]);

  useEffect(() => {
    if (overridePhrase) {
      setPhrase(overridePhrase);
      return;
    }
    const init = getStatusPhrase("helpai", state, lastPhraseRef);
    setPhrase(init);
    setPhraseVisible(true);

    if (isComplete) return;
    const interval = setInterval(rotatePhrase, 3500);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, overridePhrase, isComplete, rotatePhrase]);

  // ─── Completion transition ────────────────────────────────────────────────
  useEffect(() => {
    if (!completedText) return;
    setCompleting(true);
    const t1 = setTimeout(() => {
      setShowContent(true);
      setCompleting(false);
      onComplete?.();
    }, 400);
    return () => clearTimeout(t1);
  }, [completedText, onComplete]);

  const microLabel = completing
    ? "HELPAI · COMPLETE"
    : state === "critical"
    ? "HELPAI · URGENT"
    : state === "fallback"
    ? "HELPAI · FALLBACK MODE"
    : "HELPAI · WORKING";

  return (
    <div
      className="flex gap-2 mb-1.5"
      role="status"
      aria-live={state === "critical" ? "assertive" : "polite"}
      aria-label="HelpAI is working"
      data-testid="helpai-status-message"
      data-state={state}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-0.5">
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: `${colors.primary}22`,
            border: `1.5px solid ${colors.primary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: colors.primary,
            animation: !isComplete ? "coai-pulse-glow 2s ease-in-out infinite" : undefined,
            boxShadow: !isComplete ? `0 0 8px ${colors.primary}44` : "none",
            transition: "all 0.4s",
          }}
          aria-hidden="true"
        >
          H
        </div>
      </div>

      {/* Bubble */}
      <div
        style={{
          flex: 1,
          maxWidth: "85%",
          backgroundColor: "#0F172A",
          borderLeft: `3px solid ${isComplete ? `${colors.primary}55` : colors.primary}`,
          borderRadius: 0,
          padding: "8px 12px",
          position: "relative",
          overflow: "hidden",
          transition: "border-color 0.4s ease, box-shadow 0.4s ease",
          boxShadow: !isComplete ? `inset 0 0 0 1px ${colors.primary}22` : "none",
          animation: state === "critical" && !isComplete
            ? "coai-critical-pulse 1s infinite"
            : undefined,
        }}
      >
        {/* Shimmer sweep overlay */}
        {!isComplete && state !== "offline" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, transparent 0%, ${colors.primary}08 50%, transparent 100%)`,
              backgroundSize: "200% 100%",
              animation: "coai-shimmer-sweep 2.5s linear infinite",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          />
        )}

        {/* Top micro-label */}
        <div
          style={{
            fontSize: "8px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: completing ? colors.primary : `${colors.text}88`,
            marginBottom: "4px",
            fontWeight: 600,
            transition: "color 0.3s",
          }}
        >
          {microLabel}
        </div>

        {/* Content area: phrase → completed text */}
        {showContent && completedText ? (
          <div
            style={{
              fontSize: "13px",
              color: "hsl(var(--foreground))",
              lineHeight: 1.5,
              animation: "coai-text-fade-cycle 0.4s ease forwards",
            }}
          >
            {completedText}
          </div>
        ) : (
          <>
            {/* Rotating phrase */}
            <div
              style={{
                fontSize: "13px",
                color: colors.text,
                opacity: phraseVisible ? 1 : 0,
                transition: "opacity 0.3s ease",
                marginBottom: "6px",
                fontStyle: "italic",
              }}
            >
              {phrase}
            </div>

            {/* Bouncing dots */}
            {!completing && (
              <div className="flex items-end gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      backgroundColor: colors.primary,
                      animation: "coai-bounce-dot 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
