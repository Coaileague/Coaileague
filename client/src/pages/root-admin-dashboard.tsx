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
  Zap, Clock, UserCheck, Ticket, MessageSquare, BarChart3, Search, ExternalLink,
  MapPin, Calendar, Mail, Phone, User, Save, Receipt, UserPlus, GraduationCap, Grid3x3
} from "lucide-react";
import { AutoForceLogo } from "@/components/autoforce-logo";

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
  const { user, isLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
  });
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

  // Real-time clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Fetch personal staff data for welcome message
  const { data: personalData } = useQuery<{
    userName: string;
    assignedTickets: number;
    newSupportTickets: number;
  }>({
    queryKey: ["/api/platform/personal-data", refreshKey],
    refetchInterval: 10000,
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-600/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 overflow-auto p-6 max-w-[1800px] mx-auto w-full space-y-6">
        {/* Branded Header with Large Logo */}
        <div className="mb-6">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 border border-indigo-500/20 backdrop-blur-xl bg-white/5">
            {/* Local animated gradient orbs */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            
            {/* Logo and Title */}
            <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 mb-6">
              <div className="transform hover:scale-105 transition-transform duration-300 drop-shadow-2xl">
                <AutoForceLogo size="lg" variant="full" />
              </div>
              <div className="text-center sm:text-left flex-1">
                <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent mb-2">
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
              
              {/* Clock and Refresh Button */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-white">
                    {currentTime.toLocaleTimeString()}
                  </div>
                  <div className="text-xs text-slate-400">
                    {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setRefreshKey(prev => prev + 1)}
                  className="bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20 text-white"
                  data-testid="button-refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Access Menu */}
        <Card className="border-indigo-500/20 bg-gradient-to-br from-slate-900/50 via-indigo-950/30 to-slate-900/50 backdrop-blur-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-400 shrink-0" />
              <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-white">Quick Access</h2>
            </div>
            <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 mobile-scroll">
              {[
                { icon: Calendar, label: "Schedule", link: "/schedule", color: "text-blue-500", testid: "quick-schedule" },
                { icon: Clock, label: "Time Clock", link: "/time-tracking", color: "text-emerald-500", testid: "quick-timeclock" },
                { icon: Receipt, label: "Invoices", link: "/invoices", color: "text-purple-500", testid: "quick-invoices" },
                { icon: DollarSign, label: "Payroll", link: "/payroll-dashboard", color: "text-green-500", testid: "quick-payroll" },
                { icon: UserPlus, label: "Hiring", link: "/employees", color: "text-orange-500", testid: "quick-hiring" },
                { icon: GraduationCap, label: "Training", link: "/training-os", color: "text-indigo-500", testid: "quick-training" },
                { icon: BarChart3, label: "Analytics", link: "/analytics", color: "text-pink-500", testid: "quick-analytics" },
                { icon: Grid3x3, label: "All Features", link: "/os-family-platform", color: "text-gray-400", testid: "quick-all" }
              ].map((feature) => (
                <Button
                  key={feature.link}
                  variant="outline"
                  size="sm"
                  className="flex-col h-auto min-h-[64px] sm:min-h-[72px] min-w-[72px] sm:min-w-[80px] px-2 sm:px-3 py-2 sm:py-3 gap-1 sm:gap-2 hover-elevate whitespace-nowrap bg-slate-800/30 border-indigo-500/20 hover:border-indigo-400/40"
                  asChild
                >
                  <Link href={feature.link} data-testid={feature.testid}>
                    <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} shrink-0`} />
                    <span className="text-[10px] sm:text-xs font-medium leading-tight text-white">{feature.label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* My Profile Section */}
        <Card className="border-indigo-500/20 bg-gradient-to-br from-slate-900/50 via-indigo-950/30 to-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-400" />
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
                  className={editingProfile ? "bg-slate-800/50 border-indigo-500/50" : "bg-slate-800/50 border-slate-700 text-slate-300"}
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
                  className={editingProfile ? "bg-slate-800/50 border-indigo-500/50" : "bg-slate-800/50 border-slate-700 text-slate-300"}
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
                  className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-white"
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
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Building2 className="h-3.5 w-3.5 text-blue-500" />
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

        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Ticket className="h-3.5 w-3.5 text-violet-500" />
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

        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
              <Users className="h-3.5 w-3.5 text-cyan-500" />
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
                <span className="text-lg font-bold text-violet-600">{stats?.activeSubscriptions || 0}</span>
              </div>
            </div>
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
                <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-blue-400 mb-2">Workspaces</div>
                  <div className="text-2xl font-bold text-white">{stats?.totalWorkspaces || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-cyan-400 mb-2">Users</div>
                  <div className="text-2xl font-bold text-white">{stats?.totalUsers || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-violet-400 mb-2">Subscriptions</div>
                  <div className="text-2xl font-bold text-violet-400">{stats?.activeSubscriptions || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-blue-400 mb-2">New (Month)</div>
                  <div className="text-2xl font-bold text-blue-400">{stats?.newSignups || 0}</div>
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
                <div className="bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-indigo-400 mb-2">Invoices</div>
                  <div className="text-2xl font-bold text-white">{stats?.invoiceCount || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border border-teal-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-teal-400 mb-2">Avg Revenue</div>
                  <div className="text-lg font-bold text-white">${parseFloat(stats?.avgRevenue || "0").toFixed(0)}</div>
                </div>
              </div>

              {/* Support Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-purple-400 mb-2">Chat Users</div>
                  <div className="text-2xl font-bold text-purple-400">{stats?.chatUsers || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-blue-400 mb-2">Chat Staff</div>
                  <div className="text-2xl font-bold text-blue-400">{stats?.chatStaff || 0}</div>
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
                <div className="bg-gradient-to-br from-sky-500/10 to-blue-500/10 border border-sky-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-sky-400 mb-2">Memory</div>
                  <div className="text-2xl font-bold text-white">{stats?.systemHealth?.memory || 0}%</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-emerald-400 mb-2">Database</div>
                  <div className="text-base font-bold text-emerald-400 capitalize">{stats?.systemHealth?.database || "healthy"}</div>
                </div>
                <div className="bg-gradient-to-br from-cyan-500/10 to-teal-500/10 border border-cyan-500/20 rounded-xl p-4">
                  <div className="text-xs font-medium text-cyan-400 mb-2">Uptime</div>
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
