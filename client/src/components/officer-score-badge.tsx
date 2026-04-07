import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shield,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScoreEvent {
  id: string;
  eventType: string;
  pointsDelta: number;
  scoreAfter: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  isDisputable: boolean;
  isOverturned: boolean;
  createdAt: string;
}

interface ScoreData {
  score: {
    readinessScore: number;
    underReview: boolean;
    activeComplaintCount: number;
    scoreType: string;
  } | null;
  events: ScoreEvent[];
  pendingGrievances: string[];
  employeeId: string;
}

// ─── Score Color Helpers ──────────────────────────────────────────────────────
function getScoreColor(score: number): string {
  if (score >= 90) return "bg-emerald-500 text-white";
  if (score >= 75) return "bg-amber-500 text-white";
  if (score >= 60) return "bg-orange-500 text-white";
  return "bg-red-500 text-white";
}

function getScoreRingColor(score: number): string {
  if (score >= 90) return "ring-emerald-400";
  if (score >= 75) return "ring-amber-400";
  if (score >= 60) return "ring-orange-400";
  return "ring-red-400";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good Standing";
  if (score >= 60) return "Needs Improvement";
  return "At Risk";
}

function getScoreTypeLabel(scoreType: string): string {
  if (scoreType === 'support') return "Support Staff Rating";
  if (scoreType === 'owner') return "Owner Score";
  return "Officer Readiness Score";
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Grievance Form ───────────────────────────────────────────────────────────
function GrievanceForm({
  event,
  onClose,
}: {
  event: ScoreEvent;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: { scoreEventId: string; submittedReason: string }) =>
      apiRequest("POST", "/api/score/grievance", data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/score/me"] });
      toast({
        title: data.autoDenied ? "Grievance Not Eligible" : "Grievance Submitted",
        description: data.message,
        variant: data.autoDenied ? "destructive" : "default",
      });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Submission Failed",
        description: err.message ?? "Unable to submit grievance. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="rounded-md border bg-muted/40 p-4 mt-2 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">Submit Grievance</p>
          <p className="text-xs text-muted-foreground">
            Disputing: <span className="font-medium">{formatEventType(event.eventType)}</span> ({event.pointsDelta > 0 ? '+' : ''}{event.pointsDelta} pts)
          </p>
        </div>
      </div>

      <Textarea
        placeholder="Explain why you believe this score change is incorrect. Provide any relevant context, dates, or details to support your case. The more specific you are, the better."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="resize-none text-sm"
        rows={4}
        data-testid="input-grievance-reason"
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onClose}
          data-testid="button-grievance-cancel"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={reason.trim().length < 20 || mutation.isPending}
          onClick={() =>
            mutation.mutate({ scoreEventId: event.id, submittedReason: reason.trim() })
          }
          data-testid="button-grievance-submit"
        >
          {mutation.isPending ? "Submitting..." : "Submit Grievance"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        A case manager and ${PLATFORM_NAME} liaison will review your case. Trinity will perform
        an initial AI analysis. You will be notified of the outcome.
      </p>
    </div>
  );
}

// ─── Score Event Row ──────────────────────────────────────────────────────────
function ScoreEventRow({
  event,
  hasPendingGrievance,
}: {
  event: ScoreEvent;
  hasPendingGrievance: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showGrievance, setShowGrievance] = useState(false);

  const isNegative = event.pointsDelta < 0;
  const isPositive = event.pointsDelta > 0;
  const isNeutral = event.pointsDelta === 0;

  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-2 transition-colors",
        isNegative && !event.isOverturned && "border-red-200 bg-red-50/40 dark:border-red-900/30 dark:bg-red-950/10",
        isPositive && "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/10",
        isNeutral && "border-border bg-muted/20",
        event.isOverturned && "border-border bg-muted/20 opacity-60"
      )}
      data-testid={`score-event-${event.id}`}
    >
      <div className="flex items-start gap-2">
        {/* Delta indicator */}
        <div className={cn(
          "flex items-center gap-1 text-sm font-bold min-w-[48px] justify-center rounded px-1.5 py-0.5",
          isNegative ? "text-red-600 bg-red-100 dark:bg-red-900/30" :
          isPositive ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" :
          "text-muted-foreground bg-muted"
        )}>
          {isNegative ? <TrendingDown className="h-3 w-3" /> :
           isPositive ? <TrendingUp className="h-3 w-3" /> :
           <Minus className="h-3 w-3" />}
          {isPositive ? `+${event.pointsDelta}` : event.pointsDelta}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium leading-tight">
              {formatEventType(event.eventType)}
            </p>
            {event.isOverturned && (
              <Badge variant="outline" className="text-xs">Overturned</Badge>
            )}
            {hasPendingGrievance && !event.isOverturned && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                <Clock className="h-2.5 w-2.5 mr-1" />
                Under Review
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(event.createdAt)}</p>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Score: {event.scoreAfter}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setExpanded((v) => !v)}
            data-testid={`button-event-expand-${event.id}`}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground leading-relaxed">{event.reason}</p>

          {/* Show grievance option for disputable negative events not already overturned or pending */}
          {isNegative && event.isDisputable && !event.isOverturned && !hasPendingGrievance && !showGrievance && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setShowGrievance(true)}
              data-testid={`button-dispute-${event.id}`}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Dispute This
            </Button>
          )}

          {showGrievance && (
            <GrievanceForm event={event} onClose={() => setShowGrievance(false)} />
          )}

          {hasPendingGrievance && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              A grievance for this event is currently under review.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Score History Sheet ──────────────────────────────────────────────────────
function ScoreHistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<ScoreData>({
    queryKey: ["/api/score/me"],
    enabled: open,
  });

  const score = data?.score;
  const events = data?.events ?? [];
  const pendingGrievances = data?.pendingGrievances ?? [];

  return (
    <UniversalModal open={open} onOpenChange={(v) => !v && onClose()}>
      <UniversalModalContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <UniversalModalHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <UniversalModalTitle>Readiness Score</UniversalModalTitle>
              <UniversalModalDescription>
                {score ? getScoreTypeLabel(score.scoreType) : "Your platform score"}
              </UniversalModalDescription>
            </div>
          </div>
        </UniversalModalHeader>

        <div className="p-6 pb-4 border-b space-y-4">
          {isLoading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Loading your score...</div>
            </div>
          ) : !score ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No score record found. Score activates once you are added as an active employee.
            </div>
          ) : (
            <>
              {/* Main Score Display */}
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-16 w-16 rounded-full flex items-center justify-center text-2xl font-bold ring-2 ring-offset-2",
                  getScoreColor(score.readinessScore),
                  getScoreRingColor(score.readinessScore)
                )}>
                  {score.readinessScore}
                </div>
                <div>
                  <p className="text-lg font-bold">{score.readinessScore}/100</p>
                  <p className="text-sm text-muted-foreground">{getScoreLabel(score.readinessScore)}</p>
                  {score.scoreType === 'support' && (
                    <p className="text-xs text-muted-foreground mt-0.5">Rating-based · Never penalized</p>
                  )}
                </div>
              </div>

              {/* Under Review Banner */}
              {score.underReview && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Under Review</p>
                    <p className="text-xs text-amber-700 dark:text-amber-500">
                      You have {score.activeComplaintCount} active complaint(s) being reviewed. A case manager will reach out.
                    </p>
                  </div>
                </div>
              )}

              {/* Score facts */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-xs text-muted-foreground">Events Logged</p>
                  <p className="font-semibold">{events.length}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-xs text-muted-foreground">Starting Score</p>
                  <p className="font-semibold">100</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Event History */}
        <div className="flex-1 overflow-hidden">
          <div className="px-6 pt-4 pb-2">
            <p className="text-sm font-semibold">Score History</p>
            <p className="text-xs text-muted-foreground">Every event that has changed your score, from most recent.</p>
          </div>

          <ScrollArea className="flex-1 px-6 pb-6" style={{ height: "calc(100vh - 420px)" }}>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading history...</div>
            ) : events.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Star className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No score events yet.</p>
                <p className="text-xs text-muted-foreground">Events appear as you complete shifts, receive feedback, and more.</p>
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                {events.map((event) => (
                  <ScoreEventRow
                    key={event.id}
                    event={event}
                    hasPendingGrievance={pendingGrievances.includes(event.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// ─── Main Badge Component (exported for use in sidebar) ──────────────────────
export function OfficerScoreBadge({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery<ScoreData>({
    queryKey: ["/api/score/me"],
    staleTime: 60_000,
    retry: false,
  });

  const score = data?.score;

  // Only render if there's a score record
  if (!score) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Your readiness score: ${score.readinessScore}/100. Click to view history.`}
        data-testid="button-officer-score-badge"
        className={cn(
          "inline-flex items-center justify-center rounded-full font-bold text-white cursor-pointer ring-2 ring-offset-1 transition-transform hover:scale-105 active:scale-95",
          getScoreColor(score.readinessScore),
          getScoreRingColor(score.readinessScore),
          compact ? "h-5 w-5 text-[10px] ring-offset-background" : "h-6 w-6 text-xs ring-offset-sidebar"
        )}
      >
        {score.underReview ? (
          <AlertTriangle className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        ) : (
          score.readinessScore
        )}
      </button>

      <ScoreHistorySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ─── Inline Badge for profile page use ───────────────────────────────────────
export function OfficerScoreInline() {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<ScoreData>({
    queryKey: ["/api/score/me"],
    staleTime: 60_000,
    retry: false,
  });

  const score = data?.score;

  if (isLoading) return null;
  if (!score) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="button-officer-score-inline"
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover-elevate transition-colors",
          score.underReview
            ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
            : "border-border bg-card"
        )}
      >
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center font-bold text-white text-sm ring-2 ring-offset-1",
          getScoreColor(score.readinessScore),
          getScoreRingColor(score.readinessScore)
        )}>
          {score.underReview ? <AlertTriangle className="h-3.5 w-3.5" /> : score.readinessScore}
        </div>
        <div className="text-left">
          <p className="text-xs font-semibold leading-tight">{getScoreLabel(score.readinessScore)}</p>
          <p className="text-xs text-muted-foreground">{score.readinessScore}/100 · View History</p>
        </div>
        {score.underReview && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 ml-auto">
            Under Review
          </Badge>
        )}
      </button>

      <ScoreHistorySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
