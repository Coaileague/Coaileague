// Demo Workspace Seeding Script
// Creates a pre-populated demo workspace with realistic sample data

import { db } from "./db";
import { users, workspaces, employees, clients, shifts, timeEntries, invoices, invoiceLineItems, payrollRuns, payrollEntries } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const DEMO_USER_ID = "demo-user-00000000";
const DEMO_WORKSPACE_ID = "demo-workspace-00000000";

export { DEMO_USER_ID, DEMO_WORKSPACE_ID };

export async function refreshDemoData() {
  // Production guard — demo data must NEVER be seeded in production (CLAUDE.md §A)
  const { isProduction } = await import('./lib/isProduction');
  if (isProduction()) { console.log('🔄 Demo refresh skipped — production environment'); return; }

  console.log("🔄 Refreshing demo workspace data...");

  // Delete dependent data in correct FK order (transaction-safe)
  await db.delete(payrollEntries).where(eq(payrollEntries.workspaceId, DEMO_WORKSPACE_ID));
  await db.delete(payrollRuns).where(eq(payrollRuns.workspaceId, DEMO_WORKSPACE_ID));
  // Delete invoice line items through parent invoices (cascade delete)
  await db.delete(invoices).where(eq(invoices.workspaceId, DEMO_WORKSPACE_ID));
  await db.delete(timeEntries).where(eq(timeEntries.workspaceId, DEMO_WORKSPACE_ID));
  await db.delete(shifts).where(eq(shifts.workspaceId, DEMO_WORKSPACE_ID));
  await db.delete(employees).where(eq(employees.workspaceId, DEMO_WORKSPACE_ID));
  await db.delete(clients).where(eq(clients.workspaceId, DEMO_WORKSPACE_ID));

  console.log("✅ Cleared existing demo data");

  // Re-create all data (employees, clients, shifts, etc.)
  await populateDemoData();

  console.log("✅ Demo workspace refresh complete!");
  return { userId: DEMO_USER_ID, workspaceId: DEMO_WORKSPACE_ID };
}

export async function seedDemoWorkspace() {
  // Production guard — demo data must NEVER be seeded in production (CLAUDE.md §A)
  const { isProduction } = await import('./lib/isProduction');
  if (isProduction()) { console.log('🌱 Demo seed skipped — production environment'); return; }

  console.log("🌱 Seeding demo workspace...");

  // Check if demo user already exists
  const existingUser = await db.select().from(users).where(eq(users.id, DEMO_USER_ID));
  
  if (existingUser.length > 0) {
    console.log("✅ Demo user already exists");
    return { userId: DEMO_USER_ID, workspaceId: DEMO_WORKSPACE_ID };
  }

  // 1. Create demo user
  const [demoUser] = await db.insert(users).values({
    id: DEMO_USER_ID,
    email: "demo@coaileague.test",
    firstName: "Demo",
    lastName: "User",
    role: "user",
    currentWorkspaceId: DEMO_WORKSPACE_ID,
  }).returning();

  console.log("✅ Created demo user");

  // 2. Create demo workspace
  const [demoWorkspace] = await db.insert(workspaces).values({
    id: DEMO_WORKSPACE_ID,
    name: "Demo Workspace",
    ownerId: DEMO_USER_ID,
    companyName: "Acme Services Inc.",
    address: "123 Demo Street, San Francisco, CA 94102",
    phone: "(555) 123-4567",
    website: "https://acmeservices.demo",
    subscriptionTier: "enterprise",
    subscriptionStatus: "active",
    maxEmployees: 999,
    maxClients: 999,
    platformFeePercentage: "10.00",
  }).returning();

  console.log("✅ Created demo workspace");

  // 3. Populate with data
  await populateDemoData();

  console.log("🎉 Demo workspace seeded successfully!");
  return { userId: DEMO_USER_ID, workspaceId: DEMO_WORKSPACE_ID };
}

async function populateDemoData() {
  // Create employee record for the demo user (so they can see their own paychecks)
  const [demoUserEmployee] = await db.insert(employees).values({
    workspaceId: DEMO_WORKSPACE_ID,
    userId: DEMO_USER_ID, // CRITICAL: Link employee to user for paycheck access
    firstName: "Demo",
    lastName: "User",
    email: "demo@coaileague.test",
    role: "Platform Administrator",
    hourlyRate: "50.00",
    workspaceRole: "org_owner", // FULL ADMIN ACCESS - All features enabled for E2E testing
    isActive: true,
    color: "#6366f1",
  }).returning();

  console.log("✅ Created demo user employee record");

  // 4. Create sample employees (team members)
  const employeeData = [
    { firstName: "Sarah", lastName: "Johnson", email: "sarah.j@demo.com", role: "Lead Technician", hourlyRate: "75.00", color: "#3b82f6", workspaceRole: "manager", is1099Eligible: false },
    { firstName: "Michael", lastName: "Chen", email: "michael.c@demo.com", role: "Senior Consultant", hourlyRate: "85.00", color: "#8b5cf6", workspaceRole: "manager", is1099Eligible: false },
    { firstName: "Emma", lastName: "Williams", email: "emma.w@demo.com", role: "Field Specialist", hourlyRate: "65.00", color: "#ec4899", workspaceRole: "employee", is1099Eligible: false },
    { firstName: "James", lastName: "Davis", email: "james.d@demo.com", role: "Technician", hourlyRate: "60.00", color: "#10b981", workspaceRole: "employee", is1099Eligible: true },
    { firstName: "Lisa", lastName: "Martinez", email: "lisa.m@demo.com", role: "Consultant", hourlyRate: "70.00", color: "#f59e0b", workspaceRole: "employee", is1099Eligible: true },
  ];

  const createdEmployees = [demoUserEmployee]; // Include demo user in employees list
  for (const emp of employeeData) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [employee] = await db.insert(employees).values({
      ...emp,
      workspaceId: DEMO_WORKSPACE_ID,
    }).returning();
    createdEmployees.push(employee);
  }

  console.log(`✅ Created ${createdEmployees.length} employees (including demo user)`);

  // 4. Create sample clients
  const clientData = [
    { firstName: "Robert", lastName: "Anderson", company: "TechCorp", email: "robert@techcorp.com", phone: "(555) 111-2222", contractRate: "45.00", coverageType: "business_hours", coverageDays: ["monday","tuesday","wednesday","thursday","friday"], coverageStartTime: "06:00", coverageEndTime: "22:00", minimumStaffing: 2 },
    { firstName: "Jennifer", lastName: "Thompson", company: "Healthcare Plus", email: "jennifer@healthcareplus.com", phone: "(555) 333-4444", contractRate: "55.00", coverageType: "24_7", minimumStaffing: 3 },
    { firstName: "David", lastName: "Miller", company: "Retail Solutions", email: "david@retailsolutions.com", phone: "(555) 555-6666", contractRate: "40.00", coverageType: "custom", coverageDays: ["monday","tuesday","wednesday","thursday","friday","saturday"], coverageStartTime: "08:00", coverageEndTime: "20:00", minimumStaffing: 1 },
  ];

  const createdClients = [];
  for (const client of clientData) {
    const [createdClient] = await db.insert(clients).values({
      workspaceId: DEMO_WORKSPACE_ID,
      ...client,
      isActive: true,
    }).returning();
    createdClients.push(createdClient);
  }

  console.log(`✅ Created ${createdClients.length} clients`);

  // 5. Create sample payroll run and paycheck for demo user
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const payPeriodStart = new Date(lastWeek.getFullYear(), lastWeek.getMonth(), 1);
  const payPeriodEnd = new Date(lastWeek.getFullYear(), lastWeek.getMonth() + 1, 0);
  
  // Create payroll run first
  const [payrollRun] = await db.insert(payrollRuns).values({
    workspaceId: DEMO_WORKSPACE_ID,
    periodStart: payPeriodStart,
    periodEnd: payPeriodEnd,
    totalGrossPay: "4375.00",
    totalNetPay: "3165.31",
    status: "processed",
    processedBy: DEMO_USER_ID,
    processedAt: lastWeek,
  }).returning();
  
  // Create paycheck entry
  await db.insert(payrollEntries).values({
    payrollRunId: payrollRun.id,
    workspaceId: DEMO_WORKSPACE_ID,
    employeeId: demoUserEmployee.id,
    regularHours: "80.00",
    overtimeHours: "5.00",
    hourlyRate: "50.00",
    grossPay: "4375.00", // (80 * 50) + (5 * 50 * 1.5)
    federalTax: "656.25",
    stateTax: "218.75",
    socialSecurity: "271.25",
    medicare: "63.44",
    netPay: "3165.31",
  });

  console.log("✅ Created sample paycheck for demo user");

  // 6. Create CATEGORIZED shifts for THIS WEEK (colorful Sling-style schedule)
  const now = new Date();
  // Helper: Get start of current week (Sunday) and create Date for specific day/hour
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  
  const createShiftDate = (baseDate: Date, dayOffset: number, hour: number, minute: number = 0) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  
  const weekStart = getStartOfWeek(now);
  const shiftsData = [
    // Sunday (Day 0)
    {employeeId: createdEmployees[0].id, clientId: createdClients[0].id, title: "Tech Support", category: "tech_support", startTime: createShiftDate(weekStart, 0, 9), endTime: createShiftDate(weekStart, 0, 17), status: "scheduled"},
    {employeeId: createdEmployees[1].id, clientId: createdClients[1].id, title: "Field Ops", category: "field_ops", startTime: createShiftDate(weekStart, 0, 13), endTime: createShiftDate(weekStart, 0, 20), status: "scheduled"},
    {employeeId: createdEmployees[2].id, clientId: createdClients[2].id, title: "Security", category: "security", startTime: createShiftDate(weekStart, 0, 22), endTime: createShiftDate(weekStart, 1, 6), status: "scheduled"},
    
    // Monday (Day 1)
    {employeeId: createdEmployees[0].id, clientId: createdClients[0].id, title: "Healthcare", category: "healthcare", startTime: createShiftDate(weekStart, 1, 8), endTime: createShiftDate(weekStart, 1, 16), status: "scheduled"},
    {employeeId: createdEmployees[1].id, clientId: createdClients[1].id, title: "Training", category: "training", startTime: createShiftDate(weekStart, 1, 10), endTime: createShiftDate(weekStart, 1, 14), status: "scheduled"},
    {employeeId: createdEmployees[2].id, clientId: createdClients[0].id, title: "Security", category: "security", startTime: createShiftDate(weekStart, 1, 14), endTime: createShiftDate(weekStart, 1, 22), status: "scheduled"},
    {employeeId: createdEmployees[3].id, clientId: createdClients[2].id, title: "Admin", category: "admin", startTime: createShiftDate(weekStart, 1, 9), endTime: createShiftDate(weekStart, 1, 17), status: "scheduled"},
    
    // Tuesday (Day 2)
    {employeeId: createdEmployees[0].id, clientId: createdClients[2].id, title: "Admin", category: "admin", startTime: createShiftDate(weekStart, 2, 9), endTime: createShiftDate(weekStart, 2, 17), status: "scheduled"},
    {employeeId: createdEmployees[3].id, clientId: createdClients[1].id, title: "Emergency", category: "emergency", startTime: createShiftDate(weekStart, 2, 0), endTime: createShiftDate(weekStart, 2, 8), status: "scheduled"},
    {employeeId: createdEmployees[4].id, clientId: createdClients[0].id, title: "Tech Support", category: "tech_support", startTime: createShiftDate(weekStart, 2, 13), endTime: createShiftDate(weekStart, 2, 21), status: "scheduled"},
    {employeeId: createdEmployees[1].id, clientId: createdClients[1].id, title: "Field Ops", category: "field_ops", startTime: createShiftDate(weekStart, 2, 8), endTime: createShiftDate(weekStart, 2, 16), status: "scheduled"},
    
    // Wednesday (Day 3)
    {employeeId: createdEmployees[1].id, clientId: createdClients[2].id, title: "Field Ops", category: "field_ops", startTime: createShiftDate(weekStart, 3, 7), endTime: createShiftDate(weekStart, 3, 15), status: "scheduled"},
    {employeeId: createdEmployees[2].id, clientId: createdClients[1].id, title: "Healthcare", category: "healthcare", startTime: createShiftDate(weekStart, 3, 8), endTime: createShiftDate(weekStart, 3, 16), status: "scheduled"},
    {employeeId: createdEmployees[3].id, clientId: createdClients[0].id, title: "Training", category: "training", startTime: createShiftDate(weekStart, 3, 10), endTime: createShiftDate(weekStart, 3, 14), status: "scheduled"},
    {employeeId: createdEmployees[4].id, clientId: createdClients[2].id, title: "Admin", category: "admin", startTime: createShiftDate(weekStart, 3, 9), endTime: createShiftDate(weekStart, 3, 17), status: "scheduled"},
    {employeeId: createdEmployees[0].id, clientId: createdClients[1].id, title: "Tech Support", category: "tech_support", startTime: createShiftDate(weekStart, 3, 13), endTime: createShiftDate(weekStart, 3, 21), status: "scheduled"},
    
    // Thursday (Day 4)
    {employeeId: createdEmployees[0].id, clientId: createdClients[1].id, title: "Security", category: "security", startTime: createShiftDate(weekStart, 4, 6), endTime: createShiftDate(weekStart, 4, 14), status: "scheduled"},
    {employeeId: createdEmployees[4].id, clientId: createdClients[2].id, title: "Admin", category: "admin", startTime: createShiftDate(weekStart, 4, 9), endTime: createShiftDate(weekStart, 4, 17), status: "scheduled"},
    {employeeId: createdEmployees[1].id, clientId: createdClients[0].id, title: "Tech Support", category: "tech_support", startTime: createShiftDate(weekStart, 4, 12), endTime: createShiftDate(weekStart, 4, 20), status: "scheduled"},
    {employeeId: createdEmployees[2].id, clientId: createdClients[1].id, title: "Healthcare", category: "healthcare", startTime: createShiftDate(weekStart, 4, 8), endTime: createShiftDate(weekStart, 4, 16), status: "scheduled"},
    {employeeId: createdEmployees[3].id, clientId: createdClients[2].id, title: "Training", category: "training", startTime: createShiftDate(weekStart, 4, 14), endTime: createShiftDate(weekStart, 4, 18), status: "scheduled"},
    
    // Friday (Day 5)
    {employeeId: createdEmployees[2].id, clientId: createdClients[1].id, title: "Field Ops", category: "field_ops", startTime: createShiftDate(weekStart, 5, 8), endTime: createShiftDate(weekStart, 5, 16), status: "scheduled"},
    {employeeId: createdEmployees[3].id, clientId: createdClients[2].id, title: "Healthcare", category: "healthcare", startTime: createShiftDate(weekStart, 5, 10), endTime: createShiftDate(weekStart, 5, 18), status: "scheduled"},
    {employeeId: createdEmployees[0].id, clientId: createdClients[0].id, title: "Emergency", category: "emergency", startTime: createShiftDate(weekStart, 5, 18), endTime: createShiftDate(weekStart, 6, 2), status: "scheduled"},
    {employeeId: createdEmployees[1].id, clientId: createdClients[1].id, title: "Tech Support", category: "tech_support", startTime: createShiftDate(weekStart, 5, 9), endTime: createShiftDate(weekStart, 5, 17), status: "scheduled"},
    {employeeId: createdEmployees[4].id, clientId: createdClients[0].id, title: "Admin", category: "admin", startTime: createShiftDate(weekStart, 5, 9), endTime: createShiftDate(weekStart, 5, 17), status: "scheduled"},
    
    // Saturday (Day 6)
    {employeeId: createdEmployees[4].id, clientId: createdClients[1].id, title: "Security", category: "security", startTime: createShiftDate(weekStart, 6, 6), endTime: createShiftDate(weekStart, 6, 14), status: "scheduled"},
    {employeeId: createdEmployees[1].id, clientId: createdClients[0].id, title: "Training", category: "training", startTime: createShiftDate(weekStart, 6, 10), endTime: createShiftDate(weekStart, 6, 14), status: "scheduled"},
    {employeeId: createdEmployees[2].id, clientId: createdClients[2].id, title: "Field Ops", category: "field_ops", startTime: createShiftDate(weekStart, 6, 8), endTime: createShiftDate(weekStart, 6, 16), status: "scheduled"},
    {employeeId: createdEmployees[0].id, clientId: createdClients[1].id, title: "Healthcare", category: "healthcare", startTime: createShiftDate(weekStart, 6, 12), endTime: createShiftDate(weekStart, 6, 20), status: "scheduled"},
  ];

  const clientRateMap = new Map<string, string>();
  for (const c of createdClients) {
    clientRateMap.set(c.id, (c as any).contractRate || '40.00');
  }

  const createdShifts = [];
  let skippedOverlaps = 0;
  for (const shift of shiftsData) {
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);

    const existingOverlap = await db.select({ id: shifts.id })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, DEMO_WORKSPACE_ID),
        eq(shifts.employeeId, shift.employeeId),
        sql`${shifts.startTime} < ${shiftEnd}`,
        sql`${shifts.endTime} > ${shiftStart}`,
      ))
      .limit(1);

    if (existingOverlap.length > 0) {
      skippedOverlaps++;
      continue;
    }

    const [createdShift] = await db.insert(shifts).values({
      workspaceId: DEMO_WORKSPACE_ID,
      employeeId: shift.employeeId,
      clientId: shift.clientId,
      title: shift.title,
      category: shift.category as any,
      description: `${shift.category.replace('_', ' ')} shift`,
      startTime: shiftStart,
      endTime: shiftEnd,
      status: shift.status as any,
      aiGenerated: false,
      contractRate: clientRateMap.get(shift.clientId) || '40.00',
    }).returning();
    createdShifts.push(createdShift);
  }

  if (skippedOverlaps > 0) {
    console.log(`⚠️ Skipped ${skippedOverlaps} shifts that would have created double-bookings`);
  }
  console.log(`✅ Created ${createdShifts.length} CATEGORIZED shifts for current week`);

  // 6. Create time entries for completed shifts (5 total)
  const timeEntriesData = [
    {
      shiftId: createdShifts[0].id,
      employeeId: createdEmployees[0].id,
      clientId: createdClients[0].id,
      clockIn: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).setHours(9, 0, 0),
      clockOut: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).setHours(17, 0, 0),
      totalHours: "8.00",
      hourlyRate: "75.00",
      totalAmount: "600.00",
    },
    {
      shiftId: createdShifts[1].id,
      employeeId: createdEmployees[1].id,
      clientId: createdClients[1].id,
      clockIn: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).setHours(10, 0, 0),
      clockOut: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).setHours(15, 0, 0),
      totalHours: "5.00",
      hourlyRate: "85.00",
      totalAmount: "425.00",
    },
    {
      shiftId: createdShifts[2].id,
      employeeId: createdEmployees[2].id,
      clientId: createdClients[2].id,
      clockIn: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).setHours(8, 0, 0),
      clockOut: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).setHours(12, 0, 0),
      totalHours: "4.00",
      hourlyRate: "65.00",
      totalAmount: "260.00",
    },
    {
      shiftId: createdShifts[3].id,
      employeeId: createdEmployees[3].id,
      clientId: createdClients[1].id,
      clockIn: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).setHours(9, 0, 0),
      clockOut: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).setHours(13, 0, 0),
      totalHours: "4.00",
      hourlyRate: "60.00",
      totalAmount: "240.00",
    },
    {
      shiftId: createdShifts[4].id,
      employeeId: createdEmployees[4].id,
      clientId: createdClients[2].id,
      clockIn: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).setHours(10, 0, 0),
      clockOut: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).setHours(16, 0, 0),
      totalHours: "6.00",
      hourlyRate: "70.00",
      totalAmount: "420.00",
    },
  ];

  const createdTimeEntries = [];
  for (const entry of timeEntriesData) {
    const [timeEntry] = await db.insert(timeEntries).values({
      workspaceId: DEMO_WORKSPACE_ID,
      shiftId: entry.shiftId,
      employeeId: entry.employeeId,
      clientId: entry.clientId,
      clockIn: new Date(entry.clockIn),
      clockOut: new Date(entry.clockOut),
      totalHours: entry.totalHours,
      hourlyRate: entry.hourlyRate,
      totalAmount: entry.totalAmount,
    }).returning();
    createdTimeEntries.push(timeEntry);
  }

  console.log(`✅ Created ${createdTimeEntries.length} time entries`);

  // 7. Create sample invoices (2 total)
  // First invoice - TechCorp (paid)
  const invoice1Subtotal = 600.00; // Entry 0
  const invoice1TaxRate = 8.5;
  const invoice1TaxAmount = invoice1Subtotal * (invoice1TaxRate / 100);
  const invoice1Total = invoice1Subtotal + invoice1TaxAmount;
  const invoice1PlatformFee = invoice1Total * 0.10;
  const invoice1BusinessAmount = invoice1Total - invoice1PlatformFee;

  const invoice1Result = await db.insert(invoices).values({
    workspaceId: DEMO_WORKSPACE_ID,
    clientId: createdClients[0].id,
    invoiceNumber: "INV-DEMO-001",
    status: "paid" as any,
    subtotal: invoice1Subtotal.toFixed(2),
    taxRate: invoice1TaxRate.toFixed(2),
    taxAmount: invoice1TaxAmount.toFixed(2),
    total: invoice1Total.toFixed(2),
    platformFeePercentage: "10.00",
    platformFeeAmount: invoice1PlatformFee.toFixed(2),
    businessAmount: invoice1BusinessAmount.toFixed(2),
  } as any).returning();
  const invoice1 = invoice1Result[0];

  await db.insert(invoiceLineItems).values({
    invoiceId: invoice1.id,
    timeEntryId: createdTimeEntries[0].id,
    description: "System Installation - Sarah Johnson",
    quantity: "8.00",
    unitPrice: "75.00",
    amount: "600.00",
  });

  await db.update(timeEntries)
    .set({ invoiceId: invoice1.id })
    .where(eq(timeEntries.id, createdTimeEntries[0].id));

  // Second invoice - Healthcare Plus (sent, unpaid)
  const invoice2Subtotal = 665.00; // Entry 1 (425) + Entry 3 (240)
  const invoice2TaxRate = 8.5;
  const invoice2TaxAmount = invoice2Subtotal * (invoice2TaxRate / 100);
  const invoice2Total = invoice2Subtotal + invoice2TaxAmount;
  const invoice2PlatformFee = invoice2Total * 0.10;
  const invoice2BusinessAmount = invoice2Total - invoice2PlatformFee;

  const invoice2Result = await db.insert(invoices).values({
    workspaceId: DEMO_WORKSPACE_ID,
    clientId: createdClients[1].id,
    invoiceNumber: "INV-DEMO-002",
    status: "sent" as any,
    subtotal: invoice2Subtotal.toFixed(2),
    taxRate: invoice2TaxRate.toFixed(2),
    taxAmount: invoice2TaxAmount.toFixed(2),
    total: invoice2Total.toFixed(2),
    platformFeePercentage: "10.00",
    platformFeeAmount: invoice2PlatformFee.toFixed(2),
    businessAmount: invoice2BusinessAmount.toFixed(2),
  } as any).returning();
  const invoice2 = invoice2Result[0];

  await db.insert(invoiceLineItems).values([
    {
      invoiceId: invoice2.id,
      timeEntryId: createdTimeEntries[1].id,
      description: "Consultation Session - Michael Chen",
      quantity: "5.00",
      unitPrice: "85.00",
      amount: "425.00",
    },
    {
      invoiceId: invoice2.id,
      timeEntryId: createdTimeEntries[3].id,
      description: "Network Diagnostics - James Davis",
      quantity: "4.00",
      unitPrice: "60.00",
      amount: "240.00",
    },
  ]);

  await db.update(timeEntries)
    .set({ invoiceId: invoice2.id })
    .where(eq(timeEntries.id, createdTimeEntries[1].id));

  await db.update(timeEntries)
    .set({ invoiceId: invoice2.id })
    .where(eq(timeEntries.id, createdTimeEntries[3].id));

  console.log("✅ Created 2 sample invoices with line items");

  console.log("🎉 Demo workspace seeded successfully!");
  return { userId: DEMO_USER_ID, workspaceId: DEMO_WORKSPACE_ID };
}

// Function to reset demo workspace to initial state
export async function resetDemoWorkspace() {
  console.log("🔄 Resetting demo workspace...");

  try {
    // Delete in reverse order of dependencies
    // First, get all invoice IDs for this workspace
    const demoInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.workspaceId, DEMO_WORKSPACE_ID));
    
    const invoiceIds = demoInvoices.map(inv => inv.id);
    
    // Delete invoice line items for these invoices
    if (invoiceIds.length > 0) {
      for (const invoiceId of invoiceIds) {
        await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
      }
    }
    
    // Now delete the rest in order
    await db.delete(invoices).where(eq(invoices.workspaceId, DEMO_WORKSPACE_ID));
    await db.delete(timeEntries).where(eq(timeEntries.workspaceId, DEMO_WORKSPACE_ID));
    await db.delete(shifts).where(eq(shifts.workspaceId, DEMO_WORKSPACE_ID));
    await db.delete(clients).where(eq(clients.workspaceId, DEMO_WORKSPACE_ID));
    await db.delete(employees).where(eq(employees.workspaceId, DEMO_WORKSPACE_ID));
    await db.delete(workspaces).where(eq(workspaces.id, DEMO_WORKSPACE_ID));
    await db.delete(users).where(eq(users.id, DEMO_USER_ID));

    console.log("✅ Deleted existing demo data");

    // Re-seed
    await seedDemoWorkspace();

    console.log("🎉 Demo workspace reset complete!");
  } catch (error) {
    console.error("❌ Error resetting demo workspace:", error);
    throw error;
  }
}
