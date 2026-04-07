import { db } from '../../db';
import { employees, employeeDocuments, employeeEventLog } from '@shared/schema';
import { eq, and, isNull, lte, desc, gte, sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { coaileagueScoringService } from '../automation/coaileagueScoringService';
import { employeeDocumentOnboardingService } from '../employeeDocumentOnboardingService';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('complianceScoringBridge');


export interface ComplianceScoringConfig {
  gracePeriodsEnabled: boolean;
  gracePeriodDays: number;
  autoSuspendEnabled: boolean;
  autoSuspendAfterDays: number;
  notifyManagerOnMissing: boolean;
  notifyEmployeeOnExpiring: boolean;
  expirationWarningDays: number;
}

const DEFAULT_CONFIG: ComplianceScoringConfig = {
  gracePeriodsEnabled: true,
  gracePeriodDays: 7,
  autoSuspendEnabled: true,
  autoSuspendAfterDays: 14,
  notifyManagerOnMissing: true,
  notifyEmployeeOnExpiring: true,
  expirationWarningDays: 30,
};

export const COMPLIANCE_POINT_RULES: Record<string, { points: number; category: string; description: string; regulatoryCitation?: string }> = {
  document_approved: { points: 10, category: 'documentation', description: 'Document approved and verified' },
  training_completed: { points: 15, category: 'training', description: 'Required training course completed' },
  certification_renewed: { points: 20, category: 'certification', description: 'Certification renewed before expiration' },
  background_check_clear: { points: 25, category: 'background', description: 'Background check passed' },
  firearms_qualification_passed: { points: 30, category: 'firearms', description: 'Firearms qualification passed', regulatoryCitation: 'TX Occ. Code §1702.163' },
  drug_test_passed: { points: 15, category: 'medical', description: 'Drug screening passed' },
  cpr_certification_current: { points: 10, category: 'medical', description: 'CPR/First Aid certification current' },
  perfect_compliance_month: { points: 50, category: 'bonus', description: 'Perfect compliance for entire month' },
  early_renewal: { points: 15, category: 'bonus', description: 'Document renewed 30+ days before expiration' },

  document_expired_critical: { points: -50, category: 'documentation', description: 'Critical work-blocking document expired' },
  document_expired_non_critical: { points: -15, category: 'documentation', description: 'Non-critical document expired' },
  document_missing_critical: { points: -40, category: 'documentation', description: 'Critical document missing past grace period' },
  document_rejected: { points: -20, category: 'documentation', description: 'Submitted document rejected' },
  training_overdue: { points: -25, category: 'training', description: 'Required training past due date' },
  certification_lapsed: { points: -35, category: 'certification', description: 'Professional certification lapsed' },
  background_check_expired: { points: -30, category: 'background', description: 'Background check expired - requires renewal' },
  firearms_qualification_failed: { points: -40, category: 'firearms', description: 'Firearms qualification failed', regulatoryCitation: 'TX Occ. Code §1702.163' },
  compliance_violation: { points: -60, category: 'violation', description: 'Compliance violation recorded' },
  compliance_suspension: { points: -100, category: 'suspension', description: 'Employee suspended for compliance failure' },
  drug_test_failed: { points: -75, category: 'medical', description: 'Drug screening failed' },

  compliance_reinstatement: { points: 25, category: 'restoration', description: 'Compliance restored after suspension' },
  grievance_score_adjustment: { points: 0, category: 'adjustment', description: 'Manual score adjustment via grievance' },
};

class ComplianceScoringBridge {
  private config: ComplianceScoringConfig = DEFAULT_CONFIG;
  private initialized = false;

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    platformEventBus.on('compliance_document_expired', async (payload: any) => {
      await this.handleDocumentExpired(payload);
    });

    platformEventBus.on('compliance_document_missing', async (payload: any) => {
      await this.handleDocumentMissing(payload);
    });

    platformEventBus.on('compliance_document_approved', async (payload: any) => {
      await this.handleDocumentApproved(payload);
    });

    platformEventBus.on('compliance_document_rejected', async (payload: any) => {
      await this.handleDocumentRejected(payload);
    });

    log.info('[ComplianceScoringBridge] Initialized - listening for compliance events');
  }

  private async handleDocumentExpired(payload: {
    employeeId: string;
    workspaceId: string;
    documentType: string;
    documentName: string;
    blocksWork: boolean;
  }) {
    try {
      if (payload.blocksWork) {
        await coaileagueScoringService.processEvent(
          payload.workspaceId,
          payload.employeeId,
          'document_expired_critical',
          {
            referenceType: 'document',
            metadata: {
              documentType: payload.documentType,
              documentName: payload.documentName,
              reason: `Critical document expired: ${payload.documentName}`,
            },
            isAutomatic: true,
          }
        );

        await this.checkAndEnforceSuspension(payload.employeeId, payload.workspaceId);
      }

      log.info(`[ComplianceScoringBridge] Document expired scored: ${payload.documentName} for employee ${payload.employeeId}`);
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error handling document expired:', error);
    }
  }

  private async handleDocumentMissing(payload: {
    employeeId: string;
    workspaceId: string;
    documentType: string;
    documentName: string;
    blocksWork: boolean;
    daysMissing?: number;
  }) {
    try {
      if (payload.blocksWork) {
        await coaileagueScoringService.processEvent(
          payload.workspaceId,
          payload.employeeId,
          'document_missing_critical',
          {
            referenceType: 'document',
            metadata: {
              documentType: payload.documentType,
              documentName: payload.documentName,
              daysMissing: payload.daysMissing,
              reason: `Missing critical document: ${payload.documentName}`,
            },
            isAutomatic: true,
          }
        );

        if (this.config.notifyManagerOnMissing) {
          await this.notifyManagersOfMissingDoc(payload);
        }

        await this.checkAndEnforceSuspension(payload.employeeId, payload.workspaceId);
      }

      log.info(`[ComplianceScoringBridge] Document missing scored: ${payload.documentName} for employee ${payload.employeeId}`);
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error handling document missing:', error);
    }
  }

  private async handleDocumentApproved(payload: {
    employeeId: string;
    workspaceId: string;
    documentType: string;
    documentName: string;
  }) {
    try {
      await coaileagueScoringService.processEvent(
        payload.workspaceId,
        payload.employeeId,
        'document_approved',
        {
          referenceType: 'document',
          metadata: {
            documentType: payload.documentType,
            documentName: payload.documentName,
            reason: `Document approved: ${payload.documentName}`,
          },
          isAutomatic: true,
        }
      );

      await this.checkAndLiftSuspension(payload.employeeId, payload.workspaceId);

      log.info(`[ComplianceScoringBridge] Document approved scored: ${payload.documentName} for employee ${payload.employeeId}`);
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error handling document approved:', error);
    }
  }

  private async handleDocumentRejected(payload: {
    employeeId: string;
    workspaceId: string;
    documentType: string;
    documentName: string;
    reason?: string;
  }) {
    try {
      await coaileagueScoringService.processEvent(
        payload.workspaceId,
        payload.employeeId,
        'document_rejected',
        {
          referenceType: 'document',
          metadata: {
            documentType: payload.documentType,
            documentName: payload.documentName,
            rejectionReason: payload.reason,
          },
          isAutomatic: true,
        }
      );

      log.info(`[ComplianceScoringBridge] Document rejected scored: ${payload.documentName} for employee ${payload.employeeId}`);
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error handling document rejected:', error);
    }
  }

  async checkAndEnforceSuspension(employeeId: string, workspaceId: string): Promise<boolean> {
    try {
      const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(employeeId);

      if (!eligibility.eligible && this.config.autoSuspendEnabled) {
        const employee = await db.query.employees.findFirst({
          where: and(
            eq(employees.id, employeeId),
            eq(employees.workspaceId, workspaceId)
          ),
        });

        if (employee && employee.isActive !== false) {
          await db.update(employees)
            .set({
              isActive: false,
              updatedAt: new Date(),
            })
            .where(and(
              eq(employees.id, employeeId),
              eq(employees.workspaceId, workspaceId)
            ));

          await coaileagueScoringService.processEvent(
            workspaceId,
            employeeId,
            'compliance_suspension',
            {
              referenceType: 'compliance',
              metadata: {
                reason: 'Auto-suspended due to missing critical compliance documents',
                blockedReasons: eligibility.reasons,
              },
              isAutomatic: true,
            }
          );

          platformEventBus.publish({
            type: 'compliance_suspension_triggered',
            workspaceId,
            payload: {
              employeeId,
              employeeName: `${employee.firstName} ${employee.lastName}`,
              reasons: eligibility.reasons,
              suspensionType: 'auto_compliance',
            },
            metadata: { source: 'ComplianceScoringBridge' },
          }).catch((err) => log.warn('[complianceScoringBridge] Fire-and-forget failed:', err));

          // 📡 REAL-TIME: Broadcast compliance change so dashboards update live without refresh
          try {
            const { broadcastToWorkspace } = await import('../../websocket');
            broadcastToWorkspace(workspaceId, {
              type: 'compliance_updated',
              employeeId,
              action: 'suspended',
              reasons: eligibility.reasons,
              timestamp: new Date().toISOString(),
            });
          } catch (_wsErr) { log.warn('[ComplianceScoringBridge] WebSocket broadcast failed for employee suspension:', _wsErr instanceof Error ? _wsErr.message : String(_wsErr)); }

          // Hard Block: unassign all future shifts and trigger coverage pipeline
          try {
            const { handleOfficerDeactivation } = await import('../scheduling/officerDeactivationHandler');
            const result = await handleOfficerDeactivation(employeeId, workspaceId, 'suspended');
            log.info(`[ComplianceScoringBridge] Hard Block: unassigned ${result.shiftsUnassigned} future shifts, triggered ${result.coverageTriggered} coverage requests for employee ${employeeId}`);
          } catch (deactivErr) {
            log.error('[ComplianceScoringBridge] Failed to unassign future shifts for hard-blocked employee:', deactivErr);
          }

          log.info(`[ComplianceScoringBridge] Employee ${employeeId} auto-suspended: ${eligibility.reasons.join(', ')}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error enforcing suspension:', error);
      return false;
    }
  }

  async checkAndLiftSuspension(employeeId: string, workspaceId: string): Promise<boolean> {
    try {
      const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(employeeId);

      if (eligibility.eligible) {
        const employee = await db.query.employees.findFirst({
          where: and(
            eq(employees.id, employeeId),
            eq(employees.workspaceId, workspaceId)
          ),
        });

        if (employee && employee.isActive === false) {
          await db.update(employees)
            .set({
              isActive: true,
              updatedAt: new Date(),
            })
            .where(and(
              eq(employees.id, employeeId),
              eq(employees.workspaceId, workspaceId)
            ));

          await coaileagueScoringService.processEvent(
            workspaceId,
            employeeId,
            'compliance_reinstatement',
            {
              referenceType: 'compliance',
              metadata: {
                reason: 'All critical compliance documents restored - suspension lifted',
              },
              isAutomatic: true,
            }
          );

          platformEventBus.publish({
            type: 'compliance_suspension_lifted',
            workspaceId,
            payload: {
              employeeId,
              employeeName: `${employee.firstName} ${employee.lastName}`,
              reason: 'All critical documents now compliant',
            },
            metadata: { source: 'ComplianceScoringBridge' },
          }).catch((err) => log.warn('[complianceScoringBridge] Fire-and-forget failed:', err));

          log.info(`[ComplianceScoringBridge] Employee ${employeeId} suspension lifted - all docs compliant`);
          return true;
        }
      }

      return false;
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error lifting suspension:', error);
      return false;
    }
  }

  async runComplianceAudit(workspaceId: string): Promise<{
    totalEmployees: number;
    compliant: number;
    nonCompliant: number;
    suspended: number;
    expiringWithin30Days: number;
    actions: string[];
  }> {
    const actions: string[] = [];

    try {
      const overview = await employeeDocumentOnboardingService.getWorkspaceOnboardingOverview(workspaceId);

      const nonCompliantEmployees = overview.employeeStatuses.filter(e => !e.isWorkEligible);
      const suspendedCount = nonCompliantEmployees.length;

      if (nonCompliantEmployees.length > 0) {
        const sampleSize = Math.min(nonCompliantEmployees.length, 5);
        for (let i = 0; i < sampleSize; i++) {
          const emp = nonCompliantEmployees[i];
          actions.push(`Non-compliant: ${emp.employeeName} - ${emp.criticalDocumentsMissing} critical document(s) missing`);
        }
        if (nonCompliantEmployees.length > sampleSize) {
          actions.push(`... and ${nonCompliantEmployees.length - sampleSize} more non-compliant employees`);
        }
      }

      return {
        totalEmployees: overview.totalEmployees,
        compliant: overview.workEligibleCount,
        nonCompliant: overview.totalEmployees - overview.workEligibleCount,
        suspended: suspendedCount,
        expiringWithin30Days: overview.expiringDocumentsCount,
        actions,
      };
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error running compliance audit:', error);
      return {
        totalEmployees: 0,
        compliant: 0,
        nonCompliant: 0,
        suspended: 0,
        expiringWithin30Days: 0,
        actions: [`Error: ${error instanceof Error ? error.message : 'Unknown'}`],
      };
    }
  }

  async processGrievanceScoreAdjustment(
    workspaceId: string,
    employeeId: string,
    adjustmentPoints: number,
    grievanceId: string,
    reason: string,
    approvedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await coaileagueScoringService.processEvent(
        workspaceId,
        employeeId,
        'grievance_score_adjustment',
        {
          referenceId: grievanceId,
          referenceType: 'grievance',
          metadata: {
            adjustmentPoints,
            reason,
            approvedBy,
            type: 'grievance_resolution',
          },
          triggeredBy: approvedBy,
          isAutomatic: false,
        }
      );

      return { success: result.success, error: result.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async notifyManagersOfMissingDoc(payload: {
    employeeId: string;
    workspaceId: string;
    documentType: string;
    documentName: string;
  }) {
    try {
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, payload.employeeId),
      });

      if (employee) {
        const managers = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, payload.workspaceId),
            isNull(employees.terminationDate)
          ),
        });

        const managerEmployees = managers.filter(m => {
          const r = (m.workspaceRole || m.role || '').toLowerCase();
          return r === 'org_owner' || r === 'co_owner' || r === 'manager' ||
            r === 'department_manager' || r === 'supervisor' ||
            r === 'org_manager';
        });

        for (const manager of managerEmployees) {
          if (manager.userId) {
            await createNotification({
              userId: manager.userId,
              workspaceId: payload.workspaceId,
              type: 'document_expiring',
              title: 'Missing Critical Document',
              message: `${employee.firstName} ${employee.lastName} is missing: ${payload.documentName}. Work assignment may be blocked.`,
              priority: 'high',
            });
          }
        }
      }
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error notifying managers:', error);
    }
  }

  async calculateComplianceScore(employeeId: string, workspaceId: string): Promise<{
    score: number;
    maxScore: 1000;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    breakdown: { category: string; points: number; eventCount: number }[];
    recentEvents: { type: string; points: number; date: Date; description: string }[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }> {
    try {
      const events = await db.select().from(employeeEventLog).where(
        and(
          eq(employeeEventLog.employeeId, employeeId),
          eq(employeeEventLog.workspaceId, workspaceId)
        )
      );

      let score = 500;
      const categoryMap: Record<string, { points: number; eventCount: number }> = {};

      for (const event of events) {
        const rule = COMPLIANCE_POINT_RULES[event.eventType];
        if (!rule) continue;

        score += rule.points;

        if (!categoryMap[rule.category]) {
          categoryMap[rule.category] = { points: 0, eventCount: 0 };
        }
        categoryMap[rule.category].points += rule.points;
        categoryMap[rule.category].eventCount += 1;
      }

      score = Math.max(0, Math.min(1000, score));

      const breakdown = Object.entries(categoryMap).map(([category, data]) => ({
        category,
        points: data.points,
        eventCount: data.eventCount,
      }));

      const recentEvents = events
        .filter(e => COMPLIANCE_POINT_RULES[e.eventType])
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 20)
        .map(e => {
          const rule = COMPLIANCE_POINT_RULES[e.eventType]!;
          return {
            type: e.eventType,
            points: rule.points,
            date: e.createdAt ?? new Date(),
            description: rule.description,
          };
        });

      let grade: 'A' | 'B' | 'C' | 'D' | 'F';
      if (score >= 800) grade = 'A';
      else if (score >= 650) grade = 'B';
      else if (score >= 500) grade = 'C';
      else if (score >= 350) grade = 'D';
      else grade = 'F';

      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      if (score >= 700) riskLevel = 'low';
      else if (score >= 500) riskLevel = 'medium';
      else if (score >= 350) riskLevel = 'high';
      else riskLevel = 'critical';

      return { score, maxScore: 1000, grade, breakdown, recentEvents, riskLevel };
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error calculating compliance score:', error);
      return {
        score: 500,
        maxScore: 1000,
        grade: 'C',
        breakdown: [],
        recentEvents: [],
        riskLevel: 'medium',
      };
    }
  }

  async getComplianceScoreHistory(employeeId: string, days: number): Promise<{
    history: { date: string; score: number; eventsCount: number }[];
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await db.select().from(employeeEventLog).where(
        and(
          eq(employeeEventLog.employeeId, employeeId),
          gte(employeeEventLog.createdAt, startDate)
        )
      );

      const dailyEvents: Record<string, { points: number; count: number }> = {};

      for (const event of events) {
        const rule = COMPLIANCE_POINT_RULES[event.eventType];
        if (!rule) continue;
        const dateKey = event.createdAt
          ? new Date(event.createdAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        if (!dailyEvents[dateKey]) {
          dailyEvents[dateKey] = { points: 0, count: 0 };
        }
        dailyEvents[dateKey].points += rule.points;
        dailyEvents[dateKey].count += 1;
      }

      const history: { date: string; score: number; eventsCount: number }[] = [];
      let runningScore = 500;

      for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dateKey = d.toISOString().split('T')[0];
        const dayData = dailyEvents[dateKey];

        if (dayData) {
          runningScore += dayData.points;
          runningScore = Math.max(0, Math.min(1000, runningScore));
        }

        history.push({
          date: dateKey,
          score: runningScore,
          eventsCount: dayData?.count ?? 0,
        });
      }

      return { history };
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error getting score history:', error);
      return { history: [] };
    }
  }

  async getWorkspaceComplianceScoreboard(workspaceId: string): Promise<{
    scoreboard: {
      employeeId: string;
      score: number;
      grade: 'A' | 'B' | 'C' | 'D' | 'F';
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      totalEvents: number;
    }[];
  }> {
    try {
      const workspaceEmployees = await db.query.employees.findMany({
        where: and(
          eq(employees.workspaceId, workspaceId),
          isNull(employees.terminationDate)
        ),
      });

      const scoreboard: {
        employeeId: string;
        score: number;
        grade: 'A' | 'B' | 'C' | 'D' | 'F';
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        totalEvents: number;
      }[] = [];

      for (const emp of workspaceEmployees) {
        const result = await this.calculateComplianceScore(emp.id, workspaceId);
        scoreboard.push({
          employeeId: emp.id,
          score: result.score,
          grade: result.grade,
          riskLevel: result.riskLevel,
          totalEvents: result.recentEvents.length,
        });
      }

      scoreboard.sort((a, b) => b.score - a.score);

      return { scoreboard };
    } catch (error) {
      log.error('[ComplianceScoringBridge] Error getting workspace scoreboard:', error);
      return { scoreboard: [] };
    }
  }

  getConfig(): ComplianceScoringConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ComplianceScoringConfig>) {
    this.config = { ...this.config, ...updates };
  }
}

export const complianceScoringBridge = new ComplianceScoringBridge();
