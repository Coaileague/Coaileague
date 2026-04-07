/**
 * TrinityInsightBar — Collapsible proactive insights panel
 * =========================================================
 * Shows on the dashboard. Maximum 3 insights displayed at once.
 * Most important first. Each insight has severity icon, description, action button.
 * Dismiss stores in localStorage for 24 hours.
 *
 * Spec: Phase 44 — Trinity Insight Bar
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const DISMISS_PREFIX = "trinity_insight_dismissed_";
const DISMISS_24H = 24 * 60 * 60 * 1000;

interface Insight {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  action?: { label: string; href: string };
}

function isDismissed(id: string): boolean {
  try {
    const val = localStorage.getItem(DISMISS_PREFIX + id);
    return !!val && Date.now() < Number(val);
  } catch {
    return false;
  }
}

function dismiss(id: string) {
  try {
    localStorage.setItem(DISMISS_PREFIX + id, String(Date.now() + DISMISS_24H));
  } catch {
    // ignore
  }
}

function SeverityIcon({ severity }: { severity: Insight["severity"] }) {
  if (severity === "critical") return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />;
}

function severityOrder(s: string) {
  if (s === "critical") return 0;
  if (s === "warning") return 1;
  return 2;
}

function transformLogs(logs: any[]): Insight[] {
  if (!logs || !Array.isArray(logs)) return [];

  const insights: Insight[] = [];

  for (const log of logs.slice(0, 20)) {
    if (insights.length >= 3) break;
    const id = String(log.id || log.action || Math.random());
    if (isDismissed(id)) continue;

    const action = (log.action || log.actionType || log.title || "").toLowerCase();
    let insight: Insight | null = null;

    if (action.includes("compliance") || action.includes("violation")) {
      insight = {
        id,
        severity: "critical",
        title: "Compliance Issue Detected",
        description: "Trinity detected a compliance issue that requires attention.",
        action: { label: "Review", href: "/compliance" },
      };
    } else if (action.includes("schedul") && (action.includes("gap") || action.includes("conflict"))) {
      insight = {
        id,
        severity: "warning",
        title: "Schedule Coverage Gap",
        description: "There are uncovered shifts in your upcoming schedule.",
        action: { label: "Review", href: "/scheduling" },
      };
    } else if (action.includes("onboarding") || action.includes("i-9") || action.includes("i9")) {
      insight = {
        id,
        severity: "warning",
        title: "Onboarding Pending",
        description: "One or more officers have incomplete onboarding tasks.",
        action: { label: "Review", href: "/employees" },
      };
    } else if (action.includes("invoice") && (action.includes("overdue") || action.includes("past"))) {
      insight = {
        id,
        severity: "warning",
        title: "Overdue Invoices",
        description: "Some invoices are past due and need attention.",
        action: { label: "Review", href: "/invoices" },
      };
    }

    if (insight) insights.push(insight);
  }

  return insights.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)).slice(0, 3);
}

export function TrinityInsightBar() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: insights = [], isLoading } = useQuery<Insight[]>({
    queryKey: ["/api/ai-brain/logs"],
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    select: transformLogs,
  });

  const handleDismiss = useCallback((id: string) => {
    dismiss(id);
    setDismissed((prev) => new Set([...prev, id]));
  }, []);

  const visible = insights.filter((i) => !dismissed.has(i.id));

  if (!isAuthenticated || isLoading || visible.length === 0) return null;

  return (
    <div
      className="w-full border border-border rounded-lg bg-card overflow-hidden"
      data-testid="trinity-insight-bar"
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-foreground hover-elevate"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        data-testid="button-toggle-trinity-insights"
      >
        <span className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "#6B46C1" }}
            aria-hidden="true"
          />
          Trinity Insights
          <Badge variant="secondary" className="text-xs">
            {visible.length}
          </Badge>
        </span>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="flex flex-col divide-y divide-border" data-testid="trinity-insight-list">
          {visible.map((insight) => (
            <div
              key={insight.id}
              className="flex items-start gap-3 px-4 py-3"
              data-testid={`trinity-insight-${insight.id}`}
            >
              <SeverityIcon severity={insight.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{insight.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {insight.action && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setLocation(insight.action!.href)}
                    data-testid={`button-insight-action-${insight.id}`}
                  >
                    {insight.action.label}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => handleDismiss(insight.id)}
                  aria-label="Dismiss insight"
                  data-testid={`button-dismiss-insight-${insight.id}`}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
