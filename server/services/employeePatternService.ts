/**
 * Employee Pattern Service - Retrieve employee scheduling patterns for AI
 */

import { db } from "../db";
import { shifts, employees, timeEntries } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { platformEventBus } from './platformEventBus';

export interface EmployeePattern {
  employeeId: string;
  employeeName: string;
  preferredDays: string[]; // ['Mon', 'Tue', etc]
  preferredHours: {
    startHour: number;
    endHour: number;
  };
  averageHoursPerWeek: number;
  shiftHistory: {
    totalShifts: number;
    completedShifts: number;
    cancelledShifts: number;
    completionRate: number;
  };
  availabilityPattern: 'consistent' | 'variable' | 'limited';
  skillTags: string[];
}

/**
 * Get employee scheduling pattern
 */
export async function getEmployeePattern(
  workspaceId: string,
  employeeId: string
): Promise<EmployeePattern | null> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.id, employeeId),
      eq(employees.workspaceId, workspaceId)
    ));

  if (!employee) return null;

  // Get last 90 days of shifts
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const employeeShifts = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.employeeId, employeeId),
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, ninetyDaysAgo)
    ));

  // Analyze patterns
  const dayFrequency: Record<string, number> = {};
  const hourlyDistribution: number[] = Array(24).fill(0);
  let totalMinutes = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  for (const shift of employeeShifts) {
    const day = new Date(shift.startTime).toLocaleDateString('en-US', { weekday: 'short' });
    dayFrequency[day] = (dayFrequency[day] || 0) + 1;

    const hour = new Date(shift.startTime).getHours();
    hourlyDistribution[hour]++;

    if (shift.endTime) {
      totalMinutes += (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60);
    }

    if (shift.status === 'completed') completedCount++;
    if (shift.status === 'cancelled') cancelledCount++;
  }

  // Determine preferred days (top 3)
  const preferredDays = Object.entries(dayFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => day);

  // Determine preferred hours (busiest hours)
  const busyHours = hourlyDistribution
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map(h => h.hour);

  const startHour = Math.min(...busyHours, 24);
  const endHour = Math.max(...busyHours, 0);

  // Calculate averages
  const averageHoursPerWeek = Math.round((totalMinutes / 60) / 12.86); // 90 days / 7 = ~12.86 weeks
  const completionRate = employeeShifts.length > 0 
    ? Math.round((completedCount / employeeShifts.length) * 100)
    : 0;

  // Determine availability pattern
  let availabilityPattern: 'consistent' | 'variable' | 'limited' = 'consistent';
  if (averageHoursPerWeek < 20) availabilityPattern = 'limited';
  if (dayFrequency && Object.keys(dayFrequency).length > 5) availabilityPattern = 'variable';

  return {
    employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    preferredDays: preferredDays.length > 0 ? preferredDays : ['Mon', 'Tue', 'Wed'],
    preferredHours: {
      startHour: startHour > 0 ? startHour : 8,
      endHour: endHour > 0 ? endHour : 17,
    },
    averageHoursPerWeek,
    shiftHistory: {
      totalShifts: employeeShifts.length,
      completedShifts: completedCount,
      cancelledShifts: cancelledCount,
      completionRate,
    },
    availabilityPattern,
    skillTags: employee.role ? [employee.role] : [],
  };
}

/**
 * Get patterns for all employees in workspace
 */
export async function getWorkspacePatterns(
  workspaceId: string
): Promise<EmployeePattern[]> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

  const patterns: EmployeePattern[] = [];
  for (const emp of allEmployees) {
    const pattern = await getEmployeePattern(workspaceId, emp.id);
    if (pattern) patterns.push(pattern);
  }

  platformEventBus.publish({
    type: 'employee_patterns_analyzed',
    category: 'workforce',
    title: 'Employee Pattern Analysis Completed',
    description: `Analyzed scheduling patterns for ${patterns.length} employee(s) in workspace`,
    workspaceId,
    metadata: { employeeCount: patterns.length },
  });

  return patterns;
}

/**
 * Find employees with similar availability patterns
 */
export async function findSimilarPatterns(
  workspaceId: string,
  employeeId: string
): Promise<EmployeePattern[]> {
  const sourcePattern = await getEmployeePattern(workspaceId, employeeId);
  if (!sourcePattern) return [];

  const allPatterns = await getWorkspacePatterns(workspaceId);

  return allPatterns
    .filter(p => p.employeeId !== employeeId)
    .filter(p => {
      // Match if they share at least 2 preferred days
      const sharedDays = sourcePattern.preferredDays.filter(d => p.preferredDays.includes(d));
      const hourOverlap = !(sourcePattern.preferredHours.endHour < p.preferredHours.startHour || 
                           sourcePattern.preferredHours.startHour > p.preferredHours.endHour);
      return sharedDays.length >= 2 || hourOverlap;
    })
    .slice(0, 5);
}

export const employeePatternService = {
  getEmployeePattern,
  getWorkspacePatterns,
  findSimilarPatterns,
};
