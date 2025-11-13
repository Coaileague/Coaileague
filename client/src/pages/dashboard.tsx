import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies, type OSModuleRoute } from "@/lib/osModules";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Users, Activity, DollarSign, 
  FileText, Calendar, Clock, ArrowRight,
  Bell, Trash2, CheckCircle, XCircle, AlertCircle, Mail, Lock,
  Shield, UserCog, Server, Database, MessageCircle, Settings
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { useTransition } from "@/contexts/transition-context";
import { MobileLoading } from "@/components/mobile-loading";
import { useLoadingManager } from "@/contexts/loading-manager";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Notification {
  id: string;
  type: 'shift_assigned' | 'shift_changed' | 'shift_removed' | 'pto_approved' | 'pto_denied' | 'profile_updated' | 'document_assigned' | 'policy_acknowledgment' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  actionUrl?: string;
}

interface WorkspaceHealth {
  status: 'green' | 'yellow' | 'red';
  message: string;
  billing: { status: string; active: boolean };
  integrations: { quickbooks: string; gusto: string };
  automations: { invoicing: boolean; payroll: boolean; scheduling: boolean };
  safeToRun: boolean;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, platformRole, isLoading: accessLoading } = useWorkspaceAccess();
  const { showTransition, hideTransition } = useTransition();
  const { beginLoading, endLoading } = useLoadingManager();
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Get current user and workspace
  const { data: currentUser } = useQuery<{ id: string; email?: string }>({ 
    queryKey: ['/api/auth/me'] 
  });
  const userId = currentUser?.id;
  
  const { data: workspace } = useQuery<{ id: string; name?: string }>({ 
    queryKey: ['/api/workspace'] 
  });
  const workspaceId = workspace?.id;

  // Fetch workspace health status
  const { data: workspaceHealth } = useQuery<WorkspaceHealth>({
    queryKey: ['/api/workspace/health'],
    enabled: isAuthenticated,
  });

  // Connect to notification WebSocket for real-time updates
  const { unreadCount: wsUnreadCount, isConnected } = useNotificationWebSocket(userId, workspaceId);

  // Fetch notifications
  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    enabled: isAuthenticated,
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
  }>({
    queryKey: ['/api/analytics/stats'],
    enabled: isAuthenticated,
  });

  // Fetch employees to determine user's workspace role
  const { data: allEmployees } = useQuery<any[]>({
    queryKey: ['/api/employees'],
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
  const accessibleRoutes: OSModuleRoute[] = [];
  const lockedRoutes: OSModuleRoute[] = [];
  
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

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const loadingId = beginLoading({ scenario: 'dataSync' });
      try {
        return await apiRequest(`/api/notifications/${id}/read`, 'PATCH');
      } finally {
        endLoading(loadingId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Delete notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const loadingId = beginLoading({ scenario: 'dataSync' });
      try {
        return await apiRequest(`/api/notifications/${id}`, 'DELETE');
      } finally {
        endLoading(loadingId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const loadingId = beginLoading({ scenario: 'dataSync' });
      try {
        return await apiRequest('/api/notifications/mark-all-read', 'POST');
      } finally {
        endLoading(loadingId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Show loading transition on mount
  useEffect(() => {
    showTransition({
      status: "loading",
      message: "Loading Dashboard...",
      submessage: "Preparing your workspace",
      duration: 1500,
      onComplete: hideTransition
    });
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/api/login';
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    return <MobileLoading fullScreen message="Loading Dashboard..." />;
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const totalEmployees = stats?.summary.activeEmployees || 0;
  const activeToday = allEmployees?.filter((emp: any) => emp.status === 'active').length || 0;
  const totalRevenue = stats?.summary.monthlyRevenue.amount || 0;

  // Use WebSocket unread count if available
  const unreadCount = isConnected && wsUnreadCount !== undefined 
    ? wsUnreadCount 
    : notifications.filter((n) => !n.isRead).length;

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    if (notificationFilter === 'unread') return !n.isRead;
    if (notificationFilter === 'read') return n.isRead;
    return true;
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'shift_assigned':
      case 'shift_changed':
        return <Calendar className="h-5 w-5 text-accent" />;
      case 'shift_removed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'pto_approved':
        return <CheckCircle className="h-5 w-5 text-primary" />;
      case 'pto_denied':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'profile_updated':
        return <Users className="h-5 w-5 text-accent" />;
      case 'document_assigned':
        return <FileText className="h-5 w-5 text-primary" />;
      case 'policy_acknowledgment':
        return <AlertCircle className="h-5 w-5 text-secondary" />;
      case 'system':
        return <Bell className="h-5 w-5 text-primary" />;
      default:
        return <Mail className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getNotificationTypeBadge = (type: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      shift_assigned: { label: 'Shift', className: 'bg-accent/20 text-accent border-accent/30' },
      shift_changed: { label: 'Schedule', className: 'bg-secondary/20 text-secondary border-secondary/30' },
      shift_removed: { label: 'Shift', className: 'bg-destructive/20 text-destructive border-destructive/30' },
      pto_approved: { label: 'PTO', className: 'bg-primary/20 text-primary border-primary/30' },
      pto_denied: { label: 'PTO', className: 'bg-destructive/20 text-destructive border-destructive/30' },
      profile_updated: { label: 'Profile', className: 'bg-accent/20 text-accent border-accent/30' },
      document_assigned: { label: 'Document', className: 'bg-primary/20 text-primary border-primary/30' },
      policy_acknowledgment: { label: 'Policy', className: 'bg-secondary/20 text-secondary border-secondary/30' },
      system: { label: 'System', className: 'bg-primary/20 text-primary border-primary/30' },
    };
    const badge = badges[type] || { label: 'Info', className: 'bg-muted/20 text-muted-foreground border-muted/30' };
    return <Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>;
  };

  // Show loading overlay while dashboard data is loading
  const isLoadingDashboard = isLoading || accessLoading;

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden w-full max-w-full">
      {/* Show mobile loading for initial auth check */}
      {isLoadingDashboard && <MobileLoading />}
      
      {/* Professional subtle background - NO bright glowing orbs */}

      <div className="relative z-10 mobile-safe-container max-w-7xl mx-auto">
        {/* Branded Header with Logo - Centered on Desktop */}
        <div className="mb-8">
          <div className="bg-card border border-border rounded-xl p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              {/* Logo and Title - Centered on Large Screens */}
              <div className="flex items-start gap-3 lg:col-start-2 lg:flex-col lg:items-center lg:text-center">
                <div className="transform hover:scale-105 transition-transform duration-300">
                  <AnimatedAutoForceLogo variant="full" size="md" />
                </div>
                <div>
                  <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-1 break-words" data-testid="text-welcome">
                    Welcome back, {firstName}
                  </h2>
                  <p className="text-muted-foreground text-sm sm:text-base">
                    {workspaceRole === 'org_owner' ? 'Manage your entire workforce with AutoForce™' : 
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
          </div>
        </div>

        {/* Workspace Health Status - Simple visual indicator */}
        {workspaceHealth && (
          <div className={`mb-8 rounded-xl border-2 p-6 ${
            workspaceHealth.status === 'green' ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/30' :
            workspaceHealth.status === 'yellow' ? 'bg-blue-100/50 dark:bg-blue-900/20 border-blue-400/30' :
            'bg-red-50/50 dark:bg-red-950/20 border-red-500/30'
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
                    <p className="font-semibold text-sm">{workspaceHealth.integrations.quickbooks === 'connected' ? '✓ Connected' : '- Not Connected'}</p>
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
        )}

        {/* Metrics Grid - Professional Cards (NO glow effects) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Total Employees Card */}
          <div className="group bg-card border border-border rounded-lg p-6 hover-elevate active-elevate-2 transition-all duration-200" data-testid="card-employees">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-muted rounded-lg">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-muted-foreground text-sm mb-2">Total Employees</p>
            <p className="text-4xl font-bold text-foreground">{totalEmployees}</p>
          </div>

          {/* Active Today Card */}
          <div className="group bg-card border border-border rounded-lg p-6 hover-elevate active-elevate-2 transition-all duration-200" data-testid="card-active">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-muted rounded-lg">
                <Activity className="w-6 h-6 text-accent" />
              </div>
            </div>
            <p className="text-muted-foreground text-sm mb-2">Active Today</p>
            <p className="text-4xl font-bold text-foreground">{activeToday}</p>
          </div>

          {/* Revenue Card */}
          <div className="group bg-card border border-border rounded-lg p-6 hover-elevate active-elevate-2 transition-all duration-200" data-testid="card-revenue">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-muted rounded-lg">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-muted-foreground text-sm mb-2">Total Revenue</p>
            <p className="text-4xl font-bold text-foreground">
              ${totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(1)}K` : totalRevenue.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Quick Actions Grid - Role-Based Dynamic Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Accessible quick actions */}
          {quickActions.map((route) => (
            <Link key={route.id} href={route.href}>
              <button className="w-full bg-card border border-border rounded-lg p-6 text-left hover-elevate active-elevate-2 transition-all duration-200 group" data-testid={`button-quick-${route.id}`}>
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
                      className="w-full bg-card/30 border border-border/50 rounded-lg p-6 text-left opacity-60 cursor-not-allowed group" 
                      data-testid={`button-locked-${route.id}`}
                    >
                      <div className="p-3 bg-muted/50 rounded-lg w-fit mb-4 relative">
                        <route.icon className="w-8 h-8 text-muted-foreground" />
                        <div className="absolute -top-1 -right-1 bg-blue-500 dark:bg-blue-600 rounded-full p-1">
                          <Lock className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-bold text-muted-foreground text-lg">{route.label}</h4>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-600 dark:text-blue-400">
                          {route.badge}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground/80 mb-3">{route.description}</p>
                      <div className="flex items-center text-blue-600 dark:text-blue-400 text-sm font-semibold">
                        Upgrade to unlock <ArrowRight className="w-4 h-4 ml-1" />
                      </div>
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium">{route.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{route.description}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-semibold">
                    Requires {route.badge} plan to access
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Organization Auditor Panel - Read-Only Financial, Payroll & Compliance Data */}
        {workspaceRole === 'auditor' && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-950/20 dark:to-cyan-950/20 border-2 border-emerald-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-600 dark:bg-emerald-700 rounded-lg">
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
                    <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 lg:text-center">Invoices</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access invoice records</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400 lg:text-center">Payroll</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Review payroll data</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400 lg:text-center">Compliance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Audit compliance logs</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 lg:text-center">Audit Logs</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View Only</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access audit trail</p>
                </div>
              </div>

              {/* Auditor Access Notice */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
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
        )}

        {/* Platform Auditor / Compliance Officer Panel - Platform-Wide Compliance Oversight */}
        {platformRole === 'compliance_officer' && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-950/20 dark:to-teal-950/20 border-2 border-cyan-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-cyan-600 dark:bg-cyan-700 rounded-lg">
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
                    <Activity className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400 lg:text-center">Compliance Heatmap</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform compliance status</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400 lg:text-center">AI Oversight</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Review</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">AI governance queue</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 lg:text-center">Policy Attestations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Audit</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Policy compliance tracking</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 lg:text-center">Data Retention</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Configure</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Retention policies</p>
                </div>
              </div>

              {/* Platform Auditor Access Notice */}
              <div className="bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100 lg:text-center">Compliance Officer Access</p>
                    <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-1 lg:text-center">
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
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-2 border-blue-500/30 rounded-xl p-6">
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
                    <MessageCircle className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 lg:text-center">All Conversations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">All support tickets</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400 lg:text-center">Team Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Agent metrics & SLAs</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-4 h-4 text-violet-700 dark:text-violet-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400 lg:text-center">Escalations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Handle</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">High priority issues</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 lg:text-center">Reports</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Generate</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Support analytics</p>
                </div>
              </div>

              {/* Support Manager Access Notice */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
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
        {platformRole === 'support_agent' && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20 border-2 border-teal-500/30 rounded-xl p-6">
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
                    <MessageCircle className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400 lg:text-center">My Queue</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">View</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Assigned conversations</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400 lg:text-center">Response Time</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Track</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">SLA compliance</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 lg:text-center">Resolved Today</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Count</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Tickets closed</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 lg:text-center">Performance</p>
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

        {/* Root Admin Panel - Full Platform Control */}
        {platformRole === 'root_admin' && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-950/20 dark:to-fuchsia-950/20 border-2 border-purple-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-purple-600 dark:bg-purple-700 rounded-lg">
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
                    <Settings className="w-4 h-4 text-purple-700 dark:text-purple-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400 lg:text-center">System Config</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform settings</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-fuchsia-700 dark:text-fuchsia-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-400 lg:text-center">All Workspaces</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Oversee</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform-wide data</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-violet-700 dark:text-violet-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400 lg:text-center">System Health</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Infrastructure status</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 lg:text-center">Security</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Control</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Access & permissions</p>
                </div>
              </div>

              {/* Root Admin Access Notice */}
              <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 lg:text-center">Root Administrator Access</p>
                    <p className="text-xs text-purple-700 dark:text-purple-300 mt-1 lg:text-center">
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
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20 border-2 border-indigo-500/30 rounded-xl p-6">
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
                    <Users className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400 lg:text-center">User Management</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Manage</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform users</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-violet-700 dark:text-violet-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400 lg:text-center">Workspace Support</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Assist</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Customer success</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400 lg:text-center">Reports</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Generate</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Platform analytics</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 lg:text-center">Configuration</p>
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
        {platformRole === 'sysop' && (
          <div className="mb-8 space-y-6">
            <div className="bg-gradient-to-br from-slate-50 to-zinc-50 dark:from-slate-950/20 dark:to-zinc-950/20 border-2 border-slate-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-slate-600 dark:bg-slate-700 rounded-lg">
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
                    <Server className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400 lg:text-center">Infrastructure</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Server health</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-zinc-700 dark:text-zinc-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-400 lg:text-center">Databases</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Maintain</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">DB operations</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 lg:text-center">Performance</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Optimize</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">System metrics</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 lg:text-center">Incidents</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground lg:text-center">Respond</p>
                  <p className="text-xs text-muted-foreground mt-1 lg:text-center">Emergency support</p>
                </div>
              </div>

              {/* SysOp Access Notice */}
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 lg:text-center">System Operations Access</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 lg:text-center">
                      You can monitor infrastructure health, maintain databases, optimize performance metrics, 
                      and respond to system incidents.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notification Center Section - Professional Style */}
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8">
          {/* Notification Center Header */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <Bell className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  Notification Center
                  {isConnected && (
                    <span className="h-2 w-2 bg-primary rounded-full" title="Live updates active" />
                  )}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Stay updated on your shifts, PTO, and important platform changes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Unread:</span>
              <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 text-sm font-bold text-foreground bg-muted rounded-full">
                {unreadCount}
              </span>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <Button
              variant={notificationFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNotificationFilter('all')}
              data-testid="button-filter-all"
            >
              All ({notifications.length})
            </Button>
            <Button
              variant={notificationFilter === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNotificationFilter('unread')}
              data-testid="button-filter-unread"
            >
              Unread ({unreadCount})
            </Button>
            <Button
              variant={notificationFilter === 'read' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNotificationFilter('read')}
              className={notificationFilter === 'read' ? 'bg-muted/30 ' : ''}
              data-testid="button-filter-read"
            >
              Read ({notifications.length - unreadCount})
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                className="ml-auto text-primary hover:text-primary"
                data-testid="button-mark-all-read"
              >
                Mark all as read
              </Button>
            )}
          </div>

          {/* Notification Table */}
          <div className="overflow-x-auto">
            {notificationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary/80"></div>
                <span className="ml-3 text-slate-400">Loading notifications...</span>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Bell className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-semibold">All caught up!</p>
                <p className="text-sm mt-1">
                  {notificationFilter === 'unread' 
                    ? 'You have no unread notifications.' 
                    : notificationFilter === 'read'
                    ? 'You have no read notifications.'
                    : 'You have no notifications yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`backdrop-blur-xl border rounded-2xl p-4 transition-all duration-300 hover:scale-[1.01] ${
                      notification.isRead
                        ? 'bg-white/5 border-white/10'
                        : 'bg-muted/10 border-primary/30 shadow-lg shadow-primary/10'
                    }`}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="mt-1 shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-white text-sm">
                              {notification.title}
                            </h4>
                            {getNotificationTypeBadge(notification.type)}
                          </div>
                          {!notification.isRead && (
                            <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-slate-300 mb-2 break-words">
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          className={`h-9 w-9 p-0 ${
                            notification.isRead
                              ? 'text-slate-400 hover:text-primary'
                              : 'text-primary hover:text-primary'
                          }`}
                          title={notification.isRead ? 'Mark as unread' : 'Mark as read'}
                          data-testid={`button-toggle-read-${notification.id}`}
                        >
                          <CheckCircle className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNotificationMutation.mutate(notification.id)}
                          className="h-9 w-9 p-0 text-slate-400 hover:text-red-400"
                          title="Delete notification"
                          data-testid={`button-delete-${notification.id}`}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
