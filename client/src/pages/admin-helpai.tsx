import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Bot, User, Clock, Star, TrendingUp, AlertCircle, CheckCircle,
  MessageSquare, Search, ChevronRight, XCircle, Loader2,
  LifeBuoy, Activity, BarChart3, FileText, ArrowRight, Building2,
  ThumbsDown, TriangleAlert, CircleCheck, Inbox,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserIdentitySheet } from "@/components/support/UserIdentitySheet";

// ============================================================================
// TYPES
// ============================================================================

interface HelpAISessionRecord {
  id: string;
  ticketNumber: string;
  state: string;
  userId?: string;
  workspaceId?: string;
  guestName?: string;
  guestEmail?: string;
  authVerified: boolean;
  queuePosition?: number;
  wasEscalated: boolean;
  wasResolved: boolean;
  satisfactionScore?: number;
  escalationReason?: string;
  issueSummary?: string;
  conversationMessageCount?: number;
  totalDurationMs?: number;
  createdAt: string;
  resolvedAt?: string;
  escalatedAt?: string;
}

interface ClientPortalReport {
  id: string;
  reportType: string;
  severity: string;
  title: string;
  description: string;
  sentimentLabel?: string;
  sentimentScore?: number;
  frustrationSignals: number;
  aiSummary?: string;
  recommendedActions: string[];
  status: string;
  submittedByName?: string;
  submittedByEmail?: string;
  conversationTurns: number;
  creditsUsed: number;
  createdAt: string;
  orgResponseNote?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

interface ActionLogEntry {
  id: string;
  sessionId: string;
  actionType: string;
  actionName: string;
  toolUsed?: string;
  botSummoned?: string;
  commandUsed?: string;
  success: boolean;
  confidenceScore?: string;
  errorMessage?: string;
  durationMs?: number;
  tokensUsed?: number;
  inputPayload?: Record<string, any>;
  outputPayload?: Record<string, any>;
  createdAt: string;
}

interface HelpAIStats {
  total: number;
  resolved: number;
  escalated: number;
  avgRating: number | null;
  avgDurationMs: number | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDuration(ms?: number | null): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getStateBadgeVariant(state: string): "default" | "secondary" | "destructive" | "outline" {
  if (["resolved", "disconnected"].includes(state)) return "default";
  if (["waiting_for_human", "escalating"].includes(state)) return "destructive";
  if (["queued", "rating"].includes(state)) return "secondary";
  return "outline";
}

function ActionTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    query: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    fetch: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300",
    mutate: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300",
    escalate: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    bot_summon: "bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
    auth_check: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300",
    safety_code_verify: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
    faq_read: "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono ${colors[type] || "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

// ─── HelpAI v2 Activity Types ──────────────────────────────────────────────
interface HelpAIConversationV2 {
  id: string;
  layer: string;
  channelType: string;
  language: string;
  faithSensitivityState: string;
  status: string;
  priority: string;
  humanHandoffActive: boolean;
  createdAt: string;
  workspaceId?: string;
}

interface HelpAIProactiveAlertRecord {
  id: string;
  alertType: string;
  alertSourceThread?: string;
  description: string;
  priority: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  createdAt: string;
  workspaceId?: string;
}

interface HelpAIFaqGapRecord {
  id: string;
  questionReceived: string;
  language: string;
  wasAnswered: boolean;
  resolutionType?: string;
  createdAt: string;
}

interface HelpAICommandBusEntry {
  id: string;
  direction: string;
  messageType: string;
  priority: string;
  status: string;
  createdAt: string;
  workspaceId?: string;
}

interface HelpAIActivitySummary {
  activeConversations: number;
  handedOff: number;
  critical: number;
  slaBreaches: number;
  pendingAlerts: number;
  faqGapsPending: number;
  commandBusPending: number;
}

interface HelpAIActivityData {
  success: boolean;
  summary: HelpAIActivitySummary;
  conversations: HelpAIConversationV2[];
  slaLogs: any[];
  proactiveAlerts: HelpAIProactiveAlertRecord[];
  faqGaps: HelpAIFaqGapRecord[];
  commandBus: HelpAICommandBusEntry[];
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AdminHelpAI() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<HelpAISessionRecord | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeTab, setActiveTab] = useState("sessions");
  const [selectedReport, setSelectedReport] = useState<ClientPortalReport | null>(null);

  const { data: dockChatData, isLoading: reportsLoading, refetch: refetchReports } = useQuery<{ reports: ClientPortalReport[]; total: number }>({
    queryKey: ["/api/clients/dockchat/reports"],
    enabled: activeTab === "dockchat",
  });
  const dockChatReports = dockChatData?.reports || [];

  const pageConfig: CanvasPageConfig = {
    id: "admin-helpai",
    title: "HelpAI Review Dashboard",
    subtitle: "Monitor and review all HelpAI support sessions, actions, and escalations",
    category: "admin",
    maxWidth: "7xl",
    backButton: true,
    onBack: () => setLocation("/platform-admin"),
  };

  // Stats query
  const { data: statsData, isLoading: statsLoading } = useQuery<{ success: boolean; stats: HelpAIStats }>({
    queryKey: ["/api/helpai/admin/stats"],
  });

  // Sessions query
  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery<{ sessions: HelpAISessionRecord[] }>({
    queryKey: ["/api/helpai/admin/sessions"],
  });

  // Action log for selected session
  const { data: actionsData, isLoading: actionsLoading } = useQuery<ActionLogEntry[]>({
    queryKey: ["/api/helpai/admin/action-log", { sessionId: selectedSession?.id }],
    enabled: !!selectedSession,
  });

  // HelpAI v2 Activity query
  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useQuery<HelpAIActivityData>({
    queryKey: ["/api/helpai/v2/activity"],
    enabled: activeTab === "activity",
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) =>
      apiRequest("POST", `/api/helpai/v2/proactive-alerts/${alertId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/helpai/v2/activity"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
  });

  const stats = statsData?.stats;
  const sessions = sessionsData?.sessions || [];
  const actions = actionsData || [];

  const filteredSessions = sessions.filter(s =>
    !searchFilter ||
    s.ticketNumber.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (s.userId || "").toLowerCase().includes(searchFilter.toLowerCase()) ||
    (s.guestEmail || "").toLowerCase().includes(searchFilter.toLowerCase()) ||
    s.state.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Close session mutation
  const closeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest("POST", `/api/helpai/session/${sessionId}/close`, { resolution: "Closed by admin review" });
    },
    onSuccess: () => {
      toast({ title: "Session closed" });
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ["/api/helpai/admin/sessions"] });
    },
    onError: () => toast({ title: "Failed to close session", variant: "destructive" }),
  });

  const statsCards = [
    {
      label: "Total Sessions",
      value: statsLoading ? "…" : String(stats?.total ?? 0),
      icon: MessageSquare,
      color: "text-indigo-600",
      bg: "bg-indigo-50 dark:bg-indigo-950/30",
    },
    {
      label: "Resolved",
      value: statsLoading ? "…" : `${stats?.resolved ?? 0}`,
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950/30",
    },
    {
      label: "Escalated to Human",
      value: statsLoading ? "…" : `${stats?.escalated ?? 0}`,
      icon: AlertCircle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950/30",
    },
    {
      label: "Avg. Rating",
      value: statsLoading ? "…" : stats?.avgRating ? `${Number(stats.avgRating).toFixed(1)} / 5` : "—",
      icon: Star,
      color: "text-yellow-600",
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
    },
    {
      label: "Avg. Session Time",
      value: statsLoading ? "…" : formatDuration(stats?.avgDurationMs),
      icon: Clock,
      color: "text-violet-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
    },
  ];

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          {statsCards.map(card => (
            <Card key={card.label}>
              <CardContent className="p-3 sm:pt-6 sm:px-6">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-md ${card.bg} flex items-center justify-center shrink-0`}>
                    <card.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${card.color}`} />
                  </div>
                  <p className="text-lg sm:text-2xl font-bold truncate" data-testid={`stat-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {card.value}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="sessions" data-testid="tab-sessions">
              <LifeBuoy className="h-4 w-4 mr-1" />
              Support Sessions
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="h-4 w-4 mr-1" />
              HelpAI Activity
              // @ts-ignore — TS migration: fix in refactoring sprint
              {(activityData?.summary?.pendingAlerts ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  // @ts-ignore — TS migration: fix in refactoring sprint
                  {activityData?.summary?.pendingAlerts}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="dockchat" data-testid="tab-dockchat">
              <Building2 className="h-4 w-4 mr-1" />
              Client DockChat Reports
              {dockChatReports.filter(r => r.status === 'open').length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {dockChatReports.filter(r => r.status === 'open').length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ================================================================
              SESSIONS TAB
          ================================================================ */}
          <TabsContent value="sessions">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-base font-semibold">Support Sessions</h2>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ticket, user, or state..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="pl-10"
                data-testid="input-session-search"
              />
            </div>

            <Card>
              <ScrollArea style={{ height: "480px" }}>
                {sessionsLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                    <Bot className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No sessions found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredSessions.map(session => (
                      <button
                        key={session.id}
                        className={`w-full text-left p-4 transition-colors hover-elevate ${selectedSession?.id === session.id ? "bg-accent" : ""}`}
                        onClick={() => setSelectedSession(session)}
                        data-testid={`row-session-${session.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-sm font-semibold">{session.ticketNumber}</span>
                              <Badge variant={getStateBadgeVariant(session.state)} className="text-xs">
                                {session.state.replace(/_/g, " ")}
                              </Badge>
                              {session.wasEscalated && (
                                <Badge variant="destructive" className="text-xs">Escalated</Badge>
                              )}
                              {session.wasResolved && (
                                <Badge variant="default" className="text-xs">Resolved</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {session.userId
                                ? <UserIdentitySheet query={session.userId} trigger={<span className="flex items-center gap-1"><User className="h-3 w-3" /> User: {session.userId.substring(0, 20)}</span>} />
                                : session.guestEmail
                                  ? <UserIdentitySheet query={session.guestEmail} trigger={<span className="flex items-center gap-1"><User className="h-3 w-3" /> {session.guestEmail}</span>} />
                                  : "Guest"
                              }
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatTime(session.createdAt)} · {session.conversationMessageCount ?? 0} messages · {formatDuration(session.totalDurationMs)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {session.satisfactionScore && (
                              <div className="flex items-center gap-0.5 text-yellow-600">
                                <Star className="h-3 w-3" />
                                <span className="text-xs">{session.satisfactionScore}</span>
                              </div>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>
          </div>

          {/* ================================================================
              SESSION DETAIL + ACTION LOG
          ================================================================ */}
          <div className="space-y-4">
            {!selectedSession ? (
              <Card className="flex items-center justify-center" style={{ minHeight: "540px" }}>
                <div className="text-center space-y-3 p-8">
                  <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center mx-auto">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Select a session to view details and action log</p>
                </div>
              </Card>
            ) : (
              <>
                {/* Session Details */}
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className="font-mono">{selectedSession.ticketNumber}</span>
                          <Badge variant={getStateBadgeVariant(selectedSession.state)}>
                            {selectedSession.state.replace(/_/g, " ")}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Created {formatTime(selectedSession.createdAt)}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {!["disconnected", "resolved"].includes(selectedSession.state) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => closeMutation.mutate(selectedSession.id)}
                            disabled={closeMutation.isPending}
                            data-testid="button-close-session"
                          >
                            {closeMutation.isPending
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <XCircle className="h-4 w-4" />
                            }
                            Close
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSession(null)}
                        >
                          Back
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {[
                        { label: "Auth", value: selectedSession.authVerified ? "Verified" : "Guest" },
                        { label: "Messages", value: String(selectedSession.conversationMessageCount ?? 0) },
                        { label: "Duration", value: formatDuration(selectedSession.totalDurationMs) },
                        { label: "Rating", value: selectedSession.satisfactionScore ? `${selectedSession.satisfactionScore}/5` : "—" },
                        { label: "Escalated", value: selectedSession.wasEscalated ? "Yes" : "No" },
                        { label: "Resolved", value: selectedSession.wasResolved ? "Yes" : "No" },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="font-medium">{value}</p>
                        </div>
                      ))}
                    </div>

                    {selectedSession.escalationReason && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Escalation Reason</p>
                        <Badge variant="destructive" className="text-xs">{selectedSession.escalationReason}</Badge>
                      </div>
                    )}

                    {selectedSession.issueSummary && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Agent Handoff Summary (Trinity AI)</p>
                        <div className="bg-muted rounded-md p-3 text-sm leading-relaxed">
                          {selectedSession.issueSummary}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Log */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      Action Log
                      <Badge variant="secondary" className="ml-auto">{actions.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <ScrollArea style={{ height: "300px" }}>
                    {actionsLoading ? (
                      <div className="flex items-center justify-center h-24">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : actions.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                        No actions logged
                      </div>
                    ) : (
                      <div className="px-4 pb-4 space-y-2">
                        {actions.map(action => (
                          <div
                            key={action.id}
                            className="flex items-start gap-3 py-2 border-b last:border-0"
                            data-testid={`action-${action.id}`}
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              {action.success
                                ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                : <XCircle className="h-3.5 w-3.5 text-red-600" />
                              }
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <ActionTypeBadge type={action.actionType} />
                                <span className="text-xs font-medium">{action.actionName}</span>
                                {action.toolUsed && (
                                  <span className="text-xs text-muted-foreground">via {action.toolUsed}</span>
                                )}
                                {action.botSummoned && (
                                  <Badge variant="outline" className="text-xs">{action.botSummoned}</Badge>
                                )}
                                {action.commandUsed && (
                                  <code className="text-xs bg-muted px-1 rounded">{action.commandUsed}</code>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{formatTime(action.createdAt)}</span>
                                {action.durationMs && <span>{action.durationMs}ms</span>}
                                {action.tokensUsed && <span>{action.tokensUsed} tokens</span>}
                                {action.confidenceScore && (
                                  <span>conf: {action.confidenceScore}</span>
                                )}
                              </div>
                              {action.errorMessage && (
                                <p className="text-xs text-red-600">{action.errorMessage}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </Card>
              </>
            )}
          </div>
        </div>
          </TabsContent>

          {/* ================================================================
              HELPAI v2 ACTIVITY TAB
          ================================================================ */}
          <TabsContent value="activity">
            {activityLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Active Conversations", value: activityData?.summary?.activeConversations ?? 0, icon: MessageSquare, color: "text-blue-600 dark:text-blue-400" },
                    { label: "Critical Priority", value: activityData?.summary?.critical ?? 0, icon: AlertCircle, color: "text-red-600 dark:text-red-400" },
                    { label: "SLA Breaches", value: activityData?.summary?.slaBreaches ?? 0, icon: Clock, color: "text-orange-600 dark:text-orange-400" },
                    { label: "Pending Alerts", value: activityData?.summary?.pendingAlerts ?? 0, icon: TriangleAlert, color: "text-yellow-600 dark:text-yellow-400" },
                  ].map(card => (
                    <Card key={card.label}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <card.icon className={`h-5 w-5 ${card.color} shrink-0`} />
                        <div>
                          <p className="text-2xl font-bold">{card.value}</p>
                          <p className="text-xs text-muted-foreground">{card.label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Proactive Alerts */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <TriangleAlert className="h-4 w-4" style={{ color: "#ffd700" }} />
                          Proactive Alerts
                        </CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => refetchActivity()} data-testid="button-refresh-activity">
                          <Loader2 className="h-3 w-3 mr-1" />
                          Refresh
                        </Button>
                      </div>
                    </CardHeader>
                    <ScrollArea style={{ height: "320px" }}>
                      {(activityData?.proactiveAlerts?.length ?? 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                          <CircleCheck className="h-7 w-7 opacity-30" />
                          <p className="text-sm">No active alerts</p>
                        </div>
                      ) : (
                        <div className="divide-y px-4">
                          {activityData?.proactiveAlerts?.map(alert => (
                            <div key={alert.id} className="py-3 flex items-start gap-3" data-testid={`row-alert-${alert.id}`}>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant={alert.priority === 'critical' ? 'destructive' : alert.priority === 'high' ? 'secondary' : 'outline'}
                                    className="text-xs"
                                  >
                                    {alert.priority}
                                  </Badge>
                                  {alert.acknowledged && (
                                    <Badge variant="default" className="text-xs">Acknowledged</Badge>
                                  )}
                                </div>
                                <p className="text-xs font-medium">{alert.alertType?.replace(/_/g, ' ')}</p>
                                <p className="text-xs text-muted-foreground leading-snug">{alert.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(alert.createdAt).toLocaleString()}
                                </p>
                              </div>
                              {!alert.acknowledged && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                                  disabled={acknowledgeAlertMutation.isPending}
                                  data-testid={`button-ack-${alert.id}`}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </Card>

                  {/* FAQ Gaps */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        FAQ Gaps
                        <Badge variant="secondary" className="ml-auto">
                          {activityData?.faqGaps?.length ?? 0} pending
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Questions HelpAI couldn't answer — need new FAQ entries
                      </CardDescription>
                    </CardHeader>
                    <ScrollArea style={{ height: "280px" }}>
                      {(activityData?.faqGaps?.length ?? 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                          <CheckCircle className="h-7 w-7 opacity-30" />
                          <p className="text-sm">No FAQ gaps pending</p>
                        </div>
                      ) : (
                        <div className="divide-y px-4">
                          {activityData?.faqGaps?.map(gap => (
                            <div key={gap.id} className="py-3 space-y-1" data-testid={`row-faqgap-${gap.id}`}>
                              <div className="flex items-center gap-2">
                                <Badge variant={gap.language === 'es' ? 'secondary' : 'outline'} className="text-xs">
                                  {gap.language === 'es' ? 'ES' : 'EN'}
                                </Badge>
                                {gap.wasAnswered && (
                                  <Badge variant="default" className="text-xs">Answered</Badge>
                                )}
                              </div>
                              <p className="text-xs leading-snug line-clamp-2">{gap.questionReceived}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(gap.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </Card>

                  {/* Recent Conversations */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        Recent Conversations
                        <Badge variant="secondary" className="ml-auto">
                          {activityData?.conversations?.length ?? 0}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <ScrollArea style={{ height: "280px" }}>
                      {(activityData?.conversations?.length ?? 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                          <Bot className="h-7 w-7 opacity-30" />
                          <p className="text-sm">No conversations yet</p>
                        </div>
                      ) : (
                        <div className="divide-y px-4">
                          {activityData?.conversations?.map(conv => (
                            <div key={conv.id} className="py-3 flex items-start gap-3" data-testid={`row-conv-${conv.id}`}>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant={conv.priority === 'critical' ? 'destructive' : conv.status === 'active' ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {conv.status}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">{conv.layer}</Badge>
                                  {conv.humanHandoffActive && (
                                    <Badge variant="secondary" className="text-xs">Human Active</Badge>
                                  )}
                                  {conv.language === 'es' && (
                                    <Badge variant="outline" className="text-xs">ES</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {conv.channelType} · Faith: {conv.faithSensitivityState}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(conv.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </Card>

                  {/* Command Bus */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        Command Bus
                        // @ts-ignore — TS migration: fix in refactoring sprint
                        {(activityData?.summary?.commandBusPending ?? 0) > 0 && (
                          <Badge variant="destructive" className="ml-auto text-xs">
                            // @ts-ignore — TS migration: fix in refactoring sprint
                            {activityData?.summary?.commandBusPending} pending
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">Recent Trinity-HelpAI command bus messages</CardDescription>
                    </CardHeader>
                    <ScrollArea style={{ height: "280px" }}>
                      {(activityData?.commandBus?.length ?? 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                          <Inbox className="h-7 w-7 opacity-30" />
                          <p className="text-sm">No bus activity</p>
                        </div>
                      ) : (
                        <div className="divide-y px-4">
                          {activityData?.commandBus?.map(entry => (
                            <div key={entry.id} className="py-3 space-y-1" data-testid={`row-bus-${entry.id}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant={entry.status === 'sent' ? 'secondary' : entry.status === 'processed' ? 'default' : 'outline'}
                                  className="text-xs"
                                >
                                  {entry.status}
                                </Badge>
                                <Badge
                                  variant={entry.priority === 'critical' ? 'destructive' : 'outline'}
                                  className="text-xs"
                                >
                                  {entry.priority}
                                </Badge>
                              </div>
                              <p className="text-xs font-medium">
                                {entry.direction === 'helpai_to_trinity' ? 'HelpAI → Trinity' : 'Trinity → HelpAI'}: {entry.messageType}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(entry.createdAt).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ================================================================
              DOCKCHAT REPORTS TAB
          ================================================================ */}
          <TabsContent value="dockchat">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Report List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-base font-semibold">Client Portal Reports</h2>
                </div>

                <ScrollArea className="h-[500px]">
                  {reportsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : dockChatReports.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                      <Inbox className="h-8 w-8" />
                      <p className="text-sm">No client reports yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2 pr-2">
                      {dockChatReports.map(report => (
                        <Card
                          key={report.id}
                          className={`cursor-pointer hover-elevate ${selectedReport?.id === report.id ? 'ring-2 ring-primary' : ''}`}
                          onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}
                          data-testid={`report-card-${report.id}`}
                        >
                          <CardContent className="pt-4 pb-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant={report.status === 'open' ? 'destructive' : report.status === 'resolved' ? 'secondary' : 'outline'}
                                    className="text-xs"
                                  >
                                    {report.status}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {report.severity}
                                  </Badge>
                                  {report.sentimentLabel && (
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {report.sentimentLabel === 'angry' || report.sentimentLabel === 'frustrated' ? (
                                        <ThumbsDown className="h-3 w-3 mr-1" />
                                      ) : null}
                                      {report.sentimentLabel}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-medium mt-1 truncate" data-testid={`report-title-${report.id}`}>
                                  {report.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {report.reportType.replace(/_/g, ' ')}
                                  {report.submittedByName ? ` · ${report.submittedByName}` : ''}
                                  {' · '}{new Date(report.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-muted-foreground">{report.creditsUsed}cr</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Report Detail */}
              {selectedReport ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">Report Detail</h2>
                    <div className="flex gap-2">
                      {selectedReport.status === 'open' && (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="button-acknowledge-report"
                          onClick={async () => {
                            try {
                              await apiRequest("POST", `/api/clients/dockchat/reports/${selectedReport.id}/acknowledge`, {});
                              toast({ title: "Report acknowledged" });
                              refetchReports();
                              setSelectedReport(null);
                            } catch {
                              toast({ title: "Failed to acknowledge", variant: "destructive" });
                            }
                          }}
                        >
                          <CircleCheck className="h-4 w-4 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                      {(selectedReport.status === 'open' || selectedReport.status === 'acknowledged') && (
                        <Button
                          size="sm"
                          data-testid="button-resolve-report"
                          onClick={async () => {
                            try {
                              await apiRequest("POST", `/api/clients/dockchat/reports/${selectedReport.id}/resolve`, {});
                              toast({ title: "Report resolved" });
                              refetchReports();
                              setSelectedReport(null);
                            } catch {
                              toast({ title: "Failed to resolve", variant: "destructive" });
                            }
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Mark Resolved
                        </Button>
                      )}
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <CardTitle className="text-sm font-semibold">{selectedReport.title}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {selectedReport.reportType.replace(/_/g, ' ')} ·{' '}
                            {selectedReport.submittedByName || 'Anonymous'}
                            {selectedReport.submittedByEmail ? ` (${selectedReport.submittedByEmail})` : ''}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant={selectedReport.status === 'resolved' ? 'secondary' : 'outline'}>
                            {selectedReport.status}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {selectedReport.severity}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Sentiment */}
                      {selectedReport.sentimentLabel && (
                        <div className="flex items-center gap-2 text-sm">
                          {selectedReport.sentimentLabel === 'angry' || selectedReport.sentimentLabel === 'frustrated' ? (
                            <TriangleAlert className="h-4 w-4 text-orange-500" />
                          ) : (
                            <Activity className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-muted-foreground">Sentiment:</span>
                          <span className="font-medium capitalize">{selectedReport.sentimentLabel}</span>
                          {selectedReport.sentimentScore !== undefined && (
                            <span className="text-muted-foreground text-xs">({Number(selectedReport.sentimentScore).toFixed(2)})</span>
                          )}
                          {selectedReport.frustrationSignals > 0 && (
                            <Badge variant="destructive" className="text-xs ml-1">
                              {selectedReport.frustrationSignals} frustration signal{selectedReport.frustrationSignals > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Client description */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Client Stated</p>
                        <p className="text-sm text-foreground leading-relaxed bg-muted/50 rounded-md p-3">
                          {selectedReport.description.substring(0, 400)}
                          {selectedReport.description.length > 400 ? '…' : ''}
                        </p>
                      </div>

                      {/* AI Summary */}
                      {selectedReport.aiSummary && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">AI Summary</p>
                          <ScrollArea className="h-36">
                            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans p-3 bg-muted/50 rounded-md">
                              {selectedReport.aiSummary}
                            </pre>
                          </ScrollArea>
                        </div>
                      )}

                      {/* Recommended Actions */}
                      {selectedReport.recommendedActions?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Recommended Actions</p>
                          <ul className="space-y-1">
                            {selectedReport.recommendedActions.map((action, i) => (
                              <li key={i} className="text-xs flex items-start gap-2">
                                <ArrowRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-2 border-t">
                        <span>{selectedReport.conversationTurns} conversation turns</span>
                        <span>{selectedReport.creditsUsed} tokens used</span>
                        <span>Submitted {new Date(selectedReport.createdAt).toLocaleDateString()}</span>
                        {selectedReport.acknowledgedAt && (
                          <span>Acknowledged {new Date(selectedReport.acknowledgedAt).toLocaleDateString()}</span>
                        )}
                        {selectedReport.resolvedAt && (
                          <span>Resolved {new Date(selectedReport.resolvedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 border rounded-lg">
                  <Building2 className="h-8 w-8" />
                  <p className="text-sm">Select a report to view details</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
