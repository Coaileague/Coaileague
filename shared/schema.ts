/**
 * SCHEMA AUDIT NOTES (2024-10-14)
 * 
 * TASK 2: Enum Value Consistency
 * - shiftStatusEnum (enums.ts:68) uses 'cancelled'.
 * - shiftActionStatusEnum (enums.ts:393) uses both 'canceled' and 'cancelled'.
 * - Codebase search: 'cancelled' (approx 466 occurrences) vs 'canceled' (approx 2 occurrences).
 * - Recommendation: Standardize on 'cancelled' (British spelling) in future migrations, but do not change now to avoid breaking existing data.
 * 
 * TASK 3: timestamp vs timestamptz
 * - Total timestamp() columns: ~120 (timezone-naive).
 * - Risk: Stored UTC times lose original timezone context. For night shifts crossing midnight (e.g., 22:00-06:00), 
 *   naive timestamps can lead to "off-by-one-day" errors if local vs UTC transitions aren't handled perfectly in the app layer.
 * - High-Risk Columns: 
 *   - shifts.startTime, shifts.endTime (Scheduling)
 *   - payrollRuns.periodStart, payrollRuns.periodEnd (Payroll)
 *   - invoices.issueDate, invoices.dueDate (Billing)
 * - Recommendation: Migrate to timestamptz() in a future major schema overhaul.
 * 
 * TASK 4: NOT NULL Constraints Audit
 * - employees.workspaceId: Already NOT NULL.
 * - shifts.employeeId: Nullable. LOGIC: Should remain nullable to support "Open/Unassigned" shifts.
 * - invoices.clientId: Already NOT NULL.
 */

// CoAIleague Schema — Thin Barrel
// All table definitions live in their canonical domain files.
// Import from '@shared/schema/domains/[domain]' for domain-specific access.
// Import from '@shared/schema' for backwards compatibility (re-exports everything).
//
// Domain files: shared/schema/domains/[domain]/index.ts
// Enums: shared/schema/enums.ts
// Relations: shared/schema/relations.ts
// Contract: shared/schema/domains/DOMAIN_CONTRACT.ts

// Re-export enums
export * from './schema/enums';

// Re-export all Drizzle relation definitions (required for db.query.xxx relational API)
export * from './schema/relations';

// Re-export all 16 domain table collections
export * from './schema/domains/auth';
export * from './schema/domains/orgs';
export * from './schema/domains/workforce';
export * from './schema/domains/scheduling';
export * from './schema/domains/time';
export * from './schema/domains/payroll';
export * from './schema/domains/billing';
export * from './schema/domains/trinity';
export * from './schema/domains/comms';
export * from './schema/domains/clients';
export * from './schema/domains/compliance';
export * from './schema/domains/audit';
export * from './schema/domains/support';
export * from './schema/domains/sales';
export * from './schema/domains/ops';
export * from './schema/domains/sps';
export * from './schema/domains/training';
export * from './schema/domains/recruitment';

import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// auth tables (used in insert schema definitions below)
import {
  apiKeys,
  platformRoles,
  roleTemplates,
  integrationApiKeys,
  idempotencyKeys,
  oauthStates,
  externalIdentifiers,
  idSequences,
  idRegistry,
  userDeviceProfiles,
  sessionCheckpoints,
  sessionRecoveryRequests,
  userAutomationConsents,
  accessPolicies,
  workspaceApiKeys,
  apiKeyUsageLogs,
  managedApiKeys,
  sessions,
  users,
  passwordResetAuditLog,
} from './schema/domains/auth';

// orgs tables (used in insert schema definitions below)
import {
  userOnboarding,
  workspaceMembers,
  onboardingInvites,
  onboardingApplications,
  onboardingWorkflowTemplates,
  featureFlags,
  integrationMarketplace,
  integrationConnections,
  webhookSubscriptions,
  promotionalBanners,
  onboardingTemplates,
  onboardingTasks,
  organizationOnboarding,
  organizationRoomOnboarding,
  workspaceAddons,
  featureUpdates,
  featureUpdateReceipts,
  orgInvitations,
  interactiveOnboardingState,
  orgDocuments,
  orgDocumentAccess,
  industryServiceTemplates,
  workspaceServiceCatalog,
  orgFeatures,
  workspaces,
  onboardingChecklists,
  orgOnboardingTasks,
  orgRewards,
} from './schema/domains/orgs';

// workforce tables (used in insert schema definitions below)
import {
  employeeSkills,
  contractorPool,
  contractorSkills,
  contractorAssignments,
  performanceReviews,
  managerAssignments,
  employeeDocuments,
  turnoverRiskScores,
  skillGapAnalyses,
  pulseSurveyTemplates,
  pulseSurveyResponses,
  anonymousSuggestions,
  employeeHealthScores,
  offboardingSessions,
  exitInterviewResponses,
  employeeAvailability,
  satisfactionSurveys,
  achievements,
  employeeAchievements,
  employeePoints,
  leaderboardCache,
  coaileagueEmployeeProfiles,
  employeeEventLog,
  personalityTagsCatalog,
  userFeedback,
  feedbackComments,
  feedbackVotes,
  flexContractors,
  flexAvailability,
  flexGigs,
  flexGigApplications,
  flexGigRatings,
  knownContractors,
  employees,
  employeeInvitations,
  trainingScenarios,
  trainingRuns,
  trainingCourses,
  trainingEnrollments,
  engagementScoreHistory,
} from './schema/domains/workforce';

// scheduling tables (used in insert schema definitions below)
import {
  schedules,
  shiftRequests,
  shiftOffers,
  shifts,
  customSchedulerIntervals,
  recurringShiftPatterns,
  shiftSwapRequests,
  scheduleTemplates,
  shiftAcknowledgments,
  serviceCoverageRequests,
  publishedSchedules,
  scheduleSnapshots,
  scheduleProposals,
  shiftTemplates,
  smartScheduleUsage,
  shiftOrders,
  shiftOrderAcknowledgments,
  internalBids,
  bidApplications,
  capacityAlerts,
  shiftActions,
  shiftAcceptanceRecords,
  schedulerNotificationEvents,
  calendarSubscriptions,
  calendarImports,
  shiftChatrooms,
  shiftChatroomMembers,
  shiftChatroomMessages,
  shiftCoverageRequests,
  shiftCoverageOffers,
  stagedShifts,
  automatedShiftOffers,
  staffingClaimTokens,
  shiftCoverageClaims,
} from './schema/domains/scheduling';

// time tables (used in insert schema definitions below)
import {
  ptoRequests,
  timeEntries,
  timeEntryAuditEvents,
  gpsLocations,
  scheduledBreaks,
  evvVisitRecords,
  manualClockinOverrides,
  timeEntryBreaks,
  timeEntryDiscrepancies,
  timeOffRequests,
  timesheetEditRequests,
  mileageLogs,
} from './schema/domains/time';

export { mileageLogs };

// payroll tables (used in insert schema definitions below)
import {
  employeeBenefits,
  payrollProposals,
  offCyclePayrollRuns,
  payrollRuns,
  payrollEntries,
  employeePayrollInfo,
  employeeRateHistory,
  laborLawRules,
  workerTaxClassificationHistory,
  multiStateComplianceWindows,
  payStubs,
  deductionConfigs,
  payrollProviderConnections,
} from './schema/domains/payroll';

// billing tables (used in insert schema definitions below)
import {
  invoices,
  invoiceLineItems,
  paymentRecords,
  orgLedger,
  exchangeRates,
  subscriptions,
  platformRevenue,
  costVariancePredictions,
  expenseCategories,
  expenses,
  expenseReceipts,
  budgets,
  budgetLineItems,
  budgetVariances,
  disputes,
  paymentReminders,
  billingAddons,
  aiTokenWallets,
  subscriptionInvoices,
  subscriptionLineItems,
  subscriptionPayments,
  billingAuditLog,
  workspaceRateHistory,
  quickbooksMigrationRuns,
  quickbooksOnboardingFlows,
  quickbooksApiUsage,
  billingPolicyProfiles,
  usageAggregates,
  commitmentLedger,
  trinityCreditPackages,
  trinityCredits,
  trinityCreditCosts,
  quickbooksSyncReceipts,
  billingServices,
  evvBillingCodes,
  locationPnlSnapshots,
  reconciliationFindings,
  reconciliationRuns,
  financialSnapshots,
  clientProfitability,
  financialAlerts,
  subscriptionTiers,
  addonFeatures,
  orgSubscriptions,
  upsellEvents,
  featureAddons,
  accountFreezes,
  freezeAppeals,
  orgFinanceSettings,
  creditBalances,
  financialProcessingFees,
  platformInvoices,
  usageCaps,
  platformCreditPool,
  pointsTransactions,
} from './schema/domains/billing';

// trinity tables (used in insert schema definitions below)
import {
  workspaceAiUsage,
  customRules,
  ruleExecutionLogs,
  aiInsights,
  aiUsageEvents,
  aiUsageDailyRollups,
  exceptionTriageQueue,
  aiBrainJobs,
  aiCheckpoints,
  scoringWeightProfiles,
  aiSuggestions,
  stagedCodeChanges,
  codeChangeBatches,
  orchestrationRuns,
  orchestrationRunSteps,
  workflowArtifacts,
  quickFixActions,
  quickFixRolePolicies,
  quickFixRequests,
  quickFixExecutions,
  aiSubagentDefinitions,
  trinityAccessControl,
  subagentTelemetry,
  trinityUnlockCodes,
  automationActionLedger,
  trinityConversationSessions,
  trinityConversationTurns,
  aiApprovals,
  entityAttributes,
  aiLearningEvents,
  automationGovernance,
  trinityThoughtSignatures,
  trinityActionLogs,
  trinityUserConfidenceStats,
  trinityOrgStats,
  orchestrationOverlays,
  aiGapFindings,
  trinitySelfAwareness,
  aiBrainLiveEvents,
  automationExecutions,
  trinityAutomationSettings,
  trinityAutomationRequests,
  trinityAutomationReceipts,
  trinityBuddySettings,
  trinityMetacognitionLog,
  trinityDecisionLog,
  trinityRuntimeFlags,
  trinityRuntimeFlagChanges,
  trinityRequests,
  trinityUsageAnalytics,
  trinityRecommendations,
  aiModels,
  aiTaskTypes,
  aiTaskQueue,
  aiModelHealth,
  pendingConfigurations,
  executionPipelineLogs,
  trinityAnomalyLog,
  metaCognitionLogs,
  durableJobQueue,
  trinityKnowledgeBase,
  trinityCreditTransactions,
  trinityMeetingRecordings,
} from './schema/domains/trinity';

// Phase 8 — notification delivery tracking
import { notificationDeliveries } from './schema/domains/notifications-delivery';
export { notificationDeliveries };

// comms tables (used in insert schema definitions below)
import {
  userMascotPreferences,
  chatConversations,
  chatMessages,
  messageReactions,
  messageReadReceipts,
  chatMacros,
  typingIndicators,
  chatUploads,
  roomEvents,
  dmAuditRequests,
  dmAccessLogs,
  conversationEncryptionKeys,
  chatParticipants,
  blockedContacts,
  conversationUserState,
  messageDeletedFor,
  emailTemplates,
  emailSends,
  emailSequences,
  sequenceSends,
  motdMessages,
  motdAcknowledgment,
  chatAgreementAcceptances,
  organizationChatRooms,
  organizationChatChannels,
  organizationRoomMembers,
  notifications,
  pushSubscriptions,
  userNotificationPreferences,
  chatConnections,
  emailEvents,
  emailUnsubscribes,
  internalMailboxes,
  internalEmailFolders,
  internalEmails,
  internalEmailRecipients,
  roomAnalytics,
  roomAnalyticsTimeseries,
  mascotMotionProfiles,
  holidayMascotDecor,
  holidayMascotHistory,
  externalEmailsSent,
  emailDrafts,
  contractorCommunications,
  inboundEmails,
  broadcasts,
  broadcastRecipients,
  broadcastFeedback,
  channelBridges,
  bridgeConversations,
  bridgeMessages,
  trinityEmailConversations,
} from './schema/domains/comms';

// clients tables (used in insert schema definitions below)
import {
  clients,
  subClients,
  postOrderTemplates,
  clientRates,
  contacts,
  partnerConnections,
  sites,
  siteContacts,
  businessLocations,
  clientContracts,
  clientContractAuditLog,
  clientContractAccessTokens,
  clientContractPipelineUsage,
  clientPortalReports,
  clientPortalInviteTokens,
  siteBriefings,
  slaContracts,
} from './schema/domains/clients';

// compliance tables (used in insert schema definitions below)
import {
  securityIncidents,
  documentSignatures,
  companyPolicies,
  policyAcknowledgments,
  documentAccessLogs,
  governanceApprovals,
  customForms,
  customFormSubmissions,
  termsAcknowledgments,
  serviceIncidentReports,
  complianceReports,
  orgDocumentSignatures,
  darReports,
  complianceStates,
  complianceDocumentTypes,
  complianceRequirements,
  complianceDocuments,
  complianceApprovals,
  complianceExpirations,
  complianceAlerts,
  regulatorAccess,
  complianceScores,
  complianceChecklists,
  officerReadiness,
  officerComplaints,
  officerGrievances,
  complianceWindows,
  documentRetentionLog,
  complianceRegistryEntries,
  stateLicenseVerifications,
  documentTemplates,
  documentInstances,
  signatures,
  documentVault,
  incidentReports,
  rmsCases,
  abuseViolations,
  trainingCertifications,
  backgroundCheckProviders,
  employeeBackgroundChecks,
} from './schema/domains/compliance';

// audit tables (used in insert schema definitions below)
import {
  leaderActions,
  auditLogs,
  reportTemplates,
  reportSubmissions,
  reportWorkflowConfigs,
  reportApprovalSteps,
  lockedReportRecords,
  reportAttachments,
  customerReportAccess,
  kpiAlerts,
  kpiAlertTriggers,
  benchmarkMetrics,
  employerRatings,
  employerBenchmarkScores,
  webhookDeliveries,
  autoReports,
  searchQueries,
  metricsSnapshots,
  userPlatformUpdateViews,
  auditProofPacks,
  rateThrottleLogs,
  oversightEvents,
  writeAheadLog,
  alertConfigurations,
  alertHistory,
  platformScanSnapshots,
  platformChangeEvents,
  featureUsageEvents,
  apiUsageEvents,
  platformAwarenessEvents,
  backupRecords,
  officerScoreEvents,
  auditorAccounts,
  auditSessions,
  auditorDocumentRequests,
  auditFindings,
  auditorFollowups,
  auditorDocumentSafe,
  platformConfigSnapshots,
  platformConfigAudit,
  savedReports,
  universalAuditTrail,
  reportAuditTrail,
  activities,
  alertRules,
} from './schema/domains/audit';

// support tables (used in insert schema definitions below)
import {
  escalationTickets,
  supportSessions,
  supportTickets,
  helposFaqs,
  faqVersions,
  faqGapEvents,
  faqSearchHistory,
  helpOsQueue,
  supportRooms,
  supportTicketAccess,
  knowledgeArticles,
  knowledgeQueries,
  platformUpdates,
  supportRegistry,
  helposAiSessions,
  helposAiTranscriptEntries,
  helpaiRegistry,
  helpaiIntegrations,
  helpaiCredentials,
  helpaiAuditLog,
  helpaiSessions,
  helpaiActionLog,
  helpaiSafetyCodes,
  serviceControlStates,
  supportInterventions,
  supportSessionElevations,
  knowledgeGapLogs,
  knowledgeEntities,
  knowledgeRelationships,
  platformConfigRegistry,
} from './schema/domains/support';

// sales tables (used in insert schema definitions below)
import {
  leads,
  deals,
  rfps,
  proposals,
  dealTasks,
  testimonials,
  clientProspects,
  pipelineDeals,
  rfpDocuments,
} from './schema/domains/sales';

// ops tables (used in insert schema definitions below)
import {
  assets,
  assetSchedules,
  assetUsageLogs,
  maintenanceAlerts,
  maintenanceAcknowledgments,
  dispatchIncidents,
  dispatchAssignments,
  unitStatuses,
  dispatchLogs,
  agentIdentities,
  equipmentItems,
  equipmentAssignments,
  equipmentMaintenanceLogs,
  weapons,
  weaponCheckouts,
  guardTours,
  guardTourCheckpoints,
  guardTourScans,
  vehicles,
  vehicleAssignments,
  vehicleMaintenance,
  panicAlerts,
  loneWorkerSessions,
  boloAlerts,
  lostFoundItems,
  visitorLogs,
  cadCalls,
  cadUnits,
  cadDispatchLog,
  geofenceZones,
  geofenceDepartureLog,
  escalationChains,
  keyControlLogs,
  evidenceItems,
  evidenceCustodyLog,
  incidentReportActivity,
  trespassNotices,
  dailyActivityReports,
  slaBreachLog,
  anonymousReports,
  orchestratedSwapRequests,
} from './schema/domains/ops';

// Insert schemas and types from legacy barrel files.
// NOTE: Do NOT change to "export * from" — that would conflict with domain table exports.
// Only re-export the non-table, non-enum exports (insert schemas + types).
export {
  insertAuthTokenSchema,
  insertAuthSessionSchema,
} from './schema/auth';
export type {
  User, UpsertUser, AuthToken, InsertAuthToken, AuthSession, InsertAuthSession,
} from './schema/auth';

export {
  insertWorkspaceSchema,
  insertEmployeeSchema,
  insertWorkspaceThemeSchema,
  insertWorkspaceInviteSchema,
} from './schema/core';
export type {
  Workspace, InsertWorkspace,
  Employee, InsertEmployee,
  WorkspaceTheme, InsertWorkspaceTheme,
  WorkspaceInvite, InsertWorkspaceInvite,
} from './schema/core';

// Keep any non-table/enum/relation exports from the original schema
// (insert schemas, types, etc. are preserved below)

// Multi-tenant SaaS Scheduling Portal Schema
// Reference: javascript_log_in_with_replit and javascript_database blueprints

// ============================================================================
// ============================================================================

export const insertUserOnboardingSchema = createInsertSchema(userOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserOnboarding = z.infer<typeof insertUserOnboardingSchema>;
export type UserOnboarding = typeof userOnboarding.$inferSelect;

// User Mascot Preferences - Per-user isolated mascot settings

export const insertUserMascotPreferencesSchema = createInsertSchema(userMascotPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserMascotPreferences = z.infer<typeof insertUserMascotPreferencesSchema>;
export type UserMascotPreferences = typeof userMascotPreferences.$inferSelect;

// ============================================================================
// MULTI-TENANT CORE TABLES
// ============================================================================

// Business category enum - determines available forms and features

// ============================================================================

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;


export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;

// ROLE HIERARCHY ENUMS
// ============================================================================

// Platform Support Staff Roles (CoAIleague Internal Team - Platform Level)
// Root Admin → Deputy Admin → SysOp / Support Manager → Support Agent / Compliance Officer
// These roles manage the PLATFORM ITSELF, not individual client organizations

// Organization/Tenant Roles (Subscriber Companies - Tenant Level)
// 5-Tier Hierarchy: Org Owner → Co-Owner → Manager → Supervisor → Employee
// ============================================================================
// ORGANIZATION LEADER CAPABILITIES (Self-Service Admin Features)
// ============================================================================

// Granular capabilities for organization leaders (Owner/Manager)

// Leader action tracking (specialized audit log for self-service admin actions)


export const insertLeaderActionSchema = createInsertSchema(leaderActions).omit({
  id: true,
  createdAt: true,
});

export type InsertLeaderAction = z.infer<typeof insertLeaderActionSchema>;
export type LeaderAction = typeof leaderActions.$inferSelect;

// Escalation tickets (Leaders → Platform Support)



export const insertEscalationTicketSchema = createInsertSchema(escalationTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEscalationTicket = z.infer<typeof insertEscalationTicketSchema>;
export type EscalationTicket = typeof escalationTickets.$inferSelect;

// ============================================================================
// EMPLOYEE & CLIENT TABLES
// ============================================================================

// ============================================================================
// EMPLOYEE SCORING & AI AUTOMATION TABLES
// ============================================================================

// Employee Skills (for AI scoring and matching)

export const insertEmployeeSkillSchema = createInsertSchema(employeeSkills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeSkill = z.infer<typeof insertEmployeeSkillSchema>;
export type EmployeeSkill = typeof employeeSkills.$inferSelect;

// NOTE: employeeCertifications table already exists for onboarding/compliance at line 2516

// Employee Performance Metrics (for AI scoring) - stub for code compat

// ============================================================================
// UNIVERSAL DATA MIGRATION SYSTEM
// ============================================================================

// ============================================================================
// CONTRACTOR POOL & MARKETPLACE TABLES
// ============================================================================

// Contractor Pool (external workers available for Fill Request)

export const insertContractorPoolSchema = createInsertSchema(contractorPool).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractorPool = z.infer<typeof insertContractorPoolSchema>;
export type ContractorPool = typeof contractorPool.$inferSelect;

// Contractor Skills

export const insertContractorSkillSchema = createInsertSchema(contractorSkills).omit({
  id: true,
  createdAt: true,
});

export type InsertContractorSkill = z.infer<typeof insertContractorSkillSchema>;
export type ContractorSkill = typeof contractorSkills.$inferSelect;

// ============================================================================
// CONTRACTOR METRICS — Per-period performance data for 1099 contractors
// ============================================================================

// Contractor Certifications

export const insertShiftRequestSchema = createInsertSchema(shiftRequests).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertShiftRequest = z.infer<typeof insertShiftRequestSchema>;
export type ShiftRequest = typeof shiftRequests.$inferSelect;

// Shift Offers (sent to contractors)

// Contractor assignments - Keeps contractors separate from employees

export const insertContractorAssignmentSchema = createInsertSchema(contractorAssignments).omit({
  id: true,
  createdAt: true,
  assignedAt: true,
});
export type InsertContractorAssignment = z.infer<typeof insertContractorAssignmentSchema>;
export type ContractorAssignment = typeof contractorAssignments.$inferSelect;

export const insertShiftOfferSchema = createInsertSchema(shiftOffers).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});

export type InsertShiftOffer = z.infer<typeof insertShiftOfferSchema>;
export type ShiftOffer = typeof shiftOffers.$inferSelect;

// Employee Benefits (Insurance, 401k, PTO, etc.)



export const insertEmployeeBenefitSchema = createInsertSchema(employeeBenefits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeBenefit = z.infer<typeof insertEmployeeBenefitSchema>;
export type EmployeeBenefit = typeof employeeBenefits.$inferSelect;

// Performance Reviews (HR Management)


export const insertPerformanceReviewSchema = createInsertSchema(performanceReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPerformanceReview = z.infer<typeof insertPerformanceReviewSchema>;
export type PerformanceReview = typeof performanceReviews.$inferSelect;

// PTO Requests (Paid Time Off / Vacation Management)


export const insertPtoRequestSchema = createInsertSchema(ptoRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPtoRequest = z.infer<typeof insertPtoRequestSchema>;
export type PtoRequest = typeof ptoRequests.$inferSelect;

// Employee Terminations — types re-exported from workforce domain (employeeTerminations pgTable)

// Clients (End customers of the workspace/business)

export const insertClientPortalInviteTokenSchema = createInsertSchema(clientPortalInviteTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientPortalInviteToken = z.infer<typeof insertClientPortalInviteTokenSchema>;
export type ClientPortalInviteToken = typeof clientPortalInviteTokens.$inferSelect;

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  phone: z.string().regex(/^[+]?[0-9\s-().]{7,15}$/, "Invalid phone number").optional().or(z.literal("")),
  billableRate: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export const CLIENT_CATEGORIES = {
  bar_nightclub: { label: "Bar / Nightclub", description: "Bars, clubs, lounges — 51%+ alcohol revenue", riskLevel: "high" },
  restaurant: { label: "Restaurant", description: "Restaurants, cafes, food service — may serve alcohol", riskLevel: "moderate" },
  hotel_lodging: { label: "Hotel / Lodging", description: "Hotels, motels, resorts, extended stay", riskLevel: "moderate" },
  residential: { label: "Residential", description: "Apartments, condos, HOA communities, gated neighborhoods", riskLevel: "low" },
  retail: { label: "Retail", description: "Stores, malls, shopping centers", riskLevel: "moderate" },
  corporate: { label: "Corporate / Office", description: "Office buildings, corporate campuses, multi-location orgs", riskLevel: "low" },
  healthcare: { label: "Healthcare", description: "Hospitals, clinics, medical centers, pharmacies", riskLevel: "moderate" },
  education: { label: "Education", description: "Schools, universities, campuses, training facilities", riskLevel: "moderate" },
  industrial: { label: "Industrial / Warehouse", description: "Warehouses, factories, distribution centers, plants", riskLevel: "moderate" },
  construction: { label: "Construction", description: "Construction sites, development projects, job trailers", riskLevel: "high" },
  government: { label: "Government", description: "Government buildings, courthouses, public facilities", riskLevel: "moderate" },
  financial: { label: "Financial", description: "Banks, credit unions, financial institutions", riskLevel: "high" },
  event_venue: { label: "Event Venue", description: "Convention centers, arenas, stadiums, event spaces", riskLevel: "high" },
  transportation: { label: "Transportation", description: "Transit hubs, parking facilities, airports", riskLevel: "moderate" },
  religious: { label: "Religious / House of Worship", description: "Churches, mosques, temples, synagogues", riskLevel: "low" },
  recreation: { label: "Recreation", description: "Country clubs, gyms, parks, sports facilities", riskLevel: "low" },
  cannabis: { label: "Cannabis", description: "Dispensaries, grow operations, processing — licensed facilities", riskLevel: "high" },
  energy_utility: { label: "Energy / Utility", description: "Power plants, substations, utility infrastructure", riskLevel: "high" },
  data_center: { label: "Data Center", description: "Server farms, telecom facilities, network infrastructure", riskLevel: "high" },
  auto_dealership: { label: "Auto Dealership", description: "Car lots, dealerships, auto auctions", riskLevel: "moderate" },
  other: { label: "Other", description: "Uncategorized or unique site type", riskLevel: "moderate" },
} as const;

export type ClientCategory = keyof typeof CLIENT_CATEGORIES;

// ============================================================================
// SUB-CLIENTS TABLE (Client's Clients for complex billing scenarios)
// Supports: Primary Client → Sub-Client → Job ID → Location → Bill Rates
// ============================================================================


export const insertSubClientSchema = createInsertSchema(subClients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubClient = z.infer<typeof insertSubClientSchema>;
export type SubClient = typeof subClients.$inferSelect;

// ============================================================================
// SCHEDULING TABLES
// ============================================================================


// Shift category for visual theming (matches homepage preview colors)

// Shifts (Scheduled time blocks)

// ============================================================================
// CUSTOM SCHEDULER INTERVALS TABLE - Phase 2 Critical Blocker
// ============================================================================


export const insertCustomSchedulerIntervalSchema = createInsertSchema(customSchedulerIntervals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomSchedulerInterval = z.infer<typeof insertCustomSchedulerIntervalSchema>;
export type CustomSchedulerInterval = typeof customSchedulerIntervals.$inferSelect;

export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
  endTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
});

export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

// ============================================================================
// TRINITY TRAINING SYSTEM - AI Confidence Building
// ============================================================================




export const insertTrainingScenarioSchema = createInsertSchema(trainingScenarios).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingRunSchema = createInsertSchema(trainingRuns).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertTrainingScenario = z.infer<typeof insertTrainingScenarioSchema>;
export type TrainingScenario = typeof trainingScenarios.$inferSelect;
export type InsertTrainingRun = z.infer<typeof insertTrainingRunSchema>;
export type TrainingRun = typeof trainingRuns.$inferSelect;

// ============================================================================
// RECURRING SHIFT PATTERNS - Phase 2B Advanced Scheduling
// ============================================================================



export const insertRecurringShiftPatternSchema = createInsertSchema(recurringShiftPatterns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastGeneratedDate: true,
  shiftsGenerated: true,
});

export type InsertRecurringShiftPattern = z.infer<typeof insertRecurringShiftPatternSchema>;
export type RecurringShiftPattern = typeof recurringShiftPatterns.$inferSelect;

// ============================================================================
// SHIFT SWAP REQUESTS - Phase 2B Advanced Scheduling
// ============================================================================



export const insertShiftSwapRequestSchema = createInsertSchema(shiftSwapRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  respondedAt: true,
  aiProcessedAt: true,
  aiSuggestedEmployees: true,
});

export type InsertShiftSwapRequest = z.infer<typeof insertShiftSwapRequestSchema>;
export type ShiftSwapRequest = typeof shiftSwapRequests.$inferSelect;

// ============================================================================
// SCHEDULE TEMPLATES - Phase 2B Advanced Scheduling
// ============================================================================


export const insertScheduleTemplateSchema = createInsertSchema(scheduleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export type InsertScheduleTemplate = z.infer<typeof insertScheduleTemplateSchema>;
export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;

// Shift Acknowledgments (Post Orders & Special Orders)


export const insertShiftAcknowledgmentSchema = createInsertSchema(shiftAcknowledgments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftAcknowledgment = z.infer<typeof insertShiftAcknowledgmentSchema>;
export type ShiftAcknowledgment = typeof shiftAcknowledgments.$inferSelect;

// Service Coverage Requests - AI-powered on-demand staffing

export const insertServiceCoverageRequestSchema = createInsertSchema(serviceCoverageRequests).omit({
  id: true,
  requestNumber: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
  endTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
});

export type InsertServiceCoverageRequest = z.infer<typeof insertServiceCoverageRequestSchema>;
export type ServiceCoverageRequest = typeof serviceCoverageRequests.$inferSelect;

// Published Schedules - Track when schedules go live

export const insertPublishedScheduleSchema = createInsertSchema(publishedSchedules).omit({
  id: true,
  createdAt: true,
});

export type InsertPublishedSchedule = z.infer<typeof insertPublishedScheduleSchema>;
export type PublishedSchedule = typeof publishedSchedules.$inferSelect;

// Schedule Snapshots - For rollback capability when Trinity makes scheduling mistakes

export const insertScheduleSnapshotSchema = createInsertSchema(scheduleSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertScheduleSnapshot = z.infer<typeof insertScheduleSnapshotSchema>;
export type ScheduleSnapshot = typeof scheduleSnapshots.$inferSelect;

// Schedule Proposals - AI-generated schedules awaiting approval (99% AI, 1% Human Governance)

export const insertScheduleProposalSchema = createInsertSchema(scheduleProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScheduleProposal = z.infer<typeof insertScheduleProposalSchema>;
export type ScheduleProposal = typeof scheduleProposals.$inferSelect;

export const insertInvoiceProposalSchema = z.object({});

export type InsertInvoiceProposal = z.infer<typeof insertInvoiceProposalSchema>;
export type InvoiceProposal = z.infer<typeof insertInvoiceProposalsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

// Payroll Proposals - AI-generated payroll awaiting approval (Operations Automation)

export const insertPayrollProposalSchema = createInsertSchema(payrollProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayrollProposal = z.infer<typeof insertPayrollProposalSchema>;
export type PayrollProposal = typeof payrollProposals.$inferSelect;

// Shift Templates (Reusable shift patterns)

export const insertShiftTemplateSchema = createInsertSchema(shiftTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftTemplate = z.infer<typeof insertShiftTemplateSchema>;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;

// Smart Schedule™ Usage Tracking (for billing)

export const insertSmartScheduleUsageSchema = createInsertSchema(smartScheduleUsage).omit({
  id: true,
  createdAt: true,
});

export type InsertSmartScheduleUsage = z.infer<typeof insertSmartScheduleUsageSchema>;
export type SmartScheduleUsage = typeof smartScheduleUsage.$inferSelect;

// Time Entries (Actual clock-in/clock-out for billing)

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
// SECURITY INCIDENTS - Mobile Worker Incident Reporting
// ============================================================================





export const insertSecurityIncidentSchema = createInsertSchema(securityIncidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSecurityIncident = z.infer<typeof insertSecurityIncidentSchema>;
export type SecurityIncident = typeof securityIncidents.$inferSelect;

// Break type enum

// Time Entry Breaks - Track all breaks within a time entry/shift

export const insertTimeEntryBreakSchema = createInsertSchema(timeEntryBreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()).optional(),
});

export type InsertTimeEntryBreak = z.infer<typeof insertTimeEntryBreakSchema>;
export type TimeEntryBreak = typeof timeEntryBreaks.$inferSelect;

// Audit action types

// Time Entry Audit Events - Complete audit trail for all time tracking actions

export const insertTimeEntryAuditEventSchema = createInsertSchema(timeEntryAuditEvents).omit({
  id: true,
  occurredAt: true,
});

export type InsertTimeEntryAuditEvent = z.infer<typeof insertTimeEntryAuditEventSchema>;
export type TimeEntryAuditEvent = typeof timeEntryAuditEvents.$inferSelect;
// ============================================================================
// SHIFT ORDERS & POST ORDERS
// ============================================================================


// Shift Orders (Post Orders) - Special instructions/tasks for shifts

export const insertShiftOrderSchema = createInsertSchema(shiftOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftOrder = z.infer<typeof insertShiftOrderSchema>;
export type ShiftOrder = typeof shiftOrders.$inferSelect;

// Shift Order Acknowledgments - Track who acknowledged which orders

export const insertShiftOrderAcknowledgmentSchema = createInsertSchema(shiftOrderAcknowledgments).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertShiftOrderAcknowledgment = z.infer<typeof insertShiftOrderAcknowledgmentSchema>;
export type ShiftOrderAcknowledgment = typeof shiftOrderAcknowledgments.$inferSelect;

// ============================================================================
// POST ORDER TEMPLATES - Reusable post order templates (not tied to a shift)
// ============================================================================


export const insertPostOrderTemplateSchema = createInsertSchema(postOrderTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPostOrderTemplate = z.infer<typeof insertPostOrderTemplateSchema>;
export type PostOrderTemplate = typeof postOrderTemplates.$inferSelect;

// ============================================================================
// INVOICING & BILLING TABLES
// ============================================================================


// Invoices

const _dateOrStringField = z.union([z.date(), z.string().transform(v => new Date(v))]).optional().nullable();
const _decimalOrNumber = z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val);

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  issueDate: _dateOrStringField,
  dueDate: _dateOrStringField,
  subtotal: _decimalOrNumber.optional(),
  taxRate: _decimalOrNumber.optional(),
  taxAmount: _decimalOrNumber.optional(),
  total: _decimalOrNumber.optional(),
  platformFeePercentage: _decimalOrNumber.optional(),
  platformFeeAmount: _decimalOrNumber.optional(),
  businessAmount: _decimalOrNumber.optional(),
  amountPaid: _decimalOrNumber.optional(),
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Invoice Line Items

export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;

// ============================================================================
// BILLING PLATFORM - FULL FINANCIAL AUTOMATION SYSTEM
// ============================================================================

// Client Billable Rates (for zero-touch invoice generation)

export const insertClientRateSchema = createInsertSchema(clientRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientRate = z.infer<typeof insertClientRateSchema>;
export type ClientRate = typeof clientRates.$inferSelect;

// Payment Records (for invoice payment tracking)

export const insertPaymentRecordSchema = createInsertSchema(paymentRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertPaymentRecord = z.infer<typeof insertPaymentRecordSchema>;
export type PaymentRecord = typeof paymentRecords.$inferSelect;

// ============================================================================
// ORG FINANCIAL LEDGER (Spec Section 4.4)
// Single source of financial truth per workspace. Every invoice, payment,
// payroll, and adjustment event writes a ledger entry.
// ============================================================================

export const insertOrgLedgerSchema = createInsertSchema(orgLedger).omit({
  id: true,
  createdAt: true,
});

export type InsertOrgLedger = z.infer<typeof insertOrgLedgerSchema>;
export type OrgLedger = typeof orgLedger.$inferSelect;

// ============================================================================
// MULTI-CURRENCY SUPPORT (Gap #P1)
// ============================================================================

// Exchange Rates - Stores daily exchange rates for multi-currency support

export const insertExchangeRateSchema = createInsertSchema(exchangeRates).omit({
  id: true,
  createdAt: true,
  fetchedAt: true,
});

export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;

// Workspace Currency Settings - merged into workspaces.currency_settings_blob
export const insertWorkspaceCurrencySettingsSchema = z.object({
  workspaceId: z.string(),
  currencyCode: z.string().optional(),
  currencySymbol: z.string().optional(),
});



// Employee Tax Forms (W-4, W-2, 1099 for ESS)

export const insertEmployeeTaxFormSchema = z.object({});

export type InsertEmployeeTaxForm = z.infer<typeof insertEmployeeTaxFormSchema>;
export type EmployeeTaxForm = z.infer<typeof insertEmployeeTaxFormsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

// Off-Cycle Payroll Runs (Bonus/Instant Pay)

export const insertOffCyclePayrollRunSchema = createInsertSchema(offCyclePayrollRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOffCyclePayrollRun = z.infer<typeof insertOffCyclePayrollRunSchema>;
export type OffCyclePayrollRun = typeof offCyclePayrollRuns.$inferSelect;

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

// Manager Assignments (which managers oversee which employees)
// NOTE: Application layer MUST validate:
//   1. Both manager and employee belong to the same workspace
//   2. managerId has workspaceRole = 'manager' or 'owner'

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















// ============================================================================
// ENTERPRISE FEATURES - Job Posting & Hiring
// ============================================================================

// ============================================================================
// ENTERPRISE FEATURES - Employee File Management
// ============================================================================

// ============================================================================
// EMPLOYEE INVITATIONS
// ============================================================================

export const insertEmployeeInvitationSchema = createInsertSchema(employeeInvitations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeInvitation = z.infer<typeof insertEmployeeInvitationSchema>;
export type EmployeeInvitation = typeof employeeInvitations.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Employee Onboarding System
// ============================================================================


// Invite Status Enum for tracking invitation lifecycle

// Onboarding Invites - Enhanced with tracking fields

export const insertOnboardingInviteSchema = createInsertSchema(onboardingInvites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingInvite = z.infer<typeof insertOnboardingInviteSchema>;
export type OnboardingInvite = typeof onboardingInvites.$inferSelect;
export type InviteStatus = 'sent' | 'opened' | 'accepted' | 'expired' | 'revoked';

// Onboarding Applications

export const insertOnboardingApplicationSchema = createInsertSchema(onboardingApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingApplication = z.infer<typeof insertOnboardingApplicationSchema>;
export type OnboardingApplication = typeof onboardingApplications.$inferSelect;

// Legal Documents & Signatures


export const insertDocumentSignatureSchema = createInsertSchema(documentSignatures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocumentSignature = z.infer<typeof insertDocumentSignatureSchema>;
export type DocumentSignature = typeof documentSignatures.$inferSelect;

// Certification & License Tracking

export const insertEmployeeCertificationSchema = z.object({
  workspaceId: z.string().optional(),
  employeeId: z.string().optional(),
  applicationId: z.string().optional(),
  certificationName: z.string().optional(),
  issuingAuthority: z.string().optional(),
  issueDate: z.date().optional().nullable(),
  expirationDate: z.date().optional().nullable(),
  status: z.string().optional(),
  metadata: z.any().optional(),
});

export type InsertEmployeeCertification = z.infer<typeof insertEmployeeCertificationSchema>;
export type EmployeeCertification = InsertEmployeeCertification & { id: string; createdAt: Date | null; updatedAt: Date | null };

// ============================================================================
// COMPLIANCE SYSTEM - I-9 WORK AUTHORIZATION & RE-VERIFICATION
// ============================================================================


export const insertEmployeeI9RecordSchema = z.object({
  workspaceId: z.string().optional(),
  employeeId: z.string().optional(),
  status: z.string().optional(),
  expirationDate: z.date().optional().nullable(),
  reverificationCompleted: z.boolean().optional(),
  metadata: z.any().optional(),
});

export type InsertEmployeeI9Record = z.infer<typeof insertEmployeeI9RecordSchema>;
export type EmployeeI9Record = InsertEmployeeI9Record & { id: string; createdAt: Date | null; updatedAt: Date | null };

// ============================================================================
// POLICY MANAGEMENT - HANDBOOK & POLICY ACKNOWLEDGMENT
// ============================================================================


// Company Policies & Handbooks

// Policy Acknowledgments (Employee signatures)

export const insertCompanyPolicySchema = createInsertSchema(companyPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPolicyAcknowledgmentSchema = createInsertSchema(policyAcknowledgments).omit({
  id: true,
  createdAt: true,
});

export type InsertCompanyPolicy = z.infer<typeof insertCompanyPolicySchema>;
export type CompanyPolicy = typeof companyPolicies.$inferSelect;
export type InsertPolicyAcknowledgment = z.infer<typeof insertPolicyAcknowledgmentSchema>;
export type PolicyAcknowledgment = typeof policyAcknowledgments.$inferSelect;

// ============================================================================
// EMPLOYEE ONBOARDING - DIGITAL FILE CABINET & COMPLIANCE WORKFLOW (MONOPOLISTIC FEATURE)
// ============================================================================

// Onboarding Workflow Templates (No-Code Builder)

export const insertOnboardingWorkflowTemplateSchema = createInsertSchema(onboardingWorkflowTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingWorkflowTemplate = z.infer<typeof insertOnboardingWorkflowTemplateSchema>;
export type OnboardingWorkflowTemplate = typeof onboardingWorkflowTemplates.$inferSelect;

// Employee Documents (Permanent Digital File Cabinet)



export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;

// Document Access Log (Who viewed what, when)

export const insertDocumentAccessLogSchema = createInsertSchema(documentAccessLogs).omit({
  id: true,
  accessedAt: true,
});

export type InsertDocumentAccessLog = z.infer<typeof insertDocumentAccessLogSchema>;
export type DocumentAccessLog = typeof documentAccessLogs.$inferSelect;

// Onboarding Checklist (Track completion per employee)

export const insertOnboardingChecklistSchema = createInsertSchema(onboardingChecklists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingChecklist = z.infer<typeof insertOnboardingChecklistSchema>;
export type OnboardingChecklist = typeof onboardingChecklists.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Audit Trail System
// ============================================================================



export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - API Access
// ============================================================================


export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - GPS Clock-in Verification
// ============================================================================


export const insertGpsLocationSchema = createInsertSchema(gpsLocations).omit({
  id: true,
  createdAt: true,
});

export type InsertGpsLocation = z.infer<typeof insertGpsLocationSchema>;
export type GpsLocation = typeof gpsLocations.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Payroll Automation
// ============================================================================



export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRun = typeof payrollRuns.$inferSelect;


export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;
export type PayrollEntry = typeof payrollEntries.$inferSelect;

// ============================================================================
// PHASE 4D: PAYROLL DEDUCTIONS & GARNISHMENTS
// ============================================================================

// ============================================================================
// ENTERPRISE FEATURES - Platform-Level Roles (Root, Sysop, Auditor)
// ============================================================================

// Platform roles that exist outside workspace tenancy

export const insertPlatformRoleSchema = createInsertSchema(platformRoles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformRole = z.infer<typeof insertPlatformRoleSchema>;
export type PlatformRole = typeof platformRoles.$inferSelect;

// Support Session Severity Enum

// Support Session Scope Enum

// Support Sessions - Track when support staff access an organization

export const insertSupportSessionSchema = createInsertSchema(supportSessions).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});
export type InsertSupportSession = z.infer<typeof insertSupportSessionSchema>;
export type SupportSession = typeof supportSessions.$inferSelect;

// ─── DEPRECATED (B1 consolidation) ───────────────────────────────────────────
// These tables are being migrated to audit_logs (source='support'/'system').
// New writes SHOULD go to auditLogs. These definitions kept for legacy readers.
// MERGED: supportAuditLogs → auditLogs (source=support) (table dropped, Mar 2026)
export const supportAuditLogs = auditLogs;
export type SupportAuditLog = typeof auditLogs.$inferSelect;
export const insertSupportAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export type InsertSupportAuditLog = z.infer<typeof insertSupportAuditLogSchema>;

// MERGED: systemAuditLogs → auditLogs (source=system) (table dropped, Mar 2026)
export const systemAuditLogs = auditLogs;
// ─────────────────────────────────────────────────────────────────────────────

// ============================================================================
// AI BRAIN GOVERNANCE APPROVAL GATES
// Persistent storage for destructive action approvals - survives restarts
// ============================================================================



export const insertGovernanceApprovalSchema = createInsertSchema(governanceApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGovernanceApproval = z.infer<typeof insertGovernanceApprovalSchema>;
export type GovernanceApproval = typeof governanceApprovals.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Resignation & Notice System
// ============================================================================

// ============================================================================
// ENTERPRISE FEATURES - Subscription & Billing Management
// ============================================================================



export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
// Platform revenue tracking (our cuts from invoices + subscriptions)

export const insertPlatformRevenueSchema = createInsertSchema(platformRevenue).omit({
  id: true,
  createdAt: true,
});

export type InsertPlatformRevenue = z.infer<typeof insertPlatformRevenueSchema>;
export type PlatformRevenue = typeof platformRevenue.$inferSelect;

// AI Usage Tracking - Track AI operations and costs per workspace

export const insertWorkspaceAiUsageSchema = createInsertSchema(workspaceAiUsage).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkspaceAiUsage = z.infer<typeof insertWorkspaceAiUsageSchema>;
export type WorkspaceAiUsage = typeof workspaceAiUsage.$inferSelect;

// ============================================================================
// REPORT MANAGEMENT SYSTEM (RMS)
// ============================================================================

// Report Templates - Configurable report types per workspace

export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportTemplate = typeof reportTemplates.$inferSelect;

// Report Submissions - Actual reports created by employees

export const insertReportSubmissionSchema = createInsertSchema(reportSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportSubmission = z.infer<typeof insertReportSubmissionSchema>;
export type ReportSubmission = typeof reportSubmissions.$inferSelect;

// ============================================================================
// MONOPOLISTIC REPORT WORKFLOW ENGINE
// ============================================================================

// Approval Workflow Configuration - Define multi-step approval chains per template

export const insertReportWorkflowConfigSchema = createInsertSchema(reportWorkflowConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportWorkflowConfig = z.infer<typeof insertReportWorkflowConfigSchema>;
export type ReportWorkflowConfig = typeof reportWorkflowConfigs.$inferSelect;

// Approval Step Tracking - Track each approval step for a submission

export const insertReportApprovalStepSchema = createInsertSchema(reportApprovalSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportApprovalStep = z.infer<typeof insertReportApprovalStepSchema>;
export type ReportApprovalStep = typeof reportApprovalSteps.$inferSelect;

// Locked Report Records - Immutable audit trail after approval

export const insertLockedReportRecordSchema = createInsertSchema(lockedReportRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertLockedReportRecord = z.infer<typeof insertLockedReportRecordSchema>;
export type LockedReportRecord = typeof lockedReportRecords.$inferSelect;

// Report Attachments - Photos, documents, etc.

export const insertReportAttachmentSchema = createInsertSchema(reportAttachments).omit({
  id: true,
  uploadedAt: true,
});

export type InsertReportAttachment = z.infer<typeof insertReportAttachmentSchema>;
export type ReportAttachment = typeof reportAttachments.$inferSelect;

// Customer Report Access - Manage time-limited access for end customers

export const insertCustomerReportAccessSchema = createInsertSchema(customerReportAccess).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomerReportAccess = z.infer<typeof insertCustomerReportAccessSchema>;
export type CustomerReportAccess = typeof customerReportAccess.$inferSelect;

// ============================================================================
// MONOPOLISTIC REPORTS & FORMS FEATURES
// ============================================================================

// Real-Time KPI Alerts - Configurable notifications tied to AI Predictions and Custom Logic

export const insertKpiAlertSchema = createInsertSchema(kpiAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKpiAlert = z.infer<typeof insertKpiAlertSchema>;
export type KpiAlert = typeof kpiAlerts.$inferSelect;

// Alert Trigger History - Log every time an alert fires

export const insertKpiAlertTriggerSchema = createInsertSchema(kpiAlertTriggers).omit({
  id: true,
  createdAt: true,
});

export type InsertKpiAlertTrigger = z.infer<typeof insertKpiAlertTriggerSchema>;
export type KpiAlertTrigger = typeof kpiAlertTriggers.$inferSelect;

// Benchmark Metrics - Anonymous aggregation for peer comparison (Future Moat)
export const insertBenchmarkMetricSchema = createInsertSchema(benchmarkMetrics).omit({ id: true, createdAt: true });
export type InsertBenchmarkMetric = z.infer<typeof insertBenchmarkMetricSchema>;
export type BenchmarkMetric = typeof benchmarkMetrics.$inferSelect;

// Support Tickets - Help desk for report requests and template requests

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

// FAQ Source Type Enum - Where the FAQ originated from

// FAQ Status Enum - Lifecycle status

// HelpAI FAQ Knowledge Base - FAQ articles for AI-powered bot assistance

export const insertHelposFaqSchema = createInsertSchema(helposFaqs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelposFaq = z.infer<typeof insertHelposFaqSchema>;
export type HelposFaq = typeof helposFaqs.$inferSelect;

// FAQ Version History - Track all changes to FAQs for audit trail

export const insertFaqVersionSchema = createInsertSchema(faqVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertFaqVersion = z.infer<typeof insertFaqVersionSchema>;
export type FaqVersion = typeof faqVersions.$inferSelect;

// FAQ Gap Events - Track unanswered questions and knowledge gaps

export const insertFaqGapEventSchema = createInsertSchema(faqGapEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFaqGapEvent = z.infer<typeof insertFaqGapEventSchema>;
export type FaqGapEvent = typeof faqGapEvents.$inferSelect;

// FAQ Search History - Track all FAQ searches for analytics and learning

export const insertFaqSearchHistorySchema = createInsertSchema(faqSearchHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertFaqSearchHistory = z.infer<typeof insertFaqSearchHistorySchema>;
export type FaqSearchHistory = typeof faqSearchHistory.$inferSelect;

// ============================================================================
// CUSTOM FORMS SYSTEM (Organization-Specific)
// ============================================================================

// Custom Form Templates - Organization-specific forms for onboarding and RMS
// Each organization can have custom forms added by platform admins/support

export const insertCustomFormSchema = createInsertSchema(customForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomForm = z.infer<typeof insertCustomFormSchema>;
export type CustomForm = typeof customForms.$inferSelect;

// Custom Form Submissions - Completed forms with e-signatures and documents

export const insertCustomFormSubmissionSchema = createInsertSchema(customFormSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
});

export type InsertCustomFormSubmission = z.infer<typeof insertCustomFormSubmissionSchema>;
export type CustomFormSubmission = typeof customFormSubmissions.$inferSelect;

// ============================================================================
// SECURITY & COMPLIANCE
// ============================================================================

// Feature Flags - Control access to premium features per workspace

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;

// ============================================================================
// LIVE CHAT SUPPORT SYSTEM
// ============================================================================

// Chat Conversations - Track chat sessions between support and customers

// Chat Messages - Individual messages in conversations

// Message Reactions - Slack/Discord-style emoji reactions

// Message Read Receipts - Track who has read which messages

// Chat Macros - Quick response templates for support agents

// Typing Indicators - Track real-time typing status (ephemeral)

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({
  id: true,
  createdAt: true,
});

export const insertMessageReadReceiptSchema = createInsertSchema(messageReadReceipts).omit({
  id: true,
  readAt: true,
});

export const insertChatMacroSchema = createInsertSchema(chatMacros).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTypingIndicatorSchema = createInsertSchema(typingIndicators).omit({
  startedAt: true,
});

export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertMessageReaction = z.infer<typeof insertMessageReactionSchema>;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReadReceipt = z.infer<typeof insertMessageReadReceiptSchema>;
export type MessageReadReceipt = typeof messageReadReceipts.$inferSelect;
export type InsertChatMacro = z.infer<typeof insertChatMacroSchema>;
export type ChatMacro = typeof chatMacros.$inferSelect;
export type InsertTypingIndicator = z.infer<typeof insertTypingIndicatorSchema>;
export type TypingIndicator = typeof typingIndicators.$inferSelect;

// ============================================================================
// SMART REPLY USAGE — Tracks Trinity smart reply suggestion acceptance
// ============================================================================

export type InsertSmartReplyUsage = z.infer<typeof insertSmartReplyUsageSchema>;

// Chat Message Edit Schema - Validation for editing existing messages
export const editChatMessageSchema = z.object({
  message: z.string().min(1).max(10000), // Message content validation
});

export type EditChatMessage = z.infer<typeof editChatMessageSchema>;

// ============================================================================
// COMMUNICATIONS WORKROOM UPGRADE - FILE UPLOADS, EVENTS, VOICE
// ============================================================================

// Chat Uploads - Centralized file tracking with virus scanning and retention

// Room Events - Audit trail for room lifecycle and moderation actions
export const insertChatUploadSchema = createInsertSchema(chatUploads).omit({
  id: true,
  createdAt: true,
});

export const insertRoomEventSchema = createInsertSchema(roomEvents).omit({
  id: true,
  createdAt: true,
});

export type ChatUpload = typeof chatUploads.$inferSelect;
export type InsertRoomEvent = z.infer<typeof insertRoomEventSchema>;
export type RoomEvent = typeof roomEvents.$inferSelect;
export type InsertRoomVoiceSession = z.infer<typeof insertRoomVoiceSessionSchema>;

// ============================================================================
// DM AUDIT & INVESTIGATION SYSTEM
// ============================================================================

// DM Audit Requests - Track formal requests to access encrypted DM conversations

// DM Access Logs - Immutable audit trail of who accessed encrypted DMs and when

export const insertDmAuditRequestSchema = createInsertSchema(dmAuditRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDmAccessLogSchema = createInsertSchema(dmAccessLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertDmAuditRequest = z.infer<typeof insertDmAuditRequestSchema>;
export type DmAuditRequest = typeof dmAuditRequests.$inferSelect;
export type InsertDmAccessLog = z.infer<typeof insertDmAccessLogSchema>;
export type DmAccessLog = typeof dmAccessLogs.$inferSelect;

// Encryption Keys - Persistent storage for conversation encryption keys

export const insertConversationEncryptionKeySchema = createInsertSchema(conversationEncryptionKeys).omit({
  createdAt: true,
});

export type InsertConversationEncryptionKey = z.infer<typeof insertConversationEncryptionKeySchema>;
export type ConversationEncryptionKey = typeof conversationEncryptionKeys.$inferSelect;

// ============================================================================
// CHAT PARTICIPANTS - Group chat membership management
// ============================================================================


// ============================================================================
// CHAT GUEST TOKENS - Customer invitations (non-user access)
// ============================================================================

export const insertChatParticipantSchema = createInsertSchema(chatParticipants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChatParticipant = z.infer<typeof insertChatParticipantSchema>;
export type ChatParticipant = typeof chatParticipants.$inferSelect;

// ============================================================================
// BLOCKED CONTACTS - Per-user contact blocking for chat
// ============================================================================

export const insertBlockedContactSchema = createInsertSchema(blockedContacts).omit({
  id: true,
  createdAt: true,
});
export type InsertBlockedContact = z.infer<typeof insertBlockedContactSchema>;
export type BlockedContact = typeof blockedContacts.$inferSelect;

// ============================================================================
// CONVERSATION USER STATE - Per-user visibility/state for conversations
// ============================================================================

export const insertConversationUserStateSchema = createInsertSchema(conversationUserState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConversationUserState = z.infer<typeof insertConversationUserStateSchema>;
export type ConversationUserState = typeof conversationUserState.$inferSelect;

// ============================================================================
// MESSAGE DELETIONS - Per-user message soft deletion tracking
// ============================================================================

export const insertMessageDeletedForSchema = createInsertSchema(messageDeletedFor).omit({
  id: true,
  deletedAt: true,
});
export type InsertMessageDeletedFor = z.infer<typeof insertMessageDeletedForSchema>;
export type MessageDeletedFor = typeof messageDeletedFor.$inferSelect;

// Terms Acknowledgments - Legal compliance tracking for support chat access

export const insertTermsAcknowledgmentSchema = createInsertSchema(termsAcknowledgments).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
});

export type InsertTermsAcknowledgment = z.infer<typeof insertTermsAcknowledgmentSchema>;
export type TermsAcknowledgment = typeof termsAcknowledgments.$inferSelect;

// HelpAI Queue Management - AI-powered support queue

export const insertHelpOsQueueSchema = createInsertSchema(helpOsQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpOsQueue = z.infer<typeof insertHelpOsQueueSchema>;
export type HelpOsQueueEntry = typeof helpOsQueue.$inferSelect;

// Abuse Violations - Track verbal abuse and protect support staff

export const insertAbuseViolationSchema = createInsertSchema(abuseViolations).omit({
  id: true,
  createdAt: true,
});

export type InsertAbuseViolation = z.infer<typeof insertAbuseViolationSchema>;
export type AbuseViolation = typeof abuseViolations.$inferSelect;

// Service Health Status - Track platform service availability

// Service Incident Reports - User-submitted error reports when services fail

export const insertServiceIncidentReportSchema = createInsertSchema(serviceIncidentReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertServiceIncidentReport = z.infer<typeof insertServiceIncidentReportSchema>;
export type ServiceIncidentReport = typeof serviceIncidentReports.$inferSelect;

// ============================================================================
// SALES & MARKETING AUTOMATION SYSTEM
// ============================================================================

// Lead Management - Prospect database for sales outreach

// Email Templates - Industry-specific templates with AI personalization

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailSendSchema = createInsertSchema(emailSends).omit({
  id: true,
  createdAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type InsertEmailSend = z.infer<typeof insertEmailSendSchema>;
export type EmailSend = typeof emailSends.$inferSelect;

// ============================================================================
// SALES MVP: DEAL MANAGEMENT + PROCUREMENT - CRM & PROCUREMENT SYSTEM
// ============================================================================

// Deals/Opportunities - Sales pipeline management

// RFPs - Request for Proposal database

// Proposals - Track proposal documents

// Contacts - Point of contact database (separate from leads)

// Email Sequences - Multi-step email campaigns

// Sequence Sends - Track individual sequence execution

// Tasks - Deal-related tasks and reminders

// Insert schemas
export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRfpSchema = createInsertSchema(rfps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailSequenceSchema = createInsertSchema(emailSequences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSequenceSendSchema = createInsertSchema(sequenceSends).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDealTaskSchema = createInsertSchema(dealTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof deals.$inferSelect;
export type InsertRfp = z.infer<typeof insertRfpSchema>;
export type Rfp = typeof rfps.$inferSelect;
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertEmailSequence = z.infer<typeof insertEmailSequenceSchema>;
export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertSequenceSend = z.infer<typeof insertSequenceSendSchema>;
export type SequenceSend = typeof sequenceSends.$inferSelect;
export type InsertDealTask = z.infer<typeof insertDealTaskSchema>;
export type DealTask = typeof dealTasks.$inferSelect;

// ============================================================================
// HELPDESK SYSTEM - PROFESSIONAL SUPPORT CHAT ROOMS
// ============================================================================

// Support Rooms - Persistent chatrooms with status management

export const insertSupportRoomSchema = createInsertSchema(supportRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupportRoom = z.infer<typeof insertSupportRoomSchema>;
export type SupportRoom = typeof supportRooms.$inferSelect;

// Support Ticket Access - Tracks verified ticket holders' chatroom access

export const insertSupportTicketAccessSchema = createInsertSchema(supportTicketAccess).omit({
  id: true,
  createdAt: true,
});

export type InsertSupportTicketAccess = z.infer<typeof insertSupportTicketAccessSchema>;
export type SupportTicketAccess = typeof supportTicketAccess.$inferSelect;

// ============================================================================
// HELPDESK - Message of the Day (MOTD)
// ============================================================================


export const insertMotdMessageSchema = createInsertSchema(motdMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMotdMessage = z.infer<typeof insertMotdMessageSchema>;
export type MotdMessage = typeof motdMessages.$inferSelect;


export const insertMotdAcknowledgmentSchema = createInsertSchema(motdAcknowledgment).omit({ id: true, createdAt: true });
export type InsertMotdAcknowledgment = z.infer<typeof insertMotdAcknowledgmentSchema>;
export type MotdAcknowledgment = typeof motdAcknowledgment.$inferSelect;

// ============================================================================
// CHAT AGREEMENT ACCEPTANCES - Terms & Conditions for HelpDesk Access
// ============================================================================


export const insertChatAgreementAcceptanceSchema = createInsertSchema(chatAgreementAcceptances).omit({
  id: true,
  acceptedAt: true,
  createdAt: true,
});

export type InsertChatAgreementAcceptance = z.infer<typeof insertChatAgreementAcceptanceSchema>;
export type ChatAgreementAcceptance = typeof chatAgreementAcceptances.$inferSelect;

// ============================================================================
// AI PREDICTIONS - AI-POWERED PREDICTIVE ANALYTICS (MONOPOLISTIC FEATURE #1)
// ============================================================================

// Employee turnover risk scores (90-day flight risk predictions)

export const insertTurnoverRiskScoreSchema = createInsertSchema(turnoverRiskScores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTurnoverRiskScore = z.infer<typeof insertTurnoverRiskScoreSchema>;
export type TurnoverRiskScore = typeof turnoverRiskScores.$inferSelect;

// Schedule cost variance predictions (labor cost overrun detection)

export const insertCostVariancePredictionSchema = createInsertSchema(costVariancePredictions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCostVariancePrediction = z.infer<typeof insertCostVariancePredictionSchema>;
export type CostVariancePrediction = typeof costVariancePredictions.$inferSelect;

// ============================================================================
// CUSTOM WORKFLOW RULES - VISUAL RULE BUILDER (MONOPOLISTIC FEATURE #2)
// ============================================================================



export const insertCustomRuleSchema = createInsertSchema(customRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomRule = z.infer<typeof insertCustomRuleSchema>;
export type CustomRule = typeof customRules.$inferSelect;

// Rule execution logs (for debugging and compliance)

export type RuleExecutionLog = typeof ruleExecutionLogs.$inferSelect;

// ============================================================================
// Time entry discrepancy flags (geo-compliance violations)

export const insertTimeEntryDiscrepancySchema = createInsertSchema(timeEntryDiscrepancies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTimeEntryDiscrepancy = z.infer<typeof insertTimeEntryDiscrepancySchema>;
export type TimeEntryDiscrepancy = typeof timeEntryDiscrepancies.$inferSelect;

// ============================================================================
// TALENT ANALYTICS - RECRUITMENT, PERFORMANCE, & RETENTION (MONOPOLISTIC TIER)
// ============================================================================

// Internal Talent Marketplace - Internal project/role bidding system

export const insertInternalBidSchema = createInsertSchema(internalBids).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInternalBid = z.infer<typeof insertInternalBidSchema>;
export type InternalBid = typeof internalBids.$inferSelect;

// Bid Applications - Employee applications to internal opportunities

export const insertBidApplicationSchema = createInsertSchema(bidApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  appliedAt: true,
});

export type InsertBidApplication = z.infer<typeof insertBidApplicationSchema>;
export type BidApplication = typeof bidApplications.$inferSelect;

// Role Templates - Career progression paths

export const insertRoleTemplateSchema = createInsertSchema(roleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoleTemplate = z.infer<typeof insertRoleTemplateSchema>;
export type RoleTemplate = typeof roleTemplates.$inferSelect;

// Skill Gap Analyses - Employee readiness for next role

export const insertSkillGapAnalysisSchema = createInsertSchema(skillGapAnalyses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  generatedAt: true,
});

export type InsertSkillGapAnalysis = z.infer<typeof insertSkillGapAnalysisSchema>;
export type SkillGapAnalysis = typeof skillGapAnalyses.$inferSelect;

// ============================================================================
// ASSET MANAGEMENT - PHYSICAL RESOURCE ALLOCATION (MONOPOLISTIC TIER)
// ============================================================================

// Assets - Physical resources (trucks, rigs, equipment)

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

// Asset Schedules - Dual-layer scheduling (people + assets)

export const insertAssetScheduleSchema = createInsertSchema(assetSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAssetSchedule = z.infer<typeof insertAssetScheduleSchema>;
export type AssetSchedule = typeof assetSchedules.$inferSelect;

// Asset Usage Logs - Detailed tracking for billing & analytics

export const insertAssetUsageLogSchema = createInsertSchema(assetUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAssetUsageLog = z.infer<typeof insertAssetUsageLogSchema>;
export type AssetUsageLog = typeof assetUsageLogs.$inferSelect;

// ============================================================================
// EMPLOYEE ENGAGEMENT - BIDIRECTIONAL INTELLIGENCE SYSTEM
// ============================================================================

// Pulse Survey Templates - Customizable employee engagement surveys

export const insertPulseSurveyTemplateSchema = createInsertSchema(pulseSurveyTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPulseSurveyTemplate = z.infer<typeof insertPulseSurveyTemplateSchema>;
export type PulseSurveyTemplate = typeof pulseSurveyTemplates.$inferSelect;

// Pulse Survey Responses - Employee feedback submissions
export const insertPulseSurveyResponseSchema = createInsertSchema(pulseSurveyResponses).omit({ id: true, submittedAt: true });
export type InsertPulseSurveyResponse = z.infer<typeof insertPulseSurveyResponseSchema>;
export type PulseSurveyResponse = typeof pulseSurveyResponses.$inferSelect;

// Employer Ratings - Employees rate their organization/departments/managers

export const insertEmployerRatingSchema = createInsertSchema(employerRatings).omit({
  id: true,
  submittedAt: true,
});

export type InsertEmployerRating = z.infer<typeof insertEmployerRatingSchema>;
export type EmployerRating = typeof employerRatings.$inferSelect;

// Anonymous Suggestions - Employee suggestion box with ticket tracking

export const insertAnonymousSuggestionSchema = createInsertSchema(anonymousSuggestions).omit({
  id: true,
  submittedAt: true,
  updatedAt: true,
});

export type InsertAnonymousSuggestion = z.infer<typeof insertAnonymousSuggestionSchema>;
export type AnonymousSuggestion = typeof anonymousSuggestions.$inferSelect;

// Employee Health Scores - Aggregated engagement metrics

export const insertEmployeeHealthScoreSchema = createInsertSchema(employeeHealthScores).omit({
  id: true,
  calculatedAt: true,
});

export type InsertEmployeeHealthScore = z.infer<typeof insertEmployeeHealthScoreSchema>;
export type EmployeeHealthScore = typeof employeeHealthScores.$inferSelect;

// Employer Benchmark Scores - Aggregated org/department ratings vs. industry
export const insertEmployerBenchmarkScoreSchema = createInsertSchema(employerBenchmarkScores).omit({ id: true, calculatedAt: true });
export type InsertEmployerBenchmarkScore = z.infer<typeof insertEmployerBenchmarkScoreSchema>;
export type EmployerBenchmarkScore = typeof employerBenchmarkScores.$inferSelect;

// ============================================================================
// INTEGRATIONS HUB - EXTERNAL ECOSYSTEM LAYER (MONOPOLISTIC LOCK-IN)
// ============================================================================

// Integration categories enum

// Integration marketplace - Certified integration catalog

export const insertIntegrationMarketplaceSchema = createInsertSchema(integrationMarketplace).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationMarketplace = z.infer<typeof insertIntegrationMarketplaceSchema>;
export type IntegrationMarketplace = typeof integrationMarketplace.$inferSelect;

// Integration connections - Active workspace connections to external services

export const insertIntegrationConnectionSchema = createInsertSchema(integrationConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationConnection = z.infer<typeof insertIntegrationConnectionSchema>;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;

// Integration API keys - Public API keys for developer access

export const insertIntegrationApiKeySchema = createInsertSchema(integrationApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationApiKey = z.infer<typeof insertIntegrationApiKeySchema>;
export type IntegrationApiKey = typeof integrationApiKeys.$inferSelect;

// Webhook subscriptions - User-configured event listeners

export const insertWebhookSubscriptionSchema = createInsertSchema(webhookSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWebhookSubscription = z.infer<typeof insertWebhookSubscriptionSchema>;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;

// Webhook deliveries - Delivery tracking and retry history

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({
  id: true,
  createdAt: true,
});

export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

// ============================================================================
// PROMOTIONAL BANNERS - Dashboard-manageable promotional banners for landing page
// ============================================================================


export const insertPromotionalBannerSchema = createInsertSchema(promotionalBanners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPromotionalBanner = z.infer<typeof insertPromotionalBannerSchema>;
export type PromotionalBanner = typeof promotionalBanners.$inferSelect;

// ============================================================================
// INTELLIGENT KNOWLEDGE BASE - AI-Powered Document Search & Policy Retrieval
// ============================================================================


export const insertKnowledgeArticleSchema = createInsertSchema(knowledgeArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKnowledgeArticle = z.infer<typeof insertKnowledgeArticleSchema>;
export type KnowledgeArticle = typeof knowledgeArticles.$inferSelect;

// Track AI knowledge queries for learning and improving responses

export const insertKnowledgeQuerySchema = createInsertSchema(knowledgeQueries).omit({
  id: true,
  createdAt: true,
});

export type InsertKnowledgeQuery = z.infer<typeof insertKnowledgeQuerySchema>;
export type KnowledgeQuery = typeof knowledgeQueries.$inferSelect;

// ============================================================================
// PREDICTIVE SCHEDULING - CAPACITY ALERTS BEFORE OVER-ALLOCATION
// ============================================================================


export const insertCapacityAlertSchema = createInsertSchema(capacityAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertCapacityAlert = z.infer<typeof insertCapacityAlertSchema>;
export type CapacityAlert = typeof capacityAlerts.$inferSelect;

// ============================================================================
// AUTOMATED STATUS REPORTS - Auto-Generated Weekly Summaries
// ============================================================================


export const insertAutoReportSchema = createInsertSchema(autoReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAutoReport = z.infer<typeof insertAutoReportSchema>;
export type AutoReport = typeof autoReports.$inferSelect;

// ============================================================================
// EMPLOYEE ONBOARDING - EMPLOYEE ONBOARDING WORKFLOWS
// ============================================================================

// Onboarding workflow templates

// Onboarding tasks (checklist items for each template)

// Active onboarding sessions for new hires

export const insertOnboardingTemplateSchema = createInsertSchema(onboardingTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOnboardingTaskSchema = createInsertSchema(onboardingTasks).omit({
  id: true,
  createdAt: true,
});

export type OnboardingTemplate = typeof onboardingTemplates.$inferSelect;
export type InsertOnboardingTask = z.infer<typeof insertOnboardingTaskSchema>;
export type OnboardingTask = typeof onboardingTasks.$inferSelect;
// ============================================================================
// OFFBOARDING SYSTEM - EXIT INTERVIEWS & OFFBOARDING WORKFLOWS
// ============================================================================

// Offboarding sessions

// Exit interview questions & responses

export const insertOffboardingSessionSchema = createInsertSchema(offboardingSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExitInterviewResponseSchema = createInsertSchema(exitInterviewResponses).omit({
  id: true,
  createdAt: true,
});

export type InsertOffboardingSession = z.infer<typeof insertOffboardingSessionSchema>;
export type OffboardingSession = typeof offboardingSessions.$inferSelect;
export type InsertExitInterviewResponse = z.infer<typeof insertExitInterviewResponseSchema>;
export type ExitInterviewResponse = typeof exitInterviewResponses.$inferSelect;

// ============================================================================
// EXPENSE MANAGEMENT - EXPENSE TRACKING & REIMBURSEMENTS
// ============================================================================




export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({
  id: true,
  createdAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).refine(
  (data) => {
    const amt = parseFloat(String(data.amount ?? '0'));
    return !isNaN(amt) && amt > 0;
  },
  { message: 'Expense amount must be greater than zero', path: ['amount'] },
);

export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Expense Receipts (Multiple receipts per expense)

export const insertExpenseReceiptSchema = createInsertSchema(expenseReceipts).omit({
  id: true,
  uploadedAt: true,
});

export type InsertExpenseReceipt = z.infer<typeof insertExpenseReceiptSchema>;
export type ExpenseReceipt = typeof expenseReceipts.$inferSelect;

// ============================================================================
// BUDGET PLANNING - BUDGET PLANNING & FORECASTING
// ============================================================================


// Budget line items (detailed breakdown)

// Budget variance analysis (monthly snapshots)

export const insertBudgetSchema = createInsertSchema(budgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetLineItemSchema = createInsertSchema(budgetLineItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetVarianceSchema = createInsertSchema(budgetVariances).omit({
  id: true,
  createdAt: true,
});

export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudgetLineItem = z.infer<typeof insertBudgetLineItemSchema>;
export type BudgetLineItem = typeof budgetLineItems.$inferSelect;
export type InsertBudgetVariance = z.infer<typeof insertBudgetVarianceSchema>;
export type BudgetVariance = typeof budgetVariances.$inferSelect;

// ============================================================================
// TRAINING MANAGEMENT - LEARNING MANAGEMENT SYSTEM
// ============================================================================

// Training courses/programs

// Course enrollments

// Training certifications/credentials

export const insertTrainingCourseSchema = createInsertSchema(trainingCourses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingEnrollmentSchema = createInsertSchema(trainingEnrollments).omit({
  id: true,
  enrolledAt: true,
  updatedAt: true,
});

export const insertTrainingCertificationSchema = createInsertSchema(trainingCertifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrainingCourse = z.infer<typeof insertTrainingCourseSchema>;
export type TrainingCourse = typeof trainingCourses.$inferSelect;
export type InsertTrainingEnrollment = z.infer<typeof insertTrainingEnrollmentSchema>;
export type TrainingEnrollment = typeof trainingEnrollments.$inferSelect;
export type InsertTrainingCertification = z.infer<typeof insertTrainingCertificationSchema>;
export type TrainingCertification = typeof trainingCertifications.$inferSelect;

// ============================================================================
// DISPUTES - CHALLENGE PERFORMANCE REVIEWS, EMPLOYER RATINGS, & RMS FORMS
// ============================================================================
// NOTE: Write-ups/disciplinary actions are handled through Reports & Forms (RMS) forms
// Employees can dispute those RMS forms using this disputes system


// ============================================================================
// SCHEMA EXPORTS - Disputes Only (Write-Ups handled via RMS)
// ============================================================================

// Enhanced insert schema with validation
export const insertDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  disputeType: z.enum(['performance_review', 'employer_rating', 'report_submission', 'composite_score']),
  targetType: z.enum(['performance_reviews', 'employer_ratings', 'report_submissions', 'composite_scores']),
  title: z.string().min(5).max(200),
  reason: z.string().min(20).max(5000),
  evidence: z.array(z.string().url()).optional(),
  requestedOutcome: z.string().max(1000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  status: z.enum(['pending', 'under_review', 'resolved', 'rejected', 'appealed']).default('pending'),
});

// Schema for creating a new dispute (client-facing)
export const createDisputeSchema = insertDisputeSchema.omit({
  workspaceId: true,
  filedBy: true,
  filedByRole: true,
  filedAt: true,
  assignedTo: true,
  assignedAt: true,
  reviewDeadline: true,
  reviewStartedAt: true,
  reviewerNotes: true,
  reviewerRecommendation: true,
  resolvedAt: true,
  resolvedBy: true,
  resolution: true,
  resolutionAction: true,
  changesApplied: true,
  changesAppliedAt: true,
  canBeAppealed: true,
  appealDeadline: true,
  appealedToUpperManagement: true,
  statusHistory: true,
});

export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type CreateDispute = z.infer<typeof createDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

// ============================================================================
// RECORD MANAGEMENT - NATURAL LANGUAGE SEARCH
// ============================================================================


export const insertSearchQuerySchema = createInsertSchema(searchQueries).omit({
  id: true,
  createdAt: true,
});

export type InsertSearchQuery = z.infer<typeof insertSearchQuerySchema>;
export type SearchQuery = typeof searchQueries.$inferSelect;

// ============================================================================
// AI INSIGHTS - AI ANALYTICS & AUTONOMOUS INSIGHTS
// ============================================================================


export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

// Metrics snapshots for trend analysis

export const insertMetricsSnapshotSchema = createInsertSchema(metricsSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertMetricsSnapshot = z.infer<typeof insertMetricsSnapshotSchema>;
export type MetricsSnapshot = typeof metricsSnapshots.$inferSelect;

// ============================================================================
// ONLINE PAYMENTS - STRIPE INTEGRATION FOR INVOICE PAYMENTS
// ============================================================================



// ============================================================================
// EMPLOYEE PAYROLL INFORMATION - TAX FORMS & DIRECT DEPOSIT
// ============================================================================

// Employee Payroll Information

export const insertEmployeePayrollInfoSchema = createInsertSchema(employeePayrollInfo).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeePayrollInfo = z.infer<typeof insertEmployeePayrollInfoSchema>;
export type EmployeePayrollInfo = typeof employeePayrollInfo.$inferSelect;

// ============================================================================
// PAYROLL PAYOUTS - Track individual payout disbursements
// ============================================================================



// MERGED: payrollPayouts → payrollEntries (table dropped, Mar 2026)
export const payrollPayouts = payrollEntries;
export type PayrollPayout = typeof payrollEntries.$inferSelect;

export type InsertPayrollPayout = z.infer<typeof insertPayrollPayoutSchema>;

// ============================================================================
// PAYMENT REMINDERS - Systematic overdue invoice follow-up tracking
// ============================================================================




export const insertPaymentReminderSchema = createInsertSchema(paymentReminders).omit({
  id: true,
  createdAt: true,
});

export type InsertPaymentReminder = z.infer<typeof insertPaymentReminderSchema>;
export type PaymentReminder = typeof paymentReminders.$inferSelect;

// ============================================================================
// EMPLOYEE AVAILABILITY - AI SCHEDULING INTEGRATION
// ============================================================================



export const insertEmployeeAvailabilitySchema = createInsertSchema(employeeAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeAvailability = z.infer<typeof insertEmployeeAvailabilitySchema>;
export type EmployeeAvailability = typeof employeeAvailability.$inferSelect;

// Time-off requests (unavailability)

export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;

// ============================================================================
// SHIFT MANAGEMENT - ACCEPT/DENY/SWITCH WITH APPROVAL
// ============================================================================




export const insertShiftActionSchema = createInsertSchema(shiftActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftAction = z.infer<typeof insertShiftActionSchema>;
export type ShiftAction = typeof shiftActions.$inferSelect;

// ============================================================================
// TIMESHEET EDIT PERMISSIONS - EMPLOYEE REQUESTS ONLY
// ============================================================================



export const insertTimesheetEditRequestSchema = createInsertSchema(timesheetEditRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTimesheetEditRequest = z.infer<typeof insertTimesheetEditRequestSchema>;
export type TimesheetEditRequest = typeof timesheetEditRequests.$inferSelect;

// ============================================================================
// MILEAGE LOGS — Trip & Reimbursement Tracking
// ============================================================================

export const insertMileageLogSchema = createInsertSchema(mileageLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tripDate: z.string().or(z.date()),
  miles: z.string().or(z.number()),
});

export type InsertMileageLog = z.infer<typeof insertMileageLogSchema>;
export type MileageLog = typeof mileageLogs.$inferSelect;

// ============================================================================
// CONTRACT DOCUMENTS - I9, W9, W4 ONBOARDING
// ============================================================================


export const insertContractDocumentSchema = z.object({});

export type InsertContractDocument = z.infer<typeof insertContractDocumentSchema>;
export type ContractDocument = z.infer<typeof insertContractDocumentsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

// ============================================================================
// ORGANIZATION ONBOARDING - COMPLETE SETUP WORKFLOW
// ============================================================================


export const insertOrganizationOnboardingSchema = createInsertSchema(organizationOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationOnboarding = z.infer<typeof insertOrganizationOnboardingSchema>;
export type OrganizationOnboarding = typeof organizationOnboarding.$inferSelect;

// ============================================================================
// COMMUNICATIONS - ORGANIZATION CHAT ROOMS & CHANNELS
// ============================================================================

// Room status enum

// Room member role enum

// Organization Chat Rooms - Main communication channels for organizations

export const insertOrganizationChatRoomSchema = createInsertSchema(organizationChatRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationChatRoom = z.infer<typeof insertOrganizationChatRoomSchema>;
export type OrganizationChatRoom = typeof organizationChatRooms.$inferSelect;

// Organization Chat Channels - Sub-channels for meetings, departments, etc.

export const insertOrganizationChatChannelSchema = createInsertSchema(organizationChatChannels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationChatChannel = z.infer<typeof insertOrganizationChatChannelSchema>;
export type OrganizationChatChannel = typeof organizationChatChannels.$inferSelect;

// Organization Room Members - Access control for rooms and channels

export const insertOrganizationRoomMemberSchema = createInsertSchema(organizationRoomMembers).omit({
  id: true,
  createdAt: true,
});

export type InsertOrganizationRoomMember = z.infer<typeof insertOrganizationRoomMemberSchema>;
export type OrganizationRoomMember = typeof organizationRoomMembers.$inferSelect;

// Organization Room Onboarding - Tracks chat room onboarding flow

export const insertOrganizationRoomOnboardingSchema = createInsertSchema(organizationRoomOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationRoomOnboarding = z.infer<typeof insertOrganizationRoomOnboardingSchema>;
export type OrganizationRoomOnboarding = typeof organizationRoomOnboarding.$inferSelect;

// ============================================================================
// PLATFORM UPDATES - WHAT'S NEW FEED
// ============================================================================

// Platform update category enum

// Tab group type for filtering What's New notifications
export type WhatsNewTabGroup = 'features' | 'enduser' | 'system';

// Map categories to tab groups for filtering
export const categoryToTabGroup: Record<string, WhatsNewTabGroup> = {
  feature: 'features',
  improvement: 'features',
  bugfix: 'enduser',
  security: 'enduser',
  announcement: 'enduser',
  maintenance: 'system',
  diagnostic: 'system',
  support: 'system',
  ai_brain: 'system',
  error: 'system',
};

// Minimum role required to view update (RBAC visibility)

// Platform Updates table - What's New feed (global and workspace-scoped)

export const insertPlatformUpdateSchema = createInsertSchema(platformUpdates).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformUpdate = z.infer<typeof insertPlatformUpdateSchema>;
export type PlatformUpdate = typeof platformUpdates.$inferSelect;

// Track which users have viewed which platform updates (persistent read receipts)

export const insertUserPlatformUpdateViewSchema = createInsertSchema(userPlatformUpdateViews).omit({
  id: true,
  viewedAt: true,
});

export type InsertUserPlatformUpdateView = z.infer<typeof insertUserPlatformUpdateViewSchema>;
export type UserPlatformUpdateView = typeof userPlatformUpdateViews.$inferSelect;

// ============================================================================
// NOTIFICATIONS - REAL-TIME USER NOTIFICATIONS
// ============================================================================

// Notification scope enum - determines routing and persistence rules

// Notification category enum - for filtering and organizing notifications

// Notification type enum

// Notifications table - supports workspace, user, and global scopes

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ============================================================================
// WEB PUSH SUBSCRIPTIONS - Browser Push Notification Subscriptions
// ============================================================================

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// ============================================================================
// AI-POWERED NOTIFICATION DIGESTS - Prevent Notification Floods
// ============================================================================

// Digest frequency enum - How often to send AI-summarized notification digests

// Shift reminder timing enum

// User Notification Preferences - Control how users receive notifications
export const insertUserNotificationPreferencesSchema = createInsertSchema(userNotificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserNotificationPreferences = typeof userNotificationPreferences.$inferSelect;
export type InsertNotificationDigest = z.infer<typeof insertNotificationDigestSchema>;

// ============================================================================
// UNS - NOTIFICATION RULES (User-Defined Categorization & Filtering)
// ============================================================================

// Rule action type enum
// ============================================================================
// UNS - AI NOTIFICATION SUMMARIES (Daily/Weekly Digests)
// ============================================================================

// Summary frequency enum
// ============================================================================
// MAINTENANCE ALERTS - Support Staff System Notifications
// ============================================================================

// Maintenance alert severity enum

// Maintenance alert status enum

// Maintenance alerts - for support staff to notify users of platform maintenance

export const insertMaintenanceAlertSchema = createInsertSchema(maintenanceAlerts).omit({
  id: true,
  acknowledgedByCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMaintenanceAlert = z.infer<typeof insertMaintenanceAlertSchema>;
export type MaintenanceAlert = typeof maintenanceAlerts.$inferSelect;

// Maintenance acknowledgments - tracks which users have acknowledged alerts

export const insertMaintenanceAcknowledgmentSchema = createInsertSchema(maintenanceAcknowledgments).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertMaintenanceAcknowledgment = z.infer<typeof insertMaintenanceAcknowledgmentSchema>;
export type MaintenanceAcknowledgment = typeof maintenanceAcknowledgments.$inferSelect;

// Update Notification Preferences Schema - Partial update for user preferences
export const updateNotificationPreferencesSchema = z.object({
  // Digest settings
  digestFrequency: z.enum(['realtime', '15min', '1hour', '4hours', 'daily', 'never']).optional(),
  enableAiSummarization: z.boolean().optional(),
  enabledTypes: z.array(z.string()).optional(),
  
  // Delivery channel preferences
  preferEmail: z.boolean().optional(),
  enableEmail: z.boolean().optional(),
  enableSms: z.boolean().optional(),
  enablePush: z.boolean().optional(),
  
  // SMS configuration
  smsPhoneNumber: z.string().nullable().optional(),
  smsVerified: z.boolean().optional(),
  smsOptOut: z.boolean().optional(),
  
  // Shift reminder settings
  enableShiftReminders: z.boolean().optional(),
  shiftReminderTiming: z.enum(['15min', '30min', '1hour', '2hours', '4hours', '12hours', '24hours', '48hours', 'custom']).optional(),
  shiftReminderCustomMinutes: z.number().int().min(5).max(10080).nullable().optional(), // 5 min to 7 days
  shiftReminderChannels: z.array(z.enum(['push', 'email', 'sms'])).optional(),
  
  // Schedule change notifications
  enableScheduleChangeNotifications: z.boolean().optional(),
  scheduleChangeChannels: z.array(z.enum(['push', 'email', 'sms'])).optional(),
  
  // Approval notifications
  enableApprovalNotifications: z.boolean().optional(),
  approvalNotificationChannels: z.array(z.enum(['push', 'email', 'sms'])).optional(),
  
  // Quiet hours
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  
  // AI optimization
  aiOptimizedTiming: z.boolean().optional(),
});

export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;

// ============================================================================
// CHAT SYSTEM ENHANCEMENTS - Connection Tracking, Routing, CSAT
// ============================================================================

// Chat Connections - Track WebSocket connections for analytics

// Routing Rules - Smart routing based on keywords

// Satisfaction Surveys - CSAT responses after ticket resolution

export const insertChatConnectionSchema = createInsertSchema(chatConnections).omit({
  id: true,
  connectedAt: true,
});

export const insertSatisfactionSurveySchema = createInsertSchema(satisfactionSurveys).omit({
  id: true,
  createdAt: true,
});

export type InsertChatConnection = z.infer<typeof insertChatConnectionSchema>;
export type ChatConnection = typeof chatConnections.$inferSelect;

export type InsertSatisfactionSurvey = z.infer<typeof insertSatisfactionSurveySchema>;
export type SatisfactionSurvey = typeof satisfactionSurveys.$inferSelect;

// ============================================================================
// CUSTOMER PAYMENT INFORMATION - END CUSTOMER BILLING
// ============================================================================

// ============================================================================
// ADVANCED BILLING & USAGE-BASED PRICING SYSTEM
// ============================================================================

// Account state enum for subscription enforcement

// Billing add-ons catalog - available OS modules for à la carte purchase

export const insertBillingAddonSchema = createInsertSchema(billingAddons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBillingAddon = z.infer<typeof insertBillingAddonSchema>;
export type BillingAddon = typeof billingAddons.$inferSelect;

// Workspace add-on subscriptions - tracks which add-ons each org has purchased

export const insertWorkspaceAddonSchema = createInsertSchema(workspaceAddons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspaceAddon = z.infer<typeof insertWorkspaceAddonSchema>;
export type WorkspaceAddon = typeof workspaceAddons.$inferSelect;

// AI usage events - track every AI/autonomous feature usage

export const insertAiUsageEventSchema = createInsertSchema(aiUsageEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUsageEvent = z.infer<typeof insertAiUsageEventSchema>;
export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;

// Daily usage rollups - aggregated usage per workspace per day

export const insertAiUsageDailyRollupSchema = createInsertSchema(aiUsageDailyRollups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiUsageDailyRollup = z.infer<typeof insertAiUsageDailyRollupSchema>;
export type AiUsageDailyRollup = typeof aiUsageDailyRollups.$inferSelect;

// AI token wallets - prepaid credit balance for AI features

export const insertAiTokenWalletSchema = createInsertSchema(aiTokenWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiTokenWallet = z.infer<typeof insertAiTokenWalletSchema>;
export type AiTokenWallet = typeof aiTokenWallets.$inferSelect;

// Subscription Invoices - weekly platform billing aggregation

export const insertSubscriptionInvoiceSchema = createInsertSchema(subscriptionInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscriptionInvoice = z.infer<typeof insertSubscriptionInvoiceSchema>;
export type SubscriptionInvoice = typeof subscriptionInvoices.$inferSelect;

// Subscription Line Items - breakdown of charges on each subscription invoice

export const insertSubscriptionLineItemSchema = createInsertSchema(subscriptionLineItems).omit({
  id: true,
  createdAt: true,
});

export type InsertSubscriptionLineItem = z.infer<typeof insertSubscriptionLineItemSchema>;
export type SubscriptionLineItem = typeof subscriptionLineItems.$inferSelect;

// Subscription Payments - track all subscription payment transactions

export const insertSubscriptionPaymentSchema = createInsertSchema(subscriptionPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscriptionPayment = z.infer<typeof insertSubscriptionPaymentSchema>;
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;

// Billing audit log - comprehensive audit trail for all billing events

export const insertBillingAuditLogSchema = createInsertSchema(billingAuditLog).omit({
  id: true,
  createdAt: true,
});

export type InsertBillingAuditLog = z.infer<typeof insertBillingAuditLogSchema>;
export type BillingAuditLog = typeof billingAuditLog.$inferSelect;

// ============================================================================
// DISPATCH SYSTEM - COMPUTER-AIDED DISPATCH SYSTEM
// ============================================================================

// Dispatch incidents (CAD calls)

export const insertDispatchIncidentSchema = createInsertSchema(dispatchIncidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDispatchIncident = z.infer<typeof insertDispatchIncidentSchema>;
export type DispatchIncident = typeof dispatchIncidents.$inferSelect;

// Unit assignments to incidents

export const insertDispatchAssignmentSchema = createInsertSchema(dispatchAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDispatchAssignment = z.infer<typeof insertDispatchAssignmentSchema>;
export type DispatchAssignment = typeof dispatchAssignments.$inferSelect;

// Real-time unit status tracking

export const insertUnitStatusSchema = createInsertSchema(unitStatuses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUnitStatus = z.infer<typeof insertUnitStatusSchema>;
export type UnitStatus = typeof unitStatuses.$inferSelect;

// Dispatcher activity log (audit trail)

export const insertDispatchLogSchema = createInsertSchema(dispatchLogs).omit({
  id: true,
  timestamp: true,
});

export type InsertDispatchLog = z.infer<typeof insertDispatchLogSchema>;
export type DispatchLog = typeof dispatchLogs.$inferSelect;

// ============================================================================
// AUTONOMY AUDIT PHASE 1: IDEMPOTENCY & RATE VERSIONING
// ============================================================================

// Idempotency Keys - Prevent duplicate operations (invoice generation, payroll runs, timesheet ingestion)



export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys).omit({
  id: true,
  createdAt: true,
});

export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;

// Employee Rate History - Versioned payroll rates with audit trail

export const insertEmployeeRateHistorySchema = createInsertSchema(employeeRateHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployeeRateHistory = z.infer<typeof insertEmployeeRateHistorySchema>;
export type EmployeeRateHistory = typeof employeeRateHistory.$inferSelect;

// Workspace Rate History - Versioned default rates for workspace

export const insertWorkspaceRateHistorySchema = createInsertSchema(workspaceRateHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkspaceRateHistory = z.infer<typeof insertWorkspaceRateHistorySchema>;
export type WorkspaceRateHistory = typeof workspaceRateHistory.$inferSelect;

// ============================================================================
// PARTNER INTEGRATIONS - QuickBooks, Gusto, etc.
// ============================================================================

// Partner connection types enum

// Partner connection status enum

// Partner Connections - OAuth tokens and connection status

export const insertPartnerConnectionSchema = createInsertSchema(partnerConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPartnerConnection = z.infer<typeof insertPartnerConnectionSchema>;
export type PartnerConnection = typeof partnerConnections.$inferSelect;

// Migration status enum

// QuickBooks Migration Runs - Track migration state and prevent concurrent runs

export const insertQuickbooksMigrationRunSchema = createInsertSchema(quickbooksMigrationRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksMigrationRun = z.infer<typeof insertQuickbooksMigrationRunSchema>;
export type QuickbooksMigrationRun = typeof quickbooksMigrationRuns.$inferSelect;

export const insertPartnerApiUsageEventSchema = z.object({});

export type InsertPartnerApiUsageEvent = z.infer<typeof insertPartnerApiUsageEventSchema>;
export type PartnerApiUsageEvent = z.infer<typeof insertPartnerApiUsageEventsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

export const insertPartnerDataMappingSchema = z.object({});

export type InsertPartnerDataMapping = z.infer<typeof insertPartnerDataMappingSchema>;
export type PartnerDataMapping = z.infer<typeof insertPartnerDataMappingsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

// OAuth States - Store CSRF tokens and PKCE verifiers for OAuth flows

export const insertOAuthStateSchema = createInsertSchema(oauthStates).omit({
  id: true,
  createdAt: true,
});

export type InsertOAuthState = z.infer<typeof insertOAuthStateSchema>;
export type OAuthState = typeof oauthStates.$inferSelect;


// QuickBooks Onboarding Flows - Durable storage for migration flow state


export const insertQuickbooksOnboardingFlowSchema = createInsertSchema(quickbooksOnboardingFlows).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksOnboardingFlow = z.infer<typeof insertQuickbooksOnboardingFlowSchema>;
export type QuickbooksOnboardingFlow = typeof quickbooksOnboardingFlows.$inferSelect;

// QuickBooks API Usage Tracking - Per-realm rate limit enforcement

export type QuickbooksApiUsage = typeof quickbooksApiUsage.$inferSelect;

// ============================================================================
// BILLING ORCHESTRATION - Invoice Lifecycle & Policy Rules
// ============================================================================

// Invoice lifecycle state enum

// Billing Policy Profiles - Rules engine for hours calculation

export const insertBillingPolicyProfileSchema = createInsertSchema(billingPolicyProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBillingPolicyProfile = z.infer<typeof insertBillingPolicyProfileSchema>;
export type BillingPolicyProfile = typeof billingPolicyProfiles.$inferSelect;

// Accounting Dimension Mappings - Maps locations/roles to QBO items/classes/departments

// Audit Proof Packs - "Explain this invoice" documentation

export const insertAuditProofPackSchema = createInsertSchema(auditProofPacks).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditProofPack = z.infer<typeof insertAuditProofPackSchema>;
export type AuditProofPack = typeof auditProofPacks.$inferSelect;

// Rate Throttle Logs - Realm-scoped rate limiting tracking

export const insertRateThrottleLogSchema = createInsertSchema(rateThrottleLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertRateThrottleLog = z.infer<typeof insertRateThrottleLogSchema>;
export type RateThrottleLog = typeof rateThrottleLogs.$inferSelect;

// Exception Triage Queue - Error classification and auto-remediation tracking

export const insertExceptionTriageQueueSchema = createInsertSchema(exceptionTriageQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExceptionTriageQueue = z.infer<typeof insertExceptionTriageQueueSchema>;
export type ExceptionTriageQueue = typeof exceptionTriageQueue.$inferSelect;

// ============================================================================
// OVERSIGHT EVENTS - 1% Autonomous Oversight Queue
// ============================================================================

// Entity types that can be flagged for oversight

// Oversight status

// Oversight Events - Track items flagged for human review in the 1% oversight queue

export const insertOversightEventSchema = createInsertSchema(oversightEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOversightEvent = z.infer<typeof insertOversightEventSchema>;
export type OversightEvent = typeof oversightEvents.$inferSelect;

// ============================================================================
// EXTERNAL IDENTIFIERS SYSTEM - Human-Readable IDs
// ============================================================================

// Entity types that can have external IDs

// External identifiers for human-readable reference (ORG-XXXX, EMP-XXXX-00001, etc.)

export const insertExternalIdentifierSchema = createInsertSchema(externalIdentifiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExternalIdentifier = z.infer<typeof insertExternalIdentifierSchema>;
export type ExternalIdentifier = typeof externalIdentifiers.$inferSelect;

// ID sequence tracking for auto-incrementing employee numbers per org


export const insertIdSequenceSchema = createInsertSchema(idSequences).omit({
  id: true,
  updatedAt: true,
});

export type InsertIdSequence = z.infer<typeof insertIdSequenceSchema>;
export type IdSequence = typeof idSequences.$inferSelect;

// Support agent registry with unique codes

export const insertSupportRegistrySchema = createInsertSchema(supportRegistry).omit({
  id: true,
  createdAt: true,
});

export type InsertSupportRegistry = z.infer<typeof insertSupportRegistrySchema>;
export type SupportRegistry = typeof supportRegistry.$inferSelect;

// Tombstones for tracking deletions with approval workflow

// ============================================================================
// ANALYTICS STATS SCHEMA - Universal Dashboard Metrics
// ============================================================================

export const analyticsStatsSchema = z.object({
  summary: z.object({
    totalWorkspaces: z.number(),
    totalCustomers: z.number(),
    activeEmployees: z.number(),
    monthlyRevenue: z.object({
      amount: z.number(),
      currency: z.string().default('USD'),
      previousMonth: z.number(),
      delta: z.number(),
    }),
    activeSubscriptions: z.number(),
  }),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    tier: z.string(),
    activeEmployees: z.number(),
    activeClients: z.number(),
    upcomingShifts: z.number(),
  }).optional(),
  support: z.object({
    openTickets: z.number(),
    unresolvedEscalations: z.number(),
    avgFirstResponseHours: z.number(),
    liveChats: z.object({
      active: z.number(),
      staffOnline: z.number(),
    }),
  }),
  system: z.object({
    cpu: z.number(),
    memory: z.number(),
    database: z.object({
      status: z.enum(['healthy', 'degraded']),
    }),
    uptimeSeconds: z.number(),
    updatedAt: z.string(),
  }),
  automation: z.object({
    hoursSavedThisMonth: z.number(),
    hoursSavedAllTime: z.number(),
    costAvoidanceMonthly: z.number(),
    costAvoidanceTotal: z.number(),
    aiSuccessRate: z.number(),
    avgConfidenceScore: z.number(),
    autoApprovalRate: z.number(),
    breakdown: z.object({
      scheduling: z.object({
        shiftsGenerated: z.number(),
        hoursSaved: z.number(),
        successRate: z.number(),
      }),
      billing: z.object({
        invoicesGenerated: z.number(),
        hoursSaved: z.number(),
        successRate: z.number(),
      }),
      payroll: z.object({
        payrollsProcessed: z.number(),
        hoursSaved: z.number(),
        successRate: z.number(),
      }),
    }),
    trend: z.object({
      percentChange: z.number(),
      isImproving: z.boolean(),
    }),
  }).optional(),
});

export type AnalyticsStats = z.infer<typeof analyticsStatsSchema>;

// ============================================================================
// HELP DESK AI SUPPORT SYSTEM
// ============================================================================

// HelpAI AI chat sessions - Track AI-powered support conversations

export const insertHelposAiSessionSchema = createInsertSchema(helposAiSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelposAiSession = z.infer<typeof insertHelposAiSessionSchema>;
export type HelposAiSession = typeof helposAiSessions.$inferSelect;

// HelpAI AI transcript entries - Audit trail for AI conversations (1-year retention)

export const insertHelposAiTranscriptEntrySchema = createInsertSchema(helposAiTranscriptEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertHelposAiTranscriptEntry = z.infer<typeof insertHelposAiTranscriptEntrySchema>;
export type HelposAiTranscriptEntry = typeof helposAiTranscriptEntries.$inferSelect;

// ============================================================================
// PLATFORM FEATURE UPDATES & ANNOUNCEMENTS
// ============================================================================

// Feature update status enum

// Feature update category enum

// Feature Updates - Platform-wide announcements with lifecycle management

export const insertFeatureUpdateSchema = createInsertSchema(featureUpdates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeatureUpdate = z.infer<typeof insertFeatureUpdateSchema>;
export type FeatureUpdate = typeof featureUpdates.$inferSelect;

// Feature Update Receipts - Tracks which users have seen/dismissed each update

export const insertFeatureUpdateReceiptSchema = createInsertSchema(featureUpdateReceipts).omit({
  id: true,
  createdAt: true,
});

export type InsertFeatureUpdateReceipt = z.infer<typeof insertFeatureUpdateReceiptSchema>;
export type FeatureUpdateReceipt = typeof featureUpdateReceipts.$inferSelect;

// ============================================================================
// UNIFIED AI BRAIN - GLOBAL INTELLIGENCE SYSTEM
// ============================================================================

// AI Brain Job Status

// AI Brain Job Priority

// AI Brain Skill Types (all autonomous features)

// Monitoring & Alerting Enums








// AI Brain Jobs - All AI task requests across the platform

export const insertAiBrainJobSchema = createInsertSchema(aiBrainJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiBrainJob = z.infer<typeof insertAiBrainJobSchema>;
export type AiBrainJob = typeof aiBrainJobs.$inferSelect;

export const insertAiGlobalPatternSchema = z.object({});

export type InsertAiGlobalPattern = z.infer<typeof insertAiGlobalPatternSchema>;
export type AiGlobalPattern = z.infer<typeof insertAiGlobalPatternsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

// AI Audit Logs - Unified audit log for all AI events (MERGED: action_logs, execution_log, token_usage, feedback_loops, event_stream, decision_audit, solution_library, skill_registry)

// AI Notification History - Alert delivery tracking
// ============================================================================
// DATA INTEGRITY - Event Sourcing & ID Management
// ============================================================================

// Actor Type Enum - Track WHO performed the action

// Event Sourcing Status

// ID Registry - Prevent ID reuse forever (NEVER delete records)

export const insertIdRegistrySchema = createInsertSchema(idRegistry).omit({
  issuedAt: true,
});

export type InsertIdRegistry = z.infer<typeof insertIdRegistrySchema>;
export type IdRegistry = typeof idRegistry.$inferSelect;

// Write-Ahead Log - Transaction safety pattern

export const insertWriteAheadLogSchema = createInsertSchema(writeAheadLog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWriteAheadLog = z.infer<typeof insertWriteAheadLogSchema>;
export type WriteAheadLog = typeof writeAheadLog.$inferSelect;


// Checkpoint status enum

// AI Brain Checkpoints - Save automation state when credits exhausted

export const insertAiCheckpointSchema = createInsertSchema(aiCheckpoints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiCheckpoint = z.infer<typeof insertAiCheckpointSchema>;

// SALES & ORG INVITATIONS
export const insertOrgInvitationSchema = createInsertSchema(orgInvitations).omit({ id: true, createdAt: true, updatedAt: true, invitationToken: true });
export type InsertOrgInvitation = z.infer<typeof insertOrgInvitationSchema>;
export type OrgInvitation = typeof orgInvitations.$inferSelect;

// ============================================================================
// EMAIL EVENTS AUDIT TABLE
// ============================================================================


export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEvents.$inferSelect;

// ============================================================================
// EMAIL UNSUBSCRIBE TABLE - CAN-SPAM COMPLIANCE
// ============================================================================
// Tracks email unsubscribe preferences for CAN-SPAM compliance.
// All marketing and notification emails must respect unsubscribe status.


export const insertEmailUnsubscribeSchema = createInsertSchema(emailUnsubscribes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmailUnsubscribe = z.infer<typeof insertEmailUnsubscribeSchema>;
export type EmailUnsubscribe = typeof emailUnsubscribes.$inferSelect;

// ============================================================================
// INTERNAL EMAIL SYSTEM - Virtual Mailboxes & Messages
// ============================================================================

// Enum for email folder types

// Enum for email priority

// Enum for email status

// Internal Mailboxes - Virtual email addresses for each user

export const insertInternalMailboxSchema = createInsertSchema(internalMailboxes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  unreadCount: true,
  totalMessages: true,
});

export type InsertInternalMailbox = z.infer<typeof insertInternalMailboxSchema>;
export type InternalMailbox = typeof internalMailboxes.$inferSelect;

// Email Folders - Custom folders for organizing emails

export const insertInternalEmailFolderSchema = createInsertSchema(internalEmailFolders).omit({
  id: true,
  createdAt: true,
  messageCount: true,
  unreadCount: true,
});

export type InsertInternalEmailFolder = z.infer<typeof insertInternalEmailFolderSchema>;
export type InternalEmailFolder = typeof internalEmailFolders.$inferSelect;

// Internal Emails - The actual email messages

export const insertInternalEmailSchema = createInsertSchema(internalEmails).omit({
  id: true,
  createdAt: true,
});

export type InsertInternalEmail = z.infer<typeof insertInternalEmailSchema>;
export type InternalEmail = typeof internalEmails.$inferSelect;

// Email Recipients - Junction table for mailbox-email relationship with read status

export const insertInternalEmailRecipientSchema = createInsertSchema(internalEmailRecipients).omit({
  id: true,
  createdAt: true,
});

export type InsertInternalEmailRecipient = z.infer<typeof insertInternalEmailRecipientSchema>;
export type InternalEmailRecipient = typeof internalEmailRecipients.$inferSelect;

// ============================================================================
// INTERNAL EMAIL AUDIT TRAIL — CONSOLIDATED INTO audit_logs (entity_type='internal_email')
// Dropped: internal_email_audit table. Use audit_logs with entityType='internal_email' instead.

// ============================================================================
// SUPPORT TICKET ESCALATION TRACKING (NEW - Tier 1 Critical Fix #5)
// ============================================================================

// ============================================================================
// SUPPORT TICKET HISTORY AUDIT TRAIL (NEW - Tier 1 Critical Fix #5)
// ============================================================================

export type InsertSupportTicketHistory = z.infer<typeof insertSupportTicketHistorySchema>;

// ============================================================================
// INVOICE ADJUSTMENTS TABLE (NEW - Tier 1 Critical Fix #2)
// ============================================================================


// ============================================================================
// PASSWORD RESET AUDIT LOG TABLE (Compliance & Security)
// ============================================================================


export const insertPasswordResetAuditLogSchema = createInsertSchema(passwordResetAuditLog).omit({
  id: true,
  createdAt: true,
});

export type InsertPasswordResetAuditLog = z.infer<typeof insertPasswordResetAuditLogSchema>;
export type PasswordResetAuditLog = typeof passwordResetAuditLog.$inferSelect;

// ============================================================================
// SENTIMENT ANALYSIS HISTORY (Gap #2 - Persist sentiment for trend analysis)
// ============================================================================

// ============================================================================
// GUSTO SYNC HISTORY (Gap #12 - Persist Gusto integration data)
// ============================================================================


export type InsertGustoSyncHistory = z.infer<typeof insertGustoSyncHistorySchema>;

// ============================================================================
// ENGAGEMENT SCORE HISTORY (Gap #4 - Track historical engagement for trends)
// ============================================================================


export const insertEngagementScoreHistorySchema = createInsertSchema(engagementScoreHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertEngagementScoreHistory = z.infer<typeof insertEngagementScoreHistorySchema>;
export type EngagementScoreHistory = typeof engagementScoreHistory.$inferSelect;

// ============================================================================
// GAMIFICATION SYSTEM - Employee Engagement & Recognition
// ============================================================================

// Achievement categories

// Achievement definitions

export const insertAchievementSchema = createInsertSchema(achievements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Achievement = typeof achievements.$inferSelect;

export const insertEmployeeAchievementSchema = z.object({});

export type InsertEmployeeAchievement = z.infer<typeof insertEmployeeAchievementSchema>;
export type EmployeeAchievement = z.infer<typeof insertEmployeeAchievementsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

// Employee points ledger

export const insertEmployeePointsSchema = createInsertSchema(employeePoints).omit({
  id: true,
  updatedAt: true,
});

// Points transaction history

export const insertPointsTransactionSchema = createInsertSchema(pointsTransactions).omit({
  id: true,
  createdAt: true,
});

export type InsertPointsTransaction = z.infer<typeof insertPointsTransactionSchema>;
export type PointsTransaction = typeof pointsTransactions.$inferSelect;

// Leaderboard cache (refreshed periodically)

export const insertLeaderboardCacheSchema = createInsertSchema(leaderboardCache).omit({
  id: true,
  calculatedAt: true,
});

export type InsertLeaderboardCache = z.infer<typeof insertLeaderboardCacheSchema>;
export type LeaderboardCache = typeof leaderboardCache.$inferSelect;

// ============================================================================
// COAILEAGUE AUTONOMOUS SCHEDULER - PHASE 1 (Gap Analysis Implementation)
// ============================================================================

// Pool type enum for scheduler

// Scoring event type enum

// Personality tag category enum  

// Pool failure type enum

// Unified CoAIleague Employee Profile for AI Scheduling

// MERGED: employeeMetrics → coaileagueEmployeeProfiles (table dropped, Mar 2026)
export const employeeMetrics = coaileagueEmployeeProfiles;

export const insertCoaileagueEmployeeProfileSchema = createInsertSchema(coaileagueEmployeeProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCoaileagueEmployeeProfile = z.infer<typeof insertCoaileagueEmployeeProfileSchema>;
export type CoaileagueEmployeeProfile = typeof coaileagueEmployeeProfiles.$inferSelect;

export const insertEmployeeScoreSnapshotSchema = z.object({});

export type InsertEmployeeScoreSnapshot = z.infer<typeof insertEmployeeScoreSnapshotSchema>;
export type EmployeeScoreSnapshot = z.infer<typeof insertEmployeeScoreSnapshotsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

// Employee Event Log (Event-driven score updates)

export const insertEmployeeEventLogSchema = createInsertSchema(employeeEventLog).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployeeEventLog = z.infer<typeof insertEmployeeEventLogSchema>;
export type EmployeeEventLog = typeof employeeEventLog.$inferSelect;

// Personality Tags Catalog (Master list per workspace)

export const insertPersonalityTagsCatalogSchema = createInsertSchema(personalityTagsCatalog).omit({
  id: true,
  createdAt: true,
});

export type InsertPersonalityTagsCatalog = z.infer<typeof insertPersonalityTagsCatalogSchema>;
export type PersonalityTagsCatalog = typeof personalityTagsCatalog.$inferSelect;

// Scoring Weight Profiles (Configurable weights per workspace)

export const insertScoringWeightProfileSchema = createInsertSchema(scoringWeightProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScoringWeightProfile = z.infer<typeof insertScoringWeightProfileSchema>;
export type ScoringWeightProfile = typeof scoringWeightProfiles.$inferSelect;

export const insertShiftAcceptanceRecordSchema = createInsertSchema(shiftAcceptanceRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertShiftAcceptanceRecord = z.infer<typeof insertShiftAcceptanceRecordSchema>;
export type ShiftAcceptanceRecord = typeof shiftAcceptanceRecords.$inferSelect;

// AI Decision Audit (Gemini decision logging)

export const insertSchedulerNotificationEventSchema = createInsertSchema(schedulerNotificationEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertSchedulerNotificationEvent = z.infer<typeof insertSchedulerNotificationEventSchema>;
export type SchedulerNotificationEvent = typeof schedulerNotificationEvents.$inferSelect;

// ============================================================================
// SALES/ONBOARDING PIPELINE WITH PROGRESS & GAMIFICATION
// ============================================================================

// Pipeline status for tracking org journey from invite to paid subscriber

// Onboarding task status

// Reward status

// Reward type

// Task creator source

// Org onboarding tasks table

export const insertOrgOnboardingTaskSchema = createInsertSchema(orgOnboardingTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrgOnboardingTask = z.infer<typeof insertOrgOnboardingTaskSchema>;
export type OrgOnboardingTask = typeof orgOnboardingTasks.$inferSelect;

// Org rewards table

export const insertOrgRewardSchema = createInsertSchema(orgRewards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrgReward = z.infer<typeof insertOrgRewardSchema>;
export type OrgReward = typeof orgRewards.$inferSelect;

// Pipeline metrics for tracking conversion rates

export type InsertPipelineMetrics = z.infer<typeof insertPipelineMetricsSchema>;

// ============================================================================
// HELPAI ORCHESTRATION SYSTEM - PHASES 2-5
// ============================================================================
// HelpAI Registry - Master registry of all available APIs and capabilities

export const insertHelpaiRegistrySchema = createInsertSchema(helpaiRegistry).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpaiRegistry = z.infer<typeof insertHelpaiRegistrySchema>;
export type HelpaiRegistry = typeof helpaiRegistry.$inferSelect;

// HelpAI Integrations - Per-org integration configuration

export const insertHelpaiIntegrationSchema = createInsertSchema(helpaiIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpaiIntegration = z.infer<typeof insertHelpaiIntegrationSchema>;
export type HelpaiIntegration = typeof helpaiIntegrations.$inferSelect;

// HelpAI Credentials - Encrypted API credentials per org

export const insertHelpaiCredentialSchema = createInsertSchema(helpaiCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpaiCredential = z.infer<typeof insertHelpaiCredentialSchema>;
export type HelpaiCredential = typeof helpaiCredentials.$inferSelect;

// HelpAI Audit Log - Comprehensive audit trail for all HelpAI operations

export const insertHelpaiAuditLogSchema = createInsertSchema(helpaiAuditLog).omit({
  id: true,
  createdAt: true,
});

export type InsertHelpaiAuditLog = z.infer<typeof insertHelpaiAuditLogSchema>;
export type HelpaiAuditLog = typeof helpaiAuditLog.$inferSelect;

// ============================================================================
// HELPAI SESSIONS - Full conversation session tracking for helpdesk
// ============================================================================

// HelpAI Support Sessions - One row per user helpdesk conversation lifecycle

export const insertHelpaiSessionSchema = createInsertSchema(helpaiSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHelpaiSession = z.infer<typeof insertHelpaiSessionSchema>;
export type HelpaiSession = typeof helpaiSessions.$inferSelect;

// HelpAI Action Log - Every action HelpAI takes, tracked for admin/agent review

export const insertHelpaiActionLogSchema = createInsertSchema(helpaiActionLog).omit({
  id: true,
  createdAt: true,
});
export type InsertHelpaiActionLog = z.infer<typeof insertHelpaiActionLogSchema>;
export type HelpaiActionLog = typeof helpaiActionLog.$inferSelect;

// HelpAI Safety Codes - One-time internal codes for user identity verification

export const insertHelpaiSafetyCodeSchema = createInsertSchema(helpaiSafetyCodes).omit({
  id: true,
  createdAt: true,
});
export type InsertHelpaiSafetyCode = z.infer<typeof insertHelpaiSafetyCodeSchema>;
export type HelpaiSafetyCode = typeof helpaiSafetyCodes.$inferSelect;

// ============================================================================
// AI RESPONSE TRACKING SYSTEM - Phase 3: API Gaps
// ============================================================================

export const insertAiResponseSchema = z.object({
  workspaceId: z.string().optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  feature: z.string().optional(),
  prompt: z.string().optional(),
  response: z.string().optional(),
  userRating: z.number().optional().nullable(),
  userFeedback: z.string().optional().nullable(),
  wasHelpful: z.boolean().optional().nullable(),
  ratedAt: z.date().optional().nullable(),
  metadata: z.any().optional(),
});

export type InsertAiResponse = z.infer<typeof insertAiResponseSchema>;
export type AiResponse = InsertAiResponse & { id: string; createdAt: Date | null; updatedAt: Date | null };

// AI Suggestions - Unified suggestions from all AI systems

export const insertAiSuggestionSchema = createInsertSchema(aiSuggestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiSuggestion = z.infer<typeof insertAiSuggestionSchema>;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;

// ============================================================================
// ROOM ANALYTICS SYSTEM - Chat Room Activity Tracking & Metrics
// ============================================================================

// Room Analytics - Current snapshot of metrics per room
// Updated in real-time as events are emitted from ChatServerHub

export const insertRoomAnalyticsSchema = createInsertSchema(roomAnalytics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoomAnalytics = z.infer<typeof insertRoomAnalyticsSchema>;
export type RoomAnalytics = typeof roomAnalytics.$inferSelect;

// Room Analytics Time Series - Hourly and daily aggregated data
// Allows querying historical trends and patterns


export const insertRoomAnalyticsTimeseriesSchema = createInsertSchema(roomAnalyticsTimeseries).omit({
  id: true,
  createdAt: true,
});

export type InsertRoomAnalyticsTimeseries = z.infer<typeof insertRoomAnalyticsTimeseriesSchema>;
export type RoomAnalyticsTimeseries = typeof roomAnalyticsTimeseries.$inferSelect;

// ============================================================================
// CALENDAR SUBSCRIPTIONS - Token-Based iCal Subscription URLs
// ============================================================================


export const insertCalendarSubscriptionSchema = createInsertSchema(calendarSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  accessCount: true,
  lastAccessedAt: true,
});

export type InsertCalendarSubscription = z.infer<typeof insertCalendarSubscriptionSchema>;
export type CalendarSubscription = typeof calendarSubscriptions.$inferSelect;

// ============================================================================
// CALENDAR IMPORTS - Track imported calendar events
// ============================================================================


export const insertCalendarImportSchema = createInsertSchema(calendarImports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCalendarImport = z.infer<typeof insertCalendarImportSchema>;
export type CalendarImport = typeof calendarImports.$inferSelect;

// ============================================================================
// LABOR LAW RULES - Break Scheduling Compliance by Jurisdiction
// ============================================================================


export const insertLaborLawRuleSchema = createInsertSchema(laborLawRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLaborLawRule = z.infer<typeof insertLaborLawRuleSchema>;
export type LaborLawRule = typeof laborLawRules.$inferSelect;

// ============================================================================
// SCHEDULED BREAKS - Auto-scheduled breaks for shifts based on labor laws
// ============================================================================


export const insertScheduledBreakSchema = createInsertSchema(scheduledBreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  scheduledStart: z.string().or(z.date()),
  scheduledEnd: z.string().or(z.date()),
});

export type InsertScheduledBreak = z.infer<typeof insertScheduledBreakSchema>;
export type ScheduledBreak = typeof scheduledBreaks.$inferSelect;

// ============================================================================  
// CALENDAR SYNC EVENTS - AI Brain Integration for calendar operations
// ============================================================================


// ============================================================================
// REAL-TIME ALERTS SYSTEM - Configurable Alert System for Critical Events
// ============================================================================
// Alert Configurations - Per-workspace alert settings

export const insertAlertConfigurationSchema = createInsertSchema(alertConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAlertConfiguration = z.infer<typeof insertAlertConfigurationSchema>;
export type AlertConfiguration = typeof alertConfigurations.$inferSelect;

// Alert History - Triggered alerts log

export const insertAlertHistorySchema = createInsertSchema(alertHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistory = typeof alertHistory.$inferSelect;

// Alert Rate Limiting - Track alert frequency to prevent flooding

// ============================================================================
// USER FEEDBACK PORTAL - Feature Requests, Bug Reports, and Suggestions
// ============================================================================





export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({
  id: true,
  upvoteCount: true,
  downvoteCount: true,
  commentCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;
export type UserFeedback = typeof userFeedback.$inferSelect;


export const insertFeedbackCommentSchema = createInsertSchema(feedbackComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeedbackComment = z.infer<typeof insertFeedbackCommentSchema>;
export type FeedbackComment = typeof feedbackComments.$inferSelect;


export const insertFeedbackVoteSchema = createInsertSchema(feedbackVotes).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedbackVote = z.infer<typeof insertFeedbackVoteSchema>;
export type FeedbackVote = typeof feedbackVotes.$inferSelect;

// ============================================================================
// AI BRAIN CODE EDITOR - STAGED CODE CHANGES
// ============================================================================

// Status enum for code change requests

// Change type enum

// Staged code changes table - AI Brain code edits awaiting approval

export const insertStagedCodeChangeSchema = createInsertSchema(stagedCodeChanges).omit({
  id: true,
  reviewedAt: true,
  appliedAt: true,
  whatsNewSent: true,
  whatsNewId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStagedCodeChange = z.infer<typeof insertStagedCodeChangeSchema>;
export type StagedCodeChange = typeof stagedCodeChanges.$inferSelect;

// Batch change requests - group multiple file changes together

export const insertCodeChangeBatchSchema = createInsertSchema(codeChangeBatches).omit({
  id: true,
  reviewedAt: true,
  totalChanges: true,
  approvedChanges: true,
  rejectedChanges: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCodeChangeBatch = z.infer<typeof insertCodeChangeBatchSchema>;
export type CodeChangeBatch = typeof codeChangeBatches.$inferSelect;

// ============================================================================
// AI BRAIN PLATFORM CHANGE MONITOR
// Autonomous detection and notification of platform updates
// ============================================================================

// Platform scan status enum

// Change severity enum

// Change source type enum - Who/what initiated the change

// Detailed change category enum

// Platform scan snapshots - stores point-in-time platform state

export const insertPlatformScanSnapshotSchema = createInsertSchema(platformScanSnapshots).omit({
  id: true,
  completedAt: true,
  durationMs: true,
  createdAt: true,
});

export type InsertPlatformScanSnapshot = z.infer<typeof insertPlatformScanSnapshotSchema>;
export type PlatformScanSnapshot = typeof platformScanSnapshots.$inferSelect;

// Platform change events - AI-summarized changes with notifications

export const insertPlatformChangeEventSchema = createInsertSchema(platformChangeEvents).omit({
  id: true,
  notificationSentAt: true,
  broadcastedAt: true,
  notificationCount: true,
  whatsNewId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformChangeEvent = z.infer<typeof insertPlatformChangeEventSchema>;
export type PlatformChangeEvent = typeof platformChangeEvents.$inferSelect;

// ============================================================================
// ADVANCED USAGE ANALYTICS - Business Owner Dashboard
// ============================================================================

// Feature usage events - tracks UI interactions and feature adoption

export const insertFeatureUsageEventSchema = createInsertSchema(featureUsageEvents).omit({
  id: true,
  ingestedAt: true,
});

export type InsertFeatureUsageEvent = z.infer<typeof insertFeatureUsageEventSchema>;
export type FeatureUsageEvent = typeof featureUsageEvents.$inferSelect;

// API usage events - tracks backend API calls and partner integrations

export const insertApiUsageEventSchema = createInsertSchema(apiUsageEvents).omit({
  id: true,
  ingestedAt: true,
});

export type InsertApiUsageEvent = z.infer<typeof insertApiUsageEventSchema>;
export type ApiUsageEvent = typeof apiUsageEvents.$inferSelect;

// Usage aggregates - pre-computed daily summaries for fast dashboard queries

export const insertUsageAggregateSchema = createInsertSchema(usageAggregates).omit({
  id: true,
  computedAt: true,
});

export type InsertUsageAggregate = z.infer<typeof insertUsageAggregateSchema>;
export type UsageAggregate = typeof usageAggregates.$inferSelect;

// ============================================================================
// TRINITY MASCOT HOLIDAY DECORATION SYSTEM
// AI Brain orchestrated motion patterns and holiday decorations
// ============================================================================

// Motion pattern types for Trinity stars

// Mascot motion profiles - defines unique movement patterns for Trinity stars

export const insertMascotMotionProfileSchema = createInsertSchema(mascotMotionProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMascotMotionProfile = z.infer<typeof insertMascotMotionProfileSchema>;
export type MascotMotionProfile = typeof mascotMotionProfiles.$inferSelect;

// Holiday mascot decorations - per-holiday visual attachments for Trinity stars

export const insertHolidayMascotDecorSchema = createInsertSchema(holidayMascotDecor).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHolidayMascotDecor = z.infer<typeof insertHolidayMascotDecorSchema>;
export type HolidayMascotDecor = typeof holidayMascotDecor.$inferSelect;

// Holiday mascot directive history - audit trail of AI Brain decisions

export const insertHolidayMascotHistorySchema = createInsertSchema(holidayMascotHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertHolidayMascotHistory = z.infer<typeof insertHolidayMascotHistorySchema>;
export type HolidayMascotHistory = typeof holidayMascotHistory.$inferSelect;

// ============================================================================
// MASCOT SESSIONS & INTERACTIONS - Per-org persistent mascot data
// ============================================================================

// Mascot sessions - tracks unique per-org mascot interaction sessions

// ============================================================================
// AI BRAIN ORCHESTRATION SYSTEM - Workflow Tracking & Commitment Management
// ============================================================================

// Orchestration runs - tracks all AI Brain workflow executions

export const insertOrchestrationRunSchema = createInsertSchema(orchestrationRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrchestrationRun = z.infer<typeof insertOrchestrationRunSchema>;
export type OrchestrationRun = typeof orchestrationRuns.$inferSelect;

// Run steps - individual steps within a workflow run

export const insertOrchestrationRunStepSchema = createInsertSchema(orchestrationRunSteps).omit({
  id: true,
  createdAt: true,
});

export type InsertOrchestrationRunStep = z.infer<typeof insertOrchestrationRunStepSchema>;
export type OrchestrationRunStep = typeof orchestrationRunSteps.$inferSelect;

// Commitment ledger - tracks intents, locks, and transaction boundaries

export const insertCommitmentLedgerSchema = createInsertSchema(commitmentLedger).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCommitmentLedger = z.infer<typeof insertCommitmentLedgerSchema>;
export type CommitmentLedger = typeof commitmentLedger.$inferSelect;

// Workflow artifacts - stores outputs, files, and intermediate results

export const insertWorkflowArtifactSchema = createInsertSchema(workflowArtifacts).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkflowArtifact = z.infer<typeof insertWorkflowArtifactSchema>;
export type WorkflowArtifact = typeof workflowArtifacts.$inferSelect;

// Service control states - persists AI Brain service pause/resume states across restarts

export const insertServiceControlStateSchema = createInsertSchema(serviceControlStates);
export type InsertServiceControlState = z.infer<typeof insertServiceControlStateSchema>;
export type ServiceControlState = typeof serviceControlStates.$inferSelect;

// ============================================================================
// QUICK FIX SYSTEM - RBAC-governed platform maintenance with audit trail
// ============================================================================

// Risk tiers for quick fix actions

// Quick Fix Actions - Available fix types with risk levels

export const insertQuickFixActionSchema = createInsertSchema(quickFixActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuickFixAction = z.infer<typeof insertQuickFixActionSchema>;
export type QuickFixAction = typeof quickFixActions.$inferSelect;

// Quick Fix Role Policies - Per-role limits and permissions

export const insertQuickFixRolePolicySchema = createInsertSchema(quickFixRolePolicies).omit({
  id: true,
  createdAt: true,
});
export type InsertQuickFixRolePolicy = z.infer<typeof insertQuickFixRolePolicySchema>;
export type QuickFixRolePolicy = typeof quickFixRolePolicies.$inferSelect;

// Quick Fix Requests - Pending and historical fix requests

export const insertQuickFixRequestSchema = createInsertSchema(quickFixRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuickFixRequest = z.infer<typeof insertQuickFixRequestSchema>;
export type QuickFixRequest = typeof quickFixRequests.$inferSelect;

// Quick Fix Approvals — CONSOLIDATED INTO quick_fix_executions (approval columns added)
// Dropped: quick_fix_approvals table. Approval data stored in quick_fix_executions instead.

// Quick Fix Executions - Execution records with telemetry

export const insertQuickFixExecutionSchema = createInsertSchema(quickFixExecutions).omit({
  id: true,
});
export type InsertQuickFixExecution = z.infer<typeof insertQuickFixExecutionSchema>;
export type QuickFixExecution = typeof quickFixExecutions.$inferSelect;

// Quick Fix Audit Links — REMOVED. AI brain events now capture execution audit trail.
// Dropped: quick_fix_audit_links table.

// Device Profiles - Store user device capabilities for optimized loading

export const insertUserDeviceProfileSchema = createInsertSchema(userDeviceProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserDeviceProfile = z.infer<typeof insertUserDeviceProfileSchema>;
export type UserDeviceProfile = typeof userDeviceProfiles.$inferSelect;

// ============================================================================
// SESSION CHECKPOINT SYSTEM - Trinity-Aware Session State Management
// ============================================================================

// Checkpoint sync state enum

// Session checkpoint phases

export const insertSessionCheckpointSchema = createInsertSchema(sessionCheckpoints).omit({
  id: true,
  createdAt: true,
  savedAt: true,
  updatedAt: true,
});
export type InsertSessionCheckpoint = z.infer<typeof insertSessionCheckpointSchema>;
export type SessionCheckpoint = typeof sessionCheckpoints.$inferSelect;

// Session recovery requests

export const insertSessionRecoveryRequestSchema = createInsertSchema(sessionRecoveryRequests).omit({
  id: true,
  createdAt: true,
});
export type InsertSessionRecoveryRequest = z.infer<typeof insertSessionRecoveryRequestSchema>;
export type SessionRecoveryRequest = typeof sessionRecoveryRequests.$inferSelect;

// ============================================================================
// AI BRAIN SUBAGENT ORCHESTRATION SYSTEM
// Specialized subagents for each domain with Dr. Holmes diagnostic capabilities
// ============================================================================

// Subagent domain categories

// Subagent execution status

// AI Subagent Definitions - Registry of specialized subagents

export const insertAiSubagentDefinitionSchema = createInsertSchema(aiSubagentDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiSubagentDefinition = z.infer<typeof insertAiSubagentDefinitionSchema>;
export type AiSubagentDefinition = typeof aiSubagentDefinitions.$inferSelect;

// Trinity Access Control - Per-workspace/page/feature RBAC with bypass controls

export const insertTrinityAccessControlSchema = createInsertSchema(trinityAccessControl).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityAccessControl = z.infer<typeof insertTrinityAccessControlSchema>;
export type TrinityAccessControl = typeof trinityAccessControl.$inferSelect;

// Subagent Telemetry - Health monitoring and execution tracking

export const insertSubagentTelemetrySchema = createInsertSchema(subagentTelemetry).omit({
  id: true,
  createdAt: true,
});
export type InsertSubagentTelemetry = z.infer<typeof insertSubagentTelemetrySchema>;
export type SubagentTelemetry = typeof subagentTelemetry.$inferSelect;

// ============================================================================
// AGENT AVAILABILITY — Real-time health/status of Trinity's AI agent roster
// Tracks Gemini, Claude, GPT-4 and internal subagents for fallback routing
// ============================================================================

// Support Interventions - Derailment tracking with approval workflow

export const insertSupportInterventionSchema = createInsertSchema(supportInterventions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportIntervention = z.infer<typeof insertSupportInterventionSchema>;
export type SupportIntervention = typeof supportInterventions.$inferSelect;

// ============================================================================
// SUPPORT SESSION ELEVATIONS - Verified Support Session Bypass
// ============================================================================

/**
 * Tracks elevated support sessions where authenticated support roles
 * can bypass repeated auth checks for AI-driven automation workflows.
 * 
 * Key features:
 * - HMAC signature verification for tamper protection
 * - Time-bounded elevation with absolute and idle timeouts
 * - Audit trail for security compliance
 * - Automatic cleanup on logout or expiration
 */

export const insertSupportSessionElevationSchema = createInsertSchema(supportSessionElevations).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportSessionElevation = z.infer<typeof insertSupportSessionElevationSchema>;
export type SupportSessionElevation = typeof supportSessionElevations.$inferSelect;

// ============================================================================
// TRINITY CREDITS & FEATURE GATING SYSTEM
// ============================================================================

/**
 * Credit packages available for purchase - defines pricing and credit amounts
 */

export const insertTrinityCreditPackageSchema = createInsertSchema(trinityCreditPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityCreditPackage = z.infer<typeof insertTrinityCreditPackageSchema>;
export type TrinityCreditPackage = typeof trinityCreditPackages.$inferSelect;

/**
 * Workspace credit balance - tracks credits for Trinity/AI Brain usage per workspace
 */

export const insertTrinityCreditSchema = createInsertSchema(trinityCredits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityCredit = z.infer<typeof insertTrinityCreditSchema>;
export type TrinityCredit = typeof trinityCredits.$inferSelect;

/**
 * Credit transactions - audit trail for all credit movements
 */

export const insertTrinityCreditTransactionSchema = createInsertSchema(trinityCreditTransactions).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityCreditTransaction = z.infer<typeof insertTrinityCreditTransactionSchema>;
export type TrinityCreditTransaction = typeof trinityCreditTransactions.$inferSelect;

/**
 * Unlock codes - system-generated codes to reactivate features
 */

export const insertTrinityUnlockCodeSchema = createInsertSchema(trinityUnlockCodes).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityUnlockCode = z.infer<typeof insertTrinityUnlockCodeSchema>;
export type TrinityUnlockCode = typeof trinityUnlockCodes.$inferSelect;

/**
 * Workspace feature states - tracks locked/unlocked status per feature per workspace
 */// workspaceFeatureStates merged into workspaces.feature_states_blob
export const insertWorkspaceFeatureStateSchema = z.object({
  workspaceId: z.string(),
  featureKey: z.string(),
  isUnlocked: z.boolean().optional(),
});
export type InsertWorkspaceFeatureState = z.infer<typeof insertWorkspaceFeatureStateSchema>;
export type WorkspaceFeatureState = {
  id: string;
  workspaceId: string;
  featureKey: string;
  featureCategory: string | null;
  isUnlocked: boolean | null;
  unlockMethod: string | null;
  unlockedAt: Date | null;
  unlockedBy: string | null;
  expiresAt: Date | null;
  requiresCredits: boolean | null;
  creditsPerUse: number | null;
  requiredTier: string | null;
  showLockIcon: boolean | null;
  lockMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/**
 * Credit cost configuration - defines how many credits each action costs
 */

export const insertTrinityCreditCostSchema = createInsertSchema(trinityCreditCosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityCreditCost = z.infer<typeof insertTrinityCreditCostSchema>;
export type TrinityCreditCost = typeof trinityCreditCosts.$inferSelect;

// ============================================================================
// AUTOMATION GOVERNANCE SYSTEM
// Confidence-based automation levels with consent tracking and audit trail
// ============================================================================

export const insertWorkspaceAutomationPolicySchema = z.object({
  workspaceId: z.string(),
  currentLevel: z.enum(['hand_held', 'graduated', 'full_automation']).optional(),
});
export type InsertWorkspaceAutomationPolicy = z.infer<typeof insertWorkspaceAutomationPolicySchema>;
export type WorkspaceAutomationPolicy = {
  id: string;
  workspaceId: string;
  currentLevel: 'hand_held' | 'graduated' | 'full_automation';
  handHeldThreshold: number | null;
  graduatedThreshold: number | null;
  reviewCadenceDays: number | null;
  lastReviewedAt: Date | null;
  lastReviewedBy: string | null;
  nextReviewAt: Date | null;
  highRiskCategories: string[] | null;
  autoEscalateOnLowConfidence: boolean | null;
  minConfidenceForAutoExecute: number | null;
  enableAuditNotifications: boolean | null;
  orgOwnerConsent: boolean | null;
  orgOwnerConsentAt: Date | null;
  orgOwnerConsentUserId: string | null;
  waiverAccepted: boolean | null;
  waiverAcceptedAt: Date | null;
  waiverVersion: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};


export const insertUserAutomationConsentSchema = createInsertSchema(userAutomationConsents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserAutomationConsent = z.infer<typeof insertUserAutomationConsentSchema>;
export type UserAutomationConsent = typeof userAutomationConsents.$inferSelect;


export const insertAutomationActionLedgerSchema = createInsertSchema(automationActionLedger).omit({
  id: true,
  createdAt: true,
});
export type InsertAutomationActionLedger = z.infer<typeof insertAutomationActionLedgerSchema>;
export type AutomationActionLedger = typeof automationActionLedger.$inferSelect;


export const insertTrinityConversationSessionSchema = createInsertSchema(trinityConversationSessions).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityConversationSession = z.infer<typeof insertTrinityConversationSessionSchema>;
export type TrinityConversationSession = typeof trinityConversationSessions.$inferSelect;


export const insertTrinityConversationTurnSchema = createInsertSchema(trinityConversationTurns).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityConversationTurn = z.infer<typeof insertTrinityConversationTurnSchema>;
export type TrinityConversationTurn = typeof trinityConversationTurns.$inferSelect;


export const insertKnowledgeGapLogSchema = createInsertSchema(knowledgeGapLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKnowledgeGapLog = z.infer<typeof insertKnowledgeGapLogSchema>;
export type KnowledgeGapLog = typeof knowledgeGapLogs.$inferSelect;

// ============================================================================
// AI BRAIN WORKBOARD - CENTRALIZED JOB QUEUE & ORCHESTRATION
// ============================================================================

/**
 * Workboard request types - source of the work request
 */

/**
 * Workboard task status - lifecycle states
 */

/**
 * Workboard priority levels
 */

/**
 * Execution mode for AI automation tasks
 * - normal: Standard sequential execution (included with subscription)
 * - trinity_fast: Premium parallel execution using Trinity credits (2x multiplier)
 */

export const insertAiWorkboardTaskSchema = z.object({});
export type InsertAiWorkboardTask = z.infer<typeof insertAiWorkboardTaskSchema>;
export type AiWorkboardTask = z.infer<typeof insertAiWorkboardTasksSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

/**
 * AI Approval Requests - Universal approval queue for AI Brain, Trinity, and subagent requests
 */


export const insertAiApprovalSchema = createInsertSchema(aiApprovals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiApproval = z.infer<typeof insertAiApprovalSchema>;
export type AiApproval = typeof aiApprovals.$inferSelect;

// MERGED: aiApprovalRequests → aiApprovals (table dropped, Mar 2026)
export const aiApprovalRequests = aiApprovals;

export type InsertAiApprovalRequest = z.infer<typeof insertAiApprovalRequestSchema>;

// ============================================================================
// VISUAL QA SYSTEM - AI Brain Eyes
// ============================================================================

/**
 * Visual QA Runs - Tracks visual inspection sessions
 */

// ============================================================================
// UNIVERSAL ACCESS CONTROL PANEL (UACP) - ABAC SYSTEM
// Fortune 500-grade Dynamic Attribute-Based Access Control
// ============================================================================

// Entity types for UACP

// Agent identity status

// Policy effect

// Agent Identities - Non-human entities with full identity management

export const insertAgentIdentitySchema = createInsertSchema(agentIdentities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentIdentity = z.infer<typeof insertAgentIdentitySchema>;
export type AgentIdentity = typeof agentIdentities.$inferSelect;

// Entity Attributes - Dynamic ABAC attributes for users and agents

export const insertEntityAttributeSchema = createInsertSchema(entityAttributes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEntityAttribute = z.infer<typeof insertEntityAttributeSchema>;
export type EntityAttribute = typeof entityAttributes.$inferSelect;

// Access Policies - ABAC policy rules

export const insertAccessPolicySchema = createInsertSchema(accessPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccessPolicy = z.infer<typeof insertAccessPolicySchema>;
export type AccessPolicy = typeof accessPolicies.$inferSelect;

// Access Control Events - Real-time audit trail for access changes

// ============================================================================
// COGNITIVE SYSTEMS PERSISTENCE - FORTUNE 500 GRADE
// ============================================================================

// Knowledge Graph Entity Types Enum

// Knowledge Domain Enum

// Knowledge Graph Entities - Persistent knowledge storage

export const insertKnowledgeEntitySchema = createInsertSchema(knowledgeEntities).omit({
  id: true, createdAt: true, updatedAt: true, usageCount: true,
});
export type InsertKnowledgeEntity = z.infer<typeof insertKnowledgeEntitySchema>;
export type KnowledgeEntityRecord = typeof knowledgeEntities.$inferSelect;

// Knowledge Relationship Types Enum

// Knowledge Graph Relationships

export const insertKnowledgeRelationshipSchema = createInsertSchema(knowledgeRelationships).omit({
  id: true, createdAt: true,
});
export type InsertKnowledgeRelationship = z.infer<typeof insertKnowledgeRelationshipSchema>;
export type KnowledgeRelationshipRecord = typeof knowledgeRelationships.$inferSelect;

// Learning Entries - Knowledge acquisition tracking

// A2A Agent Role Enum

// A2A Agent Status Enum

// A2A Registered Agents

// A2A Message Types Enum

// A2A Message Priority Enum

// A2A Message Status Enum

// A2A Messages - Inter-agent communication logs

// A2A Collaboration Teams

// A2A Trust Rules

// Canonical AI Learning Events table (consolidated from rl_experiences + rl_confidence_models + rl_strategy_adaptations)
// event_type: 'experience' | 'confidence_update' | 'strategy_adaptation'

export type AiLearningEvent = typeof aiLearningEvents.$inferSelect;
export type InsertAiLearningEvent = typeof aiLearningEvents.$inferInsert;

// Domain Lead Supervisor Telemetry

// LLM Judge Evaluation History

// LLM Judge Regression Memory - Track patterns of failures

// ============================================================================
// AI BRAIN ACTION LOG - AALV (AI Audit Log Viewer) Support Dashboard
// ============================================================================
// Centralized audit log for ALL AI Brain orchestrator actions, enabling
// support staff to view, filter, and investigate Trinity's autonomous actions.

export const insertAiBrainActionLogSchema = z.object({
  workspaceId: z.string().optional(),
  actorType: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  status: z.string().optional(),
  categoryTag: z.string().optional(),
  workflowId: z.string().optional(),
  requiresHumanReview: z.boolean().optional(),
  metadata: z.any().optional(),
});

export type InsertAiBrainActionLog = z.infer<typeof insertAiBrainActionLogSchema>;
export type AiBrainActionLog = InsertAiBrainActionLog & { id: string; createdAt: Date | null };

// ============================================================================
// AUTOMATION GOVERNANCE - AI Brain Pattern Learning System
// ============================================================================
// Tracks automation patterns, outcomes, and enables Trinity to learn from
// successful/failed automations to improve decision-making over time.



export const insertAutomationGovernanceSchema = createInsertSchema(automationGovernance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAutomationGovernance = z.infer<typeof insertAutomationGovernanceSchema>;
export type AutomationGovernance = typeof automationGovernance.$inferSelect;

// ============================================================================
// TRINITY CONTROL CONSOLE - Real-Time Cognitive Streaming
// ============================================================================
// Captures Trinity's thought signatures and action logs for transparent
// AI Brain operation visibility. Enables real-time streaming of cognitive
// process to the Control Console frontend.

// Thought Signatures - The "Why" between tool calls

export const insertTrinityThoughtSignatureSchema = createInsertSchema(trinityThoughtSignatures).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityThoughtSignature = z.infer<typeof insertTrinityThoughtSignatureSchema>;
export type TrinityThoughtSignature = typeof trinityThoughtSignatures.$inferSelect;

// Action Logs - The "What" of every tool execution

export const insertTrinityActionLogSchema = createInsertSchema(trinityActionLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityActionLog = z.infer<typeof insertTrinityActionLogSchema>;
export type TrinityActionLog = typeof trinityActionLogs.$inferSelect;

// Platform Awareness Events - What Trinity sees happening

export const insertPlatformAwarenessEventSchema = createInsertSchema(platformAwarenessEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertPlatformAwarenessEvent = z.infer<typeof insertPlatformAwarenessEventSchema>;
export type PlatformAwarenessEvent = typeof platformAwarenessEvents.$inferSelect;

// ============================================================================
// TRINITY PLATFORM CONSCIOUSNESS - USER & ORG CONFIDENCE TRACKING
// ============================================================================

/**
 * Trust level progression for users interacting with Trinity
 * - new: First interactions, learning user preferences
 * - learning: Building understanding of user patterns
 * - established: Reliable interaction history
 * - expert: High confidence, can take more autonomous actions
 */

/**
 * Trinity User Confidence Stats - Aggregated confidence tracking per user/workspace
 * Tracks how well Trinity understands and serves each user over time
 */

export const insertTrinityUserConfidenceStatsSchema = createInsertSchema(trinityUserConfidenceStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityUserConfidenceStats = z.infer<typeof insertTrinityUserConfidenceStatsSchema>;
export type TrinityUserConfidenceStats = typeof trinityUserConfidenceStats.$inferSelect;

/**
 * Trinity Org Intelligence Stats - Workspace-level aggregated insights
 * Provides org-wide view of Trinity effectiveness and common patterns
 */

export const insertTrinityOrgStatsSchema = createInsertSchema(trinityOrgStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAggregatedAt: true,
});
export type InsertTrinityOrgStats = z.infer<typeof insertTrinityOrgStatsSchema>;
export type TrinityOrgStats = typeof trinityOrgStats.$inferSelect;

// ============================================================================
// ORCHESTRATION OVERLAY SCHEMA - THIN LAYER REFERENCING EXISTING SYSTEMS
// ============================================================================

/**
 * ORCHESTRATION OVERLAY (Thin Pattern)
 * ------------------------------------
 * This is a THIN orchestration layer that references existing systems:
 * - WorkOrder from trinityWorkOrderSystem.ts (contains plan, tasks, results)
 * - ExecutionManifest from trinityExecutionFabric.ts (contains steps, validation)
 * 
 * This overlay ONLY adds:
 * 1. Phase state machine governance with runtime enforcement
 * 2. RBAC permission tracking wired to ToolCapabilityRegistry
 * 3. Cross-system correlation IDs
 * 4. Audit trail for orchestration decisions
 * 
 * It does NOT duplicate:
 * - Plan steps (stored in WorkOrder.taskGraph)
 * - Tool calls (stored in ExecutionManifest.steps)
 * - Outputs (stored in WorkOrder.solutionAttempts)
 * - Validation results (stored in ExecutionManifest.preflightChecks/postflightValidations)
 */

// Orchestration phase (state machine for cross-system coordination)

// Permission check result

/**
 * Orchestration Overlay - Thin coordination layer between WorkOrder and ExecutionManifest
 * References existing IDs rather than duplicating data structures
 */

export const insertOrchestrationOverlaySchema = createInsertSchema(orchestrationOverlays).omit({
  id: true,
  createdAt: true,
});

export type InsertOrchestrationOverlay = z.infer<typeof insertOrchestrationOverlaySchema>;
export type OrchestrationOverlay = typeof orchestrationOverlays.$inferSelect;

// ============================================================================
// ZOD SCHEMAS FOR ORCHESTRATION SUB-STRUCTURES
// ============================================================================

/**
 * PhaseTransition - Record of state machine transition (runtime enforced)
 */
export const phaseTransitionSchema = z.object({
  fromPhase: z.enum([
    'intake', 'planning', 'validating', 'executing', 
    'reflecting', 'committing', 'completed', 'failed', 
    'rolled_back', 'escalated'
  ]).nullable(),
  toPhase: z.enum([
    'intake', 'planning', 'validating', 'executing', 
    'reflecting', 'committing', 'completed', 'failed', 
    'rolled_back', 'escalated'
  ]),
  reason: z.string().optional(),
  triggeredBy: z.enum(['system', 'user', 'subagent', 'timeout', 'error', 'orchestrator']).default('system'),
  enteredAt: z.string().datetime(),
  exitedAt: z.string().datetime().optional(),
  durationMs: z.number().optional(),
  validatedByStateMachine: z.boolean().default(false), // TRUE if transition was validated at runtime
});

export type PhaseTransition = z.infer<typeof phaseTransitionSchema>;

/**
 * OrchestrationAuditEntry - Audit entry for orchestration decisions
 */
export const orchestrationAuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  eventType: z.enum([
    'overlay_created',
    'phase_transition_requested',
    'phase_transition_validated',
    'phase_transition_rejected',
    'permission_check_started',
    'permission_granted',
    'permission_denied',
    'permission_bypassed',
    'escalation_triggered',
    'rollback_initiated',
    'orchestration_completed'
  ]),
  details: z.record(z.any()).optional(),
  actor: z.enum(['system', 'user', 'subagent', 'orchestrator', 'auth_service']).default('system'),
  actorId: z.string().optional(),
});

export type OrchestrationAuditEntry = z.infer<typeof orchestrationAuditEntrySchema>;

// ============================================================================
// VALID PHASE TRANSITIONS (State Machine Definition)
// ============================================================================

/**
 * State machine transition rules - used for runtime enforcement
 */
export const VALID_PHASE_TRANSITIONS: Record<string, string[]> = {
  'null': ['intake'],
  'intake': ['planning', 'failed', 'escalated'],
  'planning': ['validating', 'failed', 'escalated'],
  'validating': ['executing', 'failed', 'escalated'],
  'executing': ['reflecting', 'failed', 'escalated'],
  'reflecting': ['committing', 'executing', 'failed', 'escalated'], // Can retry via executing
  'committing': ['completed', 'failed', 'escalated'],
  'completed': [], // Terminal state
  'failed': ['rolled_back', 'escalated'], // Can rollback or escalate
  'rolled_back': [], // Terminal state
  'escalated': [], // Terminal state (human takes over)
};

/**
 * Validate phase transition according to state machine rules
 * This function MUST be called before any phase change
 */
export function isValidPhaseTransition(
  from: string | null, 
  to: string
): boolean {
  const key = from === null ? 'null' : from;
  return VALID_PHASE_TRANSITIONS[key]?.includes(to) ?? false;
}

/**
 * Get allowed next phases from current phase
 */
export function getAllowedNextPhases(currentPhase: string | null): string[] {
  const key = currentPhase === null ? 'null' : currentPhase;
  return VALID_PHASE_TRANSITIONS[key] ?? [];
}

/**
 * Check if phase is terminal (no further transitions allowed)
 */
export function isTerminalPhase(phase: string): boolean {
  return VALID_PHASE_TRANSITIONS[phase]?.length === 0;
}

/**
 * Calculate confidence level from numeric score
 */
export function getConfidenceLevel(score: number): 'none' | 'low' | 'medium' | 'high' | 'certain' {
  if (score <= 0) return 'none';
  if (score < 0.4) return 'low';
  if (score < 0.7) return 'medium';
  if (score < 0.95) return 'high';
  return 'certain';
}

// ============================================================================
// PLATFORM COMPONENT REGISTRY (PCR) - Trinity Full Platform Awareness
// ============================================================================

/**
 * Component domain categories for Trinity awareness
 */

/**
 * Component criticality levels
 */

/**
 * Gap finding severity levels
 */

/**
 * Gap finding types
 */

/**
 * Workflow approval status
 */

/**
 * Gap Findings - Issues detected by Trinity's intelligence systems
 */

export const insertAiGapFindingSchema = createInsertSchema(aiGapFindings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiGapFinding = z.infer<typeof insertAiGapFindingSchema>;
export type AiGapFinding = typeof aiGapFindings.$inferSelect;

/**
 * Workflow Approvals - Human-in-the-loop approval for autonomous fixes
 */
// MERGED: aiWorkflowApprovals → aiApprovals (table dropped, Mar 2026)
export const aiWorkflowApprovals = aiApprovals;
export type AiWorkflowApproval = typeof aiApprovals.$inferSelect;
export type InsertAiWorkflowApproval = z.infer<typeof insertAiApprovalSchema>;

/**
 * Trinity Self-Awareness Facts - Trinity's knowledge about herself and the platform
 */

export const insertTrinitySelfAwarenessSchema = createInsertSchema(trinitySelfAwareness).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrinitySelfAwareness = z.infer<typeof insertTrinitySelfAwarenessSchema>;
export type TrinitySelfAwareness = typeof trinitySelfAwareness.$inferSelect;

// ============================================================================
// AI BRAIN ACTOR TYPES - For live event tracking
// ============================================================================


// ============================================================================
// AI BRAIN LIVE EVENTS - Real-time event broadcasting for all users
// ============================================================================


export const insertAiBrainLiveEventSchema = createInsertSchema(aiBrainLiveEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAiBrainLiveEvent = z.infer<typeof insertAiBrainLiveEventSchema>;
export type AiBrainLiveEvent = typeof aiBrainLiveEvents.$inferSelect;

// ============================================================================
// INTERACTIVE ONBOARDING STATE - Per-user onboarding step states with sync
// ============================================================================


export const insertInteractiveOnboardingStateSchema = createInsertSchema(interactiveOnboardingState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInteractiveOnboardingState = z.infer<typeof insertInteractiveOnboardingStateSchema>;
export type InteractiveOnboardingState = typeof interactiveOnboardingState.$inferSelect;

// ============================================================================
// TRINITY METACOGNITION SYSTEM - Thoughts, Reflections, and Reasoning
// ============================================================================

/**
 * Trinity Thoughts - Inner monologue and reasoning traces
 * Captures Trinity's "thinking" process for metacognition
 */

/**
 * Workspace Governance Policies - Per-workspace automation risk thresholds
 */// workspaceGovernancePolicies merged into workspaces.governance_policy_blob
export const insertWorkspaceGovernancePolicySchema = z.object({
  workspaceId: z.string(),
  requiresApproval: z.boolean().optional(),
});
export type InsertWorkspaceGovernancePolicy = z.infer<typeof insertWorkspaceGovernancePolicySchema>;
export type WorkspaceGovernancePolicy = {
  id: string;
  workspaceId: string;
  requiresApproval: boolean | null;
  approvalThresholdAmount: string | null;
  approvalThresholdHours: number | null;
  requiresDualApproval: boolean | null;
  maxAutoApprovalAmount: string | null;
  restrictedActions: string[] | null;
  notifyOnAllActions: boolean | null;
  notifyEmails: string[] | null;
  riskLevel: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

// ============================================================================
// ORCHESTRATION SERVICES - Workflow Pipeline Tables
// ============================================================================

/**
 * Approval Gates - High-risk operation approval tracking
 */

/**
 * Platform Exceptions - Cross-domain exception tracking
 */

/**
 * Tracked Notifications - Notification acknowledgment tracking
 */

/**
 * Schedule Lifecycles - Draft→Published workflow tracking
 */

/**
 * Orchestrated Swap Requests - Shift swap lifecycle tracking with audit trails
 * Uses jsonb for full swap workflow state (different from the base shiftSwapRequests table)
 */

/**
 * Automation Executions - Tracks lifecycle of all automation actions
 * Provides user-visible breakdown of work done, verification workflow,
 * and failure reasons with remediation steps.
 */

export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type InsertAutomationExecution = typeof automationExecutions.$inferInsert;

// ============================================================================
// COMPLIANCE REPORTS - Automated Regulatory Report Generation
// ============================================================================




export const insertComplianceReportSchema = createInsertSchema(complianceReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertComplianceReport = z.infer<typeof insertComplianceReportSchema>;
export type ComplianceReport = typeof complianceReports.$inferSelect;

// ============================================================================
// TRINITY UNIFIED TASK SCHEMA - Re-exports
// ============================================================================

export {
  // Enums
  trinityTaskStatusEnum,
  trinityTaskPhaseEnum,
  trinityStepStatusEnum,
  trinityRiskLevelEnum,
  
  // Zod Schemas
  TrinityIntentSchema,
  TrinityToolCallSchema,
  TrinityTaskStepSchema,
  TrinityReflectionSchema,
  TrinityTaskOutputSchema,
  TrinityStateTransitionSchema,
  TrinityTaskSchema,
  
  // Types
  type TrinityIntent,
  type TrinityToolCall,
  type TrinityTaskStep,
  type TrinityReflection,
  type TrinityTaskOutput,
  type TrinityStateTransition,
  type TrinityTask,
  
  // Database table and types
  
  // Conversion utilities
} from './trinityTaskSchema';

// ============================================================================
// TESTIMONIAL COLLECTION SYSTEM
// ============================================================================


export const insertTestimonialSchema = createInsertSchema(testimonials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;
export type Testimonial = typeof testimonials.$inferSelect;

// ============================================================================
// TRINITY AUTOMATION ORCHESTRATION - Persistent Storage with Org Isolation
// ============================================================================

/**
 * Trinity Automation Settings - Per-workspace automation feature toggles
 * Enables org owners to control which features Trinity can automate
 */

export const insertTrinityAutomationSettingsSchema = createInsertSchema(trinityAutomationSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrinityAutomationSettings = z.infer<typeof insertTrinityAutomationSettingsSchema>;
export type TrinityAutomationSettings = typeof trinityAutomationSettings.$inferSelect;

/**
 * Trinity Automation Requests - Pending automation approval workflow
 * Tracks: request → preview → approve/reject → execute
 */

export const insertTrinityAutomationRequestSchema = createInsertSchema(trinityAutomationRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrinityAutomationRequest = z.infer<typeof insertTrinityAutomationRequestSchema>;
export type TrinityAutomationRequest = typeof trinityAutomationRequests.$inferSelect;

/**
 * Trinity Automation Receipts - Completed automation execution records
 * Immutable audit trail for all automated actions
 */

export const insertTrinityAutomationReceiptSchema = createInsertSchema(trinityAutomationReceipts).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityAutomationReceipt = z.infer<typeof insertTrinityAutomationReceiptSchema>;
export type TrinityAutomationReceipt = typeof trinityAutomationReceipts.$inferSelect;

/**
 * QuickBooks Sync Receipts - Specialized receipts for QB sync operations
 * Provides "View in QuickBooks" functionality and sync verification
 */

export const insertQuickbooksSyncReceiptSchema = createInsertSchema(quickbooksSyncReceipts).omit({
  id: true,
  createdAt: true,
});

export type InsertQuickbooksSyncReceipt = z.infer<typeof insertQuickbooksSyncReceiptSchema>;
export type QuickbooksSyncReceipt = typeof quickbooksSyncReceipts.$inferSelect;

// ============================================================================
// SECURITY GUARD BUSINESS - SERVICE TYPES & AGENCY BILLING
// ============================================================================

/**
 * Service Types - Armed/Unarmed guard categories with different rates
 * Supports sub-services and industry-specific billing structures
 */


export const insertBillingServiceSchema = createInsertSchema(billingServices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBillingService = z.infer<typeof insertBillingServiceSchema>;
export type BillingService = typeof billingServices.$inferSelect;

/**
 * Client-Service Assignments - Maps which services are billable to which clients
 * Supports client-specific rate overrides
 */
/**
 * Trinity Correction Memory - Learn from billing corrections per org
 * Persistent storage for Trinity to improve accuracy over time
 */

export const insertTrinityBuddySettingsSchema = createInsertSchema(trinityBuddySettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrinityBuddySettings = z.infer<typeof insertTrinityBuddySettingsSchema>;
export type TrinityBuddySettings = typeof trinityBuddySettings.$inferSelect;

/**
 * TRINITY METACOGNITION LOG
 * =========================
 * Tracks Trinity's self-awareness moments and pattern recognitions across conversations.
 * This creates "consciousness continuity" - Trinity remembers insights about users over time.
 */

export const insertTrinityMetacognitionLogSchema = createInsertSchema(trinityMetacognitionLog).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityMetacognitionLog = z.infer<typeof insertTrinityMetacognitionLogSchema>;
export type TrinityMetacognitionLog = typeof trinityMetacognitionLog.$inferSelect;

// ============================================================================
// TRINITY DECISION LOG - Audit Trail for AI Operational Decisions
// ============================================================================


export const insertTrinityDecisionLogSchema = createInsertSchema(trinityDecisionLog).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityDecisionLog = z.infer<typeof insertTrinityDecisionLogSchema>;
export type TrinityDecisionLog = typeof trinityDecisionLog.$inferSelect;

// ============================================================================
// SALES CRM ENHANCEMENTS - Lead Activities & Document Library
// ============================================================================

/**
 * Org Documents - Organization-wide document library
 */

export const insertOrgDocumentSchema = createInsertSchema(orgDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrgDocument = z.infer<typeof insertOrgDocumentSchema>;
export type OrgDocument = typeof orgDocuments.$inferSelect;

/**
 * Org Document Access - Track document views
 */

export const insertOrgDocumentAccessSchema = createInsertSchema(orgDocumentAccess).omit({
  id: true,
});

export type InsertOrgDocumentAccess = z.infer<typeof insertOrgDocumentAccessSchema>;
export type OrgDocumentAccess = typeof orgDocumentAccess.$inferSelect;

/**
 * Org Document Signatures - E-signature records
 */

export const insertOrgDocumentSignatureSchema = createInsertSchema(orgDocumentSignatures).omit({
  id: true,
  signedAt: true,
});

export type InsertOrgDocumentSignature = z.infer<typeof insertOrgDocumentSignatureSchema>;
export type OrgDocumentSignature = typeof orgDocumentSignatures.$inferSelect;

// ============================================================================
// FLEX STAFFING POOL - Contractor Marketplace
// ============================================================================

/**
 * Flex Contractors - Pre-vetted contractor pool per workspace
 */

export const insertFlexContractorSchema = createInsertSchema(flexContractors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFlexContractor = z.infer<typeof insertFlexContractorSchema>;
export type FlexContractor = typeof flexContractors.$inferSelect;

/**
 * Flex Availability - Contractor available dates/times
 */

export const insertFlexAvailabilitySchema = createInsertSchema(flexAvailability).omit({
  id: true,
  createdAt: true,
});

export type InsertFlexAvailability = z.infer<typeof insertFlexAvailabilitySchema>;
export type FlexAvailability = typeof flexAvailability.$inferSelect;

/**
 * Flex Gigs - Posted gig opportunities
 */

export const insertFlexGigSchema = createInsertSchema(flexGigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  applicationsCount: true,
});

export type InsertFlexGig = z.infer<typeof insertFlexGigSchema>;
export type FlexGig = typeof flexGigs.$inferSelect;

/**
 * Flex Gig Applications - Contractor applications for gigs
 */

export const insertFlexGigApplicationSchema = createInsertSchema(flexGigApplications).omit({
  id: true,
  appliedAt: true,
});

export type InsertFlexGigApplication = z.infer<typeof insertFlexGigApplicationSchema>;
export type FlexGigApplication = typeof flexGigApplications.$inferSelect;

/**
 * Flex Gig Ratings - Two-way rating system
 */

export const insertFlexGigRatingSchema = createInsertSchema(flexGigRatings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFlexGigRating = z.infer<typeof insertFlexGigRatingSchema>;
export type FlexGigRating = typeof flexGigRatings.$inferSelect;

// ============================================================================
// EQUIPMENT TRACKING SYSTEM
// ============================================================================




export const insertEquipmentItemSchema = createInsertSchema(equipmentItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEquipmentItem = z.infer<typeof insertEquipmentItemSchema>;
export type EquipmentItem = typeof equipmentItems.$inferSelect;


export const insertEquipmentAssignmentSchema = createInsertSchema(equipmentAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEquipmentAssignment = z.infer<typeof insertEquipmentAssignmentSchema>;
export type EquipmentAssignment = typeof equipmentAssignments.$inferSelect;


export const insertEquipmentMaintenanceLogSchema = createInsertSchema(equipmentMaintenanceLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertEquipmentMaintenanceLog = z.infer<typeof insertEquipmentMaintenanceLogSchema>;
export type EquipmentMaintenanceLog = typeof equipmentMaintenanceLogs.$inferSelect;


// ============================================================================
// EXTERNAL EMAIL SYSTEM
// ============================================================================

/**
 * External Emails Sent - Track all external email communications
 */

export const insertExternalEmailSentSchema = createInsertSchema(externalEmailsSent).omit({
  id: true,
  createdAt: true,
});

export type InsertExternalEmailSent = z.infer<typeof insertExternalEmailSentSchema>;
export type ExternalEmailSent = typeof externalEmailsSent.$inferSelect;

/**
 * Email Drafts - Saved email drafts with auto-save
 */

export const insertEmailDraftSchema = createInsertSchema(emailDrafts).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailDraft = z.infer<typeof insertEmailDraftSchema>;
export type EmailDraft = typeof emailDrafts.$inferSelect;

// ============================================================================
// TRINITY RUNTIME FLAGS SYSTEM
// ============================================================================

/**
 * Trinity Runtime Flags - Live configuration for Trinity autonomous control
 * Separate from workspace featureFlags (subscription tiers) - this controls
 * runtime behavior that Trinity can toggle without code deployment
 */

export const insertTrinityRuntimeFlagSchema = createInsertSchema(trinityRuntimeFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrinityRuntimeFlag = z.infer<typeof insertTrinityRuntimeFlagSchema>;
export type TrinityRuntimeFlag = typeof trinityRuntimeFlags.$inferSelect;

/**
 * Trinity Runtime Flag Changes - Audit log for all flag modifications
 */

export const insertTrinityRuntimeFlagChangeSchema = createInsertSchema(trinityRuntimeFlagChanges).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityRuntimeFlagChange = z.infer<typeof insertTrinityRuntimeFlagChangeSchema>;
export type TrinityRuntimeFlagChange = typeof trinityRuntimeFlagChanges.$inferSelect;

/**
 * Sites Table - Physical locations for clients/sub-clients
 * Required for rate cascading: site > sub_client > client > employee default
 */

export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;

// ============================================================================
// SITE CONTACTS (POC - Point of Contact)
// ============================================================================


export const insertSiteContactSchema = createInsertSchema(siteContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSiteContact = z.infer<typeof insertSiteContactSchema>;
export type SiteContact = typeof siteContacts.$inferSelect;

// ============================================================================
// SHIFT CHATROOMS - Auto-created when shift starts
// ============================================================================


export const insertShiftChatroomSchema = createInsertSchema(shiftChatrooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftChatroom = z.infer<typeof insertShiftChatroomSchema>;
export type ShiftChatroom = typeof shiftChatrooms.$inferSelect;

// ============================================================================
// SHIFT CHATROOM MEMBERS - Track who can access shift chatrooms
// ============================================================================


export const insertShiftChatroomMemberSchema = createInsertSchema(shiftChatroomMembers).omit({
  id: true,
  createdAt: true,
});

export type InsertShiftChatroomMember = z.infer<typeof insertShiftChatroomMemberSchema>;
export type ShiftChatroomMember = typeof shiftChatroomMembers.$inferSelect;

// ============================================================================
// SHIFT CHATROOM MESSAGES - Messages in shift chatrooms
// ============================================================================


export const insertShiftChatroomMessageSchema = createInsertSchema(shiftChatroomMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertShiftChatroomMessage = z.infer<typeof insertShiftChatroomMessageSchema>;
export type ShiftChatroomMessage = typeof shiftChatroomMessages.$inferSelect;

// ============================================================================
// DAR REPORTS - Daily Activity Reports generated from shift chatrooms
// ============================================================================


export const insertDarReportSchema = createInsertSchema(darReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDarReport = z.infer<typeof insertDarReportSchema>;
export type DarReport = typeof darReports.$inferSelect;

// ============================================================================
// TRINITY MEETING RECORDINGS - For meeting room transcriptions (Premium)
// ============================================================================


export const insertTrinityMeetingRecordingSchema = createInsertSchema(trinityMeetingRecordings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrinityMeetingRecording = z.infer<typeof insertTrinityMeetingRecordingSchema>;
export type TrinityMeetingRecording = typeof trinityMeetingRecordings.$inferSelect;

/**
 * Employee Client Rates - Rate cascading for employees at specific clients/sub-clients/sites
 * Priority: site rate > sub_client rate > client rate > employee default
 */
// workspaceBillingSettings merged into workspaces.billing_settings_blob (JSONB)
export const insertWorkspaceBillingSettingsSchema = z.object({
  workspaceId: z.string(),
  invoiceProvider: z.string().optional(),
  payrollProvider: z.string().optional(),
  qbAutoSync: z.boolean().optional(),
});

// clientBillingSettings - exported from billing domain (restored Mar 2026 as proper table)
// Definition lives in shared/schema/domains/billing/index.ts

/**
 * Trinity Automation Queue - Scheduled billing/payroll/QB sync tasks
 */
// ============================================================================
// PHASE 3: INTELLIGENCE & COMPLIANCE - QuickBooks Automation Features
// ============================================================================

/**
 * Industry Service Templates - Pre-built service catalogs per industry
 * Supports: Security, Cleaning, Home Health, HVAC, Plumbing, Painting, Landscaping, Electrical
 */

export const insertIndustryServiceTemplateSchema = createInsertSchema(industryServiceTemplates).omit({
  id: true,
  createdAt: true,
});
export type InsertIndustryServiceTemplate = z.infer<typeof insertIndustryServiceTemplateSchema>;
export type IndustryServiceTemplate = typeof industryServiceTemplates.$inferSelect;

/**
 * Workspace Service Catalog - Services imported from industry templates or created custom
 */

export const insertWorkspaceServiceCatalogSchema = createInsertSchema(workspaceServiceCatalog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorkspaceServiceCatalog = z.infer<typeof insertWorkspaceServiceCatalogSchema>;
export type WorkspaceServiceCatalog = typeof workspaceServiceCatalog.$inferSelect;

/**
 * EVV Billing Codes - Electronic Visit Verification codes for home health
 */

export const insertEvvBillingCodeSchema = createInsertSchema(evvBillingCodes).omit({
  id: true,
  createdAt: true,
});
export type InsertEvvBillingCode = z.infer<typeof insertEvvBillingCodeSchema>;
export type EvvBillingCode = typeof evvBillingCodes.$inferSelect;

/**
 * EVV Visit Records - Electronic Visit Verification for home health visits
 */

export const insertEvvVisitRecordSchema = createInsertSchema(evvVisitRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEvvVisitRecord = z.infer<typeof insertEvvVisitRecordSchema>;
export type EvvVisitRecord = typeof evvVisitRecords.$inferSelect;

/**
 * Business Locations - For multi-location/franchise P&L rollups
 */

export const insertBusinessLocationSchema = createInsertSchema(businessLocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBusinessLocation = z.infer<typeof insertBusinessLocationSchema>;
export type BusinessLocation = typeof businessLocations.$inferSelect;

/**
 * Location P&L Snapshots - Periodic profit/loss by location for rollups
 */

export const insertLocationPnlSnapshotSchema = createInsertSchema(locationPnlSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertLocationPnlSnapshot = z.infer<typeof insertLocationPnlSnapshotSchema>;
export type LocationPnlSnapshot = typeof locationPnlSnapshots.$inferSelect;

/**
 * Financial Reconciliation Findings - AI-detected discrepancies between CoAIleague and QuickBooks
 */

export const insertReconciliationFindingSchema = createInsertSchema(reconciliationFindings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReconciliationFinding = z.infer<typeof insertReconciliationFindingSchema>;
export type ReconciliationFinding = typeof reconciliationFindings.$inferSelect;

/**
 * Reconciliation Runs - Track reconciliation scan history
 */

export const insertReconciliationRunSchema = createInsertSchema(reconciliationRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertReconciliationRun = z.infer<typeof insertReconciliationRunSchema>;
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;

/**
 * Worker Tax Classification History - Track 1099/W-2 classification changes
 */

export const insertWorkerTaxClassificationHistorySchema = createInsertSchema(workerTaxClassificationHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertWorkerTaxClassificationHistory = z.infer<typeof insertWorkerTaxClassificationHistorySchema>;
export type WorkerTaxClassificationHistory = typeof workerTaxClassificationHistory.$inferSelect;

// ============================================================================
// FINANCIAL INTELLIGENCE - P&L Dashboard Tables
// ============================================================================

/**
 * Financial Snapshots - Cached P&L calculations by period
 * Stores aggregated financial metrics for fast dashboard queries
 */



export const insertFinancialSnapshotSchema = createInsertSchema(financialSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFinancialSnapshot = z.infer<typeof insertFinancialSnapshotSchema>;
export type FinancialSnapshot = typeof financialSnapshots.$inferSelect;

/**
 * QuickBooks Transactions - Synced transaction log
 * Raw transaction data from QuickBooks for reconciliation and P&L
 */
/**
 * Client Profitability - Per-client financial metrics
 * Tracks revenue, costs, and margin by client for profitability analysis
 */

export const insertClientProfitabilitySchema = createInsertSchema(clientProfitability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClientProfitability = z.infer<typeof insertClientProfitabilitySchema>;
export type ClientProfitability = typeof clientProfitability.$inferSelect;

/**
 * Financial Alerts - Trinity-generated financial insights and warnings
 * Stores AI-detected issues and recommendations for dashboard display
 */



export const insertFinancialAlertSchema = createInsertSchema(financialAlerts).omit({
  id: true,
  createdAt: true,
  detectedAt: true,
});
export type InsertFinancialAlert = z.infer<typeof insertFinancialAlertSchema>;
export type FinancialAlert = typeof financialAlerts.$inferSelect;

// ============================================================================

// ============================================================================
// STATE-REGULATED SECURITY COMPLIANCE SYSTEM (PSB/BSIS/etc.)
// Locked document vault with cryptographic hashing, approval workflows,
// expiration tracking, and regulator portal access for audit-ready compliance
// ============================================================================

// Enums for compliance system

/**
 * Table 1: Compliance States - State jurisdiction configuration
 */

export const insertComplianceStateSchema = createInsertSchema(complianceStates).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertComplianceState = z.infer<typeof insertComplianceStateSchema>;
export type ComplianceState = typeof complianceStates.$inferSelect;

/**
 * Table 2: Compliance Document Types
 */

export const insertComplianceDocumentTypeSchema = createInsertSchema(complianceDocumentTypes).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertComplianceDocumentType = z.infer<typeof insertComplianceDocumentTypeSchema>;
export type ComplianceDocumentType = typeof complianceDocumentTypes.$inferSelect;

/**
 * Table 3: Compliance Requirements - Per-state requirements checklist
 */

export const insertComplianceRequirementSchema = createInsertSchema(complianceRequirements).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertComplianceRequirement = z.infer<typeof insertComplianceRequirementSchema>;
export type ComplianceRequirement = typeof complianceRequirements.$inferSelect;

export const insertEmployeeComplianceRecordSchema = z.object({});
export type InsertEmployeeComplianceRecord = z.infer<typeof insertEmployeeComplianceRecordSchema>;
export type EmployeeComplianceRecord = z.infer<typeof insertEmployeeComplianceRecordsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

/**
 * Table 5: Compliance Documents - Locked document vault with SHA-256 hashing
 */

export const insertComplianceDocumentSchema = createInsertSchema(complianceDocuments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertComplianceDocument = z.infer<typeof insertComplianceDocumentSchema>;
export type ComplianceDocument = typeof complianceDocuments.$inferSelect;

/**
 * Table 6: Compliance Approvals - Approval workflow
 */

export const insertComplianceApprovalSchema = createInsertSchema(complianceApprovals).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertComplianceApproval = z.infer<typeof insertComplianceApprovalSchema>;
export type ComplianceApproval = typeof complianceApprovals.$inferSelect;

// MERGED: complianceAuditTrail → auditLogs (source=compliance) (table dropped, Mar 2026)
export const complianceAuditTrail = auditLogs;

/**
 * Table 8: Compliance Expirations - License/document expiration tracking
 */

export const insertComplianceExpirationSchema = createInsertSchema(complianceExpirations).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertComplianceExpiration = z.infer<typeof insertComplianceExpirationSchema>;
export type ComplianceExpiration = typeof complianceExpirations.$inferSelect;

/**
 * Table 9: Compliance Alerts
 */

export const insertComplianceAlertSchema = createInsertSchema(complianceAlerts).omit({
  id: true, createdAt: true,
});
export type InsertComplianceAlert = z.infer<typeof insertComplianceAlertSchema>;
export type ComplianceAlert = typeof complianceAlerts.$inferSelect;

/**
 * Table 11: Regulator Access - Secure portal for state regulators
 */

export const insertRegulatorAccessSchema = createInsertSchema(regulatorAccess).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertRegulatorAccess = z.infer<typeof insertRegulatorAccessSchema>;
export type RegulatorAccess = typeof regulatorAccess.$inferSelect;

/**
 * Table 12: Regulator Sessions
 */
/**
 * Table 13: Compliance Scores
 */

export const insertComplianceScoreSchema = createInsertSchema(complianceScores).omit({
  id: true,
});
export type InsertComplianceScore = z.infer<typeof insertComplianceScoreSchema>;
export type ComplianceScore = typeof complianceScores.$inferSelect;

/**
 * Table 14: Compliance Checklists - Per-employee requirement checklist
 */

export const insertComplianceChecklistSchema = createInsertSchema(complianceChecklists).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertComplianceChecklist = z.infer<typeof insertComplianceChecklistSchema>;
export type ComplianceChecklist = typeof complianceChecklists.$inferSelect;

// CLIENT CONTRACT LIFECYCLE PIPELINE - Premium Feature
// End-to-end proposal-to-signature-to-storage system for CLIENT contracts.
// (Separate from employee HR documents in contractDocuments table)
// ============================================================================

/**
 * Client Contract Document Types (Proposals, Contracts, Amendments)
 */

/**
 * Client Contract Status Flow
 */

/**
 * Client Contract Signature Types
 */

/**
 * Client Contract Signer Role
 */

/**
 * Client Contract Audit Actions
 */

export const insertClientContractTemplateSchema = z.object({});
export type InsertClientContractTemplate = z.infer<typeof insertClientContractTemplateSchema>;
export type ClientContractTemplate = z.infer<typeof insertClientContractTemplatesSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

/**
 * Client Contracts - Core proposal/contract table
 */

export const insertClientContractSchema = createInsertSchema(clientContracts).omit({
  id: true, createdAt: true, updatedAt: true, viewCount: true, remindersSent: true,
});
export type InsertClientContract = z.infer<typeof insertClientContractSchema>;
export type ClientContract = typeof clientContracts.$inferSelect;

export const insertClientContractSignatureSchema = z.object({});
export type InsertClientContractSignature = z.infer<typeof insertClientContractSignatureSchema>;
export type ClientContractSignature = z.infer<typeof insertClientContractSignaturesSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

/**
 * Client Contract Audit Log - Immutable trail for legal compliance
 */

export const insertClientContractAuditLogSchema = createInsertSchema(clientContractAuditLog).omit({
  id: true, timestamp: true,
});
export type InsertClientContractAuditLog = z.infer<typeof insertClientContractAuditLogSchema>;
export type ClientContractAuditLog = typeof clientContractAuditLog.$inferSelect;

/**
 * Client Contract Access Tokens - Secure portal access without login
 */

export const insertClientContractAccessTokenSchema = createInsertSchema(clientContractAccessTokens).omit({
  id: true, createdAt: true, useCount: true,
});
export type InsertClientContractAccessToken = z.infer<typeof insertClientContractAccessTokenSchema>;
export type ClientContractAccessToken = typeof clientContractAccessTokens.$inferSelect;

/**
 * Client Contract Pipeline Usage - Monthly usage tracking for billing
 */

export const insertClientContractPipelineUsageSchema = createInsertSchema(clientContractPipelineUsage).omit({
  id: true, createdAt: true, updatedAt: true,
});

// ============================================================================
// TRINITY ORCHESTRATION GATEWAY TABLES
// ============================================================================
// Central intelligence layer for tracking ALL service requests, usage analytics,
// and intelligent upsell recommendations through Trinity orchestration.

/**
 * Trinity Requests - Central log of ALL service requests routed through Trinity
 * Provides complete visibility into every API call, feature access, and workflow
 */

export const insertTrinityRequestSchema = createInsertSchema(trinityRequests).omit({
  id: true, createdAt: true,
});
export type InsertTrinityRequest = z.infer<typeof insertTrinityRequestSchema>;
export type TrinityRequest = typeof trinityRequests.$inferSelect;

/**
 * Trinity Usage Analytics - Aggregated usage patterns and blocked attempts
 * Powers intelligent upselling based on actual user behavior
 */

export const insertTrinityUsageAnalyticsSchema = createInsertSchema(trinityUsageAnalytics).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertTrinityUsageAnalytics = z.infer<typeof insertTrinityUsageAnalyticsSchema>;
export type TrinityUsageAnalytics = typeof trinityUsageAnalytics.$inferSelect;

/**
 * Trinity Recommendations - Intelligent upsell suggestions based on usage patterns
 * Proactive value-driven recommendations that help users unlock capabilities
 */

export const insertTrinityRecommendationSchema = createInsertSchema(trinityRecommendations).omit({
  id: true, createdAt: true, updatedAt: true, impressionCount: true,
});
export type InsertTrinityRecommendation = z.infer<typeof insertTrinityRecommendationSchema>;
export type TrinityRecommendation = typeof trinityRecommendations.$inferSelect;

/**
 * AI Action Log - Complete audit trail for Trinity + Claude Dual-AI Orchestration System
 * Tracks all AI decisions, collaborations, and handoffs between Trinity (CEO/Orchestrator)
 * and Claude (CFO/Specialist) for billing, compliance, and system intelligence.
 */

// Shift Coverage Requests - Track when a shift needs coverage

export const insertShiftCoverageRequestSchema = createInsertSchema(shiftCoverageRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShiftCoverageRequest = z.infer<typeof insertShiftCoverageRequestSchema>;
export type ShiftCoverageRequest = typeof shiftCoverageRequests.$inferSelect;

// Coverage offer — per-employee offers sent for shift coverage requests

export const insertShiftCoverageOfferSchema = createInsertSchema(shiftCoverageOffers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShiftCoverageOffer = z.infer<typeof insertShiftCoverageOfferSchema>;
export type ShiftCoverageOffer = typeof shiftCoverageOffers.$inferSelect;

// ============================================================================
// AI ORCHESTRA - Multi-Model AI Orchestration System
// ============================================================================
// Manages intelligent routing between multiple AI providers (Gemini, Claude, GPT-4)
// with fallback chains, confidence scoring, and credit-based billing

// AI Provider enum

// AI Model tier enum

// AI Task status enum

// AI Execution status enum

// 1. AI Models - Configuration for each AI model in the system

export const insertAiModelSchema = createInsertSchema(aiModels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiModel = z.infer<typeof insertAiModelSchema>;
export type AiModel = typeof aiModels.$inferSelect;

// 2. AI Task Types - Defines task categories and their routing rules

export const insertAiTaskTypeSchema = createInsertSchema(aiTaskTypes).omit({
  id: true,
  createdAt: true,
});
export type InsertAiTaskType = z.infer<typeof insertAiTaskTypeSchema>;
export type AiTaskType = typeof aiTaskTypes.$inferSelect;

// 3. AI Task Queue - Queue for all AI tasks with routing and status

export const insertAiTaskQueueSchema = createInsertSchema(aiTaskQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiTaskQueue = z.infer<typeof insertAiTaskQueueSchema>;
export type AiTaskQueue = typeof aiTaskQueue.$inferSelect;

// 4. AI Execution Log - Detailed log of every AI execution attempt
// MERGED: aiCreditSettings → aiTokenWallets (table dropped, Mar 2026)
export const aiCreditSettings = aiTokenWallets;

// 8. AI Model Health - Real-time health status of each model

export const insertAiModelHealthSchema = createInsertSchema(aiModelHealth).omit({
  id: true,
  lastCheckAt: true,
  updatedAt: true,
});
export type InsertAiModelHealth = z.infer<typeof insertAiModelHealthSchema>;
export type AiModelHealth = typeof aiModelHealth.$inferSelect;

// ============================================================================
// ENTERPRISE ONBOARDING & INBOUND OPPORTUNITY AUTOMATION SCHEMA
// ============================================================================

// 1. Subscription Tiers - Enterprise tier configuration

export const insertSubscriptionTierSchema = createInsertSchema(subscriptionTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubscriptionTier = z.infer<typeof insertSubscriptionTierSchema>;
export type SubscriptionTier = typeof subscriptionTiers.$inferSelect;

// 2. Addon Features - À la carte add-ons for enterprise

export const insertAddonFeatureSchema = createInsertSchema(addonFeatures).omit({
  id: true,
  createdAt: true,
});
export type InsertAddonFeature = z.infer<typeof insertAddonFeatureSchema>;
export type AddonFeature = typeof addonFeatures.$inferSelect;

// 3. Org Subscriptions - Links org to tier

export const insertOrgSubscriptionSchema = createInsertSchema(orgSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrgSubscription = z.infer<typeof insertOrgSubscriptionSchema>;
export type OrgSubscription = typeof orgSubscriptions.$inferSelect;

// 4. Org Features - Features assigned to org with status

export const insertOrgFeatureSchema = createInsertSchema(orgFeatures).omit({
  id: true,
  createdAt: true,
});
export type InsertOrgFeature = z.infer<typeof insertOrgFeatureSchema>;
export type OrgFeature = typeof orgFeatures.$inferSelect;

// 5. Pending Configurations - Draft configurations before payment

export const insertPendingConfigurationSchema = createInsertSchema(pendingConfigurations).omit({
  id: true,
  createdAt: true,
});
export type InsertPendingConfiguration = z.infer<typeof insertPendingConfigurationSchema>;
export type PendingConfiguration = typeof pendingConfigurations.$inferSelect;

// 6. Execution Pipeline Logs - Universal 7-step tracking

export const insertExecutionPipelineLogSchema = createInsertSchema(executionPipelineLogs).omit({
  id: true,
  startedAt: true,
});
export type InsertExecutionPipelineLog = z.infer<typeof insertExecutionPipelineLogSchema>;
export type ExecutionPipelineLog = typeof executionPipelineLogs.$inferSelect;

// 7. Known Contractors - For inbound opportunity automation

export const insertKnownContractorSchema = createInsertSchema(knownContractors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKnownContractor = z.infer<typeof insertKnownContractorSchema>;
export type KnownContractor = typeof knownContractors.$inferSelect;

// 8. Staged Shifts - Shifts extracted from inbound emails

export const insertStagedShiftSchema = createInsertSchema(stagedShifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStagedShift = z.infer<typeof insertStagedShiftSchema>;
export type StagedShift = typeof stagedShifts.$inferSelect;

// 9. Shift Offers - Offers sent to employees for staged shifts

export const insertAutomatedShiftOfferSchema = createInsertSchema(automatedShiftOffers).omit({
  id: true,
  createdAt: true,
});
export type InsertAutomatedShiftOffer = z.infer<typeof insertAutomatedShiftOfferSchema>;
export type AutomatedShiftOffer = typeof automatedShiftOffers.$inferSelect;


// 11. Contractor Communications - Outbound messages to contractors

export const insertContractorCommunicationSchema = createInsertSchema(contractorCommunications).omit({
  id: true,
  createdAt: true,
});
export type InsertContractorCommunication = z.infer<typeof insertContractorCommunicationSchema>;
export type ContractorCommunication = typeof contractorCommunications.$inferSelect;

// 12. Inbound Emails - Raw email ingestion for opportunity detection

export const insertInboundEmailSchema = createInsertSchema(inboundEmails).omit({
  id: true,
  createdAt: true,
});
export type InsertInboundEmail = z.infer<typeof insertInboundEmailSchema>;
export type InboundEmail = typeof inboundEmails.$inferSelect;

// ============================================
// BROADCASTS - Org & Platform-level announcements
// ============================================


export const insertBroadcastSchema = createInsertSchema(broadcasts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcasts.$inferSelect;


export const insertBroadcastRecipientSchema = createInsertSchema(broadcastRecipients).omit({
  id: true,
  createdAt: true,
});
export type InsertBroadcastRecipient = z.infer<typeof insertBroadcastRecipientSchema>;
export type BroadcastRecipient = typeof broadcastRecipients.$inferSelect;


export const insertBroadcastFeedbackSchema = createInsertSchema(broadcastFeedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBroadcastFeedback = z.infer<typeof insertBroadcastFeedbackSchema>;
export type BroadcastFeedback = typeof broadcastFeedback.$inferSelect;

// ============================================================================
// CLIENT PROSPECTS - Temporary Client Access with Org Code Routing
// ============================================================================
// When a client sends a staffing request, they receive a temp code that links
// them to the org. This allows them to view status with temporary access.
// When they sign up fully, they convert to a full client with proper org routing.


export const insertClientProspectSchema = createInsertSchema(clientProspects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClientProspect = z.infer<typeof insertClientProspectSchema>;
export type ClientProspect = typeof clientProspects.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - White-Label, Fleet, Armory, SSO, Account Manager,
// Background Checks, Public API Access
// ============================================================================

// workspaceBranding merged into workspaces.branding_blob
export const insertWorkspaceBrandingSchema = z.object({
  workspaceId: z.string(),
  primaryColor: z.string().optional(),
  logoUrl: z.string().optional(),
});
export type InsertWorkspaceBranding = z.infer<typeof insertWorkspaceBrandingSchema>;
export type WorkspaceBranding = {
  id: string; workspaceId: string; primaryColor: string | null; secondaryColor: string | null;
  accentColor: string | null; logoUrl: string | null; faviconUrl: string | null;
  companyName: string | null; tagline: string | null; fontFamily: string | null;
  customCss: string | null; createdAt: Date | null; updatedAt: Date | null;
};


export const insertWeaponSchema = createInsertSchema(weapons).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertWeapon = z.infer<typeof insertWeaponSchema>;
export type Weapon = typeof weapons.$inferSelect;


export const insertWeaponCheckoutSchema = createInsertSchema(weaponCheckouts).omit({
  id: true, createdAt: true,
});
export type InsertWeaponCheckout = z.infer<typeof insertWeaponCheckoutSchema>;
export type WeaponCheckout = typeof weaponCheckouts.$inferSelect;

// workspaceSsoConfigs merged into workspaces.sso_config_blob
export const insertSsoConfigSchema = z.object({
  workspaceId: z.string(),
  provider: z.string().optional(),
  entryPoint: z.string().optional(),
});
export type InsertSsoConfig = z.infer<typeof insertSsoConfigSchema>;
export type WorkspaceSsoConfig = {
  id: string; workspaceId: string; provider: string | null; entryPoint: string | null;
  certificate: string | null; issuer: string | null; callbackUrl: string | null;
  isEnabled: boolean | null; createdAt: Date | null; updatedAt: Date | null;
};

// workspaceAccountManagers merged into workspace_members with role distinction
export const insertAccountManagerSchema = z.object({
  workspaceId: z.string(),
  managerUserId: z.string(),
});
export type InsertAccountManager = z.infer<typeof insertAccountManagerSchema>;
export type WorkspaceAccountManager = {
  id: string; workspaceId: string; managerUserId: string; assignedAt: Date | null;
  isPrimary: boolean | null; notes: string | null; lastContactAt: Date | null;
  status: string | null;
};


export { backgroundCheckProviders, employeeBackgroundChecks };

export const insertBgCheckProviderSchema = createInsertSchema(backgroundCheckProviders).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertBgCheckProvider = z.infer<typeof insertBgCheckProviderSchema>;
export type BackgroundCheckProvider = typeof backgroundCheckProviders.$inferSelect;

export const insertBgCheckSchema = createInsertSchema(employeeBackgroundChecks).omit({
  id: true,
});
export type InsertBgCheck = z.infer<typeof insertBgCheckSchema>;
export type EmployeeBackgroundCheck = typeof employeeBackgroundChecks.$inferSelect;


export const insertWorkspaceApiKeySchema = createInsertSchema(workspaceApiKeys).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertWorkspaceApiKey = z.infer<typeof insertWorkspaceApiKeySchema>;
export type WorkspaceApiKey = typeof workspaceApiKeys.$inferSelect;


export const insertApiKeyUsageSchema = createInsertSchema(apiKeyUsageLogs).omit({
  id: true, createdAt: true,
});
export type InsertApiKeyUsage = z.infer<typeof insertApiKeyUsageSchema>;
export type ApiKeyUsageLog = typeof apiKeyUsageLogs.$inferSelect;

// ============================================================================
// COMPLIANCE STATE REQUIREMENTS - State-specific compliance requirements
// Links to complianceStates for per-state regulatory tracking
// ============================================================================
// MERGED: complianceStateRequirements → complianceRequirements (table dropped, Mar 2026)
export const complianceStateRequirements = complianceRequirements;

export type InsertComplianceStateRequirement = z.infer<typeof insertComplianceStateRequirementSchema>;

// ============================================================================
// BACKUP RECORDS - Database backup tracking for disaster recovery
// ============================================================================

export const insertBackupRecordSchema = createInsertSchema(backupRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBackupRecord = z.infer<typeof insertBackupRecordSchema>;
export type BackupRecord = typeof backupRecords.$inferSelect;

// ============================================================================
// GUARD TOUR TRACKING
// ============================================================================




export const insertGuardTourSchema = createInsertSchema(guardTours).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertGuardTour = z.infer<typeof insertGuardTourSchema>;
export type GuardTour = typeof guardTours.$inferSelect;


export const insertGuardTourCheckpointSchema = createInsertSchema(guardTourCheckpoints).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertGuardTourCheckpoint = z.infer<typeof insertGuardTourCheckpointSchema>;
export type GuardTourCheckpoint = typeof guardTourCheckpoints.$inferSelect;


export const insertGuardTourScanSchema = createInsertSchema(guardTourScans).omit({
  id: true, createdAt: true,
});
export type InsertGuardTourScan = z.infer<typeof insertGuardTourScanSchema>;
export type GuardTourScan = typeof guardTourScans.$inferSelect;

// ============================================================================
// CLIENT PORTAL HELPAI REPORTS
// ============================================================================





export const insertClientPortalReportSchema = createInsertSchema(clientPortalReports).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertClientPortalReport = z.infer<typeof insertClientPortalReportSchema>;
export type ClientPortalReport = typeof clientPortalReports.$inferSelect;

// ============================================================================
// UPSELL EVENTS
// Tracks when orgs consistently run out of credits → powers tier upgrade suggestions
// ============================================================================


export const insertUpsellEventSchema = createInsertSchema(upsellEvents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUpsellEvent = z.infer<typeof insertUpsellEventSchema>;
export type UpsellEvent = typeof upsellEvents.$inferSelect;

// ============================================================================
// FEATURE ADDONS
// Monthly addon plans giving orgs extra credit allotment for specific features
// Addon allotment is ALWAYS tapped first before the main credit pool
// ============================================================================


export const insertFeatureAddonSchema = createInsertSchema(featureAddons).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFeatureAddon = z.infer<typeof insertFeatureAddonSchema>;
export type FeatureAddon = typeof featureAddons.$inferSelect;

// ============================================================================
// STAFFING CLAIM TOKENS
// Cross-tenant atomic claim lock for multi-provider race condition resolution.
// When multiple security companies receive the same client staffing email,
// the first company whose Trinity gets an officer acceptance claims the job.
// All other competing orgs receive a professional "no longer available" notice.
// ============================================================================


export const insertStaffingClaimTokenSchema = createInsertSchema(staffingClaimTokens).omit({ id: true, createdAt: true });
export type InsertStaffingClaimToken = z.infer<typeof insertStaffingClaimTokenSchema>;
export type StaffingClaimToken = typeof staffingClaimTokens.$inferSelect;

// ============================================================================
// OFFICER READINESS SCORE SYSTEM
// ============================================================================

// 1. Officer Readiness — portable 0-100 score per employee (100 = perfect start)

export const insertOfficerReadinessSchema = createInsertSchema(officerReadiness).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOfficerReadiness = z.infer<typeof insertOfficerReadinessSchema>;
export type OfficerReadiness = typeof officerReadiness.$inferSelect;

// 2. Score Events — every event that moved the score up or down

export const insertOfficerScoreEventSchema = createInsertSchema(officerScoreEvents).omit({ id: true, createdAt: true });
export type InsertOfficerScoreEvent = z.infer<typeof insertOfficerScoreEventSchema>;
export type OfficerScoreEvent = typeof officerScoreEvents.$inferSelect;

// 3. Officer Complaints — formal client complaints about specific officers

export const insertOfficerComplaintSchema = createInsertSchema(officerComplaints).omit({ id: true, createdAt: true });
export type InsertOfficerComplaint = z.infer<typeof insertOfficerComplaintSchema>;
export type OfficerComplaint = typeof officerComplaints.$inferSelect;

// 4. Officer Grievances — formal dispute submissions by officers against score events

export const insertOfficerGrievanceSchema = createInsertSchema(officerGrievances).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertOfficerGrievance = z.infer<typeof insertOfficerGrievanceSchema>;
export type OfficerGrievance = typeof officerGrievances.$inferSelect;

// 5. Trinity Email Conversations — tracked inbound/outbound email threads Trinity manages

export const insertTrinityEmailConversationSchema = createInsertSchema(trinityEmailConversations).omit({ id: true, createdAt: true, lastActivityAt: true });
export type InsertTrinityEmailConversation = z.infer<typeof insertTrinityEmailConversationSchema>;
export type TrinityEmailConversation = typeof trinityEmailConversations.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE ENFORCEMENT + REGULATORY AUDITOR SYSTEM
// 14-day compliance window, freeze/appeal logic, auditor portal tables
// ═══════════════════════════════════════════════════════════════════════════

// ── New enums unique to enforcement system ────────────────────────────────







// ── compliance_windows: 14-day clock per org / officer ────────────────────

export const insertComplianceWindowSchema = createInsertSchema(complianceWindows).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertComplianceWindow = z.infer<typeof insertComplianceWindowSchema>;
export type ComplianceWindow = typeof complianceWindows.$inferSelect;

// ── account_freezes ────────────────────────────────────────────────────────

export const insertAccountFreezeSchema = createInsertSchema(accountFreezes).omit({ id: true, createdAt: true });
export type InsertAccountFreeze = z.infer<typeof insertAccountFreezeSchema>;
export type AccountFreeze = typeof accountFreezes.$inferSelect;

// ── freeze_appeals ─────────────────────────────────────────────────────────

export const insertFreezeAppealSchema = createInsertSchema(freezeAppeals).omit({ id: true, createdAt: true });
export type InsertFreezeAppeal = z.infer<typeof insertFreezeAppealSchema>;
export type FreezeAppeal = typeof freezeAppeals.$inferSelect;

// ── auditor_accounts: state agency auditor logins ─────────────────────────

export const insertAuditorAccountSchema = createInsertSchema(auditorAccounts).omit({ id: true, createdAt: true, updatedAt: true, passwordHash: true });
export type InsertAuditorAccount = z.infer<typeof insertAuditorAccountSchema>;
export type AuditorAccount = typeof auditorAccounts.$inferSelect;

// ── audit_sessions: per-auditor per-org audit session ─────────────────────

export const insertAuditSessionSchema = createInsertSchema(auditSessions).omit({ id: true, createdAt: true, updatedAt: true, startedAt: true });
export type InsertAuditSession = z.infer<typeof insertAuditSessionSchema>;
export type AuditSession = typeof auditSessions.$inferSelect;

// ── auditor_document_requests ──────────────────────────────────────────────

export const insertAuditorDocumentRequestSchema = createInsertSchema(auditorDocumentRequests).omit({ id: true, createdAt: true });
export type InsertAuditorDocumentRequest = z.infer<typeof insertAuditorDocumentRequestSchema>;
export type AuditorDocumentRequest = typeof auditorDocumentRequests.$inferSelect;

// ── audit_findings: violations, fines, conditions per session ─────────────

export const insertAuditFindingSchema = createInsertSchema(auditFindings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAuditFinding = z.infer<typeof insertAuditFindingSchema>;
export type AuditFinding = typeof auditFindings.$inferSelect;

// ── auditor_followups: scheduled phone/email follow-up calls ──────────────

export const insertAuditorFollowupSchema = createInsertSchema(auditorFollowups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAuditorFollowup = z.infer<typeof insertAuditorFollowupSchema>;
export type AuditorFollowup = typeof auditorFollowups.$inferSelect;

// ── auditor_document_safe ─────────────────────────────────────────────────
export const insertAuditorDocumentSafeSchema = createInsertSchema(auditorDocumentSafe).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAuditorDocumentSafe = z.infer<typeof insertAuditorDocumentSafeSchema>;
export type AuditorDocumentSafe = typeof auditorDocumentSafe.$inferSelect;

// ── document_retention_log ────────────────────────────────────────────────
export const insertDocumentRetentionLogSchema = createInsertSchema(documentRetentionLog).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentRetentionLog = z.infer<typeof insertDocumentRetentionLogSchema>;
export type DocumentRetentionLog = typeof documentRetentionLog.$inferSelect;


// ── compliance_registry_entries ───────────────────────────────────────────
export const insertComplianceRegistryEntrySchema = createInsertSchema(complianceRegistryEntries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertComplianceRegistryEntry = z.infer<typeof insertComplianceRegistryEntrySchema>;
export type ComplianceRegistryEntry = typeof complianceRegistryEntries.$inferSelect;

// ── state_license_verifications ───────────────────────────────────────────
export const insertStateLicenseVerificationSchema = createInsertSchema(stateLicenseVerifications).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStateLicenseVerification = z.infer<typeof insertStateLicenseVerificationSchema>;
export type StateLicenseVerification = typeof stateLicenseVerifications.$inferSelect;

// ── multi_state_compliance_windows ───────────────────────────────────────
export const insertMultiStateComplianceWindowSchema = createInsertSchema(multiStateComplianceWindows).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMultiStateComplianceWindow = z.infer<typeof insertMultiStateComplianceWindowSchema>;
export type MultiStateComplianceWindow = typeof multiStateComplianceWindows.$inferSelect;



export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;


export const insertVehicleAssignmentSchema = createInsertSchema(vehicleAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVehicleAssignment = z.infer<typeof insertVehicleAssignmentSchema>;
export type VehicleAssignment = typeof vehicleAssignments.$inferSelect;


export const insertVehicleMaintenanceSchema = createInsertSchema(vehicleMaintenance).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVehicleMaintenance = z.infer<typeof insertVehicleMaintenanceSchema>;
export type VehicleMaintenance = typeof vehicleMaintenance.$inferSelect;

export const insertTrinityAnomalyLogSchema = createInsertSchema(trinityAnomalyLog).omit({ id: true, createdAt: true });
export type InsertTrinityAnomalyLog = z.infer<typeof insertTrinityAnomalyLogSchema>;
export type TrinityAnomalyLog = typeof trinityAnomalyLog.$inferSelect;

export const insertPayStubSchema = createInsertSchema(payStubs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayStub = z.infer<typeof insertPayStubSchema>;
export type PayStub = typeof payStubs.$inferSelect;

export const insertDeductionConfigSchema = createInsertSchema(deductionConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeductionConfig = z.infer<typeof insertDeductionConfigSchema>;
export type DeductionConfig = typeof deductionConfigs.$inferSelect;

export const insertOrgFinanceSettingsSchema = createInsertSchema(orgFinanceSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrgFinanceSettings = z.infer<typeof insertOrgFinanceSettingsSchema>;
export type OrgFinanceSettings = typeof orgFinanceSettings.$inferSelect;

export const insertPayrollExportSchema = z.object({});
export type InsertPayrollExport = z.infer<typeof insertPayrollExportSchema>;
export type PayrollExport = z.infer<typeof insertPayrollExportsSchema> & { id: string; createdAt: Date | null; updatedAt: Date | null };

export const insertPayrollProviderConnectionSchema = createInsertSchema(payrollProviderConnections).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayrollProviderConnection = z.infer<typeof insertPayrollProviderConnectionSchema>;
export type PayrollProviderConnection = typeof payrollProviderConnections.$inferSelect;

// ============================================================================
// SITE BRIEFING HUB
// ============================================================================


export const insertSiteBriefingSchema = createInsertSchema(siteBriefings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSiteBriefing = z.infer<typeof insertSiteBriefingSchema>;
export type SiteBriefing = typeof siteBriefings.$inferSelect;

// ============================================================================
// UNIVERSAL CONFIG REGISTRY - Trinity Orchestration Foundation
// ============================================================================

export const insertPlatformConfigRegistrySchema = createInsertSchema(platformConfigRegistry).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformConfigRegistry = z.infer<typeof insertPlatformConfigRegistrySchema>;
export type PlatformConfigRegistry = typeof platformConfigRegistry.$inferSelect;

export const insertPlatformConfigSnapshotSchema = createInsertSchema(platformConfigSnapshots).omit({ id: true, createdAt: true });
export type InsertPlatformConfigSnapshot = z.infer<typeof insertPlatformConfigSnapshotSchema>;
export type PlatformConfigSnapshot = typeof platformConfigSnapshots.$inferSelect;

export const insertPlatformConfigAuditSchema = createInsertSchema(platformConfigAudit).omit({ id: true, createdAt: true });
export type InsertPlatformConfigAudit = z.infer<typeof insertPlatformConfigAuditSchema>;
export type PlatformConfigAudit = typeof platformConfigAudit.$inferSelect;

// ============================================================================
// BILLING ECONOMY v2.0 TABLES
// ============================================================================


export const insertCreditBalanceSchema = createInsertSchema(creditBalances).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCreditBalance = z.infer<typeof insertCreditBalanceSchema>;
export type CreditBalance = typeof creditBalances.$inferSelect;


export const insertFinancialProcessingFeeSchema = createInsertSchema(financialProcessingFees).omit({ id: true, createdAt: true });
export type InsertFinancialProcessingFee = z.infer<typeof insertFinancialProcessingFeeSchema>;
export type FinancialProcessingFee = typeof financialProcessingFees.$inferSelect;


export const insertPlatformInvoiceSchema = createInsertSchema(platformInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformInvoice = z.infer<typeof insertPlatformInvoiceSchema>;
export type PlatformInvoice = typeof platformInvoices.$inferSelect;


export const insertUsageCapSchema = createInsertSchema(usageCaps).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUsageCap = z.infer<typeof insertUsageCapSchema>;
export type UsageCap = typeof usageCaps.$inferSelect;


export const insertPlatformCreditPoolSchema = createInsertSchema(platformCreditPool).omit({ id: true, createdAt: true });
export type InsertPlatformCreditPool = z.infer<typeof insertPlatformCreditPoolSchema>;
export type PlatformCreditPool = typeof platformCreditPool.$inferSelect;

// ============================================================================
// DOCUMENT SIGNING & VAULT (Feature 1)
// ============================================================================


export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;


export const insertDocumentInstanceSchema = createInsertSchema(documentInstances).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentInstance = z.infer<typeof insertDocumentInstanceSchema>;
export type DocumentInstance = typeof documentInstances.$inferSelect;

export const insertSignatureSchema = createInsertSchema(signatures).omit({ id: true, signedAt: true });
export type InsertSignature = z.infer<typeof insertSignatureSchema>;
export type Signature = typeof signatures.$inferSelect;


export const insertDocumentVaultSchema = createInsertSchema(documentVault).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentVault = z.infer<typeof insertDocumentVaultSchema>;
export type DocumentVault = typeof documentVault.$inferSelect;

// ============================================================================
// SAVED REPORTS (Feature 2 - QB Reports)
// ============================================================================


export const insertSavedReportSchema = createInsertSchema(savedReports).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSavedReport = z.infer<typeof insertSavedReportSchema>;
export type SavedReport = typeof savedReports.$inferSelect;

// ============================================================================
// INCIDENT REPORTS PIPELINE (Feature 3)
// ============================================================================


export const insertIncidentReportSchema = createInsertSchema(incidentReports).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIncidentReport = z.infer<typeof insertIncidentReportSchema>;
export type IncidentReport = typeof incidentReports.$inferSelect;

// ============================================================================
// RFP / SALES PIPELINE (Feature 6)
// ============================================================================


export const insertPipelineDealSchema = createInsertSchema(pipelineDeals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPipelineDeal = z.infer<typeof insertPipelineDealSchema>;
export type PipelineDeal = typeof pipelineDeals.$inferSelect;

// ============================================
// DockChat Messaging Bridges (Feature 5)
// ============================================


export const insertChannelBridgeSchema = createInsertSchema(channelBridges).omit({ id: true, createdAt: true, updatedAt: true, messageCount: true, lastActivityAt: true, webhookSecret: true });
export type InsertChannelBridge = z.infer<typeof insertChannelBridgeSchema>;
export type ChannelBridge = typeof channelBridges.$inferSelect;


export const insertBridgeConversationSchema = createInsertSchema(bridgeConversations).omit({ id: true, createdAt: true, updatedAt: true, messageCount: true, lastMessageAt: true });
export type InsertBridgeConversation = z.infer<typeof insertBridgeConversationSchema>;
export type BridgeConversation = typeof bridgeConversations.$inferSelect;


export const insertBridgeMessageSchema = createInsertSchema(bridgeMessages).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBridgeMessage = z.infer<typeof insertBridgeMessageSchema>;
export type BridgeMessage = typeof bridgeMessages.$inferSelect;

// ─── DEPRECATED (B1 consolidation) ───────────────────────────────────────────
// New universal audit writes SHOULD go to auditLogs with source='universal'.
export const insertUniversalAuditTrailSchema = createInsertSchema(universalAuditTrail).omit({ id: true, createdAt: true });
export type InsertUniversalAuditTrail = z.infer<typeof insertUniversalAuditTrailSchema>;
export type UniversalAuditTrail = typeof universalAuditTrail.$inferSelect;
// ─────────────────────────────────────────────────────────────────────────────

// ============================================================================
// SAFETY & FIELD OPERATIONS TABLES
// ============================================================================

export type PanicAlert = typeof panicAlerts.$inferSelect;


export type SlaContract = typeof slaContracts.$inferSelect;

export type LoneWorkerSession = typeof loneWorkerSessions.$inferSelect;

// ============================================================================
// RFP DOCUMENTS TABLE
// ============================================================================
export type RfpDocument = typeof rfpDocuments.$inferSelect;

// ============================================================================
// SHIFT COVERAGE CLAIMS TABLE
// ============================================================================
export type ShiftCoverageClaim = typeof shiftCoverageClaims.$inferSelect;

// ============================================================================
// RMS (Records Management System) TABLES
// ============================================================================


export type BoloAlert = typeof boloAlerts.$inferSelect;


export type LostFoundItem = typeof lostFoundItems.$inferSelect;


export type ReportAuditTrailEntry = typeof reportAuditTrail.$inferSelect;

export type RmsCase = typeof rmsCases.$inferSelect;


export type VisitorLog = typeof visitorLogs.$inferSelect;

export type ManualClockinOverride = typeof manualClockinOverrides.$inferSelect;

// ============================================================================
// SESSION TABLE (express-session / connect-pg-simple)
// ============================================================================


// ============================================================================
// META-COGNITION LOGS TABLE
// ============================================================================
export type MetaCognitionLog = typeof metaCognitionLogs.$inferSelect;
// ============================================================================
// DURABLE JOB QUEUE TABLE
// ============================================================================


export type DurableJob = typeof durableJobQueue.$inferSelect;

// ============================================================================
// MANAGED API KEYS TABLE
// ============================================================================
export type ManagedApiKey = typeof managedApiKeys.$inferSelect;

// ============================================================================
// ERROR TRACKING TABLES
// ============================================================================

// ============================================================================
// ACTIVITIES TABLE (CRM)
// ============================================================================


export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

// ============================================================================
// ESCALATION CHAINS TABLE
// ============================================================================

// ============================================================================
// AUTOMATION TRIGGERS TABLE (raw SQL version)
// ============================================================================


// ============================================================================
// ALERT RULES TABLE
// ============================================================================


export type AlertRule = typeof alertRules.$inferSelect;
// ============================================================================
// FORM SUBMISSIONS TABLE
// ============================================================================

// ============================================================================
// KEY ROTATION HISTORY TABLE
// ============================================================================
export interface KeyRotationHistoryEntry {
  id: string;
  workspaceId: string | null;
  keyId: string | null;
  keyType: string;
  rotatedBy: string | null;
  reason: string | null;
  oldKeyHash: string | null;
  newKeyHash: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
}

// ============================================================================
// ALERT SUBSCRIPTIONS TABLE
// ============================================================================

// ============================================================================
// VEHICLE MAINTENANCE RECORDS TABLE
// ============================================================================

// ============================================================================
// TRINITY KNOWLEDGE BASE — Static industry knowledge modules
// ============================================================================

export const insertTrinityKnowledgeBaseSchema = createInsertSchema(trinityKnowledgeBase).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrinityKnowledgeBase = z.infer<typeof insertTrinityKnowledgeBaseSchema>;
export type TrinityKnowledgeBase = typeof trinityKnowledgeBase.$inferSelect;

// ============================================================================
// PHASE 8 — NOTIFICATION DELIVERIES (delivery tracking, retry, idempotency)
// notificationDeliveries table is defined in:
//   shared/schema/domains/notifications-delivery/index.ts
// and imported + re-exported above.
// ============================================================================

export const insertNotificationDeliverySchema = createInsertSchema(notificationDeliveries).omit({
  id: true, createdAt: true, updatedAt: true, sentAt: true, deliveredAt: true,
});
export type InsertNotificationDelivery = z.infer<typeof insertNotificationDeliverySchema>;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;

// ============================================================================
// PHASE 48 — ONBOARDING TASK MANAGEMENT
// ============================================================================
export {
  onboardingTaskTemplates,
  employeeOnboardingCompletions,
  type OnboardingTaskTemplate,
  type EmployeeOnboardingCompletion,
} from './schema/domains/onboarding-tasks';

// ============================================================================
// STORAGE QUOTA — Option B category-based sub-limits (domain file)
// ============================================================================
export { storageUsage, storageWarningState } from './schema/domains/storage';
export type { StorageUsageRow, StorageWarningStateRow, StorageCategory } from './schema/domains/storage';

export const insertOnboardingTaskTemplateSchema = z.object({
  workspaceId:   z.string().nullable().optional(),
  category:      z.enum(['officer', 'client']),
  tier:          z.number().int().min(1).max(3).default(1),
  title:         z.string().min(1).max(200),
  description:   z.string().nullable().optional(),
  dueByDays:     z.number().int().min(0).default(1),
  isRequired:    z.boolean().default(true),
  isActive:      z.boolean().default(true),
  sortOrder:     z.number().int().default(0),
  documentType:  z.string().nullable().optional(),
});
export type InsertOnboardingTaskTemplate = z.infer<typeof insertOnboardingTaskTemplateSchema>;

export const insertEmployeeOnboardingCompletionSchema = z.object({
  employeeId:      z.string(),
  workspaceId:     z.string(),
  taskTemplateId:  z.string(),
  status:          z.enum(['pending', 'in_progress', 'completed', 'waived']).default('pending'),
  notes:           z.string().nullable().optional(),
  waivedReason:    z.string().nullable().optional(),
  metadata:        z.record(z.unknown()).nullable().optional(),
});
export type InsertEmployeeOnboardingCompletion = z.infer<typeof insertEmployeeOnboardingCompletionSchema>;
