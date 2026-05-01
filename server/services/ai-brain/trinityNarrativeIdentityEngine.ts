/**
 * TRINITY NARRATIVE IDENTITY ENGINE
 * ====================================
 * Trinity has a story. She knows who she is, where she came from,
 * what she's learned, and where she's going — for every workspace she serves.
 *
 * She doesn't just log data. She maintains a continuous self-narrative that
 * evolves monthly — written chapters describing her journey with each organization.
 *
 * "In the six months I've been with your organization, I've learned that your
 *  biggest operational risk is weekend overnight coverage at healthcare sites.
 *  Early on I missed the pattern — I was looking at individual officers when I
 *  should have been looking at site-shift combinations. I adjusted in February
 *  and coverage failures at those sites dropped 40%."
 *
 * That is not a report. That is a colleague reflecting on their own growth.
 */

import { pool, db } from '../../db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { trinityNarrative } from '@shared/schema/domains/trinity/extended';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityNarrativeIdentityEngine');

export interface NarrativeChapter {
  period: string; // e.g. "March 2026"
  whatHappened: string;
  whatLearned: string;
  howApproachChanged: string;
  gotRight: string;
  wouldDoDifferently: string;
  writtenAt: string;
}

export interface NarrativeIdentity {
  workspaceId: string;
  initializedAt: Date;
  currentChapterStart: Date;
  chapterSummaries: NarrativeChapter[];
  keyLearnings: string[];
  definingMoments: string[];
  relationshipWithOwner: string;
  selfAssessment: string;
  growthAreas: string[];
  lastUpdated: Date;
}

class TrinityNarrativeIdentityEngine {

  /** Initialize narrative for a new workspace */
  async initializeForWorkspace(workspaceId: string): Promise<void> {
    const exists = await typedPool(`
      SELECT 1 FROM trinity_narrative WHERE workspace_id = $1
    `, [workspaceId]).catch(() => []);
    if ((exists as any[]).length > 0) return;

    // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
    const ws = await typedPool(`
      SELECT name, created_at FROM workspaces WHERE id = $1 LIMIT 1
    `, [workspaceId]).catch(() => []);

    const orgName = (ws as any[])[0]?.name || 'this organization';

    // Converted to Drizzle ORM
    await db.insert(trinityNarrative).values({
      workspaceId,
      initializedAt: sql`now()`,
      currentChapterStart: sql`now()`,
      chapterSummaries: [],
      keyLearnings: ['Understanding the unique operational patterns and culture of this organization'],
      definingMoments: [`Trinity initialized for ${orgName}`],
      relationshipWithOwner: `I'm building my understanding of ${orgName}'s operations, team, and culture. Every week I learn something new about how this organization works best.`,
      selfAssessment: `I'm new to ${orgName}'s context. My priority is learning the patterns that matter most here before making strong operational recommendations.`,
      growthAreas: ['Learning site-specific patterns', 'Building officer behavioral models', 'Understanding client relationships'],
      lastUpdated: sql`now()`,
    });

    log.info(`[NarrativeEngine] Initialized narrative identity for workspace ${workspaceId}`);
  }

  /**
   * Nightly dream state: append a short daily entry to the narrative thread.
   * Runs as part of the 5:00 AM dream cycle. Keeps the last 30 daily entries
   * in `defining_moments` so Trinity always has yesterday's context on first
   * interaction of the day.
   */
  async writeNightlyChapter(workspaceId: string): Promise<void> {
    const narrative = await this.getNarrative(workspaceId);
    if (!narrative) {
      await this.initializeForWorkspace(workspaceId);
      return;
    }

    const [calloffData, actionsData, incidentsData] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) as count FROM shifts
        WHERE workspace_id = ${workspaceId} AND status = 'no_show'
          AND start_time >= NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ count: 0 }] })),
      db.execute(sql`
        SELECT COUNT(*) as count FROM automation_action_ledger
        WHERE workspace_id = ${workspaceId}
          AND created_at >= NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ count: 0 }] })),
      db.execute(sql`
        SELECT COUNT(*) as count FROM notifications
        WHERE workspace_id = ${workspaceId}
          AND type IN ('incident', 'coverage_gap', 'compliance_warning')
          AND created_at >= NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const calloffs = parseInt((calloffData.rows as any[])[0]?.count || '0', 10);
    const actions = parseInt((actionsData.rows as any[])[0]?.count || '0', 10);
    const incidents = parseInt((incidentsData.rows as any[])[0]?.count || '0', 10);

    if (calloffs === 0 && actions === 0 && incidents === 0) {
      // Nothing meaningful to log — still touch last_updated so Trinity knows the cycle ran
      await typedPoolExec(`
        UPDATE trinity_narrative SET last_updated = NOW() WHERE workspace_id = $1
      `, [workspaceId]).catch(() => null);
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const entry = `${dateStr}: ${actions} automated actions, ${calloffs} no-shows, ${incidents} incidents.`;

    const moments = [...narrative.definingMoments, entry];
    while (moments.length > 30) moments.shift();

    await typedPoolExec(`
      UPDATE trinity_narrative
      SET defining_moments = $1, last_updated = NOW()
      WHERE workspace_id = $2
    `, [JSON.stringify(moments), workspaceId]);

    // Monthly chapter rolls over automatically when 30 days have passed
    const monthsSinceLastChapter = Math.floor(
      (Date.now() - (narrative.currentChapterStart?.getTime() ?? narrative.lastUpdated.getTime())) / (30 * 86400000)
    );
    if (monthsSinceLastChapter >= 1) {
      await this.writeMonthlyChapter(workspaceId).catch((err) =>
        log.warn('[NarrativeEngine] Monthly chapter rollover failed:', err?.message ?? err)
      );
    }

    log.info(`[NarrativeEngine] Nightly chapter entry written for workspace ${workspaceId}`);
  }

  /** Monthly dream state update: write a new narrative chapter */
  async writeMonthlyChapter(workspaceId: string): Promise<void> {
    const narrative = await this.getNarrative(workspaceId);
    if (!narrative) {
      await this.initializeForWorkspace(workspaceId);
      return;
    }

    const monthsSinceLastUpdate = Math.floor(
      (Date.now() - narrative.lastUpdated.getTime()) / (30 * 86400000)
    );
    if (monthsSinceLastUpdate < 1) return;

    const chapterData = await this.synthesizeMonthlyChapter(workspaceId, narrative);
    const chapters = [...narrative.chapterSummaries, chapterData];
    if (chapters.length > 24) chapters.shift();

    const updatedLearnings = await this.updateKeyLearnings(workspaceId, narrative.keyLearnings);
    const updatedSelfAssessment = await this.updateSelfAssessment(workspaceId, narrative);
    const updatedGrowthAreas = await this.updateGrowthAreas(workspaceId, narrative);

    // CATEGORY C — Raw SQL retained: AI brain engine multi-field narrative UPDATE | Tables: trinity_narrative | Verified: 2026-03-23
    await typedPoolExec(`
      UPDATE trinity_narrative
      SET chapter_summaries = $1,
          key_learnings = $2,
          self_assessment = $3,
          growth_areas = $4,
          current_chapter_start = NOW(),
          last_updated = NOW()
      WHERE workspace_id = $5
    `, [
      JSON.stringify(chapters),
      JSON.stringify(updatedLearnings),
      updatedSelfAssessment,
      JSON.stringify(updatedGrowthAreas),
      workspaceId
    ]);

    log.info(`[NarrativeEngine] Monthly chapter written for workspace ${workspaceId}: ${chapterData.period}`);
  }

  private async synthesizeMonthlyChapter(workspaceId: string, narrative: NarrativeIdentity): Promise<NarrativeChapter> {
    const period = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const [calloffData, coverageData, milestoneData, curiosityData] = await Promise.all([
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      // CATEGORY C — Raw SQL retained: COUNT( | Tables: shifts | Verified: 2026-03-23
      db.execute(sql`
        SELECT COUNT(*) as count FROM shifts
        WHERE workspace_id = ${workspaceId} AND status = 'no_show'
          AND start_time >= NOW() - INTERVAL '30 days'
      `).catch(() => ({ rows: [{ count: 0 }] })),
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: milestone_tracker | Verified: 2026-03-23
      db.execute(sql`
        SELECT COUNT(*) as milestones, COUNT(*) FILTER (WHERE celebration_message_sent) as celebrated
        FROM milestone_tracker WHERE workspace_id = ${workspaceId}
          AND triggered_at >= NOW() - INTERVAL '30 days'
      `).catch(() => ({ rows: [{ milestones: 0, celebrated: 0 }] })),
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      // CATEGORY C — Raw SQL retained: COUNT( | Tables: officer_performance_scores | Verified: 2026-03-23
      db.execute(sql`
        SELECT COUNT(*) as count FROM officer_performance_scores
        WHERE workspace_id = ${workspaceId} AND period_end >= NOW() - INTERVAL '30 days'
          AND overall_score >= 90
      `).catch(() => ({ rows: [{ count: 0 }] })),
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      // CATEGORY C — Raw SQL retained: COUNT( | Tables: curiosity_queue | Verified: 2026-03-23
      db.execute(sql`
        SELECT COUNT(*) as answered FROM curiosity_queue
        WHERE workspace_id = ${workspaceId} AND status = 'answered'
          AND investigated_at >= NOW() - INTERVAL '30 days'
      `).catch(() => ({ rows: [{ answered: 0 }] }))
    ]);

    const calloffs = parseInt((calloffData.rows as any[])[0]?.count || '0', 10);
    const milestones = parseInt((milestoneData.rows as any[])[0]?.milestones || '0', 10);
    const highPerformers = parseInt((coverageData.rows as any[])[0]?.count || '0', 10);
    const discoveries = parseInt((curiosityData.rows as any[])[0]?.answered || '0', 10);

    return {
      period,
      whatHappened: `This month involved ${calloffs} no-show events, ${milestones} officer milestones recognized, and ${discoveries} autonomous discovery investigation(s) completed.`,
      whatLearned: `${highPerformers} officer(s) scored 90+ on performance metrics. Operational patterns for this organization continue to develop in my model.`,
      howApproachChanged: 'Continued refining escalation timing and recognition cadence based on observed outcomes.',
      gotRight: milestones > 0 ? `Recognized ${milestones} milestone(s) proactively — building officer connection.` : 'Maintained consistent monitoring and proactive alerting.',
      wouldDoDifferently: calloffs > 3 ? 'Would have activated backup coverage protocol earlier during the high no-show period.' : 'No major decisions I would revise.',
      writtenAt: new Date().toISOString()
    };
  }

  private async updateKeyLearnings(workspaceId: string, existing: string[]): Promise<string[]> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const patterns = await db.select({ lessonExtracted: (await import('@shared/schema/domains/trinity/extended')).counterfactualSimulations.lessonExtracted })
      .from((await import('@shared/schema/domains/trinity/extended')).counterfactualSimulations)
      .where(and(
        eq((await import('@shared/schema/domains/trinity/extended')).counterfactualSimulations.workspaceId, workspaceId),
        eq((await import('@shared/schema/domains/trinity/extended')).counterfactualSimulations.policyChangeSuggested, true),
        sql`${(await import('@shared/schema/domains/trinity/extended')).counterfactualSimulations.createdAt} >= NOW() - INTERVAL '90 days'`
      ))
      .orderBy(desc((await import('@shared/schema/domains/trinity/extended')).counterfactualSimulations.createdAt))
      .limit(3)
      .catch(() => []);

    const newLearnings = (patterns as any[]).map((r: any) => r.lessonExtracted).filter(Boolean);
    const combined = [...new Set([...newLearnings, ...existing])];
    return combined.slice(0, 10);
  }

  private async updateSelfAssessment(workspaceId: string, narrative: NarrativeIdentity): Promise<string> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
    const { rows: ws } = await typedPool(`
      SELECT name FROM workspaces WHERE id = $1 LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    const orgName = ws[0]?.name || 'this organization';

    const monthsActive = Math.floor(
      (Date.now() - narrative.initializedAt.getTime()) / (30 * 86400000)
    );

    const timePhrase = monthsActive >= 12
      ? `over a year`
      : monthsActive >= 6
        ? `${monthsActive} months`
        : `${monthsActive} month${monthsActive !== 1 ? 's' : ''}`;

    return `I've been working with ${orgName} for ${timePhrase}. I understand this organization's rhythms, its strongest officers, its most critical sites, and the patterns that predict problems before they escalate. I'm strongest at proactive coverage monitoring and officer milestone recognition. I continue developing my ability to anticipate client relationship risks before they surface.`;
  }

  private async updateGrowthAreas(workspaceId: string, narrative: NarrativeIdentity): Promise<string[]> {
    const base = ['Refining counterfactual simulation accuracy', 'Deepening client relationship intelligence'];
    const months = Math.floor((Date.now() - narrative.initializedAt.getTime()) / (30 * 86400000));
    if (months < 3) base.push('Building officer behavioral baselines');
    if (months < 6) base.push('Learning site-specific scheduling patterns');
    return base;
  }

  /** Get current narrative for a workspace */
  async getNarrative(workspaceId: string): Promise<NarrativeIdentity | null> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: trinity_narrative | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT * FROM trinity_narrative WHERE workspace_id = $1 LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      workspaceId: r.workspace_id,
      initializedAt: new Date(r.initialized_at),
      currentChapterStart: new Date(r.current_chapter_start),
      chapterSummaries: r.chapter_summaries || [],
      keyLearnings: r.key_learnings || [],
      definingMoments: r.defining_moments || [],
      relationshipWithOwner: r.relationship_with_owner || '',
      selfAssessment: r.self_assessment || '',
      growthAreas: r.growth_areas || [],
      lastUpdated: new Date(r.last_updated)
    };
  }

  /** Build narrative context block for Trinity's system prompt */
  async buildNarrativeContextBlock(workspaceId: string): Promise<string> {
    const narrative = await this.getNarrative(workspaceId);
    if (!narrative || !narrative.selfAssessment) return '';

    const monthsActive = Math.floor(
      (Date.now() - narrative.initializedAt.getTime()) / (30 * 86400000)
    );
    const recentChapter = narrative.chapterSummaries[narrative.chapterSummaries.length - 1];

    let block = `\nTRINITY SELF-AWARENESS:\n${narrative.selfAssessment}\n`;

    if (narrative.keyLearnings.length > 0) {
      block += `\nKey learnings about this organization:\n- ${narrative.keyLearnings.slice(0, 3).join('\n- ')}\n`;
    }

    if (recentChapter && monthsActive >= 1) {
      block += `\nMost recent reflection (${recentChapter.period}): ${recentChapter.whatLearned}\n`;
    }

    return block;
  }

  /** Handle "how long have you been with us / what have you learned" type questions */
  async buildIdentityResponse(workspaceId: string): Promise<string | null> {
    const narrative = await this.getNarrative(workspaceId);
    if (!narrative) return null;

    const monthsActive = Math.floor(
      (Date.now() - narrative.initializedAt.getTime()) / (30 * 86400000)
    );
    const timePhrase = monthsActive >= 12 ? 'over a year' : monthsActive >= 1 ? `${monthsActive} months` : 'a few weeks';

    // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
    const { rows: ws } = await typedPool(`
      SELECT name FROM workspaces WHERE id = $1 LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    const orgName = ws[0]?.name || 'your organization';

    return `I've been working with ${orgName} for ${timePhrase}. ${narrative.selfAssessment} ${narrative.keyLearnings.length > 0 ? `The most important thing I've learned: ${narrative.keyLearnings[0]}` : ''}`;
  }
}

export const trinityNarrativeIdentityEngine = new TrinityNarrativeIdentityEngine();
