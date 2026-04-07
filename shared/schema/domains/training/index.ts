// ═══════════════════════════════════════════════════════════════
// Domain: Officer Training Certification
// ═══════════════════════════════════════════════════════════════
// Tables: training_modules, training_sections, training_questions,
//         training_attempts, training_certificates, training_interventions,
//         training_sessions, training_attendance, training_providers

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ── training_modules ──────────────────────────────────────────
export const trainingModules = pgTable('training_modules', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id'),
  isPlatformDefault: boolean('is_platform_default').default(true),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }).notNull(),
  passingScore: integer('passing_score').default(80),
  certificateValidDays: integer('certificate_valid_days').default(365),
  isRequired: boolean('is_required').default(false),
  affectsEmployeeScore: boolean('affects_employee_score').default(true),
  scorePenaltyPerDayOverdue: integer('score_penalty_per_day_overdue').default(1),
  maxAttemptsBeforeIntervention: integer('max_attempts_before_intervention').default(2),
  stateCreditHours: decimal('state_credit_hours', { precision: 4, scale: 2 }).default('0'),
  orderIndex: integer('order_index').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const insertTrainingModuleSchema = createInsertSchema(trainingModules).omit({ id: true, createdAt: true });
export type InsertTrainingModule = z.infer<typeof insertTrainingModuleSchema>;
export type TrainingModule = typeof trainingModules.$inferSelect;

// ── training_sections ─────────────────────────────────────────
export const trainingSections = pgTable('training_sections', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  moduleId: varchar('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  contentBody: text('content_body').notNull(),
  flashcardData: jsonb('flashcard_data').$type<Array<{ front: string; back: string }>>(),
  orderIndex: integer('order_index').default(0),
  sectionQuizRequired: boolean('section_quiz_required').default(true),
});

export const insertTrainingSectionSchema = createInsertSchema(trainingSections).omit({ id: true });
export type InsertTrainingSection = z.infer<typeof insertTrainingSectionSchema>;
export type TrainingSection = typeof trainingSections.$inferSelect;

// ── training_questions ────────────────────────────────────────
export const trainingQuestions = pgTable('training_questions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  moduleId: varchar('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
  sectionId: varchar('section_id').references(() => trainingSections.id),
  questionText: text('question_text').notNull(),
  options: jsonb('options').notNull().$type<Array<{ id: string; text: string }>>(),
  correctAnswer: varchar('correct_answer', { length: 255 }).notNull(),
  explanation: text('explanation'),
  isFinalExam: boolean('is_final_exam').default(false),
  orderIndex: integer('order_index').default(0),
});

export const insertTrainingQuestionSchema = createInsertSchema(trainingQuestions).omit({ id: true });
export type InsertTrainingQuestion = z.infer<typeof insertTrainingQuestionSchema>;
export type TrainingQuestion = typeof trainingQuestions.$inferSelect;

// ── training_attempts ─────────────────────────────────────────
export const officerTrainingAttempts = pgTable('training_attempts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  employeeId: varchar('employee_id').notNull(),
  moduleId: varchar('module_id').notNull().references(() => trainingModules.id),
  attemptNumber: integer('attempt_number').notNull().default(1),
  attemptType: varchar('attempt_type', { length: 50 }).default('annual'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  currentSectionIndex: integer('current_section_index').default(0),
  sectionScores: jsonb('section_scores').$type<Record<string, { score: number; passed: boolean; missedTopics: string[] }>>().default({}),
  finalExamScore: integer('final_exam_score'),
  overallScore: integer('overall_score'),
  passed: boolean('passed').default(false),
  answers: jsonb('answers').$type<Record<string, string>>().default({}),
  timeSpentSeconds: integer('time_spent_seconds').default(0),
  flaggedForIntervention: boolean('flagged_for_intervention').default(false),
  interventionRequiredAt: timestamp('intervention_required_at', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 100 }),
}, (table) => ({
  workspaceIdx: index('idx_training_attempts_workspace').on(table.workspaceId),
  employeeIdx: index('idx_training_attempts_employee').on(table.employeeId),
  moduleIdx: index('idx_training_attempts_module').on(table.moduleId),
}));

export const insertOfficerTrainingAttemptSchema = createInsertSchema(officerTrainingAttempts).omit({ id: true, startedAt: true });
export type InsertOfficerTrainingAttempt = z.infer<typeof insertOfficerTrainingAttemptSchema>;
export type OfficerTrainingAttempt = typeof officerTrainingAttempts.$inferSelect;

// ── training_certificates ─────────────────────────────────────
export const officerTrainingCertificates = pgTable('training_certificates', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  employeeId: varchar('employee_id').notNull(),
  moduleId: varchar('module_id').notNull().references(() => trainingModules.id),
  attemptId: varchar('attempt_id').notNull().references(() => officerTrainingAttempts.id),
  certificateNumber: varchar('certificate_number', { length: 100 }).unique().notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  overallScore: integer('overall_score').notNull(),
  isValid: boolean('is_valid').default(true),
  pdfUrl: text('pdf_url'),
  documentId: varchar('document_id'),
}, (table) => ({
  workspaceIdx: index('idx_officer_certs_workspace').on(table.workspaceId),
  employeeIdx: index('idx_officer_certs_employee').on(table.employeeId),
  expiresIdx: index('idx_officer_certs_expires').on(table.expiresAt),
}));

export const insertOfficerTrainingCertificateSchema = createInsertSchema(officerTrainingCertificates).omit({ id: true, issuedAt: true });
export type InsertOfficerTrainingCertificate = z.infer<typeof insertOfficerTrainingCertificateSchema>;
export type OfficerTrainingCertificate = typeof officerTrainingCertificates.$inferSelect;

// ── training_interventions ────────────────────────────────────
export const trainingInterventions = pgTable('training_interventions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  employeeId: varchar('employee_id').notNull(),
  moduleId: varchar('module_id').notNull(),
  attemptId: varchar('attempt_id').notNull(),
  flaggedAt: timestamp('flagged_at', { withTimezone: true }).defaultNow(),
  consistentlyMissedTopics: jsonb('consistently_missed_topics').$type<string[]>(),
  assignedToManager: varchar('assigned_to_manager', { length: 255 }),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  conductedBy: varchar('conducted_by', { length: 255 }),
  durationMinutes: integer('duration_minutes'),
  notes: text('notes'),
  outcome: varchar('outcome', { length: 100 }),
}, (table) => ({
  workspaceIdx: index('idx_training_interventions_workspace').on(table.workspaceId),
  employeeIdx: index('idx_training_interventions_employee').on(table.employeeId),
  completedIdx: index('idx_training_interventions_completed').on(table.completed),
}));

export const insertTrainingInterventionSchema = createInsertSchema(trainingInterventions).omit({ id: true, flaggedAt: true });
export type InsertTrainingIntervention = z.infer<typeof insertTrainingInterventionSchema>;
export type TrainingIntervention = typeof trainingInterventions.$inferSelect;

// ── training_providers ────────────────────────────────────────
export const trainingProviders = pgTable('training_providers', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  contactName: varchar('contact_name', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  address: text('address'),
  website: text('website'),
  approved: boolean('approved').default(false),
  tcoleApproved: boolean('tcole_approved').default(false),
  specialties: jsonb('specialties').$type<string[]>(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const insertTrainingProviderSchema = createInsertSchema(trainingProviders).omit({ id: true, createdAt: true });
export type InsertTrainingProvider = z.infer<typeof insertTrainingProviderSchema>;
export type TrainingProvider = typeof trainingProviders.$inferSelect;

// ── training_sessions ─────────────────────────────────────────
export const trainingSessions = pgTable('training_sessions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  trainingType: varchar('training_type', { length: 100 }).notNull(), // 'firearms_qualification' | 'de_escalation' | 'tcole_mandated' | 'online' | 'in_house' | 'third_party' | 'first_aid' | 'legal' | 'other'
  requiredFor: varchar('required_for', { length: 100 }), // 'all' | 'armed' | 'unarmed' | 'supervisors' | 'custom'
  providerId: varchar('provider_id').references(() => trainingProviders.id),
  instructorName: varchar('instructor_name', { length: 255 }),
  location: varchar('location', { length: 255 }),
  sessionDate: timestamp('session_date', { withTimezone: true }).notNull(),
  durationHours: decimal('duration_hours', { precision: 5, scale: 2 }).notNull(),
  maxAttendees: integer('max_attendees'),
  tcoleHoursCredit: decimal('tcole_hours_credit', { precision: 5, scale: 2 }).default('0'),
  status: varchar('status', { length: 50 }).notNull().default('scheduled'), // scheduled, in_progress, completed, cancelled
  qrCode: text('qr_code'),
  certificateTemplate: text('certificate_template'),
  createdBy: varchar('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workspaceIdx: index('idx_training_sessions_workspace').on(table.workspaceId),
  statusIdx: index('idx_training_sessions_status').on(table.status),
  dateIdx: index('idx_training_sessions_date').on(table.sessionDate),
}));

export const insertTrainingSessionSchema = createInsertSchema(trainingSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessions.$inferSelect;

// ── training_attendance ───────────────────────────────────────
export const trainingAttendance = pgTable('training_attendance', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  sessionId: varchar('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  employeeId: varchar('employee_id').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('registered'), // registered, attended, absent, excused
  checkInMethod: varchar('check_in_method', { length: 50 }), // qr, manual, self_report
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  tcoleHoursAwarded: decimal('tcole_hours_awarded', { precision: 5, scale: 2 }).default('0'),
  certificateUrl: text('certificate_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workspaceIdx: index('idx_training_attendance_workspace').on(table.workspaceId),
  sessionIdx: index('idx_training_attendance_session').on(table.sessionId),
  employeeIdx: index('idx_training_attendance_employee').on(table.employeeId),
  uniqueAttendee: uniqueIndex('idx_training_attendance_unique').on(table.sessionId, table.employeeId),
}));

export const insertTrainingAttendanceSchema = createInsertSchema(trainingAttendance).omit({ id: true, createdAt: true });
export type InsertTrainingAttendance = z.infer<typeof insertTrainingAttendanceSchema>;
export type TrainingAttendance = typeof trainingAttendance.$inferSelect;
