// Multi-tenant SaaS Storage Interface
// References: javascript_log_in_with_replit and javascript_database blueprints

import {
  users,
  workspaces,
  workspaceThemes,
  employees,
  employeeBenefits,
  performanceReviews,
  ptoRequests,
  employeeTerminations,
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
  supportRooms,
  supportTicketAccess,
  auditLogs,
  featureFlags,
  platformRevenue,
  workspaceAiUsage,
  platformRoles,
  chatConversations,
  chatMessages,
  aiUsageLogs,
  customForms,
  customFormSubmissions,
  payrollRuns,
  payrollEntries,
  abuseViolations,
  leaderActions,
  escalationTickets,
  internalBids,
  bidApplications,
  roleTemplates,
  skillGapAnalyses,
  assets,
  assetSchedules,
  assetUsageLogs,
  timeEntryDiscrepancies,
  onboardingWorkflowTemplates,
  employeeDocuments,
  documentAccessLogs,
  onboardingChecklists,
  disputes,
  type User,
  type UpsertUser,
  type AbuseViolation,
  type InsertAbuseViolation,
  type Workspace,
  type InsertWorkspace,
  type WorkspaceTheme,
  type Employee,
  type InsertEmployee,
  type EmployeeBenefit,
  type InsertEmployeeBenefit,
  type PerformanceReview,
  type InsertPerformanceReview,
  type PtoRequest,
  type InsertPtoRequest,
  type EmployeeTermination,
  type InsertEmployeeTermination,
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
  type SupportRoom,
  type InsertSupportRoom,
  type SupportTicketAccess,
  type InsertSupportTicketAccess,
  type AuditLog,
  type InsertAuditLog,
  type FeatureFlag,
  type InsertFeatureFlag,
  type PlatformRevenue,
  type InsertPlatformRevenue,
  type WorkspaceAiUsage,
  type InsertWorkspaceAiUsage,
  type ChatConversation,
  type InsertChatConversation,
  type ChatMessage,
  type InsertChatMessage,
  type CustomForm,
  type InsertCustomForm,
  type CustomFormSubmission,
  type InsertCustomFormSubmission,
  type PayrollRun,
  type PayrollEntry,
  type LeaderAction,
  type InsertLeaderAction,
  type EscalationTicket,
  type InsertEscalationTicket,
  type OnboardingWorkflowTemplate,
  type InsertOnboardingWorkflowTemplate,
  type EmployeeDocument,
  type InsertEmployeeDocument,
  type DocumentAccessLog,
  type InsertDocumentAccessLog,
  type OnboardingChecklist,
  type InsertOnboardingChecklist,
  type Dispute,
  type InsertDispute,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, isNotNull, isNull, or, like, sql } from "drizzle-orm";

// Generate unique organization ID: wfosupport-#########
function generateOrganizationId(): string {
  const randomNum = Math.floor(100000000 + Math.random() * 900000000); // 9-digit number
  return `wfosupport-${randomNum}`;
}

// Generate organization serial number: ORG-XXXX-XXXX
// Format: ORG-<sequential>-<random>
// - First segment: Sequential counter (0001-9999, never 0000)
// - Second segment: Random verification code (0000-9999)
async function generateOrganizationSerial(): Promise<string> {
  // Get count of existing workspaces for sequential number
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaces);
  
  // Sequential counter: cycles 1-9999 (never 0)
  const sequential = ((result?.count || 0) % 9999) + 1;
  const random = Math.floor(Math.random() * 10000); // 0000-9999
  
  const sequentialStr = sequential.toString().padStart(4, '0');
  const randomStr = random.toString().padStart(4, '0');
  
  return `ORG-${sequentialStr}-${randomStr}`;
}

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
  getEmployeeByUserId(userId: string): Promise<Employee | undefined>;
  getEmployeeById(employeeId: string): Promise<Employee | undefined>;
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
  
  // Audit Log operations (Security & Compliance)
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(workspaceId: string, filters?: { userId?: string; entityType?: string; action?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }): Promise<AuditLog[]>;
  
  // Feature Flag operations (Monetization)
  getFeatureFlags(workspaceId: string): Promise<FeatureFlag | undefined>;
  createFeatureFlags(flags: InsertFeatureFlag): Promise<FeatureFlag>;
  updateFeatureFlags(workspaceId: string, data: Partial<InsertFeatureFlag>): Promise<FeatureFlag>;
  
  // Platform Revenue operations (Monetization tracking)
  createPlatformRevenue(revenue: InsertPlatformRevenue): Promise<PlatformRevenue>;
  getPlatformRevenue(workspaceId: string, filters?: { revenueType?: string; startDate?: Date; endDate?: Date }): Promise<PlatformRevenue[]>;
  
  // AI Usage Tracking operations
  createAiUsage(usage: InsertWorkspaceAiUsage): Promise<WorkspaceAiUsage>;
  getAiUsage(workspaceId: string, filters?: { feature?: string; billingPeriod?: string }): Promise<WorkspaceAiUsage[]>;
  getAiUsageSummary(workspaceId: string, billingPeriod: string): Promise<{ totalCost: number; totalCharge: number; operationCount: number }>;
  
  // Employee Benefits operations (HR)
  createEmployeeBenefit(benefit: InsertEmployeeBenefit): Promise<EmployeeBenefit>;
  getEmployeeBenefit(id: string, workspaceId: string): Promise<EmployeeBenefit | undefined>;
  getEmployeeBenefitsByEmployee(employeeId: string, workspaceId: string): Promise<EmployeeBenefit[]>;
  getEmployeeBenefitsByWorkspace(workspaceId: string): Promise<EmployeeBenefit[]>;
  updateEmployeeBenefit(id: string, workspaceId: string, data: Partial<InsertEmployeeBenefit>): Promise<EmployeeBenefit | undefined>;
  deleteEmployeeBenefit(id: string, workspaceId: string): Promise<boolean>;
  
  // Performance Review operations (HR)
  createPerformanceReview(review: InsertPerformanceReview): Promise<PerformanceReview>;
  getPerformanceReview(id: string, workspaceId: string): Promise<PerformanceReview | undefined>;
  getPerformanceReviewsByEmployee(employeeId: string, workspaceId: string): Promise<PerformanceReview[]>;
  getPerformanceReviewsByWorkspace(workspaceId: string): Promise<PerformanceReview[]>;
  updatePerformanceReview(id: string, workspaceId: string, data: Partial<InsertPerformanceReview>): Promise<PerformanceReview | undefined>;
  deletePerformanceReview(id: string, workspaceId: string): Promise<boolean>;
  
  // Dispute operations (Fair Employee/Employer Transparency)
  createDispute(dispute: InsertDispute): Promise<Dispute>;
  getDispute(id: string, workspaceId: string): Promise<Dispute | undefined>;
  getDisputesByFiledBy(filedBy: string, workspaceId: string): Promise<Dispute[]>;
  getDisputesByWorkspace(workspaceId: string, filters?: { status?: string; disputeType?: string; assignedTo?: string }): Promise<Dispute[]>;
  getDisputesByTarget(targetType: string, targetId: string, workspaceId: string): Promise<Dispute[]>;
  updateDispute(id: string, workspaceId: string, data: Partial<InsertDispute>): Promise<Dispute | undefined>;
  assignDispute(id: string, workspaceId: string, assignedTo: string): Promise<Dispute | undefined>;
  resolveDispute(id: string, workspaceId: string, resolvedBy: string, resolution: string, resolutionAction: string): Promise<Dispute | undefined>;
  applyDisputeChanges(id: string, workspaceId: string): Promise<Dispute | undefined>;
  
  // PTO Request operations (HR)
  createPtoRequest(request: InsertPtoRequest): Promise<PtoRequest>;
  getPtoRequest(id: string, workspaceId: string): Promise<PtoRequest | undefined>;
  getPtoRequestsByEmployee(employeeId: string, workspaceId: string): Promise<PtoRequest[]>;
  getPtoRequestsByWorkspace(workspaceId: string, filters?: { status?: string }): Promise<PtoRequest[]>;
  updatePtoRequest(id: string, workspaceId: string, data: Partial<InsertPtoRequest>): Promise<PtoRequest | undefined>;
  approvePtoRequest(id: string, workspaceId: string, approverId: string): Promise<PtoRequest | undefined>;
  denyPtoRequest(id: string, workspaceId: string, approverId: string, denialReason: string): Promise<PtoRequest | undefined>;
  
  // Employee Termination operations (HR)
  createEmployeeTermination(termination: InsertEmployeeTermination): Promise<EmployeeTermination>;
  getEmployeeTermination(id: string, workspaceId: string): Promise<EmployeeTermination | undefined>;
  getEmployeeTerminationsByWorkspace(workspaceId: string): Promise<EmployeeTermination[]>;
  updateEmployeeTermination(id: string, workspaceId: string, data: Partial<InsertEmployeeTermination>): Promise<EmployeeTermination | undefined>;
  completeTermination(id: string, workspaceId: string): Promise<EmployeeTermination | undefined>;
  
  // Platform Role operations
  getUserPlatformRole(userId: string): Promise<string | null>;
  
  // Live Chat operations (Support System)
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  getChatConversation(id: string): Promise<ChatConversation | undefined>;
  getChatConversationsByWorkspace(workspaceId: string, filters?: { status?: string }): Promise<ChatConversation[]>;
  getAllChatConversations(filters?: { status?: string }): Promise<ChatConversation[]>;
  updateChatConversation(id: string, data: Partial<InsertChatConversation>): Promise<ChatConversation | undefined>;
  closeChatConversation(id: string): Promise<ChatConversation | undefined>;
  getClosedConversationsForReview(): Promise<ChatConversation[]>;
  getPositiveTestimonials(): Promise<ChatConversation[]>;
  
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessagesByConversation(conversationId: string): Promise<ChatMessage[]>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;
  
  // HelpDesk Room operations (Professional Support Chat)
  createSupportRoom(room: InsertSupportRoom): Promise<SupportRoom>;
  getSupportRoomBySlug(slug: string): Promise<SupportRoom | undefined>;
  updateSupportRoomStatus(slug: string, status: string, statusMessage: string | null, changedBy: string): Promise<SupportRoom | undefined>;
  verifyTicketForChatAccess(ticketNumber: string, userId: string): Promise<SupportTicket | undefined>;
  grantTicketAccess(access: InsertSupportTicketAccess): Promise<SupportTicketAccess>;
  checkTicketAccess(userId: string, roomId: string): Promise<SupportTicketAccess | undefined>;
  revokeTicketAccess(id: string, revokedBy: string, reason: string): Promise<boolean>;
  incrementAccessJoinCount(accessId: string): Promise<void>;
  
  // Custom Forms operations (Organization-specific forms)
  createCustomForm(form: InsertCustomForm): Promise<CustomForm>;
  getCustomForm(id: string): Promise<CustomForm | undefined>;
  getCustomFormsByOrganization(organizationId: string): Promise<CustomForm[]>;
  updateCustomForm(id: string, data: Partial<InsertCustomForm>): Promise<CustomForm | undefined>;
  deleteCustomForm(id: string): Promise<boolean>;
  
  // Custom Form Submission operations
  createCustomFormSubmission(submission: InsertCustomFormSubmission): Promise<CustomFormSubmission>;
  getCustomFormSubmission(id: string): Promise<CustomFormSubmission | undefined>;
  getCustomFormSubmissionsByOrganization(organizationId: string): Promise<CustomFormSubmission[]>;
  getCustomFormSubmissionsByForm(formId: string): Promise<CustomFormSubmission[]>;
  updateCustomFormSubmission(id: string, data: Partial<InsertCustomFormSubmission>): Promise<CustomFormSubmission | undefined>;
  
  // PayrollOS™ operations (Automated Payroll Processing)
  getPayrollRunsByWorkspace(workspaceId: string): Promise<PayrollRun[]>;
  getPayrollRun(id: string, workspaceId: string): Promise<PayrollRun | undefined>;
  updatePayrollRunStatus(id: string, status: string, processedBy: string): Promise<PayrollRun | undefined>;
  getPayrollEntriesByRun(payrollRunId: string): Promise<PayrollEntry[]>;
  getPayrollEntriesByEmployee(employeeId: string, workspaceId: string): Promise<PayrollEntry[]>;
  
  // Abuse violation operations (Staff Protection)
  createAbuseViolation(violation: InsertAbuseViolation): Promise<AbuseViolation>;
  getUserViolationCount(userId: string): Promise<number>;
  isUserBanned(userId: string): Promise<boolean>;
  getBanInfo(userId: string): Promise<{ isBanned: boolean; bannedUntil: Date | null; reason: string | null }>;
  
  // BillOS™ operations (Financial Automation - extends existing invoice/payroll)
  // Client billing rates
  getClientRates(workspaceId: string, clientId: string): Promise<any[]>;
  // Expense management
  getExpenseReports(workspaceId: string, filters?: { status?: string; employeeId?: string }): Promise<any[]>;
  approveExpense(expenseId: string, workspaceId: string, approverId: string): Promise<any>;
  
  // ReportOS™ Monopolistic Features
  // KPI Alerts
  createKpiAlert(alert: any): Promise<any>;
  getKpiAlerts(workspaceId: string): Promise<any[]>;
  updateKpiAlert(id: string, workspaceId: string, data: any): Promise<any>;
  deleteKpiAlert(id: string, workspaceId: string): Promise<boolean>;
  triggerKpiAlert(alertId: string, metricValue: number, entityData: any): Promise<any>;
  getKpiAlertTriggers(workspaceId: string, alertId?: string): Promise<any[]>;
  acknowledgeAlert(triggerId: string, userId: string): Promise<any>;
  
  // Benchmark Metrics
  createBenchmarkMetric(metric: any): Promise<any>;
  getBenchmarkMetrics(workspaceId: string, periodType?: string): Promise<any[]>;
  
  // ========================================================================
  // TALENTOS™ - INTERNAL TALENT MARKETPLACE
  // ========================================================================
  createInternalBid(bid: any): Promise<any>;
  getInternalBidById(id: string): Promise<any | undefined>;
  getInternalBids(workspaceId: string, filters?: { status?: string }): Promise<any[]>;
  updateInternalBid(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  
  createBidApplication(application: any): Promise<any>;
  getBidApplication(id: string): Promise<any | undefined>;
  getBidApplicationsByBid(bidId: string): Promise<any[]>;
  getBidApplicationsByEmployee(employeeId: string, workspaceId: string): Promise<any[]>;
  updateBidApplication(id: string, data: any): Promise<any | undefined>;
  
  // ========================================================================
  // TALENTOS™ - PERFORMANCE REVIEWS & CAREER PATHING
  // ========================================================================
  createPerformanceReview(review: any): Promise<any>;
  getPerformanceReview(id: string, workspaceId: string): Promise<any | undefined>;
  getPerformanceReviewsByEmployee(employeeId: string, workspaceId: string): Promise<any[]>;
  updatePerformanceReview(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  
  createRoleTemplate(template: any): Promise<any>;
  getRoleTemplate(id: string, workspaceId: string): Promise<any | undefined>;
  getRoleTemplates(workspaceId: string): Promise<any[]>;
  updateRoleTemplate(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  
  createSkillGapAnalysis(analysis: any): Promise<any>;
  getSkillGapAnalysis(id: string, workspaceId: string): Promise<any | undefined>;
  getSkillGapAnalysesByEmployee(workspaceId: string, employeeId: string): Promise<any[]>;
  updateSkillGapAnalysis(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  
  // ========================================================================
  // ASSETOS™ - PHYSICAL RESOURCE ALLOCATION
  // ========================================================================
  createAsset(asset: any): Promise<any>;
  getAsset(id: string, workspaceId: string): Promise<any | undefined>;
  getAssets(workspaceId: string, filters?: { status?: string }): Promise<any[]>;
  updateAsset(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  
  createAssetSchedule(schedule: any): Promise<any>;
  getAssetSchedule(id: string, workspaceId: string): Promise<any | undefined>;
  getAssetSchedulesByAsset(assetId: string, workspaceId: string, startTime?: Date, endTime?: Date): Promise<any[]>;
  getAssetSchedulesByAssetAndDateRange(assetId: string, workspaceId: string, startDate: Date, endDate: Date): Promise<any[]>;
  updateAssetSchedule(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  
  createAssetUsageLog(log: any): Promise<any>;
  getAssetUsageLog(id: string, workspaceId: string): Promise<any | undefined>;
  getAssetUsageLogsByClient(workspaceId: string, clientId: string, startDate: Date, endDate: Date, status?: string): Promise<any[]>;
  getAssetUsageLogsByDateRange(workspaceId: string, startDate: Date, endDate: Date): Promise<any[]>;
  updateAssetUsageLog(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  
  // ========================================================================
  // HIREOS™ - DIGITAL FILE CABINET & COMPLIANCE WORKFLOW
  // ========================================================================
  createEmployeeDocument(document: InsertEmployeeDocument): Promise<EmployeeDocument>;
  getEmployeeDocument(id: string): Promise<EmployeeDocument | undefined>;
  getEmployeeDocuments(workspaceId: string, employeeId: string, documentType?: string, status?: string): Promise<EmployeeDocument[]>;
  approveEmployeeDocument(id: string, approvedBy: string, notes?: string): Promise<EmployeeDocument | undefined>;
  rejectEmployeeDocument(id: string, rejectedBy: string, reason: string): Promise<EmployeeDocument | undefined>;
  
  logDocumentAccess(log: InsertDocumentAccessLog): Promise<DocumentAccessLog>;
  getDocumentAccessLogs(documentId: string): Promise<DocumentAccessLog[]>;
  
  createOnboardingWorkflowTemplate(template: InsertOnboardingWorkflowTemplate): Promise<OnboardingWorkflowTemplate>;
  getOnboardingWorkflowTemplate(id: string): Promise<OnboardingWorkflowTemplate | undefined>;
  getOnboardingWorkflowTemplates(workspaceId: string): Promise<OnboardingWorkflowTemplate[]>;
  updateOnboardingWorkflowTemplate(id: string, data: Partial<InsertOnboardingWorkflowTemplate>): Promise<OnboardingWorkflowTemplate | undefined>;
  
  createOnboardingChecklist(checklist: InsertOnboardingChecklist): Promise<OnboardingChecklist>;
  getOnboardingChecklist(id: string): Promise<OnboardingChecklist | undefined>;
  getOnboardingChecklistByApplication(applicationId: string): Promise<OnboardingChecklist | undefined>;
  updateOnboardingChecklist(id: string, data: Partial<InsertOnboardingChecklist>): Promise<OnboardingChecklist | undefined>;
  
  getHireOSComplianceReport(workspaceId: string): Promise<any>;
  
  // ========================================================================
  // HELPER METHODS FOR UNIFIED DATA NEXUS
  // ========================================================================
  getShiftsByEmployeeAndDateRange(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]>;
  getTimeEntriesByEmployeeAndDateRange(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]>;
  getReportSubmissionsByEmployee(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]>;
  getTimeEntryDiscrepancies(workspaceId: string, filters?: { employeeId?: string; startDate?: Date; endDate?: Date }): Promise<any[]>;
  getTurnoverPredictions(workspaceId: string, filters?: { employeeId?: string; limit?: number }): Promise<any[]>;
  getInvoices(workspaceId: string): Promise<any[]>;
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

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // ============================================================================
  // WORKSPACE OPERATIONS
  // ============================================================================
  
  async createWorkspace(workspaceData: InsertWorkspace): Promise<Workspace> {
    // Auto-generate unique organization ID and serial if not provided
    const dataWithOrgInfo = {
      ...workspaceData,
      organizationId: workspaceData.organizationId || generateOrganizationId(),
      organizationSerial: workspaceData.organizationSerial || await generateOrganizationSerial(),
    };
    
    const [workspace] = await db
      .insert(workspaces)
      .values(dataWithOrgInfo)
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

  async getEmployeeByUserId(userId: string): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.userId, userId));
    return employee;
  }

  async getEmployeeById(employeeId: string): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId));
    return employee;
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
  
  // ============================================================================
  // AUDIT LOG OPERATIONS (Security & Compliance)
  // ============================================================================
  
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db
      .insert(auditLogs)
      .values(log)
      .returning();
    
    return newLog;
  }
  
  async getAuditLogs(
    workspaceId: string,
    filters?: {
      userId?: string;
      entityType?: string;
      action?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLog[]> {
    // Apply filters if provided
    const conditions = [eq(auditLogs.workspaceId, workspaceId)];
    
    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters?.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action as any));
    }
    if (filters?.startDate) {
      conditions.push(sql`${auditLogs.createdAt} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${auditLogs.createdAt} <= ${filters.endDate}`);
    }
    
    // Support pagination with explicit offset/limit controls
    const limit = Math.min(filters?.limit || 1000, 1000); // Cap at 1000 for performance
    const offset = filters?.offset || 0;
    
    return await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }
  
  // ============================================================================
  // FEATURE FLAG OPERATIONS (Monetization)
  // ============================================================================
  
  async getFeatureFlags(workspaceId: string): Promise<FeatureFlag | undefined> {
    const [flags] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.workspaceId, workspaceId));
    
    return flags;
  }
  
  async createFeatureFlags(flags: InsertFeatureFlag): Promise<FeatureFlag> {
    const [newFlags] = await db
      .insert(featureFlags)
      .values(flags)
      .returning();
    
    return newFlags;
  }
  
  async updateFeatureFlags(workspaceId: string, data: Partial<InsertFeatureFlag>): Promise<FeatureFlag> {
    const [updated] = await db
      .update(featureFlags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(featureFlags.workspaceId, workspaceId))
      .returning();
    
    return updated;
  }
  
  // ============================================================================
  // PLATFORM REVENUE OPERATIONS (Monetization Tracking)
  // ============================================================================
  
  async createPlatformRevenue(revenue: InsertPlatformRevenue): Promise<PlatformRevenue> {
    const [newRevenue] = await db
      .insert(platformRevenue)
      .values(revenue)
      .returning();
    
    return newRevenue;
  }
  
  async getPlatformRevenue(
    workspaceId: string,
    filters?: { revenueType?: string; startDate?: Date; endDate?: Date }
  ): Promise<PlatformRevenue[]> {
    const conditions = [eq(platformRevenue.workspaceId, workspaceId)];
    
    if (filters?.revenueType) {
      conditions.push(eq(platformRevenue.revenueType, filters.revenueType));
    }
    if (filters?.startDate) {
      conditions.push(sql`${platformRevenue.createdAt} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${platformRevenue.createdAt} <= ${filters.endDate}`);
    }
    
    return await db
      .select()
      .from(platformRevenue)
      .where(and(...conditions))
      .orderBy(desc(platformRevenue.createdAt));
  }
  
  // ============================================================================
  // AI USAGE TRACKING OPERATIONS
  // ============================================================================
  
  async createAiUsage(usage: InsertWorkspaceAiUsage): Promise<WorkspaceAiUsage> {
    const [newUsage] = await db
      .insert(workspaceAiUsage)
      .values(usage)
      .returning();
    
    return newUsage;
  }
  
  async getAiUsage(
    workspaceId: string,
    filters?: { feature?: string; billingPeriod?: string }
  ): Promise<WorkspaceAiUsage[]> {
    const conditions = [eq(workspaceAiUsage.workspaceId, workspaceId)];
    
    if (filters?.feature) {
      conditions.push(eq(workspaceAiUsage.feature, filters.feature));
    }
    if (filters?.billingPeriod) {
      conditions.push(eq(workspaceAiUsage.billingPeriod, filters.billingPeriod));
    }
    
    return await db
      .select()
      .from(workspaceAiUsage)
      .where(and(...conditions))
      .orderBy(desc(workspaceAiUsage.createdAt));
  }
  
  async getAiUsageSummary(
    workspaceId: string,
    billingPeriod: string
  ): Promise<{ totalCost: number; totalCharge: number; operationCount: number }> {
    const usage = await db
      .select()
      .from(workspaceAiUsage)
      .where(
        and(
          eq(workspaceAiUsage.workspaceId, workspaceId),
          eq(workspaceAiUsage.billingPeriod, billingPeriod)
        )
      );
    
    const summary = usage.reduce(
      (acc, record) => ({
        totalCost: acc.totalCost + parseFloat(record.providerCostUsd as string || "0"),
        totalCharge: acc.totalCharge + parseFloat(record.clientChargeUsd as string || "0"),
        operationCount: acc.operationCount + 1,
      }),
      { totalCost: 0, totalCharge: 0, operationCount: 0 }
    );
    
    return summary;
  }

  // ============================================================================
  // EMPLOYEE BENEFITS OPERATIONS (HR)
  // ============================================================================
  
  async createEmployeeBenefit(benefit: InsertEmployeeBenefit): Promise<EmployeeBenefit> {
    const [newBenefit] = await db
      .insert(employeeBenefits)
      .values(benefit)
      .returning();
    
    return newBenefit;
  }
  
  async getEmployeeBenefit(id: string, workspaceId: string): Promise<EmployeeBenefit | undefined> {
    const [benefit] = await db
      .select()
      .from(employeeBenefits)
      .where(and(eq(employeeBenefits.id, id), eq(employeeBenefits.workspaceId, workspaceId)));
    
    return benefit;
  }
  
  async getEmployeeBenefitsByEmployee(employeeId: string, workspaceId: string): Promise<EmployeeBenefit[]> {
    return await db
      .select()
      .from(employeeBenefits)
      .where(
        and(
          eq(employeeBenefits.employeeId, employeeId),
          eq(employeeBenefits.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(employeeBenefits.createdAt));
  }
  
  async getEmployeeBenefitsByWorkspace(workspaceId: string): Promise<EmployeeBenefit[]> {
    return await db
      .select()
      .from(employeeBenefits)
      .where(eq(employeeBenefits.workspaceId, workspaceId))
      .orderBy(desc(employeeBenefits.createdAt));
  }
  
  async updateEmployeeBenefit(
    id: string,
    workspaceId: string,
    data: Partial<InsertEmployeeBenefit>
  ): Promise<EmployeeBenefit | undefined> {
    const [updated] = await db
      .update(employeeBenefits)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(employeeBenefits.id, id), eq(employeeBenefits.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }
  
  async deleteEmployeeBenefit(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(employeeBenefits)
      .where(and(eq(employeeBenefits.id, id), eq(employeeBenefits.workspaceId, workspaceId)))
      .returning();
    
    return result.length > 0;
  }

  // ============================================================================
  // PERFORMANCE REVIEW OPERATIONS (HR)
  // ============================================================================
  
  async createPerformanceReview(review: InsertPerformanceReview): Promise<PerformanceReview> {
    const [newReview] = await db
      .insert(performanceReviews)
      .values(review)
      .returning();
    
    return newReview;
  }
  
  async getPerformanceReview(id: string, workspaceId: string): Promise<PerformanceReview | undefined> {
    const [review] = await db
      .select()
      .from(performanceReviews)
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.workspaceId, workspaceId)));
    
    return review;
  }
  
  async getPerformanceReviewsByEmployee(employeeId: string, workspaceId: string): Promise<PerformanceReview[]> {
    return await db
      .select()
      .from(performanceReviews)
      .where(
        and(
          eq(performanceReviews.employeeId, employeeId),
          eq(performanceReviews.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(performanceReviews.createdAt));
  }
  
  async getPerformanceReviewsByWorkspace(workspaceId: string): Promise<PerformanceReview[]> {
    return await db
      .select()
      .from(performanceReviews)
      .where(eq(performanceReviews.workspaceId, workspaceId))
      .orderBy(desc(performanceReviews.createdAt));
  }
  
  async updatePerformanceReview(
    id: string,
    workspaceId: string,
    data: Partial<InsertPerformanceReview>
  ): Promise<PerformanceReview | undefined> {
    const [updated] = await db
      .update(performanceReviews)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }
  
  async deletePerformanceReview(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(performanceReviews)
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.workspaceId, workspaceId)))
      .returning();
    
    return result.length > 0;
  }

  // ============================================================================
  // DISPUTE OPERATIONS (Fair Employee/Employer Transparency)
  // ============================================================================
  
  async createDispute(dispute: InsertDispute): Promise<Dispute> {
    const [newDispute] = await db
      .insert(disputes)
      .values(dispute)
      .returning();
    
    return newDispute;
  }
  
  async getDispute(id: string, workspaceId: string): Promise<Dispute | undefined> {
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(and(eq(disputes.id, id), eq(disputes.workspaceId, workspaceId)));
    
    return dispute;
  }
  
  async getDisputesByFiledBy(filedBy: string, workspaceId: string): Promise<Dispute[]> {
    return await db
      .select()
      .from(disputes)
      .where(
        and(
          eq(disputes.filedBy, filedBy),
          eq(disputes.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(disputes.filedAt));
  }
  
  async getDisputesByWorkspace(
    workspaceId: string,
    filters?: { status?: string; disputeType?: string; assignedTo?: string }
  ): Promise<Dispute[]> {
    const conditions = [eq(disputes.workspaceId, workspaceId)];
    
    if (filters?.status) {
      conditions.push(eq(disputes.status, filters.status));
    }
    
    if (filters?.disputeType) {
      conditions.push(eq(disputes.disputeType, filters.disputeType));
    }
    
    if (filters?.assignedTo) {
      conditions.push(eq(disputes.assignedTo, filters.assignedTo));
    }
    
    return await db
      .select()
      .from(disputes)
      .where(and(...conditions))
      .orderBy(desc(disputes.filedAt));
  }
  
  async getDisputesByTarget(targetType: string, targetId: string, workspaceId: string): Promise<Dispute[]> {
    return await db
      .select()
      .from(disputes)
      .where(
        and(
          eq(disputes.targetType, targetType),
          eq(disputes.targetId, targetId),
          eq(disputes.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(disputes.filedAt));
  }
  
  async updateDispute(
    id: string,
    workspaceId: string,
    data: Partial<InsertDispute>
  ): Promise<Dispute | undefined> {
    const [updated] = await db
      .update(disputes)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(disputes.id, id), eq(disputes.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }
  
  async assignDispute(id: string, workspaceId: string, assignedTo: string): Promise<Dispute | undefined> {
    const [updated] = await db
      .update(disputes)
      .set({ 
        assignedTo, 
        assignedAt: new Date(),
        status: 'under_review',
        updatedAt: new Date() 
      })
      .where(and(eq(disputes.id, id), eq(disputes.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }
  
  async resolveDispute(
    id: string,
    workspaceId: string,
    resolvedBy: string,
    resolution: string,
    resolutionAction: string
  ): Promise<Dispute | undefined> {
    const [updated] = await db
      .update(disputes)
      .set({ 
        resolvedBy,
        resolution,
        resolutionAction,
        status: 'resolved',
        resolvedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(and(eq(disputes.id, id), eq(disputes.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }
  
  async applyDisputeChanges(id: string, workspaceId: string): Promise<Dispute | undefined> {
    const [updated] = await db
      .update(disputes)
      .set({ 
        changesApplied: true,
        changesAppliedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(and(eq(disputes.id, id), eq(disputes.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }

  // ============================================================================
  // PTO REQUEST OPERATIONS (HR)
  // ============================================================================
  
  async createPtoRequest(request: InsertPtoRequest): Promise<PtoRequest> {
    const [newRequest] = await db
      .insert(ptoRequests)
      .values(request)
      .returning();
    
    return newRequest;
  }
  
  async getPtoRequest(id: string, workspaceId: string): Promise<PtoRequest | undefined> {
    const [request] = await db
      .select()
      .from(ptoRequests)
      .where(and(eq(ptoRequests.id, id), eq(ptoRequests.workspaceId, workspaceId)));
    
    return request;
  }
  
  async getPtoRequestsByEmployee(employeeId: string, workspaceId: string): Promise<PtoRequest[]> {
    return await db
      .select()
      .from(ptoRequests)
      .where(
        and(
          eq(ptoRequests.employeeId, employeeId),
          eq(ptoRequests.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(ptoRequests.createdAt));
  }
  
  async getPtoRequestsByWorkspace(workspaceId: string, filters?: { status?: string }): Promise<PtoRequest[]> {
    const conditions = [eq(ptoRequests.workspaceId, workspaceId)];
    
    if (filters?.status) {
      conditions.push(eq(ptoRequests.status, filters.status as any));
    }
    
    return await db
      .select()
      .from(ptoRequests)
      .where(and(...conditions))
      .orderBy(desc(ptoRequests.createdAt));
  }
  
  async updatePtoRequest(
    id: string,
    workspaceId: string,
    data: Partial<InsertPtoRequest>
  ): Promise<PtoRequest | undefined> {
    const [updated] = await db
      .update(ptoRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(ptoRequests.id, id), eq(ptoRequests.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }
  
  async approvePtoRequest(id: string, workspaceId: string, approverId: string): Promise<PtoRequest | undefined> {
    const [approved] = await db
      .update(ptoRequests)
      .set({
        status: "approved",
        approverId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(ptoRequests.id, id), eq(ptoRequests.workspaceId, workspaceId)))
      .returning();
    
    return approved;
  }
  
  async denyPtoRequest(
    id: string,
    workspaceId: string,
    approverId: string,
    denialReason: string
  ): Promise<PtoRequest | undefined> {
    const [denied] = await db
      .update(ptoRequests)
      .set({
        status: "denied",
        approverId,
        denialReason,
        updatedAt: new Date(),
      })
      .where(and(eq(ptoRequests.id, id), eq(ptoRequests.workspaceId, workspaceId)))
      .returning();
    
    return denied;
  }

  // ============================================================================
  // EMPLOYEE TERMINATION OPERATIONS (HR)
  // ============================================================================
  
  async createEmployeeTermination(termination: InsertEmployeeTermination): Promise<EmployeeTermination> {
    const [newTermination] = await db
      .insert(employeeTerminations)
      .values(termination)
      .returning();
    
    return newTermination;
  }
  
  async getEmployeeTermination(id: string, workspaceId: string): Promise<EmployeeTermination | undefined> {
    const [termination] = await db
      .select()
      .from(employeeTerminations)
      .where(and(eq(employeeTerminations.id, id), eq(employeeTerminations.workspaceId, workspaceId)));
    
    return termination;
  }
  
  async getEmployeeTerminationsByWorkspace(workspaceId: string): Promise<EmployeeTermination[]> {
    return await db
      .select()
      .from(employeeTerminations)
      .where(eq(employeeTerminations.workspaceId, workspaceId))
      .orderBy(desc(employeeTerminations.createdAt));
  }
  
  async updateEmployeeTermination(
    id: string,
    workspaceId: string,
    data: Partial<InsertEmployeeTermination>
  ): Promise<EmployeeTermination | undefined> {
    const [updated] = await db
      .update(employeeTerminations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(employeeTerminations.id, id), eq(employeeTerminations.workspaceId, workspaceId)))
      .returning();
    
    return updated;
  }
  
  async completeTermination(id: string, workspaceId: string): Promise<EmployeeTermination | undefined> {
    const [completed] = await db
      .update(employeeTerminations)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(employeeTerminations.id, id), eq(employeeTerminations.workspaceId, workspaceId)))
      .returning();
    
    return completed;
  }

  // ============================================================================
  // PLATFORM ROLE OPERATIONS
  // ============================================================================
  
  async getUserPlatformRole(userId: string): Promise<string | null> {
    const [roleRecord] = await db
      .select()
      .from(platformRoles)
      .where(and(
        eq(platformRoles.userId, userId),
        isNull(platformRoles.revokedAt)
      ))
      .limit(1);
    
    return roleRecord?.role || null;
  }

  // ============================================================================
  // LIVE CHAT OPERATIONS (Support System)
  // ============================================================================
  
  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    const [newConversation] = await db
      .insert(chatConversations)
      .values(conversation)
      .returning();
    
    return newConversation;
  }
  
  async getChatConversation(id: string): Promise<ChatConversation | undefined> {
    const [conversation] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, id));
    
    return conversation;
  }
  
  async getChatConversationsByWorkspace(workspaceId: string, filters?: { status?: string }): Promise<ChatConversation[]> {
    const conditions = [eq(chatConversations.workspaceId, workspaceId)];
    
    if (filters?.status) {
      conditions.push(eq(chatConversations.status, filters.status as any));
    }
    
    return await db
      .select()
      .from(chatConversations)
      .where(and(...conditions))
      .orderBy(desc(chatConversations.lastMessageAt));
  }
  
  async getAllChatConversations(filters?: { status?: string }): Promise<ChatConversation[]> {
    let query = db.select().from(chatConversations);
    
    if (filters?.status) {
      query = query.where(eq(chatConversations.status, filters.status as any)) as any;
    }
    
    return await query.orderBy(desc(chatConversations.lastMessageAt));
  }
  
  async updateChatConversation(id: string, data: Partial<InsertChatConversation>): Promise<ChatConversation | undefined> {
    const [updated] = await db
      .update(chatConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(chatConversations.id, id))
      .returning();
    
    return updated;
  }
  
  async closeChatConversation(id: string): Promise<ChatConversation | undefined> {
    const [closed] = await db
      .update(chatConversations)
      .set({
        status: "closed",
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, id))
      .returning();
    
    return closed;
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db
      .insert(chatMessages)
      .values(message)
      .returning();
    
    // Update conversation's lastMessageAt
    await db
      .update(chatConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatConversations.id, message.conversationId));
    
    return newMessage;
  }
  
  async getChatMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }
  
  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    await db
      .update(chatMessages)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.isRead, false),
          sql`${chatMessages.senderId} != ${userId}` // Only mark messages from other users as read
        )
      );
  }

  async getClosedConversationsForReview(): Promise<ChatConversation[]> {
    return await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.status, 'closed'))
      .orderBy(desc(chatConversations.closedAt));
  }

  async getPositiveTestimonials(): Promise<ChatConversation[]> {
    return await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.status, 'closed'),
          sql`${chatConversations.rating} >= 4`, // 4-5 star reviews
          sql`${chatConversations.feedback} IS NOT NULL`
        )
      )
      .orderBy(desc(chatConversations.rating), desc(chatConversations.closedAt))
      .limit(50); // Top 50 testimonials
  }

  // ============================================================================
  // HELPDESK ROOM OPERATIONS (Professional Support Chat)
  // ============================================================================
  
  async createSupportRoom(roomData: InsertSupportRoom): Promise<SupportRoom> {
    const [room] = await db
      .insert(supportRooms)
      .values(roomData)
      .returning();
    
    return room;
  }
  
  async getSupportRoomBySlug(slug: string): Promise<SupportRoom | undefined> {
    const [room] = await db
      .select()
      .from(supportRooms)
      .where(eq(supportRooms.slug, slug));
    
    return room;
  }
  
  async updateSupportRoomStatus(
    slug: string, 
    status: string, 
    statusMessage: string | null, 
    changedBy: string
  ): Promise<SupportRoom | undefined> {
    const [updated] = await db
      .update(supportRooms)
      .set({ 
        status,
        statusMessage,
        lastStatusChange: new Date(),
        statusChangedBy: changedBy,
        updatedAt: new Date()
      })
      .where(eq(supportRooms.slug, slug))
      .returning();
    
    return updated;
  }
  
  async verifyTicketForChatAccess(ticketNumber: string, userId: string): Promise<SupportTicket | undefined> {
    // SECURITY: Verify ticket ownership before granting access
    // Ticket must be:
    // 1. Match the provided ticket number
    // 2. Be in 'open' status
    // 3. Have been verified (verifiedAt is not null) by support staff
    // 4. Belong to the user (via clientId, employeeId, or associated user record)
    
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .leftJoin(employees, eq(supportTickets.employeeId, employees.id))
      .leftJoin(clients, eq(supportTickets.clientId, clients.id))
      .where(
        and(
          eq(supportTickets.ticketNumber, ticketNumber),
          eq(supportTickets.status, 'open'),
          isNotNull(supportTickets.verifiedAt),
          // User must own this ticket via employee or client association
          or(
            eq(employees.userId, userId),
            eq(clients.userId, userId)
          )
        )
      );
    
    return ticket ? ticket.support_tickets : undefined;
  }
  
  async grantTicketAccess(accessData: InsertSupportTicketAccess): Promise<SupportTicketAccess> {
    const [access] = await db
      .insert(supportTicketAccess)
      .values(accessData)
      .returning();
    
    return access;
  }
  
  async checkTicketAccess(userId: string, roomId: string): Promise<SupportTicketAccess | undefined> {
    const [access] = await db
      .select()
      .from(supportTicketAccess)
      .where(
        and(
          eq(supportTicketAccess.userId, userId),
          eq(supportTicketAccess.roomId, roomId),
          eq(supportTicketAccess.isRevoked, false),
          sql`${supportTicketAccess.expiresAt} > NOW()`
        )
      )
      .orderBy(desc(supportTicketAccess.createdAt))
      .limit(1);
    
    return access;
  }
  
  async revokeTicketAccess(id: string, revokedBy: string, reason: string): Promise<boolean> {
    const result = await db
      .update(supportTicketAccess)
      .set({
        isRevoked: true,
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason
      })
      .where(eq(supportTicketAccess.id, id))
      .returning();
    
    return result.length > 0;
  }
  
  async incrementAccessJoinCount(accessId: string): Promise<void> {
    await db
      .update(supportTicketAccess)
      .set({
        joinCount: sql`${supportTicketAccess.joinCount} + 1`,
        lastJoinedAt: new Date()
      })
      .where(eq(supportTicketAccess.id, accessId));
  }

  // ============================================================================
  // CUSTOM FORMS OPERATIONS (Organization-Specific Forms)
  // ============================================================================
  
  async createCustomForm(formData: InsertCustomForm): Promise<CustomForm> {
    const [form] = await db
      .insert(customForms)
      .values(formData)
      .returning();
    
    return form;
  }
  
  async getCustomForm(id: string): Promise<CustomForm | undefined> {
    const [form] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, id));
    
    return form;
  }
  
  async getCustomFormsByOrganization(organizationId: string): Promise<CustomForm[]> {
    return await db
      .select()
      .from(customForms)
      .where(eq(customForms.organizationId, organizationId))
      .orderBy(desc(customForms.createdAt));
  }
  
  async updateCustomForm(id: string, data: Partial<InsertCustomForm>): Promise<CustomForm | undefined> {
    const [updated] = await db
      .update(customForms)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customForms.id, id))
      .returning();
    
    return updated;
  }
  
  async deleteCustomForm(id: string): Promise<boolean> {
    const result = await db
      .delete(customForms)
      .where(eq(customForms.id, id))
      .returning();
    
    return result.length > 0;
  }
  
  // ============================================================================
  // CUSTOM FORM SUBMISSION OPERATIONS
  // ============================================================================
  
  async createCustomFormSubmission(submissionData: InsertCustomFormSubmission): Promise<CustomFormSubmission> {
    const [submission] = await db
      .insert(customFormSubmissions)
      .values(submissionData)
      .returning();
    
    return submission;
  }
  
  async getCustomFormSubmission(id: string): Promise<CustomFormSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.id, id));
    
    return submission;
  }
  
  async getCustomFormSubmissionsByOrganization(organizationId: string): Promise<CustomFormSubmission[]> {
    return await db
      .select()
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.organizationId, organizationId))
      .orderBy(desc(customFormSubmissions.submittedAt));
  }
  
  async getCustomFormSubmissionsByForm(formId: string): Promise<CustomFormSubmission[]> {
    return await db
      .select()
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.formId, formId))
      .orderBy(desc(customFormSubmissions.submittedAt));
  }
  
  async updateCustomFormSubmission(id: string, data: Partial<InsertCustomFormSubmission>): Promise<CustomFormSubmission | undefined> {
    const [updated] = await db
      .update(customFormSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customFormSubmissions.id, id))
      .returning();
    
    return updated;
  }

  /**
   * Get user display information for chat (includes name, role, and display formatting)
   */
  async getUserDisplayInfo(userId: string): Promise<{
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    platformRole: string | null;
    workspaceRole: string | null;
  } | null> {
    // Get user basic info
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!user) return null;
    
    // Get platform role if exists
    const [platformRoleData] = await db
      .select({ role: platformRoles.role })
      .from(platformRoles)
      .where(eq(platformRoles.userId, userId))
      .limit(1);
    
    // Get workspace role if exists (from employees table)
    const [employeeData] = await db
      .select({ workspaceRole: employees.workspaceRole, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.userId, userId))
      .limit(1);
    
    return {
      firstName: employeeData?.firstName || user.firstName,
      lastName: employeeData?.lastName || user.lastName,
      email: user.email,
      platformRole: platformRoleData?.role || null,
      workspaceRole: employeeData?.workspaceRole || null,
    };
  }

  /**
   * Get AI usage count for a user this month (for free tier limits)
   */
  async getAiUsageCount(userId: string): Promise<number> {
    const billingMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const logs = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsageLogs)
      .where(
        and(
          eq(aiUsageLogs.userId, userId),
          eq(aiUsageLogs.billingMonth, billingMonth)
        )
      );
    return Number(logs[0]?.count || 0);
  }

  /**
   * Increment AI usage count for a user (deprecated - use logAiUsage instead)
   */
  async incrementAiUsage(userId: string): Promise<void> {
    // Usage is now tracked in logAiUsage - this is kept for compatibility
    // but doesn't need to do anything since logAiUsage handles tracking
  }

  /**
   * Log AI usage for billing purposes (subscriber pays model)
   */
  async logAiUsage(data: {
    conversationId: string;
    workspaceId: string;
    userId: string | null;
    messageId: string | null;
    requestType: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    promptCost: string;
    completionCost: string;
    totalCost: string;
    userTier: string;
    usageCount: number;
    billingMonth: string;
  }): Promise<void> {
    await db.insert(aiUsageLogs).values(data);
  }

  // ============================================================================
  // PAYROLLOS™ OPERATIONS (Automated Payroll Processing)
  // ============================================================================
  
  async getPayrollRunsByWorkspace(workspaceId: string): Promise<PayrollRun[]> {
    return await db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.workspaceId, workspaceId))
      .orderBy(desc(payrollRuns.createdAt));
  }
  
  async getPayrollRun(id: string, workspaceId: string): Promise<PayrollRun | undefined> {
    const [run] = await db
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.id, id),
          eq(payrollRuns.workspaceId, workspaceId)
        )
      );
    return run;
  }
  
  async updatePayrollRunStatus(id: string, status: string, processedBy: string): Promise<PayrollRun | undefined> {
    const [updated] = await db
      .update(payrollRuns)
      .set({
        status: status as any,
        processedBy,
        processedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(payrollRuns.id, id))
      .returning();
    return updated;
  }
  
  async getPayrollEntriesByRun(payrollRunId: string): Promise<PayrollEntry[]> {
    return await db
      .select()
      .from(payrollEntries)
      .where(eq(payrollEntries.payrollRunId, payrollRunId));
  }
  
  async getPayrollEntriesByEmployee(employeeId: string, workspaceId: string): Promise<PayrollEntry[]> {
    return await db
      .select()
      .from(payrollEntries)
      .where(
        and(
          eq(payrollEntries.employeeId, employeeId),
          eq(payrollEntries.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(payrollEntries.createdAt));
  }
  
  // ============================================================================
  // ABUSE VIOLATION OPERATIONS (Staff Protection)
  // ============================================================================
  
  async createAbuseViolation(violation: InsertAbuseViolation): Promise<AbuseViolation> {
    const [created] = await db
      .insert(abuseViolations)
      .values(violation)
      .returning();
    return created;
  }
  
  async getUserViolationCount(userId: string): Promise<number> {
    const violations = await db
      .select()
      .from(abuseViolations)
      .where(eq(abuseViolations.userId, userId));
    return violations.length;
  }
  
  async isUserBanned(userId: string): Promise<boolean> {
    const [ban] = await db
      .select()
      .from(abuseViolations)
      .where(
        and(
          eq(abuseViolations.userId, userId),
          eq(abuseViolations.isBanned, true)
        )
      )
      .orderBy(desc(abuseViolations.createdAt))
      .limit(1);
    
    if (!ban) return false;
    
    // Check if ban is expired (temporary bans)
    if (ban.bannedUntil && new Date() > ban.bannedUntil) {
      return false; // Ban expired
    }
    
    return true;
  }
  
  async getBanInfo(userId: string): Promise<{ isBanned: boolean; bannedUntil: Date | null; reason: string | null }> {
    const [ban] = await db
      .select()
      .from(abuseViolations)
      .where(
        and(
          eq(abuseViolations.userId, userId),
          eq(abuseViolations.isBanned, true)
        )
      )
      .orderBy(desc(abuseViolations.createdAt))
      .limit(1);
    
    if (!ban) {
      return { isBanned: false, bannedUntil: null, reason: null };
    }
    
    // Check if ban is expired
    if (ban.bannedUntil && new Date() > ban.bannedUntil) {
      return { isBanned: false, bannedUntil: null, reason: null };
    }
    
    return {
      isBanned: true,
      bannedUntil: ban.bannedUntil,
      reason: ban.banReason,
    };
  }

  // ============================================================================
  // LEADER ACTIONS OPERATIONS (Audit Logging)
  // ============================================================================

  async createLeaderAction(action: InsertLeaderAction): Promise<LeaderAction> {
    const [created] = await db
      .insert(leaderActions)
      .values(action)
      .returning();
    return created;
  }

  async getLeaderActionsByWorkspace(workspaceId: string, limit: number = 50): Promise<LeaderAction[]> {
    return await db
      .select()
      .from(leaderActions)
      .where(eq(leaderActions.workspaceId, workspaceId))
      .orderBy(desc(leaderActions.createdAt))
      .limit(limit);
  }

  async getLeaderActionsByEmployee(employeeId: string, workspaceId: string): Promise<LeaderAction[]> {
    return await db
      .select()
      .from(leaderActions)
      .where(
        and(
          eq(leaderActions.targetEntityId, employeeId),
          eq(leaderActions.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(leaderActions.createdAt));
  }

  // ============================================================================
  // ESCALATION TICKETS OPERATIONS (Leader→Support Handoff)
  // ============================================================================

  async createEscalationTicket(ticket: InsertEscalationTicket): Promise<EscalationTicket> {
    const [created] = await db
      .insert(escalationTickets)
      .values(ticket)
      .returning();
    return created;
  }

  async getEscalationTicketsByWorkspace(workspaceId: string): Promise<EscalationTicket[]> {
    return await db
      .select()
      .from(escalationTickets)
      .where(eq(escalationTickets.workspaceId, workspaceId))
      .orderBy(desc(escalationTickets.createdAt));
  }

  async getEscalationTicket(id: string, workspaceId: string): Promise<EscalationTicket | undefined> {
    const [ticket] = await db
      .select()
      .from(escalationTickets)
      .where(
        and(
          eq(escalationTickets.id, id),
          eq(escalationTickets.workspaceId, workspaceId)
        )
      );
    return ticket;
  }

  async updateEscalationTicketStatus(id: string, status: string, resolvedBy?: string): Promise<EscalationTicket | undefined> {
    const updateData: any = {
      status: status as any,
      updatedAt: new Date()
    };

    if (status === 'resolved' && resolvedBy) {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = resolvedBy;
    }

    const [updated] = await db
      .update(escalationTickets)
      .set(updateData)
      .where(eq(escalationTickets.id, id))
      .returning();
    return updated;
  }

  async addEscalationTicketResponse(id: string, response: string): Promise<EscalationTicket | undefined> {
    const [updated] = await db
      .update(escalationTickets)
      .set({
        resolution: response,
        updatedAt: new Date()
      })
      .where(eq(escalationTickets.id, id))
      .returning();
    return updated;
  }
  
  // ============================================================================
  // BILLOS™ OPERATIONS - EXTENDS EXISTING INVOICE/PAYROLL SYSTEMS
  // ============================================================================
  
  async getClientRates(workspaceId: string, clientId: string): Promise<any[]> {
    const { clientRates } = await import("@shared/schema");
    return await db
      .select()
      .from(clientRates)
      .where(and(
        eq(clientRates.workspaceId, workspaceId),
        eq(clientRates.clientId, clientId)
      ));
  }
  
  async getExpenseReports(workspaceId: string, filters?: { status?: string; employeeId?: string }): Promise<any[]> {
    const { expenseReports } = await import("@shared/schema");
    const conditions = [eq(expenseReports.workspaceId, workspaceId)];
    
    if (filters?.status) {
      conditions.push(eq(expenseReports.status, filters.status as any));
    }
    if (filters?.employeeId) {
      conditions.push(eq(expenseReports.employeeId, filters.employeeId));
    }
    
    return await db
      .select()
      .from(expenseReports)
      .where(and(...conditions))
      .orderBy(desc(expenseReports.createdAt));
  }
  
  async approveExpense(expenseId: string, workspaceId: string, approverId: string): Promise<any> {
    const { expenseReports } = await import("@shared/schema");
    const [expense] = await db
      .update(expenseReports)
      .set({
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date(),
      })
      .where(and(
        eq(expenseReports.id, expenseId),
        eq(expenseReports.workspaceId, workspaceId)
      ))
      .returning();
    return expense;
  }
  
  // ============================================================================
  // REPORTOS™ MONOPOLISTIC FEATURES
  // ============================================================================
  
  // KPI Alerts
  async createKpiAlert(alert: any): Promise<any> {
    const { kpiAlerts } = await import("@shared/schema");
    const [created] = await db.insert(kpiAlerts).values(alert).returning();
    return created;
  }
  
  async getKpiAlerts(workspaceId: string): Promise<any[]> {
    const { kpiAlerts } = await import("@shared/schema");
    return await db
      .select()
      .from(kpiAlerts)
      .where(eq(kpiAlerts.workspaceId, workspaceId))
      .orderBy(desc(kpiAlerts.createdAt));
  }
  
  async updateKpiAlert(id: string, workspaceId: string, data: any): Promise<any> {
    const { kpiAlerts } = await import("@shared/schema");
    const [updated] = await db
      .update(kpiAlerts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(kpiAlerts.id, id),
        eq(kpiAlerts.workspaceId, workspaceId)
      ))
      .returning();
    return updated;
  }
  
  async deleteKpiAlert(id: string, workspaceId: string): Promise<boolean> {
    const { kpiAlerts } = await import("@shared/schema");
    const result = await db
      .delete(kpiAlerts)
      .where(and(
        eq(kpiAlerts.id, id),
        eq(kpiAlerts.workspaceId, workspaceId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  async triggerKpiAlert(alertId: string, metricValue: number, entityData: any): Promise<any> {
    const { kpiAlerts, kpiAlertTriggers } = await import("@shared/schema");
    
    // Get the alert
    const [alert] = await db
      .select()
      .from(kpiAlerts)
      .where(eq(kpiAlerts.id, alertId));
    
    if (!alert) {
      throw new Error('Alert not found');
    }
    
    // Create trigger record
    const [trigger] = await db
      .insert(kpiAlertTriggers)
      .values({
        alertId: alert.id,
        workspaceId: alert.workspaceId,
        metricValue: metricValue.toString(),
        thresholdValue: alert.thresholdValue,
        entityType: entityData.entityType,
        entityId: entityData.entityId,
        entityData: entityData,
        notifiedUsers: alert.notifyUsers || [],
      })
      .returning();
    
    // Update alert trigger count
    await db
      .update(kpiAlerts)
      .set({
        lastTriggeredAt: new Date(),
        triggerCount: sql`${kpiAlerts.triggerCount} + 1`,
      })
      .where(eq(kpiAlerts.id, alertId));
    
    return trigger;
  }
  
  async getKpiAlertTriggers(workspaceId: string, alertId?: string): Promise<any[]> {
    const { kpiAlertTriggers } = await import("@shared/schema");
    const conditions = [eq(kpiAlertTriggers.workspaceId, workspaceId)];
    
    if (alertId) {
      conditions.push(eq(kpiAlertTriggers.alertId, alertId));
    }
    
    return await db
      .select()
      .from(kpiAlertTriggers)
      .where(and(...conditions))
      .orderBy(desc(kpiAlertTriggers.createdAt));
  }
  
  async acknowledgeAlert(triggerId: string, userId: string): Promise<any> {
    const { kpiAlertTriggers } = await import("@shared/schema");
    const [updated] = await db
      .update(kpiAlertTriggers)
      .set({
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      })
      .where(eq(kpiAlertTriggers.id, triggerId))
      .returning();
    return updated;
  }
  
  // Benchmark Metrics
  async createBenchmarkMetric(metric: any): Promise<any> {
    const { benchmarkMetrics } = await import("@shared/schema");
    const [created] = await db.insert(benchmarkMetrics).values(metric).returning();
    return created;
  }
  
  async getBenchmarkMetrics(workspaceId: string, periodType?: string): Promise<any[]> {
    const { benchmarkMetrics } = await import("@shared/schema");
    const conditions = [eq(benchmarkMetrics.workspaceId, workspaceId)];
    
    if (periodType) {
      conditions.push(eq(benchmarkMetrics.periodType, periodType));
    }
    
    return await db
      .select()
      .from(benchmarkMetrics)
      .where(and(...conditions))
      .orderBy(desc(benchmarkMetrics.createdAt));
  }
  
  // ============================================================================
  // MONOPOLISTIC REPORT WORKFLOW ENGINE
  // ============================================================================
  
  // Workflow Configurations
  async createWorkflowConfig(config: any): Promise<any> {
    const { reportWorkflowConfigs } = await import("@shared/schema");
    const [created] = await db.insert(reportWorkflowConfigs).values(config).returning();
    return created;
  }
  
  async getWorkflowConfigByTemplate(templateId: string, workspaceId: string): Promise<any> {
    const { reportWorkflowConfigs } = await import("@shared/schema");
    const [config] = await db
      .select()
      .from(reportWorkflowConfigs)
      .where(and(
        eq(reportWorkflowConfigs.templateId, templateId),
        eq(reportWorkflowConfigs.workspaceId, workspaceId),
        eq(reportWorkflowConfigs.isActive, true)
      ))
      .limit(1);
    return config;
  }
  
  async getWorkflowConfigs(workspaceId: string): Promise<any[]> {
    const { reportWorkflowConfigs } = await import("@shared/schema");
    return await db
      .select()
      .from(reportWorkflowConfigs)
      .where(eq(reportWorkflowConfigs.workspaceId, workspaceId))
      .orderBy(desc(reportWorkflowConfigs.createdAt));
  }
  
  async updateWorkflowConfig(id: string, workspaceId: string, data: any): Promise<any> {
    const { reportWorkflowConfigs } = await import("@shared/schema");
    const [updated] = await db
      .update(reportWorkflowConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(reportWorkflowConfigs.id, id),
        eq(reportWorkflowConfigs.workspaceId, workspaceId)
      ))
      .returning();
    return updated;
  }
  
  async deleteWorkflowConfig(id: string, workspaceId: string): Promise<boolean> {
    const { reportWorkflowConfigs } = await import("@shared/schema");
    const result = await db
      .delete(reportWorkflowConfigs)
      .where(and(
        eq(reportWorkflowConfigs.id, id),
        eq(reportWorkflowConfigs.workspaceId, workspaceId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  // Approval Steps
  async createApprovalStep(step: any): Promise<any> {
    const { reportApprovalSteps } = await import("@shared/schema");
    const [created] = await db.insert(reportApprovalSteps).values(step).returning();
    return created;
  }
  
  async getApprovalStepById(id: string): Promise<any> {
    const { reportApprovalSteps } = await import("@shared/schema");
    const [step] = await db
      .select()
      .from(reportApprovalSteps)
      .where(eq(reportApprovalSteps.id, id))
      .limit(1);
    return step;
  }
  
  async getApprovalStepsBySubmission(submissionId: string): Promise<any[]> {
    const { reportApprovalSteps } = await import("@shared/schema");
    return await db
      .select()
      .from(reportApprovalSteps)
      .where(eq(reportApprovalSteps.submissionId, submissionId))
      .orderBy(reportApprovalSteps.stepNumber);
  }
  
  async getPendingApprovalsByUser(userId: string, workspaceId: string): Promise<any[]> {
    const { reportApprovalSteps, reportSubmissions, reportTemplates } = await import("@shared/schema");
    
    return await db
      .select({
        step: reportApprovalSteps,
        submission: reportSubmissions,
        template: reportTemplates,
      })
      .from(reportApprovalSteps)
      .innerJoin(reportSubmissions, eq(reportApprovalSteps.submissionId, reportSubmissions.id))
      .innerJoin(reportTemplates, eq(reportSubmissions.templateId, reportTemplates.id))
      .where(and(
        eq(reportApprovalSteps.workspaceId, workspaceId),
        eq(reportApprovalSteps.status, 'pending'),
        or(
          eq(reportApprovalSteps.assignedTo, userId),
          isNull(reportApprovalSteps.assignedTo) // Available to anyone with required role
        )
      ))
      .orderBy(reportApprovalSteps.createdAt);
  }
  
  async updateApprovalStep(id: string, data: any): Promise<any> {
    const { reportApprovalSteps } = await import("@shared/schema");
    const [updated] = await db
      .update(reportApprovalSteps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reportApprovalSteps.id, id))
      .returning();
    return updated;
  }
  
  // Locked Report Records
  async createLockedReportRecord(record: any): Promise<any> {
    const { lockedReportRecords } = await import("@shared/schema");
    const [created] = await db.insert(lockedReportRecords).values(record).returning();
    return created;
  }
  
  async getLockedReportRecords(workspaceId: string, filters?: any): Promise<any[]> {
    const { lockedReportRecords } = await import("@shared/schema");
    const conditions = [eq(lockedReportRecords.workspaceId, workspaceId)];
    
    if (filters?.employeeId) {
      conditions.push(eq(lockedReportRecords.employeeId, filters.employeeId));
    }
    if (filters?.clientId) {
      conditions.push(eq(lockedReportRecords.clientId, filters.clientId));
    }
    if (filters?.startDate) {
      conditions.push(sql`${lockedReportRecords.lockedAt} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${lockedReportRecords.lockedAt} <= ${filters.endDate}`);
    }
    
    return await db
      .select()
      .from(lockedReportRecords)
      .where(and(...conditions))
      .orderBy(desc(lockedReportRecords.lockedAt));
  }
  
  async getLockedReportBySubmission(submissionId: string): Promise<any> {
    const { lockedReportRecords } = await import("@shared/schema");
    const [record] = await db
      .select()
      .from(lockedReportRecords)
      .where(eq(lockedReportRecords.submissionId, submissionId))
      .limit(1);
    return record;
  }
  
  // Report Template helpers
  async getReportTemplateById(id: string): Promise<any> {
    const { reportTemplates } = await import("@shared/schema");
    const [template] = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, id))
      .limit(1);
    return template;
  }
  
  // ============================================================================
  // TALENTOS™ - INTERNAL TALENT MARKETPLACE
  // ============================================================================
  
  async createInternalBid(bid: any): Promise<any> {
    const [created] = await db.insert(internalBids).values(bid).returning();
    return created;
  }
  
  async getInternalBidById(id: string): Promise<any | undefined> {
    const [bid] = await db
      .select()
      .from(internalBids)
      .where(eq(internalBids.id, id))
      .limit(1);
    return bid;
  }
  
  async getInternalBids(workspaceId: string, filters?: { status?: string }): Promise<any[]> {
    const conditions = [eq(internalBids.workspaceId, workspaceId)];
    if (filters?.status) {
      conditions.push(eq(internalBids.status, filters.status));
    }
    return await db
      .select()
      .from(internalBids)
      .where(and(...conditions))
      .orderBy(desc(internalBids.createdAt));
  }
  
  async updateInternalBid(id: string, workspaceId: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(internalBids)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(internalBids.id, id), eq(internalBids.workspaceId, workspaceId)))
      .returning();
    return updated;
  }
  
  async createBidApplication(application: any): Promise<any> {
    const [created] = await db.insert(bidApplications).values(application).returning();
    return created;
  }
  
  async getBidApplication(id: string): Promise<any | undefined> {
    const [application] = await db
      .select()
      .from(bidApplications)
      .where(eq(bidApplications.id, id))
      .limit(1);
    return application;
  }
  
  async getBidApplicationsByBid(bidId: string): Promise<any[]> {
    return await db
      .select()
      .from(bidApplications)
      .where(eq(bidApplications.bidId, bidId))
      .orderBy(desc(bidApplications.appliedAt));
  }
  
  async getBidApplicationsByEmployee(employeeId: string, workspaceId: string): Promise<any[]> {
    return await db
      .select()
      .from(bidApplications)
      .where(and(
        eq(bidApplications.employeeId, employeeId),
        eq(bidApplications.workspaceId, workspaceId)
      ))
      .orderBy(desc(bidApplications.appliedAt));
  }
  
  async updateBidApplication(id: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(bidApplications)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bidApplications.id, id))
      .returning();
    return updated;
  }
  
  // ============================================================================
  // TALENTOS™ - PERFORMANCE REVIEWS & CAREER PATHING
  // ============================================================================
  
  async createPerformanceReview(review: any): Promise<any> {
    const [created] = await db.insert(performanceReviews).values(review).returning();
    return created;
  }
  
  async getPerformanceReview(id: string, workspaceId: string): Promise<any | undefined> {
    const [review] = await db
      .select()
      .from(performanceReviews)
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.workspaceId, workspaceId)))
      .limit(1);
    return review;
  }
  
  async getPerformanceReviewsByEmployee(employeeId: string, workspaceId: string): Promise<any[]> {
    return await db
      .select()
      .from(performanceReviews)
      .where(and(
        eq(performanceReviews.employeeId, employeeId),
        eq(performanceReviews.workspaceId, workspaceId)
      ))
      .orderBy(desc(performanceReviews.reviewPeriodEnd));
  }
  
  async updatePerformanceReview(id: string, workspaceId: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(performanceReviews)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.workspaceId, workspaceId)))
      .returning();
    return updated;
  }
  
  async createRoleTemplate(template: any): Promise<any> {
    const [created] = await db.insert(roleTemplates).values(template).returning();
    return created;
  }
  
  async getRoleTemplate(id: string, workspaceId: string): Promise<any | undefined> {
    const [template] = await db
      .select()
      .from(roleTemplates)
      .where(and(eq(roleTemplates.id, id), eq(roleTemplates.workspaceId, workspaceId)))
      .limit(1);
    return template;
  }
  
  async getRoleTemplates(workspaceId: string): Promise<any[]> {
    return await db
      .select()
      .from(roleTemplates)
      .where(eq(roleTemplates.workspaceId, workspaceId))
      .orderBy(roleTemplates.roleLevel, roleTemplates.roleName);
  }
  
  async updateRoleTemplate(id: string, workspaceId: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(roleTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(roleTemplates.id, id), eq(roleTemplates.workspaceId, workspaceId)))
      .returning();
    return updated;
  }
  
  async createSkillGapAnalysis(analysis: any): Promise<any> {
    const [created] = await db.insert(skillGapAnalyses).values(analysis).returning();
    return created;
  }
  
  async getSkillGapAnalysis(id: string, workspaceId: string): Promise<any | undefined> {
    const [analysis] = await db
      .select()
      .from(skillGapAnalyses)
      .where(and(eq(skillGapAnalyses.id, id), eq(skillGapAnalyses.workspaceId, workspaceId)))
      .limit(1);
    return analysis;
  }
  
  async getSkillGapAnalysesByEmployee(workspaceId: string, employeeId: string): Promise<any[]> {
    return await db
      .select()
      .from(skillGapAnalyses)
      .where(and(
        eq(skillGapAnalyses.employeeId, employeeId),
        eq(skillGapAnalyses.workspaceId, workspaceId)
      ))
      .orderBy(desc(skillGapAnalyses.generatedAt));
  }
  
  async updateSkillGapAnalysis(id: string, workspaceId: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(skillGapAnalyses)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(skillGapAnalyses.id, id), eq(skillGapAnalyses.workspaceId, workspaceId)))
      .returning();
    return updated;
  }
  
  // ============================================================================
  // ASSETOS™ - PHYSICAL RESOURCE ALLOCATION
  // ============================================================================
  
  async createAsset(asset: any): Promise<any> {
    const [created] = await db.insert(assets).values(asset).returning();
    return created;
  }
  
  async getAsset(id: string, workspaceId: string): Promise<any | undefined> {
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.workspaceId, workspaceId)))
      .limit(1);
    return asset;
  }
  
  async getAssets(workspaceId: string, filters?: { status?: string }): Promise<any[]> {
    const conditions = [eq(assets.workspaceId, workspaceId)];
    if (filters?.status) {
      conditions.push(eq(assets.status, filters.status));
    }
    return await db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(assets.assetName);
  }
  
  async updateAsset(id: string, workspaceId: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(assets)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.workspaceId, workspaceId)))
      .returning();
    return updated;
  }
  
  async createAssetSchedule(schedule: any): Promise<any> {
    const [created] = await db.insert(assetSchedules).values(schedule).returning();
    return created;
  }
  
  async getAssetSchedule(id: string, workspaceId: string): Promise<any | undefined> {
    const [schedule] = await db
      .select()
      .from(assetSchedules)
      .where(and(eq(assetSchedules.id, id), eq(assetSchedules.workspaceId, workspaceId)))
      .limit(1);
    return schedule;
  }
  
  async getAssetSchedulesByAsset(assetId: string, workspaceId: string, startTime?: Date, endTime?: Date): Promise<any[]> {
    const conditions = [
      eq(assetSchedules.assetId, assetId),
      eq(assetSchedules.workspaceId, workspaceId)
    ];
    
    if (startTime && endTime) {
      conditions.push(sql`${assetSchedules.startTime} < ${endTime}`);
      conditions.push(sql`${assetSchedules.endTime} > ${startTime}`);
    }
    
    return await db
      .select()
      .from(assetSchedules)
      .where(and(...conditions))
      .orderBy(assetSchedules.startTime);
  }
  
  async getAssetSchedulesByAssetAndDateRange(assetId: string, workspaceId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return this.getAssetSchedulesByAsset(assetId, workspaceId, startDate, endDate);
  }
  
  async updateAssetSchedule(id: string, workspaceId: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(assetSchedules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(assetSchedules.id, id), eq(assetSchedules.workspaceId, workspaceId)))
      .returning();
    return updated;
  }
  
  async createAssetUsageLog(log: any): Promise<any> {
    const [created] = await db.insert(assetUsageLogs).values(log).returning();
    return created;
  }
  
  async getAssetUsageLog(id: string, workspaceId: string): Promise<any | undefined> {
    const [log] = await db
      .select()
      .from(assetUsageLogs)
      .where(and(eq(assetUsageLogs.id, id), eq(assetUsageLogs.workspaceId, workspaceId)))
      .limit(1);
    return log;
  }
  
  async getAssetUsageLogsByClient(workspaceId: string, clientId: string, startDate: Date, endDate: Date, status?: string): Promise<any[]> {
    const conditions = [
      eq(assetUsageLogs.workspaceId, workspaceId),
      eq(assetUsageLogs.clientId, clientId),
      sql`${assetUsageLogs.usagePeriodStart} >= ${startDate}`,
      sql`${assetUsageLogs.usagePeriodEnd} <= ${endDate}`
    ];
    
    if (status) {
      conditions.push(eq(assetUsageLogs.billingStatus, status));
    }
    
    return await db
      .select()
      .from(assetUsageLogs)
      .where(and(...conditions))
      .orderBy(assetUsageLogs.usagePeriodStart);
  }
  
  async getAssetUsageLogsByDateRange(workspaceId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await db
      .select()
      .from(assetUsageLogs)
      .where(and(
        eq(assetUsageLogs.workspaceId, workspaceId),
        sql`${assetUsageLogs.usagePeriodStart} >= ${startDate}`,
        sql`${assetUsageLogs.usagePeriodEnd} <= ${endDate}`
      ))
      .orderBy(assetUsageLogs.usagePeriodStart);
  }
  
  async updateAssetUsageLog(id: string, workspaceId: string, data: any): Promise<any | undefined> {
    const [updated] = await db
      .update(assetUsageLogs)
      .set(data)
      .where(and(eq(assetUsageLogs.id, id), eq(assetUsageLogs.workspaceId, workspaceId)))
      .returning();
    return updated;
  }
  
  // ============================================================================
  // HELPER METHODS FOR UNIFIED DATA NEXUS
  // ============================================================================
  
  async getShiftsByEmployeeAndDateRange(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await db
      .select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employeeId),
        sql`${shifts.startTime} >= ${startDate}`,
        sql`${shifts.startTime} <= ${endDate}`
      ))
      .orderBy(shifts.startTime);
  }
  
  async getTimeEntriesByEmployeeAndDateRange(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.employeeId, employeeId),
        sql`${timeEntries.clockInTime} >= ${startDate}`,
        sql`${timeEntries.clockInTime} <= ${endDate}`
      ))
      .orderBy(timeEntries.clockInTime);
  }
  
  async getReportSubmissionsByEmployee(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await db
      .select()
      .from(reportSubmissions)
      .where(and(
        eq(reportSubmissions.workspaceId, workspaceId),
        eq(reportSubmissions.employeeId, employeeId),
        sql`${reportSubmissions.createdAt} >= ${startDate}`,
        sql`${reportSubmissions.createdAt} <= ${endDate}`
      ))
      .orderBy(reportSubmissions.createdAt);
  }
  
  async getTimeEntryDiscrepancies(workspaceId: string, filters?: { employeeId?: string; startDate?: Date; endDate?: Date }): Promise<any[]> {
    const conditions = [eq(timeEntryDiscrepancies.workspaceId, workspaceId)];
    
    if (filters?.employeeId) {
      conditions.push(eq(timeEntryDiscrepancies.employeeId, filters.employeeId));
    }
    if (filters?.startDate) {
      conditions.push(sql`${timeEntryDiscrepancies.detectedAt} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${timeEntryDiscrepancies.detectedAt} <= ${filters.endDate}`);
    }
    
    return await db
      .select()
      .from(timeEntryDiscrepancies)
      .where(and(...conditions))
      .orderBy(desc(timeEntryDiscrepancies.detectedAt));
  }
  
  async getTurnoverPredictions(workspaceId: string, filters?: { employeeId?: string; limit?: number }): Promise<any[]> {
    const { turnoverPredictions } = await import("@shared/schema");
    const conditions = [eq(turnoverPredictions.workspaceId, workspaceId)];
    
    if (filters?.employeeId) {
      conditions.push(eq(turnoverPredictions.employeeId, filters.employeeId));
    }
    
    let query = db
      .select()
      .from(turnoverPredictions)
      .where(and(...conditions))
      .orderBy(desc(turnoverPredictions.predictionDate));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return await query;
  }
  
  async getInvoices(workspaceId: string): Promise<any[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.workspaceId, workspaceId))
      .orderBy(desc(invoices.createdAt));
  }
  
  // ============================================================================
  // HIREOS™ - DIGITAL FILE CABINET & COMPLIANCE WORKFLOW
  // ============================================================================
  
  async createEmployeeDocument(documentData: InsertEmployeeDocument): Promise<EmployeeDocument> {
    const [document] = await db
      .insert(employeeDocuments)
      .values(documentData)
      .returning();
    return document;
  }
  
  async getEmployeeDocument(id: string): Promise<EmployeeDocument | undefined> {
    const [document] = await db
      .select()
      .from(employeeDocuments)
      .where(eq(employeeDocuments.id, id));
    return document;
  }
  
  async getEmployeeDocuments(workspaceId: string, employeeId: string, documentType?: string, status?: string): Promise<EmployeeDocument[]> {
    const conditions = [
      eq(employeeDocuments.workspaceId, workspaceId), // SECURITY: Workspace filter
      eq(employeeDocuments.employeeId, employeeId)
    ];
    
    if (documentType) {
      conditions.push(eq(employeeDocuments.documentType, documentType as any));
    }
    
    if (status) {
      conditions.push(eq(employeeDocuments.status, status as any));
    }
    
    return await db
      .select()
      .from(employeeDocuments)
      .where(and(...conditions))
      .orderBy(desc(employeeDocuments.uploadedAt));
  }
  
  async approveEmployeeDocument(id: string, approvedBy: string, notes?: string): Promise<EmployeeDocument | undefined> {
    const [document] = await db
      .update(employeeDocuments)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        approvalNotes: notes,
      })
      .where(eq(employeeDocuments.id, id))
      .returning();
    return document;
  }
  
  async rejectEmployeeDocument(id: string, rejectedBy: string, reason: string): Promise<EmployeeDocument | undefined> {
    const [document] = await db
      .update(employeeDocuments)
      .set({
        status: 'rejected',
        rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: reason,
      })
      .where(eq(employeeDocuments.id, id))
      .returning();
    return document;
  }
  
  async logDocumentAccess(logData: InsertDocumentAccessLog): Promise<DocumentAccessLog> {
    const [log] = await db
      .insert(documentAccessLogs)
      .values(logData)
      .returning();
    return log;
  }
  
  async getDocumentAccessLogs(documentId: string): Promise<DocumentAccessLog[]> {
    return await db
      .select()
      .from(documentAccessLogs)
      .where(eq(documentAccessLogs.documentId, documentId))
      .orderBy(desc(documentAccessLogs.accessedAt));
  }
  
  async createOnboardingWorkflowTemplate(templateData: InsertOnboardingWorkflowTemplate): Promise<OnboardingWorkflowTemplate> {
    const [template] = await db
      .insert(onboardingWorkflowTemplates)
      .values(templateData)
      .returning();
    return template;
  }
  
  async getOnboardingWorkflowTemplate(id: string): Promise<OnboardingWorkflowTemplate | undefined> {
    const [template] = await db
      .select()
      .from(onboardingWorkflowTemplates)
      .where(eq(onboardingWorkflowTemplates.id, id));
    return template;
  }
  
  async getOnboardingWorkflowTemplates(workspaceId: string): Promise<OnboardingWorkflowTemplate[]> {
    return await db
      .select()
      .from(onboardingWorkflowTemplates)
      .where(eq(onboardingWorkflowTemplates.workspaceId, workspaceId))
      .orderBy(desc(onboardingWorkflowTemplates.isDefault), desc(onboardingWorkflowTemplates.usageCount));
  }
  
  async updateOnboardingWorkflowTemplate(id: string, data: Partial<InsertOnboardingWorkflowTemplate>): Promise<OnboardingWorkflowTemplate | undefined> {
    const [template] = await db
      .update(onboardingWorkflowTemplates)
      .set(data)
      .where(eq(onboardingWorkflowTemplates.id, id))
      .returning();
    return template;
  }
  
  async createOnboardingChecklist(checklistData: InsertOnboardingChecklist): Promise<OnboardingChecklist> {
    const [checklist] = await db
      .insert(onboardingChecklists)
      .values(checklistData)
      .returning();
    return checklist;
  }
  
  async getOnboardingChecklist(id: string): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db
      .select()
      .from(onboardingChecklists)
      .where(eq(onboardingChecklists.id, id));
    return checklist;
  }
  
  async getOnboardingChecklistByApplication(applicationId: string): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db
      .select()
      .from(onboardingChecklists)
      .where(eq(onboardingChecklists.applicationId, applicationId));
    return checklist;
  }
  
  async updateOnboardingChecklist(id: string, data: Partial<InsertOnboardingChecklist>): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db
      .update(onboardingChecklists)
      .set(data)
      .where(eq(onboardingChecklists.id, id))
      .returning();
    return checklist;
  }
  
  async getHireOSComplianceReport(workspaceId: string): Promise<any> {
    // Get all employees
    const allEmployees = await this.getEmployeesByWorkspace(workspaceId);
    
    // Get all onboarding checklists
    const checklists = await db
      .select()
      .from(onboardingChecklists)
      .where(eq(onboardingChecklists.workspaceId, workspaceId));
    
    // Get all employee documents
    const documents = await db
      .select()
      .from(employeeDocuments)
      .where(eq(employeeDocuments.workspaceId, workspaceId));
    
    // Calculate compliance metrics
    const now = new Date();
    const i9Expired = checklists.filter(c => 
      c.i9DeadlineDate && c.i9DeadlineDate < now && !c.onboardingCompletedAt
    );
    
    const expiringCertifications = documents.filter(d => 
      d.expirationDate && 
      d.expirationDate < new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) && // 30 days
      d.status === 'approved'
    );
    
    const missingDocuments = allEmployees.filter(emp => {
      const empDocs = documents.filter(d => d.employeeId === emp.id);
      return empDocs.length === 0;
    });
    
    const pendingApprovals = documents.filter(d => d.status === 'pending_review');
    
    return {
      totalEmployees: allEmployees.length,
      totalDocuments: documents.length,
      i9Compliance: {
        total: checklists.length,
        expired: i9Expired.length,
        expiredList: i9Expired,
      },
      documentStatus: {
        pendingReview: pendingApprovals.length,
        approved: documents.filter(d => d.status === 'approved').length,
        rejected: documents.filter(d => d.status === 'rejected').length,
        expired: documents.filter(d => d.status === 'expired').length,
      },
      expiringCertifications: {
        total: expiringCertifications.length,
        list: expiringCertifications,
      },
      missingDocuments: {
        total: missingDocuments.length,
        employees: missingDocuments.map(e => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
          email: e.email,
        })),
      },
      generatedAt: new Date(),
    };
  }
}

export const storage = new DatabaseStorage();
