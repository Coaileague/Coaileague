/**
 * Rate Limit Queue Service
 * Fortune 500-Grade API Rate Limiting with Queue Management
 * 
 * Features:
 * - Per-service rate limiting (QuickBooks: 500/min, Stripe: 100/sec)
 * - Request queuing with priority support
 * - Automatic backpressure handling
 * - Retry with exponential backoff
 * - Metrics and monitoring
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../lib/logger';
const log = createLogger('rateLimitQueue');


interface RateLimitConfig {
  name: string;
  maxRequestsPerWindow: number;
  windowMs: number;
  maxQueueSize: number;
  retryAttempts: number;
  baseRetryDelayMs: number;
}

interface QueuedRequest<T> {
  id: string;
  priority: number;
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  attempts: number;
  createdAt: Date;
  workspaceId?: string;
}

interface WindowMetrics {
  requestCount: number;
  windowStart: Date;
  queuedCount: number;
  rejectedCount: number;
  retryCount: number;
}

const SERVICE_CONFIGS: Record<string, RateLimitConfig> = {
  quickbooks: {
    name: 'quickbooks',
    maxRequestsPerWindow: 500,    // QuickBooks limit: 500/minute
    windowMs: 60000,              // 1 minute
    maxQueueSize: 1000,
    retryAttempts: 3,
    baseRetryDelayMs: 1000,
  },
  stripe: {
    name: 'stripe',
    maxRequestsPerWindow: 100,    // Stripe limit: 100/second
    windowMs: 1000,               // 1 second
    maxQueueSize: 500,
    retryAttempts: 3,
    baseRetryDelayMs: 500,
  },
  exchangeRate: {
    name: 'exchangeRate',
    maxRequestsPerWindow: 100,    // Typical free tier limit
    windowMs: 60000,
    maxQueueSize: 50,
    retryAttempts: 2,
    baseRetryDelayMs: 2000,
  },
  resend: {
    name: 'resend',
    maxRequestsPerWindow: 10,     // Email rate limit
    windowMs: 1000,
    maxQueueSize: 100,
    retryAttempts: 3,
    baseRetryDelayMs: 1000,
  },
};

class RateLimitQueueService extends EventEmitter {
  private queues: Map<string, QueuedRequest<any>[]> = new Map();
  private metrics: Map<string, WindowMetrics> = new Map();
  private processing: Map<string, boolean> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  constructor() {
    super();
    for (const [name, config] of Object.entries(SERVICE_CONFIGS)) {
      this.configs.set(name, config);
      this.queues.set(name, []);
      this.metrics.set(name, this.createMetrics());
      this.processing.set(name, false);
    }
    log.info('[RateLimitQueue] Service initialized with', Object.keys(SERVICE_CONFIGS).length, 'services');
  }

  private createMetrics(): WindowMetrics {
    return {
      requestCount: 0,
      windowStart: new Date(),
      queuedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
    };
  }

  private getConfig(serviceName: string): RateLimitConfig {
    return this.configs.get(serviceName) || {
      name: serviceName,
      maxRequestsPerWindow: 100,
      windowMs: 60000,
      maxQueueSize: 100,
      retryAttempts: 3,
      baseRetryDelayMs: 1000,
    };
  }

  private resetWindowIfNeeded(serviceName: string): void {
    const metrics = this.metrics.get(serviceName);
    const config = this.getConfig(serviceName);
    
    if (!metrics) return;

    const now = new Date();
    const windowAge = now.getTime() - metrics.windowStart.getTime();
    
    if (windowAge >= config.windowMs) {
      metrics.requestCount = 0;
      metrics.windowStart = now;
    }
  }

  private canMakeRequest(serviceName: string): boolean {
    this.resetWindowIfNeeded(serviceName);
    
    const metrics = this.metrics.get(serviceName);
    const config = this.getConfig(serviceName);
    
    if (!metrics) return true;
    
    return metrics.requestCount < config.maxRequestsPerWindow;
  }

  private getTimeUntilNextWindow(serviceName: string): number {
    const metrics = this.metrics.get(serviceName);
    const config = this.getConfig(serviceName);
    
    if (!metrics) return 0;
    
    const windowAge = Date.now() - metrics.windowStart.getTime();
    return Math.max(0, config.windowMs - windowAge);
  }

  async enqueue<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options?: {
      priority?: number;
      workspaceId?: string;
    }
  ): Promise<T> {
    const config = this.getConfig(serviceName);
    const queue = this.queues.get(serviceName) || [];
    const metrics = this.metrics.get(serviceName) || this.createMetrics();

    if (queue.length >= config.maxQueueSize) {
      metrics.rejectedCount++;
      this.emit('queue-full', { service: serviceName, queueSize: queue.length });
      throw new Error(`Rate limit queue full for ${serviceName} (${queue.length} pending)`);
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `${serviceName}-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
        priority: options?.priority ?? 5,
        operation,
        resolve,
        reject,
        attempts: 0,
        createdAt: new Date(),
        workspaceId: options?.workspaceId,
      };

      queue.push(request);
      queue.sort((a, b) => a.priority - b.priority);
      
      this.queues.set(serviceName, queue);
      metrics.queuedCount++;
      this.metrics.set(serviceName, metrics);

      this.processQueue(serviceName);
    });
  }

  private async processQueue(serviceName: string): Promise<void> {
    if (this.processing.get(serviceName)) return;
    
    this.processing.set(serviceName, true);

    try {
      while (true) {
        const queue = this.queues.get(serviceName) || [];
        if (queue.length === 0) break;

        if (!this.canMakeRequest(serviceName)) {
          const waitTime = this.getTimeUntilNextWindow(serviceName);
          await this.sleep(waitTime + 100);
          continue;
        }

        const request = queue.shift()!;
        this.queues.set(serviceName, queue);

        await this.executeRequest(serviceName, request);
      }
    } finally {
      this.processing.set(serviceName, false);
    }
  }

  private async executeRequest<T>(serviceName: string, request: QueuedRequest<T>): Promise<void> {
    const config = this.getConfig(serviceName);
    const metrics = this.metrics.get(serviceName) || this.createMetrics();

    request.attempts++;
    metrics.requestCount++;
    this.metrics.set(serviceName, metrics);

    try {
      const result = await request.operation();
      request.resolve(result);
      this.emit('request-success', { service: serviceName, requestId: request.id });
    } catch (error) {
      const err = error as Error;
      
      const isRateLimitError = this.isRateLimitError(err);
      const shouldRetry = request.attempts < config.retryAttempts && 
        (isRateLimitError || this.isRetryableError(err));

      if (shouldRetry) {
        const delay = this.calculateBackoff(request.attempts, config.baseRetryDelayMs);
        metrics.retryCount++;
        
        log.warn(`[RateLimitQueue] ${serviceName}: Retry ${request.attempts}/${config.retryAttempts} in ${delay}ms`);
        
        await this.sleep(delay);
        
        if (isRateLimitError) {
          await this.sleep(this.getTimeUntilNextWindow(serviceName) + 100);
        }
        
        const queue = this.queues.get(serviceName) || [];
        queue.unshift(request);
        this.queues.set(serviceName, queue);
      } else {
        request.reject(err);
        this.emit('request-failed', { service: serviceName, requestId: request.id, error: err.message });
      }
    }
  }

  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('429') || 
           message.includes('too many requests') ||
           message.includes('throttl');
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('econnreset') || 
           message.includes('econnrefused') ||
           message.includes('503') ||
           message.includes('502');
  }

  private calculateBackoff(attempt: number, baseDelay: number): number {
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 60000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueStatus(serviceName: string): {
    queueLength: number;
    canMakeRequest: boolean;
    timeUntilNextWindow: number;
    metrics: WindowMetrics;
  } {
    return {
      queueLength: (this.queues.get(serviceName) || []).length,
      canMakeRequest: this.canMakeRequest(serviceName),
      timeUntilNextWindow: this.getTimeUntilNextWindow(serviceName),
      metrics: this.metrics.get(serviceName) || this.createMetrics(),
    };
  }

  getAllStatuses(): Record<string, { queueLength: number; requestsInWindow: number; state: string }> {
    const statuses: Record<string, unknown> = {};
    for (const [name] of this.configs) {
      const metrics = this.metrics.get(name);
      const queue = this.queues.get(name) || [];
      const config = this.getConfig(name);
      
      this.resetWindowIfNeeded(name);
      
      statuses[name] = {
        queueLength: queue.length,
        requestsInWindow: metrics?.requestCount || 0,
        state: (metrics?.requestCount || 0) >= config.maxRequestsPerWindow * 0.9 ? 'near-limit' : 'ok',
      };
    }
    return statuses;
  }

  clearQueue(serviceName: string): number {
    const queue = this.queues.get(serviceName) || [];
    const count = queue.length;
    
    for (const request of queue) {
      request.reject(new Error('Queue cleared'));
    }
    
    this.queues.set(serviceName, []);
    log.info(`[RateLimitQueue] ${serviceName}: Cleared ${count} pending requests`);
    
    return count;
  }
}

export const rateLimitQueue = new RateLimitQueueService();
