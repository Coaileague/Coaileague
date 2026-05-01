/**
 * Log Aggregation Service - Q4 2026 Infrastructure
 * =================================================
 * Centralized logging with search, filtering, and retention policies.
 * 
 * Features:
 * - Structured log ingestion from all services
 * - Full-text search with filters
 * - Log level filtering and aggregation
 * - Retention policy management
 * - Real-time log streaming
 * - Alert triggers based on patterns
 */
import { createLogger } from '../../lib/logger';
const log = createLogger('logAggregationService');

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  userId?: number;
  orgId?: number;
}

interface LogQuery {
  level?: LogLevel | LogLevel[];
  service?: string | string[];
  startTime?: Date;
  endTime?: Date;
  search?: string;
  traceId?: string;
  userId?: number;
  orgId?: number;
  limit?: number;
  offset?: number;
}

interface RetentionPolicy {
  level: LogLevel;
  retentionDays: number;
  archiveEnabled: boolean;
}

interface LogAlertRule {
  id: string;
  name: string;
  pattern: string | RegExp;
  level?: LogLevel | LogLevel[];
  service?: string;
  threshold: number;
  windowMs: number;
  enabled: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}

interface LogStats {
  totalLogs: number;
  logsByLevel: Record<LogLevel, number>;
  logsByService: Record<string, number>;
  logsPerMinute: number;
  errorRate: number;
  oldestLog?: Date;
  newestLog?: Date;
  storageUsed: number; // bytes estimate
}

class LogAggregationService {
  private initialized = false;
  private logs: LogEntry[] = [];
  private alertRules: Map<string, LogAlertRule> = new Map();
  private alertWindowCounts: Map<string, { count: number; windowStart: Date }> = new Map();
  
  private retentionPolicies: Map<LogLevel, RetentionPolicy> = new Map([
    ['debug', { level: 'debug', retentionDays: 1, archiveEnabled: false }],
    ['info', { level: 'info', retentionDays: 7, archiveEnabled: false }],
    ['warn', { level: 'warn', retentionDays: 30, archiveEnabled: true }],
    ['error', { level: 'error', retentionDays: 90, archiveEnabled: true }],
    ['fatal', { level: 'fatal', retentionDays: 365, archiveEnabled: true }],
  ]);
  
  private maxLogsInMemory = 100000;
  private cleanupInterval?: NodeJS.Timeout;
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Register default alert rules
    this.registerDefaultAlertRules();
    
    // Start retention cleanup
    this.startRetentionCleanup();
    
    this.initialized = true;
    log.info('[LogAggregation] Service initialized with 5 retention policies');
  }
  
  /**
   * Ingest a log entry
   */
  ingest(
    level: LogLevel,
    service: string,
    message: string,
    options: {
      metadata?: Record<string, unknown>;
      traceId?: string;
      spanId?: string;
      userId?: number;
      orgId?: number;
    } = {}
  ): LogEntry {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      timestamp: new Date(),
      level,
      service,
      message,
      ...options,
    };
    
    this.logs.push(entry);
    
    // Trim if exceeding memory limit
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs = this.logs.slice(-this.maxLogsInMemory);
    }
    
    // Check alert rules
    this.checkAlertRules(entry);
    
    // Internal event: log_ingested
    
    return entry;
  }
  
  /**
   * Query logs with filters
   */
  query(params: LogQuery): {
    logs: LogEntry[];
    total: number;
    hasMore: boolean;
  } {
    let filtered = [...this.logs];
    
    // Filter by level
    if (params.level) {
      const levels = Array.isArray(params.level) ? params.level : [params.level];
      filtered = filtered.filter(log => levels.includes(log.level));
    }
    
    // Filter by service
    if (params.service) {
      const services = Array.isArray(params.service) ? params.service : [params.service];
      filtered = filtered.filter(log => services.includes(log.service));
    }
    
    // Filter by time range
    if (params.startTime) {
      filtered = filtered.filter(log => log.timestamp >= params.startTime!);
    }
    if (params.endTime) {
      filtered = filtered.filter(log => log.timestamp <= params.endTime!);
    }
    
    // Filter by trace ID
    if (params.traceId) {
      filtered = filtered.filter(log => log.traceId === params.traceId);
    }
    
    // Filter by user/org
    if (params.userId) {
      filtered = filtered.filter(log => log.userId === params.userId);
    }
    if (params.orgId) {
      filtered = filtered.filter(log => log.orgId === params.orgId);
    }
    
    // Full-text search
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    const total = filtered.length;
    const offset = params.offset || 0;
    const limit = params.limit || 100;
    
    return {
      logs: filtered.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
    };
  }
  
  /**
   * Get logs aggregated by a field
   */
  aggregate(
    field: 'level' | 'service',
    timeRange?: { start: Date; end: Date }
  ): Record<string, number> {
    let logs = this.logs;
    
    if (timeRange) {
      logs = logs.filter(log => 
        log.timestamp >= timeRange.start && log.timestamp <= timeRange.end
      );
    }
    
    const counts: Record<string, number> = {};
    for (const log of logs) {
      const key = log[field];
      counts[key] = (counts[key] || 0) + 1;
    }
    
    return counts;
  }
  
  /**
   * Register an alert rule
   */
  registerAlertRule(
    name: string,
    pattern: string | RegExp,
    options: {
      level?: LogLevel | LogLevel[];
      service?: string;
      threshold?: number;
      windowMs?: number;
    } = {}
  ): LogAlertRule {
    const rule: LogAlertRule = {
      id: `alert-${Date.now()}`,
      name,
      pattern,
      level: options.level,
      service: options.service,
      threshold: options.threshold || 10,
      windowMs: options.windowMs || 60000, // 1 minute default
      enabled: true,
      triggerCount: 0,
    };
    
    this.alertRules.set(rule.id, rule);
    log.info(`[LogAggregation] Registered alert rule: ${name}`);
    
    return rule;
  }
  
  /**
   * Get log statistics
   */
  getStats(): LogStats {
    const logsByLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    };
    
    const logsByService: Record<string, number> = {};
    
    for (const log of this.logs) {
      logsByLevel[log.level]++;
      logsByService[log.service] = (logsByService[log.service] || 0) + 1;
    }
    
    // Calculate logs per minute (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentLogs = this.logs.filter(log => log.timestamp >= fiveMinutesAgo);
    const logsPerMinute = recentLogs.length / 5;
    
    // Calculate error rate
    const totalRecent = recentLogs.length || 1;
    const errorsRecent = recentLogs.filter(log => 
      log.level === 'error' || log.level === 'fatal'
    ).length;
    const errorRate = errorsRecent / totalRecent;
    
    // Estimate storage
    const avgLogSize = 500; // bytes estimate
    const storageUsed = this.logs.length * avgLogSize;
    
    const sortedLogs = [...this.logs].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    return {
      totalLogs: this.logs.length,
      logsByLevel,
      logsByService,
      logsPerMinute: Math.round(logsPerMinute * 100) / 100,
      errorRate: Math.round(errorRate * 10000) / 100, // percentage
      oldestLog: sortedLogs[0]?.timestamp,
      newestLog: sortedLogs[sortedLogs.length - 1]?.timestamp,
      storageUsed,
    };
  }
  
  /**
   * Get retention policies
   */
  getRetentionPolicies(): RetentionPolicy[] {
    return Array.from(this.retentionPolicies.values());
  }
  
  /**
   * Update a retention policy
   */
  updateRetentionPolicy(level: LogLevel, policy: Partial<RetentionPolicy>): void {
    const existing = this.retentionPolicies.get(level);
    if (existing) {
      this.retentionPolicies.set(level, { ...existing, ...policy, level });
    }
  }
  
  /**
   * Get alert rules
   */
  getAlertRules(): LogAlertRule[] {
    return Array.from(this.alertRules.values());
  }
  
  /**
   * Get health status
   */
  getHealth(): {
    healthy: boolean;
    errorRate: number;
    logsPerMinute: number;
    storagePercent: number;
    issues: string[];
  } {
    const stats = this.getStats();
    const issues: string[] = [];
    
    const storagePercent = (this.logs.length / this.maxLogsInMemory) * 100;
    
    if (stats.errorRate > 5) {
      issues.push(`High error rate: ${stats.errorRate}%`);
    }
    if (storagePercent > 80) {
      issues.push(`Log storage high: ${Math.round(storagePercent)}%`);
    }
    if (stats.logsPerMinute > 1000) {
      issues.push(`High log volume: ${stats.logsPerMinute}/min`);
    }
    
    return {
      healthy: issues.length === 0,
      errorRate: stats.errorRate,
      logsPerMinute: stats.logsPerMinute,
      storagePercent: Math.round(storagePercent),
      issues,
    };
  }
  
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    log.info('[LogAggregation] Service shut down');
  }
  
  // Private methods
  
  private registerDefaultAlertRules(): void {
    // High error rate alert
    this.registerAlertRule('High Error Rate', /error|exception|failed/i, {
      level: ['error', 'fatal'],
      threshold: 50,
      windowMs: 60000,
    });
    
    // Security alert
    this.registerAlertRule('Security Event', /unauthorized|forbidden|authentication failed/i, {
      threshold: 10,
      windowMs: 60000,
    });
    
    // Database alert
    this.registerAlertRule('Database Issues', /connection refused|timeout|deadlock/i, {
      service: 'database',
      threshold: 5,
      windowMs: 60000,
    });
  }
  
  private checkAlertRules(entry: LogEntry): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      // Check level filter
      if (rule.level) {
        const levels = Array.isArray(rule.level) ? rule.level : [rule.level];
        if (!levels.includes(entry.level)) continue;
      }
      
      // Check service filter
      if (rule.service && entry.service !== rule.service) continue;
      
      // Check pattern match
      const pattern = typeof rule.pattern === 'string' 
        ? new RegExp(rule.pattern, 'i')
        : rule.pattern;
      
      if (!pattern.test(entry.message)) continue;
      
      // Update window count
      const windowData = this.alertWindowCounts.get(rule.id);
      const now = new Date();
      
      if (!windowData || now.getTime() - windowData.windowStart.getTime() > rule.windowMs) {
        this.alertWindowCounts.set(rule.id, { count: 1, windowStart: now });
      } else {
        windowData.count++;
        
        if (windowData.count >= rule.threshold) {
          this.triggerAlert(rule);
          this.alertWindowCounts.set(rule.id, { count: 0, windowStart: now });
        }
      }
    }
  }
  
  private triggerAlert(rule: LogAlertRule): void {
    rule.lastTriggered = new Date();
    rule.triggerCount++;
    
    // Internal event: log_alert_triggered
    
    log.info(`[LogAggregation] Alert triggered: ${rule.name}`);
  }
  
  private startRetentionCleanup(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.runRetentionCleanup();
    }, 60 * 60 * 1000);
  }
  
  private runRetentionCleanup(): void {
    const now = Date.now();
    let removed = 0;
    
    this.logs = this.logs.filter(log => {
      const policy = this.retentionPolicies.get(log.level);
      if (!policy) return true;
      
      const maxAge = policy.retentionDays * 24 * 60 * 60 * 1000;
      const age = now - log.timestamp.getTime();
      
      if (age > maxAge) {
        removed++;
        return false;
      }
      return true;
    });
    
    if (removed > 0) {
      log.info(`[LogAggregation] Retention cleanup removed ${removed} logs`);
    }
  }
}

export const logAggregationService = new LogAggregationService();
