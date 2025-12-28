/**
 * INFRASTRUCTURE SERVICES INDEX
 * ==============================
 * Central initialization and export for all Q1 2026 infrastructure services.
 * 
 * Services included:
 * - Durable Job Queue: Database-backed reliable task execution
 * - Backup Service: Automated database backups with verification
 * - Error Tracking: Sentry-style error aggregation and alerting
 * - API Key Rotation: Automated key lifecycle management
 */

import { durableJobQueue } from './durableJobQueue';
import { backupService } from './backupService';
import { errorTrackingService } from './errorTrackingService';
import { apiKeyRotationService } from './apiKeyRotationService';

export { durableJobQueue } from './durableJobQueue';
export { backupService } from './backupService';
export { errorTrackingService } from './errorTrackingService';
export { apiKeyRotationService } from './apiKeyRotationService';

/**
 * Initialize all infrastructure services
 * Should be called during server startup
 */
export async function initializeInfrastructureServices(): Promise<void> {
  console.log('[Infrastructure] Initializing Q1 2026 infrastructure services...');
  
  const results = await Promise.allSettled([
    durableJobQueue.initialize(),
    backupService.initialize(),
    errorTrackingService.initialize(),
    apiKeyRotationService.initialize(),
  ]);
  
  const successes = results.filter(r => r.status === 'fulfilled').length;
  const failures = results.filter(r => r.status === 'rejected');
  
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error('[Infrastructure] Service initialization failed:', (failure as PromiseRejectedResult).reason);
    }
  }
  
  // Register Trinity recovery job handler
  registerTrinityRecoveryHandler();
  
  console.log(`[Infrastructure] ${successes}/${results.length} services initialized successfully`);
}

/**
 * Register the Trinity proposal recovery job handler with the durable job queue
 */
function registerTrinityRecoveryHandler(): void {
  durableJobQueue.registerHandler('trinity_proposal_recovery', async (job) => {
    const { proposalId, retryCount } = job.payload;
    
    try {
      // Dynamic import to avoid circular dependencies
      const { trinitySelfEditGovernance } = await import('../ai-brain/trinitySelfEditGovernance');
      
      const proposal = trinitySelfEditGovernance.getProposal(proposalId);
      if (!proposal) {
        return { success: false, error: `Proposal ${proposalId} not found` };
      }
      
      if (proposal.status !== 'approved' && proposal.status !== 'auto_approved') {
        return { success: true, result: { skipped: true, reason: 'Proposal not in approved state' } };
      }
      
      const result = await trinitySelfEditGovernance.applyApprovedChanges(proposalId);
      
      if (result.success) {
        console.log(`[Infrastructure] Trinity recovery job completed for proposal ${proposalId}`);
        return { success: true, result };
      } else {
        console.warn(`[Infrastructure] Trinity recovery job failed for proposal ${proposalId}: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      console.error(`[Infrastructure] Trinity recovery job error for proposal ${proposalId}:`, error);
      return { success: false, error: error.message };
    }
  });
  
  console.log('[Infrastructure] Trinity recovery handler registered');
}

/**
 * Shutdown all infrastructure services gracefully
 */
export function shutdownInfrastructureServices(): void {
  console.log('[Infrastructure] Shutting down infrastructure services...');
  
  durableJobQueue.shutdown();
  backupService.shutdown();
  errorTrackingService.shutdown();
  apiKeyRotationService.shutdown();
  
  console.log('[Infrastructure] All infrastructure services shut down');
}

/**
 * Get health status of all infrastructure services
 */
export async function getInfrastructureHealth(): Promise<{
  jobQueue: { status: string; stats: any };
  backup: { status: string; stats: any };
  errorTracking: { status: string; stats: any };
  apiKeyRotation: { status: string; keyCount: number };
}> {
  const [jobQueueStats, backupStats, errorStats, keys] = await Promise.all([
    durableJobQueue.getStats(),
    backupService.getStats(),
    errorTrackingService.getStats(),
    apiKeyRotationService.getKeys(),
  ]);
  
  return {
    jobQueue: {
      status: 'healthy',
      stats: jobQueueStats,
    },
    backup: {
      status: backupStats.lastSuccessfulBackup ? 'healthy' : 'no_backups',
      stats: backupStats,
    },
    errorTracking: {
      status: errorStats.criticalErrors > 0 ? 'degraded' : 'healthy',
      stats: errorStats,
    },
    apiKeyRotation: {
      status: 'healthy',
      keyCount: keys.length,
    },
  };
}
