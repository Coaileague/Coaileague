/**
 * Episodic Memory Listeners — Wave 6 / Task 3 (G-4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Wires platformEventBus override events → aiLearningEvents table.
 *
 * When a human manager overrides Trinity's recommendation, this listener
 * captures the delta and writes it to aiLearningEvents so Trinity can
 * learn from patterns of disagreement across sessions.
 *
 * Events captured:
 *   schedule_override            — manager published a different schedule
 *   shift_reassigned             — guard A was swapped for guard B post-Trinity suggestion
 *   trinity_recommendation_rejected — explicit rejection of a Trinity action
 *
 * NEVER modifies aiLearningEvents schema — writes only via db.insert().
 */

import { db } from '../../db';
import { aiLearningEvents } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';

const log = createLogger('episodicMemoryListeners');

interface OverrideEventPayload {
  workspaceId?: string;
  managerId?: string;
  userId?: string;
  trinityAction?: string;
  trinityRecommendation?: string;
  originalValue?: unknown;
  overrideValue?: unknown;
  reason?: string;
  entityType?: string;
  entityId?: string;
  [key: string]: unknown;
}

async function recordOverride(
  eventType: string,
  payload: OverrideEventPayload,
): Promise<void> {
  const workspaceId = payload.workspaceId;
  if (!workspaceId) return;

  try {
    await db.insert(aiLearningEvents).values({
      eventType: 'human_override',
      agentId: 'trinity',
      action: payload.trinityAction || payload.trinityRecommendation || `trinity.${eventType}`,
      actionType: eventType,
      domain: payload.entityType || 'scheduling',
      workspaceId,
      outcome: 'overridden_by_human',
      reward: '-0.5',   // Negative signal: Trinity's recommendation was rejected
      confidenceLevel: 0.5,
      humanIntervention: true,
      data: {
        eventName: eventType,
        original: payload.originalValue ?? null,
        override: payload.overrideValue ?? null,
        reason: payload.reason ?? null,
        managerId: payload.managerId || payload.userId || null,
        entityId: payload.entityId ?? null,
        entityType: payload.entityType ?? null,
        rawPayload: payload,
        capturedAt: new Date().toISOString(),
      },
    });

    log.info('[EpisodicMemory] Override recorded', {
      eventType,
      workspaceId,
      action: payload.trinityAction || eventType,
    });
  } catch (err: unknown) {
    // Non-fatal — never block the override for a learning write failure
    log.warn('[EpisodicMemory] Failed to write override event (non-fatal):', err instanceof Error ? err.message : String(err));
  }
}

/**
 * registerEpisodicMemoryListeners
 * Called once at server startup (in routes.ts).
 * Registers three override event listeners on the platform event bus.
 */
export function registerEpisodicMemoryListeners(): void {
  // ── schedule_override ─────────────────────────────────────────────────────
  // Fired when a manager publishes a different schedule than what Trinity drafted.
  platformEventBus.on('schedule_override', (payload: unknown) => {
    const p = payload as OverrideEventPayload;
    recordOverride('schedule_override', {
      ...p,
      trinityAction: p.trinityAction || 'schedule.publish',
      entityType: 'schedule',
    }).catch(() => null);
  });

  // ── shift_reassigned ──────────────────────────────────────────────────────
  // Fired when a guard is swapped out for another after Trinity's assignment.
  platformEventBus.on('shift_reassigned', (payload: unknown) => {
    const p = payload as OverrideEventPayload;
    recordOverride('shift_reassigned', {
      ...p,
      trinityAction: p.trinityAction || 'shift.assign',
      entityType: 'shift',
    }).catch(() => null);
  });

  // ── trinity_recommendation_rejected ──────────────────────────────────────
  // Fired when a manager explicitly rejects a Trinity AI recommendation.
  // Also used by the financial conscience approve/reject flow.
  platformEventBus.on('trinity_recommendation_rejected', (payload: unknown) => {
    const p = payload as OverrideEventPayload;
    recordOverride('trinity_recommendation_rejected', {
      ...p,
      trinityAction: p.trinityAction || 'trinity.recommendation',
      entityType: p.entityType || 'recommendation',
    }).catch(() => null);
  });

  log.info('[EpisodicMemory] Override listeners registered: schedule_override | shift_reassigned | trinity_recommendation_rejected');
}
