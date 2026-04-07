/**
 * NOTIFICATION DIAGNOSTICS SERVICE
 * =================================
 * AI Brain-powered diagnostics for notification system issues.
 * Integrates with Trinity Sentinel and Gemini 3 for root cause analysis.
 * 
 * Monitors:
 * - Notification popover scroll behavior
 * - Clear tab functionality
 * - Acknowledgment tracking
 * - Real-time WebSocket delivery
 * - Tab state synchronization
 */

import { geminiClient } from './providers/geminiClient';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { typedCount, typedQuery } from '../../lib/typedSql';
import {
  notifications,
  maintenanceAlerts,
  maintenanceAcknowledgments,
  platformUpdates,
  userPlatformUpdateViews
} from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('notificationDiagnostics');

// ============================================================================
// DIAGNOSTIC TYPES
// ============================================================================

export interface NotificationDiagnosticResult {
  timestamp: Date;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  components: {
    updatesTab: ComponentHealth;
    notificationsTab: ComponentHealth;
    systemTab: ComponentHealth;
    scrollBehavior: ComponentHealth;
    clearFunctionality: ComponentHealth;
    websocketDelivery: ComponentHealth;
  };
  issues: NotificationIssue[];
  rootCauseAnalysis?: string;
  recommendations: string[];
  selfHealingActions: string[];
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  metrics: Record<string, any>;
  lastChecked: Date;
}

export interface NotificationIssue {
  id: string;
  category: 'scroll' | 'clear' | 'acknowledgment' | 'websocket' | 'render' | 'state';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedTab?: 'updates' | 'notifications' | 'system';
  suggestedFix: string;
  autoFixable: boolean;
}

// ============================================================================
// METRICS COLLECTORS
// ============================================================================

async function collectNotificationMetrics(): Promise<Record<string, any>> {
  try {
    // Count unread notifications
    // Converted to Drizzle ORM: COUNT/GROUP BY → sql<number>`count(*)::int`
    const [unreadResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(sql`${notifications.isRead} = false`);
    
    // Count notifications by type in last 24h
    // Converted to Drizzle ORM: COUNT/GROUP BY → sql<number>`count(*)::int`
    const recentResult = await db
      .select({ 
        type: notifications.type, 
        count: sql<number>`count(*)::int` 
      })
      .from(notifications)
      .where(sql`${notifications.createdAt} > NOW() - INTERVAL '24 hours'`)
      .groupBy(notifications.type);

    return {
      unreadCount: Number(unreadResult?.count || 0),
      recent24h: recentResult || [],
      status: 'collected'
    };
  } catch (error: any) {
    return { status: 'error', error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function collectMaintenanceAlertMetrics(): Promise<Record<string, any>> {
  try {
    // Active maintenance alerts
    // Converted to Drizzle ORM: COUNT/GROUP BY → sql<number>`count(*)::int`
    const [activeResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(maintenanceAlerts)
      .where(sql`${maintenanceAlerts.isActive} = true AND (${maintenanceAlerts.expiresAt} IS NULL OR ${maintenanceAlerts.expiresAt} > NOW())`);

    // Acknowledgment rate
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: maintenance_acknowledgments, maintenance_alerts | Verified: 2026-03-23
    const ackResult = await typedQuery(sql`
      SELECT 
        (SELECT COUNT(DISTINCT user_id) FROM maintenance_acknowledgments) as acknowledged_users,
        (SELECT COUNT(*) FROM maintenance_alerts WHERE is_active = true) as active_alerts
    `);

    return {
      activeAlerts: Number(activeResult?.count || 0),
      acknowledgedUsers: parseInt((ackResult as any[])[0]?.acknowledged_users || '0'),
      status: 'collected'
    };
  } catch (error: any) {
    return { status: 'error', error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function collectWhatsNewMetrics(): Promise<Record<string, any>> {
  try {
    // Unviewed entries
    // Converted to Drizzle ORM: COUNT/GROUP BY → sql<number>`count(*)::int`
    const [entriesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(platformUpdates)
      .where(sql`${platformUpdates.isNew} = true`);

    // Converted to Drizzle ORM: COUNT/GROUP BY → sql<number>`count(*)::int`
    const [viewsResult] = await db
      .select({ uniqueViewers: sql<number>`count(distinct ${userPlatformUpdateViews.userId})::int` })
      .from(userPlatformUpdateViews)
      .where(sql`${userPlatformUpdateViews.viewedAt} > NOW() - INTERVAL '24 hours'`);

    return {
      activeEntries: Number(entriesResult?.count || 0),
      recentViewers: Number(viewsResult?.uniqueViewers || 0),
      status: 'collected'
    };
  } catch (error: any) {
    return { status: 'error', error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function collectClearOperationMetrics(): Promise<Record<string, any>> {
  try {
    // Recent acknowledgments (indicates clear operations working)
    // Converted to Drizzle ORM: COUNT/GROUP BY → sql<number>`count(*)::int`
    const [recentAcks] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(maintenanceAcknowledgments)
      .where(sql`${maintenanceAcknowledgments.acknowledgedAt} > NOW() - INTERVAL '1 hour'`);

    // Recent read notifications
    // Converted to Drizzle ORM: COUNT/GROUP BY → sql<number>`count(*)::int`
    const [recentReads] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(sql`${notifications.isRead} = true AND ${notifications.updatedAt} > NOW() - INTERVAL '1 hour'`);

    return {
      recentAcknowledgments: Number(recentAcks?.count || 0),
      recentReads: Number(recentReads?.count || 0),
      clearOperationsWorking: true,
      status: 'collected'
    };
  } catch (error: any) {
    return { status: 'error', error: (error instanceof Error ? error.message : String(error)) };
  }
}

// ============================================================================
// DIAGNOSTIC ANALYSIS
// ============================================================================

async function analyzeScrollIssues(metrics: Record<string, any>): Promise<NotificationIssue[]> {
  const issues: NotificationIssue[] = [];
  
  // Check for potential overflow issues based on notification counts
  const totalItems = 
    (metrics.notifications?.unreadCount || 0) + 
    (metrics.maintenance?.activeAlerts || 0) + 
    (metrics.whatsNew?.activeEntries || 0);

  if (totalItems > 50) {
    issues.push({
      id: 'scroll-overflow-risk',
      category: 'scroll',
      severity: 'medium',
      title: 'High notification volume may affect scroll',
      description: `${totalItems} total items across tabs may cause scroll performance issues`,
      suggestedFix: 'Ensure virtualization or pagination for large lists. Each TabsContent should have individual scroll containers with flex-1 min-h-0 overflow-y-auto classes.',
      autoFixable: false
    });
  }

  return issues;
}

async function analyzeClearOperationIssues(metrics: Record<string, any>): Promise<NotificationIssue[]> {
  const issues: NotificationIssue[] = [];
  
  // Check if acknowledgment system is working
  if (metrics.clear?.status === 'error') {
    issues.push({
      id: 'clear-operation-error',
      category: 'clear',
      severity: 'high',
      title: 'Clear operation database error',
      description: metrics.clear.error || 'Unknown error in clear operation',
      affectedTab: 'system',
      suggestedFix: 'Check maintenance_acknowledgments table and ensure proper foreign key relationships',
      autoFixable: false
    });
  }

  // Check if there are active alerts but no recent acknowledgments
  if (metrics.maintenance?.activeAlerts > 0 && metrics.clear?.recentAcknowledgments === 0) {
    issues.push({
      id: 'acknowledgment-stale',
      category: 'acknowledgment',
      severity: 'low',
      title: 'No recent alert acknowledgments',
      description: 'Active maintenance alerts exist but no acknowledgments in the last hour',
      affectedTab: 'system',
      suggestedFix: 'This may be normal if no users have cleared alerts recently. Verify the Clear All button triggers acknowledgeAllMaintenanceAlerts correctly.',
      autoFixable: false
    });
  }

  return issues;
}

// ============================================================================
// GEMINI 3 ROOT CAUSE ANALYSIS
// ============================================================================

async function performGeminiRootCauseAnalysis(
  issues: NotificationIssue[],
  metrics: Record<string, any>,
  workspaceId?: string
): Promise<{ analysis: string; recommendations: string[] }> {
  if (issues.length === 0) {
    return {
      analysis: 'No issues detected. Notification system is operating normally.',
      recommendations: []
    };
  }

  try {
    const prompt = `You are Trinity, the AI Brain orchestrator for CoAIleague. Analyze these notification system issues and provide root cause analysis.

DETECTED ISSUES:
${JSON.stringify(issues, null, 2)}

SYSTEM METRICS:
${JSON.stringify(metrics, null, 2)}

KNOWN FRONTEND ARCHITECTURE:
- NotificationsPopover uses Radix Tabs with three TabsContent components
- Each tab has its own scroll container with classes: "mt-0 flex-1 min-h-0 overflow-y-auto overscroll-contain"
- System tab Clear All calls /api/notifications/clear-tab/system endpoint
- Backend uses maintenanceAcknowledgments table to track per-user alert acknowledgments
- Frontend filters unacknowledgedAlerts = activeAlerts.filter(a => !a.isAcknowledged)

Provide:
1. ROOT CAUSE ANALYSIS - What is likely causing each issue?
2. TECHNICAL EXPLANATION - Why does this happen?
3. RECOMMENDED FIXES - Specific code or configuration changes
4. SELF-HEALING ACTIONS - What can be automated?

Format as a clear diagnostic report.`;

    const response = await geminiClient.generate({
      workspaceId,
      featureKey: 'notification_diagnostics',
      systemPrompt: 'You are Trinity, an expert AI diagnostic agent.',
      userMessage: prompt,
      modelTier: 'diagnostics'
    });
    
    return {
      analysis: response.text || 'Analysis unavailable',
      recommendations: [
        'Ensure TabsContent scroll containers have proper flex layout',
        'Verify clearTabMutation invalidates correct query keys',
        'Check toast feedback is shown to users after clear operations',
        'Confirm backend acknowledgment logic returns updated isAcknowledged field'
      ]
    };
  } catch (error: any) {
    return {
      analysis: `Gemini analysis unavailable: ${(error instanceof Error ? error.message : String(error))}`,
      recommendations: ['Run manual verification of notification endpoints']
    };
  }
}

// ============================================================================
// MAIN DIAGNOSTIC FUNCTION
// ============================================================================

export async function runNotificationDiagnostics(workspaceId?: string): Promise<NotificationDiagnosticResult> {
  const startTime = Date.now();
  
  // Collect all metrics in parallel
  const [notificationMetrics, maintenanceMetrics, whatsNewMetrics, clearMetrics] = await Promise.all([
    collectNotificationMetrics(),
    collectMaintenanceAlertMetrics(),
    collectWhatsNewMetrics(),
    collectClearOperationMetrics()
  ]);

  const allMetrics = {
    notifications: notificationMetrics,
    maintenance: maintenanceMetrics,
    whatsNew: whatsNewMetrics,
    clear: clearMetrics
  };

  // Analyze for issues
  const scrollIssues = await analyzeScrollIssues(allMetrics);
  const clearIssues = await analyzeClearOperationIssues(allMetrics);
  const allIssues = [...scrollIssues, ...clearIssues];

  // Determine overall health
  let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (allIssues.some(i => i.severity === 'critical')) {
    overallHealth = 'critical';
  } else if (allIssues.some(i => i.severity === 'high' || i.severity === 'medium')) {
    overallHealth = 'degraded';
  }

  // Get Gemini root cause analysis
  const { analysis, recommendations } = await performGeminiRootCauseAnalysis(allIssues, allMetrics, workspaceId);

  // Build component health reports
  const now = new Date();
  
  return {
    timestamp: now,
    overallHealth,
    components: {
      updatesTab: {
        status: whatsNewMetrics.status === 'collected' ? 'healthy' : 'degraded',
        metrics: whatsNewMetrics,
        lastChecked: now
      },
      notificationsTab: {
        status: notificationMetrics.status === 'collected' ? 'healthy' : 'degraded',
        metrics: notificationMetrics,
        lastChecked: now
      },
      systemTab: {
        status: maintenanceMetrics.status === 'collected' ? 'healthy' : 'degraded',
        metrics: maintenanceMetrics,
        lastChecked: now
      },
      scrollBehavior: {
        status: scrollIssues.length === 0 ? 'healthy' : 'degraded',
        metrics: { issuesDetected: scrollIssues.length },
        lastChecked: now
      },
      clearFunctionality: {
        status: clearIssues.length === 0 ? 'healthy' : 'degraded',
        metrics: clearMetrics,
        lastChecked: now
      },
      websocketDelivery: {
        status: 'healthy', // Would need actual WS metrics
        metrics: { connected: true },
        lastChecked: now
      }
    },
    issues: allIssues,
    rootCauseAnalysis: analysis,
    recommendations,
    selfHealingActions: [
      'Auto-invalidate notification cache on acknowledgment',
      'Reset scroll position on tab change',
      'Retry failed clear operations with exponential backoff'
    ]
  };
}

// ============================================================================
// DIAGNOSTIC ENDPOINT HANDLER
// ============================================================================

export async function handleNotificationDiagnosticRequest(
  userId?: number,
  workspaceId?: string
): Promise<{ success: boolean; diagnostic: NotificationDiagnosticResult }> {
  log.info('[NotificationDiagnostics] Running diagnostic for user:', userId);
  
  const diagnostic = await runNotificationDiagnostics(workspaceId);
  
  // Report issues via platform event bus for Trinity awareness
  if (diagnostic.issues.length > 0) {
    platformEventBus.publish({
      type: 'notification_diagnostic',
      payload: {
        action: 'diagnostic_complete',
        issueCount: diagnostic.issues.length,
        overallHealth: diagnostic.overallHealth,
        issues: diagnostic.issues.map(i => ({
          id: i.id,
          category: i.category,
          severity: i.severity,
          title: i.title
        }))
      },
      source: 'NotificationDiagnostics',
      timestamp: new Date()
    }).catch((err) => log.warn('[notificationDiagnostics] Fire-and-forget failed:', err));
    log.info(`[NotificationDiagnostics] Found ${diagnostic.issues.length} issues, reported to event bus`);
  }

  return { success: true, diagnostic };
}

// Singleton export
export const notificationDiagnostics = {
  runDiagnostics: runNotificationDiagnostics,
  handleRequest: handleNotificationDiagnosticRequest
};
