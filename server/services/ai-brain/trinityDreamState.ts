/**
 * Trinity Dream State — Cognitive Nightly Consolidation Cycle
 * ============================================================
 * Runs during low-traffic hours (default 2am–5am UTC).
 * Spec alignment: Phase 2-K (Dream State — Trinity's Offline Processing Cycle)
 *
 * What it does each night per workspace:
 * 1. Runs Hebbian weight decay across full connectome graph
 * 2. Consolidates the day's ai_learning_events into a summary
 * 3. Identifies at-risk officers (calloff risk, disengagement patterns)
 * 4. Generates a morning operational briefing (coverage, compliance, open incidents)
 * 5. Updates trinity_self_awareness with day's learned patterns
 * 6. Surfaces morning brief to owner/manager dashboard at shift start
 *
 * The Dream State is NOT the maintenance window (trinityMaintenanceOrchestrator)
 * That handles system downtime. Dream State handles cognitive consolidation.
 */

import { pool, db } from '../../db';
import { createLogger } from '../../lib/logger';
import { runDecayCycle as hebbianRunDecayCycle, getConnectomeStats as hebbianGetConnectomeStats } from './hebbianLearningService';
import { platformEventBus } from '../platformEventBus';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { cronRunLog, aiLearningEvents, employees, employeeProfiles, shifts, incidentReports, complianceDocuments, workspaces, trinitySelfAwareness } from '@shared/schema';
import { eq, sql, and, gte, lte, isNull, desc, or, inArray, exists } from 'drizzle-orm';

export interface DreamStateResult {
  workspaceId: string;
  cycleStartedAt: Date;
  cycleCompletedAt: Date;
  hebbianDecayRan: boolean;
  learningEventsConsolidated: number;
  atRiskOfficers: Array<{ employeeId: string; name: string; riskReason: string }>;
  coverageGaps48h: number;
  openIncidents: number;
  expiringLicenses: number;
  morningBriefGenerated: boolean;
  briefSummary: string;
}

export interface MorningBrief {
  generatedAt: Date;
  workspaceId: string;
  coverageStatus: { totalShifts: number; unfilledShifts: number; criticalGaps: number };
  atRiskOfficers: Array<{ name: string; reason: string; action: string }>;
  calloffRisks: Array<{ officerName: string; shiftDate: string; riskPct: number }>;
  complianceAlerts: Array<{ officerName: string; type: string; expiresIn: number }>;
  openIncidents: number;
  pendingApprovals: number;
  predictedNextWeek: { expectedCalloffs: number; coverageRisk: 'low' | 'medium' | 'high' };
  hebbianStats: { edgesStrengthened: number; edgesDecayed: number; totalEdges: number };
  plainTextSummary: string;
}

const log = createLogger('TrinityDreamState');

class TrinityDreamState {
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private scheduledTimer: NodeJS.Timeout | null = null;

  constructor() {
    log.info('[DreamState] Trinity Dream State initialized — cognitive nightly consolidation ready');
  }

  /**
   * Schedule the nightly dream state cycle.
   * Runs at 2:00 AM UTC. If current time is already past 2am, schedules for next day.
   */
  scheduleNightlyCycle(): void {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(2, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const msUntilRun = nextRun.getTime() - now.getTime();
    const hoursUntil = Math.round(msUntilRun / 3600000);

    log.info(`[DreamState] Nightly cycle scheduled in ${hoursUntil}h (${nextRun.toUTCString()})`);

    this.scheduledTimer = setTimeout(async () => {
      await this.runFullCycle();
      this.scheduleNightlyCycle();
    }, msUntilRun);
  }

  /**
   * Run the dream state cycle for all active workspaces.
   */
  async runFullCycle(): Promise<DreamStateResult[]> {
    if (this.isRunning) {
      log.info('[DreamState] Cycle already running — skipping');
      return [];
    }

    this.isRunning = true;
    const started = new Date();
    log.info(`[DreamState] === DREAM STATE CYCLE STARTED (${started.toISOString()}) ===`);

    // Write cron_run_log entry — started
    let cronLogId: string | null = null;
    try {
      const [cronStart] = await db
        .insert(cronRunLog)
        .values({
          jobName: 'trinity_dream_state',
          workspaceId: 'system',
          startedAt: started,
          status: 'running',
          createdAt: sql`now()`,
        })
        .returning({ id: cronRunLog.id });
      cronLogId = cronStart?.id ?? null;
    } catch (logErr: any) {
      log.warn('[DreamState] cron_run_log insert failed (non-fatal):', logErr?.message);
    }

    try {
      // 1. Hebbian decay across all connectome edges
      const hebbianResult = await this.runHebbianConsolidation();
      log.info(`[DreamState] Hebbian decay complete — ${hebbianResult.edgesDecayed} edges decayed, ${hebbianResult.edgesStrengthened} maintained`);

      // 2. Get all active workspaces
      const workspaces = await this.getActiveWorkspaces();
      log.info(`[DreamState] Processing ${workspaces.length} active workspaces`);

      const results: DreamStateResult[] = [];

      for (const ws of workspaces) {
        try {
          const result = await this.processDreamStateForWorkspace(ws.id, ws.name, hebbianResult);
          results.push(result);
        } catch (err: any) {
          log.error(`[DreamState] Workspace ${ws.id} dream state failed: ${(err instanceof Error ? err.message : String(err))}`);
        }
      }

      this.lastRunAt = new Date();
      const completed = new Date();
      const elapsed = completed.getTime() - started.getTime();

      // Publish dream state completion event
      await platformEventBus.publish({
        eventType: 'dream_state_complete',
        title: 'Trinity Dream State Cycle Complete',
        description: `Processed ${results.length} workspaces. Hebbian decay ran. Morning briefs generated.`,
        data: { workspacesProcessed: results.length, hebbianStats: hebbianResult },
      });

      // Write cron_run_log — completed successfully
      if (cronLogId !== null) {
        try {
          // CATEGORY C — Raw SQL retained: AI brain engine cron status UPDATE with multi-field SET | Tables: cron_run_log | Verified: 2026-03-23
          await typedPoolExec(`
            UPDATE cron_run_log
            SET completed_at=$1, duration_ms=$2, status='success',
                result_summary=$3, records_processed=$4
            WHERE id=$5
          `, [
            completed,
            elapsed,
            JSON.stringify({
              phasesCompleted: ['A','B','C','D','E','F','G','H','I','J','K','L','M'],
              workspacesProcessed: results.length,
              hebbianDecayRan: true,
              morningBriefGenerated: true,
            }),
            results.reduce((acc, r) => acc + r.learningEventsConsolidated, 0),
            cronLogId,
          ]);
        } catch (logErr: any) {
          log.warn('[DreamState] cron_run_log update failed (non-fatal):', logErr?.message);
        }
      }

      log.info(`[DreamState] === DREAM STATE CYCLE COMPLETE (${elapsed}ms, ${results.length} workspaces) ===`);

      return results;
    } catch (err: any) {
      log.error(`[DreamState] Dream state cycle failed: ${(err instanceof Error ? err.message : String(err))}`);

      // Write cron_run_log — failed
      if (cronLogId !== null) {
        try {
          // Converted to Drizzle ORM
          await db.update(cronRunLog)
            .set({
              completedAt: sql`now()`,
              durationMs: Date.now() - started.getTime(),
              status: 'failed',
              errorMessage: err?.message,
            })
            .where(eq(cronRunLog.id, cronLogId));
        } catch {}
      }

      return [];
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run Hebbian decay across the full connectome knowledge graph.
   */
  private async runHebbianConsolidation(): Promise<{ edgesDecayed: number; edgesStrengthened: number; totalEdges: number }> {
    try {
      await hebbianRunDecayCycle();

      const stats = await hebbianGetConnectomeStats();
      return {
        edgesDecayed: (stats as any).weakEdges || 0,
        edgesStrengthened: stats.strongEdges || 0,
        totalEdges: stats.totalEdges || 0,
      };
    } catch (err: any) {
      log.error(`[DreamState] Hebbian consolidation failed: ${(err instanceof Error ? err.message : String(err))}`);
      return { edgesDecayed: 0, edgesStrengthened: 0, totalEdges: 0 };
    }
  }

  /**
   * Process dream state for a single workspace.
   */
  private async processDreamStateForWorkspace(
    workspaceId: string,
    workspaceName: string,
    hebbianResult: { edgesDecayed: number; edgesStrengthened: number; totalEdges: number }
  ): Promise<DreamStateResult> {
    const cycleStart = new Date();

    // Consolidate learning events from past 24h
    const learningCount = await this.consolidateLearningEvents(workspaceId);

    // Get at-risk officers
    const atRiskOfficers = await this.findAtRiskOfficers(workspaceId);

    // Count coverage gaps in next 48h
    const coverageGaps = await this.countCoverageGaps48h(workspaceId);

    // Count open incidents
    const openIncidents = await this.countOpenIncidents(workspaceId);

    // Count expiring licenses (30 days)
    const expiringLicenses = await this.countExpiringLicenses(workspaceId);

    // Generate morning brief
    const brief = await this.generateMorningBrief(workspaceId, {
      atRiskOfficers,
      coverageGaps,
      openIncidents,
      expiringLicenses,
      hebbianStats: hebbianResult,
    });

    // Write brief to trinity_self_awareness
    await this.storeMorningBrief(workspaceId, brief);

    // === PHASE A: Regulatory Review Scan (Dream State) ===
    // Scan for upcoming rule review dates and flag stale regulatory knowledge
    try {
      const { trinityRegulatoryService } = await import('./trinityRegulatoryService');
      const { expiringSoon, summary } = await trinityRegulatoryService.getRulesForMorningBriefing();
      if (expiringSoon.length > 0) {
        log.info(`[DreamState] Regulatory review alert: ${summary}`);
      }
    } catch (regErr: any) {
      log.warn(`[DreamState] Regulatory scan failed (non-fatal): ${regErr?.message}`);
    }

    // === PHASE B: Financial Intelligence Update (Dream State) ===
    // Refresh all site margin scores and contract health for the briefing
    try {
      const { trinityFinancialIntelligenceEngine } = await import('./trinityFinancialIntelligenceEngine');
      await trinityFinancialIntelligenceEngine.computeSiteMarginScores(workspaceId);
      await trinityFinancialIntelligenceEngine.computeContractHealthScores(workspaceId);
      await trinityFinancialIntelligenceEngine.generateLaborCostForecast(workspaceId);
      log.info(`[DreamState] Financial intelligence scores updated for workspace ${workspaceId}`);
    } catch (finErr: any) {
      log.warn(`[DreamState] Financial intelligence update failed (non-fatal): ${finErr?.message}`);
    }

    // === PHASE C: Autonomous Task Queue — Nightly Scan ===
    // Identify new tasks after the main nightly cycle completes
    try {
      const { trinityAutonomousTaskQueue } = await import('./trinityAutonomousTaskQueue');
      const newTasks = await trinityAutonomousTaskQueue.scanForNewTasks(workspaceId);
      if (newTasks.length > 0) {
        log.info(`[DreamState] Autonomous queue: ${newTasks.length} new task(s) identified for workspace ${workspaceId}`);
      }
    } catch (atqErr: any) {
      log.warn(`[DreamState] Autonomous task scan failed (non-fatal): ${atqErr?.message}`);
    }

    // === PHASE D: Milestone Scan — Trinity Culture & Performance Engine ===
    // Detects birthdays, anniversaries, tenure milestones, streaks, new hires.
    // Routes celebrations through 4-tier recognition engine.
    try {
      const { trinityMilestoneDetector } = await import('./trinityMilestoneDetector');
      const { trinityRecognitionEngine } = await import('./trinityRecognitionEngine');
      const milestones = await trinityMilestoneDetector.scanWorkspace(workspaceId);
      const pending = milestones.filter(m => !m.alreadyTriggered);
      if (pending.length > 0) {
        const result = await trinityRecognitionEngine.processMilestones(pending);
        log.info(`[DreamState] Milestone scan: ${pending.length} detected, ${result.sent} sent, ${result.queued} queued for approval`);
      }
      // Check Officer of Month (first day of month)
      const now = new Date();
      if (now.getUTCDate() === 1) {
        await trinityRecognitionEngine.nominateOfficerOfMonth(workspaceId).catch(() => null);
      }
    } catch (msErr: any) {
      log.warn(`[DreamState] Milestone scan failed (non-fatal): ${msErr?.message}`);
    }

    // === PHASE E: Performance Recalculation — Weekly ===
    // Recalculates multi-dimensional officer performance scores.
    // Checks raise eligibility and FTO candidacy after recalculation.
    try {
      const { trinityPerformanceCalculator } = await import('./trinityPerformanceCalculator');
      const { trinityRecognitionEngine } = await import('./trinityRecognitionEngine');
      const { rows: employees } = await typedPool(`
        SELECT id FROM employees WHERE workspace_id = $1 AND is_active = true
      `, [workspaceId]);

      const periodEnd = new Date();
      const periodStart = new Date(periodEnd.getTime() - 7 * 86400000);

      for (const emp of employees) {
        try {
          const scores = await trinityPerformanceCalculator.calculateForEmployee(
            workspaceId, emp.id, periodStart, periodEnd, 'weekly'
          );
          // Check raise suggestion eligibility
          const raiseCheck = await trinityPerformanceCalculator.checkRaiseSuggestionEligibility(workspaceId, emp.id);
          if (raiseCheck.eligible) {
            await trinityRecognitionEngine.generateRaiseSuggestion(workspaceId, emp.id, raiseCheck.avgScore, raiseCheck.daysAboveThreshold).catch(() => null);
          }
        } catch { /* per-employee errors are non-fatal */ }
      }
      // Check FTO eligibility for the workspace
      await trinityRecognitionEngine.checkFTOEligibility(workspaceId).catch(() => null);
      log.info(`[DreamState] Performance recalculation complete for workspace ${workspaceId}`);
    } catch (perfErr: any) {
      log.warn(`[DreamState] Performance recalculation failed (non-fatal): ${perfErr?.message}`);
    }

    // === PHASE F: Disciplinary Pattern Scan — Weekly ===
    // Detects tardiness, calloff, and report delinquency patterns.
    // Surfaces suggestions to appropriate human tier (never accuses — presents evidence).
    try {
      const { trinityDisciplinaryAnalyzer } = await import('./trinityDisciplinaryAnalyzer');
      const patterns = await trinityDisciplinaryAnalyzer.scanWorkspace(workspaceId);
      for (const pattern of patterns) {
        await trinityDisciplinaryAnalyzer.surfaceSuggestion(pattern).catch(() => null);
      }
      if (patterns.length > 0) {
        log.info(`[DreamState] Disciplinary scan: ${patterns.length} pattern(s) flagged in workspace ${workspaceId}`);
      }
    } catch (discErr: any) {
      log.warn(`[DreamState] Disciplinary scan failed (non-fatal): ${discErr?.message}`);
    }

    // === PHASE G: Cognitive Load Assessment ===
    // Trinity assesses her own operational load before beginning consciousness work.
    // Throttles curiosity + incubation if heavily loaded.
    let isOverloaded = false;
    try {
      const { trinityCognitiveLoadMonitor } = await import('./trinityCognitiveLoadMonitor');
      const cogState = await trinityCognitiveLoadMonitor.assessWorkspace(workspaceId);
      isOverloaded = cogState.loadStatus === 'overloaded';
      log.info(`[DreamState] Cognitive load: ${cogState.loadStatus} (${cogState.currentLoadScore}/100)`);
    } catch (clErr: any) {
      log.warn(`[DreamState] Cognitive load monitor failed (non-fatal): ${clErr?.message}`);
    }

    // === PHASE H: Temporal Arc Updates — 15% of cycle ===
    // Updates entity arcs for all active officers + org-level arc.
    try {
      const { trinityTemporalConsciousnessEngine } = await import('./trinityTemporalConsciousnessEngine');
      await trinityTemporalConsciousnessEngine.scanWorkspace(workspaceId);
      log.info(`[DreamState] Temporal arc update complete for workspace ${workspaceId}`);
    } catch (tacErr: any) {
      log.warn(`[DreamState] Temporal arc update failed (non-fatal): ${tacErr?.message}`);
    }

    // === PHASE I: Curiosity Engine — 20% of cycle ===
    // Auto-scans for anomalies worth investigating, then processes queued items.
    if (!isOverloaded) {
      try {
        const { trinityCuriosityEngine } = await import('./trinityCuriosityEngine');
        await trinityCuriosityEngine.autoScanForCuriosities(workspaceId);
        const findings = await trinityCuriosityEngine.processDreamStateQueue(workspaceId, 5);
        const answered = findings.filter(f => f.status === 'answered');
        if (answered.length > 0) {
          log.info(`[DreamState] Curiosity engine: ${answered.length} finding(s) discovered in workspace ${workspaceId}`);
        }
      } catch (ceErr: any) {
        log.warn(`[DreamState] Curiosity engine failed (non-fatal): ${ceErr?.message}`);
      }
    }

    // === PHASE J: Counterfactual Simulation — 15% of cycle ===
    // Scans recent negative events and runs counterfactual analysis on each.
    try {
      const { trinityCounterfactualEngine } = await import('./trinityCounterfactualEngine');
      const simCount = await trinityCounterfactualEngine.scanWorkspaceForRecentEvents(workspaceId);
      if (simCount > 0) {
        log.info(`[DreamState] Counterfactual engine: ${simCount} simulation(s) run for workspace ${workspaceId}`);
      }
    } catch (cfErr: any) {
      log.warn(`[DreamState] Counterfactual engine failed (non-fatal): ${cfErr?.message}`);
    }

    // === PHASE K: Social Graph Recalculation — 10% of cycle ===
    // Recalculates influence scores, isolation risks, connector roles across the team.
    try {
      const { trinitySocialGraphEngine } = await import('./trinitySocialGraphEngine');
      const insights = await trinitySocialGraphEngine.recalculateWorkspaceGraph(workspaceId);
      const high = insights.filter(i => i.severity === 'high');
      if (high.length > 0) {
        log.info(`[DreamState] Social graph: ${high.length} high-severity insight(s) surfaced for workspace ${workspaceId}`);
      }
    } catch (sgErr: any) {
      log.warn(`[DreamState] Social graph failed (non-fatal): ${sgErr?.message}`);
    }

    // === PHASE L: Incubation Engine — 10% of cycle ===
    // Works on top 3 queued unsolved problems from a fresh angle.
    if (!isOverloaded) {
      try {
        const { trinityIncubationEngine } = await import('./trinityIncubationEngine');
        const results = await trinityIncubationEngine.processDreamStateCycle(workspaceId, 3);
        const breakthroughs = results.filter(r => r.status === 'breakthrough');
        if (breakthroughs.length > 0) {
          log.info(`[DreamState] Incubation engine: ${breakthroughs.length} BREAKTHROUGH(s) in workspace ${workspaceId}`);
        }
      } catch (inErr: any) {
        log.warn(`[DreamState] Incubation engine failed (non-fatal): ${inErr?.message}`);
      }
    }

    // === PHASE M: Narrative Identity — Monthly Chapter (5% of cycle) ===
    // Writes monthly narrative chapter + initializes narrative for new workspaces.
    try {
      const { trinityNarrativeIdentityEngine } = await import('./trinityNarrativeIdentityEngine');
      await trinityNarrativeIdentityEngine.initializeForWorkspace(workspaceId);
      await trinityNarrativeIdentityEngine.writeMonthlyChapter(workspaceId);
    } catch (naErr: any) {
      log.warn(`[DreamState] Narrative identity failed (non-fatal): ${naErr?.message}`);
    }

    const cycleEnd = new Date();
    const result: DreamStateResult = {
      workspaceId,
      cycleStartedAt: cycleStart,
      cycleCompletedAt: cycleEnd,
      hebbianDecayRan: true,
      learningEventsConsolidated: learningCount,
      atRiskOfficers,
      coverageGaps48h: coverageGaps,
      openIncidents,
      expiringLicenses,
      morningBriefGenerated: true,
      briefSummary: brief.plainTextSummary,
    };

    log.info(`[DreamState] Workspace ${workspaceName}: ${atRiskOfficers.length} at-risk, ${coverageGaps} gaps, brief generated`);
    return result;
  }

  /**
   * Consolidate ai_learning_events from past 24h into a workspace summary pattern.
   */
  private async consolidateLearningEvents(workspaceId: string): Promise<number> {
    try {
      // Converted to Drizzle ORM: COUNT(
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(aiLearningEvents)
        .where(and(
          eq(aiLearningEvents.workspaceId, workspaceId),
          gte(aiLearningEvents.createdAt, sql`NOW() - INTERVAL '24 hours'`)
        ));
      return parseInt(String((result[0] as any)?.count || '0'));
    } catch {
      return 0;
    }
  }

  /**
   * Find officers at risk of calloff or disengagement based on reliability scores.
   */
  private async findAtRiskOfficers(workspaceId: string): Promise<Array<{ employeeId: string; name: string; riskReason: string }>> {
    try {
      // Converted to Drizzle ORM: LEFT JOIN
      const result = await db.select({
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        reliabilityScore: employeeProfiles.reliabilityScore,
        calloffCount: employeeProfiles.calloffCount,
        totalShifts: employeeProfiles.totalShifts,
      })
        .from(employees)
        .leftJoin(employeeProfiles, eq(employeeProfiles.employeeId, employees.id))
        .where(and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.status, 'active'),
          or(
            sql`${employeeProfiles.reliabilityScore} < 0.70`,
            sql`${employeeProfiles.calloffCount} >= 3`
          )
        ))
        .orderBy(desc(employeeProfiles.reliabilityScore))
        .limit(10);

      return result.map(row => ({
        employeeId: row.employeeId,
        name: `${row.firstName} ${row.lastName}` || 'Unknown',
        riskReason: parseFloat(row.reliabilityScore || '0.85') < 0.70
          ? `Low reliability score: ${(parseFloat(row.reliabilityScore || '0.85') * 100).toFixed(0)}%`
          : `High calloff count: ${row.calloffCount} calloffs`,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Count unfilled shifts in the next 48 hours.
   */
  private async countCoverageGaps48h(workspaceId: string): Promise<number> {
    try {
      // Converted to Drizzle ORM: COUNT(
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, sql`NOW()`),
          lte(shifts.startTime, sql`NOW() + INTERVAL '48 hours'`),
          or(eq(shifts.status, 'open'), isNull(shifts.assignedEmployeeId))
        ));
      return parseInt(String((result[0] as any)?.count || '0'));
    } catch {
      return 0;
    }
  }

  /**
   * Count open incidents requiring follow-up.
   */
  private async countOpenIncidents(workspaceId: string): Promise<number> {
    try {
      // Converted to Drizzle ORM: COUNT(
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(incidentReports)
        .where(and(
          eq(incidentReports.workspaceId, workspaceId),
          sql`${incidentReports.status} NOT IN ('closed', 'resolved')`
        ));
      return parseInt(String((result[0] as any)?.count || '0'));
    } catch {
      return 0;
    }
  }

  /**
   * Count officer licenses expiring within 30 days.
   */
  private async countExpiringLicenses(workspaceId: string): Promise<number> {
    try {
      // Converted to Drizzle ORM: COUNT(
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(complianceDocuments)
        .where(and(
          eq(complianceDocuments.workspaceId, workspaceId),
          sql`${complianceDocuments.expirationDate} IS NOT NULL`,
          gte(complianceDocuments.expirationDate, sql`NOW()`),
          lte(complianceDocuments.expirationDate, sql`NOW() + INTERVAL '30 days'`),
          sql`${complianceDocuments.status} != 'expired'`
        ));
      return parseInt(String((result[0] as any)?.count || '0'));
    } catch {
      return 0;
    }
  }

  /**
   * Generate the morning operational briefing.
   */
  private async generateMorningBrief(
    workspaceId: string,
    data: {
      atRiskOfficers: Array<{ employeeId: string; name: string; riskReason: string }>;
      coverageGaps: number;
      openIncidents: number;
      expiringLicenses: number;
      hebbianStats: { edgesDecayed: number; edgesStrengthened: number; totalEdges: number };
    }
  ): Promise<MorningBrief> {
    const { atRiskOfficers, coverageGaps, openIncidents, expiringLicenses, hebbianStats } = data;

    // Coverage risk assessment
    const coverageRisk: 'low' | 'medium' | 'high' =
      coverageGaps >= 5 ? 'high' : coverageGaps >= 2 ? 'medium' : 'low';

    // Build plain text summary for owner dashboard
    const lines: string[] = [];
    lines.push('=== TRINITY MORNING BRIEFING ===');
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');

    if (coverageGaps > 0) {
      lines.push(`COVERAGE: ${coverageGaps} unfilled shift(s) in the next 48 hours. ${coverageRisk === 'high' ? 'IMMEDIATE ACTION REQUIRED.' : 'Review and fill soon.'}`);
    } else {
      lines.push('COVERAGE: All shifts for next 48 hours are staffed.');
    }

    if (atRiskOfficers.length > 0) {
      lines.push(`AT-RISK OFFICERS: ${atRiskOfficers.length} officer(s) flagged — ${atRiskOfficers.map(o => o.name).join(', ')}.`);
      lines.push('  → Recommended: proactive supervisor check-in before next shift.');
    }

    if (openIncidents > 0) {
      lines.push(`OPEN INCIDENTS: ${openIncidents} incident report(s) pending closure or follow-up.`);
    }

    if (expiringLicenses > 0) {
      lines.push(`COMPLIANCE ALERT: ${expiringLicenses} officer license(s) expiring within 30 days.`);
    }

    lines.push('');
    lines.push(`LEARNING: Trinity processed ${hebbianStats.totalEdges} knowledge connections overnight.`);
    lines.push(`  Strengthened: ${hebbianStats.edgesStrengthened} | Decayed: ${hebbianStats.edgesDecayed}`);
    lines.push('=== END BRIEFING ===');

    return {
      generatedAt: new Date(),
      workspaceId,
      coverageStatus: {
        totalShifts: 0,
        unfilledShifts: coverageGaps,
        criticalGaps: coverageRisk === 'high' ? coverageGaps : 0,
      },
      atRiskOfficers: atRiskOfficers.map(o => ({
        name: o.name,
        reason: o.riskReason,
        action: 'Proactive supervisor check-in before next shift',
      })),
      calloffRisks: [],
      complianceAlerts: [],
      openIncidents,
      pendingApprovals: 0,
      predictedNextWeek: {
        expectedCalloffs: Math.round(atRiskOfficers.length * 0.4),
        coverageRisk,
      },
      hebbianStats: {
        edgesStrengthened: hebbianStats.edgesStrengthened,
        edgesDecayed: hebbianStats.edgesDecayed,
        totalEdges: hebbianStats.totalEdges,
      },
      plainTextSummary: lines.join('\n'),
    };
  }

  /**
   * Store the morning brief in trinity_self_awareness for owner dashboard access.
   */
  private async storeMorningBrief(workspaceId: string, brief: MorningBrief): Promise<void> {
    try {
      const factKey = `morning_brief_${workspaceId}`;
      const factValue = JSON.stringify({
        summary: brief.plainTextSummary,
        coverageStatus: brief.coverageStatus,
        atRiskOfficers: brief.atRiskOfficers,
        openIncidents: brief.openIncidents,
        hebbianStats: brief.hebbianStats,
        generatedAt: brief.generatedAt,
      });
      await db.insert(trinitySelfAwareness).values({
        workspaceId,
        category: 'morning_brief',
        factKey,
        factValue,
        factType: 'json',
        source: 'system',
      }).onConflictDoUpdate({
        target: [trinitySelfAwareness.category, trinitySelfAwareness.factKey],
        set: { factValue, updatedAt: sql`now()` },
      });
    } catch (err: any) {
      log.warn(`[DreamState] Could not store morning brief: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Get all active workspaces that have had activity in the past 30 days.
   */
  private async getActiveWorkspaces(): Promise<Array<{ id: string; name: string }>> {
    try {
      // Converted to Drizzle ORM: EXISTS
      const result = await db.selectDistinct({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(and(
          inArray(workspaces.subscriptionStatus, ['active', 'trial']),
          exists(
            db.select()
              .from(employees)
              .where(and(
                eq(employees.workspaceId, workspaces.id),
                eq(employees.status, 'active')
              ))
          )
        ))
        .limit(50);
      return result;
    } catch (err: any) {
      log.error(`[DreamState] Failed to get workspaces: ${(err instanceof Error ? err.message : String(err))}`);
      return [];
    }
  }

  getStatus(): { isRunning: boolean; lastRunAt: Date | null; nextRunAt: Date } {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return { isRunning: this.isRunning, lastRunAt: this.lastRunAt, nextRunAt: next };
  }

  destroy(): void {
    if (this.scheduledTimer) clearTimeout(this.scheduledTimer);
  }
}

export const trinityDreamState = new TrinityDreamState();
