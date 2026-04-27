import { createLogger } from '../../lib/logger';
const log = createLogger('scheduleLiveNotifierActions');

/**
 * Schedule Live Notifier Actions
 *
 * Scheduling notification action IDs are no longer registered here.
 * Shift lifecycle notifications are handled by the canonical scheduleLiveNotifier
 * event-bus subscribers and the shared notification domain, not by duplicate
 * Trinity action IDs.
 *
 * This registrar remains as a startup-compatible no-op while the master
 * orchestrator import path is phased out. Do not add scheduling.notify_* actions
 * here; route new notification behavior through the canonical notification/event
 * pipeline instead.
 */

export function registerScheduleLiveNotifierActions(): void {
  log.info('[ScheduleLiveNotifier] No action IDs registered; scheduling notifications use canonical event subscribers.');
}
