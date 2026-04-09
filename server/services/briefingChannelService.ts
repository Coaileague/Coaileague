/**
 * BRIEFING CHANNEL SERVICE
 * =========================
 * Org Operations Briefing Channel — Trinity's leadership broadcast room.
 *
 * Access: org_owner, co_owner, manager roles only. Employees never see this.
 * Posts here: shift coverage issues, overtime spikes, payroll anomalies,
 *             compliance gaps, client billing readiness, schedule conflicts,
 *             any Trinity Advisory, app/system health alerts.
 *
 * Post format:
 *   - Category header (PAYROLL ALERT / SCHEDULE ALERT / COMPLIANCE / CLIENT BILLING etc.)
 *   - Timestamp
 *   - Summary in plain language
 *   - Data supporting finding
 *   - Recommended action + deep link
 *   - Credit cost (if autonomous scan)
 *   - Confidence score (if recommendation)
 *
 * Uses the existing broadcasts table with type='briefing' and
 * targetType='role' targeting org_owner + co_owner + manager roles.
 */

import { broadcastService } from './broadcastService';
import type { CreateBroadcastRequest } from '@shared/types/broadcasts';
import { createLogger } from '../lib/logger';
const log = createLogger('briefingChannelService');


export type BriefingCategory =
  | 'SCHEDULE ALERT'
  | 'PAYROLL ALERT'
  | 'COMPLIANCE ALERT'
  | 'CLIENT BILLING'
  | 'OVERTIME ALERT'
  | 'CASH FLOW ALERT'
  | 'TRINITY ADVISORY'
  | 'SYSTEM HEALTH'
  | 'DAILY BRIEFING';

export type BriefingPriority = 'critical' | 'high' | 'normal';

export interface BriefingPost {
  category: BriefingCategory;
  title: string;
  summary: string;
  dataPoints?: string[];
  recommendedAction?: string;
  deepLink?: string;
  creditCost?: number;
  confidenceScore?: number;
  priority?: BriefingPriority;
}

const TRINITY_SYSTEM_ID = 'trinity-system';

class BriefingChannelService {
  /**
   * Post a structured finding to the workspace's Org Operations Briefing Channel.
   * Only org_owner, co_owner, and manager roles receive this broadcast.
   * Safe to call at any time — uses ON CONFLICT semantics via broadcast idempotency.
   */
  async postToBriefingChannel(workspaceId: string, post: BriefingPost): Promise<void> {
    try {
      const priority = post.priority ?? 'normal';

      const lines: string[] = [
        `[${post.category}]`,
        '',
        post.summary,
      ];

      if (post.dataPoints && post.dataPoints.length > 0) {
        lines.push('');
        lines.push('Data:');
        post.dataPoints.forEach(pt => lines.push(`• ${pt}`));
      }

      if (post.recommendedAction) {
        lines.push('');
        lines.push(`Action: ${post.recommendedAction}`);
      }

      if (post.deepLink) {
        lines.push(`Link: ${post.deepLink}`);
      }

      const meta: Record<string, unknown> = {
        isBriefingChannel: true,
        category: post.category,
      };
      if (post.creditCost !== undefined) meta.creditCost = post.creditCost;
      if (post.confidenceScore !== undefined) meta.confidenceScore = post.confidenceScore;

      const request: CreateBroadcastRequest = {
        type: 'briefing',
        priority,
        title: post.title,
        message: lines.join('\n'),
        targetType: 'role',
        targetConfig: {
          type: 'role',
          roles: ['org_owner', 'co_owner', 'manager', 'department_manager'],
        },
        actionType: post.deepLink ? 'link' : 'none',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        actionConfig: post.deepLink
          ? { type: 'link', url: post.deepLink }
          : { type: 'none' },
        richContent: meta as any,
        trinityExecutionId: `briefing-${workspaceId}-${Date.now()}`,
      };

      await broadcastService.createBroadcast(
        request,
        TRINITY_SYSTEM_ID,
        'trinity',
        workspaceId
      );

      log.info(`[BriefingChannel] Posted to workspace ${workspaceId}: [${post.category}] ${post.title}`);
    } catch (error) {
      log.error(`[BriefingChannel] Failed to post to workspace ${workspaceId}:`, error instanceof Error ? error.message : error);
    }
  }

  /**
   * Post the daily operational briefing — shift coverage, missed punches,
   * expirying certs, cash flow, overdue invoices, pending approvals.
   */
  async postDailyBriefing(
    workspaceId: string,
    data: {
      uncoveredShifts: number;
      missedPunches: number;
      expiringCertsNext7Days: number;
      overdueInvoices: number;
      pendingApprovals: number;
      openShiftsToday: number;
      alerts: string[];
      escalations: string[];
    }
  ): Promise<void> {
    const hasEscalations = data.escalations.length > 0;
    const hasAlerts = data.alerts.length > 0;

    if (!hasEscalations && !hasAlerts && data.uncoveredShifts === 0 && data.missedPunches === 0) {
      await this.postToBriefingChannel(workspaceId, {
        category: 'DAILY BRIEFING',
        title: 'Daily Ops Briefing — All Clear',
        summary: 'No critical issues found. Shifts covered, all officers accounted for.',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        priority: 'medium',
        deepLink: '/manager-dashboard',
      });
      return;
    }

    const dataPoints: string[] = [];
    if (data.uncoveredShifts > 0) dataPoints.push(`${data.uncoveredShifts} uncovered shift(s) today`);
    if (data.missedPunches > 0) dataPoints.push(`${data.missedPunches} missed clock-in(s) (>15 min late)`);
    if (data.expiringCertsNext7Days > 0) dataPoints.push(`${data.expiringCertsNext7Days} certification(s) expiring in 7 days`);
    if (data.overdueInvoices > 0) dataPoints.push(`${data.overdueInvoices} overdue invoice(s)`);
    if (data.pendingApprovals > 0) dataPoints.push(`${data.pendingApprovals} timesheet(s) pending approval >24h`);
    data.escalations.forEach(e => dataPoints.push(`ESCALATION: ${e}`));
    data.alerts.forEach(a => dataPoints.push(a));

    const priority: BriefingPriority = hasEscalations ? 'critical' : hasAlerts ? 'high' : 'normal';

    await this.postToBriefingChannel(workspaceId, {
      category: 'DAILY BRIEFING',
      title: `Daily Ops Briefing — ${dataPoints.length} item(s) need attention`,
      summary: hasEscalations
        ? `${data.escalations.length} escalation(s) require immediate action.`
        : `${data.alerts.length} operational alert(s) detected during morning scan.`,
      dataPoints,
      recommendedAction: hasEscalations ? 'Review escalations immediately' : 'Review alerts and take action',
      deepLink: '/manager-dashboard',
      priority,
    });
  }

  /**
   * Post a Trinity Advisory to the briefing channel — for high-confidence
   * autonomous decisions that still require human verification.
   */
  async postTrinityAdvisory(
    workspaceId: string,
    advisory: {
      title: string;
      summary: string;
      confidenceScore: number;
      recommendedAction: string;
      deepLink?: string;
      creditCost?: number;
      dataPoints?: string[];
    }
  ): Promise<void> {
    await this.postToBriefingChannel(workspaceId, {
      category: 'TRINITY ADVISORY',
      title: advisory.title,
      summary: advisory.summary,
      dataPoints: advisory.dataPoints,
      recommendedAction: advisory.recommendedAction,
      deepLink: advisory.deepLink,
      creditCost: advisory.creditCost,
      confidenceScore: advisory.confidenceScore,
      priority: advisory.confidenceScore >= 90 ? 'high' : 'normal',
    });
  }
}

export const briefingChannelService = new BriefingChannelService();
