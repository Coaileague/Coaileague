import { createLogger } from '../../lib/logger';
const log = createLogger('scheduleLiveNotifierActions');

/**
 * Schedule Live Notifier Actions — PHASE 1 CONSOLIDATED
 *
 * The 6 scheduling.notify_* actions have been removed as part of Phase 1 consolidation.
 * They duplicated the notify.send_priority and notify.broadcast_message actions.
 *
 * Backward-compatible shims are registered in actionCompatibilityShims.ts so any
 * callers using the old action IDs (scheduling.notify_shift_created, etc.) continue
 * to work transparently via redirect to notify.send_priority.
 *
 * The underlying notification functions (onShiftCreated, onShiftUpdated, etc.) from
 * scheduleLiveNotifier still execute via platform event bus subscriptions — they are
 * NOT affected by this change.
 *
 * Removed actions (6):
 *   scheduling.notify_shift_created    → shim → notify.send_priority
 *   scheduling.notify_shift_updated    → shim → notify.send_priority
 *   scheduling.notify_shift_deleted    → shim → notify.send_priority
 *   scheduling.notify_schedule_published → shim → notify.send_priority
 *   scheduling.notify_shift_swap       → shim → notify.send_priority
 *   scheduling.notify_automation_change → shim → notify.send_priority
 */

export function registerScheduleLiveNotifierActions(): void {
  log.info(`[ScheduleLiveNotifier] 6 scheduling.notify_* actions consolidated → notify.send_priority (shims in actionCompatibilityShims.ts)`);
}
