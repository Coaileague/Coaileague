import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Users, Building2, Shield, Search, UserCheck, UserX, 
  Brain, Zap, RefreshCw, AlertTriangle, CheckCircle, 
  Ban, Play, Settings, Eye, Clock, Activity
} from "lucide-react";

interface EndUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  currentWorkspaceId?: string;
  workspaceName?: string;
  lastLoginAt?: string;
  createdAt?: string;
}

interface WorkspaceDetail {
  id: string;
  name: string;
  companyName?: string;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  isSuspended: boolean;
  suspendedReason?: string;
  suspendedAt?: string;
  isFrozen: boolean;
  frozenReason?: string;
  isLocked: boolean;
  lockedReason?: string;
  aiBrainSuspended: boolean;
  aiBrainSuspendedReason?: string;
  userCount: number;
  employeeCount: number;
  clientCount: number;
}

interface UserAccessConfig {
  userId: string;
  workspaceId: string;
  aiBrainEnabled: boolean;
  subagentAccess: string[];
  featureAccess: Record<string, boolean>;
  usageQuotas: {
    aiCreditsMonthly: number;
    aiCreditsUsed: number;
  };
}

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

export default function EndUserControls() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<EndUser | null>(null);
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      const platformRole = (user as any)?.platformRole;
      if (!SUPPORT_ROLES.includes(platformRole)) {
        if (!user) {
          window.location.href = '/login';
        } else {
          setLocation('/error-403');
        }
      }
    }
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: workspaceResults, isLoading: searchLoading } = useQuery<WorkspaceDetail[]>({
    queryKey: ["/api/admin/end-users/workspaces", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
  });

  const { data: workspaceDetail, isLoading: detailLoading } = useQuery<{
    workspace: WorkspaceDetail;
    users: EndUser[];
    accessConfig: UserAccessConfig[];
  }>({
    queryKey: ["/api/admin/end-users/workspace", selectedWorkspace],
    enabled: !!selectedWorkspace,
  });

  const suspendWorkspaceMutation = useMutation({
    mutationFn: (data: { workspaceId: string; reason: string }) =>
      apiRequest("POST", "/api/admin/end-users/suspend", data),
    onSuccess: () => {
      toast({ title: "Workspace Suspended", description: "Organization access has been suspended" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/end-users/workspace", selectedWorkspace] });
      setActionDialog(null);
      setActionReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to suspend workspace", variant: "destructive" });
    },
  });

  const unsuspendWorkspaceMutation = useMutation({
    mutationFn: (data: { workspaceId: string }) =>
      apiRequest("POST", "/api/admin/end-users/unsuspend", data),
    onSuccess: () => {
      toast({ title: "Workspace Unsuspended", description: "Organization access has been restored" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/end-users/workspace", selectedWorkspace] });
      setActionDialog(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to unsuspend workspace", variant: "destructive" });
    },
  });

  const toggleAiBrainMutation = useMutation({
    mutationFn: (data: { workspaceId: string; enabled: boolean; reason?: string }) =>
      apiRequest("POST", "/api/admin/end-users/toggle-ai-brain", data),
    onSuccess: (_, variables) => {
      toast({ 
        title: variables.enabled ? "AI Brain Enabled" : "AI Brain Suspended",
        description: variables.enabled 
          ? "Organization now has access to AI Brain features"
          : "AI Brain access has been suspended for this organization"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/end-users/workspace", selectedWorkspace] });
      setActionDialog(null);
      setActionReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to toggle AI Brain", variant: "destructive" });
    },
  });

  const updateAccessConfigMutation = useMutation({
    mutationFn: (data: { workspaceId: string; userId: string; config: Partial<UserAccessConfig> }) =>
      apiRequest("PATCH", "/api/admin/end-users/access-config", data),
    onSuccess: () => {
      toast({ title: "Access Updated", description: "User access configuration has been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/end-users/workspace", selectedWorkspace] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update access", variant: "destructive" });
    },
  });

  const getStatusBadge = (workspace: WorkspaceDetail) => {
    if (workspace.isLocked) return <Badge variant="destructive">Locked</Badge>;
    if (workspace.isFrozen) return <Badge className="bg-blue-500">Frozen</Badge>;
    if (workspace.isSuspended) return <Badge variant="secondary">Suspended</Badge>;
    return <Badge className="bg-green-600">Active</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">End-User Controls</h1>
              <p className="text-sm text-muted-foreground">
                Manage organization access, AI Brain features, and user permissions
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRefreshKey(prev => prev + 1)}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Organization Search
            </CardTitle>
            <CardDescription>
              Search for organizations to manage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>

              <ScrollArea className="h-[400px]">
                {searchLoading && (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!searchLoading && workspaceResults && workspaceResults.length > 0 && (
                  <div className="space-y-2">
                    {workspaceResults.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => setSelectedWorkspace(ws.id)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors hover-elevate ${
                          selectedWorkspace === ws.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border'
                        }`}
                        data-testid={`button-workspace-${ws.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{ws.name}</div>
                            <div className="text-sm text-muted-foreground truncate">
                              {ws.companyName || 'No company name'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {ws.userCount} users
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {getStatusBadge(ws)}
                            {ws.aiBrainSuspended && (
                              <Badge variant="outline" className="text-orange-500 border-orange-500">
                                AI Off
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && debouncedQuery.length >= 2 && (!workspaceResults || workspaceResults.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No organizations found
                  </div>
                )}

                {debouncedQuery.length < 2 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Enter at least 2 characters to search
                  </div>
                )}
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Details
            </CardTitle>
            <CardDescription>
              {selectedWorkspace 
                ? "View and manage organization settings"
                : "Select an organization to view details"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedWorkspace && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mb-4 opacity-50" />
                <p>Select an organization from the search results</p>
              </div>
            )}

            {selectedWorkspace && detailLoading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {selectedWorkspace && !detailLoading && workspaceDetail && (
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="overview" data-testid="tab-overview">
                    <Eye className="h-4 w-4 mr-2" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="ai-access" data-testid="tab-ai-access">
                    <Brain className="h-4 w-4 mr-2" />
                    AI Access
                  </TabsTrigger>
                  <TabsTrigger value="users" data-testid="tab-users">
                    <Users className="h-4 w-4 mr-2" />
                    Users
                  </TabsTrigger>
                  <TabsTrigger value="actions" data-testid="tab-actions">
                    <Settings className="h-4 w-4 mr-2" />
                    Actions
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Organization Name</Label>
                      <p className="font-medium" data-testid="text-org-name">{workspaceDetail.workspace.name}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Company Name</Label>
                      <p className="font-medium">{workspaceDetail.workspace.companyName || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Subscription</Label>
                      <Badge>{workspaceDetail.workspace.subscriptionTier || 'free'}</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Status</Label>
                      {getStatusBadge(workspaceDetail.workspace)}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold" data-testid="text-user-count">
                          {workspaceDetail.workspace.userCount}
                        </div>
                        <p className="text-sm text-muted-foreground">Users</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">
                          {workspaceDetail.workspace.employeeCount}
                        </div>
                        <p className="text-sm text-muted-foreground">Employees</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">
                          {workspaceDetail.workspace.clientCount}
                        </div>
                        <p className="text-sm text-muted-foreground">Clients</p>
                      </CardContent>
                    </Card>
                  </div>

                  {workspaceDetail.workspace.isSuspended && (
                    <Card className="border-orange-500/50 bg-orange-500/5">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                          <div>
                            <p className="font-medium text-orange-700 dark:text-orange-400">Suspended</p>
                            <p className="text-sm text-muted-foreground">
                              {workspaceDetail.workspace.suspendedReason || 'No reason provided'}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="ai-access" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Brain className="h-5 w-5" />
                        AI Brain Access
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">AI Brain Features</p>
                          <p className="text-sm text-muted-foreground">
                            Enable or disable all AI Brain functionality for this organization
                          </p>
                        </div>
                        <Switch
                          checked={!workspaceDetail.workspace.aiBrainSuspended}
                          onCheckedChange={(checked) => {
                            if (!checked) {
                              setActionDialog('suspend-ai');
                            } else {
                              toggleAiBrainMutation.mutate({
                                workspaceId: workspaceDetail.workspace.id,
                                enabled: true
                              });
                            }
                          }}
                          data-testid="switch-ai-brain"
                        />
                      </div>

                      {workspaceDetail.workspace.aiBrainSuspended && (
                        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                          <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                            AI Brain is suspended
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {workspaceDetail.workspace.aiBrainSuspendedReason || 'No reason provided'}
                          </p>
                        </div>
                      )}

                      <Separator />

                      <div className="space-y-3">
                        <p className="font-medium">Subagent Access</p>
                        <div className="grid grid-cols-2 gap-3">
                          {['scheduling', 'payroll', 'invoicing', 'notifications', 'analytics', 'compliance'].map((subagent) => (
                            <div key={subagent} className="flex items-center justify-between p-2 rounded border">
                              <span className="text-sm capitalize">{subagent}</span>
                              <Switch
                                defaultChecked={true}
                                disabled={workspaceDetail.workspace.aiBrainSuspended}
                                data-testid={`switch-subagent-${subagent}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="users" className="space-y-4">
                  <ScrollArea className="h-[400px]">
                    {workspaceDetail.users.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No users in this organization
                      </div>
                    )}

                    <div className="space-y-2">
                      {workspaceDetail.users.map((u) => (
                        <Card key={u.id} className="hover-elevate">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">
                                  {u.firstName || ''} {u.lastName || u.email}
                                </p>
                                <p className="text-sm text-muted-foreground">{u.email}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" size="sm">{u.role || 'user'}</Badge>
                                  {u.lastLoginAt && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      Last login: {new Date(u.lastLoginAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedUser(u)}
                                data-testid={`button-user-${u.id}`}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="actions" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {!workspaceDetail.workspace.isSuspended ? (
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => setActionDialog('suspend')}
                        data-testid="button-suspend"
                      >
                        <Ban className="h-4 w-4 mr-2" />
                        Suspend Organization
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => unsuspendWorkspaceMutation.mutate({ workspaceId: workspaceDetail.workspace.id })}
                        disabled={unsuspendWorkspaceMutation.isPending}
                        data-testid="button-unsuspend"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Unsuspend Organization
                      </Button>
                    )}

                    {!workspaceDetail.workspace.aiBrainSuspended ? (
                      <Button
                        variant="outline"
                        className="w-full border-orange-500 text-orange-600 hover:bg-orange-500/10"
                        onClick={() => setActionDialog('suspend-ai')}
                        data-testid="button-suspend-ai"
                      >
                        <Brain className="h-4 w-4 mr-2" />
                        Suspend AI Brain
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => toggleAiBrainMutation.mutate({ workspaceId: workspaceDetail.workspace.id, enabled: true })}
                        disabled={toggleAiBrainMutation.isPending}
                        data-testid="button-enable-ai"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Enable AI Brain
                      </Button>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Quick Actions</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" data-testid="button-reset-quotas">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reset AI Quotas
                      </Button>
                      <Button variant="outline" size="sm" data-testid="button-view-logs">
                        <Activity className="h-4 w-4 mr-2" />
                        View Activity Logs
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={actionDialog === 'suspend'} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Organization</DialogTitle>
            <DialogDescription>
              This will prevent all users in this organization from accessing the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Suspension Reason</Label>
              <Textarea
                placeholder="Enter the reason for suspension..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                data-testid="input-suspend-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedWorkspace) {
                  suspendWorkspaceMutation.mutate({
                    workspaceId: selectedWorkspace,
                    reason: actionReason
                  });
                }
              }}
              disabled={!actionReason || suspendWorkspaceMutation.isPending}
              data-testid="button-confirm-suspend"
            >
              Suspend Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog === 'suspend-ai'} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend AI Brain Access</DialogTitle>
            <DialogDescription>
              This will disable all AI Brain features for this organization, including Trinity, subagents, and automated workflows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Suspension Reason</Label>
              <Textarea
                placeholder="Enter the reason for AI suspension..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                data-testid="input-ai-suspend-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedWorkspace) {
                  toggleAiBrainMutation.mutate({
                    workspaceId: selectedWorkspace,
                    enabled: false,
                    reason: actionReason
                  });
                }
              }}
              disabled={!actionReason || toggleAiBrainMutation.isPending}
              data-testid="button-confirm-ai-suspend"
            >
              Suspend AI Brain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
