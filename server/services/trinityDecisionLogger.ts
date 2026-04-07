import { db } from '../db';
import { trinityDecisionLog } from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('trinityDecisionLogger');


interface CandidateEvaluation {
  candidateId: string;
  name: string;
  rankScore: number;
  proximityMiles?: number;
  otRisk?: boolean;
  otHoursProjected?: number;
  complianceStatus?: string;
  reliabilityScore?: number;
  costImpact?: number;
  reasoning: string;
}

interface DecisionLogEntry {
  workspaceId: string;
  triggerEvent?: string;
  taskType?: string;
  taskComplexity?: string;
  decisionType: string;
  domain: string;
  chosenOption: string;
  chosenOptionId?: string;
  reasoning: string;
  alternativesConsidered?: Array<{
    optionId: string;
    optionLabel: string;
    rejectionReason: string;
    score?: number;
  }>;
  candidatesEvaluated?: CandidateEvaluation[];
  contextSnapshot?: Record<string, any>;
  confidenceScore?: string;
  primaryModel?: string;
  tokensUsed?: number;
  costUsd?: string;
  fallbackChainUsed?: boolean;
  modelsAttempted?: string[];
  relatedEntityType?: string;
  relatedEntityId?: string;
}

interface TriadJusticeResult {
  triggered: boolean;
  verdict?: 'AFFIRM' | 'OVERRIDE' | 'ESCALATE';
  judgeModel?: string;
  reasoning?: string;
  suggestedAlternative?: string;
  originalScore?: number;
}

class TrinityDecisionLogger {
  async logDecision(entry: DecisionLogEntry): Promise<string | null> {
    try {
      const [record] = await db.insert(trinityDecisionLog).values({
        workspaceId: entry.workspaceId,
        triggerEvent: entry.triggerEvent,
        taskType: entry.taskType,
        taskComplexity: entry.taskComplexity,
        decisionType: entry.decisionType,
        domain: entry.domain,
        chosenOption: entry.chosenOption,
        chosenOptionId: entry.chosenOptionId,
        reasoning: entry.reasoning,
        alternativesConsidered: entry.alternativesConsidered,
        candidatesEvaluated: entry.candidatesEvaluated,
        contextSnapshot: entry.contextSnapshot,
        confidenceScore: entry.confidenceScore,
        primaryModel: entry.primaryModel || 'gemini',
        tokensUsed: entry.tokensUsed,
        costUsd: entry.costUsd,
        fallbackChainUsed: entry.fallbackChainUsed || false,
        modelsAttempted: entry.modelsAttempted,
        relatedEntityType: entry.relatedEntityType,
        relatedEntityId: entry.relatedEntityId,
      }).returning();

      return record.id;
    } catch (error) {
      log.error('[TrinityDecisionLog] Failed to log decision:', error);
      return null;
    }
  }

  shouldTriggerTriad(params: {
    confidenceScore: number;
    domain: string;
    candidates?: CandidateEvaluation[];
    triggerEvent?: string;
  }): boolean {
    if (params.confidenceScore < 0.75) return true;

    const moneyDomains = ['payroll', 'invoicing', 'billing'];
    if (moneyDomains.includes(params.domain)) return true;

    const complianceDomains = ['compliance'];
    if (complianceDomains.includes(params.domain)) return true;

    const safetyTriggers = ['armed_post', 'high_clearance', 'safety_check'];
    if (params.triggerEvent && safetyTriggers.includes(params.triggerEvent)) return true;

    if (params.candidates && params.candidates.length >= 2) {
      const sorted = [...params.candidates].sort((a, b) => b.rankScore - a.rankScore);
      if (sorted.length >= 2 && Math.abs(sorted[0].rankScore - sorted[1].rankScore) < 0.05) {
        return true;
      }
    }

    return false;
  }

  async evaluateWithTriadJustice(params: {
    workspaceId: string;
    userId?: string;
    decisionLogId: string;
    originalConfidence: number;
    domain: string;
    chosenOption: string;
    chosenOptionId?: string;
    reasoning: string;
    candidates?: CandidateEvaluation[];
    contextSnapshot?: Record<string, any>;
  }): Promise<TriadJusticeResult> {
    try {
      const { claudeService } = await import('./ai-brain/dualai/claudeService');

      if (!claudeService.isAvailable()) {
        log.warn('[TriadJustice] Claude unavailable, skipping review');
        return { triggered: true, verdict: 'AFFIRM', judgeModel: 'none', reasoning: 'Claude unavailable, auto-affirming' };
      }

      const candidateSummary = params.candidates?.map(c =>
        `- ${c.name} (ID: ${c.candidateId}): score=${c.rankScore.toFixed(2)}, ` +
        `proximity=${c.proximityMiles?.toFixed(1) || 'N/A'}mi, ` +
        `OT risk=${c.otRisk ? 'YES' : 'no'}, ` +
        `compliance=${c.complianceStatus || 'unknown'}, ` +
        `reliability=${c.reliabilityScore?.toFixed(2) || 'N/A'}, ` +
        `cost impact=$${c.costImpact?.toFixed(2) || '0'} — ${c.reasoning}`
      ).join('\n') || 'No candidate data';

      const task = `TRIAD JUSTICE REVIEW — You are the independent judge reviewing Trinity's AI decision.

DOMAIN: ${params.domain}
TRINITY'S CONFIDENCE: ${(params.originalConfidence * 100).toFixed(0)}%

TRINITY'S CHOICE: ${params.chosenOption}
TRINITY'S REASONING: ${params.reasoning}

ALL CANDIDATES EVALUATED:
${candidateSummary}

CONTEXT: ${JSON.stringify(params.contextSnapshot || {}).substring(0, 2000)}

YOUR TASK: Evaluate whether Trinity made the right call. Consider:
1. Was the highest-scoring candidate truly the best choice given all factors?
2. Are there compliance risks Trinity may have underweighted?
3. Is the cost impact acceptable?
4. Are there safety concerns?

RESPOND WITH EXACTLY THIS JSON FORMAT:
{
  "verdict": "AFFIRM" or "OVERRIDE" or "ESCALATE",
  "reasoning": "Your detailed reasoning for the verdict",
  "suggestedAlternativeId": null or "candidate_id if OVERRIDE"
}

AFFIRM = Trinity made the right call
OVERRIDE = A different candidate is clearly better (provide who)
ESCALATE = Too risky for AI, flag for human review`;

      const response = await claudeService.processRequest({
        task,
        taskType: 'triad_justice_review',
        context: {
          workspaceId: params.workspaceId,
          userId: params.userId || 'system',
          sessionId: `triad-${params.decisionLogId}`,
        },
        maxTokens: 500,
        temperature: 0.2,
      });

      let verdict: 'AFFIRM' | 'OVERRIDE' | 'ESCALATE' = 'AFFIRM';
      let judgeReasoning = response.content;
      let suggestedAlt: string | undefined;

      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          verdict = (['AFFIRM', 'OVERRIDE', 'ESCALATE'].includes(parsed.verdict))
            ? parsed.verdict : 'AFFIRM';
          judgeReasoning = parsed.reasoning || response.content;
          suggestedAlt = parsed.suggestedAlternativeId || undefined;
        }
      } catch {
        if (response.content.includes('OVERRIDE')) verdict = 'OVERRIDE';
        else if (response.content.includes('ESCALATE')) verdict = 'ESCALATE';
      }

      await db.update(trinityDecisionLog)
        .set({
          triadReviewTriggered: true,
          judgeModel: 'claude',
          originalScore: String(params.originalConfidence),
          claudeVerdict: verdict,
          claudeReasoning: judgeReasoning,
          claudeSuggestedAlternative: suggestedAlt,
          tokensUsed: response.tokensUsed,
          updatedAt: new Date(),
        })
        .where(eq(trinityDecisionLog.id, params.decisionLogId));

      log.info(`[TriadJustice] Verdict: ${verdict} for decision ${params.decisionLogId}`);

      return {
        triggered: true,
        verdict,
        judgeModel: 'claude',
        reasoning: judgeReasoning,
        suggestedAlternative: suggestedAlt,
        originalScore: params.originalConfidence,
      };
    } catch (error: any) {
      log.error('[TriadJustice] Review failed (non-blocking):', (error instanceof Error ? error.message : String(error)));

      try {
        await db.update(trinityDecisionLog)
          .set({
            triadReviewTriggered: true,
            judgeModel: 'none',
            claudeVerdict: 'AFFIRM',
            claudeReasoning: `Triad review failed: ${(error instanceof Error ? error.message : String(error))}. Auto-affirming.`,
            updatedAt: new Date(),
          })
          .where(eq(trinityDecisionLog.id, params.decisionLogId));
      } catch (updateErr: any) {
        log.warn(`[TrinityDecisionLogger] Failed to update decision log ${params.decisionLogId} after triad review failure: ${updateErr?.message}`);
      }

      return { triggered: true, verdict: 'AFFIRM', judgeModel: 'none', reasoning: `Review failed: ${error.message}` };
    }
  }

  async logSchedulingDecision(params: {
    workspaceId: string;
    shiftId: string;
    chosenEmployeeId: string;
    chosenEmployeeName: string;
    reasoning: string;
    alternatives: Array<{
      employeeId: string;
      employeeName: string;
      rejectionReason: string;
      score?: number;
    }>;
    candidatesEvaluated?: CandidateEvaluation[];
    contextSnapshot?: Record<string, any>;
    confidenceScore?: string;
    triggerEvent?: string;
  }): Promise<string | null> {
    return this.logDecision({
      workspaceId: params.workspaceId,
      triggerEvent: params.triggerEvent || 'shift_fill',
      taskType: 'scheduling',
      taskComplexity: params.candidatesEvaluated && params.candidatesEvaluated.length > 5 ? 'complex' : 'operational',
      decisionType: 'shift_assignment',
      domain: 'scheduling',
      chosenOption: params.chosenEmployeeName,
      chosenOptionId: params.chosenEmployeeId,
      reasoning: params.reasoning,
      alternativesConsidered: params.alternatives.map(a => ({
        optionId: a.employeeId,
        optionLabel: a.employeeName,
        rejectionReason: a.rejectionReason,
        score: a.score,
      })),
      candidatesEvaluated: params.candidatesEvaluated,
      contextSnapshot: params.contextSnapshot,
      confidenceScore: params.confidenceScore,
      primaryModel: 'gemini',
      relatedEntityType: 'shift',
      relatedEntityId: params.shiftId,
    });
  }

  async logComplianceDecision(params: {
    workspaceId: string;
    employeeId: string;
    decisionType: string;
    chosenAction: string;
    reasoning: string;
    contextSnapshot?: Record<string, any>;
    triggerEvent?: string;
  }): Promise<string | null> {
    return this.logDecision({
      workspaceId: params.workspaceId,
      triggerEvent: params.triggerEvent || 'compliance_check',
      taskType: 'compliance',
      taskComplexity: 'operational',
      decisionType: params.decisionType,
      domain: 'compliance',
      chosenOption: params.chosenAction,
      chosenOptionId: params.employeeId,
      reasoning: params.reasoning,
      contextSnapshot: params.contextSnapshot,
      relatedEntityType: 'employee',
      relatedEntityId: params.employeeId,
    });
  }

  async logPayrollDecision(params: {
    workspaceId: string;
    payrollRunId: string;
    decisionType: string;
    chosenAction: string;
    reasoning: string;
    contextSnapshot?: Record<string, any>;
    confidenceScore?: string;
    triggerEvent?: string;
  }): Promise<string | null> {
    return this.logDecision({
      workspaceId: params.workspaceId,
      triggerEvent: params.triggerEvent || 'payroll_process',
      taskType: 'payroll',
      taskComplexity: 'strategic',
      decisionType: params.decisionType,
      domain: 'payroll',
      chosenOption: params.chosenAction,
      chosenOptionId: params.payrollRunId,
      reasoning: params.reasoning,
      contextSnapshot: params.contextSnapshot,
      confidenceScore: params.confidenceScore,
      relatedEntityType: 'payroll_run',
      relatedEntityId: params.payrollRunId,
    });
  }

  async logInvoicingDecision(params: {
    workspaceId: string;
    invoiceId: string;
    decisionType: string;
    chosenAction: string;
    reasoning: string;
    contextSnapshot?: Record<string, any>;
    confidenceScore?: string;
    triggerEvent?: string;
  }): Promise<string | null> {
    return this.logDecision({
      workspaceId: params.workspaceId,
      triggerEvent: params.triggerEvent || 'invoice_generate',
      taskType: 'invoicing',
      taskComplexity: 'operational',
      decisionType: params.decisionType,
      domain: 'invoicing',
      chosenOption: params.chosenAction,
      chosenOptionId: params.invoiceId,
      reasoning: params.reasoning,
      contextSnapshot: params.contextSnapshot,
      confidenceScore: params.confidenceScore,
      relatedEntityType: 'invoice',
      relatedEntityId: params.invoiceId,
    });
  }

  async getDecisionsForWorkspace(workspaceId: string, filters?: {
    domain?: string;
    limit?: number;
    offset?: number;
    triggerEvent?: string;
    triadOnly?: boolean;
  }) {
    try {
      const limit = Math.min(filters?.limit || 50, 200);
      const offset = filters?.offset || 0;

      const conditions: any[] = [eq(trinityDecisionLog.workspaceId, workspaceId)];

      if (filters?.domain) {
        conditions.push(eq(trinityDecisionLog.domain, filters.domain));
      }
      if (filters?.triggerEvent) {
        conditions.push(eq(trinityDecisionLog.triggerEvent, filters.triggerEvent));
      }
      if (filters?.triadOnly) {
        conditions.push(eq(trinityDecisionLog.triadReviewTriggered, true));
      }

      const results = await db.select()
        .from(trinityDecisionLog)
        .where(and(...conditions))
        .orderBy(desc(trinityDecisionLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count: total }] = await db.select({ count: sql<number>`count(*)` })
        .from(trinityDecisionLog)
        .where(and(...conditions));

      return { decisions: results, total: Number(total), limit, offset };
    } catch (error) {
      log.error('[TrinityDecisionLog] Failed to query decisions:', error);
      return { decisions: [], total: 0, limit: 50, offset: 0 };
    }
  }

  async getDecisionsForEntity(entityType: string, entityId: string, workspaceId: string, limit = 20) {
    try {
      return await db.select()
        .from(trinityDecisionLog)
        .where(and(
          eq(trinityDecisionLog.workspaceId, workspaceId),
          eq(trinityDecisionLog.relatedEntityType, entityType),
          eq(trinityDecisionLog.relatedEntityId, entityId)
        ))
        .orderBy(desc(trinityDecisionLog.createdAt))
        .limit(limit);
    } catch (error) {
      log.error('[TrinityDecisionLog] Failed to query decisions:', error);
      return [];
    }
  }

  async markHumanOverride(decisionId: string, workspaceId: string, overrideBy: string, reason: string) {
    try {
      await db.update(trinityDecisionLog)
        .set({
          humanOverride: true,
          overrideBy,
          overrideReason: reason,
          outcomeStatus: 'overridden',
          updatedAt: new Date(),
        })
        .where(and(
          eq(trinityDecisionLog.id, decisionId),
          eq(trinityDecisionLog.workspaceId, workspaceId)
        ));
    } catch (error) {
      log.error('[TrinityDecisionLog] Failed to mark override:', error);
    }
  }

  async markOutcome(decisionId: string, workspaceId: string, status: string) {
    try {
      await db.update(trinityDecisionLog)
        .set({ outcomeStatus: status, updatedAt: new Date() })
        .where(and(
          eq(trinityDecisionLog.id, decisionId),
          eq(trinityDecisionLog.workspaceId, workspaceId)
        ));
    } catch (error) {
      log.error('[TrinityDecisionLog] Failed to mark outcome:', error);
    }
  }
}

export const trinityDecisionLogger = new TrinityDecisionLogger();
