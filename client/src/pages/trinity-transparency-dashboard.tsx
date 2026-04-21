/**
 * Trinity Transparency Dashboard — Phase 16
 * ==========================================
 * Tenant owner view of everything Trinity has done:
 *   - Autonomous action count + success rate (today)
 *   - API cost breakdown (this month, per skill, per model)
 *   - Decision log with reasoning
 *   - Pending escalations
 *   - Platform integration status
 *
 * Role gate: org_owner / co_owner / manager or higher.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

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
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Brain,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronRight,
  RefreshCw,
  Layers,
  Shield,
  Zap,
  Info,
} from 'lucide-react';
import { TrinityArrowMark } from '@/components/trinity-logo';

// ── Types ──────────────────────────────────────────────────────────────────

interface OverviewData {
  actionsToday: {
    total: number;
    succeeded: number;
    failed: number;
    successRate: number;
  };
  pendingEscalations: number;
  recentDecisions: Decision[];
  costThisMonth: {
    totalUsd: number;
    totalExecutions: number;
    topSkillsBySpend: SkillCost[];
  };
}

interface Decision {
  id: string;
  domain?: string;
  triggerEvent?: string;
  primaryAction?: string;
  reasoning?: string;
  createdAt?: string;
  verifierVerdict?: string;
}

interface SkillCost {
  skillKey: string;
  executionCount: number;
  totalCostUsd: number;
  avgCostUsd: number;
}

interface ModelCost {
  modelId: string;
  provider: string;
  executionCount: number;
  totalCostUsd: number;
}

interface CostBreakdown {
  month: string;
  costBreakdown: {
    totalExecutions: number;
    totalCostUsd: number | string;
    bySkill: SkillCost[];
    byModel: ModelCost[];
  };
}

interface ActionLog {
  id: string;
  action_type: string;
  action_name?: string;
  status: string;
  duration_ms?: number;
  created_at: string;
}

// ── Helper ─────────────────────────────────────────────────────────────────

function formatUsd(val: number | string | undefined): string {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return `$${n.toFixed(4)}`;
}

function statusBadge(status: string) {
  if (status === 'completed' || status === 'success') {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Success</Badge>;
  }
  if (status === 'failed' || status === 'error') {
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
  }
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{status}</Badge>;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TrinityTransparencyDashboard() {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );
  const [actionsPage, setActionsPage] = useState(0);

  const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview } =
    useQuery<{ success: boolean; overview: OverviewData }>({
      queryKey: ['/api/trinity/transparency/overview'],
      queryFn: () => fetchJson('/api/trinity/transparency/overview'),
      refetchInterval: 60_000,
    });

  const { data: costsData, isLoading: costsLoading } =
    useQuery<CostBreakdown>({
      queryKey: ['/api/trinity/transparency/cost-breakdown', selectedMonth],
      queryFn: () =>
        fetchJson(`/api/trinity/transparency/cost-breakdown?month=${selectedMonth}`),
    });

  const { data: actionsData, isLoading: actionsLoading } =
    useQuery<{ success: boolean; actions: ActionLog[]; total: number }>({
      queryKey: ['/api/trinity/transparency/actions', actionsPage],
      queryFn: () =>
        fetchJson(
          `/api/trinity/transparency/actions?limit=20&offset=${actionsPage * 20}`,
        ),
    });

  const { data: decisionsData, isLoading: decisionsLoading } =
    useQuery<{ success: boolean; decisions: Decision[]; total: number }>({
      queryKey: ['/api/trinity/transparency/decisions'],
      queryFn: () => fetchJson('/api/trinity/transparency/decisions?limit=20'),
    });

  // Phase 26 — Trinity voice/SMS/AI + subscription-gate activity
  const { data: trinityActivityData, isLoading: trinityActivityLoading } =
    useQuery<{
      success: boolean;
      days: number;
      summary: {
        total: number;
        byAction: Record<string, number>;
        byChannel: Record<string, number>;
      };
      rows: Array<{
        id: string;
        action: string;
        entity_type: string;
        entity_id: string | null;
        actor_type: string;
        metadata: Record<string, any> | null;
        created_at: string;
      }>;
    }>({
      queryKey: ['/api/trinity/transparency/trinity-activity'],
      queryFn: () => fetchJson('/api/trinity/transparency/trinity-activity?days=7&limit=100'),
    });

  const overview = overviewData?.overview;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* ── Header ── */}
      <div className="border-b border-white/10 bg-[#0d1426]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrinityArrowMark className="w-8 h-8 text-[#4FC3F7]" />
            <div>
              <h1 className="text-xl font-bold tracking-tight font-display">Trinity Transparency</h1>
              <p className="text-xs text-white/50">All autonomous actions, decisions & costs</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchOverview()}
            className="text-white/60 hover:text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Actions today */}
          <Card className="bg-[#0d1426] border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-[#4FC3F7]" />
                <span className="text-xs text-white/50">Actions Today</span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-8 w-16 bg-card/10" />
              ) : (
                <>
                  <div className="text-3xl font-bold">
                    {overview?.actionsToday.total ?? 0}
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    {overview?.actionsToday.successRate ?? 100}% success
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Success rate */}
          <Card className="bg-[#0d1426] border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-xs text-white/50">Succeeded</span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-8 w-16 bg-card/10" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-green-400">
                    {overview?.actionsToday.succeeded ?? 0}
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    {overview?.actionsToday.failed ?? 0} failed
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Escalations */}
          <Card className="bg-[#0d1426] border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-white/50">Pending Escalations</span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-8 w-16 bg-card/10" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-yellow-400">
                    {overview?.pendingEscalations ?? 0}
                  </div>
                  <div className="text-xs text-white/50 mt-1">awaiting action</div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Cost this month */}
          <Card className="bg-[#0d1426] border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-white/50">Cost This Month</span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-8 w-24 bg-card/10" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-purple-400">
                    {formatUsd(overview?.costThisMonth.totalUsd)}
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    {overview?.costThisMonth.totalExecutions ?? 0} executions
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Main Tabs ── */}
        <Tabs defaultValue="actions">
          <TabsList className="bg-[#0d1426] border border-white/10">
            <TabsTrigger value="actions" className="data-[state=active]:bg-[#1a2540]">
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Actions
            </TabsTrigger>
            <TabsTrigger value="decisions" className="data-[state=active]:bg-[#1a2540]">
              <Brain className="w-3.5 h-3.5 mr-1.5" /> Decisions
            </TabsTrigger>
            <TabsTrigger value="costs" className="data-[state=active]:bg-[#1a2540]">
              <DollarSign className="w-3.5 h-3.5 mr-1.5" /> Costs
            </TabsTrigger>
            <TabsTrigger value="registry" className="data-[state=active]:bg-[#1a2540]">
              <Layers className="w-3.5 h-3.5 mr-1.5" /> Services
            </TabsTrigger>
            <TabsTrigger value="gate" className="data-[state=active]:bg-[#1a2540]">
              <Shield className="w-3.5 h-3.5 mr-1.5" /> Gate Activity
            </TabsTrigger>
          </TabsList>

          {/* ── Actions Tab ── */}
          <TabsContent value="actions">
            <Card className="bg-[#0d1426] border-white/10">
              <CardHeader>
                <CardTitle className="text-base">Autonomous Actions</CardTitle>
                <CardDescription>Every action Trinity executed on your behalf</CardDescription>
              </CardHeader>
              <CardContent>
                {actionsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full bg-card/10" />
                    ))}
                  </div>
                ) : (
                  <>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {(actionsData?.actions ?? []).map(action => (
                          <div
                            key={action.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-card/5 hover:bg-card/10 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Zap className="w-3.5 h-3.5 text-[#4FC3F7] shrink-0" />
                                <span className="text-sm font-medium truncate">
                                  {action.action_name || action.action_type}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-white/40">
                                <span>{action.action_type}</span>
                                {action.duration_ms && (
                                  <span>{action.duration_ms}ms</span>
                                )}
                                <span>
                                  {new Date(action.created_at).toLocaleString()}
                                </span>
                              </div>
                            </div>
                            <div className="ml-3 shrink-0">
                              {statusBadge(action.status)}
                            </div>
                          </div>
                        ))}
                        {!actionsData?.actions?.length && (
                          <div className="text-center text-white/40 py-12">
                            No actions recorded yet
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    {/* Pagination */}
                    {(actionsData?.total ?? 0) > 20 && (
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionsPage === 0}
                          onClick={() => setActionsPage(p => Math.max(0, p - 1))}
                          className="text-white/60"
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-white/40">
                          Page {actionsPage + 1} of{' '}
                          {Math.ceil((actionsData?.total ?? 0) / 20)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={
                            (actionsPage + 1) * 20 >= (actionsData?.total ?? 0)
                          }
                          onClick={() => setActionsPage(p => p + 1)}
                          className="text-white/60"
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Decisions Tab ── */}
          <TabsContent value="decisions">
            <Card className="bg-[#0d1426] border-white/10">
              <CardHeader>
                <CardTitle className="text-base">Decision Log</CardTitle>
                <CardDescription>
                  Every choice Trinity made — what it decided, why, and what the verifier said
                </CardDescription>
              </CardHeader>
              <CardContent>
                {decisionsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full bg-card/10" />
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {(decisionsData?.decisions ?? []).map(d => (
                        <div
                          key={d.id}
                          className="p-3 rounded-lg bg-card/5 border border-white/10"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="text-sm font-medium">
                                {d.primaryAction || d.triggerEvent || 'Decision'}
                              </div>
                              {d.domain && (
                                <Badge
                                  variant="outline"
                                  className="text-xs mt-1 border-white/20 text-white/60"
                                >
                                  {d.domain}
                                </Badge>
                              )}
                            </div>
                            {d.verifierVerdict && (
                              <Badge
                                className={
                                  d.verifierVerdict === 'approved'
                                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                    : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                }
                              >
                                {d.verifierVerdict}
                              </Badge>
                            )}
                          </div>
                          {d.reasoning && (
                            <p className="text-xs text-white/50 leading-relaxed line-clamp-3">
                              {d.reasoning}
                            </p>
                          )}
                          {d.createdAt && (
                            <div className="text-xs text-white/30 mt-2">
                              {new Date(d.createdAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                      {!decisionsData?.decisions?.length && (
                        <div className="text-center text-white/40 py-12">
                          No decisions logged yet
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Costs Tab ── */}
          <TabsContent value="costs">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/60">Month:</span>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-36 bg-[#0d1426] border-white/20 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1426] border-white/20">
                    {[-2, -1, 0].map(offset => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + offset);
                      const val = d.toISOString().slice(0, 7);
                      return (
                        <SelectItem key={val} value={val} className="text-white">
                          {val}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* By Skill */}
                <Card className="bg-[#0d1426] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-sm">Cost by Skill</CardTitle>
                    <CardDescription>Total: {formatUsd(costsData?.costBreakdown?.totalCostUsd)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {costsLoading ? (
                      <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full bg-card/10" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(costsData?.costBreakdown?.bySkill ?? []).map(s => (
                          <div
                            key={s.skillKey}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-white/70 truncate">{s.skillKey}</span>
                            <div className="flex items-center gap-3 text-right shrink-0">
                              <span className="text-white/40 text-xs">
                                ×{s.executionCount}
                              </span>
                              <span className="text-purple-300 font-mono">
                                {formatUsd(s.totalCostUsd)}
                              </span>
                            </div>
                          </div>
                        ))}
                        {!costsData?.costBreakdown?.bySkill?.length && (
                          <div className="text-center text-white/40 py-6">
                            No cost data for {selectedMonth}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* By Model */}
                <Card className="bg-[#0d1426] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-sm">Cost by Model</CardTitle>
                    <CardDescription>
                      {costsData?.costBreakdown?.totalExecutions ?? 0} total executions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {costsLoading ? (
                      <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full bg-card/10" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(costsData?.costBreakdown?.byModel ?? []).map(m => (
                          <div
                            key={m.modelId}
                            className="flex items-center justify-between text-sm"
                          >
                            <div>
                              <div className="text-white/70">{m.modelId}</div>
                              <div className="text-xs text-white/40">{m.provider}</div>
                            </div>
                            <div className="flex items-center gap-3 text-right shrink-0">
                              <span className="text-white/40 text-xs">
                                ×{m.executionCount}
                              </span>
                              <span className="text-purple-300 font-mono">
                                {formatUsd(m.totalCostUsd)}
                              </span>
                            </div>
                          </div>
                        ))}
                        {!costsData?.costBreakdown?.byModel?.length && (
                          <div className="text-center text-white/40 py-6">
                            No model data for {selectedMonth}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── Services Registry Tab ── */}
          <TabsContent value="registry">
            <ServiceRegistryPanel />
          </TabsContent>

          {/* ── Gate Activity Tab (Phase 26) ── */}
          <TabsContent value="gate">
            <Card className="bg-[#0d1426] border-white/10">
              <CardHeader>
                <CardTitle className="text-base">Trinity Gate Activity</CardTitle>
                <CardDescription>
                  AI resolutions and subscription-gate blocks across voice, SMS, email, and proactive automation (last 7 days)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trinityActivityLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full bg-card/10" />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Summary counters */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="rounded-lg bg-card/5 p-3">
                        <div className="text-xs text-white/40">AI Resolved</div>
                        <div className="text-2xl font-bold text-[#4FC3F7]">
                          {trinityActivityData?.summary.byAction?.['trinity.voice_ai_resolved'] ?? 0}
                        </div>
                      </div>
                      <div className="rounded-lg bg-card/5 p-3">
                        <div className="text-xs text-white/40">Gate Blocks</div>
                        <div className="text-2xl font-bold text-amber-400">
                          {trinityActivityData?.summary.byAction?.['trinity.subscription_gate_blocked'] ?? 0}
                        </div>
                      </div>
                      <div className="rounded-lg bg-card/5 p-3">
                        <div className="text-xs text-white/40">Voice Events</div>
                        <div className="text-2xl font-bold text-white">
                          {trinityActivityData?.summary.byChannel?.voice ?? 0}
                        </div>
                      </div>
                      <div className="rounded-lg bg-card/5 p-3">
                        <div className="text-xs text-white/40">SMS Events</div>
                        <div className="text-2xl font-bold text-white">
                          {trinityActivityData?.summary.byChannel?.sms ?? 0}
                        </div>
                      </div>
                    </div>

                    {/* Row list */}
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {(trinityActivityData?.rows ?? []).map(row => {
                          const isBlock = row.action === 'trinity.subscription_gate_blocked';
                          const meta = row.metadata || {};
                          return (
                            <div
                              key={row.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-card/5 hover:bg-card/10 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  {isBlock ? (
                                    <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  ) : (
                                    <Zap className="w-3.5 h-3.5 text-[#4FC3F7] shrink-0" />
                                  )}
                                  <span className="text-sm font-medium truncate">
                                    {row.action.replace('trinity.', '').replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-white/40">
                                  {meta.channel && <span>{String(meta.channel)}</span>}
                                  {meta.extension && <span>{String(meta.extension)}</span>}
                                  {meta.model && <span>{String(meta.model)}</span>}
                                  {meta.subscriptionStatus && <span>status: {String(meta.subscriptionStatus)}</span>}
                                  {meta.reason && <span>reason: {String(meta.reason)}</span>}
                                  <span>{new Date(row.created_at).toLocaleString()}</span>
                                </div>
                              </div>
                              <div className="ml-3 shrink-0">
                                <Badge
                                  variant="outline"
                                  className={
                                    isBlock
                                      ? 'border-amber-400/40 text-amber-300 bg-amber-400/10'
                                      : 'border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/10'
                                  }
                                >
                                  {isBlock ? 'Blocked' : 'Resolved'}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                        {!trinityActivityData?.rows?.length && (
                          <div className="text-center text-white/40 py-12">
                            No Trinity voice / SMS / AI activity in the last 7 days
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Service Registry Sub-panel ─────────────────────────────────────────────

function ServiceRegistryPanel() {
  const { data, isLoading } = useQuery<{
    success: boolean;
    totalServices: number;
    integrationSummaryByPhase: Record<string, { total: number; verified: number; partial: number; unmapped: number }>;
    serviceCountByDomain: Record<string, number>;
  }>({
    queryKey: ['/api/trinity/transparency/service-registry'],
    queryFn: () => fetchJson('/api/trinity/transparency/service-registry'),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-card/10" />
        ))}
      </div>
    );
  }

  const phaseLabels: Record<string, string> = {
    phase_1_core_db: 'Core DB',
    phase_2_auth: 'Auth',
    phase_3_employees: 'Employees',
    phase_4_scheduling: 'Scheduling',
    phase_5_payroll: 'Payroll',
    phase_6_email: 'Email',
    phase_7_client_portal: 'Client Portal',
    phase_8_pl: 'P&L',
    phase_9_support: 'Support',
    phase_10_invoicing: 'Invoicing',
    phase_11_officer_dashboard: 'Officer Dashboard',
    phase_12_workspace: 'Workspace',
    phase_13_error_handling: 'Error Handling',
    phase_14_performance: 'Performance',
    phase_15_billing: 'Billing',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-[#4FC3F7]" />
        <span className="text-sm text-white/60">
          {data?.totalServices ?? 0} registered Trinity services mapped across 15 platform phases
        </span>
      </div>

      {/* Domain counts */}
      <Card className="bg-[#0d1426] border-white/10">
        <CardHeader>
          <CardTitle className="text-sm">Services by Domain</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(data?.serviceCountByDomain ?? {}).map(([domain, count]) => (
              <div
                key={domain}
                className="p-2 rounded bg-card/5 text-center"
              >
                <div className="text-lg font-bold text-[#4FC3F7]">{count}</div>
                <div className="text-xs text-white/50 truncate capitalize">
                  {domain.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Phase integration status */}
      <Card className="bg-[#0d1426] border-white/10">
        <CardHeader>
          <CardTitle className="text-sm">Platform Integration Status</CardTitle>
          <CardDescription>
            Green = verified · Yellow = partial · Red = unmapped
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(data?.integrationSummaryByPhase ?? {}).map(([phase, stats]) => {
              const pct = stats.total
                ? Math.round((stats.verified / stats.total) * 100)
                : 0;
              return (
                <div key={phase} className="flex items-center gap-3">
                  <div className="w-36 shrink-0 text-xs text-white/60">
                    {phaseLabels[phase] ?? phase}
                  </div>
                  <div className="flex-1 bg-card/10 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-white/40 shrink-0 w-20 text-right">
                    {stats.verified}/{stats.total} verified
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
