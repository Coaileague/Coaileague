// Multi-tenant SaaS Storage Interface
// References: javascript_log_in_with_replit and javascript_database blueprints

import {
  users,
  workspaces,
  workspaceThemes,
  employees,
  clients,
  shifts,
  shiftTemplates,
  timeEntries,
  invoices,
  invoiceLineItems,
  managerAssignments,
  onboardingInvites,
  onboardingApplications,
  documentSignatures,
  employeeCertifications,
  reportTemplates,
  reportSubmissions,
  reportAttachments,
  customerReportAccess,
  supportTickets,
  type User,
  type UpsertUser,
  type Workspace,
  type InsertWorkspace,
  type WorkspaceTheme,
  type Employee,
  type InsertEmployee,
  type Client,
  type InsertClient,
  type Shift,
  type InsertShift,
  type ShiftTemplate,
  type InsertShiftTemplate,
  type TimeEntry,
  type InsertTimeEntry,
  type Invoice,
  type InsertInvoice,
  type InvoiceLineItem,
  type InsertInvoiceLineItem,
  type ManagerAssignment,
  type InsertManagerAssignment,
  type OnboardingInvite,
  type InsertOnboardingInvite,
  type OnboardingApplication,
  type InsertOnboardingApplication,
  type DocumentSignature,
  type InsertDocumentSignature,
  type EmployeeCertification,
  type InsertEmployeeCertification,
  type ReportTemplate,
  type InsertReportTemplate,
  type ReportSubmission,
  type InsertReportSubmission,
  type ReportAttachment,
  type InsertReportAttachment,
  type CustomerReportAccess,
  type InsertCustomerReportAccess,
  type SupportTicket,
  type InsertSupportTicket,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, isNotNull, or, like } from "drizzle-orm";

// Storage Interface with Multi-Tenant Methods
export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Workspace operations
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceByOwnerId(ownerId: string): Promise<Workspace | undefined>;
  updateWorkspace(id: string, data: Partial<InsertWorkspace>): Promise<Workspace | undefined>;
  
  // Workspace theme operations
  getWorkspaceTheme(workspaceId: string): Promise<WorkspaceTheme | null>;
  
  // Employee operations
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  getEmployee(id: string, workspaceId: string): Promise<Employee | undefined>;
  getEmployeesByWorkspace(workspaceId: string): Promise<Employee[]>;
  updateEmployee(id: string, workspaceId: string, data: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string, workspaceId: string): Promise<boolean>;
  
  // Client operations
  createClient(client: InsertClient): Promise<Client>;
  getClient(id: string, workspaceId: string): Promise<Client | undefined>;
  getClientsByWorkspace(workspaceId: string): Promise<Client[]>;
  updateClient(id: string, workspaceId: string, data: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string, workspaceId: string): Promise<boolean>;
  
  // Shift operations
  createShift(shift: InsertShift): Promise<Shift>;
  getShift(id: string, workspaceId: string): Promise<Shift | undefined>;
  getShiftsByWorkspace(workspaceId: string, startDate?: Date, endDate?: Date): Promise<Shift[]>;
  updateShift(id: string, workspaceId: string, data: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: string, workspaceId: string): Promise<boolean>;
  
  // Shift Template operations
  createShiftTemplate(template: InsertShiftTemplate): Promise<ShiftTemplate>;
  getShiftTemplate(id: string, workspaceId: string): Promise<ShiftTemplate | undefined>;
  getShiftTemplatesByWorkspace(workspaceId: string): Promise<ShiftTemplate[]>;
  updateShiftTemplate(id: string, workspaceId: string, data: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined>;
  deleteShiftTemplate(id: string, workspaceId: string): Promise<boolean>;
  
  // Time Entry operations
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  getTimeEntry(id: string, workspaceId: string): Promise<TimeEntry | undefined>;
  getTimeEntriesByWorkspace(workspaceId: string): Promise<TimeEntry[]>;
  getUnbilledTimeEntries(workspaceId: string, clientId: string): Promise<TimeEntry[]>;
  updateTimeEntry(id: string, workspaceId: string, data: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined>;
  
  // Invoice operations
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoice(id: string, workspaceId: string): Promise<Invoice | undefined>;
  getInvoicesByWorkspace(workspaceId: string): Promise<Invoice[]>;
  updateInvoice(id: string, workspaceId: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  
  // Invoice Line Item operations
  createInvoiceLineItem(item: InsertInvoiceLineItem): Promise<InvoiceLineItem>;
  getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]>;
  
  // Analytics operations
  getWorkspaceAnalytics(workspaceId: string): Promise<{
    totalRevenue: number;
    totalHoursWorked: number;
    activeEmployees: number;
    activeClients: number;
    employeeCount: number;
    clientCount: number;
    totalInvoices: number;
    paidInvoices: number;
  }>;
  
  // Manager Assignment operations
  createManagerAssignment(assignment: InsertManagerAssignment): Promise<ManagerAssignment>;
  getManagerAssignmentsByWorkspace(workspaceId: string): Promise<ManagerAssignment[]>;
  getManagerAssignmentsByManager(managerId: string, workspaceId: string): Promise<ManagerAssignment[]>;
  getManagerAssignmentsByEmployee(employeeId: string, workspaceId: string): Promise<ManagerAssignment[]>;
  deleteManagerAssignment(id: string, workspaceId: string): Promise<boolean>;
  
  // Onboarding Invite operations
  createOnboardingInvite(invite: InsertOnboardingInvite): Promise<OnboardingInvite>;
  getOnboardingInviteByToken(token: string): Promise<OnboardingInvite | undefined>;
  getOnboardingInvitesByWorkspace(workspaceId: string): Promise<OnboardingInvite[]>;
  updateOnboardingInvite(id: string, data: Partial<InsertOnboardingInvite>): Promise<OnboardingInvite | undefined>;
  
  // Onboarding Application operations
  createOnboardingApplication(application: InsertOnboardingApplication): Promise<OnboardingApplication>;
  getOnboardingApplication(id: string, workspaceId: string): Promise<OnboardingApplication | undefined>;
  getOnboardingApplicationsByWorkspace(workspaceId: string): Promise<OnboardingApplication[]>;
  updateOnboardingApplication(id: string, workspaceId: string, data: Partial<InsertOnboardingApplication>): Promise<OnboardingApplication | undefined>;
  searchEmployeesAndApplications(workspaceId: string, query: string): Promise<(Employee | OnboardingApplication)[]>;
  generateEmployeeNumber(workspaceId: string): Promise<string>;
  
  // Document Signature operations
  createDocumentSignature(signature: InsertDocumentSignature): Promise<DocumentSignature>;
  getDocumentSignature(id: string, workspaceId: string): Promise<DocumentSignature | undefined>;
  getDocumentSignaturesByApplication(applicationId: string): Promise<DocumentSignature[]>;
  updateDocumentSignature(id: string, workspaceId: string, data: Partial<InsertDocumentSignature>): Promise<DocumentSignature | undefined>;
  
  // Employee Certification operations
  createEmployeeCertification(certification: InsertEmployeeCertification): Promise<EmployeeCertification>;
  getEmployeeCertificationsByEmployee(employeeId: string, workspaceId: string): Promise<EmployeeCertification[]>;
  getEmployeeCertificationsByApplication(applicationId: string): Promise<EmployeeCertification[]>;
  updateEmployeeCertification(id: string, workspaceId: string, data: Partial<InsertEmployeeCertification>): Promise<EmployeeCertification | undefined>;
  
  // Report Management System (RMS) operations
  getReportTemplatesByWorkspace(workspaceId: string): Promise<ReportTemplate[]>;
  toggleReportTemplateActivation(templateId: string, workspaceId: string): Promise<ReportTemplate>;
  createReportSubmission(submission: InsertReportSubmission): Promise<ReportSubmission>;
  getReportSubmissions(workspaceId: string, filters?: { status?: string; employeeId?: string }): Promise<ReportSubmission[]>;
  getReportSubmissionById(id: string): Promise<ReportSubmission | undefined>;
  updateReportSubmission(id: string, data: Partial<InsertReportSubmission>): Promise<ReportSubmission>;
  reviewReportSubmission(id: string, review: { approved: boolean; reviewNotes: string; reviewedBy: string }): Promise<ReportSubmission>;
  createCustomerReportAccess(access: InsertCustomerReportAccess): Promise<CustomerReportAccess>;
  getCustomerReportAccessByToken(token: string): Promise<CustomerReportAccess | undefined>;
  trackCustomerReportAccess(accessId: string): Promise<void>;
  createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket>;
  getSupportTickets(workspaceId: string): Promise<SupportTicket[]>;
  updateSupportTicket(id: string, data: Partial<InsertSupportTicket>): Promise<SupportTicket>;
}

export class DatabaseStorage implements IStorage {
  // ============================================================================
  // USER OPERATIONS (Required for Replit Auth)
  // ============================================================================
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // ============================================================================
  // WORKSPACE OPERATIONS
  // ============================================================================
  
  async createWorkspace(workspaceData: InsertWorkspace): Promise<Workspace> {
    const [workspace] = await db
      .insert(workspaces)
      .values(workspaceData)
      .returning();
    return workspace;
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id));
    return workspace;
  }

  async getWorkspaceByOwnerId(ownerId: string): Promise<Workspace | undefined> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, ownerId));
    return workspace;
  }

  async updateWorkspace(id: string, data: Partial<InsertWorkspace>): Promise<Workspace | undefined> {
    const [workspace] = await db
      .update(workspaces)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return workspace;
  }

  async getWorkspaceTheme(workspaceId: string): Promise<WorkspaceTheme | null> {
    const [theme] = await db
      .select()
      .from(workspaceThemes)
      .where(eq(workspaceThemes.workspaceId, workspaceId));
    return theme || null;
  }

  // ============================================================================
  // EMPLOYEE OPERATIONS (with multi-tenant isolation)
  // ============================================================================
  
  async createEmployee(employeeData: InsertEmployee): Promise<Employee> {
    const [employee] = await db
      .insert(employees)
      .values(employeeData)
      .returning();
    return employee;
  }

  async getEmployee(id: string, workspaceId: string): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.id, id),
        eq(employees.workspaceId, workspaceId)
      ));
    return employee;
  }

  async getEmployeesByWorkspace(workspaceId: string): Promise<Employee[]> {
    return await db
      .select()
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId))
      .orderBy(desc(employees.createdAt));
  }

  async updateEmployee(id: string, workspaceId: string, data: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const [employee] = await db
      .update(employees)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(employees.id, id),
        eq(employees.workspaceId, workspaceId)
      ))
      .returning();
    return employee;
  }

  async deleteEmployee(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(employees)
      .where(and(
        eq(employees.id, id),
        eq(employees.workspaceId, workspaceId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================================
  // CLIENT OPERATIONS (with multi-tenant isolation)
  // ============================================================================
  
  async createClient(clientData: InsertClient): Promise<Client> {
    const [client] = await db
      .insert(clients)
      .values(clientData)
      .returning();
    return client;
  }

  async getClient(id: string, workspaceId: string): Promise<Client | undefined> {
    const [client] = await db
      .select()
      .from(clients)
      .where(and(
        eq(clients.id, id),
        eq(clients.workspaceId, workspaceId)
      ));
    return client;
  }

  async getClientsByWorkspace(workspaceId: string): Promise<Client[]> {
    return await db
      .select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(desc(clients.createdAt));
  }

  async updateClient(id: string, workspaceId: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [client] = await db
      .update(clients)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(clients.id, id),
        eq(clients.workspaceId, workspaceId)
      ))
      .returning();
    return client;
  }

  async deleteClient(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(clients)
      .where(and(
        eq(clients.id, id),
        eq(clients.workspaceId, workspaceId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================================
  // SHIFT OPERATIONS (with multi-tenant isolation)
  // ============================================================================
  
  async createShift(shiftData: InsertShift): Promise<Shift> {
    const [shift] = await db
      .insert(shifts)
      .values(shiftData)
      .returning();
    return shift;
  }

  async getShift(id: string, workspaceId: string): Promise<Shift | undefined> {
    const [shift] = await db
      .select()
      .from(shifts)
      .where(and(
        eq(shifts.id, id),
        eq(shifts.workspaceId, workspaceId)
      ));
    return shift;
  }

  async getShiftsByWorkspace(workspaceId: string, startDate?: Date, endDate?: Date): Promise<Shift[]> {
    // TODO: Add date filtering when needed
    return await db
      .select()
      .from(shifts)
      .where(eq(shifts.workspaceId, workspaceId))
      .orderBy(desc(shifts.startTime));
  }

  async updateShift(id: string, workspaceId: string, data: Partial<InsertShift>): Promise<Shift | undefined> {
    const [shift] = await db
      .update(shifts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(shifts.id, id),
        eq(shifts.workspaceId, workspaceId)
      ))
      .returning();
    return shift;
  }

  async deleteShift(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(shifts)
      .where(and(
        eq(shifts.id, id),
        eq(shifts.workspaceId, workspaceId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================================
  // SHIFT TEMPLATE OPERATIONS (with multi-tenant isolation)
  // ============================================================================
  
  async createShiftTemplate(templateData: InsertShiftTemplate): Promise<ShiftTemplate> {
    const [template] = await db
      .insert(shiftTemplates)
      .values(templateData)
      .returning();
    return template;
  }

  async getShiftTemplate(id: string, workspaceId: string): Promise<ShiftTemplate | undefined> {
    const [template] = await db
      .select()
      .from(shiftTemplates)
      .where(and(
        eq(shiftTemplates.id, id),
        eq(shiftTemplates.workspaceId, workspaceId)
      ));
    return template;
  }

  async getShiftTemplatesByWorkspace(workspaceId: string): Promise<ShiftTemplate[]> {
    return await db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.workspaceId, workspaceId))
      .orderBy(desc(shiftTemplates.createdAt));
  }

  async updateShiftTemplate(id: string, workspaceId: string, data: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined> {
    const [template] = await db
      .update(shiftTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(shiftTemplates.id, id),
        eq(shiftTemplates.workspaceId, workspaceId)
      ))
      .returning();
    return template;
  }

  async deleteShiftTemplate(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(shiftTemplates)
      .where(and(
        eq(shiftTemplates.id, id),
        eq(shiftTemplates.workspaceId, workspaceId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================================
  // TIME ENTRY OPERATIONS (with multi-tenant isolation)
  // ============================================================================
  
  async createTimeEntry(entryData: InsertTimeEntry): Promise<TimeEntry> {
    const [entry] = await db
      .insert(timeEntries)
      .values(entryData)
      .returning();
    return entry;
  }

  async getTimeEntry(id: string, workspaceId: string): Promise<TimeEntry | undefined> {
    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.id, id),
        eq(timeEntries.workspaceId, workspaceId)
      ));
    return entry;
  }

  async getTimeEntriesByWorkspace(workspaceId: string): Promise<TimeEntry[]> {
    return await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.workspaceId, workspaceId))
      .orderBy(desc(timeEntries.clockIn));
  }

  async getUnbilledTimeEntries(workspaceId: string, clientId: string): Promise<TimeEntry[]> {
    // Get all time entries for this client
    const allEntries = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.clientId, clientId),
        isNotNull(timeEntries.clockOut) // Only completed entries
      ))
      .orderBy(desc(timeEntries.clockIn));

    // Get all time entry IDs that are already billed in THIS workspace
    // Join with invoices to ensure workspace isolation
    const billedEntries = await db
      .select({ timeEntryId: invoiceLineItems.timeEntryId })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        isNotNull(invoiceLineItems.timeEntryId)
      ));

    const billedIds = new Set(billedEntries.map(e => e.timeEntryId).filter(Boolean));

    // Filter out billed entries
    return allEntries.filter(entry => !billedIds.has(entry.id));
  }

  async updateTimeEntry(id: string, workspaceId: string, data: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined> {
    const [entry] = await db
      .update(timeEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(timeEntries.id, id),
        eq(timeEntries.workspaceId, workspaceId)
      ))
      .returning();
    return entry;
  }

  // ============================================================================
  // INVOICE OPERATIONS (with multi-tenant isolation)
  // ============================================================================
  
  async createInvoice(invoiceData: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db
      .insert(invoices)
      .values(invoiceData)
      .returning();
    return invoice;
  }

  async getInvoice(id: string, workspaceId: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, id),
        eq(invoices.workspaceId, workspaceId)
      ));
    return invoice;
  }

  async getInvoicesByWorkspace(workspaceId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.workspaceId, workspaceId))
      .orderBy(desc(invoices.createdAt));
  }

  async updateInvoice(id: string, workspaceId: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [invoice] = await db
      .update(invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(invoices.id, id),
        eq(invoices.workspaceId, workspaceId)
      ))
      .returning();
    return invoice;
  }

  // ============================================================================
  // INVOICE LINE ITEM OPERATIONS
  // ============================================================================
  
  async createInvoiceLineItem(itemData: InsertInvoiceLineItem): Promise<InvoiceLineItem> {
    const [item] = await db
      .insert(invoiceLineItems)
      .values(itemData)
      .returning();
    return item;
  }

  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    return await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));
  }

  // ============================================================================
  // ANALYTICS OPERATIONS
  // ============================================================================
  
  async getWorkspaceAnalytics(workspaceId: string): Promise<{
    totalRevenue: number;
    totalHoursWorked: number;
    activeEmployees: number;
    activeClients: number;
    employeeCount: number;
    clientCount: number;
    totalInvoices: number;
    paidInvoices: number;
  }> {
    // Get all invoices for revenue calculation
    const allInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.workspaceId, workspaceId));

    const totalRevenue = allInvoices.reduce((sum, inv) => {
      // businessAmount is stored as decimal string, parse safely
      const businessAmount = parseFloat(String(inv.businessAmount || "0"));
      return sum + (isNaN(businessAmount) ? 0 : businessAmount);
    }, 0);

    const paidInvoices = allInvoices.filter(inv => inv.status === 'paid').length;

    // Get time entries for hours calculation
    const allTimeEntries = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.workspaceId, workspaceId));

    const totalHoursWorked = allTimeEntries.reduce((sum, entry) => {
      // totalHours is stored as decimal string, parse safely
      const hours = parseFloat(String(entry.totalHours || "0"));
      return sum + (isNaN(hours) ? 0 : hours);
    }, 0);

    // Get employee counts
    const allEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    const activeEmployees = allEmployees.filter(emp => emp.isActive).length;
    const employeeCount = allEmployees.length;

    // Get client counts
    const allClients = await db
      .select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));

    const activeClients = allClients.filter(client => client.isActive).length;
    const clientCount = allClients.length;

    return {
      totalRevenue,
      totalHoursWorked,
      activeEmployees,
      activeClients,
      employeeCount,
      clientCount,
      totalInvoices: allInvoices.length,
      paidInvoices,
    };
  }

  // ============================================================================
  // MANAGER ASSIGNMENT OPERATIONS
  // ============================================================================
  
  async createManagerAssignment(assignmentData: InsertManagerAssignment): Promise<ManagerAssignment> {
    const [assignment] = await db
      .insert(managerAssignments)
      .values(assignmentData)
      .returning();
    return assignment;
  }

  async getManagerAssignmentsByWorkspace(workspaceId: string): Promise<ManagerAssignment[]> {
    return await db
      .select()
      .from(managerAssignments)
      .where(eq(managerAssignments.workspaceId, workspaceId));
  }

  async getManagerAssignmentsByManager(managerId: string, workspaceId: string): Promise<ManagerAssignment[]> {
    return await db
      .select()
      .from(managerAssignments)
      .where(
        and(
          eq(managerAssignments.managerId, managerId),
          eq(managerAssignments.workspaceId, workspaceId)
        )
      );
  }

  async getManagerAssignmentsByEmployee(employeeId: string, workspaceId: string): Promise<ManagerAssignment[]> {
    return await db
      .select()
      .from(managerAssignments)
      .where(
        and(
          eq(managerAssignments.employeeId, employeeId),
          eq(managerAssignments.workspaceId, workspaceId)
        )
      );
  }

  async deleteManagerAssignment(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(managerAssignments)
      .where(
        and(
          eq(managerAssignments.id, id),
          eq(managerAssignments.workspaceId, workspaceId)
        )
      );
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // ============================================================================
  // ONBOARDING INVITE OPERATIONS
  // ============================================================================
  
  async createOnboardingInvite(invite: InsertOnboardingInvite): Promise<OnboardingInvite> {
    const [newInvite] = await db.insert(onboardingInvites).values(invite).returning();
    return newInvite;
  }
  
  async getOnboardingInviteByToken(token: string): Promise<OnboardingInvite | undefined> {
    const [invite] = await db.select().from(onboardingInvites).where(eq(onboardingInvites.inviteToken, token));
    return invite;
  }
  
  async getOnboardingInvitesByWorkspace(workspaceId: string): Promise<OnboardingInvite[]> {
    return await db
      .select()
      .from(onboardingInvites)
      .where(eq(onboardingInvites.workspaceId, workspaceId))
      .orderBy(desc(onboardingInvites.createdAt));
  }
  
  async updateOnboardingInvite(id: string, data: Partial<InsertOnboardingInvite>): Promise<OnboardingInvite | undefined> {
    const [updated] = await db
      .update(onboardingInvites)
      .set(data)
      .where(eq(onboardingInvites.id, id))
      .returning();
    return updated;
  }
  
  // ============================================================================
  // ONBOARDING APPLICATION OPERATIONS
  // ============================================================================
  
  async createOnboardingApplication(application: InsertOnboardingApplication): Promise<OnboardingApplication> {
    const [newApplication] = await db.insert(onboardingApplications).values(application).returning();
    return newApplication;
  }
  
  async getOnboardingApplication(id: string, workspaceId: string): Promise<OnboardingApplication | undefined> {
    const [application] = await db
      .select()
      .from(onboardingApplications)
      .where(
        and(
          eq(onboardingApplications.id, id),
          eq(onboardingApplications.workspaceId, workspaceId)
        )
      );
    return application;
  }
  
  async getOnboardingApplicationsByWorkspace(workspaceId: string): Promise<OnboardingApplication[]> {
    return await db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.workspaceId, workspaceId))
      .orderBy(desc(onboardingApplications.createdAt));
  }
  
  async updateOnboardingApplication(
    id: string,
    workspaceId: string,
    data: Partial<InsertOnboardingApplication>
  ): Promise<OnboardingApplication | undefined> {
    const [updated] = await db
      .update(onboardingApplications)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(onboardingApplications.id, id),
          eq(onboardingApplications.workspaceId, workspaceId)
        )
      )
      .returning();
    return updated;
  }
  
  async searchEmployeesAndApplications(workspaceId: string, query: string): Promise<(Employee | OnboardingApplication)[]> {
    const searchPattern = `%${query}%`;
    
    const employeeResults = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          or(
            like(employees.firstName, searchPattern),
            like(employees.lastName, searchPattern),
            like(employees.email, searchPattern)
          )
        )
      );
    
    const applicationResults = await db
      .select()
      .from(onboardingApplications)
      .where(
        and(
          eq(onboardingApplications.workspaceId, workspaceId),
          or(
            like(onboardingApplications.firstName, searchPattern),
            like(onboardingApplications.lastName, searchPattern),
            like(onboardingApplications.email, searchPattern),
            like(onboardingApplications.employeeNumber, searchPattern)
          )
        )
      );
    
    return [...employeeResults, ...applicationResults];
  }
  
  async generateEmployeeNumber(workspaceId: string): Promise<string> {
    // Get count of employees and applications for this workspace
    const employeeCount = await db
      .select()
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));
    
    const applicationCount = await db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.workspaceId, workspaceId));
    
    const totalCount = employeeCount.length + applicationCount.length + 1;
    
    // Generate employee number: EMP-YYYY-XXXX
    const year = new Date().getFullYear();
    const paddedNumber = String(totalCount).padStart(4, '0');
    return `EMP-${year}-${paddedNumber}`;
  }
  
  // ============================================================================
  // DOCUMENT SIGNATURE OPERATIONS
  // ============================================================================
  
  async createDocumentSignature(signature: InsertDocumentSignature): Promise<DocumentSignature> {
    const [newSignature] = await db.insert(documentSignatures).values(signature).returning();
    return newSignature;
  }
  
  async getDocumentSignature(id: string, workspaceId: string): Promise<DocumentSignature | undefined> {
    const [signature] = await db
      .select()
      .from(documentSignatures)
      .where(
        and(
          eq(documentSignatures.id, id),
          eq(documentSignatures.workspaceId, workspaceId)
        )
      );
    return signature;
  }
  
  async getDocumentSignaturesByApplication(applicationId: string): Promise<DocumentSignature[]> {
    return await db
      .select()
      .from(documentSignatures)
      .where(eq(documentSignatures.applicationId, applicationId))
      .orderBy(desc(documentSignatures.createdAt));
  }
  
  async updateDocumentSignature(
    id: string,
    workspaceId: string,
    data: Partial<InsertDocumentSignature>
  ): Promise<DocumentSignature | undefined> {
    const [updated] = await db
      .update(documentSignatures)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(documentSignatures.id, id),
          eq(documentSignatures.workspaceId, workspaceId)
        )
      )
      .returning();
    return updated;
  }
  
  // ============================================================================
  // EMPLOYEE CERTIFICATION OPERATIONS
  // ============================================================================
  
  async createEmployeeCertification(certification: InsertEmployeeCertification): Promise<EmployeeCertification> {
    const [newCertification] = await db.insert(employeeCertifications).values(certification).returning();
    return newCertification;
  }
  
  async getEmployeeCertificationsByEmployee(employeeId: string, workspaceId: string): Promise<EmployeeCertification[]> {
    return await db
      .select()
      .from(employeeCertifications)
      .where(
        and(
          eq(employeeCertifications.employeeId, employeeId),
          eq(employeeCertifications.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(employeeCertifications.createdAt));
  }
  
  async getEmployeeCertificationsByApplication(applicationId: string): Promise<EmployeeCertification[]> {
    return await db
      .select()
      .from(employeeCertifications)
      .where(eq(employeeCertifications.applicationId, applicationId))
      .orderBy(desc(employeeCertifications.createdAt));
  }
  
  async updateEmployeeCertification(
    id: string,
    workspaceId: string,
    data: Partial<InsertEmployeeCertification>
  ): Promise<EmployeeCertification | undefined> {
    const [updated] = await db
      .update(employeeCertifications)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(employeeCertifications.id, id),
          eq(employeeCertifications.workspaceId, workspaceId)
        )
      )
      .returning();
    return updated;
  }
  
  // ============================================================================
  // REPORT MANAGEMENT SYSTEM (RMS) OPERATIONS
  // ============================================================================
  
  async getReportTemplatesByWorkspace(workspaceId: string): Promise<ReportTemplate[]> {
    return await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.workspaceId, workspaceId))
      .orderBy(desc(reportTemplates.createdAt));
  }
  
  async toggleReportTemplateActivation(templateId: string, workspaceId: string): Promise<ReportTemplate> {
    const [template] = await db
      .select()
      .from(reportTemplates)
      .where(
        and(
          eq(reportTemplates.id, templateId),
          eq(reportTemplates.workspaceId, workspaceId)
        )
      );
    
    const [updated] = await db
      .update(reportTemplates)
      .set({ isActive: !template.isActive, updatedAt: new Date() })
      .where(eq(reportTemplates.id, templateId))
      .returning();
    
    return updated;
  }
  
  async createReportSubmission(submission: InsertReportSubmission): Promise<ReportSubmission> {
    // Generate report number
    const year = new Date().getFullYear();
    const existingReports = await db
      .select()
      .from(reportSubmissions)
      .where(eq(reportSubmissions.workspaceId, submission.workspaceId));
    
    const reportNumber = `RPT-${year}-${String(existingReports.length + 1).padStart(4, '0')}`;
    
    const [newSubmission] = await db
      .insert(reportSubmissions)
      .values({ ...submission, reportNumber })
      .returning();
    
    return newSubmission;
  }
  
  async getReportSubmissions(
    workspaceId: string,
    filters?: { status?: string; employeeId?: string }
  ): Promise<ReportSubmission[]> {
    let query = db
      .select()
      .from(reportSubmissions)
      .where(eq(reportSubmissions.workspaceId, workspaceId));
    
    const conditions = [eq(reportSubmissions.workspaceId, workspaceId)];
    
    if (filters?.status) {
      conditions.push(eq(reportSubmissions.status, filters.status));
    }
    
    if (filters?.employeeId) {
      conditions.push(eq(reportSubmissions.employeeId, filters.employeeId));
    }
    
    return await db
      .select()
      .from(reportSubmissions)
      .where(and(...conditions))
      .orderBy(desc(reportSubmissions.createdAt));
  }
  
  async getReportSubmissionById(id: string): Promise<ReportSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(reportSubmissions)
      .where(eq(reportSubmissions.id, id));
    
    return submission;
  }
  
  async updateReportSubmission(id: string, data: Partial<InsertReportSubmission>): Promise<ReportSubmission> {
    const [updated] = await db
      .update(reportSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reportSubmissions.id, id))
      .returning();
    
    return updated;
  }
  
  async reviewReportSubmission(
    id: string,
    review: { approved: boolean; reviewNotes: string; reviewedBy: string }
  ): Promise<ReportSubmission> {
    const newStatus = review.approved ? 'approved' : 'rejected';
    
    const [updated] = await db
      .update(reportSubmissions)
      .set({
        status: newStatus,
        reviewedBy: review.reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: review.reviewNotes,
        updatedAt: new Date(),
      })
      .where(eq(reportSubmissions.id, id))
      .returning();
    
    return updated;
  }
  
  async createCustomerReportAccess(access: InsertCustomerReportAccess): Promise<CustomerReportAccess> {
    const [newAccess] = await db
      .insert(customerReportAccess)
      .values(access)
      .returning();
    
    return newAccess;
  }
  
  async getCustomerReportAccessByToken(token: string): Promise<CustomerReportAccess | undefined> {
    const [access] = await db
      .select()
      .from(customerReportAccess)
      .where(eq(customerReportAccess.accessToken, token));
    
    return access;
  }
  
  async trackCustomerReportAccess(accessId: string): Promise<void> {
    // Get current access count and increment it
    const [access] = await db
      .select()
      .from(customerReportAccess)
      .where(eq(customerReportAccess.id, accessId));
    
    await db
      .update(customerReportAccess)
      .set({
        accessCount: (access?.accessCount || 0) + 1,
        lastAccessedAt: new Date(),
      })
      .where(eq(customerReportAccess.id, accessId));
  }
  
  async createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket> {
    const [newTicket] = await db
      .insert(supportTickets)
      .values(ticket)
      .returning();
    
    return newTicket;
  }
  
  async getSupportTickets(workspaceId: string): Promise<SupportTicket[]> {
    return await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.workspaceId, workspaceId))
      .orderBy(desc(supportTickets.createdAt));
  }
  
  async updateSupportTicket(id: string, data: Partial<InsertSupportTicket>): Promise<SupportTicket> {
    const [updated] = await db
      .update(supportTickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    
    return updated;
  }
}

export const storage = new DatabaseStorage();
