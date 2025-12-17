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
  aiWorkboardTasks,
  notifications,
  supportTickets,
  aiSuggestions,
} from '@shared/schema';
import { eq, and, count, gte, lte, sql, desc } from 'drizzle-orm';
import { getUserPlatformRole, type PlatformRole, type WorkspaceRole } from '../rbac';
import { subagentConfidenceMonitor } from './ai-brain/subagentConfidenceMonitor';

// Platform diagnostics cache with 5-minute TTL
let diagnosticsCache: { data: PlatformDiagnostics; timestamp: number } | null = null;
const DIAGNOSTICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Org intelligence cache with 2-minute TTL (per workspace)
const orgIntelligenceCache = new Map<string, { data: OrgIntelligence; timestamp: number }>();
const ORG_INTEL_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

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
  
  subscriptionTier: 'free' | 'starter' | 'professional' | 'enterprise';
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  
  hasTrinityPro: boolean;
  hasBusinessBuddy: boolean;
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
  
  // Explicit Trinity operational mode
  trinityMode: 'demo' | 'business_pro' | 'guru';
  
  greeting: string;
  persona: 'executive_advisor' | 'support_partner' | 'business_buddy' | 'onboarding_guide' | 'platform_guru' | 'standard';
}

const PLATFORM_STAFF_ROLES: PlatformRole[] = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
const MANAGER_ROLES: WorkspaceRole[] = ['org_owner', 'org_admin', 'department_manager', 'supervisor'];

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
  
  try {
    const monitoringSummary = await subagentConfidenceMonitor.getTrinityMonitoringSummary(workspaceId);
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
  } catch {
  }
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [pending] = await db
      .select({ count: count() })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.workspaceId, workspaceId),
        eq(aiWorkboardTasks.status, 'pending')
      ));
    
    const [completedToday] = await db
      .select({ count: count() })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.workspaceId, workspaceId),
        eq(aiWorkboardTasks.status, 'completed'),
        gte(aiWorkboardTasks.completedAt, today)
      ));
    
    const [failedToday] = await db
      .select({ count: count() })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.workspaceId, workspaceId),
        eq(aiWorkboardTasks.status, 'failed'),
        gte(aiWorkboardTasks.updatedAt, today)
      ));
    
    workboardStats = {
      pendingTasks: pending?.count || 0,
      completedToday: completedToday?.count || 0,
      failedToday: failedToday?.count || 0,
      avgCompletionTimeMs: 0,
    };
    
    if (workboardStats.pendingTasks > 5) {
      priorityInsights.push(`${workboardStats.pendingTasks} AI tasks pending in queue`);
    }
    if (workboardStats.failedToday > 0) {
      priorityInsights.push(`${workboardStats.failedToday} task(s) failed today - review recommended`);
    }
    if (workboardStats.completedToday > 0) {
      priorityInsights.push(`${workboardStats.completedToday} AI task(s) completed today`);
    }
  } catch {
  }
  
  try {
    // Get unread notification count
    const [unread] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    
    // Get urgent/high priority notification count (LIVE data, no cache)
    const [urgent] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        sql`${notifications.priority} IN ('urgent', 'high')`
      ));
    
    // Get category breakdown for unread notifications
    const categoryBreakdown = await db
      .select({
        type: notifications.type,
        count: count(),
      })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ))
      .groupBy(notifications.type);
    
    notificationSummary = {
      unreadCount: unread?.count || 0,
      urgentCount: urgent?.count || 0,
      categories: categoryBreakdown.map(c => ({ type: c.type || 'general', count: c.count })),
    };
    
    // Lower threshold - show notification summary more often
    if (notificationSummary.unreadCount > 0) {
      priorityInsights.push(`${notificationSummary.unreadCount} unread notification${notificationSummary.unreadCount !== 1 ? 's' : ''}`);
    }
    if (notificationSummary.urgentCount > 0) {
      priorityInsights.unshift(`${notificationSummary.urgentCount} urgent notification${notificationSummary.urgentCount !== 1 ? 's' : ''} need attention`);
    }
  } catch {
  }
  
  try {
    const [sentInvoices] = await db
      .select({ count: count() })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        sql`${invoices.status} = 'sent'`
      ));
    
    const [overdueInvoices] = await db
      .select({ count: count() })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        sql`${invoices.status} = 'overdue'`
      ));
    
    businessMetrics = {
      invoicesPendingCount: sentInvoices?.count || 0,
      invoicesOverdueCount: overdueInvoices?.count || 0,
      recentActivityScore: 0,
    };
    
    if (businessMetrics.invoicesOverdueCount > 0) {
      priorityInsights.unshift(`${businessMetrics.invoicesOverdueCount} overdue invoice(s) need attention`);
    }
    if (businessMetrics.invoicesPendingCount > 3) {
      priorityInsights.push(`${businessMetrics.invoicesPendingCount} pending invoices to process`);
    }
  } catch {
  }
  
  const result: OrgIntelligence = {
    automationReadiness,
    workboardStats,
    notificationSummary,
    businessMetrics,
    priorityInsights: priorityInsights.slice(0, 5),
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
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  
  if (!user) {
    return getAnonymousContext();
  }
  
  const platformRole = await getUserPlatformRole(userId);
  const isPlatformStaff = PLATFORM_STAFF_ROLES.includes(platformRole);
  const isRootAdmin = platformRole === 'root_admin';
  const isSupportRole = ['support_manager', 'support_agent', 'sysop'].includes(platformRole);
  
  const [ownedWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, userId))
    .limit(1);
  
  const isOrgOwner = !!ownedWorkspace;
  const effectiveWorkspaceId = workspaceId || ownedWorkspace?.id;
  
  let workspaceName: string | undefined;
  let workspaceRole: WorkspaceRole | undefined;
  let subscriptionTier: TrinityContext['subscriptionTier'] = 'free';
  let subscriptionStatus: TrinityContext['subscriptionStatus'] = 'active';
  let hasTrinityPro = false;
  let hasBusinessBuddy = false;
  let activeAddons: string[] = [];
  let orgStats: TrinityContext['orgStats'] | undefined;
  
  if (effectiveWorkspaceId) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, effectiveWorkspaceId));
    workspaceName = ws?.name;
    
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, effectiveWorkspaceId)
      ),
    });
    workspaceRole = (employee?.workspaceRole || (isOrgOwner ? 'org_owner' : undefined)) as WorkspaceRole | undefined;
    
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, effectiveWorkspaceId));
    
    if (subscription) {
      subscriptionTier = subscription.plan as TrinityContext['subscriptionTier'];
      subscriptionStatus = subscription.status as TrinityContext['subscriptionStatus'];
    }
    
    const addons = await db
      .select({
        addonKey: billingAddons.addonKey,
        addonName: billingAddons.name,
        status: workspaceAddons.status,
      })
      .from(workspaceAddons)
      .innerJoin(billingAddons, eq(workspaceAddons.addonId, billingAddons.id))
      .where(and(
        eq(workspaceAddons.workspaceId, effectiveWorkspaceId),
        eq(workspaceAddons.status, 'active')
      ));
    
    activeAddons = addons.map(a => a.addonKey);
    hasTrinityPro = activeAddons.includes('trinity_pro');
    hasBusinessBuddy = activeAddons.includes('business_buddy') || activeAddons.includes('trinity_pro');
    
    const [employeeCount] = await db
      .select({ count: count() })
      .from(employees)
      .where(eq(employees.workspaceId, effectiveWorkspaceId));
    
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
  let trinityMode: TrinityContext['trinityMode'] = 'demo';
  let greeting = `Hello${user.firstName ? `, ${user.firstName}` : ''}!`;
  
  // GURU MODE - Platform staff get advanced diagnostics and proactive monitoring
  if (isRootAdmin) {
    persona = 'platform_guru';
    trinityMode = 'guru';
    greeting = `Welcome back, ${user.firstName || 'Root Administrator'}! Trinity Guru mode active. Platform diagnostics, engagement opportunities, and notification workflows at your command.`;
  } else if (isSupportRole) {
    persona = 'platform_guru';
    trinityMode = 'guru';
    greeting = `Hi ${user.firstName || 'Support Team'}! Trinity Guru mode active. I'm analyzing platform health, looking for upgrade opportunities, and tracking engagement metrics for you.`;
  } else if (isPlatformStaff) {
    persona = 'platform_guru';
    trinityMode = 'guru';
    greeting = `Hello ${user.firstName || 'Administrator'}! Trinity Guru mode at your service. Platform monitoring and diagnostics ready.`;
  // BUSINESS PRO MODE - Org owners and subscribers get org intelligence
  } else if (isOrgOwner && orgStats?.isNewOrg) {
    persona = 'onboarding_guide';
    trinityMode = 'business_pro';
    greeting = `Welcome ${user.firstName || 'there'}! I'm Trinity, your AI business companion. Let me help you get ${workspaceName || 'your organization'} set up for success!`;
  } else if (isOrgOwner || hasBusinessBuddy || hasTrinityPro) {
    persona = 'business_buddy';
    trinityMode = 'business_pro';
    greeting = `Hi ${user.firstName || 'there'}! Trinity here. How can I help grow ${workspaceName || 'your business'} today?`;
  } else if (isManager) {
    persona = 'business_buddy';
    trinityMode = 'business_pro';
    greeting = `Hello ${user.firstName || 'there'}! I'm Trinity, ready to help with your team management needs.`;
  }
  // DEMO MODE - Everyone else gets limited demo functionality
  
  let orgIntelligence: OrgIntelligence | undefined;
  // Platform/support staff in guru mode should NOT see business automation alerts
  // They need platform diagnostics, not org-level business metrics
  const shouldGatherOrgIntel = effectiveWorkspaceId && 
    (isOrgOwner || isManager || hasTrinityPro || hasBusinessBuddy) && 
    !isPlatformStaff; // Exclude platform staff from org intelligence
  
  if (shouldGatherOrgIntel) {
    try {
      orgIntelligence = await gatherOrgIntelligence(effectiveWorkspaceId, userId);
    } catch {
    }
  }
  
  // Gather platform diagnostics for Guru mode (platform/support staff)
  let platformDiagnostics: PlatformDiagnostics | undefined;
  if (trinityMode === 'guru') {
    try {
      platformDiagnostics = await gatherPlatformDiagnostics();
    } catch {
    }
  }
  
  return {
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
    hasBusinessBuddy,
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
    hasBusinessBuddy: false,
    activeAddons: [],
    
    trinityAccessReason: 'none',
    trinityAccessLevel: 'basic',
    trinityMode: 'demo',
    
    greeting: 'Hello! I\'m Trinity, your AI guide. Sign in to unlock my full capabilities!',
    persona: 'standard',
  };
}

/**
 * Gather platform-wide diagnostics for Guru mode
 * Analyzes platform health, engagement opportunities, and upgrade candidates
 * Uses 5-minute caching to reduce database load
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
    // Count active workspaces
    const [wsCount] = await db
      .select({ count: count() })
      .from(workspaces)
      .where(eq(workspaces.subscriptionStatus, 'active'));
    activeWorkspaces = wsCount?.count || 0;
    
    // Count total users
    const [userCount] = await db
      .select({ count: count() })
      .from(users);
    totalUsers = userCount?.count || 0;
    
    // Find upgrade opportunities - free tier with high activity
    const freeWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
      })
      .from(workspaces)
      .innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
      .where(and(
        eq(workspaces.subscriptionStatus, 'active'),
        eq(subscriptions.plan, 'free')
      ))
      .limit(5);
    
    for (const ws of freeWorkspaces) {
      const [taskCount] = await db
        .select({ count: count() })
        .from(aiWorkboardTasks)
        .where(eq(aiWorkboardTasks.workspaceId, ws.id));
      
      if ((taskCount?.count || 0) > 10) {
        upgradeOpportunities.push({
          workspaceId: ws.id,
          workspaceName: ws.name || 'Unknown',
          reason: `High AI workboard activity (${taskCount?.count} tasks) - good candidate for Business Buddy`,
        });
      }
    }
    
    // Find engagement alerts - inactive workspaces
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const inactiveWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
      })
      .from(workspaces)
      .where(and(
        eq(workspaces.subscriptionStatus, 'active'),
        sql`${workspaces.updatedAt} < ${thirtyDaysAgo}`
      ))
      .limit(10);
    
    churnRiskCount = inactiveWorkspaces.length;
    
    for (const ws of inactiveWorkspaces) {
      engagementAlerts.push({
        type: 'inactive_workspace',
        message: `${ws.name || 'Workspace'} hasn't had activity in 30+ days`,
        priority: 'medium',
      });
    }
    
    // Check failed tasks for error alerts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [failedTasks] = await db
      .select({ count: count() })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.status, 'failed'),
        gte(aiWorkboardTasks.updatedAt, today)
      ));
    
    recentErrors = failedTasks?.count || 0;
    
    if (recentErrors > 10) {
      overallHealth = 'critical';
      engagementAlerts.push({
        type: 'high_error_rate',
        message: `${recentErrors} AI tasks failed today - investigation recommended`,
        priority: 'high',
      });
    } else if (recentErrors > 5) {
      overallHealth = 'degraded';
      engagementAlerts.push({
        type: 'elevated_errors',
        message: `${recentErrors} AI tasks failed today - monitoring advised`,
        priority: 'medium',
      });
    }
    
    // Support ticket backlog
    const [openTickets] = await db
      .select({ count: count() })
      .from(supportTickets)
      .where(eq(supportTickets.status, 'open'));
    supportTicketBacklog.open = openTickets?.count || 0;
    
    const [urgentTickets] = await db
      .select({ count: count() })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.status, 'open'),
        eq(supportTickets.priority, 'urgent')
      ));
    supportTicketBacklog.urgent = urgentTickets?.count || 0;
    
    if (supportTicketBacklog.urgent > 5) {
      engagementAlerts.push({
        type: 'urgent_tickets',
        message: `${supportTicketBacklog.urgent} urgent support tickets awaiting response`,
        priority: 'high',
      });
    }
    
    // Trial expirations in next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const expiringTrials = await db
      .select({
        id: subscriptions.workspaceId,
        name: workspaces.name,
        trialEndsAt: subscriptions.trialEndsAt,
      })
      .from(subscriptions)
      .innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
      .where(and(
        eq(subscriptions.status, 'trial'),
        lte(subscriptions.trialEndsAt, sevenDaysFromNow),
        gte(subscriptions.trialEndsAt, new Date())
      ))
      .limit(10);
    
    for (const trial of expiringTrials) {
      if (trial.trialEndsAt) {
        const daysLeft = Math.ceil((trial.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        trialExpirations.push({
          workspaceId: trial.id || '',
          workspaceName: trial.name || 'Unknown',
          daysLeft,
        });
        
        if (daysLeft <= 3) {
          engagementAlerts.push({
            type: 'trial_expiring',
            message: `${trial.name || 'Workspace'} trial expires in ${daysLeft} day(s) - conversion opportunity`,
            priority: daysLeft <= 1 ? 'high' : 'medium',
          });
        }
      }
    }
    
    // FAST mode stats from recent AI workboard tasks
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentTasks = await db
      .select({
        status: aiWorkboardTasks.status,
        durationMs: sql<number>`EXTRACT(EPOCH FROM (${aiWorkboardTasks.completedAt} - ${aiWorkboardTasks.createdAt})) * 1000`,
      })
      .from(aiWorkboardTasks)
      .where(and(
        gte(aiWorkboardTasks.createdAt, sevenDaysAgo),
        sql`${aiWorkboardTasks.completedAt} IS NOT NULL`
      ))
      .limit(100);
    
    if (recentTasks.length > 0) {
      const completed = recentTasks.filter(t => t.status === 'completed').length;
      fastModeStats.totalExecutions = recentTasks.length;
      fastModeStats.successRate = Math.round((completed / recentTasks.length) * 100);
      fastModeStats.avgDuration = Math.round(
        recentTasks.reduce((sum, t) => sum + (t.durationMs || 0), 0) / recentTasks.length
      );
      // Count tasks taking > 30s as SLA breaches
      fastModeStats.slaBreeches = recentTasks.filter(t => (t.durationMs || 0) > 30000).length;
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
        workspaceId: 'ops-workspace-00000000',
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
  } else if (context.hasBusinessBuddy) {
    contextParts.push('Subscription: Business Buddy tier');
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
  
  // Add platform health for staff
  if (context.isRootAdmin || context.isSupportRole) {
    try {
      const { platformHealthMonitor } = await import('./ai-brain/platformHealthMonitor');
      const healthInsight = await platformHealthMonitor.getTrinityHealthInsight();
      if (healthInsight) {
        contextParts.push(`Platform health: ${healthInsight}`);
      }
    } catch {
      // Ignore health monitor errors
    }
  }
  
  // Add new org onboarding context
  if (context.orgStats?.isNewOrg) {
    contextParts.push('Status: New organization, just getting started');
  }
  
  // Determine Trinity mode
  let mode: 'demo' | 'business' | 'guru' = 'demo';
  if (context.isRootAdmin || context.isSupportRole) {
    mode = 'guru';
  } else if (context.hasBusinessBuddy || context.hasTrinityPro || context.isOrgOwner) {
    mode = 'business';
  }
  
  // Try to generate AI thought
  try {
    const { geminiClient } = await import('./ai-brain/providers/geminiClient');
    
    const aiThought = await geminiClient.generateTrinityThought({
      context: contextParts.join('\n'),
      displayName: name,
      workspaceId: context.workspaceId,
      mode,
    });
    
    if (aiThought) {
      console.log(`[Trinity] AI-generated thought for ${name} (${mode} mode)`);
      return aiThought;
    }
  } catch (error) {
    console.warn('[Trinity] AI thought generation unavailable, using fallback:', error);
  }
  
  // Fallback to simple context-aware thoughts if AI fails
  return generateFallbackThought(context, name, org, employeeCount);
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
  
  if (context.hasBusinessBuddy || context.isOrgOwner) {
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
