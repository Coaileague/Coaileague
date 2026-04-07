import { db } from '../../db';
import { trinityAnomalyLog, workspaces, employees, shifts, timeEntries, notifications, idempotencyKeys } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, count, lt, isNotNull, isNull } from 'drizzle-orm';
import { TrinityCrossDomainIntelligence, CrossDomainInsight } from './trinityCrossDomainIntelligence';
import { generatePlatformUpdate } from '../aiNotificationService';
import { broadcastToWorkspace } from '../../websocket';
import { platformEventBus } from '../platformEventBus';
import { randomUUID } from 'crypto';
import { coveragePipeline } from '../automation/coveragePipeline';
import { createLogger } from "../../lib/logger";
const log = createLogger("TrinityAnomalyDetector");


const COVERAGE_DEBOUNCE_MS = 2 * 60 * 60 * 1000;

const crossDomainIntelligence = new TrinityCrossDomainIntelligence();

const SCAN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const ANOMALY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

interface AnomalyDetectionResult {
  workspaceId: string;
  anomalies: DetectedAnomaly[];
  scannedAt: Date;
}

interface DetectedAnomaly {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  confidence: number;
  dataSnapshot: Record<string, any>;
  reasoningChain: string[];
  recommendedActions: string[];
}

interface SensitivityConfig {
  overtimeThresholdHours: number;
  attendanceDropPercent: number;
  profitabilityMarginPercent: number;
  complianceDaysWarning: number;
  coverageGapMinHours: number;
  clockInVarianceMinutes: number;
}

const DEFAULT_SENSITIVITY: SensitivityConfig = {
  overtimeThresholdHours: 45,
  attendanceDropPercent: 15,
  profitabilityMarginPercent: 10,
  complianceDaysWarning: 30,
  coverageGapMinHours: 4,
  clockInVarianceMinutes: 30,
};

const workspaceSensitivity = new Map<string, SensitivityConfig>();

function getSensitivity(workspaceId: string): SensitivityConfig {
  return workspaceSensitivity.get(workspaceId) || { ...DEFAULT_SENSITIVITY };
}

export class TrinityAnomalyDetector {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastScanResults = new Map<string, AnomalyDetectionResult>();

  start(): void {
    if (this.intervalHandle) {
      log.info('[AnomalyDetector] Already running, skipping start');
      return;
    }

    log.info('[AnomalyDetector] Starting daemon (interval: 2 hours)');

    setTimeout(() => this.runScan(), 30000);

    this.intervalHandle = setInterval(() => this.runScan(), SCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      log.info('[AnomalyDetector] Daemon stopped');
    }
  }

  async runScan(): Promise<AnomalyDetectionResult[]> {
    if (this.isRunning) {
      log.info('[AnomalyDetector] Scan already in progress, skipping');
      return [];
    }

    this.isRunning = true;
    const results: AnomalyDetectionResult[] = [];

    try {
      log.info('[AnomalyDetector] Starting anomaly scan...');

      const activeWorkspaces = await db.select({
        id: workspaces.id,
      }).from(workspaces)
        .where(eq(workspaces.subscriptionStatus, 'active'))
        .limit(500);

      log.info(`[AnomalyDetector] Scanning ${activeWorkspaces.length} active workspaces`);

      for (const workspace of activeWorkspaces) {
        try {
          const result = await this.scanWorkspace(workspace.id);
          if (result.anomalies.length > 0) {
            results.push(result);
            await this.processDetectedAnomalies(result);
          }
          this.lastScanResults.set(workspace.id, result);
        } catch (error) {
          log.error(`[AnomalyDetector] Error scanning workspace ${workspace.id}:`, error);
        }
      }

      log.info(`[AnomalyDetector] Scan complete. Found anomalies in ${results.length}/${activeWorkspaces.length} workspaces`);
    } catch (error) {
      log.error('[AnomalyDetector] Scan failed:', error);
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  async scanWorkspace(workspaceId: string): Promise<AnomalyDetectionResult> {
    const anomalies: DetectedAnomaly[] = [];

    const [overtime, attendance, coverage, clockIn] = await Promise.all([
      this.detectOvertimeSpikes(workspaceId),
      this.detectAttendanceDeterioration(workspaceId),
      this.detectCoverageHoles(workspaceId),
      this.detectUnusualClockInPatterns(workspaceId),
    ]);

    anomalies.push(...overtime, ...attendance, ...coverage, ...clockIn);

    const [profitability, compliance] = await Promise.all([
      this.detectProfitabilityDecline(workspaceId),
      this.detectComplianceGaps(workspaceId),
    ]);

    anomalies.push(...profitability, ...compliance);

    return {
      workspaceId,
      anomalies,
      scannedAt: new Date(),
    };
  }

  async runOnDemand(workspaceId: string): Promise<AnomalyDetectionResult> {
    log.info(`[AnomalyDetector] On-demand scan requested for workspace ${workspaceId}`);
    const result = await this.scanWorkspace(workspaceId);
    if (result.anomalies.length > 0) {
      await this.processDetectedAnomalies(result);
    }
    return result;
  }

  private async detectOvertimeSpikes(workspaceId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];
    const sensitivity = getSensitivity(workspaceId);

    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const weeklyHours = await db.select({
        employeeId: timeEntries.employeeId,
        totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
      }).from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, oneWeekAgo),
          isNotNull(timeEntries.clockOut)
        ))
        .groupBy(timeEntries.employeeId);

      const overtimeEmployees = weeklyHours.filter(e => Number(e.totalHours) > sensitivity.overtimeThresholdHours);

      if (overtimeEmployees.length > 0) {
        const avgOvertime = overtimeEmployees.reduce((sum, e) => sum + Number(e.totalHours), 0) / overtimeEmployees.length;
        const confidence = overtimeEmployees.length >= 3 ? 0.9 : overtimeEmployees.length >= 1 ? 0.75 : 0.5;

        anomalies.push({
          type: 'overtime_spike',
          severity: overtimeEmployees.length >= 5 ? 'critical' : 'warning',
          title: `Overtime Spike: ${overtimeEmployees.length} employees over ${sensitivity.overtimeThresholdHours}hrs`,
          description: `${overtimeEmployees.length} employees logged more than ${sensitivity.overtimeThresholdHours} hours this week. Average overtime hours: ${avgOvertime.toFixed(1)}. This may indicate understaffing or scheduling inefficiencies.`,
          confidence,
          dataSnapshot: {
            overtimeCount: overtimeEmployees.length,
            averageHours: avgOvertime,
            threshold: sensitivity.overtimeThresholdHours,
            employeeIds: overtimeEmployees.slice(0, 10).map(e => e.employeeId),
          },
          reasoningChain: [
            `Scanned weekly time entries for workspace`,
            `Found ${overtimeEmployees.length} employees exceeding ${sensitivity.overtimeThresholdHours}-hour threshold`,
            `Average hours among overtime employees: ${avgOvertime.toFixed(1)}`,
            overtimeEmployees.length >= 5
              ? 'Critical: Widespread overtime suggests systemic understaffing'
              : 'Warning: Overtime trend detected, monitor for escalation',
          ],
          recommendedActions: [
            'Review shift scheduling to distribute workload more evenly',
            'Consider hiring additional staff for high-demand periods',
            'Analyze if overtime is concentrated at specific client sites',
          ],
        });
      }
    } catch (error) {
      log.error('[AnomalyDetector] Overtime detection error:', error);
    }

    return anomalies;
  }

  private async detectAttendanceDeterioration(workspaceId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];
    const sensitivity = getSensitivity(workspaceId);

    try {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const recentShifts = await db.select({
        total: count(),
        withClockIn: sql<number>`COUNT(CASE WHEN ${timeEntries.clockIn} IS NOT NULL THEN 1 END)`,
      }).from(shifts)
        .leftJoin(timeEntries, eq(shifts.id, timeEntries.shiftId))
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, twoWeeksAgo),
          isNotNull(shifts.employeeId)
        ));

      const priorShifts = await db.select({
        total: count(),
        withClockIn: sql<number>`COUNT(CASE WHEN ${timeEntries.clockIn} IS NOT NULL THEN 1 END)`,
      }).from(shifts)
        .leftJoin(timeEntries, eq(shifts.id, timeEntries.shiftId))
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, fourWeeksAgo),
          lt(shifts.startTime, twoWeeksAgo),
          isNotNull(shifts.employeeId)
        ));

      const recentTotal = Number(recentShifts[0]?.total || 0);
      const recentAttended = Number(recentShifts[0]?.withClockIn || 0);
      const priorTotal = Number(priorShifts[0]?.total || 0);
      const priorAttended = Number(priorShifts[0]?.withClockIn || 0);

      if (recentTotal > 0 && priorTotal > 0) {
        const recentRate = (recentAttended / recentTotal) * 100;
        const priorRate = (priorAttended / priorTotal) * 100;
        const dropPercent = priorRate - recentRate;

        if (dropPercent > sensitivity.attendanceDropPercent) {
          const confidence = recentTotal >= 20 ? 0.85 : recentTotal >= 10 ? 0.7 : 0.5;

          anomalies.push({
            type: 'attendance_deterioration',
            severity: dropPercent > 25 ? 'critical' : 'warning',
            title: `Attendance Drop: ${dropPercent.toFixed(1)}% decrease`,
            description: `Attendance rate dropped from ${priorRate.toFixed(1)}% to ${recentRate.toFixed(1)}% compared to the prior 2-week period. This ${dropPercent.toFixed(1)}% decline may indicate morale issues, scheduling conflicts, or external factors.`,
            confidence,
            dataSnapshot: {
              recentRate,
              priorRate,
              dropPercent,
              recentTotal,
              recentAttended,
              priorTotal,
              priorAttended,
            },
            reasoningChain: [
              `Compared attendance rates: recent 2 weeks vs prior 2 weeks`,
              `Recent: ${recentAttended}/${recentTotal} shifts attended (${recentRate.toFixed(1)}%)`,
              `Prior: ${priorAttended}/${priorTotal} shifts attended (${priorRate.toFixed(1)}%)`,
              `Decline of ${dropPercent.toFixed(1)}% exceeds ${sensitivity.attendanceDropPercent}% threshold`,
            ],
            recommendedActions: [
              'Review recent schedule changes that may have caused conflicts',
              'Check for patterns in specific employee absences',
              'Consider conducting employee satisfaction surveys',
              'Verify that shift notifications are being delivered properly',
            ],
          });
        }
      }
    } catch (error) {
      log.error('[AnomalyDetector] Attendance detection error:', error);
    }

    return anomalies;
  }

  private async detectProfitabilityDecline(workspaceId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];

    try {
      const insights = await crossDomainIntelligence.analyzeClientProfitability(workspaceId);

      for (const insight of insights) {
        if (insight.severity === 'critical' || insight.severity === 'warning') {
          anomalies.push({
            type: 'profitability_decline',
            severity: insight.severity,
            title: insight.title,
            description: insight.summary,
            confidence: insight.confidence,
            dataSnapshot: insight.dataPoints,
            reasoningChain: insight.reasoningChain,
            recommendedActions: insight.recommendedActions,
          });
        }
      }
    } catch (error) {
      log.error('[AnomalyDetector] Profitability detection error:', error);
    }

    return anomalies;
  }

  private async detectComplianceGaps(workspaceId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];

    try {
      const insights = await crossDomainIntelligence.identifyComplianceRisks(workspaceId);

      for (const insight of insights) {
        if (insight.severity === 'critical' || insight.severity === 'warning') {
          anomalies.push({
            type: 'compliance_gap',
            severity: insight.severity,
            title: insight.title,
            description: insight.summary,
            confidence: insight.confidence,
            dataSnapshot: insight.dataPoints,
            reasoningChain: insight.reasoningChain,
            recommendedActions: insight.recommendedActions,
          });
        }
      }
    } catch (error) {
      log.error('[AnomalyDetector] Compliance gap detection error:', error);
    }

    return anomalies;
  }

  private async detectCoverageHoles(workspaceId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];
    const sensitivity = getSensitivity(workspaceId);

    try {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const now = new Date();

      const upcomingShifts = await db.select({
        id: shifts.id,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        employeeId: shifts.employeeId,
        title: shifts.title,
      }).from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, now),
          lte(shifts.startTime, nextWeek)
        ));

      const unassignedShifts = upcomingShifts.filter(s => !s.employeeId);

      if (unassignedShifts.length > 0) {
        const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const imminentShifts = unassignedShifts.filter(s => s.startTime && new Date(s.startTime) <= in48h);
        const upcomingGapShifts = unassignedShifts.filter(s => s.startTime && new Date(s.startTime) > in48h);

        if (imminentShifts.length > 0) {
          log.info(`[AnomalyDetector] ${imminentShifts.length} imminent gap(s) in next 48h — triggering coverage pipeline`);
          for (const shift of imminentShifts) {
            // DB-backed debounce: survives server restarts. Uses idempotency_keys so that
            // even if the scanner runs immediately after a restart, each shift's coverage
            // pipeline is only triggered once per COVERAGE_DEBOUNCE_MS window.
            const debounceInserted = await db.insert(idempotencyKeys)
              .values({
                workspaceId,
                operationType: 'coverage_pipeline',
                requestFingerprint: shift.id,
                status: 'completed',
                expiresAt: new Date(Date.now() + COVERAGE_DEBOUNCE_MS),
              })
              .onConflictDoNothing()
              .returning({ id: idempotencyKeys.id });

            if (debounceInserted.length === 0) {
              log.info(`[AnomalyDetector] Coverage pipeline already triggered for shift ${shift.id} within debounce window, skipping`);
              continue;
            }

            coveragePipeline.triggerCoverage({
              shiftId: shift.id,
              workspaceId,
              reason: 'manual',
              reasonDetails: 'Trinity anomaly scan detected imminent unassigned shift',
            }).catch(e => log.error(`[AnomalyDetector] Coverage pipeline error for shift ${shift.id}:`, e));
          }
        }

        if (upcomingGapShifts.length > 0) {
          log.info(`[AnomalyDetector] ${upcomingGapShifts.length} upcoming gap(s) in 48h-7d — notifying autonomous scheduler`);
        }

        const totalUnassignedHours = unassignedShifts.reduce((sum, s) => {
          if (s.startTime && s.endTime) {
            return sum + (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
          }
          return sum + 8;
        }, 0);

        if (totalUnassignedHours >= sensitivity.coverageGapMinHours) {
          const confidence = unassignedShifts.length >= 5 ? 0.9 : unassignedShifts.length >= 2 ? 0.75 : 0.6;

          anomalies.push({
            type: 'coverage_hole',
            severity: totalUnassignedHours >= 40 ? 'critical' : 'warning',
            title: `Coverage Gap: ${unassignedShifts.length} unassigned shifts (${totalUnassignedHours.toFixed(0)}hrs)`,
            description: `${unassignedShifts.length} shifts in the next 7 days have no assigned employee, totaling approximately ${totalUnassignedHours.toFixed(0)} hours of uncovered time. ${imminentShifts.length > 0 ? `Coverage pipeline triggered for ${imminentShifts.length} imminent shift(s).` : ''}`,
            confidence,
            dataSnapshot: {
              unassignedCount: unassignedShifts.length,
              imminentCount: imminentShifts.length,
              totalUnassignedHours,
              totalUpcomingShifts: upcomingShifts.length,
              coverageRate: upcomingShifts.length > 0
                ? (((upcomingShifts.length - unassignedShifts.length) / upcomingShifts.length) * 100)
                : 100,
            },
            reasoningChain: [
              `Scanned ${upcomingShifts.length} shifts in the next 7 days`,
              `Found ${unassignedShifts.length} shifts without assigned employees`,
              `Imminent (next 48h): ${imminentShifts.length} — coverage pipeline triggered`,
              `Upcoming (48h-7d): ${upcomingGapShifts.length} — flagged for autonomous scheduling`,
              `Total uncovered hours: ${totalUnassignedHours.toFixed(0)}`,
              `Coverage rate: ${upcomingShifts.length > 0 ? (((upcomingShifts.length - unassignedShifts.length) / upcomingShifts.length) * 100).toFixed(1) : 100}%`,
            ],
            recommendedActions: [
              'Review unassigned shifts and assign available employees',
              'Post open shifts for employee self-assignment',
              'Consider contacting part-time or on-call staff',
              'Evaluate if any shifts can be consolidated or rescheduled',
            ],
          });
        }
      }
    } catch (error) {
      log.error('[AnomalyDetector] Coverage hole detection error:', error);
    }

    return anomalies;
  }

  private async detectUnusualClockInPatterns(workspaceId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];
    const sensitivity = getSensitivity(workspaceId);

    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const clockInVariances = await db.select({
        employeeId: timeEntries.employeeId,
        shiftStart: shifts.startTime,
        clockIn: timeEntries.clockIn,
      }).from(timeEntries)
        .innerJoin(shifts, eq(timeEntries.shiftId, shifts.id))
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, oneWeekAgo),
          isNotNull(shifts.startTime)
        ));

      let earlyClockIns = 0;
      let lateClockIns = 0;
      let totalVarianceMinutes = 0;
      const problematicEmployees = new Set<string>();

      for (const entry of clockInVariances) {
        if (entry.shiftStart && entry.clockIn) {
          const varianceMs = new Date(entry.clockIn).getTime() - new Date(entry.shiftStart).getTime();
          const varianceMinutes = varianceMs / (1000 * 60);

          if (Math.abs(varianceMinutes) > sensitivity.clockInVarianceMinutes) {
            if (varianceMinutes > 0) {
              lateClockIns++;
            } else {
              earlyClockIns++;
            }
            totalVarianceMinutes += Math.abs(varianceMinutes);
            if (entry.employeeId) {
              problematicEmployees.add(entry.employeeId);
            }
          }
        }
      }

      const totalAnomalous = earlyClockIns + lateClockIns;
      if (totalAnomalous >= 5 && clockInVariances.length > 0) {
        const anomalyRate = (totalAnomalous / clockInVariances.length) * 100;
        const confidence = anomalyRate > 30 ? 0.85 : anomalyRate > 15 ? 0.7 : 0.55;

        anomalies.push({
          type: 'unusual_clock_in',
          severity: anomalyRate > 30 ? 'critical' : 'warning',
          title: `Unusual Clock-in Patterns: ${totalAnomalous} anomalies (${anomalyRate.toFixed(0)}% rate)`,
          description: `${totalAnomalous} clock-in events deviated more than ${sensitivity.clockInVarianceMinutes} minutes from scheduled start times this week. ${lateClockIns} late and ${earlyClockIns} early clock-ins across ${problematicEmployees.size} employees.`,
          confidence,
          dataSnapshot: {
            totalEntries: clockInVariances.length,
            anomalousEntries: totalAnomalous,
            lateClockIns,
            earlyClockIns,
            anomalyRate,
            affectedEmployees: problematicEmployees.size,
            avgVarianceMinutes: totalAnomalous > 0 ? totalVarianceMinutes / totalAnomalous : 0,
          },
          reasoningChain: [
            `Analyzed ${clockInVariances.length} clock-in entries from the past week`,
            `Found ${totalAnomalous} entries with >${ sensitivity.clockInVarianceMinutes}min variance`,
            `Late: ${lateClockIns}, Early: ${earlyClockIns}`,
            `${problematicEmployees.size} unique employees affected`,
            `Anomaly rate: ${anomalyRate.toFixed(1)}%`,
          ],
          recommendedActions: [
            'Review late clock-in patterns for recurring offenders',
            'Verify shift start times are realistic for employee commutes',
            'Check if early clock-ins are related to overtime abuse',
            'Consider adjusting shift buffer times',
          ],
        });
      }
    } catch (error) {
      log.error('[AnomalyDetector] Clock-in pattern detection error:', error);
    }

    return anomalies;
  }

  private async processDetectedAnomalies(result: AnomalyDetectionResult): Promise<void> {
    for (const anomaly of result.anomalies) {
      try {
        const isDuplicate = await this.checkAnomalyCooldown(result.workspaceId, anomaly.type);
        if (isDuplicate) {
          log.info(`[AnomalyDetector] Skipping duplicate anomaly: ${anomaly.type} for workspace ${result.workspaceId}`);
          continue;
        }

        await db.insert(trinityAnomalyLog).values({
          id: randomUUID(),
          workspaceId: result.workspaceId,
          anomalyType: anomaly.type,
          severity: anomaly.severity,
          title: anomaly.title,
          description: anomaly.description,
          dataSnapshot: anomaly.dataSnapshot,
          confidence: anomaly.confidence.toString(),
          reasoningChain: anomaly.reasoningChain,
          recommendedActions: anomaly.recommendedActions,
        });

        await this.createAnomalyNotification(result.workspaceId, anomaly);

        this.broadcastAnomaly(result.workspaceId, anomaly);

      } catch (error) {
        log.error(`[AnomalyDetector] Failed to process anomaly ${anomaly.type}:`, error);
      }
    }
  }

  private async checkAnomalyCooldown(workspaceId: string, anomalyType: string): Promise<boolean> {
    const cooldownTime = new Date(Date.now() - ANOMALY_COOLDOWN_MS);

    const recent = await db.select({ id: trinityAnomalyLog.id })
      .from(trinityAnomalyLog)
      .where(and(
        eq(trinityAnomalyLog.workspaceId, workspaceId),
        eq(trinityAnomalyLog.anomalyType, anomalyType),
        gte(trinityAnomalyLog.createdAt, cooldownTime)
      ))
      .limit(1);

    return recent.length > 0;
  }

  private async createAnomalyNotification(workspaceId: string, anomaly: DetectedAnomaly): Promise<void> {
    try {
      await generatePlatformUpdate({
        title: `Trinity Alert: ${anomaly.title}`,
        description: anomaly.description,
        category: anomaly.severity === 'critical' ? 'security' : 'improvement',
        workspaceId,
        priority: anomaly.severity === 'critical' ? 3 : anomaly.severity === 'warning' ? 2 : 1,
        metadata: {
          anomalyType: anomaly.type,
          confidence: anomaly.confidence,
          recommendedActions: anomaly.recommendedActions,
          source: 'trinity_anomaly_detector',
          skipFeatureCheck: true,
        },
      });
    } catch (error) {
      log.error('[AnomalyDetector] Failed to create notification:', error);
    }
  }

  private broadcastAnomaly(workspaceId: string, anomaly: DetectedAnomaly): void {
    try {
      broadcastToWorkspace(workspaceId, {
        type: 'trinity_anomaly_detected',
        anomaly: {
          type: anomaly.type,
          severity: anomaly.severity,
          title: anomaly.title,
          description: anomaly.description,
          confidence: anomaly.confidence,
          recommendedActions: anomaly.recommendedActions,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('[AnomalyDetector] Failed to broadcast anomaly:', error);
    }

    // Publish to platformEventBus so Trinity can react autonomously
    // (WebSocket alone is UI-only; Trinity subscribes to the event bus)
    try {
      const anomalyTypeToEventType: Record<string, 'coverage_gap_detected' | 'trinity_issue_detected'> = {
        coverage_hole: 'coverage_gap_detected',
      };
      const eventType = anomalyTypeToEventType[anomaly.type] || 'trinity_issue_detected';

      platformEventBus.publish({
        type: eventType,
        category: 'trinity',
        title: anomaly.title,
        description: anomaly.description,
        workspaceId,
        metadata: {
          anomalyType: anomaly.type,
          severity: anomaly.severity,
          confidence: anomaly.confidence,
          recommendedActions: anomaly.recommendedActions,
          dataSnapshot: anomaly.dataSnapshot,
          source: 'trinityAnomalyDetector',
        },
      }).catch((err) => log.warn('[trinityAnomalyDetector] Fire-and-forget failed:', err));
    } catch (error) {
      log.error('[AnomalyDetector] Failed to publish anomaly to event bus:', error);
    }
  }

  async recordManagerResponse(
    anomalyId: string,
    workspaceId: string,
    managerId: string,
    response: 'acknowledged' | 'dismissed'
  ): Promise<void> {
    try {
      if (response === 'acknowledged') {
        await db.update(trinityAnomalyLog)
          .set({
            acknowledged: true,
            acknowledgedBy: managerId,
            acknowledgedAt: new Date(),
          })
          .where(and(
            eq(trinityAnomalyLog.id, anomalyId),
            eq(trinityAnomalyLog.workspaceId, workspaceId)
          ));
      } else {
        await db.update(trinityAnomalyLog)
          .set({
            dismissed: true,
            acknowledgedBy: managerId,
            acknowledgedAt: new Date(),
          })
          .where(and(
            eq(trinityAnomalyLog.id, anomalyId),
            eq(trinityAnomalyLog.workspaceId, workspaceId)
          ));

        await this.adjustSensitivityFromDismissal(workspaceId, anomalyId);
      }
    } catch (error) {
      log.error('[AnomalyDetector] Failed to record manager response:', error);
    }
  }

  private async adjustSensitivityFromDismissal(workspaceId: string, anomalyId: string): Promise<void> {
    try {
      const [anomaly] = await db.select({
        anomalyType: trinityAnomalyLog.anomalyType,
      }).from(trinityAnomalyLog)
        .where(eq(trinityAnomalyLog.id, anomalyId));

      if (!anomaly) return;

      const threeMothsAgo = new Date();
      threeMothsAgo.setMonth(threeMothsAgo.getMonth() - 3);

      const dismissals = await db.select({
        total: count(),
      }).from(trinityAnomalyLog)
        .where(and(
          eq(trinityAnomalyLog.workspaceId, workspaceId),
          eq(trinityAnomalyLog.anomalyType, anomaly.anomalyType),
          eq(trinityAnomalyLog.dismissed, true),
          gte(trinityAnomalyLog.createdAt, threeMothsAgo)
        ));

      const dismissalCount = Number(dismissals[0]?.total || 0);

      if (dismissalCount >= 3) {
        const current = getSensitivity(workspaceId);
        const adjusted = { ...current };

        switch (anomaly.anomalyType) {
          case 'overtime_spike':
            adjusted.overtimeThresholdHours = Math.min(60, current.overtimeThresholdHours + 5);
            break;
          case 'attendance_deterioration':
            adjusted.attendanceDropPercent = Math.min(40, current.attendanceDropPercent + 5);
            break;
          case 'coverage_hole':
            adjusted.coverageGapMinHours = Math.min(16, current.coverageGapMinHours + 2);
            break;
          case 'unusual_clock_in':
            adjusted.clockInVarianceMinutes = Math.min(60, current.clockInVarianceMinutes + 10);
            break;
        }

        workspaceSensitivity.set(workspaceId, adjusted);
        log.info(`[AnomalyDetector] Adjusted sensitivity for workspace ${workspaceId}, type ${anomaly.anomalyType}:`, adjusted);
      }
    } catch (error) {
      log.error('[AnomalyDetector] Failed to adjust sensitivity:', error);
    }
  }

  async getAnomalyHistory(workspaceId: string, limit = 50): Promise<any[]> {
    return db.select()
      .from(trinityAnomalyLog)
      .where(eq(trinityAnomalyLog.workspaceId, workspaceId))
      .orderBy(desc(trinityAnomalyLog.createdAt))
      .limit(limit);
  }

  getLastScanResult(workspaceId: string): AnomalyDetectionResult | undefined {
    return this.lastScanResults.get(workspaceId);
  }

  getSensitivityConfig(workspaceId: string): SensitivityConfig {
    return getSensitivity(workspaceId);
  }
}

export const trinityAnomalyDetector = new TrinityAnomalyDetector();
