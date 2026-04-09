/**
 * Trinity Calloff Risk Predictor
 * ================================
 * Spec alignment: Phase 2-F (Predictive Brain — Calloff prediction)
 *
 * Predicts which officers are likely to call off their upcoming shifts
 * using existing reliability score data, historical patterns, and behavioral signals.
 *
 * No AI model call — uses deterministic scoring on existing DB data.
 * Surfaces predictions 48-72h in advance via morning brief + Trinity actions.
 *
 * Data sources (already exist in DB):
 * - employee_profiles.reliability_score
 * - employee_profiles.calloff_count / total_shifts
 * - shifts (past 30 days) for pattern analysis
 * - ai_learning_events (behavioral signals)
 */

import { pool } from '../../db';
import { typedPool } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityCalloffPredictor');

export interface CalloffRisk {
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftStart: Date;
  shiftEnd: Date;
  siteOrClient: string;
  riskScore: number;      // 0.0 – 1.0
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  recommendedAction: string;
}

export interface SiteRiskScore {
  clientId: string;
  clientName: string;
  siteRiskScore: number;  // 0.0 – 1.0
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  openIncidents30d: number;
  avgOfficerReliability: number;
  coverageGaps7d: number;
}

export interface PredictionSummary {
  workspaceId: string;
  generatedAt: Date;
  horizonHours: number;
  calloffRisks: CalloffRisk[];
  siteRisks: SiteRiskScore[];
  highRiskCount: number;
  criticalRiskCount: number;
  recommendedActions: string[];
}

class TrinityCalloffPredictor {

  /**
   * Run calloff prediction for a workspace across the next N hours.
   * @param workspaceId
   * @param horizonHours - Prediction horizon (default 72h)
   */
  async predictCalloffRisks(workspaceId: string, horizonHours = 72): Promise<PredictionSummary> {
    const generatedAt = new Date();

    const [calloffRisks, siteRisks] = await Promise.all([
      this.computeCalloffRisks(workspaceId, horizonHours),
      this.computeSiteRisks(workspaceId),
    ]);

    const highRiskCount = calloffRisks.filter(r => r.riskLevel === 'high').length;
    const criticalRiskCount = calloffRisks.filter(r => r.riskLevel === 'critical').length;

    const recommendedActions: string[] = [];
    if (criticalRiskCount > 0) {
      recommendedActions.push(`CRITICAL: ${criticalRiskCount} officer(s) have >80% calloff risk — contact them NOW and find backups.`);
    }
    if (highRiskCount > 0) {
      recommendedActions.push(`HIGH: ${highRiskCount} officer(s) at elevated calloff risk — confirm attendance 24h before shift.`);
    }
    if (siteRisks.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length > 0) {
      const highSites = siteRisks.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').map(s => s.clientName);
      recommendedActions.push(`Site risk alert: ${highSites.join(', ')} — review coverage and incident history before next shift.`);
    }

    return {
      workspaceId,
      generatedAt,
      horizonHours,
      calloffRisks,
      siteRisks,
      highRiskCount,
      criticalRiskCount,
      recommendedActions,
    };
  }

  /**
   * Compute per-officer calloff risk for upcoming shifts.
   */
  private async computeCalloffRisks(workspaceId: string, horizonHours: number): Promise<CalloffRisk[]> {
    try {
      // CATEGORY C — Raw SQL retained: COALESCE(ep.calloff_count::int, 0) as calloff_count | Tables: s, shifts, employees, employee_profiles, clients | Verified: 2026-03-23
      const result = await typedPool(`
        SELECT
          s.id as shift_id,
          s.start_time,
          s.end_time,
          s.employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          COALESCE(c.company_name, c.first_name || ' ' || c.last_name, 'Unknown Site') as site_name,
          COALESCE(ep.reliability_score::float, 0.85) as reliability_score,
          COALESCE(ep.calloff_count::int, 0) as calloff_count,
          COALESCE(ep.total_shifts::int, 0) as total_shifts,
          EXTRACT(DOW FROM s.start_time) as day_of_week,
          EXTRACT(HOUR FROM s.start_time) as shift_hour
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
        LEFT JOIN clients c ON c.id = s.client_id
        WHERE s.workspace_id = $1
          AND s.employee_id IS NOT NULL
          AND s.start_time >= NOW()
          AND s.start_time <= NOW() + ($2 || ' hours')::interval
          AND s.status NOT IN ('cancelled', 'completed')
        ORDER BY s.start_time ASC
        LIMIT 100
      `, [workspaceId, horizonHours]);

      return (result as unknown as any[]).map(row => this.scoreCalloffRisk(row));
    } catch (err: any) {
      log.error(`[CalloffPredictor] Failed to compute calloff risks: ${(err instanceof Error ? err.message : String(err))}`);
      return [];
    }
  }

  /**
   * Score a single officer-shift combination for calloff risk.
   */
  private scoreCalloffRisk(row: any): CalloffRisk {
    const factors: string[] = [];
    let riskScore = 0.10; // baseline

    // Reliability score contribution (most impactful)
    const reliability = parseFloat(row.reliability_score) || 0.85;
    if (reliability < 0.60) {
      riskScore += 0.40;
      factors.push(`Very low reliability: ${(reliability * 100).toFixed(0)}%`);
    } else if (reliability < 0.75) {
      riskScore += 0.25;
      factors.push(`Low reliability: ${(reliability * 100).toFixed(0)}%`);
    } else if (reliability < 0.85) {
      riskScore += 0.10;
      factors.push(`Below-average reliability: ${(reliability * 100).toFixed(0)}%`);
    }

    // Historical calloff rate contribution
    const totalShifts = parseInt(row.total_shifts) || 0;
    const calloffs = parseInt(row.calloff_count) || 0;
    if (totalShifts > 5) {
      const calloffRate = calloffs / totalShifts;
      if (calloffRate >= 0.20) {
        riskScore += 0.30;
        factors.push(`High calloff rate: ${(calloffRate * 100).toFixed(0)}% of shifts`);
      } else if (calloffRate >= 0.10) {
        riskScore += 0.15;
        factors.push(`Elevated calloff rate: ${(calloffRate * 100).toFixed(0)}% of shifts`);
      }
    } else if (calloffs >= 2) {
      riskScore += 0.20;
      factors.push(`${calloffs} calloff(s) in limited shift history`);
    }

    // Day-of-week pattern (Monday and Friday are higher calloff days)
    const dow = parseInt(row.day_of_week);
    if (dow === 1) { // Monday
      riskScore += 0.08;
      factors.push('Monday shift (historically higher calloff day)');
    } else if (dow === 5) { // Friday
      riskScore += 0.06;
      factors.push('Friday shift (historically higher calloff day)');
    }

    // Early morning shifts (higher calloff risk)
    const shiftHour = parseInt(row.shift_hour);
    if (shiftHour >= 0 && shiftHour <= 5) {
      riskScore += 0.08;
      factors.push('Early morning start (2am–5am higher risk)');
    }

    // Cap at 0.95
    riskScore = Math.min(0.95, riskScore);

    const riskLevel: 'low' | 'medium' | 'high' | 'critical' =
      riskScore >= 0.80 ? 'critical' :
      riskScore >= 0.60 ? 'high' :
      riskScore >= 0.35 ? 'medium' : 'low';

    const recommendedAction =
      riskLevel === 'critical' ? 'Contact officer immediately and identify backup officer' :
      riskLevel === 'high' ? 'Confirm attendance 24h before shift and have a standby officer ready' :
      riskLevel === 'medium' ? 'Send confirmation message 24h before shift' :
      'No action required — officer is reliable';

    return {
      employeeId: row.employee_id,
      employeeName: row.employee_name || 'Unknown',
      shiftId: row.shift_id,
      shiftStart: new Date(row.start_time),
      shiftEnd: new Date(row.end_time),
      siteOrClient: row.site_name,
      riskScore,
      riskLevel,
      riskFactors: factors,
      recommendedAction,
    };
  }

  /**
   * Compute composite site risk scores using incident history, officer reliability, coverage gaps.
   */
  private async computeSiteRisks(workspaceId: string): Promise<SiteRiskScore[]> {
    try {
      // CATEGORY C — Raw SQL retained: GROUP BY | Tables: clients, incident_reports, shifts, employee_profiles | Verified: 2026-03-23
      const result = await typedPool(`
        SELECT
          c.id as client_id,
          COALESCE(c.company_name, c.first_name || ' ' || c.last_name, 'Unknown') as client_name,
          COUNT(DISTINCT ir.id) FILTER (WHERE COALESCE(ir.occurred_at, ir.updated_at) >= NOW() - INTERVAL '30 days') as open_incidents_30d,
          AVG(ep.reliability_score::float) as avg_reliability,
          COUNT(DISTINCT s.id) FILTER (WHERE s.start_time >= NOW() - INTERVAL '7 days' AND s.status = 'open') as coverage_gaps_7d
        FROM clients c
        LEFT JOIN incident_reports ir ON ir.client_id = c.id AND ir.workspace_id = c.workspace_id
        LEFT JOIN shifts s ON s.client_id = c.id AND s.workspace_id = c.workspace_id
        LEFT JOIN employee_profiles ep ON ep.employee_id = s.employee_id
        WHERE c.workspace_id = $1
          AND c.is_active = true
        GROUP BY c.id, c.company_name, c.first_name, c.last_name
        HAVING COUNT(DISTINCT s.id) > 0
        LIMIT 20
      `, [workspaceId]);

      return (result as unknown as any[]).map(row => this.scoreSiteRisk(row));
    } catch (err: any) {
      log.error(`[CalloffPredictor] Failed to compute site risks: ${(err instanceof Error ? err.message : String(err))}`);
      return [];
    }
  }

  /**
   * Score a single site for overall operational risk.
   */
  private scoreSiteRisk(row: any): SiteRiskScore {
    const factors: string[] = [];
    let riskScore = 0.10;

    const incidents30d = parseInt(row.open_incidents_30d) || 0;
    const avgReliability = parseFloat(row.avg_reliability) || 0.85;
    const coverageGaps7d = parseInt(row.coverage_gaps_7d) || 0;

    if (incidents30d >= 5) {
      riskScore += 0.40;
      factors.push(`${incidents30d} incidents in past 30 days — high activity site`);
    } else if (incidents30d >= 2) {
      riskScore += 0.20;
      factors.push(`${incidents30d} incidents in past 30 days`);
    }

    if (avgReliability < 0.70) {
      riskScore += 0.30;
      factors.push(`Low average officer reliability at this site: ${(avgReliability * 100).toFixed(0)}%`);
    } else if (avgReliability < 0.80) {
      riskScore += 0.15;
      factors.push(`Below-average officer reliability: ${(avgReliability * 100).toFixed(0)}%`);
    }

    if (coverageGaps7d >= 3) {
      riskScore += 0.25;
      factors.push(`${coverageGaps7d} coverage gaps in past 7 days`);
    } else if (coverageGaps7d >= 1) {
      riskScore += 0.10;
      factors.push(`${coverageGaps7d} coverage gap(s) in past 7 days`);
    }

    riskScore = Math.min(0.95, riskScore);
    const riskLevel: 'low' | 'medium' | 'high' | 'critical' =
      riskScore >= 0.80 ? 'critical' :
      riskScore >= 0.55 ? 'high' :
      riskScore >= 0.30 ? 'medium' : 'low';

    return {
      clientId: row.client_id,
      clientName: row.client_name || 'Unknown',
      siteRiskScore: riskScore,
      riskLevel,
      factors,
      openIncidents30d: incidents30d,
      avgOfficerReliability: avgReliability,
      coverageGaps7d,
    };
  }

  /**
   * Get calloff risk for a single officer's upcoming shift (quick lookup).
   */
  async getOfficerCalloffRisk(employeeId: string, workspaceId: string): Promise<{
    riskScore: number;
    riskLevel: string;
    factors: string[];
  } | null> {
    try {
      // CATEGORY C — Raw SQL retained: LIMIT | Tables: employee_profiles | Verified: 2026-03-23
      const result = await typedPool(`
        SELECT
          ep.reliability_score::float as reliability_score,
          ep.calloff_count::int as calloff_count,
          ep.total_shifts::int as total_shifts
        FROM employee_profiles ep
        WHERE ep.employee_id = $1
        LIMIT 1
      `, [employeeId]);

      if (!(result as unknown as any[]).length) return null;

      const row = { ...(result as unknown as any[])[0], day_of_week: new Date().getDay(), shift_hour: 8 };
      const scored = this.scoreCalloffRisk(row);
      return {
        riskScore: scored.riskScore,
        riskLevel: scored.riskLevel,
        factors: scored.riskFactors,
      };
    } catch {
      return null;
    }
  }
}

export const trinityCalloffPredictor = new TrinityCalloffPredictor();
