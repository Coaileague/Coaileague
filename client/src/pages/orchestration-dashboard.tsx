import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Layers, 
  Wrench, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface OrchestrationOverlay {
  id: string;
  workOrderId: string;
  phase: string;
  domain: string;
  confidenceScore: string;
  phaseTransitionCount: number;
  totalDurationMs: number | null;
  permissionResult: string;
  createdAt: string;
  completedAt: string | null;
  phaseHistory: Array<{
    fromPhase: string | null;
    toPhase: string;
    reason: string;
    enteredAt: string;
    exitedAt?: string;
    durationMs?: number;
  }>;
}

interface ToolHealth {
  toolId: string;
  status: string;
  lastCheck: string;
  responseTime: number;
  uptime: number;
  errorRate: number;
}

interface OrchestrationData {
  activeOverlays: OrchestrationOverlay[];
  recentHistory: OrchestrationOverlay[];
  toolHealth: {
    summary: { healthy: number; degraded: number; offline: number; unknown: number };
    statuses: ToolHealth[];
  };
}

const phaseColors: Record<string, string> = {
  intake: "bg-blue-500",
  planning: "bg-purple-500",
  validating: "bg-yellow-500",
  executing: "bg-orange-500",
  reflecting: "bg-indigo-500",
  committing: "bg-teal-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  rolled_back: "bg-gray-500",
  escalated: "bg-pink-500",
};

const phaseBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  failed: "destructive",
  escalated: "destructive",
  rolled_back: "secondary",
};

function PhaseTimeline({ history }: { history: OrchestrationOverlay["phaseHistory"] }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-muted-foreground">No phase history available</p>;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {history.map((transition, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <div 
            className={`h-2 w-2 rounded-full ${phaseColors[transition.toPhase] || "bg-gray-400"}`}
            title={`${transition.toPhase}: ${transition.reason}`}
          />
          <span className="text-xs text-muted-foreground">{transition.toPhase}</span>
          {idx < history.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

function ToolHealthCard({ tool }: { tool: ToolHealth }) {
  const statusColors: Record<string, string> = {
    healthy: "text-green-600",
    degraded: "text-yellow-600",
    offline: "text-red-600",
    unknown: "text-gray-400",
  };

  const StatusIcon = tool.status === "healthy" ? CheckCircle2 
    : tool.status === "degraded" ? AlertTriangle 
    : tool.status === "offline" ? XCircle 
    : Activity;

  return (
    <div className="flex items-center justify-between gap-2 p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <StatusIcon className={`h-5 w-5 ${statusColors[tool.status] || "text-gray-400"}`} />
        <div>
          <p className="text-sm font-medium">{tool.toolId}</p>
          <p className="text-xs text-muted-foreground">
            {tool.responseTime}ms avg | {(tool.uptime * 100).toFixed(1)}% uptime
          </p>
        </div>
      </div>
      <Badge variant={tool.status === "healthy" ? "default" : tool.status === "degraded" ? "secondary" : "destructive"}>
        {tool.status}
      </Badge>
    </div>
  );
}

export default function OrchestrationDashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery<OrchestrationData>({
    queryKey: ["/api/orchestration/dashboard"],
    refetchInterval: 10000,
  });

  const activeCount = data?.activeOverlays?.length || 0;
  const completedCount = data?.recentHistory?.filter(o => o.phase === "completed").length || 0;
  const failedCount = data?.recentHistory?.filter(o => o.phase === "failed" || o.phase === "escalated").length || 0;
  const healthySummary = data?.toolHealth?.summary || { healthy: 0, degraded: 0, offline: 0, unknown: 0 };

  const pageConfig: CanvasPageConfig = {
    id: 'orchestration-dashboard',
    title: 'Orchestration Dashboard',
    subtitle: 'Monitor active work orders, phase transitions, and tool health',
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="orchestration-dashboard-page">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Active Overlays
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-active-count">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Currently executing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-completed-count">{completedCount}</p>
            <p className="text-xs text-muted-foreground">Recent 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Failed/Escalated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-failed-count">{failedCount}</p>
            <p className="text-xs text-muted-foreground">Recent 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wrench className="h-4 w-4 text-purple-500" />
              Tool Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold">{healthySummary.healthy}</span>
              <span className="text-yellow-600 font-bold">{healthySummary.degraded}</span>
              <span className="text-red-600 font-bold">{healthySummary.offline}</span>
            </div>
            <p className="text-xs text-muted-foreground">Healthy / Degraded / Offline</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
          <TabsTrigger value="active" data-testid="tab-active-overlays">
            Active ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            History
          </TabsTrigger>
          <TabsTrigger value="tools" data-testid="tab-tools">
            Tools ({healthySummary.healthy + healthySummary.degraded + healthySummary.offline})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground space-y-2">
              <Activity className="h-8 w-8 mx-auto opacity-50 animate-pulse" />
              <p className="font-medium text-foreground">Loading active orchestration work</p>
              <p className="text-sm">Checking live overlays and their current execution phases.</p>
            </CardContent></Card>
          ) : activeCount === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground space-y-2">
              <CheckCircle2 className="h-8 w-8 mx-auto opacity-50 text-green-600 dark:text-green-400" />
              <p className="font-medium text-foreground">No active orchestration overlays</p>
              <p className="text-sm">Current work orders are idle or already completed.</p>
            </CardContent></Card>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {data?.activeOverlays?.map((overlay) => (
                  <Card key={overlay.id} data-testid={`card-overlay-${overlay.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-medium">{overlay.domain}</CardTitle>
                        <Badge variant={phaseBadgeVariants[overlay.phase] || "outline"}>
                          {overlay.phase}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        Work Order: {overlay.workOrderId.slice(0, 8)}...
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <PhaseTimeline history={overlay.phaseHistory} />
                      <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Started {formatDistanceToNow(new Date(overlay.createdAt), { addSuffix: true })}
                        </span>
                        <span>Transitions: {overlay.phaseTransitionCount}</span>
                      </div>
                      <Progress 
                        value={getPhaseProgress(overlay.phase)} 
                        className="h-1"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {isLoading ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground space-y-2">
              <Clock className="h-8 w-8 mx-auto opacity-50 animate-pulse" />
              <p className="font-medium text-foreground">Loading orchestration history</p>
              <p className="text-sm">Pulling recent phase transitions, durations, and outcomes.</p>
            </CardContent></Card>
          ) : (data?.recentHistory?.length || 0) === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground space-y-2">
              <Clock className="h-8 w-8 mx-auto opacity-50" />
              <p className="font-medium text-foreground">No recent orchestration history</p>
              <p className="text-sm">Completed orchestration runs will appear here once the first workflows finish.</p>
            </CardContent></Card>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {data?.recentHistory?.map((overlay) => (
                  <Card key={overlay.id} data-testid={`card-history-${overlay.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-medium">{overlay.domain}</CardTitle>
                        <Badge variant={phaseBadgeVariants[overlay.phase] || "outline"}>
                          {overlay.phase}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <PhaseTimeline history={overlay.phaseHistory} />
                      <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                        <span>Duration: {overlay.totalDurationMs ? `${(overlay.totalDurationMs / 1000).toFixed(1)}s` : "N/A"}</span>
                        <span>Confidence: {parseFloat(overlay.confidenceScore || "0").toFixed(0)}%</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          {isLoading ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground space-y-2">
              <Wrench className="h-8 w-8 mx-auto opacity-50 animate-pulse" />
              <p className="font-medium text-foreground">Loading tool health</p>
              <p className="text-sm">Reviewing status, uptime, and response times across orchestration dependencies.</p>
            </CardContent></Card>
          ) : (data?.toolHealth?.statuses?.length || 0) === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground space-y-2">
              <Wrench className="h-8 w-8 mx-auto opacity-50" />
              <p className="font-medium text-foreground">No tool health data available</p>
              <p className="text-sm">Health checks will appear after orchestration dependencies report their first status snapshots.</p>
            </CardContent></Card>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {data?.toolHealth?.statuses?.map((tool) => (
                  <ToolHealthCard key={tool.toolId} tool={tool} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </CanvasHubPage>
  );
}

function getPhaseProgress(phase: string): number {
  const phases = ["intake", "planning", "validating", "executing", "reflecting", "committing", "completed"];
  const index = phases.indexOf(phase);
  if (index === -1) return 0;
  return ((index + 1) / phases.length) * 100;
}
