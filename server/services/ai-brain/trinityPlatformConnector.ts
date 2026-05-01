/**
 * TRINITY PLATFORM CONNECTOR
 * ==========================
 * Centralized service for connecting platform services to Trinity AI Brain.
 * Provides standardized methods for services to emit events, share insights,
 * and receive AI-driven recommendations.
 * 
 * Purpose:
 * - Unify how platform services connect to Trinity
 * - Provide fire-and-forget event posting
 * - Enable bidirectional communication with AI Brain
 * - Track service connectivity health
 * 
 * Usage:
 * import { trinityPlatformConnector } from './ai-brain/trinityPlatformConnector';
 * await trinityPlatformConnector.emitServiceEvent('payroll', 'payroll_completed', { ... });
 */

import { platformEventBus, type PlatformEvent } from '../platformEventBus';
import { trinityMemoryService } from './trinityMemoryService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityPlatformConnector');

// ============================================================================
// TYPES
// ============================================================================

export type ServiceDomain = 
  | 'payroll'
  | 'scheduling'
  | 'compliance'
  | 'email'
  | 'reports'
  | 'disputes'
  | 'breaks'
  | 'pto'
  | 'monitoring'
  | 'analytics'
  | 'notifications'
  | 'training'
  | 'websocket'
  | 'performance'
  | 'digest';

export interface ServiceEventPayload {
  action: string;
  workspaceId?: string;
  userId?: string;
  data?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  requiresAction?: boolean;
}

export interface ServiceConnectionStatus {
  domain: ServiceDomain;
  lastEvent?: Date;
  eventCount: number;
  isHealthy: boolean;
  insights: number;
}

// ============================================================================
// TRINITY PLATFORM CONNECTOR CLASS
// ============================================================================

class TrinityPlatformConnector {
  private static instance: TrinityPlatformConnector;
  private connectionStats: Map<ServiceDomain, ServiceConnectionStatus> = new Map();
  private initialized = false;

  private constructor() {
    log.info('[TrinityPlatformConnector] Initializing platform connector...');
  }

  static getInstance(): TrinityPlatformConnector {
    if (!TrinityPlatformConnector.instance) {
      TrinityPlatformConnector.instance = new TrinityPlatformConnector();
    }
    return TrinityPlatformConnector.instance;
  }

  /**
   * Initialize the platform connector
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize connection stats for all known domains
    const domains: ServiceDomain[] = [
      'payroll', 'scheduling', 'compliance', 'email', 'reports',
      'disputes', 'breaks', 'pto', 'monitoring', 'analytics',
      'notifications', 'training', 'websocket', 'performance', 'digest'
    ];

    for (const domain of domains) {
      this.connectionStats.set(domain, {
        domain,
        eventCount: 0,
        isHealthy: true,
        insights: 0,
      });
    }

    this.initialized = true;
    log.info('[TrinityPlatformConnector] Platform connector initialized');
  }

  // ============================================================================
  // EVENT EMISSION
  // ============================================================================

  /**
   * Emit a service event to Trinity (fire-and-forget)
   * This is the primary method for services to report events
   */
  async emitServiceEvent(
    domain: ServiceDomain,
    eventType: string,
    payload: ServiceEventPayload
  ): Promise<void> {
    try {
      const event: PlatformEvent = {
        type: 'service_event',
        category: 'platform_service',
        title: `[${domain.toUpperCase()}] ${eventType}`,
        description: payload.action,
        workspaceId: payload.workspaceId,
        userId: payload.userId,
        metadata: {
          domain,
          eventType,
          ...payload.data,
        },
        priority: this.mapSeverityToPriority(payload.severity),
        visibility: payload.requiresAction ? 'manager' : 'system',
      };

      await platformEventBus.publish(event);

      // Update connection stats
      this.updateConnectionStats(domain);

    } catch (error: any) {
      log.error(`[TrinityPlatformConnector] Failed to emit event for ${domain}:`, (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Emit a compliance-related event with higher visibility
   */
  async emitComplianceEvent(
    domain: ServiceDomain,
    eventType: string,
    payload: ServiceEventPayload & { complianceType: string; isViolation?: boolean }
  ): Promise<void> {
    const event: PlatformEvent = {
      type: 'compliance_event',
      category: 'compliance',
      title: `[COMPLIANCE] ${payload.complianceType}: ${eventType}`,
      description: payload.action,
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      metadata: {
        domain,
        eventType,
        complianceType: payload.complianceType,
        isViolation: payload.isViolation,
        ...payload.data,
      },
      priority: payload.isViolation ? 1 : 2,
      visibility: 'manager',
    };

    await platformEventBus.publish(event);
    this.updateConnectionStats(domain);
  }

  /**
   * Emit an automation event
   */
  async emitAutomationEvent(
    domain: ServiceDomain,
    automationType: string,
    payload: ServiceEventPayload & { success: boolean; duration?: number }
  ): Promise<void> {
    const event: PlatformEvent = {
      type: 'automation_event',
      category: 'automation',
      title: `[AUTOMATION] ${domain}: ${automationType}`,
      description: payload.action,
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      metadata: {
        domain,
        automationType,
        success: payload.success,
        duration: payload.duration,
        ...payload.data,
      },
      priority: payload.success ? 3 : 1,
      visibility: payload.success ? 'system' : 'manager',
    };

    await platformEventBus.publish(event);
    this.updateConnectionStats(domain);
  }

  // ============================================================================
  // INSIGHT SHARING
  // ============================================================================

  /**
   * Share an insight with Trinity memory for long-term learning
   */
  async shareInsight(
    domain: ServiceDomain,
    insight: {
      title: string;
      content: string;
      confidence: number;
      applicableScenarios: string[];
      workspaceId?: string;
    }
  ): Promise<void> {
    try {
      await trinityMemoryService.shareInsight({
        sourceAgent: `${domain}_service`,
        insightType: 'pattern',
        workspaceScope: insight.workspaceId,
        title: insight.title,
        content: insight.content,
        confidence: insight.confidence,
        applicableScenarios: insight.applicableScenarios,
      });

      // Update insights count
      const stats = this.connectionStats.get(domain);
      if (stats) {
        stats.insights++;
        this.connectionStats.set(domain, stats);
      }

    } catch (error: any) {
      log.error(`[TrinityPlatformConnector] Failed to share insight for ${domain}:`, (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Report a pattern detected by the service
   */
  async reportPattern(
    domain: ServiceDomain,
    pattern: {
      patternType: string;
      description: string;
      frequency: number;
      significance: 'low' | 'medium' | 'high';
      workspaceId?: string;
      affectedUsers?: string[];
    }
  ): Promise<void> {
    await this.shareInsight(domain, {
      title: `${domain} Pattern: ${pattern.patternType}`,
      content: pattern.description,
      confidence: pattern.significance === 'high' ? 0.9 : pattern.significance === 'medium' ? 0.7 : 0.5,
      applicableScenarios: [domain, pattern.patternType],
      workspaceId: pattern.workspaceId,
    });

    // Also emit as event for real-time awareness
    await this.emitServiceEvent(domain, 'pattern_detected', {
      action: pattern.description,
      workspaceId: pattern.workspaceId,
      severity: pattern.significance === 'high' ? 'warning' : 'info',
      data: {
        patternType: pattern.patternType,
        frequency: pattern.frequency,
        affectedUsers: pattern.affectedUsers,
      },
    });
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  /**
   * Report service health status
   */
  async reportHealth(
    domain: ServiceDomain,
    health: {
      isHealthy: boolean;
      message?: string;
      metrics?: Record<string, number>;
    }
  ): Promise<void> {
    const stats = this.connectionStats.get(domain);
    if (stats) {
      stats.isHealthy = health.isHealthy;
      this.connectionStats.set(domain, stats);
    }

    if (!health.isHealthy) {
      await this.emitServiceEvent(domain, 'health_degraded', {
        action: health.message || 'Service health degraded',
        severity: 'warning',
        requiresAction: true,
        data: health.metrics,
      });
    }
  }

  /**
   * Get connection status for all domains
   */
  getConnectionStatus(): ServiceConnectionStatus[] {
    return Array.from(this.connectionStats.values());
  }

  /**
   * Get connection status for a specific domain
   */
  getDomainStatus(domain: ServiceDomain): ServiceConnectionStatus | undefined {
    return this.connectionStats.get(domain);
  }

  /**
   * Get diagnostics for the platform connector
   */
  getDiagnostics(): Record<string, unknown> {
    const statuses = this.getConnectionStatus();
    const healthyCount = statuses.filter(s => s.isHealthy).length;
    const totalEvents = statuses.reduce((sum, s) => sum + s.eventCount, 0);
    const totalInsights = statuses.reduce((sum, s) => sum + s.insights, 0);

    return {
      initialized: this.initialized,
      totalDomains: statuses.length,
      healthyDomains: healthyCount,
      unhealthyDomains: statuses.length - healthyCount,
      totalEvents,
      totalInsights,
      domains: statuses.map(s => ({
        domain: s.domain,
        eventCount: s.eventCount,
        insights: s.insights,
        isHealthy: s.isHealthy,
        lastEvent: s.lastEvent,
      })),
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private updateConnectionStats(domain: ServiceDomain): void {
    const stats = this.connectionStats.get(domain) || {
      domain,
      eventCount: 0,
      isHealthy: true,
      insights: 0,
    };

    stats.eventCount++;
    stats.lastEvent = new Date();
    this.connectionStats.set(domain, stats);
  }

  private mapSeverityToPriority(severity?: string): number {
    switch (severity) {
      case 'critical': return 1;
      case 'error': return 1;
      case 'warning': return 2;
      case 'info':
      default: return 3;
    }
  }
}

export const trinityPlatformConnector = TrinityPlatformConnector.getInstance();
