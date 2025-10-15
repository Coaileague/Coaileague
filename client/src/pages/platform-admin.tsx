import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Server, 
  Database,
  Cpu,
  HardDrive,
  AlertCircle,
  CheckCircle,
  Clock,
  Building,
  UserCog,
  Ticket,
  CreditCard,
  BarChart3
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";

interface PlatformStats {
  totalWorkspaces: number;
  totalUsers: number;
  activeSubscriptions: number;
  monthlyRevenue: string;
  platformFeeRevenue: string;
  totalTransactions: number;
  avgRevenuePerWorkspace: string;
  churnRate: number;
  
  systemHealth: {
    cpu: number;
    memory: number;
    database: string;
    uptime: number;
  };
  
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: Date;
    workspaceId?: string;
    workspaceName?: string;
  }>;
  
  supportMetrics: {
    openTickets: number;
    avgResponseTime: number;
    slaCompliance: number;
    customerSatisfaction: number;
  };
  
  topWorkspaces: Array<{
    id: string;
    name: string;
    tier: string;
    monthlyRevenue: string;
    employeeCount: number;
  }>;
}

export default function PlatformAdmin() {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const healthColor = (value: number) => {
    if (value >= 90) return "text-green-600";
    if (value >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Command Center</h1>
          <p className="text-muted-foreground">
            Manage your entire Fortune 500 SaaS platform from one dashboard
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-platform-settings">
            <UserCog className="mr-2 h-4 w-4" />
            Platform Settings
          </Button>
          <Button data-testid="button-support-queue">
            <Ticket className="mr-2 h-4 w-4" />
            Support Queue
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-workspaces">
              {stats?.totalWorkspaces || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeSubscriptions || 0} active subscriptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">
              {stats?.totalUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all workspaces
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monthly-revenue">
              ${stats?.monthlyRevenue || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              ${stats?.platformFeeRevenue || "0"} platform fees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue/Workspace</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-revenue">
              ${stats?.avgRevenuePerWorkspace || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.churnRate || 0}% churn rate
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">System Health</TabsTrigger>
          <TabsTrigger value="support" data-testid="tab-support">Support Metrics</TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Platform-wide events and transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats?.recentActivity?.slice(0, 5).map((activity, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.workspaceName} • {formatDistanceToNow(new Date(activity.timestamp))} ago
                        </p>
                      </div>
                      <Badge variant="outline">{activity.type}</Badge>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Workspaces */}
            <Card>
              <CardHeader>
                <CardTitle>Top Revenue Workspaces</CardTitle>
                <CardDescription>Highest earning customers this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats?.topWorkspaces?.map((workspace, idx) => (
                    <div key={workspace.id} className="flex items-center gap-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        {idx + 1}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">{workspace.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {workspace.employeeCount} employees • {workspace.tier}
                        </p>
                      </div>
                      <div className="text-sm font-medium">${workspace.monthlyRevenue}</div>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No workspace data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* System Health Tab */}
        <TabsContent value="health" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${healthColor(100 - (stats?.systemHealth?.cpu || 0))}`}>
                  {stats?.systemHealth?.cpu || 0}%
                </div>
                <Progress value={stats?.systemHealth?.cpu || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${healthColor(100 - (stats?.systemHealth?.memory || 0))}`}>
                  {stats?.systemHealth?.memory || 0}%
                </div>
                <Progress value={stats?.systemHealth?.memory || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Database</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {stats?.systemHealth?.database === "healthy" ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium">Healthy</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <span className="text-sm font-medium">Issues Detected</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.floor((stats?.systemHealth?.uptime || 0) / 3600)}h
                </div>
                <p className="text-xs text-muted-foreground">99.9% availability</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Support Metrics Tab */}
        <TabsContent value="support" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
                <Ticket className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.openTickets || 0}</div>
                <Button variant="link" className="h-auto p-0 text-xs">View Queue →</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.avgResponseTime || 0}h</div>
                <p className="text-xs text-muted-foreground">Target: &lt;4h</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.slaCompliance || 0}%</div>
                <Progress value={stats?.supportMetrics?.slaCompliance || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CSAT Score</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.customerSatisfaction || 0}%</div>
                <p className="text-xs text-muted-foreground">Customer satisfaction</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Platform Fees (MRR)</CardTitle>
                <CardDescription>Monthly recurring platform revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${stats?.platformFeeRevenue || "0"}</div>
                <p className="text-xs text-muted-foreground mt-2">
                  From {stats?.totalTransactions || 0} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscription Revenue</CardTitle>
                <CardDescription>Monthly subscription fees</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${stats?.monthlyRevenue || "0"}</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {stats?.activeSubscriptions || 0} active subscriptions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total MRR</CardTitle>
                <CardDescription>Combined monthly recurring revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${(parseFloat(stats?.platformFeeRevenue || "0") + parseFloat(stats?.monthlyRevenue || "0")).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  90%+ profit margin
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
