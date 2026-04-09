/**
 * ERROR TRACKING SERVICE
 * =======================
 * Enterprise-grade error tracking with Sentry-style capabilities.
 * Provides centralized error aggregation, alerting, and analysis.
 * 
 * Features:
 * - Error aggregation and deduplication
 * - Stack trace analysis
 * - Error rate monitoring
 * - Threshold-based alerting
 * - Error context capture
 * - SOX-compliant audit logging
 */

import { db } from '../../db';
import { alertRules, errorEvents, errorOccurrences, systemAuditLogs } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';
import { typedCount, typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('errorTrackingService');


// ============================================================================
// TYPES
// ============================================================================

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical' | 'fatal';
export type ErrorSource = 'backend' | 'frontend' | 'ai_brain' | 'integration' | 'database' | 'external';

export interface ErrorEvent {
  id: string;
  fingerprint: string;
  message: string;
  severity: ErrorSeverity;
  source: ErrorSource;
  stack?: string;
  context: ErrorContext;
  tags: Record<string, string>;
  createdAt: Date;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface ErrorContext {
  userId?: string;
  workspaceId?: string;
  requestId?: string;
  url?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
  environment?: string;
  version?: string;
  extra?: Record<string, any>;
}

export interface ErrorStats {
  totalErrors: number;
  criticalErrors: number;
  errorRate: number;
  topErrors: Array<{ fingerprint: string; message: string; count: number }>;
  errorsBySource: Record<ErrorSource, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: 'error_rate' | 'error_count' | 'severity';
  threshold: number;
  windowMinutes: number;
  severity?: ErrorSeverity;
  source?: ErrorSource;
  enabled: boolean;
}

// ============================================================================
// ERROR TRACKING SERVICE
// ============================================================================

class ErrorTrackingService {
  private static instance: ErrorTrackingService;
  private alertRules: AlertRule[] = [];
  private recentErrors: Map<string, ErrorEvent> = new Map();
  private initialized = false;
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): ErrorTrackingService {
    if (!this.instance) {
      this.instance = new ErrorTrackingService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.ensureTableExists();
      await this.loadDefaultAlertRules();
      this.startAlertChecking();
      
      this.initialized = true;
      log.info('[ErrorTracking] Service initialized');
    } catch (error) {
      log.error('[ErrorTracking] Failed to initialize:', error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
      await typedExec(sql`
        CREATE TABLE IF NOT EXISTS error_events (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          fingerprint VARCHAR(64) NOT NULL,
          message TEXT NOT NULL,
          severity VARCHAR(20) NOT NULL,
          source VARCHAR(50) NOT NULL,
          stack TEXT,
          context JSONB DEFAULT '{}',
          tags JSONB DEFAULT '{}',
          occurrence_count INTEGER NOT NULL DEFAULT 1,
          first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(fingerprint)
        );
        
        CREATE INDEX IF NOT EXISTS idx_error_events_fingerprint ON error_events(fingerprint);
        CREATE INDEX IF NOT EXISTS idx_error_events_severity ON error_events(severity);
        CREATE INDEX IF NOT EXISTS idx_error_events_source ON error_events(source);
        CREATE INDEX IF NOT EXISTS idx_error_events_last_seen ON error_events(last_seen DESC);
        
        CREATE TABLE IF NOT EXISTS error_occurrences (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          fingerprint VARCHAR(64) NOT NULL,
          context JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_error_occurrences_fingerprint ON error_occurrences(fingerprint);
        CREATE INDEX IF NOT EXISTS idx_error_occurrences_created_at ON error_occurrences(created_at DESC);
        
        CREATE TABLE IF NOT EXISTS alert_rules (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(200) NOT NULL,
          condition VARCHAR(50) NOT NULL,
          threshold NUMERIC NOT NULL,
          window_minutes INTEGER NOT NULL DEFAULT 5,
          severity VARCHAR(20),
          source VARCHAR(50),
          enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
    } catch (error) {
      log.error('[ErrorTracking] Failed to create tables:', error);
    }
  }

  private async loadDefaultAlertRules(): Promise<void> {
    this.alertRules = [
      {
        id: 'critical_errors',
        name: 'Critical Error Alert',
        condition: 'severity',
        threshold: 1,
        windowMinutes: 5,
        severity: 'critical',
        enabled: true,
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate Alert',
        condition: 'error_rate',
        threshold: 10, // 10 errors per minute
        windowMinutes: 5,
        enabled: true,
      },
      {
        id: 'ai_brain_errors',
        name: 'AI Brain Error Alert',
        condition: 'error_count',
        threshold: 5,
        windowMinutes: 10,
        source: 'ai_brain',
        enabled: true,
      },
    ];
  }

  private startAlertChecking(): void {
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAlertRules();
      } catch (error: any) {
        log.warn('[ErrorTracking] Alert check cycle failed (will retry next interval):', error?.message || error);
      }
    }, 60000);
    
    log.info('[ErrorTracking] Alert checking started');
  }

  /**
   * Capture an error event
   */
  async captureError(params: {
    message: string;
    severity?: ErrorSeverity;
    source?: ErrorSource;
    error?: Error;
    context?: Partial<ErrorContext>;
    tags?: Record<string, string>;
  }): Promise<string> {
    const severity = params.severity || 'error';
    const source = params.source || 'backend';
    const stack = params.error?.stack;
    const context: ErrorContext = {
      environment: process.env.NODE_ENV || 'development',
      ...params.context,
    };
    const tags = params.tags || {};
    
    // Generate fingerprint for deduplication
    const fingerprint = this.generateFingerprint(params.message, source, stack);
    const now = new Date();

    try {
      // Converted to Drizzle ORM: CASE WHEN → sql fragment
      await db.insert(errorEvents).values({
        fingerprint,
        message: params.message,
        severity,
        source,
        stack: stack || null,
        context,
        tags,
        occurrenceCount: 1,
        firstSeen: now,
        lastSeen: now,
      }).onConflictDoUpdate({
        target: errorEvents.fingerprint,
        set: {
          occurrenceCount: sql`${errorEvents.occurrenceCount} + 1`,
          lastSeen: now,
          context: sql`${JSON.stringify(context)}::jsonb`,
          severity: sql`
            case 
              when ${severity} in ('critical', 'fatal') then ${severity}
              else ${errorEvents.severity}
            end
          `
        }
      });

      // Log individual occurrence for detailed analysis
      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: error_occurrences | Verified: 2026-03-23
      await db.insert(errorOccurrences).values({
        fingerprint: fingerprint,
        context: context,
      });

      // Cache in memory for quick access
      const errorEvent: ErrorEvent = {
        id: fingerprint,
        fingerprint,
        message: params.message,
        severity,
        source,
        stack,
        context,
        tags,
        createdAt: now,
        occurrenceCount: 1,
        firstSeen: now,
        lastSeen: now,
      };
      this.recentErrors.set(fingerprint, errorEvent);

      // Log critical errors to audit trail
      if (severity === 'critical' || severity === 'fatal') {
        await db.insert(systemAuditLogs).values({
        userId: context.userId,
        action: 'critical_error_captured',
        metadata: { resource: 'system',
          details: {
            fingerprint,
            message: params.message,
            source,
            severity,
          } },
      });
      }

      // Emit event for real-time monitoring (fire-and-forget — must not block error capture)
      platformEventBus.publish({
        type: 'error_captured',
        category: 'feature',
        title: `${severity.toUpperCase()}: ${params.message.slice(0, 50)}`,
        description: params.message,
        metadata: { fingerprint, severity, source },
      }).catch((err: Error) => log.warn('[ErrorTracking] Event bus publish failed (error captured):', err.message));

      log.info(`[ErrorTracking] Captured ${severity} error: ${params.message.slice(0, 100)}`);
      return fingerprint;

    } catch (dbError) {
      log.error('[ErrorTracking] Failed to capture error:', dbError);
      return fingerprint;
    }
  }

  /**
   * Capture exception (convenience method)
   */
  async captureException(
    error: Error,
    context?: Partial<ErrorContext>,
    severity: ErrorSeverity = 'error'
  ): Promise<string> {
    return this.captureError({
      message: error.message,
      severity,
      error,
      context,
    });
  }

  private generateFingerprint(message: string, source: string, stack?: string): string {
    // Normalize error message (remove dynamic parts like IDs, timestamps)
    const normalizedMessage = message
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID')
      .replace(/\b\d{13,}\b/g, 'TIMESTAMP')
      .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, 'IP');
    
    // Extract first meaningful stack frame if available
    let stackFrame = '';
    if (stack) {
      const frames = stack.split('\n').slice(1, 3);
      stackFrame = frames.join('').replace(/\s+/g, '');
    }
    
    const data = `${source}:${normalizedMessage}:${stackFrame}`;
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  private async checkAlertRules(): Promise<void> {
    for (const rule of this.alertRules.filter(r => r.enabled)) {
      try {
        const triggered = await this.evaluateAlertRule(rule);
        if (triggered) {
          await this.triggerAlert(rule);
        }
      } catch (error) {
        log.error(`[ErrorTracking] Failed to evaluate rule ${rule.id}:`, error);
      }
    }
  }

  private async evaluateAlertRule(rule: AlertRule): Promise<boolean> {
    const windowStart = new Date(Date.now() - rule.windowMinutes * 60 * 1000);
    
    let query;
    switch (rule.condition) {
      case 'error_rate':
        query = sql`
          SELECT COUNT(*)::int as count 
          FROM error_occurrences 
          WHERE created_at > ${windowStart}
        `;
        break;
      case 'error_count':
        query = sql`
          SELECT COUNT(*)::int as count 
          FROM error_occurrences o
          JOIN error_events e ON o.fingerprint = e.fingerprint
          WHERE o.created_at > ${windowStart}
            ${rule.source ? sql`AND e.source = ${rule.source}` : sql``}
        `;
        break;
      case 'severity':
        query = sql`
          SELECT COUNT(*)::int as count 
          FROM error_occurrences o
          JOIN error_events e ON o.fingerprint = e.fingerprint
          WHERE o.created_at > ${windowStart}
            AND e.severity = ${rule.severity}
        `;
        break;
      default:
        return false;
    }

    // CATEGORY C — Raw SQL retained: Dynamic query execution for error tracking | Tables: dynamic | Verified: 2026-03-23
    const result = await typedQuery(query);
    const rows = Array.isArray(result) ? result : ((result as any).rows || []);
    const count = (rows as any[])[0]?.count || 0;
    
    if (rule.condition === 'error_rate') {
      const rate = count / rule.windowMinutes;
      return rate >= rule.threshold;
    }
    
    return count >= rule.threshold;
  }

  private async triggerAlert(rule: AlertRule): Promise<void> {
    log.warn(`[ErrorTracking] Alert triggered: ${rule.name}`);
    
    platformEventBus.publish({
      type: 'error_alert_triggered',
      category: 'feature',
      title: `Alert: ${rule.name}`,
      description: `Alert rule "${rule.name}" threshold exceeded`,
      metadata: { ruleId: rule.id, condition: rule.condition, threshold: rule.threshold },
    }).catch((err: Error) => log.warn('[ErrorTracking] Event bus publish failed (alert triggered):', err.message));

    await db.insert(systemAuditLogs).values({
        action: 'error_alert_triggered',
        metadata: { resource: 'monitoring', details: { rule } },
      });
  }

  /**
   * Get error statistics
   */
  async getStats(windowMinutes: number = 60): Promise<ErrorStats> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    try {
      // CATEGORY C — Raw SQL retained: Count( | Tables: error_occurrences | Verified: 2026-03-23
      const totalResult = await typedCount(sql`
        SELECT COUNT(*)::int as total FROM error_occurrences WHERE created_at > ${windowStart}
      `);
      
      // CATEGORY C — Raw SQL retained: Count( | Tables: error_occurrences, error_events | Verified: 2026-03-23
      const criticalResult = await typedCount(sql`
        SELECT COUNT(*)::int as total 
        FROM error_occurrences o
        JOIN error_events e ON o.fingerprint = e.fingerprint
        WHERE o.created_at > ${windowStart} AND e.severity IN ('critical', 'fatal')
      `);
      
      // CATEGORY C — Raw SQL retained: GROUP BY | Tables: error_occurrences, error_events | Verified: 2026-03-23
      const topResult = await typedQuery(sql`
        SELECT e.fingerprint, e.message, COUNT(*)::int as count
        FROM error_occurrences o
        JOIN error_events e ON o.fingerprint = e.fingerprint
        WHERE o.created_at > ${windowStart}
        GROUP BY e.fingerprint, e.message
        ORDER BY count DESC
        LIMIT 10
      `);
      
      // CATEGORY C — Raw SQL retained: GROUP BY | Tables: error_occurrences, error_events | Verified: 2026-03-23
      const bySourceResult = await typedQuery(sql`
        SELECT e.source, COUNT(*)::int as count
        FROM error_occurrences o
        JOIN error_events e ON o.fingerprint = e.fingerprint
        WHERE o.created_at > ${windowStart}
        GROUP BY e.source
      `);
      
      // CATEGORY C — Raw SQL retained: GROUP BY | Tables: error_occurrences, error_events | Verified: 2026-03-23
      const bySeverityResult = await typedQuery(sql`
        SELECT e.severity, COUNT(*)::int as count
        FROM error_occurrences o
        JOIN error_events e ON o.fingerprint = e.fingerprint
        WHERE o.created_at > ${windowStart}
        GROUP BY e.severity
      `);

      const total = ((totalResult as any).rows as any[])[0]?.total || 0;
      const critical = ((criticalResult as any).rows as any[])[0]?.total || 0;
      
      const errorsBySource: Record<string, number> = {};
      for (const row of ((bySourceResult as any).rows as any[]) || []) {
        errorsBySource[row.source] = row.count;
      }
      
      const errorsBySeverity: Record<string, number> = {};
      for (const row of ((bySeverityResult as any).rows as any[]) || []) {
        errorsBySeverity[row.severity] = row.count;
      }

      return {
        totalErrors: total,
        criticalErrors: critical,
        errorRate: total / windowMinutes,
        topErrors: (((topResult as any).rows as any[]) || []).map(r => ({
          fingerprint: r.fingerprint,
          message: r.message,
          count: r.count,
        })),
        errorsBySource: errorsBySource as Record<ErrorSource, number>,
        errorsBySeverity: errorsBySeverity as Record<ErrorSeverity, number>,
      };
    } catch (error) {
      log.error('[ErrorTracking] Failed to get stats:', error);
      return {
        totalErrors: 0,
        criticalErrors: 0,
        errorRate: 0,
        topErrors: [],
        errorsBySource: {} as Record<ErrorSource, number>,
        errorsBySeverity: {} as Record<ErrorSeverity, number>,
      };
    }
  }

  /**
   * Get recent errors
   */
  async getRecentErrors(limit: number = 50): Promise<ErrorEvent[]> {
    try {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: error_events | Verified: 2026-03-23
      const result = await typedQuery(sql`
        SELECT * FROM error_events 
        ORDER BY last_seen DESC 
        LIMIT ${limit}
      `);
      
      return result.map((row: any) => ({
        id: row.id,
        fingerprint: row.fingerprint,
        message: row.message,
        severity: row.severity,
        source: row.source,
        stack: row.stack,
        context: row.context || {},
        tags: row.tags || {},
        createdAt: new Date(row.created_at),
        occurrenceCount: row.occurrence_count,
        firstSeen: new Date(row.first_seen),
        lastSeen: new Date(row.last_seen),
      }));
    } catch (error) {
      log.error('[ErrorTracking] Failed to get recent errors:', error);
      return [];
    }
  }

  /**
   * Add custom alert rule
   */
  async addAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    const id = crypto.randomUUID();
    const newRule: AlertRule = { id, ...rule };
    this.alertRules.push(newRule);
    
    await db.insert(alertRules).values({
      id: id,
      name: rule.name,
      condition: rule.condition,
      threshold: rule.threshold,
      windowMinutes: rule.windowMinutes,
      severity: rule.severity || null,
      source: rule.source || null,
      enabled: rule.enabled,
    });
    
    return newRule;
  }

  getAlertRules(): AlertRule[] {
    return [...this.alertRules];
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    log.info('[ErrorTracking] Service shutdown');
  }
}

export const errorTrackingService = ErrorTrackingService.getInstance();
