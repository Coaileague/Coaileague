// Multi-tenant SaaS Scheduling Platform

import { Switch, Route, useLocation, Link } from "wouter";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { GraduationCap, Settings2, Search, Menu, Sparkles, LogOut, User, Bell } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeProvider as WorkspaceThemeProvider } from "@/contexts/ThemeContext";
import { OverlayControllerProvider } from "@/contexts/overlay-controller";
import { UniversalLoadingGateProvider } from "@/contexts/universal-loading-gate";
import { TransitionProvider } from "@/contexts/transition-context";
import { LoadingProvider } from "@/contexts/loading-context";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/protected-route";
import { LeaderRoute } from "@/components/leader-route";
import { PlatformAdminRoute } from "@/components/platform-admin-route";
import { DemoBanner } from "@/components/demo-banner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorBoundary } from "@/components/errors/GlobalErrorBoundary";
import { ServiceHealthProvider } from "@/contexts/ServiceHealthContext";
import { CommandPalette } from "@/components/command-palette";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile, ResponsiveAppFrame } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { performLogout } from "@/lib/logoutHandler";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";
import { LoadingScreen } from "@/components/LoadingScreen";
import { CoAIleagueLogo } from "@/components/coailleague-logo";
import NotFound from "@/pages/not-found";
// import Landing from "@/pages/landing";
import Homepage from "@/pages/homepage";
import CustomLogin from "@/pages/custom-login";
import CustomRegister from "@/pages/custom-register";
import UniversalMarketing from "@/pages/universal-marketing";
import Contact from "@/pages/contact";
import Support from "@/pages/support";
import TermsOfService from "@/pages/terms-of-service";
import PrivacyPolicy from "@/pages/privacy-policy";
import Dashboard from "@/pages/dashboard";
import { Redirect } from "wouter";
import UniversalSchedule from "@/pages/universal-schedule";
import DailySchedule from "@/pages/daily-schedule";
import ScheduleMobileFirst from "@/pages/schedule-mobile-first";
import WorkspaceSales from "@/pages/workspace-sales";
import TimeTracking from "@/pages/time-tracking";
import Employees from "@/pages/employees";
import Clients from "@/pages/clients";
import Invoices from "@/pages/invoices";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import AlertSettings from "@/pages/alert-settings";
import Reports from "@/pages/reports";
import OnboardingPage from "@/pages/onboarding";
import HiringWorkflowBuilder from "@/pages/hireos-workflow-builder";
import EmployeeFileCabinet from "@/pages/employee-file-cabinet";
import EmployeeProfile from "@/pages/employee-profile";
import AdminUsage from "@/pages/admin-usage";
import AdminCommandCenter from "@/pages/admin-command-center";
import AdminCustomForms from "@/pages/admin-custom-forms";
import PlatformAdmin from "@/pages/platform-admin";
import RootAdminPortal from "@/pages/root-admin-portal";
import RootAdminDashboard from "@/pages/root-admin-dashboard";
import PlatformUsers from "@/pages/platform-users";
import EmployeePortal from "@/pages/employee-portal";
import AuditorPortal from "@/pages/auditor-portal";
import ClientPortal from "@/pages/client-portal";
import Workspace from "@/pages/workspace";
import Billing from "@/pages/billing";
import UsageDashboard from "@/pages/usage-dashboard";
import HRBenefits from "@/pages/hr-benefits";
import HRReviews from "@/pages/hr-reviews";
import HRPTO from "@/pages/hr-pto";
import HRTerminations from "@/pages/hr-terminations";
import HelpDesk from "@/pages/HelpDesk";
// import SalesPortal from "@/pages/sales-portal";
import LogoShowcase from "@/pages/logo-showcase";
import Chatrooms from "@/pages/chatrooms";
import PayrollDashboard from "@/pages/payroll-dashboard";
import HelpAIOrchestration from "@/pages/helpai-orchestration";
import MyPaychecks from "@/pages/my-paychecks";
import LeadersHub from "@/pages/leaders-hub";
import EngagementDashboard from "@/pages/engagement-dashboard";
import EmployeeEngagement from "@/pages/engagement-employee";
import AnalyticsReportsPage from "@/pages/analytics-reports";
import Disputes from "@/pages/disputes";
import MyAuditRecord from "@/pages/my-audit-record";
import FileGrievance from "@/pages/file-grievance";
import ReviewDisputes from "@/pages/review-disputes";
import PayrollDeductions from "@/pages/payroll-deductions";
import PayrollGarnishments from "@/pages/payroll-garnishments";
import AICommunications from "@/pages/comm-os";
import AICommunicationsOnboarding from "@/pages/comm-os-onboarding";
import AIDiagnostics from "@/pages/query-os";
import PrivateMessages from "@/pages/private-messages";
import AITraining from "@/pages/training-os";
import AIBudgeting from "@/pages/budget-os";
import AIIntegrations from "@/pages/integration-os";
import AIRecords from "@/pages/record-os";
import AIAnalytics from "@/pages/insight-os";
import CommunicationFamilyPage from "@/pages/os-family-communication";
import OperationsFamilyPage from "@/pages/os-family-operations";
import GrowthFamilyPage from "@/pages/os-family-growth";
import PlatformFamilyPage from "@/pages/os-family-platform";
import Profile from "@/pages/profile";
import Unavailability from "@/pages/unavailability";
import AvailabilityPage from "@/pages/availability";
import CreateOrg from "@/pages/create-org";
import Updates from "@/pages/updates";
import Help from "@/pages/help";
import CompanyReports from "./pages/company-reports";
import PayInvoice from "@/pages/pay-invoice";
import Expenses from "@/pages/expenses";
import ExpenseApprovals from "@/pages/expense-approvals";
import I9Compliance from "@/pages/i9-compliance";
import Policies from "@/pages/policies";
import RoleManagement from "@/pages/role-management";
import ManagerDashboard from "@/pages/manager-dashboard";
import PendingTimeEntries from "@/pages/pending-time-entries";
import TimesheetApprovals from "@/pages/timesheet-approvals";
import Error403 from "@/pages/error-403";
import Error404 from "@/pages/error-404";
import Error500 from "@/pages/error-500";
import IntegrationsPage from "@/pages/integrations-page";
import OversightHub from "@/pages/oversight-hub";
import WorkflowApprovals from "@/pages/workflow-approvals";
import AICommandCenter from "@/pages/ai-command-center";
import SupportCommandConsole from "@/pages/support-command-console";
import AuditLogs from "@/pages/audit-logs";
import AutomationControl from "@/pages/automation-control";
import AdminBanners from "@/pages/admin-banners";
import AdminTicketReviews from "@/pages/admin-ticket-reviews";
import AutomationAuditLog from "@/pages/automation-audit-log";
import AutomationSettings from "@/pages/automation-settings";
import AIBrainDashboard from "@/pages/ai-brain-dashboard";
import SystemHealth from "@/pages/system-health";
import { FloatingSupportChat } from "@/components/floating-support-chat";
import { ReenableChatButton } from "@/components/reenable-chat-button";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { HeaderBillboard } from "@/components/header-billboard";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { WhatsNewBadge } from "@/components/whats-new-badge";
import { NotificationsCenter } from "@/components/notifications-center";
import { WorkspaceTabsNav } from "@/components/workspace-tabs-nav";

// Compact top-right utility cluster - Fortune 500 aesthetic
function AppUtilityCluster({ setLocation }: any) {
  return (
    <div className="fixed top-3 right-4 z-50 flex items-center gap-2 bg-background/95 backdrop-blur-xl border rounded-lg shadow-sm px-3 py-2 max-w-[320px]">
      {/* Workspace Info */}
      <WorkspaceSwitcher />
      
      {/* Settings Gear - Always goes to /settings, no admin redirect */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/settings')}
            data-testid="button-settings-gear"
            className="h-8 w-8 shrink-0"
          >
            <Settings2 className="h-4 w-4 text-primary" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Settings</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const isMobile = useIsMobile();

  // Check if on mobile chat, HelpDesk, or desktop live-chat - use window.location instead of useLocation() hook
  // to avoid React Hooks issues with conditional rendering
  const isMobileChat = window.location.pathname === '/mobile-chat';
  const isHelpDesk = window.location.pathname === '/chat' || window.location.pathname.startsWith('/chat');
  
  // CRITICAL: Public routes that should render IMMEDIATELY without waiting for auth loading
  const PUBLIC_ROUTES = new Set([
    "/",
    "/login",
    "/register",
    "/pricing",
    "/contact",
    "/support",
    "/terms",
    "/privacy",
    "/chat",
    "/mobile-chat",
    "/live-chat",
    "/helpdesk5",
    "/support/chat",
    "/logo-showcase",
    "/error-403",
    "/error-404",
    "/error-500",
  ]);
  
  const currentPath = window.location.pathname;
  const isPublicRoute = PUBLIC_ROUTES.has(currentPath) || 
                        currentPath.startsWith("/onboarding/") ||
                        currentPath.startsWith("/pay-invoice/");

  // CRITICAL: If on public route, render immediately without waiting for auth to load
  // This prevents loading screens from appearing on public pages
  if (isPublicRoute) {
    return (
      <Switch>
        <Route path="/" component={Homepage} />
        <Route path="/login" component={CustomLogin} />
        <Route path="/register" component={CustomRegister} />
        <Route path="/pricing" component={UniversalMarketing} />
        <Route path="/contact" component={Contact} />
        <Route path="/support" component={Support} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/privacy" component={PrivacyPolicy} />
        {/* Consolidated chat routes - ONE UNIVERSAL CHAT */}
        <Route path="/chat" component={HelpDesk} /> {/* Universal responsive chat with Gemini AI (works on desktop + mobile) */}
        <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
        <Route path="/live-chat"><Redirect to="/chat" /></Route>
        
        <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
        <Route path="/support/chat"><Redirect to="/chat" /></Route>
        <Route path="/logo-showcase" component={LogoShowcase} />
        <Route path="/onboarding/:token" component={OnboardingPage} />
        <Route path="/pay-invoice/:id" component={PayInvoice} />
        
        {/* Error pages */}
        <Route path="/error-403" component={Error403} />
        <Route path="/error-404" component={Error404} />
        <Route path="/error-500" component={Error500} />
        
        <Route component={Homepage} />
      </Switch>
    );
  }

  // Check if user is Root Admin (platform-level access)
  const isRootAdmin = (user as any)?.platformRole === 'root_admin' || (user as any)?.platformRole === 'sysop';
  
  // Expose tutorial function globally for sidebar access
  (window as any).setShowOnboarding = setShowOnboarding;

  // Sidebar width configuration
  const sidebarStyle = {
    "--sidebar-width": "16rem",       // 256px default
    "--sidebar-width-icon": "3.5rem", // 56px collapsed (matches old peek rail)
  };

  // Render mobile layout (NO Sidebar component - only UniversalNavHeader + BottomNav)
  if (isMobile) {
    return (
      <ProtectedRoute>
        <CommandPalette />
        <div className="flex flex-col h-screen w-full bg-background">
          {/* Mobile Header with Logo */}
          {!isHelpDesk && (
            <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
              <div className="flex items-center justify-between gap-2">
                <a href="/" data-testid="link-logo-mobile" className="flex-shrink-0">
                  <CoAIleagueLogo width={140} height={46} showTagline={false} className="h-11 w-auto" />
                </a>
                <NotificationsCenter />
              </div>
            </div>
          )}
          
          {/* Main content area - with bottom nav padding */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto scrollbar-hide min-h-0 w-full max-w-full pb-20">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/login">
                <Redirect to="/dashboard" />
              </Route>
              <Route path="/register">
                <Redirect to="/dashboard" />
              </Route>
              <Route path="/mobile-dashboard"><Redirect to="/dashboard" /></Route>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/schedule" component={UniversalSchedule} />
              <Route path="/universal-schedule"><Redirect to="/schedule" /></Route>
              <Route path="/daily-schedule" component={DailySchedule} />
              <Route path="/workflow-approvals" component={WorkflowApprovals} />
              <Route path="/sales" component={WorkspaceSales} />
              <Route path="/time-tracking" component={TimeTracking} />
              <Route path="/employees" component={Employees} />
              <Route path="/role-management" component={RoleManagement} />
              <Route path="/manager-dashboard" component={ManagerDashboard} />
              <Route path="/engagement/dashboard" component={EngagementDashboard} />
              <Route path="/engagement/employee" component={EmployeeEngagement} />
              <Route path="/analytics/reports" component={AnalyticsReportsPage} />
              <Route path="/clients" component={Clients} />
              <Route path="/invoices" component={Invoices} />
              <Route path="/reports" component={Reports} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/audit-logs" component={AuditLogs} />
              <Route path="/automation-control" component={AutomationControl} />
              <Route path="/ai/command-center" component={AICommandCenter} />
              <Route path="/support/console" component={SupportCommandConsole} />
              <Route path="/billing" component={Billing} />
              <Route path="/usage" component={UsageDashboard} />
              <Route path="/integrations" component={IntegrationsPage} />
              <Route path="/oversight" component={OversightHub} />
              <Route path="/expenses" component={Expenses} />
              <Route path="/expense-approvals" component={ExpenseApprovals} />
              <Route path="/pending"><Redirect to="/timesheets/pending" /></Route>
              <Route path="/timesheets/pending" component={PendingTimeEntries} />
              <Route path="/timesheets/approvals" component={TimesheetApprovals} />
              <Route path="/i9-compliance" component={I9Compliance} />
              <Route path="/policies" component={Policies} />
              <Route path="/payroll" component={PayrollDashboard} />
              <Route path="/my-paychecks" component={MyPaychecks} />
              <Route path="/leaders-hub">
                <LeaderRoute>
                  <LeadersHub />
                </LeaderRoute>
              </Route>
              <Route path="/hr/benefits" component={HRBenefits} />
              <Route path="/hr/reviews" component={HRReviews} />
              <Route path="/hr/pto" component={HRPTO} />
              <Route path="/hr/terminations" component={HRTerminations} />
              <Route path="/disputes" component={Disputes} />
              <Route path="/my-audit-record" component={MyAuditRecord} />
              <Route path="/file-grievance" component={FileGrievance} />
              <Route path="/review-disputes" component={ReviewDisputes} />
              <Route path="/payroll/deductions" component={PayrollDeductions} />
              <Route path="/payroll/garnishments" component={PayrollGarnishments} />
              <Route path="/comm-os" component={AICommunications} />
              <Route path="/comm-os/onboarding" component={AICommunicationsOnboarding} />
              <Route path="/query-os" component={AIDiagnostics} />
              <Route path="/messages" component={PrivateMessages} />
              <Route path="/training" component={AITraining} />
              <Route path="/budget" component={AIBudgeting} />
              <Route path="/integrations" component={AIIntegrations} />
              <Route path="/search" component={AIRecords} />
              <Route path="/insights" component={AIAnalytics} />

              {/* OS Family Showcase Pages */}
              <Route path="/os-family/communication" component={CommunicationFamilyPage} />
              <Route path="/os-family/operations" component={OperationsFamilyPage} />
              <Route path="/os-family/growth" component={GrowthFamilyPage} />
              <Route path="/os-family/platform" component={PlatformFamilyPage} />

              {/* User Menu Routes */}
              <Route path="/profile" component={Profile} />
              <Route path="/unavailability" component={Unavailability} />
              <Route path="/availability" component={AvailabilityPage} />
              <Route path="/create-org" component={CreateOrg} />
              <Route path="/updates" component={Updates} />
              <Route path="/help" component={Help} />

              {/* Unified Root Administrator Control Center */}
              <Route path="/root-admin-dashboard">
                <PlatformAdminRoute>
                  <RootAdminDashboard />
                </PlatformAdminRoute>
              </Route>
              
              {/* Redirect old admin dashboards to unified control center */}
              <Route path="/platform-admin">
                <Redirect to="/root-admin-dashboard" />
              </Route>
              <Route path="/admin-command-center">
                <Redirect to="/root-admin-dashboard" />
              </Route>
              <Route path="/root-admin-portal">
                <Redirect to="/root-admin-dashboard" />
              </Route>
              <Route path="/platform/admin">
                <Redirect to="/root-admin-dashboard" />
              </Route>
              <Route path="/admin/command">
                <Redirect to="/root-admin-dashboard" />
              </Route>
              
              {/* Platform admin tools (accessible from control center) */}
              <Route path="/admin/usage" component={AdminUsage} />
              <Route path="/admin/custom-forms" component={AdminCustomForms} />
              <Route path="/admin/banners" component={AdminBanners} />
              <Route path="/admin/ticket-reviews" component={AdminTicketReviews} />
              <Route path="/automation/audit-log" component={AutomationAuditLog} />
              <Route path="/automation/settings" component={AutomationSettings} />
              <Route path="/ai/brain" component={AIBrainDashboard} />
              <Route path="/system-health">
                <PlatformAdminRoute>
                  <SystemHealth />
                </PlatformAdminRoute>
              </Route>
              <Route path="/owner/hireos/workflow-builder" component={HiringWorkflowBuilder} />
              <Route path="/employees/:employeeId/file-cabinet" component={EmployeeFileCabinet} />
              <Route path="/platform/users" component={PlatformUsers} />
              <Route path="/company-reports" component={CompanyReports} />
              <Route path="/platform/sales" component={WorkspaceSales} />
              <Route path="/employee/portal" component={EmployeePortal} />
              <Route path="/auditor/portal" component={AuditorPortal} />
              <Route path="/client/portal" component={ClientPortal} />
              <Route path="/settings" component={Settings} />
              <Route path="/alert-settings" component={AlertSettings} />
              <Route path="/employee/profile" component={EmployeeProfile} />
              <Route path="/pricing" component={UniversalMarketing} />
              <Route path="/contact" component={Contact} />
              <Route path="/terms" component={TermsOfService} />
              <Route path="/privacy" component={PrivacyPolicy} />
              {/* Consolidated Chat Routes - ONE UNIVERSAL CHAT */}
              <Route path="/chat" component={HelpDesk} /> {/* Universal responsive chat with Gemini AI (works on desktop + mobile) */}
              <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
              <Route path="/chatrooms" component={Chatrooms} /> {/* Organization chatroom discovery and bulk join */}
              <Route path="/helpai-orchestration" component={HelpAIOrchestration} /> {/* HelpAI Orchestration System */}
              
              {/* Redirect legacy chat routes to unified /chat */}
              <Route path="/support/chat"><Redirect to="/chat" /></Route>
              <Route path="/live-chat"><Redirect to="/chat" /></Route>
              <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
              <Route path="/logo-showcase" component={LogoShowcase} />
              <Route path="/support" component={Support} />
              
              {/* Error pages */}
              <Route path="/error-403" component={Error403} />
              <Route path="/error-404" component={Error404} />
              <Route path="/error-500" component={Error500} />
              
              <Route component={NotFound} />
            </Switch>
          </main>
          
          {/* Mobile Bottom Navigation - Fixed at bottom */}
          {!isHelpDesk && <MobileBottomNav />}
        </div>
        <OnboardingWizard isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </ProtectedRoute>
    );
  }

  // Desktop layout with SidebarProvider
  return (
    <ProtectedRoute>
      <CommandPalette />
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex flex-col h-screen w-full">
          {/* Header + Tabs Navigation (stacked vertically) */}
          {!isHelpDesk && !isMobile && (
            <>
              <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground" />
                    <a href="/" data-testid="link-logo-desktop" className="flex-shrink-0">
                      <CoAIleagueLogo width={220} height={70} showTagline={false} className="h-9 w-auto" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* What's New Badge - Sparkles icon with unread count */}
                    <WhatsNewBadge />
                    {/* Notifications Bell */}
                    <NotificationsCenter />
                    {/* User Menu Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-9 w-9 rounded-full bg-white/20 hover:bg-white/30"
                          data-testid="button-user-menu"
                          title="User Menu"
                        >
                          <span className="text-sm font-bold">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <div className="px-2 py-1.5">
                          <p className="text-sm font-semibold">{user?.firstName} {user?.lastName}</p>
                          <p className="text-xs text-muted-foreground">{user?.email}</p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer" 
                          onClick={() => setLocation('/profile')}
                          data-testid="menu-profile"
                        >
                          <User className="h-4 w-4 mr-2" />
                          Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer" 
                          onClick={() => setLocation('/settings')}
                          data-testid="menu-settings"
                        >
                          <Settings2 className="h-4 w-4 mr-2" />
                          Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer text-destructive"
                          onClick={async () => {
                            await performLogout();
                          }}
                          data-testid="menu-sign-out"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Sign Out
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
              <WorkspaceTabsNav />
            </>
          )}
          
          {/* Main content with sidebar */}
          <div className="flex flex-1 min-h-0 w-full overflow-hidden">
            {/* Desktop Sidebar - REMOVED: Now using WorkspaceTabsNav for unified navigation */}
            
            {/* Main content container */}
            <div className="flex flex-col flex-1 min-h-0 w-full max-w-full overflow-x-hidden">
              {/* Demo Banner - positioned to account for fixed header (hidden on mobile) */}
              {!isMobile && <DemoBanner />}

            {/* Compact top-right utility cluster - HIDDEN on mobile and when universal header is shown */}
            {!isMobileChat && !isHelpDesk && !isMobile && !true && (
              <AppUtilityCluster setLocation={setLocation} />
            )}

              {/* Main content area */}
              <main className="flex-1 overflow-x-hidden overflow-y-auto scrollbar-hide bg-white min-h-0 w-full max-w-full">
                {/* Breadcrumb Navigation - helps users know where they are (desktop only) */}
                {!isMobileChat && !isHelpDesk && !isMobile && false && <PageBreadcrumb />}
              
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/login">
                  <Redirect to="/dashboard" />
                </Route>
                <Route path="/register">
                  <Redirect to="/dashboard" />
                </Route>
                <Route path="/mobile-dashboard"><Redirect to="/dashboard" /></Route>
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/schedule" component={UniversalSchedule} />
                <Route path="/universal-schedule"><Redirect to="/schedule" /></Route>
                <Route path="/daily-schedule" component={DailySchedule} />
                <Route path="/workflow-approvals" component={WorkflowApprovals} />
                <Route path="/sales" component={WorkspaceSales} />
                <Route path="/time-tracking" component={TimeTracking} />
                <Route path="/employees" component={Employees} />
                <Route path="/role-management" component={RoleManagement} />
                <Route path="/manager-dashboard" component={ManagerDashboard} />
                <Route path="/engagement/dashboard" component={EngagementDashboard} />
                <Route path="/engagement/employee" component={EmployeeEngagement} />
                <Route path="/analytics/reports" component={AnalyticsReportsPage} />
                <Route path="/clients" component={Clients} />
                <Route path="/invoices" component={Invoices} />
                <Route path="/reports" component={Reports} />
                <Route path="/analytics" component={Analytics} />
                <Route path="/audit-logs" component={AuditLogs} />
                <Route path="/automation-control" component={AutomationControl} />
                <Route path="/ai/command-center" component={AICommandCenter} />
                <Route path="/support/console" component={SupportCommandConsole} />
                <Route path="/ai/brain" component={AIBrainDashboard} />
                <Route path="/system-health">
                  <PlatformAdminRoute>
                    <SystemHealth />
                  </PlatformAdminRoute>
                </Route>
                <Route path="/billing" component={Billing} />
                <Route path="/usage" component={UsageDashboard} />
                <Route path="/integrations" component={IntegrationsPage} />
                <Route path="/oversight" component={OversightHub} />
                <Route path="/expenses" component={Expenses} />
                <Route path="/expense-approvals" component={ExpenseApprovals} />
                <Route path="/pending"><Redirect to="/timesheets/pending" /></Route>
                <Route path="/timesheets/pending" component={PendingTimeEntries} />
                <Route path="/timesheets/approvals" component={TimesheetApprovals} />
                <Route path="/i9-compliance" component={I9Compliance} />
                <Route path="/policies" component={Policies} />
                <Route path="/payroll" component={PayrollDashboard} />
                <Route path="/my-paychecks" component={MyPaychecks} />
                <Route path="/leaders-hub">
                  <LeaderRoute>
                    <LeadersHub />
                  </LeaderRoute>
                </Route>
                <Route path="/hr/benefits" component={HRBenefits} />
                <Route path="/hr/reviews" component={HRReviews} />
                <Route path="/hr/pto" component={HRPTO} />
                <Route path="/hr/terminations" component={HRTerminations} />
                <Route path="/disputes" component={Disputes} />
                <Route path="/my-audit-record" component={MyAuditRecord} />
                <Route path="/file-grievance" component={FileGrievance} />
                <Route path="/review-disputes" component={ReviewDisputes} />
                <Route path="/comm-os" component={AICommunications} />
                <Route path="/comm-os/onboarding" component={AICommunicationsOnboarding} />
                <Route path="/query-os" component={AIDiagnostics} />
                <Route path="/messages" component={PrivateMessages} />
                <Route path="/training" component={AITraining} />
                <Route path="/budget" component={AIBudgeting} />
                <Route path="/integrations" component={AIIntegrations} />
                <Route path="/search" component={AIRecords} />
                <Route path="/insights" component={AIAnalytics} />

                {/* OS Family Showcase Pages */}
                <Route path="/os-family/communication" component={CommunicationFamilyPage} />
                <Route path="/os-family/operations" component={OperationsFamilyPage} />
                <Route path="/os-family/growth" component={GrowthFamilyPage} />
                <Route path="/os-family/platform" component={PlatformFamilyPage} />

                {/* User Menu Routes */}
                <Route path="/profile" component={Profile} />
                <Route path="/unavailability" component={Unavailability} />
                <Route path="/create-org" component={CreateOrg} />
                <Route path="/updates" component={Updates} />
                <Route path="/help" component={Help} />

                {/* Unified Root Administrator Control Center */}
                <Route path="/root-admin-dashboard">
                  <PlatformAdminRoute>
                    <RootAdminDashboard />
                  </PlatformAdminRoute>
                </Route>
                
                {/* Redirect old admin dashboards to unified control center */}
                <Route path="/platform-admin">
                  <Redirect to="/root-admin-dashboard" />
                </Route>
                <Route path="/admin-command-center">
                  <Redirect to="/root-admin-dashboard" />
                </Route>
                <Route path="/root-admin-portal">
                  <Redirect to="/root-admin-dashboard" />
                </Route>
                <Route path="/platform/admin">
                  <Redirect to="/root-admin-dashboard" />
                </Route>
                <Route path="/admin/command">
                  <Redirect to="/root-admin-dashboard" />
                </Route>
                
                {/* Platform admin tools (accessible from control center) */}
                <Route path="/admin/usage" component={AdminUsage} />
                <Route path="/admin/custom-forms" component={AdminCustomForms} />
                <Route path="/owner/hireos/workflow-builder" component={HiringWorkflowBuilder} />
                <Route path="/employees/:employeeId/file-cabinet" component={EmployeeFileCabinet} />
                <Route path="/platform/users" component={PlatformUsers} />
                <Route path="/company-reports" component={CompanyReports} />
                <Route path="/platform/sales" component={WorkspaceSales} />
                <Route path="/employee/portal" component={EmployeePortal} />
                <Route path="/auditor/portal" component={AuditorPortal} />
                <Route path="/client/portal" component={ClientPortal} />
                <Route path="/settings" component={Settings} />
              <Route path="/alert-settings" component={AlertSettings} />
                <Route path="/employee/profile" component={EmployeeProfile} />
                <Route path="/pricing" component={UniversalMarketing} />
                <Route path="/contact" component={Contact} />
                <Route path="/terms" component={TermsOfService} />
                <Route path="/privacy" component={PrivacyPolicy} />
                {/* Consolidated Chat Routes - ONE UNIVERSAL CHAT */}
                <Route path="/chat" component={HelpDesk} /> {/* Universal responsive chat with Gemini AI (works on desktop + mobile) */}
                <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
                
                {/* Redirect legacy chat routes to unified /chat */}
                <Route path="/support/chat"><Redirect to="/chat" /></Route>
                <Route path="/live-chat"><Redirect to="/chat" /></Route>
                <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
                <Route path="/logo-showcase" component={LogoShowcase} />
                <Route path="/support" component={Support} />
                
                {/* Error pages */}
                <Route path="/error-403" component={Error403} />
                <Route path="/error-404" component={Error404} />
                <Route path="/error-500" component={Error500} />
                
                <Route component={NotFound} />
              </Switch>
              </main>
            </div>
          </div>
        </div>
      </SidebarProvider>
      
      <OnboardingWizard isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ServiceHealthProvider>
          <UniversalLoadingGateProvider>
            <OverlayControllerProvider>
              <ThemeProvider defaultTheme="light">
                <WorkspaceThemeProvider>
                  <TransitionProvider>
                  <TooltipProvider>
                    <ResponsiveAppFrame>
                      <AppContent />
                      <FloatingSupportChat />
                      <ReenableChatButton />
                      <Toaster />
                    </ResponsiveAppFrame>
                  </TooltipProvider>
                  </TransitionProvider>
                </WorkspaceThemeProvider>
              </ThemeProvider>
            </OverlayControllerProvider>
          </UniversalLoadingGateProvider>
        </ServiceHealthProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}