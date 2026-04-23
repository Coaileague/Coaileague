import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response, NextFunction } from 'express';
import { sandboxSimulationService } from '../services/sandbox/sandboxSimulationService';
import { trinityAutomationTestRunner } from '../services/sandbox/trinityAutomationTestRunner';
import { sandboxQuickBooksSimulator } from '../services/sandbox/sandboxQuickBooksSimulator';
import { requirePlatformRole, type AuthenticatedRequest } from '../rbac';
import { quickbooksOAuthService } from '../services/oauth/quickbooks';
import { quickbooksIntegration } from '../services/integrations/quickbooksIntegration';
import { db } from '../db';
import { partnerConnections, clients, employees, invoices, timeEntries, shifts } from '@shared/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { decryptToken } from '../security/tokenEncryption';
import { INTEGRATIONS } from '@shared/platformConfig';
import { requireAuth } from '../auth';
import { requireWorkspaceId } from '../utils/apiResponse';
import { isProduction } from '../lib/isProduction';

import {
  seedAllRates,
  verifyRateCompleteness,
  updateEmployeeRate,
  updateClientBillingRate,
  getEmployeeRates,
  getClientRates,
} from '../services/rateManagement';
import { generateWeeklyInvoices } from '../services/billingAutomation';
import { createLogger } from '../lib/logger';
const log = createLogger('SandboxRoutes');


const router = Router();

router.use(requireAuth);

const sandboxDevBypass = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    req.user = ({ 
      id: 'sandbox-dev-user', 
      platformRole: 'root_admin',
      email: 'sandbox@dev.local'
    } as unknown as NonNullable<AuthenticatedRequest['user']>);
    return next();
  }
  return requirePlatformRole(['root_admin', 'sysop'])(req as AuthenticatedRequest, res, next);
};

router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await sandboxSimulationService.getSandboxStatus();
    res.json({
      success: true,
      sandbox: status,
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.post('/seed', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const config = req.body;
    
    log.info('[Sandbox API] Starting sandbox simulation...');
    
    const result = await sandboxSimulationService.runFullSimulation({
      employeeCount: config.employeeCount || 100,
      clientCount: config.clientCount || 10,
      weeksOfHistory: config.weeksOfHistory || 4,
      includeTimeEntries: config.includeTimeEntries !== false,
      includeSchedules: config.includeSchedules !== false,
      includeInvoices: config.includeInvoices !== false,
      includePayroll: config.includePayroll !== false,
    });

    res.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    log.error('[Sandbox API] Seed error:', error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.post('/clear', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    await sandboxSimulationService.clearSandboxData();
    
    res.json({
      success: true,
      message: 'Sandbox data cleared successfully',
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.post('/run-automation-tests', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    log.info('[Sandbox API] Running automation tests...');
    
    const report = await trinityAutomationTestRunner.runFullAutomationTest();

    res.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    log.error('[Sandbox API] Automation test error:', error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.post('/full-test-cycle', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const config = req.body;
    
    log.info('[Sandbox API] Running full test cycle (seed + test)...');
    
    const seedResult = await sandboxSimulationService.runFullSimulation({
      employeeCount: config.employeeCount || 100,
      clientCount: config.clientCount || 10,
      weeksOfHistory: config.weeksOfHistory || 4,
    });

    const testReport = await trinityAutomationTestRunner.runFullAutomationTest();

    res.json({
      success: true,
      seedResult,
      testReport,
      summary: {
        dataSeeded: seedResult.summary,
        testsRun: testReport.summary,
        overallSuccess: testReport.failed === 0,
      },
    });
  } catch (error: unknown) {
    log.error('[Sandbox API] Full test cycle error:', error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const dashboard = await sandboxQuickBooksSimulator.getDashboard();
    res.json({ success: true, dashboard });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/customers', async (req: Request, res: Response) => {
  try {
    const customers = await sandboxQuickBooksSimulator.getCustomers();
    res.json({ success: true, customers, total: customers.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/vendors', async (req: Request, res: Response) => {
  try {
    const vendors = await sandboxQuickBooksSimulator.getVendors();
    res.json({ success: true, vendors, total: vendors.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const invoices = await sandboxQuickBooksSimulator.getInvoices();
    res.json({ success: true, invoices, total: invoices.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/invoices', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const { clientId, issueDate, dueDate, lineItems } = req.body;
    
    if (!clientId || !lineItems || !Array.isArray(lineItems)) {
      return res.status(400).json({ 
        success: false, 
        error: 'clientId and lineItems array required' 
      });
    }

    const invoice = await sandboxQuickBooksSimulator.createInvoice({
      clientId,
      issueDate: issueDate ? new Date(issueDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      lineItems,
    });

    res.json({ success: true, invoice });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.patch('/invoices/:id/status', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['draft', 'sent', 'paid'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status. Must be draft, sent, or paid' 
      });
    }

    await sandboxQuickBooksSimulator.updateInvoiceStatus(id, status);
    res.json({ success: true, message: `Invoice status updated to ${status}` });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.delete('/invoices/:id', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sandboxQuickBooksSimulator.deleteInvoice(id);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/invoices/send-all-drafts', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const result = await sandboxQuickBooksSimulator.sendAllDraftInvoices();
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/invoices/mark-all-paid', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const result = await sandboxQuickBooksSimulator.markAllInvoicesPaid();
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/payroll-runs', async (req: Request, res: Response) => {
  try {
    const payrollRuns = await sandboxQuickBooksSimulator.getPayrollRuns();
    res.json({ success: true, payrollRuns, total: payrollRuns.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/time-entries', async (req: Request, res: Response) => {
  try {
    const timeEntries = await sandboxQuickBooksSimulator.getTimeEntries();
    res.json({ success: true, timeEntries, total: timeEntries.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/time-entries/:id/approve', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sandboxQuickBooksSimulator.approveTimeEntry(id);
    res.json({ success: true, message: 'Time entry approved' });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/shifts', async (req: Request, res: Response) => {
  try {
    const shifts = await sandboxQuickBooksSimulator.getShifts();
    res.json({ success: true, shifts, total: shifts.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/automation/:type', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    
    if (!['schedule', 'invoice', 'payroll', 'sync_all'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid automation type. Must be schedule, invoice, payroll, or sync_all' 
      });
    }

    const result = await sandboxQuickBooksSimulator.runAutomation(type as any);
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/run-complete-workflow', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    log.info('[Sandbox API] Running complete workflow simulation...');
    
    const results: any = {
      steps: [],
      summary: {},
    };

    results.steps.push({ step: 1, name: 'Schedule Generation', status: 'running' });
    const scheduleResult = await sandboxQuickBooksSimulator.runAutomation('schedule');
    results.steps[0].status = scheduleResult.success ? 'completed' : 'failed';
    results.steps[0].details = scheduleResult.details;

    results.steps.push({ step: 2, name: 'Invoice Generation', status: 'running' });
    const invoiceResult = await sandboxQuickBooksSimulator.runAutomation('invoice');
    results.steps[1].status = invoiceResult.success ? 'completed' : 'failed';
    results.steps[1].details = invoiceResult.details;

    results.steps.push({ step: 3, name: 'Payroll Processing', status: 'running' });
    const payrollResult = await sandboxQuickBooksSimulator.runAutomation('payroll');
    results.steps[2].status = payrollResult.success ? 'completed' : 'failed';
    results.steps[2].details = payrollResult.details;

    results.steps.push({ step: 4, name: 'QuickBooks Sync', status: 'running' });
    const syncResult = await sandboxQuickBooksSimulator.runAutomation('sync_all');
    results.steps[3].status = syncResult.success ? 'completed' : 'failed';
    results.steps[3].details = syncResult.details;

    const dashboard = await sandboxQuickBooksSimulator.getDashboard();
    results.summary = {
      totalSteps: 4,
      completedSteps: results.steps.filter((s: any) => s.status === 'completed').length,
      failedSteps: results.steps.filter((s: any) => s.status === 'failed').length,
      dashboard,
    };

    res.json({
      success: results.summary.failedSteps === 0,
      message: `Completed ${results.summary.completedSteps}/4 workflow steps`,
      results,
    });
  } catch (error: unknown) {
    log.error('[Sandbox API] Complete workflow error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/e2e-quickbooks-test', sandboxDevBypass, async (req: Request, res: Response) => {
  const WORKSPACE_ID = 'sandbox-e2e-quickbooks-workspace-00000000';
  const testLog: any[] = [];
  const addLog = (step: string, status: string, data: any) => {
    testLog.push({ step, status, timestamp: new Date().toISOString(), data });
    log.info(`[E2E-QB] ${step}: ${status}`);
  };

  try {
    addLog('1. Connection Check', 'starting', {});
    const [connection] = await db.select().from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, WORKSPACE_ID),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        )
      );

    if (!connection) {
      addLog('1. Connection Check', 'failed', { error: 'No active QuickBooks connection found' });
      return res.json({ success: false, testLog, error: 'No QuickBooks connection' });
    }

    addLog('1. Connection Check', 'ok', {
      connectionId: connection.id,
      realmId: connection.realmId,
      status: connection.status,
      tokenExpired: connection.expiresAt ? new Date() > connection.expiresAt : 'unknown',
      expiresAt: connection.expiresAt,
      hasRefreshToken: !!connection.refreshToken,
    });

    addLog('2. Token Refresh', 'starting', {});
    let accessToken: string;
    try {
      accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const tokenPreview = accessToken ? `${accessToken.slice(0, 12)}...${accessToken.slice(-8)}` : 'EMPTY';
      addLog('2. Token Refresh', 'ok', { tokenPreview, tokenLength: accessToken?.length || 0 });
    } catch (tokenError: unknown) {
      addLog('2. Token Refresh', 'failed', { error: (tokenError instanceof Error ? tokenError.message : String(tokenError)) });
      return res.json({
        success: false,
        testLog,
        error: `Token refresh failed: ${(tokenError instanceof Error ? tokenError.message : String(tokenError))}`,
        recommendation: 'Re-authenticate QuickBooks at /quickbooks-import',
      });
    }

    addLog('3. QB Company Info', 'starting', {});
    const environment = INTEGRATIONS.quickbooks.getEnvironment();
    const apiBase = environment === 'production'
      ? INTEGRATIONS.quickbooks.apiUrls.production
      : INTEGRATIONS.quickbooks.apiUrls.sandbox;
    const minorVersion = INTEGRATIONS.quickbooks.minorVersion;

    try {
      const companyResponse = await fetch(
        `${apiBase}/v3/company/${connection.realmId}/companyinfo/${connection.realmId}?minorversion=${minorVersion}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (companyResponse.ok) {
        const companyData = await companyResponse.json();
        const info = companyData.CompanyInfo;
        addLog('3. QB Company Info', 'ok', {
          companyName: info?.CompanyName,
          country: info?.Country,
          legalName: info?.LegalName,
          fiscalYearStartMonth: info?.FiscalYearStartMonth,
        });
      } else {
        const errText = await companyResponse.text();
        addLog('3. QB Company Info', 'failed', { status: companyResponse.status, error: errText });
      }
    } catch (err: unknown) {
      addLog('3. QB Company Info', 'failed', { error: (err instanceof Error ? err.message : String(err)) });
    }

    addLog('4. Generate Time Entries', 'starting', {});
    const existingShifts = await db.select().from(shifts)
      .where(eq(shifts.workspaceId, WORKSPACE_ID))
      .limit(10);

    let timeEntriesCreated = 0;
    for (const shift of existingShifts.slice(0, 5)) {
      if (!shift.employeeId || !shift.startTime || !shift.endTime) continue;

      const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
      if (hours <= 0 || hours > 24) continue;

      try {
        await db.insert(timeEntries).values({
          workspaceId: WORKSPACE_ID,
          employeeId: shift.employeeId,
          clientId: shift.clientId,
          clockIn: shift.startTime,
          clockOut: shift.endTime,
          totalHours: hours.toFixed(2),
          status: 'approved',
          approvedAt: new Date(),
          shiftId: shift.id,
        });
        timeEntriesCreated++;
      } catch (e: unknown) {
        if (!(e instanceof Error ? e.message : String(e))?.includes('duplicate')) {
          addLog('4. Generate Time Entries', 'warning', { shiftId: shift.id, error: (e instanceof Error ? e.message : String(e)) });
        }
      }
    }
    addLog('4. Generate Time Entries', 'ok', { created: timeEntriesCreated, fromShifts: existingShifts.length });

    addLog('5. Invoice Automation', 'starting', {});
    const invoiceResult = await sandboxQuickBooksSimulator.runAutomation('invoice');
    addLog('5. Invoice Automation', invoiceResult.success ? 'ok' : 'warning', invoiceResult.details);

    addLog('6. Load Data for QB Push', 'starting', {});
    const dbClients = await db.select().from(clients)
      .where(eq(clients.workspaceId, WORKSPACE_ID)).limit(5);
    const dbEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, WORKSPACE_ID)).limit(5);
    const dbInvoices = await db.select().from(invoices)
      .where(eq(invoices.workspaceId, WORKSPACE_ID)).limit(5);

    addLog('6. Load Data for QB Push', 'ok', {
      clients: dbClients.length,
      employees: dbEmployees.length,
      invoices: dbInvoices.length,
    });

    const qbResults: any = { customers: [], employees: [], invoices: [] };
    const qbHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
    const qbUrl = (entity: string) =>
      `${apiBase}/v3/company/${connection.realmId}/${entity}?minorversion=${minorVersion}`;
    const qbQuery = (entity: string, query: string) =>
      `${apiBase}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}&minorversion=${minorVersion}`;

    addLog('7a. Query Existing QB Customers', 'starting', {});
    let existingQbCustomers: any[] = [];
    try {
      const custResp = await fetch(qbQuery('customer', "SELECT * FROM Customer MAXRESULTS 25"), { headers: qbHeaders });
      if (custResp.ok) {
        const custData = await custResp.json();
        existingQbCustomers = custData.QueryResponse?.Customer || [];
      }
    } catch (err: unknown) {
      addLog('7a. Query Existing QB Customers', 'warning', { error: (err instanceof Error ? err.message : String(err)) });
    }
    addLog('7a. Query Existing QB Customers', 'ok', {
      found: existingQbCustomers.length,
      samples: existingQbCustomers.slice(0, 5).map((c: any) => ({ id: c.Id, name: c.DisplayName })),
    });

    for (const client of dbClients.slice(0, 3)) {
      const displayName = client.companyName || `${client.firstName} ${client.lastName}` || `Client-${client.id.slice(0, 8)}`;
      const existing = existingQbCustomers.find((c: any) =>
        c.DisplayName === displayName || c.CompanyName === client.companyName
      );
      if (existing) {
        qbResults.customers.push({
          clientId: client.id, success: true, matched: true,
          qbCustomerId: existing.Id, qbDisplayName: existing.DisplayName,
        });
        continue;
      }
      const customerPayload = {
        DisplayName: `${displayName}-${Date.now().toString(36).slice(-4)}`,
        CompanyName: client.companyName || `${client.firstName} ${client.lastName}`,
        PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
        PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
      };
      try {
        const resp = await fetch(qbUrl('customer'), { method: 'POST', headers: qbHeaders, body: JSON.stringify(customerPayload) });
        const respData = await resp.json();
        qbResults.customers.push({
          clientId: client.id, payload: customerPayload, status: resp.status, success: resp.ok,
          qbCustomerId: respData.Customer?.Id, qbDisplayName: respData.Customer?.DisplayName,
          error: respData.Fault?.Error?.[0]?.Message,
        });
      } catch (err: unknown) {
        qbResults.customers.push({ clientId: client.id, error: (err instanceof Error ? err.message : String(err)) });
      }
    }
    addLog('7a. Push Customers to QB', 'ok', {
      attempted: qbResults.customers.length,
      succeeded: qbResults.customers.filter((c: any) => c.success).length,
      matched: qbResults.customers.filter((c: any) => c.matched).length,
      results: qbResults.customers,
    });

    addLog('7b. Query Existing QB Employees', 'starting', {});
    let existingQbEmployees: any[] = [];
    try {
      const empResp = await fetch(qbQuery('employee', "SELECT * FROM Employee MAXRESULTS 25"), { headers: qbHeaders });
      if (empResp.ok) {
        const empData = await empResp.json();
        existingQbEmployees = empData.QueryResponse?.Employee || [];
      }
    } catch (err: unknown) {
      addLog('7b. Query Existing QB Employees', 'warning', { error: (err instanceof Error ? err.message : String(err)) });
    }
    addLog('7b. Query Existing QB Employees', 'ok', {
      found: existingQbEmployees.length,
      samples: existingQbEmployees.slice(0, 5).map((e: any) => ({ id: e.Id, name: e.DisplayName })),
    });

    for (const emp of dbEmployees.slice(0, 3)) {
      const displayName = `${emp.firstName} ${emp.lastName}`;
      const existing = existingQbEmployees.find((e: any) =>
        e.DisplayName === displayName ||
        (e.GivenName === emp.firstName && e.FamilyName === emp.lastName)
      );
      if (existing) {
        qbResults.employees.push({
          employeeId: emp.id, success: true, matched: true,
          qbEmployeeId: existing.Id, qbDisplayName: existing.DisplayName,
        });
        continue;
      }
      const employeePayload = {
        DisplayName: `${displayName}-${Date.now().toString(36).slice(-4)}`,
        GivenName: emp.firstName,
        FamilyName: emp.lastName,
        PrimaryEmailAddr: emp.email ? { Address: emp.email } : undefined,
        PrimaryPhone: emp.phone ? { FreeFormNumber: emp.phone } : undefined,
      };
      try {
        const resp = await fetch(qbUrl('employee'), { method: 'POST', headers: qbHeaders, body: JSON.stringify(employeePayload) });
        const respData = await resp.json();
        qbResults.employees.push({
          employeeId: emp.id, payload: employeePayload, status: resp.status, success: resp.ok,
          qbEmployeeId: respData.Employee?.Id, qbDisplayName: respData.Employee?.DisplayName,
          error: respData.Fault?.Error?.[0]?.Message,
        });
      } catch (err: unknown) {
        qbResults.employees.push({ employeeId: emp.id, error: (err instanceof Error ? err.message : String(err)) });
      }
    }
    addLog('7b. Push Employees to QB', 'ok', {
      attempted: qbResults.employees.length,
      succeeded: qbResults.employees.filter((e: any) => e.success).length,
      matched: qbResults.employees.filter((e: any) => e.matched).length,
      results: qbResults.employees,
    });

    addLog('7c. Push Invoices to QB', 'starting', {});
    for (const inv of dbInvoices.slice(0, 3)) {
      const customerRef = qbResults.customers.find((c: any) => c.clientId === inv.clientId && c.qbCustomerId);
      const fallbackCustomer = existingQbCustomers[0];
      const invoicePayload = {
        Line: [{
          Amount: parseFloat(inv.total || '0'),
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' },
            Qty: 1,
            UnitPrice: parseFloat(inv.total || '0'),
          },
          Description: `Security Services - Invoice ${inv.invoiceNumber}`,
        }],
        CustomerRef: {
          value: customerRef?.qbCustomerId || fallbackCustomer?.Id || '1',
          name: customerRef?.qbDisplayName || fallbackCustomer?.DisplayName || 'Customer',
        },
        DocNumber: `E2E-${Date.now().toString(36)}-${inv.invoiceNumber?.slice(-6) || 'test'}`,
        TxnDate: inv.issueDate ? new Date(inv.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        DueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : undefined,
      };

      try {
        const resp = await fetch(qbUrl('invoice'), { method: 'POST', headers: qbHeaders, body: JSON.stringify(invoicePayload) });
        const respData = await resp.json();
        qbResults.invoices.push({
          invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, payload: invoicePayload,
          status: resp.status, success: resp.ok,
          qbInvoiceId: respData.Invoice?.Id, qbDocNumber: respData.Invoice?.DocNumber,
          qbTotalAmt: respData.Invoice?.TotalAmt,
          error: respData.Fault?.Error?.[0]?.Message,
          errorDetail: respData.Fault?.Error?.[0]?.Detail,
        });
      } catch (err: unknown) {
        qbResults.invoices.push({ invoiceId: inv.id, payload: invoicePayload, error: (err instanceof Error ? err.message : String(err)) });
      }
    }
    addLog('7c. Push Invoices to QB', 'ok', {
      attempted: qbResults.invoices.length,
      succeeded: qbResults.invoices.filter((i: any) => i.success).length,
      results: qbResults.invoices,
    });

    addLog('8. Time Activities (Payroll Data)', 'starting', {});
    const qbTimeResults: any[] = [];
    const approvedEntries = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.workspaceId, WORKSPACE_ID), eq(timeEntries.status, 'approved')))
      .limit(3);

    for (const entry of approvedEntries) {
      if (!entry.employeeId || !entry.clockIn || !entry.clockOut) continue;
      const emp = await db.select().from(employees).where(eq(employees.id, entry.employeeId)).then(r => r[0]);
      if (!emp) continue;

      const qbEmp = qbResults.employees.find((e: any) => e.employeeId === emp.id && e.qbEmployeeId);
      const fallbackEmployee = existingQbEmployees[0];
      const hours = parseFloat(entry.totalHours || '0');
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours - wholeHours) * 60);

      const timePayload = {
        NameOf: 'Employee',
        EmployeeRef: {
          value: qbEmp?.qbEmployeeId || fallbackEmployee?.Id || '1',
          name: qbEmp?.qbDisplayName || fallbackEmployee?.DisplayName || `${emp.firstName} ${emp.lastName}`,
        },
        TxnDate: new Date(entry.clockIn).toISOString().split('T')[0],
        Hours: wholeHours,
        Minutes: minutes,
        Description: `E2E Test - Shift work - ${emp.firstName} ${emp.lastName}`,
      };

      try {
        const resp = await fetch(qbUrl('timeactivity'), { method: 'POST', headers: qbHeaders, body: JSON.stringify(timePayload) });
        const respData = await resp.json();
        qbTimeResults.push({
          entryId: entry.id, payload: timePayload, status: resp.status, success: resp.ok,
          qbTimeActivityId: respData.TimeActivity?.Id, error: respData.Fault?.Error?.[0]?.Message,
        });
      } catch (err: unknown) {
        qbTimeResults.push({ entryId: entry.id, payload: timePayload, error: (err instanceof Error ? err.message : String(err)) });
      }
    }
    addLog('8. Time Activities (Payroll Data)', 'ok', {
      attempted: qbTimeResults.length,
      succeeded: qbTimeResults.filter((t: any) => t.success).length,
      results: qbTimeResults,
    });

    const summary = {
      environment,
      apiBase,
      realmId: connection.realmId,
      existingQbCustomers: existingQbCustomers.length,
      existingQbEmployees: existingQbEmployees.length,
      customersPushed: { attempted: qbResults.customers.length, succeeded: qbResults.customers.filter((c: any) => c.success).length, matched: qbResults.customers.filter((c: any) => c.matched).length },
      employeesPushed: { attempted: qbResults.employees.length, succeeded: qbResults.employees.filter((e: any) => e.success).length, matched: qbResults.employees.filter((e: any) => e.matched).length },
      invoicesPushed: { attempted: qbResults.invoices.length, succeeded: qbResults.invoices.filter((i: any) => i.success).length },
      timeActivitiesPushed: { attempted: qbTimeResults.length, succeeded: qbTimeResults.filter((t: any) => t.success).length },
    };

    addLog('9. Summary', 'complete', summary);

    res.json({
      success: true,
      message: 'E2E QuickBooks sandbox test completed',
      summary,
      testLog,
    });
  } catch (error: unknown) {
    // TRINITY.md §A: production detection via canonical helper, never
    // direct per-platform env checks. Use isProduction() helper instead.
    const isProd = isProduction();
    addLog('ERROR', 'failed', {
      error: sanitizeError(error),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      stack: isProd ? undefined : error.stack?.split('\n').slice(0, 5)
    });
    res.status(500).json({ success: false, testLog, error: sanitizeError(error) });
  }
});

router.post('/test-lazy-sync', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const { ensureQuickBooksRecord } = await import('../services/integrations/quickbooksLazySync');

    const WORKSPACE_ID = 'sandbox-lazy-sync-workspace-00000000';
    const testLog: any[] = [];
    const addLog = (step: string, status: string, data: any) => {
      testLog.push({ step, status, data, timestamp: new Date().toISOString() });
      log.info(`[LazySync-Test] ${step}: ${status}`);
    };

    addLog('1. Create test client (no QB ID)', 'starting', {});
    const testSuffix = Date.now().toString(36);
    const testClientCompany = `LazySync-Test-Corp-${testSuffix}`;
    const [testClient] = await db.insert(clients).values({
      workspaceId: WORKSPACE_ID,
      firstName: 'LazySync',
      lastName: `TestClient-${testSuffix}`,
      companyName: testClientCompany,
      email: `test-${Date.now()}@lazysync.test`,
      isActive: true,
    } as any).returning();
    addLog('1. Create test client (no QB ID)', 'ok', {
      id: testClient.id,
      name: `LazySync TestClient-${testSuffix}`,
      companyName: testClientCompany,
      quickbooksClientId: (testClient as any).quickbooksClientId || null,
    });

    addLog('2. Create test employee (no QB ID)', 'starting', {});
    const testFirstName = 'LazySync';
    const testLastName = `Test-${Date.now().toString(36)}`;
    const [testEmployee] = await db.insert(employees).values({
      workspaceId: WORKSPACE_ID,
      firstName: testFirstName,
      lastName: testLastName,
      email: `lazysync-emp-${Date.now()}@test.local`,
      workerType: 'employee',
      isActive: true,
    } as any).returning();
    addLog('2. Create test employee (no QB ID)', 'ok', {
      id: testEmployee.id,
      name: `${testFirstName} ${testLastName}`,
      quickbooksEmployeeId: (testEmployee as any).quickbooksEmployeeId || null,
    });

    addLog('3. Lazy sync client → QB Customer', 'starting', {});
    const customerResult = await ensureQuickBooksRecord('customer', testClient.id, WORKSPACE_ID);
    addLog('3. Lazy sync client → QB Customer', customerResult.success ? 'ok' : 'failed', customerResult);

    addLog('4. Lazy sync employee → QB Employee', 'starting', {});
    const employeeResult = await ensureQuickBooksRecord('employee', testEmployee.id, WORKSPACE_ID);
    addLog('4. Lazy sync employee → QB Employee', employeeResult.success ? 'ok' : 'failed', employeeResult);

    addLog('5. Verify DB updated', 'starting', {});
    const updatedClient = await db.query.clients.findFirst({ where: eq(clients.id, testClient.id) });
    const updatedEmployee = await db.query.employees.findFirst({ where: eq(employees.id, testEmployee.id) });
    addLog('5. Verify DB updated', 'ok', {
      client: {
        id: updatedClient?.id,
        quickbooksClientId: (updatedClient as any)?.quickbooksClientId || null,
        quickbooksSyncStatus: (updatedClient as any)?.quickbooksSyncStatus || null,
      },
      employee: {
        id: updatedEmployee?.id,
        quickbooksEmployeeId: (updatedEmployee as any)?.quickbooksEmployeeId || null,
        quickbooksSyncStatus: (updatedEmployee as any)?.quickbooksSyncStatus || null,
      },
    });

    addLog('6. Idempotency check - call again', 'starting', {});
    const customerResult2 = await ensureQuickBooksRecord('customer', testClient.id, WORKSPACE_ID);
    const employeeResult2 = await ensureQuickBooksRecord('employee', testEmployee.id, WORKSPACE_ID);
    addLog('6. Idempotency check - call again', 'ok', {
      customer: { ...customerResult2, note: customerResult2.created ? 'PROBLEM: created again!' : 'Good: reused existing' },
      employee: { ...employeeResult2, note: employeeResult2.created ? 'PROBLEM: created again!' : 'Good: reused existing' },
    });

    const summary = {
      clientCreatedInQB: customerResult.success,
      clientQBId: customerResult.qbId,
      clientWasCreated: customerResult.created,
      clientWasMatched: customerResult.matched,
      employeeCreatedInQB: employeeResult.success,
      employeeQBId: employeeResult.qbId,
      employeeWasCreated: employeeResult.created,
      employeeWasMatched: employeeResult.matched,
      idempotencyPassed: !customerResult2.created && !employeeResult2.created,
      dbUpdated: !!(updatedClient as any)?.quickbooksClientId && !!(updatedEmployee as any)?.quickbooksEmployeeId,
    };

    addLog('7. Summary', 'complete', summary);

    res.json({ success: customerResult.success && employeeResult.success, summary, testLog });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/weekly-simulation', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    log.info('[Sandbox API] Running weekly automation simulation...');
    const { runWeeklySimulation } = await import('../scripts/weeklySimulation');
    const report = await runWeeklySimulation();
    res.json({ success: true, report });
  } catch (error: unknown) {
    log.error('[Sandbox API] Weekly simulation failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/seed-rates', sandboxDevBypass, async (req: Request, res: Response) => {
  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  try {
    log.info(`[Sandbox API] Seeding rates for workspace ${workspaceId}...`);
    const result = await seedAllRates(workspaceId);
    res.json({ success: true, result });
  } catch (error: unknown) {
    log.error('[Sandbox API] Rate seeding failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/rates/verify', async (req: Request, res: Response) => {
  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  try {
    const result = await verifyRateCompleteness(workspaceId);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/rates/employees', async (req: Request, res: Response) => {
  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  try {
    const rates = await getEmployeeRates(workspaceId);
    res.json({ success: true, employees: rates, total: rates.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.put('/rates/employee/:id', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { hourlyRate } = req.body;
    if (!hourlyRate || isNaN(parseFloat(hourlyRate))) {
      return res.status(400).json({ success: false, error: 'Valid hourlyRate required' });
    }
    const result = await updateEmployeeRate(id, parseFloat(hourlyRate));
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/rates/clients', async (req: Request, res: Response) => {
  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  try {
    const rates = await getClientRates(workspaceId);
    res.json({ success: true, clients: rates, total: rates.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.put('/rates/client/:clientId', sandboxDevBypass, async (req: Request, res: Response) => {
  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  try {
    const { clientId } = req.params;
    const { billableRate, description } = req.body;
    if (!billableRate || isNaN(parseFloat(billableRate))) {
      return res.status(400).json({ success: false, error: 'Valid billableRate required' });
    }
    const result = await updateClientBillingRate(workspaceId, clientId, parseFloat(billableRate), description);
    res.json({ success: true, rate: result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/generate-weekly-invoices', sandboxDevBypass, async (req: Request, res: Response) => {
  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  try {
    const endDate = req.body.endDate ? new Date(req.body.endDate) : new Date();
    const days = req.body.days || 7;
    log.info(`[Sandbox API] Generating ${days}-day invoices for workspace ${workspaceId}...`);
    const result = await generateWeeklyInvoices(workspaceId, endDate, days);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    log.error('[Sandbox API] Weekly invoice generation failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
