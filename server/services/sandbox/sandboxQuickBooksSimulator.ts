import { db } from '../../db';
import { 
  clients, employees, invoices, invoiceLineItems, payrollRuns, payrollEntries,
  timeEntries, shifts, partnerConnections, workspaces
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, isNull } from 'drizzle-orm';

const SANDBOX_WORKSPACE_ID = 'sandbox-quickbooks-workspace-00000000';

interface QBCustomer {
  id: string;
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  billingAddress: string;
  balance: number;
  syncStatus: 'synced' | 'pending' | 'error';
  qbId?: string;
}

interface QBVendor {
  id: string;
  displayName: string;
  companyName: string;
  email: string;
  taxId?: string;
  is1099: boolean;
  balance: number;
  syncStatus: 'synced' | 'pending' | 'error';
  qbId?: string;
}

interface QBItem {
  id: string;
  name: string;
  description: string;
  type: 'service' | 'inventory' | 'non-inventory';
  rate: number;
  incomeAccount: string;
  syncStatus: 'synced' | 'pending' | 'error';
  qbId?: string;
}

interface QBInvoice {
  id: string;
  docNumber: string;
  customerId: string;
  customerName: string;
  txnDate: Date;
  dueDate: Date;
  totalAmount: number;
  balance: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  lineItems: QBLineItem[];
  syncStatus: 'synced' | 'pending' | 'error';
  qbId?: string;
}

interface QBLineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  itemId?: string;
}

interface QBPayrollRun {
  id: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  payDate: Date;
  totalGross: number;
  totalNet: number;
  totalTaxes: number;
  employeeCount: number;
  status: 'draft' | 'approved' | 'paid';
  entries: QBPayrollEntry[];
  syncStatus: 'synced' | 'pending' | 'error';
}

interface QBPayrollEntry {
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  taxes: number;
  deductions: number;
  netPay: number;
}

interface SandboxDashboard {
  workspaceId: string;
  quickbooksConnection: {
    status: 'connected' | 'disconnected';
    partnerName: string;
    lastSync: Date | null;
    tokenValid: boolean;
  };
  customers: { total: number; synced: number; pending: number };
  vendors: { total: number; synced: number; pending: number };
  items: { total: number; synced: number; pending: number };
  invoices: { 
    total: number; 
    draft: number;
    sent: number;
    paid: number;
    totalBilled: number;
    totalCollected: number;
  };
  payroll: {
    totalRuns: number;
    totalGross: number;
    totalNet: number;
    employeesProcessed: number;
  };
  timeTracking: {
    totalEntries: number;
    totalHours: number;
    approvedEntries: number;
  };
  scheduling: {
    totalShifts: number;
    completedShifts: number;
    upcomingShifts: number;
  };
  automationStatus: {
    schedulerEnabled: boolean;
    invoiceAutomationEnabled: boolean;
    payrollAutomationEnabled: boolean;
    qbSyncEnabled: boolean;
  };
}

export class SandboxQuickBooksSimulator {
  private workspaceId: string;

  constructor(workspaceId: string = SANDBOX_WORKSPACE_ID) {
    this.workspaceId = workspaceId;
  }

  async getDashboard(): Promise<SandboxDashboard> {
    const [connection] = await db.select().from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, this.workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      );

    const allClients = await db.select().from(clients)
      .where(eq(clients.workspaceId, this.workspaceId));

    const allEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, this.workspaceId));

    const allInvoices = await db.select().from(invoices)
      .where(eq(invoices.workspaceId, this.workspaceId));

    const allPayrollRuns = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.workspaceId, this.workspaceId));

    const allPayrollEntriesData = await db.select().from(payrollEntries)
      .where(eq(payrollEntries.workspaceId, this.workspaceId));

    const allTimeEntries = await db.select().from(timeEntries)
      .where(eq(timeEntries.workspaceId, this.workspaceId));

    const allShifts = await db.select().from(shifts)
      .where(eq(shifts.workspaceId, this.workspaceId));

    const now = new Date();
    const completedShifts = allShifts.filter(s => new Date(s.endTime!) < now);
    const upcomingShifts = allShifts.filter(s => new Date(s.startTime!) > now);

    const totalBilled = allInvoices.reduce((sum, i) => sum + parseFloat(i.total || '0'), 0);
    const totalCollected = allInvoices.reduce((sum, i) => sum + parseFloat(i.amountPaid || '0'), 0);

    const totalGross = allPayrollRuns.reduce((sum, r) => sum + parseFloat(r.totalGrossPay || '0'), 0);
    const totalNet = allPayrollRuns.reduce((sum, r) => sum + parseFloat(r.totalNetPay || '0'), 0);

    const totalHours = allTimeEntries.reduce((sum, e) => sum + parseFloat(e.totalHours || '0'), 0);
    const approvedEntries = allTimeEntries.filter(e => e.status === 'approved');

    const syncedClients = allClients.filter(c => c.quickbooksClientId);
    const syncedEmployees = allEmployees.filter(e => e.quickbooksVendorId);

    return {
      workspaceId: this.workspaceId,
      quickbooksConnection: {
        status: connection?.status === 'connected' ? 'connected' : 'disconnected',
        partnerName: connection?.partnerName || 'Not Connected',
        lastSync: connection?.lastSyncAt || null,
        tokenValid: connection?.expiresAt ? new Date(connection.expiresAt) > now : false,
      },
      customers: {
        total: allClients.length,
        synced: syncedClients.length,
        pending: allClients.length - syncedClients.length,
      },
      vendors: {
        total: allEmployees.length,
        synced: syncedEmployees.length,
        pending: allEmployees.length - syncedEmployees.length,
      },
      items: {
        total: 10,
        synced: 10,
        pending: 0,
      },
      invoices: {
        total: allInvoices.length,
        draft: allInvoices.filter(i => i.status === 'draft').length,
        sent: allInvoices.filter(i => i.status === 'sent' || i.status === 'pending').length,
        paid: allInvoices.filter(i => i.status === 'paid').length,
        totalBilled,
        totalCollected,
      },
      payroll: {
        totalRuns: allPayrollRuns.length,
        totalGross,
        totalNet,
        employeesProcessed: allPayrollEntriesData.length,
      },
      timeTracking: {
        totalEntries: allTimeEntries.length,
        totalHours,
        approvedEntries: approvedEntries.length,
      },
      scheduling: {
        totalShifts: allShifts.length,
        completedShifts: completedShifts.length,
        upcomingShifts: upcomingShifts.length,
      },
      automationStatus: {
        schedulerEnabled: true,
        invoiceAutomationEnabled: true,
        payrollAutomationEnabled: true,
        qbSyncEnabled: !!connection && connection.status === 'connected',
      },
    };
  }

  async getCustomers(): Promise<QBCustomer[]> {
    const allClients = await db.select().from(clients)
      .where(eq(clients.workspaceId, this.workspaceId));

    return allClients.map(c => ({
      id: c.id,
      displayName: `${c.firstName} ${c.lastName}`,
      companyName: c.companyName || '',
      email: c.email || '',
      phone: c.phone || '',
      billingAddress: c.address || '',
      balance: 0,
      syncStatus: c.quickbooksClientId ? 'synced' : 'pending' as const,
      qbId: c.quickbooksClientId || undefined,
    }));
  }

  async getVendors(): Promise<QBVendor[]> {
    const allEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, this.workspaceId));

    return allEmployees.map(e => ({
      id: e.id,
      displayName: `${e.firstName} ${e.lastName}`,
      companyName: '',
      email: e.email || '',
      taxId: (e as any).ssn || undefined,
      is1099: (e as any).employmentType === '(1099 as any)' || (e as any).employmentType === 'contractor',
      balance: 0,
      syncStatus: e.quickbooksVendorId ? 'synced' : 'pending' as const,
      qbId: e.quickbooksVendorId || undefined,
    }));
  }

  async getInvoices(): Promise<QBInvoice[]> {
    const allInvoices = await db.select().from(invoices)
      .where(eq(invoices.workspaceId, this.workspaceId))
      .orderBy(desc(invoices.createdAt));

    const result: QBInvoice[] = [];

    for (const inv of allInvoices) {
      const lineItems = await db.select().from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, inv.id));

      const client = inv.clientId 
        ? await db.select().from(clients).where(eq(clients.id, inv.clientId)).then(r => r[0])
        : null;

      result.push({
        id: inv.id,
        docNumber: inv.invoiceNumber,
        customerId: inv.clientId || '',
        customerName: client ? `${client.firstName} ${client.lastName}` : 'Unknown',
        txnDate: new Date(inv.issueDate!),
        dueDate: new Date(inv.dueDate!),
        totalAmount: parseFloat(inv.total || '0'),
        balance: parseFloat(inv.total || '0') - parseFloat(inv.amountPaid || '0'),
        status: inv.status as any,
        lineItems: lineItems.map(li => ({
          description: li.description,
          quantity: parseFloat(li.quantity),
          rate: parseFloat(li.unitPrice),
          amount: parseFloat(li.amount),
          itemId: li.productServiceName || undefined,
        })),
        syncStatus: inv.quickbooksInvoiceId ? 'synced' : 'pending',
        qbId: inv.quickbooksInvoiceId || undefined,
      });
    }

    return result;
  }

  async getPayrollRuns(): Promise<QBPayrollRun[]> {
    const runs = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.workspaceId, this.workspaceId))
      .orderBy(desc(payrollRuns.createdAt));

    const result: QBPayrollRun[] = [];

    for (const run of runs) {
      const entries = await db.select().from(payrollEntries)
        .where(eq(payrollEntries.payrollRunId, run.id));

      const entryDetails: QBPayrollEntry[] = [];

      for (const entry of entries) {
        const emp = entry.employeeId 
          ? await db.select().from(employees).where(eq(employees.id, entry.employeeId)).then(r => r[0])
          : null;

        entryDetails.push({
          employeeId: entry.employeeId || '',
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
          regularHours: parseFloat(entry.regularHours || '0'),
          overtimeHours: parseFloat(entry.overtimeHours || '0'),
          regularPay: parseFloat(entry.regularPay || '0'),
          overtimePay: parseFloat(entry.overtimePay || '0'),
          grossPay: parseFloat(entry.grossPay || '0'),
          taxes: parseFloat(entry.federalTax || '0') + parseFloat(entry.stateTax || '0') + parseFloat(entry.ficaTax || '0'),
          deductions: parseFloat(entry.totalDeductions || '0'),
          netPay: parseFloat(entry.netPay || '0'),
        });
      }

      result.push({
        id: run.id,
        payPeriodStart: new Date(run.periodStart!),
        payPeriodEnd: new Date(run.periodEnd!),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        payDate: (run as any).payDate ? new Date(run.payDate) : new Date(),
        totalGross: parseFloat(run.totalGrossPay || '0'),
        totalNet: parseFloat(run.totalNetPay || '0'),
        totalTaxes: parseFloat(run.totalFederalTax || '0') + parseFloat(run.totalStateTax || '0') + parseFloat(run.totalFicaTax || '0'),
        employeeCount: entries.length,
        status: run.status as any,
        entries: entryDetails,
        syncStatus: (run as any).quickbooksPayrollId ? 'synced' : 'pending',
      });
    }

    return result;
  }

  async createInvoice(data: {
    clientId: string;
    issueDate?: Date;
    dueDate?: Date;
    lineItems: Array<{ description: string; quantity: number; rate: number }>;
  }): Promise<QBInvoice> {
    const issueDate = data.issueDate || new Date();
    const dueDate = data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const total = data.lineItems.reduce((sum, li) => sum + li.quantity * li.rate, 0);
    const invoiceNumber = `INV-SB-${Date.now()}`;

    const [newInvoice] = await db.insert(invoices).values({
      workspaceId: this.workspaceId,
      clientId: data.clientId,
      invoiceNumber,
      issueDate,
      dueDate,
      subtotal: total.toFixed(2),
      taxRate: '0',
      taxAmount: '0',
      total: total.toFixed(2),
      amountPaid: '0',
      status: 'draft',
    }).returning();

    for (let i = 0; i < data.lineItems.length; i++) {
      const li = data.lineItems[i];
      await db.insert(invoiceLineItems).values({
        workspaceId: this.workspaceId,
        invoiceId: newInvoice.id,
        lineNumber: i + 1,
        description: li.description,
        quantity: li.quantity.toString(),
        unitPrice: li.rate.toFixed(2),
        amount: (li.quantity * li.rate).toFixed(2),
      });
    }

    const client = await db.select().from(clients).where(eq(clients.id, data.clientId)).then(r => r[0]);

    return {
      id: newInvoice.id,
      docNumber: invoiceNumber,
      customerId: data.clientId,
      customerName: client ? `${client.firstName} ${client.lastName}` : 'Unknown',
      txnDate: issueDate,
      dueDate,
      totalAmount: total,
      balance: total,
      status: 'draft',
      lineItems: data.lineItems.map(li => ({
        description: li.description,
        quantity: li.quantity,
        rate: li.rate,
        amount: li.quantity * li.rate,
      })),
      syncStatus: 'pending',
    };
  }

  async updateInvoiceStatus(invoiceId: string, status: 'draft' | 'sent' | 'paid'): Promise<void> {
    const updates: any = { status };
    
    if (status === 'paid') {
      const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, this.workspaceId)));
      if (inv) {
        updates.amountPaid = inv.total;
        updates.paidAt = new Date();
      }
    }

    await db.update(invoices)
      .set(updates)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, this.workspaceId)));
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
    await db.delete(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, this.workspaceId)));
  }

  async sendAllDraftInvoices(): Promise<{ success: boolean; message: string; details: any }> {
    const draftInvoices = await db.select().from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, this.workspaceId),
          eq(invoices.status, 'draft')
        )
      );

    if (draftInvoices.length === 0) {
      return { success: true, message: 'No draft invoices to send', details: { count: 0 } };
    }

    let sent = 0;
    for (const inv of draftInvoices) {
      await db.update(invoices)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(invoices.id, inv.id));
      sent++;
    }

    return {
      success: true,
      message: `Sent ${sent} draft invoices`,
      details: { count: sent, invoiceIds: draftInvoices.map(i => i.id) },
    };
  }

  async markAllInvoicesPaid(): Promise<{ success: boolean; message: string; details: any }> {
    const unpaidInvoices = await db.select().from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, this.workspaceId),
          sql`${invoices.status} IN ('draft', 'sent', 'overdue')`
        )
      );

    if (unpaidInvoices.length === 0) {
      return { success: true, message: 'No unpaid invoices', details: { count: 0, totalCollected: 0 } };
    }

    let paid = 0;
    let totalCollected = 0;
    for (const inv of unpaidInvoices) {
      const total = parseFloat(inv.total || '0');
      await db.update(invoices)
        .set({ status: 'paid', amountPaid: inv.total, paidAt: new Date() })
        .where(eq(invoices.id, inv.id));
      paid++;
      totalCollected += total;
    }

    return {
      success: true,
      message: `Marked ${paid} invoices as paid, collected $${totalCollected.toFixed(2)}`,
      details: { count: paid, totalCollected },
    };
  }

  async runAutomation(type: 'schedule' | 'invoice' | 'payroll' | 'sync_all'): Promise<{
    success: boolean;
    message: string;
    details: any;
  }> {
    switch (type) {
      case 'schedule':
        return this.runScheduleAutomation();
      case 'invoice':
        return this.runInvoiceAutomation();
      case 'payroll':
        return this.runPayrollAutomation();
      case 'sync_all':
        return this.runQuickBooksSync();
      default:
        return { success: false, message: 'Unknown automation type', details: {} };
    }
  }

  private async runScheduleAutomation(): Promise<{ success: boolean; message: string; details: any }> {
    const allEmployees = await db.select().from(employees)
      .where(and(eq(employees.workspaceId, this.workspaceId), eq(employees.isActive, true)));
    
    const allClients = await db.select().from(clients)
      .where(eq(clients.workspaceId, this.workspaceId));

    if (allEmployees.length === 0 || allClients.length === 0) {
      return { success: false, message: 'No employees or clients to schedule', details: {} };
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    let shiftsCreated = 0;

    for (let day = 0; day < 7; day++) {
      const shiftDate = new Date(tomorrow);
      shiftDate.setDate(tomorrow.getDate() + day);

      for (const client of allClients) {
        const randomEmployee = allEmployees[Math.floor(Math.random() * allEmployees.length)];
        const startHour = 6 + Math.floor(Math.random() * 4);
        const shiftLength = 8 + Math.floor(Math.random() * 4);

        const startTime = new Date(shiftDate);
        startTime.setHours(startHour, 0, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setHours(startTime.getHours() + shiftLength);

        await db.insert(shifts).values({
          workspaceId: this.workspaceId,
          employeeId: randomEmployee.id,
          clientId: client.id,
          startTime,
          endTime,
          status: 'scheduled',
          category: 'general',
        });

        shiftsCreated++;
      }
    }

    return {
      success: true,
      message: `Created ${shiftsCreated} shifts for the next 7 days`,
      details: { shiftsCreated, daysScheduled: 7, clientsCovered: allClients.length },
    };
  }

  private async runInvoiceAutomation(): Promise<{ success: boolean; message: string; details: any }> {
    const allApprovedEntries = await db.select().from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, this.workspaceId),
          eq(timeEntries.status, 'approved')
        )
      );
    
    const approvedEntries = allApprovedEntries.filter(e => !e.invoiceId);

    if (approvedEntries.length === 0) {
      return { success: true, message: 'No unbilled time entries to invoice', details: { invoicesCreated: 0 } };
    }

    const entriesByClient: Record<string, typeof approvedEntries> = {};
    
    for (const entry of approvedEntries) {
      const clientId = entry.clientId || 'unknown';
      if (!entriesByClient[clientId]) {
        entriesByClient[clientId] = [];
      }
      entriesByClient[clientId].push(entry);
    }

    let invoicesCreated = 0;
    let totalBilled = 0;

    for (const [clientId, entries] of Object.entries(entriesByClient)) {
      if (clientId === 'unknown') continue;

      const client = await db.select().from(clients).where(eq(clients.id, clientId)).then(r => r[0]);
      if (!client) continue;

      const billRate = parseFloat(client.contractRate || '35');
      const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.totalHours || '0'), 0);
      const total = totalHours * billRate;

      const invoiceNumber = `INV-AUTO-${Date.now()}-${clientId.slice(0, 8)}`;

      const [newInvoice] = await db.insert(invoices).values({
        workspaceId: this.workspaceId,
        clientId,
        invoiceNumber,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: total.toFixed(2),
        taxRate: '0',
        taxAmount: '0',
        total: total.toFixed(2),
        amountPaid: '0',
        status: 'draft',
      }).returning();

      await db.insert(invoiceLineItems).values({
        workspaceId: this.workspaceId,
        invoiceId: newInvoice.id,
        lineNumber: 1,
        description: `Security Services - ${totalHours.toFixed(2)} hours`,
        quantity: totalHours.toFixed(2),
        unitPrice: billRate.toFixed(2),
        amount: total.toFixed(2),
        timeEntryIds: entries.map(e => e.id),
      });

      for (const entry of entries) {
        await db.update(timeEntries)
          .set({ invoiced: true, invoiceId: newInvoice.id })
          .where(eq(timeEntries.id, entry.id));
      }

      invoicesCreated++;
      totalBilled += total;
    }

    return {
      success: true,
      message: `Created ${invoicesCreated} invoices totaling $${totalBilled.toFixed(2)}`,
      details: { invoicesCreated, totalBilled, entriesProcessed: approvedEntries.length },
    };
  }

  private async runPayrollAutomation(): Promise<{ success: boolean; message: string; details: any }> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() - periodEnd.getDay());
    periodEnd.setHours(23, 59, 59, 999);

    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 6);
    periodStart.setHours(0, 0, 0, 0);

    const approvedEntries = await db.select().from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, this.workspaceId),
          eq(timeEntries.status, 'approved'),
          gte(timeEntries.clockIn, periodStart),
          lte(timeEntries.clockIn, periodEnd)
        )
      );

    if (approvedEntries.length === 0) {
      return { success: true, message: 'No approved time entries for this pay period', details: {} };
    }

    const entriesByEmployee: Record<string, typeof approvedEntries> = {};
    
    for (const entry of approvedEntries) {
      const empId = entry.employeeId || 'unknown';
      if (!entriesByEmployee[empId]) {
        entriesByEmployee[empId] = [];
      }
      entriesByEmployee[empId].push(entry);
    }

    let totalGross = 0;
    let totalNet = 0;
    let totalFederal = 0;
    let totalState = 0;
    let totalFica = 0;
    const payrollEntryRecords: any[] = [];

    for (const [empId, entries] of Object.entries(entriesByEmployee)) {
      if (empId === 'unknown') continue;

      const emp = await db.select().from(employees).where(eq(employees.id, empId)).then(r => r[0]);
      if (!emp) continue;

      const hourlyRate = parseFloat(emp.hourlyRate || '20');
      const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.totalHours || '0'), 0);
      
      const regularHours = Math.min(totalHours, 40);
      const overtimeHours = Math.max(0, totalHours - 40);
      
      const regularPay = regularHours * hourlyRate;
      const overtimePay = overtimeHours * hourlyRate * 1.5;
      const grossPay = regularPay + overtimePay;

      const federalTax = grossPay * 0.12;
      const stateTax = grossPay * 0.05;
      const ficaTax = grossPay * 0.0765;
      const totalTax = federalTax + stateTax + ficaTax;
      const netPay = grossPay - totalTax;

      payrollEntryRecords.push({
        workspaceId: this.workspaceId,
        employeeId: empId,
        hourlyRate: hourlyRate.toFixed(2),
        regularHours: regularHours.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        regularPay: regularPay.toFixed(2),
        overtimePay: overtimePay.toFixed(2),
        grossPay: grossPay.toFixed(2),
        federalTax: federalTax.toFixed(2),
        stateTax: stateTax.toFixed(2),
        ficaTax: ficaTax.toFixed(2),
        totalDeductions: '0',
        netPay: netPay.toFixed(2),
      });

      totalGross += grossPay;
      totalNet += netPay;
      totalFederal += federalTax;
      totalState += stateTax;
      totalFica += ficaTax;
    }

    const [newRun] = await db.insert(payrollRuns).values({
      workspaceId: this.workspaceId,
      periodStart,
      periodEnd,
      processedAt: new Date(periodEnd.getTime() + 3 * 24 * 60 * 60 * 1000),
      status: 'draft',
      totalGrossPay: totalGross.toFixed(2),
      totalNetPay: totalNet.toFixed(2),
      totalTaxes: (totalFederal + totalState + totalFica).toFixed(2),
    }).returning();

    for (const entry of payrollEntryRecords) {
      await db.insert(payrollEntries).values({
        ...entry,
        payrollRunId: newRun.id,
      });
    }

    return {
      success: true,
      message: `Created payroll run with ${payrollEntryRecords.length} employees, $${totalGross.toFixed(2)} gross`,
      details: {
        payrollRunId: newRun.id,
        periodStart,
        periodEnd,
        employeesProcessed: payrollEntryRecords.length,
        totalGross,
        totalNet,
      },
    };
  }

  private async runQuickBooksSync(): Promise<{ success: boolean; message: string; details: any }> {
    const [connection] = await db.select().from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, this.workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      );

    if (!connection || connection.status !== 'connected') {
      return { success: false, message: 'QuickBooks not connected', details: {} };
    }

    const allClients = await db.select().from(clients)
      .where(eq(clients.workspaceId, this.workspaceId));
    
    const unsyncedClients = allClients.filter(c => !c.quickbooksClientId);
    
    let customersSynced = 0;
    for (const client of unsyncedClients) {
      await db.update(clients)
        .set({ quickbooksClientId: `QBC-${client.id.slice(0, 8)}` })
        .where(eq(clients.id, client.id));
      customersSynced++;
    }

    const allEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, this.workspaceId));
    
    const unsyncedEmployees = allEmployees.filter(e => !e.quickbooksVendorId);
    
    let vendorsSynced = 0;
    for (const emp of unsyncedEmployees) {
      await db.update(employees)
        .set({ quickbooksVendorId: `QBV-${emp.id.slice(0, 8)}` })
        .where(eq(employees.id, emp.id));
      vendorsSynced++;
    }

    const unsyncedInvoices = await db.select().from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, this.workspaceId),
          isNull(invoices.quickbooksInvoiceId)
        )
      );

    let invoicesSynced = 0;
    for (const inv of unsyncedInvoices) {
      await db.update(invoices)
        .set({ quickbooksInvoiceId: `QBI-${inv.id.slice(0, 8)}` })
        .where(eq(invoices.id, inv.id));
      invoicesSynced++;
    }

    await db.update(partnerConnections)
      .set({ lastSyncAt: new Date() })
      .where(eq(partnerConnections.id, connection.id));

    return {
      success: true,
      message: `Synced ${customersSynced} customers, ${vendorsSynced} vendors, ${invoicesSynced} invoices to QuickBooks`,
      details: {
        customersSynced,
        vendorsSynced,
        invoicesSynced,
        lastSync: new Date(),
      },
    };
  }

  async getTimeEntries(): Promise<any[]> {
    const entries = await db.select().from(timeEntries)
      .where(eq(timeEntries.workspaceId, this.workspaceId))
      .orderBy(desc(timeEntries.clockIn))
      .limit(100);

    const result = [];
    for (const entry of entries) {
      const emp = entry.employeeId 
        ? await db.select().from(employees).where(eq(employees.id, entry.employeeId)).then(r => r[0])
        : null;
      const client = entry.clientId 
        ? await db.select().from(clients).where(eq(clients.id, entry.clientId)).then(r => r[0])
        : null;

      result.push({
        id: entry.id,
        employeeId: entry.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        clientId: entry.clientId,
        clientName: client ? (client.companyName || `${client.firstName} ${client.lastName}`.trim() || 'Unknown') : 'Unknown',
        clockIn: entry.clockIn,
        clockOut: entry.clockOut,
        totalHours: parseFloat(entry.totalHours || '0'),
        status: entry.status,
        invoiced: entry.invoiceId,
      });
    }

    return result;
  }

  async approveTimeEntry(entryId: string): Promise<void> {
    await db.update(timeEntries)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(eq(timeEntries.id, entryId));
  }

  async getShifts(): Promise<any[]> {
    const allShifts = await db.select().from(shifts)
      .where(eq(shifts.workspaceId, this.workspaceId))
      .orderBy(desc(shifts.startTime))
      .limit(100);

    const result = [];
    for (const shift of allShifts) {
      const emp = shift.employeeId 
        ? await db.select().from(employees).where(eq(employees.id, shift.employeeId)).then(r => r[0])
        : null;
      const client = shift.clientId 
        ? await db.select().from(clients).where(eq(clients.id, shift.clientId)).then(r => r[0])
        : null;

      result.push({
        id: shift.id,
        employeeId: shift.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned',
        clientId: shift.clientId,
        clientName: client ? (client.companyName || `${client.firstName} ${client.lastName}`.trim() || 'Unknown') : 'Unknown',
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: shift.status,
        shiftType: (shift as any).shiftType,
      });
    }

    return result;
  }
}

export const sandboxQuickBooksSimulator = new SandboxQuickBooksSimulator();
