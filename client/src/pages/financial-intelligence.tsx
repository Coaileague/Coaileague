import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
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
  CheckCircle,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Building2,
  Clock,
  Wallet,
  GitBranch,
  MapPin,
  ToggleLeft,
  ToggleRight
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

interface ConsolidatedBranch {
  workspaceId: string;
  workspaceName: string;
  subOrgLabel: string | null;
  operatingStates: string[];
  primaryOperatingState: string | null;
  summary: PLSummary;
}

interface ConsolidatedPL {
  combined: PLSummary;
  branches: ConsolidatedBranch[];
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

import { CHART_PALETTE, CHART_SERIES } from "@/lib/chartPalette";

function formatFullCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const COLORS = CHART_SERIES;

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
        <div className="flex items-start justify-between gap-2">
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
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-cyan-500" />
                  <span className="text-sm font-medium">Invoiced</span>
                </div>
                <span className="font-mono font-semibold">{formatFullCurrency(summary.invoicedAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">Collected</span>
                </div>
                <span className="font-mono font-semibold">{formatFullCurrency(summary.collectedAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-teal-500/10 border border-teal-500/20">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-500" />
                  <span className="text-sm font-medium">Outstanding</span>
                </div>
                <span className="font-mono font-semibold text-teal-600">{formatFullCurrency(summary.outstandingAmount)}</span>
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
        <Card className="border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-cyan-500/5" data-testid="card-ai-insights">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5 text-blue-500" />
              <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                Trinity AI Insights
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.aiInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
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
                <Bar dataKey="Revenue" fill={CHART_PALETTE.SUCCESS} />
                <Bar dataKey="Expenses" fill={CHART_PALETTE.DANGER} />
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
                <Line yAxisId="left" type="monotone" dataKey="Profit" stroke={CHART_PALETTE.SUCCESS} strokeWidth={2} dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="Margin" stroke={CHART_PALETTE.SECONDARY} strokeWidth={2} dot={{ r: 4 }} />
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

function ConsolidatedTab() {
  const [viewMode, setViewMode] = useState<'individual' | 'combined'>('individual');
  
  const { data: response, isLoading } = useQuery<{ success: boolean; data: ConsolidatedPL }>({
    queryKey: ['/api/finance/pl/consolidated'],
  });

  const consolidated = response?.data;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  if (!consolidated || consolidated.branches.length <= 1) {
    return (
      <Card data-testid="card-no-suborgs">
        <CardContent className="py-12 text-center">
          <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No sub-organizations found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create sub-orgs (branches) to see consolidated P&L across your organization
          </p>
        </CardContent>
      </Card>
    );
  }

  const stateGroups: Record<string, ConsolidatedBranch[]> = {};
  for (const branch of consolidated.branches) {
    const state = branch.primaryOperatingState || 'Other';
    if (!stateGroups[state]) stateGroups[state] = [];
    stateGroups[state].push(branch);
  }
  const sortedStates = Object.keys(stateGroups).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          <span>{consolidated.branches.length} branches across {sortedStates.length} state{sortedStates.length !== 1 ? 's' : ''}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setViewMode(viewMode === 'individual' ? 'combined' : 'individual')}
          data-testid="button-toggle-view-mode"
        >
          {viewMode === 'individual' ? <ToggleLeft className="h-4 w-4 mr-2" /> : <ToggleRight className="h-4 w-4 mr-2" />}
          {viewMode === 'individual' ? 'Per-Branch' : 'Combined'}
        </Button>
      </div>

      {viewMode === 'combined' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Revenue"
              value={formatCurrency(consolidated.combined.revenueTotal)}
              subValue={`${consolidated.branches.length} branches`}
              icon={DollarSign}
              positive
            />
            <MetricCard
              label="Total Payroll"
              value={formatCurrency(consolidated.combined.payrollTotal)}
              subValue={`OT: ${formatCurrency(consolidated.combined.expenseBreakdown.overtime)}`}
              icon={Users}
              positive={false}
            />
            <MetricCard
              label="Combined Net Profit"
              value={formatCurrency(consolidated.combined.netProfit)}
              subValue={`Gross: ${formatCurrency(consolidated.combined.grossProfit)}`}
              icon={consolidated.combined.netProfit >= 0 ? TrendingUp : TrendingDown}
              positive={consolidated.combined.netProfit >= 0}
            />
            <MetricCard
              label="Combined Margin"
              value={`${consolidated.combined.marginPercent.toFixed(1)}%`}
              subValue={consolidated.combined.marginPercent >= 15 ? 'Above target' : 'Below 15% target'}
              icon={PieChart}
              positive={consolidated.combined.marginPercent >= 15}
            />
          </div>

          <Card data-testid="card-combined-bar">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-cyan-500" />
                Revenue by Branch
              </CardTitle>
              <CardDescription>Contribution per branch</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={consolidated.branches.map(b => ({
                  name: b.subOrgLabel || b.workspaceName,
                  Revenue: b.summary.revenueTotal,
                  Expenses: b.summary.payrollTotal + b.summary.expenseTotal,
                  Profit: b.summary.netProfit,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(value: number) => formatFullCurrency(value)} />
                  <Legend />
                  <Bar dataKey="Revenue" fill={CHART_PALETTE.BRAND} />
                  <Bar dataKey="Expenses" fill={CHART_PALETTE.DANGER} />
                  <Bar dataKey="Profit" fill={CHART_PALETTE.SUCCESS} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedStates.map(state => (
            <div key={state} className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                  {state === 'Other' ? 'No State Assigned' : state}
                </h3>
                <Badge variant="secondary">{stateGroups[state].length}</Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {stateGroups[state].map(branch => {
                  const s = branch.summary;
                  const profitPositive = s.netProfit >= 0;
                  const marginGood = s.marginPercent >= 15;
                  return (
                    <Card
                      key={branch.workspaceId}
                      className="hover-elevate"
                      data-testid={`card-branch-${branch.workspaceId}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">
                              {branch.subOrgLabel || branch.workspaceName}
                            </CardTitle>
                            {branch.operatingStates.length > 0 && (
                              <CardDescription className="flex items-center gap-1 flex-wrap mt-1">
                                {branch.operatingStates.map(st => (
                                  <Badge key={st} variant="outline" className="text-xs">{st}</Badge>
                                ))}
                              </CardDescription>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              marginGood
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            )}
                          >
                            {s.marginPercent.toFixed(1)}%
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Revenue</p>
                            <p className="font-mono font-semibold">{formatCurrency(s.revenueTotal)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Expenses</p>
                            <p className="font-mono font-semibold">{formatCurrency(s.payrollTotal + s.expenseTotal)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Net Profit</p>
                            <p className={cn(
                              "font-mono font-semibold flex items-center gap-1",
                              profitPositive ? "text-emerald-600" : "text-red-600"
                            )}>
                              {profitPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {formatCurrency(s.netProfit)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Margin</p>
                            <p className={cn(
                              "font-mono font-semibold",
                              marginGood ? "text-emerald-600" : "text-amber-600"
                            )}>
                              {s.marginPercent.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
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
    warning: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-500', icon: AlertTriangle },
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
                      <Sparkles className="h-3 w-3 text-blue-500" />
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
  
  const { data: response, isLoading } = useQuery<{ success: boolean; data: PLSummary }>({
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

  const actionButtons = (
    <Button
      variant="default"
      onClick={() => generateInsightsMutation.mutate()}
      disabled={generateInsightsMutation.isPending || !summary}
      className="bg-gradient-to-r from-blue-500 to-cyan-500"
      data-testid="button-generate-insights"
    >
      <Brain className="h-4 w-4 mr-2" />
      {generateInsightsMutation.isPending ? "Analyzing..." : "Generate Insights"}
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'financial-intelligence',
    title: 'Financial Intelligence',
    subtitle: 'Real-time P&L analysis with Trinity AI insights',
    // @ts-expect-error — TS migration: fix in refactoring sprint
    category: 'workspace',
    headerActions: actionButtons,
  };

  return (
    <CanvasHubPage config={pageConfig}>

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
              <TabsTrigger value="consolidated" data-testid="tab-consolidated">
                <GitBranch className="h-4 w-4 mr-1" />
                Consolidated
              </TabsTrigger>
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
            
            <TabsContent value="consolidated" className="mt-6">
              <ConsolidatedTab />
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

      <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground pt-4 border-t border-border">
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
    </CanvasHubPage>
  );
}
