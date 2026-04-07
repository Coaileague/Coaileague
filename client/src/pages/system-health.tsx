import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  Database,
  MessageSquare,
  Brain,
  HardDrive,
  CreditCard,
  Mail,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Cpu,
  MemoryStick,
  Clock,
  Zap,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { format, formatDistanceToNow } from "date-fns";

interface SystemMetrics {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedPercent: number;
  };
  cpu: {
    user: number;
    system: number;
    totalPercent: number;
  };
  uptime: number;
  timestamp: string;
}

interface ServiceHealth {
  service: string;
  status: "operational" | "degraded" | "down";
  message?: string;
  latencyMs?: number;
  isCritical: boolean;
  lastChecked: string;
}

interface ResponseTimeMetric {
  service: string;
  latencyMs: number;
  timestamp: string;
}

interface ServiceUptimeRecord {
  service: string;
  status: "operational" | "degraded" | "down";
  uptimePercent: number;
  lastDowntime: string | null;
  checksTotal: number;
  checksSuccessful: number;
}

interface ErrorLogEntry {
  id: string;
  service: string;
  message: string;
  timestamp: string;
  severity: "warning" | "error" | "critical";
}

interface DetailedHealthReport {
  success: boolean;
  data: {
    overall: "operational" | "degraded" | "down";
    systemMetrics: SystemMetrics;
    services: ServiceHealth[];
    responseTimeHistory: ResponseTimeMetric[];
    uptimeRecords: ServiceUptimeRecord[];
    errorLogs: ErrorLogEntry[];
    platformReadiness: "ready" | "degraded" | "critical";
    timestamp: string;
  };
}

const SERVICE_ICONS: Record<string, typeof Database> = {
  database: Database,
  chat_websocket: MessageSquare,
  gemini_ai: Brain,
  object_storage: HardDrive,
  stripe: CreditCard,
  email: Mail,
};

const SERVICE_LABELS: Record<string, string> = {
  database: "Data Storage",
  chat_websocket: "Real-time Chat",
  gemini_ai: "Trinity AI",
  object_storage: "File Storage",
  stripe: "Payment Processing",
  email: "Email Notifications",
  health_check_total: "System Monitoring",
};

import { CHART_PALETTE, CHART_SERIES } from "@/lib/chartPalette";

function StatusIndicator({ status }: { status: "operational" | "degraded" | "down" }) {
  const config = {
    operational: { color: "bg-emerald-500", icon: CheckCircle, label: "Operational" },
    degraded: { color: "bg-amber-500", icon: AlertTriangle, label: "Degraded" },
    down: { color: "bg-red-500", icon: XCircle, label: "Down" },
  };

  const { color, icon: Icon, label } = config[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${color} animate-pulse`} />
      <Icon className={`h-4 w-4 ${status === "operational" ? "text-emerald-500" : status === "degraded" ? "text-amber-500" : "text-red-500"}`} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function ServiceCard({ service, showDetails = true }: { service: ServiceHealth; showDetails?: boolean }) {
  const Icon = SERVICE_ICONS[service.service] || Activity;
  const label = SERVICE_LABELS[service.service] || service.service;

  const statusColors = {
    operational: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30",
    degraded: "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30",
    down: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30",
  };

  return (
    <Card className={`${statusColors[service.status]} transition-colors`} data-testid={`card-service-${service.service}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-background">
              <Icon className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{label}</CardTitle>
              {service.isCritical && (
                <Badge variant="outline" className="text-xs mt-0.5 border-red-500/30 text-red-500 bg-red-500/10">
                  Critical
                </Badge>
              )}
            </div>
          </div>
          <StatusIndicator status={service.status} />
        </div>
      </CardHeader>
      {showDetails && (
        <CardContent className="pt-0">
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {service.latencyMs !== undefined ? `${service.latencyMs}ms latency` : "No latency data"}
            </span>
            <span>
              {formatDistanceToNow(new Date(service.lastChecked), { addSuffix: true })}
            </span>
          </div>
          {service.message && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.message}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function SystemMetricsCards({ metrics }: { metrics: SystemMetrics }) {
  const uptimeFormatted = formatUptime(metrics.uptime);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card data-testid="card-memory-usage">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MemoryStick className="h-4 w-4 text-cyan-500" />
            Memory Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{metrics.memory.heapUsed}</span>
              <span className="text-sm text-muted-foreground">/ {metrics.memory.heapTotal} MB</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  metrics.memory.heapUsedPercent > 80
                    ? "bg-red-500"
                    : metrics.memory.heapUsedPercent > 60
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${metrics.memory.heapUsedPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">RSS: {metrics.memory.rss} MB</p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-cpu-usage">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-500" />
            CPU Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{metrics.cpu.totalPercent.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  metrics.cpu.totalPercent > 80
                    ? "bg-red-500"
                    : metrics.cpu.totalPercent > 60
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, metrics.cpu.totalPercent)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              User: {metrics.cpu.user.toFixed(1)}% | System: {metrics.cpu.system.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-uptime">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-500" />
            Uptime
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <span className="text-2xl font-bold">{uptimeFormatted}</span>
            <p className="text-xs text-muted-foreground">
              Since {format(new Date(Date.now() - metrics.uptime * 1000), "PPp")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-last-check">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-500" />
            Last Check
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <span className="text-2xl font-bold">{format(new Date(metrics.timestamp), "HH:mm:ss")}</span>
            <p className="text-xs text-muted-foreground">{format(new Date(metrics.timestamp), "PP")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function ResponseTimeChart({ data }: { data: ResponseTimeMetric[] }) {
  const chartData = data
    .filter((d) => d.service !== "health_check_total")
    .reduce((acc: Record<string, any>[], metric) => {
      const time = format(new Date(metric.timestamp), "HH:mm");
      const existing = acc.find((item) => item.time === time);
      if (existing) {
        existing[metric.service] = metric.latencyMs;
      } else {
        acc.push({ time, [metric.service]: metric.latencyMs });
      }
      return acc;
    }, [])
    .slice(-20);

  const services = [...new Set(data.filter((d) => d.service !== "health_check_total").map((d) => d.service))];
  const colors = CHART_SERIES;

  return (
    <Card data-testid="chart-response-times">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-cyan-500" />
          Response Time Trends
        </CardTitle>
        <CardDescription>Service latency over time (ms)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="time" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              {services.map((service, i) => (
                <Line
                  key={service}
                  type="monotone"
                  dataKey={service}
                  name={SERVICE_LABELS[service] || service}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function UptimeChart({ data }: { data: ServiceUptimeRecord[] }) {
  const chartData = data.map((record) => ({
    name: SERVICE_LABELS[record.service] || record.service,
    uptime: record.uptimePercent,
    fill:
      record.uptimePercent >= 99
        ? CHART_PALETTE.SUCCESS
        : record.uptimePercent >= 95
        ? CHART_PALETTE.WARNING
        : CHART_PALETTE.DANGER,
  }));

  return (
    <Card data-testid="chart-uptime">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-500" />
          Service Uptime
        </CardTitle>
        <CardDescription>Historical uptime percentage by service</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" domain={[90, 100]} className="text-xs" />
              <YAxis type="category" dataKey="name" width={120} className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [`${value.toFixed(2)}%`, "Uptime"]}
              />
              <Bar dataKey="uptime" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={
                      entry.uptime >= 99
                        ? CHART_PALETTE.SUCCESS
                        : entry.uptime >= 95
                        ? CHART_PALETTE.WARNING
                        : CHART_PALETTE.DANGER
                    } 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function MemoryChart({ history }: { history: SystemMetrics[] }) {
  const chartData = history.map((m) => ({
    time: format(new Date(m.timestamp), "HH:mm"),
    heap: m.memory.heapUsed,
    rss: m.memory.rss,
  }));

  return (
    <Card data-testid="chart-memory">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MemoryStick className="h-5 w-5 text-cyan-500" />
          Memory Usage Trend
        </CardTitle>
        <CardDescription>Heap and RSS memory over time (MB)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="time" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="heap"
                name="Heap Used"
                stroke={CHART_PALETTE.BRAND}
                fill={CHART_PALETTE.BRAND}
                fillOpacity={0.3}
              />
              <Area
                type="monotone"
                dataKey="rss"
                name="RSS"
                stroke={CHART_PALETTE.INFO}
                fill={CHART_PALETTE.INFO}
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorLogsList({ logs }: { logs: ErrorLogEntry[] }) {
  const severityConfig = {
    warning: { color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: AlertTriangle },
    error: { color: "bg-red-500/10 text-red-600 border-red-500/30", icon: XCircle },
    critical: { color: "bg-red-600/20 text-red-700 border-red-600/50", icon: AlertCircle },
  };

  if (logs.length === 0) {
    return (
      <Card data-testid="card-error-logs-empty">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-cyan-500" />
            Recent Error Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 text-emerald-500 mb-2" />
            <p className="text-sm">No recent errors</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-error-logs">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-cyan-500" />
          Recent Error Logs
        </CardTitle>
        <CardDescription>{logs.length} error(s) in the last period</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {logs.map((log) => {
              const config = severityConfig[log.severity];
              const Icon = config.icon;
              return (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border ${config.color}`}
                  data-testid={`log-entry-${log.id}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {SERVICE_LABELS[log.service] || log.service}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm mt-1 break-words">{log.message}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default function SystemHealth() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [metricsHistory, setMetricsHistory] = useState<SystemMetrics[]>([]);

  const {
    data: healthReport,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<DetailedHealthReport>({
    queryKey: ["/api/health/detailed"],
    refetchInterval: autoRefresh ? refreshInterval : false,
  });

  useEffect(() => {
    if (healthReport?.data?.systemMetrics) {
      setMetricsHistory((prev) => {
        const newHistory = [...prev, healthReport.data.systemMetrics];
        return newHistory.slice(-30);
      });
    }
  }, [healthReport?.data?.systemMetrics?.timestamp]);

  const platformStatusConfig = {
    ready: { color: "bg-emerald-500", label: "All Systems Operational" },
    degraded: { color: "bg-amber-500", label: "Some Services Degraded" },
    critical: { color: "bg-red-500", label: "Critical Issues Detected" },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-500" />
          <p className="text-muted-foreground">Loading system health...</p>
        </div>
      </div>
    );
  }

  if (isError || !healthReport?.success) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <XCircle className="h-12 w-12 text-red-500" />
          <p className="text-lg font-semibold">Failed to load health data</p>
          <Button onClick={() => refetch()} data-testid="button-retry">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { data } = healthReport;
  const status = platformStatusConfig[data.platformReadiness];

  const pageConfig: CanvasPageConfig = {
    id: 'system-health',
    title: 'System Health',
    subtitle: 'Monitor platform services and performance',
    category: 'admin',
    headerActions: (
      <div className="flex items-center gap-4">
        <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
          data.platformReadiness === "ready"
            ? "bg-emerald-500/10 text-emerald-600"
            : data.platformReadiness === "degraded"
            ? "bg-amber-500/10 text-amber-600"
            : "bg-red-500/10 text-red-600"
        }`} data-testid="badge-platform-status">
          <div className={`w-2 h-2 rounded-full ${status.color} animate-pulse`} />
          <span className="text-sm font-medium">{status.label}</span>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="auto-refresh"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
            data-testid="switch-auto-refresh"
          />
          <Label htmlFor="auto-refresh" className="text-sm">
            Auto-refresh
          </Label>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <SystemMetricsCards metrics={data.systemMetrics} />

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="services" data-testid="tab-services">Services</TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-errors">
            Errors
            {data.errorLogs.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {data.errorLogs.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.services.map((service) => (
              <ServiceCard key={service.service} service={service} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponseTimeChart data={data.responseTimeHistory} />
            <UptimeChart data={data.uptimeRecords} />
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MemoryChart history={metricsHistory} />
            <Card data-testid="card-service-latency">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-cyan-500" />
                  Current Service Latency
                </CardTitle>
                <CardDescription>Real-time latency per service (ms)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.services.map((service) => {
                    const latency = service.latencyMs || 0;
                    const maxLatency = 500;
                    const percent = Math.min(100, (latency / maxLatency) * 100);
                    return (
                      <div key={service.service} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">
                            {SERVICE_LABELS[service.service] || service.service}
                          </span>
                          <span className="text-muted-foreground">{latency}ms</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              latency > 300
                                ? "bg-red-500"
                                : latency > 150
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-uptime-details">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Uptime Details</CardTitle>
              <CardDescription>Service availability statistics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.uptimeRecords.map((record) => (
                  <div
                    key={record.service}
                    className="p-4 rounded-lg border bg-card"
                    data-testid={`uptime-record-${record.service}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-medium">
                        {SERVICE_LABELS[record.service] || record.service}
                      </span>
                      <Badge
                        variant={
                          record.uptimePercent >= 99
                            ? "default"
                            : record.uptimePercent >= 95
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {record.uptimePercent.toFixed(2)}%
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        Checks: {record.checksSuccessful}/{record.checksTotal}
                      </p>
                      {record.lastDowntime && (
                        <p>
                          Last issue:{" "}
                          {formatDistanceToNow(new Date(record.lastDowntime), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <ErrorLogsList logs={data.errorLogs} />
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
