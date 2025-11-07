import { useState, useEffect } from "react";
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
import { AutoForceLogo } from "@/components/autoforce-logo";
import { TimeGreeting } from "@/components/time-greeting";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
  });
  
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
      if (platformRole !== 'root' && platformRole !== 'sysop') {
        if (!user) {
          window.location.href = '/login';
        } else {
          setLocation('/error-403');
        }
      }
    }
  }, [user, isLoading, setLocation]);

  // Initialize profile form when user data loads
  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: (user as any).firstName || '',
        lastName: (user as any).lastName || '',
      });
    }
  }, [user]);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      return await apiRequest('PATCH', '/api/auth/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platform/personal-data'] });
      setEditingProfile(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

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
      case "login": return <UserCheck className="h-4 w-4 text-emerald-500" />;
      case "invoice": return <DollarSign className="h-4 w-4 text-amber-500" />;
      case "subscription": return <Users className="h-4 w-4 text-emerald-500" />;
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900">
      {/* Animated background gradient orbs - Hidden on mobile for performance */}
      <div className="hidden sm:block absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-600/20 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-teal-600/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Main Content - More compact on mobile */}
      <div className="relative z-10 flex-1 overflow-auto p-3 sm:p-6 max-w-[1800px] mx-auto w-full space-y-3 sm:space-y-6">
        {/* Branded Header - Compact on mobile, full on desktop */}
        <div className="sm:mb-6">
          {/* Mobile Header - Very compact */}
          <div className="sm:hidden relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-3 border border-emerald-500/20">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-white truncate">
                  Platform Command
                </h1>
                {personalData && (
                  <p className="text-xs text-emerald-300 truncate">
                    {personalData.userName} · {personalData.assignedTickets + personalData.newSupportTickets} tasks
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRefreshKey(prev => prev + 1)}
                className="bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-white shrink-0"
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Desktop Header - Reduced Padding */}
          <div className="hidden sm:block relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-3 sm:p-4 border border-emerald-500/20 backdrop-blur-xl bg-white/5">
            {/* Logo and Title */}
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="transform hover:scale-105 transition-transform duration-300">
                  <AutoForceLogo size="lg" variant="icon" lightMode={true} />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white via-emerald-100 to-teal-200 bg-clip-text text-transparent">
                    Platform Command Center
                  </h1>
                  <p className="text-slate-400 text-xs sm:text-sm">
                    {getRoleTitle()}
                  </p>
                  <TimeGreeting 
                    userName={personalData?.userName}
                    role=""
                    className="text-emerald-300 text-xs mt-0.5"
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
                
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setRefreshKey(prev => prev + 1)}
                  className="bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-white"
                  data-testid="button-refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Access Menu - Organized by Categories */}
        <Card className="border-emerald-500/20 bg-gradient-to-br from-slate-900/50 via-emerald-950/30 to-slate-900/50 backdrop-blur-sm">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400 shrink-0" />
              <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-white">Quick Access</h2>
            </div>

            {/* Support & Helpdesk Tools */}
            <div className="mb-4">
              <h3 className="text-[10px] sm:text-xs font-semibold text-emerald-400/70 mb-2 uppercase tracking-wider">Support & Helpdesk</h3>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 mobile-scroll">
                {[
                  { icon: Ticket, label: "Support Tickets", link: "/admin-command-center", color: "text-emerald-400", testid: "quick-tickets" },
                  { icon: MessageSquare, label: "Live Chat", link: "/mobile-chat", color: "text-teal-400", testid: "quick-chat" },
                  { icon: HelpCircle, label: "Help Desk", link: "/helpdesk5", color: "text-green-400", testid: "quick-helpdesk" },
                  { icon: Mail, label: "Support Email", link: "/contact", color: "text-emerald-500", testid: "quick-email" }
                ].map((feature) => (
                  <Button
                    key={feature.link}
                    variant="outline"
                    size="sm"
                    className="flex-col h-auto min-h-[60px] sm:min-h-[72px] min-w-[68px] sm:min-w-[80px] px-2 sm:px-3 py-2 sm:py-3 gap-1 sm:gap-2 hover-elevate whitespace-nowrap bg-slate-800/30 border-emerald-500/20 hover:border-emerald-400/40"
                    asChild
                  >
                    <Link href={feature.link} data-testid={feature.testid}>
                      <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} shrink-0`} />
                      <span className="text-[10px] sm:text-xs font-medium leading-tight text-white">{feature.label}</span>
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            {/* Platform Management Tools */}
            <div className="mb-4">
              <h3 className="text-[10px] sm:text-xs font-semibold text-teal-400/70 mb-2 uppercase tracking-wider">Platform Management</h3>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 mobile-scroll">
                {[
                  { icon: Users, label: "Users", link: "#user-section", color: "text-emerald-400", testid: "quick-users" },
                  { icon: Building2, label: "Workspaces", link: "#workspace-section", color: "text-teal-400", testid: "quick-workspaces" },
                  { icon: ScrollText, label: "Audit Logs", link: "/audit-trail", color: "text-green-400", testid: "quick-audit" },
                  { icon: Database, label: "DB Admin", link: "#workspace-section", color: "text-emerald-500", testid: "quick-database" },
                  { icon: Key, label: "API Keys", link: "#user-section", color: "text-teal-500", testid: "quick-apikeys" },
                  { icon: Flag, label: "Feature Flags", link: "/settings", color: "text-green-500", testid: "quick-flags" }
                ].map((feature) => (
                  <Button
                    key={feature.link}
                    variant="outline"
                    size="sm"
                    className="flex-col h-auto min-h-[60px] sm:min-h-[72px] min-w-[68px] sm:min-w-[80px] px-2 sm:px-3 py-2 sm:py-3 gap-1 sm:gap-2 hover-elevate whitespace-nowrap bg-slate-800/30 border-teal-500/20 hover:border-teal-400/40"
                    asChild
                    onClick={(e) => {
                      if (feature.link.startsWith('#')) {
                        e.preventDefault();
                        const element = document.querySelector(feature.link);
                        element?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  >
                    {feature.link.startsWith('#') ? (
                      <a href={feature.link} data-testid={feature.testid}>
                        <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} shrink-0`} />
                        <span className="text-[10px] sm:text-xs font-medium leading-tight text-white">{feature.label}</span>
                      </a>
                    ) : (
                      <Link href={feature.link} data-testid={feature.testid}>
                        <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} shrink-0`} />
                        <span className="text-[10px] sm:text-xs font-medium leading-tight text-white">{feature.label}</span>
                      </Link>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {/* Operations & Monitoring */}
            <div className="mb-4">
              <h3 className="text-[10px] sm:text-xs font-semibold text-green-400/70 mb-2 uppercase tracking-wider">Operations & Monitoring</h3>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 mobile-scroll">
                {[
                  { icon: Gauge, label: "System Health", link: "#system-stats", color: "text-emerald-400", testid: "quick-health" },
                  { icon: AlertCircle, label: "Error Logs", link: "#recent-activity", color: "text-amber-400", testid: "quick-errors" },
                  { icon: ActivityIcon, label: "Performance", link: "#system-stats", color: "text-teal-400", testid: "quick-performance" },
                  { icon: Webhook, label: "Webhooks", link: "/settings", color: "text-green-400", testid: "quick-webhooks" },
                  { icon: Code, label: "API Status", link: "#system-stats", color: "text-emerald-500", testid: "quick-api" }
                ].map((feature) => (
                  <Button
                    key={feature.link}
                    variant="outline"
                    size="sm"
                    className="flex-col h-auto min-h-[60px] sm:min-h-[72px] min-w-[68px] sm:min-w-[80px] px-2 sm:px-3 py-2 sm:py-3 gap-1 sm:gap-2 hover-elevate whitespace-nowrap bg-slate-800/30 border-green-500/20 hover:border-green-400/40"
                    asChild
                  >
                    <Link href={feature.link} data-testid={feature.testid}>
                      <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} shrink-0`} />
                      <span className="text-[10px] sm:text-xs font-medium leading-tight text-white">{feature.label}</span>
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            {/* Core Features */}
            <div>
              <h3 className="text-[10px] sm:text-xs font-semibold text-slate-400/70 mb-2 uppercase tracking-wider">Core Features</h3>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 mobile-scroll">
                {[
                  { icon: Calendar, label: "Schedule", link: "/schedule", color: "text-emerald-400", testid: "quick-schedule" },
                  { icon: Clock, label: "Time Clock", link: "/time-tracking", color: "text-teal-400", testid: "quick-timeclock" },
                  { icon: Receipt, label: "Invoices", link: "/invoices", color: "text-green-400", testid: "quick-invoices" },
                  { icon: DollarSign, label: "Payroll", link: "/payroll-dashboard", color: "text-emerald-500", testid: "quick-payroll" },
                  { icon: UserPlus, label: "Hiring", link: "/employees", color: "text-teal-500", testid: "quick-hiring" },
                  { icon: GraduationCap, label: "Training", link: "/training-os", color: "text-green-500", testid: "quick-training" },
                  { icon: BarChart3, label: "Analytics", link: "/analytics", color: "text-emerald-600", testid: "quick-analytics" },
                  { icon: Grid3x3, label: "All Features", link: "/os-family-platform", color: "text-slate-400", testid: "quick-all" }
                ].map((feature) => (
                  <Button
                    key={feature.link}
                    variant="outline"
                    size="sm"
                    className="flex-col h-auto min-h-[60px] sm:min-h-[72px] min-w-[68px] sm:min-w-[80px] px-2 sm:px-3 py-2 sm:py-3 gap-1 sm:gap-2 hover-elevate whitespace-nowrap bg-slate-800/30 border-slate-500/20 hover:border-slate-400/40"
                    asChild
                  >
                    <Link href={feature.link} data-testid={feature.testid}>
                      <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} shrink-0`} />
                      <span className="text-[10px] sm:text-xs font-medium leading-tight text-white">{feature.label}</span>
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 🔐 ADMIN CONTROLS - User & Workspace Management */}
        <Card className="border-emerald-500/20 bg-gradient-to-br from-slate-900/50 via-red-950/10 to-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              Platform Administration Controls
            </CardTitle>
            <CardDescription>Search and manage users, workspaces, and permissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* User Search & Management */}
            <div className="space-y-4" id="user-section">
              <div className="flex items-center gap-2 mb-3">
                <UserCog className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-400">User Management</h3>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by ID, email, or name (min 3 chars)..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800/50 border-emerald-500/30"
                  data-testid="input-user-search"
                />
              </div>

              {userSearchResults && (userSearchResults as any[]).length > 0 && (
                <ScrollArea className="h-[200px] border border-emerald-500/20 rounded-lg bg-slate-800/30 p-2">
                  <div className="space-y-2">
                    {(userSearchResults as any[]).map((user: any) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 rounded-lg hover-elevate border border-slate-700 bg-slate-800/50"
                        data-testid={`user-result-${user.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">
                              {user.firstName} {user.lastName}
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              {user.platformRole || 'guest'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          <p className="text-xs text-muted-foreground/70 font-mono">{user.id}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedUser(user)}
                          className="ml-2"
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
                <div className="border border-emerald-500/30 rounded-lg p-4 bg-emerald-950/20">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-emerald-300">Managing: {selectedUser.firstName} {selectedUser.lastName}</h4>
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

            <div className="border-t border-slate-700 pt-4" />

            {/* Workspace Search & Management */}
            <div className="space-y-4" id="workspace-section">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-teal-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-400">Workspace Management</h3>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search workspaces by name or ID (min 3 chars)..."
                  value={workspaceSearchQuery}
                  onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800/50 border-orange-500/30"
                  data-testid="input-workspace-search"
                />
              </div>

              {workspaceSearchResults && (workspaceSearchResults as any[]).length > 0 && (
                <ScrollArea className="h-[200px] border border-orange-500/20 rounded-lg bg-slate-800/30 p-2">
                  <div className="space-y-2">
                    {(workspaceSearchResults as any[]).map((workspace: any) => (
                      <div
                        key={workspace.id}
                        className="flex items-center justify-between p-3 rounded-lg hover-elevate border border-slate-700 bg-slate-800/50"
                        data-testid={`workspace-result-${workspace.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">{workspace.name}</p>
                            {workspace.isSuspended && (
                              <Badge variant="destructive" className="text-xs">Suspended</Badge>
                            )}
                            {workspace.isLocked && (
                              <Badge variant="destructive" className="text-xs">Locked</Badge>
                            )}
                            {workspace.isFrozen && (
                              <Badge variant="destructive" className="text-xs">Frozen</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">{workspace.id}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedWorkspace(workspace)}
                          className="ml-2"
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
                            <Badge variant="secondary" className="text-[10px] bg-green-500/20 text-green-400">Active</Badge>
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
                          className="w-full bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
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
                          className="w-full bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
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

        {/* My Profile Section - Desktop only, moved to settings on mobile */}
        <Card className="hidden md:block border-emerald-500/20 bg-gradient-to-br from-slate-900/50 via-emerald-950/30 to-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-400" />
              My Profile
            </CardTitle>
            <CardDescription>Manage your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email (readonly) */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Email</Label>
                <Input
                  value={(user as any)?.email || ''}
                  disabled
                  className="bg-slate-800/50 border-slate-700 text-slate-400"
                  data-testid="input-profile-email"
                />
              </div>

              {/* User ID (readonly) */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">User ID</Label>
                <Input
                  value={(user as any)?.id || ''}
                  disabled
                  className="bg-slate-800/50 border-slate-700 text-slate-400 font-mono text-xs"
                  data-testid="text-profile-id"
                />
              </div>

              {/* First Name (editable) */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">First Name</Label>
                <Input
                  value={editingProfile ? profileForm.firstName : ((user as any)?.firstName || '')}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                  disabled={!editingProfile}
                  className={editingProfile ? "bg-slate-800/50 border-emerald-500/50" : "bg-slate-800/50 border-slate-700 text-slate-300"}
                  data-testid="input-profile-firstName"
                />
              </div>

              {/* Last Name (editable) */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Last Name</Label>
                <Input
                  value={editingProfile ? profileForm.lastName : ((user as any)?.lastName || '')}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                  disabled={!editingProfile}
                  className={editingProfile ? "bg-slate-800/50 border-emerald-500/50" : "bg-slate-800/50 border-slate-700 text-slate-300"}
                  data-testid="input-profile-lastName"
                />
              </div>

              {/* Platform Role (readonly) */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Platform Role</Label>
                <div className="flex items-center h-9 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-md">
                  <Badge variant="secondary" className="text-xs">
                    {(user as any)?.platformRole || 'guest'}
                  </Badge>
                </div>
              </div>

              {/* Account Created (readonly) */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Account Created</Label>
                <Input
                  value={(user as any)?.createdAt ? new Date((user as any).createdAt).toLocaleDateString() : 'N/A'}
                  disabled
                  className="bg-slate-800/50 border-slate-700 text-slate-400"
                  data-testid="text-profile-created"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {!editingProfile ? (
                <Button
                  onClick={() => {
                    setProfileForm({
                      firstName: (user as any)?.firstName || '',
                      lastName: (user as any)?.lastName || '',
                    });
                    setEditingProfile(true);
                  }}
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-white"
                  data-testid="button-edit-profile"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => updateProfileMutation.mutate(profileForm)}
                    disabled={updateProfileMutation.isPending}
                    className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-white"
                    data-testid="button-save-profile"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingProfile(false);
                      setProfileForm({
                        firstName: (user as any)?.firstName || '',
                        lastName: (user as any)?.lastName || '',
                      });
                    }}
                    variant="outline"
                    className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-white"
                    data-testid="button-cancel-profile"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

      {/* Platform Business Metrics - COMPACT */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Building2 className="h-3.5 w-3.5 text-emerald-500" />
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

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
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

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
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
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Server className="h-3.5 w-3.5 text-green-500" />
              Services Status
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 pt-1 px-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs">Web Application</span>
                <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-[10px] py-0 h-5">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" />
                  Live
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">API Server</span>
                <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-[10px] py-0 h-5">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" />
                  Live
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">Database</span>
                <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-[10px] py-0 h-5">
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
                <Server className="h-5 w-5 text-emerald-500" />
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
                    <Database className="h-4 w-4 text-emerald-500" />
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
        </div>

        {/* Live Activity Feed */}
        <Card className="lg:col-span-2" id="recent-activity">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-emerald-500 animate-pulse" />
                  Live Platform Activity & Metrics
                </CardTitle>
                <CardDescription>Real-time events and comprehensive data analysis</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse mr-2" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* Metrics Grid - Mobile-Optimized */}
            <div className="mb-6 space-y-4">
              {/* Business Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-emerald-400 mb-2">Workspaces</div>
                  <div className="text-2xl font-bold text-white">{stats?.totalWorkspaces || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-teal-500/10 to-emerald-500/10 border border-teal-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-teal-400 mb-2">Users</div>
                  <div className="text-2xl font-bold text-white">{stats?.totalUsers || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-teal-500/10 to-green-500/10 border border-teal-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-teal-400 mb-2">Subscriptions</div>
                  <div className="text-2xl font-bold text-teal-400">{stats?.activeSubscriptions || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-emerald-400 mb-2">New (Month)</div>
                  <div className="text-2xl font-bold text-emerald-400">{stats?.newSignups || 0}</div>
                </div>
              </div>

              {/* Revenue Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-emerald-400 mb-2">Revenue</div>
                  <div className="text-lg font-bold text-emerald-400">${parseFloat(stats?.monthlyRevenue || "0").toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-amber-400 mb-2">Platform Fees</div>
                  <div className="text-lg font-bold text-amber-400">${parseFloat(stats?.platformFees || "0").toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-emerald-400 mb-2">Invoices</div>
                  <div className="text-2xl font-bold text-white">{stats?.invoiceCount || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-teal-500/10 to-teal-500/10 border border-teal-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-teal-400 mb-2">Avg Revenue</div>
                  <div className="text-lg font-bold text-white">${parseFloat(stats?.avgRevenue || "0").toFixed(0)}</div>
                </div>
              </div>

              {/* Support Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-green-500/10 to-rose-500/10 border border-green-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-green-400 mb-2">Chat Users</div>
                  <div className="text-2xl font-bold text-green-400">{stats?.chatUsers || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-emerald-400 mb-2">Chat Staff</div>
                  <div className="text-2xl font-bold text-emerald-400">{stats?.chatStaff || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-orange-400 mb-2">Open Tickets</div>
                  <div className="text-2xl font-bold text-orange-400">{(supportStats as any)?.openTickets || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-red-500/10 to-rose-500/10 border border-red-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-red-400 mb-2">Churn Rate</div>
                  <div className="text-2xl font-bold text-red-400">{stats?.churnRate || "0"}%</div>
                </div>
              </div>

              {/* System Health */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-slate-500/10 to-gray-500/10 border border-slate-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-400 mb-2">CPU Usage</div>
                  <div className="text-2xl font-bold text-white">{stats?.systemHealth?.cpu || 0}%</div>
                </div>
                <div className="bg-gradient-to-br from-sky-500/10 to-emerald-500/10 border border-sky-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-sky-400 mb-2">Memory</div>
                  <div className="text-2xl font-bold text-white">{stats?.systemHealth?.memory || 0}%</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-emerald-400 mb-2">Database</div>
                  <div className="text-base font-bold text-emerald-400 capitalize">{stats?.systemHealth?.database || "healthy"}</div>
                </div>
                <div className="bg-gradient-to-br from-teal-500/10 to-teal-500/10 border border-teal-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-teal-400 mb-2">Uptime</div>
                  <div className="text-base font-mono font-bold text-white">{stats?.systemHealth?.uptime ? formatUptime(stats.systemHealth.uptime) : "0d 0h"}</div>
                </div>
              </div>
            </div>

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
