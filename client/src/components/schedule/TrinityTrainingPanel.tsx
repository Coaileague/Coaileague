import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Brain,
  Zap,
  TrendingUp,
  CheckCircle2,
  Loader2,
  Trash2,
  Database,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTrinitySchedulingProgress } from "@/hooks/use-trinity-scheduling-progress";

type DifficultyLevel = "easy" | "medium" | "hard" | "meta" | "extreme";

const DIFFICULTY_CONFIG: Record<DifficultyLevel, {
  label: string;
  color: string;
  bgColor: string;
  demandNote: string;
  multiplier: string;
  staffNote: string;
}> = {
  easy: {
    label: "Easy",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
    demandNote: "Baseline — real client demands as-is, full 7-day staff pool available",
    multiplier: "1×",
    staffNote: "25 shifts/employee cap · contractor fallback on",
  },
  medium: {
    label: "Medium",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10",
    demandNote: "1.5× — extra evening windows added per client site, real availability constraints",
    multiplier: "1.5×",
    staffNote: "20 shifts/employee cap · staff only",
  },
  hard: {
    label: "Hard",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    demandNote: "2× — evening + night shifts, weekends forced for all clients, tighter coverage windows",
    multiplier: "2×",
    staffNote: "16 shifts/employee cap · staff only",
  },
  meta: {
    label: "META",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-500/10",
    demandNote: "3× — full 7-day coverage forced per client, multiple concurrent officers, resource crunch",
    multiplier: "3×",
    staffNote: "12 shifts/employee cap · staff only",
  },
  extreme: {
    label: "EXTREME",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    demandNote: "4× — 24/7 three-shift cycles for every client, near-impossible allocation challenge",
    multiplier: "4×",
    staffNote: "8 shifts/employee cap · staff only · crisis mode",
  },
};

interface TrinityTrainingPanelProps {
  workspaceId?: string;
}

export function TrinityTrainingPanel({ workspaceId }: TrinityTrainingPanelProps) {
  const { toast } = useToast();
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("easy");

  const {
    session,
    completionResult,
    clearSession,
    completedShifts,
    trinityWorking,
  } = useTrinitySchedulingProgress(workspaceId);

  const isScheduling = trinityWorking;
  const cfg = DIFFICULTY_CONFIG[selectedDifficulty];

  const clearAllScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trinity-training/clear-all-schedule", { workspaceId });
      return res.json();
    },
    onSuccess: (data) => {
      clearSession();
      toast({ title: "Schedule Cleared", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity-training/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules/week/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to Clear Schedule", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const trainMutation = useMutation({
    mutationFn: async (difficulty: DifficultyLevel) => {
      const res = await apiRequest("POST", "/api/trinity-training/schedule-month", {
        workspaceId,
        difficulty,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `Trinity Training — ${data.difficulty ?? selectedDifficulty}`,
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
    },
    onError: (error: any) => {
      toast({ title: "Training Failed", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const isBusy = trainMutation.isPending || clearAllScheduleMutation.isPending || isScheduling;
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const processedSoFar = session.currentIndex ?? 0;
  const totalShifts = session.totalShifts ?? 0;
  const assignedSoFar = completedShifts.length;
  const assignedPct = totalShifts > 0 ? Math.round((processedSoFar / totalShifts) * 100) : 0;

  return (
    <Card className="relative overflow-hidden" data-testid="card-training-panel">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            <CardTitle className="text-lg">Trinity Training</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs gap-1 border-cyan-500/40 text-cyan-600 dark:text-cyan-400">
            <Database className="w-3 h-3" />
            Real Acme Data
          </Badge>
        </div>
        <CardDescription>
          Live stress-test using your real clients and staff — difficulty dials up demand intensity
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => setClearConfirmOpen(true)}
          disabled={isBusy}
          data-testid="button-clear-all-schedule"
        >
          {clearAllScheduleMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4 mr-2" />
          )}
          <span className="truncate">Clear All Schedule Data</span>
        </Button>

        <div className="border-t pt-4" />

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-0.5">Demand Intensity</p>
            <p className="text-xs text-muted-foreground">
              Scales real client coverage requirements — same actual clients, same real staff, higher demand
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(DIFFICULTY_CONFIG) as DifficultyLevel[]).map((level) => {
              const c = DIFFICULTY_CONFIG[level];
              const isSelected = selectedDifficulty === level;
              return (
                <Button
                  key={level}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDifficulty(level)}
                  disabled={isBusy}
                  className={`py-1.5 px-3 ${!isSelected ? c.bgColor : ""}`}
                  data-testid={`button-difficulty-${level}`}
                >
                  <span className={isSelected ? "" : c.color}>
                    {c.multiplier} {c.label}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="p-3 rounded-lg bg-muted/40 space-y-1">
            <p className="text-xs text-foreground font-medium">{cfg.demandNote}</p>
            <p className="text-[11px] text-muted-foreground">{cfg.staffNote}</p>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={() => trainMutation.mutate(selectedDifficulty)}
          disabled={isBusy}
          data-testid="button-run-training"
        >
          {(trainMutation.isPending || isScheduling) ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 mr-2" />
          )}
          <span className="truncate">
            {isScheduling
              ? "Trinity is scheduling..."
              : trainMutation.isPending
                ? "Generating real shifts..."
                : `Run Trinity Training — ${cfg.label}`}
          </span>
        </Button>

        {isScheduling && (
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-3" data-testid="training-progress-box">
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {session.message || "Trinity is autonomously scheduling..."}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Shifts processed</span>
                <span className="font-medium">{processedSoFar} of {totalShifts}</span>
              </div>
              <Progress value={assignedPct} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded bg-background/50">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{assignedSoFar}</div>
                <div className="text-[10px] text-muted-foreground">Completed</div>
              </div>
              <div className="p-2 rounded bg-background/50">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {Math.max(0, totalShifts - processedSoFar)}
                </div>
                <div className="text-[10px] text-muted-foreground">Remaining</div>
              </div>
            </div>

            <p className="text-[10px] text-center text-muted-foreground">
              Trinity is working through your real Acme shifts. Do not close this page.
            </p>
          </div>
        )}

        {!isScheduling && completionResult && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20" data-testid="training-complete-notice">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                Training Complete
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-2 rounded bg-background/50">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                  {completionResult.summary?.openShiftsFilled ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Shifts Filled</div>
              </div>
              <div className="p-2 rounded bg-background/50">
                <div className="text-xl font-bold text-muted-foreground">
                  {completionResult.mutationCount ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Total Actions</div>
              </div>
            </div>
            {completionResult.summary?.totalHoursScheduled != null && (
              <div className="mt-2 flex items-center justify-center gap-1 text-xs">
                <TrendingUp className="w-3 h-3 text-purple-500" />
                <span className="text-muted-foreground">Hours scheduled:</span>
                <span className="font-medium">{completionResult.summary.totalHoursScheduled.toFixed(1)}h</span>
              </div>
            )}
            <p className="text-[10px] text-center text-muted-foreground mt-2">
              Use "Clear All Schedule Data" above to reset and run another training cycle.
            </p>
          </div>
        )}
      </CardContent>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Schedule Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete ALL shifts, time entries, and related schedule data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-clear-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-clear-confirm"
              onClick={() => { setClearConfirmOpen(false); clearAllScheduleMutation.mutate(); }}
              className="bg-destructive text-destructive-foreground"
            >
              Yes, Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
