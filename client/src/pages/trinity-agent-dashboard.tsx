/**
 * Trinity Agent Dashboard — Phase 16
 * =====================================
 * Support-agent command interface for managing Trinity operations:
 *   - Pending approval queue (all workspaces or filtered)
 *   - Escalations at SLA risk
 *   - Activity feed (cross-workspace)
 *   - Override / approve actions with mandatory reason
 *   - Reasoning viewer for any Trinity action
 *
 * Role gate: support_agent / support_manager / sysop or higher.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
  return (await res.json()) as T;
}
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {Eye, Shield,
  AlertTriangle,
  Activity,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  RefreshCw,
  Search,
} from 'lucide-react';
import { TrinityArrowMark } from '@/components/trinity-logo';

// ── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  workspace_id: string;
  workspace_name?: string;
  action_type: string;
  action_name?: string;
  status: string;
  parameters?: Record<string, unknown>;
  reason?: string;
  confidence_score?: number;
  risk_factors?: string[];
  created_at: string;
  expires_at?: string;
}

interface Escalation {
  ticket_id: string;
  workspace_id: string;
  workspace_name?: string;
  subject: string;
  status: string;
  priority?: string;
  sla_deadline?: string;
  sla_breached?: boolean;
  created_at: string;
}

interface ActivityItem {
  id: string;
  workspace_id: string;
  workspace_name?: string;
  action_type: string;
  action_name?: string;
  status: string;
  duration_ms?: number;
  created_at: string;
}

interface ReasoningData {
  approval: Record<string, unknown> | null;
  decision: Record<string, unknown> | null;
  executionLog: Record<string, unknown> | null;
}

// ── Helper ─────────────────────────────────────────────────────────────────

function confidenceBadge(score?: number) {
  if (score === undefined || score === null) return null;
  const pct = Math.round(score * 100);
  if (pct >= 76)
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{pct}% Auto</Badge>;
  if (pct >= 41)
    return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{pct}% Graduated</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{pct}% Hand-Held</Badge>;
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Override Dialog ─────────────────────────────────────────────────────────

interface ActionDialogProps {
  item: QueueItem;
  mode: 'approve' | 'override';
  onClose: () => void;
}

function ActionDialog({ item, mode, onClose }: ActionDialogProps) {
  const [reason, setReason] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (body: { actionId: string; reason: string }) =>
      apiRequest(
        'POST',
        mode === 'approve'
          ? '/api/trinity/agent-dashboard/approve'
          : '/api/trinity/agent-dashboard/override',
        body,
      ),
    onSuccess: () => {
      toast({
        title: mode === 'approve' ? 'Action approved' : 'Action overridden',
        description: `Trinity action has been ${mode === 'approve' ? 'approved' : 'denied'}.`,
      });
      qc.invalidateQueries({ queryKey: ['/api/trinity/agent-dashboard/queue'] });
      onClose();
    },
    onError: (err: unknown) => {
      toast({
        title: 'Failed',
        description: String(err),
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-[#0d1426] border-white/20 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'approve' ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            {mode === 'approve' ? 'Approve Action' : 'Override Trinity Action'}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {item.action_name || item.action_type}
            {item.workspace_name && ` — ${item.workspace_name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Parameters preview */}
          {item.parameters && (
            <div className="rounded bg-card/5 p-3 text-xs font-mono text-white/60 max-h-24 overflow-auto">
              {JSON.stringify(item.parameters, null, 2)}
            </div>
          )}

          {/* Risk factors */}
          {item.risk_factors?.length ? (
            <div className="flex flex-wrap gap-1">
              {item.risk_factors.map(f => (
                <Badge key={f} variant="outline" className="text-xs border-red-500/30 text-red-400">
                  {f}
                </Badge>
              ))}
            </div>
          ) : null}

          <div>
            <label className="text-xs text-white/60 block mb-1">
              Reason <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={
                mode === 'approve'
                  ? 'Why are you approving this action?'
                  : 'Why are you overriding this action?'
              }
              className="bg-card/5 border-white/20 text-white placeholder:text-white/30 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-white/60"
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() =>
              mutation.mutate({ actionId: item.id, reason: reason.trim() })
            }
            disabled={!reason.trim() || mutation.isPending}
            className={
              mode === 'approve'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }
          >
            {mutation.isPending
              ? 'Processing…'
              : mode === 'approve'
              ? 'Confirm Approve'
              : 'Confirm Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reasoning Drawer ───────────────────────────────────────────────────────

function ReasoningDrawer({
  actionId,
  onClose,
}: {
  actionId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{
    success: boolean;
    reasoning: ReasoningData;
  }>({
    queryKey: ['/api/trinity/agent-dashboard/reasoning', actionId],
    queryFn: () =>
      fetchJson(`/api/trinity/agent-dashboard/reasoning/${actionId}`),
  });

  const reasoning = data?.reasoning;

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-[#0d1426] border-white/20 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#4FC3F7]" />
            Trinity Reasoning
          </DialogTitle>
          <DialogDescription className="text-white/40 text-xs font-mono">
            {actionId}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full bg-card/10" />
            ))}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 py-2">
              {/* Decision reasoning */}
              {reasoning?.decision && (
                <div className="rounded bg-card/5 p-3 space-y-2">
                  <div className="text-xs font-semibold text-[#4FC3F7] uppercase tracking-wider">
                    Decision Reasoning
                  </div>
                  {(reasoning.decision as any).reasoning && (
                    <p className="text-sm text-white/70 leading-relaxed">
                      {(reasoning.decision as any).reasoning}
                    </p>
                  )}
                  {(reasoning.decision as any).verifierReasoning && (
                    <div className="mt-2">
                      <div className="text-xs text-white/40 mb-1">Verifier (Claude):</div>
                      <p className="text-sm text-white/60 leading-relaxed">
                        {(reasoning.decision as any).verifierReasoning}
                      </p>
                    </div>
                  )}
                  {(reasoning.decision as any).verifierSuggestedAlternative && (
                    <div className="mt-2">
                      <div className="text-xs text-white/40 mb-1">Alternative considered:</div>
                      <p className="text-sm text-white/60 leading-relaxed italic">
                        {(reasoning.decision as any).verifierSuggestedAlternative}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Approval context */}
              {reasoning?.approval && (
                <div className="rounded bg-card/5 p-3 space-y-2">
                  <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
                    Pending Approval Context
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-white/40">Action type:</span>{' '}
                      <span className="text-white/70">
                        {(reasoning.approval as any).action_type}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/40">Confidence:</span>{' '}
                      {confidenceBadge(
                        parseFloat((reasoning.approval as any).confidence_score ?? '1'),
                      )}
                    </div>
                  </div>
                  {(reasoning.approval as any).reason && (
                    <p className="text-sm text-white/60 leading-relaxed">
                      {(reasoning.approval as any).reason}
                    </p>
                  )}
                  {Array.isArray((reasoning.approval as any).risk_factors) &&
                    (reasoning.approval as any).risk_factors.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {((reasoning.approval as any).risk_factors as string[]).map(f => (
                          <Badge
                            key={f}
                            variant="outline"
                            className="text-xs border-red-500/30 text-red-400"
                          >
                            {f}
                          </Badge>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {/* Execution log */}
              {reasoning?.executionLog && (
                <div className="rounded bg-card/5 p-3 space-y-2">
                  <div className="text-xs font-semibold text-green-400 uppercase tracking-wider">
                    Execution Log
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-white/40">Status:</span>{' '}
                      <span className="text-white/70">
                        {(reasoning.executionLog as any).status}
                      </span>
                    </div>
                    {(reasoning.executionLog as any).duration_ms && (
                      <div>
                        <span className="text-white/40">Duration:</span>{' '}
                        <span className="text-white/70">
                          {(reasoning.executionLog as any).duration_ms}ms
                        </span>
                      </div>
                    )}
                  </div>
                  {(reasoning.executionLog as any).error_message && (
                    <p className="text-sm text-red-400">
                      {(reasoning.executionLog as any).error_message}
                    </p>
                  )}
                </div>
              )}

              {!reasoning?.decision && !reasoning?.approval && !reasoning?.executionLog && (
                <div className="text-center text-white/40 py-8">
                  No reasoning data available for this action
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/60">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TrinityAgentDashboard() {
  const [selectedAction, setSelectedAction] = useState<{
    item: QueueItem;
    mode: 'approve' | 'override';
  } | null>(null);
  const [viewingReasoningId, setViewingReasoningId] = useState<string | null>(null);
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } =
    useQuery<{ success: boolean; queue: QueueItem[]; count: number }>({
      queryKey: ['/api/trinity/agent-dashboard/queue'],
      queryFn: () => fetchJson('/api/trinity/agent-dashboard/queue'),
      refetchInterval: 30_000,
    });

  const { data: escalationsData, isLoading: escalationsLoading } =
    useQuery<{ success: boolean; escalations: Escalation[]; count: number }>({
      queryKey: ['/api/trinity/agent-dashboard/escalations'],
      queryFn: () => fetchJson('/api/trinity/agent-dashboard/escalations'),
      refetchInterval: 60_000,
    });

  const { data: feedData, isLoading: feedLoading } =
    useQuery<{ success: boolean; feed: ActivityItem[] }>({
      queryKey: ['/api/trinity/agent-dashboard/activity-feed'],
      queryFn: () => fetchJson('/api/trinity/agent-dashboard/activity-feed'),
      refetchInterval: 30_000,
    });

  const filteredQueue = (queueData?.queue ?? []).filter(
    item =>
      !workspaceFilter ||
      item.workspace_name?.toLowerCase().includes(workspaceFilter.toLowerCase()) ||
      item.workspace_id?.toLowerCase().includes(workspaceFilter.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* ── Dialogs ── */}
      {selectedAction && (
        <ActionDialog
          item={selectedAction.item}
          mode={selectedAction.mode}
          onClose={() => setSelectedAction(null)}
        />
      )}
      {viewingReasoningId && (
        <ReasoningDrawer
          actionId={viewingReasoningId}
          onClose={() => setViewingReasoningId(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="border-b border-white/10 bg-[#0d1426]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-7 h-7 text-[#4FC3F7]" />
            <div>
              <h1 className="text-xl font-bold tracking-tight font-display">Trinity Agent Dashboard</h1>
              <p className="text-xs text-white/50">
                Approval queue · Override controls · Escalation triage
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetchQueue();
                toast({ title: 'Queue refreshed' });
              }}
              className="text-white/60 hover:text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="bg-[#0d1426] border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-white/50">Pending Approvals</span>
              </div>
              {queueLoading ? (
                <Skeleton className="h-8 w-12 bg-card/10" />
              ) : (
                <div className="text-3xl font-bold text-yellow-400">
                  {queueData?.count ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1426] border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-white/50">Escalations</span>
              </div>
              {escalationsLoading ? (
                <Skeleton className="h-8 w-12 bg-card/10" />
              ) : (
                <div className="text-3xl font-bold text-red-400">
                  {escalationsData?.count ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1426] border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-xs text-white/50">Recent Actions</span>
              </div>
              {feedLoading ? (
                <Skeleton className="h-8 w-12 bg-card/10" />
              ) : (
                <div className="text-3xl font-bold text-green-400">
                  {feedData?.feed?.length ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="queue">
          <TabsList className="bg-[#0d1426] border border-white/10">
            <TabsTrigger value="queue" className="data-[state=active]:bg-[#1a2540]">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Queue
              {(queueData?.count ?? 0) > 0 && (
                <Badge className="ml-2 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs px-1.5">
                  {queueData?.count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="escalations" className="data-[state=active]:bg-[#1a2540]">
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              Escalations
            </TabsTrigger>
            <TabsTrigger value="feed" className="data-[state=active]:bg-[#1a2540]">
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              Activity Feed
            </TabsTrigger>
          </TabsList>

          {/* ── Approval Queue ── */}
          <TabsContent value="queue">
            <Card className="bg-[#0d1426] border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Pending Approvals</CardTitle>
                    <CardDescription>
                      Trinity actions awaiting your review
                    </CardDescription>
                  </div>
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    <Input
                      value={workspaceFilter}
                      onChange={e => setWorkspaceFilter(e.target.value)}
                      placeholder="Filter by workspace…"
                      className="pl-8 bg-card/5 border-white/20 text-white text-xs placeholder:text-white/30 h-8"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {queueLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full bg-card/10" />
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="h-[480px]">
                    <div className="space-y-2">
                      {filteredQueue.map(item => (
                        <div
                          key={item.id}
                          className="p-3 rounded-lg bg-card/5 border border-white/10 hover:border-white/20 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <Activity className="w-3.5 h-3.5 text-[#4FC3F7] shrink-0" />
                                <span className="text-sm font-medium truncate">
                                  {item.action_name || item.action_type}
                                </span>
                                {confidenceBadge(
                                  item.confidence_score !== undefined
                                    ? item.confidence_score
                                    : undefined,
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-white/40 flex-wrap">
                                {item.workspace_name && (
                                  <span className="bg-card/10 rounded px-1.5 py-0.5">
                                    {item.workspace_name}
                                  </span>
                                )}
                                <span>{timeSince(item.created_at)}</span>
                                {item.expires_at && (
                                  <span className="text-yellow-400">
                                    Expires {timeSince(item.expires_at)}
                                  </span>
                                )}
                              </div>
                              {item.reason && (
                                <p className="text-xs text-white/50 mt-1 line-clamp-2">
                                  {item.reason}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setViewingReasoningId(item.id)}
                                className="h-7 px-2 text-[#4FC3F7] hover:bg-[#4FC3F7]/10"
                                title="View reasoning"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  setSelectedAction({ item, mode: 'approve' })
                                }
                                className="h-7 px-2 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30"
                              >
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setSelectedAction({ item, mode: 'override' })
                                }
                                className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Deny
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {!filteredQueue.length && (
                        <div className="text-center text-white/40 py-16">
                          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400/30" />
                          <div>No pending approvals</div>
                          <div className="text-xs mt-1">Trinity is operating autonomously</div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Escalations ── */}
          <TabsContent value="escalations">
            <Card className="bg-[#0d1426] border-white/10">
              <CardHeader>
                <CardTitle className="text-base">SLA Escalations</CardTitle>
                <CardDescription>
                  Tickets at or past SLA deadline — sorted by urgency
                </CardDescription>
              </CardHeader>
              <CardContent>
                {escalationsLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full bg-card/10" />
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="h-[480px]">
                    <div className="space-y-2">
                      {(escalationsData?.escalations ?? []).map(e => (
                        <div
                          key={e.ticket_id}
                          className={`p-3 rounded-lg border transition-all ${
                            e.sla_breached
                              ? 'bg-red-500/10 border-red-500/30'
                              : 'bg-yellow-500/10 border-yellow-500/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                {e.sla_breached ? (
                                  <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                                )}
                                <span className="text-sm font-medium">{e.subject}</span>
                                {e.priority && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs border-white/20 text-white/60"
                                  >
                                    {e.priority}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-white/40">
                                {e.workspace_name && (
                                  <span className="bg-card/10 rounded px-1.5 py-0.5">
                                    {e.workspace_name}
                                  </span>
                                )}
                                <span>{e.status}</span>
                                {e.sla_deadline && (
                                  <span
                                    className={
                                      e.sla_breached ? 'text-red-400' : 'text-yellow-400'
                                    }
                                  >
                                    SLA:{' '}
                                    {new Date(e.sla_deadline).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge
                              className={
                                e.sla_breached
                                  ? 'bg-red-500/20 text-red-400 border-red-500/30 shrink-0'
                                  : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 shrink-0'
                              }
                            >
                              {e.sla_breached ? 'BREACHED' : 'AT RISK'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {!escalationsData?.escalations?.length && (
                        <div className="text-center text-white/40 py-16">
                          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400/30" />
                          <div>No SLA escalations</div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Activity Feed ── */}
          <TabsContent value="feed">
            <Card className="bg-[#0d1426] border-white/10">
              <CardHeader>
                <CardTitle className="text-base">Cross-Workspace Activity</CardTitle>
                <CardDescription>
                  Most recent Trinity actions across all tenants
                </CardDescription>
              </CardHeader>
              <CardContent>
                {feedLoading ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full bg-card/10" />
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="h-[480px]">
                    <div className="space-y-1.5">
                      {(feedData?.feed ?? []).map(item => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2.5 rounded bg-card/5 hover:bg-card/10 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Activity className="w-3 h-3 text-[#4FC3F7] shrink-0" />
                              <span className="text-sm truncate">
                                {item.action_name || item.action_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                              {item.workspace_name && (
                                <span>{item.workspace_name}</span>
                              )}
                              <span>·</span>
                              <span>{timeSince(item.created_at)}</span>
                              {item.duration_ms && (
                                <>
                                  <span>·</span>
                                  <span>{item.duration_ms}ms</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            {item.status === 'completed' || item.status === 'success' ? (
                              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                            ) : item.status === 'failed' ? (
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                            ) : (
                              <Activity className="w-3.5 h-3.5 text-yellow-400" />
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewingReasoningId(item.id)}
                              className="h-6 px-1.5 opacity-0 group-hover:opacity-100 text-white/40 hover:text-[#4FC3F7] transition-opacity"
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {!feedData?.feed?.length && (
                        <div className="text-center text-white/40 py-16">
                          No recent activity
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
