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
  dmAuditRequests,
  dmAccessLogs,
  conversationEncryptionKeys,
  aiUsageLogs,
  customForms,
  customFormSubmissions,
  payrollRuns,
  payrollEntries,
  abuseViolations,
  serviceIncidentReports,
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
  expenseCategories,
  expenses,
  expenseReceipts,
  employeeI9Records,
  companyPolicies,
  policyAcknowledgments,
  organizationChatRooms,
  organizationChatChannels,
  organizationRoomMembers,
  organizationRoomOnboarding,
  notifications,
  pushSubscriptions,
  userNotificationPreferences,
  auditEvents,
  idRegistry,
  writeAheadLog,
  orgInvitations,
  proposals,
  salesActivities,
  passwordResetAuditLog,
  aiResponses,
  aiSuggestions,
  userFeedback,
  feedbackComments,
  feedbackVotes,
  type User,
  type OrgInvitation,
  type InsertOrgInvitation,
  type Proposal,
  type InsertProposal,
  type SalesActivity,
  type InsertSalesActivity,
  type UpsertUser,
  type AbuseViolation,
  type InsertAbuseViolation,
  type ServiceIncidentReport,
  type InsertServiceIncidentReport,
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
  type ClientRate,
  type InsertClientRate,
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
  helposAiSessions,
  helposAiTranscriptEntries,
  type HelposAiSession,
  type InsertHelposAiSession,
  type HelposAiTranscriptEntry,
  type InsertHelposAiTranscriptEntry,
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
  type ExpenseCategory,
  type InsertExpenseCategory,
  type Expense,
  type InsertExpense,
  type ExpenseReceipt,
  type InsertExpenseReceipt,
  type EmployeeI9Record,
  type InsertEmployeeI9Record,
  type CompanyPolicy,
  type InsertCompanyPolicy,
  type PolicyAcknowledgment,
  type InsertPolicyAcknowledgment,
  type Notification,
  type InsertNotification,
  type PushSubscription,
  type InsertPushSubscription,
  type UserNotificationPreferences,
  type InsertUserNotificationPreferences,
  type AuditEvent,
  type InsertAuditEvent,
  type IdRegistry,
  type InsertIdRegistry,
  type WriteAheadLog,
  type InsertWriteAheadLog,
  type AiResponse,
  type InsertAiResponse,
  type AiSuggestion,
  type InsertAiSuggestion,
  type UserFeedback,
  type InsertUserFeedback,
  type FeedbackComment,
  type InsertFeedbackComment,
  type FeedbackVote,
  type InsertFeedbackVote,
  mascotMotionProfiles,
  holidayMascotDecor,
  holidayMascotHistory,
  type MascotMotionProfile,
  type InsertMascotMotionProfile,
  type HolidayMascotDecor,
  type InsertHolidayMascotDecor,
  type HolidayMascotHistory,
  type InsertHolidayMascotHistory,
  alertConfigurations,
  alertHistory,
  alertRateLimits,
  type AlertConfiguration,
  type InsertAlertConfiguration,
  type AlertHistory,
  type InsertAlertHistory,
  platformUpdates,
  userPlatformUpdateViews,
  maintenanceAlerts,
  maintenanceAcknowledgments,
  type PlatformUpdate,
  type InsertPlatformUpdate,
  type UserPlatformUpdateView,
  type InsertUserPlatformUpdateView,
  type MaintenanceAlert,
  type InsertMaintenanceAlert,
  type MaintenanceAcknowledgment,
  type InsertMaintenanceAcknowledgment,
} from "@shared/schema";
import type { PaginatedResponse, ClientWithInvoiceCount } from "@shared/types";
import type { ClientsQueryParams } from "@shared/validation/pagination";
import { db } from "./db";
import { eq, and, desc, isNotNull, isNull, or, like, sql, lte, count, gt, inArray } from "drizzle-orm";

// Custom error for WAL transition failures
export class InvalidWalTransitionError extends Error {
  constructor(
    public transactionId: string,
    public expectedStatus: string,
    public actualStatus?: string,
    message?: string
  ) {
    super(message || `Invalid WAL transition for transaction ${transactionId}: expected status '${expectedStatus}'${actualStatus ? `, found '${actualStatus}'` : ''}`);
    this.name = 'InvalidWalTransitionError';
  }
}

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

// Pagination options for listClients (extends validated query params)
export type ListClientsOptions = ClientsQueryParams & {
  workspaceId: string;
};

// Storage Interface with Multi-Tenant Methods
export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsernameOrEmail(usernameOrEmail: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createPasswordResetToken(userId: string): Promise<string>;
  
  // Session operations (for WebSocket auth)
  getSession(sessionId: string): Promise<{passport?: {user?: string}} | null>;
  
  // Password reset audit trail and rate limiting
  logPasswordResetAttempt(data: {
    requestedBy: string;
    requestedByWorkspaceId?: string;
    targetUserId?: string | null;
    targetEmail: string;
    targetWorkspaceId?: string | null;
    success: boolean;
    outcomeCode: 'sent' | 'not_found' | 'rate_limited' | 'email_failed' | 'error';
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;
  getPasswordResetAttempts(requestedBy: string, targetUserId: string | null, targetEmail: string, minutes: number): Promise<number>;
  
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
  getWorkspaceMemberByUserId(userId: string): Promise<{ workspaceId: string; id: string } | undefined>;
  updateEmployee(id: string, workspaceId: string, data: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string, workspaceId: string): Promise<boolean>;
  
  // Client operations
  createClient(client: InsertClient): Promise<Client>;
  getClient(id: string, workspaceId: string): Promise<Client | undefined>;
  getClientByUserId(userId: string): Promise<Client | undefined>;
  getClientsByWorkspace(workspaceId: string): Promise<Client[]>;
  listClients(options: ListClientsOptions): Promise<PaginatedResponse<ClientWithInvoiceCount>>;
  updateClient(id: string, workspaceId: string, data: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string, workspaceId: string): Promise<boolean>;
  
  // Client Rate operations
  createClientRate(rate: InsertClientRate): Promise<ClientRate>;
  getClientRates(workspaceId: string, clientId: string): Promise<ClientRate[]>;
  
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
  getSupportTicket(id: string, workspaceId: string): Promise<SupportTicket | undefined>;
  getSupportTickets(workspaceId: string): Promise<SupportTicket[]>;
  getActiveSupportTicket(userId: string, workspaceId: string): Promise<SupportTicket | undefined>;
  updateSupportTicket(id: string, data: Partial<InsertSupportTicket>): Promise<SupportTicket>;
  deleteSupportTicket(id: string): Promise<boolean>;
  
  // HelpAI AI Support System
  createHelposSession(session: InsertHelposAiSession): Promise<HelposAiSession>;
  getHelposSession(id: string, workspaceId: string): Promise<HelposAiSession | undefined>;
  getHelposSessionsByUser(userId: string, workspaceId: string): Promise<HelposAiSession[]>;
  updateHelposSession(id: string, workspaceId: string, data: Partial<InsertHelposAiSession>): Promise<HelposAiSession | undefined>;
  createHelposTranscript(entry: InsertHelposAiTranscriptEntry): Promise<HelposAiTranscriptEntry>;
  getHelposTranscripts(sessionId: string): Promise<HelposAiTranscriptEntry[]>;
  
  // Audit Log operations (Security & Compliance)
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(workspaceId: string, filters?: { userId?: string; entityType?: string; action?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }): Promise<AuditLog[]>;
  
  // Event Sourcing & Data Integrity operations
  createAuditEvent(event: InsertAuditEvent): Promise<string>;
  getAuditEvent(id: string): Promise<AuditEvent | undefined>;
  getAuditEvents(filters?: { workspaceId?: string; actorType?: string; eventType?: string; limit?: number }): Promise<AuditEvent[]>;
  verifyAuditEvent(eventId: string, actionHash: string): Promise<void>;
  registerID(entry: InsertIdRegistry): Promise<void>;
  createWriteAheadLog(entry: InsertWriteAheadLog): Promise<string>;
  markWALPrepared(transactionId: string): Promise<void>;
  markWALCommitted(transactionId: string): Promise<void>;
  markWALRolledBack(transactionId: string, errorMessage?: string): Promise<void>;
  
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
  
  // Shift Chatroom operations (auto-create on clock-in, auto-close on clock-out)
  createShiftChatroom(workspaceId: string, shiftId: string, timeEntryId: string, employeeId: string, employeeName: string): Promise<ChatConversation>;
  getShiftChatroom(shiftId: string, timeEntryId: string): Promise<ChatConversation | undefined>;
  closeShiftChatroom(shiftId: string, timeEntryId: string): Promise<ChatConversation | undefined>;
  getActiveShiftChatrooms(workspaceId: string): Promise<ChatConversation[]>;
  
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessagesByConversation(conversationId: string): Promise<ChatMessage[]>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;
  updateChatMessage(id: string, conversationId: string, data: { message: string }): Promise<ChatMessage | undefined>;
  deleteChatMessage(id: string, conversationId: string): Promise<boolean>;
  
  // HelpDesk Room operations (Professional Support Chat)
  createSupportRoom(room: InsertSupportRoom): Promise<SupportRoom>;
  getSupportRoomBySlug(slug: string): Promise<SupportRoom | undefined>;
  getAllSupportRooms(workspaceId?: string | null): Promise<SupportRoom[]>;
  updateSupportRoomStatus(slug: string, status: string, statusMessage: string | null, changedBy: string): Promise<SupportRoom | undefined>;
  updateSupportRoomConversation(slug: string, conversationId: string): Promise<SupportRoom | undefined>;
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
  
  // AI Payroll™ operations (Automated Payroll Processing)
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
  
  // Service incident operations (Error Handling)
  createServiceIncidentReport(report: InsertServiceIncidentReport): Promise<ServiceIncidentReport>;
  getServiceIncidentReport(id: string, workspaceId: string): Promise<ServiceIncidentReport | undefined>;
  getServiceIncidentReportsByWorkspace(workspaceId: string, limit?: number): Promise<ServiceIncidentReport[]>;
  getServiceIncidentReportsByService(serviceKey: string, workspaceId?: string, limit?: number): Promise<ServiceIncidentReport[]>;
  updateServiceIncidentReport(id: string, workspaceId: string, data: Partial<InsertServiceIncidentReport>): Promise<ServiceIncidentReport | undefined>;
  
  // Billing Platform operations (Financial Automation - extends existing invoice/payroll)
  // Client billing rates
  getClientRates(workspaceId: string, clientId: string): Promise<any[]>;
  
  // ========================================================================
  // EXPENSEOS™ - EXPENSE MANAGEMENT
  // ========================================================================
  // Expense Categories
  createExpenseCategory(category: InsertExpenseCategory): Promise<typeof expenseCategories.$inferSelect>;
  getExpenseCategory(id: string, workspaceId: string): Promise<typeof expenseCategories.$inferSelect | undefined>;
  getExpenseCategoriesByWorkspace(workspaceId: string): Promise<(typeof expenseCategories.$inferSelect)[]>;
  updateExpenseCategory(id: string, workspaceId: string, data: Partial<InsertExpenseCategory>): Promise<typeof expenseCategories.$inferSelect | undefined>;
  deleteExpenseCategory(id: string, workspaceId: string): Promise<boolean>;
  
  // Expenses
  createExpense(expense: InsertExpense): Promise<typeof expenses.$inferSelect>;
  getExpense(id: string, workspaceId: string): Promise<typeof expenses.$inferSelect | undefined>;
  getExpensesByWorkspace(workspaceId: string, filters?: { status?: string; employeeId?: string; categoryId?: string }): Promise<(typeof expenses.$inferSelect)[]>;
  updateExpense(id: string, workspaceId: string, data: Partial<InsertExpense>): Promise<typeof expenses.$inferSelect | undefined>;
  approveExpense(expenseId: string, workspaceId: string, approverId: string, reviewNotes?: string): Promise<typeof expenses.$inferSelect | undefined>;
  rejectExpense(expenseId: string, workspaceId: string, reviewerId: string, reviewNotes: string): Promise<typeof expenses.$inferSelect | undefined>;
  markExpensePaid(expenseId: string, workspaceId: string, paidById: string, paymentMethod?: string): Promise<typeof expenses.$inferSelect | undefined>;
  deleteExpense(id: string, workspaceId: string): Promise<boolean>;
  
  // Expense Receipts
  createExpenseReceipt(receipt: InsertExpenseReceipt): Promise<typeof expenseReceipts.$inferSelect>;
  getExpenseReceipt(id: string, workspaceId: string): Promise<typeof expenseReceipts.$inferSelect | undefined>;
  getExpenseReceiptsByExpense(expenseId: string): Promise<(typeof expenseReceipts.$inferSelect)[]>;
  deleteExpenseReceipt(id: string, workspaceId: string): Promise<boolean>;
  
  // ========================================================================
  // I-9 RE-VERIFICATION & COMPLIANCE
  // ========================================================================
  getI9RecordsByWorkspace(workspaceId: string): Promise<any[]>;
  getI9RecordByEmployee(employeeId: string, workspaceId: string): Promise<any | undefined>;
  getExpiringI9Authorizations(workspaceId: string, daysAhead: number): Promise<any[]>;
  
  // ========================================================================
  // POLICIOS™ - POLICY & HANDBOOK MANAGEMENT
  // ========================================================================
  createCompanyPolicy(policy: any): Promise<any>;
  getCompanyPolicy(id: string, workspaceId: string): Promise<any | undefined>;
  getCompanyPolicies(workspaceId: string): Promise<any[]>;
  updateCompanyPolicy(id: string, workspaceId: string, data: any): Promise<any | undefined>;
  publishPolicy(id: string, workspaceId: string, publishedBy: string): Promise<any | undefined>;
  getPolicyAcknowledgments(policyId: string): Promise<any[]>;
  createPolicyAcknowledgment(ack: any): Promise<any>;
  
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
  
  getHiringComplianceReport(workspaceId: string): Promise<any>;
  
  // ========================================================================
  // HELPER METHODS FOR UNIFIED DATA NEXUS
  // ========================================================================
  getShiftsByEmployeeAndDateRange(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]>;
  getTimeEntriesByEmployeeAndDateRange(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]>;
  getReportSubmissionsByEmployee(workspaceId: string, employeeId: string, startDate: Date, endDate: Date): Promise<any[]>;
  getTimeEntryDiscrepancies(workspaceId: string, filters?: { employeeId?: string; startDate?: Date; endDate?: Date }): Promise<any[]>;
  getTurnoverPredictions(workspaceId: string, filters?: { employeeId?: string; limit?: number }): Promise<any[]>;
  getInvoices(workspaceId: string): Promise<any[]>;
  
  // ========================================================================
  // COMMOS™ - ORGANIZATION CHAT ROOMS & CHANNELS
  // ========================================================================
  createOrganizationChatRoom(room: any): Promise<any>;
  getOrganizationChatRoom(id: string): Promise<any | undefined>;
  getOrganizationChatRoomsByWorkspace(workspaceId: string): Promise<any[]>;
  getAllOrganizationChatRooms(): Promise<any[]>; // Support staff only
  updateOrganizationChatRoom(id: string, data: any): Promise<any | undefined>;
  suspendOrganizationChatRoom(id: string, suspendedBy: string, reason: string): Promise<any | undefined>;
  liftOrganizationChatRoomSuspension(id: string): Promise<any | undefined>;
  
  // Channel operations
  createOrganizationChatChannel(channel: any): Promise<any>;
  getOrganizationChatChannelsByRoom(roomId: string): Promise<any[]>;
  
  // Room member operations
  addOrganizationRoomMember(member: any): Promise<any>;
  getOrganizationRoomMembers(roomId: string): Promise<any[]>;
  removeOrganizationRoomMember(roomId: string, userId: string): Promise<boolean>;
  
  // Onboarding operations
  getOrganizationRoomOnboarding(workspaceId: string): Promise<any | undefined>;
  updateOrganizationRoomOnboarding(workspaceId: string, data: any): Promise<any | undefined>;
  
  // ========================================================================
  // CHAT EXPORT METHODS - SUPPORT STAFF ONLY
  // ========================================================================
  // Export support conversation with messages
  getSupportConversationForExport(conversationId: string): Promise<{ conversation: ChatConversation; messages: ChatMessage[]; exportedAt: Date } | null>;
  
  // Export AI Communications room with messages and members
  getCommRoomForExport(roomId: string): Promise<{ room: any; messages: ChatMessage[]; members: any[]; exportedAt: Date } | null>;
  
  // Export private DM conversation with DECRYPTED messages (requires authorization)
  getPrivateConversationForExport(conversationId: string, userId: string): Promise<{ conversation: ChatConversation; messages: ChatMessage[]; exportedAt: Date; auditInfo: any } | null>;
  
  // ========================================================================
  // NOTIFICATIONS - REAL-TIME USER NOTIFICATIONS (Dual-Scope Model)
  // ========================================================================
  createNotification(notification: InsertNotification): Promise<Notification>;
  createUserScopedNotification(userId: string, type: string, title: string, message: string, metadata?: any): Promise<Notification>;
  getNotificationsByUser(userId: string, workspaceId: string, limit?: number): Promise<Notification[]>;
  getAllNotificationsForUser(userId: string, workspaceId?: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string, workspaceId: string): Promise<number>;
  getTotalUnreadCountForUser(userId: string, workspaceId?: string): Promise<number>;
  markNotificationAsRead(id: string, userId: string): Promise<Notification | undefined>;
  toggleNotificationReadStatus(id: string, userId: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string, workspaceId: string): Promise<number>;
  deleteNotification(id: string, userId: string): Promise<boolean>;
  deleteOldNotifications(workspaceId: string, daysOld: number): Promise<number>;
  
  // Bulk notification operations - Database-synced persistent clear/acknowledge
  acknowledgeNotification(id: string, userId: string): Promise<Notification | undefined>;
  acknowledgeAllNotifications(userId: string, workspaceId?: string, category?: string): Promise<number>;
  clearNotification(id: string, userId: string): Promise<Notification | undefined>;
  clearAllNotifications(userId: string, workspaceId?: string, category?: string): Promise<number>;
  getUnclearedNotifications(userId: string, workspaceId?: string, category?: string, limit?: number): Promise<Notification[]>;
  getUnreadAndUnclearedCount(userId: string, workspaceId?: string): Promise<{ unread: number; uncleared: number }>;
  
  // Notification Preferences - User notification settings
  getNotificationPreferences(userId: string, workspaceId: string): Promise<UserNotificationPreferences | undefined>;
  createOrUpdateNotificationPreferences(userId: string, workspaceId: string, data: Partial<InsertUserNotificationPreferences>): Promise<UserNotificationPreferences>;

  // ========================================================================
  // PUSH NOTIFICATIONS - WEB PUSH SUBSCRIPTIONS
  // ========================================================================
  createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]>;
  getPushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<PushSubscription | undefined>;
  updatePushSubscription(id: string, data: Partial<InsertPushSubscription>): Promise<PushSubscription | undefined>;
  deletePushSubscription(id: string): Promise<boolean>;
  deletePushSubscriptionsByUser(userId: string, endpoint?: string): Promise<number>;
  deactivatePushSubscription(id: string): Promise<boolean>;

  // ========================================================================
  // PLATFORM UPDATES - WHAT'S NEW FEED
  // ========================================================================
  getPlatformUpdatesWithReadState(userId: string, workspaceId: string, limit?: number): Promise<Array<PlatformUpdate & { isViewed: boolean }>>;
  markPlatformUpdateAsViewed(userId: string, updateId: string): Promise<void>;
  markAllPlatformUpdatesAsViewed(userId: string, workspaceId?: string): Promise<number>;
  markPlatformUpdatesByCategories(userId: string, categories: string[], workspaceId?: string): Promise<number>;
  createPlatformUpdate(update: InsertPlatformUpdate): Promise<PlatformUpdate>;

  // ========================================================================
  // AI RESPONSES - TRACK AND LEARN FROM AI INTERACTIONS
  // ========================================================================
  createAiResponse(response: InsertAiResponse): Promise<AiResponse>;
  getAiResponse(id: string): Promise<AiResponse | undefined>;
  getAiResponsesByWorkspace(workspaceId: string, filters?: { sourceType?: string; feature?: string; limit?: number; offset?: number }): Promise<AiResponse[]>;
  getAiResponsesBySource(workspaceId: string, sourceType: string, sourceId: string): Promise<AiResponse[]>;
  updateAiResponse(id: string, data: Partial<InsertAiResponse>): Promise<AiResponse | undefined>;
  rateAiResponse(id: string, rating: number, feedback?: string): Promise<AiResponse | undefined>;

  // ========================================================================
  // AI SUGGESTIONS - UNIFIED AI-POWERED SUGGESTIONS
  // ========================================================================
  createAiSuggestion(suggestion: InsertAiSuggestion): Promise<AiSuggestion>;
  getAiSuggestion(id: string): Promise<AiSuggestion | undefined>;
  getAiSuggestionsByWorkspace(workspaceId: string, filters?: { status?: string; priority?: string; type?: string; limit?: number; offset?: number }): Promise<AiSuggestion[]>;
  getActiveSuggestions(workspaceId: string): Promise<AiSuggestion[]>;
  updateAiSuggestion(id: string, data: Partial<InsertAiSuggestion>): Promise<AiSuggestion | undefined>;
  acceptAiSuggestion(id: string, userId: string): Promise<AiSuggestion | undefined>;
  rejectAiSuggestion(id: string, userId: string, reason?: string): Promise<AiSuggestion | undefined>;
  implementAiSuggestion(id: string): Promise<AiSuggestion | undefined>;

  // ========================================================================
  // USER FEEDBACK PORTAL - Feature Requests, Bug Reports, and Suggestions
  // ========================================================================
  createFeedback(feedback: InsertUserFeedback): Promise<UserFeedback>;
  getFeedback(id: string): Promise<UserFeedback | undefined>;
  getFeedbackList(filters?: { type?: string; status?: string; priority?: string; workspaceId?: string; userId?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; limit?: number; offset?: number }): Promise<UserFeedback[]>;
  updateFeedback(id: string, data: Partial<InsertUserFeedback>): Promise<UserFeedback | undefined>;
  updateFeedbackStatus(id: string, status: string, updatedBy: string, note?: string): Promise<UserFeedback | undefined>;
  deleteFeedback(id: string): Promise<boolean>;
  
  createFeedbackComment(comment: InsertFeedbackComment): Promise<FeedbackComment>;
  getFeedbackComments(feedbackId: string): Promise<FeedbackComment[]>;
  deleteFeedbackComment(id: string): Promise<boolean>;
  
  voteFeedback(feedbackId: string, userId: string, voteType: 'up' | 'down'): Promise<{ feedback: UserFeedback; userVote: string | null }>;
  getUserFeedbackVote(feedbackId: string, userId: string): Promise<FeedbackVote | undefined>;

  // ========================================================================
  // MASCOT MOTION PROFILES - AI BRAIN ORCHESTRATED MOTION PATTERNS
  // ========================================================================
  createMascotMotionProfile(profile: InsertMascotMotionProfile): Promise<MascotMotionProfile>;
  getMascotMotionProfile(id: string): Promise<MascotMotionProfile | undefined>;
  getMascotMotionProfileByName(name: string): Promise<MascotMotionProfile | undefined>;
  getAllMascotMotionProfiles(): Promise<MascotMotionProfile[]>;
  getActiveMascotMotionProfiles(): Promise<MascotMotionProfile[]>;
  updateMascotMotionProfile(id: string, data: Partial<InsertMascotMotionProfile>): Promise<MascotMotionProfile | undefined>;
  deleteMascotMotionProfile(id: string): Promise<boolean>;

  // ========================================================================
  // HOLIDAY MASCOT DECORATIONS - AI BRAIN ORCHESTRATED HOLIDAY VISUALS
  // ========================================================================
  createHolidayMascotDecor(decor: InsertHolidayMascotDecor): Promise<HolidayMascotDecor>;
  getHolidayMascotDecor(id: string): Promise<HolidayMascotDecor | undefined>;
  getHolidayMascotDecorByKey(holidayKey: string): Promise<HolidayMascotDecor | undefined>;
  getAllHolidayMascotDecor(): Promise<HolidayMascotDecor[]>;
  getActiveHolidayMascotDecor(): Promise<HolidayMascotDecor[]>;
  updateHolidayMascotDecor(id: string, data: Partial<InsertHolidayMascotDecor>): Promise<HolidayMascotDecor | undefined>;
  deleteHolidayMascotDecor(id: string): Promise<boolean>;

  // ========================================================================
  // HOLIDAY MASCOT HISTORY - AI BRAIN DIRECTIVE AUDIT TRAIL
  // ========================================================================
  createHolidayMascotHistory(history: InsertHolidayMascotHistory): Promise<HolidayMascotHistory>;
  getHolidayMascotHistory(filters?: { holidayDecorId?: string; action?: string; triggeredBy?: string; limit?: number }): Promise<HolidayMascotHistory[]>;
  getLatestHolidayDirective(): Promise<HolidayMascotHistory | undefined>;
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsernameOrEmail(usernameOrEmail: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, usernameOrEmail),
          eq(users.workId, usernameOrEmail)
        )
      );
    return user;
  }

  async createPasswordResetToken(userId: string): Promise<string> {
    const { randomBytes } = await import('crypto');
    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    
    await db
      .update(users)
      .set({
        resetToken: token,
        resetTokenExpiry: expiry,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const user = await this.getUser(userId);
    if (user && user.email) {
      const { sendPasswordResetEmail } = await import('./services/emailService');
      await sendPasswordResetEmail(user.email, token);
    }

    return token;
  }

  async getSession(sessionId: string): Promise<{passport?: {user?: string}} | null> {
    try {
      // Query the sessions table directly
      const result = await db.execute(sql`
        SELECT sess FROM sessions WHERE sid = ${sessionId} AND expire > NOW()
      `);
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      // The sess column contains the session data as JSON
      const sessionData = result.rows[0].sess as {passport?: {user?: string}};
      return sessionData;
    } catch (error) {
      console.error('[SECURITY] Failed to fetch session:', error);
      return null;
    }
  }

  async logPasswordResetAttempt(data: {
    requestedBy: string;
    requestedByWorkspaceId?: string;
    targetUserId?: string | null;
    targetEmail: string;
    targetWorkspaceId?: string | null;
    success: boolean;
    outcomeCode: 'sent' | 'not_found' | 'rate_limited' | 'email_failed' | 'error';
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await db.insert(passwordResetAuditLog).values({
      requestedBy: data.requestedBy,
      requestedByWorkspaceId: data.requestedByWorkspaceId || null,
      targetUserId: data.targetUserId || null,
      targetEmail: data.targetEmail,
      targetWorkspaceId: data.targetWorkspaceId || null,
      success: data.success,
      outcomeCode: data.outcomeCode,
      reason: data.reason || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    });
  }

  async getPasswordResetAttempts(requestedBy: string, targetUserId: string | null, targetEmail: string, minutes: number): Promise<number> {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    
    if (targetUserId) {
      // Count attempts by this requester for this specific target user (AND condition)
      const userAttempts = await db.select()
        .from(passwordResetAuditLog)
        .where(and(
          eq(passwordResetAuditLog.requestedBy, requestedBy),
          eq(passwordResetAuditLog.targetUserId, targetUserId),
          gt(passwordResetAuditLog.createdAt, since)
        ));
      return userAttempts.length;
    } else {
      // Count email-only attempts (when user not found) by this requester for this email
      const emailAttempts = await db.select()
        .from(passwordResetAuditLog)
        .where(and(
          eq(passwordResetAuditLog.requestedBy, requestedBy),
          eq(passwordResetAuditLog.targetEmail, targetEmail),
          gt(passwordResetAuditLog.createdAt, since)
        ));
      return emailAttempts.length;
    }
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
    
    // Auto-seed default expense categories for new workspace
    await this.seedDefaultExpenseCategories(workspace.id);
    
    // Generate human-readable external ID (ORG-XXXX) and initialize employee/client sequences
    // BLOCKING call - critical for downstream employee ID generation
    try {
      const { ensureOrgIdentifiers } = await import('./services/identityService');
      await ensureOrgIdentifiers(workspace.id, workspace.name);
      console.log(`✅ [Storage] Generated external ID for org: ${workspace.id}`);
    } catch (err) {
      // Log error but don't fail workspace creation - can be retried later
      console.error(`❌ [Storage] Failed to attach org external ID for ${workspace.id}:`, err);
      // Consider: throw error here if external IDs are critical for your workflow
    }
    
    return workspace;
  }
  
  // Helper method to seed default expense categories
  private async seedDefaultExpenseCategories(workspaceId: string): Promise<void> {
    const defaultCategories = [
      { name: 'Mileage', description: 'Vehicle mileage reimbursement' },
      { name: 'Meals', description: 'Business meals and entertainment' },
      { name: 'Travel', description: 'Flights, hotels, and transportation' },
      { name: 'Office Supplies', description: 'Office equipment and supplies' },
    ];
    
    for (const category of defaultCategories) {
      try {
        await db.insert(expenseCategories).values({
          workspaceId,
          name: category.name,
          description: category.description,
          isActive: true,
        });
      } catch (error) {
        // Ignore duplicate errors, continue with next category
        console.log(`Category ${category.name} already exists for workspace ${workspaceId}`);
      }
    }
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

  async getWorkspaceMemberByUserId(userId: string): Promise<{ workspaceId: string; id: string } | undefined> {
    const [employee] = await db
      .select({ workspaceId: employees.workspaceId, id: employees.id })
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

  async getClientByUserId(userId: string): Promise<Client | undefined> {
    const [client] = await db.select()
      .from(clients)
      .where(eq(clients.userId, userId))
      .limit(1);
    
    return client;
  }

  async listClients(options: ListClientsOptions): Promise<PaginatedResponse<ClientWithInvoiceCount>> {
    const { workspaceId, page, limit, search, status, sort, order } = options;

    // Build WHERE conditions
    const conditions = [eq(clients.workspaceId, workspaceId)];

    // Status filter
    if (status === 'active') {
      conditions.push(eq(clients.isActive, true));
    } else if (status === 'inactive') {
      conditions.push(eq(clients.isActive, false));
    }

    // Search filter (firstName, lastName, companyName, email, phone) - case-insensitive
    if (search && search.trim().length > 0) {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(
        or(
          sql`${clients.firstName} ILIKE ${searchPattern}`,
          sql`${clients.lastName} ILIKE ${searchPattern}`,
          sql`${clients.companyName} ILIKE ${searchPattern}`,
          sql`${clients.email} ILIKE ${searchPattern}`,
          sql`${clients.phone} ILIKE ${searchPattern}`
        )!
      );
    }

    // Build sort column
    let sortColumn: any;
    switch (sort) {
      case 'firstName':
        sortColumn = clients.firstName;
        break;
      case 'lastName':
        sortColumn = clients.lastName;
        break;
      case 'companyName':
        sortColumn = clients.companyName;
        break;
      case 'createdAt':
      default:
        sortColumn = clients.createdAt;
        break;
    }

    // Get total count (without pagination)
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(clients)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    // Get paginated data with invoice counts (workspace-scoped)
    const offset = (page - 1) * limit;
    const clientsData = await db
      .select({
        id: clients.id,
        workspaceId: clients.workspaceId,
        firstName: clients.firstName,
        lastName: clients.lastName,
        companyName: clients.companyName,
        email: clients.email,
        phone: clients.phone,
        address: clients.address,
        latitude: clients.latitude,
        longitude: clients.longitude,
        billingEmail: clients.billingEmail,
        taxId: clients.taxId,
        clientOvertimeMultiplier: clients.clientOvertimeMultiplier,
        clientHolidayMultiplier: clients.clientHolidayMultiplier,
        isActive: clients.isActive,
        notes: clients.notes,
        color: clients.color,
        createdAt: clients.createdAt,
        updatedAt: clients.updatedAt,
        invoiceCount: sql<number>`COALESCE(COUNT(${invoices.id}), 0)::int`,
      })
      .from(clients)
      .leftJoin(invoices, and(
        eq(invoices.clientId, clients.id),
        eq(invoices.workspaceId, clients.workspaceId)
      ))
      .where(and(...conditions))
      .groupBy(clients.id)
      .orderBy(order === 'asc' ? sortColumn : desc(sortColumn))
      .limit(limit)
      .offset(offset);

    // Calculate pagination metadata
    const pageCount = Math.ceil(total / limit);
    const hasNext = page < pageCount;
    const hasPrev = page > 1;

    return {
      data: clientsData,
      total,
      page,
      limit,
      pageCount,
      hasNext,
      hasPrev,
    };
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
      .select({
        id: timeEntries.id,
        workspaceId: timeEntries.workspaceId,
        shiftId: timeEntries.shiftId,
        employeeId: timeEntries.employeeId,
        clientId: timeEntries.clientId,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        totalHours: timeEntries.totalHours,
        hourlyRate: timeEntries.hourlyRate,
        totalAmount: timeEntries.totalAmount,
        status: timeEntries.status,
        invoiceId: timeEntries.invoiceId,
        billableToClient: timeEntries.billableToClient,
        notes: timeEntries.notes,
        createdAt: timeEntries.createdAt,
        updatedAt: timeEntries.updatedAt,
      })
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
      .set({ ...data, updatedAt: new Date() })
      .where(eq(onboardingInvites.id, id))
      .returning();
    return updated;
  }

  async markInviteOpened(id: string): Promise<OnboardingInvite | undefined> {
    const [updated] = await db
      .update(onboardingInvites)
      .set({ 
        status: 'opened' as any,
        openedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(onboardingInvites.id, id))
      .returning();
    return updated;
  }

  async markInviteAccepted(id: string): Promise<OnboardingInvite | undefined> {
    const [updated] = await db
      .update(onboardingInvites)
      .set({ 
        status: 'accepted' as any,
        acceptedAt: new Date(),
        isUsed: true,
        updatedAt: new Date()
      })
      .where(eq(onboardingInvites.id, id))
      .returning();
    return updated;
  }

  async resendInvite(id: string, newToken: string, newExpiresAt: Date): Promise<OnboardingInvite | undefined> {
    const [invite] = await db.select().from(onboardingInvites).where(eq(onboardingInvites.id, id));
    if (!invite) return undefined;
    
    const [updated] = await db
      .update(onboardingInvites)
      .set({ 
        inviteToken: newToken,
        expiresAt: newExpiresAt,
        status: 'sent' as any,
        resentCount: (invite.resentCount || 0) + 1,
        lastResentAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(onboardingInvites.id, id))
      .returning();
    return updated;
  }

  async revokeInvite(id: string): Promise<OnboardingInvite | undefined> {
    const [updated] = await db
      .update(onboardingInvites)
      .set({ 
        status: 'revoked' as any,
        updatedAt: new Date()
      })
      .where(eq(onboardingInvites.id, id))
      .returning();
    return updated;
  }

  async getInvitesByStatus(workspaceId: string, status: string): Promise<OnboardingInvite[]> {
    return await db
      .select()
      .from(onboardingInvites)
      .where(
        and(
          eq(onboardingInvites.workspaceId, workspaceId),
          eq(onboardingInvites.status, status as any)
        )
      )
      .orderBy(desc(onboardingInvites.createdAt));
  }

  async getExpiredInvites(): Promise<OnboardingInvite[]> {
    return await db
      .select()
      .from(onboardingInvites)
      .where(
        and(
          eq(onboardingInvites.status, 'sent' as any),
          sql`${onboardingInvites.expiresAt} < NOW()`
        )
      );
  }

  async markExpiredInvites(): Promise<number> {
    const result = await db
      .update(onboardingInvites)
      .set({ 
        status: 'expired' as any,
        updatedAt: new Date()
      })
      .where(
        and(
          or(
            eq(onboardingInvites.status, 'sent' as any),
            eq(onboardingInvites.status, 'opened' as any)
          ),
          sql`${onboardingInvites.expiresAt} < NOW()`
        )
      );
    return result.rowCount || 0;
  }

  async getInviteById(id: string): Promise<OnboardingInvite | undefined> {
    const [invite] = await db.select().from(onboardingInvites).where(eq(onboardingInvites.id, id));
    return invite;
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
  
  async getSupportTicket(id: string, workspaceId: string): Promise<SupportTicket | undefined> {
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.workspaceId, workspaceId)));
    
    return ticket;
  }
  
  async getSupportTickets(workspaceId: string): Promise<SupportTicket[]> {
    return await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.workspaceId, workspaceId))
      .orderBy(desc(supportTickets.createdAt));
  }

  async getActiveSupportTicket(userId: string, workspaceId: string): Promise<SupportTicket | undefined> {
    const tickets = await db.select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          eq(supportTickets.requestedBy, userId),
          or(
            eq(supportTickets.status, 'open'),
            eq(supportTickets.status, 'in_progress')
          )
        )
      )
      .orderBy(desc(supportTickets.createdAt))
      .limit(1);
    return tickets[0];
  }
  
  async updateSupportTicket(id: string, data: Partial<InsertSupportTicket>): Promise<SupportTicket> {
    const [updated] = await db
      .update(supportTickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    
    return updated;
  }

  async deleteSupportTicket(id: string): Promise<boolean> {
    const result = await db
      .delete(supportTickets)
      .where(eq(supportTickets.id, id));
    
    return (result.rowCount || 0) > 0;
  }
  
  // ============================================================================
  // HELPOS™ AI SUPPORT SYSTEM
  // ============================================================================
  
  async createHelposSession(input: InsertHelposAiSession): Promise<HelposAiSession> {
    const [session] = await db
      .insert(helposAiSessions)
      .values(input)
      .returning();

    return session;
  }

  async getHelposSession(id: string, workspaceId: string): Promise<HelposAiSession | undefined> {
    const [session] = await db
      .select()
      .from(helposAiSessions)
      .where(and(eq(helposAiSessions.id, id), eq(helposAiSessions.workspaceId, workspaceId)));

    return session;
  }

  async getHelposSessionsByUser(userId: string, workspaceId: string): Promise<HelposAiSession[]> {
    return db
      .select()
      .from(helposAiSessions)
      .where(and(eq(helposAiSessions.userId, userId), eq(helposAiSessions.workspaceId, workspaceId)))
      .orderBy(desc(helposAiSessions.createdAt));
  }

  async updateHelposSession(
    id: string,
    workspaceId: string,
    data: Partial<InsertHelposAiSession>,
  ): Promise<HelposAiSession | undefined> {
    const [updated] = await db
      .update(helposAiSessions)
      .set(data)
      .where(and(eq(helposAiSessions.id, id), eq(helposAiSessions.workspaceId, workspaceId)))
      .returning();

    return updated;
  }

  async createHelposTranscript(entry: InsertHelposAiTranscriptEntry): Promise<HelposAiTranscriptEntry> {
    const [transcript] = await db
      .insert(helposAiTranscriptEntries)
      .values(entry)
      .returning();

    return transcript;
  }

  async getHelposTranscripts(sessionId: string): Promise<HelposAiTranscriptEntry[]> {
    return db
      .select()
      .from(helposAiTranscriptEntries)
      .where(eq(helposAiTranscriptEntries.sessionId, sessionId))
      .orderBy(helposAiTranscriptEntries.createdAt);
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
  // EVENT SOURCING & DATA INTEGRITY OPERATIONS
  // ============================================================================
  
  async createAuditEvent(event: InsertAuditEvent): Promise<string> {
    const [newEvent] = await db
      .insert(auditEvents)
      .values(event)
      .returning();
    
    return newEvent.id;
  }
  
  async getAuditEvent(id: string): Promise<AuditEvent | undefined> {
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.id, id));
    
    return event;
  }

  async getAuditEvents(filters?: { workspaceId?: string; actorType?: string; eventType?: string; limit?: number }): Promise<AuditEvent[]> {
    let query = db
      .select()
      .from(auditEvents);

    const conditions = [];
    
    if (filters?.workspaceId) {
      conditions.push(eq(auditEvents.workspaceId, filters.workspaceId));
    }
    
    if (filters?.actorType) {
      conditions.push(eq(auditEvents.actorType, filters.actorType));
    }
    
    if (filters?.eventType) {
      conditions.push(eq(auditEvents.eventType, filters.eventType));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    query = query.orderBy(desc(auditEvents.timestamp)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    return await query;
  }
  
  async verifyAuditEvent(eventId: string, actionHash: string): Promise<void> {
    const result = await db
      .update(auditEvents)
      .set({ 
        verifiedAt: new Date(),
        status: 'committed' as any,
      })
      .where(and(
        eq(auditEvents.id, eventId),
        eq(auditEvents.actionHash, actionHash)
      ))
      .returning();
    
    if (!result || result.length === 0) {
      throw new Error(`Failed to verify audit event ${eventId} - hash mismatch or event not found`);
    }
  }
  
  async registerID(entry: InsertIdRegistry): Promise<void> {
    try {
      await db
        .insert(idRegistry)
        .values(entry)
        .onConflictDoNothing(); // ID might already be registered
    } catch (error) {
      // Silently fail if ID is already registered (that's the goal!)
      console.warn('[Storage] ID already registered:', entry.id);
    }
  }
  
  async createWriteAheadLog(entry: InsertWriteAheadLog): Promise<string> {
    const [newEntry] = await db
      .insert(writeAheadLog)
      .values(entry)
      .returning();
    
    return newEntry.id;
  }
  
  async markWALPrepared(transactionId: string): Promise<void> {
    // Transition: pending → prepared
    const result = await db
      .update(writeAheadLog)
      .set({ 
        preparedAt: new Date(),
        status: 'pending' as any, // TODO: Should be 'prepared' but eventStatusEnum needs update
        updatedAt: new Date(),
      })
      .where(and(
        eq(writeAheadLog.transactionId, transactionId),
        eq(writeAheadLog.status, 'pending' as any)
      ))
      .returning();
    
    if (!result || result.length === 0) {
      const [existing] = await db
        .select()
        .from(writeAheadLog)
        .where(eq(writeAheadLog.transactionId, transactionId));
      
      if (!existing) {
        throw new InvalidWalTransitionError(transactionId, 'pending', undefined, `Transaction not found`);
      }
      throw new InvalidWalTransitionError(transactionId, 'pending', existing.status, `Cannot prepare - must be in pending state`);
    }
  }
  
  async markWALCommitted(transactionId: string): Promise<void> {
    // Transition: pending (with preparedAt set) → committed
    const result = await db
      .update(writeAheadLog)
      .set({ 
        committedAt: new Date(),
        status: 'committed' as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(writeAheadLog.transactionId, transactionId),
        eq(writeAheadLog.status, 'pending' as any), // Must be in pending state (prepared has preparedAt)
        isNotNull(writeAheadLog.preparedAt) // Must have been prepared
      ))
      .returning();
    
    if (!result || result.length === 0) {
      const [existing] = await db
        .select()
        .from(writeAheadLog)
        .where(eq(writeAheadLog.transactionId, transactionId));
      
      if (!existing) {
        throw new InvalidWalTransitionError(transactionId, 'prepared', undefined, `Transaction not found`);
      }
      throw new InvalidWalTransitionError(transactionId, 'prepared', existing.status, `Cannot commit - must be prepared first (preparedAt must be set)`);
    }
  }
  
  async markWALRolledBack(transactionId: string, errorMessage?: string): Promise<void> {
    // Transition: pending or pending+prepared → rolled_back
    const result = await db
      .update(writeAheadLog)
      .set({ 
        rolledBackAt: new Date(),
        status: 'rolled_back' as any,
        errorMessage,
        retryCount: sql`${writeAheadLog.retryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(writeAheadLog.transactionId, transactionId),
        eq(writeAheadLog.status, 'pending' as any) // Can rollback from pending (before or after prepare)
      ))
      .returning();
    
    if (!result || result.length === 0) {
      const [existing] = await db
        .select()
        .from(writeAheadLog)
        .where(eq(writeAheadLog.transactionId, transactionId));
      
      if (!existing) {
        throw new InvalidWalTransitionError(transactionId, 'pending', undefined, `Transaction not found`);
      }
      throw new InvalidWalTransitionError(transactionId, 'pending', existing.status, `Cannot rollback - already ${existing.status}`);
    }
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

  async updateChatMessage(id: string, conversationId: string, data: { message: string }): Promise<ChatMessage | undefined> {
    const [updated] = await db
      .update(chatMessages)
      .set({
        message: data.message,
        isEdited: true,
        editedAt: new Date(),
      })
      .where(
        and(
          eq(chatMessages.id, id),
          eq(chatMessages.conversationId, conversationId)
        )
      )
      .returning();
    
    return updated;
  }

  async deleteChatMessage(id: string, conversationId: string): Promise<boolean> {
    const result = await db
      .delete(chatMessages)
      .where(
        and(
          eq(chatMessages.id, id),
          eq(chatMessages.conversationId, conversationId)
        )
      );
    
    return (result.rowCount ?? 0) > 0;
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
  // SHIFT CHATROOM OPERATIONS (Time Integration)
  // Auto-create chatroom when employee clocks in, auto-close when they clock out
  // ============================================================================

  async createShiftChatroom(
    workspaceId: string,
    shiftId: string,
    timeEntryId: string,
    employeeId: string,
    employeeName: string
  ): Promise<ChatConversation> {
    const [conversation] = await db
      .insert(chatConversations)
      .values({
        workspaceId,
        shiftId,
        timeEntryId,
        conversationType: 'shift_chat',
        subject: `Shift Chat - ${employeeName}`,
        status: 'active',
        customerId: employeeId,
        customerName: employeeName,
        lastMessageAt: new Date(),
      })
      .returning();

    // Send welcome system message
    await this.createChatMessage({
      conversationId: conversation.id,
      senderId: null,
      senderName: 'System',
      senderType: 'system',
      message: `Welcome ${employeeName}! This is your shift chatroom. Use it to communicate with your team during this shift.`,
      isSystemMessage: true,
    });

    return conversation;
  }

  async getShiftChatroom(shiftId: string, timeEntryId: string): Promise<ChatConversation | undefined> {
    const [conversation] = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.shiftId, shiftId),
          eq(chatConversations.timeEntryId, timeEntryId),
          eq(chatConversations.conversationType, 'shift_chat')
        )
      )
      .limit(1);
    return conversation;
  }

  async closeShiftChatroom(shiftId: string, timeEntryId: string): Promise<ChatConversation | undefined> {
    const conversation = await this.getShiftChatroom(shiftId, timeEntryId);
    
    if (!conversation) {
      return undefined;
    }

    // Close the conversation
    const [closed] = await db
      .update(chatConversations)
      .set({ 
        status: 'closed', 
        closedAt: new Date(),
        resolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(chatConversations.id, conversation.id))
      .returning();

    // Send closing system message
    await this.createChatMessage({
      conversationId: conversation.id,
      senderId: null,
      senderName: 'System',
      senderType: 'system',
      message: 'Shift ended. This chatroom is now closed. All messages are archived for your records.',
      isSystemMessage: true,
    });

    return closed;
  }

  async getActiveShiftChatrooms(workspaceId: string): Promise<ChatConversation[]> {
    return await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.workspaceId, workspaceId),
          eq(chatConversations.conversationType, 'shift_chat'),
          eq(chatConversations.status, 'active')
        )
      )
      .orderBy(desc(chatConversations.lastMessageAt));
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
  
  async getAllSupportRooms(workspaceId?: string | null): Promise<SupportRoom[]> {
    // Return all platform-wide rooms (workspaceId is null) or workspace-specific rooms
    if (workspaceId) {
      return await db
        .select()
        .from(supportRooms)
        .where(
          or(
            isNull(supportRooms.workspaceId),
            eq(supportRooms.workspaceId, workspaceId)
          )
        )
        .orderBy(supportRooms.name);
    } else {
      // Return only platform-wide rooms
      return await db
        .select()
        .from(supportRooms)
        .where(isNull(supportRooms.workspaceId))
        .orderBy(supportRooms.name);
    }
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
  
  async updateSupportRoomConversation(slug: string, conversationId: string): Promise<SupportRoom | undefined> {
    const [updated] = await db
      .update(supportRooms)
      .set({ 
        conversationId,
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
    try {
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
    } catch (error: any) {
      // If table doesn't exist (error code 42P01), return 0
      if (error.code === '42P01') {
        return 0;
      }
      throw error;
    }
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
      .select({
        id: payrollEntries.id,
        payrollRunId: payrollEntries.payrollRunId,
        employeeId: payrollEntries.employeeId,
        workspaceId: payrollEntries.workspaceId,
        regularHours: payrollEntries.regularHours,
        overtimeHours: payrollEntries.overtimeHours,
        hourlyRate: payrollEntries.hourlyRate,
        grossPay: payrollEntries.grossPay,
        federalTax: payrollEntries.federalTax,
        stateTax: payrollEntries.stateTax,
        socialSecurity: payrollEntries.socialSecurity,
        medicare: payrollEntries.medicare,
        netPay: payrollEntries.netPay,
        notes: payrollEntries.notes,
        createdAt: payrollEntries.createdAt,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
      })
      .from(payrollEntries)
      .leftJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
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
  // SERVICE INCIDENT OPERATIONS (Error Handling)
  // ============================================================================

  async createServiceIncidentReport(report: InsertServiceIncidentReport): Promise<ServiceIncidentReport> {
    const [created] = await db
      .insert(serviceIncidentReports)
      .values(report)
      .returning();
    return created;
  }

  async getServiceIncidentReport(id: string, workspaceId: string): Promise<ServiceIncidentReport | undefined> {
    const [report] = await db
      .select()
      .from(serviceIncidentReports)
      .where(
        and(
          eq(serviceIncidentReports.id, id),
          eq(serviceIncidentReports.workspaceId, workspaceId)
        )
      );
    return report;
  }

  async getServiceIncidentReportsByWorkspace(workspaceId: string, limit: number = 100): Promise<ServiceIncidentReport[]> {
    return await db
      .select()
      .from(serviceIncidentReports)
      .where(eq(serviceIncidentReports.workspaceId, workspaceId))
      .orderBy(desc(serviceIncidentReports.createdAt))
      .limit(limit);
  }

  async getServiceIncidentReportsByService(serviceKey: string, workspaceId?: string, limit: number = 100): Promise<ServiceIncidentReport[]> {
    const conditions = workspaceId
      ? and(
          eq(serviceIncidentReports.serviceKey, serviceKey),
          eq(serviceIncidentReports.workspaceId, workspaceId)
        )
      : eq(serviceIncidentReports.serviceKey, serviceKey);

    return await db
      .select()
      .from(serviceIncidentReports)
      .where(conditions)
      .orderBy(desc(serviceIncidentReports.createdAt))
      .limit(limit);
  }

  async updateServiceIncidentReport(id: string, workspaceId: string, data: Partial<InsertServiceIncidentReport>): Promise<ServiceIncidentReport | undefined> {
    const [updated] = await db
      .update(serviceIncidentReports)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(serviceIncidentReports.id, id),
          eq(serviceIncidentReports.workspaceId, workspaceId)
        )
      )
      .returning();
    return updated;
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
  
  async createClientRate(rateData: InsertClientRate): Promise<ClientRate> {
    const { clientRates } = await import("@shared/schema");
    const [rate] = await db
      .insert(clientRates)
      .values(rateData)
      .returning();
    return rate;
  }
  
  async getClientRates(workspaceId: string, clientId: string): Promise<ClientRate[]> {
    const { clientRates } = await import("@shared/schema");
    return await db
      .select()
      .from(clientRates)
      .where(and(
        eq(clientRates.workspaceId, workspaceId),
        eq(clientRates.clientId, clientId)
      ));
  }
  
  // ============================================================================
  // EXPENSEOS™ - EXPENSE MANAGEMENT
  // ============================================================================
  
  // Expense Categories
  async createExpenseCategory(category: InsertExpenseCategory) {
    const [created] = await db.insert(expenseCategories).values(category).returning();
    return created;
  }
  
  async getExpenseCategory(id: string, workspaceId: string) {
    const [category] = await db
      .select()
      .from(expenseCategories)
      .where(and(
        eq(expenseCategories.id, id),
        eq(expenseCategories.workspaceId, workspaceId)
      ))
      .limit(1);
    return category;
  }
  
  async getExpenseCategoriesByWorkspace(workspaceId: string) {
    return await db
      .select()
      .from(expenseCategories)
      .where(and(
        eq(expenseCategories.workspaceId, workspaceId),
        eq(expenseCategories.isActive, true)
      ))
      .orderBy(expenseCategories.name);
  }
  
  async updateExpenseCategory(id: string, workspaceId: string, data: Partial<InsertExpenseCategory>) {
    const [updated] = await db
      .update(expenseCategories)
      .set({ ...data, createdAt: undefined })
      .where(and(
        eq(expenseCategories.id, id),
        eq(expenseCategories.workspaceId, workspaceId)
      ))
      .returning();
    return updated;
  }
  
  async deleteExpenseCategory(id: string, workspaceId: string): Promise<boolean> {
    const result = await db
      .delete(expenseCategories)
      .where(and(
        eq(expenseCategories.id, id),
        eq(expenseCategories.workspaceId, workspaceId)
      ));
    return true;
  }
  
  // Expenses
  async createExpense(expense: InsertExpense) {
    const { expenses } = await import("@shared/schema");
    const [created] = await db.insert(expenses).values(expense).returning();
    return created;
  }
  
  async getExpense(id: string, workspaceId: string) {
    const { expenses } = await import("@shared/schema");
    const [expense] = await db
      .select()
      .from(expenses)
      .where(and(
        eq(expenses.id, id),
        eq(expenses.workspaceId, workspaceId)
      ))
      .limit(1);
    return expense;
  }
  
  async getExpensesByWorkspace(workspaceId: string, filters?: { status?: string; employeeId?: string; categoryId?: string }) {
    const { expenses } = await import("@shared/schema");
    const conditions = [eq(expenses.workspaceId, workspaceId)];
    
    if (filters?.status) {
      conditions.push(eq(expenses.status, filters.status as any));
    }
    if (filters?.employeeId) {
      conditions.push(eq(expenses.employeeId, filters.employeeId));
    }
    if (filters?.categoryId) {
      conditions.push(eq(expenses.categoryId, filters.categoryId));
    }
    
    return await db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.expenseDate));
  }
  
  async updateExpense(id: string, workspaceId: string, data: Partial<InsertExpense>) {
    const { expenses } = await import("@shared/schema");
    const [updated] = await db
      .update(expenses)
      .set({ 
        ...data, 
        id: undefined, 
        workspaceId: undefined, 
        createdAt: undefined,
        updatedAt: new Date() 
      })
      .where(and(
        eq(expenses.id, id),
        eq(expenses.workspaceId, workspaceId)
      ))
      .returning();
    return updated;
  }
  
  async approveExpense(expenseId: string, workspaceId: string, approverId: string, reviewNotes?: string) {
    const { expenses } = await import("@shared/schema");
    const [expense] = await db
      .update(expenses)
      .set({
        status: 'approved',
        reviewedBy: approverId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
        updatedAt: new Date()
      })
      .where(and(
        eq(expenses.id, expenseId),
        eq(expenses.workspaceId, workspaceId)
      ))
      .returning();
    return expense;
  }
  
  async rejectExpense(expenseId: string, workspaceId: string, reviewerId: string, reviewNotes: string) {
    const { expenses } = await import("@shared/schema");
    const [expense] = await db
      .update(expenses)
      .set({
        status: 'rejected',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes,
        updatedAt: new Date()
      })
      .where(and(
        eq(expenses.id, expenseId),
        eq(expenses.workspaceId, workspaceId)
      ))
      .returning();
    return expense;
  }
  
  async markExpensePaid(expenseId: string, workspaceId: string, paidById: string, paymentMethod?: string) {
    const { expenses } = await import("@shared/schema");
    const [expense] = await db
      .update(expenses)
      .set({
        status: 'reimbursed',
        paidAt: new Date(),
        paymentMethod: paymentMethod || null,
        updatedAt: new Date()
      })
      .where(and(
        eq(expenses.id, expenseId),
        eq(expenses.workspaceId, workspaceId),
        eq(expenses.status, 'approved')
      ))
      .returning();
    return expense;
  }
  
  async deleteExpense(id: string, workspaceId: string): Promise<boolean> {
    const { expenses } = await import("@shared/schema");
    await db
      .delete(expenses)
      .where(and(
        eq(expenses.id, id),
        eq(expenses.workspaceId, workspaceId)
      ));
    return true;
  }
  
  // Expense Receipts
  async createExpenseReceipt(receipt: InsertExpenseReceipt) {
    const { expenseReceipts } = await import("@shared/schema");
    const [created] = await db.insert(expenseReceipts).values(receipt).returning();
    return created;
  }
  
  async getExpenseReceipt(id: string, workspaceId: string) {
    const { expenseReceipts } = await import("@shared/schema");
    const [receipt] = await db
      .select()
      .from(expenseReceipts)
      .where(and(
        eq(expenseReceipts.id, id),
        eq(expenseReceipts.workspaceId, workspaceId)
      ))
      .limit(1);
    return receipt;
  }
  
  async getExpenseReceiptsByExpense(expenseId: string) {
    const { expenseReceipts } = await import("@shared/schema");
    return await db
      .select()
      .from(expenseReceipts)
      .where(eq(expenseReceipts.expenseId, expenseId))
      .orderBy(expenseReceipts.uploadedAt);
  }
  
  async deleteExpenseReceipt(id: string, workspaceId: string): Promise<boolean> {
    const { expenseReceipts } = await import("@shared/schema");
    await db
      .delete(expenseReceipts)
      .where(and(
        eq(expenseReceipts.id, id),
        eq(expenseReceipts.workspaceId, workspaceId)
      ));
    return true;
  }
  
  // ============================================================================
  // I-9 RE-VERIFICATION & COMPLIANCE
  // ============================================================================
  
  async getI9RecordsByWorkspace(workspaceId: string) {
    const { employeeI9Records } = await import("@shared/schema");
    return await db
      .select()
      .from(employeeI9Records)
      .where(eq(employeeI9Records.workspaceId, workspaceId))
      .orderBy(desc(employeeI9Records.createdAt));
  }
  
  async getI9RecordByEmployee(employeeId: string, workspaceId: string) {
    const { employeeI9Records } = await import("@shared/schema");
    const [record] = await db
      .select()
      .from(employeeI9Records)
      .where(and(
        eq(employeeI9Records.employeeId, employeeId),
        eq(employeeI9Records.workspaceId, workspaceId)
      ))
      .limit(1);
    return record;
  }
  
  async getExpiringI9Authorizations(workspaceId: string, daysAhead: number) {
    const { employeeI9Records } = await import("@shared/schema");
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    
    return await db
      .select()
      .from(employeeI9Records)
      .where(and(
        eq(employeeI9Records.workspaceId, workspaceId),
        lte(employeeI9Records.expirationDate, futureDate),
        eq(employeeI9Records.reverificationCompleted, false)
      ))
      .orderBy(employeeI9Records.expirationDate);
  }
  
  // ============================================================================
  // POLICIOS™ - POLICY & HANDBOOK MANAGEMENT
  // ============================================================================
  
  async createCompanyPolicy(policy: any) {
    const { companyPolicies } = await import("@shared/schema");
    const [created] = await db.insert(companyPolicies).values(policy).returning();
    return created;
  }
  
  async getCompanyPolicy(id: string, workspaceId: string) {
    const { companyPolicies } = await import("@shared/schema");
    const [policy] = await db
      .select()
      .from(companyPolicies)
      .where(and(
        eq(companyPolicies.id, id),
        eq(companyPolicies.workspaceId, workspaceId)
      ))
      .limit(1);
    return policy;
  }
  
  async getCompanyPolicies(workspaceId: string) {
    const { companyPolicies } = await import("@shared/schema");
    return await db
      .select()
      .from(companyPolicies)
      .where(eq(companyPolicies.workspaceId, workspaceId))
      .orderBy(desc(companyPolicies.createdAt));
  }
  
  async updateCompanyPolicy(id: string, workspaceId: string, data: any) {
    const { companyPolicies } = await import("@shared/schema");
    const [updated] = await db
      .update(companyPolicies)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(companyPolicies.id, id),
        eq(companyPolicies.workspaceId, workspaceId)
      ))
      .returning();
    return updated;
  }
  
  async publishPolicy(id: string, workspaceId: string, publishedBy: string) {
    const { companyPolicies } = await import("@shared/schema");
    const [published] = await db
      .update(companyPolicies)
      .set({
        status: 'published',
        publishedAt: new Date(),
        publishedBy,
        updatedAt: new Date()
      })
      .where(and(
        eq(companyPolicies.id, id),
        eq(companyPolicies.workspaceId, workspaceId)
      ))
      .returning();
    return published;
  }
  
  async getPolicyAcknowledgments(policyId: string) {
    const { policyAcknowledgments } = await import("@shared/schema");
    return await db
      .select()
      .from(policyAcknowledgments)
      .where(eq(policyAcknowledgments.policyId, policyId))
      .orderBy(desc(policyAcknowledgments.acknowledgedAt));
  }
  
  async createPolicyAcknowledgment(ack: any) {
    const { policyAcknowledgments } = await import("@shared/schema");
    const [created] = await db.insert(policyAcknowledgments).values(ack).returning();
    return created;
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
  // TALENTOS™ - ROLE TEMPLATES & CAREER PATHING
  // ============================================================================
  
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
  
  async getHiringComplianceReport(workspaceId: string): Promise<any> {
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
  
  // ============================================================================
  // COMMOS™ - ORGANIZATION CHAT ROOMS & CHANNELS
  // ============================================================================
  
  async createOrganizationChatRoom(room: any): Promise<any> {
    const [result] = await db.insert(organizationChatRooms).values(room).returning();
    return result;
  }
  
  async getOrganizationChatRoom(id: string): Promise<any | undefined> {
    const [room] = await db.select().from(organizationChatRooms).where(eq(organizationChatRooms.id, id));
    return room;
  }
  
  async getOrganizationChatRoomsByWorkspace(workspaceId: string): Promise<any[]> {
    return await db.select().from(organizationChatRooms).where(eq(organizationChatRooms.workspaceId, workspaceId));
  }
  
  async getAllOrganizationChatRooms(): Promise<any[]> {
    return await db.select().from(organizationChatRooms);
  }
  
  async updateOrganizationChatRoom(id: string, data: any): Promise<any | undefined> {
    const [room] = await db
      .update(organizationChatRooms)
      .set(data)
      .where(eq(organizationChatRooms.id, id))
      .returning();
    return room;
  }
  
  async suspendOrganizationChatRoom(id: string, suspendedBy: string, reason: string): Promise<any | undefined> {
    const [room] = await db
      .update(organizationChatRooms)
      .set({
        status: 'suspended',
        suspendedReason: reason,
        suspendedAt: new Date(),
        suspendedBy: suspendedBy,
      })
      .where(eq(organizationChatRooms.id, id))
      .returning();
    return room;
  }
  
  async liftOrganizationChatRoomSuspension(id: string): Promise<any | undefined> {
    const [room] = await db
      .update(organizationChatRooms)
      .set({
        status: 'active',
        suspendedReason: null,
        suspendedAt: null,
        suspendedBy: null,
      })
      .where(eq(organizationChatRooms.id, id))
      .returning();
    return room;
  }
  
  async createOrganizationChatChannel(channel: any): Promise<any> {
    const [result] = await db.insert(organizationChatChannels).values(channel).returning();
    return result;
  }
  
  async getOrganizationChatChannelsByRoom(roomId: string): Promise<any[]> {
    return await db.select().from(organizationChatChannels).where(eq(organizationChatChannels.roomId, roomId));
  }
  
  async addOrganizationRoomMember(member: any): Promise<any> {
    const [result] = await db.insert(organizationRoomMembers).values(member).returning();
    return result;
  }
  
  async getOrganizationRoomMembers(roomId: string): Promise<any[]> {
    return await db.select().from(organizationRoomMembers).where(eq(organizationRoomMembers.roomId, roomId));
  }
  
  async removeOrganizationRoomMember(roomId: string, userId: string): Promise<boolean> {
    await db.delete(organizationRoomMembers).where(
      and(
        eq(organizationRoomMembers.roomId, roomId),
        eq(organizationRoomMembers.userId, userId)
      )
    );
    return true;
  }
  
  async getOrganizationRoomOnboarding(workspaceId: string): Promise<any | undefined> {
    const [result] = await db.select().from(organizationRoomOnboarding).where(eq(organizationRoomOnboarding.workspaceId, workspaceId));
    return result;
  }
  
  async updateOrganizationRoomOnboarding(workspaceId: string, data: any): Promise<any | undefined> {
    const [result] = await db
      .update(organizationRoomOnboarding)
      .set(data)
      .where(eq(organizationRoomOnboarding.workspaceId, workspaceId))
      .returning();
    return result;
  }
  
  async createOrganizationRoomOnboarding(data: any): Promise<any> {
    const [result] = await db.insert(organizationRoomOnboarding).values(data).returning();
    return result;
  }
  
  async completeOrganizationOnboarding(workspaceId: string, userId: string, roomData: {
    roomName: string;
    roomDescription?: string;
    channels: string[];
    allowGuests: boolean;
  }): Promise<any> {
    return await db.transaction(async (tx) => {
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const [room] = await tx.insert(organizationChatRooms).values({
        id: roomId,
        workspaceId,
        roomName: roomData.roomName,
        roomDescription: roomData.roomDescription || null,
        createdBy: userId,
        status: 'active',
        allowGuests: roomData.allowGuests,
      }).returning();
      
      for (const channelName of roomData.channels) {
        await tx.insert(organizationChatChannels).values({
          roomId,
          workspaceId,
          channelName,
          channelType: 'public',
          createdBy: userId,
        });
      }
      
      await tx.insert(organizationRoomMembers).values({
        roomId,
        userId,
        workspaceId,
        role: 'owner',
        canInvite: true,
        canManage: true,
        isApproved: true,
      });
      
      const [existingOnboarding] = await tx.select().from(organizationRoomOnboarding).where(eq(organizationRoomOnboarding.workspaceId, workspaceId));
      
      if (existingOnboarding) {
        await tx.update(organizationRoomOnboarding)
          .set({
            isCompleted: true,
            currentStep: 4,
            completedAt: new Date(),
          })
          .where(eq(organizationRoomOnboarding.workspaceId, workspaceId));
      } else {
        await tx.insert(organizationRoomOnboarding).values({
          workspaceId,
          isCompleted: true,
          currentStep: 4,
          completedAt: new Date(),
        });
      }
      
      return room;
    });
  }
  
  // ============================================================================
  // PRIVATE MESSAGES / DM OPERATIONS
  // ============================================================================
  
  async getPrivateMessageConversations(userId: string, workspaceId: string): Promise<any[]> {
    const conversations = await db
      .select({
        conversationId: chatConversations.id,
        customerId: chatConversations.customerId,
        customerName: chatConversations.customerName,
        supportAgentId: chatConversations.supportAgentId,
        supportAgentName: chatConversations.supportAgentName,
        lastMessageAt: chatConversations.lastMessageAt,
        subject: chatConversations.subject,
      })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.workspaceId, workspaceId),
          eq(chatConversations.subject, 'Private Message'), // Only DM conversations
          or(
            eq(chatConversations.customerId, userId),
            eq(chatConversations.supportAgentId, userId)
          )
        )
      )
      .orderBy(desc(chatConversations.lastMessageAt));
    
    const formattedConversations = await Promise.all(conversations.map(async (conv) => {
      const recipientId = conv.customerId === userId ? conv.supportAgentId : conv.customerId;
      const recipientName = conv.customerId === userId ? conv.supportAgentName : conv.customerName;
      
      const [lastMessage] = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conv.conversationId),
            eq(chatMessages.isPrivateMessage, true)
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      
      const unreadMessages = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conv.conversationId),
            eq(chatMessages.isPrivateMessage, true),
            eq(chatMessages.recipientId, userId),
            eq(chatMessages.isRead, false)
          )
        );
      
      return {
        id: conv.conversationId,
        recipientId,
        recipientName,
        lastMessage: lastMessage?.message || null,
        lastMessageAt: lastMessage?.createdAt || conv.lastMessageAt,
        unreadCount: unreadMessages[0]?.count || 0,
      };
    }));
    
    return formattedConversations;
  }
  
  async getPrivateMessages(userId: string, conversationId: string): Promise<any[]> {
    const conversation = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.subject, 'Private Message')
        )
      )
      .limit(1);
    
    if (conversation.length === 0) {
      return [];
    }

    const conv = conversation[0];
    
    // Verify user is a participant
    if (conv.customerId !== userId && conv.supportAgentId !== userId) {
      throw new Error('Unauthorized: User is not a participant in this conversation');
    }
    
    const messages = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.isPrivateMessage, true)
        )
      )
      .orderBy(chatMessages.createdAt);
    
    // Decrypt messages if conversation is encrypted
    if (conv.isEncrypted && conv.encryptionKeyId) {
      const { decryptMessage } = await import('./encryption.js');
      
      const decryptedMessages = await Promise.all(messages.map(async (msg) => {
        if (msg.isEncrypted && msg.encryptionIv) {
          try {
            const decrypted = await decryptMessage(msg.message, msg.encryptionIv, conv.encryptionKeyId);
            return { ...msg, message: decrypted };
          } catch (error) {
            console.error('Failed to decrypt message:', error);
            return { ...msg, message: '[Decryption failed]' };
          }
        }
        return msg;
      }));
      
      return decryptedMessages;
    }
    
    return messages;
  }

  // Audit access to DMs - requires approved audit request
  async getPrivateMessagesWithAuditAccess(data: {
    conversationId: string;
    auditRequestId: string;
    accessedBy: string;
    accessedByName: string;
    accessedByEmail: string;
    accessedByRole: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<any[]> {
    const conversation = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, data.conversationId),
          eq(chatConversations.subject, 'Private Message')
        )
      )
      .limit(1);
    
    if (conversation.length === 0) {
      throw new Error('Conversation not found');
    }

    const conv = conversation[0];
    
    // Check audit authorization
    const authCheck = await this.checkDmAccessAuthorization(data.conversationId, data.accessedBy);
    if (!authCheck.authorized) {
      throw new Error(`Audit access denied: ${authCheck.reason}`);
    }
    
    const messages = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, data.conversationId),
          eq(chatMessages.isPrivateMessage, true)
        )
      )
      .orderBy(chatMessages.createdAt);
    
    // Log the audit access
    await this.logDmAccess({
      conversationId: data.conversationId,
      auditRequestId: data.auditRequestId,
      accessedBy: data.accessedBy,
      accessedByName: data.accessedByName,
      accessedByEmail: data.accessedByEmail,
      accessedByRole: data.accessedByRole,
      accessReason: authCheck.auditRequest?.investigationReason || 'Audit investigation',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      messagesViewed: messages.length,
    });
    
    // Decrypt messages if encrypted
    if (conv.isEncrypted && conv.encryptionKeyId) {
      const { decryptMessage } = await import('./encryption.js');
      
      const decryptedMessages = await Promise.all(messages.map(async (msg) => {
        if (msg.isEncrypted && msg.encryptionIv) {
          try {
            const decrypted = await decryptMessage(msg.message, msg.encryptionIv, conv.encryptionKeyId);
            return { ...msg, message: decrypted };
          } catch (error) {
            console.error('Failed to decrypt message:', error);
            return { ...msg, message: '[Decryption failed]' };
          }
        }
        return msg;
      }));
      
      return decryptedMessages;
    }
    
    return messages;
  }
  
  async sendPrivateMessage(data: {
    workspaceId: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    recipientId: string;
    message: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }): Promise<any> {
    // Get conversation to check if encryption is enabled
    const [conversation] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, data.conversationId))
      .limit(1);
    
    let messageContent = data.message;
    let encryptionIv: string | undefined;
    let isEncrypted = false;
    
    // Encrypt message if conversation has encryption enabled
    if (conversation?.isEncrypted && conversation?.encryptionKeyId) {
      const { encryptMessage } = await import('./encryption.js');
      const encrypted = await encryptMessage(data.message, conversation.encryptionKeyId);
      messageContent = encrypted.encrypted;
      encryptionIv = encrypted.iv;
      isEncrypted = true;
    }
    
    const [result] = await db.insert(chatMessages).values({
      conversationId: data.conversationId,
      senderId: data.senderId,
      senderName: data.senderName,
      senderType: 'customer',
      message: messageContent,
      isEncrypted,
      encryptionIv,
      isPrivateMessage: true,
      recipientId: data.recipientId,
      isRead: false,
      attachmentUrl: data.attachmentUrl,
      attachmentName: data.attachmentName,
    }).returning();
    
    await db
      .update(chatConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatConversations.id, data.conversationId));
    
    return result;
  }
  
  async getOrCreatePrivateConversation(workspaceId: string, user1Id: string, user2Id: string): Promise<any> {
    const existing = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.workspaceId, workspaceId),
          eq(chatConversations.subject, 'Private Message'), // Only DM conversations
          or(
            and(
              eq(chatConversations.customerId, user1Id),
              eq(chatConversations.supportAgentId, user2Id)
            ),
            and(
              eq(chatConversations.customerId, user2Id),
              eq(chatConversations.supportAgentId, user1Id)
            )
          )
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    const user1 = await this.getUser(user1Id);
    const user2 = await this.getUser(user2Id);
    
    // Create conversation first, then generate encryption key
    const [conversation] = await db.insert(chatConversations).values({
      workspaceId,
      customerId: user1Id,
      customerName: `${user1?.firstName || ''} ${user1?.lastName || ''}`.trim() || user1?.email,
      supportAgentId: user2Id,
      supportAgentName: `${user2?.firstName || ''} ${user2?.lastName || ''}`.trim() || user2?.email,
      subject: 'Private Message',
      status: 'active',
      isSilenced: false,
      conversationType: 'dm_user', // Mark as user-to-user DM
      isEncrypted: false, // Will be updated after key generation
    }).returning();
    
    // Generate and persist encryption key for this private conversation
    const { generateEncryptionKey } = await import('./encryption.js');
    const encKey = await generateEncryptionKey(conversation.id, workspaceId, user1Id);
    
    // Update conversation with encryption key ID
    await db
      .update(chatConversations)
      .set({
        isEncrypted: true,
        encryptionKeyId: encKey.id,
      })
      .where(eq(chatConversations.id, conversation.id));
    
    return { ...conversation, isEncrypted: true, encryptionKeyId: encKey.id };
  }
  
  async markPrivateMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    const conversation = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.subject, 'Private Message')
        )
      )
      .limit(1);
    
    if (conversation.length === 0) {
      return;
    }
    
    await db
      .update(chatMessages)
      .set({ 
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.recipientId, userId),
          eq(chatMessages.isPrivateMessage, true),
          eq(chatMessages.isRead, false)
        )
      );
  }
  
  async searchUsers(workspaceId: string, query: string): Promise<any[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    const users = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      })
      .from(users)
      .leftJoin(employees, eq(users.id, employees.userId))
      .where(
        and(
          or(
            eq(employees.workspaceId, workspaceId),
            eq(users.role, 'platform_admin'),
            eq(users.role, 'support_staff')
          ),
          or(
            sql`LOWER(${users.email}) LIKE ${searchTerm}`,
            sql`LOWER(${users.firstName}) LIKE ${searchTerm}`,
            sql`LOWER(${users.lastName}) LIKE ${searchTerm}`
          )
        )
      )
      .limit(20);
    
    return users;
  }

  // ============================================================================
  // DM AUDIT & INVESTIGATION OPERATIONS
  // ============================================================================

  async createDmAuditRequest(data: {
    workspaceId: string;
    conversationId: string;
    investigationReason: string;
    caseNumber?: string;
    requestedBy: string;
    requestedByName: string;
    requestedByEmail: string;
  }): Promise<any> {
    const result = await db
      .insert(dmAuditRequests)
      .values({
        workspaceId: data.workspaceId,
        conversationId: data.conversationId,
        investigationReason: data.investigationReason,
        caseNumber: data.caseNumber,
        requestedBy: data.requestedBy,
        requestedByName: data.requestedByName,
        requestedByEmail: data.requestedByEmail,
        status: 'pending',
        isActive: true,
      })
      .returning();
    
    return result[0];
  }

  async getDmAuditRequests(workspaceId: string): Promise<any[]> {
    return await db
      .select()
      .from(dmAuditRequests)
      .where(eq(dmAuditRequests.workspaceId, workspaceId))
      .orderBy(desc(dmAuditRequests.createdAt));
  }

  async getDmAuditRequestById(requestId: string): Promise<any | null> {
    const result = await db
      .select()
      .from(dmAuditRequests)
      .where(eq(dmAuditRequests.id, requestId))
      .limit(1);
    
    return result[0] || null;
  }

  async approveDmAuditRequest(data: {
    requestId: string;
    approvedBy: string;
    approvedByName: string;
    expiresAt?: Date;
  }): Promise<any> {
    const result = await db
      .update(dmAuditRequests)
      .set({
        status: 'approved',
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName,
        approvedAt: new Date(),
        expiresAt: data.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(dmAuditRequests.id, data.requestId))
      .returning();
    
    return result[0];
  }

  async denyDmAuditRequest(requestId: string, deniedReason: string): Promise<any> {
    const result = await db
      .update(dmAuditRequests)
      .set({
        status: 'denied',
        deniedReason,
        updatedAt: new Date(),
      })
      .where(eq(dmAuditRequests.id, requestId))
      .returning();
    
    return result[0];
  }

  async logDmAccess(data: {
    conversationId: string;
    auditRequestId?: string;
    accessedBy: string;
    accessedByName: string;
    accessedByEmail: string;
    accessedByRole: string;
    accessReason: string;
    ipAddress?: string;
    userAgent?: string;
    messagesViewed?: number;
    filesAccessed?: number;
  }): Promise<any> {
    const result = await db
      .insert(dmAccessLogs)
      .values({
        conversationId: data.conversationId,
        auditRequestId: data.auditRequestId,
        accessedBy: data.accessedBy,
        accessedByName: data.accessedByName,
        accessedByEmail: data.accessedByEmail,
        accessedByRole: data.accessedByRole,
        accessReason: data.accessReason,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        messagesViewed: data.messagesViewed || 0,
        filesAccessed: data.filesAccessed || 0,
      })
      .returning();
    
    return result[0];
  }

  async getDmAccessLogs(conversationId: string): Promise<any[]> {
    return await db
      .select()
      .from(dmAccessLogs)
      .where(eq(dmAccessLogs.conversationId, conversationId))
      .orderBy(desc(dmAccessLogs.accessedAt));
  }

  async checkDmAccessAuthorization(conversationId: string, userId: string): Promise<{
    authorized: boolean;
    auditRequest?: any;
    reason?: string;
  }> {
    const activeRequest = await db
      .select()
      .from(dmAuditRequests)
      .where(
        and(
          eq(dmAuditRequests.conversationId, conversationId),
          eq(dmAuditRequests.status, 'approved'),
          eq(dmAuditRequests.isActive, true)
        )
      )
      .limit(1);
    
    if (activeRequest.length === 0) {
      return { authorized: false, reason: 'No active audit approval found' };
    }

    const request = activeRequest[0];
    
    // Check if expired
    if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
      return { authorized: false, reason: 'Audit approval has expired' };
    }
    
    return { authorized: true, auditRequest: request };
  }

  // Chat Export Methods for Support Staff
  async getSupportConversationForExport(conversationId: string): Promise<any | null> {
    const conversation = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    
    if (conversation.length === 0) {
      return null;
    }
    
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
    
    return {
      conversation: conversation[0],
      messages,
      exportedAt: new Date(),
    };
  }

  async getCommRoomForExport(roomId: string): Promise<any | null> {
    const room = await db
      .select()
      .from(organizationChatRooms)
      .where(eq(organizationChatRooms.id, roomId))
      .limit(1);
    
    if (room.length === 0) {
      return null;
    }
    
    // Get all channels for this room
    const channels = await db
      .select()
      .from(organizationChatChannels)
      .where(eq(organizationChatChannels.roomId, roomId));
    
    // Get messages from all channels (each channel has a conversationId)
    const allMessages: ChatMessage[] = [];
    for (const channel of channels) {
      if (channel.conversationId) {
        const channelMessages = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, channel.conversationId))
          .orderBy(chatMessages.createdAt);
        allMessages.push(...channelMessages);
      }
    }
    
    // Sort all messages by timestamp
    allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    // Get room members
    const members = await db
      .select()
      .from(organizationRoomMembers)
      .where(eq(organizationRoomMembers.roomId, roomId));
    
    return {
      room: room[0],
      messages: allMessages,
      members,
      exportedAt: new Date(),
    };
  }

  async getPrivateConversationForExport(conversationId: string, requestedBy: string): Promise<any | null> {
    const conversation = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.conversationType, 'dm_user')
        )
      )
      .limit(1);
    
    if (conversation.length === 0) {
      return null;
    }
    
    const conv = conversation[0];
    
    // Check if user has audit access
    const authCheck = await this.checkDmAccessAuthorization(conversationId, requestedBy);
    if (!authCheck.authorized) {
      throw new Error('Not authorized to export this private conversation');
    }
    
    // Get messages
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
    
    // Decrypt if encrypted
    let decryptedMessages = messages;
    if (conv.isEncrypted && conv.encryptionKeyId) {
      const { decryptMessage } = await import('./encryption.js');
      decryptedMessages = await Promise.all(messages.map(async (msg) => {
        if (msg.isEncrypted && msg.encryptionIv) {
          try {
            const decrypted = await decryptMessage(msg.message, msg.encryptionIv, conv.encryptionKeyId);
            return { ...msg, message: decrypted };
          } catch (error) {
            return { ...msg, message: '[Decryption failed]' };
          }
        }
        return msg;
      }));
    }
    
    // Log access
    await this.logDmAccess({
      conversationId,
      auditRequestId: authCheck.auditRequest?.id,
      accessedBy: requestedBy,
      accessedByName: 'Support Staff',
      accessedByEmail: 'support@coaileague.com',
      accessedByRole: 'support',
      accessReason: 'Chat export',
      messagesViewed: messages.length,
    });
    
    return {
      conversation: conv,
      messages: decryptedMessages,
      exportedAt: new Date(),
      auditInfo: {
        exportedBy: requestedBy,
        auditRequestId: authCheck.auditRequest?.id,
      },
    };
  }

  // ========================================================================
  // NOTIFICATIONS - REAL-TIME USER NOTIFICATIONS
  // ========================================================================
  
  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(notificationData)
      .returning();
    return notification;
  }

  /**
   * Create a user-scoped notification that doesn't require a workspaceId.
   * Used for platform-wide notifications, global admin alerts, and orchestrator workflows
   * that execute outside of a tenant context.
   */
  async createUserScopedNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    metadata?: any
  ): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId,
        scope: 'user' as any,
        workspaceId: null as any,
        type: type as any,
        title,
        message,
        metadata,
      })
      .returning();
    return notification;
  }

  async getNotificationsByUser(userId: string, workspaceId: string, limit: number = 50): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        isNull(notifications.clearedAt)
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  /**
   * Get all notifications for a user including both workspace-scoped and user-scoped.
   * This is the primary method for fetching notifications in the dual-scope model.
   * Only returns non-cleared notifications (where clearedAt is NULL).
   */
  async getAllNotificationsForUser(userId: string, workspaceId?: string, limit: number = 50): Promise<Notification[]> {
    if (workspaceId) {
      // Include both workspace-scoped for this workspace AND user-scoped notifications
      // Exclude cleared notifications (clearedAt is NULL)
      return await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          isNull(notifications.clearedAt),
          or(
            eq(notifications.workspaceId, workspaceId),
            eq(notifications.scope, 'user' as any)
          )
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
    } else {
      // Only user-scoped notifications (for users without workspace context)
      // Exclude cleared notifications (clearedAt is NULL)
      return await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.scope, 'user' as any),
          isNull(notifications.clearedAt)
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
    }
  }

  async getUnreadNotificationCount(userId: string, workspaceId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.isRead, false),
        isNull(notifications.clearedAt)
      ));
    return result?.count || 0;
  }

  /**
   * Get total unread count including both workspace-scoped and user-scoped notifications.
   * Only counts non-cleared notifications.
   */
  async getTotalUnreadCountForUser(userId: string, workspaceId?: string): Promise<number> {
    if (workspaceId) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          or(
            eq(notifications.workspaceId, workspaceId),
            eq(notifications.scope, 'user' as any)
          ),
          eq(notifications.isRead, false),
          isNull(notifications.clearedAt)
        ));
      return result?.count || 0;
    } else {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.scope, 'user' as any),
          eq(notifications.isRead, false),
          isNull(notifications.clearedAt)
        ));
      return result?.count || 0;
    }
  }

  async markNotificationAsRead(id: string, userId: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ 
        isRead: true, 
        readAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId) // Ensure user can only mark their own notifications
      ))
      .returning();
    return notification;
  }

  async toggleNotificationReadStatus(id: string, userId: string): Promise<Notification | undefined> {
    // First, fetch the notification to get its current state
    const [current] = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ));
    
    if (!current) {
      return undefined;
    }

    // Toggle the read status
    const [notification] = await db
      .update(notifications)
      .set({ 
        isRead: !current.isRead, 
        readAt: !current.isRead ? new Date() : null,
        updatedAt: new Date()
      })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ))
      .returning();
    return notification;
  }

  async markAllNotificationsAsRead(userId: string, workspaceId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ 
        isRead: true, 
        readAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.isRead, false)
      ));
    return result.rowCount || 0;
  }

  async deleteNotification(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(notifications)
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId) // Ensure user can only delete their own notifications
      ));
    return (result.rowCount || 0) > 0;
  }

  async deleteOldNotifications(workspaceId: string, daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db
      .delete(notifications)
      .where(and(
        eq(notifications.workspaceId, workspaceId),
        sql`${notifications.createdAt} < ${cutoffDate}`
      ));
    return result.rowCount || 0;
  }

  async acknowledgeNotification(id: string, userId: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ 
        isRead: true, 
        readAt: new Date(),
        isAcknowledged: true,
        acknowledgedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ))
      .returning();
    return notification;
  }

  async acknowledgeAllNotifications(userId: string, workspaceId?: string, category?: string): Promise<number> {
    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.clearedAt), // Only acknowledge uncleared notifications
    ];
    
    if (workspaceId) {
      conditions.push(eq(notifications.workspaceId, workspaceId));
    }
    
    if (category) {
      conditions.push(eq(notifications.category, category as any));
    }
    
    const result = await db
      .update(notifications)
      .set({ 
        isRead: true, 
        readAt: new Date(),
        isAcknowledged: true,
        acknowledgedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(...conditions));
    return result.rowCount || 0;
  }

  async clearNotification(id: string, userId: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ 
        isRead: true, 
        readAt: new Date(),
        isAcknowledged: true,
        acknowledgedAt: new Date(),
        clearedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ))
      .returning();
    return notification;
  }

  async clearAllNotifications(userId: string, workspaceId?: string, category?: string): Promise<number> {
    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.clearedAt), // Only clear uncleared notifications
    ];
    
    if (workspaceId) {
      conditions.push(eq(notifications.workspaceId, workspaceId));
    }
    
    if (category) {
      conditions.push(eq(notifications.category, category as any));
    }
    
    const result = await db
      .update(notifications)
      .set({ 
        isRead: true, 
        readAt: new Date(),
        isAcknowledged: true,
        acknowledgedAt: new Date(),
        clearedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(...conditions));
    return result.rowCount || 0;
  }

  async getUnclearedNotifications(userId: string, workspaceId?: string, category?: string, limit: number = 50): Promise<Notification[]> {
    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.clearedAt), // Only get uncleared notifications
    ];
    
    if (workspaceId) {
      conditions.push(eq(notifications.workspaceId, workspaceId));
    }
    
    if (category) {
      conditions.push(eq(notifications.category, category as any));
    }
    
    const results = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    
    return results;
  }

  async getUnreadAndUnclearedCount(userId: string, workspaceId?: string): Promise<{ unread: number; uncleared: number }> {
    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.clearedAt), // Only count uncleared notifications
    ];
    
    if (workspaceId) {
      conditions.push(eq(notifications.workspaceId, workspaceId));
    }
    
    const [result] = await db
      .select({
        unread: sql<number>`count(*) filter (where ${notifications.isRead} = false)`,
        uncleared: sql<number>`count(*)`,
      })
      .from(notifications)
      .where(and(...conditions));
    
    return {
      unread: Number(result?.unread || 0),
      uncleared: Number(result?.uncleared || 0),
    };
  }

  async getNotificationPreferences(userId: string, workspaceId: string): Promise<UserNotificationPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.workspaceId, workspaceId)
      ));
    return prefs;
  }

  async createOrUpdateNotificationPreferences(
    userId: string,
    workspaceId: string,
    data: Partial<InsertUserNotificationPreferences>
  ): Promise<UserNotificationPreferences> {
    const [prefs] = await db
      .insert(userNotificationPreferences)
      .values({
        userId,
        workspaceId,
        ...data,
      } as InsertUserNotificationPreferences)
      .onConflictDoUpdate({
        target: [userNotificationPreferences.userId],
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return prefs;
  }

  // ============================================================================
  // PUSH NOTIFICATIONS METHODS - WEB PUSH SUBSCRIPTIONS
  // ============================================================================

  async createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription> {
    const [newSub] = await db
      .insert(pushSubscriptions)
      .values(subscription)
      .returning();
    return newSub;
  }

  async getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]> {
    return await db
      .select()
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.isActive, true)
      ));
  }

  async getPushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<PushSubscription | undefined> {
    const [sub] = await db
      .select()
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint)
      ));
    return sub;
  }

  async updatePushSubscription(id: string, data: Partial<InsertPushSubscription>): Promise<PushSubscription | undefined> {
    const [updated] = await db
      .update(pushSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, id))
      .returning();
    return updated;
  }

  async deletePushSubscription(id: string): Promise<boolean> {
    const result = await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.id, id))
      .returning({ id: pushSubscriptions.id });
    return result.length > 0;
  }

  async deletePushSubscriptionsByUser(userId: string, endpoint?: string): Promise<number> {
    if (endpoint) {
      const result = await db
        .delete(pushSubscriptions)
        .where(and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint)
        ))
        .returning({ id: pushSubscriptions.id });
      return result.length;
    }
    const result = await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .returning({ id: pushSubscriptions.id });
    return result.length;
  }

  async deactivatePushSubscription(id: string): Promise<boolean> {
    const result = await db
      .update(pushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, id))
      .returning({ id: pushSubscriptions.id });
    return result.length > 0;
  }

  // ============================================================================
  // PLATFORM UPDATES METHODS - WHAT'S NEW FEED
  // ============================================================================

  async getPlatformUpdatesWithReadState(userId: string, workspaceId: string, limit: number = 20): Promise<Array<PlatformUpdate & { isViewed: boolean }>> {
    
    // Single SQL query with LEFT JOIN for reliable isViewed computation
    const result = await db.execute(sql`
      SELECT 
        p.*,
        v.id as view_id
      FROM platform_updates p
      LEFT JOIN user_platform_update_views v 
        ON v.update_id = p.id 
        AND v.user_id = ${userId}
      WHERE p.visibility = 'all' 
        OR p.workspace_id IS NULL 
        OR p.workspace_id = ${workspaceId}
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `);
    
    // Map raw SQL result to typed objects - isViewed = true if view_id exists (check for truthy value)
    // Note: view_id comes from LEFT JOIN and will be a string if record exists, null/undefined otherwise
    return (result.rows as any[]).map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      date: row.date,
      version: row.version,
      badge: row.badge,
      isNew: row.is_new,
      priority: row.priority,
      visibility: row.visibility,
      workspaceId: row.workspace_id,
      createdAt: row.created_at,
      isViewed: row.view_id !== null && row.view_id !== undefined && row.view_id !== '',
    }));
  }

  async markPlatformUpdateAsViewed(userId: string, updateId: string): Promise<void> {
    await db
      .insert(userPlatformUpdateViews)
      .values({
        id: `${userId}-${updateId}`,
        userId,
        updateId,
        viewedAt: new Date(),
        viewSource: 'popover',
      })
      .onConflictDoNothing();
  }

  async getUnreadPlatformUpdatesCount(userId: string, workspaceId?: string): Promise<number> {
    // Direct SQL count of unviewed platform updates
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM platform_updates p
      LEFT JOIN user_platform_update_views v 
        ON v.update_id = p.id 
        AND v.user_id = ${userId}
      WHERE v.id IS NULL
        AND (p.visibility = 'all' OR p.workspace_id IS NULL ${workspaceId ? sql`OR p.workspace_id = ${workspaceId}` : sql``})
    `);
    return parseInt((result.rows[0] as any)?.count || '0', 10);
  }

  async markAllPlatformUpdatesAsViewed(userId: string, workspaceId?: string): Promise<number> {
    // Get all unviewed platform updates for this user (no workspace filter - clear ALL)
    const unviewedUpdates = await db
      .select({ id: platformUpdates.id })
      .from(platformUpdates)
      .leftJoin(
        userPlatformUpdateViews,
        and(
          eq(userPlatformUpdateViews.updateId, platformUpdates.id),
          eq(userPlatformUpdateViews.userId, userId)
        )
      )
      .where(
        sql`${userPlatformUpdateViews.viewedAt} IS NULL`
      );

    if (unviewedUpdates.length === 0) return 0;

    // Insert view records for all unviewed updates
    await db
      .insert(userPlatformUpdateViews)
      .values(
        unviewedUpdates.map(u => ({
          id: `${userId}-${u.id}`,
          userId,
          updateId: u.id,
          viewedAt: new Date(),
          viewSource: 'mark_all_read',
        }))
      )
      .onConflictDoNothing();

    return unviewedUpdates.length;
  }

  async markPlatformUpdatesByCategories(userId: string, categories: string[], workspaceId?: string): Promise<number> {
    if (categories.length === 0) return 0;
    
    // Get all unviewed platform updates for this user in the specified categories
    // Using inArray() for proper Drizzle array handling instead of raw SQL ANY()
    // Filter to only updates visible to this user's workspace (global or workspace-specific)
    const unviewedUpdates = await db
      .select({ id: platformUpdates.id })
      .from(platformUpdates)
      .leftJoin(
        userPlatformUpdateViews,
        and(
          eq(userPlatformUpdateViews.updateId, platformUpdates.id),
          eq(userPlatformUpdateViews.userId, userId)
        )
      )
      .where(
        and(
          isNull(userPlatformUpdateViews.viewedAt),
          inArray(platformUpdates.category, categories),
          // Visibility filter: global updates (visibility='all' or no workspace) or user's workspace
          workspaceId 
            ? or(
                eq(platformUpdates.visibility, 'all'),
                isNull(platformUpdates.workspaceId),
                eq(platformUpdates.workspaceId, workspaceId)
              )
            : sql`true` // If no workspaceId provided, mark all matching categories
        )
      );

    if (unviewedUpdates.length === 0) return 0;

    // Insert view records for all unviewed updates in these categories
    await db
      .insert(userPlatformUpdateViews)
      .values(
        unviewedUpdates.map(u => ({
          id: `${userId}-${u.id}`,
          userId,
          updateId: u.id,
          viewedAt: new Date(),
          viewSource: 'clear_tab_system',
        }))
      )
      .onConflictDoNothing();

    return unviewedUpdates.length;
  }

  async createPlatformUpdate(update: InsertPlatformUpdate): Promise<PlatformUpdate> {
    const [result] = await db
      .insert(platformUpdates)
      .values(update)
      .returning();
    return result;
  }

  // ============================================================================
  // AI RESPONSES METHODS
  // ============================================================================

  async createAiResponse(response: InsertAiResponse): Promise<AiResponse> {
    const [result] = await db
      .insert(aiResponses)
      .values(response)
      .returning();
    return result;
  }

  async getAiResponse(id: string): Promise<AiResponse | undefined> {
    const [response] = await db
      .select()
      .from(aiResponses)
      .where(eq(aiResponses.id, id));
    return response;
  }

  async getAiResponsesByWorkspace(
    workspaceId: string,
    filters?: { sourceType?: string; feature?: string; limit?: number; offset?: number }
  ): Promise<AiResponse[]> {
    let query = db
      .select()
      .from(aiResponses)
      .where(eq(aiResponses.workspaceId, workspaceId));

    if (filters?.sourceType) {
      query = query.where(eq(aiResponses.sourceType, filters.sourceType));
    }
    if (filters?.feature) {
      query = query.where(eq(aiResponses.feature, filters.feature));
    }

    query = query.orderBy(desc(aiResponses.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    return await query;
  }

  async getAiResponsesBySource(
    workspaceId: string,
    sourceType: string,
    sourceId: string
  ): Promise<AiResponse[]> {
    return await db
      .select()
      .from(aiResponses)
      .where(and(
        eq(aiResponses.workspaceId, workspaceId),
        eq(aiResponses.sourceType, sourceType),
        eq(aiResponses.sourceId, sourceId)
      ))
      .orderBy(desc(aiResponses.createdAt));
  }

  async updateAiResponse(id: string, data: Partial<InsertAiResponse>): Promise<AiResponse | undefined> {
    const [response] = await db
      .update(aiResponses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(aiResponses.id, id))
      .returning();
    return response;
  }

  async rateAiResponse(id: string, rating: number, feedback?: string): Promise<AiResponse | undefined> {
    const [response] = await db
      .update(aiResponses)
      .set({
        userRating: rating,
        userFeedback: feedback,
        wasHelpful: rating >= 4,
        ratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiResponses.id, id))
      .returning();
    return response;
  }

  // ============================================================================
  // AI SUGGESTIONS METHODS
  // ============================================================================

  async createAiSuggestion(suggestion: InsertAiSuggestion): Promise<AiSuggestion> {
    const [result] = await db
      .insert(aiSuggestions)
      .values(suggestion)
      .returning();
    return result;
  }

  async getAiSuggestion(id: string): Promise<AiSuggestion | undefined> {
    const [suggestion] = await db
      .select()
      .from(aiSuggestions)
      .where(eq(aiSuggestions.id, id));
    return suggestion;
  }

  async getAiSuggestionsByWorkspace(
    workspaceId: string,
    filters?: { status?: string; priority?: string; type?: string; limit?: number; offset?: number }
  ): Promise<AiSuggestion[]> {
    let query = db
      .select()
      .from(aiSuggestions)
      .where(eq(aiSuggestions.workspaceId, workspaceId));

    if (filters?.status) {
      query = query.where(eq(aiSuggestions.status, filters.status));
    }
    if (filters?.priority) {
      query = query.where(eq(aiSuggestions.priority, filters.priority));
    }
    if (filters?.type) {
      query = query.where(eq(aiSuggestions.suggestionType, filters.type));
    }

    query = query.orderBy(desc(aiSuggestions.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    return await query;
  }

  async getActiveSuggestions(workspaceId: string): Promise<AiSuggestion[]> {
    return await db
      .select()
      .from(aiSuggestions)
      .where(and(
        eq(aiSuggestions.workspaceId, workspaceId),
        eq(aiSuggestions.status, 'pending'),
        or(
          isNull(aiSuggestions.expiresAt),
          sql`${aiSuggestions.expiresAt} > now()`
        )
      ))
      .orderBy(desc(aiSuggestions.priority), desc(aiSuggestions.createdAt));
  }

  async updateAiSuggestion(id: string, data: Partial<InsertAiSuggestion>): Promise<AiSuggestion | undefined> {
    const [suggestion] = await db
      .update(aiSuggestions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(aiSuggestions.id, id))
      .returning();
    return suggestion;
  }

  async acceptAiSuggestion(id: string, userId: string): Promise<AiSuggestion | undefined> {
    const [suggestion] = await db
      .update(aiSuggestions)
      .set({
        status: 'accepted',
        acceptedBy: userId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiSuggestions.id, id))
      .returning();
    return suggestion;
  }

  async rejectAiSuggestion(id: string, userId: string, reason?: string): Promise<AiSuggestion | undefined> {
    const [suggestion] = await db
      .update(aiSuggestions)
      .set({
        status: 'rejected',
        rejectedBy: userId,
        rejectionReason: reason,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiSuggestions.id, id))
      .returning();
    return suggestion;
  }

  async implementAiSuggestion(id: string): Promise<AiSuggestion | undefined> {
    const [suggestion] = await db
      .update(aiSuggestions)
      .set({
        status: 'implemented',
        implementedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiSuggestions.id, id))
      .returning();
    return suggestion;
  }

  // ============================================================================
  // USER FEEDBACK PORTAL OPERATIONS
  // ============================================================================

  async createFeedback(feedback: InsertUserFeedback): Promise<UserFeedback> {
    const [result] = await db
      .insert(userFeedback)
      .values(feedback)
      .returning();
    return result;
  }

  async getFeedback(id: string): Promise<UserFeedback | undefined> {
    const [result] = await db
      .select()
      .from(userFeedback)
      .where(eq(userFeedback.id, id));
    return result;
  }

  async getFeedbackList(filters?: { 
    type?: string; 
    status?: string; 
    priority?: string; 
    workspaceId?: string; 
    userId?: string; 
    sortBy?: string; 
    sortOrder?: 'asc' | 'desc'; 
    limit?: number; 
    offset?: number 
  }): Promise<UserFeedback[]> {
    const conditions: any[] = [];
    
    if (filters?.type) {
      conditions.push(eq(userFeedback.type, filters.type as any));
    }
    if (filters?.status) {
      conditions.push(eq(userFeedback.status, filters.status as any));
    }
    if (filters?.priority) {
      conditions.push(eq(userFeedback.priority, filters.priority as any));
    }
    if (filters?.workspaceId) {
      conditions.push(eq(userFeedback.workspaceId, filters.workspaceId));
    }
    if (filters?.userId) {
      conditions.push(eq(userFeedback.userId, filters.userId));
    }
    
    let query = db.select().from(userFeedback);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const sortOrder = filters?.sortOrder === 'asc' ? 'asc' : 'desc';
    if (filters?.sortBy === 'votes') {
      query = sortOrder === 'desc' 
        ? query.orderBy(desc(userFeedback.upvoteCount)) as any
        : query.orderBy(userFeedback.upvoteCount) as any;
    } else if (filters?.sortBy === 'createdAt') {
      query = sortOrder === 'desc'
        ? query.orderBy(desc(userFeedback.createdAt)) as any
        : query.orderBy(userFeedback.createdAt) as any;
    } else {
      query = query.orderBy(desc(userFeedback.createdAt)) as any;
    }
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }
    
    return await query;
  }

  async updateFeedback(id: string, data: Partial<InsertUserFeedback>): Promise<UserFeedback | undefined> {
    const [result] = await db
      .update(userFeedback)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userFeedback.id, id))
      .returning();
    return result;
  }

  async updateFeedbackStatus(id: string, status: string, updatedBy: string, note?: string): Promise<UserFeedback | undefined> {
    const [result] = await db
      .update(userFeedback)
      .set({
        status: status as any,
        statusUpdatedBy: updatedBy,
        statusUpdatedAt: new Date(),
        statusNote: note,
        updatedAt: new Date(),
      })
      .where(eq(userFeedback.id, id))
      .returning();
    return result;
  }

  async deleteFeedback(id: string): Promise<boolean> {
    const result = await db
      .delete(userFeedback)
      .where(eq(userFeedback.id, id));
    return true;
  }

  async createFeedbackComment(comment: InsertFeedbackComment): Promise<FeedbackComment> {
    const [result] = await db
      .insert(feedbackComments)
      .values(comment)
      .returning();
    
    await db
      .update(userFeedback)
      .set({ 
        commentCount: sql`${userFeedback.commentCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(userFeedback.id, comment.feedbackId));
    
    return result;
  }

  async getFeedbackComments(feedbackId: string): Promise<FeedbackComment[]> {
    return await db
      .select()
      .from(feedbackComments)
      .where(eq(feedbackComments.feedbackId, feedbackId))
      .orderBy(feedbackComments.createdAt);
  }

  async deleteFeedbackComment(id: string): Promise<boolean> {
    const [comment] = await db
      .select()
      .from(feedbackComments)
      .where(eq(feedbackComments.id, id));
    
    if (comment) {
      await db.delete(feedbackComments).where(eq(feedbackComments.id, id));
      await db
        .update(userFeedback)
        .set({ 
          commentCount: sql`GREATEST(${userFeedback.commentCount} - 1, 0)`,
          updatedAt: new Date()
        })
        .where(eq(userFeedback.id, comment.feedbackId));
    }
    return true;
  }

  async voteFeedback(feedbackId: string, userId: string, voteType: 'up' | 'down'): Promise<{ feedback: UserFeedback; userVote: string | null }> {
    const existingVote = await this.getUserFeedbackVote(feedbackId, userId);
    
    if (existingVote) {
      if (existingVote.voteType === voteType) {
        await db
          .delete(feedbackVotes)
          .where(eq(feedbackVotes.id, existingVote.id));
        
        const updateField = voteType === 'up' ? userFeedback.upvoteCount : userFeedback.downvoteCount;
        await db
          .update(userFeedback)
          .set({ 
            [voteType === 'up' ? 'upvoteCount' : 'downvoteCount']: sql`GREATEST(${updateField} - 1, 0)`,
            updatedAt: new Date()
          })
          .where(eq(userFeedback.id, feedbackId));
        
        const [feedback] = await db.select().from(userFeedback).where(eq(userFeedback.id, feedbackId));
        return { feedback, userVote: null };
      } else {
        await db
          .update(feedbackVotes)
          .set({ voteType })
          .where(eq(feedbackVotes.id, existingVote.id));
        
        const increaseField = voteType === 'up' ? 'upvoteCount' : 'downvoteCount';
        const decreaseField = voteType === 'up' ? 'downvoteCount' : 'upvoteCount';
        
        await db
          .update(userFeedback)
          .set({ 
            [increaseField]: sql`${voteType === 'up' ? userFeedback.upvoteCount : userFeedback.downvoteCount} + 1`,
            [decreaseField]: sql`GREATEST(${voteType === 'up' ? userFeedback.downvoteCount : userFeedback.upvoteCount} - 1, 0)`,
            updatedAt: new Date()
          })
          .where(eq(userFeedback.id, feedbackId));
        
        const [feedback] = await db.select().from(userFeedback).where(eq(userFeedback.id, feedbackId));
        return { feedback, userVote: voteType };
      }
    } else {
      await db
        .insert(feedbackVotes)
        .values({ feedbackId, userId, voteType });
      
      const updateField = voteType === 'up' ? userFeedback.upvoteCount : userFeedback.downvoteCount;
      await db
        .update(userFeedback)
        .set({ 
          [voteType === 'up' ? 'upvoteCount' : 'downvoteCount']: sql`${updateField} + 1`,
          updatedAt: new Date()
        })
        .where(eq(userFeedback.id, feedbackId));
      
      const [feedback] = await db.select().from(userFeedback).where(eq(userFeedback.id, feedbackId));
      return { feedback, userVote: voteType };
    }
  }

  async getUserFeedbackVote(feedbackId: string, userId: string): Promise<FeedbackVote | undefined> {
    const [vote] = await db
      .select()
      .from(feedbackVotes)
      .where(and(
        eq(feedbackVotes.feedbackId, feedbackId),
        eq(feedbackVotes.userId, userId)
      ));
    return vote;
  }

  // ============================================================================
  // MASCOT MOTION PROFILES - AI BRAIN ORCHESTRATED MOTION PATTERNS
  // ============================================================================

  async createMascotMotionProfile(profile: InsertMascotMotionProfile): Promise<MascotMotionProfile> {
    const [created] = await db.insert(mascotMotionProfiles).values(profile).returning();
    return created;
  }

  async getMascotMotionProfile(id: string): Promise<MascotMotionProfile | undefined> {
    const [profile] = await db.select().from(mascotMotionProfiles).where(eq(mascotMotionProfiles.id, id));
    return profile;
  }

  async getMascotMotionProfileByName(name: string): Promise<MascotMotionProfile | undefined> {
    const [profile] = await db.select().from(mascotMotionProfiles).where(eq(mascotMotionProfiles.name, name));
    return profile;
  }

  async getAllMascotMotionProfiles(): Promise<MascotMotionProfile[]> {
    return await db.select().from(mascotMotionProfiles).orderBy(mascotMotionProfiles.name);
  }

  async getActiveMascotMotionProfiles(): Promise<MascotMotionProfile[]> {
    return await db.select().from(mascotMotionProfiles).where(eq(mascotMotionProfiles.isActive, true)).orderBy(mascotMotionProfiles.name);
  }

  async updateMascotMotionProfile(id: string, data: Partial<InsertMascotMotionProfile>): Promise<MascotMotionProfile | undefined> {
    const [updated] = await db.update(mascotMotionProfiles).set({ ...data, updatedAt: new Date() }).where(eq(mascotMotionProfiles.id, id)).returning();
    return updated;
  }

  async deleteMascotMotionProfile(id: string): Promise<boolean> {
    await db.delete(mascotMotionProfiles).where(eq(mascotMotionProfiles.id, id));
    return true;
  }

  // ============================================================================
  // HOLIDAY MASCOT DECORATIONS - AI BRAIN ORCHESTRATED HOLIDAY VISUALS
  // ============================================================================

  async createHolidayMascotDecor(decor: InsertHolidayMascotDecor): Promise<HolidayMascotDecor> {
    const [created] = await db.insert(holidayMascotDecor).values(decor).returning();
    return created;
  }

  async getHolidayMascotDecor(id: string): Promise<HolidayMascotDecor | undefined> {
    const [decor] = await db.select().from(holidayMascotDecor).where(eq(holidayMascotDecor.id, id));
    return decor;
  }

  async getHolidayMascotDecorByKey(holidayKey: string): Promise<HolidayMascotDecor | undefined> {
    const [decor] = await db.select().from(holidayMascotDecor).where(eq(holidayMascotDecor.holidayKey, holidayKey));
    return decor;
  }

  async getAllHolidayMascotDecor(): Promise<HolidayMascotDecor[]> {
    return await db.select().from(holidayMascotDecor).orderBy(holidayMascotDecor.holidayName);
  }

  async getActiveHolidayMascotDecor(): Promise<HolidayMascotDecor[]> {
    return await db.select().from(holidayMascotDecor).where(eq(holidayMascotDecor.isActive, true)).orderBy(holidayMascotDecor.holidayName);
  }

  async updateHolidayMascotDecor(id: string, data: Partial<InsertHolidayMascotDecor>): Promise<HolidayMascotDecor | undefined> {
    const [updated] = await db.update(holidayMascotDecor).set({ ...data, updatedAt: new Date() }).where(eq(holidayMascotDecor.id, id)).returning();
    return updated;
  }

  async deleteHolidayMascotDecor(id: string): Promise<boolean> {
    await db.delete(holidayMascotDecor).where(eq(holidayMascotDecor.id, id));
    return true;
  }

  // ============================================================================
  // HOLIDAY MASCOT HISTORY - AI BRAIN DIRECTIVE AUDIT TRAIL
  // ============================================================================

  async createHolidayMascotHistory(history: InsertHolidayMascotHistory): Promise<HolidayMascotHistory> {
    const [created] = await db.insert(holidayMascotHistory).values(history).returning();
    return created;
  }

  async getHolidayMascotHistory(filters?: { holidayDecorId?: string; action?: string; triggeredBy?: string; limit?: number }): Promise<HolidayMascotHistory[]> {
    let query = db.select().from(holidayMascotHistory).$dynamic();
    
    const conditions = [];
    if (filters?.holidayDecorId) {
      conditions.push(eq(holidayMascotHistory.holidayDecorId, filters.holidayDecorId));
    }
    if (filters?.action) {
      conditions.push(eq(holidayMascotHistory.action, filters.action));
    }
    if (filters?.triggeredBy) {
      conditions.push(eq(holidayMascotHistory.triggeredBy, filters.triggeredBy));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(desc(holidayMascotHistory.createdAt));
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    return await query;
  }

  async getLatestHolidayDirective(): Promise<HolidayMascotHistory | undefined> {
    const [latest] = await db
      .select()
      .from(holidayMascotHistory)
      .where(eq(holidayMascotHistory.action, 'activate'))
      .orderBy(desc(holidayMascotHistory.createdAt))
      .limit(1);
    return latest;
  }
}

export const storage = new DatabaseStorage();
