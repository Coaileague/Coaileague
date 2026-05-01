/**
 * SHARED TYPES FOR AI BRAIN MONITORING SYSTEM
 */

import type { AiContext, AiMonitoringTask, AiProactiveAlert } from '@shared/schema';

// ============================================================================
// MONITORING CONTEXT
// ============================================================================

export interface MonitoringContext {
  id: string;
  workspaceId: string | null;
  scope: 'global' | 'workspace';
  monitoringType: string;
  contextKey: string;
  entityType: string;
  entityId: string;
  contextData: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  refreshIntervalMinutes: number;
  lastRefreshedAt: Date | null;
  nextRefreshAt: Date | null;
  version: number;
}

export interface LoadContextParams {
  featureKey: string;
  workspaceId?: string | null;
  scope?: 'global' | 'workspace';
  entityType?: string;
  entityId?: string;
}

export interface UpsertContextParams {
  workspaceId?: string | null;
  scope?: 'global' | 'workspace';
  monitoringType: string;
  contextKey: string;
  entityType: string;
  entityId?: string;
  contextData: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  refreshIntervalMinutes?: number;
}

// ============================================================================
// MONITOR DEFINITIONS
// ============================================================================

export interface MonitorDefinition {
  id: string;
  name: string;
  monitoringType: string;
  scope: 'global' | 'workspace';
  targetEntityType: string;
  runIntervalMinutes: number;
  configuration: Record<string, unknown>;
  evaluator: MonitorEvaluator;
  escalationPolicy?: EscalationPolicy;
}

export interface MonitorEvaluator {
  (context: MonitoringContext, config: Record<string, unknown>): Promise<MonitorEvaluationResult>;
}

export interface MonitorEvaluationResult {
  status: 'pass' | 'fail' | 'warning';
  findings: MonitorFinding[];
  recommendedActions?: string[];
  metadata?: Record<string, unknown>;
}

export interface MonitorFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

export interface EscalationPolicy {
  lowSeverity: 'alert' | 'log' | 'ignore';
  mediumSeverity: 'alert' | 'log';
  highSeverity: 'alert';
  criticalSeverity: 'alert';
  retryAttempts?: number;
  retryIntervalMinutes?: number;
}

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

export interface CreateAlertPayload {
  workspaceId: string;
  taskId?: string | null;
  alertType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  payload: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;
  dedupeKey?: string; // For custom deduplication logic
}

export interface AlertLifecycleContext {
  alertId: string;
  workspaceId: string;
  status: 'queued' | 'dispatched' | 'acknowledged' | 'resolved';
  createdAt: Date;
  dispatchedAt?: Date | null;
  acknowledgedAt?: Date | null;
  resolvedAt?: Date | null;
}

export interface AlertAcknowledgment {
  alertId: string;
  userId: string;
  note?: string;
}

export interface AlertResolution {
  alertId: string;
  userId: string;
  resolutionNote: string;
}

// ============================================================================
// SCHEDULER
// ============================================================================

export interface ScheduledMonitor {
  taskId: string;
  monitoringType: string;
  workspaceId: string | null;
  scope: 'global' | 'workspace';
  targetEntityType: string;
  targetEntityId: string | null;
  configuration: Record<string, unknown>;
  nextRunAt: Date | null;
}

export interface MonitorExecutionContext {
  taskId: string;
  monitoringType: string;
  workspaceId: string | null;
  scope: 'global' | 'workspace';
  configuration: Record<string, unknown>;
  context?: MonitoringContext;
}
