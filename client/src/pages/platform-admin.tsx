import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  BarChart3,
  Settings
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

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
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();
  
  // Platform settings state
  const [platformSettings, setPlatformSettings] = useState({
    platformName: "WorkforceOS",
    maintenanceMode: false,
    newWorkspaceRegistration: true,
    emailNotifications: true,
    supportEmail: "support@workforceos.com",
    enforceSSO: false,
    requireMFA: false,
    passwordExpiry: 90,
    sessionTimeout: 30
  });
  const [showSupportQueue, setShowSupportQueue] = useState(false);
  
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });
  
  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: typeof platformSettings) => {
      const response = await fetch("/api/platform/settings", {
        method: "POST",
        body: JSON.stringify(settings),
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) throw new Error("Failed to save settings");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Platform settings have been updated successfully"
      });
      setShowSettings(false);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save platform settings",
        variant: "destructive"
      });
    }
  });
  
  const handleSaveSettings = () => {
    saveSettingsMutation.mutate(platformSettings);
  };

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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* WorkForceOS™ Logo */}
          <WorkforceOSLogo size="sm" showText={false} />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Platform Admin</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage your entire Elite SaaS platform from one dashboard
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSettings(true)} data-testid="button-platform-settings">
            <Settings className="mr-2 h-4 w-4" />
            Platform Settings
          </Button>
          <Button onClick={() => setShowSupportQueue(true)} data-testid="button-support-queue">
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
                <Button variant="ghost" className="h-auto p-0 text-xs">View Queue →</Button>
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

      {/* Platform Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Platform Settings
            </DialogTitle>
            <DialogDescription>
              Configure platform-wide settings and preferences
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(85vh-180px)] pr-4">
            <div className="space-y-6 py-4">
              {/* General Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">General</h3>
                <div className="space-y-2">
                  <Label>Platform Name</Label>
                  <Input 
                    value={platformSettings.platformName}
                    onChange={(e) => setPlatformSettings({...platformSettings, platformName: e.target.value})}
                    data-testid="input-platform-name" 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground">Temporarily disable platform access</p>
                  </div>
                  <Switch 
                    checked={platformSettings.maintenanceMode}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, maintenanceMode: checked})}
                    data-testid="switch-maintenance-mode" 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>New Workspace Registration</Label>
                    <p className="text-sm text-muted-foreground">Allow new workspaces to register</p>
                  </div>
                  <Switch 
                    checked={platformSettings.newWorkspaceRegistration}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, newWorkspaceRegistration: checked})}
                    data-testid="switch-new-registration" 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Send platform-wide email alerts</p>
                  </div>
                  <Switch 
                    checked={platformSettings.emailNotifications}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, emailNotifications: checked})}
                    data-testid="switch-email-notifications" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Support Email</Label>
                  <Input 
                    type="email" 
                    value={platformSettings.supportEmail}
                    onChange={(e) => setPlatformSettings({...platformSettings, supportEmail: e.target.value})}
                    data-testid="input-support-email" 
                  />
                </div>
              </div>

              {/* Security Settings */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-semibold">Security</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enforce SSO</Label>
                    <p className="text-sm text-muted-foreground">Require single sign-on for all workspaces</p>
                  </div>
                  <Switch 
                    checked={platformSettings.enforceSSO}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, enforceSSO: checked})}
                    data-testid="switch-enforce-sso" 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require MFA</Label>
                    <p className="text-sm text-muted-foreground">Mandatory multi-factor authentication</p>
                  </div>
                  <Switch 
                    checked={platformSettings.requireMFA}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, requireMFA: checked})}
                    data-testid="switch-require-mfa" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password Expiry (days)</Label>
                  <Input 
                    type="number" 
                    value={platformSettings.passwordExpiry}
                    onChange={(e) => setPlatformSettings({...platformSettings, passwordExpiry: parseInt(e.target.value) || 90})}
                    data-testid="input-password-expiry" 
                  />
                  <p className="text-xs text-muted-foreground">Force password change after this many days</p>
                </div>
                <div className="space-y-2">
                  <Label>Session Timeout (minutes)</Label>
                  <Input 
                    type="number" 
                    value={platformSettings.sessionTimeout}
                    onChange={(e) => setPlatformSettings({...platformSettings, sessionTimeout: parseInt(e.target.value) || 30})}
                    data-testid="input-session-timeout" 
                  />
                  <p className="text-xs text-muted-foreground">Auto-logout after inactivity</p>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowSettings(false)}
              data-testid="button-cancel-settings"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveSettings}
              disabled={saveSettingsMutation.isPending}
              data-testid="button-save-settings"
            >
              {saveSettingsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Support Queue Dialog */}
      <Dialog open={showSupportQueue} onOpenChange={setShowSupportQueue}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Support Queue
            </DialogTitle>
            <DialogDescription>
              View and manage pending support requests
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="text-center py-8 text-muted-foreground">
              <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Pending Requests</p>
              <p className="text-sm">All support tickets have been addressed</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
