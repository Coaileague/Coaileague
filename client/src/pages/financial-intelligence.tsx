import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  Users,
  AlertTriangle,
  Brain,
  RefreshCcw,
  CheckCircle,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Building2,
  Clock,
  Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart as RechartsPie,
  Pie,
  Cell
} from "recharts";

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

interface TrendData {
  periodStart: string;
  periodEnd: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}

interface ClientProfitability {
  clientId: string;
  clientName: string;
  revenue: number;
  laborCost: number;
  directExpenses: number;
  grossProfit: number;
  marginPercent: number;
  invoicedHours: number;
  actualHours: number;
  effectiveBillRate: number;
  isUnderperforming: boolean;
}

interface FinancialAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  message: string;
  actionSuggestion?: string;
  metricValue?: number;
  detectedAt: string;
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

function formatFullCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const COLORS = ['#2dd4bf', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

function MetricCard({ 
  label, 
  value, 
  subValue,
  icon: Icon,
  positive = true,
  className
}: { 
  label: string;
  value: string;
  subValue?: string;
  icon: typeof DollarSign;
  positive?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("hover-elevate", className)} data-testid={`card-metric-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium mb-1">{label}</p>
            <p className="text-2xl font-bold font-mono">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
            )}
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            positive ? "bg-emerald-500/10" : "bg-red-500/10"
          )}>
            <Icon className={cn("h-5 w-5", positive ? "text-emerald-500" : "text-red-500")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PLOverviewTab({ summary }: { summary: PLSummary }) {
  const profitPositive = summary.netProfit >= 0;
  const marginGood = summary.marginPercent >= 15;
  
  const expenseData = [
    { name: 'Payroll', value: summary.expenseBreakdown.payroll },
    { name: 'Insurance', value: summary.expenseBreakdown.insurance },
    { name: 'Equipment', value: summary.expenseBreakdown.equipment },
    { name: 'Admin', value: summary.expenseBreakdown.admin },
    { name: 'Other', value: summary.expenseBreakdown.other },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label="Revenue" 
          value={formatCurrency(summary.revenueTotal)}
          subValue={`Invoiced: ${formatCurrency(summary.invoicedAmount)}`}
          icon={DollarSign}
          positive
        />
        <MetricCard 
          label="Payroll Costs" 
          value={formatCurrency(summary.payrollTotal)}
          subValue={`Overtime: ${formatCurrency(summary.expenseBreakdown.overtime)}`}
          icon={Users}
          positive={false}
        />
        <MetricCard 
          label="Net Profit" 
          value={formatCurrency(summary.netProfit)}
          subValue={`Gross: ${formatCurrency(summary.grossProfit)}`}
          icon={profitPositive ? TrendingUp : TrendingDown}
          positive={profitPositive}
        />
        <MetricCard 
          label="Profit Margin" 
          value={`${summary.marginPercent.toFixed(1)}%`}
          subValue={marginGood ? "Above target" : "Below 15% target"}
          icon={PieChart}
          positive={marginGood}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card data-testid="card-revenue-breakdown">
          <CardHeader>
            <CardTitle className="text-base">Revenue Breakdown</CardTitle>
            <CardDescription>Invoiced vs Collected</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-cyan-500" />
                  <span className="text-sm font-medium">Invoiced</span>
                </div>
                <span className="font-mono font-semibold">{formatFullCurrency(summary.invoicedAmount)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">Collected</span>
                </div>
                <span className="font-mono font-semibold">{formatFullCurrency(summary.collectedAmount)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Outstanding</span>
                </div>
                <span className="font-mono font-semibold text-amber-600">{formatFullCurrency(summary.outstandingAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-expense-breakdown">
          <CardHeader>
            <CardTitle className="text-base">Expense Distribution</CardTitle>
            <CardDescription>By category</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPie>
                  <Pie
                    data={expenseData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {expenseData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatFullCurrency(value)} />
                </RechartsPie>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No expense data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.aiInsights && summary.aiInsights.length > 0 && (
        <Card className="border-purple-500/20 bg-gradient-to-r from-purple-500/5 to-cyan-500/5" data-testid="card-ai-insights">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5 text-purple-500" />
              <span className="bg-gradient-to-r from-purple-500 to-cyan-500 bg-clip-text text-transparent">
                Trinity AI Insights
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.aiInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TrendsTab() {
  const { data: response, isLoading } = useQuery<{ success: boolean; data: TrendData[] }>({
    queryKey: ['/api/finance/pl/trends'],
  });

  const trends = response?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const chartData = trends.map(t => ({
    period: new Date(t.periodStart).toLocaleDateString('en-US', { month: 'short' }),
    Revenue: t.revenue,
    Expenses: t.expenses,
    Profit: t.profit,
    Margin: t.margin
  }));

  return (
    <div className="space-y-6">
      <Card data-testid="card-revenue-trend">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-cyan-500" />
            Revenue vs Expenses Trend
          </CardTitle>
          <CardDescription>Last 6 periods</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip formatter={(value: number) => formatFullCurrency(value)} />
                <Legend />
                <Bar dataKey="Revenue" fill="#2dd4bf" />
                <Bar dataKey="Expenses" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No trend data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-profit-margin-trend">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Profit & Margin Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="period" />
                <YAxis yAxisId="left" tickFormatter={(v) => formatCurrency(v)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value: number, name: string) => 
                  name === 'Margin' ? `${value.toFixed(1)}%` : formatFullCurrency(value)
                } />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="Profit" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="Margin" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No trend data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientsTab() {
  const { data: response, isLoading } = useQuery<{ success: boolean; data: ClientProfitability[] }>({
    queryKey: ['/api/finance/pl/clients'],
  });

  const clients = response?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card data-testid="card-no-clients">
        <CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No client data available</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add clients and track invoices to see profitability analysis
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {clients.map(client => (
          <Card 
            key={client.clientId} 
            className={cn(
              "hover-elevate",
              client.isUnderperforming && "border-amber-500/30"
            )}
            data-testid={`card-client-${client.clientId}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{client.clientName}</h3>
                    {client.isUnderperforming && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                        Underperforming
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-mono font-medium">{formatFullCurrency(client.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Labor Cost</p>
                      <p className="font-mono font-medium">{formatFullCurrency(client.laborCost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Gross Profit</p>
                      <p className={cn(
                        "font-mono font-medium",
                        client.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>{formatFullCurrency(client.grossProfit)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Margin</p>
                      <p className={cn(
                        "font-mono font-medium flex items-center gap-1",
                        client.marginPercent >= 15 ? "text-emerald-600" : "text-amber-600"
                      )}>
                        {client.marginPercent >= 15 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {client.marginPercent.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Effective Rate</p>
                  <p className="font-mono font-semibold text-lg">${client.effectiveBillRate.toFixed(2)}/hr</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AlertsTab() {
  const { toast } = useToast();
  const { data: response, isLoading } = useQuery<{ success: boolean; data: FinancialAlert[] }>({
    queryKey: ['/api/finance/pl/alerts'],
  });

  const dismissMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest('POST', `/api/finance/pl/alerts/${alertId}/dismiss`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/pl/alerts'] });
      toast({ title: "Alert dismissed" });
    }
  });

  const alerts = response?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card data-testid="card-no-alerts">
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-emerald-500/50 mb-4" />
          <p className="text-muted-foreground">No active alerts</p>
          <p className="text-sm text-muted-foreground mt-1">
            Financial health is looking good
          </p>
        </CardContent>
      </Card>
    );
  }

  const severityConfig = {
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-500', icon: AlertTriangle },
    warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-500', icon: AlertTriangle },
    info: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-500', icon: Brain },
  };

  return (
    <div className="space-y-4">
      {alerts.map(alert => {
        const config = severityConfig[alert.severity] || severityConfig.info;
        const Icon = config.icon;
        
        return (
          <Card 
            key={alert.id} 
            className={cn("border", config.border)}
            data-testid={`card-alert-${alert.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", config.bg)}>
                  <Icon className={cn("h-4 w-4", config.text)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{alert.title}</h3>
                    <Badge variant="outline" className={cn(config.bg, config.text, config.border)}>
                      {alert.severity}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{alert.category}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  {alert.actionSuggestion && (
                    <p className="text-sm text-foreground mt-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-purple-500" />
                      {alert.actionSuggestion}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissMutation.mutate(alert.id)}
                  disabled={dismissMutation.isPending}
                  data-testid={`button-dismiss-alert-${alert.id}`}
                >
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function FinancialIntelligence() {
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();
  
  const { data: response, isLoading, refetch, isRefetching } = useQuery<{ success: boolean; data: PLSummary }>({
    queryKey: ['/api/finance/pl/summary'],
  });

  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/finance/pl/insights', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/pl/summary'] });
      toast({
        title: "AI Insights Generated",
        description: "Trinity AI has analyzed your financial data"
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate insights"
      });
    }
  });

  const summary = response?.data;

  return (
    <WorkspaceLayout>
      <div className="container max-w-7xl py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <PieChart className="h-6 w-6 text-cyan-500" />
              Financial Intelligence
            </h1>
            <p className="text-muted-foreground">
              Real-time P&L analysis with Trinity AI insights
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isRefetching}
              data-testid="button-refresh"
            >
              <RefreshCcw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="default"
              onClick={() => generateInsightsMutation.mutate()}
              disabled={generateInsightsMutation.isPending || !summary}
              className="bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600"
              data-testid="button-generate-insights"
            >
              <Brain className="h-4 w-4 mr-2" />
              {generateInsightsMutation.isPending ? "Analyzing..." : "Generate Insights"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-[400px]" />
          </div>
        ) : summary ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start" data-testid="tabs-financial">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
              <TabsTrigger value="clients" data-testid="tab-clients">Client Profitability</TabsTrigger>
              <TabsTrigger value="alerts" data-testid="tab-alerts">
                Alerts
                {summary.alerts && summary.alerts.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                    {summary.alerts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="mt-6">
              <PLOverviewTab summary={summary} />
            </TabsContent>
            
            <TabsContent value="trends" className="mt-6">
              <TrendsTab />
            </TabsContent>
            
            <TabsContent value="clients" className="mt-6">
              <ClientsTab />
            </TabsContent>
            
            <TabsContent value="alerts" className="mt-6">
              <AlertsTab />
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <PieChart className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No financial data available</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start tracking invoices and expenses to see your financial analysis
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                summary?.quickbooksStatus === 'connected' 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : "bg-slate-500/10 text-slate-500 border-slate-500/30"
              )}
            >
              QuickBooks {summary?.quickbooksStatus === 'connected' ? 'Connected' : 'Not Connected'}
            </Badge>
          </div>
          {summary?.lastUpdated && (
            <span>Last updated: {new Date(summary.lastUpdated).toLocaleString()}</span>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
