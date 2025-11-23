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
import { apiRequest, queryClient } from "@/lib/queryClient";
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

  // Simulated live activity feed
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

  // Mutations
  const suspendAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string; reason: string }) =>
      apiRequest("/api/admin/support/suspend-account", "POST", data),
    onSuccess: () => {
      toast({ title: "Account Suspended", description: "Account has been suspended successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/search"] });
      setActionDialog(null);
    },
  });

  const unsuspendAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string }) =>
      apiRequest("/api/admin/support/unsuspend-account", "POST", data),
    onSuccess: () => {
      toast({ title: "Account Unsuspended", description: "Account has been reactivated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/search"] });
      setActionDialog(null);
    },
  });

  const freezeAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string; reason: string }) =>
      apiRequest("/api/admin/support/freeze-account", "POST", data),
    onSuccess: () => {
      toast({ title: "Account Frozen", description: "Account frozen for non-payment" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/search"] });
      setActionDialog(null);
    },
  });

  const unfreezeAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string }) =>
      apiRequest("/api/admin/support/unfreeze-account", "POST", data),
    onSuccess: () => {
      toast({ title: "Account Unfrozen", description: "Account has been unfrozen" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/search"] });
      setActionDialog(null);
    },
  });

  const lockAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string; reason: string }) =>
      apiRequest("/api/admin/support/lock-account", "POST", data),
    onSuccess: () => {
      toast({ title: "Account Locked", description: "Account locked for security" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/search"] });
      setActionDialog(null);
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: (data: { workspaceId: string }) =>
      apiRequest("/api/admin/support/unlock-account", "POST", data),
    onSuccess: () => {
      toast({ title: "Account Unlocked", description: "Account has been unlocked" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/search"] });
      setActionDialog(null);
    },
  });

  const changeUserRoleMutation = useMutation({
    mutationFn: (data: { userId: string; newRole: string; workspaceId: string }) =>
      apiRequest("/api/admin/support/change-user-role", "POST", data),
    onSuccess: () => {
      toast({ title: "Role Updated", description: "User role has been changed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      setActionDialog(null);
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (data: { conversationId: string; content: string }) => {
      return await apiRequest(`/api/chat/conversations/${data.conversationId}/messages`, "POST", { 
        message: data.content,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", selectedConversation, "messages"] });
      setMessageText("");
    },
  });

  const grantVoice = useMutation({
    mutationFn: async (conversationId: string) => {
      return await apiRequest(`/api/chat/conversations/${conversationId}/grant-voice`, "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      toast({ title: "Voice Granted", description: "User can now send messages" });
    },
  });

  const closeConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      return await apiRequest(`/api/chat/conversations/${conversationId}/close`, "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      toast({ title: "Conversation Closed", description: "Conversation has been closed" });
    },
  });

  const createConversation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/api/chat/conversations", "POST", data);
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      setSelectedConversation(data.id);
      
      // Send helpbot welcome message
      setTimeout(() => {
        apiRequest(`/api/chat/conversations/${data.id}/messages`, "POST", {
          message: `Welcome to AutoForce™ Live Support! ${data.isSilenced ? "You're in the waiting queue. A support agent will grant you voice shortly." : "You have full access to chat. How can we help you today?"}`,
          messageType: "system",
          senderType: "bot",
          senderName: "HelpBot",
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", data.id, "messages"] });
        });
      }, 500);
      
      toast({ 
        title: "Entered Chat Room", 
        description: data.isSilenced ? "You're in the queue. Please wait for voice grant." : "You're now in the live chat room!"
      });
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
          <TabsList className="grid w-full grid-cols-5 lg:w-auto">
            <TabsTrigger value="overview" data-testid="tab-platform-overview">
              <BarChart3 className="mr-2 h-4 w-4" />
              Platform Overview
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
                          ? conversations.find(c => c.id === selectedConversation)?.userName
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
      </div>
    </div>
  );
}
