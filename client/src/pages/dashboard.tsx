import { useEffect, useState, Suspense, lazy } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies, type ModuleRoute } from "@/lib/sidebarModules";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HideInSimpleMode } from "@/components/SimpleMode";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { 
  Users, Activity, DollarSign, 
  FileText, Calendar, Clock, ArrowRight,
  Bell, CheckCircle, XCircle, AlertCircle, Mail, Lock,
  Shield, UserCog, Server, Database, MessageCircle, Settings,
  HelpCircle, MessageSquare, LayoutDashboard, AlertTriangle, Building2,
  Headphones, Send, Loader2, RotateCcw,
  Receipt, Wallet, CalendarOff, Briefcase
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
const TrinityRedesign = lazy(() => import("@/components/trinity-redesign"));
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResponsiveSection } from "@/components/dashboard-shell";
import { useToast } from "@/hooks/use-toast";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { useIdentity } from "@/hooks/useIdentity";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter } from "@/components/ui/universal-modal";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { MetricTile } from "@/components/metric-tile";
import { CreditBalanceCard } from "@/components/credit-balance";
import { PendingApprovalsBanner } from "@/components/pending-approvals-notice";
import { SupervisoryDisclaimer } from "@/components/liability-disclaimers";
import { getMobileRole, hasManagerAccess } from "@/config/mobileConfig";
import { ClipboardList, CheckCircle2, Plus } from "lucide-react";
import { StateLicenseBadge } from "@/components/state-license-badge";
import { PageSectionBoundary } from "@/components/page-section-boundary";
import { PaydayWidget } from "@/components/payday-widget";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileSignature, LockKeyhole, GraduationCap, FileBox } from "lucide-react";
import { TrinityInsightBar } from "@/components/trinity/TrinityInsightBar";

function SpsDocumentActivityWidget() {
  const [, setLocation] = useLocation();
  const { data: documents, isLoading } = useQuery<any[]>({
    queryKey: ['/api/sps/documents'],
  });

  if (isLoading) {
    return (
      <Card className="hover-elevate">
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingSignatures = (documents ?? []).filter(d => 
    ['sent', 'viewed', 'partially_signed'].includes(d.status)
  ).length || 0;

  const completedLast30Days = (documents ?? []).filter(d => {
    if (d.status !== 'completed' || !d.completedAt) return false;
    const completedDate = new Date(d.completedAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return completedDate > thirtyDaysAgo;
  }).length || 0;

  return (
    <Card className="hover-elevate overflow-visible" data-testid="card-document-activity">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileSignature className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg leading-none">Document Activity</h3>
              <p className="text-sm text-muted-foreground mt-1">Employee packets and client contracts</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-center px-4 py-2 bg-muted/50 rounded-lg min-w-[100px]" data-testid="stat-pending-signatures">
              <span className="text-2xl font-bold text-primary">{pendingSignatures}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Pending</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2 bg-muted/50 rounded-lg min-w-[100px]" data-testid="stat-completed-documents">
              <span className="text-2xl font-bold text-success">{completedLast30Days}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Completed</span>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLocation('/employee-packets')}
                className="gap-1.5"
                data-testid="button-new-packet"
              >
                <Plus className="w-4 h-4" />
                New Packet
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLocation('/sps-document-safe')}
                className="gap-1.5"
                data-testid="button-document-safe"
              >
                <LockKeyhole className="w-4 h-4" />
                Document Safe
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface WorkspaceHealth {
  status: 'green' | 'yellow' | 'red';
  message: string;
  billing: { status: string; active: boolean };
  integrations: { quickbooks: string; quickbooksRealmId: string | null; gusto: string };
  automations: { invoicing: boolean; payroll: boolean; scheduling: boolean };
  safeToRun: boolean;
}

interface ComplianceData {
  hasData: boolean;
  lastScan: string | null;
  issues: any[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// Compliance Alerts Component
function ComplianceAlerts() {
  const [, setLocation] = useLocation();
  const { data: compliance, isLoading } = useQuery<ComplianceData>({
    queryKey: ['/api/automation/compliance/recent'],
  });

  if (isLoading) {
    return (
      <ResponsiveSection>
        <div className="rounded-md p-4 border bg-card animate-pulse" data-testid="skeleton-compliance-alerts">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-md bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-40" />
              <div className="h-3 bg-muted rounded w-64" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted rounded-md" />)}
          </div>
        </div>
      </ResponsiveSection>
    );
  }

  if (!compliance?.hasData || compliance.summary.total === 0) {
    return null;
  }

  const hasCritical = compliance.summary.critical > 0;
  const hasHigh = compliance.summary.high > 0;

  return (
    <ResponsiveSection>
      <div 
        className={`rounded-md p-4 md:p-5 mobile-compact-p border shadow-sm ${
          hasCritical 
            ? 'bg-destructive/5 dark:bg-destructive/10 border-destructive/40' 
            : hasHigh 
            ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-400/50' 
            : 'bg-yellow-50/80 dark:bg-yellow-950/20 border-yellow-400/50'
        }`}
        data-testid="card-compliance-alerts"
      >
        <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-md ${
              hasCritical 
                ? 'bg-destructive/10' 
                : hasHigh 
                ? 'bg-amber-100 dark:bg-amber-900/40' 
                : 'bg-yellow-100 dark:bg-yellow-900/40'
            }`}>
              <Shield className={`w-5 h-5 ${
                hasCritical 
                  ? 'text-destructive' 
                  : hasHigh 
                  ? 'text-amber-600 dark:text-amber-400' 
                  : 'text-yellow-600 dark:text-yellow-400'
              }`} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Compliance Alerts
              </h3>
              <p className="text-sm text-muted-foreground">
                Trinity detected {compliance.summary.total} issue{compliance.summary.total === 1 ? '' : 's'} requiring attention
              </p>
            </div>
          </div>
          <Button 
            onClick={() => setLocation('/automation-control')}
            variant="outline"
            size="sm"
            data-testid="button-view-compliance"
          >
            View Details
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mobile-grid-4 mobile-compact-gap-sm">
          {compliance.summary.critical > 0 && (
            <div className="bg-card rounded-md p-3 mobile-card-tight border border-destructive/30" data-testid="card-critical-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs font-semibold text-destructive">CRITICAL</span>
              </div>
              <p className="text-xl font-bold text-destructive">{compliance.summary.critical}</p>
              <p className="text-xs text-muted-foreground mt-1">Immediate action required</p>
            </div>
          )}
          {compliance.summary.high > 0 && (
            <div className="bg-card rounded-md p-3 mobile-card-tight border border-amber-400/30" data-testid="card-high-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">HIGH</span>
              </div>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{compliance.summary.high}</p>
              <p className="text-xs text-muted-foreground mt-1">Requires prompt attention</p>
            </div>
          )}
          {compliance.summary.medium > 0 && (
            <div className="bg-card rounded-md p-3 mobile-card-tight border border-yellow-400/30" data-testid="card-medium-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">MEDIUM</span>
              </div>
              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{compliance.summary.medium}</p>
              <p className="text-xs text-muted-foreground mt-1">Review when possible</p>
            </div>
          )}
          {compliance.summary.low > 0 && (
            <div className="bg-card rounded-md p-3 mobile-card-tight border border-border" data-testid="card-low-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">LOW</span>
              </div>
              <p className="text-xl font-bold text-muted-foreground">{compliance.summary.low}</p>
              <p className="text-xs text-muted-foreground mt-1">Monitor</p>
            </div>
          )}
        </div>

        {compliance.lastScan && (
          <p className="text-xs text-muted-foreground mt-4">
            Last scan: {formatDistanceToNow(new Date(compliance.lastScan), { addSuffix: true })}
          </p>
        )}
      </div>
    </ResponsiveSection>
  );
}

interface HelpDeskTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userInfo: {
    userId?: string;
    workspaceId?: string;
    workspaceName?: string;
    userName?: string;
    email?: string;
    quickbooksId?: string | null;
  };
}

function HelpDeskTicketModal({ open, onOpenChange, userInfo }: HelpDeskTicketModalProps) {
  const [, setLocation] = useLocation();
  const [issueDescription, setIssueDescription] = useState('');
  const { toast } = useToast();
  
  const createTicketMutation = useMutation({
    mutationFn: async (data: { 
      guestName: string;
      guestEmail?: string;
      workspaceId?: string;
      issueDescription: string;
      quickbooksId?: string | null;
    }) => {
      const res = await apiRequest('POST', '/api/support/chat/session', {
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        workspaceId: data.workspaceId,
        userAgent: navigator.userAgent,
        url: window.location.href,
        issueDescription: data.issueDescription,
        quickbooksId: data.quickbooksId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.session?.id) {
        onOpenChange(false);
        setIssueDescription('');
        setLocation(`/chatrooms/${data.session.id}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Create Ticket Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!issueDescription.trim()) return;
    
    createTicketMutation.mutate({
      guestName: userInfo.userName || 'User',
      guestEmail: userInfo.email,
      workspaceId: userInfo.workspaceId,
      issueDescription: issueDescription.trim(),
      quickbooksId: userInfo.quickbooksId,
    });
  };

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange} size="md">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-primary" />
            Contact HelpDesk
          </UniversalModalTitle>
          <UniversalModalDescription>
            Tell us what you need help with. Our AI assistant or a support agent will assist you.
          </UniversalModalDescription>
        </UniversalModalHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">User</Label>
              <p className="text-sm font-medium truncate text-muted-foreground" data-testid="text-ticket-user">
                {userInfo.userName || 'Unknown'}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">Workspace</Label>
              <p className="text-sm font-medium truncate text-muted-foreground" data-testid="text-ticket-workspace">
                {userInfo.workspaceName || 'N/A'}
              </p>
            </div>
            {userInfo.userId && (
              <div className="bg-muted/50 rounded-lg p-3">
                <Label className="text-xs text-muted-foreground">User ID</Label>
                <p className="font-mono text-xs truncate" data-testid="text-ticket-user-id">
                  {userInfo.userId}
                </p>
              </div>
            )}
            {userInfo.quickbooksId && (
              <div className="bg-muted/50 rounded-lg p-3">
                <Label className="text-xs text-muted-foreground">QuickBooks ID</Label>
                <p className="font-mono text-xs truncate" data-testid="text-ticket-qb-id">
                  {userInfo.quickbooksId}
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="issue">What do you need help with?</Label>
            <Textarea
              id="issue"
              placeholder="Describe your issue or question..."
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              className="min-h-[100px] resize-none"
              data-testid="input-issue-description"
            />
          </div>
        </div>
        
        <UniversalModalFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-ticket"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!issueDescription.trim() || createTicketMutation.isPending}
            data-testid="button-submit-ticket"
          >
            {createTicketMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Start Chat
              </>
            )}
          </Button>
        </UniversalModalFooter>
    </UniversalModal>
  );
}

const dashboardPageConfig: CanvasPageConfig = {
  id: 'dashboard',
  title: 'Dashboard',
  category: 'dashboard',
  variant: 'standard',
  showHeader: false,
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, platformRole, isLoading: accessLoading, positionCapabilities } = useWorkspaceAccess();
  // Mobile detection for responsive UI
  const isMobile = useIsMobile();
  
  // HelpDesk ticket modal state
  const [helpDeskModalOpen, setHelpDeskModalOpen] = useState(false);

  // Get current user and workspace
  const { data: workspace, error: workspaceError } = useQuery<{ id: string; name?: string; orgCode?: string }>({ 
    queryKey: ['/api/workspace/current'],
    enabled: isAuthenticated,
  });
  const orgCode = workspace?.orgCode || 'N/A';

  // Fetch subscription details for plan/trial badge
  const { data: subscriptionData } = useQuery<{
    tier: string;
    status: string;
    trialEndsAt: string | null;
    trialStartedAt: string | null;
    currentPeriodEnd: string | null;
  }>({
    queryKey: ['/api/billing/subscription'],
    enabled: isAuthenticated && !!user?.currentWorkspaceId,
  });

  // Fetch workspace health status (only when user has a workspace selected)
  const { data: workspaceHealth, error: healthError } = useQuery<WorkspaceHealth>({
    queryKey: ['/api/workspace/health'],
    enabled: isAuthenticated && !!user?.currentWorkspaceId,
  });

  // Fetch workspace stats with typed response
  const { data: stats, error: statsError, refetch: refetchStats } = useQuery<{
    summary: {
      totalWorkspaces: number;
      totalCustomers: number;
      activeEmployees: number;
      monthlyRevenue: { amount: number; currency: string; previousMonth: number; delta: number };
      activeSubscriptions: number;
    };
    workspace?: {
      id: string;
      name: string;
      tier: string;
      activeEmployees: number;
      activeClients: number;
      upcomingShifts: number;
    };
    support: {
      openTickets: number;
      unresolvedEscalations: number;
      avgFirstResponseHours: number;
      liveChats: { active: number; staffOnline: number };
    };
    system: {
      cpu: number;
      memory: number;
      database: { status: string };
      uptimeSeconds: number;
      updatedAt: string;
    };
    automation?: {
      hoursSavedThisMonth: number;
      hoursSavedAllTime: number;
      costAvoidanceMonthly: number;
      costAvoidanceTotal: number;
      aiSuccessRate: number;
      avgConfidenceScore: number;
      autoApprovalRate: number;
      breakdown: {
        scheduleOS: { shiftsGenerated: number; hoursSaved: number; successRate: number };
        billOS: { invoicesGenerated: number; hoursSaved: number; successRate: number };
        payrollOS: { payrollsProcessed: number; hoursSaved: number; successRate: number };
      };
      trend: { percentChange: number; isImproving: boolean };
    };
  }>({
    queryKey: ['/api/analytics/stats'],
    enabled: isAuthenticated,
  });

  // Fetch employees to determine user's workspace role
  const { data: allEmployees = [], error: employeesError } = useQuery<{ data: any[] }, Error, any[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
    enabled: isAuthenticated,
  });

  // Fetch clock-in status for greeting banner
  const { data: clockStatus } = useQuery<{ isClockedIn: boolean; activeTimeEntry?: any }>({
    queryKey: ['/api/time-entries/status'],
    enabled: isAuthenticated,
    // Cache invalidated by WebSocket push — no polling needed
  });

  // Determine current user's workspace role (fallback if hook not loaded)
  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const fallbackRole = currentEmployee?.workspaceRole || 'staff';

  // Earnings from dedicated server-side endpoint (biweekly period, correct employee lookup)
  const { data: workerEarnings, isLoading: isLoadingEntries } = useQuery<{
    payPeriodStart: string | null;
    payPeriodEnd: string | null;
    hoursWorked: number;
    scheduledHours: number;
    hourlyRate: number;
    earnings: number;
    projectedEarnings: number;
  }>({
    queryKey: ['/api/dashboard/worker-earnings'],
    enabled: isAuthenticated,
    staleTime: 60000,
  });
  
  // Use fallback employee-derived role while workspace access is loading
  const effectiveRole = accessLoading ? fallbackRole : workspaceRole;
  const effectiveTier = accessLoading ? 'free' : subscriptionTier;
  const effectivePlatformStaff = accessLoading ? false : isPlatformStaff;
  
  // Get role-specific accessible routes for quick actions
  const families = selectSidebarFamilies(effectiveRole, effectiveTier, effectivePlatformStaff, positionCapabilities);
  
  // Extract top accessible routes for quick actions (excluding dashboard itself)
  const accessibleRoutes: ModuleRoute[] = [];
  const lockedRoutes: ModuleRoute[] = [];
  
  families.forEach(family => {
    family.routes.forEach(route => {
      if (route.href !== '/dashboard') {
        accessibleRoutes.push(route);
      }
    });
    family.locked.forEach(route => {
      if (route.href !== '/dashboard') {
        lockedRoutes.push(route);
      }
    });
  });
  
  // Prioritize operations family routes for quick actions
  const quickActions = [
    ...accessibleRoutes.filter(r => r.familyId === 'operations').slice(0, 4),
    ...accessibleRoutes.filter(r => r.familyId !== 'operations').slice(0, 2),
  ].slice(0, 6);
  
  // Show top 2 locked routes as upgrade prompts
  const upgradePrompts = lockedRoutes.slice(0, 2);


  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
    // Redirect users without a workspace to onboarding choice page
    if (!isLoading && isAuthenticated && user && !user.currentWorkspaceId) {
      setLocation('/onboarding/start');
    }
  }, [isAuthenticated, isLoading, user, setLocation]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Suspense fallback={<div className="w-20 h-20" />}>
          <TrinityRedesign size={80} mode="THINKING" />
        </Suspense>
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  
  // Use workspace-scoped stats when available, fall back to summary stats
  // Summary stats are already workspace-scoped on the backend when a workspaceId is provided
  const isStaffViewer = isPlatformStaff && !stats?.workspace;
  const totalEmployees = stats?.workspace?.activeEmployees 
    ?? stats?.summary?.activeEmployees 
    ?? 0;
  const totalClients = stats?.workspace?.activeClients 
    ?? stats?.summary?.totalCustomers 
    ?? 0;
  const totalRevenue = stats?.summary?.monthlyRevenue?.amount || 0;
  const revenueSparkline: number[] | undefined = (() => {
    const prev = stats?.summary?.monthlyRevenue?.previousMonth;
    const curr = stats?.summary?.monthlyRevenue?.amount;
    if (!prev && !curr) return undefined;
    const from = prev || 0;
    const to = curr || 0;
    return Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      return Math.round(from + (to - from) * t);
    });
  })();
  const totalOrganizations = isStaffViewer 
    ? (stats?.summary?.totalWorkspaces || 0)
    : 1;

  // Show loading overlay while dashboard data is loading
  const isLoadingDashboard = isLoading || accessLoading;

  // Get identity data for mobile display
  const { externalId, employeeId, supportCode, orgId, licenseNumber, licenseState, licenseExpiry, licenseVerified, licenseVerifiedAt, dbUserId, dbWorkspaceId, workspaceRole: identityWorkspaceRole } = useIdentity();
  
  // Generate display name and initials
  const displayName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";
  const displayExternalId = employeeId || supportCode || externalId;
  const displayRole = workspaceRole || user?.platformRole;
  const isStaff = user?.platformRole &&
    ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes(user?.platformRole);

  // Mobile UI - Role-based workforce dashboard
  // Use effectiveRole for consistent role detection across mobile views
  const mobileRole = getMobileRole(effectiveRole);
  const isManager = hasManagerAccess(effectiveRole);
  
  // Color palette for feature cards
  const cardColorMap: Record<string, { border: string; iconBg: string; glow: string }> = {
    cyan:    { border: 'border-cyan-300/50 dark:border-cyan-700/50',     iconBg: 'bg-gradient-to-br from-cyan-400 to-cyan-600',       glow: 'shadow-cyan-500/20' },
    blue:    { border: 'border-blue-200/60 dark:border-blue-800/50',     iconBg: 'bg-gradient-to-br from-blue-400 to-blue-600',       glow: 'shadow-blue-500/20' },
    violet:  { border: 'border-violet-200/60 dark:border-violet-800/50', iconBg: 'bg-gradient-to-br from-violet-400 to-violet-600',   glow: 'shadow-violet-500/20' },
    orange:  { border: 'border-orange-200/60 dark:border-orange-800/50', iconBg: 'bg-gradient-to-br from-orange-400 to-orange-500',   glow: 'shadow-orange-500/15' },
    emerald: { border: 'border-emerald-200/60 dark:border-emerald-800/50',iconBg: 'bg-gradient-to-br from-emerald-400 to-green-500',  glow: 'shadow-emerald-500/20' },
    rose:    { border: 'border-rose-200/60 dark:border-rose-800/50',     iconBg: 'bg-gradient-to-br from-rose-400 to-red-500',        glow: 'shadow-rose-500/15' },
    amber:   { border: 'border-amber-200/60 dark:border-amber-800/50',   iconBg: 'bg-gradient-to-br from-amber-400 to-yellow-500',    glow: 'shadow-amber-500/15' },
    teal:    { border: 'border-teal-200/60 dark:border-teal-800/50',     iconBg: 'bg-gradient-to-br from-teal-400 to-teal-600',       glow: 'shadow-teal-500/20' },
    indigo:  { border: 'border-indigo-200/60 dark:border-indigo-800/50', iconBg: 'bg-gradient-to-br from-indigo-400 to-indigo-600',   glow: 'shadow-indigo-500/20' },
    slate:   { border: 'border-slate-200/60 dark:border-slate-700/50',   iconBg: 'bg-gradient-to-br from-slate-400 to-slate-600',     glow: 'shadow-slate-500/10' },
    primary: { border: 'border-primary/30 dark:border-primary/40',       iconBg: 'bg-gradient-to-br from-primary/80 to-primary',      glow: 'shadow-primary/20' },
  };

  // Mobile FeatureCard component
  const FeatureCard = ({ icon: Icon, label, href, color = 'slate' }: { icon: any; label: string; href: string; accent?: boolean; color?: string; variant?: string }) => {
    const colors = cardColorMap[color] ?? cardColorMap.slate;

    return (
      <Link
        href={href}
        className={`rounded-md bg-card border ${colors.border} shadow-sm flex flex-col justify-center items-center gap-2.5 hover-elevate active-elevate-2 transition-all p-4 pt-5 relative overflow-hidden group`}
        data-testid={`card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {/* Subtle radial glow on hover */}
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-md`}
          style={{ background: `radial-gradient(circle at 50% 30%, ${color === 'cyan' ? 'rgba(0,212,255,0.06)' : color === 'emerald' ? 'rgba(52,211,153,0.06)' : color === 'primary' ? 'rgba(var(--primary),0.06)' : 'rgba(148,163,184,0.04)'} 0%, transparent 70%)` }}
        />
        <div className={`p-3 rounded-md shadow-sm ${colors.iconBg} shadow-sm ${colors.glow}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="text-[11px] text-center font-semibold text-foreground/80 w-full relative whitespace-nowrap overflow-hidden text-ellipsis px-1">
          {label}
        </div>
      </Link>
    );
  };

  return (
    <CanvasHubPage config={dashboardPageConfig}>
      {isMobile ? (
        // Mobile UI - Role-based workforce dashboard
        <WorkspaceLayout heroGradient>
          {isLoadingDashboard && <ResponsiveLoading />}
          
          <div className="pb-6">
            {/* ── Greeting Banner ─────────────────────────────────────────── */}
            {(() => {
              const hour = new Date().getHours();
              const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
              const isOnShift = clockStatus?.isClockedIn ?? false;
              const clockedInAt = clockStatus?.activeTimeEntry?.clockIn
                ? new Date(clockStatus.activeTimeEntry.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;
              const firstName = user?.firstName || user?.email?.split('@')[0] || 'there';
              return (
                <div
                  className="mb-4 rounded-md overflow-hidden shadow-sm"
                  style={{ background: 'linear-gradient(135deg, var(--color-bg-tertiary) 0%, var(--color-bg-secondary) 100%)', borderLeft: '3px solid var(--color-brand-primary)' }}
                  data-testid="greeting-banner"
                >
                  <div className="p-4">
                  {/* Row 1: avatar + name */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-base text-white"
                      style={{ background: 'var(--color-brand-gradient)' }}
                      data-testid="greeting-avatar"
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold leading-tight truncate" style={{ color: 'var(--color-text-primary)' }} data-testid="text-greeting">
                        {greeting}, {firstName}
                      </p>
                      <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(240,246,252,0.55)' }} data-testid="text-org-role">
                        {workspace?.name || 'Loading...'} · {(displayRole || '').replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  {/* Row 2: status + shift info */}
                  <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(240,246,252,0.12)' }}>
                    <div className="flex items-center gap-2" data-testid="status-shift">
                      <div className={`w-2 h-2 rounded-full ${isOnShift ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
                      <span className="text-xs font-medium" style={{ color: isOnShift ? 'var(--color-success)' : 'rgba(240,246,252,0.5)' }}>
                        {isOnShift ? 'On Shift' : 'Off Shift'}
                      </span>
                    </div>
                    {isOnShift && clockedInAt ? (
                      <span className="text-xs" style={{ color: 'rgba(240,246,252,0.5)' }} data-testid="text-clocked-since">Clocked in at {clockedInAt}</span>
                    ) : (
                      <Link href="/time-tracking" className="text-xs font-semibold" style={{ color: 'var(--color-brand-primary)' }}>
                        Clock in →
                      </Link>
                    )}
                  </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Earnings Widget ─────────────────────────────────────────── */}
            {(() => {
              const fmtDate = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
              const periodStart = workerEarnings?.payPeriodStart ? new Date(workerEarnings.payPeriodStart) : null;
              const periodEnd = workerEarnings?.payPeriodEnd ? new Date(workerEarnings.payPeriodEnd) : null;
              const now = new Date();
              const totalPeriodDays = (periodStart && periodEnd)
                ? Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
                : 14;
              const daysElapsed = (periodStart && periodEnd)
                ? Math.min(Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)), totalPeriodDays)
                : 0;
              const progressPct = totalPeriodDays > 0 ? Math.round((daysElapsed / totalPeriodDays) * 100) : 0;
              const earnedAmount = workerEarnings?.hourlyRate ? workerEarnings.earnings : null;
              const earningsDisplay = isLoadingEntries
                ? '…'
                : earnedAmount !== null
                  ? formatCurrency(earnedAmount)
                  : '—';

              return (
                <div className="mb-4 relative rounded-md overflow-hidden bg-card border border-border shadow-sm" data-testid="earnings-widget">
                  {/* Brand gradient accent — hardcoded, never changes with theme */}
                  <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'var(--color-brand-gradient)' }} />
                  <div className="p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">My Earnings</p>
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-3xl font-black text-foreground" data-testid="text-earnings-amount">
                        {earningsDisplay}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {periodStart && periodEnd ? `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}` : 'Current Period'}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${progressPct}%`, background: 'var(--color-brand-gradient)' }}
                        data-testid="earnings-progress"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-3">
                      <span>{daysElapsed} days in</span>
                      <span>{totalPeriodDays - daysElapsed} days left</span>
                    </div>
                    <Link href="/my-paychecks" className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1" data-testid="link-earnings-details">
                      View earnings details <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })()}

            {/* Quick Actions - Time Management (Primary for field workers) */}
            <section className="mb-5 page-section">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600" />
                <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Time & Schedule</h2>
                <div className="live-dot live-dot--cyan ml-auto" />
              </div>
              <div className="grid gap-3 grid-cols-2 card-grid">
                <FeatureCard icon={Clock} label="Clock In/Out" href="/time-tracking" color="cyan" />
                <FeatureCard icon={Calendar} label="My Schedule" href="/schedule" color="blue" />
                <FeatureCard icon={FileText} label="Timesheets" href="/time-tracking" color="indigo" />
                <FeatureCard icon={ClipboardList} label="Daily Report" href="/field-reports?type=daily" color="violet" />
              </div>
            </section>

            {/* Manager-Only: Team Management */}
            {isManager && (
              <section className="mb-5 page-section">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
                  <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Team Management</h2>
                </div>
                <div className="grid gap-3 grid-cols-2 card-grid">
                  <FeatureCard icon={CheckCircle2} label="Approvals" href="/workflow-approvals" color="emerald" />
                  <FeatureCard icon={Users} label="My Team" href="/my-team" color="teal" />
                  <FeatureCard icon={Calendar} label="Team Schedule" href="/schedule/team" color="blue" />
                  <FeatureCard icon={Activity} label="Shift Swaps" href="/shift-marketplace" color="amber" />
                </div>
              </section>
            )}

            {/* Business Operations - Manager/Owner only */}
            {isManager && (
              <section className="mb-5 page-section">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-violet-400 to-violet-600" />
                  <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Business Operations</h2>
                </div>
                <div className="grid gap-3 grid-cols-2 card-grid">
                  <FeatureCard icon={Users} label="Employees" href="/employees" color="blue" />
                  <FeatureCard icon={Building2} label="Clients" href="/clients" color="indigo" />
                  <FeatureCard icon={DollarSign} label="Payroll" href="/payroll" color="emerald" />
                  <FeatureCard icon={Receipt} label="Invoices" href="/invoices" color="violet" />
                  <FeatureCard icon={Wallet} label="Expenses" href="/expenses" color="orange" />
                  <FeatureCard icon={Settings} label="Settings" href="/settings" color="slate" />
                </div>
              </section>
            )}

            {/* Plan Status - Manager/Owner only */}
            {isManager && (
              <section className="mb-5 page-section" data-testid="section-mobile-plan-status">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-yellow-600" />
                  <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Plan Status</h2>
                </div>
                <CreditBalanceCard />
              </section>
            )}

            {/* My Work - Employee self-service */}
            <section className="mb-5 page-section">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-teal-400 to-teal-600" />
                <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">My Work</h2>
              </div>
              <div className="grid gap-3 grid-cols-2 card-grid">
                <FeatureCard icon={CalendarOff} label="Availability" href="/availability" color="teal" />
                <FeatureCard icon={Briefcase} label="My Paychecks" href="/my-paychecks" color="emerald" />
              </div>
            </section>

            {/* Field Reports */}
            <section className="mb-5 page-section">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-rose-400 to-red-600" />
                <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Field Reports</h2>
              </div>
              <div className="grid gap-3 grid-cols-2 card-grid">
                <FeatureCard icon={ClipboardList} label="Field Reports" href="/field-reports" color="rose" />
                <FeatureCard icon={Shield} label="Safety & SLA" href="/safety-check" color="amber" />
              </div>
            </section>

            {/* Onboarding */}
            <section className="mb-5 page-section">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-yellow-400 to-amber-600" />
                <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Onboarding</h2>
              </div>
              <div className="grid gap-3 grid-cols-2 card-grid">
                <FeatureCard icon={GraduationCap} label="My Documents" href="/employee/portal" color="amber" />
                {isManager && (
                  <FeatureCard icon={FileText} label="Onboarding Packets" href="/employee-packets" color="yellow" />
                )}
              </div>
            </section>

            {/* Proposals & Contracts - Manager/Owner only */}
            {isManager && (
              <section className="mb-5 page-section">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-indigo-400 to-blue-600" />
                  <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Proposals & Contracts</h2>
                </div>
                <div className="grid gap-3 grid-cols-2 card-grid">
                  <FeatureCard icon={FileBox} label="Client Pipeline" href="/sps-client-pipeline" color="indigo" />
                  <FeatureCard icon={FileSignature} label="RFP Manager" href="/rfp" color="violet" />
                </div>
              </section>
            )}

            {/* Communication */}
            <section className="mb-5 page-section">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-400 to-cyan-600" />
                <h2 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Communication</h2>
              </div>
              <div className="grid gap-3 grid-cols-2 card-grid">
                <FeatureCard icon={MessageSquare} label="Team Chat" href="/chatrooms" color="cyan" />
                <FeatureCard icon={Headphones} label="Help Desk" href="/helpdesk" color="emerald" />
              </div>
            </section>
          </div>
          
          {/* HelpDesk Ticket Modal */}
          <HelpDeskTicketModal
            open={helpDeskModalOpen}
            onOpenChange={setHelpDeskModalOpen}
            userInfo={{
              userId: dbUserId || undefined,
              workspaceId: dbWorkspaceId || workspace?.id,
              workspaceName: workspace?.name,
              userName: displayName,
              email: user?.email,
              quickbooksId: workspaceHealth?.integrations?.quickbooksRealmId,
            }}
          />
        </WorkspaceLayout>
      ) : (
        // Desktop UI - full dashboard with detailed stats
        <WorkspaceLayout heroGradient maxWidth="6xl">
      {/* Show Trinity loading for initial auth check */}
      {isLoadingDashboard && (
        <div className="fixed inset-0 z-[2500] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-4">
          <Suspense fallback={<div className="w-20 h-20" />}>
            <TrinityRedesign size={80} mode="THINKING" />
          </Suspense>
          <span className="text-muted-foreground">Loading dashboard...</span>
        </div>
      )}
        {/* Branded Header with Logo - Centered on Large Screens */}
        <ResponsiveSection spacing="lg">
          {/* Hero card — gradient background with avatar + welcome */}
          <div
            className="rounded-md overflow-hidden relative"
            style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563EB 40%, #4f46e5 100%)" }}
          >
            {/* Subtle decorative orbs */}
            <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(30%, -40%)" }} />
            <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #a5b4fc 0%, transparent 70%)", transform: "translate(-30%, 40%)" }} />

            <div className="relative z-10 p-6 sm:p-8">
              {/* Top row: logo + org name */}
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div className="opacity-90 brightness-0 invert transform hover:scale-105 transition-transform duration-300">
                  <UnifiedBrandLogo variant="full" size="sm" />
                </div>
                {workspace?.name && (
                  <Badge
                    className="text-xs px-3 py-1 font-semibold border-white/30 text-white"
                    style={{ background: "rgba(255,255,255,0.15)" }}
                    data-testid="text-org-name"
                  >
                    {workspace.name}
                  </Badge>
                )}
              </div>

              {/* Avatar + greeting row */}
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <Avatar className="w-16 h-16 shrink-0 ring-2 ring-white/40">
                  <AvatarImage src={(user as any)?.profileImageUrl ?? ""} alt={firstName} />
                  <AvatarFallback
                    className="text-lg font-bold text-white"
                    style={{ background: "rgba(255,255,255,0.2)" }}
                  >
                    {firstName?.[0]?.toUpperCase() ?? "?"}{(user as any)?.lastName?.[0]?.toUpperCase() ?? ""}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight truncate" data-testid="text-desktop-greeting">
                    {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })()}, {firstName}
                  </h2>
                  <p className="text-sm text-white/60 mt-1" data-testid="text-desktop-role">
                    {displayRole ? displayRole.replace(/_/g, ' ') : 'Team Member'}
                  </p>
                </div>
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* State License Badge - for regulated industries */}
                {licenseNumber && (
                  <div data-testid="license-badge">
                    <StateLicenseBadge
                      licenseNumber={licenseNumber}
                      licenseState={licenseState}
                      licenseExpiry={licenseExpiry}
                      isVerified={licenseVerified}
                      verifiedAt={licenseVerifiedAt}
                      variant="compact"
                    />
                  </div>
                )}
                {displayExternalId && (
                  <Badge
                    className="text-xs px-2.5 py-0.5 font-medium border-white/30 text-white"
                    style={{ background: "rgba(255,255,255,0.15)" }}
                    data-testid="badge-external-id"
                  >
                    {displayExternalId}
                  </Badge>
                )}
                {displayRole && (
                  <Badge
                    className="text-xs px-2.5 py-0.5 font-medium border-white/30 text-white"
                    style={{ background: "rgba(255,255,255,0.2)" }}
                    data-testid="badge-role"
                  >
                    {displayRole.replace(/_/g, ' ')}
                  </Badge>
                )}
                {orgCode && orgCode !== 'N/A' && (
                  <Badge
                    className="text-xs px-2.5 py-0.5 font-medium border-white/30 text-white"
                    style={{ background: "rgba(255,255,255,0.15)" }}
                    data-testid="badge-org-code"
                  >
                    {orgCode.toUpperCase()}
                  </Badge>
                )}
                {subscriptionData && (() => {
                  const tier = subscriptionData.tier || 'free';
                  const status = subscriptionData.status;
                  const isTrial = status === 'trial' && !!subscriptionData.trialEndsAt;
                  const trialEndRaw = subscriptionData.trialEndsAt;
                  const trialEnd = trialEndRaw ? new Date(trialEndRaw) : null;
                  const isValidDate = trialEnd && !isNaN(trialEnd.getTime());
                  const now = new Date();
                  const isExpired = isValidDate ? trialEnd < now : false;
                  const daysLeft = isValidDate ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                  const isExpiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 7;

                  if (isTrial && isValidDate) {
                    const bg = isExpired ? 'rgba(239,68,68,0.3)' : isExpiringSoon ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.15)';
                    return (
                      <Badge
                        className="text-xs px-2.5 py-0.5 font-medium border-white/30 text-white"
                        style={{ background: bg }}
                        data-testid="badge-subscription-trial"
                      >
                        {isExpired
                          ? `Trial expired ${formatDistanceToNow(trialEnd, { addSuffix: true })}`
                          : `Trial ends: ${trialEnd.toLocaleDateString()}`}
                      </Badge>
                    );
                  }
                  if (status === 'active' || status === 'paid') {
                    return (
                      <Badge
                        className="text-xs px-2.5 py-0.5 font-medium border-white/30 text-white"
                        style={{ background: "rgba(34,197,94,0.25)" }}
                        data-testid="badge-subscription-plan"
                      >
                        {tier.charAt(0).toUpperCase() + tier.slice(1)} Plan
                        {subscriptionData.currentPeriodEnd && ` · Renews ${new Date(subscriptionData.currentPeriodEnd).toLocaleDateString()}`}
                      </Badge>
                    );
                  }
                  return (
                    <Badge
                      className="text-xs px-2.5 py-0.5 font-medium border-white/30 text-white"
                      style={{ background: "rgba(255,255,255,0.15)" }}
                      data-testid="badge-subscription-status"
                    >
                      {tier.charAt(0).toUpperCase() + tier.slice(1)} Plan
                    </Badge>
                  );
                })()}
                {dbUserId && (
                  <Badge
                    className="text-[10px] px-2 py-0.5 font-mono border-white/20 text-white/70"
                    style={{ background: "rgba(255,255,255,0.1)" }}
                    data-testid="badge-db-user-id"
                  >
                    UID: {dbUserId}
                  </Badge>
                )}
                {dbWorkspaceId && (
                  <Badge
                    className="text-[10px] px-2 py-0.5 font-mono border-white/20 text-white/70"
                    style={{ background: "rgba(255,255,255,0.1)" }}
                    data-testid="badge-db-workspace-id"
                  >
                    WS: {dbWorkspaceId}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </ResponsiveSection>

        {/* Trinity Proactive Insights — below hero, above pending approvals */}
        <ResponsiveSection>
          <TrinityInsightBar />
        </ResponsiveSection>

        {/* Pending Shift Approvals Banner */}
        <ResponsiveSection>
          <PendingApprovalsBanner />
        </ResponsiveSection>

        <ResponsiveSection>
          <SupervisoryDisclaimer />
        </ResponsiveSection>

        {/* Workspace Health Status - Simple visual indicator */}
        {workspaceHealth && (
          <ResponsiveSection>
          <div className={`rounded-md border p-4 md:p-5 ${
            workspaceHealth.status === 'green' ? 'bg-card border-border' :
            workspaceHealth.status === 'yellow' ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-400/40' :
            'bg-destructive/5 dark:bg-destructive/10 border-destructive/40'
          }`} data-testid="workspace-health-status">
            <div className="flex items-start gap-4">
              {/* Status Indicator */}
              <div className={`w-12 h-12 rounded-md flex items-center justify-center shrink-0 ${
                workspaceHealth.status === 'green' ? 'bg-primary/10' :
                workspaceHealth.status === 'yellow' ? 'bg-amber-100 dark:bg-amber-900/40' :
                'bg-destructive/10'
              }`}>
                {workspaceHealth.status === 'green' && <CheckCircle className="w-6 h-6 text-primary" />}
                {workspaceHealth.status === 'yellow' && <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />}
                {workspaceHealth.status === 'red' && <XCircle className="w-6 h-6 text-destructive" />}
              </div>

              {/* Status Message */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold mb-1 text-foreground">
                  {workspaceHealth.status === 'green' && 'Everything Running Smoothly'}
                  {workspaceHealth.status === 'yellow' && 'Action Recommended'}
                  {workspaceHealth.status === 'red' && 'Action Required'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">{workspaceHealth.message}</p>

                {/* Simple status grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-background/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Billing</p>
                    <p className="font-semibold text-sm">{workspaceHealth?.billing?.active ? '✓ Active' : '✗ Inactive'}</p>
                  </div>
                  <div 
                    className={`bg-background/50 rounded-lg p-3 ${workspaceHealth?.integrations?.quickbooks !== 'connected' ? 'cursor-pointer hover-elevate' : ''}`}
                    onClick={() => {
                      if (workspaceHealth?.integrations?.quickbooks !== 'connected') {
                        setLocation('/quickbooks-import');
                      }
                    }}
                    data-testid="status-quickbooks"
                  >
                    <p className="text-xs text-muted-foreground mb-1">QuickBooks</p>
                    <p className="font-semibold text-sm">{workspaceHealth?.integrations?.quickbooks === 'connected' ? <><span className="text-green-600 dark:text-green-400">✓</span> <span className="text-orange-500 font-mono">{workspaceHealth?.integrations?.quickbooksRealmId || 'Connected'}</span></> : <span className="text-primary">Set Up Now</span>}</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Gusto</p>
                    <p className="font-semibold text-sm">{workspaceHealth?.integrations?.gusto === 'connected' ? '✓ Connected' : '- Not Connected'}</p>
                  </div>
                </div>

                {/* Action button for yellow/red status */}
                {workspaceHealth.status !== 'green' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      onClick={() => setLocation(workspaceHealth?.billing?.active ? '/accounting-integrations' : '/settings')}
                      variant="default"
                      size="sm"
                      data-testid="button-fix-health"
                    >
                      {workspaceHealth?.billing?.active ? 'Connect Integrations' : 'Update Billing'}
                    </Button>
                    {workspaceHealth?.billing?.active && workspaceHealth?.integrations?.quickbooks !== 'connected' && (
                      <Button
                        onClick={() => setLocation('/quickbooks-import')}
                        variant="outline"
                        size="sm"
                        data-testid="button-quickbooks-setup"
                      >
                        <ArrowRight className="w-4 h-4 mr-1" />
                        QuickBooks Setup
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          </ResponsiveSection>
        )}

        {statsError && (
          <ResponsiveSection>
            <Card className="border-destructive/50" data-testid="error-card-stats">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Failed to load dashboard stats</p>
                  <p className="text-xs text-muted-foreground truncate">{statsError.message}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => refetchStats()} data-testid="button-retry-stats">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          </ResponsiveSection>
        )}

        <PageSectionBoundary sectionName="metrics">
        <ResponsiveSection>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mobile-compact-gap max-w-7xl mx-auto">
          <div className="space-y-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 mobile-compact-gap-sm items-start">
              <MetricTile
                title="Total Organizations"
                value={totalOrganizations}
                icon={Building2}
                href="/org-management"
              />
              
              <MetricTile
                title="Total Employees"
                value={totalEmployees}
                icon={Users}
                href="/employees"
              />
              
              <MetricTile
                title="Total Clients"
                value={totalClients}
                icon={Users}
                href="/clients"
              />
              
              <MetricTile
                title="Total Revenue"
                value={`$${totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(1)}K` : totalRevenue.toFixed(2)}`}
                icon={DollarSign}
                href="/financial-intelligence"
                sparkline={revenueSparkline}
                trend={stats?.summary?.monthlyRevenue?.delta !== undefined ? {
                  value: `${Math.abs(stats.summary.monthlyRevenue.delta).toFixed(1)}% vs last month`,
                  positive: stats.summary.monthlyRevenue.delta >= 0,
                } : undefined}
              />
            </div>
            <PaydayWidget />
          </div>
          
          <CreditBalanceCard />
        </div>
        </ResponsiveSection>
        </PageSectionBoundary>

        {/* Document Activity Widget */}
        <ResponsiveSection>
          <SpsDocumentActivityWidget />
        </ResponsiveSection>


        {/* Automation Value Metrics - Only show for workspace scope (hidden in Simple Mode) */}
        <HideInSimpleMode>
        {stats?.automation && (
          <ResponsiveSection>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-md p-6 sm:p-8 mobile-compact-p text-white shadow-sm border border-blue-500">
              <div className="flex items-start justify-between mb-6 gap-2">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2" data-testid="text-automation-title">Trinity™ Automation Value</h3>
                  <p className="text-blue-100 text-sm max-w-2xl">
                    Autonomous AI managing scheduling, billing, and payroll—saving your organization time and money 24/7
                  </p>
                  <div className="mt-2 text-xs text-blue-200 bg-blue-500/10 dark:bg-blue-400/10 rounded px-2 py-1 inline-flex items-center gap-1.5" data-testid="text-automation-disclaimer">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>Estimates based on industry averages (SHRM/ADP). Actual value may vary by organization.</span>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${stats.automation.trend.isImproving ? 'bg-green-500/20 border border-green-400' : 'bg-yellow-500/20 border border-yellow-400'}`} data-testid="badge-automation-trend">
                  <span className="text-xs font-semibold">
                    {stats.automation.trend.isImproving ? '↑' : '↓'} {Math.abs(stats.automation.trend.percentChange).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mobile-grid-2 mobile-compact-gap-sm mb-6">
                <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm border border-white/10" data-testid="card-hours-saved">
                  <p className="text-blue-100 text-xs mb-1">Hours Saved This Month</p>
                  <p className="text-2xl sm:text-3xl font-bold">{stats.automation.hoursSavedThisMonth.toFixed(1)}</p>
                  <p className="text-blue-200 text-xs mt-1">{stats.automation.hoursSavedAllTime.toFixed(0)} hrs all-time</p>
                </div>

                <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm border border-white/10" data-testid="card-cost-avoidance">
                  <p className="text-blue-100 text-xs mb-1">Cost Avoidance (Monthly)</p>
                  <p className="text-2xl sm:text-3xl font-bold">${stats.automation.costAvoidanceMonthly.toLocaleString()}</p>
                  <p className="text-blue-200 text-xs mt-1">${stats.automation.costAvoidanceTotal.toLocaleString()} total</p>
                </div>

                <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm border border-white/10" data-testid="card-ai-success">
                  <p className="text-blue-100 text-xs mb-1">AI Success Rate</p>
                  <p className="text-2xl sm:text-3xl font-bold">{(stats.automation.aiSuccessRate * 100).toFixed(1)}%</p>
                  <p className="text-blue-200 text-xs mt-1">Avg confidence: {(stats.automation.avgConfidenceScore * 100).toFixed(0)}%</p>
                </div>

                <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm border border-white/10" data-testid="card-auto-approval">
                  <p className="text-blue-100 text-xs mb-1">Auto-Approval Rate</p>
                  <p className="text-2xl sm:text-3xl font-bold">{(stats.automation.autoApprovalRate * 100).toFixed(1)}%</p>
                  <p className="text-blue-200 text-xs mt-1">High-confidence automation</p>
                </div>
              </div>

              {/* System Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mobile-compact-gap-sm">
                <div className="bg-white/5 rounded-lg p-4 border border-white/10" data-testid="card-schedule-ai">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-blue-200" />
                    <h4 className="font-semibold text-sm">AI Scheduling</h4>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold mb-1">{stats.automation.breakdown.scheduleOS.shiftsGenerated}</p>
                  <p className="text-xs text-blue-200">Shifts auto-generated</p>
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <p className="text-xs text-blue-200">{stats.automation.breakdown.scheduleOS.hoursSaved.toFixed(1)} hrs saved • {(stats.automation.breakdown.scheduleOS.successRate * 100).toFixed(0)}% success</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-4 border border-white/10" data-testid="card-bill-ai">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-200" />
                    <h4 className="font-semibold text-sm">Smart Billing</h4>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold mb-1">{stats.automation.breakdown.billOS.invoicesGenerated}</p>
                  <p className="text-xs text-blue-200">Invoices auto-generated</p>
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <p className="text-xs text-blue-200">{stats.automation.breakdown.billOS.hoursSaved.toFixed(1)} hrs saved • {(stats.automation.breakdown.billOS.successRate * 100).toFixed(0)}% success</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-4 border border-white/10" data-testid="card-payroll-ai">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-blue-200" />
                    <h4 className="font-semibold text-sm">Auto Payroll</h4>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold mb-1">{stats.automation.breakdown.payrollOS.payrollsProcessed}</p>
                  <p className="text-xs text-blue-200">Payrolls auto-processed</p>
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <p className="text-xs text-blue-200">{stats.automation.breakdown.payrollOS.hoursSaved.toFixed(1)} hrs saved • {(stats.automation.breakdown.payrollOS.successRate * 100).toFixed(0)}% success</p>
                  </div>
                </div>
              </div>
            </div>
          </ResponsiveSection>
        )}
        </HideInSimpleMode>

        {/* Compliance Alerts Section */}
        <ComplianceAlerts />

        <PageSectionBoundary sectionName="quick-actions">
        <ResponsiveSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mobile-quick-action-grid">
          {/* Accessible quick actions */}
          {quickActions.map((route) => (
            <Link key={route.id} href={route.href}>
              <button className="w-full bg-card border border-border rounded-lg p-4 sm:p-6 mobile-quick-action-card text-left hover-elevate active-elevate-2 transition-all duration-200 group" data-testid={`button-quick-${route.id}`}>
                <div className="p-2 sm:p-3 bg-muted rounded-lg w-fit mb-2 sm:mb-4 icon-container">
                  <route.icon className="w-5 h-5 sm:w-8 sm:h-8 text-primary mobile-icon-auto" />
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2 flex-wrap">
                  <h4 className="font-bold text-foreground text-sm sm:text-lg mobile-quick-action-title mobile-truncate-1">{route.label}</h4>
                  {route.badge && (
                    <Badge variant="secondary" className="text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0 flex-shrink-0">{route.badge}</Badge>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 mobile-quick-action-text mobile-truncate">{route.description}</p>
                <div className="flex items-center text-primary text-xs sm:text-sm font-semibold mobile-quick-action-text">
                  Open <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                </div>
              </button>
            </Link>
          ))}
          
          {/* Locked features (tier upgrade prompts) */}
          {upgradePrompts.map((route) => (
            <TooltipProvider key={route.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <button 
                      disabled
                      className="w-full bg-card/30 border border-border/50 rounded-lg p-4 sm:p-6 mobile-quick-action-card text-left opacity-60 cursor-not-allowed group" 
                      data-testid={`button-locked-${route.id}`}
                    >
                      <div className="p-2 sm:p-3 bg-muted/50 rounded-lg w-fit mb-2 sm:mb-4 relative icon-container">
                        <route.icon className="w-5 h-5 sm:w-8 sm:h-8 text-muted-foreground mobile-icon-auto" />
                        <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5 sm:p-1">
                          <Lock className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2 flex-wrap">
                        <h4 className="font-bold text-muted-foreground text-sm sm:text-lg mobile-quick-action-title mobile-truncate-1">{route.label}</h4>
                        <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0 border-primary/50 text-primary flex-shrink-0">
                          {route.badge}
                        </Badge>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground/80 mb-2 sm:mb-3 mobile-quick-action-text mobile-truncate">{route.description}</p>
                      <div className="flex items-center text-primary text-xs sm:text-sm font-semibold mobile-quick-action-text">
                        Upgrade <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                      </div>
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium">{route.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{route.description}</p>
                  <p className="text-xs text-primary mt-2 font-semibold">
                    Requires {route.badge} plan to access
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
        </ResponsiveSection>
        </PageSectionBoundary>

        <PageSectionBoundary sectionName="role-panels">
        {/* Organization Auditor Panel - Read-Only Financial, Payroll & Compliance Data */}
        {workspaceRole === 'auditor' && (
          <ResponsiveSection>
            <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-500/30 rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-600 dark:bg-blue-700 rounded-lg">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground lg:text-center">Organization Audit Dashboard</h3>
                  <p className="text-sm text-muted-foreground lg:text-center">Read-only access to financial, payroll, and compliance data</p>
                </div>
              </div>

              {/* Auditor Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Invoices</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access invoice records</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Payroll</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Review payroll data</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 lg:text-center">Compliance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Audit compliance logs</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Audit Logs</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access audit trail</p>
                </div>
              </div>

              {/* Auditor Access Notice */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 lg:text-center">Auditor Access Level</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 lg:text-center">
                      You have read-only access to financial records, payroll data, compliance documentation, and audit logs. 
                      Use the navigation menu to access Invoices, Payroll, Audit Logs, and Policies sections.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </ResponsiveSection>
        )}

        {/* Platform-Level Role Panels */}
        <ResponsiveSection>
        {/* Platform Auditor / Compliance Officer Panel - Platform-Wide Compliance Oversight */}
        {platformRole === 'compliance_officer' && isPlatformStaff && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-500/30 rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-600 dark:bg-blue-700 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground lg:text-center">Platform Compliance & AI Oversight</h3>
                  <p className="text-sm text-muted-foreground lg:text-center">Platform-wide compliance monitoring, audits, and AI governance</p>
                </div>
              </div>

              {/* Platform Auditor Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Compliance Heatmap</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform compliance status</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 lg:text-center">AI Oversight</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Review</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">AI governance queue</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Policy Attestations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Audit</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Policy compliance tracking</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Data Retention</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Configure</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Retention policies</p>
                </div>
              </div>

              {/* Platform Auditor Access Notice */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 lg:text-center">Compliance Officer Access</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 lg:text-center">
                      You have platform-wide compliance oversight including audit trail reviews, AI governance monitoring, 
                      policy attestation tracking, and data retention management across all workspaces.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Support Manager Panel - Manage Support Operations */}
        {platformRole === 'support_manager' && isPlatformStaff && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-500/30 rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-600 dark:bg-blue-700 rounded-lg">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground lg:text-center">Support Management Center</h3>
                  <p className="text-sm text-muted-foreground lg:text-center">Oversee support operations, team performance, and escalations</p>
                </div>
              </div>

              {/* Support Manager Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">All Conversations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">All support tickets</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Team Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Agent metrics & SLAs</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Escalations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Handle</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">High priority issues</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Reports</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Generate</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Support analytics</p>
                </div>
              </div>

              {/* Support Manager Access Notice */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 lg:text-center">Support Manager Access</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 lg:text-center">
                      You can manage all support conversations, monitor agent performance, handle escalations, 
                      and access support analytics across all workspaces.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Support Agent Panel - Handle Support Tickets */}
        {platformRole === 'support_agent' && isPlatformStaff && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-900/20 border border-teal-500/30 rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-teal-600 dark:bg-teal-700 rounded-lg">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground lg:text-center">Support Agent Workspace</h3>
                  <p className="text-sm text-muted-foreground lg:text-center">Handle customer conversations and resolve tickets</p>
                </div>
              </div>

              {/* Support Agent Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 lg:text-center">My Queue</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Assigned conversations</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Response Time</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Track</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">SLA compliance</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Resolved Today</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Count</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Tickets closed</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">My metrics</p>
                </div>
              </div>

              {/* Support Agent Access Notice */}
              <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-teal-900 dark:text-teal-100 lg:text-center">Support Agent Access</p>
                    <p className="text-xs text-teal-700 dark:text-teal-300 mt-1 lg:text-center">
                      You can view your assigned conversation queue, respond to customer tickets, 
                      monitor your response times, and track your performance metrics.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Root Admin Panel - Full Platform Control (double-check isPlatformStaff to prevent org owners seeing this) */}
        {platformRole === 'root_admin' && isPlatformStaff && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-900/20 border border-red-500/30 rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-red-600 dark:bg-red-700 rounded-lg">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground lg:text-center">Root Admin Control Center</h3>
                  <p className="text-sm text-muted-foreground lg:text-center">Full platform oversight and administrative control</p>
                </div>
              </div>

              {/* Root Admin Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 lg:text-center">System Config</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform settings</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-600 dark:text-fuchsia-400 lg:text-center">All Workspaces</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Oversee</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform-wide data</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 lg:text-center">System Health</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Infrastructure status</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Security</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Control</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access & permissions</p>
                </div>
              </div>

              {/* Root Admin Access Notice */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 lg:text-center">Root Administrator Access</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 lg:text-center">
                      You have unrestricted access to all platform features, system configuration, workspace management, 
                      security controls, and infrastructure monitoring.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Deputy Admin Panel - Platform Management Support */}
        {platformRole === 'deputy_admin' && isPlatformStaff && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-900/20 border border-indigo-500/30 rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-600 dark:bg-indigo-700 rounded-lg">
                  <UserCog className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground lg:text-center">Deputy Admin Dashboard</h3>
                  <p className="text-sm text-muted-foreground lg:text-center">Assist with platform administration and user management</p>
                </div>
              </div>

              {/* Deputy Admin Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 lg:text-center">User Management</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform users</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 lg:text-center">Workspace Support</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Assist</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Customer success</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Reports</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Generate</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform analytics</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Configuration</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Assist</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">System setup</p>
                </div>
              </div>

              {/* Deputy Admin Access Notice */}
              <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 lg:text-center">Deputy Administrator Access</p>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1 lg:text-center">
                      You can assist with user management, workspace support, platform reporting, 
                      and configuration assistance under Root Admin supervision.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SysOp Panel - Infrastructure & Operations */}
        {platformRole === 'sysop' && isPlatformStaff && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-muted/50 to-muted/30 border border-border rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-muted rounded-lg">
                  <Server className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground lg:text-center">System Operations Center</h3>
                  <p className="text-sm text-muted-foreground lg:text-center">Monitor infrastructure, databases, and system performance</p>
                </div>
              </div>

              {/* SysOp Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Infrastructure</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Server health</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:text-center">Databases</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Maintain</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">DB operations</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary lg:text-center">Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Optimize</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">System metrics</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 lg:text-center">Incidents</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Respond</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Emergency support</p>
                </div>
              </div>

              {/* SysOp Access Notice */}
              <div className="bg-muted/50 border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground lg:text-center">System Operations Access</p>
                    <p className="text-xs text-muted-foreground mt-1 lg:text-center">
                      You can monitor infrastructure health, maintain databases, optimize performance metrics, 
                      and respond to system incidents.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </ResponsiveSection>
        </PageSectionBoundary>

        
        {/* HelpDesk Ticket Modal for Desktop */}
        <HelpDeskTicketModal
          open={helpDeskModalOpen}
          onOpenChange={setHelpDeskModalOpen}
          userInfo={{
            userId: dbUserId || undefined,
            workspaceId: dbWorkspaceId || workspace?.id,
            workspaceName: workspace?.name,
            userName: displayName,
            email: user?.email,
            quickbooksId: workspaceHealth?.integrations?.quickbooksRealmId,
          }}
        />
        </WorkspaceLayout>
      )}
    </CanvasHubPage>
  );
}
