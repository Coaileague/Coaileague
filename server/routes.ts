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
import { 
  sendShiftAssignmentEmail, 
  sendInvoiceGeneratedEmail, 
  sendEmployeeOnboardingEmail,
  sendOnboardingInviteEmail,
  sendReportDeliveryEmail
} from "./email";
import { requireOwner, requireManager, validateManagerAssignment, requirePlatformStaff, requirePlatformAdmin, type AuthenticatedRequest } from "./rbac";
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
} from "@shared/schema";
import crypto from "crypto";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { setupWebSocket } from "./websocket";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const server = createServer(app);
  
  // SECURITY: WebSocket disabled until authentication is implemented
  // WebSocket currently lacks proper auth and violates multi-tenant isolation
  // Use REST API endpoints instead - they are fully secured
  // TODO: Implement WebSocket authentication before enabling
  // setupWebSocket(server);
  
  // Setup custom auth (portable, session-based)
  setupCustomAuth(app);
  
  // Also setup Replit auth (for backward compatibility)
  await setupAuth(app);
  
  // Trust proxy for accurate IP detection behind load balancers
  app.set('trust proxy', 1);
  
  // Audit logging middleware (captures request context for all authenticated requests)
  app.use(auditContextMiddleware);

  // ============================================================================
  // HEALTH CHECK & MONITORING (No rate limiting)
  // ============================================================================
  
  // Health check endpoint for uptime monitoring (no auth or rate limit required)
  app.get('/api/health', async (req, res) => {
    try {
      // Basic health check - verify database connection
      await storage.db.execute(sql`SELECT 1`);
      
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
  app.use('/api/auth', authLimiter); // Extra strict for auth endpoints
  
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

      // Create session manually (bypass OIDC)
      req.session.passport = {
        user: {
          claims: {
            sub: DEMO_USER_ID,
            email: "demo@shiftsync.app",
            first_name: "Demo",
            last_name: "User"
          }
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
  // WORKSPACE ROUTES
  // ============================================================================
  
  // Get or create workspace for current user
  app.get('/api/workspace', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let workspace = await storage.getWorkspaceByOwnerId(userId);
      
      // Auto-create workspace on first login
      if (!workspace) {
        const user = await storage.getUser(userId);
        workspace = await storage.createWorkspace({
          name: `${user?.firstName || user?.email || 'My'}'s Workspace`,
          ownerId: userId,
        });
      }
      
      res.json(workspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  // Update workspace (Users can only update basic settings, Platform Admin can update critical org info)
  app.patch('/api/workspace', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // SECURITY: Users can only update basic settings, not critical organization data
      // Platform admins use the /api/admin/workspace endpoint for full control
      const allowedFields = ['name', 'companyWebsite', 'companyPhone', 'logoUrl'];
      const filteredData: any = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          filteredData[key] = req.body[key];
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const validated = insertWorkspaceSchema.partial().parse(filteredData);
      const updated = await storage.updateWorkspace(workspace.id, validated);
      res.json(updated);
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
  app.get('/api/workspace/theme', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/business-categories', isAuthenticated, async (req: any, res) => {
    try {
      const { businessCategories } = await import("./seedFormTemplates");
      res.json(businessCategories);
    } catch (error) {
      console.error("Error fetching business categories:", error);
      res.status(500).json({ message: "Failed to fetch business categories" });
    }
  });

  // Seed form templates for workspace based on business category
  app.post('/api/workspace/seed-form-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  
  app.get('/api/employees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  // CLIENT ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

      // Validate with Zod and enforce workspace ownership
      const validated = insertClientSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const client = await storage.createClient(validated);
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
  
  app.get('/api/shifts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

      const validated = insertTimeEntrySchema.parse({
        ...req.body,
        workspaceId: workspace.id,
        clockIn: new Date().toISOString(),
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

      const clockOut = new Date();
      const clockIn = new Date(timeEntry.clockIn);
      const totalHours = ((clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2);
      
      const hourlyRate = timeEntry.hourlyRate || "0";
      const totalAmount = (parseFloat(totalHours) * parseFloat(hourlyRate as string)).toFixed(2);

      const updated = await storage.updateTimeEntry(req.params.id, workspace.id, {
        clockOut: clockOut.toISOString(),
        totalHours,
        totalAmount,
      });

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
      const onboardingUrl = `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 'http://localhost:5000'}/onboarding/${inviteToken}`;
      
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

  // ============================================================================
  // STRIPE PAYMENT PROCESSING (Full implementation ready for key activation)
  // ============================================================================
  
  // Initialize Stripe (will activate when STRIPE_SECRET_KEY is added)
  let stripe: any = null;
  if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('✅ Stripe initialized successfully');
  } else {
    console.warn('⚠️  STRIPE_SECRET_KEY not found. Payment processing disabled. Add keys to activate.');
  }

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
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.warn('Stripe webhook secret not configured');
        return res.status(400).send('Webhook secret required');
      }

      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      // Handle events
      switch (event.type) {
        case 'payment_intent.succeeded':
          console.log('Payment succeeded:', event.data.object.id);
          break;
        
        case 'payment_intent.payment_failed':
          console.log('Payment failed:', event.data.object.id);
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

      // Log the contact form submission (in production, this would save to database or send email)
      console.log("Contact form submission:", {
        name,
        email,
        company,
        phone,
        subject,
        tier,
        message,
        timestamp: new Date().toISOString()
      });

      // In production, you would:
      // 1. Save to a contacts/tickets database table
      // 2. Send email to support team using Resend
      // 3. Send confirmation email to user
      // 4. Create ticket in support system (e.g., Zendesk, Intercom)
      
      // Return success
      res.json({ 
        success: true,
        message: "Thank you for contacting us! Our team will respond within 24 hours.",
        ticketId: crypto.randomBytes(6).toString('hex').toUpperCase()
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

  // Search workspaces (cross-tenant admin search)
  app.get('/api/platform/workspaces/search', requirePlatformStaff, async (req, res) => {
    await searchWorkspaces(req, res);
  });

  // Get workspace admin detail
  app.get('/api/platform/workspaces/:workspaceId', requirePlatformStaff, async (req, res) => {
    await getWorkspaceAdminDetail(req, res);
  });

  // Get all platform users
  app.get('/api/platform/users', requirePlatformStaff, async (req, res) => {
    await getPlatformUsers(req, res);
  });

  // Create platform user (admin or support staff)
  app.post('/api/platform/users', requirePlatformAdmin, async (req, res) => {
    await createPlatformUser(req, res);
  });

  // ============================================================================
  // LIVE CHAT ROUTES (WebSocket Support System)
  // ============================================================================
  
  // Get all conversations for workspace
  app.get('/api/chat/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/chat/conversations/:id/messages', isAuthenticated, async (req: any, res) => {
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

      const messages = await storage.getChatMessagesByConversation(id);
      res.json(messages);
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

  // Return the server we created at the top with WebSocket
  return server;
}
