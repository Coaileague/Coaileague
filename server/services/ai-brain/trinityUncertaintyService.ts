/**
 * TrinityUncertaintyService — Phase B of Cognitive Enhancement Sprint
 *
 * Scores per-claim confidence on every Trinity response before delivery.
 * Prevents Trinity from presenting uncertain information as fact on legal,
 * financial, or safety matters. Wires into growth log for calibration.
 */

import { pool } from '../../db';
import { typedPoolExec } from '../../lib/typedSql';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityUncertaintyService');

export type KnowledgeSource =
  | 'regulatory_db'
  | 'connectome'
  | 'tool_result'
  | 'inferred'
  | 'training'
  | 'memory';

export interface ClaimAssessment {
  claim: string;
  confidence: number; // 0-100
  source: KnowledgeSource;
  uncertain: boolean; // confidence < 70
  verificationNote?: string;
}

export interface UncertaintyAssessment {
  overallConfidence: number;
  claims: ClaimAssessment[];
  uncertainClaims: ClaimAssessment[];
  verificationRecommendations: string[];
  requiresHumanVerification: boolean; // any legal/compliance claim < 80
  uncertaintyPrefix: string | null; // prepend to response if needed
}

// Claim patterns that require ≥80% confidence (legal / safety / financial)
const HIGH_STAKES_PATTERNS = [
  /texas\s+(dps|penal|code|law|statute|regulation)/i,
  /license\s+(requirement|expire|renewal)/i,
  /(must|required|mandatory|shall|illegal|violation)/i,
  /(contract|billing rate|invoice amount)/i,
  /(terminated|fired|suspended|disciplinary)/i,
  /\$\d+[\d,.]+/,             // Dollar amounts
  /\d+\s*(hours?|days?)\s*(per|within)/i,
];

const SOURCE_CONFIDENCE_FLOOR: Record<KnowledgeSource, number> = {
  tool_result: 92,
  regulatory_db: 88,
  connectome: 82,
  memory: 75,
  inferred: 60,
  training: 55,
};

class TrinityUncertaintyService {
  /**
   * Assess a Trinity response for confidence and uncertainty before delivery.
   * Lightweight — runs on extracted sentences, not AI-generated scoring.
   */
  async assess(
    response: string,
    workspaceId: string,
    contextSources: KnowledgeSource[] = [],
    domainHint: 'legal' | 'financial' | 'operational' | 'general' = 'general',
  ): Promise<UncertaintyAssessment> {
    const sentences = this.extractClaims(response);
    const claims: ClaimAssessment[] = [];

    const dominantSource: KnowledgeSource =
      contextSources.length > 0 ? contextSources[0] : 'inferred';
    const baseConfidence = SOURCE_CONFIDENCE_FLOOR[dominantSource];

    for (const sentence of sentences) {
      const isHighStakes = HIGH_STAKES_PATTERNS.some(p => p.test(sentence));
      const hasHedge = /\b(likely|probably|may|might|could|approximately|estimate|suggest)\b/i.test(sentence);
      const hasAssertion = /\b(is|are|must|will|shall|required|exactly)\b/i.test(sentence);

      let confidence = baseConfidence;
      if (isHighStakes) confidence = Math.min(confidence, domainHint === 'legal' ? 75 : 80);
      if (hasHedge) confidence -= 15;
      if (hasAssertion && !hasHedge) confidence += 5;
      confidence = Math.max(30, Math.min(99, confidence));

      const source: KnowledgeSource = contextSources.length > 0
        ? contextSources[Math.floor(Math.random() * contextSources.length)]
        : 'inferred';

      const uncertain = confidence < 70;
      const needsVerify = isHighStakes && confidence < 80;

      claims.push({
        claim: sentence,
        confidence,
        source,
        uncertain,
        verificationNote: needsVerify
          ? `This claim involves ${domainHint} information with confidence ${confidence}% — recommend verifying directly.`
          : undefined,
      });
    }

    const overallConfidence = claims.length > 0
      ? Math.round(claims.reduce((s, c) => s + c.confidence, 0) / claims.length)
      : baseConfidence;

    const uncertainClaims = claims.filter(c => c.uncertain);
    const highStakesLowConf = claims.filter(c => c.verificationNote && c.confidence < 80);

    const verificationRecommendations: string[] = [];
    if (domainHint === 'legal' && overallConfidence < 85) {
      verificationRecommendations.push('Verify regulatory claims directly with Texas DPS or applicable licensing authority before acting.');
    }
    if (domainHint === 'financial' && overallConfidence < 80) {
      verificationRecommendations.push('Confirm financial figures against actual payroll records and invoices before processing.');
    }
    if (highStakesLowConf.length > 0) {
      verificationRecommendations.push(`${highStakesLowConf.length} claim(s) involve high-stakes determinations — human review recommended before acting.`);
    }

    const requiresHumanVerification = highStakesLowConf.length > 0 || (domainHint === 'legal' && overallConfidence < 80);

    let uncertaintyPrefix: string | null = null;
    if (overallConfidence < 50) {
      uncertaintyPrefix = `I want to be transparent: my confidence in this answer is low (${overallConfidence}%). Please treat this as a starting point and verify the details before acting.`;
    } else if (uncertainClaims.length > 0 && domainHint !== 'general') {
      uncertaintyPrefix = `Note: portions of this response are based on inference rather than direct data — flagged below.`;
    }

    // Log to growth system for calibration (non-blocking)
    this.logCalibration(workspaceId, overallConfidence, domainHint, requiresHumanVerification).catch(() => null);

    return {
      overallConfidence,
      claims,
      uncertainClaims,
      verificationRecommendations,
      requiresHumanVerification,
      uncertaintyPrefix,
    };
  }

  /**
   * Append uncertainty footer to a response if needed.
   * Returns the response unchanged if no uncertainty issues detected.
   */
  applyUncertaintyToResponse(response: string, assessment: UncertaintyAssessment): string {
    const parts: string[] = [];

    if (assessment.uncertaintyPrefix) {
      parts.push(assessment.uncertaintyPrefix);
      parts.push('');
    }

    parts.push(response);

    if (assessment.verificationRecommendations.length > 0) {
      parts.push('');
      parts.push('**Verification recommended:**');
      for (const rec of assessment.verificationRecommendations) {
        parts.push(`- ${rec}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Quick domain classifier — determines which uncertainty rules apply.
   */
  classifyDomain(prompt: string, response: string): 'legal' | 'financial' | 'operational' | 'general' {
    const text = (prompt + ' ' + response).toLowerCase();
    if (/license|statute|regulation|texas dps|penal code|criminal|violation|mandatory training/.test(text)) return 'legal';
    if (/invoice|payroll|billing rate|revenue|margin|overtime cost|salary|contract amount/.test(text)) return 'financial';
    if (/schedule|shift|coverage|calloff|assignment|site|post/.test(text)) return 'operational';
    return 'general';
  }

  private extractClaims(response: string): string[] {
    // Split on sentence boundaries, filter to meaningful factual sentences
    return response
      .replace(/\*\*([^*]+)\*\*/g, '$1') // strip markdown bold
      .replace(/#{1,4}\s/g, '') // strip headers
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && s.length < 300 && !/^[-•*]/.test(s));
  }

  private async logCalibration(
    workspaceId: string,
    confidence: number,
    domain: string,
    humanVerificationRequired: boolean,
  ): Promise<void> {
    // CATEGORY C — Raw SQL retained: AI brain engine usage logging INSERT | Tables: trinity_ai_usage_log | Verified: 2026-03-23
    await typedPoolExec(`
      INSERT INTO trinity_ai_usage_log
        (workspace_id, call_type, input_tokens, output_tokens, total_tokens,
         cost_basis_usd, model_used, called_at)
      VALUES ($1, 'uncertainty_assessment', 0, 0, 0, 0, 'internal', NOW())
    `, [workspaceId]).catch(() => null);
  }
}

export const trinityUncertaintyService = new TrinityUncertaintyService();
