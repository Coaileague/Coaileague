// Multi-tenant SaaS Scheduling Platform

import './i18n';
import { setLanguage } from './i18n';
import { TrinityArrowMark } from "@/components/trinity-logo";
import { usePageTitle } from "@/hooks/use-page-title";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { LegacyRedirectRoutes, HelpdeskRoomRedirect } from "@/lib/legacyRedirects";
import { useScrollLockGuard } from "@/hooks/useScrollLockGuard";
import { UniversalSpinner } from "@/components/ui/universal-spinner";
import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, type MouseEvent, type TouchEvent, type CSSProperties } from "react";
// ─────────────────────────────────────────────────────────────────────────
// AUTH PAGES — STATIC IMPORTS (NOT lazy)
// Auth-critical routes must be in the main bundle. A missing Vite chunk
// for login/register/forgot/reset breaks authentication completely —
// users cannot recover from the broken state because they can't log in.
// Production incident (2026-04-08): forgot-password-D6HD4Ojg.js was
// referenced by index.html but not served by Railway, leaving the
// reset flow permanently broken. These four imports are deliberately
// eager so the auth flow survives any chunk-delivery failure.
// ─────────────────────────────────────────────────────────────────────────
import CustomLogin from "@/pages/custom-login";
import CustomRegister from "@/pages/custom-register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import { queryClient } from "./lib/queryClient";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { UniversalToastProvider } from "@/components/universal";
import { CookieBanner } from "@/components/consent-manager";
import { TermsAcceptanceGate } from "@/components/terms-acceptance-gate";
import { GlobalMutationErrorHandler } from "@/components/GlobalMutationErrorHandler";
import { TrinityAnnouncementDisplay } from "@/components/trinity-announcement";
import { TrinityTrademarkStrip } from "@/components/trinity-trademark-strip";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Settings2, Menu, LogOut, User, Bell, Mail, MessageSquarePlus } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { useQuery } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { WorkspaceBrandProvider } from "@/contexts/ThemeContext";
import { OverlayControllerProvider } from "@/contexts/overlay-controller";
import { UniversalLoadingGateProvider } from "@/contexts/universal-loading-gate";
import { TransitionProvider } from "@/contexts/transition-context";

import { SeasonalThemeProvider, useSeasonalTheme } from "@/context/SeasonalThemeContext";
import { SimpleModeProvider } from "@/contexts/SimpleModeContext";
import { SimpleModeToggle } from "@/components/SimpleModeToggle";
import { Button } from "@/components/ui/button";
import { PaymentEnforcementProvider } from "@/hooks/use-payment-enforcement";
import { ProtectedRoute } from "@/components/protected-route";
import { LeaderRoute } from "@/components/leader-route";
import { OwnerRoute } from "@/components/owner-route";
import { RBACRoute } from "@/components/rbac-route";
import { PlatformAdminRoute } from "@/components/platform-admin-route";
import { DemoBanner } from "@/components/demo-mode-indicator";
import { AISystemStatusBanner } from "@/components/ai-system-status";
import { ComplianceEnrollmentBanner } from "@/components/ComplianceEnrollmentNotice";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorBoundary } from "@/components/errors/GlobalErrorBoundary";
import { ServiceHealthProvider } from "@/contexts/ServiceHealthContext";
import { ForceRefreshProvider } from "@/contexts/ForceRefreshProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { UniversalConfigProvider } from "@/providers/universal-config-provider";
import { CommandPalette } from "@/components/command-palette";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useChatManagerInit, useChatManagerWebSocketBridge } from "@/hooks/useChatManager";
import { useIsMobile, ResponsiveAppFrame } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileRouteGuard } from "@/components/mobile/MobileRouteGuard";
import { PageTransition } from "@/components/mobile/PageTransition";
import { UniversalFAB } from "@/components/UniversalFAB";
import { PWAInstallPrompt } from "@/components/mobile/PWAInstallPrompt";
import { ChatDockProvider } from "@/contexts/ChatDockContext";
import { UnifiedChatBubble } from "@/components/chatdock/ChatDock";
import { TrinityAmbientFAB } from "@/components/trinity/TrinityAmbientFAB";
import { TrinityActivityBar } from "@/components/trinity/TrinityActivityBar";
import { TrinityTaskWidget } from "@/components/trinity/TrinityTaskWidget";
// FloatingTrinityButton removed - redundant with header Trinity access
import { HeaderTrinityButton } from "@/components/header-trinity-button";
import { UniversalHeader } from "@/components/universal-header";
import { ProgressiveHeader } from "@/components/navigation/ProgressiveHeader";
import { MVP_FEATURE_FLAGS } from "@/config/mvpFeatures";
import { TrinityModalProvider } from "@/components/trinity-chat-modal";
import { TrinitySessionProvider } from "@/contexts/TrinitySessionContext";
import { LayerManagerProvider } from "@/components/canvas-hub/LayerManager";
import { TransitionLoaderProvider } from "@/components/canvas-hub";
import { performLogout } from "@/lib/logoutHandler";
import { LoadingScreen } from "@/components/LoadingScreen";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { OfflineIndicator } from "@/components/ui/offline-indicator";
import { ConnectionStatusBanner } from "@/components/connection-status";
import { SWUpdateBanner } from "@/components/ui/sw-update-notice";
import { ServiceWorkerMessageListener } from "@/components/sw-notification-listener";
import { listenForTabEvents } from "@/lib/tabSync";
import { SessionTimeoutWarning } from "@/components/session-timeout-warning";
import { SplashScreen } from "@/components/SplashScreen";

// Lazy-loaded seasonal effects (heavy component)
// Retry wrapper for lazy imports — handles transient chunk load failures (503/network errors)
// that would otherwise silently break the page via ErrorBoundary.
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  delay = 600,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await factory();
      } catch (e) {
        lastErr = e;
        if (i < retries) await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
    throw lastErr;
  });
}

const SeasonalEffectsLayer = lazy(() => import("@/components/effects/SeasonalEffectsLayer"));

const DeveloperPortal = lazy(() => import("@/pages/developers"));

const PageLoader = () => (
  <div
    data-testid="react-suspense-spinner"
    className="min-h-screen bg-background flex flex-col items-center justify-center gap-4"
  >
    <UniversalSpinner size="sm" label="Loading…" />
  </div>
);

// LAZY LOADED PAGES - Code splitting for faster initial load
const GoLivePage = lazy(() => import("@/pages/go-live"));
const ShiftAcceptPage = lazy(() => import("@/pages/shift-accept"));
const ComplianceScenariosPage = lazy(() => import("@/pages/compliance-scenarios"));
const NotFound = lazy(() => import("@/pages/not-found"));
const OwnerAnalytics = lazy(() => import("@/pages/owner-analytics"));
const RootAdminDashboard = lazy(() => import("@/pages/root-admin-dashboard"));
const SystemHealth = lazy(() => import("@/pages/system-health"));
const Infrastructure = lazy(() => import("@/pages/infrastructure"));
const AiUsageDashboard = lazy(() => import("@/pages/ai-usage-dashboard"));
const LeadersHub = lazy(() => import("@/pages/leaders-hub"));
const TrinityInsights = lazy(() => import("@/pages/trinity-insights"));
// Critical public-facing pages use lazyWithRetry to survive transient 503/network errors
const Homepage = lazyWithRetry(() => import("@/pages/homepage"));
const TrinityChat = lazyWithRetry(() => import("@/pages/trinity-chat"));
const TrinityFeatures = lazyWithRetry(() => import("@/pages/trinity-features"));
const PricingPage = lazyWithRetry(() => import("@/pages/pricing"));
const Contact = lazyWithRetry(() => import("@/pages/contact"));
const ROICalculator = lazyWithRetry(() => import("@/pages/roi-calculator"));
const ComparePage = lazyWithRetry(() => import("@/pages/compare"));
const TemplatesPage = lazyWithRetry(() => import("@/pages/templates"));
const Support = lazyWithRetry(() => import("@/pages/support"));
const HelpDesk = lazy(() => import("@/pages/HelpDesk").then(m => ({ default: m.HelpDesk })));
const TermsOfService = lazy(() => import("@/pages/terms-of-service"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy-policy"));
const LegalAUP = lazy(() => import("@/pages/legal-aup"));
const LegalSecurity = lazy(() => import("@/pages/legal-security"));
const SmsTerms = lazy(() => import("@/pages/sms-terms"));
const CookiePolicy = lazy(() => import("@/pages/cookie-policy"));
const DPA = lazy(() => import("@/pages/dpa"));
const PrivacyPolicyEs = lazy(() => import("@/pages/privacy-policy-es"));
const TermsOfServiceEs = lazy(() => import("@/pages/terms-of-service-es"));
const SmsConsent = lazy(() => import("@/pages/sms-consent"));
const SmsOptOut = lazy(() => import("@/pages/sms-opt-out"));
const StatusPage = lazy(() => import("@/pages/status"));
const PublicFormPage = lazy(() => import("@/pages/public-form"));
const InterviewChatroomPage = lazy(() => import("@/pages/interview-chatroom"));
const OnboardingProgressPage = lazy(() => import("@/pages/onboarding-progress"));
const MobileHubPage = lazy(() => import("@/pages/mobile-hub"));
const MobileMorePage = lazy(() => import("@/pages/mobile-more"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const CommandCenter = lazy(() => import("@/pages/command-center"));
const CommandDocumentation = lazy(() => import("@/pages/command-documentation"));
const UniversalSchedule = lazy(() => import("@/pages/universal-schedule"));
const ScheduleMobileFirst = lazy(() => import("@/pages/schedule-mobile-first"));
const ShiftMarketplace = lazy(() => import("@/pages/shift-marketplace"));
const ShiftOfferPage = lazy(() => import("@/pages/shift-offer-page"));
const WorkspaceSales = lazy(() => import("@/pages/workspace-sales"));
const TimeTracking = lazy(() => import("@/pages/time-tracking"));
const Employees = lazy(() => import("@/pages/employees"));
const Clients = lazy(() => import("@/pages/clients"));
const OrgManagement = lazy(() => import("@/pages/org-management"));
const Invoices = lazy(() => import("@/pages/invoices"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Settings = lazy(() => import("@/pages/settings"));
const AlertSettings = lazy(() => import("@/pages/alert-settings"));
const NotificationLog = lazy(() => import("@/pages/notification-log"));
const Reports = lazy(() => import("@/pages/reports"));
const EmployeeOnboardingWizard = lazy(() => import("@/pages/employee-onboarding-wizard"));
const HiringWorkflowBuilder = lazy(() => import("@/pages/hireos-workflow-builder"));
const EmployeeFileCabinet = lazy(() => import("@/pages/employee-file-cabinet"));
const OfficerHrRecord = lazy(() => import("@/pages/officer-hr-record"));
const ServiceRequests = lazy(() => import("@/pages/service-requests"));
const EmployeeOnboardingDashboard = lazy(() => import("@/pages/employee-onboarding-dashboard"));
const OnboardingForms = lazy(() => import("@/pages/onboarding-forms"));
const EmployeeProfile = lazy(() => import("@/pages/employee-profile"));
const AdminUsage = lazy(() => import("@/pages/admin-usage"));
const AdminCustomForms = lazy(() => import("@/pages/admin-custom-forms"));
const PlatformAdmin = lazy(() => import("@/pages/platform-admin"));
const PlatformFeedbackPage = lazy(() => import("@/pages/platform-feedback"));
const CanonicalConfigPage = lazy(() => import("@/pages/canonical-config"));
const SupportConsolePage = lazy(() => import("@/pages/admin/support-console"));
const SupportConsoleTicketsPage = lazy(() => import("@/pages/admin/support-console-tickets"));
const SupportConsoleWorkspacePage = lazy(() => import("@/pages/admin/support-console-workspace"));
const EmployeePortal = lazy(() => import("@/pages/employee-portal"));
const ClientPortal = lazy(() => import("@/pages/client-portal"));
const ClientPortalSetup = lazy(() => import("@/pages/client-portal/setup"));
const ProspectPortal = lazy(() => import("@/pages/prospect-portal"));
const ClientSignup = lazy(() => import("@/pages/client-signup"));
const ContractSigningPortal = lazy(() => import("@/pages/contract-signing-portal"));
const DocumentSigningPortal = lazy(() => import("@/pages/document-signing-portal"));
const SpsPacketPortal = lazy(() => import("@/pages/sps-packet-portal"));
const SpsClientPipeline = lazy(() => import("@/pages/sps-client-pipeline"));
const SpsDocumentSafe = lazy(() => import("@/pages/sps-document-safe"));
const EmployeePacketPortal = lazy(() => import("@/pages/employee-packet-portal"));
const EmployeePackets = lazy(() => import("@/pages/employee-packets"));
const TxServiceAgreement = lazy(() => import("@/pages/tx-service-agreement"));
const Workspace = lazy(() => import("@/pages/workspace"));
const Billing = lazy(() => import("@/pages/billing"));
const SubscriptionDashboard = lazy(() => import("@/pages/subscription-dashboard"));
const UsageDashboard = lazy(() => import("@/pages/usage-dashboard"));
const HRBenefits = lazy(() => import("@/pages/hr-benefits"));
const HRReviews = lazy(() => import("@/pages/hr-reviews"));
const PerformancePage = lazy(() => import("@/pages/performance"));
const HRPTO = lazy(() => import("@/pages/hr-pto"));
const HRTerminations = lazy(() => import("@/pages/hr-terminations"));
// Chatrooms with master-detail pattern (MSN/IRC style room hopping)
const Chatrooms = lazy(() => import("@/pages/chatrooms"));
const Broadcasts = lazy(() => import("@/pages/broadcasts"));
const PayrollDashboard = lazy(() => import("@/pages/payroll-dashboard"));
const TaxCenter = lazy(() => import("@/pages/tax-center"));
const PayrollTimesheets = lazy(() => import("@/pages/payroll-timesheets"));
const OrchestrationDashboard = lazy(() => import("@/pages/orchestration-dashboard"));
const MyPaychecks = lazy(() => import("@/pages/my-paychecks"));
const PayStubDetail = lazy(() => import("@/pages/pay-stub-detail"));
const EngagementDashboard = lazy(() => import("@/pages/engagement-dashboard"));
const EmployeeEngagement = lazy(() => import("@/pages/engagement-employee"));
const AnalyticsReportsPage = lazy(() => import("@/pages/analytics-reports"));
const Disputes = lazy(() => import("@/pages/disputes"));
const MyAuditRecord = lazy(() => import("@/pages/my-audit-record"));
const FileGrievance = lazy(() => import("@/pages/file-grievance"));
const ReviewDisputes = lazy(() => import("@/pages/review-disputes"));
const PayrollDeductions = lazy(() => import("@/pages/payroll-deductions"));
const PayrollGarnishments = lazy(() => import("@/pages/payroll-garnishments"));
const CommunicationsOnboarding = lazy(() => import("@/pages/communications-onboarding"));
const Diagnostics = lazy(() => import("@/pages/diagnostics"));
const PrivateMessages = lazy(() => import("@/pages/private-messages"));
const WorkerDashboard = lazy(() => import("@/pages/worker-dashboard"));
const WorkerPanic = lazy(() => import("@/pages/worker-panic"));
const GuardTourScan = lazy(() => import("@/pages/guard-tours-scan"));
const PlatformOps = lazy(() => import("@/pages/platform-ops"));
const SettingsDataPrivacy = lazy(() => import("@/pages/settings-data-privacy"));
const WorkerIncidents = lazy(() => import("@/pages/worker-incidents"));
const TeamSchedule = lazy(() => import("@/pages/team-schedule"));
const ApprovalsHub = lazy(() => import("@/pages/approvals-hub"));
const SafetyCheck = lazy(() => import("@/pages/safety-check"));
const FieldReports = lazy(() => import("@/pages/field-reports"));
const MyTeam = lazy(() => import("@/pages/my-team"));
const Training = lazy(() => import("@/pages/training-os"));
const TrainingPage = lazy(() => import("@/pages/training"));
const TrainingCertification = lazy(() => import("@/pages/training-certification/index"));
const RecognitionPage = lazy(() => import("@/pages/recognition"));
const TrainingModuleLearning = lazy(() => import("@/pages/training-certification/module-learning"));
const Insurance = lazy(() => import("@/pages/insurance"));
const Budgeting = lazy(() => import("@/pages/budgeting"));
const AIIntegrations = lazy(() => import("@/pages/ai-integrations"));
const EmployeeRecognition = lazy(() => import("@/pages/employee-recognition"));
const AlertConfiguration = lazy(() => import("@/pages/alert-configuration"));
const AccountingIntegrations = lazy(() => import("@/pages/accounting-integrations"));
const FinanceHub = lazy(() => import("@/pages/finance-hub"));
const QuickBooksImport = lazy(() => import("@/pages/quickbooks-import"));
const FinancialIntelligence = lazy(() => import("@/pages/financial-intelligence"));
const PLDashboard = lazy(() => import("@/pages/financial/pl-dashboard"));
const OrgHub = lazy(() => import("@/pages/org-hub"));
const ResolutionInbox = lazy(() => import("@/pages/resolution-inbox"));
const Records = lazy(() => import("@/pages/records"));
const Insights = lazy(() => import("@/pages/insights"));
const CommunicationFamilyPage = lazy(() => import("@/pages/category-communication"));
const OperationsFamilyPage = lazy(() => import("@/pages/category-operations"));
const GrowthFamilyPage = lazy(() => import("@/pages/category-growth"));
const PlatformFamilyPage = lazy(() => import("@/pages/category-platform"));
const Profile = lazy(() => import("@/pages/profile"));
const Unavailability = lazy(() => import("@/pages/unavailability"));
const AvailabilityPage = lazy(() => import("@/pages/availability"));
const CreateOrg = lazy(() => import("@/pages/create-org"));
const OnboardingStart = lazy(() => import("@/pages/onboarding-start"));
const Updates = lazy(() => import("@/pages/updates"));
const Help = lazy(() => import("@/pages/help"));
const CompanyReports = lazy(() => import("@/pages/company-reports"));
const PayInvoice = lazy(() => import("@/pages/pay-invoice"));
// Auth pages are EAGERLY imported (see top of file). A broken lazy chunk
// here brings down the entire auth flow — users cannot log in, register,
// or recover a password. Auth cannot depend on chunk availability.
const Expenses = lazy(() => import("@/pages/expenses"));
const Mileage = lazy(() => import("@/pages/mileage"));
const ExpenseApprovals = lazy(() => import("@/pages/expense-approvals"));
const SalesCRM = lazy(() => import("@/pages/sales-crm"));
const DocumentLibrary = lazy(() => import("@/pages/document-library"));
const Outreach = lazy(() => import("@/pages/outreach"));
const BehaviorScoring = lazy(() => import("@/pages/behavior-scoring"));
const TrinityMemory = lazy(() => import("@/pages/trinity-memory"));
const TrinityTransparencyDashboard = lazy(() => import("@/pages/trinity-transparency-dashboard"));
const TrinityAgentDashboard = lazy(() => import("@/pages/trinity-agent-dashboard"));
const InboundOpportunities = lazy(() => import("@/pages/inbound-opportunities"));
const HRISManagement = lazy(() => import("@/pages/hris-management"));
const LaborLawConfig = lazy(() => import("@/pages/labor-law-config"));
const FlexStaffing = lazy(() => import("@/pages/flex-staffing"));
const FormSubmissions = lazy(() => import("@/pages/form-submissions"));
const QBReports = lazy(() => import("@/pages/qb-reports"));

const EmailIntelligence = lazy(() => import("@/pages/email-intelligence"));
const I9Compliance = lazy(() => import("@/pages/i9-compliance"));
const ComplianceReports = lazy(() => import("@/pages/compliance-reports"));
const SecurityComplianceVault = lazy(() => import("@/pages/compliance"));
const EmployeeComplianceDetail = lazy(() => import("@/pages/compliance/employee-detail"));
const ComplianceApprovals = lazy(() => import("@/pages/compliance/approvals"));
const ExpirationAlerts = lazy(() => import("@/pages/compliance/expiration-alerts"));
const RegulatorAccess = lazy(() => import("@/pages/compliance/regulator-access"));
const RegulatorPortal = lazy(() => import("@/pages/compliance/regulator-portal"));
const EmployeeOnboardingPacket = lazy(() => import("@/pages/compliance/employee-onboarding-packet"));
const AuditorPortal = lazy(() => import("@/pages/compliance/auditor-portal"));
const AuditorLogin = lazy(() => import("@/pages/auditor-login"));
// Phase 18C/D — Co-League Compliance Concierge (Trinity-driven auditor portal)
const CoAuditorClaim = lazy(() => import("@/pages/co-auditor-claim"));
const CoAuditorLogin = lazy(() => import("@/pages/co-auditor-login"));
const CoAuditorDashboard = lazy(() => import("@/pages/co-auditor-dashboard"));
const AdminSecurity = lazy(() => import("@/pages/admin-security"));
// Phase 33 — SRA (State Regulatory Auditor) Partner Portal
const SRALogin = lazy(() => import("@/pages/sra/SRALogin"));
const SRAApply = lazy(() => import("@/pages/sra/SRAApply"));
const SRAPortalDashboard = lazy(() => import("@/pages/sra/SRAPortalDashboard"));
const SRAOfficers = lazy(() => import("@/pages/sra/SRAOfficers"));
const SRAFindings = lazy(() => import("@/pages/sra/SRAFindings"));
const SRAReportBuilder = lazy(() => import("@/pages/sra/SRAReportBuilder"));
const RegulatoryPortalPage = lazy(() => import("@/pages/regulatory-portal"));
const RegulatoryDashboardPage = lazy(() => import("@/pages/regulatory-dashboard"));
const AuditReadiness = lazy(() => import("@/pages/compliance/audit-readiness"));
const RegulatoryEnrollment = lazy(() => import("@/pages/compliance/regulatory-enrollment"));
const OrgSuspendedPage = lazy(() => import("@/pages/org-suspended"));
const EnforcementStatus = lazy(() => import("@/pages/compliance/enforcement-status"));
const Policies = lazy(() => import("@/pages/policies"));
const RoleManagement = lazy(() => import("@/pages/role-management"));
const ManagerDashboard = lazy(() => import("@/pages/manager-dashboard"));
const PendingTimeEntries = lazy(() => import("@/pages/pending-time-entries"));
const TimesheetApprovals = lazy(() => import("@/pages/timesheet-approvals"));
const Error403 = lazy(() => import("@/pages/error-403"));
const Error404 = lazy(() => import("@/pages/error-404"));
const Error500 = lazy(() => import("@/pages/error-500"));
const IntegrationsPage = lazy(() => import("@/pages/integrations-page"));
const TrinitySelfEditGovernancePage = lazy(() => import("@/pages/trinity-self-edit-governance"));
const OversightHub = lazy(() => import("@/pages/oversight-hub"));
const WorkflowApprovals = lazy(() => import("@/pages/workflow-approvals"));
const ShiftApprovals = lazy(() => import("@/pages/shift-approvals"));
const AICommandCenter = lazy(() => import("@/pages/ai-command-center"));
const SupportBugDashboard = lazy(() => import("@/pages/support-bug-dashboard"));
const SupportQueue = lazy(() => import("@/pages/support-queue"));
const SupportChatrooms = lazy(() => import("@/pages/support-chatrooms"));
const MyTickets = lazy(() => import("@/pages/my-tickets"));
const EndUserControls = lazy(() => import("@/pages/end-user-controls"));
const DataSubjectRequests = lazy(() => import("@/pages/data-subject-requests"));
const AuditLogs = lazy(() => import("@/pages/audit-logs"));
const AIAuditLogViewer = lazy(() => import("@/pages/ai-audit-log-viewer"));
const AutomationControl = lazy(() => import("@/pages/automation-control"));
const AdminBanners = lazy(() => import("@/pages/admin-banners"));
const AdminPermissionMatrix = lazy(() => import("@/pages/admin-permission-matrix"));
const AdminTicketReviews = lazy(() => import("@/pages/admin-ticket-reviews"));
const AdminHelpAI = lazy(() => import("@/pages/admin-helpai"));
const BreachResponse = lazy(() => import("@/pages/breach-response"));
const AutomationAuditLog = lazy(() => import("@/pages/automation-audit-log"));
const AutomationSettings = lazy(() => import("@/pages/automation-settings"));
const AIBrainDashboard = lazy(() => import("@/pages/ai-brain-dashboard"));
const SupportAIConsole = lazy(() => import("@/pages/support-ai-console"));
const AssistedOnboarding = lazy(() => import("@/pages/assisted-onboarding"));
const WorkspaceOnboarding = lazy(() => import("@/pages/workspace-onboarding"));
const OnboardingHub = lazy(() => import("@/pages/onboarding-hub"));
const OnboardingEmailIntro = lazy(() => import("@/pages/onboarding-email-intro"));
const AcceptHandoff = lazy(() => import("@/pages/accept-handoff"));
const AcceptOffer = lazy(() => import("@/pages/accept-offer"));
const AcceptInvite = lazy(() => import("@/pages/accept-invite"));
const WhiteLabelBranding = lazy(() => import("@/pages/white-label-branding"));
const MultiCompany = lazy(() => import("@/pages/multi-company"));
const GateDuty = lazy(() => import("@/pages/gate-duty"));
const WellnessPage = lazy(() => import("@/pages/wellness"));
const SiteSurveyPage = lazy(() => import("@/pages/site-survey"));
const FleetManagement = lazy(() => import("@/pages/fleet-management"));
const FleetCompliance = lazy(() => import("@/pages/fleet-compliance"));
const ArmoryManagement = lazy(() => import("@/pages/armory-management"));
const ArmoryCompliance = lazy(() => import("@/pages/armory-compliance"));
const SSOConfiguration = lazy(() => import("@/pages/sso-configuration"));
const AccountManager = lazy(() => import("@/pages/account-manager"));
const BackgroundChecks = lazy(() => import("@/pages/background-checks"));
const ApiAccess = lazy(() => import("@/pages/api-access"));
const PermissionMatrix = lazy(() => import("@/pages/permission-matrix"));
const RmsHub = lazy(() => import("@/pages/rms-hub"));
const CadConsole = lazy(() => import("@/pages/cad-console"));
const SafetyHub = lazy(() => import("@/pages/safety-hub"));
const EthicsHotline = lazy(() => import("@/pages/ethics-hotline"));
const RfpManager = lazy(() => import("@/pages/rfp-manager"));
const RfpPipeline = lazy(() => import("@/pages/rfp-pipeline"));
const EquipmentPage = lazy(() => import("@/pages/equipment"));
const GuardTourPage = lazy(() => import("@/pages/guard-tour"));
const SalesPipelinePage = lazy(() => import("@/pages/sales-pipeline"));
const WorkOrdersPage = lazy(() => import("@/pages/work-orders"));
const VisitorManagementPage = lazy(() => import("@/pages/visitor-management"));
const DockChatPage = lazy(() => import("@/pages/dock-chat"));
const VoiceSettingsPage = lazy(() => import("@/pages/voice-settings"));
const EmailManagement = lazy(() => import("@/pages/settings/EmailManagement"));
const DnsSetupGuide = lazy(() => import("@/pages/settings/DnsSetupGuide"));
const HiringSettingsPage = lazy(() => import("@/pages/settings/HiringSettings"));
const VoiceCallsPage = lazy(() => import("@/pages/voice-calls"));
const ClientCommunicationsPage = lazy(() => import("@/pages/client-communications"));
const ShiftTradingPage = lazy(() => import("@/pages/shift-trading"));
const PostOrdersPage = lazy(() => import("@/pages/post-orders"));
const PostOrderVersionsPage = lazy(() => import("@/pages/post-order-versions"));
const IncidentPatternsPage = lazy(() => import("@/pages/incident-patterns"));
const ContractRenewalsPage = lazy(() => import("@/pages/contract-renewals"));
const ApplicantTrackingPage = lazy(() => import("@/pages/applicant-tracking"));
const HiringPipelinePage = lazy(() => import("@/pages/hiring-pipeline"));
const RecruitmentPage = lazy(() => import("@/pages/recruitment"));
const CandidateProfilePage = lazy(() => import("@/pages/candidate-profile"));
const OnboardingTasksPage = lazy(() => import("@/pages/onboarding-tasks"));
const PublicJobBoard = lazy(() => import("@/pages/public-job-board"));
const TrainingCompliancePage = lazy(() => import("@/pages/training-compliance"));
const SubcontractorManagementPage = lazy(() => import("@/pages/subcontractor-management"));
const ClientSatisfactionPage = lazy(() => import("@/pages/client-satisfaction"));
const ClientSurveysPage = lazy(() => import("@/pages/surveys"));
const BidManagementPage = lazy(() => import("@/pages/bid-management"));
const ComplianceMatrix = lazy(() => import("@/pages/compliance-matrix"));
const ClientProfitability = lazy(() => import("@/pages/client-profitability"));
const CashFlowDashboard = lazy(() => import("@/pages/cash-flow-dashboard"));
const InvoiceAging = lazy(() => import("@/pages/invoice-aging"));
const TurnoverAnalytics = lazy(() => import("@/pages/turnover-analytics"));
const BIAnalytics = lazy(() => import("@/pages/bi-analytics"));
const SituationBoard = lazy(() => import("@/pages/situation-board"));
const CredentialWallet = lazy(() => import("@/pages/credential-wallet"));
const ComplianceEvidence = lazy(() => import("@/pages/compliance-evidence"));
const ProposalBuilder = lazy(() => import("@/pages/proposal-builder"));
const SiteBriefing = lazy(() => import("@/pages/site-briefing"));
const BriefingChannel = lazy(() => import("@/pages/briefing-channel"));
const IncidentPipeline = lazy(() => import("@/pages/incident-pipeline"));
const DocumentTemplates = lazy(() => import("@/pages/document-templates"));
const DocumentFormPage = lazy(() => import("@/pages/document-form"));
const DocumentVault = lazy(() => import("@/pages/document-vault"));
const HrDocuments = lazy(() => import("@/pages/hr-documents"));
const HrDocumentRequests = lazy(() => import("@/pages/hr-document-requests"));
const BridgeChannels = lazy(() => import("@/pages/bridge-channels"));
const WorkboardDashboard = lazy(() => import("@/components/workboard/WorkboardDashboard"));
import { HeaderChatButton } from "@/components/header-chat-button";
// ReenableChatButton removed - replaced by UnifiedChatBubble
// REMOVED: FloatingSupportChat - Trinity button handles all support
import { ChatroomNotificationListener } from "@/components/chatroom-notification-listener";
import { OnboardingWizard } from "@/components/onboarding-wizard";

import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { NotificationsPopover } from "@/components/notifications-popover";
import { WorkspaceTabsNav } from "@/components/workspace-tabs-nav";
const SetupGuidePanel = lazy(() => import("@/components/setup-guide-panel").then(m => ({ default: m.SetupGuidePanel })));
const CompactBubble = lazy(() => import("@/components/mascot/CompactBubble").then(m => ({ default: m.CompactBubble })));
const FestiveDialogueBubble = lazy(() => import("@/components/mascot/FestiveDialogueBubble").then(m => ({ default: m.FestiveDialogueBubble })));
const MascotTaskBox = lazy(() => import("@/components/mascot-task-box").then(m => ({ default: m.MascotTaskBox })));
const ClientStatusLookup = lazy(() => import("@/pages/client-status-lookup"));
const FeaturesShowcase = lazy(() => import("@/pages/features-showcase"));
const UniversalMarketing = lazy(() => import("@/pages/universal-marketing"));
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
import { useTrinityNotificationRouting } from "@/hooks/use-trinity-notification-routing";
import { useMascotObserver } from "@/hooks/use-mascot-observer";
import { useMascotEmotes, setGlobalEmoteTrigger } from "@/hooks/use-mascot-emotes";
import { useMascotShowcase } from "@/hooks/use-mascot-showcase";
import { useTrinityMode } from "@/hooks/use-business-buddy-tier";
import { useTrinityPersona } from "@/hooks/use-trinity-persona";
import { useTrinityDiagnostics } from "@/hooks/use-trinity-diagnostics";
import { useSessionSync } from "@/hooks/use-session-sync";
import { apiFetch } from "@/lib/apiError";
import { OnboardingStatusResponse } from "@shared/schemas/responses/workspace";

import { MobileVoiceCommandOverlay } from "@/components/mobile/MobileVoiceCommandOverlay";
import { ConsentModal } from "@/components/ConsentModal";

// Trinity modes are driven by system state, not user interaction
// Mode changes happen automatically based on AI activity, seasons, etc.

function MascotRenderer() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.activeWorkspaceId || (user as any)?.workspaceId;
  useMascotAIIntegration(workspaceId, !!user);
  useMascotObserver(true);
  
  // Session sync for multi-device real-time updates (mobile + desktop see same data)
  useSessionSync({ autoInvalidate: true });
  
  // Trinity context integration - syncs RBAC context with ThoughtManager for role-aware persona
  useTrinityPersona(workspaceId);
  
  // Trinity diagnostics - connects Quick Fix suggestions for support/root roles
  useTrinityDiagnostics(workspaceId);
  
  // Trinity mode awareness — syncs COO/Guru mode context with ThoughtManager via useTrinityPersona above
  useTrinityMode();
  
  
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
    "/terms", "/privacy", "/sms-terms", "/sms-consent", "/sms-opt-out", "/trinity-features",
    "/cookie-policy", "/dpa", "/privacy-es", "/terms-es",
    "/legal/aup", "/legal/security"
  ]), []);
  
  const isPublicPage = PUBLIC_ROUTES.has(location) || 
                       location.startsWith("/onboarding/") ||
                       location.startsWith("/pay-invoice/") ||
                       location.startsWith("/accept-offer/") ||
                       location.startsWith("/contract-portal/") ||
                       location === "/accept-invite";
  
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
  
  
  const handleTap = useCallback((e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => {
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
  // - Mobile: Trinity mascot is hidden (users access Trinity via chat modal instead)
  // The mascot renders for ALL users; RBAC gates the AI/API calls, not the visual component
  if (!MASCOT_CONFIG.enabled || shouldHideMascot(location) || isMobile) return null;
  
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
            } as CSSProperties}
          >
            <Suspense fallback={null}>
              <TrinityArrowMark size={bubbleSize} />
            </Suspense>
          </div>
          
          {!currentThought && workspaceId && (
            <Suspense fallback={null}>
              <MascotTaskBox 
                mascotRef={mascotContainerRef}
                workspaceId={workspaceId}
              />
            </Suspense>
          )}
        </div>
      </div>
      
      {/* Dialogue bubble - uses festive version during holiday season (controlled by SeasonalSubagent) - lazy loaded */}
      <Suspense fallback={null}>
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
      </Suspense>
      
      {/* Mobile Voice Command Overlay - triggered by tapping Trinity on mobile */}
      <MobileVoiceCommandOverlay
        isOpen={showVoiceOverlay}
        onClose={() => setShowVoiceOverlay(false)}
        onModeChange={handleVoiceModeChange}
      />
    </>
  );
}

// Mail Header Button with unread count badge (internal email system)
function MailHeaderButton({ onClick }: { onClick: () => void }) {
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
          data-testid="button-mail"
          aria-label={`Mail${unreadCount > 0 ? ` — ${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}` : ''}`}
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Mail{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}</p>
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
            aria-label="Settings"
            className="h-8 w-8 shrink-0"
          >
            <Settings2 className="h-4 w-4 text-primary" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Settings</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function LanguageSync() {
  const { user } = useAuth();
  useEffect(() => {
    const lang = (user as any)?.preferredLanguage;
    if (lang === 'en' || lang === 'es') {
      setLanguage(lang);
    }
  }, [(user as any)?.preferredLanguage]);
  return null;
}

function AppContent() {
  const { isAuthenticated, isLoading, user, orgInactive, isOwner, paymentRequired } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const unlisten = listenForTabEvents({
      onLogout: () => {
        queryClient.clear();
        setLocation("/login");
      },
      onWorkspaceSwitch: () => {
        window.location.reload();
      },
    });
    return () => unlisten();
  }, [setLocation]);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const isMobile = useIsMobile();

  useChatManagerInit(user?.id);
  useChatManagerWebSocketBridge();
  usePushNotifications({ autoRegister: true });
  useScrollLockGuard();
  usePageTitle();

  // Route Trinity proactive insights to notification system instead of floating bubbles
  useTrinityNotificationRouting({
    enabled: !!user,
    userId: user?.id,
    workspaceId: (user as any)?.workspaceId,
  });

  // Query onboarding status for authenticated users
  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/onboarding/status'],
    enabled: !!user,
    queryFn: () => apiFetch('/api/onboarding/status', OnboardingStatusResponse),
  });

  // Automatically show onboarding wizard for new users with pending status
  useEffect(() => {
    if ((onboardingStatus as any)?.status === 'pending') {
      setShowOnboarding(true);
    }
  }, [onboardingStatus]);

  // Post-login redirect recovery: if the login page stored a redirect target
  // before auth state changed (which can cause this component to mount before
  // setLocation runs in the login page), apply it now.
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const pendingRedirect = sessionStorage.getItem('coaileague_post_login_redirect');
      if (pendingRedirect) {
        sessionStorage.removeItem('coaileague_post_login_redirect');
        setLocation(pendingRedirect);
      }
    }
  }, [isAuthenticated, isLoading, setLocation]);

  // Org-inactive routing: redirect to appropriate screen instead of login
  // - Owners: go to /org-management to update billing and restore service
  // - Employees: go to /org-unavailable with a professional "unavailable" message
  useEffect(() => {
    if (isLoading) return;
    if (orgInactive && location !== '/org-unavailable' && location !== '/org-management') {
      if (isOwner) {
        setLocation('/org-management');
      } else {
        setLocation('/org-unavailable');
      }
    }
    // Owner whose subscription lapsed: redirect to billing page, not login
    if (paymentRequired && isOwner && location !== '/org-management') {
      setLocation('/org-management');
    }
    // Client users must land in the client portal, not the main app dashboard
    if (!isLoading && user && (user as any).role === 'client' && location !== '/client/portal' && !location.startsWith('/client/')) {
      setLocation('/client/portal');
    }
  }, [orgInactive, paymentRequired, isOwner, isLoading, location, setLocation, user]);

  // Normalize path: strip query string and hash so PUBLIC_ROUTES.has() works
  // even when mobile browsers restore tabs with query params (e.g. /?nf_code=...).
  const currentPath = (location.split('?')[0].split('#')[0]) || '/';
  const isMobileChat = currentPath === '/mobile-chat';
  const isChatRoute = currentPath === '/chatrooms' || currentPath.startsWith('/chatrooms/') || currentPath === '/chat' || currentPath.startsWith('/chat/') || currentPath === '/helpdesk';
  // NOTE: isFixedHeightRoute is computed AFTER isPublicRoute below so that
  // public routes are guaranteed to never hit the fixed-height/overflow-
  // hidden branch of the workspace mobile layout. Scroll fix v5.
  
  // CRITICAL: Public routes that should render IMMEDIATELY without waiting for auth loading
  const PUBLIC_ROUTES = new Set([
    "/",
    "/homepage",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/pricing",
    "/roi-calculator",
    "/compare",
    "/trinity-features",
    "/features",
    "/templates",
    "/contact",
    "/support",
    "/terms",
    "/privacy",
    "/sms-terms",
    "/sms-consent",
    "/sms-opt-out",
    "/cookie-policy",
    "/dpa",
    "/privacy-es",
    "/terms-es",
    "/legal/aup",
    "/legal/security",
    "/status",
    "/error-403",
    "/error-404",
    "/error-500",
    "/client-signup",
    "/org-unavailable",
    "/accept-invite",
    "/regulatory",
    "/regulatory/dashboard",
    "/auditor/login",
    "/regulatory-audit/login",
    "/regulatory-audit/apply",
    "/regulatory-audit/portal",
    "/regulatory-audit/portal/officers",
    "/regulatory-audit/portal/findings",
    "/regulatory-audit/portal/report-builder",
    "/features-showcase",
    "/universal-marketing",
    "/client-status-lookup",
    "/go-live",
  ]);
  
  const isPublicRoute = PUBLIC_ROUTES.has(currentPath) ||
                        currentPath.startsWith("/onboarding/") ||
                        currentPath.startsWith("/pay-invoice/") ||
                        currentPath.startsWith("/accept-offer/") ||
                        currentPath.startsWith("/client-portal/") ||
                        currentPath.startsWith("/contract-portal/") ||
                        currentPath.startsWith("/compare/") ||
                        currentPath.startsWith("/templates/") ||
                        currentPath.startsWith("/regulatory") ||
                        currentPath.startsWith("/regulatory-audit/") ||
                        currentPath.startsWith("/jobs/") ||
                        currentPath.startsWith("/forms/") ||
                        currentPath.startsWith("/interview/") ||
                        currentPath.startsWith("/onboarding/progress/") ||
                        currentPath === "/create-org" ||
                        currentPath === "/accept-invite";

  // isFixedHeightRoute forces `overflow-hidden` on main#main-content for
  // chat + schedule pages (they own their own internal scroll). Public
  // routes are always allowed to scroll normally — forcing false here
  // guarantees a public route can never accidentally hit the
  // overflow-hidden branch of the workspace mobile layout. Scroll fix v5.
  const isFixedHeightRoute = !isPublicRoute && (isChatRoute || currentPath === '/schedule');

  // Tag body with current route type (CSS uses this to disable fixed-overlay
  // pointer-events on public pages), and clear any stale Radix scroll-lock
  // attributes / inline overflow overrides left by sheets from the prior page.
  useEffect(() => {
    if (isPublicRoute) {
      document.body.setAttribute('data-public-route', 'true');
    } else {
      document.body.removeAttribute('data-public-route');
    }
    // Scroll fix v5: clear any inline styles that Radix scroll-lock may
    // have left on body/html from a prior dialog. Falling back to the CSS
    // rules now gives overflow-y: auto and height: auto (global model),
    // NOT overflow: hidden like the previous explicit-container model.
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.height = '';
    if (!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
      document.body.removeAttribute('data-scroll-locked');
    }
    return () => {
      document.body.removeAttribute('data-public-route');
    };
  }, [isPublicRoute]);

  // CRITICAL: If on public route, render immediately without waiting for auth to load
  // This prevents loading screens from appearing on public pages
  // Uses a dedicated scroll container (like workspace pages) instead of body scrolling
  // to guarantee touch-based scrolling on mobile devices
  if (isPublicRoute) {
    return (
      <GlobalErrorBoundary>
        <ErrorBoundary>
          <div
            className="public-page-scroll-root"
            data-testid="public-page-scroll-container"
          >
            <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/" component={Homepage} />
              <Route path="/login" component={CustomLogin} />
              <Route path="/auditor/login" component={AuditorLogin} />
              {/* Phase 18C/D — Trinity Compliance Concierge auditor portal */}
              <Route path="/co-auditor/login" component={CoAuditorLogin} />
              <Route path="/co-auditor/claim" component={CoAuditorClaim} />
              <Route path="/co-auditor/dashboard" component={CoAuditorDashboard} />
              <Route path="/admin/security" component={AdminSecurity} />
              {/* Phase 33 — SRA Partner Portal (government blue, outside main auth) */}
              <Route path="/regulatory-audit/login" component={SRALogin} />
              <Route path="/regulatory-audit/apply" component={SRAApply} />
              <Route path="/regulatory-audit/portal/officers" component={SRAOfficers} />
              <Route path="/regulatory-audit/portal/findings" component={SRAFindings} />
              <Route path="/regulatory-audit/portal/report-builder" component={SRAReportBuilder} />
              <Route path="/regulatory-audit/portal" component={SRAPortalDashboard} />
              <Route path="/regulatory" component={RegulatoryPortalPage} />
              <Route path="/regulatory/dashboard" component={RegulatoryDashboardPage} />
              <Route path="/regulator-portal/:token" component={RegulatorPortal} />
              <Route path="/shift-accept" component={ShiftAcceptPage} />
              <Route path="/org-unavailable" component={OrgSuspendedPage} />
              <Route path="/register" component={CustomRegister} />
              <Route path="/forgot-password" component={ForgotPassword} />
              <Route path="/reset-password" component={ResetPassword} />
              <Route path="/pricing" component={PricingPage} />
              <Route path="/roi-calculator" component={ROICalculator} />
              <Route path="/compare" component={ComparePage} />
              <Route path="/compare/:competitor" component={ComparePage} />
              <Route path="/trinity-features" component={TrinityFeatures} />
              <Route path="/features" component={TrinityFeatures} />
              <Route path="/templates" component={TemplatesPage} />
              <Route path="/templates/:templateId" component={TemplatesPage} />
              <Route path="/contact" component={Contact} />
              <Route path="/support" component={Support} />
              {/* @ts-ignore */}
              <Route path="/client-status-lookup" component={ClientStatusLookup} />
              <Route path="/features-showcase" component={FeaturesShowcase} />
              <Route path="/universal-marketing" component={UniversalMarketing} />
              <Route path="/terms" component={TermsOfService} />
              <Route path="/privacy" component={PrivacyPolicy} />
              <Route path="/sms-terms" component={SmsTerms} />
              <Route path="/cookie-policy" component={CookiePolicy} />
              <Route path="/dpa" component={DPA} />
              <Route path="/legal/aup" component={LegalAUP} />
              <Route path="/legal/security" component={LegalSecurity} />
              <Route path="/privacy-es" component={PrivacyPolicyEs} />
              <Route path="/terms-es" component={TermsOfServiceEs} />
              <Route path="/sms-consent" component={SmsConsent} />
              <Route path="/sms-opt-out" component={SmsOptOut} />
              <Route path="/status" component={StatusPage} />
              {/* Chat routes - HelpDesk IRC/MSN interface with roomId */}
              <Route path="/chat/:roomId">{(params: { roomId: string }) => <ErrorBoundary><Suspense fallback={<PageLoader />}><HelpDesk roomId={params.roomId} /></Suspense></ErrorBoundary>}</Route>

              <Route path="/onboarding/start" component={OnboardingStart} />
              <Route path="/onboarding/email-intro"><ErrorBoundary><Suspense fallback={<PageLoader />}><OnboardingEmailIntro /></Suspense></ErrorBoundary></Route>
              <Route path="/onboarding/:token">{(params: { token: string }) => <ErrorBoundary><Suspense fallback={<PageLoader />}><EmployeeOnboardingWizard /></Suspense></ErrorBoundary>}</Route>
              <Route path="/create-org" component={CreateOrg} />
              <Route path="/pay-invoice/:id" component={PayInvoice} />
              <Route path="/accept-handoff/:token" component={AcceptHandoff} />
              <Route path="/accept-offer/:offerId" component={AcceptOffer} />
              <Route path="/accept-invite" component={AcceptInvite} />
              {/* Client portal setup — invite acceptance (must come BEFORE /:tempCode wildcard) */}
              <Route path="/client-portal/setup"><ErrorBoundary><Suspense fallback={<PageLoader />}><ClientPortalSetup /></Suspense></ErrorBoundary></Route>
              <Route path="/client-portal/:tempCode">{(params: { tempCode: string }) => <ErrorBoundary><Suspense fallback={<PageLoader />}><ProspectPortal tempCode={params.tempCode} /></Suspense></ErrorBoundary>}</Route>
              <Route path="/contract-portal/:token">{(params: { token: string }) => <ErrorBoundary><Suspense fallback={<PageLoader />}><ContractSigningPortal token={params.token} /></Suspense></ErrorBoundary>}</Route>
              <Route path="/sign/:token">{(params: { token: string }) => <ErrorBoundary><Suspense fallback={<PageLoader />}><DocumentSigningPortal token={params.token} /></Suspense></ErrorBoundary>}</Route>
              <Route path="/sps-packet/:token"><ErrorBoundary><Suspense fallback={<PageLoader />}><SpsPacketPortal /></Suspense></ErrorBoundary></Route>
              <Route path="/packet-portal/:token"><ErrorBoundary><Suspense fallback={<PageLoader />}><EmployeePacketPortal /></Suspense></ErrorBoundary></Route>
              <Route path="/client-signup"><ErrorBoundary><Suspense fallback={<PageLoader />}><ClientSignup /></Suspense></ErrorBoundary></Route>
              <Route path="/jobs/:workspaceId"><ErrorBoundary><Suspense fallback={<PageLoader />}><PublicJobBoard /></Suspense></ErrorBoundary></Route>
              <Route path="/forms/:token"><ErrorBoundary><Suspense fallback={<PageLoader />}><PublicFormPage /></Suspense></ErrorBoundary></Route>
              <Route path="/interview/:token"><ErrorBoundary><Suspense fallback={<PageLoader />}><InterviewChatroomPage /></Suspense></ErrorBoundary></Route>
              <Route path="/onboarding/progress/:id"><ErrorBoundary><Suspense fallback={<PageLoader />}><OnboardingProgressPage /></Suspense></ErrorBoundary></Route>
              
              {/* Error pages */}
              <Route path="/error-403" component={Error403} />
              <Route path="/error-404" component={Error404} />
              <Route path="/error-500" component={Error500} />
              
              <Route component={Homepage} />
            </Switch>
            </Suspense>
          </div>
        </ErrorBoundary>
      </GlobalErrorBoundary>
    );
  }

  // Check if user is Root Admin (platform-level access)
  const isRootAdmin = (user as any)?.platformRole === 'root_admin' || (user as any)?.platformRole === 'sysop';

  if (isLoading && !isPublicRoute) {
    return <LoadingScreen />;
  }

  // Expose tutorial function globally for sidebar access
  (window as any).setShowOnboarding = setShowOnboarding;

  // Sidebar width configuration
  const sidebarStyle = {
    "--sidebar-width": "16rem",       // 256px default
    "--sidebar-width-icon": "3.5rem", // 56px collapsed (matches old peek rail)
  };

  // Global overlays — rendered exactly once per session, regardless of layout.
  // Mobile and desktop branches are mutually exclusive, so this JSX is used
  // in only one of the two returns at runtime.
  const trinityGlobalWidget = <TrinityTaskWidget />;

  // Render mobile layout (NO Sidebar component - only UniversalNavHeader + BottomNav)
  if (isMobile) {
    return (
      <>
      {trinityGlobalWidget}
      <ProtectedRoute>
        <SessionTimeoutWarning />
        <GlobalErrorBoundary>
          <CommandPalette />
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground">Skip to main content</a>
          <div className="flex flex-col h-dvh w-full bg-background" data-nav-overlay-open="false">
            {/* Progressive disclosure header with navigation overlay (or legacy UniversalHeader) */}
            {MVP_FEATURE_FLAGS.PROGRESSIVE_NAV ? (
              <ProgressiveHeader />
            ) : (
              <UniversalHeader variant="workspace" />
            )}

            {/* Trinity activity bar — below nav, above content */}
            <TrinityActivityBar />

            {/* Main content area - with bottom nav padding + route guard */}
            {/* Chat routes need fixed-height container (no scroll, no bottom padding) for proper h-full cascade */}
            <main id="main-content" className={`flex-1 overflow-x-hidden min-h-0 w-full max-w-full ${isFixedHeightRoute ? 'overflow-hidden' : 'overflow-y-auto pb-[120px]'}`}>
              <MobileRouteGuard>
              <ErrorBoundary>
                <PageTransition>
                <Suspense fallback={<PageLoader />}>
                <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/mobile-hub" component={MobileHubPage} />
                <Route path="/mobile-more" component={MobileMorePage} />
                <Route path="/dashboard"><ErrorBoundary><Dashboard /></ErrorBoundary></Route>
                <Route path="/multi-company"><ErrorBoundary><MultiCompany /></ErrorBoundary></Route>
                <Route path="/gate-duty"><ErrorBoundary><GateDuty /></ErrorBoundary></Route>
                <Route path="/workspace"><ErrorBoundary><Workspace /></ErrorBoundary></Route>
                <Route path="/command-center"><ErrorBoundary><CommandCenter /></ErrorBoundary></Route>
                <Route path="/commands"><ErrorBoundary><CommandDocumentation /></ErrorBoundary></Route>
                <Route path="/worker"><ErrorBoundary><WorkerDashboard /></ErrorBoundary></Route>
                <Route path="/worker/panic"><ErrorBoundary><WorkerPanic /></ErrorBoundary></Route>
                <Route path="/worker/guard-tour/scan"><ErrorBoundary><GuardTourScan /></ErrorBoundary></Route>
                <Route path="/admin/platform-ops"><ErrorBoundary><PlatformOps /></ErrorBoundary></Route>
                <Route path="/settings/data-privacy"><ErrorBoundary><SettingsDataPrivacy /></ErrorBoundary></Route>
                <Route path="/worker/incidents"><ErrorBoundary><WorkerIncidents /></ErrorBoundary></Route>
                <Route path="/schedule"><ErrorBoundary componentName="Schedule Board"><UniversalSchedule /></ErrorBoundary></Route>
                <Route path="/shift-marketplace"><ErrorBoundary><ShiftMarketplace /></ErrorBoundary></Route>
                <Route path="/shifts/offers/:offerId">{(params: any) => <ErrorBoundary><ShiftOfferPage {...params} /></ErrorBoundary>}</Route>
                <Route path="/workflow-approvals"><ErrorBoundary><WorkflowApprovals /></ErrorBoundary></Route>
                <Route path="/shift-approvals"><ErrorBoundary><ShiftApprovals /></ErrorBoundary></Route>
                <Route path="/sales"><ErrorBoundary><WorkspaceSales /></ErrorBoundary></Route>
                <Route path="/sales-crm"><ErrorBoundary><SalesCRM /></ErrorBoundary></Route>
                <Route path="/sales-pipeline"><ErrorBoundary><SalesPipelinePage /></ErrorBoundary></Route>
                <Route path="/outreach"><ErrorBoundary><Outreach /></ErrorBoundary></Route>
                <Route path="/behavior-scoring"><ErrorBoundary><BehaviorScoring /></ErrorBoundary></Route>
                <Route path="/trinity-memory">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityMemory /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/trinity/transparency">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityTransparencyDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/trinity/agent-dashboard">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityAgentDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/inbound-opportunities"><ErrorBoundary><InboundOpportunities /></ErrorBoundary></Route>
                <Route path="/hris-management"><ErrorBoundary><HRISManagement /></ErrorBoundary></Route>
                <Route path="/labor-law-config"><ErrorBoundary><LaborLawConfig /></ErrorBoundary></Route>
                <Route path="/document-library"><ErrorBoundary componentName="Document Library"><DocumentLibrary /></ErrorBoundary></Route>
                <Route path="/hr-documents"><ErrorBoundary><HrDocuments /></ErrorBoundary></Route>
                <Route path="/hr-document-requests"><ErrorBoundary><HrDocumentRequests /></ErrorBoundary></Route>
                <Route path="/forms"><ErrorBoundary><FormSubmissions /></ErrorBoundary></Route>
                <Route path="/pto"><ErrorBoundary><HRPTO /></ErrorBoundary></Route>
                <Route path="/flex-staffing"><ErrorBoundary><FlexStaffing /></ErrorBoundary></Route>
  
                <Route path="/email-intelligence"><ErrorBoundary><EmailIntelligence /></ErrorBoundary></Route>
                <Route path="/time-tracking"><ErrorBoundary><TimeTracking /></ErrorBoundary></Route>
                <Route path="/employees"><ErrorBoundary componentName="Employee Roster"><Employees /></ErrorBoundary></Route>
                <Route path="/sps-document-safe"><ErrorBoundary><SpsDocumentSafe /></ErrorBoundary></Route>
                <Route path="/sps-client-pipeline"><ErrorBoundary><SpsClientPipeline /></ErrorBoundary></Route>
                <Route path="/quickbooks-import"><ErrorBoundary><QuickBooksImport /></ErrorBoundary></Route>
                <Route path="/resolution-inbox"><ErrorBoundary><ResolutionInbox /></ErrorBoundary></Route>
                <Route path="/org-management"><ErrorBoundary><OrgManagement /></ErrorBoundary></Route>
                <Route path="/role-management"><ErrorBoundary><RoleManagement /></ErrorBoundary></Route>
                <Route path="/manager-dashboard"><ErrorBoundary><ManagerDashboard /></ErrorBoundary></Route>
                <Route path="/engagement/dashboard"><ErrorBoundary><EngagementDashboard /></ErrorBoundary></Route>
                <Route path="/engagement/employee"><ErrorBoundary><EmployeeEngagement /></ErrorBoundary></Route>
                <Route path="/analytics/reports"><ErrorBoundary><AnalyticsReportsPage /></ErrorBoundary></Route>
                <Route path="/qb-reports"><ErrorBoundary><QBReports /></ErrorBoundary></Route>
                <Route path="/clients"><ErrorBoundary componentName="Client List"><Clients /></ErrorBoundary></Route>
                <Route path="/invoices"><ErrorBoundary componentName="Invoice Manager"><Invoices /></ErrorBoundary></Route>
                <Route path="/financial-intelligence"><ErrorBoundary componentName="Financial Intelligence"><FinancialIntelligence /></ErrorBoundary></Route>
                <Route path="/pl-dashboard"><ErrorBoundary componentName="P&L Dashboard"><PLDashboard /></ErrorBoundary></Route>
                <Route path="/org-hub"><ErrorBoundary><OrgHub /></ErrorBoundary></Route>
                <Route path="/developers">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><DeveloperPortal /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/reports"><ErrorBoundary componentName="Reports Dashboard"><Reports /></ErrorBoundary></Route>
                <Route path="/analytics"><ErrorBoundary componentName="Analytics Dashboard"><Analytics /></ErrorBoundary></Route>
                <Route path="/audit-logs"><ErrorBoundary><AuditLogs /></ErrorBoundary></Route>
                <Route path="/automation-control"><ErrorBoundary><AutomationControl /></ErrorBoundary></Route>
                <Route path="/ai/command-center">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><AICommandCenter /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/support/bugs"><ErrorBoundary><SupportBugDashboard /></ErrorBoundary></Route>
                <Route path="/support/queue"><ErrorBoundary><SupportQueue /></ErrorBoundary></Route>
                <Route path="/support/chatrooms"><ErrorBoundary><SupportChatrooms /></ErrorBoundary></Route>
                <Route path="/my-tickets"><ErrorBoundary><MyTickets /></ErrorBoundary></Route>
                <Route path="/support/assisted-onboarding"><ErrorBoundary><AssistedOnboarding /></ErrorBoundary></Route>
                <Route path="/workspace-onboarding"><ErrorBoundary><WorkspaceOnboarding /></ErrorBoundary></Route>
                <Route path="/trinity/self-edit">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinitySelfEditGovernancePage /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/trinity">
                  <RBACRoute require={["owner", "leader"]}>
                    <ErrorBoundary componentName="Trinity AI">
                      <TrinityChat />
                    </ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/insurance"><ErrorBoundary><Insurance /></ErrorBoundary></Route>
                <Route path="/billing"><ErrorBoundary><Billing /></ErrorBoundary></Route>
                <Route path="/subscription"><ErrorBoundary><SubscriptionDashboard /></ErrorBoundary></Route>
                <Route path="/usage"><ErrorBoundary><UsageDashboard /></ErrorBoundary></Route>
                <Route path="/owner-analytics">
                  <OwnerRoute>
                    <ErrorBoundary><OwnerAnalytics /></ErrorBoundary>
                  </OwnerRoute>
                </Route>

                <Route path="/ai-usage">
                  <OwnerRoute>
                    <ErrorBoundary><AiUsageDashboard /></ErrorBoundary>
                  </OwnerRoute>
                </Route>

                <Route path="/workspace/permissions">
                  <RBACRoute require="owner">
                    <ErrorBoundary><PermissionMatrix /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/integrations"><ErrorBoundary><IntegrationsPage /></ErrorBoundary></Route>
                <Route path="/oversight"><ErrorBoundary><OversightHub /></ErrorBoundary></Route>
                <Route path="/expenses"><ErrorBoundary><Expenses /></ErrorBoundary></Route>
                <Route path="/mileage"><ErrorBoundary><Mileage /></ErrorBoundary></Route>
                <Route path="/expense-approvals"><ErrorBoundary><ExpenseApprovals /></ErrorBoundary></Route>
                <Route path="/approvals"><ErrorBoundary><ApprovalsHub /></ErrorBoundary></Route>
                <Route path="/schedule/team"><ErrorBoundary><TeamSchedule /></ErrorBoundary></Route>
                <Route path="/field-reports"><ErrorBoundary><FieldReports /></ErrorBoundary></Route>
                <Route path="/my-team"><ErrorBoundary><MyTeam /></ErrorBoundary></Route>
                <Route path="/timesheets/pending"><ErrorBoundary><PendingTimeEntries /></ErrorBoundary></Route>
                <Route path="/timesheets/approvals"><ErrorBoundary><TimesheetApprovals /></ErrorBoundary></Route>
                <Route path="/i9-compliance"><ErrorBoundary><I9Compliance /></ErrorBoundary></Route>
                <Route path="/compliance-reports"><ErrorBoundary><ComplianceReports /></ErrorBoundary></Route>
                <Route path="/security-compliance"><ErrorBoundary><SecurityComplianceVault /></ErrorBoundary></Route>
                <Route path="/security-compliance/employee/:employeeId">{(params: any) => <ErrorBoundary><EmployeeComplianceDetail {...params} /></ErrorBoundary>}</Route>
                <Route path="/security-compliance/approvals"><ErrorBoundary><ComplianceApprovals /></ErrorBoundary></Route>
                <Route path="/security-compliance/expiration-alerts"><ErrorBoundary><ExpirationAlerts /></ErrorBoundary></Route>
                <Route path="/security-compliance/regulator-access"><ErrorBoundary><RegulatorAccess /></ErrorBoundary></Route>
                <Route path="/security-compliance/my-packet"><ErrorBoundary><EmployeeOnboardingPacket /></ErrorBoundary></Route>
                <Route path="/security-compliance/auditor-portal"><ErrorBoundary><AuditorPortal /></ErrorBoundary></Route>
                <Route path="/security-compliance/audit-readiness"><ErrorBoundary><AuditReadiness /></ErrorBoundary></Route>
                <Route path="/compliance/regulatory-enrollment"><ErrorBoundary><RegulatoryEnrollment /></ErrorBoundary></Route>
                <Route path="/policies"><ErrorBoundary><Policies /></ErrorBoundary></Route>
                <Route path="/payroll/pay-stubs/:id">{(params: any) => <ErrorBoundary componentName="Pay Stub"><PayStubDetail {...params} /></ErrorBoundary>}</Route>
                <Route path="/payroll/timesheets"><ErrorBoundary componentName="Payroll Timesheets"><PayrollTimesheets /></ErrorBoundary></Route>
                <Route path="/payroll/tax-center"><ErrorBoundary componentName="Tax Center"><TaxCenter /></ErrorBoundary></Route>
                <Route path="/payroll"><ErrorBoundary componentName="Payroll Dashboard"><PayrollDashboard /></ErrorBoundary></Route>
                <Route path="/my-paychecks"><ErrorBoundary><MyPaychecks /></ErrorBoundary></Route>
                <Route path="/leaders-hub">
                  <LeaderRoute>
                    <ErrorBoundary><LeadersHub /></ErrorBoundary>
                  </LeaderRoute>
                </Route>
                <Route path="/hr/benefits"><ErrorBoundary><HRBenefits /></ErrorBoundary></Route>
                <Route path="/hr/reviews"><ErrorBoundary><HRReviews /></ErrorBoundary></Route>
                <Route path="/hr/pto"><ErrorBoundary><HRPTO /></ErrorBoundary></Route>
                <Route path="/hr/terminations"><ErrorBoundary><HRTerminations /></ErrorBoundary></Route>
                <Route path="/performance"><ErrorBoundary><PerformancePage /></ErrorBoundary></Route>
                <Route path="/disputes"><ErrorBoundary><Disputes /></ErrorBoundary></Route>
                <Route path="/my-audit-record"><ErrorBoundary><MyAuditRecord /></ErrorBoundary></Route>
                <Route path="/file-grievance"><ErrorBoundary><FileGrievance /></ErrorBoundary></Route>
                <Route path="/review-disputes"><ErrorBoundary><ReviewDisputes /></ErrorBoundary></Route>
                <Route path="/payroll/deductions"><ErrorBoundary><PayrollDeductions /></ErrorBoundary></Route>
                <Route path="/payroll/garnishments"><ErrorBoundary><PayrollGarnishments /></ErrorBoundary></Route>
                <Route path="/communications/onboarding"><ErrorBoundary><CommunicationsOnboarding /></ErrorBoundary></Route>
                <Route path="/diagnostics">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><Diagnostics /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/messages"><ErrorBoundary><PrivateMessages /></ErrorBoundary></Route>
                <Route path="/private-messages"><ErrorBoundary><PrivateMessages /></ErrorBoundary></Route>
                <Route path="/training-os"><ErrorBoundary><Training /></ErrorBoundary></Route>
                <Route path="/training"><ErrorBoundary><TrainingPage /></ErrorBoundary></Route>
                <Route path="/training-certification/modules/:id">{(params: any) => <ErrorBoundary><TrainingModuleLearning {...params} /></ErrorBoundary>}</Route>
                <Route path="/training-certification"><ErrorBoundary><TrainingCertification /></ErrorBoundary></Route>
                <Route path="/recognition"><ErrorBoundary><RecognitionPage /></ErrorBoundary></Route>
                <Route path="/budgeting"><ErrorBoundary><Budgeting /></ErrorBoundary></Route>
                <Route path="/ai-integrations"><ErrorBoundary><AIIntegrations /></ErrorBoundary></Route>
                <Route path="/employee-recognition"><ErrorBoundary><EmployeeRecognition /></ErrorBoundary></Route>
                <Route path="/alert-configuration"><ErrorBoundary><AlertConfiguration /></ErrorBoundary></Route>
                <Route path="/accounting-integrations"><ErrorBoundary><AccountingIntegrations /></ErrorBoundary></Route>
                <Route path="/finance-hub"><ErrorBoundary><FinanceHub /></ErrorBoundary></Route>
                <Route path="/records"><ErrorBoundary><Records /></ErrorBoundary></Route>
                <Route path="/insights"><ErrorBoundary><Insights /></ErrorBoundary></Route>
                <Route path="/rms"><ErrorBoundary><RmsHub /></ErrorBoundary></Route>
                <Route path="/cad"><ErrorBoundary><CadConsole /></ErrorBoundary></Route>
                <Route path="/equipment"><ErrorBoundary><EquipmentPage /></ErrorBoundary></Route>
                <Route path="/guard-tour"><ErrorBoundary><GuardTourPage /></ErrorBoundary></Route>
                <Route path="/work-orders"><ErrorBoundary><WorkOrdersPage /></ErrorBoundary></Route>
                <Route path="/visitor-management"><ErrorBoundary><VisitorManagementPage /></ErrorBoundary></Route>
                <Route path="/dock-chat"><ErrorBoundary><DockChatPage /></ErrorBoundary></Route>
                <Route path="/voice-settings"><ErrorBoundary><VoiceSettingsPage /></ErrorBoundary></Route>
                <Route path="/settings/email"><ErrorBoundary><EmailManagement /></ErrorBoundary></Route>
                <Route path="/settings/dns-guide"><ErrorBoundary><DnsSetupGuide /></ErrorBoundary></Route>
                <Route path="/settings/hiring"><ErrorBoundary><HiringSettingsPage /></ErrorBoundary></Route>
                <Route path="/voice-calls"><ErrorBoundary><VoiceCallsPage /></ErrorBoundary></Route>
                <Route path="/client-communications"><ErrorBoundary><ClientCommunicationsPage /></ErrorBoundary></Route>
                <Route path="/shift-trading"><ErrorBoundary><ShiftTradingPage /></ErrorBoundary></Route>
                <Route path="/safety"><ErrorBoundary><SafetyHub /></ErrorBoundary></Route>
                <Route path="/ethics"><ErrorBoundary><EthicsHotline /></ErrorBoundary></Route>
                <Route path="/post-orders"><ErrorBoundary><PostOrdersPage /></ErrorBoundary></Route>
                <Route path="/post-order-versions"><ErrorBoundary><PostOrderVersionsPage /></ErrorBoundary></Route>
                <Route path="/incident-patterns"><ErrorBoundary><IncidentPatternsPage /></ErrorBoundary></Route>
                <Route path="/contract-renewals"><ErrorBoundary><ContractRenewalsPage /></ErrorBoundary></Route>
                <Route path="/applicant-tracking"><ErrorBoundary><ApplicantTrackingPage /></ErrorBoundary></Route>
                <Route path="/hiring"><ErrorBoundary componentName="Hiring Pipeline"><HiringPipelinePage /></ErrorBoundary></Route>
                <Route path="/recruitment"><ErrorBoundary componentName="Interview Pipeline"><RecruitmentPage /></ErrorBoundary></Route>
                <Route path="/recruitment/candidates/:id">{(params: any) => <ErrorBoundary componentName="Candidate Profile"><CandidateProfilePage {...params} /></ErrorBoundary>}</Route>
                <Route path="/onboarding-tasks"><ErrorBoundary componentName="Onboarding Tasks"><OnboardingTasksPage /></ErrorBoundary></Route>
                <Route path="/training-compliance"><ErrorBoundary><TrainingCompliancePage /></ErrorBoundary></Route>
                <Route path="/subcontractor-management"><ErrorBoundary><SubcontractorManagementPage /></ErrorBoundary></Route>
                <Route path="/client-satisfaction"><ErrorBoundary><ClientSatisfactionPage /></ErrorBoundary></Route>
                <Route path="/surveys"><ErrorBoundary><ClientSurveysPage /></ErrorBoundary></Route>
                <Route path="/bid-management"><ErrorBoundary><BidManagementPage /></ErrorBoundary></Route>
                <Route path="/compliance-matrix"><ErrorBoundary><ComplianceMatrix /></ErrorBoundary></Route>
                <Route path="/client-profitability"><ErrorBoundary><ClientProfitability /></ErrorBoundary></Route>
                <Route path="/cash-flow"><ErrorBoundary><CashFlowDashboard /></ErrorBoundary></Route>
                <Route path="/invoice-aging"><ErrorBoundary><InvoiceAging /></ErrorBoundary></Route>
                <Route path="/turnover-analytics"><ErrorBoundary><TurnoverAnalytics /></ErrorBoundary></Route>
                <Route path="/bi-analytics"><ErrorBoundary><BIAnalytics /></ErrorBoundary></Route>
                <Route path="/situation-board"><ErrorBoundary><SituationBoard /></ErrorBoundary></Route>
                <Route path="/credential-wallet"><ErrorBoundary><CredentialWallet /></ErrorBoundary></Route>
                <Route path="/compliance-evidence"><ErrorBoundary><ComplianceEvidence /></ErrorBoundary></Route>
                <Route path="/proposals"><ErrorBoundary><ProposalBuilder /></ErrorBoundary></Route>
                <Route path="/tx-service-agreement"><ErrorBoundary><TxServiceAgreement /></ErrorBoundary></Route>
                <Route path="/site-briefings"><ErrorBoundary><SiteBriefing /></ErrorBoundary></Route>
                <Route path="/safety-check"><ErrorBoundary><SafetyCheck /></ErrorBoundary></Route>
                <Route path="/wellness"><ErrorBoundary><WellnessPage /></ErrorBoundary></Route>
                <Route path="/site-survey"><ErrorBoundary><SiteSurveyPage /></ErrorBoundary></Route>
                <Route path="/rfp"><ErrorBoundary><RfpManager /></ErrorBoundary></Route>
                <Route path="/rfp-pipeline"><ErrorBoundary><RfpPipeline /></ErrorBoundary></Route>
                <Route path="/coverage-marketplace"><Redirect to="/shift-marketplace" /></Route>
                <Route path="/incident-pipeline"><ErrorBoundary><IncidentPipeline /></ErrorBoundary></Route>
                <Route path="/document-templates"><ErrorBoundary><DocumentTemplates /></ErrorBoundary></Route>
                <Route path="/document-form/:templateId">{(params: any) => <ErrorBoundary><DocumentFormPage {...params} /></ErrorBoundary>}</Route>
                <Route path="/document-vault"><ErrorBoundary><DocumentVault /></ErrorBoundary></Route>
                <Route path="/hr-documents"><ErrorBoundary><HrDocuments /></ErrorBoundary></Route>
                <Route path="/hr-document-requests"><ErrorBoundary><HrDocumentRequests /></ErrorBoundary></Route>
                <Route path="/bridge-channels"><ErrorBoundary><BridgeChannels /></ErrorBoundary></Route>
  
                {/* Feature Category Pages */}
                <Route path="/category/communication"><ErrorBoundary><CommunicationFamilyPage /></ErrorBoundary></Route>
                <Route path="/category/operations"><ErrorBoundary><OperationsFamilyPage /></ErrorBoundary></Route>
                <Route path="/category/growth"><ErrorBoundary><GrowthFamilyPage /></ErrorBoundary></Route>
                <Route path="/category/platform"><ErrorBoundary><PlatformFamilyPage /></ErrorBoundary></Route>
                
                {/* User Menu Routes */}
                <Route path="/profile"><ErrorBoundary><Profile /></ErrorBoundary></Route>
                <Route path="/unavailability"><ErrorBoundary><Unavailability /></ErrorBoundary></Route>
                <Route path="/availability"><ErrorBoundary><AvailabilityPage /></ErrorBoundary></Route>
                <Route path="/create-org"><ErrorBoundary><CreateOrg /></ErrorBoundary></Route>
                <Route path="/onboarding/start"><ErrorBoundary><OnboardingStart /></ErrorBoundary></Route>
                <Route path="/onboarding/email-intro"><ErrorBoundary><Suspense fallback={<PageLoader />}><OnboardingEmailIntro /></Suspense></ErrorBoundary></Route>
                <Route path="/updates"><ErrorBoundary><Updates /></ErrorBoundary></Route>
                <Route path="/help"><ErrorBoundary><Help /></ErrorBoundary></Route>

                {/* Unified Root Administrator Control Center */}
                <Route path="/root-admin-dashboard">
                  <PlatformAdminRoute>
                    <ErrorBoundary><RootAdminDashboard /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                
                {/* Platform admin tools (accessible from control center) */}
                <Route path="/admin/usage">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminUsage /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/custom-forms">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminCustomForms /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/banners">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminBanners /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/permission-matrix">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminPermissionMatrix /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/ticket-reviews">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminTicketReviews /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/helpai">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminHelpAI /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/breach-response">
                  <PlatformAdminRoute>
                    <ErrorBoundary><BreachResponse /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/automation/audit-log"><ErrorBoundary><AutomationAuditLog /></ErrorBoundary></Route>
                <Route path="/automation/settings"><ErrorBoundary><AutomationSettings /></ErrorBoundary></Route>
                <Route path="/ai/brain">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><AIBrainDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/ai/orchestration"><ErrorBoundary><OrchestrationDashboard /></ErrorBoundary></Route>
                <Route path="/ai/audit-log-viewer"><ErrorBoundary><AIAuditLogViewer /></ErrorBoundary></Route>
                <Route path="/ai/workboard"><ErrorBoundary><WorkboardDashboard /></ErrorBoundary></Route>
                <Route path="/trinity-insights">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityInsights /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/system-health">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><SystemHealth /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/infrastructure">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><Infrastructure /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/owner/hireos/workflow-builder"><ErrorBoundary><HiringWorkflowBuilder /></ErrorBoundary></Route>
                <Route path="/employees/:employeeId/file-cabinet">{(params: any) => <ErrorBoundary><EmployeeFileCabinet {...params} /></ErrorBoundary>}</Route>
                <Route path="/employees/:employeeId/hr-record">{(params: any) => <ErrorBoundary><OfficerHrRecord {...params} /></ErrorBoundary>}</Route>
                <Route path="/service-requests"><ErrorBoundary><ServiceRequests /></ErrorBoundary></Route>
                <Route path="/company-reports"><ErrorBoundary><CompanyReports /></ErrorBoundary></Route>
                <Route path="/platform/sales"><ErrorBoundary><WorkspaceSales /></ErrorBoundary></Route>
                <Route path="/employee/portal"><ErrorBoundary><EmployeePortal /></ErrorBoundary></Route>
                <Route path="/auditor/portal"><ErrorBoundary><AuditorPortal /></ErrorBoundary></Route>
                <Route path="/compliance/enforcement-status"><ErrorBoundary><EnforcementStatus /></ErrorBoundary></Route>
                <Route path="/client/portal"><ErrorBoundary><ClientPortal /></ErrorBoundary></Route>
                <Route path="/settings"><ErrorBoundary componentName="Settings"><Settings /></ErrorBoundary></Route>
                <Route path="/alert-settings"><ErrorBoundary><AlertSettings /></ErrorBoundary></Route>
                <Route path="/notifications/log">{(params) => <ErrorBoundary componentName="Notification Log"><Suspense fallback={<PageLoader />}><NotificationLog /></Suspense></ErrorBoundary>}</Route>
                <Route path="/employee/profile"><ErrorBoundary componentName="Employee Profile"><EmployeeProfile /></ErrorBoundary></Route>
                {/* Org-isolated chat rooms (internal communication) - Master-detail pattern */}
                <Route path="/chatrooms"><ErrorBoundary><Chatrooms /></ErrorBoundary></Route>
                <Route path="/chatrooms/:roomId">{(params: any) => <ErrorBoundary><Chatrooms {...params} /></ErrorBoundary>}</Route>
                <Route path="/helpdesk">{(params) => <ErrorBoundary><HelpDesk {...(params as any)} /></ErrorBoundary>}</Route>
                <Route path="/broadcasts"><ErrorBoundary><Broadcasts /></ErrorBoundary></Route>
                <Route path="/briefing-channel"><ErrorBoundary><BriefingChannel /></ErrorBoundary></Route>
                {/* HelpDesk IRC/MSN-style chat interface with WebSocket */}
                <Route path="/chat/:roomId">{(params: { roomId: string }) => <ErrorBoundary><HelpDesk roomId={params.roomId} forceMobileLayout={true} /></ErrorBoundary>}</Route>
                <Route path="/inbox"><ErrorBoundary><EmailIntelligence /></ErrorBoundary></Route>
                <Route path="/support/ai-console"><ErrorBoundary><SupportAIConsole /></ErrorBoundary></Route>
                <Route path="/employee-onboarding"><ErrorBoundary><EmployeeOnboardingDashboard /></ErrorBoundary></Route>
                <Route path="/employee-packets"><ErrorBoundary><EmployeePackets /></ErrorBoundary></Route>
                <Route path="/onboarding-hub"><ErrorBoundary><Suspense fallback={<PageLoader />}><OnboardingHub /></Suspense></ErrorBoundary></Route>
                <Route path="/onboarding-forms"><ErrorBoundary><Suspense fallback={<PageLoader />}><OnboardingForms /></Suspense></ErrorBoundary></Route>
                <Route path="/enterprise/branding"><ErrorBoundary><WhiteLabelBranding /></ErrorBoundary></Route>
                <Route path="/enterprise/fleet"><ErrorBoundary><FleetManagement /></ErrorBoundary></Route>
                <Route path="/enterprise/fleet/compliance"><ErrorBoundary><FleetCompliance /></ErrorBoundary></Route>
                <Route path="/enterprise/armory"><ErrorBoundary><ArmoryManagement /></ErrorBoundary></Route>
                <Route path="/enterprise/armory/compliance"><ErrorBoundary><ArmoryCompliance /></ErrorBoundary></Route>
                <Route path="/enterprise/sso"><ErrorBoundary><SSOConfiguration /></ErrorBoundary></Route>
                <Route path="/enterprise/account-manager"><ErrorBoundary><AccountManager /></ErrorBoundary></Route>
                <Route path="/enterprise/background-checks"><ErrorBoundary><BackgroundChecks /></ErrorBoundary></Route>
                <Route path="/enterprise/api-access">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><ApiAccess /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                
                {/* Parity routes — accessible on both mobile and desktop */}
                <Route path="/platform-feedback"><ErrorBoundary componentName="Platform Feedback"><PlatformFeedbackPage /></ErrorBoundary></Route>
                <Route path="/compliance-scenarios"><ErrorBoundary componentName="Compliance Scenarios"><ComplianceScenariosPage /></ErrorBoundary></Route>
                <Route path="/data-subject-requests"><ErrorBoundary componentName="Data Subject Requests"><DataSubjectRequests /></ErrorBoundary></Route>

                {/* Error pages */}
                <Route path="/error-403"><ErrorBoundary><Error403 /></ErrorBoundary></Route>
                <Route path="/error-404"><ErrorBoundary><Error404 /></ErrorBoundary></Route>
                <Route path="/error-500"><ErrorBoundary><Error500 /></ErrorBoundary></Route>
                
                {/* Legacy URL redirects */}
                {LegacyRedirectRoutes()}
                {HelpdeskRoomRedirect()}
                <Route component={NotFound} />
                </Switch>
                </Suspense>
                </PageTransition>
              </ErrorBoundary>
              </MobileRouteGuard>
            </main>
            
            {/* Mobile Bottom Navigation - Fixed at bottom (hidden during active individual chat) */}
            {!(currentPath.startsWith('/chatrooms/') || currentPath.startsWith('/chat/')) && <MobileBottomNav />}
            {/* Universal FAB - Trinity + Messages + Quick Actions (hidden during active chat) */}
            {/* This is the ONE FAB for mobile per SPEC */}
            {!isChatRoute && <UniversalFAB />}
            {/* PWA Install Prompt - Shows once for mobile users */}
            <PWAInstallPrompt />
          </div>
          <OnboardingWizard isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
          <ConsentModal
            open={isAuthenticated && !consentAcknowledged && !isPublicRoute}
            onAccepted={() => setConsentAcknowledged(true)}
          />
        </GlobalErrorBoundary>
      </ProtectedRoute>
      </>
    );
  }

  // Desktop layout with SidebarProvider
  return (
    <>
    {trinityGlobalWidget}
    <ProtectedRoute>
      <CommandPalette />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground">Skip to main content</a>
      <SidebarProvider style={sidebarStyle as CSSProperties}>
        <SessionTimeoutWarning />
        <div className="flex flex-col h-dvh w-full" data-nav-overlay-open="false">
          {/* Progressive Header with navigation overlay OR legacy header */}
          {MVP_FEATURE_FLAGS.PROGRESSIVE_NAV ? (
            <ProgressiveHeader />
          ) : (
          <>
          {/* Legacy Header + Tabs Navigation (stacked vertically in single sticky container) */}
          {!isMobile && (
            <div className="sticky top-0 z-[1030] bg-background border-b shadow-sm shrink-0">
              <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <SidebarTrigger data-testid="button-sidebar-toggle" aria-label="Toggle navigation sidebar" className="text-muted-foreground" />
                  <a href="/" data-testid="link-logo-desktop" aria-label="CoAIleague — Go to dashboard" className="flex-shrink-0">
                    <UnifiedBrandLogo size="lg" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  {/* Easy View Toggle - Simplified interface for non-technical users */}
                  <SimpleModeToggle variant="compact" />
                  {/* Trinity AI Assistant - Opens chat modal */}
                  <HeaderTrinityButton />
                  {/* Chat Button - Header mounted in middle */}
                  <HeaderChatButton />
                  {/* Mail Button - Internal email system with unread badge */}
                  <MailHeaderButton onClick={() => setLocation('/inbox')} />
                  {/* Notification Hub Bell - Popover with notifications */}
                  <NotificationsPopover />
                  {/* User Menu Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-9 w-9 rounded-full bg-muted"
                        data-testid="button-user-menu"
                        aria-label={`User menu — ${user?.firstName} ${user?.lastName}`}
                        title="User Menu"
                      >
                        <span className="text-sm font-bold" aria-hidden="true">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
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
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => setLocation('/platform-feedback')}
                        data-testid="menu-give-feedback"
                      >
                        <MessageSquarePlus className="h-4 w-4 mr-2" />
                        Give Feedback
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
              <WorkspaceTabsNav />
            </div>
          )}
          </>
          )}
          
          {/* Main content with sidebar — scroll fix v5: was `overflow-hidden`
              which clipped vertical scroll on the entire workspace shell.
              Changed to `overflow-x-hidden` so only horizontal overflow is
              clipped; vertical scroll flows through to main#main-content. */}
          <div className="flex flex-1 min-h-0 w-full overflow-x-hidden">
            {/* Desktop Sidebar - REMOVED: Now using WorkspaceTabsNav for unified navigation */}
            
            {/* Main content container */}
            <div className="flex flex-col flex-1 min-h-0 w-full max-w-full overflow-x-hidden">
              {/* Demo Banner - positioned to account for fixed header (hidden on mobile) */}
              {!isMobile && <DemoBanner />}
              {/* AI System Status Banner - shows when AI is in degraded or emergency mode */}
              <AISystemStatusBanner />
              {/* Regulatory Credential Enrollment Banner - 30-day deadline for all org members */}
              <ComplianceEnrollmentBanner />

            

              {/* Trinity activity bar — below nav banners, above content */}
              <TrinityActivityBar />

              {/* Main content area - visible scrollbar for desktop users */}
              <main id="main-content" className="flex-1 overflow-x-hidden overflow-y-auto bg-background min-h-0 w-full max-w-full" data-scroll="styled">
                {/* Breadcrumb Navigation - hidden on schedule page to maximize viewport */}
                {!isMobileChat && !isMobile && location !== '/schedule' && <PageBreadcrumb />}
              
              <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
              <Switch>
                <Route path="/"><ErrorBoundary><Dashboard /></ErrorBoundary></Route>
                <Route path="/dashboard"><ErrorBoundary><Dashboard /></ErrorBoundary></Route>
                <Route path="/multi-company"><ErrorBoundary><MultiCompany /></ErrorBoundary></Route>
                <Route path="/gate-duty"><ErrorBoundary><GateDuty /></ErrorBoundary></Route>
                <Route path="/workspace"><ErrorBoundary><Workspace /></ErrorBoundary></Route>
                <Route path="/command-center"><ErrorBoundary><CommandCenter /></ErrorBoundary></Route>
                <Route path="/commands"><ErrorBoundary><CommandDocumentation /></ErrorBoundary></Route>
                <Route path="/worker"><ErrorBoundary><WorkerDashboard /></ErrorBoundary></Route>
                <Route path="/worker/panic"><ErrorBoundary><WorkerPanic /></ErrorBoundary></Route>
                <Route path="/worker/guard-tour/scan"><ErrorBoundary><GuardTourScan /></ErrorBoundary></Route>
                <Route path="/admin/platform-ops"><ErrorBoundary><PlatformOps /></ErrorBoundary></Route>
                <Route path="/settings/data-privacy"><ErrorBoundary><SettingsDataPrivacy /></ErrorBoundary></Route>
                <Route path="/worker/incidents"><ErrorBoundary><WorkerIncidents /></ErrorBoundary></Route>
                <Route path="/schedule"><ErrorBoundary componentName="Schedule Board"><UniversalSchedule /></ErrorBoundary></Route>
                <Route path="/shift-marketplace"><ErrorBoundary><ShiftMarketplace /></ErrorBoundary></Route>
                <Route path="/shifts/offers/:offerId">{(params: any) => <ErrorBoundary><ShiftOfferPage {...params} /></ErrorBoundary>}</Route>
                <Route path="/workflow-approvals"><ErrorBoundary><WorkflowApprovals /></ErrorBoundary></Route>
                <Route path="/shift-approvals"><ErrorBoundary><ShiftApprovals /></ErrorBoundary></Route>
                <Route path="/sales"><ErrorBoundary><WorkspaceSales /></ErrorBoundary></Route>
                <Route path="/forms"><ErrorBoundary><FormSubmissions /></ErrorBoundary></Route>
                <Route path="/time-tracking"><ErrorBoundary><TimeTracking /></ErrorBoundary></Route>
                <Route path="/employees"><ErrorBoundary componentName="Employee Roster"><Employees /></ErrorBoundary></Route>
                <Route path="/sps-document-safe"><ErrorBoundary><SpsDocumentSafe /></ErrorBoundary></Route>
                <Route path="/sps-client-pipeline"><ErrorBoundary><SpsClientPipeline /></ErrorBoundary></Route>
                <Route path="/employee-onboarding"><ErrorBoundary><EmployeeOnboardingDashboard /></ErrorBoundary></Route>
                <Route path="/employee-packets"><ErrorBoundary><EmployeePackets /></ErrorBoundary></Route>
                <Route path="/onboarding-hub"><Suspense fallback={<PageLoader />}><ErrorBoundary><OnboardingHub /></ErrorBoundary></Suspense></Route>
                <Route path="/onboarding-forms"><Suspense fallback={<PageLoader />}><ErrorBoundary><OnboardingForms /></ErrorBoundary></Suspense></Route>
                <Route path="/quickbooks-import"><ErrorBoundary><QuickBooksImport /></ErrorBoundary></Route>
                <Route path="/resolution-inbox"><ErrorBoundary><ResolutionInbox /></ErrorBoundary></Route>
                <Route path="/org-management">
                  <RBACRoute require="admin">
                    <ErrorBoundary><OrgManagement /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/role-management">
                  <RBACRoute require="admin">
                    <ErrorBoundary><RoleManagement /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/manager-dashboard">
                  <RBACRoute require="leader">
                    <ErrorBoundary><ManagerDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/engagement/dashboard">
                  <RBACRoute require="leader">
                    <ErrorBoundary><EngagementDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/engagement/employee"><ErrorBoundary><EmployeeEngagement /></ErrorBoundary></Route>
                <Route path="/analytics/reports">
                  <RBACRoute require="leader">
                    <ErrorBoundary><AnalyticsReportsPage /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/qb-reports">
                  <RBACRoute require="admin">
                    <ErrorBoundary><QBReports /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/clients">
                  <RBACRoute require="supervisor">
                    <ErrorBoundary><Clients /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/invoices">
                  <RBACRoute require="admin">
                    <ErrorBoundary><Invoices /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/financial-intelligence">
                  <RBACRoute require="admin">
                    <ErrorBoundary><FinancialIntelligence /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/pl-dashboard">
                  <RBACRoute require="admin">
                    <ErrorBoundary><PLDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/org-hub"><ErrorBoundary><OrgHub /></ErrorBoundary></Route>
                <Route path="/developers">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><DeveloperPortal /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/reports">
                  <RBACRoute require="leader">
                    <ErrorBoundary><Reports /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/analytics">
                  <RBACRoute require="leader">
                    <ErrorBoundary><Analytics /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/audit-logs">
                  <RBACRoute require="admin">
                    <ErrorBoundary><AuditLogs /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/automation-control">
                  <RBACRoute require="admin">
                    <ErrorBoundary><AutomationControl /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/ai/command-center">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><AICommandCenter /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/support/bugs"><ErrorBoundary><SupportBugDashboard /></ErrorBoundary></Route>
                <Route path="/support/queue"><ErrorBoundary><SupportQueue /></ErrorBoundary></Route>
                <Route path="/support/chatrooms"><ErrorBoundary><SupportChatrooms /></ErrorBoundary></Route>
                <Route path="/my-tickets"><ErrorBoundary><MyTickets /></ErrorBoundary></Route>
                <Route path="/support/assisted-onboarding"><ErrorBoundary><AssistedOnboarding /></ErrorBoundary></Route>
                <Route path="/workspace-onboarding"><ErrorBoundary><WorkspaceOnboarding /></ErrorBoundary></Route>
                <Route path="/trinity/self-edit">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinitySelfEditGovernancePage /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/trinity">
                  <RBACRoute require={["owner", "leader"]}>
                    <ErrorBoundary><TrinityChat /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/ai/brain">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><AIBrainDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/ai/orchestration"><ErrorBoundary><OrchestrationDashboard /></ErrorBoundary></Route>
                <Route path="/ai/workboard"><ErrorBoundary><WorkboardDashboard /></ErrorBoundary></Route>
                <Route path="/ai/audit-log-viewer"><ErrorBoundary><AIAuditLogViewer /></ErrorBoundary></Route>
                <Route path="/support/ai-console"><ErrorBoundary><SupportAIConsole /></ErrorBoundary></Route>
                <Route path="/trinity-insights">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityInsights /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/system-health">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><SystemHealth /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/infrastructure">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><Infrastructure /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/insurance"><ErrorBoundary><Insurance /></ErrorBoundary></Route>
                <Route path="/billing"><ErrorBoundary><Billing /></ErrorBoundary></Route>
                <Route path="/subscription"><ErrorBoundary><SubscriptionDashboard /></ErrorBoundary></Route>
                <Route path="/usage"><ErrorBoundary><UsageDashboard /></ErrorBoundary></Route>
                <Route path="/owner-analytics">
                  <OwnerRoute>
                    <ErrorBoundary><OwnerAnalytics /></ErrorBoundary>
                  </OwnerRoute>
                </Route>

                <Route path="/ai-usage">
                  <OwnerRoute>
                    <ErrorBoundary><AiUsageDashboard /></ErrorBoundary>
                  </OwnerRoute>
                </Route>

                <Route path="/workspace/permissions">
                  <RBACRoute require="owner">
                    <ErrorBoundary><PermissionMatrix /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/integrations"><ErrorBoundary><IntegrationsPage /></ErrorBoundary></Route>
                <Route path="/oversight"><ErrorBoundary><OversightHub /></ErrorBoundary></Route>
                <Route path="/expenses"><ErrorBoundary><Expenses /></ErrorBoundary></Route>
                <Route path="/mileage"><ErrorBoundary><Mileage /></ErrorBoundary></Route>
                <Route path="/expense-approvals"><ErrorBoundary><ExpenseApprovals /></ErrorBoundary></Route>
                <Route path="/approvals"><ErrorBoundary><ApprovalsHub /></ErrorBoundary></Route>
                <Route path="/schedule/team"><ErrorBoundary><TeamSchedule /></ErrorBoundary></Route>
                <Route path="/field-reports"><ErrorBoundary><FieldReports /></ErrorBoundary></Route>
                <Route path="/my-team"><ErrorBoundary><MyTeam /></ErrorBoundary></Route>
                <Route path="/timesheets/pending"><ErrorBoundary><PendingTimeEntries /></ErrorBoundary></Route>
                <Route path="/timesheets/approvals"><ErrorBoundary><TimesheetApprovals /></ErrorBoundary></Route>
                <Route path="/i9-compliance"><ErrorBoundary><I9Compliance /></ErrorBoundary></Route>
                <Route path="/compliance-reports"><ErrorBoundary><ComplianceReports /></ErrorBoundary></Route>
                <Route path="/security-compliance"><ErrorBoundary><SecurityComplianceVault /></ErrorBoundary></Route>
                <Route path="/security-compliance/employee/:employeeId">{(params: any) => <ErrorBoundary><EmployeeComplianceDetail {...params} /></ErrorBoundary>}</Route>
                <Route path="/security-compliance/approvals"><ErrorBoundary><ComplianceApprovals /></ErrorBoundary></Route>
                <Route path="/security-compliance/expiration-alerts"><ErrorBoundary><ExpirationAlerts /></ErrorBoundary></Route>
                <Route path="/security-compliance/regulator-access"><ErrorBoundary><RegulatorAccess /></ErrorBoundary></Route>
                <Route path="/security-compliance/my-packet"><ErrorBoundary><EmployeeOnboardingPacket /></ErrorBoundary></Route>
                <Route path="/security-compliance/auditor-portal"><ErrorBoundary><AuditorPortal /></ErrorBoundary></Route>
                <Route path="/security-compliance/audit-readiness"><ErrorBoundary><AuditReadiness /></ErrorBoundary></Route>
                <Route path="/compliance/regulatory-enrollment"><ErrorBoundary><RegulatoryEnrollment /></ErrorBoundary></Route>
                <Route path="/policies"><ErrorBoundary><Policies /></ErrorBoundary></Route>
                <Route path="/payroll/pay-stubs/:id">{(params: any) => <ErrorBoundary componentName="Pay Stub"><PayStubDetail {...params} /></ErrorBoundary>}</Route>
                <Route path="/payroll/timesheets"><ErrorBoundary componentName="Payroll Timesheets"><PayrollTimesheets /></ErrorBoundary></Route>
                <Route path="/payroll/tax-center"><ErrorBoundary componentName="Tax Center"><TaxCenter /></ErrorBoundary></Route>
                <Route path="/payroll"><ErrorBoundary componentName="Payroll Dashboard"><PayrollDashboard /></ErrorBoundary></Route>
                <Route path="/my-paychecks"><ErrorBoundary><MyPaychecks /></ErrorBoundary></Route>
                <Route path="/leaders-hub">
                  <LeaderRoute>
                    <ErrorBoundary><LeadersHub /></ErrorBoundary>
                  </LeaderRoute>
                </Route>
                <Route path="/hr/benefits"><ErrorBoundary><HRBenefits /></ErrorBoundary></Route>
                <Route path="/hr/reviews"><ErrorBoundary><HRReviews /></ErrorBoundary></Route>
                <Route path="/hr/pto"><ErrorBoundary><HRPTO /></ErrorBoundary></Route>
                <Route path="/hr/terminations"><ErrorBoundary><HRTerminations /></ErrorBoundary></Route>
                <Route path="/performance"><ErrorBoundary><PerformancePage /></ErrorBoundary></Route>
                <Route path="/disputes"><ErrorBoundary><Disputes /></ErrorBoundary></Route>
                <Route path="/my-audit-record"><ErrorBoundary><MyAuditRecord /></ErrorBoundary></Route>
                <Route path="/file-grievance"><ErrorBoundary><FileGrievance /></ErrorBoundary></Route>
                <Route path="/review-disputes"><ErrorBoundary><ReviewDisputes /></ErrorBoundary></Route>
                <Route path="/payroll/deductions"><ErrorBoundary><PayrollDeductions /></ErrorBoundary></Route>
                <Route path="/payroll/garnishments"><ErrorBoundary><PayrollGarnishments /></ErrorBoundary></Route>
                <Route path="/communications/onboarding"><ErrorBoundary><CommunicationsOnboarding /></ErrorBoundary></Route>
                <Route path="/chatrooms"><ErrorBoundary><Chatrooms /></ErrorBoundary></Route>
                <Route path="/chatrooms/:roomId">{(params: any) => <ErrorBoundary><Chatrooms {...params} /></ErrorBoundary>}</Route>
                <Route path="/helpdesk">{(params) => <ErrorBoundary><HelpDesk {...(params as any)} /></ErrorBoundary>}</Route>
                <Route path="/broadcasts"><ErrorBoundary><Broadcasts /></ErrorBoundary></Route>
                <Route path="/briefing-channel"><ErrorBoundary><BriefingChannel /></ErrorBoundary></Route>
                <Route path="/chat/:roomId">{(params: { roomId: string }) => <ErrorBoundary><HelpDesk roomId={params.roomId} /></ErrorBoundary>}</Route>
                <Route path="/inbox"><ErrorBoundary><EmailIntelligence /></ErrorBoundary></Route>
                <Route path="/diagnostics">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><Diagnostics /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/messages"><ErrorBoundary><PrivateMessages /></ErrorBoundary></Route>
                <Route path="/private-messages"><ErrorBoundary><PrivateMessages /></ErrorBoundary></Route>
                <Route path="/training-os"><ErrorBoundary><Training /></ErrorBoundary></Route>
                <Route path="/training"><ErrorBoundary><TrainingPage /></ErrorBoundary></Route>
                <Route path="/training-certification/modules/:id">{(params: any) => <ErrorBoundary><TrainingModuleLearning {...params} /></ErrorBoundary>}</Route>
                <Route path="/training-certification"><ErrorBoundary><TrainingCertification /></ErrorBoundary></Route>
                <Route path="/recognition"><ErrorBoundary><RecognitionPage /></ErrorBoundary></Route>
                <Route path="/budgeting"><ErrorBoundary><Budgeting /></ErrorBoundary></Route>
                <Route path="/ai-integrations"><ErrorBoundary><AIIntegrations /></ErrorBoundary></Route>
                <Route path="/employee-recognition"><ErrorBoundary><EmployeeRecognition /></ErrorBoundary></Route>
                <Route path="/alert-configuration"><ErrorBoundary><AlertConfiguration /></ErrorBoundary></Route>
                <Route path="/accounting-integrations"><ErrorBoundary><AccountingIntegrations /></ErrorBoundary></Route>
                <Route path="/finance-hub"><ErrorBoundary><FinanceHub /></ErrorBoundary></Route>
                <Route path="/records"><ErrorBoundary><Records /></ErrorBoundary></Route>
                <Route path="/insights"><ErrorBoundary><Insights /></ErrorBoundary></Route>
                <Route path="/behavior-scoring"><ErrorBoundary><BehaviorScoring /></ErrorBoundary></Route>
                <Route path="/trinity-memory">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityMemory /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/trinity/transparency">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityTransparencyDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/trinity/agent-dashboard">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><TrinityAgentDashboard /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/document-library"><ErrorBoundary componentName="Document Library"><DocumentLibrary /></ErrorBoundary></Route>
                <Route path="/labor-law-config"><ErrorBoundary><LaborLawConfig /></ErrorBoundary></Route>
                <Route path="/inbound-opportunities"><ErrorBoundary><InboundOpportunities /></ErrorBoundary></Route>
                <Route path="/hris-management"><ErrorBoundary><HRISManagement /></ErrorBoundary></Route>
                <Route path="/outreach"><ErrorBoundary><Outreach /></ErrorBoundary></Route>
                <Route path="/sales-crm"><ErrorBoundary><SalesCRM /></ErrorBoundary></Route>
                <Route path="/sales-pipeline"><ErrorBoundary componentName="Sales Pipeline"><SalesPipelinePage /></ErrorBoundary></Route>
                <Route path="/email-intelligence"><ErrorBoundary><EmailIntelligence /></ErrorBoundary></Route>
                <Route path="/pto"><ErrorBoundary><HRPTO /></ErrorBoundary></Route>
                <Route path="/flex-staffing"><ErrorBoundary><FlexStaffing /></ErrorBoundary></Route>
                <Route path="/availability"><ErrorBoundary><AvailabilityPage /></ErrorBoundary></Route>
                <Route path="/automation/settings"><ErrorBoundary><AutomationSettings /></ErrorBoundary></Route>
                <Route path="/automation/audit-log"><ErrorBoundary><AutomationAuditLog /></ErrorBoundary></Route>
                <Route path="/settings/email"><ErrorBoundary><EmailManagement /></ErrorBoundary></Route>
                <Route path="/settings/dns-guide"><ErrorBoundary><DnsSetupGuide /></ErrorBoundary></Route>
                <Route path="/settings/hiring"><ErrorBoundary><HiringSettingsPage /></ErrorBoundary></Route>
                <Route path="/category/communication"><ErrorBoundary><CommunicationFamilyPage /></ErrorBoundary></Route>
                <Route path="/category/operations"><ErrorBoundary><OperationsFamilyPage /></ErrorBoundary></Route>
                <Route path="/category/growth"><ErrorBoundary><GrowthFamilyPage /></ErrorBoundary></Route>
                <Route path="/category/platform"><ErrorBoundary><PlatformFamilyPage /></ErrorBoundary></Route>
                <Route path="/profile"><ErrorBoundary><Profile /></ErrorBoundary></Route>
                <Route path="/unavailability"><ErrorBoundary><Unavailability /></ErrorBoundary></Route>
                <Route path="/create-org"><ErrorBoundary><CreateOrg /></ErrorBoundary></Route>
                <Route path="/onboarding/start"><ErrorBoundary><OnboardingStart /></ErrorBoundary></Route>
                <Route path="/onboarding/email-intro"><ErrorBoundary><Suspense fallback={<PageLoader />}><OnboardingEmailIntro /></Suspense></ErrorBoundary></Route>
                <Route path="/updates"><ErrorBoundary><Updates /></ErrorBoundary></Route>
                <Route path="/help"><ErrorBoundary><Help /></ErrorBoundary></Route>
                <Route path="/root-admin-dashboard">
                  <PlatformAdminRoute>
                    <ErrorBoundary><RootAdminDashboard /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/usage">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminUsage /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/custom-forms">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminCustomForms /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/banners">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminBanners /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/permission-matrix">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminPermissionMatrix /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/ticket-reviews">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminTicketReviews /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/helpai">
                  <PlatformAdminRoute>
                    <ErrorBoundary><AdminHelpAI /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/admin/breach-response">
                  <PlatformAdminRoute>
                    <ErrorBoundary><BreachResponse /></ErrorBoundary>
                  </PlatformAdminRoute>
                </Route>
                <Route path="/owner/hireos/workflow-builder"><ErrorBoundary><HiringWorkflowBuilder /></ErrorBoundary></Route>
                <Route path="/employees/:employeeId/file-cabinet">{(params: any) => <ErrorBoundary><EmployeeFileCabinet {...params} /></ErrorBoundary>}</Route>
                <Route path="/employees/:employeeId/hr-record">{(params: any) => <ErrorBoundary><OfficerHrRecord {...params} /></ErrorBoundary>}</Route>
                <Route path="/service-requests"><ErrorBoundary><ServiceRequests /></ErrorBoundary></Route>
                <Route path="/company-reports"><ErrorBoundary><CompanyReports /></ErrorBoundary></Route>
                <Route path="/platform/sales"><ErrorBoundary><WorkspaceSales /></ErrorBoundary></Route>
                <Route path="/employee/portal"><ErrorBoundary><EmployeePortal /></ErrorBoundary></Route>
                <Route path="/auditor/portal"><ErrorBoundary><AuditorPortal /></ErrorBoundary></Route>
                <Route path="/compliance/enforcement-status"><ErrorBoundary><EnforcementStatus /></ErrorBoundary></Route>
                <Route path="/client/portal"><ErrorBoundary><ClientPortal /></ErrorBoundary></Route>
                <Route path="/settings"><ErrorBoundary componentName="Settings"><Settings /></ErrorBoundary></Route>
                <Route path="/enterprise/branding"><ErrorBoundary><WhiteLabelBranding /></ErrorBoundary></Route>
                <Route path="/enterprise/fleet"><ErrorBoundary><FleetManagement /></ErrorBoundary></Route>
                <Route path="/enterprise/fleet/compliance"><ErrorBoundary><FleetCompliance /></ErrorBoundary></Route>
                <Route path="/enterprise/armory"><ErrorBoundary><ArmoryManagement /></ErrorBoundary></Route>
                <Route path="/enterprise/armory/compliance"><ErrorBoundary><ArmoryCompliance /></ErrorBoundary></Route>
                <Route path="/enterprise/sso"><ErrorBoundary><SSOConfiguration /></ErrorBoundary></Route>
                <Route path="/enterprise/account-manager"><ErrorBoundary><AccountManager /></ErrorBoundary></Route>
                <Route path="/enterprise/background-checks"><ErrorBoundary><BackgroundChecks /></ErrorBoundary></Route>
                <Route path="/enterprise/api-access">
                  <RBACRoute require="platform_staff">
                    <ErrorBoundary><ApiAccess /></ErrorBoundary>
                  </RBACRoute>
                </Route>
                <Route path="/alert-settings"><ErrorBoundary><AlertSettings /></ErrorBoundary></Route>
                <Route path="/notifications/log">{(params) => <ErrorBoundary componentName="Notification Log"><Suspense fallback={<PageLoader />}><NotificationLog /></Suspense></ErrorBoundary>}</Route>
                <Route path="/employee/profile"><ErrorBoundary componentName="Employee Profile"><EmployeeProfile /></ErrorBoundary></Route>
                <Route path="/safety-check"><ErrorBoundary><SafetyCheck /></ErrorBoundary></Route>
                <Route path="/wellness"><ErrorBoundary><WellnessPage /></ErrorBoundary></Route>
                <Route path="/site-survey"><ErrorBoundary><SiteSurveyPage /></ErrorBoundary></Route>
                <Route path="/dock-chat"><ErrorBoundary componentName="DockChat"><DockChatPage /></ErrorBoundary></Route>
                <Route path="/voice-settings"><ErrorBoundary componentName="Voice Settings"><VoiceSettingsPage /></ErrorBoundary></Route>
                <Route path="/voice-calls"><ErrorBoundary componentName="Voice Calls"><VoiceCallsPage /></ErrorBoundary></Route>
                <Route path="/client-communications"><ErrorBoundary componentName="Client Communications"><ClientCommunicationsPage /></ErrorBoundary></Route>
                <Route path="/shift-trading"><ErrorBoundary componentName="Shift Trading"><ShiftTradingPage /></ErrorBoundary></Route>
                <Route path="/post-orders"><ErrorBoundary componentName="Post Orders"><PostOrdersPage /></ErrorBoundary></Route>
                <Route path="/post-order-versions"><ErrorBoundary componentName="Post Order Versions"><PostOrderVersionsPage /></ErrorBoundary></Route>
                <Route path="/incident-patterns"><ErrorBoundary componentName="Incident Patterns"><IncidentPatternsPage /></ErrorBoundary></Route>
                <Route path="/contract-renewals"><ErrorBoundary componentName="Contract Renewals"><ContractRenewalsPage /></ErrorBoundary></Route>
                <Route path="/applicant-tracking"><ErrorBoundary componentName="Applicant Tracking"><ApplicantTrackingPage /></ErrorBoundary></Route>
                <Route path="/hiring"><ErrorBoundary componentName="Hiring Pipeline"><HiringPipelinePage /></ErrorBoundary></Route>
                <Route path="/recruitment"><ErrorBoundary componentName="Interview Pipeline"><RecruitmentPage /></ErrorBoundary></Route>
                <Route path="/recruitment/candidates/:id">{(params: any) => <ErrorBoundary componentName="Candidate Profile"><CandidateProfilePage {...params} /></ErrorBoundary>}</Route>
                <Route path="/onboarding-tasks"><ErrorBoundary componentName="Onboarding Tasks"><OnboardingTasksPage /></ErrorBoundary></Route>
                <Route path="/training-compliance"><ErrorBoundary componentName="Training Compliance"><TrainingCompliancePage /></ErrorBoundary></Route>
                <Route path="/subcontractor-management"><ErrorBoundary componentName="Subcontractor Management"><SubcontractorManagementPage /></ErrorBoundary></Route>
                <Route path="/client-satisfaction"><ErrorBoundary componentName="Client Satisfaction"><ClientSatisfactionPage /></ErrorBoundary></Route>
                <Route path="/surveys"><ErrorBoundary componentName="Client Surveys"><ClientSurveysPage /></ErrorBoundary></Route>
                <Route path="/bid-management"><ErrorBoundary componentName="Bid Management"><BidManagementPage /></ErrorBoundary></Route>
                <Route path="/compliance-matrix"><ErrorBoundary componentName="Compliance Matrix"><ComplianceMatrix /></ErrorBoundary></Route>
                <Route path="/client-profitability"><ErrorBoundary componentName="Client Profitability"><ClientProfitability /></ErrorBoundary></Route>
                <Route path="/cash-flow"><ErrorBoundary componentName="Cash Flow Dashboard"><CashFlowDashboard /></ErrorBoundary></Route>
                <Route path="/invoice-aging"><ErrorBoundary componentName="Invoice Aging"><InvoiceAging /></ErrorBoundary></Route>
                <Route path="/turnover-analytics"><ErrorBoundary componentName="Turnover Analytics"><TurnoverAnalytics /></ErrorBoundary></Route>
                <Route path="/bi-analytics"><ErrorBoundary componentName="BI Analytics"><BIAnalytics /></ErrorBoundary></Route>
                <Route path="/situation-board"><ErrorBoundary componentName="Situation Board"><SituationBoard /></ErrorBoundary></Route>
                <Route path="/credential-wallet"><ErrorBoundary componentName="Credential Wallet"><CredentialWallet /></ErrorBoundary></Route>
                <Route path="/compliance-evidence"><ErrorBoundary componentName="Compliance Evidence"><ComplianceEvidence /></ErrorBoundary></Route>
                <Route path="/proposals"><ErrorBoundary componentName="Proposal Builder"><ProposalBuilder /></ErrorBoundary></Route>
                <Route path="/tx-service-agreement"><ErrorBoundary componentName="Service Agreement"><TxServiceAgreement /></ErrorBoundary></Route>
                <Route path="/site-briefings"><ErrorBoundary componentName="Site Briefings"><SiteBriefing /></ErrorBoundary></Route>
                <Route path="/end-user-controls"><ErrorBoundary componentName="End User Controls"><EndUserControls /></ErrorBoundary></Route>
                <Route path="/data-subject-requests"><ErrorBoundary componentName="Data Subject Requests"><DataSubjectRequests /></ErrorBoundary></Route>
                <Route path="/platform-admin"><ErrorBoundary componentName="Platform Admin"><PlatformAdmin /></ErrorBoundary></Route>
                <Route path="/platform-feedback"><ErrorBoundary componentName="Platform Feedback"><PlatformFeedbackPage /></ErrorBoundary></Route>
                <Route path="/canonical-config"><ErrorBoundary componentName="Canonical Config"><CanonicalConfigPage /></ErrorBoundary></Route>
                <Route path="/admin/support-console"><ErrorBoundary componentName="Support Console"><SupportConsolePage /></ErrorBoundary></Route>
                <Route path="/admin/support-console/tickets"><ErrorBoundary componentName="Support Console Tickets"><SupportConsoleTicketsPage /></ErrorBoundary></Route>
                <Route path="/admin/support-console/workspace"><ErrorBoundary componentName="Support Console Workspace"><SupportConsoleWorkspacePage /></ErrorBoundary></Route>
                <Route path="/schedule-mobile"><ErrorBoundary componentName="Mobile Schedule"><ScheduleMobileFirst /></ErrorBoundary></Route>
                <Route path="/go-live"><ErrorBoundary componentName="Go Live"><GoLivePage /></ErrorBoundary></Route>
                <Route path="/compliance-scenarios"><ErrorBoundary componentName="Compliance Scenarios"><ComplianceScenariosPage /></ErrorBoundary></Route>

                {/* Parity routes — accessible on both mobile and desktop */}
                <Route path="/bridge-channels"><ErrorBoundary><BridgeChannels /></ErrorBoundary></Route>
                <Route path="/cad"><ErrorBoundary><CadConsole /></ErrorBoundary></Route>
                <Route path="/coverage-marketplace"><Redirect to="/shift-marketplace" /></Route>
                <Route path="/document-form/:templateId">{(params: any) => <ErrorBoundary><DocumentFormPage {...params} /></ErrorBoundary>}</Route>
                <Route path="/document-templates"><ErrorBoundary><DocumentTemplates /></ErrorBoundary></Route>
                <Route path="/document-vault"><ErrorBoundary><DocumentVault /></ErrorBoundary></Route>
                <Route path="/equipment"><ErrorBoundary><EquipmentPage /></ErrorBoundary></Route>
                <Route path="/ethics"><ErrorBoundary><EthicsHotline /></ErrorBoundary></Route>
                <Route path="/guard-tour"><ErrorBoundary><GuardTourPage /></ErrorBoundary></Route>
                <Route path="/hr-document-requests"><ErrorBoundary><HrDocumentRequests /></ErrorBoundary></Route>
                <Route path="/hr-documents"><ErrorBoundary><HrDocuments /></ErrorBoundary></Route>
                <Route path="/incident-pipeline"><ErrorBoundary><IncidentPipeline /></ErrorBoundary></Route>
                <Route path="/rfp"><ErrorBoundary><RfpManager /></ErrorBoundary></Route>
                <Route path="/rfp-pipeline"><ErrorBoundary><RfpPipeline /></ErrorBoundary></Route>
                <Route path="/rms"><ErrorBoundary><RmsHub /></ErrorBoundary></Route>
                <Route path="/safety"><ErrorBoundary><SafetyHub /></ErrorBoundary></Route>

                {/* Error pages */}
                <Route path="/error-403"><ErrorBoundary><Error403 /></ErrorBoundary></Route>
                <Route path="/error-404"><ErrorBoundary><Error404 /></ErrorBoundary></Route>
                <Route path="/error-500"><ErrorBoundary><Error500 /></ErrorBoundary></Route>
                
                {/* Legacy URL redirects */}
                {LegacyRedirectRoutes()}
                {HelpdeskRoomRedirect()}
                <Route component={NotFound} />
              </Switch>
              </Suspense>
              </ErrorBoundary>
              </main>
            </div>
          </div>
        </div>
      </SidebarProvider>
      <OnboardingWizard isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <ConsentModal
        open={isAuthenticated && !consentAcknowledged && !isPublicRoute}
        onAccepted={() => setConsentAcknowledged(true)}
      />
      {/* TrinityAmbientFAB — desktop only (returns null on mobile internally) */}
      <TrinityAmbientFAB />
    </ProtectedRoute>
    </>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Never show the splash screen on public/marketing routes —
    // it covers everything (fixed inset-0 z-99999) and would blank the page.
    const publicPaths = [
      '/', '/login', '/register', '/pricing', '/contact', '/support',
      '/terms', '/privacy', '/forgot-password', '/reset-password',
      '/trinity-features', '/compare', '/roi-calculator', '/templates',
      '/auditor/login', '/shift-accept', '/org-unavailable',
    ];
    const currentPath = window.location.pathname;
    const isPublicPath = publicPaths.includes(currentPath) ||
      currentPath.startsWith('/regulatory') ||
      currentPath.startsWith('/onboarding/') ||
      currentPath.startsWith('/pay-invoice/');
    if (isPublicPath) return false;

    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as any).standalone === true ||
                  document.referrer.includes('android-app://');
    try {
      if (isPWA) return !localStorage.getItem('coaileague_pwa_splash_seen');
      return !localStorage.getItem('coaileague_splash_seen');
    } catch { return false; }
  });

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    try {
      localStorage.setItem('coaileague_splash_seen', 'true');
      if (window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes('android-app://')) {
        localStorage.setItem('coaileague_pwa_splash_seen', 'true');
      }
    } catch { /* ignore storage errors */ }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalErrorBoundary>
        <UniversalToastProvider>
        <GlobalMutationErrorHandler />
        <ServiceHealthProvider>
          <WebSocketProvider>
          <UniversalConfigProvider>
          <ForceRefreshProvider>
          <UniversalLoadingGateProvider>
            <OverlayControllerProvider>
              <ThemeProvider defaultTheme="auto">
                <WorkspaceBrandProvider>
                  <TransitionProvider>
                  <TooltipProvider>
                      <SeasonalThemeProvider>
                        <SimpleModeProvider>
                        <LayerManagerProvider>
                        <TransitionLoaderProvider>
                        <TrinityModalProvider>
                        <TrinitySessionProvider>
                        <ChatDockProvider>
                        <ResponsiveAppFrame>
                          {showSplash && <SplashScreen onComplete={handleSplashComplete} minDisplayTime={3000} />}
                          <ConnectionStatusBanner />
                          <OfflineIndicator />
                          <SWUpdateBanner />
                          <ServiceWorkerMessageListener />
                          <ChatroomNotificationListener />
                          <LanguageSync />
                          <Suspense fallback={<PageLoader />}>
                            <PaymentEnforcementProvider><AppContent /></PaymentEnforcementProvider>
                          </Suspense>
                          <UnifiedChatBubble />
                          <Toaster />
                          <CookieBanner mode="banner" />
                          <TermsAcceptanceGate />
                          <TrinityAnnouncementDisplay position="bottom-right" />
                          <TrinityTrademarkStrip />
                        </ResponsiveAppFrame>
                        {/* Seasonal effects layer - snowfall, ornaments, etc. - lazy loaded */}
                        <ErrorBoundary>
                          <Suspense fallback={null}>
                            <SeasonalEffectsLayer />
                          </Suspense>
                        </ErrorBoundary>
                        {/* Floating Setup Guide - Stripe-style universal widget (positioned bottom-right) - lazy loaded */}
                        <ErrorBoundary>
                          <Suspense fallback={null}>
                            <div className="fixed bottom-6 right-6 z-[1031] pointer-events-none">
                              <div className="pointer-events-auto">
                                <SetupGuidePanel />
                              </div>
                            </div>
                          </Suspense>
                        </ErrorBoundary>
                        {/* DISABLED: Trinity floating mascot body - removed from screen */}
                        {/* <MascotRenderer /> */}
                        </ChatDockProvider>
                        </TrinitySessionProvider>
                        </TrinityModalProvider>
                        </TransitionLoaderProvider>
                        </LayerManagerProvider>
                        </SimpleModeProvider>
                      </SeasonalThemeProvider>
                  </TooltipProvider>
                  </TransitionProvider>
                </WorkspaceBrandProvider>
              </ThemeProvider>
            </OverlayControllerProvider>
          </UniversalLoadingGateProvider>
        </ForceRefreshProvider>
        </UniversalConfigProvider>
        </WebSocketProvider>
        </ServiceHealthProvider>
        </UniversalToastProvider>
      </GlobalErrorBoundary>
    </QueryClientProvider>
  );
}
