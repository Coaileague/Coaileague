// Multi-tenant SaaS Scheduling Platform

import { Switch, Route, useLocation, Link } from "wouter";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TrinityAnnouncementDisplay } from "@/components/trinity-announcement";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { GraduationCap, Settings2, Search, Menu, Sparkles, LogOut, User, Bell, Mail } from "lucide-react";
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
import { SeasonalThemeProvider, useSeasonalTheme } from "@/context/SeasonalThemeContext";
import { SimpleModeProvider } from "@/contexts/SimpleModeContext";
import { SimpleModeToggle } from "@/components/SimpleModeToggle";
import SeasonalEffectsLayer from "@/components/effects/SeasonalEffectsLayer";
import { Button } from "@/components/ui/button";
import { PaymentEnforcementProvider } from "@/hooks/use-payment-enforcement";
import { ProtectedRoute } from "@/components/protected-route";
import { LeaderRoute } from "@/components/leader-route";
import { OwnerRoute } from "@/components/owner-route";
import { PlatformAdminRoute } from "@/components/platform-admin-route";
import { DemoBanner } from "@/components/demo-banner";
import { AISystemStatusBanner } from "@/components/ai-system-status-banner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorBoundary } from "@/components/errors/GlobalErrorBoundary";
import { ServiceHealthProvider } from "@/contexts/ServiceHealthContext";
import { ForceRefreshProvider } from "@/contexts/ForceRefreshProvider";
import { CommandPalette } from "@/components/command-palette";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile, ResponsiveAppFrame } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileQuickActionsFAB } from "@/components/mobile/MobileQuickActionsFAB";
import { PWAInstallPrompt } from "@/components/mobile/PWAInstallPrompt";
import { performLogout } from "@/lib/logoutHandler";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";
import { LoadingScreen } from "@/components/LoadingScreen";
import { CoAIleagueLogo } from "@/components/coaileague-logo";
import NotFound from "@/pages/not-found";
import OwnerAnalytics from "@/pages/owner-analytics";
import RootAdminDashboard from "@/pages/root-admin-dashboard";
import SystemHealth from "@/pages/system-health";
import Infrastructure from "@/pages/infrastructure";
import CreditAnalyticsDashboard from "@/pages/credit-analytics-dashboard";
import LeadersHub from "@/pages/leaders-hub";
import TrinityInsights from "@/pages/trinity-insights";
import Homepage from "@/pages/homepage";
import TrinityChat from "@/pages/trinity-chat"; // Trinity Chat Interface with BUDDY metacognition
import CustomLogin from "@/pages/custom-login";
import CustomRegister from "@/pages/custom-register";
import UniversalMarketing from "@/pages/universal-marketing";
import Contact from "@/pages/contact";
import ROICalculator from "@/pages/roi-calculator"; // Marketing: ROI Calculator landing page
import ComparePage from "@/pages/compare"; // Marketing: Competitor comparison pages
import TemplatesPage from "@/pages/templates"; // Marketing: Industry-specific templates
import Support from "@/pages/support";
import TermsOfService from "@/pages/terms-of-service";
import PrivacyPolicy from "@/pages/privacy-policy";
import Dashboard from "@/pages/dashboard";
import { Redirect } from "wouter";
import UniversalSchedule from "@/pages/universal-schedule";
import ScheduleMobileFirst from "@/pages/schedule-mobile-first";
import WorkspaceSales from "@/pages/workspace-sales";
import TimeTracking from "@/pages/time-tracking";
import Employees from "@/pages/employees";
import Clients from "@/pages/clients";
import OrgManagement from "@/pages/org-management";
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
import AdminCustomForms from "@/pages/admin-custom-forms";
import PlatformAdmin from "@/pages/platform-admin";
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
import Chatrooms from "@/pages/chatrooms";
import PayrollDashboard from "@/pages/payroll-dashboard";
import HelpAIOrchestration from "@/pages/helpai-orchestration";
import OrchestrationDashboard from "@/pages/orchestration-dashboard";
import MyPaychecks from "@/pages/my-paychecks";
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
import WorkerDashboard from "@/pages/worker-dashboard";
import WorkerIncidents from "@/pages/worker-incidents";
import Training from "@/pages/training-os";
import Budgeting from "@/pages/budgeting";
import AIIntegrations from "@/pages/ai-integrations";
import EmployeeRecognition from "@/pages/employee-recognition";
import AlertConfiguration from "@/pages/alert-configuration";
import AccountingIntegrations from "@/pages/accounting-integrations";
import QuickBooksImport from "@/pages/quickbooks-import";
import ResolutionInbox from "@/pages/resolution-inbox";
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
import OnboardingStart from "@/pages/onboarding-start";
import Updates from "@/pages/updates";
import Help from "@/pages/help";
import CompanyReports from "./pages/company-reports";
import PayInvoice from "@/pages/pay-invoice";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Expenses from "@/pages/expenses";
import ExpenseApprovals from "@/pages/expense-approvals";
import I9Compliance from "@/pages/i9-compliance";
import ComplianceReports from "@/pages/compliance-reports";
import Policies from "@/pages/policies";
import RoleManagement from "@/pages/role-management";
import ManagerDashboard from "@/pages/manager-dashboard";
import PendingTimeEntries from "@/pages/pending-time-entries";
import TimesheetApprovals from "@/pages/timesheet-approvals";
import Error403 from "@/pages/error-403";
import Error404 from "@/pages/error-404";
import Error500 from "@/pages/error-500";
import IntegrationsPage from "@/pages/integrations-page";
import TrinitySelfEditGovernancePage from "@/pages/trinity-self-edit-governance";
import OversightHub from "@/pages/oversight-hub";
import WorkflowApprovals from "@/pages/workflow-approvals";
import AICommandCenter from "@/pages/ai-command-center";
import SupportCommandConsole from "@/pages/support-command-console";
import SupportBugDashboard from "@/pages/support-bug-dashboard";
import EndUserControls from "@/pages/end-user-controls";
import TrinityCommandCenter from "@/pages/trinity-command-center";
import AuditLogs from "@/pages/audit-logs";
import AIAuditLogViewer from "@/pages/ai-audit-log-viewer";
import AutomationControl from "@/pages/automation-control";
import AdminBanners from "@/pages/admin-banners";
import AdminTicketReviews from "@/pages/admin-ticket-reviews";
import AutomationAuditLog from "@/pages/automation-audit-log";
import AutomationSettings from "@/pages/automation-settings";
import AIBrainDashboard from "@/pages/ai-brain-dashboard";
import SupportAIConsole from "@/pages/support-ai-console";
import AssistedOnboarding from "@/pages/assisted-onboarding";
import WorkspaceOnboarding from "@/pages/workspace-onboarding";
import AcceptHandoff from "@/pages/accept-handoff";
import WorkboardDashboard from "@/components/workboard/WorkboardDashboard";
import InboxPage from "@/pages/inbox";
import { HeaderChatButton } from "@/components/header-chat-button";
import { ReenableChatButton } from "@/components/reenable-chat-button";
import { FloatingSupportChat } from "@/components/floating-support-chat";
import { ChatroomNotificationListener } from "@/components/chatroom-notification-listener";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { HeaderBillboard } from "@/components/header-billboard";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { NotificationsPopover } from "@/components/notifications-popover";
import { WorkspaceTabsNav } from "@/components/workspace-tabs-nav";
import { SetupGuidePanel } from "@/components/setup-guide-panel";
import TrinityRedesign from "@/components/trinity-redesign";
import { CompactBubble } from "@/components/mascot/CompactBubble";
import { FestiveDialogueBubble } from "@/components/mascot/FestiveDialogueBubble";
import { MascotTaskBox } from "@/components/mascot-task-box";
import { useMascotMode } from "@/hooks/use-mascot-mode";
import { useAIActivity } from "@/hooks/use-ai-activity";
import { useMascotPosition } from "@/hooks/use-mascot-position";
import { useMascotRoaming } from "@/hooks/use-mascot-roaming";
import { useMascotMouseFollow } from "@/hooks/use-mascot-mouse-follow";
import { useSmartBubblePlacement, getArrowStyles } from "@/hooks/use-smart-bubble-placement";
import { useOverlayAwareness } from "@/hooks/use-overlay-awareness";
import MASCOT_CONFIG, { 
  shouldHideMascot, 
  getDeviceSizes, 
  EMOTE_CONFIGS,
  canAccessTrinity 
} from "@/config/mascotConfig";
import { thoughtManager, type Thought } from "@/lib/mascot/ThoughtManager";
import { useMascotAIIntegration } from "@/hooks/use-mascot-ai";
import { useMascotObserver } from "@/hooks/use-mascot-observer";
import { useMascotEmotes, setGlobalEmoteTrigger } from "@/hooks/use-mascot-emotes";
import { useMascotShowcase } from "@/hooks/use-mascot-showcase";
import { useCreditAwareness } from "@/hooks/use-credit-awareness";
import { useBusinessBuddyTier, getAllowedModes, getUpgradeNudgeMessage } from "@/hooks/use-business-buddy-tier";
import { useTrinityPersona } from "@/hooks/use-trinity-persona";
import { useTrinityDiagnostics } from "@/hooks/use-trinity-diagnostics";
import { useSessionSync } from "@/hooks/use-session-sync";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { MobileVoiceCommandOverlay } from "@/components/mobile/MobileVoiceCommandOverlay";

// Trinity modes are driven by system state, not user interaction
// Mode changes happen automatically based on AI activity, seasons, etc.

function MascotRenderer() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.activeWorkspaceId || (user as any)?.workspaceId;
  useMascotAIIntegration(workspaceId);
  useMascotObserver(true);
  useCreditAwareness(); // Business Buddy credit awareness for low balance warnings
  
  // Session sync for multi-device real-time updates (mobile + desktop see same data)
  useSessionSync({ autoInvalidate: true });
  
  // Trinity context integration - syncs RBAC context with ThoughtManager for role-aware persona
  useTrinityPersona(workspaceId);
  
  // Trinity diagnostics - connects Quick Fix suggestions for support/root roles
  useTrinityDiagnostics(workspaceId);
  
  // Business Buddy tier system - controls mascot features based on subscription
  const { tier, isDemo, hasFullAccess, shouldShowUpgradeNudge, tierLabel } = useBusinessBuddyTier();
  const allowedModes = useMemo(() => getAllowedModes(tier), [tier]);
  
  // Upgrade nudge timer - periodically remind non-subscribers
  const lastNudgeRef = useRef<number>(0);
  
  // Get mascot mode - combines local state with real-time AI activity
  const localMode = useMascotMode();
  const { mascotMode: aiActivityMode, isActive: isAIActive, message: aiMessage } = useAIActivity({
    workspaceId,
    userId: user?.id,
  });
  
  // Use SeasonalThemeContext for AI-orchestrated seasonal state (respects SeasonalSubagent)
  const { seasonId, isHoliday } = useSeasonalTheme();
  
  // Determine if we should apply holiday mode (only when SeasonalSubagent says so)
  const isChristmasSeason = seasonId === 'christmas';
  
  const currentMode = useMemo(() => {
    // AI activity takes priority over local mode when active
    if (isAIActive && aiActivityMode !== 'IDLE') {
      return aiActivityMode;
    }
    // Apply seasonal mode override during holidays (controlled by SeasonalSubagent)
    if (localMode === 'IDLE' && isChristmasSeason) {
      return 'HOLIDAY';
    }
    return localMode;
  }, [localMode, aiActivityMode, isAIActive, isChristmasSeason]);
  
  const [location] = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [currentThought, setCurrentThought] = useState<Thought | null>(null);
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [voiceModeOverride, setVoiceModeOverride] = useState<string | null>(null);
  const floatOffsetRef = useRef({ x: 0, y: 0 });
  const dragVelocityRef = useRef(0);
  const lastPosRef = useRef({ x: 0, y: 0, time: 0 });
  const floatTimeRef = useRef(0);
  const floatAnimRef = useRef<number | null>(null);
  const mascotContainerRef = useRef<HTMLDivElement>(null);
  
  // Emote system integration
  const { emote, config: emoteConfig, triggerEmote, triggerByContext } = useMascotEmotes();
  
  // Memoize emote state to prevent unnecessary re-renders
  const emoteState = useMemo(() => ({
    type: emote,
    purpleBehavior: emoteConfig.starBehavior.purple,
    cyanBehavior: emoteConfig.starBehavior.cyan,
    goldBehavior: emoteConfig.starBehavior.cyan,
    particleEffect: emoteConfig.particleEffect,
  }), [emote, emoteConfig]);
  
  // Stable refs for emote functions to prevent effect re-runs
  const triggerByContextRef = useRef(triggerByContext);
  triggerByContextRef.current = triggerByContext;
  const triggerEmoteRef = useRef(triggerEmote);
  triggerEmoteRef.current = triggerEmote;
  
  // Set global emote trigger for use outside React - only run once
  useEffect(() => {
    setGlobalEmoteTrigger((trigger: string) => triggerByContextRef.current(trigger));
  }, []);
  
  const sizes = getDeviceSizes();
  const { position, isExpanded, isDragging, toggleExpanded, resetPosition, setRoamingPosition, dragHandlers } = useMascotPosition(sizes.defaultSize, isMobile);
  
  const bubbleSize = isExpanded ? sizes.expandedSize : sizes.defaultSize;
  
  // Overlay awareness - auto-shift Trinity when popovers/dialogs are open
  const { isAnyOverlayOpen, getOverlayQuadrant } = useOverlayAwareness();
  const overlayQuadrant = isAnyOverlayOpen ? getOverlayQuadrant() : null;
  
  // Calculate overlay avoidance offset - shift to opposite corner when overlay is in Trinity's area
  const overlayAvoidanceOffset = useMemo(() => {
    if (!isAnyOverlayOpen || !overlayQuadrant) return { x: 0, y: 0 };
    
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const shiftDistance = Math.min(viewportWidth * 0.4, 250); // 40% of viewport width, max 250px
    const verticalShift = Math.min(viewportHeight * 0.3, 200); // 30% of viewport height, max 200px
    
    // Trinity is positioned at bottom-right by default, so shift away from overlays in that area
    // Overlay in top-right: move Trinity left (away from notifications popover area)
    if (overlayQuadrant === 'top-right') {
      return { x: shiftDistance, y: -verticalShift }; // Move left and up
    }
    // Overlay in bottom-right: move Trinity left
    if (overlayQuadrant === 'bottom-right') {
      return { x: shiftDistance, y: 0 }; // Move left
    }
    // Overlay in bottom-left: no need to move (Trinity is on opposite side)
    if (overlayQuadrant === 'bottom-left') {
      return { x: 0, y: 0 };
    }
    // Overlay in top-left: no need to move (Trinity is on opposite side)  
    if (overlayQuadrant === 'top-left') {
      return { x: 0, y: 0 };
    }
    
    return { x: 0, y: 0 };
  }, [isAnyOverlayOpen, overlayQuadrant]);
  
  const { isRoaming, currentEffect, effectConfig, triggerRoam } = useMascotRoaming(
    position,
    setRoamingPosition,
    bubbleSize,
    isDragging,
    isExpanded
  );
  
  const { isFollowing, targetInfluence, getMouseDistance } = useMascotMouseFollow(
    position,
    bubbleSize,
    isDragging,
    isRoaming
  );
  
  // PUBLIC ROUTES for showcase mode detection
  const PUBLIC_ROUTES = useMemo(() => new Set([
    "/", "/login", "/register", "/pricing", "/contact", "/support",
    "/terms", "/privacy", "/chat", "/mobile-chat", "/live-chat",
    "/helpdesk5", "/support/chat"
  ]), []);
  
  const isPublicPage = PUBLIC_ROUTES.has(location) || 
                       location.startsWith("/onboarding/") ||
                       location.startsWith("/pay-invoice/");
  
  const isAuthenticated = !!user;
  
  // Showcase mode - shows off mascot animations on public pages
  const showcaseControl = useMascotShowcase(
    triggerEmote,
    triggerRoam,
    isPublicPage,
    isAuthenticated
  );
  
  const zoomScale = isDragging ? MASCOT_CONFIG.floatMotion.dragZoomScale : 1;
  
  // Transport effect visual styling
  const getTransportGlow = () => {
    if (!isRoaming || !effectConfig) return '';
    switch (currentEffect) {
      case 'zap': return '0 0 20px 5px #a855f7, 0 0 40px 10px rgba(168, 85, 247, 0.5)';
      case 'dash': return '0 0 15px 3px #a855f7, 0 0 30px 6px rgba(168, 85, 247, 0.4)';
      case 'glide': return '0 0 10px 2px #38bdf8, 0 0 20px 4px rgba(56, 189, 248, 0.3)';
      case 'float': return '0 0 8px 2px #38bdf8, 0 0 16px 4px rgba(56, 189, 248, 0.2)';
      default: return '';
    }
  };
  
  const bubblePlacement = useSmartBubblePlacement(mascotContainerRef, !!currentThought);
  const arrowStyles = getArrowStyles(bubblePlacement.direction);
  
  useEffect(() => {
    if (bubblePlacement.shouldAutoDismiss && currentThought) {
      // Give users ample time to read even when bubble is in collision position
      // Use the thought's expiry time if available, otherwise default to 30 seconds
      // This ensures bubbles stay visible long enough for comfortable reading
      const remainingTime = currentThought.expiresAt ? 
        Math.max(currentThought.expiresAt - Date.now(), 25000) : 30000;
      const timer = setTimeout(() => {
        setCurrentThought(null);
      }, remainingTime);
      return () => clearTimeout(timer);
    }
  }, [bubblePlacement.shouldAutoDismiss, currentThought]);
  
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
    
    return () => {
      unsubscribe();
      thoughtManager.stopRotation();
    };
  }, []);
  
  // Holiday greeting - only trigger when SeasonalSubagent indicates active holiday
  useEffect(() => {
    if (isHoliday && seasonId !== 'default') {
      const timer = setTimeout(() => thoughtManager.triggerHolidayGreeting(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHoliday, seasonId]);
  
  // Track page changes for promotional thoughts on public pages
  useEffect(() => {
    thoughtManager.setCurrentPath(location);
  }, [location]);
  
  // Track user changes for personalized greetings
  useEffect(() => {
    if (user) {
      thoughtManager.setUser({
        id: (user as any).id,
        firstName: (user as any).firstName,
        lastName: (user as any).lastName,
        email: (user as any).email,
      });
    } else {
      thoughtManager.setUser(null);
    }
  }, [user]);
  
  // Guard mode thought trigger to prevent infinite loops - only trigger when mode actually changes
  const prevModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentMode !== prevModeRef.current) {
      prevModeRef.current = currentMode;
      thoughtManager.triggerModeThought(currentMode);
    }
  }, [currentMode]);
  
  useEffect(() => {
    if (!MASCOT_CONFIG.floatMotion.enabled || isDragging) {
      if (floatAnimRef.current) {
        cancelAnimationFrame(floatAnimRef.current);
        floatAnimRef.current = null;
      }
      floatOffsetRef.current = { x: 0, y: 0 };
      if (mascotContainerRef.current) {
        mascotContainerRef.current.style.transform = '';
      }
      return;
    }
    
    const animate = () => {
      floatTimeRef.current += 16;
      const { amplitude, frequency } = MASCOT_CONFIG.floatMotion;
      floatOffsetRef.current = {
        x: Math.sin(floatTimeRef.current * frequency) * amplitude.x,
        y: Math.sin(floatTimeRef.current * frequency * 1.3) * amplitude.y,
      };
      floatAnimRef.current = requestAnimationFrame(animate);
    };
    
    floatAnimRef.current = requestAnimationFrame(animate);
    return () => {
      if (floatAnimRef.current) cancelAnimationFrame(floatAnimRef.current);
    };
  }, [isDragging]);
  
  // Track drag velocity using refs to avoid infinite loops
  const lastEmoteTriggerRef = useRef(0);
  const prevDraggingRef = useRef(false);
  
  // Store current position in ref for use in effects
  const positionRef = useRef(position);
  positionRef.current = position;
  
  // Only track drag-related state changes, not position updates during roaming
  useEffect(() => {
    // Handle drag start
    if (isDragging && !prevDraggingRef.current) {
      prevDraggingRef.current = true;
      lastPosRef.current = { x: positionRef.current.x, y: positionRef.current.y, time: Date.now() };
      triggerEmoteRef.current?.('surprised');
    }
    
    // Handle drag end
    if (!isDragging && prevDraggingRef.current) {
      prevDraggingRef.current = false;
      if (dragVelocityRef.current > 0) {
        thoughtManager.triggerReaction('drag_end', dragVelocityRef.current);
        dragVelocityRef.current = 0;
        triggerEmoteRef.current?.('happy');
      }
    }
  }, [isDragging]);
  
  // Track position during drag using a separate effect - no state updates to prevent loops
  useEffect(() => {
    if (!isDragging) return;
    
    const now = Date.now();
    const dx = position.x - lastPosRef.current.x;
    const dy = position.y - lastPosRef.current.y;
    const dt = Math.max(now - lastPosRef.current.time, 1);
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt * 16;
    
    dragVelocityRef.current = velocity;
    lastPosRef.current = { x: position.x, y: position.y, time: now };
    
    // Debounce emote triggers during drag
    if (now - lastEmoteTriggerRef.current > 500 && velocity > 5) {
      triggerEmoteRef.current?.('excited');
      lastEmoteTriggerRef.current = now;
    }
    
    if (velocity > 5 && Math.random() > 0.92) {
      thoughtManager.triggerReaction('drag_move', velocity);
    }
  }, [position.x, position.y, isDragging]);
  
  // Track roaming emote trigger state
  const lastRoamingEmoteRef = useRef(false);
  
  // Trigger emotes based on roaming state (debounced)
  useEffect(() => {
    if (isRoaming && !lastRoamingEmoteRef.current) {
      lastRoamingEmoteRef.current = true;
      triggerEmoteRef.current?.('excited');
    } else if (!isRoaming && lastRoamingEmoteRef.current) {
      lastRoamingEmoteRef.current = false;
    }
  }, [isRoaming]);
  
  // Track following emote trigger state  
  const lastFollowingEmoteRef = useRef(false);
  
  // Trigger emotes when following mouse (debounced)
  useEffect(() => {
    const shouldTrigger = isFollowing && !isRoaming && !isDragging;
    if (shouldTrigger && !lastFollowingEmoteRef.current) {
      lastFollowingEmoteRef.current = true;
      triggerEmoteRef.current?.('curious');
    } else if (!shouldTrigger && lastFollowingEmoteRef.current) {
      lastFollowingEmoteRef.current = false;
    }
  }, [isFollowing, isRoaming, isDragging]);
  
  // Track navigation for emotes
  const lastLocationRef = useRef(location);
  
  // Trigger emotes based on page navigation (debounced)
  useEffect(() => {
    if (location !== lastLocationRef.current) {
      lastLocationRef.current = location;
      triggerByContextRef.current?.('navigate');
    }
  }, [location]);
  
  // Upgrade nudge for non-Business Buddy subscribers
  // Shows periodic reminders to upgrade to full AI assistant
  // Uses 20% probability per check with 5-minute cooldown after each nudge
  // Only shows when no higher-priority thought is active
  useEffect(() => {
    if (!shouldShowUpgradeNudge) return;
    
    const NUDGE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown after showing a nudge
    const NUDGE_PROBABILITY = 0.2; // 20% chance per check
    const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
    
    const nudgeInterval = setInterval(() => {
      const now = Date.now();
      
      // Rate limit: if a nudge was shown before (lastNudgeRef > 0), enforce 5-minute cooldown
      // If no nudge shown yet (lastNudgeRef = 0), allow 20% check to proceed immediately
      const hasShownNudge = lastNudgeRef.current > 0;
      const timeSinceLastNudge = now - lastNudgeRef.current;
      const passesCooldown = !hasShownNudge || timeSinceLastNudge >= NUDGE_COOLDOWN_MS;
      
      // 20% probability check
      const passesProbability = Math.random() < NUDGE_PROBABILITY;
      
      if (passesCooldown && passesProbability && !currentThought) {
        lastNudgeRef.current = now;
        const nudgeMessage = getUpgradeNudgeMessage('general');
        thoughtManager.showSimpleThought({
          text: nudgeMessage,
          priority: 'low',
          duration: 8000,
          source: 'upgrade_nudge',
        });
      }
    }, CHECK_INTERVAL_MS);
    
    return () => {
      clearInterval(nudgeInterval);
    };
  }, [shouldShowUpgradeNudge, currentThought]);
  
  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    
    // Don't do anything when tapping Trinity if there's a current thought displayed
    // This prevents tapping Trinity from closing/replacing the notice box
    if (currentThought) {
      return;
    }
    
    if (!isDragging) {
      // On mobile, tap opens voice command overlay for authenticated users
      if (isMobile && user) {
        setShowVoiceOverlay(true);
        thoughtManager.showSimpleThought({
          text: "Tap the mic to give me a voice command!",
          priority: 'low',
          duration: 3000,
          source: 'action',
        });
      } else {
        // Trinity reacts to taps with a friendly response (only when no thought is showing)
        thoughtManager.triggerReaction('tap');
        triggerEmoteRef.current?.('happy');
      }
    }
  }, [isDragging, isMobile, user, currentThought]);

  const handleVoiceModeChange = useCallback((mode: 'LISTENING' | 'THINKING' | 'SUCCESS' | 'ERROR' | 'IDLE') => {
    setVoiceModeOverride(mode);
    if (mode === 'IDLE' || mode === 'SUCCESS' || mode === 'ERROR') {
      setTimeout(() => setVoiceModeOverride(null), 2000);
    }
  }, []);
  
  const hasTrinityAccess = useMemo(() => {
    if (!user) return false;
    return canAccessTrinity({
      platformRole: (user as any)?.platformRole,
      workspaceRole: (user as any)?.role,
      isOrgOwner: (user as any)?.isOrgOwner || (user as any)?.role === 'org_owner',
    });
  }, [user]);
  
  // Trinity Visibility Rules:
  // - Public pages: Everyone sees Trinity (showcase mode for marketing)
  // - Protected pages: Everyone sees Trinity, but only privileged users get AI integration
  // - Hidden routes: Trinity is hidden for all users (e.g., admin consoles)
  // The mascot renders for ALL users; RBAC gates the AI/API calls, not the visual component
  if (!MASCOT_CONFIG.enabled || shouldHideMascot(location)) return null;
  
  // Apply overlay avoidance offset - shifts Trinity away from open popovers/dialogs
  const effectiveX = position.x + (isDragging ? 0 : floatOffsetRef.current.x + targetInfluence.x + overlayAvoidanceOffset.x);
  const rawEffectiveY = position.y + (isDragging ? 0 : floatOffsetRef.current.y + targetInfluence.y + overlayAvoidanceOffset.y);
  
  // Header exclusion zone: Keep mascot away from top-right header area (notification bell, search, etc.)
  // The header is ~64px tall, plus we need margin for the mascot size + buffer
  const HEADER_HEIGHT = 64;
  const HEADER_EXCLUSION_MARGIN = 24;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  // Maximum bottom value allowed (keeps mascot below header)
  // When bottom = maxY, the mascot top edge is at headerHeight + margin from viewport top
  const maxBottomY = viewportHeight - HEADER_HEIGHT - bubbleSize - HEADER_EXCLUSION_MARGIN;
  const effectiveY = Math.min(rawEffectiveY, maxBottomY);
  
  return (
    <>
      {/* Mascot visual container with transforms */}
      <div 
        ref={mascotContainerRef}
        className="fixed select-none pointer-events-none mascot-container cursor-default"
        data-mascot="container"
        data-trinity="true"
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
          background: 'transparent',
        }}
        data-testid="mascot-container"
        data-transport-effect={currentEffect || undefined}
      >
        {/* Clickable mascot area - ONLY the mascot visual itself, not full container */}
        {/* This prevents Trinity from blocking links/buttons underneath */}
        <div 
          className="w-full h-full pointer-events-none"
          style={{ background: 'transparent' }}
        >
          {/* Polished Trinity Redesign - Smooth mutations and state animations */}
          {/* Auto-cycles through states after 30 seconds of user inactivity */}
          {/* pointer-events-auto ONLY on circular core - NOT the rectangular container */}
          {/* This allows clicks to pass through transparent corners to elements behind */}
          <div
            className="pointer-events-auto cursor-pointer"
            onClick={handleTap}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => { /* Tap only - no drag */ }}
            style={{ 
              userSelect: 'none', 
              WebkitUserDrag: 'none',
              WebkitTouchCallout: 'none',
              // Clip to circular shape so only the visible mascot is clickable
              // This prevents Trinity from blocking clicks on elements behind the corners
              clipPath: 'circle(42% at center)',
              WebkitClipPath: 'circle(42% at center)',
            } as React.CSSProperties}
          >
            <TrinityRedesign 
              mode={(voiceModeOverride as any) || currentMode}
              size={bubbleSize}
              mini={!isExpanded}
              idleTimeout={30000}
              cycleInterval={3000}
            />
          </div>
          
          {!currentThought && workspaceId && (
            <MascotTaskBox 
              mascotRef={mascotContainerRef}
              workspaceId={workspaceId}
            />
          )}
        </div>
      </div>
      
      {/* Dialogue bubble - uses festive version during holiday season (controlled by SeasonalSubagent) */}
      {currentThought && isHoliday ? (
        <FestiveDialogueBubble
          thought={currentThought}
          mascotPosition={{ x: effectiveX, y: effectiveY }}
          mascotSize={bubbleSize}
          isMobile={isMobile}
          onDismiss={() => setCurrentThought(null)}
        />
      ) : currentThought ? (
        <CompactBubble
          thought={currentThought}
          mascotPosition={{ x: effectiveX, y: effectiveY }}
          mascotSize={bubbleSize}
          mode={currentMode}
          onDismiss={() => setCurrentThought(null)}
        />
      ) : null}
      
      {/* Mobile Voice Command Overlay - triggered by tapping Trinity on mobile */}
      <MobileVoiceCommandOverlay
        isOpen={showVoiceOverlay}
        onClose={() => setShowVoiceOverlay(false)}
        onModeChange={handleVoiceModeChange}
      />
    </>
  );
}

// Inbox Header Button with unread count badge
function InboxHeaderButton({ onClick }: { onClick: () => void }) {
  const { data: mailboxData } = useQuery({
    queryKey: ["/api/internal-email/mailbox/auto-create"],
    staleTime: 30000,
    refetchInterval: 60000,
  });
  
  const unreadCount = ((mailboxData as any)?.mailbox as any)?.unreadCount || 0;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full relative"
          onClick={onClick}
          data-testid="button-inbox"
        >
          <Mail className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Inbox{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}</p>
      </TooltipContent>
    </Tooltip>
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

  // Query onboarding status for authenticated users
  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/onboarding/status'],
    enabled: !!user,
  });

  // Automatically show onboarding wizard for new users with pending status
  useEffect(() => {
    if ((onboardingStatus as any)?.status === 'pending') {
      setShowOnboarding(true);
    }
  }, [onboardingStatus]);

  // Check if on mobile chat, HelpDesk, or desktop live-chat - use window.location instead of useLocation() hook
  // to avoid React Hooks issues with conditional rendering
  const isMobileChat = window.location.pathname === '/mobile-chat';
  const isHelpDesk = window.location.pathname === '/chat' || window.location.pathname.startsWith('/chat');
  
  // CRITICAL: Public routes that should render IMMEDIATELY without waiting for auth loading
  const PUBLIC_ROUTES = new Set([
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
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
    "/error-403",
    "/error-404",
    "/error-500",
  ]);
  
  const currentPath = window.location.pathname;
  const isPublicRoute = PUBLIC_ROUTES.has(currentPath) || 
                        currentPath.startsWith("/onboarding/") ||
                        currentPath.startsWith("/pay-invoice/") ||
                        currentPath === "/create-org";

  // CRITICAL: If on public route, render immediately without waiting for auth to load
  // This prevents loading screens from appearing on public pages
  if (isPublicRoute) {
    return (
      <Switch>
        <Route path="/" component={Homepage} />
        <Route path="/login" component={CustomLogin} />
        <Route path="/register" component={CustomRegister} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/pricing" component={UniversalMarketing} />
        <Route path="/roi-calculator" component={ROICalculator} />
        <Route path="/compare" component={ComparePage} />
        <Route path="/compare/:competitor" component={ComparePage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/templates/:templateId" component={TemplatesPage} />
        <Route path="/contact" component={Contact} />
        <Route path="/support" component={Support} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/privacy" component={PrivacyPolicy} />
        {/* Consolidated chat routes - ONE UNIVERSAL CHAT */}
        <Route path="/chat" component={HelpDesk} /> {/* Universal responsive chat with Gemini AI (works on desktop + mobile) */}
        <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
        <Route path="/trinity" component={TrinityChat} /> {/* Trinity Chat Interface with BUDDY metacognition */}
        <Route path="/live-chat"><Redirect to="/chat" /></Route>
        
        <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
        <Route path="/support/chat"><Redirect to="/chat" /></Route>
        <Route path="/onboarding/start" component={OnboardingStart} />
        <Route path="/onboarding/:token" component={OnboardingPage} />
        <Route path="/create-org" component={CreateOrg} />
        <Route path="/pay-invoice/:id" component={PayInvoice} />
        <Route path="/accept-handoff/:token" component={AcceptHandoff} />
        
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
                <div className="flex items-center gap-2">
                  {/* Easy View Toggle - Simplified interface for mobile */}
                  <SimpleModeToggle variant="compact" />
                  {/* Chat Button - Header mounted for easy access */}
                  <HeaderChatButton />
                  {/* Inbox Button - Internal email system with unread badge */}
                  <InboxHeaderButton onClick={() => window.location.href = '/inbox'} />
                  <NotificationsPopover />
                </div>
              </div>
            </div>
          )}
          
          {/* Main content area - with bottom nav padding */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto min-h-0 w-full max-w-full pb-20">
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
              <Route path="/worker" component={WorkerDashboard} />
              <Route path="/worker/schedule"><Redirect to="/schedule" /></Route>
              <Route path="/worker/incidents" component={WorkerIncidents} />
              <Route path="/schedule" component={UniversalSchedule} />
              <Route path="/universal-schedule"><Redirect to="/schedule" /></Route>
              <Route path="/daily-schedule"><Redirect to="/schedule" /></Route>
              <Route path="/workflow-approvals" component={WorkflowApprovals} />
              <Route path="/sales" component={WorkspaceSales} />
              <Route path="/time-tracking" component={TimeTracking} />
              <Route path="/employees" component={Employees} />
              <Route path="/quickbooks-import" component={QuickBooksImport} />
              <Route path="/resolution-inbox" component={ResolutionInbox} />
              <Route path="/org-management" component={OrgManagement} />
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
              <Route path="/support/bugs" component={SupportBugDashboard} />
              <Route path="/admin/end-user-controls" component={EndUserControls} />
              <Route path="/support/assisted-onboarding" component={AssistedOnboarding} />
              <Route path="/workspace-onboarding" component={WorkspaceOnboarding} />
              <Route path="/trinity/command-center" component={TrinityCommandCenter} />
              <Route path="/trinity/self-edit" component={TrinitySelfEditGovernancePage} />
              <Route path="/trinity" component={TrinityChat} /> {/* Trinity Chat Interface with BUDDY metacognition */}
              <Route path="/billing" component={Billing} />
              <Route path="/usage" component={UsageDashboard} />
              <Route path="/owner-analytics">
                <OwnerRoute>
                  <OwnerAnalytics />
                </OwnerRoute>
              </Route>
              <Route path="/credit-analytics">
                <OwnerRoute>
                  <CreditAnalyticsDashboard />
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
              <Route path="/compliance-reports" component={ComplianceReports} />
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
              <Route path="/employee-recognition" component={EmployeeRecognition} />
              <Route path="/alert-configuration" component={AlertConfiguration} />
              <Route path="/accounting-integrations" component={AccountingIntegrations} />
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
              <Route path="/onboarding/start" component={OnboardingStart} />
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
              <Route path="/ai/orchestration" component={OrchestrationDashboard} />
              <Route path="/ai/audit-log-viewer" component={AIAuditLogViewer} />
              <Route path="/ai/workboard" component={WorkboardDashboard} />
              <Route path="/trinity-insights">
                <PlatformAdminRoute>
                  <TrinityInsights />
                </PlatformAdminRoute>
              </Route>
              <Route path="/system-health">
                <PlatformAdminRoute>
                  <SystemHealth />
                </PlatformAdminRoute>
              </Route>
              <Route path="/infrastructure">
                <PlatformAdminRoute>
                  <Infrastructure />
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
        <Route path="/roi-calculator" component={ROICalculator} />
        <Route path="/compare" component={ComparePage} />
        <Route path="/compare/:competitor" component={ComparePage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/templates/:templateId" component={TemplatesPage} />
              <Route path="/contact" component={Contact} />
              <Route path="/terms" component={TermsOfService} />
              <Route path="/privacy" component={PrivacyPolicy} />
              {/* Consolidated Chat Routes - ONE UNIVERSAL CHAT via HelpAI Orchestration */}
              <Route path="/chat" component={HelpAIOrchestration} /> {/* HelpAI Orchestration - Universal chat and AI brain */}
              <Route path="/chat/:roomId">
                {(params) => <HelpDesk key={params.roomId} roomId={params.roomId} />}
              </Route> {/* Individual chat room by ID - key forces remount */}
              <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
              <Route path="/chatrooms" component={Chatrooms} /> {/* Organization chatroom discovery and bulk join */}
              <Route path="/chatroom"><Redirect to="/chatrooms" /></Route> {/* Redirect singular to plural */}
              <Route path="/support/chatrooms"><Redirect to="/chatrooms" /></Route> {/* Redirect support chatrooms to unified page */}
              <Route path="/inbox" component={InboxPage} /> {/* Internal email system */}
              <Route path="/helpai-orchestration" component={HelpAIOrchestration} /> {/* HelpAI Orchestration System */}
              
              {/* Redirect legacy chat routes to unified /chat */}
              <Route path="/support/chat"><Redirect to="/chat" /></Route>
              <Route path="/live-chat"><Redirect to="/chat" /></Route>
              <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
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
          {/* Mobile Quick Actions FAB - Above bottom nav */}
          {!isHelpDesk && <MobileQuickActionsFAB />}
          {/* PWA Install Prompt - Shows once for mobile users */}
          <PWAInstallPrompt />
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
                    {/* Easy View Toggle - Simplified interface for non-technical users */}
                    <SimpleModeToggle variant="compact" />
                    {/* Chat Button - Header mounted in middle */}
                    <HeaderChatButton />
                    {/* Inbox Button - Internal email system with unread badge */}
                    <InboxHeaderButton onClick={() => setLocation('/inbox')} />
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
              {/* AI System Status Banner - shows when AI is in degraded or emergency mode */}
              <AISystemStatusBanner />

            {/* Compact top-right utility cluster - HIDDEN on mobile and when universal header is shown */}
            {!isMobileChat && !isHelpDesk && !isMobile && !true && (
              <AppUtilityCluster setLocation={setLocation} />
            )}

              {/* Main content area - visible scrollbar for desktop users */}
              <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background min-h-0 w-full max-w-full" data-scroll="styled">
                {/* Breadcrumb Navigation - helps users know where they are (desktop only) */}
                {!isMobileChat && !isHelpDesk && !isMobile && <PageBreadcrumb />}
              
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
                <Route path="/worker" component={WorkerDashboard} />
                <Route path="/worker/schedule"><Redirect to="/schedule" /></Route>
                <Route path="/worker/incidents" component={WorkerIncidents} />
                <Route path="/schedule" component={UniversalSchedule} />
                <Route path="/universal-schedule"><Redirect to="/schedule" /></Route>
                <Route path="/daily-schedule"><Redirect to="/schedule" /></Route>
                <Route path="/workflow-approvals" component={WorkflowApprovals} />
                <Route path="/sales" component={WorkspaceSales} />
                <Route path="/time-tracking" component={TimeTracking} />
                <Route path="/employees" component={Employees} />
                <Route path="/quickbooks-import" component={QuickBooksImport} />
                <Route path="/resolution-inbox" component={ResolutionInbox} />
                <Route path="/org-management" component={OrgManagement} />
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
                <Route path="/support/bugs" component={SupportBugDashboard} />
                <Route path="/admin/end-user-controls" component={EndUserControls} />
                <Route path="/support/assisted-onboarding" component={AssistedOnboarding} />
                <Route path="/workspace-onboarding" component={WorkspaceOnboarding} />
                <Route path="/trinity/command-center" component={TrinityCommandCenter} />
              <Route path="/trinity/self-edit" component={TrinitySelfEditGovernancePage} />
                <Route path="/trinity" component={TrinityChat} /> {/* Trinity Chat Interface with BUDDY metacognition */}
                <Route path="/ai/brain" component={AIBrainDashboard} />
                <Route path="/ai/orchestration" component={OrchestrationDashboard} />
                <Route path="/ai/workboard" component={WorkboardDashboard} />
                <Route path="/ai/audit-log-viewer" component={AIAuditLogViewer} />
                <Route path="/support/ai-console" component={SupportAIConsole} />
                <Route path="/trinity-insights">
                  <PlatformAdminRoute>
                    <TrinityInsights />
                  </PlatformAdminRoute>
                </Route>
                <Route path="/system-health">
                  <PlatformAdminRoute>
                    <SystemHealth />
                  </PlatformAdminRoute>
                </Route>
                <Route path="/billing" component={Billing} />
                <Route path="/usage" component={UsageDashboard} />
                <Route path="/owner-analytics">
                  <OwnerRoute>
                    <OwnerAnalytics />
                  </OwnerRoute>
                </Route>
                <Route path="/credit-analytics">
                  <OwnerRoute>
                    <CreditAnalyticsDashboard />
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
                <Route path="/compliance-reports" component={ComplianceReports} />
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
                <Route path="/chatrooms" component={Chatrooms} />
                <Route path="/chatroom"><Redirect to="/chatrooms" /></Route>
                <Route path="/inbox" component={InboxPage} />
                <Route path="/diagnostics" component={Diagnostics} />
                <Route path="/messages" component={PrivateMessages} />
                <Route path="/training" component={Training} />
                <Route path="/budgeting" component={Budgeting} />
                <Route path="/ai-integrations" component={AIIntegrations} />
                <Route path="/employee-recognition" component={EmployeeRecognition} />
                <Route path="/alert-configuration" component={AlertConfiguration} />
                <Route path="/accounting-integrations" component={AccountingIntegrations} />
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
                <Route path="/onboarding/start" component={OnboardingStart} />
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
        <Route path="/roi-calculator" component={ROICalculator} />
        <Route path="/compare" component={ComparePage} />
        <Route path="/compare/:competitor" component={ComparePage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/templates/:templateId" component={TemplatesPage} />
                <Route path="/contact" component={Contact} />
                <Route path="/terms" component={TermsOfService} />
                <Route path="/privacy" component={PrivacyPolicy} />
                {/* Consolidated Chat Routes - ONE UNIVERSAL CHAT via HelpAI Orchestration */}
                <Route path="/chat" component={HelpAIOrchestration} /> {/* HelpAI Orchestration - Universal chat and AI brain */}
                <Route path="/chat/:roomId">
                  {(params) => <HelpDesk key={params.roomId} roomId={params.roomId} />}
                </Route> {/* Individual chat room by ID - key forces remount */}
                <Route path="/mobile-chat"><Redirect to="/chat" /></Route> {/* Redirect to universal chat */}
                <Route path="/support/chatrooms"><Redirect to="/chatrooms" /></Route> {/* Redirect support chatrooms to unified page */}
                
                {/* Redirect legacy chat routes to unified /chat */}
                <Route path="/support/chat"><Redirect to="/chat" /></Route>
                <Route path="/live-chat"><Redirect to="/chat" /></Route>
                <Route path="/helpdesk5"><Redirect to="/chat" /></Route>
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
                      <SeasonalThemeProvider>
                        <SimpleModeProvider>
                        <ResponsiveAppFrame>
                          <ChatroomNotificationListener />
                          <PaymentEnforcementProvider><AppContent /></PaymentEnforcementProvider>
                          <ReenableChatButton />
                          <Toaster />
                          <TrinityAnnouncementDisplay position="bottom-right" />
                        </ResponsiveAppFrame>
                        </SimpleModeProvider>
                        {/* Seasonal effects layer - snowfall, ornaments, etc. */}
                        <SeasonalEffectsLayer />
                        {/* Floating Setup Guide - Stripe-style universal widget (positioned bottom-right) */}
                        <div className="fixed bottom-6 right-6 z-[70]">
                          <SetupGuidePanel />
                        </div>
                        {/* Trinity AI Mascot - UNIVERSAL visibility on ALL pages including public/guest routes */}
                        <MascotRenderer />
                        {/* Mini HelpAI Chat Bubble - ONLY for guests (not logged in) */}
                        {/* Authenticated users access HelpDesk directly via main navigation */}
                        <FloatingSupportChat />
                      </SeasonalThemeProvider>
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