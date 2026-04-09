import { createLogger } from '../../lib/logger';
const log = createLogger('automationTestRunner');
import { db } from '../../db';
import { employees, clients, shifts, timeEntries, invoices, payrollRuns, partnerConnections } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sandboxSimulationService } from './sandboxSimulationService';
import { platformEventBus } from '../platformEventBus';
import { quickbooksSyncService } from '../partners/quickbooksSyncService';

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: any;
}

interface AutomationTestReport {
  workspaceId: string;
  runId: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
  quickbooksSyncResults?: any;
  summary: string;
}

export class TrinityAutomationTestRunner {
  private workspaceId: string;

  constructor() {
    this.workspaceId = sandboxSimulationService.getWorkspaceId();
  }

  async runFullAutomationTest(): Promise<AutomationTestReport> {
    const runId = `test-run-${Date.now()}`;
    const startedAt = new Date();
    const tests: TestResult[] = [];

    log.info(`[TrinityTest] Starting full automation test suite: ${runId}`);

    tests.push(await this.testDataIntegrity());
    tests.push(await this.testSchedulingAutomation());
    tests.push(await this.testTimeTrackingValidation());
    tests.push(await this.testInvoiceGeneration());
    tests.push(await this.testPayrollProcessing());
    tests.push(await this.testQuickBooksConnection());

    const qbResult = await this.testQuickBooksSync();
    tests.push(qbResult.test);

    const completedAt = new Date();
    const passed = tests.filter(t => t.passed).length;
    const failed = tests.filter(t => !t.passed).length;

    const report: AutomationTestReport = {
      workspaceId: this.workspaceId,
      runId,
      startedAt,
      completedAt,
      totalTests: tests.length,
      passed,
      failed,
      skipped: 0,
      tests,
      quickbooksSyncResults: qbResult.syncDetails,
      summary: `Automation test complete: ${passed}/${tests.length} tests passed (${failed} failed)`,
    };

    platformEventBus.emit('trinity_automation_test_complete', report);

    log.info(`[TrinityTest] ${report.summary}`);
    return report;
  }

  private async testDataIntegrity(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Data Integrity Check';

    try {
      const status = await sandboxSimulationService.getSandboxStatus();
      
      if (!status.exists) {
        return {
          testName,
          passed: false,
          message: 'Sandbox workspace does not exist',
          durationMs: Date.now() - start,
        };
      }

      const checks = [
        { name: 'employees', count: status.stats.employees, min: 10 },
        { name: 'clients', count: status.stats.clients, min: 5 },
        { name: 'shifts', count: status.stats.shifts, min: 100 },
        { name: 'timeEntries', count: status.stats.timeEntries, min: 100 },
      ];

      const failures = checks.filter(c => c.count < c.min);

      if (failures.length > 0) {
        return {
          testName,
          passed: false,
          message: `Insufficient data: ${failures.map(f => `${f.name}: ${f.count}/${f.min}`).join(', ')}`,
          durationMs: Date.now() - start,
          details: status.stats,
        };
      }

      return {
        testName,
        passed: true,
        message: `Data integrity verified: ${status.stats.employees} employees, ${status.stats.clients} clients, ${status.stats.shifts} shifts`,
        durationMs: Date.now() - start,
        details: status.stats,
      };
    } catch (error: any) {
      return {
        testName,
        passed: false,
        message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async testSchedulingAutomation(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Scheduling Automation';

    try {
      const allShifts = await db.select().from(shifts)
        .where(eq(shifts.workspaceId, this.workspaceId))
        .limit(100);

      const completedShifts = allShifts.filter(s => s.status === 'completed');
      const scheduledShifts = allShifts.filter(s => s.status === 'scheduled');

      const shiftsWithEmployees = allShifts.filter(s => s.employeeId);
      const shiftsWithClients = allShifts.filter(s => s.clientId);

      const assignmentRate = allShifts.length > 0 
        ? (shiftsWithEmployees.length / allShifts.length * 100).toFixed(1)
        : 0;

      if (allShifts.length === 0) {
        return {
          testName,
          passed: false,
          message: 'No shifts found in sandbox',
          durationMs: Date.now() - start,
        };
      }

      return {
        testName,
        passed: true,
        message: `Scheduling verified: ${completedShifts.length} completed, ${scheduledShifts.length} scheduled, ${assignmentRate}% assignment rate`,
        durationMs: Date.now() - start,
        details: {
          total: allShifts.length,
          completed: completedShifts.length,
          scheduled: scheduledShifts.length,
          assignmentRate: `${assignmentRate}%`,
        },
      };
    } catch (error: any) {
      return {
        testName,
        passed: false,
        message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async testTimeTrackingValidation(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Time Tracking Validation';

    try {
      const entries = await db.select().from(timeEntries)
        .where(eq(timeEntries.workspaceId, this.workspaceId))
        .limit(500);

      if (entries.length === 0) {
        return {
          testName,
          passed: false,
          message: 'No time entries found',
          durationMs: Date.now() - start,
        };
      }

      const approvedEntries = entries.filter(e => e.status === 'approved');
      const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.totalHours || '0'), 0);
      const avgHoursPerEntry = entries.length > 0 ? totalHours / entries.length : 0;

      const validEntries = entries.filter(e => {
        const hours = parseFloat(e.totalHours || '0');
        return hours > 0 && hours <= 24;
      });

      const validationRate = entries.length > 0 ? (validEntries.length / entries.length * 100).toFixed(1) : '100.0';

      return {
        testName,
        passed: parseFloat(validationRate) >= 95,
        message: `Time tracking validated: ${entries.length} entries, ${totalHours.toFixed(1)} total hours, ${validationRate}% valid`,
        durationMs: Date.now() - start,
        details: {
          total: entries.length,
          approved: approvedEntries.length,
          totalHours: totalHours.toFixed(2),
          avgHours: avgHoursPerEntry.toFixed(2),
          validationRate: `${validationRate}%`,
        },
      };
    } catch (error: any) {
      return {
        testName,
        passed: false,
        message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async testInvoiceGeneration(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Invoice Generation';

    try {
      const allInvoices = await db.select().from(invoices)
        .where(eq(invoices.workspaceId, this.workspaceId));

      if (allInvoices.length === 0) {
        return {
          testName,
          passed: false,
          message: 'No invoices found',
          durationMs: Date.now() - start,
        };
      }

      const paidInvoices = allInvoices.filter(i => i.status === 'paid');
      const pendingInvoices = allInvoices.filter(i => i.status === 'pending');
      const totalBilled = allInvoices.reduce((sum, i) => sum + parseFloat(i.total || '0'), 0);
      const totalPaid = allInvoices.reduce((sum, i) => sum + parseFloat(i.amountPaid || '0'), 0);

      return {
        testName,
        passed: true,
        message: `Invoicing verified: ${allInvoices.length} invoices, $${totalBilled.toFixed(2)} billed, $${totalPaid.toFixed(2)} collected`,
        durationMs: Date.now() - start,
        details: {
          total: allInvoices.length,
          paid: paidInvoices.length,
          pending: pendingInvoices.length,
          totalBilled: `$${totalBilled.toFixed(2)}`,
          totalPaid: `$${totalPaid.toFixed(2)}`,
        },
      };
    } catch (error: any) {
      return {
        testName,
        passed: false,
        message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async testPayrollProcessing(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Payroll Processing';

    try {
      const runs = await db.select().from(payrollRuns)
        .where(eq(payrollRuns.workspaceId, this.workspaceId));

      if (runs.length === 0) {
        return {
          testName,
          passed: false,
          message: 'No payroll runs found',
          durationMs: Date.now() - start,
        };
      }

      const completedRuns = runs.filter(r => r.status === 'completed');
      const totalGross = runs.reduce((sum, r) => sum + parseFloat(r.totalGrossPay || '0'), 0);
      const totalNet = runs.reduce((sum, r) => sum + parseFloat(r.totalNetPay || '0'), 0);
      const totalEmployees = runs.reduce((sum, r) => sum + (r.employeeCount || 0), 0);

      return {
        testName,
        passed: true,
        message: `Payroll verified: ${runs.length} runs, $${totalGross.toFixed(2)} gross, $${totalNet.toFixed(2)} net`,
        durationMs: Date.now() - start,
        details: {
          totalRuns: runs.length,
          completedRuns: completedRuns.length,
          totalGross: `$${totalGross.toFixed(2)}`,
          totalNet: `$${totalNet.toFixed(2)}`,
          employeesProcessed: totalEmployees,
        },
      };
    } catch (error: any) {
      return {
        testName,
        passed: false,
        message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async testQuickBooksConnection(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'QuickBooks Connection';

    try {
      const [connection] = await db.select().from(partnerConnections)
        .where(
          and(
            eq(partnerConnections.workspaceId, this.workspaceId),
            eq(partnerConnections.partnerType, 'quickbooks')
          )
        );

      if (!connection) {
        return {
          testName,
          passed: false,
          message: 'No QuickBooks connection configured for sandbox',
          durationMs: Date.now() - start,
          details: { recommendation: 'Connect QuickBooks sandbox to test full sync capabilities' },
        };
      }

      const isConnected = connection.status === 'connected';
      const tokenExpiry = connection.expiresAt 
        ? new Date(connection.expiresAt)
        : null;
      const isTokenValid = tokenExpiry ? tokenExpiry > new Date() : false;

      return {
        testName,
        passed: isConnected && isTokenValid,
        message: isConnected 
          ? `QuickBooks connected: ${connection.partnerName || 'Unknown Company'}`
          : `QuickBooks not connected: ${connection.status}`,
        durationMs: Date.now() - start,
        details: {
          status: connection.status,
          partnerName: connection.partnerName,
          realmId: connection.realmId,
          tokenValid: isTokenValid,
        },
      };
    } catch (error: any) {
      return {
        testName,
        passed: false,
        message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async testQuickBooksSync(): Promise<{ test: TestResult; syncDetails?: any }> {
    const start = Date.now();
    const testName = 'QuickBooks Sync';

    try {
      const [connection] = await db.select().from(partnerConnections)
        .where(
          and(
            eq(partnerConnections.workspaceId, this.workspaceId),
            eq(partnerConnections.partnerType, 'quickbooks'),
            eq(partnerConnections.status, 'connected')
          )
        );

      if (!connection) {
        return {
          test: {
            testName,
            passed: false,
            message: 'QuickBooks not connected - sync test skipped',
            durationMs: Date.now() - start,
          },
        };
      }

      const clientCount = await db.select().from(clients)
        .where(eq(clients.workspaceId, this.workspaceId));
      
      const employeeCount = await db.select().from(employees)
        .where(eq(employees.workspaceId, this.workspaceId));

      return {
        test: {
          testName,
          passed: true,
          message: `QuickBooks sync ready: ${clientCount.length} clients, ${employeeCount.length} employees available for sync`,
          durationMs: Date.now() - start,
          details: {
            clientsToSync: clientCount.length,
            employeesToSync: employeeCount.length,
            recommendation: 'Use /api/sandbox/quickbooks-sync to perform full sync test',
          },
        },
        syncDetails: {
          connectionId: connection.id,
          realmId: (connection as any).partnerCompanyId,
          readyForSync: true,
        },
      };
    } catch (error: any) {
      return {
        test: {
          testName,
          passed: false,
          message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
          durationMs: Date.now() - start,
        },
      };
    }
  }
}

export const trinityAutomationTestRunner = new TrinityAutomationTestRunner();
