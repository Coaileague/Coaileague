import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiError";
import { TrinityMemoryResponse, TrinityKnowledgeResponse, TrinityDiagnosticsResponse } from "@shared/schemas/responses/trinity";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, Activity, Database, Cpu, Clock, CheckCircle,
  AlertTriangle, Zap, Network, RefreshCw, Search
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  id: "trinity-memory",
  title: "Trinity Memory & Diagnostics",
  subtitle: "AI memory optimization and knowledge management",
  category: "operations",
};

export default function TrinityMemoryPage() {
  const { toast } = useToast();
  const [diagnosticResults, setDiagnosticResults] = useState<any>(null);

  const memoryQuery = useQuery({
    queryKey: ["/api/trinity/memory-health"],
    queryFn: () => apiFetch('/api/trinity/memory-health', TrinityMemoryResponse),
  });

  const knowledgeQuery = useQuery({
    queryKey: ["/api/ai-brain/knowledge/diagnostics"],
    queryFn: () => apiFetch('/api/ai-brain/knowledge/diagnostics', TrinityKnowledgeResponse),
  });

  const chatDiagQuery = useQuery({
    queryKey: ["/api/chatserver/diagnostics"],
    queryFn: () => apiFetch('/api/chatserver/diagnostics', TrinityDiagnosticsResponse),
  });

  const runDiagnosticMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-brain/diagnostic/run-fast");
      return res.json();
    },
    onSuccess: (data) => {
      setDiagnosticResults(data);
      toast({ title: "Diagnostic complete", description: "Fast diagnostic scan finished successfully" });
    },
    onError: () => {
      toast({ title: "Diagnostic failed", description: "Could not run diagnostic scan", variant: "destructive" });
    },
  });

  const health = memoryQuery.data?.health;
  const knowledge = knowledgeQuery.data;
  const isLoading = memoryQuery.isLoading;

  const summaryCards = [
    {
      label: "Memory Usage",
      // @ts-expect-error — TS migration: fix in refactoring sprint
      value: health?.memoryUsagePercent ? `${Math.round(health.memoryUsagePercent)}%` : "--",
      icon: Cpu,
      color: "text-blue-500",
    },
    {
      label: "Knowledge Entities",
      value: knowledge?.totalEntities?.toLocaleString() || "0",
      icon: Database,
      color: "text-purple-500",
    },
    {
      label: "Confidence",
      // @ts-expect-error — TS migration: fix in refactoring sprint
      value: health?.avgConfidence ? `${Math.round(health.avgConfidence * 100)}%` : "--",
      icon: Activity,
      color: "text-green-500",
    },
    {
      label: "Last Optimization",
      // @ts-expect-error — TS migration: fix in refactoring sprint
      value: health?.lastOptimized
        // @ts-expect-error — TS migration: fix in refactoring sprint
        ? new Date(health.lastOptimized).toLocaleDateString()
        : "Never",
      icon: Clock,
      color: "text-orange-500",
    },
  ];

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map(c => (
              <Card key={c.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <c.icon className={`h-6 w-6 sm:h-8 sm:w-8 shrink-0 ${c.color}`} />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold truncate" data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, '-')}`}>{c.value}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Tabs defaultValue="memory" data-testid="tabs-trinity-memory">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="memory" data-testid="tab-memory-health">
              <Cpu className="h-4 w-4 mr-1" />Memory
            </TabsTrigger>
            <TabsTrigger value="knowledge" data-testid="tab-knowledge-graph">
              <Network className="h-4 w-4 mr-1" />Knowledge
            </TabsTrigger>
            <TabsTrigger value="diagnostics" data-testid="tab-diagnostics">
              <Search className="h-4 w-4 mr-1" />Diagnostics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="memory" className="mt-4 space-y-4">
            {memoryQuery.isLoading ? (
              <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            ) : !health ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Cpu className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Memory Data Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    Memory health data will appear here once Trinity has been active and processing requests.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      Memory Utilization
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {[
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Heap Usage", value: health.heapUsedPercent, id: "heap-usage" },
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Cache Utilization", value: health.cacheUtilization, id: "cache-usage" },
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Context Window", value: health.contextWindowUsage, id: "context-window" },
                      ].map(metric => (
                        <div key={metric.id} className="flex items-center gap-3" data-testid={`metric-${metric.id}`}>
                          <span className="text-sm shrink-0 truncate max-w-[6rem] sm:max-w-[10rem]">{metric.label}</span>
                          <Progress value={metric.value || 0} className="flex-1" />
                          <span className="text-sm font-medium w-12 text-right">{Math.round(metric.value || 0)}%</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Performance Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Active Sessions", value: health.activeSessions || 0 },
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Cached Entries", value: health.cachedEntries || 0 },
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Avg Latency", value: `${health.avgLatencyMs || 0}ms` },
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Uptime", value: health.uptimeHours ? `${health.uptimeHours}h` : "--" },
                      ].map(item => (
                        <div key={item.label} className="text-center">
                          <p className="text-xl font-bold" data-testid={`text-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>{item.value}</p>
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="knowledge" className="mt-4 space-y-4">
            {knowledgeQuery.isLoading ? (
              <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            ) : !knowledge ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Network className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Knowledge Graph Data</h3>
                  <p className="text-muted-foreground max-w-md">
                    Knowledge graph diagnostics will appear here as Trinity learns and builds its knowledge base.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Network className="h-4 w-4" />
                      Knowledge Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {[
                        { label: "Total Entities", value: knowledge.totalEntities || 0 },
                        { label: "Relationships", value: knowledge.totalRelationships || 0 },
                        { label: "Categories", value: knowledge.categories || 0 },
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Avg Confidence", value: knowledge.avgConfidence ? `${Math.round(knowledge.avgConfidence * 100)}%` : "--" },
                        { label: "Stale Entries", value: knowledge.staleEntries || 0 },
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        { label: "Last Updated", value: knowledge.lastUpdated ? new Date(knowledge.lastUpdated).toLocaleDateString() : "--" },
                      ].map(item => (
                        <div key={item.label} className="text-center p-3 rounded-md border">
                          // @ts-ignore — TS migration: fix in refactoring sprint
                          <p className="text-xl font-bold" data-testid={`text-knowledge-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>{(item as any).value}</p>
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                // @ts-ignore — TS migration: fix in refactoring sprint
                {(knowledge as any).topCategories && knowledge.topCategories.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Top Categories</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      // @ts-ignore — TS migration: fix in refactoring sprint
                      {knowledge.topCategories.map((cat: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-3" data-testid={`row-category-${idx}`}>
                          <span className="text-sm truncate min-w-0">{cat.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            // @ts-ignore — TS migration: fix in refactoring sprint
                            <Progress value={(cat.count / ((knowledge as any).totalEntities || 1)) * 100} className="w-24 sm:w-32" />
                            <Badge variant="secondary">{cat.count}</Badge>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="diagnostics" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Fast Diagnostic Scan
                  </CardTitle>
                  <Button
                    onClick={() => runDiagnosticMutation.mutate()}
                    disabled={runDiagnosticMutation.isPending}
                    data-testid="button-run-diagnostic"
                  >
                    {runDiagnosticMutation.isPending ? (
                      <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Running...</>
                    ) : (
                      <><Zap className="h-4 w-4 mr-1.5" />Run Diagnostic</>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!diagnosticResults ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <Search className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">Run a fast diagnostic scan to check system health</p>
                    <p className="text-xs text-muted-foreground mt-1">This will analyze memory, knowledge graph, and chat server status</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {diagnosticResults.checks && Array.isArray(diagnosticResults.checks) ? (
                      diagnosticResults.checks.map((check: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`diagnostic-check-${idx}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {check.status === "pass" || check.status === "ok" ? (
                              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                            )}
                            <span className="text-sm truncate">{check.name || check.label}</span>
                          </div>
                          <Badge variant={check.status === "pass" || check.status === "ok" ? "default" : "secondary"}>
                            {check.status}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 p-3 rounded-md border">
                          <span className="text-sm">Status</span>
                          <Badge variant={diagnosticResults.success ? "default" : "destructive"}>
                            {diagnosticResults.success ? "Healthy" : "Issues Found"}
                          </Badge>
                        </div>
                        {diagnosticResults.message && (
                          <p className="text-sm text-muted-foreground">{diagnosticResults.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Chat Server Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chatDiagQuery.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !chatDiagQuery.data ? (
                  <p className="text-sm text-muted-foreground text-center p-4">Chat server diagnostics unavailable</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Connected", value: chatDiagQuery.data.connectedClients || 0 },
                      { label: "Rooms Active", value: chatDiagQuery.data.activeRooms || 0 },
                      { label: "Messages/min", value: chatDiagQuery.data.messagesPerMinute || 0 },
                      { label: "Status", value: chatDiagQuery.data.status || "unknown" },
                    ].map(item => (
                      <div key={item.label} className="text-center">
                        // @ts-ignore — TS migration: fix in refactoring sprint
                        <p className="text-xl font-bold" data-testid={`text-chat-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>{(item as any).value}</p>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}