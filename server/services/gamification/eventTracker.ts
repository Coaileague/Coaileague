/**
 * Gamification Event Tracker — listens to platform events and awards points
 */
import { gamificationService } from './gamificationService';
import { createLogger } from '../../lib/logger';

const log = createLogger('GamificationEventTracker');

interface TrackedEvent {
  workspaceId: string;
  employeeId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}

export async function trackEvent(event: TrackedEvent): Promise<void> {
  const { workspaceId, employeeId, eventType } = event;
  if (!workspaceId || !employeeId) return;

  try {
    switch (eventType) {
      case 'clock_in':        await gamificationService.award(workspaceId, employeeId, 'CLOCK_IN'); break;
      case 'clock_out':       await gamificationService.award(workspaceId, employeeId, 'CLOCK_OUT'); break;
      case 'shift_accepted':  await gamificationService.award(workspaceId, employeeId, 'SHIFT_ACCEPTED'); break;
      case 'shift_completed': await gamificationService.award(workspaceId, employeeId, 'SHIFT_COMPLETED'); break;
      case 'calloff_covered': await gamificationService.award(workspaceId, employeeId, 'CALLOFF_COVERED'); break;
      case 'training_complete': await gamificationService.award(workspaceId, employeeId, 'TRAINING_COMPLETE'); break;
      case 'cert_renewed':    await gamificationService.award(workspaceId, employeeId, 'CERT_RENEWED'); break;
      default: log.debug(`[EventTracker] No points for event: ${eventType}`);
    }
  } catch (err: unknown) {
    log.warn(`[EventTracker] Failed to track ${eventType} for ${employeeId}: ${err?.message}`);
  }
}
