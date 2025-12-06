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
  RefreshCw
} from "lucide-react";
import { Link } from "wouter";

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
  const { data, isLoading, refetch, isFetching } = useQuery<ControlTowerData>({
    queryKey: ['/api/control-tower/summary'],
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2">
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
      <div className="flex items-center justify-between">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* System Health Card */}
        <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 hover-elevate transition-all">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
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
        <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 hover-elevate transition-all">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
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
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-yellow-500" />
                    Overdue Invoices
                  </span>
                  <span className="font-medium text-yellow-600">{moneyFlow.overdueInvoices} (${moneyFlow.overdueAmount?.toLocaleString() || 0})</span>
                </div>
              )}
              {moneyFlow.failedPayments > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    Failed Payments
                  </span>
                  <span className="font-medium text-red-600">{moneyFlow.failedPayments}</span>
                </div>
              )}
              {moneyFlow.pendingPayments > 0 && (
                <div className="flex items-center justify-between">
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
            
            <Link href="/billing">
              <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-view-billing">
                View Details <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Workforce Alerts Card */}
        <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 hover-elevate transition-all">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
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
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    Expiring Certifications
                  </span>
                  <span className="font-medium text-yellow-600">{workforce.expiringCertifications}</span>
                </div>
              )}
              {workforce.schedulingGaps > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-orange-500" />
                    Scheduling Gaps
                  </span>
                  <span className="font-medium text-orange-600">{workforce.schedulingGaps}</span>
                </div>
              )}
              {workforce.complianceIssues > 0 && (
                <div className="flex items-center justify-between">
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
      </div>
    </div>
  );
}
