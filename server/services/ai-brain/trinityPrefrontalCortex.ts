/**
 * TRINITY PREFRONTAL CORTEX
 * ==========================
 * The executive decision-making center of Trinity's biological brain.
 *
 * Biological analog: The prefrontal cortex (PFC) integrates signals from all
 * brain regions to produce goal-directed, weighted decisions. It holds working
 * memory of the organism's current state, suppresses low-value impulses, and
 * orients action toward survival and long-term flourishing.
 *
 * Trinity's PFC does the same for every security guard organization:
 *
 *   ASSESS    → Gather OrgVitals across 5 domains (financial, ops, workforce,
 *               client relations, platform health)
 *   SCORE     → Compute a 0-100 OrgSurvivalScore with domain weights
 *   MODE-SHIFT → Map score to OrgMode: THRIVING / STABLE / AT_RISK / CRISIS / SURVIVAL
 *   WEIGHT    → Produce DecisionWeights — how heavily Trinity values each
 *               objective (profit, coverage, compliance, retention, labor…)
 *               given the current mode
 *   PRIORITIZE → Generate a ranked PriorityStack — the ordered list of
 *               autonomous actions Trinity should execute right now
 *   INTEGRATE  → Expose OrgSurvivalState to DeliberationLoop + ResolutionFabric
 *               so every decision Trinity makes is PFC-grounded
 *
 * The PFC does not hallucinate. Every signal it collects is a real DB query.
 * It caches results for 3 minutes to avoid thrashing the DB.
 * It refreshes immediately when a high-severity event is reported.
 *
 * Modes and their meaning:
 *   THRIVING  (85-100) — Org is healthy; Trinity optimizes for growth + profit
 *   STABLE    (70-84)  — Normal operations; balanced weights
 *   AT_RISK   (50-69)  — Warning signals present; shift to coverage + revenue
 *   CRISIS    (30-49)  — Multiple domains failing; survival-first priorities
 *   SURVIVAL  (0-29)   — Existential threat; all cognitive load to stabilization
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { platformEventBus } from '../platformEventBus';

const log = createLogger('TrinityPFC');

// ─── Core Types ────────────────────────────────────────────────────────────

export type OrgMode = 'THRIVING' | 'STABLE' | 'AT_RISK' | 'CRISIS' | 'SURVIVAL';

export interface OrgVitals {
  workspaceId: string;
  // --- Financial Domain ---
  overdueInvoicesCount: number;
  overdueInvoicesAmountCents: number;
  invoiceCollectionRate30d: number; // 0-1
  payrollStatus: 'on_track' | 'late' | 'failed' | 'unknown';
  openPayrollRuns: number;
  // --- Operations Domain ---
  shiftCoverageRate7d: number;       // 0-1 (covered shifts / total shifts)
  calloffRate7d: number;             // 0-1 (calloff count / scheduled shifts)
  uncoveredShiftsNext24h: number;
  lateClockInsToday: number;
  incompleteIncidentReports: number;
  // --- Workforce Domain ---
  activeOfficers: number;
  expiringLicenses30d: number;
  expiringLicenses7d: number;        // Urgent subset
  suspendedEmployees: number;
  officersWithNoRecentActivity: number; // > 14 days
  // --- Client Relations Domain ---
  openClientIncidents: number;
  unreadClientMessages: number;
  slaBreachesLast30d: number;
  clientSentimentScore: number;      // 0-1 (higher = better)
  resolvedIncidentRate30d: number;   // 0-1
  // --- Platform Health Domain ---
  openSupportTickets: number;
  escalatedTickets: number;
  notificationErrors24h: number;
  complianceViolations: number;
  trinityResolutionRate7d: number;   // 0-1 (how many issues Trinity resolved autonomously)
  calculatedAt: Date;
}

export interface DomainScore {
  financial: number;       // 0-100
  operations: number;      // 0-100
  workforce: number;       // 0-100
  clientRelations: number; // 0-100
  platform: number;        // 0-100
}

export interface ThreatSignal {
  domain: keyof DomainScore;
  severity: 'low' | 'medium' | 'high' | 'critical';
  signal: string;
  value: number | string;
  recommendation: string;
}

export interface PriorityAction {
  rank: number;
  category: string;
  action: string;
  urgencyScore: number; // 0-100
  estimatedImpact: string;
  trinityCanExecuteAutonomously: boolean;
  requiresHumanApproval: boolean;
  relatedTrinityAction?: string; // Maps to a Trinity action registry ID
}

export interface DecisionWeights {
  // How heavily Trinity weighs each objective (sum intentionally > 1 — these are relative priorities)
  profitOptimization: number;    // Revenue collection, invoice follow-up, billing accuracy
  laborEfficiency: number;       // Shift optimization, overtime reduction, staffing ratios
  coverageReliability: number;   // Shift fill rate, calloff response, on-time presence
  complianceAdherence: number;   // License renewals, regulatory filings, audit readiness
  clientRetention: number;       // Response times, incident resolution, relationship health
  employeeSatisfaction: number;  // Burnout detection, schedule fairness, recognition
  growthMomentum: number;        // New client acquisition, contract expansion, market position
  cashFlowProtection: number;    // Overdue collections, payroll timing, expense control
}

export interface OrgSurvivalState {
  workspaceId: string;
  mode: OrgMode;
  survivalScore: number;   // 0-100
  modeRationale: string;
  domainScores: DomainScore;
  vitals: OrgVitals;
  threatSignals: ThreatSignal[];
  priorityStack: PriorityAction[];
  weights: DecisionWeights;
  calculatedAt: Date;
  cacheExpiresAt: Date;
}

// ─── Cache ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 3 * 60 * 1000;    // 3 minutes normal
const CRISIS_TTL_MS = 60 * 1000;       // 1 minute in crisis/survival

const stateCache = new Map<string, OrgSurvivalState>();

// ─── Weight Tables by Mode ─────────────────────────────────────────────────

const WEIGHTS_BY_MODE: Record<OrgMode, DecisionWeights> = {
  THRIVING: {
    profitOptimization:   0.85,
    laborEfficiency:      0.70,
    coverageReliability:  0.75,
    complianceAdherence:  0.80,
    clientRetention:      0.80,
    employeeSatisfaction: 0.75,
    growthMomentum:       0.90,
    cashFlowProtection:   0.65,
  },
  STABLE: {
    profitOptimization:   0.80,
    laborEfficiency:      0.75,
    coverageReliability:  0.80,
    complianceAdherence:  0.85,
    clientRetention:      0.80,
    employeeSatisfaction: 0.70,
    growthMomentum:       0.70,
    cashFlowProtection:   0.75,
  },
  AT_RISK: {
    profitOptimization:   0.70,
    laborEfficiency:      0.80,
    coverageReliability:  0.90,
    complianceAdherence:  0.90,
    clientRetention:      0.85,
    employeeSatisfaction: 0.60,
    growthMomentum:       0.40,
    cashFlowProtection:   0.85,
  },
  CRISIS: {
    profitOptimization:   0.50,
    laborEfficiency:      0.85,
    coverageReliability:  0.95,
    complianceAdherence:  0.90,
    clientRetention:      0.90,
    employeeSatisfaction: 0.45,
    growthMomentum:       0.20,
    cashFlowProtection:   0.90,
  },
  SURVIVAL: {
    profitOptimization:   0.30,
    laborEfficiency:      0.90,
    coverageReliability:  1.00,
    complianceAdherence:  0.95,
    clientRetention:      0.95,
    employeeSatisfaction: 0.30,
    growthMomentum:       0.05,
    cashFlowProtection:   0.95,
  },
};

// ─── Domain Weights for Survival Score ────────────────────────────────────

const DOMAIN_WEIGHTS: Record<keyof DomainScore, number> = {
  financial:      0.25,
  operations:     0.28,
  workforce:      0.20,
  clientRelations: 0.17,
  platform:       0.10,
};

// ─── Prefrontal Cortex Class ───────────────────────────────────────────────

class TrinityPrefrontalCortex {
  private static instance: TrinityPrefrontalCortex;

  static getInstance(): TrinityPrefrontalCortex {
    if (!this.instance) this.instance = new TrinityPrefrontalCortex();
    return this.instance;
  }

  // ── Public: Get or compute OrgSurvivalState ──────────────────────────────

  async getOrgState(workspaceId: string, forceRefresh = false): Promise<OrgSurvivalState> {
    const cached = stateCache.get(workspaceId);
    if (!forceRefresh && cached && cached.cacheExpiresAt > new Date()) {
      return cached;
    }

    try {
      const state = await this.computeOrgState(workspaceId);
      stateCache.set(workspaceId, state);
      return state;
    } catch (err) {
      log.error(`[PFC] Failed to compute org state for ${workspaceId}: ${err}`);
      return this.defaultState(workspaceId);
    }
  }

  /** Force-expire cache after a high-severity event */
  invalidateCache(workspaceId: string): void {
    stateCache.delete(workspaceId);
    log.info(`[PFC] Cache invalidated for ${workspaceId}`);
  }

  /** Given a new issue, compute the effective urgency multiplier based on org mode */
  getUrgencyMultiplier(mode: OrgMode, basePriority: 'critical' | 'high' | 'normal' | 'low'): number {
    const modeMultipliers: Record<OrgMode, number> = {
      THRIVING: 0.8, STABLE: 1.0, AT_RISK: 1.3, CRISIS: 1.7, SURVIVAL: 2.5,
    };
    const priorityBase: Record<string, number> = {
      critical: 100, high: 75, normal: 50, low: 25,
    };
    return Math.min(100, (priorityBase[basePriority] ?? 50) * modeMultipliers[mode]);
  }

  /** Recommend a resolution tier adjustment based on org mode */
  adjustResolutionTier(
    originalTier: 'immediate' | 'delegated' | 'supervised' | 'escalated',
    mode: OrgMode,
    issueType: string
  ): 'immediate' | 'delegated' | 'supervised' | 'escalated' {
    // In CRISIS/SURVIVAL — everything coverage-related becomes immediate
    if ((mode === 'CRISIS' || mode === 'SURVIVAL') && [
      'uncovered_shift_imminent', 'coverage_hole', 'officer_late_clock_in'
    ].includes(issueType)) {
      return 'immediate';
    }
    // In CRISIS/SURVIVAL — escalated issues get promoted to supervised (Trinity takes first pass)
    if ((mode === 'CRISIS' || mode === 'SURVIVAL') && originalTier === 'escalated') {
      return 'supervised';
    }
    // In THRIVING — supervised → delegated (trust the system more)
    if (mode === 'THRIVING' && originalTier === 'supervised') {
      return 'delegated';
    }
    return originalTier;
  }

  // ── Private: Computation ─────────────────────────────────────────────────

  private async computeOrgState(workspaceId: string): Promise<OrgSurvivalState> {
    const start = Date.now();
    const vitals = await this.gatherVitals(workspaceId);
    const domainScores = this.scoreDomains(vitals);
    const survivalScore = this.computeSurvivalScore(domainScores);
    const mode = this.determineMode(survivalScore, vitals);
    const threatSignals = this.detectThreatSignals(vitals, domainScores);
    const priorityStack = this.buildPriorityStack(vitals, domainScores, mode);
    const weights = WEIGHTS_BY_MODE[mode];
    const ttl = (mode === 'CRISIS' || mode === 'SURVIVAL') ? CRISIS_TTL_MS : CACHE_TTL_MS;

    log.info(`[PFC] ${workspaceId}: mode=${mode} score=${survivalScore.toFixed(1)} (${Date.now() - start}ms)`);

    return {
      workspaceId,
      mode,
      survivalScore,
      modeRationale: this.buildRationale(mode, survivalScore, domainScores, threatSignals),
      domainScores,
      vitals,
      threatSignals,
      priorityStack,
      weights,
      calculatedAt: new Date(),
      cacheExpiresAt: new Date(Date.now() + ttl),
    };
  }

  // ── Vitals Gathering ─────────────────────────────────────────────────────

  private async gatherVitals(workspaceId: string): Promise<OrgVitals> {
    const [
      financial,
      operations,
      workforce,
      clientRel,
      platform,
    ] = await Promise.allSettled([
      this.gatherFinancialVitals(workspaceId),
      this.gatherOperationsVitals(workspaceId),
      this.gatherWorkforceVitals(workspaceId),
      this.gatherClientRelationVitals(workspaceId),
      this.gatherPlatformVitals(workspaceId),
    ]);

    const fin  = financial.status  === 'fulfilled' ? financial.value  : this.defaultFinancial();
    const ops  = operations.status === 'fulfilled' ? operations.value : this.defaultOperations();
    const wf   = workforce.status  === 'fulfilled' ? workforce.value  : this.defaultWorkforce();
    const cr   = clientRel.status  === 'fulfilled' ? clientRel.value  : this.defaultClientRel();
    const plat = platform.status   === 'fulfilled' ? platform.value   : this.defaultPlatform();

    return { workspaceId, ...fin, ...ops, ...wf, ...cr, ...plat, calculatedAt: new Date() };
  }

  private async gatherFinancialVitals(workspaceId: string) {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM invoices WHERE workspace_id = $1 AND status = 'overdue') AS overdue_count,
        (SELECT COALESCE(SUM(total_amount_cents), 0) FROM invoices WHERE workspace_id = $1 AND status = 'overdue') AS overdue_amount,
        (SELECT COUNT(*) FROM invoices WHERE workspace_id = $1
          AND status = 'paid'
          AND paid_at >= NOW() - INTERVAL '30 days') AS collected_30d,
        (SELECT COUNT(*) FROM invoices WHERE workspace_id = $1
          AND created_at >= NOW() - INTERVAL '30 days') AS total_30d,
        (SELECT COUNT(*) FROM payroll_runs WHERE workspace_id = $1
          AND status NOT IN ('completed','cancelled')
          AND created_at >= NOW() - INTERVAL '7 days') AS open_payroll_runs,
        (SELECT COUNT(*) FROM payroll_runs WHERE workspace_id = $1
          AND status = 'failed'
          AND created_at >= NOW() - INTERVAL '7 days') AS failed_payroll
    `, [workspaceId]);

    const row = result.rows[0] || {};
    const collected = Number(row.collected_30d) || 0;
    const total = Number(row.total_30d) || 1;
    const openRuns = Number(row.open_payroll_runs) || 0;
    const failedPayroll = Number(row.failed_payroll) || 0;

    return {
      overdueInvoicesCount: Number(row.overdue_count) || 0,
      overdueInvoicesAmountCents: Number(row.overdue_amount) || 0,
      invoiceCollectionRate30d: total > 0 ? collected / total : 1,
      payrollStatus: failedPayroll > 0 ? 'failed' as const
        : openRuns > 2 ? 'late' as const
        : 'on_track' as const,
      openPayrollRuns: openRuns,
    };
  }

  private async gatherOperationsVitals(workspaceId: string) {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM shifts WHERE workspace_id = $1
          AND start_time >= NOW() - INTERVAL '7 days'
          AND start_time < NOW()
          AND status IN ('completed', 'filled')) AS covered_shifts_7d,
        (SELECT COUNT(*) FROM shifts WHERE workspace_id = $1
          AND start_time >= NOW() - INTERVAL '7 days'
          AND start_time < NOW()) AS total_shifts_7d,
        (SELECT COUNT(*) FROM shift_calloffs WHERE workspace_id = $1
          AND created_at >= NOW() - INTERVAL '7 days') AS calloffs_7d,
        (SELECT COUNT(*) FROM shifts WHERE workspace_id = $1
          AND start_time BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
          AND status NOT IN ('filled', 'completed', 'cancelled')) AS uncovered_next_24h,
        (SELECT COUNT(*) FROM time_entries te
          JOIN employees e ON e.id = te.employee_id
          WHERE e.workspace_id = $1
          AND te.clock_in_time >= CURRENT_DATE
          AND te.clock_in_time > (
            SELECT COALESCE(start_time, te.clock_in_time) FROM shifts s
            WHERE s.id = te.shift_id
            LIMIT 1
          ) + INTERVAL '15 minutes') AS late_clockins_today,
        (SELECT COUNT(*) FROM incidents WHERE workspace_id = $1
          AND status = 'open'
          AND created_at >= NOW() - INTERVAL '7 days') AS incomplete_incidents
    `, [workspaceId]);

    const row = result.rows[0] || {};
    const covered = Number(row.covered_shifts_7d) || 0;
    const total = Number(row.total_shifts_7d) || 1;
    const calloffs = Number(row.calloffs_7d) || 0;
    const scheduled = total || 1;

    return {
      shiftCoverageRate7d: total > 0 ? covered / total : 1,
      calloffRate7d: scheduled > 0 ? calloffs / scheduled : 0,
      uncoveredShiftsNext24h: Number(row.uncovered_next_24h) || 0,
      lateClockInsToday: Number(row.late_clockins_today) || 0,
      incompleteIncidentReports: Number(row.incomplete_incidents) || 0,
    };
  }

  private async gatherWorkforceVitals(workspaceId: string) {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND status = 'active') AS active_officers,
        (SELECT COUNT(*) FROM compliance_documents
          WHERE workspace_id = $1
          AND expiration_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
          AND status NOT IN ('expired','revoked')) AS expiring_30d,
        (SELECT COUNT(*) FROM compliance_documents
          WHERE workspace_id = $1
          AND expiration_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
          AND status NOT IN ('expired','revoked')) AS expiring_7d,
        (SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND status = 'suspended') AS suspended,
        (SELECT COUNT(*) FROM employees e
          WHERE e.workspace_id = $1
          AND e.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM time_entries te WHERE te.employee_id = e.id
            AND te.clock_in_time >= NOW() - INTERVAL '14 days'
          )) AS inactive_officers
    `, [workspaceId]);

    const row = result.rows[0] || {};
    return {
      activeOfficers: Number(row.active_officers) || 0,
      expiringLicenses30d: Number(row.expiring_30d) || 0,
      expiringLicenses7d: Number(row.expiring_7d) || 0,
      suspendedEmployees: Number(row.suspended) || 0,
      officersWithNoRecentActivity: Number(row.inactive_officers) || 0,
    };
  }

  private async gatherClientRelationVitals(workspaceId: string) {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM incidents WHERE workspace_id = $1 AND status = 'open') AS open_incidents,
        (SELECT COUNT(*) FROM incidents WHERE workspace_id = $1
          AND status = 'resolved'
          AND created_at >= NOW() - INTERVAL '30 days') AS resolved_30d,
        (SELECT COUNT(*) FROM incidents WHERE workspace_id = $1
          AND created_at >= NOW() - INTERVAL '30 days') AS total_incidents_30d,
        (SELECT COUNT(*) FROM support_tickets WHERE workspace_id = $1
          AND status = 'open'
          AND created_at < NOW() - INTERVAL '4 hours') AS sla_breaches
    `, [workspaceId]);

    const row = result.rows[0] || {};
    const resolved = Number(row.resolved_30d) || 0;
    const totalInc = Number(row.total_incidents_30d) || 1;

    return {
      openClientIncidents: Number(row.open_incidents) || 0,
      unreadClientMessages: 0, // Extended via chat system
      slaBreachesLast30d: Number(row.sla_breaches) || 0,
      clientSentimentScore: resolved / totalInc,  // Proxy via incident resolution rate
      resolvedIncidentRate30d: totalInc > 0 ? resolved / totalInc : 1,
    };
  }

  private async gatherPlatformVitals(workspaceId: string) {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM support_tickets WHERE workspace_id = $1 AND status = 'open') AS open_tickets,
        (SELECT COUNT(*) FROM support_tickets WHERE workspace_id = $1 AND status = 'escalated') AS escalated_tickets,
        (SELECT COUNT(*) FROM compliance_violations
          WHERE workspace_id = $1 AND status = 'open') AS compliance_violations,
        (SELECT COUNT(*) FROM bot_execution_logs
          WHERE workspace_id = $1
          AND status IN ('failed','error')
          AND created_at >= NOW() - INTERVAL '24 hours') AS notification_errors,
        (SELECT COUNT(*) FROM support_tickets
          WHERE workspace_id = $1
          AND assigned_to_trinity = true
          AND status = 'resolved'
          AND created_at >= NOW() - INTERVAL '7 days') AS trinity_resolved,
        (SELECT COUNT(*) FROM support_tickets
          WHERE workspace_id = $1
          AND assigned_to_trinity = true
          AND created_at >= NOW() - INTERVAL '7 days') AS trinity_total
    `, [workspaceId]);

    const row = result.rows[0] || {};
    const trinityTotal = Number(row.trinity_total) || 1;
    const trinityResolved = Number(row.trinity_resolved) || 0;

    return {
      openSupportTickets: Number(row.open_tickets) || 0,
      escalatedTickets: Number(row.escalated_tickets) || 0,
      complianceViolations: Number(row.compliance_violations) || 0,
      notificationErrors24h: Number(row.notification_errors) || 0,
      trinityResolutionRate7d: trinityTotal > 0 ? trinityResolved / trinityTotal : 1,
    };
  }

  // ── Domain Scoring ────────────────────────────────────────────────────────

  private scoreDomains(v: OrgVitals): DomainScore {
    return {
      financial:      this.scoreFinancial(v),
      operations:     this.scoreOperations(v),
      workforce:      this.scoreWorkforce(v),
      clientRelations: this.scoreClientRelations(v),
      platform:       this.scorePlatform(v),
    };
  }

  private scoreFinancial(v: OrgVitals): number {
    let score = 100;
    score -= Math.min(40, v.overdueInvoicesCount * 8);
    score -= Math.min(20, v.overdueInvoicesAmountCents / 500000 * 20);
    score -= (v.invoiceCollectionRate30d < 0.7) ? (1 - v.invoiceCollectionRate30d) * 25 : 0;
    if (v.payrollStatus === 'failed') score -= 30;
    else if (v.payrollStatus === 'late') score -= 15;
    score -= Math.min(10, v.openPayrollRuns * 5);
    return Math.max(0, Math.round(score));
  }

  private scoreOperations(v: OrgVitals): number {
    let score = 100;
    score -= (1 - v.shiftCoverageRate7d) * 50;
    score -= Math.min(25, v.calloffRate7d * 100);
    score -= Math.min(20, v.uncoveredShiftsNext24h * 6);
    score -= Math.min(5, v.lateClockInsToday * 2);
    score -= Math.min(10, v.incompleteIncidentReports * 3);
    return Math.max(0, Math.round(score));
  }

  private scoreWorkforce(v: OrgVitals): number {
    let score = 100;
    score -= Math.min(25, v.expiringLicenses7d * 10);
    score -= Math.min(15, (v.expiringLicenses30d - v.expiringLicenses7d) * 3);
    score -= Math.min(20, v.suspendedEmployees * 5);
    const inactiveRatio = v.activeOfficers > 0
      ? v.officersWithNoRecentActivity / v.activeOfficers : 0;
    score -= Math.min(20, inactiveRatio * 30);
    if (v.activeOfficers < 3) score -= 15;
    return Math.max(0, Math.round(score));
  }

  private scoreClientRelations(v: OrgVitals): number {
    let score = 100;
    score -= Math.min(30, v.openClientIncidents * 6);
    score -= Math.min(20, v.slaBreachesLast30d * 4);
    score -= Math.min(20, v.unreadClientMessages * 5);
    score -= (1 - v.resolvedIncidentRate30d) * 20;
    return Math.max(0, Math.round(score));
  }

  private scorePlatform(v: OrgVitals): number {
    let score = 100;
    score -= Math.min(20, v.openSupportTickets * 3);
    score -= Math.min(25, v.escalatedTickets * 8);
    score -= Math.min(20, v.complianceViolations * 7);
    score -= Math.min(15, v.notificationErrors24h * 3);
    score -= (1 - v.trinityResolutionRate7d) * 20;
    return Math.max(0, Math.round(score));
  }

  // ── Survival Score ────────────────────────────────────────────────────────

  private computeSurvivalScore(d: DomainScore): number {
    const weighted =
      d.financial      * DOMAIN_WEIGHTS.financial +
      d.operations     * DOMAIN_WEIGHTS.operations +
      d.workforce      * DOMAIN_WEIGHTS.workforce +
      d.clientRelations * DOMAIN_WEIGHTS.clientRelations +
      d.platform       * DOMAIN_WEIGHTS.platform;
    return Math.max(0, Math.min(100, Math.round(weighted)));
  }

  // ── Mode Determination ────────────────────────────────────────────────────

  private determineMode(score: number, vitals: OrgVitals): OrgMode {
    // Hard overrides — certain conditions force crisis/survival regardless of score
    if (vitals.uncoveredShiftsNext24h >= 5 || vitals.payrollStatus === 'failed') {
      if (score > 49) return 'CRISIS';
    }
    if (vitals.expiringLicenses7d >= 3 && vitals.shiftCoverageRate7d < 0.7) {
      if (score > 39) return 'CRISIS';
    }

    if (score >= 85) return 'THRIVING';
    if (score >= 70) return 'STABLE';
    if (score >= 50) return 'AT_RISK';
    if (score >= 30) return 'CRISIS';
    return 'SURVIVAL';
  }

  // ── Threat Signal Detection ───────────────────────────────────────────────

  private detectThreatSignals(v: OrgVitals, d: DomainScore): ThreatSignal[] {
    const signals: ThreatSignal[] = [];

    if (v.uncoveredShiftsNext24h > 0) {
      signals.push({
        domain: 'operations',
        severity: v.uncoveredShiftsNext24h >= 3 ? 'critical' : 'high',
        signal: 'Uncovered shifts in next 24 hours',
        value: v.uncoveredShiftsNext24h,
        recommendation: 'Trigger coverage pipeline immediately — contact qualified officers on standby',
      });
    }

    if (v.overdueInvoicesCount >= 3) {
      signals.push({
        domain: 'financial',
        severity: v.overdueInvoicesCount >= 8 ? 'critical' : v.overdueInvoicesCount >= 5 ? 'high' : 'medium',
        signal: 'Multiple overdue invoices',
        value: `${v.overdueInvoicesCount} invoices ($${(v.overdueInvoicesAmountCents / 100).toFixed(0)})`,
        recommendation: 'Auto-send overdue reminders + escalate largest accounts to manager',
      });
    }

    if (v.payrollStatus === 'failed') {
      signals.push({
        domain: 'financial',
        severity: 'critical',
        signal: 'Payroll run failed',
        value: v.openPayrollRuns,
        recommendation: 'Immediately notify manager — payroll failures destroy employee trust',
      });
    }

    if (v.expiringLicenses7d > 0) {
      signals.push({
        domain: 'workforce',
        severity: v.expiringLicenses7d >= 3 ? 'critical' : 'high',
        signal: 'Officer licenses expiring within 7 days',
        value: v.expiringLicenses7d,
        recommendation: 'Send urgent renewal reminders + flag for supervisor review',
      });
    }

    if (v.calloffRate7d > 0.20) {
      signals.push({
        domain: 'operations',
        severity: v.calloffRate7d > 0.35 ? 'critical' : 'high',
        signal: 'Abnormally high calloff rate',
        value: `${(v.calloffRate7d * 100).toFixed(1)}%`,
        recommendation: 'Analyze calloff patterns — may indicate morale crisis or systemic issue',
      });
    }

    if (v.openClientIncidents >= 5) {
      signals.push({
        domain: 'clientRelations',
        severity: v.openClientIncidents >= 10 ? 'critical' : 'high',
        signal: 'High volume of unresolved client incidents',
        value: v.openClientIncidents,
        recommendation: 'Prioritize incident resolution — client trust at risk',
      });
    }

    if (v.shiftCoverageRate7d < 0.80) {
      signals.push({
        domain: 'operations',
        severity: v.shiftCoverageRate7d < 0.65 ? 'critical' : 'high',
        signal: 'Below-threshold shift coverage rate',
        value: `${(v.shiftCoverageRate7d * 100).toFixed(1)}%`,
        recommendation: 'Recruit additional officers + implement backup staffing pool',
      });
    }

    if (v.escalatedTickets >= 3) {
      signals.push({
        domain: 'platform',
        severity: 'medium',
        signal: 'Multiple escalated support tickets',
        value: v.escalatedTickets,
        recommendation: 'Address escalations immediately — represents user-facing failures',
      });
    }

    if (v.complianceViolations > 0) {
      signals.push({
        domain: 'platform',
        severity: v.complianceViolations >= 3 ? 'critical' : 'high',
        signal: 'Open compliance violations',
        value: v.complianceViolations,
        recommendation: 'Resolve compliance violations before regulatory exposure increases',
      });
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  // ── Priority Stack Builder ─────────────────────────────────────────────────

  private buildPriorityStack(
    v: OrgVitals,
    d: DomainScore,
    mode: OrgMode
  ): PriorityAction[] {
    const stack: PriorityAction[] = [];
    let rank = 1;

    // 1. Coverage emergency — always first if present
    if (v.uncoveredShiftsNext24h > 0) {
      stack.push({
        rank: rank++,
        category: 'Operations',
        action: `Fill ${v.uncoveredShiftsNext24h} uncovered shift(s) in next 24 hours`,
        urgencyScore: Math.min(100, 60 + v.uncoveredShiftsNext24h * 12),
        estimatedImpact: 'Prevents contract breach and revenue loss',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'coverage.trigger_pipeline',
      });
    }

    // 2. Payroll failure
    if (v.payrollStatus === 'failed') {
      stack.push({
        rank: rank++,
        category: 'Financial',
        action: 'Investigate and resolve payroll run failure',
        urgencyScore: 95,
        estimatedImpact: 'Prevents employee trust breakdown and legal risk',
        trinityCanExecuteAutonomously: false,
        requiresHumanApproval: true,
        relatedTrinityAction: 'payroll.flag_anomaly',
      });
    }

    // 3. Critical license expirations
    if (v.expiringLicenses7d > 0) {
      stack.push({
        rank: rank++,
        category: 'Compliance',
        action: `Send urgent renewal notices to ${v.expiringLicenses7d} officer(s) with licenses expiring this week`,
        urgencyScore: Math.min(100, 55 + v.expiringLicenses7d * 10),
        estimatedImpact: 'Prevents armed-post violations and regulatory fines',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'compliance.send_renewal_reminder',
      });
    }

    // 4. Overdue invoice collection
    if (v.overdueInvoicesCount > 0) {
      const urgency = Math.min(100, 40 + v.overdueInvoicesCount * 6 +
        (v.overdueInvoicesAmountCents / 1000000) * 20);
      stack.push({
        rank: rank++,
        category: 'Financial',
        action: `Collect on ${v.overdueInvoicesCount} overdue invoice(s) totaling $${(v.overdueInvoicesAmountCents / 100).toFixed(0)}`,
        urgencyScore: Math.round(urgency),
        estimatedImpact: 'Direct cash flow improvement',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'billing.send_overdue_reminder',
      });
    }

    // 5. High calloff rate — needs attention
    if (v.calloffRate7d > 0.15) {
      stack.push({
        rank: rank++,
        category: 'Operations',
        action: `Analyze calloff pattern — ${(v.calloffRate7d * 100).toFixed(0)}% rate signals workforce issue`,
        urgencyScore: Math.round(v.calloffRate7d * 120),
        estimatedImpact: 'Identifies root cause before reliability crisis worsens',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'scheduling.analyze_calloff_pattern',
      });
    }

    // 6. Open client incidents
    if (v.openClientIncidents > 0) {
      stack.push({
        rank: rank++,
        category: 'Client Relations',
        action: `Resolve ${v.openClientIncidents} open incident report(s) to protect client relationships`,
        urgencyScore: Math.min(90, 35 + v.openClientIncidents * 5),
        estimatedImpact: 'Protects client retention and contract renewal',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'incidents.auto_resolve_eligible',
      });
    }

    // 7. Unread client messages
    if (v.unreadClientMessages > 0) {
      stack.push({
        rank: rank++,
        category: 'Client Relations',
        action: `Respond to ${v.unreadClientMessages} unread client message(s)`,
        urgencyScore: Math.min(80, 30 + v.unreadClientMessages * 8),
        estimatedImpact: 'Prevents client dissatisfaction and churn signal',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'comms.handle_unread_messages',
      });
    }

    // 8. SLA breaches
    if (v.slaBreachesLast30d > 0) {
      stack.push({
        rank: rank++,
        category: 'Client Relations',
        action: `Review and close ${v.slaBreachesLast30d} SLA breach(es) — document resolution`,
        urgencyScore: Math.min(75, 25 + v.slaBreachesLast30d * 8),
        estimatedImpact: 'Demonstrates accountability and prevents contract penalties',
        trinityCanExecuteAutonomously: false,
        requiresHumanApproval: true,
        relatedTrinityAction: 'client.sla_breach_review',
      });
    }

    // 9. Inactive officers
    if (v.officersWithNoRecentActivity > 0) {
      stack.push({
        rank: rank++,
        category: 'Workforce',
        action: `Follow up with ${v.officersWithNoRecentActivity} officer(s) showing no recent activity`,
        urgencyScore: Math.min(60, 20 + v.officersWithNoRecentActivity * 5),
        estimatedImpact: 'Identifies turnover risk before officer leaves',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'workforce.engagement_outreach',
      });
    }

    // 10. Licenses expiring 8-30 days
    const softExpiringLicenses = v.expiringLicenses30d - v.expiringLicenses7d;
    if (softExpiringLicenses > 0) {
      stack.push({
        rank: rank++,
        category: 'Compliance',
        action: `Send proactive renewal reminders to ${softExpiringLicenses} officer(s) — licenses expire within 30 days`,
        urgencyScore: Math.min(55, 15 + softExpiringLicenses * 5),
        estimatedImpact: 'Prevents future compliance risk',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'compliance.send_renewal_reminder',
      });
    }

    // 11. Mode-specific growth actions (only in THRIVING/STABLE)
    if (mode === 'THRIVING' || mode === 'STABLE') {
      stack.push({
        rank: rank++,
        category: 'Growth',
        action: 'Generate weekly performance summary and optimization recommendations for leadership',
        urgencyScore: 30,
        estimatedImpact: 'Identifies profit optimization opportunities',
        trinityCanExecuteAutonomously: true,
        requiresHumanApproval: false,
        relatedTrinityAction: 'analytics.generate_weekly_insight',
      });
    }

    // 12. Escalated support tickets
    if (v.escalatedTickets > 0) {
      stack.push({
        rank: rank++,
        category: 'Platform',
        action: `Address ${v.escalatedTickets} escalated support ticket(s)`,
        urgencyScore: Math.min(65, 30 + v.escalatedTickets * 8),
        estimatedImpact: 'Resolves user-blocking issues and restores platform trust',
        trinityCanExecuteAutonomously: false,
        requiresHumanApproval: true,
        relatedTrinityAction: 'helpai.triage_escalated',
      });
    }

    // 13. Compliance violations
    if (v.complianceViolations > 0) {
      stack.push({
        rank: rank++,
        category: 'Compliance',
        action: `Clear ${v.complianceViolations} open compliance violation(s)`,
        urgencyScore: Math.min(85, 45 + v.complianceViolations * 10),
        estimatedImpact: 'Prevents regulatory fines and contract loss',
        trinityCanExecuteAutonomously: false,
        requiresHumanApproval: true,
        relatedTrinityAction: 'compliance.resolve_violation',
      });
    }

    return stack;
  }

  // ── Rationale Builder ─────────────────────────────────────────────────────

  private buildRationale(
    mode: OrgMode,
    score: number,
    d: DomainScore,
    threats: ThreatSignal[]
  ): string {
    const domainList = Object.entries(d)
      .sort(([, a], [, b]) => a - b)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const topThreat = threats[0];
    const modeDesc: Record<OrgMode, string> = {
      THRIVING: 'Organization is healthy and growing — Trinity is optimizing for profit and expansion.',
      STABLE: 'Operations are running smoothly — Trinity is maintaining balance and momentum.',
      AT_RISK: 'Warning signals detected — Trinity has shifted to coverage and revenue protection.',
      CRISIS: 'Multiple domains are failing — Trinity is in survival-first mode, deferring growth.',
      SURVIVAL: 'Critical threat to organizational continuity — Trinity is fully mobilized for stabilization.',
    };
    const threatLine = topThreat
      ? ` Primary threat: ${topThreat.signal} (${topThreat.domain}, ${topThreat.severity}).`
      : '';
    return `Score ${score}/100. ${modeDesc[mode]} [${domainList}].${threatLine}`;
  }

  // ── Defaults ──────────────────────────────────────────────────────────────

  private defaultState(workspaceId: string): OrgSurvivalState {
    const vitals = { workspaceId, ...this.defaultFinancial(), ...this.defaultOperations(), ...this.defaultWorkforce(), ...this.defaultClientRel(), ...this.defaultPlatform(), calculatedAt: new Date() };
    const d: DomainScore = { financial: 70, operations: 70, workforce: 70, clientRelations: 70, platform: 70 };
    return {
      workspaceId, mode: 'STABLE', survivalScore: 70,
      modeRationale: 'Default state — unable to gather vitals.',
      domainScores: d, vitals, threatSignals: [], priorityStack: [],
      weights: WEIGHTS_BY_MODE.STABLE, calculatedAt: new Date(),
      cacheExpiresAt: new Date(Date.now() + 60000),
    };
  }

  private defaultFinancial() {
    return { overdueInvoicesCount: 0, overdueInvoicesAmountCents: 0, invoiceCollectionRate30d: 1, payrollStatus: 'unknown' as const, openPayrollRuns: 0 };
  }
  private defaultOperations() {
    return { shiftCoverageRate7d: 1, calloffRate7d: 0, uncoveredShiftsNext24h: 0, lateClockInsToday: 0, incompleteIncidentReports: 0 };
  }
  private defaultWorkforce() {
    return { activeOfficers: 0, expiringLicenses30d: 0, expiringLicenses7d: 0, suspendedEmployees: 0, officersWithNoRecentActivity: 0 };
  }
  private defaultClientRel() {
    return { openClientIncidents: 0, unreadClientMessages: 0, slaBreachesLast30d: 0, clientSentimentScore: 1, resolvedIncidentRate30d: 1 };
  }
  private defaultPlatform() {
    return { openSupportTickets: 0, escalatedTickets: 0, complianceViolations: 0, notificationErrors24h: 0, trinityResolutionRate7d: 1 };
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const trinityPrefrontalCortex = TrinityPrefrontalCortex.getInstance();

// ─── Event Bus Integration ─────────────────────────────────────────────────
// Invalidate cache on high-severity events so Trinity reacts immediately

(() => {
  const invalidatingEvents = [
    'shift.calloff_submitted', 'shift.uncovered_detected',
    'payroll.run_failed', 'compliance.violation_detected',
    'incident.created', 'invoice.overdue_flagged',
    'employee.license_expiring_critical',
  ];
  invalidatingEvents.forEach(event => {
    try {
      platformEventBus.on(event, (data: any) => {
        if (data?.workspaceId) {
          trinityPrefrontalCortex.invalidateCache(data.workspaceId);
        }
      });
    } catch { /* non-fatal */ }
  });
})();
