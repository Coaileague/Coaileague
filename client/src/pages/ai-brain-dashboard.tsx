import { secureFetch } from "@/lib/csrf";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain, FileText, AlertTriangle, Settings, Bell,
  ShieldAlert, Activity, Zap, BarChart3, Clock, AlertCircle,
  CheckCircle, XCircle, Sigma,
} from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface User {
  id: string;
  workspaceId: string;
  email: string;
}

const CONFLICT_CATEGORY_LABELS: Record<number, string> = {
  1: "Memory Contradiction",
  2: "Decision Contradiction",
  3: "Values Violation",
  4: "Trust Tier Violation",
  5: "Prediction Divergence",
  6: "Execution Anomaly",
};

const SEVERITY_COLOR: Record<string, string> = {
  BLOCKING: "text-red-500",
  WARNING: "text-amber-500",
  INFO: "text-blue-500",
};

const SIGNAL_TYPE_SHORT: Record<string, string> = {
  CONVERSATIONAL: "Chat",
  VOICE_INPUT: "Voice",
  PLATFORM_EVENT: "Platform Event",
  INCIDENT_SIGNAL: "Incident",
  COMPLIANCE_SIGNAL: "Compliance",
  FINANCIAL_SIGNAL: "Financial",
  SCHEDULE_SIGNAL: "Schedule",
  DOCUMENT_SIGNAL: "Document",
  SENSOR_SIGNAL: "Sensor",
  EXTERNAL_SIGNAL: "External",
  SYSTEM_SIGNAL: "System",
  SELF_SIGNAL: "Self",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  testId,
}: {
  icon: typeof Brain;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  testId?: string;
}) {
  return (
    <Card>
      <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-2">
        <CardTitle className={`text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 ${color || ""}`}>
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
        <p className="text-lg sm:text-2xl font-bold" data-testid={testId}>{value}</p>
        {sub && <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ACCDashboardPanel({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useQuery<{ success: boolean; stats: any }>({
    queryKey: ["/api/trinity/acc/stats"],
    enabled: !!workspaceId,
  });

  const stats = data?.stats;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-10 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No ACC data available yet. ACC activity will appear here once Trinity processes workspace events.</p>
        </CardContent>
      </Card>
    );
  }

  const severityKeys = Object.keys(stats.bySeverity || {});
  const categoryKeys = Object.keys(stats.byCategory || {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={ShieldAlert}
          label="Today's Conflicts"
          value={stats.todayTotal}
          sub="detected today"
          testId="acc-today-total"
        />
        <StatCard
          icon={XCircle}
          label="Auto-Blocked"
          value={stats.humanRequired}
          sub="require review"
          color="text-red-500"
          testId="acc-human-required"
        />
        <StatCard
          icon={CheckCircle}
          label="Auto-Resolved"
          value={stats.autoResolved}
          sub="auto-handled"
          color="text-green-500"
          testId="acc-auto-resolved"
        />
        <StatCard
          icon={BarChart3}
          label="Resolution Rate"
          value={`${stats.resolutionAccuracy}%`}
          sub="accuracy today"
          testId="acc-resolution-rate"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              By Severity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {severityKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">No conflicts recorded today</p>
            ) : (
              severityKeys.map(sev => (
                <div key={sev} className="flex items-center justify-between text-sm">
                  <span className={`font-medium ${SEVERITY_COLOR[sev] || "text-foreground"}`}>{sev}</span>
                  <Badge variant="outline" data-testid={`acc-severity-${sev.toLowerCase()}`}>
                    {stats.bySeverity[sev]}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sigma className="w-4 h-4" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {categoryKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">No conflicts recorded today</p>
            ) : (
              categoryKeys.map(cat => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate">
                    {CONFLICT_CATEGORY_LABELS[parseInt(cat)] || `Category ${cat}`}
                  </span>
                  <Badge variant="outline" data-testid={`acc-category-${cat}`}>
                    {stats.byCategory[cat]}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {stats.openUnresolved && stats.openUnresolved.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-4 h-4" />
              Open Conflicts Requiring Review
            </CardTitle>
            <CardDescription>
              These BLOCKING conflicts were auto-halted and need human resolution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.openUnresolved.map((conflict: any, i: number) => (
              <div
                key={conflict.conflictId}
                className="rounded-md border p-3 space-y-1"
                data-testid={`acc-unresolved-${i}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium text-red-500">{conflict.severity}</span>
                  <span className="text-xs text-muted-foreground">
                    {CONFLICT_CATEGORY_LABELS[conflict.category] || `Category ${conflict.category}`}
                  </span>
                </div>
                <p className="text-xs text-foreground line-clamp-2">{conflict.description}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(conflict.detectedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ThalamicDashboardPanel({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useQuery<{ success: boolean; stats: any }>({
    queryKey: ["/api/trinity/thalamic/stats"],
    enabled: !!workspaceId,
  });

  const stats = data?.stats;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-10 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No thalamic signal data yet. Signals will appear here once Trinity processes workspace events.</p>
        </CardContent>
      </Card>
    );
  }

  const signalKeys = Object.entries(stats.bySignalType || {})
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 8);

  const regionKeys = Object.entries(stats.byRegion || {})
    .sort((a: any, b: any) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={Activity}
          label="Today's Signals"
          value={stats.todayTotal}
          sub="signals processed"
          testId="thalamic-today-total"
        />
        <StatCard
          icon={Clock}
          label="7-Day Total"
          value={stats.last7DayTotal}
          sub="past 7 days"
          testId="thalamic-7day-total"
        />
        <StatCard
          icon={Zap}
          label="Critical"
          value={stats.criticalCount}
          sub="priority 90+"
          color="text-amber-500"
          testId="thalamic-critical-count"
        />
        <StatCard
          icon={BarChart3}
          label="Avg Priority"
          value={stats.avgPriority}
          sub="0–100 score"
          testId="thalamic-avg-priority"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Signal Types
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {signalKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">No signals recorded yet</p>
            ) : (
              signalKeys.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate">
                    {SIGNAL_TYPE_SHORT[type] || type}
                  </span>
                  <Badge variant="outline" data-testid={`thalamic-type-${type}`}>
                    {count as number}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Brain Region Routing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {regionKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">No routing data yet</p>
            ) : (
              regionKeys.map(([region, count]) => (
                <div key={region} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate text-xs">{region}</span>
                  <Badge variant="outline" data-testid={`thalamic-region-${region}`}>
                    {count as number}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {stats.recentSignals && stats.recentSignals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Recent Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {stats.recentSignals.slice(0, 10).map((sig: any, i: number) => (
                <div
                  key={sig.signalId}
                  className="flex items-center justify-between text-xs py-1 border-b last:border-0 gap-2"
                  data-testid={`thalamic-signal-${i}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      P{sig.priority}
                    </Badge>
                    <span className="text-muted-foreground truncate">
                      {SIGNAL_TYPE_SHORT[sig.signalType] || sig.signalType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {sig.routedTo}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(sig.processedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AIBrainDashboard() {
  const [extractedData, setExtractedData] = useState<any>(null);
  const [entityType, setEntityType] = useState<"employee" | "client" | "vendor" | "invoice">("employee");

  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const response = await secureFetch("/api/user");
      return response.json();
    },
  });

  const workspaceId = user?.workspaceId || "";

  const actionBadge = (
    <Badge variant="outline">
      Production Ready
    </Badge>
  );

  const pageConfig: CanvasPageConfig = {
    id: "ai-brain-dashboard",
    title: "Trinity Brain Dashboard",
    subtitle: "Cognitive monitoring: ACC conflict detection, thalamic signal flow, guardrails, and document processing",
    category: "admin",
    headerActions: actionBadge,
  };

  return (
    <CanvasHubPage config={pageConfig}>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <StatCard icon={FileText} label="Extraction" value={5} sub="Doc types" />
        <StatCard icon={AlertTriangle} label="Detection" value={5} sub="Rules enabled" />
        <StatCard icon={Settings} label="Guardrails" value={4} sub="Configured" />
        <StatCard icon={Bell} label="Channels" value={4} sub="Notification channels" />
      </div>

      <Tabs defaultValue="acc" className="space-y-4">
        <TabsList className="w-full overflow-x-auto flex">
          <TabsTrigger value="acc" className="flex items-center gap-1.5" data-testid="tab-acc">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>ACC</span>
          </TabsTrigger>
          <TabsTrigger value="thalamic" className="flex items-center gap-1.5" data-testid="tab-thalamic">
            <Activity className="w-3.5 h-3.5" />
            <span>Thalamic</span>
          </TabsTrigger>
          <TabsTrigger value="extraction" data-testid="tab-extraction">Extract</TabsTrigger>
          <TabsTrigger value="issues" data-testid="tab-issues">Issues</TabsTrigger>
          <TabsTrigger value="guardrails" data-testid="tab-guardrails">Guardrails</TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="acc" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Anterior Cingulate Cortex — Conflict Monitor
              </CardTitle>
              <CardDescription>
                Real-time view of Trinity's conflict detection engine. BLOCKING conflicts auto-halt AI actions;
                WARNING conflicts log and pass through; INFO conflicts log only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspaceId ? (
                <ACCDashboardPanel workspaceId={workspaceId} />
              ) : (
                <div className="py-8 text-center text-muted-foreground">Loading workspace context...</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="thalamic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                Thalamic Gateway — Signal Flow Monitor
              </CardTitle>
              <CardDescription>
                Universal sensory relay. Every input (chat, events, automations, bots) passes through
                the thalamus for classification, priority scoring, and brain region routing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspaceId ? (
                <ThalamicDashboardPanel workspaceId={workspaceId} />
              ) : (
                <div className="py-8 text-center text-muted-foreground">Loading workspace context...</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extraction" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Extraction Workflow</CardTitle>
              <CardDescription>
                Upload business documents for AI-powered data extraction using Trinity Vision
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* DocumentExtractionUpload removed */}
              {extractedData && (
                <div className="mt-4 p-4 bg-muted rounded-md">
                  <p className="text-sm font-medium">
                    Document ready for review. Move to Review tab to import.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Issue Detection & Quality Analysis</CardTitle>
              <CardDescription>
                Identify data quality issues, anomalies, and recommended actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {extractedData ? (
                {/* IssueDetectionViewer removed */}
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Extract a document first to analyze for issues</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guardrails" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trinity Guardrails Configuration</CardTitle>
              <CardDescription>
                View and manage automation limits, thresholds, and safety controls
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* GuardrailsDashboard removed */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review & Import Data</CardTitle>
              <CardDescription>
                Review extracted data, make corrections, and import to workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {extractedData ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Entity Type</label>
                    <select
                      value={entityType}
                      onChange={(e) => setEntityType(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded-md"
                      data-testid="select-entity-type"
                    >
                      <option value="employee">Employee</option>
                      <option value="client">Client</option>
                      <option value="vendor">Vendor</option>
                      <option value="invoice">Invoice</option>
                    </select>
                  </div>
                  {/* MigrationReview removed */}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Extract a document first to review and import</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
