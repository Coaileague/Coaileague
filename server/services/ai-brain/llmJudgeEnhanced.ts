/**
 * ENHANCED LLM JUDGE - FORTUNE 500 GRADE
 * =======================================
 * Risk-aware evaluation with policy gating and regression memory.
 * Provides enforcement capabilities for critical platform operations.
 * 
 * Enhancements over base LLM Judge:
 * - Risk scoring for execution decisions
 * - Policy gating to block unsafe operations
 * - Regression memory to prevent repeated failures
 * - Affirmative verdicts required for critical deployments
 * - Database-backed persistence for learning
 */

import { db } from '../../db';
import { llmJudgeEvaluations, llmJudgeRegressions } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { aiBrainService } from './aiBrainService';
import { llmJudgeEvaluator, type EvaluationRequest, type EvaluationResult } from './llmJudgeEvaluator';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('llmJudgeEnhanced');

// ============================================================================
// TYPES
// ============================================================================

export interface RiskEvaluationRequest {
  subjectId: string;
  subjectType: 'action' | 'hotpatch' | 'response' | 'output' | 'workflow';
  content: any;
  context: Record<string, any>;
  workspaceId?: string;
  userId?: string;
  
  // Risk factors
  isDestructive?: boolean;
  affectsFinancials?: boolean;
  affectsUserData?: boolean;
  requiresHumanApproval?: boolean;
  
  // Domain context
  domain?: string;
  actionType?: string;
}

export interface RiskEvaluationResult {
  evaluationId: string;
  
  // Risk assessment
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  
  // Quality assessment
  qualityScore: number; // 0-100
  confidenceScore: number; // 0-1
  
  // Verdict
  verdict: 'approved' | 'rejected' | 'needs_review' | 'blocked';
  
  // Policy
  policyViolations: string[];
  isBlocked: boolean;
  blockReason?: string;
  
  // Regression check
  matchesKnownRegression: boolean;
  regressionPattern?: string;
  
  // Reasoning
  reasoning: string;
  criteria: RiskCriterion[];
  recommendations: string[];
  
  // Enforcement
  enforcementAction: 'allowed' | 'blocked' | 'flagged' | 'escalated';
  requiresApproval: boolean;
  approvalRoles?: string[];
  
  // Metadata
  evaluationTimeMs: number;
  timestamp: Date;
}

export interface RiskCriterion {
  name: string;
  score: number; // 0-100
  weight: number;
  reasoning: string;
  passed: boolean;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  conditions: PolicyCondition[];
  action: 'block' | 'warn' | 'require_approval' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
}

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'matches' | 'in';
  value: any;
}

export interface RegressionPattern {
  id: string;
  patternHash: string;
  actionType: string;
  domain?: string;
  failureSignature: string;
  failureCount: number;
  isBlocked: boolean;
  blockReason?: string;
  suggestedFix?: string;
  lastFailureAt: Date;
}

// ============================================================================
// RISK POLICIES
// ============================================================================

const RISK_POLICIES: PolicyRule[] = [
  {
    id: 'policy-destructive-ops',
    name: 'Destructive Operations Gate',
    description: 'Block destructive operations without approval',
    conditions: [
      { field: 'isDestructive', operator: 'equals', value: true },
    ],
    action: 'require_approval',
    severity: 'critical',
    isActive: true,
  },
  {
    id: 'policy-financial-ops',
    name: 'Financial Operations Gate',
    description: 'Require review for financial operations',
    conditions: [
      { field: 'affectsFinancials', operator: 'equals', value: true },
    ],
    action: 'require_approval',
    severity: 'high',
    isActive: true,
  },
  {
    id: 'policy-user-data',
    name: 'User Data Protection',
    description: 'Flag operations affecting user data',
    conditions: [
      { field: 'affectsUserData', operator: 'equals', value: true },
    ],
    action: 'warn',
    severity: 'medium',
    isActive: true,
  },
  {
    id: 'policy-hotpatch-safety',
    name: 'Hotpatch Safety Gate',
    description: 'Block hotpatches with high risk score',
    conditions: [
      { field: 'subjectType', operator: 'equals', value: 'hotpatch' },
      { field: 'riskScore', operator: 'gt', value: 70 },
    ],
    action: 'block',
    severity: 'critical',
    isActive: true,
  },
  {
    id: 'policy-known-regression',
    name: 'Known Regression Block',
    description: 'Block actions matching known failure patterns',
    conditions: [
      { field: 'matchesKnownRegression', operator: 'equals', value: true },
    ],
    action: 'block',
    severity: 'critical',
    isActive: true,
  },
];

// Risk criteria weights
const RISK_CRITERIA = [
  { name: 'data_integrity', description: 'Risk to data integrity', weight: 0.25 },
  { name: 'security_impact', description: 'Potential security implications', weight: 0.25 },
  { name: 'reversibility', description: 'Can the action be undone', weight: 0.15 },
  { name: 'scope', description: 'Breadth of impact', weight: 0.15 },
  { name: 'dependency_risk', description: 'Risk to dependent systems', weight: 0.10 },
  { name: 'compliance', description: 'Regulatory/compliance implications', weight: 0.10 },
];

// ============================================================================
// ENHANCED LLM JUDGE SERVICE
// ============================================================================

class EnhancedLLMJudge {
  private static instance: EnhancedLLMJudge;
  
  private regressionCache: Map<string, RegressionPattern> = new Map();
  private initialized: boolean = false;

  static getInstance(): EnhancedLLMJudge {
    if (!this.instance) {
      this.instance = new EnhancedLLMJudge();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Load regression patterns from database
      await this.loadRegressionPatterns();
      this.initialized = true;
      log.info('[EnhancedLLMJudge] Initialized with risk scoring and policy gating');
    } catch (error) {
      log.error('[EnhancedLLMJudge] Initialization error:', error);
    }
  }

  // ============================================================================
  // RISK EVALUATION
  // ============================================================================

  async evaluateRisk(request: RiskEvaluationRequest): Promise<RiskEvaluationResult> {
    const evaluationId = `risk-${crypto.randomUUID()}`;
    const startTime = Date.now();

    try {
      // Step 1: Check for known regression patterns
      const regressionCheck = await this.checkForRegression(request);
      
      // Step 2: Calculate risk score using AI
      const riskAssessment = await this.assessRisk(request);
      
      // Step 3: Evaluate quality
      const qualityScore = await this.assessQuality(request);
      
      // Step 4: Check policies
      const policyResult = this.evaluatePolicies(request, riskAssessment.riskScore, regressionCheck);
      
      // Step 5: Determine verdict
      const verdict = this.determineVerdict(riskAssessment, policyResult, regressionCheck);
      
      // Step 6: Determine enforcement action
      const enforcement = this.determineEnforcement(verdict, policyResult, request);

      const result: RiskEvaluationResult = {
        evaluationId,
        riskScore: riskAssessment.riskScore,
        riskLevel: this.getRiskLevel(riskAssessment.riskScore),
        qualityScore,
        confidenceScore: riskAssessment.confidence,
        verdict,
        policyViolations: policyResult.violations,
        isBlocked: enforcement.action === 'blocked',
        blockReason: enforcement.blockReason,
        matchesKnownRegression: regressionCheck.matches,
        regressionPattern: regressionCheck.pattern,
        reasoning: riskAssessment.reasoning,
        criteria: riskAssessment.criteria,
        recommendations: this.generateRecommendations(riskAssessment, policyResult),
        enforcementAction: enforcement.action,
        requiresApproval: enforcement.requiresApproval,
        approvalRoles: enforcement.approvalRoles,
        evaluationTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };

      // Persist evaluation
      await this.persistEvaluation(result, request);

      // Emit event
      platformEventBus.publish({
        type: 'risk_evaluation_completed',
        category: 'security',
        title: 'Risk Evaluation',
        description: `${request.subjectType} evaluated: ${verdict}`,
        metadata: {
          evaluationId,
          riskScore: result.riskScore,
          verdict,
          isBlocked: result.isBlocked,
        },
      }).catch((err) => log.warn('[llmJudgeEnhanced] Fire-and-forget failed:', err));

      return result;

    } catch (error: any) {
      log.error('[EnhancedLLMJudge] Risk evaluation failed:', error);
      
      return {
        evaluationId,
        riskScore: 100,
        riskLevel: 'critical',
        qualityScore: 0,
        confidenceScore: 0,
        verdict: 'blocked',
        policyViolations: ['Evaluation system error'],
        isBlocked: true,
        blockReason: `Evaluation failed: ${(error instanceof Error ? error.message : String(error))}`,
        matchesKnownRegression: false,
        reasoning: 'System error during evaluation',
        criteria: [],
        recommendations: ['Retry evaluation', 'Check system health'],
        enforcementAction: 'blocked',
        requiresApproval: true,
        evaluationTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  private async assessRisk(request: RiskEvaluationRequest): Promise<{
    riskScore: number;
    confidence: number;
    reasoning: string;
    criteria: RiskCriterion[];
  }> {
    const prompt = `
You are a Fortune 500-grade risk assessment expert. Evaluate the following operation for risk.

Subject Type: ${request.subjectType}
Subject ID: ${request.subjectId}
Action Type: ${request.actionType || 'unknown'}
Domain: ${request.domain || 'general'}

Content to evaluate:
${JSON.stringify(request.content, null, 2)}

Context:
${JSON.stringify(request.context, null, 2)}

Risk Flags:
- Is Destructive: ${request.isDestructive || false}
- Affects Financials: ${request.affectsFinancials || false}
- Affects User Data: ${request.affectsUserData || false}

Evaluate each risk criterion (score 0-100, where 100 is highest risk):
1. Data Integrity Risk - Could this corrupt or lose data?
2. Security Impact - Could this create security vulnerabilities?
3. Reversibility - Can this action be undone? (lower score = more reversible)
4. Scope - How many users/systems are affected?
5. Dependency Risk - Could this break dependent systems?
6. Compliance - Are there regulatory implications?

Respond with JSON:
{
  "overallRiskScore": number (0-100),
  "confidence": number (0-1),
  "reasoning": "detailed explanation",
  "criteria": [
    { "name": "data_integrity", "score": number, "reasoning": "explanation", "passed": boolean },
    { "name": "security_impact", "score": number, "reasoning": "explanation", "passed": boolean },
    { "name": "reversibility", "score": number, "reasoning": "explanation", "passed": boolean },
    { "name": "scope", "score": number, "reasoning": "explanation", "passed": boolean },
    { "name": "dependency_risk", "score": number, "reasoning": "explanation", "passed": boolean },
    { "name": "compliance", "score": number, "reasoning": "explanation", "passed": boolean }
  ]
}
`;

    try {
      const response = await (aiBrainService as any).query({
        prompt,
        systemPrompt: 'You are a security and risk assessment expert. Provide accurate, conservative risk evaluations. When in doubt, err on the side of caution.',
        featureId: 'risk_evaluation',
        workspaceId: request.workspaceId,
        userId: request.userId,
        responseFormat: 'json',
      });

      const parsed = JSON.parse(response.response || '{}');
      
      return {
        riskScore: parsed.overallRiskScore || 50,
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || 'Evaluation completed',
        criteria: (parsed.criteria || []).map((c: any) => ({
          name: c.name,
          score: c.score || 50,
          weight: RISK_CRITERIA.find(rc => rc.name === c.name)?.weight || 0.1,
          reasoning: c.reasoning || '',
          passed: c.score < 70,
        })),
      };
    } catch (error) {
      // Default to high risk on failure
      return {
        riskScore: 80,
        confidence: 0.3,
        reasoning: 'Risk assessment failed - defaulting to high risk',
        criteria: RISK_CRITERIA.map(c => ({
          name: c.name,
          score: 70,
          weight: c.weight,
          reasoning: 'Unable to assess',
          passed: false,
        })),
      };
    }
  }

  private async assessQuality(request: RiskEvaluationRequest): Promise<number> {
    try {
      // Use base LLM Judge for quality assessment
      const result = await llmJudgeEvaluator.evaluate({
        workspaceId: request.workspaceId as string,
        userId: request.userId as string,
        content: request.content,
        contentType: request.subjectType === 'hotpatch' ? 'code' : 'json',
        criteria: [
          { name: 'correctness', description: 'Is this correct?', weight: 0.4, scoringGuide: '1-5', minScore: 1, maxScore: 5 },
          { name: 'completeness', description: 'Is this complete?', weight: 0.3, scoringGuide: '1-5', minScore: 1, maxScore: 5 },
          { name: 'safety', description: 'Is this safe?', weight: 0.3, scoringGuide: '1-5', minScore: 1, maxScore: 5 },
        ],
      });

      return result.overallScore * 20; // Convert 1-5 to 0-100
    } catch {
      return 50; // Default quality
    }
  }

  // ============================================================================
  // REGRESSION MEMORY
  // ============================================================================

  private async checkForRegression(request: RiskEvaluationRequest): Promise<{
    matches: boolean;
    pattern?: string;
    blockedReason?: string;
  }> {
    const patternHash = this.generatePatternHash(request);
    
    // Check cache first
    const cached = this.regressionCache.get(patternHash);
    if (cached) {
      if (cached.isBlocked) {
        return {
          matches: true,
          pattern: cached.failureSignature,
          blockedReason: cached.blockReason,
        };
      }
      return { matches: cached.failureCount >= 3, pattern: cached.failureSignature };
    }

    // Check database
    try {
      const [existing] = await db
        .select()
        .from(llmJudgeRegressions)
        .where(eq(llmJudgeRegressions.patternHash, patternHash))
        .limit(1);

      if (existing) {
        const pattern: RegressionPattern = {
          id: existing.id,
          patternHash: existing.patternHash,
          actionType: existing.actionType,
          domain: existing.domain || undefined,
          failureSignature: existing.failureSignature,
          failureCount: existing.failureCount || 1,
          isBlocked: existing.isBlocked || false,
          blockReason: existing.blockReason || undefined,
          suggestedFix: existing.suggestedFix || undefined,
          lastFailureAt: existing.updatedAt || new Date(),
        };

        this.regressionCache.set(patternHash, pattern);

        if (pattern.isBlocked) {
          return { matches: true, pattern: pattern.failureSignature, blockedReason: pattern.blockReason };
        }

        return { matches: pattern.failureCount >= 3, pattern: pattern.failureSignature };
      }
    } catch (error) {
      log.error('[EnhancedLLMJudge] Regression check failed:', error);
    }

    return { matches: false };
  }

  async recordFailure(request: RiskEvaluationRequest, errorMessage: string): Promise<void> {
    const patternHash = this.generatePatternHash(request);
    const failureSignature = `${request.actionType || 'unknown'}: ${errorMessage.substring(0, 200)}`;

    try {
      // Check if pattern exists
      const [existing] = await db
        .select()
        .from(llmJudgeRegressions)
        .where(eq(llmJudgeRegressions.patternHash, patternHash))
        .limit(1);

      if (existing) {
        // Update existing pattern
        const newCount = (existing.failureCount || 1) + 1;
        const shouldBlock = newCount >= 5;

        await db
          .update(llmJudgeRegressions)
          .set({
            failureCount: newCount,
            lastFailureAt: new Date(),
            isBlocked: shouldBlock,
            blockReason: shouldBlock ? `Blocked after ${newCount} consecutive failures` : null,
            updatedAt: new Date(),
          })
          .where(eq(llmJudgeRegressions.id, existing.id));

        // Update cache
        this.regressionCache.set(patternHash, {
          ...existing as any,
          failureCount: newCount,
          isBlocked: shouldBlock,
        });
      } else {
        // Insert new pattern
        await db.insert(llmJudgeRegressions).values({
          workspaceId: 'system',
          patternHash,
          actionType: request.actionType || 'unknown',
          domain: request.domain,
          failureSignature,
          failureCount: 1,
          lastFailureAt: new Date(),
          isBlocked: false,
        });
      }

      log.info(`[EnhancedLLMJudge] Recorded failure pattern: ${patternHash.substring(0, 8)}...`);
    } catch (error) {
      log.error('[EnhancedLLMJudge] Failed to record failure:', error);
    }
  }

  async recordSuccess(request: RiskEvaluationRequest): Promise<void> {
    const patternHash = this.generatePatternHash(request);

    try {
      // If pattern exists, reduce failure count or mark fix as applied
      const [existing] = await db
        .select()
        .from(llmJudgeRegressions)
        .where(eq(llmJudgeRegressions.patternHash, patternHash))
        .limit(1);

      if (existing && (existing.failureCount || 0) > 0) {
        const newCount = Math.max(0, (existing.failureCount || 1) - 1);
        
        await db
          .update(llmJudgeRegressions)
          .set({
            failureCount: newCount,
            isBlocked: newCount >= 5 ? existing.isBlocked : false,
            fixApplied: true,
            fixResult: 'success',
            updatedAt: new Date(),
          })
          .where(eq(llmJudgeRegressions.id, existing.id));

        // Clear from cache to force reload
        this.regressionCache.delete(patternHash);
      }
    } catch (error) {
      log.error('[EnhancedLLMJudge] Failed to record success:', error);
    }
  }

  private generatePatternHash(request: RiskEvaluationRequest): string {
    const pattern = `${request.subjectType}:${request.actionType || 'unknown'}:${request.domain || 'general'}`;
    return crypto.createHash('sha256').update(pattern).digest('hex');
  }

  private async loadRegressionPatterns(): Promise<void> {
    try {
      const patterns = await db
        .select()
        .from(llmJudgeRegressions)
        .where(eq(llmJudgeRegressions.isBlocked, true))
        .limit(1000);

      for (const p of patterns) {
        this.regressionCache.set(p.patternHash, {
          id: p.id,
          patternHash: p.patternHash,
          actionType: p.actionType,
          domain: p.domain || undefined,
          failureSignature: p.failureSignature,
          failureCount: p.failureCount || 0,
          isBlocked: p.isBlocked || false,
          blockReason: p.blockReason || undefined,
          suggestedFix: p.suggestedFix || undefined,
          lastFailureAt: p.updatedAt || new Date(),
        });
      }

      log.info(`[EnhancedLLMJudge] Loaded ${patterns.length} blocked regression patterns`);
    } catch (error) {
      log.error('[EnhancedLLMJudge] Failed to load regression patterns:', error);
    }
  }

  // ============================================================================
  // POLICY EVALUATION
  // ============================================================================

  private evaluatePolicies(
    request: RiskEvaluationRequest,
    riskScore: number,
    regressionCheck: { matches: boolean }
  ): {
    violations: string[];
    action: 'allow' | 'block' | 'warn' | 'require_approval';
    triggeredPolicies: PolicyRule[];
  } {
    const violations: string[] = [];
    const triggeredPolicies: PolicyRule[] = [];
    let highestAction: 'allow' | 'block' | 'warn' | 'require_approval' = 'allow';

    const evaluationContext = {
      ...request,
      riskScore,
      matchesKnownRegression: regressionCheck.matches,
    };

    for (const policy of RISK_POLICIES) {
      if (!policy.isActive) continue;

      const triggered = this.evaluatePolicyConditions(policy.conditions, evaluationContext);
      
      if (triggered) {
        violations.push(`${policy.name}: ${policy.description}`);
        triggeredPolicies.push(policy);

        // Determine highest severity action
        if (policy.action === 'block') {
          highestAction = 'block';
        } else if (policy.action === 'require_approval' && highestAction !== 'block') {
          highestAction = 'require_approval';
        } else if (policy.action === 'warn' && highestAction === 'allow') {
          highestAction = 'warn';
        }
      }
    }

    return { violations, action: highestAction, triggeredPolicies };
  }

  private evaluatePolicyConditions(conditions: PolicyCondition[], context: any): boolean {
    return conditions.every(condition => {
      const fieldValue = this.getNestedValue(context, condition.field);
      
      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value;
        case 'contains':
          return String(fieldValue).includes(String(condition.value));
        case 'gt':
          return Number(fieldValue) > Number(condition.value);
        case 'lt':
          return Number(fieldValue) < Number(condition.value);
        case 'matches':
          return new RegExp(condition.value).test(String(fieldValue));
        case 'in':
          return Array.isArray(condition.value) && condition.value.includes(fieldValue);
        default:
          return false;
      }
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ============================================================================
  // VERDICT AND ENFORCEMENT
  // ============================================================================

  private determineVerdict(
    riskAssessment: { riskScore: number },
    policyResult: { action: string; violations: string[] },
    regressionCheck: { matches: boolean; blockedReason?: string }
  ): 'approved' | 'rejected' | 'needs_review' | 'blocked' {
    // Blocked if regression pattern is blocked
    if (regressionCheck.blockedReason) {
      return 'blocked';
    }

    // Blocked if policy says block
    if (policyResult.action === 'block') {
      return 'blocked';
    }

    // Needs review if high risk or requires approval
    if (policyResult.action === 'require_approval' || riskAssessment.riskScore > 70) {
      return 'needs_review';
    }

    // Rejected if medium-high risk
    if (riskAssessment.riskScore > 50) {
      return 'rejected';
    }

    return 'approved';
  }

  private determineEnforcement(
    verdict: string,
    policyResult: { triggeredPolicies: PolicyRule[] },
    request: RiskEvaluationRequest
  ): {
    action: 'allowed' | 'blocked' | 'flagged' | 'escalated';
    requiresApproval: boolean;
    approvalRoles?: string[];
    blockReason?: string;
  } {
    if (verdict === 'blocked') {
      return {
        action: 'blocked',
        requiresApproval: true,
        approvalRoles: ['org_owner', 'co_owner', 'org_admin', 'security_admin'],
        blockReason: policyResult.triggeredPolicies.map(p => p.name).join(', ') || 'Policy violation',
      };
    }

    if (verdict === 'needs_review') {
      return {
        action: 'escalated',
        requiresApproval: true,
        approvalRoles: ['org_owner', 'co_owner', 'org_admin', 'manager'],
      };
    }

    if (verdict === 'rejected') {
      return {
        action: 'flagged',
        requiresApproval: request.requiresHumanApproval || false,
        approvalRoles: request.requiresHumanApproval ? ['org_owner', 'co_owner'] : undefined,
      };
    }

    return {
      action: 'allowed',
      requiresApproval: false,
    };
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    riskAssessment: { riskScore: number; criteria: RiskCriterion[] },
    policyResult: { violations: string[] }
  ): string[] {
    const recommendations: string[] = [];

    // Add recommendations based on failed criteria
    for (const criterion of riskAssessment.criteria) {
      if (!criterion.passed) {
        switch (criterion.name) {
          case 'data_integrity':
            recommendations.push('Add data backup before proceeding');
            break;
          case 'security_impact':
            recommendations.push('Request security review');
            break;
          case 'reversibility':
            recommendations.push('Create rollback plan');
            break;
          case 'scope':
            recommendations.push('Consider phased rollout');
            break;
          case 'dependency_risk':
            recommendations.push('Test in isolated environment first');
            break;
          case 'compliance':
            recommendations.push('Consult compliance team');
            break;
        }
      }
    }

    // Add recommendations based on policy violations
    if (policyResult.violations.length > 0) {
      recommendations.push('Review policy requirements before proceeding');
    }

    return recommendations;
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async persistEvaluation(result: RiskEvaluationResult, request: RiskEvaluationRequest): Promise<void> {
    try {
      await db.insert(llmJudgeEvaluations).values({
        evaluationType: 'risk',
        subjectId: request.subjectId,
        subjectType: request.subjectType,
        verdict: result.verdict,
        riskScore: result.riskScore,
        confidenceScore: result.confidenceScore,
        qualityScore: result.qualityScore,
        reasoning: result.reasoning,
        criteria: result.criteria,
        policyViolations: result.policyViolations,
        requestContext: request.context,
        evaluatorModel: 'gemini-2.5-flash',
        evaluationTimeMs: result.evaluationTimeMs,
        enforcementAction: result.enforcementAction,
        workspaceId: request.workspaceId,
      });
    } catch (error) {
      log.error('[EnhancedLLMJudge] Failed to persist evaluation:', error);
    }
  }

  // ============================================================================
  // HOTPATCH GATING
  // ============================================================================

  async evaluateHotpatch(
    patchContent: string,
    context: {
      targetFile: string;
      changeDescription: string;
      workspaceId?: string;
      userId?: string;
    }
  ): Promise<RiskEvaluationResult & { canDeploy: boolean }> {
    const result = await this.evaluateRisk({
      subjectId: `hotpatch-${crypto.randomUUID().substring(0, 8)}`,
      subjectType: 'hotpatch',
      content: patchContent,
      context: {
        targetFile: context.targetFile,
        description: context.changeDescription,
      },
      workspaceId: context.workspaceId,
      userId: context.userId,
      actionType: 'code_modification',
      domain: 'automation',
    });

    const canDeploy = result.verdict === 'approved' && !result.isBlocked;

    if (!canDeploy && result.verdict !== 'approved') {
      log.info(`[EnhancedLLMJudge] Hotpatch blocked: ${result.blockReason || result.verdict}`);
    }

    return { ...result, canDeploy };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getActivePolicies(): PolicyRule[] {
    return RISK_POLICIES.filter(p => p.isActive);
  }

  async getRecentEvaluations(workspaceId: string, limit: number = 50): Promise<any[]> {
    try {
      return await db
        .select()
        .from(llmJudgeEvaluations)
        .where(eq(llmJudgeEvaluations.workspaceId, workspaceId))
        .orderBy(desc(llmJudgeEvaluations.createdAt))
        .limit(limit);
    } catch {
      return [];
    }
  }

  async getBlockedPatterns(): Promise<RegressionPattern[]> {
    return Array.from(this.regressionCache.values()).filter(p => p.isBlocked);
  }
}

export const enhancedLLMJudge = EnhancedLLMJudge.getInstance();
