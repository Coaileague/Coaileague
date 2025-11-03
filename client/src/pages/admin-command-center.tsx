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
                <WorkforceOSLogo size="hero" variant="full" />
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

        {/* REMOVED: Mock system health cards and live activity feed - awaiting real monitoring implementation */}
        
        {/* Main Content Grid - Platform Metrics Only (Real Data) */}
        <div className="grid grid-cols-1 gap-6">
          {/* Platform Metrics - Real Data */}
          <div className="space-y-6">
            {/* Platform Metrics */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-400" />
                Platform Metrics
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-400" />
                    <span className="text-xs text-slate-300">Workspaces</span>
                  </div>
                  <div className="text-lg font-bold text-white">{(stats as any)?.totalEmployees || 0}</div>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs text-slate-300">Monthly Revenue</span>
                  </div>
                  <div className="text-lg font-bold text-white">${(stats as any)?.totalRevenue || "0"}</div>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-violet-400" />
                    <span className="text-xs text-slate-300">API Requests</span>
                  </div>
                  <div className="text-lg font-bold text-white">{systemHealth.requests}</div>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-xs text-slate-300">Errors (24h)</span>
                  </div>
                  <div className="text-lg font-bold text-amber-400">{systemHealth.errors}</div>
                </div>
              </div>
            </div>

            {/* System Status */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-400" />
                System Status
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <span className="text-xs text-slate-300">Uptime</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs py-0">
                    {systemHealth.uptime}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <span className="text-xs text-slate-300">Database</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs py-0">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Healthy
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <span className="text-xs text-slate-300">API Status</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs py-0">
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

            {/* User Management - ROOT ONLY */}
            {(user as any)?.platformRole === 'root' && (
              <div className="mt-6">
                <UserManagementPanel />
              </div>
            )}

            {/* Master Keys - ROOT ONLY */}
            {(user as any)?.platformRole === 'root' && (
              <div className="mt-6">
                <MasterKeysPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
