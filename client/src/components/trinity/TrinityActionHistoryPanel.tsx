/**
 * TrinityActionHistoryPanel — Last 5 Trinity actions panel
 * =========================================================
 * Shown inside the Trinity chat panel. Auto-refreshes every 30 seconds.
 * Clicking an action navigates to the relevant record.
 * Failed actions shown in amber with retry option.
 *
 * Spec: Phase 44 — Action Broadcasting Panel
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Users,
  DollarSign,
  FileText,
  Activity,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface TrinityAction {
  id: string;
  action?: string;
  actionType?: string;
  title?: string;
  status?: string;
  result?: string;
  error?: string;
  createdAt?: string;
  timestamp?: string;
}

function getActionIcon(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("schedul")) return <Calendar className="w-3.5 h-3.5" />;
  if (lower.includes("employee") || lower.includes("officer") || lower.includes("user")) return <Users className="w-3.5 h-3.5" />;
  if (lower.includes("payroll") || lower.includes("invoice") || lower.includes("billing")) return <DollarSign className="w-3.5 h-3.5" />;
  if (lower.includes("document") || lower.includes("report")) return <FileText className="w-3.5 h-3.5" />;
  return <Activity className="w-3.5 h-3.5" />;
}

function getNavTarget(action: string): string | null {
  const lower = action.toLowerCase();
  if (lower.includes("schedul")) return "/scheduling";
  if (lower.includes("compliance")) return "/compliance";
  if (lower.includes("payroll")) return "/payroll";
  if (lower.includes("invoice")) return "/invoices";
  if (lower.includes("employee") || lower.includes("officer")) return "/employees";
  return null;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  if (status === "failed" || status === "error") return <AlertCircle className="w-3.5 h-3.5 text-amber-500" />;
  if (status === "pending" || status === "running") return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function TrinityActionHistoryPanel({ compact = false }: { compact?: boolean }) {
  const [collapsed, setCollapsed] = useState(compact);
  const [, setLocation] = useLocation();

  const { data: actions = [], isLoading, refetch } = useQuery<TrinityAction[]>({
    queryKey: ["/api/ai-brain/logs"],
    refetchInterval: 30_000,
    select: (data) => (Array.isArray(data) ? data.slice(0, 5) : []),
  });

  const retryMutation = useMutation({
    mutationFn: async (actionId: string) => {
      return apiRequest("POST", `/api/ai-brain/retry/${actionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-brain/logs"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground text-sm" data-testid="trinity-action-panel-loading">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading recent actions...
      </div>
    );
  }

  if (!actions || actions.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-muted-foreground text-sm" data-testid="trinity-action-panel-empty">
        Trinity is monitoring your platform — no recent actions
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="trinity-action-history-panel">
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          data-testid="button-toggle-trinity-history"
        >
          {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          Recent Actions
        </button>
        {!collapsed && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            aria-label="Refresh Trinity actions"
            data-testid="button-refresh-trinity-actions"
            className="h-6 w-6"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        )}
      </div>
      {!collapsed && actions.map((action) => {
        const label = action.action || action.actionType || action.title || "AI action";
        const status = action.status || (action.error ? "failed" : "completed");
        const ts = action.createdAt || action.timestamp;
        const isFailed = status === "failed" || status === "error";
        const navTarget = getNavTarget(label);

        return (
          <div
            key={action.id}
            className={cn(
              "flex items-start gap-2 px-3 py-2 rounded-md mx-1 cursor-pointer transition-colors hover-elevate",
              isFailed && "bg-amber-500/10"
            )}
            onClick={() => navTarget && setLocation(navTarget)}
            data-testid={`trinity-action-item-${action.id}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navTarget && setLocation(navTarget)}
          >
            <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
              {getActionIcon(label)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{label}</p>
              {ts && (
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(ts), { addSuffix: true })}
                </p>
              )}
              {isFailed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-xs text-amber-600 mt-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    retryMutation.mutate(action.id);
                  }}
                  data-testid={`button-retry-action-${action.id}`}
                  disabled={retryMutation.isPending}
                >
                  Retry
                </Button>
              )}
            </div>
            <div className="flex-shrink-0 mt-0.5">
              <StatusIcon status={status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
