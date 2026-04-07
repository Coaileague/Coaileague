/**
 * Trinity Performance Actions
 *
 * Registered actions:
 *   performance.summary  — Summarize officer performance for scheduling decisions
 *   performance.flag     — Surface concerning disciplinary patterns across the workspace
 *   performance.commend  — Suggest commendation candidates based on attendance/feedback
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionHandler, ActionRequest, ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { disciplinaryRecords, performanceReviews, employees } from '@shared/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityPerformanceActions');

export async function registerTrinityPerformanceActions(): Promise<void> {
  // ── performance.summary ─────────────────────────────────────────────────────
  const summaryAction: ActionHandler = {
    actionId: 'performance.summary',
    name: 'Officer Performance Summary',
    category: 'strategic',
    description:
      'Retrieve a structured performance summary for an officer, including active disciplinary records, review history, average ratings, and a scheduling risk flag. Used by Trinity when making scheduling decisions for critical posts.',
    requiredRoles: ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { employeeId, workspaceId: wid } = request.payload || {};
      const workspaceId = wid || request.workspaceId;

      if (!employeeId || !workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'employeeId and workspaceId are required',
          executionTimeMs: Date.now() - start,
        };
      }

      const [disciplinary, reviews, empRows] = await Promise.all([
        db
          .select()
          .from(disciplinaryRecords)
          .where(and(eq(disciplinaryRecords.workspaceId, workspaceId), eq(disciplinaryRecords.employeeId, employeeId)))
          .orderBy(desc(disciplinaryRecords.issuedAt))
          .limit(20),
        db
          .select()
          .from(performanceReviews)
          .where(and(eq(performanceReviews.workspaceId, workspaceId), eq(performanceReviews.employeeId, employeeId)))
          .orderBy(desc(performanceReviews.createdAt))
          .limit(10),
        db
          .select()
          .from(employees)
          .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
          .limit(1),
      ]);

      const activeWarnings = disciplinary.filter(
        (r) => r.status === 'active' && ['written_warning', 'suspension'].includes(r.recordType),
      );

      const avgRating =
        reviews.length ? reviews.reduce((s, r) => s + (r.overallRating || 0), 0) / reviews.length : null;

      const emp = empRows[0];

      const data = {
        employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : employeeId,
        activeWarningCount: activeWarnings.length,
        hasActiveSuspension: activeWarnings.some((r) => r.recordType === 'suspension'),
        hasActiveWrittenWarning: activeWarnings.some((r) => r.recordType === 'written_warning'),
        schedulingRisk: activeWarnings.length > 0 ? 'elevated' : 'normal',
        totalDisciplinaryRecords: disciplinary.length,
        totalReviews: reviews.length,
        avgOverallRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        latestDisciplinary: disciplinary[0] || null,
        latestReview: reviews[0] || null,
      };

      return {
        success: true,
        actionId: request.actionId,
        message: `Performance summary retrieved for ${data.employeeName}. Scheduling risk: ${data.schedulingRisk}.`,
        data,
        executionTimeMs: Date.now() - start,
      };
    },
  };

  // ── performance.flag ────────────────────────────────────────────────────────
  const flagAction: ActionHandler = {
    actionId: 'performance.flag',
    name: 'Flag Performance Concerns',
    category: 'strategic',
    description:
      'Proactively surface officers with concerning disciplinary patterns across the workspace. Returns a ranked list of officers with the most active warnings, recent suspensions, or unacknowledged records. Used by Trinity to alert managers before issues escalate.',
    requiredRoles: ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = request.payload?.workspaceId || request.workspaceId;
      const limit: number = request.payload?.limit ?? 10;

      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: Date.now() - start,
        };
      }

      const recentThreshold = new Date();
      recentThreshold.setDate(recentThreshold.getDate() - 90);

      const activeRecords = await db
        .select({
          employeeId: disciplinaryRecords.employeeId,
          recordType: disciplinaryRecords.recordType,
          issuedAt: disciplinaryRecords.issuedAt,
          status: disciplinaryRecords.status,
          acknowledgedAt: disciplinaryRecords.acknowledgedAt,
        })
        .from(disciplinaryRecords)
        .where(
          and(
            eq(disciplinaryRecords.workspaceId, workspaceId),
            eq(disciplinaryRecords.status, 'active'),
            gte(disciplinaryRecords.issuedAt, recentThreshold),
          ),
        )
        .orderBy(desc(disciplinaryRecords.issuedAt))
        .limit(200);

      const empMap = new Map<
        string,
        { count: number; hasSuspension: boolean; unacknowledged: number; recordTypes: string[] }
      >();

      for (const r of activeRecords) {
        const existing = empMap.get(r.employeeId) || {
          count: 0,
          hasSuspension: false,
          unacknowledged: 0,
          recordTypes: [],
        };
        existing.count += 1;
        if (r.recordType === 'suspension') existing.hasSuspension = true;
        if (!r.acknowledgedAt) existing.unacknowledged += 1;
        if (!existing.recordTypes.includes(r.recordType)) existing.recordTypes.push(r.recordType);
        empMap.set(r.employeeId, existing);
      }

      const employeeIds = Array.from(empMap.keys()).slice(0, limit * 2);
      const empRecords =
        employeeIds.length > 0
          ? await db
              .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
              .from(employees)
              .where(eq(employees.workspaceId, workspaceId))
              .limit(100)
          : [];

      const empNameMap = new Map(empRecords.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

      const flagged = Array.from(empMap.entries())
        .sort((a, b) => {
          const scoreA = a[1].count + (a[1].hasSuspension ? 5 : 0) + a[1].unacknowledged;
          const scoreB = b[1].count + (b[1].hasSuspension ? 5 : 0) + b[1].unacknowledged;
          return scoreB - scoreA;
        })
        .slice(0, limit)
        .map(([empId, info]) => ({
          employeeId: empId,
          employeeName: empNameMap.get(empId) || empId,
          activeRecordCount: info.count,
          hasSuspension: info.hasSuspension,
          unacknowledgedCount: info.unacknowledged,
          recordTypes: info.recordTypes,
          riskLevel: info.hasSuspension ? 'high' : info.count >= 3 ? 'medium' : 'low',
        }));

      const data = {
        workspaceId,
        scanDate: new Date().toISOString(),
        flaggedOfficers: flagged,
        totalFlagged: flagged.length,
        recommendation:
          flagged.length > 0
            ? `${flagged.length} officer(s) have active disciplinary concerns. Review before assigning to critical posts.`
            : 'No active disciplinary concerns detected in the workspace.',
      };

      return {
        success: true,
        actionId: request.actionId,
        message: data.recommendation,
        data,
        executionTimeMs: Date.now() - start,
      };
    },
  };

  // ── performance.commend ─────────────────────────────────────────────────────
  const commendAction: ActionHandler = {
    actionId: 'performance.commend',
    name: 'Commendation Candidates',
    category: 'strategic',
    description:
      'Identify top-performing officers who are strong candidates for commendations. Analyzes recent performance review ratings, attendance patterns, and absence of disciplinary records. Helps managers recognize excellence proactively.',
    requiredRoles: ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = request.payload?.workspaceId || request.workspaceId;
      const limit: number = request.payload?.limit ?? 5;

      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: Date.now() - start,
        };
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const recentReviews = await db
        .select({
          employeeId: performanceReviews.employeeId,
          overallRating: performanceReviews.overallRating,
          attendanceRating: performanceReviews.attendanceRating,
          createdAt: performanceReviews.createdAt,
        })
        .from(performanceReviews)
        .where(
          and(
            eq(performanceReviews.workspaceId, workspaceId),
            gte(performanceReviews.createdAt, ninetyDaysAgo),
          ),
        )
        .orderBy(desc(performanceReviews.createdAt))
        .limit(500);

      const activeWarningEmpIds = new Set(
        (
          await db
            .select({ employeeId: disciplinaryRecords.employeeId })
            .from(disciplinaryRecords)
            .where(and(eq(disciplinaryRecords.workspaceId, workspaceId), eq(disciplinaryRecords.status, 'active')))
        ).map((r) => r.employeeId),
      );

      const empRatings = new Map<
        string,
        { total: number; count: number; attendanceTotal: number; attendanceCount: number }
      >();

      for (const r of recentReviews) {
        const existing = empRatings.get(r.employeeId) || {
          total: 0,
          count: 0,
          attendanceTotal: 0,
          attendanceCount: 0,
        };
        if (r.overallRating) {
          existing.total += r.overallRating;
          existing.count += 1;
        }
        if (r.attendanceRating) {
          existing.attendanceTotal += r.attendanceRating;
          existing.attendanceCount += 1;
        }
        empRatings.set(r.employeeId, existing);
      }

      const candidates = Array.from(empRatings.entries())
        .filter(([empId]) => !activeWarningEmpIds.has(empId))
        .map(([empId, info]) => ({
          employeeId: empId,
          avgRating: info.count > 0 ? info.total / info.count : 0,
          avgAttendance: info.attendanceCount > 0 ? info.attendanceTotal / info.attendanceCount : 0,
          reviewCount: info.count,
        }))
        .filter((c) => c.avgRating >= 4.0)
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, limit);

      const empIds = candidates.map((c) => c.employeeId);
      const empRecords =
        empIds.length > 0
          ? await db
              .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
              .from(employees)
              .where(eq(employees.workspaceId, workspaceId))
              .limit(100)
          : [];

      const empNameMap = new Map(empRecords.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

      const commendationCandidates = candidates.map((c) => ({
        employeeId: c.employeeId,
        employeeName: empNameMap.get(c.employeeId) || c.employeeId,
        avgOverallRating: Math.round(c.avgRating * 10) / 10,
        avgAttendanceRating: Math.round(c.avgAttendance * 10) / 10,
        reviewsInPeriod: c.reviewCount,
        noActiveWarnings: true,
        commendationType: c.avgRating >= 4.5 ? 'commendation' : 'recognition',
      }));

      const message =
        commendationCandidates.length > 0
          ? `${commendationCandidates.length} officer(s) qualify for commendation based on recent performance.`
          : 'No commendation candidates found in the last 90 days. Consider scheduling more performance reviews.';

      return {
        success: true,
        actionId: request.actionId,
        message,
        data: {
          workspaceId,
          analysisDate: new Date().toISOString(),
          commendationCandidates,
          totalCandidates: commendationCandidates.length,
          message,
        },
        executionTimeMs: Date.now() - start,
      };
    },
  };

  helpaiOrchestrator.registerAction(summaryAction);
  helpaiOrchestrator.registerAction(flagAction);
  helpaiOrchestrator.registerAction(commendAction);

  log.info('[Trinity] Performance actions registered: performance.summary, performance.flag, performance.commend');
}
