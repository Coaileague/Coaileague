import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { useWebSocketBus } from "@/providers/WebSocketProvider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

/**
 * OnboardingProgressBanner
 * ========================
 * Sticky top-of-page banner shown to authenticated users until their
 * workspace is fully onboarded. Reads `onboardingState` (now embedded in
 * /api/auth/me) and `GET /api/workspace/onboarding/progress`. Lets the
 * user see "X of Y steps — finish to unlock Trinity Swarm" without ever
 * needing to open the wizard.
 *
 * Auto-listens for the `onboarding_completed` WS event so the moment the
 * server flips the flag, the banner morphs into a celebration card and
 * dismisses itself after a short interval.
 */

interface OnboardingProgress {
  requiredKeys: string[];
  stepsCompleted: Record<string, boolean>;
  percent: number;
  fullyComplete: boolean;
  fullyCompleteAt?: string | null;
}

const DISMISS_KEY = "onboarding_banner_dismissed_until";

function isDismissedNow(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() < Number(raw);
  } catch {
    return false;
  }
}

function dismissForOneHour(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 60 * 60 * 1000));
  } catch {
    /* ignore quota errors */
  }
}

export function OnboardingProgressBanner(): JSX.Element | null {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const bus = useWebSocketBus();

  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedNow());
  const [celebrate, setCelebrate] = useState<boolean>(false);

  const { data, isLoading } = useQuery<OnboardingProgress>({
    queryKey: ["/api/workspace/onboarding/progress"],
    refetchOnWindowFocus: false,
  });

  // Listen for the onboarding_completed WS event so the banner reflows
  // immediately when TrinityOnboardingCompletionHandler fires.
  useEffect(() => {
    return bus.subscribe("onboarding_completed", () => {
      setCelebrate(true);
      qc.invalidateQueries({ queryKey: ["/api/workspace/onboarding/progress"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setTimeout(() => setCelebrate(false), 12_000);
    });
  }, [bus, qc]);

  const completeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/workspace/onboarding/complete", {}),
    onSuccess: () => {
      // Skip the toast if the WS event already fired the celebration card —
      // the user would otherwise see "Onboarding complete" + "Trinity is
      // ready" within the same tick.
      if (!celebrate) {
        toast({ title: "Onboarding complete", description: "Trinity Swarm and intake flows are now unlocked." });
      }
      qc.invalidateQueries({ queryKey: ["/api/workspace/onboarding/progress"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: any) => {
      toast({ title: "Could not finish onboarding", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  const nextStepKey = useMemo<string | null>(() => {
    if (!data?.requiredKeys) return null;
    return data.requiredKeys.find((k) => data.stepsCompleted?.[k] !== true) || null;
  }, [data]);

  const requiredCount = data?.requiredKeys?.length ?? 0;
  const doneCount = useMemo<number>(() => {
    if (!data?.requiredKeys || !data.stepsCompleted) return 0;
    return data.requiredKeys.filter((k) => data.stepsCompleted[k] === true).length;
  }, [data]);

  if (isLoading || !data) return null;
  if (data.fullyComplete && !celebrate) return null;
  if (dismissed && !celebrate) return null;

  if (celebrate || data.fullyComplete) {
    return (
      <div
        className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 text-white px-4 py-2 flex items-center justify-between text-sm shadow-md"
        data-testid="banner-onboarding-celebration"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span>Trinity is ready — Swarm, intake flows, and self-edit are unlocked.</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/15"
          onClick={() => {
            setCelebrate(false);
            dismissForOneHour();
            setDismissed(true);
          }}
          data-testid="button-dismiss-celebration"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const allRequiredDone = doneCount === requiredCount && requiredCount > 0;

  return (
    <div
      className="w-full bg-gradient-to-r from-amber-500/95 to-amber-600/95 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm shadow-md"
      data-testid="banner-onboarding-progress"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">
          <strong>{doneCount} of {requiredCount}</strong> setup steps complete — finish to unlock Trinity Swarm and intake flows.
        </span>
        <div className="hidden md:block w-32 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white"
            style={{ width: `${data.percent}%` }}
            data-testid="bar-onboarding-percent"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {allRequiredDone ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => completeMut.mutate()}
            disabled={completeMut.isPending}
            data-testid="button-finish-onboarding"
          >
            {completeMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Finish setup
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setLocation(nextStepKey ? `/onboarding-tasks?focus=${nextStepKey}` : "/onboarding-tasks")}
            data-testid="button-resume-onboarding"
          >
            Resume <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/15"
          onClick={() => {
            dismissForOneHour();
            setDismissed(true);
          }}
          data-testid="button-dismiss-onboarding-banner"
          title="Hide for an hour"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
