/**
 * Performance Metrics Service
 * Tracks API response times, database queries, WebSocket latency, and automation success rates
 */
import { platformEventBus } from './platformEventBus';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';

export interface MetricPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface PerformanceMetrics {
  apiResponseTimes: MetricPoint[];
  databaseQueryTimes: MetricPoint[];
  websocketLatency: MetricPoint[];
  automationSuccessRate: number;
  automationFailureCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

class PerformanceMetricsCollector {
  private apiResponseTimes: number[] = [];
  private dbQueryTimes: number[] = [];
  private wsLatencies: number[] = [];
  private automationSuccesses: number = 0;
  private automationFailures: number = 0;
  private metricsBuffer: MetricPoint[] = [];

  recordApiResponse(responseTimeMs: number): void {
    this.apiResponseTimes.push(responseTimeMs);
    this.metricsBuffer.push({
      timestamp: new Date(),
      value: responseTimeMs,
      label: 'api_response'
    });
    // Keep last 1000 measurements
    if (this.apiResponseTimes.length > 1000) {
      this.apiResponseTimes.shift();
    }
  }

  recordDatabaseQuery(queryTimeMs: number): void {
    this.dbQueryTimes.push(queryTimeMs);
    this.metricsBuffer.push({
      timestamp: new Date(),
      value: queryTimeMs,
      label: 'db_query'
    });
    if (this.dbQueryTimes.length > 1000) {
      this.dbQueryTimes.shift();
    }
  }

  recordWebSocketLatency(latencyMs: number): void {
    this.wsLatencies.push(latencyMs);
    this.metricsBuffer.push({
      timestamp: new Date(),
      value: latencyMs,
      label: 'ws_latency'
    });
    if (this.wsLatencies.length > 1000) {
      this.wsLatencies.shift();
    }
  }

  recordAutomationSuccess(): void {
    this.automationSuccesses++;
  }

  recordAutomationFailure(): void {
    this.automationFailures++;
    const total = this.automationSuccesses + this.automationFailures;
    const failureRate = total > 0 ? Math.round((this.automationFailures / total) * 100) : 0;
    platformEventBus.publish({
      type: 'automation_failure_recorded',
      category: 'infrastructure',
      title: 'Automation Failure Recorded',
      description: `Automation failure recorded — cumulative failure rate: ${failureRate}% (${this.automationFailures}/${total})`,
      workspaceId: PLATFORM_WORKSPACE_ID,
      metadata: { failures: this.automationFailures, total, failureRate },
    });
  }

  private percentile(array: number[], p: number): number {
    if (array.length === 0) return 0;
    const sorted = [...array].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getMetrics(): PerformanceMetrics {
    const avgApiResponse = this.apiResponseTimes.length > 0
      ? this.apiResponseTimes.reduce((a, b) => a + b, 0) / this.apiResponseTimes.length
      : 0;

    const totalAutomations = this.automationSuccesses + this.automationFailures;
    const successRate = totalAutomations > 0
      ? (this.automationSuccesses / totalAutomations) * 100
      : 100;

    return {
      apiResponseTimes: this.metricsBuffer.filter(m => m.label === 'api_response').slice(-100),
      databaseQueryTimes: this.metricsBuffer.filter(m => m.label === 'db_query').slice(-100),
      websocketLatency: this.metricsBuffer.filter(m => m.label === 'ws_latency').slice(-100),
      automationSuccessRate: Math.round(successRate * 100) / 100,
      automationFailureCount: this.automationFailures,
      averageResponseTime: Math.round(avgApiResponse * 100) / 100,
      p95ResponseTime: Math.round(this.percentile(this.apiResponseTimes, 95) * 100) / 100,
      p99ResponseTime: Math.round(this.percentile(this.apiResponseTimes, 99) * 100) / 100
    };
  }

  resetMetrics(): void {
    this.apiResponseTimes = [];
    this.dbQueryTimes = [];
    this.wsLatencies = [];
    this.automationSuccesses = 0;
    this.automationFailures = 0;
    this.metricsBuffer = [];
  }
}

export const performanceMetrics = new PerformanceMetricsCollector();
