/**
 * LAZY INITIALIZER SERVICE
 * =========================
 * Fortune 500-grade startup optimization through deferred initialization
 * of non-critical services until first use.
 * 
 * Features:
 * - Deferred loading of heavy services
 * - Priority-based initialization queues
 * - Service dependency resolution
 * - Startup time metrics
 */
import { createLogger } from '../../lib/logger';
const log = createLogger('lazyInitializer');

interface LazyService<T> {
  name: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  factory: () => Promise<T>;
  instance?: T;
  initialized: boolean;
  initTime?: number;
  error?: Error;
}

interface InitMetrics {
  totalServices: number;
  initializedCount: number;
  deferredCount: number;
  totalInitTimeMs: number;
  criticalInitTimeMs: number;
}

class LazyInitializer {
  private services: Map<string, LazyService<any>> = new Map();
  private initPromises: Map<string, Promise<any>> = new Map();
  private metrics: InitMetrics = {
    totalServices: 0,
    initializedCount: 0,
    deferredCount: 0,
    totalInitTimeMs: 0,
    criticalInitTimeMs: 0,
  };
  private startupComplete = false;

  constructor() {
    log.info('[LazyInit] Lazy initialization service ready');
  }

  /**
   * Register a service for lazy initialization
   */
  register<T>(
    name: string,
    factory: () => Promise<T>,
    options: {
      priority?: 'critical' | 'high' | 'medium' | 'low';
      initOnStartup?: boolean;
    } = {}
  ): void {
    const priority = options.priority || 'medium';
    
    this.services.set(name, {
      name,
      priority,
      factory,
      initialized: false,
    });
    
    this.metrics.totalServices++;
    
    if (options.initOnStartup && priority === 'critical') {
      // Queue critical services for immediate init after startup
      setImmediate(() => this.get(name).catch(() => {}));
    }
  }

  /**
   * Get a service instance, initializing if needed
   */
  async get<T>(name: string): Promise<T> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not registered: ${name}`);
    }
    
    // Already initialized
    if (service.initialized && service.instance) {
      return service.instance;
    }
    
    // Initialization in progress
    const pending = this.initPromises.get(name);
    if (pending) {
      return pending;
    }
    
    // Initialize
    const initPromise = this.initializeService<T>(service);
    this.initPromises.set(name, initPromise);
    
    try {
      const result = await initPromise;
      return result;
    } finally {
      this.initPromises.delete(name);
    }
  }

  /**
   * Initialize a service
   */
  private async initializeService<T>(service: LazyService<T>): Promise<T> {
    const startTime = Date.now();
    
    try {
      log.info(`[LazyInit] Initializing service: ${service.name}`);
      service.instance = await service.factory();
      service.initialized = true;
      service.initTime = Date.now() - startTime;
      
      this.metrics.initializedCount++;
      this.metrics.totalInitTimeMs += service.initTime;
      
      if (service.priority === 'critical') {
        this.metrics.criticalInitTimeMs += service.initTime;
      }
      
      log.info(`[LazyInit] ${service.name} initialized in ${service.initTime}ms`);
      return service.instance;
    } catch (error) {
      service.error = error as Error;
      log.error(`[LazyInit] Failed to initialize ${service.name}:`, error);
      throw error;
    }
  }

  /**
   * Initialize all critical services (call at startup)
   */
  async initializeCritical(): Promise<void> {
    const critical = Array.from(this.services.values())
      .filter(s => s.priority === 'critical' && !s.initialized);
    
    const startTime = Date.now();
    log.info(`[LazyInit] Initializing ${critical.length} critical services...`);
    
    await Promise.all(critical.map(s => this.get(s.name).catch(() => {})));
    
    log.info(`[LazyInit] Critical services ready in ${Date.now() - startTime}ms`);
    this.startupComplete = true;
  }

  /**
   * Initialize services by priority (for background warmup)
   */
  async warmup(priority: 'high' | 'medium' | 'low'): Promise<void> {
    const services = Array.from(this.services.values())
      .filter(s => s.priority === priority && !s.initialized);
    
    this.metrics.deferredCount += services.length;
    
    for (const service of services) {
      // Stagger initialization to avoid CPU spikes
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.get(service.name).catch((err) => log.warn('[lazyInitializer] Fire-and-forget failed:', err));
    }
  }

  /**
   * Check if a service is initialized
   */
  isInitialized(name: string): boolean {
    return this.services.get(name)?.initialized ?? false;
  }

  /**
   * Get initialization metrics
   */
  getMetrics(): InitMetrics & {
    services: Array<{ name: string; priority: string; initialized: boolean; initTime?: number }>;
  } {
    const services = Array.from(this.services.values()).map(s => ({
      name: s.name,
      priority: s.priority,
      initialized: s.initialized,
      initTime: s.initTime,
    }));
    
    return {
      ...this.metrics,
      services,
    };
  }

  /**
   * Get service status
   */
  getStatus(): Record<string, { initialized: boolean; error?: string }> {
    const status: Record<string, { initialized: boolean; error?: string }> = {};
    
    for (const [name, service] of this.services) {
      status[name] = {
        initialized: service.initialized,
        error: service.error?.message,
      };
    }
    
    return status;
  }
}

export const lazyInitializer = new LazyInitializer();
