/**
 * TrinityTaskWidget — Global task-tracking modal.
 * =================================================
 *
 * A single, aesthetically-consistent modal for every task Trinity (or the
 * platform itself) needs the signed-in user to act on:
 *   • Pending approvals (ai_approvals → sourceSystem = 'trinity' | 'ai_brain')
 *   • Onboarding steps (interactive_onboarding_state)
 *   • Compliance items (regulatory actions waiting on a human)
 *
 * UX goals:
 *   • Always reachable from the universal header (TrinityTaskLauncher).
 *   • Auto-opens once when a new urgent/high-priority task arrives.
 *   • Tracks multi-step progress (onboarding %).
 *   • Dismiss closes for this session; reopens on the next new task.
 *
 * Mount location:  a single <TrinityTaskWidget /> sits inside App.tsx.
 * Open control  :  call `openTrinityTaskWidget()` from anywhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  UniversalModal,
  UniversalModalHeader,
  UniversalModalTitle,
  UniversalModalDescription,
} from "@/components/ui/universal-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Bell,
  Sparkles,
  Shield,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Clock,
  AlertTriangle,
  Trophy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useApprovalDecision } from "@/hooks/useApprovals";
import { useTrinityTasks, type TrinityTask } from "@/hooks/useTrinityTasks";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const OPEN_EVENT = "trinity:open-task-widget";
const CLOSE_EVENT = "trinity:close-task-widget";
const SEEN_KEY = "trinity_task_widget_seen_ids";
const DISMISSED_AT_KEY = "trinity_task_widget_dismissed_at";
const AUTO_OPEN_COOLDOWN_MS = 90_000;

function loadSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore storage errors */
  }
}

function dismissedRecently(): boolean {
  try {
    const raw = sessionStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < AUTO_OPEN_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function recordDismissal(): void {
  try {
    sessionStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function openTrinityTaskWidget(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function closeTrinityTaskWidget(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
}

// ─── Launcher button (used inside UniversalHeader) ────────────────────────

interface TrinityTaskLauncherProps {
  compact?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function TrinityTaskLauncher({
  compact = false,
  className,
  "data-testid": testId = "button-trinity-task-launcher",
}: TrinityTaskLauncherProps) {
  const { pendingCount, urgentCount } = useTrinityTasks();

  if (pendingCount === 0) return null;

  const urgent = urgentCount > 0;
  const size = compact ? "w-8 h-8" : "h-9 w-9";

  return (
    <button
      onClick={openTrinityTaskWidget}
      data-testid={testId}
      aria-label={`Trinity tasks${pendingCount > 0 ? `, ${pendingCount} pending` : ""}`}
      title={urgent ? "Trinity needs your attention" : "Tasks from Trinity"}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full transition-all duration-200",
        size,
        urgent
          ? "bg-gradient-to-br from-amber-500/20 to-rose-500/20 ring-1 ring-amber-400/50 hover:ring-amber-300"
          : "bg-accent/40 hover:bg-accent/70 ring-1 ring-border",
        className,
      )}
    >
      <ClipboardCheck
        className={cn(
          "h-4 w-4 transition-colors",
          urgent ? "text-amber-500" : "text-foreground/80",
        )}
      />
      <span
        data-testid="badge-trinity-task-count"
        className={cn(
          "absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center",
          "text-white pointer-events-none shadow-sm",
          urgent
            ? "bg-gradient-to-br from-amber-500 to-rose-500"
            : "bg-gradient-to-br from-cyan-500 to-blue-600",
        )}
      >
        {pendingCount > 9 ? "9+" : pendingCount}
      </span>
      {urgent && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full ring-2 ring-amber-400/40 animate-ping"
          style={{ animationDuration: "2.4s" }}
        />
      )}
    </button>
  );
}

// ─── Task row ──────────────────────────────────────────────────────────────

function kindMeta(kind: TrinityTask["kind"]) {
  switch (kind) {
    case "approval":
      return {
        icon: <Sparkles className="h-4 w-4" />,
        label: "Trinity approval",
        accent: "from-cyan-500/10 to-blue-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-300",
      };
    case "compliance":
      return {
        icon: <Shield className="h-4 w-4" />,
        label: "Compliance",
        accent: "from-rose-500/10 to-orange-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300",
      };
    case "onboarding":
    default:
      return {
        icon: <ClipboardCheck className="h-4 w-4" />,
        label: "Onboarding",
        accent: "from-emerald-500/10 to-teal-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
      };
  }
}

function priorityTone(p: TrinityTask["priority"]) {
  switch (p) {
    case "urgent":
      return "bg-rose-500/15 text-rose-600 border-rose-500/30";
    case "high":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "low":
      return "bg-muted text-muted-foreground border-border";
    case "normal":
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}

interface TaskRowProps {
  task: TrinityTask;
  onAct: (task: TrinityTask) => void;
  onComplete: (task: TrinityTask) => void;
  onReject: (task: TrinityTask) => void;
  isBusy: boolean;
}

function TaskRow({ task, onAct, onComplete, onReject, isBusy }: TaskRowProps) {
  const meta = kindMeta(task.kind);
  return (
    <div
      className={cn(
        "group relative p-3 border rounded-lg bg-gradient-to-br transition-shadow",
        "hover:shadow-md",
        meta.accent,
      )}
      data-testid={`trinity-task-row-${task.id}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide font-semibold opacity-70">
              {meta.label}
            </span>
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-4", priorityTone(task.priority))}
            >
              {task.priority}
            </Badge>
            {task.expiresAt && (
              <span className="text-[10px] text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Expires {formatDistanceToNow(new Date(task.expiresAt), { addSuffix: true })}
              </span>
            )}
          </div>
          <p className="font-medium text-sm mt-1 text-foreground truncate">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {task.description}
            </p>
          )}
          {task.kind === "onboarding" && task.onboarding && typeof task.progress === "number" && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Step {task.onboarding.completedSteps + 1} of {task.onboarding.totalSteps}
                </span>
                <span className="font-semibold">{task.progress}%</span>
              </div>
              <Progress value={task.progress} className="h-1.5" />
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        {task.kind === "approval" ? (
          <>
            <Button
              size="sm"
              onClick={() => onComplete(task)}
              disabled={isBusy}
              className="flex-1 h-8 text-xs"
              data-testid={`button-task-approve-${task.id}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject(task)}
              disabled={isBusy}
              className="h-8 text-xs"
              data-testid={`button-task-reject-${task.id}`}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
          </>
        ) : task.kind === "onboarding" ? (
          <>
            <Button
              size="sm"
              onClick={() => onAct(task)}
              className="flex-1 h-8 text-xs"
              data-testid={`button-task-start-${task.id}`}
            >
              {task.actionRoute ? "Open" : "Start"}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onComplete(task)}
              disabled={isBusy}
              className="h-8 text-xs"
              data-testid={`button-task-done-${task.id}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark done
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => onAct(task)}
            className="flex-1 h-8 text-xs"
            data-testid={`button-task-review-${task.id}`}
          >
            Review
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Widget shell ──────────────────────────────────────────────────────────

export function TrinityTaskWidget() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { tasks, pendingCount, urgentCount, onboarding, isLoading } = useTrinityTasks();
  const approvalDecision = useApprovalDecision();

  const [open, setOpen] = useState(false);
  const seenIdsRef = useRef<Set<string>>(loadSeenIds());
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  // Listen for external open/close triggers.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener(CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener(CLOSE_EVENT, onClose);
    };
  }, []);

  // Auto-open when a *new* urgent/high task appears — once per cooldown.
  useEffect(() => {
    if (!isAuthenticated || tasks.length === 0 || open) return;

    const seen = seenIdsRef.current;
    const freshUrgent = tasks.find(
      (t) => !seen.has(t.id) && (t.priority === "urgent" || t.priority === "high"),
    );

    if (freshUrgent && !dismissedRecently()) {
      setOpen(true);
    }

    // Always mark current tasks as seen so we don't flap.
    let changed = false;
    for (const t of tasks) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        changed = true;
      }
    }
    if (changed) saveSeenIds(seen);
  }, [tasks, open, isAuthenticated]);

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) recordDismissal();
    setOpen(next);
  }, []);

  const handleAct = useCallback(
    (task: TrinityTask) => {
      if (task.actionRoute) {
        setLocation(task.actionRoute);
        setOpen(false);
        return;
      }
      if (task.kind === "onboarding") {
        setLocation("/dashboard");
        setOpen(false);
        return;
      }
      if (task.kind === "compliance") {
        setLocation("/compliance");
        setOpen(false);
      }
    },
    [setLocation],
  );

  const handleComplete = useCallback(
    async (task: TrinityTask) => {
      setBusyTaskId(task.id);
      try {
        if (task.kind === "approval" && task.approval) {
          await approvalDecision.mutateAsync({
            approvalId: task.approval.id,
            decision: "approved",
          });
        } else if (task.kind === "onboarding" && task.onboarding) {
          await apiRequest(
            "POST",
            `/api/experience/onboarding/steps/${task.onboarding.stepId}/complete`,
          );
          queryClient.invalidateQueries({
            queryKey: ["/api/experience/onboarding/progress"],
          });
          toast({ title: "Step complete", description: task.title });
        }
      } catch (err) {
        toast({
          title: "Couldn't complete that",
          description: err instanceof Error ? err.message : "Please try again",
          variant: "destructive",
        });
      } finally {
        setBusyTaskId(null);
      }
    },
    [approvalDecision, toast],
  );

  const handleReject = useCallback(
    async (task: TrinityTask) => {
      if (task.kind !== "approval" || !task.approval) return;
      setBusyTaskId(task.id);
      try {
        await approvalDecision.mutateAsync({
          approvalId: task.approval.id,
          decision: "rejected",
        });
      } finally {
        setBusyTaskId(null);
      }
    },
    [approvalDecision],
  );

  const grouped = useMemo(() => {
    const g: Record<TrinityTask["kind"], TrinityTask[]> = {
      approval: [],
      compliance: [],
      onboarding: [],
    };
    for (const t of tasks) g[t.kind].push(t);
    return g;
  }, [tasks]);

  if (!isAuthenticated) return null;

  const onboardingComplete = onboarding?.isComplete ?? false;

  return (
    <UniversalModal
      open={open}
      onOpenChange={onOpenChange}
      size="default"
      side="bottom"
      data-testid="trinity-task-widget"
    >
      <UniversalModalHeader className="border-b pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <UniversalModalTitle className="text-base">
              Trinity needs your attention
            </UniversalModalTitle>
            <UniversalModalDescription className="text-xs">
              {pendingCount === 0
                ? "You're all caught up."
                : `${pendingCount} item${pendingCount === 1 ? "" : "s"}${urgentCount > 0 ? ` — ${urgentCount} urgent` : ""}`}
            </UniversalModalDescription>
          </div>
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-[11px]">
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </UniversalModalHeader>

      <ScrollArea className="max-h-[60vh] px-1 py-3">
        {isLoading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Bell className="h-4 w-4 mr-2 animate-pulse" /> Checking with Trinity…
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {grouped.approval.length > 0 && (
              <TaskSection
                title="Waiting on you"
                hint="Trinity needs a decision before she acts."
                tasks={grouped.approval}
                onAct={handleAct}
                onComplete={handleComplete}
                onReject={handleReject}
                busyTaskId={busyTaskId}
              />
            )}
            {grouped.compliance.length > 0 && (
              <TaskSection
                title="Compliance follow-ups"
                hint="Required to keep your org audit-ready."
                tasks={grouped.compliance}
                onAct={handleAct}
                onComplete={handleComplete}
                onReject={handleReject}
                busyTaskId={busyTaskId}
              />
            )}
            {grouped.onboarding.length > 0 && !onboardingComplete && (
              <TaskSection
                title="Finish setup"
                hint="A few steps to unlock Trinity's full power."
                tasks={grouped.onboarding}
                onAct={handleAct}
                onComplete={handleComplete}
                onReject={handleReject}
                busyTaskId={busyTaskId}
                footer={
                  onboarding ? (
                    <div className="text-[11px] text-muted-foreground pl-1">
                      {onboarding.completedSteps} of {onboarding.totalSteps} complete ·
                      ~{onboarding.estimatedMinutesRemaining} min remaining
                    </div>
                  ) : null
                }
              />
            )}
          </div>
        )}
      </ScrollArea>
    </UniversalModal>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TaskSection({
  title,
  hint,
  tasks,
  onAct,
  onComplete,
  onReject,
  busyTaskId,
  footer,
}: {
  title: string;
  hint: string;
  tasks: TrinityTask[];
  onAct: (task: TrinityTask) => void;
  onComplete: (task: TrinityTask) => void;
  onReject: (task: TrinityTask) => void;
  busyTaskId: string | null;
  footer?: React.ReactNode;
}) {
  return (
    <section>
      <header className="px-1 mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </header>
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onAct={onAct}
            onComplete={onComplete}
            onReject={onReject}
            isBusy={busyTaskId === t.id}
          />
        ))}
      </div>
      {footer}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-600 mb-3">
        <Trophy className="h-6 w-6" />
      </span>
      <p className="font-semibold text-sm">You're all caught up</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Trinity will ping you here whenever something needs a decision, a
        compliance step, or part of setup.
      </p>
    </div>
  );
}
