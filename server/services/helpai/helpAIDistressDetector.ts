/**
 * HELPAI DISTRESS DETECTOR
 * =========================
 * HelpAI notices before the officer asks for help.
 *
 * Three signal layers:
 *   1. Language signals — words/phrases that indicate fear, confusion, danger
 *   2. Context signals — late hour, remote site, isolation, prior distress history
 *   3. Behavioral delta — mismatch between stated sentiment and recent patterns
 *
 * When distress is detected:
 *   - HelpAI responds with warmth, offers the panic button explicitly
 *   - Supervisor is quietly notified (non-intrusive)
 *   - 5-minute follow-up check is queued if no response
 *   - Officer profile distress count increments
 *
 * We do NOT surveil — we care. The distinction:
 *   Surveillance: tracking everything to catch problems
 *   Care: noticing when someone might need help, and offering it
 */

import { createLogger } from '../../lib/logger';
import { appendWorkingMemory } from '../ai-brain/trinityEpisodicMemoryService';

const log = createLogger('HelpAIDistress');

export interface DistressAssessment {
  detected: boolean;
  level: 'none' | 'low' | 'moderate' | 'high' | 'critical';
  score: number;           // 0.0–1.0
  signals: string[];       // human-readable reasons
  recommendedResponse: string;
  shouldNotifySupervisor: boolean;
  shouldQueueFollowUp: boolean;
}

// ── Language signal patterns ──────────────────────────────────────────────────

const CRITICAL_SIGNALS = [
  /help me/i, /call 911/i, /emergency/i, /i'?m scared/i, /someone is here/i,
  /being followed/i, /not safe/i, /in danger/i, /threatening/i, /weapon/i,
  /please help/i, /send someone/i, /need backup/i, /suspicious person/i,
];

const HIGH_SIGNALS = [
  /doesn'?t feel right/i, /something'?s wrong/i, /worried/i, /scared/i,
  /uncomfortable/i, /nervous/i, /sketchy/i, /weird feeling/i, /uneasy/i,
  /feeling unsafe/i, /sketchy guy/i, /being watched/i, /i don'?t know/i,
  /no one here/i, /completely alone/i, /dark/i, /no lights/i,
];

const MODERATE_SIGNALS = [
  /stressed/i, /overwhelmed/i, /too much/i, /can'?t do this/i, /exhausted/i,
  /burned out/i, /done with this/i, /i quit/i, /this is too hard/i,
  /not okay/i, /having a hard time/i, /struggling/i, /falling apart/i,
];

const LOW_SIGNALS = [
  /tired/i, /frustrated/i, /annoyed/i, /confused/i, /lost/i, /stuck/i,
  /don'?t understand/i, /don'?t know what to do/i, /help/i,
];

// ── Context amplifiers ────────────────────────────────────────────────────────

function getContextAmplifier(opts: {
  hourOfDay: number;
  isRemoteSite: boolean;
  distressHistory: number;
  lastEmotionalState: string;
  shiftDurationHours?: number;
}): number {
  let amplifier = 0;

  // Late night / early morning (higher risk period)
  if (opts.hourOfDay >= 22 || opts.hourOfDay <= 5) amplifier += 0.15;

  // Remote or isolated site
  if (opts.isRemoteSite) amplifier += 0.1;

  // Prior distress history
  if (opts.distressHistory >= 3) amplifier += 0.1;
  else if (opts.distressHistory >= 1) amplifier += 0.05;

  // Already in a stressed emotional state
  if (opts.lastEmotionalState === 'urgent' || opts.lastEmotionalState === 'escalated') amplifier += 0.1;

  // Very long shift (fatigue increases risk)
  if (opts.shiftDurationHours && opts.shiftDurationHours >= 10) amplifier += 0.1;

  return amplifier;
}

// ── Main detection function ───────────────────────────────────────────────────

export function detectDistress(
  message: string,
  context: {
    hourOfDay?: number;
    isRemoteSite?: boolean;
    distressHistory?: number;
    lastEmotionalState?: string;
    shiftDurationHours?: number;
  } = {}
): DistressAssessment {
  const signals: string[] = [];
  let baseScore = 0;

  // Check critical signals (immediate action)
  for (const pattern of CRITICAL_SIGNALS) {
    if (pattern.test(message)) {
      signals.push(`Critical language detected: "${pattern.source.replace(/[/\\^$*+?.()|[\]{}]/g, '')}"`);
      baseScore = Math.max(baseScore, 0.95);
      break;
    }
  }

  // High signals
  if (baseScore < 0.95) {
    for (const pattern of HIGH_SIGNALS) {
      if (pattern.test(message)) {
        signals.push(`Safety concern language detected`);
        baseScore = Math.max(baseScore, 0.7);
        break;
      }
    }
  }

  // Moderate signals
  if (baseScore < 0.7) {
    for (const pattern of MODERATE_SIGNALS) {
      if (pattern.test(message)) {
        signals.push(`Stress language detected`);
        baseScore = Math.max(baseScore, 0.45);
        break;
      }
    }
  }

  // Low signals
  if (baseScore < 0.45) {
    for (const pattern of LOW_SIGNALS) {
      if (pattern.test(message)) {
        signals.push(`Mild distress indicators`);
        baseScore = Math.max(baseScore, 0.2);
        break;
      }
    }
  }

  // Apply context amplifier
  const contextAmp = getContextAmplifier({
    hourOfDay: context.hourOfDay ?? new Date().getHours(),
    isRemoteSite: context.isRemoteSite ?? false,
    distressHistory: context.distressHistory ?? 0,
    lastEmotionalState: context.lastEmotionalState ?? 'neutral',
    shiftDurationHours: context.shiftDurationHours,
  });

  const finalScore = Math.min(1.0, baseScore + contextAmp);

  // Determine level
  let level: DistressAssessment['level'] = 'none';
  if (finalScore >= 0.9) level = 'critical';
  else if (finalScore >= 0.65) level = 'high';
  else if (finalScore >= 0.4) level = 'moderate';
  else if (finalScore >= 0.15) level = 'low';

  // Build response recommendations
  let recommendedResponse = '';
  let shouldNotifySupervisor = false;
  let shouldQueueFollowUp = false;

  if (level === 'critical') {
    recommendedResponse = `I hear you and I'm taking this seriously. Your safety is the priority right now.\n\n🆘 **Press the panic button immediately if you feel unsafe** — it will alert your supervisor directly.\n\nAre you physically safe right now?`;
    shouldNotifySupervisor = true;
    shouldQueueFollowUp = true;
  } else if (level === 'high') {
    recommendedResponse = `I caught that — something doesn't feel right. You don't have to handle this alone.\n\nIf you feel unsafe at any point, hit the panic button and your supervisor will be notified immediately. What's going on?`;
    shouldNotifySupervisor = true;
    shouldQueueFollowUp = true;
  } else if (level === 'moderate') {
    recommendedResponse = `Sounds like this shift is weighing on you. That's real, and it matters.\n\nWhat would help most right now — do you need to talk, need something handled, or just need someone to know?`;
    shouldNotifySupervisor = false;
    shouldQueueFollowUp = true;
  } else if (level === 'low') {
    recommendedResponse = ''; // Normal response, but with warmer tone
    shouldNotifySupervisor = false;
    shouldQueueFollowUp = false;
  }

  return {
    detected: level !== 'none',
    level,
    score: finalScore,
    signals,
    recommendedResponse,
    shouldNotifySupervisor,
    shouldQueueFollowUp,
  };
}

// ── Supervisor notification (non-intrusive) ───────────────────────────────────

export async function notifySupervisorOfDistress(opts: {
  officerId: string;
  officerName: string;
  workspaceId: string;
  level: string;
  signals: string[];
  broadcastToWorkspace: (wsId: string, data: any) => void;
}): Promise<void> {
  try {
    // Append to working memory so Trinity knows what happened
    await appendWorkingMemory({
      workspaceId: opts.workspaceId,
      eventType: 'distress_detected',
      eventSummary: ['HelpAI detected', opts.level, 'distress from', opts.officerName + '.', 'Signals:', opts.signals.join(', ')].join(' '),
      entityType: 'officer',
      entityId: opts.officerId,
      entityName: opts.officerName,
      emotionalContext: 'distress:' + opts.level,
    });

    // Real-time push to workspace supervisors
    opts.broadcastToWorkspace(opts.workspaceId, {
      type: 'helpai_distress_alert',
      level: opts.level,
      officerId: opts.officerId,
      officerName: opts.officerName,
      signals: opts.signals,
      timestamp: new Date().toISOString(),
      message: `HelpAI detected possible distress from ${opts.officerName} during their shift. Level: ${opts.level}.`,
    });

    log.info(`[DistressDetector] Supervisor notified — officer:${opts.officerId} level:${opts.level}`);
  } catch (err: any) {
    log.warn('[DistressDetector] Supervisor notification failed (non-fatal):', err?.message);
  }
}
