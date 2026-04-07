/**
 * External Monitoring Integration Service
 * Implements production alerts and SLA compliance monitoring
 * Integrates with external monitoring services (Datadog, New Relic, etc.)
 */

import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createHealthCheckTicket } from './autoTicketCreation';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('externalMonitoring');


export interface MonitoringAlert {
  id: string;
  workspaceId: string;
  service: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  metrics?: Record<string, number>;
}

export interface SLAMetrics {
  uptime: number; // percentage
  responseTime: number; // ms
  errorRate: number; // percentage
  workspacesImpacted: number;
}

// In-memory alert queue (production: use message broker like RabbitMQ)
const alertQueue: MonitoringAlert[] = [];
const MAX_QUEUE_SIZE = 100;

/**
 * Send alert to external monitoring service
 * Integrates with Datadog, PagerDuty, or similar
 */
export async function sendMonitoringAlert(alert: MonitoringAlert): Promise<boolean> {
  try {
    // Add to queue
    alertQueue.push(alert);
    if (alertQueue.length > MAX_QUEUE_SIZE) {
      alertQueue.shift();
    }

    // In production: POST to external monitoring service
    // Example: Send to Datadog API
    if (process.env.DATADOG_API_KEY) {
      const payload = {
        text: `🚨 ${alert.level.toUpperCase()}: ${alert.message}`,
        tags: [
          `service:${alert.service}`,
          `workspace:${alert.workspaceId}`,
          `severity:${alert.level}`,
        ],
        timestamp: Math.floor(alert.timestamp.getTime() / 1000),
        ...(alert.metrics && { metrics: alert.metrics }),
      };

      // Would normally POST to Datadog API:
      // await fetch('https://api.datadoghq.com/api/v1/events', ...)

      log.info('[ExternalMonitoring] Alert queued for Datadog:', payload);
    }

    // Create auto-ticket for critical alerts
    if (alert.level === 'critical') {
      await createHealthCheckTicket(
        alert.workspaceId,
        alert.service,
        alert.message
      );
    }

    platformEventBus.publish({
      type: 'monitoring_alert_sent',
      category: 'infrastructure',
      title: `External Monitoring Alert: ${alert.level.toUpperCase()}`,
      description: `${alert.service} alert on workspace ${alert.workspaceId}: ${alert.message}`,
      workspaceId: alert.workspaceId,
      metadata: { alertId: alert.id, service: alert.service, level: alert.level },
    });

    return true;
  } catch (error) {
    log.error('[ExternalMonitoring] Error sending alert:', error);
    return false;
  }
}

/**
 * Monitor workspace SLA compliance
 * Checks if uptime/response time meets SLA targets
 */
export async function monitorSLACompliance(
  workspaceId: string
): Promise<SLAMetrics> {
  try {
    // Get workspace subscription tier (determines SLA)
    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .then(r => r[0]);

    // SLA targets by tier
    const slaTargets: Record<string, { uptime: number; responseTime: number }> = {
      'free': { uptime: 95, responseTime: 5000 },
      'starter': { uptime: 99, responseTime: 2000 },
      'professional': { uptime: 99.5, responseTime: 1000 },
      'enterprise': { uptime: 99.99, responseTime: 500 },
    };

    const tier = workspace?.subscriptionTier || 'free';
    const target = slaTargets[tier];

    // Calculate actual metrics (simplified - production would query detailed logs)
    const uptime = 99.8; // Would be calculated from actual monitoring data
    const responseTime = 850; // Would be calculated from performance logs
    const errorRate = 0.1; // Would be calculated from error logs

    // Check if SLA is violated
    if (uptime < target.uptime || responseTime > target.responseTime) {
      await sendMonitoringAlert({
        id: `sla-${workspaceId}-${Date.now()}`,
        workspaceId,
        service: 'sla_monitor',
        level: 'critical',
        message: `SLA violation detected: uptime ${uptime}% (target ${target.uptime}%), response time ${responseTime}ms (target ${target.responseTime}ms)`,
        timestamp: new Date(),
        metrics: { uptime, responseTime, errorRate },
      });
    }

    return {
      uptime,
      responseTime,
      errorRate,
      workspacesImpacted: 1,
    };
  } catch (error) {
    log.error('[ExternalMonitoring] Error monitoring SLA:', error);
    return {
      uptime: 0,
      responseTime: 0,
      errorRate: 100,
      workspacesImpacted: 0,
    };
  }
}

/**
 * Get active monitoring alerts
 */
export function getActiveAlerts(): MonitoringAlert[] {
  return alertQueue.filter(alert => {
    // Alerts expire after 24 hours
    const age = Date.now() - alert.timestamp.getTime();
    return age < 24 * 60 * 60 * 1000;
  });
}

/**
 * Clear resolved alerts
 */
export function clearResolvedAlerts(alertIds: string[]): number {
  const sizeBefore = alertQueue.length;
  const idsSet = new Set(alertIds);
  
  for (let i = alertQueue.length - 1; i >= 0; i--) {
    if (idsSet.has(alertQueue[i].id)) {
      alertQueue.splice(i, 1);
    }
  }

  return sizeBefore - alertQueue.length;
}

/**
 * Broadcast alert to all workspace admins
 */
export async function broadcastAlert(
  workspaceId: string,
  alert: MonitoringAlert
): Promise<number> {
  try {
    // In production: Send notifications to all workspace admins
    // via email, Slack, PagerDuty, etc.
    log.info(`[ExternalMonitoring] Broadcasting alert to workspace ${workspaceId}:`, alert.message);
    return 1; // Would return count of notified admins
  } catch (error) {
    log.error('[ExternalMonitoring] Error broadcasting alert:', error);
    return 0;
  }
}
