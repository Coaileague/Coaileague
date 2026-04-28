import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from "recharts";
import {Eye, Brain, Zap, Clock, Activity, Target, Users,
  TrendingUp, Eye, AlertCircle, Lightbulb
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface UsageSummary {
  period: { days: number };
  summary: {
    totalCalls: number;
    totalTokens: number;
    totalCredits: number;
    avgResponseMs: number;
  };
  byCallType: Array<{
    callType: string;
    calls: number;
    tokens: number;
    credits: number;
    avgMs: number;
  }>;
  dailyTrend: Array<{
    day: string;
    calls: number;
    tokens: number;
    credits: number;
  }>;
  topUsers: Array<{
    userId: string;
    userRole: string;
    calls: number;
    credits: number;
  }>;
  peripheralAwareness: Array<{
    category: string;
    timesSurfaced: number;
  }>;
  hypothesisSessions: {
    total: number;
    converged: number;
    inconclusive: number;
  };
}

const CALL_TYPE_LABELS: Record<string, string> = {
  trinity_chat: "Trinity Chat",
  uncertainty_assessment: "Uncertainty Check",
  hypothesis_run: "Hypothesis Engine",
  planning: "Extended Thinking",
  health_check: "Health Check",
  ai_general: "General AI",
};

const GOLD = "#D4AF37";
const NAVY = "#1B2A4A";
const TEAL = "#2DD4BF";

export default function AiUsageDashboard() {
  const { user } = useAuth();
  const { workspaceId } = useWorkspaceAccess();
  const [days, setDays] = useState("30");

  const { data, isLoading, error } = useQuery<UsageSummary>({
    queryKey: ["/api/trinity/ai-usage/summary", workspaceId, days],
    queryFn: async () => {
      const res = await fetch(
        `/api/trinity/ai-usage/summary?workspaceId=${workspaceId}&days=${days}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load AI usage data");
      const body = await res.json();
      return body;
    },
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });

  const formatMs = (ms: number) =>
    ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  const formatCallType = (ct: string) => CALL_TYPE_LABELS[ct] || ct.replace(/_/g, " ");

  const formattedTrend = (data?.dailyTrend || []).map(d => ({
    ...d,
    day: format(new Date(d.day), "MMM d"),
  }));

  return (
    <WorkspaceLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">AI Usage Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Trinity cognitive activity, token consumption, and system health
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-36" data-testid="select-period">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary stat cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-md" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Could not load AI usage data. This may be the first time this dashboard is opened.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="stat-total-calls">
              <CardHeader className="flex flex-row items-center justify-between gap-1 pb-1 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">AI Calls</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(data?.summary.totalCalls ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Last {days} days</p>
              </CardContent>
            </Card>

            <Card data-testid="stat-total-tokens">
              <CardHeader className="flex flex-row items-center justify-between gap-1 pb-1 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tokens Used</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((data?.summary.totalTokens ?? 0) / 1000).toFixed(1)}k
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total input + output</p>
              </CardContent>
            </Card>

            <Card data-testid="stat-tokens-used">
              <CardHeader className="flex flex-row items-center justify-between gap-1 pb-1 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tokens Used</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(data?.summary.totalCredits ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">This month</p>
              </CardContent>
            </Card>

            <Card data-testid="stat-avg-response">
              <CardHeader className="flex flex-row items-center justify-between gap-1 pb-1 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Response</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatMs(data?.summary.avgResponseMs ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Per AI call</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="trend">
          <TabsList>
            <TabsTrigger value="trend" data-testid="tab-trend">
              <TrendingUp className="h-4 w-4 mr-2" />
              Usage Trend
            </TabsTrigger>
            <TabsTrigger value="breakdown" data-testid="tab-breakdown">
              <Activity className="h-4 w-4 mr-2" />
              By Call Type
            </TabsTrigger>
            <TabsTrigger value="cognitive" data-testid="tab-cognitive">
              <Lightbulb className="h-4 w-4 mr-2" />
              Cognitive Engines
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Top Users
            </TabsTrigger>
          </TabsList>

          {/* Usage Trend Tab */}
          <TabsContent value="trend" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily AI Activity</CardTitle>
                <CardDescription>Calls and tokens per day over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (data?.dailyTrend?.length ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    No activity recorded in this period yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={formattedTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="calls" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="tokens" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="calls"
                        type="monotone"
                        dataKey="calls"
                        stroke={GOLD}
                        strokeWidth={2}
                        dot={false}
                        name="Calls"
                      />
                      <Line
                        yAxisId="tokens"
                        type="monotone"
                        dataKey="tokens"
                        stroke={TEAL}
                        strokeWidth={2}
                        dot={false}
                        name="Tokens"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Call Type Tab */}
          <TabsContent value="breakdown" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Breakdown by Call Type</CardTitle>
                <CardDescription>Which Trinity engines are being used most</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (data?.byCallType?.length ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    No call type data available yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={data?.byCallType ?? []} margin={{ left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="callType"
                          tickFormatter={formatCallType}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v, name) => [v, name === "calls" ? "Calls" : "Credits"]} />
                        <Bar dataKey="calls" name="Calls" fill={GOLD} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="credits" name="Credits" fill={TEAL} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="space-y-2" data-testid="calltype-table">
                      {(data?.byCallType ?? []).map(ct => (
                        <div
                          key={ct.callType}
                          className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-muted/40"
                          data-testid={`calltype-row-${ct.callType}`}
                        >
                          <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{formatCallType(ct.callType)}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{ct.calls.toLocaleString()} calls</span>
                            <span>{(ct.tokens / 1000).toFixed(1)}k tokens</span>
                            <Badge variant="secondary">{formatMs(ct.avgMs)} avg</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cognitive Engines Tab */}
          <TabsContent value="cognitive" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Peripheral Awareness */}
              <Card data-testid="card-peripheral">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Peripheral Awareness
                  </CardTitle>
                  <CardDescription>Proactive insights surfaced to managers (deduplicated, max 2/session)</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (data?.peripheralAwareness?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No peripheral items surfaced yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {(data?.peripheralAwareness ?? []).map(p => (
                        <div
                          key={p.category}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/40"
                          data-testid={`peripheral-row-${p.category}`}
                        >
                          <span className="text-sm capitalize">{p.category.replace(/_/g, " ")}</span>
                          <Badge variant="outline">{p.timesSurfaced}x surfaced</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Hypothesis Engine */}
              <Card data-testid="card-hypothesis">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Hypothesis Engine
                  </CardTitle>
                  <CardDescription>7-step Bayesian diagnostic loops triggered on "why" questions</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-3 rounded-md bg-muted/40">
                          <div className="text-xl font-bold" data-testid="hyp-total">
                            {data?.hypothesisSessions.total ?? 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Total</div>
                        </div>
                        <div className="text-center p-3 rounded-md bg-muted/40">
                          <div className="text-xl font-bold text-green-600" data-testid="hyp-converged">
                            {data?.hypothesisSessions.converged ?? 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Converged</div>
                        </div>
                        <div className="text-center p-3 rounded-md bg-muted/40">
                          <div className="text-xl font-bold text-yellow-600" data-testid="hyp-inconclusive">
                            {data?.hypothesisSessions.inconclusive ?? 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Inconclusive</div>
                        </div>
                      </div>
                      {(data?.hypothesisSessions.total ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Convergence rate: {Math.round(
                            ((data?.hypothesisSessions.converged ?? 0) / (data?.hypothesisSessions.total ?? 1)) * 100
                          )}% — hypothesis sessions that resolved to a single root cause with 80%+ confidence.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Top Users Tab */}
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top AI Users</CardTitle>
                <CardDescription>Users consuming the most AI credits in this workspace</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (data?.topUsers?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No user-attributed usage recorded yet.</p>
                ) : (
                  <div className="space-y-2" data-testid="top-users-table">
                    {(data?.topUsers ?? []).map((u, i) => (
                      <div
                        key={u.userId}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-muted/40"
                        data-testid={`user-row-${i}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground w-5">{i + 1}.</span>
                          <span className="text-sm font-mono">{u.userId.substring(0, 12)}…</span>
                          <Badge variant="outline" className="text-xs">{u.userRole || "user"}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{u.calls.toLocaleString()} calls</span>
                          <Badge variant="secondary">{u.credits} credits</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </WorkspaceLayout>
  );
}
