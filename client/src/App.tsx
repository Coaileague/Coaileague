// Multi-tenant SaaS Scheduling Platform
// Reference: javascript_log_in_with_replit blueprint

import { Switch, Route, useLocation } from "wouter";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import CustomLogin from "@/pages/custom-login";
import CustomRegister from "@/pages/custom-register";
import Pricing from "@/pages/pricing";
import Contact from "@/pages/contact";
import Support from "@/pages/support";
import Dashboard from "@/pages/dashboard-compact";
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
import SupportDashboard from "@/pages/support-dashboard";
import SalesPortal from "@/pages/sales-portal";
import DesignComparison from "@/pages/design-comparison";
import LogoShowcase from "@/pages/logo-showcase";
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
import QueryOS from "@/pages/query-os";
import PrivateMessages from "@/pages/private-messages";
import TrainingOS from "@/pages/training-os";
import BudgetOS from "@/pages/budget-os";
import IntegrationOS from "@/pages/integration-os";
import CommunicationFamilyPage from "@/pages/os-family-communication";
import OperationsFamilyPage from "@/pages/os-family-operations";
import GrowthFamilyPage from "@/pages/os-family-growth";
import PlatformFamilyPage from "@/pages/os-family-platform";
import { FloatingChatButton } from "@/components/floating-chat-button";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { Sparkles } from "lucide-react";

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const isMobile = useIsMobile();
  
  // Check if on mobile chat OR desktop live-chat - use window.location instead of useLocation() hook
  // to avoid React Hooks issues with conditional rendering
  const isMobileChat = window.location.pathname === '/mobile-chat';
  const isHelpDesk = window.location.pathname === '/live-chat' || window.location.pathname.startsWith('/live-chat');
  
  // Routes that should NOT show bottom nav (full-screen experiences)
  const hideBottomNavRoutes = ['/mobile-chat', '/live-chat', '/login', '/register', '/onboarding'];
  const shouldShowBottomNav = isMobile && isAuthenticated && !hideBottomNavRoutes.some(route => 
    window.location.pathname.startsWith(route)
  );
  
  // Custom sidebar width for better workspace layout (increased for longer menu text)
  const style = {
    "--sidebar-width": "20rem",  // 320px - prevents text truncation
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
        {/* Removed /mobile-chat from here - FIXED: Duplicate route was causing double WebSocket connections */}
        <Route path="/design-comparison" component={DesignComparison} />
        <Route path="/logo-showcase" component={LogoShowcase} />
        <Route path="/onboarding/:token" component={OnboardingPage} />
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
              <header className="flex items-center justify-end px-2 sm:px-3 py-1 border-b bg-card shrink-0">
                <div className="flex items-center gap-1 sm:gap-2">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowOnboarding(true)}
                    data-testid="button-open-onboarding"
                    title="Platform Tour"
                    className="h-8 w-8 sm:h-9 sm:w-9"
                  >
                    <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                  <ThemeToggle />
                </div>
              </header>
            )}
            
            <main className={`flex-1 overflow-auto bg-transparent min-h-0 ${shouldShowBottomNav ? 'pb-16' : ''}`}>
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
                <Route path="/engagement/dashboard" component={EngagementDashboard} />
                <Route path="/engagement/employee" component={EmployeeEngagement} />
                <Route path="/clients" component={Clients} />
                <Route path="/invoices" component={Invoices} />
                <Route path="/reports" component={Reports} />
                <Route path="/analytics" component={Analytics} />
                <Route path="/billing" component={Billing} />
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
                <Route path="/query-os" component={QueryOS} />
                <Route path="/messages" component={PrivateMessages} />
                <Route path="/training" component={TrainingOS} />
                <Route path="/budget" component={BudgetOS} />
                <Route path="/integrations" component={IntegrationOS} />
                
                {/* OS Family Showcase Pages */}
                <Route path="/os-family/communication" component={CommunicationFamilyPage} />
                <Route path="/os-family/operations" component={OperationsFamilyPage} />
                <Route path="/os-family/growth" component={GrowthFamilyPage} />
                <Route path="/os-family/platform" component={PlatformFamilyPage} />
                
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
                <Route path="/platform/sales" component={SalesPortal} />
                <Route path="/employee/portal" component={EmployeePortal} />
                <Route path="/auditor/portal" component={AuditorPortal} />
                <Route path="/client/portal" component={ClientPortal} />
                <Route path="/settings" component={Settings} />
                <Route path="/employee/profile" component={EmployeeProfile} />
                <Route path="/contact" component={Contact} />
                <Route path="/support/tickets" component={CustomerSupport} />
                <Route path="/support/chat" component={HelpdeskChat} />
                <Route path="/live-chat" component={LiveChatroom} />
                <Route path="/mobile-chat" component={MobileChatPage} />
                <Route path="/design-comparison" component={DesignComparison} />
                <Route path="/logo-showcase" component={LogoShowcase} />
                <Route path="/support" component={Support} />
                <Route component={NotFound} />
              </Switch>
            </main>
            
            {/* Mobile Bottom Navigation */}
            {shouldShowBottomNav && <MobileBottomNav />}
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
