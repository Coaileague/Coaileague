/**
 * Universal Circuit Breaker Service
 * Fortune 500-Grade External API Resilience
 * 
 * Features:
 * - Multi-service circuit tracking (QuickBooks, Stripe, HRIS, etc.)
 * - Configurable thresholds per service
 * - Automatic recovery with half-open testing
 * - Metrics and alerting integration
 * - Graceful degradation patterns
 */

import { EventEmitter } from 'events';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitConfig {
  name: string;
  failureThreshold: number;       // Number of failures before opening
  recoveryTimeMs: number;         // Time before attempting recovery
  halfOpenMaxAttempts: number;    // Successful attempts needed to close
  timeoutMs: number;              // Request timeout
  volumeThreshold?: number;       // Minimum requests before circuit can open
}

interface CircuitMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  stateChanges: Array<{ from: CircuitState; to: CircuitState; timestamp: Date }>;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

interface CircuitInstance {
  config: CircuitConfig;
  state: CircuitState;
  metrics: CircuitMetrics;
  nextRetryTime: Date | null;
  halfOpenSuccesses: number;
}

const DEFAULT_CONFIGS: Record<string, Partial<CircuitConfig>> = {
  quickbooks: {
    failureThreshold: 3,
    recoveryTimeMs: 60000,      // 1 minute
    halfOpenMaxAttempts: 2,
    timeoutMs: 30000,           // 30 seconds
    volumeThreshold: 5,
  },
  stripe: {
    failureThreshold: 5,
    recoveryTimeMs: 30000,      // 30 seconds
    halfOpenMaxAttempts: 3,
    timeoutMs: 15000,           // 15 seconds
    volumeThreshold: 10,
  },
  hris: {
    failureThreshold: 3,
    recoveryTimeMs: 120000,     // 2 minutes
    halfOpenMaxAttempts: 2,
    timeoutMs: 60000,           // 1 minute (HRIS can be slow)
    volumeThreshold: 3,
  },
  email: {
    failureThreshold: 5,
    recoveryTimeMs: 30000,
    halfOpenMaxAttempts: 2,
    timeoutMs: 10000,
    volumeThreshold: 10,
  },
  exchangeRate: {
    failureThreshold: 3,
    recoveryTimeMs: 300000,     // 5 minutes (rates don't change fast)
    halfOpenMaxAttempts: 1,
    timeoutMs: 5000,
    volumeThreshold: 3,
  },
};

class CircuitBreakerService extends EventEmitter {
  private circuits: Map<string, CircuitInstance> = new Map();

  constructor() {
    super();
    console.log('[CircuitBreaker] Service initialized');
  }

  getOrCreateCircuit(serviceName: string, customConfig?: Partial<CircuitConfig>): CircuitInstance {
    if (this.circuits.has(serviceName)) {
      return this.circuits.get(serviceName)!;
    }

    const defaultConfig = DEFAULT_CONFIGS[serviceName] || {};
    const config: CircuitConfig = {
      name: serviceName,
      failureThreshold: customConfig?.failureThreshold ?? defaultConfig.failureThreshold ?? 5,
      recoveryTimeMs: customConfig?.recoveryTimeMs ?? defaultConfig.recoveryTimeMs ?? 60000,
      halfOpenMaxAttempts: customConfig?.halfOpenMaxAttempts ?? defaultConfig.halfOpenMaxAttempts ?? 2,
      timeoutMs: customConfig?.timeoutMs ?? defaultConfig.timeoutMs ?? 30000,
      volumeThreshold: customConfig?.volumeThreshold ?? defaultConfig.volumeThreshold ?? 5,
    };

    const circuit: CircuitInstance = {
      config,
      state: 'closed',
      metrics: {
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        stateChanges: [],
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      },
      nextRetryTime: null,
      halfOpenSuccesses: 0,
    };

    this.circuits.set(serviceName, circuit);
    return circuit;
  }

  isOpen(serviceName: string): boolean {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return false;

    if (circuit.state === 'open') {
      if (circuit.nextRetryTime && new Date() >= circuit.nextRetryTime) {
        this.transitionState(serviceName, 'half-open');
        return false;
      }
      return true;
    }
    return false;
  }

  canExecute(serviceName: string): { allowed: boolean; reason?: string } {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) {
      return { allowed: true };
    }

    if (circuit.state === 'open') {
      if (circuit.nextRetryTime && new Date() >= circuit.nextRetryTime) {
        this.transitionState(serviceName, 'half-open');
        return { allowed: true, reason: 'half-open-test' };
      }
      return { 
        allowed: false, 
        reason: `Circuit open until ${circuit.nextRetryTime?.toISOString()}` 
      };
    }

    return { allowed: true };
  }

  recordSuccess(serviceName: string): void {
    const circuit = this.getOrCreateCircuit(serviceName);
    
    circuit.metrics.totalRequests++;
    circuit.metrics.successCount++;
    circuit.metrics.lastSuccessTime = new Date();
    circuit.metrics.consecutiveSuccesses++;
    circuit.metrics.consecutiveFailures = 0;

    if (circuit.state === 'half-open') {
      circuit.halfOpenSuccesses++;
      if (circuit.halfOpenSuccesses >= circuit.config.halfOpenMaxAttempts) {
        this.transitionState(serviceName, 'closed');
      }
    }
  }

  recordFailure(serviceName: string, error?: Error): void {
    const circuit = this.getOrCreateCircuit(serviceName);
    
    circuit.metrics.totalRequests++;
    circuit.metrics.failureCount++;
    circuit.metrics.lastFailureTime = new Date();
    circuit.metrics.consecutiveFailures++;
    circuit.metrics.consecutiveSuccesses = 0;

    if (circuit.state === 'half-open') {
      this.transitionState(serviceName, 'open');
      return;
    }

    if (circuit.state === 'closed') {
      const volumeThreshold = circuit.config.volumeThreshold || 5;
      if (
        circuit.metrics.totalRequests >= volumeThreshold &&
        circuit.metrics.consecutiveFailures >= circuit.config.failureThreshold
      ) {
        this.transitionState(serviceName, 'open');
      }
    }
  }

  private transitionState(serviceName: string, newState: CircuitState): void {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return;

    const oldState = circuit.state;
    circuit.state = newState;
    circuit.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: new Date(),
    });

    if (newState === 'open') {
      circuit.nextRetryTime = new Date(Date.now() + circuit.config.recoveryTimeMs);
      circuit.halfOpenSuccesses = 0;
      console.warn(`[CircuitBreaker] ${serviceName}: OPEN - next retry at ${circuit.nextRetryTime.toISOString()}`);
      this.emit('circuit-open', { service: serviceName, nextRetry: circuit.nextRetryTime });
    } else if (newState === 'half-open') {
      circuit.halfOpenSuccesses = 0;
      console.log(`[CircuitBreaker] ${serviceName}: HALF-OPEN - testing recovery`);
      this.emit('circuit-half-open', { service: serviceName });
    } else if (newState === 'closed') {
      circuit.nextRetryTime = null;
      circuit.halfOpenSuccesses = 0;
      circuit.metrics.consecutiveFailures = 0;
      console.log(`[CircuitBreaker] ${serviceName}: CLOSED - service recovered`);
      this.emit('circuit-closed', { service: serviceName });
    }
  }

  async execute<T>(
    serviceName: string,
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    const { allowed, reason } = this.canExecute(serviceName);

    if (!allowed) {
      console.warn(`[CircuitBreaker] ${serviceName}: Request blocked - ${reason}`);
      if (fallback) {
        return fallback();
      }
      throw new Error(`Service ${serviceName} circuit is open: ${reason}`);
    }

    const circuit = this.getOrCreateCircuit(serviceName);
    const timeoutMs = circuit.config.timeoutMs;

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        ),
      ]);
      
      this.recordSuccess(serviceName);
      return result;
    } catch (error) {
      this.recordFailure(serviceName, error as Error);
      
      if (fallback) {
        console.warn(`[CircuitBreaker] ${serviceName}: Using fallback due to error`);
        return fallback();
      }
      
      throw error;
    }
  }

  getStatus(serviceName: string): {
    state: CircuitState;
    metrics: CircuitMetrics;
    nextRetryTime: Date | null;
  } | null {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return null;

    return {
      state: circuit.state,
      metrics: { ...circuit.metrics },
      nextRetryTime: circuit.nextRetryTime,
    };
  }

  getAllStatuses(): Record<string, { state: CircuitState; failures: number; lastFailure: Date | null }> {
    const statuses: Record<string, any> = {};
    for (const [name, circuit] of this.circuits) {
      statuses[name] = {
        state: circuit.state,
        failures: circuit.metrics.consecutiveFailures,
        lastFailure: circuit.metrics.lastFailureTime,
      };
    }
    return statuses;
  }

  reset(serviceName: string): void {
    const circuit = this.circuits.get(serviceName);
    if (circuit) {
      circuit.state = 'closed';
      circuit.metrics.consecutiveFailures = 0;
      circuit.metrics.consecutiveSuccesses = 0;
      circuit.nextRetryTime = null;
      circuit.halfOpenSuccesses = 0;
      console.log(`[CircuitBreaker] ${serviceName}: Manually reset to CLOSED`);
    }
  }
}

export const circuitBreaker = new CircuitBreakerService();
