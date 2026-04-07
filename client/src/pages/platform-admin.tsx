import { useState } from "react";
import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { 
  Activity, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Server, 
  Database,
  Cpu,
  HardDrive,
  AlertCircle,
  CheckCircle,
  Clock,
  Building,
  UserCog,
  Ticket,
  CreditCard,
  BarChart3,
  Settings,
  Shield,
  Bot,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { SupportTeamPanel } from "@/components/support/SupportTeamPanel";
import { RecycledCreditsPanel } from "@/components/support/RecycledCreditsPanel";
import { TrinityKnowledgePanel } from "@/components/support/TrinityKnowledgePanel";
import { FinancialHealthPanel } from "@/components/admin/FinancialHealthPanel";

interface PlatformStats {
  totalWorkspaces: number;
  totalUsers: number;
  activeSubscriptions: number;
  monthlyRevenue: string;
  platformFeeRevenue: string;
  totalTransactions: number;
  avgRevenuePerWorkspace: string;
  churnRate: number;
  
  systemHealth: {
    cpu: number;
    memory: number;
    database: string;
    uptime: number;
  };
  
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: Date;
    workspaceId?: string;
    workspaceName?: string;
  }>;
  
  supportMetrics: {
    openTickets: number;
    avgResponseTime: number;
    slaCompliance: number;
    customerSatisfaction: number;
  };
  
  topWorkspaces: Array<{
    id: string;
    name: string;
    tier: string;
    monthlyRevenue: string;
    employeeCount: number;
  }>;
}


// Platform Roles Manager Component
interface PlatformRoleAssignment {
  id: string;
  userId: string;
  role: string;
  grantedAt: string;
  grantedBy: string;
  grantedReason: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

const PLATFORM_ROLES = [
  { value: 'root_admin', label: 'Root Admin', description: 'Full platform control' },
  { value: 'deputy_admin', label: 'Deputy Admin', description: 'Platform administration' },
  { value: 'sysop', label: 'SysOp', description: 'System operations' },
  { value: 'support_manager', label: 'Support Manager', description: 'Support team lead' },
  { value: 'support_agent', label: 'Support Agent', description: 'Customer support' },
  { value: 'compliance_officer', label: 'Compliance Officer', description: 'Compliance monitoring' },
  { value: 'none', label: 'No Role', description: 'Remove platform access' },
];


// Multi-Org Onboarding Visibility Manager Component
interface OnboardingWorkspace {
  id: string;
  name: string;
  slug: string;
  tier: string;
  isActive: boolean;
  createdAt: string;
  employeeCount: number;
  activeEmployees: number;
  onboardingEmployees: number;
  invitations: {
    total: number;
    pending: number;
    accepted: number;
    expired: number;
    revoked: number;
  };
  onboardingStatus: 'not_started' | 'in_progress' | 'complete';
}

interface OnboardingStats {
  totalWorkspaces: number;
  activeWorkspaces: number;
  totalEmployees: number;
  totalOnboarding: number;
  totalPendingInvitations: number;
  totalAcceptedInvitations: number;
  totalExpiredInvitations: number;
}

function OnboardingVisibilityManager() {
  const { toast } = useToast();

  const { data: onboardingData, isLoading } = useQuery<{
    workspaces: OnboardingWorkspace[];
    stats: OnboardingStats;
  }>({
    queryKey: ['/api/admin/platform/onboarding'],
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="default" className="bg-emerald-500 dark:bg-emerald-600">Complete</Badge>;
      case 'in_progress':
        return <Badge variant="default" className="bg-amber-500 dark:bg-amber-600">In Progress</Badge>;
      case 'not_started':
        return <Badge variant="secondary">Not Started</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = onboardingData?.stats || {
    totalWorkspaces: 0,
    activeWorkspaces: 0,
    totalEmployees: 0,
    totalOnboarding: 0,
    totalPendingInvitations: 0,
    totalAcceptedInvitations: 0,
    totalExpiredInvitations: 0,
  };

  const workspaces = onboardingData?.workspaces || [];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalWorkspaces}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeWorkspaces} active
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalOnboarding} onboarding
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPendingInvitations}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalAcceptedInvitations} accepted
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Expired Invites</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalExpiredInvitations}</div>
            <p className="text-xs text-muted-foreground">
              may need attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workspaces Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Organization Onboarding Status
          </CardTitle>
          <CardDescription>
            View onboarding progress across all organizations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center justify-between gap-2 p-4 border rounded-lg"
                  data-testid={`row-workspace-${workspace.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{workspace.name}</span>
                      {getStatusBadge(workspace.onboardingStatus)}
                      <Badge variant="outline">{workspace.tier}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {workspace.employeeCount} employees
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {workspace.activeEmployees} active
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {workspace.invitations.pending} pending invites
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground">
                      Invitations: {workspace.invitations.accepted}/{workspace.invitations.total}
                    </div>
                    {workspace.invitations.expired > 0 && (
                      <div className="text-amber-600 dark:text-amber-400 flex items-center gap-1 justify-end">
                        <AlertCircle className="h-3 w-3" />
                        {workspace.invitations.expired} expired
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {workspaces.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No organizations found
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function PlatformRolesManager() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<PlatformRoleAssignment | null>(null);
  const [newRole, setNewRole] = useState('');
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');

  const { data: roleAssignments, isLoading, refetch } = useQuery<PlatformRoleAssignment[]>({
    queryKey: ['/api/admin/platform/roles'],
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await apiRequest('POST', '/api/admin/platform/roles', { userId, role });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Role Updated',
        description: 'Platform role has been updated successfully',
      });
      refetch();
      setSelectedUser(null);
      setShowAssignDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update role',
        variant: 'destructive',
      });
    },
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'root_admin':
        return 'destructive';
      case 'deputy_admin':
        return 'default';
      case 'sysop':
        return 'secondary';
      case 'support_manager':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const handleRoleChange = (userId: string, role: string) => {
    assignRoleMutation.mutate({ userId, role });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search by email..."
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            className="pr-8"
            data-testid="input-search-roles"
          />
        </div>
        <Badge variant="outline" data-testid="badge-role-count">
          {roleAssignments?.length || 0} assignments
        </Badge>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {roleAssignments
            ?.filter((r) => 
              !searchEmail || 
              r.userEmail?.toLowerCase().includes(searchEmail.toLowerCase())
            )
            .map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-2 p-3 rounded-lg border hover-elevate"
                data-testid={`role-row-${assignment.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCog className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {assignment.userFirstName} {assignment.userLastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {assignment.userEmail}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={getRoleBadgeVariant(assignment.role) as any}>
                    {assignment.role.replace('_', ' ')}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedUser(assignment);
                      setNewRole(assignment.role);
                      setShowAssignDialog(true);
                    }}
                    data-testid={`button-edit-role-${assignment.id}`}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            ))}

          {(!roleAssignments || roleAssignments.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Platform Roles Assigned</p>
              <p className="text-sm">Platform roles grant administrative access</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Edit Role Dialog */}
      <UniversalModal open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <UniversalModalContent size="sm">
          <UniversalModalHeader>
            <UniversalModalTitle>Change Platform Role</UniversalModalTitle>
            <UniversalModalDescription>
              Update the platform role for {selectedUser?.userEmail}
            </UniversalModalDescription>
          </UniversalModalHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Role</Label>
              <div className="grid grid-cols-1 gap-2">
                {PLATFORM_ROLES.map((role) => (
                  <div
                    key={role.value}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      newRole === role.value
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setNewRole(role.value)}
                    data-testid={`role-option-${role.value}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{role.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {role.description}
                        </p>
                      </div>
                      {newRole === role.value && (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <UniversalModalFooter>
            <Button
              variant="outline"
              onClick={() => setShowAssignDialog(false)}
              data-testid="button-cancel-role-change"
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedUser && handleRoleChange(selectedUser.userId, newRole)}
              disabled={assignRoleMutation.isPending}
              data-testid="button-save-role-change"
            >
              {assignRoleMutation.isPending ? 'Saving...' : 'Update Role'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </div>
  );
}

interface SupportSession {
  id: string;
  staffUserId: string;
  staffEmail?: string;
  staffName?: string;
  targetOrgId: string;
  targetOrgName?: string;
  startedAt: string;
  endedAt?: string;
  reason: string;
  status: 'active' | 'ended';
  orgFrozen: boolean;
  actionsCount: number;
}

interface SupportAuditLog {
  id: string;
  sessionId: string;
  action: string;
  severity: 'read' | 'write' | 'delete';
  details: any;
  createdAt: string;
}

function SupportSessionsManager() {
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<SupportSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [newSessionReason, setNewSessionReason] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const { data: activeSessions, isLoading: loadingSessions, refetch: refetchSessions } = useQuery<SupportSession[]>({
    queryKey: ['/api/admin/support/sessions'],
  });

  const { data: workspaces } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/admin/platform/workspaces'],
  });

  const { data: auditLogsData, isLoading: loadingAudit } = useQuery<{ logs: SupportAuditLog[] }>({
    queryKey: ['/api/admin/support/audit-logs', { sessionId: selectedSession?.id }],
    enabled: !!selectedSession && showAuditDialog,
  });
  const auditLogs = auditLogsData?.logs;

  const startSessionMutation = useMutation({
    mutationFn: async ({ orgId, reason }: { orgId: string; reason: string }) => {
      const response = await apiRequest('POST', '/api/admin/support/sessions/start', { orgId, reason });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Session Started', description: 'Cross-org support session is now active' });
      refetchSessions();
      setShowStartDialog(false);
      setNewSessionReason('');
      setSelectedOrgId('');
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('POST', '/api/admin/support/sessions/end', { sessionId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Session Ended', description: 'Support session has been closed' });
      refetchSessions();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const freezeOrgMutation = useMutation({
    mutationFn: async ({ sessionId, freeze }: { sessionId: string; freeze: boolean }) => {
      const response = await apiRequest('POST', '/api/admin/support/sessions/freeze', { sessionId, freeze });
      return response.json();
    },
    onSuccess: (_, { freeze }) => {
      toast({
        title: freeze ? 'Organization Frozen' : 'Organization Unfrozen',
        description: freeze ? 'Regular users are now blocked' : 'Regular users can access again',
      });
      refetchSessions();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'delete':
        return <Badge variant="destructive">Delete</Badge>;
      case 'write':
        return <Badge variant="default" className="bg-amber-500">Write</Badge>;
      case 'read':
        return <Badge variant="secondary">Read</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  if (loadingSessions) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const activeSess = activeSessions?.filter(s => s.status === 'active') || [];
  const endedSess = activeSessions?.filter(s => s.status === 'ended') || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Cross-Org Support Sessions</h3>
          <p className="text-sm text-muted-foreground">Manage platform staff access to organization data</p>
        </div>
        <Button
          onClick={() => setShowStartDialog(true)}
          data-testid="button-start-session"
          className="w-full sm:w-auto"
        >
          <UserCog className="h-4 w-4 mr-2" />
          Start Session
        </Button>
      </div>

      {activeSess.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeSess.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3"
                  data-testid={`session-row-${session.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{session.staffName || session.staffEmail}</span>
                      <Badge variant="default" className="bg-emerald-500 shrink-0">Active</Badge>
                      {session.orgFrozen && (
                        <Badge variant="destructive" className="shrink-0">Org Frozen</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">{session.targetOrgName}</span> - {session.reason}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Started {formatDistanceToNow(new Date(session.startedAt))} ago
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSession(session);
                        setShowAuditDialog(true);
                      }}
                      data-testid={`button-audit-${session.id}`}
                    >
                      Audit Log
                    </Button>
                    <Button
                      size="sm"
                      variant={session.orgFrozen ? "secondary" : "outline"}
                      onClick={() => freezeOrgMutation.mutate({ sessionId: session.id, freeze: !session.orgFrozen })}
                      disabled={freezeOrgMutation.isPending}
                      data-testid={`button-freeze-${session.id}`}
                    >
                      {session.orgFrozen ? 'Unfreeze' : 'Freeze Org'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => endSessionMutation.mutate(session.id)}
                      disabled={endSessionMutation.isPending}
                      data-testid={`button-end-${session.id}`}
                    >
                      End Session
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeSess.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Active Sessions</p>
              <p className="text-sm">Start a session to access another organization's data</p>
            </div>
          </CardContent>
        </Card>
      )}

      {endedSess.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {endedSess.slice(0, 10).map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded border text-sm gap-2"
                    data-testid={`ended-session-${session.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate">{session.staffName || session.staffEmail}</span>
                      <span className="text-muted-foreground"> accessed </span>
                      <span className="font-medium">{session.targetOrgName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                      <span>{session.actionsCount} actions</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedSession(session);
                          setShowAuditDialog(true);
                        }}
                        data-testid={`button-view-audit-${session.id}`}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <UniversalModal open={showStartDialog} onOpenChange={setShowStartDialog}>
        <UniversalModalContent size="md">
          <UniversalModalHeader>
            <UniversalModalTitle>Start Support Session</UniversalModalTitle>
            <UniversalModalDescription>
              Create an audited session to access another organization's data
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Organization</Label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full p-2 border rounded-md bg-background"
                data-testid="select-org"
              >
                <option value="">Select organization...</option>
                {workspaces?.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Reason for Access</Label>
              <Input
                placeholder="Support ticket #12345, user request, etc."
                value={newSessionReason}
                onChange={(e) => setNewSessionReason(e.target.value)}
                data-testid="input-reason"
              />
            </div>
          </div>
          <UniversalModalFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowStartDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={() => startSessionMutation.mutate({ orgId: selectedOrgId, reason: newSessionReason })}
              disabled={!selectedOrgId || !newSessionReason || startSessionMutation.isPending}
              data-testid="button-confirm-start"
              className="w-full sm:w-auto"
            >
              {startSessionMutation.isPending ? 'Starting...' : 'Start Session'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <UniversalModalContent size="xl" className="max-h-[80vh]">
          <UniversalModalHeader>
            <UniversalModalTitle>Session Audit Log</UniversalModalTitle>
            <UniversalModalDescription>
              All actions performed during this support session
            </UniversalModalDescription>
          </UniversalModalHeader>
          <ScrollArea className="max-h-[50vh]">
            {loadingAudit ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : auditLogs && auditLogs.length > 0 ? (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 border rounded-lg text-sm" data-testid={`audit-log-${log.id}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {getSeverityBadge(log.severity)}
                      <span className="font-medium">{log.action}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(log.createdAt))} ago
                      </span>
                    </div>
                    {log.details && (
                      <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No actions recorded for this session
              </div>
            )}
          </ScrollArea>
        </UniversalModalContent>
      </UniversalModal>
    </div>
  );
}

export default function PlatformAdmin() {
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();
  
  // Platform settings state
  const [platformSettings, setPlatformSettings] = useState({
    platformName: "CoAIleague™",
    maintenanceMode: false,
    newWorkspaceRegistration: true,
    emailNotifications: true,
    supportEmail: "support@coaileague.com",
    enforceSSO: false,
    requireMFA: false,
    passwordExpiry: 90,
    sessionTimeout: 30
  });
  const [showSupportQueue, setShowSupportQueue] = useState(false);
  
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });
  
  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: typeof platformSettings) => {
      const response = await secureFetch("/api/platform/settings", {
        method: "POST",
        body: JSON.stringify(settings),
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) throw new Error("Failed to save settings");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Platform settings have been updated successfully"
      });
      setShowSettings(false);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save platform settings",
        variant: "destructive"
      });
    }
  });
  
  const handleSaveSettings = () => {
    saveSettingsMutation.mutate(platformSettings);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const healthColor = (value: number) => {
    if (value >= 90) return "text-blue-600 dark:text-blue-400";
    if (value >= 70) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const pageConfig: CanvasPageConfig = {
    id: 'platform-admin',
    title: 'Platform Admin',
    subtitle: 'Manage your entire Elite SaaS platform from one dashboard',
    category: 'admin',
    headerActions: (
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setShowSettings(true)} data-testid="button-platform-settings">
          <Settings className="mr-2 h-4 w-4" />
          Platform Settings
        </Button>
        <Button onClick={() => setShowSupportQueue(true)} data-testid="button-support-queue">
          <Ticket className="mr-2 h-4 w-4" />
          Support Queue
        </Button>
      </div>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-workspaces">
              {stats?.totalWorkspaces || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeSubscriptions || 0} active subscriptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">
              {stats?.totalUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all workspaces
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monthly-revenue">
              ${stats?.monthlyRevenue || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              ${stats?.platformFeeRevenue || "0"} platform fees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue/Workspace</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-revenue">
              ${stats?.avgRevenuePerWorkspace || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.churnRate || 0}% churn rate
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">System Health</TabsTrigger>
          <TabsTrigger value="support" data-testid="tab-support">Support Metrics</TabsTrigger>
          <TabsTrigger value="sessions" data-testid="tab-sessions">Support Sessions</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team" className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="credits" data-testid="tab-credits">Credits</TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
          <TabsTrigger value="financial" data-testid="tab-financial">Financial Health</TabsTrigger>
          <TabsTrigger value="roles" data-testid="tab-roles">User Roles</TabsTrigger>
          <TabsTrigger value="onboarding" data-testid="tab-onboarding">Onboarding</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Platform-wide events and transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats?.recentActivity?.slice(0, 5).map((activity, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.workspaceName} • {formatDistanceToNow(new Date(activity.timestamp))} ago
                        </p>
                      </div>
                      <Badge variant="outline">{activity.type}</Badge>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Workspaces */}
            <Card>
              <CardHeader>
                <CardTitle>Top Revenue Workspaces</CardTitle>
                <CardDescription>Highest earning customers this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats?.topWorkspaces?.map((workspace, idx) => (
                    <div key={workspace.id} className="flex items-center gap-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        {idx + 1}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">{workspace.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {workspace.employeeCount} employees • {workspace.tier}
                        </p>
                      </div>
                      <div className="text-sm font-medium">${workspace.monthlyRevenue}</div>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No workspace data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* System Health Tab */}
        <TabsContent value="health" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${healthColor(100 - (stats?.systemHealth?.cpu || 0))}`}>
                  {stats?.systemHealth?.cpu || 0}%
                </div>
                <Progress value={stats?.systemHealth?.cpu || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${healthColor(100 - (stats?.systemHealth?.memory || 0))}`}>
                  {stats?.systemHealth?.memory || 0}%
                </div>
                <Progress value={stats?.systemHealth?.memory || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Database</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {stats?.systemHealth?.database === "healthy" ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium">Healthy</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <span className="text-sm font-medium">Issues Detected</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.floor((stats?.systemHealth?.uptime || 0) / 3600)}h
                </div>
                <p className="text-xs text-muted-foreground">99.9% availability</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Support Metrics Tab */}
        <TabsContent value="support" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
                <Ticket className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.openTickets || 0}</div>
                <Button variant="ghost" className="h-auto p-0 text-xs">View Queue →</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.avgResponseTime || 0}h</div>
                <p className="text-xs text-muted-foreground">Target: &lt;4h</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.slaCompliance || 0}%</div>
                <Progress value={stats?.supportMetrics?.slaCompliance || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CSAT Score</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.supportMetrics?.customerSatisfaction || 0}%</div>
                <p className="text-xs text-muted-foreground">Customer satisfaction</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Platform Fees (MRR)</CardTitle>
                <CardDescription>Monthly recurring platform revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${stats?.platformFeeRevenue || "0"}</div>
                <p className="text-xs text-muted-foreground mt-2">
                  From {stats?.totalTransactions || 0} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscription Revenue</CardTitle>
                <CardDescription>Monthly subscription fees</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${stats?.monthlyRevenue || "0"}</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {stats?.activeSubscriptions || 0} active subscriptions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total MRR</CardTitle>
                <CardDescription>Combined monthly recurring revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${(parseFloat(stats?.platformFeeRevenue || "0") + parseFloat(stats?.monthlyRevenue || "0")).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  90%+ profit margin
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Financial Health Tab */}
        <TabsContent value="financial" className="space-y-4">
          <FinancialHealthPanel />
        </TabsContent>

        {/* User Roles Tab */}
        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Platform Role Assignments
              </CardTitle>
              <CardDescription>
                Manage platform-level access roles for users across all organizations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlatformRolesManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding" className="space-y-4">
          <OnboardingVisibilityManager />
        </TabsContent>

        {/* Support Sessions Tab */}
        <TabsContent value="sessions" className="space-y-4">
          <SupportSessionsManager />
        </TabsContent>

        {/* Support Team Tab */}
        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <SupportTeamPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <TrinityKnowledgePanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <RecycledCreditsPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Platform Settings Dialog */}
      <UniversalModal open={showSettings} onOpenChange={setShowSettings}>
        <UniversalModalContent size="xl" className="max-h-[85vh]">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Platform Settings
            </UniversalModalTitle>
            <UniversalModalDescription>
              Configure platform-wide settings and preferences
            </UniversalModalDescription>
          </UniversalModalHeader>
          
          <ScrollArea className="max-h-[calc(85vh-180px)] pr-4">
            <div className="space-y-6 py-4">
              {/* General Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">General</h3>
                <div className="space-y-2">
                  <Label>Platform Name</Label>
                  <Input 
                    value={platformSettings.platformName}
                    onChange={(e) => setPlatformSettings({...platformSettings, platformName: e.target.value})}
                    data-testid="input-platform-name" 
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground">Temporarily disable platform access</p>
                  </div>
                  <Switch 
                    checked={platformSettings.maintenanceMode}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, maintenanceMode: checked})}
                    data-testid="switch-maintenance-mode" 
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>New Workspace Registration</Label>
                    <p className="text-sm text-muted-foreground">Allow new workspaces to register</p>
                  </div>
                  <Switch 
                    checked={platformSettings.newWorkspaceRegistration}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, newWorkspaceRegistration: checked})}
                    data-testid="switch-new-registration" 
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Send platform-wide email alerts</p>
                  </div>
                  <Switch 
                    checked={platformSettings.emailNotifications}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, emailNotifications: checked})}
                    data-testid="switch-email-notifications" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Support Email</Label>
                  <Input 
                    type="email" 
                    value={platformSettings.supportEmail}
                    onChange={(e) => setPlatformSettings({...platformSettings, supportEmail: e.target.value})}
                    data-testid="input-support-email" 
                  />
                </div>
              </div>

              {/* Security Settings */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-semibold">Security</h3>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Enforce SSO</Label>
                    <p className="text-sm text-muted-foreground">Require single sign-on for all workspaces</p>
                  </div>
                  <Switch 
                    checked={platformSettings.enforceSSO}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, enforceSSO: checked})}
                    data-testid="switch-enforce-sso" 
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Require MFA</Label>
                    <p className="text-sm text-muted-foreground">Mandatory multi-factor authentication</p>
                  </div>
                  <Switch 
                    checked={platformSettings.requireMFA}
                    onCheckedChange={(checked) => setPlatformSettings({...platformSettings, requireMFA: checked})}
                    data-testid="switch-require-mfa" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password Expiry (days)</Label>
                  <Input 
                    type="number" 
                    value={platformSettings.passwordExpiry}
                    onChange={(e) => setPlatformSettings({...platformSettings, passwordExpiry: parseInt(e.target.value) || 90})}
                    data-testid="input-password-expiry" 
                  />
                  <p className="text-xs text-muted-foreground">Force password change after this many days</p>
                </div>
                <div className="space-y-2">
                  <Label>Session Timeout (minutes)</Label>
                  <Input 
                    type="number" 
                    value={platformSettings.sessionTimeout}
                    onChange={(e) => setPlatformSettings({...platformSettings, sessionTimeout: parseInt(e.target.value) || 30})}
                    data-testid="input-session-timeout" 
                  />
                  <p className="text-xs text-muted-foreground">Auto-logout after inactivity</p>
                </div>
              </div>
            </div>
          </ScrollArea>

          <UniversalModalFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowSettings(false)}
              data-testid="button-cancel-settings"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveSettings}
              disabled={saveSettingsMutation.isPending}
              data-testid="button-save-settings"
            >
              {saveSettingsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      {/* Support Queue Dialog */}
      <UniversalModal open={showSupportQueue} onOpenChange={setShowSupportQueue}>
        <UniversalModalContent size="full" className="max-h-[80vh]">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Support Queue
            </UniversalModalTitle>
            <UniversalModalDescription>
              View and manage pending support requests
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="py-4">
            <div className="text-center py-8 text-muted-foreground">
              <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Pending Requests</p>
              <p className="text-sm">All support tickets have been addressed</p>
            </div>
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
