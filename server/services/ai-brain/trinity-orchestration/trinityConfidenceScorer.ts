
import { createLogger } from '../../../lib/logger';
const log = createLogger('trinityConfidenceScorer');
/**
 * Trinity Confidence Scorer - Calculates when Claude verification is needed
 * 
 * Trinity (CEO) scores its own confidence level and determines when to
 * request verification from Claude (CFO) for critical operations.
 */

export interface TrinityOperation {
  type: string;
  workspaceId?: string;
  missingDataPoints: number;
  edgeCasesDetected: string[];
  hasHistoricalPrecedent: boolean;
  financialImpact: number;
  hasRegulatoryImplications: boolean;
  anomalyScore: number;
  affectsMultipleUsers: number;
  mathematicalComplexity?: 'simple' | 'moderate' | 'complex';
  involvesCurrency?: boolean;
  hasFloatingPointInputs?: boolean;
  data: any;
}

export interface VerificationRecommendation {
  shouldVerify: boolean;
  reason: string;
  urgency: 'none' | 'low' | 'medium' | 'high';
}

export interface ConfidenceScore {
  score: number;
  concerns: string[];
  edgeCases: string[];
  recommendation: VerificationRecommendation;
}

const CRITICAL_OPERATIONS = [
  'payroll_processing',
  'tax_calculation',
  'compliance_submission',
  'financial_reporting',
  'contract_generation',
  'regulatory_filing',
  'invoice_generation',
  'license_renewal',
  'credit_calculation',
  'payroll_math',
  'invoice_math',
  'tax_computation',
  'billing_aggregation',
  'refund_processing',
  'credit_consumption',
  'platform_bill_generation',
];

class TrinityConfidenceScorer {
  calculateConfidence(operation: TrinityOperation): ConfidenceScore {
    let baseConfidence = 100;
    const concerns: string[] = [];
    const edgeCases: string[] = [];

    if (operation.missingDataPoints > 0) {
      const penalty = Math.min(operation.missingDataPoints * 10, 30);
      baseConfidence -= penalty;
      concerns.push(`Missing ${operation.missingDataPoints} data point(s)`);
    }

    if (operation.edgeCasesDetected.length > 0) {
      const penalty = Math.min(operation.edgeCasesDetected.length * 5, 25);
      baseConfidence -= penalty;
      edgeCases.push(...operation.edgeCasesDetected);
    }

    if (!operation.hasHistoricalPrecedent) {
      baseConfidence -= 15;
      concerns.push('No historical precedent for this operation');
    }

    if (operation.financialImpact > 10000) {
      baseConfidence -= 10;
      concerns.push(`High financial impact (>$10K): $${operation.financialImpact.toLocaleString()}`);
    } else if (operation.financialImpact > 5000) {
      baseConfidence -= 5;
      concerns.push(`Moderate financial impact: $${operation.financialImpact.toLocaleString()}`);
    }

    if (operation.hasRegulatoryImplications) {
      baseConfidence -= 20;
      concerns.push('Regulatory compliance implications');
    }

    if (operation.anomalyScore > 0.7) {
      baseConfidence -= 15;
      concerns.push(`High anomaly score: ${(operation.anomalyScore * 100).toFixed(1)}%`);
    } else if (operation.anomalyScore > 0.5) {
      baseConfidence -= 8;
      concerns.push(`Moderate anomaly score: ${(operation.anomalyScore * 100).toFixed(1)}%`);
    }

    if (operation.affectsMultipleUsers > 50) {
      baseConfidence -= 10;
      concerns.push(`Affects ${operation.affectsMultipleUsers} users`);
    } else if (operation.affectsMultipleUsers > 20) {
      baseConfidence -= 5;
      concerns.push(`Affects ${operation.affectsMultipleUsers} users`);
    }

    if (operation.mathematicalComplexity === 'complex') {
      baseConfidence -= 20;
      concerns.push('Complex mathematical operations — deterministic verification required');
    } else if (operation.mathematicalComplexity === 'moderate') {
      baseConfidence -= 10;
      concerns.push('Moderate mathematical complexity — verification recommended');
    }

    if (operation.involvesCurrency) {
      baseConfidence -= 5;
      concerns.push('Currency operations require cent-precision verification');
    }

    if (operation.hasFloatingPointInputs) {
      baseConfidence -= 15;
      concerns.push('Floating-point inputs detected — high risk of precision drift in currency calculations');
      edgeCases.push('IEEE 754 floating-point: 0.1 + 0.2 !== 0.3');
    }

    const score = Math.max(0, Math.min(100, baseConfidence));

    return {
      score,
      concerns,
      edgeCases,
      recommendation: this.getRecommendation(score, operation),
    };
  }

  private getRecommendation(confidence: number, operation: TrinityOperation): VerificationRecommendation {
    if (CRITICAL_OPERATIONS.includes(operation.type)) {
      return {
        shouldVerify: true,
        reason: 'Critical operation - always verify with Claude',
        urgency: 'high',
      };
    }

    if (confidence >= 95) {
      return {
        shouldVerify: false,
        reason: 'High confidence - execute without verification',
        urgency: 'none',
      };
    }

    if (confidence >= 70) {
      const highStakes = 
        operation.financialImpact > 5000 ||
        operation.hasRegulatoryImplications ||
        operation.affectsMultipleUsers > 10 ||
        operation.involvesCurrency ||
        operation.mathematicalComplexity === 'moderate';

      return {
        shouldVerify: highStakes,
        reason: highStakes
          ? 'Medium confidence with high stakes - verify with Claude'
          : 'Medium confidence, low stakes - execute',
        urgency: highStakes ? 'medium' : 'none',
      };
    }

    if (confidence >= 60) {
      return {
        shouldVerify: true,
        reason: 'Lower confidence - verification recommended',
        urgency: 'medium',
      };
    }

    return {
      shouldVerify: true,
      reason: 'Low confidence - verification required',
      urgency: 'high',
    };
  }

  preCheckFinancialIntegrity(values: Record<string, number>): {
    passed: boolean;
    violations: string[];
    correctedValues: Record<string, number>;
  } {
    const violations: string[] = [];
    const correctedValues: Record<string, number> = {};

    for (const [key, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) {
        violations.push(`${key}: non-finite value (${value})`);
        correctedValues[key] = 0;
        continue;
      }

      const keyLower = key.toLowerCase();
      const allowedNegative = ['adjustment', 'refund', 'credit', 'discount', 'deduction', 'writeoff', 'write_off', 'correction', 'reversal'].some(k => keyLower.includes(k));
      if (value < 0 && !allowedNegative) {
        violations.push(`${key}: unexpected negative value (${value}) — only adjustments/refunds/credits/discounts/deductions/reversals may be negative`);
      }

      const cents = Math.round(value * 100);
      const reconstructed = cents / 100;
      if (Math.abs(value - reconstructed) > 0.001) {
        violations.push(`${key}: sub-cent precision detected (${value}) — rounding to ${reconstructed}`);
        correctedValues[key] = reconstructed;
      } else {
        correctedValues[key] = reconstructed;
      }

      if (Math.abs(cents) > 999_999_999_99) {
        violations.push(`${key}: exceeds safe currency range ($${value})`);
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      correctedValues,
    };
  }

  buildOperationFromContext(params: {
    type: string;
    workspaceId?: string;
    data: any;
    missingDataPoints?: number;
    edgeCases?: string[];
    hasHistoricalPrecedent?: boolean;
    financialImpact?: number;
    hasRegulatoryImplications?: boolean;
    anomalyScore?: number;
    affectsUsers?: number;
    mathematicalComplexity?: 'simple' | 'moderate' | 'complex';
    involvesCurrency?: boolean;
    hasFloatingPointInputs?: boolean;
  }): TrinityOperation {
    return {
      type: params.type,
      workspaceId: params.workspaceId,
      missingDataPoints: params.missingDataPoints || 0,
      edgeCasesDetected: params.edgeCases || [],
      hasHistoricalPrecedent: params.hasHistoricalPrecedent !== false,
      financialImpact: params.financialImpact || 0,
      hasRegulatoryImplications: params.hasRegulatoryImplications || false,
      anomalyScore: params.anomalyScore || 0,
      affectsMultipleUsers: params.affectsUsers || 1,
      mathematicalComplexity: params.mathematicalComplexity,
      involvesCurrency: params.involvesCurrency,
      hasFloatingPointInputs: params.hasFloatingPointInputs,
      data: params.data,
    };
  }
}

export const trinityConfidenceScorer = new TrinityConfidenceScorer();
