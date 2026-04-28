import { useState } from "react";
import { secureFetch } from "@/lib/csrf";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { AiUsageDashboard } from "@/components/billing/AiUsageDashboard";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {Eye, Users, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Cpu,
  DollarSign,
  BarChart3,
  Download,
  AlertCircle,
  CheckCircle2,
  Info,
  Zap,
  Target,
  UserCheck,
  Clock,
  Crown,
  Shield,
  Sparkles,
  FileCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Scale
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

interface OwnerDashboardOverview {
  period: string;
  periodStart: string;
  periodEnd: string;
  activeUsers: number;
  totalUsers: number;
  userGrowthPercent: number;
  totalSessions: number;
  avgSessionsPerUser: number;
  sessionGrowthPercent: number;
  aiActionsExecuted: number;
  aiSuccessRate: number;
  aiActionsGrowthPercent: number;
  featureAdoptionScore: number;
  topFeatures: FeatureAdoption[];
  estimatedCosts: CostBreakdown;
  costPerActiveUser: number;
  teamActivity: TeamActivitySummary[];
  alerts: UsageAlert[];
}

interface FeatureAdoption {
  featureKey: string;
  featureCategory: string;
  usageCount: number;
  uniqueUsers: number;
  adoptionRate: number;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
}

interface CostBreakdown {
  total: number;
  aiCosts: number;
  partnerApiCosts: number;
  storageCosts: number;
  currency: string;
}

interface TeamActivitySummary {
  userId: string;
  userName: string;
  userRole: string;
  lastActive: string;
  sessionsCount: number;
  actionsCount: number;
  topFeature: string;
}

interface UsageAlert {
  type: 'warning' | 'info' | 'success';
  title: string;
  message: string;
  metric: string;
  value: number;
  threshold?: number;
}

interface UsageTrend {
  date: string;
  activeUsers: number;
  sessions: number;
  aiActions: number;
  pageViews: number;
  costs: number;
}

interface TeamEngagementReport {
  totalTeamMembers: number;
  activeMembers: number;
  engagementRate: number;
  byRole: { role: string; count: number; avgActivity: number }[];
  topPerformers: TeamActivitySummary[];
  inactiveUsers: { userId: string; userName: string; lastActive: string; daysSinceActive: number }[];
  recommendations: string[];
}

interface ReconciliationItem {
  clientId: string;
  clientName: string;
  platformHours: number;
  quickbooksHours: number;
  discrepancyPercent: number;
  status: 'verified' | 'discrepancy' | 'pending';
  invoiceId?: string;
  lastReconciled?: string;
}

interface ReconciliationData {
  items: ReconciliationItem[];
  summary: {
    totalClients: number;
    verifiedCount: number;
    discrepancyCount: number;
    pendingCount: number;
    totalPlatformHours: number;
    totalQuickbooksHours: number;
    overallDiscrepancyPercent: number;
  };
  lastSync: string;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

export default function OwnerAnalytics() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, isLoading: accessLoading } = useWorkspaceAccess();
  const [selectedPeriod, setSelectedPeriod] = useState('last_30_days');
  const [activeTab, setActiveTab] = useState('overview');
  
  const [showWidgets, setShowWidgets] = useState({
    comparisonTable: true,
    discrepancyChart: true,
    verifiedBadges: true,
    auditLog: true,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<{ success: boolean; data: OwnerDashboardOverview }>({
    queryKey: ['/api/analytics/owner/overview', selectedPeriod],
    enabled: isAuthenticated,
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<{ success: boolean; data: UsageTrend[] }>({
    queryKey: ['/api/analytics/owner/trends', selectedPeriod],
    enabled: isAuthenticated && activeTab === 'trends',
  });

  const { data: team, isLoading: teamLoading } = useQuery<{ success: boolean; data: TeamEngagementReport }>({
    queryKey: ['/api/analytics/owner/team', selectedPeriod],
    enabled: isAuthenticated && activeTab === 'team',
  });

  const { data: reconciliation, isLoading: reconciliationLoading } = useQuery<{ success: boolean; data: ReconciliationData }>({
    queryKey: ['/api/analytics/owner/reconciliation', selectedPeriod],
    queryFn: async () => {
      const res = await secureFetch(`/api/analytics/owner/reconciliation?period=${selectedPeriod}`);
      if (!res.ok) throw new Error('Failed to fetch reconciliation data');
      return res.json();
    },
    enabled: isAuthenticated && activeTab === 'reconciliation',
  });

  if (authLoading || !isAuthenticated || accessLoading) {
    return <ResponsiveLoading message="Loading Analytics Dashboard..." />;
  }

  if (workspaceRole !== 'org_owner' && workspaceRole !== 'co_owner') {
    const accessDeniedConfig: CanvasPageConfig = {
      id: 'owner-analytics-denied',
      title: 'Usage Analytics',
      subtitle: 'Executive insights into platform usage and team engagement',
      category: 'admin',
    };
    return (
      <CanvasHubPage config={accessDeniedConfig}>
        <div className="flex items-center justify-center h-full">
          <Alert variant="destructive" className="max-w-md" data-testid="alert-permission-denied">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              Only organization owners and administrators can view usage analytics.
            </AlertDescription>
          </Alert>
        </div>
      </CanvasHubPage>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatPercent = (num: number) => {
    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(1)}%`;
  };

  const handleExport = async () => {
    window.open(`/api/analytics/owner/export?period=${selectedPeriod}&format=csv`, '_blank');
  };

  const data = overview?.data;
  const trendData = trends?.data || [];
  const teamData = team?.data;

  const actionButtons = (
    <div className="flex items-center gap-3">
      <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
        <SelectTrigger className="w-full md:w-[180px]" data-testid="select-period">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="last_7_days">Last 7 Days</SelectItem>
          <SelectItem value="last_30_days">Last 30 Days</SelectItem>
          <SelectItem value="this_month">This Month</SelectItem>
          <SelectItem value="last_month">Last Month</SelectItem>
          <SelectItem value="this_quarter">This Quarter</SelectItem>
          <SelectItem value="this_year">This Year</SelectItem>
        </SelectContent>
      </Select>
      
      <Button variant="outline" onClick={handleExport} data-testid="button-export">
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
    </div>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'owner-analytics',
    title: 'Usage Analytics',
    subtitle: 'Executive insights into platform usage and team engagement',
    category: 'admin',
    headerActions: actionButtons,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="owner-analytics-page">
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent" data-testid="card-trinity-elite">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Trinity Elite</h3>
                    <Badge variant="outline" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Strategic AI
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Profit-optimized scheduling with employee scoring and client tiering
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <div className="font-medium">Employee Scoring</div>
                  <div className="text-muted-foreground">0-100 weighted metrics</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">Client Tiering</div>
                  <div className="text-muted-foreground">Enterprise to Trial</div>
                </div>
                <Button variant="outline" size="sm" asChild data-testid="button-view-resolution-inbox">
                  <a href="/resolution-inbox">
                    <Shield className="h-4 w-4 mr-2" />
                    Automation Health
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {data?.alerts && data.alerts.length > 0 && (
          <div className="space-y-2">
            {data.alerts.slice(0, 3).map((alert, i) => (
              <Alert 
                key={i} 
                variant={alert.type === 'warning' ? 'destructive' : 'default'}
                data-testid={`alert-usage-${i}`}
              >
                {alert.type === 'warning' && <AlertCircle className="h-4 w-4" />}
                {alert.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
                {alert.type === 'info' && <Info className="h-4 w-4" />}
                <AlertTitle>{alert.title}</AlertTitle>
                <AlertDescription>{alert.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full sm:w-auto overflow-x-auto" data-testid="tabs-analytics">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features">Features</TabsTrigger>
            <TabsTrigger value="reconciliation" data-testid="tab-reconciliation">
              <Scale className="h-4 w-4 mr-1" />
              Watchdog
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {overviewLoading ? (
              <ResponsiveLoading message="Loading overview..." />
            ) : data ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="card-active-users">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="value-active-users">
                        {formatNumber(data.activeUsers)}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">of {formatNumber(data.totalUsers)} total</span>
                        <Badge variant={data.userGrowthPercent >= 0 ? 'default' : 'destructive'}>
                          {data.userGrowthPercent >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                          {formatPercent(data.userGrowthPercent)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-sessions">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Sessions</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="value-sessions">
                        {formatNumber(data.totalSessions)}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{data.avgSessionsPerUser} avg/user</span>
                        <Badge variant={data.sessionGrowthPercent >= 0 ? 'default' : 'destructive'}>
                          {formatPercent(data.sessionGrowthPercent)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-ai-actions">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">AI Actions</CardTitle>
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="value-ai-actions">
                        {formatNumber(data.aiActionsExecuted)}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{data.aiSuccessRate}% success</span>
                        <Badge variant={data.aiActionsGrowthPercent >= 0 ? 'default' : 'destructive'}>
                          {formatPercent(data.aiActionsGrowthPercent)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-costs">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Estimated Costs</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="value-costs">
                        {formatCurrency(data.estimatedCosts.total)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(data.costPerActiveUser)}/active user
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card data-testid="card-feature-adoption">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Feature Adoption
                      </CardTitle>
                      <CardDescription>Adoption score: {data.featureAdoptionScore}%</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Progress value={data.featureAdoptionScore} className="mb-4" />
                      <div className="space-y-3">
                        {data.topFeatures.slice(0, 5).map((feature, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{feature.featureCategory}</Badge>
                              <span className="text-sm font-medium">{feature.featureKey}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">{feature.usageCount} uses</span>
                              <Badge variant="secondary">{feature.adoptionRate}%</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-cost-breakdown">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Cost Breakdown
                      </CardTitle>
                      <CardDescription>Resource allocation by type</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'AI Services', value: data.estimatedCosts.aiCosts },
                                { name: 'Partner APIs', value: data.estimatedCosts.partnerApiCosts },
                                { name: 'Storage', value: data.estimatedCosts.storageCosts },
                              ].filter(d => d.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                            >
                              {CHART_COLORS.map((color, index) => (
                                <Cell key={`cell-${index}`} fill={color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card data-testid="card-team-activity">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5" />
                      Top Team Activity
                    </CardTitle>
                    <CardDescription>Most active team members this period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {data.teamActivity.slice(0, 5).map((member, i) => (
                        <div key={i} className="flex items-center justify-between gap-2" data-testid={`row-team-member-${i}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-medium text-sm">
                              {i + 1}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{member.userName}</p>
                              <p className="text-xs text-muted-foreground">{member.userRole}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{formatNumber(member.actionsCount)} actions</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {member.lastActive ? new Date(member.lastActive).toLocaleDateString() : 'N/A'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div data-testid="section-ai-usage-widget">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Trinity AI Usage — This Period
                  </h3>
                  <AiUsageDashboard />
                </div>
              </>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No analytics activity yet</AlertTitle>
                <AlertDescription>
                  No analytics data is available for the selected period yet. Activity will appear here
                  after users, billing events, or Trinity usage start generating history.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            {trendsLoading ? (
              <ResponsiveLoading message="Loading trends..." />
            ) : trendData.length > 0 ? (
              <>
                <Card data-testid="card-usage-trends">
                  <CardHeader>
                    <CardTitle>Usage Trends</CardTitle>
                    <CardDescription>Active users and sessions over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            className="text-muted-foreground"
                          />
                          <YAxis className="text-muted-foreground" />
                          <Tooltip 
                            labelFormatter={(value) => new Date(value).toLocaleDateString()}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                          />
                          <Legend />
                          <Area 
                            type="monotone" 
                            dataKey="activeUsers" 
                            name="Active Users"
                            stroke="hsl(var(--primary))" 
                            fill="hsl(var(--primary)/0.2)" 
                          />
                          <Area 
                            type="monotone" 
                            dataKey="sessions" 
                            name="Sessions"
                            stroke="hsl(var(--secondary))" 
                            fill="hsl(var(--secondary)/0.2)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-ai-trends">
                  <CardHeader>
                    <CardTitle>AI Activity</CardTitle>
                    <CardDescription>AI actions and estimated costs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            className="text-muted-foreground"
                          />
                          <YAxis yAxisId="left" className="text-muted-foreground" />
                          <YAxis yAxisId="right" orientation="right" className="text-muted-foreground" />
                          <Tooltip 
                            labelFormatter={(value) => new Date(value).toLocaleDateString()}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                          />
                          <Legend />
                          <Bar yAxisId="left" dataKey="aiActions" name="AI Actions" fill="hsl(var(--primary))" />
                          <Bar yAxisId="right" dataKey="costs" name="Est. Cost ($)" fill="hsl(var(--accent))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Trend Data</AlertTitle>
                <AlertDescription>No trend data available for the selected period.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            {teamLoading ? (
              <ResponsiveLoading message="Loading team data..." />
            ) : teamData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card data-testid="card-team-members">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Team Members</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{teamData.totalTeamMembers}</div>
                      <div className="text-sm text-muted-foreground">{teamData.activeMembers} active this period</div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-engagement-rate">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Engagement Rate</CardTitle>
                      <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{teamData.engagementRate}%</div>
                      <Progress value={teamData.engagementRate} className="mt-2" />
                    </CardContent>
                  </Card>

                  <Card data-testid="card-inactive-users">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{teamData.inactiveUsers.length}</div>
                      <div className="text-sm text-muted-foreground">users not active this period</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card data-testid="card-activity-by-role">
                    <CardHeader>
                      <CardTitle>Activity by Role</CardTitle>
                      <CardDescription>Average actions per user by role</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={teamData.byRole} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-muted-foreground" />
                            <YAxis dataKey="role" type="category" width={100} className="text-muted-foreground" />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                            <Bar dataKey="avgActivity" name="Avg. Actions" fill="hsl(var(--primary))" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-top-performers">
                    <CardHeader>
                      <CardTitle>Top Performers</CardTitle>
                      <CardDescription>Most active team members</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {teamData.topPerformers.map((performer, i) => (
                          <div key={i} className="flex items-center justify-between gap-2" data-testid={`row-top-performer-${i}`}>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-medium text-sm">
                                {i + 1}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{performer.userName}</p>
                                <p className="text-xs text-muted-foreground">{performer.userRole}</p>
                              </div>
                            </div>
                            <Badge>{formatNumber(performer.actionsCount)} actions</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {teamData.recommendations.length > 0 && (
                  <Card data-testid="card-recommendations">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {teamData.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                            <span className="text-sm">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Team Data</AlertTitle>
                <AlertDescription>No team engagement data available.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            {overviewLoading ? (
              <ResponsiveLoading message="Loading feature data..." />
            ) : data?.topFeatures && data.topFeatures.length > 0 ? (
              <Card data-testid="card-all-features">
                <CardHeader>
                  <CardTitle>Feature Usage</CardTitle>
                  <CardDescription>All tracked features and their adoption rates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.topFeatures.map((feature, i) => (
                      <div key={i} className="flex items-center gap-4" data-testid={`row-feature-${i}`}>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{feature.featureKey}</span>
                              <Badge variant="outline" className="text-xs">{feature.featureCategory}</Badge>
                            </div>
                            <span className="text-sm text-muted-foreground">{feature.adoptionRate}% adoption</span>
                          </div>
                          <Progress value={feature.adoptionRate} className="h-2" />
                        </div>
                        <div className="text-right min-w-[80px]">
                          <p className="text-sm font-medium">{formatNumber(feature.usageCount)}</p>
                          <p className="text-xs text-muted-foreground">{feature.uniqueUsers} users</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Feature Data</AlertTitle>
                <AlertDescription>No feature usage data available for the selected period.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="reconciliation" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-primary" />
                  Financial Watchdog
                </h2>
                <p className="text-sm text-muted-foreground">
                  Platform Hours vs QuickBooks Hours reconciliation
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Button variant="ghost" size="sm" onClick={() => {
                    const allOn = Object.values(showWidgets).every(v => v);
                    setShowWidgets({
                      comparisonTable: !allOn,
                      discrepancyChart: !allOn,
                      verifiedBadges: !allOn,
                      auditLog: !allOn,
                    });
                  }} data-testid="button-toggle-all-widgets">
                    {Object.values(showWidgets).every(v => v) ? (
                      <><EyeOff className="h-4 w-4 mr-1" /> Simple View</>
                    ) : (
                      <><Eye className="h-4 w-4 mr-1" /> Full View</>
                    )}
                  </Button>
                </div>
                <Button variant="outline" size="sm" data-testid="button-refresh-reconciliation">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </Button>
              </div>
            </div>

            <Card className="border-l-4 border-l-primary" data-testid="card-widget-toggles">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Widget Visibility</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="toggle-comparison"
                      checked={showWidgets.comparisonTable}
                      onCheckedChange={(v) => setShowWidgets(prev => ({ ...prev, comparisonTable: v }))}
                      data-testid="switch-comparison-table"
                    />
                    <label htmlFor="toggle-comparison" className="text-sm">Comparison Table</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="toggle-chart"
                      checked={showWidgets.discrepancyChart}
                      onCheckedChange={(v) => setShowWidgets(prev => ({ ...prev, discrepancyChart: v }))}
                      data-testid="switch-discrepancy-chart"
                    />
                    <label htmlFor="toggle-chart" className="text-sm">Discrepancy Chart</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="toggle-badges"
                      checked={showWidgets.verifiedBadges}
                      onCheckedChange={(v) => setShowWidgets(prev => ({ ...prev, verifiedBadges: v }))}
                      data-testid="switch-verified-badges"
                    />
                    <label htmlFor="toggle-badges" className="text-sm">Verified Badges</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="toggle-audit"
                      checked={showWidgets.auditLog}
                      onCheckedChange={(v) => setShowWidgets(prev => ({ ...prev, auditLog: v }))}
                      data-testid="switch-audit-log"
                    />
                    <label htmlFor="toggle-audit" className="text-sm">Audit Log</label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {reconciliationLoading ? (
              <ResponsiveLoading message="Loading reconciliation data..." />
            ) : reconciliation?.data ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card data-testid="card-verified-count">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Verified</CardTitle>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{reconciliation.data.summary.verifiedCount}</div>
                      <div className="text-sm text-muted-foreground">invoices match</div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-discrepancy-count">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Discrepancies</CardTitle>
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive">{reconciliation.data.summary.discrepancyCount}</div>
                      <div className="text-sm text-muted-foreground">need review</div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-platform-hours">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">Platform Hours</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(reconciliation.data.summary.totalPlatformHours)}</div>
                      <div className="text-sm text-muted-foreground">total tracked</div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-qb-hours">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium">QuickBooks Hours</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(reconciliation.data.summary.totalQuickbooksHours)}</div>
                      <div className="text-sm text-muted-foreground">total invoiced</div>
                    </CardContent>
                  </Card>
                </div>

                {showWidgets.comparisonTable && (
                  <Card data-testid="card-comparison-table">
                    <CardHeader>
                      <CardTitle>Hours Comparison</CardTitle>
                      <CardDescription>Side-by-side Platform vs QuickBooks hours by client</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead className="text-right">Platform Hours</TableHead>
                            <TableHead className="text-right">QuickBooks Hours</TableHead>
                            <TableHead className="text-right">Difference</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reconciliation.data.items.map((item, i) => (
                            <TableRow key={item.clientId} data-testid={`row-reconciliation-${i}`}>
                              <TableCell className="font-medium">{item.clientName}</TableCell>
                              <TableCell className="text-right">{item.platformHours.toFixed(1)}h</TableCell>
                              <TableCell className="text-right">{item.quickbooksHours.toFixed(1)}h</TableCell>
                              <TableCell className="text-right">
                                <span className={Math.abs(item.discrepancyPercent) > 5 ? 'text-destructive font-medium' : ''}>
                                  {item.discrepancyPercent >= 0 ? '+' : ''}{item.discrepancyPercent.toFixed(1)}%
                                </span>
                              </TableCell>
                              <TableCell>
                                {item.status === 'verified' && showWidgets.verifiedBadges && (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Trinity Verified
                                  </Badge>
                                )}
                                {item.status === 'discrepancy' && (
                                  <Badge variant="destructive">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Discrepancy
                                  </Badge>
                                )}
                                {item.status === 'pending' && (
                                  <Badge variant="outline">Pending</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {showWidgets.discrepancyChart && reconciliation.data.items.length > 0 && (
                  <Card data-testid="card-discrepancy-chart">
                    <CardHeader>
                      <CardTitle>Discrepancy Overview</CardTitle>
                      <CardDescription>Visual breakdown of hours variance by client</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={reconciliation.data.items.slice(0, 10)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-muted-foreground" />
                            <YAxis dataKey="clientName" type="category" width={120} className="text-muted-foreground" />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                            <Bar dataKey="platformHours" name="Platform" fill="hsl(var(--primary))" />
                            <Bar dataKey="quickbooksHours" name="QuickBooks" fill="hsl(var(--muted-foreground))" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {showWidgets.auditLog && (
                  <Card data-testid="card-audit-log">
                    <CardHeader>
                      <CardTitle>Reconciliation Audit Log</CardTitle>
                      <CardDescription>Recent reconciliation checks for Intuit compliance</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground">
                        Last sync: {reconciliation.data.lastSync ? new Date(reconciliation.data.lastSync).toLocaleString() : 'Never'}
                      </div>
                      <div className="mt-2 text-sm">
                        All reconciliation checks are logged in the quickbooks_api_usage table for SOX compliance.
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>QuickBooks Not Connected</AlertTitle>
                <AlertDescription>
                  Connect your QuickBooks account to enable Financial Watchdog reconciliation.
                  {/* @ts-ignore */}
                  <Button variant="link" className="p-0 h-auto ml-1" asChild>
                    <a href="/accounting-integrations">Connect QuickBooks</a>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
