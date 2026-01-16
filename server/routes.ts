// Multi-tenant SaaS API Routes
// References: javascript_log_in_with_replit, javascript_database, javascript_stripe blueprints

import type { Express } from "express";
import { createServer, type Server } from "http";

// ============================================================================
// PLATFORM WORKSPACE SEEDING LOCK
// ============================================================================
// Prevents concurrent runtime seeding attempts from racing and violating FK constraints
let platformWorkspaceSeedingInProgress = false;
const platformWorkspaceSeedLock = {
  async acquire(): Promise<void> {
    while (platformWorkspaceSeedingInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
    }
    platformWorkspaceSeedingInProgress = true;
  },
  release(): void {
    platformWorkspaceSeedingInProgress = false;
  }
};
import { storage } from "./storage";
import { db, pool } from "./db";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupAuth as setupCustomAuth, requireAuth } from "./auth"; // Custom auth
import authRoutes from "./authRoutes"; // Custom auth routes
import mascotRouter from "./routes/mascot-routes"; // Trinity AI Mascot routes
import trinityAlertsRouter from "./routes/trinity-alerts"; // Trinity Autonomous Alerts
import { billingRouter } from "./billing-api"; // Billing API routes
import { aiBrainRouter } from "./ai-brain-routes"; // Unified AI Brain System
import { helpaiRouter } from "./helpai-routes"; // HelpAI Orchestration System (Phases 2-5)
import { registerFaqRoutes } from "./faq-routes"; // HelpAI FAQ routes
import trinityInsightsRouter from "./routes/trinityInsightsRoutes"; // Trinity AI Business Intelligence
import trinityMaintenanceRouter from "./routes/trinityMaintenanceRoutes"; // Trinity Platform Maintenance
import quickFixRouter from "./routes/quickFixRoutes"; // Quick Fix System with RBAC audit trail
import experienceRoutes from "./routes/experienceRoutes"; // Experience Enhancement (Smart Replies, Haptics, Theming)
import trinityControlConsoleRouter from "./routes/trinityControlConsoleRoutes"; // Trinity Control Console
import deviceLoaderRouter from "./routes/deviceLoaderRoutes"; // Universal Device Loader
import controlTowerRouter from "./routes/controlTowerRoutes"; // Control Tower Dashboard API
import integrationRouter from "./integrationRoutes"; // Partner Integration OAuth routes
import { timeEntryRouter } from "./time-entry-routes"; // Universal Time Tracking & Clock System
import { shiftsRouter, incidentsRouter } from './routes/mobileWorkerRoutes'; // Mobile Worker API
import { gamificationRouter } from "./gamification-api"; // Employee Engagement & Recognition System
import schedulerRouter from "./routes/schedulerRoutes"; // CoAIleague Autonomous Scheduler API
import { automationRouter } from "./routes/automation"; // Core Automation (Scheduling, Invoicing, Payroll)
import automationEventsRouter from "./routes/automation-events"; // Automation Events API
import { migrationRouter } from "./routes/migration"; // Data Migration from External Platforms
import { registerHealthRoutes } from "./routes/health"; // Health check monitoring
import { registerSearchRoutes } from "./routes/searchRoutes"; // AI-Powered Intelligent Search
import { registerIntegrationRoutes } from "./routes/integrationRoutes"; // QuickBooks exception and automation health
import { registerWorkboardRoutes } from "./routes/workboardRoutes"; // AI Brain Workboard Job Queue
import approvalRoutes from "./routes/approvalRoutes"; // AI Approval Requests
import { auditContextMiddleware } from "./middleware/audit";
import { 
  apiLimiter, 
  authLimiter, 
  mutationLimiter, 
  readLimiter,
  chatMessageLimiter,
  chatUploadLimiter,
  chatConversationLimiter
} from "./middleware/rateLimiter";
import * as notificationHelpers from "./notifications";
import Stripe from 'stripe';
import PDFDocument from 'pdfkit';

// ============================================================================
// STRIPE SINGLETON - Security & Performance Optimization
// ============================================================================
// Reuse single Stripe instance across all routes to prevent redundant client creation
// and reduce secret key exposure risk
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});
import { 
  sendShiftAssignmentEmail, 
  sendInvoiceGeneratedEmail, 
  sendEmployeeOnboardingEmail,
  sendOnboardingInviteEmail,
  sendReportDeliveryEmail,
  sendReviewDeletedEmail,
  sendReviewEditedEmail,
  sendRatingDeletedEmail,
  sendWriteUpDeletedEmail,
  sendPTOApprovedEmail,
  sendPTODeniedEmail,
  sendShiftActionApprovedEmail,
  sendShiftActionDeniedEmail,
  sendTimesheetEditApprovedEmail,
  sendTimesheetEditDeniedEmail
} from "./email";
import { emailService } from "./services/emailService";
import { calculateStateTax, calculateBonusTaxation } from "./services/taxCalculator";
import emailRouter from "./routes/emails";
import internalEmailRouter from './routes/internalEmails';
import publicLeadsRouter from './routes/publicLeads'; // Public lead capture (no auth)
import testimonialsRouter from './routes/testimonials'; // Testimonial collection system
import { calendarRouter } from "./routes/calendarRoutes";
import { smsRouter } from "./routes/smsRoutes";
import { whatsNewRouter } from "./routes/whatsNewRoutes";
import empireRouter from "./routes/empireRoutes"; // Empire Mode (Trinity CSO upgrade)
import { trinityNotificationRouter } from "./routes/trinityNotificationRoutes"; // Trinity Notification Bridge
import { supportCommandRouter } from "./routes/support-command-console";
import { supportChatRouter } from "./routes/support-chat"; // Simplified 1-on-1 HelpAI support chat
import trinityChatRouter from "./routes/trinityChatRoutes"; // Trinity Chat Interface with BUDDY mode
import resilienceRouter from "./routes/resilience-api"; // Fortune 500-grade resilience infrastructure
import { endUserControlRouter } from "./routes/endUserControlRoutes";
import { sessionCheckpointRouter } from "./routes/sessionCheckpointRoutes";
import { assistedOnboardingRouter, acceptHandoffRouter } from "./routes/assisted-onboarding"; // Support-Assisted Onboarding
import { aiBrainConsoleRouter } from "./routes/ai-brain-console";
import aiBrainControlRouter from "./routes/aiBrainControlRoutes";
import subagentRouter from "./routes/subagentRoutes";
import codeEditorRouter from "./routes/code-editor";
import vqaRouter from "./routes/vqaRoutes"; // Visual QA (AI Brain Eyes)
import uacpRouter from "./routes/uacpRoutes"; // Universal Access Control Panel (UACP)
import { integrationRoutes, partnerRoutes } from "./routes/integrationManagementRoutes"; // Workspace Integration & Partner Management
import bugRemediationRouter from "./routes/bugRemediation"; // Bug Report AI Analysis & Auto-Fix
import { onboardingRouter } from "./routes/onboardingRoutes";
import { registerFlexStaffingRoutes } from "./routes/flexStaffingRoutes";
import { registerDocumentLibraryRoutes } from "./routes/documentLibraryRoutes";
import { registerExternalEmailRoutes } from "./routes/externalEmailRoutes";
import { registerLeadCrmRoutes } from "./routes/leadCrmRoutes";
import { onboardingAssistantRouter } from "./routes/onboarding-assistant-routes";
import { timesheetReportRouter } from "./routes/timesheetReportRoutes";
import { timesheetInvoiceRouter } from "./routes/timesheetInvoiceRoutes";
import paystubRouter from "./routes/paystubRoutes";
import { advancedSchedulingRouter } from "./routes/advancedSchedulingRoutes";
import { ownerAnalyticsRouter } from "./routes/ownerAnalytics";
import serviceControlRouter from "./routes/service-control";
import hrisRouter from "./routes/hrisRoutes"; // HRIS Integration Routes
import trinitySelfEditRouter from "./routes/trinitySelfEditRoutes"; // Trinity Self-Edit Governance
import dashboardRoutes from "./routes/dashboardRoutes";
import gamificationEnhancedRoutes from "./routes/gamificationRoutes";
import aiSchedulingRoutes from "./routes/aiSchedulingRoutes";
import infrastructureRoutes from "./routes/infrastructureRoutes"; // Q1 2026 Infrastructure
import sandboxRoutes from "./routes/sandbox-routes"; // Sandbox Simulation Testing
import featureFlagsRoutes from "./routes/featureFlagsRoutes"; // Trinity Runtime Flags
import maintenanceRoutes from "./routes/maintenanceRoutes"; // Maintenance Mode
import resendWebhooksRouter from "./routes/resendWebhooks"; // Resend email webhooks
import quickbooksPhase3Router from "./routes/quickbooksPhase3Routes"; // QuickBooks Phase 3 Intelligence & Compliance
import financialIntelligenceRouter from "./routes/financialIntelligence"; // Financial Intelligence P&L Dashboard
import contractPipelineRouter, { publicPortalRouter as contractPortalRouter } from "./routes/contractPipelineRoutes"; // Contract Lifecycle Pipeline (Premium)
import { performanceMetrics } from "./services/performanceMetrics";
import { sentimentAnalyzer } from "./services/sentimentAnalyzer";
import { initiateEmployeeOnboarding } from "./services/onboardingAutomation";
import { createHealthCheckTicket } from "./services/autoTicketCreation";
import { sendMonitoringAlert } from "./services/externalMonitoring";
import { checkDatabase, checkChatWebSocket, checkStripe, checkGeminiAI, checkQuickBooks, checkGusto, getIntegrationHealthSummary } from "./services/healthCheck";
import { getTimeEntriesByEmployee, getTimeEntriesByWorkspace, getPendingTimeEntries, approveTimeEntry, rejectTimeEntry, calculatePayrollHours, createTimeEntry } from "./services/timeEntryService";
import { exportEmployees, exportPayroll, exportAuditLogs, exportTimeEntries, exportAllData, anonymizeEmployeeData } from "./services/exportService";
import { creditInvoice, discountInvoice, refundInvoice, correctInvoiceLineItem, getInvoiceAdjustmentHistory, bulkCreditInvoices } from "./services/invoiceAdjustmentService";
import { approveShift, rejectShift, getPendingShifts, getShiftWithDetails, bulkApproveShifts, getApprovalStats } from "./services/shiftApprovalService";
import { employerRatingsService } from "./services/employerRatingsService";
import { compositeScoresService } from "./services/compositeScoresService";
import { breaksService } from "./services/breaksService";
import { unreadMessageService } from "./services/unreadMessageService";
import { shiftRemindersService } from "./services/shiftRemindersService";
import { aiSchedulingTriggerService } from "./services/aiSchedulingTriggerService";
import { escalationMatrixService } from "./services/escalationMatrixService";
import { workflowStatusService } from "./services/workflowStatusService";
import { employeePatternService } from "./services/employeePatternService";
import { jobRetrievalService } from "./services/jobRetrievalService";
import { helposSettingsService } from "./services/helposSettingsService";
import { monitoringService } from "./services/monitoringService";
import { processingMetricsService } from "./services/processingMetricsService";
import { trainingRateService } from "./services/trainingRateService";
import { analyticsDataService } from "./services/analyticsDataService";
import { roomAnalyticsService } from "./services/roomAnalyticsService";
import { documentExtractionService } from "./services/documentExtraction";
import { notificationEngine } from "./services/universalNotificationEngine";
import { issueDetectionService } from "./services/issueDetectionService";
import { aiNotificationService } from "./services/aiNotificationService";
import { notificationStateManager } from "./services/notificationStateManager";
import aiBrainConfig from "@shared/config/aiBrainGuardrails";
import { approveDispute, rejectDispute, getPendingDisputes, getDisputesAssignedToUser } from "./services/timeEntryDisputeService";
import { addDeduction, addGarnishment, applyDeductionsAndGarnishments, calculateTotalDeductions, calculateTotalGarnishments } from "./services/payrollDeductionService";
import { calculatePtoAccrual, getAllPtoBalances, runWeeklyPtoAccrual, deductPtoHours } from './services/ptoAccrual';
import { getReviewReminderSummary, getOverdueReviews, getUpcomingReviews } from './services/performanceReviewReminders';
import { getEmployeesDueForSurveys, getSurveyDistributionSummary, getEmployeePendingSurveys, calculateSurveyResponseRate } from './services/pulseSurveyAutomation';
import { queueManager } from './services/helpOsQueue';
import { HelpAIService } from './helpos-ai';
import { helposService } from './services/helposService';
import {
  generateMfaSecret,
  verifyMfaToken,
  enableMfa,
  disableMfa,
  regenerateBackupCodes,
  checkMfaStatus,
} from './services/auth/mfa';
import { scheduleSmartAI, isScheduleSmartAvailable } from './services/scheduleSmartAI';
import { seedAnchor } from './services/utils/scheduling';
import { configRegistry } from './services/configRegistry';
import { requireOwner, requireManager, requireManagerOrPlatformStaff, requireHRManager, requireSupervisor, requireEmployee, validateManagerAssignment, requirePlatformStaff, requirePlatformAdmin, requireWorkspaceRole, getUserPlatformRole, resolveWorkspaceForUser, attachWorkspaceId, attachWorkspaceIdOptional, hasPlatformWideAccess, type AuthenticatedRequest, checkOrgFrozen, attachSupportSessionContext, logSupportAction, type SupportSessionRequest } from "./rbac";
import { requireStarter, requireProfessional, requireEnterprise } from "./tierGuards";
import { clientsQuerySchema } from "../shared/validation/pagination";
import bcrypt from 'bcryptjs';
import { creditManager } from './services/billing/creditManager';
import { subscriptionManager } from './services/billing/subscriptionManager';
import { 
  insertWorkspaceSchema,
  insertEmployeeSchema,
  insertClientSchema,
  insertShiftSchema,
  insertTimeEntrySchema,
  insertInvoiceSchema,
  insertManagerAssignmentSchema,
  insertOnboardingInviteSchema,
  insertOnboardingApplicationSchema,
  insertDocumentSignatureSchema,
  insertEmployeeCertificationSchema,
  insertReportTemplateSchema,
  insertReportSubmissionSchema,
  insertReportAttachmentSchema,
  insertCustomerReportAccessSchema,
  insertSupportTicketSchema,
  insertChatConversationSchema,
  insertChatMessageSchema,
  insertChatMacroSchema,
  orgInvitations,
  salesProposals,
  salesActivities,
  insertOrgInvitationSchema,
  insertSalesProposalSchema,
  insertSalesActivitySchema,
  clients,
  employees,
  supportRegistry,
  externalIdentifiers,
  reportTemplates,
  reportAttachments,
  shifts,
  smartScheduleUsage,
  users,
  platformRoles,
  workspaces,
  supportTickets,
  escalationTickets,
  motdMessages,
  motdAcknowledgment,
  termsAcknowledgments,
  chatAgreementAcceptances,
  chatMessages,
  chatMacros,
  typingIndicators,
  turnoverRiskScores,
  costVariancePredictions,
  customRules,
  ruleExecutionLogs,
  auditTrail,
  timeEntryDiscrepancies,
  insertCustomRuleSchema,
  timeEntries as timeEntriesTable,
  // Billing Platform Tables
  clientRates,
  insertClientRateSchema,
  paymentRecords,
  invoiceReminders,
  clientPortalAccess,
  userOnboarding,
  employeeTaxForms,
  employeeBankAccounts,
  offCyclePayrollRuns,
  payrollRuns,
  payrollEntries,
  workspaceCredits,
  // EngagementOS™ Tables
  pulseSurveyTemplates,
  pulseSurveyResponses,
  employerRatings,
  anonymousSuggestions,
  employeeRecognition,
  employeeHealthScores,
  employerBenchmarkScores,
  insertPulseSurveyTemplateSchema,
  insertPulseSurveyResponseSchema,
  insertEmployerRatingSchema,
  insertAnonymousSuggestionSchema,
  insertEmployeeRecognitionSchema,
  insertEmployeeHealthScoreSchema,
  insertEmployerBenchmarkScoreSchema,
  // AI Training™ Tables
  trainingCourses,
  trainingEnrollments,
  trainingCertifications,
  insertTrainingCourseSchema,
  insertTrainingEnrollmentSchema,
  insertTrainingCertificationSchema,
  // AI Budgeting™ Tables
  budgets,
  budgetLineItems,
  budgetVariances,
  insertBudgetSchema,
  insertBudgetLineItemSchema,
  insertBudgetVarianceSchema,
  // AI Integrations™ Tables
  integrationMarketplace,
  integrationConnections,
  integrationApiKeys,
  webhookSubscriptions,
  webhookDeliveries,
  // Promotional Banners
  promotionalBanners,
  // Intelligent Automation
  knowledgeArticles,
  knowledgeQueries,
  capacityAlerts,
  autoReports,
  // Sales MVP: DealOS™ + BidOS™
  deals,
  rfps,
  leads,
  proposals,
  contacts,
  emailSequences,
  sequenceSends,
  dealTasks,
  insertDealSchema,
  insertRfpSchema,
  insertLeadSchema,
  // AI Records™ - Natural Language Search
  searchQueries,
  insertSearchQuerySchema,
  // AI Analytics™ - AI Analytics & Autonomous Insights
  aiInsights,
  metricsSnapshots,
  insertAiInsightSchema,
  insertMetricsSnapshotSchema,
  // ExpenseOS™ - Expense Management
  expenses,
  expenseCategories,
  expenseReceipts,
  insertExpenseSchema,
  insertExpenseCategorySchema,
  insertExpenseReceiptSchema,
  // HelpAI - Support Queue Management
  helpOsQueue,
  supportRooms,
  // Feature Updates System
  featureUpdates,
  featureUpdateReceipts,
  editChatMessageSchema,
  updateNotificationPreferencesSchema,
  trinityCredits,
  trinityCreditTransactions,
  workspaceInvites,
  partnerConnections,
} from "@shared/schema";
import crypto from "crypto";
import { sql, eq, and, or, isNull, isNotNull, lte, gte, desc, asc, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { format } from "date-fns";
import { setupWebSocket } from "./websocket";
import { 
  detectPayPeriod, 
  calculatePayroll, 
  createAutomatedPayrollRun 
} from "./services/payrollAutomation";
import { GeoComplianceService } from "./services/geoCompliance";
import { 
  calculateEmployeeHealthScore, 
  calculateEmployerBenchmark, 
  batchCalculateHealthScores 
} from "./services/engagementCalculations";
import { FEATURES, getFeatureStatus } from "./featureFlags";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";

// ============================================================================
// EMAIL NORMALIZATION HELPER
// ============================================================================
/**
 * Normalize email for consistent matching (trim + lowercase + validation)
 * Handles edge cases: null, empty, invalid format, whitespace
 * 
 * @param email - Email address to normalize
 * @returns Normalized email or null if invalid
 */
function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  
  const trimmed = email.trim();
  if (trimmed.length === 0) return null;
  
  // Basic email validation (has @ and .)
  if (!trimmed.includes('@') || !trimmed.includes('.')) return null;
  
  return trimmed.toLowerCase();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const server = createServer(app);
  
  // ============================================================================
  // STARTUP: SEED ROOT USER AND PLATFORM WORKSPACE
  // ============================================================================
  // CRITICAL: These resources MUST exist for anonymous HelpAI to function
  // Let errors bubble up to fail fast rather than continue without platform workspace
  const { seedRootUser } = await import("./seed-root-user");
  await seedRootUser();
  
  const { seedPlatformWorkspace } = await import("./seed-platform-workspace");
  await seedPlatformWorkspace();
  
  // ============================================================================
  // HEALTH CHECK ENDPOINT (for Render and monitoring)
  // ============================================================================
  app.get('/health', async (_req, res) => {
    const health: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      features: getFeatureStatus(),
      dependencies: {},
    };

    // Test database connection
    try {
      // Combined notifications endpoint
      await db.select().from(users).limit(1);
      health.dependencies.database = 'ok';
    } catch (error) {
      console.error('Health check database error:', error);
      health.status = 'degraded';
      health.dependencies.database = 'error';
      const dbFeature = health.features.find((f: any) => f.feature === 'DATABASE');
      if (dbFeature) {
        dbFeature.status = 'error';
        dbFeature.enabled = false;
      }
      return res.status(503).json(health);
    }

    // Test session store
    try {
      await pool.query('SELECT 1 FROM sessions LIMIT 1');
      health.dependencies.sessions = 'ok';
    } catch (error) {
      console.error('Health check sessions error:', error);
      health.dependencies.sessions = 'degraded';
    }

    // Test Stripe connection if enabled
    if (FEATURES.STRIPE_PAYMENTS) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        await Promise.race([
          stripe.prices.list({ limit: 1 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Stripe timeout')), 2000))
        ]);
        health.dependencies.stripe = 'ok';
      } catch (error) {
        console.error('Health check Stripe error:', error);
        health.status = 'degraded';
        health.dependencies.stripe = 'error';
        const stripeFeature = health.features.find((f: any) => f.feature === 'STRIPE_PAYMENTS');
        if (stripeFeature) {
          stripeFeature.status = 'error';
        }
      }
    }

    res.json(health);
  });
  
  // ✅ SECURITY: WebSocket authentication implemented for Live HelpDesk
  // - Dual authentication paths: Ticket + email OR Work ID + email
  // - Session-based validation for all WebSocket connections
  // - Platform staff role verification for administrative controls
  const { broadcastShiftUpdate, broadcastNotification, broadcastPlatformUpdate } = setupWebSocket(server);
  
  
  // Register notification broadcast function with state manager for real-time count updates
  notificationStateManager.setBroadcastFunction(broadcastNotification);
  // Wire platform event bus to WebSocket for real-time updates
  const { platformEventBus } = await import("./services/platformEventBus");
  platformEventBus.setWebSocketHandler((event) => {
    broadcastPlatformUpdate({
      type: "platform_update",
      category: event.category,
      title: event.title,
      description: event.description,
      version: event.version,
      priority: event.priority,
      learnMoreUrl: event.learnMoreUrl,
      metadata: event.metadata,
    });
  });
  console.log("[Server] Platform Event Bus connected to WebSocket");
  
  // Setup custom auth (portable, session-based)
  setupCustomAuth(app);
  
  // Also setup Replit auth (for backward compatibility)
  await setupAuth(app);
  
  // Trust proxy for accurate IP detection behind load balancers
  app.set('trust proxy', 1);
  
  // Audit logging middleware (captures request context for all authenticated requests)
  app.use(auditContextMiddleware);
  registerHealthRoutes(app, requireAuth);
  app.use(resendWebhooksRouter); // Resend email event webhooks
  registerSearchRoutes(app, requireAuth); // AI-Powered Search
  registerIntegrationRoutes(app); // QuickBooks exception and automation health routes

  registerWorkboardRoutes(app, requireAuth); // AI Brain Workboard Job Queue
  app.use("/api/approvals", requireAuth, approvalRoutes); // AI Approval Requests
  // ============================================================================
  // NOTIFICATIONS & FEATURE UPDATES
  // ============================================================================


  // Combined notifications endpoint - returns platform updates, notifications, and maintenance alerts
  app.get('/api/notifications/combined', async (req, res) => {
    // Prevent caching to ensure fresh data after mutations
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
      const authReq = req as AuthenticatedRequest;
      // Support BOTH Replit Auth (req.user) AND custom session auth (req.session.userId)
      const userId = authReq.user?.id || authReq.session?.userId;
      
      
      // For unauthenticated users, return platform updates only
      if (!userId) {
        const { getLatestUpdates } = await import('./services/whatsNewService');
        const platformUpdates = await getLatestUpdates(10, undefined, 'staff');
        const mappedUpdates = platformUpdates.map(u => ({
          id: u.id,
          title: u.title,
          description: u.description,
          category: u.category,
          version: u.version,
          badge: u.badge,
          isNew: u.isNew,
          isViewed: false,
          createdAt: u.date
        }));
        return res.json({
          platformUpdates: mappedUpdates,
          maintenanceAlerts: [],
          notifications: [],
          unreadPlatformUpdates: mappedUpdates.length,
          unreadNotifications: 0,
          unreadAlerts: 0,
          totalUnread: mappedUpdates.length,
        });
      }
      // Get user's workspace
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      let workspaceId = workspace?.id || member?.workspaceId;

      // Get user's platform role to check for platform-wide access
      const platformRole = await getUserPlatformRole(userId);
      
      // Platform-wide users (support agents, bots, etc.) get access to system notifications
      // even without a workspace - use the platform workspace
      if (!workspaceId && hasPlatformWideAccess(platformRole)) {
        workspaceId = 'coaileague-platform-workspace';
      }

       
      if (!workspaceId) {
        return res.json({
          platformUpdates: [],
          maintenanceAlerts: [],
          notifications: [],
          unreadPlatformUpdates: 0,
          unreadNotifications: 0,
          unreadAlerts: 0,
          totalUnread: 0,
        });
      }
      
      
      // Get platform updates with user read state - fetch more for display (50 items)
      
      const platformUpdatesDataRaw = await storage.getPlatformUpdatesWithReadState(userId, workspaceId, 50);
      
      // CRITICAL FIX: Filter out viewed platform updates for "Clear All" functionality
      // Only show unread platform updates in the notification center
      // Use query param ?includeViewed=true to include all (for admin/history views)
      const includeViewed = req.query.includeViewed === 'true';
      const platformUpdatesData = includeViewed 
        ? platformUpdatesDataRaw 
        : platformUpdatesDataRaw.filter(u => !u.isViewed);
      
      
      // Get unread count directly from storage (single source of truth)
      const trueUnreadPlatformUpdates = await storage.getUnreadPlatformUpdatesCount(userId, workspaceId);
      // Get notifications - fetch more for display (50 items)
      const notifications = await storage.getAllNotificationsForUser(userId, workspaceId, 50);
      
      // Get TRUE unread notification count
      const trueUnreadNotifications = await storage.getTotalUnreadCountForUser(userId, workspaceId);
      
      // Get active maintenance alerts
      const maintenanceAlerts = await aiNotificationService.getActiveMaintenanceAlerts(workspaceId, userId);
      const unreadAlerts = maintenanceAlerts.filter((a: any) => !a.isAcknowledged).length;
      
      // Get gap intelligence findings for platform support roles
      let gapFindings: any[] = [];
      if (hasPlatformWideAccess(platformRole)) {
        try {
          const { gapIntelligenceService } = await import('./services/ai-brain/gapIntelligenceService');
          gapFindings = await gapIntelligenceService.getGapFindingsForUNS(15);
        } catch (err) {
          console.error('[Notifications] Failed to fetch gap findings:', err);
        }
      }
      
      res.json({
        platformUpdates: platformUpdatesData,
        maintenanceAlerts,
        notifications,
        gapFindings,
        unreadPlatformUpdates: trueUnreadPlatformUpdates,
        unreadNotifications: trueUnreadNotifications,
        unreadAlerts,
        unreadGapFindings: 0,
        totalUnread: trueUnreadPlatformUpdates + trueUnreadNotifications + unreadAlerts,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });
  app.post('/api/notifications/mark-all-read', async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get user's workspace
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      if (!workspaceId) {
        return res.json({ 
          success: true, 
          markedRead: { platformUpdates: 0, notifications: 0, alerts: 0 } 
        });
      }
      
      // Mark all platform updates as viewed
      const platformUpdatesMarked = await storage.markAllPlatformUpdatesAsViewed(userId, workspaceId);
      
      // Mark all notifications as read
      const acknowledged = await storage.clearAllNotifications(userId, workspaceId);
      // Acknowledge all maintenance alerts
      const alerts = await aiNotificationService.getActiveMaintenanceAlerts(workspaceId, userId);
      let alertsAcknowledged = 0;
      for (const alert of alerts) {
        if (!(alert as any).isAcknowledged) {
          await aiNotificationService.acknowledgeMaintenanceAlert(alert.id, userId);
          alertsAcknowledged++;
        }
      }
      
      
      // WebSocket broadcast for real-time client updates
      // Get updated counts after clearing all notifications
      const counts = await storage.getUnreadAndUnclearedCount(userId, workspaceId);
      
      // Get accurate platform updates count
      const platformUpdatesCount = await storage.getUnreadPlatformUpdatesCount(userId, workspaceId);
      // WebSocket broadcast for real-time sync - use 'all_notifications_cleared' which frontend handles
      broadcastNotification(workspaceId, userId, 'all_notifications_cleared', { 
        markedRead: { platformUpdates: platformUpdatesMarked, notifications: acknowledged, alerts: alertsAcknowledged },
        cleared: { platformUpdates: platformUpdatesMarked, notifications: acknowledged, alerts: alertsAcknowledged },
      }, 0);
      broadcastNotification(workspaceId, userId, 'notification_count_updated', { 
        type: 'notification_count_updated', 
        counts: { notifications: counts.unread, platformUpdates: 0, alerts: 0, total: counts.unread, lastUpdated: new Date().toISOString() }, 
        source: 'mark_all_read' 
      }, 0);
      broadcastNotification(workspaceId, userId, 'whats_new_cleared', { count: 0 }, 0);

      console.log("[Acknowledge All] User " + userId + " acknowledged " + acknowledged + " notifications, " + platformUpdatesMarked + " platform updates, and " + alertsAcknowledged + " maintenance alerts");
      
      res.json({ 
        success: true, 
        acknowledged,
        platformUpdatesMarked,
        alertsAcknowledged,
        counts: { unread: counts.unread, uncleared: counts.uncleared }
      });
    } catch (error) {
      console.error('Error acknowledging all notifications:', error);
      res.status(500).json({ message: 'Failed to acknowledge notifications' });
    }
  });

  // Batch mark-read endpoint for mobile notification hub
  app.post('/api/notifications/mark-read-batch', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { ids } = req.body as { ids: string[] };
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Missing or invalid notification IDs' });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      if (!workspaceId) {
        return res.json({ success: true, markedRead: 0 });
      }
      
      let markedCount = 0;
      for (const id of ids) {
        try {
          await storage.markNotificationRead(id);
          markedCount++;
        } catch (err) {
          console.error(`[Notifications] Failed to mark notification ${id} as read:`, err);
        }
      }
      
      broadcastNotification(workspaceId, userId, 'notification_count_updated', {
        type: 'batch_mark_read',
        count: markedCount,
      }, 0);
      
      res.json({ success: true, markedRead: markedCount });
    } catch (error) {
      console.error('[Notifications] Batch mark-read error:', error);
      res.status(500).json({ message: 'Failed to mark notifications as read' });
    }
  });

  // Alias route for acknowledge-all (frontend uses this endpoint)
  app.post('/api/notifications/acknowledge-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get user's workspace
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      if (!workspaceId) {
        return res.json({ 
          success: true, 
          acknowledged: 0,
          platformUpdatesMarked: 0,
          alertsAcknowledged: 0
        });
      }
      
      // Mark all platform updates as viewed
      const platformUpdatesMarked = await storage.markAllPlatformUpdatesAsViewed(userId, workspaceId);
      
      // Clear all notifications
      const acknowledged = await storage.clearAllNotifications(userId, workspaceId);
      
      // Acknowledge all maintenance alerts
      const alerts = await aiNotificationService.getActiveMaintenanceAlerts(workspaceId, userId);
      let alertsAcknowledged = 0;
      for (const alert of alerts) {
        if (!(alert as any).isAcknowledged) {
          await aiNotificationService.acknowledgeMaintenanceAlert(alert.id, userId);
          alertsAcknowledged++;
        }
      }
      
      // Get updated counts after clearing
      const counts = await storage.getUnreadAndUnclearedCount(userId, workspaceId);
      
      // WebSocket broadcast for real-time sync
      broadcastNotification(workspaceId, userId, 'all_notifications_cleared', { 
        cleared: { platformUpdates: platformUpdatesMarked, notifications: acknowledged, alerts: alertsAcknowledged },
      }, 0);
      broadcastNotification(workspaceId, userId, 'notification_count_updated', { 
        type: 'notification_count_updated', 
        counts: { notifications: 0, platformUpdates: 0, alerts: 0, total: 0, lastUpdated: new Date().toISOString() }, 
        source: 'acknowledge_all' 
      }, 0);
      broadcastNotification(workspaceId, userId, 'whats_new_cleared', { count: 0 }, 0);

      console.log("[Acknowledge All] User " + userId + " cleared " + acknowledged + " notifications, " + platformUpdatesMarked + " platform updates, and " + alertsAcknowledged + " alerts");
      
      res.json({ 
        success: true, 
        acknowledged,
        platformUpdatesMarked,
        alertsAcknowledged,
        counts: { unread: counts.unread, uncleared: counts.uncleared }
      });
    } catch (error) {
      console.error('Error in acknowledge-all:', error);
      res.status(500).json({ message: 'Failed to acknowledge notifications' });
    }
  });


  // Alias for clear-all (frontend uses this endpoint)
  app.post("/api/notifications/clear-all", requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log("[Trinity Diagnostic] clear-all endpoint hit - Session:", req.session?.userId ? "authenticated" : "none", "User:", req.user?.id || "none");
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId || authReq.user?.defaultWorkspaceId;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Mark all platform updates as viewed
      const platformUpdatesMarked = await storage.markAllPlatformUpdatesAsViewed(userId); // Don't filter by workspace - clear ALL

      // Acknowledge all notifications
      const acknowledged = await storage.clearAllNotifications(userId); // Don't filter by workspace - CLEAR ALL user notifications (sets clearedAt)

      // Also acknowledge maintenance alerts
      const { aiNotificationService } = await import("./services/aiNotificationService");
      const alertsAcknowledged = await aiNotificationService.acknowledgeAllMaintenanceAlerts(userId); // Don't filter by workspace - clear ALL


      // WebSocket broadcast for real-time sync - critical for frontend state update
      if (workspaceId) {
        broadcastNotification(workspaceId, userId, 'all_notifications_cleared', { 
          cleared: { platformUpdates: platformUpdatesMarked, notifications: acknowledged, alerts: alertsAcknowledged },
        }, 0);
        broadcastNotification(workspaceId, userId, 'notification_count_updated', { 
          type: 'notification_count_updated', 
          counts: { notifications: 0, platformUpdates: 0, alerts: 0, total: 0, lastUpdated: new Date().toISOString() }, 
          source: 'clear_all' 
        }, 0);
        broadcastNotification(workspaceId, userId, 'whats_new_cleared', { count: 0 }, 0);
      }

      console.log("[Clear All] User " + userId + " cleared " + platformUpdatesMarked + " platform updates, " + acknowledged + " notifications, and " + alertsAcknowledged + " alerts");
      res.json({
        success: true,
        cleared: { platformUpdates: platformUpdatesMarked, notifications: acknowledged, alerts: alertsAcknowledged },
        counts: { notifications: 0, platformUpdates: 0, alerts: 0, total: 0 },
      });
    } catch (error) {
      console.error("Error in clear-all:", error);
      res.status(500).json({ message: "Failed to clear notifications" });
    }
  });


  // Onboarding digest endpoint - Trinity welcome + last 3 What's New + system updates for new users
  app.get("/api/notifications/onboarding-digest", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { getOnboardingDigest, autoCleanupSystemNotifications } = await import('./services/notificationService');
      
      // Get the onboarding digest with Trinity welcome
      const digest = await getOnboardingDigest(userId);
      
      // Auto-cleanup old notifications (limit to 3 visible)
      await autoCleanupSystemNotifications(userId, 3);
      
      res.json({
        success: true,
        ...digest,
      });
    } catch (error) {
      console.error("Error fetching onboarding digest:", error);
      res.status(500).json({ message: "Failed to fetch onboarding digest" });
    }
  });

  // Send Trinity welcome notification to a user
  app.post("/api/notifications/trinity-welcome", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspaceId = req.workspaceId || req.user?.defaultWorkspaceId;
      const { userName } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { sendTrinityWelcomeNotification } = await import('./services/notificationService');
      
      const notification = await sendTrinityWelcomeNotification(
        workspaceId || 'coaileague-platform-workspace',
        userId,
        userName
      );

      // Broadcast via WebSocket
      if (workspaceId) {
        broadcastNotification(workspaceId, userId, 'trinity_welcome', notification);
      }

      res.json({
        success: true,
        notification,
      });
    } catch (error) {
      console.error("Error sending Trinity welcome:", error);
      res.status(500).json({ message: "Failed to send Trinity welcome" });
    }
  });
  // Tab-specific clear endpoint - clears notifications for a specific tab only
  app.post("/api/notifications/clear-tab/:tab", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId || authReq.user?.defaultWorkspaceId;
      const { tab } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const validTabs = ['updates', 'notifications', 'maintenance', 'system'];
      if (!validTabs.includes(tab)) {
        return res.status(400).json({ message: "Invalid tab. Must be: updates, notifications, maintenance, or system" });
      }

      let cleared = { platformUpdates: 0, notifications: 0, alerts: 0 };

      if (tab === 'updates') {
        // Mark all platform updates as viewed (What's New tab)
        cleared.platformUpdates = await storage.markAllPlatformUpdatesAsViewed(userId);
      } else if (tab === 'notifications') {
        // Clear user notifications (Alerts tab)
        cleared.notifications = await storage.clearAllNotifications(userId);
      } else if (tab === 'maintenance' || tab === 'system') {
        // Acknowledge all maintenance alerts (System tab)
        const { aiNotificationService } = await import("./services/aiNotificationService");
        cleared.alerts = await aiNotificationService.acknowledgeAllMaintenanceAlerts(userId);
        
        // Also clear system-category platform updates (diagnostics, errors, security, etc.)
        const { getCategoriesForTab } = await import("@shared/config/notificationConfig");
        const systemCategories = getCategoriesForTab('system');
        cleared.platformUpdates = await storage.deletePlatformUpdatesByCategories(userId, systemCategories, workspaceId);
      }

      // WebSocket broadcast for real-time sync
      if (workspaceId) {
        broadcastNotification(workspaceId, userId, 'tab_cleared', { 
          tab,
          cleared,
        }, 0);
      }

      console.log(`[Clear Tab] User ${userId} cleared tab '${tab}': ${JSON.stringify(cleared)}`);
      res.json({
        success: true,
        tab,
        cleared,
      });
    } catch (error) {
      console.error("Error in clear-tab:", error);
      res.status(500).json({ message: "Failed to clear tab notifications" });
    }
  });

  // Notification system diagnostics (AI Brain Trinity orchestrated)
  app.get("/api/notifications/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId || authReq.user?.defaultWorkspaceId;

      const { notificationDiagnostics } = await import("./services/ai-brain/notificationDiagnostics");
      const result = await notificationDiagnostics.handleRequest(userId, workspaceId);

      console.log(`[NotificationDiagnostics] Diagnostic run for user ${userId}:`, result.diagnostic.overallHealth);
      res.json(result);
    } catch (error: any) {
      console.error("Error running notification diagnostics:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to run diagnostics" 
      });
    }
  });

  // Universal Platform Diagnostics API (AI Brain Trinity orchestrated with Gemini 3)
  app.get("/api/platform/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const platformRole = (authReq.user as any)?.platformRole || "admin";
      const domain = req.query.domain as string | undefined;

      // RBAC check - only platform support and above can access
      const allowedRoles = ["platform_support", "platform_admin", "root_admin"];
      if (!allowedRoles.includes(platformRole)) {
        return res.status(403).json({ success: false, message: "Insufficient permissions for platform diagnostics" });
      }

      const { universalDiagnosticOrchestrator } = await import("./services/ai-brain/universalDiagnosticOrchestrator");
      
      if (domain) {
        const issues = await universalDiagnosticOrchestrator.runDomainDiagnostic(domain as any);
        return res.json({ success: true, domain, issues });
      } else {
        const report = await universalDiagnosticOrchestrator.runFullDiagnostic(userId || "system", platformRole);
        return res.json({ success: true, report });
      }
    } catch (error: any) {
      console.error("Error running platform diagnostics:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Hotpatch execution API with RBAC
  app.post("/api/platform/hotpatch", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const platformRole = (authReq.user as any)?.platformRole || "admin";
      const { hotpatch, approvalCode, secondApprovalCode } = req.body;

      if (!hotpatch) {
        return res.status(400).json({ success: false, message: "Hotpatch object required" });
      }

      const { universalDiagnosticOrchestrator } = await import("./services/ai-brain/universalDiagnosticOrchestrator");
      const execution = await universalDiagnosticOrchestrator.executeHotpatch(
        hotpatch,
        userId || "system",
        platformRole,
        approvalCode,
        secondApprovalCode
      );

      res.json({ success: execution.status === "success", execution });
    } catch (error: any) {
      console.error("Error executing hotpatch:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get diagnostic subagents list
  app.get("/api/platform/diagnostics/subagents", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { DOMAIN_SUBAGENTS } = await import("./services/ai-brain/universalDiagnosticOrchestrator");
      const subagents = DOMAIN_SUBAGENTS.map(s => ({
        domain: s.domain,
        name: s.name,
        description: s.description,
        commonPatterns: s.commonPatterns
      }));
      res.json({ success: true, subagents });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Acknowledge a single notification
  app.post("/api/notifications/acknowledge/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const notificationId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!notificationId) {
        return res.status(400).json({ message: 'Notification ID is required' });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      // Acknowledge the notification
      const notification = await storage.acknowledgeNotification(notificationId, userId);
      
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      
      // Get updated counts
      const counts = await storage.getUnreadAndUnclearedCount(userId, workspaceId);
      
      // WebSocket broadcast for real-time sync
      if (workspaceId) {
        broadcastNotification(workspaceId, userId, 'notification_acknowledged', { 
          notificationId,
          counts: { notifications: counts.unread, platformUpdates: platformUpdatesCount, total: totalCount, lastUpdated: new Date().toISOString() },
        unreadCount: totalCount,
          unclearedCount: counts.uncleared
        }, counts.unread);
        broadcastNotification(workspaceId, userId, 'notification_count_updated', { 
          type: 'notification_count_updated', 
          counts: { notifications: counts.unread, platformUpdates: platformUpdatesCount, total: totalCount, lastUpdated: new Date().toISOString() }, 
          source: 'acknowledge_single' 
        }, counts.unread);
      }
      
      console.log("[Acknowledge] User " + userId + " acknowledged notification " + notificationId);
      
      res.json({ 
        success: true, 
        notification,
        counts: { unread: counts.unread, uncleared: counts.uncleared }
      });
    } catch (error) {
      console.error('Error acknowledging notification:', error);
      res.status(500).json({ message: 'Failed to acknowledge notification' });
    }
  });

  // Acknowledge maintenance alert
  app.post('/api/maintenance-alerts/:id/acknowledge', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id: alertId } = req.params;
      
      const success = await aiNotificationService.acknowledgeMaintenanceAlert(alertId, userId);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ message: 'Failed to acknowledge alert' });
      }
    } catch (error) {
      console.error('Error acknowledging maintenance alert:', error);
      res.status(500).json({ message: 'Failed to acknowledge alert' });
    }
  });


  // ============================================================================
  // UNIFIED NOTIFICATION STATE MANAGEMENT ROUTES
  // ============================================================================

  // Get unified unread counts (notifications + platform updates)
  app.get('/api/notifications/unread-counts', async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.json({ 
          notifications: 0, 
          platformUpdates: 0, 
          total: 0,
          lastUpdated: new Date().toISOString()
        });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      
      const counts = await notificationStateManager.getUnreadCounts(userId, workspaceId, workspaceRole);
      
      res.json(counts);
    } catch (error) {
      console.error('Error getting unread counts:', error);
      res.status(500).json({ message: 'Failed to get unread counts' });
    }
  });

  // Mark individual notification as read
  app.post('/api/notifications/:id/mark-read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id: notificationId } = req.params;
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      const result = await notificationStateManager.markNotificationAsRead(notificationId, userId, workspaceId);
      
      if (result.success) {
        res.json({ 
          success: true, 
          counts: result.newCounts 
        });
      } else {
        res.status(500).json({ message: 'Failed to mark notification as read' });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: 'Failed to mark notification as read' });
    }
  });

  // Mark platform update as viewed
  app.post('/api/platform-updates/:id/mark-viewed', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id: updateId } = req.params;
      const { viewSource } = req.body;
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      const result = await notificationStateManager.markPlatformUpdateAsViewed(
        updateId, 
        userId, 
        viewSource || 'feed',
        workspaceId
      );
      
      if (result.success) {
        res.json({ 
          success: true, 
          counts: result.newCounts 
        });
      } else {
        res.status(500).json({ message: 'Failed to mark update as viewed' });
      }
    } catch (error) {
      console.error('Error marking platform update as viewed:', error);
      res.status(500).json({ message: 'Failed to mark update as viewed' });
    }
  });

  // Sync notification counts (force refresh from database)
  app.post('/api/notifications/sync-counts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      const workspaceRole = req.workspaceRole || 'staff';
      
      const counts = await notificationStateManager.syncCountsForUser(userId, workspaceId, workspaceRole);
      
      res.json({ 
        success: true, 
        counts 
      });
    } catch (error) {
      console.error('Error syncing notification counts:', error);
      res.status(500).json({ message: 'Failed to sync counts' });
    }
  });

  // Get user notifications
  app.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get user's workspace
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      if (!workspace) {
        // If user is not an owner, check if they're a member
        const member = await storage.getWorkspaceMemberByUserId(userId);
        if (!member) {
          return res.status(404).json({ message: 'Workspace not found' });
        }
        // Get notifications for member
        const notifications = await storage.getNotificationsByUser(userId, member.workspaceId);
        return res.json(notifications);
      }
      
      // Get notifications for workspace owner
      const notifications = await storage.getNotificationsByUser(userId, workspace.id);
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });

  // Toggle notification read status (mark as read/unread)
  app.patch('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      
      // Toggle notification read status
      const notification = await storage.toggleNotificationReadStatus(id, userId);
      
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      
      // Broadcast updated unread count
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      if (workspace) {
        const unreadCount = await storage.getUnreadNotificationCount(userId, workspace.id);
        broadcastNotification(workspace.id, userId, 'notification_count_updated', undefined, unreadCount);
      } else {
        const member = await storage.getWorkspaceMemberByUserId(userId);
        if (member) {
          const unreadCount = await storage.getUnreadNotificationCount(userId, member.workspaceId);
          broadcastNotification(member.workspaceId, userId, 'notification_count_updated', undefined, unreadCount);
        }
      }
      res.json({ success: true, notification });
    } catch (error) {
      console.error('Error toggling notification read status:', error);
      res.status(500).json({ message: 'Failed to toggle notification read status' });
    }
  });

  // Delete notification
  app.delete('/api/notifications/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      
      // Try to delete from notifications table first
      let deleted = await storage.deleteNotification(id, userId);
      
      // If not found in notifications, try platformUpdates table
      if (!deleted) {
        deleted = await storage.deletePlatformUpdate(id);
      }
      
      if (!deleted) {
        return res.status(404).json({ message: 'Notification not found or unauthorized' });
      }
      
      // Broadcast updated unread count
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      if (workspace) {
        const unreadCount = await storage.getUnreadNotificationCount(userId, workspace.id);
        broadcastNotification(workspace.id, userId, 'notification_count_updated', undefined, unreadCount);
      } else {
        const member = await storage.getWorkspaceMemberByUserId(userId);
        if (member) {
          const unreadCount = await storage.getUnreadNotificationCount(userId, member.workspaceId);
          broadcastNotification(member.workspaceId, userId, 'notification_count_updated', undefined, unreadCount);
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ message: 'Failed to delete notification' });
    }
  });

  // ============================================================================

  // Notification action endpoint - handle workflow approvals, shift invites, etc.
  app.post('/api/notifications/:id/action', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { id } = req.params;
      const { action, data } = req.body;
      
      if (!action) {
        return res.status(400).json({ message: 'Action is required' });
      }
      
      let actionResult: any = { success: true };
      
      switch (action) {
        case 'approve':
        case 'accept_shift':
        case 'accept_shift_invite':
        case 'accept_swap':
        case 'accept':
          // Mark the notification as read and acknowledged
          await storage.markNotificationAsRead(id, userId);
          await storage.acknowledgeNotification(id, userId);
          actionResult = { success: true, message: 'Approved successfully' };
          break;
          
        case 'deny':
        case 'decline':
        case 'decline_shift':
        case 'decline_swap':
        case 'reject':
          // Mark as read and clear
          await storage.markNotificationAsRead(id, userId);
          await storage.clearNotification(id, userId);
          actionResult = { success: true, message: 'Request denied' };
          break;
          
        case 'dismiss':
        case 'acknowledge':
          // Just mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true, message: 'Notification dismissed' };
          break;
          
        case 'run_hotpatch':
        case 'trinity_fix':
        case 'apply_fix':
          await storage.markNotificationAsRead(id, userId);
          await storage.acknowledgeNotification(id, userId);
          actionResult = { success: true, message: 'Fix applied' };
          break;

        case 'view_details':
          // Mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true };
          break;
          
        default:
          // Generic action - just mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true, message: `Action '${action}' processed` };
      }
      
      // Broadcast updated count
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = !workspace ? await storage.getWorkspaceMemberByUserId(userId) : null;
      const workspaceId = workspace?.id || member?.workspaceId;
      if (workspaceId) {
        const unreadCount = await storage.getUnreadNotificationCount(userId, workspaceId);
        broadcastNotification(workspaceId, userId, 'notification_count_updated', undefined, unreadCount);
      }
      
      res.json(actionResult);
    } catch (error) {
      console.error('Error processing notification action:', error);
      res.status(500).json({ message: 'Failed to process action' });
    }
  });
  // CHAT MESSAGE MANAGEMENT ENDPOINTS
  // ============================================================================

  // Edit chat message
  app.patch('/api/chat/message/:id/edit', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      const { conversationId, message } = req.body;

      // Validate request body
      const validation = editChatMessageSchema.safeParse({ message });
      if (!validation.success) {
        return res.status(400).json({ message: 'Invalid message content', errors: validation.error.errors });
      }

      // Get the message to verify ownership
      const [chatMessage] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, id))
        .limit(1);

      if (!chatMessage) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Verify user is the sender
      if (chatMessage.senderId !== userId) {
        return res.status(403).json({ message: 'Not authorized to edit this message' });
      }

      // Verify conversation ID matches
      if (chatMessage.conversationId !== conversationId) {
        return res.status(400).json({ message: 'Invalid conversation ID' });
      }

      // Update the message
      const updatedMessage = await storage.updateChatMessage(id, conversationId, { message: validation.data.message });

      if (!updatedMessage) {
        return res.status(404).json({ message: 'Failed to update message' });
      }

      res.json(updatedMessage);
    } catch (error) {
      console.error('Error editing chat message:', error);
      res.status(500).json({ message: 'Failed to edit message' });
    }
  });

  // Delete chat message
  app.delete('/api/chat/message/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      const { conversationId } = req.body;

      if (!conversationId) {
        return res.status(400).json({ message: 'Conversation ID is required' });
      }

      // Get the message to verify ownership
      const [chatMessage] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, id))
        .limit(1);

      if (!chatMessage) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Verify user is the sender
      if (chatMessage.senderId !== userId) {
        return res.status(403).json({ message: 'Not authorized to delete this message' });
      }

      // Verify conversation ID matches
      if (chatMessage.conversationId !== conversationId) {
        return res.status(400).json({ message: 'Invalid conversation ID' });
      }

      // Delete the message
      const deleted = await storage.deleteChatMessage(id, conversationId);

      if (!deleted) {
        return res.status(404).json({ message: 'Failed to delete message' });
      }
      res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
      console.error('Error deleting chat message:', error);
      res.status(500).json({ message: 'Failed to delete message' });
    }
  });

  // ============================================================================
  // NOTIFICATION PREFERENCES ENDPOINTS
  // ============================================================================

  // Get notification preferences
  app.get('/api/notifications/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      const preferences = await storage.getNotificationPreferences(userId, workspaceId);

      res.json(preferences || { userId, workspaceId, digestFrequency: 'realtime' });
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      res.status(500).json({ message: 'Failed to fetch notification preferences' });
    }
  });

  // Update notification preferences
  app.patch('/api/notifications/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      // Validate request body
      const validation = updateNotificationPreferencesSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: 'Invalid preference data', errors: validation.error.errors });
      }

      // Validate quiet hours logic
      if (validation.data.quietHoursStart !== undefined && validation.data.quietHoursEnd !== undefined) {
        if (validation.data.quietHoursStart !== null && validation.data.quietHoursEnd !== null && 
            validation.data.quietHoursStart >= validation.data.quietHoursEnd) {
          return res.status(400).json({ message: 'Quiet hours end must be after start' });
        }
      }

      // Update preferences
      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, validation.data);

      res.json(preferences);
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      res.status(500).json({ message: 'Failed to update notification preferences' });
    }
  });

  // Subscribe to notification type
  app.post('/api/notifications/subscribe', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;
      const {  notificationType  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!notificationType || typeof notificationType !== 'string') {
        return res.status(400).json({ message: 'Notification type is required' });
      }

      // Get current preferences
      const currentPrefs = await storage.getNotificationPreferences(userId, workspaceId);
      const enabledTypes = currentPrefs?.enabledTypes || [];

      // Add notification type if not already present
      if (!enabledTypes.includes(notificationType)) {
        enabledTypes.push(notificationType);
      }

      // Update preferences
      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, {
        enabledTypes,
      });
      res.json({ success: true, preferences });
    } catch (error) {
      console.error('Error subscribing to notification type:', error);
      res.status(500).json({ message: 'Failed to subscribe to notification type' });
    }
  });

  // Unsubscribe from notification type
  app.post('/api/notifications/unsubscribe', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;
      const {  notificationType  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!notificationType || typeof notificationType !== 'string') {
        return res.status(400).json({ message: 'Notification type is required' });
      }

      // Get current preferences
      const currentPrefs = await storage.getNotificationPreferences(userId, workspaceId);
      const enabledTypes = currentPrefs?.enabledTypes || [];

      // Remove notification type
      const updatedTypes = enabledTypes.filter((type: string) => type !== notificationType);

      // Update preferences
      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, {
        enabledTypes: updatedTypes,
      });
      res.json({ success: true, preferences });
    } catch (error) {
      console.error('Error unsubscribing from notification type:', error);
      res.status(500).json({ message: 'Failed to unsubscribe from notification type' });
    }
  });

  // ============================================================================

  // ============================================================================
  // SMS & SHIFT REMINDER CONFIGURATION - Phase 2D
  // ============================================================================

  // Get SMS configuration status
  app.get('/api/notifications/sms-status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { isSMSConfigured } = await import('./services/smsService');
      
      res.json({
        configured: isSMSConfigured(),
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ? '***configured***' : null,
        twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER ? process.env.TWILIO_PHONE_NUMBER : null,
      });
    } catch (error) {
      console.error('Error checking SMS status:', error);
      res.status(500).json({ message: 'Failed to check SMS status' });
    }
  });

  // Get shift reminder timing options
  app.get('/api/notifications/reminder-options', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getReminderTimingOptions } = await import('./services/shiftRemindersService');
      
      res.json({
        timingOptions: getReminderTimingOptions(),
        channels: [
          { value: 'push', label: 'In-App Notifications' },
          { value: 'email', label: 'Email' },
          { value: 'sms', label: 'SMS Text Message' },
        ],
      });
    } catch (error) {
      console.error('Error getting reminder options:', error);
      res.status(500).json({ message: 'Failed to get reminder options' });
    }
  });

  // Send test SMS to user
  app.post('/api/notifications/test-sms', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;
      const {  phoneNumber  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!phoneNumber || typeof phoneNumber !== 'string') {
        return res.status(400).json({ message: 'Phone number is required' });
      }

      const { sendSMS, isSMSConfigured } = await import('./services/smsService');
      
      if (!isSMSConfigured()) {
        return res.status(400).json({ message: 'SMS is not configured. Please add Twilio credentials.' });
      }

      const result = await sendSMS({
        to: phoneNumber,
        body: 'CoAIleague: This is a test message to verify your SMS settings are working correctly.',
        type: 'test',
        userId,
        workspaceId,
      });

      if (result.success) {
        res.json({ success: true, messageId: result.messageId, message: 'Test SMS sent successfully' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error sending test SMS:', error);
      res.status(500).json({ message: 'Failed to send test SMS' });
    }
  });

  // Verify SMS phone number
  app.post('/api/notifications/verify-phone', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;
      const {  phoneNumber  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!phoneNumber || typeof phoneNumber !== 'string') {
        return res.status(400).json({ message: 'Phone number is required' });
      }

      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, {
        smsPhoneNumber: phoneNumber,
        smsVerified: true,
      });
      res.json({ success: true, preferences });
    } catch (error) {
      console.error('Error verifying phone:', error);
      res.status(500).json({ message: 'Failed to verify phone number' });
    }
  });

  // Trigger manual shift reminder (for testing)
  app.post('/api/notifications/send-shift-reminder', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.user!.currentWorkspaceId;
      const {  shiftId  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!shiftId || typeof shiftId !== 'string') {
        return res.status(400).json({ message: 'Shift ID is required' });
      }

      const { sendShiftReminder } = await import('./services/shiftRemindersService');
      const result = await sendShiftReminder(shiftId, workspaceId);

      if (result) {
        res.json({ success: true, result });
      } else {
        res.status(404).json({ message: 'Shift not found or no employee assigned' });
      }
    } catch (error) {
      console.error('Error sending shift reminder:', error);
      res.status(500).json({ message: 'Failed to send shift reminder' });
    }
  });

  // SECURE USER IDENTITY & AUTHORIZATION ENDPOINTS
  // ============================================================================
  
  // Get current user's workspace role (secure - no data leak)
  app.get('/api/me/workspace-role', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;
      
      if (!workspaceId) {
        return res.json({ workspaceRole: null });
      }
      
      const [employee] = await db
        .select({ workspaceRole: employees.workspaceRole })
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      res.json({ workspaceRole: employee?.workspaceRole || null });
    } catch (error) {
      console.error('[API] Error fetching workspace role:', error);
      res.status(500).json({ message: 'Failed to fetch workspace role' });
    }
  });
  
  // Get current user's platform role (secure)
  app.get('/api/me/platform-role', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const [platformRole] = await db
        .select({ role: platformRoles.role })
        .from(platformRoles)
        .where(and(
          eq(platformRoles.userId, userId),
          isNull(platformRoles.revokedAt)
        ))
        .limit(1);
      
      res.json({ platformRole: platformRole?.role || 'none' });
    } catch (error) {
      console.error('[API] Error fetching platform role:', error);
      res.status(500).json({ message: 'Failed to fetch platform role' });
    }
  });
  
  // Get workspace features available to current user (SERVER-SIDE VALIDATION)
  app.get('/api/me/workspace-features', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.user!.currentWorkspaceId;
      
      // Fetch workspace role
      let workspaceRole = null;
      if (workspaceId) {
        const [employee] = await db
          .select({ workspaceRole: employees.workspaceRole })
          .from(employees)
          .where(and(
            eq(employees.userId, userId),
            eq(employees.workspaceId, workspaceId)
          ))
          .limit(1);
        workspaceRole = employee?.workspaceRole || null;
      }
      
      // Fetch platform role
      const [platformRoleData] = await db
        .select({ role: platformRoles.role })
        .from(platformRoles)
        .where(and(
          eq(platformRoles.userId, userId),
          isNull(platformRoles.revokedAt)
        ))
        .limit(1);
      const platformRole = platformRoleData?.role || 'none';
      
      // Import workspace features and filter server-side
      const { getFeaturesForRole } = await import('@shared/workspaceFeatures');
      const features = getFeaturesForRole(platformRole, workspaceRole);
      
      res.json({ 
        features,
        platformRole,
        workspaceRole
      });
    } catch (error) {
      console.error('[API] Error fetching workspace features:', error);
      res.status(500).json({ message: 'Failed to fetch workspace features' });
    }
  });

  // Get active feature updates (platform-wide, shown to all users)
  app.get('/api/feature-updates', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const now = new Date();

      // Check if user is new (created within last 7 days)
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const isNewUser = user && user.createdAt && new Date(user.createdAt) > sevenDaysAgo;

      // Get all active major feature updates (platform-wide)
      const activeUpdates = await db
        .select()
        .from(featureUpdates)
        .where(
          and(
            eq(featureUpdates.status, 'published'),
            eq(featureUpdates.isMajor, true), // Only show major updates
            or(
              isNull(featureUpdates.releaseAt),
              lte(featureUpdates.releaseAt, now)
            ),
            or(
              isNull(featureUpdates.expireAt),
              gte(featureUpdates.expireAt, now)
            )
          )
        )
        .orderBy(desc(featureUpdates.createdAt))
        .limit(isNewUser ? 1 : 1000); // New users see only the latest major update

      // Get user's dismissed updates (across all workspaces)
      const dismissedReceipts = await db
        .select()
        .from(featureUpdateReceipts)
        .where(
          and(
            eq(featureUpdateReceipts.userId, userId),
            isNotNull(featureUpdateReceipts.dismissedAt)
          )
        );

      const dismissedIds = new Set(dismissedReceipts.map(r => r.featureUpdateId));

      // Filter out dismissed updates
      const undismissedUpdates = activeUpdates
        .filter(update => !dismissedIds.has(update.id))
        .map(update => ({
          id: update.id,
          title: update.title,
          description: update.description,
          category: update.category,
          releaseDate: update.createdAt,
          learnMoreUrl: update.learnMoreUrl,
        }));

      res.json(undismissedUpdates);
    } catch (error) {
      console.error('Error fetching feature updates:', error);
      res.status(500).json({ message: 'Failed to fetch feature updates' });
    }
  });

  // Dismiss a specific feature update (platform-wide, user-scoped)
  app.post('/api/feature-updates/:id/dismiss', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const updateId = req.params.id;
      // Use current workspace if available, otherwise use a placeholder
      const workspaceId = req.user!.currentWorkspaceId || 'platform-global';

      // Check if receipt already exists
      const existingReceipt = await db
        .select()
        .from(featureUpdateReceipts)
        .where(
          and(
            eq(featureUpdateReceipts.userId, userId),
            eq(featureUpdateReceipts.featureUpdateId, updateId)
          )
        )
        .limit(1);

      if (existingReceipt.length > 0) {
        // Update existing receipt
        await db
          .update(featureUpdateReceipts)
          .set({
            dismissedAt: new Date(),
          })
          .where(eq(featureUpdateReceipts.id, existingReceipt[0].id));
      } else {
        // Create new receipt
        await db.insert(featureUpdateReceipts).values({
          userId,
          workspaceId,
          featureUpdateId: updateId,
          viewedAt: new Date(),
          dismissedAt: new Date(),
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error dismissing update:', error);
      res.status(500).json({ message: 'Failed to dismiss update' });
    }
  });

  // DYNAMIC CONFIGURATION MANAGEMENT (Admin Only)
  // ============================================================================

  /**
   * POST /api/config/apply-changes
   * Apply configuration changes at runtime
   * 
   * Security: Platform admin only (root_admin)
   * Rate limited: Mutation limiter
   * Audit logged: All changes tracked
   * 
   * Body: { changes: Array<{ scope: string, key: string, value: any }> }
   * Example:
   * {
   *   "changes": [
   *     { "scope": "featureToggles", "key": "ai.autoScheduling", "value": true },
   *     { "scope": "featureToggles", "key": "analytics.dashboards", "value": false }
   *   ]
   * }
   */
  app.post('/api/config/apply-changes', requirePlatformAdmin, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { changes } = req.body;

      // Validate request body
      if (!changes || !Array.isArray(changes)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid request body. Expected { changes: Array<{ scope, key, value }> }' 
        });
      }

      if (changes.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: 'No changes provided' 
        });
      }

      // Validate each change before applying
      const validationErrors: string[] = [];
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        
        if (!change.scope || !change.key || change.value === undefined) {
          validationErrors.push(`Change ${i}: Missing required fields (scope, key, value)`);
          continue;
        }

        try {
          configRegistry.validateChange(change.scope, change.key, change.value);
        } catch (error: any) {
          validationErrors.push(`Change ${i} (${change.scope}.${change.key}): ${error.message}`);
        }
      }

      // If any validation errors, return them all
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }

      // Apply all changes atomically
      try {
        await configRegistry.applyChanges(changes);
      } catch (error: any) {
        console.error('[ConfigChange] Failed to apply changes:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to apply configuration changes',
          error: error.message
        });
      }

      // Create audit log entries (console + database)
      for (const change of changes) {
        const logMessage = `[ConfigChange] Admin ${userId} changed ${change.scope}.${change.key} to ${change.value}`;
        console.log(logMessage);

        // Store in audit trail table if it exists
        try {
          await db.insert(auditTrail).values({
            workspaceId: 'platform-admin', // Platform-level change
            userId,
            action: 'config.update',
            resourceType: 'configuration',
            resourceId: `${change.scope}.${change.key}`,
            details: {
              scope: change.scope,
              key: change.key,
              value: change.value,
              timestamp: new Date().toISOString()
            }
          });
        } catch (auditError) {
          // Non-critical - log but don't fail the request
          console.error('[ConfigChange] Failed to create audit trail entry:', auditError);
        }
      }

      // Clear cache to force reload
      configRegistry.clearCache();

      // Return success with applied changes
      res.json({
        success: true,
        message: `Successfully applied ${changes.length} configuration change(s)`,
        changes: changes.map(c => ({
          scope: c.scope,
          key: c.key,
          value: c.value,
          applied: true
        })),
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('[ConfigChange] Unexpected error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while processing configuration changes',
        error: error.message
      });
    }
  });

  /**
   * GET /api/config/current
   * Get current configuration values
   * 
   * Security: Platform admin only (root_admin)
   * Rate limited: Read limiter
   * 
   * Query params: ?scope=featureToggles
   */
  app.get('/api/config/current', requirePlatformAdmin, readLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { scope } = req.query;

      if (!scope || typeof scope !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Scope query parameter is required (e.g., ?scope=featureToggles)'
        });
      }

      // Get current config
      const config = configRegistry.getConfig(scope);

      // Get available keys for this scope
      const availableKeys = configRegistry.getAvailableKeys(scope);

      res.json({
        success: true,
        scope,
        config,
        availableKeys,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('[ConfigQuery] Error fetching config:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch configuration',
        error: error.message
      });
    }
  });

  // Submit user feedback
  app.post('/api/feedback', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { type, message } = req.body;
      
      if (!type || !message) {
        return res.status(400).json({ message: 'Type and message are required' });
      }

      // Create support ticket for feedback
      const ticket = await storage.createSupportTicket({
        workspaceId: req.user!.currentWorkspaceId || '',
        requestorId: userId,
        requestorEmail: req.user!.email || '',
        category: type === 'bug' ? 'bug_report' : type === 'feature' ? 'feature_request' : 'feedback',
        subject: `User Feedback: ${type}`,
        description: message,
        priority: 'normal',
        status: 'open',
      });
      res.json({ success: true, ticketId: ticket.id });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({ message: 'Failed to submit feedback' });
    }
  });


  // ============================================================================
  // MOBILE VOICE COMMAND SYSTEM
  // ============================================================================

  /**
   * Voice Command API - Mobile Trinity voice interaction
   * 
   * Receives voice-transcribed commands from mobile users and routes them
   * through the SubagentSupervisor for orchestration with AI Brain Gemini.
   * Tracks token usage against the organization's credit account.
   */
  app.post('/api/voice-command', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { transcript, timestamp, source, executionMode } = req.body;
      const userId = req.userId!;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      
      if (!transcript || typeof transcript !== 'string') {
        return res.status(400).json({ 
          error: 'Missing required field: transcript',
          message: 'Please provide a voice command transcript.'
        });
      }

      console.log('[VoiceCommand] Received command:', {
        userId,
        workspaceId,
        transcript: transcript.substring(0, 100),
        source,
        timestamp
      });

      // Validate execution mode
      const validExecutionMode = executionMode === 'trinity_fast' ? 'trinity_fast' : 'normal';
      const isFastMode = validExecutionMode === 'trinity_fast';
      
      console.log('[VoiceCommand] Processing with execution mode:', validExecutionMode);

      // Execute voice command synchronously and get the AI response inline
      const { workboardService } = await import('./services/ai-brain/workboardService');
      
      const result = await workboardService.executeVoiceCommandSync({
        transcript: transcript.trim(),
        userId,
        workspaceId,
        executionMode: validExecutionMode
      });

      // Emit event for real-time UI update
      const { eventBus } = await import('./services/eventBus');
      eventBus.emit('voice_command_received', {
        userId,
        workspaceId,
        taskId: result.taskId,
        status: result.success ? 'completed' : 'failed',
        assignedAgent: result.assignedAgent,
        executionMode: validExecutionMode
      });

      res.json({
        success: result.success,
        taskId: result.taskId,
        status: result.success ? 'completed' : 'failed',
        assignedAgent: result.assignedAgent,
        response: result.response,
        tokensUsed: result.tokensUsed,
        executionMode: validExecutionMode,
        isFastMode,
        message: result.response
      });

    } catch (error: any) {
      console.error('[VoiceCommand] Error processing command:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process voice command',
        message: error.message || 'An unexpected error occurred.'
      });
    }
  });
  // ============================================================================
  // ============================================================================

  // HelpAI escalation endpoint - Guest info capture and conversation creation
  app.post('/api/support/escalate', chatMessageLimiter, async (req, res) => {
    try {
      const { conversationId, guestName, guestEmail, issue, sessionId } = req.body;
      
      if (!conversationId || !guestName || !guestEmail || !issue) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Generate a guest token for authentication (simple JWT-like structure)
      const guestToken = crypto.randomBytes(32).toString('hex');
      
      // Store guest token in database or session (for now, we'll just return it)
      // In production, you'd want to store this in a table with expiration
      
      console.log('[HelpAI] Guest escalation:', {
        conversationId,
        guestName,
        guestEmail,
        guestToken: guestToken.substring(0, 16) + '...'
      });
      
      // Return escalation details
      res.json({
        conversationId,
        ticketNumber: conversationId, // Use conversationId as ticket number for now
        guestToken,
        success: true
      });
    } catch (error) {
      console.error('[HelpAI] Escalation error:', error);
      res.status(500).json({ 
        error: 'Failed to complete escalation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create support ticket from floating chat (CoAIleague AI)
  app.post('/api/support/create-ticket', chatMessageLimiter, async (req, res) => {
    try {
      const authReq = req as any;
      const { subject, description, conversationHistory } = req.body;
      
      if (!subject || !description) {
        return res.status(400).json({ message: 'Subject and description are required' });
      }

      // Get user info (support both auth methods)
      let userId: string | null = null;
      let workspaceId: string | null = null;
      let userEmail = 'guest@coaileague.local';
      
      // Try custom auth first (session-based)
      if (authReq.session?.userId) {
        userId = authReq.session.userId;
        workspaceId = authReq.session.workspaceId || null;
      }
      // Try Replit Auth (OIDC)
      else if (authReq.isAuthenticated?.() && authReq.user?.claims?.sub) {
        userId = authReq.user.claims.sub;
        userEmail = authReq.user?.claims?.email || userEmail;
      }
      
      // For guests, use CoAIleague Platform workspace
      const { PLATFORM_WORKSPACE_ID } = await import('./seed-platform-workspace');
        if (!workspaceId) {
          workspaceId = PLATFORM_WORKSPACE_ID;
        }
      
      // Combine conversation history into description
      const fullDescription = conversationHistory && Array.isArray(conversationHistory)
        ? `${description}\n\n--- Conversation History ---\n${conversationHistory.map(m => `${m.type === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n')}`
        : description;
      
      // Generate ticket number
      const ticketNumber = `TKT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      // Create the support ticket
      const ticket = await storage.createSupportTicket({
        workspaceId,
        type: 'support',
        requestorId: userId || 'guest-user',
        requestorEmail: userEmail,
        category: 'support_request',
        subject,
        description: fullDescription,
        priority: 'normal',
        status: 'open',
        ticketNumber
      });

      res.json({ 
        success: true, 
        ticketId: ticket.id,
        ticketNumber: (ticket as any).ticketNumber || ticket.id
      });
    } catch (error) {
      console.error('[CoAIleague AI] Error creating support ticket:', error);
      res.status(500).json({ 
        error: 'Failed to create support ticket',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // HelpAI bubble chat - Customer-facing AI chat (supports both authenticated and anonymous users)
  app.post('/api/support/helpos-chat', chatMessageLimiter, async (req, res) => {
    try {
      const authReq = req as any; // Need 'any' to access both session and user
      const { message, sessionId, conversationHistory } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: 'Message is required' });
      }

      // Support both auth systems: Custom auth (session) and Replit Auth (OIDC)
      let userId: string | null = null;
      let isAuthenticated = false;
      
      // Try custom auth first (session-based)
      if (authReq.session?.userId) {
        userId = authReq.session.userId;
        isAuthenticated = true;
      }
      // Try Replit Auth (OIDC)
      else if (authReq.isAuthenticated?.() && authReq.user?.claims?.sub) {
        userId = authReq.user.claims.sub;
        isAuthenticated = true;
      }
      
      // For anonymous users, derive a stable userId from sessionId to prevent session hijacking
      // This ensures anonymous users can only access their own sessions
      if (!isAuthenticated) {
        userId = sessionId 
          ? `anon-${sessionId}` // Stable anonymous ID based on session
          : `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // New anonymous user
      }
      
      // For anonymous users, use CoAIleague Platform workspace
      const { PLATFORM_WORKSPACE_ID } = await import('./seed-platform-workspace');
      let workspaceId: string;
      
      if (isAuthenticated) {
        // If client didn't send workspaceId, try to use user's currentWorkspaceId
        let requestedWorkspaceId = req.body.workspaceId;
        
        if (!requestedWorkspaceId) {
          const [userRecord] = await db.select().from(users).where(eq(users.id, userId!)).limit(1);
          requestedWorkspaceId = userRecord?.currentWorkspaceId || undefined;
        }
        
        const resolution = await resolveWorkspaceForUser(userId!, requestedWorkspaceId);
        
        // SECURITY: Never fallback authenticated users to platform workspace
        // This prevents cross-tenant data leakage
        if (!resolution.workspaceId) {
          return res.status(400).json({ 
            message: resolution.error || 'Please select a workspace using the workspace switcher',
            requiresWorkspace: true
          });
        }
        
        workspaceId = resolution.workspaceId;
      } else {
        workspaceId = PLATFORM_WORKSPACE_ID;
      }
      
      // SECURITY: Validate session ownership to prevent cross-user access
      // For ALL requests with sessionId, validate the session belongs to this user
      if (sessionId) {
        const existingSession = await storage.getHelposSession(sessionId, workspaceId);
        if (existingSession) {
          // Session exists - verify it belongs to this user
          if (existingSession.userId !== userId) {
            console.error('[HelpAI] Session hijacking attempt:', {
              sessionId,
              expectedUserId: userId,
              actualUserId: existingSession.userId,
              isAuthenticated
            });
            return res.status(403).json({ message: 'Unauthorized: Session does not belong to this user' });
          }
        }
        // If session doesn't exist, it will be created by bubbleAgent_reply
      }
      
      // Get user details for chat context
      const user = isAuthenticated ? await storage.getUser(userId) : null;
      const userName = user?.email || (isAuthenticated ? 'User' : 'Guest');
      const userEmail = user?.email || '';

      const response = await helposService.bubbleAgent_reply({
        workspaceId,
        userId,
        userName,
        userMessage: message,
        sessionId,
        conversationHistory: conversationHistory || [],
        storage,
      });

      console.log('[HelpAI] Response from bubbleAgent:', {
        shouldEscalate: response.shouldEscalate,
        escalationReason: response.escalationReason,
        messagePreview: (typeof response.message === 'string') ? response.message.substring(0, 100) : 'N/A'
      });

      // Handle escalation to live helpdesk
      if (response.shouldEscalate && response.escalationReason) {
        console.log('[HelpAI] ✅ ESCALATING TO LIVE CHAT:', {
          reason: response.escalationReason,
          userId,
          userName,
          workspaceId,
          isAuthenticated
        });
        
        // DEFENSIVE: Ensure platform workspace exists before escalation (runtime fallback)
        if (workspaceId === PLATFORM_WORKSPACE_ID) {
          let existingWorkspace = await storage.getWorkspace(PLATFORM_WORKSPACE_ID);
          if (!existingWorkspace) {
            console.log('[HelpAI] Platform workspace missing - acquiring lock for runtime seeding...');
            try {
              await platformWorkspaceSeedLock.acquire();
              
              // Re-check after acquiring lock (another request may have seeded it)
              existingWorkspace = await storage.getWorkspace(PLATFORM_WORKSPACE_ID);
              if (!existingWorkspace) {
                console.log('[HelpAI] Seeding platform workspace (runtime fallback)');
                const { seedRootUser } = await import('./seed-root-user');
                const { seedPlatformWorkspace } = await import('./seed-platform-workspace');
                await seedRootUser();
                await seedPlatformWorkspace();
                
                // Verify workspace was created
                existingWorkspace = await storage.getWorkspace(PLATFORM_WORKSPACE_ID);
                if (!existingWorkspace) {
                  throw new Error('CRITICAL: Platform workspace seeding failed - workspace still missing after seed attempt');
                }
                console.log('[HelpAI] ✅ Platform workspace seeded successfully');
              } else {
                console.log('[HelpAI] Platform workspace was created by concurrent request');
              }
            } finally {
              platformWorkspaceSeedLock.release();
            }
          }
        }
        
        // For anonymous users, create a basic conversation record so WebSocket can join
        if (!isAuthenticated) {
          console.log('[HelpAI] Anonymous escalation - creating conversation for WebSocket join');
          
          const ticketNumber = `GUEST-${Date.now()}`;
          const conversation = await storage.createChatConversation({
            workspaceId,
            customerId: null, // Anonymous users don't have user records - FK allows null
            customerName: userName || 'Guest',
            customerEmail: userEmail || 'guest@anonymous',
            subject: `HelpAI Escalation - ${response.escalationReason}`,
            isActive: true,
            priority: 'normal',
          });
          
          return res.json({
            ...response,
            escalated: true,
            conversationId: conversation.id, // Use real conversation ID
            ticketNumber,
          });
        }
        
        // For authenticated users, create full support ticket
        const session = await storage.getHelposSession(response.sessionId, workspaceId);
        const aiSummary = session?.aiSummary || 'No summary available';

        const escalationData = await helposService.handleEscalation({
          workspaceId,
          userId,
          userName,
          userEmail,
          sessionId: response.sessionId,
          escalationReason: response.escalationReason,
          aiSummary,
          storage,
        });

        // Notify support agents via WebSocket
        const { broadcastToWorkspace } = await import('./websocket');
        await broadcastToWorkspace(workspaceId, {
          type: 'helpos_escalation',
          payload: {
            ticketId: escalationData.ticketId,
            ticketNumber: escalationData.ticketNumber,
            conversationId: escalationData.conversationId,
            customerName: userName,
            priority: response.escalationReason === 'critical_keyword' ? 'urgent' : 'normal',
          },
        });

        console.log('[HelpAI] ✅ Escalation complete, returning to client:', {
          escalated: true,
          ticketNumber: escalationData.ticketNumber,
          conversationId: escalationData.conversationId
        });

        return res.json({
          ...response,
          escalated: true,
          conversationId: escalationData.conversationId,
          ticketNumber: escalationData.ticketNumber,
        });
      }

      console.log('[HelpAI] No escalation needed, returning normal response');
      res.json(response);
    } catch (error: any) {
      console.error('HelpAI chat error:', error);
      res.status(500).json({ message: error.message || 'Failed to process HelpAI chat' });
    }
  });

  // HelpAI staff copilot - AI suggestions for support agents
  app.post('/api/support/helpos-copilot', requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { message, chatHistory, userContext } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: 'Message is required' });
      }

      const userId = authReq.user!.id;
      const { workspaceId } = await resolveWorkspaceForUser(userId, req.body.workspaceId);

      const suggestion = await helposService.staffCopilot_suggestResponse({
        workspaceId,
        userMessage: message,
        chatHistory: chatHistory || [],
        userContext,
      });

      res.json({ suggestion });
    } catch (error: any) {
      console.error('HelpAI copilot error:', error);
      res.status(500).json({ message: error.message || 'Failed to generate suggestion' });
    }
  });

  // Get all workspaces user has access to (for workspace switcher)
  app.get('/api/workspaces/all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get user's owned workspace
      const ownedWorkspace = await storage.getWorkspaceByOwnerId(userId);
      
      // In future, could add workspaces user is a member of
      const workspaces = ownedWorkspace ? [ownedWorkspace] : [];
      
      res.json(workspaces);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      res.status(500).json({ message: 'Failed to fetch workspaces' });
    }
  });


  // Create a new workspace/organization
  app.post('/api/workspaces', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const user = req.user;
      if (!userId || !user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { name, description, industry, size, companyName, sectorId, industryGroupId, subIndustryId, complianceTemplates, certifications } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'Organization name is required' });
      }

      // Create the workspace
      const workspace = await storage.createWorkspace({
        name: name.trim(),
        ownerId: userId,
        companyName: companyName || name.trim(),
        industryDescription: description || null,
        businessCategory: industry || 'general',
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
      });

      // Create employee record for the owner (org_owner role)
      const employee = await storage.createEmployee({
        userId: userId,
        workspaceId: workspace.id,
        email: user.email,
        firstName: user.firstName || 'Owner',
        lastName: user.lastName || '',
        workspaceRole: 'org_owner',
        isActive: true,
      });

      // Update user's currentWorkspaceId
      await db.update(users).set({ currentWorkspaceId: workspace.id }).where(eq(users.id, userId));

      // Update session with workspace
      if (req.session) {
        (req.session as any).workspaceId = workspace.id;
        (req.session as any).activeWorkspaceId = workspace.id;
      }

      // Try to attach employee external ID
      try {
        const { attachEmployeeExternalId } = await import('./services/identityService');
        await attachEmployeeExternalId(employee.id, workspace.id);
        console.log(`[Workspace Create] Attached external ID to employee ${employee.id}`);
      } catch (extIdError: any) {
        console.error(`[Workspace Create] Failed to attach external ID:`, extIdError.message);
      }

      // Log the organization creation
      await storage.createAuditLog({
        userId,
        workspaceId: workspace.id,
        action: 'workspace_created',
        entityType: 'workspace',
        entityId: workspace.id,
        details: {
          name: workspace.name,
          industry,
          size,
          sectorId,
          industryGroupId,
          subIndustryId,
          organizationId: workspace.organizationId,
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      // Broadcast creation event for Trinity mascot reaction
      broadcastPlatformUpdate({
        type: 'workspace_created',
        title: 'New Organization Created',
        message: `${workspace.name} has been created successfully`,
        workspaceId: workspace.id,
        timestamp: new Date().toISOString(),
      });

      console.log(`[Workspace Create] Created workspace ${workspace.id} and employee ${employee.id} for user ${userId}`);

      res.status(201).json({
        success: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          organizationId: workspace.organizationId,
          organizationSerial: workspace.organizationSerial,
        },
      });
    } catch (error) {
      console.error('Error creating workspace:', error);
      res.status(500).json({ message: 'Failed to create organization' });
    }
  });
  // Switch workspace
  app.post('/api/workspace/switch/:workspaceId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { workspaceId } = req.params;
      
      // Verify user has access to this workspace
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace || workspace.ownerId !== userId) {
        return res.status(403).json({ message: 'Access denied to this workspace' });
      }
      
      // Update user's current workspace
      await storage.updateUser(userId, {
        currentWorkspaceId: workspaceId,
      });
      res.json({ success: true, workspaceId });
    } catch (error) {
      console.error('Error switching workspace:', error);
      res.status(500).json({ message: 'Failed to switch workspace' });
    }
  });

  // ============================================================================
  // HEALTH CHECK & MONITORING (No rate limiting)
  // ============================================================================
  
  // Auto-create support ticket when critical service fails (spam prevention: 1 ticket/hour per service)
  async function autoCreateSupportTicket(service: string, message: string, severity: 'critical' | 'high'): Promise<void> {
    try {
      const [supportWorkspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.organizationCode, 'ORG-SUPT'))
        .limit(1);
      
      if (!supportWorkspace) return;

      const oneHourAgo = new Date(Date.now() - 3600000);
      const [recentTicket] = await db.select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.workspaceId, supportWorkspace.id),
          sql`${supportTickets.subject} LIKE ${'%' + service + '%'}`,
          sql`${supportTickets.createdAt} > ${oneHourAgo}`
        ))
        .limit(1);
      
      if (recentTicket) return;

      await storage.createSupportTicket({
        workspaceId: supportWorkspace.id,
        ticketNumber: `SUPT-${Date.now()}`,
        type: 'support',
        priority: severity === 'critical' ? 'urgent' : 'high',
        requestedBy: 'CoAIleague Monitor',
        subject: `[${severity.toUpperCase()}] ${service} Service Failure`,
        description: `${message}\n\nDetected: ${new Date().toISOString()}`,
        status: 'open',
        isEscalated: severity === 'critical',
      });

      console.log(`[AutoTicket] Created ticket for ${service}`);
    } catch (error) {
      console.error('[AutoTicket] Failed:', error);
    }
  }

  // DEBUG: Test endpoint to analyze view_id values from SQL
  app.get("/api/debug/view-id-test", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT p.id, v.id as view_id, v.user_id
        FROM platform_updates p
        LEFT JOIN user_platform_update_views v ON v.update_id = p.id AND v.user_id = 'root-user-00000000'
        ORDER BY p.created_at DESC LIMIT 5
      `);
      const rows = (result.rows as any[]).map(r => ({
        id: r.id?.substring(0, 40),
        view_id: r.view_id,
        view_id_type: typeof r.view_id,
        is_truthy: !!r.view_id,
        keys: Object.keys(r)
      }));
      res.json(rows);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // Health check endpoint with comprehensive service monitoring
  app.get('/api/health', async (req, res) => {
    const checks: Record<string, { status: string; message?: string }> = {};
    
    try {
      // Use real health check functions from healthCheck service
      const dbHealth = await checkDatabase();
      checks.database = { status: dbHealth.status === 'operational' ? 'up' : dbHealth.status === 'degraded' ? 'degraded' : 'down', message: dbHealth.message };
      
      const chatHealth = await checkChatWebSocket();
      checks.websocket = { status: chatHealth.status === 'operational' ? 'up' : 'down', message: chatHealth.message };
      
      const stripeHealth = await checkStripe();
      checks.stripe = { status: stripeHealth.status === 'operational' ? 'up' : 'down', message: stripeHealth.message };
      
      const geminiHealth = await checkGeminiAI();
      checks.gemini = { status: geminiHealth.status === 'operational' ? 'up' : 'down', message: geminiHealth.message };
      
      // Email service health check
      checks.resend = { status: emailService ? 'up' : 'unconfigured' };

      // Create auto-tickets for critical failures
      if (dbHealth.status === 'down') {
        await createHealthCheckTicket('default', 'database', 'Database connection failed - auto-created by health check');
      }
      if (stripeHealth.status === 'down') {
        await createHealthCheckTicket('default', 'stripe', 'Stripe API unreachable - auto-created by health check');
      }
      if (geminiHealth.status === 'down') {
        await createHealthCheckTicket('default', 'gemini_ai', 'Gemini API unreachable - auto-created by health check');
      }

      const isHealthy = !Object.values(checks).some(c => c.status === 'down');
      
      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        services: checks
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        services: checks
      });
    }
  });

  // Workspace health endpoint - returns simplified status for non-technical users
  app.get('/api/workspace/health', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        // Check if platform staff - they get platform-wide health view
        const userId = req.user?.id || req.user?.claims?.sub;
        if (userId) {
          const { getUserPlatformRole, hasPlatformWideAccess } = await import('./rbac');
          const platformRole = await getUserPlatformRole(userId);
          if (hasPlatformWideAccess(platformRole)) {
            return res.json({
              overallStatus: 'green',
              statusMessage: 'Platform staff - full access',
              billingActive: true,
              subscriptionTier: 'enterprise',
              integrations: { quickbooks: 'platform', gusto: 'platform' },
              isPlatformStaff: true,
            });
          }
        }
        return res.status(400).json({ error: 'No workspace selected' });
      }

      // Get workspace with billing info
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      // Check partner integrations
      const qboConnection = await db.select().from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        ))
        .limit(1);

      const gustoConnection = await db.select().from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'gusto')
        ))
        .limit(1);

      // Determine overall health status
      const billingActive = workspace.subscriptionStatus === 'active';
      const hasIntegrations = qboConnection.length > 0 || gustoConnection.length > 0;
      
      // Simple traffic light logic
      let overallStatus: 'green' | 'yellow' | 'red' = 'green';
      let statusMessage = 'Your workspace is running smoothly';
      
      if (!billingActive) {
        overallStatus = 'red';
        statusMessage = 'Billing issue - please update payment method';
      } else if (!hasIntegrations) {
        overallStatus = 'yellow';
        statusMessage = 'Connect QuickBooks or Gusto to enable automation';
      }

      res.json({
        status: overallStatus,
        message: statusMessage,
        billing: {
          status: workspace.subscriptionStatus || 'inactive',
          active: billingActive,
        },
        integrations: {
          quickbooks: qboConnection.length > 0 ? 'connected' : 'not_connected',
          quickbooksRealmId: qboConnection.length > 0 ? qboConnection[0].realmId : null,
          gusto: gustoConnection.length > 0 ? 'connected' : 'not_connected',
        },
        automations: {
          invoicing: qboConnection.length > 0,
          payroll: gustoConnection.length > 0,
          scheduling: true, // Always available
        },
        safeToRun: billingActive && hasIntegrations,
      });
    } catch (error) {
      console.error('Workspace health check error:', error);
      res.status(500).json({ error: 'Failed to check workspace health' });
    }
  });


  // Integration health endpoint - QuickBooks and Gusto status
  app.get('/api/integrations/health', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const healthData = await getIntegrationHealthSummary();
      res.json(healthData);
    } catch (error: any) {
      console.error('[IntegrationHealth] Error:', error.message);
      res.status(500).json({ 
        error: 'Failed to check integration health',
        quickbooks: { service: 'quickbooks', status: 'down', isCritical: false, message: 'Health check failed', lastChecked: new Date().toISOString() },
        gusto: { service: 'gusto', status: 'down', isCritical: false, message: 'Health check failed', lastChecked: new Date().toISOString() },
        overall: 'down',
        timestamp: new Date().toISOString()
      });
    }
  });
  // Organization status endpoint - returns org-aware status for universal toast notifications
  app.get('/api/workspace/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'No workspace selected' });
      }

      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      // Determine org status based on workspace state
      type OrgStatusType = 'active' | 'suspended_payment' | 'suspended_violation' | 'suspended_other' | 'maintenance' | 'restricted' | 'trial_ending' | 'trial_expired';
      let status: OrgStatusType = 'active';

      if (workspace.isFrozen) {
        status = 'suspended_payment';
      } else if (workspace.isSuspended) {
        status = 'suspended_violation';
      } else if (workspace.isLocked) {
        status = 'suspended_other';
      }

      res.json({
        workspaceId,
        status,
        statusReason: workspace.suspendedReason || workspace.frozenReason || workspace.lockedReason || null,
        lastChecked: new Date().toISOString(),
        metadata: {},
      });
    } catch (error) {
      console.error('Failed to fetch workspace status:', error);
      res.status(500).json({ error: 'Failed to fetch workspace status' });
    }
  });

  // Get custom organization status messages - per-org customization
  app.get('/api/workspace/custom-messages', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'No workspace selected' });
      }

      // Return empty customization (future: store in DB per org)
      res.json({
        workspaceId,
        statusOverrides: {},
        customMessages: {},
      });
    } catch (error) {
      console.error('Failed to fetch custom messages:', error);
      res.status(500).json({ error: 'Failed to fetch custom messages' });
    }
  });
  
  // SECURITY: Apply rate limiting BEFORE auth routes to prevent brute-force attacks
  app.use('/api', apiLimiter);
  
  // Apply strict rate limiting ONLY to sensitive auth endpoints (not /api/auth/me)
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/request-password-reset', authLimiter);
  app.use('/api/helpdesk/authenticate-ticket', authLimiter);
  app.use('/api/helpdesk/authenticate-workid', authLimiter);
  app.use("/api/auth/forgot-password", authLimiter);
  app.use("/api/auth/magic-link", authLimiter);
  app.use("/api/auth/reset-password", authLimiter);
  app.use("/api/auth/reset-password-request", authLimiter);
  app.use("/api/auth/reset-password-confirm", authLimiter);
  
  // Register custom auth routes (AFTER rate limiters for security)
  app.use(authRoutes);
  
  // Register billing API routes (subscription, usage tracking, invoices, add-ons)
  // IMPORTANT: Mount at /api/billing to avoid intercepting root path
  app.use('/api/billing', billingRouter);

  // Register Partner Integration OAuth routes (QuickBooks, Gusto)
  app.use('/api/integrations', integrationRouter);

  // ============= QUICKBOOKS SYNC SERVICE ROUTES =============
  const { quickbooksSyncService } = await import('./services/partners/quickbooksSyncService');

  // Run initial sync on OAuth connect
  app.post("/api/quickbooks/sync/initial", requireAuth, async (req, res) => {
    try {
      const workspaceId = req.user?.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace required" });
      }
      const result = await quickbooksSyncService.runInitialSync(workspaceId, req.user!.id);
      res.json(result);
    } catch (error: any) {
      console.error("[QBO Sync] Initial sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create invoice with idempotency - Zod validated
  const qboInvoiceSchema = z.object({
    clientId: z.string().min(1, "clientId is required"),
    weekEnding: z.string().refine((val) => !isNaN(Date.parse(val)), "weekEnding must be a valid date"),
    lineItems: z.array(z.object({
      description: z.string().min(1),
      amount: z.number().positive(),
      hours: z.number().positive().optional(),
    })).min(1, "At least one line item is required"),
  });

  app.post("/api/quickbooks/invoice/create", requireAuth, async (req, res) => {
    try {
      const workspaceId = req.user?.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace required" });
      }
      
      const parseResult = qboInvoiceSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: parseResult.error.issues 
        });
      }
      
      const { clientId, weekEnding, lineItems } = parseResult.data;
      const result = await quickbooksSyncService.createInvoiceWithIdempotency(
        workspaceId,
        clientId,
        new Date(weekEnding),
        lineItems,
        req.user!.id
      );
      res.json(result);
    } catch (error: any) {
      console.error("[QBO Sync] Invoice creation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Run CDC poll for changes
  app.post("/api/quickbooks/sync/cdc", requireAuth, async (req, res) => {
    try {
      const workspaceId = req.user?.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace required" });
      }
      const { sinceDate } = req.body;
      const result = await quickbooksSyncService.runCDCPoll(
        workspaceId,
        req.user!.id,
        sinceDate ? new Date(sinceDate) : undefined
      );
      res.json(result);
    } catch (error: any) {
      console.error("[QBO Sync] CDC poll error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get manual review queue
  app.get("/api/quickbooks/review-queue", requireAuth, async (req, res) => {
    try {
      const workspaceId = req.user?.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace required" });
      }
      const status = (req.query.status as string) || 'pending';
      const queue = await quickbooksSyncService.getManualReviewQueue(
        workspaceId,
        status as 'pending' | 'resolved' | 'skipped'
      );
      res.json({ queue });
    } catch (error: any) {
      console.error("[QBO Sync] Review queue error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Resolve manual review item
  app.post("/api/quickbooks/review-queue/:itemId/resolve", requireAuth, async (req, res) => {
    try {
      const { itemId } = req.params;
      const { resolution, selectedCoaileagueEntityId } = req.body;
      if (!resolution) {
        return res.status(400).json({ error: "resolution is required" });
      }
      await quickbooksSyncService.resolveManualReview(
        itemId,
        resolution,
        selectedCoaileagueEntityId,
        req.user!.id
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error("[QBO Sync] Review resolution error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook handler for QuickBooks real-time updates with proper HMAC verification
  app.post("/api/webhooks/quickbooks", async (req, res) => {
    try {
      const signature = req.headers['intuit-signature'] as string;
      if (!signature) {
        console.log("[QBO Webhook] Missing intuit-signature header");
        return res.status(401).json({ error: "Missing signature" });
      }

      // Use raw body captured by middleware for proper HMAC verification
      const rawPayload = (req as any).rawBody;
      if (!rawPayload) {
        console.log("[QBO Webhook] No raw body available for verification");
        return res.status(400).json({ error: "Missing request body" });
      }
      
      // Find the connection and verify signature before processing
      const event = req.body;
      if (!event.eventNotifications || event.eventNotifications.length === 0) {
        console.log("[QBO Webhook] No event notifications in payload");
        return res.status(200).send('OK');
      }

      const realmId = event.eventNotifications[0]?.realmId;
      if (!realmId) {
        console.log("[QBO Webhook] No realmId in event notification");
        return res.status(200).send('OK');
      }

      const [connection] = await db.select()
        .from(partnerConnections)
        .where(eq(partnerConnections.realmId, realmId))
        .limit(1);

      if (!connection || !connection.webhookSecret) {
        console.log("[QBO Webhook] No connection or webhook secret for realm:", realmId);
        return res.status(401).json({ error: "Unknown realm or missing webhook secret" });
      }

      // Verify HMAC-SHA256 signature using the raw payload
      try {
        const result = await quickbooksSyncService.handleWebhook(
          signature,
          rawPayload,
          connection.webhookSecret
        );
        console.log("[QBO Webhook] Successfully processed", result.entities.length, "entities");
      } catch (verifyError: any) {
        console.error("[QBO Webhook] HMAC verification failed");
        return res.status(401).json({ error: "Invalid signature" });
      }
      
      res.status(200).send('OK');
    } catch (error: any) {
      console.error("[QBO Webhook] Error:", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // Register Universal Time Tracking & Clock System
  app.use('/api/time-entries', timeEntryRouter);

  // Mobile Worker API routes (clock status, shifts, incidents)
  app.use('/api/shifts', shiftsRouter);
  app.use('/api/incidents', incidentsRouter);
  // Register Gamification & Employee Engagement System
  app.use('/api/gamification', gamificationRouter);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/gamification/enhanced', requireAuth, gamificationEnhancedRoutes);
  app.use('/api/ai/scheduling', requireAuth, aiSchedulingRoutes);

  // Q1 2026 Infrastructure Services (backups, error tracking, key rotation)
  app.use('/api/infrastructure', requireAuth, infrastructureRoutes);
  app.use("/api/sandbox", sandboxRoutes); // Sandbox Simulation Testing
  app.use(featureFlagsRoutes); // Trinity Runtime Flags API
  app.use(maintenanceRoutes); // Maintenance Mode API


  // Register CoAIleague Autonomous Scheduler API
  app.use('/api/scheduler', schedulerRouter);
  // Register Unified AI Brain System (cross-org learning, job execution, global patterns)
  app.use('/api/ai-brain', aiBrainRouter);
  app.use('/api/helpai', helpaiRouter);
  app.use('/api/mascot', mascotRouter); // Trinity AI Mascot
  app.use('/api/trinity', trinityAlertsRouter); // Trinity Autonomous Alerts
  app.use('/api/bug-remediation', bugRemediationRouter); // Bug Report AI Analysis & Auto-Fix

  app.use("/api/platform", serviceControlRouter);
  // Core Automation routes (Scheduling, Invoicing, Payroll) - REQUIRES AUTH
  app.use('/api/automation', requireAuth, automationRouter);
  app.use('/api/automation-events', requireAuth, automationEventsRouter);

  // Data Migration routes (Import from external platforms) - REQUIRES AUTH
  app.use('/api/migration', requireAuth, migrationRouter);

  // Register AI Dispatch™ routes (GPS tracking, incident management, CAD operations)
  const dispatchRouter = (await import('./routes/dispatch')).default;
  app.use('/api/dispatch', dispatchRouter);

  // Register Email Automation routes (Resend integration with billing)
  app.use("/api/emails", requireAuth, emailRouter);
  app.use("/api/internal-email", requireAuth, internalEmailRouter);
  app.use("/api/public/leads", publicLeadsRouter); // Public lead capture (no auth)
  app.use("/api/testimonials", testimonialsRouter); // Testimonials (mixed auth)

  // Register Calendar routes (ICS export, Google Calendar integration)
  app.use("/api/calendar", calendarRouter);

  // Register SMS routes (Twilio SMS notifications)
  app.use("/api/sms", smsRouter);

  // Register What's New routes (Platform updates feed)
  app.use("/api/whats-new", whatsNewRouter);
  app.use("/api/session-checkpoints", sessionCheckpointRouter);
  app.use("/api/subagents", subagentRouter);
  // Register Support Command Console routes (Force-push updates for support staff)
  app.use("/api/support/command", supportCommandRouter);
  app.use("/api/support/chat", supportChatRouter); // Simplified 1-on-1 HelpAI support chat
  app.use("/api/admin/end-users", endUserControlRouter);
  // Register AI Brain Console routes (Interactive AI chat and control for support staff)
  // Register Support-Assisted Onboarding routes (platform staff creates orgs for users)
  app.use("/api/support/assisted-onboarding", assistedOnboardingRouter);
  app.use("/api/accept-handoff", acceptHandoffRouter);
  app.use("/api/ai-brain/console", aiBrainConsoleRouter);
  // Register AI Brain Control routes (service pause/resume, workflow management, health monitoring)
  app.use("/api/ai-brain/control", aiBrainControlRouter);

  // Register AI Brain Code Editor routes (staged code changes, approval workflow)
  app.use("/api/code-editor", codeEditorRouter);

  // Register Onboarding Pipeline routes (tasks, progress, rewards)
  app.use("/api/onboarding", onboardingRouter);
  
  // Register Onboarding Assistant routes (AI Brain diagnostics, data flow validation)
  app.use("/api/onboarding-assistant", onboardingAssistantRouter);

  // Register Business Owner Analytics routes (usage metrics, trends, team engagement)
  app.use("/api/analytics/owner", requireAuth, attachWorkspaceId, ownerAnalyticsRouter);

  // Register Timesheet Report routes (reports, CSV export, compliance)
  app.use("/api/timesheet-reports", timesheetReportRouter);

  // Register Timesheet Invoice routes (generate invoices from approved time entries)
  app.use("/api/timesheet-invoices", timesheetInvoiceRouter);
  // Register Paystub routes (PDF generation, mobile-friendly pay statements)
  app.use(paystubRouter);

  // Register Advanced Scheduling routes (recurring shifts, shift swapping)
  app.use("/api/scheduling", advancedSchedulingRouter);
  // Register AI Communications Chat Upload routes (file uploads with security, workroom attachments)
  const chatUploadsRouter = (await import('./routes/chat-uploads')).default;
  app.use('/api/chat/upload', attachWorkspaceId, chatUploadsRouter);

  // Register email attachment upload routes
  const emailAttachmentsRouter = (await import('./routes/email-attachments')).default;
  app.use('/api/email-attachments', attachWorkspaceId, emailAttachmentsRouter);

  // Register AI Communications Chat Room routes (room creation, participant management, shift-based rooms)
  const chatRoomsRouter = (await import('./routes/chat-rooms')).default;
  app.use('/api/chat/rooms', attachWorkspaceIdOptional, chatRoomsRouter);

  // Register HelpAI FAQ routes (AI-powered FAQ system with semantic search)
  registerFaqRoutes(app);

  // Register Trinity AI Business Intelligence routes
  app.use("/api/trinity", trinityInsightsRouter);
  app.use("/api/trinity/maintenance", trinityMaintenanceRouter); // Trinity Platform Maintenance
  app.use("/api/trinity/control-console", trinityControlConsoleRouter); // Trinity Control Console
  app.use("/api/trinity", empireRouter); // Empire Mode routes
  app.use("/api/trinity/notifications", trinityNotificationRouter); // Trinity Notification Bridge
  app.use("/api/trinity/chat", requireAuth, trinityChatRouter); // Trinity Chat Interface with BUDDY metacognition
  app.use("/api/resilience", resilienceRouter); // Fortune 500-grade resilience APIs
  app.use("/api/quick-fixes", quickFixRouter); // Quick Fix System
  app.use("/api/experience", experienceRoutes); // Experience Enhancement Routes
  app.use("/api/device", deviceLoaderRouter); // Universal Device Loader
  app.use("/api/vqa", requireAuth, vqaRouter); // Visual QA (AI Brain Eyes)
  app.use("/api/uacp", requireAuth, uacpRouter); // Universal Access Control Panel (UACP)
  
  // ============================================================================
  // NEW FEATURE ROUTES: SALES CRM, DOCUMENTS, FLEX STAFFING, EXTERNAL EMAIL
  // ============================================================================
  registerLeadCrmRoutes(app, requireAuth);
  registerDocumentLibraryRoutes(app, requireAuth);
  registerFlexStaffingRoutes(app, requireAuth);
  registerExternalEmailRoutes(app, requireAuth);
  app.use("/api/workspace/integrations", requireAuth, integrationRoutes); // Workspace Integration Management
  app.use("/api/admin/partners", requirePlatformStaff, partnerRoutes); // Partner Catalog Management (Support Roles)
  app.use("/api/hris", hrisRouter); // HRIS Integration Routes - per-route auth, callback must be public for OAuth
  app.use("/api/trinity/self-edit", trinitySelfEditRouter); // Trinity Self-Edit Governance
  app.use("/api/quickbooks/phase3", requireAuth, attachWorkspaceId, quickbooksPhase3Router); // QuickBooks Phase 3 Intelligence & Compliance
  app.use("/api/finance", requireAuth, attachWorkspaceId, financialIntelligenceRouter); // Financial Intelligence P&L Dashboard
  app.use("/api/contracts/portal", contractPortalRouter); // Public contract portal (no auth required)
  app.use("/api/contracts", requireAuth, attachWorkspaceId, contractPipelineRouter); // Contract Lifecycle Pipeline (Premium)
  
  // ============================================================================
  // ROUTE HEALTH MONITORING (Trinity Platform Awareness)
  // ============================================================================
  // Trinity Editable Registry - Shows what Trinity can safely edit
  app.get("/api/trinity/editable-registry", async (_req, res) => {
    try {
      const { getEditableModulesForTrinity, getProtectedModules } = await import("../shared/config/trinityEditableRegistry");
      res.json({
        success: true,
        editableModules: getEditableModulesForTrinity(),
        protectedModules: getProtectedModules(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[TrinityRegistry] Error:", error);
      res.status(500).json({ success: false, error: "Failed to get registry" });
    }
  });

  app.get("/api/trinity/route-health", async (_req, res) => {
    try {
      const { getRouteHealthSummary, CRITICAL_ROUTES, CRITICAL_API_ENDPOINTS } = await import("./services/routeHealthService");
      const summary = getRouteHealthSummary();
      res.json({
        success: true,
        routes: CRITICAL_ROUTES,
        apiEndpoints: CRITICAL_API_ENDPOINTS,
        summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[RouteHealth] Error:", error);
      res.status(500).json({ success: false, error: "Failed to get route health" });
    }
  });
  // ============================================================================
  // AUTH ROUTES
  // ============================================================================

  // Organization Registration - Atomic transaction creates User → Workspace → Employee → Credits
  app.post('/api/auth/register', async (req: any, res) => {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        companyName,
        subscriptionTier = 'free', // free, starter, professional, enterprise
        billingCycle = 'monthly', // monthly, yearly
        paymentMethodId, // Optional Stripe payment method for paid tiers
      } = req.body;

      // Validation
      if (!email || !password || !firstName || !lastName || !companyName) {
        return res.status(400).json({
          message: 'Email, password, first name, last name, and company name are required',
        });
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      // Password strength validation
      if (password.length < 8) {
        return res.status(400).json({
          message: 'Password must be at least 8 characters long',
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          message: 'An account with this email already exists',
        });
      }

      // Validate subscription tier
      const validTiers = ['free', 'starter', 'professional', 'enterprise'];
      if (!validTiers.includes(subscriptionTier)) {
        return res.status(400).json({
          message: 'Invalid subscription tier',
        });
      }

      console.log(`🚀 Starting organization registration for ${email} (${subscriptionTier} tier)`);

      // ATOMIC TRANSACTION: Create user, workspace, employee, credits
      const result = await db.transaction(async (tx) => {
        // 1. Create User
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const [user] = await tx.insert(users).values({
          id: userId,
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          createdAt: new Date(),
        }).returning();

        console.log(`✅ User created: ${user.id}`);

        // 2. Create Workspace
        const workspaceId = `workspace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const [workspace] = await tx.insert(workspaces).values({
          id: workspaceId,
          name: companyName.trim(),
          ownerId: user.id,
          subscriptionTier,
          subscriptionStatus: 'active',
          createdAt: new Date(),
        }).returning();

        console.log(`✅ Workspace created: ${workspace.id}`);

        // 3. Create Employee record for owner
        const employeeId = `employee-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const [employee] = await tx.insert(employees).values({
          id: employeeId,
          workspaceId: workspace.id,
          userId: user.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.toLowerCase(),
          isActive: true,
          workspaceRole: 'org_owner',
          createdAt: new Date(),
        }).returning();

        console.log(`✅ Employee record created: ${employee.id}`);

        return { user, workspace, employee };
      });

      const { user, workspace, employee } = result;

      // 4. Initialize credits (outside transaction for retry safety)
      await creditManager.initializeCredits(workspace.id, subscriptionTier as any);
      console.log(`✅ Credits initialized: ${subscriptionTier} tier allocation`);

      // 5. Create Stripe subscription if paid tier
      if (subscriptionTier === 'free') {
        const trialStart = new Date();
        const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.insert(subscriptions).values({ workspaceId: workspace.id, plan: 'free', status: 'trial', trialStartedAt: trialStart, trialEndsAt: trialEnd, maxEmployees: 5, basePrice: 0, createdAt: new Date() });
        console.log(`✅ Free trial subscription created: 30 days`);
      } else if (subscriptionTier !== 'free') {
        const subscriptionResult = await subscriptionManager.createSubscription({
          workspaceId: workspace.id,
          tier: subscriptionTier as any,
          billingCycle: billingCycle as any,
          paymentMethodId,
        });

        if (!subscriptionResult.success) {
          console.error('Subscription creation failed:', subscriptionResult.error);
          return res.status(400).json({
            message: subscriptionResult.error || 'Failed to create subscription',
          });
        }

        console.log(`✅ Subscription created: ${subscriptionTier} (${billingCycle})`);
      }

      // 6. Send welcome notification
      await notificationHelpers.sendWelcomeOrgNotification(workspace.id, user.id);

      console.log(`✅ Welcome notification sent`);

      // 7. Create session
      req.session.userId = user.id;
      req.session.passport = {
        user: {
          claims: {
            sub: user.id,
            email: user.email,
            first_name: user.firstName,
            last_name: user.lastName,
          },
          expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
          refresh_token: 'auto-refresh',
        },
      };

      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      console.log(`✅ Organization registration complete: ${workspace.id}`);

      res.json({
        success: true,
        message: 'Organization registered successfully',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          subscriptionTier: workspace.subscriptionTier,
        },
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({
        message: error.message || 'Registration failed. Please try again.',
      });
    }
  });
  
  // ============================================================================
  // CUSTOM AUTH ENDPOINTS (Email/Password, Magic Links, Password Reset)
  // ============================================================================

  // Login with email/password
  app.post('/api/auth/login', async (req: Request, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const { authService } = await import('./services/authService');
      const result = await authService.login(
        email,
        password,
        req.ip || req.socket?.remoteAddress,
        req.get('user-agent')
      );

      if (!result.success) {
        const status = result.code === 'ACCOUNT_LOCKED' ? 423 : 401;
        return res.status(status).json({ message: result.error, code: result.code });
      }

      // Set HttpOnly cookie for session token
      res.cookie('auth_token', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      // Also set up express session for compatibility
      if (result.user) {
        req.session.userId = result.user.id;
        req.session.passport = {
          user: {
            claims: {
              sub: result.user.id,
              email: result.user.email,
              first_name: result.user.firstName,
              last_name: result.user.lastName,
            },
            expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
          },
        };
        await new Promise<void>((resolve, reject) => {
          req.session.save((err: any) => err ? reject(err) : resolve());
        });
      }

      res.json({
        success: true,
        user: result.user,
      });
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  });

  // Logout current session
  app.post('/api/auth/logout', async (req: Request, res) => {
    try {
      const authToken = req.cookies?.auth_token;
      
      if (authToken) {
        const { authService } = await import('./services/authService');
        await authService.logout(authToken);
      }

      // Clear cookie
      res.clearCookie('auth_token', { path: '/' });

      // Destroy express session
      req.session.destroy((err) => {
        if (err) console.error('[Auth] Session destroy error:', err);
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Auth] Logout error:', error);
      res.status(500).json({ message: 'Logout failed' });
    }
  });

  // Logout all sessions
  app.post('/api/auth/logout-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const { authService } = await import('./services/authService');
      await authService.logoutAllSessions(userId);

      // Clear current cookie
      res.clearCookie('auth_token', { path: '/' });

      // Destroy express session
      req.session.destroy((err) => {
        if (err) console.error('[Auth] Session destroy error:', err);
      });

      res.json({ success: true, message: 'All sessions logged out' });
    } catch (error: any) {
      console.error('[Auth] Logout all error:', error);
      res.status(500).json({ message: 'Failed to logout all sessions' });
    }
  });

  // Request password reset
  app.post('/api/auth/forgot-password', async (req: Request, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const { authService } = await import('./services/authService');
      await authService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      res.json({ success: true, message: 'If an account exists, a reset link has been sent' });
    } catch (error: any) {
      console.error('[Auth] Forgot password error:', error);
      res.status(500).json({ message: 'Failed to process request' });
    }
  });

  // Reset password with token
  app.post('/api/auth/reset-password', async (req: Request, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: 'Token and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      const { authService } = await import('./services/authService');
      const result = await authService.resetPassword(token, password);

      if (!result.success) {
        return res.status(400).json({ message: result.error, code: result.code });
      }

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error: any) {
      console.error('[Auth] Reset password error:', error);
      res.status(500).json({ message: 'Failed to reset password' });
    }
  });

  // Verify email with token
  app.get('/api/auth/verify-email', async (req: Request, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Token is required' });
      }

      const { authService } = await import('./services/authService');
      const result = await authService.verifyEmail(token);

      if (!result.success) {
        return res.status(400).json({ message: result.error, code: result.code });
      }

      res.json({ success: true, message: 'Email verified successfully', user: result.user });
    } catch (error: any) {
      console.error('[Auth] Verify email error:', error);
      res.status(500).json({ message: 'Failed to verify email' });
    }
  });

  // Resend verification email
  app.post('/api/auth/resend-verification', async (req: Request, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const { authService } = await import('./services/authService');
      await authService.resendVerification(email);

      // Always return success to prevent email enumeration
      res.json({ success: true, message: 'If an account exists and is unverified, a verification link has been sent' });
    } catch (error: any) {
      console.error('[Auth] Resend verification error:', error);
      res.status(500).json({ message: 'Failed to resend verification' });
    }
  });

  // Request magic link
  app.post('/api/auth/magic-link', async (req: Request, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const { authService } = await import('./services/authService');
      await authService.requestMagicLink(email);

      // Always return success to prevent email enumeration
      res.json({ success: true, message: 'If an account exists, a magic link has been sent' });
    } catch (error: any) {
      console.error('[Auth] Magic link request error:', error);
      res.status(500).json({ message: 'Failed to send magic link' });
    }
  });

  // Verify magic link
  app.get('/api/auth/magic-link/verify', async (req: Request, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Token is required' });
      }

      const { authService } = await import('./services/authService');
      const result = await authService.verifyMagicLink(
        token,
        req.ip || req.socket?.remoteAddress,
        req.get('user-agent')
      );

      if (!result.success) {
        return res.status(400).json({ message: result.error, code: result.code });
      }

      // Set HttpOnly cookie for session token
      res.cookie('auth_token', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      // Also set up express session for compatibility
      if (result.user) {
        req.session.userId = result.user.id;
        req.session.passport = {
          user: {
            claims: {
              sub: result.user.id,
              email: result.user.email,
              first_name: result.user.firstName,
              last_name: result.user.lastName,
            },
            expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
          },
        };
        await new Promise<void>((resolve, reject) => {
          req.session.save((err: any) => err ? reject(err) : resolve());
        });
      }

      res.json({ success: true, user: result.user });
    } catch (error: any) {
      console.error('[Auth] Magic link verify error:', error);
      res.status(500).json({ message: 'Failed to verify magic link' });
    }
  });

  // Change password (authenticated)
  app.post('/api/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new password are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters' });
      }

      const { authService } = await import('./services/authService');
      const result = await authService.changePassword(userId, currentPassword, newPassword);

      if (!result.success) {
        return res.status(400).json({ message: result.error, code: result.code });
      }

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      console.error('[Auth] Change password error:', error);
      res.status(500).json({ message: 'Failed to change password' });
    }
  });

  // Validate session (for custom auth token)
  app.get('/api/auth/session', async (req: Request, res) => {
    try {
      const authToken = req.cookies?.auth_token;

      if (!authToken) {
        return res.status(401).json({ authenticated: false, message: 'No session' });
      }

      const { authService } = await import('./services/authService');
      const result = await authService.validateSession(authToken);

      if (!result.success) {
        res.clearCookie('auth_token', { path: '/' });
        return res.status(401).json({ authenticated: false, message: result.error });
      }

      res.json({ authenticated: true, user: result.user });
    } catch (error: any) {
      console.error('[Auth] Session validation error:', error);
      res.status(500).json({ authenticated: false, message: 'Session validation failed' });
    }
  });

  // Simple registration (without org creation - for individual users)
  app.post('/api/auth/register-simple', async (req: Request, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      const { authService } = await import('./services/authService');
      const result = await authService.register(email, password, firstName, lastName);

      if (!result.success) {
        const status = result.code === 'EMAIL_EXISTS' ? 409 : 400;
        return res.status(status).json({ message: result.error, code: result.code });
      }

      res.status(201).json({
        success: true,
        message: 'Account created. Please check your email to verify your account.',
        user: result.user,
      });
    } catch (error: any) {
      console.error('[Auth] Simple registration error:', error);
      res.status(500).json({ message: 'Registration failed' });
    }
  });

  // ============================================================================

  // Alias routes for backwards compatibility
  app.post("/api/auth/reset-password-request", async (req: Request, res) => {
    // Forward to forgot-password endpoint
    const { authService } = await import("./services/authService");
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      await authService.requestPasswordReset(email);
      return res.json({ success: true, message: "If an account exists, a reset link has been sent" });
    } catch (error: any) {
      console.error("Password reset error:", error);
      return res.json({ success: true, message: "If an account exists, a reset link has been sent" });
    }
  });

  app.post("/api/auth/reset-password-confirm", async (req: Request, res) => {
    // Forward to reset-password endpoint
    const { authService } = await import("./services/authService");
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
      }
      const result = await authService.resetPassword(token, password);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      return res.json({ success: true, message: "Password reset successful" });
    } catch (error: any) {
      console.error("Password reset confirm error:", error);
      return res.status(400).json({ message: "Password reset failed" });
    }
  });
  // END CUSTOM AUTH ENDPOINTS
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {

    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user profile - supports both Replit Auth and custom session auth
  app.patch('/api/auth/profile', async (req: any, res) => {
    try {
      // Support both Replit Auth (req.user.claims.sub) and custom auth (req.session.userId)
      let userId: string | null = null;
      
      if (req.user?.claims?.sub) {
        // Replit Auth
        userId = req.user.claims.sub;
      } else if (req.session?.userId) {
        // Custom session auth
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { firstName, lastName } = req.body;

      // Validation
      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }

      // Update user profile
      const updatedUser = await storage.updateUser(userId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        updatedAt: new Date(),
      });

      res.json({ 
        success: true, 
        message: "Profile updated successfully",
        user: updatedUser 
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ============================================================================
  // MULTI-FACTOR AUTHENTICATION (MFA) ROUTES - WITH RBAC
  // ============================================================================

  // Get MFA status for current user
  app.get('/api/auth/mfa/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const status = await checkMfaStatus(userId);
      res.json(status);
    } catch (error) {
      console.error("Error checking MFA status:", error);
      res.status(500).json({ message: "Failed to check MFA status" });
    }
  });

  // Setup MFA - Generate secret and QR code
  app.post('/api/auth/mfa/setup', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const userEmail = req.user!.email || '';

      if (!userEmail) {
        return res.status(400).json({ message: "Email required for MFA setup" });
      }

      const mfaSetup = await generateMfaSecret(userId, userEmail);
      res.json({
        success: true,
        qrCodeUrl: mfaSetup.qrCodeUrl,
        backupCodes: mfaSetup.backupCodes,
      });
    } catch (error) {
      console.error("Error setting up MFA:", error);
      res.status(500).json({ message: "Failed to setup MFA" });
    }
  });

  // Enable MFA - Verify first token and activate
  app.post('/api/auth/mfa/enable', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ message: "Token required" });
      }

      // Verify the token
      const verification = await verifyMfaToken(userId, token);

      if (!verification.valid) {
        return res.status(400).json({ message: "Invalid token" });
      }

      // Enable MFA
      await enableMfa(userId);

      res.json({
        success: true,
        message: "MFA enabled successfully",
      });
    } catch (error) {
      console.error("Error enabling MFA:", error);
      res.status(500).json({ message: "Failed to enable MFA" });
    }
  });

  // Verify MFA token during login (public endpoint for login flow)
  app.post('/api/auth/mfa/verify', async (req: any, res) => {
    try {
      const { userId, token } = req.body;

      if (!userId || !token) {
        return res.status(400).json({ message: "User ID and token required" });
      }

      const verification = await verifyMfaToken(userId, token);

      if (!verification.valid) {
        return res.status(400).json({ message: "Invalid token" });
      }

      res.json({
        success: true,
        isBackupCode: verification.isBackupCode || false,
      });
    } catch (error) {
      console.error("Error verifying MFA token:", error);
      res.status(500).json({ message: "Failed to verify token" });
    }
  });

  // Disable MFA - Requires password OR MFA token confirmation
  app.post('/api/auth/mfa/disable', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { password, token } = req.body;

      if (!password && !token) {
        return res.status(400).json({ 
          message: "Password or MFA token required to disable MFA" 
        });
      }

      // Option 1: Verify with password (for password-based accounts)
      if (password) {
        const user = await storage.getUser(userId);
        if (!user?.passwordHash) {
          return res.status(400).json({ 
            message: "Password authentication not available. Use MFA token instead." 
          });
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          return res.status(400).json({ message: "Invalid password" });
        }
      }

      // Option 2: Verify with MFA token (for OIDC/social accounts)
      if (token && !password) {
        const verification = await verifyMfaToken(userId, token);
        if (!verification.valid) {
          return res.status(400).json({ message: "Invalid MFA token" });
        }
      }

      // Disable MFA after successful verification
      await disableMfa(userId);

      res.json({
        success: true,
        message: "MFA disabled successfully",
      });
    } catch (error) {
      console.error("Error disabling MFA:", error);
      res.status(500).json({ message: "Failed to disable MFA" });
    }
  });

  // Regenerate backup codes
  app.post('/api/auth/mfa/regenerate-backup-codes', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const newBackupCodes = await regenerateBackupCodes(userId);

      res.json({
        success: true,
        backupCodes: newBackupCodes,
      });
    } catch (error) {
      console.error("Error regenerating backup codes:", error);
      res.status(500).json({ message: "Failed to regenerate backup codes" });
    }
  });

  // Demo login route - bypasses authentication for demo workspace
  // ⚠️  SECURITY: Grants full org_owner + enterprise access for E2E testing
  // Only enabled in development. Production access blocked for security.
  app.get('/api/demo-login', async (req: any, res) => {
    // Block demo login in production environments
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  Demo login blocked in production environment');
      return res.status(403).json({ 
        message: "Demo login is disabled in production for security reasons." 
      });
    }

    try {
      const DEMO_USER_ID = "demo-user-00000000";
      
      // Check if demo user exists, create if not
      let demoUser = await storage.getUser(DEMO_USER_ID);
      if (!demoUser) {
        // Seed demo workspace
        const { seedDemoWorkspace } = await import("./seed-demo");
        await seedDemoWorkspace();
        demoUser = await storage.getUser(DEMO_USER_ID);
      }

      // Support BOTH auth systems (custom auth + Replit Auth)
      // Custom auth format (requireAuth middleware expects this)
      req.session.userId = DEMO_USER_ID;
      
      // Replit Auth format (isAuthenticated middleware expects this)
      // Include OIDC fields that isAuthenticated checks for
      req.session.passport = {
        user: {
          claims: {
            sub: DEMO_USER_ID,
            email: "demo@shiftsync.app",
            first_name: "Demo",
            last_name: "User"
          },
          // OIDC token fields required by isAuthenticated middleware
          expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
          refresh_token: "demo-refresh-token", // Dummy token for demo
        }
      };

      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      console.log('✅ Workspace demo login successful (org_owner)');
      // Redirect to dashboard
      res.redirect('/dashboard');
    } catch (error) {
      console.error("Error in demo login:", error);
      res.status(500).json({ message: "Failed to start demo" });
    }
  });

  // Platform Staff Demo Login - separate endpoint for security clarity
  // ⚠️  SECURITY: Grants root_admin platform access for E2E testing  
  // Only enabled in development. Production access blocked for security.
  app.get('/api/demo-login-platform', async (req: any, res) => {
    // Block demo login in production environments
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  Platform demo login blocked in production environment');
      return res.status(403).json({ 
        message: "Platform demo login is disabled in production for security reasons." 
      });
    }

    try {
      const ROOT_USER_ID = 'root-user-00000000';
      
      // Ensure root user exists with platform role
      const { seedRootUser } = await import("./seed-root-user");
      await seedRootUser();
      
      // Seed Platform workspace for anonymous HelpAI users
      const { seedPlatformWorkspace } = await import("./seed-platform-workspace");
      await seedPlatformWorkspace();
      
      const rootUser = await storage.getUser(ROOT_USER_ID);
      if (!rootUser) {
        throw new Error('Failed to create root user');
      }
      
      // Support BOTH auth systems (custom auth + Replit Auth)
      req.session.userId = ROOT_USER_ID;
      
      req.session.passport = {
        user: {
          claims: {
            sub: ROOT_USER_ID,
            email: "root@getdc360.com",
            first_name: "Root",
            last_name: "Administrator"
          },
          expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
          refresh_token: "root-refresh-token",
        }
      };
      
      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });
      
      console.log('✅ Platform staff demo login successful (root_admin)');
      res.redirect('/root-admin-dashboard');
    } catch (error) {
      console.error("Error in platform demo login:", error);
      res.status(500).json({ message: "Failed to start platform demo" });
    }
  });

  // ============================================================================
  // COMPANY REPORTS & ANALYTICS (Manager/Owner Access)
  // ============================================================================
  
  // Generate company report with aggregated data
  app.post('/api/reports/generate', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { reportType, startDate, endDate } = req.body;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      const workspaceId = workspace.id;

      let reportData: any = {};

      switch (reportType) {
        case 'payroll-summary':
          // Aggregate payroll data
          const payrollRuns = await db
            .select()
            .from(payrollRuns)
            .where(
              and(
                eq(payrollRuns.workspaceId, workspaceId),
                gte(payrollRuns.periodStart, new Date(startDate)),
                lte(payrollRuns.periodEnd, new Date(endDate))
              )
            );
          
          reportData = {
            totalPayroll: payrollRuns.reduce((sum, r) => sum + parseFloat(r.totalNetPay || '0'), 0),
            payrollCount: payrollRuns.length,
            details: payrollRuns.map(r => ({
              name: `Payroll Run ${format(new Date(r.periodStart), 'MMM d')} - ${format(new Date(r.periodEnd), 'MMM d')}`,
              value: `$${parseFloat(r.totalNetPay || '0').toFixed(2)}`,
              details: `${r.status} - Processed ${r.processedAt ? format(new Date(r.processedAt), 'MMM d, yyyy') : 'N/A'}`,
              badge: r.status,
            })),
          };
          break;

        case 'time-tracking':
          const timeEntries = await db
            .select()
            .from(timeEntriesTable)
            .where(
              and(
                eq(timeEntriesTable.workspaceId, workspaceId),
                gte(timeEntriesTable.clockIn, new Date(startDate)),
                lte(timeEntriesTable.clockIn, new Date(endDate))
              )
            );
          
          reportData = {
            totalHours: timeEntries.reduce((sum, e) => sum + parseFloat(e.totalHours?.toString() || '0'), 0),
            activeEmployees: new Set(timeEntries.map(e => e.employeeId)).size,
            details: Object.entries(
              timeEntries.reduce((acc: any, e) => {
                if (!acc[e.employeeId]) acc[e.employeeId] = { hours: 0, count: 0 };
                acc[e.employeeId].hours += parseFloat(e.totalHours?.toString() || '0');
                acc[e.employeeId].count++;
                return acc;
              }, {})
            ).map(([empId, data]: [string, any]) => ({
              name: `Employee ${empId}`,
              value: `${data.hours.toFixed(2)} hrs`,
              details: `${data.count} time entries`,
            })),
          };
          break;

        case 'invoicing':
          const invoices = await db
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.workspaceId, workspaceId),
                gte(invoices.createdAt, new Date(startDate)),
                lte(invoices.createdAt, new Date(endDate))
              )
            );
          
          reportData = {
            totalRevenue: invoices.reduce((sum, i) => sum + parseFloat(i.total?.toString() || '0'), 0),
            invoiceCount: invoices.length,
            details: invoices.map(i => ({
              name: i.invoiceNumber,
              value: `$${parseFloat(i.total?.toString() || '0').toFixed(2)}`,
              details: `Due ${i.dueDate ? format(new Date(i.dueDate), 'MMM d, yyyy') : 'N/A'}`,
              badge: i.status,
            })),
          };
          break;

        default:
          return res.status(400).json({ message: "Invalid report type" });
      }

      res.json(reportData);
    } catch (error: any) {
      console.error("Error generating report:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // ============================================================================
  // EXPORT FUNCTIONALITY (PDF/CSV/Excel) - Enterprise Feature #3
  // ============================================================================

  // Export invoice as PDF
  app.get('/api/invoices/:id/pdf', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Get workspace from user (support both OIDC and Custom Auth)
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Get invoice with line items
      const invoice = await storage.getInvoice(id, workspace.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const lineItems = await storage.getInvoiceLineItems(id);
      const client = invoice.clientId ? await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1) : null;

      // Create PDF
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
      
      doc.pipe(res);

      // Header
      doc.fontSize(24).text(workspace.companyName || 'CoAIleague', { align: 'center' });
      doc.fontSize(10).text(workspace.address || '', { align: 'center' });
      doc.moveDown();
      
      // Invoice title
      doc.fontSize(20).text(`INVOICE #${invoice.invoiceNumber}`, { align: 'center' });
      doc.moveDown();

      // Client & dates
      doc.fontSize(12).text(`Bill To: ${client?.[0]?.name || 'N/A'}`, 50, 150);
      doc.text(`Date: ${invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'MM/dd/yyyy') : 'N/A'}`, 350, 150);
      doc.text(`Due: ${invoice.dueDate ? format(new Date(invoice.dueDate), 'MM/dd/yyyy') : 'N/A'}`, 350, 165);
      doc.text(`Status: ${invoice.status?.toUpperCase() || 'PENDING'}`, 350, 180);
      doc.moveDown(3);

      // Line items table
      const tableTop = 220;
      doc.fontSize(10).text('Description', 50, tableTop);
      doc.text('Qty', 300, tableTop);
      doc.text('Rate', 350, tableTop);
      doc.text('Amount', 450, tableTop, { align: 'right' });
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      let y = tableTop + 25;
      lineItems.forEach((item: any) => {
        doc.text(item.description || 'Service', 50, y);
        doc.text(item.quantity?.toString() || '1', 300, y);
        doc.text(`$${item.rate || '0.00'}`, 350, y);
        doc.text(`$${item.amount || '0.00'}`, 450, y, { align: 'right' });
        y += 20;
      });

      // Totals
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 15;
      doc.fontSize(12).text('Subtotal:', 350, y);
      doc.text(`$${invoice.subtotal}`, 450, y, { align: 'right' });
      y += 20;
      doc.text('Tax:', 350, y);
      doc.text(`$${invoice.taxAmount || '0.00'}`, 450, y, { align: 'right' });
      y += 20;
      doc.fontSize(14).text('TOTAL:', 350, y);
      doc.text(`$${invoice.total}`, 450, y, { align: 'right' });

      doc.end();
    } catch (error: any) {
      console.error("Error generating invoice PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Export payroll report as CSV
  app.get('/api/payroll/export/csv', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const workspaceId = workspace.id;
      const { startDate, endDate } = req.query;

      // Get payroll runs
      const runs = await db.select().from(payrollRuns)
        .where(eq(payrollRuns.workspaceId, workspaceId))
        .orderBy(desc(payrollRuns.createdAt));

      // Get all payroll entries
      const entries = await db.select({
        id: payrollEntries.id,
        employeeId: payrollEntries.employeeId,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        regularHours: payrollEntries.regularHours,
        overtimeHours: payrollEntries.overtimeHours,
        hourlyRate: payrollEntries.hourlyRate,
        grossPay: payrollEntries.grossPay,
        federalTax: payrollEntries.federalTax,
        stateTax: payrollEntries.stateTax,
        socialSecurity: payrollEntries.socialSecurity,
        medicare: payrollEntries.medicare,
        netPay: payrollEntries.netPay,
        createdAt: payrollEntries.createdAt,
      })
        .from(payrollEntries)
        .leftJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
        .where(eq(payrollEntries.workspaceId, workspaceId));

      // Generate CSV
      const csvHeader = 'Employee ID,Period Start,Period End,Regular Hours,Overtime Hours,Hourly Rate,Gross Pay,Federal Tax,State Tax,Social Security,Medicare,Net Pay,Date\n';
      const csvRows = entries.map((e: any) => 
        `${e.employeeId},${e.periodStart || ''},${e.periodEnd || ''},${e.regularHours},${e.overtimeHours},${e.hourlyRate},${e.grossPay},${e.federalTax},${e.stateTax},${e.socialSecurity},${e.medicare},${e.netPay},${format(new Date(e.createdAt), 'yyyy-MM-dd')}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payroll-export-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
      res.send(csvHeader + csvRows);
    } catch (error: any) {
      console.error("Error exporting payroll CSV:", error);
      res.status(500).json({ message: "Failed to export payroll" });
    }
  });

  // Export time entries as CSV
  app.get('/api/time-entries/export/csv', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const workspaceId = workspace.id;
      const { startDate, endDate, clientId } = req.query;

      let query = db.select().from(timeEntriesTable).where(eq(timeEntriesTable.workspaceId, workspaceId));

      const entries = await query.orderBy(desc(timeEntriesTable.clockIn));

      // Generate CSV
      const csvHeader = 'Employee ID,Client ID,Clock In,Clock Out,Total Hours,Hourly Rate,Total Amount,Status,Billable\n';
      const csvRows = entries.map((e: any) => 
        `${e.employeeId},${e.clientId || ''},${format(new Date(e.clockIn), 'yyyy-MM-dd HH:mm')},${e.clockOut ? format(new Date(e.clockOut), 'yyyy-MM-dd HH:mm') : ''},${e.totalHours || ''},${e.hourlyRate || ''},${e.totalAmount || ''},${e.status || 'pending'},${e.billableToClient ? 'Yes' : 'No'}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="time-entries-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
      res.send(csvHeader + csvRows);
    } catch (error: any) {
      console.error("Error exporting time entries CSV:", error);
      res.status(500).json({ message: "Failed to export time entries" });
    }
  });

  // Share report via workflow
  app.post('/api/reports/share', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { reportType, startDate, endDate, recipients, notes } = req.body;
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Create workflow notification for each recipient
      for (const email of recipients) {
        // Log audit trail
        const reportId = `${reportType}-${new Date().getTime()}`;
        await storage.createAuditLog({
          workspaceId,
          userId,
          action: 'report_shared',
          entityType: 'company_report',
          entityId: reportId,
          metadata: {
            reportType,
            startDate,
            endDate,
            recipient: email,
            notes,
          },
        });

        // Send email notification with report link
        await emailService.sendReportDelivery(
          workspaceId,
          email,
          {
            reportNumber: reportId,
            reportTitle: reportType.replace(/_/g, ' ').toUpperCase(),
            clientName: email.split('@')[0],
          }
        ).catch(err => console.error(`[REPORT WORKFLOW] Failed to send report email to ${email}:`, err.message));
        
        console.log(`[REPORT WORKFLOW] Shared ${reportType} report to ${email}`);
      }

      res.json({
        success: true,
        message: `Report shared with ${recipients.length} recipient(s)`,
      });
    } catch (error: any) {
      console.error("Error sharing report:", error);
      res.status(500).json({ message: "Failed to share report" });
    }
  });

  // ============================================================================
  // WORKSPACE ROUTES
  // ============================================================================

  // Security helper: Redact sensitive admin fields from workspace for non-root users
  function redactSensitiveWorkspaceFields(workspace: any, platformRole?: string): any {
    // ROOT users can see everything
    if (platformRole === 'root_admin') {
      return workspace;
    }

    // For non-root users, remove sensitive admin/billing fields
    const {
      admin_notes,
      admin_flags,
      billing_override_type,
      billing_override_discount_percent,
      billing_override_custom_price,
      billing_override_reason,
      billing_override_applied_by,
      billing_override_applied_at,
      billing_override_expires_at,
      last_admin_action,
      last_admin_action_by,
      last_admin_action_at,
      ...safeWorkspace
    } = workspace;

    return safeWorkspace;
  }
  
  // Get or create workspace for current user
  app.get('/api/workspace', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // First try to get user's current workspace (the one they're actively using)
      const user = await storage.getUser(userId);
      let workspace = null;
      
      if (user?.currentWorkspaceId) {
        workspace = await storage.getWorkspace(user.currentWorkspaceId);
      }
      
      // Fallback to workspace they own
      if (!workspace) {
        workspace = await storage.getWorkspaceByOwnerId(userId);
      }
      
      // Auto-create workspace on first login if none exists
      if (!workspace) {
        workspace = await storage.createWorkspace({
          name: `${user?.firstName || user?.email || 'My'}'s Workspace`,
          ownerId: userId,
        });
        
        // Create employee record for owner with org_owner role (if not exists)
        const existingEmployee = await storage.getEmployeeByUserId(userId, workspace.id);
        if (!existingEmployee) {
          await storage.createEmployee({
            userId: userId,
            workspaceId: workspace.id,
            email: user.email,
            firstName: user.firstName || 'Owner',
            lastName: user.lastName || '',
            workspaceRole: 'org_owner',
            isActive: true,
          });
          console.log(`[Workspace Auto-Create] Created employee with org_owner role for user ${userId}`);
        } else if (!existingEmployee.workspaceRole || existingEmployee.workspaceRole !== 'org_owner') {
          // Fix existing employee missing org_owner role
          await storage.updateEmployee(existingEmployee.id, { workspaceRole: 'org_owner' });
          console.log(`[Workspace Auto-Create] Fixed org_owner role for existing employee ${existingEmployee.id}`);
        }
        
        // Clear historical platform updates for new workspace owner (UNS fresh start)
        const { onboardingOrchestrator } = await import('./services/ai-brain/subagents/onboardingOrchestrator');
        onboardingOrchestrator.clearPlatformUpdatesForNewUser(userId, workspace.id)
          .then(count => count > 0 && console.log(`[UNS] Cleared ${count} platform updates for new workspace owner ${userId}`))
          .catch(err => console.error('[UNS] Failed to clear platform updates:', err));
      }
      
      // Get organization external ID (ORG-XXXX)
      const [orgIdentifier] = await db
        .select()
        .from(externalIdentifiers)
        .where(
          and(
            eq(externalIdentifiers.entityType, 'org'),
            eq(externalIdentifiers.entityId, workspace.id)
          )
        )
        .limit(1);
      
      // Security: Redact sensitive fields for non-root users
      const platformRole = (req as any).platformRole;
      const safeWorkspace = redactSensitiveWorkspaceFields(workspace, platformRole);
      
      res.json({
        ...safeWorkspace,
        orgCode: orgIdentifier?.externalId || null,
      });
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  // Reactivate workspace subscription (org owner only)
  app.post("/api/workspace/reactivate", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;

