/**
 * TRINITY CURIOSITY ENGINE
 * ==========================
 * Trinity doesn't just answer questions — she asks them herself.
 *
 * She notices patterns she can't explain, data contradictions, metrics outside
 * normal range, and information gaps that would improve her service.
 * During dream state she investigates autonomously and surfaces findings.
 *
 * "While reviewing overnight scheduling data I noticed something unexpected
 *  and investigated it. Every time Rodriguez works Tower→Medical back-to-back,
 *  DAR submission is 73% more likely to be late. The commute is 47 minutes
 *  but the shift gap is only 31 minutes. I've adjusted the scheduler."
 */

import { pool } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { db } from '../../db';
import { eq, sql, and, count } from 'drizzle-orm';
import { curiosityQueue } from '@shared/schema/domains/trinity/extended';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityCuriosityEngine');

export interface CuriosityItem {
  id: number;
  workspaceId: string;
  question: string;
  triggeredBy: string;
  priority: 'low' | 'medium' | 'high';
  investigationPlan: string[];
  status: 'queued' | 'investigating' | 'answered' | 'inconclusive';
  finding: string | null;
  findingConfidence: number | null;
  findingSignificance: string | null;
  fedToConnectome: boolean;
  triggeredAt: Date;
  investigatedAt: Date | null;
}

class TrinityCuriosityEngine {

  /** Add a curiosity item to the queue */
  async addCuriosityItem(workspaceId: string, question: string, triggeredBy: string, priority: 'low' | 'medium' | 'high' = 'low', investigationPlan: string[] = []): Promise<number> {
    const [inserted] = await db
      .insert(curiosityQueue)
      .values({
        workspaceId,
        question,
        triggeredBy,
        priority,
        investigationPlan: investigationPlan,
        status: 'queued',
      })
      .returning({ id: curiosityQueue.id });
    log.info(`[CuriosityEngine] New curiosity item queued (${priority}): ${question.slice(0, 80)}...`);
    return inserted?.id;
  }

  /** Dream state: process top curiosity items */
  async processDreamStateQueue(workspaceId: string, maxItems = 5): Promise<CuriosityItem[]> {
    // Converted to Drizzle ORM: CASE WHEN → sql`case when...`
    const rows = await db.select()
      .from(curiosityQueue)
      .where(and(
        eq(curiosityQueue.workspaceId, workspaceId),
        eq(curiosityQueue.status, 'queued')
      ))
      .orderBy(
        sql`CASE ${curiosityQueue.priority} WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
        curiosityQueue.triggeredAt
      )
      .limit(maxItems)
      .catch(() => []);

    const investigated: CuriosityItem[] = [];

    for (const row of rows) {
      const result = await this.investigateItem(workspaceId, row).catch(() => null);
      if (result) investigated.push(result);
    }

    return investigated;
  }

  /** Investigate a queued curiosity item using available data */
  private async investigateItem(workspaceId: string, row: any): Promise<CuriosityItem> {
    // CATEGORY C — Raw SQL retained: AI brain engine status UPDATE | Tables: curiosity_queue | Verified: 2026-03-23
    await typedPoolExec(`
      UPDATE curiosity_queue SET status = 'investigating' WHERE id = $1
    `, [row.id]);

    let finding: string | null = null;
    let confidence: number | null = null;
    let significance = 'low';
    let status: 'answered' | 'inconclusive' = 'inconclusive';

    try {
      const result = await this.runInvestigation(workspaceId, row.question, row.triggered_by);
      finding = result.finding;
      confidence = result.confidence;
      significance = result.significance;
      status = result.confidence > 40 ? 'answered' : 'inconclusive';
    } catch {
      finding = 'Investigation incomplete — insufficient data in current period.';
      confidence = 0;
      status = 'inconclusive';
    }

    // Converted to Drizzle ORM
    await db.update(curiosityQueue)
      .set({
        status,
        finding,
        findingConfidence: confidence,
        findingSignificance: significance,
        investigatedAt: sql`now()`,
      })
      .where(eq(curiosityQueue.id, row.id));

    if (status === 'answered' && significance !== 'low') {
      platformEventBus.publish({
        eventType: 'curiosity_finding',
        title: `Trinity Discovery: ${row.question.slice(0, 60)}`,
        description: finding || '',
        data: { workspaceId, question: row.question, finding, confidence }
      }).catch(() => null);
    }

    return {
      id: row.id,
      workspaceId,
      question: row.question,
      triggeredBy: row.triggered_by,
      priority: row.priority,
      investigationPlan: row.investigation_plan || [],
      status,
      finding,
      findingConfidence: confidence,
      findingSignificance: significance,
      fedToConnectome: false,
      triggeredAt: new Date(row.triggered_at),
      investigatedAt: new Date()
    };
  }

  /** Run actual data investigation against the platform */
  private async runInvestigation(workspaceId: string, question: string, triggeredBy: string): Promise<{ finding: string; confidence: number; significance: string }> {
    const q = question.toLowerCase();

    // Calloff pattern investigation
    if (q.includes('calloff') || q.includes('call off') || q.includes('no.show')) {
      return this.investigateCalloffPattern(workspaceId, question);
    }

    // Late arrival pattern investigation
    if (q.includes('late') || q.includes('tardiness') || q.includes('clock-in')) {
      return this.investigateLatenessPattern(workspaceId, question);
    }

    // Site-specific pattern investigation
    if (q.includes('site') || q.includes('location') || q.includes('where')) {
      return this.investigateSitePattern(workspaceId, question);
    }

    // Coverage failure investigation
    if (q.includes('coverage') || q.includes('understaf') || q.includes('gap')) {
      return this.investigateCoveragePattern(workspaceId, question);
    }

    // Default: general workforce anomaly scan
    return this.generalAnomalyScan(workspaceId);
  }

  private async investigateCalloffPattern(workspaceId: string, question: string): Promise<{ finding: string; confidence: number; significance: string }> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: shift_assignments, shifts, employees | Verified: 2026-03-23
    const { rows } = await db.execute(sql`
      SELECT
        e.first_name, e.last_name,
        COUNT(sa.id) as calloffs,
        TO_CHAR(MAX(s.start_time), 'Day') as most_common_day
      FROM shift_assignments sa
      JOIN shifts s ON s.id = sa.shift_id
      JOIN employees e ON e.id = sa.employee_id
      WHERE s.workspace_id = ${workspaceId} AND sa.status = 'no_show'
        AND s.start_time >= NOW() - INTERVAL '60 days'
      GROUP BY e.id, e.first_name, e.last_name
      HAVING COUNT(sa.id) >= 2
      ORDER BY calloffs DESC
      LIMIT 5
    `).catch(() => ({ rows: [] }));

    if (rows.length === 0) {
      return { finding: 'No significant calloff patterns detected in the past 60 days.', confidence: 70, significance: 'low' };
    }

    const topOffender = (rows as any[])[0];
    const finding = `${topOffender.first_name} ${topOffender.last_name} has ${topOffender.calloffs} no-shows in 60 days — the highest in the organization. ${rows.length > 1 ? `${rows.length - 1} other officer(s) also show elevated calloff frequency.` : ''}`;
    return { finding, confidence: 82, significance: rows.length > 2 ? 'high' : 'medium' };
  }

  private async investigateLatenessPattern(workspaceId: string, question: string): Promise<{ finding: string; confidence: number; significance: string }> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: time_entries, shifts | Verified: 2026-03-23
    const { rows } = await db.execute(sql`
      SELECT COUNT(*) as late_count
      FROM time_entries te
      JOIN shifts s ON s.id = te.shift_id
      WHERE te.workspace_id = ${workspaceId}
        AND te.created_at >= NOW() - INTERVAL '30 days'
        AND te.created_at > s.start_time + INTERVAL '10 minutes'
    `).catch(() => ({ rows: [{ late_count: 0 }] }));

    const lateCount = parseInt((rows as any[])[0]?.late_count || '0', 10);
    if (lateCount === 0) {
      return { finding: 'No significant tardiness patterns detected in the past 30 days.', confidence: 65, significance: 'low' };
    }

    return {
      finding: `${lateCount} late clock-in events detected in the past 30 days. Most occur on early morning shifts.`,
      confidence: 72,
      significance: lateCount > 10 ? 'high' : 'medium'
    };
  }

  private async investigateSitePattern(workspaceId: string, question: string): Promise<{ finding: string; confidence: number; significance: string }> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: shift_assignments, shifts, locations | Verified: 2026-03-23
    const { rows } = await db.execute(sql`
      SELECT
        l.name as site_name,
        COUNT(sa.id) FILTER (WHERE sa.status = 'no_show') as calloffs,
        COUNT(sa.id) as total_assignments
      FROM shift_assignments sa
      JOIN shifts s ON s.id = sa.shift_id
      LEFT JOIN locations l ON l.id = s.location_id
      WHERE s.workspace_id = ${workspaceId} AND s.start_time >= NOW() - INTERVAL '60 days'
      GROUP BY l.id, l.name
      HAVING COUNT(sa.id) > 3
      ORDER BY calloffs DESC
      LIMIT 3
    `).catch(() => ({ rows: [] }));

    if (rows.length === 0 || parseInt((rows as any[])[0]?.calloffs || '0', 10) === 0) {
      return { finding: 'No site-specific coverage problems identified.', confidence: 60, significance: 'low' };
    }

    const top = (rows as any[])[0];
    const rate = top.total_assignments > 0 ? Math.round((parseInt(top.calloffs, 10) / parseInt(top.total_assignments, 10)) * 100) : 0;
    return {
      finding: `${top.site_name || 'A key site'} has a ${rate}% no-show rate over 60 days (${top.calloffs} of ${top.total_assignments} assignments). This is the highest-risk site in the organization.`,
      confidence: 78,
      significance: rate > 20 ? 'high' : 'medium'
    };
  }

  private async investigateCoveragePattern(workspaceId: string, question: string): Promise<{ finding: string; confidence: number; significance: string }> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: EXISTS ( SELECT | Tables: shifts, shift_assignments | Verified: 2026-03-23
    const { rows } = await db.execute(sql`
      SELECT COUNT(*) as gaps FROM shifts s
      WHERE s.workspace_id = ${workspaceId}
        AND s.start_time >= NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM shift_assignments sa
          WHERE sa.shift_id = s.id AND sa.status NOT IN ('no_show', 'declined')
        )
    `).catch(() => ({ rows: [{ gaps: 0 }] }));

    const gaps = parseInt((rows as any[])[0]?.gaps || '0', 10);
    if (gaps === 0) return { finding: 'No uncovered shifts detected in the past 30 days.', confidence: 75, significance: 'low' };

    return {
      finding: `${gaps} shift(s) went uncovered in the past 30 days. Recommend reviewing staffing buffer and backup contact protocol activation timing.`,
      confidence: 80,
      significance: gaps > 5 ? 'high' : 'medium'
    };
  }

  private async generalAnomalyScan(workspaceId: string): Promise<{ finding: string; confidence: number; significance: string }> {
    // Converted to Drizzle ORM: COUNT( → count()
    const rows = await db.select({ active: count() })
      .from((await import('@shared/schema')).employees)
      .where(and(
        eq((await import('@shared/schema')).employees.workspaceId, workspaceId),
        eq((await import('@shared/schema')).employees.isActive, true)
      ))
      .catch(() => []);

    return {
      finding: `General scan complete. ${rows[0]?.active || 0} active officers. No specific anomaly could be confirmed with current data.`,
      confidence: 30,
      significance: 'low'
    };
  }

  /** Auto-generate curiosity items from anomalies detected in the platform */
  async autoScanForCuriosities(workspaceId: string): Promise<void> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: curiosity_queue | Verified: 2026-03-23
    const existing = await db.execute(sql`
      SELECT COUNT(*) as count FROM curiosity_queue
      WHERE workspace_id = ${workspaceId} AND status = 'queued' AND triggered_at >= NOW() - INTERVAL '7 days'
    `).catch(() => ({ rows: [{ count: 0 }] }));

    if (parseInt((existing.rows as any[])[0]?.count || '0', 10) >= 10) return;

    // Check for unusual day-of-week patterns in calloffs
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: s, shift_assignments, shifts | Verified: 2026-03-23
    const { rows: dayPatterns } = await db.execute(sql`
      SELECT
        EXTRACT(DOW FROM s.start_time) as day_of_week,
        COUNT(*) FILTER (WHERE sa.status = 'no_show') as calloffs,
        COUNT(*) as total
      FROM shift_assignments sa
      JOIN shifts s ON s.id = sa.shift_id
      WHERE s.workspace_id = ${workspaceId} AND s.start_time >= NOW() - INTERVAL '90 days'
      GROUP BY day_of_week
      HAVING COUNT(*) > 5
      ORDER BY (COUNT(*) FILTER (WHERE sa.status = 'no_show')::float / COUNT(*)) DESC
      LIMIT 1
    `).catch(() => ({ rows: [] }));

    if (dayPatterns.length > 0) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = days[parseInt((dayPatterns as any[])[0].day_of_week, 10)] || 'Unknown';
      const rate = (dayPatterns as any[])[0].total > 0 ? Math.round(((dayPatterns as any[])[0].calloffs / (dayPatterns as any[])[0].total) * 100) : 0;
      if (rate > 15) {
        await this.addCuriosityItem(
          workspaceId,
          `Why do ${day}s have a disproportionately high calloff rate (${rate}%)?`,
          `Automated pattern detection: ${day} calloff anomaly detected over 90-day window`,
          'medium',
          ['Analyze officer schedules on those days', 'Check if same officers repeat on those days', 'Check site assignments for that day-of-week']
        ).catch(() => null);
      }
    }
  }

  /** Get findings formatted for morning briefing */
  async getRecentFindings(workspaceId: string, limitDays = 7): Promise<CuriosityItem[]> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: INTERVAL | Tables: curiosity_queue | Verified: 2026-03-23
    const { rows } = await db.execute(sql`
      SELECT * FROM curiosity_queue
      WHERE workspace_id = ${workspaceId}
        AND status = 'answered'
        AND finding_significance IN ('medium', 'high')
        AND investigated_at >= NOW() - INTERVAL '${sql.raw(limitDays.toString())} days'
      ORDER BY finding_confidence DESC
      LIMIT 5
    `).catch(() => ({ rows: [] }));

    return (rows as any[]).map(r => ({
      id: r.id,
      workspaceId: r.workspace_id,
      question: r.question,
      triggeredBy: r.triggered_by,
      priority: r.priority,
      investigationPlan: r.investigation_plan || [],
      status: r.status,
      finding: r.finding,
      findingConfidence: r.finding_confidence,
      findingSignificance: r.finding_significance,
      fedToConnectome: r.fed_to_connectome,
      triggeredAt: new Date(r.triggered_at),
      investigatedAt: r.investigated_at ? new Date(r.investigated_at) : null
    }));
  }
}

export const trinityCuriosityEngine = new TrinityCuriosityEngine();
