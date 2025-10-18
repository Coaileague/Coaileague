// Multi-tenant SaaS Scheduling Platform
// Reference: javascript_log_in_with_replit blueprint

import { Switch, Route, useLocation } from "wouter";
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
import { ProtectedRoute } from "@/components/protected-route";
import { LeaderRoute } from "@/components/leader-route";
import { DemoBanner } from "@/components/demo-banner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/command-palette";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import CustomLogin from "@/pages/custom-login";
import CustomRegister from "@/pages/custom-register";
import Pricing from "@/pages/pricing";
import Contact from "@/pages/contact";
import Support from "@/pages/support";
import Dashboard from "@/pages/dashboard-compact";
import { Redirect } from "wouter";
import SmartScheduleOS from "@/pages/schedule-smart";
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
import { FloatingChatButton } from "@/components/floating-chat-button";

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  
  // Check if on mobile chat - use window.location instead of useLocation() hook
  // to avoid React Hooks issues with conditional rendering
  const isMobileChat = window.location.pathname === '/mobile-chat';
  
  // Custom sidebar width for better workspace layout
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading authentication" />
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
        <Route path="/live-chat" component={LiveChatroom} />
        <Route path="/mobile-chat" component={MobileChatPage} />
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
            
            {/* Global Header with Sidebar Toggle - Hidden for mobile chat */}
            {!isMobileChat && (
              <header className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
                <div className="flex items-center gap-2">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                </div>
              </header>
            )}
            
            <main className="flex-1 overflow-auto bg-transparent min-h-0">
              <Switch>
                <Route path="/">
                  {isRootAdmin ? <RootAdminDashboard /> : <Dashboard />}
                </Route>
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/schedule" component={SmartScheduleOS} />
                <Route path="/time-tracking" component={TimeTracking} />
                <Route path="/employees" component={Employees} />
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
          </div>
        </div>
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
