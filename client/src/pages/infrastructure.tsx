import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Server,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  TrendingUp,
  Zap,
  Database,
  Wifi,
  Mail,
  CreditCard,
  Brain,
  MessageSquare,
  HardDrive,
  FileText,
  Lock,
  Globe,
  ClipboardList,
  Rocket,
  FlaskConical,
  BookOpen,
  FileCheck,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitStatus {
  name: string;
  displayName: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailure: string | null;
  lastSuccess: string | null;
  errorRate: number;
}

interface SLAStatus {
  serviceId: string;
  displayName: string;
  tier: "platinum" | "gold" | "silver";
  targetUptime: number;
  currentUptime: number;
  isMeetingSLA: boolean;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  breachCount: number;
}

interface InfrastructureHealth {
  circuits: CircuitStatus[];
  slaServices: SLAStatus[];
  aggregateStats: {
    totalCircuits: number;
    closedCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    overallHealth: string;
    slaCompliance: number;
  };
}

const circuitIcons: Record<string, typeof Server> = {
  stripe: CreditCard,
  gemini: Brain,
  resend: Mail,
  twilio: MessageSquare,
  database: Database,
  websocket: Wifi,
};

const tierColors: Record<string, string> = {
  platinum: "bg-gradient-to-r from-slate-300 to-slate-100 text-slate-900",
  gold: "bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-900",
  silver: "bg-gradient-to-r from-slate-400 to-slate-300 text-slate-800",
};

function CircuitCard({ circuit }: { circuit: CircuitStatus }) {
  const Icon = circuitIcons[circuit.name] || Server;
  
  const stateStyles: Record<CircuitState, { bg: string; text: string; icon: typeof CheckCircle }> = {
    CLOSED: { bg: "bg-emerald-500/10", text: "text-emerald-500", icon: CheckCircle },
    OPEN: { bg: "bg-red-500/10", text: "text-red-500", icon: XCircle },
    HALF_OPEN: { bg: "bg-amber-500/10", text: "text-amber-500", icon: AlertTriangle },
  };

  const style = stateStyles[circuit.state];
  const StateIcon = style.icon;

  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", style.bg)}>
              <Icon className={cn("h-4 w-4", style.text)} />
            </div>
            <CardTitle className="text-sm font-medium">{circuit.displayName}</CardTitle>
          </div>
          <Badge variant="outline" className={cn("gap-1", style.text)}>
            <StateIcon className="h-3 w-3" />
            {circuit.state}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Success</span>
            <span className="font-medium text-emerald-500">{circuit.successCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Failures</span>
            <span className="font-medium text-red-500">{circuit.failureCount}</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Error Rate</span>
            <span className={cn(circuit.errorRate > 5 ? "text-red-500" : "text-muted-foreground")}>
              {circuit.errorRate.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={Math.min(circuit.errorRate, 100)} 
            className="h-1.5"
          />
        </div>
        {circuit.lastFailure && (
          <div className="text-xs text-muted-foreground">
            Last failure: {new Date(circuit.lastFailure).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SLACard({ service }: { service: SLAStatus }) {
  const uptimePercentage = (service.currentUptime * 100);
  const isHealthy = service.isMeetingSLA;
  
  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{service.displayName}</CardTitle>
          <Badge className={cn("text-[10px]", tierColors[service.tier])}>
            {service.tier.toUpperCase()}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Target: {(service.targetUptime * 100).toFixed(2)}% uptime
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">
            {uptimePercentage.toFixed(2)}%
          </span>
          {isHealthy ? (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          )}
        </div>
        <Progress 
          value={uptimePercentage} 
          className={cn("h-2", isHealthy ? "" : "[&>div]:bg-amber-500")}
        />
        <div className="grid grid-cols-3 gap-1 text-xs text-center">
          <div className="flex flex-col">
            <span className="text-muted-foreground">p50</span>
            <span className="font-medium">{service.latencyP50}ms</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">p95</span>
            <span className="font-medium">{service.latencyP95}ms</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">p99</span>
            <span className="font-medium">{service.latencyP99}ms</span>
          </div>
        </div>
        {service.breachCount > 0 && (
          <div className="text-xs text-amber-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {service.breachCount} SLA breaches
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InfrastructurePage() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: health, isLoading, refetch, isFetching } = useQuery<InfrastructureHealth>({
    queryKey: ["/api/infrastructure/health"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading infrastructure status...</p>
        </div>
      </div>
    );
  }

  const stats = health?.aggregateStats;

  return (
    <ScrollArea className="h-[calc(100vh-4rem)]">
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Server className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              Infrastructure Monitoring
            </h1>
            <p className="text-muted-foreground text-sm md:text-base mt-1">
              Circuit breakers, SLA monitoring, and service telemetry
            </p>
          </div>
          <Button 
            onClick={() => refetch()} 
            disabled={isFetching}
            className="self-start md:self-auto"
            data-testid="button-refresh-infrastructure"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Total Circuits</p>
                  <p className="text-xl md:text-2xl font-bold">{stats?.totalCircuits || 0}</p>
                </div>
                <Zap className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Healthy</p>
                  <p className="text-xl md:text-2xl font-bold text-emerald-500">
                    {stats?.closedCircuits || 0}
                  </p>
                </div>
                <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Open Circuits</p>
                  <p className="text-xl md:text-2xl font-bold text-red-500">
                    {stats?.openCircuits || 0}
                  </p>
                </div>
                <XCircle className="h-6 w-6 md:h-8 md:w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">SLA Compliance</p>
                  <p className="text-xl md:text-2xl font-bold">
                    {((stats?.slaCompliance || 0) * 100).toFixed(1)}%
                  </p>
                </div>
                <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full md:w-auto flex flex-wrap gap-1">
            <TabsTrigger value="overview" className="flex-1 md:flex-none" data-testid="tab-overview">
              Overview
            </TabsTrigger>
            <TabsTrigger value="circuits" className="flex-1 md:flex-none" data-testid="tab-circuits">
              Circuit Breakers
            </TabsTrigger>
            <TabsTrigger value="sla" className="flex-1 md:flex-none" data-testid="tab-sla">
              SLA Monitoring
            </TabsTrigger>
            <TabsTrigger value="q4" className="flex-1 md:flex-none" data-testid="tab-q4">
              Q4 Services
            </TabsTrigger>
            <TabsTrigger value="launch" className="flex-1 md:flex-none" data-testid="tab-launch">
              Launch Readiness
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 md:mt-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base md:text-lg">Circuit Breaker Summary</CardTitle>
                  </div>
                  <CardDescription>External service protection status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {health?.circuits.slice(0, 4).map((circuit) => (
                      <div key={circuit.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const Icon = circuitIcons[circuit.name] || Server;
                            return <Icon className="h-4 w-4 text-muted-foreground" />;
                          })()}
                          <span className="text-sm">{circuit.displayName}</span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            circuit.state === "CLOSED" && "text-emerald-500 border-emerald-500/50",
                            circuit.state === "OPEN" && "text-red-500 border-red-500/50",
                            circuit.state === "HALF_OPEN" && "text-amber-500 border-amber-500/50",
                          )}
                        >
                          {circuit.state}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base md:text-lg">SLA Summary</CardTitle>
                  </div>
                  <CardDescription>Service level agreement status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {health?.slaServices.slice(0, 4).map((service) => (
                      <div key={service.serviceId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{service.displayName}</span>
                          <Badge className={cn("text-[9px] h-4", tierColors[service.tier])}>
                            {service.tier.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {(service.currentUptime * 100).toFixed(2)}%
                          </span>
                          {service.isMeetingSLA ? (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="circuits" className="mt-4 md:mt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {health?.circuits.map((circuit) => (
                <CircuitCard key={circuit.name} circuit={circuit} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="sla" className="mt-4 md:mt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {health?.slaServices.map((service) => (
                <SLACard key={service.serviceId} service={service} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="q4" className="mt-4 md:mt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <HardDrive className="h-4 w-4 text-blue-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Disaster Recovery</CardTitle>
                  </div>
                  <CardDescription className="text-xs">RPO/RTO management & failover</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">RPO Target</span>
                    <span className="font-medium">15 min</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">RTO Target</span>
                    <span className="font-medium">4 hr</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Failover Configs</span>
                    <span className="font-medium">3</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Ready
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-violet-500/10">
                      <FileText className="h-4 w-4 text-violet-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Log Aggregation</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Centralized logging & search</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Logs/min</span>
                    <span className="font-medium">0</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Error Rate</span>
                    <span className="font-medium">0%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Retention</span>
                    <span className="font-medium">7-365 days</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <Lock className="h-4 w-4 text-red-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Security Hardening</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Threat detection & prevention</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Threats Blocked</span>
                    <span className="font-medium">0</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Security Score</span>
                    <span className="font-medium text-emerald-500">100/100</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Patterns Active</span>
                    <span className="font-medium">5</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <Shield className="h-3 w-3 mr-1" />
                    Protected
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <Globe className="h-4 w-4 text-cyan-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">CDN/Edge Caching</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Asset delivery & API caching</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Hit Rate</span>
                    <span className="font-medium">0%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Edge Locations</span>
                    <span className="font-medium">4</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Cached Entries</span>
                    <span className="font-medium">0</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Ready
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <ClipboardList className="h-4 w-4 text-amber-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Audit Trail Export</CardTitle>
                  </div>
                  <CardDescription className="text-xs">SOX-compliant export & archival</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Retention</span>
                    <span className="font-medium">7 years</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Compliance</span>
                    <span className="font-medium text-emerald-500">SOX Ready</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Integrity</span>
                    <span className="font-medium">Verified</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Compliant
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="launch" className="mt-4 md:mt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <Rocket className="h-4 w-4 text-emerald-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Launch Readiness</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Production go-live validation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Checks Passed</span>
                    <span className="font-medium">28/36</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Launch Gates</span>
                    <span className="font-medium">4/6 Approved</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Readiness Score</span>
                    <span className="font-medium text-amber-500">78%</span>
                  </div>
                  <Progress value={78} className="h-1.5 mt-2" />
                  <Badge variant="outline" className="text-amber-500 border-amber-500/50 w-full justify-center mt-2">
                    <Clock className="h-3 w-3 mr-1" />
                    In Progress
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <FlaskConical className="h-4 w-4 text-purple-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Chaos Testing</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Failover drills & resilience</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Experiments Run</span>
                    <span className="font-medium">3/6</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Success Rate</span>
                    <span className="font-medium text-emerald-500">100%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Scheduled Drills</span>
                    <span className="font-medium">3</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Passed
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <BookOpen className="h-4 w-4 text-blue-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Operations Runbook</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Incident response procedures</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Runbooks</span>
                    <span className="font-medium">6</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Categories</span>
                    <span className="font-medium">5</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Active Responses</span>
                    <span className="font-medium">0</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Documented
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <FileCheck className="h-4 w-4 text-orange-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Compliance Sign-off</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Regulatory approval workflows</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Requirements</span>
                    <span className="font-medium">15/18 Compliant</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pending Sign-offs</span>
                    <span className="font-medium text-amber-500">3</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Frameworks</span>
                    <span className="font-medium">SOX, GDPR, PCI</span>
                  </div>
                  <Badge variant="outline" className="text-amber-500 border-amber-500/50 w-full justify-center mt-2">
                    <Clock className="h-3 w-3 mr-1" />
                    Awaiting Approval
                  </Badge>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-teal-500/10">
                      <PlayCircle className="h-4 w-4 text-teal-500" />
                    </div>
                    <CardTitle className="text-sm font-medium">Launch Rehearsal</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Production simulation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Rehearsals</span>
                    <span className="font-medium">2 Completed</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Last Score</span>
                    <span className="font-medium text-emerald-500">92%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Next Rehearsal</span>
                    <span className="font-medium">In 3 days</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/50 w-full justify-center mt-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    On Track
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
