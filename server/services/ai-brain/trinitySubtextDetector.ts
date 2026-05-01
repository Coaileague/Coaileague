/**
 * TRINITY SUBTEXT DETECTOR
 * =========================
 * "I'm fine" from someone with 3 calloffs and 2 short shifts this month isn't fine.
 *
 * Trinity cross-references what someone SAYS against what the data SHOWS.
 * When there's a significant delta between stated sentiment and behavioral pattern,
 * she flags it privately and adjusts her response accordingly.
 *
 * This is what good managers do — they notice when the answer doesn't match the situation.
 * Not surveillance. The employee is never told they were flagged.
 * The data informs Trinity's compassion, not a punitive system.
 *
 * Subtext score: 0 = no delta, 1 = extreme mismatch between stated and behavioral
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinitySubtext');

export interface SubtextAnalysis {
  subtextScore: number;         // 0.0–1.0 — mismatch between stated and behavioral
  statedSentiment: string;      // what the words suggest
  behavioralSignal: string;     // what the data shows
  delta: 'aligned' | 'mild_mismatch' | 'significant_mismatch' | 'severe_mismatch';
  insight: string;              // human-readable insight for Trinity to act on
  recommendedAdjustment: string; // how Trinity should adjust her next response
}

// ── Sentiment classifier from message text ────────────────────────────────────

function classifyStatedSentiment(message: string): { sentiment: string; score: number } {
  const positive = /\b(good|great|fine|okay|ok|well|happy|great|perfect|fantastic|awesome|no problem|all good|doing well)\b/i;
  const negative = /\b(bad|terrible|awful|tired|exhausted|stressed|overwhelmed|struggling|burned out|rough|hard|difficult|not okay|not good)\b/i;
  const neutral = /\b(okay|ok|fine|alright|whatever|sure|yes|no|maybe)\b/i;

  if (positive.test(message) && !negative.test(message)) return { sentiment: 'positive', score: 0.8 };
  if (negative.test(message)) return { sentiment: 'negative', score: 0.8 };
  if (neutral.test(message)) return { sentiment: 'neutral', score: 0.5 };
  return { sentiment: 'neutral', score: 0.3 };
}

// ── Behavioral signal from shift/absence patterns ────────────────────────────

async function getBehavioralSignal(officerId: string, workspaceId: string): Promise<{
  signal: string;
  score: number;  // 0 = positive, 1 = highly negative
}> {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'calloff' OR status = 'no_show') as missed,
        COUNT(*) FILTER (WHERE is_overtime = true) as overtime,
        COUNT(*) as total_shifts,
        COUNT(*) FILTER (WHERE
          date >= CURRENT_DATE - 14
          AND (EXTRACT(HOUR FROM start_time::time) < 6 OR EXTRACT(HOUR FROM end_time::time) > 22)
        ) as late_night_count,
        COALESCE(SUM(
          CASE WHEN date >= CURRENT_DATE - 14 THEN
            EXTRACT(EPOCH FROM (end_time::time - start_time::time)) / 3600
          ELSE 0 END
        ), 0) as recent_hours
      FROM shifts
      WHERE employee_id = $1 AND workspace_id = $2
        AND date >= CURRENT_DATE - 30
    `, [officerId, workspaceId]);

    const row = result.rows[0];
    if (!row || Number(row.total_shifts) === 0) return { signal: 'insufficient_data', score: 0.3 };

    const missedRate = Number(row.missed) / Math.max(Number(row.total_shifts), 1);
    const recentHours = Number(row.recent_hours);
    const lateNights = Number(row.late_night_count);
    const overtimeCount = Number(row.overtime);

    let score = 0;
    let signals: string[] = [];

    if (missedRate > 0.2) { score += 0.4; signals.push(`high calloff rate (${Math.round(missedRate * 100)}%)`); }
    else if (missedRate > 0.1) { score += 0.2; signals.push(`elevated calloffs`); }

    if (recentHours > 60) { score += 0.25; signals.push(`overworked (${Math.round(recentHours)}hrs in 2 weeks)`); }
    else if (recentHours > 48) { score += 0.1; signals.push(`heavy schedule`); }

    if (lateNights > 4) { score += 0.15; signals.push(`many late-night shifts`); }

    if (overtimeCount > 3) { score += 0.1; signals.push(`repeated overtime`); }

    if (signals.length === 0) return { signal: 'stable', score: 0 };

    const label = score >= 0.5 ? 'high_stress_pattern' : score >= 0.25 ? 'moderate_stress_pattern' : 'mild_stress_indicators';
    return { signal: `${label}: ${signals.join(', ')}`, score: Math.min(1, score) };
  } catch {
    return { signal: 'unavailable', score: 0 };
  }
}

// ── Main analysis ─────────────────────────────────────────────────────────────

export async function analyzeSubtext(
  message: string,
  officerId: string,
  workspaceId: string
): Promise<SubtextAnalysis> {
  try {
    const stated = classifyStatedSentiment(message);
    const behavioral = await getBehavioralSignal(officerId, workspaceId);

    // Calculate delta: high stated positive + high behavioral negative = mismatch
    const statedPositivity = stated.sentiment === 'positive' ? 1 : stated.sentiment === 'neutral' ? 0.5 : 0;
    const behavioralStress = behavioral.score;

    const rawDelta = statedPositivity * behavioralStress; // 0–1
    const subtextScore = rawDelta;

    let delta: SubtextAnalysis['delta'] = 'aligned';
    if (subtextScore > 0.6) delta = 'severe_mismatch';
    else if (subtextScore > 0.4) delta = 'significant_mismatch';
    else if (subtextScore > 0.2) delta = 'mild_mismatch';

    let insight = '';
    let recommendedAdjustment = '';

    if (delta === 'severe_mismatch' || delta === 'significant_mismatch') {
      insight = `Officer says "${stated.sentiment}" but behavioral data shows ${behavioral.signal}. High probability of masking.`;
      recommendedAdjustment = `Add a genuine check-in: "I also want to make sure you're doing okay — I noticed your schedule has been heavy lately. Is there anything we can adjust?"`;
    } else if (delta === 'mild_mismatch') {
      insight = `Slight mismatch — stated positive but ${behavioral.signal}. Monitor.`;
      recommendedAdjustment = `Warmer tone than normal. One optional open-ended question at end.`;
    } else {
      insight = 'Stated sentiment aligns with behavioral pattern.';
      recommendedAdjustment = '';
    }

    return {
      subtextScore,
      statedSentiment: stated.sentiment,
      behavioralSignal: behavioral.signal,
      delta,
      insight,
      recommendedAdjustment,
    };
  } catch (err: unknown) {
    log.warn('[SubtextDetector] Analysis failed (non-fatal):', err?.message);
    return {
      subtextScore: 0,
      statedSentiment: 'unknown',
      behavioralSignal: 'unavailable',
      delta: 'aligned',
      insight: '',
      recommendedAdjustment: '',
    };
  }
}
