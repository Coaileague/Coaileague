/**
 * TRINITY HEALTH CONTEXT
 * ======================
 * Health-to-Conversation Bridge for Trinity AI.
 * Subscribes to TrinitySentinel health alerts and provides
 * conversational health summaries that Trinity can proactively
 * mention during user conversations.
 * 
 * Part of Phase 1A: Platform Consciousness Roadmap
 */

import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { trinitySentinel, SentinelAlert, AlertSeverity, HealthCheck } from './trinitySentinel';

// ============================================================================
// TYPES
// ============================================================================

export interface HealthContextSummary {
  hasActiveIssues: boolean;
  severity: AlertSeverity | 'none';
  summary: string;
  conversationalHint: string;
  alerts: HealthAlertDigest[];
  healthScore: number;
  lastUpdated: Date;
}

export interface HealthAlertDigest {
  id: string;
  title: string;
  severity: AlertSeverity;
  component: string;
  age: string;
  isAutoRemediated: boolean;
}

export interface ConversationalHealthContext {
  shouldMention: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: string;
}

// ============================================================================
// TRINITY HEALTH CONTEXT SERVICE
// ============================================================================

class TrinityHealthContext {
  private static instance: TrinityHealthContext;
  private recentAlerts: SentinelAlert[] = [];
  private lastHealthCheck: Date = new Date();
  private healthScore: number = 100;
  
  private readonly MAX_CACHED_ALERTS = 50;
  private readonly STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  
  static getInstance(): TrinityHealthContext {
    if (!this.instance) {
      this.instance = new TrinityHealthContext();
      this.instance.subscribeToHealthEvents();
    }
    return this.instance;
  }

  // ============================================================================
  // EVENT SUBSCRIPTION
  // ============================================================================

  private subscribeToHealthEvents(): void {
    // Subscribe to all platform events and filter for health-related ones
    platformEventBus.subscribe('*', {
      name: 'TrinityHealthContext',
      handler: async (event: PlatformEvent) => {
        if (this.isHealthRelatedEvent(event)) {
          await this.processHealthEvent(event);
        }
      },
    });
    
    console.log('[TrinityHealthContext] Subscribed to health events');
  }

  private isHealthRelatedEvent(event: PlatformEvent): boolean {
    const healthCategories = ['diagnostic', 'error', 'maintenance'];
    const healthEventTypes = ['ai_error', 'ai_timeout', 'system_maintenance'];
    const severity = event.metadata?.severity as string | undefined;
    
    return healthCategories.includes(event.category) || 
           healthEventTypes.includes(event.type) ||
           severity === 'critical' ||
           severity === 'high';
  }

  private async processHealthEvent(event: PlatformEvent): Promise<void> {
    // Convert platform event to sentinel-style alert for unified tracking
    const alert: SentinelAlert = {
      id: `event-${Date.now()}`,
      category: 'system_health',
      severity: this.mapEventSeverity(event),
      title: event.title,
      message: event.description,
      workspaceId: event.workspaceId,
      affectedComponent: event.metadata?.component || 'platform',
      detectedAt: new Date(),
      autoRemediated: false,
      metadata: event.metadata || {},
    };
    
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > this.MAX_CACHED_ALERTS) {
      this.recentAlerts.pop();
    }
    
    this.recalculateHealthScore();
  }

  private mapEventSeverity(event: PlatformEvent): AlertSeverity {
    const severity = event.metadata?.severity as string | undefined;
    if (severity === 'critical') return 'critical';
    if (severity === 'high' || event.type === 'ai_error') return 'error';
    if (severity === 'medium') return 'warning';
    return 'info';
  }

  private recalculateHealthScore(): void {
    // Get current sentinel status for accurate health score
    const sentinelStatus = trinitySentinel.getStatus();
    const activeAlerts = trinitySentinel.getAlerts(false);
    
    // Start at 100, deduct based on severity
    let score = 100;
    
    for (const alert of activeAlerts) {
      switch (alert.severity) {
        case 'critical': score -= 25; break;
        case 'error': score -= 15; break;
        case 'warning': score -= 5; break;
        case 'info': score -= 1; break;
      }
    }
    
    this.healthScore = Math.max(0, Math.min(100, score));
    this.lastHealthCheck = new Date();
  }

  // ============================================================================
  // HEALTH CONTEXT FOR CONVERSATIONS
  // ============================================================================

  /**
   * Get a summary of current platform health for Trinity to use in conversations
   */
  getHealthSummary(): HealthContextSummary {
    const sentinelStatus = trinitySentinel.getStatus();
    const activeAlerts = trinitySentinel.getAlerts(false);
    
    // Recalculate if stale
    if (Date.now() - this.lastHealthCheck.getTime() > this.STALE_THRESHOLD_MS) {
      this.recalculateHealthScore();
    }
    
    const alertDigests: HealthAlertDigest[] = activeAlerts.map(alert => ({
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      component: alert.affectedComponent,
      age: this.formatAge(alert.detectedAt),
      isAutoRemediated: alert.autoRemediated,
    }));
    
    const highestSeverity = this.getHighestSeverity(activeAlerts);
    
    return {
      hasActiveIssues: activeAlerts.length > 0,
      severity: activeAlerts.length > 0 ? highestSeverity : 'none',
      summary: this.generateSummaryText(sentinelStatus, activeAlerts),
      conversationalHint: this.generateConversationalHint(sentinelStatus, activeAlerts),
      alerts: alertDigests,
      healthScore: this.healthScore,
      lastUpdated: this.lastHealthCheck,
    };
  }

  /**
   * Get conversational context that Trinity can inject into responses
   * Returns null if there's nothing worth mentioning
   */
  getConversationalContext(workspaceId?: string): ConversationalHealthContext | null {
    const summary = this.getHealthSummary();
    
    // Only mention health issues if they exist and are significant
    if (!summary.hasActiveIssues || summary.severity === 'none' || summary.severity === 'info') {
      return null;
    }
    
    const priority = this.mapSeverityToPriority(summary.severity);
    
    // For critical issues, always mention
    if (priority === 'critical') {
      return {
        shouldMention: true,
        priority,
        message: `I should mention that I'm currently aware of a critical platform issue: ${summary.alerts[0]?.title}. I'm monitoring it closely.`,
        details: summary.summary,
      };
    }
    
    // For errors, mention proactively
    if (priority === 'high') {
      return {
        shouldMention: true,
        priority,
        message: `By the way, there's a platform issue I'm monitoring: ${summary.alerts[0]?.title}. It shouldn't affect our conversation, but I wanted you to know.`,
        details: summary.summary,
      };
    }
    
    // For warnings, mention only if directly relevant
    return {
      shouldMention: false,
      priority,
      message: summary.conversationalHint,
      details: summary.summary,
    };
  }

  /**
   * Check if Trinity should proactively mention health status
   */
  shouldProactivelyMention(): boolean {
    const summary = this.getHealthSummary();
    return summary.hasActiveIssues && 
           (summary.severity === 'critical' || summary.severity === 'error');
  }

  /**
   * Get health checks status for Trinity's awareness
   */
  getHealthChecks(): HealthCheck[] {
    return trinitySentinel.getHealthChecks();
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getHighestSeverity(alerts: SentinelAlert[]): AlertSeverity {
    if (alerts.some(a => a.severity === 'critical')) return 'critical';
    if (alerts.some(a => a.severity === 'error')) return 'error';
    if (alerts.some(a => a.severity === 'warning')) return 'warning';
    return 'info';
  }

  private mapSeverityToPriority(severity: AlertSeverity): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case 'critical': return 'critical';
      case 'error': return 'high';
      case 'warning': return 'medium';
      default: return 'low';
    }
  }

  private formatAge(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  }

  private generateSummaryText(status: any, alerts: SentinelAlert[]): string {
    if (alerts.length === 0) {
      return 'All platform systems are operating normally.';
    }
    
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const errorCount = alerts.filter(a => a.severity === 'error').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    
    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    
    return `Platform has ${parts.join(', ')} active. Health score: ${this.healthScore}%.`;
  }

  private generateConversationalHint(status: any, alerts: SentinelAlert[]): string {
    if (alerts.length === 0) {
      return "Everything's running smoothly - I'm here to help!";
    }
    
    const critical = alerts.find(a => a.severity === 'critical');
    if (critical) {
      return `I'm monitoring a critical issue with ${critical.affectedComponent}. I'll keep you informed if it affects anything.`;
    }
    
    const error = alerts.find(a => a.severity === 'error');
    if (error) {
      return `There's a minor issue with ${error.affectedComponent} that I'm tracking. It shouldn't impact your work.`;
    }
    
    return `I'm keeping an eye on a few platform metrics. Nothing to worry about.`;
  }

  /**
   * Format health context for injection into Trinity's system prompt
   */
  formatForSystemPrompt(): string {
    const summary = this.getHealthSummary();
    
    if (!summary.hasActiveIssues) {
      return 'Platform Status: All systems operational. Health score: 100%.';
    }
    
    return `Platform Status: ${summary.summary}
Active Issues:
${summary.alerts.slice(0, 3).map(a => `- [${a.severity.toUpperCase()}] ${a.title} (${a.component}, ${a.age})`).join('\n')}
${summary.conversationalHint}`;
  }
}

// Export singleton
export const trinityHealthContext = TrinityHealthContext.getInstance();
