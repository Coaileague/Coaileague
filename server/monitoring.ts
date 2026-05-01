/**
 * Production Monitoring & Observability
 * Tracks errors, performance metrics, and system health
 */

import { createLogger } from './lib/logger';
const log = createLogger('monitoring');
import { db } from "./db";
import { sql } from "drizzle-orm";
import * as os from "os";
import { typedQuery } from './lib/typedSql';
import { PLATFORM } from './config/platformConfig';
import { captureError as captureToExternalTracker } from './lib/errorTracker';

interface ErrorLog {
  timestamp: Date;
  level: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  userId?: string;
  workspaceId?: string;
  requestId?: string;
}

interface PerformanceMetric {
  timestamp: Date;
  requestId?: string;
  endpoint: string;
  method: string;
  duration: number; // milliseconds
  statusCode: number;
  actorId?: string;
  userId?: string;
  workspaceId?: string;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  timestamp: Date;
}

class MonitoringService {
  private errorBuffer: ErrorLog[] = [];
  private metricsBuffer: PerformanceMetric[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private systemMetrics: SystemMetrics = {
    cpu: 0,
    memory: 0,
    timestamp: new Date()
  };
  private platformStartedAt: Date = new Date();
  private cpuUsageSamples: number[] = [];
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuTime: number = Date.now();

  constructor() {
    // Flush buffers every 10 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 10000);
    
    // Sample system metrics every 15 seconds
    this.metricsInterval = setInterval(() => {
      this.sampleSystemMetrics();
    }, 15000);
    
    // Initial sample
    this.sampleSystemMetrics();
  }
  
  /**
   * Sample CPU and memory usage for rolling average
   * Uses delta-based CPU calculation for accurate real-time readings
   */
  private sampleSystemMetrics(): void {
    // Memory is straightforward - current usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryPercent = Math.round((usedMem / totalMem) * 1000) / 10;
    
    // CPU: Calculate delta between current and last sample for real-time usage
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();
    
    let cpuPercent = 0;
    if (this.lastCpuUsage) {
      // Calculate CPU time used since last sample (in microseconds)
      const cpuDelta = {
        user: currentCpuUsage.user - this.lastCpuUsage.user,
        system: currentCpuUsage.system - this.lastCpuUsage.system,
      };
      
      // Time elapsed since last sample (in milliseconds, convert to microseconds)
      const timeDelta = (currentTime - this.lastCpuTime) * 1000;
      
      // Guard against invalid time delta
      if (timeDelta > 0) {
        // Total CPU time used (user + system)
        const totalCpuDelta = cpuDelta.user + cpuDelta.system;
        
        // Calculate percentage: (CPU time used / elapsed time) * 100
        // Divide by core count to normalize to 0-100% range
        const numCpus = os.cpus().length;
        cpuPercent = (totalCpuDelta / timeDelta) * 100 / numCpus;
        
        // Clamp negative values to 0 (shouldn't happen but guard against anomalies)
        cpuPercent = Math.max(0, cpuPercent);
        
        // Round to 1 decimal place
        cpuPercent = Math.round(cpuPercent * 10) / 10;
      }
    }
    
    // Add to rolling samples (keep last 20 samples = 5 minutes of data)
    // Include zero values so the average can decay during idle periods
    // Only add after the first sample (when we have a valid delta calculation)
    if (this.lastCpuUsage !== null) {
      this.cpuUsageSamples.push(cpuPercent);
      if (this.cpuUsageSamples.length > 20) {
        this.cpuUsageSamples.shift();
      }
    }
    
    // Store current values for next delta calculation
    this.lastCpuUsage = currentCpuUsage;
    this.lastCpuTime = currentTime;
    
    // Calculate rolling average (or use current reading if no samples yet)
    const avgCpu = this.cpuUsageSamples.length > 0
      ? this.cpuUsageSamples.reduce((sum, val) => sum + val, 0) / this.cpuUsageSamples.length
      : 0;
    
    this.systemMetrics = {
      cpu: Math.round(avgCpu * 10) / 10,
      memory: memoryPercent,
      timestamp: new Date()
    };
    
    // CPU/memory logging only when concerning thresholds reached
    if (this.systemMetrics.cpu > 80 || this.systemMetrics.memory > 90) {
      log.warn(`[MONITORING] HIGH USAGE - CPU: ${this.systemMetrics.cpu}%, Memory: ${this.systemMetrics.memory}%`);
    }
  }
  
  /**
   * Get current system metrics (cached, updated every 15s)
   */
  getSystemMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }
  
  /**
   * Get platform uptime in seconds (since monitoring service started)
   */
  getPlatformUptime(): number {
    return Math.floor((Date.now() - this.platformStartedAt.getTime()) / 1000);
  }

  /**
   * Log an error for monitoring
   */
  logError(error: Error | string, context?: {
    userId?: string;
    workspaceId?: string;
    requestId?: string;
    severity?: 'info' | 'warn' | 'error' | 'high' | 'critical';
    additionalData?: Record<string, unknown>;
  }): void {
    const errorLog: ErrorLog = {
      timestamp: new Date(),
      level: (context?.severity === 'critical' || context?.severity === 'high') ? 'error' : (context?.severity === 'info' ? 'info' : (context?.severity === 'warn' ? 'warn' : 'error')),
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      context: { ...context?.additionalData, severity: context?.severity },
      userId: context?.userId,
      workspaceId: context?.workspaceId,
      requestId: context?.requestId,
    };

    this.errorBuffer.push(errorLog);

    // Also log to console for development
    log.error(`[ERROR] [${context?.severity || 'error'}] ${errorLog.message}`, {
      ...context,
      stack: errorLog.stack,
    });

    // Readiness Section 5 — forward to external observability backend if
    // configured (Sentry, Datadog, webhook). No-op when unconfigured.
    // Non-blocking; failures never affect the request path.
    try {
      const sev = context?.severity;
      const trackerLevel: 'info' | 'warn' | 'error' | 'critical' =
        sev === 'critical' ? 'critical'
        : sev === 'high' ? 'error'
        : sev === 'warn' ? 'warn'
        : sev === 'info' ? 'info'
        : 'error';
      captureToExternalTracker({
        timestamp: errorLog.timestamp,
        level: trackerLevel,
        message: errorLog.message,
        stack: errorLog.stack,
        tags: {
          workspaceId: errorLog.workspaceId,
          userId: errorLog.userId,
          requestId: errorLog.requestId,
        },
        context: errorLog.context,
      });
    } catch { /* never throw from logError */ }

    // Flush immediately for critical errors
    if (this.errorBuffer.length >= 10 || context?.severity === 'critical' || context?.severity === 'high') {
      this.flush();
    }
  }

  /**
   * Log a performance metric
   */
  logMetric(metric: PerformanceMetric): void {
    this.metricsBuffer.push(metric);

    // Alert on error rate > 2% (sliding window of last 100 requests)
    if (this.metricsBuffer.length >= 100) {
      const recent = this.metricsBuffer.slice(-100);
      const errors = recent.filter(m => m.statusCode >= 500).length;
      if (errors > 2) {
        log.error(`[MONITORING] CRITICAL ALERT: Error rate exceeded 2% (${errors} errors in last 100 requests)`);
      }
    }

    // Log slow API requests only (skip Vite dev asset requests)
    if (metric.duration > 2000 && metric.endpoint.startsWith('/api/')) {
      log.error(`[MONITORING] CRITICAL ALERT: Webhook/API latency > 2s on ${metric.endpoint} (${metric.duration}ms)`);
    }

    // Flush if buffer is large
    if (this.metricsBuffer.length >= 50) {
      this.flush();
    }
  }

  /**
   * Track request performance
   */
  trackRequest(
    endpoint: string,
    method: string,
    duration: number,
    statusCode: number,
    context?: { userId?: string; workspaceId?: string; requestId?: string; actorId?: string }
  ): void {
    this.logMetric({
      timestamp: new Date(),
      endpoint,
      method,
      duration,
      statusCode,
      requestId: context?.requestId,
      actorId: context?.actorId,
      userId: context?.userId,
      workspaceId: context?.workspaceId,
    });
  }

  /**
   * Flush buffers to storage (currently console, can be extended to database/external service)
   */
  private async flush(): Promise<void> {
    if (this.errorBuffer.length === 0 && this.metricsBuffer.length === 0) {
      return;
    }

    const errors = [...this.errorBuffer];
    const metrics = [...this.metricsBuffer];
    
    this.errorBuffer = [];
    this.metricsBuffer = [];

    if (errors.length > 0) {
      log.info(`[MONITORING] Flushed ${errors.length} errors`);
    }

    if (metrics.length > 0) {
      const slowRequests = metrics.filter(m => m.duration > 1000).length;
      if (slowRequests > 0) {
        const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
        log.info(`[MONITORING] ${metrics.length} metrics (avg: ${avgDuration.toFixed(0)}ms, slow: ${slowRequests})`);
      }
    }

    await this.sendToExternalService(errors, metrics);
  }

  /**
   * Send errors and slow-request summaries to an external webhook when MONITORING_WEBHOOK_URL is set.
   * Supports Slack-compatible JSON payloads, PagerDuty, or any generic webhook.
   * Set MONITORING_WEBHOOK_URL in the environment to activate — no-op when not configured.
   */
  private async sendToExternalService(errors: any[], metrics: any[]): Promise<void> {
    const webhookUrl = process.env.MONITORING_WEBHOOK_URL;
    if (!webhookUrl || (errors.length === 0 && metrics.filter(m => m.duration > 3000).length === 0)) {
      return;
    }

    try {
      const criticalErrors = errors.filter(e => e.severity === 'critical' || e.severity === 'high');
      const verySlowRequests = metrics.filter(m => m.duration > 3000);

      if (criticalErrors.length === 0 && verySlowRequests.length === 0) return;

      const lines: string[] = [`*${PLATFORM.name} Production Alert* — ${new Date().toISOString()}`];

      if (criticalErrors.length > 0) {
        lines.push(`*${criticalErrors.length} critical error(s):*`);
        criticalErrors.slice(0, 5).forEach(e => {
          lines.push(`• \`${e.message}\` (${e.context?.route || 'unknown route'})`);
        });
      }

      if (verySlowRequests.length > 0) {
        const worst = verySlowRequests.sort((a, b) => b.duration - a.duration)[0];
        lines.push(`*${verySlowRequests.length} very slow request(s) — worst: ${worst.duration}ms on ${worst.endpoint || 'unknown'}*`);
      }

      const payload = { text: lines.join('\n') };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      log.warn('[MONITORING] Failed to send to external webhook:', (err as Error).message);
    }
  }

  /**
   * Get health check status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'down';
    checks: Record<string, boolean>;
    timestamp: Date;
  }> {
    const checks: Record<string, boolean> = {};

    // 1. Database health
    try {
      // Converted to Drizzle ORM: health check ping
      await db.execute(sql`SELECT 1`);
      checks.database = true;
    } catch (error) {
      checks.database = false;
      this.logError(error as Error, { additionalData: { check: 'database' } });
    }

    // 2. AI Service health (Gemini)
    try {
      const { geminiClient } = await import('./services/ai-brain/providers/geminiClient');
      // Simple check if client is initialized and has API key
      checks.ai = !!(geminiClient && process.env.GEMINI_API_KEY);
    } catch (error) {
      checks.ai = false;
      this.logError(error as Error, { additionalData: { check: 'ai' } });
    }

    // 3. WebSocket health
    try {
      const { getLiveConnectionStats } = await import('./websocket');
      // If we can call this, the module is loaded and tracker is initialized
      const stats = getLiveConnectionStats();
      checks.websocket = typeof stats.totalConnections === 'number';
    } catch (error) {
      checks.websocket = false;
      this.logError(error as Error, { additionalData: { check: 'websocket' } });
    }

    // 4. Queue Workers health
    try {
      const { durableJobQueue } = await import('./services/infrastructure/durableJobQueue');
      const stats = await durableJobQueue.getStats();
      checks.queue_workers = true;
    } catch (error) {
      checks.queue_workers = false;
      this.logError(error as Error, { additionalData: { check: 'queue_workers' } });
    }

    // 5. NDS health
    try {
      const { NotificationDeliveryService } = await import('./services/notificationDeliveryService');
      checks.nds = !!NotificationDeliveryService;
    } catch (error) {
      checks.nds = false;
      this.logError(error as Error, { additionalData: { check: 'nds' } });
    }

    // Determine overall status
    const criticalServices = ['database'];
    const criticalHealthy = criticalServices.every(s => checks[s]);
    const allHealthy = Object.values(checks).every(v => v);

    let status: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (!criticalHealthy) {
      status = 'down';
    } else if (!allHealthy) {
      status = 'degraded';
    }

    return {
      status,
      checks,
      timestamp: new Date(),
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    this.flush(); // Final flush
  }
}

// Global singleton instance
export const monitoringService = new MonitoringService();

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('[MONITORING] Shutting down...');
  monitoringService.shutdown();
});

process.on('SIGINT', () => {
  log.info('[MONITORING] Shutting down...');
  monitoringService.shutdown();
});
