import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  Users, Briefcase, Shield, ShieldCheck, ShieldX, ShieldAlert,
  ChevronRight, ArrowLeft, Star, CheckCircle2,
  MessageSquare, ExternalLink, Bot, GraduationCap, Sparkles,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Applicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  job_posting_id?: string;
  posting_title?: string;
  shift_type?: string;
  has_guard_card: boolean;
  guard_card_number?: string;
  years_experience: number;
  applied_at: string;
  status: string;
  pipeline_stage: string;
  license_verified: boolean;
  license_verification_notes?: string;
  interview_score?: number;
  liability_score?: number;
  trinity_summary?: string;
  trinity_score?: number;
  notes?: string;
}

interface JobPosting {
  id: string;
  title: string;
  status: string;
  shift_type?: string;
  position_type: string;
  employment_type: string;
  pay_rate_min?: number;
  pay_rate_max?: number;
  schedule_details?: string;
  applications_count: number;
  posted_at: string;
  auto_generated?: boolean;
  demand_trigger?: string;
}

interface PipelineData {
  applicants: Applicant[];
  postings: JobPosting[];
  stats: Record<string, string | number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_STAGES: { id: string; label: string; color: string }[] = [
  { id: "applied",            label: "Applied",            color: "bg-slate-500" },
  { id: "pre_screened",       label: "Pre-Screened",       color: "bg-amber-500" },
  { id: "interview_scheduled",label: "Interview Scheduled",color: "bg-blue-500" },
  { id: "interview_complete", label: "Interview Complete", color: "bg-purple-500" },
  { id: "management_review",  label: "Management Review",  color: "bg-orange-500" },
  { id: "offer_extended",     label: "Offer Extended",     color: "bg-teal-500" },
  { id: "onboarding",         label: "Onboarding",         color: "bg-green-600" },
  { id: "disqualified",       label: "Disqualified",       color: "bg-red-500" },
];

const SHIFT_LABELS: Record<string, string> = {
  armed: "Armed", unarmed: "Unarmed", supervisor: "Supervisor", concierge: "Concierge",
};

const DEMAND_TRIGGER_LABELS: Record<string, string> = {
  scheduling_gap:              "Scheduling Gap",
  contract_start:              "Contract Start",
  disciplinary_termination:    "Disciplinary Termination",
  manual:                      "Manual",
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ScoreBadge({ score, label }: { score?: number; label: string }) {
  if (!score) return null;
  const color = score >= 85 ? "text-green-600 dark:text-green-400"
              : score >= 65 ? "text-amber-600 dark:text-amber-400"
              : "text-red-600 dark:text-red-400";
  return (
    <span className={`text-xs font-semibold ${color}`} data-testid={`score-${label}`}>
      {label}: {score}
    </span>
  );
}

function LicenseBadge({ verified, hasLicense }: { verified: boolean; hasLicense: boolean }) {
  if (!hasLicense) return (
    <Badge variant="outline" className="text-xs gap-1 border-muted-foreground/30 text-muted-foreground">
      <ShieldX className="w-3 h-3" /> No License
    </Badge>
  );
  if (verified) return (
    <Badge variant="outline" className="text-xs gap-1 border-green-500/40 text-green-600 dark:text-green-400">
      <ShieldCheck className="w-3 h-3" /> Verified
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-xs gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
      <ShieldAlert className="w-3 h-3" /> Pending
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Applicant Card
// ─────────────────────────────────────────────────────────────────────────────

function ApplicantCard({ applicant, onClick }: { applicant: Applicant; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      data-testid={`card-applicant-${applicant.id}`}
      className="bg-card border rounded-md p-3 cursor-pointer hover-elevate space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium leading-tight">
            {applicant.first_name} {applicant.last_name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[160px]">
            {applicant.posting_title || "General Applicant"}
          </p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <LicenseBadge verified={applicant.license_verified} hasLicense={applicant.has_guard_card} />
        {applicant.shift_type && (
          <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
            {SHIFT_LABELS[applicant.shift_type] || applicant.shift_type}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ScoreBadge score={applicant.interview_score} label="Interview" />
        <ScoreBadge score={applicant.liability_score} label="Liability" />
      </div>

      {applicant.trinity_summary && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {applicant.trinity_summary.slice(0, 120)}...
        </p>
      )}

      <p className="text-xs text-muted-foreground">Applied {fmt(applicant.applied_at)}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interview Transcript Viewer
// ─────────────────────────────────────────────────────────────────────────────

interface TranscriptMessage {
  id: string;
  sender_name: string;
  sender_type: string;
  message: string;
  created_at: string;
}

function InterviewTranscript({ messages }: { messages: TranscriptMessage[] }) {
  if (!messages.length) return (
    <p className="text-xs text-muted-foreground italic">No transcript available yet.</p>
  );
  return (
    <div className="space-y-3 max-h-80 overflow-y-auto pr-1" data-testid="transcript-viewer">
      {messages.map(m => {
        const isAI = m.sender_type === "ai";
        return (
          <div key={m.id} className={`flex flex-col gap-0.5 ${isAI ? "" : "items-end"}`}>
            <span className="text-xs text-muted-foreground px-1">
              {isAI ? "Trinity AI" : m.sender_name}
            </span>
            <div className={['rounded-md px-3 py-2 text-sm leading-relaxed max-w-[90%] whitespace-pre-wrap', isAI
                ? "bg-muted text-foreground"
                : "bg-violet-600/10 text-foreground border border-violet-500/20"].join(' ')}>
              {m.message}
            </div>
            <span className="text-xs text-muted-foreground/60 px-1">
              {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Applicant Detail Panel
// ─────────────────────────────────────────────────────────────────────────────

interface FullApplicantDetail extends Applicant {
  interview_session?: {
    id: string;
    status: string;
    overall_score?: number;
    transcript_summary?: string;
    conversation_id?: string;
    completed_at?: string;
  } | null;
  transcript?: TranscriptMessage[];
}

function ApplicantDetail({
  applicant,
  onBack,
  onStageChange,
  isMoving,
}: {
  applicant: Applicant;
  onBack: () => void;
  onStageChange: (stage: string) => void;
  isMoving: boolean;
}) {
  const { toast } = useToast();
  const currentStageIdx = PIPELINE_STAGES.findIndex(s => s.id === applicant.pipeline_stage);

  const { data: detail, isLoading: detailLoading, refetch } = useQuery<FullApplicantDetail>({
    queryKey: ["/api/hiring/applicants", applicant.id],
    queryFn: async () => {
      const r = await fetch(`/api/hiring/applicants/${applicant.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch applicant detail");
      return r.json();
    },
  });

  const a = detail || applicant;

  const verifyMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/hiring/applicants/${applicant.id}/verify-license`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring/pipeline"] });
      refetch();
      toast({ title: "License Verified", description: "Trinity verification complete." });
    },
    onError: () => toast({ title: "Error", description: "License verification failed.", variant: "destructive" }),
  });

  const scoreMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/hiring/applicants/${applicant.id}/score-interview`),
    onSuccess: () => {
      toast({ title: "Interview Scoring Started", description: "Trinity is scoring the interview in the background." });
      queryClient.invalidateQueries({ queryKey: ["/api/hiring/pipeline"] });
    },
    onError: () => toast({ title: "Error", description: "Could not start interview scoring.", variant: "destructive" }),
  });

  const assessMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/hiring/applicants/${applicant.id}/assess`),
    onSuccess: () => {
      toast({ title: "Trinity Assessment Running", description: "Applicant summary and liability assessment are running in parallel." });
      queryClient.invalidateQueries({ queryKey: ["/api/hiring/pipeline"] });
    },
    onError: () => toast({ title: "Error", description: "Could not start assessment.", variant: "destructive" }),
  });

  return (
    <div className="space-y-5" data-testid={`detail-applicant-${applicant.id}`}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-applicant">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">
            {a.first_name} {a.last_name}
          </h2>
          <p className="text-sm text-muted-foreground">{a.posting_title || "General Applicant"}</p>
        </div>
        <div className="ml-auto">
          <LicenseBadge verified={a.license_verified} hasLicense={a.has_guard_card} />
        </div>
      </div>

      {/* Pipeline progress */}
      <div className="flex gap-1 flex-wrap">
        {PIPELINE_STAGES.map((s, i) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-sm ${
              i <= currentStageIdx ? s.color : "bg-muted"
            }`}
            title={s.label}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        Current stage: <span className="font-medium text-foreground">
          {PIPELINE_STAGES.find(s => s.id === a.pipeline_stage)?.label || a.pipeline_stage}
        </span>
      </p>

      {/* Scores */}
      {(a.interview_score || a.liability_score || a.trinity_score) && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-3 gap-4 text-center">
            {a.trinity_score && (
              <div>
                <p className="text-2xl font-bold">{a.trinity_score}</p>
                <p className="text-xs text-muted-foreground mt-1">Trinity Score</p>
              </div>
            )}
            {a.interview_score && (
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{a.interview_score}</p>
                <p className="text-xs text-muted-foreground mt-1">Interview</p>
              </div>
            )}
            {a.liability_score && (
              <div>
                <p className={`text-2xl font-bold ${
                  a.liability_score >= 85 ? "text-green-600 dark:text-green-400"
                  : a.liability_score >= 65 ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
                }`}>{a.liability_score}</p>
                <p className="text-xs text-muted-foreground mt-1">Liability</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contact info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Applicant Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p>{a.email}</p>
            </div>
            {a.phone && (
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p>{a.phone}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Experience</p>
              <p>{a.years_experience} yr{a.years_experience !== 1 ? "s" : ""}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Applied</p>
              <p>{fmt(a.applied_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* License verification */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> License Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <LicenseBadge verified={a.license_verified} hasLicense={a.has_guard_card} />
            {a.guard_card_number && (
              <span className="text-xs text-muted-foreground">#{a.guard_card_number}</span>
            )}
          </div>
          {a.license_verification_notes && (
            <p className="text-xs leading-relaxed text-muted-foreground bg-muted/50 rounded-md p-2">
              {a.license_verification_notes}
            </p>
          )}
          {a.has_guard_card && !a.license_verified && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => verifyMut.mutate()}
              disabled={verifyMut.isPending}
              data-testid="button-verify-license"
            >
              {verifyMut.isPending ? "Verifying..." : "Run Trinity Verification"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Interview session + transcript */}
      {!detailLoading && detail?.interview_session && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Interview Session
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {detail.interview_session.status}
                </Badge>
                {detail.interview_session.overall_score && (
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Score: {detail.interview_session.overall_score}
                  </span>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.interview_session.transcript_summary && (
              <p className="text-xs leading-relaxed text-muted-foreground bg-muted/50 rounded-md p-2">
                {detail.interview_session.transcript_summary}
              </p>
            )}
            {detail.transcript && detail.transcript.length > 0 && (
              <InterviewTranscript messages={detail.transcript} />
            )}
            {detail.interview_session.status === "complete" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => scoreMut.mutate()}
                disabled={scoreMut.isPending}
                data-testid="button-score-interview"
              >
                <Star className="w-3.5 h-3.5 mr-1.5" />
                {scoreMut.isPending ? "Scoring..." : "Re-Score Interview"}
              </Button>
            )}
            {detail.interview_session.status !== "complete" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => scoreMut.mutate()}
                disabled={scoreMut.isPending}
                data-testid="button-score-interview"
              >
                <Star className="w-3.5 h-3.5 mr-1.5" />
                {scoreMut.isPending ? "Scoring..." : "Score Interview"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Interview session — no session yet but in right stage */}
      {!detailLoading && !detail?.interview_session &&
        ["interview_scheduled", "interview_complete", "management_review"].includes(a.pipeline_stage) && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground italic">No interview session linked yet.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => scoreMut.mutate()}
              disabled={scoreMut.isPending}
              data-testid="button-score-interview"
            >
              <Star className="w-3.5 h-3.5 mr-1.5" />
              {scoreMut.isPending ? "Starting..." : "Score Interview"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Trinity AI Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Trinity AI Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Run a full parallel assessment — Trinity generates an applicant summary and a legal liability report simultaneously.
          </p>
          <Button
            size="sm"
            onClick={() => assessMut.mutate()}
            disabled={assessMut.isPending}
            data-testid="button-trinity-assess"
          >
            <Bot className="w-3.5 h-3.5 mr-1.5" />
            {assessMut.isPending ? "Assessing..." : "Run Trinity Assessment"}
          </Button>
        </CardContent>
      </Card>

      {/* Trinity summary */}
      {a.trinity_summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-violet-500" /> Trinity Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
              {a.trinity_summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stage actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Move Pipeline Stage</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PIPELINE_STAGES.filter(s => s.id !== a.pipeline_stage).map(s => (
            <Button
              key={s.id}
              size="sm"
              variant="outline"
              onClick={() => onStageChange(s.id)}
              disabled={isMoving}
              data-testid={`button-stage-${s.id}`}
            >
              {s.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Postings Tab
// ─────────────────────────────────────────────────────────────────────────────

function JobPostingsTab({ postings }: { postings: JobPosting[] }) {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspaceId ?? '';
  const approveMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/hiring/postings/${id}/draft-approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/hiring/pipeline"] }),
  });

  return (
    <div className="space-y-3">
      {postings.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No job postings yet</p>
        </div>
      ) : postings.map(p => (
        <Card key={p.id} data-testid={`card-posting-${p.id}`}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{p.title}</p>
                  {p.auto_generated && (
                    <Badge variant="outline" className="text-xs gap-1 border-violet-500/40 text-violet-600 dark:text-violet-400">
                      <Sparkles className="w-3 h-3" /> Trinity
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {p.status}
                  </Badge>
                  {p.shift_type && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {SHIFT_LABELS[p.shift_type] || p.shift_type}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground space-y-0.5">
                <p>{p.applications_count} applicant{p.applications_count !== 1 ? "s" : ""}</p>
                {p.pay_rate_min && p.pay_rate_max && (
                  <p>${p.pay_rate_min}–${p.pay_rate_max}/hr</p>
                )}
              </div>
            </div>
            {p.auto_generated && p.demand_trigger && p.status === 'active' && (
              <p className="text-xs text-muted-foreground">
                Trigger: {DEMAND_TRIGGER_LABELS[p.demand_trigger] || p.demand_trigger}
              </p>
            )}
            {p.schedule_details && (
              <p className="text-xs text-muted-foreground">{p.schedule_details}</p>
            )}
            {p.status === 'draft' && p.auto_generated && (
              <Button
                size="sm"
                onClick={() => approveMut.mutate(p.id)}
                disabled={approveMut.isPending}
                data-testid={`button-approve-posting-${p.id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Approve & Publish
              </Button>
            )}
            <div className="flex items-center gap-2 pt-1">
              <a
                href={`/jobs/${encodeURIComponent(workspaceId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline"
                data-testid={`link-view-board-${p.id}`}
              >
                <ExternalLink className="w-3 h-3" /> View Public Board
              </a>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Training Pipeline Tab
// ─────────────────────────────────────────────────────────────────────────────

function TrainingPipelineTab() {
  const { data: trainees, isLoading } = useQuery<Applicant[]>({
    queryKey: ["/api/hiring/training-pipeline"],
  });

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm space-y-2">
        <GraduationCap className="w-8 h-8 mx-auto opacity-50 animate-pulse" />
        <p className="font-medium text-foreground">Loading sponsorship candidates</p>
        <p>Checking applicants who may need training or licensing support before deployment.</p>
      </div>
    );
  }

  if (!trainees?.length) return (
    <div className="text-center py-10 text-muted-foreground">
      <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No applicants in sponsorship track</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Applicants without a license who expressed interest in sponsorship or training consideration.
      </p>
      {trainees.map(a => (
        <Card key={a.id} data-testid={`card-trainee-${a.id}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{a.first_name} {a.last_name}</p>
                <p className="text-xs text-muted-foreground">{a.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{fmt(a.applied_at)}</p>
                {a.posting_title && <p className="text-xs text-muted-foreground">{a.posting_title}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function HiringPipeline() {
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const currentWorkspaceId = user?.currentWorkspaceId ?? '';

  const { data, isLoading } = useQuery<PipelineData>({
    queryKey: ["/api/hiring/pipeline"],
  });

  const stageMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiRequest("PATCH", `/api/hiring/applicants/${id}/stage`, { pipeline_stage: stage }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring/pipeline"] });
      const stageLabel = PIPELINE_STAGES.find(s => s.id === vars.stage)?.label || vars.stage;
      toast({ title: "Pipeline Updated", description: `Applicant moved to ${stageLabel}` });
      setSelectedApplicant(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update stage", variant: "destructive" }),
  });

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hiring/seed"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring/pipeline"] });
      toast({ title: "Seed Complete", description: data?.message || "Hiring test data loaded" });
    },
    onError: () => toast({ title: "Seed Failed", description: "Could not seed hiring data", variant: "destructive" }),
  });

  const pageConfig: CanvasPageConfig = {
    id: "hiring-pipeline",
    title: "Hiring Pipeline",
    category: "operations",
    showHeader: false,
    maxWidth: "7xl",
  };

  if (selectedApplicant) {
    return (
      <CanvasHubPage config={pageConfig}>
        <ApplicantDetail
          applicant={selectedApplicant}
          onBack={() => setSelectedApplicant(null)}
          onStageChange={(stage) => stageMut.mutate({ id: selectedApplicant.id, stage })}
          isMoving={stageMut.isPending}
        />
      </CanvasHubPage>
    );
  }

  const applicants = data?.applicants || [];
  const postings = data?.postings || [];
  const stats = data?.stats || {};

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              Hiring Pipeline
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Trinity-orchestrated talent acquisition
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedMut.mutate()}
              disabled={seedMut.isPending}
              data-testid="button-seed-hiring"
            >
              <Bot className="w-3.5 h-3.5 mr-1.5" />
              {seedMut.isPending ? "Seeding..." : "Load Test Data"}
            </Button>
            <a
              href={`/jobs/${encodeURIComponent(currentWorkspaceId)}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-public-board"
            >
              <Button size="sm" variant="outline">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Public Board
              </Button>
            </a>
          </div>
        </div>

        {/* Stats row */}
        {!isLoading && (
          <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
            {PIPELINE_STAGES.map(s => (
              <Card key={s.id} className="text-center" data-testid={`stat-stage-${s.id}`}>
                <CardContent className="py-3 px-2">
                  <p className="text-xl font-bold">{stats[s.id] || 0}</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Tabs defaultValue="kanban">
          <TabsList data-testid="tabs-hiring">
            <TabsTrigger value="kanban" data-testid="tab-kanban">Kanban Board</TabsTrigger>
            <TabsTrigger value="postings" data-testid="tab-postings">Job Postings</TabsTrigger>
            <TabsTrigger value="training" data-testid="tab-training">Training Pipeline</TabsTrigger>
          </TabsList>

          {/* KANBAN */}
          <TabsContent value="kanban">
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground text-sm space-y-2">
                <Users className="w-8 h-8 mx-auto opacity-50 animate-pulse" />
                <p className="font-medium text-foreground">Loading hiring pipeline</p>
                <p>Pulling applicants, stage counts, and active hiring motions.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className="flex gap-3 min-w-max pb-4">
                  {PIPELINE_STAGES.map(stage => {
                    const cards = applicants.filter(a => a.pipeline_stage === stage.id);
                    return (
                      <div
                        key={stage.id}
                        className="w-52 flex-shrink-0 space-y-2"
                        data-testid={`column-${stage.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-sm ${stage.color}`} />
                          <p className="text-xs font-semibold text-foreground">{stage.label}</p>
                          <span className="text-xs text-muted-foreground ml-auto">{cards.length}</span>
                        </div>
                        <div className="space-y-2">
                          {cards.length === 0 ? (
                            <div className="border border-dashed border-muted-foreground/20 rounded-md h-16 flex items-center justify-center">
                              <p className="text-xs text-muted-foreground/50">Empty</p>
                            </div>
                          ) : cards.map(a => (
                            <ApplicantCard
                              key={a.id}
                              applicant={a}
                              onClick={() => setSelectedApplicant(a)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* JOB POSTINGS */}
          <TabsContent value="postings">
            <div className="mt-4">
              <JobPostingsTab postings={postings} />
            </div>
          </TabsContent>

          {/* TRAINING PIPELINE */}
          <TabsContent value="training">
            <div className="mt-4">
              <TrainingPipelineTab />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
