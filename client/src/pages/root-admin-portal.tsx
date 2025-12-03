import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiPost } from "@/lib/apiClient";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Users, Building2, DollarSign, TrendingUp, TrendingDown, Server, Database,
  Zap, AlertTriangle, CheckCircle, Clock, Globe, Cpu, HardDrive, Wifi, RefreshCw,
  Settings, Shield, BarChart3, UserCheck, UserX, Search, Mail, CreditCard,
  Ticket, AlertCircle, XCircle, Trash2, UserCog, UserPlus, Receipt, Power,
  MessageSquare, Send, Headphones, User, Circle, Info, Bot, Mic, MicOff, Sparkles,
  Building, Lock, Unlock, Ban, Play, Pause
} from "lucide-react";
import type { ChatConversation, ChatMessage } from "@shared/schema";

interface LiveActivity {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  workspace: string;
  type: "login" | "shift_created" | "invoice_generated" | "employee_added" | "error";
}

interface CustomerSearchResult {
  workspace: {
    id: string;
    name: string;
    companyName?: string;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    organizationId?: string;
  };
  owner: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  subscription?: {
    plan: string;
    status: string;
  };
  stats: {
    employeeCount: number;
    clientCount: number;
    invoiceCount: number;
    activeTickets: number;
  };
}

interface WorkspaceDetail {
  workspace: any;
  owner: any;
  subscription?: any;
  users: Array<{ user: any; employee?: any }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
  billing: {
    totalRevenue: string;
    paidInvoices: number;
    pendingInvoices: number;
    stripeConnected: boolean;
  };
  tickets: any[];
  businessCategory: {
    category: string;
    availableTemplates: string[];
    installedTemplates: Array<{ name: string; category: string; isActive: boolean }>;
  };
}

interface PlatformStaffUser {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  grantedAt?: string;
  grantedBy?: string;
  isSuspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: string;
  lastLoginAt?: string;
}

type PlatformRoleType = 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer';

const PLATFORM_ROLES: { value: PlatformRoleType; label: string; description: string }[] = [
  { value: 'root_admin', label: 'Root Admin', description: 'Full platform access including destructive operations' },
  { value: 'deputy_admin', label: 'Deputy Admin', description: 'Full ops control, day-to-day platform management' },
  { value: 'sysop', label: 'System Operator', description: 'Backend, deployment, diagnostics, service restarts' },
  { value: 'support_manager', label: 'Support Manager', description: 'Manage support team and escalated tickets' },
  { value: 'support_agent', label: 'Support Agent', description: 'Handle customer support tickets and chat' },
  { value: 'compliance_officer', label: 'Compliance Officer', description: 'Audit access and compliance oversight' },
];

export default function RootAdminPortal() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [actionData, setActionData] = useState<any>({});
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Support Staff Management State
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [selectedStaffUser, setSelectedStaffUser] = useState<PlatformStaffUser | null>(null);
  const [staffActionDialog, setStaffActionDialog] = useState<string | null>(null);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<PlatformRoleType>("support_agent");
  const [suspendReason, setSuspendReason] = useState("");

  // GATEKEEPER: Microsoft-style access control - Block unauthorized users
  useEffect(() => {
    if (!isLoading) {
      const platformRole = (user as any)?.platformRole;
      
      // Only root_admin and sysop can access root admin portal
      if (platformRole !== 'root_admin' && platformRole !== 'sysop') {
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

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Real-time platform activity feed from database
  const { data: liveActivitiesData } = useQuery<LiveActivity[]>({
    queryKey: ["/api/admin/platform/activities", refreshKey],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Update state when data changes
  useEffect(() => {
    if (liveActivitiesData && liveActivitiesData.length > 0) {
      setLiveActivities(liveActivitiesData);
    }
  }, [liveActivitiesData]);

  // Fetch queries
  const { data: platformStats } = useQuery({
    queryKey: ["/api/analytics/stats", refreshKey],
  });

  const { data: supportStats } = useQuery({
    queryKey: ["/api/admin/support/stats", refreshKey],
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery<CustomerSearchResult[]>({
    queryKey: ["/api/admin/support/search", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
  });

  const { data: workspaceDetail, isLoading: detailLoading } = useQuery<WorkspaceDetail>({
    queryKey: ["/api/admin/support/workspace", selectedWorkspace],
    enabled: !!selectedWorkspace,
  });

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 3000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", selectedConversation, "messages"],
    enabled: !!selectedConversation,
    refetchInterval: 2000,
  });

  // Platform Staff Query
  const { data: staffData, isLoading: staffLoading, refetch: refetchStaff } = useQuery<{ staff: PlatformStaffUser[] }>({
    queryKey: ["/api/platform/staff", refreshKey],
  });
  const platformStaff = staffData?.staff || [];

  // Filter staff by search query
  const filteredStaff = platformStaff.filter((staff) => {
    if (!staffSearchQuery) return true;
    const query = staffSearchQuery.toLowerCase();
    return (
      staff.email?.toLowerCase().includes(query) ||
      staff.firstName?.toLowerCase().includes(query) ||
      staff.lastName?.toLowerCase().includes(query) ||
      staff.role?.toLowerCase().includes(query)
    );
  });

  // System health metrics - fetched from real monitoring API
  const { data: systemHealthData } = useQuery<{
    cpu?: { percent?: number };
    memory?: { percent?: number };
    database?: { latencyMs?: number };
    uptime?: string;
    requests?: { total?: number };
    errors?: { count?: number };
    connections?: { activeUsers?: number };
  }>({
    queryKey: ["/api/monitoring/system-health", refreshKey],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const systemHealth = {
    cpu: systemHealthData?.cpu?.percent || 0,
    memory: systemHealthData?.memory?.percent || 0,
    database: systemHealthData?.database?.latencyMs ? Math.min(100, 100 - systemHealthData.database.latencyMs / 10) : 0,
    uptime: systemHealthData?.uptime || "N/A",
    requests: systemHealthData?.requests?.total?.toLocaleString() || "0",
    errors: systemHealthData?.errors?.count || 0,
    activeUsers: systemHealthData?.connections?.activeUsers || 0,
  };

  // Mutations
  const suspendAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string; reason: string }) =>
      apiPost('admin.suspendAccount', data),
    onSuccess: () => {
      toast({ title: "Account Suspended", description: "Account has been suspended successfully" });
      setActionDialog(null);
    },
  });

  const unsuspendAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string }) =>
      apiPost('admin.unsuspendAccount', data),
    onSuccess: () => {
      toast({ title: "Account Unsuspended", description: "Account has been reactivated" });
      setActionDialog(null);
    },
  });

  const freezeAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string; reason: string }) =>
      apiPost('admin.freezeAccount', data),
    onSuccess: () => {
      toast({ title: "Account Frozen", description: "Account frozen for non-payment" });
      setActionDialog(null);
    },
  });

  const unfreezeAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string }) =>
      apiPost('admin.unfreezeAccount', data),
    onSuccess: () => {
      toast({ title: "Account Unfrozen", description: "Account has been unfrozen" });
      setActionDialog(null);
    },
  });

  const lockAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string; reason: string }) =>
      apiPost('admin.lockAccount', data),
    onSuccess: () => {
      toast({ title: "Account Locked", description: "Account locked for security" });
      setActionDialog(null);
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string }) =>
      apiPost('admin.unlockAccount', data),
    onSuccess: () => {
      toast({ title: "Account Unlocked", description: "Account has been unlocked" });
      setActionDialog(null);
    },
  });

  const changeUserRoleMutation = useMutation({
    mutationFn: (data: { userId: string; newRole: string; workspaceId: string }) =>
      apiPost('admin.changeUserRole', data),
    onSuccess: () => {
      toast({ title: "Role Updated", description: "User role has been changed" });
      setActionDialog(null);
    },
  });

  const sendMessage = useMutation({
    mutationFn: (data: { conversationId: string; content: string }) =>
      apiPost('chat.sendMessage', { conversationId: data.conversationId, message: data.content, messageType: "text" }),
    onSuccess: () => {
      setMessageText("");
    },
  });

  const grantVoice = useMutation({
    mutationFn: (conversationId: string) =>
      apiPost('chat.grantVoice', { conversationId }),
    onSuccess: () => {
      toast({ title: "Voice Granted", description: "User can now send messages" });
    },
  });

  const closeConversation = useMutation({
    mutationFn: (conversationId: string) =>
      apiPost('chat.closeConversation', { conversationId }),
    onSuccess: () => {
      toast({ title: "Conversation Closed", description: "Conversation has been closed" });
    },
  });

  const createConversation = useMutation({
    mutationFn: (data: any) =>
      apiPost('chat.createConversation', data),
    onSuccess: (data: any) => {
      setSelectedConversation(data.id);
      toast({ 
        title: "Entered Chat Room", 
        description: data.isSilenced ? "You're in the queue. Please wait for voice grant." : "You're now in the live chat room!"
      });
    },
  });

  // Support Staff Management Mutations
  const grantPlatformRoleMutation = useMutation({
    mutationFn: (data: { email: string; role: PlatformRoleType }) =>
      apiPost('platform.grantRole', data),
    onSuccess: () => {
      toast({ title: "Role Granted", description: "Platform role has been granted successfully" });
      setStaffActionDialog(null);
      setNewStaffEmail("");
      refetchStaff();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to grant role", variant: "destructive" });
    },
  });

  const revokePlatformRoleMutation = useMutation({
    mutationFn: (data: { userId: string }) =>
      apiPost('platform.revokeRole', data),
    onSuccess: () => {
      toast({ title: "Role Revoked", description: "Platform role has been revoked" });
      setStaffActionDialog(null);
      setSelectedStaffUser(null);
      refetchStaff();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to revoke role", variant: "destructive" });
    },
  });

  const suspendStaffMutation = useMutation({
    mutationFn: (data: { userId: string; reason: string }) =>
      apiPost('platform.suspendStaff', data),
    onSuccess: () => {
      toast({ title: "Staff Suspended", description: "Support staff member has been suspended for investigation" });
      setStaffActionDialog(null);
      setSuspendReason("");
      refetchStaff();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to suspend staff", variant: "destructive" });
    },
  });

  const unsuspendStaffMutation = useMutation({
    mutationFn: (data: { userId: string }) =>
      apiPost('platform.unsuspendStaff', data),
    onSuccess: () => {
      toast({ title: "Staff Reinstated", description: "Support staff member has been reinstated" });
      setStaffActionDialog(null);
      refetchStaff();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reinstate staff", variant: "destructive" });
    },
  });

  const changePlatformRoleMutation = useMutation({
    mutationFn: (data: { userId: string; newRole: PlatformRoleType }) =>
      apiPost('platform.changeRole', data),
    onSuccess: () => {
      toast({ title: "Role Changed", description: "Platform role has been updated" });
      setStaffActionDialog(null);
      refetchStaff();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to change role", variant: "destructive" });
    },
  });

  // Helper functions
  const getActivityIcon = (type: LiveActivity["type"]) => {
    switch (type) {
      case "login": return <UserCheck className="h-4 w-4 text-primary" />;
      case "shift_created": return <Clock className="h-4 w-4 text-blue-500" />;
      case "invoice_generated": return <DollarSign className="h-4 w-4 text-blue-500" />;
      case "employee_added": return <Users className="h-4 w-4 text-violet-500" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Activity className="h-4 w-4" />;
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !messageText.trim()) return;
    sendMessage.mutate({
      conversationId: selectedConversation,
      content: messageText.trim(),
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Stats for dashboard
  const activeConversations = conversations.filter(c => c.status === 'active');
  const silencedUsers = conversations.filter(c => c.isSilenced && c.status === 'active');

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
                <h1 className="text-3xl font-bold">Root Admin Command Center</h1>
                <p className="text-sm text-muted-foreground">
                  Platform monitoring · Customer support · System administration
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

        {/* Main Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto">
            <TabsTrigger value="overview" data-testid="tab-platform-overview">
              <BarChart3 className="mr-2 h-4 w-4" />
              Platform Overview
            </TabsTrigger>
            <TabsTrigger value="staff" data-testid="tab-support-staff">
              <Shield className="mr-2 h-4 w-4" />
              Support Staff
            </TabsTrigger>
            <TabsTrigger value="support" data-testid="tab-customer-support">
              <UserCog className="mr-2 h-4 w-4" />
              Customer Support
            </TabsTrigger>
            <TabsTrigger value="chat" data-testid="tab-live-chat">
              <MessageSquare className="mr-2 h-4 w-4" />
              Live Chat
            </TabsTrigger>
            <TabsTrigger value="tickets" data-testid="tab-support-tickets">
              <Ticket className="mr-2 h-4 w-4" />
              Support Tickets
            </TabsTrigger>
            <TabsTrigger value="system" data-testid="tab-system-admin">
              <Server className="mr-2 h-4 w-4" />
              System Admin
            </TabsTrigger>
          </TabsList>

          {/* PLATFORM OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            {/* System Health Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-primary">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    CPU Usage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-2" data-testid="text-cpu-usage">{systemHealth.cpu}%</div>
                  <Progress value={systemHealth.cpu} className="h-2" />
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Memory
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-2" data-testid="text-memory-usage">{systemHealth.memory}%</div>
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
                  <div className="text-2xl font-bold mb-2" data-testid="text-database-usage">{systemHealth.database}%</div>
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
                  <div className="text-2xl font-bold" data-testid="text-active-users">{systemHealth.activeUsers}</div>
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
                    <Badge variant="secondary" className="bg-muted/10 text-primary">
                      <div className="h-2 w-2 bg-muted/30 rounded-full animate-pulse mr-2" />
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
                          data-testid={`activity-item-${activity.id}`}
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
                      <div className="font-bold" data-testid="text-total-workspaces">{(supportStats as any)?.totalWorkspaces || 0}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        <span className="text-sm">Monthly Revenue</span>
                      </div>
                      <div className="font-bold" data-testid="text-monthly-revenue">${(supportStats as any)?.totalRevenue || "0"}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-violet-500" />
                        <span className="text-sm">API Requests</span>
                      </div>
                      <div className="font-bold" data-testid="text-api-requests">{systemHealth.requests}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">Errors (24h)</span>
                      </div>
                      <div className="font-bold text-blue-600" data-testid="text-error-count">{systemHealth.errors}</div>
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
                      <Badge variant="secondary" className="bg-muted/10 text-primary">
                        {systemHealth.uptime}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Database</span>
                      <Badge variant="secondary" className="bg-muted/10 text-primary">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Healthy
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">API Status</span>
                      <Badge variant="secondary" className="bg-muted/10 text-primary">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Online
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <Link href="/admin-usage">
                    <Button variant="outline" className="w-full" data-testid="link-admin-usage">
                      <Server className="mr-2 h-4 w-4" />
                      Usage
                    </Button>
                  </Link>
                  <Link href="/platform-users">
                    <Button variant="outline" className="w-full" data-testid="link-platform-users">
                      <Users className="mr-2 h-4 w-4" />
                      Users
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* SUPPORT STAFF MANAGEMENT TAB */}
          <TabsContent value="staff" className="space-y-6">
            {/* Header with Add Staff Button */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Support Staff Management</h2>
                <p className="text-muted-foreground">Manage platform support staff roles, permissions, and access</p>
              </div>
              <Button onClick={() => setStaffActionDialog('add')} data-testid="button-add-staff">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Support Staff
              </Button>
            </div>

            {/* Staff Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="stat-total-staff">{platformStaff.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active</CardTitle>
                  <UserCheck className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600" data-testid="stat-active-staff">
                    {platformStaff.filter(s => !s.isSuspended).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Suspended</CardTitle>
                  <Ban className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600" data-testid="stat-suspended-staff">
                    {platformStaff.filter(s => s.isSuspended).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Support Agents</CardTitle>
                  <Headphones className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="stat-support-agents">
                    {platformStaff.filter(s => s.role === 'support_agent' || s.role === 'support_manager').length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search and Staff List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle>Platform Staff Directory</CardTitle>
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search staff by name, email, or role..."
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-staff-search"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {staffLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredStaff.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {staffSearchQuery ? "No staff members match your search" : "No support staff configured yet"}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredStaff.map((staff) => (
                        <div
                          key={staff.userId}
                          data-testid={`staff-row-${staff.userId}`}
                          className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                            staff.isSuspended 
                              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' 
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                              staff.isSuspended 
                                ? 'bg-red-100 dark:bg-red-900' 
                                : 'bg-primary/10'
                            }`}>
                              {staff.isSuspended ? (
                                <Ban className="h-5 w-5 text-red-600" />
                              ) : (
                                <User className="h-5 w-5 text-primary" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {staff.firstName || staff.lastName 
                                  ? `${staff.firstName || ''} ${staff.lastName || ''}`.trim() 
                                  : 'Unnamed User'}
                                {staff.isSuspended && (
                                  <Badge variant="destructive" className="text-xs">Suspended</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">{staff.email}</div>
                              {staff.isSuspended && staff.suspendedReason && (
                                <div className="text-xs text-red-600 mt-1">
                                  Reason: {staff.suspendedReason}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="capitalize">
                              {PLATFORM_ROLES.find(r => r.value === staff.role)?.label || staff.role.replace('_', ' ')}
                            </Badge>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedStaffUser(staff);
                                  setStaffActionDialog('change-role');
                                }}
                                data-testid={`button-change-role-${staff.userId}`}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              {staff.isSuspended ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-600"
                                  onClick={() => {
                                    setSelectedStaffUser(staff);
                                    unsuspendStaffMutation.mutate({ userId: staff.userId });
                                  }}
                                  data-testid={`button-unsuspend-${staff.userId}`}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-amber-600"
                                  onClick={() => {
                                    setSelectedStaffUser(staff);
                                    setStaffActionDialog('suspend');
                                  }}
                                  data-testid={`button-suspend-${staff.userId}`}
                                >
                                  <Pause className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedStaffUser(staff);
                                  setStaffActionDialog('revoke');
                                }}
                                data-testid={`button-revoke-${staff.userId}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Role Reference */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform Role Reference</CardTitle>
                <CardDescription>Understanding support staff role hierarchy and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PLATFORM_ROLES.map((role) => (
                    <div key={role.value} className="p-3 border rounded-lg">
                      <div className="font-medium flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        {role.label}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CUSTOMER SUPPORT TAB */}
          <TabsContent value="support" className="space-y-6">
            {/* Platform Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="stat-workspaces">
                    {(supportStats as any)?.totalWorkspaces || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="stat-subscriptions">
                    {(supportStats as any)?.activeSubscriptions || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="stat-tickets">
                    {(supportStats as any)?.openTickets || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="stat-revenue">
                    ${(supportStats as any)?.totalRevenue || "0"}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <Card>
              <CardHeader>
                <CardTitle>Search Customers</CardTitle>
                <CardDescription>
                  Search by email, workspace name, or company name
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for a customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-customers"
                  />
                </div>

                {/* Search Results */}
                {searchLoading && (
                  <div className="mt-4 text-center text-muted-foreground">
                    Searching...
                  </div>
                )}

                {searchResults && searchResults.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {searchResults.map((result) => (
                      <Card
                        key={result.workspace.id}
                        className="hover-elevate cursor-pointer"
                        onClick={() => setSelectedWorkspace(result.workspace.id)}
                        data-testid={`card-customer-${result.workspace.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{result.workspace.name}</h3>
                                <Badge variant="outline">
                                  {result.subscription?.plan || "free"}
                                </Badge>
                              </div>
                              {result.workspace.organizationId && (
                                <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-mono text-xs">
                                  {result.workspace.organizationId}
                                </Badge>
                              )}
                              <p className="text-sm text-muted-foreground">
                                {result.owner.email}
                              </p>
                            </div>

                            <div className="flex gap-4 text-sm">
                              <div className="text-center">
                                <div className="font-semibold">{result.stats.employeeCount}</div>
                                <div className="text-muted-foreground">Employees</div>
                              </div>
                              <div className="text-center">
                                <div className="font-semibold">{result.stats.clientCount}</div>
                                <div className="text-muted-foreground">Clients</div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Workspace Detail */}
            {selectedWorkspace && workspaceDetail && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <CardTitle>{workspaceDetail.workspace.name}</CardTitle>
                        {workspaceDetail.workspace.organizationId && (
                          <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-mono">
                            {workspaceDetail.workspace.organizationId}
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        {workspaceDetail.owner.email}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionDialog('suspend')}
                        data-testid="button-suspend-account"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Suspend
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionDialog('freeze')}
                        data-testid="button-freeze-account"
                      >
                        <Pause className="mr-2 h-4 w-4" />
                        Freeze
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionDialog('lock')}
                        data-testid="button-lock-account"
                      >
                        <Lock className="mr-2 h-4 w-4" />
                        Lock
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedWorkspace(null)}
                        data-testid="button-close-detail"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Subscription</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Badge>{workspaceDetail.subscription?.plan || "free"}</Badge>
                        <p className="text-sm text-muted-foreground mt-2">
                          Status: {workspaceDetail.subscription?.status || "active"}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Business Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Badge variant="outline">
                          {workspaceDetail.businessCategory.category}
                        </Badge>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Stripe</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {workspaceDetail.billing.stripeConnected ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                            <span className="text-sm">Connected</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span className="text-sm">Not Connected</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* LIVE CHAT TAB */}
          <TabsContent value="chat" className="space-y-6">
            {/* Enter Chat Room Banner */}
            <Card className="border-primary/50 bg-gradient-to-r from-primary/10 to-violet-500/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Live Support Chat Room
                    </CardTitle>
                    <CardDescription className="mt-1">
                      MSN/IRC style helpdesk - Enter to provide live support or monitor conversations
                    </CardDescription>
                  </div>
                  <Button 
                    size="lg" 
                    onClick={() => {
                      // Platform admin - go directly to LIVE chat room (IRC/MSN style)
                      window.location.href = "/live-chat";
                    }}
                    data-testid="button-enter-chat-room"
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Enter Live Chat Room
                  </Button>
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Conversations</CardTitle>
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-active-conversations">{activeConversations.length}</div>
                  <p className="text-xs text-muted-foreground">Currently in progress</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Silenced Users</CardTitle>
                  <MicOff className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-silenced-users">{silencedUsers.length}</div>
                  <p className="text-xs text-muted-foreground">Awaiting voice grant</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
                  <Headphones className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-conversations">{conversations.length}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-avg-response-time">2.3m</div>
                  <p className="text-xs text-muted-foreground">Last 24 hours</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Conversations List */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Conversations</CardTitle>
                  <CardDescription>Select a conversation to view messages</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {conversations.map((conv) => (
                        <div
                          key={conv.id}
                          className={`p-3 rounded-lg border cursor-pointer hover-elevate ${
                            selectedConversation === conv.id ? 'bg-muted border-primary' : ''
                          }`}
                          onClick={() => setSelectedConversation(conv.id)}
                          data-testid={`conversation-${conv.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{conv.customerName ?? 'Unknown'}</p>
                                <Badge variant="outline" className="text-xs">
                                  {conv.priority}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-1">
                                {conv.customerEmail ?? 'No email'}
                              </p>
                            </div>
                            {conv.isSilenced && (
                              <MicOff className="h-4 w-4 text-blue-500" />
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <Badge variant={conv.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {conv.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(conv.createdAt ?? Date.now()).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Chat Messages */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Chat Messages</CardTitle>
                      <CardDescription>
                        {selectedConversation 
                          ? conversations.find(c => c.id === selectedConversation)?.customerName
                          : 'Select a conversation'}
                      </CardDescription>
                    </div>
                    {selectedConversation && (
                      <div className="flex gap-2">
                        {conversations.find(c => c.id === selectedConversation)?.isSilenced && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => grantVoice.mutate(selectedConversation)}
                            data-testid="button-grant-voice"
                          >
                            <Mic className="mr-2 h-4 w-4" />
                            Grant Voice
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => closeConversation.mutate(selectedConversation)}
                          data-testid="button-close-conversation"
                        >
                          Close
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedConversation ? (
                    <>
                      <ScrollArea className="h-[400px] mb-4">
                        <div className="space-y-4">
                          {messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex ${msg.senderType === 'staff' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[70%] rounded-lg p-3 ${
                                  msg.senderType === 'staff'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                }`}
                              >
                                <p className="text-sm">{msg.message}</p>
                                <p className="text-xs opacity-70 mt-1">
                                  {new Date(msg.createdAt ?? Date.now()).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                      </ScrollArea>

                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <Input
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          placeholder="Type your message..."
                          data-testid="input-chat-message"
                        />
                        <Button type="submit" size="icon" data-testid="button-send-message">
                          <Send className="h-4 w-4" />
                        </Button>
                      </form>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-[450px] text-muted-foreground">
                      Select a conversation to view messages
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SUPPORT TICKETS TAB */}
          <TabsContent value="tickets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Support Tickets</CardTitle>
                <CardDescription>Manage customer support tickets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center text-muted-foreground py-12">
                  Support ticket management coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SYSTEM ADMIN TAB */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Administration</CardTitle>
                <CardDescription>Platform settings and configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Link href="/platform-users">
                    <Button variant="outline" className="w-full justify-start" data-testid="link-manage-users">
                      <Users className="mr-2 h-4 w-4" />
                      Manage Platform Users
                    </Button>
                  </Link>
                  <Link href="/admin-usage">
                    <Button variant="outline" className="w-full justify-start" data-testid="link-usage-metrics">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Usage Metrics
                    </Button>
                  </Link>
                  <Link href="/settings">
                    <Button variant="outline" className="w-full justify-start" data-testid="link-platform-settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Platform Settings
                    </Button>
                  </Link>
                  <Link href="/admin-custom-forms">
                    <Button variant="outline" className="w-full justify-start" data-testid="link-custom-forms">
                      <Receipt className="mr-2 h-4 w-4" />
                      Custom Forms Builder
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Dialogs */}
        <Dialog open={actionDialog === 'suspend'} onOpenChange={() => setActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspend Account</DialogTitle>
              <DialogDescription>
                This will prevent the workspace owner and all users from accessing the platform
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Reason for Suspension</Label>
                <Textarea
                  placeholder="Enter reason..."
                  value={actionData.reason || ''}
                  onChange={(e) => setActionData({ ...actionData, reason: e.target.value })}
                  data-testid="input-suspend-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)} data-testid="button-cancel-suspend">Cancel</Button>
              <Button
                onClick={() => {
                  if (selectedWorkspace && actionData.reason) {
                    suspendAccountMutation.mutate({ 
                      workspaceId: selectedWorkspace, 
                      reason: actionData.reason 
                    });
                  }
                }}
                data-testid="button-confirm-suspend"
              >
                Suspend Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={actionDialog === 'freeze'} onOpenChange={() => setActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Freeze Account</DialogTitle>
              <DialogDescription>
                This will freeze the account for non-payment
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Reason for Freeze</Label>
                <Textarea
                  placeholder="Enter reason..."
                  value={actionData.reason || ''}
                  onChange={(e) => setActionData({ ...actionData, reason: e.target.value })}
                  data-testid="input-freeze-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)} data-testid="button-cancel-freeze">Cancel</Button>
              <Button
                onClick={() => {
                  if (selectedWorkspace && actionData.reason) {
                    freezeAccountMutation.mutate({ 
                      workspaceId: selectedWorkspace, 
                      reason: actionData.reason 
                    });
                  }
                }}
                data-testid="button-confirm-freeze"
              >
                Freeze Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={actionDialog === 'lock'} onOpenChange={() => setActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lock Account</DialogTitle>
              <DialogDescription>
                This will lock the account for security reasons
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Reason for Lock</Label>
                <Textarea
                  placeholder="Enter reason..."
                  value={actionData.reason || ''}
                  onChange={(e) => setActionData({ ...actionData, reason: e.target.value })}
                  data-testid="input-lock-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)} data-testid="button-cancel-lock">Cancel</Button>
              <Button
                onClick={() => {
                  if (selectedWorkspace && actionData.reason) {
                    lockAccountMutation.mutate({ 
                      workspaceId: selectedWorkspace, 
                      reason: actionData.reason 
                    });
                  }
                }}
                data-testid="button-confirm-lock"
              >
                Lock Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Staff Management Dialogs */}
        <Dialog open={staffActionDialog === 'add'} onOpenChange={() => setStaffActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Support Staff</DialogTitle>
              <DialogDescription>
                Grant platform access to a new support staff member. They must have an existing account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email Address</Label>
                <Input
                  type="email"
                  placeholder="staff@example.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  data-testid="input-new-staff-email"
                />
              </div>
              <div>
                <Label>Platform Role</Label>
                <Select value={newStaffRole} onValueChange={(value) => setNewStaffRole(value as PlatformRoleType)}>
                  <SelectTrigger data-testid="select-new-staff-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_ROLES.filter(r => r.value !== 'root_admin').map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span>{role.label}</span>
                          <span className="text-xs text-muted-foreground">{role.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStaffActionDialog(null)} data-testid="button-cancel-add-staff">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (newStaffEmail && newStaffRole) {
                    grantPlatformRoleMutation.mutate({ email: newStaffEmail, role: newStaffRole });
                  }
                }}
                disabled={!newStaffEmail || grantPlatformRoleMutation.isPending}
                data-testid="button-confirm-add-staff"
              >
                {grantPlatformRoleMutation.isPending ? 'Adding...' : 'Add Staff Member'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={staffActionDialog === 'suspend'} onOpenChange={() => setStaffActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspend Staff Member</DialogTitle>
              <DialogDescription>
                Suspend {selectedStaffUser?.firstName || selectedStaffUser?.email} for investigation. 
                They will lose all platform access until reinstated.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Investigation Reason</Label>
                <Textarea
                  placeholder="Enter detailed reason for suspension (required for audit trail)..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={4}
                  data-testid="input-staff-suspend-reason"
                />
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    This action will be logged and the staff member will receive a notification via the universal notification system.
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStaffActionDialog(null)} data-testid="button-cancel-staff-suspend">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (selectedStaffUser && suspendReason) {
                    suspendStaffMutation.mutate({ userId: selectedStaffUser.userId, reason: suspendReason });
                  }
                }}
                disabled={!suspendReason || suspendStaffMutation.isPending}
                data-testid="button-confirm-staff-suspend"
              >
                {suspendStaffMutation.isPending ? 'Suspending...' : 'Suspend Staff Member'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={staffActionDialog === 'change-role'} onOpenChange={() => setStaffActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Platform Role</DialogTitle>
              <DialogDescription>
                Update the platform role for {selectedStaffUser?.firstName || selectedStaffUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Current Role</div>
                <div className="font-medium capitalize">
                  {PLATFORM_ROLES.find(r => r.value === selectedStaffUser?.role)?.label || selectedStaffUser?.role}
                </div>
              </div>
              <div>
                <Label>New Role</Label>
                <Select value={newStaffRole} onValueChange={(value) => setNewStaffRole(value as PlatformRoleType)}>
                  <SelectTrigger data-testid="select-change-role">
                    <SelectValue placeholder="Select new role" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_ROLES.filter(r => r.value !== 'root_admin' && r.value !== selectedStaffUser?.role).map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span>{role.label}</span>
                          <span className="text-xs text-muted-foreground">{role.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStaffActionDialog(null)} data-testid="button-cancel-change-role">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedStaffUser && newStaffRole) {
                    changePlatformRoleMutation.mutate({ userId: selectedStaffUser.userId, newRole: newStaffRole });
                  }
                }}
                disabled={!newStaffRole || changePlatformRoleMutation.isPending}
                data-testid="button-confirm-change-role"
              >
                {changePlatformRoleMutation.isPending ? 'Updating...' : 'Update Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={staffActionDialog === 'revoke'} onOpenChange={() => setStaffActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke Platform Access</DialogTitle>
              <DialogDescription>
                Remove all platform access for {selectedStaffUser?.firstName || selectedStaffUser?.email}. 
                They will no longer be able to access support tools.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  This action cannot be undone. The staff member will need to be re-added to regain access.
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStaffActionDialog(null)} data-testid="button-cancel-revoke">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (selectedStaffUser) {
                    revokePlatformRoleMutation.mutate({ userId: selectedStaffUser.userId });
                  }
                }}
                disabled={revokePlatformRoleMutation.isPending}
                data-testid="button-confirm-revoke"
              >
                {revokePlatformRoleMutation.isPending ? 'Revoking...' : 'Revoke Access'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
