import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Server,
  Database,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  Globe,
  Cpu,
  HardDrive,
  Wifi,
  RefreshCw,
  Settings,
  Shield,
  BarChart3,
  UserCheck,
  UserX,
} from "lucide-react";

interface LiveActivity {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  workspace: string;
  type: "login" | "shift_created" | "invoice_generated" | "employee_added" | "error";
}

export default function AdminCommandCenter() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // GATEKEEPER: Microsoft-style access control - Block unauthorized users
  useEffect(() => {
    if (!isLoading) {
      const platformRole = (user as any)?.platformRole;
      
      // Only root and sysop can access admin command center
      if (platformRole !== 'root' && platformRole !== 'sysop') {
        // Unauthorized - redirect to appropriate portal
        if (!user) {
          // Not logged in - send to login
          window.location.href = '/login';
        } else {
          // Logged in but not admin - send to their dashboard with 403 message
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

  // Simulated live activity feed (replace with WebSocket in production)
  useEffect(() => {
    const mockActivities: LiveActivity[] = [
      {
        id: "1",
        timestamp: new Date().toISOString(),
        user: "john@security.com",
        action: "Created shift for Emily Chen",
        workspace: "SecureGuard Inc",
        type: "shift_created",
      },
      {
        id: "2",
        timestamp: new Date(Date.now() - 30000).toISOString(),
        user: "admin@hospital.com",
        action: "Generated invoice #INV-2024-047",
        workspace: "Healthcare Plus",
        type: "invoice_generated",
      },
      {
        id: "3",
        timestamp: new Date(Date.now() - 60000).toISOString(),
        user: "manager@construction.com",
        action: "Added new employee: Mike Rodriguez",
        workspace: "BuildPro Construction",
        type: "employee_added",
      },
      {
        id: "4",
        timestamp: new Date(Date.now() - 90000).toISOString(),
        user: "sarah@retail.com",
        action: "Logged in from 192.168.1.100",
        workspace: "RetailMax",
        type: "login",
      },
    ];
    setLiveActivities(mockActivities);
  }, [refreshKey]);

  // Fetch platform stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/stats', refreshKey],
  });

  // System health metrics
  const systemHealth = {
    cpu: 42,
    memory: 67,
    database: 45,
    uptime: "12d 5h 32m",
    requests: "1,247",
    errors: 3,
    activeUsers: 156,
  };

  const getActivityIcon = (type: LiveActivity["type"]) => {
    switch (type) {
      case "login":
        return <UserCheck className="h-4 w-4 text-emerald-500" />;
      case "shift_created":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "invoice_generated":
        return <DollarSign className="h-4 w-4 text-amber-500" />;
      case "employee_added":
        return <Users className="h-4 w-4 text-violet-500" />;
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto w-full">
        {/* Command Center Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Admin Command Center</h1>
                <p className="text-sm text-muted-foreground">
                  Real-time platform monitoring · System diagnostics · User management
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold font-mono">
                  {currentTime.toLocaleTimeString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentTime.toLocaleDateString()}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRefreshKey(prev => prev + 1)}
                data-testid="button-refresh-command"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* System Health Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                CPU Usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{systemHealth.cpu}%</div>
              <Progress value={systemHealth.cpu} className="h-2" />
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Memory
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{systemHealth.memory}%</div>
              <Progress value={systemHealth.memory} className="h-2" />
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{systemHealth.database}%</div>
              <Progress value={systemHealth.database} className="h-2" />
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-violet-500">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Active Users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{systemHealth.activeUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">Online now</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Activity Feed */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-indigo-500 animate-pulse" />
                    Live Activity Feed
                  </CardTitle>
                  <CardDescription>Real-time platform events</CardDescription>
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                  <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse mr-2" />
                  Live
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {liveActivities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-border/50"
                    >
                      <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{activity.action}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {activity.workspace}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{activity.user}</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimeAgo(activity.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Workspaces</span>
                  </div>
                  <div className="font-bold">{(stats as any)?.totalEmployees || 0}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">Monthly Revenue</span>
                  </div>
                  <div className="font-bold">${(stats as any)?.totalRevenue || "0"}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-violet-500" />
                    <span className="text-sm">API Requests</span>
                  </div>
                  <div className="font-bold">{systemHealth.requests}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Errors (24h)</span>
                  </div>
                  <div className="font-bold text-amber-600">{systemHealth.errors}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Uptime</span>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                    {systemHealth.uptime}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Healthy
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">API Status</span>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Online
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="w-full" onClick={() => window.location.href = '/admin/support'}>
                <Users className="mr-2 h-4 w-4" />
                Support
              </Button>
              <Button variant="outline" className="w-full" onClick={() => window.location.href = '/admin/usage'}>
                <Server className="mr-2 h-4 w-4" />
                Usage
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
