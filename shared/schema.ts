// Multi-tenant SaaS Scheduling Portal Schema
// Reference: javascript_log_in_with_replit and javascript_database blueprints

import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// REPLIT AUTH REQUIRED TABLES (DO NOT MODIFY)
// ============================================================================

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Required for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Additional fields for multi-tenant
  currentWorkspaceId: varchar("current_workspace_id"),
  role: varchar("role").default("user"), // 'user', 'admin'
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// ============================================================================
// MULTI-TENANT CORE TABLES
// ============================================================================

// Workspaces (Business accounts that subscribe to the platform)
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Business information
  companyName: varchar("company_name"),
  taxId: varchar("tax_id"),
  address: text("address"),
  phone: varchar("phone"),
  website: varchar("website"),
  
  // Subscription & billing
  subscriptionTier: varchar("subscription_tier").default("free"), // 'free', 'starter', 'professional', 'enterprise'
  subscriptionStatus: varchar("subscription_status").default("active"), // 'active', 'suspended', 'cancelled'
  maxEmployees: integer("max_employees").default(5),
  maxClients: integer("max_clients").default(10),
  
  // Stripe Connect for payment processing
  stripeAccountId: varchar("stripe_account_id"), // Connected account ID
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  
  // Platform fee
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 2 }).default("10.00"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

// ============================================================================
// ENUMS
// ============================================================================

export const workspaceRoleEnum = pgEnum('workspace_role', ['owner', 'manager', 'employee']);

// ============================================================================
// EMPLOYEE & CLIENT TABLES
// ============================================================================

// Employees (Staff within a workspace)
export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // Optional link to user account
  
  // Employee information
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  
  // Employment details
  role: varchar("role"), // e.g., "Technician", "Consultant", "Driver" - job title
  workspaceRole: workspaceRoleEnum("workspace_role").default("employee"), // Permission level
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  color: varchar("color").default("#3b82f6"), // For calendar display
  
  // Availability
  isActive: boolean("is_active").default(true),
  availabilityNotes: text("availability_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Clients (End customers of the workspace/business)
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Client information
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  companyName: varchar("company_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  
  // Billing
  billingEmail: varchar("billing_email"),
  taxId: varchar("tax_id"),
  
  // Status
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ============================================================================
// SCHEDULING TABLES
// ============================================================================

export const shiftStatusEnum = pgEnum('shift_status', ['scheduled', 'in_progress', 'completed', 'cancelled']);

// Shifts (Scheduled time blocks)
export const shifts = pgTable("shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  
  // Shift details
  title: varchar("title"),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  
  // Status and tracking
  status: shiftStatusEnum("status").default('scheduled'),
  
  // Billing
  billableToClient: boolean("billable_to_client").default(true),
  hourlyRateOverride: decimal("hourly_rate_override", { precision: 10, scale: 2 }), // Override employee's default rate
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()),
});

export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

// Shift Templates (Reusable shift patterns)
export const shiftTemplates = pgTable("shift_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  name: varchar("name").notNull(),
  title: varchar("title"),
  description: text("description"),
  durationHours: decimal("duration_hours", { precision: 5, scale: 2 }).notNull(),
  billableToClient: boolean("billable_to_client").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShiftTemplateSchema = createInsertSchema(shiftTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftTemplate = z.infer<typeof insertShiftTemplateSchema>;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;

// Time Entries (Actual clock-in/clock-out for billing)
export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  
  // Time tracking
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),
  
  // Billing
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  clockIn: z.string().or(z.date()),
  clockOut: z.string().or(z.date()).optional(),
});

export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;

// ============================================================================
// INVOICING & BILLING TABLES
// ============================================================================

export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue', 'cancelled']);

// Invoices
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  
  // Invoice details
  invoiceNumber: varchar("invoice_number").notNull(),
  issueDate: timestamp("issue_date").defaultNow(),
  dueDate: timestamp("due_date"),
  
  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  
  // Platform fee
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 2 }),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }),
  businessAmount: decimal("business_amount", { precision: 10, scale: 2 }), // Amount after platform fee
  
  // Payment
  status: invoiceStatusEnum("status").default('draft'),
  paidAt: timestamp("paid_at"),
  paymentIntentId: varchar("payment_intent_id"), // Stripe Payment Intent ID
  
  // Additional details
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Invoice Line Items
export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  
  // Line item details
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  
  // Links
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'set null' }),
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

// Manager Assignments (which managers oversee which employees)
// NOTE: Application layer MUST validate:
//   1. Both manager and employee belong to the same workspace
//   2. managerId has workspaceRole = 'manager' or 'owner'
export const managerAssignments = pgTable("manager_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  managerId: varchar("manager_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Ensure no duplicate manager-employee pairs
  uniqueManagerEmployee: uniqueIndex("unique_manager_employee").on(table.managerId, table.employeeId),
}));

export const insertManagerAssignmentSchema = createInsertSchema(managerAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertManagerAssignment = z.infer<typeof insertManagerAssignmentSchema>;
export type ManagerAssignment = typeof managerAssignments.$inferSelect;

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  ownedWorkspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  employees: many(employees),
  clients: many(clients),
  shifts: many(shifts),
  invoices: many(invoices),
  timeEntries: many(timeEntries),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [employees.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  shifts: many(shifts),
  timeEntries: many(timeEntries),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [clients.workspaceId],
    references: [workspaces.id],
  }),
  shifts: many(shifts),
  invoices: many(invoices),
  timeEntries: many(timeEntries),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [shifts.workspaceId],
    references: [workspaces.id],
  }),
  employee: one(employees, {
    fields: [shifts.employeeId],
    references: [employees.id],
  }),
  client: one(clients, {
    fields: [shifts.clientId],
    references: [clients.id],
  }),
  timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [timeEntries.workspaceId],
    references: [workspaces.id],
  }),
  shift: one(shifts, {
    fields: [timeEntries.shiftId],
    references: [shifts.id],
  }),
  employee: one(employees, {
    fields: [timeEntries.employeeId],
    references: [employees.id],
  }),
  client: one(clients, {
    fields: [timeEntries.clientId],
    references: [clients.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [invoices.workspaceId],
    references: [workspaces.id],
  }),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [invoiceLineItems.timeEntryId],
    references: [timeEntries.id],
  }),
  shift: one(shifts, {
    fields: [invoiceLineItems.shiftId],
    references: [shifts.id],
  }),
}));

// ============================================================================
// FORTUNE 500 FEATURES - Job Posting & Hiring
// ============================================================================

export const jobPostingStatusEnum = pgEnum('job_posting_status', ['draft', 'active', 'closed', 'filled']);
export const applicationStatusEnum = pgEnum('application_status', ['pending', 'reviewed', 'interviewed', 'offered', 'hired', 'rejected']);

export const jobPostings = pgTable("job_postings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  title: varchar("title").notNull(),
  department: varchar("department"),
  location: varchar("location"),
  employmentType: varchar("employment_type"), // 'full-time', 'part-time', 'contract'
  description: text("description").notNull(),
  requirements: text("requirements"),
  
  salaryMin: decimal("salary_min", { precision: 10, scale: 2 }),
  salaryMax: decimal("salary_max", { precision: 10, scale: 2 }),
  
  status: jobPostingStatusEnum("status").default("draft"),
  postedBy: varchar("posted_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertJobPostingSchema = createInsertSchema(jobPostings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJobPosting = z.infer<typeof insertJobPostingSchema>;
export type JobPosting = typeof jobPostings.$inferSelect;

export const jobApplications = pgTable("job_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobPostingId: varchar("job_posting_id").notNull().references(() => jobPostings.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  applicantName: varchar("applicant_name").notNull(),
  applicantEmail: varchar("applicant_email").notNull(),
  applicantPhone: varchar("applicant_phone"),
  resumeUrl: varchar("resume_url"),
  coverLetter: text("cover_letter"),
  
  status: applicationStatusEnum("status").default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJobApplicationSchema = createInsertSchema(jobApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type JobApplication = typeof jobApplications.$inferSelect;

// ============================================================================
// FORTUNE 500 FEATURES - Employee File Management
// ============================================================================

export const documentTypeEnum = pgEnum('document_type', ['certification', 'license', 'contract', 'policy', 'id', 'other']);

export const employeeFiles = pgTable("employee_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  fileSize: integer("file_size"), // bytes
  mimeType: varchar("mime_type"),
  
  documentType: documentTypeEnum("document_type").default("other"),
  title: varchar("title").notNull(),
  description: text("description"),
  
  expirationDate: timestamp("expiration_date"),
  isExpired: boolean("is_expired").default(false),
  
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeFileSchema = createInsertSchema(employeeFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeFile = z.infer<typeof insertEmployeeFileSchema>;
export type EmployeeFile = typeof employeeFiles.$inferSelect;

// ============================================================================
// FORTUNE 500 FEATURES - Employee Onboarding System
// ============================================================================

export const onboardingStatusEnum = pgEnum('onboarding_status', ['invited', 'in_progress', 'pending_review', 'completed', 'rejected']);
export const taxClassificationEnum = pgEnum('tax_classification', ['w4_employee', 'w9_contractor']);
export const onboardingStepEnum = pgEnum('onboarding_step', [
  'personal_info', 'tax_selection', 'tax_forms', 'contract_signature', 
  'document_upload', 'work_availability', 'certifications', 'acknowledgements', 'completed'
]);

// Onboarding Invites
export const onboardingInvites = pgTable("onboarding_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),
  
  email: varchar("email").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  
  inviteToken: varchar("invite_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  
  acceptedAt: timestamp("accepted_at"),
  isUsed: boolean("is_used").default(false),
  
  sentBy: varchar("sent_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnboardingInviteSchema = createInsertSchema(onboardingInvites).omit({
  id: true,
  createdAt: true,
});

export type InsertOnboardingInvite = z.infer<typeof insertOnboardingInviteSchema>;
export type OnboardingInvite = typeof onboardingInvites.$inferSelect;

// Onboarding Applications
export const onboardingApplications = pgTable("onboarding_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'set null' }),
  inviteId: varchar("invite_id").references(() => onboardingInvites.id),
  
  // Generated employee number
  employeeNumber: varchar("employee_number").unique(),
  
  // Personal Information
  firstName: varchar("first_name").notNull(),
  middleName: varchar("middle_name"),
  lastName: varchar("last_name").notNull(),
  dateOfBirth: timestamp("date_of_birth"),
  ssn: varchar("ssn"), // Encrypted in production
  
  // Contact
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  
  // Emergency Contact
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  emergencyContactRelation: varchar("emergency_contact_relation"),
  
  // Tax Classification
  taxClassification: taxClassificationEnum("tax_classification"),
  
  // Work Availability (for AI scheduling)
  availableMonday: boolean("available_monday").default(true),
  availableTuesday: boolean("available_tuesday").default(true),
  availableWednesday: boolean("available_wednesday").default(true),
  availableThursday: boolean("available_thursday").default(true),
  availableFriday: boolean("available_friday").default(true),
  availableSaturday: boolean("available_saturday").default(false),
  availableSunday: boolean("available_sunday").default(false),
  preferredShiftTime: varchar("preferred_shift_time"), // 'morning', 'afternoon', 'evening', 'night'
  maxHoursPerWeek: integer("max_hours_per_week"),
  availabilityNotes: text("availability_notes"),
  
  // Onboarding Status
  currentStep: onboardingStepEnum("current_step").default("personal_info"),
  status: onboardingStatusEnum("status").default("in_progress"),
  completedAt: timestamp("completed_at"),
  
  // Tracking
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOnboardingApplicationSchema = createInsertSchema(onboardingApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingApplication = z.infer<typeof insertOnboardingApplicationSchema>;
export type OnboardingApplication = typeof onboardingApplications.$inferSelect;

// Legal Documents & Signatures
export const documentSignatureStatusEnum = pgEnum('signature_status', ['pending', 'signed', 'declined']);
export const documentTypeSignatureEnum = pgEnum('document_type_signature', [
  'employee_contract', 'contractor_agreement', 'sop_acknowledgement', 
  'drug_free_policy', 'handbook', 'confidentiality', 'i9_form', 'w4_form', 'w9_form'
]);

export const documentSignatures = pgTable("document_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  applicationId: varchar("application_id").references(() => onboardingApplications.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id),
  
  documentType: documentTypeSignatureEnum("document_type").notNull(),
  documentTitle: varchar("document_title").notNull(),
  documentContent: text("document_content"), // Full text for legal record
  documentUrl: varchar("document_url"), // PDF/file URL
  
  status: documentSignatureStatusEnum("status").default("pending"),
  
  // Signature Data (legal defensibility)
  signatureData: text("signature_data"), // Base64 signature image
  signedByName: varchar("signed_by_name"),
  signedAt: timestamp("signed_at"),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  geoLocation: varchar("geo_location"), // Optional: lat,lon
  
  // Witness/Notary (if required)
  witnessName: varchar("witness_name"),
  witnessSignature: text("witness_signature"),
  witnessedAt: timestamp("witnessed_at"),
  
  // Audit Trail
  viewedAt: timestamp("viewed_at"),
  viewCount: integer("view_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDocumentSignatureSchema = createInsertSchema(documentSignatures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocumentSignature = z.infer<typeof insertDocumentSignatureSchema>;
export type DocumentSignature = typeof documentSignatures.$inferSelect;

// Certification & License Tracking
export const certificationStatusEnum = pgEnum('certification_status', ['pending', 'verified', 'expired', 'invalid']);

export const employeeCertifications = pgTable("employee_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  applicationId: varchar("application_id").references(() => onboardingApplications.id),
  
  certificationType: varchar("certification_type").notNull(), // 'driver_license', 'medical_cert', 'professional_license'
  certificationName: varchar("certification_name").notNull(),
  certificationNumber: varchar("certification_number"),
  issuingAuthority: varchar("issuing_authority"),
  
  issuedDate: timestamp("issued_date"),
  expirationDate: timestamp("expiration_date"),
  
  status: certificationStatusEnum("status").default("pending"),
  
  // Document proof
  documentUrl: varchar("document_url"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  
  // Required for job
  isRequired: boolean("is_required").default(false),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeCertificationSchema = createInsertSchema(employeeCertifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeCertification = z.infer<typeof insertEmployeeCertificationSchema>;
export type EmployeeCertification = typeof employeeCertifications.$inferSelect;

// ============================================================================
// FORTUNE 500 FEATURES - Audit Trail System
// ============================================================================

export const auditActionEnum = pgEnum('audit_action', [
  'create', 'update', 'delete', 
  'login', 'logout', 
  'clock_in', 'clock_out',
  'generate_invoice', 'payment_received',
  'assign_manager', 'remove_manager'
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  userId: varchar("user_id").references(() => users.id),
  action: auditActionEnum("action").notNull(),
  entityType: varchar("entity_type").notNull(), // 'employee', 'shift', 'invoice', etc.
  entityId: varchar("entity_id"),
  
  changes: jsonb("changes"), // { before: {...}, after: {...} }
  metadata: jsonb("metadata"), // Additional context
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================================================
// FORTUNE 500 FEATURES - API Access
// ============================================================================

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  name: varchar("name").notNull(),
  keyHash: varchar("key_hash").notNull().unique(), // Hashed API key
  keyPrefix: varchar("key_prefix").notNull(), // First 8 chars for display
  
  scopes: text("scopes").array(), // ['read:employees', 'write:shifts', etc.]
  isActive: boolean("is_active").default(true),
  
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// ============================================================================
// FORTUNE 500 FEATURES - GPS Clock-in Verification
// ============================================================================

export const gpsLocations = pgTable("gps_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'cascade' }),
  
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  accuracy: decimal("accuracy", { precision: 6, scale: 2 }), // meters
  
  address: varchar("address"),
  verified: boolean("verified").default(false),
  deviceInfo: jsonb("device_info"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export type GpsLocation = typeof gpsLocations.$inferSelect;

// ============================================================================
// FORTUNE 500 FEATURES - Payroll Automation
// ============================================================================

export const payrollStatusEnum = pgEnum('payroll_status', ['draft', 'pending', 'approved', 'processed', 'paid']);

export const payrollRuns = pgTable("payroll_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  status: payrollStatusEnum("status").default("draft"),
  
  totalGrossPay: decimal("total_gross_pay", { precision: 12, scale: 2 }).default("0.00"),
  totalTaxes: decimal("total_taxes", { precision: 12, scale: 2 }).default("0.00"),
  totalNetPay: decimal("total_net_pay", { precision: 12, scale: 2 }).default("0.00"),
  
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRun = typeof payrollRuns.$inferSelect;

export const payrollEntries = pgTable("payroll_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollRunId: varchar("payroll_run_id").notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  regularHours: decimal("regular_hours", { precision: 8, scale: 2 }).default("0.00"),
  overtimeHours: decimal("overtime_hours", { precision: 8, scale: 2 }).default("0.00"),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  
  grossPay: decimal("gross_pay", { precision: 10, scale: 2 }).default("0.00"),
  federalTax: decimal("federal_tax", { precision: 10, scale: 2 }).default("0.00"),
  stateTax: decimal("state_tax", { precision: 10, scale: 2 }).default("0.00"),
  socialSecurity: decimal("social_security", { precision: 10, scale: 2 }).default("0.00"),
  medicare: decimal("medicare", { precision: 10, scale: 2 }).default("0.00"),
  netPay: decimal("net_pay", { precision: 10, scale: 2 }).default("0.00"),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;
export type PayrollEntry = typeof payrollEntries.$inferSelect;
