/**
 * CANDIDATE PROFILE PAGE
 * Phase 58 — Trinity Interview Pipeline
 *
 * Dedicated full-page view for a single candidate, accessible at:
 *   /recruitment/candidates/:id
 *
 * Shows the complete candidate lifecycle: contact details, Trinity score,
 * all interview sessions with Q&A logs, DockChat integration, voice interview,
 * scorecard breakdown, and recruiter decision controls.
 */

import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail,
  MessageSquare,
  Phone,
  CheckCircle,
  XCircle,
  Clock,
  Brain,
  ChevronLeft,
  Loader2,
  FileText,
  ExternalLink,
  Mic,
  Star,
  Award,
  Target,
  Calendar,
  User,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  screening: "Screened",
  email_round_1: "Email Round 1",
  email_round_2: "Email Round 2",
  chat_interview: "Chat Interview",
  voice_interview: "Voice Interview",
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
};

function ScoreBadge({ score }: { score?: number | null }) {
  if (!score) return <Badge variant="outline" className="text-xs">Unscored</Badge>;
  const color =
    score >= 75 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
    score >= 60 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return <Badge className={`text-xs ${color}`}>{score}/100</Badge>;
}

// ─── Chat Co-Pilot Panel ─────────────────────────────────────────────────────

interface CoPilotEvent {
  content: string;
  createdAt: string;
  evasive?: boolean;
  score?: number;
}

function ChatCopilotPanel({
  candidateId,
  candidate,
  chatSession,
}: {
  candidateId: string;
  candidate: Candidate;
  chatSession?: Session;
}) {
  const { data: copilotData, refetch: refetchCopilot } = useQuery({
    queryKey: ["/api/recruitment/candidates", candidateId, "chat-copilot"],
    queryFn: () =>
      fetch(`/api/recruitment/candidates/${candidateId}/chat-copilot`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!candidate.chatRoomId,
    refetchInterval: chatSession?.status === "in_progress" ? 10000 : false,
  });

  const events: CoPilotEvent[] = (copilotData as any)?.events ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Chat Interview
          {chatSession && (
            <Badge variant="outline" className="text-xs ml-auto capitalize">{chatSession.status}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidate.chatRoomUrl && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Room:</span>
            <code className="text-xs bg-muted px-2 py-0.5 rounded">{candidate.chatRoomId?.slice(0, 12)}…</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(candidate.chatRoomUrl, '_blank')}
              data-testid="button-open-docchat-profile"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Open Room
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetchCopilot()}
              data-testid="button-refresh-copilot"
            >
              <Brain className="w-3 h-3 mr-1" />
              Refresh Co-Pilot
            </Button>
          </div>
        )}
        {chatSession?.sessionScore != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Session score:</span>
            <ScoreBadge score={chatSession.sessionScore} />
          </div>
        )}
        {events.length > 0 ? (
          <div className="space-y-2" data-testid="copilot-events-list">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Brain className="w-3 h-3" />
              Trinity Co-Pilot Log (Recruiter Only)
            </p>
            <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
              {events.map((evt, i) => (
                <div key={i} className="p-2 text-xs space-y-1" data-testid={`copilot-event-${i}`}>
                  {evt.evasive && (
                    <span className="inline-block bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.5 rounded text-xs font-medium mr-1">
                      Evasive
                    </span>
                  )}
                  {evt.score != null && (
                    <span className="inline-block bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.5 rounded text-xs font-medium mr-1">
                      {evt.score}/10
                    </span>
                  )}
                  <p className="text-muted-foreground whitespace-pre-wrap">{evt.content}</p>
                </div>
              ))}
            </div>
          </div>
        ) : candidate.chatRoomId ? (
          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Trinity Co-Pilot Active</p>
            <p>Trinity monitors the chat room in real time, flagging evasive answers and suggesting follow-ups. Co-pilot observations will appear here as the interview progresses.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Candidate Profile Page ───────────────────────────────────────────────────

export default function CandidateProfilePage() {
  const params = useParams<{ id: string }>();
  const candidateId = params?.id;
  const [, navigate] = useLocation();
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
    },
  });

  const sendRound1Mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/send-questions`, { round: 1 }),
    onSuccess: () => {
      toast({ title: "Round 1 sent" });
      refetch();
    },
  });

  const sendRound2Mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/send-questions`, { round: 2 }),
    onSuccess: () => {
      toast({ title: "Round 2 sent" });
      refetch();
    },
  });

  const generateScorecardMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/scorecard`, {}),
    onSuccess: () => {
      toast({ title: "Scorecard generated" });
      refetch();
    },
  });

  const advanceStageMutation = useMutation({
    mutationFn: (stage: string) =>
      apiRequest("PATCH", `/api/recruitment/candidates/${candidateId}/stage`, { stage }),
    onSuccess: () => {
      toast({ title: "Stage updated" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/pipeline"] });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: (payload: { decision: string; notes: string }) =>
      apiRequest("PATCH", `/api/recruitment/candidates/${candidateId}/decision`, payload),
    onSuccess: (_: unknown, vars: { decision: string; notes: string }) => {
      toast({ title: "Decision recorded", description: `Candidate marked: ${vars.decision}` });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/pipeline"] });
    },
  });

  const createChatRoomMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/chat-room`, {}),
    onSuccess: () => {
      toast({ title: "Chat interview room created", description: "Trinity co-pilot is active." });
      refetch();
    },
    onError: () => toast({ title: "Failed to create chat room", variant: "destructive" }),
  });

  const initVoiceSessionMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruitment/candidates/${candidateId}/voice-session`, {}),
    onSuccess: (result: any) => {
      toast({ title: "Voice interview session created", description: `${result?.questionCount ?? 0} questions loaded.` });
      refetch();
    },
    onError: () => toast({ title: "Failed to initialize voice session", variant: "destructive" }),
  });

  const parsedResume = candidate?.resumeParsed as Record<string, unknown> | null;
  const chatSession = sessions.find(s => s.sessionType === 'chat_interview');
  const voiceSession = sessions.find(s => s.sessionType === 'voice_interview');
  const emailSessions = sessions.filter(s => s.sessionType.startsWith('email_'));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/recruitment")}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Pipeline
        </Button>
        <p className="text-muted-foreground mt-4">Candidate not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/recruitment")} data-testid="link-back-to-pipeline">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Pipeline
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold" data-testid="text-candidate-name-profile">
            {candidate.firstName} {candidate.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {candidate.candidateNumber} · {POSITION_LABELS[candidate.positionType] ?? candidate.positionType}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ScoreBadge score={candidate.qualificationScore} />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: contact + resume */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <User className="w-4 h-4" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span data-testid="text-candidate-email-profile">{candidate.email}</span>
              </div>
              {candidate.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>{candidate.phone}</span>
                </div>
              )}
              {candidate.positionTitle && (
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>{candidate.positionTitle}</span>
                </div>
              )}
              {candidate.createdAt && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>Applied {new Date(candidate.createdAt).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trinity AI Score */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Trinity Score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <ScoreBadge score={candidate.qualificationScore} />
                {!candidate.qualificationScore && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => screenMutation.mutate()}
                    disabled={screenMutation.isPending}
                    data-testid="button-screen-candidate-profile"
                  >
                    {screenMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Run Screen
                  </Button>
                )}
              </div>
              {parsedResume && Object.keys(parsedResume).length > 0 && (
                <div className="space-y-2">
                  // @ts-ignore — TS migration: fix in refactoring sprint
                  {(parsedResume as any).summary && (
                    <p className="text-xs text-muted-foreground">{String(parsedResume.summary)}</p>
                  )}
                  {(parsedResume.strengths as string[] | undefined)?.length ? (
                    <div>
                      <p className="text-xs font-medium mb-1">Strengths</p>
                      <div className="flex flex-wrap gap-1">
                        {(parsedResume.strengths as string[]).map((s, i) => (
                          <span key={i} className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-xs">{s}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {(parsedResume.redFlags as string[] | undefined)?.length ? (
                    <div>
                      <p className="text-xs font-medium mb-1">Red Flags</p>
                      <div className="flex flex-wrap gap-1">
                        {(parsedResume.redFlags as string[]).map((f, i) => (
                          <span key={i} className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-xs">{f}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => sendRound1Mutation.mutate()}
                disabled={sendRound1Mutation.isPending}
                data-testid="button-send-round1-profile"
              >
                {sendRound1Mutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                <Mail className="w-3 h-3 mr-2" />
                Send Email Round 1
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => sendRound2Mutation.mutate()}
                disabled={sendRound2Mutation.isPending}
                data-testid="button-send-round2-profile"
              >
                {sendRound2Mutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                <Mail className="w-3 h-3 mr-2" />
                Send Email Round 2
              </Button>
              {!candidate.chatRoomId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => createChatRoomMutation.mutate()}
                  disabled={createChatRoomMutation.isPending}
                  data-testid="button-create-chat-room-profile"
                >
                  {createChatRoomMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  <MessageSquare className="w-3 h-3 mr-2" />
                  Create Chat Interview Room
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open(candidate.chatRoomUrl, '_blank')}
                  data-testid="button-open-chat-room-profile"
                >
                  <ExternalLink className="w-3 h-3 mr-2" />
                  Open Chat Room
                </Button>
              )}
              {!candidate.voiceSessionId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => initVoiceSessionMutation.mutate()}
                  disabled={initVoiceSessionMutation.isPending}
                  data-testid="button-init-voice-session-profile"
                >
                  {initVoiceSessionMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  <Phone className="w-3 h-3 mr-2" />
                  Initialize Voice Session
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => advanceStageMutation.mutate('voice_interview')}
                  disabled={advanceStageMutation.isPending}
                  data-testid="button-advance-voice-profile"
                >
                  <Phone className="w-3 h-3 mr-2" />
                  Advance to Voice Interview
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => generateScorecardMutation.mutate()}
                disabled={generateScorecardMutation.isPending}
                data-testid="button-generate-scorecard-profile"
              >
                {generateScorecardMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                <FileText className="w-3 h-3 mr-2" />
                Generate Scorecard
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Center column: sessions */}
        <div className="space-y-4">
          {/* Email Interview Sessions */}
          {emailSessions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Interview ({emailSessions.length} session{emailSessions.length !== 1 ? 's' : ''})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {emailSessions.map((session, idx) => {
                  const questions = (session.questionsAsked ?? []) as Array<{ questionText?: string; maxScore?: number }>;
                  const responses = (session.responsesReceived ?? []) as Array<{ questionIndex?: number; responseText?: string; score?: number; feedback?: string }>;
                  return (
                    <div key={session.id} data-testid={`email-session-${session.id}`}>
                      {idx > 0 && <Separator className="mb-4" />}
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <span className="text-sm font-medium capitalize">{session.sessionType.replace('_', ' ')}</span>
                        <div className="flex items-center gap-2">
                          {session.sessionScore != null && (
                            <Badge variant="outline" className="text-xs">{session.sessionScore}/100</Badge>
                          )}
                          <Badge variant="outline" className="text-xs capitalize">{session.status}</Badge>
                        </div>
                      </div>
                      {questions.length > 0 ? (
                        <div className="space-y-3">
                          {questions.map((q, qi) => {
                            const resp = responses.find(r => (r.questionIndex ?? -1) === qi);
                            return (
                              <div key={qi} className="text-xs space-y-1">
                                <p className="font-medium text-foreground">Q{qi + 1}: {q.questionText}</p>
                                {resp ? (
                                  <>
                                    <p className="text-muted-foreground pl-3 border-l-2 border-muted">{resp.responseText}</p>
                                    {resp.score != null && (
                                      <p className="text-xs text-muted-foreground pl-3">Score: {resp.score}/{q.maxScore ?? 10}{resp.feedback ? ` — ${resp.feedback}` : ''}</p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-muted-foreground pl-3 italic">No response yet</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No questions logged yet.</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Chat Interview */}
          {(chatSession || candidate.chatRoomId) && (
            <ChatCopilotPanel
              candidateId={candidateId!}
              candidate={candidate}
              chatSession={chatSession}
            />
          )}

          {/* Voice Interview */}
          {(voiceSession || candidate.voiceSessionId) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  Voice Interview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {voiceSession ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">{voiceSession.status}</Badge>
                      {voiceSession.sessionScore != null && (
                        <Badge variant="outline" className="text-xs">{voiceSession.sessionScore}/100</Badge>
                      )}
                    </div>
                    {voiceSession.voiceRecordingUrl && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Recording</p>
                        <audio controls src={voiceSession.voiceRecordingUrl} className="w-full h-8" />
                      </div>
                    )}
                    {voiceSession.voiceTranscript && (
                      <div>
                        <p className="text-xs font-medium mb-1">Transcript</p>
                        <div className="rounded-md border p-3 text-xs text-muted-foreground max-h-48 overflow-y-auto whitespace-pre-wrap">
                          {voiceSession.voiceTranscript}
                        </div>
                      </div>
                    )}
                    {!voiceSession.voiceRecordingUrl && !voiceSession.voiceTranscript && (
                      <div className="rounded-md border p-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">Twilio Voice Flow</p>
                        <p>Structured voice interview via Twilio Gather. Trinity scores responses in real time. Recording and transcript will appear here when the session completes.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Voice session not yet initiated for this candidate.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Application Text */}
          {candidate.rawApplicationText && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Application Text
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {candidate.rawApplicationText}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: scorecard + decision */}
        <div className="space-y-4">
          {/* Scorecard */}
          {scorecard ? (
            <Card data-testid="scorecard-panel-profile">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  Trinity Scorecard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {scorecard.overallScore != null && (
                  <div className="text-center py-2">
                    <p className="text-4xl font-bold">{scorecard.overallScore}</p>
                    <p className="text-xs text-muted-foreground">Overall Score</p>
                  </div>
                )}
                <div className="space-y-2">
                  {[
                    { label: "Qualification", value: scorecard.qualificationScore, icon: Star },
                    { label: "Communication", value: scorecard.communicationScore, icon: MessageSquare },
                    { label: "Availability", value: scorecard.availabilityScore, icon: Clock },
                    { label: "Experience", value: scorecard.experienceScore, icon: Award },
                  ].map(({ label, value, icon: Icon }) =>
                    value != null ? (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Icon className="w-3 h-3" />
                          {label}
                        </span>
                        <div className="flex items-center gap-2 flex-1 max-w-32">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, value)}%` }} />
                          </div>
                          <span className="text-xs font-medium w-8 text-right">{value}</span>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
                {scorecard.trinityRecommendation && (
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="text-xs font-medium">Trinity: {scorecard.trinityRecommendation}</p>
                    {scorecard.trinityReasoning && (
                      <p className="text-xs text-muted-foreground">{scorecard.trinityReasoning}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  Trinity Scorecard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">No scorecard generated yet.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => generateScorecardMutation.mutate()}
                  disabled={generateScorecardMutation.isPending}
                  data-testid="button-generate-scorecard-2-profile"
                >
                  {generateScorecardMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  <FileText className="w-3 h-3 mr-1" />
                  Generate Scorecard
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Recruiter Decision */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recruiter Decision
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.decision && candidate.decisionNotes && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium capitalize">{candidate.decision}</p>
                  <p className="text-muted-foreground text-xs mt-1">{candidate.decisionNotes}</p>
                  {candidate.decisionAt && (
                    <p className="text-xs text-muted-foreground mt-1">{new Date(candidate.decisionAt).toLocaleDateString()}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => { setDecisionNotes(""); setDecisionDialog({ decision: 'hire', label: 'Hire' }); }}
                  disabled={decisionMutation.isPending}
                  data-testid="button-decision-hire-profile"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Hire
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => { setDecisionNotes(""); setDecisionDialog({ decision: 'hold', label: 'Hold' }); }}
                  disabled={decisionMutation.isPending}
                  data-testid="button-decision-hold-profile"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Hold
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => { setDecisionNotes(""); setDecisionDialog({ decision: 'reject', label: 'Reject' }); }}
                  disabled={decisionMutation.isPending}
                  data-testid="button-decision-reject-profile"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
              placeholder="Optional notes (e.g., 'Strong background check — recommend immediate hire')"
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              data-testid="textarea-decision-notes-profile"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>Cancel</Button>
            <Button
              disabled={decisionMutation.isPending}
              onClick={() => {
                if (decisionDialog) {
                  decisionMutation.mutate({ decision: decisionDialog.decision, notes: decisionNotes });
                  setDecisionDialog(null);
                }
              }}
              data-testid="button-confirm-decision-profile"
            >
              {decisionMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Confirm {decisionDialog?.label}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
