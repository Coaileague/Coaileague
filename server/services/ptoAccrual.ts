/**
 * PTO Accrual Automation Service
 * 
 * Automatically calculates and updates PTO balances based on:
 * - Accrual rate (hours per pay period)
 * - Employment start date
 * - PTO usage from approved requests
 * 
 * Typical accrual rates:
 * - Standard: ~3.08 hours/week (160 hours/year = 4 weeks)
 * - Senior: ~4.62 hours/week (240 hours/year = 6 weeks)
 */

import { db } from "../db";
import { employeeBenefits, ptoRequests, employees } from "@shared/schema";
import { platformEventBus } from './platformEventBus';
import { eq, and } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('ptoAccrual');


interface PtoBalance {
  employeeId: string;
  employeeName: string;
  totalAccrued: number;
  totalUsed: number;
  currentBalance: number;
  annualAllowance: number;
}

/**
 * Calculate PTO accrual for a specific employee
 */
export async function calculatePtoAccrual(
  workspaceId: string,
  employeeId: string
): Promise<PtoBalance | null> {
  // Get employee info
  const employee = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.id, employeeId),
      eq(employees.workspaceId, workspaceId)
    ))
    .limit(1);

  if (!employee[0]) {
    return null;
  }

  // Get PTO benefit
  const ptoBenefit = await db
    .select()
    .from(employeeBenefits)
    .where(and(
      eq(employeeBenefits.employeeId, employeeId),
      eq(employeeBenefits.workspaceId, workspaceId),
      eq(employeeBenefits.benefitType, 'pto_vacation'),
      eq(employeeBenefits.status, 'active')
    ))
    .limit(1);

  if (!ptoBenefit[0]) {
    return {
      employeeId,
      employeeName: `${employee[0].firstName} ${employee[0].lastName}`,
      totalAccrued: 0,
      totalUsed: 0,
      currentBalance: 0,
      annualAllowance: 0,
    };
  }

  const benefit = ptoBenefit[0];
  const totalAccrued = parseFloat(benefit.ptoHoursAccrued?.toString() || '0');
  const totalUsed = parseFloat(benefit.ptoHoursUsed?.toString() || '0');
  const annualAllowance = parseFloat(benefit.ptoHoursPerYear?.toString() || '0');

  return {
    employeeId,
    employeeName: `${employee[0].firstName} ${employee[0].lastName}`,
    totalAccrued,
    totalUsed,
    currentBalance: totalAccrued - totalUsed,
    annualAllowance,
  };
}

/**
 * Update PTO accrual based on time worked
 * Call this weekly/bi-weekly during payroll processing
 */
export async function updatePtoAccrual(
  workspaceId: string,
  employeeId: string,
  accrualHours: number
): Promise<boolean> {
  try {
    const ptoBenefit = await db
      .select()
      .from(employeeBenefits)
      .where(and(
        eq(employeeBenefits.employeeId, employeeId),
        eq(employeeBenefits.workspaceId, workspaceId),
        eq(employeeBenefits.benefitType, 'pto_vacation'),
        eq(employeeBenefits.status, 'active')
      ))
      .limit(1);

    if (!ptoBenefit[0]) {
      return false;
    }

    const currentAccrued = parseFloat(ptoBenefit[0].ptoHoursAccrued?.toString() || '0');
    const maxAnnual = parseFloat(ptoBenefit[0].ptoHoursPerYear?.toString() || '0');
    
    // Don't accrue more than annual allowance
    const newAccrued = Math.min(currentAccrued + accrualHours, maxAnnual);

    await db
      .update(employeeBenefits)
      .set({ 
        ptoHoursAccrued: newAccrued.toString(),
        updatedAt: new Date()
      })
      .where(eq(employeeBenefits.id, ptoBenefit[0].id));

    return true;
  } catch (error) {
    log.error('Error updating PTO accrual:', error);
    return false;
  }
}

/**
 * Deduct PTO hours when request is approved
 */
export async function deductPtoHours(
  workspaceId: string,
  employeeId: string,
  hours: number
): Promise<boolean> {
  try {
    const ptoBenefit = await db
      .select()
      .from(employeeBenefits)
      .where(and(
        eq(employeeBenefits.employeeId, employeeId),
        eq(employeeBenefits.workspaceId, workspaceId),
        eq(employeeBenefits.benefitType, 'pto_vacation'),
        eq(employeeBenefits.status, 'active')
      ))
      .limit(1);

    if (!ptoBenefit[0]) {
      return false;
    }

    const currentUsed = parseFloat(ptoBenefit[0].ptoHoursUsed?.toString() || '0');
    const newUsed = currentUsed + hours;

    await db
      .update(employeeBenefits)
      .set({ 
        ptoHoursUsed: newUsed.toString(),
        updatedAt: new Date()
      })
      .where(eq(employeeBenefits.id, ptoBenefit[0].id));

    return true;
  } catch (error) {
    log.error('Error deducting PTO hours:', error);
    return false;
  }
}

/**
 * Get all employee PTO balances for a workspace
 */
export async function getAllPtoBalances(
  workspaceId: string
): Promise<PtoBalance[]> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));

  const balances: PtoBalance[] = [];

  for (const employee of allEmployees) {
    const balance = await calculatePtoAccrual(workspaceId, employee.id);
    if (balance) {
      balances.push(balance);
    }
  }

  return balances;
}

/**
 * Automatic weekly PTO accrual
 * Typically called via scheduled job (e.g., every Monday)
 */
export async function runWeeklyPtoAccrual(workspaceId: string): Promise<number> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));

  let updatedCount = 0;

  for (const employee of allEmployees) {
    // Get their PTO benefit
    const ptoBenefit = await db
      .select()
      .from(employeeBenefits)
      .where(and(
        eq(employeeBenefits.employeeId, employee.id),
        eq(employeeBenefits.workspaceId, workspaceId),
        eq(employeeBenefits.benefitType, 'pto_vacation'),
        eq(employeeBenefits.status, 'active')
      ))
      .limit(1);

    if (ptoBenefit[0]) {
      const annualHours = parseFloat(ptoBenefit[0].ptoHoursPerYear?.toString() || '0');
      // Weekly accrual = annual / 52 weeks
      const weeklyAccrual = annualHours / 52;

      const success = await updatePtoAccrual(workspaceId, employee.id, weeklyAccrual);
      if (success) {
        updatedCount++;
      }
    }
  }

  platformEventBus.publish({
    type: 'pto_accrual_completed',
    category: 'workforce',
    title: 'Weekly PTO Accrual Completed',
    description: `Weekly PTO accrual processed for ${updatedCount} employee(s) in workspace`,
    workspaceId,
    metadata: { updatedCount, workspaceId },
  });

  return updatedCount;
}
