/**
 * TRINITY AUTONOMOUS OPERATIONS SERVICE
 * ======================================
 * Fortune 500-grade autonomous platform maintenance, monitoring, and self-healing.
 * 
 * Capabilities:
 * 1. PROACTIVE MONITORING: Periodic health scans across all platform services
 * 2. ANOMALY DETECTION: AI-powered issue detection before they become problems
 * 3. SUPPORT ROLE ROUTING: Notifications to admins/support via existing notification system
 * 4. AUTONOMOUS MAINTENANCE: Self-healing actions (cleanup, optimization, repairs)
 * 5. COMPREHENSIVE AUDITING: Every autonomous action logged for compliance
 * 
 * Integration:
 * - Uses trinitySentinel for health monitoring
 * - Uses platformHealthMonitor for service checks
 * - Uses notificationService for user/role notifications
 * - Uses platformEventBus for event publishing
 * - Uses WebSocket for real-time alerts
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityAutonomousOps');
import { platformEventBus } from '../platformEventBus';
import { trinitySentinel, SentinelAlert, AlertSeverity } from './trinitySentinel';
import { platformHealthMonitor, PlatformHealthSummary, PlatformIssue } from './platformHealthMonitor';
import { trinityPlatformConnector } from './trinityPlatformConnector';
import { createNotification } from '../notificationService';
import { broadcastToWorkspace, broadcastToAllClients } from '../../websocket';
import { db } from '../../db';
import { eq, and, desc, gte, lte, sql, inArray, isNull } from 'drizzle-orm';
import { users, systemAuditLogs, notifications, workspaces, platformRoles, workspaceMembers, sessions } from '@shared/schema';
import { PLATFORM_WORKSPACE_ID } from '../../services/billing/billingConstants';
import crypto from 'crypto';
import { trinityOrgIntelligenceService } from './trinityOrgIntelligenceService';
import { typedExists } from '../../lib/typedSql';

// ============================================================================
// TYPES
// ============================================================================

export type AutonomousActionType =
  | 'health_scan'
  | 'anomaly_detection'
  | 'cache_cleanup'
  | 'session_cleanup'
  | 'database_optimization'
  | 'notification_cleanup'
  | 'service_restart'
  | 'escalation'
  | 'self_healing'
  | 'report_generation';

export type ActionSeverity = 'routine' | 'attention' | 'urgent' | 'critical';

export interface AutonomousAction {
  id: string;
  type: AutonomousActionType;
  severity: ActionSeverity;
  title: string;
  description: string;
  targetComponent?: string;
  initiatedAt: Date;
  completedAt?: Date;
  success: boolean;
  result?: string;
  metrics?: Record<string, any>;
  escalatedTo?: string[];
  requiresHumanReview: boolean;
}

export interface SupportRoleTarget {
  role: 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'org_owner' | 'co_owner' | 'manager' | 'supervisor';
  userId: string;
  workspaceId: string;
  email?: string;
}

export interface HealthScanResult {
  scanId: string;
  timestamp: Date;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  healthScore: number;
  servicesChecked: number;
  issuesDetected: number;
  criticalIssues: number;
  anomaliesDetected: AnomalyReport[];
  actions: AutonomousAction[];
}

export interface AnomalyReport {
  id: string;
  type: 'performance' | 'usage' | 'error_spike' | 'pattern_deviation' | 'resource_exhaustion';
  component: string;
  severity: AlertSeverity;
  description: string;
  metrics: Record<string, number>;
  detectedAt: Date;
  baseline?: Record<string, number>;
}

export interface OperationalStatus {
  isRunning: boolean;
  lastScan: Date | null;
  scanCount: number;
  actionsExecuted: number;
  issuesDetected: number;
  issuesResolved: number;
  escalationsTriggered: number;
  uptime: number;
}

// ============================================================================
// SUPPORT ROLE ROUTING
// ============================================================================

const SUPPORT_ROLE_HIERARCHY: Array<'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent'> = [
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
];

async function getSupportRoleTargets(
  severity: ActionSeverity,
  workspaceId?: string
): Promise<SupportRoleTarget[]> {
  const targets: SupportRoleTarget[] = [];
  
  try {
    if (workspaceId) {
      const workspaceRoles = severity === 'critical'
        ? ['org_owner', 'co_owner']
        : severity === 'urgent'
          ? ['org_owner', 'co_owner', 'manager']
          : ['manager', 'supervisor'];

      const members = await db
        .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            inArray(workspaceMembers.role, workspaceRoles as any)
          )
        );

      for (const member of members) {
        const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, member.userId)).limit(1);
        targets.push({
          role: member.role as any,
          userId: member.userId,
          workspaceId,
          email: u?.email || undefined,
        });
      }
    } else {
      const platformAdminRoles = severity === 'critical'
        ? ['root_admin', 'deputy_admin']
        : severity === 'urgent'
          ? ['root_admin', 'deputy_admin', 'sysop']
          : ['support_manager', 'sysop', 'support_agent'];

      const roleRows = await db
        .select({ userId: platformRoles.userId, role: platformRoles.role })
        .from(platformRoles)
        .where(
          and(
            inArray(platformRoles.role, platformAdminRoles as any),
            isNull(platformRoles.revokedAt),
            eq(platformRoles.isSuspended, false)
          )
        )
        .limit(10);

      for (const row of roleRows) {
        const [u] = await db.select({ email: users.email, workspaceId: users.currentWorkspaceId }).from(users).where(eq(users.id, row.userId)).limit(1);
        const userWorkspaceId = u?.workspaceId || PLATFORM_WORKSPACE_ID;
        if (userWorkspaceId) {
          targets.push({
            role: row.role as any,
            userId: row.userId,
            workspaceId: userWorkspaceId,
            email: u?.email || undefined,
          });
        }
      }
    }
  } catch (error) {
    log.error('[TrinityAutonomousOps] Error getting support role targets:', error);
  }

  return targets;
}

// ============================================================================
// TRINITY AUTONOMOUS OPS CLASS
// ============================================================================

class TrinityAutonomousOps {
  private static instance: TrinityAutonomousOps;
  private isRunning = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private maintenanceInterval: NodeJS.Timeout | null = null;

  // Mutex flags to prevent overlapping operations
  private isScanRunning = false;
  private isMaintenanceRunning = false;

  private lastScan: Date | null = null;
  private scanCount = 0;
  private actionsExecuted = 0;
  private issuesDetected = 0;
  private issuesResolved = 0;
  private escalationsTriggered = 0;
  private startTime: Date = new Date();

  private recentActions: AutonomousAction[] = [];
  private recentAnomalies: AnomalyReport[] = [];
  private readonly MAX_RECENT_ITEMS = 100;

  private readonly HEALTH_SCAN_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAINTENANCE_INTERVAL = 60 * 60 * 1000; // 1 hour

  private constructor() {
    log.info('[TrinityAutonomousOps] Initializing autonomous operations service...');
  }

  // ============================================================================
  // PORT CONFLICT DETECTION & SELF-HEALING
  // ============================================================================

  async checkPortHealth(port: number = 5000): Promise<{ healthy: boolean; issue?: string; processes?: string[] }> {
    try {
      const { execSync } = await import('child_process');
      
      // Check how many processes are bound to the port
      let lsofOutput = '';
      try {
        lsofOutput = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: 'utf8' });
      } catch (e) {
        // No processes on port - that's fine
      }
      
      const pids = lsofOutput.trim().split('\n').filter(Boolean);
      
      if (pids.length === 0) {
        // No process on port - could indicate the server isn't running
        return { healthy: true };
      }
      
      if (pids.length > 1) {
        // Multiple processes on same port - this is a conflict!
        log.warn(`[TrinityAutonomousOps] PORT CONFLICT DETECTED: ${pids.length} processes on port ${port}`);
        
        // Log this as a critical issue
        const action: AutonomousAction = {
          id: crypto.randomUUID(),
          type: 'anomaly_detection',
          severity: 'critical',
          title: 'Port Conflict Detected',
          description: `Multiple processes (${pids.length}) detected on port ${port}. PIDs: ${pids.join(', ')}`,
          targetComponent: 'network',
          initiatedAt: new Date(),
          completedAt: new Date(),
          success: true,
          result: `Detected ${pids.length} conflicting processes`,
          metrics: { processCount: pids.length, port },
          requiresHumanReview: true,
        };
        
        this.recordAction(action);
        
        return {
          healthy: false,
          issue: `Port ${port} has ${pids.length} processes bound (conflict)`,
          processes: pids,
        };
      }
      
      // Single process - healthy
      return { healthy: true };
    } catch (error) {
      log.error('[TrinityAutonomousOps] Port health check error:', error);
      return { healthy: true }; // Assume healthy on error to prevent false alarms
    }
  }

  async resolvePortConflict(port: number = 5000): Promise<boolean> {
    log.info(`[TrinityAutonomousOps] Attempting to resolve port ${port} conflict...`);
    
    try {
      const { execSync } = await import('child_process');
      const currentPid = process.pid.toString();
      
      // Get all PIDs on the port
      let lsofOutput = '';
      try {
        lsofOutput = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: 'utf8' });
      } catch (e) { return true; }
      
      const pids = lsofOutput.trim().split('\n').filter(Boolean);
      
      // Kill all processes EXCEPT the current one
      for (const pid of pids) {
        if (pid !== currentPid) {
          try {
            execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: 'ignore' });
            log.info(`[TrinityAutonomousOps] Killed stale process PID ${pid}`);
          } catch (e) { /* ignore */ }
        }
      }
      
      // Log the self-healing action
      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        type: 'self_healing',
        severity: 'urgent',
        title: 'Port Conflict Resolved',
        description: `Terminated ${pids.length - 1} stale processes on port ${port}`,
        targetComponent: 'network',
        initiatedAt: new Date(),
        completedAt: new Date(),
        success: true,
        result: `Killed PIDs: ${pids.filter(p => p !== currentPid).join(', ')}`,
        metrics: { killedCount: pids.length - 1, port },
        requiresHumanReview: false,
      };
      
      this.recordAction(action);
      this.issuesResolved++;
      
      // Publish canonical event for audit trail (uses publish() so subscribe() handlers fire)
      platformEventBus.publish({
        type: 'trinity_issue_detected',
        workspaceId: PLATFORM_WORKSPACE_ID,
        title: 'Trinity self-healed port conflict',
        description: `Self-healed port ${port} conflict by terminating stale processes`,
        metadata: {
          userId: 'trinity-system',
          killedPids: pids.filter(p => p !== currentPid),
          port,
          timestamp: new Date().toISOString(),
        },
      }).catch((err) => log.warn('[trinityAutonomousOps] Fire-and-forget failed:', err));
      
      return true;
    } catch (error) {
      log.error('[TrinityAutonomousOps] Port conflict resolution failed:', error);
      return false;
    }
  }

  static getInstance(): TrinityAutonomousOps {
    if (!TrinityAutonomousOps.instance) {
      TrinityAutonomousOps.instance = new TrinityAutonomousOps();
    }
    return TrinityAutonomousOps.instance;
  }

  // ============================================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isRunning) return;

    log.info('[TrinityAutonomousOps] Starting autonomous operations...');

    this.subscribeToEvents();

    this.startHealthScanning();
    this.startMaintenanceCycles();

    await this.runInitialHealthScan();

    this.isRunning = true;
    this.startTime = new Date();

    await this.logAuditEvent('autonomous_ops_started', {
      healthScanInterval: this.HEALTH_SCAN_INTERVAL,
      maintenanceInterval: this.MAINTENANCE_INTERVAL,
    });

    log.info('[TrinityAutonomousOps] Autonomous operations active');
  }

  async shutdown(): Promise<void> {
    log.info('[TrinityAutonomousOps] Shutting down autonomous operations...');

    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.maintenanceInterval) clearInterval(this.maintenanceInterval);

    this.isRunning = false;

    await this.logAuditEvent('autonomous_ops_stopped', {
      scanCount: this.scanCount,
      actionsExecuted: this.actionsExecuted,
      uptime: Date.now() - this.startTime.getTime(),
    });

    log.info('[TrinityAutonomousOps] Autonomous operations stopped');
  }

  // ============================================================================
  // EVENT SUBSCRIPTIONS
  // ============================================================================

  private subscribeToEvents(): void {
    // Explicit event types instead of wildcard to avoid processing every event
    for (const eventType of ['ai_error', 'system_maintenance'] as const) {
      platformEventBus.subscribe(eventType, {
        name: `TrinityAutonomousOps:${eventType}`,
        handler: async (event) => {
          await this.handleCriticalEvent(event);
        },
      });
    }

    // Trinity's Security Brain — listens to real-time intrusion detection events
    // emitted by trinityGuardMiddleware via the lightweight internal event bus.
    // These are NOT persisted DB events — they fire on every detected threat immediately.
    platformEventBus.on('security_threat_detected', (payload: any) => {
      this.handleSecurityThreat(payload);
    });

    platformEventBus.on('security_blocked_ip_access', (payload: any) => {
      log.warn(`[TrinityAutonomousOps] BLOCKED IP attempted access: ${payload.ip} → ${payload.method} ${payload.path}`);
    });

    log.info('[TrinityAutonomousOps] Subscribed to platform events + security threat stream');
  }

  private handleSecurityThreat(payload: {
    ip: string;
    path: string;
    method: string;
    threats: Array<{ type: string; severity: string; location: string }>;
    isCritical: boolean;
    timestamp: string;
  }): void {
    const { ip, path, method, threats, isCritical } = payload;
    const primaryThreat = threats[0];

    // Record as a platform anomaly so Trinity's anomaly tracking system captures it
    const anomaly: AnomalyReport = {
      id: crypto.randomUUID(),
      type: 'error_spike',
      component: `Security:${path}`,
      severity: isCritical ? 'critical' : 'warning',
      description: `Security threat detected: ${primaryThreat?.type} (${primaryThreat?.severity}) at ${method} ${path} from IP ${ip}. Total detectors triggered: ${threats.length}.`,
      metrics: {
        threatCount: threats.length,
        criticalCount: threats.filter(t => t.severity === 'critical').length,
        highCount: threats.filter(t => t.severity === 'high').length,
        isCritical: isCritical ? 1 : 0,
      },
      detectedAt: new Date(),
    };

    this.recordAnomaly(anomaly);

    if (isCritical) {
      log.error(`[TrinityAutonomousOps] CRITICAL security threat — IP auto-blocked: ${ip} at ${path}`);
      // For critical threats, escalate to platform admins
      this.escalateToSupport(
        'critical',
        `Critical Security Threat Auto-Blocked`,
        `Trinity detected and blocked a critical attack from IP ${ip} at ${method} ${path}. Primary threat type: ${primaryThreat?.type}. The IP has been automatically blocked for 24 hours.`,
        undefined
      ).catch((err) => log.warn('[trinityAutonomousOps] Fire-and-forget failed:', err));
    } else {
      log.warn(`[TrinityAutonomousOps] Security threat logged: ${primaryThreat?.type} from ${ip} at ${path}`);
    }
  }

  private async handleCriticalEvent(event: any): Promise<void> {
    const anomaly: AnomalyReport = {
      id: crypto.randomUUID(),
      type: 'error_spike',
      component: event.metadata?.component || 'unknown',
      severity: 'error',
      description: event.description || 'Critical platform event detected',
      metrics: event.metadata || {},
      detectedAt: new Date(),
    };

    this.recordAnomaly(anomaly);

    if (event.type === 'ai_error') {
      await this.escalateToSupport(
        'critical',
        'AI Brain Error Detected',
        `Critical error in AI Brain: ${event.description}`,
        event.workspaceId
      );
    }
  }

  // ============================================================================
  // HEALTH SCANNING
  // ============================================================================

  private startHealthScanning(): void {
    this.scanInterval = setInterval(async () => {
      try {
        await this.runHealthScan();
      } catch (error: any) {
        log.warn('[TrinityAutonomousOps] Health scan failed (will retry):', error?.message || 'unknown');
      }
    }, this.HEALTH_SCAN_INTERVAL);
  }

  private async runInitialHealthScan(): Promise<void> {
    log.info('[TrinityAutonomousOps] Running initial health scan...');
    await this.runHealthScan();
  }

  async runHealthScan(): Promise<HealthScanResult> {
    // Prevent overlapping scans
    if (this.isScanRunning) {
      log.info('[TrinityAutonomousOps] Health scan already in progress, skipping');
      return {
        scanId: 'skipped',
        timestamp: new Date(),
        overallHealth: 'healthy',
        healthScore: 100,
        servicesChecked: 0,
        issuesDetected: 0,
        criticalIssues: 0,
        anomaliesDetected: [],
        actions: [],
      };
    }

    this.isScanRunning = true;
    const scanId = crypto.randomUUID();
    const startTime = Date.now();

    log.info(`[TrinityAutonomousOps] Starting health scan ${scanId}`);

    const actions: AutonomousAction[] = [];
    const anomalies: AnomalyReport[] = [];

    let healthSummary: PlatformHealthSummary | null = null;
    try {
      healthSummary = await platformHealthMonitor.runHealthCheck();
    } catch (error) {
      log.error('[TrinityAutonomousOps] Health check failed:', error);
    }

    let sentinelAlerts: SentinelAlert[] = [];
    try {
      const sentinelStatus = trinitySentinel.getStatus();
      sentinelAlerts = trinitySentinel.getAlerts(false).slice(0, 10);
    } catch (error) {
      log.error('[TrinityAutonomousOps] Sentinel check failed:', error);
    }

    const connectorDiagnostics = trinityPlatformConnector.getDiagnostics();

    // Check for port conflicts and auto-resolve if detected
    const portHealth = await this.checkPortHealth(5000);
    if (!portHealth.healthy) {
      log.warn('[TrinityAutonomousOps] Port conflict detected during health scan');
      anomalies.push({
        id: crypto.randomUUID(),
        type: 'resource_exhaustion',
        component: 'network',
        severity: 'critical',
        description: portHealth.issue || 'Port 5000 conflict detected',
        metrics: { processCount: portHealth.processes?.length || 0 },
        detectedAt: new Date(),
      });
      
      // Attempt self-healing
      const resolved = await this.resolvePortConflict(5000);
      if (resolved) {
        log.info('[TrinityAutonomousOps] Port conflict self-healed successfully');
      }
    }

    const overallHealth = this.calculateOverallHealth(healthSummary, sentinelAlerts);
    const healthScore = this.calculateHealthScore(healthSummary, sentinelAlerts, connectorDiagnostics);


    let issuesCount = 0;
    let criticalCount = 0;

    if (healthSummary?.activeIssues) {
      for (const issue of healthSummary.activeIssues) {
        issuesCount++;
        if (issue.severity === 'critical' || issue.severity === 'high') {
          criticalCount++;
        }

        anomalies.push({
          id: issue.id,
          type: 'pattern_deviation',
          component: issue.category,
          severity: issue.severity === 'critical' ? 'critical' : 
                   issue.severity === 'high' ? 'error' :
                   issue.severity === 'medium' ? 'warning' : 'info',
          description: issue.description,
          metrics: {},
          detectedAt: issue.detectedAt,
        });
      }
    }

    for (const alert of sentinelAlerts) {
      if (alert.severity === 'critical' || alert.severity === 'error') {
        issuesCount++;
        if (alert.severity === 'critical') criticalCount++;

        anomalies.push({
          id: alert.id,
          type: 'error_spike',
          component: alert.affectedComponent,
          severity: alert.severity,
          description: alert.message,
          metrics: alert.metadata || {},
          detectedAt: alert.detectedAt,
        });
      }
    }

    const scanAction: AutonomousAction = {
      id: crypto.randomUUID(),
      type: 'health_scan',
      severity: 'routine',
      title: 'Periodic Health Scan',
      description: `Completed health scan: ${issuesCount} issues detected, health score: ${healthScore}%`,
      initiatedAt: new Date(startTime),
      completedAt: new Date(),
      success: true,
      result: `Health: ${overallHealth}, Score: ${healthScore}%`,
      metrics: {
        duration: Date.now() - startTime,
        issuesDetected: issuesCount,
        criticalIssues: criticalCount,
        healthScore,
      },
      requiresHumanReview: criticalCount > 0,
    };

    actions.push(scanAction);
    this.recordAction(scanAction);

    for (const anomaly of anomalies) {
      this.recordAnomaly(anomaly);
    }

    if (overallHealth === 'critical' || criticalCount > 0) {
      await this.escalateToSupport(
        'critical',
        'Platform Health Critical',
        `Health scan detected ${criticalCount} critical issues. Immediate attention required. Health score: ${healthScore}%`,
        undefined
      );
    } else if (overallHealth === 'degraded' && healthScore < 70) {
      await this.escalateToSupport(
        'attention',
        'Platform Health Degraded',
        `Health scan detected ${issuesCount} issues. Health score: ${healthScore}%`,
        undefined
      );
    }

    this.scanCount++;
    this.lastScan = new Date();
    this.issuesDetected += issuesCount;

    const result: HealthScanResult = {
      scanId,
      timestamp: new Date(),
      overallHealth,
      healthScore,
      servicesChecked: connectorDiagnostics.totalDomains || 15,
      issuesDetected: issuesCount,
      criticalIssues: criticalCount,
      anomaliesDetected: anomalies,
      actions,
    };

    log.info(`[TrinityAutonomousOps] Health scan complete: ${overallHealth}, score: ${healthScore}%`);

    this.isScanRunning = false;
    return result;
  }

  private calculateOverallHealth(
    healthSummary: PlatformHealthSummary | null,
    alerts: SentinelAlert[]
  ): 'healthy' | 'degraded' | 'critical' {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.resolvedAt);
    const errorAlerts = alerts.filter(a => a.severity === 'error' && !a.resolvedAt);

    if (criticalAlerts.length > 0 || healthSummary?.overallStatus === 'critical') {
      return 'critical';
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (errorAlerts.length >= 3 || healthSummary?.overallStatus === 'critical') {
      return 'degraded';
    }
    return 'healthy';
  }

  private calculateHealthScore(
    healthSummary: PlatformHealthSummary | null,
    alerts: SentinelAlert[],
    connectorDiagnostics: Record<string, any>
  ): number {
    let score = 100;

    const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.resolvedAt).length;
    const errorCount = alerts.filter(a => a.severity === 'error' && !a.resolvedAt).length;

    score -= criticalCount * 20;
    score -= errorCount * 10;

    if (healthSummary?.overallStatus === 'critical') score -= 20;

    const unhealthyDomains = connectorDiagnostics.unhealthyDomains || 0;
    score -= unhealthyDomains * 5;

    score = Math.max(0, Math.min(100, score));

    return score;
  }

  // ============================================================================
  // MAINTENANCE OPERATIONS
  // ============================================================================

  private startMaintenanceCycles(): void {
    this.maintenanceInterval = setInterval(async () => {
      try {
        await this.runMaintenanceCycle();
      } catch (error: any) {
        log.warn('[TrinityAutonomousOps] Maintenance cycle failed (will retry):', error?.message || 'unknown');
      }
    }, this.MAINTENANCE_INTERVAL);
  }

  async runMaintenanceCycle(): Promise<AutonomousAction[]> {
    // Prevent overlapping maintenance cycles
    if (this.isMaintenanceRunning) {
      log.info('[TrinityAutonomousOps] Maintenance cycle already in progress, skipping');
      return [];
    }

    this.isMaintenanceRunning = true;
    log.info('[TrinityAutonomousOps] Running maintenance cycle...');
    const actions: AutonomousAction[] = [];

    const cacheCleanup = await this.performCacheCleanup();
    if (cacheCleanup) actions.push(cacheCleanup);

    const sessionCleanup = await this.performSessionCleanup();
    if (sessionCleanup) actions.push(sessionCleanup);

    const notificationCleanup = await this.performNotificationCleanup();
    if (notificationCleanup) actions.push(notificationCleanup);

    const orgLearning = await this.performOrgIntelligenceLearning();
    if (orgLearning) actions.push(orgLearning);

    const proactiveSuggestions = await this.performProactiveSuggestions();
    if (proactiveSuggestions) actions.push(proactiveSuggestions);

    const patternDecay = await this.performPatternDecay();
    if (patternDecay) actions.push(patternDecay);

    log.info(`[TrinityAutonomousOps] Maintenance cycle complete: ${actions.length} actions`);
    this.isMaintenanceRunning = false;
    return actions;
  }

  private async performCacheCleanup(): Promise<AutonomousAction | null> {
    const startTime = Date.now();
    
    try {
      let itemsCleared = 0;
      try {
        const { cacheManager } = await import('../platform/cacheManager');
        const metricsBefore = cacheManager.getMetrics();
        const totalBefore = Object.values(metricsBefore.sizes).reduce((a: number, b: number) => a + b, 0);
        cacheManager.clearAll();
        const metricsAfter = cacheManager.getMetrics();
        const totalAfter = Object.values(metricsAfter.sizes).reduce((a: number, b: number) => a + b, 0);
        itemsCleared = Math.max(0, totalBefore - totalAfter);
      } catch {
        itemsCleared = 0;
      }

      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        type: 'cache_cleanup',
        severity: 'routine',
        title: 'Cache Cleanup',
        description: `Cleared ${itemsCleared} expired cache entries`,
        initiatedAt: new Date(startTime),
        completedAt: new Date(),
        success: true,
        result: `Cache cleaned: ${itemsCleared} items cleared`,
        metrics: { duration: Date.now() - startTime, itemsCleared },
        requiresHumanReview: false,
      };

      this.recordAction(action);
      this.actionsExecuted++;
      
      return action;
    } catch (error) {
      log.error('[TrinityAutonomousOps] Cache cleanup failed:', error);
      return null;
    }
  }

  private async performSessionCleanup(): Promise<AutonomousAction | null> {
    const startTime = Date.now();
    
    try {
      // Check if sessions table exists before trying to clean
      // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
      const tableExists = await typedExists(
        sql`SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'sessions'
        )`
      );
      
      // Sessions table managed by express-session with connect-pg-simple
      // Skip if not configured
      if (!tableExists) {
        return null;
      }
      
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      await db.delete(sessions).where(sql`${sessions.expire} < ${thirtyDaysAgo}`);

      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        type: 'session_cleanup',
        severity: 'routine',
        title: 'Session Cleanup',
        description: 'Removed expired sessions from database',
        initiatedAt: new Date(startTime),
        completedAt: new Date(),
        success: true,
        result: 'Expired sessions cleaned',
        metrics: { duration: Date.now() - startTime },
        requiresHumanReview: false,
      };

      this.recordAction(action);
      this.actionsExecuted++;
      
      return action;
    } catch (error) {
      // Session table might not exist if using memory store - this is fine
      log.info('[TrinityAutonomousOps] Session cleanup skipped (table may not exist)');
      return null;
    }
  }

  private async performNotificationCleanup(): Promise<AutonomousAction | null> {
    const startTime = Date.now();
    
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const result = await db
        .update(notifications)
        .set({ clearedAt: new Date() })
        .where(
          and(
            eq(notifications.isRead, true),
            lte(notifications.createdAt, thirtyDaysAgo)
          )
        );

      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        type: 'notification_cleanup',
        severity: 'routine',
        title: 'Notification Cleanup',
        description: 'Cleared old read notifications',
        initiatedAt: new Date(startTime),
        completedAt: new Date(),
        success: true,
        result: 'Old notifications cleaned',
        metrics: { duration: Date.now() - startTime },
        requiresHumanReview: false,
      };

      this.recordAction(action);
      this.actionsExecuted++;
      
      return action;
    } catch (error) {
      log.error('[TrinityAutonomousOps] Notification cleanup failed:', error);
      return null;
    }
  }

  private async performOrgIntelligenceLearning(): Promise<AutonomousAction | null> {
    const startTime = Date.now();

    try {
      const allWorkspaces = await db
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .limit(50);

      let patternsLearned = 0;
      let employeeHabitsLearned = 0;
      let managementPatternsLearned = 0;
      let reportInsightsLearned = 0;
      let conversationLearningsFound = 0;

      for (const ws of allWorkspaces) {
        try {
          const patterns = await trinityOrgIntelligenceService.learnOrgPatterns(ws.id);
          patternsLearned += patterns.length;

          employeeHabitsLearned += patterns.filter(p => p.patternType === 'employee_habit').length;
          managementPatternsLearned += patterns.filter(p => p.patternType === 'management_preference').length;
          reportInsightsLearned += patterns.filter(p => p.patternType === 'report_insight').length;
          conversationLearningsFound += patterns.filter(p => p.patternType === 'conversation_learning').length;
        } catch (err: any) {
          log.warn(`[TrinityAutonomousOps] Org learning failed for workspace ${ws.id}:`, err?.message);
        }
      }

      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        type: 'anomaly_detection',
        severity: 'routine',
        title: 'Org Intelligence Learning',
        description: `Learned patterns across ${allWorkspaces.length} workspaces (${patternsLearned} patterns total: ${employeeHabitsLearned} employee habits, ${managementPatternsLearned} management patterns, ${reportInsightsLearned} report insights, ${conversationLearningsFound} conversation learnings)`,
        initiatedAt: new Date(startTime),
        completedAt: new Date(),
        success: true,
        result: `Proactive org learning complete: ${patternsLearned} patterns across ${allWorkspaces.length} workspaces`,
        metrics: {
          duration: Date.now() - startTime,
          workspacesScanned: allWorkspaces.length,
          patternsLearned,
          employeeHabitsLearned,
          managementPatternsLearned,
          reportInsightsLearned,
          conversationLearningsFound,
        },
        requiresHumanReview: false,
      };

      this.recordAction(action);
      this.actionsExecuted++;
      log.info(`[TrinityAutonomousOps] Org intelligence learning: ${patternsLearned} patterns from ${allWorkspaces.length} workspaces (${employeeHabitsLearned} habits, ${managementPatternsLearned} mgmt, ${reportInsightsLearned} reports, ${conversationLearningsFound} convos) (${Date.now() - startTime}ms)`);

      return action;
    } catch (error) {
      log.error('[TrinityAutonomousOps] Org intelligence learning failed:', error);
      return null;
    }
  }

  private async performPatternDecay(): Promise<AutonomousAction | null> {
    const startTime = Date.now();

    try {
      const allWorkspaces = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .limit(50);

      let totalDecayed = 0;
      for (const ws of allWorkspaces) {
        try {
          const decayed = trinityOrgIntelligenceService.applyPatternDecay(ws.id);
          totalDecayed += decayed;
        } catch (err: any) {
          log.warn(`[TrinityAutonomousOps] Pattern decay failed for workspace ${ws.id}:`, err?.message);
        }
      }

      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        type: 'database_optimization',
        severity: 'routine',
        title: 'Pattern Confidence Decay',
        description: `Applied confidence decay to ${totalDecayed} stale patterns across ${allWorkspaces.length} workspaces`,
        initiatedAt: new Date(startTime),
        completedAt: new Date(),
        success: true,
        result: `Decayed ${totalDecayed} patterns across ${allWorkspaces.length} workspaces`,
        metrics: { duration: Date.now() - startTime, workspacesProcessed: allWorkspaces.length, patternsDecayed: totalDecayed },
        requiresHumanReview: false,
      };

      this.recordAction(action);
      this.actionsExecuted++;
      log.info(`[TrinityAutonomousOps] Pattern decay: ${totalDecayed} patterns decayed across ${allWorkspaces.length} workspaces (${Date.now() - startTime}ms)`);

      return action;
    } catch (error) {
      log.error('[TrinityAutonomousOps] Pattern decay failed:', error);
      return null;
    }
  }

  private async performProactiveSuggestions(): Promise<AutonomousAction | null> {
    const startTime = Date.now();

    try {
      const allWorkspaces = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .limit(50);

      let totalSuggestions = 0;
      for (const ws of allWorkspaces) {
        try {
          const suggestions = trinityOrgIntelligenceService.generateImprovementSuggestions(ws.id);
          totalSuggestions += suggestions.length;
        } catch (err: any) {
          log.warn(`[TrinityAutonomousOps] Proactive suggestions failed for workspace ${ws.id}:`, err?.message);
        }
      }

      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        type: 'report_generation',
        severity: 'routine',
        title: 'Proactive Improvement Suggestions',
        description: `Generated ${totalSuggestions} new improvement suggestions across ${allWorkspaces.length} workspaces`,
        initiatedAt: new Date(startTime),
        completedAt: new Date(),
        success: true,
        result: `${totalSuggestions} new suggestions queued for management conversations`,
        metrics: { duration: Date.now() - startTime, workspacesProcessed: allWorkspaces.length, suggestionsGenerated: totalSuggestions },
        requiresHumanReview: false,
      };

      this.recordAction(action);
      this.actionsExecuted++;
      log.info(`[TrinityAutonomousOps] Proactive suggestions: ${totalSuggestions} new suggestions across ${allWorkspaces.length} workspaces (${Date.now() - startTime}ms)`);

      return action;
    } catch (error) {
      log.error('[TrinityAutonomousOps] Proactive suggestions failed:', error);
      return null;
    }
  }

  // ============================================================================
  // SUPPORT ROLE NOTIFICATIONS
  // ============================================================================

  async escalateToSupport(
    severity: ActionSeverity,
    title: string,
    message: string,
    workspaceId?: string
  ): Promise<void> {
    log.info(`[TrinityAutonomousOps] Escalating to support: ${title}`);

    const targets = await getSupportRoleTargets(severity, workspaceId);

    for (const target of targets) {
      try {
        await createNotification({
          workspaceId: target.workspaceId,
          userId: target.userId,
          type: 'trinity_autonomous_alert',
          title: `[Trinity Alert] ${title}`,
          message,
          actionUrl: '/system-health',
          relatedEntityType: 'autonomous_ops',
          relatedEntityId: crypto.randomUUID(),
          metadata: {
            severity,
            isTrinityAutonomous: true,
            escalatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        log.error(`[TrinityAutonomousOps] Failed to notify ${target.userId}:`, error);
      }
    }

    try {
      broadcastToAllClients({
        type: 'trinity_autonomous_alert',
        payload: {
          severity,
          title,
          message,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      log.error('[TrinityAutonomousOps] WebSocket broadcast failed:', error);
    }

    const escalationAction: AutonomousAction = {
      id: crypto.randomUUID(),
      type: 'escalation',
      severity,
      title: 'Support Escalation',
      description: `Escalated: ${title}`,
      initiatedAt: new Date(),
      completedAt: new Date(),
      success: true,
      result: `Notified ${targets.length} support personnel`,
      escalatedTo: targets.map(t => t.userId),
      requiresHumanReview: true,
    };

    this.recordAction(escalationAction);
    this.escalationsTriggered++;

    await this.logAuditEvent('support_escalation', {
      severity,
      title,
      message,
      targetCount: targets.length,
      workspaceId,
    });
  }

  // ============================================================================
  // AUDIT LOGGING
  // ============================================================================

  private async logAuditEvent(
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        action: `trinity_autonomous:${action}`,
        entityType: 'autonomous_ops',
        entityId: 'trinity_autonomous_ops',
        workspaceId: PLATFORM_WORKSPACE_ID,
        metadata: details,
        ipAddress: 'system-internal',
        userAgent: 'TrinityAutonomousOps/1.0',
        createdAt: new Date(),
      });
    } catch (error) {
      log.error('[TrinityAutonomousOps] Audit log failed:', error);
    }
  }

  // ============================================================================
  // RECORD KEEPING
  // ============================================================================

  private recordAction(action: AutonomousAction): void {
    this.recentActions.unshift(action);
    if (this.recentActions.length > this.MAX_RECENT_ITEMS) {
      this.recentActions = this.recentActions.slice(0, this.MAX_RECENT_ITEMS);
    }
  }

  private recordAnomaly(anomaly: AnomalyReport): void {
    this.recentAnomalies.unshift(anomaly);
    if (this.recentAnomalies.length > this.MAX_RECENT_ITEMS) {
      this.recentAnomalies = this.recentAnomalies.slice(0, this.MAX_RECENT_ITEMS);
    }
  }

  // ============================================================================
  // STATUS & DIAGNOSTICS
  // ============================================================================

  getStatus(): OperationalStatus {
    return {
      isRunning: this.isRunning,
      lastScan: this.lastScan,
      scanCount: this.scanCount,
      actionsExecuted: this.actionsExecuted,
      issuesDetected: this.issuesDetected,
      issuesResolved: this.issuesResolved,
      escalationsTriggered: this.escalationsTriggered,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  getRecentActions(limit: number = 20): AutonomousAction[] {
    return this.recentActions.slice(0, limit);
  }

  getRecentAnomalies(limit: number = 20): AnomalyReport[] {
    return this.recentAnomalies.slice(0, limit);
  }

  getDiagnostics(): Record<string, any> {
    const status = this.getStatus();
    return {
      ...status,
      recentActionsCount: this.recentActions.length,
      recentAnomaliesCount: this.recentAnomalies.length,
      healthScanInterval: this.HEALTH_SCAN_INTERVAL,
      maintenanceInterval: this.MAINTENANCE_INTERVAL,
      lastActionTypes: this.recentActions.slice(0, 5).map(a => a.type),
    };
  }

  async triggerManualScan(): Promise<HealthScanResult> {
    log.info('[TrinityAutonomousOps] Manual health scan triggered');
    return this.runHealthScan();
  }

  async triggerManualMaintenance(): Promise<AutonomousAction[]> {
    log.info('[TrinityAutonomousOps] Manual maintenance cycle triggered');
    return this.runMaintenanceCycle();
  }
}

// Export singleton
export const trinityAutonomousOps = TrinityAutonomousOps.getInstance();

// Export initialization function for server startup
export async function initializeTrinityAutonomousOps(): Promise<void> {
  await trinityAutonomousOps.initialize();
}
