/**
 * Phase 48 — Onboarding Task Management Page
 * =============================================
 * Manager view: overdue officers sorted by days since hire.
 * Employee drill-down: task checklist with complete/waive actions.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingProgressRing } from "@/components/onboarding/OnboardingProgressRing";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  ChevronRight,
  ClipboardList,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OverdueOfficer {
  employee_id: string;
  first_name: string;
  last_name: string;
  hire_date: string;
  employee_status: string;
  total_tier1: number;
  completed_tier1: number;
  pending_tier1: number;
  days_since_hire: number;
}

interface EmployeeTask {
  id: string;
  tier: number;
  title: string;
  description: string | null;
  is_required: boolean;
  due_by_days: number;
  status: string;
  completion: {
    completed_at?: string;
    waived_reason?: string;
    waived_by?: string;
    notes?: string;
  } | null;
}

interface EmployeeTaskData {
  employeeId: string;
  tier1Blocked: boolean;
  progress: { total: number; completed: number; pct: number };
  byTier: { tier1: EmployeeTask[]; tier2: EmployeeTask[]; tier3: EmployeeTask[] };
  tasks: EmployeeTask[];
}

// ─── Manager Overview ────────────────────────────────────────────────────────
function ManagerOverview({ onSelectEmployee }: { onSelectEmployee: (id: string, name: string) => void }) {
  const { data, isLoading } = useQuery<{ overdueOfficers: OverdueOfficer[] }>({
    queryKey: ["/api/onboarding-tasks/manager"],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    );
  }

  const officers = data?.overdueOfficers ?? [];

  if (officers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <CheckCircle className="h-10 w-10 text-green-500" />
        <p className="font-medium">All officers are onboarding-compliant</p>
        <p className="text-sm">No overdue Tier 1 tasks found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        {officers.length} officer{officers.length !== 1 ? "s" : ""} with incomplete Tier 1 tasks — sorted by hire date
      </p>
      {officers.map((officer) => {
        const days = Math.floor(officer.days_since_hire ?? 0);
        const urgent = days > 3;
        return (
          <Card
            key={officer.employee_id}
            className="cursor-pointer hover-elevate"
            onClick={() =>
              onSelectEmployee(
                officer.employee_id,
                `${officer.first_name} ${officer.last_name}`
              )
            }
            data-testid={`card-overdue-officer-${officer.employee_id}`}
          >
            <CardContent className="flex items-center gap-4 py-3 px-4">
              <div className={cn(
                "rounded-full h-9 w-9 flex items-center justify-center shrink-0 text-sm font-bold",
                urgent ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              )}>
                {days}d
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium leading-tight truncate">
                  {officer.first_name} {officer.last_name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {officer.pending_tier1} of {officer.total_tier1} Tier 1 tasks pending
                </p>
              </div>
              {urgent && (
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 shrink-0">
                  Urgent
                </Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Employee Checklist ───────────────────────────────────────────────────────
function TierSection({
  tier,
  tasks,
  employeeId,
  onAction,
}: {
  tier: number;
  tasks: EmployeeTask[];
  employeeId: string;
  onAction: (task: EmployeeTask, action: "complete" | "waive") => void;
}) {
  const tierLabels: Record<number, string> = {
    1: "Tier 1 — Before First Shift",
    2: "Tier 2 — First 7 Days",
    3: "Tier 3 — First 30 Days",
  };
  const tierColors: Record<number, string> = {
    1: "text-amber-600 dark:text-amber-400",
    2: "text-blue-600 dark:text-blue-400",
    3: "text-violet-600 dark:text-violet-400",
  };

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className={cn("text-xs font-semibold uppercase tracking-wider mb-2", tierColors[tier])}>
        {tierLabels[tier]}
      </h3>
      {tasks.map((task) => {
        const isDone = task.status === "completed" || task.status === "waived";
        return (
          <Card
            key={task.id}
            className={cn(isDone && "opacity-70")}
            data-testid={`card-task-${task.id}`}
          >
            <CardContent className="flex items-start gap-3 py-3 px-4">
              <div className="mt-0.5 shrink-0">
                {task.status === "completed" ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : task.status === "waived" ? (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                ) : task.is_required ? (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium leading-tight", isDone && "line-through text-muted-foreground")}>
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{task.description}</p>
                )}
                {task.status === "waived" && task.completion?.waived_reason && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    Waived: {task.completion.waived_reason}
                  </p>
                )}
                {task.status === "completed" && task.completion?.completed_at && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    Completed {new Date(task.completion.completed_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              {!isDone && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => onAction(task, "complete")}
                    data-testid={`button-complete-task-${task.id}`}
                  >
                    Complete
                  </Button>
                  {task.is_required === false && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2 text-muted-foreground"
                      onClick={() => onAction(task, "waive")}
                      data-testid={`button-waive-task-${task.id}`}
                    >
                      Waive
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function EmployeeChecklist({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [actionTarget, setActionTarget] = useState<{ task: EmployeeTask; action: "complete" | "waive" } | null>(null);
  const [waiveReason, setWaiveReason] = useState("");

  const { data, isLoading } = useQuery<EmployeeTaskData>({
    queryKey: ["/api/onboarding-tasks/employee", employeeId],
    queryFn: () =>
      fetch(`/api/onboarding-tasks/employee/${employeeId}`, {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const completeMutation = useMutation({
    mutationFn: ({ taskId, notes }: { taskId: string; notes?: string }) =>
      apiRequest("POST", `/api/onboarding-tasks/employee/${employeeId}/complete/${taskId}`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-tasks/employee", employeeId] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding-tasks/manager"] });
      toast({ title: "Task marked complete" });
      setActionTarget(null);
    },
    onError: () => toast({ title: "Failed to complete task", variant: "destructive" }),
  });

  const waiveMutation = useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) =>
      apiRequest("POST", `/api/onboarding-tasks/employee/${employeeId}/waive/${taskId}`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-tasks/employee", employeeId] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding-tasks/manager"] });
      toast({ title: "Task waived" });
      setActionTarget(null);
      setWaiveReason("");
    },
    onError: () => toast({ title: "Failed to waive task", variant: "destructive" }),
  });

  function handleAction(task: EmployeeTask, action: "complete" | "waive") {
    if (action === "complete") {
      completeMutation.mutate({ taskId: task.id });
    } else {
      setActionTarget({ task, action });
    }
  }

  function handleWaiveSubmit() {
    if (!actionTarget || !waiveReason.trim()) return;
    waiveMutation.mutate({ taskId: actionTarget.task.id, reason: waiveReason.trim() });
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <OnboardingProgressRing tasks={data.tasks} size={100} showLegend={false} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg leading-tight">{employeeName}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {data.progress.completed} of {data.progress.total} required tasks complete
          </p>
          {data.tier1Blocked && (
            <Badge variant="outline" className="mt-2 bg-red-500/10 text-red-500 border-red-500/30 gap-1.5">
              <TriangleAlert className="h-3 w-3" />
              Clock-in blocked — Tier 1 incomplete
            </Badge>
          )}
        </div>
      </div>

      {/* Task list by tier */}
      <div className="space-y-6">
        <TierSection tier={1} tasks={data.byTier.tier1} employeeId={employeeId} onAction={handleAction} />
        <TierSection tier={2} tasks={data.byTier.tier2} employeeId={employeeId} onAction={handleAction} />
        <TierSection tier={3} tasks={data.byTier.tier3} employeeId={employeeId} onAction={handleAction} />
      </div>

      {/* Waive dialog */}
      <Dialog open={actionTarget?.action === "waive"} onOpenChange={(o) => { if (!o) { setActionTarget(null); setWaiveReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive Task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provide a reason for waiving: <span className="font-medium text-foreground">{actionTarget?.task.title}</span>
          </p>
          <Textarea
            placeholder="Enter reason for waiving this task..."
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            className="resize-none"
            rows={3}
            data-testid="input-waive-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setActionTarget(null); setWaiveReason(""); }}>Cancel</Button>
            <Button
              onClick={handleWaiveSubmit}
              disabled={!waiveReason.trim() || waiveMutation.isPending}
              data-testid="button-confirm-waive"
            >
              Waive Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OnboardingTasksPage() {
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Onboarding Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage employee onboarding compliance
          </p>
        </div>
      </div>

      {selectedEmployee ? (
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedEmployee(null)}
            data-testid="button-back-to-overview"
          >
            ← Back to overview
          </Button>
          <Card>
            <CardContent className="pt-6">
              <EmployeeChecklist employeeId={selectedEmployee.id} employeeName={selectedEmployee.name} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Tabs defaultValue="manager">
          <TabsList data-testid="tabs-onboarding-view">
            <TabsTrigger value="manager" data-testid="tab-manager-view">
              <Users className="h-4 w-4 mr-1.5" />
              Manager View
            </TabsTrigger>
          </TabsList>
          <TabsContent value="manager" className="mt-4">
            <ManagerOverview onSelectEmployee={(id, name) => setSelectedEmployee({ id, name })} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
