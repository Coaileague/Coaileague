/**
 * Health Check Aggregation Service - Q2 2026 Infrastructure
 * 
 * Provides unified service health monitoring with:
 * - Individual service health checks
 * - Aggregate health scoring
 * - Dependency health tracking
 * - Alerting on degradation
 * - Historical health data
 * - SOX-compliant reporting
 */

import { randomUUID } from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
import { sql } from 'drizzle-orm';
const log = createLogger('healthCheckAggregation');


export interface ServiceHealth {
  serviceId: string;
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  responseTime: number; // ms
  lastCheck: number;
  consecutiveFailures: number;
  uptime: number; // percentage
  metadata?: Record<string, unknown>;
}

export interface HealthCheckConfig {
  serviceId: string;
  serviceName: string;
  checkFn: () => Promise<{ healthy: boolean; responseTime: number; metadata?: Record<string, any> }>;
  intervalMs: number;
  timeout: number;
  degradedThreshold: number; // response time threshold for degraded status
  unhealthyAfterFailures: number;
}

export interface AggregateHealth {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  healthScore: number; // 0-100
  services: ServiceHealth[];
  timestamp: number;
  degradedServices: string[];
  unhealthyServices: string[];
}

export interface HealthHistory {
  timestamp: number;
  healthScore: number;
  status: AggregateHealth['overallStatus'];
  serviceCount: number;
  unhealthyCount: number;
}

class HealthCheckAggregationService {
  private static instance: HealthCheckAggregationService;
  private services: Map<string, ServiceHealth> = new Map();
  private configs: Map<string, HealthCheckConfig> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private history: HealthHistory[] = [];
  private maxHistory = 1440; // 24 hours at 1-minute intervals
  private isInitialized = false;
  private historyInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): HealthCheckAggregationService {
    if (!HealthCheckAggregationService.instance) {
      HealthCheckAggregationService.instance = new HealthCheckAggregationService();
    }
    return HealthCheckAggregationService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Record history every minute
    this.historyInterval = setInterval(() => this.recordHistory(), 60000);

    // Register default service checks
    this.registerDefaultChecks();

    this.isInitialized = true;
    log.info('[HealthCheck] Aggregation service initialized');
  }

  /**
   * Register a service for health monitoring
   */
  registerService(config: HealthCheckConfig): void {
    this.configs.set(config.serviceId, config);

    // Initialize health status
    this.services.set(config.serviceId, {
      serviceId: config.serviceId,
      serviceName: config.serviceName,
      status: 'unknown',
      responseTime: 0,
      lastCheck: 0,
      consecutiveFailures: 0,
      uptime: 100
    });

    // Start periodic checks
    const interval = setInterval(
      () => this.checkService(config.serviceId),
      config.intervalMs
    );
    this.intervals.set(config.serviceId, interval);

    // Run initial check
    this.checkService(config.serviceId);

    log.info(`[HealthCheck] Registered service: ${config.serviceName}`);
  }

  /**
   * Unregister a service
   */
  unregisterService(serviceId: string): void {
    const interval = this.intervals.get(serviceId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(serviceId);
    }
    this.services.delete(serviceId);
    this.configs.delete(serviceId);
  }

  /**
   * Get individual service health
   */
  getServiceHealth(serviceId: string): ServiceHealth | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get aggregate health status
   */
  getAggregateHealth(): AggregateHealth {
    const services = Array.from(this.services.values());
    const degradedServices: string[] = [];
    const unhealthyServices: string[] = [];

    let healthyCount = 0;
    let degradedCount = 0;

    for (const service of services) {
      if (service.status === 'healthy') {
        healthyCount++;
      } else if (service.status === 'degraded') {
        degradedCount++;
        degradedServices.push(service.serviceName);
      } else if (service.status === 'unhealthy') {
        unhealthyServices.push(service.serviceName);
      }
    }

    const totalServices = services.length || 1;
    const healthScore = Math.round(
      ((healthyCount * 100) + (degradedCount * 50)) / totalServices
    );

    let overallStatus: AggregateHealth['overallStatus'] = 'healthy';
    if (unhealthyServices.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedServices.length > 0) {
      overallStatus = 'degraded';
    }

    return {
      overallStatus,
      healthScore,
      services,
      timestamp: Date.now(),
      degradedServices,
      unhealthyServices
    };
  }

  /**
   * Get health history
   */
  getHistory(limit = 60): HealthHistory[] {
    return this.history.slice(-limit);
  }

  /**
   * Force check all services
   */
  async checkAllServices(): Promise<AggregateHealth> {
    const checkPromises = Array.from(this.configs.keys()).map(id => 
      this.checkService(id)
    );
    await Promise.all(checkPromises);
    return this.getAggregateHealth();
  }

  /**
   * Check a specific service
   */
  async checkService(serviceId: string): Promise<ServiceHealth | undefined> {
    const config = this.configs.get(serviceId);
    const service = this.services.get(serviceId);
    
    if (!config || !service) return undefined;

    try {
      const startTime = Date.now();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), config.timeout);
      });

      const checkPromise = config.checkFn();
      const result = await Promise.race([checkPromise, timeoutPromise]);
      
      const responseTime = Date.now() - startTime;
      service.responseTime = responseTime;
      service.lastCheck = Date.now();

      if (result.healthy) {
        service.consecutiveFailures = 0;
        
        if (responseTime > config.degradedThreshold) {
          service.status = 'degraded';
        } else {
          service.status = 'healthy';
        }
        
        // Update uptime (exponential moving average)
        service.uptime = service.uptime * 0.99 + 100 * 0.01;
      } else {
        service.consecutiveFailures++;
        service.uptime = service.uptime * 0.99 + 0 * 0.01;
        
        if (service.consecutiveFailures >= config.unhealthyAfterFailures) {
          service.status = 'unhealthy';
          this.logUnhealthyService(service);
        } else {
          service.status = 'degraded';
        }
      }

      service.metadata = result.metadata;
    } catch (error: any) {
      service.consecutiveFailures++;
      service.lastCheck = Date.now();
      service.uptime = service.uptime * 0.99 + 0 * 0.01;
      
      if (service.consecutiveFailures >= config.unhealthyAfterFailures) {
        service.status = 'unhealthy';
        this.logUnhealthyService(service);
      } else {
        service.status = 'degraded';
      }
      
      service.metadata = { error: (error instanceof Error ? error.message : String(error)) };
    }

    return service;
  }

  /**
   * Get services by status
   */
  getServicesByStatus(status: ServiceHealth['status']): ServiceHealth[] {
    return Array.from(this.services.values()).filter(s => s.status === status);
  }

  /**
   * Get average response time across all services
   */
  getAverageResponseTime(): number {
    const services = Array.from(this.services.values());
    if (services.length === 0) return 0;
    
    const total = services.reduce((sum, s) => sum + s.responseTime, 0);
    return total / services.length;
  }

  private registerDefaultChecks(): void {
    // Database health check
    this.registerService({
      serviceId: 'database',
      serviceName: 'PostgreSQL Database',
      checkFn: async () => {
        try {
          const start = Date.now();
          // Converted to Drizzle ORM: health check ping
          await db.execute(sql`SELECT 1`);
          return { healthy: true, responseTime: Date.now() - start };
        } catch {
          return { healthy: false, responseTime: 0 };
        }
      },
      intervalMs: 30000,
      timeout: 5000,
      degradedThreshold: 100,
      unhealthyAfterFailures: 3
    });

    // Memory check
    this.registerService({
      serviceId: 'memory',
      serviceName: 'Memory Usage',
      checkFn: async () => {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        const heapTotalMB = usage.heapTotal / 1024 / 1024;
        const usagePercent = (heapUsedMB / heapTotalMB) * 100;
        
        return {
          healthy: usagePercent < 90,
          responseTime: 0,
          metadata: {
            heapUsedMB: Math.round(heapUsedMB),
            heapTotalMB: Math.round(heapTotalMB),
            usagePercent: Math.round(usagePercent)
          }
        };
      },
      intervalMs: 60000,
      timeout: 1000,
      degradedThreshold: 50,
      unhealthyAfterFailures: 1
    });

    // Event loop lag check
    this.registerService({
      serviceId: 'event-loop',
      serviceName: 'Event Loop',
      checkFn: async () => {
        const start = Date.now();
        await new Promise(resolve => setImmediate(resolve));
        const lag = Date.now() - start;
        
        return {
          healthy: lag < 100,
          responseTime: lag,
          metadata: { lagMs: lag }
        };
      },
      intervalMs: 10000,
      timeout: 1000,
      degradedThreshold: 50,
      unhealthyAfterFailures: 5
    });
  }

  private recordHistory(): void {
    const aggregate = this.getAggregateHealth();
    
    this.history.push({
      timestamp: Date.now(),
      healthScore: aggregate.healthScore,
      status: aggregate.overallStatus,
      serviceCount: aggregate.services.length,
      unhealthyCount: aggregate.unhealthyServices.length
    });

    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  private async logUnhealthyService(service: ServiceHealth): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'service_unhealthy',
        entityType: 'health_check',
        entityId: service.serviceId,
        metadata: {
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          consecutiveFailures: service.consecutiveFailures,
          uptime: service.uptime,
          lastCheck: service.lastCheck,
          severity: 'error'
        },
        createdAt: new Date()
      });
    } catch (error: any) {
      log.warn('[HealthCheck] Failed to log unhealthy service (will retry):', error?.message || 'unknown');
    }
  }

  shutdown(): void {
    if (this.historyInterval) {
      clearInterval(this.historyInterval);
    }
    
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    
    this.intervals.clear();
    this.services.clear();
    this.configs.clear();
    
    log.info('[HealthCheck] Aggregation service shut down');
  }
}

export const healthCheckAggregation = HealthCheckAggregationService.getInstance();
