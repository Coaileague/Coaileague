// ═══════════════════════════════════════════════════════════════
// Domain 4 of 15: Scheduling
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 36

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, index, uniqueIndex, primaryKey, unique, interval } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  recurrencePatternEnum,
  shiftAcknowledgmentTypeEnum,
  shiftActionStatusEnum,
  shiftActionTypeEnum,
  shiftCategoryEnum,
  shiftCoverageStatusEnum,
  shiftOrderPhotoFrequencyEnum,
  shiftOrderPriorityEnum,
  shiftStatusEnum,
  swapRequestStatusEnum,
} from '../../enums';

export const schedules = pgTable("schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name"),
  title: varchar("title"),
  status: varchar("status").default("active"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  settingsData: jsonb("settings_data").default('{}'),
  notificationData: jsonb("notification_data").default('{}'),
  intervalData: jsonb("interval_data").default('{}'),
});

export const shiftRequests = pgTable("shift_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  
  requestReason: text("request_reason"), // Why searching external pool
  requiredSkills: text("required_skills").array(), // Must-have skills
  preferredSkills: text("preferred_skills").array(), // Nice-to-have skills
  maxPayRate: decimal("max_pay_rate", { precision: 10, scale: 2 }), // Budget constraint
  maxDistance: integer("max_distance").default(50),
  
  status: varchar("status").default("searching"), // "searching", "offers_sent", "filled", "cancelled"
  offersCount: integer("offers_count").default(0),
  acceptedOfferId: varchar("accepted_offer_id"),
  
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_shift_requests_workspace").on(table.workspaceId, table.status),
  index("idx_shift_requests_shift").on(table.shiftId),
]);

export const shiftOffers = pgTable("shift_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  shiftRequestId: varchar("shift_request_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  contractorId: varchar("contractor_id").notNull(),
  
  // Offer details
  offeredPayRate: decimal("offered_pay_rate", { precision: 10, scale: 2 }).notNull(),
  matchScore: decimal("match_score", { precision: 3, scale: 2 }), // 0.00-1.00 from AI scoring
  matchReasons: jsonb("match_reasons").$type<string[]>(), // Why this contractor matched
  
  // Status tracking
  status: varchar("status").default("pending"), // "pending", "accepted", "declined", "expired"
  sentAt: timestamp("sent_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at").notNull(), // Offer expires after X hours
  
  // Response token (HMAC-signed for stateless contractor authentication)
  responseToken: varchar("response_token").unique(), // UUID + HMAC for secure one-click responses
  
  // Onboarding (if accepted)
  onboardingStarted: boolean("onboarding_started").default(false),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

}, (table) => [
  index("idx_shift_offers_request").on(table.shiftRequestId),
  index("idx_shift_offers_contractor").on(table.contractorId, table.status),
  index("idx_shift_offers_token").on(table.responseToken),
]);

export const shifts = pgTable("shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  clientId: varchar("client_id"),
  subClientId: varchar("sub_client_id"),
  siteId: varchar("site_id"),

  // Billing info (captured at time of shift creation)
  billRate: decimal("bill_rate", { precision: 10, scale: 2 }),
  payRate: decimal("pay_rate", { precision: 10, scale: 2 }),

  // Shift details
  title: varchar("title"),
  description: text("description"),
  category: shiftCategoryEnum("category").default("general"), // Visual theme category for colorful scheduling
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  date: varchar("date", { length: 10 }), // YYYY-MM-DD format for quick date lookups

  // Smart Schedule™ tracking
  aiGenerated: boolean("ai_generated").default(false),
  isFromTemplate: boolean("is_from_template").default(false),
  templateId: varchar("template_id"),
  isManuallyLocked: boolean("is_manually_locked").default(false),
  requiresAcknowledgment: boolean("requires_acknowledgment").default(false),
  replacementForShiftId: varchar("replacement_for_shift_id"), // If this shift replaces a denied one
  autoReplacementAttempts: integer("auto_replacement_attempts").default(0), // Track replacement tries

  // AI confidence & risk scoring
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 3, scale: 2 }), // 0.00-1.00
  riskScore: decimal("risk_score", { precision: 3, scale: 2 }), // 0.00-1.00 (higher = riskier)
  riskFactors: jsonb("risk_factors").$type<string[]>(), // ['high_tardiness', 'location_far', 'low_performance']

  // Acknowledgment & Denial tracking
  acknowledgedAt: timestamp("acknowledged_at"),
  deniedAt: timestamp("denied_at"),
  denialReason: text("denial_reason"),

  // Status and tracking
  status: shiftStatusEnum("status").default('draft'),
  isStaged: boolean("is_staged").default(false), // True if shift is staged for preview
  stagedMetadata: jsonb("staged_metadata"), // Metadata for staged shifts (reason, logic, etc.)

  // Billing
  billableToClient: boolean("billable_to_client").default(true),
  hourlyRateOverride: decimal("hourly_rate_override", { precision: 10, scale: 2 }), // Override employee's default rate
  
  // Trinity Training System fields
  travelPay: decimal("travel_pay", { precision: 10, scale: 2 }), // Travel compensation for this shift
  contractRate: decimal("contract_rate", { precision: 10, scale: 2 }), // Client contract hourly rate
  scenarioId: varchar("scenario_id"), // Links to training scenario
  difficultyLevel: varchar("difficulty_level"), // 'easy', 'medium', 'hard'
  isTrainingShift: boolean("is_training_shift").default(false), // Flag for seeded training data
  requiredCertifications: jsonb("required_certifications").$type<string[]>(), // Certifications needed
  preferredEmployeeIds: jsonb("preferred_employee_ids").$type<string[]>(), // Client-preferred officers
  excludedEmployeeIds: jsonb("excluded_employee_ids").$type<string[]>(), // Client-excluded officers
  travelDistanceMiles: decimal("travel_distance_miles", { precision: 8, scale: 2 }), // Distance from employee home
  minimumScore: decimal("minimum_score", { precision: 3, scale: 2 }), // Min employee score required

  // Universal Identification — Phase 57
  // Format: SHF-YYYYMMDD-NNNNN  e.g. SHF-20260329-00612
  shiftNumber: varchar("shift_number"), // Human-readable shift reference

  deletedAt: timestamp("deleted_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("shifts_workspace_idx").on(table.workspaceId),
  index("shifts_workspace_status_idx").on(table.workspaceId, table.status),
  index("shifts_shift_number_idx").on(table.shiftNumber),
  index("shifts_employee_idx").on(table.employeeId),
  index("shifts_client_idx").on(table.clientId),
  index("shifts_time_range_idx").on(table.workspaceId, table.startTime, table.endTime),
  index("shifts_status_idx").on(table.status),
  index("shifts_created_at_idx").on(table.createdAt),
  index("shifts_ai_generated_idx").on(table.aiGenerated),
  index("shifts_scenario_idx").on(table.scenarioId),
  index("shifts_training_idx").on(table.isTrainingShift),
]);


export const customSchedulerIntervals = pgTable("custom_scheduler_intervals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  
  // Automation scheduling intervals (cron-like)
  scheduleInterval: varchar("schedule_interval"), // 'weekly', 'biweekly', 'monthly', 'custom'
  scheduleTime: varchar("schedule_time"), // '09:00', '14:30', etc.
  scheduleDay: varchar("schedule_day"), // 'monday', 'friday', etc.
  
  // Custom interval tracking
  customCronExpression: varchar("custom_cron_expression"), // '0 9 * * MON' for Monday 9 AM
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  
  // Invoice & Payroll generation settings
  autoGenerateInvoices: boolean("auto_generate_invoices").default(true),
  autoGeneratePayroll: boolean("auto_generate_payroll").default(true),
  autoApproveThreshold: integer("auto_approve_threshold").default(85), // Auto-approve if AI confidence > 85%
  
  // Settings
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const recurringShiftPatterns = pgTable("recurring_shift_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Template details
  employeeId: varchar("employee_id"),
  clientId: varchar("client_id"),
  title: varchar("title").notNull(),
  description: text("description"),
  category: shiftCategoryEnum("category").default("general"),
  
  // Time configuration
  startTimeOfDay: varchar("start_time_of_day").notNull(), // 'HH:mm' format
  endTimeOfDay: varchar("end_time_of_day").notNull(), // 'HH:mm' format
  daysOfWeek: text("days_of_week").array().notNull(), // ['monday', 'wednesday', 'friday']
  recurrencePattern: recurrencePatternEnum("recurrence_pattern").notNull().default('weekly'),
  
  // Date range
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // null = indefinite
  skipDates: timestamp("skip_dates").array(), // Holidays, exceptions
  
  // Billing
  billableToClient: boolean("billable_to_client").default(true),
  hourlyRateOverride: decimal("hourly_rate_override", { precision: 10, scale: 2 }),
  
  // Status & metadata
  isActive: boolean("is_active").default(true),
  lastGeneratedDate: timestamp("last_generated_date"), // Track last shift generation
  shiftsGenerated: integer("shifts_generated").default(0), // Count of shifts created
  createdBy: varchar("created_by"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_recurring_patterns_workspace").on(table.workspaceId, table.isActive),
  index("idx_recurring_patterns_employee").on(table.employeeId),
]);

export const shiftSwapRequests = pgTable("shift_swap_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  
  // Requester (employee who wants to give up the shift)
  requesterId: varchar("requester_id").notNull(),
  
  // Target employee (who will take the shift, null = open for anyone)
  targetEmployeeId: varchar("target_employee_id"),
  
  // Request details
  reason: text("reason"),
  status: swapRequestStatusEnum("status").notNull().default('pending'),
  
  // Manager response
  respondedBy: varchar("responded_by"),
  responseMessage: text("response_message"),
  respondedAt: timestamp("responded_at"),
  
  // AI suggestions
  aiSuggestedEmployees: jsonb("ai_suggested_employees").$type<Array<{
    employeeId: string;
    employeeName: string;
    score: number;
    reasons: string[];
  }>>(),
  aiProcessedAt: timestamp("ai_processed_at"),
  
  // Expiration
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_swap_requests_workspace").on(table.workspaceId, table.status),
  index("idx_swap_requests_shift").on(table.shiftId),
  index("idx_swap_requests_requester").on(table.requesterId),
]);

export const scheduleTemplates = pgTable("schedule_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Template info
  name: varchar("name").notNull(),
  description: text("description"),
  
  // Shift patterns stored as JSON array
  shiftPatterns: jsonb("shift_patterns").$type<Array<{
    title?: string;
    employeeId?: string;
    clientId?: string;
    location?: string;
    description?: string;
    startTimeOffset: number; // Minutes from midnight
    endTimeOffset: number; // Minutes from midnight
    dayOfWeek?: number; // 0-6
  }>>(),
  
  // Metadata
  createdBy: varchar("created_by"),
  usageCount: integer("usage_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_schedule_templates_workspace").on(table.workspaceId),
]);

export const shiftAcknowledgments = pgTable("shift_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Acknowledgment details
  type: shiftAcknowledgmentTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  priority: varchar("priority").default('normal'), // 'low', 'normal', 'high', 'urgent'

  // File attachments
  attachmentUrls: text("attachment_urls").array(),

  // Status tracking
  isRequired: boolean("is_required").default(true), // Must acknowledge before clock-in
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by"),
  deniedAt: timestamp("denied_at"),
  denialReason: text("denial_reason"),

  // Metadata
  createdBy: varchar("created_by").notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceCoverageRequests = pgTable("service_coverage_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id"),
  
  // Request details
  requestNumber: varchar("request_number").notNull().unique(), // AUTO-GENERATED: REQ-2024-001
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  
  // Schedule requirements
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  date: varchar("date", { length: 10 }), // YYYY-MM-DD format for quick date lookups
  numberOfEmployeesNeeded: integer("number_of_employees_needed").notNull().default(1),
  
  // Location data (for AI distance calculation)
  jobSiteAddress: text("job_site_address"),
  jobSiteCity: varchar("job_site_city"),
  jobSiteState: varchar("job_site_state"),
  jobSiteZipCode: varchar("job_site_zip_code"),
  jobSiteLatitude: decimal("job_site_latitude", { precision: 10, scale: 6 }),
  jobSiteLongitude: decimal("job_site_longitude", { precision: 10, scale: 6 }),
  
  // Skill/license requirements
  requiredSkills: text("required_skills").array(), // ['forklift', 'cdl', 'first_aid']
  requiredCertifications: text("required_certifications").array(),
  
  // AI Processing
  aiProcessed: boolean("ai_processed").default(false),
  aiProcessedAt: timestamp("ai_processed_at"),
  aiSuggestedEmployees: jsonb("ai_suggested_employees"), // Array of employee matches with scores
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 3, scale: 2 }),
  
  // Status workflow
  status: varchar("status").default('pending'), // 'pending', 'processing', 'matched', 'assigned', 'cancelled'
  assignedEmployeeIds: text("assigned_employee_ids").array(), // Final assignments
  
  // Billing tracking (AI usage charge)
  aiUsageLogId: varchar("ai_usage_log_id"),
  
  // Request metadata
  requestedBy: varchar("requested_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const publishedSchedules = pgTable("published_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Schedule period
  weekStartDate: timestamp("week_start_date").notNull(),
  weekEndDate: timestamp("week_end_date").notNull(),
  title: varchar("title"), // e.g., "Week of Nov 6-12, 2024"
  
  // Publishing details
  publishedBy: varchar("published_by").notNull(),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  
  // Shift tracking
  totalShifts: integer("total_shifts").default(0),
  employeesAffected: integer("employees_affected").default(0),
  shiftIds: text("shift_ids").array(), // All shifts in this published schedule
  
  // Notification tracking
  notificationsSent: boolean("notifications_sent").default(false),
  notificationsSentAt: timestamp("notifications_sent_at"),
  
  // Version control
  version: integer("version").default(1),
  replacesScheduleId: varchar("replaces_schedule_id"), // If republishing
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scheduleSnapshots = pgTable("schedule_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  publishedScheduleId: varchar("published_schedule_id").notNull(),
  
  // Snapshot data - complete state of all shifts at publish time
  snapshotData: jsonb("snapshot_data").notNull(), // Array of shift objects with all fields
  
  // Metadata
  shiftCount: integer("shift_count").default(0),
  employeesAffected: integer("employees_affected").default(0),
  
  // Rollback tracking
  isRolledBack: boolean("is_rolled_back").default(false),
  rolledBackAt: timestamp("rolled_back_at"),
  rolledBackBy: varchar("rolled_back_by"),
  rollbackReason: text("rollback_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("schedule_snapshots_workspace_idx").on(table.workspaceId),
  index("schedule_snapshots_published_schedule_idx").on(table.publishedScheduleId),
  index("schedule_snapshots_created_at_idx").on(table.createdAt),
]);

export const scheduleProposals = pgTable("schedule_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Proposal metadata
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  
  // AI response (full ScheduleSmartResponse from Gemini)
  aiResponse: jsonb("ai_response").notNull(), // Contains assignments, confidence, summary
  confidence: integer("confidence").notNull(), // 0-100 (duplicated for query convenience)
  
  // Approval workflow
  status: varchar("status").default("pending"), // 'pending', 'approved', 'rejected', 'auto_approved'
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Legal disclaimer acknowledgment
  disclaimerAcknowledged: boolean("disclaimer_acknowledged").default(false),
  disclaimerAcknowledgedBy: varchar("disclaimer_acknowledged_by"),
  disclaimerAcknowledgedAt: timestamp("disclaimer_acknowledged_at"),
  
  // Billing linkage
  aiUsageLogId: varchar("ai_usage_log_id"),
  
  // Learning mechanism (track post-approval edits)
  shiftIdsCreated: text("shift_ids_created").array(), // Shifts actually created from this proposal
  editedAfterApproval: boolean("edited_after_approval").default(false),
  editCount: integer("edit_count").default(0),
  
});

export const shiftTemplates = pgTable("shift_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  name: varchar("name").notNull(),
  title: varchar("title"),
  description: text("description"),
  durationHours: decimal("duration_hours", { precision: 5, scale: 2 }).notNull(),
  billableToClient: boolean("billable_to_client").default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const smartScheduleUsage = pgTable("smart_schedule_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Usage details
  scheduleDate: timestamp("schedule_date").notNull(), // Week start date
  employeesScheduled: integer("employees_scheduled").notNull(),
  shiftsGenerated: integer("shifts_generated").notNull(),

  // Billing
  billingModel: varchar("billing_model").notNull(), // 'per_cycle', 'per_employee', 'tier_included'
  chargeAmount: decimal("charge_amount", { precision: 10, scale: 2 }), // Amount charged

  // AI metadata
  aiModel: varchar("ai_model").default('gpt-4'),
  processingTimeMs: integer("processing_time_ms"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shiftOrders = pgTable("shift_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),

  // Order details
  title: varchar("title").notNull(),
  description: text("description"),
  priority: shiftOrderPriorityEnum("priority").default('normal'),

  // Requirements
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),
  requiresSignature: boolean("requires_signature").default(false),
  requiresPhotos: boolean("requires_photos").default(false),
  
  // Photo requirements
  photoFrequency: shiftOrderPhotoFrequencyEnum("photo_frequency"),
  photoInstructions: text("photo_instructions"),

  // Metadata
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shiftOrderAcknowledgments = pgTable("shift_order_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftOrderId: varchar("shift_order_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Acknowledgment details
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
  notes: text("notes"), // Optional employee notes
  
  // Signature (if required)
  signatureUrl: varchar("signature_url"), // Object storage URL for signature image
  signedAt: timestamp("signed_at"),

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  // Prevent duplicate acknowledgments
  uniqueIndex("unique_acknowledgment").on(table.shiftOrderId, table.employeeId)
]);

export const internalBids = pgTable("internal_bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Bid details
  title: varchar("title").notNull(), // "Short-term Project: Install Security System at Site B"
  description: text("description").notNull(),
  bidType: varchar("bid_type").notNull(), // 'project', 'role', 'temporary_assignment'

  // Requirements
  requiredSkills: jsonb("required_skills").$type<string[]>().notNull().default(sql`'[]'`), // ['Forklift Certified', 'OSHA 30']
  requiredCertifications: jsonb("required_certifications").$type<string[]>().default(sql`'[]'`), // ['CPR', 'First Aid']
  minimumExperience: integer("minimum_experience"), // Months
  targetRole: varchar("target_role"), // "Senior Rigger", "Lead Technician"

  // Compensation & duration
  compensationType: varchar("compensation_type").notNull(), // 'hourly_rate', 'flat_fee', 'promotion'
  compensationAmount: decimal("compensation_amount", { precision: 10, scale: 2 }),
  estimatedDuration: integer("estimated_duration"), // Days
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  // Location & logistics
  locationRequired: varchar("location_required"), // 'on_site', 'remote', 'hybrid'
  siteLocation: text("site_location"),
  clientId: varchar("client_id"),

  // Posting details
  postedBy: varchar("posted_by").notNull(),
  status: varchar("status").default("open"), // 'open', 'in_progress', 'filled', 'cancelled'
  maxApplicants: integer("max_applicants").default(10),
  applicationDeadline: timestamp("application_deadline"),

  // Selected candidate
  selectedEmployeeId: varchar("selected_employee_id"),
  selectedAt: timestamp("selected_at"),

  // High-risk employee tracking (AI Predictions integration)
  highRiskViewCount: integer("high_risk_view_count").default(0), // Count of high-risk employees viewing
  highRiskViewers: jsonb("high_risk_viewers").$type<string[]>().default(sql`'[]'`), // Employee IDs with turnover score > 70%
  lastHighRiskViewAt: timestamp("last_high_risk_view_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceStatusIndex: index("internal_bids_workspace_status_idx").on(table.workspaceId, table.status),
  deadlineIndex: index("internal_bids_deadline_idx").on(table.applicationDeadline),
}));

export const bidApplications = pgTable("bid_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  bidId: varchar("bid_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Application details
  coverLetter: text("cover_letter"),
  whyInterestedText: text("why_interested"), // "I want to grow my skills in X"
  relevantExperience: text("relevant_experience"),

  // Skill/cert matching (auto-calculated)
  skillMatchPercentage: decimal("skill_match_percentage", { precision: 5, scale: 2 }), // 0-100%
  missingSkills: jsonb("missing_skills").$type<string[]>().default(sql`'[]'`),
  matchingSkills: jsonb("matching_skills").$type<string[]>().default(sql`'[]'`),

  // AI Predictions risk score at time of application
  turnoverRiskScore: integer("turnover_risk_score"), // 0-100 from AI Predictions
  isHighRisk: boolean("is_high_risk").default(false), // Score > 70%

  // Application lifecycle
  status: varchar("status").default("pending"), // 'pending', 'reviewed', 'shortlisted', 'accepted', 'rejected'
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),

  // Manager intervention flag (for high-risk employees)
  interventionTriggered: boolean("intervention_triggered").default(false),
  interventionBy: varchar("intervention_by"),
  interventionAt: timestamp("intervention_at"),
  interventionNotes: text("intervention_notes"),

  appliedAt: timestamp("applied_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bidEmployeeIndex: uniqueIndex("bid_applications_bid_employee_idx").on(table.bidId, table.employeeId),
  employeeStatusIndex: index("bid_applications_employee_status_idx").on(table.employeeId, table.status),
}));

export const capacityAlerts = pgTable("capacity_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Alert details
  employeeId: varchar("employee_id"),
  managerId: varchar("manager_id"),

  alertType: varchar("alert_type").notNull(), // 'over_allocated', 'under_utilized', 'conflict', 'approaching_limit'
  severity: varchar("severity").default('medium'), // 'low', 'medium', 'high', 'critical'

  // Capacity data
  weekStartDate: timestamp("week_start_date").notNull(),
  scheduledHours: decimal("scheduled_hours", { precision: 5, scale: 2 }),
  availableHours: decimal("available_hours", { precision: 5, scale: 2 }),
  overageHours: decimal("overage_hours", { precision: 5, scale: 2 }), // Hours over limit

  // Alert message
  message: text("message").notNull(),
  suggestedAction: text("suggested_action"), // AI-suggested fix

  // Status
  status: varchar("status").default('active'), // 'active', 'acknowledged', 'resolved', 'dismissed'
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeIdx: index("capacity_alerts_employee_idx").on(table.employeeId),
  statusIdx: index("capacity_alerts_status_idx").on(table.status),
  weekIdx: index("capacity_alerts_week_idx").on(table.weekStartDate),
}));

export const shiftActions = pgTable("shift_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  
  // Action details
  actionType: shiftActionTypeEnum("action_type").notNull(),
  requestedBy: varchar("requested_by").notNull(),
  
  // For switch/cover requests
  targetEmployeeId: varchar("target_employee_id"), // Who should take the shift
  reason: text("reason"),
  
  // Approval workflow
  status: shiftActionStatusEnum("status").default('pending'),
  requiresApproval: boolean("requires_approval").default(true),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  denialReason: text("denial_reason"),
  
  // AI scheduling impact
  aiScheduleUpdated: boolean("ai_schedule_updated").default(false),
  replacementShiftId: varchar("replacement_shift_id"), // New shift created
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("shift_actions_workspace_idx").on(table.workspaceId),
  shiftIdx: index("shift_actions_shift_idx").on(table.shiftId),
  requestedByIdx: index("shift_actions_requested_by_idx").on(table.requestedBy),
  statusIdx: index("shift_actions_status_idx").on(table.status),
  actionTypeIdx: index("shift_actions_action_type_idx").on(table.actionType),
}));

export const shiftAcceptanceRecords = pgTable("shift_acceptance_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  
  // Acceptance details
  action: varchar("action").notNull(), // 'accepted', 'rejected', 'dropped', 'reassigned'
  
  // Digital signature/acknowledgment
  acceptanceMethod: varchar("acceptance_method").notNull(), // 'one_click', 'digital_signature', 'verbal_confirmation'
  signatureHash: varchar("signature_hash"), // SHA-256 hash of acceptance data
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  deviceInfo: jsonb("device_info"),
  
  // Shift details at time of acceptance (immutable snapshot)
  shiftDetails: jsonb("shift_details").notNull(), // {date, time, location, client, payRate, duties}
  
  // Offer/Response tracking
  offerId: varchar("offer_id"),
  offerSentAt: timestamp("offer_sent_at"),
  responseReceivedAt: timestamp("response_received_at"),
  responseTimeMinutes: integer("response_time_minutes"),
  
  // Status for downstream automation
  isAcknowledged: boolean("is_acknowledged").default(true),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
  
  // For reassignments
  previousEmployeeId: varchar("previous_employee_id"),
  reassignmentReason: text("reassignment_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  offerTimestamp: timestamp("offer_timestamp"),
  offerExpiry: timestamp("offer_expiry"),
  acceptanceTimestamp: timestamp("acceptance_timestamp"),
  responseStatus: varchar("response_status"),
  responseMethod: varchar("response_method"),
  digitalSignatureHash: varchar("digital_signature_hash"),
  geoLocation: jsonb("geo_location"),
  acceptanceNotes: text("acceptance_notes"),
  declinedReason: text("declined_reason"),
  aiRecommendationScore: decimal("ai_recommendation_score"),
  aiRecommendationReason: text("ai_recommendation_reason"),
  wasAiSelected: boolean("was_ai_selected").default(false),
  overrideReason: text("override_reason"),
  overrideBy: varchar("override_by"),
  payrollIntegrated: boolean("payroll_integrated").default(false),
  billosIntegrated: boolean("billos_integrated").default(false),
}, (table) => [
  index("acceptance_records_workspace_idx").on(table.workspaceId),
  index("acceptance_records_shift_idx").on(table.shiftId),
  index("acceptance_records_employee_idx").on(table.employeeId),
  index("acceptance_records_action_idx").on(table.action),
  index("acceptance_records_created_idx").on(table.createdAt),
]);

export const schedulerNotificationEvents = pgTable("scheduler_notification_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Event details
  eventType: varchar("event_type").notNull(), // 'shift_offered', 'shift_accepted', 'shift_unfilled', 'calloff_received', 'reassignment_needed'
  severity: varchar("severity").notNull().default("info"), // 'info', 'warning', 'critical'
  
  // Related entities
  shiftId: varchar("shift_id"),
  employeeId: varchar("employee_id"),
  clientId: varchar("client_id"),
  
  // Recipients (who should be notified)
  recipientType: varchar("recipient_type").notNull(), // 'employee', 'co_owner', 'client', 'dispatcher'
  recipientUserId: varchar("recipient_user_id"),
  
  // Notification content
  title: text("title").notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  
  // Delivery status
  channels: text("channels").array().default(sql`ARRAY[]::text[]`), // ['websocket', 'email', 'sms', 'push']
  deliveredVia: text("delivered_via").array().default(sql`ARRAY[]::text[]`),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  
  // Escalation
  requiresAcknowledgment: boolean("requires_acknowledgment").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  escalatedAt: timestamp("escalated_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("scheduler_notif_workspace_idx").on(table.workspaceId),
  index("scheduler_notif_event_type_idx").on(table.eventType),
  index("scheduler_notif_severity_idx").on(table.severity),
  index("scheduler_notif_recipient_idx").on(table.recipientUserId),
  index("scheduler_notif_shift_idx").on(table.shiftId),
]);

export const calendarSubscriptions = pgTable("calendar_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  userId: varchar("user_id"),
  
  // Unique subscription token (URL-safe, cryptographically secure)
  subscriptionToken: varchar("subscription_token").notNull().unique(),
  
  // Subscription type
  subscriptionType: varchar("subscription_type").notNull().default('shifts'), // 'shifts', 'timesheets', 'all'
  
  // Filter settings (what to include in the calendar)
  includeShifts: boolean("include_shifts").default(true),
  includeTimesheets: boolean("include_timesheets").default(false),
  includePendingShifts: boolean("include_pending_shifts").default(true),
  includeCancelledShifts: boolean("include_cancelled_shifts").default(false),
  
  // Date range settings
  daysBack: integer("days_back").default(30), // Include events from X days ago
  daysForward: integer("days_forward").default(90), // Include events up to X days in future
  
  // Refresh settings
  refreshIntervalMinutes: integer("refresh_interval_minutes").default(15), // How often external apps should refresh
  lastAccessedAt: timestamp("last_accessed_at"), // Track subscription usage
  accessCount: integer("access_count").default(0), // Total number of times accessed
  
  // Status
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"), // Optional expiry date for security
  
  // Metadata
  name: varchar("name"), // User-friendly name like "My Work Schedule"
  createdByIp: varchar("created_by_ip"),
  lastAccessedFromIp: varchar("last_accessed_from_ip"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("calendar_subscriptions_workspace_idx").on(table.workspaceId),
  index("calendar_subscriptions_employee_idx").on(table.employeeId),
  index("calendar_subscriptions_user_idx").on(table.userId),
  index("calendar_subscriptions_token_idx").on(table.subscriptionToken),
  index("calendar_subscriptions_active_idx").on(table.isActive),
]);

export const calendarImports = pgTable("calendar_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  
  // Import source
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  sourceType: varchar("source_type").notNull().default('file'), // 'file', 'google', 'outlook', 'apple'
  sourceUrl: text("source_url"), // For URL-based imports
  
  // Import results
  status: varchar("status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  totalEvents: integer("total_events").default(0), // Total events in the file
  eventsImported: integer("events_imported").default(0), // Successfully imported
  eventsSkipped: integer("events_skipped").default(0), // Skipped (duplicates, conflicts)
  eventsFailed: integer("events_failed").default(0), // Failed to import
  
  // Conflict handling
  conflictsDetected: integer("conflicts_detected").default(0), // Number of conflicts found
  conflictResolution: varchar("conflict_resolution").default('skip'), // 'skip', 'overwrite', 'merge', 'ask'
  
  // Error handling
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  
  // Processing times
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Imported data reference
  importedShiftIds: text("imported_shift_ids").array(), // Array of created shift IDs
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("calendar_imports_workspace_idx").on(table.workspaceId),
  index("calendar_imports_user_idx").on(table.userId),
  index("calendar_imports_status_idx").on(table.status),
  index("calendar_imports_created_idx").on(table.createdAt),
]);

export const calendarSyncEvents = pgTable("calendar_sync_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  
  // Event type
  eventType: varchar("event_type").notNull(), // 'export', 'import', 'subscribe', 'unsubscribe', 'sync_error', 'conflict_detected'
  
  // Related entities
  subscriptionId: varchar("subscription_id"),
  importId: varchar("import_id"),
  
  // Event details
  description: text("description"),
  metadata: jsonb("metadata"), // Additional event-specific data
  
  // AI Brain tracking
  aiBrainProcessed: boolean("ai_brain_processed").default(false),
  aiBrainJobId: varchar("ai_brain_job_id"),
  aiSuggestions: jsonb("ai_suggestions"), // AI-generated suggestions based on event
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  syncType: varchar("sync_type"),
}, (table) => [
  index("calendar_sync_events_workspace_idx").on(table.workspaceId),
  index("calendar_sync_events_type_idx").on(table.eventType),
  index("calendar_sync_events_created_idx").on(table.createdAt),
]);

export const approvalGates = pgTable("approval_gates", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  gateData: jsonb("gate_data").notNull(),
  gateType: varchar("gate_type"),
  gateStatus: varchar("gate_status").default('pending'),
  requesterId: varchar("requester_id"),
  approverId: varchar("approver_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ag_workspace_idx").on(table.workspaceId),
  index("ag_id_idx").on(table.id),
  index("ag_status_idx").on(table.gateStatus),
  index("ag_type_idx").on(table.gateType),
]);

export const scheduleLifecycles = pgTable("schedule_lifecycles", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  lifecycleData: jsonb("lifecycle_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sl_workspace_idx").on(table.workspaceId),
  index("sl_id_idx").on(table.id),
]);

export const shiftChatrooms = pgTable("shift_chatrooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  
  // Room Info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, closed, archived
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by"),
  closureReason: varchar("closure_reason", { length: 255 }), // manual, auto_timeout, shift_completed
  
  // Auto-close settings
  autoCloseTimeoutMinutes: integer("auto_close_timeout_minutes").default(60), // Auto-close X minutes after shift end
  autoClosedAt: timestamp("auto_closed_at"),
  
  // DAR Generation tracking
  darGenerated: boolean("dar_generated").default(false),
  darGeneratedAt: timestamp("dar_generated_at"),
  
  // Audit integrity - prevents deletion
  isAuditProtected: boolean("is_audit_protected").default(true),
  
  // Meeting room type (for Trinity recording)
  isMeetingRoom: boolean("is_meeting_room").default(false),
  trinityRecordingEnabled: boolean("trinity_recording_enabled").default(false),

  // Incident flow state — DB-persisted so state survives server restarts
  // Stores the in-progress 9-question incident flow (step, responses, reporter, shiftId)
  incidentFlowState: jsonb("incident_flow_state"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("shift_chatrooms_shift_idx").on(table.shiftId),
  index("shift_chatrooms_workspace_idx").on(table.workspaceId),
  index("shift_chatrooms_status_idx").on(table.status),
]);

export const shiftChatroomMembers = pgTable("shift_chatroom_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  chatroomId: varchar("chatroom_id").notNull(),
  userId: varchar("user_id").notNull(),
  employeeId: varchar("employee_id"),
  
  // Role in chatroom
  role: varchar("role", { length: 50 }).default("member").notNull(), // member, supervisor, manager
  
  // Participation tracking
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
  
  // Activity metrics
  messageCount: integer("message_count").default(0),
  photoCount: integer("photo_count").default(0),
  lastActiveAt: timestamp("last_active_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("shift_chatroom_members_chatroom_idx").on(table.chatroomId),
  index("shift_chatroom_members_user_idx").on(table.userId),
]);

export const shiftChatroomMessages = pgTable("shift_chatroom_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  chatroomId: varchar("chatroom_id").notNull(),
  userId: varchar("user_id").notNull(),
  
  // Message content
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 50 }).default("text").notNull(), // text, photo, report, system
  
  // For photo messages
  attachmentUrl: varchar("attachment_url", { length: 500 }),
  attachmentType: varchar("attachment_type", { length: 50 }), // image/jpeg, application/pdf, etc.
  attachmentSize: integer("attachment_size"), // bytes
  
  // Audit integrity
  isAuditProtected: boolean("is_audit_protected").default(true),
  
  // Metadata
  metadata: jsonb("metadata"), // Additional structured data
  
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("shift_chatroom_messages_chatroom_idx").on(table.chatroomId),
  index("shift_chatroom_messages_user_idx").on(table.userId),
  index("shift_chatroom_messages_created_idx").on(table.createdAt),
]);

export const shiftCoverageRequests = pgTable("shift_coverage_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  originalShiftId: varchar("original_shift_id").notNull(),
  
  // Reason for coverage need
  reason: varchar("reason", { length: 50 }).notNull(), // 'call_off', 'ncns', 'sick', 'emergency', 'manual'
  reasonDetails: text("reason_details"),
  
  // Original employee who called off (nullable if shift was unassigned)
  originalEmployeeId: varchar("original_employee_id"),
  
  // Shift details (denormalized for quick access)
  shiftDate: varchar("shift_date").notNull(), // YYYY-MM-DD
  shiftStartTime: timestamp("shift_start_time").notNull(),
  shiftEndTime: timestamp("shift_end_time").notNull(),
  clientId: varchar("client_id"),
  
  // Coverage status
  status: shiftCoverageStatusEnum("status").notNull().default("open"),
  
  // Timing
  expiresAt: timestamp("expires_at").notNull(), // When to stop seeking and escalate
  acceptedAt: timestamp("accepted_at"),
  escalatedAt: timestamp("escalated_at"),
  
  // Resolution
  acceptedByEmployeeId: varchar("accepted_by_employee_id"),
  newShiftId: varchar("new_shift_id"),
  
  // Stats
  candidatesInvited: integer("candidates_invited").default(0),
  offersDeclined: integer("offers_declined").default(0),
  
  // Trinity metadata
  aiProcessed: boolean("ai_processed").default(false),
  trinityNotes: text("trinity_notes"),

  // How this coverage request was submitted: 'app' | 'email' | 'sms' | 'phone'
  submissionMethod: varchar("submission_method", { length: 30 }).default('app'),

  // Three-tier staged cascade (SCHED-6)
  // Tier 1: stay-late eligible (currently on shift), Tier 2: internal pool, Tier 3: full platform pool
  currentTier: integer("current_tier").default(1),
  tier1NotifiedAt: timestamp("tier1_notified_at"),
  tier2NotifiedAt: timestamp("tier2_notified_at"),
  tier3NotifiedAt: timestamp("tier3_notified_at"),
  tierWindowExpiresAt: timestamp("tier_window_expires_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("shift_coverage_workspace_idx").on(table.workspaceId),
  index("shift_coverage_status_idx").on(table.status),
  index("shift_coverage_expires_idx").on(table.expiresAt),
]);

export const stagedShifts = pgTable("staged_shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  contractorId: varchar("contractor_id"),
  
  // Source
  sourceType: varchar("source_type", { length: 30 }).default('email'),
  sourceEmailId: varchar("source_email_id", { length: 255 }),
  sourceEmailSubject: text("source_email_subject"),
  sourceEmailBody: text("source_email_body"),
  
  // Extracted shift details
  location: varchar("location", { length: 500 }),
  shiftDate: date("shift_date"),
  startTime: time("start_time"),
  endTime: time("end_time"),
  payRate: decimal("pay_rate", { precision: 8, scale: 2 }),
  
  // Requirements
  requirements: jsonb("requirements").$type<{
    armed?: boolean;
    unarmed?: boolean;
    certifications?: string[];
    dressCode?: string;
    specialInstructions?: string;
  }>().default(sql`'{}'::jsonb`),
  
  // Client/POC info
  clientName: varchar("client_name", { length: 200 }),
  pocName: varchar("poc_name", { length: 150 }),
  pocPhone: varchar("poc_phone", { length: 30 }),
  pocEmail: varchar("poc_email", { length: 255 }),
  
  // Extraction confidence
  extractedData: jsonb("extracted_data").$type<Record<string, any>>(),
  confidenceScores: jsonb("confidence_scores").$type<Record<string, number>>(),
  overallConfidence: decimal("overall_confidence", { precision: 5, scale: 4 }),
  
  // Status: 'pending_review', 'ready_to_staff', 'staffing_in_progress', 'assigned', 'contractor_notified', 'completed', 'cancelled'
  status: varchar("status", { length: 30 }).notNull().default('pending_review'),
  needsManualReview: boolean("needs_manual_review").default(false),
  manualReviewReason: text("manual_review_reason"),
  
  // Assignment
  assignedEmployeeId: varchar("assigned_employee_id"),
  assignedAt: timestamp("assigned_at"),
  
  // Audit
  processedByAi: boolean("processed_by_ai").default(false),
  aiProcessingCredits: integer("ai_processing_credits").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("staged_shifts_workspace_idx").on(table.workspaceId),
  index("staged_shifts_contractor_idx").on(table.contractorId),
  index("staged_shifts_status_idx").on(table.status),
  index("staged_shifts_date_idx").on(table.shiftDate),
]);

export const automatedShiftOffers = pgTable("automated_shift_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stagedShiftId: varchar("staged_shift_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Offer details
  offerRank: integer("offer_rank").notNull(),
  matchScore: decimal("match_score", { precision: 5, scale: 4 }),
  matchReasoning: text("match_reasoning"),
  
  // Status: 'pending_response', 'accepted', 'declined', 'expired', 'withdrawn'
  status: varchar("status", { length: 30 }).notNull().default('pending_response'),
  
  // Response
  respondedAt: timestamp("responded_at"),
  declineReason: varchar("decline_reason", { length: 255 }),
  
  // AI approval (after acceptance)
  aiApprovalStatus: varchar("ai_approval_status", { length: 20 }),
  aiApprovalConfidence: decimal("ai_approval_confidence", { precision: 5, scale: 4 }),
  aiApprovalReasoning: text("ai_approval_reasoning"),
  
  // Expiration
  offerExpiresAt: timestamp("offer_expires_at").notNull(),
  
  // Notifications
  
  // Public access token (cryptographically random, used in email links for secure accept/decline)
  publicToken: varchar("public_token", { length: 64 }).default(sql`encode(gen_random_bytes(32), 'hex')`),

  pushNotificationSent: boolean("push_notification_sent").default(false),
  emailNotificationSent: boolean("email_notification_sent").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("shift_offers_staged_shift_idx").on(table.stagedShiftId),
  index("shift_offers_employee_idx").on(table.employeeId),
  index("shift_offers_status_idx").on(table.status),
  index("shift_offers_expires_idx").on(table.offerExpiresAt),
]);

export const staffingClaimTokens = pgTable("staffing_claim_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Deduplication key: hash of (clientEmail + locationSlug + shiftDateStr)
  workspaceId: varchar("workspace_id"),
  claimKey: varchar("claim_key", { length: 128 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }).notNull(),
  locationHash: varchar("location_hash", { length: 128 }).notNull(),
  shiftDate: varchar("shift_date", { length: 32 }).notNull(),
  shiftDescription: text("shift_description"),
  // Winner — null until claimed
  claimedByWorkspaceId: varchar("claimed_by_workspace_id"),
  claimedByWorkspaceName: varchar("claimed_by_workspace_name"),
  claimedByEmail: varchar("claimed_by_email"),
  claimedAt: timestamp("claimed_at"),
  status: varchar("status", { length: 16 }).notNull().default("open"), // 'open' | 'claimed'
  // All competing workspaces [ { workspaceId, workspaceName, staffingEmail, registeredAt } ]
  competingWorkspaces: jsonb("competing_workspaces").default([]),
  // Drop notifications sent to losers
  dropNotificationsSent: boolean("drop_notifications_sent").default(false),
  expiresAt: timestamp("expires_at"),

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  uniqueIndex("idx_staffing_claims_key").on(table.claimKey),
  index("idx_staffing_claims_status").on(table.status, table.createdAt),
  index("idx_staffing_claims_client").on(table.clientEmail, table.status),
]);

export const shiftCoverageClaims = pgTable("shift_coverage_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id"),
  employeeId: varchar("employee_id"),
  claimType: varchar("claim_type").default('volunteer'),
  status: varchar("status").default('pending'),
  respondedAt: timestamp("responded_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── shift_coverage_offers ───────────────────────────────────────────────────
// Tracks per-employee offers dispatched for shift coverage requests.
// Created by coveragePipeline.ts; first-accept-wins atomic logic.
export const shiftCoverageOffers = pgTable("shift_coverage_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coverageRequestId: varchar("coverage_request_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  status: varchar("status", { length: 30 }).notNull().default('pending'),
  tier: integer("tier").default(1),
  aiScore: varchar("ai_score", { length: 20 }),
  aiReason: text("ai_reason"),
  notificationId: varchar("notification_id"),
  respondedAt: timestamp("responded_at"),
  declineReason: varchar("decline_reason", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sco_coverage_request_idx").on(table.coverageRequestId),
  index("sco_employee_idx").on(table.employeeId),
  index("sco_workspace_idx").on(table.workspaceId),
  index("sco_status_idx").on(table.status),
]);

// ═══════════════════════════════════════════════════════════════
// PHASE D — On-Call Schedule Enforcement (Bryan-approved, 2026 sprint)
// ═══════════════════════════════════════════════════════════════

export const onCallSchedule = pgTable("on_call_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: varchar("role", { length: 30 }).notNull(), // supervisor | manager | owner
  phoneNumber: varchar("phone_number", { length: 20 }),
  shiftType: varchar("shift_type", { length: 30 }).notNull(), // day | swing | graveyard | custom
  onCallStart: timestamp("on_call_start").notNull(),
  onCallEnd: timestamp("on_call_end").notNull(),
  daysOfWeek: jsonb("days_of_week").$type<number[]>().default(sql`'[]'::jsonb`), // 0=Sun...6=Sat
  isBackup: boolean("is_backup").notNull().default(false),
  backupForUserId: varchar("backup_for_user_id"),
  createdBy: varchar("created_by").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("on_call_schedule_workspace_idx").on(table.workspaceId),
  index("on_call_schedule_user_idx").on(table.userId),
  index("on_call_schedule_range_idx").on(table.onCallStart, table.onCallEnd),
  index("on_call_schedule_active_idx").on(table.active),
]);

export type OnCallSchedule = typeof onCallSchedule.$inferSelect;

// ─── GROUP 5 PHASE 35F: OFFICER AVAILABILITY ─────────────────────────────────
export const officerAvailability = pgTable("officer_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  officerId: varchar("officer_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun..6=Sat
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  effectiveFrom: date("effective_from"),
  effectiveUntil: date("effective_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("officer_avail_workspace_idx").on(table.workspaceId),
  index("officer_avail_officer_idx").on(table.officerId),
  index("officer_avail_day_idx").on(table.dayOfWeek),
]);
export type OfficerAvailability = typeof officerAvailability.$inferSelect;

// ─── GROUP 5 PHASE 35F: SHIFT TRADE REQUESTS ─────────────────────────────────
// shiftSwapRequests already exists; add shift_trade_requests as richer version
export const shiftTradeRequests = pgTable("shift_trade_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  requestingOfficerId: varchar("requesting_officer_id").notNull(),
  requestedShiftId: varchar("requested_shift_id").notNull(),
  offeredShiftId: varchar("offered_shift_id"), // null = open marketplace listing
  targetOfficerId: varchar("target_officer_id"), // null = open for anyone
  // status: pending|accepted|rejected|cancelled|manager_approved|manager_rejected
  status: varchar("status").notNull().default("pending"),
  reason: text("reason"),
  managerId: varchar("manager_id"),
  managerNote: text("manager_note"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("shift_trade_workspace_idx").on(table.workspaceId),
  index("shift_trade_requester_idx").on(table.requestingOfficerId),
  index("shift_trade_shift_idx").on(table.requestedShiftId),
  index("shift_trade_status_idx").on(table.status),
]);
export type ShiftTradeRequest = typeof shiftTradeRequests.$inferSelect;

// ─── REPLACEMENT CASCADE LOGS ────────────────────────────────────────────────
// Tracks coverage cascade dispatch events (call-off replacement tiers)
export const replacementCascadeLogs = pgTable("replacement_cascade_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  calloffId: varchar("calloff_id"),
  cascadeTier: integer("cascade_tier").default(1),
  notificationsSent: integer("notifications_sent").default(0),
  acceptedByOfficerId: varchar("accepted_by_officer_id"),
  cascadeStatus: varchar("cascade_status", { length: 50 }).default("active"),
  startedAt: timestamp("started_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_cascade_logs_workspace").on(table.workspaceId),
  index("idx_cascade_logs_shift").on(table.shiftId),
]);
export type ReplacementCascadeLog = typeof replacementCascadeLogs.$inferSelect;

export * from './extended';
