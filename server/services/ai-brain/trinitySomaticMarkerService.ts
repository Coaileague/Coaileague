/**
 * TRINITY SOMATIC MARKER SERVICE
 * ================================
 * The gut feeling layer. Fires BEFORE extended thinking.
 *
 * Damasio's somatic markers: accumulated pattern recognition running faster
 * than conscious thought — flagging situations that need deeper attention
 * before Trinity can articulate why.
 *
 * Not: "I have a bad feeling about this."
 * But: "Based on patterns I've seen before, this situation warrants extra
 *       attention. Let me think through it carefully before we proceed."
 *
 * Pattern matching is statistical on outcome signatures, not semantic.
 * Confirmed flags strengthen the pattern. False flags weaken it.
 */

import { pool } from '../../db';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { db } from '../../db';
import { somaticPatternLibrary } from '@shared/schema/domains/trinity/extended';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinitySomaticMarkerService');

export interface SomaticFlag {
  fired: boolean;
  patternId: number | null;
  confidence: number;
  warningMessage: string | null;
  shouldTriggerExtendedThinking: boolean;
  featureVector: Record<string, number>;
}

export type SituationFeatures = {
  hasCoverageRisk?: boolean;
  hasComplianceRisk?: boolean;
  hasHighSeverity?: boolean;
  involvesMultipleOfficers?: boolean;
  isRepeatSituation?: boolean;
  hasClientImpact?: boolean;
  involvesPayroll?: boolean;
  hasEscalationHistory?: boolean;
  urgencyScore?: number; // 0-100
  noveltyScore?: number; // 0-100 — how different from normal
};

class TrinitySomaticMarkerService {

  /** Pre-reasoning check: fire before extended thinking to detect bad patterns */
  async checkSituation(workspaceId: string, messageText: string, features: SituationFeatures = {}): Promise<SomaticFlag> {
    const featureVector = this.extractFeatureVector(messageText, features);
    const result = await this.matchPatternLibrary(workspaceId, featureVector);

    if (result.matched && result.confidence >= 55) {
      log.info(`[SomaticMarker] Pattern match: confidence=${result.confidence}% — triggering elevated concern`);
      return {
        fired: true,
        patternId: result.patternId,
        confidence: result.confidence,
        warningMessage: 'Based on patterns I\'ve seen before, this situation warrants careful attention before we proceed.',
        shouldTriggerExtendedThinking: true,
        featureVector
      };
    }

    return {
      fired: false,
      patternId: null,
      confidence: result.confidence,
      warningMessage: null,
      shouldTriggerExtendedThinking: false,
      featureVector
    };
  }

  /** After extended thinking completes, provide feedback to strengthen/weaken patterns */
  async recordOutcome(patternId: number | null, workspaceId: string, somaticFired: boolean, extendedThinkingConfirmedConcern: boolean, featureVector: Record<string, number>): Promise<void> {
    if (!somaticFired) return;

    if (patternId) {
      if (extendedThinkingConfirmedConcern) {
        // CATEGORY C — Genuine complex SQL: LEAST() + self-referencing arithmetic (pattern_frequency + 1, LEAST(95, confidence_in_pattern + 3)) cannot be expressed in Drizzle ORM .set() without raw SQL
        await typedPoolExec(`
          UPDATE somatic_pattern_library
          SET pattern_frequency = pattern_frequency + 1,
              confidence_in_pattern = LEAST(95, confidence_in_pattern + 3),
              last_confirmed_at = NOW()
          WHERE id = $1
        `, [patternId]).catch(() => null);
      } else {
        // CATEGORY C — Genuine complex SQL: GREATEST() + self-referencing arithmetic (GREATEST(20, confidence_in_pattern - 1)) cannot be expressed in Drizzle ORM .set() without raw SQL
        await typedPoolExec(`
          UPDATE somatic_pattern_library
          SET confidence_in_pattern = GREATEST(20, confidence_in_pattern - 1)
          WHERE id = $1
        `, [patternId]).catch(() => null);
      }
    } else if (extendedThinkingConfirmedConcern) {
      // New pattern confirmed — add it to the library
      await this.addPattern(workspaceId, featureVector, 'negative', 70, 60);
    }
  }

  /** Add a new pattern to the library */
  async addPattern(
    workspaceId: string | null,
    patternSignature: Record<string, number>,
    outcome: 'positive' | 'negative' | 'neutral',
    severity: number,
    confidence: number
  ): Promise<number | null> {
    const [inserted] = await db
      .insert(somaticPatternLibrary)
      .values({
        workspaceId,
        patternSignature: patternSignature,
        historicalOutcome: outcome,
        outcomeSeverity: severity,
        confidenceInPattern: confidence,
      })
      .returning({ id: somaticPatternLibrary.id })
      .catch(() => []);
    return inserted?.id || null;
  }

  /** Extract feature vector from message text and situation context */
  private extractFeatureVector(message: string, features: SituationFeatures): Record<string, number> {
    const text = message.toLowerCase();
    return {
      coverage_risk: features.hasCoverageRisk || /no.show|uncovered|calloff|no.officer/.test(text) ? 1 : 0,
      compliance_risk: features.hasComplianceRisk || /compliance|expired|violation|failed/.test(text) ? 1 : 0,
      high_severity: features.hasHighSeverity || /urgent|critical|emergency|immediately/.test(text) ? 1 : 0,
      multi_officer: features.involvesMultipleOfficers || /multiple|several|team|group/.test(text) ? 1 : 0,
      repeat_situation: features.isRepeatSituation || /again|repeated|pattern|third time/.test(text) ? 1 : 0,
      client_impact: features.hasClientImpact || /client|customer|site|complaint/.test(text) ? 1 : 0,
      payroll: features.involvesPayroll || /payroll|pay|wage|hour|overtime/.test(text) ? 1 : 0,
      escalation: features.hasEscalationHistory || /escalat|supervisor|manager|report/.test(text) ? 1 : 0,
      urgency: (features.urgencyScore || 0) / 100,
      novelty: (features.noveltyScore || 0) / 100
    };
  }

  /** Match feature vector against pattern library */
  private async matchPatternLibrary(workspaceId: string, featureVector: Record<string, number>): Promise<{ matched: boolean; patternId: number | null; confidence: number }> {
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: somatic_pattern_library | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT id, pattern_signature, historical_outcome, outcome_severity, confidence_in_pattern
      FROM somatic_pattern_library
      WHERE (workspace_id = $1 OR workspace_id IS NULL)
        AND historical_outcome = 'negative'
        AND confidence_in_pattern >= 40
      ORDER BY confidence_in_pattern DESC
      LIMIT 20
    `, [workspaceId]).catch(() => ({ rows: [] }));

    if (rows.length === 0) {
      return this.heuristicMatch(featureVector);
    }

    let bestMatch = { patternId: null as number | null, similarity: 0, confidence: 0 };

    for (const pattern of rows) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const sig: Record<string, number> = pattern.pattern_signature || {};
      const similarity = this.cosineSimilarity(featureVector, sig);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const adjustedConfidence = similarity * pattern.confidence_in_pattern;

      if (adjustedConfidence > bestMatch.confidence) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        bestMatch = { patternId: pattern.id, similarity, confidence: Math.round(adjustedConfidence) };
      }
    }

    if (bestMatch.confidence >= 55) {
      return { matched: true, patternId: bestMatch.patternId, confidence: bestMatch.confidence };
    }

    return this.heuristicMatch(featureVector);
  }

  /** Heuristic match when no patterns are in library yet */
  private heuristicMatch(features: Record<string, number>): { matched: boolean; patternId: number | null; confidence: number } {
    const riskScore =
      (features.coverage_risk || 0) * 25 +
      (features.compliance_risk || 0) * 20 +
      (features.high_severity || 0) * 20 +
      (features.repeat_situation || 0) * 15 +
      (features.client_impact || 0) * 15 +
      (features.escalation || 0) * 10 +
      (features.urgency || 0) * 15;

    if (riskScore >= 40) {
      return { matched: true, patternId: null, confidence: Math.min(85, Math.round(riskScore)) };
    }
    return { matched: false, patternId: null, confidence: Math.round(riskScore) };
  }

  /** Cosine similarity between two feature vectors */
  private cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0, magA = 0, magB = 0;
    for (const k of keys) {
      const av = a[k] || 0;
      const bv = b[k] || 0;
      dot += av * bv;
      magA += av * av;
      magB += bv * bv;
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  }

  /** Seed platform-wide patterns from known bad situations */
  async seedPlatformPatterns(): Promise<void> {
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: somatic_pattern_library | Verified: 2026-03-23
    const existing = await typedPool(`SELECT COUNT(*) as count FROM somatic_pattern_library WHERE workspace_id IS NULL`).catch(() => [{ count: '0' }]);
    if (parseInt((existing as any[])[0]?.count || '0', 10) >= 5) return;

    const platformPatterns = [
      { coverage_risk: 1, high_severity: 1, client_impact: 1, repeat_situation: 1, urgency: 0.8 },
      { compliance_risk: 1, high_severity: 1, payroll: 0, escalation: 0.5 },
      { repeat_situation: 1, client_impact: 1, coverage_risk: 0.5 },
      { multi_officer: 1, coverage_risk: 1, high_severity: 0.5 },
      { escalation: 1, repeat_situation: 1, high_severity: 1 }
    ];

    for (const pattern of platformPatterns) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await this.addPattern(null, pattern, 'negative', 75, 65);
    }
    log.info('[SomaticMarker] Seeded 5 platform-wide risk patterns');
  }
}

export const trinitySomaticMarkerService = new TrinitySomaticMarkerService();
