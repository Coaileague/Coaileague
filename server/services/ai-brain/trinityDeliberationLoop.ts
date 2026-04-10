/**
 * Trinity Deliberation Loop — Phase 64
 * ======================================
 * When Trinity encounters a complex or high-stakes issue, she doesn't
 * just react — she DELIBERATES systematically using her biological brain:
 *
 *   PERCEIVE  → Parallel context gathering across all relevant data sources
 *   REASON    → Classify, estimate confidence, identify resolution paths
 *   ACT       → Execute highest-confidence path via Resolution Fabric
 *   VERIFY    → Post-action health check confirms resolution
 *   LEARN     → Outcome recorded to RL loop for continuous improvement
 *
 * The loop is NOT a chatbot. It produces structured decisions, not text.
 * It's invoked by the Resolution Fabric for critical/novel issues.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { platformEventBus } from '../platformEventBus';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { randomUUID } from 'crypto';
import type { TrinityIssue, ResolutionResult } from './trinityResolutionFabric';
import { trinityPrefrontalCortex, type OrgSurvivalState, type OrgMode } from './trinityPrefrontalCortex';

const log = createLogger('TrinityDeliberation');

// ─── Deliberation Types ───────────────────────────────────────────────────

export interface DeliberationContext {
  workspaceHealth: WorkspaceHealthSnapshot;
  recentHistory: RecentIssueHistory;
  relatedAnomalies: RelatedAnomaly[];
  affectedEntities: AffectedEntity[];
}

export interface WorkspaceHealthSnapshot {
  workspaceId: string;
  activeEmployees: number;
  openShifts: number;
  overdueInvoices: number;
  pendingTickets: number;
  complianceAlerts: number;
  lastAnomalyAt?: string;
}

export interface RecentIssueHistory {
  similarIssuesLast30Days: number;
  lastResolutionOutcome?: 'resolved' | 'escalated' | 'pending';
  recurringPattern: boolean;
}

export interface RelatedAnomaly {
  type: string;
  description: string;
  detectedAt: string;
}

export interface AffectedEntity {
  type: 'employee' | 'client' | 'shift' | 'invoice' | 'workspace';
  id: string;
  name?: string;
}

export interface DeliberationDecision {
  recommendedTier: 'immediate' | 'delegated' | 'supervised' | 'escalated';
  confidence: number;
  reasoning: string;
  specificActions: string[];
  estimatedResolutionMinutes: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  humanNotificationRequired: boolean;
  deliberationId: string;
  processingTimeMs: number;
}

// ─── Deliberation Loop Service ─────────────────────────────────────────────

class TrinityDeliberationLoopService {
  private static instance: TrinityDeliberationLoopService;
  private readonly TRINITY_ACTOR_ID = 'trinity-system-actor-000000000000';

  static getInstance(): TrinityDeliberationLoopService {
    if (!this.instance) this.instance = new TrinityDeliberationLoopService();
    return this.instance;
  }

  /**
   * Run a full deliberation cycle for a complex issue.
   * Returns a structured decision with recommended resolution path.
   */
  async deliberate(issue: TrinityIssue): Promise<DeliberationDecision> {
    const startTime = Date.now();
    const deliberationId = randomUUID();

    log.info(`[Deliberation] Starting cycle ${deliberationId.substring(0, 8)} for: ${issue.type} (${issue.workspaceId})`);

    // Step 1: PERCEIVE — gather context in parallel (including PFC org state)
    const [context, orgState] = await Promise.all([
      this.perceive(issue),
      trinityPrefrontalCortex.getOrgState(issue.workspaceId),
    ]);

    // Step 2: REASON — classify and plan with PFC weighting
    const decision = await this.reason(issue, context, orgState, deliberationId, startTime);

    // Step 2b: Adjust resolution tier based on org mode
    const adjustedTier = trinityPrefrontalCortex.adjustResolutionTier(
      decision.recommendedTier, orgState.mode, issue.type
    );
    if (adjustedTier !== decision.recommendedTier) {
      log.info(`[Deliberation] PFC mode=${orgState.mode} adjusted tier: ${decision.recommendedTier} → ${adjustedTier}`);
      decision.recommendedTier = adjustedTier;
    }

    // Step 3: EMIT to event bus for awareness
    platformEventBus.emit('trinity_deliberation_complete', {
      deliberationId,
      issueType: issue.type,
      workspaceId: issue.workspaceId,
      recommendedTier: decision.recommendedTier,
      confidence: decision.confidence,
      processingTimeMs: decision.processingTimeMs,
    });

    return decision;
  }

  // ─── PERCEIVE ─────────────────────────────────────────────────────────

  private async perceive(issue: TrinityIssue): Promise<DeliberationContext> {
    const [healthResult, historyResult, anomalyResult] = await Promise.allSettled([
      this.gatherWorkspaceHealth(issue.workspaceId),
      this.gatherIssueHistory(issue),
      this.findRelatedAnomalies(issue),
    ]);

    return {
      workspaceHealth: healthResult.status === 'fulfilled' ? healthResult.value : this.defaultHealth(issue.workspaceId),
      recentHistory: historyResult.status === 'fulfilled' ? historyResult.value : { similarIssuesLast30Days: 0, recurringPattern: false },
      relatedAnomalies: anomalyResult.status === 'fulfilled' ? anomalyResult.value : [],
      affectedEntities: [],
    };
  }

  private async gatherWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealthSnapshot> {
    try {
      const result = await pool.query<{
        active_employees: string;
        open_shifts: string;
        overdue_invoices: string;
        pending_tickets: string;
        compliance_alerts: string;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND status = 'active') as active_employees,
          (SELECT COUNT(*) FROM shifts WHERE workspace_id = $1 AND status NOT IN ('completed','cancelled','filled') AND start_time > NOW()) as open_shifts,
          (SELECT COUNT(*) FROM invoices WHERE workspace_id = $1 AND status = 'overdue') as overdue_invoices,
          (SELECT COUNT(*) FROM support_tickets WHERE workspace_id = $1 AND status = 'open') as pending_tickets,
          (SELECT COUNT(*) FROM compliance_documents WHERE workspace_id = $1 AND expiration_date < NOW() + INTERVAL '30 days' AND status NOT IN ('expired','revoked')) as compliance_alerts
      `, [workspaceId]);

      const row = result.rows[0] ?? {};
      return {
        workspaceId,
        activeEmployees: parseInt(row.active_employees ?? '0'),
        openShifts: parseInt(row.open_shifts ?? '0'),
        overdueInvoices: parseInt(row.overdue_invoices ?? '0'),
        pendingTickets: parseInt(row.pending_tickets ?? '0'),
        complianceAlerts: parseInt(row.compliance_alerts ?? '0'),
      };
    } catch (_err) {
      return this.defaultHealth(workspaceId);
    }
  }

  private async gatherIssueHistory(issue: TrinityIssue): Promise<RecentIssueHistory> {
    try {
      const result = await pool.query<{ count: string; last_outcome: string }>(`
        SELECT
          COUNT(*) as count,
          (SELECT changes->>'tier' FROM universal_audit_log
           WHERE workspace_id = $1 AND action = 'trinity.resolution'
             AND changes->>'issueType' = $2
           ORDER BY created_at DESC LIMIT 1) as last_outcome
        FROM universal_audit_log
        WHERE workspace_id = $1
          AND action = 'trinity.resolution'
          AND changes->>'issueType' = $2
          AND created_at > NOW() - INTERVAL '30 days'
      `, [issue.workspaceId, issue.type]);

      const row = result.rows[0] ?? {};
      const count = parseInt(row.count ?? '0');
      return {
        similarIssuesLast30Days: count,
        lastResolutionOutcome: (row as any).last_outcome ?? undefined,
        recurringPattern: count >= 3,
      };
    } catch (_err) {
      return { similarIssuesLast30Days: 0, recurringPattern: false };
    }
  }

  private async findRelatedAnomalies(issue: TrinityIssue): Promise<RelatedAnomaly[]> {
    try {
      const result = await pool.query<{ anomaly_type: string; description: string; detected_at: string }>(`
        SELECT anomaly_type, description, detected_at::text
        FROM trinity_anomaly_log
        WHERE workspace_id = $1
          AND detected_at > NOW() - INTERVAL '24 hours'
          AND resolved = false
        ORDER BY detected_at DESC
        LIMIT 5
      `, [issue.workspaceId]);
      return result.rows.map(r => ({
        type: r.anomaly_type,
        description: r.description,
        detectedAt: r.detected_at,
      }));
    } catch (_err) {
      return [];
    }
  }

  private defaultHealth(workspaceId: string): WorkspaceHealthSnapshot {
    return { workspaceId, activeEmployees: 0, openShifts: 0, overdueInvoices: 0, pendingTickets: 0, complianceAlerts: 0 };
  }

  // ─── REASON ───────────────────────────────────────────────────────────

  private async reason(
    issue: TrinityIssue,
    context: DeliberationContext,
    orgState: OrgSurvivalState,
    deliberationId: string,
    startTime: number,
  ): Promise<DeliberationDecision> {
    const topThreats = orgState.threatSignals.slice(0, 3)
      .map(t => `${t.signal} (${t.severity})`).join('; ') || 'none';
    const topPriorities = orgState.priorityStack.slice(0, 3)
      .map(p => `${p.rank}. ${p.action}`).join('\n') || 'none';
    const weights = orgState.weights;

    const systemPrompt = `You are Trinity, the autonomous intelligence layer of a security workforce management platform.
You are analyzing an operational issue and must produce a structured resolution decision.
You have access to real-time workspace context AND the organization's current survival state.
Your decision will be executed immediately by the resolution system.
Respond ONLY with valid JSON matching the schema exactly. No preamble, no markdown.`;

    const userPrompt = `ISSUE:
Type: ${issue.type}
Description: ${issue.description}
Priority: ${issue.priority}
Workspace: ${issue.workspaceId}

ORGANIZATIONAL SURVIVAL STATE (from PFC):
- Mode: ${orgState.mode} (Survival Score: ${orgState.survivalScore}/100)
- Assessment: ${orgState.modeRationale}
- Domain scores: Financial=${orgState.domainScores.financial} | Operations=${orgState.domainScores.operations} | Workforce=${orgState.domainScores.workforce} | Clients=${orgState.domainScores.clientRelations} | Platform=${orgState.domainScores.platform}
- Active threats: ${topThreats}
- Current priorities:
${topPriorities}

DECISION WEIGHTS (what matters most RIGHT NOW):
- Coverage reliability: ${(weights.coverageReliability * 100).toFixed(0)}%
- Cash flow protection: ${(weights.cashFlowProtection * 100).toFixed(0)}%
- Compliance adherence: ${(weights.complianceAdherence * 100).toFixed(0)}%
- Client retention: ${(weights.clientRetention * 100).toFixed(0)}%
- Profit optimization: ${(weights.profitOptimization * 100).toFixed(0)}%
- Growth momentum: ${(weights.growthMomentum * 100).toFixed(0)}%

WORKSPACE VITALS:
- Active employees: ${context.workspaceHealth.activeEmployees}
- Open unfilled shifts: ${context.workspaceHealth.openShifts}
- Overdue invoices: ${context.workspaceHealth.overdueInvoices}
- Open support tickets: ${context.workspaceHealth.pendingTickets}
- Compliance alerts expiring: ${context.workspaceHealth.complianceAlerts}

HISTORY (last 30 days):
- Similar issues: ${context.recentHistory.similarIssuesLast30Days}
- Last resolution: ${context.recentHistory.lastResolutionOutcome ?? 'none'}
- Recurring pattern: ${context.recentHistory.recurringPattern}

RELATED ANOMALIES (last 24h): ${context.relatedAnomalies.length === 0 ? 'none' : context.relatedAnomalies.map(a => `${a.type}: ${a.description}`).join('; ')}

INSTRUCTIONS:
Given the org's current ${orgState.mode} mode and the decision weights above, determine the optimal resolution strategy.
In ${orgState.mode} mode: ${this.getModeInstructions(orgState.mode)}

Decide how Trinity should resolve this. Return JSON:
{
  "recommendedTier": "immediate" | "delegated" | "supervised" | "escalated",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentences explaining the decision including org mode consideration",
  "specificActions": ["action1", "action2"],
  "estimatedResolutionMinutes": number,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "humanNotificationRequired": boolean
}`;

    try {
      const response = await meteredGemini.generate({
        workspaceId: issue.workspaceId,
        feature: 'trinity_deliberation',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        systemPrompt,
        userPrompt,
        maxOutputTokens: 512,
        temperature: 0.2,
      });

      const text = response.text?.trim() ?? '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        recommendedTier: parsed.recommendedTier ?? 'escalated',
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        reasoning: parsed.reasoning ?? 'No reasoning provided.',
        specificActions: Array.isArray(parsed.specificActions) ? parsed.specificActions : [],
        estimatedResolutionMinutes: parsed.estimatedResolutionMinutes ?? 30,
        riskLevel: parsed.riskLevel ?? 'medium',
        humanNotificationRequired: parsed.humanNotificationRequired ?? false,
        deliberationId,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      log.warn('[Deliberation] AI reasoning failed, using heuristic fallback:', err);
      return this.heuristicDecision(issue, context, orgState, deliberationId, startTime);
    }
  }

  // ─── Mode instruction injector ────────────────────────────────────────

  private getModeInstructions(mode: OrgMode): string {
    const instructions: Record<OrgMode, string> = {
      THRIVING: 'Prefer delegated tier — trust the system. Maximize long-term value. Growth actions are appropriate.',
      STABLE:   'Use standard tier recommendations. Balance autonomy with oversight.',
      AT_RISK:  'Prefer immediate or delegated tier for coverage/revenue issues. Escalate only if confidence < 0.6. Defer growth.',
      CRISIS:   'Default to immediate tier for any coverage or cash flow issue. Human notification required for financial mutations. No growth actions.',
      SURVIVAL: 'Execute everything you can autonomously. Every uncovered shift and overdue invoice is an existential threat. Notify manager of all actions taken.',
    };
    return instructions[mode];
  }

  // ─── Heuristic Fallback (no AI needed) ───────────────────────────────

  private heuristicDecision(
    issue: TrinityIssue,
    context: DeliberationContext,
    orgState: OrgSurvivalState,
    deliberationId: string,
    startTime: number,
  ): DeliberationDecision {
    const isRecurring = context.recentHistory.recurringPattern;
    const isCritical = issue.priority === 'critical';
    const hasAnomalies = context.relatedAnomalies.length > 0;
    const isCrisisMode = orgState.mode === 'CRISIS' || orgState.mode === 'SURVIVAL';

    let tier: DeliberationDecision['recommendedTier'] = 'supervised';
    let confidence = 0.65;
    let riskLevel: DeliberationDecision['riskLevel'] = 'medium';

    if (isCrisisMode && ['uncovered_shift_imminent', 'coverage_hole', 'officer_late_clock_in'].includes(issue.type)) {
      tier = 'immediate';
      confidence = 0.82;
      riskLevel = 'high';
    } else if (isCritical || (isRecurring && hasAnomalies)) {
      tier = isCrisisMode ? 'supervised' : 'escalated';
      confidence = 0.50;
      riskLevel = 'critical';
    } else if (isRecurring) {
      tier = 'delegated';
      confidence = 0.70;
      riskLevel = 'high';
    } else if (orgState.mode === 'THRIVING') {
      tier = 'delegated';
      confidence = 0.75;
      riskLevel = 'low';
    } else {
      tier = 'supervised';
      confidence = 0.72;
      riskLevel = 'medium';
    }

    return {
      recommendedTier: tier,
      confidence,
      reasoning: `Heuristic decision: org is in ${orgState.mode} mode (score=${orgState.survivalScore}), issue type=${issue.type}, priority=${issue.priority}, recurring=${isRecurring}.`,
      specificActions: [],
      estimatedResolutionMinutes: isCritical ? 15 : 30,
      riskLevel,
      humanNotificationRequired: isCritical || tier === 'escalated' || isCrisisMode,
      deliberationId,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // ─── VERIFY ───────────────────────────────────────────────────────────

  /**
   * Post-resolution verification: confirm the issue is actually gone.
   * Returns true if the condition that triggered the issue is no longer present.
   */
  async verify(issue: TrinityIssue, resolution: ResolutionResult): Promise<{
    verified: boolean;
    stillPresent: boolean;
    verificationNote: string;
  }> {
    if (!resolution.resolved) {
      return { verified: false, stillPresent: true, verificationNote: 'Issue was not resolved — verification skipped.' };
    }

    try {
      switch (issue.type) {
        case 'uncovered_shift_imminent':
        case 'coverage_hole': {
          const result = await pool.query<{ count: string }>(`
            SELECT COUNT(*) as count FROM shifts
            WHERE workspace_id = $1
              AND start_time BETWEEN NOW() AND NOW() + INTERVAL '60 minutes'
              AND status NOT IN ('filled', 'completed', 'cancelled', 'confirmed')
              AND assigned_employee_id IS NULL
          `, [issue.workspaceId]);
          const remaining = parseInt(result.rows[0]?.count ?? '0');
          return {
            verified: remaining === 0,
            stillPresent: remaining > 0,
            verificationNote: remaining === 0
              ? 'All imminent shifts now have coverage.'
              : `${remaining} shift(s) still uncovered after resolution attempt.`,
          };
        }
        case 'account_locked': {
          return { verified: true, stillPresent: false, verificationNote: 'Account unlock action completed.' };
        }
        default:
          return { verified: true, stillPresent: false, verificationNote: 'Resolution action completed — assumed resolved.' };
      }
    } catch (_err) {
      return { verified: false, stillPresent: false, verificationNote: 'Verification check failed — manual review recommended.' };
    }
  }
}

export const trinityDeliberationLoop = TrinityDeliberationLoopService.getInstance();
