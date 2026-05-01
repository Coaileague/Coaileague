/**
 * What's New Service - Dynamic Platform Updates Feed
 * Queries updates from the platformUpdates database table
 * Includes RBAC filtering and user view tracking
 * Connected to the Platform Event Bus for real-time updates
 */

import { db } from '../db';
import {
  userPlatformUpdateViews,
  platformUpdates as platformUpdatesTable
} from '@shared/schema';
import { isFeatureEnabled, PLATFORM } from '@shared/platformConfig';
import { desc, eq, sql, and, gte, or, isNull, notInArray } from 'drizzle-orm';
import { humanizeTitle, humanizeText, containsTechnicalJargon, generateEndUserSummary } from '@shared/utils/humanFriendlyCopy';
import { createLogger } from '../lib/logger';
const log = createLogger('whatsNewService');


export interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  date: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement' | 'maintenance' | 'diagnostic' | 'support' | 'ai_brain' | 'error';
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
  'co_owner': 1,           // Same as admin access
  'department_manager': 2,  // Manager level
  'supervisor': 3,          // Supervisor level
  'staff': 4,               // Staff level
  'auditor': 4,             // Staff level (read-only)
  'contractor': 4,          // Staff level (limited)
};


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
 * Check for platform updates - all updates are now managed via admin interface
 * No static seeding - fully database-driven
 */
export async function seedPlatformUpdates(): Promise<void> {
  try {
    const { isDbCircuitOpen } = await import('../db');
    if (isDbCircuitOpen()) {
      log.warn('[WhatsNew] Skipping update check — DB circuit is open');
      return;
    }
    const existingCount = await db.query.platformUpdates.findFirst({});
    if (existingCount) {
      log.info('[WhatsNew] Platform updates exist in database');
    } else {
      log.info('[WhatsNew] No platform updates - create via admin interface');
    }
  } catch (error) {
    log.error('[WhatsNew] Failed to check updates:', error);
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
        desc(platformUpdatesTable.createdAt), // date column does not exist → use createdAt
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

    const seenTitles = new Set<string>();
    return dbUpdates
      .filter(u => {
        const visibility = u.visibility || 'all';
        if (!hasVisibilityAccess(userRole, visibility)) return false;
        const titleKey = u.title.toLowerCase().trim();
        if (seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
      })
      .map(u => ({
        id: u.id,
        title: u.title,
        description: u.description,
        date: u.date?.toISOString() || u.createdAt?.toISOString() || new Date().toISOString(),
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
    log.error('[WhatsNew] Database query failed:', error);
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
    
    log.info(`[WhatsNew] User ${userId} viewed update ${updateId}`);
    return true;
  } catch (error) {
    log.error('[WhatsNew] Failed to mark update as viewed:', error);
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
    const unviewedCount = allUpdates.filter(u => hasVisibilityAccess(userRole, u.visibility || 'all')).length;
    log.info(`[WhatsNew.getUnviewedCount] TotalUpdates fetched: ${allUpdates.length}, After RBAC filter: ${unviewedCount}`);
    return unviewedCount;
  } catch (error) {
    log.error('[WhatsNew] Failed to get unviewed count:', error);
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
      orderBy: [sql`COALESCE(${platformUpdatesTable.priority}, 999) ASC`, desc(platformUpdatesTable.createdAt)], // date column does not exist → use createdAt
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
        date: u.date?.toISOString() || u.createdAt?.toISOString() || new Date().toISOString(),
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
    log.error('[WhatsNew] Failed to get new features:', error);
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
    log.error('[WhatsNew] Failed to get update by ID:', error);
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
    log.error('[WhatsNew] Failed to get stats:', error);
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
  // Humanize title and description for end users
  const humanizedTitle = containsTechnicalJargon(update.title) 
    ? humanizeTitle(update.title)
    : update.title;
  const humanizedDescription = containsTechnicalJargon(update.description)
    ? generateEndUserSummary(update.description, update.category)
    : update.description;
  
  // Use ORIGINAL title for id generation to avoid collisions when multiple technical 
  // titles map to the same humanized phrase (e.g., multiple API updates -> same friendly copy)
  const id = `${update.title.toLowerCase().replace(/\s+/g, '-')}-${update.date}`;
  
  try {
    await db.insert(platformUpdatesTable).values({
      id,
      title: humanizedTitle,
      description: humanizedDescription,
      category: update.category,
      badge: update.badge,
      version: update.version,
      isNew: update.isNew ?? true,
      priority: update.priority,
      learnMoreUrl: update.learnMoreUrl,
      visibility: (update as any).visibility || 'all',
      workspaceId: update.workspaceId || null, // null = global, set = workspace-specific
      date: new Date(update.date),
    });
    
    log.info(`[WhatsNew] Added humanized update: "${humanizedTitle}"`);
    return { ...update, id, title: humanizedTitle, description: humanizedDescription };
  } catch (error) {
    log.error('[WhatsNew] Failed to add update:', error);
    throw error;
  }
}
