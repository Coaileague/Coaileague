import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useModules } from "@/config/moduleConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle } from '@/components/ui/universal-modal';
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { SearchPanelSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/loading-indicators/skeletons";
import {
  Eye,
  Search,
  User,
  Activity,
  Clock,
  MapPin,
  Shield,
  AlertTriangle,
  Database,
  FileText,
  Key,
  Settings,
  RefreshCw,
  Terminal,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  Calendar,
  CreditCard,
  Mail,
  Phone,
  Building,
  Zap,
} from 'lucide-react';;
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { format } from "date-fns";

function UserSessionsViewer({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<{ sessions: any[] }>({
    queryKey: [`/api/admin/users/${userId}/sessions`],
    enabled: !!userId,
  });
  const sessions = data?.sessions || [];
  if (isLoading) return <div className="py-6 text-center text-sm text-muted-foreground">Loading sessions...</div>;
  if (!sessions.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No sessions found for this user.</p>
    </div>
  );
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {sessions.map((s) => (
        <div key={s.id} className="rounded-md border p-3 text-xs space-y-1" data-testid={`session-row-${s.id}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge variant={s.isValid && new Date(s.expiresAt) > new Date() ? 'default' : 'secondary'} className="text-[10px]">
              {s.isValid && new Date(s.expiresAt) > new Date() ? 'Active' : 'Expired'}
            </Badge>
            <span className="text-muted-foreground">{s.ipAddress || 'Unknown IP'}</span>
          </div>
          <div className="text-muted-foreground truncate">{(s.deviceInfo as any)?.browser || s.userAgent?.slice(0, 60) || 'Unknown device'}</div>
          <div className="flex gap-4 text-muted-foreground">
            <span>Last active: {s.lastActivityAt ? format(new Date(s.lastActivityAt), 'MMM d, h:mm a') : '—'}</span>
            <span>Expires: {s.expiresAt ? format(new Date(s.expiresAt), 'MMM d') : '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function UserAuditLogsViewer({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<{ logs: any[]; total: number }>({
    queryKey: [`/api/admin/users/${userId}/audit-logs`, { limit: 30 }],
    enabled: !!userId,
  });
  const logs = data?.logs || [];
  if (isLoading) return <div className="py-6 text-center text-sm text-muted-foreground">Loading audit logs...</div>;
  if (!logs.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No audit log entries found for this user.</p>
    </div>
  );
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      <p className="text-xs text-muted-foreground mb-2">Showing last {logs.length} of {data?.total} entries</p>
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs" data-testid={`audit-row-${log.id}`}>
          <div className="mt-0.5">
            {log.success === false
              ? <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
              : <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{log.action_description || log.action}</div>
            {log.entity_type && <div className="text-muted-foreground">{log.entity_type}{log.workspace_id ? ` · ${log.workspace_id}` : ''}</div>}
          </div>
          <div className="text-muted-foreground flex-shrink-0">{log.created_at ? format(new Date(log.created_at), 'MMM d, h:mm a') : '—'}</div>
        </div>
      ))}
    </div>
  );
}

interface UserDiagnostics {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  lastLogin?: string;
  currentWorkspaceId?: string;
  workspaceName?: string;
  platformRole?: string;
  workspaceRole?: string;
  status: "active" | "inactive" | "locked" | "suspended";
  loginAttempts?: number;
  sessionCount?: number;
  ipAddress?: string;
  userAgent?: string;
  subscriptionStatus?: string;
  subscriptionTier?: string;
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  timestamp: string;
  ipAddress?: string;
  details?: any;
}

interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivity?: string;
}

export default function Diagnostics() {
  const modules = useModules();
  const module = modules.getModule('diagnostics');
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showSessionViewer, setShowSessionViewer] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  if (!module?.enabled) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Module Not Available</CardTitle>
            <CardDescription>System Diagnostics is not enabled for your subscription tier</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // GATEKEEPER: Microsoft-style access control
  const platformRole = (user as any)?.platformRole;
  const isAuthorized = platformRole === 'root_admin' || platformRole === 'sysop' || platformRole === 'deputy_admin';

  // Search users
  const { data: searchResults = [], isLoading: searchLoading } = useQuery<UserDiagnostics[]>({
    queryKey: ['/api/admin/support/search', searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/admin/support/search?q=${encodeURIComponent(searchQuery)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: isAuthorized && searchQuery.length > 2,
    select: (data) => {
      if (!Array.isArray(data)) return [];
      return data.map((result) => ({
        userId: result.id,
        email: result.email,
        firstName: result.firstName,
        lastName: result.lastName,
        createdAt: result.createdAt,
        lastLogin: result.lastLogin,
        currentWorkspaceId: result.currentWorkspaceId,
        workspaceName: result.workspaceName,
        platformRole: result.platformRole,
        workspaceRole: result.workspaceRole,
        status: result.isLocked ? "locked" : "active",
        loginAttempts: result.failedLoginAttempts,
        sessionCount: 0,
        subscriptionStatus: result.subscriptionStatus,
        subscriptionTier: result.subscriptionTier,
      }));
    },
  });

  // Get user diagnostics detail
  const { data: userDetail, isLoading: detailLoading } = useQuery<UserDiagnostics>({
    queryKey: ['/api/admin/user-diagnostics', selectedUserId],
    queryFn: async () => {
      const res = await fetch('/api/admin/user-diagnostics', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch diagnostics');
      return res.json();
    },
    enabled: isAuthorized && !!selectedUserId,
  });

  // Get audit logs for user
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<AuditLog[]>({
    queryKey: ['/api/admin/audit-logs', selectedUserId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${selectedUserId}/audit-logs`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    },
    enabled: isAuthorized && !!selectedUserId && showAuditLogs,
  });

  // Unlock user mutation
  const unlockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('POST', '/api/admin/unlock-user', { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/user-diagnostics'] });
      toast({
        title: "User unlocked",
        description: "Account has been successfully unlocked",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to unlock user account",
        variant: "destructive",
      });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('POST', '/api/admin/reset-password', { userId });
    },
    onSuccess: () => {
      toast({
        title: "Password reset",
        description: "Password reset email has been sent",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const selectedUser = selectedUserId
    ? searchResults.find((u) => u.userId === selectedUserId) || userDetail
    : null;

  if (!isAuthorized && !authLoading) {
    setLocation('/error-403');
    return null;
  }

  if (authLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-5 max-w-7xl mx-auto w-full">
        <PageHeaderSkeleton />
        <SearchPanelSkeleton />
      </div>
    );
  }

  const pageConfig: CanvasPageConfig = {
    id: 'diagnostics',
    title: 'AI Diagnostics™',
    subtitle: 'User Diagnostics & Troubleshooting Panel',
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              User Search
            </CardTitle>
            <CardDescription>
              Search by email, name, or user ID
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type to search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-users"
                />
              </div>

              {searchQuery.length > 2 && (
                <ScrollArea className="h-[500px]">
                  {searchLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No users found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {searchResults.map((user) => (
                        <button
                          key={user.userId}
                          onClick={() => setSelectedUserId(user.userId)}
                          data-testid={`user-result-${user.userId}`}
                          className={['w-full p-3 rounded-lg text-left transition-colors', selectedUserId === user.userId
                              ? "bg-primary/10 border border-primary/20"
                              : "hover-elevate"].join(' ')}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="text-sm font-semibold">
                                {user.firstName?.[0]}{user.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">
                                  {user.firstName} {user.lastName}
                                </span>
                                {user.status === "locked" && (
                                  <Badge variant="destructive" className="h-5">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Locked
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email}
                              </p>
                              {user.platformRole && (
                                <Badge variant="outline" className="mt-1 h-5 text-xs">
                                  {user.platformRole}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}

              {searchQuery.length <= 2 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Terminal className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Type 3+ characters to search</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Diagnostics Panel */}
        <div className="lg:col-span-2">
          {!selectedUser ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Eye className="h-16 w-16 mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">No User Selected</h3>
                <p className="text-sm text-muted-foreground">
                  Search and select a user to view diagnostics
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* User Header Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="text-lg">
                          {selectedUser.firstName?.[0]}{selectedUser.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-2xl">
                          {selectedUser.firstName} {selectedUser.lastName}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Mail className="h-3 w-3" />
                          {selectedUser.email}
                        </CardDescription>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant={selectedUser.status === "active" ? "default" : "destructive"}
                            className="h-6"
                          >
                            {selectedUser.status === "active" ? (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {selectedUser.status}
                          </Badge>
                          {selectedUser.platformRole && (
                            <Badge variant="outline" className="h-6">
                              <Shield className="h-3 w-3 mr-1" />
                              {selectedUser.platformRole}
                            </Badge>
                          )}
                          {selectedUser.subscriptionTier && (
                            <Badge variant="secondary" className="h-6">
                              <CreditCard className="h-3 w-3 mr-1" />
                              {selectedUser.subscriptionTier}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(selectedUser.userId, "User ID")}
                        data-testid="button-copy-userid"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy ID
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">User ID</Label>
                      <p className="text-sm font-mono">{selectedUser.userId}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Workspace</Label>
                      <p className="text-sm">{selectedUser.workspaceName || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Created</Label>
                      <p className="text-sm">
                        {new Date(selectedUser.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Last Login</Label>
                      <p className="text-sm">
                        {selectedUser.lastLogin
                          ? new Date(selectedUser.lastLogin).toLocaleDateString()
                          : "Never"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Diagnostics Tabs */}
              <Card>
                <Tabs defaultValue="overview" className="w-full">
                  <CardHeader>
                    <TabsList className="w-full overflow-x-auto grid grid-cols-2 sm:grid-cols-4">
                      <TabsTrigger value="overview" data-testid="tab-overview">
                        <Activity className="h-4 w-4 mr-2" />
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value="sessions" data-testid="tab-sessions">
                        <Clock className="h-4 w-4 mr-2" />
                        Sessions
                      </TabsTrigger>
                      <TabsTrigger value="audit" data-testid="tab-audit">
                        <FileText className="h-4 w-4 mr-2" />
                        Audit Logs
                      </TabsTrigger>
                      <TabsTrigger value="actions" data-testid="tab-actions">
                        <Zap className="h-4 w-4 mr-2" />
                        Actions
                      </TabsTrigger>
                    </TabsList>
                  </CardHeader>
                  <CardContent>
                    <TabsContent value="overview" className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Key className="h-4 w-4" />
                              Login Attempts
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-2xl font-bold">
                              {selectedUser.loginAttempts || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">Failed attempts</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Activity className="h-4 w-4" />
                              Active Sessions
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-2xl font-bold">
                              {selectedUser.sessionCount || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">Current sessions</p>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Recent Activity</Label>
                        <div className="bg-muted rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              IP: {selectedUser.ipAddress || "Unknown"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">
                              {selectedUser.userAgent || "Unknown user agent"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="sessions">
                      <UserSessionsViewer userId={selectedUser.userId} />
                    </TabsContent>

                    <TabsContent value="audit">
                      <UserAuditLogsViewer userId={selectedUser.userId} />
                    </TabsContent>

                    <TabsContent value="actions" className="space-y-3">
                      <div className="space-y-3">
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => resetPasswordMutation.mutate(selectedUser.userId)}
                          disabled={resetPasswordMutation.isPending}
                          data-testid="button-reset-password"
                        >
                          <Key className="h-4 w-4 mr-2" />
                          Reset Password
                        </Button>

                        {selectedUser.status === "locked" && (
                          <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => unlockUserMutation.mutate(selectedUser.userId)}
                            disabled={unlockUserMutation.isPending}
                            data-testid="button-unlock-user"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Unlock Account
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          data-testid="button-view-workspace"
                        >
                          <Building className="h-4 w-4 mr-2" />
                          View Workspace Details
                        </Button>

                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          data-testid="button-send-message"
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Send Support Message
                        </Button>
                      </div>

                      <div className="mt-6 p-4 bg-muted rounded-lg border border-yellow-500/20">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Destructive Actions</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              These actions require additional confirmation
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full justify-start"
                            data-testid="button-suspend-user"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Suspend Account
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </CardContent>
                </Tabs>
              </Card>
            </div>
          )}
        </div>
      </div>
    </CanvasHubPage>
  );
}
