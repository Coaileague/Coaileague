/**
 * Connection Pooling Service - Q2 2026 Infrastructure
 * 
 * Provides database connection optimization with:
 * - Pool size management based on load
 * - Connection health monitoring
 * - Automatic connection recycling
 * - Per-tenant connection quotas
 * - Query timeout management
 * - Connection statistics
 */

import { randomUUID } from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('connectionPooling');


export interface PoolConnection {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  tenantId?: string;
  isHealthy: boolean;
  isInUse: boolean;
}

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  maxConnectionAge: number; // ms
  idleTimeout: number; // ms
  acquireTimeout: number; // ms
  healthCheckInterval: number; // ms
  perTenantMax: number;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalAcquired: number;
  totalReleased: number;
  avgAcquireTime: number;
  healthyConnections: number;
  connectionsByTenant: Record<string, number>;
}

class ConnectionPoolingService {
  private static instance: ConnectionPoolingService;
  private connections: Map<string, PoolConnection> = new Map();
  private waitQueue: Array<{
    resolve: (conn: PoolConnection) => void;
    reject: (err: Error) => void;
    tenantId?: string;
    startTime: number;
  }> = [];
  
  private config: PoolConfig = {
    minConnections: 5,
    maxConnections: 50,
    maxConnectionAge: 30 * 60 * 1000, // 30 minutes
    idleTimeout: 5 * 60 * 1000, // 5 minutes
    acquireTimeout: 10000, // 10 seconds
    healthCheckInterval: 30000, // 30 seconds
    perTenantMax: 10
  };

  private stats = {
    totalAcquired: 0,
    totalReleased: 0,
    acquireTimes: [] as number[]
  };

  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): ConnectionPoolingService {
    if (!ConnectionPoolingService.instance) {
      ConnectionPoolingService.instance = new ConnectionPoolingService();
    }
    return ConnectionPoolingService.instance;
  }

  async initialize(config?: Partial<PoolConfig>): Promise<void> {
    if (this.isInitialized) return;

    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Create minimum connections
    for (let i = 0; i < this.config.minConnections; i++) {
      this.createConnection();
    }

    // Start health check loop
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckInterval
    );

    // Start idle connection cleanup
    setInterval(() => this.cleanupIdleConnections(), 60000);

    this.isInitialized = true;
    log.info(`[ConnectionPooling] Initialized with ${this.config.minConnections} connections`);
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(tenantId?: string): Promise<PoolConnection> {
    const startTime = Date.now();

    // Check per-tenant limit
    if (tenantId) {
      const tenantCount = this.getTenantConnectionCount(tenantId);
      if (tenantCount >= this.config.perTenantMax) {
        throw new Error(`Tenant ${tenantId} has reached connection limit (${this.config.perTenantMax})`);
      }
    }

    // Try to get an available connection
    const conn = this.getAvailableConnection(tenantId);
    if (conn) {
      conn.isInUse = true;
      conn.lastUsedAt = Date.now();
      conn.useCount++;
      conn.tenantId = tenantId;
      this.stats.totalAcquired++;
      this.stats.acquireTimes.push(Date.now() - startTime);
      return conn;
    }

    // Create new connection if below max
    if (this.connections.size < this.config.maxConnections) {
      const newConn = this.createConnection(tenantId);
      newConn.isInUse = true;
      newConn.useCount++;
      this.stats.totalAcquired++;
      this.stats.acquireTimes.push(Date.now() - startTime);
      return newConn;
    }

    // Wait for a connection
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.findIndex(w => w.resolve === resolve);
        if (index >= 0) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error(`Connection acquire timeout after ${this.config.acquireTimeout}ms`));
      }, this.config.acquireTimeout);

      this.waitQueue.push({
        resolve: (conn) => {
          clearTimeout(timeoutId);
          this.stats.totalAcquired++;
          this.stats.acquireTimes.push(Date.now() - startTime);
          resolve(conn);
        },
        reject,
        tenantId,
        startTime
      });
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.isInUse = false;
    conn.lastUsedAt = Date.now();
    conn.tenantId = undefined;
    this.stats.totalReleased++;

    // Check if connection should be recycled
    if (Date.now() - conn.createdAt > this.config.maxConnectionAge) {
      this.destroyConnection(connectionId);
      return;
    }

    // Process waiting requests
    this.processWaitQueue();
  }

  /**
   * Execute a function with an acquired connection
   */
  async withConnection<T>(
    fn: (conn: PoolConnection) => Promise<T>,
    tenantId?: string
  ): Promise<T> {
    const conn = await this.acquire(tenantId);
    try {
      return await fn(conn);
    } finally {
      this.release(conn.id);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const connections = Array.from(this.connections.values());
    const connectionsByTenant: Record<string, number> = {};

    for (const conn of connections) {
      if (conn.tenantId) {
        connectionsByTenant[conn.tenantId] = (connectionsByTenant[conn.tenantId] || 0) + 1;
      }
    }

    const acquireTimes = this.stats.acquireTimes.slice(-100);
    const avgAcquireTime = acquireTimes.length > 0
      ? acquireTimes.reduce((a, b) => a + b, 0) / acquireTimes.length
      : 0;

    return {
      totalConnections: connections.length,
      activeConnections: connections.filter(c => c.isInUse).length,
      idleConnections: connections.filter(c => !c.isInUse).length,
      waitingRequests: this.waitQueue.length,
      totalAcquired: this.stats.totalAcquired,
      totalReleased: this.stats.totalReleased,
      avgAcquireTime,
      healthyConnections: connections.filter(c => c.isHealthy).length,
      connectionsByTenant
    };
  }

  /**
   * Update pool configuration
   */
  updateConfig(config: Partial<PoolConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('[ConnectionPooling] Configuration updated');

    // Ensure minimum connections
    while (this.connections.size < this.config.minConnections) {
      this.createConnection();
    }

    // Trim if over maximum
    this.trimToMaxConnections();
  }

  /**
   * Get current configuration
   */
  getConfig(): PoolConfig {
    return { ...this.config };
  }

  /**
   * Force connection health check
   */
  async forceHealthCheck(): Promise<{ healthy: number; unhealthy: number }> {
    return this.performHealthChecks();
  }

  private createConnection(tenantId?: string): PoolConnection {
    const conn: PoolConnection = {
      id: randomUUID(),
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
      tenantId,
      isHealthy: true,
      isInUse: false
    };

    this.connections.set(conn.id, conn);
    return conn;
  }

  private destroyConnection(connectionId: string): void {
    this.connections.delete(connectionId);

    // Maintain minimum connections
    if (this.connections.size < this.config.minConnections) {
      this.createConnection();
    }
  }

  private getAvailableConnection(tenantId?: string): PoolConnection | undefined {
    for (const conn of this.connections.values()) {
      if (!conn.isInUse && conn.isHealthy) {
        // Prefer connections from same tenant for locality
        if (tenantId && conn.tenantId === tenantId) {
          return conn;
        }
        // Use any available healthy connection
        if (!conn.tenantId) {
          return conn;
        }
      }
    }

    // Fallback to any idle connection
    for (const conn of this.connections.values()) {
      if (!conn.isInUse && conn.isHealthy) {
        return conn;
      }
    }

    return undefined;
  }

  private getTenantConnectionCount(tenantId: string): number {
    let count = 0;
    for (const conn of this.connections.values()) {
      if (conn.tenantId === tenantId && conn.isInUse) {
        count++;
      }
    }
    return count;
  }

  private processWaitQueue(): void {
    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue[0];
      const conn = this.getAvailableConnection(waiter.tenantId);

      if (conn) {
        this.waitQueue.shift();
        conn.isInUse = true;
        conn.lastUsedAt = Date.now();
        conn.useCount++;
        conn.tenantId = waiter.tenantId;
        waiter.resolve(conn);
      } else {
        break;
      }
    }
  }

  private async performHealthChecks(): Promise<{ healthy: number; unhealthy: number }> {
    let healthy = 0;
    let unhealthy = 0;

    for (const conn of this.connections.values()) {
      // Simple health check - in production this would ping the actual DB connection
      const isOld = Date.now() - conn.createdAt > this.config.maxConnectionAge;
      
      if (isOld) {
        conn.isHealthy = false;
        unhealthy++;
        
        // Replace old connections
        if (!conn.isInUse) {
          this.destroyConnection(conn.id);
        }
      } else {
        conn.isHealthy = true;
        healthy++;
      }
    }

    return { healthy, unhealthy };
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const conn of this.connections.values()) {
      if (!conn.isInUse && 
          now - conn.lastUsedAt > this.config.idleTimeout &&
          this.connections.size > this.config.minConnections) {
        toRemove.push(conn.id);
      }
    }

    for (const id of toRemove) {
      this.destroyConnection(id);
    }

    if (toRemove.length > 0) {
      log.info(`[ConnectionPooling] Cleaned up ${toRemove.length} idle connections`);
    }
  }

  private trimToMaxConnections(): void {
    while (this.connections.size > this.config.maxConnections) {
      // Remove oldest idle connection
      let oldest: PoolConnection | undefined;
      for (const conn of this.connections.values()) {
        if (!conn.isInUse && (!oldest || conn.createdAt < oldest.createdAt)) {
          oldest = conn;
        }
      }
      
      if (oldest) {
        this.destroyConnection(oldest.id);
      } else {
        break; // No idle connections to remove
      }
    }
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.connections.clear();
    this.waitQueue = [];
    
    log.info('[ConnectionPooling] Service shut down');
  }
}

export const connectionPooling = ConnectionPoolingService.getInstance();
