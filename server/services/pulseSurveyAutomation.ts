/**
 * Automated Pulse Survey Distribution Service
 * 
 * Automatically determines when employees should receive pulse surveys based on:
 * - Survey template frequency (weekly, biweekly, monthly, quarterly)
 * - Last response date
 * - Employee activation status
 * 
 * Scheduled to run daily via cron job or manual trigger
 */

import { db } from "../db";
import { pulseSurveyTemplates, pulseSurveyResponses, employees } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { subDays, subWeeks, subMonths, differenceInDays } from "date-fns";

interface SurveyDistribution {
  surveyTemplateId: string;
  surveyTitle: string;
  employeeId: string;
  employeeName: string;
  frequency: string;
  lastResponseDate: Date | null;
  daysSinceLastResponse: number;
  shouldReceiveSurvey: boolean;
  reason: string;
}

/**
 * Check if an employee should receive a specific pulse survey
 */
export async function shouldEmployeeReceiveSurvey(
  workspaceId: string,
  employeeId: string,
  surveyTemplateId: string,
  frequency: string
): Promise<{
  shouldReceive: boolean;
  reason: string;
  daysSinceLastResponse: number;
  lastResponseDate: Date | null;
}> {
  // Get employee's last response to this survey
  const lastResponse = await db
    .select()
    .from(pulseSurveyResponses)
    .where(and(
      eq(pulseSurveyResponses.workspaceId, workspaceId),
      eq(pulseSurveyResponses.employeeId, employeeId),
      eq(pulseSurveyResponses.surveyTemplateId, surveyTemplateId)
    ))
    .orderBy(desc(pulseSurveyResponses.submittedAt))
    .limit(1);

  const lastResponseDate = lastResponse[0]?.submittedAt || null;
  const daysSinceLastResponse = lastResponseDate
    ? differenceInDays(new Date(), lastResponseDate)
    : 999; // Never responded

  // Determine if should receive based on frequency
  let shouldReceive = false;
  let reason = "";

  switch (frequency) {
    case 'weekly':
      shouldReceive = daysSinceLastResponse >= 7;
      reason = shouldReceive
        ? `Due for weekly survey (${daysSinceLastResponse} days since last response)`
        : `Too soon - last response ${daysSinceLastResponse} days ago`;
      break;

    case 'biweekly':
      shouldReceive = daysSinceLastResponse >= 14;
      reason = shouldReceive
        ? `Due for bi-weekly survey (${daysSinceLastResponse} days since last response)`
        : `Too soon - last response ${daysSinceLastResponse} days ago`;
      break;

    case 'monthly':
      shouldReceive = daysSinceLastResponse >= 30;
      reason = shouldReceive
        ? `Due for monthly survey (${daysSinceLastResponse} days since last response)`
        : `Too soon - last response ${daysSinceLastResponse} days ago`;
      break;

    case 'quarterly':
      shouldReceive = daysSinceLastResponse >= 90;
      reason = shouldReceive
        ? `Due for quarterly survey (${daysSinceLastResponse} days since last response)`
        : `Too soon - last response ${daysSinceLastResponse} days ago`;
      break;

    case 'annual':
      shouldReceive = daysSinceLastResponse >= 365;
      reason = shouldReceive
        ? `Due for annual survey (${daysSinceLastResponse} days since last response)`
        : `Too soon - last response ${daysSinceLastResponse} days ago`;
      break;

    case 'one_time':
      shouldReceive = !lastResponseDate;
      reason = lastResponseDate
        ? 'Already completed one-time survey'
        : 'One-time survey - never completed';
      break;

    default:
      shouldReceive = false;
      reason = `Unknown frequency: ${frequency}`;
  }

  return {
    shouldReceive,
    reason,
    daysSinceLastResponse,
    lastResponseDate,
  };
}

/**
 * Get all employees who should receive surveys today
 */
export async function getEmployeesDueForSurveys(
  workspaceId: string
): Promise<SurveyDistribution[]> {
  // Get all active survey templates
  const activeSurveys = await db
    .select()
    .from(pulseSurveyTemplates)
    .where(and(
      eq(pulseSurveyTemplates.workspaceId, workspaceId),
      eq(pulseSurveyTemplates.isActive, true)
    ));

  // Get all active employees
  const activeEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));

  const distributions: SurveyDistribution[] = [];

  // Check each employee for each survey
  for (const survey of activeSurveys) {
    for (const employee of activeEmployees) {
      const check = await shouldEmployeeReceiveSurvey(
        workspaceId,
        employee.id,
        survey.id,
        survey.frequency || 'monthly'
      );

      distributions.push({
        surveyTemplateId: survey.id,
        surveyTitle: survey.title,
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        frequency: survey.frequency || 'monthly',
        lastResponseDate: check.lastResponseDate,
        daysSinceLastResponse: check.daysSinceLastResponse,
        shouldReceiveSurvey: check.shouldReceive,
        reason: check.reason,
      });
    }
  }

  return distributions;
}

/**
 * Get summary of survey distribution status
 */
export async function getSurveyDistributionSummary(
  workspaceId: string
): Promise<{
  totalActiveSurveys: number;
  totalActiveEmployees: number;
  employeesDueToday: number;
  upcomingThisWeek: number;
  byFrequency: Record<string, number>;
  distributionList: SurveyDistribution[];
}> {
  const distributions = await getEmployeesDueForSurveys(workspaceId);
  const dueToday = distributions.filter(d => d.shouldReceiveSurvey);

  // Count by frequency
  const byFrequency: Record<string, number> = {};
  dueToday.forEach(d => {
    byFrequency[d.frequency] = (byFrequency[d.frequency] || 0) + 1;
  });

  // Estimate upcoming (employees due within next 7 days)
  const upcomingThisWeek = distributions.filter(d =>
    !d.shouldReceiveSurvey && d.daysSinceLastResponse >= 0 && d.daysSinceLastResponse <= 7
  ).length;

  // Unique surveys and employees
  const uniqueSurveys = new Set(distributions.map(d => d.surveyTemplateId));
  const uniqueEmployees = new Set(distributions.map(d => d.employeeId));

  return {
    totalActiveSurveys: uniqueSurveys.size,
    totalActiveEmployees: uniqueEmployees.size,
    employeesDueToday: dueToday.length,
    upcomingThisWeek,
    byFrequency,
    distributionList: dueToday, // Only return those due today
  };
}

/**
 * Get pending surveys for a specific employee
 */
export async function getEmployeePendingSurveys(
  workspaceId: string,
  employeeId: string
): Promise<SurveyDistribution[]> {
  const distributions = await getEmployeesDueForSurveys(workspaceId);
  return distributions.filter(d =>
    d.employeeId === employeeId && d.shouldReceiveSurvey
  );
}

/**
 * Calculate survey response rate for analytics
 */
export async function calculateSurveyResponseRate(
  workspaceId: string,
  surveyTemplateId: string,
  periodDays: number = 30
): Promise<{
  surveyTitle: string;
  totalEmployees: number;
  responsesReceived: number;
  responseRate: number;
  averageEngagementScore: number;
  averageSentimentScore: number;
}> {
  const periodStart = subDays(new Date(), periodDays);

  // Get survey template
  const survey = await db
    .select()
    .from(pulseSurveyTemplates)
    .where(eq(pulseSurveyTemplates.id, surveyTemplateId))
    .limit(1);

  if (!survey[0]) {
    throw new Error('Survey template not found');
  }

  // Get active employees count
  const activeEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));

  // Get responses in period
  const responses = await db
    .select()
    .from(pulseSurveyResponses)
    .where(and(
      eq(pulseSurveyResponses.workspaceId, workspaceId),
      eq(pulseSurveyResponses.surveyTemplateId, surveyTemplateId),
      gte(pulseSurveyResponses.submittedAt, periodStart)
    ));

  const totalEmployees = activeEmployees.length;
  const responsesReceived = responses.length;
  const responseRate = totalEmployees > 0 ? (responsesReceived / totalEmployees) * 100 : 0;

  // Calculate average scores
  const avgEngagement = responses.length > 0
    ? responses.reduce((sum, r) => sum + parseFloat(r.engagementScore?.toString() || '0'), 0) / responses.length
    : 0;

  const avgSentiment = responses.length > 0
    ? responses.reduce((sum, r) => sum + parseFloat(r.sentimentScore?.toString() || '0'), 0) / responses.length
    : 0;

  return {
    surveyTitle: survey[0].title,
    totalEmployees,
    responsesReceived,
    responseRate: parseFloat(responseRate.toFixed(2)),
    averageEngagementScore: parseFloat(avgEngagement.toFixed(2)),
    averageSentimentScore: parseFloat(avgSentiment.toFixed(2)),
  };
}
