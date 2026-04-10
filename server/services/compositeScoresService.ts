/**
 * Composite Scores Service - Calculates comprehensive employee performance scores
 * Combines performance reviews, ratings, attendance, and productivity metrics
 */

import { db } from "../db";
import { performanceReviews, employerRatings, timeEntries, employees } from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";

export interface CompositeScore {
  employeeId: string;
  employeeName: string;
  compositeScore: number;
  components: {
    reviewScore: number;
    ratingScore: number;
    attendanceScore: number;
    punctualityScore: number;
  };
  scoreBreakdown: string;
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: Date;
}

/**
 * Calculate comprehensive composite score for an employee
 */
export async function calculateCompositeScore(
  workspaceId: string,
  employeeId: string
): Promise<CompositeScore | null> {
  // Get employee
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.id, employeeId),
      eq(employees.workspaceId, workspaceId)
    ));

  if (!employee) return null;

  // 1. Performance Review Score (40% weight)
  let reviewScore = 0;
  const reviews = await db
    .select()
    .from(performanceReviews)
    .where(and(
      eq(performanceReviews.employeeId, employeeId),
      eq(performanceReviews.workspaceId, workspaceId)
    ))
    .orderBy(desc(performanceReviews.reviewType))
    .limit(5);

  if (reviews.length > 0) {
    const avgComposite = reviews.reduce((sum, r) => sum + (parseFloat(r.compositeScore?.toString() || '0')), 0) / reviews.length;
    reviewScore = Math.min(100, Math.round(avgComposite * 10));
  }

  // 2. Employer Rating Score (20% weight)
  let ratingScore = 0;
  const ratings = await db
    .select()
    .from(employerRatings)
    .where(and(
      eq(employerRatings.targetId, employeeId),
      eq(employerRatings.workspaceId, workspaceId)
    ))
    .orderBy(desc(employerRatings.submittedAt))
    .limit(10);

  if (ratings.length > 0) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const avgRating = ratings.reduce((sum, r) => sum + (parseFloat(r.overallRating?.toString() || '0')), 0) / ratings.length;
    ratingScore = Math.min(100, Math.round(avgRating * 20)); // Convert 5-star to 100
  }

  // 3. Attendance Score (20% weight) - based on time entries
  let attendanceScore = 0;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const timeEntries30d = await db
    .select()
    .from(timeEntries)
    .where(and(
      eq(timeEntries.employeeId, employeeId),
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, thirtyDaysAgo)
    ));

  if (timeEntries30d.length > 0) {
    // Assume expected 20 working days per month
    const attendanceRate = Math.min(100, (timeEntries30d.length / 20) * 100);
    attendanceScore = Math.round(attendanceRate);
  }

  // 4. Punctuality Score (20% weight) - based on on-time entries
  let punctualityScore = 0;
  if (timeEntries30d.length > 0) {
    const onTimeEntries = timeEntries30d.filter(te => {
      const clockInHour = new Date(te.clockIn).getHours();
      return clockInHour <= 9; // 9 AM or earlier is on-time
    }).length;
    punctualityScore = Math.round((onTimeEntries / timeEntries30d.length) * 100);
  }

  // Calculate weighted composite score
  const weights = {
    review: 0.40,
    rating: 0.20,
    attendance: 0.20,
    punctuality: 0.20,
  };

  const compositeScore = Math.round(
    (reviewScore * weights.review) +
    (ratingScore * weights.rating) +
    (attendanceScore * weights.attendance) +
    (punctualityScore * weights.punctuality)
  );

  // Determine trend by comparing to previous month
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const previousReviews = await db
    .select()
    .from(performanceReviews)
    .where(and(
      eq(performanceReviews.employeeId, employeeId),
      eq(performanceReviews.workspaceId, workspaceId),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      lte(performanceReviews.reviewType, thirtyDaysAgo),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      gte(performanceReviews.reviewType, sixtyDaysAgo)
    ));

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (previousReviews.length > 0) {
    const previousScore = previousReviews.reduce((sum, r) => sum + (parseFloat(r.compositeScore?.toString() || '0')), 0) / previousReviews.length;
    const previousScalar = Math.round(previousScore * 10);
    if (compositeScore > previousScalar + 5) trend = 'improving';
    else if (compositeScore < previousScalar - 5) trend = 'declining';
  }

  return {
    employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    compositeScore,
    components: {
      reviewScore,
      ratingScore,
      attendanceScore,
      punctualityScore,
    },
    scoreBreakdown: `Review: ${reviewScore}/100 (40%) + Rating: ${ratingScore}/100 (20%) + Attendance: ${attendanceScore}/100 (20%) + Punctuality: ${punctualityScore}/100 (20%)`,
    trend,
    lastUpdated: new Date(),
  };
}

/**
 * Bulk calculate composite scores for all employees in workspace
 */
export async function calculateWorkspaceCompositeScores(
  workspaceId: string
): Promise<CompositeScore[]> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  const scores: CompositeScore[] = [];
  for (const emp of allEmployees) {
    const score = await calculateCompositeScore(workspaceId, emp.id);
    if (score) scores.push(score);
  }

  return scores.sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Get employee performance rank within workspace
 */
export async function getEmployeeRank(
  workspaceId: string,
  employeeId: string
): Promise<{ rank: number; percentile: number; totalEmployees: number } | null> {
  const scores = await calculateWorkspaceCompositeScores(workspaceId);
  const employeeScore = scores.find(s => s.employeeId === employeeId);

  if (!employeeScore) return null;

  const rank = scores.findIndex(s => s.employeeId === employeeId) + 1;
  const percentile = Math.round(((scores.length - rank) / scores.length) * 100);

  return { rank, percentile, totalEmployees: scores.length };
}

export const compositeScoresService = {
  calculateCompositeScore,
  calculateWorkspaceCompositeScores,
  getEmployeeRank,
};
