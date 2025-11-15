import { db } from "../db";
import { 
  workspaces, 
  employees, 
  clients, 
  subscriptions, 
  invoices,
  supportTickets,
  escalationTickets,
  shifts
} from "../../shared/schema";
import { eq, gte, lte, count, sum, sql, and } from "drizzle-orm";
import type { AnalyticsStats } from "../../shared/schema";
import { monitoringService } from "../monitoring";
import { getAutomationMetrics } from "./automationMetrics";

// Simple in-memory cache with 60s TTL
interface CacheEntry {
  data: AnalyticsStats;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get analytics stats for universal dashboard
 * @param workspaceId - Optional workspace ID for workspace-scoped stats (null for platform-wide)
 * @param bustCache - Force fresh data fetch
 */
export async function getAnalyticsStats(
  workspaceId: string | null,
  bustCache: boolean = false
): Promise<AnalyticsStats> {
  // Use distinct cache namespace to avoid collision if a workspace ID is literally "platform"
  const cacheKey = workspaceId ? `workspace:${workspaceId}` : 'platform';
  
  // Check cache
  if (!bustCache) {
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // Calculate date ranges for monthly revenue
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // Fetch all stats in parallel (but NOT automation metrics for platform scope)
  // CRITICAL FIX: Fetch BOTH workspace AND platform client counts to prevent data inconsistency
  const [
    workspacesData,
    employeesData,
    clientsData,
    platformClientsData,
    subscriptionsData,
    currentMonthRevenue,
    previousMonthRevenue,
    supportData,
    escalationsData,
    shiftsData,
    monitoringData
  ] = await Promise.all([
    // Workspace count
    workspaceId 
      ? Promise.resolve([{ count: 1 }])
      : db.select({ count: count() }).from(workspaces),
    
    // Employee count
    workspaceId 
      ? db.select({ count: count() }).from(employees).where(eq(employees.workspaceId, workspaceId))
      : db.select({ count: count() }).from(employees),
    
    // Client count (workspace-scoped when workspaceId provided)
    workspaceId
      ? db.select({ count: count() }).from(clients).where(eq(clients.workspaceId, workspaceId))
      : db.select({ count: count() }).from(clients),
    
    // Platform-wide client count (always global, even when workspace-scoped request)
    // This ensures summary.totalCustomers is always accurate
    workspaceId
      ? db.select({ count: count() }).from(clients)
      : Promise.resolve([{ count: 0 }]), // Avoid duplicate query for platform scope
    
    // Active subscriptions
    workspaceId
      ? db.select({ count: count() }).from(subscriptions)
          .where(and(
            eq(subscriptions.workspaceId, workspaceId),
            eq(subscriptions.status, 'active')
          ))
      : db.select({ count: count() }).from(subscriptions)
          .where(eq(subscriptions.status, 'active')),
    
    // Current month revenue
    workspaceId
      ? db.select({ total: sum(invoices.total) }).from(invoices)
          .where(and(
            eq(invoices.workspaceId, workspaceId),
            gte(invoices.paidAt, currentMonthStart)
          ))
      : db.select({ total: sum(invoices.total) }).from(invoices)
          .where(gte(invoices.paidAt, currentMonthStart)),
    
    // Previous month revenue
    workspaceId
      ? db.select({ total: sum(invoices.total) }).from(invoices)
          .where(and(
            eq(invoices.workspaceId, workspaceId),
            gte(invoices.paidAt, previousMonthStart),
            lte(invoices.paidAt, previousMonthEnd)
          ))
      : db.select({ total: sum(invoices.total) }).from(invoices)
          .where(and(
            gte(invoices.paidAt, previousMonthStart),
            lte(invoices.paidAt, previousMonthEnd)
          )),
    
    // Open support tickets
    workspaceId
      ? db.select({ count: count() }).from(supportTickets)
          .where(and(
            eq(supportTickets.workspaceId, workspaceId),
            sql`${supportTickets.status} IN ('open', 'in_progress')`
          ))
      : db.select({ count: count() }).from(supportTickets)
          .where(sql`${supportTickets.status} IN ('open', 'in_progress')`),
    
    // Unresolved escalations (where resolvedAt is null)
    workspaceId
      ? db.select({ count: count() }).from(escalationTickets)
          .where(and(
            eq(escalationTickets.workspaceId, workspaceId),
            sql`${escalationTickets.resolvedAt} IS NULL`
          ))
      : db.select({ count: count() }).from(escalationTickets)
          .where(sql`${escalationTickets.resolvedAt} IS NULL`),
    
    // Upcoming shifts (next 7 days)
    workspaceId
      ? db.select({ count: count() }).from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            gte(shifts.startTime, new Date()),
            lte(shifts.startTime, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
          ))
      : db.select({ count: count() }).from(shifts)
          .where(and(
            gte(shifts.startTime, new Date()),
            lte(shifts.startTime, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
          )),
    
    // Get system monitoring data (monitoring service returns current metrics)
    Promise.resolve({ cpu: 0, memory: 0 })
  ]);

  // Calculate revenue delta
  const currentRevenue = parseFloat(currentMonthRevenue[0]?.total || '0');
  const previousRevenue = parseFloat(previousMonthRevenue[0]?.total || '0');
  const revenueDelta = previousRevenue > 0 
    ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
    : 0;

  // Get workspace details if scoped
  let workspaceDetails = undefined;
  if (workspaceId) {
    const workspace = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    
    if (workspace[0]) {
      workspaceDetails = {
        id: workspace[0].id,
        name: workspace[0].name || 'My Workspace',
        tier: workspace[0].subscriptionTier || 'free',
        activeEmployees: employeesData[0]?.count || 0,
        activeClients: clientsData[0]?.count || 0,
        upcomingShifts: shiftsData[0]?.count || 0,
      };
    }
  }

  // Fetch automation metrics separately, only for workspace scope
  // This avoids expensive queries for platform-wide stats and ensures undefined for null workspace
  const automationMetrics = workspaceId ? await getAutomationMetrics(workspaceId) : undefined;

  const stats: AnalyticsStats = {
    summary: {
      totalWorkspaces: workspacesData[0]?.count || 0,
      // CRITICAL FIX: Always use platform-wide count for summary, even when workspace-scoped
      totalCustomers: workspaceId 
        ? (platformClientsData[0]?.count || 0)
        : (clientsData[0]?.count || 0),
      activeEmployees: employeesData[0]?.count || 0,
      monthlyRevenue: {
        amount: currentRevenue,
        currency: 'USD',
        previousMonth: previousRevenue,
        delta: revenueDelta,
      },
      activeSubscriptions: subscriptionsData[0]?.count || 0,
    },
    workspace: workspaceDetails,
    support: {
      openTickets: supportData[0]?.count || 0,
      unresolvedEscalations: escalationsData[0]?.count || 0,
      avgFirstResponseHours: 2.5, // TODO: Calculate from actual ticket data
      liveChats: {
        active: 0, // TODO: Get from WebSocket connection count
        staffOnline: 0,
      },
    },
    system: {
      cpu: monitoringData?.cpu || 0,
      memory: monitoringData?.memory || 0,
      database: {
        status: 'healthy', // TODO: Implement database health check
      },
      uptimeSeconds: process.uptime(),
      updatedAt: new Date().toISOString(),
    },
    // Add automation metrics only for workspace scope (undefined for platform scope)
    automation: automationMetrics,
  };

  // Cache the result
  cache.set(cacheKey, { data: stats, timestamp: Date.now() });

  return stats;
}

// Clear cache (useful for testing or manual refresh)
export function clearAnalyticsCache() {
  cache.clear();
}
