/**
 * RECRUITMENT PAGE
 * Phase 58 — Trinity Interview Pipeline
 *
 * Four-tab dashboard:
 *   1. Pipeline  — Kanban-style stage funnel overview + quick actions
 *   2. Candidates — Full searchable/filterable candidate list with profiles
 *   3. Question Bank — Manage interview questions per position/round
 *   4. Analytics — Ranked summary, conversion rates, score distributions
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Mail,
  MessageSquare,
  Phone,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Users,
  Brain,
  ChevronRight,
  Plus,
  TrendingUp,
  Loader2,
  RefreshCw,
  FileText,
  Calendar,
  Inbox,
  BarChart3,
  ListChecks,
  ExternalLink,
  Mic,
  Star,
  Award,
  Target,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  candidateNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  positionType: string;
  positionTitle?: string;
  stage: string;
  qualificationScore?: number;
  decision?: string;
  decisionNotes?: string;
  decisionAt?: string;
  rawApplicationText?: string;
  resumeParsed?: Record<string, unknown>;
  chatRoomId?: string;
  chatRoomUrl?: string;
  voiceSessionId?: string;
  createdAt: string;
  updatedAt?: string;
}

interface Session {
  id: string;
  sessionType: string;
  status: string;
  sessionScore?: number;
  questionsAsked?: unknown[];
  responsesReceived?: unknown[];
  startedAt?: string;
  completedAt?: string;
  chatRoomId?: string;
  voiceRecordingUrl?: string;
  voiceTranscript?: string;
}

interface Scorecard {
  id: string;
  overallScore?: number;
  qualificationScore?: number;
  communicationScore?: number;
  availabilityScore?: number;
  experienceScore?: number;
  trinityRecommendation?: string;
  trinityReasoning?: string;
  generatedAt?: string;
}

interface PipelineSummary {
  new: number;
  screening: number;
  email_round_1: number;
  email_round_2: number;
  chat_interview: number;
  voice_interview: number;
  decided: number;
}

interface QuestionBankEntry {
  id: string;
  positionType: string;
  round: number;
  questionText: string;
  questionCategory: string;
  maxScore?: number;
  isRequired?: boolean;
  isActive?: boolean;
  workspaceId?: string | null;
  displayOrder?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  screening: "Screened",
  email_round_1: "Email R1",
  email_round_2: "Email R2",
  chat_interview: "Chat",
  voice_interview: "Voice",
  decided: "Decided",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-secondary text-secondary-foreground",
  screening: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  email_round_1: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  email_round_2: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  chat_interview: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  voice_interview: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  decided: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const DECISION_COLORS: Record<string, string> = {
  hire: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  reject: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const POSITION_LABELS: Record<string, string> = {
  unarmed_officer: "Unarmed Officer",
  armed_officer: "Armed Officer",
  supervisor: "Supervisor",
  all: "All Positions",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  hire: "Recommend Hire",
  advance: "Advance",
  hold: "Hold",
  reject: "Reject",
};

// ─── Shared Utility Components ───────────────────────────────────────────────

function ScoreBadge({ score }: { score?: number }) {
  if (score === null || score === undefined) {
    return <span className="text-muted-foreground text-xs">Not scored</span>;
  }
  const color =
    score >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
    score >= 65 ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
    score >= 50 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${color}`}>
      <Brain className="w-3 h-3" />
      {score}/100
    </span>
  );
}

// ─── New Candidate Dialog ───────────────────────────────────────────────────

const newCandidateSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  positionType: z.enum(["unarmed_officer", "armed_officer", "supervisor"]),
  positionTitle: z.string().optional(),
  rawApplicationText: z.string().optional(),
});
type NewCandidateForm = z.infer<typeof newCandidateSchema>;

function NewCandidateDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<NewCandidateForm>({
    resolver: zodResolver(newCandidateSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      positionType: "unarmed_officer",
      positionTitle: "",
      rawApplicationText: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: NewCandidateForm) =>
      apiRequest("POST", "/api/recruitment/candidates", data),
    onSuccess: () => {
      toast({ title: "Candidate added", description: "Candidate profile created." });
      form.reset();
      setOpen(false);
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-candidate" size="default">
          <Plus className="w-4 h-4 mr-2" />
          Add Candidate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add New Candidate</DialogTitle>
          <DialogDescription>
            Manually add a candidate. Trinity will screen them automatically.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-first-name" placeholder="Jane" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-last-name" placeholder="Doe" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-email" type="email" placeholder="jane@example.com" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="positionType" render={({ field }) => (
              <FormItem>
                <FormLabel>Position</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-position-type">
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="unarmed_officer">Unarmed Officer</SelectItem>
                    <SelectItem value="armed_officer">Armed Officer</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="rawApplicationText" render={({ field }) => (
              <FormItem>
                <FormLabel>Application / Resume Text (optional)</FormLabel>
                <FormControl>
                  <textarea
                    {...field}
                    data-testid="input-application-text"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Paste resume or application text here..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-candidate">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Candidate
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Candidate Detail Sheet ─────────────────────────────────────────────────

function CandidateDetailSheet({
  candidateId,
  open,
  onClose,
}: {
  candidateId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [decisionDialog, setDecisionDialog] = useState<{ decision: string; label: string } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/recruitment/candidates", candidateId],
    enabled: !!candidateId,
  });

  const candidate = (data as { candidate?: Candidate })?.candidate;
  const sessions: Session[] = (data as { sessions?: Session[] })?.sessions ?? [];
  const scorecard: Scorecard | undefined = (data as { scorecard?: Scorecard })?.scorecard;

  const screenMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/screen`, {}),
    onSuccess: () => {
      toast({ title: "Screening complete", description: "Trinity scored this candidate." });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
    },
  });

  const sendRound1Mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/send-questions`, { round: 1 }),
    onSuccess: () => {
      toast({ title: "Round 1 sent", description: "Interview questions sent to candidate." });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
    },
  });

  const generateScorecardMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/scorecard`, {}),
    onSuccess: () => {
      toast({ title: "Scorecard generated", description: "Trinity scorecard is ready." });
      refetch();
    },
  });

  const decisionMutation = useMutation({
    mutationFn: (data: { decision: string; notes: string }) =>
      apiRequest("PATCH", `/api/recruitment/candidates/${candidateId}/decision`, data),
    onSuccess: (_: unknown, vars: { decision: string; notes: string }) => {
      toast({ title: "Decision recorded", description: `Candidate marked: ${vars.decision}` });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/pipeline"] });
    },
  });

  const advanceStageMutation = useMutation({
    mutationFn: (stage: string) =>
      apiRequest("PATCH", `/api/recruitment/candidates/${candidateId}/stage`, { stage }),
    onSuccess: () => {
      toast({ title: "Stage updated" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/pipeline"] });
    },
  });

  const chatSession = sessions.find(s => s.sessionType === 'chat_interview');
  const voiceSession = sessions.find(s => s.sessionType === 'voice_interview');
  const emailSessions = sessions.filter(s => s.sessionType.startsWith('email_'));

  const parsedResume = candidate?.resumeParsed as Record<string, unknown> | null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading || !candidate ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <SheetTitle data-testid="text-candidate-name" className="text-xl">
                    {candidate.firstName} {candidate.lastName}
                  </SheetTitle>
                  <SheetDescription>
                    {candidate.candidateNumber} · {POSITION_LABELS[candidate.positionType] ?? candidate.positionType}
                  </SheetDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={STAGE_COLORS[candidate.stage]}>
                    {STAGE_LABELS[candidate.stage] ?? candidate.stage}
                  </Badge>
                  {candidate.decision && (
                    <Badge className={DECISION_COLORS[candidate.decision]}>
                      {candidate.decision.toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5">
              {/* Contact */}
              <Card>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span data-testid="text-candidate-email">{candidate.email}</span>
                  </div>
                  {candidate.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{candidate.phone}</span>
                    </div>
                  )}
                  {candidate.createdAt && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>Applied {new Date(candidate.createdAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Trinity Score + Parsed Resume */}
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Trinity Score
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <ScoreBadge score={candidate.qualificationScore} />
                  {!candidate.qualificationScore && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => screenMutation.mutate()}
                      disabled={screenMutation.isPending}
                      data-testid="button-screen-candidate"
                    >
                      {screenMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      <Brain className="w-3 h-3 mr-1" />
                      Run Screen
                    </Button>
                  )}
                </div>

                {parsedResume && Object.keys(parsedResume).length > 0 && (
                  <div className="mt-3 rounded-md border p-3 space-y-1 text-xs">
                    // @ts-ignore — TS migration: fix in refactoring sprint
                    {(parsedResume as any).summary && (
                      <p className="text-muted-foreground">{String(parsedResume.summary)}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(parsedResume.strengths as string[] | undefined)?.map((s, i) => (
                        <span key={i} className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-xs">{s}</span>
                      ))}
                      {(parsedResume.redFlags as string[] | undefined)?.map((f, i) => (
                        <span key={i} className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-xs">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Pipeline Actions */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Pipeline Actions
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendRound1Mutation.mutate()}
                    disabled={sendRound1Mutation.isPending}
                    data-testid="button-send-round1"
                  >
                    {sendRound1Mutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    <Mail className="w-3 h-3 mr-1" />
                    Send Email Round 1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateScorecardMutation.mutate()}
                    disabled={generateScorecardMutation.isPending}
                    data-testid="button-generate-scorecard"
                  >
                    {generateScorecardMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    <FileText className="w-3 h-3 mr-1" />
                    Generate Scorecard
                  </Button>
                  {candidate.chatRoomUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(candidate.chatRoomUrl, '_blank')}
                      data-testid="button-open-chat-room"
                    >
                      <MessageSquare className="w-3 h-3 mr-1" />
                      Open Chat Room
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
                <div className="mt-2">
                  <h4 className="text-xs text-muted-foreground mb-1">Advance Stage</h4>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(STAGE_LABELS).filter(([k]) => k !== candidate.stage && k !== 'new').map(([stageKey, label]) => (
                      <Button
                        key={stageKey}
                        size="sm"
                        variant="ghost"
                        onClick={() => advanceStageMutation.mutate(stageKey)}
                        disabled={advanceStageMutation.isPending}
                        data-testid={`button-advance-stage-${stageKey}`}
                        className="text-xs h-7"
                      >
                        <ChevronRight className="w-3 h-3 mr-1" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Email Interview Thread */}
              {emailSessions.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                      Email Interview Thread
                    </h3>
                    <div className="space-y-3">
                      {emailSessions.map((session) => {
                        const responses = session.responsesReceived as Array<{
                          questionText?: string;
                          responseText?: string;
                          score?: number;
                          maxScore?: number;
                          scoringNotes?: string;
                        }> ?? [];
                        return (
                          <Card key={session.id} data-testid={`session-${session.id}`}>
                            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-purple-500" />
                                <span className="text-sm font-medium capitalize">
                                  {session.sessionType.replace(/_/g, ' ')}
                                </span>
                                <Badge variant="outline" className="text-xs capitalize">{session.status}</Badge>
                              </div>
                              {session.sessionScore !== undefined && session.sessionScore !== null && (
                                <ScoreBadge score={session.sessionScore} />
                              )}
                            </CardHeader>
                            {responses.length > 0 && (
                              <CardContent className="pt-0 space-y-2">
                                {responses.map((r, idx) => (
                                  <div key={idx} className="text-xs border-l-2 border-purple-200 dark:border-purple-800 pl-3 space-y-1">
                                    <p className="font-medium text-muted-foreground">{r.questionText}</p>
                                    <p className="text-foreground">{r.responseText}</p>
                                    {r.score !== undefined && (
                                      <p className="text-muted-foreground">Score: {r.score}/{r.maxScore} — {r.scoringNotes}</p>
                                    )}
                                  </div>
                                ))}
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Chat Interview */}
              {(candidate.stage === 'chat_interview' || chatSession) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                      Chat Interview
                    </h3>
                    {chatSession ? (
                      <Card data-testid={`session-${chatSession.id}`}>
                        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-medium">DockChat Interview Room</span>
                            <Badge variant="outline" className="text-xs capitalize">{chatSession.status}</Badge>
                          </div>
                          {chatSession.sessionScore !== undefined && chatSession.sessionScore !== null && (
                            <ScoreBadge score={chatSession.sessionScore} />
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          {candidate.chatRoomUrl ? (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                Chat room: <code className="bg-muted px-1 py-0.5 rounded text-xs">{candidate.chatRoomId}</code>
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(candidate.chatRoomUrl, '_blank')}
                                data-testid="button-open-dockchat"
                              >
                                <MessageSquare className="w-3 h-3 mr-1" />
                                Open in DockChat
                                <ExternalLink className="w-3 h-3 ml-1" />
                              </Button>
                              <p className="text-xs text-muted-foreground mt-1">
                                Trinity co-pilot is monitoring this room and will score responses in real time.
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Chat room not yet assigned.</p>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="rounded-md border p-4 text-sm text-muted-foreground">
                        <MessageSquare className="w-4 h-4 mb-2 text-amber-500" />
                        <p>Candidate has been invited to a DockChat interview room.</p>
                        {candidate.chatRoomUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => window.open(candidate.chatRoomUrl, '_blank')}
                            data-testid="button-join-chat"
                          >
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Join Chat Room
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Voice Interview */}
              {(candidate.stage === 'voice_interview' || voiceSession) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                      Voice Interview
                    </h3>
                    {voiceSession ? (
                      <Card data-testid={`session-${voiceSession.id}`}>
                        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Mic className="w-4 h-4 text-orange-500" />
                            <span className="text-sm font-medium">Voice Interview</span>
                            <Badge variant="outline" className="text-xs capitalize">{voiceSession.status}</Badge>
                          </div>
                          {voiceSession.sessionScore !== undefined && voiceSession.sessionScore !== null && (
                            <ScoreBadge score={voiceSession.sessionScore} />
                          )}
                        </CardHeader>
                        <CardContent className="pt-0 space-y-2">
                          {voiceSession.voiceRecordingUrl && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">Recording</p>
                              <audio
                                controls
                                src={voiceSession.voiceRecordingUrl}
                                className="w-full h-8"
                                data-testid="audio-voice-recording"
                              />
                            </div>
                          )}
                          {voiceSession.voiceTranscript && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">Transcript</p>
                              <div
                                className="text-xs bg-muted rounded-md p-2 max-h-32 overflow-y-auto whitespace-pre-wrap"
                                data-testid="text-voice-transcript"
                              >
                                {voiceSession.voiceTranscript}
                              </div>
                            </div>
                          )}
                          {!voiceSession.voiceRecordingUrl && !voiceSession.voiceTranscript && (
                            <p className="text-xs text-muted-foreground">
                              Voice session in progress. Trinity is conducting a structured Twilio voice interview and will produce a transcript and recording when complete.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="rounded-md border p-4 text-sm text-muted-foreground">
                        <Mic className="w-4 h-4 mb-2 text-orange-500" />
                        <p>Candidate is scheduled for a Trinity-conducted voice interview via Twilio.</p>
                        <p className="mt-1 text-xs">Trinity will call the candidate, conduct a structured interview, and produce a scored transcript.</p>
                        {candidate.voiceSessionId && (
                          <p className="mt-1 text-xs">Session ID: <code className="bg-muted px-1 rounded">{candidate.voiceSessionId}</code></p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Scorecard */}
              {scorecard && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                      Trinity Scorecard
                    </h3>
                    <Card>
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="text-center">
                            <p className="text-2xl font-bold" data-testid="text-overall-score">{scorecard.overallScore ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">Overall</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-semibold">{scorecard.experienceScore ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">Experience</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-semibold">{scorecard.communicationScore ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">Communication</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-semibold">{scorecard.availabilityScore ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">Availability</p>
                          </div>
                        </div>
                        {scorecard.trinityRecommendation && (
                          <div className="flex items-center gap-2">
                            <Brain className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold">
                              Trinity: {RECOMMENDATION_LABELS[scorecard.trinityRecommendation] ?? scorecard.trinityRecommendation}
                            </span>
                          </div>
                        )}
                        {scorecard.trinityReasoning && (
                          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-trinity-reasoning">
                            {scorecard.trinityReasoning}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}

              <Separator />

              {/* Recruiter Decision */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Recruiter Decision
                </h3>
                {candidate.decision && candidate.decisionNotes && (
                  <div className="mb-3 rounded-md border p-3 text-sm">
                    <span className="font-medium capitalize">{candidate.decision}</span>
                    <p className="text-muted-foreground mt-1">{candidate.decisionNotes}</p>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="flex-1 min-w-24"
                    onClick={() => { setDecisionNotes(""); setDecisionDialog({ decision: 'hire', label: 'Hire' }); }}
                    disabled={decisionMutation.isPending}
                    data-testid="button-decision-hire"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Hire
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-w-24"
                    onClick={() => { setDecisionNotes(""); setDecisionDialog({ decision: 'hold', label: 'Hold' }); }}
                    disabled={decisionMutation.isPending}
                    data-testid="button-decision-hold"
                  >
                    <Clock className="w-4 h-4 mr-1" />
                    Hold
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-w-24"
                    onClick={() => { setDecisionNotes(""); setDecisionDialog({ decision: 'reject', label: 'Reject' }); }}
                    disabled={decisionMutation.isPending}
                    data-testid="button-decision-reject"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>

      {/* Decision Confirmation Dialog */}
      <Dialog open={!!decisionDialog} onOpenChange={(v) => !v && setDecisionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Decision: {decisionDialog?.label}</DialogTitle>
            <DialogDescription>
              Add optional notes for this decision. This will be recorded on the candidate's profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Optional notes (e.g., 'Strong fit for armed officer role — background check pending')"
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              data-testid="textarea-decision-notes"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={decisionMutation.isPending}
              onClick={() => {
                if (decisionDialog) {
                  decisionMutation.mutate({ decision: decisionDialog.decision, notes: decisionNotes });
                  setDecisionDialog(null);
                }
              }}
              data-testid="button-confirm-decision"
            >
              {decisionMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Confirm {decisionDialog?.label}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

// ─── Tab 1: Pipeline Overview ────────────────────────────────────────────────

function PipelineTab({
  pipeline,
  pipelineLoading,
  onSelectStage,
  onSelectCandidate,
}: {
  pipeline?: PipelineSummary;
  pipelineLoading: boolean;
  onSelectStage: (stage: string) => void;
  onSelectCandidate: (id: string) => void;
}) {
  const { data: allCandidatesData } = useQuery({ queryKey: ["/api/recruitment/candidates", "all", ""] });
  const allCandidates: Candidate[] = (allCandidatesData as { candidates?: Candidate[] })?.candidates ?? [];

  const PIPELINE_STAGES = [
    { key: "new", label: "New", icon: Inbox, color: "text-muted-foreground", border: "border-l-muted-foreground" },
    { key: "screening", label: "Screened", icon: Brain, color: "text-blue-500", border: "border-l-blue-500" },
    { key: "email_round_1", label: "Email Round 1", icon: Mail, color: "text-purple-500", border: "border-l-purple-500" },
    { key: "email_round_2", label: "Email Round 2", icon: Mail, color: "text-indigo-500", border: "border-l-indigo-500" },
    { key: "chat_interview", label: "Chat Interview", icon: MessageSquare, color: "text-amber-500", border: "border-l-amber-500" },
    { key: "voice_interview", label: "Voice Interview", icon: Phone, color: "text-orange-500", border: "border-l-orange-500" },
    { key: "decided", label: "Decided", icon: CheckCircle, color: "text-green-500", border: "border-l-green-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Stage funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const count = pipeline?.[stage.key as keyof PipelineSummary] ?? 0;
          const Icon = stage.icon;
          return (
            <Card
              key={stage.key}
              className="hover-elevate cursor-pointer"
              onClick={() => onSelectStage(stage.key)}
              data-testid={`pipeline-stage-${stage.key}`}
            >
              <CardContent className="pt-4 pb-3 px-3 text-center space-y-1">
                {pipelineLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                ) : (
                  <>
                    <Icon className={`w-5 h-5 mx-auto ${stage.color}`} />
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{stage.label}</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Conversion flow */}
      {pipeline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Pipeline Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 flex-wrap">
              {PIPELINE_STAGES.map((stage, i) => {
                const count = pipeline[stage.key as keyof PipelineSummary] ?? 0;
                return (
                  <div key={stage.key} className="flex items-center gap-1">
                    <div
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-muted cursor-pointer hover-elevate"
                      onClick={() => onSelectStage(stage.key)}
                    >
                      <span className="text-sm font-semibold">{count}</span>
                      <span className="text-xs text-muted-foreground">{stage.label}</span>
                    </div>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent candidates preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {allCandidates.slice(0, 5).map((candidate) => (
            <div
              key={candidate.id}
              className="flex items-center justify-between gap-2 px-4 py-3 border-b last:border-b-0 hover-elevate cursor-pointer"
              onClick={() => onSelectCandidate(candidate.id)}
              data-testid={`candidate-row-${candidate.id}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{candidate.firstName} {candidate.lastName}</p>
                <p className="text-xs text-muted-foreground">{POSITION_LABELS[candidate.positionType] ?? candidate.positionType}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ScoreBadge score={candidate.qualificationScore} />
                <Badge className={`${STAGE_COLORS[candidate.stage]} text-xs`}>
                  {STAGE_LABELS[candidate.stage]}
                </Badge>
              </div>
            </div>
          ))}
          {allCandidates.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No candidates yet. Add one or configure the careers email alias.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Candidates ───────────────────────────────────────────────────────

function CandidatesTab({
  onSelectCandidate,
}: {
  onSelectCandidate: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "score_desc" | "score_asc" | "name">("recent");
  const [, navigate] = useLocation();

  const { data: candidatesData, isLoading, refetch } = useQuery({
    queryKey: ["/api/recruitment/candidates", stageFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (search) params.set("search", search);
      return fetch(`/api/recruitment/candidates?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const rawCandidates: Candidate[] = (candidatesData as { candidates?: Candidate[] })?.candidates ?? [];
  const total: number = (candidatesData as { total?: number })?.total ?? 0;

  const candidates = [...rawCandidates].sort((a, b) => {
    if (sortBy === "score_desc") return (b.qualificationScore ?? -1) - (a.qualificationScore ?? -1);
    if (sortBy === "score_asc") return (a.qualificationScore ?? -1) - (b.qualificationScore ?? -1);
    if (sortBy === "name") return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    return 0;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-candidates"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40" data-testid="select-stage-filter">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {Object.entries(STAGE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-40" data-testid="select-sort-by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="score_desc">Score: High to Low</SelectItem>
            <SelectItem value="score_asc">Score: Low to High</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="outline" onClick={() => refetch()} data-testid="button-refresh-candidates">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{total} candidate{total !== 1 ? 's' : ''}</p>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No candidates found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((candidate) => (
            <Card
              key={candidate.id}
              className="hover-elevate cursor-pointer"
              onClick={() => onSelectCandidate(candidate.id)}
              data-testid={`card-candidate-${candidate.id}`}
            >
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{candidate.firstName} {candidate.lastName}</span>
                      <span className="text-xs text-muted-foreground">{candidate.candidateNumber}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {candidate.email}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {POSITION_LABELS[candidate.positionType] ?? candidate.positionType}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <ScoreBadge score={candidate.qualificationScore} />
                    <Badge className={`${STAGE_COLORS[candidate.stage]} text-xs`}>
                      {STAGE_LABELS[candidate.stage]}
                    </Badge>
                    {candidate.decision && (
                      <Badge className={`${DECISION_COLORS[candidate.decision]} text-xs`}>
                        {candidate.decision.toUpperCase()}
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Question Bank ────────────────────────────────────────────────────

const createQuestionSchema = z.object({
  positionType: z.enum(["unarmed_officer", "armed_officer", "supervisor"]),
  round: z.number().int().min(1).max(2),
  questionCategory: z.enum(["situational", "behavioral", "technical", "availability", "background"]),
  questionText: z.string().min(10, "Question text must be at least 10 characters"),
  maxScore: z.number().int().min(1).max(10).optional(),
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});
type CreateQuestionValues = z.infer<typeof createQuestionSchema>;

function QuestionBankTab() {
  const [positionFilter, setPositionFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data: questionsData, isLoading, refetch } = useQuery({
    queryKey: ["/api/recruitment/questions", positionFilter, roundFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (positionFilter !== "all") params.set("positionType", positionFilter);
      if (roundFilter !== "all") params.set("round", roundFilter);
      return fetch(`/api/recruitment/questions?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const questions: QuestionBankEntry[] = (questionsData as { questions?: QuestionBankEntry[] })?.questions ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recruitment/questions/${id}`, {}),
    onSuccess: () => {
      toast({ title: "Question deactivated" });
      refetch();
    },
  });

  const createForm = useForm<CreateQuestionValues>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      positionType: "unarmed_officer",
      round: 1,
      questionCategory: "behavioral",
      questionText: "",
      maxScore: 10,
      isRequired: false,
      displayOrder: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateQuestionValues) =>
      apiRequest("POST", "/api/recruitment/questions", values),
    onSuccess: () => {
      toast({ title: "Question created" });
      setCreateOpen(false);
      createForm.reset();
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to create question", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="w-44" data-testid="select-position-filter">
            <SelectValue placeholder="All positions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            <SelectItem value="unarmed_officer">Unarmed Officer</SelectItem>
            <SelectItem value="armed_officer">Armed Officer</SelectItem>
            <SelectItem value="supervisor">Supervisor</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roundFilter} onValueChange={setRoundFilter}>
          <SelectTrigger className="w-32" data-testid="select-round-filter">
            <SelectValue placeholder="All rounds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rounds</SelectItem>
            <SelectItem value="1">Round 1</SelectItem>
            <SelectItem value="2">Round 2</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
        <div className="ml-auto">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-question">
                <Plus className="w-4 h-4 mr-1" />
                Add Question
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Interview Question</DialogTitle>
                <DialogDescription>
                  Create a custom question for your workspace's interview bank.
                </DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={createForm.control}
                      name="positionType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Position</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-new-position">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="unarmed_officer">Unarmed Officer</SelectItem>
                              <SelectItem value="armed_officer">Armed Officer</SelectItem>
                              <SelectItem value="supervisor">Supervisor</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="round"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Round</FormLabel>
                          <Select
                            value={String(field.value)}
                            onValueChange={(v) => field.onChange(parseInt(v))}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-new-round">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">Round 1</SelectItem>
                              <SelectItem value="2">Round 2</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={createForm.control}
                    name="questionCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-new-category">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="situational">Situational</SelectItem>
                            <SelectItem value="behavioral">Behavioral</SelectItem>
                            <SelectItem value="technical">Technical</SelectItem>
                            <SelectItem value="availability">Availability</SelectItem>
                            <SelectItem value="background">Background</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="questionText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question Text</FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="Enter the interview question..."
                            data-testid="textarea-question-text"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={createForm.control}
                      name="maxScore"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Score (1–10)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                              data-testid="input-max-score"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="displayOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Order</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-display-order"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                      data-testid="button-submit-question"
                    >
                      {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                      Create Question
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No questions in bank.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <Card key={q.id} data-testid={`question-${q.id}`}>
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className="text-xs">Round {q.round}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{q.questionCategory}</Badge>
                      <Badge variant="outline" className="text-xs">{POSITION_LABELS[q.positionType] ?? q.positionType}</Badge>
                      {q.isRequired && <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Required</Badge>}
                      {!q.workspaceId && <Badge className="text-xs bg-muted text-muted-foreground">Platform Default</Badge>}
                    </div>
                    <p className="text-sm">{q.questionText}</p>
                    {q.maxScore && (
                      <p className="text-xs text-muted-foreground mt-1">Max score: {q.maxScore}</p>
                    )}
                  </div>
                  {q.workspaceId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(q.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-question-${q.id}`}
                    >
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Analytics ────────────────────────────────────────────────────────

function AnalyticsTab() {
  const { data: pipelineData } = useQuery({ queryKey: ["/api/recruitment/pipeline"] });
  const { data: rankedData } = useQuery({ queryKey: ["/api/recruitment/candidates/ranked"] });

  const pipeline = (pipelineData as { pipeline?: PipelineSummary })?.pipeline;
  const ranked = (rankedData as { ranked?: Array<{ candidate: Candidate; overallScore: number; recommendation: string; reasoning: string }> })?.ranked ?? [];

  const total = pipeline ? Object.values(pipeline).reduce((a, b) => a + b, 0) : 0;
  const decided = pipeline?.decided ?? 0;
  const conversionRate = total > 0 ? Math.round((decided / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold" data-testid="text-total-candidates">{total}</p>
            <p className="text-xs text-muted-foreground">Total Candidates</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-green-600">{pipeline?.decided ?? 0}</p>
            <p className="text-xs text-muted-foreground">Decisions Made</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground">Conversion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{pipeline?.chat_interview ?? 0}</p>
            <p className="text-xs text-muted-foreground">In Chat/Voice</p>
          </CardContent>
        </Card>
      </div>

      {/* Ranked candidates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Award className="w-4 h-4" />
            Top-Ranked Candidates
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ranked.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No scored candidates yet. Generate scorecards to see rankings.
            </div>
          ) : (
            ranked.slice(0, 10).map((entry, idx) => (
              <div
                key={entry.candidate.id}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-b-0"
                data-testid={`ranked-candidate-${entry.candidate.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-muted-foreground text-sm font-mono w-6 text-right shrink-0">#{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{entry.candidate.firstName} {entry.candidate.lastName}</p>
                    <p className="text-xs text-muted-foreground">{POSITION_LABELS[entry.candidate.positionType] ?? entry.candidate.positionType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ScoreBadge score={entry.overallScore} />
                  <Badge variant="outline" className="text-xs capitalize">
                    {RECOMMENDATION_LABELS[entry.recommendation] ?? entry.recommendation}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Stage distribution */}
      {pipeline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Stage Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(STAGE_LABELS).map(([stageKey, stageLabel]) => {
              const count = pipeline[stageKey as keyof PipelineSummary] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={stageKey} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{stageLabel}</span>
                    <span className="font-medium">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary rounded-full h-1.5 transition-all"
                      style={{ width: `${pct}%` }}
                      data-testid={`bar-stage-${stageKey}`}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState("pipeline");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: pipelineData, isLoading: pipelineLoading, refetch: refetchPipeline } = useQuery({
    queryKey: ["/api/recruitment/pipeline"],
  });

  const pipeline = (pipelineData as { pipeline?: PipelineSummary })?.pipeline;

  function openCandidate(id: string) {
    setSelectedCandidateId(id);
    setSheetOpen(true);
  }

  function handleSelectStage(stage: string) {
    setActiveTab("candidates");
  }

  function refreshAll() {
    refetchPipeline();
    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates/ranked"] });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-6 pb-4 border-b shrink-0">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Interview Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Trinity-powered three-channel recruitment: Email → Chat → Voice → Decision
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={refreshAll}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <NewCandidateDialog onSuccess={refreshAll} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="px-6 pt-4 shrink-0">
            <TabsList data-testid="tabs-recruitment">
              <TabsTrigger value="pipeline" data-testid="tab-pipeline">
                <TrendingUp className="w-4 h-4 mr-2" />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="candidates" data-testid="tab-candidates">
                <Users className="w-4 h-4 mr-2" />
                Candidates
              </TabsTrigger>
              <TabsTrigger value="questions" data-testid="tab-questions">
                <ListChecks className="w-4 h-4 mr-2" />
                Question Bank
              </TabsTrigger>
              <TabsTrigger value="analytics" data-testid="tab-analytics">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <TabsContent value="pipeline" className="mt-0">
              <PipelineTab
                pipeline={pipeline}
                pipelineLoading={pipelineLoading}
                onSelectStage={handleSelectStage}
                onSelectCandidate={openCandidate}
              />
            </TabsContent>

            <TabsContent value="candidates" className="mt-0">
              <CandidatesTab onSelectCandidate={openCandidate} />
            </TabsContent>

            <TabsContent value="questions" className="mt-0">
              <QuestionBankTab />
            </TabsContent>

            <TabsContent value="analytics" className="mt-0">
              <AnalyticsTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Candidate Detail Sheet */}
      <CandidateDetailSheet
        candidateId={selectedCandidateId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
