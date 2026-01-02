import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Users, 
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
  Sparkles
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

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

export default function OwnerAnalytics() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, isLoading: accessLoading } = useWorkspaceAccess();
  const [selectedPeriod, setSelectedPeriod] = useState('last_30_days');
  const [activeTab, setActiveTab] = useState('overview');

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

  if (authLoading || !isAuthenticated || accessLoading) {
    return <ResponsiveLoading message="Loading Analytics Dashboard..." />;
  }

  if (workspaceRole !== 'org_owner' && workspaceRole !== 'org_admin') {
    return (
      <WorkspaceLayout>
        <div className="flex items-center justify-center h-full">
          <Alert variant="destructive" className="max-w-md" data-testid="alert-permission-denied">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              Only organization owners and administrators can view usage analytics.
            </AlertDescription>
          </Alert>
        </div>
      </WorkspaceLayout>
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

  return (
    <WorkspaceLayout>
      <div className="p-6 space-y-6" data-testid="owner-analytics-page">
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent" data-testid="card-trinity-elite">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
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

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Usage Analytics</h1>
            <p className="text-muted-foreground">Executive insights into platform usage and team engagement</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[180px]" data-testid="select-period">
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
        </div>

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
          <TabsList data-testid="tabs-analytics">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features">Features</TabsTrigger>
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
                          <div key={i} className="flex items-center justify-between">
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
                        <div key={i} className="flex items-center justify-between" data-testid={`row-team-member-${i}`}>
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
              </>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Data</AlertTitle>
                <AlertDescription>No analytics data available for the selected period.</AlertDescription>
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
                          <div key={i} className="flex items-center justify-between" data-testid={`row-top-performer-${i}`}>
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
                          <div className="flex items-center justify-between mb-1">
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
        </Tabs>
      </div>
    </WorkspaceLayout>
  );
}
