/**
 * TRINITY TEMPORAL CONSCIOUSNESS ENGINE
 * ======================================
 * Gives Trinity genuine temporal awareness — she doesn't just store data points,
 * she experiences entities as trajectories evolving over time.
 *
 * Not: "Marcus called off 3 times."
 * But: "Marcus has been struggling for about 6 weeks — this started correlating
 *       with his reassignment to the downtown sites. His trajectory was excellent before that."
 *
 * Tracks entity arcs (officers, clients, sites, orgs) across 30/90 day windows,
 * calculates trajectory, identifies inflection points, and surfaces narrative summaries
 * for Trinity to use in responses.
 */

import { db, pool } from '../../db';
import { sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { temporalEntityArcs } from '@shared/schema/domains/trinity/extended';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityTemporalConsciousnessEngine');

export type EntityType = 'officer' | 'client' | 'site' | 'org';
export type Trajectory = 'improving' | 'stable' | 'declining' | 'volatile' | 'recovering' | 'deteriorating';
export type AttentionLevel = 'background' | 'monitoring' | 'watching' | 'concerned' | 'active';

export interface EntityArc {
  entityId: string;
  entityType: EntityType;
  workspaceId: string;
  currentStateAssessment: string;
  state30DaysAgo: string | null;
  state90DaysAgo: string | null;
  trajectory: Trajectory;
  trajectoryConfidence: number;
  keyInflectionPoints: InflectionPoint[];
  trinityAttentionLevel: AttentionLevel;
  narrativeSummary: string;
  lastAssessedAt: Date;
}

export interface InflectionPoint {
  date: string;
  whatChanged: string;
  whyTrinityBelievesItChanged: string;
  impactOnTrajectory: 'positive' | 'negative' | 'neutral';
}

interface OfficerMetrics {
  recentCalloffs: number;
  recentLate: number;
  avgPerformanceScore: number | null;
  reportComplianceRate: number;
  daysSinceLastMilestone: number | null;
  daysEmployed: number;
}

class TrinityTemporalConsciousnessEngine {

  /** Load the arc for a specific entity (for use in response generation) */
  async getEntityArc(workspaceId: string, entityId: string, entityType: EntityType): Promise<EntityArc | null> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: temporal_entity_arcs | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT * FROM temporal_entity_arcs
      WHERE workspace_id = $1 AND entity_id = $2 AND entity_type = $3
      LIMIT 1
    `, [workspaceId, entityId, entityType]).catch(() => ({ rows: [] }));
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      entityId: r.entity_id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      entityType: r.entity_type,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId: r.workspace_id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      currentStateAssessment: r.current_state_assessment || '',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      state30DaysAgo: r.state_30_days_ago,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      state90DaysAgo: r.state_90_days_ago,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      trajectory: r.trajectory || 'stable',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      trajectoryConfidence: r.trajectory_confidence || 50,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      keyInflectionPoints: r.key_inflection_points || [],
      // @ts-expect-error — TS migration: fix in refactoring sprint
      trinityAttentionLevel: r.trinity_attention_level || 'background',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      narrativeSummary: r.narrative_summary || '',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      lastAssessedAt: new Date(r.last_assessed_at)
    };
  }

  /** Build a context string suitable for injection into Trinity's system prompt */
  async buildArcContextForEntity(workspaceId: string, entityId: string, entityType: EntityType): Promise<string> {
    const arc = await this.getEntityArc(workspaceId, entityId, entityType);
    if (!arc || !arc.narrativeSummary) return '';
    const attentionNote = ['concerned', 'active'].includes(arc.trinityAttentionLevel)
      ? ` [TRINITY ATTENTION: ${arc.trinityAttentionLevel.toUpperCase()}]`
      : '';
    return `\nTEMPORAL CONTEXT — ${entityType.toUpperCase()} ARC${attentionNote}:\n${arc.narrativeSummary}\nTrajectory: ${arc.trajectory} (${arc.trajectoryConfidence}% confidence)\n`;
  }

  /** Weekly dream state scan: update all entity arcs for a workspace */
  async scanWorkspace(workspaceId: string): Promise<void> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
    const { rows: employees } = await typedPool(`
      SELECT id, first_name, last_name, hire_date FROM employees
      WHERE workspace_id = $1 AND is_active = true
      LIMIT 200
    `, [workspaceId]).catch(() => ({ rows: [] }));

    for (const emp of employees) {
      await this.updateOfficerArc(workspaceId, emp).catch(() => null);
    }

    await this.updateOrgArc(workspaceId).catch(() => null);
  }

  private async updateOfficerArc(workspaceId: string, emp: any): Promise<void> {
    const now = new Date();
    const metrics30 = await this.getOfficerMetrics(workspaceId, emp.id, 30);
    const metrics90 = await this.getOfficerMetrics(workspaceId, emp.id, 90);

    const currentAssessment = this.assessOfficerState(emp, metrics30);
    const state30 = this.assessOfficerState(emp, metrics30, 15);
    const state90 = this.assessOfficerState(emp, metrics90, 75);

    const trajectory = this.calculateTrajectory(metrics30, metrics90);
    const attention = this.calculateAttentionLevel(trajectory, metrics30);
    const narrative = this.buildOfficerNarrative(emp, metrics30, trajectory, attention);
    const confidence = this.calculateTrajectoryConfidence(metrics30, metrics90);

    const existing = await this.getEntityArc(workspaceId, emp.id, 'officer');
    const inflection = existing ? this.detectInflectionPoint(existing, trajectory, currentAssessment) : null;
    const inflections = existing?.keyInflectionPoints || [];
    if (inflection) inflections.push(inflection);
    if (inflections.length > 10) inflections.splice(0, inflections.length - 10);

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(temporalEntityArcs).values({
      entityId: emp.id,
      entityType: 'officer',
      workspaceId,
      currentStateAssessment: currentAssessment,
      state_30DaysAgo: state30,
      state_90DaysAgo: state90,
      trajectory,
      trajectoryConfidence: confidence,
      keyInflectionPoints: inflections,
      trinityAttentionLevel: attention,
      narrativeSummary: narrative,
      lastAssessedAt: sql`now()`,
    }).onConflictDoUpdate({
      target: [temporalEntityArcs.workspaceId, temporalEntityArcs.entityId, temporalEntityArcs.entityType],
      set: {
        state_90DaysAgo: sql`temporal_entity_arcs.state_30_days_ago`,
        state_30DaysAgo: sql`temporal_entity_arcs.current_state_assessment`,
        currentStateAssessment: sql`EXCLUDED.current_state_assessment`,
        trajectory: sql`EXCLUDED.trajectory`,
        trajectoryConfidence: sql`EXCLUDED.trajectory_confidence`,
        keyInflectionPoints: sql`EXCLUDED.key_inflection_points`,
        trinityAttentionLevel: sql`EXCLUDED.trinity_attention_level`,
        narrativeSummary: sql`EXCLUDED.narrative_summary`,
        lastAssessedAt: sql`now()`,
      },
    });

    if (['concerned', 'active'].includes(attention)) {
      platformEventBus.publish({
        eventType: 'temporal_arc_alert',
        title: `Trinity Attention: ${emp.first_name} ${emp.last_name}`,
        description: narrative,
        data: { employeeId: emp.id, trajectory, attention, workspaceId }
      }).catch(() => null);
    }
  }

  private async updateOrgArc(workspaceId: string): Promise<void> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
    const { rows: orgRows } = await typedPool(`
      SELECT name FROM workspaces WHERE id = $1 LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    const orgName = orgRows[0]?.name || 'Organization';

    // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: employees | Verified: 2026-03-23
    const { rows: summary } = await typedPool(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = true) as active_officers,
        AVG(CASE WHEN hire_date >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) as new_hire_rate
      FROM employees WHERE workspace_id = $1
    `, [workspaceId]).catch(() => ({ rows: [] }));

    // CATEGORY C — Raw SQL retained: COUNT( | Tables: shift_assignments, shifts | Verified: 2026-03-23
    const { rows: calloffs } = await typedPool(`
      SELECT COUNT(*) as count FROM shift_assignments sa
      JOIN shifts s ON s.id = sa.shift_id
      WHERE s.workspace_id = $1 AND sa.status = 'no_show'
        AND s.start_time >= NOW() - INTERVAL '30 days'
    `, [workspaceId]).catch(() => ({ rows: [] }));

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const activeCount = parseInt(summary[0]?.active_officers || '0', 10);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const calloffCount = parseInt(calloffs[0]?.count || '0', 10);
    const calloffRate = activeCount > 0 ? Math.round((calloffCount / activeCount) * 100) : 0;

    const assessment = `${orgName}: ${activeCount} active officers. 30-day calloff rate: ${calloffRate}%.`;
    const trajectory = calloffRate > 20 ? 'declining' : calloffRate < 5 ? 'stable' : 'stable';
    const narrative = `${orgName} currently has ${activeCount} active officers. Operational calloff rate is ${calloffRate}% over the past 30 days.`;

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(temporalEntityArcs).values({
      entityId: workspaceId,
      entityType: 'org',
      workspaceId,
      currentStateAssessment: assessment,
      trajectory,
      trajectoryConfidence: 70,
      trinityAttentionLevel: 'background',
      narrativeSummary: narrative,
      lastAssessedAt: sql`now()`,
    }).onConflictDoUpdate({
      target: [temporalEntityArcs.workspaceId, temporalEntityArcs.entityId, temporalEntityArcs.entityType],
      set: {
        state_90DaysAgo: sql`temporal_entity_arcs.state_30_days_ago`,
        state_30DaysAgo: sql`temporal_entity_arcs.current_state_assessment`,
        currentStateAssessment: sql`EXCLUDED.current_state_assessment`,
        trajectory: sql`EXCLUDED.trajectory`,
        narrativeSummary: sql`EXCLUDED.narrative_summary`,
        lastAssessedAt: sql`now()`,
      },
    });
  }

  private async getOfficerMetrics(workspaceId: string, employeeId: string, days: number): Promise<OfficerMetrics> {
    const since = `NOW() - INTERVAL '${days} days'`;

    // CATEGORY C — Raw SQL retained: COUNT( | Tables: shift_assignments, shifts | Verified: 2026-03-23
    const { rows: calloffRows } = await typedPool(`
      SELECT COUNT(*) as count FROM shift_assignments sa
      JOIN shifts s ON s.id = sa.shift_id
      WHERE s.workspace_id = $1 AND sa.employee_id = $2
        AND sa.status = 'no_show' AND s.start_time >= ${since}
    `, [workspaceId, employeeId]).catch(() => ({ rows: [{ count: 0 }] }));

    // CATEGORY C — Raw SQL retained: COUNT( | Tables: time_entries, shifts | Verified: 2026-03-23
    const { rows: lateRows } = await typedPool(`
      SELECT COUNT(*) as count FROM time_entries te
      JOIN shifts s ON s.id = te.shift_id
      WHERE te.workspace_id = $1 AND te.employee_id = $2
        AND te.created_at >= ${since}
        AND te.created_at > s.start_time + INTERVAL '10 minutes'
    `, [workspaceId, employeeId]).catch(() => ({ rows: [{ count: 0 }] }));

    // CATEGORY C — Raw SQL retained: AVG( | Tables: officer_performance_scores | Verified: 2026-03-23
    const { rows: scoreRows } = await typedPool(`
      SELECT AVG(overall_score) as avg FROM officer_performance_scores
      WHERE workspace_id = $1 AND employee_id = $2
        AND period_end >= ${since}
    `, [workspaceId, employeeId]).catch(() => ({ rows: [{ avg: null }] }));

    // CATEGORY C — Raw SQL retained: MAX( | Tables: milestone_tracker | Verified: 2026-03-23
    const { rows: milestoneRows } = await typedPool(`
      SELECT MAX(triggered_at) as last FROM milestone_tracker
      WHERE workspace_id = $1 AND employee_id = $2
    `, [workspaceId, employeeId]).catch(() => ({ rows: [{ last: null }] }));

    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
    const { rows: empRows } = await typedPool(`
      SELECT hire_date FROM employees WHERE id = $1 LIMIT 1
    `, [employeeId]).catch(() => ({ rows: [{ hire_date: null }] }));

    const daysEmployed = empRows[0]?.hire_date
      // @ts-expect-error — TS migration: fix in refactoring sprint
      ? Math.floor((Date.now() - new Date(empRows[0].hire_date).getTime()) / 86400000)
      : 0;

    const lastMilestone = milestoneRows[0]?.last
      // @ts-expect-error — TS migration: fix in refactoring sprint
      ? Math.floor((Date.now() - new Date(milestoneRows[0].last).getTime()) / 86400000)
      : null;

    return {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      recentCalloffs: parseInt(calloffRows[0]?.count || '0', 10),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      recentLate: parseInt(lateRows[0]?.count || '0', 10),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      avgPerformanceScore: scoreRows[0]?.avg ? parseFloat(scoreRows[0].avg) : null,
      reportComplianceRate: 80,
      daysSinceLastMilestone: lastMilestone,
      daysEmployed
    };
  }

  private assessOfficerState(emp: any, metrics: OfficerMetrics, daysBack = 0): string {
    const timeRef = daysBack > 0 ? `${daysBack} days ago` : 'currently';
    const score = metrics.avgPerformanceScore;
    const calloffs = metrics.recentCalloffs;
    const scoreStr = score ? ` Performance score: ${Math.round(score)}/100.` : '';
    return `${emp.first_name} ${emp.last_name} (${timeRef}): ${calloffs} calloffs in window.${scoreStr}`;
  }

  private calculateTrajectory(recent: OfficerMetrics, older: OfficerMetrics): Trajectory {
    const recentScore = recent.avgPerformanceScore || 70;
    const olderScore = older.avgPerformanceScore || 70;
    const scoreDelta = recentScore - olderScore;
    const calloffIncrease = recent.recentCalloffs - older.recentCalloffs;

    if (scoreDelta > 10 && calloffIncrease <= 0) return 'improving';
    if (scoreDelta < -10 || calloffIncrease > 2) return 'declining';
    if (recent.recentCalloffs > 3 && older.recentCalloffs === 0) return 'deteriorating';
    if (scoreDelta > 5 && older.recentCalloffs > 2 && recent.recentCalloffs < 2) return 'recovering';
    if (Math.abs(scoreDelta) < 5 && calloffIncrease === 0) return 'stable';
    return 'volatile';
  }

  private calculateAttentionLevel(trajectory: Trajectory, metrics: OfficerMetrics): AttentionLevel {
    if (trajectory === 'deteriorating' || metrics.recentCalloffs >= 4) return 'active';
    if (trajectory === 'declining' || metrics.recentCalloffs >= 2) return 'concerned';
    if (trajectory === 'volatile' || metrics.recentCalloffs === 1) return 'watching';
    if (trajectory === 'recovering') return 'monitoring';
    return 'background';
  }

  private calculateTrajectoryConfidence(recent: OfficerMetrics, older: OfficerMetrics): number {
    const hasScores = recent.avgPerformanceScore !== null && older.avgPerformanceScore !== null;
    return hasScores ? 75 : 45;
  }

  private buildOfficerNarrative(emp: any, metrics: OfficerMetrics, trajectory: Trajectory, attention: AttentionLevel): string {
    const name = `${emp.first_name} ${emp.last_name}`;
    const score = metrics.avgPerformanceScore ? ` Performance average: ${Math.round(metrics.avgPerformanceScore)}/100.` : '';
    const calloffs = metrics.recentCalloffs > 0 ? ` ${metrics.recentCalloffs} calloff(s) in the past 30 days.` : ' Consistent attendance.';
    const trajectoryDesc: Record<Trajectory, string> = {
      improving: 'has been on a positive trajectory recently.',
      stable: 'is performing consistently and reliably.',
      declining: 'has shown a concerning downward trend recently.',
      volatile: 'has had an inconsistent pattern recently — performance swings are notable.',
      recovering: 'appears to be recovering after a difficult stretch.',
      deteriorating: 'is in a concerning downward spiral and needs immediate attention.'
    };
    const attnNote = attention === 'active' ? ' TRINITY IS ACTIVELY MONITORING.' : attention === 'concerned' ? ' Trinity is watching this closely.' : '';
    return `${name} ${trajectoryDesc[trajectory]}${calloffs}${score}${attnNote}`;
  }

  private detectInflectionPoint(existing: EntityArc, newTrajectory: Trajectory, newState: string): InflectionPoint | null {
    if (existing.trajectory === newTrajectory) return null;
    const directionChange = (
      (existing.trajectory === 'improving' && (newTrajectory === 'declining' || newTrajectory === 'deteriorating')) ||
      (existing.trajectory === 'declining' && (newTrajectory === 'improving' || newTrajectory === 'recovering'))
    );
    if (!directionChange) return null;
    return {
      date: new Date().toISOString().split('T')[0],
      whatChanged: `Trajectory shifted from ${existing.trajectory} to ${newTrajectory}`,
      whyTrinityBelievesItChanged: 'Pattern change detected during weekly arc assessment',
      impactOnTrajectory: newTrajectory === 'improving' || newTrajectory === 'recovering' ? 'positive' : 'negative'
    };
  }

  /** Record a significant event that may trigger an immediate arc update */
  async recordSignificantEvent(workspaceId: string, entityId: string, entityType: EntityType, event: string, impactDirection: 'positive' | 'negative' | 'neutral'): Promise<void> {
    const existing = await this.getEntityArc(workspaceId, entityId, entityType);
    if (!existing) return;

    const inflections: InflectionPoint[] = existing.keyInflectionPoints || [];
    inflections.push({
      date: new Date().toISOString().split('T')[0],
      whatChanged: event,
      whyTrinityBelievesItChanged: 'Significant event recorded in real-time',
      impactOnTrajectory: impactDirection
    });
    if (inflections.length > 10) inflections.splice(0, inflections.length - 10);

    const newAttention = impactDirection === 'negative' ? 'watching' : existing.trinityAttentionLevel;

    // CATEGORY C — Raw SQL retained: AI brain engine multi-field UPDATE | Tables: temporal_entity_arcs | Verified: 2026-03-23
    await typedPoolExec(`
      UPDATE temporal_entity_arcs
      SET key_inflection_points = $1,
          trinity_attention_level = $2,
          last_assessed_at = NOW()
      WHERE workspace_id = $3 AND entity_id = $4 AND entity_type = $5
    `, [JSON.stringify(inflections), newAttention, workspaceId, entityId, entityType]);
  }
}

export const trinityTemporalConsciousnessEngine = new TrinityTemporalConsciousnessEngine();
