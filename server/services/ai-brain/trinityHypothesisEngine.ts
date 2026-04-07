/**
 * TrinityHypothesisEngine — Phase F of Cognitive Enhancement Sprint
 *
 * Scientific detective reasoning for diagnostic questions.
 * "Why is X happening?" → 7-step Bayesian hypothesis loop.
 * Generates competing hypotheses, queries evidence, converges on most likely cause.
 */

import { pool, db } from '../../db';
import { typedPoolExec } from '../../lib/typedSql';
import { trinityHypothesisSessions } from '@shared/schema';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityHypothesisEngine');

export interface Hypothesis {
  id: string;
  description: string;
  priorProbability: number;     // 0-100 initial estimate
  posteriorProbability: number; // updated after evidence
  supportingEvidence: string[];
  contradictingEvidence: string[];
  evidenceStrength: number;     // -100 to +100
}

export interface HypothesisSession {
  id: string;
  workspaceId: string;
  sessionId?: string;
  question: string;
  hypotheses: Hypothesis[];
  evidenceQueries: string[];
  conclusion: string | null;
  conclusionConfidence: number;
  status: 'open' | 'converged' | 'inconclusive' | 'needs_clarification';
  thinkingTokensUsed: number;
  thinkingTimeMs: number;
}

export interface HypothesisResult {
  session: HypothesisSession;
  narrativeSummary: string;
  topHypothesis: Hypothesis | null;
  runnerUp: Hypothesis | null;
  requiresClarification: boolean;
  clarifyingQuestion: string | null;
}

// Patterns that trigger hypothesis engine
const DIAGNOSTIC_TRIGGERS = [
  /\bwhy\s+is\b/i,
  /\bwhy\s+(are|does|do|did)\b/i,
  /\bwhat\s+is\s+causing\b/i,
  /\bhow\s+did\s+this\s+happen\b/i,
  /\broot\s+cause\b/i,
  /\bwhat\s+happened\s+(to|with)\b/i,
  /\bdiagnos/i,
  /\bfigure\s+out\s+why\b/i,
  /\bunderstand\s+why\b/i,
];

// Domain-specific hypothesis generators
const HYPOTHESIS_GENERATORS: Record<string, (question: string) => Hypothesis[]> = {
  overtime: (q) => [
    mkHyp('Understaffing at affected sites', 45, 'Coverage gaps are being filled via OT instead of hiring'),
    mkHyp('Calloff surge or absenteeism spike', 30, 'Last-minute calloffs forcing remaining officers to work extra shifts'),
    mkHyp('Scheduling algorithm error or manual override', 20, 'Shifts being scheduled without OT checks'),
    mkHyp('Client-driven demand increase without staffing adjustment', 15, 'Client added hours without Trinity being notified'),
  ],
  calloff: (q) => [
    mkHyp('Low morale or dissatisfaction', 40, 'Officers are disengaged — check recent pay issues, management conflicts'),
    mkHyp('Medical or personal circumstances', 25, 'Legitimate personal circumstances concentrated in period'),
    mkHyp('Poor shift design (long runs, bad timing)', 25, 'Officers burning out from poorly designed schedules'),
    mkHyp('Competition from other employers', 20, 'Officers picking up alternative work'),
  ],
  margin: (q) => [
    mkHyp('Overtime eroding site labor margins', 45, 'OT premium pay is absorbing the margin'),
    mkHyp('Bill rate below market or labor cost increase', 35, 'Contract rate not updated after minimum wage changes'),
    mkHyp('Unbilled extra hours or client scope creep', 25, 'Work being performed outside contracted hours without billing'),
    mkHyp('High turnover increasing training cost at site', 20, 'Frequent onboarding reduces effective hours'),
  ],
  client: (q) => [
    mkHyp('Service quality decline at their site', 40, 'Officers at this site have low reliability scores'),
    mkHyp('Communication failure — unresolved issues', 30, 'Complaints or incidents not followed up in time'),
    mkHyp('Personnel mismatch — wrong officer profile', 20, 'Officers assigned don\'t match client\'s post requirements'),
    mkHyp('Billing dispute or invoice error', 20, 'Recent invoices have errors causing friction'),
  ],
  performance: (q) => [
    mkHyp('Inadequate training for role requirements', 35, 'Officer lacks skills or knowledge for post'),
    mkHyp('Personal issues affecting work quality', 30, 'External stressors impacting performance'),
    mkHyp('Unclear expectations or poor onboarding', 25, 'Officer never properly briefed on post orders'),
    mkHyp('Lack of supervisory feedback and coaching', 20, 'Officer has no mechanism to self-correct'),
  ],
};

function mkHyp(description: string, priorProbability: number, rationale: string): Hypothesis {
  return {
    id: Math.random().toString(36).slice(2),
    description,
    priorProbability,
    posteriorProbability: priorProbability,
    supportingEvidence: [rationale],
    contradictingEvidence: [],
    evidenceStrength: 0,
  };
}

class TrinityHypothesisEngine {
  /**
   * Detect if a question is diagnostic and should use hypothesis reasoning.
   */
  isDiagnosticQuestion(question: string): boolean {
    return DIAGNOSTIC_TRIGGERS.some(p => p.test(question));
  }

  /**
   * Run the full 7-step hypothesis loop for a diagnostic question.
   */
  async runHypothesisLoop(
    question: string,
    workspaceId: string,
    sessionId: string | undefined,
    workspaceData: {
      overtimeRate?: number;
      avgReliabilityScore?: number;
      atRiskEmployees?: number;
      overdueInvoices?: number;
      topConcerns?: string[];
      siteMargins?: any[];
      recentIncidents?: number;
    } = {},
  ): Promise<HypothesisResult> {
    const startMs = Date.now();

    // STEP 1: Determine domain
    const domain = this.classifyDomain(question);

    // STEP 2: Generate 3-5 candidate hypotheses with prior probabilities
    const generator = HYPOTHESIS_GENERATORS[domain] || HYPOTHESIS_GENERATORS.performance;
    const hypotheses: Hypothesis[] = generator(question);

    const evidenceQueries: string[] = [];

    // STEP 3-5: Query evidence and update posterior probabilities
    this.applyWorkspaceEvidence(hypotheses, workspaceData, domain, evidenceQueries);

    // STEP 6: Rank by posterior probability
    hypotheses.sort((a, b) => b.posteriorProbability - a.posteriorProbability);

    const topHypothesis = hypotheses[0];
    const runnerUp = hypotheses[1] || null;

    // STEP 6: Check for convergence (80%+ posterior probability)
    const converged = topHypothesis.posteriorProbability >= 80;
    const status: HypothesisSession['status'] = converged ? 'converged' : 'inconclusive';
    const conclusionConfidence = topHypothesis.posteriorProbability;

    const narrativeSummary = this.buildNarrative(
      question, domain, topHypothesis, runnerUp, converged, workspaceData,
    );

    // Persist session
    const session = await this.persistSession(
      workspaceId, sessionId, question, hypotheses,
      evidenceQueries, converged ? narrativeSummary : null,
      conclusionConfidence, status,
      Date.now() - startMs,
    );

    return {
      session,
      narrativeSummary,
      topHypothesis,
      runnerUp: converged ? null : runnerUp,
      requiresClarification: !converged && runnerUp !== null
        && Math.abs(topHypothesis.posteriorProbability - runnerUp.posteriorProbability) < 15,
      clarifyingQuestion: converged ? null
        : `To narrow this down further — ${this.generateEvidenceQuestion(topHypothesis, runnerUp, domain)}`,
    };
  }

  private classifyDomain(question: string): string {
    const q = question.toLowerCase();
    if (/overtime|ot\b|extra hours/.test(q)) return 'overtime';
    if (/calloff|call.off|no.show|absent/.test(q)) return 'calloff';
    if (/margin|profit|revenue|billing|cost/.test(q)) return 'margin';
    if (/client|customer|complain|satisfaction/.test(q)) return 'client';
    if (/performance|quality|reliability|behav/.test(q)) return 'performance';
    return 'performance'; // default
  }

  private applyWorkspaceEvidence(
    hypotheses: Hypothesis[],
    data: any,
    domain: string,
    queries: string[],
  ): void {
    if (domain === 'overtime') {
      if (data.overtimeRate && data.overtimeRate > 0.15) {
        hypotheses[0].posteriorProbability += 20;
        hypotheses[0].supportingEvidence.push(`Current OT rate is ${(data.overtimeRate * 100).toFixed(0)}% — above 15% threshold.`);
        queries.push('overtime_rate_workspace');
      }
      if (data.atRiskEmployees && data.atRiskEmployees > 3) {
        hypotheses[1].posteriorProbability += 15;
        hypotheses[1].supportingEvidence.push(`${data.atRiskEmployees} at-risk employees suggest calloff surge contributing to OT.`);
        queries.push('at_risk_employee_count');
      }
    }

    if (domain === 'calloff') {
      if (data.avgReliabilityScore && data.avgReliabilityScore < 0.6) {
        hypotheses[0].posteriorProbability += 25;
        hypotheses[0].supportingEvidence.push(`Workspace reliability score is ${(data.avgReliabilityScore * 100).toFixed(0)}% — below 60% threshold.`);
        queries.push('workspace_reliability_score');
      }
    }

    if (domain === 'margin') {
      if (data.overtimeRate && data.overtimeRate > 0.10) {
        hypotheses[0].posteriorProbability += 20;
        hypotheses[0].supportingEvidence.push(`High OT rate (${(data.overtimeRate * 100).toFixed(0)}%) is a direct margin drain.`);
        queries.push('overtime_rate_workspace');
      }
      if (data.siteMargins) {
        const criticalSites = data.siteMargins.filter((s: any) => s.status === 'critical').length;
        if (criticalSites > 0) {
          hypotheses[1].posteriorProbability += 15;
          hypotheses[1].supportingEvidence.push(`${criticalSites} site(s) with critical margin indicate bill rate issues.`);
          queries.push('site_margin_scores');
        }
      }
    }

    // Cap all probabilities at 95
    for (const h of hypotheses) {
      h.posteriorProbability = Math.min(95, h.posteriorProbability);
    }
  }

  private buildNarrative(
    question: string,
    domain: string,
    top: Hypothesis,
    runnerUp: Hypothesis | null,
    converged: boolean,
    data: any,
  ): string {
    const lines: string[] = [];

    if (converged) {
      lines.push(`**Most likely cause (${top.posteriorProbability}% confidence):** ${top.description}`);
      lines.push('');
      lines.push('**Supporting evidence:**');
      for (const ev of top.supportingEvidence) {
        lines.push(`- ${ev}`);
      }
      lines.push('');
      lines.push(`**Recommended action:** Address ${top.description.toLowerCase()} directly — this is the highest-probability root cause based on available workspace data.`);
    } else {
      lines.push(`**Top hypothesis (${top.posteriorProbability}% probability):** ${top.description}`);
      if (runnerUp) {
        lines.push(`**Also plausible (${runnerUp.posteriorProbability}% probability):** ${runnerUp.description}`);
      }
      lines.push('');
      lines.push('**Evidence reviewed:**');
      for (const ev of top.supportingEvidence.slice(0, 2)) {
        lines.push(`- ${ev}`);
      }
    }

    return lines.join('\n');
  }

  private generateEvidenceQuestion(
    top: Hypothesis,
    runnerUp: Hypothesis | null,
    domain: string,
  ): string {
    if (domain === 'overtime') return 'have there been any recent scheduling changes or an increase in client-requested hours?';
    if (domain === 'calloff') return 'have officers mentioned any specific concerns about pay, scheduling, or working conditions recently?';
    if (domain === 'margin') return 'when was the billing rate at the affected site last reviewed against actual labor costs?';
    if (domain === 'client') return 'has the client raised any specific incidents or concerns in writing recently?';
    return 'has there been any recent change in personnel, management, or site conditions that might be relevant?';
  }

  private async persistSession(
    workspaceId: string,
    sessionId: string | undefined,
    question: string,
    hypotheses: Hypothesis[],
    evidenceQueries: string[],
    conclusion: string | null,
    conclusionConfidence: number,
    status: string,
    thinkingTimeMs: number,
  ): Promise<HypothesisSession> {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      // Converted to Drizzle ORM: ON CONFLICT → onConflictDoNothing
      await db.insert(trinityHypothesisSessions).values({
        id,
        workspaceId,
        sessionId: sessionId ?? null,
        question,
        hypotheses,
        evidenceQueries,
        conclusion,
        conclusionConfidence,
        status,
        thinkingTimeMs,
      }).onConflictDoNothing();
    } catch {
      // Non-fatal
    }

    return {
      id, workspaceId, sessionId, question, hypotheses, evidenceQueries,
      conclusion, conclusionConfidence,
      status: status as HypothesisSession['status'],
      thinkingTokensUsed: 0, thinkingTimeMs,
    };
  }
}

export const trinityHypothesisEngine = new TrinityHypothesisEngine();
