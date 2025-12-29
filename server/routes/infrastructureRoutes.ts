/**
 * INFRASTRUCTURE API ROUTES
 * ==========================
 * API endpoints for Q1/Q2 2026 infrastructure services.
 * Provides management interfaces for all infrastructure capabilities.
 */

import { Router, Request, Response } from 'express';
import { durableJobQueue } from '../services/infrastructure/durableJobQueue';
import { backupService } from '../services/infrastructure/backupService';
import { errorTrackingService } from '../services/infrastructure/errorTrackingService';
import { apiKeyRotationService } from '../services/infrastructure/apiKeyRotationService';
import { distributedTracing } from '../services/infrastructure/distributedTracing';
import { connectionPooling } from '../services/infrastructure/connectionPooling';
import { rateLimiting } from '../services/infrastructure/rateLimiting';
import { healthCheckAggregation } from '../services/infrastructure/healthCheckAggregation';
import { metricsDashboard } from '../services/infrastructure/metricsDashboard';
import { circuitBreaker } from '../services/infrastructure/circuitBreaker';
import { slaMonitoring } from '../services/infrastructure/slaMonitoring';
import { getInfrastructureHealth } from '../services/infrastructure/index';

const router = Router();

// ============================================================================
// HEALTH & STATUS
// ============================================================================

router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await getInfrastructureHealth();
    
    // Get circuit breaker and SLA data for the dashboard
    const circuitHealth = circuitBreaker.getHealth();
    const circuitStats = circuitBreaker.getAggregateStats();
    const slaCompliance = slaMonitoring.getComplianceSummary();
    
    // Format circuits for frontend
    const circuits = circuitHealth.circuits.map(c => ({
      name: c.name,
      displayName: c.displayName,
      state: c.state,
      failureCount: c.stats.failureCount,
      successCount: c.stats.successCount,
      lastFailure: c.stats.lastFailureTime,
      lastSuccess: c.stats.lastSuccessTime,
      errorRate: c.stats.totalCalls > 0 
        ? (c.stats.failureCount / c.stats.totalCalls) * 100 
        : 0,
    }));
    
    // Format SLA services for frontend
    const slaServices = slaCompliance.services.map(s => ({
      serviceId: s.serviceId,
      displayName: s.displayName,
      tier: s.tier,
      targetUptime: s.targetUptime,
      currentUptime: s.currentUptime,
      isMeetingSLA: s.isMeetingSLA,
      latencyP50: s.latency?.p50 || 0,
      latencyP95: s.latency?.p95 || 0,
      latencyP99: s.latency?.p99 || 0,
      breachCount: s.breachCount || 0,
    }));
    
    // Calculate aggregate stats
    const aggregateStats = {
      totalCircuits: circuits.length,
      closedCircuits: circuits.filter(c => c.state === 'CLOSED').length,
      openCircuits: circuits.filter(c => c.state === 'OPEN').length,
      halfOpenCircuits: circuits.filter(c => c.state === 'HALF_OPEN').length,
      overallHealth: circuitHealth.healthy ? 'healthy' : 'degraded',
      slaCompliance: slaCompliance.overallCompliance,
    };
    
    res.json({
      success: true,
      circuits,
      slaServices,
      aggregateStats,
      q1q2Health: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// JOB QUEUE (Q1)
// ============================================================================

router.get('/jobs/stats', async (req: Request, res: Response) => {
  try {
    const stats = await durableJobQueue.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const job = await durableJobQueue.getJobStatus(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/jobs/retry-dead-letter', async (req: Request, res: Response) => {
  try {
    const { jobType } = req.body;
    const count = await durableJobQueue.retryDeadLetterJobs(jobType);
    res.json({ success: true, data: { retriedCount: count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// BACKUPS (Q1)
// ============================================================================

router.get('/backups', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const backups = await backupService.getRecentBackups(limit);
    res.json({ success: true, data: backups });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/stats', async (req: Request, res: Response) => {
  try {
    const stats = await backupService.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/trigger', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const backup = await backupService.triggerManualBackup(userId);
    res.json({ success: true, data: backup });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/config', (req: Request, res: Response) => {
  try {
    const config = backupService.getConfig();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/backups/config', (req: Request, res: Response) => {
  try {
    const updatedConfig = backupService.updateConfig(req.body);
    res.json({ success: true, data: updatedConfig });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ERROR TRACKING (Q1)
// ============================================================================

router.get('/errors', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const errors = await errorTrackingService.getRecentErrors(limit);
    res.json({ success: true, data: errors });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/errors/stats', async (req: Request, res: Response) => {
  try {
    const windowMinutes = parseInt(req.query.window as string) || 60;
    const stats = await errorTrackingService.getStats(windowMinutes);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/errors/alerts', (req: Request, res: Response) => {
  try {
    const rules = errorTrackingService.getAlertRules();
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/errors/alerts', async (req: Request, res: Response) => {
  try {
    const rule = await errorTrackingService.addAlertRule(req.body);
    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// API KEY ROTATION (Q1)
// ============================================================================

router.get('/keys', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    const keys = await apiKeyRotationService.getKeys(workspaceId);
    res.json({ success: true, data: keys });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys', async (req: Request, res: Response) => {
  try {
    const { name, keyType, workspaceId, expiresInDays, metadata } = req.body;
    const result = await apiKeyRotationService.generateKey({
      name,
      keyType,
      workspaceId,
      expiresInDays,
      metadata,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys/:keyId/rotate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { reason } = req.body;
    const result = await apiKeyRotationService.rotateKey(req.params.keyId, userId, reason);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys/:keyId/revoke', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { reason } = req.body;
    const success = await apiKeyRotationService.revokeKey(req.params.keyId, userId, reason);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys/validate', async (req: Request, res: Response) => {
  try {
    const { keyValue } = req.body;
    const key = await apiKeyRotationService.validateKey(keyValue);
    res.json({ success: true, data: { valid: !!key, key: key ? { id: key.id, name: key.name, status: key.status } : null } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DISTRIBUTED TRACING (Q2)
// ============================================================================

router.get('/tracing/stats', (req: Request, res: Response) => {
  try {
    const stats = distributedTracing.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/tracing/traces', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const traces = distributedTracing.getRecentTraces(limit);
    res.json({ success: true, data: traces.map(t => ({
      traceId: t.traceId,
      startTime: t.startTime,
      spanCount: t.spans.size,
      rootSpan: t.spans.get(t.rootSpanId),
    })) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/tracing/traces/:traceId', (req: Request, res: Response) => {
  try {
    const spans = distributedTracing.getTraceSpans(req.params.traceId);
    if (spans.length === 0) {
      return res.status(404).json({ success: false, error: 'Trace not found' });
    }
    res.json({ success: true, data: { traceId: req.params.traceId, spans } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/tracing/sample-rate', (req: Request, res: Response) => {
  try {
    const { rate } = req.body;
    distributedTracing.setSampleRate(rate);
    res.json({ success: true, data: { sampleRate: rate } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// CONNECTION POOLING (Q2)
// ============================================================================

router.get('/pool/stats', (req: Request, res: Response) => {
  try {
    const stats = connectionPooling.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/pool/config', (req: Request, res: Response) => {
  try {
    const config = connectionPooling.getConfig();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/pool/config', (req: Request, res: Response) => {
  try {
    connectionPooling.updateConfig(req.body);
    const config = connectionPooling.getConfig();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/pool/health-check', async (req: Request, res: Response) => {
  try {
    const result = await connectionPooling.forceHealthCheck();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// RATE LIMITING (Q2)
// ============================================================================

router.get('/rate-limit/stats', (req: Request, res: Response) => {
  try {
    const stats = rateLimiting.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/rate-limit/plans', (req: Request, res: Response) => {
  try {
    const plans = rateLimiting.getPlanLimits();
    res.json({ success: true, data: plans });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/rate-limit/tenant/:tenantId', (req: Request, res: Response) => {
  try {
    const status = rateLimiting.getQuotaStatus(req.params.tenantId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/rate-limit/tenant/:tenantId/unblock', (req: Request, res: Response) => {
  try {
    const success = rateLimiting.unblockTenant(req.params.tenantId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/rate-limit/tenant/:tenantId/custom', (req: Request, res: Response) => {
  try {
    rateLimiting.setCustomLimit(req.params.tenantId, req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK AGGREGATION (Q2)
// ============================================================================

router.get('/health-check/aggregate', (req: Request, res: Response) => {
  try {
    const aggregate = healthCheckAggregation.getAggregateHealth();
    res.json({ success: true, data: aggregate });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health-check/services', (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    if (status) {
      const services = healthCheckAggregation.getServicesByStatus(status as any);
      res.json({ success: true, data: services });
    } else {
      const aggregate = healthCheckAggregation.getAggregateHealth();
      res.json({ success: true, data: aggregate.services });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health-check/services/:serviceId', (req: Request, res: Response) => {
  try {
    const health = healthCheckAggregation.getServiceHealth(req.params.serviceId);
    if (!health) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    res.json({ success: true, data: health });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health-check/history', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 60;
    const history = healthCheckAggregation.getHistory(limit);
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/health-check/refresh', async (req: Request, res: Response) => {
  try {
    const aggregate = await healthCheckAggregation.checkAllServices();
    res.json({ success: true, data: aggregate });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// METRICS DASHBOARD (Q2)
// ============================================================================

router.get('/metrics/overview', (req: Request, res: Response) => {
  try {
    const overview = metricsDashboard.getSystemOverview();
    res.json({ success: true, data: overview });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics/names', (req: Request, res: Response) => {
  try {
    const names = metricsDashboard.getMetricNames();
    res.json({ success: true, data: names });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics/series/:name', (req: Request, res: Response) => {
  try {
    const timeRange = parseInt(req.query.timeRange as string) || undefined;
    const series = metricsDashboard.getSeries(req.params.name, timeRange);
    if (!series) {
      return res.status(404).json({ success: false, error: 'Metric not found' });
    }
    res.json({ success: true, data: series });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/metrics/record', (req: Request, res: Response) => {
  try {
    const { name, value, labels } = req.body;
    metricsDashboard.record(name, value, labels);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics/alerts', (req: Request, res: Response) => {
  try {
    const rules = metricsDashboard.getAlertRules();
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics/alerts/triggered', (req: Request, res: Response) => {
  try {
    const triggered = metricsDashboard.getTriggeredAlerts();
    res.json({ success: true, data: triggered });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/metrics/alerts', (req: Request, res: Response) => {
  try {
    const rule = metricsDashboard.addAlertRule(req.body);
    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/metrics/alerts/:ruleId', (req: Request, res: Response) => {
  try {
    const success = metricsDashboard.removeAlertRule(req.params.ruleId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics/dashboards', (req: Request, res: Response) => {
  try {
    const dashboards = metricsDashboard.getDashboards();
    res.json({ success: true, data: dashboards });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics/dashboards/:dashboardId', (req: Request, res: Response) => {
  try {
    const dashboard = metricsDashboard.getDashboard(req.params.dashboardId);
    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metrics/dashboards/:dashboardId/data', (req: Request, res: Response) => {
  try {
    const data = metricsDashboard.getDashboardData(req.params.dashboardId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/metrics/dashboards', (req: Request, res: Response) => {
  try {
    const dashboard = metricsDashboard.createDashboard(req.body);
    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/metrics/export', async (req: Request, res: Response) => {
  try {
    await metricsDashboard.exportMetricsToAudit();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
