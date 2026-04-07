/**
 * Notification Cleanup Service
 * 
 * Automatically removes old notifications to keep the database clean.
 * - Read notifications: Remove after 30 days
 * - Unread notifications: Remove after 90 days
 * - Runs daily at 2 AM to minimize impact
 */

import { db } from "../db";
import { notifications, platformUpdates } from "@shared/schema";
import { sql, and, lt, eq } from "drizzle-orm";
import cron from "node-cron";
import { BATCHES } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('notificationCleanupService');


// Configuration
const CLEANUP_CONFIG = {
  readNotificationsMaxAgeDays: 30,      // Remove read notifications after 30 days
  unreadNotificationsMaxAgeDays: 90,    // Remove unread notifications after 90 days
  platformUpdatesMaxAgeDays: 14,        // Keep platform updates for 2 weeks (synced with 7-day display window)
  batchSize: BATCHES.notificationCleanupBatch,
};

interface CleanupResult {
  readNotificationsDeleted: number;
  unreadNotificationsDeleted: number;
  platformUpdatesDeleted: number;
  duration: number;
  errors: string[];
}

/**
 * Calculate date threshold for cleanup
 */
function getDateThreshold(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

/**
 * Clean up old read notifications
 */
async function cleanupReadNotifications(): Promise<number> {
  const threshold = getDateThreshold(CLEANUP_CONFIG.readNotificationsMaxAgeDays);
  
  const result = await db.delete(notifications)
    .where(and(
      eq(notifications.isRead, true),
      lt(notifications.createdAt, threshold)
    ))
    .returning({ id: notifications.id });
  
  return result.length;
}

/**
 * Clean up old unread notifications
 */
async function cleanupUnreadNotifications(): Promise<number> {
  const threshold = getDateThreshold(CLEANUP_CONFIG.unreadNotificationsMaxAgeDays);
  
  const result = await db.delete(notifications)
    .where(and(
      eq(notifications.isRead, false),
      lt(notifications.createdAt, threshold)
    ))
    .returning({ id: notifications.id });
  
  return result.length;
}

/**
 * Clean up old platform updates (keep recent ones for new user onboarding)
 */
async function cleanupPlatformUpdates(): Promise<number> {
  const threshold = getDateThreshold(CLEANUP_CONFIG.platformUpdatesMaxAgeDays);
  
  // Delete old platform updates
  const result = await db.delete(platformUpdates)
    .where(lt(platformUpdates.date, threshold))
    .returning({ id: platformUpdates.id });
  
  return result.length;
}

/**
 * Run all cleanup tasks
 */
export async function runCleanupTasks(): Promise<CleanupResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  let readNotificationsDeleted = 0;
  let unreadNotificationsDeleted = 0;
  let platformUpdatesDeleted = 0;
  
  log.info("[NotificationCleanup] Starting cleanup tasks...");
  
  // Clean read notifications
  try {
    readNotificationsDeleted = await cleanupReadNotifications();
    log.info(`[NotificationCleanup] Removed ${readNotificationsDeleted} read notifications`);
  } catch (error) {
    const errMsg = `Failed to clean read notifications: ${error}`;
    log.error(`[NotificationCleanup] ${errMsg}`);
    errors.push(errMsg);
  }
  
  // Clean unread notifications
  try {
    unreadNotificationsDeleted = await cleanupUnreadNotifications();
    log.info(`[NotificationCleanup] Removed ${unreadNotificationsDeleted} unread notifications`);
  } catch (error) {
    const errMsg = `Failed to clean unread notifications: ${error}`;
    log.error(`[NotificationCleanup] ${errMsg}`);
    errors.push(errMsg);
  }
  
  // Clean platform updates
  try {
    platformUpdatesDeleted = await cleanupPlatformUpdates();
    log.info(`[NotificationCleanup] Removed ${platformUpdatesDeleted} platform updates`);
  } catch (error) {
    const errMsg = `Failed to clean platform updates: ${error}`;
    log.error(`[NotificationCleanup] ${errMsg}`);
    errors.push(errMsg);
  }
  
  const duration = Date.now() - startTime;
  
  const result: CleanupResult = {
    readNotificationsDeleted,
    unreadNotificationsDeleted,
    platformUpdatesDeleted,
    duration,
    errors,
  };
  
  log.info(`[NotificationCleanup] Cleanup completed in ${duration}ms. Total removed: ${
    readNotificationsDeleted + unreadNotificationsDeleted + platformUpdatesDeleted
  }`);
  
  return result;
}

/**
 * Start the scheduled cleanup job (runs daily at 2 AM)
 */
export function startNotificationCleanupScheduler(): void {
  log.info("[NotificationCleanup] Scheduling daily cleanup at 2:00 AM");
  
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    log.info("[NotificationCleanup] Running scheduled cleanup...");
    try {
      await runCleanupTasks();
    } catch (error) {
      log.error("[NotificationCleanup] Scheduled cleanup failed:", error);
    }
  });
  
  // Also run once on startup (after 5 minute delay to let server stabilize)
  setTimeout(async () => {
    log.info("[NotificationCleanup] Running startup cleanup...");
    try {
      await runCleanupTasks();
    } catch (error) {
      log.error("[NotificationCleanup] Startup cleanup failed:", error);
    }
  }, 5 * 60 * 1000);
}

/**
 * Get cleanup statistics (for admin dashboard)
 */
export async function getCleanupStats(): Promise<{
  totalNotifications: number;
  readNotifications: number;
  unreadNotifications: number;
  oldReadNotifications: number;
  oldUnreadNotifications: number;
  pendingCleanup: number;
}> {
  const readThreshold = getDateThreshold(CLEANUP_CONFIG.readNotificationsMaxAgeDays);
  const unreadThreshold = getDateThreshold(CLEANUP_CONFIG.unreadNotificationsMaxAgeDays);
  
  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(notifications);
  
  const [read] = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.isRead, true));
  
  const [oldRead] = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(
      eq(notifications.isRead, true),
      lt(notifications.createdAt, readThreshold)
    ));
  
  const [oldUnread] = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(
      eq(notifications.isRead, false),
      lt(notifications.createdAt, unreadThreshold)
    ));
  
  return {
    totalNotifications: Number(total?.count || 0),
    readNotifications: Number(read?.count || 0),
    unreadNotifications: Number(total?.count || 0) - Number(read?.count || 0),
    oldReadNotifications: Number(oldRead?.count || 0),
    oldUnreadNotifications: Number(oldUnread?.count || 0),
    pendingCleanup: Number(oldRead?.count || 0) + Number(oldUnread?.count || 0),
  };
}

export default {
  runCleanupTasks,
  startNotificationCleanupScheduler,
  getCleanupStats,
  CLEANUP_CONFIG,
};
