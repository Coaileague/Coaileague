import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requirePlatformStaff, type AuthenticatedRequest } from "../rbac";
import { readLimiter } from "../middleware/rateLimiter";
import { performanceMetrics } from "../services/performanceMetrics";
import { processingMetricsService } from "../services/processingMetricsService";
import { cacheManager } from "../services/platform/cacheManager";
import { createLogger } from '../lib/logger';
const log = createLogger('MetricsRoutes');


const router = Router();

router.get("/performance", requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const metrics = performanceMetrics.getMetrics();
    res.json({
      timestamp: new Date().toISOString(),
      metrics,
      health: {
        isHealthy: metrics.averageResponseTime < 500 && metrics.automationSuccessRate > 95,
        alertLevel: metrics.averageResponseTime > 1000 ? 'critical' : metrics.averageResponseTime > 500 ? 'warning' : 'normal'
      }
    });
  } catch (error: unknown) {
    log.error('Error fetching metrics:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch metrics' });
  }
});

router.get("/dashboard", requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const metrics = performanceMetrics.getMetrics();
    
    res.json({
      summary: {
        avgResponseTime: `${metrics.averageResponseTime}ms`,
        p95ResponseTime: `${metrics.p95ResponseTime}ms`,
        p99ResponseTime: `${metrics.p99ResponseTime}ms`,
        automationSuccess: `${metrics.automationSuccessRate}%`,
        recentFailures: metrics.automationFailureCount
      },
      status: metrics.averageResponseTime < 500 ? 'healthy' : 'degraded',
      lastUpdated: new Date().toISOString()
    });
  } catch (error: unknown) {
    log.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

router.get("/processing/:automationType/average-duration", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationType } = req.params;

    const avgDuration = processingMetricsService.getAverageProcessingDuration(automationType);
    const successRate = processingMetricsService.getSuccessRate(automationType);

    res.json({ 
      success: true, 
      data: {
        automationType,
        averageDurationMs: avgDuration,
        successRate,
      }
    });
  } catch (error: unknown) {
    log.error('Error fetching processing metrics:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/processing/recent", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const { hours } = req.query;

    const metrics = processingMetricsService.getRecentMetrics(hours ? parseInt(hours as string) : 24);

    res.json({ 
      success: true, 
      data: metrics,
      count: metrics.length,
    });
  } catch (error: unknown) {
    log.error('Error fetching recent metrics:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/payroll/duration", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const avgPayrollDuration = processingMetricsService.getPayrollMetrics();

    res.json({ 
      success: true, 
      data: {
        automationType: 'payroll',
        averageDurationMs: avgPayrollDuration,
        successRate: processingMetricsService.getSuccessRate('payroll'),
      }
    });
  } catch (error: unknown) {
    log.error('Error fetching payroll metrics:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Phase 39 — Cache performance metrics endpoint
router.get("/cache", requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const metrics = cacheManager.getMetrics();
    res.json({
      timestamp: new Date().toISOString(),
      cache: {
        ...metrics,
        status: parseFloat(metrics.hitRate) >= 70 ? 'healthy' : parseFloat(metrics.hitRate) >= 40 ? 'warming' : 'cold',
      }
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch cache metrics' });
  }
});

export default router;
