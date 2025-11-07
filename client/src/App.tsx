// Multi-tenant SaaS Scheduling Platform

import { Switch, Route, useLocation } from "wouter";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { GraduationCap } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeProvider as WorkspaceThemeProvider } from "@/contexts/ThemeContext";
import { TransitionProvider } from "@/contexts/transition-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/protected-route";
import { LeaderRoute } from "@/components/leader-route";
import { DemoBanner } from "@/components/demo-banner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/command-palette";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLoading } from "@/components/mobile-loading";
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
import RootAdminPortal from "@/pages/root-admin-portal-compact";
import RootAdminDashboard from "@/pages/root-admin-dashboard";
import PlatformUsers from "@/pages/platform-users";
import EmployeePortal from "@/pages/employee-portal-compact";
import AuditorPortal from "@/pages/auditor-portal-compact";
import ClientPortal from "@/pages/client-portal-compact";
import CustomerSupport from "@/pages/customer-support";
import Billing from "@/pages/billing";
import HRBenefits from "@/pages/hr-benefits";
import HRReviews from "@/pages/hr-reviews";
import HRPTO from "@/pages/hr-pto";
import HRTerminations from "@/pages/hr-terminations";
import HelpdeskChat from "@/pages/helpdesk-chat";
import LiveChatroom from "@/pages/live-chatroom";
import HelpDesk5 from "@/pages/HelpDesk5";
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
import { FloatingChatButton } from "@/components/floating-chat-button";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { Sparkles, Search } from "lucide-react";
import { WelcomeMessage } from "@/components/welcome-message";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { WhatsNewBadge } from "@/components/whats-new-badge";
import { HelpDropdown } from "@/components/help-dropdown";
import { PlanBadge } from "@/components/plan-badge";
import { FeedbackWidget } from "@/components/feedback-widget";

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if on mobile chat, HelpDesk5, or desktop live-chat - use window.location instead of useLocation() hook
  // to avoid React Hooks issues with conditional rendering
  const isMobileChat = window.location.pathname === '/mobile-chat' || window.location.pathname === '/helpdesk5';
  const isHelpDesk = window.location.pathname === '/live-chat' || window.location.pathname.startsWith('/live-chat') || window.location.pathname === '/helpdesk5';

  // Custom sidebar width for better workspace layout (increased for longer menu text)
  const style = {
    "--sidebar-width": "22rem",  // 352px - prevents text truncation
    "--sidebar-width-icon": "4rem",
  };

  if (isLoading) {
    return <MobileLoading fullScreen message="Authenticating..." />;
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
        <Route path="/live-chat" component={LiveChatroom} />
        <Route path="/helpdesk5" component={HelpDesk5} />
        {/* Removed /mobile-chat from here - FIXED: Duplicate route was causing double WebSocket connections */}
        <Route path="/design-comparison" component={DesignComparison} />
        <Route path="/logo-showcase" component={LogoShowcase} />
        <Route path="/logo-showcase-v2" component={LogoShowcaseV2} />
        <Route path="/onboarding/:token" component={OnboardingPage} />
        <Route path="/pay-invoice/:id" component={PayInvoice} />
        <Route component={Landing} />
      </Switch>
    );
  }

  // Check if user is Root Admin (platform-level access)
  const isRootAdmin = (user as any)?.platformRole === 'root' || (user as any)?.platformRole === 'sysop';

  return (
    <ProtectedRoute>
      <SidebarProvider defaultOpen={false} style={style as React.CSSProperties}>
        <CommandPalette />
        <div className="flex h-screen w-full">
          {/* Hide global sidebar for mobile chat - it has its own support menu */}
          {!isMobileChat && <AppSidebar />}
          <div className="flex flex-col flex-1 min-h-0">
            <DemoBanner />

            {/* Global Header with Sidebar Toggle - Hidden for mobile chat AND HelpDesk */}
            {!isMobileChat && !isHelpDesk && (
              <header className="flex items-center justify-between px-3 sm:px-4 py-2 border-b bg-card shrink-0 h-14">
                <div className="flex items-center gap-2">
                  {/* Menu Toggle with label */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <SidebarTrigger data-testid="button-sidebar-toggle" className="shrink-0" />
                        <span className="hidden lg:inline text-xs text-muted-foreground font-medium">Menu</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle sidebar menu</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Workspace Switcher */}
                  <div className="hidden md:block">
                    <WorkspaceSwitcher />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Polished Welcome Message for logged-in users */}
                  <WelcomeMessage />

                  {/* Plan Badge - Hidden on small screens */}
                  <div className="hidden md:block">
                    <PlanBadge />
                  </div>

                  {/* Global Search Trigger */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if ((window as any).openCommandPalette) {
                            (window as any).openCommandPalette();
                          } else {
                            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true });
                            document.dispatchEvent(event);
                          }
                        }}
                        className="shrink-0 h-10 w-10 rounded-xl hover-elevate active-elevate-2"
                        data-testid="button-global-search"
                      >
                        <Search className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Search (Cmd/Ctrl + K)</p>
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

                  {/* Tutorial/Tour Button - Hidden on mobile */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowOnboarding(true)}
                        data-testid="button-open-onboarding"
                        className="shrink-0 hidden sm:flex h-10 w-10 rounded-xl hover-elevate active-elevate-2"
                      >
                        <GraduationCap className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Start platform walkthrough</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Theme Toggle */}
                  <div className="shrink-0">
                    <ThemeToggle />
                  </div>
                </div>
              </header>
            )}

            <main className="flex-1 overflow-auto scrollbar-hide bg-transparent min-h-0">
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
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/schedule" component={SmartScheduleOS} />
                <Route path="/sales" component={SalesDashboard} />
                <Route path="/time-tracking" component={TimeTracking} />
                <Route path="/employees" component={Employees} />
                <Route path="/role-management" component={RoleManagement} />
                <Route path="/manager-dashboard" component={ManagerDashboard} />
                <Route path="/engagement/dashboard" component={EngagementDashboard} />
                <Route path="/engagement/employee" component={EmployeeEngagement} />
                <Route path="/clients" component={Clients} />
                <Route path="/invoices" component={Invoices} />
                <Route path="/reports" component={Reports} />
                <Route path="/analytics" component={Analytics} />
                <Route path="/billing" component={Billing} />
                <Route path="/expenses" component={Expenses} />
                <Route path="/expense-approvals" component={ExpenseApprovals} />
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

                <Route path="/root-admin-portal" component={RootAdminDashboard} />
                <Route path="/admin/usage" component={AdminUsage} />
                <Route path="/admin/support" component={AdminSupport} />
                <Route path="/admin/command" component={AdminCommandCenter} />
                <Route path="/admin/custom-forms" component={AdminCustomForms} />
                <Route path="/owner/hireos/workflow-builder" component={HireOSWorkflowBuilder} />
                <Route path="/employees/:employeeId/file-cabinet" component={EmployeeFileCabinet} />
                <Route path="/support/dashboard" component={SupportDashboard} />
                <Route path="/platform/admin" component={PlatformAdmin} />
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
                <Route path="/support/chat" component={HelpdeskChat} />
                <Route path="/live-chat" component={LiveChatroom} />
                <Route path="/helpdesk5" component={HelpDesk5} />
                <Route path="/mobile-chat" component={MobileChatPage} />
                <Route path="/design-comparison" component={DesignComparison} />
                <Route path="/logo-showcase" component={LogoShowcase} />
                <Route path="/support" component={Support} />
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
        </div>
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
                <AppContent />
                <FloatingChatButton />
                <Toaster />
              </TooltipProvider>
            </TransitionProvider>
          </WorkspaceThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}