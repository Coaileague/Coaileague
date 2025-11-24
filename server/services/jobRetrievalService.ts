/**
 * Job Retrieval Service - Get job/role information for AI scheduling
 */

import { db } from "../db";
import { employees } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface JobInfo {
  jobId: string;
  jobTitle: string;
  requiredSkills: string[];
  averageHoursPerWeek: number;
  qualificationLevel: 'entry' | 'intermediate' | 'senior' | 'expert';
  employeeCount: number;
}

/**
 * Get job/role information by role name
 */
export async function getJobByRole(
  workspaceId: string,
  role: string
): Promise<JobInfo | null> {
  const employeesWithRole = await db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  const matchingEmployees = employeesWithRole.filter(e => e.role === role);
  
  if (matchingEmployees.length === 0) return null;

  // Calculate average hours
  const avgHours = matchingEmployees.reduce((sum, e) => sum + (parseFloat(e.hourlyRate?.toString() || '0')), 0) / matchingEmployees.length;

  // Determine qualification level based on number of employees with this role
  let qualLevel: 'entry' | 'intermediate' | 'senior' | 'expert' = 'intermediate';
  if (matchingEmployees.length === 1) qualLevel = 'expert';
  if (matchingEmployees.length > 5) qualLevel = 'entry';

  return {
    jobId: `job-${role.toLowerCase().replace(/\s+/g, '-')}`,
    jobTitle: role,
    requiredSkills: [role],
    averageHoursPerWeek: Math.round(avgHours),
    qualificationLevel: qualLevel,
    employeeCount: matchingEmployees.length,
  };
}

/**
 * Get all unique jobs/roles in workspace
 */
export async function getWorkspaceJobs(workspaceId: string): Promise<JobInfo[]> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  const uniqueRoles = [...new Set(allEmployees.map(e => e.role).filter(Boolean))];
  const jobs: JobInfo[] = [];

  for (const role of uniqueRoles) {
    const job = await getJobByRole(workspaceId, role);
    if (job) jobs.push(job);
  }

  return jobs;
}

/**
 * Find employees matching a job requirement
 */
export async function getEmployeesForJob(
  workspaceId: string,
  jobTitle: string
): Promise<{ id: string; name: string; hourlyRate: number }[]> {
  const matchingEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  return matchingEmployees
    .filter(e => e.role === jobTitle && e.role)
    .map(e => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      hourlyRate: parseFloat(e.hourlyRate?.toString() || '0'),
    }));
}

export const jobRetrievalService = {
  getJobByRole,
  getWorkspaceJobs,
  getEmployeesForJob,
};
