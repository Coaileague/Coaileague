import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, Clock, AlertTriangle, Shield, ChevronDown, ChevronUp } from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  type: string;
  tier: number;
  blocking: boolean;
  status: string;
  completedAt?: string;
  order: number;
}

interface ProgressData {
  totalSteps: number;
  completedSteps: number;
  percentComplete: number;
  currentTier: number;
  steps: OnboardingStep[];
  status: string;
  blockers: string[];
}

interface PipelineData {
  id: string;
  pipelineType: string;
  status: string;
  progress: ProgressData;
  createdAt: string;
}

const TIER_LABELS: Record<number, string> = {
  0: "Offer & Agreement",
  1: "Required Documents",
  2: "Certifications & ID",
  3: "Profile Setup",
};

const TYPE_ICONS: Record<string, string> = {
  form: "Form",
  signature: "Signature Required",
  upload: "Upload",
  document: "Document",
  action: "Action",
  consent: "Consent",
};

export default function OnboardingProgressPage() {
  const { id } = useParams<{ id: string }>();
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTier, setExpandedTier] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/onboarding-pipeline/public/${id}`)
      .then((res) => {
        if (!res.ok) return res.json().then((e) => Promise.reject(e.error || "Not found"));
        return res.json();
      })
      .then((data) => {
        setPipeline(data);
        // Auto-expand current tier
        setExpandedTier(data.progress.currentTier);
      })
      .catch((err) => setError(typeof err === "string" ? err : "Onboarding progress not found."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading onboarding progress...</p>
        </div>
      </div>
    );
  }

  if (error || !pipeline) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Not Found</h2>
            <p className="text-muted-foreground text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { progress } = pipeline;
  const tiers = [0, 1, 2, 3];

  const stepsByTier = tiers.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    steps: progress.steps
      .filter((s) => s.tier === tier)
      .sort((a, b) => a.order - b.order),
  }));

  const isComplete = pipeline.status === "complete";

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">CoAIleague Onboarding</span>
          </div>
          <h1 className="text-2xl font-bold" data-testid="onboarding-title">
            {isComplete ? "Onboarding Complete!" : "Your Onboarding Progress"}
          </h1>
          {isComplete ? (
            <p className="text-muted-foreground">
              You have completed all onboarding steps. Welcome to the team!
            </p>
          ) : (
            <p className="text-muted-foreground">
              Track your progress and see what steps remain.
            </p>
          )}
        </div>

        {/* Overall Progress */}
        <Card>
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Overall Progress</p>
                <p className="text-sm text-muted-foreground">
                  {progress.completedSteps} of {progress.totalSteps} steps complete
                </p>
              </div>
              <Badge
                variant={isComplete ? "default" : progress.percentComplete >= 50 ? "secondary" : "outline"}
                data-testid="status-badge"
              >
                {isComplete ? "Complete" : `${progress.percentComplete}%`}
              </Badge>
            </div>
            <Progress value={progress.percentComplete} data-testid="progress-bar" />

            {progress.blockers.length > 0 && !isComplete && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2 space-y-1">
                <p className="text-sm font-medium text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Action Required
                </p>
                {progress.blockers.map((b) => (
                  <p key={b} className="text-sm text-muted-foreground pl-5">{b}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Steps by Tier */}
        {stepsByTier.map(({ tier, label, steps }) => {
          if (steps.length === 0) return null;
          const tierComplete = steps.every((s) => s.status === "completed");
          const tierInProgress = steps.some((s) => s.status === "completed") && !tierComplete;
          const isExpanded = expandedTier === tier;

          return (
            <Card key={tier} className={tierComplete ? "opacity-80" : ""}>
              <button
                className="w-full text-left"
                onClick={() => setExpandedTier(isExpanded ? null : tier)}
                data-testid={`tier-${tier}-toggle`}
              >
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {tierComplete ? (
                        <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                      ) : tier === progress.currentTier ? (
                        <Clock className="w-5 h-5 text-primary shrink-0 animate-pulse" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                      )}
                      <div>
                        <CardTitle className="text-base">
                          Phase {tier + 1}: {label}
                        </CardTitle>
                        <CardDescription>
                          {steps.filter((s) => s.status === "completed").length}/{steps.length} steps complete
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tierComplete && <Badge variant="secondary" className="text-xs">Done</Badge>}
                      {tierInProgress && <Badge variant="default" className="text-xs">In Progress</Badge>}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>
              </button>

              {isExpanded && (
                <CardContent className="pb-4 pt-0">
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                          step.status === "completed" ? "bg-muted/30" : "bg-card"
                        }`}
                        data-testid={`step-${step.id}`}
                      >
                        {step.status === "completed" ? (
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${step.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                            {step.title}
                          </p>
                          {step.completedAt && (
                            <p className="text-xs text-muted-foreground">
                              Completed {new Date(step.completedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {step.blocking && step.status !== "completed" && (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {TYPE_ICONS[step.type] || step.type}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {isComplete && (
          <Card>
            <CardContent className="pt-6 pb-6 text-center space-y-3">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold">All steps complete!</p>
              <p className="text-sm text-muted-foreground">
                Your onboarding is finished. Contact your supervisor if you have questions.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
            data-testid="button-refresh-progress"
          >
            Refresh Progress
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1 pb-2">
          <Shield className="w-3 h-3" />
          Secured by CoAIleague — All information is encrypted
        </p>
      </div>
    </div>
  );
}
