/**
 * CONTROL TOWER - AI-Powered Business Intelligence
 * 
 * Three simple cards that show root admins what needs attention:
 * 1. System Health - Is anything broken?
 * 2. Money Flow - Payments needing attention
 * 3. Workforce Alerts - Compliance issues or scheduling problems
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  DollarSign, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Brain,
  Pause,
  Play
} from "lucide-react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HealthMetric {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  message?: string;
}

interface MoneyFlowMetric {
  overdueInvoices: number;
  overdueAmount: number;
  pendingPayments: number;
  failedPayments: number;
  monthlyRevenue: number;
}

interface WorkforceMetric {
  expiringCertifications: number;
  schedulingGaps: number;
  pendingApprovals: number;
  complianceIssues: number;
}

interface AiBrainService {
  name: string;
  status: 'running' | 'paused' | 'stopped' | 'error' | 'starting';
  pausedBy?: string | null;
  pauseReason?: string | null;
}

interface AiBrainHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: AiBrainService[];
  summary: {
    runningServices: number;
    pausedServices: number;
    errorServices: number;
    totalServices: number;
  };
  workflows?: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
  };
}

interface ControlTowerData {
  systemHealth: {
    overall: 'operational' | 'degraded' | 'down';
    services: HealthMetric[];
    lastCheck: string;
  };
  moneyFlow: MoneyFlowMetric;
  workforce: WorkforceMetric;
  generatedAt: string;
}

function getStatusColor(status: 'operational' | 'degraded' | 'down' | 'good' | 'warning' | 'critical'): string {
  switch (status) {
    case 'operational':
    case 'good':
      return 'text-green-600 dark:text-green-400';
    case 'degraded':
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'down':
    case 'critical':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

function getStatusBadge(status: 'operational' | 'degraded' | 'down'): JSX.Element {
  switch (status) {
    case 'operational':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">All Systems Go</Badge>;
    case 'degraded':
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Needs Attention</Badge>;
    case 'down':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Critical</Badge>;
  }
}

function StatusIcon({ status }: { status: 'operational' | 'degraded' | 'down' }) {
  switch (status) {
    case 'operational':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'degraded':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'down':
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

export function ControlTower() {
  const { toast } = useToast();
  
  const { data, isLoading, refetch, isFetching } = useQuery<ControlTowerData>({
    queryKey: ['/api/control-tower/summary'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: aiBrainData } = useQuery<AiBrainHealth>({
    queryKey: ['/api/ai-brain/control/health'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const pauseServiceMutation = useMutation({
    mutationFn: async ({ serviceName, reason }: { serviceName: string; reason?: string }) => {
      const res = await apiRequest('POST', `/api/ai-brain/control/services/${serviceName}/pause`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-brain/control/health'] });
      toast({ title: "Service paused", description: "Trinity™ service has been paused" });
    },
    onError: (error) => {
      toast({ title: "Failed to pause service", description: String(error), variant: "destructive" });
    },
  });

  const resumeServiceMutation = useMutation({
    mutationFn: async (serviceName: string) => {
      const res = await apiRequest('POST', `/api/ai-brain/control/services/${serviceName}/resume`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-brain/control/health'] });
      toast({ title: "Service resumed", description: "Trinity™ service has been resumed" });
    },
    onError: (error) => {
      toast({ title: "Failed to resume service", description: String(error), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Default values if API doesn't return data yet
  const systemHealth = data?.systemHealth || { overall: 'operational' as const, services: [], lastCheck: new Date().toISOString() };
  const moneyFlow = data?.moneyFlow || { overdueInvoices: 0, overdueAmount: 0, pendingPayments: 0, failedPayments: 0, monthlyRevenue: 0 };
  const workforce = data?.workforce || { expiringCertifications: 0, schedulingGaps: 0, pendingApprovals: 0, complianceIssues: 0 };

  const moneyIssues = moneyFlow.overdueInvoices + moneyFlow.failedPayments;
  const moneyStatus: 'operational' | 'degraded' | 'down' = 
    moneyFlow.failedPayments > 0 ? 'down' : 
    moneyFlow.overdueInvoices > 5 ? 'degraded' : 'operational';

  const workforceIssues = workforce.expiringCertifications + workforce.complianceIssues + workforce.schedulingGaps;
  const workforceStatus: 'operational' | 'degraded' | 'down' = 
    workforce.complianceIssues > 0 ? 'down' : 
    workforce.expiringCertifications > 3 ? 'degraded' : 'operational';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Control Tower</h2>
          <p className="text-xs text-muted-foreground">Every morning we summarize what needs your attention</p>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-control-tower"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System Health Card */}
        <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border hover-elevate transition-all">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              System Health
            </CardTitle>
            {getStatusBadge(systemHealth.overall)}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <StatusIcon status={systemHealth.overall} />
              <div>
                <p className={`text-2xl font-bold ${getStatusColor(systemHealth.overall)}`}>
                  {systemHealth.overall === 'operational' ? 'All Good' : 
                   systemHealth.overall === 'degraded' ? 'Issues Detected' : 'Systems Down'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {systemHealth.services.filter(s => s.status === 'operational').length} of {systemHealth.services.length || 8} services running
                </p>
              </div>
            </div>
            
            {systemHealth.services.filter(s => s.status !== 'operational').length > 0 && (
              <div className="space-y-1 mb-3">
                {systemHealth.services.filter(s => s.status !== 'operational').slice(0, 2).map(service => (
                  <div key={service.name} className="flex items-center gap-2 text-xs">
                    <StatusIcon status={service.status} />
                    <span className="truncate">{service.name}: {service.message || service.status}</span>
                  </div>
                ))}
              </div>
            )}
            
            <Link href="/system-health">
              <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-view-system-health">
                View Details <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Money Flow Card */}
        <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border hover-elevate transition-all">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              Money Flow
            </CardTitle>
            {getStatusBadge(moneyStatus)}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <StatusIcon status={moneyStatus} />
              <div>
                <p className={`text-2xl font-bold ${getStatusColor(moneyStatus)}`}>
                  {moneyIssues === 0 ? 'On Track' : `${moneyIssues} Issues`}
                </p>
                <p className="text-xs text-muted-foreground">
                  ${(moneyFlow.monthlyRevenue || 0).toLocaleString()} this month
                </p>
              </div>
            </div>
            
            <div className="space-y-1 mb-3 text-xs">
              {moneyFlow.overdueInvoices > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-yellow-500" />
                    Overdue Invoices
                  </span>
                  <span className="font-medium text-yellow-600">{moneyFlow.overdueInvoices} (${moneyFlow.overdueAmount?.toLocaleString() || 0})</span>
                </div>
              )}
              {moneyFlow.failedPayments > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    Failed Payments
                  </span>
                  <span className="font-medium text-red-600">{moneyFlow.failedPayments}</span>
                </div>
              )}
              {moneyFlow.pendingPayments > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-blue-500" />
                    Pending
                  </span>
                  <span className="font-medium">{moneyFlow.pendingPayments}</span>
                </div>
              )}
              {moneyIssues === 0 && (
                <p className="text-muted-foreground">No payment issues detected</p>
              )}
            </div>
            
            <div className="flex gap-2 mt-2">
              <Link href="/billing" className="flex-1">
                <Button variant="outline" size="sm" className="w-full" data-testid="button-view-billing">
                  View Details <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
              <Link href="/ai-usage">
                <Button variant="outline" size="sm" data-testid="button-view-ai-usage">
                  AI Usage
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Workforce Alerts Card */}
        <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border hover-elevate transition-all">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Workforce Alerts
            </CardTitle>
            {getStatusBadge(workforceStatus)}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <StatusIcon status={workforceStatus} />
              <div>
                <p className={`text-2xl font-bold ${getStatusColor(workforceStatus)}`}>
                  {workforceIssues === 0 ? 'All Clear' : `${workforceIssues} Alerts`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {workforce.pendingApprovals} approvals pending
                </p>
              </div>
            </div>
            
            <div className="space-y-1 mb-3 text-xs">
              {workforce.expiringCertifications > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    Expiring Certifications
                  </span>
                  <span className="font-medium text-yellow-600">{workforce.expiringCertifications}</span>
                </div>
              )}
              {workforce.schedulingGaps > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-orange-500" />
                    Scheduling Gaps
                  </span>
                  <span className="font-medium text-orange-600">{workforce.schedulingGaps}</span>
                </div>
              )}
              {workforce.complianceIssues > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    Compliance Issues
                  </span>
                  <span className="font-medium text-red-600">{workforce.complianceIssues}</span>
                </div>
              )}
              {workforceIssues === 0 && (
                <p className="text-muted-foreground">No workforce issues detected</p>
              )}
            </div>
            
            <Link href="/employees">
              <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-view-employees">
                View Details <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Trinity™ Orchestration Card */}
        <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border hover-elevate transition-all">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-500" />
              Trinity™
            </CardTitle>
            {aiBrainData?.overall === 'healthy' ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Healthy</Badge>
            ) : aiBrainData?.overall === 'degraded' ? (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Degraded</Badge>
            ) : aiBrainData?.overall === 'unhealthy' ? (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Unhealthy</Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400">Loading</Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              {aiBrainData?.overall === 'healthy' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : aiBrainData?.overall === 'degraded' ? (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <div>
                <p className={`text-2xl font-bold ${
                  aiBrainData?.overall === 'healthy' ? 'text-green-600 dark:text-green-400' :
                  aiBrainData?.overall === 'degraded' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-red-600 dark:text-red-400'
                }`}>
                  {aiBrainData?.summary?.runningServices || 0} Running
                </p>
                <p className="text-xs text-muted-foreground">
                  {aiBrainData?.summary?.totalServices || 0} total services
                </p>
              </div>
            </div>
            
            <div className="space-y-1 mb-3 text-xs">
              {aiBrainData?.summary?.pausedServices && aiBrainData.summary.pausedServices > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <Pause className="h-3 w-3 text-yellow-500" />
                    Paused Services
                  </span>
                  <span className="font-medium text-yellow-600">{aiBrainData.summary.pausedServices}</span>
                </div>
              )}
              {aiBrainData?.summary?.errorServices && aiBrainData.summary.errorServices > 0 && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    Error Services
                  </span>
                  <span className="font-medium text-red-600">{aiBrainData.summary.errorServices}</span>
                </div>
              )}
              {aiBrainData?.workflows && (
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-blue-500" />
                    Workflows
                  </span>
                  <span className="font-medium">{aiBrainData.workflows.completedRuns} / {aiBrainData.workflows.totalRuns}</span>
                </div>
              )}
              {(!aiBrainData?.summary?.pausedServices && !aiBrainData?.summary?.errorServices) && (
                <p className="text-muted-foreground">All AI services operational</p>
              )}
            </div>

            {/* Quick service controls */}
            <div className="flex gap-1 flex-wrap mb-2">
              {aiBrainData?.services?.slice(0, 2).map((service) => (
                <Badge
                  key={service.name}
                  className={`text-xs cursor-pointer ${
                    service.status === 'running' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}
                  onClick={() => {
                    if (service.status === 'running') {
                      pauseServiceMutation.mutate({ serviceName: service.name, reason: 'Manual pause from Control Tower' });
                    } else {
                      resumeServiceMutation.mutate(service.name);
                    }
                  }}
                  data-testid={`badge-service-${service.name}`}
                >
                  {service.status === 'running' ? <Play className="h-2 w-2 mr-1" /> : <Pause className="h-2 w-2 mr-1" />}
                  {service.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0, 12)}
                </Badge>
              ))}
            </div>
            
            <Link href="/trinity-insights">
              <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-view-ai-brain">
                View Details <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
