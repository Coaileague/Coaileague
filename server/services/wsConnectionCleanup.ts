/**
 * WebSocket Connection Cleanup Service
 * 
 * Aggressively cleans up orphaned WebSocket connections to prevent
 * "Maximum concurrent connections exceeded" errors. Runs every 5 minutes
 * via autonomous scheduler.
 */

import { db } from '../db';
import { chatConnections } from '@shared/schema';
import { isNull, and, sql } from 'drizzle-orm';
import { cleanupStaleConnections } from '../middleware/wsRateLimiter';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';
const log = createLogger('wsConnectionCleanup');


/**
 * Mark orphaned connections as disconnected
 * Orphaned = connected >5 minutes ago but never marked disconnected
 */
export async function markOrphanedConnections(thresholdMs: number = 5 * 60 * 1000): Promise<number> {
  try {
    const threshold = new Date(Date.now() - thresholdMs);
    
    // Find and mark orphaned connections
    const orphanedConnections = await db
      .update(chatConnections)
      .set({
        disconnectedAt: new Date(),
        disconnectReason: 'orphaned_auto_cleanup'
      })
      .where(
        and(
          isNull(chatConnections.disconnectedAt),
          sql`${chatConnections.connectedAt} < ${threshold.toISOString()}`
        )
      )
      .returning({ sessionId: chatConnections.sessionId });
    
    if (orphanedConnections.length > 0) {
      log.info(`🧹 Cleaned up ${orphanedConnections.length} orphaned WebSocket connection(s)`);
    }
    
    return orphanedConnections.length;
  } catch (error) {
    log.error('Error marking orphaned connections:', error);
    return 0;
  }
}

/**
 * Run comprehensive WebSocket connection cleanup
 * - Marks orphaned connections (>5 min) as disconnected
 * - Purges old records (>24 hours via existing cleanup)
 */
export async function runWebSocketConnectionCleanup(): Promise<void> {
  log.info('\n=================================================');
  log.info('🧹 WebSocket Connection Cleanup - Starting');
  log.info('=================================================\n');

  try {
    // Step 1: Mark orphaned connections (>5 minutes old, never disconnected)
    const orphanedCount = await markOrphanedConnections(5 * 60 * 1000);
    
    // Step 2: Purge old disconnected records (>24 hours via existing cleanup)
    const purgedCount = await cleanupStaleConnections();
    
    log.info(`\n✅ WebSocket cleanup complete:`);
    log.info(`   Orphaned connections closed: ${orphanedCount}`);
    log.info(`   Stale records purged: ${purgedCount}`);

    // NOTE: workspaceId must be a real workspace row or null — 'PLATFORM' is not a valid FK value.
    // This is an internal infrastructure event; it is blocked by SYSTEM_INTERNAL_EVENT_TYPES
    // and never reaches the What's New feed or platform_updates table.
    platformEventBus.publish({
      type: 'websocket_cleanup_completed',
      category: 'announcement',
      title: 'WebSocket Cleanup Completed',
      description: `Closed ${orphanedCount} orphaned connection(s), purged ${purgedCount} stale record(s)`,
      workspaceId: PLATFORM_WORKSPACE_ID,
      metadata: { orphanedCount, purgedCount },
    });

  } catch (error) {
    log.error('💥 Critical error in WebSocket cleanup:', error);
  }

  log.info('=================================================\n');
}
