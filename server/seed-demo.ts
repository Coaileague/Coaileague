// Demo Workspace Seeding Script
// Creates a pre-populated demo workspace with realistic sample data

import { db } from "./db";
import { users, workspaces, employees, clients, shifts, timeEntries, invoices, invoiceLineItems } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEMO_USER_ID = "demo-user-00000000";
const DEMO_WORKSPACE_ID = "demo-workspace-00000000";

export async function seedDemoWorkspace() {
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
    email: "demo@shiftsync.app",
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
    subscriptionTier: "professional",
    subscriptionStatus: "active",
    maxEmployees: 25,
    maxClients: 999,
    platformFeePercentage: "10.00",
  }).returning();

  console.log("✅ Created demo workspace");

  // 3. Create sample employees
  const employeeData = [
    { firstName: "Sarah", lastName: "Johnson", email: "sarah.j@demo.com", role: "Lead Technician", hourlyRate: "75.00", color: "#3b82f6" },
    { firstName: "Michael", lastName: "Chen", email: "michael.c@demo.com", role: "Senior Consultant", hourlyRate: "85.00", color: "#8b5cf6" },
    { firstName: "Emma", lastName: "Williams", email: "emma.w@demo.com", role: "Field Specialist", hourlyRate: "65.00", color: "#ec4899" },
    { firstName: "James", lastName: "Davis", email: "james.d@demo.com", role: "Technician", hourlyRate: "60.00", color: "#10b981" },
    { firstName: "Lisa", lastName: "Martinez", email: "lisa.m@demo.com", role: "Consultant", hourlyRate: "70.00", color: "#f59e0b" },
  ];

  const createdEmployees = [];
  for (const emp of employeeData) {
    const [employee] = await db.insert(employees).values({
      workspaceId: DEMO_WORKSPACE_ID,
      ...emp,
      isActive: true,
    }).returning();
    createdEmployees.push(employee);
  }

  console.log(`✅ Created ${createdEmployees.length} employees`);

  // 4. Create sample clients
  const clientData = [
    { firstName: "Robert", lastName: "Anderson", company: "TechCorp", email: "robert@techcorp.com", phone: "(555) 111-2222" },
    { firstName: "Jennifer", lastName: "Thompson", company: "Healthcare Plus", email: "jennifer@healthcareplus.com", phone: "(555) 333-4444" },
    { firstName: "David", lastName: "Miller", company: "Retail Solutions", email: "david@retailsolutions.com", phone: "(555) 555-6666" },
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

  // 5. Create sample shifts (10 total - mix of past and future)
  const now = new Date();
  const shiftsData = [
    // Past shifts (for completed work)
    {
      employeeId: createdEmployees[0].id,
      clientId: createdClients[0].id,
      title: "System Installation",
      description: "Install and configure new server system",
      startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).setHours(9, 0, 0),
      endTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).setHours(17, 0, 0),
      status: "completed",
    },
    {
      employeeId: createdEmployees[1].id,
      clientId: createdClients[1].id,
      title: "Consultation Session",
      description: "Strategy planning and implementation review",
      startTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).setHours(10, 0, 0),
      endTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).setHours(15, 0, 0),
      status: "completed",
    },
    {
      employeeId: createdEmployees[2].id,
      clientId: createdClients[2].id,
      title: "Field Service",
      description: "On-site equipment maintenance",
      startTime: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).setHours(8, 0, 0),
      endTime: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).setHours(12, 0, 0),
      status: "completed",
    },
    {
      employeeId: createdEmployees[3].id,
      clientId: createdClients[1].id,
      title: "Network Diagnostics",
      description: "Troubleshoot network connectivity issues",
      startTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).setHours(9, 0, 0),
      endTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).setHours(13, 0, 0),
      status: "completed",
    },
    {
      employeeId: createdEmployees[4].id,
      clientId: createdClients[2].id,
      title: "Security Audit",
      description: "Comprehensive security assessment",
      startTime: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).setHours(10, 0, 0),
      endTime: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).setHours(16, 0, 0),
      status: "completed",
    },
    // Current/upcoming shifts
    {
      employeeId: createdEmployees[0].id,
      clientId: createdClients[0].id,
      title: "Follow-up Service",
      description: "Post-installation check and adjustments",
      startTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).setHours(9, 0, 0),
      endTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).setHours(13, 0, 0),
      status: "scheduled",
    },
    {
      employeeId: createdEmployees[1].id,
      clientId: createdClients[1].id,
      title: "Training Session",
      description: "Staff training on new procedures",
      startTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).setHours(13, 0, 0),
      endTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).setHours(17, 0, 0),
      status: "scheduled",
    },
    {
      employeeId: createdEmployees[2].id,
      clientId: createdClients[2].id,
      title: "Equipment Upgrade",
      description: "Hardware replacement and testing",
      startTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).setHours(8, 0, 0),
      endTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).setHours(12, 0, 0),
      status: "scheduled",
    },
    {
      employeeId: createdEmployees[3].id,
      clientId: createdClients[0].id,
      title: "Quarterly Review",
      description: "System performance review and optimization",
      startTime: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).setHours(14, 0, 0),
      endTime: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).setHours(17, 0, 0),
      status: "scheduled",
    },
    {
      employeeId: createdEmployees[4].id,
      clientId: createdClients[1].id,
      title: "Emergency Support",
      description: "On-call emergency technical support",
      startTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).setHours(9, 0, 0),
      endTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).setHours(17, 0, 0),
      status: "scheduled",
    },
  ];

  const createdShifts = [];
  for (const shift of shiftsData) {
    const [createdShift] = await db.insert(shifts).values({
      workspaceId: DEMO_WORKSPACE_ID,
      employeeId: shift.employeeId,
      clientId: shift.clientId,
      title: shift.title,
      description: shift.description,
      startTime: new Date(shift.startTime),
      endTime: new Date(shift.endTime),
      status: shift.status as any,
    }).returning();
    createdShifts.push(createdShift);
  }

  console.log(`✅ Created ${createdShifts.length} shifts`);

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

  // @ts-ignore - TypeScript inference issue with Drizzle insert
  const [invoice1] = await db.insert(invoices).values({
    workspaceId: DEMO_WORKSPACE_ID,
    clientId: createdClients[0].id,
    invoiceNumber: "INV-DEMO-001",
    status: "paid",
    subtotal: invoice1Subtotal.toFixed(2),
    taxRate: invoice1TaxRate.toFixed(2),
    taxAmount: invoice1TaxAmount.toFixed(2),
    total: invoice1Total.toFixed(2),
    platformFee: invoice1PlatformFee.toFixed(2),
    businessAmount: invoice1BusinessAmount.toFixed(2),
  }).returning();

  await db.insert(invoiceLineItems).values({
    invoiceId: invoice1.id,
    timeEntryId: createdTimeEntries[0].id,
    description: "System Installation - Sarah Johnson",
    quantity: "8.00",
    unitPrice: "75.00",
    amount: "600.00",
  });

  // @ts-ignore - TypeScript inference issue with Drizzle partial updates
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

  // @ts-ignore - TypeScript inference issue with Drizzle insert
  const [invoice2] = await db.insert(invoices).values({
    workspaceId: DEMO_WORKSPACE_ID,
    clientId: createdClients[1].id,
    invoiceNumber: "INV-DEMO-002",
    status: "sent",
    subtotal: invoice2Subtotal.toFixed(2),
    taxRate: invoice2TaxRate.toFixed(2),
    taxAmount: invoice2TaxAmount.toFixed(2),
    total: invoice2Total.toFixed(2),
    platformFee: invoice2PlatformFee.toFixed(2),
    businessAmount: invoice2BusinessAmount.toFixed(2),
  }).returning();

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

  // @ts-ignore - TypeScript inference issue with Drizzle partial updates
  await db.update(timeEntries)
    .set({ invoiceId: invoice2.id })
    .where(eq(timeEntries.id, createdTimeEntries[1].id));

  // @ts-ignore - TypeScript inference issue with Drizzle partial updates
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
