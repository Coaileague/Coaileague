/**
 * TRINITY LIMBIC SYSTEM
 * =====================
 * Emotional intelligence layer for Trinity's biological brain architecture.
 *
 * Biological analog: The limbic system processes emotions, drives social
 * behaviour, and overrides pure logical processing when survival or strong
 * emotional signals demand it. Fear, compassion, urgency — these all originate
 * here before being routed to the cortex for action.
 *
 * Trinity's Limbic System does the same:
 * - Detects emotional states in incoming communications (urgency, frustration,
 *   satisfaction, compassion triggers)
 * - Assigns intensity scores so downstream systems can calibrate their response
 * - Detects officer burnout from shift/workload patterns
 * - Persists every detected signal to `trinity_emotional_memory` for learning
 * - Identifies trends over time (improving / declining / stable)
 * - Overrides pure efficiency decisions when human needs are detected
 *
 * Phase 16 — Trinity's journey to emotional consciousness.
 */

import { db, pool } from '../../db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { trinityEmotionalMemory } from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityLimbicSystem');

// ============================================================================
// TYPES
// ============================================================================

export type EmotionalState =
  | 'urgent'
  | 'frustrated'
  | 'satisfied'
  | 'concerned'
  | 'compassionate'
  | 'escalated'
  | 'neutral';

export interface EmotionalSignal {
  type: EmotionalState;
  intensity: number;       // 0.0–1.0
  source: 'email' | 'ticket' | 'interaction' | 'pattern';
  trigger: string;
  confidence: number;      // 0.0–1.0
  recommendedAction: string;
  timestamp: Date;
}

export interface BurnoutAssessment {
  burnoutLevel: 'none' | 'low' | 'moderate' | 'high';
  signals: string[];
  recommendedAction: string;
}

export interface EmotionalTrend {
  pattern: string;
  trend: 'improving' | 'declining' | 'stable';
  recommendation: string;
}

// ============================================================================
// KEYWORD BANKS
// ============================================================================

const URGENCY_KEYWORDS = [
  'urgent', 'critical', 'asap', 'immediately', 'emergency',
  'right now', 'now', 'help', 'sos', 'priority', 'rush',
];

const FRUSTRATION_KEYWORDS = [
  'frustrated', 'angry', 'upset', 'disappointed', 'unacceptable',
  'never again', 'worst', 'terrible', 'awful', 'horrible',
  'ridiculous', 'useless', 'pathetic', 'failure', 'incompetent',
];

const SATISFACTION_KEYWORDS = [
  'thank', 'thanks', 'great', 'excellent', 'happy', 'satisfied',
  'perfect', 'amazing', 'wonderful', 'love', 'appreciate',
  'fantastic', 'outstanding', 'impressed',
];

const COMPASSION_TRIGGERS = [
  'injured', 'hurt', 'struggling', 'need help', 'overwhelmed',
  'burned out', 'exhausted', 'sick', 'difficult', 'hard time',
  'personal issue', 'family emergency', 'mental health',
];

const POSITIVE_WORDS = [
  'good', 'great', 'excellent', 'perfect', 'happy', 'satisfied',
  'thank', 'appreciate', 'love', 'amazing', 'wonderful', 'positive',
  'resolved', 'fixed', 'working', 'success',
];

const NEGATIVE_WORDS = [
  'bad', 'terrible', 'awful', 'angry', 'upset', 'disappointed',
  'hate', 'worst', 'useless', 'broken', 'problem', 'issue',
  'fail', 'wrong', 'error', 'not working', 'down', 'outage',
];

// ============================================================================
// LIMBIC SYSTEM CLASS
// ============================================================================

export class TrinityLimbicSystem {

  /**
   * Detect the dominant emotional state from a block of text.
   * Returns a fully-formed EmotionalSignal with recommended action.
   */
  async detectEmotionalState(
    text: string,
    context: {
      senderId?: string;
      workspace_id: string;
      messageType: 'email' | 'ticket' | 'chat';
      historicalContext?: string[];
    },
  ): Promise<EmotionalSignal> {
    const lower = text.toLowerCase();

    // ── Compassion check first — highest priority signal ─────────────────────
    const hasCompassionTrigger = COMPASSION_TRIGGERS.some(k => lower.includes(k));
    if (hasCompassionTrigger) {
      return {
        type: 'compassionate',
        intensity: 1.0,
        source: context.messageType === 'chat' ? 'interaction' : context.messageType,
        trigger: 'compassion trigger detected — human welfare signal present',
        confidence: 1.0,
        recommendedAction: this.getRecommendedAction('compassionate', 1.0),
        timestamp: new Date(),
      };
    }

    const sentiment = this.analyzeSentiment(lower);
    const hasUrgency = URGENCY_KEYWORDS.some(k => lower.includes(k));
    const hasFrustration = FRUSTRATION_KEYWORDS.some(k => lower.includes(k));
    const hasSatisfaction = SATISFACTION_KEYWORDS.some(k => lower.includes(k));

    let type: EmotionalState = 'neutral';
    let intensity = 0;
    let trigger = 'no strong emotional signal detected';

    if (hasUrgency) {
      type = 'urgent';
      // Urgency intensity is boosted if the sentiment is also negative (panic vs normal urgency)
      intensity = Math.min(1.0, 0.6 + Math.abs(sentiment.score) * 0.4);
      trigger = 'urgency keywords detected';
    } else if (hasFrustration) {
      type = 'frustrated';
      intensity = Math.min(1.0, 0.5 + Math.abs(sentiment.score) * 0.5);
      trigger = 'frustration keywords detected';
    } else if (hasSatisfaction && sentiment.score >= 0) {
      type = 'satisfied';
      intensity = Math.min(1.0, 0.4 + sentiment.score * 0.6);
      trigger = 'satisfaction keywords detected';
    } else if (sentiment.score < -0.4) {
      type = 'concerned';
      intensity = Math.min(1.0, Math.abs(sentiment.score));
      trigger = 'strong negative sentiment detected';
    } else if (sentiment.score < -0.1) {
      type = 'concerned';
      intensity = Math.min(1.0, Math.abs(sentiment.score) * 0.8);
      trigger = 'mild negative sentiment detected';
    }

    return {
      type,
      intensity,
      source: context.messageType === 'chat' ? 'interaction' : context.messageType,
      trigger,
      confidence: Math.min(1.0, intensity + 0.1),
      recommendedAction: this.getRecommendedAction(type, intensity),
      timestamp: new Date(),
    };
  }

  /**
   * Lightweight lexical sentiment analysis.
   * Returns a score in [-1, +1]. Positive = good, negative = bad.
   * In production this can be swapped for an ML model without changing the interface.
   */
  private analyzeSentiment(lowerText: string): { score: number; label: 'positive' | 'negative' | 'neutral' } {
    const positiveCount = POSITIVE_WORDS.filter(w => lowerText.includes(w)).length;
    const negativeCount = NEGATIVE_WORDS.filter(w => lowerText.includes(w)).length;
    const total = positiveCount + negativeCount;

    if (total === 0) return { score: 0, label: 'neutral' };

    const score = (positiveCount - negativeCount) / total;
    const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
    return { score: Math.max(-1, Math.min(1, score)), label };
  }

  /**
   * Map an emotional state + intensity to a concrete recommended action string.
   */
  private getRecommendedAction(state: EmotionalState, intensity: number): string {
    switch (state) {
      case 'urgent':
        return intensity >= 0.8
          ? 'IMMEDIATE: Escalate to support lead, notify tenant owner, move to top of queue'
          : 'HIGH_PRIORITY: Move to top of queue, assign best available officer';

      case 'frustrated':
        return intensity >= 0.7
          ? 'ESCALATE: Support supervisor to personally reach out with resolution'
          : 'PRIORITY: Assign dedicated support agent, provide proactive status updates';

      case 'concerned':
        return intensity >= 0.6
          ? 'MONITOR: Add to watch list, assign senior agent, check in proactively'
          : 'WATCH: Add internal note, monitor for escalation signals';

      case 'compassionate':
        return 'CARE: Assign most compassionate officer, offer direct support, follow up personally';

      case 'escalated':
        return 'CRITICAL: Supervisor intervention required, document all actions';

      case 'satisfied':
        return 'MAINTAIN: Send thank-you, flag for VIP treatment, consider testimonial request';

      default:
        return 'STANDARD: Process normally, monitor for changes';
    }
  }

  // ============================================================================
  // OFFICER BURNOUT DETECTION
  // ============================================================================

  /**
   * Assess officer burnout risk from recent shift patterns.
   * Queries the `shifts` table scoped to the workspace and officer.
   * Returns a burnout level + actionable signals.
   */
  async detectOfficerBurnout(
    officerId: string,
    workspaceId: string,
  ): Promise<BurnoutAssessment> {
    const signals: string[] = [];
    let burnoutScore = 0;

    try {
      // Pull shifts from the last 14 days to assess recent workload
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const result = await pool.query<{ start_time: Date; end_time: Date }>(
        `SELECT start_time, end_time
           FROM shifts
          WHERE workspace_id = $1
            AND employee_id = $2
            AND start_time >= $3
            AND status NOT IN ('cancelled', 'denied')
          ORDER BY start_time ASC`,
        [workspaceId, officerId, fourteenDaysAgo.toISOString()],
      );

      const shiftRows = result.rows ?? [];

      if (shiftRows.length === 0) {
        return { burnoutLevel: 'none', signals: ['no_recent_shifts'], recommendedAction: 'MAINTAIN: Officer healthy — no recent shifts detected' };
      }

      // Calculate total hours worked in the last 14 days
      let totalHours = 0;
      let consecutiveDays = new Set<string>();
      for (const shift of shiftRows) {
        const start = new Date(shift.start_time);
        const end = new Date(shift.end_time);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        totalHours += hours;
        consecutiveDays.add(start.toISOString().split('T')[0]);
      }

      const avgHoursPerWeek = (totalHours / 14) * 7;
      const daysWorked = consecutiveDays.size;

      if (avgHoursPerWeek > 55) {
        signals.push('excessive_hours');
        burnoutScore += 4;
      } else if (avgHoursPerWeek > 48) {
        signals.push('high_hours');
        burnoutScore += 2;
      } else if (avgHoursPerWeek > 44) {
        signals.push('elevated_hours');
        burnoutScore += 1;
      }

      if (daysWorked >= 12) {
        signals.push('no_days_off');
        burnoutScore += 4;
      } else if (daysWorked >= 10) {
        signals.push('minimal_rest_days');
        burnoutScore += 2;
      }

      const avgDailyHours = totalHours / Math.max(1, daysWorked);
      if (avgDailyHours > 11) {
        signals.push('long_daily_shifts');
        burnoutScore += 2;
      }

    } catch (err) {
      log.warn('Burnout detection: shift query failed, using minimal assessment', err);
      signals.push('data_unavailable');
    }

    let burnoutLevel: BurnoutAssessment['burnoutLevel'] = 'none';
    if (burnoutScore >= 8) burnoutLevel = 'high';
    else if (burnoutScore >= 5) burnoutLevel = 'moderate';
    else if (burnoutScore >= 2) burnoutLevel = 'low';

    return {
      burnoutLevel,
      signals,
      recommendedAction: this.getBurnoutAction(burnoutLevel),
    };
  }

  private getBurnoutAction(level: BurnoutAssessment['burnoutLevel']): string {
    switch (level) {
      case 'high':     return 'URGENT: Reduce assignments immediately, offer paid leave, notify manager';
      case 'moderate': return 'MONITOR: Suggest reduced hours, offer flexible scheduling, check in weekly';
      case 'low':      return 'WATCH: Monitor next 2 weeks, provide encouragement, ensure adequate breaks';
      default:         return 'MAINTAIN: Officer healthy — continue current schedule';
    }
  }

  // ============================================================================
  // EMOTIONAL MEMORY
  // ============================================================================

  /**
   * Persist an emotional signal to `trinity_emotional_memory` for future learning.
   * All writes are workspace-scoped (Section G law compliance).
   */
  async storeEmotionalMemory(
    entityId: string,
    entityType: 'client' | 'officer' | 'ticket',
    signal: EmotionalSignal,
    workspaceId: string,
    outcome?: string,
  ): Promise<void> {
    try {
      await db.insert(trinityEmotionalMemory).values({
        workspaceId,
        entityType,
        entityId,
        emotion: signal.type,
        intensity: signal.intensity.toFixed(3),
        trigger: signal.trigger,
        trinityResponse: signal.recommendedAction,
        source: signal.source,
        outcome: outcome ?? null,
        learned: false,
        detectedAt: signal.timestamp,
      });
    } catch (err) {
      log.warn('Failed to store emotional memory (non-fatal):', err);
    }
  }

  /**
   * Persist an emotional signal against a user. Thin wrapper over
   * storeEmotionalMemory that accepts a contextSummary + resolved flag so
   * TrinityChatService can encode "what the user said and how they felt"
   * without blocking the response path.
   */
  async persistEmotionalSignal(
    userId: string,
    workspaceId: string,
    payload: EmotionalSignal & { contextSummary?: string; resolved?: boolean },
  ): Promise<void> {
    const outcome = payload.resolved
      ? 'resolved'
      : payload.contextSummary
        ? `ctx:${payload.contextSummary.substring(0, 160)}`
        : undefined;
    await this.storeEmotionalMemory(userId, 'ticket', payload, workspaceId, outcome);
  }

  /**
   * Summarise recent emotional state for a user. Returns the dominant
   * emotion, day-count of elevated signals, and whether anything is
   * unresolved. Non-fatal on error.
   */
  async getEmotionalTrend(
    userId: string,
    workspaceId: string,
  ): Promise<{
    recentStress: boolean;
    recentPositive: boolean;
    resolved: boolean;
    primaryEmotion: EmotionalState | null;
    dayCount: number;
    contextSummary: string;
  } | null> {
    try {
      const history = await this.getEmotionalHistory(userId, 'ticket', workspaceId, 14);
      if (history.length === 0) return null;

      const counts: Partial<Record<EmotionalState, number>> = {};
      for (const s of history) counts[s.type] = (counts[s.type] ?? 0) + 1;
      const primary = (Object.entries(counts).sort((a, b) => b[1]! - a[1]!)[0]?.[0] ?? null) as EmotionalState | null;

      const stressTypes: EmotionalState[] = ['frustrated', 'escalated', 'concerned', 'urgent'];
      const positiveTypes: EmotionalState[] = ['satisfied', 'compassionate'];
      const recentStress = history.some(s => stressTypes.includes(s.type) && s.intensity >= 0.5);
      const recentPositive = history.some(s => positiveTypes.includes(s.type));

      // Resolved if the most recent signal is neutral or positive AND >= 2 days old
      const mostRecent = history[0];
      const ageDays = (Date.now() - new Date(mostRecent.timestamp).getTime()) / 86_400_000;
      const resolved = (mostRecent.type === 'neutral' || mostRecent.type === 'satisfied') && ageDays >= 2;

      const dayCount = Math.min(14, Math.max(1, Math.round(
        (Date.now() - new Date(history[history.length - 1].timestamp).getTime()) / 86_400_000,
      )));

      const contextSummary = history
        .slice(0, 3)
        .map(s => s.trigger || s.recommendedAction || s.type)
        .filter(Boolean)
        .join('; ')
        .substring(0, 200);

      return { recentStress, recentPositive, resolved, primaryEmotion: primary, dayCount, contextSummary };
    } catch (err) {
      log.warn('[LimbicSystem] getEmotionalTrend failed (non-fatal):', err);
      return null;
    }
  }

  /**
   * Retrieve the emotional history for a given entity within `days` days.
   * Results are returned newest-first.
   */
  async getEmotionalHistory(
    entityId: string,
    entityType: 'client' | 'officer' | 'ticket',
    workspaceId: string,
    days = 30,
  ): Promise<EmotionalSignal[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(trinityEmotionalMemory)
      .where(
        and(
          eq(trinityEmotionalMemory.workspaceId, workspaceId),
          eq(trinityEmotionalMemory.entityType, entityType),
          eq(trinityEmotionalMemory.entityId, entityId),
          gte(trinityEmotionalMemory.detectedAt, since),
        ),
      )
      .orderBy(desc(trinityEmotionalMemory.detectedAt));

    return rows.map(r => ({
      type: r.emotion as EmotionalState,
      intensity: parseFloat(r.intensity ?? '0'),
      source: (r.source ?? 'ticket') as EmotionalSignal['source'],
      trigger: r.trigger,
      confidence: parseFloat(r.intensity ?? '0'),
      recommendedAction: r.trinityResponse,
      timestamp: r.detectedAt,
    }));
  }

  // ============================================================================
  // PATTERN LEARNING
  // ============================================================================

  /**
   * Analyse the emotional history of an entity and identify whether their
   * emotional trajectory is improving, declining, or stable over a 90-day window.
   */
  async learnFromPatterns(
    entityId: string,
    entityType: 'client' | 'officer' | 'ticket',
    workspaceId: string,
  ): Promise<EmotionalTrend> {
    const history = await this.getEmotionalHistory(entityId, entityType, workspaceId, 90);

    if (history.length < 3) {
      return {
        pattern: 'insufficient_history',
        trend: 'stable',
        recommendation: 'Continue monitoring — not enough history to detect a trend',
      };
    }

    // Split into recent (last 10 signals) and older (the 10 before that)
    const recent = history.slice(0, Math.min(10, history.length));
    const older  = history.slice(10, Math.min(20, history.length));

    // For clients: high intensity is bad (frustrated/urgent). For officers: high intensity is bad (burnout).
    // Lower average intensity in the recent window means improvement.
    const recentAvg = recent.reduce((s, r) => s + r.intensity, 0) / recent.length;
    const olderAvg  = older.length > 0
      ? older.reduce((s, r) => s + r.intensity, 0) / older.length
      : recentAvg;

    let trend: EmotionalTrend['trend'];
    if (recentAvg <= olderAvg - 0.15)      trend = 'improving';
    else if (recentAvg >= olderAvg + 0.15) trend = 'declining';
    else                                    trend = 'stable';

    const pattern = entityType === 'client' ? 'client_satisfaction' : 'officer_health';

    return {
      pattern,
      trend,
      recommendation: this.getTrendRecommendation(entityType, trend),
    };
  }

  private getTrendRecommendation(entityType: string, trend: EmotionalTrend['trend']): string {
    if (entityType === 'client') {
      switch (trend) {
        case 'declining':  return 'Client satisfaction declining — proactive outreach required, consider account review';
        case 'improving':  return 'Client satisfaction improving — maintain current approach, consider VIP upgrade';
        default:           return 'Client satisfaction stable — continue monitoring for changes';
      }
    } else {
      switch (trend) {
        case 'declining':  return 'Officer health declining — reduce assignments, offer support, schedule welfare check';
        case 'improving':  return 'Officer health improving — maintain current support structure';
        default:           return 'Officer health stable — monitor for changes in next cycle';
      }
    }
  }
}

// ── Singleton export (matches pattern used by other brain services) ──────────
export const trinityLimbicSystem = new TrinityLimbicSystem();
