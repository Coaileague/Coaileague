import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Coins, 
  TrendingUp, 
  TrendingDown,
  Cpu, 
  Zap,
  Clock,
  Target,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Activity,
  Sparkles,
  DollarSign
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

interface CreditSummary {
  currentBalance: number;
  lifetimePurchased: number;
  lifetimeUsed: number;
  averageDailyUsage: number;
  projectedDaysRemaining: number;
  lowBalanceWarning: boolean;
  lastPurchaseDate: string | null;
  lastUsageDate: string | null;
}

interface UsageCategory {
  category: string;
  creditsUsed: number;
  transactionCount: number;
  percentageOfTotal: number;
}

interface DailyTrend {
  date: string;
  creditsUsed: number;
  transactionCount: number;
  aiTasksCompleted: number;
}

interface AITaskAnalytics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  successRate: number;
  totalCreditsUsed: number;
  averageCreditsPerTask: number;
  fastModeTasks: number;
  normalModeTasks: number;
  topAgentsByUsage: { agentName: string; taskCount: number; creditsUsed: number }[];
}

interface ROIMetrics {
  totalCreditsSpent: number;
  estimatedHoursSaved: number;
  estimatedLaborCostSaved: number;
  costPerHourSaved: number;
  automationROI: number;
  topValueFeatures: { feature: string; usage: number; estimatedValue: number }[];
}

interface CreditTransaction {
  id: string;
  type: string;
  credits: number;
  balanceAfter: number;
  description: string;
  actionType: string | null;
  createdAt: string;
}

interface FullReport {
  period: string;
  periodStart: string;
  periodEnd: string;
  creditSummary: CreditSummary;
  usageByCategory: UsageCategory[];
  dailyTrends: DailyTrend[];
  aiTaskAnalytics: AITaskAnalytics;
  roiMetrics: ROIMetrics;
  recentTransactions: CreditTransaction[];
}

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function CreditAnalyticsDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, isLoading: accessLoading } = useWorkspaceAccess();
  const [period, setPeriod] = useState('last_30_days');

  const { data: reportData, isLoading, error } = useQuery<{ success: boolean; data: FullReport }>({
    queryKey: [`/api/analytics/owner/full-report?period=${period}`],
    enabled: isAuthenticated,
  });

  const report = reportData?.data;

  if (authLoading || !isAuthenticated || accessLoading) {
    return <ResponsiveLoading message="Loading Credit Analytics..." />;
  }

  if (workspaceRole !== 'org_owner' && workspaceRole !== 'org_admin') {
    return (
      <WorkspaceLayout>
        <div className="flex items-center justify-center h-full">
          <Alert variant="destructive" className="max-w-md" data-testid="alert-permission-denied">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              Only organization owners and administrators can view credit analytics.
            </AlertDescription>
          </Alert>
        </div>
      </WorkspaceLayout>
    );
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <WorkspaceLayout>
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="page-credit-analytics">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              <span className="flex items-center gap-2">
                <Sparkles className="h-7 w-7 text-primary" />
                Trinity Credit Analytics
              </span>
            </h1>
            <p className="text-muted-foreground mt-1" data-testid="text-page-description">
              Track AI credit usage, ROI metrics, and automation insights
            </p>
          </div>
          
          <Select value={period} onValueChange={setPeriod} data-testid="select-period">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_7_days">Last 7 Days</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_quarter">This Quarter</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Loading credit analytics...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive" data-testid="alert-load-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to Load Analytics</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unable to fetch credit analytics.'}
            </AlertDescription>
          </Alert>
        )}

        {report && !isLoading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-credit-balance">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Credit Balance
                  </CardTitle>
                  <Coins className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-credit-balance">
                    {formatNumber(report.creditSummary.currentBalance)}
                  </div>
                  {report.creditSummary.lowBalanceWarning && (
                    <Badge variant="destructive" className="mt-2" data-testid="badge-low-balance">
                      Low Balance
                    </Badge>
                  )}
                  {!report.creditSummary.lowBalanceWarning && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ~{report.creditSummary.projectedDaysRemaining} days remaining
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-daily-usage">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg Daily Usage
                  </CardTitle>
                  <Activity className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-daily-usage">
                    {report.creditSummary.averageDailyUsage.toFixed(1)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    credits per day
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-success-rate">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    AI Success Rate
                  </CardTitle>
                  <Target className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-success-rate">
                    {report.aiTaskAnalytics.successRate}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {report.aiTaskAnalytics.completedTasks} of {report.aiTaskAnalytics.totalTasks} tasks
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-roi">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Automation ROI
                  </CardTitle>
                  {report.roiMetrics.automationROI >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${report.roiMetrics.automationROI >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-roi">
                    {report.roiMetrics.automationROI >= 0 ? '+' : ''}{report.roiMetrics.automationROI}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    vs labor costs
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList data-testid="tabs-analytics">
                <TabsTrigger value="overview" data-testid="tab-overview">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="roi" data-testid="tab-roi">
                  <DollarSign className="h-4 w-4 mr-2" />
                  ROI Insights
                </TabsTrigger>
                <TabsTrigger value="ai-tasks" data-testid="tab-ai-tasks">
                  <Cpu className="h-4 w-4 mr-2" />
                  AI Tasks
                </TabsTrigger>
                <TabsTrigger value="transactions" data-testid="tab-transactions">
                  <Coins className="h-4 w-4 mr-2" />
                  Transactions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card data-testid="card-usage-trends">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        Daily Credit Usage
                      </CardTitle>
                      <CardDescription>Credits consumed per day</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={report.dailyTrends}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis 
                              dataKey="date" 
                              tickFormatter={formatDate}
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip 
                              formatter={(value: number) => [formatNumber(value), 'Credits']}
                              labelFormatter={formatDate}
                            />
                            <Bar 
                              dataKey="creditsUsed" 
                              fill="hsl(var(--primary))" 
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-usage-by-category">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChart className="h-5 w-5 text-primary" />
                        Usage by Category
                      </CardTitle>
                      <CardDescription>Credit distribution by action type</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        {report.usageByCategory.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                              <Pie
                                data={report.usageByCategory}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ category, percentageOfTotal }) => `${category}: ${percentageOfTotal}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="creditsUsed"
                                nameKey="category"
                              >
                                {report.usageByCategory.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => [formatNumber(value), 'Credits']} />
                            </RePieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-muted-foreground">
                            No usage data available
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card data-testid="card-tasks-trend">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" />
                      AI Tasks Completed Over Time
                    </CardTitle>
                    <CardDescription>Daily task completion trends</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={report.dailyTrends}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={formatDate}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip 
                            formatter={(value: number) => [formatNumber(value), 'Tasks']}
                            labelFormatter={formatDate}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="aiTasksCompleted" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={{ fill: 'hsl(var(--primary))' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="roi" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card data-testid="card-hours-saved">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Hours Saved
                      </CardTitle>
                      <Clock className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-500" data-testid="text-hours-saved">
                        {report.roiMetrics.estimatedHoursSaved.toFixed(1)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        estimated work hours
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-labor-saved">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Labor Cost Saved
                      </CardTitle>
                      <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-500" data-testid="text-labor-saved">
                        {formatCurrency(report.roiMetrics.estimatedLaborCostSaved)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        at $50/hour rate
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-cost-per-hour">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Cost Per Hour Saved
                      </CardTitle>
                      <Target className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold" data-testid="text-cost-per-hour">
                        ${report.roiMetrics.costPerHourSaved.toFixed(2)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        credit cost efficiency
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card data-testid="card-value-features">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Top Value Features
                    </CardTitle>
                    <CardDescription>Features delivering the most ROI</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {report.roiMetrics.topValueFeatures.map((feature, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`row-feature-${index}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                              index === 0 ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-300' :
                              index === 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' :
                              'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300'
                            }`}>
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium">{feature.feature}</p>
                              <p className="text-xs text-muted-foreground">{formatNumber(feature.usage)} uses</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-500">{formatCurrency(feature.estimatedValue)}</p>
                            <p className="text-xs text-muted-foreground">estimated value</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Alert data-testid="alert-roi-info">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>ROI Calculation Method</AlertTitle>
                  <AlertDescription>
                    ROI is calculated by comparing credit costs ($0.01/credit) against estimated labor savings
                    (assuming 15 minutes per automated task at $50/hour). Actual savings may vary based on task complexity.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="ai-tasks" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="card-total-tasks">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Tasks
                      </CardTitle>
                      <Cpu className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-total-tasks">
                        {formatNumber(report.aiTaskAnalytics.totalTasks)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-fast-mode-tasks">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Fast Mode Tasks
                      </CardTitle>
                      <Zap className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-500" data-testid="text-fast-mode">
                        {formatNumber(report.aiTaskAnalytics.fastModeTasks)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        premium execution
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-avg-credits">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Avg Credits/Task
                      </CardTitle>
                      <Coins className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-avg-credits">
                        {report.aiTaskAnalytics.averageCreditsPerTask.toFixed(1)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-failed-tasks">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Failed Tasks
                      </CardTitle>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-500" data-testid="text-failed-tasks">
                        {formatNumber(report.aiTaskAnalytics.failedTasks)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        refunds applied
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card data-testid="card-top-agents">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-primary" />
                      Top AI Agents by Usage
                    </CardTitle>
                    <CardDescription>Which AI subagents are working hardest</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {report.aiTaskAnalytics.topAgentsByUsage.length > 0 ? (
                      <div className="space-y-3">
                        {report.aiTaskAnalytics.topAgentsByUsage.map((agent, index) => (
                          <div key={index} className="flex items-center gap-4" data-testid={`row-agent-${index}`}>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{agent.agentName}</span>
                                <span className="text-sm text-muted-foreground">{formatNumber(agent.taskCount)} tasks</span>
                              </div>
                              <Progress 
                                value={(agent.taskCount / report.aiTaskAnalytics.totalTasks) * 100} 
                                className="h-2"
                              />
                            </div>
                            <Badge variant="secondary" className="ml-2">
                              {formatNumber(agent.creditsUsed)} credits
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-6">No agent data available</p>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card data-testid="card-task-modes">
                    <CardHeader>
                      <CardTitle>Execution Mode Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm flex items-center gap-2">
                              <Zap className="h-4 w-4 text-amber-500" />
                              Fast Mode
                            </span>
                            <span className="text-sm font-medium">{formatNumber(report.aiTaskAnalytics.fastModeTasks)}</span>
                          </div>
                          <Progress 
                            value={report.aiTaskAnalytics.totalTasks > 0 
                              ? (report.aiTaskAnalytics.fastModeTasks / report.aiTaskAnalytics.totalTasks) * 100 
                              : 0}
                            className="h-2"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm flex items-center gap-2">
                              <Cpu className="h-4 w-4 text-primary" />
                              Normal Mode
                            </span>
                            <span className="text-sm font-medium">{formatNumber(report.aiTaskAnalytics.normalModeTasks)}</span>
                          </div>
                          <Progress 
                            value={report.aiTaskAnalytics.totalTasks > 0 
                              ? (report.aiTaskAnalytics.normalModeTasks / report.aiTaskAnalytics.totalTasks) * 100 
                              : 0}
                            className="h-2"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-task-success">
                    <CardHeader>
                      <CardTitle>Task Success Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              Completed
                            </span>
                            <span className="text-sm font-medium">{formatNumber(report.aiTaskAnalytics.completedTasks)}</span>
                          </div>
                          <Progress 
                            value={report.aiTaskAnalytics.successRate}
                            className="h-2"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-red-500" />
                              Failed
                            </span>
                            <span className="text-sm font-medium">{formatNumber(report.aiTaskAnalytics.failedTasks)}</span>
                          </div>
                          <Progress 
                            value={report.aiTaskAnalytics.totalTasks > 0 
                              ? (report.aiTaskAnalytics.failedTasks / report.aiTaskAnalytics.totalTasks) * 100 
                              : 0}
                            className="h-2"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="transactions" className="space-y-4">
                <Card data-testid="card-recent-transactions">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Coins className="h-5 w-5 text-primary" />
                      Recent Credit Transactions
                    </CardTitle>
                    <CardDescription>Latest credit movements in your account</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {report.recentTransactions.length > 0 ? (
                      <div className="space-y-2">
                        {report.recentTransactions.map((tx, index) => (
                          <div 
                            key={tx.id || index} 
                            className="flex items-center justify-between p-3 border rounded-lg hover-elevate"
                            data-testid={`row-transaction-${index}`}
                          >
                            <div className="flex items-center gap-3">
                              {tx.credits > 0 ? (
                                <ArrowUpRight className="h-5 w-5 text-green-500" />
                              ) : (
                                <ArrowDownRight className="h-5 w-5 text-red-500" />
                              )}
                              <div>
                                <p className="font-medium text-sm">{tx.description || tx.type}</p>
                                <p className="text-xs text-muted-foreground">
                                  {tx.actionType || tx.type} · {new Date(tx.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${tx.credits > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {tx.credits > 0 ? '+' : ''}{formatNumber(tx.credits)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Balance: {formatNumber(tx.balanceAfter)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-6">No recent transactions</p>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card data-testid="card-lifetime-purchased">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Lifetime Purchased
                      </CardTitle>
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-500" data-testid="text-lifetime-purchased">
                        {formatNumber(report.creditSummary.lifetimePurchased)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        total credits bought
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-lifetime-used">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Lifetime Used
                      </CardTitle>
                      <ArrowDownRight className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-lifetime-used">
                        {formatNumber(report.creditSummary.lifetimeUsed)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        total credits consumed
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
