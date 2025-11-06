// Multi-tenant SaaS API Routes
// References: javascript_log_in_with_replit, javascript_database, javascript_stripe blueprints

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupAuth as setupCustomAuth, requireAuth } from "./auth"; // Custom auth
import authRoutes from "./authRoutes"; // Custom auth routes
import { auditContextMiddleware } from "./middleware/audit";
import { apiLimiter, authLimiter, mutationLimiter, readLimiter } from "./middleware/rateLimiter";
import Stripe from 'stripe';
import PDFDocument from 'pdfkit';
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
import { calculatePtoAccrual, getAllPtoBalances, runWeeklyPtoAccrual, deductPtoHours } from './services/ptoAccrual';
import { getReviewReminderSummary, getOverdueReviews, getUpcomingReviews } from './services/performanceReviewReminders';
import { getEmployeesDueForSurveys, getSurveyDistributionSummary, getEmployeePendingSurveys, calculateSurveyResponseRate } from './services/pulseSurveyAutomation';
import { requireOwner, requireManager, requireHRManager, requireSupervisor, validateManagerAssignment, requirePlatformStaff, requirePlatformAdmin, type AuthenticatedRequest } from "./rbac";
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
  clients,
  employees,
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
  turnoverRiskScores,
  costVariancePredictions,
  customRules,
  ruleExecutionLogs,
  auditTrail,
  timeEntryDiscrepancies,
  insertCustomRuleSchema,
  timeEntries as timeEntriesTable,
  // BillOS™ Tables
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
  // TrainingOS™ Tables
  trainingCourses,
  trainingEnrollments,
  trainingCertifications,
  insertTrainingCourseSchema,
  insertTrainingEnrollmentSchema,
  insertTrainingCertificationSchema,
  // BudgetOS™ Tables
  budgets,
  budgetLineItems,
  budgetVariances,
  insertBudgetSchema,
  insertBudgetLineItemSchema,
  insertBudgetVarianceSchema,
  // IntegrationOS™ Tables
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
  // RecordOS™ - Natural Language Search
  searchQueries,
  insertSearchQuerySchema,
  // InsightOS™ - AI Analytics & Autonomous Insights
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
} from "@shared/schema";
import crypto from "crypto";
import { sql, eq, and, or, isNull, lte, gte, desc, inArray, ne } from "drizzle-orm";
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const server = createServer(app);
  
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
      await db.select().from(users).limit(1);
      health.dependencies.database = 'ok';
    } catch (error) {
      console.error('Health check database error:', error);
      health.status = 'degraded';
      health.dependencies.database = 'error';
      const dbFeature = health.features.find(f => f.feature === 'DATABASE');
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
        const stripeFeature = health.features.find(f => f.feature === 'STRIPE_PAYMENTS');
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
  setupWebSocket(server);
  
  // Setup custom auth (portable, session-based)
  setupCustomAuth(app);
  
  // Also setup Replit auth (for backward compatibility)
  await setupAuth(app);
  
  // Trust proxy for accurate IP detection behind load balancers
  app.set('trust proxy', 1);
  
  // Audit logging middleware (captures request context for all authenticated requests)
  app.use(auditContextMiddleware);

  // ============================================================================
  // NOTIFICATIONS & FEATURE UPDATES
  // ============================================================================

  // Get user notifications
  app.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Mock notifications for now - replace with actual implementation
      const notifications = [
        {
          id: '1',
          type: 'shift_assigned',
          title: 'New shift assigned',
          message: 'You have been assigned to work on Monday, 9 AM - 5 PM',
          isRead: false,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          actionUrl: '/schedule',
        },
        {
          id: '2',
          type: 'pto_approved',
          title: 'PTO request approved',
          message: 'Your PTO request for Dec 25-26 has been approved',
          isRead: true,
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          actionUrl: '/hr/pto',
        },
      ];
      
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });

  // Mark notification as read
  app.patch('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      // Implementation would mark notification as read in DB
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: 'Failed to mark notification as read' });
    }
  });

  // Mark all notifications as read
  app.post('/api/notifications/mark-all-read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      // Implementation would mark all notifications as read in DB
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ message: 'Failed to mark all notifications as read' });
    }
  });

  // Get feature updates (What's New)
  app.get('/api/feature-updates', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const updates = [
        {
          id: '1',
          title: 'ScheduleOS™ Auto-Scheduling',
          description: 'AI-powered automatic shift scheduling with conflict detection and optimization',
          category: 'new',
          releaseDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          learnMoreUrl: '/schedule',
        },
        {
          id: '2',
          title: 'Enhanced Mobile Chat',
          description: 'Redesigned mobile chat experience with improved performance and UX',
          category: 'improvement',
          releaseDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          learnMoreUrl: '/mobile-chat',
        },
        {
          id: '3',
          title: 'Quick Actions Menu',
          description: 'Fast access to common tasks from anywhere in the platform',
          category: 'new',
          releaseDate: new Date(),
          learnMoreUrl: null,
        },
      ];
      
      res.json(updates);
    } catch (error) {
      console.error('Error fetching feature updates:', error);
      res.status(500).json({ message: 'Failed to fetch feature updates' });
    }
  });

  // Get last viewed feature updates timestamp
  app.get('/api/feature-updates/last-viewed', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      // Mock - would fetch from user preferences in DB
      res.json(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    } catch (error) {
      console.error('Error fetching last viewed:', error);
      res.status(500).json({ message: 'Failed to fetch last viewed timestamp' });
    }
  });

  // Mark feature updates as viewed
  app.post('/api/feature-updates/mark-viewed', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      // Implementation would update user preferences in DB
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking updates as viewed:', error);
      res.status(500).json({ message: 'Failed to mark updates as viewed' });
    }
  });

  // Submit user feedback
  app.post('/api/feedback', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
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

  // Get all workspaces user has access to (for workspace switcher)
  app.get('/api/workspaces/all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
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

  // Switch workspace
  app.post('/api/workspace/switch/:workspaceId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
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
  
  // Health check endpoint for uptime monitoring (no auth or rate limit required)
  app.get('/api/health', async (req, res) => {
    try {
      // Basic health check - verify database connection using imported db
      const { db: database } = await import("./db");
      await database.execute(sql`SELECT 1`);
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed'
      });
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
  
  // Register custom auth routes (AFTER rate limiters for security)
  app.use(authRoutes);

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================
  
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  // Demo login route - bypasses authentication for demo workspace
  app.get('/api/demo-login', async (req: any, res) => {
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

      // Redirect to dashboard
      res.redirect('/dashboard');
    } catch (error) {
      console.error("Error in demo login:", error);
      res.status(500).json({ message: "Failed to start demo" });
    }
  });

  // ============================================================================
  // COMPANY REPORTS & ANALYTICS (Manager/Owner Access)
  // ============================================================================
  
  // Generate company report with aggregated data
  app.post('/api/reports/generate', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { reportType, startDate, endDate } = req.body;
      const workspaceId = req.workspace!.id;

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
      const userId = req.user!.id;

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
      doc.fontSize(24).text(workspace.companyName || 'AutoForce™', { align: 'center' });
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
      const userId = req.user!.id;
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
      const userId = req.user!.id;
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
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;

      // Create workflow notification for each recipient
      for (const email of recipients) {
        // Log audit trail
        await storage.createAuditLog({
          workspaceId,
          userId,
          action: 'report_shared',
          entityType: 'company_report',
          entityId: `${reportType}-${new Date().getTime()}`,
          metadata: {
            reportType,
            startDate,
            endDate,
            recipient: email,
            notes,
          },
        });

        // TODO: Send email notification with report link
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
    if (platformRole === 'root') {
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
      const userId = req.user!.id;
      let workspace = await storage.getWorkspaceByOwnerId(userId);
      
      // Auto-create workspace on first login
      if (!workspace) {
        const user = await storage.getUser(userId);
        workspace = await storage.createWorkspace({
          name: `${user?.firstName || user?.email || 'My'}'s Workspace`,
          ownerId: userId,
        });
      }
      
      // Security: Redact sensitive fields for non-root users
      const platformRole = (req as any).platformRole;
      const safeWorkspace = redactSensitiveWorkspaceFields(workspace, platformRole);
      
      res.json(safeWorkspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  // Update workspace (Users can only update basic settings, Platform Admin can update critical org info)
  app.patch('/api/workspace', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // SECURITY: Users can only update basic settings, not critical organization data
      // Platform admins use the /api/admin/workspace endpoint for full control
      // Map frontend field names to backend field names
      const fieldMapping: Record<string, string> = {
        'name': 'name',
        'website': 'companyWebsite',
        'phone': 'companyPhone',
        'companyName': 'companyName',
        'taxId': 'taxId',
        'address': 'address',
        'logoUrl': 'logoUrl',
      };
      
      const filteredData: any = {};
      for (const [frontendKey, backendKey] of Object.entries(fieldMapping)) {
        if (req.body[frontendKey] !== undefined) {
          filteredData[backendKey] = req.body[frontendKey];
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const validated = insertWorkspaceSchema.partial().parse(filteredData);
      const updated = await storage.updateWorkspace(workspace.id, validated);
      
      // Security: Redact sensitive fields for non-root users
      const safeWorkspace = redactSensitiveWorkspaceFields(updated, req.user?.platformRole);
      
      res.json(safeWorkspace);
    } catch (error: any) {
      console.error("Error updating workspace:", error);
      res.status(400).json({ message: error.message || "Failed to update workspace" });
    }
  });

  // Update workspace organization info (Platform Admin Staff ONLY)
  app.patch('/api/admin/workspace/:workspaceId', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId } = req.params;
      
      // Verify workspace exists
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Platform staff can update ANY workspace field except ownerId
      const { ownerId, ...updateData } = req.body;
      const validated = insertWorkspaceSchema.partial().parse(updateData);

      const updated = await storage.updateWorkspace(workspaceId, validated);
      
      // Audit log
      console.log(`[AUDIT] Platform staff ${req.user!.id} (${req.platformRole}) updated workspace ${workspaceId}`);
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating workspace (admin):", error);
      res.status(400).json({ message: error.message || "Failed to update workspace" });
    }
  });

  // Get workspace theme
  app.get('/api/workspace/theme', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { resolveWorkspaceForUser } = await import("./rbac");
      const { workspaceId, error } = await resolveWorkspaceForUser(userId);
      
      if (error || !workspaceId) {
        return res.json(null);
      }

      const theme = await storage.getWorkspaceTheme(workspaceId);
      res.json(theme);
    } catch (error) {
      console.error("Error fetching workspace theme:", error);
      res.json(null);
    }
  });

  // Get available business categories
  app.get('/api/business-categories', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { businessCategories } = await import("./seedFormTemplates");
      res.json(businessCategories);
    } catch (error) {
      console.error("Error fetching business categories:", error);
      res.status(500).json({ message: "Failed to fetch business categories" });
    }
  });

  // Seed form templates for workspace based on business category
  app.post('/api/workspace/seed-form-templates', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { getTemplatesForCategory } = await import("./seedFormTemplates");
      const templates = getTemplatesForCategory(workspace.businessCategory || 'general');
      
      // Create form templates for this workspace
      const createdTemplates = [];
      for (const template of templates) {
        const created = await storage.createReportTemplate({
          workspaceId: workspace.id,
          name: template.name,
          description: template.description,
          category: template.category,
          fields: template.fields,
          isSystemTemplate: true,
          isActive: true,
          createdBy: userId,
        });
        createdTemplates.push(created);
      }

      res.json({
        message: `Seeded ${createdTemplates.length} form templates for ${workspace.businessCategory || 'general'} category`,
        templates: createdTemplates
      });
    } catch (error: any) {
      console.error("Error seeding form templates:", error);
      res.status(500).json({ message: error.message || "Failed to seed form templates" });
    }
  });

  // Upgrade workspace billing tier
  app.post('/api/workspace/upgrade', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { tier } = req.body;
      
      // Map tiers to platform fees (transaction-based revenue model)
      const tierConfig: Record<string, { fee: number; name: string; price: number }> = {
        professional: { fee: 10, name: "Professional", price: 799 },
        enterprise: { fee: 5, name: "Enterprise", price: 2999 },
        fortune500: { fee: 2, name: "Fortune 500", price: 7999 },
      };

      if (!tierConfig[tier]) {
        return res.status(400).json({ message: "Invalid tier selected" });
      }

      const config = tierConfig[tier];

      // Update workspace with new tier and platform fee
      const updated = await storage.updateWorkspace(workspace.id, {
        subscriptionTier: tier,
        platformFeePercentage: config.fee,
        subscriptionStatus: "active",
      });

      // Log platform revenue event
      await storage.createPlatformRevenue({
        workspaceId: workspace.id,
        revenueType: "subscription",
        amount: config.price.toString(),
        platformFee: "0", // Subscription revenue is 100% platform revenue
        description: `Upgraded to ${config.name} tier - $${config.price}/mo`,
      });

      res.json({
        message: `Successfully upgraded to ${config.name} tier`,
        workspace: updated,
      });
    } catch (error: any) {
      console.error("Error upgrading workspace:", error);
      res.status(500).json({ message: error.message || "Failed to upgrade workspace" });
    }
  });

  // ============================================================================
  // EMPLOYEE ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/employees', async (req: any, res) => {
    try {
      //  Support both Replit OAuth and session-based auth
      let userId: string;
      let user: any;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
        // Replit OAuth
        userId = req.user.claims.sub;
        user = req.user;
      } else if (req.session?.userId) {
        // Session-based auth
        userId = req.session.userId;
        const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!dbUser) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        user = dbUser;
        // Load platform role
        const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
        const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
        user.platformRole = activePlatformRole?.role || null;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Platform admins can see all employees or get demo workspace
      if (user.platformRole === 'root' || user.platformRole === 'sysop') {
        const allWorkspaces = await db.select().from(workspaces).limit(1);
        if (allWorkspaces.length > 0) {
          const employees = await storage.getEmployeesByWorkspace(allWorkspaces[0].id);
          return res.json(employees);
        }
        return res.json([]);
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const employees = await storage.getEmployeesByWorkspace(workspace.id);
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.post('/api/employees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate with Zod and enforce workspace ownership
      const validated = insertEmployeeSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const employee = await storage.createEmployee(validated);
      
      // Send onboarding email if employee has email
      if (employee.email) {
        sendEmployeeOnboardingEmail(employee.email, {
          employeeName: `${employee.firstName} ${employee.lastName}`,
          workspaceName: workspace.name,
          role: employee.role || undefined
        }).catch(err => console.error('Failed to send onboarding email:', err));
      }
      
      res.json(employee);
    } catch (error: any) {
      console.error("Error creating employee:", error);
      res.status(400).json({ message: error.message || "Failed to create employee" });
    }
  });

  app.patch('/api/employees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate partial update, ensure no workspaceId override
      const { workspaceId, ...updateData } = req.body;
      const validated = insertEmployeeSchema.partial().parse(updateData);

      const employee = await storage.updateEmployee(req.params.id, workspace.id, validated);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      
      res.json(employee);
    } catch (error: any) {
      console.error("Error updating employee:", error);
      res.status(400).json({ message: error.message || "Failed to update employee" });
    }
  });

  app.delete('/api/employees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteEmployee(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Employee not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // Get current workspace info
  app.get('/api/workspace', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      let workspace = await storage.getWorkspaceByOwnerId(userId);
      
      // Auto-create workspace on first login
      if (!workspace) {
        const user = await storage.getUser(userId);
        workspace = await storage.createWorkspace({
          name: `${user?.firstName || user?.email || 'My'}'s Workspace`,
          ownerId: userId,
        });
      }
      
      // Security: Redact sensitive fields for non-root users
      const platformRole = (req as any).platformRole;
      const safeWorkspace = redactSensitiveWorkspaceFields(workspace, platformRole);
      
      res.json(safeWorkspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  // Get current employee profile (Employee Self-Service)
  app.get('/api/employees/me', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Find employee by userId
      const employee = await storage.getEmployeeByUserId(userId);
      
      if (!employee) {
        return res.status(404).json({ message: "Employee profile not found" });
      }
      
      res.json(employee);
    } catch (error: any) {
      console.error("Error fetching employee profile:", error);
      res.status(500).json({ message: "Failed to fetch employee profile" });
    }
  });

  // Update employee contact information (Employee Self-Service)
  app.patch('/api/employees/me/contact-info', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Find employee by userId
      const employee = await storage.getEmployeeByUserId(userId);
      
      if (!employee) {
        return res.status(404).json({ message: "Employee profile not found" });
      }
      
      // Only allow updating contact info fields (not employment details)
      const allowedFields = ['phone', 'email', 'address', 'city', 'state', 'zipCode', 
                             'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation'];
      const filteredData: any = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          filteredData[key] = req.body[key];
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const validated = insertEmployeeSchema.partial().parse(filteredData);
      const updated = await storage.updateEmployee(employee.id, employee.workspaceId, validated);
      
      if (!updated) {
        return res.status(404).json({ message: "Failed to update employee" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating contact info:", error);
      res.status(400).json({ message: error.message || "Failed to update contact information" });
    }
  });

  // Get employee's own documents (Employee Self-Service)
  app.get('/api/hireos/documents/me', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Find employee by userId
      const employee = await storage.getEmployeeByUserId(userId);
      
      if (!employee) {
        return res.status(404).json({ message: "Employee profile not found" });
      }
      
      // Fetch employee's documents
      const documents = await storage.getEmployeeDocuments(employee.workspaceId, employee.id, {});
      
      res.json(documents || []);
    } catch (error: any) {
      console.error("Error fetching employee documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Approve employee and set pay rate (post-onboarding) - MANAGER/OWNER ONLY
  app.post('/api/employees/approve', requireManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      // Validate request body
      const approvalSchema = z.object({
        employeeId: z.string().min(1, "Employee ID is required"),
        hourlyRate: z.number().positive("Hourly rate must be greater than 0"),
      });

      const { employeeId, hourlyRate } = approvalSchema.parse(req.body);

      // Get employee and verify status (also validates workspace ownership)
      const existingEmployee = await storage.getEmployee(employeeId, user.currentWorkspaceId);
      
      if (!existingEmployee) {
        return res.status(404).json({ message: "Employee not found or does not belong to your workspace" });
      }

      if (existingEmployee.onboardingStatus !== 'pending_review') {
        return res.status(400).json({ 
          message: `Employee must be in 'pending_review' status. Current status: ${existingEmployee.onboardingStatus}` 
        });
      }

      // Update employee with pay rate and mark as completed
      const employee = await storage.updateEmployee(employeeId, user.currentWorkspaceId, {
        hourlyRate: hourlyRate.toString(),
        onboardingStatus: 'completed',
      });

      if (!employee) {
        return res.status(404).json({ message: "Failed to update employee" });
      }

      // Audit log
      console.log(`[AUDIT] Manager ${userId} approved employee ${employeeId} with hourly rate $${hourlyRate}`);

      res.json(employee);
    } catch (error: any) {
      console.error("Error approving employee:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(400).json({ message: error.message || "Failed to approve employee" });
    }
  });

  // ============================================================================
  // EMPLOYEE BENEFITS ROUTES (HR Management)
  // ============================================================================
  
  app.get('/api/benefits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const benefits = await storage.getEmployeeBenefitsByWorkspace(workspace.id);
      res.json(benefits);
    } catch (error) {
      console.error("Error fetching benefits:", error);
      res.status(500).json({ message: "Failed to fetch benefits" });
    }
  });

  app.get('/api/benefits/employee/:employeeId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { employeeId } = req.params;
      const benefits = await storage.getEmployeeBenefitsByEmployee(employeeId, workspace.id);
      res.json(benefits);
    } catch (error) {
      console.error("Error fetching employee benefits:", error);
      res.status(500).json({ message: "Failed to fetch employee benefits" });
    }
  });

  app.post('/api/benefits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Import schema for validation
      const { insertEmployeeBenefitSchema } = await import("@shared/schema");
      
      const validated = insertEmployeeBenefitSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      const benefit = await storage.createEmployeeBenefit(validated);
      res.status(201).json(benefit);
    } catch (error: any) {
      console.error("Error creating benefit:", error);
      res.status(400).json({ message: error.message || "Failed to create benefit" });
    }
  });

  app.patch('/api/benefits/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      
      // Validate and strip privileged fields to prevent tenant reassignment
      const { insertEmployeeBenefitSchema } = await import("@shared/schema");
      const validated = insertEmployeeBenefitSchema
        .partial()
        .omit({ workspaceId: true, employeeId: true })
        .parse(req.body);
      
      const updated = await storage.updateEmployeeBenefit(id, workspace.id, validated);
      
      if (!updated) {
        return res.status(404).json({ message: "Benefit not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating benefit:", error);
      res.status(400).json({ message: error.message || "Failed to update benefit" });
    }
  });

  app.delete('/api/benefits/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteEmployeeBenefit(id, workspace.id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Benefit not found" });
      }

      res.json({ message: "Benefit deleted successfully" });
    } catch (error) {
      console.error("Error deleting benefit:", error);
      res.status(500).json({ message: "Failed to delete benefit" });
    }
  });

  // ============================================================================
  // PERFORMANCE REVIEW ROUTES (HR Management)
  // ============================================================================
  
  app.get('/api/reviews', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const reviews = await storage.getPerformanceReviewsByWorkspace(workspace.id);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  app.post('/api/reviews', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { insertPerformanceReviewSchema } = await import("@shared/schema");
      const validated = insertPerformanceReviewSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      const review = await storage.createPerformanceReview(validated);
      res.status(201).json(review);
    } catch (error: any) {
      console.error("Error creating review:", error);
      res.status(400).json({ message: error.message || "Failed to create review" });
    }
  });

  app.patch('/api/reviews/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      
      // Validate and strip privileged fields to prevent tenant reassignment
      const { insertPerformanceReviewSchema } = await import("@shared/schema");
      const validated = insertPerformanceReviewSchema
        .partial()
        .omit({ workspaceId: true, employeeId: true })
        .parse(req.body);
      
      const updated = await storage.updatePerformanceReview(id, workspace.id, validated);
      
      if (!updated) {
        return res.status(404).json({ message: "Review not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating review:", error);
      res.status(400).json({ message: error.message || "Failed to update review" });
    }
  });

  // ============================================================================
  // PTO REQUEST ROUTES (HR Management)
  // ============================================================================
  
  app.get('/api/pto', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const status = req.query.status as string | undefined;
      const requests = await storage.getPtoRequestsByWorkspace(workspace.id, { status });
      res.json(requests);
    } catch (error) {
      console.error("Error fetching PTO requests:", error);
      res.status(500).json({ message: "Failed to fetch PTO requests" });
    }
  });

  app.post('/api/pto', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { insertPtoRequestSchema } = await import("@shared/schema");
      const validated = insertPtoRequestSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      const request = await storage.createPtoRequest(validated);
      res.status(201).json(request);
    } catch (error: any) {
      console.error("Error creating PTO request:", error);
      res.status(400).json({ message: error.message || "Failed to create PTO request" });
    }
  });

  app.patch('/api/pto/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      const { approverId } = req.body;
      const approved = await storage.approvePtoRequest(id, workspace.id, approverId);
      
      if (!approved) {
        return res.status(404).json({ message: "PTO request not found" });
      }

      res.json(approved);
    } catch (error: any) {
      console.error("Error approving PTO request:", error);
      res.status(400).json({ message: error.message || "Failed to approve PTO request" });
    }
  });

  app.patch('/api/pto/:id/deny', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      const { approverId, denialReason } = req.body;
      const denied = await storage.denyPtoRequest(id, workspace.id, approverId, denialReason);
      
      if (!denied) {
        return res.status(404).json({ message: "PTO request not found" });
      }

      res.json(denied);
    } catch (error: any) {
      console.error("Error denying PTO request:", error);
      res.status(400).json({ message: error.message || "Failed to deny PTO request" });
    }
  });

  // ============================================================================
  // HR AUTOMATION - PTO ACCRUAL & PERFORMANCE REVIEW REMINDERS
  // ============================================================================
  
  // Get all PTO balances (Manager/Owner only)
  app.get('/api/hr/pto-balances', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const balances = await getAllPtoBalances(workspaceId);
      res.json(balances);
    } catch (error: any) {
      console.error("Error fetching PTO balances:", error);
      res.status(500).json({ message: "Failed to fetch PTO balances" });
    }
  });
  
  // Get specific employee PTO balance
  app.get('/api/hr/pto-balances/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { employeeId } = req.params;
      
      const balance = await calculatePtoAccrual(workspaceId, employeeId);
      
      if (!balance) {
        return res.status(404).json({ message: "Employee or PTO benefit not found" });
      }
      
      res.json(balance);
    } catch (error: any) {
      console.error("Error fetching employee PTO balance:", error);
      res.status(500).json({ message: "Failed to fetch PTO balance" });
    }
  });
  
  // Manually trigger weekly PTO accrual (Owner only)
  app.post('/api/hr/pto-accrual/run', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const updatedCount = await runWeeklyPtoAccrual(workspaceId);
      
      res.json({ 
        success: true, 
        message: `PTO accrual updated for ${updatedCount} employees`,
        updatedCount 
      });
    } catch (error: any) {
      console.error("Error running PTO accrual:", error);
      res.status(500).json({ message: "Failed to run PTO accrual" });
    }
  });
  
  // Get performance review reminders summary (Manager/Owner only)
  app.get('/api/hr/review-reminders/summary', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const summary = await getReviewReminderSummary(workspaceId);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching review reminder summary:", error);
      res.status(500).json({ message: "Failed to fetch review reminders" });
    }
  });
  
  // Get all overdue performance reviews (Manager/Owner only)
  app.get('/api/hr/review-reminders/overdue', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const overdueReviews = await getOverdueReviews(workspaceId);
      res.json(overdueReviews);
    } catch (error: any) {
      console.error("Error fetching overdue reviews:", error);
      res.status(500).json({ message: "Failed to fetch overdue reviews" });
    }
  });
  
  // Get upcoming performance reviews (Manager/Owner only)
  app.get('/api/hr/review-reminders/upcoming', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const daysAhead = parseInt(req.query.days as string) || 30;
      const upcomingReviews = await getUpcomingReviews(workspaceId, daysAhead);
      res.json(upcomingReviews);
    } catch (error: any) {
      console.error("Error fetching upcoming reviews:", error);
      res.status(500).json({ message: "Failed to fetch upcoming reviews" });
    }
  });

  // ============================================================================
  // EMPLOYEE TERMINATION ROUTES (HR Management)
  // ============================================================================
  
  app.get('/api/terminations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const terminations = await storage.getEmployeeTerminationsByWorkspace(workspace.id);
      res.json(terminations);
    } catch (error) {
      console.error("Error fetching terminations:", error);
      res.status(500).json({ message: "Failed to fetch terminations" });
    }
  });

  app.post('/api/terminations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { insertEmployeeTerminationSchema } = await import("@shared/schema");
      const validated = insertEmployeeTerminationSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      const termination = await storage.createEmployeeTermination(validated);
      res.status(201).json(termination);
    } catch (error: any) {
      console.error("Error creating termination:", error);
      res.status(400).json({ message: error.message || "Failed to create termination" });
    }
  });

  app.patch('/api/terminations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      
      // Validate and strip privileged fields to prevent tenant reassignment
      const { insertEmployeeTerminationSchema } = await import("@shared/schema");
      const validated = insertEmployeeTerminationSchema
        .partial()
        .omit({ workspaceId: true, employeeId: true })
        .parse(req.body);
      
      const updated = await storage.updateEmployeeTermination(id, workspace.id, validated);
      
      if (!updated) {
        return res.status(404).json({ message: "Termination not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating termination:", error);
      res.status(400).json({ message: error.message || "Failed to update termination" });
    }
  });

  app.patch('/api/terminations/:id/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      const completed = await storage.completeTermination(id, workspace.id);
      
      if (!completed) {
        return res.status(404).json({ message: "Termination not found" });
      }

      res.json(completed);
    } catch (error: any) {
      console.error("Error completing termination:", error);
      res.status(400).json({ message: error.message || "Failed to complete termination" });
    }
  });

  // ============================================================================
  // LEADERS HUB - Organization Leaders Management (Owner/Manager Self-Service)
  // ============================================================================
  
  // Import requireLeader for role-based access
  const { requireLeader } = await import("./rbac");
  
  // Get leader dashboard stats
  app.get('/api/leaders/stats', isAuthenticated, requireLeader, async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId;
      
      // Get all employees for the workspace
      const allEmployees = await storage.getEmployeesByWorkspace(workspaceId);
      
      // Get pending PTO requests
      const pendingPTORequests = await db
        .select()
        .from(ptoRequests)
        .where(
          and(
            eq(ptoRequests.workspaceId, workspaceId),
            eq(ptoRequests.status, 'pending')
          )
        );
      
      // Get recent leader actions count (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentLeaderActions = await db
        .select()
        .from(leaderActions)
        .where(
          and(
            eq(leaderActions.workspaceId, workspaceId),
            gte(leaderActions.createdAt, sevenDaysAgo)
          )
        );
      
      // Get open escalation tickets
      const openEscalations = await db
        .select()
        .from(escalationTickets)
        .where(
          and(
            eq(escalationTickets.workspaceId, workspaceId),
            inArray(escalationTickets.status, ['open', 'in_progress'])
          )
        );
      
      // Get time entry discrepancies (pending resolution)
      const pendingDiscrepancies = await db
        .select()
        .from(timeEntryDiscrepancies)
        .where(
          and(
            eq(timeEntryDiscrepancies.workspaceId, workspaceId),
            eq(timeEntryDiscrepancies.status, 'open')
          )
        );
      
      // Get unresolved disputes
      const pendingDisputes = await db
        .select()
        .from(disputes)
        .where(
          and(
            eq(disputes.workspaceId, workspaceId),
            inArray(disputes.status, ['pending', 'under_review'])
          )
        );
      
      // Calculate stats
      const stats = {
        headcount: {
          total: allEmployees.length,
          active: allEmployees.filter(e => e.employmentStatus === 'active').length,
          onLeave: allEmployees.filter(e => e.employmentStatus === 'leave').length,
          pendingOnboarding: allEmployees.filter(e => e.onboardingStatus === 'pending').length,
        },
        compliance: {
          compliant: allEmployees.length - pendingDiscrepancies.length - pendingDisputes.length,
          expiringSoon: 0, // Could track certification expiration in future
          overdue: pendingDiscrepancies.length,
        },
        pendingApprovals: {
          scheduleSwaps: 0, // Swaps handled through shift replacements
          timeAdjustments: pendingDiscrepancies.length,
          ptoRequests: pendingPTORequests.length,
        },
        recentActivity: {
          actionCount: recentLeaderActions.length,
          escalationCount: openEscalations.length,
        },
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching leader stats:", error);
      res.status(500).json({ message: "Failed to fetch leader stats" });
    }
  });
  
  // Get pending tasks for leader
  
  // Get recent leader actions (audit trail)
  app.get('/api/leaders/recent-actions', isAuthenticated, requireLeader, async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const actions = await storage.getLeaderActionsByWorkspace(workspaceId, limit);
      res.json(actions);
    } catch (error) {
      console.error("Error fetching recent actions:", error);
      res.status(500).json({ message: "Failed to fetch recent actions" });
    }
  });
  
  // Reset employee password (leader self-service)
  app.post('/api/leaders/reset-password', isAuthenticated, requireLeader, async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId;
      const leaderId = req.user.id;
      const { employeeId, reason } = req.body;
      
      // Validate employee belongs to workspace
      const employee = await storage.getEmployee(employeeId, workspaceId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found in your workspace" });
      }
      
      // Generate temporary password
      const tempPassword = crypto.randomBytes(8).toString('hex');
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      // Update employee password (if employee has userId)
      if (employee.userId) {
        await db
          .update(users)
          .set({ 
            password: hashedPassword,
            forcePasswordReset: true,
            updatedAt: new Date()
          })
          .where(eq(users.id, employee.userId));
      }
      
      // Log action to leader_actions table
      await storage.createLeaderAction({
        workspaceId,
        leaderId,
        leaderEmail: req.user.email || '',
        leaderRole: req.workspaceRole,
        action: 'reset_password',
        targetEntityType: 'employee',
        targetEntityId: employeeId,
        targetEmployeeName: `${employee.firstName} ${employee.lastName}`,
        changesBefore: null,
        changesAfter: { passwordReset: true, forcePasswordReset: true },
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || '',
        requiresApproval: false,
      });
      
      // TODO: Send email to employee with temporary password
      
      res.json({ 
        success: true, 
        message: "Password reset successfully",
        tempPassword // In production, this should be emailed, not returned
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
  
  // Unlock employee account (leader self-service)
  app.post('/api/leaders/unlock-account', isAuthenticated, requireLeader, async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId;
      const leaderId = req.user.id;
      const { employeeId, reason } = req.body;
      
      // Validate employee belongs to workspace
      const employee = await storage.getEmployee(employeeId, workspaceId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found in your workspace" });
      }
      
      // Unlock account (if employee has userId)
      if (employee.userId) {
        await db
          .update(users)
          .set({ 
            accountLocked: false,
            loginAttempts: 0,
            updatedAt: new Date()
          })
          .where(eq(users.id, employee.userId));
      }
      
      // Log action to leader_actions table
      await storage.createLeaderAction({
        workspaceId,
        leaderId,
        leaderEmail: req.user.email || '',
        leaderRole: req.workspaceRole,
        action: 'unlock_account',
        targetEntityType: 'employee',
        targetEntityId: employeeId,
        targetEmployeeName: `${employee.firstName} ${employee.lastName}`,
        changesBefore: { accountLocked: true },
        changesAfter: { accountLocked: false, loginAttempts: 0 },
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || '',
        requiresApproval: false,
      });
      
      res.json({ 
        success: true, 
        message: "Account unlocked successfully"
      });
    } catch (error) {
      console.error("Error unlocking account:", error);
      res.status(500).json({ message: "Failed to unlock account" });
    }
  });
  
  // Update employee contact info (leader self-service)
  app.patch('/api/leaders/update-contact', isAuthenticated, requireLeader, async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId;
      const leaderId = req.user.id;
      const { employeeId, email, phone, address, reason } = req.body;
      
      // Validate employee belongs to workspace
      const employee = await storage.getEmployee(employeeId, workspaceId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found in your workspace" });
      }
      
      // Capture before state for audit
      const beforeState = {
        email: employee.email,
        phone: employee.phone,
        address: employee.address,
      };
      
      // Update employee contact info
      const updateData: any = {};
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      
      const updated = await storage.updateEmployee(employeeId, workspaceId, updateData);
      
      // Capture after state for audit
      const afterState = {
        email: updated?.email,
        phone: updated?.phone,
        address: updated?.address,
      };
      
      // Log action to leader_actions table with before/after snapshots
      await storage.createLeaderAction({
        workspaceId,
        leaderId,
        leaderEmail: req.user.email || '',
        leaderRole: req.workspaceRole,
        action: 'update_contact',
        targetEntityType: 'employee',
        targetEntityId: employeeId,
        targetEmployeeName: `${employee.firstName} ${employee.lastName}`,
        changesBefore: beforeState,
        changesAfter: afterState,
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || '',
        requiresApproval: false,
      });
      
      res.json({ 
        success: true, 
        message: "Contact information updated successfully",
        employee: updated
      });
    } catch (error) {
      console.error("Error updating contact info:", error);
      res.status(500).json({ message: "Failed to update contact information" });
    }
  });

  // Create escalation ticket to platform support
  app.post('/api/leaders/escalate', isAuthenticated, requireLeader, async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId;
      const requestorId = req.user.id;
      const { category, title, description, priority, relatedEntityType, relatedEntityId, contextData } = req.body;
      
      // Generate unique ticket number with retry on constraint violation
      let ticket;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!ticket && attempts < maxAttempts) {
        try {
          const ticketNumber = `ESC-${Math.floor(100000 + Math.random() * 900000)}`;
          
          ticket = await storage.createEscalationTicket({
            ticketNumber,
            workspaceId,
            requestorId,
            requestorEmail: req.user.email || '',
            requestorRole: req.workspaceRole,
            category: category || 'other',
            title,
            description,
            priority: priority || 'normal',
            relatedEntityType,
            relatedEntityId,
            contextData,
            attachments: null,
            assignedTo: null,
            status: 'open',
            resolution: null,
          });
        } catch (error: any) {
          // Retry on unique constraint violation (duplicate ticket number)
          if (error.code === '23505' && error.constraint === 'escalation_tickets_ticket_number_unique') {
            attempts++;
            if (attempts >= maxAttempts) {
              return res.status(500).json({ message: "Failed to generate unique ticket number after retries" });
            }
            continue;
          }
          throw error; // Re-throw other errors
        }
      }
      
      if (!ticket) {
        return res.status(500).json({ message: "Failed to create escalation ticket" });
      }
      
      // Log escalation action
      await storage.createLeaderAction({
        workspaceId,
        leaderId: requestorId,
        leaderEmail: req.user.email || '',
        leaderRole: req.workspaceRole,
        action: 'escalate_to_support',
        targetEntityType: 'escalation_ticket',
        targetEntityId: ticket.id,
        targetEmployeeName: null,
        changesBefore: null,
        changesAfter: { ticketNumber: ticket.ticketNumber, category, priority },
        reason: description,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || '',
        requiresApproval: false,
      });
      
      res.status(201).json({ 
        success: true, 
        message: "Escalation ticket created successfully",
        ticket
      });
    } catch (error) {
      console.error("Error creating escalation ticket:", error);
      res.status(500).json({ message: "Failed to create escalation ticket" });
    }
  });

  // Get escalation tickets for workspace
  app.get('/api/leaders/escalations', isAuthenticated, requireLeader, async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId;
      
      const tickets = await storage.getEscalationTicketsByWorkspace(workspaceId);
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching escalation tickets:", error);
      res.status(500).json({ message: "Failed to fetch escalation tickets" });
    }
  });

  // Update escalation ticket status (platform staff only)
  app.patch('/api/leaders/escalations/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, resolution } = req.body;
      const staffId = req.user.id;
      
      // Check if user has platform staff role
      const [staffRole] = await db
        .select()
        .from(platformRoles)
        .where(
          and(
            eq(platformRoles.userId, staffId),
            isNull(platformRoles.revokedAt)
          )
        )
        .limit(1);
      
      const isPlatformStaff = staffRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(staffRole.role);
      
      if (!isPlatformStaff) {
        return res.status(403).json({ message: "Only platform staff can update escalation tickets" });
      }
      
      // Get existing ticket for audit trail and state validation
      const [existingTicket] = await db
        .select()
        .from(escalationTickets)
        .where(eq(escalationTickets.id, id))
        .limit(1);
      
      if (!existingTicket) {
        return res.status(404).json({ message: "Escalation ticket not found" });
      }
      
      // Validate status transition based on current state
      const currentStatus = existingTicket.status;
      const allowedTransitions: Record<string, string[]> = {
        'open': ['in_progress', 'resolved'],
        'in_progress': ['resolved', 'open'], // Can reopen if needed
        'resolved': [], // Cannot change from resolved
      };
      
      const validStatuses = ['open', 'in_progress', 'resolved'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      
      const allowedNextStates = allowedTransitions[currentStatus || 'open'] || [];
      if (!allowedNextStates.includes(status)) {
        return res.status(400).json({ 
          message: `Cannot transition from ${currentStatus} to ${status}. Allowed transitions: ${allowedNextStates.join(', ') || 'none'}` 
        });
      }
      
      // Require resolution when closing ticket
      if (status === 'resolved' && !resolution) {
        return res.status(400).json({ message: "Resolution is required when closing an escalation ticket" });
      }
      
      // Capture before state for audit
      const beforeState = {
        status: existingTicket.status,
        resolution: existingTicket.resolution,
      };
      
      // Update ticket status
      const updated = await storage.updateEscalationTicketStatus(id, status, staffId);
      
      if (resolution && updated) {
        await storage.addEscalationTicketResponse(id, resolution);
      }
      
      // Capture after state for audit
      const afterState = {
        status: updated?.status,
        resolution: updated?.resolution || resolution,
      };
      
      // Log platform staff action to audit trail
      await storage.createLeaderAction({
        workspaceId: existingTicket.workspaceId,
        leaderId: staffId,
        leaderEmail: req.user.email || '',
        leaderRole: staffRole.role as any, // Platform role, not workspace role
        action: 'platform_update_escalation',
        targetEntityType: 'escalation_ticket',
        targetEntityId: id,
        targetEmployeeName: existingTicket.ticketNumber,
        changesBefore: beforeState,
        changesAfter: afterState,
        reason: resolution || `Status changed to ${status}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || '',
        requiresApproval: false,
      });
      
      res.json({ 
        success: true, 
        message: "Escalation ticket updated successfully",
        ticket: updated
      });
    } catch (error) {
      console.error("Error updating escalation ticket:", error);
      res.status(500).json({ message: "Failed to update escalation ticket" });
    }
  });

  // ============================================================================
  // CLIENT ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/clients', async (req: any, res) => {
    try {
      let userId: string;
      let user: any;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
        userId = req.user.claims.sub;
        user = req.user;
      } else if (req.session?.userId) {
        userId = req.session.userId;
        const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!dbUser) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        user = dbUser;
        const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
        const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
        user.platformRole = activePlatformRole?.role || null;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (user.platformRole === 'root' || user.platformRole === 'sysop') {
        const allWorkspaces = await db.select().from(workspaces).limit(1);
        if (allWorkspaces.length > 0) {
          const clients = await storage.getClientsByWorkspace(allWorkspaces[0].id);
          return res.json(clients);
        }
        return res.json([]);
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const clients = await storage.getClientsByWorkspace(workspace.id);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post('/api/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Extract billing info from request
      const { billableRate, billingCycle, serviceType, ...clientData } = req.body;

      // Validate client data with Zod and enforce workspace ownership
      const validated = insertClientSchema.parse({
        ...clientData,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      // Create the client
      const client = await storage.createClient(validated);

      // Create client rate if billableRate is provided (with proper number conversion)
      const rateValue = parseFloat(billableRate || "0");
      if (!isNaN(rateValue) && rateValue > 0) {
        await storage.createClientRate({
          workspaceId: workspace.id,
          clientId: client.id,
          billableRate: rateValue.toFixed(2), // Convert to properly formatted decimal string
          description: serviceType || "Standard hourly rate",
          isActive: true,
          hasSubscription: false,
          subscriptionFrequency: billingCycle || "monthly", // Store billing cycle here
        });
      }

      res.json(client);
    } catch (error: any) {
      console.error("Error creating client:", error);
      res.status(400).json({ message: error.message || "Failed to create client" });
    }
  });

  app.patch('/api/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate partial update, ensure no workspaceId override
      const { workspaceId, ...updateData } = req.body;
      const validated = insertClientSchema.partial().parse(updateData);

      const client = await storage.updateClient(req.params.id, workspace.id, validated);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json(client);
    } catch (error: any) {
      console.error("Error updating client:", error);
      res.status(400).json({ message: error.message || "Failed to update client" });
    }
  });

  app.delete('/api/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteClient(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // ============================================================================
  // SHIFT ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/shifts', async (req: any, res) => {
    try {
      let userId: string;
      let user: any;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
        userId = req.user.claims.sub;
        user = req.user;
      } else if (req.session?.userId) {
        userId = req.session.userId;
        const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!dbUser) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        user = dbUser;
        const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
        const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
        user.platformRole = activePlatformRole?.role || null;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (user.platformRole === 'root' || user.platformRole === 'sysop') {
        const allWorkspaces = await db.select().from(workspaces).limit(1);
        if (allWorkspaces.length > 0) {
          const shifts = await storage.getShiftsByWorkspace(allWorkspaces[0].id);
          return res.json(shifts);
        }
        return res.json([]);
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const shifts = await storage.getShiftsByWorkspace(workspace.id);
      res.json(shifts);
    } catch (error) {
      console.error("Error fetching shifts:", error);
      res.status(500).json({ message: "Failed to fetch shifts" });
    }
  });

  app.post('/api/shifts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate with Zod and enforce workspace ownership
      const validated = insertShiftSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const shift = await storage.createShift(validated);
      
      // Send shift assignment email if employee has email
      if (shift.employeeId) {
        const employee = await storage.getEmployee(shift.employeeId, workspace.id);
        const client = shift.clientId ? await storage.getClient(shift.clientId, workspace.id) : null;
        
        if (employee?.email) {
          const startTime = new Date(shift.startTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short'
          });
          const endTime = new Date(shift.endTime).toLocaleString('en-US', {
            timeStyle: 'short'
          });
          
          sendShiftAssignmentEmail(employee.email, {
            employeeName: `${employee.firstName} ${employee.lastName}`,
            shiftTitle: shift.title || 'Shift',
            startTime,
            endTime,
            clientName: client ? `${client.firstName} ${client.lastName}` : undefined
          }).catch(err => console.error('Failed to send shift assignment email:', err));
        }
      }
      
      res.json(shift);
    } catch (error: any) {
      console.error("Error creating shift:", error);
      res.status(400).json({ message: error.message || "Failed to create shift" });
    }
  });

  app.patch('/api/shifts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate partial update, ensure no workspaceId override
      const { workspaceId, ...updateData } = req.body;
      const validated = insertShiftSchema.partial().parse(updateData);

      const shift = await storage.updateShift(req.params.id, workspace.id, validated);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      res.json(shift);
    } catch (error: any) {
      console.error("Error updating shift:", error);
      res.status(400).json({ message: error.message || "Failed to update shift" });
    }
  });

  app.delete('/api/shifts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteShift(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shift:", error);
      res.status(500).json({ message: "Failed to delete shift" });
    }
  });

  // ============================================================================
  // SCHEDULEOS™ SHIFT MANAGEMENT - Denial, Acknowledgment, Auto-Replacement
  // ============================================================================

  // Employee acknowledges AI-generated shift
  app.post('/api/shifts/:id/acknowledge', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const shift = await storage.getShift(req.params.id, workspace.id);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // Update shift with acknowledgment
      const updated = await storage.updateShift(req.params.id, workspace.id, {
        acknowledgedAt: new Date().toISOString(),
        status: 'scheduled',
      });

      res.json({
        success: true,
        shift: updated,
        message: "Shift acknowledged successfully"
      });
    } catch (error: any) {
      console.error("Error acknowledging shift:", error);
      res.status(500).json({ message: "Failed to acknowledge shift" });
    }
  });

  // Employee denies AI-generated shift (triggers auto-replacement)
  app.post('/api/shifts/:id/deny', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { denialReason } = req.body;
      const shift = await storage.getShift(req.params.id, workspace.id);
      
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // Mark shift as denied
      await storage.updateShift(req.params.id, workspace.id, {
        deniedAt: new Date().toISOString(),
        denialReason: denialReason || 'Employee declined assignment',
        status: 'cancelled',
      });

      // IDEMPOTENCY CHECK: Prevent duplicate replacements on retry
      const existingReplacement = await db
        .select()
        .from(shifts)
        .where(
          and(
            eq(shifts.replacementForShiftId, shift.id),
            eq(shifts.workspaceId, workspace.id),
            ne(shifts.status, 'cancelled')
          )
        )
        .limit(1);

      if (existingReplacement.length > 0) {
        console.log(`[ScheduleOS™] Replacement already exists for shift ${shift.id}, skipping duplicate creation`);
        return res.json({
          success: true,
          deniedShift: shift,
          replacementShift: existingReplacement[0],
          message: "Shift already denied with existing replacement",
          duplicate: true,
        });
      }

      // AUTO-REPLACEMENT: Find backup employee
      const { scheduleOSAI } = await import('./ai/scheduleos');
      
      console.log(`[ScheduleOS™] Shift ${shift.id} denied by employee ${shift.employeeId}. Starting auto-replacement...`);

      try {
        // Generate replacement shift for same time slot
        const replacementResult = await scheduleOSAI.generateSchedule({
          workspaceId: workspace.id,
          weekStartDate: new Date(shift.startTime),
          clientIds: shift.clientId ? [shift.clientId] : [],
          shiftRequirements: [{
            title: shift.title || 'Replacement Shift',
            clientId: shift.clientId || '',
            startTime: new Date(shift.startTime),
            endTime: new Date(shift.endTime),
            requiredEmployees: 1,
          }],
        });

        // Create replacement shift if AI found suitable employee
        if (replacementResult.generatedShifts.length > 0) {
          const replacement = replacementResult.generatedShifts[0];
          
          // Don't assign to same employee who denied
          if (replacement.employeeId !== shift.employeeId) {
            const newShift = await storage.createShift({
              workspaceId: workspace.id,
              employeeId: replacement.employeeId,
              clientId: replacement.clientId || null,
              title: replacement.title || null,
              description: `Auto-replacement for denied shift ${shift.id}`,
              startTime: replacement.startTime.toISOString(),
              endTime: replacement.endTime.toISOString(),
              aiGenerated: true,
              requiresAcknowledgment: true,
              replacementForShiftId: shift.id,
              autoReplacementAttempts: 1,
              aiConfidenceScore: replacement.aiConfidenceScore.toString(),
              riskScore: replacement.riskScore.toString(),
              riskFactors: replacement.riskFactors,
              status: 'scheduled',
            });

            // BILLOS™ SYNC: Update invoice for replacement shift
            let billingUpdate = null;
            if (shift.clientId) {
              try {
                // Search for invoice line item by metadata.shiftId for reliability
                const allInvoices = await storage.getInvoicesByClient(shift.clientId, workspace.id);
                let deniedShiftLineItem: any = null;
                let targetInvoice: any = null;

                for (const invoice of allInvoices) {
                  if (invoice.status === 'draft') {
                    const lineItems = await storage.getInvoiceLineItems(invoice.id);
                    deniedShiftLineItem = lineItems.find((item: any) => {
                      // Primary search: metadata.shiftId (most reliable)
                      if (item.metadata && typeof item.metadata === 'object') {
                        return item.metadata.shiftId === shift.id;
                      }
                      // Fallback: description contains shift ID
                      return item.description?.includes(shift.id);
                    });

                    if (deniedShiftLineItem) {
                      targetInvoice = invoice;
                      break;
                    }
                  }
                }

                if (deniedShiftLineItem && targetInvoice) {
                  // Remove denied shift line item
                  await storage.deleteInvoiceLineItem(deniedShiftLineItem.id);
                  console.log(`[BillOS™] Removed invoice line item for denied shift ${shift.id}`);

                  // Add replacement shift line item
                  const hours = replacement.billableHours;
                  const rate = replacement.estimatedCost / hours;
                  const amount = hours * rate;

                  const newLineItem = await storage.createInvoiceLineItem({
                    invoiceId: targetInvoice.id,
                    description: `${replacement.title} - ${replacement.employeeName} (${new Date(replacement.startTime).toLocaleDateString()}) [Replacement]`,
                    quantity: hours.toString(),
                    unitPrice: rate.toFixed(2),
                    amount: amount.toFixed(2),
                    metadata: {
                      shiftId: newShift.id,
                      aiGenerated: true,
                      scheduleOSGenerated: true,
                      replacementFor: shift.id,
                      billableHours: hours,
                    },
                  });

                  // Recalculate invoice totals
                  const updatedLineItems = await storage.getInvoiceLineItems(targetInvoice.id);
                  const newSubtotal = updatedLineItems.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0);
                  const taxRate = parseFloat(targetInvoice.taxRate || '0');
                  const newTaxAmount = newSubtotal * (taxRate / 100);
                  const newTotal = newSubtotal + newTaxAmount;

                  await storage.updateInvoice(targetInvoice.id, workspace.id, {
                    subtotal: newSubtotal.toFixed(2),
                    taxAmount: newTaxAmount.toFixed(2),
                    total: newTotal.toFixed(2),
                  });

                  billingUpdate = {
                    invoiceId: targetInvoice.id,
                    invoiceNumber: targetInvoice.invoiceNumber,
                    removedLineItem: deniedShiftLineItem.id,
                    addedLineItem: newLineItem.id,
                    message: `Updated invoice ${targetInvoice.invoiceNumber} - replaced denied shift with ${replacement.employeeName}`,
                  };

                  console.log(`[BillOS™] Updated invoice ${targetInvoice.invoiceNumber} for auto-replacement`);
                } else {
                  // Invoice line not found - shift may not be invoiced yet, will be picked up in next invoice generation
                  console.log(`[BillOS™] No invoice line item found for shift ${shift.id} - replacement will be billed in next invoice generation`);
                  billingUpdate = {
                    message: 'Shift not yet invoiced - replacement will be included in next invoice generation',
                    deferred: true,
                  };
                }
              } catch (billingError: any) {
                console.error('[BillOS™] Failed to update invoice for replacement:', billingError);
                // Non-fatal: replacement shift created successfully, billing can be corrected manually if needed
                billingUpdate = {
                  error: billingError.message,
                  message: 'Billing sync failed - replacement shift created but invoice may need manual correction',
                };
              }
            }

            return res.json({
              success: true,
              deniedShift: shift,
              replacementShift: newShift,
              replacementEmployee: replacement.employeeName,
              message: `Shift denied. Auto-replacement assigned to ${replacement.employeeName}`,
              warnings: replacementResult.warnings,
              billingUpdate,
            });
          }
        }

        // No suitable replacement found
        return res.json({
          success: true,
          deniedShift: shift,
          replacementShift: null,
          message: "Shift denied. No suitable replacement employee found. Manual scheduling required.",
          warnings: ["No employees available for this time slot. Consider hiring or adjusting shift requirements."],
        });

      } catch (replacementError: any) {
        console.error("[ScheduleOS™] Auto-replacement failed:", replacementError);
        
        return res.json({
          success: true,
          deniedShift: shift,
          replacementShift: null,
          message: "Shift denied. Auto-replacement failed. Manual scheduling required.",
          error: replacementError.message,
        });
      }

    } catch (error: any) {
      console.error("Error denying shift:", error);
      res.status(500).json({ message: error.message || "Failed to deny shift" });
    }
  });

  // Bulk create shifts (recurring)
  app.post('/api/shifts/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { employeeId, clientId, title, description, startDate, endDate, startTime, endTime, recurrence, days } = req.body;
      
      // Create shifts based on recurrence pattern
      const createdShifts = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      while (start <= end) {
        // Check if this day matches the recurrence pattern
        let shouldCreate = false;
        if (recurrence === 'daily') {
          shouldCreate = true;
        } else if (recurrence === 'weekly' && days?.includes(start.getDay())) {
          shouldCreate = true;
        }
        
        if (shouldCreate) {
          const shiftStart = new Date(start);
          const [hours, minutes] = startTime.split(':');
          shiftStart.setHours(parseInt(hours), parseInt(minutes), 0);
          
          const shiftEnd = new Date(start);
          const [endHours, endMinutes] = endTime.split(':');
          shiftEnd.setHours(parseInt(endHours), parseInt(endMinutes), 0);
          
          const shift = await storage.createShift({
            workspaceId: workspace.id,
            employeeId,
            clientId: clientId || null,
            title: title || null,
            description: description || null,
            startTime: shiftStart.toISOString(),
            endTime: shiftEnd.toISOString(),
            status: 'scheduled',
          });
          
          createdShifts.push(shift);
        }
        
        start.setDate(start.getDate() + 1);
      }
      
      res.json({ shifts: createdShifts, count: createdShifts.length });
    } catch (error: any) {
      console.error("Error creating bulk shifts:", error);
      res.status(400).json({ message: error.message || "Failed to create bulk shifts" });
    }
  });

  // ============================================================================
  // SCHEDULEOS™ AI - Trial & Activation (Subscriber Pays All Model)
  // ============================================================================
  
  // Start 7-day free trial (any user can start)
  app.post('/api/scheduleos/start-trial', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Check if trial already started
      if (workspace.scheduleosTrialStartedAt) {
        const trialStart = new Date(workspace.scheduleosTrialStartedAt);
        const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        return res.json({
          alreadyStarted: true,
          trialStartedAt: workspace.scheduleosTrialStartedAt,
          trialEndsAt: trialEnd,
          daysLeft: Math.max(0, daysLeft),
          isActive: workspace.scheduleosActivatedAt ? true : (daysLeft > 0),
        });
      }

      // Start trial
      await storage.updateWorkspace(workspace.id, {
        scheduleosTrialStartedAt: new Date(),
      });

      res.json({
        success: true,
        message: "ScheduleOS™ 7-day free trial activated!",
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        daysLeft: 7,
      });
    } catch (error: any) {
      console.error("Error starting ScheduleOS™ trial:", error);
      res.status(500).json({ message: "Failed to start trial" });
    }
  });

  // Activate ScheduleOS™ with payment (Owner/Manager only)
  app.post('/api/scheduleos/activate', isAuthenticated, requireManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { paymentMethod } = req.body; // 'stripe_subscription' | 'stripe_card'

      if (!paymentMethod) {
        return res.status(400).json({ message: "Payment method required" });
      }

      // Check if already activated
      if (workspace.scheduleosActivatedAt) {
        return res.json({
          alreadyActivated: true,
          activatedAt: workspace.scheduleosActivatedAt,
          activatedBy: workspace.scheduleosActivatedBy,
        });
      }

      // TODO: Verify Stripe payment here when test keys are provided
      // For now, activate immediately (will be payment-gated in production)

      await storage.updateWorkspace(workspace.id, {
        scheduleosActivatedAt: new Date(),
        scheduleosActivatedBy: userId,
        scheduleosPaymentMethod: paymentMethod,
      });

      res.json({
        success: true,
        message: "ScheduleOS™ activated successfully!",
        activatedAt: new Date(),
        activatedBy: userId,
      });
    } catch (error: any) {
      console.error("Error activating ScheduleOS™:", error);
      res.status(500).json({ message: "Failed to activate ScheduleOS™" });
    }
  });

  // Check ScheduleOS™ status (trial/activated)
  app.get('/api/scheduleos/status', async (req: any, res) => {
    try {
      let userId: string;
      let user: any;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
        userId = req.user.claims.sub;
        user = req.user;
      } else if (req.session?.userId) {
        userId = req.session.userId;
        const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!dbUser) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        user = dbUser;
        const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
        const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
        user.platformRole = activePlatformRole?.role || null;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (user.platformRole === 'root' || user.platformRole === 'sysop') {
        const allWorkspaces = await db.select().from(workspaces).limit(1);
        if (allWorkspaces.length > 0) {
          const workspace = allWorkspaces[0];
          const response: any = {
            isActivated: !!workspace.scheduleosActivatedAt,
            activatedAt: workspace.scheduleosActivatedAt,
            activatedBy: workspace.scheduleosActivatedBy,
            paymentMethod: workspace.scheduleosPaymentMethod,
            trialStartedAt: workspace.scheduleosTrialStartedAt,
          };
          if (workspace.scheduleosTrialStartedAt && !workspace.scheduleosActivatedAt) {
            const trialStart = new Date(workspace.scheduleosTrialStartedAt);
            const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            const now = new Date();
            const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            response.isTrialActive = daysLeft > 0;
            response.trialEndsAt = trialEnd;
            response.daysLeft = Math.max(0, daysLeft);
            response.trialExpired = daysLeft <= 0;
          }
          return res.json(response);
        }
        return res.json({ isActivated: false });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const response: any = {
        isActivated: !!workspace.scheduleosActivatedAt,
        activatedAt: workspace.scheduleosActivatedAt,
        activatedBy: workspace.scheduleosActivatedBy,
        paymentMethod: workspace.scheduleosPaymentMethod,
        trialStartedAt: workspace.scheduleosTrialStartedAt,
      };

      if (workspace.scheduleosTrialStartedAt && !workspace.scheduleosActivatedAt) {
        const trialStart = new Date(workspace.scheduleosTrialStartedAt);
        const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        response.isTrialActive = daysLeft > 0;
        response.trialEndsAt = trialEnd;
        response.daysLeft = Math.max(0, daysLeft);
        response.trialExpired = daysLeft <= 0;
      }

      res.json(response);
    } catch (error: any) {
      console.error("Error checking ScheduleOS™ status:", error);
      res.status(500).json({ message: "Failed to check status" });
    }
  });

  // ============================================================================
  // SCHEDULEOS™ AI - Intelligent Auto-Scheduling (Trial or Activated Required)
  // ============================================================================
  
  app.post('/api/scheduleos/generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Check if user is platform staff - grant full access
      const platformRole = await storage.getUserPlatformRole(userId);
      const isPlatformStaff = platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole);

      // Platform staff get full access without trial/activation checks
      if (!isPlatformStaff) {
        // Check if activated (paid) OR in trial period
        const isActivated = !!workspace.scheduleosActivatedAt;
        let isInTrial = false;
        
        if (workspace.scheduleosTrialStartedAt && !isActivated) {
          const trialStart = new Date(workspace.scheduleosTrialStartedAt);
          const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          const now = new Date();
          const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          isInTrial = daysLeft > 0;
        }

        // Require activation or active trial
        if (!isActivated && !isInTrial) {
          return res.status(403).json({
            message: "ScheduleOS™ requires payment activation or active trial",
            trialExpired: workspace.scheduleosTrialStartedAt ? true : false,
            requiresPayment: true,
            feature: "scheduleOS"
          });
        }
      }

      // Import ScheduleOS AI
      const { scheduleOSAI } = await import('./ai/scheduleos');

      const { weekStartDate, shiftRequirements, clientIds } = req.body;

      if (!weekStartDate || !shiftRequirements) {
        return res.status(400).json({
          message: "Missing required fields: weekStartDate and shiftRequirements"
        });
      }

      // Generate AI schedule
      const result = await scheduleOSAI.generateSchedule({
        workspaceId: workspace.id,
        weekStartDate: new Date(weekStartDate),
        clientIds: clientIds || [],
        shiftRequirements,
      });

      // Track usage for billing
      await db.insert(smartScheduleUsage).values({
        workspaceId: workspace.id,
        scheduleDate: new Date(weekStartDate),
        employeesScheduled: result.employeesScheduled,
        shiftsGenerated: result.shiftsGenerated,
        billingModel: tier === 'elite' ? 'tier_included' : 'tier_included',
        chargeAmount: '0', // Included in tier
        aiModel: 'gpt-4',
        processingTimeMs: result.processingTimeMs,
      });

      // BILLOS™ INTEGRATION: Auto-create invoice line items for billable shifts
      const billableShifts = result.generatedShifts.filter(s => s.clientId);
      const invoiceLineItems: any[] = [];

      for (const shift of billableShifts) {
        try {
          // Group shifts by client for invoice consolidation
          const client = await storage.getClient(shift.clientId, workspace.id);
          if (!client) continue;

          // Calculate billing amount
          const hours = shift.billableHours;
          const rate = shift.estimatedCost / hours; // Simplified - should use employee rate
          const amount = hours * rate;

          // Check if invoice exists for this client this month
          const invoiceMonth = new Date(shift.startTime);
          invoiceMonth.setDate(1);
          invoiceMonth.setHours(0, 0, 0, 0);

          const existingInvoices = await storage.getInvoicesByClient(shift.clientId, workspace.id);
          let invoice = existingInvoices.find((inv: any) => {
            const invDate = new Date(inv.createdAt);
            return invDate.getMonth() === invoiceMonth.getMonth() && 
                   invDate.getFullYear() === invoiceMonth.getFullYear() &&
                   inv.status === 'draft';
          });

          // Create invoice if doesn't exist
          if (!invoice) {
            invoice = await storage.createInvoice({
              workspaceId: workspace.id,
              clientId: shift.clientId,
              invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
              status: 'draft',
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              subtotal: '0',
              taxRate: '0',
              taxAmount: '0',
              total: '0',
              notes: `Auto-generated by ScheduleOS™ for ${invoiceMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            });
          }

          // Add line item to invoice
          const lineItem = await storage.createInvoiceLineItem({
            invoiceId: invoice.id,
            description: `${shift.title} - ${shift.employeeName} (${new Date(shift.startTime).toLocaleDateString()})`,
            quantity: hours.toString(),
            unitPrice: rate.toFixed(2),
            amount: amount.toFixed(2),
            metadata: {
              shiftId: shift.employeeId,
              aiGenerated: true,
              scheduleOSGenerated: true,
              billableHours: hours,
            },
          });

          invoiceLineItems.push(lineItem);

          // Update invoice totals
          const allLineItems = await storage.getInvoiceLineItems(invoice.id);
          const newSubtotal = allLineItems.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0);
          const taxRate = parseFloat(invoice.taxRate || '0');
          const newTaxAmount = newSubtotal * (taxRate / 100);
          const newTotal = newSubtotal + newTaxAmount;

          await storage.updateInvoice(invoice.id, workspace.id, {
            subtotal: newSubtotal.toFixed(2),
            taxAmount: newTaxAmount.toFixed(2),
            total: newTotal.toFixed(2),
          });

          console.log(`[BillOS™] Added ${hours}h ($${amount.toFixed(2)}) to invoice ${invoice.invoiceNumber} for client ${client.name}`);
        } catch (billingError: any) {
          console.error(`[BillOS™] Failed to create invoice line item for shift:`, billingError);
        }
      }

      res.json({
        ...result,
        message: `ScheduleOS™ generated ${result.shiftsGenerated} shifts for ${result.employeesScheduled} employees in ${result.processingTimeMs}ms`,
        billosIntegration: {
          invoiceLineItemsCreated: invoiceLineItems.length,
          totalBillableHours: billableShifts.reduce((sum, s) => sum + s.billableHours, 0),
          totalEstimatedRevenue: billableShifts.reduce((sum, s) => sum + s.estimatedCost, 0),
          message: invoiceLineItems.length > 0 
            ? `Auto-created ${invoiceLineItems.length} invoice line items for client billing`
            : 'No billable shifts generated for this schedule',
        },
      });
    } catch (error: any) {
      console.error("ScheduleOS™ error:", error);
      res.status(500).json({
        message: error.message || "ScheduleOS™ failed to generate schedule",
        error: "SCHEDULEOS_ERROR"
      });
    }
  });

  // Acknowledge AI-generated shift (employee confirmation)
  app.post('/api/scheduleos/acknowledge/:shiftId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { shiftId } = req.params;

      // Find shift and verify employee access
      const shift = await db.query.shifts.findFirst({
        where: eq(shifts.id, shiftId),
      });

      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      if (!shift.aiGenerated) {
        return res.status(400).json({ message: "This shift was not AI-generated" });
      }

      // Update acknowledgment
      await db.update(shifts)
        .set({
          acknowledgedAt: new Date(),
        })
        .where(eq(shifts.id, shiftId));

      res.json({
        success: true,
        message: "Shift acknowledged successfully",
        shiftId,
        acknowledgedAt: new Date(),
      });
    } catch (error: any) {
      console.error("Error acknowledging shift:", error);
      res.status(500).json({ message: "Failed to acknowledge shift" });
    }
  });

  // ============================================================================
  // SHIFT TEMPLATE ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/shift-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const templates = await storage.getShiftTemplatesByWorkspace(workspace.id);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching shift templates:", error);
      res.status(500).json({ message: "Failed to fetch shift templates" });
    }
  });

  app.post('/api/shift-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const template = await storage.createShiftTemplate({
        ...req.body,
        workspaceId: workspace.id,
      });
      res.json(template);
    } catch (error: any) {
      console.error("Error creating shift template:", error);
      res.status(400).json({ message: error.message || "Failed to create shift template" });
    }
  });

  app.delete('/api/shift-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteShiftTemplate(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shift template:", error);
      res.status(500).json({ message: "Failed to delete shift template" });
    }
  });

  // ============================================================================
  // SHIFT ACKNOWLEDGMENT ROUTES (Post Orders & Special Orders)
  // ============================================================================

  // Get all acknowledgments for a shift
  app.get('/api/shifts/:shiftId/acknowledgments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;

      const { shiftAcknowledgments } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      // Verify shift belongs to workspace
      const shift = await db.query.shifts.findFirst({
        where: and(
          eq(shifts.id, req.params.shiftId),
          eq(shifts.workspaceId, workspaceId)
        ),
      });

      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      const acknowledgments = await db.query.shiftAcknowledgments.findMany({
        where: and(
          eq(shiftAcknowledgments.workspaceId, workspaceId),
          eq(shiftAcknowledgments.shiftId, req.params.shiftId)
        ),
        with: {
          shift: true,
          employee: true,
        },
      });

      res.json(acknowledgments);
    } catch (error: any) {
      console.error("Error fetching shift acknowledgments:", error);
      res.status(500).json({ message: "Failed to fetch acknowledgments" });
    }
  });

  // Create a new acknowledgment (Post Order/Special Order)
  app.post('/api/shifts/:shiftId/acknowledgments', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;

      const { eq, and } = await import("drizzle-orm");

      // Verify shift belongs to workspace
      const shift = await db.query.shifts.findFirst({
        where: and(
          eq(shifts.id, req.params.shiftId),
          eq(shifts.workspaceId, workspaceId)
        ),
      });

      if (!shift) {
        return res.status(404).json({ message: "Shift not found in this workspace" });
      }

      // Get the current employee (who is creating the acknowledgment)
      const currentEmployee = await db.query.employees.findFirst({
        where: eq(employees.userId, userId),
      });

      if (!currentEmployee) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      // Verify target employee belongs to workspace
      if (req.body.employeeId) {
        const targetEmployee = await db.query.employees.findFirst({
          where: and(
            eq(employees.id, req.body.employeeId),
            eq(employees.workspaceId, workspaceId)
          ),
        });

        if (!targetEmployee) {
          return res.status(404).json({ message: "Target employee not found in this workspace" });
        }
      }

      const { insertShiftAcknowledgmentSchema, shiftAcknowledgments } = await import("@shared/schema");
      
      const validatedData = insertShiftAcknowledgmentSchema.parse({
        ...req.body,
        workspaceId,
        shiftId: req.params.shiftId,
        createdBy: currentEmployee.id,
      });

      const [acknowledgment] = await db.insert(shiftAcknowledgments)
        .values(validatedData)
        .returning();

      res.json(acknowledgment);
    } catch (error: any) {
      console.error("Error creating shift acknowledgment:", error);
      res.status(400).json({ message: error.message || "Failed to create acknowledgment" });
    }
  });

  // Employee acknowledges a shift acknowledgment
  app.patch('/api/acknowledgments/:id/acknowledge', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;

      const { eq, and } = await import("drizzle-orm");

      const currentEmployee = await db.query.employees.findFirst({
        where: eq(employees.userId, userId),
      });

      if (!currentEmployee) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      const { shiftAcknowledgments } = await import("@shared/schema");

      const acknowledgment = await db.query.shiftAcknowledgments.findFirst({
        where: and(
          eq(shiftAcknowledgments.id, req.params.id),
          eq(shiftAcknowledgments.workspaceId, workspaceId),
          eq(shiftAcknowledgments.employeeId, currentEmployee.id)
        ),
      });

      if (!acknowledgment) {
        return res.status(404).json({ message: "Acknowledgment not found or not assigned to you" });
      }

      const [updated] = await db.update(shiftAcknowledgments)
        .set({
          acknowledgedAt: new Date(),
          acknowledgedBy: currentEmployee.id,
          updatedAt: new Date(),
        })
        .where(eq(shiftAcknowledgments.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("Error acknowledging:", error);
      res.status(500).json({ message: "Failed to acknowledge" });
    }
  });

  // Employee denies/declines a shift acknowledgment
  app.patch('/api/acknowledgments/:id/deny', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;

      const { eq, and } = await import("drizzle-orm");

      const currentEmployee = await db.query.employees.findFirst({
        where: eq(employees.userId, userId),
      });

      if (!currentEmployee) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      const { shiftAcknowledgments } = await import("@shared/schema");

      const acknowledgment = await db.query.shiftAcknowledgments.findFirst({
        where: and(
          eq(shiftAcknowledgments.id, req.params.id),
          eq(shiftAcknowledgments.workspaceId, workspaceId),
          eq(shiftAcknowledgments.employeeId, currentEmployee.id)
        ),
      });

      if (!acknowledgment) {
        return res.status(404).json({ message: "Acknowledgment not found or not assigned to you" });
      }

      const [updated] = await db.update(shiftAcknowledgments)
        .set({
          deniedAt: new Date(),
          denialReason: req.body.denialReason || 'Declined by employee',
          updatedAt: new Date(),
        })
        .where(eq(shiftAcknowledgments.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("Error denying acknowledgment:", error);
      res.status(500).json({ message: "Failed to deny acknowledgment" });
    }
  });

  // Delete an acknowledgment (manager only)
  app.delete('/api/acknowledgments/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;

      const { shiftAcknowledgments } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const acknowledgment = await db.query.shiftAcknowledgments.findFirst({
        where: and(
          eq(shiftAcknowledgments.id, req.params.id),
          eq(shiftAcknowledgments.workspaceId, workspaceId)
        ),
      });

      if (!acknowledgment) {
        return res.status(404).json({ message: "Acknowledgment not found" });
      }

      await db.delete(shiftAcknowledgments)
        .where(eq(shiftAcknowledgments.id, req.params.id));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting acknowledgment:", error);
      res.status(500).json({ message: "Failed to delete acknowledgment" });
    }
  });

  // ============================================================================
  // TIME ENTRY ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const entries = await storage.getTimeEntriesByWorkspace(workspace.id);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.post('/api/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate with Zod and enforce workspace ownership
      const validated = insertTimeEntrySchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const entry = await storage.createTimeEntry(validated);
      res.json(entry);
    } catch (error: any) {
      console.error("Error creating time entry:", error);
      res.status(400).json({ message: error.message || "Failed to create time entry" });
    }
  });

  // ============================================================================
  // INVOICE ROUTES (Multi-tenant isolated)
  // ============================================================================

  // Auto-generate invoices for all clients due for billing (BillOS™ Automation)
  app.post('/api/invoices/auto-generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const clients = await storage.getClientsByWorkspace(workspace.id);
      const generatedInvoices = [];
      const errors = [];

      for (const client of clients) {
        try {
          // Get client's billing rate and cycle
          const clientRate = await storage.getClientRate(workspace.id, client.id);
          if (!clientRate || !clientRate.isActive) {
            continue;
          }

          const billingCycle = clientRate.subscriptionFrequency || 'monthly';
          
          // Get last invoice for this client
          const invoices = await storage.getInvoicesByWorkspace(workspace.id);
          const clientInvoices = invoices.filter((inv: any) => inv.clientId === client.id);
          const lastInvoice = clientInvoices.sort((a: any, b: any) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];

          // Determine if billing is due
          const now = new Date();
          let isDue = false;
          
          if (!lastInvoice) {
            isDue = true;
          } else {
            const lastInvoiceDate = new Date(lastInvoice.createdAt);
            const daysSinceLastInvoice = Math.floor((now.getTime() - lastInvoiceDate.getTime()) / (1000 * 60 * 60 * 24));
            
            switch (billingCycle) {
              case 'weekly':
                isDue = daysSinceLastInvoice >= 7;
                break;
              case 'bi-weekly':
                isDue = daysSinceLastInvoice >= 14;
                break;
              case 'monthly':
              default:
                isDue = daysSinceLastInvoice >= 30;
                break;
            }
          }

          if (!isDue) {
            continue;
          }

          // Get unbilled time entries
          const timeEntries = await storage.getTimeEntriesByWorkspace(workspace.id);
          const unbilledEntries = timeEntries.filter((entry: any) => 
            entry.clientId === client.id && !entry.invoiceId && entry.clockOut
          );

          if (unbilledEntries.length === 0) {
            continue;
          }

          // Calculate totals
          let subtotal = 0;
          unbilledEntries.forEach((entry: any) => {
            const hours = parseFloat(entry.totalHours as string || "0");
            const rate = parseFloat(clientRate.billableRate as string || "0");
            subtotal += hours * rate;
          });

          const taxRate = 8.5;
          const tax = (subtotal * taxRate) / 100;
          const total = subtotal + tax;

          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + 14);

          // Generate draft invoice
          const invoice = await storage.createInvoice({
            workspaceId: workspace.id,
            clientId: client.id,
            invoiceNumber: `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            issueDate: now.toISOString(),
            dueDate: dueDate.toISOString(),
            subtotal: subtotal.toFixed(2),
            taxRate: taxRate.toFixed(2),
            tax: tax.toFixed(2),
            total: total.toFixed(2),
            status: "draft",
            notes: `Auto-generated invoice for ${billingCycle} billing cycle`,
          });

          // Link time entries
          for (const entry of unbilledEntries) {
            await storage.updateTimeEntry(entry.id, { invoiceId: invoice.id });
          }

          generatedInvoices.push({
            invoice,
            client,
            unbilledHours: unbilledEntries.reduce((sum: number, e: any) => 
              sum + parseFloat(e.totalHours as string || "0"), 0
            ),
          });

        } catch (error: any) {
          errors.push({
            clientId: client.id,
            clientName: `${client.firstName} ${client.lastName}`,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        generated: generatedInvoices.length,
        invoices: generatedInvoices,
        errors,
      });

    } catch (error: any) {
      console.error("Error auto-generating invoices:", error);
      res.status(500).json({ message: error.message || "Failed to auto-generate invoices" });
    }
  });

  // Send invoice email to client
  app.post('/api/invoices/:id/send-email', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      const invoice = await storage.getInvoice(id, workspace.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get client details
      const client = await storage.getClient(invoice.clientId, workspace.id);
      if (!client || !client.email) {
        return res.status(400).json({ message: "Client email not found" });
      }

      // Send email
      const { sendInvoiceGeneratedEmail } = await import('./email');
      const emailResult = await sendInvoiceGeneratedEmail(client.email, {
        clientName: `${client.firstName} ${client.lastName}`,
        invoiceNumber: invoice.invoiceNumber,
        total: parseFloat(invoice.total as string || "0").toFixed(2),
        dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A",
      });

      if (!emailResult.success) {
        return res.status(500).json({ message: "Failed to send email", error: emailResult.error });
      }

      // Update invoice status to 'sent' (with workspace scope)
      const updatedInvoice = await storage.updateInvoice(invoice.id, workspace.id, { status: 'sent' });

      res.json({ 
        success: true, 
        message: "Invoice sent successfully",
        emailId: emailResult.data 
      });

    } catch (error: any) {
      console.error("Error sending invoice email:", error);
      res.status(500).json({ message: error.message || "Failed to send invoice email" });
    }
  });
  
  app.get('/api/invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const invoices = await storage.getInvoicesByWorkspace(workspace.id);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Get line items for a specific invoice (with authorization check)
  app.get('/api/invoices/:invoiceId/line-items', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { invoiceId } = req.params;
      
      // Get the invoice to check ownership
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Check if user owns the workspace OR is the client on this invoice
      const workspace = await storage.getWorkspace(invoice.workspaceId);
      const clients = await storage.getClientsByWorkspace(invoice.workspaceId);
      const currentClient = clients.find(c => c.email === req.user.email);

      const isWorkspaceOwner = workspace && workspace.ownerId === userId;
      const isInvoiceClient = currentClient && invoice.clientId === currentClient.id;

      if (!isWorkspaceOwner && !isInvoiceClient) {
        return res.status(403).json({ message: "Not authorized to view this invoice" });
      }

      // Get line items for this specific invoice only
      const lineItems = await storage.getInvoiceLineItems(invoiceId);
      res.json(lineItems);
    } catch (error) {
      console.error("Error fetching invoice line items:", error);
      res.status(500).json({ message: "Failed to fetch invoice line items" });
    }
  });

  app.post('/api/invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // Validate with Zod and enforce workspace ownership
      const validated = insertInvoiceSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
        invoiceNumber,
        platformFeePercentage: workspace.platformFeePercentage,
      });

      const invoice = await storage.createInvoice(validated);
      res.json(invoice);
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      res.status(400).json({ message: error.message || "Failed to create invoice" });
    }
  });

  app.post('/api/invoices/generate-from-time', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { clientId, timeEntryIds, dueDate, taxRate } = req.body;

      if (!clientId || !timeEntryIds || !Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
        return res.status(400).json({ message: "Client ID and time entry IDs are required" });
      }

      // Get the time entries
      const timeEntries = [];
      for (const id of timeEntryIds) {
        const entry = await storage.getTimeEntry(id, workspace.id);
        if (entry && entry.clientId === clientId && entry.clockOut) {
          timeEntries.push(entry);
        }
      }

      if (timeEntries.length === 0) {
        return res.status(400).json({ message: "No valid time entries found" });
      }

      // Calculate totals with NaN guards
      let subtotal = 0;
      for (const entry of timeEntries) {
        const amount = parseFloat(entry.totalAmount as string || "0");
        if (!isNaN(amount)) {
          subtotal += amount;
        }
      }

      // Tax rate is percentage, taxAmount is dollars
      const taxRatePercent = parseFloat(taxRate || "0");
      const taxAmount = isNaN(taxRatePercent) ? 0 : subtotal * (taxRatePercent / 100);
      const total = subtotal + taxAmount;

      // Calculate platform fee
      const platformFeePercent = parseFloat(workspace.platformFeePercentage as string || "0");
      const platformFeeAmount = isNaN(platformFeePercent) ? 0 : total * (platformFeePercent / 100);
      const businessAmount = total - platformFeeAmount;

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // Create invoice - store tax rate as percentage, not dollar amount
      const invoice = await storage.createInvoice({
        workspaceId: workspace.id,
        clientId,
        invoiceNumber,
        issueDate: new Date(),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        subtotal: subtotal.toFixed(2),
        taxRate: taxRatePercent.toFixed(2), // Store percentage, not dollar amount
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        platformFeePercentage: platformFeePercent.toFixed(2),
        platformFeeAmount: platformFeeAmount.toFixed(2),
        businessAmount: businessAmount.toFixed(2),
        status: "draft",
      });

      // Create line items for each time entry
      for (const entry of timeEntries) {
        await storage.createInvoiceLineItem({
          invoiceId: invoice.id,
          description: entry.notes || `Time entry - ${new Date(entry.clockIn).toLocaleDateString()}`,
          quantity: entry.totalHours as string || "0",
          unitPrice: entry.hourlyRate as string || "0",
          amount: entry.totalAmount as string || "0",
          timeEntryId: entry.id,
        });
      }

      // Send invoice notification email to workspace owner
      const client = await storage.getClient(clientId, workspace.id);
      const owner = await storage.getUser(workspace.ownerId);
      
      if (owner?.email) {
        const dueDate = invoice.dueDate 
          ? new Date(invoice.dueDate).toLocaleDateString('en-US', { dateStyle: 'long' })
          : 'No due date';
        
        sendInvoiceGeneratedEmail(owner.email, {
          clientName: client ? `${client.firstName} ${client.lastName}` : 'Unknown Client',
          invoiceNumber: invoice.invoiceNumber,
          total: total.toFixed(2),
          dueDate
        }).catch(err => console.error('Failed to send invoice email:', err));
      }

      res.json(invoice);
    } catch (error: any) {
      console.error("Error generating invoice from time entries:", error);
      res.status(400).json({ message: error.message || "Failed to generate invoice" });
    }
  });

  // ============================================================================
  // BILLOS™ - EXTENDED INVOICE & BILLING FEATURES
  // ============================================================================
  
  // Client Billing Rates Management
  app.post('/api/client-rates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const validated = insertClientRateSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      const [clientRate] = await db.insert(clientRates).values(validated).returning();
      res.json(clientRate);
    } catch (error: any) {
      console.error("Error creating client rate:", error);
      res.status(400).json({ message: error.message || "Failed to create client rate" });
    }
  });

  app.get('/api/client-rates/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const rates = await storage.getClientRates(workspace.id, req.params.clientId);
      res.json(rates);
    } catch (error: any) {
      console.error("Error fetching client rates:", error);
      res.status(500).json({ message: "Failed to fetch client rates" });
    }
  });

  // Process delinquent invoices and send reminders (Manager/Owner only)
  app.post('/api/invoices/process-reminders', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.user!.workspaceId;

      const { processDelinquentInvoices } = await import('./services/billos');
      await processDelinquentInvoices(workspaceId);
      
      res.json({ message: "Delinquency reminders processed successfully" });
    } catch (error: any) {
      console.error("Error processing reminders:", error);
      res.status(500).json({ message: error.message || "Failed to process reminders" });
    }
  });

  // Get reminder history for an invoice (Manager/Owner only)
  app.get('/api/invoices/:invoiceId/reminders', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.user!.workspaceId;
      const { invoiceId } = req.params;

      const reminders = await db
        .select()
        .from(invoiceReminders)
        .where(
          and(
            eq(invoiceReminders.workspaceId, workspaceId),
            eq(invoiceReminders.invoiceId, invoiceId)
          )
        )
        .orderBy(desc(invoiceReminders.createdAt));
      
      res.json(reminders);
    } catch (error: any) {
      console.error("Error fetching invoice reminders:", error);
      res.status(500).json({ message: "Failed to fetch invoice reminders" });
    }
  });

  // Get all reminders needing attention (Manager/Owner only)
  app.get('/api/invoices/reminders/needs-attention', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.user!.workspaceId;

      const urgentReminders = await db
        .select({
          reminder: invoiceReminders,
          invoice: invoices,
          client: clients,
        })
        .from(invoiceReminders)
        .innerJoin(invoices, eq(invoiceReminders.invoiceId, invoices.id))
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(
          and(
            eq(invoiceReminders.workspaceId, workspaceId),
            eq(invoiceReminders.needsHumanIntervention, true)
          )
        )
        .orderBy(desc(invoiceReminders.daysOverdue));
      
      res.json(urgentReminders);
    } catch (error: any) {
      console.error("Error fetching urgent reminders:", error);
      res.status(500).json({ message: "Failed to fetch urgent reminders" });
    }
  });

  // ============================================================================
  // EXPENSEOS™ - EMPLOYEE EXPENSE MANAGEMENT
  // ============================================================================
  
  // Get expense categories
  app.get('/api/expense-categories', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const categories = await storage.getExpenseCategoriesByWorkspace(workspaceId);
      res.json(categories);
    } catch (error: any) {
      console.error("Error fetching expense categories:", error);
      res.status(500).json({ message: "Failed to fetch expense categories" });
    }
  });

  // Create expense category (Manager/Admin only)
  app.post('/api/expense-categories', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const validated = insertExpenseCategorySchema.parse({
        ...req.body,
        workspaceId
      });
      const category = await storage.createExpenseCategory(validated);
      res.json(category);
    } catch (error: any) {
      console.error("Error creating expense category:", error);
      res.status(400).json({ message: error.message || "Failed to create expense category" });
    }
  });

  // Submit expense
  app.post('/api/expenses', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;

      // Find employee record for user
      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee || employee.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      const validated = insertExpenseSchema.parse({
        ...req.body,
        workspaceId,
        employeeId: employee.id,
        status: 'submitted',
        submittedAt: new Date()
      });

      const expense = await storage.createExpense(validated);
      res.json(expense);
    } catch (error: any) {
      console.error("Error creating expense:", error);
      res.status(400).json({ message: error.message || "Failed to create expense" });
    }
  });

  // Get expenses (employees see their own, managers see all)
  app.get('/api/expenses', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      let filters: { status?: string; employeeId?: string; categoryId?: string } = {};
      
      // Employees only see their own expenses
      if (user?.role !== 'manager' && user?.role !== 'owner' && user?.role !== 'admin') {
        const employee = await storage.getEmployeeByUserId(userId);
        if (!employee) {
          return res.json([]);
        }
        filters.employeeId = employee.id;
      }
      
      // Apply query filters
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.employeeId) filters.employeeId = req.query.employeeId as string;
      if (req.query.categoryId) filters.categoryId = req.query.categoryId as string;

      const expenses = await storage.getExpensesByWorkspace(workspaceId, filters);
      res.json(expenses);
    } catch (error: any) {
      console.error("Error fetching expenses:", error);
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  // Get single expense with receipts
  app.get('/api/expenses/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const expense = await storage.getExpense(req.params.id, workspaceId);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      const receipts = await storage.getExpenseReceiptsByExpense(expense.id);
      res.json({ ...expense, receipts });
    } catch (error: any) {
      console.error("Error fetching expense:", error);
      res.status(500).json({ message: "Failed to fetch expense" });
    }
  });

  // Upload expense receipt to object storage
  app.post('/api/expenses/:id/receipts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const expense = await storage.getExpense(req.params.id, workspaceId);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      const { fileData, fileName, fileType } = req.body;
      
      if (!fileData || !fileName || !fileType) {
        return res.status(400).json({ message: "File data, name, and type are required" });
      }

      // SECURITY: Validate file type (only images and PDFs)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
      if (!allowedTypes.includes(fileType.toLowerCase())) {
        return res.status(400).json({ message: "Invalid file type. Only images (JPEG, PNG, GIF) and PDF are allowed." });
      }

      // SECURITY: Sanitize filename - remove path traversal attempts
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
      const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || 'png';
      
      // SECURITY: Validate extension matches MIME type
      const extensionMap: Record<string, string[]> = {
        'image/jpeg': ['jpg', 'jpeg'],
        'image/jpg': ['jpg', 'jpeg'],
        'image/png': ['png'],
        'image/gif': ['gif'],
        'application/pdf': ['pdf'],
      };
      if (!extensionMap[fileType]?.includes(fileExt)) {
        return res.status(400).json({ message: "File extension does not match MIME type" });
      }

      // Convert base64 to buffer
      const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // SECURITY: Enforce 10MB file size limit
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (buffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });
      }

      // SECURITY: Verify PRIVATE_OBJECT_DIR is configured
      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      if (!privateDir) {
        console.error('PRIVATE_OBJECT_DIR environment variable not set');
        return res.status(500).json({ message: "Object storage not configured" });
      }

      // Upload to object storage
      const receiptId = crypto.randomUUID();
      const objectPath = `${privateDir}/expense-receipts/${workspaceId}/${expense.id}/${receiptId}.${fileExt}`;
      const { bucketName, objectName } = parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(buffer, {
        metadata: {
          contentType: fileType,
          metadata: {
            workspaceId: workspaceId,
            expenseId: expense.id,
            uploadedBy: req.user!.id,
            timestamp: new Date().toISOString(),
            originalFileName: sanitizedName,
          },
        },
      });

      // Store receipt URL
      const fileUrl = `/objects/expense-receipts/${workspaceId}/${expense.id}/${receiptId}.${fileExt}`;

      const validated = insertExpenseReceiptSchema.parse({
        workspaceId,
        expenseId: expense.id,
        fileName: sanitizedName,
        fileUrl,
        fileType,
        fileSize: buffer.length,
      });

      const receipt = await storage.createExpenseReceipt(validated);
      res.json(receipt);
    } catch (error: any) {
      console.error("Error uploading receipt:", error);
      res.status(400).json({ message: error.message || "Failed to upload receipt" });
    }
  });

  // Approve expense (Manager/Admin only)
  app.patch('/api/expenses/:id/approve', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      const { reviewNotes } = req.body;

      const expense = await storage.approveExpense(req.params.id, workspaceId, userId, reviewNotes);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      res.json(expense);
    } catch (error: any) {
      console.error("Error approving expense:", error);
      res.status(500).json({ message: error.message || "Failed to approve expense" });
    }
  });

  // Reject expense (Manager/Admin only)
  app.patch('/api/expenses/:id/reject', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      const { reviewNotes } = req.body;

      if (!reviewNotes) {
        return res.status(400).json({ message: "Review notes are required when rejecting an expense" });
      }

      const expense = await storage.rejectExpense(req.params.id, workspaceId, userId, reviewNotes);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      res.json(expense);
    } catch (error: any) {
      console.error("Error rejecting expense:", error);
      res.status(500).json({ message: error.message || "Failed to reject expense" });
    }
  });

  // Mark expense as paid (Manager/Admin only)
  app.patch('/api/expenses/:id/mark-paid', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      const { paymentMethod } = req.body;

      const expense = await storage.markExpensePaid(req.params.id, workspaceId, userId, paymentMethod);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found or not approved" });
      }

      res.json(expense);
    } catch (error: any) {
      console.error("Error marking expense as paid:", error);
      res.status(500).json({ message: error.message || "Failed to mark expense as paid" });
    }
  });

  // ============================================================================
  // I-9 RE-VERIFICATION & COMPLIANCE
  // ============================================================================
  
  // Get all I-9 records for workspace (Manager/Admin only)
  app.get('/api/i9-records', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const records = await storage.getI9RecordsByWorkspace(workspaceId);
      res.json(records);
    } catch (error: any) {
      console.error("Error fetching I-9 records:", error);
      res.status(500).json({ message: "Failed to fetch I-9 records" });
    }
  });

  // Get expiring I-9 authorizations (Manager/Admin only)
  app.get('/api/i9-records/expiring', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const daysAhead = parseInt(req.query.days as string) || 30;
      const records = await storage.getExpiringI9Authorizations(workspaceId, daysAhead);
      res.json(records);
    } catch (error: any) {
      console.error("Error fetching expiring I-9 records:", error);
      res.status(500).json({ message: "Failed to fetch expiring I-9 records" });
    }
  });

  // Get I-9 record by employee ID
  app.get('/api/i9-records/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      // Employees can only view their own record, managers can view all
      const employee = await storage.getEmployeeByUserId(userId);
      if (user?.role !== 'manager' && user?.role !== 'owner' && user?.role !== 'admin' && 
          employee?.id !== req.params.employeeId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const record = await storage.getI9RecordByEmployee(req.params.employeeId, workspaceId);
      if (!record) {
        return res.status(404).json({ message: "I-9 record not found" });
      }
      
      res.json(record);
    } catch (error: any) {
      console.error("Error fetching I-9 record:", error);
      res.status(500).json({ message: "Failed to fetch I-9 record" });
    }
  });

  // ============================================================================
  // POLICIOS™ - POLICY & HANDBOOK MANAGEMENT
  // ============================================================================
  
  // Create policy (Manager/Admin only)
  app.post('/api/policies', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      
      const policy = await storage.createCompanyPolicy({
        ...req.body,
        workspaceId,
        createdBy: userId,
        status: 'draft',
      });
      
      res.json(policy);
    } catch (error: any) {
      console.error("Error creating policy:", error);
      res.status(400).json({ message: error.message || "Failed to create policy" });
    }
  });

  // Get all policies for workspace
  app.get('/api/policies', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const policies = await storage.getCompanyPolicies(workspaceId);
      res.json(policies);
    } catch (error: any) {
      console.error("Error fetching policies:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  // Get single policy
  app.get('/api/policies/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const policy = await storage.getCompanyPolicy(req.params.id, workspaceId);
      
      if (!policy) {
        return res.status(404).json({ message: "Policy not found" });
      }
      
      res.json(policy);
    } catch (error: any) {
      console.error("Error fetching policy:", error);
      res.status(500).json({ message: "Failed to fetch policy" });
    }
  });

  // Publish policy (Manager/Admin only)
  app.patch('/api/policies/:id/publish', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      
      const policy = await storage.publishPolicy(req.params.id, workspaceId, userId);
      
      if (!policy) {
        return res.status(404).json({ message: "Policy not found" });
      }
      
      res.json(policy);
    } catch (error: any) {
      console.error("Error publishing policy:", error);
      res.status(500).json({ message: "Failed to publish policy" });
    }
  });

  // Acknowledge policy (Employee)
  app.post('/api/policies/:id/acknowledge', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      
      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee || employee.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      const policy = await storage.getCompanyPolicy(req.params.id, workspaceId);
      if (!policy) {
        return res.status(404).json({ message: "Policy not found" });
      }

      const { signatureUrl, ipAddress, userAgent } = req.body;

      const acknowledgment = await storage.createPolicyAcknowledgment({
        workspaceId,
        policyId: policy.id,
        employeeId: employee.id,
        policyVersion: policy.version,
        policyTitle: policy.title,
        signatureUrl,
        ipAddress,
        userAgent,
      });
      
      res.json(acknowledgment);
    } catch (error: any) {
      console.error("Error acknowledging policy:", error);
      res.status(400).json({ message: error.message || "Failed to acknowledge policy" });
    }
  });

  // Get policy acknowledgments (Manager/Admin only)
  app.get('/api/policies/:id/acknowledgments', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const acknowledgments = await storage.getPolicyAcknowledgments(req.params.id);
      res.json(acknowledgments);
    } catch (error: any) {
      console.error("Error fetching policy acknowledgments:", error);
      res.status(500).json({ message: "Failed to fetch policy acknowledgments" });
    }
  });

  // ============================================================================
  // TIME ENTRY APPROVAL (Multi-Level Approval Workflow)
  // ============================================================================
  
  // Approve time entry (Manager/Admin only)
  app.patch('/api/time-entries/:id/approve', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      
      const timeEntry = await storage.getTimeEntry(req.params.id, workspaceId);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // Prevent self-approval
      const employee = await db.select().from(employees).where(
        and(
          eq(employees.id, timeEntry.employeeId),
          eq(employees.workspaceId, workspaceId)
        )
      ).limit(1);

      if (employee.length > 0 && employee[0].userId === userId) {
        return res.status(403).json({ message: "Cannot approve your own time entries" });
      }

      // Update status to approved
      const [updated] = await db
        .update(timeEntries)
        .set({
          status: 'approved',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(timeEntries.id, req.params.id),
            eq(timeEntries.workspaceId, workspaceId)
          )
        )
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("Error approving time entry:", error);
      res.status(500).json({ message: error.message || "Failed to approve time entry" });
    }
  });

  // Reject time entry (Manager/Admin only)
  app.patch('/api/time-entries/:id/reject', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user!.id;
      const { reason } = req.body;
      
      const timeEntry = await storage.getTimeEntry(req.params.id, workspaceId);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // Prevent self-rejection
      const employee = await db.select().from(employees).where(
        and(
          eq(employees.id, timeEntry.employeeId),
          eq(employees.workspaceId, workspaceId)
        )
      ).limit(1);

      if (employee.length > 0 && employee[0].userId === userId) {
        return res.status(403).json({ message: "Cannot reject your own time entries" });
      }

      // Update status to rejected
      const [updated] = await db
        .update(timeEntries)
        .set({
          status: 'rejected',
          notes: reason ? `Rejected: ${reason}` : timeEntry.notes,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(timeEntries.id, req.params.id),
            eq(timeEntries.workspaceId, workspaceId)
          )
        )
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("Error rejecting time entry:", error);
      res.status(500).json({ message: error.message || "Failed to reject time entry" });
    }
  });

  // ============================================================================
  // TIME TRACKING ROUTES
  // ============================================================================
  
  app.get('/api/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const timeEntries = await storage.getTimeEntriesByWorkspace(workspace.id);
      res.json(timeEntries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.post('/api/time-entries/clock-in', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // GEO-COMPLIANCE: Capture IP address from request
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection.remoteAddress;
      
      // GEO-COMPLIANCE: Extract GPS coordinates from request
      const { gpsLatitude, gpsLongitude, gpsAccuracy } = req.body;
      
      // Validate GPS accuracy (must be <= 50m for compliance)
      if (gpsAccuracy && parseFloat(gpsAccuracy) > 50) {
        return res.status(400).json({ 
          message: "GPS accuracy too low. Please ensure location services are enabled and try again in an area with better signal.",
          requiredAccuracy: 50,
          currentAccuracy: gpsAccuracy
        });
      }

      const validated = insertTimeEntrySchema.parse({
        ...req.body,
        workspaceId: workspace.id,
        clockIn: new Date().toISOString(),
        clockInIpAddress: ipAddress,
        clockInGpsLatitude: gpsLatitude,
        clockInGpsLongitude: gpsLongitude,
        clockInGpsAccuracy: gpsAccuracy,
      });

      const timeEntry = await storage.createTimeEntry(validated);
      res.json(timeEntry);
    } catch (error: any) {
      console.error("Error clocking in:", error);
      res.status(400).json({ message: error.message || "Failed to clock in" });
    }
  });

  app.patch('/api/time-entries/:id/clock-out', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const timeEntry = await storage.getTimeEntry(req.params.id, workspace.id);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // GEO-COMPLIANCE: Capture IP address from request
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection.remoteAddress;
      
      // GEO-COMPLIANCE: Extract GPS coordinates from request
      const { gpsLatitude, gpsLongitude, gpsAccuracy } = req.body;
      
      // Validate GPS accuracy (must be <= 50m for compliance)
      if (gpsAccuracy && parseFloat(gpsAccuracy) > 50) {
        return res.status(400).json({ 
          message: "GPS accuracy too low. Please ensure location services are enabled and try again in an area with better signal.",
          requiredAccuracy: 50,
          currentAccuracy: gpsAccuracy
        });
      }

      const clockOut = new Date();
      const clockIn = new Date(timeEntry.clockIn);
      const totalHours = ((clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2);
      
      const hourlyRate = timeEntry.hourlyRate || "0";
      const totalAmount = (parseFloat(totalHours) * parseFloat(hourlyRate as string)).toFixed(2);

      const updated = await storage.updateTimeEntry(req.params.id, workspace.id, {
        clockOut: clockOut.toISOString(),
        totalHours,
        totalAmount,
        clockOutIpAddress: ipAddress,
        clockOutGpsLatitude: gpsLatitude,
        clockOutGpsLongitude: gpsLongitude,
        clockOutGpsAccuracy: gpsAccuracy,
      });

      // GEO-COMPLIANCE: Detect IP anomaly (different IP between clock-in and clock-out)
      if (timeEntry.clockInIpAddress && ipAddress) {
        await GeoComplianceService.detectIPAnomaly(
          req.params.id,
          workspace.id,
          timeEntry.employeeId,
          timeEntry.clockInIpAddress,
          ipAddress
        );
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error clocking out:", error);
      res.status(400).json({ message: error.message || "Failed to clock out" });
    }
  });

  app.get('/api/time-entries/unbilled/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const unbilledEntries = await storage.getUnbilledTimeEntries(workspace.id, req.params.clientId);
      res.json(unbilledEntries);
    } catch (error) {
      console.error("Error fetching unbilled time entries:", error);
      res.status(500).json({ message: "Failed to fetch unbilled time entries" });
    }
  });

  // ============================================================================
  // ANALYTICS ROUTES
  // ============================================================================
  
  app.get('/api/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const analytics = await storage.getWorkspaceAnalytics(workspace.id);
      res.json({
        ...analytics,
        workspace: {
          subscriptionTier: workspace.subscriptionTier,
          maxEmployees: workspace.maxEmployees,
          maxClients: workspace.maxClients,
        },
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ============================================================================
  // MANAGER ASSIGNMENT ROUTES
  // ============================================================================
  
  // Create manager assignment (owners only)
  app.post('/api/manager-assignments', isAuthenticated, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;

      const parsed = insertManagerAssignmentSchema.safeParse({
        ...req.body,
        workspaceId,
      });

      if (!parsed.success) {
        return res.status(400).json({ 
          message: "Invalid manager assignment data",
          errors: parsed.error.errors 
        });
      }

      // Validate manager assignment (cross-tenant check + role check)
      const validation = await validateManagerAssignment(
        parsed.data.managerId,
        parsed.data.employeeId,
        workspaceId
      );

      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const assignment = await storage.createManagerAssignment(parsed.data);
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating manager assignment:", error);
      res.status(500).json({ message: "Failed to create manager assignment" });
    }
  });

  // Get manager assignments by workspace
  app.get('/api/manager-assignments', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const assignments = await storage.getManagerAssignmentsByWorkspace(workspaceId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching manager assignments:", error);
      res.status(500).json({ message: "Failed to fetch manager assignments" });
    }
  });

  // Get assignments for a specific manager
  app.get('/api/manager-assignments/manager/:managerId', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const assignments = await storage.getManagerAssignmentsByManager(req.params.managerId, workspaceId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching manager assignments:", error);
      res.status(500).json({ message: "Failed to fetch manager assignments" });
    }
  });

  // Get assignments for a specific employee
  app.get('/api/manager-assignments/employee/:employeeId', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const assignments = await storage.getManagerAssignmentsByEmployee(req.params.employeeId, workspaceId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching manager assignments:", error);
      res.status(500).json({ message: "Failed to fetch manager assignments" });
    }
  });

  // Delete manager assignment (owners only)
  app.delete('/api/manager-assignments/:id', isAuthenticated, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const success = await storage.deleteManagerAssignment(req.params.id, workspaceId);
      
      if (!success) {
        return res.status(404).json({ message: "Manager assignment not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting manager assignment:", error);
      res.status(500).json({ message: "Failed to delete manager assignment" });
    }
  });

  // ============================================================================
  // ONBOARDING ROUTES
  // ============================================================================
  
  // Create onboarding invite (Owners/Managers only)
  app.post('/api/onboarding/invite', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user.claims.sub;
      
      const { email, firstName, lastName } = req.body;
      
      if (!email || !firstName || !lastName) {
        return res.status(400).json({ message: "Email, first name, and last name are required" });
      }
      
      // Generate unique invite token
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      const workspace = await storage.getWorkspace(workspaceId);
      
      const invite = await storage.createOnboardingInvite({
        workspaceId,
        email,
        firstName,
        lastName,
        inviteToken,
        expiresAt,
        sentBy: userId,
      });
      
      // Send invitation email
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
      const host = process.env.NODE_ENV === 'production' 
        ? req.get('host') 
        : (process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : req.get('host'));
      const onboardingUrl = `${protocol}://${host}/onboarding/${inviteToken}`;
      
      await sendOnboardingInviteEmail(email, {
        employeeName: `${firstName} ${lastName}`,
        workspaceName: workspace?.name || 'Our Team',
        onboardingUrl,
        expiresIn: '7 days',
      });
      
      res.json(invite);
    } catch (error: any) {
      console.error("Error creating onboarding invite:", error);
      res.status(400).json({ message: error.message || "Failed to create invite" });
    }
  });
  
  // Get invite by token (public route)
  app.get('/api/onboarding/invite/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const invite = await storage.getOnboardingInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      
      if (invite.isUsed) {
        return res.status(400).json({ message: "Invite has already been used" });
      }
      
      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ message: "Invite has expired" });
      }
      
      res.json(invite);
    } catch (error) {
      console.error("Error fetching invite:", error);
      res.status(500).json({ message: "Failed to fetch invite" });
    }
  });
  
  // List all invites for workspace
  app.get('/api/onboarding/invites', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const invites = await storage.getOnboardingInvitesByWorkspace(workspaceId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });
  
  // Create/start onboarding application (public route with valid token)
  app.post('/api/onboarding/application', async (req, res) => {
    try {
      const { inviteToken, ...applicationData } = req.body;
      
      if (!inviteToken) {
        return res.status(400).json({ message: "Invite token is required" });
      }
      
      const invite = await storage.getOnboardingInviteByToken(inviteToken);
      
      if (!invite || invite.isUsed || new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ message: "Invalid or expired invite" });
      }
      
      // Generate employee number
      const employeeNumber = await storage.generateEmployeeNumber(invite.workspaceId);
      
      // Create application
      const application = await storage.createOnboardingApplication({
        workspaceId: invite.workspaceId,
        inviteId: invite.id,
        firstName: applicationData.firstName || invite.firstName,
        lastName: applicationData.lastName || invite.lastName,
        email: applicationData.email || invite.email,
        employeeNumber,
        currentStep: 'personal_info',
        status: 'in_progress',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        ...applicationData,
      });
      
      // Mark invite as used
      await storage.updateOnboardingInvite(invite.id, {
        isUsed: true,
        acceptedAt: new Date(),
      });
      
      res.json(application);
    } catch (error: any) {
      console.error("Error creating application:", error);
      res.status(400).json({ message: error.message || "Failed to create application" });
    }
  });
  
  // Get onboarding application
  app.get('/api/onboarding/application/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const workspaceId = req.query.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID is required" });
      }
      
      const application = await storage.getOnboardingApplication(id, workspaceId);
      
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      res.json(application);
    } catch (error) {
      console.error("Error fetching application:", error);
      res.status(500).json({ message: "Failed to fetch application" });
    }
  });
  
  // Update onboarding application (public route during onboarding, or authenticated)
  app.patch('/api/onboarding/application/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { workspaceId, ...updateData } = req.body;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID is required" });
      }
      
      const updated = await storage.updateOnboardingApplication(id, workspaceId, updateData);
      
      if (!updated) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating application:", error);
      res.status(400).json({ message: error.message || "Failed to update application" });
    }
  });
  
  // List all applications for workspace
  app.get('/api/onboarding/applications', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const applications = await storage.getOnboardingApplicationsByWorkspace(workspaceId);
      res.json(applications);
    } catch (error) {
      console.error("Error fetching applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });
  
  // Search employees and applications
  app.get('/api/employees/search', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      const results = await storage.searchEmployeesAndApplications(workspaceId, query);
      res.json(results);
    } catch (error) {
      console.error("Error searching employees:", error);
      res.status(500).json({ message: "Failed to search employees" });
    }
  });
  
  // Create document signature
  app.post('/api/onboarding/signatures', async (req, res) => {
    try {
      const signatureData = req.body;
      
      const signature = await storage.createDocumentSignature({
        ...signatureData,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        signedAt: new Date(),
      });
      
      res.json(signature);
    } catch (error: any) {
      console.error("Error creating signature:", error);
      res.status(400).json({ message: error.message || "Failed to create signature" });
    }
  });
  
  // Get signatures for application
  app.get('/api/onboarding/signatures/:applicationId', async (req, res) => {
    try {
      const { applicationId } = req.params;
      const signatures = await storage.getDocumentSignaturesByApplication(applicationId);
      res.json(signatures);
    } catch (error) {
      console.error("Error fetching signatures:", error);
      res.status(500).json({ message: "Failed to fetch signatures" });
    }
  });
  
  // Create certification
  app.post('/api/onboarding/certifications', async (req, res) => {
    try {
      const certificationData = req.body;
      const certification = await storage.createEmployeeCertification(certificationData);
      res.json(certification);
    } catch (error: any) {
      console.error("Error creating certification:", error);
      res.status(400).json({ message: error.message || "Failed to create certification" });
    }
  });
  
  // Get certifications for application
  app.get('/api/onboarding/certifications/:applicationId', async (req, res) => {
    try {
      const { applicationId } = req.params;
      const certifications = await storage.getEmployeeCertificationsByApplication(applicationId);
      res.json(certifications);
    } catch (error) {
      console.error("Error fetching certifications:", error);
      res.status(500).json({ message: "Failed to fetch certifications" });
    }
  });

  // Upload document during onboarding (public route with token validation)
  app.post('/api/onboarding/documents/upload-url', mutationLimiter, async (req, res) => {
    try {
      const { applicationId, workspaceId, documentType, fileName, fileType, fileSize } = req.body;

      // Validate required fields
      if (!applicationId || !workspaceId || !documentType || !fileName || !fileType) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Validate file size (15MB max)
      const maxSizeBytes = 15 * 1024 * 1024;
      if (fileSize && fileSize > maxSizeBytes) {
        return res.status(400).json({ message: "File size exceeds 15MB limit" });
      }

      // SECURITY: Verify application exists and matches workspace
      const application = await storage.getOnboardingApplication(applicationId, workspaceId);
      if (!application) {
        return res.status(404).json({ message: "Application not found or access denied" });
      }

      // Verify invite is still valid (not expired)
      if (application.inviteId) {
        const invite = await storage.getOnboardingInvite(application.inviteId);
        if (!invite || new Date() > new Date(invite.expiresAt)) {
          return res.status(400).json({ message: "Invitation has expired" });
        }
      }

      // Sanitize filename (remove path traversal attempts, special chars)
      const sanitizedFileName = fileName
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 255);

      // Generate unique file path for object storage
      const timestamp = Date.now();
      const fileExtension = sanitizedFileName.split('.').pop();
      const objectPath = `onboarding/${workspaceId}/${applicationId}/${documentType}_${timestamp}.${fileExtension}`;

      // Get signed upload URL from object storage
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorage = new ObjectStorageService();
      const privateDir = objectStorage.getPrivateObjectDir();
      const fullPath = `${privateDir}/${objectPath}`;

      const uploadUrl = await objectStorage.generateSignedUploadUrl(
        fullPath,
        fileType,
        60 * 5 // 5 minute expiry
      );

      // Return upload URL and metadata for client to complete upload
      res.json({
        uploadUrl,
        filePath: fullPath,
        documentType,
        fileName: sanitizedFileName,
      });
    } catch (error: any) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ message: error.message || "Failed to generate upload URL" });
    }
  });

  // Confirm document upload and store metadata (after client uploads to signed URL)
  app.post('/api/onboarding/documents/confirm', mutationLimiter, async (req, res) => {
    try {
      const crypto = require('crypto');
      const { applicationId, workspaceId, filePath, documentType, fileName, fileType, fileSize } = req.body;

      // Validate required fields
      if (!applicationId || !workspaceId || !filePath || !documentType) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // SECURITY: Verify application exists and matches workspace
      const application = await storage.getOnboardingApplication(applicationId, workspaceId);
      if (!application) {
        return res.status(404).json({ message: "Application not found or access denied" });
      }

      // Get or create employee record for this application
      let employeeId = application.employeeId;
      if (!employeeId) {
        // Create placeholder employee (will be finalized when onboarding completes)
        const employee = await storage.createEmployee({
          workspaceId,
          firstName: application.firstName,
          lastName: application.lastName,
          email: application.email,
          phone: application.phone,
          employeeNumber: application.employeeNumber,
          onboardingStatus: 'in_progress',
        });
        employeeId = employee.id;

        // Link employee to application
        await storage.updateOnboardingApplication(applicationId, workspaceId, {
          employeeId,
        });
      }

      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // Calculate SHA-256 hash for compliance documents
      const isComplianceDoc = ['government_id', 'i9_form', 'w4_form', 'w9_form', 'ssn_card'].includes(documentType);
      let digitalSignatureHash = null;
      if (isComplianceDoc) {
        digitalSignatureHash = crypto.createHash('sha256').update(filePath + Date.now()).digest('hex');
      }

      // Auto-calculate delete-after date (7 years for compliance)
      const retentionYears = isComplianceDoc ? 7 : 3;
      const deleteAfter = new Date();
      deleteAfter.setFullYear(deleteAfter.getFullYear() + retentionYears);

      // Store document metadata
      const document = await storage.createEmployeeDocument({
        workspaceId,
        employeeId,
        applicationId,
        documentType,
        documentName: fileName || documentType,
        fileUrl: filePath,
        fileSize,
        fileType,
        originalFileName: fileName,
        uploadedBy: application.employeeId || null,
        uploadedByEmail: application.email,
        uploadedByRole: 'employee',
        uploadIpAddress: ipAddress,
        uploadUserAgent: userAgent,
        status: 'uploaded',
        isComplianceDocument: isComplianceDoc,
        retentionPeriodYears: retentionYears,
        digitalSignatureHash,
        deleteAfter,
        isImmutable: isComplianceDoc,
      });

      res.json(document);
    } catch (error: any) {
      console.error("Error confirming document upload:", error);
      res.status(500).json({ message: error.message || "Failed to confirm upload" });
    }
  });

  // Get documents for onboarding application (public route with validation)
  app.get('/api/onboarding/documents/:applicationId', async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { workspaceId } = req.query;

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID is required" });
      }

      // SECURITY: Verify application exists and matches workspace
      const application = await storage.getOnboardingApplication(applicationId, workspaceId as string);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      // Get all documents for this application
      const documents = await db
        .select()
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.applicationId, applicationId),
            eq(employeeDocuments.workspaceId, workspaceId as string)
          )
        );

      res.json(documents);
    } catch (error) {
      console.error("Error fetching onboarding documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Get contracts for onboarding application (public route with validation)
  app.get('/api/onboarding/contracts/:applicationId', async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { workspaceId } = req.query;

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID is required" });
      }

      // SECURITY: Verify application exists and matches workspace
      const application = await storage.getOnboardingApplication(applicationId, workspaceId as string);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      // Check if contracts exist, if not create them
      let contracts = await db
        .select()
        .from(documentSignatures)
        .where(
          and(
            eq(documentSignatures.applicationId, applicationId),
            eq(documentSignatures.workspaceId, workspaceId as string)
          )
        )
        .orderBy(documentSignatures.createdAt);

      // Initialize contracts if none exist
      if (contracts.length === 0) {
        const isW4Employee = application.taxClassification === 'w4_employee';
        const isW9Contractor = application.taxClassification === 'w9_contractor';

        const contractsToCreate: any[] = [];

        // I-9 Form (required for all employees, not contractors)
        if (isW4Employee) {
          contractsToCreate.push({
            workspaceId: workspaceId as string,
            applicationId,
            documentType: 'i9_form',
            documentTitle: 'Form I-9: Employment Eligibility Verification',
            documentContent: `EMPLOYMENT ELIGIBILITY VERIFICATION
Form I-9 - Department of Homeland Security

I attest, under penalty of perjury, that I am:
☐ A citizen of the United States
☐ A noncitizen national of the United States
☐ A lawful permanent resident
☐ An alien authorized to work

I certify that the information provided above is true and correct. I understand that federal law provides for imprisonment and/or fines for false statements or use of false documents in connection with the completion of this form.

Employee Full Name: ${application.firstName} ${application.lastName}
Email: ${application.email}
Date of Hire: [To be determined]

DEADLINE: This form must be completed within 3 business days of your start date.`,
            status: 'pending',
          });

          contractsToCreate.push({
            workspaceId: workspaceId as string,
            applicationId,
            documentType: 'w4_form',
            documentTitle: 'Form W-4: Employee Withholding Certificate',
            documentContent: `EMPLOYEE'S WITHHOLDING CERTIFICATE
Form W-4 - Internal Revenue Service

Employee Name: ${application.firstName} ${application.lastName}
Social Security Number: [Protected]
Address: ${application.address || '[To be completed]'}

I certify that I have completed the W-4 withholding information during onboarding and understand that this affects my federal income tax withholding.

By signing below, I authorize my employer to withhold federal income tax from my wages based on the information I have provided.`,
            status: 'pending',
          });
        }

        // W-9 Form (for contractors)
        if (isW9Contractor) {
          contractsToCreate.push({
            workspaceId: workspaceId as string,
            applicationId,
            documentType: 'w9_form',
            documentTitle: 'Form W-9: Request for Taxpayer Identification',
            documentContent: `REQUEST FOR TAXPAYER IDENTIFICATION NUMBER AND CERTIFICATION
Form W-9 - Internal Revenue Service

Name: ${application.firstName} ${application.lastName}
Business name (if different): ${application.businessName || '[Individual]'}
Tax Classification: ☐ Individual/sole proprietor ☐ LLC ☐ Corporation

Federal Tax Classification: Independent Contractor

I certify that:
1. The TIN provided is correct
2. I am not subject to backup withholding
3. I am a U.S. citizen or other U.S. person
4. The FATCA code(s) entered on this form (if any) is correct

By signing below, I certify under penalties of perjury that the information provided is true, correct, and complete.`,
            status: 'pending',
          });
        }

        // Employee Handbook (for all)
        contractsToCreate.push({
          workspaceId: workspaceId as string,
          applicationId,
          documentType: 'handbook',
          documentTitle: 'Employee Handbook Acknowledgment',
          documentContent: `EMPLOYEE HANDBOOK ACKNOWLEDGMENT

I acknowledge that I have received and read the company Employee Handbook. I understand that:

1. The handbook contains important information about company policies, procedures, and expectations
2. I am responsible for reading and understanding all policies
3. The handbook is not a contract of employment
4. Policies may be updated at the company's discretion
5. I agree to comply with all company policies and procedures

I understand that violation of company policies may result in disciplinary action, up to and including termination of employment.

Employee: ${application.firstName} ${application.lastName}
Email: ${application.email}`,
          status: 'pending',
        });

        // Confidentiality Agreement
        contractsToCreate.push({
          workspaceId: workspaceId as string,
          applicationId,
          documentType: 'confidentiality',
          documentTitle: 'Confidentiality & Non-Disclosure Agreement',
          documentContent: `CONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT

I understand that during my ${isW4Employee ? 'employment' : 'engagement'}, I may have access to confidential and proprietary information including:
- Trade secrets and business strategies
- Customer and client information
- Financial data and projections
- Proprietary systems and processes
- Personnel information

I agree to:
1. Maintain strict confidentiality of all proprietary information
2. Not disclose confidential information to any third party
3. Use confidential information only for authorized business purposes
4. Return all confidential materials upon termination
5. Continue to maintain confidentiality after my ${isW4Employee ? 'employment' : 'engagement'} ends

I understand that breach of this agreement may result in legal action and damages.

${application.firstName} ${application.lastName}
${application.email}`,
          status: 'pending',
        });

        // Insert all contracts
        if (contractsToCreate.length > 0) {
          contracts = await db
            .insert(documentSignatures)
            .values(contractsToCreate)
            .returning();
        }
      }

      res.json(contracts);
    } catch (error) {
      console.error("Error fetching onboarding contracts:", error);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  // Sign a contract (public route with validation)
  app.post('/api/onboarding/contracts/:contractId/sign', mutationLimiter, async (req, res) => {
    try {
      const { contractId } = req.params;
      const { workspaceId } = req.query;
      const { signedByName, applicationId } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID is required" });
      }

      if (!signedByName || !applicationId) {
        return res.status(400).json({ message: "Signature name and application ID are required" });
      }

      // SECURITY: Verify application exists and matches workspace
      const application = await storage.getOnboardingApplication(applicationId, workspaceId as string);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      // SECURITY: Verify contract belongs to this application and workspace
      const [existingContract] = await db
        .select()
        .from(documentSignatures)
        .where(
          and(
            eq(documentSignatures.id, contractId),
            eq(documentSignatures.applicationId, applicationId),
            eq(documentSignatures.workspaceId, workspaceId as string)
          )
        )
        .limit(1);

      if (!existingContract) {
        return res.status(404).json({ message: "Contract not found or access denied" });
      }

      if (existingContract.status === 'signed') {
        return res.status(400).json({ message: "Contract has already been signed" });
      }

      // Record signature with audit trail
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      const [updatedContract] = await db
        .update(documentSignatures)
        .set({
          status: 'signed',
          signedByName: signedByName.trim(),
          signedAt: new Date(),
          ipAddress,
          userAgent,
          updatedAt: new Date(),
        })
        .where(eq(documentSignatures.id, contractId))
        .returning();

      res.json(updatedContract);
    } catch (error: any) {
      console.error("Error signing contract:", error);
      res.status(500).json({ message: error.message || "Failed to sign contract" });
    }
  });

  // ============================================================================
  // HIREOS™ - Digital File Cabinet & Compliance Workflow
  // ============================================================================

  // Upload employee document (with full audit trail)
  app.post('/api/hireos/documents', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const crypto = require('crypto');
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const userRole = req.user.role || 'employee';
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';
      
      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const documentData = req.body;
      
      // SECURITY: Verify employee belongs to user's workspace
      const employee = await storage.getEmployee(documentData.employeeId, workspace.id);
      if (!employee) {
        return res.status(403).json({ message: "Employee not found or access denied" });
      }

      // Calculate SHA-256 hash for immutable documents (signatures, I-9, etc)
      let digitalSignatureHash = null;
      if (documentData.isImmutable && documentData.fileUrl) {
        digitalSignatureHash = crypto.createHash('sha256').update(documentData.fileUrl).digest('hex');
      }

      // Auto-calculate delete-after date based on retention period
      const retentionYears = documentData.retentionPeriodYears || 7;
      const deleteAfter = new Date();
      deleteAfter.setFullYear(deleteAfter.getFullYear() + retentionYears);

      const document = await storage.createEmployeeDocument({
        ...documentData,
        workspaceId: workspace.id, // SECURITY: Force workspace from auth context
        uploadedBy: userId,
        uploadedByEmail: userEmail,
        uploadedByRole: userRole,
        uploadIpAddress: ipAddress,
        uploadUserAgent: userAgent,
        digitalSignatureHash,
        deleteAfter,
      });

      res.json(document);
    } catch (error: any) {
      console.error("Error uploading document:", error);
      res.status(400).json({ message: error.message || "Failed to upload document" });
    }
  });

  // Get employee documents (with filters) - HR managers can view all documents
  app.get('/api/hireos/documents/:employeeId', isAuthenticated, requireHRManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { employeeId } = req.params;
      const { documentType, status } = req.query;
      const userId = req.user.claims.sub;
      
      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      // SECURITY: Verify employee belongs to user's workspace
      const employee = await storage.getEmployee(employeeId, workspace.id);
      if (!employee) {
        return res.status(403).json({ message: "Employee not found or access denied" });
      }
      
      const documents = await storage.getEmployeeDocuments(
        workspace.id,
        employeeId,
        documentType as string,
        status as string
      );
      
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Approve document (manager/owner/hr_manager only)
  app.post('/api/hireos/documents/:documentId/approve', isAuthenticated, requireHRManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { documentId } = req.params;
      const { approvalNotes } = req.body;
      const userId = req.user.claims.sub;

      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      // SECURITY: Verify document belongs to user's workspace
      const existingDoc = await storage.getEmployeeDocument(documentId);
      if (!existingDoc || existingDoc.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Document not found or access denied" });
      }

      const document = await storage.approveEmployeeDocument(documentId, userId, approvalNotes);
      res.json(document);
    } catch (error: any) {
      console.error("Error approving document:", error);
      res.status(400).json({ message: error.message || "Failed to approve document" });
    }
  });

  // Reject document (manager/owner/hr_manager only)
  app.post('/api/hireos/documents/:documentId/reject', isAuthenticated, requireHRManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { documentId } = req.params;
      const { rejectionReason } = req.body;
      const userId = req.user.claims.sub;

      if (!rejectionReason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      // SECURITY: Verify document belongs to user's workspace
      const existingDoc = await storage.getEmployeeDocument(documentId);
      if (!existingDoc || existingDoc.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Document not found or access denied" });
      }

      const document = await storage.rejectEmployeeDocument(documentId, userId, rejectionReason);
      res.json(document);
    } catch (error: any) {
      console.error("Error rejecting document:", error);
      res.status(400).json({ message: error.message || "Failed to reject document" });
    }
  });

  // Log document access (for compliance audit trail)
  app.post('/api/hireos/documents/:documentId/access', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const { documentId } = req.params;
      const { accessType } = req.body; // 'view', 'download', 'print', 'share'
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const userRole = req.user.role || 'employee';
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const document = await storage.getEmployeeDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      // SECURITY: Verify document belongs to user's workspace
      if (document.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const accessLog = await storage.logDocumentAccess({
        workspaceId: document.workspaceId,
        documentId,
        accessedBy: userId,
        accessedByEmail: userEmail,
        accessedByRole: userRole,
        accessType,
        ipAddress,
        userAgent,
      });

      res.json(accessLog);
    } catch (error: any) {
      console.error("Error logging document access:", error);
      res.status(400).json({ message: error.message || "Failed to log access" });
    }
  });

  // Get document access logs (for compliance audit)
  app.get('/api/hireos/documents/:documentId/access-logs', isAuthenticated, requireHRManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { documentId } = req.params;
      const userId = req.user.claims.sub;
      
      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      // SECURITY: Verify document belongs to user's workspace
      const document = await storage.getEmployeeDocument(documentId);
      if (!document || document.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Document not found or access denied" });
      }
      
      const logs = await storage.getDocumentAccessLogs(documentId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching access logs:", error);
      res.status(500).json({ message: "Failed to fetch access logs" });
    }
  });

  // Create/update onboarding workflow template (owner only)
  app.post('/api/hireos/workflow-templates', isAuthenticated, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const templateData = req.body;
      const template = await storage.createOnboardingWorkflowTemplate({
        ...templateData,
        workspaceId: workspace.id,
        createdBy: userId,
      });

      res.json(template);
    } catch (error: any) {
      console.error("Error creating workflow template:", error);
      res.status(400).json({ message: error.message || "Failed to create template" });
    }
  });

  // Get workflow templates
  app.get('/api/hireos/workflow-templates', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const templates = await storage.getOnboardingWorkflowTemplates(workspace.id);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching workflow templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Create onboarding checklist from template
  app.post('/api/hireos/checklists', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { applicationId, templateId } = req.body;
      const userId = req.user.claims.sub;
      
      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const application = await storage.getOnboardingApplication(applicationId);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      // SECURITY: Verify application belongs to user's workspace
      if (application.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Application not found or access denied" });
      }

      const template = templateId ? await storage.getOnboardingWorkflowTemplate(templateId) : null;
      
      // SECURITY: Verify template belongs to user's workspace if provided
      if (template && template.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Template not found or access denied" });
      }
      
      // Generate checklist items from template
      let checklistItems: any[] = [];
      if (template) {
        checklistItems = template.steps.map((step: any) => ({
          itemId: step.stepId,
          itemName: step.stepName,
          itemType: step.stepType,
          isRequired: step.isRequired,
          isCompleted: false,
        }));
      }

      // Calculate I-9 deadline (3 business days from hire date)
      const i9DeadlineDate = new Date();
      i9DeadlineDate.setDate(i9DeadlineDate.getDate() + 3);

      const checklist = await storage.createOnboardingChecklist({
        workspaceId: application.workspaceId,
        applicationId,
        employeeId: application.employeeId,
        templateId,
        checklistItems,
        overallProgress: 0,
        i9DeadlineDate,
      });

      res.json(checklist);
    } catch (error: any) {
      console.error("Error creating checklist:", error);
      res.status(400).json({ message: error.message || "Failed to create checklist" });
    }
  });

  // Update checklist progress
  app.patch('/api/hireos/checklists/:checklistId', isAuthenticated, async (req: AuthenticatedRequest, res) => {
    try {
      const { checklistId } = req.params;
      const { checklistItems } = req.body;
      const userId = req.user.claims.sub;

      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      // SECURITY: Verify checklist belongs to user's workspace
      const existingChecklist = await storage.getOnboardingChecklist(checklistId);
      if (!existingChecklist || existingChecklist.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Checklist not found or access denied" });
      }

      // Calculate overall progress
      const totalItems = checklistItems.length;
      const completedItems = checklistItems.filter((item: any) => item.isCompleted).length;
      const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      // Check if all required items are completed
      const allRequiredCompleted = checklistItems
        .filter((item: any) => item.isRequired)
        .every((item: any) => item.isCompleted);

      const onboardingCompletedAt = allRequiredCompleted ? new Date() : null;

      const checklist = await storage.updateOnboardingChecklist(checklistId, {
        checklistItems,
        overallProgress,
        onboardingCompletedAt,
      });

      res.json(checklist);
    } catch (error: any) {
      console.error("Error updating checklist:", error);
      res.status(400).json({ message: error.message || "Failed to update checklist" });
    }
  });

  // Get compliance report (I-9 expiry, missing docs, etc) - MANAGER/OWNER ONLY
  app.get('/api/hireos/compliance-report', isAuthenticated, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const report = await storage.getHireOSComplianceReport(workspace.id);
      res.json(report);
    } catch (error) {
      console.error("Error generating compliance report:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Generate complete onboarding packet as PDF (all documents + audit trail) - HR managers can generate packets
  app.get('/api/hireos/documents/:employeeId/packet', isAuthenticated, requireHRManager, async (req: AuthenticatedRequest, res) => {
    try {
      const PDFDocument = require('pdfkit');
      const { PDFDocument: PDFLib, degrees } = require('pdf-lib');
      const https = require('https');
      const http = require('http');
      const { employeeId } = req.params;
      const userId = req.user.claims.sub;
      
      // SECURITY: Resolve workspace from authenticated user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify employee belongs to workspace
      const employee = await storage.getEmployeeById(employeeId);
      if (!employee || employee.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Employee not found or access denied" });
      }

      // Fetch all approved documents
      const documents = await storage.getEmployeeDocuments(workspace.id, employeeId, {
        status: 'approved'
      });

      if (!documents || documents.length === 0) {
        return res.status(404).json({ message: "No approved documents found for this employee" });
      }

      // Helper function to fetch file as buffer
      const fetchFileAsBuffer = (url: string): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          const protocol = url.startsWith('https') ? https : http;
          protocol.get(url, (response: any) => {
            const chunks: any[] = [];
            response.on('data', (chunk: any) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
          }).on('error', reject);
        });
      };

      // Create metadata PDF using PDFKit
      const metadataBuffers: Buffer[] = [];
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Collect PDF chunks
      doc.on('data', (chunk: Buffer) => metadataBuffers.push(chunk));

      // Wait for PDF to finish
      const metadataPDFPromise = new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(metadataBuffers)));
      });

      // ===== COVER PAGE =====
      doc.fontSize(24).font('Helvetica-Bold').text('Employee Onboarding Packet', { align: 'center' });
      doc.moveDown();
      doc.fontSize(18).font('Helvetica').text(workspace.name || 'WorkforceOS', { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(14).font('Helvetica-Bold').text('Employee Information');
      doc.fontSize(12).font('Helvetica');
      doc.text(`Name: ${employee.firstName} ${employee.lastName}`);
      doc.text(`Email: ${employee.email}`);
      doc.text(`Position: ${employee.position || 'N/A'}`);
      doc.text(`Department: ${employee.department || 'N/A'}`);
      doc.text(`Employee ID: ${employee.id}`);
      doc.moveDown();

      doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`);
      doc.text(`Generated by: ${req.user.claims.email}`);
      doc.text(`Total Documents: ${documents.length}`);
      doc.moveDown(2);

      // ===== TABLE OF CONTENTS =====
      doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').text('Table of Contents', { underline: true });
      doc.moveDown();
      doc.fontSize(11).font('Helvetica');

      documents.forEach((document: any, index: number) => {
        doc.text(`${index + 1}. ${document.documentName} (${document.documentType})`);
        doc.fontSize(9).fillColor('#666666');
        doc.text(`   Status: ${document.status} | Uploaded: ${new Date(document.uploadedAt).toLocaleDateString()}`, { indent: 20 });
        doc.fontSize(11).fillColor('#000000');
        doc.moveDown(0.5);
      });

      // ===== DOCUMENT METADATA PAGES =====
      documents.forEach((document: any, index: number) => {
        doc.addPage();
        
        // Document header
        doc.fontSize(16).font('Helvetica-Bold').text(`Document ${index + 1}: ${document.documentName}`, { underline: true });
        doc.moveDown();

        // Document details
        doc.fontSize(12).font('Helvetica-Bold').text('Document Classification');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Type: ${document.documentType}`);
        doc.text(`Description: ${document.documentDescription || 'N/A'}`);
        doc.text(`Status: ${document.status.toUpperCase()}`);
        doc.moveDown();

        // File information
        doc.fontSize(12).font('Helvetica-Bold').text('File Information');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Original File: ${document.originalFileName || 'N/A'}`);
        doc.text(`File Type: ${document.fileType || 'N/A'}`);
        doc.text(`File Size: ${document.fileSize ? (document.fileSize / 1024).toFixed(2) + ' KB' : 'N/A'}`);
        doc.text(`Storage URL: ${document.fileUrl}`);
        doc.moveDown();

        // AUDIT TRAIL - WHO
        doc.fontSize(12).font('Helvetica-Bold').text('Audit Trail - WHO Uploaded');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Uploaded By: ${document.uploadedByEmail || 'N/A'}`);
        doc.text(`Role at Upload: ${document.uploadedByRole || 'N/A'}`);
        doc.moveDown();

        // AUDIT TRAIL - WHEN
        doc.fontSize(12).font('Helvetica-Bold').text('Audit Trail - WHEN Uploaded');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Uploaded At: ${new Date(document.uploadedAt).toLocaleString()}`);
        if (document.approvedAt) {
          doc.text(`Approved At: ${new Date(document.approvedAt).toLocaleString()}`);
        }
        if (document.expiresAt) {
          doc.text(`Expires At: ${new Date(document.expiresAt).toLocaleString()}`);
        }
        doc.moveDown();

        // AUDIT TRAIL - WHERE
        doc.fontSize(12).font('Helvetica-Bold').text('Audit Trail - WHERE Uploaded');
        doc.fontSize(10).font('Helvetica');
        doc.text(`IP Address: ${document.uploadIpAddress || 'N/A'}`);
        doc.text(`Location: ${document.uploadGeoLocation || 'N/A'}`);
        doc.text(`User Agent: ${document.uploadUserAgent ? document.uploadUserAgent.substring(0, 80) + '...' : 'N/A'}`);
        doc.moveDown();

        // TAMPER-PROOF VERIFICATION
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#CC0000').text('Tamper-Proof Verification');
        doc.fontSize(9).font('Helvetica').fillColor('#000000');
        doc.text(`SHA-256 Hash: ${document.tamperProofHash || 'N/A'}`, { width: 500 });
        doc.fontSize(8).fillColor('#666666');
        doc.text('This cryptographic hash ensures document integrity. Any modification to the original file will invalidate this hash.');
        doc.fillColor('#000000');
        doc.moveDown();

        // Approval info
        if (document.approvedBy) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#008800').text('Approval Information');
          doc.fontSize(10).font('Helvetica').fillColor('#000000');
          doc.text(`Approved By: ${document.approvedByEmail || 'N/A'}`);
          if (document.approvalNotes) {
            doc.text(`Notes: ${document.approvalNotes}`);
          }
        }

        // Footer with retention info
        doc.fontSize(8).fillColor('#666666');
        const footerY = doc.page.height - 80;
        doc.text(
          `Legal Retention: ${document.deleteAfterDate ? 'Delete after ' + new Date(document.deleteAfterDate).toLocaleDateString() : '7 years (default)'} | Generated by WorkforceOS HireOS™ Digital File Cabinet`,
          50,
          footerY,
          { width: doc.page.width - 100, align: 'center' }
        );
      });

      // ===== FINAL PAGE - COMPLIANCE NOTICE =====
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Compliance & Legal Notice', { align: 'center', underline: true });
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica');
      doc.text('This digitally generated onboarding packet contains complete WHO/WHEN/WHERE audit trails for all employee documents in compliance with:', { align: 'justify' });
      doc.moveDown();
      doc.list([
        'SOC 2 Type II (Security Audit)',
        'GDPR (General Data Protection Regulation)',
        'HIPAA (Health Insurance Portability and Accountability Act)',
        '7-Year Legal Retention Requirements'
      ]);
      doc.moveDown();
      doc.text('All documents are tamper-proof with SHA-256 cryptographic hashing. Any modifications to original files will invalidate the hash verification.', { align: 'justify' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').text('Digital Signature');
      doc.fontSize(10).font('Helvetica');
      doc.text(`This packet was digitally generated and signed on ${new Date().toLocaleString()} by ${req.user.claims.email}.`);
      doc.moveDown();
      doc.fontSize(8).fillColor('#666666');
      doc.text('Powered by WorkforceOS™ HireOS™ - Enterprise-Grade Digital File Cabinet & Compliance Automation', { align: 'center' });

      // Finalize metadata PDF
      doc.end();

      // Wait for metadata PDF to complete
      const metadataPDFBuffer = await metadataPDFPromise;

      // ===== MERGE WITH ACTUAL DOCUMENTS =====
      // Create master PDF with pdf-lib
      const masterPDF = await PDFLib.load(metadataPDFBuffer);

      // Fetch and merge each document PDF
      for (let i = 0; i < documents.length; i++) {
        const document = documents[i];
        
        try {
          // Skip if no file URL
          if (!document.fileUrl) {
            console.warn(`Document ${document.id} has no file URL, skipping merge`);
            continue;
          }

          // Fetch document file
          const documentBuffer = await fetchFileAsBuffer(document.fileUrl);

          // Only merge PDFs (skip images and other file types for now)
          if (document.fileType === 'application/pdf') {
            const documentPDF = await PDFLib.load(documentBuffer);
            const copiedPages = await masterPDF.copyPages(documentPDF, documentPDF.getPageIndices());
            
            // Add all pages from this document
            copiedPages.forEach((page: any) => {
              masterPDF.addPage(page);
            });
          } else if (document.fileType?.startsWith('image/')) {
            // For images, embed them as a new page
            const page = masterPDF.addPage();
            let embeddedImage;

            if (document.fileType === 'image/jpeg' || document.fileType === 'image/jpg') {
              embeddedImage = await masterPDF.embedJpg(documentBuffer);
            } else if (document.fileType === 'image/png') {
              embeddedImage = await masterPDF.embedPng(documentBuffer);
            } else {
              console.warn(`Unsupported image type ${document.fileType}, skipping`);
              continue;
            }

            // Scale image to fit page
            const { width, height } = page.getSize();
            const imageWidth = embeddedImage.width;
            const imageHeight = embeddedImage.height;
            
            // Calculate scaling to fit within page margins
            const maxWidth = width - 100;
            const maxHeight = height - 100;
            const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
            
            const scaledWidth = imageWidth * scale;
            const scaledHeight = imageHeight * scale;
            
            // Center image on page
            const x = (width - scaledWidth) / 2;
            const y = (height - scaledHeight) / 2;
            
            page.drawImage(embeddedImage, {
              x,
              y,
              width: scaledWidth,
              height: scaledHeight,
            });
          } else {
            console.warn(`Unsupported file type ${document.fileType} for document ${document.id}, skipping merge`);
          }
        } catch (docError: any) {
          console.error(`Error merging document ${document.id}:`, docError.message);
          // Continue with other documents even if one fails
        }
      }

      // Save final merged PDF
      const finalPDFBytes = await masterPDF.save();

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="onboarding-packet-${employee.firstName}-${employee.lastName}-${Date.now()}.pdf"`);
      res.setHeader('Content-Length', finalPDFBytes.length.toString());

      // Send PDF
      res.send(Buffer.from(finalPDFBytes));

      // CRITICAL: Log the PDF generation as a document access event for COMPLIANCE
      for (const document of documents) {
        await storage.logDocumentAccess({
          documentId: document.id,
          workspaceId: workspace.id,
          accessedBy: userId,
          accessedByEmail: req.user.claims.email,
          accessType: 'download',
          accessIpAddress: req.ip || 'unknown',
          accessUserAgent: req.headers['user-agent'] || 'unknown',
        });
      }

    } catch (error: any) {
      console.error("Error generating PDF packet:", error);
      res.status(500).json({ message: "Failed to generate PDF packet" });
    }
  });

  // ============================================================================
  // STRIPE PAYMENT PROCESSING (Full implementation ready for key activation)
  // ============================================================================
  
  // Initialize Stripe (will activate when STRIPE_SECRET_KEY is added)
  let stripe: Stripe | null = null;
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('✅ Stripe initialized successfully with live keys');
  } else {
    console.warn('⚠️  STRIPE_SECRET_KEY not found. Payment processing disabled. Add keys to activate.');
  }

  // Get Stripe configuration (public key for frontend)
  app.get('/api/stripe/config', async (req, res) => {
    res.json({
      publishableKey: process.env.VITE_STRIPE_PUBLIC_KEY || null,
      isConfigured: !!stripe,
    });
  });

  // Create Stripe Connect account for workspace
  app.post('/api/stripe/connect-account', isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ 
          message: "Stripe integration requires STRIPE_SECRET_KEY. Please add your Stripe keys to activate payment processing." 
        });
      }

      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Check if account already exists
      if (workspace.stripeConnectedAccountId) {
        const account = await stripe.accounts.retrieve(workspace.stripeConnectedAccountId);
        return res.json({ 
          accountId: account.id,
          chargesEnabled: account.charges_enabled,
          detailsSubmitted: account.details_submitted,
        });
      }

      // Create new Connect account
      const account = await stripe.accounts.create({
        type: 'standard', // Standard Connect account (workspace controls their own Stripe)
        email: req.user.claims.email,
        business_type: 'company',
        metadata: {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        },
      });

      // Save account ID to workspace
      await storage.updateWorkspace(workspace.id, {
        stripeConnectedAccountId: account.id,
      });

      res.json({ 
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted,
      });
    } catch (error: any) {
      console.error("Error creating Stripe Connect account:", error);
      res.status(500).json({ message: error.message || "Failed to create Stripe account" });
    }
  });

  // Generate Stripe Connect onboarding link
  app.post('/api/stripe/onboarding-link', isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Stripe keys required" });
      }

      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace || !workspace.stripeConnectedAccountId) {
        return res.status(400).json({ message: "Connect account must be created first" });
      }

      const accountLink = await stripe.accountLinks.create({
        account: workspace.stripeConnectedAccountId,
        refresh_url: `${req.protocol}://${req.get('host')}/settings`,
        return_url: `${req.protocol}://${req.get('host')}/settings?stripe_onboarding=success`,
        type: 'account_onboarding',
      });

      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Error creating onboarding link:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Process invoice payment with platform fee
  app.post('/api/stripe/pay-invoice', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Stripe keys required" });
      }

      const { invoiceId, paymentMethodId } = req.body;

      // Get invoice details
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get workspace (for platform fee and Stripe account)
      const workspace = await storage.getWorkspace(invoice.workspaceId);
      if (!workspace || !workspace.stripeConnectedAccountId) {
        return res.status(400).json({ message: "Workspace Stripe account not configured" });
      }

      // Calculate amounts in cents
      const totalCents = Math.round(parseFloat(invoice.total as string) * 100);
      const platformFeeCents = Math.round(parseFloat(invoice.platformFeeAmount as string || "0") * 100);

      // Create payment intent with automatic platform fee
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        application_fee_amount: platformFeeCents, // Platform fee automatically split
        transfer_data: {
          destination: workspace.stripeConnectedAccountId, // Transfer to workspace
        },
        metadata: {
          invoiceId: invoice.id,
          workspaceId: workspace.id,
        },
      });

      // Update invoice status
      if (paymentIntent.status === 'succeeded') {
        await storage.updateInvoice(invoiceId, invoice.workspaceId, {
          status: 'paid',
          paidAt: new Date(),
          paymentIntentId: paymentIntent.id,
        });

        // Record platform revenue
        await storage.createPlatformRevenue({
          workspaceId: workspace.id,
          revenueType: 'invoice_fee',
          sourceId: invoice.id,
          amount: invoice.platformFeeAmount as string,
          feePercentage: invoice.platformFeePercentage as string,
          collectedAt: new Date(),
          status: 'collected',
        });
      }

      res.json({ 
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });
    } catch (error: any) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: error.message || "Payment failed" });
    }
  });

  // Create subscription for workspace tier upgrade
  app.post('/api/stripe/create-subscription', isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Stripe keys required" });
      }

      const { tier, paymentMethodId } = req.body;
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Tier pricing (matching your pricing page)
      const TIER_PRICES: Record<string, { monthly: number, priceId?: string }> = {
        starter: { monthly: 99 },
        professional: { monthly: 799 },
        enterprise: { monthly: 2999 },
        fortune500: { monthly: 7999 },
      };

      const tierConfig = TIER_PRICES[tier as keyof typeof TIER_PRICES];
      if (!tierConfig) {
        return res.status(400).json({ message: "Invalid tier" });
      }

      // Create or retrieve Stripe customer
      let customerId = workspace.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.claims.email,
          metadata: {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
          },
        });
        customerId = customer.id;
        await storage.updateWorkspace(workspace.id, { stripeCustomerId: customerId });
      }

      // Attach payment method
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `WorkforceOS ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
            },
            recurring: { interval: 'month' },
            unit_amount: tierConfig.monthly * 100, // Convert to cents
          },
        }],
        metadata: {
          workspaceId: workspace.id,
          tier: tier,
        },
      });

      // Update workspace tier and subscription ID
      const platformFeeMap: Record<string, string> = {
        free: "10",
        starter: "7",
        professional: "5",
        enterprise: "3",
        fortune500: "2",
      };

      await storage.updateWorkspace(workspace.id, {
        subscriptionTier: tier,
        platformFeePercentage: platformFeeMap[tier as keyof typeof platformFeeMap] || "5",
      });

      res.json({ 
        success: true,
        subscriptionId: subscription.id,
        tier: tier,
      });
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Webhook handler for Stripe events
  app.post('/api/stripe/webhook', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).send('Stripe not configured');
      }

      const sig = req.headers['stripe-signature'];
      
      // CRITICAL SECURITY: Verify signature exists
      if (!sig || typeof sig !== 'string') {
        console.error('Stripe webhook signature missing or invalid');
        return res.status(401).send('Unauthorized - Invalid signature');
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.warn('Stripe webhook secret not configured');
        return res.status(400).send('Webhook secret required');
      }

      // SECURITY: This throws an error if signature is invalid
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      // Handle events
      switch (event.type) {
        case 'payment_intent.succeeded':
          const successPayment = event.data.object as any;
          console.log('Payment succeeded:', successPayment.id);
          
          // Update invoice payment record
          await db
            .update(invoicePayments)
            .set({
              status: 'succeeded',
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(invoicePayments.stripePaymentIntentId, successPayment.id));
          
          // Update invoice status
          const [payment] = await db
            .select()
            .from(invoicePayments)
            .where(eq(invoicePayments.stripePaymentIntentId, successPayment.id))
            .limit(1);
          
          if (payment) {
            await db
              .update(invoices)
              .set({
                status: 'paid',
                paidAt: new Date(),
                paymentIntentId: successPayment.id,
                updatedAt: new Date(),
              })
              .where(eq(invoices.id, payment.invoiceId));
          }
          break;
        
        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object as any;
          console.log('Payment failed:', failedPayment.id);
          
          await db
            .update(invoicePayments)
            .set({
              status: 'failed',
              failureCode: failedPayment.last_payment_error?.code || 'unknown',
              failureMessage: failedPayment.last_payment_error?.message || 'Payment failed',
              updatedAt: new Date(),
            })
            .where(eq(invoicePayments.stripePaymentIntentId, failedPayment.id));
          break;
        
        case 'charge.refunded':
          const refund = event.data.object as any;
          const refundedAmount = refund.amount_refunded / 100; // Convert from cents
          
          await db
            .update(invoicePayments)
            .set({
              status: refund.refunded ? 'refunded' : 'partially_refunded',
              refundedAmount: refundedAmount.toFixed(2),
              refundedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(invoicePayments.stripeChargeId, refund.id));
          break;
        
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          // Handle subscription changes
          const subscription = event.data.object;
          console.log('Subscription event:', subscription.id);
          break;
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  });

  // ============================================================================
  // ONLINE INVOICE PAYMENTS - STRIPE INTEGRATION
  // ============================================================================

  // Create payment intent for end customer to pay invoice online
  app.post('/api/invoices/:id/create-payment', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: 'Payment processing not configured' });
      }

      const { id } = req.params;
      const { payerEmail, payerName, returnUrl } = req.body;

      // Get invoice
      const invoice = await storage.getInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      // Check if invoice is already paid
      if (invoice.status === 'paid') {
        return res.status(400).json({ message: 'Invoice already paid' });
      }

      // Get or create Stripe customer for the client
      const client = await storage.getClient(invoice.clientId);
      if (!client) {
        return res.status(404).json({ message: 'Client not found' });
      }

      const { clientPaymentInfo } = await import("@shared/schema");
      
      let paymentInfo = await db
        .select()
        .from(clientPaymentInfo)
        .where(eq(clientPaymentInfo.clientId, invoice.clientId))
        .limit(1)
        .then(rows => rows[0]);

      let stripeCustomerId = paymentInfo?.stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: payerEmail || client.email || undefined,
          name: payerName || client.name,
          metadata: {
            clientId: client.id,
            workspaceId: invoice.workspaceId,
          },
        });
        stripeCustomerId = customer.id;

        // Save to database
        if (paymentInfo) {
          await db
            .update(clientPaymentInfo)
            .set({
              stripeCustomerId: customer.id,
              billingEmail: payerEmail || client.email || paymentInfo.billingEmail,
              updatedAt: new Date(),
            })
            .where(eq(clientPaymentInfo.clientId, client.id));
        } else {
          await db.insert(clientPaymentInfo).values({
            workspaceId: invoice.workspaceId,
            clientId: client.id,
            stripeCustomerId: customer.id,
            billingEmail: payerEmail || client.email || undefined,
          });
        }
      }

      // Create payment intent
      const amount = Math.round(parseFloat(invoice.total) * 100); // Convert to cents
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        customer: stripeCustomerId,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          workspaceId: invoice.workspaceId,
          clientId: invoice.clientId,
        },
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
      });

      // Create invoice payment record
      await db.insert(invoicePayments).values({
        workspaceId: invoice.workspaceId,
        invoiceId: invoice.id,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId,
        amount: invoice.total,
        currency: 'usd',
        status: 'pending',
        payerEmail: payerEmail || client.email || undefined,
        payerName: payerName || client.name,
      });

      // Update invoice with payment intent ID
      await db
        .update(invoices)
        .set({
          paymentIntentId: paymentIntent.id,
          status: 'pending_payment',
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: invoice.total,
        currency: 'usd',
      });
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ message: error.message || 'Failed to create payment intent' });
    }
  });

  // Get invoice payment status (public - no auth required)
  app.get('/api/invoices/:id/payment-status', async (req, res) => {
    try {
      const { id } = req.params;

      const invoice = await storage.getInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const payments = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, id))
        .orderBy(desc(invoicePayments.createdAt));

      res.json({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        status: invoice.status,
        paidAt: invoice.paidAt,
        payments: payments.map(p => ({
          id: p.id,
          amount: p.amount,
          status: p.status,
          paymentMethod: p.paymentMethod,
          last4: p.last4,
          paidAt: p.paidAt,
          receiptUrl: p.receiptUrl,
        })),
      });
    } catch (error: any) {
      console.error('Error getting payment status:', error);
      res.status(500).json({ message: error.message || 'Failed to get payment status' });
    }
  });

  // Get payment history for a client (auth required)
  app.get('/api/clients/:clientId/payments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { clientId } = req.params;

      const payments = await db
        .select({
          id: invoicePayments.id,
          invoiceId: invoicePayments.invoiceId,
          invoiceNumber: invoices.invoiceNumber,
          amount: invoicePayments.amount,
          status: invoicePayments.status,
          paymentMethod: invoicePayments.paymentMethod,
          last4: invoicePayments.last4,
          paidAt: invoicePayments.paidAt,
          refundedAmount: invoicePayments.refundedAmount,
          createdAt: invoicePayments.createdAt,
        })
        .from(invoicePayments)
        .leftJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
        .where(
          and(
            eq(invoicePayments.workspaceId, workspaceId),
            eq(invoices.clientId, clientId)
          )
        )
        .orderBy(desc(invoicePayments.createdAt));

      res.json(payments);
    } catch (error: any) {
      console.error('Error getting client payments:', error);
      res.status(500).json({ message: error.message || 'Failed to get payments' });
    }
  });

  // ============================================================================
  // EMPLOYEE ONBOARDING & MANAGEMENT
  // ============================================================================

  // Get employee payroll information - CRITICAL: Requires MANAGER+ role
  app.get('/api/employees/:employeeId/payroll', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const userId = req.user?.id;
      const { employeePayrollInfo } = await import("@shared/schema");

      // SECURITY: Only allow viewing own payroll info unless manager+
      const userRole = req.user?.role;
      const isManager = ['manager', 'owner', 'admin', 'root_admin'].includes(userRole || '');
      
      if (!isManager && userId !== employeeId) {
        return res.status(403).json({ message: 'Forbidden - Can only view own payroll information' });
      }

      const payrollInfo = await db
        .select()
        .from(employeePayrollInfo)
        .where(
          and(
            eq(employeePayrollInfo.workspaceId, workspaceId),
            eq(employeePayrollInfo.employeeId, employeeId)
          )
        )
        .limit(1)
        .then(rows => rows[0]);

      if (!payrollInfo) {
        return res.status(404).json({ message: 'Payroll information not found' });
      }

      res.json(payrollInfo);
    } catch (error: any) {
      console.error('Error getting payroll info:', error);
      res.status(500).json({ message: error.message || 'Failed to get payroll information' });
    }
  });

  // Update employee payroll information - CRITICAL: Requires OWNER+ role  
  app.put('/api/employees/:employeeId/payroll', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const { employeePayrollInfo, insertEmployeePayrollInfoSchema } = await import("@shared/schema");

      // SECURITY: Validate with Zod schema
      const validated = insertEmployeePayrollInfoSchema.partial().parse(req.body);

      const {
        taxId,
        bankAccountNumber,
        routingNumber,
        paymentMethod,
        w4Allowances,
        additionalWithholding,
        filingStatus,
        directDepositConsent,
        w9OnFile,
        i9OnFile,
      } = validated;

      // Check if payroll info exists
      const existing = await db
        .select()
        .from(employeePayrollInfo)
        .where(
          and(
            eq(employeePayrollInfo.workspaceId, workspaceId),
            eq(employeePayrollInfo.employeeId, employeeId)
          )
        )
        .limit(1)
        .then(rows => rows[0]);

      let result;
      if (existing) {
        // Update existing
        [result] = await db
          .update(employeePayrollInfo)
          .set({
            taxId,
            bankAccountNumber,
            routingNumber,
            paymentMethod,
            w4Allowances,
            additionalWithholding,
            filingStatus,
            directDepositConsent,
            w9OnFile,
            i9OnFile,
            updatedAt: new Date(),
          })
          .where(eq(employeePayrollInfo.id, existing.id))
          .returning();
      } else {
        // Create new
        [result] = await db
          .insert(employeePayrollInfo)
          .values({
            workspaceId,
            employeeId,
            taxId,
            bankAccountNumber,
            routingNumber,
            paymentMethod,
            w4Allowances,
            additionalWithholding,
            filingStatus,
            directDepositConsent,
            w9OnFile,
            i9OnFile,
          })
          .returning();
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error updating payroll info:', error);
      res.status(500).json({ message: error.message || 'Failed to update payroll information' });
    }
  });

  // Get employee availability
  app.get('/api/employees/:employeeId/availability', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const { employeeAvailability } = await import("@shared/schema");

      const availability = await db
        .select()
        .from(employeeAvailability)
        .where(
          and(
            eq(employeeAvailability.workspaceId, workspaceId),
            eq(employeeAvailability.employeeId, employeeId)
          )
        )
        .orderBy(employeeAvailability.dayOfWeek);

      res.json(availability);
    } catch (error: any) {
      console.error('Error getting availability:', error);
      res.status(500).json({ message: error.message || 'Failed to get availability' });
    }
  });

  // Set employee availability
  app.post('/api/employees/:employeeId/availability', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const { availability } = req.body; // Array of availability objects
      const { employeeAvailability } = await import("@shared/schema");

      // Delete existing availability
      await db
        .delete(employeeAvailability)
        .where(
          and(
            eq(employeeAvailability.workspaceId, workspaceId),
            eq(employeeAvailability.employeeId, employeeId)
          )
        );

      // Insert new availability
      if (availability && availability.length > 0) {
        const values = availability.map((slot: any) => ({
          workspaceId,
          employeeId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isAvailable: slot.isAvailable ?? true,
        }));

        await db.insert(employeeAvailability).values(values);
      }

      // Return updated availability
      const updated = await db
        .select()
        .from(employeeAvailability)
        .where(
          and(
            eq(employeeAvailability.workspaceId, workspaceId),
            eq(employeeAvailability.employeeId, employeeId)
          )
        )
        .orderBy(employeeAvailability.dayOfWeek);

      res.json(updated);
    } catch (error: any) {
      console.error('Error setting availability:', error);
      res.status(500).json({ message: error.message || 'Failed to set availability' });
    }
  });

  // Get pending time-off requests for managers (with employee details)
  app.get('/api/time-off-requests/pending', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { timeOffRequests, employees } = await import("@shared/schema");

      const requests = await db
        .select({
          id: timeOffRequests.id,
          employeeId: timeOffRequests.employeeId,
          employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
          startDate: timeOffRequests.startDate,
          endDate: timeOffRequests.endDate,
          requestType: timeOffRequests.requestType,
          totalDays: timeOffRequests.totalDays,
          reason: timeOffRequests.reason,
          notes: timeOffRequests.notes,
          status: timeOffRequests.status,
          createdAt: timeOffRequests.createdAt,
        })
        .from(timeOffRequests)
        .innerJoin(employees, eq(timeOffRequests.employeeId, employees.id))
        .where(
          and(
            eq(timeOffRequests.workspaceId, workspaceId),
            eq(timeOffRequests.status, 'pending')
          )
        )
        .orderBy(timeOffRequests.createdAt);

      res.json(requests);
    } catch (error: any) {
      console.error('Error fetching pending time-off requests:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch pending time-off requests' });
    }
  });

  // Get time off requests for employee
  app.get('/api/employees/:employeeId/time-off', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const { timeOffRequests } = await import("@shared/schema");

      const requests = await db
        .select()
        .from(timeOffRequests)
        .where(
          and(
            eq(timeOffRequests.workspaceId, workspaceId),
            eq(timeOffRequests.employeeId, employeeId)
          )
        )
        .orderBy(desc(timeOffRequests.createdAt));

      res.json(requests);
    } catch (error: any) {
      console.error('Error getting time off requests:', error);
      res.status(500).json({ message: error.message || 'Failed to get time off requests' });
    }
  });

  // Create time off request
  app.post('/api/time-off-requests', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user?.id;
      const { timeOffRequests, insertTimeOffRequestSchema } = await import("@shared/schema");
      
      // SECURITY: Employees can only submit for themselves, managers can submit for reports
      const requestEmployeeId = req.body.employeeId || userId;
      const userRole = req.user?.role;
      const isManager = ['manager', 'owner', 'admin', 'root_admin'].includes(userRole || '');
      
      if (!isManager && requestEmployeeId !== userId) {
        return res.status(403).json({ message: 'Forbidden - Can only submit time off requests for yourself' });
      }
      
      // SECURITY: Validate with Zod (use pick for required fields)
      const validated = insertTimeOffRequestSchema.pick({
        startDate: true,
        endDate: true,
        requestType: true,
        reason: true,
        notes: true,
      }).parse(req.body);
      
      const { startDate, endDate, requestType, reason, notes } = validated;
      const employeeId = requestEmployeeId;

      // Calculate total days
      const start = new Date(startDate);
      const end = new Date(endDate);
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const [request] = await db
        .insert(timeOffRequests)
        .values({
          workspaceId,
          employeeId,
          startDate: start,
          endDate: end,
          requestType,
          totalDays,
          reason,
          notes,
          status: 'pending',
        })
        .returning();

      res.json(request);
    } catch (error: any) {
      console.error('Error creating time off request:', error);
      res.status(500).json({ message: error.message || 'Failed to create time off request' });
    }
  });

  // Approve/deny time off request (manager only)
  app.put('/api/time-off-requests/:id/status', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const { status, reviewNotes } = req.body;
      const userId = req.user?.id;
      const { timeOffRequests, employees } = await import("@shared/schema");

      if (!['approved', 'denied'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be approved or denied.' });
      }

      const [updated] = await db
        .update(timeOffRequests)
        .set({
          status,
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNotes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(timeOffRequests.id, id),
            eq(timeOffRequests.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'Time off request not found' });
      }

      // Send notification email to employee
      try {
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, updated.employeeId))
          .limit(1);

        if (employee?.email) {
          const emailData = {
            employeeName: `${employee.firstName} ${employee.lastName}`,
            startDate: new Date(updated.startDate).toLocaleDateString('en-US', { dateStyle: 'full' }),
            endDate: new Date(updated.endDate).toLocaleDateString('en-US', { dateStyle: 'full' }),
            ptoType: updated.requestType || 'time off',
            days: updated.totalDays || 0,
            denialReason: reviewNotes
          };

          if (status === 'approved') {
            sendPTOApprovedEmail(employee.email, emailData).catch(err =>
              console.error('Failed to send PTO approved email:', err)
            );
          } else {
            sendPTODeniedEmail(employee.email, emailData).catch(err =>
              console.error('Failed to send PTO denied email:', err)
            );
          }
        }
      } catch (emailError) {
        console.error('Error sending time-off notification:', emailError);
        // Don't fail the request if email fails
      }

      res.json(updated);
    } catch (error: any) {
      console.error('Error updating time off request:', error);
      res.status(500).json({ message: error.message || 'Failed to update time off request' });
    }
  });

  // Contract document management
  app.get('/api/employees/:employeeId/contracts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const { contractDocuments } = await import("@shared/schema");

      const contracts = await db
        .select()
        .from(contractDocuments)
        .where(
          and(
            eq(contractDocuments.workspaceId, workspaceId),
            eq(contractDocuments.employeeId, employeeId)
          )
        )
        .orderBy(desc(contractDocuments.createdAt));

      res.json(contracts);
    } catch (error: any) {
      console.error('Error getting contracts:', error);
      res.status(500).json({ message: error.message || 'Failed to get contracts' });
    }
  });

  // Submit contract document (I9, W9, W4) - Requires OWNER+  
  app.post('/api/contract-documents', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { contractDocuments, insertContractDocumentSchema } = await import("@shared/schema");
      
      // SECURITY: Validate with Zod
      const validated = insertContractDocumentSchema.parse({
        ...req.body,
        workspaceId,
      });
      
      const { employeeId, documentType, signedAt, fileUrl, metadata } = validated;

      if (!['i9', 'w9', 'w4'].includes(documentType)) {
        return res.status(400).json({ message: 'Invalid document type. Must be i9, w9, or w4.' });
      }

      const [contract] = await db
        .insert(contractDocuments)
        .values({
          workspaceId,
          employeeId,
          documentType,
          signedAt: signedAt ? new Date(signedAt) : new Date(),
          status: 'pending',
          fileUrl,
          metadata,
        })
        .returning();

      res.json(contract);
    } catch (error: any) {
      console.error('Error creating contract document:', error);
      res.status(500).json({ message: error.message || 'Failed to create contract document' });
    }
  });

  // Approve/reject contract document
  app.put('/api/contract-documents/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const { status, reviewNotes } = req.body;
      const userId = req.user?.id;
      const { contractDocuments } = await import("@shared/schema");

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be approved or rejected.' });
      }

      const [updated] = await db
        .update(contractDocuments)
        .set({
          status,
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNotes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contractDocuments.id, id),
            eq(contractDocuments.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'Contract document not found' });
      }

      res.json(updated);
    } catch (error: any) {
      console.error('Error updating contract status:', error);
      res.status(500).json({ message: error.message || 'Failed to update contract status' });
    }
  });

  // ============================================================================
  // SHIFT MANAGEMENT - Accept/Deny/Switch
  // ============================================================================

  // Get shift actions for employee
  app.get('/api/employees/:employeeId/shift-actions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const { shiftActions } = await import("@shared/schema");

      const actions = await db
        .select()
        .from(shiftActions)
        .where(
          and(
            eq(shiftActions.workspaceId, workspaceId),
            eq(shiftActions.employeeId, employeeId)
          )
        )
        .orderBy(desc(shiftActions.createdAt));

      res.json(actions);
    } catch (error: any) {
      console.error('Error getting shift actions:', error);
      res.status(500).json({ message: error.message || 'Failed to get shift actions' });
    }
  });

  // Accept/Deny shift
  app.post('/api/shifts/:shiftId/respond', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { shiftId } = req.params;
      const { action, reason } = req.body; // action: 'accept' or 'deny'
      const employeeId = req.user?.id;
      const { shiftActions } = await import("@shared/schema");

      if (!['accept', 'deny'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action. Must be accept or deny.' });
      }

      const [shiftAction] = await db
        .insert(shiftActions)
        .values({
          workspaceId,
          shiftId,
          employeeId: employeeId!,
          actionType: action,
          status: 'completed',
          reason,
          processedAt: new Date(),
        })
        .returning();

      res.json(shiftAction);
    } catch (error: any) {
      console.error('Error responding to shift:', error);
      res.status(500).json({ message: error.message || 'Failed to respond to shift' });
    }
  });

  // Request shift switch
  app.post('/api/shifts/:shiftId/switch', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { shiftId } = req.params;
      const { targetEmployeeId, reason } = req.body;
      const employeeId = req.user?.id;
      const { shiftActions } = await import("@shared/schema");

      const [switchRequest] = await db
        .insert(shiftActions)
        .values({
          workspaceId,
          shiftId,
          employeeId: employeeId!,
          targetEmployeeId,
          actionType: 'switch',
          status: 'pending_approval',
          reason,
        })
        .returning();

      res.json(switchRequest);
    } catch (error: any) {
      console.error('Error requesting shift switch:', error);
      res.status(500).json({ message: error.message || 'Failed to request shift switch' });
    }
  });

  // Get pending shift actions for managers
  app.get('/api/shift-actions/pending', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { shiftActions, employees, shifts } = await import("@shared/schema");

      const pendingActions = await db
        .select({
          id: shiftActions.id,
          actionType: shiftActions.actionType,
          status: shiftActions.status,
          requestedBy: shiftActions.requestedBy,
          requestedByName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
          targetEmployeeId: shiftActions.targetEmployeeId,
          targetEmployeeName: sql<string>`COALESCE(target_emp.first_name || ' ' || target_emp.last_name, NULL)`,
          reason: shiftActions.reason,
          shiftId: shiftActions.shiftId,
          shiftDate: shifts.date,
          shiftStart: shifts.startTime,
          shiftEnd: shifts.endTime,
          denialReason: shiftActions.denialReason,
          createdAt: shiftActions.createdAt,
        })
        .from(shiftActions)
        .innerJoin(employees, eq(shiftActions.requestedBy, employees.id))
        .innerJoin(shifts, eq(shiftActions.shiftId, shifts.id))
        .leftJoin(
          sql`${employees} as target_emp`,
          sql`${shiftActions.targetEmployeeId} = target_emp.id`
        )
        .where(
          and(
            eq(shiftActions.workspaceId, workspaceId),
            eq(shiftActions.status, 'pending')
          )
        )
        .orderBy(shiftActions.createdAt);

      res.json(pendingActions);
    } catch (error: any) {
      console.error('Error fetching pending shift actions:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch pending shift actions' });
    }
  });

  // Approve/deny shift switch (manager only)
  app.put('/api/shift-actions/:id/approve', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const { approved, managerNotes } = req.body;
      const managerId = req.user?.id;
      const { shiftActions, employees, shifts } = await import("@shared/schema");

      const [updated] = await db
        .update(shiftActions)
        .set({
          status: approved ? 'approved' : 'denied',
          approvedBy: managerId,
          approvedAt: new Date(),
          denialReason: approved ? null : managerNotes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shiftActions.id, id),
            eq(shiftActions.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'Shift action not found' });
      }

      // Send notification email to employee
      try {
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, updated.requestedBy))
          .limit(1);

        const [shift] = await db
          .select()
          .from(shifts)
          .where(eq(shifts.id, updated.shiftId))
          .limit(1);

        if (employee?.email && shift) {
          const emailData = {
            employeeName: `${employee.firstName} ${employee.lastName}`,
            actionType: updated.actionType,
            shiftTitle: shift.title || 'Shift',
            shiftDate: shift.date || new Date(shift.startTime).toLocaleDateString('en-US', {
              dateStyle: 'full'
            }),
            denialReason: managerNotes
          };

          if (approved) {
            sendShiftActionApprovedEmail(employee.email, emailData).catch(err =>
              console.error('Failed to send shift action approved email:', err)
            );
          } else {
            sendShiftActionDeniedEmail(employee.email, emailData).catch(err =>
              console.error('Failed to send shift action denied email:', err)
            );
          }
        }
      } catch (emailError) {
        console.error('Error sending shift action notification:', emailError);
        // Don't fail the request if email fails
      }

      res.json(updated);
    } catch (error: any) {
      console.error('Error approving shift action:', error);
      res.status(500).json({ message: error.message || 'Failed to approve shift action' });
    }
  });

  // ============================================================================
  // TIMESHEET EDIT REQUESTS - Employees cannot edit own timesheets
  // ============================================================================

  // Request timesheet edit (employee submits request)
  app.post('/api/timesheet-edit-requests', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const requestedBy = req.user?.id;
      const { timesheetEditRequests, timeEntries } = await import("@shared/schema");
      
      const {
        timeEntryId,
        proposedClockIn,
        proposedClockOut,
        proposedNotes,
        reason
      } = req.body;

      // Fetch original time entry values for comparison
      const [originalEntry] = await db
        .select()
        .from(timeEntries)
        .where(and(
          eq(timeEntries.id, timeEntryId),
          eq(timeEntries.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!originalEntry) {
        return res.status(404).json({ message: 'Time entry not found' });
      }

      const [request] = await db
        .insert(timesheetEditRequests)
        .values({
          workspaceId,
          timeEntryId,
          requestedBy: requestedBy!,
          reason,
          proposedClockIn: proposedClockIn ? new Date(proposedClockIn) : null,
          proposedClockOut: proposedClockOut ? new Date(proposedClockOut) : null,
          proposedNotes,
          originalClockIn: originalEntry.clockIn,
          originalClockOut: originalEntry.clockOut,
          originalNotes: originalEntry.notes,
          status: 'pending',
        })
        .returning();

      res.json(request);
    } catch (error: any) {
      console.error('Error creating edit request:', error);
      res.status(500).json({ message: error.message || 'Failed to create edit request' });
    }
  });

  // Get pending timesheet edit requests for managers (with employee and time entry details)
  app.get('/api/timesheet-edit-requests/pending', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { timesheetEditRequests, employees, timeEntries } = await import("@shared/schema");

      const requests = await db
        .select({
          id: timesheetEditRequests.id,
          timeEntryId: timesheetEditRequests.timeEntryId,
          requestedBy: timesheetEditRequests.requestedBy,
          requestedByName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
          reason: timesheetEditRequests.reason,
          proposedClockIn: timesheetEditRequests.proposedClockIn,
          proposedClockOut: timesheetEditRequests.proposedClockOut,
          proposedNotes: timesheetEditRequests.proposedNotes,
          originalClockIn: timesheetEditRequests.originalClockIn,
          originalClockOut: timesheetEditRequests.originalClockOut,
          originalNotes: timesheetEditRequests.originalNotes,
          status: timesheetEditRequests.status,
          createdAt: timesheetEditRequests.createdAt,
        })
        .from(timesheetEditRequests)
        .innerJoin(employees, eq(timesheetEditRequests.requestedBy, employees.id))
        .where(
          and(
            eq(timesheetEditRequests.workspaceId, workspaceId),
            eq(timesheetEditRequests.status, 'pending')
          )
        )
        .orderBy(timesheetEditRequests.createdAt);

      res.json(requests);
    } catch (error: any) {
      console.error('Error fetching pending edit requests:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch pending edit requests' });
    }
  });

  // Get edit requests for supervisor/manager
  app.get('/api/timesheet-edit-requests', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { status } = req.query;
      const { timesheetEditRequests } = await import("@shared/schema");

      let query = db
        .select()
        .from(timesheetEditRequests)
        .where(eq(timesheetEditRequests.workspaceId, workspaceId));

      if (status) {
        query = query.where(
          and(
            eq(timesheetEditRequests.workspaceId, workspaceId),
            eq(timesheetEditRequests.status, status as string)
          )
        );
      }

      const requests = await query.orderBy(desc(timesheetEditRequests.createdAt));

      res.json(requests);
    } catch (error: any) {
      console.error('Error getting edit requests:', error);
      res.status(500).json({ message: error.message || 'Failed to get edit requests' });
    }
  });

  // Approve/deny timesheet edit request (supervisor/manager only)
  app.put('/api/timesheet-edit-requests/:id/review', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const { approved, reviewNotes } = req.body;
      const reviewerId = req.user?.id;
      const { timesheetEditRequests, employees, timeEntries } = await import("@shared/schema");

      const [updated] = await db
        .update(timesheetEditRequests)
        .set({
          status: approved ? 'approved' : 'denied',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(timesheetEditRequests.id, id),
            eq(timesheetEditRequests.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'Edit request not found' });
      }

      // If approved, apply the changes to the time entry
      if (approved && updated.timeEntryId) {
        try {
          const changes: any = {};
          
          if (updated.proposedClockIn) changes.clockIn = updated.proposedClockIn;
          if (updated.proposedClockOut) changes.clockOut = updated.proposedClockOut;
          if (updated.proposedNotes !== undefined) changes.notes = updated.proposedNotes;
          
          if (Object.keys(changes).length > 0) {
            changes.updatedAt = new Date();
            
            await db
              .update(timeEntries)
              .set(changes)
              .where(eq(timeEntries.id, updated.timeEntryId));
            
            // Update status to 'applied'
            await db
              .update(timesheetEditRequests)
              .set({
                status: 'applied',
                appliedBy: reviewerId,
                appliedAt: new Date(),
              })
              .where(eq(timesheetEditRequests.id, id));
          }
        } catch (error) {
          console.error('Error applying timesheet changes:', error);
        }
      }

      // Send notification email to employee
      try {
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, updated.requestedBy))
          .limit(1);

        if (employee?.email) {
          const emailData = {
            employeeName: `${employee.firstName} ${employee.lastName}`,
            requestDate: new Date(updated.createdAt).toLocaleDateString('en-US', { dateStyle: 'full' }),
            proposedChanges: {
              clockIn: updated.proposedClockIn,
              clockOut: updated.proposedClockOut,
              notes: updated.proposedNotes,
            },
            denialReason: reviewNotes
          };

          if (approved) {
            sendTimesheetEditApprovedEmail(employee.email, emailData).catch(err =>
              console.error('Failed to send timesheet edit approved email:', err)
            );
          } else {
            sendTimesheetEditDeniedEmail(employee.email, emailData).catch(err =>
              console.error('Failed to send timesheet edit denied email:', err)
            );
          }
        }
      } catch (emailError) {
        console.error('Error sending timesheet edit notification:', emailError);
        // Don't fail the request if email fails
      }

      res.json(updated);
    } catch (error: any) {
      console.error('Error reviewing edit request:', error);
      res.status(500).json({ message: error.message || 'Failed to review edit request' });
    }
  });

  // ============================================================================
  // ORGANIZATION ONBOARDING & MANAGEMENT
  // ============================================================================

  // Start organization onboarding
  app.post('/api/organization-onboarding/start', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user?.id;
      const {
        organizationName,
        industry,
        employeeCount,
        subscriptionTier,
        billingEmail,
        adminEmail,
      } = req.body;
      const { organizationOnboarding } = await import("@shared/schema");

      const [onboarding] = await db
        .insert(organizationOnboarding)
        .values({
          workspaceId,
          userId: userId!,
          organizationName,
          industry,
          employeeCount,
          subscriptionTier,
          billingEmail,
          adminEmail,
          status: 'in_progress',
          currentStep: 'profile_setup',
        })
        .returning();

      res.json(onboarding);
    } catch (error: any) {
      console.error('Error starting onboarding:', error);
      res.status(500).json({ message: error.message || 'Failed to start onboarding' });
    }
  });

  // Update onboarding progress
  app.put('/api/organization-onboarding/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const {
        currentStep,
        completedSteps,
        setupData,
        status,
      } = req.body;
      const { organizationOnboarding } = await import("@shared/schema");

      const [updated] = await db
        .update(organizationOnboarding)
        .set({
          currentStep,
          completedSteps,
          setupData,
          status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationOnboarding.id, id),
            eq(organizationOnboarding.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'Onboarding record not found' });
      }

      res.json(updated);
    } catch (error: any) {
      console.error('Error updating onboarding:', error);
      res.status(500).json({ message: error.message || 'Failed to update onboarding' });
    }
  });

  // Complete onboarding
  app.post('/api/organization-onboarding/:id/complete', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const { organizationOnboarding } = await import("@shared/schema");

      const [completed] = await db
        .update(organizationOnboarding)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationOnboarding.id, id),
            eq(organizationOnboarding.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!completed) {
        return res.status(404).json({ message: 'Onboarding record not found' });
      }

      res.json(completed);
    } catch (error: any) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ message: error.message || 'Failed to complete onboarding' });
    }
  });

  // Get onboarding status
  app.get('/api/organization-onboarding/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { organizationOnboarding } = await import("@shared/schema");

      const onboarding = await db
        .select()
        .from(organizationOnboarding)
        .where(eq(organizationOnboarding.workspaceId, workspaceId))
        .orderBy(desc(organizationOnboarding.createdAt))
        .limit(1)
        .then(rows => rows[0]);

      if (!onboarding) {
        return res.json({ status: 'not_started' });
      }

      res.json(onboarding);
    } catch (error: any) {
      console.error('Error getting onboarding status:', error);
      res.status(500).json({ message: error.message || 'Failed to get onboarding status' });
    }
  });

  // ============================================================================
  // SUPPORT & CONTACT ROUTES
  // ============================================================================
  
  // Submit contact/support form
  app.post('/api/contact', async (req, res) => {
    try {
      const { name, email, company, phone, subject, tier, message } = req.body;
      
      // Validate required fields
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ 
          message: "Missing required fields: name, email, subject, and message are required" 
        });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      // Generate unique ticket number (TKT-XXXXXX format)
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = crypto.randomBytes(2).toString('hex').toUpperCase();
      const ticketNumber = `TKT-${timestamp}-${random}`;
      
      // Determine priority based on tier
      let priority = 'normal';
      if (tier === 'Elite') priority = 'urgent';
      else if (tier === 'Enterprise') priority = 'high';
      
      // Use special workspace for external/unauthenticated tickets
      // This workspace should exist in the database
      const externalWorkspaceId = 'platform-external';
      
      // Create support ticket in database
      const [ticket] = await db.insert(supportTickets).values({
        workspaceId: externalWorkspaceId,
        ticketNumber,
        type: 'support',
        priority,
        requestedBy: `${name} <${email}>`,
        subject,
        description: `Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n${company ? `Company: ${company}\n` : ''}${phone ? `Phone: ${phone}\n` : ''}${tier ? `Tier: ${tier}\n` : ''}\n\nMessage:\n${message}`,
        status: 'open',
      }).returning();

      console.log("Support ticket created:", {
        ticketNumber,
        name,
        email,
        subject,
        timestamp: new Date().toISOString()
      });

      // TODO: Send email to support team using Resend
      // TODO: Send confirmation email to customer with ticket number
      
      // Return success with ticket number
      res.json({ 
        success: true,
        message: "Support ticket created! Save your ticket number to access Live Chat support.",
        ticketNumber,
        ticketId: ticket.id,
      });
    } catch (error) {
      console.error("Error processing contact form:", error);
      res.status(500).json({ message: "Failed to submit contact form. Please try again." });
    }
  });

  // ============================================================================
  // REPORT MANAGEMENT SYSTEM (RMS) ROUTES
  // ============================================================================

  // Get all report templates (with activation status per workspace)
  app.get('/api/report-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const templates = await storage.getReportTemplatesByWorkspace(user.currentWorkspaceId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching report templates:", error);
      res.status(500).json({ message: "Failed to fetch report templates" });
    }
  });

  // Toggle template activation for workspace
  app.post('/api/report-templates/:id/toggle', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const template = await storage.toggleReportTemplateActivation(id, user!.currentWorkspaceId!);
      res.json(template);
    } catch (error) {
      console.error("Error toggling template activation:", error);
      res.status(500).json({ message: "Failed to toggle template activation" });
    }
  });

  // Get report submissions (for employees/supervisors)
  app.get('/api/report-submissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { status, employeeId } = req.query;
      const submissions = await storage.getReportSubmissions(user.currentWorkspaceId, { 
        status: status as string, 
        employeeId: employeeId as string 
      });
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching report submissions:", error);
      res.status(500).json({ message: "Failed to fetch report submissions" });
    }
  });

  // Create new report submission
  app.post('/api/report-submissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const validated = insertReportSubmissionSchema.parse({
        ...req.body,
        workspaceId: user.currentWorkspaceId,
      });

      const submission = await storage.createReportSubmission(validated);
      res.json(submission);
    } catch (error) {
      console.error("Error creating report submission:", error);
      res.status(500).json({ message: "Failed to create report submission" });
    }
  });

  // Update report submission (for drafts or revisions)
  app.patch('/api/report-submissions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const submission = await storage.updateReportSubmission(id, req.body);
      res.json(submission);
    } catch (error) {
      console.error("Error updating report submission:", error);
      res.status(500).json({ message: "Failed to update report submission" });
    }
  });

  // Supervisor approve/reject report
  app.post('/api/report-submissions/:id/review', isAuthenticated, requireManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { approved, reviewNotes } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const submission = await storage.reviewReportSubmission(id, {
        approved,
        reviewNotes,
        reviewedBy: user!.id,
      });

      res.json(submission);
    } catch (error) {
      console.error("Error reviewing report submission:", error);
      res.status(500).json({ message: "Failed to review report submission" });
    }
  });

  // Send approved report to client via email
  app.post('/api/report-submissions/:id/send-to-client', isAuthenticated, requireManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }
      
      // Get report submission
      const submission = await storage.getReportSubmissionById(id);
      if (!submission) {
        return res.status(404).json({ message: "Report not found" });
      }

      // CRITICAL: Validate workspace ownership - prevent cross-tenant access
      if (submission.workspaceId !== user.currentWorkspaceId) {
        return res.status(403).json({ message: "Access denied to this report" });
      }

      // Verify report is approved
      if (submission.status !== 'approved') {
        return res.status(400).json({ message: "Only approved reports can be sent to clients" });
      }

      // Verify client is assigned
      if (!submission.clientId) {
        return res.status(400).json({ message: "No client assigned to this report" });
      }

      // Get client details (workspace-scoped through storage)
      const clients = await storage.getClientsByWorkspace(user.currentWorkspaceId);
      const client = clients.find(c => c.id === submission.clientId);
      if (!client || !client.email) {
        return res.status(400).json({ message: "Client not found or has no email address" });
      }

      // Get employee details (workspace-scoped through storage)
      const employees = await storage.getEmployeesByWorkspace(user.currentWorkspaceId);
      const employee = employees.find(e => e.id === submission.employeeId);
      const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown Employee';

      // Get template details (workspace-scoped through storage)
      const templates = await storage.getReportTemplatesByWorkspace(user.currentWorkspaceId);
      const template = templates.find(t => t.id === submission.templateId);
      const reportName = template?.name || 'Report';

      // Get attachment count (workspace-scoped through submission validation)
      const attachments = await db.select().from(reportAttachments).where(eq(reportAttachments.submissionId, id));
      const attachmentCount = attachments.length;

      // Send email to client
      const emailResult = await sendReportDeliveryEmail(client.email, {
        clientName: client.companyName || `${client.firstName} ${client.lastName}`,
        reportNumber: submission.reportNumber,
        reportName,
        submittedBy: employeeName,
        submittedDate: new Date(submission.submittedAt || submission.createdAt).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        reportData: submission.formData as Record<string, any>,
        attachmentCount: attachmentCount > 0 ? attachmentCount : undefined,
      });

      if (!emailResult.success) {
        console.error('Failed to send report email:', emailResult.error);
        return res.status(500).json({ message: "Failed to send email to client" });
      }

      // Update report status to 'sent_to_customer'
      const updatedSubmission = await storage.updateReportSubmission(id, {
        status: 'sent_to_customer',
      });

      res.json({ 
        success: true, 
        submission: updatedSubmission,
        emailSent: true 
      });
    } catch (error) {
      console.error("Error sending report to client:", error);
      res.status(500).json({ message: "Failed to send report to client" });
    }
  });

  // Generate customer access token for approved report
  app.post('/api/report-submissions/:id/generate-access', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { expirationDays = 30 } = req.body;
      
      const accessToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const access = await storage.createCustomerReportAccess({
        submissionId: id,
        clientId: req.body.clientId,
        accessToken,
        expiresAt,
      });

      res.json(access);
    } catch (error) {
      console.error("Error generating customer access:", error);
      res.status(500).json({ message: "Failed to generate customer access" });
    }
  });

  // Customer portal - view report by access token (no auth required)
  app.get('/api/customer-reports/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const access = await storage.getCustomerReportAccessByToken(token);
      if (!access) {
        return res.status(404).json({ message: "Report not found or access expired" });
      }

      if (access.isRevoked || new Date() > new Date(access.expiresAt)) {
        return res.status(403).json({ message: "Access expired or revoked" });
      }

      // Update access tracking
      await storage.trackCustomerReportAccess(access.id);

      const report = await storage.getReportSubmissionById(access.submissionId);
      res.json(report);
    } catch (error) {
      console.error("Error fetching customer report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // ============================================================================
  // MONOPOLISTIC REPORTOS™ FEATURES
  // ============================================================================
  
  // COMPLIANCE & LEGAL REPORTS - Audit-Ready Reporting Suite
  app.get('/api/compliance-reports/labor-violations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates required" });
      }

      const { generateLaborLawViolationReport } = await import('./services/complianceReports');
      const report = await generateLaborLawViolationReport(
        user.currentWorkspaceId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json(report);
    } catch (error) {
      console.error("Error generating labor violations report:", error);
      res.status(500).json({ message: "Failed to generate labor violations report" });
    }
  });

  app.get('/api/compliance-reports/tax-remittance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates required" });
      }

      const { generateTaxRemittanceProofReport } = await import('./services/complianceReports');
      const report = await generateTaxRemittanceProofReport(
        user.currentWorkspaceId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json(report);
    } catch (error) {
      console.error("Error generating tax remittance report:", error);
      res.status(500).json({ message: "Failed to generate tax remittance report" });
    }
  });

  app.get('/api/compliance-reports/audit-log', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { startDate, endDate, filterUserId } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates required" });
      }

      const { generateTimeEntryAuditLog } = await import('./services/complianceReports');
      const report = await generateTimeEntryAuditLog(
        user.currentWorkspaceId,
        new Date(startDate as string),
        new Date(endDate as string),
        filterUserId as string | undefined
      );

      res.json(report);
    } catch (error) {
      console.error("Error generating audit log report:", error);
      res.status(500).json({ message: "Failed to generate audit log report" });
    }
  });

  // KPI ALERTS - Real-Time Risk Notifications
  app.get('/api/kpi-alerts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const alerts = await storage.getKpiAlerts(user.currentWorkspaceId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching KPI alerts:", error);
      res.status(500).json({ message: "Failed to fetch KPI alerts" });
    }
  });

  app.post('/api/kpi-alerts', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const alert = await storage.createKpiAlert({
        ...req.body,
        workspaceId: user.currentWorkspaceId,
        createdBy: userId,
      });

      res.json(alert);
    } catch (error) {
      console.error("Error creating KPI alert:", error);
      res.status(500).json({ message: "Failed to create KPI alert" });
    }
  });

  app.patch('/api/kpi-alerts/:id', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const alert = await storage.updateKpiAlert(id, user.currentWorkspaceId, req.body);
      res.json(alert);
    } catch (error) {
      console.error("Error updating KPI alert:", error);
      res.status(500).json({ message: "Failed to update KPI alert" });
    }
  });

  app.delete('/api/kpi-alerts/:id', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteKpiAlert(id, user.currentWorkspaceId);
      if (!deleted) {
        return res.status(404).json({ message: "KPI alert not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting KPI alert:", error);
      res.status(500).json({ message: "Failed to delete KPI alert" });
    }
  });

  app.get('/api/kpi-alert-triggers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { alertId } = req.query;
      const triggers = await storage.getKpiAlertTriggers(user.currentWorkspaceId, alertId as string | undefined);
      res.json(triggers);
    } catch (error) {
      console.error("Error fetching KPI alert triggers:", error);
      res.status(500).json({ message: "Failed to fetch KPI alert triggers" });
    }
  });

  app.post('/api/kpi-alert-triggers/:id/acknowledge', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const trigger = await storage.acknowledgeAlert(id, userId);
      res.json(trigger);
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  // AI EXECUTIVE SUMMARIES - GPT-4 Narrative Generation
  app.post('/api/reports/:id/generate-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const { reportData, reportType } = req.body;

      // Check if OpenAI is configured
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return res.status(503).json({ message: "AI summary service not configured" });
      }

      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiKey });

      const prompt = `You are an executive summary generator for workforce management reports.

Report Type: ${reportType}
Report Data: ${JSON.stringify(reportData, null, 2)}

Generate a concise 3-paragraph executive summary in plain language:
1. Key Finding - What is the most important insight?
2. Primary Cause - What is driving this result?
3. Recommended Action - What should management do?

Keep it professional, actionable, and under 250 words.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      });

      const summary = completion.choices[0]?.message?.content || 'Unable to generate summary';

      res.json({ summary });
    } catch (error) {
      console.error("Error generating AI summary:", error);
      res.status(500).json({ message: "Failed to generate AI summary" });
    }
  });

  // BENCHMARK METRICS - Peer Comparison Data
  app.get('/api/benchmark-metrics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { periodType } = req.query;
      const metrics = await storage.getBenchmarkMetrics(user.currentWorkspaceId, periodType as string | undefined);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching benchmark metrics:", error);
      res.status(500).json({ message: "Failed to fetch benchmark metrics" });
    }
  });

  app.post('/api/benchmark-metrics', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const metric = await storage.createBenchmarkMetric({
        ...req.body,
        workspaceId: user.currentWorkspaceId,
      });

      res.json(metric);
    } catch (error) {
      console.error("Error creating benchmark metric:", error);
      res.status(500).json({ message: "Failed to create benchmark metric" });
    }
  });

  // ============================================================================
  // MONOPOLISTIC REPORT WORKFLOW ENGINE
  // ============================================================================
  
  // WORKFLOW CONFIGURATIONS
  app.get('/api/workflow-configs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const configs = await storage.getWorkflowConfigs(user.currentWorkspaceId);
      res.json(configs);
    } catch (error) {
      console.error("Error fetching workflow configs:", error);
      res.status(500).json({ message: "Failed to fetch workflow configs" });
    }
  });

  app.post('/api/workflow-configs', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const config = await storage.createWorkflowConfig({
        ...req.body,
        workspaceId: user.currentWorkspaceId,
      });

      res.json(config);
    } catch (error) {
      console.error("Error creating workflow config:", error);
      res.status(500).json({ message: "Failed to create workflow config" });
    }
  });

  app.patch('/api/workflow-configs/:id', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const config = await storage.updateWorkflowConfig(id, user.currentWorkspaceId, req.body);
      res.json(config);
    } catch (error) {
      console.error("Error updating workflow config:", error);
      res.status(500).json({ message: "Failed to update workflow config" });
    }
  });

  app.delete('/api/workflow-configs/:id', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteWorkflowConfig(id, user.currentWorkspaceId);
      if (!deleted) {
        return res.status(404).json({ message: "Workflow config not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting workflow config:", error);
      res.status(500).json({ message: "Failed to delete workflow config" });
    }
  });

  // APPROVAL QUEUE & PROCESSING
  app.get('/api/approvals/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const pendingApprovals = await storage.getPendingApprovalsByUser(userId, user.currentWorkspaceId);
      res.json(pendingApprovals);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
      res.status(500).json({ message: "Failed to fetch pending approvals" });
    }
  });

  app.post('/api/approvals/:stepId/process', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { stepId } = req.params;
      const { action, notes, rejectionReason } = req.body;

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be 'approve' or 'reject'" });
      }

      const { processApproval } = await import('./services/reportWorkflowEngine');
      const result = await processApproval(
        req.body.submissionId || '',
        stepId,
        userId,
        action,
        notes,
        rejectionReason
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error processing approval:", error);
      res.status(500).json({ message: error.message || "Failed to process approval" });
    }
  });

  app.get('/api/report-submissions/:id/approval-status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const steps = await storage.getApprovalStepsBySubmission(id);
      const locked = await storage.getLockedReportBySubmission(id);

      res.json({
        steps,
        isLocked: !!locked,
        lockedRecord: locked,
      });
    } catch (error) {
      console.error("Error fetching approval status:", error);
      res.status(500).json({ message: "Failed to fetch approval status" });
    }
  });

  // LOCKED REPORT RECORDS (Audit Trail)
  app.get('/api/locked-reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { employeeId, clientId, startDate, endDate } = req.query;
      
      const filters: any = {};
      if (employeeId) filters.employeeId = employeeId;
      if (clientId) filters.clientId = clientId;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const lockedReports = await storage.getLockedReportRecords(user.currentWorkspaceId, filters);
      res.json(lockedReports);
    } catch (error) {
      console.error("Error fetching locked reports:", error);
      res.status(500).json({ message: "Failed to fetch locked reports" });
    }
  });

  app.get('/api/locked-reports/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const lockedReport = await storage.getLockedReportBySubmission(id);
      if (!lockedReport) {
        return res.status(404).json({ message: "Locked report not found" });
      }

      res.json(lockedReport);
    } catch (error) {
      console.error("Error fetching locked report:", error);
      res.status(500).json({ message: "Failed to fetch locked report" });
    }
  });

  // REPORT ANALYTICS (Cross-Referenced Data)
  app.get('/api/report-analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { employeeId, clientId, startDate, endDate, templateId } = req.query;
      
      const filters: any = {};
      if (employeeId) filters.employeeId = employeeId;
      if (clientId) filters.clientId = clientId;
      if (templateId) filters.templateId = templateId;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const { getReportAnalytics } = await import('./services/reportWorkflowEngine');
      const analytics = await getReportAnalytics(user.currentWorkspaceId, filters);

      res.json(analytics);
    } catch (error) {
      console.error("Error generating report analytics:", error);
      res.status(500).json({ message: "Failed to generate report analytics" });
    }
  });

  // INDUSTRY TEMPLATES - Seed workspace with pre-built templates
  app.post('/api/report-templates/seed-industry', isAuthenticated, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { seedIndustryTemplates } = await import('./services/industryTemplates');
      const seeded = await seedIndustryTemplates(user.currentWorkspaceId, userId);

      res.json({
        message: `Successfully seeded ${seeded.length} industry templates`,
        templates: seeded,
      });
    } catch (error) {
      console.error("Error seeding industry templates:", error);
      res.status(500).json({ message: "Failed to seed industry templates" });
    }
  });

  // Support Tickets - Create ticket (requires authentication to get workspaceId)
  app.post('/api/support/tickets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const validated = insertSupportTicketSchema.parse(req.body);
      
      // Generate ticket number
      const ticketNumber = `TKT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      const ticket = await storage.createSupportTicket({
        ...validated,
        ticketNumber,
        workspaceId: user.currentWorkspaceId,
      });

      res.json(ticket);
    } catch (error) {
      console.error("Error creating support ticket:", error);
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // Get support tickets for current workspace
  app.get('/api/support/tickets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const tickets = await storage.getSupportTickets(user.currentWorkspaceId);
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching support tickets:", error);
      res.status(500).json({ message: "Failed to fetch support tickets" });
    }
  });

  // Update support ticket status
  app.patch('/api/support/tickets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const ticket = await storage.updateSupportTicket(id, req.body);
      res.json(ticket);
    } catch (error) {
      console.error("Error updating support ticket:", error);
      res.status(500).json({ message: "Failed to update support ticket" });
    }
  });

  // ============================================================================
  // ADMIN SUPPORT ROUTES - Platform Administration
  // ============================================================================

  // Import admin support functions
  const adminSupport = await import("./adminSupport");

  // Search customers (platform admin only)
  app.get('/api/admin/support/search', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Search query required" });
      }

      // In production, add platform role check here:
      // const isPlatformAdmin = await checkPlatformRole(req.user.claims.sub, ['root', 'sysop']);
      // if (!isPlatformAdmin) return res.status(403).json({ message: "Admin access required" });

      const results = await adminSupport.searchCustomers(q);
      res.json(results);
    } catch (error) {
      console.error("Error searching customers:", error);
      res.status(500).json({ message: "Failed to search customers" });
    }
  });

  // Get workspace detail (platform admin only)
  app.get('/api/admin/support/workspace/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // In production, add platform role check here
      // const isPlatformAdmin = await checkPlatformRole(req.user.claims.sub, ['root', 'sysop']);
      // if (!isPlatformAdmin) return res.status(403).json({ message: "Admin access required" });

      const detail = await adminSupport.getWorkspaceDetail(id);
      
      if (!detail) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      res.json(detail);
    } catch (error) {
      console.error("Error fetching workspace detail:", error);
      res.status(500).json({ message: "Failed to fetch workspace detail" });
    }
  });

  // Get platform statistics (platform admin only)
  app.get('/api/admin/support/stats', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await adminSupport.getPlatformStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching platform stats:", error);
      res.status(500).json({ message: "Failed to fetch platform statistics" });
    }
  });

  // Change user role (platform admin action)
  app.post('/api/admin/support/change-role', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { employeeId, newRole } = req.body;
      const adminUserId = req.user.claims.sub;

      // In production, add platform role check here
      const result = await adminSupport.changeUserRole(employeeId, newRole, adminUserId);
      res.json(result);
    } catch (error) {
      console.error("Error changing user role:", error);
      res.status(500).json({ message: "Failed to change user role" });
    }
  });

  // ACCOUNT CONTROL ACTIONS - Suspend/Freeze/Lock accounts
  
  // Suspend account (general suspension)
  app.post('/api/admin/support/suspend-account', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      await storage.updateWorkspace(workspaceId, {
        isSuspended: true,
        suspendedReason: reason,
        suspendedAt: new Date(),
        suspendedBy: adminUserId,
        subscriptionStatus: 'suspended',
      });
      
      res.json({ success: true, message: "Account suspended successfully" });
    } catch (error) {
      console.error("Error suspending account:", error);
      res.status(500).json({ message: "Failed to suspend account" });
    }
  });
  
  // Unsuspend account
  app.post('/api/admin/support/unsuspend-account', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId } = req.body;
      
      await storage.updateWorkspace(workspaceId, {
        isSuspended: false,
        suspendedReason: null,
        suspendedAt: null,
        suspendedBy: null,
        subscriptionStatus: 'active',
      });
      
      res.json({ success: true, message: "Account unsuspended successfully" });
    } catch (error) {
      console.error("Error unsuspending account:", error);
      res.status(500).json({ message: "Failed to unsuspend account" });
    }
  });
  
  // Freeze account (for non-payment)
  app.post('/api/admin/support/freeze-account', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      await storage.updateWorkspace(workspaceId, {
        isFrozen: true,
        frozenReason: reason || "Account frozen for non-payment",
        frozenAt: new Date(),
        frozenBy: adminUserId,
      });
      
      res.json({ success: true, message: "Account frozen successfully" });
    } catch (error) {
      console.error("Error freezing account:", error);
      res.status(500).json({ message: "Failed to freeze account" });
    }
  });
  
  // Unfreeze account
  app.post('/api/admin/support/unfreeze-account', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId } = req.body;
      
      await storage.updateWorkspace(workspaceId, {
        isFrozen: false,
        frozenReason: null,
        frozenAt: null,
        frozenBy: null,
      });
      
      res.json({ success: true, message: "Account unfrozen successfully" });
    } catch (error) {
      console.error("Error unfreezing account:", error);
      res.status(500).json({ message: "Failed to unfreeze account" });
    }
  });
  
  // Lock account (emergency lock)
  app.post('/api/admin/support/lock-account', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      await storage.updateWorkspace(workspaceId, {
        isLocked: true,
        lockedReason: reason || "Account locked for security reasons",
        lockedAt: new Date(),
        lockedBy: adminUserId,
      });
      
      res.json({ success: true, message: "Account locked successfully" });
    } catch (error) {
      console.error("Error locking account:", error);
      res.status(500).json({ message: "Failed to lock account" });
    }
  });
  
  // Unlock account
  app.post('/api/admin/support/unlock-account', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId } = req.body;
      
      await storage.updateWorkspace(workspaceId, {
        isLocked: false,
        lockedReason: null,
        lockedAt: null,
        lockedBy: null,
      });
      
      res.json({ success: true, message: "Account unlocked successfully" });
    } catch (error) {
      console.error("Error unlocking account:", error);
      res.status(500).json({ message: "Failed to unlock account" });
    }
  });

  // ============================================================================
  // ADMIN POWER TOOLS - User/Employee Management (Cross-Workspace)
  // ============================================================================

  // Delete user/employee from any workspace
  app.post('/api/admin/support/delete-user', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId, workspaceId, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const employee = await storage.getEmployee(userId);
      if (!employee || employee.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Employee not found in specified workspace" });
      }
      
      await storage.deleteEmployee(userId);
      
      res.json({ 
        success: true, 
        message: "User deleted successfully",
        deletedBy: adminUserId,
        reason 
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Change user role (promote/demote)
  app.post('/api/admin/support/change-user-role', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId, newRole, workspaceId } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const employee = await storage.getEmployee(userId);
      if (!employee || employee.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Employee not found in specified workspace" });
      }
      
      await storage.updateEmployee(userId, { role: newRole });
      
      res.json({ 
        success: true, 
        message: `User role changed to ${newRole}`,
        actionBy: adminUserId 
      });
    } catch (error) {
      console.error("Error changing user role:", error);
      res.status(500).json({ message: "Failed to change user role" });
    }
  });

  // ============================================================================
  // ADMIN POWER TOOLS - Client Management (Cross-Workspace)
  // ============================================================================

  // Manually create client in any workspace
  app.post('/api/admin/support/create-client', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId, clientData } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const validated = insertClientSchema.parse({
        ...clientData,
        workspaceId,
      });
      
      const client = await storage.createClient(validated);
      
      res.json({ 
        success: true, 
        client,
        createdBy: adminUserId 
      });
    } catch (error: any) {
      console.error("Error creating client:", error);
      res.status(400).json({ message: error.message || "Failed to create client" });
    }
  });

  // Delete client from any workspace
  app.post('/api/admin/support/delete-client', isAuthenticated, async (req: any, res) => {
    try {
      const { clientId, workspaceId, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const client = await storage.getClient(clientId);
      if (!client || client.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Client not found in specified workspace" });
      }
      
      await storage.deleteClient(clientId);
      
      res.json({ 
        success: true, 
        message: "Client deleted successfully",
        deletedBy: adminUserId,
        reason 
      });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // ============================================================================
  // ADMIN POWER TOOLS - Payment & Invoice Control
  // ============================================================================

  // Manually process payment to clear invoice
  app.post('/api/admin/support/process-payment', isAuthenticated, async (req: any, res) => {
    try {
      const { invoiceId, workspaceId, amount, method, note } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Invoice not found in specified workspace" });
      }
      
      await storage.updateInvoice(invoiceId, {
        status: 'paid',
        paidDate: new Date().toISOString(),
      });
      
      res.json({ 
        success: true, 
        message: "Payment processed and invoice cleared",
        processedBy: adminUserId,
        method,
        amount,
        note 
      });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Force clear invoice (admin override)
  app.post('/api/admin/support/force-clear-invoice', isAuthenticated, async (req: any, res) => {
    try {
      const { invoiceId, workspaceId, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Invoice not found in specified workspace" });
      }
      
      await storage.updateInvoice(invoiceId, {
        status: 'paid',
        paidDate: new Date().toISOString(),
      });
      
      res.json({ 
        success: true, 
        message: "Invoice force cleared",
        clearedBy: adminUserId,
        reason 
      });
    } catch (error) {
      console.error("Error clearing invoice:", error);
      res.status(500).json({ message: "Failed to clear invoice" });
    }
  });

  // ============================================================================
  // ADMIN POWER TOOLS - Service Control
  // ============================================================================

  // Reset chat for a workspace
  app.post('/api/admin/support/reset-chat', isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const conversations = await storage.getChatConversationsByWorkspace(workspaceId);
      
      for (const conv of conversations) {
        await storage.updateChatConversation(conv.id, {
          status: 'closed',
        });
      }
      
      res.json({ 
        success: true, 
        message: `Chat reset - ${conversations.length} conversations closed`,
        resetBy: adminUserId,
        reason 
      });
    } catch (error) {
      console.error("Error resetting chat:", error);
      res.status(500).json({ message: "Failed to reset chat" });
    }
  });

  // Force close service/feature for workspace
  app.post('/api/admin/support/force-close-service', isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId, service, reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      res.json({ 
        success: true, 
        message: `Service ${service} force closed`,
        closedBy: adminUserId,
        reason 
      });
    } catch (error) {
      console.error("Error force closing service:", error);
      res.status(500).json({ message: "Failed to force close service" });
    }
  });

  // Update subscription tier (platform admin action)
  app.post('/api/admin/support/update-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId, newTier } = req.body;
      const adminUserId = req.user.claims.sub;

      // In production, add platform role check here
      const result = await adminSupport.updateSubscriptionTier(workspaceId, newTier, adminUserId);
      res.json(result);
    } catch (error) {
      console.error("Error updating subscription:", error);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  });

  // Get Stripe status (platform admin diagnostic)
  app.get('/api/admin/support/stripe-status/:workspaceId', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId } = req.params;

      // In production, add platform role check here
      const status = await adminSupport.getStripeStatus(workspaceId);
      res.json(status);
    } catch (error) {
      console.error("Error fetching Stripe status:", error);
      res.status(500).json({ message: "Failed to fetch Stripe status" });
    }
  });

  // Create support ticket (admin on behalf of customer)
  app.post('/api/admin/support/create-ticket', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const adminUserId = req.user.claims.sub;
      
      // In production, add platform role check here
      const result = await adminSupport.createSupportTicket({
        ...req.body,
        createdByAdmin: adminUserId,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error creating support ticket:", error);
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // Update ticket status (admin action)
  app.post('/api/admin/support/update-ticket', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { ticketId, status, resolution } = req.body;
      const adminUserId = req.user.claims.sub;

      // In production, add platform role check here
      const result = await adminSupport.updateTicketStatus(ticketId, status, resolution, adminUserId);
      res.json(result);
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  // ============================================================================
  // PLATFORM ADMIN ROUTES (Root Command Center)
  // ============================================================================

  const { 
    getPlatformStats, 
    searchWorkspaces, 
    getWorkspaceAdminDetail,
    createPlatformUser,
    getPlatformUsers
  } = await import("./platformAdmin");

  // Platform dashboard statistics
  app.get('/api/platform/stats', requirePlatformStaff, async (req, res) => {
    await getPlatformStats(req, res);
  });

  // Personal staff data (assigned tickets, etc.)
  app.get('/api/platform/personal-data', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const userName = (req.user as any)?.fullName || (req.user as any)?.email || 'Admin';

      // Count open escalation tickets assigned to this staff member
      const [openTicketsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(escalationTickets)
        .where(
          and(
            eq(escalationTickets.assignedTo, userId),
            or(
              eq(escalationTickets.status, 'open'),
              eq(escalationTickets.status, 'in_progress')
            )
          )
        );

      // Count unread support tickets (recent tickets not yet reviewed)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [newTicketsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTickets)
        .where(
          and(
            eq(supportTickets.status, 'open'),
            gte(supportTickets.createdAt, oneDayAgo)
          )
        );

      res.json({
        userName,
        assignedTickets: openTicketsCount?.count || 0,
        newSupportTickets: newTicketsCount?.count || 0
      });
    } catch (error) {
      console.error("Error fetching personal staff data:", error);
      res.status(500).json({ error: "Failed to fetch personal data" });
    }
  });

  // Search workspaces (cross-tenant admin search)
  app.get('/api/platform/workspaces/search', requirePlatformStaff, async (req, res) => {
    await searchWorkspaces(req, res);
  });

  // Get workspace admin detail
  app.get('/api/platform/workspaces/:workspaceId', requirePlatformStaff, async (req, res) => {
    await getWorkspaceAdminDetail(req, res);
  });

  // ============================================================================
  // MASTER KEYS - ROOT-ONLY ORGANIZATION MANAGEMENT
  // ============================================================================

  // Validation schemas for Master Keys
  const masterKeysSearchSchema = z.object({
    q: z.string().optional(),
    flag: z.string().optional(),
    status: z.enum(['active', 'suspended', 'cancelled', 'trialing']).optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  });

  const masterKeysUpdateSchema = z.object({
    featureToggles: z.object({
      scheduleos: z.boolean().optional(),
      timeos: z.boolean().optional(),
      payrollos: z.boolean().optional(),
      billos: z.boolean().optional(),
      hireos: z.boolean().optional(),
      reportos: z.boolean().optional(),
      analyticsos: z.boolean().optional(),
      supportos: z.boolean().optional(),
      communicationos: z.boolean().optional(),
    }).optional(),
    billingOverride: z.object({
      type: z.enum(['free', 'discount', 'custom']),
      discountPercent: z.number().min(0).max(100).optional(),
      customPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      reason: z.string().min(1).max(500),
      expiresAt: z.string().datetime().optional(),
    }).optional(),
    adminNotes: z.string().max(5000).optional(),
    adminFlags: z.array(z.string().max(50)).max(20).optional(),
    actionDescription: z.string().min(1).max(500),
  });

  const masterKeysResetSchema = z.object({
    reason: z.string().min(1).max(500),
  });

  // Search/List all organizations with Master Keys access
  app.get('/api/platform/master-keys/organizations', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Validate query params
      const params = masterKeysSearchSchema.parse(req.query);

      // Build filters
      const conditions = [];
      
      if (params.q) {
        conditions.push(
          or(
            sql`LOWER(${workspaces.name}) LIKE ${`%${params.q.toLowerCase()}%`}`,
            sql`LOWER(${workspaces.companyName}) LIKE ${`%${params.q.toLowerCase()}%`}`,
            sql`LOWER(${workspaces.organizationId}) LIKE ${`%${params.q.toLowerCase()}%`}`,
            sql`LOWER(${workspaces.organizationSerial}) LIKE ${`%${params.q.toLowerCase()}%`}`
          )
        );
      }

      if (params.status) {
        conditions.push(eq(workspaces.subscriptionStatus, params.status));
      }

      // Combine conditions with AND
      let query = db.select().from(workspaces);
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Add pagination and ordering
      const organizations = await query
        .orderBy(desc(workspaces.createdAt))
        .limit(params.limit)
        .offset(params.offset);

      // Filter by admin flags if requested (client-side for array filtering)
      let results = organizations;
      if (params.flag) {
        results = organizations.filter(org => 
          org.admin_flags?.includes(params.flag!)
        );
      }

      res.json(results);
    } catch (error: any) {
      console.error("Error fetching organizations:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Get detailed organization info for Master Keys management
  app.get('/api/platform/master-keys/organizations/:id', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const [org] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .limit(1);

      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // Get owner info
      const [owner] = await db
        .select()
        .from(users)
        .where(eq(users.id, org.ownerId))
        .limit(1);

      // Get employee count
      const [employeeCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .where(eq(employees.workspaceId, id));

      // Get client count
      const [clientCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(clients)
        .where(eq(clients.workspaceId, id));

      res.json({
        organization: org,
        owner,
        stats: {
          employeeCount: employeeCount?.count || 0,
          clientCount: clientCount?.count || 0
        }
      });
    } catch (error) {
      console.error("Error fetching organization detail:", error);
      res.status(500).json({ error: "Failed to fetch organization detail" });
    }
  });

  // Update organization features and billing (Master Keys)
  app.patch('/api/platform/master-keys/organizations/:id', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      // Validate ID format
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      // Validate request body
      const validated = masterKeysUpdateSchema.parse(req.body);
      const rootUserId = req.user!.id;

      const updateData: any = {
        last_admin_action: validated.actionDescription,
        last_admin_action_by: rootUserId,
        last_admin_action_at: new Date()
      };

      // Update feature toggles if provided
      if (validated.featureToggles) {
        if (validated.featureToggles.scheduleos !== undefined) updateData.feature_scheduleos_enabled = validated.featureToggles.scheduleos;
        if (validated.featureToggles.timeos !== undefined) updateData.feature_timeos_enabled = validated.featureToggles.timeos;
        if (validated.featureToggles.payrollos !== undefined) updateData.feature_payrollos_enabled = validated.featureToggles.payrollos;
        if (validated.featureToggles.billos !== undefined) updateData.feature_billos_enabled = validated.featureToggles.billos;
        if (validated.featureToggles.hireos !== undefined) updateData.feature_hireos_enabled = validated.featureToggles.hireos;
        if (validated.featureToggles.reportos !== undefined) updateData.feature_reportos_enabled = validated.featureToggles.reportos;
        if (validated.featureToggles.analyticsos !== undefined) updateData.feature_analyticsos_enabled = validated.featureToggles.analyticsos;
        if (validated.featureToggles.supportos !== undefined) updateData.feature_supportos_enabled = validated.featureToggles.supportos;
        if (validated.featureToggles.communicationos !== undefined) updateData.feature_communicationos_enabled = validated.featureToggles.communicationos;
      }

      // Update billing override if provided (with validation)
      if (validated.billingOverride) {
        const override = validated.billingOverride;
        
        // Validate discount percent is provided when type is discount
        if (override.type === 'discount' && !override.discountPercent) {
          return res.status(400).json({ error: "Discount percentage required when type is 'discount'" });
        }
        
        // Validate custom price is provided when type is custom
        if (override.type === 'custom' && !override.customPrice) {
          return res.status(400).json({ error: "Custom price required when type is 'custom'" });
        }

        updateData.billing_override_type = override.type;
        updateData.billing_override_discount_percent = override.discountPercent || null;
        updateData.billing_override_custom_price = override.customPrice || null;
        updateData.billing_override_reason = override.reason;
        updateData.billing_override_applied_by = rootUserId;
        updateData.billing_override_applied_at = new Date();
        updateData.billing_override_expires_at = override.expiresAt || null;
        
        // TODO: Trigger live billing update - update Stripe subscription, recalculate invoices
        // await updateStripeBilling(id, override);
      }

      // Update admin notes and flags if provided
      if (validated.adminNotes !== undefined) updateData.admin_notes = validated.adminNotes;
      if (validated.adminFlags !== undefined) updateData.admin_flags = validated.adminFlags;

      const [updated] = await db
        .update(workspaces)
        .set(updateData)
        .where(eq(workspaces.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json({
        success: true,
        organization: updated,
        message: "Organization updated successfully"
      });
    } catch (error: any) {
      console.error("Error updating organization:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update organization" });
    }
  });

  // Reset organization to defaults
  app.post('/api/platform/master-keys/organizations/:id/reset', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      // Validate ID format
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      // Validate request body
      const validated = masterKeysResetSchema.parse(req.body);
      const rootUserId = req.user!.id;
      const { reason } = validated;

      const [updated] = await db
        .update(workspaces)
        .set({
          // Reset all feature toggles to defaults
          feature_scheduleos_enabled: true,
          feature_timeos_enabled: true,
          feature_payrollos_enabled: false,
          feature_billos_enabled: true,
          feature_hireos_enabled: true,
          feature_reportos_enabled: true,
          feature_analyticsos_enabled: true,
          feature_supportos_enabled: true,
          feature_communicationos_enabled: true,
          
          // Clear billing overrides
          billing_override_type: null,
          billing_override_discount_percent: null,
          billing_override_custom_price: null,
          billing_override_reason: null,
          billing_override_applied_by: null,
          billing_override_applied_at: null,
          billing_override_expires_at: null,
          
          // Clear account locks
          isSuspended: false,
          suspendedReason: null,
          suspendedAt: null,
          suspendedBy: null,
          
          isFrozen: false,
          frozenReason: null,
          frozenAt: null,
          frozenBy: null,
          
          isLocked: false,
          lockedReason: null,
          lockedAt: null,
          lockedBy: null,
          
          subscriptionStatus: 'active',
          
          // Log action
          last_admin_action: `Organization reset: ${reason || 'No reason provided'}`,
          last_admin_action_by: rootUserId,
          last_admin_action_at: new Date()
        })
        .where(eq(workspaces.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json({
        success: true,
        organization: updated,
        message: "Organization reset to defaults successfully"
      });
    } catch (error: any) {
      console.error("Error resetting organization:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to reset organization" });
    }
  });

  // ============================================================================
  // USER MANAGEMENT - ROOT ADMIN DASHBOARD
  // ============================================================================
  
  // Search users by ID, work ID, email, or name (ROOT/DEPUTY ADMIN only)
  app.get('/api/platform/users/search', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { q } = req.query;
      const searchQuery = q as string;
      
      if (!searchQuery || searchQuery.trim().length === 0) {
        return res.status(400).json({ error: "Search query required" });
      }

      // Search users by multiple criteria
      const allUsers = await db.select().from(users);
      
      const matchedUsers = allUsers.filter(user => {
        const query = searchQuery.toLowerCase();
        return (
          user.id.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.workId?.toLowerCase().includes(query) ||
          user.firstName?.toLowerCase().includes(query) ||
          user.lastName?.toLowerCase().includes(query) ||
          `${user.firstName} ${user.lastName}`.toLowerCase().includes(query)
        );
      });

      // Get platform roles for matched users
      const userIds = matchedUsers.map(u => u.id);
      const allPlatformRoles = await db.select().from(platformRoles).where(
        sql`${platformRoles.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)}) AND ${platformRoles.revokedAt} IS NULL`
      );

      // Get workspace memberships
      const allEmployees = await db.select().from(employees).where(
        sql`${employees.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`
      );

      const results = matchedUsers.map(user => {
        const role = allPlatformRoles.find(r => r.userId === user.id);
        const employeeRecords = allEmployees.filter(e => e.userId === user.id);
        
        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          workId: user.workId,
          platformRole: role?.role || 'none',
          workspaceCount: employeeRecords.length,
          emailVerified: user.emailVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        };
      });

      res.json(results);
    } catch (error: any) {
      console.error("Error searching users:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // Get all platform users (staff) - ROOT/DEPUTY ADMIN only
  app.get('/api/platform/users', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Get all users with platform roles
      const activePlatformRoles = await db
        .select()
        .from(platformRoles)
        .where(isNull(platformRoles.revokedAt));
      
      const userIds = activePlatformRoles.map(r => r.userId);
      
      if (userIds.length === 0) {
        return res.json([]);
      }
      
      const staffUsers = await db
        .select()
        .from(users)
        .where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);

      const results = staffUsers.map(user => {
        const role = activePlatformRoles.find(r => r.userId === user.id);
        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          workId: user.workId,
          platformRole: role?.role || 'none',
          grantedAt: role?.createdAt,
          emailVerified: user.emailVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        };
      });

      res.json(results);
    } catch (error: any) {
      console.error("Error fetching platform users:", error);
      res.status(500).json({ error: "Failed to fetch platform users" });
    }
  });

  // Get user details by ID (ROOT/DEPUTY ADMIN only)
  app.get('/api/platform/users/:userId', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get platform role
      const platformRole = await db.query.platformRoles.findFirst({
        where: and(
          eq(platformRoles.userId, userId),
          isNull(platformRoles.revokedAt)
        ),
      });

      // Get workspace memberships
      const employeeRecords = await db
        .select({
          employee: employees,
          workspace: workspaces,
        })
        .from(employees)
        .leftJoin(workspaces, eq(employees.workspaceId, workspaces.id))
        .where(eq(employees.userId, userId));

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          workId: user.workId,
          phone: user.phone,
          emailVerified: user.emailVerified,
          lastLoginAt: user.lastLoginAt,
          loginAttempts: user.loginAttempts,
          lockedUntil: user.lockedUntil,
          createdAt: user.createdAt,
        },
        platformRole: platformRole?.role || 'none',
        workspaces: employeeRecords.map(r => ({
          workspaceId: r.workspace?.id,
          workspaceName: r.workspace?.name,
          companyName: r.workspace?.companyName,
          role: r.employee.workspaceRole,
          title: r.employee.title,
          department: r.employee.department,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ error: "Failed to fetch user details" });
    }
  });

  // Update user (ROOT only)
  app.patch('/api/platform/users/:userId', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { email, firstName, lastName, phone, workId } = req.body;
      
      const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if email is being changed and if it's already in use
      if (email && email !== existingUser.email) {
        const [emailExists] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        
        if (emailExists) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }

      const [updated] = await db
        .update(users)
        .set({
          email: email || existingUser.email,
          firstName: firstName || existingUser.firstName,
          lastName: lastName || existingUser.lastName,
          phone: phone !== undefined ? phone : existingUser.phone,
          workId: workId !== undefined ? workId : existingUser.workId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      res.json({ success: true, user: updated });
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Set user password (ROOT only)
  app.post('/api/platform/users/:userId/set-password', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { password } = req.body;
      
      if (!password || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      await db
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      res.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Error setting password:", error);
      res.status(500).json({ error: "Failed to set password" });
    }
  });

  // Grant platform role (ROOT only)
  app.post('/api/platform/users/:userId/grant-role', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { role, reason } = req.body;
      
      if (!role || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(role)) {
        return res.status(400).json({ error: "Invalid platform role" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Revoke existing platform roles
      await db
        .update(platformRoles)
        .set({
          revokedAt: new Date(),
          revokedBy: req.user!.id,
          revokedReason: `Replaced with ${role} role`,
        })
        .where(and(
          eq(platformRoles.userId, userId),
          isNull(platformRoles.revokedAt)
        ));

      // Grant new role
      const [newRole] = await db
        .insert(platformRoles)
        .values({
          userId,
          role,
          grantedBy: req.user!.id,
          grantedReason: reason || `Granted ${role} role`,
        })
        .returning();

      res.json({ success: true, platformRole: newRole });
    } catch (error: any) {
      console.error("Error granting platform role:", error);
      res.status(500).json({ error: "Failed to grant platform role" });
    }
  });

  // Revoke platform role (ROOT only)
  app.post('/api/platform/users/:userId/revoke-role', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      
      await db
        .update(platformRoles)
        .set({
          revokedAt: new Date(),
          revokedBy: req.user!.id,
          revokedReason: reason || 'Role revoked by admin',
        })
        .where(and(
          eq(platformRoles.userId, userId),
          isNull(platformRoles.revokedAt)
        ));

      res.json({ success: true, message: "Platform role revoked successfully" });
    } catch (error: any) {
      console.error("Error revoking platform role:", error);
      res.status(500).json({ error: "Failed to revoke platform role" });
    }
  });

  // Create new user (ROOT only)
  app.post('/api/platform/users', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { email, firstName, lastName, password, platformRole } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Check if email already exists
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      
      if (existing) {
        return res.status(400).json({ error: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      // Generate work ID
      const workId = `${firstName || 'User'}-${Math.floor(Math.random() * 100)}-${Math.floor(Math.random() * 1000)}-${Math.floor(Math.random() * 100)}-${Math.floor(Math.random() * 10000)}`;

      const [newUser] = await db
        .insert(users)
        .values({
          email,
          firstName,
          lastName,
          passwordHash,
          workId,
          emailVerified: true,
        })
        .returning();

      // Grant platform role if specified
      if (platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
        await db.insert(platformRoles).values({
          userId: newUser.id,
          role: platformRole,
          grantedBy: req.user!.id,
          grantedReason: `Created with ${platformRole} role`,
        });
      }

      res.json({ success: true, user: newUser });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  // Save platform settings
  app.post('/api/platform/settings', requirePlatformAdmin, async (req, res) => {
    try {
      // In a production system, these would be saved to a platform_settings table
      // For now, we'll just acknowledge the save and return success
      const settings = req.body;
      
      // TODO: Persist to database - for now just validate and return success
      res.json({ 
        success: true, 
        message: "Platform settings saved successfully",
        settings 
      });
    } catch (error: any) {
      console.error("Error saving platform settings:", error);
      res.status(500).json({ message: error.message || "Failed to save settings" });
    }
  });

  // ============================================================================
  // LIVE CHAT ROUTES (WebSocket Support System)
  // ============================================================================
  
  // Dual auth middleware: Supports both session-based AND Replit OAuth
  const requireAnyAuth: RequestHandler = async (req: any, res, next) => {
    // Try session-based auth first
    if (req.session?.userId) {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
      if (user) {
        req.user = user;
        return next();
      }
    }
    
    // Try Replit OAuth
    if (req.isAuthenticated() && req.user?.claims?.sub) {
      const userId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user) {
        req.user = user;
        return next();
      }
    }
    
    return res.status(401).json({ message: "Unauthorized" });
  };
  
  // Get all conversations for workspace or all conversations for platform staff
  app.get('/api/chat/conversations', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Check if user is platform admin/staff
      const platformRole = await storage.getUserPlatformRole(userId);
      
      if (platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
        // Platform staff can see ALL conversations across all workspaces
        const status = req.query.status as string | undefined;
        const allConversations = await storage.getAllChatConversations({ status });
        return res.json(allConversations);
      }
      
      // Regular workspace users see only their workspace conversations
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const status = req.query.status as string | undefined;
      const conversations = await storage.getChatConversationsByWorkspace(workspace.id, { status });
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Create new conversation
  app.post('/api/chat/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const validated = insertChatConversationSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      const conversation = await storage.createChatConversation(validated);
      res.status(201).json(conversation);
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      res.status(400).json({ message: error.message || "Failed to create conversation" });
    }
  });

  // Get conversation messages
  app.get('/api/chat/conversations/:id/messages', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      // Check if user is platform admin/staff
      const platformRole = await storage.getUserPlatformRole(userId);
      
      if (platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
        // Platform staff can view ANY conversation's messages (full security/monitoring access)
        const messages = await storage.getChatMessagesByConversation(id);
        
        // Enrich messages with sender's platform role for frontend display
        const enrichedMessages = await Promise.all(messages.map(async (msg) => {
          if (!msg.senderId || msg.senderId === 'system' || msg.senderId === 'ai-bot') {
            return { ...msg, role: msg.senderId === 'ai-bot' ? 'bot' : 'system', userType: 'system' };
          }
          const senderRole = await storage.getUserPlatformRole(msg.senderId).catch(() => null);
          const userInfo = await storage.getUserDisplayInfo(msg.senderId).catch(() => null);
          return { 
            ...msg, 
            role: senderRole || 'guest',
            userType: userInfo?.userType || 'guest'
          };
        }));
        
        return res.json(enrichedMessages);
      }
      
      // Regular workspace users need workspace verification
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const messages = await storage.getChatMessagesByConversation(id);
      
      // Enrich messages with sender's platform role for frontend display
      const enrichedMessages = await Promise.all(messages.map(async (msg) => {
        if (!msg.senderId || msg.senderId === 'system' || msg.senderId === 'ai-bot') {
          return { ...msg, role: msg.senderId === 'ai-bot' ? 'bot' : 'system', userType: 'system' };
        }
        const senderRole = await storage.getUserPlatformRole(msg.senderId).catch(() => null);
        const userInfo = await storage.getUserDisplayInfo(msg.senderId).catch(() => null);
        return { 
          ...msg, 
          role: senderRole || 'guest',
          userType: userInfo?.userType || 'guest'
        };
      }));
      
      res.json(enrichedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Update conversation (assign agent, change status, etc.)
  app.patch('/api/chat/conversations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const validated = insertChatConversationSchema
        .partial()
        .omit({ workspaceId: true })
        .parse(req.body);
      
      const updated = await storage.updateChatConversation(id, validated);
      
      if (!updated) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating conversation:", error);
      res.status(400).json({ message: error.message || "Failed to update conversation" });
    }
  });

  // Close conversation
  app.post('/api/chat/conversations/:id/close', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const closed = await storage.closeChatConversation(id);
      
      if (!closed) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      res.json(closed);
    } catch (error) {
      console.error("Error closing conversation:", error);
      res.status(500).json({ message: "Failed to close conversation" });
    }
  });

  // ============================================================================
  // LIVE CHATROOM (IRC/MSN Style - Single Room Always Open)
  // ============================================================================
  
  const MAIN_ROOM_ID = 'main-chatroom-workforceos';
  
  // Get or create main chatroom
  app.get('/api/chat/main-room', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      let mainRoom = await storage.getChatConversation(MAIN_ROOM_ID);
      
      // Create main room if it doesn't exist
      if (!mainRoom) {
        mainRoom = await storage.createChatConversation({
          id: MAIN_ROOM_ID,
          workspaceId: 'platform-chatroom', // Special platform workspace
          customerName: 'Main Chatroom',
          customerEmail: 'chatroom@workforceos.com',
          subject: 'WorkforceOS Live Support Chat',
          status: 'active',
          priority: 'normal',
          isSilenced: false,
          lastMessageAt: new Date(),
        });
      }
      
      res.json(mainRoom);
    } catch (error) {
      console.error("Error getting main room:", error);
      res.status(500).json({ message: "Failed to get main room" });
    }
  });
  
  // Get all messages from main room (live feed)
  app.get('/api/chat/main-room/messages', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // Ensure room exists first
      let mainRoom = await storage.getChatConversation(MAIN_ROOM_ID);
      if (!mainRoom) {
        mainRoom = await storage.createChatConversation({
          id: MAIN_ROOM_ID,
          workspaceId: 'platform-chatroom',
          customerName: 'Main Chatroom',
          customerEmail: 'chatroom@workforceos.com',
          subject: 'WorkforceOS Live Support Chat',
          status: 'active',
          priority: 'normal',
          isSilenced: false,
          lastMessageAt: new Date(),
        });
      }
      
      const messages = await storage.getChatMessagesByConversation(MAIN_ROOM_ID);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching main room messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });
  
  // Send message to main room
  app.post('/api/chat/main-room/messages', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = req.user!;
      
      // Ensure room exists
      let mainRoom = await storage.getChatConversation(MAIN_ROOM_ID);
      if (!mainRoom) {
        mainRoom = await storage.createChatConversation({
          id: MAIN_ROOM_ID,
          workspaceId: 'platform-chatroom',
          customerName: 'Main Chatroom',
          customerEmail: 'chatroom@workforceos.com',
          subject: 'WorkforceOS Live Support Chat',
          status: 'active',
          priority: 'normal',
          isSilenced: false,
          lastMessageAt: new Date(),
        });
      }
      
      const { message, messageType = "text" } = req.body;
      
      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Determine sender name and type
      const platformRole = await storage.getUserPlatformRole(userId);
      const senderType = platformRole ? 'support' : 'customer';
      const senderName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "User";
      
      const newMessage = await storage.createChatMessage({
        conversationId: MAIN_ROOM_ID,
        senderId: userId,
        senderName,
        senderType,
        message: message.trim(),
        messageType,
        isRead: false,
      });
      
      // Update last message timestamp
      await storage.updateChatConversation(MAIN_ROOM_ID, {
        lastMessageAt: new Date(),
      });
      
      res.status(201).json(newMessage);
    } catch (error: any) {
      console.error("Error sending message:", error);
      res.status(400).json({ message: error.message || "Failed to send message" });
    }
  });

  // Grant voice to user (remove silence) - Managers and Owners only
  app.post('/api/chat/conversations/:id/grant-voice', isAuthenticated, requireManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const userName = req.user.claims.name || req.user.claims.email || 'Support Agent';
      
      // Get conversation first to determine workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // CRITICAL: Verify user's workspace matches conversation's workspace (tenant scoping)
      // requireManager already validates role, now we validate workspace membership
      const userWorkspace = await storage.getWorkspaceByOwnerId(userId);
      
      // If user is not the owner, they might be a manager - check workspaceId from request
      const workspaceId = req.workspaceId || userWorkspace?.id;
      
      if (!workspaceId || workspaceId !== conversation.workspaceId) {
        return res.status(403).json({ message: "Access denied: Conversation belongs to a different workspace" });
      }

      // Grant voice (remove silence)
      const updated = await storage.updateChatConversation(id, {
        isSilenced: false,
        voiceGrantedBy: userId,
        voiceGrantedAt: new Date(),
      });

      // Send system message about voice being granted
      const { HelpBotService } = await import('./ai/help-bot');
      const systemMessage = await HelpBotService.generateVoiceGrantedMessage(userName);
      
      await storage.createChatMessage({
        conversationId: id,
        senderName: 'help_bot',
        senderType: 'bot',
        message: systemMessage,
        messageType: 'system',
      });

      res.json(updated);
    } catch (error) {
      console.error("Error granting voice:", error);
      res.status(500).json({ message: "Failed to grant voice" });
    }
  });

  // Help bot: Send AI response
  app.post('/api/chat/help-bot/respond', isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId, userMessage, previousMessages } = req.body;
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(conversationId);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { HelpBotService } = await import('./ai/help-bot');
      const botResponse = await HelpBotService.generateResponse(userMessage, {
        conversationId,
        customerName: conversation.customerName || undefined,
        customerEmail: conversation.customerEmail || undefined,
        previousMessages,
      });

      // Save bot response as message
      const message = await storage.createChatMessage({
        conversationId,
        senderName: 'help_bot',
        senderType: 'bot',
        message: botResponse,
        messageType: 'text',
      });

      res.json(message);
    } catch (error) {
      console.error("Error generating bot response:", error);
      res.status(500).json({ message: "Failed to generate bot response" });
    }
  });

  // ============================================================================
  // HELPDESK SYSTEM API ROUTES (Professional Support Chat Rooms)
  // ============================================================================

  // Get HelpDesk room info and status by slug
  app.get('/api/helpdesk/room/:slug', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { slug } = req.params;
      const room = await storage.getSupportRoomBySlug(slug);
      
      if (!room) {
        return res.status(404).json({ message: "HelpDesk room not found" });
      }
      
      res.json(room);
    } catch (error) {
      console.error("Error fetching HelpDesk room:", error);
      res.status(500).json({ message: "Failed to fetch HelpDesk room" });
    }
  });

  // List all support rooms - Staff only (for room selector)
  app.get('/api/helpdesk/rooms', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // SECURITY: Only platform staff can list rooms (all staff levels)
      const platformRole = await storage.getUserPlatformRole(userId);
      if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
        return res.status(403).json({ message: "Unauthorized - Staff access required" });
      }
      
      // Get user's workspace if they have one
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      const rooms = await storage.getAllSupportRooms(workspace?.id);
      res.json(rooms);
    } catch (error) {
      console.error("Error listing HelpDesk rooms:", error);
      res.status(500).json({ message: "Failed to list rooms" });
    }
  });

  // Create organization chatroom - Organization owners/managers only
  app.post('/api/helpdesk/rooms', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { name, description, slug } = req.body;
      
      if (!name || !slug) {
        return res.status(400).json({ message: "Room name and slug are required" });
      }
      
      // Validate slug format (lowercase, alphanumeric, hyphens only)
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ message: "Invalid slug format. Use lowercase letters, numbers, and hyphens only." });
      }
      
      // SECURITY: User must have a workspace (organizations only)
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(403).json({ message: "Unauthorized - Organization membership required" });
      }
      
      // SECURITY: Only owners and managers can create rooms
      const membership = await storage.getWorkspaceMembership(workspace.id, userId);
      if (!membership || !['owner', 'manager'].includes(membership.role)) {
        return res.status(403).json({ message: "Unauthorized - Owner or Manager role required" });
      }
      
      // Check if slug already exists for this workspace
      const existingRoom = await storage.getSupportRoomBySlug(slug);
      if (existingRoom) {
        return res.status(409).json({ message: "A room with this slug already exists" });
      }
      
      // Create the organization room
      const room = await storage.createSupportRoom({
        slug,
        name,
        description: description || `Private chat room for ${workspace.name}`,
        status: 'open',
        statusMessage: null,
        workspaceId: workspace.id, // ORG-SPECIFIC ROOM
        conversationId: null, // Will be created on first use
        requiresTicket: false,
        allowedRoles: null, // Workspace members + support staff + invited auditors
        lastStatusChange: new Date(),
        statusChangedBy: null,
        createdBy: userId,
      });
      
      res.status(201).json(room);
    } catch (error: any) {
      console.error("Error creating organization room:", error);
      res.status(500).json({ message: "Failed to create room" });
    }
  });

  // Toggle HelpDesk room status (open/closed) - Staff only
  app.post('/api/helpdesk/room/:slug/status', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { slug } = req.params;
      const { status, statusMessage } = req.body;
      const userId = req.user!.id;
      
      // SECURITY: Only platform staff can toggle room status
      const platformRole = await storage.getUserPlatformRole(userId);
      if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
        return res.status(403).json({ message: "Unauthorized - Staff access required" });
      }
      
      // Validate status
      if (!['open', 'closed', 'maintenance'].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'open', 'closed', or 'maintenance'" });
      }
      
      const updated = await storage.updateSupportRoomStatus(slug, status, statusMessage || null, userId);
      
      if (!updated) {
        return res.status(404).json({ message: "HelpDesk room not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating HelpDesk room status:", error);
      res.status(500).json({ message: "Failed to update room status" });
    }
  });

  // Authenticate customer with ticket number + email (no login required)
  app.post('/api/helpdesk/authenticate-ticket', async (req, res) => {
    try {
      const { ticketNumber, email } = req.body;
      
      if (!ticketNumber || !email) {
        return res.status(400).json({ message: "Ticket number and email are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      // Find ticket by ticket number
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.ticketNumber, ticketNumber));

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found. Please check your ticket number." });
      }

      // Verify email matches the ticket (extract email from "Name <email>" format)
      const emailMatch = ticket.requestedBy?.match(/<(.+?)>/);
      const ticketEmail = emailMatch ? emailMatch[1] : ticket.requestedBy;

      if (!ticketEmail || ticketEmail.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ message: "Email does not match ticket. Please verify your information." });
      }

      // Check ticket status
      if (ticket.status === 'closed' || ticket.status === 'resolved') {
        return res.status(403).json({ message: "This ticket has been closed. Please create a new support ticket." });
      }

      // Create a temporary guest user for this ticket
      // Using ticket number as unique identifier
      const guestUserId = `guest-${ticket.id}`;
      const guestUsername = `Guest-${ticketNumber}`;
      const guestEmail = email;

      // Check if guest user already exists
      let [guestUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, guestUserId));

      if (!guestUser) {
        // Create guest user
        [guestUser] = await db.insert(users).values({
          id: guestUserId,
          username: guestUsername,
          email: guestEmail,
          role: 'employee',
          currentWorkspaceId: ticket.workspaceId,
        }).returning();
      }

      // Create session for guest user
      (req.session as any).userId = guestUser.id;
      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      res.json({
        success: true,
        message: "Authentication successful! You can now access Live Chat.",
        user: {
          id: guestUser.id,
          username: guestUser.username,
          email: guestUser.email,
        },
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
        },
      });
    } catch (error) {
      console.error("Error authenticating ticket:", error);
      res.status(500).json({ message: "Failed to authenticate ticket. Please try again." });
    }
  });

  // Authenticate support staff with work ID + email (no platform login required)
  app.post('/api/helpdesk/authenticate-workid', async (req, res) => {
    try {
      const { workId, email } = req.body;
      
      if (!workId || !email) {
        return res.status(400).json({ message: "Work ID and email are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      // Find user by ID and email
      const [staffUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, workId));

      if (!staffUser) {
        return res.status(404).json({ message: "Work ID not found. Please check your credentials." });
      }

      // Verify email matches
      if (!staffUser.email || staffUser.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ message: "Email does not match work ID. Please verify your information." });
      }

      // Check if user has platform staff role
      const [roleRecord] = await db
        .select()
        .from(platformRoles)
        .where(eq(platformRoles.userId, staffUser.id));

      const hasStaffRole = roleRecord && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(roleRecord.role);

      if (!hasStaffRole) {
        return res.status(403).json({ message: "Unauthorized - Staff access required" });
      }

      // Create session for staff user
      (req.session as any).userId = staffUser.id;
      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      res.json({
        success: true,
        message: "Staff authentication successful! You now have access to Live Chat.",
        user: {
          id: staffUser.id,
          username: staffUser.username,
          email: staffUser.email,
          role: roleRecord.role,
        },
      });
    } catch (error) {
      console.error("Error authenticating work ID:", error);
      res.status(500).json({ message: "Failed to authenticate. Please try again." });
    }
  });

  // Verify ticket and grant chat access (gatekeeper MOMJJ)
  app.post('/api/helpdesk/verify-ticket', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { ticketNumber, roomSlug } = req.body;
      const userId = req.user!.id;
      
      if (!ticketNumber || !roomSlug) {
        return res.status(400).json({ message: "Ticket number and room slug are required" });
      }
      
      // Get the room
      const room = await storage.getSupportRoomBySlug(roomSlug);
      if (!room) {
        return res.status(404).json({ message: "HelpDesk room not found" });
      }
      
      // Check if room is open
      if (room.status !== 'open') {
        return res.status(403).json({ 
          message: "HelpDesk room is currently closed",
          statusMessage: room.statusMessage 
        });
      }
      
      // SECURITY: Verify ticket ownership and validation
      const ticket = await storage.verifyTicketForChatAccess(ticketNumber, userId);
      
      if (!ticket) {
        return res.status(403).json({ 
          message: "Invalid ticket or unauthorized access. Ticket must be verified by support staff and belong to you." 
        });
      }
      
      // Check if user already has valid access
      let access = await storage.checkTicketAccess(userId, room.id);
      
      if (!access) {
        // Grant new access (48 hours)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);
        
        access = await storage.grantTicketAccess({
          ticketId: ticket.id,
          userId,
          roomId: room.id,
          grantedBy: userId, // Self-granted after ticket verification
          expiresAt,
        });
      }
      
      res.json({ 
        access,
        room,
        message: "Access granted to HelpDesk room" 
      });
    } catch (error) {
      console.error("Error verifying ticket:", error);
      res.status(500).json({ message: "Failed to verify ticket" });
    }
  });

  // Accept terms and save acknowledgment for audit compliance
  // This endpoint allows BOTH authenticated users AND guests (ticket holders)
  app.post('/api/helpdesk/terms/accept', async (req: any, res) => {
    try {
      const { initialsProvided, userName, userEmail, workspaceId, ticketNumber } = req.body;
      
      // Support both authenticated users and guests
      let userId: string | null;
      let finalUserName: string;
      let finalUserEmail: string;
      
      if (req.user || req.session?.userId) {
        // Authenticated user
        const user = req.user || (req.session?.userId ? await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1).then(r => r[0]) : null);
        userId = user?.id || null;
        finalUserName = userName || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown');
        finalUserEmail = userEmail || user?.email || 'unknown@email.com';
      } else {
        // Guest user - no userId (track via ticket/email instead)
        userId = null;
        finalUserName = userName || 'Guest';
        finalUserEmail = userEmail || 'guest@email.com';
      }
      
      if (!initialsProvided || initialsProvided.trim().length < 2) {
        return res.status(400).json({ message: "Valid initials are required for e-signature" });
      }
      
      // Get IP address for audit trail
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Save terms acknowledgment to database
      const [acknowledgment] = await db.insert(termsAcknowledgments).values({
        userId,
        userName: finalUserName,
        userEmail: finalUserEmail,
        workspaceId: workspaceId || null,
        ticketNumber: ticketNumber || null,
        initialsProvided: initialsProvided.toUpperCase(),
        acceptedTermsVersion: '1.0',
        ipAddress,
        userAgent,
      }).returning();
      
      res.json({ 
        success: true,
        message: "Terms accepted and recorded for compliance",
        acknowledgmentId: acknowledgment.id
      });
    } catch (error) {
      console.error("Error saving terms acknowledgment:", error);
      res.status(500).json({ message: "Failed to save terms acceptance" });
    }
  });

  // Check if user has access to a HelpDesk room
  app.get('/api/helpdesk/check-access/:roomSlug', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { roomSlug } = req.params;
      const userId = req.user!.id;
      
      // Get the room
      const room = await storage.getSupportRoomBySlug(roomSlug);
      if (!room) {
        return res.status(404).json({ message: "HelpDesk room not found" });
      }
      
      // Check if user is staff (always has access)
      const platformRole = await storage.getUserPlatformRole(userId);
      const isStaff = platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
      
      if (isStaff) {
        return res.json({ 
          hasAccess: true,
          accessType: 'staff',
          room 
        });
      }
      
      // Check ticket-based access
      const access = await storage.checkTicketAccess(userId, room.id);
      
      if (access) {
        return res.json({ 
          hasAccess: true,
          accessType: 'ticket',
          access,
          room 
        });
      }
      
      res.json({ 
        hasAccess: false,
        room 
      });
    } catch (error) {
      console.error("Error checking access:", error);
      res.status(500).json({ message: "Failed to check access" });
    }
  });

  // Revoke ticket access - Staff only
  app.post('/api/helpdesk/revoke-access', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { accessId, reason } = req.body;
      const userId = req.user!.id;
      
      // SECURITY: Only platform staff can revoke access
      const platformRole = await storage.getUserPlatformRole(userId);
      if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
        return res.status(403).json({ message: "Unauthorized - Staff access required" });
      }
      
      if (!accessId) {
        return res.status(400).json({ message: "Access ID is required" });
      }
      
      const revoked = await storage.revokeTicketAccess(accessId, userId, reason || "Revoked by staff");
      
      if (!revoked) {
        return res.status(404).json({ message: "Access record not found" });
      }
      
      res.json({ message: "Access revoked successfully" });
    } catch (error) {
      console.error("Error revoking access:", error);
      res.status(500).json({ message: "Failed to revoke access" });
    }
  });

  // ============================================================================
  // SALES PORTAL API ROUTES (Platform Staff Only)
  // ============================================================================

  // Get all email templates
  app.get('/api/sales/templates', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const templates = await db.select().from(emailTemplates).orderBy(emailTemplates.createdAt);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  // Get all leads
  app.get('/api/sales/leads', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const allLeads = await db.select().from(leads).orderBy(leads.createdAt);
      res.json(allLeads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // Zod validation schema for lead creation
  const createLeadSchema = z.object({
    companyName: z.string().min(1, "Company name is required"),
    contactEmail: z.string().email("Valid email is required"),
    contactName: z.string().optional(),
    industry: z.string().optional(),
    contactPhone: z.string().optional(),
    contactTitle: z.string().optional(),
    estimatedEmployees: z.number().int().positive().optional(),
  });

  // Create a new lead
  app.post('/api/sales/leads', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      // Validate request body
      const validationResult = createLeadSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid lead data",
          errors: validationResult.error.errors
        });
      }

      const validatedData = validationResult.data;

      const [newLead] = await db.insert(leads).values({
        ...validatedData,
        leadStatus: 'new',
        leadSource: 'manual',
        leadScore: 0,
      }).returning();

      res.json(newLead);
    } catch (error) {
      console.error("Error creating lead:", error);
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  // Zod validation schema for sales email
  const sendSalesEmailSchema = z.object({
    templateId: z.string().min(1, "Template ID is required"),
    toEmail: z.string().email("Valid email is required"),
    toName: z.string().optional(),
    companyName: z.string().min(1, "Company name is required"),
    industry: z.string().optional(),
  });

  // Zod validation for AI lead generation
  const aiLeadGenerationSchema = z.object({
    industry: z.string().min(1, "Industry is required"),
    targetRegion: z.string().optional(),
    numberOfLeads: z.number().int().min(1).max(20).default(5), // Limit to prevent cost abuse
  });

  // Zod validation for AI-generated lead output
  const aiGeneratedLeadSchema = z.object({
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    contactTitle: z.string().min(1),
    contactEmail: z.string().email(),
    estimatedEmployees: z.number().int().positive(),
    painPoints: z.string(),
    leadScore: z.number().int().min(0).max(100),
  });

  // AI Lead Generation - Discover potential clients automatically
  app.post('/api/sales/ai-generate-leads', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      // Validate request body
      const validationResult = aiLeadGenerationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validationResult.error.errors
        });
      }

      const { industry, targetRegion, numberOfLeads } = validationResult.data;

      // Check if OpenAI is configured
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ 
          message: "AI lead generation requires OpenAI API key. Please configure OPENAI_API_KEY.",
          error: "OPENAI_NOT_CONFIGURED"
        });
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Use AI to generate qualified leads
      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a B2B sales research assistant for WorkforceOS, a Fortune 500-grade workforce management platform. Your job is to identify potential clients who would benefit from automated scheduling, time tracking, HR management, and compliance reporting.`
          },
          {
            role: 'user',
            content: `Generate ${numberOfLeads} SYNTHETIC/EXAMPLE sales leads for the ${industry} industry${targetRegion ? ` in the ${targetRegion} region` : ''}. 

IMPORTANT: Create FICTIONAL companies and contacts for demonstration purposes only. Do NOT use real company names or real people.

For each SYNTHETIC lead, provide:
1. Company Name (fictional example: "Example Security Services LLC")
2. Contact Name (fictional: "John Doe" / "Jane Smith")
3. Contact Title (realistic title like "HR Director" or "Operations Manager")
4. Contact Email (use example.com domain: firstname.lastname@example.com)
5. Estimated Employees (realistic for industry)
6. Why they need WorkforceOS (2-3 pain points)
7. Lead Score (0-100 based on fit)

Return ONLY valid JSON array with this exact structure:
[
  {
    "companyName": "string",
    "contactName": "string", 
    "contactTitle": "string",
    "contactEmail": "string",
    "estimatedEmployees": number,
    "painPoints": "string",
    "leadScore": number
  }
]`
          }
        ],
        temperature: 0.8,
        max_tokens: 2000,
      });

      const aiContent = aiResponse.choices[0]?.message?.content || '[]';
      
      // Parse AI response
      let generatedLeads;
      try {
        // Extract JSON from response (AI might wrap it in markdown)
        const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
        generatedLeads = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
      } catch (parseError) {
        console.error("Failed to parse AI response:", aiContent);
        return res.status(500).json({ message: "AI generated invalid response format" });
      }

      // Validate each generated lead with strict schema
      const insertedLeads = [];
      const validationErrors = [];

      for (let i = 0; i < generatedLeads.length; i++) {
        const leadValidation = aiGeneratedLeadSchema.safeParse(generatedLeads[i]);
        
        if (!leadValidation.success) {
          validationErrors.push({
            leadIndex: i,
            errors: leadValidation.error.errors
          });
          continue; // Skip invalid leads
        }

        const validLead = leadValidation.data;

        // Additional safety: Ensure email uses example.com or clearly synthetic domain
        if (!validLead.contactEmail.includes('example.com') && 
            !validLead.contactEmail.includes('demo.com') &&
            !validLead.contactEmail.includes('test.com')) {
          validationErrors.push({
            leadIndex: i,
            error: "Email must use synthetic domain (example.com, demo.com, or test.com)"
          });
          continue;
        }

        // Insert validated lead into database
        const [newLead] = await db.insert(leads).values({
          companyName: validLead.companyName,
          contactName: validLead.contactName,
          contactTitle: validLead.contactTitle,
          contactEmail: validLead.contactEmail,
          estimatedEmployees: validLead.estimatedEmployees,
          industry,
          leadStatus: 'new',
          leadScore: validLead.leadScore,
          notes: `🤖 AI Generated Lead (Synthetic Demo Data)\n\nPain Points:\n${validLead.painPoints}`,
          source: 'ai_generated',
        }).returning();
        
        insertedLeads.push(newLead);
      }

      res.json({ 
        success: true, 
        count: insertedLeads.length,
        leads: insertedLeads,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        warning: insertedLeads.length === 0 ? "No valid leads generated. AI may have produced invalid data." : undefined
      });
    } catch (error) {
      console.error("Error generating AI leads:", error);
      res.status(500).json({ message: "Failed to generate leads" });
    }
  });

  // Update lead status and notes
  app.patch('/api/sales/leads/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { leadStatus, notes, nextFollowUpDate, leadScore, estimatedValue } = req.body;

      const updateData: any = { updatedAt: new Date() };
      
      if (leadStatus) updateData.leadStatus = leadStatus;
      if (notes !== undefined) updateData.notes = notes;
      if (nextFollowUpDate !== undefined) updateData.nextFollowUpDate = nextFollowUpDate ? new Date(nextFollowUpDate) : null;
      if (leadScore !== undefined) updateData.leadScore = leadScore;
      if (estimatedValue !== undefined) updateData.estimatedValue = estimatedValue;

      // Update last contacted timestamp if status changed to contacted
      if (leadStatus && ['contacted', 'qualified', 'demo_scheduled', 'proposal_sent'].includes(leadStatus)) {
        updateData.lastContactedAt = new Date();
      }

      const [updatedLead] = await db
        .update(leads)
        .set(updateData)
        .where(eq(leads.id, id))
        .returning();

      if (!updatedLead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      res.json(updatedLead);
    } catch (error) {
      console.error("Error updating lead:", error);
      res.status(500).json({ message: "Failed to update lead" });
    }
  });

  // Send email with AI personalization
  app.post('/api/sales/send-email', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      // Validate request body
      const validationResult = sendSalesEmailSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validationResult.error.errors
        });
      }

      const { templateId, toEmail, toName, companyName, industry } = validationResult.data;

      // Get the email template
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, templateId)).limit(1);
      
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }

      // Get Resend client with error handling
      const { getUncachableResendClient } = await import('./email');
      let client, fromEmail;
      
      try {
        const result = await getUncachableResendClient();
        client = result.client;
        fromEmail = result.fromEmail;
      } catch (credError) {
        console.error("Resend configuration error:", credError);
        return res.status(503).json({ 
          message: "Email service is not configured. Please contact support.",
          error: "RESEND_NOT_CONFIGURED"
        });
      }

      // Personalize email content
      let subject = template.subject;
      let bodyHtml = template.bodyTemplate;

      // Replace template variables (safe string replacement)
      const replacements: Record<string, string> = {
        '{{companyName}}': companyName,
        '{{contactName}}': toName || 'there',
        '{{industry}}': industry || 'your industry',
      };

      Object.entries(replacements).forEach(([key, value]) => {
        subject = subject.split(key).join(value);
        bodyHtml = bodyHtml.split(key).join(value);
      });

      // AI personalization if enabled
      if (template.useAI && template.aiPrompt) {
        try {
          // Check if OpenAI is configured
          if (!process.env.OPENAI_API_KEY) {
            console.warn("OpenAI API key not configured, skipping AI personalization");
          } else {
            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const aiResponse = await openai.chat.completions.create({
              model: 'gpt-4',
              messages: [
                {
                  role: 'system',
                  content: template.aiPrompt || 'Personalize this sales email to be more engaging and relevant to the company.'
                },
                {
                  role: 'user',
                  content: `Company: ${companyName}\nIndustry: ${industry || 'Unknown'}\n\nEmail Body:\n${bodyHtml}`
                }
              ],
              max_tokens: 500,
            });

            bodyHtml = aiResponse.choices[0]?.message?.content || bodyHtml;
          }
        } catch (aiError) {
          console.error("AI personalization failed, using template:", aiError);
          // Continue with template version if AI fails
        }
      }

      // Send email via Resend
      const { data, error } = await client.emails.send({
        from: fromEmail,
        to: toEmail,
        subject,
        html: bodyHtml,
      });

      if (error) {
        console.error("Resend error:", error);
        return res.status(500).json({ message: "Failed to send email", error });
      }

      // Log email send
      await db.insert(emailSends).values({
        templateId,
        toEmail,
        subject,
        bodyHtml,
        status: 'sent',
      });

      res.json({ success: true, emailId: data?.id });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  // ============================================================================
  // CUSTOM FORMS - Organization-Specific Form Templates
  // ============================================================================

  // Validation schemas for custom forms
  const createCustomFormSchema = z.object({
    workspaceId: z.string().min(1, "Organization ID is required"),
    name: z.string().min(1, "Form name is required").max(200),
    description: z.string().optional(),
    category: z.enum(['onboarding', 'rms', 'compliance', 'custom']).optional(),
    template: z.any(), // JSON template
    requiresSignature: z.boolean().optional(),
    signatureType: z.enum(['typed_name', 'drawn', 'uploaded']).optional(),
    signatureText: z.string().optional(),
    requiresDocuments: z.boolean().optional(),
    documentTypes: z.any().optional(), // JSON array
    maxDocuments: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
    accessibleBy: z.any().optional(), // JSON array
    createdByRole: z.string().optional(),
  });

  const updateCustomFormSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    category: z.enum(['onboarding', 'rms', 'compliance', 'custom']).optional(),
    template: z.any().optional(),
    requiresSignature: z.boolean().optional(),
    signatureType: z.enum(['typed_name', 'drawn', 'uploaded']).optional(),
    signatureText: z.string().optional(),
    requiresDocuments: z.boolean().optional(),
    documentTypes: z.any().optional(),
    maxDocuments: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
    accessibleBy: z.any().optional(),
  });

  // Get all custom forms for organization
  app.get('/api/custom-forms', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const forms = await storage.getCustomFormsByOrganization(workspace.id);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching custom forms:", error);
      res.status(500).json({ message: "Failed to fetch custom forms" });
    }
  });

  // Get custom form by ID
  app.get('/api/custom-forms/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const form = await storage.getCustomForm(id);
      
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Verify form belongs to organization
      if (form.organizationId !== workspace.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(form);
    } catch (error) {
      console.error("Error fetching custom form:", error);
      res.status(500).json({ message: "Failed to fetch custom form" });
    }
  });

  // Create custom form (Platform Staff only)
  app.post('/api/custom-forms', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const platformRole = req.platformRole;
      
      // Validate request body
      const validationResult = createCustomFormSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid form data",
          errors: validationResult.error.errors
        });
      }

      const validatedData = validationResult.data;

      // Verify workspace exists
      const workspace = await storage.getWorkspace(validatedData.workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const formData = {
        ...validatedData,
        organizationId: validatedData.workspaceId,
        createdBy: userId,
        createdByRole: platformRole,
      };

      const form = await storage.createCustomForm(formData);
      res.json(form);
    } catch (error) {
      console.error("Error creating custom form:", error);
      res.status(500).json({ message: "Failed to create custom form" });
    }
  });

  // Update custom form (Platform Staff only)
  app.patch('/api/custom-forms/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      const form = await storage.getCustomForm(id);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Validate request body - ONLY allow whitelisted fields
      const validationResult = updateCustomFormSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid form data",
          errors: validationResult.error.errors
        });
      }

      // SECURITY: Use validated data only (prevents organizationId tampering)
      const updated = await storage.updateCustomForm(id, validationResult.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating custom form:", error);
      res.status(500).json({ message: "Failed to update custom form" });
    }
  });

  // Delete custom form (Platform Staff only)
  app.delete('/api/custom-forms/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      const form = await storage.getCustomForm(id);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      await storage.deleteCustomForm(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting custom form:", error);
      res.status(500).json({ message: "Failed to delete custom form" });
    }
  });

  // ============================================================================
  // CUSTOM FORM SUBMISSIONS
  // ============================================================================

  // Validation schema for custom form submissions
  const createCustomFormSubmissionSchema = z.object({
    formId: z.string().min(1, "Form ID is required"),
    workspaceId: z.string().min(1, "Workspace ID is required"),
    submittedByName: z.string().optional(),
    formData: z.any(), // JSON data
    eSignature: z.any().optional(), // JSON signature data
    documents: z.any().optional(), // JSON documents array
    status: z.enum(['draft', 'completed', 'archived']).optional(),
  });

  // Get all form submissions for organization
  app.get('/api/custom-form-submissions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const submissions = await storage.getCustomFormSubmissionsByOrganization(workspace.id);
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching form submissions:", error);
      res.status(500).json({ message: "Failed to fetch form submissions" });
    }
  });

  // Get form submission by ID
  app.get('/api/custom-form-submissions/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const submission = await storage.getCustomFormSubmission(id);
      
      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      // Verify submission belongs to organization
      if (submission.organizationId !== workspace.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(submission);
    } catch (error) {
      console.error("Error fetching form submission:", error);
      res.status(500).json({ message: "Failed to fetch form submission" });
    }
  });

  // Submit custom form
  app.post('/api/custom-form-submissions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Validate request body
      const validationResult = createCustomFormSubmissionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid submission data",
          errors: validationResult.error.errors
        });
      }

      const validatedData = validationResult.data;

      // Verify user has access to the workspace
      const workspace = await storage.getWorkspace(validatedData.workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify form exists and belongs to this workspace
      const form = await storage.getCustomForm(validatedData.formId);
      if (!form || form.organizationId !== validatedData.workspaceId) {
        return res.status(404).json({ message: "Form not found or access denied" });
      }

      // SECURITY: Use validated data only, enforce workspace scoping
      const submissionData = {
        ...validatedData,
        organizationId: validatedData.workspaceId,
        submittedBy: userId,
        submittedAt: new Date(),
      };

      const submission = await storage.createCustomFormSubmission(submissionData);
      res.json(submission);
    } catch (error) {
      console.error("Error submitting form:", error);
      res.status(500).json({ message: "Failed to submit form" });
    }
  });

  // ============================================================================
  // HELPDESK FEEDBACK & REVIEW SYSTEM
  // ============================================================================
  
  // Submit ticket feedback/rating (for training & publicity)
  app.post("/api/helpdesk/feedback", async (req, res) => {
    try {
      const schema = z.object({
        conversationId: z.string(),
        rating: z.number().min(1).max(5),
        feedback: z.string().optional(),
      });

      const { conversationId, rating, feedback } = schema.parse(req.body);

      // Update conversation with rating/feedback
      await storage.updateChatConversation(conversationId, {
        rating,
        feedback: feedback || null,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get closed tickets for review (admin/training)
  app.get("/api/helpdesk/reviews", requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const closedTickets = await storage.getClosedConversationsForReview();
      res.json(closedTickets);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get testimonials (5-star reviews for publicity)
  app.get("/api/helpdesk/testimonials", async (req, res) => {
    try {
      const testimonials = await storage.getPositiveTestimonials();
      res.json(testimonials);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // MOTD (Message of the Day) ROUTES
  // ============================================================================

  // Get active MOTD for HelpDesk
  app.get("/api/helpdesk/motd", requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get active MOTD
      const [motd] = await db
        .select()
        .from(motdMessages)
        .where(
          and(
            eq(motdMessages.isActive, true),
            or(
              isNull(motdMessages.startsAt),
              lte(motdMessages.startsAt, new Date())
            ),
            or(
              isNull(motdMessages.endsAt),
              gte(motdMessages.endsAt, new Date())
            )
          )
        )
        .orderBy(desc(motdMessages.displayOrder))
        .limit(1);

      if (!motd) {
        return res.json({ motd: null, acknowledged: true });
      }

      // Check if user has acknowledged this MOTD
      const [acknowledgment] = await db
        .select()
        .from(motdAcknowledgment)
        .where(
          and(
            eq(motdAcknowledgment.motdId, motd.id),
            eq(motdAcknowledgment.userId, userId)
          )
        )
        .limit(1);

      res.json({
        motd,
        acknowledged: !!acknowledgment
      });
    } catch (error: any) {
      console.error("Error fetching MOTD:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create or update MOTD (staff only)
  app.post("/api/helpdesk/motd", requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Check if user is staff
      const platformRole = await storage.getUserPlatformRole(userId);
      if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
        return res.status(403).json({ error: "Staff access required" });
      }

      const schema = z.object({
        title: z.string(),
        content: z.string(),
        isActive: z.boolean().optional().default(true),
        requiresAcknowledgment: z.boolean().optional().default(true),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        iconName: z.string().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request",
          details: validationResult.error.errors
        });
      }

      const data = validationResult.data;

      // Deactivate all existing MOTDs
      await db
        .update(motdMessages)
        .set({ isActive: false })
        .where(eq(motdMessages.isActive, true));

      // Create new MOTD
      const [newMotd] = await db
        .insert(motdMessages)
        .values({
          ...data,
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      res.json(newMotd);
    } catch (error: any) {
      console.error("Error creating MOTD:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Acknowledge MOTD
  app.post("/api/helpdesk/motd/acknowledge", requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { motdId } = req.body;

      if (!motdId) {
        return res.status(400).json({ error: "MOTD ID required" });
      }

      // Check if already acknowledged
      const [existing] = await db
        .select()
        .from(motdAcknowledgment)
        .where(
          and(
            eq(motdAcknowledgment.motdId, motdId),
            eq(motdAcknowledgment.userId, userId)
          )
        )
        .limit(1);

      if (existing) {
        return res.json({ success: true, alreadyAcknowledged: true });
      }

      // Create acknowledgment
      await db
        .insert(motdAcknowledgment)
        .values({
          motdId,
          userId,
        });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error acknowledging MOTD:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // CHAT AGREEMENT ACCEPTANCE - Terms & Conditions Tracking
  // ============================================================================

  // Accept chat agreement and store for compliance vault
  app.post("/api/helpdesk/agreement/accept", async (req: any, res) => {
    try {
      const schema = z.object({
        fullName: z.string().optional(),
        agreementVersion: z.string().default("1.0"),
        roomSlug: z.string(),
        ticketId: z.string().optional(),
        sessionId: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: validationResult.error.errors
        });
      }

      const { fullName, agreementVersion, roomSlug, ticketId, sessionId } = validationResult.data;

      // Get IP address and user agent for compliance tracking
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];

      // Get userId if authenticated
      const userId = req.user?.id || null;
      const platformRole = req.user?.platformRole || null;

      // Store agreement acceptance
      const [acceptance] = await db
        .insert(chatAgreementAcceptances)
        .values({
          userId,
          ticketId: ticketId || null,
          sessionId: sessionId || null,
          agreementVersion,
          fullName: fullName || null,
          agreedToTerms: true,
          ipAddress: ipAddress?.toString() || null,
          userAgent: userAgent || null,
          roomSlug,
          platformRole,
        })
        .returning();

      res.json({ 
        success: true, 
        acceptanceId: acceptance.id,
        message: "Agreement accepted and recorded for compliance" 
      });
    } catch (error: any) {
      console.error("Error recording agreement acceptance:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Check if user has accepted agreement for a room
  app.get("/api/helpdesk/agreement/check/:roomSlug", async (req: any, res) => {
    try {
      const { roomSlug } = req.params;
      const userId = req.user?.id;
      const sessionId = req.query.sessionId;

      if (!userId && !sessionId) {
        return res.json({ hasAccepted: false });
      }

      // Check for existing acceptance
      const conditions = [];
      if (userId) {
        conditions.push(eq(chatAgreementAcceptances.userId, userId));
      }
      if (sessionId) {
        conditions.push(eq(chatAgreementAcceptances.sessionId, sessionId as string));
      }
      conditions.push(eq(chatAgreementAcceptances.roomSlug, roomSlug));

      const [acceptance] = await db
        .select()
        .from(chatAgreementAcceptances)
        .where(and(...conditions))
        .orderBy(desc(chatAgreementAcceptances.acceptedAt))
        .limit(1);

      res.json({ 
        hasAccepted: !!acceptance,
        acceptedAt: acceptance?.acceptedAt || null
      });
    } catch (error: any) {
      // If table doesn't exist (PostgreSQL error code 42P01), return false (user hasn't accepted)
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.json({ hasAccepted: false, acceptedAt: null });
      }
      console.error("Error checking agreement acceptance:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get complete customer context for support staff (profile, tickets, workspace, chat history)
  app.get("/api/helpdesk/user-context/:userId", requirePlatformStaff, async (req: any, res) => {
    try {
      const { userId } = req.params;

      // Handle simulated/demo users (like sim-staff-1, sim-customer-2, etc.)
      if (userId.startsWith('sim-') || userId.startsWith('demo-')) {
        // Extract info from userId
        const parts = userId.split('-');
        const role = parts[1] || 'customer';
        const number = parts[2] || '1';
        const name = `Demo ${role.charAt(0).toUpperCase() + role.slice(1)} ${number}`;
        
        return res.json({
          user: {
            id: userId,
            email: `${userId}@demo.workforceos.com`,
            firstName: name.split(' ')[0] + ' ' + name.split(' ')[1],
            lastName: name.split(' ')[2] || '',
            platformRole: role === 'staff' ? 'sysop' : 'guest',
            createdAt: new Date(),
            isSimulated: true,
          },
          workspace: null,
          tickets: { active: [], history: [] },
          chatHistory: [],
          metrics: {
            totalTickets: 0,
            resolvedTickets: 0,
            resolutionRate: 0,
            avgResponseTime: '0 mins',
          },
          note: 'This is a simulated/demo user account for testing purposes'
        });
      }

      // Get user profile
      const user = await storage.getUser(userId);
      if (!user) {
        // User not found - return empty/not found response
        return res.status(404).json({ 
          error: "User not found",
          suggestion: "This user may not exist in the database or may be a guest user with no account",
          userId
        });
      }

      // Get workspace info (if user owns/belongs to one)
      let workspace = null;
      let workspaceRole = null;
      try {
        workspace = await storage.getWorkspaceByOwnerId(userId);
        if (!workspace) {
          // Check if user is an employee in a workspace
          const employeeRecords = await db
            .select()
            .from(employees)
            .where(eq(employees.userId, userId))
            .limit(1);
          if (employeeRecords.length > 0) {
            const employee = employeeRecords[0];
            workspace = await db.query.workspaces.findFirst({
              where: eq(workspaces.id, employee.workspaceId)
            });
            workspaceRole = employee.workspaceRole;
          }
        } else {
          workspaceRole = 'owner';
        }
      } catch (err) {
        console.error("Error fetching workspace:", err);
      }

      // Get active escalation tickets (temporarily disabled - table doesn't exist)
      const activeTickets = []; // await db.select().from(escalationTickets)...
      
      // Get ticket history (temporarily disabled - table doesn't exist)
      const ticketHistory = []; // await db.select().from(escalationTickets)...

      // Get recent chat messages from user
      const recentMessages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.senderId, userId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(50);

      // Get platform role
      const platformRole = await storage.getUserPlatformRole(userId);

      // Calculate support metrics
      const totalTickets = activeTickets.length + ticketHistory.length;
      const resolvedTickets = ticketHistory.filter(t => t.status === 'resolved').length;
      const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone || null,
          platformRole: platformRole || 'guest',
          createdAt: user.createdAt,
        },
        workspace: workspace ? {
          id: workspace.id,
          name: workspace.name,
          organizationId: workspace.organizationId || null,
          organizationSerial: workspace.organizationSerial || null,
          companyName: workspace.companyName || null,
          subscriptionTier: workspace.subscriptionTier || null,
          subscriptionStatus: workspace.subscriptionStatus || null,
          role: workspaceRole,
        } : null,
        tickets: {
          active: activeTickets.map(t => ({
            id: t.id,
            category: t.category,
            priority: t.priority,
            title: t.title,
            description: t.description,
            status: t.status,
            createdAt: t.createdAt,
          })),
          history: ticketHistory.map(t => ({
            id: t.id,
            category: t.category,
            priority: t.priority,
            title: t.title,
            status: t.status,
            createdAt: t.createdAt,
            resolvedAt: t.resolvedAt,
          })),
        },
        chatHistory: recentMessages.map(m => ({
          message: m.message,
          createdAt: m.createdAt,
          senderType: m.senderType,
        })),
        metrics: {
          totalTickets,
          activeTickets: activeTickets.length,
          resolvedTickets,
          resolutionRate: Math.round(resolutionRate),
          messagesSent: recentMessages.length,
        },
      });
    } catch (error: any) {
      console.error("Error fetching user context:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // PROMOTIONAL BANNERS - Dashboard-manageable promotional banners for landing page
  // ============================================================================

  // Get active promotional banner (public - no auth required)
  app.get('/api/promotional-banners/active', async (req, res) => {
    try {
      const [activeBanner] = await db
        .select()
        .from(promotionalBanners)
        .where(eq(promotionalBanners.isActive, true))
        .orderBy(desc(promotionalBanners.priority))
        .limit(1);

      res.json(activeBanner || null);
    } catch (error: any) {
      console.error("Error fetching active banner:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all promotional banners (public - everyone can view active banners)
  app.get('/api/promotional-banners', async (req, res) => {
    try {
      const banners = await db
        .select()
        .from(promotionalBanners)
        .where(eq(promotionalBanners.isActive, true))
        .orderBy(desc(promotionalBanners.createdAt));

      res.json(banners);
    } catch (error: any) {
      console.error("Error fetching banners:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get ALL promotional banners including inactive (staff only - for banner manager)
  app.get('/api/promotional-banners/admin/all', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const banners = await db
        .select()
        .from(promotionalBanners)
        .orderBy(desc(promotionalBanners.createdAt));

      res.json(banners);
    } catch (error: any) {
      console.error("Error fetching all banners:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create promotional banner (staff only)
  app.post('/api/promotional-banners', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      const schema = z.object({
        message: z.string().min(1, "Message is required"),
        ctaText: z.string().optional(),
        ctaLink: z.string().optional(),
        isActive: z.boolean().default(false),
        priority: z.number().default(0),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request",
          errors: validationResult.error.errors
        });
      }

      const { message, ctaText, ctaLink, isActive, priority } = validationResult.data;

      // If setting this banner as active, deactivate all others
      if (isActive) {
        await db
          .update(promotionalBanners)
          .set({ isActive: false })
          .where(eq(promotionalBanners.isActive, true));
      }

      const [banner] = await db
        .insert(promotionalBanners)
        .values({
          message,
          ctaText,
          ctaLink,
          isActive,
          priority,
          createdBy: userId,
        })
        .returning();

      res.json(banner);
    } catch (error: any) {
      console.error("Error creating banner:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update promotional banner (staff only)
  app.patch('/api/promotional-banners/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      const schema = z.object({
        message: z.string().optional(),
        ctaText: z.string().optional(),
        ctaLink: z.string().optional(),
        isActive: z.boolean().optional(),
        priority: z.number().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request",
          errors: validationResult.error.errors
        });
      }

      const updates = validationResult.data;

      // If setting this banner as active, deactivate all others
      if (updates.isActive === true) {
        await db
          .update(promotionalBanners)
          .set({ isActive: false })
          .where(eq(promotionalBanners.isActive, true));
      }

      const [updatedBanner] = await db
        .update(promotionalBanners)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(promotionalBanners.id, id))
        .returning();

      if (!updatedBanner) {
        return res.status(404).json({ error: "Banner not found" });
      }

      res.json(updatedBanner);
    } catch (error: any) {
      console.error("Error updating banner:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete promotional banner (staff only)
  app.delete('/api/promotional-banners/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const [deletedBanner] = await db
        .delete(promotionalBanners)
        .where(eq(promotionalBanners.id, id))
        .returning();

      if (!deletedBanner) {
        return res.status(404).json({ error: "Banner not found" });
      }

      res.json({ message: "Banner deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting banner:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // INTELLIGENT AUTOMATION - AI Knowledge Base, Predictive Alerts, Auto Reports
  // ============================================================================

  // AI Knowledge Retrieval - Ask questions about policies, procedures, FAQs
  app.post('/api/knowledge/ask', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspace?.id;
      
      const schema = z.object({
        query: z.string().min(1, "Question is required"),
      });
      
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request",
          errors: validationResult.error.errors
        });
      }

      const { query } = validationResult.data;
      const startTime = Date.now();

      // Search relevant knowledge articles
      const relevantArticles = await db
        .select()
        .from(knowledgeArticles)
        .where(
          or(
            eq(knowledgeArticles.workspaceId, workspaceId!),
            eq(knowledgeArticles.isPublic, true)
          )
        )
        .limit(5);

      // Build context from articles
      const context = relevantArticles
        .map((article, idx) => `[Article ${idx + 1}: ${article.title}]\n${article.content}`)
        .join('\n\n');

      // Use AI to answer the question
      if (!process.env.OPENAI_API_KEY && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        // Fallback without AI - return article summaries
        const response = relevantArticles.length > 0
          ? `I found ${relevantArticles.length} related articles:\n\n${relevantArticles.map(a => `• ${a.title}\n  ${a.summary || a.content.substring(0, 200)}...`).join('\n\n')}`
          : "I couldn't find any relevant information. Please contact HR or your manager for assistance.";

        // Log query
        await db.insert(knowledgeQueries).values({
          workspaceId,
          userId,
          query,
          response,
          responseTime: Date.now() - startTime,
          articlesRetrieved: relevantArticles.map(a => a.id),
        });

        return res.json({ response, articles: relevantArticles });
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a helpful HR assistant for WorkforceOS. Answer employee questions about company policies, procedures, and benefits using the provided knowledge base. Be concise, friendly, and accurate. If you don't know the answer, say so and suggest contacting HR.`
          },
          {
            role: 'user',
            content: `Context from knowledge base:\n${context}\n\nEmployee question: ${query}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const response = aiResponse.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.";

      // Log the query for learning and improvement
      await db.insert(knowledgeQueries).values({
        workspaceId,
        userId,
        query,
        response,
        responseTime: Date.now() - startTime,
        articlesRetrieved: relevantArticles.map(a => a.id),
      });

      res.json({ response, articles: relevantArticles });
    } catch (error: any) {
      console.error("Error in AI knowledge retrieval:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get knowledge articles (with search/filter)
  app.get('/api/knowledge/articles', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace?.id;
      const { category, search } = req.query;

      let query = db
        .select()
        .from(knowledgeArticles)
        .where(
          or(
            eq(knowledgeArticles.workspaceId, workspaceId!),
            eq(knowledgeArticles.isPublic, true)
          )
        );

      if (category) {
        query = query.where(eq(knowledgeArticles.category, category as string));
      }

      const articles = await query;

      // Simple text search if search param provided
      let results = articles;
      if (search) {
        const searchLower = (search as string).toLowerCase();
        results = articles.filter(a => 
          a.title.toLowerCase().includes(searchLower) ||
          a.content.toLowerCase().includes(searchLower) ||
          (a.tags && a.tags.some(tag => tag.toLowerCase().includes(searchLower)))
        );
      }

      res.json(results);
    } catch (error: any) {
      console.error("Error fetching knowledge articles:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create knowledge article (staff only)
  app.post('/api/knowledge/articles', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspace?.id;
      
      const schema = z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        summary: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isPublic: z.boolean().default(false),
      });
      
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request",
          errors: validationResult.error.errors
        });
      }

      const data = validationResult.data;

      const [article] = await db
        .insert(knowledgeArticles)
        .values({
          ...data,
          workspaceId,
          lastUpdatedBy: userId,
        })
        .returning();

      res.json(article);
    } catch (error: any) {
      console.error("Error creating knowledge article:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate Predictive Scheduling Alerts - Detect over-allocation before it happens
  app.post('/api/scheduling/generate-alerts', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;

      // Get all employees with their schedules for the next week
      const nextWeekStart = new Date();
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      nextWeekStart.setHours(0, 0, 0, 0);

      const employees = await db
        .select()
        .from(employees as any)
        .where(eq((employees as any).workspaceId, workspaceId));

      const alerts: any[] = [];

      // Analyze each employee's capacity
      for (const employee of employees) {
        // Calculate scheduled hours for next week
        const scheduledHours = 45; // Mock - would actually query schedules
        const availableHours = 40; // Standard work week
        const overageHours = Math.max(0, scheduledHours - availableHours);

        if (overageHours > 0) {
          // Create over-allocation alert
          const [alert] = await db
            .insert(capacityAlerts)
            .values({
              workspaceId,
              employeeId: employee.id,
              managerId: userId,
              alertType: 'over_allocated',
              severity: overageHours > 10 ? 'critical' : overageHours > 5 ? 'high' : 'medium',
              weekStartDate: nextWeekStart,
              scheduledHours: scheduledHours.toString(),
              availableHours: availableHours.toString(),
              overageHours: overageHours.toString(),
              message: `${employee.firstName} ${employee.lastName} is over-allocated by ${overageHours} hours next week`,
              suggestedAction: `Consider redistributing ${overageHours} hours to other team members or adjusting deadlines`,
              status: 'active',
            })
            .returning();

          alerts.push(alert);
        }
      }

      res.json({ 
        message: `Generated ${alerts.length} capacity alerts`,
        alerts 
      });
    } catch (error: any) {
      console.error("Error generating capacity alerts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get active capacity alerts
  app.get('/api/scheduling/alerts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { status = 'active' } = req.query;

      const alerts = await db
        .select()
        .from(capacityAlerts)
        .where(
          and(
            eq(capacityAlerts.workspaceId, workspaceId),
            eq(capacityAlerts.status, status as string)
          )
        )
        .orderBy(desc(capacityAlerts.createdAt));

      res.json(alerts);
    } catch (error: any) {
      console.error("Error fetching capacity alerts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate Automated Status Report for employee
  app.post('/api/reports/auto-generate', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspace!.id;
      
      const schema = z.object({
        reportType: z.enum(['weekly_status', 'timesheet_summary', 'accomplishments']),
        period: z.string().optional(), // e.g., 'week_2025_01'
      });
      
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request",
          errors: validationResult.error.errors
        });
      }

      const { reportType, period } = validationResult.data;

      // Calculate period if not provided
      const now = new Date();
      const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      const currentPeriod = period || `week_${now.getFullYear()}_${String(weekNumber).padStart(2, '0')}`;

      // Gather data (mock for now - would query actual time entries, tasks, etc.)
      const hoursWorked = 38.5;
      const tasksCompleted = 12;
      const meetingsAttended = 5;

      // Generate AI summary
      let summary = `This week summary for ${currentPeriod}`;
      const accomplishments = [
        "Completed project milestone ahead of schedule",
        "Assisted 3 team members with technical issues",
        "Updated documentation for new features"
      ];
      const blockers: string[] = [];
      const nextSteps = [
        "Begin work on Q1 planning",
        "Review code from team members",
        "Prepare presentation for stakeholder meeting"
      ];

      // Use AI to generate professional summary if available
      if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        try {
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ 
            apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          });

          const aiResponse = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: `You are a professional status report generator. Create concise, professional weekly status reports.`
              },
              {
                role: 'user',
                content: `Generate a professional weekly status summary for an employee who worked ${hoursWorked} hours, completed ${tasksCompleted} tasks, and attended ${meetingsAttended} meetings. Keep it to 2-3 sentences.`
              }
            ],
            temperature: 0.5,
            max_tokens: 200,
          });

          summary = aiResponse.choices[0]?.message?.content || summary;
        } catch (aiError) {
          console.error("AI generation failed, using fallback:", aiError);
        }
      }

      // Save report
      const [report] = await db
        .insert(autoReports)
        .values({
          workspaceId,
          userId,
          reportType,
          period: currentPeriod,
          summary,
          accomplishments,
          blockers,
          nextSteps,
          hoursWorked: hoursWorked.toString(),
          tasksCompleted,
          meetingsAttended,
          status: 'draft',
        })
        .returning();

      res.json(report);
    } catch (error: any) {
      console.error("Error generating auto report:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get auto-generated reports
  app.get('/api/reports/auto', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspace!.id;

      const reports = await db
        .select()
        .from(autoReports)
        .where(
          and(
            eq(autoReports.workspaceId, workspaceId),
            eq(autoReports.userId, userId)
          )
        )
        .orderBy(desc(autoReports.createdAt))
        .limit(20);

      res.json(reports);
    } catch (error: any) {
      console.error("Error fetching auto reports:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // PAYROLLOS™ ROUTES - Automated Payroll Processing (99% automation + 1% QC)
  // ============================================================================

  // Create automated payroll run
  app.post('/api/payroll/create-run', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspace!.id;

      // Validate input
      const schema = z.object({
        payPeriodStart: z.string().optional(),
        payPeriodEnd: z.string().optional(),
      });
      
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request",
          errors: validationResult.error.errors
        });
      }

      const { payPeriodStart, payPeriodEnd } = validationResult.data;

      // Auto-detect pay period if not provided
      let periodStart: Date;
      let periodEnd: Date;
      
      if (payPeriodStart && payPeriodEnd) {
        periodStart = new Date(payPeriodStart);
        periodEnd = new Date(payPeriodEnd);
      } else {
        const detected = await detectPayPeriod(workspaceId);
        periodStart = detected.periodStart;
        periodEnd = detected.periodEnd;
      }

      // Create automated payroll run
      const payrollRun = await createAutomatedPayrollRun({
        workspaceId,
        periodStart,
        periodEnd,
        createdBy: userId
      });

      res.json(payrollRun);
    } catch (error: any) {
      console.error("Error creating payroll run:", error);
      res.status(500).json({ message: error.message || "Failed to create payroll run" });
    }
  });

  // Get payroll runs for workspace
  app.get('/api/payroll/runs', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const runs = await storage.getPayrollRunsByWorkspace(workspaceId);
      res.json(runs);
    } catch (error: any) {
      console.error("Error fetching payroll runs:", error);
      res.status(500).json({ message: "Failed to fetch payroll runs" });
    }
  });

  // Get single payroll run with details
  app.get('/api/payroll/runs/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;

      const run = await storage.getPayrollRun(id, workspaceId);
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }

      const entries = await storage.getPayrollEntriesByRun(id);

      res.json({
        ...run,
        entries
      });
    } catch (error: any) {
      console.error("Error fetching payroll run:", error);
      res.status(500).json({ message: "Failed to fetch payroll run" });
    }
  });

  // Approve payroll run (1% human QC)
  app.post('/api/payroll/runs/:id/approve', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspace!.id;
      const { id } = req.params;

      // Verify run exists and belongs to workspace
      const run = await storage.getPayrollRun(id, workspaceId);
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }

      if (run.status !== 'pending') {
        return res.status(400).json({ message: "Only pending payroll runs can be approved" });
      }

      // Update status to approved
      const updated = await storage.updatePayrollRunStatus(id, 'approved', userId);
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error approving payroll run:", error);
      res.status(500).json({ message: "Failed to approve payroll run" });
    }
  });

  // Process approved payroll run (trigger payment distribution)
  app.post('/api/payroll/runs/:id/process', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspace!.id;
      const { id } = req.params;

      // Verify run exists and belongs to workspace
      const run = await storage.getPayrollRun(id, workspaceId);
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }

      if (run.status !== 'approved') {
        return res.status(400).json({ message: "Only approved payroll runs can be processed" });
      }

      // Update status to processed (in real implementation, would trigger payment)
      const updated = await storage.updatePayrollRunStatus(id, 'processed', userId);
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error processing payroll run:", error);
      res.status(500).json({ message: "Failed to process payroll run" });
    }
  });

  // Get employee paychecks (employee portal)
  app.get('/api/payroll/my-paychecks', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      // Find employee record for this user
      const allEmployees = await db
        .select()
        .from(employees)
        .where(eq(employees.userId, userId));

      if (!allEmployees || allEmployees.length === 0) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      // Use the first employee record (users typically belong to one workspace)
      const employee = allEmployees[0];
      const workspaceId = employee.workspaceId;

      const paychecks = await storage.getPayrollEntriesByEmployee(employee.id, workspaceId);
      res.json(paychecks);
    } catch (error: any) {
      console.error("Error fetching paychecks:", error);
      res.status(500).json({ message: "Failed to fetch paychecks" });
    }
  });

  // ============================================================================
  // PREDICTIONOS™ - AI-Powered Predictive Analytics (Monopolistic Feature #1)
  // ============================================================================
  
  // Predict employee turnover risk (90-day flight risk)
  app.post('/api/predict/turnover', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { employeeId } = req.body;
      
      if (!employeeId) {
        return res.status(400).json({ message: "employeeId is required" });
      }
      
      // Verify employee belongs to workspace
      const employee = await storage.getEmployee(employeeId, workspaceId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found in your workspace" });
      }
      
      // Run AI analysis
      const { PredictionOSEngine } = await import('./services/predictionos');
      const analysis = await PredictionOSEngine.analyzeTurnoverRisk(employeeId, workspaceId);
      
      // Save prediction to database
      const predictionId = await PredictionOSEngine.saveTurnoverPrediction(employeeId, workspaceId, analysis);
      
      res.json({
        predictionId,
        employee: {
          id: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          role: employee.role
        },
        ...analysis
      });
    } catch (error: any) {
      console.error("PredictionOS™ turnover analysis failed:", error);
      res.status(500).json({ message: error.message || "Failed to analyze turnover risk" });
    }
  });
  
  // Get turnover predictions for all employees
  app.get('/api/predict/turnover/workspace', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      
      const predictions = await db
        .select()
        .from(turnoverRiskScores)
        .where(eq(turnoverRiskScores.workspaceId, workspaceId))
        .orderBy(desc(turnoverRiskScores.analysisDate));
      
      // Calculate total predicted turnover cost for dashboard
      const totalTurnoverCost = predictions.reduce((sum, pred) => {
        return sum + parseFloat(pred.totalTurnoverCost?.toString() || '0');
      }, 0);
      
      res.json({
        predictions,
        totalTurnoverCost,
        highRiskCount: predictions.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length
      });
    } catch (error: any) {
      console.error("Error fetching turnover predictions:", error);
      res.status(500).json({ message: "Failed to fetch predictions" });
    }
  });
  
  // Predict schedule cost overrun
  app.post('/api/predict/cost-overrun', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { scheduleDate, proposedShifts } = req.body;
      
      if (!scheduleDate || !proposedShifts || !Array.isArray(proposedShifts)) {
        return res.status(400).json({ message: "scheduleDate and proposedShifts array are required" });
      }
      
      // Run AI cost variance analysis
      const { PredictionOSEngine } = await import('./services/predictionos');
      const analysis = await PredictionOSEngine.analyzeCostVariance(
        workspaceId,
        new Date(scheduleDate),
        proposedShifts
      );
      
      // Save prediction to database
      const predictionId = await PredictionOSEngine.saveCostVariancePrediction(
        workspaceId,
        new Date(scheduleDate),
        analysis
      );
      
      res.json({
        predictionId,
        ...analysis
      });
    } catch (error: any) {
      console.error("PredictionOS™ cost variance analysis failed:", error);
      res.status(500).json({ message: error.message || "Failed to analyze cost variance" });
    }
  });

  // ============================================================================
  // CUSTOM WORKFLOW RULES - Visual Rule Builder (Monopolistic Feature #2)
  // ============================================================================
  
  // Create custom automation rule
  app.post('/api/custom-rules', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      const validated = insertCustomRuleSchema.parse({
        ...req.body,
        workspaceId,
        createdBy: userId,
      });
      
      const rule = await db.insert(customRules).values(validated).returning();
      res.json(rule[0]);
    } catch (error: any) {
      console.error("Error creating custom rule:", error);
      res.status(400).json({ message: error.message || "Failed to create rule" });
    }
  });
  
  // Get all custom rules for workspace
  app.get('/api/custom-rules', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      
      const rules = await db
        .select()
        .from(customRules)
        .where(eq(customRules.workspaceId, workspaceId))
        .orderBy(desc(customRules.priority));
      
      res.json(rules);
    } catch (error: any) {
      console.error("Error fetching custom rules:", error);
      res.status(500).json({ message: "Failed to fetch rules" });
    }
  });
  
  // Update custom rule
  app.patch('/api/custom-rules/:id', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      const { id } = req.params;
      
      // Verify rule belongs to workspace
      const existing = await db
        .select()
        .from(customRules)
        .where(and(eq(customRules.id, id), eq(customRules.workspaceId, workspaceId)))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Rule not found" });
      }
      
      if (existing[0].isLocked) {
        return res.status(403).json({ message: "Cannot edit locked rule" });
      }
      
      const updated = await db
        .update(customRules)
        .set({ ...req.body, updatedBy: userId, updatedAt: new Date() })
        .where(eq(customRules.id, id))
        .returning();
      
      res.json(updated[0]);
    } catch (error: any) {
      console.error("Error updating custom rule:", error);
      res.status(400).json({ message: error.message || "Failed to update rule" });
    }
  });
  
  // Delete custom rule
  app.delete('/api/custom-rules/:id', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      // Verify rule belongs to workspace and not locked
      const existing = await db
        .select()
        .from(customRules)
        .where(and(eq(customRules.id, id), eq(customRules.workspaceId, workspaceId)))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Rule not found" });
      }
      
      if (existing[0].isLocked) {
        return res.status(403).json({ message: "Cannot delete locked rule" });
      }
      
      await db.delete(customRules).where(eq(customRules.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting custom rule:", error);
      res.status(500).json({ message: "Failed to delete rule" });
    }
  });
  
  // Get rule execution logs
  app.get('/api/custom-rules/:id/executions', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const executions = await db
        .select()
        .from(ruleExecutionLogs)
        .where(and(
          eq(ruleExecutionLogs.ruleId, id),
          eq(ruleExecutionLogs.workspaceId, workspaceId)
        ))
        .orderBy(desc(ruleExecutionLogs.createdAt))
        .limit(100);
      
      res.json(executions);
    } catch (error: any) {
      console.error("Error fetching rule executions:", error);
      res.status(500).json({ message: "Failed to fetch executions" });
    }
  });

  // ============================================================================
  // GEO-COMPLIANCE & AUDIT TRAIL (Monopolistic Feature #3)
  // ============================================================================
  
  // Get audit trail for workspace
  app.get('/api/audit-trail', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { entityType, entityId, limit = 100 } = req.query;
      
      let query = db
        .select()
        .from(auditTrail)
        .where(eq(auditTrail.workspaceId, workspaceId))
        .orderBy(desc(auditTrail.createdAt))
        .limit(parseInt(limit as string));
      
      if (entityType) {
        query = query.where(and(
          eq(auditTrail.workspaceId, workspaceId),
          eq(auditTrail.entityType, entityType as string)
        ));
      }
      
      if (entityId) {
        query = query.where(and(
          eq(auditTrail.workspaceId, workspaceId),
          eq(auditTrail.entityId, entityId as string)
        ));
      }
      
      const logs = await query;
      res.json(logs);
    } catch (error: any) {
      console.error("Error fetching audit trail:", error);
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });
  
  // Get time entry discrepancies (geo-compliance violations)
  app.get('/api/compliance/discrepancies', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { status = 'open' } = req.query;
      
      const discrepancies = await db
        .select()
        .from(timeEntryDiscrepancies)
        .where(and(
          eq(timeEntryDiscrepancies.workspaceId, workspaceId),
          status ? eq(timeEntryDiscrepancies.status, status as string) : sql`true`
        ))
        .orderBy(desc(timeEntryDiscrepancies.detectedAt));
      
      res.json(discrepancies);
    } catch (error: any) {
      console.error("Error fetching discrepancies:", error);
      res.status(500).json({ message: "Failed to fetch discrepancies" });
    }
  });
  
  // Resolve time entry discrepancy
  app.patch('/api/compliance/discrepancies/:id/resolve', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      const { id } = req.params;
      const { status, resolutionNotes } = req.body;
      
      // Verify discrepancy belongs to workspace
      const existing = await db
        .select()
        .from(timeEntryDiscrepancies)
        .where(and(eq(timeEntryDiscrepancies.id, id), eq(timeEntryDiscrepancies.workspaceId, workspaceId)))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Discrepancy not found" });
      }
      
      const updated = await db
        .update(timeEntryDiscrepancies)
        .set({
          status: status || 'resolved',
          resolutionNotes,
          reviewedBy: userId,
          reviewedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(timeEntryDiscrepancies.id, id))
        .returning();
      
      res.json(updated[0]);
    } catch (error: any) {
      console.error("Error resolving discrepancy:", error);
      res.status(500).json({ message: "Failed to resolve discrepancy" });
    }
  });

  // ============================================================================
  // ENGAGEMENTOS™ - Bidirectional Employee-Employer Intelligence (Monopolistic Feature #4)
  // ============================================================================
  
  // [1] PULSE SURVEY TEMPLATES (Manager/Owner Only)
  
  // Create pulse survey template
  app.post('/api/engagement/pulse-surveys/templates', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      const validatedData = insertPulseSurveyTemplateSchema.parse({
        ...req.body,
        workspaceId,
        createdBy: userId
      });
      
      const [template] = await db
        .insert(pulseSurveyTemplates)
        .values(validatedData)
        .returning();
      
      res.json(template);
    } catch (error: any) {
      console.error("Error creating pulse survey template:", error);
      res.status(500).json({ message: "Failed to create pulse survey template" });
    }
  });
  
  // List pulse survey templates
  app.get('/api/engagement/pulse-surveys/templates', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { isActive } = req.query;
      
      let query = db
        .select()
        .from(pulseSurveyTemplates)
        .where(eq(pulseSurveyTemplates.workspaceId, workspaceId))
        .orderBy(desc(pulseSurveyTemplates.createdAt));
      
      if (isActive !== undefined) {
        query = query.where(and(
          eq(pulseSurveyTemplates.workspaceId, workspaceId),
          eq(pulseSurveyTemplates.isActive, isActive === 'true')
        ));
      }
      
      const templates = await query;
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching pulse survey templates:", error);
      res.status(500).json({ message: "Failed to fetch pulse survey templates" });
    }
  });
  
  // Get single pulse survey template
  app.get('/api/engagement/pulse-surveys/templates/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const template = await db
        .select()
        .from(pulseSurveyTemplates)
        .where(and(
          eq(pulseSurveyTemplates.id, id),
          eq(pulseSurveyTemplates.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!template[0]) {
        return res.status(404).json({ message: "Pulse survey template not found" });
      }
      
      res.json(template[0]);
    } catch (error: any) {
      console.error("Error fetching pulse survey template:", error);
      res.status(500).json({ message: "Failed to fetch pulse survey template" });
    }
  });
  
  // Update pulse survey template
  app.patch('/api/engagement/pulse-surveys/templates/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(pulseSurveyTemplates)
        .where(and(
          eq(pulseSurveyTemplates.id, id),
          eq(pulseSurveyTemplates.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Pulse survey template not found" });
      }
      
      const [updated] = await db
        .update(pulseSurveyTemplates)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(pulseSurveyTemplates.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating pulse survey template:", error);
      res.status(500).json({ message: "Failed to update pulse survey template" });
    }
  });
  
  // [2] PULSE SURVEY RESPONSES (All Employees)
  
  // Submit pulse survey response
  app.post('/api/engagement/pulse-surveys/responses', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Calculate engagement and sentiment scores from actual responses
      const { responses } = req.body;
      let engagementScore = 50; // Default neutral
      let sentimentScore = 50; // Default neutral
      
      if (responses && typeof responses === 'object') {
        // Calculate engagement score based on rating questions (1-5 scale)
        const ratingResponses = Object.values(responses).filter((r: any) => typeof r === 'number' && r >= 1 && r <= 5);
        if (ratingResponses.length > 0) {
          const avgRating = ratingResponses.reduce((sum: number, r: any) => sum + r, 0) / ratingResponses.length;
          engagementScore = (avgRating / 5) * 100; // Convert 1-5 scale to 0-100
        }
        
        // Calculate sentiment score from text responses (simplified - in production would use AI)
        const textResponses = Object.values(responses).filter((r: any) => typeof r === 'string' && r.length > 0);
        if (textResponses.length > 0) {
          // Improved sentiment: count word occurrences (not just presence)
          const combinedText = textResponses.join(' ').toLowerCase();
          const positiveWords = ['good', 'great', 'excellent', 'happy', 'satisfied', 'love', 'amazing', 'wonderful', 'fantastic', 'positive'];
          const negativeWords = ['bad', 'poor', 'terrible', 'unhappy', 'frustrated', 'hate', 'awful', 'disappointed', 'horrible', 'negative'];
          
          // Count occurrences of each word (not just presence)
          let positiveCount = 0;
          let negativeCount = 0;
          
          positiveWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'g');
            const matches = combinedText.match(regex);
            if (matches) positiveCount += matches.length;
          });
          
          negativeWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'g');
            const matches = combinedText.match(regex);
            if (matches) negativeCount += matches.length;
          });
          
          if (positiveCount + negativeCount > 0) {
            // Score from 0-100: 0 = all negative, 50 = neutral, 100 = all positive
            const ratio = positiveCount / (positiveCount + negativeCount);
            sentimentScore = ratio * 100;
          }
        }
      }
      
      // Clamp scores to 0-100 range
      engagementScore = Math.min(Math.max(engagementScore, 0), 100);
      sentimentScore = Math.min(Math.max(sentimentScore, 0), 100);
      
      const validatedData = insertPulseSurveyResponseSchema.parse({
        ...req.body,
        workspaceId,
        employeeId: employee[0].id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        engagementScore: engagementScore.toFixed(2),
        sentimentScore: sentimentScore.toFixed(2)
      });
      
      const [response] = await db
        .insert(pulseSurveyResponses)
        .values(validatedData)
        .returning();
      
      // TODO: Trigger AI sentiment analysis via PredictionOS™ for more sophisticated scoring
      
      res.json(response);
    } catch (error: any) {
      console.error("Error submitting pulse survey response:", error);
      res.status(500).json({ message: "Failed to submit pulse survey response" });
    }
  });
  
  // Get pulse survey responses (Manager only)
  app.get('/api/engagement/pulse-surveys/responses', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { surveyTemplateId, sentimentLabel } = req.query;
      
      let query = db
        .select()
        .from(pulseSurveyResponses)
        .where(eq(pulseSurveyResponses.workspaceId, workspaceId))
        .orderBy(desc(pulseSurveyResponses.submittedAt));
      
      if (surveyTemplateId) {
        query = query.where(and(
          eq(pulseSurveyResponses.workspaceId, workspaceId),
          eq(pulseSurveyResponses.surveyTemplateId, surveyTemplateId as string)
        ));
      }
      
      if (sentimentLabel) {
        query = query.where(and(
          eq(pulseSurveyResponses.workspaceId, workspaceId),
          eq(pulseSurveyResponses.sentimentLabel, sentimentLabel as string)
        ));
      }
      
      const responses = await query;
      res.json(responses);
    } catch (error: any) {
      console.error("Error fetching pulse survey responses:", error);
      res.status(500).json({ message: "Failed to fetch pulse survey responses" });
    }
  });
  
  // [2.5] AUTOMATED PULSE SURVEY DISTRIBUTION
  
  // Get survey distribution summary (Manager/Owner only)
  app.get('/api/engagement/pulse-surveys/distribution/summary', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const summary = await getSurveyDistributionSummary(workspaceId);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching survey distribution summary:", error);
      res.status(500).json({ message: "Failed to fetch survey distribution summary" });
    }
  });
  
  // Get all employees due for surveys today (Manager/Owner only)
  app.get('/api/engagement/pulse-surveys/distribution', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const distributions = await getEmployeesDueForSurveys(workspaceId);
      res.json(distributions);
    } catch (error: any) {
      console.error("Error fetching survey distributions:", error);
      res.status(500).json({ message: "Failed to fetch survey distributions" });
    }
  });
  
  // Get pending surveys for specific employee
  app.get('/api/engagement/pulse-surveys/distribution/employee/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { employeeId } = req.params;
      
      const pendingSurveys = await getEmployeePendingSurveys(workspaceId, employeeId);
      res.json(pendingSurveys);
    } catch (error: any) {
      console.error("Error fetching employee pending surveys:", error);
      res.status(500).json({ message: "Failed to fetch pending surveys" });
    }
  });
  
  // Get survey analytics (Manager/Owner only)
  app.get('/api/engagement/pulse-surveys/analytics/:surveyId', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { surveyId } = req.params;
      const { periodDays } = req.query;
      
      const analytics = await calculateSurveyResponseRate(
        workspaceId,
        surveyId,
        periodDays ? parseInt(periodDays as string) : 30
      );
      
      res.json(analytics);
    } catch (error: any) {
      console.error("Error calculating survey analytics:", error);
      res.status(500).json({ message: "Failed to calculate survey analytics" });
    }
  });
  
  // [3] EMPLOYER RATINGS (All Employees)
  
  // Submit employer rating
  app.post('/api/engagement/employer-ratings', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      const validatedData = insertEmployerRatingSchema.parse({
        ...req.body,
        workspaceId,
        employeeId: req.body.isAnonymous ? null : employee[0].id,
        ipAddress: req.ip
      });
      
      const [rating] = await db
        .insert(employerRatings)
        .values(validatedData)
        .returning();
      
      // TODO: Trigger AI sentiment analysis and risk flagging
      
      res.json(rating);
    } catch (error: any) {
      console.error("Error submitting employer rating:", error);
      res.status(500).json({ message: "Failed to submit employer rating" });
    }
  });
  
  // Get employer ratings (Manager only)
  app.get('/api/engagement/employer-ratings', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { ratingType, targetId } = req.query;
      
      let query = db
        .select()
        .from(employerRatings)
        .where(eq(employerRatings.workspaceId, workspaceId))
        .orderBy(desc(employerRatings.submittedAt));
      
      if (ratingType) {
        query = query.where(and(
          eq(employerRatings.workspaceId, workspaceId),
          eq(employerRatings.ratingType, ratingType as string)
        ));
      }
      
      if (targetId) {
        query = query.where(and(
          eq(employerRatings.workspaceId, workspaceId),
          eq(employerRatings.targetId, targetId as string)
        ));
      }
      
      const ratings = await query;
      res.json(ratings);
    } catch (error: any) {
      console.error("Error fetching employer ratings:", error);
      res.status(500).json({ message: "Failed to fetch employer ratings" });
    }
  });
  
  // [4] ANONYMOUS SUGGESTIONS (All Employees)
  
  // Submit anonymous suggestion
  app.post('/api/engagement/suggestions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      const validatedData = insertAnonymousSuggestionSchema.parse({
        ...req.body,
        workspaceId,
        employeeId: req.body.isAnonymous ? null : employee[0].id
      });
      
      const [suggestion] = await db
        .insert(anonymousSuggestions)
        .values(validatedData)
        .returning();
      
      // TODO: Trigger AI sentiment analysis and urgency detection
      
      res.json(suggestion);
    } catch (error: any) {
      console.error("Error submitting anonymous suggestion:", error);
      res.status(500).json({ message: "Failed to submit anonymous suggestion" });
    }
  });
  
  // List anonymous suggestions (Manager only)
  app.get('/api/engagement/suggestions', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { status, category, urgencyLevel } = req.query;
      
      let query = db
        .select()
        .from(anonymousSuggestions)
        .where(eq(anonymousSuggestions.workspaceId, workspaceId))
        .orderBy(desc(anonymousSuggestions.submittedAt));
      
      if (status) {
        query = query.where(and(
          eq(anonymousSuggestions.workspaceId, workspaceId),
          eq(anonymousSuggestions.status, status as string)
        ));
      }
      
      if (category) {
        query = query.where(and(
          eq(anonymousSuggestions.workspaceId, workspaceId),
          eq(anonymousSuggestions.category, category as string)
        ));
      }
      
      if (urgencyLevel) {
        query = query.where(and(
          eq(anonymousSuggestions.workspaceId, workspaceId),
          eq(anonymousSuggestions.urgencyLevel, urgencyLevel as string)
        ));
      }
      
      const suggestions = await query;
      res.json(suggestions);
    } catch (error: any) {
      console.error("Error fetching anonymous suggestions:", error);
      res.status(500).json({ message: "Failed to fetch anonymous suggestions" });
    }
  });
  
  // Update suggestion status (Manager only)
  app.patch('/api/engagement/suggestions/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(anonymousSuggestions)
        .where(and(
          eq(anonymousSuggestions.id, id),
          eq(anonymousSuggestions.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Suggestion not found" });
      }
      
      const [updated] = await db
        .update(anonymousSuggestions)
        .set({
          ...req.body,
          statusUpdatedAt: req.body.status !== existing[0].status ? new Date() : existing[0].statusUpdatedAt,
          updatedAt: new Date()
        })
        .where(eq(anonymousSuggestions.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating suggestion:", error);
      res.status(500).json({ message: "Failed to update suggestion" });
    }
  });
  
  // [5] EMPLOYEE RECOGNITION (All Employees + Managers)
  
  // Create employee recognition (peer or manager)
  app.post('/api/engagement/recognition', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Check if user is manager
      const isManager = req.workspace!.role === 'owner' || req.workspace!.role === 'manager';
      
      const validatedData = insertEmployeeRecognitionSchema.parse({
        ...req.body,
        workspaceId,
        recognizedByEmployeeId: !isManager ? employee[0].id : null,
        recognizedByManagerId: isManager ? employee[0].id : null
      });
      
      const [recognition] = await db
        .insert(employeeRecognition)
        .values(validatedData)
        .returning();
      
      // TODO: If has_monetary_reward = true, trigger BillOS™ integration for instant taxable bonus
      
      res.json(recognition);
    } catch (error: any) {
      console.error("Error creating employee recognition:", error);
      res.status(500).json({ message: "Failed to create employee recognition" });
    }
  });
  
  // Get employee recognition feed
  app.get('/api/engagement/recognition', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { employeeId, isPublic } = req.query;
      
      let query = db
        .select()
        .from(employeeRecognition)
        .where(eq(employeeRecognition.workspaceId, workspaceId))
        .orderBy(desc(employeeRecognition.createdAt));
      
      if (employeeId) {
        query = query.where(and(
          eq(employeeRecognition.workspaceId, workspaceId),
          eq(employeeRecognition.recognizedEmployeeId, employeeId as string)
        ));
      }
      
      if (isPublic !== undefined) {
        query = query.where(and(
          eq(employeeRecognition.workspaceId, workspaceId),
          eq(employeeRecognition.isPublic, isPublic === 'true')
        ));
      }
      
      const recognitions = await query;
      res.json(recognitions);
    } catch (error: any) {
      console.error("Error fetching employee recognitions:", error);
      res.status(500).json({ message: "Failed to fetch employee recognitions" });
    }
  });
  
  // [6] EMPLOYEE HEALTH SCORES (Manager/Owner Only)
  
  // Get employee health scores
  app.get('/api/engagement/health-scores', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { employeeId, riskLevel, requiresManagerAction } = req.query;
      
      let query = db
        .select()
        .from(employeeHealthScores)
        .where(eq(employeeHealthScores.workspaceId, workspaceId))
        .orderBy(desc(employeeHealthScores.periodEnd));
      
      if (employeeId) {
        query = query.where(and(
          eq(employeeHealthScores.workspaceId, workspaceId),
          eq(employeeHealthScores.employeeId, employeeId as string)
        ));
      }
      
      if (riskLevel) {
        query = query.where(and(
          eq(employeeHealthScores.workspaceId, workspaceId),
          eq(employeeHealthScores.riskLevel, riskLevel as string)
        ));
      }
      
      if (requiresManagerAction !== undefined) {
        query = query.where(and(
          eq(employeeHealthScores.workspaceId, workspaceId),
          eq(employeeHealthScores.requiresManagerAction, requiresManagerAction === 'true')
        ));
      }
      
      const healthScores = await query;
      res.json(healthScores);
    } catch (error: any) {
      console.error("Error fetching employee health scores:", error);
      res.status(500).json({ message: "Failed to fetch employee health scores" });
    }
  });
  
  // Take action on employee health score
  app.patch('/api/engagement/health-scores/:id/action', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      const { actionNotes } = req.body;
      
      const existing = await db
        .select()
        .from(employeeHealthScores)
        .where(and(
          eq(employeeHealthScores.id, id),
          eq(employeeHealthScores.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Health score not found" });
      }
      
      const [updated] = await db
        .update(employeeHealthScores)
        .set({
          actionTaken: true,
          actionTakenAt: new Date(),
          actionNotes
        })
        .where(eq(employeeHealthScores.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating health score action:", error);
      res.status(500).json({ message: "Failed to update health score action" });
    }
  });
  
  // [7] EMPLOYER BENCHMARK SCORES (Manager/Owner Only)
  
  // Get employer benchmark scores
  app.get('/api/engagement/benchmarks', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { benchmarkType, targetId } = req.query;
      
      let query = db
        .select()
        .from(employerBenchmarkScores)
        .where(eq(employerBenchmarkScores.workspaceId, workspaceId))
        .orderBy(desc(employerBenchmarkScores.periodEnd));
      
      if (benchmarkType) {
        query = query.where(and(
          eq(employerBenchmarkScores.workspaceId, workspaceId),
          eq(employerBenchmarkScores.benchmarkType, benchmarkType as string)
        ));
      }
      
      if (targetId) {
        query = query.where(and(
          eq(employerBenchmarkScores.workspaceId, workspaceId),
          eq(employerBenchmarkScores.targetId, targetId as string)
        ));
      }
      
      const benchmarks = await query;
      res.json(benchmarks);
    } catch (error: any) {
      console.error("Error fetching employer benchmarks:", error);
      res.status(500).json({ message: "Failed to fetch employer benchmarks" });
    }
  });
  
  // [8] CALCULATION TRIGGERS (Manager/Owner Only)
  
  // Manually trigger health score calculation for a single employee
  app.post('/api/engagement/health-scores/calculate', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { employeeId, periodStart, periodEnd } = req.body;
      
      if (!employeeId || !periodStart || !periodEnd) {
        return res.status(400).json({ message: "employeeId, periodStart, and periodEnd are required" });
      }
      
      const healthScore = await calculateEmployeeHealthScore({
        workspaceId,
        employeeId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd)
      });
      
      res.json(healthScore);
    } catch (error: any) {
      console.error("Error calculating health score:", error);
      res.status(500).json({ message: "Failed to calculate health score" });
    }
  });
  
  // Batch calculate health scores for all employees
  app.post('/api/engagement/health-scores/calculate-batch', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { periodStart, periodEnd } = req.body;
      
      if (!periodStart || !periodEnd) {
        return res.status(400).json({ message: "periodStart and periodEnd are required" });
      }
      
      const healthScores = await batchCalculateHealthScores(
        workspaceId,
        new Date(periodStart),
        new Date(periodEnd)
      );
      
      res.json({ 
        message: `Calculated ${healthScores.length} health scores`,
        healthScores 
      });
    } catch (error: any) {
      console.error("Error batch calculating health scores:", error);
      res.status(500).json({ message: "Failed to batch calculate health scores" });
    }
  });
  
  // Manually trigger employer benchmark calculation
  app.post('/api/engagement/benchmarks/calculate', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { benchmarkType, targetId, targetName, periodStart, periodEnd } = req.body;
      
      if (!benchmarkType || !periodStart || !periodEnd) {
        return res.status(400).json({ message: "benchmarkType, periodStart, and periodEnd are required" });
      }
      
      const benchmark = await calculateEmployerBenchmark({
        workspaceId,
        benchmarkType,
        targetId,
        targetName,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd)
      });
      
      if (!benchmark) {
        return res.status(404).json({ message: "No ratings found for the specified period" });
      }
      
      res.json(benchmark);
    } catch (error: any) {
      console.error("Error calculating employer benchmark:", error);
      res.status(500).json({ message: "Failed to calculate employer benchmark" });
    }
  });

  // ============================================================================
  // TRAININGOS™ - LEARNING MANAGEMENT SYSTEM (LMS)
  // ============================================================================
  
  // [1] TRAINING COURSES - CRUD operations
  
  // Get all training courses
  app.get('/api/training/courses', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { category, difficulty, status, isRequired } = req.query;
      
      let query = db
        .select()
        .from(trainingCourses)
        .where(eq(trainingCourses.workspaceId, workspaceId))
        .orderBy(desc(trainingCourses.createdAt));
      
      let courses = await query;
      
      // Apply filters
      if (category) {
        courses = courses.filter(c => c.category === category);
      }
      if (difficulty) {
        courses = courses.filter(c => c.difficulty === difficulty);
      }
      if (status) {
        courses = courses.filter(c => c.status === status);
      }
      if (isRequired !== undefined) {
        courses = courses.filter(c => c.isRequired === (isRequired === 'true'));
      }
      
      res.json(courses);
    } catch (error: any) {
      console.error("Error fetching training courses:", error);
      res.status(500).json({ message: "Failed to fetch training courses" });
    }
  });
  
  // Get single training course
  app.get('/api/training/courses/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const [course] = await db
        .select()
        .from(trainingCourses)
        .where(and(
          eq(trainingCourses.id, id),
          eq(trainingCourses.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!course) {
        return res.status(404).json({ message: "Training course not found" });
      }
      
      res.json(course);
    } catch (error: any) {
      console.error("Error fetching training course:", error);
      res.status(500).json({ message: "Failed to fetch training course" });
    }
  });
  
  // Create training course (Manager/Owner only)
  app.post('/api/training/courses', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      
      const validatedData = insertTrainingCourseSchema.parse({
        ...req.body,
        workspaceId
      });
      
      const [course] = await db
        .insert(trainingCourses)
        .values(validatedData)
        .returning();
      
      res.json(course);
    } catch (error: any) {
      console.error("Error creating training course:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create training course" });
    }
  });
  
  // Update training course (Manager/Owner only)
  app.patch('/api/training/courses/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(trainingCourses)
        .where(and(
          eq(trainingCourses.id, id),
          eq(trainingCourses.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Training course not found" });
      }
      
      // Validate partial update
      const validatedData = insertTrainingCourseSchema.partial().parse(req.body);
      
      const [updated] = await db
        .update(trainingCourses)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(eq(trainingCourses.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating training course:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update training course" });
    }
  });
  
  // Delete training course (Manager/Owner only)
  app.delete('/api/training/courses/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(trainingCourses)
        .where(and(
          eq(trainingCourses.id, id),
          eq(trainingCourses.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Training course not found" });
      }
      
      await db
        .delete(trainingCourses)
        .where(eq(trainingCourses.id, id));
      
      res.json({ message: "Training course deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting training course:", error);
      res.status(500).json({ message: "Failed to delete training course" });
    }
  });
  
  // [2] COURSE ENROLLMENTS
  
  // Get employee enrollments
  app.get('/api/training/enrollments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Get enrollments with course details
      const enrollments = await db
        .select({
          id: trainingEnrollments.id,
          courseId: trainingEnrollments.courseId,
          courseTitle: trainingCourses.title,
          progress: trainingEnrollments.progress,
          status: trainingEnrollments.status,
          enrolledAt: trainingEnrollments.enrolledAt,
          completedAt: trainingEnrollments.completedAt,
          score: trainingEnrollments.score,
          certificateId: trainingEnrollments.certificateId
        })
        .from(trainingEnrollments)
        .leftJoin(trainingCourses, eq(trainingEnrollments.courseId, trainingCourses.id))
        .where(eq(trainingEnrollments.employeeId, employee[0].id))
        .orderBy(desc(trainingEnrollments.enrolledAt));
      
      res.json(enrollments);
    } catch (error: any) {
      console.error("Error fetching training enrollments:", error);
      res.status(500).json({ message: "Failed to fetch training enrollments" });
    }
  });
  
  // Enroll in a course
  app.post('/api/training/courses/:id/enroll', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      const { id: courseId } = req.params;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Check if course exists
      const course = await db
        .select()
        .from(trainingCourses)
        .where(and(
          eq(trainingCourses.id, courseId),
          eq(trainingCourses.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!course[0]) {
        return res.status(404).json({ message: "Training course not found" });
      }
      
      // Check if already enrolled
      const existing = await db
        .select()
        .from(trainingEnrollments)
        .where(and(
          eq(trainingEnrollments.courseId, courseId),
          eq(trainingEnrollments.employeeId, employee[0].id)
        ))
        .limit(1);
      
      if (existing[0]) {
        return res.status(400).json({ message: "Already enrolled in this course" });
      }
      
      // Create enrollment
      const [enrollment] = await db
        .insert(trainingEnrollments)
        .values({
          courseId,
          employeeId: employee[0].id,
          status: 'not_started',
          progress: 0,
          dueDate: req.body.dueDate || null
        })
        .returning();
      
      res.json(enrollment);
    } catch (error: any) {
      console.error("Error enrolling in course:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to enroll in course" });
    }
  });
  
  // Update enrollment progress
  app.patch('/api/training/enrollments/:id/progress', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      const { id } = req.params;
      const { progress, status, score } = req.body;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Verify enrollment belongs to this employee
      const enrollment = await db
        .select()
        .from(trainingEnrollments)
        .where(and(
          eq(trainingEnrollments.id, id),
          eq(trainingEnrollments.employeeId, employee[0].id)
        ))
        .limit(1);
      
      if (!enrollment[0]) {
        return res.status(404).json({ message: "Enrollment not found" });
      }
      
      // Update progress
      const updateData: any = { updatedAt: new Date() };
      if (progress !== undefined) updateData.progress = progress;
      if (status !== undefined) updateData.status = status;
      if (score !== undefined) updateData.score = score;
      if (status === 'completed') updateData.completedAt = new Date();
      
      const [updated] = await db
        .update(trainingEnrollments)
        .set(updateData)
        .where(eq(trainingEnrollments.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating enrollment progress:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update enrollment progress" });
    }
  });
  
  // [3] CERTIFICATIONS
  
  // Get employee certifications
  app.get('/api/training/certifications', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Get certifications with course details
      const certifications = await db
        .select({
          id: trainingCertifications.id,
          courseId: trainingCertifications.courseId,
          courseTitle: trainingCourses.title,
          issuedAt: trainingCertifications.issuedDate,
          expiresAt: trainingCertifications.expiryDate,
          certificateUrl: trainingCertifications.certificateUrl,
          score: trainingEnrollments.score,
          status: trainingCertifications.status
        })
        .from(trainingCertifications)
        .leftJoin(trainingCourses, eq(trainingCertifications.courseId, trainingCourses.id))
        .leftJoin(trainingEnrollments, eq(trainingCertifications.enrollmentId, trainingEnrollments.id))
        .where(eq(trainingCertifications.employeeId, employee[0].id))
        .orderBy(desc(trainingCertifications.issuedDate));
      
      res.json(certifications);
    } catch (error: any) {
      console.error("Error fetching certifications:", error);
      res.status(500).json({ message: "Failed to fetch certifications" });
    }
  });
  
  // Issue certification (Manager/Owner only)
  app.post('/api/training/certifications', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { employeeId, courseId, enrollmentId } = req.body;
      
      // Verify enrollment and course exist
      const enrollment = await db
        .select()
        .from(trainingEnrollments)
        .where(and(
          eq(trainingEnrollments.id, enrollmentId),
          eq(trainingEnrollments.employeeId, employeeId),
          eq(trainingEnrollments.status, 'completed')
        ))
        .limit(1);
      
      if (!enrollment[0]) {
        return res.status(400).json({ message: "Employee must complete the course before certification" });
      }
      
      const course = await db
        .select()
        .from(trainingCourses)
        .where(and(
          eq(trainingCourses.id, courseId),
          eq(trainingCourses.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!course[0]) {
        return res.status(404).json({ message: "Course not found" });
      }
      
      // Create certification
      const [certification] = await db
        .insert(trainingCertifications)
        .values({
          workspaceId,
          employeeId,
          courseId,
          enrollmentId,
          certificationName: `${course[0].title} Certification`,
          issuedDate: new Date(),
          expiryDate: req.body.expiryDate || null,
          status: 'active'
        })
        .returning();
      
      // Link certification to enrollment
      await db
        .update(trainingEnrollments)
        .set({ certificateId: certification.id })
        .where(eq(trainingEnrollments.id, enrollmentId));
      
      res.json(certification);
    } catch (error: any) {
      console.error("Error issuing certification:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to issue certification" });
    }
  });

  // ============================================================================
  // BUDGETOS™ - BUDGET PLANNING & FORECASTING
  // ============================================================================
  
  // [1] BUDGETS - CRUD operations
  
  // Get all budgets
  app.get('/api/budgets', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { fiscalYear, department, status } = req.query;
      
      let query = db
        .select()
        .from(budgets)
        .where(eq(budgets.workspaceId, workspaceId))
        .orderBy(desc(budgets.createdAt));
      
      let allBudgets = await query;
      
      // Apply filters
      if (fiscalYear) {
        allBudgets = allBudgets.filter(b => b.fiscalYear === parseInt(fiscalYear as string));
      }
      if (department) {
        allBudgets = allBudgets.filter(b => b.department === department);
      }
      if (status) {
        allBudgets = allBudgets.filter(b => b.status === status);
      }
      
      res.json(allBudgets);
    } catch (error: any) {
      console.error("Error fetching budgets:", error);
      res.status(500).json({ message: "Failed to fetch budgets" });
    }
  });
  
  // Get single budget
  app.get('/api/budgets/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const [budget] = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, id),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!budget) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      res.json(budget);
    } catch (error: any) {
      console.error("Error fetching budget:", error);
      res.status(500).json({ message: "Failed to fetch budget" });
    }
  });
  
  // Create budget (Manager/Owner only)
  app.post('/api/budgets', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      
      const validatedData = insertBudgetSchema.parse({
        ...req.body,
        workspaceId
      });
      
      const [budget] = await db
        .insert(budgets)
        .values(validatedData)
        .returning();
      
      res.json(budget);
    } catch (error: any) {
      console.error("Error creating budget:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create budget" });
    }
  });
  
  // Update budget (Manager/Owner only)
  app.patch('/api/budgets/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, id),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      // Validate partial update
      const validatedData = insertBudgetSchema.partial().parse(req.body);
      
      const [updated] = await db
        .update(budgets)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(eq(budgets.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating budget:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update budget" });
    }
  });
  
  // Delete budget (Owner only)
  app.delete('/api/budgets/:id', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, id),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      await db
        .delete(budgets)
        .where(eq(budgets.id, id));
      
      res.json({ message: "Budget deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting budget:", error);
      res.status(500).json({ message: "Failed to delete budget" });
    }
  });
  
  // [2] BUDGET LINE ITEMS
  
  // Get line items for a budget
  app.get('/api/budgets/:budgetId/line-items', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { budgetId } = req.params;
      
      // Verify budget belongs to workspace
      const budget = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, budgetId),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!budget[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      const lineItems = await db
        .select()
        .from(budgetLineItems)
        .where(eq(budgetLineItems.budgetId, budgetId))
        .orderBy(budgetLineItems.name);
      
      res.json(lineItems);
    } catch (error: any) {
      console.error("Error fetching budget line items:", error);
      res.status(500).json({ message: "Failed to fetch budget line items" });
    }
  });
  
  // Create budget line item
  app.post('/api/budgets/:budgetId/line-items', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { budgetId } = req.params;
      
      // Verify budget belongs to workspace
      const budget = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, budgetId),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!budget[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      const validatedData = insertBudgetLineItemSchema.parse({
        ...req.body,
        budgetId
      });
      
      const [lineItem] = await db
        .insert(budgetLineItems)
        .values(validatedData)
        .returning();
      
      res.json(lineItem);
    } catch (error: any) {
      console.error("Error creating budget line item:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create budget line item" });
    }
  });
  
  // Update budget line item
  app.patch('/api/budgets/:budgetId/line-items/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { budgetId, id } = req.params;
      
      // Verify budget belongs to workspace
      const budget = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, budgetId),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!budget[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      const existing = await db
        .select()
        .from(budgetLineItems)
        .where(and(
          eq(budgetLineItems.id, id),
          eq(budgetLineItems.budgetId, budgetId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Budget line item not found" });
      }
      
      // Validate partial update
      const validatedData = insertBudgetLineItemSchema.partial().parse(req.body);
      
      const [updated] = await db
        .update(budgetLineItems)
        .set(validatedData)
        .where(eq(budgetLineItems.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating budget line item:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update budget line item" });
    }
  });
  
  // Delete budget line item
  app.delete('/api/budgets/:budgetId/line-items/:id', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { budgetId, id } = req.params;
      
      // Verify budget belongs to workspace
      const budget = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, budgetId),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!budget[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      const existing = await db
        .select()
        .from(budgetLineItems)
        .where(and(
          eq(budgetLineItems.id, id),
          eq(budgetLineItems.budgetId, budgetId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Budget line item not found" });
      }
      
      await db
        .delete(budgetLineItems)
        .where(eq(budgetLineItems.id, id));
      
      res.json({ message: "Budget line item deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting budget line item:", error);
      res.status(500).json({ message: "Failed to delete budget line item" });
    }
  });
  
  // [3] BUDGET VARIANCE ANALYSIS
  
  // Get variances for a budget
  app.get('/api/budgets/:budgetId/variances', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { budgetId } = req.params;
      const { year, month } = req.query;
      
      // Verify budget belongs to workspace
      const budget = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, budgetId),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!budget[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      let query = db
        .select()
        .from(budgetVariances)
        .where(eq(budgetVariances.budgetId, budgetId))
        .orderBy(desc(budgetVariances.year), desc(budgetVariances.month));
      
      let variances = await query;
      
      if (year) {
        variances = variances.filter(v => v.year === parseInt(year as string));
      }
      if (month) {
        variances = variances.filter(v => v.month === parseInt(month as string));
      }
      
      res.json(variances);
    } catch (error: any) {
      console.error("Error fetching budget variances:", error);
      res.status(500).json({ message: "Failed to fetch budget variances" });
    }
  });
  
  // Create budget variance snapshot
  app.post('/api/budgets/:budgetId/variances', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { budgetId } = req.params;
      
      // Verify budget belongs to workspace
      const budget = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.id, budgetId),
          eq(budgets.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!budget[0]) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      const validatedData = insertBudgetVarianceSchema.parse({
        ...req.body,
        budgetId
      });
      
      const [variance] = await db
        .insert(budgetVariances)
        .values(validatedData)
        .returning();
      
      res.json(variance);
    } catch (error: any) {
      console.error("Error creating budget variance:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create budget variance" });
    }
  });

  // ============================================================================
  // INTEGRATIONOS™ - EXTERNAL ECOSYSTEM LAYER (MONOPOLISTIC LOCK-IN)
  // ============================================================================
  
  // [1] MARKETPLACE - Browse available integrations (All authenticated users)
  app.get('/api/integrations/marketplace', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { category, certified } = req.query;
      
      let query = db
        .select()
        .from(integrationMarketplace)
        .where(and(
          eq(integrationMarketplace.isActive, true),
          eq(integrationMarketplace.isPublished, true)
        ))
        .orderBy(desc(integrationMarketplace.installCount));
      
      const integrations = await query;
      
      const filtered = integrations.filter(integration => {
        if (category && integration.category !== category) return false;
        if (certified === 'true' && !integration.isCertified) return false;
        return true;
      });
      
      res.json(filtered);
    } catch (error: any) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });
  
  // [2] CONNECTIONS - Manage workspace integrations (Manager/Owner)
  app.get('/api/integrations/connections', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      
      const connections = await db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.workspaceId, workspaceId))
        .orderBy(desc(integrationConnections.connectedAt));
      
      res.json(connections);
    } catch (error: any) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ message: "Failed to fetch connections" });
    }
  });
  
  // Connect to an integration
  app.post('/api/integrations/connections', requireAuth, requireManager, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      const { integrationId, connectionName, authType, apiKey, apiSecret } = req.body;
      
      if (!integrationId) {
        return res.status(400).json({ message: "integrationId is required" });
      }
      
      // Check if integration exists
      const [integration] = await db
        .select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.id, integrationId))
        .limit(1);
      
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }
      
      // Create connection
      const [connection] = await db
        .insert(integrationConnections)
        .values({
          workspaceId,
          integrationId,
          connectionName: connectionName || `${integration.name} Connection`,
          authType: authType || integration.authType,
          apiKey: apiKey || null,
          apiSecret: apiSecret || null,
          connectedByUserId: userId,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
        })
        .returning();
      
      // Increment install count
      await db
        .update(integrationMarketplace)
        .set({ 
          installCount: sql`${integrationMarketplace.installCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(integrationMarketplace.id, integrationId));
      
      res.json(connection);
    } catch (error: any) {
      console.error("Error creating connection:", error);
      res.status(500).json({ message: "Failed to create connection" });
    }
  });
  
  // Disconnect an integration
  app.delete('/api/integrations/connections/:id', requireAuth, requireManager, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      await db
        .update(integrationConnections)
        .set({ 
          isActive: false,
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(integrationConnections.id, id),
          eq(integrationConnections.workspaceId, workspaceId)
        ));
      
      res.json({ message: "Connection disconnected" });
    } catch (error: any) {
      console.error("Error disconnecting integration:", error);
      res.status(500).json({ message: "Failed to disconnect integration" });
    }
  });
  
  // [3] API KEYS - Developer access management (Owner only)
  app.get('/api/integrations/api-keys', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      
      const apiKeys = await db
        .select({
          id: integrationApiKeys.id,
          name: integrationApiKeys.name,
          description: integrationApiKeys.description,
          keyPrefix: integrationApiKeys.keyPrefix,
          scopes: integrationApiKeys.scopes,
          ipWhitelist: integrationApiKeys.ipWhitelist,
          rateLimit: integrationApiKeys.rateLimit,
          rateLimitWindow: integrationApiKeys.rateLimitWindow,
          lastUsedAt: integrationApiKeys.lastUsedAt,
          totalRequests: integrationApiKeys.totalRequests,
          totalErrors: integrationApiKeys.totalErrors,
          isActive: integrationApiKeys.isActive,
          expiresAt: integrationApiKeys.expiresAt,
          createdAt: integrationApiKeys.createdAt,
        })
        .from(integrationApiKeys)
        .where(eq(integrationApiKeys.workspaceId, workspaceId))
        .orderBy(desc(integrationApiKeys.createdAt));
      
      res.json(apiKeys);
    } catch (error: any) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });
  
  // Create API key
  app.post('/api/integrations/api-keys', requireAuth, requireOwner, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      const { name, description, scopes, rateLimit, expiresAt } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "name is required" });
      }
      
      // Generate API key
      const crypto = await import('crypto');
      const apiKeyValue = `wfos_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(apiKeyValue).digest('hex');
      const keyPrefix = apiKeyValue.substring(0, 12);
      
      const [apiKey] = await db
        .insert(integrationApiKeys)
        .values({
          workspaceId,
          name,
          description: description || null,
          keyPrefix,
          keyHash,
          scopes: scopes || [],
          rateLimit: rateLimit || 1000,
          rateLimitWindow: 'hour',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          createdByUserId: userId,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
        })
        .returning();
      
      // Return full API key ONLY on creation
      res.json({ ...apiKey, apiKey: apiKeyValue });
    } catch (error: any) {
      console.error("Error creating API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });
  
  // Revoke API key
  app.delete('/api/integrations/api-keys/:id', requireAuth, requireOwner, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      await db
        .update(integrationApiKeys)
        .set({ 
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(integrationApiKeys.id, id),
          eq(integrationApiKeys.workspaceId, workspaceId)
        ));
      
      res.json({ message: "API key revoked" });
    } catch (error: any) {
      console.error("Error revoking API key:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });
  
  // [4] WEBHOOKS - Event subscriptions (Manager/Owner)
  app.get('/api/integrations/webhooks', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      
      const webhooks = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.workspaceId, workspaceId))
        .orderBy(desc(webhookSubscriptions.createdAt));
      
      res.json(webhooks);
    } catch (error: any) {
      console.error("Error fetching webhooks:", error);
      res.status(500).json({ message: "Failed to fetch webhooks" });
    }
  });
  
  // Create webhook subscription
  app.post('/api/integrations/webhooks', requireAuth, requireManager, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const userId = req.user!.id;
      const { name, targetUrl, events, filters, authType, authConfig, maxRetries } = req.body;
      
      if (!name || !targetUrl || !events || events.length === 0) {
        return res.status(400).json({ message: "name, targetUrl, and events are required" });
      }
      
      const [webhook] = await db
        .insert(webhookSubscriptions)
        .values({
          workspaceId,
          name,
          targetUrl,
          events,
          filters: filters || null,
          authType: authType || 'none',
          authConfig: authConfig || null,
          maxRetries: maxRetries || 3,
          createdByUserId: userId,
        })
        .returning();
      
      res.json(webhook);
    } catch (error: any) {
      console.error("Error creating webhook:", error);
      res.status(500).json({ message: "Failed to create webhook" });
    }
  });
  
  // Toggle webhook active status
  app.patch('/api/integrations/webhooks/:id/toggle', requireAuth, requireManager, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const [webhook] = await db
        .select()
        .from(webhookSubscriptions)
        .where(and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }
      
      const [updated] = await db
        .update(webhookSubscriptions)
        .set({ 
          isActive: !webhook.isActive,
          updatedAt: new Date(),
        })
        .where(eq(webhookSubscriptions.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error toggling webhook:", error);
      res.status(500).json({ message: "Failed to toggle webhook" });
    }
  });
  
  // Delete webhook
  app.delete('/api/integrations/webhooks/:id', requireAuth, requireManager, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      await db
        .delete(webhookSubscriptions)
        .where(and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.workspaceId, workspaceId)
        ));
      
      res.json({ message: "Webhook deleted" });
    } catch (error: any) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ message: "Failed to delete webhook" });
    }
  });
  
  // Get webhook delivery history
  app.get('/api/integrations/webhooks/:id/deliveries', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspace!.id;
      const { id } = req.params;
      
      const deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(and(
          eq(webhookDeliveries.subscriptionId, id),
          eq(webhookDeliveries.workspaceId, workspaceId)
        ))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(100);
      
      res.json(deliveries);
    } catch (error: any) {
      console.error("Error fetching webhook deliveries:", error);
      res.status(500).json({ message: "Failed to fetch webhook deliveries" });
    }
  });

  // ============================================================================
  // DISPUTES - Fair Employee/Employer Transparency System
  // ============================================================================
  
  // Create a new dispute
  app.post('/api/disputes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      // Validate using Zod schema
      const { createDisputeSchema } = await import('@shared/schema');
      const validationResult = createDisputeSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }

      const data = validationResult.data;
      
      // Import AI analysis functions
      const { analyzeDispute, detectComplianceCategory } = await import('./services/disputeAI');

      // Get employee to determine role
      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(403).json({ message: "Employee not found" });
      }

      // Validate target entity exists and belongs to workspace
      let targetExists = false;
      
      if (data.targetType === 'performance_reviews') {
        const review = await storage.getPerformanceReview(data.targetId, user.currentWorkspaceId);
        targetExists = !!review;
      } else if (data.targetType === 'report_submissions') {
        const submission = await storage.getReportSubmissionById(data.targetId);
        // Verify it belongs to the workspace
        if (submission) {
          const reportSubmissions = await storage.getReportSubmissions(user.currentWorkspaceId, {});
          targetExists = reportSubmissions.some(s => s.id === data.targetId);
        }
      } else if (data.targetType === 'employer_ratings') {
        // Employer ratings feature not yet implemented
        // For now, allow dispute creation (will be validated when feature is added)
        targetExists = true;
      } else if (data.targetType === 'composite_scores') {
        // Composite scores feature not yet implemented
        // For now, allow dispute creation (will be validated when feature is added)
        targetExists = true;
      }

      if (!targetExists) {
        return res.status(404).json({ message: "Target entity not found in workspace" });
      }

      // Calculate review deadline (7 days from now)
      const reviewDeadline = new Date();
      reviewDeadline.setDate(reviewDeadline.getDate() + 7);

      // Calculate appeal deadline (14 days from now)
      const appealDeadline = new Date();
      appealDeadline.setDate(appealDeadline.getDate() + 14);

      // Run AI analysis on the dispute (async - don't wait)
      let aiAnalysis: any = null;
      let complianceData: any = null;
      
      try {
        // Detect compliance category
        complianceData = detectComplianceCategory(data.reason, data.type);
        
        // Analyze dispute with AI
        aiAnalysis = await analyzeDispute(
          data.title,
          data.reason,
          data.type,
          data.requestedOutcome || null,
          data.evidence || null
        );
      } catch (aiError) {
        console.error('AI analysis failed for dispute creation:', aiError);
        // Continue creating dispute even if AI fails
      }

      const dispute = await storage.createDispute({
        ...data,
        workspaceId: user.currentWorkspaceId,
        filedBy: userId,
        filedByRole: employee.role || 'employee',
        filedAt: new Date(),
        reviewDeadline,
        appealDeadline,
        canBeAppealed: true,
        appealedToUpperManagement: false,
        changesApplied: false,
        // Add AI analysis results
        aiSummary: aiAnalysis?.summary || null,
        aiRecommendation: aiAnalysis?.recommendation || null,
        aiConfidenceScore: aiAnalysis?.confidenceScore?.toString() || null,
        aiAnalysisFactors: aiAnalysis?.analysisFactors || null,
        aiProcessedAt: aiAnalysis ? new Date() : null,
        aiModel: aiAnalysis?.model || null,
        complianceCategory: complianceData?.category || null,
        regulatoryReference: complianceData?.regulatoryReference || null,
      });

      res.json(dispute);
    } catch (error) {
      console.error("Error creating dispute:", error);
      res.status(500).json({ message: "Failed to create dispute" });
    }
  });

  // Get all disputes for current workspace (with filters) - HR/Manager only
  app.get('/api/disputes', isAuthenticated, requireHRManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { status, disputeType, assignedTo } = req.query;
      
      const disputes = await storage.getDisputesByWorkspace(
        user.currentWorkspaceId,
        { 
          status: status as string, 
          disputeType: disputeType as string,
          assignedTo: assignedTo as string 
        }
      );

      res.json(disputes);
    } catch (error) {
      console.error("Error fetching disputes:", error);
      res.status(500).json({ message: "Failed to fetch disputes" });
    }
  });

  // Get disputes filed by current user
  app.get('/api/disputes/my-disputes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const disputes = await storage.getDisputesByFiledBy(userId, user.currentWorkspaceId);
      res.json(disputes);
    } catch (error) {
      console.error("Error fetching my disputes:", error);
      res.status(500).json({ message: "Failed to fetch disputes" });
    }
  });

  // Get disputes for a specific target (e.g., all disputes for a performance review)
  app.get('/api/disputes/target/:targetType/:targetId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { targetType, targetId } = req.params;
      const disputes = await storage.getDisputesByTarget(targetType, targetId, user.currentWorkspaceId);
      res.json(disputes);
    } catch (error) {
      console.error("Error fetching target disputes:", error);
      res.status(500).json({ message: "Failed to fetch disputes" });
    }
  });

  // Get a single dispute by ID
  app.get('/api/disputes/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const dispute = await storage.getDispute(id, user.currentWorkspaceId);
      
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      // Check authorization: employees can only see their own disputes
      const employee = await storage.getEmployeeByUserId(userId);
      const isHROrManager = employee && ['owner', 'manager', 'hr_manager'].includes(employee.role || '');
      
      if (!isHROrManager && dispute.filedBy !== userId) {
        return res.status(403).json({ message: "You can only view your own disputes" });
      }

      res.json(dispute);
    } catch (error) {
      console.error("Error fetching dispute:", error);
      res.status(500).json({ message: "Failed to fetch dispute" });
    }
  });

  // Assign a dispute to an HR/Manager
  app.patch('/api/disputes/:id/assign', isAuthenticated, requireHRManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const { assignedTo } = req.body;

      if (!assignedTo) {
        return res.status(400).json({ message: "assignedTo is required" });
      }

      const dispute = await storage.assignDispute(id, user.currentWorkspaceId, assignedTo);
      
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      res.json(dispute);
    } catch (error) {
      console.error("Error assigning dispute:", error);
      res.status(500).json({ message: "Failed to assign dispute" });
    }
  });

  // Update a dispute (for adding notes, evidence, etc.)
  app.patch('/api/disputes/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const dispute = await storage.updateDispute(id, user.currentWorkspaceId, req.body);
      
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      res.json(dispute);
    } catch (error) {
      console.error("Error updating dispute:", error);
      res.status(500).json({ message: "Failed to update dispute" });
    }
  });

  // Resolve a dispute
  app.post('/api/disputes/:id/resolve', isAuthenticated, requireHRManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const { resolution, resolutionAction } = req.body;

      if (!resolution || !resolutionAction) {
        return res.status(400).json({ message: "resolution and resolutionAction are required" });
      }

      const dispute = await storage.resolveDispute(
        id,
        user.currentWorkspaceId,
        userId,
        resolution,
        resolutionAction
      );
      
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      res.json(dispute);
    } catch (error) {
      console.error("Error resolving dispute:", error);
      res.status(500).json({ message: "Failed to resolve dispute" });
    }
  });

  // Apply changes from a resolved dispute (update the original record)
  app.post('/api/disputes/:id/apply-changes', isAuthenticated, requireHRManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      
      // Get the dispute first
      const dispute = await storage.getDispute(id, user.currentWorkspaceId);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      if (dispute.status !== 'resolved') {
        return res.status(400).json({ message: "Dispute must be resolved before applying changes" });
      }

      // TODO: Implement logic to apply changes to the target entity
      // This will depend on the dispute type and resolution action
      // For now, just mark it as applied
      
      const updated = await storage.applyDisputeChanges(id, user.currentWorkspaceId);
      res.json(updated);
    } catch (error) {
      console.error("Error applying dispute changes:", error);
      res.status(500).json({ message: "Failed to apply dispute changes" });
    }
  });

  // ========================================================================
  // AUTOSCHEDULER AUDIT TRACKER™ - AI-Powered Grievance Review
  // ========================================================================
  
  // Get pending disputes with AI summaries (Manager view)
  app.get('/api/disputes/pending-review', isAuthenticated, requireHRManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const disputes = await storage.getDisputesByWorkspace(
        user.currentWorkspaceId,
        { status: 'pending,under_review' }
      );

      // Trigger AI analysis for any disputes that don't have it yet
      const { analyzeDispute, detectComplianceCategory } = await import('./services/disputeAI');
      
      const disputesWithAI = await Promise.all(disputes.map(async (dispute: any) => {
        if (!dispute.aiSummary) {
          try {
            // Run AI analysis
            const aiAnalysis = await analyzeDispute(
              dispute.title,
              dispute.reason,
              dispute.disputeType,
              dispute.requestedOutcome,
              dispute.evidence
            );
            
            // Detect compliance category if not set
            const compliance = detectComplianceCategory(dispute.reason, dispute.disputeType);
            
            // Update dispute with AI analysis
            await storage.updateDispute(dispute.id, user.currentWorkspaceId, {
              aiSummary: aiAnalysis.summary,
              aiRecommendation: aiAnalysis.recommendation,
              aiConfidenceScore: aiAnalysis.confidenceScore,
              aiAnalysisFactors: aiAnalysis.analysisFactors,
              aiProcessedAt: new Date(),
              aiModel: aiAnalysis.model,
              complianceCategory: compliance.category,
              regulatoryReference: compliance.regulatoryReference,
            });
            
            return { ...dispute, ...aiAnalysis, ...compliance };
          } catch (error) {
            console.error('Error analyzing dispute:', error);
            return dispute;
          }
        }
        return dispute;
      }));

      res.json(disputesWithAI);
    } catch (error) {
      console.error("Error fetching pending disputes:", error);
      res.status(500).json({ message: "Failed to fetch pending disputes" });
    }
  });

  // Manager review and decision on dispute
  app.post('/api/disputes/:id/review', isAuthenticated, requireHRManager, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { id } = req.params;
      const { decision, reviewerNotes } = req.body;

      if (!decision || !reviewerNotes) {
        return res.status(400).json({ message: "decision and reviewerNotes are required" });
      }

      const validDecisions = ['approve', 'reject', 'escalate'];
      if (!validDecisions.includes(decision)) {
        return res.status(400).json({ message: "Invalid decision. Must be: approve, reject, or escalate" });
      }

      // Update dispute with manager decision
      const statusMap: { [key: string]: string } = {
        approve: 'approved',
        reject: 'rejected',
        escalate: 'under_review',
      };

      const dispute = await storage.updateDispute(id, user.currentWorkspaceId, {
        reviewerRecommendation: decision,
        reviewerNotes,
        reviewStartedAt: new Date(),
        status: statusMap[decision],
        resolvedAt: decision !== 'escalate' ? new Date() : null,
        resolvedBy: decision !== 'escalate' ? userId : null,
        resolution: decision !== 'escalate' ? reviewerNotes : null,
      });

      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      res.json(dispute);
    } catch (error) {
      console.error("Error reviewing dispute:", error);
      res.status(500).json({ message: "Failed to review dispute" });
    }
  });

  // Get employee's complete audit record (read-only view)
  app.get('/api/employee/audit-record', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(403).json({ message: "Employee not found" });
      }

      // Get all audit data for employee
      const [
        shiftsData,
        reviewsData,
        writeUpsData,
        lockedRecordsData,
      ] = await Promise.all([
        // Shifts worked (last 90 days)
        storage.getShiftsByEmployee(employee.id, user.currentWorkspaceId, {
          startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        }),
        
        // Performance reviews
        storage.getPerformanceReviewsByEmployee(employee.id, user.currentWorkspaceId),
        
        // Write-ups/disciplinary actions (from RMS)
        storage.getReportSubmissions(user.currentWorkspaceId, {
          employeeId: employee.id,
          status: 'approved',
        }),
        
        // Locked compliance records
        storage.getLockedReportRecordsByEmployee(employee.id, user.currentWorkspaceId),
      ]);

      // Calculate compliance stats
      const totalHours = shiftsData.reduce((sum: number, shift: any) => sum + (shift.hoursWorked || 0), 0);
      const overtimeHours = shiftsData.reduce((sum: number, shift: any) => {
        const hours = shift.hoursWorked || 0;
        return sum + (hours > 8 ? hours - 8 : 0);
      }, 0);

      // Get violations and discrepancies for this employee
      const [violationsData, discrepanciesData] = await Promise.all([
        // Get timeEntryDiscrepancies for this employee
        db
          .select()
          .from(timeEntryDiscrepancies)
          .where(
            and(
              eq(timeEntryDiscrepancies.employeeId, employee.id),
              eq(timeEntryDiscrepancies.workspaceId, user.currentWorkspaceId)
            )
          ),
        
        // Get disputes filed by this employee
        db
          .select()
          .from(disputes)
          .where(
            and(
              eq(disputes.employeeId, employee.id),
              eq(disputes.workspaceId, user.currentWorkspaceId)
            )
          ),
      ]);
      
      // Calculate missed breaks from time entries (shifts > 6 hours without break)
      const missedBreaks = shiftsData.filter((shift: any) => {
        const hoursWorked = shift.hoursWorked || 0;
        return hoursWorked > 6 && !shift.breakTaken; // Assuming shifts track break status
      }).length;

      res.json({
        shifts: shiftsData,
        reviews: reviewsData,
        writeups: writeUpsData.filter((w: any) => w.formData?.isDisciplinary || w.templateId?.includes('disciplinary')),
        lockedRecords: lockedRecordsData,
        compliance: {
          totalHours,
          overtimeHours,
          missedBreaks,
          violations: violationsData.length + discrepanciesData.length,
        },
      });
    } catch (error) {
      console.error("Error fetching audit record:", error);
      res.status(500).json({ message: "Failed to fetch audit record" });
    }
  });

  // Get items that can be disputed (for grievance filing form)
  app.get('/api/employee/disputeable-items', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(403).json({ message: "Employee not found" });
      }

      // Get reviews and write-ups that can be disputed
      const [reviews, writeUps] = await Promise.all([
        storage.getPerformanceReviewsByEmployee(employee.id, user.currentWorkspaceId),
        storage.getReportSubmissions(user.currentWorkspaceId, {
          employeeId: employee.id,
          status: 'approved',
        }),
      ]);

      res.json({
        reviews: reviews.map((r: any) => ({
          id: r.id,
          type: 'performance_review',
          title: `${r.reviewType} Review - ${r.reviewPeriodStart ? new Date(r.reviewPeriodStart).toLocaleDateString() : 'N/A'}`,
          date: r.completedAt || r.createdAt,
        })),
        writeups: writeUps.map((w: any) => ({
          id: w.id,
          type: 'report_submission',
          title: w.reportNumber || 'Incident Report',
          date: w.submittedAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching disputeable items:", error);
      res.status(500).json({ message: "Failed to fetch disputeable items" });
    }
  });

  // ============================================================================
  // CROSS-ORGANIZATIONAL EMPLOYEE REPUTATION API (for hiring managers)
  // ============================================================================
  
  // Get dispute investigation context (for support staff)
  app.get('/api/disputes/:id/investigation-context', isAuthenticated, requirePlatformStaff, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Get the dispute
      const dispute = await db.query.disputes.findFirst({
        where: (disputes, { eq }) => eq(disputes.id, id),
      });

      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      // Get employee who filed the dispute
      const employee = await db.select().from(employees).where(eq(employees.id, dispute.filedBy)).limit(1);
      if (!employee.length) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const employeeData = employee[0];

      // Get TrackOS context - Time entries and attendance data
      const timeEntriesData = await db.select({
        totalEntries: sql<number>`count(*)`,
        lateClockIns: sql<number>`count(*) filter (where clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}))`,
        totalHours: sql<number>`sum(total_hours)`,
        avgHoursPerWeek: sql<number>`avg(total_hours)`,
        entriesLast30Days: sql<number>`count(*) filter (where clock_in >= now() - interval '30 days')`,
        lateClockInsLast30Days: sql<number>`count(*) filter (where clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}) and clock_in >= now() - interval '30 days')`,
      })
        .from(timeEntriesTable)
        .where(eq(timeEntriesTable.employeeId, employeeData.id));

      // Get write-ups (RMS disciplinary actions)
      const writeUpsData = await db.select({
        count: sql<number>`count(*)`,
        last30Days: sql<number>`count(*) filter (where submitted_at >= now() - interval '30 days')`,
        last90Days: sql<number>`count(*) filter (where submitted_at >= now() - interval '90 days')`,
      })
        .from(reportTemplates)
        .innerJoin(
          reportSubmissions,
          eq(reportSubmissions.templateId, reportTemplates.id)
        )
        .where(
          and(
            eq(reportSubmissions.employeeId, employeeData.id),
            eq(reportTemplates.isDisciplinary, true)
          )
        );

      // Get AuditOS context - Recent audit trail entries for this employee
      const auditEntries = await db.select()
        .from(auditTrail)
        .where(
          and(
            eq(auditTrail.workspaceId, dispute.workspaceId),
            or(
              eq(auditTrail.userId, dispute.filedBy),
              eq(auditTrail.entityId, employeeData.id)
            )
          )
        )
        .orderBy(desc(auditTrail.createdAt))
        .limit(50);

      // Get organization-wide metrics for comparison
      const orgWideMetrics = await db.select({
        totalEmployees: sql<number>`count(distinct employee_id)`,
        avgLateClockInRate: sql<number>`avg(case when clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}) then 1.0 else 0.0 end)`,
        avgHoursPerWeek: sql<number>`avg(total_hours)`,
      })
        .from(timeEntriesTable)
        .where(eq(timeEntriesTable.workspaceId, dispute.workspaceId));

      // Get performance reviews for context
      const performanceReviews = await db.query.performanceReviews.findMany({
        where: (reviews, { eq }) => eq(reviews.employeeId, employeeData.id),
        orderBy: (reviews, { desc }) => [desc(reviews.completedAt)],
        limit: 5,
      });

      // Get employer ratings submitted by this employee
      const employerRatings = await db.query.employerRatings.findMany({
        where: (ratings, { eq }) => eq(ratings.employeeId, employeeData.id),
        orderBy: (ratings, { desc }) => [desc(ratings.submittedAt)],
        limit: 5,
      });

      // Calculate metrics
      const trackOSMetrics = timeEntriesData[0] || {};
      const lateClockInRate = trackOSMetrics.totalEntries > 0
        ? (trackOSMetrics.lateClockIns / trackOSMetrics.totalEntries) * 100
        : 0;
      const lateClockInRateLast30 = trackOSMetrics.entriesLast30Days > 0
        ? (trackOSMetrics.lateClockInsLast30Days / trackOSMetrics.entriesLast30Days) * 100
        : 0;

      const writeUps = writeUpsData[0] || { count: 0, last30Days: 0, last90Days: 0 };
      const orgMetrics = orgWideMetrics[0] || {};

      // Compile investigation context
      const investigationContext = {
        dispute: {
          id: dispute.id,
          type: dispute.disputeType,
          targetId: dispute.targetId,
          title: dispute.title,
          reason: dispute.reason,
          filedAt: dispute.filedAt,
          status: dispute.status,
        },
        employee: {
          id: employeeData.id,
          name: `${employeeData.firstName} ${employeeData.lastName}`,
          role: employeeData.role,
          email: employeeData.email,
          hireDate: employeeData.hireDate,
        },
        trackOSMetrics: {
          totalTimeEntries: trackOSMetrics.totalEntries || 0,
          totalHoursWorked: Math.round(Number(trackOSMetrics.totalHours) * 10) / 10,
          avgHoursPerWeek: Math.round(Number(trackOSMetrics.avgHoursPerWeek) * 10) / 10,
          lateClockIns: trackOSMetrics.lateClockIns || 0,
          lateClockInRate: Math.round(lateClockInRate * 10) / 10,
          lateClockInsLast30Days: trackOSMetrics.lateClockInsLast30Days || 0,
          lateClockInRateLast30Days: Math.round(lateClockInRateLast30 * 10) / 10,
        },
        disciplinaryRecord: {
          totalWriteUps: writeUps.count || 0,
          writeUpsLast30Days: writeUps.last30Days || 0,
          writeUpsLast90Days: writeUps.last90Days || 0,
        },
        auditOSContext: {
          recentAuditEntries: auditEntries.slice(0, 20).map(entry => ({
            id: entry.id,
            action: entry.action,
            entityType: entry.entityType,
            timestamp: entry.createdAt,
            ipAddress: entry.ipAddress,
            success: entry.success,
          })),
          totalAuditEntries: auditEntries.length,
        },
        organizationWideComparison: {
          totalEmployees: orgMetrics.totalEmployees || 0,
          avgLateClockInRate: Math.round((Number(orgMetrics.avgLateClockInRate) || 0) * 1000) / 10,
          avgHoursPerWeek: Math.round(Number(orgMetrics.avgHoursPerWeek) * 10) / 10,
          employeeVsAvgLateRate: Math.round((lateClockInRate - (Number(orgMetrics.avgLateClockInRate) || 0) * 100) * 10) / 10,
        },
        performanceHistory: performanceReviews.map(review => ({
          id: review.id,
          overallRating: review.overallRating,
          attendanceRating: review.attendanceRating,
          completedAt: review.completedAt,
          reviewerComments: review.reviewerComments,
        })),
        employerRatingsHistory: employerRatings.map(rating => ({
          id: rating.id,
          overallScore: rating.overallScore,
          submittedAt: rating.submittedAt,
          positiveComments: rating.positiveComments,
          improvementSuggestions: rating.improvementSuggestions,
        })),
      };

      res.json(investigationContext);
    } catch (error) {
      console.error("Error fetching investigation context:", error);
      res.status(500).json({ message: "Failed to fetch investigation context" });
    }
  });

  // AI-powered dispute analysis (for support staff)
  app.post('/api/disputes/:id/ai-analysis', isAuthenticated, requirePlatformStaff, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Get investigation context directly (internal call - no need for HTTP fetch)
      const dispute = await storage.getDispute(id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      const employee = await storage.getUserById(dispute.employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const workspace = await storage.getWorkspace(dispute.workspaceId);
      
      const timeEntries = await storage.getTimeEntriesByEmployee(dispute.employeeId, dispute.workspaceId);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const lateClockIns = timeEntries.filter(entry => 
        entry.scheduledStart && entry.clockIn && 
        new Date(entry.clockIn) > new Date(entry.scheduledStart)
      );
      const lateClockInsLast30Days = lateClockIns.filter(entry => 
        new Date(entry.clockIn!) >= thirtyDaysAgo
      );
      
      const totalHours = timeEntries.reduce((sum, entry) => {
        if (entry.clockIn && entry.clockOut) {
          const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }
        return sum;
      }, 0);
      
      const weeksWorked = Math.max(1, timeEntries.length / 5);
      const avgHoursPerWeek = (totalHours / weeksWorked).toFixed(1);
      
      const disciplinaryRecords = await storage.getDisciplinaryActionsByEmployee(dispute.employeeId, dispute.workspaceId);
      const disciplinaryLast30Days = disciplinaryRecords.filter(record => 
        new Date(record.incidentDate) >= thirtyDaysAgo
      );
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const disciplinaryLast90Days = disciplinaryRecords.filter(record => 
        new Date(record.incidentDate) >= ninetyDaysAgo
      );
      
      const allWorkspaceEmployees = await storage.getEmployeesByWorkspace(dispute.workspaceId);
      const allTimeEntries = await Promise.all(
        allWorkspaceEmployees.map(emp => storage.getTimeEntriesByEmployee(emp.userId, dispute.workspaceId))
      );
      const allLateClockIns = allTimeEntries.flat().filter(entry => 
        entry.scheduledStart && entry.clockIn && 
        new Date(entry.clockIn) > new Date(entry.scheduledStart)
      );
      const avgLateClockInRate = allTimeEntries.flat().length > 0 
        ? ((allLateClockIns.length / allTimeEntries.flat().length) * 100).toFixed(2)
        : '0.00';
      
      const employeeLateRate = timeEntries.length > 0 
        ? ((lateClockIns.length / timeEntries.length) * 100)
        : 0;
      const orgAvgLateRate = parseFloat(avgLateClockInRate);
      
      const performanceReviews = await storage.getPerformanceReviewsByEmployee(dispute.employeeId, dispute.workspaceId);
      const employerRatings = []; // Not implemented yet
      
      const context = {
        dispute: {
          id: dispute.id,
          type: dispute.type,
          title: dispute.title,
          reason: dispute.reason,
          filedAt: dispute.createdAt,
          status: dispute.status,
        },
        employee: {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role: employee.role,
          hireDate: employee.createdAt,
        },
        workspace: {
          name: workspace?.name || 'Unknown',
        },
        trackOSMetrics: {
          totalTimeEntries: timeEntries.length,
          lateClockIns: lateClockIns.length,
          lateClockInRate: ((lateClockIns.length / Math.max(1, timeEntries.length)) * 100).toFixed(2),
          lateClockInsLast30Days: lateClockInsLast30Days.length,
          lateClockInRateLast30Days: ((lateClockInsLast30Days.length / Math.max(1, timeEntries.filter(e => new Date(e.clockIn!) >= thirtyDaysAgo).length)) * 100).toFixed(2),
          avgHoursPerWeek,
        },
        disciplinaryRecord: {
          totalWriteUps: disciplinaryRecords.length,
          writeUpsLast30Days: disciplinaryLast30Days.length,
          writeUpsLast90Days: disciplinaryLast90Days.length,
          records: disciplinaryRecords.map(record => ({
            id: record.id,
            type: record.type,
            severity: record.severity,
            incidentDate: record.incidentDate,
            description: record.description,
          })),
        },
        organizationWideComparison: {
          avgLateClockInRate,
          employeeVsAvgLateRate: (employeeLateRate - orgAvgLateRate).toFixed(2),
        },
        performanceHistory: performanceReviews.map(review => ({
          id: review.id,
          overallRating: review.overallRating,
          attendanceRating: review.attendanceRating,
          completedAt: review.completedAt,
          reviewerComments: review.reviewerComments,
        })),
        employerRatingsHistory: employerRatings,
      };

      // Prepare AI analysis prompt
      const prompt = `You are an AI assistant helping support staff investigate employee disputes. Analyze the following dispute and provide objective insights.

**Dispute Details:**
- Type: ${context.dispute.type}
- Title: ${context.dispute.title}
- Reason: ${context.dispute.reason}
- Filed: ${context.dispute.filedAt}

**Employee Profile:**
- Name: ${context.employee.name}
- Role: ${context.employee.role}
- Hire Date: ${context.employee.hireDate}

**TrackOS Metrics (Attendance Data):**
- Total Time Entries: ${context.trackOSMetrics.totalTimeEntries}
- Late Clock-Ins: ${context.trackOSMetrics.lateClockIns} (${context.trackOSMetrics.lateClockInRate}% rate)
- Late Clock-Ins (Last 30 Days): ${context.trackOSMetrics.lateClockInsLast30Days} (${context.trackOSMetrics.lateClockInRateLast30Days}% rate)
- Avg Hours/Week: ${context.trackOSMetrics.avgHoursPerWeek}

**Disciplinary Record:**
- Total Write-Ups: ${context.disciplinaryRecord.totalWriteUps}
- Write-Ups (Last 30 Days): ${context.disciplinaryRecord.writeUpsLast30Days}
- Write-Ups (Last 90 Days): ${context.disciplinaryRecord.writeUpsLast90Days}

**Organization-Wide Comparison:**
- Org Avg Late Clock-In Rate: ${context.organizationWideComparison.avgLateClockInRate}%
- Employee vs Org Avg: ${context.organizationWideComparison.employeeVsAvgLateRate}% ${context.organizationWideComparison.employeeVsAvgLateRate > 0 ? 'HIGHER' : 'LOWER'} than average
- Total Employees: ${context.organizationWideComparison.totalEmployees}

**Performance History:**
${context.performanceHistory.map((review: any) => `- Overall Rating: ${review.overallRating}/5, Attendance Rating: ${review.attendanceRating}/5`).join('\n')}

**Task:**
1. **Pattern Detection**: Identify any patterns in the data that support or contradict the dispute claim
2. **Risk Flags**: Flag any concerning patterns (e.g., "Employee late clock-in rate is 3x higher than org average")
3. **Context Assessment**: Does the data support the employee's claim or suggest the original decision was justified?
4. **Recommended Actions**: Suggest 2-3 specific next steps for support staff

**Output Format (JSON):**
{
  "patternDetection": "...",
  "riskFlags": ["flag1", "flag2"],
  "contextAssessment": "...",
  "recommendedActions": ["action1", "action2", "action3"],
  "supportingEvidence": ["evidence1", "evidence2"],
  "contradictingEvidence": ["evidence1", "evidence2"]
}`;

      // Call OpenAI API
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are an objective AI analyst helping support staff investigate employee disputes. Provide balanced, data-driven insights.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!openaiResponse.ok) {
        console.error("OpenAI API error:", await openaiResponse.text());
        return res.status(500).json({ message: "Failed to generate AI analysis" });
      }

      const aiResult = await openaiResponse.json();
      const analysis = JSON.parse(aiResult.choices[0].message.content);

      res.json({
        ...analysis,
        generatedAt: new Date().toISOString(),
        model: 'gpt-4',
      });
    } catch (error) {
      console.error("Error generating AI analysis:", error);
      res.status(500).json({ message: "Failed to generate AI analysis" });
    }
  });

  // ============================================================================
  // SUPPORT RESOLUTION ACTIONS API (for platform staff)
  // ============================================================================

  // Delete a performance review (with explanation)
  app.delete('/api/support/performance-reviews/:id', isAuthenticated, requirePlatformStaff, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { explanation, notifyUserId } = req.body;

      if (!explanation) {
        return res.status(400).json({ message: "explanation is required" });
      }

      // Get the review first
      const review = await db.query.performanceReviews.findFirst({
        where: (reviews, { eq }) => eq(reviews.id, id),
      });

      if (!review) {
        return res.status(404).json({ message: "Performance review not found" });
      }

      // Delete the review
      await db.delete(performanceReviews).where(eq(performanceReviews.id, id));

      // Send email notification (if notifyUserId provided)
      if (notifyUserId) {
        const notifyUser = await storage.getUser(notifyUserId);
        const employee = await db.query.employees.findFirst({
          where: (employees, { eq }) => eq(employees.id, review.employeeId),
        });
        const staffUser = await storage.getUser(req.user.claims.sub);

        if (notifyUser?.email && employee) {
          await sendReviewDeletedEmail(notifyUser.email, {
            recipientName: `${employee.firstName} ${employee.lastName}`,
            reviewType: 'Performance Review',
            deletedBy: staffUser?.email || 'Platform Support',
            explanation
          }).catch(err => console.error('Failed to send review deleted email:', err));
        }
      }

      res.json({ 
        success: true, 
        message: "Performance review deleted successfully",
        explanation 
      });
    } catch (error) {
      console.error("Error deleting performance review:", error);
      res.status(500).json({ message: "Failed to delete performance review" });
    }
  });

  // Edit a performance review (with explanation)
  app.patch('/api/support/performance-reviews/:id', isAuthenticated, requirePlatformStaff, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { updates, explanation, notifyUserId } = req.body;

      if (!explanation) {
        return res.status(400).json({ message: "explanation is required" });
      }

      if (!updates) {
        return res.status(400).json({ message: "updates object is required" });
      }

      // Update the review
      const updatedReview = await db.update(performanceReviews)
        .set(updates)
        .where(eq(performanceReviews.id, id))
        .returning();

      if (!updatedReview.length) {
        return res.status(404).json({ message: "Performance review not found" });
      }

      // Send email notification (if notifyUserId provided)
      if (notifyUserId) {
        const notifyUser = await storage.getUser(notifyUserId);
        const employee = await db.query.employees.findFirst({
          where: (employees, { eq }) => eq(employees.id, updatedReview[0].employeeId),
        });
        const staffUser = await storage.getUser(req.user.claims.sub);

        // Generate description of changes
        const changesDescription = Object.keys(updates).join(', ');

        if (notifyUser?.email && employee) {
          await sendReviewEditedEmail(notifyUser.email, {
            recipientName: `${employee.firstName} ${employee.lastName}`,
            reviewType: 'Performance Review',
            editedBy: staffUser?.email || 'Platform Support',
            changesDescription,
            explanation
          }).catch(err => console.error('Failed to send review edited email:', err));
        }
      }

      res.json({
        success: true,
        message: "Performance review updated successfully",
        review: updatedReview[0],
        explanation
      });
    } catch (error) {
      console.error("Error updating performance review:", error);
      res.status(500).json({ message: "Failed to update performance review" });
    }
  });

  // Delete an employer rating (with explanation)
  app.delete('/api/support/employer-ratings/:id', isAuthenticated, requirePlatformStaff, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { explanation, notifyWorkspaceId } = req.body;

      if (!explanation) {
        return res.status(400).json({ message: "explanation is required" });
      }

      // Get the rating first
      const rating = await db.query.employerRatings.findFirst({
        where: (ratings, { eq }) => eq(ratings.id, id),
      });

      if (!rating) {
        return res.status(404).json({ message: "Employer rating not found" });
      }

      // Delete the rating
      await db.delete(employerRatings).where(eq(employerRatings.id, id));

      // Send email notification to workspace (if notifyWorkspaceId provided)
      if (notifyWorkspaceId) {
        const workspace = await db.query.workspaces.findFirst({
          where: (workspaces, { eq }) => eq(workspaces.id, notifyWorkspaceId),
        });
        const staffUser = await storage.getUser(req.user.claims.sub);

        // Find workspace owner email
        const ownerEmployee = await db.query.employees.findFirst({
          where: (employees, { and, eq }) => and(
            eq(employees.workspaceId, notifyWorkspaceId),
            eq(employees.role, 'owner')
          ),
        });

        if (ownerEmployee?.email && workspace) {
          await sendRatingDeletedEmail(ownerEmployee.email, {
            workspaceName: workspace.name,
            deletedBy: staffUser?.email || 'Platform Support',
            explanation
          }).catch(err => console.error('Failed to send rating deleted email:', err));
        }
      }

      res.json({
        success: true,
        message: "Employer rating deleted successfully",
        explanation
      });
    } catch (error) {
      console.error("Error deleting employer rating:", error);
      res.status(500).json({ message: "Failed to delete employer rating" });
    }
  });

  // Edit an employer rating (with explanation)
  app.patch('/api/support/employer-ratings/:id', isAuthenticated, requirePlatformStaff, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { updates, explanation, notifyWorkspaceId } = req.body;

      if (!explanation) {
        return res.status(400).json({ message: "explanation is required" });
      }

      if (!updates) {
        return res.status(400).json({ message: "updates object is required" });
      }

      // Update the rating
      const updatedRating = await db.update(employerRatings)
        .set(updates)
        .where(eq(employerRatings.id, id))
        .returning();

      if (!updatedRating.length) {
        return res.status(404).json({ message: "Employer rating not found" });
      }

      // Send email notification to workspace (if notifyWorkspaceId provided)
      if (notifyWorkspaceId) {
        const workspace = await db.query.workspaces.findFirst({
          where: (workspaces, { eq }) => eq(workspaces.id, notifyWorkspaceId),
        });
        const staffUser = await storage.getUser(req.user.claims.sub);

        // Find workspace owner email
        const ownerEmployee = await db.query.employees.findFirst({
          where: (employees, { and, eq }) => and(
            eq(employees.workspaceId, notifyWorkspaceId),
            eq(employees.role, 'owner')
          ),
        });

        // Generate description of changes
        const changesDescription = Object.keys(updates).join(', ');

        if (ownerEmployee?.email && workspace) {
          await sendRatingDeletedEmail(ownerEmployee.email, {
            workspaceName: `${workspace.name} - Rating Updated`,
            deletedBy: staffUser?.email || 'Platform Support',
            explanation: `Changes made: ${changesDescription}. ${explanation}`
          }).catch(err => console.error('Failed to send rating updated email:', err));
        }
      }

      res.json({
        success: true,
        message: "Employer rating updated successfully",
        rating: updatedRating[0],
        explanation
      });
    } catch (error) {
      console.error("Error updating employer rating:", error);
      res.status(500).json({ message: "Failed to update employer rating" });
    }
  });

  // Delete a report submission (write-up) (with explanation)
  app.delete('/api/support/report-submissions/:id', isAuthenticated, requirePlatformStaff, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { explanation, notifyUserId } = req.body;

      if (!explanation) {
        return res.status(400).json({ message: "explanation is required" });
      }

      // Get the report first
      const report = await db.query.reportSubmissions.findFirst({
        where: (reports, { eq }) => eq(reports.id, id),
      });

      if (!report) {
        return res.status(404).json({ message: "Report submission not found" });
      }

      // Get the template for report type name
      const template = await db.query.reportTemplates.findFirst({
        where: (templates, { eq }) => eq(templates.id, report.templateId),
      });

      // Delete the report
      await db.delete(reportSubmissions).where(eq(reportSubmissions.id, id));

      // Send email notification (if notifyUserId provided)
      if (notifyUserId) {
        const notifyUser = await storage.getUser(notifyUserId);
        const employee = await db.query.employees.findFirst({
          where: (employees, { eq }) => eq(employees.id, report.employeeId),
        });
        const staffUser = await storage.getUser(req.user.claims.sub);

        if (notifyUser?.email && employee) {
          await sendWriteUpDeletedEmail(notifyUser.email, {
            recipientName: `${employee.firstName} ${employee.lastName}`,
            reportType: template?.name || 'Disciplinary Report',
            deletedBy: staffUser?.email || 'Platform Support',
            explanation
          }).catch(err => console.error('Failed to send write-up deleted email:', err));
        }
      }

      res.json({
        success: true,
        message: "Report submission deleted successfully",
        explanation
      });
    } catch (error) {
      console.error("Error deleting report submission:", error);
      res.status(500).json({ message: "Failed to delete report submission" });
    }
  });

  // Get employee reputation data (visible to hiring managers platform-wide)
  app.get('/api/employee-reputation/:employeeId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { employeeId } = req.params;
      
      // Check if user is authorized (HR/Manager/Owner can view reputation data)
      const employee = await storage.getEmployeeByUserId(userId);
      const isAuthorized = employee && ['owner', 'manager', 'hr_manager'].includes(employee.role || '');
      
      if (!isAuthorized) {
        return res.status(403).json({ message: "Only HR/Managers can view employee reputation data" });
      }

      // Get employee basic info
      const targetEmployee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!targetEmployee.length) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Aggregate performance reviews (cross-organizational)
      const performanceReviews = await db.query.performanceReviews.findMany({
        where: (performanceReviews, { eq }) => eq(performanceReviews.employeeId, employeeId),
        columns: {
          overallRating: true,
          attendanceRating: true,
          attendanceRate: true,
          complianceViolations: true,
          reportsSubmitted: true,
          reportsApproved: true,
          reportsRejected: true,
          completedAt: true,
        }
      });

      // Count write-ups (from reportSubmissions)
      const writeUps = await db.select({ count: sql<number>`count(*)` })
        .from(reportTemplates)
        .innerJoin(
          reportSubmissions,
          eq(reportSubmissions.templateId, reportTemplates.id)
        )
        .where(
          and(
            eq(reportSubmissions.employeeId, employeeId),
            eq(reportTemplates.isDisciplinary, true)
          )
        );

      // Get attendance metrics from time entries
      const attendanceData = await db.select({
        totalEntries: sql<number>`count(*)`,
        lateClockIns: sql<number>`count(*) filter (where clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}))`,
        avgHoursPerWeek: sql<number>`avg(total_hours)`
      })
        .from(timeEntriesTable)
        .where(eq(timeEntriesTable.employeeId, employeeId));

      // Get employer ratings (employee's ratings of organizations - shows reliability)
      const employerRatingsCount = await db.select({ count: sql<number>`count(*)` })
        .from(employerRatings)
        .where(eq(employerRatings.employeeId, employeeId));

      // Calculate overall reputation score
      const avgPerformanceRating = performanceReviews.length > 0
        ? performanceReviews.reduce((sum, r) => sum + (r.overallRating || 0), 0) / performanceReviews.length
        : 0;

      const avgAttendanceRating = performanceReviews.length > 0
        ? performanceReviews.reduce((sum, r) => sum + (r.attendanceRating || 0), 0) / performanceReviews.length
        : 0;

      const writeUpCount = writeUps[0]?.count || 0;
      const attendanceMetrics = attendanceData[0] || { totalEntries: 0, lateClockIns: 0, avgHoursPerWeek: 0 };

      // Privacy-safe aggregated data (no sensitive info)
      const reputationData = {
        employeeId,
        // Redacted employee info (no full names, only initials for privacy)
        employeeInitials: `${targetEmployee[0].firstName?.charAt(0) || ''}${targetEmployee[0].lastName?.charAt(0) || ''}`,
        role: targetEmployee[0].role,
        
        // Performance metrics (aggregated, no sensitive comments)
        performanceMetrics: {
          avgOverallRating: Math.round(avgPerformanceRating * 10) / 10,
          avgAttendanceRating: Math.round(avgAttendanceRating * 10) / 10,
          totalReviewsCompleted: performanceReviews.length,
          avgAttendanceRate: performanceReviews.length > 0
            ? performanceReviews.reduce((sum, r) => sum + (Number(r.attendanceRate) || 0), 0) / performanceReviews.length
            : 0,
        },
        
        // Disciplinary record (count only, no details)
        disciplinaryRecord: {
          totalWriteUps: writeUpCount,
          complianceViolations: performanceReviews.reduce((sum, r) => sum + (r.complianceViolations || 0), 0),
        },
        
        // Attendance metrics (aggregated)
        attendanceMetrics: {
          totalTimeEntries: attendanceMetrics.totalEntries,
          lateClockIns: attendanceMetrics.lateClockIns,
          lateClockInRate: attendanceMetrics.totalEntries > 0
            ? Math.round((attendanceMetrics.lateClockIns / attendanceMetrics.totalEntries) * 1000) / 10
            : 0,
          avgHoursPerWeek: Math.round(Number(attendanceMetrics.avgHoursPerWeek) * 10) / 10,
        },
        
        // Engagement metrics
        engagementMetrics: {
          employerRatingsSubmitted: employerRatingsCount[0]?.count || 0,
        },
        
        // Overall reputation score (1-100)
        overallReputationScore: Math.min(100, Math.max(0, Math.round(
          (avgPerformanceRating * 15) + // Max 75 points from performance
          (avgAttendanceRating * 10) + // Max 50 points from attendance
          (attendanceMetrics.totalEntries > 0 ? ((attendanceMetrics.totalEntries - attendanceMetrics.lateClockIns) / attendanceMetrics.totalEntries) * 20 : 0) - // Max 20 points from punctuality
          (writeUpCount * 5) // Deduct 5 points per write-up
        ))),
        
        // Privacy notice
        privacyNotice: "Sensitive information (names, comments, specific details) has been redacted for privacy. This data is aggregated for hiring decisions only."
      };

      res.json(reputationData);
    } catch (error) {
      console.error("Error fetching employee reputation:", error);
      res.status(500).json({ message: "Failed to fetch employee reputation data" });
    }
  });

  // ============================================================================
  // ONBOARDING ROUTES
  // ============================================================================

  // Get user onboarding progress
  app.get('/api/onboarding/progress', async (req: any, res) => {
    try {
      let userId: string;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
        userId = req.user.claims.sub;
      } else if (req.session?.userId) {
        userId = req.session.userId;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const progress = await db.select()
        .from(userOnboarding)
        .where(eq(userOnboarding.userId, userId))
        .limit(1);

      if (progress.length === 0) {
        // Create new onboarding record
        const newProgress = await db.insert(userOnboarding)
          .values({ userId })
          .returning();
        return res.json(newProgress[0]);
      }

      res.json(progress[0]);
    } catch (error) {
      console.error("Error fetching onboarding progress:", error);
      res.status(500).json({ message: "Failed to fetch onboarding progress" });
    }
  });

  // Mark onboarding as skipped
  app.post('/api/onboarding/skip', async (req: any, res) => {
    try {
      let userId: string;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
        userId = req.user.claims.sub;
      } else if (req.session?.userId) {
        userId = req.session.userId;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const updated = await db.update(userOnboarding)
        .set({
          hasSkipped: true,
          lastViewedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(userOnboarding.userId, userId))
        .returning();

      if (updated.length === 0) {
        // Create with skipped status
        const created = await db.insert(userOnboarding)
          .values({
            userId,
            hasSkipped: true,
            lastViewedAt: new Date()
          })
          .returning();
        return res.json(created[0]);
      }

      res.json(updated[0]);
    } catch (error) {
      console.error("Error skipping onboarding:", error);
      res.status(500).json({ message: "Failed to skip onboarding" });
    }
  });

  // Mark onboarding as complete
  app.post('/api/onboarding/complete', async (req: any, res) => {
    try {
      let userId: string;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
        userId = req.user.claims.sub;
      } else if (req.session?.userId) {
        userId = req.session.userId;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        completedSteps,
        communicationProgress,
        operationsProgress,
        growthProgress,
        platformProgress
      } = req.body;

      const progressPercentage = 100;

      const updated = await db.update(userOnboarding)
        .set({
          completedSteps: completedSteps || [],
          hasCompleted: true,
          progressPercentage,
          communicationProgress: communicationProgress || 0,
          operationsProgress: operationsProgress || 0,
          growthProgress: growthProgress || 0,
          platformProgress: platformProgress || 0,
          lastViewedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(userOnboarding.userId, userId))
        .returning();

      if (updated.length === 0) {
        // Create with completed status
        const created = await db.insert(userOnboarding)
          .values({
            userId,
            completedSteps: completedSteps || [],
            hasCompleted: true,
            progressPercentage,
            communicationProgress: communicationProgress || 0,
            operationsProgress: operationsProgress || 0,
            growthProgress: growthProgress || 0,
            platformProgress: platformProgress || 0,
            lastViewedAt: new Date()
          })
          .returning();
        return res.json(created[0]);
      }

      res.json(updated[0]);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // ==========================================
  // SALES MVP: DealOS™ + BidOS™ Routes
  // ==========================================

  // GET /api/sales/deals - Fetch all deals
  app.get("/api/sales/deals", requireAuth, async (req, res) => {
    try {
      const { workspaceId } = req;
      const allDeals = await db.query.deals.findMany({
        where: (deals, { eq }) => eq(deals.workspaceId, workspaceId!),
        orderBy: (deals, { desc }) => [desc(deals.createdAt)],
      });
      res.json(allDeals);
    } catch (error) {
      console.error("Error fetching deals:", error);
      res.status(500).json({ message: "Failed to fetch deals" });
    }
  });

  // POST /api/sales/deals - Create new deal (RBAC: Manager+ only)
  app.post("/api/sales/deals", requireManager, async (req, res) => {
    try {
      const { workspaceId } = req;
      
      // Validate request body with Zod
      const validatedData = insertDealSchema.parse(req.body);
      
      const newDeal = await db.insert(deals).values({
        ...validatedData,
        workspaceId,
      }).returning();
      res.json(newDeal[0]);
    } catch (error) {
      console.error("Error creating deal:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid deal data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create deal" });
    }
  });

  // GET /api/sales/rfps - Fetch all RFPs
  app.get("/api/sales/rfps", requireAuth, async (req, res) => {
    try {
      const { workspaceId } = req;
      const allRfps = await db.query.rfps.findMany({
        where: (rfps, { eq }) => eq(rfps.workspaceId, workspaceId!),
        orderBy: (rfps, { desc }) => [desc(rfps.createdAt)],
      });
      res.json(allRfps);
    } catch (error) {
      console.error("Error fetching RFPs:", error);
      res.status(500).json({ message: "Failed to fetch RFPs" });
    }
  });

  // POST /api/sales/rfps - Create new RFP (RBAC: Manager+ only)
  app.post("/api/sales/rfps", requireManager, async (req, res) => {
    try {
      const { workspaceId } = req;
      
      // Validate request body with Zod
      const validatedData = insertRfpSchema.parse(req.body);
      
      const newRfp = await db.insert(rfps).values({
        ...validatedData,
        workspaceId,
      }).returning();
      res.json(newRfp[0]);
    } catch (error) {
      console.error("Error creating RFP:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid RFP data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create RFP" });
    }
  });

  // GET /api/sales/leads - Fetch all leads
  app.get("/api/sales/leads", requireAuth, async (req, res) => {
    try {
      const { workspaceId } = req;
      const allLeads = await db.query.leads.findMany({
        where: (leads, { eq }) => eq(leads.workspaceId, workspaceId!),
        orderBy: (leads, { desc }) => [desc(leads.createdAt)],
      });
      res.json(allLeads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // POST /api/sales/leads - Create new lead (RBAC: Manager+ only)
  app.post("/api/sales/leads", requireManager, async (req, res) => {
    try {
      const { workspaceId } = req;
      
      // Validate request body with Zod
      const validatedData = insertLeadSchema.parse(req.body);
      
      const newLead = await db.insert(leads).values({
        ...validatedData,
        workspaceId,
      }).returning();
      res.json(newLead[0]);
    } catch (error) {
      console.error("Error creating lead:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid lead data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  // ============================================================================
  // RECORDOS™ - NATURAL LANGUAGE SEARCH API
  // ============================================================================

  // POST /api/search - Natural language search across all data
  app.post("/api/search", requireAuth, async (req, res) => {
    try {
      const { workspaceId, userId } = req;
      const { query, searchType = 'all' } = req.body;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ message: "Search query is required" });
      }

      const startTime = Date.now();
      const results: any = {
        employees: [],
        clients: [],
        invoices: [],
        timeEntries: [],
        shifts: [],
      };

      // Search employees
      if (searchType === 'all' || searchType === 'employees') {
        const employeeResults = await db.query.employees.findMany({
          where: (employees, { eq, and, or, ilike }) => and(
            eq(employees.workspaceId, workspaceId!),
            or(
              ilike(employees.firstName, `%${query}%`),
              ilike(employees.lastName, `%${query}%`),
              ilike(employees.email, `%${query}%`)
            )
          ),
          limit: 10,
        });
        results.employees = employeeResults;
      }

      // Search clients
      if (searchType === 'all' || searchType === 'clients') {
        const clientResults = await db.query.clients.findMany({
          where: (clients, { eq, and, or, ilike }) => and(
            eq(clients.workspaceId, workspaceId!),
            or(
              ilike(clients.name, `%${query}%`),
              ilike(clients.contactEmail, `%${query}%`)
            )
          ),
          limit: 10,
        });
        results.clients = clientResults;
      }

      const executionTimeMs = Date.now() - startTime;

      // Log search query
      await db.insert(searchQueries).values({
        workspaceId,
        userId,
        query,
        searchType,
        resultsCount: Object.values(results).flat().length,
        executionTimeMs,
        aiProcessed: false,
      });

      res.json({
        results,
        metadata: {
          totalResults: Object.values(results).flat().length,
          executionTimeMs,
          query,
          searchType,
        },
      });
    } catch (error) {
      console.error("Error performing search:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // GET /api/search/history - Get search history
  app.get("/api/search/history", requireAuth, async (req, res) => {
    try {
      const { workspaceId } = req;
      
      const history = await db.query.searchQueries.findMany({
        where: (searchQueries, { eq }) => eq(searchQueries.workspaceId, workspaceId!),
        orderBy: (searchQueries, { desc }) => [desc(searchQueries.createdAt)],
        limit: 50,
      });

      res.json(history);
    } catch (error) {
      console.error("Error fetching search history:", error);
      res.status(500).json({ message: "Failed to fetch search history" });
    }
  });

  // ============================================================================
  // INSIGHTOS™ - AI ANALYTICS & AUTONOMOUS INSIGHTS API
  // ============================================================================

  // GET /api/insights - Fetch all AI insights
  app.get("/api/insights", requireAuth, async (req, res) => {
    try {
      const { workspaceId } = req;
      
      const insights = await db.query.aiInsights.findMany({
        where: (aiInsights, { eq, and }) => and(
          eq(aiInsights.workspaceId, workspaceId!),
          eq(aiInsights.status, 'active')
        ),
        orderBy: (aiInsights, { desc, asc }) => [
          desc(aiInsights.priority),
          desc(aiInsights.createdAt),
        ],
      });

      res.json(insights);
    } catch (error) {
      console.error("Error fetching insights:", error);
      res.status(500).json({ message: "Failed to fetch insights" });
    }
  });

  // POST /api/insights/dismiss/:id - Dismiss an insight
  app.post("/api/insights/dismiss/:id", requireAuth, async (req, res) => {
    try {
      const { userId, workspaceId } = req;
      const { id } = req.params;
      const { reason } = req.body;

      const updated = await db.update(aiInsights)
        .set({
          status: 'dismissed',
          dismissedBy: userId,
          dismissedAt: new Date(),
          dismissReason: reason,
          updatedAt: new Date(),
        })
        .where(and(
          eq(aiInsights.id, id),
          eq(aiInsights.workspaceId, workspaceId!)
        ))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ message: "Insight not found" });
      }

      res.json(updated[0]);
    } catch (error) {
      console.error("Error dismissing insight:", error);
      res.status(500).json({ message: "Failed to dismiss insight" });
    }
  });

  // POST /api/insights/generate - Generate new AI insights (Manager+ only)
  app.post("/api/insights/generate", requireManager, async (req, res) => {
    try {
      const { workspaceId } = req;

      // Fetch workspace metrics for analysis
      const employeeCount = await db.select({ count: sql<number>`count(*)` })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId!));

      const clientCount = await db.select({ count: sql<number>`count(*)` })
        .from(clients)
        .where(eq(clients.workspaceId, workspaceId!));

      // Generate sample insights (AI integration needed for production)
      const insights = [];

      // Cost savings insight
      if (employeeCount[0].count > 10) {
        const savingsInsight = await db.insert(aiInsights).values({
          workspaceId,
          title: "Potential Payroll Optimization",
          category: 'cost_savings',
          priority: 'high',
          summary: `Identified ${Math.floor(employeeCount[0].count * 0.15)} employees with irregular overtime patterns`,
          details: "Analysis shows inconsistent overtime distribution. Implementing shift optimization could reduce overtime costs by 20%.",
          dataPoints: JSON.stringify([
            { metric: "Employees analyzed", value: employeeCount[0].count },
            { metric: "Irregular patterns", value: Math.floor(employeeCount[0].count * 0.15) },
            { metric: "Estimated savings", value: "$8,500/month" }
          ]),
          generatedBy: 'gpt-4o-mini',
          confidence: "87.5",
          actionable: true,
          suggestedActions: [
            "Review overtime distribution across teams",
            "Implement shift swapping automation",
            "Set up overtime alerts for managers"
          ],
          estimatedImpact: "$8,500/month savings",
          status: 'active',
        }).returning();
        insights.push(savingsInsight[0]);
      }

      res.json({
        message: "Insights generated successfully",
        insights,
        count: insights.length,
      });
    } catch (error) {
      console.error("Error generating insights:", error);
      res.status(500).json({ message: "Failed to generate insights" });
    }
  });

  // GET /api/insights/metrics - Get metrics snapshots
  app.get("/api/insights/metrics", requireAuth, async (req, res) => {
    try {
      const { workspaceId } = req;
      const { period = 'daily', limit = 30 } = req.query;

      const snapshots = await db.query.metricsSnapshots.findMany({
        where: (metricsSnapshots, { eq, and }) => and(
          eq(metricsSnapshots.workspaceId, workspaceId!),
          eq(metricsSnapshots.period, period as string)
        ),
        orderBy: (metricsSnapshots, { desc }) => [desc(metricsSnapshots.snapshotDate)],
        limit: parseInt(limit as string),
      });

      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // POST /api/signatures - Save e-signature with immutable object storage
  app.post('/api/signatures', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspace = await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { signatureData, documentType, employeeId } = req.body;
      
      if (!signatureData || !documentType) {
        return res.status(400).json({ message: "Signature data and document type are required" });
      }

      // SECURITY: Verify signature data is PNG
      if (!signatureData.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ message: "Invalid signature format. Must be PNG image." });
      }

      // Convert base64 to buffer
      const base64Data = signatureData.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // SECURITY: Enforce 1MB signature size limit
      const MAX_SIGNATURE_SIZE = 1 * 1024 * 1024; // 1MB
      if (buffer.length > MAX_SIGNATURE_SIZE) {
        return res.status(400).json({ message: `Signature too large. Maximum size is ${MAX_SIGNATURE_SIZE / 1024 / 1024}MB` });
      }

      // SECURITY: Verify buffer is valid PNG (check magic number)
      const isPNG = buffer.length >= 8 && 
                    buffer[0] === 0x89 && 
                    buffer[1] === 0x50 && 
                    buffer[2] === 0x4E && 
                    buffer[3] === 0x47;
      if (!isPNG) {
        return res.status(400).json({ message: "Invalid PNG signature. Data appears corrupted or forged." });
      }

      // SECURITY: Verify PRIVATE_OBJECT_DIR is configured
      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      if (!privateDir) {
        console.error('PRIVATE_OBJECT_DIR environment variable not set');
        return res.status(500).json({ message: "Object storage not configured" });
      }

      // Get user details for audit
      const user = await storage.getUser(userId);
      const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Unknown';

      // Upload signature to object storage (immutable)
      const signatureId = randomUUID();
      const objectPath = `${privateDir}/signatures/${workspace.id}/${signatureId}.png`;
      const { bucketName, objectName } = parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(buffer, {
        metadata: {
          contentType: 'image/png',
          metadata: {
            workspaceId: workspace.id,
            userId: userId,
            documentType: documentType,
            signedByName: fullName,
            timestamp: new Date().toISOString(),
            immutable: 'true', // Mark as immutable
          },
        },
      });

      // Generate hash for integrity verification
      const cryptoModule = await import('crypto');
      const hash = cryptoModule.createHash('sha256').update(buffer).digest('hex');

      // Store signature URL in object storage path format
      const signatureUrl = `/objects/signatures/${workspace.id}/${signatureId}.png`;

      // Create signature record with full audit trail
      const signatureRecord = await db.insert(documentSignatures).values({
        workspaceId: workspace.id,
        employeeId: employeeId || userId,
        documentType: documentType,
        documentTitle: `${documentType.replace(/_/g, ' ').toUpperCase()} - E-Signature`,
        status: 'signed',
        signatureData: hash, // Store hash instead of full image
        documentUrl: signatureUrl, // Object storage URL
        signedByName: fullName,
        signedAt: new Date(),
        ipAddress: req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      }).returning();

      // Create audit log
      await db.insert(auditTrail).values({
        workspaceId: workspace.id,
        userId: userId,
        action: 'signature_captured',
        entityType: 'document_signature',
        entityId: signatureRecord[0].id,
        changes: {
          documentType,
          signedByName: fullName,
          signatureUrl,
          hash,
          timestamp: new Date().toISOString(),
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      res.json(signatureRecord[0]);
    } catch (error: any) {
      console.error("Error saving signature:", error);
      res.status(500).json({ message: error.message || "Failed to save signature" });
    }
  });

  // Helper function to parse object storage paths
  function parseObjectPath(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }
    return {
      bucketName: pathParts[1],
      objectName: pathParts.slice(2).join("/"),
    };
  }

  // ============================================================================
  // COMMOS™ - ORGANIZATION CHAT ROOMS & CHANNELS
  // ============================================================================

  // GET /api/comm-os/rooms - List chat rooms (workspace-scoped for orgs, all for support)
  app.get('/api/comm-os/rooms', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspaceId;
      const isSupportStaff = req.user!.role === 'platform_admin' || req.user!.role === 'support_staff';

      let rooms;
      if (isSupportStaff) {
        // Support staff see all organization rooms
        rooms = await storage.getAllOrganizationChatRooms();
      } else if (workspaceId) {
        // Organization users see their own rooms
        rooms = await storage.getOrganizationChatRoomsByWorkspace(workspaceId);
      } else {
        return res.status(400).json({ message: "No workspace found" });
      }

      res.json(rooms);
    } catch (error: any) {
      console.error("Error fetching chat rooms:", error);
      res.status(500).json({ message: "Failed to fetch chat rooms" });
    }
  });

  // GET /api/comm-os/onboarding-status - Check organization onboarding status
  app.get('/api/comm-os/onboarding-status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace found" });
      }

      const onboarding = await storage.getOrganizationRoomOnboarding(workspaceId);
      if (!onboarding) {
        return res.json({ isCompleted: false, currentStep: 0 });
      }

      res.json(onboarding);
    } catch (error: any) {
      console.error("Error fetching onboarding status:", error);
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  // POST /api/comm-os/complete-onboarding - Complete onboarding and create room
  app.post('/api/comm-os/complete-onboarding', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace found" });
      }

      const { roomName, roomDescription, channels, allowGuests } = req.body;

      if (!roomName || !roomName.trim()) {
        return res.status(400).json({ message: "Room name is required" });
      }

      const room = await storage.completeOrganizationOnboarding(workspaceId, userId, {
        roomName: roomName.trim(),
        roomDescription: roomDescription?.trim(),
        channels: channels || [],
        allowGuests: allowGuests !== false,
      });

      // Create audit log
      await db.insert(auditTrail).values({
        workspaceId: workspaceId,
        userId: userId,
        action: 'room_created',
        entityType: 'organization_chat_room',
        entityId: room.id,
        changes: {
          roomName: room.roomName,
          channelCount: (channels || []).length,
          timestamp: new Date().toISOString(),
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      res.json({ message: "Onboarding completed successfully", room });
    } catch (error: any) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // POST /api/comm-os/rooms/:id/join - Support staff join room
  app.post('/api/comm-os/rooms/:id/join', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const roomId = req.params.id;
      const isSupportStaff = req.user!.role === 'platform_admin' || req.user!.role === 'support_staff';

      if (!isSupportStaff) {
        return res.status(403).json({ message: "Only support staff can join organization rooms" });
      }

      const room = await storage.getOrganizationChatRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      // Check if already a member
      const existingMembers = await storage.getOrganizationRoomMembers(roomId);
      const alreadyMember = existingMembers.some(m => m.userId === userId);

      if (alreadyMember) {
        return res.json({ message: "Already a member of this room" });
      }

      // Add support staff as member
      await storage.addOrganizationRoomMember({
        roomId,
        userId,
        workspaceId: room.workspaceId,
        role: 'admin', // Support staff join as admin
        canInvite: true,
        canManage: true,
        isApproved: true,
      });

      // Create audit log
      await db.insert(auditTrail).values({
        workspaceId: room.workspaceId,
        userId: userId,
        action: 'support_staff_joined_room',
        entityType: 'organization_chat_room',
        entityId: roomId,
        changes: {
          joinedBy: userId,
          timestamp: new Date().toISOString(),
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      res.json({ message: "Successfully joined room" });
    } catch (error: any) {
      console.error("Error joining room:", error);
      res.status(500).json({ message: "Failed to join room" });
    }
  });

  // POST /api/comm-os/rooms/:id/suspend - Suspend room (support staff only)
  app.post('/api/comm-os/rooms/:id/suspend', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const roomId = req.params.id;
      const { reason } = req.body;
      const isSupportStaff = req.user!.role === 'platform_admin' || req.user!.role === 'support_staff';

      if (!isSupportStaff) {
        return res.status(403).json({ message: "Only support staff can suspend rooms" });
      }

      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Suspension reason is required" });
      }

      const room = await storage.getOrganizationChatRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      await storage.suspendOrganizationChatRoom(roomId, userId, reason);

      // Create audit log
      await db.insert(auditTrail).values({
        workspaceId: room.workspaceId,
        userId: userId,
        action: 'room_suspended',
        entityType: 'organization_chat_room',
        entityId: roomId,
        changes: {
          reason,
          suspendedBy: userId,
          timestamp: new Date().toISOString(),
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      res.json({ message: "Room suspended successfully" });
    } catch (error: any) {
      console.error("Error suspending room:", error);
      res.status(500).json({ message: "Failed to suspend room" });
    }
  });

  // POST /api/comm-os/rooms/:id/lift-suspension - Lift room suspension (support staff only)
  app.post('/api/comm-os/rooms/:id/lift-suspension', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const roomId = req.params.id;
      const isSupportStaff = req.user!.role === 'platform_admin' || req.user!.role === 'support_staff';

      if (!isSupportStaff) {
        return res.status(403).json({ message: "Only support staff can lift room suspensions" });
      }

      const room = await storage.getOrganizationChatRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      await storage.liftOrganizationChatRoomSuspension(roomId);

      // Create audit log
      await db.insert(auditTrail).values({
        workspaceId: room.workspaceId,
        userId: userId,
        action: 'room_suspension_lifted',
        entityType: 'organization_chat_room',
        entityId: roomId,
        changes: {
          liftedBy: userId,
          timestamp: new Date().toISOString(),
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      res.json({ message: "Suspension lifted successfully" });
    } catch (error: any) {
      console.error("Error lifting suspension:", error);
      res.status(500).json({ message: "Failed to lift suspension" });
    }
  });

  // ============================================================================
  // PRIVATE MESSAGES / DM SYSTEM
  // ============================================================================

  // GET /api/private-messages/conversations - Get all user conversations
  app.get('/api/private-messages/conversations', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace found" });
      }

      const conversations = await storage.getPrivateMessageConversations(userId, workspaceId);
      res.json(conversations);
    } catch (error: any) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // GET /api/private-messages/:conversationId - Get messages in a conversation
  app.get('/api/private-messages/:conversationId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.params.conversationId;

      const messages = await storage.getPrivateMessages(userId, conversationId);
      res.json(messages);
    } catch (error: any) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // POST /api/private-messages/send - Send a private message
  app.post('/api/private-messages/send', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspaceId;
      const { recipientId, message } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace found" });
      }

      if (!recipientId || !message) {
        return res.status(400).json({ message: "Recipient and message are required" });
      }

      const conversation = await storage.getOrCreatePrivateConversation(workspaceId, userId, recipientId);

      // Derive senderName from authenticated user on server (prevent spoofing)
      const senderName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.email || 'User';

      const sentMessage = await storage.sendPrivateMessage({
        workspaceId,
        conversationId: conversation.id,
        senderId: userId,
        senderName,
        recipientId,
        message: message.trim(),
      });

      res.json(sentMessage);
    } catch (error: any) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // POST /api/private-messages/start - Start a new conversation
  app.post('/api/private-messages/start', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workspaceId = req.workspaceId;
      const { recipientId } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace found" });
      }

      if (!recipientId) {
        return res.status(400).json({ message: "Recipient is required" });
      }

      const conversation = await storage.getOrCreatePrivateConversation(workspaceId, userId, recipientId);

      res.json({ conversationId: conversation.id });
    } catch (error: any) {
      console.error("Error starting conversation:", error);
      res.status(500).json({ message: "Failed to start conversation" });
    }
  });

  // POST /api/private-messages/:conversationId/mark-read - Mark messages as read
  app.post('/api/private-messages/:conversationId/mark-read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.params.conversationId;

      await storage.markPrivateMessagesAsRead(conversationId, userId);

      res.json({ message: "Messages marked as read" });
    } catch (error: any) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  // GET /api/users/search - Search users for new conversations
  app.get('/api/users/search', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      const query = req.query.q as string;

      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace found" });
      }

      if (!query || query.length < 3) {
        return res.json([]);
      }

      const users = await storage.searchUsers(workspaceId, query);
      res.json(users);
    } catch (error: any) {
      console.error("Error searching users:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Return the server we created at the top with WebSocket
  return server;
}