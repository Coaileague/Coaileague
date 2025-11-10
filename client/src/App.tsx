// Multi-tenant SaaS Scheduling Platform

import { Switch, Route, useLocation } from "wouter";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { GraduationCap, Settings2, Search } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeProvider as WorkspaceThemeProvider } from "@/contexts/ThemeContext";
import { TransitionProvider } from "@/contexts/transition-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/protected-route";
import { LeaderRoute } from "@/components/leader-route";
import { PlatformAdminRoute } from "@/components/platform-admin-route";
import { DemoBanner } from "@/components/demo-banner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/command-palette";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile, ResponsiveAppFrame } from "@/hooks/use-mobile";
import { MobileLoading } from "@/components/mobile-loading";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import CustomLogin from "@/pages/custom-login";
import CustomRegister from "@/pages/custom-register";
import Pricing from "@/pages/pricing";
import Contact from "@/pages/contact";
import Support from "@/pages/support";
import Dashboard from "@/pages/dashboard";
import { Redirect } from "wouter";
import SmartScheduleOS from "@/pages/schedule-grid";
import SalesDashboard from "@/pages/sales/dashboard";
import TimeTracking from "@/pages/time-tracking";
import Employees from "@/pages/employees";
import Clients from "@/pages/clients";
import Invoices from "@/pages/invoices";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Reports from "@/pages/reports";
import OnboardingPage from "@/pages/onboarding";
import HireOSWorkflowBuilder from "@/pages/hireos-workflow-builder";
import EmployeeFileCabinet from "@/pages/employee-file-cabinet";
import EmployeeProfile from "@/pages/employee-profile";
import AdminUsage from "@/pages/admin-usage";
import AdminSupport from "@/pages/admin-support";
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
import CustomerSupport from "@/pages/customer-support";
import Billing from "@/pages/billing";
import HRBenefits from "@/pages/hr-benefits";
import HRReviews from "@/pages/hr-reviews";
import HRPTO from "@/pages/hr-pto";
import HRTerminations from "@/pages/hr-terminations";
import HelpdeskChat from "@/pages/helpdesk-chat";
import LiveChatroom from "@/pages/live-chatroom";
import HelpDeskCab from "@/pages/HelpDeskCab";
import SupportDashboard from "@/pages/support-dashboard";
import SalesPortal from "@/pages/sales-portal";
import DesignComparison from "@/pages/design-comparison";
import LogoShowcase from "@/pages/logo-showcase";
import LogoShowcaseV2 from "@/pages/logo-showcase-v2";
import PayrollDashboard from "@/pages/payroll-dashboard";
import MyPaychecks from "@/pages/my-paychecks";
import LeadersHub from "@/pages/leaders-hub";
import MobileChatPage from "@/pages/mobile-chat";
import EngagementDashboard from "@/pages/engagement-dashboard";
import EmployeeEngagement from "@/pages/engagement-employee";
import AnalyticsReportsPage from "@/pages/analytics-reports";
import Disputes from "@/pages/disputes";
import MyAuditRecord from "@/pages/my-audit-record";
import FileGrievance from "@/pages/file-grievance";
import ReviewDisputes from "@/pages/review-disputes";
import CommunicationOS from "@/pages/communication-os";
import CommOS from "@/pages/comm-os";
import CommOSOnboarding from "@/pages/comm-os-onboarding";
import QueryOS from "@/pages/query-os";
import PrivateMessages from "@/pages/private-messages";
import TrainingOS from "@/pages/training-os";
import BudgetOS from "@/pages/budget-os";
import IntegrationOS from "@/pages/integration-os";
import RecordOS from "@/pages/record-os";
import InsightOS from "@/pages/insight-os";
import CommunicationFamilyPage from "@/pages/os-family-communication";
import OperationsFamilyPage from "@/pages/os-family-operations";
import GrowthFamilyPage from "@/pages/os-family-growth";
import PlatformFamilyPage from "@/pages/os-family-platform";
import Profile from "@/pages/profile";
import Unavailability from "@/pages/unavailability";
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
import ChatExport from "@/pages/chat-export";
import RichTextDemo from "@/pages/RichTextDemo";
import OrgSupport from "@/pages/org-support";
import PendingTimeEntries from "@/pages/pending-time-entries";
import TimesheetApprovals from "@/pages/timesheet-approvals";
import Error403 from "@/pages/error-403";
import Error404 from "@/pages/error-404";
import Error500 from "@/pages/error-500";
import IntegrationsPage from "@/pages/integrations-page";
import { FloatingChatButton } from "@/components/floating-chat-button";
import { ReenableChatButton } from "@/components/reenable-chat-button";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { Sparkles } from "lucide-react";
import { HeaderBillboard } from "@/components/header-billboard";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { WhatsNewBadge } from "@/components/whats-new-badge";
import { HelpDropdown } from "@/components/help-dropdown";
import { PlanBadge } from "@/components/plan-badge";
import { FeedbackWidget } from "@/components/feedback-widget";
import { PageBreadcrumb } from "@/components/page-breadcrumb";

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if on mobile chat, HelpDeskCab, or desktop live-chat - use window.location instead of useLocation() hook
  // to avoid React Hooks issues with conditional rendering
  const isMobileChat = window.location.pathname === '/mobile-chat';
  const isHelpDesk = window.location.pathname === '/chat' || window.location.pathname.startsWith('/chat');

  // Custom sidebar width for better workspace layout (increased for longer menu text)
  const style = {
    "--sidebar-width": "22rem",  // 352px - prevents text truncation
    "--sidebar-width-icon": "4rem",
  };

  // Show minimal loading state during auth check to prevent routing issues
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={CustomLogin} />
        <Route path="/register" component={CustomRegister} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/contact" component={Contact} />
        <Route path="/support" component={Support} />
        {/* Consolidated chat routes - redirect to main chat */}
        <Route path="/chat" component={HelpDeskCab} />
        <Route path="/mobile-chat" component={MobileChatPage} /> {/* Guest access for mobile */}
        <Route path="/live-chat"><Redirect to="/chat" /></Route>
        <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
        <Route path="/support/chat"><Redirect to="/chat" /></Route>
        <Route path="/design-comparison" component={DesignComparison} />
        <Route path="/logo-showcase" component={LogoShowcase} />
        <Route path="/logo-showcase-v2" component={LogoShowcaseV2} />
        <Route path="/onboarding/:token" component={OnboardingPage} />
        <Route path="/pay-invoice/:id" component={PayInvoice} />
        
        {/* Error pages */}
        <Route path="/error-403" component={Error403} />
        <Route path="/error-404" component={Error404} />
        <Route path="/error-500" component={Error500} />
        
        <Route component={Landing} />
      </Switch>
    );
  }

  // Check if user is Root Admin (platform-level access)
  const isRootAdmin = (user as any)?.platformRole === 'root_admin' || (user as any)?.platformRole === 'sysop';

  return (
    <ProtectedRoute>
      <SidebarProvider defaultOpen={false} style={style as React.CSSProperties}>
        <CommandPalette />
        <div className="flex h-screen w-full overflow-x-hidden max-w-full relative">
          {/* Hide global sidebar for mobile chat - it has its own support menu */}
          {!isMobileChat && <AppSidebar />}
          <div className="flex flex-col absolute inset-0 min-h-0 w-full max-w-full overflow-x-hidden z-0">
            {/* Demo Banner - positioned to account for fixed header */}
            <DemoBanner />

            {/* Global Header - FIXED floats over all content */}
            {!isMobileChat && !isHelpDesk && (
              <header className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-3 sm:px-4 py-2 border-b bg-card/95 backdrop-blur-sm h-14">
                <div className="flex items-center gap-2">
                  {/* Menu Toggle with visible label */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const trigger = document.querySelector('[data-testid="button-sidebar-toggle"]') as HTMLButtonElement;
                          if (trigger) trigger.click();
                        }}
                        data-testid="button-menu-toggle"
                        className="shrink-0 gap-2"
                      >
                        <span className="text-sm">Menu</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle navigation menu</p>
                    </TooltipContent>
                  </Tooltip>
                  {/* Workspace Switcher */}
                  <div className="hidden md:block">
                    <WorkspaceSwitcher />
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {/* Dynamic Billboard - Greetings, Announcements, Birthday Celebrations */}
                  <HeaderBillboard />

                  {/* Plan Badge - Hidden on small screens */}
                  <div className="hidden md:block">
                    <PlanBadge />
                  </div>

                  {/* Global Search with label */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if ((window as any).openCommandPalette) {
                            (window as any).openCommandPalette();
                          } else {
                            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true });
                            document.dispatchEvent(event);
                          }
                        }}
                        className="shrink-0 gap-2"
                        data-testid="button-global-search"
                      >
                        <Search className="h-4 w-4" />
                        <span className="hidden sm:inline text-sm">Search</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Search platform (Cmd/Ctrl + K)</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* What's New Badge - Hidden on mobile */}
                  <div className="hidden sm:block">
                    <WhatsNewBadge />
                  </div>

                  {/* Help Dropdown - Hidden on small screens */}
                  <div className="hidden md:block">
                    <HelpDropdown />
                  </div>

                  {/* Feedback Widget - Hidden on mobile */}
                  <div className="hidden lg:block">
                    <FeedbackWidget />
                  </div>

                  {/* Tutorial/Tour Button with label */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowOnboarding(true)}
                        data-testid="button-open-onboarding"
                        className="shrink-0 hidden sm:flex gap-2"
                      >
                        <GraduationCap className="h-4 w-4" />
                        <span className="text-sm">Tutorial</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Start interactive walkthrough</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Role-Aware Settings Gear with label */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Role-based routing
                          if (isRootAdmin) {
                            setLocation('/platform-admin');
                          } else if (
                            (user as any)?.platformRole === 'deputy_admin' ||
                            (user as any)?.platformRole === 'support_manager' ||
                            (user as any)?.platformRole === 'support_agent' ||
                            (user as any)?.platformRole === 'compliance_officer'
                          ) {
                            setLocation('/admin-command-center');
                          } else {
                            setLocation('/settings');
                          }
                        }}
                        data-testid="button-settings-gear"
                        className="shrink-0 gap-2"
                      >
                        <Settings2 className="h-4 w-4 text-primary" />
                        <span className="hidden sm:inline text-sm">{isRootAdmin ? 'Admin' : 'Settings'}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isRootAdmin ? 'Platform Management' : 'Organization Settings'}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Theme Toggle */}
                  <div className="shrink-0">
                    <ThemeToggle />
                  </div>
                </div>
              </header>
            )}

            {/* SidebarTrigger - accessible for keyboard users and programmatic control */}
            <SidebarTrigger data-testid="button-sidebar-toggle" className="sr-only" />

            {/* Main content area - add padding-top for fixed header */}
            <main className={`flex-1 overflow-x-hidden overflow-y-auto scrollbar-hide bg-transparent min-h-0 w-full max-w-full ${!isMobileChat && !isHelpDesk ? 'pt-14' : ''}`}>
              {/* Breadcrumb Navigation - helps users know where they are */}
              {!isMobileChat && !isHelpDesk && <PageBreadcrumb />}
              
              <Switch>
                <Route path="/">
                  {isRootAdmin ? <RootAdminDashboard /> : <Dashboard />}
                </Route>
                <Route path="/login">
                  <Redirect to="/dashboard" />
                </Route>
                <Route path="/register">
                  <Redirect to="/dashboard" />
                </Route>
                <Route path="/dashboard">
                  {isRootAdmin ? <RootAdminDashboard /> : <Dashboard />}
                </Route>
                <Route path="/schedule" component={SmartScheduleOS} />
                <Route path="/sales" component={SalesDashboard} />
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
                <Route path="/billing" component={Billing} />
                <Route path="/integrations" component={IntegrationsPage} />
                <Route path="/expenses" component={Expenses} />
                <Route path="/expense-approvals" component={ExpenseApprovals} />
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
                <Route path="/communication" component={CommunicationOS} />
                <Route path="/comm-os" component={CommOS} />
                <Route path="/comm-os/onboarding" component={CommOSOnboarding} />
                <Route path="/query-os" component={QueryOS} />
                <Route path="/messages" component={PrivateMessages} />
                <Route path="/chat-export" component={ChatExport} />
                <Route path="/rich-text-demo" component={RichTextDemo} />
                <Route path="/training" component={TrainingOS} />
                <Route path="/budget" component={BudgetOS} />
                <Route path="/integrations" component={IntegrationOS} />
                <Route path="/search" component={RecordOS} />
                <Route path="/insights" component={InsightOS} />

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

                {/* Support & Admin routes */}
                <Route path="/org-support" component={OrgSupport} />
                <Route path="/admin-command-center" component={AdminCommandCenter} />
                
                {/* Legacy routes - redirect to consolidated /dashboard */}
                <Route path="/root-admin-portal">
                  <Redirect to="/dashboard" />
                </Route>
                <Route path="/admin/command">
                  <Redirect to="/dashboard" />
                </Route>
                <Route path="/admin/usage" component={AdminUsage} />
                <Route path="/admin/support" component={AdminSupport} />
                <Route path="/admin/custom-forms" component={AdminCustomForms} />
                <Route path="/owner/hireos/workflow-builder" component={HireOSWorkflowBuilder} />
                <Route path="/employees/:employeeId/file-cabinet" component={EmployeeFileCabinet} />
                <Route path="/support/dashboard" component={SupportDashboard} />
                <Route path="/platform-admin">
                  <PlatformAdminRoute>
                    <PlatformAdmin />
                  </PlatformAdminRoute>
                </Route>
                <Route path="/platform/admin">
                  <Redirect to="/platform-admin" />
                </Route>
                <Route path="/platform/users" component={PlatformUsers} />
                <Route path="/company-reports" component={CompanyReports} />
                <Route path="/platform/sales" component={SalesPortal} />
                <Route path="/employee/portal" component={EmployeePortal} />
                <Route path="/auditor/portal" component={AuditorPortal} />
                <Route path="/client/portal" component={ClientPortal} />
                <Route path="/settings" component={Settings} />
                <Route path="/employee/profile" component={EmployeeProfile} />
                <Route path="/pricing" component={Pricing} />
                <Route path="/contact" component={Contact} />
                <Route path="/support/tickets" component={CustomerSupport} />
                {/* Consolidated Chat Routes - ONLY 2 versions */}
                <Route path="/chat" component={HelpDeskCab} /> {/* Desktop chat with Gemini AI */}
                <Route path="/mobile-chat" component={MobileChatPage} /> {/* Mobile optimized */}
                
                {/* Redirect legacy chat routes to unified /chat */}
                <Route path="/support/chat"><Redirect to="/chat" /></Route>
                <Route path="/live-chat"><Redirect to="/chat" /></Route>
                <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
                <Route path="/design-comparison" component={DesignComparison} />
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
        
        {/* Mobile Bottom Navigation - Only shown on mobile, hidden on tablet/desktop */}
        {!isMobileChat && !isHelpDesk && <MobileBottomNav />}
        
        <OnboardingWizard isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </SidebarProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <WorkspaceThemeProvider>
            <TransitionProvider>
              <TooltipProvider>
                <ResponsiveAppFrame>
                  <AppContent />
                  <FloatingChatButton />
                  <ReenableChatButton />
                  <Toaster />
                </ResponsiveAppFrame>
              </TooltipProvider>
            </TransitionProvider>
          </WorkspaceThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}