// Schema Barrel — bridges legacy `shared/schema.ts` exports with newer
// `shared/schema/domains/*` tables that aren't in the legacy file yet.
//
// IMPORTANT: `import from '@shared/schema'` resolves to `shared/schema.ts`
// (file wins over directory in module resolution), NOT to this index.
// This index is only loaded when something explicitly imports
// `@shared/schema/...` sub-paths.
//
// The previous barrel re-exported a set of half-finished domain barrels
// (./ai, ./chat, ./clients, ./compliance, ./documents, ./finance,
// ./gamification, ./hr, ./integrations, ./notifications, ./onboarding,
// ./platform, ./scheduling) that referenced non-existent exports in
// shared/schema.ts and produced thousands of TypeScript errors. Those
// sub-files had zero real importers and have been deleted.

// Common utilities (kept — re-exports zod helpers used by domain files)
export * from './common';

// ── Pass 1 new tables — domains-only, not in legacy schema.ts ────────────────
// These tables exist only in shared/schema/domains/ and must be explicitly
// bridged here so `import { ... } from '@shared/schema'` works for all consumers.
export {
  cronRunLog,
  type CronRunLog,
  insertCronRunLogSchema,
  type InsertCronRunLog,
  stateTaxOverrides,
  type StateTaxOverride,
  insertStateTaxOverrideSchema,
  type InsertStateTaxOverride,
} from './domains/billing';
export {
  emailDeliveries,
  type EmailDelivery,
  insertEmailDeliverySchema,
  type InsertEmailDelivery,
  inboundEmailLog,
  insertInboundEmailLogSchema,
  type InboundEmailLog,
  type InsertInboundEmailLog,
} from './domains/comms';
export {
  hiringPipeline,
  type HiringPipeline,
  insertHiringPipelineSchema,
  type InsertHiringPipeline,
} from './domains/workforce';
export {
  performanceNotes,
  insertPerformanceNoteSchema,
  type InsertPerformanceNote,
  type PerformanceNote,
  disciplinaryRecords,
  insertDisciplinaryRecordSchema,
  type InsertDisciplinaryRecord,
  type DisciplinaryRecord,
} from './domains/workforce';
export {
  clientServiceRequests,
  insertClientServiceRequestSchema,
  type InsertClientServiceRequest,
  type ClientServiceRequest,
} from './domains/clients';
export {
  clientMessageThreads,
  insertClientMessageThreadSchema,
  type InsertClientMessageThread,
  type ClientMessageThread,
  clientMessages,
  insertClientMessageSchema,
  type InsertClientMessage,
  type ClientMessage,
} from './domains/clients';
export {
  stateRegulatoryConfig,
  insertStateRegulatoryConfigSchema,
  type InsertStateRegulatoryConfig,
  type StateRegulatoryConfig,
  postRequirements,
  insertPostRequirementSchema,
  type InsertPostRequirement,
  type PostRequirement,
} from './domains/compliance';

// ── payroll domain tables not yet in legacy schema.ts ────────────────────────
// employeePayrollInfo is used by db.query.employeePayrollInfo in payrollAutomation.ts.
// Without this export the table is absent from the Drizzle schema object and every
// db.query.employeePayrollInfo.findFirst() call throws at runtime.
export {
  employeePayrollInfo,
  payrollGarnishments,
} from './domains/payroll';

// ── SRA (State Regulatory Auditor) tables — Phase 33 ─────────────────────────
export {
  sraAccounts,
  sraAuditSessions,
  sraAuditLog,
  sraFindings,
  sraEnforcementDocuments,
  sraFindingMessages,
  insertSraAccountSchema,
  insertSraAuditSessionSchema,
  insertSraAuditLogSchema,
  insertSraFindingSchema,
  insertSraEnforcementDocumentSchema,
  insertSraFindingMessageSchema,
} from './domains/audit';

// ── Trinity infrastructure tables ─────────────────────────────────────────────
// durableJobQueue is imported by durableJobQueue.ts for Drizzle ORM queries.
// Without this export the table object is undefined and all .update/.where calls throw.
export {
  durableJobQueue,
} from './domains/trinity';

// ── Phase 58: Trinity Interview Pipeline (Recruitment) ───────────────────────
export {
  interviewCandidates,
  insertInterviewCandidateSchema,
  type InsertInterviewCandidate,
  type InterviewCandidate,
  candidateInterviewSessions,
  insertCandidateInterviewSessionSchema,
  type InsertCandidateInterviewSession,
  type CandidateInterviewSession,
  interviewQuestionsBank,
  insertInterviewQuestionBankSchema,
  type InsertInterviewQuestionBank,
  type InterviewQuestionBank,
  interviewScorecards,
  insertInterviewScorecardSchema,
  type InsertInterviewScorecard,
  type InterviewScorecard,
} from './domains/recruitment';

// ── Voice phone system tables — Phase 56 ─────────────────────────────────────
// NOTE: voiceCreditAccounts & voiceCreditTransactions removed (Phase 16 cleanup — tables dropped)
export {
  workspacePhoneNumbers,
  insertWorkspacePhoneNumberSchema,
  type InsertWorkspacePhoneNumber,
  type WorkspacePhoneNumber,
  voiceCallSessions,
  insertVoiceCallSessionSchema,
  type InsertVoiceCallSession,
  type VoiceCallSession,
  voiceCallActions,
  insertVoiceCallActionSchema,
  type InsertVoiceCallAction,
  type VoiceCallAction,
  voiceVerificationLog,
  insertVoiceVerificationLogSchema,
  type InsertVoiceVerificationLog,
  type VoiceVerificationLog,
  voiceSupportCases,
  insertVoiceSupportCaseSchema,
  type InsertVoiceSupportCase,
  type VoiceSupportCase,
  voiceSupportAgents,
  insertVoiceSupportAgentSchema,
  type InsertVoiceSupportAgent,
  type VoiceSupportAgent,
} from './domains/voice';
