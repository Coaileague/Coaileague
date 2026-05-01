// Admin Support Service - Platform-level customer support tools
// For non-technical support staff to help customers

import { createLogger } from './lib/logger';
const log = createLogger('adminSupport');
import { eq, like, or, desc, and, isNull, sql } from "drizzle-orm";
import { PLATFORM, EMAIL } from './config/platformConfig';
import { randomUUID } from "crypto";
import { db } from "./db";
import {
  workspaces,
  users,
  employees,
  subscriptions,
  invoices,
  supportTickets,
  timeEntries,
  shifts,
  clients,
  systemAuditLogs,
  type Subscription,
  type SupportTicket,
  type Invoice,
  type TimeEntry,
  type Shift,
} from '@shared/schema';
import { getUncachableResendClient } from "./services/emailCore";

// ============================================================================
// Customer Search & Discovery
// ============================================================================

export interface CustomerSearchResult {
  workspace: Workspace;
  owner: User;
  subscription?: Subscription;
  stats: {
    employeeCount: number;
    clientCount: number;
    invoiceCount: number;
    activeTickets: number;
  };
}

/**
 * Search for customers by email, workspace name, or company name
 * Platform admin use only - searches across ALL workspaces
 */
export async function searchCustomers(
  query: string
): Promise<CustomerSearchResult[]> {
  const searchPattern = `%${query}%`;

  // Find matching workspaces or users
  const matchedWorkspaces = await db
    .select({
      workspace: workspaces,
      owner: users,
    })
    .from(workspaces)
    .leftJoin(users, eq(workspaces.ownerId, users.id))
    .where(
      or(
        like(workspaces.name, searchPattern),
        like(workspaces.companyName, searchPattern),
        like(users.email, searchPattern),
        like(users.firstName, searchPattern),
        like(users.lastName, searchPattern)
      )
    )
    .limit(50);

  // Fetch stats for each workspace
  const results: CustomerSearchResult[] = [];

  for (const { workspace, owner } of matchedWorkspaces) {
    if (!workspace || !owner) continue;

    // Get subscription
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspace.id))
      .limit(1);

    // Get stats
    const [employeeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(eq(employees.workspaceId, workspace.id));

    const [clientCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.workspaceId, workspace.id));

    const [invoiceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.workspaceId, workspace.id));

    const [ticketCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspace.id),
          or(
            eq(supportTickets.status, "open"),
            eq(supportTickets.status, "in_progress")
          )
        )
      );

    results.push({
      workspace,
      owner,
      subscription,
      stats: {
        employeeCount: employeeCount?.count || 0,
        clientCount: clientCount?.count || 0,
        invoiceCount: invoiceCount?.count || 0,
        activeTickets: ticketCount?.count || 0,
      },
    });
  }

  return results;
}

// ============================================================================
// Workspace Detail View
// ============================================================================

export interface WorkspaceDetail {
  workspace: Workspace;
  owner: User;
  subscription?: Subscription;
  users: Array<{ user: User; employee?: Employee }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: Date;
  }>;
  billing: {
    totalRevenue: string;
    paidInvoices: number;
    pendingInvoices: number;
    stripeConnected: boolean;
  };
  tickets: SupportTicket[];
  businessCategory: {
    category: string;
    availableTemplates: string[];
    installedTemplates: Array<{ name: string; category: string; isActive: boolean }>;
  };
}

/**
 * Get comprehensive details for a specific workspace
 * Used for admin support dashboard customer detail view
 */
export async function getWorkspaceDetail(
  workspaceId: string
): Promise<WorkspaceDetail | null> {
  // Get workspace and owner
  const [workspaceData] = await db
    .select({
      workspace: workspaces,
      owner: users,
    })
    .from(workspaces)
    .leftJoin(users, eq(workspaces.ownerId, users.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspaceData?.workspace || !workspaceData.owner) {
    return null;
  }

  const { workspace, owner } = workspaceData;

  // Get subscription
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);

  // Get all users in workspace (via employees table)
  const workspaceEmployees = await db
    .select({
      employee: employees,
      user: users,
    })
    .from(employees)
    .leftJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.workspaceId, workspaceId));

  const usersInWorkspace = workspaceEmployees.map(
    ({ employee, user }: { employee: Employee | null; user: User | null }) => ({
      employee: employee || undefined,
      user: user || ({} as User),
    })
  );

  // Get recent activity (invoices, time entries, shifts)
  const recentInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.workspaceId, workspaceId))
    .orderBy(desc(invoices.createdAt))
    .limit(5);

  const recentTimeEntries = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.workspaceId, workspaceId))
    .orderBy(desc(timeEntries.createdAt))
    .limit(5);

  const recentShifts = await db
    .select()
    .from(shifts)
    .where(eq(shifts.workspaceId, workspaceId))
    .orderBy(desc(shifts.createdAt))
    .limit(5);

  // Build activity feed
  const recentActivity: Array<{
    type: string;
    description: string;
    timestamp: Date;
  }> = [
    ...recentInvoices.map((inv: Invoice) => ({
      type: "invoice",
      description: `Invoice ${inv.invoiceNumber} - ${inv.status} - $${inv.total}`,
      timestamp: inv.createdAt!,
    })),
    ...recentTimeEntries.map((entry: TimeEntry) => ({
      type: "time_entry",
      description: `Time entry - ${entry.totalHours || "0"} hours - $${entry.totalAmount || "0"}`,
      timestamp: entry.createdAt!,
    })),
    ...recentShifts.map((shift: Shift) => ({
      type: "shift",
      description: `Shift created - ${shift.title || "Untitled"}`,
      timestamp: shift.createdAt!,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10);

  // Calculate billing stats
  const paidInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.workspaceId, workspaceId), eq(invoices.status, "paid"))
    );

  const pendingInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        or(eq(invoices.status, "draft"), eq(invoices.status, "sent"))
      )
    );

  const totalRevenue = paidInvoices
    .reduce((sum: number, inv: Invoice) => sum + parseFloat(inv.total || "0"), 0)
    .toFixed(2);

  // Get support tickets
  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.workspaceId, workspaceId))
    .orderBy(desc(supportTickets.createdAt))
    .limit(20);

  // Get business category and form templates
  const { reportTemplates } = await import("@shared/schema");
  const installedTemplates = await db
    .select()
    .from(reportTemplates)
    .where(eq(reportTemplates.workspaceId, workspaceId));

  // Get available templates for this category
  const { getTemplatesForCategory } = await import("./seedFormTemplates");
  const category = workspace.businessCategory || 'general';
  const availableTemplates = getTemplatesForCategory(category).map(t => t.name);

  return {
    workspace,
    owner,
    subscription,
    users: usersInWorkspace,
    recentActivity,
    billing: {
      totalRevenue,
      paidInvoices: paidInvoices.length,
      pendingInvoices: pendingInvoices.length,
      stripeConnected: !!workspace.stripeAccountId,
    },
    tickets,
    businessCategory: {
      category,
      availableTemplates,
      installedTemplates: installedTemplates.map(t => ({
        name: t.name,
        category: t.category || '',
        isActive: t.isActive || false,
      })),
    },
  };
}

// ============================================================================
// Admin Actions
// ============================================================================

/**
 * Send a password reset email to a user
 * Used when customers can't log in
 */
export async function sendPasswordResetEmail(
  userId: string,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await db.query.employees.findFirst({
      where: (fields) => eq(fields.id, userId),
    });

    if (!user || !user.email) {
      return {
        success: false,
        message: 'User not found or has no email address',
      };
    }

    const resetToken = randomUUID() + '-' + randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(systemAuditLogs).values({
      id: randomUUID(),
      workspaceId: user.workspaceId,
      userId: adminUserId,
      action: 'send_password_reset',
      entityType: 'user',
      entityId: userId,
      changes: { tokenGenerated: true, expiresAt: expiresAt.toISOString() },
      ipAddress: '0.0.0.0',
      userAgent: 'admin-action',
      createdAt: new Date(),
    }).catch(() => null);

    const resetUrl = `${process.env.APP_URL || PLATFORM.appUrl}/reset-password?token=${resetToken}`;
    
    try {
      const { emailService } = await import('./services/emailService');
      await emailService.sendCustomEmail(
        user.email,
        'Password Reset Request',
        `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 24 hours.</p>`,
        'admin_password_reset'
      );

      return {
        success: true,
        message: `Password reset email sent to ${user.email}`,
      };
    } catch (emailError) {
      log.error('[Admin] Email send error:', emailError);
      return {
        success: false,
        message: 'Failed to send reset email via email service',
      };
    }
  } catch (error) {
    log.error('[Admin] Password reset error:', error);
    return {
      success: false,
      message: 'Error processing password reset',
    };
  }
}

/**
 * Change a user's workspace role
 * Used to grant/revoke permissions
 */
export async function changeUserRole(
  employeeId: string,
  newRole: "org_owner" | "co_owner" | "department_manager" | "supervisor" | "staff",
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    await db
      .update(employees)
      .set({
        workspaceRole: newRole,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: adminUserId,
        action: 'change_user_role',
        entityType: 'employee',
        entityId: employeeId,
        details: { newRole },
      });
    } catch (auditErr) {
      log.error('[AdminSupport] Failed to log role change audit entry:', auditErr);
    }

    return {
      success: true,
      message: `User role updated to ${newRole}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to update role: ${error}`,
    };
  }
}

/**
 * Update workspace subscription tier
 * Used for manual upgrades/downgrades
 */
export async function updateSubscriptionTier(
  workspaceId: string,
  newTier: "free" | "trial" | "starter" | "professional" | "business" | "enterprise" | "strategic",
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);

    if (!subscription) {
      // Create new subscription
      await db.insert(subscriptions).values({
        workspaceId,
        plan: newTier,
        status: "active",
      });
    } else {
      // Update existing
      await db
        .update(subscriptions)
        .set({
          plan: newTier,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.workspaceId, workspaceId));
    }

    try {
      await db.insert(systemAuditLogs).values({
        userId: adminUserId,
        workspaceId,
        action: 'update_subscription_tier',
        entityType: 'subscription',
        entityId: workspaceId,
        details: { newTier, previousTier: subscription?.plan || 'none' },
      });
    } catch (auditErr) {
      log.error('[AdminSupport] Failed to log subscription tier audit entry:', auditErr);
    }

    return {
      success: true,
      message: `Subscription updated to ${newTier} tier`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to update subscription: ${error}`,
    };
  }
}

/**
 * Get Stripe account status for a workspace
 * Used to troubleshoot payment issues
 */
export async function getStripeStatus(workspaceId: string): Promise<{
  connected: boolean;
  customerId?: string;
  accountId?: string;
  subscriptionId?: string;
  status: string;
}> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    return { connected: false, status: "Workspace not found" };
  }

  return {
    connected: !!workspace.stripeAccountId,
    customerId: workspace.stripeCustomerId || undefined,
    accountId: workspace.stripeAccountId || undefined,
    subscriptionId: workspace.stripeSubscriptionId || undefined,
    status: workspace.stripeAccountId
      ? "Connected"
      : "Not connected - Customer needs to connect Stripe",
  };
}

// ============================================================================
// Support Ticket Management
// ============================================================================

/**
 * Create a support ticket on behalf of a customer
 * Used when customers contact support via email/phone
 */
export async function createSupportTicket(data: {
  workspaceId: string;
  subject: string;
  description: string;
  type: string;
  priority: string;
  createdByAdmin: string;
}): Promise<{ success: boolean; ticket?: SupportTicket; message?: string }> {
  try {
    // Generate ticket number
    const [lastTicket] = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.workspaceId, data.workspaceId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(1);

    let ticketNumber = "TKT-2025-001";
    if (lastTicket?.ticketNumber) {
      const match = lastTicket.ticketNumber.match(/TKT-(\d+)-(\d+)/);
      if (match) {
        const year = new Date().getFullYear();
        const num = parseInt(match[2]) + 1;
        ticketNumber = `TKT-${year}-${String(num).padStart(3, "0")}`;
      }
    }

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        workspaceId: data.workspaceId,
        ticketNumber,
        type: data.type,
        priority: data.priority,
        subject: data.subject,
        description: data.description,
        status: "open",
      })
      .returning();

    try {
      await db.insert(systemAuditLogs).values({
        userId: data.createdByAdmin,
        workspaceId: data.workspaceId,
        action: 'create_support_ticket',
        entityType: 'support_ticket',
        entityId: ticket.id,
        details: { ticketNumber, type: data.type, priority: data.priority, subject: data.subject },
      });
    } catch (auditErr) {
      log.error('[AdminSupport] Failed to log ticket creation audit entry:', auditErr);
    }

    return {
      success: true,
      ticket,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create ticket: ${error}`,
    };
  }
}

/**
 * Update support ticket status
 */
export async function updateTicketStatus(
  ticketId: string,
  status: "open" | "in_progress" | "resolved" | "closed",
  resolution?: string,
  resolvedBy?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    await db
      .update(supportTickets)
      .set({
        status,
        resolution: resolution || undefined,
        resolvedAt: status === "resolved" || status === "closed" ? new Date() : undefined,
        resolvedBy: resolvedBy || undefined,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticketId));

    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: resolvedBy || 'system',
        action: 'update_ticket_status',
        entityType: 'support_ticket',
        entityId: ticketId,
        details: { newStatus: status, resolution: resolution || null },
      });
    } catch (auditErr) {
      log.error('[AdminSupport] Failed to log ticket status audit entry:', auditErr);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: `Failed to update ticket: ${error}`,
    };
  }
}

// ============================================================================
// Platform Statistics
// ============================================================================

/**
 * Get platform-wide statistics
 * Used for admin dashboard overview
 */
export async function getPlatformStats() {
  // Use Promise.allSettled so a single missing/broken table cannot crash the whole endpoint.
  // Each query falls back to a safe zero-value on failure.
  const [
    workspaceResult,
    userResult,
    subscriptionResult,
    ticketResult,
    invoiceResult,
  ] = await Promise.allSettled([
    db.select({ count: sql<number>`count(*)::int` }).from(workspaces),
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(subscriptions)
      .where(eq(subscriptions.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(supportTickets)
      .where(eq(supportTickets.status, "open")),
    db.select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(invoices).where(eq(invoices.status, "paid")),
  ]);

  const workspaceCount  = workspaceResult.status   === 'fulfilled' ? workspaceResult.value[0]    : null;
  const userCount       = userResult.status         === 'fulfilled' ? userResult.value[0]          : null;
  const activeSubs      = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value[0]  : null;
  const openTickets     = ticketResult.status       === 'fulfilled' ? ticketResult.value[0]        : null;
  const totalInvoices   = invoiceResult.status      === 'fulfilled' ? invoiceResult.value[0]       : null;

  return {
    totalWorkspaces:    workspaceCount?.count  || 0,
    totalUsers:         userCount?.count        || 0,
    activeSubscriptions: activeSubs?.count      || 0,
    openTickets:        openTickets?.count      || 0,
    totalRevenue:       totalInvoices?.total    || "0",
    invoiceCount:       totalInvoices?.count    || 0,
  };
}
