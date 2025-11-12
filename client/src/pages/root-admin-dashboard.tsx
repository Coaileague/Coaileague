import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Activity, Users, Building2, DollarSign, Server, Database, Cpu, HardDrive,
  AlertTriangle, CheckCircle, TrendingUp, Shield, RefreshCw, Settings,
  Zap, Bell, Clock, UserCheck, Ticket, MessageSquare, BarChart3, Search, ExternalLink,
  MapPin, Calendar, Mail, Phone, User, Save, Receipt, UserPlus, GraduationCap, Grid3x3,
  Lock, Unlock, Ban, XCircle, ShieldAlert, UserCog, FileText, AlertCircle, Key,
  Flag, Code, Activity as ActivityIcon, HelpCircle, Gauge, Webhook, ScrollText
} from "lucide-react";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { TimeGreeting } from "@/components/time-greeting";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getActionsByCategory } from "@/data/quickActions";
import { useAdaptiveRoute, useDevicePlatform } from "@/hooks/use-adaptive-route";
import type { PlatformRole } from "@/data/quickActions";

interface PlatformStats {
  totalWorkspaces: number;
  totalUsers: number;
  activeSubscriptions: number;
  newSignups: number;
  invoiceCount: number;
  monthlyRevenue: string;
  platformFees: string;
  chatUsers: number;
  chatStaff: number;
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
  const { user, isLoading} = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Adaptive routing and platform detection
  const { navigate, scrollToAnchor } = useAdaptiveRoute();
  const platform = useDevicePlatform();
  const platformRole = (user as any)?.platformRole as PlatformRole;
  
  // Get quick actions from registry
  const supportActions = useMemo(() => 
    getActionsByCategory('support', platformRole, undefined, !!user, platform),
    [platformRole, user, platform]
  );
  
  const platformActions = useMemo(() => 
    getActionsByCategory('platform', platformRole, undefined, !!user, platform),
    [platformRole, user, platform]
  );
  
  const operationsActions = useMemo(() => 
    getActionsByCategory('operations', platformRole, undefined, !!user, platform),
    [platformRole, user, platform]
  );
  
  const coreActions = useMemo(() => 
    getActionsByCategory('core', platformRole, undefined, !!user, platform),
    [platformRole, user, platform]
  );
  
  // Admin Controls State
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);
  
  const { toast } = useToast();

  // GATEKEEPER: Block unauthorized users
  useEffect(() => {
    if (!isLoading) {
      const platformRole = (user as any)?.platformRole;
      if (platformRole !== 'root_admin' && platformRole !== 'sysop') {
        if (!user) {
          window.location.href = '/login';
        } else {
          setLocation('/error-403');
        }
      }
    }
  }, [user, isLoading, setLocation]);

  // Fetch platform-level stats
  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats", refreshKey],
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: supportStats } = useQuery({
    queryKey: ["/api/admin/support/stats", refreshKey],
    refetchInterval: 5000,
  });

  // User search query
  const { data: userSearchResults, refetch: refetchUsers} = useQuery({
    queryKey: ['/api/platform/users/search', userSearchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/platform/users/search?q=${encodeURIComponent(userSearchQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: userSearchQuery.length >= 3,
  });

  // Workspace search query
  const { data: workspaceSearchResults, refetch: refetchWorkspaces } = useQuery({
    queryKey: ['/api/admin/support/search', workspaceSearchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/admin/support/search?q=${encodeURIComponent(workspaceSearchQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: workspaceSearchQuery.length >= 3,
  });

  // Account action mutations
  const suspendAccountMutation = useMutation({
    mutationFn: async (data: { workspaceId: string; reason: string }) => 
      await apiRequest('POST', '/api/admin/support/suspend-account', data),
    onSuccess: () => {
      toast({ title: "Success", description: "Account suspended successfully" });
      refetchWorkspaces();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to suspend account", variant: "destructive" });
    },
  });

  const unsuspendAccountMutation = useMutation({
    mutationFn: async (data: { workspaceId: string }) => 
      await apiRequest('POST', '/api/admin/support/unsuspend-account', data),
    onSuccess: () => {
      toast({ title: "Success", description: "Account unsuspended successfully" });
      refetchWorkspaces();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to unsuspend account", variant: "destructive" });
    },
  });

  const lockAccountMutation = useMutation({
    mutationFn: async (data: { workspaceId: string; reason: string }) => 
      await apiRequest('POST', '/api/admin/support/lock-account', data),
    onSuccess: () => {
      toast({ title: "Success", description: "Account locked successfully" });
      refetchWorkspaces();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to lock account", variant: "destructive" });
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: async (data: { workspaceId: string }) => 
      await apiRequest('POST', '/api/admin/support/unlock-account', data),
    onSuccess: () => {
      toast({ title: "Success", description: "Account unlocked successfully" });
      refetchWorkspaces();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to unlock account", variant: "destructive" });
    },
  });

  const changeUserRoleMutation = useMutation({
    mutationFn: async (data: { userId: string; newRole: string; workspaceId: string }) =>
      await apiRequest('POST', '/api/admin/support/change-user-role', data),
    onSuccess: () => {
      toast({ title: "Success", description: "User role changed successfully" });
      refetchUsers();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to change user role", variant: "destructive" });
    },
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
      case "login": return <UserCheck className="h-4 w-4 text-primary" />;
      case "invoice": return <DollarSign className="h-4 w-4 text-blue-500" />;
      case "subscription": return <Users className="h-4 w-4 text-primary" />;
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900">
      {/* Animated background gradient orbs - Hidden on mobile for performance */}
      <div className="hidden sm:block absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-slate-900/20 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-slate-900/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-600/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Main Content - More compact on mobile */}
      <div className="relative z-10 flex-1 overflow-auto p-3 sm:p-6 max-w-[1800px] mx-auto w-full space-y-3 sm:space-y-6">
        {/* Branded Header - Compact on mobile, full on desktop */}
        <div className="sm:mb-6">
          {/* Mobile Header - Very compact */}
          <div className="sm:hidden relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-900 via-slate-900 to-slate-900 p-3 border border-primary/20">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-white truncate">
                  Platform Command
                </h1>
                {personalData && (
                  <p className="text-xs text-primary truncate">
                    {personalData.userName} · {personalData.assignedTickets + personalData.newSupportTickets} tasks
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Header - Reduced Padding */}
          <div className="hidden sm:block relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-900 p-3 sm:p-4 border border-primary/20 backdrop-blur-xl bg-white/5">
            {/* Logo and Title */}
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="transform hover:scale-105 transition-transform duration-300">
                  <AnimatedAutoForceLogo size="lg" variant="icon" lightMode={true} />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white via-primary to-blue-200 bg-clip-text text-transparent">
                    Platform Command Center
                  </h1>
                  <p className="text-slate-400 text-xs sm:text-sm">
                    {getRoleTitle()}
                  </p>
                  <TimeGreeting 
                    userName={personalData?.userName}
                    role=""
                    className="text-primary text-xs mt-0.5"
                  />
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Notifications Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative text-white hover:bg-white/10"
                      data-testid="button-notifications-desktop"
                    >
                      <Bell className="h-5 w-5" />
                      {personalData && (personalData.assignedTickets + personalData.newSupportTickets) > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                          {personalData.assignedTickets + personalData.newSupportTickets}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    {personalData && personalData.assignedTickets > 0 && (
                      <DropdownMenuItem>
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">{personalData.assignedTickets} Assigned Tickets</p>
                          <p className="text-xs text-muted-foreground">View your assigned support tickets</p>
                        </div>
                      </DropdownMenuItem>
                    )}
                    {personalData && personalData.newSupportTickets > 0 && (
                      <DropdownMenuItem>
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">{personalData.newSupportTickets} New Support Requests</p>
                          <p className="text-xs text-muted-foreground">New tickets require attention</p>
                        </div>
                      </DropdownMenuItem>
                    )}
                    {(!personalData || (personalData.assignedTickets === 0 && personalData.newSupportTickets === 0)) && (
                      <DropdownMenuItem>
                        <p className="text-sm text-muted-foreground">No new notifications</p>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop: 2-Column Grid | Mobile: Stacked */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Quick Access Menu - Organized by Categories (Registry-Based) */}
          <Card className="border-primary/20 bg-gradient-to-br from-slate-900/50 via-slate-900/30 to-slate-900/50 backdrop-blur-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-white">Quick Access</h2>
              </div>

              {/* Support & Helpdesk Tools */}
              {supportActions.length > 0 && (
                <div className="mb-3">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-primary/70 mb-2 uppercase tracking-wider">Support & Helpdesk</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {supportActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Button
                          key={action.id}
                          variant="outline"
                          size="sm"
                          className="flex-col h-auto min-h-[56px] px-2 py-2 gap-1 hover-elevate whitespace-nowrap bg-slate-800/30 border-primary/20 hover:border-primary/80/40"
                          onClick={(e) => {
                            if (action.isHashAnchor) {
                              e.preventDefault();
                              scrollToAnchor(action.resolvedPath);
                            } else {
                              setLocation(action.resolvedPath);
                            }
                          }}
                          data-testid={action.testId}
                        >
                          <Icon className={`h-4 w-4 ${action.color} shrink-0`} />
                          <span className="text-[10px] font-medium leading-tight text-white">{action.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Platform Management Tools */}
              {platformActions.length > 0 && (
                <div className="mb-3">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-blue-400/70 mb-2 uppercase tracking-wider">Platform Management</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {platformActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Button
                          key={action.id}
                          variant="outline"
                          size="sm"
                          className="flex-col h-auto min-h-[56px] px-2 py-2 gap-1 hover-elevate whitespace-nowrap bg-slate-800/30 border-blue-500/20 hover:border-blue-400/40"
                          onClick={(e) => {
                            if (action.isHashAnchor) {
                              e.preventDefault();
                              scrollToAnchor(action.resolvedPath);
                            } else {
                              setLocation(action.resolvedPath);
                            }
                          }}
                          data-testid={action.testId}
                        >
                          <Icon className={`h-4 w-4 ${action.color} shrink-0`} />
                          <span className="text-[10px] font-medium leading-tight text-white">{action.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Operations & Monitoring */}
              {operationsActions.length > 0 && (
                <div className="mb-3">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-blue-400/70 mb-2 uppercase tracking-wider">Operations & Monitoring</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {operationsActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Button
                          key={action.id}
                          variant="outline"
                          size="sm"
                          className="flex-col h-auto min-h-[56px] px-2 py-2 gap-1 hover-elevate whitespace-nowrap bg-slate-800/30 border-primary/20 hover:border-blue-400/40"
                          onClick={(e) => {
                            if (action.isHashAnchor) {
                              e.preventDefault();
                              scrollToAnchor(action.resolvedPath);
                            } else {
                              setLocation(action.resolvedPath);
                            }
                          }}
                          data-testid={action.testId}
                        >
                          <Icon className={`h-4 w-4 ${action.color} shrink-0`} />
                          <span className="text-[10px] font-medium leading-tight text-white">{action.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Core Features */}
              {coreActions.length > 0 && (
                <div>
                  <h3 className="text-[10px] sm:text-xs font-semibold text-slate-400/70 mb-2 uppercase tracking-wider">Core Features</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {coreActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Button
                          key={action.id}
                          variant="outline"
                          size="sm"
                          className="flex-col h-auto min-h-[56px] px-2 py-2 gap-1 hover-elevate whitespace-nowrap bg-slate-800/30 border-slate-500/20 hover:border-slate-400/40"
                          onClick={(e) => {
                            if (action.isHashAnchor) {
                              e.preventDefault();
                              scrollToAnchor(action.resolvedPath);
                            } else {
                              setLocation(action.resolvedPath);
                            }
                          }}
                          data-testid={action.testId}
                        >
                          <Icon className={`h-4 w-4 ${action.color} shrink-0`} />
                          <span className="text-[10px] font-medium leading-tight text-white">{action.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 🔐 ADMIN CONTROLS - User & Workspace Management */}
          <Card className="border-primary/20 bg-gradient-to-br from-slate-900/50 via-red-950/10 to-slate-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3 pt-3 px-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                Platform Administration
              </CardTitle>
              <CardDescription className="text-xs">Search and manage users, workspaces, and permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4">
              {/* User Search & Management */}
              <div className="space-y-3" id="user-section">
                <div className="flex items-center gap-2">
                  <UserCog className="h-3.5 w-3.5 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">User Management</h3>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search users (min 3 chars)..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-primary/30 h-8 text-sm"
                    data-testid="input-user-search"
                  />
                </div>

                {userSearchResults && (userSearchResults as any[]).length > 0 && (
                  <ScrollArea className="h-[160px] border border-primary/20 rounded-lg bg-slate-800/30 p-2">
                    <div className="space-y-1.5">
                      {(userSearchResults as any[]).map((user: any) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-2 rounded-lg hover-elevate border border-slate-700 bg-slate-800/50"
                          data-testid={`user-result-${user.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-white truncate">
                                {user.firstName} {user.lastName}
                              </p>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {user.platformRole || 'guest'}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedUser(user)}
                            className="ml-2 h-6 text-[10px] px-2"
                            data-testid={`button-select-user-${user.id}`}
                          >
                            Manage
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

              {selectedUser && (
                <div className="border border-primary/30 rounded-lg p-4 bg-slate-950/20">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-primary">Managing: {selectedUser.firstName} {selectedUser.lastName}</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedUser(null)}
                      data-testid="button-close-user-panel"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Email:</span>
                        <p className="text-white font-medium">{selectedUser.email}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">User ID:</span>
                        <p className="text-white font-mono text-[10px]">{selectedUser.id}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          if (confirm('Are you sure you want to change this user\'s role?')) {
                            // This would need additional UI for role selection
                            toast({ title: "Feature", description: "Role change UI coming soon" });
                          }
                        }}
                        data-testid="button-change-role"
                      >
                        <UserCog className="h-3 w-3 mr-1" />
                        Change Role
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

              <div className="border-t border-slate-700 pt-3" />

              {/* Workspace Search & Management */}
              <div className="space-y-3" id="workspace-section">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-teal-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-400">Workspace Management</h3>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search workspaces (min 3 chars)..."
                    value={workspaceSearchQuery}
                    onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-orange-500/30 h-8 text-sm"
                    data-testid="input-workspace-search"
                  />
                </div>

                {workspaceSearchResults && (workspaceSearchResults as any[]).length > 0 && (
                  <ScrollArea className="h-[160px] border border-orange-500/20 rounded-lg bg-slate-800/30 p-2">
                    <div className="space-y-1.5">
                      {(workspaceSearchResults as any[]).map((workspace: any) => (
                        <div
                          key={workspace.id}
                          className="flex items-center justify-between p-2 rounded-lg hover-elevate border border-slate-700 bg-slate-800/50"
                          data-testid={`workspace-result-${workspace.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-white truncate">{workspace.name}</p>
                              {workspace.isSuspended && (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">Suspended</Badge>
                              )}
                              {workspace.isLocked && (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">Locked</Badge>
                              )}
                              {workspace.isFrozen && (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">Frozen</Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono">{workspace.id}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedWorkspace(workspace)}
                            className="ml-2 h-6 text-[10px] px-2"
                            data-testid={`button-select-workspace-${workspace.id}`}
                          >
                            Manage
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

              {selectedWorkspace && (
                <div className="border border-orange-500/30 rounded-lg p-4 bg-orange-950/20">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-orange-300">Managing: {selectedWorkspace.name}</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedWorkspace(null)}
                      data-testid="button-close-workspace-panel"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <div className="flex gap-1 mt-1">
                          {selectedWorkspace.isSuspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                          {selectedWorkspace.isLocked && <Badge variant="destructive" className="text-[10px]">Locked</Badge>}
                          {selectedWorkspace.isFrozen && <Badge variant="destructive" className="text-[10px]">Frozen</Badge>}
                          {!selectedWorkspace.isSuspended && !selectedWorkspace.isLocked && !selectedWorkspace.isFrozen && (
                            <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary">Active</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Workspace ID:</span>
                        <p className="text-white font-mono text-[10px] break-all">{selectedWorkspace.id}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {selectedWorkspace.isSuspended ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full bg-muted/10 border-primary/30 hover:bg-muted/20"
                          onClick={() => {
                            if (confirm('Unsuspend this account?')) {
                              unsuspendAccountMutation.mutate({ workspaceId: selectedWorkspace.id });
                            }
                          }}
                          disabled={unsuspendAccountMutation.isPending}
                          data-testid="button-unsuspend"
                        >
                          <Unlock className="h-3 w-3 mr-1" />
                          Unsuspend
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full"
                          onClick={() => {
                            const reason = prompt('Reason for suspension:');
                            if (reason) {
                              suspendAccountMutation.mutate({ workspaceId: selectedWorkspace.id, reason });
                            }
                          }}
                          disabled={suspendAccountMutation.isPending}
                          data-testid="button-suspend"
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Suspend
                        </Button>
                      )}

                      {selectedWorkspace.isLocked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full bg-muted/10 border-primary/30 hover:bg-muted/20"
                          onClick={() => {
                            if (confirm('Unlock this account?')) {
                              unlockAccountMutation.mutate({ workspaceId: selectedWorkspace.id });
                            }
                          }}
                          disabled={unlockAccountMutation.isPending}
                          data-testid="button-unlock"
                        >
                          <Unlock className="h-3 w-3 mr-1" />
                          Unlock
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full"
                          onClick={() => {
                            const reason = prompt('Reason for emergency lock:');
                            if (reason) {
                              lockAccountMutation.mutate({ workspaceId: selectedWorkspace.id, reason });
                            }
                          }}
                          disabled={lockAccountMutation.isPending}
                          data-testid="button-lock"
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          Lock
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </CardContent>
          </Card>
        </div>

      {/* Platform Business Metrics - COMPACT */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              New Customers
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 pt-1 px-4">
            <div className="text-2xl font-bold" data-testid="text-new-signups">
              {stats?.newSignups || 0}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Signed up this month
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
              Monthly Invoices
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 pt-1 px-4">
            <div className="text-2xl font-bold" data-testid="text-invoice-revenue">
              ${parseFloat(stats?.monthlyRevenue || "0").toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {stats?.invoiceCount || 0} invoices generated
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              Platform Fees Earned
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 pt-1 px-4">
            <div className="text-2xl font-bold" data-testid="text-platform-fees">
              ${parseFloat(stats?.platformFees || "0").toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Total earnings this month
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Ticket className="h-3.5 w-3.5 text-teal-500" />
              Live Support
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 pt-1 px-4">
            <div className="text-2xl font-bold text-orange-600" data-testid="text-open-tickets">
              {(supportStats as any)?.openTickets || 0}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Open tickets
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Metrics - Real Data Only */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Server className="h-3.5 w-3.5 text-blue-500" />
              Services Status
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 pt-1 px-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs">Web Application</span>
                <Badge variant="secondary" className="bg-muted/10 text-blue-600 text-[10px] py-0 h-5">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" />
                  Live
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">API Server</span>
                <Badge variant="secondary" className="bg-muted/10 text-blue-600 text-[10px] py-0 h-5">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" />
                  Live
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">Database</span>
                <Badge variant="secondary" className="bg-muted/10 text-blue-600 text-[10px] py-0 h-5">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" />
                  {stats?.systemHealth?.database || "healthy"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Users className="h-3.5 w-3.5 text-teal-500" />
              Platform Totals
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 pt-1 px-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs">Workspaces</span>
                <span className="text-lg font-bold">{stats?.totalWorkspaces || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">Total Users</span>
                <span className="text-lg font-bold">{stats?.totalUsers || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">Subscriptions</span>
                <span className="text-lg font-bold text-teal-600">{stats?.activeSubscriptions || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Health & Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="system-stats">
        {/* System Health Monitoring */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5 text-primary" />
                System Health
              </CardTitle>
              <CardDescription>Real-time server metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    <span>CPU Usage</span>
                  </div>
                  <span className="font-bold">{stats?.systemHealth?.cpu || 0}%</span>
                </div>
                <Progress value={stats?.systemHealth?.cpu || 0} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-blue-500" />
                    <span>Memory</span>
                  </div>
                  <span className="font-bold">{stats?.systemHealth?.memory || 0}%</span>
                </div>
                <Progress value={stats?.systemHealth?.memory || 0} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <span>Database</span>
                  </div>
                  <Badge variant="secondary" className="bg-muted/10 text-primary">
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
        </div>

        {/* Live Activity Feed */}
        <Card className="lg:col-span-2" id="recent-activity">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-primary animate-pulse" />
                  Live Platform Activity & Metrics
                </CardTitle>
                <CardDescription>Real-time events and comprehensive data analysis</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-muted/10 text-primary">
                <div className="h-2 w-2 bg-muted/30 rounded-full animate-pulse mr-2" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
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
    </div>
  );
}
