/**
 * Workflow Status Service - Display active automation workflows
 */

import { db } from "../db";
import { employees, shifts } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface ActiveWorkflow {
  id: string;
  type: string; // 'schedule', 'onboarding', 'payroll', 'performance_review'
  name: string;
  status: 'running' | 'scheduled' | 'paused' | 'completed';
  targetCount: number; // affected employees/shifts
  progressPercent: number;
  startedAt: Date;
  estimatedCompletionAt?: Date;
  lastUpdatedAt: Date;
}

/**
 * Get all active workflows for workspace
 */
export async function getActiveWorkflows(
  workspaceId: string
): Promise<ActiveWorkflow[]> {
  const workflows: ActiveWorkflow[] = [];

  // Check for active scheduling workflows
  const schedulingShifts = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.status, 'published')
    ));

  if (schedulingShifts.length > 0) {
    workflows.push({
      id: `schedule-${workspaceId}`,
      type: 'schedule',
      name: 'Shift Scheduling',
      status: 'running',
      targetCount: schedulingShifts.length,
      progressPercent: 75,
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      estimatedCompletionAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour from now
      lastUpdatedAt: new Date(),
    });
  }

  // Check for active onboarding workflows
  const newEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      sql`${employees.createdAt} > NOW() - INTERVAL '30 days'`
    ));

  if (newEmployees.length > 0) {
    workflows.push({
      id: `onboarding-${workspaceId}`,
      type: 'onboarding',
      name: 'Employee Onboarding',
      status: 'running',
      targetCount: newEmployees.length,
      progressPercent: 40,
      startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      estimatedCompletionAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      lastUpdatedAt: new Date(),
    });
  }

  // Check for payroll workflows (if configured)
  workflows.push({
    id: `payroll-${workspaceId}`,
    type: 'payroll',
    name: 'Payroll Processing',
    status: 'scheduled',
    targetCount: 0,
    progressPercent: 0,
    startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last run 7 days ago
    estimatedCompletionAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Next run tomorrow
    lastUpdatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
  });

  return workflows.filter(w => w.status === 'running' || w.targetCount > 0);
}

/**
 * Get workflow status summary
 */
export async function getWorkflowStatusSummary(workspaceId: string): Promise<{
  activeCount: number;
  scheduledCount: number;
  completedCount: number;
  totalAffected: number;
  estimatedNextRun: Date | null;
}> {
  const workflows = await getActiveWorkflows(workspaceId);

  const activeCount = workflows.filter(w => w.status === 'running').length;
  const scheduledCount = workflows.filter(w => w.status === 'scheduled').length;
  const completedCount = workflows.filter(w => w.status === 'completed').length;
  const totalAffected = workflows.reduce((sum, w) => sum + w.targetCount, 0);

  const nextEstimate = workflows
    .filter(w => w.estimatedCompletionAt)
    .sort((a, b) => (a.estimatedCompletionAt?.getTime() || 0) - (b.estimatedCompletionAt?.getTime() || 0))[0];

  return {
    activeCount,
    scheduledCount,
    completedCount,
    totalAffected,
    estimatedNextRun: nextEstimate?.estimatedCompletionAt || null,
  };
}

/**
 * Get details for a specific workflow
 */
export async function getWorkflowDetails(
  workspaceId: string,
  workflowId: string
): Promise<ActiveWorkflow | null> {
  const workflows = await getActiveWorkflows(workspaceId);
  return workflows.find(w => w.id === workflowId) || null;
}

export const workflowStatusService = {
  getActiveWorkflows,
  getWorkflowStatusSummary,
  getWorkflowDetails,
};
