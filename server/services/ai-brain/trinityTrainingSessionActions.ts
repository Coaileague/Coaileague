/**
 * TRINITY TRAINING SESSION ACTIONS
 * ================================
 * AI-powered training and TCOLE compliance actions for the Trinity co-pilot.
 * Enables Trinity to suggest training sessions, query compliance status,
 * and report officer-specific TCOLE hour totals.
 *
 * Actions registered:
 *   training.schedule   — Suggest sessions based on compliance gaps
 *   training.compliance — TCOLE compliance status summary for workspace
 *   training.hours      — Officer-specific hour totals and year-end projections
 */

import { db } from '../../db';
import { 
  trainingSessions, 
  trainingAttendance, 
  employees 
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm';
import { helpaiOrchestrator, type ActionRequest, type ActionResult, type ActionHandler } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityTrainingSessionActions');

const createResult = (
  actionId: string, success: boolean, message: string,
  data: any, start: number
): ActionResult => ({
  actionId, success, message, data,
  executionTimeMs: Date.now() - start,
});

function mkAction(id: string, name: string, description: string, fn: (req: ActionRequest) => Promise<ActionResult>): ActionHandler {
  return {
    actionId: id,
    name: name,
    category: 'training',
    description: description,
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: fn,
  };
}

// ─── training.schedule ────────────────────────────────────────────────────────

async function handleTrainingSchedule(req: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const workspaceId = req.workspaceId;

  try {
    // 1. Find officers with TCOLE gaps
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    const complianceData = await db
      .select({
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        hours: sql<number>`COALESCE(SUM(${trainingAttendance.tcoleHoursAwarded}), 0)`,
      })
      .from(employees)
      .leftJoin(
        trainingAttendance, 
        and(
          eq(trainingAttendance.employeeId, employees.id),
          eq(trainingAttendance.status, 'attended'),
          gte(trainingAttendance.checkedInAt, startOfYear),
          lte(trainingAttendance.checkedInAt, endOfYear)
        )
      )
      .where(and(eq(employees.workspaceId, workspaceId!), eq(employees.isActive, true)))
      .groupBy(employees.id, employees.firstName, employees.lastName);

    const gapOfficers = complianceData.filter(o => Number(o.hours) < 40);
    
    // 2. Find upcoming sessions
    const upcomingSessions = await db
      .select()
      .from(trainingSessions)
      .where(and(
        eq(trainingSessions.workspaceId, workspaceId!),
        eq(trainingSessions.status, 'scheduled'),
        gte(trainingSessions.sessionDate, new Date())
      ))
      .orderBy(asc(trainingSessions.sessionDate))
      .limit(5);

    // 3. Generate suggestions
    const suggestions = gapOfficers.map(officer => {
      const needed = 40 - Number(officer.hours);
      const relevantSessions = upcomingSessions.filter(s => Number(s.tcoleHoursCredit) > 0);
      
      return {
        officerId: officer.employeeId,
        officerName: `${officer.firstName} ${officer.lastName}`,
        currentHours: Number(officer.hours),
        hoursNeeded: needed,
        suggestedSessions: relevantSessions.map(s => ({
          sessionId: s.id,
          title: s.title,
          date: s.sessionDate,
          credits: Number(s.tcoleHoursCredit)
        }))
      };
    });

    return createResult('training.schedule', true, `Generated training schedule suggestions for ${gapOfficers.length} officers with hour gaps`, {
      gapCount: gapOfficers.length,
      suggestions,
      availableSessions: upcomingSessions.length
    }, start);
  } catch (error: any) {
    return createResult('training.schedule', false, `Training schedule action failed: ${error.message}`, null, start);
  }
}

// ─── training.compliance ──────────────────────────────────────────────────────

async function handleTrainingCompliance(req: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const workspaceId = req.workspaceId;

  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    const complianceData = await db
      .select({
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        hours: sql<number>`COALESCE(SUM(${trainingAttendance.tcoleHoursAwarded}), 0)`,
      })
      .from(employees)
      .leftJoin(
        trainingAttendance, 
        and(
          eq(trainingAttendance.employeeId, employees.id),
          eq(trainingAttendance.status, 'attended'),
          gte(trainingAttendance.checkedInAt, startOfYear),
          lte(trainingAttendance.checkedInAt, endOfYear)
        )
      )
      .where(and(eq(employees.workspaceId, workspaceId!), eq(employees.isActive, true)))
      .groupBy(employees.id, employees.firstName, employees.lastName);

    const totalOfficers = complianceData.length;
    const compliantCount = complianceData.filter(o => Number(o.hours) >= 40).length;
    const nonCompliant = complianceData.filter(o => Number(o.hours) < 40).sort((a, b) => Number(a.hours) - Number(b.hours));

    const summary = {
      totalOfficers,
      compliantCount,
      nonCompliantCount: totalOfficers - compliantCount,
      complianceRate: totalOfficers > 0 ? (compliantCount / totalOfficers) * 100 : 100,
      urgentAttentionNeeded: nonCompliant.filter(o => Number(o.hours) < 10).length,
      topNonCompliant: nonCompliant.slice(0, 5)
    };

    return createResult('training.compliance', true, `TCOLE compliance summary: ${summary.complianceRate.toFixed(1)}% compliant`, {
      year: currentYear,
      summary,
      fullRoster: complianceData.map(o => ({
        ...o,
        status: Number(o.hours) >= 40 ? 'compliant' : 'at_risk'
      }))
    }, start);
  } catch (error: any) {
    return createResult('training.compliance', false, `Training compliance summary failed: ${error.message}`, null, start);
  }
}

// ─── training.hours ───────────────────────────────────────────────────────────

async function handleTrainingHours(req: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const workspaceId = req.workspaceId;
  const employeeId = req.payload?.employeeId;

  if (!employeeId) {
    return createResult('training.hours', false, 'employeeId is required for training.hours', null, start);
  }

  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    // 1. Get employee details
    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId!))
    });

    if (!employee) {
      return createResult('training.hours', false, `Employee ${employeeId} not found`, null, start);
    }

    // 2. Get attended sessions and hours
    const attendance = await db
      .select({
        sessionId: trainingAttendance.sessionId,
        sessionTitle: trainingSessions.title,
        date: trainingAttendance.checkedInAt,
        hours: trainingAttendance.tcoleHoursAwarded,
      })
      .from(trainingAttendance)
      .innerJoin(trainingSessions, eq(trainingAttendance.sessionId, trainingSessions.id))
      .where(and(
        eq(trainingAttendance.employeeId, employeeId),
        eq(trainingAttendance.status, 'attended'),
        gte(trainingAttendance.checkedInAt, startOfYear),
        lte(trainingAttendance.checkedInAt, endOfYear)
      ))
      .orderBy(desc(trainingAttendance.checkedInAt));

    const totalHours = attendance.reduce((sum, a) => sum + Number(a.hours), 0);
    
    // 3. Projections
    const daysPassed = Math.floor((Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const hoursPerDay = daysPassed > 0 ? totalHours / daysPassed : 0;
    const daysRemaining = Math.floor((endOfYear.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const projectedAdditionalHours = hoursPerDay * daysRemaining;
    const yearEndProjection = totalHours + projectedAdditionalHours;

    return createResult('training.hours', true, `TCOLE hour report for ${employee.firstName} ${employee.lastName}`, {
      employeeName: `${employee.firstName} ${employee.lastName}`,
      currentHours: totalHours,
      targetHours: 40,
      remainingHours: Math.max(0, 40 - totalHours),
      isCompliant: totalHours >= 40,
      yearEndProjection: Number(yearEndProjection.toFixed(2)),
      projectionStatus: yearEndProjection >= 40 ? 'on_track' : 'behind_schedule',
      recentSessions: attendance.slice(0, 5)
    }, start);
  } catch (error: any) {
    return createResult('training.hours', false, `Training hours report failed: ${error.message}`, null, start);
  }
}

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

export function registerTrainingSessionActions(): void {
  helpaiOrchestrator.registerAction(mkAction(
    'training.schedule', 
    'Suggest Training Schedule', 
    'Suggests training sessions based on officer compliance gaps', 
    handleTrainingSchedule
  ));
  helpaiOrchestrator.registerAction(mkAction(
    'training.compliance', 
    'Workspace TCOLE Compliance', 
    'TCOLE compliance status summary for entire workspace roster', 
    handleTrainingCompliance
  ));
  helpaiOrchestrator.registerAction(mkAction(
    'training.hours', 
    'Officer TCOLE Hours', 
    'Detailed hour totals and year-end projections for a specific officer', 
    handleTrainingHours
  ));
  log.info('[TrinityTrainingSessionActions] Registered: training.schedule, training.compliance, training.hours');
}
