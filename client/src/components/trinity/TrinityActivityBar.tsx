/**
 * TrinityActivityBar — User-facing slim status bar
 * =================================================
 * Sits below the main navigation on every authenticated workspace page.
 * Shows plain-language messages about what Trinity is actively doing.
 * Hidden when idle. Purple brand color (#6B46C1). Dismissible for 60s.
 *
 * Spec: Phase 44 — Trinity Intelligence Upgrade
 * - role="status" aria-live="polite"
 * - Slide-down entrance, slide-up exit
 * - Dismissible 60 seconds
 * - Queue: oldest replaced by newest (max 1 shown)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface TrinityActivity {
  id: string;
  message: string;
  type: "analyzing" | "flagged" | "scheduling" | "monitoring" | "completed";
  navigateTo?: string;
}

const DISMISS_KEY = "trinity_activity_bar_dismissed_until";
const DISMISS_DURATION_MS = 60_000;

function messageFromLog(log: any): TrinityActivity | null {
  if (!log) return null;
  const action = log.action || log.actionType || log.title || "";
  const lower = action.toLowerCase();

  let message = "";
  let type: TrinityActivity["type"] = "monitoring";

  if (
    lower.includes("health") ||
    lower.includes("helpai") ||
    lower.includes("helpdesk") ||
    lower.includes("bot_") ||
    lower.includes("ai_notification") ||
    lower.includes("ai_brain_action") ||
    lower.includes("automation_executed")
  ) {
    return null; // internal/background ops — not user-facing
  } else if (lower.includes("schedul")) {
    message = "Trinity is analyzing your schedule coverage...";
    type = "scheduling";
  } else if (lower.includes("compliance") || lower.includes("violation")) {
    message = "Trinity flagged a compliance issue — tap to review";
    type = "flagged";
  } else if (lower.includes("payroll")) {
    message = "Trinity is reviewing payroll data...";
    type = "analyzing";
  } else if (lower.includes("invoice") || lower.includes("billing")) {
    message = "Trinity is analyzing billing activity...";
    type = "analyzing";
  } else if (lower.includes("onboarding")) {
    message = "Trinity is monitoring officer onboarding progress...";
    type = "monitoring";
  } else if (lower.includes("employee") || lower.includes("workforce")) {
    message = "Trinity is reviewing workforce data...";
    type = "analyzing";
  } else if (lower.includes("client") || lower.includes("contract")) {
    message = "Trinity is monitoring client activity...";
    type = "monitoring";
  } else if (lower.includes("report") || lower.includes("analytic")) {
    message = "Trinity is generating insights for your team...";
    type = "analyzing";
  } else if (action) {
    message = "Trinity is working in the background...";
    type = "monitoring";
  } else {
    return null;
  }

  return {
    id: log.id || String(Date.now()),
    message,
    type,
    navigateTo: type === "flagged" ? "/compliance" : undefined,
  };
}

export function TrinityActivityBar() {
  const { isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);
  const [activity, setActivity] = useState<TrinityActivity | null>(null);
  const [slideIn, setSlideIn] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDismissed = useCallback(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (!until) return false;
      return Date.now() < Number(until);
    } catch {
      return false;
    }
  }, []);

  const { data: logs } = useQuery<any[]>({
    queryKey: ["/api/ai-brain/logs"],
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    select: (data) => (Array.isArray(data) ? data.slice(0, 5) : []),
  });

  useEffect(() => {
    if (!logs || logs.length === 0) return;
    if (isDismissed()) return;

    const latest = logs[0];
    const parsed = messageFromLog(latest);
    if (!parsed) return;

    setActivity(parsed);
    setVisible(true);
    requestAnimationFrame(() => setSlideIn(true));
  }, [logs, isDismissed]);

  const dismiss = useCallback(() => {
    setSlideIn(false);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setVisible(false);
      setActivity(null);
    }, 300);

    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  if (!isAuthenticated || !visible || !activity) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="trinity-activity-bar"
      className={cn(
        "w-full flex items-center justify-between gap-2 px-4 py-2 text-white text-sm font-medium select-none",
        "motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out",
      )}
      style={{
        backgroundColor: "#6B46C1",
        transform: slideIn ? "translateY(0)" : "translateY(-100%)",
        opacity: slideIn ? 1 : 0,
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease",
      }}
    >
      <span className="flex-1 truncate">{activity.message}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss Trinity notification"
        data-testid="button-dismiss-trinity-bar"
        className="flex-shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
        style={{ color: "rgba(255,255,255,0.8)" }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
