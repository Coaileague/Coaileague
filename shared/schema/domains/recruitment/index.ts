// ═══════════════════════════════════════════════════════════════
// Domain: Recruitment — Phase 58 Trinity Interview Pipeline
// ═══════════════════════════════════════════════════════════════
// Tables: interview_candidates, interview_sessions, interview_questions_bank, interview_scorecards

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ─── Interview Candidates ─────────────────────────────────────────────────────
export const interviewCandidates = pgTable('interview_candidates', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  candidateNumber: varchar('candidate_number').unique(), // CND-ACM-00001

  // Personal info
  firstName: varchar('first_name').notNull(),
  lastName: varchar('last_name').notNull(),
  email: varchar('email').notNull(),
  phone: varchar('phone'),

  // Position interest
  positionType: varchar('position_type').notNull().default('unarmed_officer'), // armed_officer | unarmed_officer | supervisor
  positionTitle: varchar('position_title'),

  // Pipeline stage
  stage: varchar('stage').notNull().default('new'), // new | screening | email_round_1 | email_round_2 | chat_interview | voice_interview | decided
  qualificationScore: integer('qualification_score'), // 0-100 initial Trinity screening score

  // Source info
  sourceEmail: varchar('source_email'), // The careers@... address that received their email
  inboundEmailLogId: varchar('inbound_email_log_id'), // FK → inbound_email_log.id

  // Parsed resume/application data
  resumeParsed: jsonb('resume_parsed'), // { summary, experience, skills, education }
  rawApplicationText: text('raw_application_text'), // Original email body

  // Decision
  decision: varchar('decision'), // hire | reject | hold
  decisionNotes: text('decision_notes'),
  decisionBy: varchar('decision_by'), // userId
  decisionAt: timestamp('decision_at'),

  // Chat interview room (created when candidate reaches chat_interview stage)
  chatRoomId: varchar('chat_room_id'),  // FK → organization_chat_rooms.id
  chatRoomUrl: text('chat_room_url'),   // Deep-link for recruiter / candidate

  // Metadata
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_interview_candidates_workspace').on(table.workspaceId),
  index('idx_interview_candidates_stage').on(table.stage),
  index('idx_interview_candidates_email').on(table.email),
]);

export const insertInterviewCandidateSchema = createInsertSchema(interviewCandidates).omit({
  id: true,
  candidateNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInterviewCandidate = z.infer<typeof insertInterviewCandidateSchema>;
export type InterviewCandidate = typeof interviewCandidates.$inferSelect;

// ─── Candidate Interview Sessions ─────────────────────────────────────────────
// Note: 'interview_sessions' table is already used by the legacy ATS module.
// This table stores Phase 58 Trinity pipeline sessions (email/chat/voice).
export const candidateInterviewSessions = pgTable('candidate_interview_sessions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  candidateId: varchar('candidate_id').notNull(), // FK → interview_candidates.id

  // Session type
  sessionType: varchar('session_type').notNull(), // email_round_1 | email_round_2 | chat_interview | voice_interview

  // Status
  status: varchar('status').notNull().default('pending'), // pending | in_progress | completed | expired

  // Questions & answers (for email rounds)
  questionsAsked: jsonb('questions_asked'), // Array of { questionId, questionText, sentAt }
  responsesReceived: jsonb('responses_received'), // Array of { questionId, responseText, receivedAt, score, scoring_notes }

  // Chat room integration
  chatRoomId: varchar('chat_room_id'), // FK → dock_chat_rooms.id when session_type = 'chat_interview'
  coPilotLog: jsonb('co_pilot_log'), // Array of recruiter-only Trinity insights during chat

  // Voice integration (Phase 56 Ext 6)
  voiceCallSid: varchar('voice_call_sid'), // Twilio call SID
  voiceTranscript: text('voice_transcript'),
  voiceRecordingUrl: text('voice_recording_url'),
  voiceDurationSeconds: integer('voice_duration_seconds'),

  // Scoring
  sessionScore: integer('session_score'), // 0-100 composite score for this session
  scoringBreakdown: jsonb('scoring_breakdown'), // { communication, experience, availability, etc. }

  // Email threading
  lastEmailMessageId: varchar('last_email_message_id'), // For thread continuation

  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_cis_candidate').on(table.candidateId),
  index('idx_cis_workspace').on(table.workspaceId),
  index('idx_cis_type').on(table.sessionType),
]);

export const insertCandidateInterviewSessionSchema = createInsertSchema(candidateInterviewSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCandidateInterviewSession = z.infer<typeof insertCandidateInterviewSessionSchema>;
export type CandidateInterviewSession = typeof candidateInterviewSessions.$inferSelect;

// ─── Interview Questions Bank ──────────────────────────────────────────────────
export const interviewQuestionsBank = pgTable('interview_questions_bank', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id'), // null = platform default, set = org-specific

  // Position targeting
  positionType: varchar('position_type').notNull(), // armed_officer | unarmed_officer | supervisor | all
  round: integer('round').notNull().default(1), // 1 or 2 (round 2 questions have branching logic)

  // Question
  questionText: text('question_text').notNull(),
  questionCategory: varchar('question_category').notNull(), // experience | availability | scenario | background | personality
  isRequired: boolean('is_required').default(false),

  // Scoring criteria
  scoringCriteria: jsonb('scoring_criteria'), // { keywords: [], idealResponse: '', weights: {} }
  maxScore: integer('max_score').default(10),

  // Branching logic (for round 2)
  branchCondition: jsonb('branch_condition'), // { if: { round1QuestionId, scoreRange: [min, max] }, use: true }

  // Metadata
  isActive: boolean('is_active').default(true),
  displayOrder: integer('display_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_questions_bank_position').on(table.positionType),
  index('idx_questions_bank_round').on(table.round),
]);

export const insertInterviewQuestionBankSchema = createInsertSchema(interviewQuestionsBank).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInterviewQuestionBank = z.infer<typeof insertInterviewQuestionBankSchema>;
export type InterviewQuestionBank = typeof interviewQuestionsBank.$inferSelect;

// ─── Interview Scorecards ──────────────────────────────────────────────────────
export const interviewScorecards = pgTable('interview_scorecards', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  candidateId: varchar('candidate_id').notNull(), // FK → interview_candidates.id

  // Composite scores (0-100)
  qualificationScore: integer('qualification_score'), // Initial Trinity screen
  communicationScore: integer('communication_score'), // From email + chat responses
  availabilityScore: integer('availability_score'), // Schedule flexibility
  experienceScore: integer('experience_score'), // Background match
  overallScore: integer('overall_score'), // Weighted composite

  // Trinity recommendation
  trinityRecommendation: varchar('trinity_recommendation'), // advance | hire | reject | hold
  trinityReasoning: text('trinity_reasoning'), // Full explanation

  // Individual session references
  emailRound1SessionId: varchar('email_round_1_session_id'),
  emailRound2SessionId: varchar('email_round_2_session_id'),
  chatSessionId: varchar('chat_session_id'),
  voiceSessionId: varchar('voice_session_id'),

  // Generation metadata
  generatedAt: timestamp('generated_at').defaultNow(),
  generatedBy: varchar('generated_by').default('trinity'),
  version: integer('version').default(1),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_scorecards_candidate').on(table.candidateId),
  index('idx_scorecards_workspace').on(table.workspaceId),
]);

export const insertInterviewScorecardSchema = createInsertSchema(interviewScorecards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInterviewScorecard = z.infer<typeof insertInterviewScorecardSchema>;
export type InterviewScorecard = typeof interviewScorecards.$inferSelect;
