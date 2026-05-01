/**
 * Platform Awareness Helper
 * =========================
 * Universal source-of-truth gateway for Trinity AI Brain awareness.
 *
 * THE CANONICAL METHOD is notifyTrinity() — use this for all platform state changes.
 * It:
 *   1. Writes to platformAwarenessEvents DB table (persistent, survives restarts)
 *   2. Emits to aiBrainEvents internal bus (real-time ControlConsole streaming)
 *   3. For critical resource types, triggers platformEventBus to queue a scan
 *
 * Legacy helpers (postDatabaseEventToAIBrain, postPlatformEvent, registerFeatureWithTrinity)
 * remain for backward-compat. They now internally delegate to notifyTrinity().
 *
 * Fire-and-forget pattern throughout — nothing here ever blocks the main request.
 */

import { aiBrainEvents } from './internalEventEmitter';
import { db } from '../../db';
import { platformAwarenessEvents } from '@shared/schema';
import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
const log = createLogger('platformAwarenessHelper');

export type DatabaseOperation = 'create' | 'update' | 'delete' | 'read';
export type EventSource = 'api' | 'scheduler' | 'automation' | 'user_action' | 'webhook' | 'migration' | 'trinity' | 'middleware';

// Resource types that warrant a Trinity platform-scan trigger when mutated
const SCAN_TRIGGER_RESOURCES = new Set([
  'employees', 'employee',
  'certifications', 'employee_certifications',
  'payroll', 'payroll_runs', 'payroll_entries',
  'compliance', 'compliance_expirations',
  'settings', 'workspace', 'workspaces',
  'subscriptions', 'org_subscriptions',
  'clients',
  'invoices',
]);

// Resource types that should NEVER be written to the awareness table (high-frequency noise)
const SKIP_AWARENESS_RESOURCES = new Set([
  'notifications', 'chat_messages', 'platform_awareness_events',
  'audit_logs', 'cron_run_log', 'trinity_requests',
  'subagent_telemetry', 'automation_action_ledger',
]);

/**
 * CANONICAL UNIVERSAL GATEWAY — the single method for all Trinity platform awareness.
 *
 * Fire-and-forget. Never blocks. Never throws to caller.
 *
 * @param workspaceId   The workspace the change belongs to (null = platform-wide)
 * @param resourceType  The resource/table being mutated (e.g. 'employees', 'shifts')
 * @param operation     The CRUD operation performed
 * @param source        Where the mutation originated
 * @param options       Optional: resourceId, metadata, and forceScanTrigger
 */
export function notifyTrinity(
  workspaceId: string | null,
  resourceType: string,
  operation: DatabaseOperation,
  source: EventSource = 'api',
  options?: {
    resourceId?: string;
    metadata?: Record<string, unknown>;
    forceScanTrigger?: boolean;
  }
): void {
  if (operation === 'read') return;
  if (SKIP_AWARENESS_RESOURCES.has(resourceType)) return;

  scheduleNonBlocking('platform-awareness.notify-trinity', async () => {
    try {
      const eventType = `${resourceType}_${operation}`;

      // 1. Emit to aiBrainEvents for real-time ControlConsole streaming
      aiBrainEvents.emit('database_event', {
        table: resourceType,
        operation,
        recordId: options?.resourceId,
        source,
        metadata: options?.metadata,
        workspaceId,
        timestamp: new Date().toISOString(),
        routedThroughTrinity: true,
      });

      // 2. Persist to platformAwarenessEvents DB table — the durable source of truth
      //    trinityScanOrchestrator reads this table for knowledge building
      await db.insert(platformAwarenessEvents).values({
        eventType,
        source,
        resourceType,
        resourceId: options?.resourceId ?? null,
        workspaceId: workspaceId ?? null,
        operation,
        routedThroughTrinity: true,
        processedByTrinity: false,
        metadata: options?.metadata ?? null,
      }).catch((err) => log.warn('[platformAwarenessHelper] Fire-and-forget failed:', err));

      // 3. For critical resources or forced triggers, queue an event-driven platform scan
      const shouldScan = options?.forceScanTrigger || SCAN_TRIGGER_RESOURCES.has(resourceType);
      if (shouldScan) {
        const { platformEventBus } = await import('../platformEventBus');
        platformEventBus.publish('fix_applied', {
          eventType,
          resourceType,
          workspaceId,
          source: 'trinity_awareness_gateway',
        } as any);
      }
    } catch {
      // Silent failure — never disrupt the main flow
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy helpers — all delegate to notifyTrinity() for full awareness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Post a database event to the AI Brain for platform awareness.
 * @deprecated Use notifyTrinity() directly for new code.
 */
export function postDatabaseEventToAIBrain(
  table: string,
  operation: DatabaseOperation,
  recordId: string,
  source: EventSource = 'api',
  metadata?: Record<string, unknown>
): void {
  notifyTrinity(null, table, operation, source, { resourceId: recordId, metadata });
}

/**
 * Post a batch of database events.
 */
export function postBatchDatabaseEvents(
  events: Array<{
    table: string;
    operation: DatabaseOperation;
    recordId: string;
    source?: EventSource;
    metadata?: Record<string, unknown>;
  }>
): void {
  events.forEach(event =>
    notifyTrinity(null, event.table, event.operation, event.source ?? 'api', {
      resourceId: event.recordId,
      metadata: event.metadata,
    })
  );
}

/**
 * Post a custom platform event.
 */
export function postPlatformEvent(
  eventType: string,
  resourceType: string,
  operation: DatabaseOperation,
  metadata?: Record<string, unknown>
): void {
  notifyTrinity(null, resourceType, operation, 'api', { metadata: { eventType, ...metadata } });
}

/**
 * Register a feature with Trinity's platform registry.
 */
export function registerFeatureWithTrinity(
  featureId: string,
  featureName: string,
  category: string,
  endpoints: string[]
): void {
  setImmediate(() => {
    try {
      aiBrainEvents.emit('feature_registered', {
        featureId,
        featureName,
        category,
        endpoints,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // silent
    }
  });
}

// Common table mappings for easy reference
export const TABLES = {
  EMPLOYEES: 'employees',
  SHIFTS: 'shifts',
  TIME_ENTRIES: 'time_entries',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  NOTIFICATIONS: 'notifications',
  USERS: 'users',
  WORKSPACES: 'workspaces',
  CLIENTS: 'clients',
  PAYROLL_RUNS: 'payroll_runs',
  CERTIFICATIONS: 'employee_certifications',
  AVAILABILITY: 'employee_availability',
  BREAKS: 'scheduled_breaks',
  DISPUTES: 'employee_disputes',
} as const;

export { aiBrainEvents };
