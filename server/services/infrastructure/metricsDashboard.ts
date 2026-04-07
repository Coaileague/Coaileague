/**
 * Metrics Dashboard Service - Q2 2026 Infrastructure
 * 
 * Provides infrastructure visualization with:
 * - Real-time metric collection
 * - Time-series data storage
 * - Aggregation and downsampling
 * - Dashboard-ready data formats
 * - Alert threshold monitoring
 * - SOX-compliant metric export
 */

import { randomUUID } from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('metricsDashboard');


export interface MetricPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface MetricSeries {
  name: string;
  unit: string;
  type: 'gauge' | 'counter' | 'histogram';
  points: MetricPoint[];
  aggregations: {
    min: number;
    max: number;
    avg: number;
    sum: number;
    count: number;
    p50?: number;
    p95?: number;
    p99?: number;
  };
}

export interface AlertRule {
  id: string;
  metricName: string;
  condition: 'above' | 'below' | 'equals';
  threshold: number;
  duration: number; // seconds the condition must hold
  severity: 'info' | 'warn' | 'error' | 'critical';
  enabled: boolean;
  lastTriggered?: number;
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'line' | 'gauge' | 'stat' | 'table' | 'heatmap';
  metrics: string[];
  timeRange: number; // ms
  refreshInterval: number; // ms
}

export interface DashboardConfig {
  id: string;
  name: string;
  panels: DashboardPanel[];
  refreshInterval: number;
}

class MetricsDashboardService {
  private static instance: MetricsDashboardService;
  private metrics: Map<string, MetricSeries> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private alertStates: Map<string, { triggered: boolean; since: number }> = new Map();
  private dashboards: Map<string, DashboardConfig> = new Map();
  private maxPoints = 1440; // 24 hours at 1-minute intervals
  private isInitialized = false;
  private collectionInterval: NodeJS.Timeout | null = null;
  private alertInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): MetricsDashboardService {
    if (!MetricsDashboardService.instance) {
      MetricsDashboardService.instance = new MetricsDashboardService();
    }
    return MetricsDashboardService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Collect built-in metrics every minute
    this.collectionInterval = setInterval(() => this.collectBuiltInMetrics(), 60000);
    
    // Check alerts every 30 seconds
    this.alertInterval = setInterval(() => this.checkAlerts(), 30000);

    // Initialize built-in metrics
    this.initializeBuiltInMetrics();
    
    // Create default dashboard
    this.createDefaultDashboard();

    // Initial collection
    this.collectBuiltInMetrics();

    this.isInitialized = true;
    log.info('[MetricsDashboard] Service initialized');
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, labels?: Record<string, string>): void {
    let series = this.metrics.get(name);
    
    if (!series) {
      series = {
        name,
        unit: '',
        type: 'gauge',
        points: [],
        aggregations: { min: value, max: value, avg: value, sum: value, count: 1 }
      };
      this.metrics.set(name, series);
    }

    const point: MetricPoint = {
      timestamp: Date.now(),
      value,
      labels
    };

    series.points.push(point);
    
    // Trim old points
    if (series.points.length > this.maxPoints) {
      series.points = series.points.slice(-this.maxPoints);
    }

    // Update aggregations
    this.updateAggregations(series);
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, delta = 1, labels?: Record<string, string>): void {
    const series = this.metrics.get(name);
    const currentValue = series?.points[series.points.length - 1]?.value || 0;
    this.record(name, currentValue + delta, labels);
  }

  /**
   * Get a metric series
   */
  getSeries(name: string, timeRange?: number): MetricSeries | undefined {
    const series = this.metrics.get(name);
    if (!series) return undefined;

    if (timeRange) {
      const cutoff = Date.now() - timeRange;
      return {
        ...series,
        points: series.points.filter(p => p.timestamp >= cutoff)
      };
    }

    return series;
  }

  /**
   * Get multiple metrics for dashboard
   */
  getMultipleSeries(names: string[], timeRange?: number): MetricSeries[] {
    return names
      .map(name => this.getSeries(name, timeRange))
      .filter((s): s is MetricSeries => s !== undefined);
  }

  /**
   * Get all available metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Add an alert rule
   */
  addAlertRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const id = randomUUID();
    const fullRule: AlertRule = { ...rule, id };
    this.alertRules.set(id, fullRule);
    this.alertStates.set(id, { triggered: false, since: 0 });
    return fullRule;
  }

  /**
   * Remove an alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    this.alertStates.delete(ruleId);
    return this.alertRules.delete(ruleId);
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get triggered alerts
   */
  getTriggeredAlerts(): AlertRule[] {
    return Array.from(this.alertRules.values()).filter(rule => {
      const state = this.alertStates.get(rule.id);
      return state?.triggered;
    });
  }

  /**
   * Create a dashboard configuration
   */
  createDashboard(config: Omit<DashboardConfig, 'id'>): DashboardConfig {
    const id = randomUUID();
    const dashboard: DashboardConfig = { ...config, id };
    this.dashboards.set(id, dashboard);
    return dashboard;
  }

  /**
   * Get dashboard configuration
   */
  getDashboard(id: string): DashboardConfig | undefined {
    return this.dashboards.get(id);
  }

  /**
   * Get all dashboards
   */
  getDashboards(): DashboardConfig[] {
    return Array.from(this.dashboards.values());
  }

  /**
   * Get dashboard data (metrics for all panels)
   */
  getDashboardData(dashboardId: string): Record<string, MetricSeries[]> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return {};

    const data: Record<string, MetricSeries[]> = {};
    
    for (const panel of dashboard.panels) {
      data[panel.id] = this.getMultipleSeries(panel.metrics, panel.timeRange);
    }

    return data;
  }

  /**
   * Get current system stats for overview
   */
  getSystemOverview(): Record<string, any> {
    const memoryUsage = process.memoryUsage();
    
    return {
      uptime: process.uptime(),
      memoryUsage: {
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024)
      },
      metricsCount: this.metrics.size,
      alertRulesCount: this.alertRules.size,
      triggeredAlerts: this.getTriggeredAlerts().length,
      dashboardsCount: this.dashboards.size
    };
  }

  /**
   * Export metrics to audit log (SOX compliance)
   */
  async exportMetricsToAudit(): Promise<void> {
    const overview = this.getSystemOverview();
    const triggeredAlerts = this.getTriggeredAlerts();

    try {
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'metrics_exported',
        entityType: 'metrics_dashboard',
        entityId: 'system',
        metadata: {
          overview,
          triggeredAlerts: triggeredAlerts.map(a => ({
            id: a.id,
            metricName: a.metricName,
            severity: a.severity
          })),
          metricsCount: this.metrics.size,
          timestamp: Date.now(),
          severity: 'info'
        },
        createdAt: new Date()
      });
    } catch (error) {
      log.error('[MetricsDashboard] Failed to export metrics:', error);
    }
  }

  private initializeBuiltInMetrics(): void {
    // Initialize gauge metrics
    const gaugeMetrics = [
      { name: 'system.memory.heap_used_mb', unit: 'MB' },
      { name: 'system.memory.heap_total_mb', unit: 'MB' },
      { name: 'system.memory.rss_mb', unit: 'MB' },
      { name: 'system.cpu.usage_percent', unit: '%' },
      { name: 'system.uptime_seconds', unit: 's' },
      { name: 'http.active_connections', unit: '' },
      { name: 'http.requests_per_minute', unit: 'rpm' },
      { name: 'db.active_connections', unit: '' },
      { name: 'db.query_time_avg_ms', unit: 'ms' }
    ];

    for (const metric of gaugeMetrics) {
      this.metrics.set(metric.name, {
        name: metric.name,
        unit: metric.unit,
        type: 'gauge',
        points: [],
        aggregations: { min: 0, max: 0, avg: 0, sum: 0, count: 0 }
      });
    }

    // Add default alert rules
    this.addAlertRule({
      metricName: 'system.memory.heap_used_mb',
      condition: 'above',
      threshold: 1500,
      duration: 300,
      severity: 'warn',
      enabled: true
    });

    this.addAlertRule({
      metricName: 'http.requests_per_minute',
      condition: 'above',
      threshold: 10000,
      duration: 60,
      severity: 'info',
      enabled: true
    });
  }

  private collectBuiltInMetrics(): void {
    const memoryUsage = process.memoryUsage();
    
    this.record('system.memory.heap_used_mb', Math.round(memoryUsage.heapUsed / 1024 / 1024));
    this.record('system.memory.heap_total_mb', Math.round(memoryUsage.heapTotal / 1024 / 1024));
    this.record('system.memory.rss_mb', Math.round(memoryUsage.rss / 1024 / 1024));
    this.record('system.uptime_seconds', Math.round(process.uptime()));
  }

  private updateAggregations(series: MetricSeries): void {
    const values = series.points.map(p => p.value);
    if (values.length === 0) return;

    series.aggregations.min = Math.min(...values);
    series.aggregations.max = Math.max(...values);
    series.aggregations.sum = values.reduce((a, b) => a + b, 0);
    series.aggregations.count = values.length;
    series.aggregations.avg = series.aggregations.sum / series.aggregations.count;

    // Calculate percentiles
    const sorted = [...values].sort((a, b) => a - b);
    series.aggregations.p50 = sorted[Math.floor(sorted.length * 0.5)];
    series.aggregations.p95 = sorted[Math.floor(sorted.length * 0.95)];
    series.aggregations.p99 = sorted[Math.floor(sorted.length * 0.99)];
  }

  private async checkAlerts(): Promise<void> {
    const now = Date.now();

    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;

      const series = this.metrics.get(rule.metricName);
      if (!series || series.points.length === 0) continue;

      const latestValue = series.points[series.points.length - 1].value;
      let conditionMet = false;

      switch (rule.condition) {
        case 'above':
          conditionMet = latestValue > rule.threshold;
          break;
        case 'below':
          conditionMet = latestValue < rule.threshold;
          break;
        case 'equals':
          conditionMet = latestValue === rule.threshold;
          break;
      }

      const state = this.alertStates.get(ruleId)!;
      
      if (conditionMet) {
        if (!state.triggered) {
          if (state.since === 0) {
            state.since = now;
          } else if (now - state.since >= rule.duration * 1000) {
            state.triggered = true;
            rule.lastTriggered = now;
            await this.logAlertTriggered(rule, latestValue);
          }
        }
      } else {
        state.triggered = false;
        state.since = 0;
      }
    }
  }

  private async logAlertTriggered(rule: AlertRule, value: number): Promise<void> {
    log.warn(`[MetricsDashboard] Alert triggered: ${rule.metricName} ${rule.condition} ${rule.threshold} (current: ${value})`);
    
    try {
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'alert_triggered',
        entityType: 'metrics_alert',
        entityId: rule.id,
        metadata: {
          ruleId: rule.id,
          metricName: rule.metricName,
          condition: rule.condition,
          threshold: rule.threshold,
          currentValue: value,
          severity: rule.severity,
          message: `Alert: ${rule.metricName} ${rule.condition} ${rule.threshold}`
        },
        createdAt: new Date()
      });
    } catch (error) {
      log.error('[MetricsDashboard] Failed to log alert:', error);
    }
  }

  private createDefaultDashboard(): void {
    this.createDashboard({
      name: 'System Overview',
      refreshInterval: 60000,
      panels: [
        {
          id: 'memory-usage',
          title: 'Memory Usage',
          type: 'line',
          metrics: ['system.memory.heap_used_mb', 'system.memory.heap_total_mb'],
          timeRange: 3600000, // 1 hour
          refreshInterval: 60000
        },
        {
          id: 'uptime',
          title: 'System Uptime',
          type: 'stat',
          metrics: ['system.uptime_seconds'],
          timeRange: 0,
          refreshInterval: 60000
        },
        {
          id: 'http-traffic',
          title: 'HTTP Traffic',
          type: 'line',
          metrics: ['http.requests_per_minute', 'http.active_connections'],
          timeRange: 3600000,
          refreshInterval: 60000
        },
        {
          id: 'database',
          title: 'Database Performance',
          type: 'line',
          metrics: ['db.active_connections', 'db.query_time_avg_ms'],
          timeRange: 3600000,
          refreshInterval: 60000
        }
      ]
    });
  }

  shutdown(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    if (this.alertInterval) {
      clearInterval(this.alertInterval);
    }
    
    this.metrics.clear();
    this.alertRules.clear();
    this.alertStates.clear();
    this.dashboards.clear();
    
    log.info('[MetricsDashboard] Service shut down');
  }
}

export const metricsDashboard = MetricsDashboardService.getInstance();
