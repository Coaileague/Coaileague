// Multi-tenant SaaS Scheduling Platform
// Reference: javascript_log_in_with_replit blueprint

import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeProvider as WorkspaceThemeProvider } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProtectedRoute } from "@/components/protected-route";
import { DemoBanner } from "@/components/demo-banner";
import { CADMenuBar } from "@/components/cad-menu-bar";
import { CADToolbar } from "@/components/cad-toolbar";
import { CADStatusBar } from "@/components/cad-status-bar";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Pricing from "@/pages/pricing";
import Contact from "@/pages/contact";
import Support from "@/pages/support";
import Dashboard from "@/pages/dashboard";
import Schedule from "@/pages/schedule";
import TimeTracking from "@/pages/time-tracking";
import Employees from "@/pages/employees";
import Clients from "@/pages/clients";
import Invoices from "@/pages/invoices";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import OnboardingPage from "@/pages/onboarding";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  
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
        <Route path="/pricing" component={Pricing} />
        <Route path="/contact" component={Contact} />
        <Route path="/support" component={Support} />
        <Route path="/onboarding/:token" component={OnboardingPage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <ProtectedRoute>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex flex-col h-screen w-full bg-[hsl(var(--cad-background))] relative">
          {/* Animated Background Mesh */}
          <div className="bg-mesh" aria-hidden="true" />
          
          <DemoBanner />
          <CADMenuBar />
          <CADToolbar />
          
          <div className="flex flex-1 min-h-0 relative z-10">
            <AppSidebar />
            <main className="flex-1 overflow-hidden bg-transparent">
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/schedule" component={Schedule} />
                <Route path="/time-tracking" component={TimeTracking} />
                <Route path="/employees" component={Employees} />
                <Route path="/clients" component={Clients} />
                <Route path="/invoices" component={Invoices} />
                <Route path="/analytics" component={Analytics} />
                <Route path="/settings" component={Settings} />
                <Route path="/contact" component={Contact} />
                <Route path="/support" component={Support} />
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
          
          <CADStatusBar />
        </div>
      </SidebarProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <WorkspaceThemeProvider>
          <TooltipProvider>
            <AppContent />
            <Toaster />
          </TooltipProvider>
        </WorkspaceThemeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
