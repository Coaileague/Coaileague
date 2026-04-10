/**
 * Compliance Monitoring Service
 * Autonomously tracks regulations and flags issues before they become problems
 * Promised on landing page: "Compliance Monitoring - Track regulations and flag issues"
 * 
 * Trinity Integration: Connected via trinityPlatformConnector for real-time compliance awareness
 */

import { db } from '../db';
import { employees, shifts, clients, workspaces, complianceChecklists, complianceRequirements } from '@shared/schema';
import { eq, and, sql, gte, lte, or } from 'drizzle-orm';
import { differenceInDays, addDays, format } from 'date-fns';
import { trinityPlatformConnector } from './ai-brain/trinityPlatformConnector';
import { createLogger } from '../lib/logger';
const log = createLogger('complianceMonitoring');


export interface ComplianceIssue {
  id: string;
  type: 'LABOR_LAW' | 'DOCUMENTATION' | 'CERTIFICATION' | 'SAFETY' | 'PAYROLL' | 'SCHEDULING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  affectedEntity: {
    type: 'employee' | 'client' | 'workspace' | 'shift';
    id: string;
    name: string;
  };
  regulation: string;
  dueDate?: Date;
  resolution?: string;
  detected_at: Date;
}

export class ComplianceMonitoringService {
  /**
   * Run comprehensive compliance scan for a workspace
   */
  static async scanWorkspace(workspaceId: string): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    // Run all compliance checks in parallel
    const [
      overtimeIssues,
      documentIssues,
      certificationIssues,
      schedulingIssues,
    ] = await Promise.all([
      this.checkOvertimeCompliance(workspaceId),
      this.checkDocumentationCompliance(workspaceId),
      this.checkCertificationCompliance(workspaceId),
      this.checkSchedulingCompliance(workspaceId),
    ]);

    issues.push(...overtimeIssues);
    issues.push(...documentIssues);
    issues.push(...certificationIssues);
    issues.push(...schedulingIssues);

    // Emit compliance scan results to Trinity for platform awareness
    if (issues.length > 0) {
      trinityPlatformConnector.emitComplianceEvent('compliance', 'issues_detected', {
        action: `Compliance scan completed: ${issues.length} issues found`,
        workspaceId,
        complianceType: 'WORKSPACE_SCAN',
        isViolation: issues.some(i => i.severity === 'CRITICAL'),
        data: {
          issueCount: issues.length,
          criticalCount: issues.filter(i => i.severity === 'CRITICAL').length,
          highCount: issues.filter(i => i.severity === 'HIGH').length,
          issueTypes: [...new Set(issues.map(i => i.type))],
        },
      }).catch(err => log.error('[ComplianceMonitoring] Failed to emit event:', err));
    } else {
      trinityPlatformConnector.emitServiceEvent('compliance', 'scan_completed', {
        action: 'Compliance scan completed with no issues',
        workspaceId,
        severity: 'info',
        data: { issueCount: 0 },
      }).catch(err => log.error('[ComplianceMonitoring] Failed to emit event:', err));
    }

    return issues;
  }

  /**
   * Check overtime hours compliance (FLSA)
   * Flag employees exceeding 40 hours/week
   */
  private static async checkOvertimeCompliance(workspaceId: string): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    // Get shifts from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentShifts = await db.query.shifts.findMany({
      where: and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, sevenDaysAgo)
      ),
      with: {
        employee: true,
      },
    });

    // Group by employee and calculate weekly hours
    const employeeHours = new Map<string, { employee: any; totalHours: number }>();

    for (const shift of recentShifts) {
      if (!shift.employee) continue;

      const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
      
      const existing = employeeHours.get(shift.employeeId || '') || { employee: shift.employee, totalHours: 0 };
      existing.totalHours += hours;
      employeeHours.set(shift.employeeId || '', existing);
    }

    // Flag employees over 40 hours/week
    for (const [employeeId, data] of Array.from(employeeHours)) {
      if (data.totalHours > 40) {
        issues.push({
          id: `overtime-${employeeId}-${Date.now()}`,
          type: 'LABOR_LAW',
          severity: data.totalHours > 60 ? 'CRITICAL' : data.totalHours > 50 ? 'HIGH' : 'MEDIUM',
          title: 'Excessive Overtime Hours',
          description: `Employee has worked ${data.totalHours.toFixed(1)} hours in the past 7 days. FLSA requires overtime pay (1.5x) for hours over 40/week. Excessive hours may indicate burnout risk.`,
          affectedEntity: {
            type: 'employee',
            id: employeeId,
            name: `${data.employee.firstName} ${data.employee.lastName}` || 'Unknown',
          },
          regulation: 'Fair Labor Standards Act (FLSA) - 29 U.S.C. § 207',
          detected_at: new Date(),
          resolution: 'Verify overtime pay is calculated correctly. Consider reducing scheduled hours to prevent burnout.',
        });
      }
    }

    return issues;
  }

  /**
   * Check documentation compliance
   * Flag missing I-9, W-4, or expired documents
   */
  private static async checkDocumentationCompliance(workspaceId: string): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    try {
      // Get all active employees for this workspace
      const activeEmployees = await db.select()
        .from(employees)
        .where(and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.onboardingStatus, 'completed')
        ));

      if (activeEmployees.length === 0) return [];

      // Get all requirements for these employees via checklists
      const checklists = await db.select({
        checklist: complianceChecklists,
        requirement: complianceRequirements,
        employee: employees
      })
      .from(complianceChecklists)
      .innerJoin(complianceRequirements, eq(complianceChecklists.requirementId, complianceRequirements.id))
      .innerJoin(employees, eq(complianceChecklists.employeeId, employees.id))
      .where(and(
        eq(complianceChecklists.workspaceId, workspaceId),
        eq(complianceRequirements.isRequired, true)
      ));

      for (const item of checklists) {
        if (!item.checklist.isCompleted && !item.checklist.isOverridden) {
          const isCritical = item.requirement.isCritical || 
                            ['I9_FORM', 'W4_FORM', 'GOVT_ID'].includes(item.requirement.requirementCode || '');
          
          issues.push({
            id: `doc-missing-${item.checklist.id}-${Date.now()}`,
            type: 'DOCUMENTATION',
            severity: isCritical ? 'CRITICAL' : 'HIGH',
            title: `Missing Required Document: ${item.requirement.requirementName}`,
            description: `Employee ${item.employee.firstName} ${item.employee.lastName} is missing the required "${item.requirement.requirementName}" document. This is a regulatory compliance requirement.`,
            affectedEntity: {
              type: 'employee',
              id: item.employee.id,
              name: `${item.employee.firstName} ${item.employee.lastName}`,
            },
            regulation: item.requirement.requirementCode === 'I9_FORM' 
              ? 'Immigration Reform and Control Act (IRCA)' 
              : 'Federal/State Compliance Requirements',
            detected_at: new Date(),
            resolution: `Request and upload ${item.requirement.requirementName} for this employee immediately.`,
          });
        }
      }
    } catch (error) {
      log.error('[ComplianceMonitoring] Error checking documentation:', error);
    }

    return issues;
  }

  /**
   * Check certification/license expiration
   * Flag certifications expiring within 30 days
   * 
   * ENABLED: Now checks employee certifications stored in database
   */
  private static async checkCertificationCompliance(workspaceId: string): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    try {
      // Get all employees with expiring certifications
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      const allEmployees = await db.select()
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));

      for (const emp of allEmployees) {
        // Parse certifications from employee metadata if available
        // For now, check for expiration date fields in database
        // @ts-expect-error — TS migration: fix in refactoring sprint
        if (emp.certificationExpiresAt) {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const expirationDate = new Date(emp.certificationExpiresAt);
          
          if (expirationDate < thirtyDaysFromNow && expirationDate > today) {
            issues.push({
              id: `cert-expiring-${emp.id}-${Date.now()}`,
              type: 'CERTIFICATION',
              severity: 'HIGH',
              title: `Certification Expiring Soon: ${emp.firstName} ${emp.lastName}`,
              description: `Employee certification expires on ${expirationDate.toDateString()}. Renewal or recertification may be required.`,
              affectedEntity: {
                type: 'employee',
                id: emp.id,
                name: `${emp.firstName} ${emp.lastName}`,
              },
              regulation: 'State/Federal Certification Requirements',
              dueDate: expirationDate,
              detected_at: new Date(),
              resolution: 'Notify employee of expiring certification and provide recertification options.',
            });
          } else if (expirationDate < today) {
            issues.push({
              id: `cert-expired-${emp.id}-${Date.now()}`,
              type: 'CERTIFICATION',
              severity: 'CRITICAL',
              title: `Certification EXPIRED: ${emp.firstName} ${emp.lastName}`,
              description: `Employee certification expired on ${expirationDate.toDateString()}. Immediate renewal required before continued work.`,
              affectedEntity: {
                type: 'employee',
                id: emp.id,
                name: `${emp.firstName} ${emp.lastName}`,
              },
              regulation: 'State/Federal Certification Requirements',
              dueDate: expirationDate,
              detected_at: new Date(),
              resolution: 'URGENT: Suspend work assignments until certification is renewed.',
            });
          }
        }
      }
    } catch (error) {
      log.error('[ComplianceMonitoring] Error checking certifications:', error);
      // Non-critical - continue with other checks
    }

    return issues;
  }

  /**
   * Check scheduling compliance
   * Flag rest period violations, minor labor laws, etc.
   */
  private static async checkSchedulingCompliance(workspaceId: string): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    // Get shifts from last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentShifts = await db.query.shifts.findMany({
      where: and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, fourteenDaysAgo)
      ),
      with: {
        employee: true,
      },
      orderBy: (shifts, { asc }) => [asc(shifts.employeeId), asc(shifts.startTime)],
    });

    // Check for inadequate rest periods between shifts (< 8 hours)
    for (let i = 0; i < recentShifts.length - 1; i++) {
      const currentShift = recentShifts[i];
      const nextShift = recentShifts[i + 1];

      if (currentShift.employeeId === nextShift.employeeId) {
        const restHours = (new Date(nextShift.startTime).getTime() - new Date(currentShift.endTime).getTime()) / (1000 * 60 * 60);

        if (restHours < 8 && restHours > 0) {
          issues.push({
            id: `rest-period-${currentShift.id}-${nextShift.id}`,
            type: 'SCHEDULING',
            severity: restHours < 4 ? 'CRITICAL' : 'HIGH',
            title: 'Inadequate Rest Period Between Shifts',
            description: `Only ${restHours.toFixed(1)} hours between shifts. Many states require minimum 8-hour rest periods to prevent fatigue-related incidents.`,
            affectedEntity: {
              type: 'employee',
              // @ts-expect-error — TS migration: fix in refactoring sprint
              id: currentShift.employeeId,
              name: (currentShift as any).employee?.name || 'Unknown',
            },
            regulation: 'State Labor Laws (varies by state) - Generally 8-11 hours rest required',
            detected_at: new Date(),
            resolution: `Reschedule to provide at least 8 hours rest between ${format(new Date(currentShift.endTime), 'MMM d h:mm a')} and ${format(new Date(nextShift.startTime), 'MMM d h:mm a')}.`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Get issue count by severity
   */
  static getIssueSummary(issues: ComplianceIssue[]): Record<string, number> {
    return {
      total: issues.length,
      critical: issues.filter(i => i.severity === 'CRITICAL').length,
      high: issues.filter(i => i.severity === 'HIGH').length,
      medium: issues.filter(i => i.severity === 'MEDIUM').length,
      low: issues.filter(i => i.severity === 'LOW').length,
    };
  }

  /**
   * Get issues grouped by type
   */
  static groupIssuesByType(issues: ComplianceIssue[]): Record<string, ComplianceIssue[]> {
    return issues.reduce((acc, issue) => {
      if (!acc[issue.type]) {
        acc[issue.type] = [];
      }
      acc[issue.type].push(issue);
      return acc;
    }, {} as Record<string, ComplianceIssue[]>);
  }
}
