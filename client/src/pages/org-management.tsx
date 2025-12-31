import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Building2, 
  Users, 
  Search,
  Shield,
  UserCog,
  UserX,
  UserCheck,
  ChevronRight,
  Crown,
  Settings,
  Mail,
  MoreVertical,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { ResponsiveLoading } from "@/components/loading-indicators";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Link } from "wouter";

const WORKSPACE_ROLES = [
  { value: 'org_owner', label: 'Organization Owner', description: 'Full control over organization', icon: Crown },
  { value: 'org_admin', label: 'Organization Admin', description: 'Day-to-day operations and user management', icon: Shield },
  { value: 'department_manager', label: 'Department Manager', description: 'Manages department tasks and staff', icon: UserCog },
  { value: 'supervisor', label: 'Supervisor', description: 'Team-level oversight', icon: UserCheck },
  { value: 'staff', label: 'Staff', description: 'Frontline worker', icon: Users },
];

interface Organization {
  id: string;
  name: string;
  memberCount: number;
  clientCount: number;
  createdAt: string;
  isOwner: boolean;
}

interface OrgMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  workspaceRole: string;
  isActive: boolean;
  lastActive?: string;
}

export default function OrgManagement() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, isPlatformStaff } = useWorkspaceAccess();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState("");

  const isOrgOwnerOrAdmin = workspaceRole === 'org_owner' || workspaceRole === 'org_admin' || isPlatformStaff;

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/organizations/managed'],
    enabled: isAuthenticated,
  });

  const { data: workspaceData } = useQuery<{ 
    id: string; 
    name: string; 
    subscriptionStatus: string;
    subscriptionPlan?: string;
  }>({
    queryKey: ['/api/workspace'],
    enabled: isAuthenticated,
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/workspace/reactivate");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ 
        title: "Subscription Renewed", 
        description: "Your organization is now active. Thank you for your payment." 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Renewal Failed", 
        description: error.message || "Unable to process subscription renewal. Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const { data: members = [], isLoading: membersLoading, refetch: refetchMembers } = useQuery<OrgMember[]>({
    queryKey: ['/api/organizations', selectedOrg?.id, 'members'],
    enabled: isAuthenticated && !!selectedOrg,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const response = await apiRequest("PATCH", `/api/employees/${memberId}/role`, { workspaceRole: role });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', selectedOrg?.id, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({ title: "Role Updated", description: "Member role has been updated successfully." });
      setIsRoleDialogOpen(false);
      setSelectedMember(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleAccessMutation = useMutation({
    mutationFn: async ({ memberId, isActive }: { memberId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/employees/${memberId}/access`, { isActive });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', selectedOrg?.id, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({ 
        title: variables.isActive ? "Access Granted" : "Access Revoked", 
        description: variables.isActive 
          ? "Member can now access the organization." 
          : "Member's access has been revoked."
      });
      setIsAccessDialogOpen(false);
      setSelectedMember(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Auto-select the current workspace organization when data loads
  useEffect(() => {
    if (workspaceData && organizations.length > 0 && !selectedOrg) {
      // Find the organization that matches the current workspace
      const currentOrg = organizations.find(org => org.id === workspaceData.id);
      if (currentOrg) {
        setSelectedOrg(currentOrg);
      } else if (organizations.length === 1) {
        // If only one org available, select it
        setSelectedOrg(organizations[0]);
      }
    }
  }, [workspaceData, organizations, selectedOrg]);

  if (authLoading || !isAuthenticated) {
    return <ResponsiveLoading message="Loading Organization Management..." />;
  }

  const filteredMembers = members.filter(member => 
    `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleIcon = (role: string) => {
    const roleConfig = WORKSPACE_ROLES.find(r => r.value === role);
    return roleConfig?.icon || Users;
  };

  const getRoleLabel = (role: string) => {
    const roleConfig = WORKSPACE_ROLES.find(r => r.value === role);
    return roleConfig?.label || role;
  };

  const handleRoleChange = (member: OrgMember) => {
    setSelectedMember(member);
    setNewRole(member.workspaceRole);
    setIsRoleDialogOpen(true);
  };

  const handleAccessToggle = (member: OrgMember) => {
    setSelectedMember(member);
    setIsAccessDialogOpen(true);
  };

  return (
    <WorkspaceLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Organization Management</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your organizations, team members, and access permissions
            </p>
          </div>
          {isPlatformStaff && (
            <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1 self-start">
              <Shield className="h-3 w-3" />
              Support Override Active
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Your Organizations
              </CardTitle>
              <CardDescription>
                Select an organization to manage members
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {orgsLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : organizations.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No organizations found</p>
                  <p className="text-xs mt-1">Organizations you own or manage will appear here</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="divide-y">
                    {organizations.map(org => (
                      <button
                        key={org.id}
                        onClick={() => setSelectedOrg(org)}
                        className={`w-full p-4 text-left hover-elevate flex items-center justify-between gap-3 transition-colors ${
                          selectedOrg?.id === org.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                        }`}
                        data-testid={`button-org-${org.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{org.name}</span>
                            {org.isOwner && (
                              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {org.memberCount} members
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    {selectedOrg ? `${selectedOrg.name} Members` : 'Team Members'}
                  </CardTitle>
                  <CardDescription>
                    {selectedOrg 
                      ? 'Manage roles and access for organization members' 
                      : 'Select an organization to view members'}
                  </CardDescription>
                </div>
                {selectedOrg && (
                  <Link href="/employees">
                    <Button variant="outline" size="sm" data-testid="button-view-all-employees">
                      View All
                    </Button>
                  </Link>
                )}
              </div>
              {selectedOrg && (
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search members..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-members"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {!selectedOrg ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select an organization</p>
                  <p className="text-xs mt-1">Choose an organization from the list to manage its members</p>
                </div>
              ) : membersLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No members found</p>
                  {searchQuery && <p className="text-xs mt-1">Try adjusting your search</p>}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="divide-y">
                    {filteredMembers.map(member => {
                      const RoleIcon = getRoleIcon(member.workspaceRole);
                      return (
                        <div
                          key={member.id}
                          className={`p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors ${
                            !member.isActive ? 'opacity-60' : ''
                          }`}
                          data-testid={`row-member-${member.id}`}
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className={member.isActive ? 'bg-primary/10' : 'bg-muted'}>
                              {member.firstName[0]}{member.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{member.firstName} {member.lastName}</span>
                              {!member.isActive && (
                                <Badge variant="secondary" className="text-[10px] px-1.5">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {member.email}
                              </span>
                            </div>
                          </div>
                          
                          <Badge variant="outline" className="gap-1 shrink-0">
                            <RoleIcon className="h-3 w-3" />
                            {getRoleLabel(member.workspaceRole)}
                          </Badge>
                          
                          {isOrgOwnerOrAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-member-menu-${member.id}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleRoleChange(member)}>
                                  <UserCog className="h-4 w-4 mr-2" />
                                  Change Role
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleAccessToggle(member)}
                                  className={member.isActive ? 'text-red-600' : 'text-green-600'}
                                >
                                  {member.isActive ? (
                                    <>
                                      <UserX className="h-4 w-4 mr-2" />
                                      Revoke Access
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="h-4 w-4 mr-2" />
                                      Grant Access
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {workspaceData && isOrgOwnerOrAdmin && (
          <Card className={workspaceData.subscriptionStatus !== 'active' ? 'border-destructive' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Subscription & Billing
                  </CardTitle>
                  <CardDescription>
                    Manage your organization's subscription and payment settings
                  </CardDescription>
                </div>
                {workspaceData.subscriptionStatus === 'active' ? (
                  <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {workspaceData.subscriptionStatus === 'suspended' ? 'Suspended' : 'Cancelled'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {workspaceData.subscriptionStatus !== 'active' ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-destructive">Subscription Inactive</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your organization's subscription has been {workspaceData.subscriptionStatus}. 
                        Team members cannot access the platform until you renew your subscription.
                      </p>
                      <Button 
                        className="mt-4 gap-2" 
                        onClick={() => reactivateMutation.mutate()}
                        disabled={reactivateMutation.isPending}
                        data-testid="button-renew-subscription"
                      >
                        {reactivateMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4" />
                            Renew Subscription
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-medium text-green-600 flex items-center gap-1 mt-1">
                      <CheckCircle className="h-4 w-4" />
                      Active
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="font-medium mt-1">
                      {workspaceData.subscriptionPlan || 'Professional'}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Organization</p>
                    <p className="font-medium mt-1 truncate">
                      {workspaceData.name}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Member Role</DialogTitle>
              <DialogDescription>
                Update the role for {selectedMember?.firstName} {selectedMember?.lastName}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="role-select">Select New Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="mt-2" id="role-select" data-testid="select-new-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {WORKSPACE_ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <role.icon className="h-4 w-4" />
                        <div>
                          <span className="font-medium">{role.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{role.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => selectedMember && updateRoleMutation.mutate({ memberId: selectedMember.id, role: newRole })}
                disabled={updateRoleMutation.isPending || newRole === selectedMember?.workspaceRole}
                data-testid="button-confirm-role-change"
              >
                {updateRoleMutation.isPending ? 'Updating...' : 'Update Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isAccessDialogOpen} onOpenChange={setIsAccessDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedMember?.isActive ? 'Revoke Access' : 'Grant Access'}
              </DialogTitle>
              <DialogDescription>
                {selectedMember?.isActive 
                  ? `Are you sure you want to revoke access for ${selectedMember?.firstName} ${selectedMember?.lastName}? They will no longer be able to access the organization.`
                  : `Grant access to ${selectedMember?.firstName} ${selectedMember?.lastName}? They will be able to access the organization again.`
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAccessDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant={selectedMember?.isActive ? 'destructive' : 'default'}
                onClick={() => selectedMember && toggleAccessMutation.mutate({ 
                  memberId: selectedMember.id, 
                  isActive: !selectedMember.isActive 
                })}
                disabled={toggleAccessMutation.isPending}
                data-testid="button-confirm-access-change"
              >
                {toggleAccessMutation.isPending 
                  ? 'Processing...' 
                  : selectedMember?.isActive ? 'Revoke Access' : 'Grant Access'
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </WorkspaceLayout>
  );
}
