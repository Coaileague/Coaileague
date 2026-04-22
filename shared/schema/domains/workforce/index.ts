// ═══════════════════════════════════════════════════════════════
// Domain 3 of 15: Workforce
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 34

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, index, uniqueIndex, primaryKey, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  achievementCategoryEnum,
  availabilityStatusEnum,
  complianceEnrollmentStatusEnum,
  employeeDocumentStatusEnum,
  employeeDocumentTypeEnum,
  feedbackPriorityEnum,
  feedbackStatusEnum,
  feedbackTypeEnum,
  guardCardStatusEnum,
  operatorCredentialTypeEnum,
  personalityTagCategoryEnum,
  reviewStatusEnum,
  reviewTypeEnum,
  scoringEventTypeEnum,
  topsVerificationStatusEnum,
  trainingDifficultyEnum,
  workspaceRoleEnum,
} from '../../enums';

export const employeeSkills = pgTable("employee_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id"),
  skillName: varchar("skill_name").notNull(), // e.g., "Spanish", "CDL-A", "Forklift", "CPR"
  skillCategory: varchar("skill_category").notNull(), // "language", "certification", "technical", "soft_skill"
  proficiencyLevel: integer("proficiency_level").default(3), // 1-5 scale
  verified: boolean("verified").default(false), // Has this been verified by manager/certification?
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"), // For certifications that expire
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_employee_skills_employee").on(table.employeeId),
  index("idx_employee_skills_category").on(table.skillCategory),
  index("idx_employee_skills_workspace").on(table.workspaceId),
]);

export const contractorPool = pgTable("contractor_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Basic info
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone").notNull(),
  
  // Employment type
  contractorType: varchar("contractor_type").notNull(), // "w2_temp", "1099_independent", "agency"
  agencyName: varchar("agency_name"), // If agency worker
  
  // Availability
  isActive: boolean("is_active").default(true),
  availableForLastMinute: boolean("available_for_last_minute").default(true),
  maxDistanceWilling: integer("max_distance_willing").default(75), // miles
  homeLatitude: decimal("home_latitude", { precision: 10, scale: 7 }),
  homeLongitude: decimal("home_longitude", { precision: 10, scale: 7 }),
  
  // Compensation
  minHourlyRate: decimal("min_hourly_rate", { precision: 10, scale: 2 }).notNull(),
  maxHourlyRate: decimal("max_hourly_rate", { precision: 10, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }), // Actual agreed rate for billing
  overtimeRate: decimal("overtime_rate", { precision: 10, scale: 2 }), // Rate for OT hours (typically 1.5x)
  doubletimeRate: decimal("doubletime_rate", { precision: 10, scale: 2 }), // Rate for DT hours (typically 2x)
  overtimeAllowed: boolean("overtime_allowed").default(false),
  maxWeeklyHours: integer("max_weekly_hours").default(40),

  // QuickBooks Integration (1099 contractors go through A/P Bills, not Payroll)
  quickbooksVendorId: varchar("quickbooks_vendor_id"), // QuickBooks Vendor ID for bill creation
  quickbooksSyncStatus: varchar("quickbooks_sync_status").default("pending"), // pending, synced, error
  quickbooksLastSync: timestamp("quickbooks_last_sync"),
  quickbooksRealmId: varchar("quickbooks_realm_id"), // QB company realmId - scopes IDs per environment
  
  // Profile
  profilePhotoUrl: text("profile_photo_url"),
  bio: text("bio"),
  
  // Onboarding status
  onboardingCompleted: boolean("onboarding_completed").default(false),
  backgroundCheckStatus: varchar("background_check_status").default("pending"), // "pending", "approved", "failed"
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_contractor_pool_active").on(table.isActive, table.availableForLastMinute),
  index("idx_contractor_pool_email").on(table.email),
]);

export const contractorSkills = pgTable("contractor_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull(),
  skillName: varchar("skill_name").notNull(),
  skillCategory: varchar("skill_category").notNull(),
  proficiencyLevel: integer("proficiency_level").default(3),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("idx_contractor_skills_contractor").on(table.contractorId),
]);

export const contractorAssignments = pgTable("contractor_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  contractorId: varchar("contractor_id").notNull(),
  shiftOfferId: varchar("shift_offer_id").notNull(),
  
  // Assignment details
  assignedRate: decimal("assigned_rate", { precision: 10, scale: 2 }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: varchar("assigned_by"), // User who created the fill request
  
  // Status
  status: varchar("status").default("active"), // "active", "cancelled", "completed"
  
  // Onboarding
  onboardingChecklistId: varchar("onboarding_checklist_id"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_contractor_assignments_shift").on(table.shiftId),
  index("idx_contractor_assignments_contractor").on(table.contractorId),
  index("idx_contractor_assignments_workspace").on(table.workspaceId),
]);

export const performanceReviews = pgTable("performance_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  reviewerId: varchar("reviewer_id"),

  // Review details
  reviewType: reviewTypeEnum("review_type").notNull(),
  reviewPeriodStart: timestamp("review_period_start"),
  reviewPeriodEnd: timestamp("review_period_end"),

  // Ratings (1-5 scale)
  overallRating: integer("overall_rating"), // 1-5
  technicalSkillsRating: integer("technical_skills_rating"),
  communicationRating: integer("communication_rating"),
  teamworkRating: integer("teamwork_rating"),
  leadershipRating: integer("leadership_rating"),
  attendanceRating: integer("attendance_rating"),
  // Phase 35J dedicated dimensions
  reliabilityRating: integer("reliability_rating"),
  professionalismRating: integer("professionalism_rating"),
  clientFeedbackRating: integer("client_feedback_rating"),

  // Feedback
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  goals: text("goals").array(), // Array of goal strings
  reviewerComments: text("reviewer_comments"),
  employeeComments: text("employee_comments"),

  // Status & completion
  status: reviewStatusEnum("status").default("draft"),
  completedAt: timestamp("completed_at"),

  // Salary/promotion decisions
  salaryAdjustment: decimal("salary_adjustment", { precision: 10, scale: 2 }),
  promotionRecommended: boolean("promotion_recommended").default(false),

  // ========================================================================
  // TALENT ANALYTICS EXTENDED FIELDS - Performance-to-Pay Loop & Analytics
  // ========================================================================

  // Auto-calculated performance metrics (from Unified Data Nexus)
  shiftsCompletedOnTime: integer("shifts_completed_on_time"),
  totalShiftsAssigned: integer("total_shifts_assigned"),
  attendanceRate: decimal("attendance_rate", { precision: 5, scale: 2 }),
  averageHoursWorkedPerWeek: decimal("average_hours_worked_per_week", { precision: 5, scale: 2 }),
  overtimeHours: decimal("overtime_hours", { precision: 10, scale: 2 }),

  // Report quality metrics (Reports & Forms integration)
  reportsSubmitted: integer("reports_submitted"),
  reportsApproved: integer("reports_approved"),
  reportsRejected: integer("reports_rejected"),
  reportQualityScore: decimal("report_quality_score", { precision: 5, scale: 2 }),

  // Compliance & safety
  complianceViolations: integer("compliance_violations"),
  safetyIncidents: integer("safety_incidents"),
  trainingCompletionRate: decimal("training_completion_rate", { precision: 5, scale: 2 }),

  // Additional subjective ratings (Talent Analytics)
  qualityOfWorkRating: integer("quality_of_work_rating"), // 1-5
  initiativeRating: integer("initiative_rating"), // 1-5

  // Overall composite score (auto-calculated from weighted metrics)
  compositeScore: decimal("composite_score", { precision: 5, scale: 2 }),
  performanceTier: varchar("performance_tier"), // 'exceptional', 'exceeds', 'meets', 'needs_improvement', 'unsatisfactory'

  // Auto-generated pay increase recommendation
  currentHourlyRate: decimal("current_hourly_rate", { precision: 10, scale: 2 }),
  suggestedPayIncrease: decimal("suggested_pay_increase", { precision: 10, scale: 2 }),
  suggestedPayIncreasePercentage: decimal("suggested_pay_increase_percentage", { precision: 5, scale: 2 }),
  payIncreaseFormula: text("pay_increase_formula"),
  payIncreaseJustification: text("pay_increase_justification"),

  // Manager override
  managerApprovedIncrease: decimal("manager_approved_increase", { precision: 10, scale: 2 }),
  managerOverrideReason: text("manager_override_reason"),
  employeeAcknowledgedAt: timestamp("employee_acknowledged_at"),

  // Goals & development (Career Pathing)
  goalsMet: jsonb("goals_met").$type<string[]>(),
  goalsNotMet: jsonb("goals_not_met").$type<string[]>(),
  nextQuarterGoals: jsonb("next_quarter_goals").$type<string[]>(),
  developmentNeeds: jsonb("development_needs").$type<string[]>(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const managerAssignments = pgTable("manager_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  managerId: varchar("manager_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Ensure no duplicate manager-employee pairs
  uniqueManagerEmployee: uniqueIndex("unique_manager_employee").on(table.managerId, table.employeeId),
}));

export const employeeDocuments = pgTable("employee_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  applicationId: varchar("application_id"),

  // Document classification
  documentType: employeeDocumentTypeEnum("document_type").notNull(),
  documentName: varchar("document_name").notNull(),
  documentDescription: text("document_description"),

  // File storage (Object Storage)
  fileUrl: varchar("file_url").notNull(), // Permanent storage URL
  fileSize: integer("file_size"), // Bytes
  fileType: varchar("file_type"), // 'application/pdf', 'image/jpeg'
  originalFileName: varchar("original_file_name"),

  // Audit trail - WHO uploaded
  uploadedBy: varchar("uploaded_by"),
  uploadedByEmail: varchar("uploaded_by_email"), // Denormalized for audit persistence
  uploadedByRole: varchar("uploaded_by_role"), // Role at time of upload

  // Audit trail - WHEN uploaded
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),

  // Audit trail - WHERE uploaded from
  uploadIpAddress: varchar("upload_ip_address").notNull(),
  uploadUserAgent: text("upload_user_agent"),
  uploadGeoLocation: varchar("upload_geo_location"), // City, State, Country

  // Document lifecycle
  status: employeeDocumentStatusEnum("status").default('uploaded'),
  expirationDate: timestamp("expiration_date"), // For licenses, certifications

  // Approval workflow
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),

  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  // Compliance & retention
  isComplianceDocument: boolean("is_compliance_document").default(false), // I-9, W-4, etc.
  retentionPeriodYears: integer("retention_period_years").default(7), // Default: 7 years for audit defense
  deleteAfter: timestamp("delete_after"), // Auto-calculated: uploadedAt + retentionPeriodYears

  // Document verification
  isVerified: boolean("is_verified").default(false),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),

  // Immutability flag (for signed documents)
  isImmutable: boolean("is_immutable").default(false), // Once signed, cannot be modified
  digitalSignatureHash: varchar("digital_signature_hash"), // SHA-256 hash for tamper detection

  // Metadata
  metadata: jsonb("metadata"), // Custom fields, OCR data, etc.

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // TRINITY.md Section R / Law P1 — soft delete (HR records retained for compliance)
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
}, (table) => [
  index("idx_employee_documents_employee").on(table.employeeId),
  index("idx_employee_documents_type").on(table.documentType),
  index("idx_employee_documents_status").on(table.status),
  index("idx_employee_documents_expiration").on(table.expirationDate),
]);

export const turnoverRiskScores = pgTable("turnover_risk_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Risk scoring
  riskScore: decimal("risk_score", { precision: 5, scale: 2 }).notNull(), // 0-100% probability
  riskLevel: varchar("risk_level").notNull(), // 'low', 'medium', 'high', 'critical'
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }), // ML model confidence

  // Prediction details
  predictionPeriod: integer("prediction_period").default(90), // Days (default: 90-day window)
  predictedTurnoverDate: timestamp("predicted_turnover_date"),

  // Cost impact
  replacementCost: decimal("replacement_cost", { precision: 10, scale: 2 }), // Estimated cost to replace
  trainingCost: decimal("training_cost", { precision: 10, scale: 2 }),
  lostProductivityCost: decimal("lost_productivity_cost", { precision: 10, scale: 2 }),
  totalTurnoverCost: decimal("total_turnover_cost", { precision: 10, scale: 2 }),

  // Risk factors (AI-identified)
  riskFactors: jsonb("risk_factors"), // { low_hours: 0.3, supervisor_rejections: 0.4, tardiness: 0.3 }
  recommendations: text("recommendations"), // AI-generated retention strategies

  // Model metadata
  aiModel: varchar("ai_model").default("gpt-4"), // Model used for prediction
  dataPointsUsed: integer("data_points_used"), // Number of historical records analyzed
  analysisDate: timestamp("analysis_date").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueEmployeeAnalysis: uniqueIndex("unique_employee_current_prediction").on(table.employeeId, table.analysisDate),
}));

export const skillGapAnalyses = pgTable("skill_gap_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  targetRoleId: varchar("target_role_id").notNull(),

  // Current state (from employee profile)
  currentRole: varchar("current_role"),
  currentSkills: jsonb("current_skills").$type<string[]>().default(sql`'[]'`),
  currentCertifications: jsonb("current_certifications").$type<string[]>().default(sql`'[]'`),
  currentTrainingCompleted: jsonb("current_training_completed").$type<string[]>().default(sql`'[]'`),

  // Gap analysis results
  missingSkills: jsonb("missing_skills").$type<string[]>().default(sql`'[]'`),
  missingCertifications: jsonb("missing_certifications").$type<string[]>().default(sql`'[]'`),
  missingTraining: jsonb("missing_training").$type<string[]>().default(sql`'[]'`),

  // Readiness scoring
  readinessScore: decimal("readiness_score", { precision: 5, scale: 2 }), // 0-100% overall readiness
  skillsReadiness: decimal("skills_readiness", { precision: 5, scale: 2 }),
  certificationsReadiness: decimal("certifications_readiness", { precision: 5, scale: 2 }),
  trainingReadiness: decimal("training_readiness", { precision: 5, scale: 2 }),
  experienceReadiness: decimal("experience_readiness", { precision: 5, scale: 2 }),

  // Time-to-ready estimate
  estimatedTimeToReady: integer("estimated_time_to_ready"), // Months
  blockers: jsonb("blockers").$type<string[]>().default(sql`'[]'`), // "Needs OSHA 30 certification"

  // Recommended next steps (auto-generated action plan)
  recommendedActions: jsonb("recommended_actions").$type<{
    action: string;
    type: string; // 'skill_training', 'certification', 'course', 'experience'
    priority: string; // 'high', 'medium', 'low'
    estimatedTime: number; // Days to complete
    trainingLinkId?: string; // Links to Training Management course
  }[]>().default(sql`'[]'`),

  // Progress tracking
  actionsCompleted: integer("actions_completed").default(0),
  totalActions: integer("total_actions").default(0),
  lastProgressUpdate: timestamp("last_progress_update"),

  // Lifecycle
  status: varchar("status").default("active"), // 'active', 'in_progress', 'ready', 'cancelled'
  employeeInterestedAt: timestamp("employee_interested_at"),
  managerReviewedAt: timestamp("manager_reviewed_at"),
  managerNotes: text("manager_notes"),

  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeTargetIndex: uniqueIndex("skill_gap_analyses_employee_target_idx").on(table.employeeId, table.targetRoleId),
  readinessIndex: index("skill_gap_analyses_readiness_idx").on(table.readinessScore),
}));

export const pulseSurveyTemplates = pgTable("pulse_survey_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  title: varchar("title").notNull(),
  description: text("description"),

  // Survey configuration
  questions: jsonb("questions").$type<Array<{
    id: string;
    text: string;
    type: 'rating' | 'multiple_choice' | 'text' | 'yes_no';
    options?: string[];
    required: boolean;
    category: 'workload' | 'management' | 'environment' | 'growth' | 'compensation' | 'culture' | 'safety' | 'resources';
  }>>().notNull(),

  // Scheduling
  frequency: varchar("frequency").default("monthly"), // 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'one_time'
  isActive: boolean("is_active").default(true),

  // Anonymity settings
  isAnonymous: boolean("is_anonymous").default(true),
  showResultsToEmployees: boolean("show_results_to_employees").default(false),

  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  responsesData: jsonb("responses_data").default('[]'),
}, (table) => ({
  workspaceActiveIndex: index("pulse_survey_templates_workspace_active_idx").on(table.workspaceId, table.isActive),
}));

export const pulseSurveyResponses = pgTable("pulse_survey_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  surveyTemplateId: varchar("survey_template_id").notNull(),
  employeeId: varchar("employee_id"),
  responses: jsonb("responses").$type<Array<{ questionId: string; answer: string | number | string[] }>>().notNull(),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }),
  sentimentLabel: varchar("sentiment_label"),
  emotionalTone: varchar("emotional_tone"),
  keyThemes: jsonb("key_themes").$type<string[]>().default(sql`'[]'`),
  engagementScore: decimal("engagement_score", { precision: 5, scale: 2 }),
  submittedAt: timestamp("submitted_at").defaultNow(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  surveyEmployeeIndex: index("pulse_responses_survey_employee_idx").on(table.surveyTemplateId, table.employeeId),
  sentimentIndex: index("pulse_responses_sentiment_idx").on(table.workspaceId, table.sentimentLabel),
  engagementIndex: index("pulse_responses_engagement_idx").on(table.workspaceId, table.engagementScore),
}));

export const anonymousSuggestions = pgTable("anonymous_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Submitter (anonymous)
  employeeId: varchar("employee_id"),

  // Suggestion content
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  category: varchar("category"), // 'safety', 'process', 'equipment', 'culture', 'compensation', 'benefits', 'other'

  // AI Sentiment Analysis
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }),
  sentimentLabel: varchar("sentiment_label"),
  urgencyLevel: varchar("urgency_level"), // 'low', 'medium', 'high', 'critical' (AI-determined)

  // Ticket tracking (Support System integration)
  ticketId: varchar("ticket_id"),
  status: varchar("status").default("submitted"), // 'submitted', 'under_review', 'in_progress', 'implemented', 'declined', 'duplicate'
  statusUpdatedAt: timestamp("status_updated_at"),

  // Management response
  responseToEmployee: text("response_to_employee"), // Public response visible to submitter
  internalNotes: text("internal_notes"), // Private manager notes
  implementationDate: timestamp("implementation_date"),
  declineReason: text("decline_reason"),

  // Visibility
  isAnonymous: boolean("is_anonymous").default(true),
  visibleToAllEmployees: boolean("visible_to_all_employees").default(false), // Suggestion board feature

  // Engagement metrics
  upvotes: integer("upvotes").default(0), // Other employees can upvote
  viewCount: integer("view_count").default(0),

  submittedAt: timestamp("submitted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceStatusIndex: index("suggestions_workspace_status_idx").on(table.workspaceId, table.status),
  categoryUrgencyIndex: index("suggestions_category_urgency_idx").on(table.category, table.urgencyLevel),
}));

export const employeeHealthScores = pgTable("employee_health_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Calculated period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Engagement metrics (0-100 scale)
  overallEngagementScore: decimal("overall_engagement_score", { precision: 5, scale: 2 }),
  surveyParticipationRate: decimal("survey_participation_rate", { precision: 5, scale: 2 }),
  averageSentimentScore: decimal("average_sentiment_score", { precision: 5, scale: 2 }),

  // Component scores
  workloadSatisfaction: decimal("workload_satisfaction", { precision: 5, scale: 2 }),
  managementSatisfaction: decimal("management_satisfaction", { precision: 5, scale: 2 }),
  growthSatisfaction: decimal("growth_satisfaction", { precision: 5, scale: 2 }),
  compensationSatisfaction: decimal("compensation_satisfaction", { precision: 5, scale: 2 }),
  cultureSatisfaction: decimal("culture_satisfaction", { precision: 5, scale: 2 }),

  // Risk indicators
  turnoverRiskScore: decimal("turnover_risk_score", { precision: 5, scale: 2 }), // AI Predictions integration
  riskLevel: varchar("risk_level"), // 'low', 'medium', 'high', 'critical'
  riskFactors: jsonb("risk_factors").$type<string[]>().default(sql`'[]'`), // ['low_engagement', 'compensation_concern', 'manager_conflict']

  // Manager action queue
  requiresManagerAction: boolean("requires_manager_action").default(false),
  actionPriority: varchar("action_priority"), // 'low', 'medium', 'high', 'urgent'
  suggestedActions: jsonb("suggested_actions").$type<Array<{
    action: string;
    conversationStarter: string; // AI-generated
    expectedImpact: string;
  }>>().default(sql`'[]'`),

  // Action tracking
  managerNotified: boolean("manager_notified").default(false),
  managerNotifiedAt: timestamp("manager_notified_at"),
  actionTaken: boolean("action_taken").default(false),
  actionTakenAt: timestamp("action_taken_at"),
  actionNotes: text("action_notes"),

  calculatedAt: timestamp("calculated_at").defaultNow(),
}, (table) => ({
  employeePeriodIndex: index("health_scores_employee_period_idx").on(table.employeeId, table.periodEnd),
  riskLevelIndex: index("health_scores_risk_level_idx").on(table.workspaceId, table.riskLevel, table.requiresManagerAction),
  actionQueueIndex: index("health_scores_action_queue_idx").on(table.requiresManagerAction, table.managerNotified),
}));

export const offboardingSessions = pgTable("offboarding_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Employee leaving
  employeeId: varchar("employee_id").notNull(),
  lastWorkDay: timestamp("last_work_day").notNull(),

  // Reason for leaving
  exitReason: varchar("exit_reason"), // 'resignation', 'termination', 'retirement', 'end_of_contract', 'other'
  exitReasonDetails: text("exit_reason_details"),
  isVoluntary: boolean("is_voluntary").default(true),

  // Exit interview
  exitInterviewScheduled: timestamp("exit_interview_scheduled"),
  exitInterviewCompleted: timestamp("exit_interview_completed"),
  exitInterviewConductedBy: varchar("exit_interview_conducted_by"),
  exitInterviewNotes: text("exit_interview_notes"),

  // Asset returns
  assetsReturned: boolean("assets_returned").default(false),
  assetReturnNotes: text("asset_return_notes"),

  // Access revocation
  accessRevoked: boolean("access_revoked").default(false),
  accessRevokedAt: timestamp("access_revoked_at"),
  accessRevokedBy: varchar("access_revoked_by"),

  // Final paycheck
  finalPayCalculated: boolean("final_pay_calculated").default(false),
  finalPayAmount: decimal("final_pay_amount", { precision: 10, scale: 2 }),
  finalPayDate: timestamp("final_pay_date"),

  // Clearance
  clearanceStatus: varchar("clearance_status").default('pending'), // 'pending', 'cleared', 'issues'
  clearanceNotes: text("clearance_notes"),

  // Rehire eligibility
  eligibleForRehire: boolean("eligible_for_rehire"),
  rehireNotes: text("rehire_notes"),

  // Status
  status: varchar("status").default('in_progress'), // 'in_progress', 'completed'
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exitInterviewResponses = pgTable("exit_interview_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  sessionId: varchar("session_id").notNull(),

  // Question & answer
  question: text("question").notNull(),
  answer: text("answer"),
  rating: integer("rating"), // 1-5 scale for satisfaction questions

  // Categorization
  category: varchar("category"), // 'satisfaction', 'management', 'culture', 'compensation', 'growth', 'other'

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const employeeAvailability = pgTable("employee_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  
  // Recurring weekly availability
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  startTime: varchar("start_time").notNull(), // "09:00" format
  endTime: varchar("end_time").notNull(), // "17:00" format
  
  // Recurring vs one-time availability
  isRecurring: boolean("is_recurring").default(true), // true = repeats weekly, false = single occurrence
  
  status: availabilityStatusEnum("status").default('available'),
  
  // Metadata
  notes: text("notes"),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  effectiveUntil: timestamp("effective_until"), // Optional end date
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("employee_availability_workspace_idx").on(table.workspaceId),
  employeeIdx: index("employee_availability_employee_idx").on(table.employeeId),
  dayIdx: index("employee_availability_day_idx").on(table.dayOfWeek),
}));

export const insertEmployeeAvailabilitySchema = createInsertSchema(employeeAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  notes: z.string().max(500).optional(),
});

export const satisfactionSurveys = pgTable("satisfaction_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Related entities
  ticketId: varchar("ticket_id").unique(), // Unique to prevent duplicate surveys
  userId: varchar("user_id"),
  agentId: varchar("agent_id"),
  
  // Survey response
  rating: integer("rating").notNull(), // 1-5 scale, validated at DB level
  feedback: text("feedback"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("satisfaction_surveys_ticket_idx").on(table.ticketId),
  index("satisfaction_surveys_agent_date_idx").on(table.agentId, table.createdAt),
  check("rating_valid", sql`${table.rating} BETWEEN 1 AND 5`), // DB-level validation
]);

export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Achievement details
  name: varchar("name").notNull(),
  description: text("description"),
  category: achievementCategoryEnum("category").default('performance'),
  icon: varchar("icon"), // Lucide icon name or emoji
  
  // Points and rarity
  pointsValue: integer("points_value").default(10),
  rarity: varchar("rarity").default('common'), // 'common', 'uncommon', 'rare', 'epic', 'legendary'
  
  // Criteria for automatic awarding
  triggerType: varchar("trigger_type"), // 'clock_in_streak', 'hours_worked', 'tasks_completed', 'manual', etc.
  triggerThreshold: integer("trigger_threshold"), // e.g., 7 for 7-day streak
  
  // Display
  isActive: boolean("is_active").default(true),
  isGlobal: boolean("is_global").default(false), // Platform-wide or workspace-specific
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("achievements_workspace_idx").on(table.workspaceId),
  index("achievements_category_idx").on(table.category),
  index("achievements_active_idx").on(table.isActive),
]);

export const employeePoints = pgTable("employee_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  totalPoints: integer("total_points").default(0),
  currentLevel: integer("current_level").default(1),
  lifetimePoints: integer("lifetime_points").default(0),
  weeklyPoints: integer("weekly_points").default(0),
  monthlyPoints: integer("monthly_points").default(0),
  streakDays: integer("streak_days").default(0),
  longestStreak: integer("longest_streak").default(0),
  achievementsEarned: integer("achievements_earned").default(0),
  lastClockIn: timestamp("last_clock_in"),
  lastActivityAt: timestamp("last_activity_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employee_points_workspace_idx").on(table.workspaceId),
  index("employee_points_employee_idx").on(table.employeeId),
  index("employee_points_total_idx").on(table.totalPoints),
  index("employee_points_level_idx").on(table.currentLevel),
]);

export const employeeAchievements = pgTable("employee_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  achievementId: varchar("achievement_id").notNull(),
  pointsAwarded: integer("points_awarded").default(0),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  earnedAt: timestamp("earned_at").defaultNow(),
}, (table) => [
  uniqueIndex("employee_achievements_unique_idx").on(table.employeeId, table.achievementId),
  index("employee_achievements_workspace_idx").on(table.workspaceId),
  index("employee_achievements_employee_idx").on(table.employeeId),
  index("employee_achievements_achievement_idx").on(table.achievementId),
  index("employee_achievements_earned_idx").on(table.earnedAt),
]);

export const leaderboardCache = pgTable("leaderboard_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Period
  period: varchar("period").notNull(), // 'daily', 'weekly', 'monthly', 'all_time'
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  
  // Rankings (JSON array of {employeeId, rank, points, name})
  rankings: jsonb("rankings").notNull(),
  
  // Cache metadata
  calculatedAt: timestamp("calculated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("leaderboard_cache_workspace_idx").on(table.workspaceId),
  index("leaderboard_cache_period_idx").on(table.period),
  index("leaderboard_cache_expires_idx").on(table.expiresAt),
]);

export const coaileagueEmployeeProfiles = pgTable("coaileague_employee_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull().unique(),
  
  // === COMPOSITE SCORES (0.00-1.00 normalized) ===
  overallScore: decimal("overall_score", { precision: 5, scale: 4 }).default("0.7500"),
  reliabilityScore: decimal("reliability_score", { precision: 5, scale: 4 }).default("0.8500"),
  skillMatchScore: decimal("skill_match_score", { precision: 5, scale: 4 }).default("0.8000"),
  distanceScore: decimal("distance_score", { precision: 5, scale: 4 }).default("0.7000"),
  personalityLikenessScore: decimal("personality_likeness_score", { precision: 5, scale: 4 }).default("0.5000"),
  costEfficiencyScore: decimal("cost_efficiency_score", { precision: 5, scale: 4 }).default("0.8000"),
  
  // === RAW METRICS ===
  // Reliability
  totalShiftsAssigned: integer("total_shifts_assigned").default(0),
  shiftsCompleted: integer("shifts_completed").default(0),
  shiftsNoShow: integer("shifts_no_show").default(0),
  shiftsCallOff: integer("shifts_call_off").default(0),
  shiftsLateCallOff: integer("shifts_late_call_off").default(0),
  shiftsDropped: integer("shifts_dropped").default(0),
  clockInsOnTime: integer("clock_ins_on_time").default(0),
  clockInsLate: integer("clock_ins_late").default(0),
  clockOutsOnTime: integer("clock_outs_on_time").default(0),
  clockOutsLate: integer("clock_outs_late").default(0),
  perfectShifts: integer("perfect_shifts").default(0),
  
  // Distance & Location
  homeLatitude: decimal("home_latitude", { precision: 10, scale: 7 }),
  homeLongitude: decimal("home_longitude", { precision: 10, scale: 7 }),
  maxWillingDistance: integer("max_willing_distance").default(50),
  preferredRegions: text("preferred_regions").array().default(sql`ARRAY[]::text[]`),
  
  // Availability & Response
  typicalResponseTimeMinutes: integer("typical_response_time_minutes").default(120),
  availableForLastMinute: boolean("available_for_last_minute").default(false),
  preferredShiftTypes: text("preferred_shift_types").array().default(sql`ARRAY[]::text[]`),
  blackoutDates: jsonb("blackout_dates"), // Array of date ranges
  
  // Client Feedback Aggregates
  clientPositiveFeedback: integer("client_positive_feedback").default(0),
  clientNegativeFeedback: integer("client_negative_feedback").default(0),
  clientNeutralFeedback: integer("client_neutral_feedback").default(0),
  averageClientRating: decimal("average_client_rating", { precision: 3, scale: 2 }).default("4.00"),
  
  // Cost Metrics
  currentHourlyRate: decimal("current_hourly_rate", { precision: 10, scale: 2 }),
  maxWeeklyHours: integer("max_weekly_hours").default(40),
  currentWeeklyHours: decimal("current_weekly_hours", { precision: 6, scale: 2 }).default("0.00"),
  overtimeEligible: boolean("overtime_eligible").default(true),
  
  // Points System (ties to gamification)
  goodPoints: integer("good_points").default(0),
  negativePoints: integer("negative_points").default(0),
  netPoints: integer("net_points").default(0),
  
  // === HISTORICAL AGGREGATES (for Gemini learning) ===
  weeklyAverageScore30Days: decimal("weekly_average_score_30_days", { precision: 5, scale: 4 }),
  weeklyAverageScore90Days: decimal("weekly_average_score_90_days", { precision: 5, scale: 4 }),
  callOffRate30Days: decimal("call_off_rate_30_days", { precision: 5, scale: 4 }),
  callOffRate90Days: decimal("call_off_rate_90_days", { precision: 5, scale: 4 }),
  reliabilityTrend: varchar("reliability_trend"), // 'improving', 'stable', 'declining'
  
  // Day-of-week reliability patterns (0.00-1.00 for each day)
  sundayReliability: decimal("sunday_reliability", { precision: 5, scale: 4 }),
  mondayReliability: decimal("monday_reliability", { precision: 5, scale: 4 }),
  tuesdayReliability: decimal("tuesday_reliability", { precision: 5, scale: 4 }),
  wednesdayReliability: decimal("wednesday_reliability", { precision: 5, scale: 4 }),
  thursdayReliability: decimal("thursday_reliability", { precision: 5, scale: 4 }),
  fridayReliability: decimal("friday_reliability", { precision: 5, scale: 4 }),
  saturdayReliability: decimal("saturday_reliability", { precision: 5, scale: 4 }),
  
  // Licensing & Certifications (quick reference)
  activeLicenses: text("active_licenses").array().default(sql`ARRAY[]::text[]`),
  expiringLicenses: jsonb("expiring_licenses"), // {license: string, expiresAt: date}[]
  
  // Pool membership
  isInOrgPool: boolean("is_in_org_pool").default(true),
  isInGlobalPool: boolean("is_in_global_pool").default(false),
  globalPoolCategories: text("global_pool_categories").array().default(sql`ARRAY[]::text[]`),
  
  // Last activity timestamps
  lastShiftAssigned: timestamp("last_shift_assigned"),
  lastShiftCompleted: timestamp("last_shift_completed"),
  lastScoreUpdate: timestamp("last_score_update"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  tardinessCount: integer("tardiness_count").default(0),
  lastMinuteCancellations: integer("last_minute_cancellations").default(0),
  attendanceRate: decimal("attendance_rate"),
  yearsExperience: decimal("years_experience"),
  recentPerformanceTrend: varchar("recent_performance_trend"),
}, (table) => [
  index("coaileague_profiles_workspace_idx").on(table.workspaceId),
  index("coaileague_profiles_employee_idx").on(table.employeeId),
  index("coaileague_profiles_overall_score_idx").on(table.overallScore),
  index("coaileague_profiles_reliability_idx").on(table.reliabilityScore),
  index("coaileague_profiles_org_pool_idx").on(table.isInOrgPool),
  index("coaileague_profiles_global_pool_idx").on(table.isInGlobalPool),
]);

export const employeeEventLog = pgTable("employee_event_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  profileId: varchar("profile_id"),
  
  // Event details
  eventType: scoringEventTypeEnum("event_type").notNull(),
  eventSource: varchar("event_source").notNull(), // 'time_tracking', 'shift_management', 'client_feedback', 'admin', 'system'
  
  // Points impact
  pointsChange: integer("points_change").default(0),
  pointsType: varchar("points_type"), // 'good', 'negative'
  
  // Score impact (before/after)
  previousOverallScore: decimal("previous_overall_score", { precision: 5, scale: 4 }),
  newOverallScore: decimal("new_overall_score", { precision: 5, scale: 4 }),
  previousReliabilityScore: decimal("previous_reliability_score", { precision: 5, scale: 4 }),
  newReliabilityScore: decimal("new_reliability_score", { precision: 5, scale: 4 }),
  
  // Reference to triggering entity
  referenceId: varchar("reference_id"), // shift_id, time_entry_id, feedback_id
  referenceType: varchar("reference_type"), // 'shift', 'time_entry', 'feedback', 'certification'
  
  // Context
  metadata: jsonb("metadata"), // Additional context (e.g., minutes late, client comments)
  triggeredBy: varchar("triggered_by"), // User who triggered (if manual)
  isAutomatic: boolean("is_automatic").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("event_log_workspace_idx").on(table.workspaceId),
  index("event_log_employee_idx").on(table.employeeId),
  index("event_log_type_idx").on(table.eventType),
  index("event_log_created_idx").on(table.createdAt),
  index("event_log_reference_idx").on(table.referenceType, table.referenceId),
]);

export const employeeScoreSnapshots = pgTable("employee_score_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  profileId: varchar("profile_id"),

  periodType: varchar("period_type").notNull(), // 'weekly', 'monthly', 'quarterly'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  overallScore: decimal("overall_score", { precision: 5, scale: 4 }),
  reliabilityScore: decimal("reliability_score", { precision: 5, scale: 4 }),
  skillMatchScore: decimal("skill_match_score", { precision: 5, scale: 4 }),
  distanceScore: decimal("distance_score", { precision: 5, scale: 4 }),
  personalityLikenessScore: decimal("personality_likeness_score", { precision: 5, scale: 4 }),

  shiftsAssigned: integer("shifts_assigned").default(0),
  shiftsCompleted: integer("shifts_completed").default(0),
  shiftsNoShow: integer("shifts_no_show").default(0),
  shiftsCallOff: integer("shifts_call_off").default(0),
  pointsEarned: integer("points_earned").default(0),
  pointsLost: integer("points_lost").default(0),
  reliabilityPercentage: varchar("reliability_percentage"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("score_snapshots_workspace_idx").on(table.workspaceId),
  index("score_snapshots_employee_idx").on(table.employeeId),
  index("score_snapshots_period_idx").on(table.periodType, table.periodStart),
]);

export const aiDecisionAudit = pgTable("ai_decision_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  decisionType: varchar("decision_type").notNull(), // 'ASSIGN_GUARD', 'FILL_SHIFT', 'SWAP_APPROVE', etc.
  selectedEmployeeId: varchar("selected_employee_id"),
  shiftId: varchar("shift_id"),
  reasoning: text("reasoning"),
  score: decimal("score", { precision: 5, scale: 4 }),
  alternativesConsidered: integer("alternatives_considered").default(0),
  metadata: jsonb("metadata"),
  triggeredBy: varchar("triggered_by"), // 'trinity', 'scheduler', 'manual'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_decision_audit_workspace_idx").on(table.workspaceId),
  index("ai_decision_audit_type_idx").on(table.decisionType),
  index("ai_decision_audit_employee_idx").on(table.selectedEmployeeId),
  index("ai_decision_audit_created_idx").on(table.createdAt),
]);

export const personalityTagsCatalog = pgTable("personality_tags_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  tagName: varchar("tag_name").notNull(), // e.g., 'energetic', 'calm', 'detail-oriented'
  tagCategory: personalityTagCategoryEnum("tag_category").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("personality_tags_workspace_idx").on(table.workspaceId),
  index("personality_tags_category_idx").on(table.tagCategory),
]);

export const userFeedback = pgTable("user_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull(),
  
  type: feedbackTypeEnum("type").notNull().default('general'),
  priority: feedbackPriorityEnum("priority").notNull().default('medium'),
  status: feedbackStatusEnum("status").notNull().default('new'),
  
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  
  upvoteCount: integer("upvote_count").default(0),
  downvoteCount: integer("downvote_count").default(0),
  commentCount: integer("comment_count").default(0),
  
  statusUpdatedBy: varchar("status_updated_by"),
  statusUpdatedAt: timestamp("status_updated_at"),
  statusNote: text("status_note"),
  
  adminResponse: text("admin_response"),
  adminRespondedBy: varchar("admin_responded_by"),
  adminRespondedAt: timestamp("admin_responded_at"),
  
  isPublic: boolean("is_public").default(true),
  isPinned: boolean("is_pinned").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_feedback_workspace_idx").on(table.workspaceId),
  index("user_feedback_user_idx").on(table.userId),
  index("user_feedback_type_idx").on(table.type),
  index("user_feedback_status_idx").on(table.status),
  index("user_feedback_priority_idx").on(table.priority),
  index("user_feedback_created_idx").on(table.createdAt),
  index("user_feedback_upvote_idx").on(table.upvoteCount),
]);

export const feedbackComments = pgTable("feedback_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feedbackId: varchar("feedback_id").notNull(),
  userId: varchar("user_id").notNull(),
  parentId: varchar("parent_id").references((): any => feedbackComments.id, { onDelete: 'cascade' }),
  
  content: text("content").notNull(),
  isFromAdmin: boolean("is_from_admin").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  voteData: jsonb("vote_data").default('{}'),
}, (table) => [
  index("feedback_comments_feedback_idx").on(table.feedbackId),
  index("feedback_comments_user_idx").on(table.userId),
  index("feedback_comments_parent_idx").on(table.parentId),
  index("feedback_comments_created_idx").on(table.createdAt),
]);

export const feedbackVotes = pgTable("feedback_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  feedbackId: varchar("feedback_id").notNull(),
  userId: varchar("user_id").notNull(),
  
  voteType: varchar("vote_type").notNull(), // 'up' or 'down'
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("feedback_votes_feedback_idx").on(table.feedbackId),
  index("feedback_votes_user_idx").on(table.userId),
  uniqueIndex("feedback_votes_unique").on(table.feedbackId, table.userId),
]);

export const flexContractors = pgTable("flex_contractors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  certifications: jsonb("certifications").default(sql`'[]'::jsonb`), // ['armed', 'cpr', 'first_aid']
  bio: text("bio"),
  
  ratingAverage: decimal("rating_average", { precision: 3, scale: 2 }).default("0.00"),
  totalGigsCompleted: integer("total_gigs_completed").default(0),
  totalRatings: integer("total_ratings").default(0),
  
  isPreferred: boolean("is_preferred").default(false),
  isActive: boolean("is_active").default(true),
  
  inviteToken: varchar("invite_token"),
  invitedAt: timestamp("invited_at"),
  acceptedAt: timestamp("accepted_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("flex_contractors_user_idx").on(table.userId),
  index("flex_contractors_workspace_idx").on(table.workspaceId),
  index("flex_contractors_active_idx").on(table.isActive),
  index("flex_contractors_rating_idx").on(table.ratingAverage),
  uniqueIndex("flex_contractors_user_workspace_idx").on(table.userId, table.workspaceId),
]);

export const flexAvailability = pgTable("flex_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull(),
  
  availableDate: date("available_date").notNull(),
  availableStartTime: time("available_start_time"),
  availableEndTime: time("available_end_time"),
  isAllDay: boolean("is_all_day").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("flex_availability_contractor_idx").on(table.contractorId),
  index("flex_availability_date_idx").on(table.availableDate),
]);

export const flexGigs = pgTable("flex_gigs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  createdBy: varchar("created_by"),
  
  title: varchar("title").notNull(),
  description: text("description"),
  
  gigDate: date("gig_date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  
  locationName: varchar("location_name"),
  locationAddress: text("location_address"),
  
  requirements: jsonb("requirements").default(sql`'[]'::jsonb`), // ['armed', 'cpr']
  payRate: decimal("pay_rate", { precision: 10, scale: 2 }).notNull(),
  
  status: varchar("status", { length: 30 }).default("open"), // 'open', 'assigned', 'in_progress', 'completed', 'cancelled'
  
  assignedContractorId: varchar("assigned_contractor_id"),
  assignedAt: timestamp("assigned_at"),
  completedAt: timestamp("completed_at"),
  
  notifyAll: boolean("notify_all").default(true),
  applicationsCount: integer("applications_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // TRINITY.md Section R / Law P1 — soft delete (gig history retained)
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
}, (table) => [
  index("flex_gigs_workspace_idx").on(table.workspaceId),
  index("flex_gigs_status_idx").on(table.status),
  index("flex_gigs_date_idx").on(table.gigDate),
  index("flex_gigs_assigned_idx").on(table.assignedContractorId),
]);

export const flexGigApplications = pgTable("flex_gig_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gigId: varchar("gig_id").notNull(),
  contractorId: varchar("contractor_id").notNull(),
  
  message: text("message"),
  status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'accepted', 'rejected'
  
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by"),

  workspaceId: varchar("workspace_id"),

  rating: integer("rating"),
  ratingComment: text("rating_comment"),
  ratedAt: timestamp("rated_at", { withTimezone: true }),
  appType: varchar("app_type"),
}, (table) => [
  index("flex_gig_apps_gig_idx").on(table.gigId),
  index("flex_gig_apps_contractor_idx").on(table.contractorId),
  index("flex_gig_apps_status_idx").on(table.status),
  uniqueIndex("flex_gig_apps_unique_idx").on(table.gigId, table.contractorId),
]);

export const flexGigRatings = pgTable("flex_gig_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gigId: varchar("gig_id").notNull(),
  contractorId: varchar("contractor_id").notNull(),
  
  ratedByWorkspace: boolean("rated_by_workspace").default(false), // Org rating contractor
  ratedByContractor: boolean("rated_by_contractor").default(false), // Contractor rating org
  
  // Org's rating of contractor
  contractorRating: integer("contractor_rating"), // 1-5
  contractorComment: text("contractor_comment"),
  
  // Contractor's rating of org
  workspaceRating: integer("workspace_rating"), // 1-5
  workspaceComment: text("workspace_comment"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("flex_gig_ratings_gig_idx").on(table.gigId),
  index("flex_gig_ratings_contractor_idx").on(table.contractorId),
  uniqueIndex("flex_gig_ratings_unique_idx").on(table.gigId, table.contractorId),
]);

export const knownContractors = pgTable("known_contractors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Contractor info
  companyName: varchar("company_name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 150 }),
  email: varchar("email", { length: 255 }).notNull(),
  emailDomain: varchar("email_domain", { length: 100 }),
  phone: varchar("phone", { length: 30 }),
  
  // Preferences
  preferredResponseFormat: varchar("preferred_response_format", { length: 50 }).default('email'),
  autoStaffingEnabled: boolean("auto_staffing_enabled").default(false),
  defaultPayRate: decimal("default_pay_rate", { precision: 8, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }), // Agreed hourly rate for this contractor
  overtimeRate: decimal("overtime_rate", { precision: 8, scale: 2 }), // OT rate (1.5x typical)
  doubletimeRate: decimal("doubletime_rate", { precision: 8, scale: 2 }), // DT rate (2x typical)
  typicalRequirements: jsonb("typical_requirements").$type<string[]>().default(sql`'[]'::jsonb`),

  // QuickBooks Integration (1099 contractors = Vendors, paid via A/P Bills not Payroll)
  quickbooksVendorId: varchar("quickbooks_vendor_id", { length: 50 }),
  quickbooksVendorSyncStatus: varchar("quickbooks_vendor_sync_status", { length: 20 }).default("pending"),
  quickbooksLastSyncAt: timestamp("quickbooks_last_sync_at"),
  
  // History
  totalShiftsReceived: integer("total_shifts_received").default(0),
  totalShiftsFilled: integer("total_shifts_filled").default(0),
  avgResponseTimeMinutes: integer("avg_response_time_minutes"),
  
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("known_contractors_workspace_idx").on(table.workspaceId),
  index("known_contractors_email_idx").on(table.email),
  index("known_contractors_domain_idx").on(table.emailDomain),
]);

export const employeeInvitations = pgTable("employee_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"), // Optional: can be set if inviting for existing employee re-onboarding
  
  email: varchar("email").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role"),
  
  inviteToken: varchar("invite_token").notNull().unique(),
  inviteStatus: text("invite_status").default("sent").notNull(),
  
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  openedAt: timestamp("opened_at"),
  acceptedAt: timestamp("accepted_at"),
  
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"), // Optional link to user account

  // ============================================================================
  // UNIVERSAL IDENTIFICATION SYSTEM — Phase 57
  // Format: EMP-[ORG_SHORT]-[NNNNN]  e.g. EMP-ACM-00034
  // ============================================================================
  clockinPinHash: varchar("clockin_pin_hash"), // bcrypt hash of 6-digit voice clock-in PIN

  // Employee information
  employeeNumber: varchar("employee_number"), // EMP-ORG-NNNNN — canonical human-readable ID
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  personalForwardEmail: varchar("personal_forward_email"),

  // Contact information (editable by employee)
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  dateOfBirth: date("date_of_birth"),
  placeOfBirth: varchar("place_of_birth"),

  // Emergency contact (editable by employee)
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  emergencyContactRelation: varchar("emergency_contact_relation"),

  // Employment details
  role: varchar("role"), // e.g., "Technician", "Consultant", "Driver" - job title
  position: varchar("position"), // Canonical position ID from positionRegistry (e.g., 'sergeant', 'patrol_armed')
  organizationalTitle: varchar("organizational_title").default("staff"), // Hierarchy: staff, supervisor, manager, director, owner
  workspaceRole: workspaceRoleEnum("workspace_role").default("staff"), // Permission level (formerly 'employee')
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  overtimeRate: decimal("overtime_rate", { precision: 10, scale: 2 }),
  doubletimeRate: decimal("doubletime_rate", { precision: 5, scale: 2 }),
  
  // QuickBooks Integration - External ID for payment routing
  quickbooksEmployeeId: varchar("quickbooks_employee_id"), // External QB employee ID for payroll sync
  quickbooksSyncStatus: varchar("quickbooks_sync_status").default("pending"), // pending, synced, error, orphaned
  quickbooksLastSync: timestamp("quickbooks_last_sync"), // Last successful sync timestamp
  quickbooksRealmId: varchar("quickbooks_realm_id"), // QB company realmId - scopes IDs per environment (sandbox vs production)
  
  // Payroll Information
  payType: varchar("pay_type").default("hourly"), // hourly, salary, commission, contractor
  workerType: varchar("worker_type").default("employee"), // employee, contractor - determines W2 vs 1099 tax treatment
  quickbooksVendorId: varchar("quickbooks_vendor_id"), // External QB vendor ID for 1099 contractor sync
  taxIdLastFour: varchar("tax_id_last_four"), // Last 4 of SSN/EIN for verification
  businessName: varchar("business_name"), // Contractor DBA or business name
  is1099Eligible: boolean("is_1099_eligible").default(false), // Whether contractor receives 1099
  payAmount: decimal("pay_amount", { precision: 12, scale: 2 }), // Salary or base amount if not hourly
  payFrequency: varchar("pay_frequency").default("biweekly"), // weekly, biweekly, semimonthly, monthly
  
  // Employment Dates
  hireDate: timestamp("hire_date"), // Employment start date
  terminationDate: timestamp("termination_date"), // Employment end date (null if active)
  
  // Address for Trinity Auto-Scheduling (driving distance calculations)
  addressLine2: varchar("address_line_2"),
  country: varchar("country").default("US"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }), // Home GPS latitude for driving distance
  longitude: decimal("longitude", { precision: 10, scale: 7 }), // Home GPS longitude for driving distance
  color: varchar("color").default("#3b82f6"), // For calendar display

  // Onboarding status
  onboardingStatus: varchar("onboarding_status").default("not_started"), // not_started, in_progress, completed

  // Employee status — canonical lifecycle field
  // active | terminated | suspended | on_leave | pending
  status: varchar("status").default("active").notNull(),

  // Availability
  isActive: boolean("is_active").default(true),
  availabilityNotes: text("availability_notes"),

  // Deactivation tracking
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by"),
  deactivationReason: text("deactivation_reason"),
  reactivatedAt: timestamp("reactivated_at"),
  reactivatedBy: varchar("reactivated_by"),
  requiresFullReonboarding: boolean("requires_full_reonboarding").default(false),

  // Premium Schedule Features (Phase 1 MVP)
  performanceScore: integer("performance_score").default(85), // 0-100 percentage
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"), // 0.0-5.0 star rating
  availabilityPercentage: integer("availability_percentage").default(90), // 0-100 percentage
  overtimeHoursThisWeek: decimal("overtime_hours_this_week", { precision: 5, scale: 2 }).default("0.00"),

  // ──────────────────────────────────────────────────────────────────────────
  // TRINITY SCHEDULING INTELLIGENCE — Security Industry Variables
  // These fields power Trinity's officer scoring, matching, and dispatch engine.
  // ──────────────────────────────────────────────────────────────────────────

  // Armed/Unarmed Status (denormalized from employeeComplianceRecords for fast query)
  // Source of truth: employeeComplianceRecords.isArmed — sync on compliance update
  isArmed: boolean("is_armed").default(false), // Can carry a firearm; must have valid armed license
  armedLicenseVerified: boolean("armed_license_verified").default(false), // Mgmt-verified armed license
  guardCardVerified: boolean("guard_card_verified").default(false), // Mgmt-verified guard card/PSB license

  // Travel Range (officer max willingness to travel to a site)
  // Trinity will NOT assign this officer beyond this radius without override
  travelRadiusMiles: integer("travel_radius_miles").default(25),

  // Trinity Scheduling Score (0-100 composite)
  // Auto-maintained by Trinity on shift completion. Inputs: performance, reliability, incidents, tenure.
  // Clients can set minOfficerSchedulingScore; Trinity filters out officers below threshold.
  schedulingScore: integer("scheduling_score").default(75),

  // Availability Mode — how Trinity treats this officer when auto-scheduling
  // 'always_available'  : no availability restrictions, schedule freely
  // 'schedule_based'    : respect employeeAvailability table blocks
  // 'on_call'           : only assign if they confirm; do not assume
  // 'unavailable'       : do not auto-schedule (leave, suspended, etc.)
  availabilityMode: varchar("availability_mode").default("always_available"),

  // View Mode Preference (per-employee override for this workspace)
  viewModePreference: varchar("view_mode_preference").default("inherit"), // 'inherit' | 'simple' | 'pro'
  viewModeUpdatedAt: timestamp("view_mode_updated_at"), // When preference was last changed

  // Platform Pool Participation
  platformPoolOptedIn: boolean("platform_pool_opted_in").default(false),
  platformPoolAvailability: boolean("platform_pool_availability").default(false),

  // Operational metrics
  clockinIssueCount: integer("clockin_issue_count").default(0),

  // Offboarding tracking
  offboardingData: jsonb("offboarding_data"),

  // Optimistic locking version for concurrent edit protection
  version: integer("version").default(1).notNull(),

  // ─── PASS 1 AUDIT — Employee Onboarding Document Completeness ─────────────

  // Full legal name (as it appears on government-issued ID — may differ from firstName + lastName)
  fullLegalName: varchar("full_legal_name"),

  // Guard card / PSB license fields (security-specific credential)
  guardCardNumber: varchar("guard_card_number"),
  guardCardIssueDate: date("guard_card_issue_date"),
  guardCardExpiryDate: date("guard_card_expiry_date"),

  // ─── Guard Card Compliance Tier System (Texas DPS / OC §1702.230) ─────────
  // Five-tier system that drives clock-in enforcement.
  guardCardStatus: guardCardStatusEnum("guard_card_status").default('expired_hard_block'),
  // Tier 3 only — +14 days from application submission. Hard-blocks on expiry.
  workAuthorizationWindowExpires: timestamp("work_authorization_window_expires"),
  // Trinity vision verification state for uploaded TOPS screenshots
  topsVerificationStatus: topsVerificationStatusEnum("tops_verification_status"),
  topsVerificationDate: timestamp("tops_verification_date"),
  topsVerificationNotes: text("tops_verification_notes"),
  // Background check record of conduct — required for Tier 3 provisional work
  backgroundCheckDate: timestamp("background_check_date"),
  backgroundCheckType: varchar("background_check_type"),       // 'dps_criminal' | 'commercial'
  backgroundCheckProvider: varchar("background_check_provider"),
  sexOffenderRegistryChecked: boolean("sex_offender_registry_checked").default(false),
  sexOffenderRegistryCheckDate: timestamp("sex_offender_registry_check_date"),
  noAdverseActionConfirmed: boolean("no_adverse_action_confirmed").default(false),
  noAdverseActionConfirmedDate: timestamp("no_adverse_action_confirmed_date"),
  noAdverseActionConfirmedBy: varchar("no_adverse_action_confirmed_by"),

  // Security license classification
  licenseType: varchar("license_type"), // 'level2_unarmed' | 'level3_armed' | 'level4_ppo'

  // Identity document upload URLs (object storage)
  stateIdFrontUrl: text("state_id_front_url"),
  stateIdBackUrl: text("state_id_back_url"),
  socialSecurityCardFrontUrl: text("social_security_card_front_url"),

  // SSN storage — hashed (bcrypt) + last 4 digits only (PII minimization)
  ssnHash: varchar("ssn_hash"),
  ssnLast4: varchar("ssn_last4", { length: 4 }),

  // Compliance pay classification — drives W-4 vs W-9 routing in onboarding wizard
  // Separate from payType ('hourly'/'salary') which is payroll-side
  compliancePayType: varchar("compliance_pay_type"), // 'w2' | '1099'

  // Compiled onboarding packet PDF (generated after all documents are signed)
  onboardingPacketPdfUrl: text("onboarding_packet_pdf_url"),

  // Post orders acknowledgment — gates clock-in at client sites
  postOrdersAcknowledgedAt: timestamp("post_orders_acknowledged_at"),
  postOrdersAcknowledgedForClientId: varchar("post_orders_acknowledged_for_client_id"),

  // Officer Training Compliance Score (0-100)
  // Reduced by: missing/overdue training, unsigned docs, unacknowledged post orders, intervention flags, expired certs
  // Recovered by: completing training, signing docs, acknowledging post orders, resolving interventions
  complianceScore: integer("compliance_score").default(100),
  complianceScoreUpdatedAt: timestamp("compliance_score_updated_at"),
  trainingCompletionPercentage: integer("training_completion_percentage").default(0),

  // Preferred display language (drives UI locale and document language selection)
  preferredLanguage: varchar("preferred_language").notNull().default("en"),

  // Performance summary data (json blob — populated by Trinity performance review agent)
  performanceSummary: jsonb("performance_summary"),

  // Timestamp when all onboarding steps were completed
  onboardingCompletedAt: timestamp("onboarding_completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employees_workspace_idx").on(table.workspaceId),
  index("employees_workspace_active_idx").on(table.workspaceId, table.isActive),
  index("employees_user_idx").on(table.userId),
  index("employees_email_idx").on(table.email),
  index("employees_status_idx").on(table.status),
  index("employees_active_idx").on(table.isActive),
]);


// ─── Recovered unmapped tables ─────────────────────────────────────────────

export const trainingScenarios = pgTable("training_scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  name: varchar("name").notNull(),
  description: text("description"),
  difficulty: trainingDifficultyEnum("difficulty").notNull(),
  
  // Scenario configuration
  totalShifts: integer("total_shifts").notNull().default(50),
  constraintComplexity: integer("constraint_complexity").default(1), // 1-10 scale
  employeeVariety: integer("employee_variety").default(5), // Number of varied employee types
  clientVariety: integer("client_variety").default(3), // Number of varied client types
  
  // Constraint toggles
  hasAvailabilityConflicts: boolean("has_availability_conflicts").default(false),
  hasCertificationRequirements: boolean("has_certification_requirements").default(false),
  hasClientPreferences: boolean("has_client_preferences").default(false),
  hasClientExclusions: boolean("has_client_exclusions").default(false),
  hasTravelPayConstraints: boolean("has_travel_pay_constraints").default(false),
  hasOvertimeRisks: boolean("has_overtime_risks").default(false),
  hasLowScoreEmployees: boolean("has_low_score_employees").default(false),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trainingRuns = pgTable("training_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  scenarioId: varchar("scenario_id"),
  
  difficulty: trainingDifficultyEnum("difficulty").notNull(),
  status: varchar("status").default("pending"), // pending, running, completed, failed
  
  // Metrics
  totalShifts: integer("total_shifts").default(0),
  assignedShifts: integer("assigned_shifts").default(0),
  failedShifts: integer("failed_shifts").default(0),
  averageConfidence: decimal("average_confidence", { precision: 5, scale: 4 }),
  totalCreditsUsed: decimal("total_credits_used", { precision: 10, scale: 2 }),
  
  // Trinity metacognition tracking
  confidenceStart: decimal("confidence_start", { precision: 5, scale: 4 }),
  confidenceEnd: decimal("confidence_end", { precision: 5, scale: 4 }),
  confidenceDelta: decimal("confidence_delta", { precision: 5, scale: 4 }),
  thoughtLog: jsonb("thought_log").$type<string[]>(), // Trinity's reasoning steps
  lessonsLearned: jsonb("lessons_learned").$type<string[]>(), // What Trinity learned
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trainingCourses = pgTable("training_courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Course details
  title: varchar("title").notNull(),
  description: text("description"),
  category: varchar("category"), // 'compliance', 'technical', 'leadership', 'soft_skills', 'safety'

  // Content
  courseType: varchar("course_type").notNull(), // 'online', 'in_person', 'hybrid', 'self_paced'
  duration: integer("duration"), // Minutes
  contentUrl: varchar("content_url"), // Link to course materials
  videoUrl: varchar("video_url"),

  // Requirements
  isRequired: boolean("is_required").default(false),
  expiresAfterDays: integer("expires_after_days"), // Requires renewal (e.g., 365 for annual training)
  passingScore: integer("passing_score"), // Minimum % to pass

  // Access
  requiresApproval: boolean("requires_approval").default(false),
  maxEnrollments: integer("max_enrollments"),

  // Instructor
  instructorId: varchar("instructor_id"),
  instructorName: varchar("instructor_name"),

  // Status
  isActive: boolean("is_active").default(true),
  publishedAt: timestamp("published_at"),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  durationHours: decimal("duration_hours"),
  content: jsonb("content"),
  scenarioData: jsonb("scenario_data").default('{}'),
});

export const trainingEnrollments = pgTable("training_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id"),

  // Enrollment details
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  enrolledBy: varchar("enrolled_by"), // Manager or self

  // Progress
  status: varchar("status").default('enrolled'), // 'enrolled', 'in_progress', 'completed', 'failed', 'expired'
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),

  // Assessment
  assessmentScore: integer("assessment_score"), // Percentage
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),

  // Certification
  certificateUrl: varchar("certificate_url"),
  certificateIssuedAt: timestamp("certificate_issued_at"),

  // Feedback
  rating: integer("rating"), // 1-5 stars
  feedback: text("feedback"),

  updatedAt: timestamp("updated_at").defaultNow(),

  progressPercentage: integer("progress_percentage").default(0),
  score: decimal("score"),
  enrollmentType: varchar("enrollment_type"),
  attemptData: jsonb("attempt_data").default('{}'),
  certificationData: jsonb("certification_data").default('{}'),
}, (table) => ({
  employeeIdx: index("training_enrollments_employee_idx").on(table.employeeId),
  statusIdx: index("training_enrollments_status_idx").on(table.status),
  expiresIdx: index("training_enrollments_expires_idx").on(table.expiresAt),
  workspaceIdx: index("training_enrollments_workspace_idx").on(table.workspaceId),
}));

export const engagementScoreHistory = pgTable(
  "engagement_score_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull(),
    
    // Score data
    overallScore: decimal("overall_score", { precision: 5, scale: 2 }).notNull(), // 0-100
    participationRate: decimal("participation_rate", { precision: 5, scale: 2 }),
    responseCount: integer("response_count").default(0),
    
    // Breakdown by category
    categoryScores: jsonb("category_scores"), // { satisfaction: 75, culture: 80, growth: 70 }
    
    // Benchmarking
    industryPercentile: integer("industry_percentile"), // 0-100
    companySize: varchar("company_size"), // 'small', 'medium', 'large', 'enterprise'
    industry: varchar("industry"),
    
    // Period tracking
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    periodType: varchar("period_type").notNull(), // 'weekly', 'monthly', 'quarterly', 'annual'
    
    // Trend vs previous period
    previousScore: decimal("previous_score", { precision: 5, scale: 2 }),
    scoreDelta: decimal("score_delta", { precision: 5, scale: 2 }),
    
    createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("engagement_score_history_workspace_idx").on(table.workspaceId),
    index("engagement_score_history_period_idx").on(table.periodStart),
    index("engagement_score_history_type_idx").on(table.periodType),
  ]
);

export const employeeRecognition = pgTable("employee_recognition", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  recognizedEmployeeId: varchar("recognized_employee_id").notNull(),
  recognizedByEmployeeId: varchar("recognized_by_employee_id"),
  recognizedByManagerId: varchar("recognized_by_manager_id"),
  reason: text("reason").notNull(),
  category: varchar("category"),
  relatedShiftId: varchar("related_shift_id"),
  relatedClientId: varchar("related_client_id"),
  relatedReportId: varchar("related_report_id"),
  isPublic: boolean("is_public").default(true),
  hasMonetaryReward: boolean("has_monetary_reward").default(false),
  rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }),
  rewardType: varchar("reward_type"),
  rewardPaid: boolean("reward_paid").default(false),
  rewardPaidAt: timestamp("reward_paid_at"),
  rewardTransactionId: varchar("reward_transaction_id"),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employee_recognition_workspace_idx").on(table.workspaceId),
  index("employee_recognition_employee_idx").on(table.recognizedEmployeeId),
]);

// ── employee_behavior_scores ─────────────────────────────────────────────
export const employeeBehaviorScores = pgTable("employee_behavior_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().unique(),
  workspaceId: varchar("workspace_id").notNull(),
  reliabilityScore: decimal("reliability_score", { precision: 5, scale: 4 }).default('0.5'),
  onTimeArrivalRate: decimal("on_time_arrival_rate", { precision: 5, scale: 4 }).default('1.0'),
  shiftCompletionRate: decimal("shift_completion_rate", { precision: 5, scale: 4 }).default('1.0'),
  noShowRate: decimal("no_show_rate", { precision: 5, scale: 4 }).default('0.0'),
  offerAcceptanceRate: decimal("offer_acceptance_rate", { precision: 5, scale: 4 }).default('0.5'),
  avgResponseTimeMinutes: integer("avg_response_time_minutes").default(60),
  extraShiftWillingness: decimal("extra_shift_willingness", { precision: 5, scale: 4 }).default('0.5'),
  clientSatisfactionScore: decimal("client_satisfaction_score", { precision: 5, scale: 4 }).default('0.8'),
  supervisorRating: decimal("supervisor_rating", { precision: 5, scale: 4 }).default('0.8'),
  incidentRate: decimal("incident_rate", { precision: 5, scale: 4 }).default('0.0'),
  preferredShiftTypes: jsonb("preferred_shift_types").$type<string[]>().default(sql`'[]'::jsonb`),
  preferredLocations: jsonb("preferred_locations").$type<string[]>().default(sql`'[]'::jsonb`),
  preferredDaysOfWeek: jsonb("preferred_days_of_week").$type<number[]>().default(sql`'[]'::jsonb`),
  preferredTimeRanges: jsonb("preferred_time_ranges").$type<{start: string; end: string}[]>().default(sql`'[]'::jsonb`),
  totalOffersReceived: integer("total_offers_received").default(0),
  totalOffersAccepted: integer("total_offers_accepted").default(0),
  totalShiftsCompleted: integer("total_shifts_completed").default(0),
  totalHoursWorked: decimal("total_hours_worked", { precision: 10, scale: 2 }).default('0'),
  lastModelUpdate: timestamp("last_model_update"),
  dataPointsCount: integer("data_points_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertEmployeeBehaviorScoreSchema = createInsertSchema(employeeBehaviorScores).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployeeBehaviorScore = z.infer<typeof insertEmployeeBehaviorScoreSchema>;
export type EmployeeBehaviorScore = typeof employeeBehaviorScores.$inferSelect;

// ── employee_certifications ────────────────────────────────────────────────
// Tracks employee certifications (armed guard license, CPR, First Aid, etc.)
// Required for certification-gating shifts and compliance validation.
export const employeeCertifications = pgTable("employee_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  certificationType: varchar("certification_type", { length: 100 }).notNull(),
  certificationName: varchar("certification_name", { length: 255 }).notNull(),
  certificationNumber: varchar("certification_number", { length: 100 }),
  issuingAuthority: varchar("issuing_authority", { length: 255 }),
  issuedDate: timestamp("issued_date"),
  expirationDate: timestamp("expiration_date"),
  status: varchar("status", { length: 30 }).notNull().default('active'),
  isRequired: boolean("is_required").default(false),
  documentId: varchar("document_id"),
  archivedAt: timestamp("archived_at"),
  supersededById: varchar("superseded_by_id"),
  archivedById: varchar("archived_by_id"),
  renewalNotes: text("renewal_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("emp_certs_workspace_idx").on(table.workspaceId),
  index("emp_certs_employee_idx").on(table.employeeId),
  index("emp_certs_type_idx").on(table.certificationType),
  index("emp_certs_expiry_idx").on(table.expirationDate),
  index("emp_certs_status_idx").on(table.status),
  index("emp_certs_archived_idx").on(table.archivedAt),
]);
const VALID_CERT_TYPES = [
  'tcole_basic_peace_officer', 'tcole_intermediate', 'tcole_advanced', 'tcole_master',
  'dps_guard_card', 'armed_security', 'ppb_unarmed', 'ppb_armed',
  'level_iv_ppo', 'crowd_manager', 'fire_life_safety',
  'handcuff', 'baton', 'chemical_agent', 'other',
] as const;

const VALID_CERT_STATUSES = ['active', 'expired', 'suspended', 'pending_renewal', 'revoked'] as const;

export const insertEmployeeCertificationSchema = createInsertSchema(employeeCertifications)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    certificationType: z.enum(VALID_CERT_TYPES),
    status: z.enum(VALID_CERT_STATUSES).optional().default('active'),
  });
export type InsertEmployeeCertification = z.infer<typeof insertEmployeeCertificationSchema>;
export type EmployeeCertification = typeof employeeCertifications.$inferSelect;

// ── hr_document_requests ───────────────────────────────────────────────────
// Tracks HR document requests sent to employees (I9, W4, W9, drug testing,
// drug-free workplace acknowledgment, guard card update, full onboarding).
// Supports mass-send, per-employee targeting, and Trinity autonomous sends.
export const hrDocumentRequests = pgTable("hr_document_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  sentByUserId: varchar("sent_by_user_id").notNull(),
  sentByName: varchar("sent_by_name").notNull(),
  employeeId: varchar("employee_id").notNull(),
  employeeName: varchar("employee_name").notNull(),
  employeeEmail: varchar("employee_email").notNull(),
  documentType: varchar("document_type").notNull(),
  status: varchar("status").notNull().default("sent"),
  notes: text("notes"),
  creditsCharged: integer("credits_charged").notNull().default(0),
  sentVia: varchar("sent_via").notNull().default("email"),
  uploadLink: varchar("upload_link"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  openedAt: timestamp("opened_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("hr_doc_req_workspace_idx").on(table.workspaceId),
  index("hr_doc_req_employee_idx").on(table.employeeId),
  index("hr_doc_req_status_idx").on(table.status),
]);
export const insertHrDocumentRequestSchema = createInsertSchema(hrDocumentRequests).omit({
  id: true, sentAt: true, openedAt: true, completedAt: true,
});
export type InsertHrDocumentRequest = z.infer<typeof insertHrDocumentRequestSchema>;
export type HrDocumentRequest = typeof hrDocumentRequests.$inferSelect;

// ─── Regulatory Compliance Enrollment ──────────────────────────────────────
// Tracks per-user/per-employee operator credential submission for state
// regulatory compliance. All users in an org (including owners) must submit
// a valid credential (guard card, manager card, or representative card) within
// 30 days of workspace creation / subscription activation.
export const complianceEnrollments = pgTable("compliance_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  userId: varchar("user_id"),
  credentialType: operatorCredentialTypeEnum("credential_type"),
  documentId: varchar("document_id"),
  fileUrl: varchar("file_url"),
  cardNumber: varchar("card_number"),
  issuingState: varchar("issuing_state").default("TX"),
  issuingAgency: varchar("issuing_agency").default("TX DPS"),
  expirationDate: timestamp("expiration_date"),
  status: complianceEnrollmentStatusEnum("status").notNull().default("pending"),
  deadline: timestamp("deadline").notNull(),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ce_workspace_idx").on(table.workspaceId),
  index("ce_employee_idx").on(table.employeeId),
  index("ce_status_idx").on(table.status),
  uniqueIndex("ce_workspace_employee_idx").on(table.workspaceId, table.employeeId),
]);

export const insertComplianceEnrollmentSchema = createInsertSchema(complianceEnrollments).omit({
  id: true, createdAt: true, updatedAt: true, submittedAt: true, reviewedAt: true,
});
export type InsertComplianceEnrollment = z.infer<typeof insertComplianceEnrollmentSchema>;
export type ComplianceEnrollment = typeof complianceEnrollments.$inferSelect;

// ─── Employee Bank Accounts (Direct Deposit) ─────────────────────────────────
// AES-256-GCM encrypted at the application layer via server/security/tokenEncryption.ts
// Routing number and account number are NEVER stored in plaintext in production.
// Use encryptToken() before write and decryptToken() after read in all routes.
export const employeeBankAccounts = pgTable("employee_bank_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Encrypted fields — stored as AES-256-GCM ciphertext (iv:authTag:ciphertext format)
  bankName: varchar("bank_name"),                    // Human-readable bank name (not sensitive)
  routingNumberEncrypted: text("routing_number_encrypted"),   // AES-256-GCM encrypted routing number
  accountNumberEncrypted: text("account_number_encrypted"),   // AES-256-GCM encrypted account number
  accountType: varchar("account_type").default("checking"),   // 'checking' | 'savings'

  // Display-safe masked values (pre-computed, stored for UI without decryption round-trip)
  routingNumberLast4: varchar("routing_number_last4", { length: 4 }),
  accountNumberLast4: varchar("account_number_last4", { length: 4 }),

  // Direct deposit split configuration
  depositType: varchar("deposit_type").default("full"),       // 'full' | 'fixed_amount' | 'percentage'
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2}),   // Fixed dollar amount if depositType='fixed_amount'
  depositPercent: decimal("deposit_percent", { precision: 5, scale: 2 }), // Percentage if depositType='percentage'

  // Verification status
  isVerified: boolean("is_verified").default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by"),

  // Lifecycle
  isPrimary: boolean("is_primary").default(true),
  isActive: boolean("is_active").default(true),
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by"),

  // Audit
  addedBy: varchar("added_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  // Plaid Link — encrypted access token for ACH transfers
  plaidAccessTokenEncrypted: text("plaid_access_token_encrypted"),
  plaidItemId: varchar("plaid_item_id", { length: 255 }),
  plaidAccountId: varchar("plaid_account_id", { length: 255 }),
  plaidMask: varchar("plaid_mask", { length: 10 }),
  plaidInstitutionName: varchar("plaid_institution_name", { length: 255 }),
}, (table) => [
  index("eba_workspace_idx").on(table.workspaceId),
  index("eba_employee_idx").on(table.employeeId),
  index("eba_workspace_employee_idx").on(table.workspaceId, table.employeeId),
]);

export const insertEmployeeBankAccountSchema = createInsertSchema(employeeBankAccounts).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertEmployeeBankAccount = z.infer<typeof insertEmployeeBankAccountSchema>;
export type EmployeeBankAccount = typeof employeeBankAccounts.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// hiring_pipeline
// Applicant tracking for open positions — feeds into employee onboarding.
// ─────────────────────────────────────────────────────────────────────────────
export const hiringPipeline = pgTable("hiring_pipeline", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  applicantName: varchar("applicant_name").notNull(),
  applicantEmail: varchar("applicant_email"),
  applicantPhone: varchar("applicant_phone"),
  positionApplied: varchar("position_applied"),
  source: varchar("source").default("direct"), // direct, referral, job_board, platform_pool
  status: varchar("status").notNull().default("new"), // new, screening, interview, offer, hired, rejected
  stage: varchar("stage").notNull().default("application"), // application, phone_screen, interview, background_check, offer, onboarding
  resumeUrl: text("resume_url"),
  coverLetterUrl: text("cover_letter_url"),
  notes: text("notes"),
  assignedTo: varchar("assigned_to"), // user_id of recruiter/manager
  interviewScheduledAt: timestamp("interview_scheduled_at", { withTimezone: true }),
  offerSentAt: timestamp("offer_sent_at", { withTimezone: true }),
  offerAcceptedAt: timestamp("offer_accepted_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  hiredAt: timestamp("hired_at", { withTimezone: true }),
  employeeId: varchar("employee_id"), // links to employees.id after hire
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_hiring_pipeline_workspace").on(table.workspaceId),
  index("idx_hiring_pipeline_status").on(table.status),
  index("idx_hiring_pipeline_stage").on(table.stage),
]);
export type HiringPipeline = typeof hiringPipeline.$inferSelect;
export const insertHiringPipelineSchema = createInsertSchema(hiringPipeline).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHiringPipeline = z.infer<typeof insertHiringPipelineSchema>;

// NOTE: engagementScoreHistory is defined earlier in this file (line ~1505).
// Do not re-declare it here.

// ─────────────────────────────────────────────────────────────────────────────
// performance_notes
// Manager-authored notes per officer: commendations, concerns, warnings, neutral.
// Visible in officer profile to manager+. HelpAI is context-aware of note history.
// ─────────────────────────────────────────────────────────────────────────────
export const performanceNotes = pgTable("performance_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  notedBy: varchar("noted_by").notNull(), // user_id of manager/supervisor
  noteType: varchar("note_type", { length: 30 }).notNull().default("neutral"),
  // commendation | concern | warning | neutral
  content: text("content").notNull(),
  isPrivate: boolean("is_private").default(false), // if true, only manager+ can see
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("perf_notes_workspace_idx").on(table.workspaceId),
  index("perf_notes_employee_idx").on(table.employeeId),
  index("perf_notes_type_idx").on(table.noteType),
]);
export const insertPerformanceNoteSchema = createInsertSchema(performanceNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPerformanceNote = z.infer<typeof insertPerformanceNoteSchema>;
export type PerformanceNote = typeof performanceNotes.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// disciplinary_records
// Formal HR records: verbal warning, written warning, PIP, termination.
// Written warning+ requires officer acknowledgment.
// Termination triggers demand signal to hiring module.
// ─────────────────────────────────────────────────────────────────────────────
// Phase 35J: record_type enum values for disciplinary records
// verbal_caution | verbal_warning | written_warning | termination_warning | pip | suspension | termination | commendation
// appeal_status: none | pending | approved | denied
export const disciplinaryRecords = pgTable("disciplinary_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  recordType: varchar("record_type", { length: 40 }).notNull(),
  // verbal_caution | verbal_warning | written_warning | termination_warning | pip | suspension | termination | commendation
  description: text("description").notNull(),
  issuedBy: varchar("issued_by").notNull(), // user_id
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  acknowledgedBy: varchar("acknowledged_by"), // employee user_id or employee_id
  documentUrl: text("document_url"), // PDF filed to Document Safe
  pipStartDate: timestamp("pip_start_date", { withTimezone: true }),
  pipEndDate: timestamp("pip_end_date", { withTimezone: true }),
  pipGoals: text("pip_goals"),
  status: varchar("status", { length: 20 }).default("active"), // active | resolved | appealed
  notes: text("notes"),
  // Phase 35J fields
  evidenceUrls: text("evidence_urls").array(), // attached evidence files
  appealStatus: varchar("appeal_status", { length: 20 }).default("none"), // none | pending | approved | denied
  appealReason: text("appeal_reason"), // officer-submitted appeal text
  effectiveDate: timestamp("effective_date", { withTimezone: true }), // when the action takes effect
  expiryDate: timestamp("expiry_date", { withTimezone: true }), // when the action expires / auto-resolves
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("disciplinary_workspace_idx").on(table.workspaceId),
  index("disciplinary_employee_idx").on(table.employeeId),
  index("disciplinary_type_idx").on(table.recordType),
  index("disciplinary_issued_at_idx").on(table.issuedAt),
]);
export const insertDisciplinaryRecordSchema = createInsertSchema(disciplinaryRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDisciplinaryRecord = z.infer<typeof insertDisciplinaryRecordSchema>;
export type DisciplinaryRecord = typeof disciplinaryRecords.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// employee_terminations
// Formal offboarding records. Completion triggers 14-day document access window.
// ─────────────────────────────────────────────────────────────────────────────
export const employeeTerminations = pgTable("employee_terminations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  status: varchar("status").default("pending"), // pending | completed
  terminationType: varchar("termination_type"), // voluntary | involuntary | layoff | end_of_contract | other
  reason: text("reason"),
  terminationDate: timestamp("termination_date"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employee_terminations_workspace_idx").on(table.workspaceId),
  index("employee_terminations_employee_idx").on(table.employeeId),
]);

export const insertEmployeeTerminationSchema = createInsertSchema(employeeTerminations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeTermination = z.infer<typeof insertEmployeeTerminationSchema>;
export type EmployeeTermination = typeof employeeTerminations.$inferSelect;

export * from './extended';
