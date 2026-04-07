/**
 * Trinity Context Service
 * 
 * Resolves comprehensive user context for Trinity AI mascot including:
 * - Platform role (root_admin, support_agent, etc.)
 * - Workspace role (org_owner, department_manager, etc.)
 * - Subscription tier and add-on entitlements
 * - Organization topology and structure
 * - Support staff affiliation
 * - Org intelligence: automation readiness, gamification, FAST mode, notifications
 */

import { db } from '../db';
import { 
  users, 
  employees, 
  workspaces, 
  workspaceAddons,
  billingAddons,
  subscriptions,
  invoices,
  notifications,
  supportTickets,
  aiSuggestions,
  shifts,
  employeeDocuments,
  timeEntries,
  aiWorkboardTasks,
} from '@shared/schema';
import { payrollRuns } from '@shared/schema/domains/payroll';
import { eq, and, count, gte, lte, sql, desc, isNull, lt, ne } from 'drizzle-orm';
import { getUserPlatformRole, type PlatformRole, type WorkspaceRole } from '../rbac';
import { subagentConfidenceMonitor } from './ai-brain/subagentConfidenceMonitor';
import { platformHealthMonitor } from './ai-brain/platformHealthMonitor';
import { geminiClient } from './ai-brain/providers/geminiClient';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';
const log = createLogger('trinityContext');


// Platform diagnostics cache with 5-minute TTL
let diagnosticsCache: { data: PlatformDiagnostics; timestamp: number } | null = null;
const DIAGNOSTICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Org intelligence cache with 2-minute TTL (per workspace)
const orgIntelligenceCache = new Map<string, { data: OrgIntelligence; timestamp: number }>();
const ORG_INTEL_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Trinity context resolution cache with 30-second TTL (per user+workspace)
const trinityContextCache = new Map<string, { data: TrinityContext; timestamp: number }>();
const TRINITY_CONTEXT_CACHE_TTL = 30_000; // 30 seconds

// AI thought cache with 60-second TTL (per user+workspace) - avoids expensive Gemini calls
const thoughtCache = new Map<string, { data: string | null; timestamp: number }>();
const THOUGHT_CACHE_TTL = 60_000; // 60 seconds

export interface OrgIntelligence {
  automationReadiness: {
    score: number;
    level: 'hand_held' | 'graduated' | 'full_automation';
    canGraduate: boolean;
    topIssues: string[];
    recommendations: string[];
  } | null;
  workboardStats: {
    pendingTasks: number;
    completedToday: number;
    failedToday: number;
    avgCompletionTimeMs: number;
  } | null;
  notificationSummary: {
    unreadCount: number;
    urgentCount: number;
    categories: { type: string; count: number }[];
  } | null;
  businessMetrics: {
    invoicesPendingCount: number;
    invoicesOverdueCount: number;
    recentActivityScore: number;
  } | null;
  operationalIntelligence: {
    openShiftsCount: number;
    expiringCertsCount: number;
    clockedInNow: number;
    overdueTimesheets: number;
    todayCoverageTotal: number;
    todayCoverageFilled: number;
  } | null;
  payrollIntelligence: {
    pendingRunsCount: number;
    latestRunStatus: string | null;
    latestRunPeriodStart: Date | null;
    latestRunPeriodEnd: Date | null;
    latestRunGrossPay: string | null;
    draftRunsCount: number;
  } | null;
  priorityInsights: string[];
}

export interface PlatformDiagnostics {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  activeWorkspaces: number;
  totalUsers: number;
  recentErrors: number;
  subagentHealth: { healthy: number; degraded: number; critical: number };
  fastModeStats: { successRate: number; avgDuration: number; slaBreeches: number; totalExecutions: number };
  upgradeOpportunities: { workspaceId: string; workspaceName: string; reason: string }[];
  engagementAlerts: { type: string; message: string; priority: 'low' | 'medium' | 'high' }[];
  pendingNotificationSuggestions: number;
  supportTicketBacklog: { open: number; urgent: number; avgAgeHours: number };
  trialExpirations: { workspaceId: string; workspaceName: string; daysLeft: number }[];
  churnRiskCount: number;
}

export interface TrinityContext {
  userId: string;
  username: string;
  displayName: string;
  
  platformRole: PlatformRole;
  isPlatformStaff: boolean;
  isRootAdmin: boolean;
  isSupportRole: boolean;
  
  workspaceId?: string;
  workspaceName?: string;
  workspaceRole?: WorkspaceRole;
  isOrgOwner: boolean;
  isManager: boolean;
  
  subscriptionTier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  
  hasTrinityPro: boolean;
  activeAddons: string[];
  
  orgStats?: {
    employeeCount: number;
    departmentCount: number;
    isNewOrg: boolean;
  };
  
  orgIntelligence?: OrgIntelligence;
  platformDiagnostics?: PlatformDiagnostics;
  
  trinityAccessReason: 'platform_staff' | 'org_owner' | 'addon_subscriber' | 'trial' | 'none';
  trinityAccessLevel: 'full' | 'basic' | 'none';
  
  /**
   * Trinity operational mode:
   * - 'coo'    — COO mode for org owners/managers at security companies (full business intelligence)
   * - 'guru'   — Tech Guru mode for platform support agents (platform diagnostics + health)
   * - 'standard' — Standard mode for other authenticated users
   */
  trinityMode: 'coo' | 'guru' | 'standard';
  
  greeting: string;
  persona: 'executive_advisor' | 'support_partner' | 'coo_advisor' | 'onboarding_guide' | 'platform_guru' | 'standard';
}

const PLATFORM_STAFF_ROLES: PlatformRole[] = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
const MANAGER_ROLES: WorkspaceRole[] = ['org_owner', 'co_owner', 'department_manager', 'supervisor'];

async function gatherOrgIntelligence(workspaceId: string, userId: string): Promise<OrgIntelligence> {
  // Check cache first
  const cacheKey = `${workspaceId}:${userId}`;
  const cached = orgIntelligenceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ORG_INTEL_CACHE_TTL) {
    return cached.data;
  }
  
  const priorityInsights: string[] = [];
  
  let automationReadiness: OrgIntelligence['automationReadiness'] = null;
  let workboardStats: OrgIntelligence['workboardStats'] = null;
  let notificationSummary: OrgIntelligence['notificationSummary'] = null;
  let businessMetrics: OrgIntelligence['businessMetrics'] = null;
  let operationalIntelligence: OrgIntelligence['operationalIntelligence'] = null;
  let payrollIntelligence: OrgIntelligence['payrollIntelligence'] = null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const sevenDaysFromNow = new Date(today.getTime() + 7 * 86400000);
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 86400000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000);

  try {
    // Run ALL queries in parallel for maximum speed
    const [
      monitoringSummary,
      pendingResult,
      completedTodayResult,
      failedTodayResult,
      unreadResult,
      urgentResult,
      categoryBreakdown,
      sentInvoicesResult,
      overdueInvoicesResult,
      openShiftsResult,
      expiringCertsResult,
      clockedInNowResult,
      overdueTimesheetsResult,
      pendingPayrollRunsResult,
      draftPayrollRunsResult,
      latestPayrollRunResult,
      todayTotalShiftsResult,
      todayFilledShiftsResult,
    ] = await Promise.all([
      // Automation readiness (may have internal caching)
      subagentConfidenceMonitor.getTrinityMonitoringSummary(workspaceId).catch(() => null),
      // Workboard stats
      db.select({ count: count() }).from(aiWorkboardTasks)
        .where(and(eq(aiWorkboardTasks.workspaceId, workspaceId), eq(aiWorkboardTasks.status, 'pending'))),
      db.select({ count: count() }).from(aiWorkboardTasks)
        .where(and(eq(aiWorkboardTasks.workspaceId, workspaceId), eq(aiWorkboardTasks.status, 'completed'), gte(aiWorkboardTasks.completedAt, today))),
      db.select({ count: count() }).from(aiWorkboardTasks)
        .where(and(eq(aiWorkboardTasks.workspaceId, workspaceId), eq(aiWorkboardTasks.status, 'failed'), gte(aiWorkboardTasks.updatedAt, today))),
      // Notification counts
      db.select({ count: count() }).from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
      db.select({ count: count() }).from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false), eq(notifications.category, 'alerts'))),
      db.select({ type: notifications.type, count: count() }).from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))).groupBy(notifications.type),
      // Business metrics
      db.select({ count: count() }).from(invoices)
        .where(and(eq(invoices.workspaceId, workspaceId), sql`${invoices.status} = 'sent'`)),
      db.select({ count: count() }).from(invoices)
        .where(and(eq(invoices.workspaceId, workspaceId), sql`${invoices.status} = 'overdue'`)),
      // Operational intelligence — open shifts next 7 days
      db.select({ count: count() }).from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          isNull(shifts.employeeId),
          gte(shifts.startTime, today),
          lte(shifts.startTime, sevenDaysFromNow),
          ne(shifts.status, 'cancelled'),
        )).catch(() => [{ count: 0 }]),
      // Expiring certifications/licenses in next 30 days
      db.select({ count: count() }).from(employeeDocuments)
        .where(and(
          eq(employeeDocuments.workspaceId, workspaceId),
          gte(employeeDocuments.expirationDate, today),
          lte(employeeDocuments.expirationDate, thirtyDaysFromNow),
          sql`${employeeDocuments.status} = 'approved'`,
        )).catch(() => [{ count: 0 }]),
      // Currently clocked in (no clock-out in last 24h)
      db.select({ count: count() }).from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          isNull(timeEntries.clockOut),
          gte(timeEntries.clockIn, twentyFourHoursAgo),
        )).catch(() => [{ count: 0 }]),
      // Overdue timesheets — pending approval older than 7 days
      db.select({ count: count() }).from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          sql`${timeEntries.status} = 'pending'`,
          lt(timeEntries.clockIn, sevenDaysAgo),
        )).catch(() => [{ count: 0 }]),
      // Payroll: runs pending approval (submitted/review status)
      db.select({ count: count() }).from(payrollRuns)
        .where(and(
          eq(payrollRuns.workspaceId, workspaceId),
          sql`${payrollRuns.status} IN ('pending', 'approved')`,
        )).catch(() => [{ count: 0 }]),
      // Payroll: draft runs (not yet submitted)
      db.select({ count: count() }).from(payrollRuns)
        .where(and(
          eq(payrollRuns.workspaceId, workspaceId),
          sql`${payrollRuns.status} = 'draft'`,
        )).catch(() => [{ count: 0 }]),
      // Payroll: latest run (for status/period context)
      db.select({
        status: payrollRuns.status,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        totalGrossPay: payrollRuns.totalGrossPay,
      }).from(payrollRuns)
        .where(eq(payrollRuns.workspaceId, workspaceId))
        .orderBy(desc(payrollRuns.periodEnd))
        .limit(1)
        .catch(() => []),
      // Today's schedule coverage — total shifts today
      db.select({ count: count() }).from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, today),
          lt(shifts.startTime, new Date(today.getTime() + 86400000)),
          ne(shifts.status, 'cancelled'),
        )).catch(() => [{ count: 0 }]),
      // Today's filled shifts (assigned employee)
      db.select({ count: count() }).from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, today),
          lt(shifts.startTime, new Date(today.getTime() + 86400000)),
          ne(shifts.status, 'cancelled'),
          sql`${shifts.employeeId} IS NOT NULL`,
        )).catch(() => [{ count: 0 }]),
    ]);
    
    // Process automation readiness
    if (monitoringSummary) {
      automationReadiness = {
        score: monitoringSummary.orgScore,
        level: monitoringSummary.level as 'hand_held' | 'graduated' | 'full_automation',
        canGraduate: monitoringSummary.canGraduate,
        topIssues: monitoringSummary.topIssues,
        recommendations: monitoringSummary.recommendations,
      };
      if (monitoringSummary.canGraduate) {
        priorityInsights.push(`Your org is ready to graduate to ${monitoringSummary.level === 'hand_held' ? 'graduated' : 'full automation'} mode!`);
      }
      if (monitoringSummary.topIssues.length > 0) {
        priorityInsights.push(`Automation alert: ${monitoringSummary.topIssues[0]}`);
      }
    }
    
    // Process workboard stats
    workboardStats = {
      pendingTasks: pendingResult[0]?.count || 0,
      completedToday: completedTodayResult[0]?.count || 0,
      failedToday: failedTodayResult[0]?.count || 0,
      avgCompletionTimeMs: 0,
    };
    if (workboardStats.pendingTasks > 5) priorityInsights.push(`${workboardStats.pendingTasks} AI tasks pending in queue`);
    if (workboardStats.failedToday > 0) priorityInsights.push(`${workboardStats.failedToday} task(s) failed today - review recommended`);
    if (workboardStats.completedToday > 0) priorityInsights.push(`${workboardStats.completedToday} AI task(s) completed today`);
    
    // Process notification summary
    notificationSummary = {
      unreadCount: unreadResult[0]?.count || 0,
      urgentCount: urgentResult[0]?.count || 0,
      categories: categoryBreakdown.map(c => ({ type: c.type || 'general', count: c.count })),
    };
    if (notificationSummary.unreadCount > 0) priorityInsights.push(`${notificationSummary.unreadCount} unread notification${notificationSummary.unreadCount !== 1 ? 's' : ''}`);
    if (notificationSummary.urgentCount > 0) priorityInsights.unshift(`${notificationSummary.urgentCount} urgent notification${notificationSummary.urgentCount !== 1 ? 's' : ''} need attention`);
    
    // Process business metrics
    businessMetrics = {
      invoicesPendingCount: sentInvoicesResult[0]?.count || 0,
      invoicesOverdueCount: overdueInvoicesResult[0]?.count || 0,
      recentActivityScore: 0,
    };
    if (businessMetrics.invoicesOverdueCount > 0) priorityInsights.unshift(`${businessMetrics.invoicesOverdueCount} overdue invoice(s) need attention`);
    if (businessMetrics.invoicesPendingCount > 3) priorityInsights.push(`${businessMetrics.invoicesPendingCount} pending invoices to process`);

    // Process operational intelligence
    const openShifts = openShiftsResult[0]?.count || 0;
    const expiringCerts = expiringCertsResult[0]?.count || 0;
    const clockedIn = clockedInNowResult[0]?.count || 0;
    const overdueTs = overdueTimesheetsResult[0]?.count || 0;
    const todayCoverageTotal = todayTotalShiftsResult[0]?.count || 0;
    const todayCoverageFilled = todayFilledShiftsResult[0]?.count || 0;
    operationalIntelligence = {
      openShiftsCount: openShifts,
      expiringCertsCount: expiringCerts,
      clockedInNow: clockedIn,
      overdueTimesheets: overdueTs,
      todayCoverageTotal,
      todayCoverageFilled,
    };
    if (openShifts > 0) priorityInsights.unshift(`${openShifts} open shift${openShifts !== 1 ? 's' : ''} need coverage in the next 7 days`);
    if (expiringCerts > 0) priorityInsights.push(`${expiringCerts} certification${expiringCerts !== 1 ? 's' : ''} expiring within 30 days`);
    if (overdueTs > 0) priorityInsights.push(`${overdueTs} timesheet${overdueTs !== 1 ? 's' : ''} pending approval for over 7 days`);
    if (todayCoverageTotal > 0) {
      const uncovered = todayCoverageTotal - todayCoverageFilled;
      if (uncovered > 0) priorityInsights.unshift(`${uncovered} of ${todayCoverageTotal} shift${todayCoverageTotal !== 1 ? 's' : ''} today are uncovered`);
    }

    // Process payroll intelligence
    const pendingPayroll = pendingPayrollRunsResult[0]?.count || 0;
    const draftPayroll = draftPayrollRunsResult[0]?.count || 0;
    const latestRun = latestPayrollRunResult[0] || null;
    payrollIntelligence = {
      pendingRunsCount: pendingPayroll,
      draftRunsCount: draftPayroll,
      latestRunStatus: latestRun?.status || null,
      latestRunPeriodStart: latestRun?.periodStart || null,
      latestRunPeriodEnd: latestRun?.periodEnd || null,
      latestRunGrossPay: latestRun?.totalGrossPay || null,
    };
    if (pendingPayroll > 0) priorityInsights.unshift(`${pendingPayroll} payroll run${pendingPayroll !== 1 ? 's' : ''} pending approval`);
    if (draftPayroll > 0) priorityInsights.push(`${draftPayroll} draft payroll run${draftPayroll !== 1 ? 's' : ''} not yet submitted`);
    
  } catch (err) {
    log.error('[TrinityContext] gatherOrgIntelligence error:', err);
  }
  
  const result: OrgIntelligence = {
    automationReadiness,
    workboardStats,
    notificationSummary,
    businessMetrics,
    operationalIntelligence,
    payrollIntelligence,
    priorityInsights: priorityInsights.slice(0, 6),
  };
  
  // Cache the result
  orgIntelligenceCache.set(cacheKey, { data: result, timestamp: Date.now() });
  
  // Clean up old cache entries (keep max 50)
  if (orgIntelligenceCache.size > 50) {
    const oldestKey = orgIntelligenceCache.keys().next().value;
    if (oldestKey) orgIntelligenceCache.delete(oldestKey);
  }
  
  return result;
}

export async function resolveTrinityContext(userId: string, workspaceId?: string): Promise<TrinityContext> {
  const cacheKey = `${userId}:${workspaceId || 'default'}`;
  const cached = trinityContextCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRINITY_CONTEXT_CACHE_TTL) {
    return cached.data;
  }

  const [userResult, platformRole, ownedWorkspaceResult] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    getUserPlatformRole(userId),
    db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1),
  ]);
  
  const [user] = userResult;
  if (!user) {
    return getAnonymousContext();
  }
  
  const isPlatformStaff = PLATFORM_STAFF_ROLES.includes(platformRole);
  const isRootAdmin = platformRole === 'root_admin';
  const isSupportRole = ['support_manager', 'support_agent', 'sysop'].includes(platformRole);
  
  const [ownedWorkspace] = ownedWorkspaceResult;
  const isOrgOwner = !!ownedWorkspace;
  const effectiveWorkspaceId = workspaceId || ownedWorkspace?.id;
  
  let workspaceName: string | undefined;
  let workspaceRole: WorkspaceRole | undefined;
  let subscriptionTier: TrinityContext['subscriptionTier'] = 'free';
  let subscriptionStatus: TrinityContext['subscriptionStatus'] = 'active';
  let hasTrinityPro = false;
  let activeAddons: string[] = [];
  let orgStats: TrinityContext['orgStats'] | undefined;
  
  if (effectiveWorkspaceId) {
    const [wsResult, employee, subscriptionResult, addons, employeeCountResult] = await Promise.all([
      db.select().from(workspaces).where(eq(workspaces.id, effectiveWorkspaceId)),
      db.query.employees.findFirst({
        where: and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, effectiveWorkspaceId)
        ),
      }),
      db.select().from(subscriptions).where(eq(subscriptions.workspaceId, effectiveWorkspaceId)),
      db.select({
        addonKey: billingAddons.addonKey,
        addonName: billingAddons.name,
        status: workspaceAddons.status,
      })
        .from(workspaceAddons)
        .innerJoin(billingAddons, eq(workspaceAddons.addonId, billingAddons.id))
        .where(and(
          eq(workspaceAddons.workspaceId, effectiveWorkspaceId),
          eq(workspaceAddons.status, 'active')
        )),
      db.select({ count: count() }).from(employees).where(eq(employees.workspaceId, effectiveWorkspaceId)),
    ]);
    
    const [ws] = wsResult;
    workspaceName = ws?.name;
    
    workspaceRole = (employee?.workspaceRole || (isOrgOwner ? 'org_owner' : undefined)) as WorkspaceRole | undefined;
    
    const [subscription] = subscriptionResult;
    if (subscription) {
      subscriptionTier = subscription.plan as TrinityContext['subscriptionTier'];
      subscriptionStatus = subscription.status as TrinityContext['subscriptionStatus'];
    }
    
    activeAddons = addons.map(a => a.addonKey);
    hasTrinityPro = activeAddons.includes('trinity_pro');
    
    const [employeeCount] = employeeCountResult;
    const empCount = employeeCount?.count || 0;
    const isNewOrg = empCount < 5;
    
    orgStats = {
      employeeCount: empCount,
      departmentCount: 0,
      isNewOrg,
    };
  }
  
  let trinityAccessReason: TrinityContext['trinityAccessReason'] = 'none';
  let trinityAccessLevel: TrinityContext['trinityAccessLevel'] = 'none';
  
  if (isPlatformStaff) {
    trinityAccessReason = 'platform_staff';
    trinityAccessLevel = 'full';
  } else if (isOrgOwner) {
    trinityAccessReason = 'org_owner';
    trinityAccessLevel = 'full';
  } else if (hasTrinityPro) {
    trinityAccessReason = 'addon_subscriber';
    trinityAccessLevel = 'full';
  } else if (subscriptionStatus === 'trial') {
    trinityAccessReason = 'trial';
    trinityAccessLevel = 'basic';
  }
  
  const isManager = workspaceRole ? MANAGER_ROLES.includes(workspaceRole) : false;
  
  let persona: TrinityContext['persona'] = 'standard';
  let trinityMode: TrinityContext['trinityMode'] = 'standard';
  let greeting = `Hello${user.firstName ? `, ${user.firstName}` : ''}!`;
  
  // TECH GURU MODE - Platform support agents get advanced diagnostics and proactive monitoring
  if (isRootAdmin) {
    persona = 'platform_guru';
    trinityMode = 'guru';
    greeting = `Welcome back, ${user.firstName || 'Root Administrator'}! Trinity Tech Guru mode active. Platform diagnostics, engagement opportunities, and notification workflows at your command.`;
  } else if (isSupportRole) {
    persona = 'platform_guru';
    trinityMode = 'guru';
    greeting = `Hi ${user.firstName || 'Support Team'}! Trinity Tech Guru mode active. Analyzing platform health, tracking upgrade opportunities, and monitoring engagement metrics.`;
  } else if (isPlatformStaff) {
    persona = 'platform_guru';
    trinityMode = 'guru';
    greeting = `Hello ${user.firstName || 'Administrator'}! Trinity Tech Guru mode at your service. Platform monitoring and diagnostics ready.`;
  // COO MODE - Org owners and managers get full business intelligence for their security company
  } else if (isOrgOwner && orgStats?.isNewOrg) {
    persona = 'onboarding_guide';
    trinityMode = 'coo';
    greeting = `Welcome ${user.firstName || 'there'}! I'm Trinity, your AI COO. Let me help you get ${workspaceName || 'your organization'} fully operational!`;
  } else if (isOrgOwner || hasTrinityPro) {
    persona = 'coo_advisor';
    trinityMode = 'coo';
    greeting = `Hi ${user.firstName || 'there'}! Trinity COO mode active. Ready to help optimize ${workspaceName || 'your business'} operations today.`;
  } else if (isManager) {
    persona = 'coo_advisor';
    trinityMode = 'coo';
    greeting = `Hello ${user.firstName || 'there'}! I'm Trinity, your management co-pilot. Ready to assist with your team operations.`;
  }
  // STANDARD MODE - All other authenticated users
  
  let orgIntelligence: OrgIntelligence | undefined;
  let platformDiagnostics: PlatformDiagnostics | undefined;

  const shouldGatherOrgIntel = effectiveWorkspaceId && 
    (isOrgOwner || isManager || hasTrinityPro || trinityMode === 'coo') && 
    !isPlatformStaff;
  
  const [orgIntelResult, platformDiagResult] = await Promise.all([
    shouldGatherOrgIntel
      ? gatherOrgIntelligence(effectiveWorkspaceId, userId).catch((err: any) => {
          log.warn('[TrinityContext] gatherOrgIntelligence failed:', err?.message);
          return undefined;
        })
      : Promise.resolve(undefined),
    trinityMode === 'guru'
      ? gatherPlatformDiagnostics().catch((err: any) => {
          log.warn('[TrinityContext] gatherPlatformDiagnostics failed:', err?.message);
          return undefined;
        })
      : Promise.resolve(undefined),
  ]);
  orgIntelligence = orgIntelResult;
  platformDiagnostics = platformDiagResult;
  
  const result: TrinityContext = {
    userId,
    username: user.email?.split('@')[0] || 'User',
    displayName: user.firstName ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : (user.email?.split('@')[0] || 'User'),
    
    platformRole,
    isPlatformStaff,
    isRootAdmin,
    isSupportRole,
    
    workspaceId: effectiveWorkspaceId,
    workspaceName,
    workspaceRole,
    isOrgOwner,
    isManager,
    
    subscriptionTier,
    subscriptionStatus,
    
    hasTrinityPro,
    activeAddons,
    
    orgStats,
    orgIntelligence,
    platformDiagnostics,
    
    trinityAccessReason,
    trinityAccessLevel,
    trinityMode,
    
    greeting,
    persona,
  };

  trinityContextCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

function getAnonymousContext(): TrinityContext {
  return {
    userId: 'anonymous',
    username: 'Guest',
    displayName: 'Guest',
    
    platformRole: 'none',
    isPlatformStaff: false,
    isRootAdmin: false,
    isSupportRole: false,
    
    isOrgOwner: false,
    isManager: false,
    
    subscriptionTier: 'free',
    subscriptionStatus: 'active',
    
    hasTrinityPro: false,
    activeAddons: [],
    
    trinityAccessReason: 'none',
    trinityAccessLevel: 'basic',
    trinityMode: 'standard',
    
    greeting: 'Hello! I\'m Trinity, your AI guide. Sign in to unlock my full capabilities!',
    persona: 'standard',
  };
}

/**
 * Gather platform-wide diagnostics for Guru mode
 * Analyzes platform health, engagement opportunities, and upgrade candidates
 * Uses 5-minute caching to reduce database load
 * OPTIMIZED: Runs all queries in parallel for faster response times
 */
async function gatherPlatformDiagnostics(): Promise<PlatformDiagnostics> {
  // Return cached data if still valid
  if (diagnosticsCache && Date.now() - diagnosticsCache.timestamp < DIAGNOSTICS_CACHE_TTL) {
    return diagnosticsCache.data;
  }
  
  const upgradeOpportunities: PlatformDiagnostics['upgradeOpportunities'] = [];
  const engagementAlerts: PlatformDiagnostics['engagementAlerts'] = [];
  const trialExpirations: PlatformDiagnostics['trialExpirations'] = [];
  
  let activeWorkspaces = 0;
  let totalUsers = 0;
  let recentErrors = 0;
  let churnRiskCount = 0;
  let overallHealth: PlatformDiagnostics['overallHealth'] = 'healthy';
  const supportTicketBacklog = { open: 0, urgent: 0, avgAgeHours: 0 };
  const fastModeStats = { successRate: 0, avgDuration: 0, slaBreeches: 0, totalExecutions: 0 };
  
  try {
    // Date calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Run ALL queries in parallel for maximum speed
    const [
      wsCountResult,
      userCountResult,
      freeWorkspacesResult,
      inactiveWorkspacesResult,
      failedTasksResult,
      openTicketsResult,
      urgentTicketsResult,
      expiringTrialsResult,
      recentTasksResult
    ] = await Promise.all([
      // Count active workspaces
      db.select({ count: count() }).from(workspaces).where(eq(workspaces.subscriptionStatus, 'active')),
      // Count total users
      db.select({ count: count() }).from(users),
      // Free workspaces for upgrade opportunities
      db.select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
        .where(and(eq(workspaces.subscriptionStatus, 'active'), eq(subscriptions.plan, 'free')))
        .limit(5),
      // Inactive workspaces
      db.select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(and(eq(workspaces.subscriptionStatus, 'active'), sql`${workspaces.updatedAt} < ${thirtyDaysAgo}`))
        .limit(10),
      // Failed tasks today
      db.select({ count: count() }).from(aiWorkboardTasks)
        .where(and(eq(aiWorkboardTasks.status, 'failed'), gte(aiWorkboardTasks.updatedAt, today))),
      // Open tickets
      db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.status, 'open')),
      // Urgent tickets
      db.select({ count: count() }).from(supportTickets)
        .where(and(eq(supportTickets.status, 'open'), eq(supportTickets.priority, 'urgent'))),
      // Expiring trials
      db.select({ id: subscriptions.workspaceId, name: workspaces.name, trialEndsAt: subscriptions.trialEndsAt })
        .from(subscriptions)
        .innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
        .where(and(eq(subscriptions.status, 'trial'), lte(subscriptions.trialEndsAt, sevenDaysFromNow), gte(subscriptions.trialEndsAt, new Date())))
        .limit(10),
      // Recent tasks for FAST mode stats
      db.select({ status: aiWorkboardTasks.status, durationMs: sql<number>`EXTRACT(EPOCH FROM (${aiWorkboardTasks.completedAt} - ${aiWorkboardTasks.createdAt})) * 1000` })
        .from(aiWorkboardTasks)
        .where(and(gte(aiWorkboardTasks.createdAt, sevenDaysAgo), sql`${aiWorkboardTasks.completedAt} IS NOT NULL`))
        .limit(100)
    ]);
    
    // Process results
    activeWorkspaces = wsCountResult[0]?.count || 0;
    totalUsers = userCountResult[0]?.count || 0;
    
    // Upgrade opportunities - batch task counts in parallel
    const taskCountPromises = freeWorkspacesResult.map(ws => 
      db.select({ count: count() }).from(aiWorkboardTasks).where(eq(aiWorkboardTasks.workspaceId, ws.id))
    );
    const taskCounts = await Promise.all(taskCountPromises);
    freeWorkspacesResult.forEach((ws, idx) => {
      const taskCount = taskCounts[idx]?.[0]?.count || 0;
      if (taskCount > 10) {
        upgradeOpportunities.push({
          workspaceId: ws.id,
          workspaceName: ws.name || 'Unknown',
          reason: `High AI workboard activity (${taskCount} tasks) - good candidate for Business Buddy`,
        });
      }
    });
    
    // Process inactive workspaces
    churnRiskCount = inactiveWorkspacesResult.length;
    for (const ws of inactiveWorkspacesResult) {
      engagementAlerts.push({
        type: 'inactive_workspace',
        message: `${ws.name || 'Workspace'} hasn't had activity in 30+ days`,
        priority: 'medium',
      });
    }
    
    // Process failed tasks
    recentErrors = failedTasksResult[0]?.count || 0;
    if (recentErrors > 10) {
      overallHealth = 'critical';
      engagementAlerts.push({ type: 'high_error_rate', message: `${recentErrors} AI tasks failed today - investigation recommended`, priority: 'high' });
    } else if (recentErrors > 5) {
      overallHealth = 'degraded';
      engagementAlerts.push({ type: 'elevated_errors', message: `${recentErrors} AI tasks failed today - monitoring advised`, priority: 'medium' });
    }
    
    // Process support tickets
    supportTicketBacklog.open = openTicketsResult[0]?.count || 0;
    supportTicketBacklog.urgent = urgentTicketsResult[0]?.count || 0;
    if (supportTicketBacklog.urgent > 5) {
      engagementAlerts.push({ type: 'urgent_tickets', message: `${supportTicketBacklog.urgent} urgent support tickets awaiting response`, priority: 'high' });
    }
    
    // Process expiring trials
    for (const trial of expiringTrialsResult) {
      if (trial.trialEndsAt) {
        const daysLeft = Math.ceil((trial.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        trialExpirations.push({ workspaceId: trial.id || '', workspaceName: trial.name || 'Unknown', daysLeft });
        if (daysLeft <= 3) {
          engagementAlerts.push({ type: 'trial_expiring', message: `${trial.name || 'Workspace'} trial expires in ${daysLeft} day(s) - conversion opportunity`, priority: daysLeft <= 1 ? 'high' : 'medium' });
        }
      }
    }
    
    // Process FAST mode stats
    if (recentTasksResult.length > 0) {
      const completed = recentTasksResult.filter(t => t.status === 'completed').length;
      fastModeStats.totalExecutions = recentTasksResult.length;
      fastModeStats.successRate = Math.round((completed / recentTasksResult.length) * 100);
      fastModeStats.avgDuration = Math.round(recentTasksResult.reduce((sum, t) => sum + (t.durationMs || 0), 0) / recentTasksResult.length);
      fastModeStats.slaBreeches = recentTasksResult.filter(t => (t.durationMs || 0) > 30000).length;
    }
    
  } catch {
  }
  
  // Estimate subagent health from org readiness scores
  const subagentHealth = { healthy: 8, degraded: 0, critical: 0 };
  
  try {
    const sampleWorkspaces = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.subscriptionStatus, 'active'))
      .limit(5);
    
    for (const ws of sampleWorkspaces) {
      const readiness = await subagentConfidenceMonitor.getOrgAutomationReadiness(ws.id);
      if (readiness) {
        if (readiness.overallScore < 40) {
          subagentHealth.critical++;
          subagentHealth.healthy--;
        } else if (readiness.overallScore < 70) {
          subagentHealth.degraded++;
          subagentHealth.healthy--;
        }
      }
    }
  } catch {
  }
  
  // Count pending notification suggestions from trinity_guru
  let pendingNotificationSuggestions = 0;
  try {
    const [suggestionCount] = await db
      .select({ count: count() })
      .from(aiSuggestions)
      .where(and(
        eq(aiSuggestions.suggestionType, 'platform_notification'),
        eq(aiSuggestions.sourceSystem, 'trinity_guru'),
        eq(aiSuggestions.status, 'pending')
      ));
    pendingNotificationSuggestions = suggestionCount?.count || 0;
  } catch {
  }
  
  const result: PlatformDiagnostics = {
    overallHealth,
    activeWorkspaces,
    totalUsers,
    recentErrors,
    subagentHealth,
    fastModeStats,
    upgradeOpportunities,
    engagementAlerts,
    pendingNotificationSuggestions,
    supportTicketBacklog,
    trialExpirations,
    churnRiskCount,
  };
  
  // Cache the result
  diagnosticsCache = { data: result, timestamp: Date.now() };
  
  return result;
}

/**
 * Create a notification suggestion from Trinity Guru mode
 * These are queued for approval in the System tab
 */
export async function createNotificationSuggestion(params: {
  title: string;
  description: string;
  suggestedAction?: string;
  estimatedImpact?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  targetType?: string;
  targetId?: string;
}): Promise<{ success: boolean; suggestionId?: string; error?: string }> {
  try {
    // Use a platform-level workspace ID for global suggestions
    const [result] = await db
      .insert(aiSuggestions)
      .values({
        workspaceId: PLATFORM_WORKSPACE_ID,
        suggestionType: 'platform_notification',
        sourceSystem: 'trinity_guru',
        title: params.title,
        description: params.description,
        suggestedAction: params.suggestedAction || 'Send notification to affected users',
        estimatedImpact: params.estimatedImpact || 'Improved user engagement and platform awareness',
        priority: params.priority || 'normal',
        targetType: params.targetType || 'platform',
        targetId: params.targetId,
        status: 'pending',
        confidenceScore: 85,
      })
      .returning({ id: aiSuggestions.id });
    
    // Invalidate cache so next fetch shows updated count
    diagnosticsCache = null;
    
    return { success: true, suggestionId: result.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Get pending notification suggestions for System tab approval
 */
export async function getPendingNotificationSuggestions(limit = 20): Promise<{
  suggestions: Array<{
    id: string;
    title: string;
    description: string;
    suggestedAction: string | null;
    priority: string | null;
    createdAt: Date | null;
  }>;
}> {
  try {
    const suggestions = await db
      .select({
        id: aiSuggestions.id,
        title: aiSuggestions.title,
        description: aiSuggestions.description,
        suggestedAction: aiSuggestions.suggestedAction,
        priority: aiSuggestions.priority,
        createdAt: aiSuggestions.createdAt,
      })
      .from(aiSuggestions)
      .where(and(
        eq(aiSuggestions.suggestionType, 'platform_notification'),
        eq(aiSuggestions.sourceSystem, 'trinity_guru'),
        eq(aiSuggestions.status, 'pending')
      ))
      .orderBy(desc(aiSuggestions.createdAt))
      .limit(limit);
    
    return { suggestions };
  } catch {
    return { suggestions: [] };
  }
}

/**
 * Approve or reject a notification suggestion
 */
export async function handleNotificationSuggestion(
  suggestionId: string,
  action: 'approve' | 'reject',
  approvedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(aiSuggestions)
      .set({
        status: action === 'approve' ? 'accepted' : 'rejected',
        updatedAt: new Date(),
      })
      .where(eq(aiSuggestions.id, suggestionId));
    
    // Invalidate cache
    diagnosticsCache = null;
    
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Generate a contextual thought for Trinity using REAL Gemini AI
 * 
 * This function builds rich context from the TrinityContext and sends it to
 * Gemini for intelligent, personality-driven thought generation.
 * Falls back to simple thoughts if AI is unavailable.
 */
export async function generateContextualThought(context: TrinityContext): Promise<string | null> {
  if (context.trinityAccessLevel === 'none') {
    return null;
  }
  
  const thoughtCacheKey = `${context.userId}:${context.workspaceId || 'default'}`;
  const cachedThought = thoughtCache.get(thoughtCacheKey);
  if (cachedThought && Date.now() - cachedThought.timestamp < THOUGHT_CACHE_TTL) {
    return cachedThought.data;
  }

  const name = context.displayName || 'there';
  const org = context.workspaceName || 'your organization';
  const employeeCount = context.orgStats?.employeeCount || 0;
  const intel = context.orgIntelligence;
  
  // Build rich context string for AI
  const contextParts: string[] = [];
  
  // Add user/org context
  contextParts.push(`User: ${name}`);
  contextParts.push(`Organization: ${org}`);
  if (employeeCount > 0) {
    contextParts.push(`Team size: ${employeeCount} employees`);
  }
  
  // Add role context
  if (context.isRootAdmin) {
    contextParts.push('Role: Root administrator with full platform access');
  } else if (context.isSupportRole) {
    contextParts.push('Role: Platform support staff');
  } else if (context.isOrgOwner) {
    contextParts.push('Role: Organization owner');
  } else if (context.isManager) {
    contextParts.push('Role: Manager');
  } else {
    contextParts.push('Role: Team member');
  }
  
  // Add subscription context
  if (context.hasTrinityPro) {
    contextParts.push('Subscription: Trinity Pro (advanced features unlocked)');
  } else if (context.trinityMode === 'coo') {
    contextParts.push('Mode: Trinity COO — full business intelligence active');
  }
  
  // Add live intelligence data if available
  if (intel?.priorityInsights?.length) {
    contextParts.push(`Priority insights: ${intel.priorityInsights.slice(0, 2).join('; ')}`);
  }
  
  if (intel?.automationReadiness) {
    const auto = intel.automationReadiness;
    contextParts.push(`Automation readiness: ${auto.score}%${auto.canGraduate ? ' (ready to graduate!)' : ''}`);
    if (auto.recommendations?.length) {
      contextParts.push(`AI recommendation: ${auto.recommendations[0]}`);
    }
  }
  
  if (intel?.workboardStats) {
    const wb = intel.workboardStats;
    if (wb.completedToday > 0 || wb.pendingTasks > 0) {
      contextParts.push(`AI tasks: ${wb.completedToday} completed today, ${wb.pendingTasks} pending`);
    }
  }
  
  if (intel?.businessMetrics) {
    const bm = intel.businessMetrics;
    if (bm.invoicesOverdueCount && bm.invoicesOverdueCount > 0) {
      contextParts.push(`Attention needed: ${bm.invoicesOverdueCount} overdue invoice(s)`);
    }
    if (bm.invoicesPendingCount && bm.invoicesPendingCount > 0) {
      contextParts.push(`Pending invoices: ${bm.invoicesPendingCount}`);
    }
  }
  
  if (context.isRootAdmin || context.isSupportRole) {
    try {
      const healthInsight = await platformHealthMonitor.getTrinityHealthInsight();
      if (healthInsight) {
        contextParts.push(`Platform health: ${healthInsight}`);
      }
    } catch {
    }
  }
  
  // Add new org onboarding context
  if (context.orgStats?.isNewOrg) {
    contextParts.push('Status: New organization, just getting started');
  }
  
  // Determine Trinity mode for AI thought generation
  let mode: 'coo' | 'guru' | 'standard' = 'standard';
  if (context.isRootAdmin || context.isSupportRole || context.isPlatformStaff) {
    mode = 'guru';
  } else if (context.trinityMode === 'coo' || context.hasTrinityPro || context.isOrgOwner) {
    mode = 'coo';
  }
  
  try {
    const aiThought = await geminiClient.generateTrinityThought({
      context: contextParts.join('\n'),
      displayName: name,
      workspaceId: context.workspaceId,
      mode,
    });
    
    if (aiThought) {
      log.info(`[Trinity] AI-generated thought for ${name} (${mode} mode)`);
      thoughtCache.set(thoughtCacheKey, { data: aiThought, timestamp: Date.now() });
      return aiThought;
    }
  } catch (error) {
    log.warn('[Trinity] AI thought generation unavailable, using fallback:', error);
  }
  
  const fallback = generateFallbackThought(context, name, org, employeeCount);
  thoughtCache.set(thoughtCacheKey, { data: fallback, timestamp: Date.now() });
  return fallback;
}

/**
 * Fallback thought generation when Gemini is unavailable
 * Uses minimal, context-appropriate responses
 */
function generateFallbackThought(
  context: TrinityContext, 
  name: string, 
  org: string, 
  employeeCount: number
): string {
  if (context.isRootAdmin) {
    return `${name}, platform systems are operational. Ready to assist with diagnostics or administration.`;
  }
  
  if (context.isSupportRole) {
    return `Standing by for support operations. How can I help today?`;
  }
  
  if (context.orgStats?.isNewOrg) {
    return `Welcome to CoAIleague, ${name}! Let me help you get ${org} set up.`;
  }
  
  if (context.hasTrinityPro) {
    return `${name}, your Trinity Pro features are ready. Need strategic insights?`;
  }
  
  if (context.trinityMode === 'coo' || context.isOrgOwner) {
    return `${name}, ready to help optimize ${org}'s workforce operations.`;
  }
  
  if (context.isManager) {
    return `${name}, I can help with scheduling, approvals, or team insights.`;
  }
  
  return `Hey ${name}, I'm here to help. What do you need today?`;
}

export const trinityContextService = {
  resolve: resolveTrinityContext,
  generateThought: generateContextualThought,
};
