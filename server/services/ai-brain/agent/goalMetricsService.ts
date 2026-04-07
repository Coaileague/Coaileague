/**
 * GOAL METRICS SERVICE
 * ====================
 * Tracks Trinity's goal execution outcomes for continuous learning:
 * 
 * 1. Goal Success/Failure Metrics - Track outcomes for learning
 * 2. Iteration Path Recording - Store what was tried at each attempt
 * 3. Pre-Execution Risk Analysis - Calculate warnings before preview
 * 4. Stakeholder Impact Calculation - Compute who's affected
 */

import { db } from '../../../db';
import {
  employees,
  shifts,
  clients,
  workspaces,
  systemAuditLogs
} from '@shared/schema';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { createLogger } from '../../../lib/logger';
const log = createLogger('goalMetricsService');

// ============================================================================
// TYPES
// ============================================================================

export interface GoalMetrics {
  goalId: string;
  goalType: string;
  startTime: Date;
  endTime?: Date;
  success: boolean;
  attempts: number;
  finalConfidence: number;
  errorCount: number;
  rollbackCount: number;
  durationMs: number;
  iterationPath: IterationStep[];
  learnings: string[];
}

export interface IterationStep {
  attemptNumber: number;
  timestamp: Date;
  action: string;
  input: Record<string, any>;
  output?: Record<string, any>;
  success: boolean;
  error?: string;
  confidenceBefore: number;
  confidenceAfter: number;
  reason?: string;
}

export interface RiskAnalysis {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  warnings: RiskWarning[];
  blockers: RiskBlocker[];
  recommendations: string[];
  complianceIssues: ComplianceIssue[];
  estimatedImpact: ImpactEstimate;
}

export interface RiskWarning {
  type: 'overtime' | 'cost' | 'compliance' | 'availability' | 'fatigue' | 'skill_mismatch';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedEntities: string[];
  suggestion?: string;
}

export interface RiskBlocker {
  type: string;
  message: string;
  resolution: string;
}

export interface ComplianceIssue {
  policy: string;
  violation: string;
  severity: 'warning' | 'error' | 'critical';
  affectedEmployees: string[];
}

export interface ImpactEstimate {
  estimatedCost: number;
  estimatedTimeSavedMinutes: number;
  affectedEmployeeCount: number;
  affectedClientCount: number;
  scheduleChangesCount: number;
}

export interface StakeholderImpact {
  employees: EmployeeImpact[];
  clients: ClientImpact[];
  summary: ImpactSummary;
}

export interface EmployeeImpact {
  employeeId: string;
  employeeName: string;
  currentHours: number;
  proposedHours: number;
  hoursDelta: number;
  shiftsAdded: number;
  shiftsRemoved: number;
  shiftsModified: number;
  warnings: string[];
  impactLevel: 'none' | 'minor' | 'moderate' | 'major';
}

export interface ClientImpact {
  clientId: string;
  clientName: string;
  currentCoverage: number;
  proposedCoverage: number;
  coverageDelta: number;
  staffingChanges: number;
  impactLevel: 'none' | 'minor' | 'moderate' | 'major';
}

export interface ImpactSummary {
  totalEmployeesAffected: number;
  totalClientsAffected: number;
  netHoursChange: number;
  estimatedPayrollImpact: number;
  highImpactCount: number;
}

// ============================================================================
// GOAL METRICS SERVICE
// ============================================================================

class GoalMetricsService {
  private static instance: GoalMetricsService;
  private activeGoals: Map<string, GoalMetrics> = new Map();
  private completedMetrics: GoalMetrics[] = [];
  private readonly maxHistorySize = 1000;

  private constructor() {
    log.info('[GoalMetricsService] Initialized goal execution tracking');
  }

  static getInstance(): GoalMetricsService {
    if (!GoalMetricsService.instance) {
      GoalMetricsService.instance = new GoalMetricsService();
    }
    return GoalMetricsService.instance;
  }

  // ==========================================================================
  // 1. GOAL SUCCESS/FAILURE METRICS
  // ==========================================================================

  /**
   * Start tracking a new goal execution
   */
  startGoalTracking(goalId: string, goalType: string): void {
    const metrics: GoalMetrics = {
      goalId,
      goalType,
      startTime: new Date(),
      success: false,
      attempts: 0,
      finalConfidence: 0,
      errorCount: 0,
      rollbackCount: 0,
      durationMs: 0,
      iterationPath: [],
      learnings: [],
    };
    this.activeGoals.set(goalId, metrics);
  }

  /**
   * Complete goal tracking and store metrics
   */
  async completeGoalTracking(
    goalId: string,
    success: boolean,
    finalConfidence: number,
    learnings: string[]
  ): Promise<GoalMetrics | null> {
    const metrics = this.activeGoals.get(goalId);
    if (!metrics) return null;

    metrics.endTime = new Date();
    metrics.success = success;
    metrics.finalConfidence = finalConfidence;
    metrics.durationMs = metrics.endTime.getTime() - metrics.startTime.getTime();
    metrics.learnings = learnings;

    this.activeGoals.delete(goalId);
    this.completedMetrics.push(metrics);

    if (this.completedMetrics.length > this.maxHistorySize) {
      this.completedMetrics.shift();
    }

    await this.persistMetrics(metrics);
    return metrics;
  }

  /**
   * Get success rate for a goal type
   */
  getSuccessRate(goalType?: string): { rate: number; total: number; successful: number } {
    const filtered = goalType 
      ? this.completedMetrics.filter(m => m.goalType === goalType)
      : this.completedMetrics;
    
    const successful = filtered.filter(m => m.success).length;
    return {
      rate: filtered.length > 0 ? successful / filtered.length : 0,
      total: filtered.length,
      successful,
    };
  }

  /**
   * Get average attempts to success
   */
  getAverageAttempts(goalType?: string): number {
    const successful = this.completedMetrics
      .filter(m => m.success && (!goalType || m.goalType === goalType));
    
    if (successful.length === 0) return 0;
    return successful.reduce((sum, m) => sum + m.attempts, 0) / successful.length;
  }

  /**
   * Get common failure patterns
   */
  getFailurePatterns(): { pattern: string; count: number }[] {
    const patterns: Map<string, number> = new Map();
    
    for (const metrics of this.completedMetrics.filter(m => !m.success)) {
      for (const step of metrics.iterationPath.filter(s => !s.success)) {
        const pattern = step.error || 'unknown_error';
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }

    return Array.from(patterns.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // ==========================================================================
  // 2. ITERATION PATH RECORDING
  // ==========================================================================

  /**
   * Record an iteration step
   */
  recordIterationStep(
    goalId: string,
    step: Omit<IterationStep, 'timestamp'>
  ): void {
    const metrics = this.activeGoals.get(goalId);
    if (!metrics) return;

    metrics.iterationPath.push({
      ...step,
      timestamp: new Date(),
    });
    metrics.attempts = step.attemptNumber;
    
    if (!step.success) {
      metrics.errorCount++;
    }
  }

  /**
   * Record a rollback
   */
  recordRollback(goalId: string, reason: string): void {
    const metrics = this.activeGoals.get(goalId);
    if (metrics) {
      metrics.rollbackCount++;
      metrics.iterationPath.push({
        attemptNumber: metrics.attempts,
        timestamp: new Date(),
        action: 'rollback',
        input: { reason },
        success: true,
        confidenceBefore: 0,
        confidenceAfter: 0,
        reason,
      });
    }
  }

  /**
   * Get iteration path for visualization
   */
  getIterationPath(goalId: string): IterationStep[] {
    const metrics = this.activeGoals.get(goalId) || 
                   this.completedMetrics.find(m => m.goalId === goalId);
    return metrics?.iterationPath || [];
  }

  // ==========================================================================
  // 3. PRE-EXECUTION RISK ANALYSIS
  // ==========================================================================

  /**
   * Analyze risks before executing a goal
   */
  async analyzePreExecutionRisks(
    workspaceId: string,
    goalType: string,
    proposedChanges: {
      shiftsToCreate?: any[];
      shiftsToModify?: any[];
      shiftsToDelete?: string[];
      employeeAssignments?: { employeeId: string; hours: number }[];
    }
  ): Promise<RiskAnalysis> {
    const warnings: RiskWarning[] = [];
    const blockers: RiskBlocker[] = [];
    const complianceIssues: ComplianceIssue[] = [];
    const recommendations: string[] = [];

    const [policies, currentEmployees] = await Promise.all([
      this.getWorkspacePolicies(workspaceId),
      this.getEmployeeData(workspaceId),
    ]);

    // Check overtime risks
    if (proposedChanges.employeeAssignments) {
      for (const assignment of proposedChanges.employeeAssignments) {
        const employee = currentEmployees.find(e => e.id === assignment.employeeId);
        if (!employee) continue;

        const currentHours = await this.getEmployeeWeeklyHours(assignment.employeeId, workspaceId);
        const totalHours = currentHours + assignment.hours;

        if (totalHours > 40) {
          warnings.push({
            type: 'overtime',
            severity: totalHours > 50 ? 'high' : 'medium',
            message: `${employee.firstName} ${employee.lastName} will have ${totalHours} hours (overtime)`,
            affectedEntities: [assignment.employeeId],
            suggestion: 'Consider splitting shifts or using part-time employees',
          });
        }

        if (totalHours > 60) {
          blockers.push({
            type: 'excessive_hours',
            message: `${employee.firstName} ${employee.lastName} exceeds 60-hour safety limit`,
            resolution: 'Reduce assigned hours or use different employee',
          });
        }
      }
    }

    // Check consecutive days (fatigue risk)
    if (proposedChanges.shiftsToCreate) {
      const employeeShiftDays = new Map<string, Set<string>>();
      
      for (const shift of proposedChanges.shiftsToCreate) {
        if (!shift.employeeId) continue;
        
        const days = employeeShiftDays.get(shift.employeeId) || new Set();
        days.add(new Date(shift.startTime).toDateString());
        employeeShiftDays.set(shift.employeeId, days);
      }

      for (const [employeeId, days] of employeeShiftDays) {
        if (days.size >= 6) {
          const employee = currentEmployees.find(e => e.id === employeeId);
          warnings.push({
            type: 'fatigue',
            severity: days.size >= 7 ? 'high' : 'medium',
            message: `${employee?.firstName || 'Employee'} working ${days.size} consecutive days`,
            affectedEntities: [employeeId],
            suggestion: 'Ensure required rest period between shifts',
          });
        }
      }
    }

    // Check compliance policies
    for (const policy of policies) {
      if (policy.policyType === 'break_compliance') {
        complianceIssues.push({
          policy: policy.policyName,
          violation: 'Break requirements must be verified during execution',
          severity: 'warning',
          affectedEmployees: [],
        });
      }
    }

    // Cost impact warning
    const estimatedImpact = await this.estimateImpact(workspaceId, proposedChanges);
    if (estimatedImpact.estimatedCost > 1000) {
      warnings.push({
        type: 'cost',
        severity: estimatedImpact.estimatedCost > 5000 ? 'high' : 'medium',
        message: `Estimated payroll impact: $${estimatedImpact.estimatedCost.toFixed(2)}`,
        affectedEntities: [],
        suggestion: 'Review cost breakdown before approval',
      });
    }

    // Calculate overall risk
    let riskScore = 0;
    riskScore += blockers.length * 40;
    riskScore += warnings.filter(w => w.severity === 'high').length * 20;
    riskScore += warnings.filter(w => w.severity === 'medium').length * 10;
    riskScore += warnings.filter(w => w.severity === 'low').length * 5;
    riskScore += complianceIssues.filter(c => c.severity === 'critical').length * 30;

    const overallRisk: RiskAnalysis['overallRisk'] = 
      blockers.length > 0 ? 'critical' :
      riskScore >= 50 ? 'high' :
      riskScore >= 20 ? 'medium' : 'low';

    // Generate recommendations
    if (warnings.some(w => w.type === 'overtime')) {
      recommendations.push('Consider cross-training employees to distribute workload');
    }
    if (warnings.some(w => w.type === 'fatigue')) {
      recommendations.push('Schedule rest days to prevent employee burnout');
    }
    if (estimatedImpact.estimatedCost > 2000) {
      recommendations.push('Review if premium pay rates are necessary');
    }

    return {
      overallRisk,
      riskScore: Math.min(100, riskScore),
      warnings,
      blockers,
      recommendations,
      complianceIssues,
      estimatedImpact,
    };
  }

  // ==========================================================================
  // 4. STAKEHOLDER IMPACT CALCULATION
  // ==========================================================================

  /**
   * Calculate impact on all stakeholders
   */
  async calculateStakeholderImpact(
    workspaceId: string,
    proposedChanges: {
      shiftsToCreate?: any[];
      shiftsToModify?: { shiftId: string; changes: any }[];
      shiftsToDelete?: string[];
    }
  ): Promise<StakeholderImpact> {
    const employeeImpacts: Map<string, EmployeeImpact> = new Map();
    const clientImpacts: Map<string, ClientImpact> = new Map();

    const [allEmployees, allClients] = await Promise.all([
      this.getEmployeeData(workspaceId),
      this.getClientData(workspaceId),
    ]);

    // Initialize employee impacts
    for (const emp of allEmployees) {
      const currentHours = await this.getEmployeeWeeklyHours(emp.id, workspaceId);
      employeeImpacts.set(emp.id, {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        currentHours,
        proposedHours: currentHours,
        hoursDelta: 0,
        shiftsAdded: 0,
        shiftsRemoved: 0,
        shiftsModified: 0,
        warnings: [],
        impactLevel: 'none',
      });
    }

    // Initialize client impacts
    for (const client of allClients) {
      clientImpacts.set(client.id, {
        clientId: client.id,
        clientName: client.companyName,
        currentCoverage: 0,
        proposedCoverage: 0,
        coverageDelta: 0,
        staffingChanges: 0,
        impactLevel: 'none',
      });
    }

    // Process created shifts
    if (proposedChanges.shiftsToCreate) {
      for (const shift of proposedChanges.shiftsToCreate) {
        if (shift.employeeId) {
          const impact = employeeImpacts.get(shift.employeeId);
          if (impact) {
            const shiftHours = this.calculateShiftHours(shift.startTime, shift.endTime);
            impact.proposedHours += shiftHours;
            impact.hoursDelta += shiftHours;
            impact.shiftsAdded++;
          }
        }
        if (shift.clientId) {
          const impact = clientImpacts.get(shift.clientId);
          if (impact) {
            impact.proposedCoverage++;
            impact.coverageDelta++;
            impact.staffingChanges++;
          }
        }
      }
    }

    // Process deleted shifts
    if (proposedChanges.shiftsToDelete) {
      const deletedShifts = await this.getShiftsByIds(proposedChanges.shiftsToDelete);
      for (const shift of deletedShifts) {
        if (shift.employeeId) {
          const impact = employeeImpacts.get(shift.employeeId);
          if (impact) {
            const shiftHours = this.calculateShiftHours(shift.startTime, shift.endTime);
            impact.proposedHours -= shiftHours;
            impact.hoursDelta -= shiftHours;
            impact.shiftsRemoved++;
          }
        }
        if (shift.clientId) {
          const impact = clientImpacts.get(shift.clientId);
          if (impact) {
            impact.proposedCoverage--;
            impact.coverageDelta--;
            impact.staffingChanges++;
          }
        }
      }
    }

    // Process modified shifts
    if (proposedChanges.shiftsToModify) {
      for (const mod of proposedChanges.shiftsToModify) {
        const existingShift = await this.getShiftById(mod.shiftId);
        if (!existingShift) continue;

        const oldHours = this.calculateShiftHours(existingShift.startTime, existingShift.endTime);
        const newHours = mod.changes.startTime && mod.changes.endTime 
          ? this.calculateShiftHours(mod.changes.startTime, mod.changes.endTime)
          : oldHours;

        // Handle employee changes
        if (mod.changes.employeeId !== existingShift.employeeId) {
          if (existingShift.employeeId) {
            const oldImpact = employeeImpacts.get(existingShift.employeeId);
            if (oldImpact) {
              oldImpact.proposedHours -= oldHours;
              oldImpact.hoursDelta -= oldHours;
              oldImpact.shiftsRemoved++;
            }
          }
          if (mod.changes.employeeId) {
            const newImpact = employeeImpacts.get(mod.changes.employeeId);
            if (newImpact) {
              newImpact.proposedHours += newHours;
              newImpact.hoursDelta += newHours;
              newImpact.shiftsAdded++;
            }
          }
        } else if (existingShift.employeeId) {
          const impact = employeeImpacts.get(existingShift.employeeId);
          if (impact) {
            const hoursDiff = newHours - oldHours;
            impact.proposedHours += hoursDiff;
            impact.hoursDelta += hoursDiff;
            impact.shiftsModified++;
          }
        }
      }
    }

    // Calculate impact levels and warnings
    for (const impact of employeeImpacts.values()) {
      if (Math.abs(impact.hoursDelta) > 20) {
        impact.impactLevel = 'major';
        impact.warnings.push('Significant hours change');
      } else if (Math.abs(impact.hoursDelta) > 10) {
        impact.impactLevel = 'moderate';
      } else if (Math.abs(impact.hoursDelta) > 0) {
        impact.impactLevel = 'minor';
      }

      if (impact.proposedHours > 40) {
        impact.warnings.push('Overtime threshold exceeded');
      }
      if (impact.proposedHours > 50) {
        impact.warnings.push('Excessive hours - fatigue risk');
      }
    }

    for (const impact of clientImpacts.values()) {
      if (Math.abs(impact.coverageDelta) > 5) {
        impact.impactLevel = 'major';
      } else if (Math.abs(impact.coverageDelta) > 2) {
        impact.impactLevel = 'moderate';
      } else if (Math.abs(impact.coverageDelta) > 0) {
        impact.impactLevel = 'minor';
      }
    }

    // Build summary
    const affectedEmployees = Array.from(employeeImpacts.values())
      .filter(i => i.impactLevel !== 'none');
    const affectedClients = Array.from(clientImpacts.values())
      .filter(i => i.impactLevel !== 'none');

    const netHoursChange = affectedEmployees.reduce((sum, e) => sum + e.hoursDelta, 0);
    const avgHourlyRate = 25; // Default estimate
    const estimatedPayrollImpact = netHoursChange * avgHourlyRate;

    return {
      employees: affectedEmployees,
      clients: affectedClients,
      summary: {
        totalEmployeesAffected: affectedEmployees.length,
        totalClientsAffected: affectedClients.length,
        netHoursChange,
        estimatedPayrollImpact,
        highImpactCount: affectedEmployees.filter(e => e.impactLevel === 'major').length +
                        affectedClients.filter(c => c.impactLevel === 'major').length,
      },
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async persistMetrics(metrics: GoalMetrics): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: null,
        userId: null,
        action: 'goal_execution_metrics',
        metadata: { severity: metrics.success ? 'info' : 'warning', details: JSON.stringify({ goalId: metrics.goalId, goalType: metrics.goalType, success: metrics.success, attempts: metrics.attempts, durationMs: metrics.durationMs, errorCount: metrics.errorCount, rollbackCount: metrics.rollbackCount, finalConfidence: metrics.finalConfidence, learningsCount: metrics.learnings.length }) },
      });
    } catch (error) {
      log.error('[GoalMetricsService] Failed to persist metrics:', error);
    }
  }

  private async getWorkspacePolicies(workspaceId: string): Promise<any[]> {
    try {
      // workspaceGovernancePolicies merged into workspaces.governancePolicyBlob
      const [ws] = await db.select({ blob: workspaces.governancePolicyBlob })
        .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const blob = ws?.blob as Record<string, any> | null;
      return blob && Object.keys(blob).length > 0 ? [{ workspaceId, ...blob }] : [];
    } catch {
      return [];
    }
  }

  private async getEmployeeData(workspaceId: string): Promise<any[]> {
    try {
      return await db.select()
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));
    } catch {
      return [];
    }
  }

  private async getClientData(workspaceId: string): Promise<any[]> {
    try {
      return await db.select()
        .from(clients)
        .where(eq(clients.workspaceId, workspaceId));
    } catch {
      return [];
    }
  }

  private async getEmployeeWeeklyHours(employeeId: string, workspaceId: string): Promise<number> {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const employeeShifts = await db.select()
        .from(shifts)
        .where(and(
          eq(shifts.employeeId, employeeId),
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, weekStart),
          lte(shifts.endTime, weekEnd)
        ));

      return employeeShifts.reduce((total, shift) => {
        return total + this.calculateShiftHours(shift.startTime, shift.endTime);
      }, 0);
    } catch {
      return 0;
    }
  }

  private async getShiftsByIds(shiftIds: string[]): Promise<any[]> {
    if (shiftIds.length === 0) return [];
    try {
      return await db.select()
        .from(shifts)
        .where(inArray(shifts.id, shiftIds));
    } catch {
      return [];
    }
  }

  private async getShiftById(shiftId: string): Promise<any | null> {
    try {
      const [shift] = await db.select()
        .from(shifts)
        .where(eq(shifts.id, shiftId))
        .limit(1);
      return shift || null;
    } catch {
      return null;
    }
  }

  private calculateShiftHours(startTime: Date | string, endTime: Date | string): number {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }

  private async estimateImpact(
    workspaceId: string,
    proposedChanges: any
  ): Promise<ImpactEstimate> {
    let estimatedCost = 0;
    let estimatedTimeSavedMinutes = 0;
    let affectedEmployeeCount = 0;
    let affectedClientCount = 0;
    let scheduleChangesCount = 0;

    const avgHourlyRate = 25;
    const affectedEmployees = new Set<string>();
    const affectedClients = new Set<string>();

    if (proposedChanges.shiftsToCreate) {
      for (const shift of proposedChanges.shiftsToCreate) {
        const hours = this.calculateShiftHours(shift.startTime, shift.endTime);
        estimatedCost += hours * avgHourlyRate;
        scheduleChangesCount++;
        if (shift.employeeId) affectedEmployees.add(shift.employeeId);
        if (shift.clientId) affectedClients.add(shift.clientId);
      }
    }

    if (proposedChanges.shiftsToDelete) {
      scheduleChangesCount += proposedChanges.shiftsToDelete.length;
    }

    if (proposedChanges.shiftsToModify) {
      scheduleChangesCount += proposedChanges.shiftsToModify.length;
    }

    estimatedTimeSavedMinutes = scheduleChangesCount * 5;

    return {
      estimatedCost,
      estimatedTimeSavedMinutes,
      affectedEmployeeCount: affectedEmployees.size,
      affectedClientCount: affectedClients.size,
      scheduleChangesCount,
    };
  }

  /**
   * Get metrics summary for dashboard
   */
  getMetricsSummary(): {
    totalGoals: number;
    successRate: number;
    avgAttempts: number;
    avgDuration: number;
    topFailurePatterns: { pattern: string; count: number }[];
  } {
    const total = this.completedMetrics.length;
    const successful = this.completedMetrics.filter(m => m.success).length;
    
    const avgAttempts = total > 0 
      ? this.completedMetrics.reduce((sum, m) => sum + m.attempts, 0) / total 
      : 0;
    
    const avgDuration = total > 0 
      ? this.completedMetrics.reduce((sum, m) => sum + m.durationMs, 0) / total 
      : 0;

    return {
      totalGoals: total,
      successRate: total > 0 ? successful / total : 0,
      avgAttempts,
      avgDuration,
      topFailurePatterns: this.getFailurePatterns(),
    };
  }
}

export const goalMetricsService = GoalMetricsService.getInstance();
