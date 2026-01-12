import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, 
  Zap, 
  RotateCcw, 
  Play, 
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Eraser,
  Trash2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DifficultyLevel = "easy" | "medium" | "hard";

interface TrainingStatus {
  hasActiveScenario: boolean;
  currentScenario: {
    id: string;
    name: string;
    description: string;
    difficulty: DifficultyLevel;
    totalShifts: number;
  } | null;
  currentRun: {
    id: string;
    status: string;
    assignedShifts: number;
    failedShifts: number;
    averageConfidence: string | null;
    totalCreditsUsed: string | null;
    confidenceStart: string | null;
    confidenceEnd: string | null;
    confidenceDelta: string | null;
    lessonsLearned: string[] | null;
  } | null;
  shiftsRemaining: number;
  shiftsAssigned: number;
}

const DIFFICULTY_CONFIG: Record<DifficultyLevel, { 
  label: string; 
  color: string; 
  bgColor: string;
  description: string;
}> = {
  easy: {
    label: "Easy",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
    description: "Simple shifts, clear matches, no conflicts"
  },
  medium: {
    label: "Medium",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10",
    description: "Some conflicts, skill requirements, moderate complexity"
  },
  hard: {
    label: "Hard",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    description: "Complex constraints, exclusions, travel pay, low-score employees"
  }
};

export function TrinityTrainingPanel() {
  const { toast } = useToast();
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("easy");

  const { data: status, isLoading } = useQuery<TrainingStatus>({
    queryKey: ["/api/trinity-training/status"],
    refetchInterval: 5000,
  });

  const seedMutation = useMutation({
    mutationFn: async (difficulty: DifficultyLevel) => {
      const res = await apiRequest("/api/trinity-training/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Training Scenario Created",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity-training/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Scenario",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/trinity-training/clear", {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Assignments Cleared",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity-training/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Clear Assignments",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/trinity-training/reset", {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Training Reset",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity-training/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Reset Training",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const startRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiRequest("/api/trinity-training/start-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Training Run Started",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity-training/status"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Run",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-training-loading">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasActiveScenario = status?.hasActiveScenario ?? false;
  const scenario = status?.currentScenario;
  const run = status?.currentRun;
  const shiftsRemaining = status?.shiftsRemaining ?? 0;
  const shiftsAssigned = status?.shiftsAssigned ?? 0;
  const totalShifts = scenario?.totalShifts ?? 50;
  const progress = totalShifts > 0 ? ((shiftsAssigned / totalShifts) * 100) : 0;
  const confidence = run?.averageConfidence ? parseFloat(run.averageConfidence) : null;
  const confidenceDelta = run?.confidenceDelta ? parseFloat(run.confidenceDelta) : null;

  return (
    <Card className="relative overflow-hidden" data-testid="card-training-panel">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-teal-500 to-amber-500" />
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            <CardTitle className="text-lg">Trinity Training</CardTitle>
          </div>
          {hasActiveScenario && scenario && (
            <Badge 
              variant="outline" 
              className={`${DIFFICULTY_CONFIG[scenario.difficulty].color} ${DIFFICULTY_CONFIG[scenario.difficulty].bgColor}`}
            >
              {DIFFICULTY_CONFIG[scenario.difficulty].label}
            </Badge>
          )}
        </div>
        <CardDescription>
          Build Trinity's confidence through practice scenarios
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasActiveScenario ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a difficulty level to generate 50 training shifts for Trinity to practice scheduling.
            </p>
            
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTY_CONFIG) as DifficultyLevel[]).map((level) => (
                <Button
                  key={level}
                  variant={selectedDifficulty === level ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDifficulty(level)}
                  className={`flex flex-col h-auto py-3 ${
                    selectedDifficulty === level 
                      ? "" 
                      : DIFFICULTY_CONFIG[level].bgColor
                  }`}
                  data-testid={`button-difficulty-${level}`}
                >
                  <span className={selectedDifficulty === level ? "" : DIFFICULTY_CONFIG[level].color}>
                    {DIFFICULTY_CONFIG[level].label}
                  </span>
                </Button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {DIFFICULTY_CONFIG[selectedDifficulty].description}
            </p>

            <Button 
              className="w-full"
              onClick={() => seedMutation.mutate(selectedDifficulty)}
              disabled={seedMutation.isPending}
              data-testid="button-create-scenario"
            >
              {seedMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Create Training Scenario
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">
                  {shiftsAssigned} / {totalShifts} shifts assigned
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{shiftsRemaining} remaining</span>
                <span>{Math.round(progress)}% complete</span>
              </div>
            </div>

            {confidence !== null && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-purple-500/10 text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {(confidence * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Confidence</div>
                </div>
                {confidenceDelta !== null && (
                  <div className={`p-3 rounded-lg text-center ${
                    confidenceDelta >= 0 ? "bg-green-500/10" : "bg-red-500/10"
                  }`}>
                    <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${
                      confidenceDelta >= 0 
                        ? "text-green-600 dark:text-green-400" 
                        : "text-red-600 dark:text-red-400"
                    }`}>
                      {confidenceDelta >= 0 ? (
                        <TrendingUp className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                      {confidenceDelta >= 0 ? "+" : ""}{(confidenceDelta * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Confidence Growth</div>
                  </div>
                )}
              </div>
            )}

            {run?.status === "pending" && (
              <Button 
                className="w-full"
                onClick={() => startRunMutation.mutate(run.id)}
                disabled={startRunMutation.isPending}
                data-testid="button-start-training"
              >
                {startRunMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Start Training Run
              </Button>
            )}

            {run?.status === "running" && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-blue-500/10">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  Trinity is training...
                </span>
              </div>
            )}

            {run?.status === "completed" && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-500/10">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">
                  Training Complete!
                </span>
              </div>
            )}

            {run?.lessonsLearned && run.lessonsLearned.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium">Lessons Learned</span>
                </div>
                <ul className="space-y-1">
                  {run.lessonsLearned.slice(0, 3).map((lesson, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-purple-500">-</span>
                      {lesson}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline"
                className="w-full"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending || shiftsAssigned === 0}
                data-testid="button-clear-assignments"
              >
                {clearMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Eraser className="w-4 h-4 mr-2" />
                )}
                Clear
              </Button>
              <Button 
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                data-testid="button-reset-training"
              >
                {resetMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Delete All
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Clear re-opens shifts for next run. Delete removes all training data.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
