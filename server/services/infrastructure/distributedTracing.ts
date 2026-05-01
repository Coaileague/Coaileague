/**
 * Distributed Tracing Service - Q2 2026 Infrastructure
 * 
 * Provides request tracking across services with:
 * - Trace ID generation and propagation
 * - Span management for timing operations
 * - Context propagation across async boundaries
 * - Sampling and export capabilities
 * - SOX-compliant audit integration
 */

import { randomUUID } from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('distributedTracing');


// Trace context for async propagation
const traceContext = new Map<string, TraceContext>();

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'in_progress' | 'success' | 'error';
  tags: Record<string, string | number | boolean>;
  logs: SpanLog[];
}

export interface SpanLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  fields?: Record<string, unknown>;
}

export interface TraceContext {
  traceId: string;
  rootSpanId: string;
  currentSpanId: string;
  spans: Map<string, Span>;
  startTime: number;
  metadata: Record<string, unknown>;
}

export interface TraceOptions {
  serviceName?: string;
  tags?: Record<string, string | number | boolean>;
  parentTraceId?: string;
  parentSpanId?: string;
  sample?: boolean;
}

class DistributedTracingService {
  private static instance: DistributedTracingService;
  private activeTraces: Map<string, TraceContext> = new Map();
  private completedTraces: TraceContext[] = [];
  private maxCompletedTraces = 1000;
  private sampleRate = 1.0; // 100% sampling by default
  private isInitialized = false;

  private constructor() {}

  static getInstance(): DistributedTracingService {
    if (!DistributedTracingService.instance) {
      DistributedTracingService.instance = new DistributedTracingService();
    }
    return DistributedTracingService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Clean up old traces periodically
    setInterval(() => this.cleanupOldTraces(), 60000); // Every minute
    
    this.isInitialized = true;
    log.info('[DistributedTracing] Service initialized');
  }

  /**
   * Start a new trace (root span)
   */
  startTrace(operationName: string, options: TraceOptions = {}): TraceContext {
    const {
      serviceName = 'coaileague-api',
      tags = {},
      parentTraceId,
      parentSpanId,
      sample = Math.random() < this.sampleRate
    } = options;

    if (!sample) {
      // Return a no-op trace context for unsampled requests
      return this.createNoOpContext();
    }

    const traceId = parentTraceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    const now = Date.now();

    const rootSpan: Span = {
      spanId,
      traceId,
      parentSpanId,
      operationName,
      serviceName,
      startTime: now,
      status: 'in_progress',
      tags: { ...tags },
      logs: []
    };

    const context: TraceContext = {
      traceId,
      rootSpanId: spanId,
      currentSpanId: spanId,
      spans: new Map([[spanId, rootSpan]]),
      startTime: now,
      metadata: {}
    };

    this.activeTraces.set(traceId, context);
    traceContext.set(traceId, context);

    return context;
  }

  /**
   * Start a child span within an existing trace
   */
  startSpan(context: TraceContext, operationName: string, options: Partial<TraceOptions> = {}): Span {
    if (!context || !context.traceId) {
      return this.createNoOpSpan();
    }

    const spanId = this.generateSpanId();
    const now = Date.now();

    const span: Span = {
      spanId,
      traceId: context.traceId,
      parentSpanId: context.currentSpanId,
      operationName,
      serviceName: options.serviceName || 'coaileague-api',
      startTime: now,
      status: 'in_progress',
      tags: { ...(options.tags || {}) },
      logs: []
    };

    context.spans.set(spanId, span);
    context.currentSpanId = spanId;

    return span;
  }

  /**
   * End a span
   */
  endSpan(span: Span, status: 'success' | 'error' = 'success', error?: Error): void {
    if (!span || !span.spanId) return;

    const now = Date.now();
    span.endTime = now;
    span.duration = now - span.startTime;
    span.status = status;

    if (error) {
      span.tags['error'] = true;
      span.tags['error.message'] = error.message;
      span.tags['error.stack'] = error.stack || '';
      span.logs.push({
        timestamp: now,
        level: 'error',
        message: error.message,
        fields: { stack: error.stack }
      });
    }

    // Restore parent span as current
    const context = this.activeTraces.get(span.traceId);
    if (context && span.parentSpanId) {
      context.currentSpanId = span.parentSpanId;
    }
  }

  /**
   * End a trace and archive it
   */
  endTrace(context: TraceContext, status: 'success' | 'error' = 'success'): void {
    if (!context || !context.traceId) return;

    const rootSpan = context.spans.get(context.rootSpanId);
    if (rootSpan) {
      this.endSpan(rootSpan, status);
    }

    // Archive the trace
    this.completedTraces.push(context);
    if (this.completedTraces.length > this.maxCompletedTraces) {
      this.completedTraces.shift();
    }

    // Clean up active references
    this.activeTraces.delete(context.traceId);
    traceContext.delete(context.traceId);
  }

  /**
   * Add a log entry to a span
   */
  logToSpan(span: Span, level: SpanLog['level'], message: string, fields?: Record<string, unknown>): void {
    if (!span || !span.logs) return;

    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      fields
    });
  }

  /**
   * Add a tag to a span
   */
  tagSpan(span: Span, key: string, value: string | number | boolean): void {
    if (!span || !span.tags) return;
    span.tags[key] = value;
  }

  /**
   * Get trace context from trace ID
   */
  getTrace(traceId: string): TraceContext | undefined {
    return this.activeTraces.get(traceId) || 
           this.completedTraces.find(t => t.traceId === traceId);
  }

  /**
   * Get all spans for a trace
   */
  getTraceSpans(traceId: string): Span[] {
    const trace = this.getTrace(traceId);
    if (!trace) return [];
    return Array.from(trace.spans.values());
  }

  /**
   * Extract trace headers for propagation
   */
  extractHeaders(context: TraceContext): Record<string, string> {
    if (!context || !context.traceId) return {};

    return {
      'x-trace-id': context.traceId,
      'x-span-id': context.currentSpanId,
      'x-parent-span-id': context.rootSpanId
    };
  }

  /**
   * Parse trace headers from incoming request
   */
  parseHeaders(headers: Record<string, string | string[] | undefined>): { traceId?: string; spanId?: string } {
    const getHeader = (name: string): string | undefined => {
      const value = headers[name] || headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };

    return {
      traceId: getHeader('x-trace-id'),
      spanId: getHeader('x-span-id')
    };
  }

  /**
   * Get active traces count
   */
  getActiveTracesCount(): number {
    return this.activeTraces.size;
  }

  /**
   * Get completed traces (recent)
   */
  getRecentTraces(limit = 50): TraceContext[] {
    return this.completedTraces.slice(-limit).reverse();
  }

  /**
   * Get trace statistics
   */
  getStats(): {
    activeTraces: number;
    completedTraces: number;
    sampleRate: number;
    averageDuration: number;
  } {
    const completedWithDuration = this.completedTraces
      .map(t => {
        const rootSpan = t.spans.get(t.rootSpanId);
        return rootSpan?.duration || 0;
      })
      .filter(d => d > 0);

    const averageDuration = completedWithDuration.length > 0
      ? completedWithDuration.reduce((a, b) => a + b, 0) / completedWithDuration.length
      : 0;

    return {
      activeTraces: this.activeTraces.size,
      completedTraces: this.completedTraces.length,
      sampleRate: this.sampleRate,
      averageDuration
    };
  }

  /**
   * Set sample rate (0.0 to 1.0)
   */
  setSampleRate(rate: number): void {
    this.sampleRate = Math.max(0, Math.min(1, rate));
    log.info(`[DistributedTracing] Sample rate set to ${this.sampleRate * 100}%`);
  }

  /**
   * Export trace to audit log (SOX compliance)
   */
  async exportTraceToAudit(context: TraceContext): Promise<void> {
    if (!context || !context.traceId) return;

    const spans = Array.from(context.spans.values());
    const rootSpan = spans.find(s => s.spanId === context.rootSpanId);

    try {
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'trace_exported',
        entityType: 'trace_exported',
        metadata: {
          severity: 'info',
          source: 'distributed_tracing',
          message: `Trace exported: ${rootSpan?.operationName || 'unknown'}`,
          traceId: context.traceId,
          spanCount: spans.length,
          duration: rootSpan?.duration || 0,
          status: rootSpan?.status || 'unknown',
          operationName: rootSpan?.operationName
        },
      });
    } catch (error) {
      log.error('[DistributedTracing] Failed to export trace to audit:', error);
    }
  }

  private generateTraceId(): string {
    return randomUUID().replace(/-/g, '');
  }

  private generateSpanId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }

  private createNoOpContext(): TraceContext {
    return {
      traceId: '',
      rootSpanId: '',
      currentSpanId: '',
      spans: new Map(),
      startTime: 0,
      metadata: { sampled: false }
    };
  }

  private createNoOpSpan(): Span {
    return {
      spanId: '',
      traceId: '',
      operationName: '',
      serviceName: '',
      startTime: 0,
      status: 'success',
      tags: {},
      logs: []
    };
  }

  private cleanupOldTraces(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [traceId, context] of this.activeTraces) {
      if (now - context.startTime > maxAge) {
        log.warn(`[DistributedTracing] Cleaning up stale trace: ${traceId}`);
        this.endTrace(context, 'error');
      }
    }
  }

  shutdown(): void {
    log.info('[DistributedTracing] Shutting down...');
    this.activeTraces.clear();
    this.completedTraces = [];
  }
}

export const distributedTracing = DistributedTracingService.getInstance();

/**
 * Express middleware for automatic tracing
 */
export function tracingMiddleware(serviceName = 'coaileague-api') {
  return (req: any, res: any, next: any) => {
    const { traceId, spanId } = distributedTracing.parseHeaders(req.headers);
    
    const context = distributedTracing.startTrace(`${req.method} ${req.path}`, {
      serviceName,
      parentTraceId: traceId,
      parentSpanId: spanId,
      tags: {
        'http.method': req.method,
        'http.url': req.originalUrl || req.url,
        'http.user_agent': req.headers['user-agent'] || 'unknown'
      }
    });

    // Attach context to request
    req.traceContext = context;

    // Add trace ID to response headers
    if (context.traceId) {
      res.setHeader('x-trace-id', context.traceId);
    }

    // End trace on response finish
    res.on('finish', () => {
      const rootSpan = context.spans.get(context.rootSpanId);
      if (rootSpan) {
        distributedTracing.tagSpan(rootSpan, 'http.status_code', res.statusCode);
      }
      
      const status = res.statusCode >= 400 ? 'error' : 'success';
      distributedTracing.endTrace(context, status);
    });

    next();
  };
}
