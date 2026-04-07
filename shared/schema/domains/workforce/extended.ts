import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const applicantInterviews = pgTable("applicant_interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  applicantId: varchar("applicant_id").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  interviewerId: varchar("interviewer_id"),
  interviewType: varchar("interview_type").default('in_person'),
  notes: text("notes"),
  rating: integer("rating"),
  recommendation: varchar("recommendation"),
  status: varchar("status").default('scheduled'),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertApplicantInterviewsSchema = createInsertSchema(applicantInterviews).omit({ id: true });
export type InsertApplicantInterviews = z.infer<typeof insertApplicantInterviewsSchema>;
export type ApplicantInterviews = typeof applicantInterviews.$inferSelect;

export const applicants = pgTable("applicants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  jobPostingId: varchar("job_posting_id"),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  hasGuardCard: boolean("has_guard_card").default(false),
  guardCardNumber: varchar("guard_card_number"),
  guardCardExpiration: date("guard_card_expiration"),
  hasArmedEndorsement: boolean("has_armed_endorsement").default(false),
  yearsExperience: integer("years_experience").default(0),
  priorEmployers: jsonb("prior_employers").default('[]'),
  applicantReferences: jsonb("applicant_references").default('[]'),
  appliedAt: timestamp("applied_at").default(sql`now()`),
  status: varchar("status").default('applied'),
  trinityScore: integer("trinity_score").default(0),
  trinityScoreRationale: text("trinity_score_rationale"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  licenseState: text("license_state"),
  licenseType: text("license_type"),
  licenseScreenshotUrl: text("license_screenshot_url"),
  licenseVerified: boolean("license_verified").default(false),
  licenseVerificationNotes: text("license_verification_notes"),
  pipelineStage: text("pipeline_stage").default('applied'),
  interviewScore: integer("interview_score"),
  liabilityScore: integer("liability_score"),
  trinitySummary: text("trinity_summary"),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertApplicantsSchema = createInsertSchema(applicants).omit({ id: true });
export type InsertApplicants = z.infer<typeof insertApplicantsSchema>;
export type Applicants = typeof applicants.$inferSelect;

export const employeeOnboardingProgress = pgTable("employee_onboarding_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  overallProgressPct: integer("overall_progress_pct").notNull().default(0),
  status: varchar("status").notNull().default('invited'),
  trinityWelcomeSent: boolean("trinity_welcome_sent").notNull().default(false),
  trinityWelcomeSentAt: timestamp("trinity_welcome_sent_at"),
  invitationSentAt: timestamp("invitation_sent_at"),
  invitationAcceptedAt: timestamp("invitation_accepted_at"),
  stepsCompleted: jsonb("steps_completed").notNull().default('[]'),
  profileComplete: boolean("profile_complete").notNull().default(false),
  photoUploaded: boolean("photo_uploaded").notNull().default(false),
  guardCardUploaded: boolean("guard_card_uploaded").notNull().default(false),
  stateIdUploaded: boolean("state_id_uploaded").notNull().default(false),
  employmentApplicationComplete: boolean("employment_application_complete").notNull().default(false),
  i9Complete: boolean("i9_complete").notNull().default(false),
  w4Complete: boolean("w4_complete").notNull().default(false),
  directDepositComplete: boolean("direct_deposit_complete").notNull().default(false),
  drugFreeAcknowledged: boolean("drug_free_acknowledged").notNull().default(false),
  backgroundCheckAuthorized: boolean("background_check_authorized").notNull().default(false),
  employeeHandbookSigned: boolean("employee_handbook_signed").notNull().default(false),
  sopAcknowledged: boolean("sop_acknowledged").notNull().default(false),
  equipmentIssued: boolean("equipment_issued").notNull().default(false),
  emergencyContactAdded: boolean("emergency_contact_added").notNull().default(false),
  referencesSubmitted: boolean("references_submitted").notNull().default(false),
  completedAt: timestamp("completed_at"),
  lastUpdatedAt: timestamp("last_updated_at").notNull().default(sql`now()`),

  stepsRemaining: jsonb("steps_remaining"),
});

export const insertEmployeeOnboardingProgressSchema = createInsertSchema(employeeOnboardingProgress).omit({ id: true });
export type InsertEmployeeOnboardingProgress = z.infer<typeof insertEmployeeOnboardingProgressSchema>;
export type EmployeeOnboardingProgress = typeof employeeOnboardingProgress.$inferSelect;

export const employeeOnboardingSteps = pgTable("employee_onboarding_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stepKey: varchar("step_key").notNull(),
  stepNumber: integer("step_number").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  category: varchar("category").notNull(),
  documentType: varchar("document_type"),
  uploadRequired: boolean("upload_required").default(false),
  signatureRequired: boolean("signature_required").default(false),
  acknowledgmentRequired: boolean("acknowledgment_required").default(false),
  trinityPromptTemplate: text("trinity_prompt_template"),
  estimatedMinutes: integer("estimated_minutes").default(5),
  dependsOnStep: varchar("depends_on_step"),
});

export const insertEmployeeOnboardingStepsSchema = createInsertSchema(employeeOnboardingSteps).omit({ id: true });
export type InsertEmployeeOnboardingSteps = z.infer<typeof insertEmployeeOnboardingStepsSchema>;
export type EmployeeOnboardingSteps = typeof employeeOnboardingSteps.$inferSelect;

export const employeeTrainingRecords = pgTable("employee_training_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  requirementId: varchar("requirement_id"),
  trainingName: varchar("training_name").notNull(),
  completionDate: date("completion_date"),
  expirationDate: date("expiration_date"),
  hoursCompleted: decimal("hours_completed"),
  providerName: varchar("provider_name"),
  certificateNumber: varchar("certificate_number"),
  certificateFilePath: text("certificate_file_path"),
  verified: boolean("verified").default(false),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  status: varchar("status").default('current'),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertEmployeeTrainingRecordsSchema = createInsertSchema(employeeTrainingRecords).omit({ id: true });
export type InsertEmployeeTrainingRecords = z.infer<typeof insertEmployeeTrainingRecordsSchema>;
export type EmployeeTrainingRecords = typeof employeeTrainingRecords.$inferSelect;

export const interviewQuestionSets = pgTable("interview_question_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  roleType: varchar("role_type").notNull(),
  questions: jsonb("questions").notNull().default('[]'),
  isDefault: boolean("is_default").default(false),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertInterviewQuestionSetsSchema = createInsertSchema(interviewQuestionSets).omit({ id: true });
export type InsertInterviewQuestionSets = z.infer<typeof insertInterviewQuestionSetsSchema>;
export type InterviewQuestionSets = typeof interviewQuestionSets.$inferSelect;

export const interviewSessions = pgTable("interview_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  applicantId: varchar("applicant_id").notNull(),
  jobPostingId: varchar("job_posting_id"),
  conversationId: varchar("conversation_id"),
  sessionType: varchar("session_type").default('async'),
  status: varchar("status").default('pending'),
  questionSetId: varchar("question_set_id"),
  transcript: jsonb("transcript").default('[]'),
  scoreBreakdown: jsonb("score_breakdown").default('{}'),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`now()`),
  overallScore: integer("overall_score"),
  transcriptSummary: text("transcript_summary"),
});

export const insertInterviewSessionsSchema = createInsertSchema(interviewSessions).omit({ id: true });
export type InsertInterviewSessions = z.infer<typeof insertInterviewSessionsSchema>;
export type InterviewSessions = typeof interviewSessions.$inferSelect;

export const jobPostings = pgTable("job_postings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  positionType: varchar("position_type").default('unarmed'),
  employmentType: varchar("employment_type").default('full_time'),
  sites: jsonb("sites").default('[]'),
  payRateMin: decimal("pay_rate_min"),
  payRateMax: decimal("pay_rate_max"),
  requiredCertifications: jsonb("required_certifications").default('[]'),
  status: varchar("status").default('active'),
  applicationsCount: integer("applications_count").default(0),
  postedAt: timestamp("posted_at").default(sql`now()`),
  closedAt: timestamp("closed_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`),
  shiftType: text("shift_type").default('unarmed'),
  scheduleDetails: text("schedule_details"),
  requiresLicense: boolean("requires_license").default(false),
  autoGenerated: boolean("auto_generated").default(false),
  demandTrigger: text("demand_trigger"),
});

export const insertJobPostingsSchema = createInsertSchema(jobPostings).omit({ id: true });
export type InsertJobPostings = z.infer<typeof insertJobPostingsSchema>;
export type JobPostings = typeof jobPostings.$inferSelect;

export const offerLetters = pgTable("offer_letters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  applicantId: varchar("applicant_id").notNull(),
  position: varchar("position"),
  startDate: date("start_date"),
  payRate: decimal("pay_rate"),
  payType: varchar("pay_type").default('hourly'),
  employmentType: varchar("employment_type").default('full_time'),
  reportingTo: varchar("reporting_to"),
  offerSentAt: timestamp("offer_sent_at"),
  offerExpiresAt: timestamp("offer_expires_at"),
  offerAcceptedAt: timestamp("offer_accepted_at"),
  offerDeclinedAt: timestamp("offer_declined_at"),
  declineReason: text("decline_reason"),
  filePath: text("file_path"),
  status: varchar("status").default('draft'),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertOfferLettersSchema = createInsertSchema(offerLetters).omit({ id: true });
export type InsertOfferLetters = z.infer<typeof insertOfferLettersSchema>;
export type OfferLetters = typeof offerLetters.$inferSelect;

export const officerPerformanceScores = pgTable("officer_performance_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  periodType: varchar("period_type").notNull().default('weekly'),
  clockinAccuracyScore: decimal("clockin_accuracy_score").default(0),
  attendanceScore: decimal("attendance_score").default(0),
  reportQualityScore: decimal("report_quality_score").default(0),
  reportSubmissionScore: decimal("report_submission_score").default(0),
  clientSatisfactionScore: decimal("client_satisfaction_score").default(100),
  responseTimeScore: decimal("response_time_score").default(100),
  supervisorInputScore: decimal("supervisor_input_score"),
  compositeScore: decimal("composite_score").default(0),
  trend: varchar("trend").default('stable'),
  trendVelocity: decimal("trend_velocity").default(0),
  consecutiveDaysOnTime: integer("consecutive_days_on_time").default(0),
  consecutiveShiftsNoCalloff: integer("consecutive_shifts_no_calloff").default(0),
  reportsSubmittedStreak: integer("reports_submitted_streak").default(0),
  totalShiftsScheduled: integer("total_shifts_scheduled").default(0),
  totalShiftsWorked: integer("total_shifts_worked").default(0),
  totalClockinsOnTime: integer("total_clockins_on_time").default(0),
  calculatedAt: timestamp("calculated_at").default(sql`now()`),
  validThrough: date("valid_through"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertOfficerPerformanceScoresSchema = createInsertSchema(officerPerformanceScores).omit({ id: true });
export type InsertOfficerPerformanceScores = z.infer<typeof insertOfficerPerformanceScoresSchema>;
export type OfficerPerformanceScores = typeof officerPerformanceScores.$inferSelect;

export const onboardingDocuments = pgTable("onboarding_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  entityType: varchar("entity_type").notNull().default('employee'),
  entityId: varchar("entity_id").notNull(),
  documentType: varchar("document_type").notNull(),
  documentCategory: varchar("document_category").notNull().default('identity'),
  title: varchar("title").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default('pending'),
  filePath: varchar("file_path"),
  fileSizeBytes: integer("file_size_bytes"),
  fileType: varchar("file_type").default('pdf'),
  originalFilename: varchar("original_filename"),
  content: text("content"),
  generatedBy: varchar("generated_by").default('system'),
  uploadedAt: timestamp("uploaded_at"),
  signedAt: timestamp("signed_at"),
  signedBy: varchar("signed_by"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by"),
  expirationDate: date("expiration_date"),
  acknowledgmentText: text("acknowledgment_text"),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by"),
  version: integer("version").default(1),
  isCurrentVersion: boolean("is_current_version").default(true),
  previousVersionId: varchar("previous_version_id"),
  sha256Hash: varchar("sha256_hash"),
  metadata: jsonb("metadata").default('{}'),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertOnboardingDocumentsSchema = createInsertSchema(onboardingDocuments).omit({ id: true });
export type InsertOnboardingDocuments = z.infer<typeof insertOnboardingDocumentsSchema>;
export type OnboardingDocuments = typeof onboardingDocuments.$inferSelect;

export const trainingAttempts = pgTable("training_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  moduleId: varchar("module_id").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  attemptType: varchar("attempt_type").default('annual'),
  startedAt: timestamp("started_at").default(sql`now()`),
  completedAt: timestamp("completed_at"),
  currentSectionIndex: integer("current_section_index").default(0),
  sectionScores: jsonb("section_scores").default('{}'),
  finalExamScore: integer("final_exam_score"),
  overallScore: integer("overall_score"),
  passed: boolean("passed").default(false),
  answers: jsonb("answers").default('{}'),
  timeSpentSeconds: integer("time_spent_seconds").default(0),
  flaggedForIntervention: boolean("flagged_for_intervention").default(false),
  interventionRequiredAt: timestamp("intervention_required_at"),
  ipAddress: varchar("ip_address"),
});

export const insertTrainingAttemptsSchema = createInsertSchema(trainingAttempts).omit({ id: true });
export type InsertTrainingAttempts = z.infer<typeof insertTrainingAttemptsSchema>;
export type TrainingAttempts = typeof trainingAttempts.$inferSelect;

export const trainingCertificates = pgTable("training_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  moduleId: varchar("module_id").notNull(),
  attemptId: varchar("attempt_id").notNull(),
  certificateNumber: varchar("certificate_number").notNull(),
  issuedAt: timestamp("issued_at").default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
  overallScore: integer("overall_score").notNull(),
  isValid: boolean("is_valid").default(true),
  pdfUrl: text("pdf_url"),
  documentId: varchar("document_id"),
});

export const insertTrainingCertificatesSchema = createInsertSchema(trainingCertificates).omit({ id: true });
export type InsertTrainingCertificates = z.infer<typeof insertTrainingCertificatesSchema>;
export type TrainingCertificates = typeof trainingCertificates.$inferSelect;

export const trainingRequirements = pgTable("training_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  requirementName: varchar("requirement_name").notNull(),
  requirementType: varchar("requirement_type").notNull(),
  appliesToRoles: jsonb("applies_to_roles").default('[]'),
  appliesToPositions: jsonb("applies_to_positions").default('[]'),
  appliesToSites: jsonb("applies_to_sites").default('[]'),
  frequency: varchar("frequency").default('annual'),
  frequencyMonths: integer("frequency_months"),
  requiredHours: integer("required_hours"),
  providerRequired: boolean("provider_required").default(false),
  approvedProviders: jsonb("approved_providers").default('[]'),
  consequenceOfExpiry: varchar("consequence_of_expiry").default('warning'),
  stateRequired: boolean("state_required").default(false),
  stateCode: varchar("state_code"),
  regulatoryReference: text("regulatory_reference"),
  createdBy: varchar("created_by"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertTrainingRequirementsSchema = createInsertSchema(trainingRequirements).omit({ id: true });
export type InsertTrainingRequirements = z.infer<typeof insertTrainingRequirementsSchema>;
export type TrainingRequirements = typeof trainingRequirements.$inferSelect;

export const trainingScheduledSessions = pgTable("training_scheduled_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  requirementId: varchar("requirement_id"),
  scheduledDate: date("scheduled_date").notNull(),
  provider: varchar("provider"),
  location: text("location"),
  status: varchar("status").default('scheduled'),
  reminderSent_7Day: boolean("reminder_sent_7_day").default(false),
  reminderSent_1Day: boolean("reminder_sent_1_day").default(false),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertTrainingScheduledSessionsSchema = createInsertSchema(trainingScheduledSessions).omit({ id: true });
export type InsertTrainingScheduledSessions = z.infer<typeof insertTrainingScheduledSessionsSchema>;
export type TrainingScheduledSessions = typeof trainingScheduledSessions.$inferSelect;

export const employeeProfiles = pgTable("employee_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().unique(),
  workspaceId: varchar("workspace_id").notNull(),
  bio: text("bio"),
  skills: text("skills").array(),
  certifications: text("certifications").array(),
  languages: text("languages").array(),
  performanceRating: decimal("performance_rating", { precision: 3, scale: 2 }),
  reliabilityScore: decimal("reliability_score", { precision: 3, scale: 2 }),
  punctualityScore: decimal("punctuality_score", { precision: 3, scale: 2 }),
  calloffCount: integer("calloff_count").default(0),
  totalShifts: integer("total_shifts").default(0),
  profileCompleteness: integer("profile_completeness").default(0),
  linkedinUrl: text("linkedin_url"),
  emergencyNotes: text("emergency_notes"),
  preferredShift: varchar("preferred_shift"),
  maxHoursPerWeek: integer("max_hours_per_week").default(40),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeProfileSchema = createInsertSchema(employeeProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployeeProfile = z.infer<typeof insertEmployeeProfileSchema>;
export type EmployeeProfile = typeof employeeProfiles.$inferSelect;

