import { db } from '../../db';
import { 
  users, workspaces, employees, clients, shifts, timeEntries, 
  invoices, invoiceLineItems, payrollRuns, payrollEntries,
  workspaceCredits, partnerConnections
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';

const SANDBOX_WORKSPACE_ID = 'sandbox-test-workspace';
const SANDBOX_USER_ID = 'sandbox-test-user';

const SECURITY_POSITIONS = [
  'Armed Guard', 'Unarmed Guard', 'Patrol Officer', 'Site Supervisor',
  'Control Room Operator', 'Event Security', 'Executive Protection',
  'Loss Prevention', 'Mobile Patrol', 'Access Control'
];

const FIRST_NAMES = [
  'James', 'Michael', 'Robert', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Christopher', 'Daniel',
  'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin',
  'Maria', 'Jennifer', 'Linda', 'Patricia', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Nancy', 'Lisa', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle',
  'Carlos', 'Juan', 'Jose', 'Luis', 'Miguel', 'Angel', 'Francisco', 'Jorge', 'Pedro', 'Rafael',
  'Jamal', 'Darius', 'Marcus', 'Terrell', 'DeShawn', 'Malik', 'Andre', 'Tyrone', 'Lamar', 'Reggie'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
];

const CLIENT_COMPANIES = [
  { name: 'Metro Tech Campus', industry: 'Technology', billRate: 35 },
  { name: 'Sunrise Medical Center', industry: 'Healthcare', billRate: 40 },
  { name: 'Harbor View Mall', industry: 'Retail', billRate: 28 },
  { name: 'First National Bank HQ', industry: 'Finance', billRate: 45 },
  { name: 'Cityscape Apartments', industry: 'Residential', billRate: 25 },
  { name: 'Industrial Park West', industry: 'Manufacturing', billRate: 32 },
  { name: 'Grand Hotel & Resort', industry: 'Hospitality', billRate: 38 },
  { name: 'State University', industry: 'Education', billRate: 30 },
  { name: 'Downtown Office Tower', industry: 'Commercial', billRate: 42 },
  { name: 'County Government Center', industry: 'Government', billRate: 35 }
];

const COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

interface SimulationConfig {
  employeeCount: number;
  clientCount: number;
  weeksOfHistory: number;
  includeTimeEntries: boolean;
  includeSchedules: boolean;
  includeInvoices: boolean;
  includePayroll: boolean;
}

interface SimulationResult {
  workspaceId: string;
  employeesCreated: number;
  clientsCreated: number;
  shiftsCreated: number;
  timeEntriesCreated: number;
  invoicesCreated: number;
  payrollRunsCreated: number;
  durationMs: number;
  summary: string;
}

export class SandboxSimulationService {
  
  async createSandboxWorkspace(): Promise<{ userId: string; workspaceId: string }> {
    console.log('[Sandbox] Creating sandbox test workspace...');
    
    const existingUser = await db.select().from(users).where(eq(users.id, SANDBOX_USER_ID));
    
    if (existingUser.length > 0) {
      console.log('[Sandbox] Sandbox already exists, clearing and recreating...');
      await this.clearSandboxData();
    } else {
      await db.insert(users).values({
        id: SANDBOX_USER_ID,
        email: 'sandbox@coaileague.test',
        firstName: 'Sandbox',
        lastName: 'Admin',
        role: 'user',
        currentWorkspaceId: SANDBOX_WORKSPACE_ID,
      });
    }

    const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, SANDBOX_WORKSPACE_ID));
    
    if (existingWorkspace.length === 0) {
      await db.insert(workspaces).values({
        id: SANDBOX_WORKSPACE_ID,
        name: 'Sandbox Test Workspace',
        ownerId: SANDBOX_USER_ID,
        companyName: 'Statewide Security Services (Sandbox)',
        address: '1234 Test Street, Test City, CA 90210',
        phone: '(555) 000-0000',
        website: 'https://sandbox.test',
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
        maxEmployees: 999,
        maxClients: 999,
        platformFeePercentage: '5.00',
        workspaceType: 'business',
      });

      await db.insert(workspaceCredits).values({
        workspaceId: SANDBOX_WORKSPACE_ID,
        balance: 100000,
      }).onConflictDoNothing();
    }

    console.log('[Sandbox] Sandbox workspace ready');
    return { userId: SANDBOX_USER_ID, workspaceId: SANDBOX_WORKSPACE_ID };
  }

  async clearSandboxData(): Promise<void> {
    console.log('[Sandbox] Clearing existing sandbox data...');
    
    await db.delete(payrollEntries).where(eq(payrollEntries.workspaceId, SANDBOX_WORKSPACE_ID));
    await db.delete(payrollRuns).where(eq(payrollRuns.workspaceId, SANDBOX_WORKSPACE_ID));
    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.workspaceId, SANDBOX_WORKSPACE_ID));
    await db.delete(invoices).where(eq(invoices.workspaceId, SANDBOX_WORKSPACE_ID));
    await db.delete(timeEntries).where(eq(timeEntries.workspaceId, SANDBOX_WORKSPACE_ID));
    await db.delete(shifts).where(eq(shifts.workspaceId, SANDBOX_WORKSPACE_ID));
    await db.delete(employees).where(eq(employees.workspaceId, SANDBOX_WORKSPACE_ID));
    await db.delete(clients).where(eq(clients.workspaceId, SANDBOX_WORKSPACE_ID));
    
    console.log('[Sandbox] Sandbox data cleared');
  }

  async runFullSimulation(config: Partial<SimulationConfig> = {}): Promise<SimulationResult> {
    const startTime = Date.now();
    
    const fullConfig: SimulationConfig = {
      employeeCount: config.employeeCount || 100,
      clientCount: config.clientCount || 10,
      weeksOfHistory: config.weeksOfHistory || 4,
      includeTimeEntries: config.includeTimeEntries !== false,
      includeSchedules: config.includeSchedules !== false,
      includeInvoices: config.includeInvoices !== false,
      includePayroll: config.includePayroll !== false,
    };

    console.log(`[Sandbox] Starting full simulation with config:`, fullConfig);

    await this.createSandboxWorkspace();

    const employeesCreated = await this.seedEmployees(fullConfig.employeeCount);
    const clientsCreated = await this.seedClients(fullConfig.clientCount);

    let shiftsCreated = 0;
    let timeEntriesCreated = 0;
    let invoicesCreated = 0;
    let payrollRunsCreated = 0;

    if (fullConfig.includeSchedules) {
      shiftsCreated = await this.seedSchedules(fullConfig.weeksOfHistory);
    }

    if (fullConfig.includeTimeEntries) {
      timeEntriesCreated = await this.seedTimeEntries(fullConfig.weeksOfHistory);
    }

    if (fullConfig.includeInvoices) {
      invoicesCreated = await this.seedInvoices(fullConfig.weeksOfHistory);
    }

    if (fullConfig.includePayroll) {
      payrollRunsCreated = await this.seedPayroll(fullConfig.weeksOfHistory);
    }

    const durationMs = Date.now() - startTime;

    const result: SimulationResult = {
      workspaceId: SANDBOX_WORKSPACE_ID,
      employeesCreated,
      clientsCreated,
      shiftsCreated,
      timeEntriesCreated,
      invoicesCreated,
      payrollRunsCreated,
      durationMs,
      summary: `Sandbox simulation complete: ${employeesCreated} employees, ${clientsCreated} clients, ${shiftsCreated} shifts, ${timeEntriesCreated} time entries, ${invoicesCreated} invoices, ${payrollRunsCreated} payroll runs in ${durationMs}ms`,
    };

    platformEventBus.emit('sandbox_simulation_complete', {
      workspaceId: SANDBOX_WORKSPACE_ID,
      result,
    });

    console.log(`[Sandbox] ${result.summary}`);
    return result;
  }

  private async seedEmployees(count: number): Promise<number> {
    console.log(`[Sandbox] Seeding ${count} employees...`);
    
    const employeeRecords = [];
    const usedCombos = new Set<string>();

    for (let i = 0; i < count; i++) {
      let firstName: string, lastName: string, combo: string;
      
      do {
        firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
        combo = `${firstName}-${lastName}`;
      } while (usedCombos.has(combo) && usedCombos.size < FIRST_NAMES.length * LAST_NAMES.length);
      
      usedCombos.add(combo);

      const position = SECURITY_POSITIONS[Math.floor(Math.random() * SECURITY_POSITIONS.length)];
      const isManager = i < 10;
      const hourlyRate = (18 + Math.random() * 17).toFixed(2);

      employeeRecords.push({
        workspaceId: SANDBOX_WORKSPACE_ID,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@sandbox.test`,
        phone: `(555) ${String(100 + i).padStart(3, '0')}-${String(1000 + i).padStart(4, '0')}`,
        role: position,
        hourlyRate,
        workspaceRole: isManager ? 'manager' : 'employee',
        isActive: Math.random() > 0.05,
        color: COLORS[i % COLORS.length],
        hireDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000 * 3),
      });
    }

    await db.insert(employees).values(employeeRecords);
    console.log(`[Sandbox] Created ${count} employees`);
    return count;
  }

  private async seedClients(count: number): Promise<number> {
    console.log(`[Sandbox] Seeding ${count} clients...`);
    
    const clientRecords = [];

    for (let i = 0; i < count && i < CLIENT_COMPANIES.length; i++) {
      const company = CLIENT_COMPANIES[i];
      const contactFirst = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const contactLast = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];

      clientRecords.push({
        workspaceId: SANDBOX_WORKSPACE_ID,
        firstName: contactFirst,
        lastName: contactLast,
        company: company.name,
        email: `${contactFirst.toLowerCase()}.${contactLast.toLowerCase()}@${company.name.toLowerCase().replace(/\s+/g, '')}.test`,
        phone: `(555) ${String(200 + i).padStart(3, '0')}-${String(2000 + i).padStart(4, '0')}`,
        address: `${1000 + i * 100} ${company.industry} Blvd, Test City, CA 90210`,
        billingRate: company.billRate.toFixed(2),
        strategicTier: i < 3 ? 'enterprise' : i < 6 ? 'premium' : 'standard',
        tierScore: (50 + Math.random() * 50).toFixed(2),
        isActive: true,
      });
    }

    await db.insert(clients).values(clientRecords);
    console.log(`[Sandbox] Created ${count} clients`);
    return count;
  }

  private async seedSchedules(weeksOfHistory: number): Promise<number> {
    console.log(`[Sandbox] Seeding ${weeksOfHistory} weeks of schedules...`);
    
    const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, SANDBOX_WORKSPACE_ID));
    const allClients = await db.select().from(clients).where(eq(clients.workspaceId, SANDBOX_WORKSPACE_ID));
    
    if (allEmployees.length === 0 || allClients.length === 0) {
      console.log('[Sandbox] No employees or clients to create schedules for');
      return 0;
    }

    const shiftRecords = [];
    const now = new Date();

    for (let week = 0; week < weeksOfHistory; week++) {
      for (let day = 0; day < 7; day++) {
        const shiftDate = new Date(now);
        shiftDate.setDate(now.getDate() - (weeksOfHistory - week - 1) * 7 - (6 - day));

        const shiftsPerDay = Math.floor(allEmployees.length * 0.6);
        
        for (let s = 0; s < shiftsPerDay; s++) {
          const employee = allEmployees[s % allEmployees.length];
          const client = allClients[s % allClients.length];
          
          const shiftTypes = [
            { start: 6, duration: 8, name: 'Day Shift' },
            { start: 14, duration: 8, name: 'Swing Shift' },
            { start: 22, duration: 8, name: 'Night Shift' },
            { start: 8, duration: 12, name: '12-Hour Day' },
            { start: 20, duration: 12, name: '12-Hour Night' },
          ];
          
          const shiftType = shiftTypes[s % shiftTypes.length];
          
          const startTime = new Date(shiftDate);
          startTime.setHours(shiftType.start, 0, 0, 0);
          
          const endTime = new Date(startTime);
          endTime.setHours(startTime.getHours() + shiftType.duration);

          shiftRecords.push({
            workspaceId: SANDBOX_WORKSPACE_ID,
            employeeId: employee.id,
            clientId: client.id,
            title: `${client.company} - ${shiftType.name}`,
            startTime,
            endTime,
            status: shiftDate < now ? 'completed' : 'scheduled',
            notes: `Auto-generated sandbox shift for testing`,
          });
        }
      }
    }

    if (shiftRecords.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < shiftRecords.length; i += batchSize) {
        const batch = shiftRecords.slice(i, i + batchSize);
        await db.insert(shifts).values(batch);
      }
    }

    console.log(`[Sandbox] Created ${shiftRecords.length} shifts`);
    return shiftRecords.length;
  }

  private async seedTimeEntries(weeksOfHistory: number): Promise<number> {
    console.log(`[Sandbox] Seeding ${weeksOfHistory} weeks of time entries...`);
    
    const allShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.workspaceId, SANDBOX_WORKSPACE_ID),
        eq(shifts.status, 'completed')
      )
    );

    if (allShifts.length === 0) {
      console.log('[Sandbox] No completed shifts to create time entries for');
      return 0;
    }

    const timeEntryRecords = [];

    for (const shift of allShifts) {
      const variance = (Math.random() - 0.5) * 30;
      const clockIn = new Date(shift.startTime!);
      clockIn.setMinutes(clockIn.getMinutes() + variance);

      const clockOut = new Date(shift.endTime!);
      clockOut.setMinutes(clockOut.getMinutes() + (Math.random() - 0.5) * 15);

      const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
      const breakMinutes = hoursWorked > 6 ? 30 : 0;

      timeEntryRecords.push({
        workspaceId: SANDBOX_WORKSPACE_ID,
        shiftId: shift.id,
        employeeId: shift.employeeId,
        clientId: shift.clientId,
        clockIn,
        clockOut,
        hoursWorked: hoursWorked.toFixed(2),
        breakMinutes,
        status: 'approved',
        approvedBy: SANDBOX_USER_ID,
        approvedAt: new Date(),
        notes: 'Auto-generated sandbox time entry',
      });
    }

    if (timeEntryRecords.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < timeEntryRecords.length; i += batchSize) {
        const batch = timeEntryRecords.slice(i, i + batchSize);
        await db.insert(timeEntries).values(batch);
      }
    }

    console.log(`[Sandbox] Created ${timeEntryRecords.length} time entries`);
    return timeEntryRecords.length;
  }

  private async seedInvoices(weeksOfHistory: number): Promise<number> {
    console.log(`[Sandbox] Seeding invoices for ${weeksOfHistory} weeks...`);
    
    const allClients = await db.select().from(clients).where(eq(clients.workspaceId, SANDBOX_WORKSPACE_ID));
    
    if (allClients.length === 0) {
      console.log('[Sandbox] No clients to create invoices for');
      return 0;
    }

    let invoicesCreated = 0;

    for (let week = 0; week < weeksOfHistory; week++) {
      const invoiceDate = new Date();
      invoiceDate.setDate(invoiceDate.getDate() - (weeksOfHistory - week - 1) * 7);
      
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30);

      for (const client of allClients) {
        const hours = 40 + Math.random() * 120;
        const rate = parseFloat(client.billingRate || '35');
        const subtotal = hours * rate;
        const tax = subtotal * 0.0875;
        const total = subtotal + tax;

        const [invoice] = await db.insert(invoices).values({
          workspaceId: SANDBOX_WORKSPACE_ID,
          clientId: client.id,
          invoiceNumber: `INV-SB-${Date.now()}-${invoicesCreated}`,
          invoiceDate,
          dueDate,
          subtotal: subtotal.toFixed(2),
          taxAmount: tax.toFixed(2),
          totalAmount: total.toFixed(2),
          status: week < weeksOfHistory - 1 ? 'paid' : 'pending',
          paidAmount: week < weeksOfHistory - 1 ? total.toFixed(2) : '0.00',
          notes: 'Auto-generated sandbox invoice',
        }).returning();

        await db.insert(invoiceLineItems).values({
          workspaceId: SANDBOX_WORKSPACE_ID,
          invoiceId: invoice.id,
          description: `Security services for ${client.company}`,
          quantity: hours.toFixed(2),
          unitPrice: rate.toFixed(2),
          amount: subtotal.toFixed(2),
        });

        invoicesCreated++;
      }
    }

    console.log(`[Sandbox] Created ${invoicesCreated} invoices`);
    return invoicesCreated;
  }

  private async seedPayroll(weeksOfHistory: number): Promise<number> {
    console.log(`[Sandbox] Seeding payroll for ${weeksOfHistory} weeks...`);
    
    const allEmployees = await db.select().from(employees).where(
      and(
        eq(employees.workspaceId, SANDBOX_WORKSPACE_ID),
        eq(employees.isActive, true)
      )
    );

    if (allEmployees.length === 0) {
      console.log('[Sandbox] No employees to create payroll for');
      return 0;
    }

    let payrollRunsCreated = 0;

    for (let week = 0; week < weeksOfHistory; week++) {
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - (weeksOfHistory - week) * 7);
      periodStart.setHours(0, 0, 0, 0);
      
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);

      const payDate = new Date(periodEnd);
      payDate.setDate(payDate.getDate() + 3);

      let totalGross = 0;
      let totalNet = 0;

      const [payrollRun] = await db.insert(payrollRuns).values({
        workspaceId: SANDBOX_WORKSPACE_ID,
        periodStart,
        periodEnd,
        payDate,
        status: 'completed',
        processedAt: new Date(),
        processedBy: SANDBOX_USER_ID,
        totalGross: '0.00',
        totalNet: '0.00',
        employeeCount: allEmployees.length,
        notes: 'Auto-generated sandbox payroll',
      }).returning();

      const payrollEntryRecords = [];

      for (const employee of allEmployees) {
        const hoursWorked = 32 + Math.random() * 16;
        const overtimeHours = Math.max(0, hoursWorked - 40);
        const regularHours = hoursWorked - overtimeHours;
        const hourlyRate = parseFloat(employee.hourlyRate || '20');
        
        const regularPay = regularHours * hourlyRate;
        const overtimePay = overtimeHours * hourlyRate * 1.5;
        const grossPay = regularPay + overtimePay;
        
        const federalTax = grossPay * 0.12;
        const stateTax = grossPay * 0.05;
        const socialSecurity = grossPay * 0.062;
        const medicare = grossPay * 0.0145;
        const totalDeductions = federalTax + stateTax + socialSecurity + medicare;
        const netPay = grossPay - totalDeductions;

        totalGross += grossPay;
        totalNet += netPay;

        payrollEntryRecords.push({
          workspaceId: SANDBOX_WORKSPACE_ID,
          payrollRunId: payrollRun.id,
          employeeId: employee.id,
          regularHours: regularHours.toFixed(2),
          overtimeHours: overtimeHours.toFixed(2),
          regularPay: regularPay.toFixed(2),
          overtimePay: overtimePay.toFixed(2),
          grossPay: grossPay.toFixed(2),
          federalTax: federalTax.toFixed(2),
          stateTax: stateTax.toFixed(2),
          socialSecurity: socialSecurity.toFixed(2),
          medicare: medicare.toFixed(2),
          netPay: netPay.toFixed(2),
          status: 'paid',
        });
      }

      if (payrollEntryRecords.length > 0) {
        await db.insert(payrollEntries).values(payrollEntryRecords);
      }

      await db.update(payrollRuns)
        .set({
          totalGross: totalGross.toFixed(2),
          totalNet: totalNet.toFixed(2),
        })
        .where(eq(payrollRuns.id, payrollRun.id));

      payrollRunsCreated++;
    }

    console.log(`[Sandbox] Created ${payrollRunsCreated} payroll runs`);
    return payrollRunsCreated;
  }

  async getSandboxStatus(): Promise<{
    exists: boolean;
    workspaceId: string;
    stats: {
      employees: number;
      clients: number;
      shifts: number;
      timeEntries: number;
      invoices: number;
      payrollRuns: number;
    };
  }> {
    const workspace = await db.select().from(workspaces).where(eq(workspaces.id, SANDBOX_WORKSPACE_ID));
    
    if (workspace.length === 0) {
      return {
        exists: false,
        workspaceId: SANDBOX_WORKSPACE_ID,
        stats: { employees: 0, clients: 0, shifts: 0, timeEntries: 0, invoices: 0, payrollRuns: 0 },
      };
    }

    const [employeeCount] = await db.select({ count: employees.id }).from(employees).where(eq(employees.workspaceId, SANDBOX_WORKSPACE_ID));
    const [clientCount] = await db.select({ count: clients.id }).from(clients).where(eq(clients.workspaceId, SANDBOX_WORKSPACE_ID));
    const [shiftCount] = await db.select({ count: shifts.id }).from(shifts).where(eq(shifts.workspaceId, SANDBOX_WORKSPACE_ID));
    const [timeEntryCount] = await db.select({ count: timeEntries.id }).from(timeEntries).where(eq(timeEntries.workspaceId, SANDBOX_WORKSPACE_ID));
    const [invoiceCount] = await db.select({ count: invoices.id }).from(invoices).where(eq(invoices.workspaceId, SANDBOX_WORKSPACE_ID));
    const [payrollRunCount] = await db.select({ count: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.workspaceId, SANDBOX_WORKSPACE_ID));

    return {
      exists: true,
      workspaceId: SANDBOX_WORKSPACE_ID,
      stats: {
        employees: Number(employeeCount?.count) || 0,
        clients: Number(clientCount?.count) || 0,
        shifts: Number(shiftCount?.count) || 0,
        timeEntries: Number(timeEntryCount?.count) || 0,
        invoices: Number(invoiceCount?.count) || 0,
        payrollRuns: Number(payrollRunCount?.count) || 0,
      },
    };
  }

  getWorkspaceId(): string {
    return SANDBOX_WORKSPACE_ID;
  }
}

export const sandboxSimulationService = new SandboxSimulationService();
