import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SUPPORT_ROLES } from '@shared/platformConfig';
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
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Eye,
  Users,
  Building2,
  Shield,
  Search,
  UserCheck,
  UserX,
  Brain,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Ban,
  Play,
  Settings,
  Clock,
  Activity,
  Briefcase,
  Calendar,
  Receipt,
  MapPin,
  DollarSign,
  Mail,
  UserCog,
} from 'lucide-react';;

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

interface OrgEmployee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  employeeNumber?: string;
  workspaceRole?: string;
  isActive?: boolean;
  position?: string;
  department?: string;
  phone?: string;
}

interface OrgShift {
  id: number;
  title?: string;
  startTime: string;
  endTime: string;
  status?: string;
  employeeId?: number;
  clientId?: number;
  location?: string;
}

interface OrgInvoice {
  id: number;
  invoiceNumber?: string;
  clientName?: string;
  amount?: number;
  status?: string;
  dueDate?: string;
  createdAt?: string;
}

interface PlatformRoleAssignment {
  id: number;
  userId: string;
  role: string;
  grantedAt: string;
  grantedBy: string;
  grantedReason?: string;
  userEmail: string;
  userFirstName?: string;
  userLastName?: string;
}

const PLATFORM_ROLE_LABELS: Record<string, string> = {
  root_admin: 'Root Admin',
  deputy_admin: 'Deputy Admin',
  sysop: 'Sysop',
  support_manager: 'Support Manager',
  support_agent: 'Support Agent',
  compliance_officer: 'Compliance Officer',
};

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
  const [activeTopTab, setActiveTopTab] = useState("workspaces");
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [roleAssignDialog, setRoleAssignDialog] = useState(false);
  const [roleAssignData, setRoleAssignData] = useState({ userId: "", role: "support_agent", reason: "" });
  const [roleRevokeTarget, setRoleRevokeTarget] = useState<PlatformRoleAssignment | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  useEffect(() => {
    if (!isLoading) {
      const platformRole = (user as any)?.platformRole;
      if (!SUPPORT_ROLES.includes(platformRole)) {
        if (!user) {
          setLocation('/login');
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
    queryFn: async () => {
      const res = await fetch(`/api/admin/end-users/workspaces?q=${encodeURIComponent(debouncedQuery)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
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

  const { data: orgEmployees, isLoading: empLoading } = useQuery<OrgEmployee[]>({
    queryKey: ['/api/admin/support/org', selectedWorkspace, 'employees'],
    queryFn: () => apiRequest('GET', `/api/admin/support/org/${selectedWorkspace}/employees`).then(r => r.json()),
    enabled: !!selectedWorkspace,
  });

  const { data: orgShifts, isLoading: shiftsLoading } = useQuery<OrgShift[]>({
    queryKey: ['/api/admin/support/org', selectedWorkspace, 'shifts'],
    queryFn: () => apiRequest('GET', `/api/admin/support/org/${selectedWorkspace}/shifts`).then(r => r.json()),
    enabled: !!selectedWorkspace,
  });

  const { data: orgInvoices, isLoading: invoicesLoading } = useQuery<OrgInvoice[]>({
    queryKey: ['/api/admin/support/org', selectedWorkspace, 'invoices'],
    queryFn: () => apiRequest('GET', `/api/admin/support/org/${selectedWorkspace}/invoices`).then(r => r.json()),
    enabled: !!selectedWorkspace,
  });

  const { data: platformRoles, isLoading: rolesLoading } = useQuery<PlatformRoleAssignment[]>({
    queryKey: ["/api/admin/platform/roles"],
    enabled: activeTopTab === 'roles',
  });

  const assignRoleMutation = useMutation({
    mutationFn: (data: { userId: string; role: string; reason: string }) =>
      apiRequest("POST", "/api/admin/platform/roles", data),
    onSuccess: () => {
      toast({ title: "Role Assigned", description: "Platform role has been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/roles"] });
      setRoleAssignDialog(false);
      setRoleAssignData({ userId: "", role: "support_agent", reason: "" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to assign role", variant: "destructive" });
    },
  });

  const revokeRoleMutation = useMutation({
    mutationFn: (data: { userId: string; role: string; reason: string }) =>
      apiRequest("POST", "/api/admin/platform/roles", { ...data, role: "none" }),
    onSuccess: () => {
      toast({ title: "Role Revoked", description: "Platform role has been removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/roles"] });
      setRoleRevokeTarget(null);
      setRevokeReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to revoke role", variant: "destructive" });
    },
  });

  const filteredRoles = platformRoles?.filter((r) => {
    if (!roleSearchQuery) return true;
    const q = roleSearchQuery.toLowerCase();
    return (
      r.userEmail?.toLowerCase().includes(q) ||
      r.userFirstName?.toLowerCase().includes(q) ||
      r.userLastName?.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q)
    );
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
        title: variables.enabled ? "Trinity™ Enabled" : "Trinity™ Suspended",
        description: variables.enabled 
          ? "Organization now has access to Trinity™ features"
          : "Trinity™ access has been suspended for this organization"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/end-users/workspace", selectedWorkspace] });
      setActionDialog(null);
      setActionReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to toggle Trinity™", variant: "destructive" });
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

  const pageConfig: CanvasPageConfig = {
    id: "end-user-controls",
    title: "Support Command Center",
    subtitle: "Cross-org management: employees, schedules, invoices, access controls, and Trinity™",
    category: "admin",
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs value={activeTopTab} onValueChange={setActiveTopTab} className="space-y-6">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="workspaces" data-testid="tab-workspaces">
            <Building2 className="h-4 w-4 mr-2" />
            Organizations
          </TabsTrigger>
          <TabsTrigger value="roles" data-testid="tab-roles">
            <UserCog className="h-4 w-4 mr-2" />
            Platform Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspaces">
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
                        className={['w-full p-3 rounded-lg border text-left transition-colors hover-elevate', selectedWorkspace === ws.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border'].join(' ')}
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
                <TabsList className="flex flex-wrap gap-1">
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
                  <TabsTrigger value="employees" data-testid="tab-employees">
                    <Briefcase className="h-4 w-4 mr-2" />
                    Staff
                  </TabsTrigger>
                  <TabsTrigger value="schedules" data-testid="tab-schedules">
                    <Calendar className="h-4 w-4 mr-2" />
                    Shifts
                  </TabsTrigger>
                  <TabsTrigger value="invoices" data-testid="tab-invoices">
                    <Receipt className="h-4 w-4 mr-2" />
                    Billing
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        Trinity™ Access
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">Trinity™ Features</p>
                          <p className="text-sm text-muted-foreground">
                            Enable or disable all Trinity™ functionality for this organization
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
                            Trinity™ is suspended
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
                            <div key={subagent} className="flex items-center justify-between gap-2 p-2 rounded border">
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
                            <div className="flex items-center justify-between gap-2">
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
                        Suspend Trinity™
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
                        Enable Trinity™
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

                <TabsContent value="employees" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Organization Staff ({orgEmployees?.length || 0})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {empLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : orgEmployees && orgEmployees.length > 0 ? (
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-2">
                            {orgEmployees.map((emp) => (
                              <div key={emp.id} className="flex items-center justify-between gap-2 p-3 rounded-md border" data-testid={`row-employee-${emp.id}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">{emp.firstName} {emp.lastName}</span>
                                    <Badge variant={emp.isActive ? "default" : "secondary"} className="text-xs">
                                      {emp.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                    {emp.workspaceRole && (
                                      <Badge variant="outline" className="text-xs">{emp.workspaceRole}</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                                    {emp.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{emp.email}</span>}
                                    {emp.employeeNumber && <span>#{emp.employeeNumber}</span>}
                                    {emp.position && <span>{emp.position}</span>}
                                    {emp.department && <span>{emp.department}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No employees found</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="schedules" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Shifts & Schedules ({orgShifts?.length || 0})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {shiftsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : orgShifts && orgShifts.length > 0 ? (
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-2">
                            {orgShifts.slice(0, 50).map((shift) => (
                              <div key={shift.id} className="flex items-center justify-between gap-2 p-3 rounded-md border" data-testid={`row-shift-${shift.id}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">{shift.title || `Shift #${shift.id}`}</span>
                                    {shift.status && (
                                      <Badge variant={shift.status === 'completed' ? 'default' : shift.status === 'cancelled' ? 'destructive' : 'outline'} className="text-xs">
                                        {shift.status}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {new Date(shift.startTime).toLocaleDateString()} {new Date(shift.startTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} - {new Date(shift.endTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                                    </span>
                                    {shift.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{shift.location}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No shifts found</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="invoices" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Receipt className="h-4 w-4" />
                        Invoices & Billing ({orgInvoices?.length || 0})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {invoicesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : orgInvoices && orgInvoices.length > 0 ? (
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-2">
                            {orgInvoices.map((inv) => (
                              <div key={inv.id} className="flex items-center justify-between gap-2 p-3 rounded-md border" data-testid={`row-invoice-${inv.id}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">{inv.invoiceNumber || `INV-${inv.id}`}</span>
                                    {inv.status && (
                                      <Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'overdue' ? 'destructive' : 'outline'} className="text-xs">
                                        {inv.status}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                                    {inv.clientName && <span>{inv.clientName}</span>}
                                    {inv.amount !== undefined && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{(inv.amount / 100).toFixed(2)}</span>}
                                    {inv.dueDate && <span>Due: {new Date(inv.dueDate).toLocaleDateString()}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No invoices found</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or role..."
                value={roleSearchQuery}
                onChange={(e) => setRoleSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-role-search"
              />
            </div>
            <Button onClick={() => setRoleAssignDialog(true)} data-testid="button-assign-role">
              <Shield className="h-4 w-4 mr-2" />
              Assign Role
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Roles</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-roles">{platformRoles?.length || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Platform Admins</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {platformRoles?.filter((r) => r.role === 'root_admin').length || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Support Staff</CardTitle>
                <UserCog className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {platformRoles?.filter((r) => r.role === 'support_agent' || r.role === 'support_manager').length || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Platform Team</CardTitle>
              <CardDescription>All platform staff with active role assignments</CardDescription>
            </CardHeader>
            <CardContent>
              {rolesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredRoles && filteredRoles.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {filteredRoles.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between gap-2 p-4 rounded-lg border"
                        data-testid={`row-role-${assignment.id}`}
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                            {assignment.userFirstName?.[0] || assignment.userEmail?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">
                              {assignment.userFirstName && assignment.userLastName
                                ? `${assignment.userFirstName} ${assignment.userLastName}`
                                : assignment.userEmail}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">{assignment.userEmail}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span>Granted: {new Date(assignment.grantedAt).toLocaleDateString()}</span>
                              {assignment.grantedReason && (
                                <span className="truncate max-w-[200px]">Reason: {assignment.grantedReason}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge
                            variant={
                              assignment.role === 'root_admin' ? 'destructive' :
                              assignment.role === 'deputy_admin' ? 'default' :
                              'secondary'
                            }
                            data-testid={`badge-role-${assignment.id}`}
                          >
                            {PLATFORM_ROLE_LABELS[assignment.role] || assignment.role}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setRoleRevokeTarget(assignment);
                              setRevokeReason("");
                            }}
                            data-testid={`button-revoke-${assignment.id}`}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {roleSearchQuery ? 'No matching roles found' : 'No platform roles assigned yet'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <UniversalModal open={roleAssignDialog} onOpenChange={(open) => !open && setRoleAssignDialog(false)}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Assign Platform Role</UniversalModalTitle>
            <UniversalModalDescription>
              Grant a platform role to a user. Enter their user ID and select a role.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User ID</Label>
              <Input
                placeholder="Enter the user's ID..."
                value={roleAssignData.userId}
                onChange={(e) => setRoleAssignData({ ...roleAssignData, userId: e.target.value })}
                data-testid="input-role-userid"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={roleAssignData.role}
                onValueChange={(value) => setRoleAssignData({ ...roleAssignData, role: value })}
              >
                <SelectTrigger data-testid="select-platform-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support_agent">Support Agent</SelectItem>
                  <SelectItem value="support_manager">Support Manager</SelectItem>
                  <SelectItem value="compliance_officer">Compliance Officer</SelectItem>
                  <SelectItem value="sysop">Sysop</SelectItem>
                  <SelectItem value="deputy_admin">Deputy Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Why is this role being assigned?"
                value={roleAssignData.reason}
                onChange={(e) => setRoleAssignData({ ...roleAssignData, reason: e.target.value })}
                data-testid="input-role-reason"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setRoleAssignDialog(false)}>Cancel</Button>
            <Button
              onClick={() => assignRoleMutation.mutate(roleAssignData)}
              disabled={!roleAssignData.userId || !roleAssignData.reason || assignRoleMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignRoleMutation.isPending ? "Assigning..." : "Assign Role"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!roleRevokeTarget} onOpenChange={(open) => !open && setRoleRevokeTarget(null)}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Revoke Platform Role</UniversalModalTitle>
            <UniversalModalDescription>
              Remove {roleRevokeTarget?.userEmail}'s {PLATFORM_ROLE_LABELS[roleRevokeTarget?.role || ''] || roleRevokeTarget?.role} role.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for Revocation</Label>
              <Textarea
                placeholder="Why is this role being revoked?"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                data-testid="input-revoke-reason"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setRoleRevokeTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (roleRevokeTarget) {
                  revokeRoleMutation.mutate({
                    userId: roleRevokeTarget.userId,
                    role: roleRevokeTarget.role,
                    reason: revokeReason,
                  });
                }
              }}
              disabled={!revokeReason || revokeRoleMutation.isPending}
              data-testid="button-confirm-revoke"
            >
              {revokeRoleMutation.isPending ? "Revoking..." : "Revoke Role"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={actionDialog === 'suspend'} onOpenChange={(open) => !open && setActionDialog(null)}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Suspend Organization</UniversalModalTitle>
            <UniversalModalDescription>
              This will prevent all users in this organization from accessing the platform.
            </UniversalModalDescription>
          </UniversalModalHeader>
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
          <UniversalModalFooter>
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
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={actionDialog === 'suspend-ai'} onOpenChange={(open) => !open && setActionDialog(null)}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Suspend Trinity™ Access</UniversalModalTitle>
            <UniversalModalDescription>
              This will disable all Trinity™ features for this organization, including subagents and automated workflows.
            </UniversalModalDescription>
          </UniversalModalHeader>
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
          <UniversalModalFooter>
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
              Suspend Trinity™
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
