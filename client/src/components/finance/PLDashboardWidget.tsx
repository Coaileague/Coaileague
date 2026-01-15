import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  ArrowRight, 
  AlertTriangle,
  Brain,
  RefreshCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface PLSummary {
  periodStart: string;
  periodEnd: string;
  granularity: string;
  revenueTotal: number;
  payrollTotal: number;
  expenseTotal: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  invoicedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  expenseBreakdown: {
    payroll: number;
    overtime: number;
    benefits: number;
    insurance: number;
    equipment: number;
    admin: number;
    other: number;
  };
  aiInsights: string[];
  alerts: Array<{
    id: string;
    severity: string;
    title: string;
    message: string;
  }>;
  quickbooksStatus: string;
  lastUpdated: string;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toFixed(0)}`;
}

function MetricCard({ 
  label, 
  value, 
  trend,
  trendValue,
  icon: Icon,
  positive = true,
  testId
}: { 
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: typeof DollarSign;
  positive?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50" data-testid={testId}>
      <div className={cn(
        "p-2 rounded-md",
        positive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium truncate" data-testid={testId ? `${testId}-label` : undefined}>{label}</p>
        <p className="text-lg font-semibold font-mono" data-testid={testId ? `${testId}-value` : undefined}>{value}</p>
      </div>
      {trend && trendValue && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium",
          trend === 'up' && positive && "text-emerald-500",
          trend === 'down' && !positive && "text-emerald-500",
          trend === 'up' && !positive && "text-red-500",
          trend === 'down' && positive && "text-red-500",
          trend === 'neutral' && "text-muted-foreground"
        )}>
          {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : 
           trend === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
          <span data-testid={testId ? `${testId}-trend` : undefined}>{trendValue}</span>
        </div>
      )}
    </div>
  );
}

export function PLDashboardWidget({ compact = false }: { compact?: boolean }) {
  const { data: response, isLoading, refetch, isRefetching } = useQuery<{ success: boolean; data: PLSummary }>({
    queryKey: ['/api/finance/pl/summary'],
    refetchInterval: 5 * 60 * 1000,
  });

  const summary = response?.data;

  if (isLoading) {
    return (
      <Card data-testid="card-pl-widget-loading">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card data-testid="card-pl-widget-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-cyan-500" />
            Profit & Loss
          </CardTitle>
          <CardDescription>No financial data available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Start tracking invoices and expenses to see your P&L summary.
          </p>
        </CardContent>
      </Card>
    );
  }

  const profitPositive = summary.netProfit >= 0;
  const marginGood = summary.marginPercent >= 15;
  const alertCount = summary.alerts?.length || 0;

  if (compact) {
    return (
      <Card data-testid="card-pl-widget-compact" className="hover-elevate">
        <Link href="/financial-intelligence" data-testid="link-pl-details">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-gradient-to-br from-teal-400 to-cyan-500">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">P&L Summary</CardTitle>
                <CardDescription className="text-xs">This period</CardDescription>
              </div>
            </div>
            {alertCount > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                {alertCount} Alert{alertCount > 1 ? 's' : ''}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold font-mono">{formatCurrency(summary.netProfit)}</p>
                <p className="text-xs text-muted-foreground">Net Profit</p>
              </div>
              <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium",
                marginGood ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
              )}>
                {marginGood ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {summary.marginPercent.toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Link>
      </Card>
    );
  }

  return (
    <Card data-testid="card-pl-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-cyan-500" />
            Financial Intelligence
          </CardTitle>
          <CardDescription>
            P&L Summary • {new Date(summary.periodStart).toLocaleDateString()} - {new Date(summary.periodEnd).toLocaleDateString()}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-pl"
          >
            <RefreshCcw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
          </Button>
          <Link href="/financial-intelligence">
            <Button variant="outline" size="sm" data-testid="button-view-pl-details">
              View Details <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard 
            label="Revenue" 
            value={formatCurrency(summary.revenueTotal)}
            icon={DollarSign}
            positive
            testId="metric-revenue"
          />
          <MetricCard 
            label="Payroll" 
            value={formatCurrency(summary.payrollTotal)}
            icon={DollarSign}
            positive={false}
            testId="metric-payroll"
          />
          <MetricCard 
            label="Net Profit" 
            value={formatCurrency(summary.netProfit)}
            icon={profitPositive ? TrendingUp : TrendingDown}
            positive={profitPositive}
            testId="metric-net-profit"
          />
          <MetricCard 
            label="Margin" 
            value={`${summary.marginPercent.toFixed(1)}%`}
            icon={PieChart}
            positive={marginGood}
            testId="metric-margin"
          />
        </div>

        {summary.aiInsights && summary.aiInsights.length > 0 && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20" data-testid="card-ai-insight-preview">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-purple-500">Trinity AI Insight</span>
            </div>
            <p className="text-sm text-foreground" data-testid="text-ai-insight">{summary.aiInsights[0]}</p>
          </div>
        )}

        {alertCount > 0 && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-500">
                  {alertCount} Financial Alert{alertCount > 1 ? 's' : ''}
                </span>
              </div>
              <Link href="/financial-intelligence?tab=alerts" data-testid="link-view-alerts">
                <Button variant="ghost" size="sm" data-testid="button-view-alerts">
                  View <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Outstanding: {formatCurrency(summary.outstandingAmount)}</span>
            <span>•</span>
            <span>Collected: {formatCurrency(summary.collectedAmount)}</span>
          </div>
          <Badge 
            variant="outline" 
            className={cn(
              summary.quickbooksStatus === 'connected' 
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                : "bg-slate-500/10 text-slate-500 border-slate-500/30"
            )}
          >
            QB {summary.quickbooksStatus === 'connected' ? 'Synced' : 'Not Connected'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default PLDashboardWidget;
