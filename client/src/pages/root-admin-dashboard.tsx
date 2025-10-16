import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Activity, Users, Building2, DollarSign, Server, Database, Cpu, HardDrive,
  AlertTriangle, CheckCircle, TrendingUp, Shield, RefreshCw, Settings,
  Zap, Clock, UserCheck, Ticket, MessageSquare, BarChart3, Search, ExternalLink,
  MapPin, Calendar, Mail, Phone
} from "lucide-react";

interface PlatformStats {
  totalWorkspaces: number;
  totalUsers: number;
  activeSubscriptions: number;
  monthlyRevenue: string;
  platformFees: string;
  avgRevenue: string;
  churnRate: string;
  systemHealth: {
    cpu: number;
    memory: number;
    database: string;
    uptime: number;
  };
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
    workspace?: string;
  }>;
}

export default function RootAdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  // GATEKEEPER: Block unauthorized users
  useEffect(() => {
    if (!isLoading) {
      const platformRole = (user as any)?.platformRole;
      if (platformRole !== 'root' && platformRole !== 'sysop') {
        if (!user) {
          window.location.href = '/login';
        } else {
          setLocation('/error-403');
        }
      }
    }
  }, [user, isLoading, setLocation]);

  // Real-time clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch platform-level stats
  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats", refreshKey],
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: supportStats } = useQuery({
    queryKey: ["/api/admin/support/stats", refreshKey],
    refetchInterval: 5000,
  });

  // Search organizations
  const { data: organizations, isLoading: orgsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/support/search", searchQuery],
    enabled: searchQuery.length >= 2,
  });

  // Format uptime
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  // Activity icon helper
  const getActivityIcon = (type: string) => {
    switch (type) {
      case "login": return <UserCheck className="h-4 w-4 text-emerald-500" />;
      case "invoice": return <DollarSign className="h-4 w-4 text-amber-500" />;
      case "subscription": return <Users className="h-4 w-4 text-blue-500" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Activity className="h-4 w-4 text-slate-500" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">
      {/* Command Center Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Platform Command Center</h1>
            <p className="text-sm text-muted-foreground">
              Real-time monitoring · System administration · Platform control
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold font-mono">
              {currentTime.toLocaleTimeString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRefreshKey(prev => prev + 1)}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Platform Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-blue-500" />
              Total Workspaces
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-workspaces">
              {stats?.totalWorkspaces || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active organizations
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-emerald-500" />
              Total Users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-users">
              {stats?.totalUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Platform-wide
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="h-4 w-4 text-amber-500" />
              Platform Revenue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-platform-revenue">
              ${parseFloat(stats?.platformFees || "0").toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This month (fees)
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              Active Subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-active-subs">
              {stats?.activeSubscriptions || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Churn: {stats?.churnRate || "0"}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Organizations Browser - PRIMARY FOCUS */}
      <Card className="border-l-4 border-l-blue-600">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6 text-blue-500" />
            Organizations Worldwide
          </CardTitle>
          <CardDescription>Search and access customer organizations to provide assistance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by company name, email, or workspace name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-org-search"
            />
          </div>

          <ScrollArea className="h-[400px]">
            {orgsLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Searching...
              </div>
            ) : searchQuery.length < 2 ? (
              <div className="text-center text-muted-foreground py-8">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Enter at least 2 characters to search organizations</p>
              </div>
            ) : organizations && organizations.length > 0 ? (
              <div className="space-y-3">
                {organizations.map((org: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg border hover-elevate transition-all"
                    data-testid={`org-${idx}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-lg">{org.workspace?.companyName || org.workspace?.name}</h3>
                          {org.subscription?.tier && (
                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                              {org.subscription.tier}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            <span>{org.owner?.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3" />
                            <span>Workspace: {org.workspace?.name}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>Employees: <span className="font-semibold">{org.stats?.employeeCount || 0}</span></div>
                            <div>Clients: <span className="font-semibold">{org.stats?.clientCount || 0}</span></div>
                            <div>Invoices: <span className="font-semibold">{org.stats?.invoiceCount || 0}</span></div>
                            <div>Tickets: <span className="font-semibold text-orange-600">{org.stats?.activeTickets || 0}</span></div>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setLocation(`/admin/support?workspace=${org.workspace?.id}`)}
                        data-testid={`button-view-org-${idx}`}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No organizations found</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* System Health & Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Health Monitoring */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5 text-blue-500" />
                System Health
              </CardTitle>
              <CardDescription>Real-time server metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-emerald-500" />
                    <span>CPU Usage</span>
                  </div>
                  <span className="font-bold">{stats?.systemHealth?.cpu || 0}%</span>
                </div>
                <Progress value={stats?.systemHealth?.cpu || 0} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-amber-500" />
                    <span>Memory</span>
                  </div>
                  <span className="font-bold">{stats?.systemHealth?.memory || 0}%</span>
                </div>
                <Progress value={stats?.systemHealth?.memory || 0} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-500" />
                    <span>Database</span>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {stats?.systemHealth?.database || "healthy"}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span>Uptime</span>
                </div>
                <span className="font-mono text-sm">
                  {stats?.systemHealth?.uptime ? formatUptime(stats.systemHealth.uptime) : "0d 0h 0m"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Admin Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-amber-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start" 
                onClick={() => setLocation('/admin/command')}
                data-testid="button-customer-support"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Customer Support Dashboard
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setLocation('/admin/usage')}
                data-testid="button-usage-dashboard"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Usage Analytics
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setLocation('/support')}
                data-testid="button-live-support"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Live Support Chat
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setLocation('/admin/support')}
                data-testid="button-support-tickets"
              >
                <Ticket className="h-4 w-4 mr-2" />
                Support Tickets
                {(supportStats as any)?.openTickets > 0 && (
                  <Badge variant="secondary" className="ml-auto bg-red-500/10 text-red-600">
                    {(supportStats as any)?.openTickets}
                  </Badge>
                )}
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setLocation('/settings')}
                data-testid="button-platform-settings"
              >
                <Settings className="h-4 w-4 mr-2" />
                Platform Settings
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Live Activity Feed */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-indigo-500 animate-pulse" />
                  Live Platform Activity
                </CardTitle>
                <CardDescription>Real-time events across all workspaces</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse mr-2" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {statsLoading ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading activity...
                </div>
              ) : (
                <div className="space-y-2">
                  {stats?.recentActivity?.map((activity, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-lg hover-elevate border transition-colors"
                      data-testid={`activity-${idx}`}
                    >
                      <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{activity.description}</p>
                        {activity.workspace && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {activity.workspace}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimeAgo(activity.timestamp)}
                      </span>
                    </div>
                  ))}
                  {(!stats?.recentActivity || stats.recentActivity.length === 0) && (
                    <div className="text-center text-muted-foreground py-8">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No recent activity</p>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
