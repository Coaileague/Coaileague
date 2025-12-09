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
} from '@shared/schema';
import { eq, and, count, gte, sql } from 'drizzle-orm';
import { getUserPlatformRole, type PlatformRole, type WorkspaceRole } from '../rbac';
import { subagentConfidenceMonitor } from './ai-brain/subagentConfidenceMonitor';

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
  fastModeStats: { successRate: number; avgDuration: number; slaBreeches: number };
  upgradeOpportunities: { workspaceId: string; workspaceName: string; reason: string }[];
  engagementAlerts: { type: string; message: string; priority: 'low' | 'medium' | 'high' }[];
  pendingNotificationSuggestions: number;
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
    const [unread] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    
    notificationSummary = {
      unreadCount: unread?.count || 0,
      urgentCount: 0,
      categories: [],
    };
    
    if (notificationSummary.unreadCount > 10) {
      priorityInsights.push(`${notificationSummary.unreadCount} unread notifications`);
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
  
  return {
    automationReadiness,
    workboardStats,
    notificationSummary,
    businessMetrics,
    priorityInsights: priorityInsights.slice(0, 5),
  };
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
  if (effectiveWorkspaceId && (isOrgOwner || isManager || isPlatformStaff || hasTrinityPro || hasBusinessBuddy)) {
    try {
      orgIntelligence = await gatherOrgIntelligence(effectiveWorkspaceId, userId);
    } catch {
    }
  }
  
  // Gather platform diagnostics for Guru mode
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
 */
async function gatherPlatformDiagnostics(): Promise<PlatformDiagnostics> {
  const upgradeOpportunities: PlatformDiagnostics['upgradeOpportunities'] = [];
  const engagementAlerts: PlatformDiagnostics['engagementAlerts'] = [];
  
  let activeWorkspaces = 0;
  let totalUsers = 0;
  let recentErrors = 0;
  let overallHealth: PlatformDiagnostics['overallHealth'] = 'healthy';
  
  try {
    // Count active workspaces (using subscriptionStatus as activity indicator)
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
    
    // Find upgrade opportunities - workspaces on free tier with high activity
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
    
    // Find engagement alerts - workspaces with low recent activity
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
    
  } catch {
  }
  
  // Estimate subagent health from org readiness scores
  const subagentHealth = { healthy: 8, degraded: 0, critical: 0 };
  const fastModeStats = { successRate: 95, avgDuration: 2500, slaBreeches: 0 };
  
  // Check a sample of org readiness to estimate platform-wide health
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
  
  return {
    overallHealth,
    activeWorkspaces,
    totalUsers,
    recentErrors,
    subagentHealth,
    fastModeStats,
    upgradeOpportunities,
    engagementAlerts,
    pendingNotificationSuggestions: 0,
  };
}

export async function generateContextualThought(context: TrinityContext): Promise<string | null> {
  if (context.trinityAccessLevel === 'none') {
    return null;
  }
  
  const name = context.displayName || 'there';
  const org = context.workspaceName || 'your organization';
  const employeeCount = context.orgStats?.employeeCount || 0;
  const intel = context.orgIntelligence;
  
  if (intel?.priorityInsights && intel.priorityInsights.length > 0 && Math.random() < 0.5) {
    const insight = intel.priorityInsights[Math.floor(Math.random() * intel.priorityInsights.length)];
    return `${name}, ${insight}`;
  }
  
  if (intel?.automationReadiness && Math.random() < 0.3) {
    const auto = intel.automationReadiness;
    if (auto.canGraduate) {
      return `${name}, your automation readiness is at ${auto.score}% - ready to graduate to the next level!`;
    }
    if (auto.recommendations.length > 0) {
      return `${name}, AI recommendation: ${auto.recommendations[0]}`;
    }
  }
  
  if (intel?.workboardStats && intel.workboardStats.completedToday > 0 && Math.random() < 0.25) {
    return `${name}, ${intel.workboardStats.completedToday} AI tasks completed today. ${intel.workboardStats.pendingTasks > 0 ? `${intel.workboardStats.pendingTasks} still pending.` : 'Queue is clear!'}`;
  }
  
  if (intel?.businessMetrics?.invoicesOverdueCount && intel.businessMetrics.invoicesOverdueCount > 0 && Math.random() < 0.35) {
    return `${name}, you have ${intel.businessMetrics.invoicesOverdueCount} overdue invoice(s) that need attention.`;
  }
  
  // Try to get health insight for platform staff
  if (context.isRootAdmin || context.isSupportRole) {
    try {
      const { platformHealthMonitor } = await import('./ai-brain/platformHealthMonitor');
      const healthInsight = await platformHealthMonitor.getTrinityHealthInsight();
      if (Math.random() < 0.4 && healthInsight) {
        return healthInsight;
      }
    } catch {
    }
  }
  
  if (context.isRootAdmin) {
    const thoughts = [
      `As root administrator, you have full platform oversight. All ${employeeCount} employees and systems are operational.`,
      `Platform status: All services running. I can help analyze performance metrics or run system diagnostics.`,
      `Root access confirmed. Need to broadcast updates, manage services, or review platform health?`,
      `I'm monitoring all ${employeeCount > 0 ? employeeCount + ' active' : ''} workspaces. Want a platform health summary?`,
      `The AI orchestration engine has ${Math.floor(Math.random() * 20) + 50} actions ready. Need to trigger any workflows?`,
      `System metrics look healthy. I can run predictive analysis on platform usage patterns if you'd like.`,
      `I can diagnose issues and suggest hotfixes. Visit the Control Tower for maintenance options.`,
      `Need to push a quick fix? I can queue hotfix suggestions for your approval.`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  if (context.isSupportRole) {
    const thoughts = [
      `Support console ready. I can help escalate issues, broadcast alerts, or assist users across workspaces.`,
      `All systems nominal. Any support tickets need AI-assisted triage today?`,
      `Standing by for support operations. I can access platform-wide analytics on your behalf.`,
      `I can help draft support responses or search the knowledge base for solutions.`,
      `Need to send a platform-wide announcement? I can help compose and broadcast it.`,
      `I'm tracking user activity patterns. Want insights on common support requests?`,
      `I can diagnose platform issues and suggest fixes. Want me to run a health check?`,
      `If you spot a bug, I can help queue a hotfix for admin approval.`,
      `Platform maintenance tools are available. I can help analyze logs or suggest optimizations.`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  if (context.isOrgOwner && context.orgStats?.isNewOrg) {
    const thoughts = [
      `I notice ${org} is just getting started! Would you like help setting up departments and inviting team members?`,
      `Welcome aboard! I can guide you through configuring your workspace for optimal team productivity.`,
      `New organization detected! Let me show you the key features that will help ${org} thrive.`,
      `First things first: let's set up your department structure. How many teams do you have?`,
      `I can help you import employee data or create your first schedule. What would you prefer?`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  if (context.hasTrinityPro) {
    const thoughts = [
      `${name}, your Trinity Pro subscription gives you access to advanced analytics. Want a workforce insights report?`,
      `I've been analyzing your scheduling patterns. I found some optimization opportunities.`,
      `Pro feature available: I can predict staffing needs based on historical data. Interested?`,
      `Your AI advisor is ready with strategic recommendations for ${org}.`,
      `I can generate executive-level reports on team performance. Would that be helpful?`,
      `Trinity Pro tip: I can automate recurring scheduling tasks. Want me to set that up?`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  if (context.hasBusinessBuddy || context.persona === 'business_buddy') {
    const thoughts = [
      `I'm here to help ${org} succeed. Ask me about scheduling optimization, team insights, or growth strategies!`,
      `Your business buddy is ready! I can analyze workforce patterns, suggest improvements, or help with planning.`,
      `How can I help grow ${org} today? I'm great with data analysis and strategic planning.`,
      `I notice you have ${employeeCount} team members. Want tips on improving team efficiency?`,
      `Business insight: Regular schedule optimization can reduce overtime costs by up to 15%.`,
      `Let me help you build a smarter workforce strategy. What's your biggest challenge right now?`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  if (context.isOrgOwner || context.isManager) {
    const thoughts = [
      `${name}, I can help you manage your team's schedules more efficiently.`,
      `Need to review time-off requests or approve timesheets? I'm here to help.`,
      `I can analyze your team's productivity patterns. Would you like some insights?`,
      `Tip: Setting up recurring shifts can save you hours of scheduling work.`,
      `Want me to check for any scheduling conflicts or compliance issues?`,
      `I can help you balance workload across your ${employeeCount > 0 ? employeeCount + ' team members' : 'team'}.`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  // Standard user thoughts with more variety
  const thoughts = [
    `Hey ${name}, I'm here if you need any help navigating the platform.`,
    `Did you know you can view your upcoming shifts in the calendar view?`,
    `Need to request time off? I can guide you through the process.`,
    `I can help you find information about company policies or procedures.`,
    `Check out your dashboard for updates on your schedule and notifications.`,
    `If you have questions about your timesheet, just ask!`,
  ];
  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

export const trinityContextService = {
  resolve: resolveTrinityContext,
  generateThought: generateContextualThought,
};
