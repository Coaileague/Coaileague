/**
 * Performance Review Reminder System
 * 
 * Automatically detects employees due for performance reviews based on:
 * - Review type (annual, quarterly, 90-day, etc.)
 * - Last review date
 * - Employment start date
 * 
 * Sends notifications to managers when reviews are due
 */

import { db } from "../db";
import { performanceReviews, employees } from "@shared/schema";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { differenceInDays, addMonths, addDays } from "date-fns";

interface ReviewReminderItem {
  employeeId: string;
  employeeName: string;
  reviewType: 'annual' | 'quarterly' | 'probation' | '90_day' | 'promotion' | 'pip';
  dueDate: Date;
  daysOverdue: number;
  lastReviewDate: Date | null;
  reminderPriority: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Check if an employee is due for a performance review
 */
export async function checkEmployeeReviewDue(
  workspaceId: string,
  employeeId: string
): Promise<ReviewReminderItem | null> {
  const employee = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.id, employeeId),
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ))
    .limit(1);

  if (!employee[0]) {
    return null;
  }

  // Get last performance review
  const lastReview = await db
    .select()
    .from(performanceReviews)
    .where(and(
      eq(performanceReviews.employeeId, employeeId),
      eq(performanceReviews.workspaceId, workspaceId),
      eq(performanceReviews.status, 'completed')
    ))
    .orderBy(desc(performanceReviews.createdAt))
    .limit(1);

  const employeeStartDate = employee[0].createdAt || new Date();
  const lastReviewDate = lastReview[0]?.createdAt || null;
  const now = new Date();

  // Determine review type and due date
  let reviewType: ReviewReminderItem['reviewType'] = 'annual';
  let dueDate: Date;

  if (!lastReviewDate) {
    // New employee - check for probation/90-day review
    const daysSinceHire = differenceInDays(now, employeeStartDate);
    
    if (daysSinceHire >= 90) {
      reviewType = '90_day';
      dueDate = addDays(employeeStartDate, 90);
    } else if (daysSinceHire >= 60) {
      // Coming up for 90-day review
      reviewType = '90_day';
      dueDate = addDays(employeeStartDate, 90);
    } else {
      // Too early for review
      return null;
    }
  } else {
    // Existing employee - check annual review cycle
    const daysSinceLastReview = differenceInDays(now, lastReviewDate);
    
    if (daysSinceLastReview >= 365) {
      reviewType = 'annual';
      dueDate = addMonths(lastReviewDate, 12);
    } else if (daysSinceLastReview >= 90) {
      // Could be due for quarterly review
      reviewType = 'quarterly';
      dueDate = addMonths(lastReviewDate, 3);
    } else {
      // Not due yet
      return null;
    }
  }

  const daysOverdue = differenceInDays(now, dueDate);

  // Determine priority based on how overdue
  let reminderPriority: ReviewReminderItem['reminderPriority'];
  if (daysOverdue > 60) {
    reminderPriority = 'urgent';
  } else if (daysOverdue > 30) {
    reminderPriority = 'high';
  } else if (daysOverdue > 0) {
    reminderPriority = 'medium';
  } else {
    reminderPriority = 'low';
  }

  return {
    employeeId: employee[0].id,
    employeeName: `${employee[0].firstName} ${employee[0].lastName}`,
    reviewType,
    dueDate,
    daysOverdue,
    lastReviewDate,
    reminderPriority,
  };
}

/**
 * Get all overdue performance reviews for a workspace
 */
export async function getOverdueReviews(
  workspaceId: string
): Promise<ReviewReminderItem[]> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));

  const overdueReviews: ReviewReminderItem[] = [];

  for (const employee of allEmployees) {
    const reminder = await checkEmployeeReviewDue(workspaceId, employee.id);
    if (reminder && reminder.daysOverdue > 0) {
      overdueReviews.push(reminder);
    }
  }

  // Sort by priority (urgent first) and days overdue
  return overdueReviews.sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityOrder[a.reminderPriority] - priorityOrder[b.reminderPriority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.daysOverdue - a.daysOverdue;
  });
}

/**
 * Get upcoming performance reviews (due within next 30 days)
 */
export async function getUpcomingReviews(
  workspaceId: string,
  daysAhead: number = 30
): Promise<ReviewReminderItem[]> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));

  const upcomingReviews: ReviewReminderItem[] = [];

  for (const employee of allEmployees) {
    const reminder = await checkEmployeeReviewDue(workspaceId, employee.id);
    if (reminder && reminder.daysOverdue <= 0 && reminder.daysOverdue >= -daysAhead) {
      upcomingReviews.push(reminder);
    }
  }

  // Sort by due date (soonest first)
  return upcomingReviews.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/**
 * Generate reminder summary for dashboard
 */
export async function getReviewReminderSummary(
  workspaceId: string
): Promise<{
  totalOverdue: number;
  urgentOverdue: number;
  upcomingWithin30Days: number;
  overdueReviews: ReviewReminderItem[];
  upcomingReviews: ReviewReminderItem[];
}> {
  const overdueReviews = await getOverdueReviews(workspaceId);
  const upcomingReviews = await getUpcomingReviews(workspaceId, 30);

  return {
    totalOverdue: overdueReviews.length,
    urgentOverdue: overdueReviews.filter(r => r.reminderPriority === 'urgent').length,
    upcomingWithin30Days: upcomingReviews.length,
    overdueReviews: overdueReviews.slice(0, 10), // Top 10 most urgent
    upcomingReviews: upcomingReviews.slice(0, 10), // Next 10 upcoming
  };
}
