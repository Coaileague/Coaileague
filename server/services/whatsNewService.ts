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

// Role hierarchy for RBAC filtering (lower index = higher access)
const ROLE_HIERARCHY: Record<string, number> = {
  'platform_staff': 0,   // Highest access
  'admin': 1,
  'manager': 2,
  'supervisor': 3,
  'staff': 4,
  'all': 5,              // Everyone
};

const STATIC_SEED_UPDATES: PlatformUpdate[] = [
  {
    id: 'sms-notifications-2025-11-28',
    title: 'SMS Notifications',
    description: 'Receive shift reminders, schedule changes, and approval notifications via SMS. Connect your Twilio account to enable text message alerts for your entire team.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 1,
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
 * Check if user role has access to visibility level
 */
function hasVisibilityAccess(userRole: string, visibility: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] ?? ROLE_HIERARCHY['staff'];
  const requiredLevel = ROLE_HIERARCHY[visibility] ?? ROLE_HIERARCHY['all'];
  return userLevel <= requiredLevel;
}

/**
 * Seed the database with static updates (idempotent - won't duplicate)
 */
export async function seedPlatformUpdates(): Promise<void> {
  try {
    for (const update of STATIC_SEED_UPDATES) {
      const existing = await db.query.platformUpdates.findFirst({
        where: eq(platformUpdatesTable.id, update.id),
      });
      
      if (!existing) {
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
    }
    console.log('[WhatsNew] Platform updates seeding complete');
  } catch (error) {
    console.error('[WhatsNew] Failed to seed updates:', error);
  }
}

/**
 * Get updates from the database with RBAC filtering and viewed status
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
    
    // Get all updates
    const conditions = [];
    if (options?.category) {
      conditions.push(eq(platformUpdatesTable.category, options.category as any));
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
    console.error('[WhatsNew] Database query failed, falling back to static:', error);
    let updates = [...STATIC_SEED_UPDATES];
    
    if (options?.category) {
      updates = updates.filter(u => u.category === options.category);
    }
    
    updates.sort((a, b) => {
      const aPriority = a.priority ?? 999;
      const bPriority = b.priority ?? 999;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    if (options?.limit && !options?.includeAll) {
      updates = updates.slice(0, options.limit);
    }
    
    return updates;
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
 * Get unviewed updates count for a user
 */
export async function getUnviewedCount(userId: string, userRole: string = 'staff'): Promise<number> {
  try {
    const viewedUpdates = await db.query.userPlatformUpdateViews.findMany({
      where: eq(userPlatformUpdateViews.userId, userId),
      columns: { updateId: true },
    });
    const viewedIds = viewedUpdates.map(v => v.updateId);
    
    const allUpdates = await db.query.platformUpdates.findMany({
      where: viewedIds.length > 0 
        ? notInArray(platformUpdatesTable.id, viewedIds) 
        : undefined,
    });
    
    // Filter by RBAC
    return allUpdates.filter(u => hasVisibilityAccess(userRole, u.visibility || 'all')).length;
  } catch (error) {
    console.error('[WhatsNew] Failed to get unviewed count:', error);
    return 0;
  }
}

export async function getLatestUpdates(count: number = 5, userId?: string, userRole?: string): Promise<PlatformUpdate[]> {
  return getUpdates({ limit: count, userId, userRole });
}

export async function getNewFeatures(userId?: string, userRole?: string): Promise<PlatformUpdate[]> {
  try {
    const updates = await db.query.platformUpdates.findMany({
      where: eq(platformUpdatesTable.isNew, true),
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
    return STATIC_SEED_UPDATES.filter(u => u.isNew === true);
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
    return STATIC_SEED_UPDATES.find(u => u.id === id);
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
      total: STATIC_SEED_UPDATES.length,
      recentCount: STATIC_SEED_UPDATES.filter(u => 
        new Date(u.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length,
      newFeatures: STATIC_SEED_UPDATES.filter(u => u.isNew).length,
      byCategory: {
        feature: STATIC_SEED_UPDATES.filter(u => u.category === 'feature').length,
        improvement: STATIC_SEED_UPDATES.filter(u => u.category === 'improvement').length,
        bugfix: STATIC_SEED_UPDATES.filter(u => u.category === 'bugfix').length,
        security: STATIC_SEED_UPDATES.filter(u => u.category === 'security').length,
        announcement: STATIC_SEED_UPDATES.filter(u => u.category === 'announcement').length,
      },
      latestVersion: PLATFORM.version,
    };
  }
}

export async function addUpdate(update: Omit<PlatformUpdate, 'id'> & { visibility?: string }): Promise<PlatformUpdate> {
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
      date: new Date(update.date),
    });
    
    return { ...update, id };
  } catch (error) {
    console.error('[WhatsNew] Failed to add update:', error);
    throw error;
  }
}
