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
  Wrench,
  LayoutDashboard,
  UserCog,
  KeyRound,
} from "lucide-react";
import { AutoForceLogo } from "@/components/autoforce-logo";
import { MasterKeysPanel } from "@/components/master-keys-panel";
import { UserManagementPanel } from "@/components/user-management-panel";

export default function AdminCommandCenter() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
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

  // REMOVED: Mock live activity feed - will be implemented with real WebSocket tracking later

  // Fetch platform stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/stats', refreshKey],
  });

  // Fetch personal staff data for welcome message
  const { data: personalData } = useQuery<{
    userName: string;
    assignedTickets: number;
    newSupportTickets: number;
  }>({
    queryKey: ["/api/platform/personal-data", refreshKey],
    refetchInterval: 10000,
  });

  // REMOVED: Mock activity tracking functions

  // Get role-based title
  const getRoleTitle = () => {
    const platformRole = (user as any)?.platformRole;
    switch (platformRole) {
      case 'root':
        return 'System Platform Administrator';
      case 'sysop':
        return 'System Operations';
      case 'deputy_admin':
        return 'Deputy Administrator';
      case 'deputy_assistant':
        return 'Deputy Assistant';
      case 'bot':
        return 'Bot Operations';
      default:
        return 'Platform Control';
    }
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
              {/* Large Prominent Logo with Text Branding */}
              <div className="mb-6 transform hover:scale-105 transition-transform duration-300 drop-shadow-2xl">
                <AutoForceLogo size="hero" variant="full" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent mb-3">
                Platform Command Center
              </h1>
              <p className="text-slate-300 text-sm sm:text-base">
                {getRoleTitle()}
              </p>
              {/* Personalized Welcome Message */}
              {personalData && (
                <p className="text-indigo-300 text-xs sm:text-sm mt-1 font-medium">
                  Welcome {personalData.userName} · {personalData.assignedTickets} assigned ticket{personalData.assignedTickets !== 1 ? 's' : ''} · {personalData.newSupportTickets} new support request{personalData.newSupportTickets !== 1 ? 's' : ''}
                </p>
              )}
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

        {/* Main Tabbed Navigation */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white/10 backdrop-blur-xl border border-white/20 p-1 grid grid-cols-2 sm:grid-cols-4 gap-1">
            <TabsTrigger 
              value="overview" 
              className="data-[state=active]:bg-indigo-500/40 data-[state=active]:text-white text-slate-300"
              data-testid="tab-overview"
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="tools" 
              className="data-[state=active]:bg-indigo-500/40 data-[state=active]:text-white text-slate-300"
              data-testid="tab-tools"
            >
              <Wrench className="h-4 w-4 mr-2" />
              Platform Tools
            </TabsTrigger>
            {(user as any)?.platformRole === 'root' && (
              <>
                <TabsTrigger 
                  value="users" 
                  className="data-[state=active]:bg-indigo-500/40 data-[state=active]:text-white text-slate-300"
                  data-testid="tab-users"
                >
                  <UserCog className="h-4 w-4 mr-2" />
                  Users
                </TabsTrigger>
                <TabsTrigger 
                  value="organizations" 
                  className="data-[state=active]:bg-indigo-500/40 data-[state=active]:text-white text-slate-300"
                  data-testid="tab-organizations"
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Organizations
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Platform Metrics */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-400" />
                  Platform Metrics
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 hover-elevate">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/20">
                        <Building2 className="h-5 w-5 text-blue-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-300">Workspaces</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{(stats as any)?.totalEmployees || 0}</div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover-elevate">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/20">
                        <DollarSign className="h-5 w-5 text-emerald-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-300">Monthly Revenue</span>
                    </div>
                    <div className="text-2xl font-bold text-white">${(stats as any)?.totalRevenue || "0"}</div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 hover-elevate">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-violet-500/20">
                        <Users className="h-5 w-5 text-violet-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-300">Total Users</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{(stats as any)?.totalClients || 0}</div>
                  </div>
                </div>
              </div>

              {/* System Status */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-indigo-400" />
                  System Health
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover-elevate">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-300">Database</span>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Healthy
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover-elevate">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-300">API Status</span>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Online
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover-elevate">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-300">Uptime</span>
                    </div>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                      99.9%
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* PLATFORM TOOLS TAB */}
          <TabsContent value="tools" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Button 
                className="h-auto py-6 px-6 flex-col gap-3 bg-indigo-500/20 border-indigo-500/30 hover:bg-indigo-500/30 text-white" 
                onClick={() => window.location.href = '/admin/support'}
                data-testid="button-support-tool"
              >
                <Users className="h-8 w-8" />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold">Support Queue</span>
                  <span className="text-xs text-slate-400">Manage support tickets</span>
                </div>
              </Button>
              
              <Button 
                className="h-auto py-6 px-6 flex-col gap-3 bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30 text-white" 
                onClick={() => window.location.href = '/admin/usage'}
                data-testid="button-usage-tool"
              >
                <Server className="h-8 w-8" />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold">Usage Analytics</span>
                  <span className="text-xs text-slate-400">Platform usage stats</span>
                </div>
              </Button>
              
              <Button 
                className="h-auto py-6 px-6 flex-col gap-3 bg-violet-500/20 border-violet-500/30 hover:bg-violet-500/30 text-white" 
                onClick={() => window.location.href = '/analytics'}
                data-testid="button-analytics-tool"
              >
                <BarChart3 className="h-8 w-8" />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold">Analytics</span>
                  <span className="text-xs text-slate-400">Deep insights & reports</span>
                </div>
              </Button>

              <Button 
                className="h-auto py-6 px-6 flex-col gap-3 bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30 text-white" 
                onClick={() => window.location.href = '/dashboard'}
                data-testid="button-workspace-tool"
              >
                <Building2 className="h-8 w-8" />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold">Workspace View</span>
                  <span className="text-xs text-slate-400">Preview as workspace</span>
                </div>
              </Button>

              <Button 
                className="h-auto py-6 px-6 flex-col gap-3 bg-amber-500/20 border-amber-500/30 hover:bg-amber-500/30 text-white" 
                onClick={() => window.location.href = '/admin/logs'}
                data-testid="button-logs-tool"
              >
                <Database className="h-8 w-8" />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold">System Logs</span>
                  <span className="text-xs text-slate-400">Audit & error logs</span>
                </div>
              </Button>

              <Button 
                className="h-auto py-6 px-6 flex-col gap-3 bg-rose-500/20 border-rose-500/30 hover:bg-rose-500/30 text-white" 
                onClick={() => window.location.href = '/admin/alerts'}
                data-testid="button-alerts-tool"
              >
                <AlertTriangle className="h-8 w-8" />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold">System Alerts</span>
                  <span className="text-xs text-slate-400">Critical notifications</span>
                </div>
              </Button>
            </div>
          </TabsContent>

          {/* USER MANAGEMENT TAB - ROOT ONLY */}
          {(user as any)?.platformRole === 'root' && (
            <TabsContent value="users">
              <UserManagementPanel />
            </TabsContent>
          )}

          {/* ORGANIZATIONS TAB - ROOT ONLY */}
          {(user as any)?.platformRole === 'root' && (
            <TabsContent value="organizations">
              <MasterKeysPanel />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
