/**
 * SLA MONITORING SERVICE
 * =======================
 * Enterprise-grade SLA tracking and compliance reporting.
 * Monitors uptime, latency percentiles, and generates compliance reports.
 * 
 * Features:
 * - Uptime calculation (99.9%, 99.99% targets)
 * - Latency percentile tracking (p50, p95, p99)
 * - Availability windows and maintenance tracking
 * - SOX-compliant audit logging
 * - Automated compliance report generation
 * - Breach alerting and escalation
 */

import { randomUUID } from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('slaMonitoring');


// ============================================================================
// TYPES
// ============================================================================

export type SLALevel = 'platinum' | 'gold' | 'silver' | 'bronze';

export interface SLATarget {
  availabilityPercent: number;      // e.g., 99.9
  responseTimeP50: number;          // ms
  responseTimeP95: number;          // ms
  responseTimeP99: number;          // ms
  errorRateThreshold: number;       // 0-1
  maxDowntimeMinutesMonthly: number;
}

export interface SLAConfig {
  serviceId: string;
  serviceName: string;
  level: SLALevel;
  targets: SLATarget;
  measurementWindowMs: number;      // Rolling window for calculations
  reportingIntervalMs: number;      // How often to generate reports
}

export interface HealthDataPoint {
  timestamp: number;
  isHealthy: boolean;
  responseTime: number;
  errorOccurred: boolean;
  metadata?: Record<string, any>;
}

export interface SLAMetrics {
  serviceId: string;
  serviceName: string;
  level: SLALevel;
  windowStart: number;
  windowEnd: number;
  
  // Availability
  uptimePercent: number;
  downtimeMinutes: number;
  totalChecks: number;
  healthyChecks: number;
  
  // Latency
  responseTimeP50: number;
  responseTimeP95: number;
  responseTimeP99: number;
  avgResponseTime: number;
  
  // Errors
  errorRate: number;
  totalErrors: number;
  
  // Compliance
  availabilityMet: boolean;
  latencyMet: boolean;
  errorRateMet: boolean;
  overallCompliant: boolean;
  
  // Trends
  previousPeriodUptimePercent?: number;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface SLABreach {
  id: string;
  serviceId: string;
  serviceName: string;
  breachType: 'availability' | 'latency' | 'error_rate';
  targetValue: number;
  actualValue: number;
  startedAt: number;
  resolvedAt?: number;
  duration?: number;
  severity: 'warning' | 'critical';
  acknowledged: boolean;
  acknowledgedBy?: string;
}

export interface MaintenanceWindow {
  id: string;
  serviceId: string;
  startTime: number;
  endTime: number;
  reason: string;
  excludeFromSLA: boolean;
  createdBy?: string;
}

// ============================================================================
// SLA TARGET PRESETS
// ============================================================================

const SLA_PRESETS: Record<SLALevel, SLATarget> = {
  platinum: {
    availabilityPercent: 99.99,
    responseTimeP50: 100,
    responseTimeP95: 500,
    responseTimeP99: 1000,
    errorRateThreshold: 0.001,
    maxDowntimeMinutesMonthly: 4.32  // ~4.32 min/month
  },
  gold: {
    availabilityPercent: 99.9,
    responseTimeP50: 200,
    responseTimeP95: 1000,
    responseTimeP99: 2000,
    errorRateThreshold: 0.01,
    maxDowntimeMinutesMonthly: 43.2  // ~43 min/month
  },
  silver: {
    availabilityPercent: 99.5,
    responseTimeP50: 500,
    responseTimeP95: 2000,
    responseTimeP99: 5000,
    errorRateThreshold: 0.05,
    maxDowntimeMinutesMonthly: 216   // ~3.6 hours/month
  },
  bronze: {
    availabilityPercent: 99.0,
    responseTimeP50: 1000,
    responseTimeP95: 5000,
    responseTimeP99: 10000,
    errorRateThreshold: 0.1,
    maxDowntimeMinutesMonthly: 432   // ~7.2 hours/month
  }
};

// ============================================================================
// SLA MONITORING SERVICE
// ============================================================================

class SLAMonitoringService {
  private static instance: SLAMonitoringService;
  private services: Map<string, SLAConfig> = new Map();
  private dataPoints: Map<string, HealthDataPoint[]> = new Map();
  private breaches: Map<string, SLABreach[]> = new Map();
  private maintenanceWindows: Map<string, MaintenanceWindow[]> = new Map();
  private reportInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): SLAMonitoringService {
    if (!SLAMonitoringService.instance) {
      SLAMonitoringService.instance = new SLAMonitoringService();
    }
    return SLAMonitoringService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Start periodic reporting
    this.startPeriodicReporting();
    
    // Start data cleanup
    this.startDataCleanup();
    
    this.isInitialized = true;
    log.info('[SLAMonitoring] Service initialized');
  }

  /**
   * Register a service for SLA monitoring
   */
  registerService(
    serviceId: string,
    serviceName: string,
    level: SLALevel = 'gold',
    customTargets?: Partial<SLATarget>
  ): SLAConfig {
    const targets: SLATarget = {
      ...SLA_PRESETS[level],
      ...customTargets
    };

    const config: SLAConfig = {
      serviceId,
      serviceName,
      level,
      targets,
      measurementWindowMs: 24 * 60 * 60 * 1000,  // 24 hours rolling
      reportingIntervalMs: 60 * 60 * 1000         // Hourly reports
    };

    this.services.set(serviceId, config);
    this.dataPoints.set(serviceId, []);
    this.breaches.set(serviceId, []);
    this.maintenanceWindows.set(serviceId, []);

    log.info(`[SLAMonitoring] Registered service: ${serviceName} (${level})`);
    return config;
  }

  /**
   * Record a health data point
   */
  recordDataPoint(
    serviceId: string,
    isHealthy: boolean,
    responseTime: number,
    errorOccurred: boolean = false,
    metadata?: Record<string, any>
  ): void {
    const points = this.dataPoints.get(serviceId);
    if (!points) return;

    const dataPoint: HealthDataPoint = {
      timestamp: Date.now(),
      isHealthy,
      responseTime,
      errorOccurred,
      metadata
    };

    points.push(dataPoint);

    // Check for breaches after recording
    this.checkForBreaches(serviceId);
  }

  /**
   * Check for SLA breaches
   */
  private async checkForBreaches(serviceId: string): Promise<void> {
    const config = this.services.get(serviceId);
    if (!config) return;

    const metrics = this.calculateMetrics(serviceId);
    if (!metrics) return;

    const currentBreaches = this.breaches.get(serviceId) || [];
    const activeBreaches = currentBreaches.filter(b => !b.resolvedAt);

    // Check availability breach
    if (!metrics.availabilityMet) {
      const existingBreach = activeBreaches.find(b => b.breachType === 'availability');
      if (!existingBreach) {
        await this.createBreach(
          serviceId,
          config.serviceName,
          'availability',
          config.targets.availabilityPercent,
          metrics.uptimePercent,
          metrics.uptimePercent < 95 ? 'critical' : 'warning'
        );
      }
    } else {
      // Resolve any active availability breach
      const existingBreach = activeBreaches.find(b => b.breachType === 'availability');
      if (existingBreach) {
        await this.resolveBreach(serviceId, existingBreach.id);
      }
    }

    // Check latency breach (p95)
    if (!metrics.latencyMet) {
      const existingBreach = activeBreaches.find(b => b.breachType === 'latency');
      if (!existingBreach) {
        await this.createBreach(
          serviceId,
          config.serviceName,
          'latency',
          config.targets.responseTimeP95,
          metrics.responseTimeP95,
          metrics.responseTimeP95 > config.targets.responseTimeP99 ? 'critical' : 'warning'
        );
      }
    } else {
      const existingBreach = activeBreaches.find(b => b.breachType === 'latency');
      if (existingBreach) {
        await this.resolveBreach(serviceId, existingBreach.id);
      }
    }

    // Check error rate breach
    if (!metrics.errorRateMet) {
      const existingBreach = activeBreaches.find(b => b.breachType === 'error_rate');
      if (!existingBreach) {
        await this.createBreach(
          serviceId,
          config.serviceName,
          'error_rate',
          config.targets.errorRateThreshold,
          metrics.errorRate,
          metrics.errorRate > 0.1 ? 'critical' : 'warning'
        );
      }
    } else {
      const existingBreach = activeBreaches.find(b => b.breachType === 'error_rate');
      if (existingBreach) {
        await this.resolveBreach(serviceId, existingBreach.id);
      }
    }
  }

  /**
   * Create a new breach record
   */
  private async createBreach(
    serviceId: string,
    serviceName: string,
    breachType: 'availability' | 'latency' | 'error_rate',
    targetValue: number,
    actualValue: number,
    severity: 'warning' | 'critical'
  ): Promise<void> {
    const breach: SLABreach = {
      id: randomUUID(),
      serviceId,
      serviceName,
      breachType,
      targetValue,
      actualValue,
      startedAt: Date.now(),
      severity,
      acknowledged: false
    };

    const breaches = this.breaches.get(serviceId) || [];
    breaches.push(breach);
    this.breaches.set(serviceId, breaches);

    // Log to audit
    try {
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'sla_breach_started',
        entityType: 'sla_monitoring',
        entityId: breach.id,
        metadata: {
          serviceId,
          serviceName,
          breachType,
          targetValue,
          actualValue,
          severity
        },
        createdAt: new Date()
      });

      // Fix: was .emit() — SLA breaches were never reaching subscribers or user notifications.
      // Now published so ops managers receive real-time breach alerts via the notification pipeline.
      platformEventBus.publish({
        type: 'sla_breach',
        category: 'error',
        title: `SLA Breach — ${serviceName}`,
        description: `${serviceName} missed SLA target: ${breachType} (target: ${targetValue}, actual: ${Number(actualValue).toFixed(2)})`,
        metadata: {
          serviceId,
          serviceName,
          breachType,
          targetValue,
          actualValue,
          severity: severity as any,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          audience: 'manager',
        },
      }).catch((err: any) => log.warn('[SLAMonitoring] Failed to publish sla_breach:', err.message));

      log.info(
        `[SLAMonitoring] BREACH: ${serviceName} - ${breachType} ` +
        `(target: ${targetValue}, actual: ${actualValue.toFixed(2)})`
      );
    } catch (error) {
      log.error('[SLAMonitoring] Failed to log breach:', error);
    }
  }

  /**
   * Resolve a breach
   */
  private async resolveBreach(serviceId: string, breachId: string): Promise<void> {
    const breaches = this.breaches.get(serviceId);
    if (!breaches) return;

    const breach = breaches.find(b => b.id === breachId);
    if (!breach || breach.resolvedAt) return;

    breach.resolvedAt = Date.now();
    breach.duration = breach.resolvedAt - breach.startedAt;

    try {
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'sla_breach_resolved',
        entityType: 'sla_monitoring',
        entityId: breachId,
        metadata: {
          serviceId,
          serviceName: breach.serviceName,
          breachType: breach.breachType,
          durationMs: breach.duration
        },
        createdAt: new Date()
      });

      log.info(
        `[SLAMonitoring] Breach resolved: ${breach.serviceName} - ${breach.breachType} ` +
        `(duration: ${Math.round(breach.duration / 1000)}s)`
      );
    } catch (error) {
      log.error('[SLAMonitoring] Failed to log breach resolution:', error);
    }
  }

  /**
   * Calculate SLA metrics for a service
   */
  calculateMetrics(serviceId: string): SLAMetrics | null {
    const config = this.services.get(serviceId);
    const points = this.dataPoints.get(serviceId);
    
    if (!config || !points || points.length === 0) return null;

    const now = Date.now();
    const windowStart = now - config.measurementWindowMs;
    
    // Filter points within measurement window, excluding maintenance
    const maintenanceWindows = this.maintenanceWindows.get(serviceId) || [];
    const relevantPoints = points.filter(p => {
      if (p.timestamp < windowStart) return false;
      
      // Check if point is within maintenance window
      for (const mw of maintenanceWindows) {
        if (mw.excludeFromSLA && 
            p.timestamp >= mw.startTime && 
            p.timestamp <= mw.endTime) {
          return false;
        }
      }
      return true;
    });

    if (relevantPoints.length === 0) return null;

    // Calculate availability
    const healthyChecks = relevantPoints.filter(p => p.isHealthy).length;
    const uptimePercent = (healthyChecks / relevantPoints.length) * 100;
    const windowHours = (now - windowStart) / (1000 * 60 * 60);
    const downtimeMinutes = (windowHours * 60) * (1 - uptimePercent / 100);

    // Calculate response times
    const responseTimes = relevantPoints
      .filter(p => p.isHealthy)
      .map(p => p.responseTime)
      .sort((a, b) => a - b);

    const p50 = this.percentile(responseTimes, 50);
    const p95 = this.percentile(responseTimes, 95);
    const p99 = this.percentile(responseTimes, 99);
    const avg = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Calculate error rate
    const totalErrors = relevantPoints.filter(p => p.errorOccurred).length;
    const errorRate = totalErrors / relevantPoints.length;

    // Check compliance
    const availabilityMet = uptimePercent >= config.targets.availabilityPercent;
    const latencyMet = p95 <= config.targets.responseTimeP95;
    const errorRateMet = errorRate <= config.targets.errorRateThreshold;
    const overallCompliant = availabilityMet && latencyMet && errorRateMet;

    // Calculate trend (simplified)
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (relevantPoints.length > 100) {
      const recentPoints = relevantPoints.slice(-50);
      const olderPoints = relevantPoints.slice(-100, -50);
      
      const recentUptime = recentPoints.filter(p => p.isHealthy).length / recentPoints.length;
      const olderUptime = olderPoints.filter(p => p.isHealthy).length / olderPoints.length;
      
      if (recentUptime > olderUptime + 0.01) trend = 'improving';
      else if (recentUptime < olderUptime - 0.01) trend = 'degrading';
    }

    return {
      serviceId,
      serviceName: config.serviceName,
      level: config.level,
      windowStart,
      windowEnd: now,
      uptimePercent,
      downtimeMinutes,
      totalChecks: relevantPoints.length,
      healthyChecks,
      responseTimeP50: p50,
      responseTimeP95: p95,
      responseTimeP99: p99,
      avgResponseTime: avg,
      errorRate,
      totalErrors,
      availabilityMet,
      latencyMet,
      errorRateMet,
      overallCompliant,
      trend
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Schedule a maintenance window
   */
  scheduleMaintenance(
    serviceId: string,
    startTime: number,
    endTime: number,
    reason: string,
    excludeFromSLA: boolean = true,
    createdBy?: string
  ): MaintenanceWindow | null {
    if (!this.services.has(serviceId)) return null;

    const window: MaintenanceWindow = {
      id: randomUUID(),
      serviceId,
      startTime,
      endTime,
      reason,
      excludeFromSLA,
      createdBy
    };

    const windows = this.maintenanceWindows.get(serviceId) || [];
    windows.push(window);
    this.maintenanceWindows.set(serviceId, windows);

    log.info(
      `[SLAMonitoring] Maintenance scheduled for ${serviceId}: ` +
      `${new Date(startTime).toISOString()} - ${new Date(endTime).toISOString()}`
    );

    return window;
  }

  /**
   * Get all metrics for all services
   */
  getAllMetrics(): SLAMetrics[] {
    const metrics: SLAMetrics[] = [];
    
    for (const serviceId of this.services.keys()) {
      const m = this.calculateMetrics(serviceId);
      if (m) metrics.push(m);
    }
    
    return metrics;
  }

  /**
   * Get active breaches
   */
  getActiveBreaches(): SLABreach[] {
    const allBreaches: SLABreach[] = [];
    
    for (const breaches of this.breaches.values()) {
      allBreaches.push(...breaches.filter(b => !b.resolvedAt));
    }
    
    return allBreaches;
  }

  /**
   * Get compliance summary
   */
  getComplianceSummary(): {
    totalServices: number;
    compliantServices: number;
    nonCompliantServices: number;
    activeBreaches: number;
    overallHealth: 'healthy' | 'degraded' | 'critical';
  } {
    const metrics = this.getAllMetrics();
    const activeBreaches = this.getActiveBreaches();
    
    const compliant = metrics.filter(m => m.overallCompliant).length;
    const nonCompliant = metrics.length - compliant;
    
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const criticalBreaches = activeBreaches.filter(b => b.severity === 'critical');
    
    if (criticalBreaches.length > 0) {
      overallHealth = 'critical';
    } else if (activeBreaches.length > 0 || nonCompliant > 0) {
      overallHealth = 'degraded';
    }
    
    return {
      totalServices: metrics.length,
      compliantServices: compliant,
      nonCompliantServices: nonCompliant,
      activeBreaches: activeBreaches.length,
      overallHealth
    };
  }

  /**
   * Generate compliance report
   */
  async generateReport(): Promise<{
    generatedAt: number;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    summary: ReturnType<typeof this.getComplianceSummary>;
    metrics: SLAMetrics[];
    activeBreaches: SLABreach[];
  }> {
    const report = {
      generatedAt: Date.now(),
      summary: this.getComplianceSummary(),
      metrics: this.getAllMetrics(),
      activeBreaches: this.getActiveBreaches()
    };

    // Log report generation for SOX compliance
    try {
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'sla_report_generated',
        entityType: 'sla_monitoring',
        entityId: 'report-' + Date.now(),
        metadata: {
          summary: report.summary,
          serviceCount: report.metrics.length,
          breachCount: report.activeBreaches.length
        },
        createdAt: new Date()
      });
    } catch (error) {
      log.error('[SLAMonitoring] Failed to log report generation:', error);
    }

    return report;
  }

  /**
   * Start periodic reporting
   */
  private startPeriodicReporting(): void {
    this.reportInterval = setInterval(async () => {
      try {
        await this.generateReport();
      } catch (error: any) {
        log.warn('[SLAMonitoring] Report generation failed (will retry):', error?.message || 'unknown');
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Start data cleanup
   */
  private startDataCleanup(): void {
    // Clean up old data points every hour
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      for (const [serviceId, points] of this.dataPoints.entries()) {
        const filtered = points.filter(p => now - p.timestamp < maxAge);
        this.dataPoints.set(serviceId, filtered);
      }
      
      // Clean up old resolved breaches
      for (const [serviceId, breaches] of this.breaches.entries()) {
        const filtered = breaches.filter(b => 
          !b.resolvedAt || now - b.resolvedAt < maxAge
        );
        this.breaches.set(serviceId, filtered);
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Get SLA presets
   */
  getSLAPresets(): Record<SLALevel, SLATarget> {
    return { ...SLA_PRESETS };
  }

  /**
   * Health check
   */
  getHealth(): { healthy: boolean; servicesMonitored: number } {
    return {
      healthy: true,
      servicesMonitored: this.services.size
    };
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    log.info('[SLAMonitoring] Service shut down');
  }
}

export const slaMonitoring = SLAMonitoringService.getInstance();
