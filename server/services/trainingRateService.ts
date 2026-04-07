/**
 * Training Rate Service - Dynamic training completion rate configuration
 * Replaces hardcoded 85% with configurable, data-driven metrics
 */

import { db } from "../db";
import { employees, trainingCertifications } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { platformEventBus } from './platformEventBus';

export interface TrainingMetrics {
  employeeId: string;
  completedCertifications: number;
  requiredCertifications: number;
  completionRate: number;
  lastCompletedDate?: Date;
}

interface TrainingRateConfig {
  requiredPerQuarter: number;
  requiredPerYear: number;
  workspaceDefaults: boolean;
}

const configMap = new Map<string, TrainingRateConfig>();

/**
 * Get training completion rate for employee (actual data-driven, not hardcoded 85%)
 */
export async function getTrainingCompletionRate(
  workspaceId: string,
  employeeId: string
): Promise<TrainingMetrics> {
  const trainings = await db
    .select()
    .from(trainingCertifications)
    .where(and(
      eq(trainingCertifications.workspaceId, workspaceId),
      eq(trainingCertifications.employeeId, employeeId)
    ));

  const completed = trainings.filter(t => t.issuedDate).length;
  const required = getWorkspaceRequiredTrainings(workspaceId);
  const completionRate = required > 0 ? Math.min((completed / required) * 100, 100) : 0;

  return {
    employeeId,
    completedCertifications: completed,
    requiredCertifications: required,
    completionRate: Math.round(completionRate),
    lastCompletedDate: trainings
      .filter(t => t.issuedDate)
      .sort((a, b) => (b.issuedDate?.getTime() || 0) - (a.issuedDate?.getTime() || 0))[0]?.issuedDate,
  };
}

/**
 * Get workspace training requirements
 */
function getWorkspaceRequiredTrainings(workspaceId: string): number {
  const config = configMap.get(workspaceId) as TrainingRateConfig | undefined;
  return config?.requiredPerYear || 12;
}

/**
 * Set training requirements for workspace
 */
export function setTrainingRequirements(
  workspaceId: string,
  requiredPerYear: number
): void {
  const config: TrainingRateConfig = configMap.get(workspaceId) || { requiredPerQuarter: 3, requiredPerYear: 12, workspaceDefaults: true };
  config.requiredPerYear = requiredPerYear;
  config.requiredPerQuarter = Math.ceil(requiredPerYear / 4);
  configMap.set(workspaceId, config);
}

/**
 * Get team-wide training completion rate
 */
export async function getTeamTrainingCompletionRate(
  workspaceId: string
): Promise<{ avgRate: number; totalEmployees: number; fullCompliance: number }> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  let totalRate = 0;
  let fullyCompliant = 0;

  for (const employee of allEmployees) {
    const metrics = await getTrainingCompletionRate(workspaceId, employee.id);
    totalRate += metrics.completionRate;
    if (metrics.completionRate >= 100) fullyCompliant++;
  }

  const avgRate = allEmployees.length > 0 ? Math.round(totalRate / allEmployees.length) : 0;

  platformEventBus.publish({
    type: 'training_compliance_scanned',
    category: 'workforce',
    title: 'Training Compliance Scan Completed',
    description: `Workspace training completion: ${avgRate}% avg across ${allEmployees.length} employee(s), ${fullyCompliant} fully compliant`,
    workspaceId,
    metadata: { avgRate, totalEmployees: allEmployees.length, fullCompliance: fullyCompliant },
  });

  return {
    avgRate,
    totalEmployees: allEmployees.length,
    fullCompliance: fullyCompliant,
  };
}

export const trainingRateService = {
  getTrainingCompletionRate,
  getTeamTrainingCompletionRate,
  setTrainingRequirements,
  getWorkspaceRequiredTrainings,
};
