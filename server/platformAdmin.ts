import { Request, Response } from "express";
import { storage } from "./storage";
import { 
  users, 
  workspaces, 
  subscriptions, 
  invoices, 
  supportTickets,
  employees,
  clients,
  timeEntries,
  shifts
} from "@shared/schema";
import { eq, sql, and, or, desc, gte } from "drizzle-orm";

const db = storage.db;

/**
 * Platform Admin - Root Dashboard Statistics
 * Provides comprehensive platform-wide metrics for Fortune 500 management
 */

export async function getPlatformStats(req: Request, res: Response) {
  try {
    // Total workspaces
    const [workspaceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaces);

    // Total users
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    // Active subscriptions
    const [activeSubCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));

    // Monthly revenue (paid invoices this month)
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [monthlyRevData] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
        platformFees: sql<string>`COALESCE(SUM(CAST(platform_fee_amount AS DECIMAL)), 0)`,
        count: sql<number>`count(*)::int`
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "paid"),
          gte(invoices.paidAt, firstDayOfMonth)
        )
      );

    // Calculate average revenue per workspace
    const avgRevenue = workspaceCount?.count > 0
      ? (parseFloat(monthlyRevData?.total || "0") / workspaceCount.count).toFixed(2)
      : "0";

    // Churn rate (simplified - workspaces with cancelled subscriptions)
    const [cancelledSubs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "cancelled"));

    const churnRate = workspaceCount?.count > 0
      ? ((cancelledSubs?.count || 0) / workspaceCount.count * 100).toFixed(1)
      : "0";

    // System health (simplified metrics)
    const systemHealth = {
      cpu: Math.floor(Math.random() * 30) + 10, // 10-40% usage (mock)
      memory: Math.floor(Math.random() * 40) + 30, // 30-70% usage (mock)
      database: "healthy",
      uptime: process.uptime()
    };

    // Recent activity (last 10 events)
    const recentInvoices = await db
      .select({
        invoice: invoices,
        workspace: workspaces
      })
      .from(invoices)
      .leftJoin(workspaces, eq(invoices.workspaceId, workspaces.id))
      .orderBy(desc(invoices.createdAt))
      .limit(10);

    const recentActivity = recentInvoices.map(({ invoice, workspace }) => ({
      type: "invoice",
      description: `Invoice ${invoice.invoiceNumber} - $${invoice.total} - ${invoice.status}`,
      timestamp: invoice.createdAt!,
      workspaceId: workspace?.id,
      workspaceName: workspace?.name || "Unknown"
    }));

    // Support metrics
    const [openTicketCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        or(
          eq(supportTickets.status, "open"),
          eq(supportTickets.status, "in_progress")
        )
      );

    const supportMetrics = {
      openTickets: openTicketCount?.count || 0,
      avgResponseTime: 2.5, // Mock: 2.5 hours average
      slaCompliance: 94, // Mock: 94% compliance
      customerSatisfaction: 92 // Mock: 92% CSAT
    };

    // Top workspaces by revenue
    const topWorkspacesData = await db
      .select({
        workspace: workspaces,
        subscription: subscriptions,
        revenue: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
        employeeCount: sql<number>`(
          SELECT count(*)::int 
          FROM ${employees} 
          WHERE ${employees.workspaceId} = ${workspaces.id}
        )`
      })
      .from(workspaces)
      .leftJoin(subscriptions, eq(workspaces.id, subscriptions.workspaceId))
      .leftJoin(
        invoices,
        and(
          eq(invoices.workspaceId, workspaces.id),
          eq(invoices.status, "paid"),
          gte(invoices.paidAt, firstDayOfMonth)
        )
      )
      .groupBy(workspaces.id, subscriptions.id)
      .orderBy(desc(sql`revenue`))
      .limit(5);

    const topWorkspaces = topWorkspacesData.map(({ workspace, subscription, revenue, employeeCount }) => ({
      id: workspace.id,
      name: workspace.name,
      tier: subscription?.tier || workspace.subscriptionTier || "free",
      monthlyRevenue: parseFloat(revenue).toFixed(2),
      employeeCount: employeeCount || 0
    }));

    res.json({
      totalWorkspaces: workspaceCount?.count || 0,
      totalUsers: userCount?.count || 0,
      activeSubscriptions: activeSubCount?.count || 0,
      monthlyRevenue: parseFloat(monthlyRevData?.total || "0").toFixed(2),
      platformFeeRevenue: parseFloat(monthlyRevData?.platformFees || "0").toFixed(2),
      totalTransactions: monthlyRevData?.count || 0,
      avgRevenuePerWorkspace: avgRevenue,
      churnRate: parseFloat(churnRate),
      systemHealth,
      recentActivity,
      supportMetrics,
      topWorkspaces
    });
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    res.status(500).json({ error: "Failed to fetch platform statistics" });
  }
}

/**
 * Search workspaces across platform
 * For admin customer search and support
 */
export async function searchWorkspaces(req: Request, res: Response) {
  try {
    const { query } = req.query;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Search query required" });
    }

    const results = await db
      .select({
        workspace: workspaces,
        owner: users,
        subscription: subscriptions
      })
      .from(workspaces)
      .leftJoin(users, eq(workspaces.ownerId, users.id))
      .leftJoin(subscriptions, eq(workspaces.id, subscriptions.workspaceId))
      .where(
        or(
          sql`${workspaces.name} ILIKE ${`%${query}%`}`,
          sql`${workspaces.companyName} ILIKE ${`%${query}%`}`,
          sql`${users.email} ILIKE ${`%${query}%`}`
        )
      )
      .limit(20);

    res.json(results);
  } catch (error) {
    console.error("Error searching workspaces:", error);
    res.status(500).json({ error: "Search failed" });
  }
}

/**
 * Get detailed workspace info for admin view
 */
export async function getWorkspaceAdminDetail(req: Request, res: Response) {
  try {
    const { workspaceId } = req.params;

    // Workspace info
    const [workspaceData] = await db
      .select({
        workspace: workspaces,
        owner: users,
        subscription: subscriptions
      })
      .from(workspaces)
      .leftJoin(users, eq(workspaces.ownerId, users.id))
      .leftJoin(subscriptions, eq(workspaces.id, subscriptions.workspaceId))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspaceData) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    // Get counts
    const [employeeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    const [clientCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));

    const [invoiceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.workspaceId, workspaceId));

    const [ticketCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          or(
            eq(supportTickets.status, "open"),
            eq(supportTickets.status, "in_progress")
          )
        )
      );

    res.json({
      ...workspaceData,
      stats: {
        employeeCount: employeeCount?.count || 0,
        clientCount: clientCount?.count || 0,
        invoiceCount: invoiceCount?.count || 0,
        activeTickets: ticketCount?.count || 0
      }
    });
  } catch (error) {
    console.error("Error fetching workspace detail:", error);
    res.status(500).json({ error: "Failed to fetch workspace details" });
  }
}

/**
 * Create platform admin or support staff user
 */
export async function createPlatformUser(req: Request, res: Response) {
  try {
    const { email, firstName, lastName, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: "Email and role required" });
    }

    if (!["admin", "support_staff"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Check if user already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      // Update role
      const [updated] = await db
        .update(users)
        .set({ 
          role,
          firstName: firstName || existing.firstName,
          lastName: lastName || existing.lastName,
          updatedAt: new Date()
        })
        .where(eq(users.id, existing.id))
        .returning();

      return res.json(updated);
    }

    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        firstName,
        lastName,
        role,
        emailVerified: true // Platform users are pre-verified
      })
      .returning();

    res.json(newUser);
  } catch (error) {
    console.error("Error creating platform user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
}

/**
 * Get all platform users (admins and support staff)
 */
export async function getPlatformUsers(req: Request, res: Response) {
  try {
    const platformUsers = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.role, "admin"),
          eq(users.role, "support_staff")
        )
      )
      .orderBy(desc(users.createdAt));

    res.json(platformUsers);
  } catch (error) {
    console.error("Error fetching platform users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
}
