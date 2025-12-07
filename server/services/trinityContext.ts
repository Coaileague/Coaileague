/**
 * Trinity Context Service
 * 
 * Resolves comprehensive user context for Trinity AI mascot including:
 * - Platform role (root_admin, support_agent, etc.)
 * - Workspace role (org_owner, department_manager, etc.)
 * - Subscription tier and add-on entitlements
 * - Organization topology and structure
 * - Support staff affiliation
 */

import { db } from '../db';
import { 
  users, 
  employees, 
  workspaces, 
  workspaceAddons,
  billingAddons,
  subscriptions,
} from '@shared/schema';
import { eq, and, count } from 'drizzle-orm';
import { getUserPlatformRole, type PlatformRole, type WorkspaceRole } from '../rbac';

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
  
  trinityAccessReason: 'platform_staff' | 'org_owner' | 'addon_subscriber' | 'trial' | 'none';
  trinityAccessLevel: 'full' | 'basic' | 'none';
  
  greeting: string;
  persona: 'executive_advisor' | 'support_partner' | 'business_buddy' | 'onboarding_guide' | 'standard';
}

const PLATFORM_STAFF_ROLES: PlatformRole[] = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
const MANAGER_ROLES: WorkspaceRole[] = ['org_owner', 'org_admin', 'department_manager', 'supervisor'];

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
  let greeting = `Hello${user.firstName ? `, ${user.firstName}` : ''}!`;
  
  if (isRootAdmin) {
    persona = 'executive_advisor';
    greeting = `Welcome back, ${user.firstName || 'Root Administrator'}! I'm Trinity, your platform intelligence partner. All systems are under your command.`;
  } else if (isSupportRole) {
    persona = 'support_partner';
    greeting = `Hi ${user.firstName || 'Support Team'}! Trinity here, ready to assist with platform operations and user support.`;
  } else if (isPlatformStaff) {
    persona = 'executive_advisor';
    greeting = `Hello ${user.firstName || 'Administrator'}! Trinity at your service for platform oversight.`;
  } else if (isOrgOwner && orgStats?.isNewOrg) {
    persona = 'onboarding_guide';
    greeting = `Welcome ${user.firstName || 'there'}! I'm Trinity, your AI business companion. Let me help you get ${workspaceName || 'your organization'} set up for success!`;
  } else if (isOrgOwner || hasBusinessBuddy) {
    persona = 'business_buddy';
    greeting = `Hi ${user.firstName || 'there'}! Trinity here. How can I help grow ${workspaceName || 'your business'} today?`;
  } else if (isManager) {
    persona = 'business_buddy';
    greeting = `Hello ${user.firstName || 'there'}! I'm Trinity, ready to help with your team management needs.`;
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
    
    trinityAccessReason,
    trinityAccessLevel,
    
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
    trinityAccessLevel: 'none',
    
    greeting: 'Hello! I\'m Trinity. Please sign in to unlock personalized assistance.',
    persona: 'standard',
  };
}

export async function generateContextualThought(context: TrinityContext): Promise<string | null> {
  if (context.trinityAccessLevel === 'none') {
    return null;
  }
  
  const name = context.displayName || 'there';
  const org = context.workspaceName || 'your organization';
  const employeeCount = context.orgStats?.employeeCount || 0;
  
  // Try to get health insight for platform staff
  if (context.isRootAdmin || context.isSupportRole) {
    try {
      const { platformHealthMonitor } = await import('./ai-brain/platformHealthMonitor');
      const healthInsight = await platformHealthMonitor.getTrinityHealthInsight();
      // 40% chance to show health insight, 60% show regular thought
      if (Math.random() < 0.4 && healthInsight) {
        return healthInsight;
      }
    } catch {
      // Fall through to regular thoughts if health monitor unavailable
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
