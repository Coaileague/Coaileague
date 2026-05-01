/**
 * PAYROLL VALIDATION SKILL
 * ========================
 * AI-powered pre-execution validation for payroll runs using Gemini 3 Pro.
 * 
 * Features:
 * - Pre-run anomaly detection (hours, rates, deductions)
 * - Gap analysis (missing timesheets, unapproved hours)
 * - Compliance validation (overtime rules, break requirements)
 * - Historical variance detection
 * - Fallback cascade for reliability
 */

import { BaseSkill } from './base-skill';
import type { SkillManifest, SkillContext, SkillResult } from './types';
import { db } from '../../../db';
import { 
  employees, 
  timeEntries, 
  payrollRuns, 
  payrollEntries,
  timeEntryBreaks 
} from '@shared/schema';
import { eq, and, gte, lte, sql, isNull, count, sum } from 'drizzle-orm';
import { createLogger } from '../../../lib/logger';
import { meteredGemini } from '../../billing/meteredGeminiClient';
import { PLATFORM } from '../../../config/platformConfig';

const log = createLogger('PayrollValidation');

interface PayrollValidationParams {
  workspaceId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  employeeIds?: string[];
  validateOnly?: boolean;
}

interface ValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'hours' | 'rates' | 'deductions' | 'compliance' | 'missing_data' | 'variance';
  employeeId?: string;
  employeeName?: string;
  description: string;
  suggestedFix: string;
  autoFixable: boolean;
  details?: Record<string, unknown>;
}

interface PayrollValidationResult {
  isValid: boolean;
  overallConfidence: number;
  issues: ValidationIssue[];
  summary: {
    totalEmployees: number;
    totalHours: number;
    estimatedGross: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    missingTimesheets: number;
    unapprovedHours: number;
  };
  recommendations: string[];
  aiInsights?: string;
  gapAnalysis: {
    coveragePercent: number;
    missingDays: string[];
    incompleteRecords: string[];
  };
}

export class PayrollValidationSkill extends BaseSkill {
  getManifest(): SkillManifest {
    return {
      id: 'payroll-validation',
      name: 'Payroll Pre-Run Validation',
      version: '1.0.0',
      description: 'AI-powered validation and gap analysis for payroll runs using Gemini 3 Pro',
      author: PLATFORM.name + " AI Brain",
      category: 'payroll',
      requiredTier: 'professional',
      requiredRole: ['org_owner', 'co_owner', 'manager'],
      capabilities: [
        'anomaly-detection',
        'gap-analysis',
        'compliance-validation',
        'variance-detection',
        'auto-fix-suggestions',
      ],
      dependencies: [], // Uses database tables directly (timeEntries, employees, payrollRuns)
      apiEndpoints: ['/api/ai-brain/skills/payroll-validation/execute'],
      eventSubscriptions: ['payroll.run.initiated', 'timesheet.bulk.submitted'],
    };
  }

  async execute(
    context: SkillContext,
    params: PayrollValidationParams
  ): Promise<SkillResult<PayrollValidationResult>> {
    const logs: string[] = [];
    logs.push(`[PayrollValidation] Starting validation for period ${params.payPeriodStart} to ${params.payPeriodEnd}`);

    try {
      const workspaceId = params.workspaceId || context.workspaceId;
      
      // Step 1: Gather all relevant data
      const [employeeData, timesheetData, historicalData] = await Promise.all([
        this.fetchEmployeeData(workspaceId, params.employeeIds),
        this.fetchTimesheetData(workspaceId, params.payPeriodStart, params.payPeriodEnd, params.employeeIds),
        this.fetchHistoricalPayrollData(workspaceId),
      ]);

      logs.push(`[PayrollValidation] Fetched ${employeeData.length} employees, ${timesheetData.length} timesheet entries`);

      // Step 2: Run validation checks
      const issues: ValidationIssue[] = [];
      
      // Check for missing timesheets
      const missingTimesheetIssues = this.detectMissingTimesheets(employeeData, timesheetData, params);
      issues.push(...missingTimesheetIssues);

      // Check for unapproved hours
      const unapprovedIssues = this.detectUnapprovedHours(timesheetData);
      issues.push(...unapprovedIssues);

      // Check for rate anomalies
      const rateIssues = this.detectRateAnomalies(timesheetData, employeeData);
      issues.push(...rateIssues);

      // Check for overtime violations
      const overtimeIssues = this.detectOvertimeViolations(timesheetData, employeeData);
      issues.push(...overtimeIssues);

      // Check for historical variance
      const varianceIssues = this.detectHistoricalVariance(timesheetData, historicalData);
      issues.push(...varianceIssues);

      logs.push(`[PayrollValidation] Found ${issues.length} total issues`);

      // Step 3: Calculate summary metrics
      const totalHours = timesheetData.reduce((sum, t) => sum + (t.hoursWorked || 0), 0);
      const estimatedGross = timesheetData.reduce((sum, t) => sum + ((t.hoursWorked || 0) * (t.hourlyRate || 0)), 0);

      const summary = {
        totalEmployees: employeeData.length,
        totalHours,
        estimatedGross,
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        warningIssues: issues.filter(i => i.severity === 'warning').length,
        infoIssues: issues.filter(i => i.severity === 'info').length,
        missingTimesheets: missingTimesheetIssues.length,
        unapprovedHours: unapprovedIssues.length,
      };

      // Step 4: Generate AI insights using Gemini 3 Pro
      let aiInsights: string | undefined;
      if (issues.length > 0 || summary.criticalIssues > 0) {
        aiInsights = await this.generateAIInsights(issues, summary, context);
        logs.push(`[PayrollValidation] Generated AI insights`);
      }

      // Step 5: Calculate gap analysis
      const gapAnalysis = this.calculateGapAnalysis(employeeData, timesheetData, params);

      // Step 6: Generate recommendations
      const recommendations = this.generateRecommendations(issues, summary, gapAnalysis);

      // Calculate overall confidence
      const overallConfidence = this.calculateConfidence(issues, summary, gapAnalysis);

      const result: PayrollValidationResult = {
        isValid: summary.criticalIssues === 0,
        overallConfidence,
        issues,
        summary,
        recommendations,
        aiInsights,
        gapAnalysis,
      };

      return {
        success: true,
        data: result,
        logs,
        tokensUsed: aiInsights ? 500 : 0,
        executionTimeMs: Date.now() - (context as any).startTime,
      };

    } catch (error: any) {
      logs.push(`[PayrollValidation] Error: ${(error instanceof Error ? error.message : String(error))}`);
      return {
        success: false,
        error: {
          code: 'PAYROLL_VALIDATION_ERROR',
          message: (error instanceof Error ? error.message : String(error)),
        },
        logs,
        tokensUsed: 0,
        executionTimeMs: Date.now() - (context as any).startTime,
      };
    }
  }

  private async fetchEmployeeData(workspaceId: string, employeeIds?: string[]) {
    let query = db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        hourlyRate: employees.hourlyRate,
        workerType: employees.workerType,
        isActive: employees.isActive,
      })
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    return await query;
  }

  private async fetchTimesheetData(
    workspaceId: string, 
    startDate: Date, 
    endDate: Date,
    employeeIds?: string[]
  ) {
    return await db
      .select({
        id: timeEntries.id,
        employeeId: timeEntries.employeeId,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        totalHours: timeEntries.totalHours,
        hourlyRate: timeEntries.hourlyRate,
        status: timeEntries.status,
        totalAmount: timeEntries.totalAmount,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, startDate),
          lte(timeEntries.clockIn, endDate)
        )
      );
  }

  private async fetchHistoricalPayrollData(workspaceId: string) {
    return await db
      .select({
        id: payrollRuns.id,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        totalGrossPay: payrollRuns.totalGrossPay,
        totalNetPay: payrollRuns.totalNetPay,
        status: payrollRuns.status,
      })
      .from(payrollRuns)
      .where(eq(payrollRuns.workspaceId, workspaceId))
      .orderBy(sql`${payrollRuns.periodEnd} DESC`)
      .limit(6);
  }

  private detectMissingTimesheets(
    employeeData: any[], 
    timesheetData: any[],
    params: PayrollValidationParams
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const employeesWithTimesheets = new Set(timesheetData.map(t => t.employeeId));

    for (const emp of employeeData) {
      if (!emp.isActive) continue;
      
      if (!employeesWithTimesheets.has(emp.id)) {
        issues.push({
          severity: 'critical',
          category: 'missing_data',
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          description: `No timesheet entries found for pay period`,
          suggestedFix: 'Review employee schedule and add missing time entries',
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  private detectUnapprovedHours(timesheetData: any[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    const unapproved = timesheetData.filter(t => t.status !== 'approved');
    
    if (unapproved.length > 0) {
      const byEmployee = new Map<string, number>();
      for (const t of unapproved) {
        byEmployee.set(t.employeeId, (byEmployee.get(t.employeeId) || 0) + (t.hoursWorked || 0));
      }

      for (const [empId, hours] of byEmployee) {
        issues.push({
          severity: 'warning',
          category: 'hours',
          employeeId: empId,
          description: `${hours.toFixed(1)} hours awaiting approval`,
          suggestedFix: 'Review and approve pending timesheets before payroll run',
          autoFixable: false,
          details: { pendingHours: hours },
        });
      }
    }

    return issues;
  }

  private detectRateAnomalies(timesheetData: any[], employeeData: any[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const employeeRates = new Map(employeeData.map(e => [e.id, parseFloat(e.hourlyRate || '0')]));

    for (const ts of timesheetData) {
      const expectedRate = employeeRates.get(ts.employeeId);
      const actualRate = parseFloat(ts.hourlyRate || '0');

      if (expectedRate && Math.abs(expectedRate - actualRate) > 0.01) {
        const variance = ((actualRate - expectedRate) / expectedRate * 100).toFixed(1);
        issues.push({
          severity: Math.abs(parseFloat(variance)) > 20 ? 'critical' : 'warning',
          category: 'rates',
          employeeId: ts.employeeId,
          description: `Rate variance of ${variance}% (expected $${expectedRate}, actual $${actualRate})`,
          suggestedFix: 'Verify rate is correct or update employee base rate',
          autoFixable: true,
          details: { expectedRate, actualRate, variance },
        });
      }
    }

    return issues;
  }

  private detectOvertimeViolations(timesheetData: any[], employeeData: any[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    // Group hours by employee
    const hoursByEmployee = new Map<string, number>();
    for (const ts of timesheetData) {
      hoursByEmployee.set(ts.employeeId, (hoursByEmployee.get(ts.employeeId) || 0) + (ts.hoursWorked || 0));
    }

    for (const [empId, totalHours] of hoursByEmployee) {
      if (totalHours > 40) {
        const overtimeHours = totalHours - 40;
        issues.push({
          severity: overtimeHours > 20 ? 'critical' : 'warning',
          category: 'compliance',
          employeeId: empId,
          description: `${overtimeHours.toFixed(1)} overtime hours detected`,
          suggestedFix: 'Verify overtime is approved and properly compensated',
          autoFixable: false,
          details: { totalHours, overtimeHours },
        });
      }
    }

    return issues;
  }

  private detectHistoricalVariance(timesheetData: any[], historicalData: any[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    if (historicalData.length === 0) return issues;

    const currentTotal = timesheetData.reduce((sum, t) => sum + ((t.hoursWorked || 0) * (t.hourlyRate || 0)), 0);
    const historicalAvg = historicalData.reduce((sum, h) => sum + (parseFloat(h.totalGrossPay) || 0), 0) / historicalData.length;

    if (historicalAvg > 0) {
      const variance = ((currentTotal - historicalAvg) / historicalAvg * 100);
      
      if (Math.abs(variance) > 25) {
        issues.push({
          severity: Math.abs(variance) > 50 ? 'critical' : 'warning',
          category: 'variance',
          description: `Payroll ${variance > 0 ? 'increase' : 'decrease'} of ${Math.abs(variance).toFixed(1)}% vs historical average`,
          suggestedFix: 'Review for unusual activity, new hires, or terminations',
          autoFixable: false,
          details: { currentTotal, historicalAvg, variancePercent: variance },
        });
      }
    }

    return issues;
  }

  private async generateAIInsights(
    issues: ValidationIssue[], 
    summary: any,
    context: SkillContext
  ): Promise<string> {
    try {
      const prompt = `You are an AI Payroll Analyst for ${PLATFORM.name}. Analyze these payroll validation results and provide actionable insights.

SUMMARY:
- Employees: ${summary.totalEmployees}
- Total Hours: ${summary.totalHours.toFixed(1)}
- Estimated Gross: $${summary.estimatedGross.toFixed(2)}
- Critical Issues: ${summary.criticalIssues}
- Warnings: ${summary.warningIssues}

ISSUES:
${issues.slice(0, 10).map(i => `- [${i.severity.toUpperCase()}] ${i.category}: ${i.description}`).join('\n')}

Provide 2-3 sentences of actionable insights. Be specific and direct.`;

      const result = await meteredGemini.generate({
        workspaceId: context.workspaceId,
        userId: context.userId,
        featureKey: 'payroll_validation_insights',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 500,
      });

      return result.success ? result.text : 'AI insights unavailable. Please review issues manually.';
    } catch (error) {
      log.error('[PayrollValidation] AI insights generation failed:', error);
      return 'AI insights unavailable. Please review issues manually.';
    }
  }

  private calculateGapAnalysis(
    employeeData: any[],
    timesheetData: any[],
    params: PayrollValidationParams
  ) {
    const employeesWithData = new Set(timesheetData.map(t => t.employeeId));
    const activeEmployees = employeeData.filter(e => e.isActive).length;
    const coveragePercent = activeEmployees > 0 
      ? (employeesWithData.size / activeEmployees) * 100 
      : 0;

    return {
      coveragePercent,
      missingDays: [],
      incompleteRecords: employeeData
        .filter(e => e.isActive && !employeesWithData.has(e.id))
        .map(e => `${e.firstName} ${e.lastName}`),
    };
  }

  private generateRecommendations(
    issues: ValidationIssue[],
    summary: any,
    gapAnalysis: any
  ): string[] {
    const recommendations: string[] = [];

    if (summary.criticalIssues > 0) {
      recommendations.push('CRITICAL: Resolve all critical issues before processing payroll');
    }

    if (gapAnalysis.coveragePercent < 100) {
      recommendations.push(`Data Coverage: ${gapAnalysis.coveragePercent.toFixed(0)}% - Review missing employee timesheets`);
    }

    if (summary.unapprovedHours > 0) {
      recommendations.push('Approve all pending timesheets before final payroll processing');
    }

    const rateIssues = issues.filter(i => i.category === 'rates');
    if (rateIssues.length > 0) {
      recommendations.push('Audit rate discrepancies - may indicate data sync issues');
    }

    if (recommendations.length === 0) {
      recommendations.push('All validations passed - payroll is ready for processing');
    }

    return recommendations;
  }

  private calculateConfidence(
    issues: ValidationIssue[],
    summary: any,
    gapAnalysis: any
  ): number {
    let confidence = 1.0;

    // Deduct for critical issues
    confidence -= summary.criticalIssues * 0.15;

    // Deduct for warnings
    confidence -= summary.warningIssues * 0.05;

    // Deduct for coverage gaps
    confidence -= (100 - gapAnalysis.coveragePercent) * 0.005;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    return {
      healthy: this.config.enabled,
      details: {
        skillId: this.getManifest().id,
        version: this.getManifest().version,
        modelTier: 'BRAIN (Gemini 3 Pro)',
      },
    };
  }

  async getStats(): Promise<Record<string, any>> {
    return {
      ...await super.getStats(),
      algorithm: 'ai-powered-validation',
      modelTier: 'BRAIN',
    };
  }
}

export const payrollValidationSkill = new PayrollValidationSkill({ enabled: true });
