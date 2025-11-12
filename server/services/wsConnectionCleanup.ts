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
      console.log(`🧹 Cleaned up ${orphanedConnections.length} orphaned WebSocket connection(s)`);
    }
    
    return orphanedConnections.length;
  } catch (error) {
    console.error('Error marking orphaned connections:', error);
    return 0;
  }
}

/**
 * Run comprehensive WebSocket connection cleanup
 * - Marks orphaned connections (>5 min) as disconnected
 * - Purges old records (>24 hours via existing cleanup)
 */
export async function runWebSocketConnectionCleanup(): Promise<void> {
  console.log('\n=================================================');
  console.log('🧹 WebSocket Connection Cleanup - Starting');
  console.log('=================================================\n');

  try {
    // Step 1: Mark orphaned connections (>5 minutes old, never disconnected)
    const orphanedCount = await markOrphanedConnections(5 * 60 * 1000);
    
    // Step 2: Purge old disconnected records (>24 hours via existing cleanup)
    const purgedCount = await cleanupStaleConnections();
    
    console.log(`\n✅ WebSocket cleanup complete:`);
    console.log(`   Orphaned connections closed: ${orphanedCount}`);
    console.log(`   Stale records purged: ${purgedCount}`);
    
  } catch (error) {
    console.error('💥 Critical error in WebSocket cleanup:', error);
  }

  console.log('=================================================\n');
}
