/**
 * Compliance Monitoring Service
 * Autonomously tracks regulations and flags issues before they become problems
 * Promised on landing page: "Compliance Monitoring - Track regulations and flag issues"
 */

import { db } from '../db';
import { employees, shifts, clients, workspaces } from '@shared/schema';
import { eq, and, sql, gte, lte, or } from 'drizzle-orm';
import { differenceInDays, addDays, format } from 'date-fns';

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
      
      const existing = employeeHours.get(shift.employeeId) || { employee: shift.employee, totalHours: 0 };
      existing.totalHours += hours;
      employeeHours.set(shift.employeeId, existing);
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
   * 
   * NOTE: Document checking currently disabled until file cabinet integration is complete.
   * This prevents false positives flagging all employees as missing documents.
   */
  private static async checkDocumentationCompliance(workspaceId: string): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    // FUTURE: Integrate with file cabinet/document management system
    // For now, skip document checks to avoid false positives
    // This will be enabled once we have proper document tracking in place

    return issues;
  }

  /**
   * Check certification/license expiration
   * Flag certifications expiring within 30 days
   * 
   * NOTE: Certification tracking currently disabled until employee metadata system is enhanced.
   * This prevents false positives. Will be enabled when certification data is available.
   */
  private static async checkCertificationCompliance(workspaceId: string): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    // FUTURE: Add certification tracking to employee schema or separate table
    // For now, skip to avoid false positives

    return issues;

    /* TEMPLATE for when certifications are available:
    const thirtyDaysFromNow = addDays(new Date(), 30);
    const employeesWithCerts = await db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, workspaceId),
        sql`certifications IS NOT NULL`
      ),
    });

    for (const employee of employeesWithCerts) {
      const certs = employee.certifications as any[];
      if (!Array.isArray(certs)) continue;

      for (const cert of certs) {
        if (cert.expiryDate) {
          const expiryDate = new Date(cert.expiryDate);
          const daysUntilExpiry = differenceInDays(expiryDate, new Date());

          if (daysUntilExpiry <= 30 && daysUntilExpiry >= 0) {
            issues.push({
              id: `cert-expiring-${employee.id}-${cert.name}-${Date.now()}`,
              type: 'CERTIFICATION',
              severity: daysUntilExpiry <= 7 ? 'CRITICAL' : daysUntilExpiry <= 14 ? 'HIGH' : 'MEDIUM',
              title: `Certification Expiring Soon: ${cert.name}`,
              description: `${cert.name} expires in ${daysUntilExpiry} days. Employee may not be eligible for certain shifts after expiration.`,
              affectedEntity: {
                type: 'employee',
                id: employee.id,
                name: `${employee.firstName} ${employee.lastName}` || 'Unknown',
              },
              regulation: cert.isRequired ? 'Required certification per job requirements' : 'Optional certification',
              dueDate: expiryDate,
              detected_at: new Date(),
              resolution: `Contact ${employee.name} to renew ${cert.name} before ${format(expiryDate, 'MMM d, yyyy')}.`,
            });
          } else if (daysUntilExpiry < 0) {
            issues.push({
              id: `cert-expired-${employee.id}-${cert.name}-${Date.now()}`,
              type: 'CERTIFICATION',
              severity: 'CRITICAL',
              title: `Expired Certification: ${cert.name}`,
              description: `${cert.name} expired ${Math.abs(daysUntilExpiry)} days ago. Employee may not be eligible for shifts requiring this certification.`,
              affectedEntity: {
                type: 'employee',
                id: employee.id,
                name: `${employee.firstName} ${employee.lastName}` || 'Unknown',
              },
              regulation: cert.isRequired ? 'Required certification per job requirements' : 'Optional certification',
              dueDate: expiryDate,
              detected_at: new Date(),
              resolution: `Remove ${employee.name} from shifts requiring ${cert.name}. Do not schedule until renewed.`,
            });
          }
        }
      }
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
              id: currentShift.employeeId,
              name: currentShift.employee?.name || 'Unknown',
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
