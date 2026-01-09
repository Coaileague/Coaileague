/**
 * STATE VERIFICATION SERVICE
 * ==========================
 * Verifies that Trinity actions actually succeeded in the database.
 * Don't trust action responses - check actual database state.
 * 
 * CRITICAL for launch: Ensures Trinity's actions are reliable.
 */

import { db } from '@/db';
import { shifts, employees, clients, timesheets } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export interface VerificationResult {
  verified: boolean;
  discrepancy?: {
    field: string;
    expected: any;
    actual: any;
    severity: 'critical' | 'warning' | 'info';
  }[];
  needsRollback: boolean;
  actualState?: Record<string, any>;
  expectedState?: Record<string, any>;
}

export interface ActionToVerify {
  type: string;
  targetId?: string;
  targetIds?: string[];
  expectedOutcome: Record<string, any>;
  workspaceId: string;
}

class StateVerificationService {
  private static instance: StateVerificationService;

  static getInstance(): StateVerificationService {
    if (!StateVerificationService.instance) {
      StateVerificationService.instance = new StateVerificationService();
    }
    return StateVerificationService.instance;
  }

  /**
   * Verify that an action actually succeeded in the database
   */
  async verifyActionResult(action: ActionToVerify): Promise<VerificationResult> {
    try {
      const actualState = await this.queryDatabaseState(action);
      
      if (!actualState) {
        return {
          verified: false,
          needsRollback: true,
          discrepancy: [{
            field: 'existence',
            expected: 'exists',
            actual: 'not_found',
            severity: 'critical'
          }]
        };
      }

      const discrepancies = this.findDiscrepancies(actualState, action.expectedOutcome);
      
      if (discrepancies.length > 0) {
        const hasCritical = discrepancies.some(d => d.severity === 'critical');
        return {
          verified: false,
          discrepancy: discrepancies,
          needsRollback: hasCritical,
          actualState,
          expectedState: action.expectedOutcome
        };
      }

      return {
        verified: true,
        needsRollback: false,
        actualState,
        expectedState: action.expectedOutcome
      };

    } catch (error) {
      console.error('[StateVerification] Error verifying action:', error);
      return {
        verified: false,
        needsRollback: false,
        discrepancy: [{
          field: 'verification_error',
          expected: 'success',
          actual: String(error),
          severity: 'warning'
        }]
      };
    }
  }

  /**
   * Verify multiple actions in batch
   */
  async verifyBatch(actions: ActionToVerify[]): Promise<{
    allVerified: boolean;
    results: Map<string, VerificationResult>;
    failedCount: number;
    needsRollback: boolean;
  }> {
    const results = new Map<string, VerificationResult>();
    let failedCount = 0;
    let needsRollback = false;

    for (const action of actions) {
      const key = `${action.type}:${action.targetId || action.targetIds?.join(',')}`;
      const result = await this.verifyActionResult(action);
      results.set(key, result);
      
      if (!result.verified) {
        failedCount++;
        if (result.needsRollback) {
          needsRollback = true;
        }
      }
    }

    return {
      allVerified: failedCount === 0,
      results,
      failedCount,
      needsRollback
    };
  }

  /**
   * Query the actual database state for verification
   */
  private async queryDatabaseState(action: ActionToVerify): Promise<Record<string, any> | null> {
    const { type, targetId, workspaceId } = action;

    try {
      switch (type.toUpperCase()) {
        case 'ASSIGN_EMPLOYEE':
        case 'ASSIGN_GUARD':
        case 'UPDATE_SHIFT_ASSIGNMENT': {
          if (!targetId) return null;
          const [shift] = await db
            .select()
            .from(shifts)
            .where(and(
              eq(shifts.id, parseInt(targetId)),
              eq(shifts.workspaceId, parseInt(workspaceId))
            ))
            .limit(1);
          return shift || null;
        }

        case 'CREATE_SHIFT':
        case 'UPDATE_SHIFT': {
          if (!targetId) return null;
          const [shift] = await db
            .select()
            .from(shifts)
            .where(and(
              eq(shifts.id, parseInt(targetId)),
              eq(shifts.workspaceId, parseInt(workspaceId))
            ))
            .limit(1);
          return shift || null;
        }

        case 'DELETE_SHIFT': {
          if (!targetId) return null;
          const [shift] = await db
            .select()
            .from(shifts)
            .where(eq(shifts.id, parseInt(targetId)))
            .limit(1);
          return shift ? { exists: true, ...shift } : { exists: false };
        }

        case 'UPDATE_EMPLOYEE':
        case 'CREATE_EMPLOYEE': {
          if (!targetId) return null;
          const [employee] = await db
            .select()
            .from(employees)
            .where(and(
              eq(employees.id, parseInt(targetId)),
              eq(employees.workspaceId, parseInt(workspaceId))
            ))
            .limit(1);
          return employee || null;
        }

        case 'CREATE_TIMESHEET':
        case 'UPDATE_TIMESHEET': {
          if (!targetId) return null;
          const [timesheet] = await db
            .select()
            .from(timesheets)
            .where(and(
              eq(timesheets.id, parseInt(targetId)),
              eq(timesheets.workspaceId, parseInt(workspaceId))
            ))
            .limit(1);
          return timesheet || null;
        }

        case 'UPDATE_CLIENT':
        case 'CREATE_CLIENT': {
          if (!targetId) return null;
          const [client] = await db
            .select()
            .from(clients)
            .where(and(
              eq(clients.id, parseInt(targetId)),
              eq(clients.workspaceId, parseInt(workspaceId))
            ))
            .limit(1);
          return client || null;
        }

        default:
          console.log(`[StateVerification] Unknown action type: ${type}`);
          return { verified_manually: true };
      }
    } catch (error) {
      console.error(`[StateVerification] DB query failed for ${type}:`, error);
      return null;
    }
  }

  /**
   * Find discrepancies between expected and actual state
   */
  private findDiscrepancies(
    actual: Record<string, any>,
    expected: Record<string, any>
  ): VerificationResult['discrepancy'] {
    const discrepancies: VerificationResult['discrepancy'] = [];

    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[key];

      if (actualValue === undefined && expectedValue !== undefined) {
        discrepancies.push({
          field: key,
          expected: expectedValue,
          actual: 'undefined',
          severity: this.getSeverity(key)
        });
        continue;
      }

      if (!this.valuesMatch(actualValue, expectedValue)) {
        discrepancies.push({
          field: key,
          expected: expectedValue,
          actual: actualValue,
          severity: this.getSeverity(key)
        });
      }
    }

    return discrepancies;
  }

  /**
   * Compare values with type coercion for dates, numbers, etc.
   */
  private valuesMatch(actual: any, expected: any): boolean {
    if (actual === expected) return true;

    if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();
    }

    if (actual instanceof Date && typeof expected === 'string') {
      return actual.toISOString() === expected || actual.getTime() === new Date(expected).getTime();
    }

    if (typeof expected === 'string' && actual instanceof Date) {
      return new Date(expected).getTime() === actual.getTime();
    }

    if (typeof actual === 'number' && typeof expected === 'string') {
      return actual === parseInt(expected) || actual === parseFloat(expected);
    }

    if (typeof actual === 'string' && typeof expected === 'number') {
      return parseInt(actual) === expected || parseFloat(actual) === expected;
    }

    if (typeof actual === 'object' && typeof expected === 'object') {
      return JSON.stringify(actual) === JSON.stringify(expected);
    }

    return false;
  }

  /**
   * Determine severity based on field name
   */
  private getSeverity(field: string): 'critical' | 'warning' | 'info' {
    const criticalFields = [
      'assignedEmployeeId', 'employeeId', 'clientId',
      'startTime', 'endTime', 'status', 'payRate', 'billRate'
    ];
    
    const warningFields = [
      'notes', 'description', 'location', 'position'
    ];

    if (criticalFields.includes(field)) return 'critical';
    if (warningFields.includes(field)) return 'warning';
    return 'info';
  }

  /**
   * Generate a verification report for logging/audit
   */
  generateReport(results: Map<string, VerificationResult>): {
    summary: string;
    details: { action: string; status: string; issues: string[] }[];
    overallStatus: 'success' | 'partial' | 'failed';
  } {
    const details: { action: string; status: string; issues: string[] }[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const [action, result] of results) {
      if (result.verified) {
        successCount++;
        details.push({ action, status: 'verified', issues: [] });
      } else {
        failCount++;
        const issues = result.discrepancy?.map(
          d => `${d.field}: expected ${d.expected}, got ${d.actual} (${d.severity})`
        ) || ['Unknown verification failure'];
        details.push({ action, status: 'failed', issues });
      }
    }

    const total = results.size;
    let overallStatus: 'success' | 'partial' | 'failed' = 'success';
    
    if (failCount === total) {
      overallStatus = 'failed';
    } else if (failCount > 0) {
      overallStatus = 'partial';
    }

    return {
      summary: `Verified ${successCount}/${total} actions (${failCount} failures)`,
      details,
      overallStatus
    };
  }
}

export const stateVerificationService = StateVerificationService.getInstance();
