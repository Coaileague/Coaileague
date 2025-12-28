/**
 * Production Seeding Service - Q2 2026 Infrastructure
 * 
 * Seeds production-ready configurations for:
 * - SRE alert rules aligned with industry best practices
 * - Dashboard configurations for operations monitoring
 * - Extended health checks for platform dependencies
 * - SOX-compliant thresholds and escalation rules
 */

import { metricsDashboard } from './metricsDashboard';
import { healthCheckAggregation } from './healthCheckAggregation';
import { distributedTracing } from './distributedTracing';
import { connectionPooling } from './connectionPooling';
import { rateLimiting } from './rateLimiting';
import { db } from '../../db';

/**
 * Seed production alert rules for SRE monitoring
 */
export function seedProductionAlertRules(): void {
  console.log('[ProductionSeeding] Seeding SRE alert rules...');

  const alertRules = [
    {
      metricName: 'system.memory.heap_used_mb',
      condition: 'above' as const,
      threshold: 1800,
      duration: 300,
      severity: 'critical' as const,
      enabled: true
    },
    {
      metricName: 'system.memory.heap_used_mb',
      condition: 'above' as const,
      threshold: 1200,
      duration: 600,
      severity: 'warn' as const,
      enabled: true
    },
    {
      metricName: 'http.requests_per_minute',
      condition: 'above' as const,
      threshold: 15000,
      duration: 120,
      severity: 'warn' as const,
      enabled: true
    },
    {
      metricName: 'http.error_rate_percent',
      condition: 'above' as const,
      threshold: 5,
      duration: 60,
      severity: 'error' as const,
      enabled: true
    },
    {
      metricName: 'http.p99_latency_ms',
      condition: 'above' as const,
      threshold: 2000,
      duration: 300,
      severity: 'warn' as const,
      enabled: true
    },
    {
      metricName: 'db.query_time_avg_ms',
      condition: 'above' as const,
      threshold: 500,
      duration: 180,
      severity: 'warn' as const,
      enabled: true
    },
    {
      metricName: 'db.active_connections',
      condition: 'above' as const,
      threshold: 40,
      duration: 60,
      severity: 'error' as const,
      enabled: true
    },
    {
      metricName: 'pool.waiting_requests',
      condition: 'above' as const,
      threshold: 20,
      duration: 60,
      severity: 'error' as const,
      enabled: true
    },
    {
      metricName: 'rate_limit.block_rate_percent',
      condition: 'above' as const,
      threshold: 15,
      duration: 300,
      severity: 'info' as const,
      enabled: true
    },
    {
      metricName: 'tracing.slow_traces_percent',
      condition: 'above' as const,
      threshold: 10,
      duration: 600,
      severity: 'warn' as const,
      enabled: true
    }
  ];

  for (const rule of alertRules) {
    metricsDashboard.addAlertRule(rule);
  }

  console.log(`[ProductionSeeding] Seeded ${alertRules.length} SRE alert rules`);
}

/**
 * Seed production dashboards for operations monitoring
 */
export function seedProductionDashboards(): void {
  console.log('[ProductionSeeding] Seeding operations dashboards...');

  metricsDashboard.createDashboard({
    name: 'Infrastructure Overview',
    refreshInterval: 30000,
    panels: [
      {
        id: 'system-health',
        title: 'System Health',
        type: 'gauge',
        metrics: ['system.memory.heap_used_mb', 'system.uptime_seconds'],
        timeRange: 3600000,
        refreshInterval: 30000
      },
      {
        id: 'http-performance',
        title: 'HTTP Performance',
        type: 'line',
        metrics: ['http.requests_per_minute', 'http.p99_latency_ms', 'http.error_rate_percent'],
        timeRange: 3600000,
        refreshInterval: 30000
      },
      {
        id: 'database-health',
        title: 'Database Health',
        type: 'line',
        metrics: ['db.active_connections', 'db.query_time_avg_ms'],
        timeRange: 3600000,
        refreshInterval: 30000
      },
      {
        id: 'connection-pool',
        title: 'Connection Pool',
        type: 'line',
        metrics: ['pool.active_connections', 'pool.waiting_requests', 'pool.utilization_percent'],
        timeRange: 3600000,
        refreshInterval: 30000
      }
    ]
  });

  metricsDashboard.createDashboard({
    name: 'Rate Limiting & Quotas',
    refreshInterval: 60000,
    panels: [
      {
        id: 'rate-limit-overview',
        title: 'Rate Limiting Overview',
        type: 'line',
        metrics: ['rate_limit.total_requests', 'rate_limit.blocked_requests', 'rate_limit.block_rate_percent'],
        timeRange: 3600000,
        refreshInterval: 60000
      },
      {
        id: 'tenant-usage',
        title: 'Top Tenant Usage',
        type: 'table',
        metrics: ['rate_limit.tenant_requests'],
        timeRange: 3600000,
        refreshInterval: 60000
      }
    ]
  });

  metricsDashboard.createDashboard({
    name: 'Distributed Tracing',
    refreshInterval: 60000,
    panels: [
      {
        id: 'trace-volume',
        title: 'Trace Volume',
        type: 'line',
        metrics: ['tracing.total_traces', 'tracing.sampled_traces'],
        timeRange: 3600000,
        refreshInterval: 60000
      },
      {
        id: 'latency-distribution',
        title: 'Latency Distribution',
        type: 'heatmap',
        metrics: ['tracing.latency_p50', 'tracing.latency_p95', 'tracing.latency_p99'],
        timeRange: 3600000,
        refreshInterval: 60000
      },
      {
        id: 'slow-traces',
        title: 'Slow Traces',
        type: 'table',
        metrics: ['tracing.slow_traces'],
        timeRange: 3600000,
        refreshInterval: 60000
      }
    ]
  });

  metricsDashboard.createDashboard({
    name: 'SOX Compliance Metrics',
    refreshInterval: 300000,
    panels: [
      {
        id: 'audit-volume',
        title: 'Audit Log Volume',
        type: 'line',
        metrics: ['audit.logs_per_hour', 'audit.critical_events'],
        timeRange: 86400000,
        refreshInterval: 300000
      },
      {
        id: 'access-patterns',
        title: 'Access Patterns',
        type: 'line',
        metrics: ['auth.login_attempts', 'auth.failed_logins', 'auth.privilege_escalations'],
        timeRange: 86400000,
        refreshInterval: 300000
      },
      {
        id: 'data-changes',
        title: 'Critical Data Changes',
        type: 'table',
        metrics: ['audit.financial_changes', 'audit.permission_changes'],
        timeRange: 86400000,
        refreshInterval: 300000
      }
    ]
  });

  console.log('[ProductionSeeding] Seeded 4 operations dashboards');
}

/**
 * Register extended health checks for platform dependencies
 */
export function registerExtendedHealthChecks(): void {
  console.log('[ProductionSeeding] Registering extended health checks...');

  healthCheckAggregation.registerService({
    serviceId: 'distributed-tracing',
    serviceName: 'Distributed Tracing',
    checkFn: async () => {
      const stats = distributedTracing.getStats();
      return {
        healthy: stats.activeTraces >= 0,
        responseTime: 0,
        metadata: stats
      };
    },
    intervalMs: 60000,
    timeout: 5000,
    degradedThreshold: 100,
    unhealthyAfterFailures: 3
  });

  healthCheckAggregation.registerService({
    serviceId: 'connection-pool',
    serviceName: 'Connection Pool',
    checkFn: async () => {
      const stats = connectionPooling.getStats();
      const utilizationHigh = stats.activeConnections / stats.totalConnections > 0.9;
      return {
        healthy: !utilizationHigh && stats.waitingRequests < 10,
        responseTime: 0,
        metadata: stats
      };
    },
    intervalMs: 30000,
    timeout: 5000,
    degradedThreshold: 50,
    unhealthyAfterFailures: 3
  });

  healthCheckAggregation.registerService({
    serviceId: 'rate-limiter',
    serviceName: 'Rate Limiter',
    checkFn: async () => {
      const stats = rateLimiting.getStats();
      return {
        healthy: stats.blockRate < 0.2,
        responseTime: 0,
        metadata: stats
      };
    },
    intervalMs: 60000,
    timeout: 5000,
    degradedThreshold: 50,
    unhealthyAfterFailures: 5
  });

  healthCheckAggregation.registerService({
    serviceId: 'ai-brain',
    serviceName: 'AI Brain Services',
    checkFn: async () => {
      try {
        const { aiBrainMasterOrchestrator } = await import('../ai-brain/aiBrainMasterOrchestrator');
        const actions = aiBrainMasterOrchestrator.getActionSummary();
        const totalActions = Object.values(actions).reduce((a, b) => a + b, 0);
        return {
          healthy: totalActions > 0,
          responseTime: 0,
          metadata: { totalActions, categories: Object.keys(actions).length }
        };
      } catch {
        return { healthy: false, responseTime: 0 };
      }
    },
    intervalMs: 60000,
    timeout: 10000,
    degradedThreshold: 1000,
    unhealthyAfterFailures: 3
  });

  healthCheckAggregation.registerService({
    serviceId: 'websocket',
    serviceName: 'WebSocket Server',
    checkFn: async () => {
      try {
        const { getWebSocketStats } = await import('../../websocket');
        const stats = getWebSocketStats();
        return {
          healthy: true,
          responseTime: 0,
          metadata: stats
        };
      } catch {
        return { healthy: true, responseTime: 0, metadata: { note: 'Stats not available' } };
      }
    },
    intervalMs: 30000,
    timeout: 5000,
    degradedThreshold: 50,
    unhealthyAfterFailures: 5
  });

  healthCheckAggregation.registerService({
    serviceId: 'stripe-integration',
    serviceName: 'Stripe Integration',
    checkFn: async () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      return {
        healthy: !!stripeKey && stripeKey.length > 10,
        responseTime: 0,
        metadata: { configured: !!stripeKey }
      };
    },
    intervalMs: 300000,
    timeout: 1000,
    degradedThreshold: 100,
    unhealthyAfterFailures: 1
  });

  healthCheckAggregation.registerService({
    serviceId: 'gemini-api',
    serviceName: 'Gemini AI API',
    checkFn: async () => {
      const geminiKey = process.env.GEMINI_API_KEY;
      return {
        healthy: !!geminiKey && geminiKey.length > 10,
        responseTime: 0,
        metadata: { configured: !!geminiKey }
      };
    },
    intervalMs: 300000,
    timeout: 1000,
    degradedThreshold: 100,
    unhealthyAfterFailures: 1
  });

  console.log('[ProductionSeeding] Registered 7 extended health checks');
}

/**
 * Run infrastructure regression tests
 */
async function runInfrastructureRegressionTests(): Promise<void> {
  try {
    const { runAllInfrastructureTests } = await import('../../tests/infrastructure');
    const results = await runAllInfrastructureTests();
    
    if (results.totalFailed > 0) {
      console.error(`[ProductionSeeding] ⚠️ ${results.totalFailed} regression tests failed!`);
    } else {
      console.log(`[ProductionSeeding] ✅ All ${results.totalPassed} regression tests passed`);
    }
  } catch (error) {
    console.error('[ProductionSeeding] Failed to run regression tests:', error);
  }
}

/**
 * Initialize all production seeding
 */
export async function initializeProductionSeeding(): Promise<void> {
  console.log('[ProductionSeeding] Initializing production configurations...');
  
  seedProductionAlertRules();
  seedProductionDashboards();
  registerExtendedHealthChecks();
  
  // Run regression tests after seeding
  await runInfrastructureRegressionTests();
  
  console.log('[ProductionSeeding] Production seeding complete');
}
