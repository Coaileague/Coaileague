/**
 * StatusBroadcast — Phase 4 / Phase 2 (HelpAI Complete System)
 * ==============================================================
 * Shared "thinking" status indicator. Built once, configured twice.
 *
 * who="helpai"  → gold (#D97706) dots + full HelpAI operational vocabulary
 * who="trinity" → purple dots + full Trinity operational vocabulary
 *
 * Uses animated bouncing dots — same animation engine for both.
 * Never shows the same phrase twice in a row (vocabulary rotation).
 *
 * Upgraded: Now uses centralized phrase libraries from ai-status/phrases.ts
 * and color tokens from ai-status/status-engine.ts.
 */

import { useEffect, useState, useRef } from "react";
import { getNextPhrase, HELPAI_OPERATIONAL, TRINITY_OPERATIONAL } from "@/lib/ai-status/phrases";
import { HELPAI_COLORS, TRINITY_COLORS } from "@/lib/ai-status/status-engine";

interface StatusBroadcastProps {
  who: "helpai" | "trinity";
  visible: boolean;
  overrideMessage?: string;
}

export function StatusBroadcast({ who, visible, overrideMessage }: StatusBroadcastProps) {
  const vocab = who === "helpai" ? HELPAI_OPERATIONAL : TRINITY_OPERATIONAL;
  const colors = who === "helpai" ? HELPAI_COLORS.active : TRINITY_COLORS.active;
  const dotColor = colors.primary;
  const textColor = colors.text;
  const lastPhrase = useRef<string>("");

  const [phrase, setPhrase] = useState(() => getNextPhrase(vocab, lastPhrase));

  useEffect(() => {
    if (!visible) return;
    setPhrase(overrideMessage || getNextPhrase(vocab, lastPhrase));

    const interval = setInterval(() => {
      if (!overrideMessage) {
        setPhrase(getNextPhrase(vocab, lastPhrase));
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [visible, overrideMessage]);

  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
      style={{ opacity: 0.92 }}
      data-testid={`status-broadcast-${who}`}
      aria-live="polite"
      aria-label={`${who === "helpai" ? "Trinity" : "Trinity"} is ${phrase}`}
    >
      <BouncingDots color={dotColor} />
      <span
        className="font-medium text-xs"
        style={{ color: textColor }}
        data-testid={`status-text-${who}`}
      >
        {overrideMessage || phrase}
      </span>
    </div>
  );
}

function BouncingDots({ color }: { color: string }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            backgroundColor: color,
            animation: "coai-bounce-dot 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}
