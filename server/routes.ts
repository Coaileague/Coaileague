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
  });

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
      
      const platformUpdatesData = await storage.getPlatformUpdatesWithReadState(userId, workspaceId, 50);
      
      
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
          status: 'active',
          role: 'org_owner',
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

  app.get('/api/employees', requireAuth, requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      // Platform staff accessing for diagnostics (middleware sets platformRole)
      if (req.platformRole && (req.platformRole === 'root_admin' || req.platformRole === 'sysop' || req.platformRole === 'support_manager')) {
        // Platform staff can specify workspaceId via query
        const targetWorkspaceId = req.workspaceId || req.query.workspaceId as string;
        
        if (targetWorkspaceId) {
          // Get specific workspace employees
          const employees = await storage.getEmployeesByWorkspace(targetWorkspaceId);
          return res.json(employees);
        }
        
        // No workspaceId specified - show demo workspace for backwards compatibility
        const allWorkspaces = await db.select().from(workspaces).limit(1);
        if (allWorkspaces.length > 0) {
          const employees = await storage.getEmployeesByWorkspace(allWorkspaces[0].id);
          return res.json(employees);
        }
        return res.json([]);
      }
      
      // Regular workspace manager/owner - use workspace from middleware
      const workspaceId = req.workspaceId;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID is required" });
      }

      const employees = await storage.getEmployeesByWorkspace(workspaceId);
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  
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
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Extract date range filters from query params
      const weekStart = req.query.weekStart as string | undefined;
      const weekEnd = req.query.weekEnd as string | undefined;
      
      // Check if user is platform staff (root_admin/sysop) for diagnostic access
      const platformRole = await getUserPlatformRole(userId);
      if (platformRole === 'root_admin' || platformRole === 'sysop' || platformRole === 'support_manager') {
        // Platform staff: optional workspace filter for diagnostics
        const requestedWorkspaceId = req.query.workspaceId as string | undefined;
        if (requestedWorkspaceId) {
          let shifts = await storage.getShiftsByWorkspace(requestedWorkspaceId);
          
          // Apply date range filter if provided
          if (weekStart && weekEnd) {
            const startDate = new Date(weekStart);
            const endDate = new Date(weekEnd);
            shifts = shifts.filter(shift => {
              const shiftStart = new Date(shift.startTime);
              return shiftStart >= startDate && shiftStart <= endDate;
            });
          }
          
          return res.json(shifts);
        }
        // No workspace specified: return first workspace's shifts (diagnostic mode)
        const allWorkspaces = await db.select().from(workspaces).limit(1);
        if (allWorkspaces.length > 0) {
          let shifts = await storage.getShiftsByWorkspace(allWorkspaces[0].id);
          
          // Apply date range filter if provided
          if (weekStart && weekEnd) {
            const startDate = new Date(weekStart);
            const endDate = new Date(weekEnd);
            shifts = shifts.filter(shift => {
              const shiftStart = new Date(shift.startTime);
              return shiftStart >= startDate && shiftStart <= endDate;
            });
          }
          
          return res.json(shifts);
        }
        return res.json([]);
      }
      
      // Regular workspace member: resolve workspace via RBAC
      const requestedWorkspaceId = req.query.workspaceId as string | undefined;
      const { workspaceId, role, error } = await resolveWorkspaceForUser(userId, requestedWorkspaceId);
      
      if (!workspaceId || !role) {
        return res.status(403).json({ error: error || 'No workspace access found' });
      }
      
      // All workspace roles can view shifts (owner, manager, admin, supervisor, staff)
      let shifts = await storage.getShiftsByWorkspace(workspaceId);
      
      // Apply date range filter if provided (for weekly schedule view)
      if (weekStart && weekEnd) {
        const startDate = new Date(weekStart);
        const endDate = new Date(weekEnd);
        shifts = shifts.filter(shift => {
          const shiftStart = new Date(shift.startTime);
          return shiftStart >= startDate && shiftStart <= endDate;
        });
      }
      
      res.json(shifts);
    } catch (error) {
      console.error("Error fetching shifts:", error);
      res.status(500).json({ message: "Failed to fetch shifts" });
    }
  });

  
  app.get('/api/schedules/week/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const weekStart = req.query.weekStart as string;
      
      if (!weekStart) {
        return res.status(400).json({ message: "weekStart query parameter required (ISO date string)" });
      }
      
      // Calculate week range
      const startDate = new Date(weekStart);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
      
      // Fetch all shifts for the week
      const shifts = await storage.getShiftsByWorkspace(
        workspaceId,
        startDate,
        endDate
      );
      
      // Fetch all employees to get hourly rates
      const employees = await storage.getEmployeesByWorkspace(workspaceId);
      const employeeMap = new Map(employees.map(e => [e.id, e]));
      
      // Calculate stats
      let totalHours = 0;
      let totalCost = 0;
      let overtimeHours = 0;
      let openShifts = 0;
      
      // Track hours per employee for overtime calculation
      const employeeHours = new Map<string, number>();
      
      for (const shift of shifts) {
        const start = new Date(shift.startTime);
        const end = new Date(shift.endTime);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        
        if (shift.status === 'open' || !shift.employeeId) {
          openShifts++;
        } else {
          totalHours += hours;
          
          // Track employee hours
          const empHours = employeeHours.get(shift.employeeId) || 0;
          employeeHours.set(shift.employeeId, empHours + hours);
          
          // Calculate cost
          const employee = employeeMap.get(shift.employeeId);
          if (employee?.hourlyRate) {
            totalCost += hours * parseFloat(employee.hourlyRate.toString());
          }
        }
      }
      
      // Calculate overtime (hours > 40 per week per employee)
      for (const [employeeId, hours] of employeeHours.entries()) {
        if (hours > 40) {
          overtimeHours += hours - 40;
        }
      }
      
      res.json({
        weekStart: startDate.toISOString(),
        weekEnd: endDate.toISOString(),
        totalHours: Math.round(totalHours * 10) / 10,
        totalCost: Math.round(totalCost * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        openShifts,
        shiftsCount: shifts.length,
      });
      
    } catch (error) {
      console.error("Error calculating week stats:", error);
      res.status(500).json({ message: "Failed to calculate week stats" });
    }
  });

  
  app.post('/api/shifts/:id/ai-fill', requireAuth, requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const shiftId = req.params.id;

      // Get the open shift
      const shift = await storage.getShift(shiftId, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // Verify it's an open shift
      if (shift.employeeId || shift.status !== 'open') {
        return res.status(400).json({ message: "Shift is already assigned or not an open shift" });
      }

      // STEP 1: Score employees using weighted algorithm
      const { scoreEmployeesForShift, getTopCandidates, formatCandidatesForAI } = await import('./services/automation/employeeScoring');
      
      console.log(`[AI Fill] Scoring employees for shift ${shiftId}...`);
      
      const scoredCandidates = await scoreEmployeesForShift(workspaceId, {
        shiftId,
        requiredSkills: shift.requiredSkills || [],
        requiredCertifications: shift.requiredCertifications || [],
        maxDistance: 50,
        maxPayRate: shift.maxPayRate ? parseFloat(shift.maxPayRate) : undefined,
      });

      if (scoredCandidates.length === 0) {
        return res.status(400).json({ 
          message: "No qualified employees available for this shift",
          details: "All employees filtered out due to availability, credentials, or distance constraints"
        });
      }

      console.log(`[AI Fill] Found ${scoredCandidates.length} qualified candidates`);
      
      // STEP 2: Get top 5 candidates for Gemini review
      const topCandidates = getTopCandidates(scoredCandidates, 5);
      console.log(`[AI Fill] Top candidate scores:`, topCandidates.map(c => ({
        name: `${c.firstName} ${c.lastName}`,
        score: (c.compositeScore * 100).toFixed(1) + '%'
      })));

      // STEP 3: Use Smart AI to find best employee from top candidates
      // CRITICAL: Use fullEmployee from scored candidates to ensure only vetted employees reach Gemini
      // This prevents unqualified employees from slipping through after hard filters were applied
      const { scheduleSmartAI } = await import('./services/scheduleSmartAI');
      
      // Extract vetted employee objects from scored candidates (NO re-fetching!)
      const vettedEmployees = topCandidates.map(c => c.fullEmployee);

      const result = await scheduleSmartAI({
        openShifts: [shift],
        availableEmployees: vettedEmployees,
        workspaceId,
        userId: req.user!.id,
        constraints: {
          hardConstraints: {
            respectAvailability: true,
            preventDoubleBooking: true,
            enforceRestPeriods: true,
            respectTimeOffRequests: true,
          },
          softConstraints: {
            preferExperience: true,
            balanceWorkload: true,
            respectPreferences: true,
          },
          predictiveMetrics: {
            enableReliabilityScoring: true,
            penalizeLateHistory: true,
            considerAbsenteeismRisk: true,
          }
        },
        // Pass scoring context to Gemini
        scoringContext: formatCandidatesForAI(topCandidates)
      });

      // Check if AI found a suitable assignment
      if (result.assignments.length === 0) {
        return res.status(400).json({ 
          message: "Smart AI could not find a suitable employee for this shift",
          unassignedShifts: result.unassignedShifts,
          summary: result.summary
        });
      }

      const assignment = result.assignments[0];

      // Update shift with AI assignment
      const updatedShift = await storage.updateShift(shiftId, workspaceId, {
        employeeId: assignment.employeeId,
        status: 'draft', // Changed from 'open' to 'draft'
        aiGenerated: true,
        aiConfidenceScore: assignment.confidence.toString(),
      });

      // 📡 REAL-TIME: Broadcast shift update
      broadcastShiftUpdate(workspaceId, 'shift_updated', updatedShift!);

      // 🔔 NOTIFICATION: Notify assigned employee
      const employee = employees.find(e => e.id === assignment.employeeId);
      if (employee?.email && updatedShift) {
        const startTime = new Date(updatedShift.startTime).toLocaleString('en-US', {
          dateStyle: 'full',
          timeStyle: 'short'
        });
        const endTime = new Date(updatedShift.endTime).toLocaleString('en-US', {
          timeStyle: 'short'
        });

        sendShiftAssignmentEmail(employee.email, {
          employeeName: `${employee.firstName} ${employee.lastName}`,
          shiftTitle: updatedShift.title || 'Shift',
          startTime,
          endTime,
        }).catch(err => console.error('Failed to send AI assignment email:', err));

        const shiftDate = new Date(updatedShift.startTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        await notificationHelpers.createShiftAssignedNotification(
          { storage, broadcastNotification },
          {
            workspaceId,
            userId: employee.id,
            shiftId: updatedShift.id,
            shiftTitle: updatedShift.title || 'Shift',
            shiftDate,
            assignedBy: req.user!.id,
          }
        ).catch(err => console.error('Failed to create AI assignment notification:', err));
      }

      res.json({
        success: true,
        shift: updatedShift,
        assignment: {
          employeeId: assignment.employeeId,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
          confidence: assignment.confidence,
          reasoning: assignment.reasoning,
        },
        aiConfidence: result.overallConfidence,
        message: "Smart AI successfully assigned employee to shift"
      });
    } catch (error: any) {
      console.error("Error in AI Fill:", error);
      res.status(500).json({ message: error.message || "Failed to auto-assign shift" });
    }
  });

  app.post('/api/shifts/:id/fill-request', requireAuth, requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const shiftId = req.params.id;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Get the open shift
      const shift = await storage.getShift(shiftId, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // Verify it's an open shift
      if (shift.employeeId || shift.status !== 'open') {
        return res.status(400).json({ message: "Shift is already assigned or not an open shift" });
      }

      console.log(`[Fill Request] Searching contractor pool for shift ${shiftId}...`);

      // Create shift request record
      const shiftRequest = await db.insert(shiftRequests).values({
        workspaceId,
        shiftId,
        requestReason: req.body.reason || "No qualified internal employees available",
        requiredSkills: shift.requiredSkills || [],
        preferredSkills: req.body.preferredSkills || [],
        maxPayRate: shift.maxPayRate || req.body.maxPayRate || "0",
        maxDistance: req.body.maxDistance || 50,
        status: "searching",
        createdBy: userId,
      }).returning();

      // Search contractor pool
      const contractors = await db
        .select()
        .from(contractorPool)
        .where(
          and(
            eq(contractorPool.isActive, true),
            gte(contractorPool.maxDistanceWilling, req.body.maxDistance || 50)
          )
        );

      if (contractors.length === 0) {
        await db.update(shiftRequests)
          .set({ status: "no_matches", completedAt: new Date() })
          .where(eq(shiftRequests.id, shiftRequest[0].id));

        return res.status(404).json({
          message: "No contractors found matching criteria",
          shiftRequestId: shiftRequest[0].id
        });
      }

      console.log(`[Fill Request] Found ${contractors.length} potential contractors`);

      // Score contractors (simplified scoring for now)
      const scoredContractors = contractors.map(contractor => {
        let score = 0.5; // Base score

        // Distance bonus
        const maxDist = req.body.maxDistance || 50;
        if (contractor.maxDistanceWilling && contractor.maxDistanceWilling >= maxDist) {
          score += 0.2;
        }

        // Pay rate bonus (lower rate is better for margin)
        const maxPay = parseFloat(shift.maxPayRate || req.body.maxPayRate || "100");
        const contractorRate = parseFloat(contractor.minHourlyRate);
        if (contractorRate <= maxPay) {
          score += 0.15;
        }

        // Last minute availability
        if (contractor.availableForLastMinute) {
          score += 0.15;
        }

        return {
          contractor,
          score: Math.min(score, 1.0),
          matchReasons: [
            contractor.availableForLastMinute && "Available for last-minute shifts",
            contractorRate <= maxPay && `Rate within budget ($${contractorRate}/hr)`,
            contractor.maxDistanceWilling >= maxDist && `Willing to travel (${contractor.maxDistanceWilling} miles)`,
          ].filter(Boolean) as string[]
        };
      });

      // Sort by score
      scoredContractors.sort((a, b) => b.score - a.score);

      // Send offers to top 3 contractors
      const topContractors = scoredContractors.slice(0, 3);
      const offers = [];

      // Generate response tokens for contractors
      const { generateResponseToken } = await import('./utils/contractorTokens');

      for (const { contractor, score, matchReasons } of topContractors) {
        const offeredRate = parseFloat(contractor.minHourlyRate) * 1.1; // 10% markup
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // SECURITY FIX: Generate opaque UUID token FIRST (no offerId exposure!)
        const responseToken = generateResponseToken();

        // Create offer with token included (single atomic operation - cleaner than UPDATE after INSERT)
        const offer = await db.insert(shiftOffers).values({
          shiftRequestId: shiftRequest[0].id,
          shiftId,
          contractorId: contractor.id,
          offeredPayRate: offeredRate.toString(),
          matchScore: score.toString(),
          matchReasons: matchReasons,
          status: "pending",
          expiresAt,
          responseToken, // Token already generated (opaque UUID - no offerId exposure)
        }).returning();

        offers.push({
          offerId: offer[0].id,
          contractorName: `${contractor.firstName} ${contractor.lastName}`,
          offeredRate,
          matchScore: (score * 100).toFixed(1) + '%',
          matchReasons,
        });

        console.log(`[Fill Request] Sent offer to ${contractor.firstName} ${contractor.lastName} - Score: ${(score * 100).toFixed(1)}%`);
      }

      // Update shift request with offer count
      await db.update(shiftRequests)
        .set({
          status: "offers_sent",
          offersCount: offers.length
        })
        .where(eq(shiftRequests.id, shiftRequest[0].id));

      res.json({
        success: true,
        shiftRequestId: shiftRequest[0].id,
        offersCount: offers.length,
        offers,
        message: `Sent ${offers.length} offers to qualified contractors`
      });
    } catch (error: any) {
      console.error("Error creating fill request:", error);
      res.status(500).json({ message: error.message || "Failed to create fill request" });
    }
  });

  app.post('/api/shift-offers/:id/respond', async (req, res) => {
    try {
      const offerId = req.params.id;
      const { action, token } = req.body; // action: "accept" | "decline"
      
      if (!action || !token) {
        return res.status(400).json({ message: "Missing action or token" });
      }
      
      if (action !== 'accept' && action !== 'decline') {
        return res.status(400).json({ message: "Invalid action. Must be 'accept' or 'decline'" });
      }
      
      // SECURITY FIX 1: Validate token format (opaque UUID)
      const { validateResponseTokenFormat } = await import('./utils/contractorTokens');
      const formatValidation = validateResponseTokenFormat(token);
      
      if (!formatValidation.valid) {
        console.warn(`[Security] Invalid token format attempt: offer ${offerId}`);
        return res.status(403).json({ message: formatValidation.error || "Invalid token" });
      }
      
      console.log(`[Contractor Response] Offer ${offerId} - Action: ${action}`);
      
      // SECURITY FIX 2: Database lookup with token AND workspace validation (prevents cross-tenant replay)
      const offerResult = await db
        .select({
          offer: shiftOffers,
          request: shiftRequests,
          shift: shifts,
        })
        .from(shiftOffers)
        .innerJoin(shiftRequests, eq(shiftOffers.shiftRequestId, shiftRequests.id))
        .innerJoin(shifts, eq(shiftOffers.shiftId, shifts.id))
        .where(and(
          eq(shiftOffers.id, offerId),
          eq(shiftOffers.responseToken, token), // Token must match (prevents replay with wrong token)
          eq(shifts.workspaceId, shiftRequests.workspaceId) // Workspace consistency (referential integrity check)
        ))
        .limit(1);
      
      if (!offerResult || offerResult.length === 0) {
        console.warn(`[Security] Invalid offer/token combination: offer ${offerId}`);
        return res.status(404).json({ message: "Offer not found or invalid token" });
      }
      
      const { offer: currentOffer, request: shiftRequest, shift } = offerResult[0];
      const workspaceId = shiftRequest.workspaceId;
      
      // Additional workspace consistency validation (defense in depth)
      if (shift.workspaceId !== workspaceId) {
        console.error(`[Security] Cross-tenant data inconsistency detected: offer ${offerId}`);
        return res.status(403).json({ message: "Data integrity violation" });
      }
      
      // Check offer status
      if (currentOffer.status !== 'pending') {
        return res.status(400).json({ 
          message: `Offer already ${currentOffer.status}`,
          currentStatus: currentOffer.status
        });
      }
      
      // Check expiry
      if (new Date() > new Date(currentOffer.expiresAt)) {
        // Mark expired atomically
        await db.update(shiftOffers)
          .set({ 
            status: 'expired', 
            respondedAt: new Date(),
            responseToken: null // SECURITY FIX 3: Invalidate token
          })
          .where(and(
            eq(shiftOffers.id, offerId),
            eq(shiftOffers.responseToken, token) // Ensure token still matches
          ));
        
        return res.status(400).json({ message: "Offer has expired" });
      }
      
      // ACTION: ACCEPT - PROPER DRIZZLE TRANSACTION for true atomicity
      if (action === 'accept') {
        // Use Drizzle transaction to ensure all-or-nothing atomicity
        const result = await db.transaction(async (tx) => {
          // 1. Update offer status with optimistic concurrency check + token invalidation
          const updateResult = await tx.update(shiftOffers)
            .set({ 
              status: 'accepted', 
              respondedAt: new Date(),
              onboardingStarted: true,
              responseToken: null // SECURITY FIX 3: Invalidate token (single-use)
            })
            .where(and(
              eq(shiftOffers.id, offerId),
              eq(shiftOffers.status, 'pending'), // Optimistic lock - prevent double acceptance
              eq(shiftOffers.responseToken, token) // Token must still match (prevent concurrent use)
            ))
            .returning();
          
          // SECURITY FIX 4: Verify update succeeded (validate row count to prevent silent failures)
          if (!updateResult || updateResult.length === 0) {
            throw new Error('Offer was already accepted, token invalid, or concurrent modification detected');
          }
          
          // 2. Create contractor assignment
          const assignment = await tx.insert(contractorAssignments).values({
            workspaceId: workspaceId,
            shiftId: currentOffer.shiftId,
            contractorId: currentOffer.contractorId,
            shiftOfferId: offerId,
            assignedRate: currentOffer.offeredPayRate,
            assignedBy: shiftRequest.createdBy,
            status: 'active',
          }).returning();
          
          // 3. Update shift status
          await tx.update(shifts)
            .set({ 
              status: 'contractor_assigned',
              notes: sql`COALESCE(${shifts.notes}, '') || ${'\n\nContractor assigned via marketplace (Offer ' + offerId + ')'}`,
            })
            .where(and(
              eq(shifts.id, currentOffer.shiftId),
              eq(shifts.workspaceId, workspaceId) // Workspace guard
            ));
          
          // 4. Decline all other pending offers for this shift (atomic cascade + token invalidation)
          await tx.update(shiftOffers)
            .set({ 
              status: 'declined', 
              respondedAt: new Date(),
              responseToken: null // Invalidate tokens on auto-decline
            })
            .where(and(
              eq(shiftOffers.shiftId, currentOffer.shiftId),
              eq(shiftOffers.status, 'pending'),
              sql`${shiftOffers.id} != ${offerId}`
            ));
          
          // 5. Update shift request status
          await tx.update(shiftRequests)
            .set({ 
              status: 'filled',
              completedAt: new Date()
            })
            .where(and(
              eq(shiftRequests.id, currentOffer.shiftRequestId),
              eq(shiftRequests.workspaceId, workspaceId) // Workspace guard
            ));
          
          return { assignment: assignment[0] };
        });
        
        // 6. ONBOARDING - Create checklist and notify manager
        const contractor = await db.select().from(contractorPool).where(eq(contractorPool.id, currentOffer.contractorId)).limit(1);
        
        if (contractor && contractor[0]) {
          console.log(`[Onboarding] Starting onboarding for contractor ${contractor[0].firstName} ${contractor[0].lastName}`);
          
          // Create onboarding checklist with default items
          const DEFAULT_ONBOARDING_ITEMS = [
            { itemId: '1', itemName: 'Welcome packet', itemType: 'document' as const, isRequired: true, isCompleted: false },
            { itemId: '2', itemName: 'I-9 verification', itemType: 'form' as const, isRequired: true, isCompleted: false },
            { itemId: '3', itemName: 'W-4 tax form', itemType: 'form' as const, isRequired: true, isCompleted: false },
            { itemId: '4', itemName: 'Safety training', itemType: 'certification' as const, isRequired: true, isCompleted: false },
            { itemId: '5', itemName: 'Equipment orientation', itemType: 'task' as const, isRequired: true, isCompleted: false },
            { itemId: '6', itemName: 'Direct manager meeting', itemType: 'task' as const, isRequired: false, isCompleted: false },
          ];
          
          try {
            await storage.createOnboardingChecklist({
              workspaceId,
              applicationId: currentOffer.applicationId,
              employeeId: result.assignment.employeeId,
              templateId: null,
              checklistItems: DEFAULT_ONBOARDING_ITEMS,
              overallProgress: 0,
              i9DeadlineDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 business days
            });
            
            // Notify manager via email
            const manager = await storage.getEmployee(shift.assignedManagerId || '', workspaceId);
            if (manager && manager.email) {
              await emailService.sendManagerOnboardingNotification(
                workspaceId,
                manager.id,
                manager.email,
                `${contractor[0].firstName} ${contractor[0].lastName}`
              );
            }
            
            console.log(`[Onboarding] Checklist created and manager notified for ${contractor[0].firstName}`);
          } catch (error) {
            console.error(`[Onboarding] Error creating checklist:`, error);
          }
        }
        
        // 📡 Broadcast shift update (post-transaction, idempotent)
        broadcastShiftUpdate(workspaceId, 'shift_updated', shift);
        
        return res.json({
          success: true,
          action: 'accepted',
          assignment: result.assignment,
          message: "Offer accepted! Assignment created and onboarding started."
        });
      }
      
      // ACTION: DECLINE - TRANSACTION with workspace guards and token invalidation
      if (action === 'decline') {
        // Use Drizzle transaction for atomic decline workflow
        await db.transaction(async (tx) => {
          // 1. Update offer status with token invalidation
          const updateResult = await tx.update(shiftOffers)
            .set({ 
              status: 'declined', 
              respondedAt: new Date(),
              responseToken: null // SECURITY FIX 3: Invalidate token (single-use)
            })
            .where(and(
              eq(shiftOffers.id, offerId),
              eq(shiftOffers.status, 'pending'), // Optimistic lock
              eq(shiftOffers.responseToken, token) // Token must still match
            ))
            .returning();
          
          // SECURITY FIX 4: Verify update succeeded
          if (!updateResult || updateResult.length === 0) {
            throw new Error('Offer was already declined, token invalid, or concurrent modification detected');
          }
          
          // 2. Check if all offers for this shift are now declined/expired
          const allOffers = await tx
            .select()
            .from(shiftOffers)
            .where(eq(shiftOffers.shiftId, currentOffer.shiftId));
          
          const pendingCount = allOffers.filter(o => o.status === 'pending').length;
          
          // 3. If no pending offers remain, mark request as exhausted
          if (pendingCount === 0) {
            await tx.update(shiftRequests)
              .set({ 
                status: 'all_declined',
                completedAt: new Date()
              })
              .where(and(
                eq(shiftRequests.id, currentOffer.shiftRequestId),
                eq(shiftRequests.workspaceId, workspaceId) // Workspace guard
              ));
            
            console.log(`[Contractor Response] All offers declined for shift ${currentOffer.shiftId}`);
            
            // Notify manager to re-run search or expand criteria (async, outside transaction)
            const shiftRequest = await storage.getShiftRequest(currentOffer.shiftRequestId, workspaceId);
            if (shiftRequest?.createdBy) {
              setImmediate(async () => {
                try {
                  const creator = await storage.getUser(shiftRequest.createdBy);
                  if (creator?.email) {
                    await emailService.sendEmail(
                      creator.email,
                      'Shift Staffing Alert - No Available Contractors',
                      `
                        <div style="font-family: Arial, sans-serif; max-width: 600px;">
                          <h2 style="color: #dc2626;">Shift Staffing Alert</h2>
                          <p>All contractors have declined the shift request.</p>
                          <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                            <p style="margin: 5px 0;"><strong>Shift ID:</strong> ${currentOffer.shiftId}</p>
                            <p style="margin: 5px 0;"><strong>Status:</strong> All offers declined</p>
                            <p style="margin: 15px 0 0 0;">Please review your search criteria and try again with expanded parameters.</p>
                          </div>
                          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                            This is an automated notification from CoAIleague.
                          </p>
                        </div>
                      `,
                      'shift_staffing_alert',
                      workspaceId
                    ).catch(err => console.error('[Shift Alert] Failed to send email:', err.message));
                  }
                } catch (err) {
                  console.error('[Shift Alert] Error notifying manager:', err);
                }
              });
            }
          }
        });
        
        return res.json({
          success: true,
          action: 'declined',
          message: "Offer declined. Thank you for your response."
        });
      }
      
    } catch (error: any) {
      console.error("Error processing contractor response:", error);
      res.status(500).json({ message: error.message || "Failed to process response" });
    }
  });

  // Employee acknowledges AI-generated shift
  app.post('/api/shifts/:id/acknowledge', requireAuth, requireEmployee, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const employeeId = req.employeeId;

      const shift = await storage.getShift(req.params.id, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // OWNERSHIP CHECK: Employee can only acknowledge their own shifts
      if (shift.employeeId !== employeeId) {
        return res.status(403).json({ message: "You can only acknowledge shifts assigned to you" });
      }

      // Update shift with acknowledgment
      const updated = await storage.updateShift(req.params.id, workspaceId, {
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

  
  // Toggle SmartSchedule AI (Managers/Admins only) - Persists to DB
  app.post('/api/scheduleos/ai/toggle', isAuthenticated, requireManager, async (req: any, res) => {
    try {
      const { enabled, workspaceId } = req.body;
      const userId = req.user.claims.sub;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId is required" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      // Read actual prior state for accurate audit trail
      const priorEnabled = workspace.feature_scheduleos_enabled ?? false;
      
      // Transaction: Persist to database + audit log atomically
      const { billingAuditLog } = await import("@shared/schema");
      await db.transaction(async (tx) => {
        // Update workspace state
        const activationTimestamp = enabled ? new Date() : null;
        await tx.update(workspaces).set({
          feature_scheduleos_enabled: enabled,
          scheduleosActivatedAt: enabled ? activationTimestamp : null, // Clear when disabled
          scheduleosActivatedBy: enabled ? userId : null, // Clear when disabled
        }).where(eq(workspaces.id, workspaceId));
        
        // Log feature toggle in audit log with accurate prior state
        await tx.insert(billingAuditLog).values({
          workspaceId,
          eventType: 'feature_toggled',
          eventCategory: 'feature',
          actorType: 'user',
          actorId: userId,
          description: `${enabled ? 'Enabled' : 'Disabled'} SmartSchedule AI automation`,
          relatedEntityType: 'feature',
          relatedEntityId: 'scheduleos_ai',
          previousState: { enabled: priorEnabled }, // Actual prior state
          newState: { enabled }, // New state
          metadata: {
            feature: 'scheduleos_ai',
            workspaceName: workspace.name,
            activatedAt: activationTimestamp, // Use same timestamp
            priorActivatedAt: workspace.scheduleosActivatedAt,
            priorActivatedBy: workspace.scheduleosActivatedBy,
          },
        });
      });
      
      console.log(`🤖 SmartSchedule AI ${enabled ? 'ENABLED' : 'DISABLED'} for workspace: ${workspace.name} by user: ${userId}`);
      res.json({ success: true, enabled, message: `SmartSchedule AI ${enabled ? 'enabled' : 'disabled'}`, workspaceId, workspaceName: workspace.name });
    } catch (error: any) {
      console.error("Error toggling SmartSchedule AI:", error);
      res.status(500).json({ message: "Failed to toggle AI" });
    }
  });

  const scheduleSmartAIRequestSchema = z.object({
    openShiftIds: z.array(z.string()).min(1, "At least one shift ID is required"),
    availableEmployeeIds: z.array(z.string()).min(1, "At least one employee ID is required"),
    constraints: z.object({
      maxShiftsPerEmployee: z.number().int().positive().optional(),
      requiredSkills: z.array(z.string()).optional(),
      preferExperience: z.boolean().optional(),
      balanceWorkload: z.boolean().optional()
    }).optional()
  });

  app.post('/api/schedule-smart-ai', requireAuth, requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const workspaceId = user.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: "No workspace selected" });
    }
  });

  app.get('/api/shifts/:shiftId/acknowledgments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;

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

  
  // Create policy (Manager/Admin only)
  app.post('/api/policies', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
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
    try {
      const workspaceId = req.workspaceId!;
      const shiftId = req.params.id;
      
      // Get shift data
      const shift = await storage.getShift(shiftId, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      // Get shift creator info
      let creatorInfo = null;
      if (shift.createdAt) {
        // Note: shifts don't have createdBy field, using workspace owner as fallback
        const workspace = await storage.getWorkspace(workspaceId);
        if (workspace) {
          const owner = await storage.getUser(workspace.ownerId);
          if (owner) {
            creatorInfo = {
              name: owner.displayName || owner.email,
              email: owner.email,
              role: 'owner'
            };
          }
        }
      }
      
      // Get employee who took the shift
      let employeeInfo = null;
      if (shift.employeeId) {
        const employee = await storage.getEmployeeById(shift.employeeId);
        if (employee) {
          employeeInfo = {
            id: employee.id,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            phone: employee.phoneNumber
          };
        }
      }
      
      // Get all time entries for this shift
      const allTimeEntries = await storage.getTimeEntriesByWorkspace(workspaceId);
      const shiftTimeEntries = allTimeEntries.filter(te => te.shiftId === shiftId);
      
      // Aggregate time entry data (clock in/out, GPS, total time)
      const timeTrackingData = shiftTimeEntries.map(te => ({
        id: te.id,
        clockIn: te.clockIn,
        clockOut: te.clockOut,
        totalHours: te.totalHours,
        totalAmount: te.totalAmount,
        status: te.status,
        notes: te.notes,
        gps: {
          clockIn: {
            latitude: te.clockInLatitude,
            longitude: te.clockInLongitude,
            accuracy: te.clockInAccuracy,
            ipAddress: te.clockInIpAddress
          },
          clockOut: {
            latitude: te.clockOutLatitude,
            longitude: te.clockOutLongitude,
            accuracy: te.clockOutAccuracy,
            ipAddress: te.clockOutIpAddress
          },
          jobSite: {
            latitude: te.jobSiteLatitude,
            longitude: te.jobSiteLongitude,
            address: te.jobSiteAddress
          }
        },
        createdAt: te.createdAt,
        updatedAt: te.updatedAt
      }));
      
      // Get timesheet edit discrepancies for this shift's time entries
      const timeEntryIds = shiftTimeEntries.map(te => te.id);
      const allDiscrepancies = await storage.getTimeEntryDiscrepancies(workspaceId, {});
      const shiftDiscrepancies = allDiscrepancies.filter(d => 
        timeEntryIds.includes(d.timeEntryId)
      );
      
      // Calculate summary stats
      const totalHours = shiftTimeEntries.reduce((sum, te) => {
        return sum + (parseFloat(te.totalHours as string || "0"));
      }, 0);
      
      const totalAmount = shiftTimeEntries.reduce((sum, te) => {
        return sum + (parseFloat(te.totalAmount as string || "0"));
      }, 0);
      
      // Aggregate audit data
      const auditData = {
        shift: {
          id: shift.id,
          title: shift.title,
          description: shift.description,
          startTime: shift.startTime,
          endTime: shift.endTime,
          status: shift.status,
          aiGenerated: shift.aiGenerated,
          requiresAcknowledgment: shift.requiresAcknowledgment,
          acknowledgedAt: shift.acknowledgedAt,
          deniedAt: shift.deniedAt,
          denialReason: shift.denialReason,
          billableToClient: shift.billableToClient,
          hourlyRateOverride: shift.hourlyRateOverride,
          createdAt: shift.createdAt,
          updatedAt: shift.updatedAt
        },
        creator: creatorInfo,
        employee: employeeInfo,
        timeTracking: timeTrackingData,
        discrepancies: shiftDiscrepancies,
        summary: {
          totalTimeEntries: shiftTimeEntries.length,
          totalHours: totalHours.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          totalDiscrepancies: shiftDiscrepancies.length,
          hasGpsAnomalies: shiftDiscrepancies.some(d => d.discrepancyType === 'gps_anomaly'),
          hasIpAnomalies: shiftDiscrepancies.some(d => d.discrepancyType === 'ip_anomaly')
        }
      };
      
      res.json(auditData);
    } catch (error: any) {
      console.error("Error fetching shift audit data:", error);
      res.status(500).json({ message: error.message || "Failed to fetch shift audit data" });
    }
  });

  
  app.post('/api/chats/create', requireAuth, chatConversationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const {
        subject,
        chatType, // 'employee_to_employee', 'manager_to_employee', 'group', 'customer_support'
        shiftId, // Optional: link to specific shift
        participantIds, // Array of user IDs to add as participants
        guestInvitations, // Array of { name, email, phone, expiresInDays }
        conversationType // 'open_chat', 'dm_user', 'shift_chat'
      } = req.body;
      
      // Create the conversation
      const conversationData: InsertChatConversation = {
        workspaceId,
        subject: subject || 'Team Chat',
        status: 'active',
        conversationType: conversationType || 'open_chat',
        shiftId: shiftId || null,
        isEncrypted: false, // Open chats are not encrypted
        isSilenced: false // Participants can send messages
      };
      
      const conversation = await storage.createChatConversation(conversationData);
      
      // Add participants (if provided)
      const addedParticipants = [];
      if (participantIds && participantIds.length > 0) {
        for (const participantId of participantIds) {
          const participant = await storage.getUser(participantId);
          if (participant) {
            // Note: We need to add chatParticipants storage method
            // For now, just track in memory
            addedParticipants.push({
              id: participant.id,
              name: participant.displayName || participant.email,
              email: participant.email
            });
          }
        }
      }
      
      // Create guest tokens (if provided)
      const createdGuestTokens = [];
      if (guestInvitations && guestInvitations.length > 0) {
        for (const guest of guestInvitations) {
          const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (guest.expiresInDays || 7));
          
          // Note: We need to add chatGuestTokens storage method
          // For now, return token info
          createdGuestTokens.push({
            guestName: guest.name,
            guestEmail: guest.email,
            guestPhone: guest.phone,
            accessToken: token,
            expiresAt
          });
        }
      }
      
      // Send welcome system message
      const userName = user.displayName || user.email;
      const welcomeMessage = `Chat created by ${userName}. Type: ${chatType}`;
      
      await storage.createChatMessage({
        conversationId: conversation.id,
        senderId: userId,
        senderName: userName,
        senderType: 'system',
        message: welcomeMessage,
        isSystemMessage: true,
        isEncrypted: false
      });
      
      res.json({
        conversation,
        participants: addedParticipants,
        guestTokens: createdGuestTokens,
        message: "Chat created successfully"
      });
    } catch (error: any) {
      console.error("Error creating chat:", error);
      res.status(500).json({ message: error.message || "Failed to create chat" });
    }
  });

  app.get('/api/shift-chatrooms/active', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const activeChatrooms = await storage.getActiveShiftChatrooms(workspace.id);
      res.json(activeChatrooms);
    } catch (error: any) {
      console.error("Error fetching active shift chatrooms:", error);
      res.status(400).json({ message: error.message || "Failed to fetch shift chatrooms" });
    }
  });

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

  // Get employee availability (by employee ID - for managers viewing specific employee)
  app.get('/api/employees/:employeeId/availability', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      const { includeExpired } = req.query;
      const { availabilityService } = await import("./services/availabilityService");

      const availability = await availabilityService.getEmployeeAvailability(
        workspaceId,
        employeeId,
        includeExpired === 'true'
      );

      res.json(availability);
    } catch (error: any) {
      console.error('Error getting availability:', error);
      res.status(500).json({ message: error.message || 'Failed to get availability' });
    }
  });

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

  // Get all report templates (with activation status per workspace)
  app.get('/api/report-templates', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      if (!workspace) {
        return res.status(403).json({ message: "No workspace found" });
      }

      const templates = await storage.getReportTemplatesByWorkspace(workspace.id);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching report templates:", error);
      res.status(500).json({ message: "Failed to fetch report templates" });
    }
  });

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

  // ============================================================================
  // PHASE 3: CRITICAL API GAPS - Support Ticket & AI Response Management
  // ============================================================================

  // PATCH /api/support/tickets/:id/status - Explicit status updates with event emission
  app.patch('/api/support/tickets/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Validate status value
      const validStatuses = ['open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed', 'on_hold'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      // Get user to verify workspace access
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: 'No workspace selected' });
      }

      // Get the ticket
      const ticket = await storage.getSupportTicket(id, user.currentWorkspaceId);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      // Update ticket status
      const updatedTicket = await storage.updateSupportTicket(id, {
        status,
        updatedAt: new Date(),
      });

      if (!updatedTicket) {
        return res.status(500).json({ message: 'Failed to update ticket status' });
      }

      // Emit event through ChatServerHub for real-time updates
      try {
        const { ChatServerHub } = await import('./services/ChatServerHub');
        ChatServerHub.emit({
          type: 'ticket_status_changed',
          title: 'Support Ticket Status Updated',
          description: `Ticket #${ticket.ticketNumber} status changed to ${status}`,
          metadata: {
            ticketId: id,
            ticketNumber: ticket.ticketNumber,
            oldStatus: ticket.status,
            newStatus: status,
            updatedBy: userId,
            workspaceId: ticket.workspaceId,
          },
          workspaceId: ticket.workspaceId,
        });
      } catch (emitError) {
        console.error('[ChatServerHub] Failed to emit ticket_status_changed:', emitError);
        // Don't fail the entire operation if event emission fails
      }

      res.json({
        success: true,
        ticket: updatedTicket,
        message: `Ticket status updated to ${status}`,
      });
    } catch (error) {
      console.error('Error updating ticket status:', error);
      res.status(500).json({ message: 'Failed to update ticket status' });
    }
  });

  // ============================================================================

  const AALV_SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

  // GET /api/ai/audit-logs - Get AI Brain action logs (support only)
  app.get('/api/ai/audit-logs', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Check platform role for support access
      const user = await storage.getUser(userId);
      if (!user?.platformRole || !AALV_SUPPORT_ROLES.includes(user.platformRole)) {
        return res.status(403).json({ 
          message: 'Access denied. AALV requires support role access.',
          requiredRoles: AALV_SUPPORT_ROLES
        });
      }

      const { 
        actorType, 
        status, 
        categoryTag, 
        workflowId, 
        workspaceId,
        requiresHumanReview,
        startDate,
        endDate,
        limit = '100', 
        offset = '0' 
      } = req.query;

      const filters = {
        actorType: actorType ? String(actorType) : undefined,
        status: status ? String(status) : undefined,
        categoryTag: categoryTag ? String(categoryTag) : undefined,
        workflowId: workflowId ? String(workflowId) : undefined,
        workspaceId: workspaceId ? String(workspaceId) : undefined,
        requiresHumanReview: requiresHumanReview === 'true' ? true : requiresHumanReview === 'false' ? false : undefined,
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        limit: Math.min(parseInt(String(limit), 10) || 100, 500),
        offset: Math.max(parseInt(String(offset), 10) || 0, 0),
      };

      const logs = await storage.getAiBrainActionLogs(filters);

      res.json({
        success: true,
        data: logs,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          count: logs.length,
        },
      });
    } catch (error) {
      console.error('Error fetching AI Brain action logs:', error);
      res.status(500).json({ message: 'Failed to fetch AI audit logs' });
    }
  });

  app.get('/api/admin/support/lookup', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const query = String(req.query.q || '').trim();
      
      if (!query) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }

      const { supportLookup } = await import('./services/identityService');
      const results = await supportLookup(query);
      
      res.json({ results });
    } catch (error) {
      console.error("Error performing support lookup:", error);
      res.status(500).json({ message: "Failed to perform lookup" });
    }
  });

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

  // Manually create client in any workspace
  app.post('/api/admin/support/create-client', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId, clientData } = req.body;
      const adminUserId = req.user.claims.sub;
      
      const validated = insertClientSchema.parse({
        ...clientData,
        workspaceId,
      });
      
      // Link client to user if email matches existing user (normalized email matching)
      let userId: string | null = null;
      const normalizedEmail = normalizeEmail(validated.email);
      if (normalizedEmail) {
        try {
          const [matchingUser] = await db.select()
            .from(users)
            .where(sql`lower(${users.email}) = ${normalizedEmail}`)
            .limit(1);
          
          if (matchingUser) {
            userId = matchingUser.id;
            console.log(`[Admin Client Creation] Linked client to user ${matchingUser.id} via email`);
          }
        } catch (error) {
          console.error('[Admin Client Creation] Error looking up user by email:', error);
          // Continue without linking - don't fail client creation
        }
      }
      
      // Create the client with userId if found
      const client = await storage.createClient({
        ...validated,
        userId: userId || validated.userId || null,
      });
      
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
  const requireAnyAuth: RequestHandler = async (req: any, res, next) => {
    // Try session-based auth first
    if (req.session?.userId) {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
      if (user) {
        req.user = user;
        return next();
      }
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
    try {
      const { mapTicketStatusToHeaderStatus, calculateSLARemaining } = await import('@shared/helpdeskUtils');
      
      const ticketId = req.params.id;
      const user = req.user!;
      
      const employee = await storage.getEmployeeByUserId(user.id);
      
      if (!employee || !employee.workspaceId) {
        return res.status(403).json({ error: 'Forbidden - No workspace access' });
      }
      
      const workspaceId = employee.workspaceId;
      const ticket = await storage.getSupportTicket(ticketId, workspaceId);
      
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      
      if (ticket.workspaceId !== workspaceId) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      
      const isStaff = employee && ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes((employee as any).platformRole || '');
      
      if (!isStaff) {
        if (ticket.employeeId !== employee.id && ticket.clientId !== employee.id) {
          return res.status(404).json({ error: 'Ticket not found' });
        }
      }
      
      let assignedAgent: string | undefined;
      if (ticket.assignedTo) {
        const agent = await storage.getEmployeeById(ticket.assignedTo);
        assignedAgent = agent ? `${agent.firstName} ${agent.lastName}` : undefined;
      }
      
      const viewModel = {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: mapTicketStatusToHeaderStatus(ticket),
        priority: (ticket.priority || 'normal'),
        assignedAgent,
        slaRemaining: calculateSLARemaining(ticket.createdAt!, (ticket.priority || 'normal')),
        subject: ticket.subject,
        description: ticket.description,
        workspaceId: ticket.workspaceId,
        createdAt: ticket.createdAt!,
      };
      
      res.json(viewModel);
    } catch (error: any) {
      console.error('Error fetching chat ticket:', error);
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  });

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
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
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

  // AI Knowledge Retrieval - Ask questions about policies, procedures, FAQs
  app.post('/api/knowledge/ask', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
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
            content: `You are a helpful HR assistant for CoAIleague™. Answer employee questions about company policies, procedures, and benefits using the provided knowledge base. Be concise, friendly, and accurate. If you don't know the answer, say so and suggest contacting HR.`
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

  app.post('/api/predict/turnover', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
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

  
  // [1] TRAINING COURSES - CRUD operations
  
  // Get all training courses
  app.get('/api/training/courses', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
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

  
  // [1] BUDGETS - CRUD operations
  
  // Get all budgets
  app.get('/api/budgets', requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
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

  // POST /api/search - AI-powered natural language search across all data
  app.post("/api/search", requireAuth, async (req, res) => {
    try {
      const { workspaceId, userId } = req;
      const { query, searchType = 'all' } = req.body;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ message: "Search query is required" });
      }

      const startTime = Date.now();
      let aiTokensUsed = 0;
      
      // Initialize OpenAI for semantic search
      const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      const useAI = !!aiApiKey && aiApiKey !== '_DUMMY_API_KEY_';
      
      const results: any = {
        employees: [],
        clients: [],
        invoices: [],
        timeEntries: [],
        shifts: [],
      };

      if (useAI) {
        // AI-POWERED SEMANTIC SEARCH
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
          apiKey: aiApiKey,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        // Use GPT-3.5 to understand the query intent
        const aiResponse = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'system',
            content: 'You are AI Records™, an AI search assistant. Convert natural language queries to structured search criteria. Extract: entity type (employees/clients/invoices/shifts), search terms, filters (dates, amounts, status). Respond with JSON only.'
          }, {
            role: 'user',
            content: `Parse this search query: "${query}"`
          }],
          temperature: 0.3,
          max_tokens: 200,
        });

        aiTokensUsed = aiResponse.usage?.total_tokens || 0;

        // Extract search keywords from AI response
        const aiContent = aiResponse.choices[0]?.message?.content || '{}';
        let searchCriteria: any = {};
        try {
          searchCriteria = JSON.parse(aiContent);
        } catch {
          // Fallback to keyword extraction
          searchCriteria = { keywords: query.toLowerCase().split(' ') };
        }

        console.log('[AI Records™ AI] Search criteria:', searchCriteria);
      }

      // Perform intelligent searches
      if (searchType === 'all' || searchType === 'employees') {
        const employeeResults = await db.query.employees.findMany({
          where: (employees, { eq, and, or, ilike }) => and(
            eq(employees.workspaceId, workspaceId!),
            or(
              ilike(employees.firstName, `%${query}%`),
              ilike(employees.lastName, `%${query}%`),
              ilike(employees.email, `%${query}%`),
              ilike(employees.position, `%${query}%`)
            )
          ),
          limit: 10,
        });
        results.employees = employeeResults;
      }

      if (searchType === 'all' || searchType === 'clients') {
        const clientResults = await db.query.clients.findMany({
          where: (clients, { eq, and, or, ilike }) => and(
            eq(clients.workspaceId, workspaceId!),
            or(
              ilike(clients.name, `%${query}%`),
              ilike(clients.contactEmail, `%${query}%`),
              ilike(clients.industry, `%${query}%`)
            )
          ),
          limit: 10,
        });
        results.clients = clientResults;
      }

      const executionTimeMs = Date.now() - startTime;

      // Log search with AI tracking
      await db.insert(searchQueries).values({
        workspaceId,
        userId,
        query,
        searchType,
        resultsCount: Object.values(results).flat().length,
        executionTimeMs,
        aiProcessed: useAI,
      });

      // Track AI usage for billing
      if (aiTokensUsed > 0) {
        await db.insert(aiUsage).values({
          workspaceId,
          userId,
          feature: 'recordos_search',
          model: 'gpt-3.5-turbo',
          tokensUsed: aiTokensUsed,
          estimatedCost: (aiTokensUsed / 1000) * 0.002, // $0.002 per 1K tokens
        });
      }

      res.json({
        results,
        metadata: {
          totalResults: Object.values(results).flat().length,
          executionTimeMs,
          query,
          searchType,
          aiPowered: useAI,
          tokensUsed: aiTokensUsed,
        },
      });
    } catch (error) {
      console.error("Error performing AI search:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  /**
   * DEVELOPMENT ONLY: Seed expired idempotency keys for cleanup testing
   * Creates test keys with createdAt in the past to verify cleanup cron
   */
  app.post('/api/dev/seed-expired-keys', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const { count = 5, daysOld = 65 } = req.body;
      const workspaceId = req.workspaceId!;
      const { idempotencyKeys } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // Generate expired test keys
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - daysOld);
      
      // Backdate expiresAt to match createdAt + TTL (makes keys truly expired)
      const expiredExpiresAt = new Date(expiredDate);
      expiredExpiresAt.setDate(expiredExpiresAt.getDate() + 1); // createdAt + 1 day TTL
      
      const seededKeys = [];
      for (let i = 0; i < count; i++) {
        const result = await db.insert(idempotencyKeys).values({
          workspaceId,
          operationType: 'test_cleanup',
          requestFingerprint: `test-expired-${Date.now()}-${i}`,
          status: 'completed',
          expiresAt: expiredExpiresAt, // Backdated to be truly expired
          createdAt: expiredDate, // 65 days old
          statusVersion: 1,
        }).returning({ id: idempotencyKeys.id });
        
        if (result[0]) {
          seededKeys.push(result[0].id);
        }
      }
      
      res.json({
        success: true,
        message: `Seeded ${count} expired idempotency keys`,
        keys: seededKeys,
        daysOld,
        expirationDate: expiredDate.toISOString(),
      });
    } catch (error: any) {
      console.error('[DEV] Error seeding expired keys:', error);
      res.status(500).json({ message: 'Failed to seed expired keys' });
    }
  });

  app.get('/api/comm-os/rooms', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId;
      const userRole = req.user!.role;
      const platformRole = (req.user as any)?.platformRole;
      const isSupportStaff = userRole === 'platform_admin' || userRole === 'support_staff' || platformRole === 'root_admin' || platformRole === 'platform_admin' || platformRole === 'support_staff';

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

  app.post('/api/dm-audit/request', requireAuth, requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId;
      const { conversationId, investigationReason, caseNumber } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace found" });
      }

      if (!conversationId || !investigationReason) {
        return res.status(400).json({ message: "Conversation ID and investigation reason are required" });
      }

      const request = await storage.createDmAuditRequest({
        workspaceId,
        conversationId,
        investigationReason,
        caseNumber,
        requestedBy: userId,
        requestedByName: `${req.user!.firstName} ${req.user!.lastName}`.trim(),
        requestedByEmail: req.user!.email,
      });

      res.json(request);
    } catch (error: any) {
      console.error("Error creating audit request:", error);
      res.status(500).json({ message: "Failed to create audit request" });
    }
  });

  // GET /api/oversight - Get all pending oversight events for current workspace
  app.get('/api/oversight', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.user!.currentWorkspaceId;
      if (!workspaceId) {
        return res.status(400).json({ message: "No workspace selected" });
      }

      const { oversightEvents } = await import('@shared/schema');
      
      const events = await db
        .select()
        .from(oversightEvents)
        .where(
          and(
            eq(oversightEvents.workspaceId, workspaceId),
            eq(oversightEvents.status, 'pending')
          )
        )
        .orderBy(desc(oversightEvents.detectedAt));

      res.json(events);
    } catch (error: any) {
      console.error("Error fetching oversight events:", error);
      res.status(500).json({ message: "Failed to fetch oversight events" });
    }
  });

  /**
   * POST /api/feedback
   * Submit new feedback (bug report, feature request, improvement, general)
   */
  app.post("/api/feedback", requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { title, description, type, priority, category, attachmentUrls } = req.body;
      
      if (!title || !description || !type) {
        return res.status(400).json({ success: false, error: "Title, description, and type are required" });
      }
      
      const validTypes = ['bug', 'feature_request', 'improvement', 'general', 'question'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, error: "Invalid feedback type" });
      }
      
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (priority && !validPriorities.includes(priority)) {
        return res.status(400).json({ success: false, error: "Invalid priority level" });
      }
      
      const feedback = await storage.createFeedback({
        workspaceId: req.workspaceId!,
        userId: req.userId!,
        title,
        description,
        type,
        priority: priority || 'medium',
        category: category || null,
        attachmentUrls: attachmentUrls || [],
      });
      
      res.status(201).json({ success: true, data: feedback });
    } catch (error: any) {
      console.error("Error creating feedback:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to create feedback" });
    }
  });

  /**
   * GET /api/suggested-changes
   * List all available suggested changes for AI Brain
   */
  app.get("/api/suggested-changes", async (req, res) => {
    try {
      const { suggestedChangesService } = await import("./services/ai-brain/suggestedChangesService");
      const { category, tag, search } = req.query;
      let results;
      if (search) {
        results = suggestedChangesService.searchSuggestions(search as string, {
          category: category as string,
          tag: tag as string,
        });
      } else {
        results = suggestedChangesService.listSuggestions({
          category: category as string,
          tag: tag as string,
        });
      }
      res.json({ success: true, data: results, total: results.length });
    } catch (error: any) {
      console.error("Error fetching suggested changes:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/ai-brain/knowledge/route-query
   * Intelligent query routing with context enrichment
   */
  app.post("/api/ai-brain/knowledge/route-query", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeOrchestrationService } = await import("./services/ai-brain/knowledgeOrchestrationService");
      const { query, currentPage, recentActions } = req.body;

      if (!query) {
        return res.status(400).json({ success: false, error: "query required" });
      }

      const context = {
        userId: req.userId!,
        workspaceId: req.user?.activeWorkspaceId,
        userRole: req.user?.platformRole || 'user',
        currentPage,
        recentActions,
      };

      const decision = await knowledgeOrchestrationService.routeQuery(query, context);
      res.json({ success: true, data: decision });
    } catch (error: any) {
      console.error("Error routing query:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/seasonal/current-theme
   * Get the currently active seasonal theme
   */
  app.get("/api/seasonal/current-theme", async (_req, res) => {
    try {
      const { getSeasonalSubagent } = await import("./services/ai-brain/seasonalSubagent");
      const agent = getSeasonalSubagent();
      const theme = agent.getActiveTheme();
      
      res.json({
        success: true,
        ...theme,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/ai-brain/command
   * Execute AI Brain commands (support staff only)
   */
  app.post("/api/ai-brain/command", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { aiBrainMasterOrchestrator } = await import("./services/ai-brain/aiBrainMasterOrchestrator");
      const { aiBrainAuthorizationService } = await import("./services/ai-brain/aiBrainAuthorizationService");
      const { actionId, category, parameters } = req.body;

      if (!actionId || !category) {
        return res.status(400).json({ error: 'actionId and category required' });
      }

      const authCheck = await aiBrainAuthorizationService.validateSupportStaff(req.userId!);
      if (!authCheck.valid) {
        return res.status(403).json({ error: authCheck.reason });
      }

      const actionAuthCheck = await aiBrainAuthorizationService.canExecuteAction(
        { userId: req.userId!, userRole: authCheck.role! },
        category,
        actionId
      );

      if (!actionAuthCheck.isAuthorized) {
        return res.status(403).json({ error: actionAuthCheck.reason });
      }

      const { helpaiOrchestrator } = await import("./services/helpai/helpaiActionOrchestrator");
      const result = await helpaiOrchestrator.executeAction({
        actionId: `${category}.${actionId}`,
        category: category as any,
        name: actionId,
        payload: parameters || {},
        userId: req.userId,
        userRole: authCheck.role!,
        priority: parameters?.priority || 'normal'
      });

      await aiBrainAuthorizationService.logCommandExecution({
        userId: req.userId!,
        userRole: authCheck.role!,
        actionId: `${category}.${actionId}`,
        category,
        parameters,
        result: result.success
      });

      res.json({ success: result.success, message: result.message, data: result, executedBy: req.userId, authorizedRole: authCheck.role });
    } catch (error: any) {
      console.error('[AI Brain Command]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/support/session/elevate
   * Request session elevation for support roles or AI services
   * Automatically issued on login for eligible platform roles
   */
  app.post("/api/support/session/elevate", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const sessionId = req.sessionID;

      const eligibility = await elevatedSessionService.canReceiveElevation(userId);
      if (!eligibility.canElevate) {
        return res.status(403).json({
          success: false,
          error: eligibility.reason || 'Not eligible for session elevation',
          info: 'Only support roles and AI services can receive elevated sessions'
        });
      }

      const result = await elevatedSessionService.issueElevation(
        userId,
        sessionId,
        'auto_support_login',
        userId,
        req.ip,
        req.get('user-agent')
      );

      if (result.success) {
        res.json({
          success: true,
          elevationId: result.elevationId,
          expiresAt: result.expiresAt,
          role: eligibility.role
        });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error('[Elevation Route] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  // ============================================================================

  // Helper: Check if user has access to workspace
  const checkWorkspaceAccess = async (userId: string, workspaceId: string): Promise<{ hasAccess: boolean; role?: string }> => {
    const { employees, workspaces } = await import("@shared/schema");
    const [employee] = await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))).limit(1);
    if (employee) return { hasAccess: true, role: employee.workspaceRole || 'staff' };
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (workspace?.ownerId === userId) return { hasAccess: true, role: 'org_owner' };
    return { hasAccess: false };
  };

  app.get("/api/automation-governance/policy/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { automationGovernanceService } = await import("./services/ai-brain/automationGovernanceService");
      const { workspaceId } = req.params;
      const userId = req.userId!;
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    }
  });

      const policy = await automationGovernanceService.getOrCreatePolicy(workspaceId);
      res.json({ success: true, policy });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/trinity/session", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { trinityContextManager } = await import("./services/ai-brain/trinityContextManager");
      const userId = req.userId!;
      const workspaceId = req.query.workspaceId as string | undefined;
      const context = await trinityContextManager.getEnrichedSessionContext(userId, workspaceId);
      res.json({ success: true, sessionId: context.sessionId, turnCount: context.turns.length, knowledgeGaps: context.knowledgeGaps, pendingClarifications: context.pendingClarifications });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/trinity/swarm/topology", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { swarmCommanderService } = await import("./services/ai-brain/swarmCommanderService");
      const { getUserPlatformRole } = await import("./rbac");
      const userId = req.userId!;
      const platformRole = await getUserPlatformRole(userId);
      const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
      if (!guruRoles.includes(platformRole || "")) {
        return res.status(403).json({ success: false, error: "Guru mode access required" });
      }
      const workspaceId = req.query.workspaceId as string | undefined;
      const topology = await swarmCommanderService.getSwarmTopology(workspaceId);
      res.json({ success: true, topology });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Get graduation status for the current workspace
   * Returns trust score, auto-approval eligibility, and domain-level graduation
   */
  app.get("/api/ai-brain/graduation-status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("./services/ai-brain/subagentSupervisor");
      const workspaceId = req.workspaceId || req.query.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "Workspace ID required" });
      }

      const graduationStatus = await subagentSupervisor.getGraduationStatus(workspaceId);
      
      res.json({
        success: true,
        graduationStatus,
        thresholds: {
          graduationThreshold: 99.9,
          minimumExecutions: 100
        }
      });
    } catch (error: any) {
      console.error("[API] Failed to get graduation status:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Get all mailing instructions for email governance
   */
  app.get("/api/ai-brain/mailing-instructions", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { MAILING_INSTRUCTIONS } = await import("./services/ai-brain/subagentSupervisor");
      res.json({
        success: true,
        instructions: MAILING_INSTRUCTIONS,
        categories: Object.keys(MAILING_INSTRUCTIONS),
        description: "Specialized mailing instructions for all email categories"
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Execute parallel work orders - subagents working in tandem
   */
  app.post("/api/ai-brain/work-orders/execute", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("./services/ai-brain/subagentSupervisor");
      const { workboardJobId, tasks, options } = req.body;
      const workspaceId = req.workspaceId || req.body.workspaceId;
      const userId = req.userId!;
      const platformRole = req.platformRole || 'employee';

      if (!workboardJobId || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "workboardJobId and tasks array required" 
        });
      }

      console.log(`[API] Executing parallel work orders for job ${workboardJobId}`);

      const result = await subagentSupervisor.executeParallelWorkOrders({
        workboardJobId,
        workspaceId: workspaceId!,
        userId,
        platformRole,
        tasks,
        options
      });

      res.json({
        success: result.success,
        batchId: result.batchId,
        completedItems: result.completedItems,
        failedItems: result.failedItems,
        totalDurationMs: result.totalDurationMs,
        totalTokensUsed: result.totalTokensUsed,
        summary: result.summary
      });
    } catch (error: any) {
      console.error("[API] Parallel work orders failed:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Get live presence report (users + bots online)
   */
  app.get("/api/chatserver/presence", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getChatServerLivePresence } = await import("./services/ai-brain/chatServerSubagent");
      const presence = await getChatServerLivePresence();
      res.json({ success: true, presence });
    } catch (error: any) {
      console.error("[ChatServerSubagent] Presence error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Get orchestration dashboard data including active overlays, recent history, and tool health
   */
  app.get("/api/orchestration/dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { orchestrationStateMachine } = await import("./services/ai-brain/orchestrationStateMachine");
      const { db } = await import("./db");
      const { orchestrationOverlays } = await import("@shared/schema");
      const { desc, and, gte, eq, inArray } = await import("drizzle-orm");
      
      const workspaceId = req.user?.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace ID required" });
      }

      // Get active overlays (non-terminal phases)
      const activeOverlays = await orchestrationStateMachine.getActiveOverlays(workspaceId);

      // Get recent history (last 24 hours, terminal phases only)
      const terminalPhases = ['completed', 'failed', 'rolled_back', 'escalated'];
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentHistory = await db
        .select()
        .from(orchestrationOverlays)
        .where(
          and(
            eq(orchestrationOverlays.workspaceId, workspaceId),
            gte(orchestrationOverlays.createdAt, twentyFourHoursAgo),
            inArray(orchestrationOverlays.phase, terminalPhases as any)
          )
        )
        .orderBy(desc(orchestrationOverlays.completedAt))
        .limit(50);

      // Get tool health from the state machine
      const toolHealthSummary = orchestrationStateMachine.getToolHealthSummary();
      const toolHealthStatuses = orchestrationStateMachine.getToolHealthStatuses();

      res.json({
        activeOverlays,
        recentHistory,
        toolHealth: {
          summary: toolHealthSummary,
          statuses: toolHealthStatuses,
        },
      });
    } catch (error: any) {
      console.error("[OrchestrationDashboard] Error fetching data:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate a new compliance report
  app.post('/api/compliance-reports/generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.currentWorkspaceId) {
        return res.status(403).json({ message: "No workspace selected" });
      }

      const { reportType, startDate, endDate } = req.body;
      if (!reportType) {
        return res.status(400).json({ message: "Report type is required" });
      }

      const validTypes = [
        'labor_law_violations', 'tax_remittance', 'time_entry_audit',
        'break_compliance', 'overtime_summary', 'certification_expiry',
        'i9_verification', 'payroll_summary'
      ];
      if (!validTypes.includes(reportType)) {
        return res.status(400).json({ message: `Invalid report type. Valid types: ${validTypes.join(', ')}` });
      }

      const { generateComplianceReport } = await import('./services/complianceReports');
      const report = await generateComplianceReport({
        workspaceId: user.currentWorkspaceId,
        reportType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        userId,
        automated: false,
      });

      res.json({ success: true, report });
    } catch (error) {
      console.error("Error generating compliance report:", error);
      res.status(500).json({ message: "Failed to generate compliance report" });
    }
  });
}
