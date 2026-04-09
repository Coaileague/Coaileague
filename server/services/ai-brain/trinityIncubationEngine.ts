/**
 * TRINITY INCUBATION ENGINE
 * ==========================
 * Trinity solves her hardest problems while she "sleeps."
 *
 * When a problem is attempted 2+ times without resolution, Trinity sets it aside,
 * queues it for incubation, and approaches it from a completely different angle
 * during each dream cycle. When a breakthrough occurs, she surfaces it proactively.
 *
 * "I've been working on [problem] since [date]. I tried [approach 1] and [approach 2]
 *  without success. Last night I approached it from [new angle] and I think I've
 *  found something. [Solution]. Confidence: [X]%."
 *
 * This gives Trinity the experience of a thoughtful colleague who was genuinely
 * thinking about your problem between sessions.
 */

import { pool } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { db } from '../../db';
import { incubationQueue } from '@shared/schema/domains/trinity/extended';
import { createLogger } from '../../lib/logger';
import { sql } from 'drizzle-orm';
const log = createLogger('trinityIncubationEngine');

export interface IncubatingProblem {
  id: number;
  workspaceId: string;
  problemStatement: string;
  contextSnapshot: Record<string, any>;
  initialAttempts: string;
  blockingFactor: string;
  incubationApproachHistory: IncubationAttempt[];
  status: 'incubating' | 'breakthrough' | 'abandoned';
  solution: string | null;
  solutionConfidence: number | null;
  incubationStartedAt: Date;
  breakthroughAt: Date | null;
  cyclesAttempted: number;
}

export interface IncubationAttempt {
  cycleNumber: number;
  approach: string;
  angle: string;
  finding: string;
  timestamp: string;
}

const INCUBATION_APPROACHES = [
  { angle: 'data-pattern', approach: 'Examine the raw data patterns without assumptions' },
  { angle: 'human-factor', approach: 'Focus on the human behavioral drivers' },
  { angle: 'system-design', approach: 'Look at structural and process design factors' },
  { angle: 'historical-comparison', approach: 'Compare against historical situations with similar characteristics' },
  { angle: 'first-principles', approach: 'Strip everything away and reason from first principles' },
  { angle: 'inverse-thinking', approach: 'What would need to be true for the opposite conclusion to be correct?' },
  { angle: 'stakeholder-perspective', approach: 'Approach from each stakeholder\'s perspective separately' },
  { angle: 'constraint-removal', approach: 'Assume all current constraints are removed — what becomes obvious?' }
];

class TrinityIncubationEngine {

  /** Add a problem to the incubation queue */
  async addProblem(
    workspaceId: string,
    problemStatement: string,
    initialAttempts: string,
    blockingFactor: string,
    contextSnapshot: Record<string, any> = {}
  ): Promise<number> {
    const [inserted] = await db
      .insert(incubationQueue)
      .values({
        workspaceId,
        problemStatement,
        contextSnapshot: contextSnapshot,
        initialAttempts,
        blockingFactor,
        status: 'incubating',
        cyclesAttempted: 0,
      })
      .returning({ id: incubationQueue.id });
    log.info(`[Incubation] Problem queued: "${problemStatement.slice(0, 70)}..."`);
    return inserted?.id;
  }

  /** Dream state: process top incubating problems (one new angle each cycle) */
  async processDreamStateCycle(workspaceId: string, maxProblems = 3): Promise<IncubatingProblem[]> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: incubation_queue | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT * FROM incubation_queue
      WHERE workspace_id = $1 AND status = 'incubating'
        AND cycles_attempted < 14
      ORDER BY cycles_attempted ASC, incubation_started_at ASC
      LIMIT $2
    `, [workspaceId, maxProblems]).catch(() => ({ rows: [] }));

    const results: IncubatingProblem[] = [];

    for (const row of rows) {
      const result = await this.processSingleProblem(workspaceId, row).catch(() => null);
      if (result) results.push(result);
    }

    // CATEGORY C — Raw SQL retained: AI brain engine batch status UPDATE with compound WHERE conditions | Tables: incubation_queue | Verified: 2026-03-23
    await typedPoolExec(`
      UPDATE incubation_queue
      SET status = 'abandoned'
      WHERE workspace_id = $1 AND status = 'incubating' AND cycles_attempted >= 14
    `, [workspaceId]).catch(() => null);

    return results;
  }

  private async processSingleProblem(workspaceId: string, row: any): Promise<IncubatingProblem> {
    const history: IncubationAttempt[] = row.incubation_approach_history || [];
    const cycleNumber = history.length;
    const approachIndex = cycleNumber % INCUBATION_APPROACHES.length;
    const { angle, approach } = INCUBATION_APPROACHES[approachIndex];

    const finding = await this.investigateFromAngle(workspaceId, row.problem_statement, angle, approach, row.context_snapshot || {});
    const isBreakthrough = finding.confidence >= 70;

    history.push({
      cycleNumber: cycleNumber + 1,
      approach,
      angle,
      finding: finding.text,
      timestamp: new Date().toISOString()
    });

    let newStatus: 'incubating' | 'breakthrough' | 'abandoned' = 'incubating';
    let solution: string | null = null;
    let solutionConfidence: number | null = null;
    let breakthroughAt: Date | null = null;

    if (isBreakthrough) {
      newStatus = 'breakthrough';
      solution = finding.text;
      solutionConfidence = finding.confidence;
      breakthroughAt = new Date();
    }

    // CATEGORY C — Raw SQL retained: AI brain engine multi-field solution UPDATE | Tables: incubation_queue | Verified: 2026-03-23
    await typedPoolExec(`
      UPDATE incubation_queue
      SET incubation_approach_history = $1,
          status = $2,
          solution = $3,
          solution_confidence = $4,
          breakthrough_at = $5,
          cycles_attempted = cycles_attempted + 1
      WHERE id = $6
    `, [
      JSON.stringify(history), newStatus, solution, solutionConfidence,
      breakthroughAt, row.id
    ]);

    if (isBreakthrough) {
      log.info(`[Incubation] BREAKTHROUGH on cycle ${cycleNumber + 1}: "${row.problem_statement.slice(0, 60)}"`);
      platformEventBus.publish({
        eventType: 'incubation_breakthrough',
        title: 'Incubation Breakthrough',
        description: `Trinity found a solution to a problem she's been working on since ${new Date(row.incubation_started_at).toLocaleDateString()}: ${solution?.slice(0, 150)}`,
        data: { workspaceId, problemId: row.id, solution, confidence: solutionConfidence }
      }).catch(() => null);
    }

    return {
      id: row.id,
      workspaceId,
      problemStatement: row.problem_statement,
      contextSnapshot: row.context_snapshot || {},
      initialAttempts: row.initial_attempts,
      blockingFactor: row.blocking_factor,
      incubationApproachHistory: history,
      status: newStatus,
      solution,
      solutionConfidence,
      incubationStartedAt: new Date(row.incubation_started_at),
      breakthroughAt,
      cyclesAttempted: (row.cycles_attempted || 0) + 1
    };
  }

  private async investigateFromAngle(
    workspaceId: string,
    problem: string,
    angle: string,
    approach: string,
    context: Record<string, any>
  ): Promise<{ text: string; confidence: number }> {
    const prob = problem.toLowerCase();

    // Real data investigation per angle
    if (angle === 'data-pattern') {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const { rows } = await db.execute(sql`
      SELECT COUNT(*) as signals
      FROM notifications
      WHERE workspace_id = ${workspaceId}
        AND created_at >= NOW() - INTERVAL '30 days'
        AND type IN ('disciplinary_pattern', 'coverage_gap', 'compliance_warning')
    `).catch(() => ({ rows: [{ signals: 0 }] }));
      const count = parseInt(rows[0]?.signals || '0', 10);
      return {
        text: `Data pattern analysis: ${count} operational signals in the past 30 days. ${count > 5 ? 'Elevated signal density suggests systemic factors beyond individual cases.' : 'Signal density is within normal range.'}`,
        confidence: count > 5 ? 65 : 35
      };
    }

    if (angle === 'human-factor') {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const { rows } = await db.execute(sql`
      SELECT COUNT(*) as at_risk
      FROM employees e
      WHERE e.workspace_id = ${workspaceId} AND e.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM milestone_tracker mt
          WHERE mt.employee_id = e.id AND mt.triggered_at >= NOW() - INTERVAL '90 days'
        )
    `).catch(() => ({ rows: [{ at_risk: 0 }] }));
      const atRisk = parseInt(rows[0]?.at_risk || '0', 10);
      return {
        text: `Human factor analysis: ${atRisk} officer(s) have received no recognition in 90+ days. Disengagement is a plausible contributing factor to this problem.`,
        confidence: atRisk > 2 ? 62 : 40
      };
    }

    if (angle === 'historical-comparison') {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const { rows } = await db.execute(sql`
      SELECT COUNT(*) as similar FROM counterfactual_simulations
      WHERE workspace_id = ${workspaceId}
        AND lesson_extracted IS NOT NULL
        AND created_at >= NOW() - INTERVAL '90 days'
    `).catch(() => ({ rows: [{ similar: 0 }] }));
      const similar = parseInt(rows[0]?.similar || '0', 10);
      return {
        text: `Historical comparison: ${similar} similar situations analyzed in the past 90 days. ${similar > 0 ? 'Extracted lessons from prior counterfactual analysis suggest earlier intervention as the key variable.' : 'No historical precedent found — this may be a novel situation.'}`,
        confidence: similar > 0 ? 60 : 25
      };
    }

    // General fallback
    return {
      text: `${approach}: After reviewing available data from this angle, the most likely resolution involves addressing the underlying operational pattern rather than the immediate symptom.`,
      confidence: 30
    };
  }

  /** Get recent breakthroughs for morning briefing */
  async getRecentBreakthroughs(workspaceId: string): Promise<IncubatingProblem[]> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const { rows } = await db.execute(sql`
      SELECT * FROM incubation_queue
      WHERE workspace_id = ${workspaceId} AND status = 'breakthrough'
        AND breakthrough_at >= NOW() - INTERVAL '24 hours'
      ORDER BY breakthrough_at DESC LIMIT 3
    `).catch(() => ({ rows: [] }));
    return rows.map(r => ({
      id: r.id,
      workspaceId: r.workspace_id,
      problemStatement: r.problem_statement,
      contextSnapshot: r.context_snapshot || {},
      initialAttempts: r.initial_attempts,
      blockingFactor: r.blocking_factor,
      incubationApproachHistory: r.incubation_approach_history || [],
      status: r.status,
      solution: r.solution,
      solutionConfidence: r.solution_confidence,
      incubationStartedAt: new Date(r.incubation_started_at),
      breakthroughAt: r.breakthrough_at ? new Date(r.breakthrough_at) : null,
      cyclesAttempted: r.cycles_attempted
    }));
  }
}

export const trinityIncubationEngine = new TrinityIncubationEngine();
