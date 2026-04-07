/**
 * CIRCUIT BREAKER SERVICE
 * ========================
 * Enterprise-grade circuit breaker pattern implementation.
 * Prevents cascade failures when external services are unavailable.
 * 
 * Features:
 * - Three states: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing)
 * - Configurable failure thresholds and recovery windows
 * - Per-service circuit management
 * - Automatic recovery testing
 * - SOX-compliant audit logging
 * - Metrics and alerting integration
 */

import { randomUUID } from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('circuitBreaker');


// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitConfig {
  failureThreshold: number;       // Number of failures before opening
  successThreshold: number;       // Successes needed to close from half-open
  timeout: number;                // ms to wait before trying half-open
  volumeThreshold: number;        // Minimum requests before evaluating
  errorRateThreshold: number;     // Error rate (0-1) to trigger open
  slowCallThreshold: number;      // ms - calls slower than this count as slow
  slowCallRateThreshold: number;  // Rate of slow calls to trigger open
}

export interface CircuitStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  slowRequests: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  stateChanges: number;
  avgResponseTime: number;
}

export interface Circuit {
  serviceId: string;
  serviceName: string;
  state: CircuitState;
  config: CircuitConfig;
  stats: CircuitStats;
  openedAt?: number;
  halfOpenAt?: number;
  createdAt: number;
  lastStateChange: number;
}

export interface CircuitResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  circuitState: CircuitState;
  responseTime: number;
  wasRejected: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,           // 30 seconds
  volumeThreshold: 10,
  errorRateThreshold: 0.5,  // 50% error rate
  slowCallThreshold: 5000,  // 5 seconds
  slowCallRateThreshold: 0.8
};

const SERVICE_CONFIGS: Record<string, Partial<CircuitConfig>> = {
  'stripe': {
    failureThreshold: 3,
    timeout: 60000,         // 1 minute - payment services need careful handling
    slowCallThreshold: 10000
  },
  'gemini': {
    failureThreshold: 5,
    timeout: 30000,
    slowCallThreshold: 15000  // AI calls can be slower
  },
  'resend': {
    failureThreshold: 5,
    timeout: 30000,
    slowCallThreshold: 5000
  },
  'twilio': {
    failureThreshold: 3,
    timeout: 45000,
    slowCallThreshold: 8000
  },
  'database': {
    failureThreshold: 3,
    timeout: 10000,         // Quick recovery for DB
    slowCallThreshold: 2000
  },
  'websocket': {
    failureThreshold: 10,
    timeout: 15000,
    slowCallThreshold: 1000
  }
};

// ============================================================================
// CIRCUIT BREAKER SERVICE
// ============================================================================

class CircuitBreakerService {
  private static instance: CircuitBreakerService;
  private circuits: Map<string, Circuit> = new Map();
  private recoveryInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): CircuitBreakerService {
    if (!CircuitBreakerService.instance) {
      CircuitBreakerService.instance = new CircuitBreakerService();
    }
    return CircuitBreakerService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Start recovery checking loop
    this.startRecoveryChecking();
    
    this.isInitialized = true;
    log.info('[CircuitBreaker] Service initialized');
  }

  /**
   * Register a new circuit for a service
   */
  registerCircuit(
    serviceId: string,
    serviceName: string,
    customConfig?: Partial<CircuitConfig>
  ): Circuit {
    if (this.circuits.has(serviceId)) {
      return this.circuits.get(serviceId)!;
    }

    const baseConfig = SERVICE_CONFIGS[serviceId] || {};
    const config: CircuitConfig = {
      ...DEFAULT_CONFIG,
      ...baseConfig,
      ...customConfig
    };

    const circuit: Circuit = {
      serviceId,
      serviceName,
      state: 'CLOSED',
      config,
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rejectedRequests: 0,
        slowRequests: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        stateChanges: 0,
        avgResponseTime: 0
      },
      createdAt: Date.now(),
      lastStateChange: Date.now()
    };

    this.circuits.set(serviceId, circuit);
    log.info(`[CircuitBreaker] Registered circuit: ${serviceName} (${serviceId})`);
    
    return circuit;
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(
    serviceId: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<CircuitResult<T>> {
    const circuit = this.circuits.get(serviceId);
    
    if (!circuit) {
      // No circuit registered - execute directly
      const start = Date.now();
      try {
        const data = await operation();
        return {
          success: true,
          data,
          circuitState: 'CLOSED',
          responseTime: Date.now() - start,
          wasRejected: false
        };
      } catch (error) {
        return {
          success: false,
          error: error as Error,
          circuitState: 'CLOSED',
          responseTime: Date.now() - start,
          wasRejected: false
        };
      }
    }

    // Check if circuit should reject
    if (circuit.state === 'OPEN') {
      circuit.stats.rejectedRequests++;
      circuit.stats.totalRequests++;
      
      // Try fallback if available
      if (fallback) {
        const start = Date.now();
        try {
          const data = await fallback();
          return {
            success: true,
            data,
            circuitState: 'OPEN',
            responseTime: Date.now() - start,
            wasRejected: true
          };
        } catch (error) {
          return {
            success: false,
            error: error as Error,
            circuitState: 'OPEN',
            responseTime: Date.now() - start,
            wasRejected: true
          };
        }
      }
      
      return {
        success: false,
        error: new Error(`Circuit breaker OPEN for ${circuit.serviceName}`),
        circuitState: 'OPEN',
        responseTime: 0,
        wasRejected: true
      };
    }

    // Execute the operation
    const start = Date.now();
    try {
      const data = await operation();
      const responseTime = Date.now() - start;
      
      this.recordSuccess(circuit, responseTime);
      
      return {
        success: true,
        data,
        circuitState: circuit.state,
        responseTime,
        wasRejected: false
      };
    } catch (error) {
      const responseTime = Date.now() - start;
      
      await this.recordFailure(circuit, error as Error, responseTime);
      
      // Try fallback
      if (fallback) {
        try {
          const data = await fallback();
          return {
            success: true,
            data,
            circuitState: circuit.state,
            responseTime: Date.now() - start,
            wasRejected: false
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: fallbackError as Error,
            circuitState: circuit.state,
            responseTime: Date.now() - start,
            wasRejected: false
          };
        }
      }
      
      return {
        success: false,
        error: error as Error,
        circuitState: circuit.state,
        responseTime,
        wasRejected: false
      };
    }
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(circuit: Circuit, responseTime: number): void {
    circuit.stats.totalRequests++;
    circuit.stats.successfulRequests++;
    circuit.stats.consecutiveSuccesses++;
    circuit.stats.consecutiveFailures = 0;
    circuit.stats.lastSuccessTime = Date.now();
    
    // Update average response time
    const total = circuit.stats.successfulRequests;
    circuit.stats.avgResponseTime = 
      (circuit.stats.avgResponseTime * (total - 1) + responseTime) / total;
    
    // Check for slow call
    if (responseTime > circuit.config.slowCallThreshold) {
      circuit.stats.slowRequests++;
    }
    
    // Transition from HALF_OPEN to CLOSED
    if (circuit.state === 'HALF_OPEN' && 
        circuit.stats.consecutiveSuccesses >= circuit.config.successThreshold) {
      this.transitionState(circuit, 'CLOSED');
    }
  }

  /**
   * Record a failed operation
   */
  private async recordFailure(
    circuit: Circuit,
    error: Error,
    responseTime: number
  ): Promise<void> {
    circuit.stats.totalRequests++;
    circuit.stats.failedRequests++;
    circuit.stats.consecutiveFailures++;
    circuit.stats.consecutiveSuccesses = 0;
    circuit.stats.lastFailureTime = Date.now();
    
    // Check for slow call
    if (responseTime > circuit.config.slowCallThreshold) {
      circuit.stats.slowRequests++;
    }
    
    // Evaluate if circuit should open
    if (circuit.state === 'CLOSED' || circuit.state === 'HALF_OPEN') {
      const shouldOpen = this.evaluateOpenCondition(circuit);
      
      if (shouldOpen) {
        await this.transitionState(circuit, 'OPEN');
      }
    }
  }

  /**
   * Evaluate if circuit should transition to OPEN
   */
  private evaluateOpenCondition(circuit: Circuit): boolean {
    const { stats, config } = circuit;
    
    // Not enough volume to evaluate
    if (stats.totalRequests < config.volumeThreshold) {
      return false;
    }
    
    // Check consecutive failures
    if (stats.consecutiveFailures >= config.failureThreshold) {
      return true;
    }
    
    // Check error rate
    const errorRate = stats.failedRequests / stats.totalRequests;
    if (errorRate >= config.errorRateThreshold) {
      return true;
    }
    
    // Check slow call rate
    const slowRate = stats.slowRequests / stats.totalRequests;
    if (slowRate >= config.slowCallRateThreshold) {
      return true;
    }
    
    return false;
  }

  /**
   * Transition circuit to a new state
   */
  private async transitionState(
    circuit: Circuit,
    newState: CircuitState
  ): Promise<void> {
    const oldState = circuit.state;
    circuit.state = newState;
    circuit.stats.stateChanges++;
    circuit.lastStateChange = Date.now();
    
    if (newState === 'OPEN') {
      circuit.openedAt = Date.now();
    } else if (newState === 'HALF_OPEN') {
      circuit.halfOpenAt = Date.now();
    }
    
    // Log state transition
    log.info(
      `[CircuitBreaker] ${circuit.serviceName}: ${oldState} -> ${newState}`
    );
    
    // Audit log for OPEN state (critical event)
    if (newState === 'OPEN') {
      try {
        await db.insert(systemAuditLogs).values({
          id: randomUUID(),
          action: 'circuit_opened',
          entityType: 'circuit_breaker',
          entityId: circuit.serviceId,
          metadata: {
            serviceName: circuit.serviceName,
            previousState: oldState,
            consecutiveFailures: circuit.stats.consecutiveFailures,
            errorRate: circuit.stats.failedRequests / circuit.stats.totalRequests,
            totalRequests: circuit.stats.totalRequests,
            severity: 'critical'
          },
          createdAt: new Date()
        });
        
        // Publish event — full pipeline so Trinity and ops team receive the alert
        platformEventBus.publish({
          type: 'circuit_breaker_opened',
          workspaceId: 'platform',
          payload: {
            serviceId: circuit.serviceId,
            serviceName: circuit.serviceName,
            domain: circuit.serviceId,
            failureCount: circuit.stats.consecutiveFailures,
            errorRate: circuit.stats.failedRequests / (circuit.stats.totalRequests || 1),
            stats: circuit.stats,
          },
          metadata: { source: 'CircuitBreaker', severity: 'critical' },
        }).catch((err: any) => log.warn('[CircuitBreaker] Failed to publish circuit_breaker_opened:', err.message));
      } catch (error) {
        log.error('[CircuitBreaker] Failed to log state transition:', error);
      }
    } else if (oldState === 'OPEN' && newState === 'CLOSED') {
      // Log recovery
      try {
        await db.insert(systemAuditLogs).values({
          id: randomUUID(),
          action: 'circuit_recovered',
          entityType: 'circuit_breaker',
          entityId: circuit.serviceId,
          metadata: {
            serviceName: circuit.serviceName,
            previousState: oldState,
            recoveryTime: Date.now() - (circuit.openedAt || Date.now()),
            severity: 'info'
          },
          createdAt: new Date()
        });
        
        platformEventBus.publish({
          type: 'circuit_breaker_recovered',
          category: 'automation',
          title: `Circuit Breaker Recovered — ${circuit.serviceName}`,
          description: `Service '${circuit.serviceName}' recovered from OPEN state — normal traffic resumed`,
          metadata: { serviceId: circuit.serviceId, serviceName: circuit.serviceName, recoveryTime: Date.now() - (circuit.openedAt || Date.now()) },
        }).catch((err: any) => log.error('[CircuitBreaker] Failed to publish circuit_breaker_recovered:', err));
      } catch (error) {
        log.error('[CircuitBreaker] Failed to log recovery:', error);
      }
    }
  }

  /**
   * Start the recovery checking loop
   */
  private startRecoveryChecking(): void {
    // Check every 5 seconds for circuits ready to test
    this.recoveryInterval = setInterval(() => {
      const now = Date.now();
      
      for (const circuit of this.circuits.values()) {
        if (circuit.state === 'OPEN') {
          const timeInOpen = now - (circuit.openedAt || now);
          
          if (timeInOpen >= circuit.config.timeout) {
            // Transition to half-open for testing
            this.transitionState(circuit, 'HALF_OPEN');
          }
        }
      }
    }, 5000);
  }

  /**
   * Get circuit status
   */
  getCircuit(serviceId: string): Circuit | undefined {
    return this.circuits.get(serviceId);
  }

  /**
   * Get all circuits
   */
  getAllCircuits(): Circuit[] {
    return Array.from(this.circuits.values());
  }

  /**
   * Get aggregate statistics
   */
  getAggregateStats(): {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
    totalRequests: number;
    totalRejected: number;
    overallAvgResponseTime: number;
  } {
    const circuits = this.getAllCircuits();
    
    let totalRequests = 0;
    let totalRejected = 0;
    let totalResponseTime = 0;
    let openCount = 0;
    let halfOpenCount = 0;
    let closedCount = 0;
    
    for (const circuit of circuits) {
      totalRequests += circuit.stats.totalRequests;
      totalRejected += circuit.stats.rejectedRequests;
      totalResponseTime += circuit.stats.avgResponseTime * circuit.stats.successfulRequests;
      
      if (circuit.state === 'OPEN') openCount++;
      else if (circuit.state === 'HALF_OPEN') halfOpenCount++;
      else closedCount++;
    }
    
    const totalSuccessful = circuits.reduce(
      (sum, c) => sum + c.stats.successfulRequests,
      0
    );
    
    return {
      totalCircuits: circuits.length,
      openCircuits: openCount,
      halfOpenCircuits: halfOpenCount,
      closedCircuits: closedCount,
      totalRequests,
      totalRejected,
      overallAvgResponseTime: totalSuccessful > 0 
        ? totalResponseTime / totalSuccessful 
        : 0
    };
  }

  /**
   * Manually open a circuit (for maintenance)
   */
  async forceOpen(serviceId: string): Promise<boolean> {
    const circuit = this.circuits.get(serviceId);
    if (!circuit) return false;
    
    await this.transitionState(circuit, 'OPEN');
    return true;
  }

  /**
   * Manually close a circuit (reset)
   */
  async forceClose(serviceId: string): Promise<boolean> {
    const circuit = this.circuits.get(serviceId);
    if (!circuit) return false;
    
    // Reset stats
    circuit.stats.consecutiveFailures = 0;
    circuit.stats.consecutiveSuccesses = 0;
    
    await this.transitionState(circuit, 'CLOSED');
    return true;
  }

  /**
   * Reset circuit statistics
   */
  resetStats(serviceId: string): boolean {
    const circuit = this.circuits.get(serviceId);
    if (!circuit) return false;
    
    circuit.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      slowRequests: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      stateChanges: circuit.stats.stateChanges,
      avgResponseTime: 0
    };
    
    return true;
  }

  /**
   * Health check
   */
  getHealth(): { healthy: boolean; openCircuits: string[] } {
    const openCircuits = this.getAllCircuits()
      .filter(c => c.state === 'OPEN')
      .map(c => c.serviceId);
    
    return {
      healthy: openCircuits.length === 0,
      openCircuits
    };
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    log.info('[CircuitBreaker] Service shut down');
  }
}

export const circuitBreaker = CircuitBreakerService.getInstance();
