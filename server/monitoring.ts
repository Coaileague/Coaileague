/**
 * Production Monitoring & Observability
 * Tracks errors, performance metrics, and system health
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import * as os from "os";

interface ErrorLog {
  timestamp: Date;
  level: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
  context?: Record<string, any>;
  userId?: string;
  workspaceId?: string;
  requestId?: string;
}

interface PerformanceMetric {
  timestamp: Date;
  endpoint: string;
  method: string;
  duration: number; // milliseconds
  statusCode: number;
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
    
    // Log metrics for debugging (only when values change significantly)
    if (this.cpuUsageSamples.length % 4 === 0) { // Log every 4th sample (every minute)
      console.log(`[MONITORING] CPU: ${this.systemMetrics.cpu}%, Memory: ${this.systemMetrics.memory}%, Samples: ${this.cpuUsageSamples.length}`);
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
    additionalData?: Record<string, any>;
  }): void {
    const errorLog: ErrorLog = {
      timestamp: new Date(),
      level: 'error',
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      context: context?.additionalData,
      userId: context?.userId,
      workspaceId: context?.workspaceId,
      requestId: context?.requestId,
    };

    this.errorBuffer.push(errorLog);
    
    // Also log to console for development
    console.error(`[ERROR] ${errorLog.message}`, {
      ...context,
      stack: errorLog.stack,
    });

    // Flush immediately for critical errors
    if (this.errorBuffer.length >= 10) {
      this.flush();
    }
  }

  /**
   * Log a performance metric
   */
  logMetric(metric: PerformanceMetric): void {
    this.metricsBuffer.push(metric);

    // Log slow requests to console
    if (metric.duration > 1000) {
      console.warn(`[SLOW] ${metric.method} ${metric.endpoint} took ${metric.duration}ms`);
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
    context?: { userId?: string; workspaceId?: string }
  ): void {
    this.logMetric({
      timestamp: new Date(),
      endpoint,
      method,
      duration,
      statusCode,
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

    // In production, send to external monitoring service (Datadog, Sentry, CloudWatch, etc.)
    // For now, just log statistics
    if (errors.length > 0) {
      console.log(`[MONITORING] Flushed ${errors.length} errors`);
    }

    if (metrics.length > 0) {
      const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const slowRequests = metrics.filter(m => m.duration > 1000).length;
      console.log(`[MONITORING] Flushed ${metrics.length} metrics (avg: ${avgDuration.toFixed(0)}ms, slow: ${slowRequests})`);
    }

    // External monitoring integration point (Datadog, Sentry, CloudWatch)
    // Extend MonitoringService.sendToExternalService() when external service is configured
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

    // Database health
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = true;
    } catch (error) {
      checks.database = false;
      this.logError(error as Error, { additionalData: { check: 'database' } });
    }

    // Determine overall status
    const allHealthy = Object.values(checks).every(v => v);
    const anyHealthy = Object.values(checks).some(v => v);

    return {
      status: allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'down',
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
  console.log('[MONITORING] Shutting down...');
  monitoringService.shutdown();
});

process.on('SIGINT', () => {
  console.log('[MONITORING] Shutting down...');
  monitoringService.shutdown();
});
