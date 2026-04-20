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
  Pause,
  Play,
  Lock,
  Unlock,
  Snowflake,
  Wrench,
  Power,
  PowerOff,
  KeyRound,
  LogOut,
  Eye,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
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
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Link } from "wouter";

const WORKSPACE_ROLES = [
  { value: 'org_owner', label: 'Organization Owner', description: 'Full control over organization', icon: Crown },
  { value: 'co_owner', label: 'Co-Owner', description: 'Delegated authority, access controlled by owner', icon: Shield },
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
  canManage: boolean;
  subscriptionStatus: string;
  isSuspended: boolean;
  suspendedReason?: string;
  isFrozen: boolean;
  frozenReason?: string;
  isLocked: boolean;
  lockedReason?: string;
  accountState: string;
  workspaceType?: string;
  isPlatformSupport?: boolean;
}

interface OrgMember {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  workspaceRole: string;
  isActive: boolean;
  lastActive?: string;
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

const SYSTEM_BOTS = [
  { id: 'trinity-ai', name: 'Trinity AI', role: 'Deputy Admin Authority', authority: 'deputy_admin', description: 'Primary AI orchestrator - scheduling, monitoring, payroll, and platform intelligence', status: 'active' },
  { id: 'helpai-bot', name: 'HelpAI Bot', role: 'Deputy Admin Authority', authority: 'deputy_admin', description: 'AI support assistant with elevated authority for help desk operations', status: 'active' },
  { id: 'meeting-bot', name: 'MeetingBot', role: 'Scheduling Bot', authority: 'support_agent', description: 'Automated meeting scheduling and reminders', status: 'active' },
  { id: 'report-bot', name: 'ReportBot', role: 'Analytics Bot', authority: 'support_agent', description: 'Automated report generation and distribution', status: 'active' },
  { id: 'clock-bot', name: 'ClockBot', role: 'Time Tracking Bot', authority: 'support_agent', description: 'Automated clock-in/out reminders and tracking', status: 'active' },
  { id: 'cleanup-bot', name: 'CleanupBot', role: 'Maintenance Bot', authority: 'support_agent', description: 'Automated data cleanup and system maintenance', status: 'active' },
];

function getStatusBadges(org: Organization) {
  const badges: { label: string; className: string }[] = [];
  if (org.isSuspended) {
    badges.push({ label: "Suspended", className: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700" });
  }
  if (org.isFrozen) {
    badges.push({ label: "Frozen", className: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700" });
  }
  if (org.isLocked) {
    badges.push({ label: "Locked", className: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700" });
  }
  if (org.accountState === "maintenance") {
    badges.push({ label: "Maintenance", className: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700" });
  }
  if (badges.length === 0) {
    badges.push({ label: "Active", className: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" });
  }
  return badges;
}

export default function OrgManagement() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, isPlatformStaff } = useWorkspaceAccess();
  const [orgSearchQuery, setOrgSearchQuery] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: string; label: string; requiresReason: boolean } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [supportActionDialogOpen, setSupportActionDialogOpen] = useState(false);
  const [supportAction, setSupportAction] = useState<{type: string; member: OrgMember | null; newEmail?: string}>({type: '', member: null});
  const [newEmailInput, setNewEmailInput] = useState('');
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('10');
  const [discountReason, setDiscountReason] = useState('');
  const [activeTab, setActiveTab] = useState("organizations");
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [roleAssignDialog, setRoleAssignDialog] = useState(false);
  const [roleAssignData, setRoleAssignData] = useState({ userId: "", role: "support_agent", reason: "" });
  const [roleRevokeTarget, setRoleRevokeTarget] = useState<PlatformRoleAssignment | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const platformRoleLevels: Record<string, number> = {
    'none': 0, 'Bot': 1, 'compliance_officer': 2, 'support_agent': 3,
    'support_manager': 4, 'sysop': 5, 'deputy_admin': 6, 'root_admin': 7,
  };
  const userPlatformLevel = platformRoleLevels[user?.platformRole || 'none'] || 0;
  const isOrgOwnerOrAdmin = workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || isPlatformStaff;

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

  const { data: members = [], isLoading: membersLoading } = useQuery<OrgMember[]>({
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
      const response = await apiRequest("PATCH", `/api/employees/${memberId}/access`, { isActive, workspaceId: selectedOrg?.id });
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

  const orgStatusMutation = useMutation({
    mutationFn: async ({ orgId, action, reason }: { orgId: string; action: string; reason?: string }) => {
      const response = await apiRequest("PATCH", `/api/organizations/${orgId}/status`, { action, reason });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations/managed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      toast({ title: "Status Updated", description: data.message || "Organization status updated successfully." });
      setActionDialogOpen(false);
      setPendingAction(null);
      setActionReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const supportActionMutation = useMutation({
    mutationFn: async ({ action, member, newEmail }: { action: string; member: OrgMember; newEmail?: string }) => {
      const endpoints: Record<string, string> = {
        'reset_password': '/api/support/actions/reset-password',
        'lock_account': '/api/support/actions/lock-account',
        'unlock_account': '/api/support/actions/unlock-account',
        'revoke_sessions': '/api/support/actions/revoke-sessions',
        'reset_email': '/api/support/actions/reset-email',
        'view_user': '/api/support/actions/view-user',
      };
      const endpoint = endpoints[action];
      if (!endpoint) throw new Error('Unknown action');
      
      const body: any = {};
      const resolvedUserId = member.userId || member.id;
      if (action === 'reset_password') {
        body.targetEmail = member.email;
      } else if (action === 'reset_email') {
        body.targetUserId = resolvedUserId;
        body.newEmail = newEmail;
      } else {
        body.targetUserId = resolvedUserId;
      }
      
      const res = await apiRequest('POST', endpoint, body);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success === false) {
        toast({ title: 'Action Failed', description: data.message || 'Support action was not completed.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Action Completed', description: data.message || 'Support action executed successfully.' });
      setSupportActionDialogOpen(false);
      setNewEmailInput('');
      if (selectedOrg) {
        queryClient.invalidateQueries({ queryKey: ['/api/organizations', selectedOrg.id, 'members'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Action Failed', description: error.message, variant: 'destructive' });
    },
  });

  const refundCreditsMutation = useMutation({
    mutationFn: async ({ workspaceId, amount, reason }: { workspaceId: string; amount: number; reason: string }) => {
      const res = await apiRequest('POST', '/api/support/actions/refund-credits', { workspaceId, amount, reason });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success === false) {
        toast({ title: 'Refund Failed', description: data.errorMessage || 'Could not process credit refund.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Credits Refunded', description: `${refundAmount} credits refunded. New balance: ${data.newBalance}` });
      setRefundDialogOpen(false);
      setRefundAmount('');
      setRefundReason('');
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/usage'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Refund Failed', description: error.message, variant: 'destructive' });
    },
  });

  const issueDiscountMutation = useMutation({
    mutationFn: async ({ workspaceId, discountPercent: pct, reason }: { workspaceId: string; discountPercent: number; reason: string }) => {
      const res = await apiRequest('POST', '/api/support/actions/issue-discount', { workspaceId, discountPercent: pct, reason });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success === false) {
        toast({ title: 'Discount Failed', description: data.error || 'Could not issue discount.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Discount Issued', description: data.message || `Discount applied successfully.` });
      setDiscountDialogOpen(false);
      setDiscountPercent('10');
      setDiscountReason('');
    },
    onError: (error: Error) => {
      toast({ title: 'Discount Failed', description: error.message, variant: 'destructive' });
    },
  });

  const { data: platformRoles, isLoading: rolesLoading } = useQuery<PlatformRoleAssignment[]>({
    queryKey: ["/api/admin/platform/roles"],
    enabled: activeTab === 'roles',
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

  useEffect(() => {
    if (workspaceData && organizations.length > 0 && !selectedOrg) {
      const currentOrg = organizations.find(org => org.id === workspaceData.id);
      if (currentOrg) {
        setSelectedOrg(currentOrg);
      } else if (organizations.length === 1) {
        setSelectedOrg(organizations[0]);
      }
    }
  }, [workspaceData, organizations, selectedOrg]);

  useEffect(() => {
    if (selectedOrg && organizations.length > 0) {
      const updated = organizations.find(org => org.id === selectedOrg.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedOrg)) {
        setSelectedOrg(updated);
      }
    }
  }, [organizations, selectedOrg]);

  if (authLoading || !isAuthenticated) {
    return <ResponsiveLoading message="Loading Organization Management..." />;
  }

  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(orgSearchQuery.toLowerCase())
  );

  const filteredMembers = members.filter(member => 
    `${member.firstName} ${member.lastName}`.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
    member.email.toLowerCase().includes(memberSearchQuery.toLowerCase())
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

  function handleSupportAction(action: string, member: OrgMember) {
    if (action === 'reset_email') {
      setSupportAction({ type: action, member });
      setNewEmailInput(member.email || '');
      setSupportActionDialogOpen(true);
    } else {
      supportActionMutation.mutate({ action, member });
    }
  }

  const handleOrgAction = (action: string, label: string, requiresReason: boolean) => {
    setPendingAction({ action, label, requiresReason });
    setActionReason("");
    setActionDialogOpen(true);
  };

  const confirmOrgAction = () => {
    if (!selectedOrg || !pendingAction) return;
    orgStatusMutation.mutate({
      orgId: selectedOrg.id,
      action: pendingAction.action,
      reason: pendingAction.requiresReason ? actionReason : undefined,
    });
  };

  const pageConfig: CanvasPageConfig = {
    id: 'org-management',
    title: 'Organization Management',
    subtitle: 'Manage your organizations, team members, and access permissions',
    category: 'admin',
    headerActions: isPlatformStaff ? (
      <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
        <Shield className="h-3 w-3" />
        Support Override Active
      </Badge>
    ) : undefined,
  };

  const orgContent = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {isPlatformStaff ? "All Organizations" : "Your Organizations"}
            </CardTitle>
            <CardDescription>
              Select an organization to manage
            </CardDescription>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations..."
                value={orgSearchQuery}
                onChange={(e) => setOrgSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-orgs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {orgsLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredOrgs.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No organizations found</p>
                <p className="text-xs mt-1">
                  {orgSearchQuery ? "Try adjusting your search" : "Organizations you own or manage will appear here"}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {filteredOrgs.map(org => {
                    const badges = getStatusBadges(org);
                    return (
                      <button
                        key={org.id}
                        onClick={() => {
                          setSelectedOrg(org);
                          setMemberSearchQuery("");
                        }}
                        className={`w-full p-4 text-left hover-elevate flex items-center justify-between gap-3 transition-colors ${
                          selectedOrg?.id === org.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                        }`}
                        data-testid={`button-org-${org.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{org.name}</span>
                            {org.isOwner && (
                              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {org.memberCount}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {badges.map((b, idx) => (
                              <Badge key={idx} variant="outline" className={`text-[10px] px-1.5 py-0 ${b.className}`}>
                                {b.label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {!selectedOrg ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select an organization</p>
                <p className="text-xs mt-1">Choose an organization from the list to manage it</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        {selectedOrg.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        ID: {selectedOrg.id}
                        {selectedOrg.workspaceType && ` | Type: ${selectedOrg.workspaceType}`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadges(selectedOrg).map((b, idx) => (
                        <Badge key={idx} variant="outline" className={b.className}>
                          {b.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">Members</p>
                      <p className="text-lg font-semibold mt-1" data-testid="text-member-count">{selectedOrg.memberCount}</p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">Clients</p>
                      <p className="text-lg font-semibold mt-1" data-testid="text-client-count">{selectedOrg.clientCount}</p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">Subscription</p>
                      <p className="text-sm font-medium mt-1" data-testid="text-subscription-status">{selectedOrg.subscriptionStatus}</p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">Account State</p>
                      <p className="text-sm font-medium mt-1" data-testid="text-account-state">{selectedOrg.accountState}</p>
                    </div>
                  </div>
                  {(selectedOrg.suspendedReason || selectedOrg.frozenReason || selectedOrg.lockedReason) && (
                    <div className="mt-4 space-y-2">
                      {selectedOrg.suspendedReason && (
                        <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>Suspended: {selectedOrg.suspendedReason}</span>
                        </div>
                      )}
                      {selectedOrg.frozenReason && (
                        <div className="flex items-start gap-2 text-sm text-blue-600 dark:text-blue-400">
                          <Snowflake className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>Frozen: {selectedOrg.frozenReason}</span>
                        </div>
                      )}
                      {selectedOrg.lockedReason && (
                        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>Locked: {selectedOrg.lockedReason}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {isPlatformStaff && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Settings className="h-5 w-5 text-primary" />
                      Management Actions
                    </CardTitle>
                    <CardDescription>
                      Platform staff actions for this organization
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-3 flex-wrap justify-start">
                      {selectedOrg.isSuspended ? (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("unsuspend", "Unsuspend Organization", false)}
                          data-testid="button-unsuspend-org"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Unsuspend
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("suspend", "Suspend Organization", true)}
                          data-testid="button-suspend-org"
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Suspend
                        </Button>
                      )}

                      {selectedOrg.isFrozen ? (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("unfreeze", "Unfreeze Organization", false)}
                          data-testid="button-unfreeze-org"
                        >
                          <Snowflake className="h-4 w-4 mr-2" />
                          Unfreeze
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("freeze", "Freeze Organization", true)}
                          data-testid="button-freeze-org"
                        >
                          <Snowflake className="h-4 w-4 mr-2" />
                          Freeze
                        </Button>
                      )}

                      {selectedOrg.isLocked ? (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("unlock", "Unlock Organization", false)}
                          data-testid="button-unlock-org"
                        >
                          <Unlock className="h-4 w-4 mr-2" />
                          Unlock
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("lock", "Lock Organization", true)}
                          data-testid="button-lock-org"
                        >
                          <Lock className="h-4 w-4 mr-2" />
                          Lock
                        </Button>
                      )}

                      {selectedOrg.accountState === "maintenance" ? (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("activate", "Clear Maintenance", false)}
                          data-testid="button-clear-maintenance"
                        >
                          <Wrench className="h-4 w-4 mr-2" />
                          Clear Maintenance
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("maintenance", "Set Maintenance Mode", true)}
                          data-testid="button-set-maintenance"
                        >
                          <Wrench className="h-4 w-4 mr-2" />
                          Maintenance
                        </Button>
                      )}

                      {selectedOrg.accountState === "suspended" || selectedOrg.subscriptionStatus === "suspended" ? (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("activate", "Activate Organization", false)}
                          data-testid="button-activate-org"
                        >
                          <Power className="h-4 w-4 mr-2" />
                          Activate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => handleOrgAction("deactivate", "Deactivate Organization", false)}
                          data-testid="button-deactivate-org"
                        >
                          <PowerOff className="h-4 w-4 mr-2" />
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        Members
                      </CardTitle>
                      <CardDescription>
                        Manage roles and access for organization members
                      </CardDescription>
                    </div>
                    <Link href="/employees">
                      <Button variant="outline" size="sm" data-testid="button-view-all-employees">
                        View All
                      </Button>
                    </Link>
                  </div>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-members"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {membersLoading ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No members found</p>
                      {memberSearchQuery && <p className="text-xs mt-1">Try adjusting your search</p>}
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="divide-y">
                        {filteredMembers.map(member => {
                          const RoleIcon = getRoleIcon(member.workspaceRole);
                          return (
                            <div
                              key={member.id}
                              className={`p-4 flex items-center gap-4 ${
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
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{member.firstName} {member.lastName}</span>
                                  {!member.isActive && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5">
                                      Inactive
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
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
                                    <DropdownMenuItem onClick={() => handleRoleChange(member)} data-testid={`button-change-role-${member.id}`}>
                                      <UserCog className="h-4 w-4 mr-2" />
                                      Change Role
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleAccessToggle(member)}
                                      className={member.isActive ? 'text-red-600' : 'text-green-600'}
                                      data-testid={`button-toggle-access-${member.id}`}
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
                                    {isPlatformStaff && userPlatformLevel >= 3 && (
                                      <>
                                        <DropdownMenuSeparator />
                                        {userPlatformLevel >= 3 && (
                                          <DropdownMenuItem onClick={() => handleSupportAction('reset_password', member)} data-testid={`button-reset-password-${member.id}`}>
                                            <KeyRound className="h-4 w-4 mr-2" />
                                            Reset Password {userPlatformLevel < 4 ? '(needs approval)' : ''}
                                          </DropdownMenuItem>
                                        )}
                                        {userPlatformLevel >= 5 && (
                                          <DropdownMenuItem onClick={() => handleSupportAction('reset_email', member)} data-testid={`button-reset-email-${member.id}`}>
                                            <Mail className="h-4 w-4 mr-2" />
                                            Reset Email {userPlatformLevel < 6 ? '(needs approval)' : ''}
                                          </DropdownMenuItem>
                                        )}
                                        {userPlatformLevel >= 3 && (
                                          <DropdownMenuItem onClick={() => handleSupportAction('lock_account', member)} data-testid={`button-lock-account-${member.id}`}>
                                            <Lock className="h-4 w-4 mr-2" />
                                            Lock Account {userPlatformLevel < 4 ? '(needs approval)' : ''}
                                          </DropdownMenuItem>
                                        )}
                                        {userPlatformLevel >= 3 && (
                                          <DropdownMenuItem onClick={() => handleSupportAction('unlock_account', member)} data-testid={`button-unlock-account-${member.id}`}>
                                            <Unlock className="h-4 w-4 mr-2" />
                                            Unlock Account
                                          </DropdownMenuItem>
                                        )}
                                        {userPlatformLevel >= 5 && (
                                          <DropdownMenuItem onClick={() => handleSupportAction('revoke_sessions', member)} data-testid={`button-revoke-sessions-${member.id}`}>
                                            <LogOut className="h-4 w-4 mr-2" />
                                            Revoke Sessions {userPlatformLevel < 6 ? '(needs approval)' : ''}
                                          </DropdownMenuItem>
                                        )}
                                      </>
                                    )}
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
            </>
          )}

          {workspaceData && isOrgOwnerOrAdmin && (
            <Card className={workspaceData.subscriptionStatus !== 'active' ? 'border-destructive' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
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
                    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 gap-1 no-default-hover-elevate no-default-active-elevate">
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
                  <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4">
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
                    <div className="p-4 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-medium text-green-600 flex items-center gap-1 mt-1">
                        <CheckCircle className="h-4 w-4" />
                        Active
                      </p>
                    </div>
                    <div className="p-4 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="font-medium mt-1">
                        {workspaceData.subscriptionPlan || 'Professional'}
                      </p>
                    </div>
                    <div className="p-4 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">Organization</p>
                      <p className="font-medium mt-1 truncate">
                        {workspaceData.name}
                      </p>
                    </div>
                  </div>
                )}
                {isPlatformStaff && userPlatformLevel >= 3 && selectedOrg && (
                  <div className="mt-4 pt-4 border-t flex items-center gap-2 flex-wrap">
                    {userPlatformLevel >= 5 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRefundDialogOpen(true)}
                        data-testid="button-refund-credits"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refund Credits
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDiscountDialogOpen(true)}
                      data-testid="button-issue-discount"
                    >
                      <CreditCard className="h-4 w-4 mr-1" />
                      Issue Discount
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
  );

  return (
    <CanvasHubPage config={pageConfig}>
      {isPlatformStaff ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="organizations" data-testid="tab-organizations">
              <Building2 className="h-4 w-4 mr-2" />
              Organizations
            </TabsTrigger>
            <TabsTrigger value="roles" data-testid="tab-platform-roles">
              <Shield className="h-4 w-4 mr-2" />
              Platform Roles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organizations">
            {orgContent}
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

            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Roles</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-roles">{(platformRoles?.length || 0) + SYSTEM_BOTS.length}</div>
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
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Bots</CardTitle>
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-system-bots">{SYSTEM_BOTS.length}</div>
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

            <Card>
              <CardHeader>
                <CardTitle>System Bots</CardTitle>
                <CardDescription>Autonomous platform bots that provide automated services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SYSTEM_BOTS.map((bot) => (
                    <div
                      key={bot.id}
                      className="flex items-center justify-between gap-2 p-4 rounded-lg border"
                      data-testid={`row-bot-${bot.id}`}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-medium">
                          <Wrench className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{bot.name}</p>
                          <p className="text-sm text-muted-foreground">{bot.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge
                          variant={bot.authority === 'deputy_admin' ? 'default' : 'secondary'}
                          data-testid={`badge-bot-${bot.id}`}
                        >
                          {bot.role}
                        </Badge>
                        <Badge variant="outline" className="border-green-500/50 text-green-600 dark:text-green-400">
                          Active
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        orgContent
      )}

      <UniversalModal open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Change Member Role</UniversalModalTitle>
            <UniversalModalDescription>
              Update the role for {selectedMember?.firstName} {selectedMember?.lastName}
            </UniversalModalDescription>
          </UniversalModalHeader>
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
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)} data-testid="button-cancel-role">
              Cancel
            </Button>
            <Button 
              onClick={() => selectedMember && updateRoleMutation.mutate({ memberId: selectedMember.id, role: newRole })}
              disabled={updateRoleMutation.isPending || newRole === selectedMember?.workspaceRole}
              data-testid="button-confirm-role"
            >
              {updateRoleMutation.isPending ? "Updating..." : "Update Role"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={isAccessDialogOpen} onOpenChange={setIsAccessDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>
              {selectedMember?.isActive ? 'Revoke Access' : 'Grant Access'}
            </UniversalModalTitle>
            <UniversalModalDescription>
              {selectedMember?.isActive
                ? `Are you sure you want to revoke access for ${selectedMember?.firstName} ${selectedMember?.lastName}? They will no longer be able to access the organization.`
                : `Grant access to ${selectedMember?.firstName} ${selectedMember?.lastName}? They will be able to access the organization again.`
              }
            </UniversalModalDescription>
          </UniversalModalHeader>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setIsAccessDialogOpen(false)} data-testid="button-cancel-access">
              Cancel
            </Button>
            <Button
              variant={selectedMember?.isActive ? "destructive" : "default"}
              onClick={() => selectedMember && toggleAccessMutation.mutate({ memberId: selectedMember.id, isActive: !selectedMember.isActive })}
              disabled={toggleAccessMutation.isPending}
              data-testid="button-confirm-access"
            >
              {toggleAccessMutation.isPending ? "Processing..." : selectedMember?.isActive ? "Revoke Access" : "Grant Access"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>{pendingAction?.label}</UniversalModalTitle>
            <UniversalModalDescription>
              {pendingAction?.requiresReason
                ? `Please provide a reason for this action on ${selectedOrg?.name}.`
                : `Are you sure you want to ${pendingAction?.action} ${selectedOrg?.name}?`
              }
            </UniversalModalDescription>
          </UniversalModalHeader>
          {pendingAction?.requiresReason && (
            <div className="py-2">
              <Label htmlFor="action-reason">Reason</Label>
              <Input
                id="action-reason"
                className="mt-2"
                placeholder="Enter reason..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                data-testid="input-action-reason"
              />
            </div>
          )}
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} data-testid="button-cancel-action">
              Cancel
            </Button>
            <Button
              onClick={confirmOrgAction}
              disabled={orgStatusMutation.isPending || (pendingAction?.requiresReason && !actionReason.trim())}
              data-testid="button-confirm-action"
            >
              {orgStatusMutation.isPending ? "Processing..." : "Confirm"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={supportActionDialogOpen} onOpenChange={setSupportActionDialogOpen}>
        <UniversalModalContent size="md">
          <UniversalModalHeader>
            <UniversalModalTitle>Reset Email</UniversalModalTitle>
            <UniversalModalDescription>
              Change email address for {supportAction.member?.firstName} {supportAction.member?.lastName}
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Email</Label>
              <Input value={supportAction.member?.email || ''} disabled data-testid="input-current-email" />
            </div>
            <div className="space-y-2">
              <Label>New Email</Label>
              <Input 
                value={newEmailInput} 
                onChange={(e) => setNewEmailInput(e.target.value)} 
                placeholder="Enter new email address"
                type="email"
                data-testid="input-new-email" 
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setSupportActionDialogOpen(false)} data-testid="button-cancel-email-reset">
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (supportAction.member && newEmailInput) {
                  supportActionMutation.mutate({ action: 'reset_email', member: supportAction.member, newEmail: newEmailInput });
                }
              }}
              disabled={!newEmailInput || supportActionMutation.isPending}
              data-testid="button-confirm-email-reset"
            >
              {supportActionMutation.isPending ? 'Updating...' : 'Update Email'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Refund Credits</UniversalModalTitle>
            <UniversalModalDescription>
              Refund AI credits to {selectedOrg?.name || 'this organization'}. Maximum 50,000 credits per transaction.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount (credits)</Label>
              <Input
                type="number"
                min="1"
                max="50000"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="Enter credit amount (1-50,000)"
                data-testid="input-refund-amount"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g., Automation failure, billing error"
                data-testid="input-refund-reason"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)} data-testid="button-cancel-refund">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedOrg && refundAmount && refundReason) {
                  refundCreditsMutation.mutate({
                    workspaceId: selectedOrg.id,
                    amount: parseInt(refundAmount, 10),
                    reason: refundReason,
                  });
                }
              }}
              disabled={!refundAmount || !refundReason || parseInt(refundAmount) < 1 || parseInt(refundAmount) > 50000 || refundCreditsMutation.isPending}
              data-testid="button-confirm-refund"
            >
              {refundCreditsMutation.isPending ? 'Processing...' : 'Refund Credits'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Issue Subscription Discount</UniversalModalTitle>
            <UniversalModalDescription>
              Apply a subscription discount to {selectedOrg?.name || 'this organization'}.
              {userPlatformLevel < 4 ? ' Discounts above 10% require manager approval.' : ''}
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Discount Percentage</Label>
              <Select value={discountPercent} onValueChange={setDiscountPercent}>
                <SelectTrigger data-testid="select-discount-percent">
                  <SelectValue placeholder="Select discount %" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                  {userPlatformLevel >= 4 && <SelectItem value="15">15% (Manager)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="e.g., Customer retention, service issue"
                data-testid="input-discount-reason"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setDiscountDialogOpen(false)} data-testid="button-cancel-discount">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedOrg && discountPercent && discountReason) {
                  issueDiscountMutation.mutate({
                    workspaceId: selectedOrg.id,
                    discountPercent: parseInt(discountPercent, 10),
                    reason: discountReason,
                  });
                }
              }}
              disabled={!discountPercent || !discountReason || issueDiscountMutation.isPending}
              data-testid="button-confirm-discount"
            >
              {issueDiscountMutation.isPending ? 'Processing...' : 'Issue Discount'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

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
    </CanvasHubPage>
  );
}
