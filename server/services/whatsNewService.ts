/**
 * What's New Service - Dynamic Platform Updates Feed
 * Queries updates from the platformUpdates database table
 * Includes RBAC filtering and user view tracking
 * Connected to the Platform Event Bus for real-time updates
 */

import { db } from '../db';
import { platformUpdates as platformUpdatesTable, userPlatformUpdateViews } from '@shared/schema';
import { isFeatureEnabled, PLATFORM } from '@shared/platformConfig';
import { desc, eq, sql, and, gte, or, isNull, notInArray } from 'drizzle-orm';

export interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  date: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
  badge?: string;
  version?: string;
  learnMoreUrl?: string;
  isNew?: boolean;
  priority?: number;
  visibility?: string;
  hasViewed?: boolean;
}

// Visibility levels for RBAC filtering (lower index = higher access)
// Maps to update_visibility enum in database: 'all', 'staff', 'supervisor', 'manager', 'admin'
const VISIBILITY_LEVELS: Record<string, number> = {
  'admin': 1,               // Admins and above
  'manager': 2,             // Managers and above
  'supervisor': 3,          // Supervisors and above
  'staff': 4,               // All staff
  'all': 5,                 // Everyone (default)
};

// Map workspace roles to their effective visibility access level
const WORKSPACE_ROLE_ACCESS: Record<string, number> = {
  'org_owner': 1,           // Same as admin access
  'org_admin': 1,           // Same as admin access
  'department_manager': 2,  // Manager level
  'supervisor': 3,          // Supervisor level
  'staff': 4,               // Staff level
  'auditor': 4,             // Staff level (read-only)
  'contractor': 4,          // Staff level (limited)
};

const STATIC_SEED_UPDATES: PlatformUpdate[] = [
  {
    id: 'coai-buddy-mascot-2025-12-03',
    title: 'Meet CoAI - Your Intelligent Platform Buddy',
    description: 'CoAI is your new AI companion represented by three floating stars (Co/cyan, AI/purple, LE/gold). It proactively offers tips, answers questions, and learns from your usage. CoAI monitors platform health, suggests optimizations, celebrates holidays with seasonal themes, and provides contextual guidance on every page. Look for the colorful floating messages near your mascot!',
    date: '2025-12-03',
    category: 'feature',
    badge: 'NEW',
    version: '2.2.0',
    isNew: true,
    priority: 1,
  },
  {
    id: 'sms-notifications-2025-11-28',
    title: 'SMS Notifications',
    description: 'Receive shift reminders, schedule changes, and approval notifications via SMS. Connect your Twilio account to enable text message alerts for your entire team.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 2,
  },
  {
    id: 'calendar-sync-2025-11-28',
    title: 'Calendar Integration',
    description: 'Export your schedule to Google Calendar, Outlook, or any calendar app with ICS support. One-click sync keeps your personal calendar updated with work shifts.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 2,
  },
  {
    id: 'timesheet-reports-2025-11-28',
    title: 'Timesheet Reports & Export',
    description: 'Generate comprehensive timesheet reports with one click. Export to CSV for payroll processing, compliance audits, or client billing.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 3,
  },
  {
    id: 'shift-swapping-2025-11-28',
    title: 'Shift Swapping',
    description: 'Employees can now request to swap shifts with coworkers. Managers receive swap requests for approval, making schedule flexibility easier than ever.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 4,
  },
  {
    id: 'recurring-shifts-2025-11-28',
    title: 'Recurring Shifts',
    description: 'Create weekly or bi-weekly recurring shifts that automatically populate your schedule. Save hours of scheduling time with pattern-based shift creation.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 5,
  },
  {
    id: 'mobile-schedule-2025-11-20',
    title: 'Mobile-First AI Scheduling',
    description: 'Completely redesigned mobile scheduling experience with week navigation, real-time stats cards (hours, cost, overtime, open shifts), swipe-friendly day tabs, and streamlined shift creation.',
    date: '2025-11-20',
    category: 'feature',
    version: '2.0.5',
  },
  {
    id: 'analytics-platform-2025-11-04',
    title: 'AI Analytics Platform',
    description: 'Launch of autonomous AI analytics with real-time insights, cost-saving recommendations, and anomaly detection. Get actionable recommendations with confidence scores.',
    date: '2025-11-04',
    category: 'feature',
    version: '2.0.0',
  },
  {
    id: 'natural-language-search-2025-11-04',
    title: 'Natural Language Search',
    description: 'Search your entire workforce database using natural language. Ask questions like "Show me employees hired this month" and get instant results.',
    date: '2025-11-04',
    category: 'feature',
    version: '2.0.0',
  },
  {
    id: 'gamification-2025-11-15',
    title: 'Employee Gamification',
    description: 'Boost engagement with achievements, points, leaderboards, and streak tracking. Recognize top performers and motivate your team.',
    date: '2025-11-15',
    category: 'feature',
    version: '2.0.3',
  },
  {
    id: 'animated-logo-2025-11-05',
    title: 'CoAIleague Brand Refresh',
    description: 'New animated logo featuring the AI network gradient design representing autonomous workforce management at scale.',
    date: '2025-11-05',
    category: 'improvement',
    version: '2.0.1',
  },
  {
    id: 'security-2025-11-03',
    title: 'Security Enhancements',
    description: 'Improved authentication flow with account locking, password complexity requirements, and session management upgrades.',
    date: '2025-11-03',
    category: 'security',
    version: '2.0.0',
  },
];

/**
 * Check if user's workspace role has access to the visibility level
 * @param userRole - The user's workspace role (org_owner, staff, etc.)
 * @param visibility - The visibility setting on the update (admin, staff, all, etc.)
 */
function hasVisibilityAccess(userRole: string, visibility: string): boolean {
  // Get user's access level from their workspace role
  const userAccessLevel = WORKSPACE_ROLE_ACCESS[userRole] ?? VISIBILITY_LEVELS['staff'];
  // Get required visibility level
  const requiredLevel = VISIBILITY_LEVELS[visibility] ?? VISIBILITY_LEVELS['all'];
  // User can access if their level is <= required level (lower = more access)
  return userAccessLevel <= requiredLevel;
}

/**
 * Seed the database with static updates - ONLY if database is completely empty
 * This prevents re-seeding old data that was intentionally cleared
 */
export async function seedPlatformUpdates(): Promise<void> {
  try {
    // Check if there are ANY platform updates - if so, skip seeding entirely
    const existingCount = await db.query.platformUpdates.findFirst({});
    
    if (existingCount) {
      console.log('[WhatsNew] Platform updates already exist, skipping seed');
      return;
    }
    
    // Only seed if the database is truly empty - seed first 3 only
    const seedUpdates = STATIC_SEED_UPDATES.slice(0, 3);
    for (const update of seedUpdates) {
      await db.insert(platformUpdatesTable).values({
        id: update.id,
        title: update.title,
        description: update.description,
        category: update.category,
        badge: update.badge,
        version: update.version,
        isNew: update.isNew ?? false,
        priority: update.priority,
        learnMoreUrl: update.learnMoreUrl,
        visibility: 'all',
        date: new Date(update.date),
      });
      console.log(`[WhatsNew] Seeded update: ${update.title}`);
    }
    console.log('[WhatsNew] Platform updates seeding complete');
  } catch (error) {
    console.error('[WhatsNew] Failed to seed updates:', error);
  }
}

/**
 * Get updates from the database with RBAC filtering, workspace scoping, and viewed status
 * - Global updates (workspaceId = null) are visible to everyone
 * - Workspace-specific updates are only visible to users in that workspace
 */
export async function getUpdates(options?: {
  limit?: number;
  category?: string;
  includeAll?: boolean;
  userId?: string;
  userRole?: string;
  workspaceId?: string;
}): Promise<PlatformUpdate[]> {
  if (!isFeatureEnabled('enableWhatsNew')) {
    return [];
  }

  try {
    const userRole = options?.userRole || 'staff';
    
    // Build query conditions
    const conditions = [];
    if (options?.category) {
      conditions.push(eq(platformUpdatesTable.category, options.category as any));
    }
    
    // Workspace scoping: show global updates (null workspaceId) + user's workspace updates
    if (options?.workspaceId) {
      conditions.push(
        or(
          isNull(platformUpdatesTable.workspaceId),
          eq(platformUpdatesTable.workspaceId, options.workspaceId)
        )
      );
    } else {
      // If no workspace provided, only show global updates
      conditions.push(isNull(platformUpdatesTable.workspaceId));
    }

    const dbUpdates = await db.query.platformUpdates.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [
        sql`COALESCE(${platformUpdatesTable.priority}, 999) ASC`,
        desc(platformUpdatesTable.date),
      ],
      limit: options?.includeAll ? undefined : (options?.limit || 50),
    });

    // Get user's viewed updates if userId provided
    let viewedUpdateIds: Set<string> = new Set();
    if (options?.userId) {
      const viewedUpdates = await db.query.userPlatformUpdateViews.findMany({
        where: eq(userPlatformUpdateViews.userId, options.userId),
        columns: { updateId: true },
      });
      viewedUpdateIds = new Set(viewedUpdates.map(v => v.updateId));
    }

    // Filter by RBAC and add viewed status
    return dbUpdates
      .filter(u => {
        const visibility = u.visibility || 'all';
        return hasVisibilityAccess(userRole, visibility);
      })
      .map(u => ({
        id: u.id,
        title: u.title,
        description: u.description,
        date: u.date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        category: u.category,
        badge: u.badge || undefined,
        version: u.version || undefined,
        learnMoreUrl: u.learnMoreUrl || undefined,
        isNew: u.isNew ?? undefined,
        priority: u.priority ?? undefined,
        visibility: u.visibility || 'all',
        hasViewed: viewedUpdateIds.has(u.id),
      }));
  } catch (error) {
    console.error('[WhatsNew] Database query failed:', error);
    return [];
  }
}

/**
 * Mark an update as viewed by a user (persistent)
 */
export async function markUpdateViewed(userId: string, updateId: string, viewSource: string = 'feed'): Promise<boolean> {
  try {
    await db.insert(userPlatformUpdateViews).values({
      userId,
      updateId,
      viewSource,
    }).onConflictDoNothing();
    
    console.log(`[WhatsNew] User ${userId} viewed update ${updateId}`);
    return true;
  } catch (error) {
    console.error('[WhatsNew] Failed to mark update as viewed:', error);
    return false;
  }
}

/**
 * Get unviewed updates count for a user (with workspace scoping)
 */
export async function getUnviewedCount(userId: string, userRole: string = 'staff', workspaceId?: string): Promise<number> {
  try {
    const viewedUpdates = await db.query.userPlatformUpdateViews.findMany({
      where: eq(userPlatformUpdateViews.userId, userId),
      columns: { updateId: true },
    });
    const viewedIds = viewedUpdates.map(v => v.updateId);
    
    // Build conditions with workspace scoping
    const conditions = [];
    if (viewedIds.length > 0) {
      conditions.push(notInArray(platformUpdatesTable.id, viewedIds));
    }
    
    // Workspace scoping: show global + workspace-specific
    if (workspaceId) {
      conditions.push(
        or(
          isNull(platformUpdatesTable.workspaceId),
          eq(platformUpdatesTable.workspaceId, workspaceId)
        )
      );
    } else {
      conditions.push(isNull(platformUpdatesTable.workspaceId));
    }
    
    const allUpdates = await db.query.platformUpdates.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
    });
    
    // Filter by RBAC
    return allUpdates.filter(u => hasVisibilityAccess(userRole, u.visibility || 'all')).length;
  } catch (error) {
    console.error('[WhatsNew] Failed to get unviewed count:', error);
    return 0;
  }
}

export async function getLatestUpdates(count: number = 5, userId?: string, userRole?: string, workspaceId?: string): Promise<PlatformUpdate[]> {
  return getUpdates({ limit: count, userId, userRole, workspaceId });
}

export async function getNewFeatures(userId?: string, userRole?: string, workspaceId?: string): Promise<PlatformUpdate[]> {
  try {
    // Build conditions with workspace scoping
    const conditions = [eq(platformUpdatesTable.isNew, true)];
    if (workspaceId) {
      conditions.push(
        or(
          isNull(platformUpdatesTable.workspaceId),
          eq(platformUpdatesTable.workspaceId, workspaceId)
        ) as any
      );
    } else {
      conditions.push(isNull(platformUpdatesTable.workspaceId));
    }
    
    const updates = await db.query.platformUpdates.findMany({
      where: and(...conditions),
      orderBy: [sql`COALESCE(${platformUpdatesTable.priority}, 999) ASC`, desc(platformUpdatesTable.date)],
    });
    
    // Get viewed status
    let viewedUpdateIds: Set<string> = new Set();
    if (userId) {
      const viewedUpdates = await db.query.userPlatformUpdateViews.findMany({
        where: eq(userPlatformUpdateViews.userId, userId),
        columns: { updateId: true },
      });
      viewedUpdateIds = new Set(viewedUpdates.map(v => v.updateId));
    }
    
    return updates
      .filter(u => hasVisibilityAccess(userRole || 'staff', u.visibility || 'all'))
      .map(u => ({
        id: u.id,
        title: u.title,
        description: u.description,
        date: u.date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        category: u.category,
        badge: u.badge || undefined,
        version: u.version || undefined,
        learnMoreUrl: u.learnMoreUrl || undefined,
        isNew: true,
        priority: u.priority ?? undefined,
        visibility: u.visibility || 'all',
        hasViewed: viewedUpdateIds.has(u.id),
      }));
  } catch (error) {
    console.error('[WhatsNew] Failed to get new features:', error);
    return [];
  }
}

export async function getUpdateById(id: string, userId?: string): Promise<PlatformUpdate | undefined> {
  try {
    const update = await db.query.platformUpdates.findFirst({
      where: eq(platformUpdatesTable.id, id),
    });
    
    if (!update) return undefined;
    
    // Check if user has viewed
    let hasViewed = false;
    if (userId) {
      const view = await db.query.userPlatformUpdateViews.findFirst({
        where: and(
          eq(userPlatformUpdateViews.userId, userId),
          eq(userPlatformUpdateViews.updateId, id)
        ),
      });
      hasViewed = !!view;
    }
    
    return {
      id: update.id,
      title: update.title,
      description: update.description,
      date: update.date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      category: update.category,
      badge: update.badge || undefined,
      version: update.version || undefined,
      learnMoreUrl: update.learnMoreUrl || undefined,
      isNew: update.isNew ?? undefined,
      priority: update.priority ?? undefined,
      visibility: update.visibility || 'all',
      hasViewed,
    };
  } catch (error) {
    console.error('[WhatsNew] Failed to get update by ID:', error);
    return undefined;
  }
}

export async function getUpdatesByCategory(category: PlatformUpdate['category'], userId?: string, userRole?: string): Promise<PlatformUpdate[]> {
  return getUpdates({ category, userId, userRole });
}

export async function getUpdateStats(userRole: string = 'staff') {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const allUpdates = await db.query.platformUpdates.findMany();
    
    // Filter by RBAC
    const visibleUpdates = allUpdates.filter(u => hasVisibilityAccess(userRole, u.visibility || 'all'));
    const recentUpdates = visibleUpdates.filter(u => u.date && new Date(u.date) >= thirtyDaysAgo);
    
    return {
      total: visibleUpdates.length,
      recentCount: recentUpdates.length,
      newFeatures: visibleUpdates.filter(u => u.isNew).length,
      byCategory: {
        feature: visibleUpdates.filter(u => u.category === 'feature').length,
        improvement: visibleUpdates.filter(u => u.category === 'improvement').length,
        bugfix: visibleUpdates.filter(u => u.category === 'bugfix').length,
        security: visibleUpdates.filter(u => u.category === 'security').length,
        announcement: visibleUpdates.filter(u => u.category === 'announcement').length,
      },
      latestVersion: PLATFORM.version,
    };
  } catch (error) {
    console.error('[WhatsNew] Failed to get stats:', error);
    return {
      total: 0,
      recentCount: 0,
      newFeatures: 0,
      byCategory: {
        feature: 0,
        improvement: 0,
        bugfix: 0,
        security: 0,
        announcement: 0,
      },
      latestVersion: PLATFORM.version,
    };
  }
}

export async function addUpdate(update: Omit<PlatformUpdate, 'id'> & { visibility?: string; workspaceId?: string }): Promise<PlatformUpdate> {
  const id = `${update.title.toLowerCase().replace(/\s+/g, '-')}-${update.date}`;
  
  try {
    await db.insert(platformUpdatesTable).values({
      id,
      title: update.title,
      description: update.description,
      category: update.category,
      badge: update.badge,
      version: update.version,
      isNew: update.isNew ?? true,
      priority: update.priority,
      learnMoreUrl: update.learnMoreUrl,
      visibility: (update.visibility as any) || 'all',
      workspaceId: update.workspaceId || null, // null = global, set = workspace-specific
      date: new Date(update.date),
    });
    
    return { ...update, id };
  } catch (error) {
    console.error('[WhatsNew] Failed to add update:', error);
    throw error;
  }
}
