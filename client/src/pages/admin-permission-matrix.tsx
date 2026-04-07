/**
 * Admin Permission Matrix — Platform-Wide Editor
 * ================================================
 * Allows platform staff (support agents, admins, sysops) to manage feature
 * access permissions and individual user roles across ANY workspace.
 *
 * Route: /admin/permission-matrix
 * Guard: RBACRoute require="platform_staff"
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocketBus } from "@/providers/WebSocketProvider";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Info,
  Building2,
  Users,
  ChevronRight,
  UserCog,
  AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Workspace {
  id: string;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  employeeCount: number;
}

interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  category: "page" | "action" | "report" | "data";
  defaultRoles: string[];
}

interface MatrixEntry {
  role: string;
  featureKey: string;
  enabled: boolean;
  isOverride: boolean;
}

interface WorkspaceUser {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  workspaceRole: string;
  position: string | null;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Org Admin",
  org_manager: "Org Manager",
  department_manager: "Dept Manager",
  manager: "Manager",
  supervisor: "Supervisor",
  shift_leader: "Shift Leader",
  guard: "Guard",
  security_officer: "Security Officer",
  armed_officer: "Armed Officer",
  site_lead: "Site Lead",
  contractor: "Contractor",
};

const CATEGORY_ORDER = ["page", "action", "report", "data"];
const CATEGORY_LABELS: Record<string, string> = {
  page: "Pages",
  action: "Actions",
  report: "Reports",
  data: "Data Access",
};

const EDITABLE_ROLES = Object.keys(ROLE_LABELS);

// ── Main Component ──────────────────────────────────────────────────────────

export default function AdminPermissionMatrixPage() {
  const { toast } = useToast();
  const bus = useWebSocketBus();
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({});

  // ── Workspace list ────────────────────────────────────────────────────────
  const { data: workspacesData, isLoading: orgsLoading, refetch: refetchOrgs } = useQuery<{
    workspaces: Workspace[];
  }>({
    queryKey: ["/api/admin/permissions/workspaces", orgSearch],
    queryFn: async () => {
      const params = orgSearch ? `?search=${encodeURIComponent(orgSearch)}&limit=30` : "?limit=30";
      const res = await fetch(`/api/admin/permissions/workspaces${params}`);
      if (!res.ok) throw new Error("Failed to load workspaces");
      return res.json();
    },
  });

  // ── Feature registry meta ─────────────────────────────────────────────────
  const { data: meta } = useQuery<{ features: FeatureDefinition[]; roles: readonly string[] }>({
    queryKey: ["/api/admin/permissions/meta"],
  });

  // ── Matrix for selected workspace ─────────────────────────────────────────
  const { data: matrixData, isLoading: matrixLoading, refetch: refetchMatrix } = useQuery<{
    matrix: MatrixEntry[];
  }>({
    queryKey: ["/api/admin/permissions/workspaces", selectedWorkspace?.id, "matrix"],
    queryFn: async () => {
      if (!selectedWorkspace) return { matrix: [] };
      const res = await fetch(`/api/admin/permissions/workspaces/${selectedWorkspace.id}/matrix`);
      if (!res.ok) throw new Error("Failed to load matrix");
      return res.json();
    },
    enabled: !!selectedWorkspace,
  });

  // ── Users for selected workspace ──────────────────────────────────────────
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery<{
    users: WorkspaceUser[];
  }>({
    queryKey: ["/api/admin/permissions/workspaces", selectedWorkspace?.id, "users", userSearch],
    queryFn: async () => {
      if (!selectedWorkspace) return { users: [] };
      const params = userSearch ? `?search=${encodeURIComponent(userSearch)}&limit=100` : "?limit=100";
      const res = await fetch(`/api/admin/permissions/workspaces/${selectedWorkspace.id}/users${params}`);
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    enabled: !!selectedWorkspace,
  });

  // ── WS — live permission_update ───────────────────────────────────────────
  useEffect(() => {
    const unsub = bus.subscribe("permission_update", () => {
      if (selectedWorkspace) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/permissions/workspaces", selectedWorkspace.id, "matrix"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/permissions/workspaces", selectedWorkspace.id, "users"],
        });
      }
    });
    return unsub;
  }, [bus, selectedWorkspace]);

  // ── Permission toggle mutation ─────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: ({ role, featureKey, enabled }: { role: string; featureKey: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/permissions/workspaces/${selectedWorkspace!.id}/matrix`, {
        role,
        featureKey,
        enabled,
      }),
    onSuccess: (_data, variables) => {
      const key = `${variables.role}:${variables.featureKey}`;
      setPendingToggles((prev) => { const n = { ...prev }; delete n[key]; return n; });
      refetchMatrix();
      toast({ title: "Permission updated", description: `${variables.featureKey} → ${variables.role}` });
    },
    onError: (_err, variables) => {
      const key = `${variables.role}:${variables.featureKey}`;
      setPendingToggles((prev) => { const n = { ...prev }; delete n[key]; return n; });
      toast({ title: "Failed to update permission", variant: "destructive" });
      refetchMatrix();
    },
  });

  // ── Permission reset mutation ──────────────────────────────────────────────
  const resetMutation = useMutation({
    mutationFn: ({ role, featureKey }: { role: string; featureKey: string }) =>
      apiRequest("DELETE", `/api/admin/permissions/workspaces/${selectedWorkspace!.id}/matrix`, {
        role,
        featureKey,
      }),
    onSuccess: () => { refetchMatrix(); toast({ title: "Permission reset to default" }); },
    onError: () => toast({ title: "Failed to reset permission", variant: "destructive" }),
  });

  // ── User role mutation ────────────────────────────────────────────────────
  const userRoleMutation = useMutation({
    mutationFn: ({ userId, workspaceRole }: { userId: string; workspaceRole: string }) =>
      apiRequest("PATCH", `/api/admin/permissions/workspaces/${selectedWorkspace!.id}/users/${userId}/role`, {
        workspaceRole,
        reason: "Platform admin role assignment",
      }),
    onSuccess: () => { refetchUsers(); toast({ title: "User role updated" }); },
    onError: () => toast({ title: "Failed to update user role", variant: "destructive" }),
  });

  const handleToggle = useCallback(
    (role: string, featureKey: string, currentValue: boolean) => {
      const key = `${role}:${featureKey}`;
      setPendingToggles((prev) => ({ ...prev, [key]: !currentValue }));
      toggleMutation.mutate({ role, featureKey, enabled: !currentValue });
    },
    [toggleMutation]
  );

  // ── Build matrix lookup ───────────────────────────────────────────────────
  const matrixMap = new Map<string, MatrixEntry>();
  if (matrixData?.matrix) {
    for (const entry of matrixData.matrix) {
      matrixMap.set(`${entry.role}:${entry.featureKey}`, entry);
    }
  }

  function getEffective(role: string, featureKey: string) {
    const key = `${role}:${featureKey}`;
    if (key in pendingToggles) return { enabled: pendingToggles[key], isOverride: true };
    return matrixMap.get(key) ?? { enabled: false, isOverride: false };
  }

  const featuresByCategory: Record<string, FeatureDefinition[]> = {};
  if (meta?.features) {
    for (const f of meta.features) {
      if (!featuresByCategory[f.category]) featuresByCategory[f.category] = [];
      featuresByCategory[f.category].push(f);
    }
  }

  const roles = meta?.roles ?? [];

  return (
    <div className="flex h-full" data-testid="admin-permission-matrix-page">
      {/* ── Left: Org Picker ─────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Platform Permissions</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search orgs..."
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              className="pl-8 text-sm"
              data-testid="input-org-search"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {orgsLoading ? (
            <div className="p-4 flex flex-col gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !workspacesData?.workspaces?.length ? (
            <div className="p-4 text-xs text-muted-foreground text-center">No orgs found</div>
          ) : (
            <div className="p-2 flex flex-col gap-1">
              {workspacesData.workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    setSelectedWorkspace(ws);
                    setPendingToggles({});
                  }}
                  data-testid={`btn-select-org-${ws.id}`}
                  className={`w-full text-left rounded-md p-2.5 transition-colors hover-elevate ${
                    selectedWorkspace?.id === ws.id
                      ? "bg-primary/10 text-primary"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium truncate">{ws.name}</span>
                    </div>
                    {selectedWorkspace?.id === ws.id && (
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 ml-5">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {ws.subscriptionTier}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {ws.employeeCount ?? 0} users
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Editor ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!selectedWorkspace ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Building2 className="w-10 h-10 opacity-30" />
            <p className="text-sm">Select an organization to manage its permissions</p>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-4">
            {/* ── Workspace header ─────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Platform-wide admin access — changes apply immediately to all active sessions.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { refetchMatrix(); refetchUsers(); }}
                data-testid="button-refresh-admin-matrix"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Refresh
              </Button>
            </div>

            {/* ── Tabs: Matrix | Users ─────────────────────────────────── */}
            <Tabs defaultValue="matrix">
              <TabsList data-testid="tabs-permission-editor">
                <TabsTrigger value="matrix" data-testid="tab-matrix">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                  Permission Matrix
                </TabsTrigger>
                <TabsTrigger value="users" data-testid="tab-users">
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  User Roles
                </TabsTrigger>
              </TabsList>

              {/* ── Matrix Tab ─────────────────────────────────────────── */}
              <TabsContent value="matrix" className="mt-4">
                {matrixLoading ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {CATEGORY_ORDER.filter((cat) => featuresByCategory[cat]?.length > 0).map((category) => (
                      <Card key={category} data-testid={`card-admin-category-${category}`}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">{CATEGORY_LABELS[category] ?? category}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr>
                                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground min-w-36">Feature</th>
                                  {roles.map((role) => (
                                    <th
                                      key={role}
                                      className="text-center py-2 px-2 font-medium text-muted-foreground min-w-20"
                                    >
                                      {ROLE_LABELS[role] ?? role}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {featuresByCategory[category].map((feature) => (
                                  <tr key={feature.key} className="border-t border-border/50">
                                    <td className="py-2.5 pr-4">
                                      <div className="flex items-center gap-1">
                                        <span className="font-medium">{feature.label}</span>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                          </TooltipTrigger>
                                          <TooltipContent side="right" className="max-w-48">
                                            {feature.description}
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </td>
                                    {roles.map((role) => {
                                      const { enabled, isOverride } = getEffective(role, feature.key);
                                      const cellKey = `${role}:${feature.key}`;
                                      const isPending = cellKey in pendingToggles;
                                      return (
                                        <td key={role} className="py-2.5 px-2 text-center">
                                          <div className="flex flex-col items-center gap-1">
                                            <Switch
                                              checked={enabled}
                                              onCheckedChange={() => handleToggle(role, feature.key, enabled)}
                                              disabled={isPending || toggleMutation.isPending}
                                              data-testid={`admin-toggle-${role}-${feature.key}`}
                                            />
                                            {isOverride && (
                                              <Badge
                                                variant="outline"
                                                className="text-[9px] px-1 py-0 cursor-pointer"
                                                onClick={() => resetMutation.mutate({ role, featureKey: feature.key })}
                                                data-testid={`admin-badge-reset-${role}-${feature.key}`}
                                              >
                                                reset
                                              </Badge>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── User Roles Tab ──────────────────────────────────────── */}
              <TabsContent value="users" className="mt-4">
                <div className="flex flex-col gap-3">
                  {/* User search */}
                  <div className="relative max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search users by name or email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-8 text-sm"
                      data-testid="input-user-search"
                    />
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <UserCog className="w-4 h-4" />
                        User Role Assignments
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Change individual users' workspace roles. Owner roles (org_owner, co_owner) are
                        excluded from this editor — use workspace transfer for ownership changes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {usersLoading ? (
                        <div className="flex flex-col gap-2">
                          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                      ) : !usersData?.users?.length ? (
                        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                          <AlertCircle className="w-5 h-5" />
                          <p className="text-xs">No users found</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {/* Header row */}
                          <div className="grid grid-cols-[1fr_140px_180px] gap-3 text-xs font-medium text-muted-foreground pb-1 border-b">
                            <span>User</span>
                            <span>Current Role</span>
                            <span>Change Role</span>
                          </div>
                          {usersData.users.map((user) => (
                            <div
                              key={user.id}
                              className="grid grid-cols-[1fr_140px_180px] gap-3 items-center py-2 border-b border-border/40"
                              data-testid={`row-user-${user.id}`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">
                                  {user.firstName} {user.lastName}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                              </div>
                              <div>
                                <Badge variant="outline" className="text-[10px]">
                                  {ROLE_LABELS[user.workspaceRole] ?? user.workspaceRole}
                                </Badge>
                              </div>
                              <div>
                                {['org_owner', 'co_owner'].includes(user.workspaceRole) ? (
                                  <span className="text-[10px] text-muted-foreground italic">Owner — immutable</span>
                                ) : (
                                  <Select
                                    value={user.workspaceRole}
                                    onValueChange={(val) =>
                                      userRoleMutation.mutate({ userId: user.id, workspaceRole: val })
                                    }
                                    disabled={userRoleMutation.isPending}
                                  >
                                    <SelectTrigger
                                      className="h-7 text-xs"
                                      data-testid={`select-role-${user.id}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {EDITABLE_ROLES.map((r) => (
                                        <SelectItem key={r} value={r} className="text-xs">
                                          {ROLE_LABELS[r] ?? r}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
