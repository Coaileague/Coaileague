/**
 * TRINITY RECOGNITION ENGINE + CELEBRATION BROADCASTER
 * =======================================================
 * Handles all 4 tiers of officer recognition and celebration delivery.
 *
 * TIER 1 — Trinity acts immediately, no approval needed:
 *   Birthday DM, new hire welcome DM, clock-in streak praise,
 *   perfect attendance DM, report streak praise, certification shoutout
 *
 * TIER 2 — Trinity drafts, supervisor reviews with one-tap approve:
 *   Team-wide performance shoutout, client welcome announcement
 *
 * TIER 3 — Trinity suggests, manager decides:
 *   90-day probation review, raise suggestion, FTO designation
 *
 * TIER 4 — Trinity suggests, owner decides:
 *   Promotion recommendation, officer of the month, significant pay increase
 *
 * Broadcasts go through the notification system and chatroom message delivery.
 * Template placeholders: {{firstName}}, {{lastName}}, {{companyName}}, etc.
 */

import { db, pool } from '../../db';
import { createNotification } from '../notificationService';
import { trinityMilestoneDetector, type DetectedMilestone } from './trinityMilestoneDetector';
import { platformEventBus } from '../platformEventBus';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { notifications } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityRecognitionEngine');

const TIER1_MILESTONES = new Set([
  'birthday', 'new_hire', 'clockin_streak_14', 'perfect_attendance_30',
  'report_streak_30', 'certification_earned', 'probation_30day', 'work_anniversary_1yr', 'work_anniversary_2yr'
]);

const TIER2_MILESTONES = new Set(['client_welcome']);
const TIER3_MILESTONES = new Set(['probation_90day', 'tenure_1year']);
const TIER4_MILESTONES = new Set(['officer_of_month', 'work_anniversary_5yr', 'promotion']);

class TrinityRecognitionEngine {

  /** Process all detected milestones — routes each to appropriate tier */
  async processMilestones(milestones: DetectedMilestone[]): Promise<{ sent: number; queued: number; errors: number }> {
    let sent = 0, queued = 0, errors = 0;

    for (const m of milestones) {
      if (m.alreadyTriggered) continue;
      try {
        const template = await this.getTemplate(m.workspaceId, m.milestoneType);
        if (!template) continue;

        const context = await this.buildRenderContext(m);
        const message = this.renderTemplate(template.template_text, context);

        // === ACC RECOGNITION_CONFLICT CHECK ===
        // Before celebrating, verify the officer has no open disciplinary flag.
        // If a flag exists, route to supervisor for reconciliation before sending.
        const hasOpenFlag = await this.checkOpenDisciplinaryFlag(m.workspaceId, m.employeeId);
        if (hasOpenFlag && TIER1_MILESTONES.has(m.milestoneType)) {
          log.info(`[RecognitionEngine] ACC RECOGNITION_CONFLICT: ${m.employeeName} has open disciplinary flag — routing to supervisor for review instead of auto-sending`);
          await this.queueForApproval(m, template, message, 'supervisor');
          queued++;
          continue;
        }

        if (TIER1_MILESTONES.has(m.milestoneType)) {
          await this.deliverTier1(m, template, message);
          sent++;
        } else if (TIER2_MILESTONES.has(m.milestoneType)) {
          await this.queueForApproval(m, template, message, 'supervisor');
          queued++;
        } else if (TIER3_MILESTONES.has(m.milestoneType)) {
          await this.queueForApproval(m, template, message, 'manager');
          queued++;
        } else if (TIER4_MILESTONES.has(m.milestoneType)) {
          await this.queueForApproval(m, template, message, 'owner');
          queued++;
        }

        await trinityMilestoneDetector.recordMilestone(m, { message, tier: this.getTier(m.milestoneType), deliveredAt: new Date().toISOString() });

        // Signal milestone event to platform bus (Thalamus subscriber picks it up)
        platformEventBus.publish({
          eventType: 'milestone_detected',
          title: `Milestone: ${m.milestoneType} — ${m.employeeName}`,
          description: `Trinity detected milestone for ${m.employeeName}`,
          data: { milestoneType: m.milestoneType, employeeId: m.employeeId, workspaceId: m.workspaceId }
        }).catch(() => null);

      } catch {
        errors++;
      }
    }

    return { sent, queued, errors };
  }

  /** TIER 1: Send immediately — DM or team broadcast */
  private async deliverTier1(m: DetectedMilestone, template: any, message: string): Promise<void> {
    const { rows: emp } = await typedPool(`
      SELECT user_id, workspace_id FROM employees WHERE id = $1
    `, [m.employeeId]);

    if (template.delivery_channel === 'dm' || template.delivery_channel === 'both') {
      if (emp[0]?.user_id) {
        await createNotification({
          workspaceId: m.workspaceId,
          userId: emp[0].user_id,
          type: 'trinity_recognition',
          title: this.getTitleForMilestone(m.milestoneType, m.employeeName),
          message,
          priority: 'normal',
          idempotencyKey: `trinity_recognition-${String(Date.now())}-${emp[0].user_id}`,
        }).catch(() => null);
      }
    }

    if (template.delivery_channel === 'general_room' || template.delivery_channel === 'both') {
      await this.sendToGeneralRoom(m.workspaceId, message);
    }

    // For milestones that need supervisor notification (30-day, attendance)
    if (['probation_30day', 'perfect_attendance_30', 'clockin_streak_14'].includes(m.milestoneType)) {
      await this.notifySupervisor(m.workspaceId, m.employeeId, m.employeeName, m.milestoneType, message);
    }
  }

  /** TIER 2/3/4: Queue for human approval */
  private async queueForApproval(m: DetectedMilestone, template: any, message: string, role: 'supervisor' | 'manager' | 'owner'): Promise<void> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: workspace_members | Verified: 2026-03-23
    const { rows: target } = await typedPool(`
      SELECT user_id FROM workspace_members
      WHERE workspace_id = $1
        AND role = $2
      ORDER BY created_at ASC LIMIT 1
    `, [m.workspaceId, role === 'owner' ? 'org_owner' : role === 'manager' ? 'org_manager' : 'supervisor']);

    if (target[0]?.user_id) {
      const approvalNote = `Trinity has drafted the following recognition message. Review and approve:\n\n"${message}"\n\nOfficer: ${m.employeeName} | Milestone: ${m.milestoneType}`;
      await createNotification({
        workspaceId: m.workspaceId,
        userId: target[0].user_id,
        type: 'trinity_recognition_pending',
        title: `Recognition Pending Approval: ${m.employeeName}`,
        message: approvalNote,
        priority: 'normal',
        idempotencyKey: `trinity_recognition_pending-${String(Date.now())}-${target[0].user_id}`,
        }).catch(() => null);
    }
  }

  /** RAISE SUGGESTION — called when performance thresholds are met */
  async generateRaiseSuggestion(workspaceId: string, employeeId: string, avgScore: number, daysAboveThreshold: number): Promise<void> {
    // CATEGORY C — Raw SQL retained: position | Tables: employees | Verified: 2026-03-23
    const { rows: emp } = await typedPool(`
      SELECT first_name, last_name, hourly_rate, position, hire_date FROM employees
      WHERE id = $1 AND workspace_id = $2
    `, [employeeId, workspaceId]);

    if (!emp.length) return;
    const e = emp[0];
    const currentRate = Number(e.hourly_rate) || 18;
    const suggestedLow = (currentRate * 1.03).toFixed(2);
    const suggestedHigh = (currentRate * 1.07).toFixed(2);

    const template = await this.getTemplate(workspaceId, 'raise_suggestion');
    const message = template ? this.renderTemplate(template.template_text, {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      firstName: e.first_name, lastName: e.last_name,
      compositeScore: String(avgScore), days: String(daysAboveThreshold),
      currentRate: String(currentRate), lowRange: suggestedLow, highRange: suggestedHigh,
          idempotencyKey: `trinity_recognition-${Date.now()}-${emp[0].user_id}`
    }) : `${e.first_name} ${e.last_name} has maintained a ${avgScore} composite score for ${daysAboveThreshold} days. Consider merit review. Current rate: $${currentRate}/hr. Suggested range: $${suggestedLow}-$${suggestedHigh}/hr.`;

    // Converted to Drizzle ORM: IN subquery → inArray
    const mgr = await db.select({ userId: (await import('@shared/schema')).workspaceMembers.userId })
      .from((await import('@shared/schema')).workspaceMembers)
      .where(and(
        eq((await import('@shared/schema')).workspaceMembers.workspaceId, workspaceId),
        inArray((await import('@shared/schema')).workspaceMembers.role, ['org_owner', 'org_manager'])
      ))
      .orderBy((await import('@shared/schema')).workspaceMembers.createdAt)
      .limit(1)
      .catch(() => []);

    if (mgr[0]?.userId) {
      await createNotification({
        workspaceId,
        userId: mgr[0].userId,
        type: 'trinity_raise_suggestion',
        title: `Performance Review Suggestion: ${e.first_name} ${e.last_name}`,
        message,
        priority: 'normal',
        idempotencyKey: `trinity_raise_suggestion-${String(Date.now())}-${mgr[0].userId}`,
        }).catch(() => null);
    }
  }

  /** OFFICER OF THE MONTH — monthly, highest composite score, owner approves */
  async nominateOfficerOfMonth(workspaceId: string): Promise<{ nominated: boolean; officer?: any }> {
    // CATEGORY C — Raw SQL retained: DISTINCT ON | Tables: officer_performance_scores, employees | Verified: 2026-03-23
    const { rows: top } = await typedPool(`
      SELECT DISTINCT ON (ops.employee_id)
        ops.employee_id, ops.composite_score,
        e.first_name, e.last_name, e.position,
        ops.clockin_accuracy_score, ops.attendance_score
      FROM officer_performance_scores ops
      JOIN employees e ON e.id = ops.employee_id
      WHERE ops.workspace_id = $1
        AND ops.period_start >= NOW() - INTERVAL '30 days'
        AND e.is_active = true
      ORDER BY ops.employee_id, ops.composite_score DESC
    `, [workspaceId]);

    if (!top.length) return { nominated: false };

    const best = top.sort((a: any, b: any) => Number(b.composite_score) - Number(a.composite_score))[0];

    const template = await this.getTemplate(workspaceId, 'officer_of_month');
    const companyName = await this.getCompanyName(workspaceId);
    const message = template ? this.renderTemplate(template.template_text, {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      firstName: best.first_name, lastName: best.last_name, companyName,
      compositeScore: String(Math.round(Number(best.composite_score))),
        idempotencyKey: `trinity_raise_suggestion-${Date.now()}-${mgr[0].userId}`
    }) : `Officer of the Month: ${best.first_name} ${best.last_name}! Exceptional performance this month. — Trinity`;

    // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspace_members | Verified: 2026-03-23
    const { rows: owner } = await typedPool(`
      SELECT user_id FROM workspace_members
      WHERE workspace_id = $1 AND role = 'org_owner'
      LIMIT 1
    `, [workspaceId]);

    if (owner[0]?.user_id) {
      await createNotification({
        workspaceId,
        userId: owner[0].user_id,
        type: 'trinity_ootm_nomination',
        title: `Officer of the Month Nomination: ${best.first_name} ${best.last_name}`,
        idempotencyKey: `trinity_ootm_nomination-${Date.now()}-${owner[0].user_id}`,
        message: `Trinity nominates ${best.first_name} ${best.last_name} for Officer of the Month (score: ${Math.round(Number(best.composite_score))}). Approve to send the announcement to the team.\n\nMessage:\n"${message}"`,
        priority: 'normal'
      } as any).catch(() => null);
    }

    return { nominated: true, officer: best };
  }

  /** FTO (Field Training Officer) suggestion — score > 85 for 6+ months */
  async checkFTOEligibility(workspaceId: string): Promise<void> {
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: officer_performance_scores, employees | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT ops.employee_id, e.first_name, e.last_name, e.hire_date, e.position,
             AVG(ops.composite_score) AS avg_score,
             COUNT(*) AS periods_above_threshold
      FROM officer_performance_scores ops
      JOIN employees e ON e.id = ops.employee_id
      WHERE ops.workspace_id = $1
        AND ops.composite_score >= 85
        AND ops.period_start >= NOW() - INTERVAL '180 days'
        AND e.is_active = true
      GROUP BY ops.employee_id, e.first_name, e.last_name, e.hire_date, e.position
      HAVING COUNT(*) >= 20
    `, [workspaceId]);

    for (const r of rows) {
      const months = r.hire_date
        // @ts-expect-error — TS migration: fix in refactoring sprint
        ? Math.floor((Date.now() - new Date(r.hire_date).getTime()) / (1000 * 60 * 60 * 24 * 30))
        : 0;
      if (months < 6) continue;

      const template = await this.getTemplate(workspaceId, 'fto_suggestion');
      const companyName = await this.getCompanyName(workspaceId);
      const message = template ? this.renderTemplate(template.template_text, {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        firstName: r.first_name, lastName: r.last_name, companyName,
        compositeScore: String(Math.round(Number(r.avg_score))), months: String(months)
      }) : `${r.first_name} ${r.last_name} has maintained ${Math.round(Number(r.avg_score))} avg score over ${months} months. Consider FTO designation.`;

      // CATEGORY C — Raw SQL retained: IN ( | Tables: workspace_members | Verified: 2026-03-23
      const { rows: mgr } = await typedPool(`
        SELECT user_id FROM workspace_members
        WHERE workspace_id = $1 AND role IN ('org_owner', 'org_manager')
        LIMIT 1
      `, [workspaceId]);

      if (mgr[0]?.user_id) {
        await createNotification({
          workspaceId,
          userId: mgr[0].user_id,
          type: 'trinity_fto_suggestion',
          title: `FTO Eligibility: ${r.first_name} ${r.last_name}`,
          message,
          priority: 'normal',
          idempotencyKey: `trinity_fto_suggestion-${String(Date.now())}-${mgr[0].user_id}`,
        }).catch(() => null);
      }
    }
  }

  /** Resolve a template — workspace-specific first, then platform default */
  private async getTemplate(workspaceId: string, eventType: string): Promise<any | null> {
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: celebration_templates | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT * FROM celebration_templates
      WHERE (workspace_id = $1 OR workspace_id IS NULL)
        AND event_type = $2 AND is_active = true
      ORDER BY workspace_id NULLS LAST
      LIMIT 1
    `, [workspaceId, eventType]);
    return rows[0] || null;
  }

  /** Render {{placeholder}} template */
  private renderTemplate(template: string, context: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || `[${key}]`);
  }

  private async buildRenderContext(m: DetectedMilestone): Promise<Record<string, string>> {
    // CATEGORY C — Raw SQL retained: position | Tables: employees | Verified: 2026-03-23
    const { rows: emp } = await typedPool(`
      SELECT first_name, last_name, position, hourly_rate FROM employees WHERE id = $1
    `, [m.employeeId]);
    const e = emp[0] || {};
    const companyName = await this.getCompanyName(m.workspaceId);
    return {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      firstName: e.first_name || 'Officer',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      lastName: e.last_name || '',
      companyName,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      position: e.position || 'Security Officer',
      streakDays: String(m.context?.streakDays || 14),
      currentRate: String(Number(e.hourly_rate) || 18),
      ...Object.fromEntries(Object.entries(m.context || {}).map(([k, v]) => [k, String(v)]))
    };
  }

  private async sendToGeneralRoom(workspaceId: string, message: string): Promise<void> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: chat_rooms, chat_messages | Verified: 2026-03-23
    await typedPoolExec(`
      INSERT INTO chat_messages (workspace_id, room_id, user_id, content, message_type, created_at)
      SELECT $1, cr.id, 'trinity-ai', $2, 'announcement', NOW()
      FROM chat_rooms cr
      WHERE cr.workspace_id = $1 AND cr.room_type = 'general'
      LIMIT 1
    `, [workspaceId, message]).catch(() => null);
  }

  private async notifySupervisor(workspaceId: string, employeeId: string, employeeName: string, milestoneType: string, context: string): Promise<void> {
    // Converted to Drizzle ORM: IN subquery → inArray
    const { rows } = await typedPool(`
      SELECT DISTINCT wm.user_id FROM workspace_members wm
      WHERE wm.workspace_id = $1 AND wm.role IN ('supervisor', 'org_manager')
      LIMIT 1
    `, [workspaceId]);

    if (rows[0]?.user_id) {
      await createNotification({
        workspaceId, userId: rows[0].user_id,
        type: 'milestone_alert',
        title: `Milestone Alert: ${employeeName}`,
        message: `${employeeName} has reached a ${milestoneType.replace(/_/g, ' ')} milestone. Trinity has sent them a recognition message. Context: ${context.slice(0, 200)}`,
        priority: 'normal',
        idempotencyKey: `milestone_alert-${String(Date.now())}-${rows[0].user_id}`,
        }).catch(() => null);
    }
  }

  private async getCompanyName(workspaceId: string): Promise<string> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT name FROM workspaces WHERE id = $1 LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return rows[0]?.name || 'the company';
  }

  private getTier(milestoneType: string): number {
    if (TIER1_MILESTONES.has(milestoneType)) return 1;
    if (TIER2_MILESTONES.has(milestoneType)) return 2;
    if (TIER3_MILESTONES.has(milestoneType)) return 3;
    return 4;
  }

  /** ACC RECOGNITION_CONFLICT: Check if officer has an open disciplinary pattern flag */
  private async checkOpenDisciplinaryFlag(workspaceId: string, employeeId: string): Promise<boolean> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const result = await db.select({ id: sql`1` })
      .from(notifications)
      .where(sql`
        ${notifications.workspaceId} = ${workspaceId}
        AND ${notifications.type} = 'disciplinary_pattern'
        AND ${notifications.message} LIKE '%' || ${employeeId} || '%'
        AND ${notifications.createdAt} >= NOW() - INTERVAL '30 days'
        AND (${notifications.isRead} = false OR ${notifications.readAt} IS NULL OR ${notifications.readAt} >= NOW() - INTERVAL '7 days')
      `)
      .limit(1)
      .catch(() => []);
    return result.length > 0;
  }

  private getTitleForMilestone(type: string, name: string): string {
    const titles: Record<string, string> = {
      birthday: `Happy Birthday, ${name.split(' ')[0]}!`,
      new_hire: `Welcome to the Team!`,
      clockin_streak_14: `Clock-In Consistency Recognition`,
      perfect_attendance_30: `Perfect Attendance — Outstanding!`,
      report_streak_30: `Report Submission Streak`,
      work_anniversary_1yr: `1-Year Anniversary!`,
      work_anniversary_2yr: `2-Year Anniversary!`,
      probation_30day: `30-Day Milestone`,
      certification_earned: `New Certification Earned`
    };
    return titles[type] || `Recognition: ${name}`;
  }
}

export const trinityRecognitionEngine = new TrinityRecognitionEngine();
log.info('[TrinityRecognitionEngine] Initialized — 4-tier recognition + celebration broadcasting ready');
