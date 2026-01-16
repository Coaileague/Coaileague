import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies, type ModuleRoute } from "@/lib/sidebarModules";
import { useQuery } from "@tanstack/react-query";
import { HideInSimpleMode } from "@/components/SimpleMode";
import { 
  Users, Activity, DollarSign, 
  FileText, Calendar, Clock, ArrowRight,
  Bell, CheckCircle, XCircle, AlertCircle, Mail, Lock,
  Shield, UserCog, Server, Database, MessageCircle, Settings,
  HelpCircle, MessageSquare, LayoutDashboard, AlertTriangle, Building2
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { CoAIleagueAFLogo } from "@/components/coaileague-af-logo";
import { Suspense, lazy } from "react";
const TrinityRedesign = lazy(() => import("@/components/trinity-redesign"));
import { useTransition } from "@/contexts/transition-context";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "@/config/queryKeys";
import { useMessage } from "@/hooks/useConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResponsiveSection, CenteredActions } from "@/components/dashboard-shell";
import { WorkspaceLayout, WorkspaceSection } from "@/components/workspace-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useIdentity } from "@/hooks/useIdentity";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { MetricTile } from "@/components/metric-tile";
import { CreditBalanceCard } from "@/components/credit-balance";
import { PendingApprovalsBanner } from "@/components/pending-approvals-banner";

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

  if (isLoading || !compliance?.hasData || compliance.summary.total === 0) {
    return null;
  }

  const hasCritical = compliance.summary.critical > 0;
  const hasHigh = compliance.summary.high > 0;

  return (
    <ResponsiveSection>
      <div 
        className={`rounded-xl p-6 md:p-6 mobile-compact-p border-2 shadow-lg ${
          hasCritical 
            ? 'bg-red-50 dark:bg-red-950/30 border-red-500 dark:border-red-700' 
            : hasHigh 
            ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-500 dark:border-orange-700' 
            : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-500 dark:border-yellow-700'
        }`}
        data-testid="card-compliance-alerts"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${
              hasCritical 
                ? 'bg-red-100 dark:bg-red-900/50' 
                : hasHigh 
                ? 'bg-orange-100 dark:bg-orange-900/50' 
                : 'bg-yellow-100 dark:bg-yellow-900/50'
            }`}>
              <Shield className={`w-6 h-6 ${
                hasCritical 
                  ? 'text-red-600 dark:text-red-400' 
                  : hasHigh 
                  ? 'text-orange-600 dark:text-orange-400' 
                  : 'text-yellow-600 dark:text-yellow-400'
              }`} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Compliance Alerts
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Trinity™ detected {compliance.summary.total} issue{compliance.summary.total === 1 ? '' : 's'} requiring attention
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mobile-grid-4 mobile-compact-gap-sm">
          {compliance.summary.critical > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 md:p-4 mobile-card-tight border-2 border-red-200 dark:border-red-800" data-testid="card-critical-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-xs font-semibold text-red-900 dark:text-red-300">CRITICAL</span>
              </div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{compliance.summary.critical}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Immediate action required</p>
            </div>
          )}
          {compliance.summary.high > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 md:p-4 mobile-card-tight border-2 border-orange-200 dark:border-orange-800" data-testid="card-high-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span className="text-xs font-semibold text-orange-900 dark:text-orange-300">HIGH</span>
              </div>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{compliance.summary.high}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Requires prompt attention</p>
            </div>
          )}
          {compliance.summary.medium > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 md:p-4 mobile-card-tight border-2 border-yellow-200 dark:border-yellow-800" data-testid="card-medium-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-900 dark:text-yellow-300">MEDIUM</span>
              </div>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{compliance.summary.medium}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Review when possible</p>
            </div>
          )}
          {compliance.summary.low > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 md:p-4 mobile-card-tight border-2 border-gray-200 dark:border-gray-700" data-testid="card-low-issues">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-300">LOW</span>
              </div>
              <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{compliance.summary.low}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Monitor</p>
            </div>
          )}
        </div>

        {compliance.lastScan && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
            Last scan: {formatDistanceToNow(new Date(compliance.lastScan), { addSuffix: true })}
          </p>
        )}
      </div>
    </ResponsiveSection>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, platformRole, isLoading: accessLoading } = useWorkspaceAccess();
  const { showTransition, hideTransition } = useTransition();
  
  // Mobile detection for responsive UI
  const isMobile = useIsMobile();

  // Get current user and workspace
  const { data: workspace } = useQuery<{ id: string; name?: string; orgCode?: string }>({ 
    queryKey: queryKeys.workspace.current,
    queryFn: () => apiGet('workspace.current'),
  });
  const orgCode = workspace?.orgCode || 'N/A';

  // Fetch workspace health status (only when user has a workspace selected)
  const { data: workspaceHealth } = useQuery<WorkspaceHealth>({
    queryKey: queryKeys.workspace.health,
    queryFn: () => apiGet('workspace.getHealth'),
    enabled: isAuthenticated && !!user?.currentWorkspaceId,
  });

  // Fetch workspace stats with typed response
  const { data: stats } = useQuery<{
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
    queryKey: queryKeys.analytics.stats,
    queryFn: () => apiGet('analytics.getStats'),
    enabled: isAuthenticated,
  });

  // Fetch employees to determine user's workspace role
  const { data: allEmployees } = useQuery<any[]>({
    queryKey: queryKeys.employees.all,
    queryFn: () => apiGet('employees.list'),
    enabled: isAuthenticated,
  });

  // Determine current user's workspace role (fallback if hook not loaded)
  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const fallbackRole = currentEmployee?.workspaceRole || 'staff';
  
  // Use fallback employee-derived role while workspace access is loading
  const effectiveRole = accessLoading ? fallbackRole : workspaceRole;
  const effectiveTier = accessLoading ? 'free' : subscriptionTier;
  const effectivePlatformStaff = accessLoading ? false : isPlatformStaff;
  
  // Get role-specific accessible routes for quick actions
  const families = selectSidebarFamilies(effectiveRole, effectiveTier, effectivePlatformStaff);
  
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

  // DISABLED: Loading transition was blocking workspace access
  // The dashboard loads fast enough without a loading overlay
  // useEffect(() => {
  //   showTransition({
  //     status: "loading",
  //     message: "Loading Dashboard...",
  //     submessage: "Preparing your workspace",
  //     duration: 1500,
  //     onComplete: hideTransition
  //   });
  // }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
    // Redirect users without a workspace to onboarding choice page
    if (!isLoading && isAuthenticated && user && !user.currentWorkspaceId) {
      window.location.href = '/onboarding/start';
    }
  }, [isAuthenticated, isLoading, user]);

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
  
  // MULTI-TENANT FIX: Use workspace-scoped stats for regular users, platform-wide for staff
  // Platform staff (no workspace context) see summary stats, regular users see their workspace stats
  const isStaffViewer = isPlatformStaff && !stats?.workspace;
  const totalEmployees = isStaffViewer 
    ? (stats?.summary.activeEmployees || 0)
    : (stats?.workspace?.activeEmployees ?? 0);
  const totalClients = isStaffViewer
    ? (stats?.summary.totalCustomers || 0)
    : (stats?.workspace?.activeClients ?? 0);
  const totalRevenue = stats?.summary.monthlyRevenue?.amount || 0;
  // Regular users always have 1 organization (their own), platform staff see all
  const totalOrganizations = isStaffViewer 
    ? (stats?.summary.totalWorkspaces || 0)
    : 1;

  // Show loading overlay while dashboard data is loading
  const isLoadingDashboard = isLoading || accessLoading;

  // Get identity data for mobile display
  const { externalId, employeeId, supportCode, orgId, dbUserId, dbWorkspaceId, workspaceRole: identityWorkspaceRole } = useIdentity();
  
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

  // Mobile UI - simplified feature-card based dashboard
  if (isMobile) {
    const FeatureCard = ({ icon: Icon, label, href }: { icon: any; label: string; href: string }) => (
      <Link
        href={href}
        className="card rounded-2xl bg-white border-2 border-gray-200 shadow-sm flex flex-col justify-center items-center gap-2 hover-elevate active-elevate-2 transition p-3"
        data-testid={`card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div className="p-2 rounded-xl bg-blue-50 border-2 border-blue-200">
          <Icon className="w-5 h-5 text-blue-600" />
        </div>
        <div className="text-xs text-center px-2 leading-tight font-medium text-gray-900">
          {label}
        </div>
      </Link>
    );
    
    return (
      <WorkspaceLayout heroGradient>
        {isLoadingDashboard && <ResponsiveLoading />}
        
        <div className="pb-4">
          {/* Welcome Card */}
          <Card className="mb-4 bg-white/95 backdrop-blur-sm border-2 border-gray-200 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                {/* Avatar hidden on mobile to avoid duplicate (top-right menu already has it) */}
                <div className="hidden sm:flex w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 items-center justify-center text-white font-bold shadow-md">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm leading-tight text-gray-900" data-testid="text-welcome">
                    Welcome,
                  </CardTitle>
                  <p className="text-base font-bold leading-tight text-gray-900 mt-0.5" data-testid="text-user-name">
                    {displayName}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    {displayExternalId && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 border-blue-200 text-blue-700" data-testid="badge-external-id">
                        {displayExternalId}
                      </Badge>
                    )}
                    {displayRole && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-gray-100 text-gray-700" data-testid="badge-role">
                        {displayRole.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {orgId && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 border-blue-200 text-blue-700" data-testid="badge-org-id">
                        {orgId}
                      </Badge>
                    )}
                  </div>
                  <div className="w-full max-w-full min-w-0 overflow-x-auto mt-1 pb-1">
                    <div className="flex items-center gap-1.5 w-max">
                      {dbUserId && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 bg-purple-50 border-purple-200 text-purple-700 font-mono whitespace-nowrap" data-testid="badge-db-user-id" title={`Database User ID: ${dbUserId}`}>
                          UID: {dbUserId}
                        </Badge>
                      )}
                      {dbWorkspaceId && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 bg-green-50 border-green-200 text-green-700 font-mono whitespace-nowrap" data-testid="badge-db-workspace-id" title={`Database Workspace ID: ${dbWorkspaceId}`}>
                          WS: {dbWorkspaceId}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {workspace?.name && (
                    <p className="text-xs font-semibold text-blue-700 mt-2" data-testid="text-org-name">
                      {workspace.name}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-600 mt-1 break-all leading-tight" data-testid="text-email">
                    {user?.email || "Loading..."}
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Support & Communication */}
          <section className="rounded-2xl bg-white/95 backdrop-blur-sm border-2 border-gray-200 shadow-md p-4 mb-4">
            <div className="text-xs tracking-wide text-blue-600 font-semibold mb-3 uppercase">
              Support & Communication
            </div>
            <div className="grid gap-3 grid-cols-2">
              <FeatureCard icon={MessageCircle} label="Team Chat" href="/chatrooms" />
              <FeatureCard icon={HelpCircle} label="Get Help" href="/support" />
              <FeatureCard icon={Mail} label="Contact" href="/contact" />
              {isStaff && <FeatureCard icon={Shield} label="Admin" href="/support/console" />}
            </div>
          </section>

          {/* Platform Management */}
          <section className="rounded-2xl bg-white/95 backdrop-blur-sm border-2 border-gray-200 shadow-md p-4 mb-4">
            <div className="text-sm font-semibold mb-3 text-gray-900">
              Platform Management
            </div>
            <div className="grid gap-3 grid-cols-2">
              <FeatureCard icon={Calendar} label="Schedule" href="/schedule" />
              <FeatureCard icon={Clock} label="Time Tracking" href="/time-tracking" />
              <FeatureCard icon={MessageSquare} label="Chatrooms" href="/chatrooms" />
              <FeatureCard icon={Users} label="Employees" href="/employees" />
            </div>
          </section>

          {/* Core Features */}
          <section className="rounded-2xl bg-white/95 backdrop-blur-sm border-2 border-gray-200 shadow-md p-4 mb-20">
            <div className="text-sm font-semibold mb-3 text-gray-900">
              Core Features
            </div>
            <div className="grid gap-3 grid-cols-2">
              <FeatureCard icon={Users} label="Employees" href="/employees" />
              <FeatureCard icon={LayoutDashboard} label="Reports" href="/reports" />
              <FeatureCard icon={DollarSign} label="Billing" href="/billing" />
              <FeatureCard icon={Calendar} label="Clients" href="/clients" />
            </div>
          </section>
        </div>
      </WorkspaceLayout>
    );
  }

  // Desktop UI - full dashboard with detailed stats
  return (
    <WorkspaceLayout heroGradient maxWidth="6xl">
      {/* Show Trinity loading for initial auth check */}
      {isLoadingDashboard && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-4">
          <Suspense fallback={<div className="w-20 h-20" />}>
            <TrinityRedesign size={80} mode="THINKING" />
          </Suspense>
          <span className="text-muted-foreground">Loading dashboard...</span>
        </div>
      )}
        {/* Branded Header with Logo - Centered on Large Screens */}
        <ResponsiveSection spacing="lg">
          <div className="bg-card border border-border rounded-xl p-6 sm:p-8">
            <div className="flex flex-col items-center text-center gap-4">
              {/* Logo */}
              <div className="transform hover:scale-105 transition-transform duration-300">
                <CoAIleagueAFLogo variant="full" size="md" />
              </div>
              
              {/* Welcome Text - Centered */}
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-2 break-words" data-testid="text-welcome">
                  Welcome back, {firstName}
                </h2>
                
                {/* Organization Name */}
                {workspace?.name && (
                  <p className="text-lg sm:text-xl font-semibold text-primary mb-2" data-testid="text-org-name">
                    {workspace.name}
                  </p>
                )}
                
                {/* User Identity Badges */}
                <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                  {displayExternalId && (
                    <Badge variant="outline" className="text-xs px-2.5 py-0.5 bg-blue-50 border-blue-200 text-blue-700 font-medium" data-testid="badge-external-id">
                      {displayExternalId}
                    </Badge>
                  )}
                  {displayRole && (
                    <Badge variant="secondary" className="text-xs px-2.5 py-0.5 font-medium" data-testid="badge-role">
                      {displayRole.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {orgId && (
                    <Badge variant="outline" className="text-xs px-2.5 py-0.5 bg-blue-50 border-blue-200 text-blue-700 font-medium" data-testid="badge-org-id">
                      {orgId}
                    </Badge>
                  )}
                </div>
                <div className="w-full max-w-full min-w-0 overflow-x-auto mb-3 pb-1">
                  <div className="flex items-center justify-center gap-2 w-max mx-auto">
                    {dbUserId && (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-purple-50 border-purple-200 text-purple-700 font-mono whitespace-nowrap" data-testid="badge-db-user-id" title={`Database User ID: ${dbUserId}`}>
                        UID: {dbUserId}
                      </Badge>
                    )}
                    {dbWorkspaceId && (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-green-50 border-green-200 text-green-700 font-mono whitespace-nowrap" data-testid="badge-db-workspace-id" title={`Database Workspace ID: ${dbWorkspaceId}`}>
                        WS: {dbWorkspaceId}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
                  {workspaceRole === 'org_owner' ? 'Manage your entire workforce with CoAIleague' : 
                   workspaceRole === 'org_admin' ? 'Administer your organization' :
                   workspaceRole === 'department_manager' ? 'Oversee your team performance' :
                   workspaceRole === 'supervisor' ? 'Lead your team to success' :
                   workspaceRole === 'auditor' ? 'Audit financial, payroll, and compliance data' :
                   workspaceRole === 'contractor' ? 'Access your assigned projects and tasks' :
                   'Track your time and tasks'}
                </p>
              </div>
            </div>
          </div>
        </ResponsiveSection>

        {/* Pending Shift Approvals Banner */}
        <ResponsiveSection>
          <PendingApprovalsBanner />
        </ResponsiveSection>

        {/* Workspace Health Status - Simple visual indicator */}
        {workspaceHealth && (
          <ResponsiveSection>
          <div className={`rounded-xl border-2 p-6 ${
            workspaceHealth.status === 'green' ? 'bg-blue-50/50 border-blue-500/30' :
            workspaceHealth.status === 'yellow' ? 'bg-blue-100/50 border-blue-400/30' :
            'bg-red-50/50 border-red-500/30'
          }`} data-testid="workspace-health-status">
            <div className="flex items-start gap-4">
              {/* Traffic Light Indicator */}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 ${
                workspaceHealth.status === 'green' ? 'bg-blue-600' :
                workspaceHealth.status === 'yellow' ? 'bg-blue-400' :
                'bg-red-500'
              }`}>
                {workspaceHealth.status === 'green' && <CheckCircle className="w-8 h-8 text-white" />}
                {workspaceHealth.status === 'yellow' && <AlertCircle className="w-8 h-8 text-white" />}
                {workspaceHealth.status === 'red' && <XCircle className="w-8 h-8 text-white" />}
              </div>

              {/* Status Message */}
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2 text-foreground">
                  {workspaceHealth.status === 'green' && '✓ Everything Running Smoothly'}
                  {workspaceHealth.status === 'yellow' && '⚠ Action Recommended'}
                  {workspaceHealth.status === 'red' && '✗ Action Required'}
                </h3>
                <p className="text-foreground/80 mb-4">{workspaceHealth.message}</p>

                {/* Simple status grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-background/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Billing</p>
                    <p className="font-semibold text-sm">{workspaceHealth.billing.active ? '✓ Active' : '✗ Inactive'}</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">QuickBooks</p>
                    <p className="font-semibold text-sm">{workspaceHealth.integrations.quickbooks === 'connected' ? <><span className="text-green-600">✓</span> <span className="text-orange-500 font-mono">{workspaceHealth.integrations.quickbooksRealmId || 'Connected'}</span></> : '- Not Connected'}</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Gusto</p>
                    <p className="font-semibold text-sm">{workspaceHealth.integrations.gusto === 'connected' ? '✓ Connected' : '- Not Connected'}</p>
                  </div>
                </div>

                {/* Action button for yellow/red status */}
                {workspaceHealth.status !== 'green' && (
                  <div className="mt-4">
                    <Button
                      onClick={() => setLocation(workspaceHealth.billing.active ? '/integrations' : '/settings')}
                      variant="default"
                      size="sm"
                      data-testid="button-fix-health"
                    >
                      {workspaceHealth.billing.active ? 'Connect Integrations' : 'Update Billing'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          </ResponsiveSection>
        )}

        {/* Metrics Grid - Fortune 500 Compact Layout */}
        <ResponsiveSection>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mobile-compact-gap max-w-7xl mx-auto">
          {/* Workspace Metrics - Clickable cards navigate to management pages */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 mobile-compact-gap-sm">
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
              href="/usage"
            />
          </div>
          
          {/* Automation Credits */}
          <CreditBalanceCard />
        </div>
        </ResponsiveSection>

        {/* Automation Value Metrics - Only show for workspace scope (hidden in Simple Mode) */}
        <HideInSimpleMode>
        {stats?.automation && (
          <ResponsiveSection>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 from-blue-600 to-indigo-600 rounded-xl p-6 sm:p-8 mobile-compact-p text-white shadow-lg border-2 border-blue-500 border-blue-500">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold mb-2" data-testid="text-automation-title">Trinity™ Automation Value</h3>
                  <p className="text-blue-100 text-sm max-w-2xl">
                    Autonomous AI managing scheduling, billing, and payroll—saving your organization time and money 24/7
                  </p>
                  <div className="mt-2 text-xs text-blue-200 bg-blue-800/30 bg-blue-50 rounded px-2 py-1 inline-flex items-center gap-1.5" data-testid="text-automation-disclaimer">
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
                <div className="bg-white/10 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm" data-testid="card-hours-saved">
                  <p className="text-blue-100 text-xs mb-1">Hours Saved This Month</p>
                  <p className="text-3xl font-bold">{stats.automation.hoursSavedThisMonth.toFixed(1)}</p>
                  <p className="text-blue-200 text-xs mt-1">{stats.automation.hoursSavedAllTime.toFixed(0)} hrs all-time</p>
                </div>

                <div className="bg-white/10 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm" data-testid="card-cost-avoidance">
                  <p className="text-blue-100 text-xs mb-1">Cost Avoidance (Monthly)</p>
                  <p className="text-3xl font-bold">${stats.automation.costAvoidanceMonthly.toLocaleString()}</p>
                  <p className="text-blue-200 text-xs mt-1">${stats.automation.costAvoidanceTotal.toLocaleString()} total</p>
                </div>

                <div className="bg-white/10 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm" data-testid="card-ai-success">
                  <p className="text-blue-100 text-xs mb-1">AI Success Rate</p>
                  <p className="text-3xl font-bold">{(stats.automation.aiSuccessRate * 100).toFixed(1)}%</p>
                  <p className="text-blue-200 text-xs mt-1">Avg confidence: {(stats.automation.avgConfidenceScore * 100).toFixed(0)}%</p>
                </div>

                <div className="bg-white/10 rounded-lg p-4 md:p-4 mobile-card-compact backdrop-blur-sm" data-testid="card-auto-approval">
                  <p className="text-blue-100 text-xs mb-1">Auto-Approval Rate</p>
                  <p className="text-3xl font-bold">{(stats.automation.autoApprovalRate * 100).toFixed(1)}%</p>
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
                  <p className="text-2xl font-bold mb-1">{stats.automation.breakdown.scheduleOS.shiftsGenerated}</p>
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
                  <p className="text-2xl font-bold mb-1">{stats.automation.breakdown.billOS.invoicesGenerated}</p>
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
                  <p className="text-2xl font-bold mb-1">{stats.automation.breakdown.payrollOS.payrollsProcessed}</p>
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

        {/* Quick Actions Grid - Role-Based Dynamic Cards */}
        <ResponsiveSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mobile-grid-2 mobile-compact-gap">
          {/* Accessible quick actions */}
          {quickActions.map((route) => (
            <Link key={route.id} href={route.href}>
              <button className="w-full bg-card border border-border rounded-lg p-6 md:p-6 mobile-card-compact text-left hover-elevate active-elevate-2 transition-all duration-200 group" data-testid={`button-quick-${route.id}`}>
                <div className="p-3 bg-muted rounded-lg w-fit mb-4">
                  <route.icon className="w-8 h-8 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-bold text-foreground text-lg">{route.label}</h4>
                  {route.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{route.badge}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-3">{route.description}</p>
                <div className="flex items-center text-primary text-sm font-semibold">
                  Open <ArrowRight className="w-4 h-4 ml-1" />
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
                      className="w-full bg-card/30 border border-border/50 rounded-lg p-6 md:p-6 mobile-card-compact text-left opacity-60 cursor-not-allowed group" 
                      data-testid={`button-locked-${route.id}`}
                    >
                      <div className="p-3 bg-muted/50 rounded-lg w-fit mb-4 relative">
                        <route.icon className="w-8 h-8 text-muted-foreground" />
                        <div className="absolute -top-1 -right-1 bg-blue-500 bg-blue-500 rounded-full p-1">
                          <Lock className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-bold text-muted-foreground text-lg">{route.label}</h4>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-600 text-blue-600">
                          {route.badge}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground/80 mb-3">{route.description}</p>
                      <div className="flex items-center text-blue-600 text-blue-600 text-sm font-semibold">
                        Upgrade to unlock <ArrowRight className="w-4 h-4 ml-1" />
                      </div>
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium">{route.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{route.description}</p>
                  <p className="text-xs text-blue-600 text-blue-600 mt-2 font-semibold">
                    Requires {route.badge} plan to access
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
        </ResponsiveSection>

        {/* Organization Auditor Panel - Read-Only Financial, Payroll & Compliance Data */}
        {workspaceRole === 'auditor' && (
          <ResponsiveSection>
            <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 from-blue-50 to-blue-100 border-2 border-blue-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-600 bg-blue-600 rounded-lg">
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
                    <FileText className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Invoices</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access invoice records</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Payroll</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Review payroll data</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-teal-700 text-teal-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 text-teal-600 lg:text-center">Compliance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Audit compliance logs</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-slate-700 text-gray-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 text-gray-600 lg:text-center">Audit Logs</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access audit trail</p>
                </div>
              </div>

              {/* Auditor Access Notice */}
              <div className="bg-blue-50 bg-blue-50 border border-blue-200 border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 text-blue-900 lg:text-center">Auditor Access Level</p>
                    <p className="text-xs text-blue-700 text-blue-700 mt-1 lg:text-center">
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
        {platformRole === 'compliance_officer' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 from-blue-50 to-blue-100 border-2 border-blue-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-600 bg-blue-600 rounded-lg">
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
                    <Activity className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Compliance Heatmap</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform compliance status</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-4 h-4 text-teal-700 text-teal-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 text-teal-600 lg:text-center">AI Oversight</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Review</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">AI governance queue</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Policy Attestations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Audit</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Policy compliance tracking</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-slate-700 text-gray-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 text-gray-600 lg:text-center">Data Retention</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Configure</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Retention policies</p>
                </div>
              </div>

              {/* Platform Auditor Access Notice */}
              <div className="bg-blue-50 bg-blue-50 border border-blue-200 border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 text-blue-900 lg:text-center">Compliance Officer Access</p>
                    <p className="text-xs text-blue-700 text-blue-700 mt-1 lg:text-center">
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
        {platformRole === 'support_manager' && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 from-blue-50 to-blue-100 border-2 border-blue-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-600 bg-blue-600 rounded-lg">
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
                    <MessageCircle className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">All Conversations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">All support tickets</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Team Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Agent metrics & SLAs</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Escalations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Handle</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">High priority issues</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-slate-700 text-gray-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 text-gray-600 lg:text-center">Reports</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Generate</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Support analytics</p>
                </div>
              </div>

              {/* Support Manager Access Notice */}
              <div className="bg-blue-50 bg-blue-50 border border-blue-200 border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 text-blue-900 lg:text-center">Support Manager Access</p>
                    <p className="text-xs text-blue-700 text-blue-700 mt-1 lg:text-center">
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
        {platformRole === 'support_agent' && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 from-teal-50 to-cyan-50 border-2 border-teal-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-teal-600 bg-teal-600 rounded-lg">
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
                    <MessageCircle className="w-4 h-4 text-teal-700 text-teal-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 text-teal-600 lg:text-center">My Queue</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Assigned conversations</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Response Time</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Track</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">SLA compliance</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Resolved Today</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Count</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Tickets closed</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-slate-700 text-gray-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 text-gray-600 lg:text-center">Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">My metrics</p>
                </div>
              </div>

              {/* Support Agent Access Notice */}
              <div className="bg-teal-50 bg-teal-50 border border-teal-200 border-teal-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-teal-600 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-teal-900 text-teal-900 lg:text-center">Support Agent Access</p>
                    <p className="text-xs text-teal-700 text-teal-700 mt-1 lg:text-center">
                      You can view your assigned conversation queue, respond to customer tickets, 
                      monitor your response times, and track your performance metrics.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Root Admin Panel - Full Platform Control */}
        {platformRole === 'root_admin' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-red-50 to-orange-50 from-red-50 to-orange-50 border-2 border-red-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-red-600 bg-red-600 rounded-lg">
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
                    <Settings className="w-4 h-4 text-red-700 text-red-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700 text-red-600 lg:text-center">System Config</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform settings</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-fuchsia-700 text-fuchsia-700" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700 text-fuchsia-700 lg:text-center">All Workspaces</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Oversee</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform-wide data</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-violet-700 text-blue-600 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 text-blue-600 text-blue-600 lg:text-center">System Health</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Infrastructure status</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-slate-700 text-gray-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 text-gray-600 lg:text-center">Security</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Control</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access & permissions</p>
                </div>
              </div>

              {/* Root Admin Access Notice */}
              <div className="bg-purple-50950/20 border border-purple-200800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-purple-600 text-blue-600 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-purple-900100 lg:text-center">Root Administrator Access</p>
                    <p className="text-xs text-purple-700300 mt-1 lg:text-center">
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
        {platformRole === 'deputy_admin' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50950/20950/20 border-2 border-indigo-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-600700 rounded-lg">
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
                    <Users className="w-4 h-4 text-indigo-700300" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700300 lg:text-center">User Management</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform users</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-violet-700 text-blue-600 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 text-blue-600 text-blue-600 lg:text-center">Workspace Support</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Assist</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Customer success</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Reports</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Generate</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform analytics</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings className="w-4 h-4 text-slate-700 text-gray-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 text-gray-600 lg:text-center">Configuration</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Assist</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">System setup</p>
                </div>
              </div>

              {/* Deputy Admin Access Notice */}
              <div className="bg-indigo-50950/20 border border-indigo-200800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-indigo-600400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-indigo-900100 lg:text-center">Deputy Administrator Access</p>
                    <p className="text-xs text-indigo-700 mt-1 lg:text-center">
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
        {platformRole === 'sysop' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-slate-50 to-zinc-50 from-white/20 to-blue-50 border-2 border-slate-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-slate-600 bg-white rounded-lg">
                  <Server className="w-6 h-6 text-white" />
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
                    <Server className="w-4 h-4 text-slate-700 text-gray-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 text-gray-600 lg:text-center">Infrastructure</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Server health</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-zinc-700400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700400 lg:text-center">Databases</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Maintain</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">DB operations</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-blue-700 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 text-blue-600 lg:text-center">Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Optimize</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">System metrics</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-700 text-red-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700 text-red-600 lg:text-center">Incidents</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Respond</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Emergency support</p>
                </div>
              </div>

              {/* SysOp Access Notice */}
              <div className="bg-slate-50950/20 border border-slate-200 border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-slate-600 text-gray-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900100 lg:text-center">System Operations Access</p>
                    <p className="text-xs text-slate-700300 mt-1 lg:text-center">
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

        {/* Quick Actions Section - Replaces redundant Notification Center (use UNS popover instead) */}
        <ResponsiveSection>
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  Quick Actions
                </h3>
                <p className="text-sm text-muted-foreground">
                  Common tasks and shortcuts for your workspace
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Link href="/schedule">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-schedule">
                <Calendar className="w-8 h-8 text-blue-500 mb-3" />
                <p className="font-medium text-foreground">View Schedule</p>
                <p className="text-xs text-muted-foreground mt-1">Check your upcoming shifts</p>
              </div>
            </Link>

            <Link href="/time-tracking">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-time">
                <Clock className="w-8 h-8 text-green-500 mb-3" />
                <p className="font-medium text-foreground">Time Tracking</p>
                <p className="text-xs text-muted-foreground mt-1">Clock in/out and view hours</p>
              </div>
            </Link>

            <Link href="/pto">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-pto">
                <FileText className="w-8 h-8 text-purple-500 mb-3" />
                <p className="font-medium text-foreground">Request Time Off</p>
                <p className="text-xs text-muted-foreground mt-1">Submit PTO requests</p>
              </div>
            </Link>

            <Link href="/inbox">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-inbox">
                <Mail className="w-8 h-8 text-orange-500 mb-3" />
                <p className="font-medium text-foreground">Inbox</p>
                <p className="text-xs text-muted-foreground mt-1">Check internal messages</p>
              </div>
            </Link>

            <Link href="/chatrooms">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-chat">
                <MessageSquare className="w-8 h-8 text-cyan-500 mb-3" />
                <p className="font-medium text-foreground">Chatrooms</p>
                <p className="text-xs text-muted-foreground mt-1">Team conversations</p>
              </div>
            </Link>

            <Link href="/documents">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-docs">
                <FileText className="w-8 h-8 text-amber-500 mb-3" />
                <p className="font-medium text-foreground">Documents</p>
                <p className="text-xs text-muted-foreground mt-1">View assigned documents</p>
              </div>
            </Link>

            <Link href="/profile">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-profile">
                <UserCog className="w-8 h-8 text-indigo-500 mb-3" />
                <p className="font-medium text-foreground">My Profile</p>
                <p className="text-xs text-muted-foreground mt-1">Update your information</p>
              </div>
            </Link>

            <Link href="/help">
              <div className="bg-muted/30 hover-elevate border border-border rounded-lg p-4 cursor-pointer transition-all" data-testid="quick-action-help">
                <HelpCircle className="w-8 h-8 text-rose-500 mb-3" />
                <p className="font-medium text-foreground">Get Help</p>
                <p className="text-xs text-muted-foreground mt-1">Support and FAQs</p>
              </div>
            </Link>
          </div>

          <div className="mt-6 p-4 bg-muted/20 rounded-lg border border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bell className="w-4 h-4" />
              <span>For notifications, use the bell icon in the top navigation bar</span>
            </div>
          </div>
        </div>
        </ResponsiveSection>
    </WorkspaceLayout>
  );
}
