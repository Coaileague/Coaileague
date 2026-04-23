import { sanitizeError } from '../middleware/errorHandler';
import crypto from 'crypto';
import { Router } from "express";
import { requirePlatformStaff, requirePlatformAdmin, type AuthenticatedRequest } from "../rbac";
import { trinityKnowledgeService } from "../services/ai-brain/trinityKnowledgeService";
import { db } from "../db";
import { storage } from "../storage";
import { and, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from "zod";
import {
  workspaces,
  users,
  platformRoles,
  clients,
  employees,
  escalationTickets,
  supportTickets,
  stagedShifts,
  agentIdentities,
  helpaiActionLog,
  emailEvents,
  emailUnsubscribes,
} from "@shared/schema";
import { EMAIL } from "../config/platformConfig";
import bcrypt from "bcryptjs";
import { requireAuth } from "../auth";
import { broadcastService } from "../services/broadcastService";
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
import { getStripe, isStripeConfigured } from '../services/billing/stripeClient';
const log = createLogger('PlatformRoutes');

// All valid platform roles in descending authority order
const PLATFORM_ROLES_ORDERED = [
  'root_admin', 'deputy_admin', 'sysop', 'support_manager',
  'support_agent', 'compliance_officer', 'Bot', 'none',
] as const;

const router = Router();

router.use(requireAuth);
// FIX [ULTRA-CRITICAL]: Add global requirePlatformStaff guard to ALL routes in this
// file. Without this, any authenticated org_owner could reach /master-keys/*,
// POST /users/:id/grant-role (self-escalation to root_admin), PATCH /users/:id/set-password
// (account takeover for any user), and PATCH /master-keys/organizations/:id (billing
// override). adminRoutes.ts has this guard; platformRoutes.ts was missing it.
router.use(requirePlatformStaff);

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.includes('@') || !trimmed.includes('.')) return null;
  return trimmed.toLowerCase();
}


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

router.get('/stats', async (req, res) => {
  const { getPlatformStats } = await import("../platformAdmin");
  await getPlatformStats(req, res);
});

router.get('/personal-data', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    // For unauthenticated users, return success (frontend handles localStorage)
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userName = (req.user)?.fullName || (req.user)?.email || 'Admin';

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
    log.error("Error fetching personal staff data:", error);
    res.status(500).json({ error: "Failed to fetch personal data" });
  }
});

router.get('/workspaces/search', async (req, res) => {
  try {
    const { searchWorkspaces } = await import("../platformAdmin");
    await searchWorkspaces(req, res);
  } catch (error) {
    log.error('[platformRoutes] workspace search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/workspaces/:workspaceId', async (req, res) => {
  try {
    const { getWorkspaceAdminDetail } = await import("../platformAdmin");
    await getWorkspaceAdminDetail(req, res);
  } catch (error) {
    log.error('[platformRoutes] workspace detail error:', error);
    res.status(500).json({ error: 'Failed to fetch workspace detail' });
  }
});

router.get('/master-keys/organizations', async (req: AuthenticatedRequest, res) => {
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
      // @ts-expect-error — TS migration: fix in refactoring sprint
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
        org.adminFlags?.includes(params.flag!)
      );
    }

    res.json(results);
  } catch (error: unknown) {
    log.error("Error fetching organizations:", error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid query parameters", details: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

router.get('/master-keys/organizations/:id', async (req: AuthenticatedRequest, res) => {
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
    log.error("Error fetching organization detail:", error);
    res.status(500).json({ error: "Failed to fetch organization detail" });
  }
});

router.patch('/master-keys/organizations/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID format
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    // Validate request body
    const validated = masterKeysUpdateSchema.parse(req.body);
    const rootUserId = req.user!.id;

    // Fetch workspace BEFORE updating for Stripe sync
    const [existingWorkspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!existingWorkspace) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const updateData: any = {
      lastAdminAction: validated.actionDescription,
      lastAdminActionBy: rootUserId,
      lastAdminActionAt: new Date()
    };

    // Update feature toggles if provided
    if (validated.featureToggles) {
      if (validated.featureToggles.scheduleos !== undefined) updateData.featureScheduleosEnabled = validated.featureToggles.scheduleos;
      if (validated.featureToggles.timeos !== undefined) updateData.featureTimeosEnabled = validated.featureToggles.timeos;
      if (validated.featureToggles.payrollos !== undefined) updateData.featurePayrollosEnabled = validated.featureToggles.payrollos;
      if (validated.featureToggles.billos !== undefined) updateData.featureBillosEnabled = validated.featureToggles.billos;
      if (validated.featureToggles.hireos !== undefined) updateData.featureHireosEnabled = validated.featureToggles.hireos;
      if (validated.featureToggles.reportos !== undefined) updateData.featureReportosEnabled = validated.featureToggles.reportos;
      if (validated.featureToggles.analyticsos !== undefined) updateData.featureAnalyticsosEnabled = validated.featureToggles.analyticsos;
      if (validated.featureToggles.supportos !== undefined) updateData.featureSupportosEnabled = validated.featureToggles.supportos;
      if (validated.featureToggles.communicationos !== undefined) updateData.featureCommunicationosEnabled = validated.featureToggles.communicationos;
    }

    // Track if we need to update Stripe subscription
    let shouldSyncStripe = false;

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

      updateData.billingOverrideType = override.type;
      updateData.billingOverrideDiscountPercent = override.discountPercent || null;
      updateData.billingOverrideCustomPrice = override.customPrice || null;
      updateData.billingOverrideReason = override.reason;
      updateData.billingOverrideAppliedBy = rootUserId;
      updateData.billingOverrideAppliedAt = new Date();
      updateData.billingOverrideExpiresAt = override.expiresAt || null;
      
      // Mark for Stripe sync if subscription exists
      if (existingWorkspace.stripeSubscriptionId) {
        shouldSyncStripe = true;
      }
    }

    // Update admin notes and flags if provided
    if (validated.adminNotes !== undefined) updateData.adminNotes = validated.adminNotes;
    if (validated.adminFlags !== undefined) updateData.adminFlags = validated.adminFlags;

    const [updated] = await db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // STEP 3: Sync billing override with Stripe subscription (SECURE: Guards and rollback)
    if (validated.billingOverride) {
      // SECURITY: Guard against missing subscription ID
      if (!existingWorkspace.stripeSubscriptionId) {
        log.warn('[Stripe] No subscription ID for workspace:', id, '- DB update only, no Stripe sync');
        // Continue with DB update only - no Stripe sync needed
      } else {
        // SECURITY: Attempt Stripe sync with proper error handling
        try {
          // Guard: Stripe must be configured before attempting API calls
          if (!isStripeConfigured()) {
            log.warn('[Stripe] Not configured — skipping subscription sync for workspace:', id);
          } else {
          const { TIER_PRICING } = await import('../services/billing/subscriptionManager');


          // Get current subscription (using lazy Stripe factory per TRINITY.md §F)
          const subscription = await getStripe().subscriptions.retrieve(existingWorkspace.stripeSubscriptionId);

          // SECURITY: Check subscription status before updating
          if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
            log.warn('[Stripe] Cannot update canceled/expired subscription:', subscription.status);
            // Rollback DB update - subscription is not active
            await db
              .update(workspaces)
              .set({
                billingOverrideType: existingWorkspace.billingOverrideType,
                billingOverrideDiscountPercent: existingWorkspace.billingOverrideDiscountPercent,
                billingOverrideCustomPrice: existingWorkspace.billingOverrideCustomPrice,
                billingOverrideReason: existingWorkspace.billingOverrideReason,
                billingOverrideAppliedBy: existingWorkspace.billingOverrideAppliedBy,
                billingOverrideAppliedAt: existingWorkspace.billingOverrideAppliedAt,
                billingOverrideExpiresAt: existingWorkspace.billingOverrideExpiresAt,
              })
              .where(eq(workspaces.id, id));

            return res.status(400).json({ 
              error: 'Cannot update billing override - subscription is not active',
              subscriptionStatus: subscription.status,
              message: 'The Stripe subscription is canceled or incomplete. Please reactivate before applying billing overrides.',
            });
          }

          // Calculate new price based on override
          const baseTier = existingWorkspace.subscriptionTier as keyof typeof TIER_PRICING;
          let newPrice = TIER_PRICING[baseTier]?.monthlyPrice || 0;

          if (validated.billingOverride.type === 'discount' && validated.billingOverride.discountPercent) {
            newPrice = Math.round(newPrice * (1 - validated.billingOverride.discountPercent / 100));
          } else if (validated.billingOverride.type === 'custom' && validated.billingOverride.customPrice) {
            newPrice = Math.round(parseFloat(validated.billingOverride.customPrice) * 100); // Convert to cents
          } else if (validated.billingOverride.type === 'free') {
            newPrice = 0;
          }

          // Update subscription price with prorations
          await getStripe().subscriptions.update(existingWorkspace.stripeSubscriptionId, {
            items: [{
              id: subscription.items.data[0].id,
              price_data: {
                currency: 'usd',
                product: subscription.items.data[0].price.product as string,
                recurring: { interval: 'month' },
                unit_amount: newPrice,
              },
            }],
            proration_behavior: 'create_prorations', // Pro-rate the change
          });
          } // end isStripeConfigured guard

        } catch (stripeError: unknown) {
          log.error('[Stripe] Failed to update subscription:', stripeError);
          
          // SECURITY: Rollback DB update to maintain consistency
          await db
            .update(workspaces)
            .set({
              billingOverrideType: existingWorkspace.billingOverrideType,
              billingOverrideDiscountPercent: existingWorkspace.billingOverrideDiscountPercent,
              billingOverrideCustomPrice: existingWorkspace.billingOverrideCustomPrice,
              billingOverrideReason: existingWorkspace.billingOverrideReason,
              billingOverrideAppliedBy: existingWorkspace.billingOverrideAppliedBy,
              billingOverrideAppliedAt: existingWorkspace.billingOverrideAppliedAt,
              billingOverrideExpiresAt: existingWorkspace.billingOverrideExpiresAt,
            })
            .where(eq(workspaces.id, id));


          // SECURITY: Return error to prevent inconsistent state
          return res.status(500).json({ 
            error: 'Failed to update Stripe subscription',
            message: 'Unable to sync billing override with Stripe. Please retry or contact support.',
            details: stripeError instanceof Error ? stripeError.message : String(stripeError),
          });
        }
      }
    }

    res.json({
      success: true,
      organization: updated,
      message: "Organization updated successfully"
    });
  } catch (error: unknown) {
    log.error("Error updating organization:", error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid request data", details: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to update organization" });
  }
});

router.post('/master-keys/organizations/:id/reset', async (req: AuthenticatedRequest, res) => {
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
        featureScheduleosEnabled: true,
        featureTimeosEnabled: true,
        featurePayrollosEnabled: false,
        featureBillosEnabled: true,
        featureHireosEnabled: true,
        featureReportosEnabled: true,
        featureAnalyticsosEnabled: true,
        featureSupportosEnabled: true,
        featureCommunicationosEnabled: true,
        
        // Clear billing overrides
        billingOverrideType: null,
        billingOverrideDiscountPercent: null,
        billingOverrideCustomPrice: null,
        billingOverrideReason: null,
        billingOverrideAppliedBy: null,
        billingOverrideAppliedAt: null,
        billingOverrideExpiresAt: null,
        
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
        lastAdminAction: `Organization reset: ${reason || 'No reason provided'}`,
        lastAdminActionBy: rootUserId,
        lastAdminActionAt: new Date()
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
  } catch (error: unknown) {
    log.error("Error resetting organization:", error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid request data", details: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to reset organization" });
  }
});

router.post('/master-keys/clients/backfill-users', async (req: AuthenticatedRequest, res) => {
  try {
    // Get all clients without userId
    const clientsWithoutUsers = await db.select()
      .from(clients)
      .where(isNull(clients.userId));
    
    let linkedCount = 0;
    let errorCount = 0;
    const skippedNoEmail = [];
    const linkedClients = [];
    const failedClients = [];
    
    for (const client of clientsWithoutUsers) {
      // Normalize client email (trim + lowercase + validate)
      const normalizedClientEmail = normalizeEmail(client.email);
      if (!normalizedClientEmail) {
        skippedNoEmail.push({ clientId: client.id, name: `${client.firstName} ${client.lastName}`, reason: 'Invalid or empty email' });
        continue; // Skip clients with invalid email
      }
      
      try {
        // Find user with matching email (normalized)
        const [matchingUser] = await db.select()
          .from(users)
          .where(sql`lower(${users.email}) = ${normalizedClientEmail}`)
          .limit(1);
        
        if (matchingUser) {
          // Link client to user
          await db.update(clients)
            .set({ userId: matchingUser.id })
            .where(eq(clients.id, client.id));
          
          linkedCount++;
          linkedClients.push({
            clientId: client.id,
            clientName: `${client.firstName} ${client.lastName}`,
            clientEmail: client.email,
            userId: matchingUser.id,
            userEmail: matchingUser.email
          });
          
        }
      } catch (error) {
        log.error(`Failed to link client ${client.id}:`, error);
        errorCount++;
        failedClients.push({
          clientId: client.id,
          clientEmail: client.email,
          error: error instanceof Error ? sanitizeError(error) : 'Unknown error'
        });
      }
    }
    
    res.json({
      success: true,
      message: `Backfill complete: ${linkedCount} clients linked, ${skippedNoEmail.length} skipped (no email), ${errorCount} errors`,
      linkedCount,
      errorCount,
      totalProcessed: clientsWithoutUsers.length,
      skippedNoEmailCount: skippedNoEmail.length,
      details: {
        linked: linkedClients,
        skippedNoEmail,
        failed: failedClients
      }
    });
  } catch (error: unknown) {
    log.error('Backfill error:', error);
    res.status(500).json({ error: 'Backfill failed', details: sanitizeError(error) });
  }
});

router.get('/users/search', async (req: AuthenticatedRequest, res) => {
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
  } catch (error: unknown) {
    log.error("Error searching users:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

router.get('/users', async (req: AuthenticatedRequest, res) => {
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
  } catch (error: unknown) {
    log.error("Error fetching platform users:", error);
    res.status(500).json({ error: "Failed to fetch platform users" });
  }
});

router.get('/users/:userId', async (req: AuthenticatedRequest, res) => {
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
        title: (r as any).employee.title,
        department: (r as any).employee.department,
      })),
    });
  } catch (error: unknown) {
    log.error("Error fetching user details:", error);
    res.status(500).json({ error: "Failed to fetch user details" });
  }
});

router.patch('/users/:userId', async (req: AuthenticatedRequest, res) => {
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

    // UNIVERSAL AUTH: Propagate email change to linked employee/client records
    if (email && email !== existingUser.email && updated) {
      try {
        await db.update(employees)
          .set({ email: email, updatedAt: new Date() })
          .where(eq(employees.userId, userId));
        await db.update(clients)
          .set({ email: email, updatedAt: new Date() })
          .where(eq(clients.userId, userId));
      } catch (syncError) {
        log.warn('[Auth] Admin email sync failed (non-fatal):', (syncError as any).message);
      }
    }

    res.json({ success: true, user: updated });
  } catch (error: unknown) {
    log.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.post('/users/:userId/set-password', async (req: AuthenticatedRequest, res) => {
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
  } catch (error: unknown) {
    log.error("Error setting password:", error);
    res.status(500).json({ error: "Failed to set password" });
  }
});

router.post('/users/:userId/grant-role', async (req: AuthenticatedRequest, res) => {
  try {
    // DEPRECATED: Use POST /api/admin/platform/roles instead (canonical endpoint)
    res.setHeader('X-Deprecated', 'Use POST /api/admin/platform/roles instead');

    const { userId } = req.params;
    const { role, reason } = req.body;

    const validRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer', 'Bot', 'none'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid platform role. Must be one of: " + validRoles.join(', ') });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Hierarchical level check
    const { getPlatformRoleLevel } = await import('../rbac');
    const requesterLevel = getPlatformRoleLevel(req.platformRole as string);

    if (role !== 'none') {
      const targetRoleLevel = getPlatformRoleLevel(role);
      if (targetRoleLevel >= requesterLevel) {
        return res.status(403).json({ error: "You cannot assign a role at or above your own platform level" });
      }
    }

    // Check target's current role level - block if at or above requester
    const targetCurrentRole = await storage.getUserPlatformRole(userId);
    if (targetCurrentRole) {
      const targetCurrentLevel = getPlatformRoleLevel(targetCurrentRole);
      if (targetCurrentLevel >= requesterLevel) {
        return res.status(403).json({ error: "You cannot modify the role of someone at your own platform level or above" });
      }
    }

    // Revoke existing platform roles
    await db
      .update(platformRoles)
      .set({
        revokedAt: new Date(),
        revokedBy: req.user!.id,
        revokedReason: reason || `Replaced with ${role} role`,
      })
      .where(and(
        eq(platformRoles.userId, userId),
        isNull(platformRoles.revokedAt)
      ));

    // If role is 'none', just revoke without granting new
    if (role === 'none') {
      await storage.createAuditLog({
        userId: req.user!.id,
        workspaceId: null,
        action: 'platform_role_removed',
        entityType: 'platform_role',
        entityId: userId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        details: {
          targetUserId: userId,
          targetEmail: user.email,
          removedBy: req.user!.email,
          reason: reason || 'Role removed by platform admin',
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      return res.json({ success: true, message: "Platform role removed successfully" });
    }

    // Grant new role
    const [newRole] = await db
      .insert(platformRoles)
      .values({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId,
        role,
        grantedBy: req.user!.id,
        grantedReason: reason || `Granted ${role} role`,
      })
      .returning();

    await storage.createAuditLog({
      userId: req.user!.id,
      workspaceId: null,
      action: 'platform_role_assigned',
      entityType: 'platform_role',
      entityId: newRole.id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: {
        targetUserId: userId,
        targetEmail: user.email,
        role,
        assignedBy: req.user!.email,
        reason: reason || `Granted ${role} role`,
      },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.json({ success: true, platformRole: newRole });
  } catch (error: unknown) {
    log.error("Error granting platform role:", error);
    res.status(500).json({ error: "Failed to grant platform role" });
  }
});

router.post('/users/:userId/revoke-role', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const { getPlatformRoleLevel } = await import('../rbac');
    const targetPlatformRole = await storage.getUserPlatformRole(userId);
    const requesterPlatformLevel = getPlatformRoleLevel(req.platformRole as string);
    const targetPlatformLevel = getPlatformRoleLevel(targetPlatformRole as string);
    if (targetPlatformLevel >= requesterPlatformLevel) {
      return res.status(403).json({ error: "You cannot revoke the role of someone at your own platform level or above" });
    }
    
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

    await storage.createAuditLog({
      userId: req.user!.id,
      workspaceId: null,
      action: 'platform_role_revoked',
      entityType: 'platform_role',
      entityId: userId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: {
        targetUserId: userId,
        revokedRole: targetPlatformRole,
        revokedBy: req.user!.email,
        reason: reason || 'Role revoked by admin',
      },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.json({ success: true, message: "Platform role revoked successfully" });
  } catch (error: unknown) {
    log.error("Error revoking platform role:", error);
    res.status(500).json({ error: "Failed to revoke platform role" });
  }
});

router.post('/users', async (req: AuthenticatedRequest, res) => {
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
    const workId = `${firstName || 'User'}-${crypto.randomUUID().slice(0, 8)}`;

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

    const { passwordHash: _, ...safeUser } = newUser;

    // Grant platform role if specified
    if (platformRole && ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer', 'Bot', 'none'].includes(platformRole)) {
      await db.insert(platformRoles).values({
        userId: newUser.id,
        role: platformRole,
        grantedBy: req.user!.id,
        grantedReason: `Created with ${platformRole} role`,
      });
    }
    res.json({ success: true, user: safeUser });
  } catch (error: unknown) {
    log.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.post('/settings', async (req, res) => {
  try {
    // Validate settings structure
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: "Invalid settings object" });
    }
    
    if (settings.workspaceId) {
      try {
        await db.update(workspaces)
          .set({
            adminNotes: JSON.stringify(settings),
            updatedAt: new Date(),
          })
          .where(eq(workspaces.id, settings.workspaceId));
      } catch (err: unknown) {
        log.error('[PlatformRoutes] Failed to persist settings:', (err instanceof Error ? err.message : String(err)));
      }
    }
    
    res.json({ 
      success: true, 
      message: "Platform settings saved successfully",
      settings 
    });
  } catch (error: unknown) {
    log.error("Error saving platform settings:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to save settings" });
  }
});

router.get('/staff', async (req: AuthenticatedRequest, res) => {
  try {
    const activePlatformRoles = await db
      .select()
      .from(platformRoles)
      .where(isNull(platformRoles.revokedAt));
    
    const userIds = activePlatformRoles.map(r => r.userId);
    
    if (userIds.length === 0) {
      return res.json({ staff: [] });
    }
    
    const staffUsers = await db.select().from(users).where(inArray(users.id, userIds));
    
    const staff = staffUsers.map(user => {
      const roleRecord = activePlatformRoles.find(r => r.userId === user.id);
      return {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: roleRecord?.role || 'none',
        grantedAt: roleRecord?.createdAt,
        grantedBy: roleRecord?.grantedBy,
        isSuspended: roleRecord?.isSuspended || false,
        suspendedAt: roleRecord?.suspendedAt,
        suspendedReason: roleRecord?.suspendedReason,
      };
    });
    
    res.json({ staff });
  } catch (error: unknown) {
    log.error("Error fetching platform staff:", error);
    res.status(500).json({ error: "Failed to fetch platform staff" });
  }
});

router.post('/staff/grant-role', async (req: AuthenticatedRequest, res) => {
  try {
    const { email, role } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const validRoles = ['deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid platform role. Valid roles: ${validRoles.join(', ')}` });
    }

    // Anti-escalation: grantor may not grant a role at or above their own level
    const PLATFORM_ROLE_LEVELS: Record<string, number> = {
      root_admin: 5, deputy_admin: 4, sysop: 3, support_manager: 3, compliance_officer: 3, support_agent: 2,
    };
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const grantorRole = (req.user)?.platformRole as string | undefined;
    const grantorLevel = grantorRole ? (PLATFORM_ROLE_LEVELS[grantorRole] ?? 0) : 0;
    const targetLevel = PLATFORM_ROLE_LEVELS[role] ?? 0;
    if (targetLevel >= grantorLevel) {
      return res.status(403).json({ error: "You cannot grant a platform role at or above your own level." });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      return res.status(404).json({ error: "User not found. They must have an existing account." });
    }

    const [existingRole] = await db
      .select()
      .from(platformRoles)
      .where(and(eq(platformRoles.userId, user.id), isNull(platformRoles.revokedAt)))
      .limit(1);
    
    if (existingRole) {
      return res.status(400).json({ error: "User already has a platform role. Use change role instead." });
    }

    const [newRole] = await db
      .insert(platformRoles)
      .values({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId: user.id,
        role,
        grantedBy: req.user!.id,
        grantedReason: `Granted by ${req.user!.email}`,
      })
      .returning();

    res.json({ success: true, message: `Platform role '${role}' granted to ${email}`, role: newRole });
  } catch (error: unknown) {
    log.error("Error granting platform role:", error);
    res.status(500).json({ error: "Failed to grant platform role" });
  }
});

router.post('/staff/:userId/revoke-role', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;

    const { getPlatformRoleLevel } = await import('../rbac');
    const targetPlatformRole = await storage.getUserPlatformRole(userId);
    const requesterPlatformLevel = getPlatformRoleLevel(req.platformRole as string);
    const targetPlatformLevel = getPlatformRoleLevel(targetPlatformRole as string);
    if (targetPlatformLevel >= requesterPlatformLevel) {
      return res.status(403).json({ error: "You cannot revoke the role of someone at your own platform level or above" });
    }
    
    await db
      .update(platformRoles)
      .set({
        revokedAt: new Date(),
        revokedBy: req.user!.id,
        revokedReason: 'Role revoked by admin',
      })
      .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));

    res.json({ success: true, message: "Platform role revoked successfully" });
  } catch (error: unknown) {
    log.error("Error revoking platform role:", error);
    res.status(500).json({ error: "Failed to revoke platform role" });
  }
});

router.post('/staff/:userId/suspend', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: "Suspension reason is required for audit trail" });
    }
    
    const { getPlatformRoleLevel } = await import('../rbac');
    const targetPlatformRole = await storage.getUserPlatformRole(userId);
    const requesterPlatformLevel = getPlatformRoleLevel(req.platformRole as string);
    const targetPlatformLevel = getPlatformRoleLevel(targetPlatformRole as string);
    if (targetPlatformLevel >= requesterPlatformLevel) {
      return res.status(403).json({ error: "You cannot suspend someone at your own platform level or above" });
    }

    await db
      .update(platformRoles)
      .set({
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedBy: req.user!.id,
        suspendedReason: reason,
      })
      .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));

    res.json({ success: true, message: "Staff member suspended for investigation" });
  } catch (error: unknown) {
    log.error("Error suspending staff:", error);
    res.status(500).json({ error: "Failed to suspend staff member" });
  }
});

router.post('/staff/:userId/unsuspend', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;

    const { getPlatformRoleLevel } = await import('../rbac');
    const targetPlatformRole = await storage.getUserPlatformRole(userId);
    const requesterPlatformLevel = getPlatformRoleLevel(req.platformRole as string);
    const targetPlatformLevel = getPlatformRoleLevel(targetPlatformRole as string);
    if (targetPlatformLevel >= requesterPlatformLevel) {
      return res.status(403).json({ error: "You cannot unsuspend someone at your own platform level or above" });
    }

    await db
      .update(platformRoles)
      .set({
        isSuspended: false,
        suspendedAt: null,
        suspendedBy: null,
        suspendedReason: null,
      })
      .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));

    res.json({ success: true, message: "Staff member reinstated" });
  } catch (error: unknown) {
    log.error("Error unsuspending staff:", error);
    res.status(500).json({ error: "Failed to reinstate staff member" });
  }
});

router.post('/staff/:userId/change-role', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { newRole } = req.body;
    
    const validRoles = ['deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];
    if (!newRole || !validRoles.includes(newRole)) {
      return res.status(400).json({ error: `Invalid platform role. Valid roles: ${validRoles.join(', ')}` });
    }
    
    const { getPlatformRoleLevel: getPlatLevel } = await import('../rbac');
    const targetPlatformRole = await storage.getUserPlatformRole(userId);
    const requesterPLevel = getPlatLevel(req.platformRole as string);
    const targetPLevel = getPlatLevel(targetPlatformRole as string);
    if (targetPLevel >= requesterPLevel) {
      return res.status(403).json({ error: "You cannot change the role of someone at your own platform level or above" });
    }
    const newRoleLevel = getPlatLevel(newRole);
    if (newRoleLevel >= requesterPLevel) {
      return res.status(403).json({ error: "You cannot promote someone to your own platform level or above" });
    }

    await db
      .update(platformRoles)
      .set({
        revokedAt: new Date(),
        revokedBy: req.user!.id,
        revokedReason: `Role changed to ${newRole}`,
      })
      .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));

    const [newRoleRecord] = await db
      .insert(platformRoles)
      .values({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId,
        role: newRole,
        grantedBy: req.user!.id,
        grantedReason: 'Role changed from previous role',
      })
      .returning();

    res.json({ success: true, message: `Platform role changed to '${newRole}'`, role: newRoleRecord });
  } catch (error: unknown) {
    log.error("Error changing platform role:", error);
    res.status(500).json({ error: "Failed to change platform role" });
  }
});

// ============================================================================
// SUPPORT TEAM MANAGEMENT — /api/platform/team
// Manages system bots (agent_identities) + human support agents (platform_roles)
// ============================================================================

// GET /api/platform/team
// Returns all system bots + human support agents
router.get('/team', async (req: AuthenticatedRequest, res) => {
  try {
    const bots = await db.select().from(agentIdentities)
      .where(eq(agentIdentities.entityType, 'bot'))
      .orderBy(desc(agentIdentities.createdAt));

    const humanAgents = await db
      .select({
        userId: platformRoles.userId,
        role: platformRoles.role,
        grantedAt: (platformRoles as any).grantedAt,
        grantedBy: platformRoles.grantedBy,
        revokedAt: platformRoles.revokedAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isSuspended: (users as any).isSuspended,
        lastActiveAt: (users as any).lastActiveAt,
      })
      .from(platformRoles)
      .innerJoin(users, eq(users.id, platformRoles.userId))
      .where(isNull(platformRoles.revokedAt))
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(platformRoles.grantedAt));

    res.json({ bots, agents: humanAgents });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load support team' });
  }
});

// POST /api/platform/team/bots/:agentId/query
// Send a question to a system bot and get an inline response
router.post('/team/bots/:agentId/query', async (req: AuthenticatedRequest, res) => {
  try {
    const { agentId } = req.params;
    const { question } = req.body;

    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const [bot] = await db.select().from(agentIdentities)
      .where(eq(agentIdentities.agentId, agentId)).limit(1);

    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (bot.status === 'suspended') return res.status(400).json({ error: `${bot.name} is currently offline` });

    const { geminiClient } = await import('../services/ai-brain/providers/geminiClient');
    const systemPrompt = `You are ${bot.name}, a specialized AI assistant in the CoAIleague Support Platform.
${bot.description || ''}
Your mission: ${bot.missionObjective || 'Assist the support team with platform operations and troubleshooting.'}
Answer the support team question directly, concisely, and with specific data where possible. 
Keep answers under 200 words unless detail is critical. Today is ${new Date().toLocaleDateString()}.`;

    const fullPrompt = `${systemPrompt}\n\nQuestion: ${question}`;
    const result = await geminiClient.generateContent(fullPrompt, { // withGemini
      featureKey: 'ai_general',
      workspaceId: PLATFORM_WORKSPACE_ID,
    });
    const answer = result.text || 'No response generated.';

    await db.insert(helpaiActionLog).values({
      workspaceId: PLATFORM_WORKSPACE_ID,
      userId: req.user!.id,
      actionType: 'query',
      actionName: `Bot query: ${bot.name}`,
      toolUsed: bot.agentId,
      inputPayload: { question: question.trim() },
      outputPayload: { answer, botName: bot.name },
      success: true,
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ answer, botName: bot.name, botId: agentId, askedAt: new Date().toISOString() });
  } catch (err: unknown) {
    log.error('Bot query error:', err);
    res.status(500).json({ error: 'Bot failed to respond', details: sanitizeError(err) });
  }
});

// POST /api/platform/team/bots/:agentId/action
// Actions: restart | suspend | activate | reset_stats
router.post('/team/bots/:agentId/action', async (req: AuthenticatedRequest, res) => {
  try {
    const { agentId } = req.params;
    const { action, reason } = req.body;

    const validActions = ['restart', 'suspend', 'activate', 'reset_stats'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    const [bot] = await db.select().from(agentIdentities)
      .where(eq(agentIdentities.agentId, agentId)).limit(1);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const updates: Partial<typeof agentIdentities.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (action === 'suspend') {
      updates.status = 'suspended';
      updates.suspendedAt = new Date();
      updates.suspendedBy = req.user!.id;
      updates.suspensionReason = reason || 'Manually suspended by support team';
    } else if (action === 'activate' || action === 'restart') {
      updates.status = 'active';
      updates.suspendedAt = null as any;
      updates.suspendedBy = null as any;
      updates.suspensionReason = null as any;
    } else if (action === 'reset_stats') {
      updates.tokenCount24h = 0;
      updates.currentMinuteRequests = 0;
      updates.currentHourRequests = 0;
    }

    await db.update(agentIdentities).set(updates).where(eq(agentIdentities.agentId, agentId));

    res.json({ success: true, action, botId: agentId, botName: bot.name });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Action failed', details: sanitizeError(err) });
  }
});

// POST /api/platform/team/agents/:userId/action
// Actions: freeze | unfreeze | demote | remove | reactivate | change_role
router.post('/team/agents/:userId/action', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { action, reason, newRole } = req.body;

    const validActions = ['freeze', 'unfreeze', 'demote', 'remove', 'reactivate', 'change_role'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    if (userId === req.user!.id) {
      return res.status(400).json({ error: 'Cannot perform actions on your own account' });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const [targetRole] = await db.select().from(platformRoles)
      .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)))
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(platformRoles.grantedAt)).limit(1);

    const { getPlatformRoleLevel } = await import('../rbac');
    const requesterLevel = getPlatformRoleLevel(req.platformRole as string);
    const targetLevel = getPlatformRoleLevel(targetRole?.role || 'none');

    if (targetLevel >= requesterLevel) {
      return res.status(403).json({ error: 'Cannot act on someone at or above your platform level' });
    }

    if (action === 'freeze' || action === 'remove') {
      await db.transaction(async (tx) => {
        await tx.update(users).set({ isSuspended: true, suspendedAt: new Date() } as any)
          .where(eq(users.id, userId));
        if (action === 'remove' && targetRole) {
          await tx.update(platformRoles).set({
            revokedAt: new Date(),
            revokedBy: req.user!.id,
            revokedReason: reason || 'Removed from support team',
          }).where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));
        }
      });
    } else if (action === 'unfreeze' || action === 'reactivate') {
      await db.update(users).set({ isSuspended: false, suspendedAt: null as any } as any)
        .where(eq(users.id, userId));
    } else if (action === 'demote') {
      if (!targetRole) return res.status(400).json({ error: 'User has no platform role to demote' });
      const demotedRole = 'support_agent';
      await db.transaction(async (tx) => {
        await tx.update(platformRoles).set({
          revokedAt: new Date(),
          revokedBy: req.user!.id,
          revokedReason: reason || 'Demoted',
        }).where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));
        await tx.insert(platformRoles).values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: PLATFORM_WORKSPACE_ID,
          userId,
          role: demotedRole,
          grantedBy: req.user!.id,
          grantedReason: reason || `Demoted from ${targetRole.role}`,
        });
      });
    } else if (action === 'change_role') {
      if (!newRole || !PLATFORM_ROLES_ORDERED.includes(newRole as any)) {
        return res.status(400).json({ error: 'Valid newRole required' });
      }
      const newRoleLevel = getPlatformRoleLevel(newRole);
      if (newRoleLevel >= requesterLevel) {
        return res.status(403).json({ error: 'Cannot promote to your level or above' });
      }
      await db.transaction(async (tx) => {
        if (targetRole) {
          await tx.update(platformRoles).set({
            revokedAt: new Date(),
            revokedBy: req.user!.id,
            revokedReason: `Role changed to ${newRole}`,
          }).where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));
        }
        await tx.insert(platformRoles).values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: PLATFORM_WORKSPACE_ID,
          userId,
          role: newRole,
          grantedBy: req.user!.id,
          grantedReason: `Role changed`,
        });
      });
    }

    res.json({ success: true, action, userId, targetName: `${targetUser.firstName} ${targetUser.lastName}` });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Action failed', details: sanitizeError(err) });
  }
});

// POST /api/platform/team/bots
// Register a new system bot
router.post('/team/bots', async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      agentId: z.string().min(3).max(100),
      name: z.string().min(2).max(255),
      description: z.string().optional(),
      missionObjective: z.string().optional(),
      role: z.string().default('support'),
    });
    const data = schema.parse(req.body);

    const [existing] = await db.select().from(agentIdentities)
      .where(eq(agentIdentities.agentId, data.agentId)).limit(1);
    if (existing) return res.status(409).json({ error: `Bot with id '${data.agentId}' already exists` });

    const [newBot] = await db.insert(agentIdentities).values({
      agentId: data.agentId,
      name: data.name,
      description: data.description,
      missionObjective: data.missionObjective,
      entityType: 'bot',
      workspaceId: PLATFORM_WORKSPACE_ID,
      isGlobal: true,
      status: 'active',
      role: data.role,
      createdBy: req.user!.id,
    }).returning();

    res.json({ success: true, bot: newBot });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to register bot', details: sanitizeError(err) });
  }
});

// POST /api/platform/team/agents
// Add a new human support agent by email
router.post('/team/agents', async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['support_agent', 'support_manager', 'compliance_officer', 'sysop']).default('support_agent'),
    });
    const { email, role } = schema.parse(req.body);

    const { getPlatformRoleLevel } = await import('../rbac');
    const requesterLevel = getPlatformRoleLevel(req.platformRole as string);
    const newRoleLevel = getPlatformRoleLevel(role);
    if (newRoleLevel >= requesterLevel) {
      return res.status(403).json({ error: 'Cannot grant role at or above your own level' });
    }

    const [targetUser] = await db.select().from(users)
      .where(eq(users.email, email.toLowerCase())).limit(1);
    if (!targetUser) return res.status(404).json({ error: `No user found with email: ${email}` });

    const [existing] = await db.select().from(platformRoles)
      .where(and(eq(platformRoles.userId, targetUser.id), isNull(platformRoles.revokedAt))).limit(1);
    if (existing) return res.status(409).json({ error: `User already has platform role: ${existing.role}` });

    const [newRole] = await db.insert(platformRoles).values({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId: PLATFORM_WORKSPACE_ID,
      userId: targetUser.id,
      role,
      grantedBy: req.user!.id,
      grantedReason: 'Added to support team',
    }).returning();

    res.json({
      success: true,
      agent: { userId: targetUser.id, email: targetUser.email, name: `${targetUser.firstName} ${targetUser.lastName}`, role },
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to add agent', details: sanitizeError(err) });
  }
});

// ============================================================================
// RECYCLED CREDITS PIPELINE — /api/platform/credits
// ============================================================================

// GET /api/platform/credits/recycled — RETIRED
// Credits are not recycled. Token usage rolls over naturally via token_usage_monthly.
router.get('/credits/recycled', async (_req: AuthenticatedRequest, res) => {
  res.status(410).json({
    error: 'Recycled credits pipeline retired — tokens are not recycled.',
    stats: { pool: 0, deposits: [] },
  });
});

// POST /api/platform/credits/recycled/trigger — RETIRED
router.post('/credits/recycled/trigger', requirePlatformAdmin, async (_req: AuthenticatedRequest, res) => {
  res.status(410).json({
    error: 'Recycled credits sweep retired — no action taken.',
    success: true,
    result: null,
  });
});

// ============================================================================
// TRINITY KNOWLEDGE BASE API
// ============================================================================

// List all static knowledge modules
router.get('/knowledge/static', async (req: AuthenticatedRequest, res) => {
  try {
    const modules = await trinityKnowledgeService.listStaticModules();
    res.json({ modules });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to list modules', details: sanitizeError(err) });
  }
});

// Get full content of a specific module
router.get('/knowledge/static/:moduleKey', async (req: AuthenticatedRequest, res) => {
  try {
    const module = await trinityKnowledgeService.getModuleContent(req.params.moduleKey);
    if (!module) return res.status(404).json({ error: 'Module not found' });
    res.json({ module });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to get module', details: sanitizeError(err) });
  }
});

// Query knowledge base (used by Trinity internally + for search UI)
router.get('/knowledge/query', async (req: AuthenticatedRequest, res) => {
  try {
    const { q, category, state, limit } = req.query;
    const results = await trinityKnowledgeService.queryStaticKnowledge({
      query: String(q || ''),
      category: category ? String(category) : undefined,
      stateCode: state ? String(state) : undefined,
      limit: limit ? parseInt(String(limit)) : 5,
    });
    res.json({ results });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Query failed', details: sanitizeError(err) });
  }
});

// Re-seed static knowledge (root_admin only)
router.post('/knowledge/reseed', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const service = trinityKnowledgeService as any;
    service.seeded = false;  // Force re-seed
    await trinityKnowledgeService.seedStaticKnowledge();
    const modules = await trinityKnowledgeService.listStaticModules();
    res.json({ success: true, moduleCount: modules.length });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Reseed failed', details: sanitizeError(err) });
  }
});

// GET /api/platform/email-deliverability — Email deliverability health for root_admin
// Returns 24h bounce/complaint rates, suppression list size, and threshold status
router.get('/email-deliverability', async (req: AuthenticatedRequest, res) => {
  try {
    const windowHours = Math.min(Math.max(1, parseInt(req.query.hours as string) || 24), 168);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const statusRows = await db.select({
      status: emailEvents.status,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(emailEvents)
    .where(gte(emailEvents.createdAt, since))
    .groupBy(emailEvents.status);

    const totalSent = statusRows.reduce((sum, r) => sum + Number(r.cnt), 0);
    const byStatus = Object.fromEntries(statusRows.map(r => [r.status, Number(r.cnt)]));
    const bounceCount = byStatus.bounced || 0;
    const complaintCount = byStatus.complained || 0;

    const bounceRate = totalSent > 0 ? bounceCount / totalSent : 0;
    const complaintRate = totalSent > 0 ? complaintCount / totalSent : 0;

    const [suppressionResult] = await db.select({ count: sql<number>`COUNT(*)::int` })
      .from(emailUnsubscribes)
      .where(eq(emailUnsubscribes.unsubscribeAll, true));
    const suppressedCount = Number(suppressionResult?.count ?? 0);

    const bouncedSourceRows = await db.select({
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(emailUnsubscribes)
    .where(and(
      eq(emailUnsubscribes.unsubscribeAll, true),
      sql`unsubscribe_source = 'bounce'`,
    ));
    const complainedSourceRows = await db.select({
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(emailUnsubscribes)
    .where(and(
      eq(emailUnsubscribes.unsubscribeAll, true),
      sql`unsubscribe_source = 'complaint'`,
    ));

    const bounceThresholdExceeded = bounceRate > EMAIL.bounceRateThreshold;
    const complaintThresholdExceeded = complaintRate > EMAIL.complaintRateThreshold;

    return res.json({
      windowHours,
      since: since.toISOString(),
      emailsSent: totalSent,
      byStatus,
      bounceCount,
      complaintCount,
      bounceRate: parseFloat((bounceRate * 100).toFixed(3)),
      complaintRate: parseFloat((complaintRate * 100).toFixed(4)),
      bounceRateThresholdPct: parseFloat((EMAIL.bounceRateThreshold * 100).toFixed(1)),
      complaintRateThresholdPct: parseFloat((EMAIL.complaintRateThreshold * 100).toFixed(2)),
      bounceThresholdExceeded,
      complaintThresholdExceeded,
      status: bounceThresholdExceeded || complaintThresholdExceeded ? 'CRITICAL' : 'OK',
      suppression: {
        totalSuppressed: suppressedCount,
        fromBounces: Number(bouncedSourceRows[0]?.cnt ?? 0),
        fromComplaints: Number(complainedSourceRows[0]?.cnt ?? 0),
      },
      senderDomain: 'coaileague.com',
      dkimConfigured: true,
      spfConfigured: false,
      dmarcInherited: true,
      dnsSummary: {
        spf: 'MISSING — add: v=spf1 include:spf.resend.com ~all to coaileague.com TXT',
        dkim: 'CONFIGURED (resend._domainkey.coaileague.com) — verify 2048-bit key via Resend dashboard',
        dmarc: 'REQUIRED — add explicit _dmarc.coaileague.com record: v=DMARC1; p=quarantine; rua=mailto:dmarc@coaileague.com',
        mxInbound: 'REQUIRED — coaileague.com MX must point to inbound.resend.com for inbound email processing',
      },
    });
  } catch (err: unknown) {
    log.error('[platformRoutes] /email-deliverability error:', (err instanceof Error ? err.message : String(err)));
    return res.status(500).json({ error: 'Failed to fetch deliverability stats', details: sanitizeError(err) });
  }
});

// GET /api/platform/announcements — workspace-scoped announcements alias (used by header billboard)
// NOTE: This route lives on publicPlatformRouter (requireAuth only) so ALL authenticated users
// can reach it — not just platform staff. The main `router` has requirePlatformStaff globally.
const publicPlatformRouter = Router();
publicPlatformRouter.use(requireAuth);

publicPlatformRouter.get('/announcements', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const broadcasts = await broadcastService.getBroadcasts({
      workspaceId,
      isActive: true,
      limit: Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 500),
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json(broadcasts);
  } catch (err: unknown) {
    log.error('[platformRoutes] /announcements error:', (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

export { publicPlatformRouter };
export default router;
