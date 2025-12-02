// Multi-tenant SaaS Scheduling Platform

import { Switch, Route, useLocation, Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
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
import { UniversalAnimationProvider } from "@/contexts/universal-animation-context";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/protected-route";
import { LeaderRoute } from "@/components/leader-route";
import { OwnerRoute } from "@/components/owner-route";
import { PlatformAdminRoute } from "@/components/platform-admin-route";
import { DemoBanner } from "@/components/demo-banner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorBoundary } from "@/components/errors/GlobalErrorBoundary";
import { ServiceHealthProvider } from "@/contexts/ServiceHealthContext";
import { ForceRefreshProvider } from "@/contexts/ForceRefreshProvider";
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
import OwnerAnalytics from "@/pages/owner-analytics";
import HRBenefits from "@/pages/hr-benefits";
import HRReviews from "@/pages/hr-reviews";
import HRPTO from "@/pages/hr-pto";
import HRTerminations from "@/pages/hr-terminations";
import HelpDesk from "@/pages/HelpDesk";
// import SalesPortal from "@/pages/sales-portal";
import LogoShowcase from "@/pages/logo-showcase";
import MascotDemo from "@/pages/mascot-demo";
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
import CommunicationsOnboarding from "@/pages/communications-onboarding";
import Diagnostics from "@/pages/diagnostics";
import PrivateMessages from "@/pages/private-messages";
import Training from "@/pages/training-os";
import Budgeting from "@/pages/budgeting";
import AIIntegrations from "@/pages/ai-integrations";
import Records from "@/pages/records";
import Insights from "@/pages/insights";
import CommunicationFamilyPage from "@/pages/category-communication";
import OperationsFamilyPage from "@/pages/category-operations";
import GrowthFamilyPage from "@/pages/category-growth";
import PlatformFamilyPage from "@/pages/category-platform";
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
import SupportAIConsole from "@/pages/support-ai-console";
import SystemHealth from "@/pages/system-health";
import { HeaderChatButton } from "@/components/header-chat-button";
import { ReenableChatButton } from "@/components/reenable-chat-button";
import { ChatroomNotificationListener } from "@/components/chatroom-notification-listener";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { HeaderBillboard } from "@/components/header-billboard";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { NotificationsPopover } from "@/components/notifications-popover";
import { WorkspaceTabsNav } from "@/components/workspace-tabs-nav";
import { FloatingSupportChat } from "@/components/floating-support-chat";
import { CoAITwinMascot } from "@/components/coai-twin-mascot";
import { useMascotMode } from "@/hooks/use-mascot-mode";
import { useMascotPosition } from "@/hooks/use-mascot-position";
import { useMascotRoaming } from "@/hooks/use-mascot-roaming";
import MASCOT_CONFIG, { shouldHideMascot, getDeviceSizes, getCurrentHoliday } from "@/config/mascotConfig";
import { thoughtManager, type Thought } from "@/lib/mascot/ThoughtManager";
import { useMascotAIIntegration } from "@/hooks/use-mascot-ai";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";

function MascotRenderer() {
  const { user } = useAuth();
  useMascotAIIntegration(user?.workspaceId);
  const currentMode = useMascotMode();
  const [location] = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [currentThought, setCurrentThought] = useState<Thought | null>(null);
  const [floatOffset, setFloatOffset] = useState({ x: 0, y: 0 });
  const [dragVelocity, setDragVelocity] = useState(0);
  const lastPosRef = useRef({ x: 0, y: 0, time: 0 });
  const floatTimeRef = useRef(0);
  const floatAnimRef = useRef<number | null>(null);
  
  const sizes = getDeviceSizes();
  const { position, isExpanded, isDragging, toggleExpanded, resetPosition, setRoamingPosition, dragHandlers } = useMascotPosition(sizes.defaultSize, isMobile);
  
  const bubbleSize = isExpanded ? sizes.expandedSize : sizes.defaultSize;
  
  const { isRoaming } = useMascotRoaming(
    position,
    setRoamingPosition,
    bubbleSize,
    isDragging,
    isExpanded
  );
  const zoomScale = isDragging ? MASCOT_CONFIG.floatMotion.dragZoomScale : 1;
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MASCOT_CONFIG.breakpoints.mobile);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  useEffect(() => {
    const unsubscribe = thoughtManager.subscribe((thought) => {
      setCurrentThought(thought);
    });
    thoughtManager.startRotation();
    
    const holiday = getCurrentHoliday();
    if (holiday) {
      setTimeout(() => thoughtManager.triggerHolidayGreeting(), 2000);
    }
    
    return () => {
      unsubscribe();
      thoughtManager.stopRotation();
    };
  }, []);
  
  useEffect(() => {
    thoughtManager.triggerModeThought(currentMode);
  }, [currentMode]);
  
  useEffect(() => {
    if (!MASCOT_CONFIG.floatMotion.enabled || isDragging) {
      if (floatAnimRef.current) {
        cancelAnimationFrame(floatAnimRef.current);
        floatAnimRef.current = null;
      }
      setFloatOffset({ x: 0, y: 0 });
      return;
    }
    
    const animate = () => {
      floatTimeRef.current += 16;
      const { amplitude, frequency } = MASCOT_CONFIG.floatMotion;
      setFloatOffset({
        x: Math.sin(floatTimeRef.current * frequency) * amplitude.x,
        y: Math.sin(floatTimeRef.current * frequency * 1.3) * amplitude.y,
      });
      floatAnimRef.current = requestAnimationFrame(animate);
    };
    
    floatAnimRef.current = requestAnimationFrame(animate);
    return () => {
      if (floatAnimRef.current) cancelAnimationFrame(floatAnimRef.current);
    };
  }, [isDragging]);
  
  useEffect(() => {
    if (isDragging) {
      const now = Date.now();
      const dx = position.x - lastPosRef.current.x;
      const dy = position.y - lastPosRef.current.y;
      const dt = Math.max(now - lastPosRef.current.time, 1);
      const velocity = Math.sqrt(dx * dx + dy * dy) / dt * 16;
      
      setDragVelocity(velocity);
      lastPosRef.current = { x: position.x, y: position.y, time: now };
      
      if (velocity > 5 && Math.random() > 0.92) {
        thoughtManager.triggerReaction('drag_move', velocity);
      }
    } else if (dragVelocity > 0) {
      thoughtManager.triggerReaction('drag_end', dragVelocity);
      setDragVelocity(0);
    }
  }, [position, isDragging]);
  
  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      thoughtManager.triggerReaction('tap');
    }
  }, [isDragging]);
  
  if (!MASCOT_CONFIG.enabled || shouldHideMascot(location)) return null;
  
  const effectiveX = position.x + (isDragging ? 0 : floatOffset.x);
  const effectiveY = position.y + (isDragging ? 0 : floatOffset.y);
  
  return (
    <div 
      className={`fixed select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ 
        bottom: effectiveY,
        right: effectiveX,
        width: bubbleSize,
        height: bubbleSize,
        zIndex: MASCOT_CONFIG.zIndex,
        transform: `scale(${zoomScale})`,
        transformOrigin: 'center',
        transition: isDragging 
          ? 'transform 150ms ease-out' 
          : `all ${MASCOT_CONFIG.animation.transitionDuration}ms ease-out, transform 150ms ease-out`,
      }}
      data-testid="mascot-container"
    >
      <div 
        className="relative group w-full h-full" 
        {...dragHandlers}
        onClick={handleTap}
      >
        <CoAITwinMascot 
          mode={currentMode} 
          variant={isExpanded ? 'expanded' : 'mini'}
          size={bubbleSize}
        />
        
        {currentThought && (
          <div 
            className={`absolute -top-16 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-slate-900/95 border border-slate-600 text-slate-100 whitespace-nowrap shadow-lg pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300 ${isMobile ? 'text-xs max-w-[160px] whitespace-normal text-center' : 'text-sm'}`}
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            <div className="flex items-center gap-2 justify-center">
              <span className="text-lg shrink-0">{currentThought.emoticon}</span>
              <span className="font-medium">{currentThought.text}</span>
            </div>
            <div 
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-600 rotate-45"
            />
          </div>
        )}
        
        <div className={`absolute top-1 right-1 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-auto ${isDragging ? 'hidden' : ''}`}>
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}
            className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-500 flex items-center justify-center hover:from-slate-500 hover:to-slate-700 transition-all shadow-lg hover:shadow-xl"
            title={isExpanded ? "Minimize" : "Expand"}
            data-testid="button-mascot-toggle-size"
          >
            {isExpanded ? (
              <Minimize2 className="w-3 h-3 text-slate-100" />
            ) : (
              <Maximize2 className="w-3 h-3 text-slate-100" />
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); resetPosition(); }}
            className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-500 flex items-center justify-center hover:from-slate-500 hover:to-slate-700 transition-all shadow-lg hover:shadow-xl"
            title="Reset position"
            data-testid="button-mascot-reset-position"
          >
            <RotateCcw className="w-3 h-3 text-slate-100" />
          </button>
        </div>
        
        <div className={`absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-all pointer-events-none font-medium ${isDragging ? 'hidden' : ''}`}>
          Drag to move
        </div>
      </div>
    </div>
  );
}

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
    "/mascot-demo",
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
        <Route path="/mascot-demo" component={MascotDemo} />
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
                <NotificationsPopover />
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
              <Route path="/owner-analytics">
                <OwnerRoute>
                  <OwnerAnalytics />
                </OwnerRoute>
              </Route>
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
              <Route path="/communications"><Redirect to="/chatrooms" /></Route>
              <Route path="/communications/onboarding" component={CommunicationsOnboarding} />
              <Route path="/diagnostics" component={Diagnostics} />
              <Route path="/messages" component={PrivateMessages} />
              <Route path="/training" component={Training} />
              <Route path="/budgeting" component={Budgeting} />
              <Route path="/ai-integrations" component={AIIntegrations} />
              <Route path="/records" component={Records} />
              <Route path="/insights" component={Insights} />

              {/* Feature Category Pages */}
              <Route path="/category/communication" component={CommunicationFamilyPage} />
              <Route path="/category/operations" component={OperationsFamilyPage} />
              <Route path="/category/growth" component={GrowthFamilyPage} />
              <Route path="/category/platform" component={PlatformFamilyPage} />
              
              {/* Legacy OS route redirects */}
              <Route path="/comm-os"><Redirect to="/communications" /></Route>
              <Route path="/query-os"><Redirect to="/diagnostics" /></Route>
              <Route path="/budget-os"><Redirect to="/budgeting" /></Route>
              <Route path="/record-os"><Redirect to="/records" /></Route>
              <Route path="/insight-os"><Redirect to="/insights" /></Route>
              <Route path="/os-family/communication"><Redirect to="/category/communication" /></Route>
              <Route path="/os-family/operations"><Redirect to="/category/operations" /></Route>
              <Route path="/os-family/growth"><Redirect to="/category/growth" /></Route>
              <Route path="/os-family/platform"><Redirect to="/category/platform" /></Route>

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
              {/* Consolidated Chat Routes - ONE UNIVERSAL CHAT via HelpAI Orchestration */}
              <Route path="/chat" component={HelpAIOrchestration} /> {/* HelpAI Orchestration - Universal chat and AI brain */}
              <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
              <Route path="/chatrooms" component={Chatrooms} /> {/* Organization chatroom discovery and bulk join */}
              <Route path="/support/chatrooms"><Redirect to="/chatrooms" /></Route> {/* Redirect support chatrooms to unified page */}
              <Route path="/helpai-orchestration" component={HelpAIOrchestration} /> {/* HelpAI Orchestration System */}
              
              {/* Redirect legacy chat routes to unified /chat */}
              <Route path="/support/chat"><Redirect to="/chat" /></Route>
              <Route path="/live-chat"><Redirect to="/chat" /></Route>
              <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
              <Route path="/logo-showcase" component={LogoShowcase} />
              <Route path="/mascot-demo" component={MascotDemo} />
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
                    {/* Chat Button - Header mounted in middle */}
                    <HeaderChatButton />
                    {/* Universal Notifications Bell - Shows all updates, alerts, and system messages */}
                    <NotificationsPopover />
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
                <Route path="/support/ai-console" component={SupportAIConsole} />
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
                <Route path="/communications"><Redirect to="/chatrooms" /></Route>
                <Route path="/communications/onboarding" component={CommunicationsOnboarding} />
                <Route path="/chatrooms" component={Chatrooms} />
                <Route path="/diagnostics" component={Diagnostics} />
                <Route path="/messages" component={PrivateMessages} />
                <Route path="/training" component={Training} />
                <Route path="/budgeting" component={Budgeting} />
                <Route path="/ai-integrations" component={AIIntegrations} />
                <Route path="/records" component={Records} />
                <Route path="/insights" component={Insights} />

                {/* Feature Category Pages */}
                <Route path="/category/communication" component={CommunicationFamilyPage} />
                <Route path="/category/operations" component={OperationsFamilyPage} />
                <Route path="/category/growth" component={GrowthFamilyPage} />
                <Route path="/category/platform" component={PlatformFamilyPage} />
                
                {/* Legacy OS route redirects */}
                <Route path="/comm-os"><Redirect to="/communications" /></Route>
                <Route path="/query-os"><Redirect to="/diagnostics" /></Route>
                <Route path="/budget-os"><Redirect to="/budgeting" /></Route>
                <Route path="/record-os"><Redirect to="/records" /></Route>
                <Route path="/insight-os"><Redirect to="/insights" /></Route>
                <Route path="/os-family/communication"><Redirect to="/category/communication" /></Route>
                <Route path="/os-family/operations"><Redirect to="/category/operations" /></Route>
                <Route path="/os-family/growth"><Redirect to="/category/growth" /></Route>
                <Route path="/os-family/platform"><Redirect to="/category/platform" /></Route>

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
                {/* Consolidated Chat Routes - ONE UNIVERSAL CHAT via HelpAI Orchestration */}
                <Route path="/chat" component={HelpAIOrchestration} /> {/* HelpAI Orchestration - Universal chat and AI brain */}
                <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
                <Route path="/support/chatrooms"><Redirect to="/chatrooms" /></Route> {/* Redirect support chatrooms to unified page */}
                
                {/* Redirect legacy chat routes to unified /chat */}
                <Route path="/support/chat"><Redirect to="/chat" /></Route>
                <Route path="/live-chat"><Redirect to="/chat" /></Route>
                <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
                <Route path="/logo-showcase" component={LogoShowcase} />
                <Route path="/mascot-demo" component={MascotDemo} />
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
          <ForceRefreshProvider>
          <UniversalLoadingGateProvider>
            <OverlayControllerProvider>
              <ThemeProvider defaultTheme="light">
                <WorkspaceThemeProvider>
                  <TransitionProvider>
                  <TooltipProvider>
                    <UniversalAnimationProvider>
                      <ResponsiveAppFrame>
                        <ChatroomNotificationListener />
                        <AppContent />
                        <FloatingSupportChat />
                        <ReenableChatButton />
                        <Toaster />
                      </ResponsiveAppFrame>
                      {/* CoAI Twin Mascot - UNIVERSAL visibility on ALL pages including public/guest routes */}
                      <MascotRenderer />
                    </UniversalAnimationProvider>
                  </TooltipProvider>
                  </TransitionProvider>
                </WorkspaceThemeProvider>
              </ThemeProvider>
            </OverlayControllerProvider>
          </UniversalLoadingGateProvider>
        </ForceRefreshProvider>
        </ServiceHealthProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}