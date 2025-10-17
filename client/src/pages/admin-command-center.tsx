import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Users,
  Building2,
  DollarSign,
  Server,
  Database,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  HardDrive,
  Wifi,
  RefreshCw,
  UserCheck,
  BarChart3,
  Zap,
  Shield,
} from "lucide-react";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

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

  // Real-time clock with animation
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 relative overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-600/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Branded Header with Large Logo */}
        <div className="mb-8">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col items-center text-center mb-6">
              {/* Large Prominent Logo */}
              <div className="mb-4 transform hover:scale-105 transition-transform duration-300">
                <WorkforceOSLogo size="xl" showText={false} />
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent mb-3">
                Platform Command Center
              </h1>
              <p className="text-slate-300 text-sm sm:text-base">
                Real-time monitoring · System administration · Platform control
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              {/* Live Clock */}
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
                <div>
                  <div className="text-3xl sm:text-4xl font-bold font-mono text-white tracking-tight">
                    {currentTime.toLocaleTimeString()}
                  </div>
                  <div className="text-xs text-slate-400">
                    {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>
              
              <Button
                variant="outline"
                size="lg"
                onClick={() => setRefreshKey(prev => prev + 1)}
                className="bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20 text-white"
                data-testid="button-refresh-command"
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* System Health Overview - Animated Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* CPU Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <Cpu className="h-6 w-6 text-emerald-400" />
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                Healthy
              </Badge>
            </div>
            <div className="text-sm text-slate-300 mb-2">CPU Usage</div>
            <div className="text-3xl font-bold text-white mb-3">{systemHealth.cpu}%</div>
            <Progress value={systemHealth.cpu} className="h-2 bg-emerald-900/30" />
          </div>

          {/* Memory Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl p-6 hover:border-amber-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-amber-500/20 rounded-xl">
                <HardDrive className="h-6 w-6 text-amber-400" />
              </div>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                Warning
              </Badge>
            </div>
            <div className="text-sm text-slate-300 mb-2">Memory</div>
            <div className="text-3xl font-bold text-white mb-3">{systemHealth.memory}%</div>
            <Progress value={systemHealth.memory} className="h-2 bg-amber-900/30" />
          </div>

          {/* Database Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 rounded-2xl p-6 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                Active
              </Badge>
            </div>
            <div className="text-sm text-slate-300 mb-2">Database Load</div>
            <div className="text-3xl font-bold text-white mb-3">{systemHealth.database}%</div>
            <Progress value={systemHealth.database} className="h-2 bg-blue-900/30" />
          </div>

          {/* Active Users Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-2xl p-6 hover:border-violet-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-violet-500/20 rounded-xl">
                <Wifi className="h-6 w-6 text-violet-400 animate-pulse" />
              </div>
              <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">
                <div className="h-2 w-2 bg-violet-400 rounded-full animate-pulse mr-2"></div>
                Live
              </Badge>
            </div>
            <div className="text-sm text-slate-300 mb-2">Active Users</div>
            <div className="text-3xl font-bold text-white mb-3">{systemHealth.activeUsers}</div>
            <p className="text-xs text-slate-400">Online right now</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Activity Feed */}
          <div className="lg:col-span-2 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    <Activity className="h-6 w-6 text-indigo-400 animate-pulse" />
                    Live Activity Feed
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">Real-time platform events</p>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1">
                  <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse mr-2"></div>
                  Live
                </Badge>
              </div>
            </div>
            <ScrollArea className="h-[400px] p-6">
              <div className="space-y-3">
                {liveActivities.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/30 transition-all duration-300 animate-in fade-in slide-in-from-top-2"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="mt-1 p-2 bg-indigo-500/20 rounded-lg">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{activity.action}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs bg-indigo-500/10 border-indigo-500/30 text-indigo-300">
                          {activity.workspace}
                        </Badge>
                        <span className="text-xs text-slate-400">{activity.user}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {formatTimeAgo(activity.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Quick Stats & System Status */}
          <div className="space-y-6">
            {/* Platform Metrics */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-400" />
                Platform Metrics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-blue-400" />
                    <span className="text-sm text-slate-300">Workspaces</span>
                  </div>
                  <div className="text-xl font-bold text-white">{(stats as any)?.totalEmployees || 0}</div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-emerald-400" />
                    <span className="text-sm text-slate-300">Monthly Revenue</span>
                  </div>
                  <div className="text-xl font-bold text-white">${(stats as any)?.totalRevenue || "0"}</div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-violet-400" />
                    <span className="text-sm text-slate-300">API Requests</span>
                  </div>
                  <div className="text-xl font-bold text-white">{systemHealth.requests}</div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                    <span className="text-sm text-slate-300">Errors (24h)</span>
                  </div>
                  <div className="text-xl font-bold text-amber-400">{systemHealth.errors}</div>
                </div>
              </div>
            </div>

            {/* System Status */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-400" />
                System Status
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-sm text-slate-300">Uptime</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    {systemHealth.uptime}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-sm text-slate-300">Database</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Healthy
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-sm text-slate-300">API Status</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Online
                  </Badge>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button 
                className="w-full bg-indigo-500/20 border-indigo-500/30 hover:bg-indigo-500/30 text-white" 
                onClick={() => window.location.href = '/admin/support'}
              >
                <Users className="mr-2 h-4 w-4" />
                Support
              </Button>
              <Button 
                className="w-full bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30 text-white" 
                onClick={() => window.location.href = '/admin/usage'}
              >
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
