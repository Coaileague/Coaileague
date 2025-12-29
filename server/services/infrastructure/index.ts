/**
 * INFRASTRUCTURE SERVICES INDEX
 * ==============================
 * Central initialization and export for all Q1/Q2/Q3/Q4 2026 infrastructure services.
 * 
 * Q1 Services:
 * - Durable Job Queue: Database-backed reliable task execution
 * - Backup Service: Automated database backups with verification
 * - Error Tracking: Sentry-style error aggregation and alerting
 * - API Key Rotation: Automated key lifecycle management
 * 
 * Q2 Services:
 * - Distributed Tracing: Request tracking across services
 * - Connection Pooling: Database connection optimization
 * - Rate Limiting: Per-tenant quota management
 * - Health Check Aggregation: Unified service health monitoring
 * - Metrics Dashboard: Infrastructure visualization
 * 
 * Q3 Services (Phase 3b):
 * - Circuit Breaker: Cascade failure prevention for external services
 * - SLA Monitoring: Uptime tracking and compliance reporting
 * 
 * Q4 Services (Phase 4):
 * - Disaster Recovery: RPO/RTO management, automated failover
 * - Log Aggregation: Centralized logging with search and retention
 * - Security Hardening: Threat detection and vulnerability scanning
 * - CDN/Edge Caching: Static asset and API response caching
 * - Audit Trail Export: SOX-compliant export and compliance reporting
 */

import { durableJobQueue } from './durableJobQueue';
import { backupService } from './backupService';
import { errorTrackingService } from './errorTrackingService';
import { apiKeyRotationService } from './apiKeyRotationService';
import { distributedTracing } from './distributedTracing';
import { connectionPooling } from './connectionPooling';
import { rateLimiting } from './rateLimiting';
import { healthCheckAggregation } from './healthCheckAggregation';
import { metricsDashboard } from './metricsDashboard';
import { circuitBreaker } from './circuitBreaker';
import { slaMonitoring } from './slaMonitoring';
import { initializeProductionSeeding } from './productionSeeding';

// Q4 imports
import { disasterRecoveryService } from './disasterRecoveryService';
import { logAggregationService } from './logAggregationService';
import { securityHardeningService } from './securityHardeningService';
import { cdnCachingService } from './cdnCachingService';
import { auditTrailExportService } from './auditTrailExportService';

// Q1 exports
export { durableJobQueue } from './durableJobQueue';
export { backupService } from './backupService';
export { errorTrackingService } from './errorTrackingService';
export { apiKeyRotationService } from './apiKeyRotationService';

// Q2 exports
export { distributedTracing, tracingMiddleware } from './distributedTracing';
export { connectionPooling } from './connectionPooling';
export { rateLimiting, rateLimitMiddleware } from './rateLimiting';
export { healthCheckAggregation } from './healthCheckAggregation';
export { metricsDashboard } from './metricsDashboard';

// Q3 exports (Phase 3b)
export { circuitBreaker } from './circuitBreaker';
export { slaMonitoring } from './slaMonitoring';

// Q4 exports (Phase 4)
export { disasterRecoveryService } from './disasterRecoveryService';
export { logAggregationService } from './logAggregationService';
export { securityHardeningService } from './securityHardeningService';
export { cdnCachingService } from './cdnCachingService';
export { auditTrailExportService } from './auditTrailExportService';

// Production seeding exports
export { initializeProductionSeeding, seedProductionAlertRules, seedProductionDashboards, registerExtendedHealthChecks } from './productionSeeding';

/**
 * Initialize all infrastructure services
 * Should be called during server startup
 */
export async function initializeInfrastructureServices(): Promise<void> {
  console.log('[Infrastructure] Initializing Q1/Q2/Q3/Q4 2026 infrastructure services...');
  
  // Initialize Q1 services
  const q1Results = await Promise.allSettled([
    durableJobQueue.initialize(),
    backupService.initialize(),
    errorTrackingService.initialize(),
    apiKeyRotationService.initialize(),
  ]);
  
  // Initialize Q2 services
  const q2Results = await Promise.allSettled([
    distributedTracing.initialize(),
    connectionPooling.initialize(),
    rateLimiting.initialize(),
    healthCheckAggregation.initialize(),
    metricsDashboard.initialize(),
  ]);
  
  // Initialize Q3 services (Phase 3b)
  const q3Results = await Promise.allSettled([
    circuitBreaker.initialize(),
    slaMonitoring.initialize(),
  ]);
  
  // Initialize Q4 services (Phase 4)
  const q4Results = await Promise.allSettled([
    disasterRecoveryService.initialize(),
    logAggregationService.initialize(),
    securityHardeningService.initialize(),
    cdnCachingService.initialize(),
    auditTrailExportService.initialize(),
  ]);
  
  const allResults = [...q1Results, ...q2Results, ...q3Results, ...q4Results];
  const successes = allResults.filter(r => r.status === 'fulfilled').length;
  const failures = allResults.filter(r => r.status === 'rejected');
  
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error('[Infrastructure] Service initialization failed:', (failure as PromiseRejectedResult).reason);
    }
  }
  
  // Register Trinity recovery job handler
  registerTrinityRecoveryHandler();
  
  // Register default circuit breakers for external services
  registerDefaultCircuits();
  
  // Register default SLA monitoring for core services
  registerDefaultSLAMonitoring();
  
  // Initialize production seeding (alert rules, dashboards, extended health checks)
  await initializeProductionSeeding();
  
  console.log(`[Infrastructure] ${successes}/${allResults.length} services initialized successfully`);
  console.log('[Infrastructure] Q1: Job Queue, Backups, Error Tracking, API Key Rotation');
  console.log('[Infrastructure] Q2: Distributed Tracing, Connection Pooling, Rate Limiting, Health Checks, Metrics Dashboard');
  console.log('[Infrastructure] Q3: Circuit Breaker, SLA Monitoring');
  console.log('[Infrastructure] Q4: Disaster Recovery, Log Aggregation, Security Hardening, CDN Caching, Audit Trail Export');
  console.log('[Infrastructure] Production: SRE alerts, dashboards, extended health checks');
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
 * Register default circuit breakers for external services
 */
function registerDefaultCircuits(): void {
  // Register circuits for all critical external services
  circuitBreaker.registerCircuit('stripe', 'Stripe Payment API');
  circuitBreaker.registerCircuit('gemini', 'Google Gemini AI');
  circuitBreaker.registerCircuit('resend', 'Resend Email API');
  circuitBreaker.registerCircuit('twilio', 'Twilio SMS API');
  circuitBreaker.registerCircuit('database', 'PostgreSQL Database');
  circuitBreaker.registerCircuit('websocket', 'WebSocket Server');
  
  console.log('[Infrastructure] Registered 6 default circuit breakers');
}

/**
 * Register default SLA monitoring for core services
 */
function registerDefaultSLAMonitoring(): void {
  // Core platform services - Platinum tier (99.99%)
  slaMonitoring.registerService('database', 'PostgreSQL Database', 'platinum');
  slaMonitoring.registerService('api', 'REST API', 'gold');
  
  // External integrations - Gold tier (99.9%)
  slaMonitoring.registerService('stripe', 'Stripe Integration', 'gold');
  slaMonitoring.registerService('gemini', 'Gemini AI', 'gold');
  slaMonitoring.registerService('resend', 'Email Service', 'gold');
  
  // Supporting services - Silver tier (99.5%)
  slaMonitoring.registerService('websocket', 'WebSocket Server', 'silver');
  slaMonitoring.registerService('background_jobs', 'Background Jobs', 'silver');
  
  console.log('[Infrastructure] Registered 7 SLA monitoring targets');
}

/**
 * Shutdown all infrastructure services gracefully
 */
export function shutdownInfrastructureServices(): void {
  console.log('[Infrastructure] Shutting down infrastructure services...');
  
  // Q1 services
  durableJobQueue.shutdown();
  backupService.shutdown();
  errorTrackingService.shutdown();
  apiKeyRotationService.shutdown();
  
  // Q2 services
  distributedTracing.shutdown();
  connectionPooling.shutdown();
  rateLimiting.shutdown();
  healthCheckAggregation.shutdown();
  metricsDashboard.shutdown();
  
  // Q3 services
  circuitBreaker.shutdown();
  slaMonitoring.shutdown();
  
  // Q4 services
  disasterRecoveryService.shutdown();
  logAggregationService.shutdown();
  securityHardeningService.shutdown();
  cdnCachingService.shutdown();
  auditTrailExportService.shutdown();
  
  console.log('[Infrastructure] All infrastructure services shut down');
}

/**
 * Get health status of all infrastructure services
 */
export async function getInfrastructureHealth(): Promise<{
  q1: {
    jobQueue: { status: string; stats: any };
    backup: { status: string; stats: any };
    errorTracking: { status: string; stats: any };
    apiKeyRotation: { status: string; keyCount: number };
  };
  q2: {
    distributedTracing: { status: string; stats: any };
    connectionPooling: { status: string; stats: any };
    rateLimiting: { status: string; stats: any };
    healthCheck: { status: string; aggregate: any };
    metrics: { status: string; overview: any };
  };
  q3: {
    circuitBreaker: { status: string; stats: any };
    slaMonitoring: { status: string; compliance: any };
  };
  q4: {
    disasterRecovery: { status: string; stats: any };
    logAggregation: { status: string; stats: any };
    securityHardening: { status: string; stats: any };
    cdnCaching: { status: string; stats: any };
    auditTrailExport: { status: string; stats: any };
  };
}> {
  const [jobQueueStats, backupStats, errorStats, keys] = await Promise.all([
    durableJobQueue.getStats(),
    backupService.getStats(),
    errorTrackingService.getStats(),
    apiKeyRotationService.getKeys(),
  ]);
  
  const tracingStats = distributedTracing.getStats();
  const poolingStats = connectionPooling.getStats();
  const rateLimitStats = rateLimiting.getStats();
  const healthAggregate = healthCheckAggregation.getAggregateHealth();
  const metricsOverview = metricsDashboard.getSystemOverview();
  
  // Q3 stats
  const circuitHealth = circuitBreaker.getHealth();
  const circuitStats = circuitBreaker.getAggregateStats();
  const slaHealth = slaMonitoring.getHealth();
  const slaCompliance = slaMonitoring.getComplianceSummary();
  
  // Q4 stats
  const drHealth = disasterRecoveryService.getHealth();
  const drStats = disasterRecoveryService.getStats();
  const logHealth = logAggregationService.getHealth();
  const logStats = logAggregationService.getStats();
  const secHealth = securityHardeningService.getHealth();
  const secStats = securityHardeningService.getStats();
  const cdnHealth = cdnCachingService.getHealth();
  const cdnStats = cdnCachingService.getStats();
  const auditHealth = auditTrailExportService.getHealth();
  const auditStats = auditTrailExportService.getStats();
  
  return {
    q1: {
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
    },
    q2: {
      distributedTracing: {
        status: 'healthy',
        stats: tracingStats,
      },
      connectionPooling: {
        status: poolingStats.waitingRequests > 10 ? 'degraded' : 'healthy',
        stats: poolingStats,
      },
      rateLimiting: {
        status: rateLimitStats.blockRate > 0.1 ? 'degraded' : 'healthy',
        stats: rateLimitStats,
      },
      healthCheck: {
        status: healthAggregate.overallStatus,
        aggregate: healthAggregate,
      },
      metrics: {
        status: 'healthy',
        overview: metricsOverview,
      },
    },
    q3: {
      circuitBreaker: {
        status: circuitHealth.healthy ? 'healthy' : 'degraded',
        stats: {
          ...circuitStats,
          openCircuits: circuitHealth.openCircuits
        },
      },
      slaMonitoring: {
        status: slaCompliance.overallHealth,
        compliance: slaCompliance,
      },
    },
    q4: {
      disasterRecovery: {
        status: drHealth.healthy ? 'healthy' : 'degraded',
        stats: drStats,
      },
      logAggregation: {
        status: logHealth.healthy ? 'healthy' : 'degraded',
        stats: logStats,
      },
      securityHardening: {
        status: secHealth.healthy ? 'healthy' : 'degraded',
        stats: secStats,
      },
      cdnCaching: {
        status: cdnHealth.healthy ? 'healthy' : 'degraded',
        stats: cdnStats,
      },
      auditTrailExport: {
        status: auditHealth.healthy ? 'healthy' : 'degraded',
        stats: auditStats,
      },
    },
  };
}
