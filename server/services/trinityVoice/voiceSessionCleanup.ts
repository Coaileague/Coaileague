import { db } from '../../db';
import { voiceCallSessions } from '@shared/schema/domains/voice';
import { and, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
import { withDistributedLock, LOCK_KEYS } from '../distributedLock';

const log = createLogger('VoiceSessionCleanup');

const ORPHAN_THRESHOLD_HOURS = 2;
const TERMINAL_STATUSES = ['completed', 'failed', 'orphaned'];

/**
 * Sweeps voice_call_sessions for sessions that started more than
 * ORPHAN_THRESHOLD_HOURS ago and never reached a terminal status.
 * This handles Twilio webhook delivery failures that leave sessions
 * stuck in 'initiated' or 'active' indefinitely.
 */
async function runCleanupCycle(): Promise<void> {
  const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_HOURS * 60 * 60 * 1000);

  const result = await db
    .update(voiceCallSessions)
    .set({
      status: 'orphaned',
      endedAt: new Date(),
    })
    .where(
      and(
        notInArray(voiceCallSessions.status, TERMINAL_STATUSES),
        lt(voiceCallSessions.startedAt, cutoff)
      )
    )
    .returning({ id: voiceCallSessions.id });

  if (result.length > 0) {
    log.warn('Marked orphaned voice sessions', {
      count: result.length,
      cutoffHours: ORPHAN_THRESHOLD_HOURS,
      ids: result.map((r) => r.id),
    });
  } else {
    log.debug('No orphaned voice sessions found');
  }
}

export function initializeVoiceSessionCleanup(): void {
  const runWithLock = async () => {
    try {
      await withDistributedLock(
        LOCK_KEYS.VOICE_SESSION_CLEANUP,
        'VoiceSessionCleanup',
        () => runCleanupCycle()
      );
    } catch (err: any) {
      log.error('Voice session cleanup failed', { error: err?.message });
    }
  };

  setTimeout(runWithLock, 60_000);
  setInterval(runWithLock, 24 * 60 * 60 * 1000);

  log.info('Voice session orphan cleanup initialized — daily sweep active');
}
