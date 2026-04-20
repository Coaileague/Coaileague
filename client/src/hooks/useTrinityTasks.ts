/**
 * useTrinityTasks — unified feed of items that need the user's attention.
 *
 * Aggregates three sources into one prioritized list so Trinity can surface
 * everything needing action in a single widget:
 *
 *  1. Pending approvals  — /api/approvals?decision=pending  (sourceSystem filter)
 *  2. Onboarding steps    — /api/experience/onboarding/progress
 *  3. Compliance items    — /api/compliance/tasks/pending   (optional, tolerant)
 *
 * Each source is fetched independently; failures never cascade.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { secureFetch } from "@/lib/csrf";
import { useAuth } from "@/hooks/useAuth";
import type { ApprovalRequest } from "@/hooks/useApprovals";

export type TaskKind = "approval" | "onboarding" | "compliance";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface TrinityTask {
  id: string;
  kind: TaskKind;
  title: string;
  description: string | null;
  priority: TaskPriority;
  createdAt: string;
  expiresAt?: string | null;
  /** % complete for multi-step tasks (onboarding). 0–100. */
  progress?: number;
  /** Optional deep-link for "Take action". */
  actionRoute?: string;
  /** For approvals only — raw record needed to approve/reject. */
  approval?: ApprovalRequest;
  /** For onboarding only — step identifiers for step-completion API. */
  onboarding?: {
    stepId: string;
    totalSteps: number;
    completedSteps: number;
  };
  /** For compliance only — category + linked record id. */
  compliance?: {
    category: string;
    recordId?: string;
  };
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  order: number;
  completed: boolean;
  skipped: boolean;
  action?: { label: string; route?: string };
}

interface OnboardingProgress {
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  percentComplete: number;
  currentStep: OnboardingStep | null;
  steps: OnboardingStep[];
  isComplete: boolean;
  estimatedMinutesRemaining: number;
}

interface ComplianceTask {
  id: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  category?: string;
  severity?: "informational" | "warning" | "critical";
  createdAt?: string;
  expiresAt?: string | null;
  recordId?: string;
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const KIND_WEIGHT: Record<TaskKind, number> = {
  approval: 3,
  compliance: 2,
  onboarding: 1,
};

export function useTrinityTasks() {
  const { isAuthenticated } = useAuth();

  const approvalsQuery = useQuery<ApprovalRequest[]>({
    queryKey: ["/api/approvals", { decision: ["pending"], scope: "employee", limit: 25 }],
    queryFn: async () => {
      const res = await secureFetch(
        "/api/approvals?decision=pending&scope=employee&limit=25",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("approvals fetch failed");
      const json = await res.json();
      return json.approvals ?? [];
    },
    enabled: isAuthenticated,
    refetchInterval: 20_000,
    retry: false,
  });

  const onboardingQuery = useQuery<OnboardingProgress>({
    queryKey: ["/api/experience/onboarding/progress"],
    queryFn: async () => {
      const res = await secureFetch("/api/experience/onboarding/progress", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("onboarding fetch failed");
      return res.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    retry: false,
  });

  const complianceQuery = useQuery<ComplianceTask[]>({
    queryKey: ["/api/compliance/tasks/pending"],
    queryFn: async () => {
      const res = await secureFetch("/api/compliance/tasks/pending", {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json?.tasks ?? []);
    },
    enabled: isAuthenticated,
    refetchInterval: 90_000,
    retry: false,
  });

  const tasks = useMemo<TrinityTask[]>(() => {
    const out: TrinityTask[] = [];

    for (const a of approvalsQuery.data ?? []) {
      out.push({
        id: `approval:${a.id}`,
        kind: "approval",
        title: a.title,
        description: a.description,
        priority: a.priority,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
        approval: a,
      });
    }

    const onboarding = onboardingQuery.data;
    if (onboarding && !onboarding.isComplete && onboarding.currentStep) {
      const step = onboarding.currentStep;
      out.push({
        id: `onboarding:${step.id}`,
        kind: "onboarding",
        title: step.title,
        description: step.description,
        priority: onboarding.percentComplete < 25 ? "high" : "normal",
        createdAt: new Date().toISOString(),
        progress: onboarding.percentComplete,
        actionRoute: step.action?.route,
        onboarding: {
          stepId: step.id,
          totalSteps: onboarding.totalSteps,
          completedSteps: onboarding.completedSteps,
        },
      });
    }

    for (const c of complianceQuery.data ?? []) {
      const severity = c.severity ?? "informational";
      const priority: TaskPriority = c.priority
        ?? (severity === "critical" ? "urgent" : severity === "warning" ? "high" : "normal");
      out.push({
        id: `compliance:${c.id}`,
        kind: "compliance",
        title: c.title,
        description: c.description ?? null,
        priority,
        createdAt: c.createdAt ?? new Date().toISOString(),
        expiresAt: c.expiresAt ?? null,
        compliance: { category: c.category ?? "general", recordId: c.recordId },
      });
    }

    out.sort((x, y) => {
      const p = PRIORITY_WEIGHT[y.priority] - PRIORITY_WEIGHT[x.priority];
      if (p !== 0) return p;
      const k = KIND_WEIGHT[y.kind] - KIND_WEIGHT[x.kind];
      if (k !== 0) return k;
      return new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime();
    });

    return out;
  }, [approvalsQuery.data, onboardingQuery.data, complianceQuery.data]);

  const urgentCount = tasks.filter((t) => t.priority === "urgent" || t.priority === "high").length;
  const onboarding = onboardingQuery.data ?? null;

  return {
    tasks,
    onboarding,
    isLoading:
      approvalsQuery.isLoading || onboardingQuery.isLoading || complianceQuery.isLoading,
    pendingCount: tasks.length,
    urgentCount,
  };
}
