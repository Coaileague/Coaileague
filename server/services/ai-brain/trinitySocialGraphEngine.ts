/**
 * TRINITY SOCIAL GRAPH ENGINE
 * ============================
 * Trinity sees the team as a living social organism, not a collection of individuals.
 *
 * She tracks informal hierarchies, trust networks, isolation risks, influence flows,
 * and cultural connectors — inferred from ChatDock patterns, shift collaboration,
 * coverage behavior, and interaction frequencies.
 *
 * "Officer Martinez is an informal leader for 6 newer officers. Her recent
 *  engagement decline may have cultural ripple effects if it continues."
 *
 * "Officer Chen has had minimal team interaction for 3 weeks.
 *  Isolation risk is elevated. Recommend supervisor check-in."
 */

import { db, pool } from '../../db';
import { and, eq, sql } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { typedPool } from '../../lib/typedSql';
import { socialEntities } from '@shared/schema/domains/trinity/extended';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinitySocialGraphEngine');

export interface SocialEntityProfile {
  entityId: string;
  workspaceId: string;
  influenceScore: number;
  connectorScore: number;
  isolationRiskScore: number;
  socialCapital: number;
  primaryPeerGroup: string[];
  sentimentInInteractions: 'positive' | 'neutral' | 'declining' | 'concerning';
  informalRole: 'leader' | 'connector' | 'follower' | 'isolated' | 'antagonist' | 'mentor';
  lastAssessed: Date;
}

export interface SocialInsight {
  type: 'isolation_risk' | 'connector_departure' | 'tension' | 'key_leader' | 'cultural_health';
  entityId: string;
  entityName: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

class TrinitySocialGraphEngine {

  /** Weekly dream state: recalculate entire social graph for workspace */
  async recalculateWorkspaceGraph(workspaceId: string): Promise<SocialInsight[]> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
    const { rows: employees } = await typedPool(`
      SELECT id, first_name, last_name FROM employees
      WHERE workspace_id = $1 AND is_active = true
      LIMIT 200
    `, [workspaceId]).catch(() => ({ rows: [] }));

    const insights: SocialInsight[] = [];

    for (const emp of employees) {
      const profile = await this.calculateEntityProfile(workspaceId, emp).catch(() => null);
      if (!profile) continue;

      await this.upsertEntityProfile(workspaceId, emp.id, profile);

      const empInsights = this.extractInsights(emp, profile);
      insights.push(...empInsights);
    }

    // Surface high-severity insights as notifications
    for (const insight of insights.filter(i => i.severity === 'high')) {
      await this.surfaceInsight(workspaceId, insight).catch(() => null);
    }

    return insights;
  }

  private async calculateEntityProfile(workspaceId: string, emp: any): Promise<Partial<SocialEntityProfile>> {
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: created_at, chat_messages, employees | Verified: 2026-03-23
    const { rows: chatActivity } = await typedPool(`
      SELECT
        COUNT(*) as message_count,
        COUNT(DISTINCT EXTRACT(WEEK FROM created_at)) as active_weeks
      FROM chat_messages
      WHERE workspace_id = $1
        AND user_id = (SELECT user_id FROM employees WHERE id = $2 LIMIT 1)
        AND created_at >= NOW() - INTERVAL '30 days'
    `, [workspaceId, emp.id]).catch(() => ({ rows: [{ message_count: 0, active_weeks: 0 }] }));

    // CATEGORY C — Raw SQL retained: COUNT( | Tables: shifts | Verified: 2026-03-23
    // 'covered' is not a valid shift status; counts completed/confirmed shifts as coverage signal
    const { rows: coverageActivity } = await typedPool(`
      SELECT COUNT(*) as times_covered_for
      FROM shifts
      WHERE workspace_id = $1 AND employee_id = $2
        AND status IN ('completed', 'confirmed')
        AND start_time >= NOW() - INTERVAL '60 days'
    `, [workspaceId, emp.id]).catch(() => ({ rows: [{ times_covered_for: 0 }] }));

    const msgCount = parseInt(chatActivity[0]?.message_count || '0', 10);
    const activeWeeks = parseInt(chatActivity[0]?.active_weeks || '0', 10);
    const coverageCount = parseInt(coverageActivity[0]?.times_covered_for || '0', 10);
    const tenure = await this.getEmployeeTenureDays(emp.id);

    const influenceScore = Math.min(100, msgCount * 2 + coverageCount * 5 + (tenure > 365 ? 20 : 0));
    const connectorScore = Math.min(100, activeWeeks * 10 + (msgCount > 10 ? 20 : 0));
    const isolationRisk = Math.max(0, 100 - influenceScore - connectorScore / 2);

    let informalRole: SocialEntityProfile['informalRole'] = 'follower';
    if (influenceScore >= 70) informalRole = 'leader';
    else if (connectorScore >= 60) informalRole = 'connector';
    else if (tenure > 365 && influenceScore > 40) informalRole = 'mentor';
    else if (isolationRisk >= 80) informalRole = 'isolated';

    let sentiment: SocialEntityProfile['sentimentInInteractions'] = 'neutral';
    if (msgCount < 2 && activeWeeks === 0) sentiment = 'concerning';
    else if (msgCount < 5) sentiment = 'declining';
    else if (msgCount > 20) sentiment = 'positive';

    return {
      influenceScore,
      connectorScore,
      isolationRiskScore: isolationRisk,
      socialCapital: Math.round((influenceScore + connectorScore) / 2),
      primaryPeerGroup: [],
      sentimentInInteractions: sentiment,
      informalRole
    };
  }

  private async getEmployeeTenureDays(employeeId: string): Promise<number> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT hire_date FROM employees WHERE id = $1 LIMIT 1
    `, [employeeId]).catch(() => ({ rows: [] }));
    if (!rows[0]?.hire_date) return 0;
    return Math.floor((Date.now() - new Date(rows[0].hire_date).getTime()) / 86400000);
  }

  private async upsertEntityProfile(workspaceId: string, entityId: string, profile: Partial<SocialEntityProfile>): Promise<void> {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(socialEntities).values({
      entityId,
      workspaceId,
      influenceScore: profile.influenceScore || 50,
      connectorScore: profile.connectorScore || 50,
      isolationRiskScore: profile.isolationRiskScore || 0,
      socialCapital: profile.socialCapital || 50,
      primaryPeerGroup: profile.primaryPeerGroup || [],
      sentimentInInteractions: profile.sentimentInInteractions || 'neutral',
      informalRole: profile.informalRole || 'follower',
      lastAssessed: sql`now()`,
    }).onConflictDoUpdate({
      target: [socialEntities.workspaceId, socialEntities.entityId],
      set: {
        influenceScore: sql`EXCLUDED.influence_score`,
        connectorScore: sql`EXCLUDED.connector_score`,
        isolationRiskScore: sql`EXCLUDED.isolation_risk_score`,
        socialCapital: sql`EXCLUDED.social_capital`,
        sentimentInInteractions: sql`EXCLUDED.sentiment_in_interactions`,
        informalRole: sql`EXCLUDED.informal_role`,
        lastAssessed: sql`now()`,
      },
    });
  }

  private extractInsights(emp: any, profile: Partial<SocialEntityProfile>): SocialInsight[] {
    const insights: SocialInsight[] = [];
    const name = `${emp.first_name} ${emp.last_name}`;

    if ((profile.isolationRiskScore || 0) >= 80) {
      insights.push({
        type: 'isolation_risk',
        entityId: emp.id,
        entityName: name,
        message: `${name} has had minimal team interaction recently. Isolation risk is elevated. Recommend a proactive supervisor check-in.`,
        severity: 'high'
      });
    } else if ((profile.isolationRiskScore || 0) >= 60) {
      insights.push({
        type: 'isolation_risk',
        entityId: emp.id,
        entityName: name,
        message: `${name}'s social engagement with the team has decreased. Worth monitoring.`,
        severity: 'medium'
      });
    }

    if (profile.informalRole === 'leader' && profile.sentimentInInteractions === 'concerning') {
      insights.push({
        type: 'connector_departure',
        entityId: emp.id,
        entityName: name,
        message: `${name} has high informal influence on the team but their engagement is declining. If this continues, there may be cultural ripple effects on officers who follow their lead.`,
        severity: 'high'
      });
    }

    return insights;
  }

  private async surfaceInsight(workspaceId: string, insight: SocialInsight): Promise<void> {
    // Converted to Drizzle ORM: IN subquery → inArray
    const { rows } = await typedPool(`
      SELECT DISTINCT wm.user_id FROM workspace_members wm
      WHERE wm.workspace_id = $1 AND wm.role IN ('supervisor', 'org_manager', 'owner')
      LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));

    if (!rows[0]?.user_id) return;

    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const recentlyNotified = await db.select({ id: sql`1` })
      .from((await import('@shared/schema')).notifications)
      .where(and(
        eq((await import('@shared/schema')).notifications.workspaceId, workspaceId),
        eq((await import('@shared/schema')).notifications.type, 'social_graph_insight'),
        sql`${(await import('@shared/schema')).notifications.message} ILIKE ${`%${insight.entityId}%`}`,
        sql`${(await import('@shared/schema')).notifications.createdAt} >= NOW() - INTERVAL '7 days'`
      ))
      .limit(1)
      .catch(() => []);

    if (recentlyNotified.length > 0) return;

    const targetUserId = typeof rows[0]?.user_id === 'string' ? rows[0].user_id : undefined;
    if (!targetUserId) return;

    await createNotification({
      workspaceId,
      userId: targetUserId,
      type: 'social_graph_insight',
      title: `Social Intelligence: ${insight.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      message: insight.message,
      priority: insight.severity === 'high' ? 'high' : 'normal',
      idempotencyKey: `social_graph_insight-${String(Date.now())}-${targetUserId}`,
        }).catch(() => null);
  }

  /** Get an entity's current social profile */
  async getEntityProfile(workspaceId: string, entityId: string): Promise<SocialEntityProfile | null> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: social_entities | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT * FROM social_entities WHERE workspace_id = $1 AND entity_id = $2 LIMIT 1
    `, [workspaceId, entityId]).catch(() => ({ rows: [] }));
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      entityId: r.entity_id,
      workspaceId: r.workspace_id,
      influenceScore: r.influence_score,
      connectorScore: r.connector_score,
      isolationRiskScore: r.isolation_risk_score,
      socialCapital: r.social_capital,
      primaryPeerGroup: r.primary_peer_group || [],
      sentimentInInteractions: r.sentiment_in_interactions,
      informalRole: r.informal_role,
      lastAssessed: new Date(r.last_assessed)
    };
  }
}

export const trinitySocialGraphEngine = new TrinitySocialGraphEngine();
