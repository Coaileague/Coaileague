// ═══════════════════════════════════════════════════════════════
// Domain 11 of 15: Compliance & Documents
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 36

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, doublePrecision, index, uniqueIndex, primaryKey, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  complianceApprovalStatusEnum,
  complianceDocImageTypeEnum,
  complianceDocStatusEnum,
  complianceEntityTypeEnum,
  complianceReportStatusEnum,
  complianceReportTypeEnum,
  complianceStateStatusEnum,
  documentSignatureStatusEnum,
  documentTypeSignatureEnum,
  errorTypeEnum,
  incidentStatusEnum,
  policyStatusEnum,
  regulatorAccessLevelEnum,
  securityIncidentSeverityEnum,
  securityIncidentStatusEnum,
  securityIncidentTypeEnum,
  serviceKeyEnum,
} from '../../enums';

export const securityIncidents = pgTable("security_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  
  type: securityIncidentTypeEnum("type").notNull(),
  severity: securityIncidentSeverityEnum("severity").notNull(),
  status: securityIncidentStatusEnum("status").default('open'),
  
  description: text("description").notNull(),
  location: text("location"),
  
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolutionNotes: text("resolution_notes"),
  
  shiftId: varchar("shift_id"),
  clientId: varchar("client_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("security_incidents_workspace_idx").on(table.workspaceId),
  index("security_incidents_employee_idx").on(table.employeeId),
  index("security_incidents_status_idx").on(table.status),
  index("security_incidents_severity_idx").on(table.severity),
  index("security_incidents_reported_at_idx").on(table.reportedAt),
]);

export const documentSignatures = pgTable("document_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  applicationId: varchar("application_id"),
  employeeId: varchar("employee_id"),

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

export const companyPolicies = pgTable("company_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Policy details
  title: varchar("title").notNull(),
  description: text("description"),
  category: varchar("category"), // 'handbook', 'code_of_conduct', 'safety', 'pto', 'benefits', 'it_security', 'other'
  
  // Content
  contentMarkdown: text("content_markdown"), // Policy text in Markdown
  pdfUrl: varchar("pdf_url"), // Optional PDF version
  
  // Versioning
  version: varchar("version").notNull(), // '1.0', '1.1', '2.0'
  previousVersionId: varchar("previous_version_id").references((): any => companyPolicies.id),
  
  // Status
  status: policyStatusEnum("status").default("draft"),
  publishedAt: timestamp("published_at"),
  publishedBy: varchar("published_by"),
  
  // Acknowledgment requirements
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),
  acknowledgmentDeadlineDays: integer("acknowledgment_deadline_days").default(30), // Days to acknowledge from publish date
  
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("policies_workspace_idx").on(table.workspaceId),
  statusIdx: index("policies_status_idx").on(table.status),
}));

export const policyAcknowledgments = pgTable("policy_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  policyId: varchar("policy_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Acknowledgment
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
  signatureUrl: varchar("signature_url"), // E-signature image
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  // Policy version at time of acknowledgment (for audit trail)
  policyVersion: varchar("policy_version").notNull(),
  policyTitle: varchar("policy_title").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  policyEmployeeIdx: index("policy_acks_policy_employee_idx").on(table.policyId, table.employeeId),
  employeeIdx: index("policy_acks_employee_idx").on(table.employeeId),
}));

export const documentAccessLogs = pgTable("document_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  documentId: varchar("document_id").notNull(),

  // Access details
  accessedBy: varchar("accessed_by").notNull(),
  accessedByEmail: varchar("accessed_by_email").notNull(),
  accessedByRole: varchar("accessed_by_role").notNull(),

  accessType: varchar("access_type").notNull(), // 'view', 'download', 'print', 'share'

  // Context
  ipAddress: varchar("ip_address").notNull(),
  userAgent: text("user_agent"),

  // Audit compliance
  accessedAt: timestamp("accessed_at").notNull().defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_document_access_document").on(table.documentId),
  index("idx_document_access_user").on(table.accessedBy),
  index("idx_document_access_time").on(table.accessedAt),
]);

export const governanceApprovals = pgTable("governance_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  actionType: varchar("action_type").notNull(),
  requesterId: varchar("requester_id").notNull(),
  requesterRole: varchar("requester_role"),
  targetEntity: jsonb("target_entity"),
  parameters: jsonb("parameters"),
  reason: text("reason"),
  status: varchar("status").default('pending'),
  requiredApprovals: integer("required_approvals").default(1),
  approvals: jsonb("approvals").default(sql`'[]'::jsonb`),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIdx: index("governance_approvals_status_idx").on(table.status),
  requesterIdx: index("governance_approvals_requester_idx").on(table.requesterId),
  expiryIdx: index("governance_approvals_expiry_idx").on(table.expiresAt),
}));

export const customForms = pgTable("custom_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Form details
  name: varchar("name").notNull(), // "Consent for Sildenafil", "Background Check Authorization", etc.
  description: text("description"),
  category: varchar("category"), // 'onboarding', 'rms', 'compliance', 'custom'

  // Form template (JSON structure)
  // Example: { title: "...", sections: [{ heading: "...", fields: [...], consent: {...} }] }
  template: jsonb("template").notNull(),

  // E-signature configuration
  requiresSignature: boolean("requires_signature").default(false),
  signatureType: varchar("signature_type").default("typed_name"), // 'typed_name', 'drawn', 'uploaded'
  signatureText: text("signature_text"), // Legal text above signature field

  // Document upload configuration
  requiresDocuments: boolean("requires_documents").default(false),
  documentTypes: jsonb("document_types"), // [{ type: 'id', label: 'Government ID', required: true }, ...]
  maxDocuments: integer("max_documents").default(5),

  // Access control
  isActive: boolean("is_active").default(true),
  accessibleBy: jsonb("accessible_by"), // ['employee', 'manager', 'admin'] - who can fill out this form

  // Metadata
  createdBy: varchar("created_by"), // Platform admin/support who created it
  createdByRole: varchar("created_by_role"), // 'platform_admin', 'support_manager', 'support_staff'

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customFormSubmissions = pgTable("custom_form_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formId: varchar("form_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

  // Who submitted
  submittedBy: varchar("submitted_by"),
  submittedByType: varchar("submitted_by_type"), // 'employee', 'client', 'external'
  employeeId: varchar("employee_id"),

  // Form data (filled values)
  formData: jsonb("form_data").notNull(), // User's responses to all fields

  // E-signature data
  signatureData: jsonb("signature_data"), // { name: "...", signedAt: "...", ipAddress: "...", userAgent: "..." }
  hasAccepted: boolean("has_accepted").default(false), // Checkbox acceptance
  acceptedAt: timestamp("accepted_at"),

  // Document uploads
  documents: jsonb("documents"), // [{ type: 'id', fileName: '...', fileUrl: '...', uploadedAt: '...' }, ...]

  // Metadata
  ipAddress: varchar("ip_address"), // For legal audit trail
  userAgent: text("user_agent"),

  // Associated context
  onboardingTokenId: varchar("onboarding_token_id"), // If used during onboarding (token reference)
  reportSubmissionId: varchar("report_submission_id"), // If used in RMS

  // Status
  status: varchar("status").default("completed"), // 'draft', 'completed', 'archived'

  // Timestamps
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const termsAcknowledgments = pgTable("terms_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Link to conversation/ticket
  conversationId: varchar("conversation_id"),
  ticketNumber: varchar("ticket_number"), // Associated ticket if any

  // User identification
  userId: varchar("user_id"),
  userName: varchar("user_name").notNull(),
  userEmail: varchar("user_email").notNull(),
  workspaceId: varchar("workspace_id"),

  // E-Signature (initials)
  initialsProvided: varchar("initials_provided").notNull(), // User's initials as e-signature

  // Acceptance details
  acceptedTermsVersion: varchar("accepted_terms_version").default("1.0"), // Track version of terms
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),

  // Audit trail
  ipAddress: varchar("ip_address"), // IP at time of acceptance
  userAgent: varchar("user_agent"), // Browser info

  // Linked to ticket lifecycle
  ticketClosedAt: timestamp("ticket_closed_at"), // When associated ticket was closed
  isArchived: boolean("is_archived").default(false), // For long-term storage

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceIncidentReports = pgTable("service_incident_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User & workspace tracking
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"), // Null for anonymous
  
  // Service identification
  serviceKey: serviceKeyEnum("service_key").notNull(),
  errorType: errorTypeEnum("error_type").notNull(),
  
  // Criticality (for UI prioritization)
  isCriticalService: boolean("is_critical_service").default(true).notNull(), // false for email, object_storage
  
  // Error details
  userMessage: text("user_message"), // User-provided description
  errorMessage: text("error_message"), // Technical error message
  stackTrace: text("stack_trace"), // Error stack if available
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`), // { url, browser, viewport, etc. }
  
  // Screenshot/evidence
  screenshotUrl: varchar("screenshot_url"), // Object storage URL
  screenshotKey: varchar("screenshot_key"), // Object storage key for deletion
  
  // Support integration
  supportTicketId: varchar("support_ticket_id"),
  helpOsQueueId: varchar("help_os_queue_id"),
  
  // Status tracking
  status: incidentStatusEnum("status").default("submitted").notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolutionNotes: text("resolution_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("service_incident_reports_workspace_status_idx").on(table.workspaceId, table.status),
  index("service_incident_reports_service_key_idx").on(table.serviceKey),
  index("service_incident_reports_created_at_idx").on(table.createdAt),
]);

export const complianceReports = pgTable("compliance_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Report identification
  reportType: complianceReportTypeEnum("report_type").notNull(),
  reportTitle: varchar("report_title", { length: 300 }).notNull(),
  description: text("description"),
  
  // Time period covered
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Generation details
  status: complianceReportStatusEnum("status").default("generating"),
  generatedBy: varchar("generated_by"),
  generatedAt: timestamp("generated_at"),
  automatedGeneration: boolean("automated_generation").default(false),
  
  // Report data
  reportData: jsonb("report_data"), // Full report JSON data
  summaryStats: jsonb("summary_stats"), // Quick summary for listing
  
  // Regulatory references
  regulations: text("regulations").array().default(sql`ARRAY[]::text[]`), // ['FLSA §207', 'OSHA 29 CFR 1910']
  jurisdiction: varchar("jurisdiction", { length: 50 }), // 'US-FEDERAL', 'CA', 'NY', etc.
  
  // Export/download
  pdfUrl: varchar("pdf_url", { length: 500 }), // Object storage URL for PDF
  excelUrl: varchar("excel_url", { length: 500 }), // Optional Excel export
  
  // Compliance status
  hasViolations: boolean("has_violations").default(false),
  violationCount: integer("violation_count").default(0),
  criticalViolationCount: integer("critical_violation_count").default(0),
  potentialFinesUsd: decimal("potential_fines_usd", { precision: 12, scale: 2 }),
  
  // Retention
  retentionYears: integer("retention_years").default(7), // Legal retention requirement
  expiresAt: timestamp("expires_at"), // Auto-delete after retention period
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("cr_workspace_idx").on(table.workspaceId),
  index("cr_type_idx").on(table.reportType),
  index("cr_status_idx").on(table.status),
  index("cr_period_idx").on(table.periodStart, table.periodEnd),
  index("cr_generated_idx").on(table.generatedAt),
]);

export const orgDocumentSignatures = pgTable("org_document_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull(),
  
  // Internal or external signer
  signerUserId: varchar("signer_user_id"),
  signerEmail: varchar("signer_email"),
  signerName: varchar("signer_name"),
  
  signatureData: text("signature_data"), // Base64 signature image or typed name
  signatureType: varchar("signature_type", { length: 20 }), // 'drawn', 'typed'
  
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  // External signer verification
  verificationToken: varchar("verification_token"),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),

  // E-SIGN Act compliance — disclosure must be accepted before signing
  esignDisclosureAccepted: boolean("esign_disclosure_accepted").default(false),
  esignDisclosureAcceptedAt: timestamp("esign_disclosure_accepted_at"),

  workspaceId: varchar("workspace_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("org_doc_sig_document_idx").on(table.documentId),
  index("org_doc_sig_user_idx").on(table.signerUserId),
  index("org_doc_sig_email_idx").on(table.signerEmail),
]);

export const darReports = pgTable("dar_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id").notNull(),
  chatroomId: varchar("chatroom_id"),
  clientId: varchar("client_id"),
  
  // Report Info
  title: varchar("title", { length: 255 }).notNull(),
  summary: text("summary"), // AI-generated summary
  
  // Content
  content: text("content").notNull(), // Full report content (compiled from chatroom)
  photoCount: integer("photo_count").default(0),
  messageCount: integer("message_count").default(0),
  
  // Employee info
  employeeId: varchar("employee_id"),
  employeeName: varchar("employee_name", { length: 255 }),
  
  // Shift timing
  shiftStartTime: timestamp("shift_start_time").notNull(),
  shiftEndTime: timestamp("shift_end_time").notNull(),
  actualClockIn: timestamp("actual_clock_in"),
  actualClockOut: timestamp("actual_clock_out"),
  
  // Verification workflow
  status: varchar("status", { length: 50 }).default("draft").notNull(), // draft, pending_review, verified, sent, rejected
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),
  
  // Client delivery
  sentToClient: boolean("sent_to_client").default(false),
  sentAt: timestamp("sent_at"),
  clientAccessToken: varchar("client_access_token", { length: 100 }), // For client portal access
  clientViewedAt: timestamp("client_viewed_at"),
  
  // Audit integrity - critical data that cannot be deleted
  isAuditProtected: boolean("is_audit_protected").default(true),
  contentHash: varchar("content_hash", { length: 64 }), // SHA-256 for integrity verification

  photoManifest: jsonb("photo_manifest").default([]), // Chronological photo entries [{timestamp, url, caption, messageId, uploaderName}]

  // PDF generation
  pdfUrl: varchar("pdf_url", { length: 500 }),
  pdfGeneratedAt: timestamp("pdf_generated_at"),

  // Chain of Custody — PDF integrity metadata
  fileHash: varchar("file_hash", { length: 64 }),     // SHA-256 of actual PDF bytes
  fileSizeBytes: integer("file_size_bytes"),           // PDF file size in bytes
  pageCount: integer("page_count"),                    // Number of pages in PDF

  // AI Quality Review flags
  flaggedForReview: boolean("flagged_for_review").default(false),   // Manager review required
  forceUseDetected: boolean("force_use_detected").default(false),   // Use of force in report
  reviewNotes: text("review_notes"),                                 // AI review notes / flagged items

  // Manager approval chain (extended)
  approvedBy: varchar("approved_by"),       // userId of approver (maps to verifiedBy semantically)
  approvedAt: timestamp("approved_at"),

  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  escalatedTo: varchar("escalated_to"),     // userId of escalation target (org owner)
  escalatedAt: timestamp("escalated_at"),
  escalationReason: text("escalation_reason"),

  // Change request cycle
  changesRequestedBy: varchar("changes_requested_by"),
  changesRequestedAt: timestamp("changes_requested_at"),
  changesRequestedNotes: text("changes_requested_notes"),
  changesProvidedAt: timestamp("changes_provided_at"),

  // Legal hold (prevents deletion/modification)
  legalHold: boolean("legal_hold").default(false),
  legalHoldReason: text("legal_hold_reason"),
  legalHoldSetBy: varchar("legal_hold_set_by"),
  legalHoldSetAt: timestamp("legal_hold_set_at"),

  // Access log for chain of custody
  accessLog: jsonb("access_log").default([]), // [{accessedBy, accessedAt, action: 'viewed'|'downloaded'|'printed'|'forwarded'}]

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  trinityArticulated: boolean("trinity_articulated").default(false),
}, (table) => [
  index("dar_reports_shift_idx").on(table.shiftId),
  index("dar_reports_workspace_idx").on(table.workspaceId),
  index("dar_reports_client_idx").on(table.clientId),
  index("dar_reports_status_idx").on(table.status),
  index("dar_reports_legal_hold_idx").on(table.legalHold),
]);

export const complianceStates = pgTable("compliance_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateCode: varchar("state_code", { length: 2 }).notNull().unique(),
  stateName: varchar("state_name", { length: 100 }).notNull(),
  regulatoryBody: varchar("regulatory_body", { length: 200 }).notNull(),
  regulatoryBodyAcronym: varchar("regulatory_body_acronym", { length: 20 }),
  portalUrl: varchar("portal_url", { length: 500 }),
  status: complianceStateStatusEnum("status").default("active"),
  companyLicensePrefix: varchar("company_license_prefix", { length: 20 }),
  individualLicensePrefix: varchar("individual_license_prefix", { length: 20 }),
  requiredTrainingHours: integer("required_training_hours").default(0),
  armedTrainingHours: integer("armed_training_hours").default(0),
  renewalTrainingHours: integer("renewal_training_hours").default(0),
  licenseRenewalPeriodMonths: integer("license_renewal_period_months").default(24),
  renewalWarningDays: integer("renewal_warning_days").default(90),
  notes: text("notes"),
  effectiveDate: timestamp("effective_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // ── State Regulatory Knowledge Base (Auditor Portal) ──────────────────
  auditorEmailDomain: varchar("auditor_email_domain", { length: 200 }),
  keyStatutes: jsonb("key_statutes").$type<{ citation: string; description: string }[]>().default(sql`'[]'::jsonb`),
  licenseTypes: jsonb("license_types").$type<{ code: string; name: string; description: string; armedAllowed: boolean }[]>().default(sql`'[]'::jsonb`),
  minimumInsuranceCoverage: jsonb("minimum_insurance_coverage").$type<{ type: string; minimumAmount: number; description: string }[]>().default(sql`'[]'::jsonb`),
  uniformRequirement: text("uniform_requirement"),
  vehicleMarkingRequirement: text("vehicle_marking_requirement"),
  hardBlockRules: jsonb("hard_block_rules").$type<{ rule: string; citation: string; description: string }[]>().default(sql`'[]'::jsonb`),
  firearmQualificationRenewalMonths: integer("firearm_qualification_renewal_months").default(12),
  minimumAge: integer("minimum_age").default(18),
  continuingEducationRequired: boolean("continuing_education_required").default(false),
  continuingEducationHours: integer("continuing_education_hours").default(0),
  fallbackToManualVerification: boolean("fallback_to_manual_verification").default(false),
}, (table) => [
  uniqueIndex("compliance_states_code_idx").on(table.stateCode),
]);

export const complianceDocumentTypes = pgTable("compliance_document_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  typeCode: varchar("type_code", { length: 50 }).notNull().unique(),
  typeName: varchar("type_name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  imageType: complianceDocImageTypeEnum("image_type").default("front_only"),
  requiresFrontImage: boolean("requires_front_image").default(true),
  requiresBackImage: boolean("requires_back_image").default(false),
  requiresColor: boolean("requires_color").default(false),
  acceptedFormats: text("accepted_formats").array().default(sql`ARRAY['jpg', 'jpeg', 'png', 'pdf']::text[]`),
  maxFileSizeMb: integer("max_file_size_mb").default(10),
  minResolutionDpi: integer("min_resolution_dpi").default(150),
  hasExpirationDate: boolean("has_expiration_date").default(false),
  hasIssueDate: boolean("has_issue_date").default(false),
  hasDocumentNumber: boolean("has_document_number").default(false),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const complianceRequirements = pgTable("compliance_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateId: varchar("state_id").notNull(),
  requirementCode: varchar("requirement_code", { length: 50 }).notNull(),
  requirementName: varchar("requirement_name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  isRequired: boolean("is_required").default(true),
  isCritical: boolean("is_critical").default(false),
  hasExpiration: boolean("has_expiration").default(false),
  expirationWarningDays: integer("expiration_warning_days").default(60),
  documentRequired: boolean("document_required").default(true),
  documentTypeId: varchar("document_type_id"),
  allowsSubstitute: boolean("allows_substitute").default(false),
  substituteRequirementId: varchar("substitute_requirement_id"),
  substituteNote: text("substitute_note"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  stateSpecific: boolean("state_specific").default(false),
  stateCode: text("state_code"),
  scope: varchar("scope"),
}, (table) => [
  index("compliance_req_state_idx").on(table.stateId),
  uniqueIndex("compliance_req_code_idx").on(table.stateId, table.requirementCode),
]);

export const complianceDocuments = pgTable("compliance_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  complianceRecordId: varchar("compliance_record_id").notNull(),
  requirementId: varchar("requirement_id"),
  documentTypeId: varchar("document_type_id").notNull(),
  documentName: varchar("document_name", { length: 255 }).notNull(),
  documentNumber: varchar("document_number", { length: 100 }),
  issuingAuthority: varchar("issuing_authority", { length: 200 }),
  issuedDate: timestamp("issued_date"),
  expirationDate: timestamp("expiration_date"),
  imageSide: varchar("image_side", { length: 20 }).default("front"),
  isColorImage: boolean("is_color_image").default(true),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  storageUrl: text("storage_url"),
  thumbnailKey: varchar("thumbnail_key", { length: 500 }),
  thumbnailUrl: text("thumbnail_url"),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 50 }),
  fileSizeBytes: integer("file_size_bytes"),
  fileHashSha256: varchar("file_hash_sha256", { length: 64 }).notNull(),
  fileHashMd5: varchar("file_hash_md5", { length: 32 }),
  hashVerifiedAt: timestamp("hash_verified_at"),
  isLocked: boolean("is_locked").default(false),
  lockedAt: timestamp("locked_at"),
  lockedBy: varchar("locked_by"),
  lockReason: varchar("lock_reason", { length: 500 }),
  status: complianceDocStatusEnum("status").default("pending"),
  isSubstitute: boolean("is_substitute").default(false),
  substituteFor: varchar("substitute_for"),
  substituteNote: text("substitute_note"),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  uploadedBy: varchar("uploaded_by"),
  uploadIpAddress: varchar("upload_ip_address", { length: 45 }),
  uploadUserAgent: text("upload_user_agent"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("compliance_doc_workspace_idx").on(table.workspaceId),
  index("compliance_doc_employee_idx").on(table.employeeId),
  index("compliance_doc_record_idx").on(table.complianceRecordId),
  index("compliance_doc_hash_idx").on(table.fileHashSha256),
]);

export const complianceApprovals = pgTable("compliance_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  complianceRecordId: varchar("compliance_record_id").notNull(),
  approvalType: varchar("approval_type", { length: 50 }).notNull(),
  documentId: varchar("document_id"),
  status: complianceApprovalStatusEnum("status").default("pending"),
  priority: varchar("priority", { length: 20 }).default("normal"),
  requestedBy: varchar("requested_by"),
  requestedAt: timestamp("requested_at").defaultNow(),
  requestNotes: text("request_notes"),
  assignedTo: varchar("assigned_to"),
  assignedAt: timestamp("assigned_at"),
  decidedBy: varchar("decided_by"),
  decidedAt: timestamp("decided_at"),
  decision: varchar("decision", { length: 20 }),
  decisionNotes: text("decision_notes"),
  escalatedTo: varchar("escalated_to"),
  escalatedAt: timestamp("escalated_at"),
  escalationReason: text("escalation_reason"),
  dueDate: timestamp("due_date"),
  isOverdue: boolean("is_overdue").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  category: text("category"),
}, (table) => [
  index("compliance_approval_workspace_idx").on(table.workspaceId),
  index("compliance_approval_status_idx").on(table.status),
]);

export const complianceExpirations = pgTable("compliance_expirations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  complianceRecordId: varchar("compliance_record_id"),
  documentId: varchar("document_id"),
  expirationType: varchar("expiration_type", { length: 50 }).notNull(),
  expirationName: varchar("expiration_name", { length: 200 }).notNull(),
  expirationDate: timestamp("expiration_date").notNull(),
  warningDays: integer("warning_days").default(90),
  criticalDays: integer("critical_days").default(30),
  status: varchar("status", { length: 30 }).default("active"),
  warningNotificationSent: boolean("warning_notification_sent").default(false),
  warningNotificationDate: timestamp("warning_notification_date"),
  criticalNotificationSent: boolean("critical_notification_sent").default(false),
  criticalNotificationDate: timestamp("critical_notification_date"),
  expirationNotificationSent: boolean("expiration_notification_sent").default(false),
  expirationNotificationDate: timestamp("expiration_notification_date"),
  renewalStartedAt: timestamp("renewal_started_at"),
  renewedAt: timestamp("renewed_at"),
  renewedDocumentId: varchar("renewed_document_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("compliance_exp_workspace_idx").on(table.workspaceId),
  index("compliance_exp_date_idx").on(table.expirationDate),
]);

export const complianceAlerts = pgTable("compliance_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  complianceRecordId: varchar("compliance_record_id"),
  expirationId: varchar("expiration_id"),
  alertType: varchar("alert_type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  actionRequired: boolean("action_required").default(true),
  actionUrl: varchar("action_url", { length: 500 }),
  actionLabel: varchar("action_label", { length: 100 }),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  readBy: varchar("read_by"),
  isDismissed: boolean("is_dismissed").default(false),
  dismissedAt: timestamp("dismissed_at"),
  dismissedBy: varchar("dismissed_by"),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolutionNotes: text("resolution_notes"),
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  smsSent: boolean("sms_sent").default(false),
  smsSentAt: timestamp("sms_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("compliance_alert_workspace_idx").on(table.workspaceId),
  index("compliance_alert_severity_idx").on(table.severity),
]);

export const regulatorAccess = pgTable("regulator_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  stateId: varchar("state_id").notNull(),
  regulatorName: varchar("regulator_name", { length: 200 }).notNull(),
  regulatorEmail: varchar("regulator_email", { length: 255 }).notNull(),
  regulatorTitle: varchar("regulator_title", { length: 200 }),
  regulatorBadgeNumber: varchar("regulator_badge_number", { length: 50 }),
  regulatorOrganization: varchar("regulator_organization", { length: 200 }),
  accessLevel: regulatorAccessLevelEnum("access_level").default("view_only"),
  accessToken: varchar("access_token", { length: 100 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 64 }),
  grantedBy: varchar("granted_by"),
  grantedAt: timestamp("granted_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  employeeIds: text("employee_ids").array(),
  canViewAllEmployees: boolean("can_view_all_employees").default(false),
  canExportDocuments: boolean("can_export_documents").default(false),
  canGeneratePackets: boolean("can_generate_packets").default(false),
  lastAccessAt: timestamp("last_access_at"),
  accessCount: integer("access_count").default(0),
  lastIpAddress: varchar("last_ip_address", { length: 45 }),
  isRevoked: boolean("is_revoked").default(false),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
  revokeReason: text("revoke_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("regulator_access_workspace_idx").on(table.workspaceId),
  uniqueIndex("regulator_access_token_idx").on(table.accessToken),
]);

export const complianceScores = pgTable("compliance_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  stateId: varchar("state_id"),
  scoreType: varchar("score_type", { length: 30 }).notNull(),
  overallScore: integer("overall_score").notNull(),
  documentScore: integer("document_score"),
  expirationScore: integer("expiration_score"),
  auditReadinessScore: integer("audit_readiness_score"),
  trainingScore: integer("training_score"),
  totalRequirements: integer("total_requirements"),
  completedRequirements: integer("completed_requirements"),
  expiredItems: integer("expired_items").default(0),
  expiringWithin30Days: integer("expiring_within_30_days").default(0),
  expiringWithin90Days: integer("expiring_within_90_days").default(0),
  pendingApprovals: integer("pending_approvals").default(0),
  previousScore: integer("previous_score"),
  scoreChange: integer("score_change"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  calculatedBy: varchar("calculated_by", { length: 50 }),
  notes: text("notes"),

  updatedAt: timestamp("updated_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("compliance_score_workspace_idx").on(table.workspaceId),
  index("compliance_score_date_idx").on(table.calculatedAt),
]);

export const complianceChecklists = pgTable("compliance_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  complianceRecordId: varchar("compliance_record_id").notNull(),
  requirementId: varchar("requirement_id").notNull(),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  documentId: varchar("document_id"),
  isSubstituted: boolean("is_substituted").default(false),
  substituteDocumentId: varchar("substitute_document_id"),
  substituteNote: text("substitute_note"),
  expirationDate: timestamp("expiration_date"),
  isExpired: boolean("is_expired").default(false),
  expirationAlertId: varchar("expiration_alert_id"),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),
  isOverridden: boolean("is_overridden").default(false),
  overriddenBy: varchar("overridden_by"),
  overriddenAt: timestamp("overridden_at"),
  overrideReason: text("override_reason"),
  overrideExpiresAt: timestamp("override_expires_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("compliance_checklist_workspace_idx").on(table.workspaceId),
  index("compliance_checklist_employee_idx").on(table.employeeId),
  uniqueIndex("compliance_checklist_unique_idx").on(table.complianceRecordId, table.requirementId),
]);

export const officerReadiness = pgTable("officer_readiness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().unique(),
  workspaceId: varchar("workspace_id").notNull(),
  readinessScore: integer("readiness_score").notNull().default(100),
  underReview: boolean("under_review").default(false),
  activeComplaintCount: integer("active_complaint_count").default(0),
  scoreType: varchar("score_type", { length: 20 }).notNull().default('officer'),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_officer_readiness_employee").on(table.employeeId),
  index("idx_officer_readiness_workspace").on(table.workspaceId),
  index("idx_officer_readiness_score").on(table.readinessScore),
]);

export const officerComplaints = pgTable("officer_complaints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  filedByEmail: varchar("filed_by_email", { length: 255 }),
  filedByName: varchar("filed_by_name", { length: 150 }),
  source: varchar("source", { length: 30 }).notNull().default('email_reply'),
  severity: varchar("severity", { length: 20 }).notNull().default('medium'),
  complaintText: text("complaint_text").notNull(),
  trinitySummary: text("trinity_summary"),
  legalExposureFlags: jsonb("legal_exposure_flags").$type<string[]>().default(sql`'[]'::jsonb`),
  sopViolations: jsonb("sop_violations").$type<string[]>().default(sql`'[]'::jsonb`),
  recommendedAction: text("recommended_action"),
  status: varchar("status", { length: 30 }).notNull().default('open'),
  officerUnderReview: boolean("officer_under_review").default(true),
  notifiedCaseManagerAt: timestamp("notified_case_manager_at"),
  pointsDeducted: integer("points_deducted").default(0),
  scoreEventId: varchar("score_event_id"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_officer_complaints_employee").on(table.employeeId),
  index("idx_officer_complaints_workspace").on(table.workspaceId),
  index("idx_officer_complaints_status").on(table.status),
]);

export const officerGrievances = pgTable("officer_grievances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  scoreEventId: varchar("score_event_id").notNull(),
  complaintId: varchar("complaint_id"),
  status: varchar("status", { length: 30 }).notNull().default('submitted'),
  submittedReason: text("submitted_reason").notNull(),
  officerEvidence: jsonb("officer_evidence").$type<{type: string; description: string; url?: string}[]>().default(sql`'[]'::jsonb`),
  caseManagerStatement: text("case_manager_statement"),
  caseManagerEvidence: jsonb("case_manager_evidence").$type<{type: string; description: string}[]>().default(sql`'[]'::jsonb`),
  caseManagerUserId: varchar("case_manager_user_id"),
  trinityAnalysis: text("trinity_analysis"),
  trinityOpinion: text("trinity_opinion"),
  liaisonNotes: text("liaison_notes"),
  liaisonUserId: varchar("liaison_user_id"),
  finalVerdict: text("final_verdict"),
  finalVerdictBy: varchar("final_verdict_by"),
  pointsRestored: integer("points_restored").default(0),
  complaintDismissed: boolean("complaint_dismissed").default(false),
  autoDeniedReason: text("auto_denied_reason"),
  reviewRoomId: varchar("review_room_id"),
  resolvedAt: timestamp("resolved_at"),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_officer_grievances_employee").on(table.employeeId),
  index("idx_officer_grievances_workspace").on(table.workspaceId),
  index("idx_officer_grievances_status").on(table.status),
]);

export const complianceWindows = pgTable("compliance_windows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  entityType: complianceEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(), // workspaceId or employeeId
  workspaceId: varchar("workspace_id"),

  // The clock
  windowStartedAt: timestamp("window_started_at").defaultNow().notNull(),
  windowDeadline: timestamp("window_deadline").notNull(),   // start + 14 days
  appealDeadline: timestamp("appeal_deadline"),             // end of current month if appeal approved
  extensionDeadline: timestamp("extension_deadline"),       // final hard deadline post-appeal

  // Status
  isCompliant: boolean("is_compliant").default(false),
  isFrozen: boolean("is_frozen").default(false),
  frozenAt: timestamp("frozen_at"),

  // Appeal — one-time per entity (ever)
  appealUsed: boolean("appeal_used").default(false),
  appealSubmittedAt: timestamp("appeal_submitted_at"),
  appealGrantedAt: timestamp("appeal_granted_at"),
  appealDeniedAt: timestamp("appeal_denied_at"),
  appealGrantedBy: varchar("appeal_granted_by"),

  // Warning notification tracking
  warning11DaySentAt: timestamp("warning_11_day_sent_at"),
  warning13DaySentAt: timestamp("warning_13_day_sent_at"),
  freezeNotificationSentAt: timestamp("freeze_notification_sent_at"),

  // Required doc types for this entity (array of enforcementDocType values)
  requiredDocTypes: jsonb("required_doc_types").default([]),

  // Enforcement doc tracking (which required docs have been submitted)
  submittedDocTypes: jsonb("submitted_doc_types").default([]),
  approvedDocTypes: jsonb("approved_doc_types").default([]),

  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at"),
  docApprovalDates: jsonb("doc_approval_dates").default('{}'),
}, (table) => [
  index("idx_comp_windows_entity").on(table.entityType, table.entityId),
  index("idx_comp_windows_workspace").on(table.workspaceId),
  index("idx_comp_windows_deadline").on(table.windowDeadline),
  index("idx_comp_windows_frozen").on(table.isFrozen),
]);

export const documentRetentionLog = pgTable("document_retention_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referenceNumber: varchar("reference_number").notNull().unique(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  documentType: varchar("document_type").notNull(),
  documentTitle: varchar("document_title"),
  storageKey: varchar("storage_key"),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  retentionCategory: varchar("retention_category").notNull().default('standard'),
  retentionYears: integer("retention_years").notNull().default(7),
  purgeAt: timestamp("purge_at").notNull(),
  softDeletedAt: timestamp("soft_deleted_at"),
  softDeletedBy: varchar("soft_deleted_by"),
  softDeleteReason: varchar("soft_delete_reason"),
  hardPurgedAt: timestamp("hard_purged_at"),
  hardPurgedBy: varchar("hard_purged_by").default('system'),
  restoreRequestTicketId: varchar("restore_request_ticket_id"),
  restoredAt: timestamp("restored_at"),
  restoredBy: varchar("restored_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_doc_retention_entity").on(table.entityType, table.entityId),
  index("idx_doc_retention_workspace").on(table.workspaceId),
  index("idx_doc_retention_purge").on(table.purgeAt),
  index("idx_doc_retention_ref").on(table.referenceNumber),
  index("idx_doc_retention_soft_deleted").on(table.softDeletedAt),
]);

export const complianceRegistryEntries = pgTable("compliance_registry_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  orgName: varchar("org_name").notNull(),
  orgLicenseNumber: varchar("org_license_number"),
  stateCode: varchar("state_code").notNull(),
  stateName: varchar("state_name").notNull(),
  city: varchar("city"),
  county: varchar("county"),
  verifiedStatus: varchar("verified_status").notNull().default('verified'),
  lastVerifiedAt: timestamp("last_verified_at").defaultNow(),
  verificationBadge: varchar("verification_badge").default('coaileague_verified'),
  isPubliclyVisible: boolean("is_publicly_visible").default(true),
  includeInSearchDirectory: boolean("include_in_search_directory").default(true),
  certifications: jsonb("certifications").default([]),
  serviceTypes: jsonb("service_types").default([]),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("idx_compliance_registry_workspace").on(table.workspaceId),
  index("idx_compliance_registry_state").on(table.stateCode),
  index("idx_compliance_registry_status").on(table.verifiedStatus),
  index("idx_compliance_registry_visible").on(table.isPubliclyVisible),
]);

export const stateLicenseVerifications = pgTable("state_license_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  userId: varchar("user_id"),
  requestedBy: varchar("requested_by"),
  licenseType: varchar("license_type").notNull(),
  licenseNumber: varchar("license_number").notNull(),
  stateCode: varchar("state_code").notNull(),
  stateName: varchar("state_name"),
  licenseHolderName: varchar("license_holder_name"),
  verificationMethod: varchar("verification_method").notNull().default('manual'),
  verificationSource: varchar("verification_source"),
  apiEndpoint: varchar("api_endpoint"),
  status: varchar("status").notNull().default('pending'),
  isVerified: boolean("is_verified"),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),
  licenseExpiresAt: timestamp("license_expires_at"),
  rawApiResponse: jsonb("raw_api_response"),
  verificationNotes: text("verification_notes"),
  rejectionReason: text("rejection_reason"),
  referenceNumber: varchar("reference_number").unique(),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_state_lic_verify_workspace").on(table.workspaceId),
  index("idx_state_lic_verify_employee").on(table.employeeId),
  index("idx_state_lic_verify_license").on(table.licenseNumber),
  index("idx_state_lic_verify_state").on(table.stateCode),
  index("idx_state_lic_verify_status").on(table.status),
]);

export const documentTemplates = pgTable("document_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  contentType: varchar("content_type", { length: 50 }).notNull().default('html'),
  contentBody: text("content_body"),
  uploadedPdfUrl: text("uploaded_pdf_url"),
  mergeFields: jsonb("merge_fields").$type<Array<{ key: string; label: string; type: string; required?: boolean }>>().default(sql`'[]'::jsonb`),
  signatureFields: jsonb("signature_fields").$type<Array<{ id: string; label: string; signerRole: string; type: string; page?: number; x?: number; y?: number; width?: number; height?: number }>>().default(sql`'[]'::jsonb`),
  requiresCountersign: boolean("requires_countersign").notNull().default(false),
  countersignRoles: jsonb("countersign_roles").$type<string[]>().default(sql`'[]'::jsonb`),
  autoSendOnEvent: varchar("auto_send_on_event", { length: 100 }),
  expirationDays: integer("expiration_days"),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by"),
  templateType: varchar("template_type", { length: 50 }).default('template'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("doc_templates_workspace_idx").on(table.workspaceId),
  index("doc_templates_category_idx").on(table.category),
  index("doc_templates_active_idx").on(table.isActive),
]);

export const documentInstances = pgTable("document_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  templateId: varchar("template_id"),
  title: varchar("title", { length: 500 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default('draft'),
  generatedPdfUrl: text("generated_pdf_url"),
  signedPdfUrl: text("signed_pdf_url"),
  mergeData: jsonb("merge_data").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  relatedEntityType: varchar("related_entity_type", { length: 100 }),
  relatedEntityId: varchar("related_entity_id"),
  createdBy: varchar("created_by"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
  voidedAt: timestamp("voided_at"),
  voidedReason: text("voided_reason"),
  voidedBy: varchar("voided_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("doc_instances_workspace_idx").on(table.workspaceId),
  index("doc_instances_template_idx").on(table.templateId),
  index("doc_instances_status_idx").on(table.status),
  index("doc_instances_entity_idx").on(table.relatedEntityType, table.relatedEntityId),
]);

export const signatures = pgTable("signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull(),
  workspaceId: varchar("workspace_id"),
  fieldId: varchar("field_id", { length: 100 }).notNull(),
  signatureType: varchar("signature_type", { length: 20 }).notNull().default('draw'),
  signatureData: text("signature_data").notNull(),
  signedAt: timestamp("signed_at").defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  geolocation: jsonb("geolocation").$type<{ lat: number; lng: number; accuracy?: number }>(),


  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("signatures_request_idx").on(table.requestId),
]);

export const documentVault = pgTable("document_vault", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  documentInstanceId: varchar("document_instance_id"),
  // Universal Identification — Phase 57
  // Format: DOC-YYYYMMDD-NNNNN  e.g. DOC-20260329-00291
  documentNumber: varchar("document_number"), // Human-readable document reference
  title: varchar("title", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }),
  fileUrl: text("file_url").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  mimeType: varchar("mime_type", { length: 100 }),
  tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`),
  relatedEntityType: varchar("related_entity_type", { length: 100 }),
  relatedEntityId: varchar("related_entity_id"),
  uploadedBy: varchar("uploaded_by"),
  isSigned: boolean("is_signed").notNull().default(false),
  retentionUntil: timestamp("retention_until"),
  integrityHash: varchar("integrity_hash", { length: 64 }),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("doc_vault_workspace_idx").on(table.workspaceId),
  index("doc_vault_category_idx").on(table.category),
  index("doc_vault_entity_idx").on(table.relatedEntityType, table.relatedEntityId),
  index("doc_vault_instance_idx").on(table.documentInstanceId),
  index("doc_vault_number_idx").on(table.documentNumber),
  index("doc_vault_deleted_idx").on(table.deletedAt),
]);

export const incidentReports = pgTable("incident_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  incidentNumber: varchar("incident_number", { length: 50 }),
  reportedBy: varchar("reported_by"),
  shiftId: integer("shift_id"),
  siteId: integer("site_id"),
  title: varchar("title", { length: 500 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().default('medium'),
  incidentType: varchar("incident_type", { length: 100 }).notNull(),
  rawDescription: text("raw_description"),
  rawVoiceTranscript: text("raw_voice_transcript"),
  polishedDescription: text("polished_description"),
  polishedSummary: text("polished_summary"),
  trinityRevisionCount: integer("trinity_revision_count").notNull().default(0),
  trinityLegalFlags: jsonb("trinity_legal_flags").$type<Array<{ flag: string; severity: string; recommendation: string }>>().default(sql`'[]'::jsonb`),
  photos: jsonb("photos").$type<Array<{ url: string; caption?: string; takenAt?: string }>>().default(sql`'[]'::jsonb`),
  witnessStatements: jsonb("witness_statements").$type<Array<{ name: string; contact?: string; statement: string }>>().default(sql`'[]'::jsonb`),
  gpsLatitude: doublePrecision("gps_latitude"),
  gpsLongitude: doublePrecision("gps_longitude"),
  locationAddress: text("location_address"),
  status: varchar("status", { length: 50 }).notNull().default('draft'),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  sentToClientAt: timestamp("sent_to_client_at"),
  sentToClientBy: varchar("sent_to_client_by"),
  clientAcknowledgedAt: timestamp("client_acknowledged_at"),
  clientComments: text("client_comments"),
  finalPdfUrl: text("final_pdf_url"),
  documentVaultId: varchar("document_vault_id"),
  occurredAt: timestamp("occurred_at"),
  updatedAt: timestamp("updated_at").defaultNow(),

  // Phase I — Report Integrity (SHA-256 tamper-evident system)
  contentHash: varchar("content_hash", { length: 64 }),
  contentHashGeneratedAt: timestamp("content_hash_generated_at"),
  version: integer("version").notNull().default(1),
  versionHistory: jsonb("version_history").$type<Array<{
    version: number; contentHash: string; changedBy: string;
    changedAt: string; changeReason: string;
  }>>().default(sql`'[]'::jsonb`),
  coachingNote: text("coaching_note"),
  coachingNoteCreatedAt: timestamp("coaching_note_created_at"),

  // Phase H — Bilingual report handling
  originalLanguage: varchar("original_language", { length: 5 }).default('en'),
  originalText: text("original_text"),
  translatedText: text("translated_text"),
  translationMethod: varchar("translation_method", { length: 30 }),
  translationGeneratedAt: timestamp("translation_generated_at"),
  translationDisclaimer: text("translation_disclaimer").default(
    'AI-generated for reference only. Original text is the official evidentiary record. Request certified human translation for legal proceedings.'
  ),

  // Phase 13 — Inbound Email Pipeline
  // How this report was submitted: 'app' | 'email' | 'sms' | 'voice'
  submissionMethod: varchar("submission_method", { length: 30 }).default('app'),
  // ID of the inbound_email_log record that created this report (if submitted via email)
  inboundEmailLogId: varchar("inbound_email_log_id"),
}, (table) => [
  index("incident_reports_workspace_idx").on(table.workspaceId),
  index("incident_reports_severity_idx").on(table.severity),
  index("incident_reports_status_idx").on(table.status),
  index("incident_reports_site_idx").on(table.siteId),
  index("incident_reports_number_idx").on(table.incidentNumber),
  index("incident_reports_occurred_idx").on(table.occurredAt),
]);

export const rmsCases = pgTable("rms_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  caseNumber: varchar("case_number"),
  caseType: varchar("case_type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  status: varchar("status").default('open'),
  priority: varchar("priority").default('medium'),
  assignedTo: varchar("assigned_to"),
  reportedBy: varchar("reported_by"),
  siteId: varchar("site_id"),
  clientId: varchar("client_id"),
  closedAt: timestamp("closed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Recovered unmapped tables ─────────────────────────────────────────────

export const abuseViolations = pgTable("abuse_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // User & conversation tracking
  userId: varchar("user_id").notNull(),
  conversationId: varchar("conversation_id").notNull(),
  messageId: varchar("message_id"),

  // Violation details
  violationType: varchar("violation_type").notNull(), // 'profanity', 'threat', 'harassment', 'hate_speech'
  severity: varchar("severity").notNull(), // 'low', 'medium', 'high'
  detectedPatterns: text("detected_patterns").array(), // Matched abuse patterns
  originalMessage: text("original_message").notNull(), // The abusive message

  // Action taken
  action: varchar("action").notNull(), // 'warn', 'kick', 'ban'
  warningMessage: text("warning_message"), // Message shown to user

  // Staff involvement
  detectedBy: varchar("detected_by").default("system"), // 'system' or staff user ID
  actionTakenBy: varchar("action_taken_by"),

  // Violation count for this user (denormalized for quick access)
  userViolationCount: integer("user_violation_count").default(1).notNull(),

  // Ban tracking
  isBanned: boolean("is_banned").default(false),
  bannedUntil: timestamp("banned_until"), // Temporary ban expiry, null for permanent
  banReason: text("ban_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const trainingCertifications = pgTable("training_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Certification details
  name: varchar("name").notNull(),
  issuingOrganization: varchar("issuing_organization"),
  certificationNumber: varchar("certification_number"),

  // Dates
  issuedDate: timestamp("issued_date").notNull(),
  expiryDate: timestamp("expiry_date"),

  // Documentation
  certificateUrl: varchar("certificate_url"),
  verificationUrl: varchar("verification_url"),

  // Status
  status: varchar("status").default('active'), // 'active', 'expired', 'revoked'

  // Linked to course (if applicable)
  courseId: varchar("course_id"),
  enrollmentId: varchar("enrollment_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeIdx: index("training_certifications_employee_idx").on(table.employeeId),
  expiryIdx: index("training_certifications_expiry_idx").on(table.expiryDate),
  statusIdx: index("training_certifications_status_idx").on(table.status),
}));

export const backgroundCheckProviders = pgTable("background_check_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  providerName: varchar("provider_name").notNull(),
  apiEndpoint: text("api_endpoint"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("bgcheck_provider_ws_idx").on(table.workspaceId),
]);

export const employeeBackgroundChecks = pgTable("employee_background_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  employeeName: varchar("employee_name"),
  checkType: varchar("check_type").notNull().default("criminal"),
  status: varchar("status").notNull().default("pending"),
  result: varchar("result"),
  requestedAt: timestamp("requested_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
  requestedBy: varchar("requested_by"),
  notes: text("notes"),
}, (table) => [
  index("bgcheck_ws_idx").on(table.workspaceId),
  index("bgcheck_employee_idx").on(table.employeeId),
]);

export const employeeComplianceRecords = pgTable("employee_compliance_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  stateId: varchar("state_id"),
  companyLicenseNumber: varchar("company_license_number", { length: 50 }),
  addedToCompanyLicense: boolean("added_to_company_license").default(false),
  addedToCompanyLicenseAt: timestamp("added_to_company_license_at"),
  guardCardNumber: varchar("guard_card_number", { length: 50 }),
  guardCardExpirationDate: timestamp("guard_card_expiration_date"),
  guardCardStatus: varchar("guard_card_status", { length: 30 }),
  isArmed: boolean("is_armed").default(false),
  armedLicenseNumber: varchar("armed_license_number", { length: 50 }),
  armedLicenseExpiration: timestamp("armed_license_expiration"),
  overallStatus: varchar("overall_status", { length: 30 }).default("incomplete"),
  complianceScore: integer("compliance_score").default(0),
  lastAuditDate: timestamp("last_audit_date"),
  nextAuditDueDate: timestamp("next_audit_due_date"),
  totalRequirements: integer("total_requirements").default(0),
  completedRequirements: integer("completed_requirements").default(0),
  pendingRequirements: integer("pending_requirements").default(0),
  vaultLocked: boolean("vault_locked").default(false),
  vaultLockedAt: timestamp("vault_locked_at"),
  vaultLockedBy: varchar("vault_locked_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  requirementId: varchar("requirement_id"),
  requirementType: varchar("requirement_type"),
  status: varchar("status"),
  documentId: varchar("document_id"),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("employee_compliance_records_ws_idx").on(table.workspaceId),
  index("employee_compliance_records_employee_idx").on(table.employeeId),
]);

export const complianceAuditPackets = pgTable("compliance_audit_packets", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id"),
  packetName: varchar("packet_name"),
  packetType: varchar("packet_type"),
  status: varchar("status"),
  employeeIds: jsonb("employee_ids"),
  documentIds: jsonb("document_ids"),
  createdBy: varchar("created_by"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  dueDate: timestamp("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

export const complianceAuditTrail = pgTable("compliance_audit_trail", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id"),
  packetId: varchar("packet_id"),
  regulatorAccessId: varchar("regulator_access_id"),
  action: text("action"),
  performedBy: varchar("performed_by"),
  performedAt: timestamp("performed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const complianceRegulatorAccess = pgTable("compliance_regulator_access", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id"),
  regulatorName: varchar("regulator_name"),
  regulatorEmail: varchar("regulator_email"),
  regulatorAgency: varchar("regulator_agency"),
  accessToken: varchar("access_token"),
  accessType: varchar("access_type"),
  status: varchar("status"),
  expiresAt: timestamp("expires_at"),
  grantedBy: varchar("granted_by"),
  lastAccessedAt: timestamp("last_accessed_at"),
  ipAllowlist: jsonb("ip_allowlist"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const complianceStateRequirements = pgTable("compliance_state_requirements", {
  id: varchar("id").primaryKey(),
  stateCode: varchar("state_code"),
  stateName: varchar("state_name"),
  requirementType: varchar("requirement_type"),
  requirementName: varchar("requirement_name"),
  description: text("description"),
  effectiveDate: timestamp("effective_date"),
  expiryDate: timestamp("expiry_date"),
  penaltyAmount: decimal("penalty_amount"),
  enforcementAgency: varchar("enforcement_agency"),
  appliesToRoles: jsonb("applies_to_roles"),
  isActive: boolean("is_active"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const complianceScoreHistory = pgTable("compliance_score_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  stateCode: varchar("state_code", { length: 10 }),
  overallScore: integer("overall_score").notNull().default(0),
  documentsScore: integer("documents_score").default(0),
  licensingScore: integer("licensing_score").default(0),
  employeeComplianceScore: integer("employee_compliance_score").default(0),
  trainingScore: integer("training_score").default(0),
  isCompliant: boolean("is_compliant").default(false),
  isFrozen: boolean("is_frozen").default(false),
  hasAppeal: boolean("has_appeal").default(false),
  activeFindings: integer("active_findings").default(0),
  pendingDocuments: integer("pending_documents").default(0),
  approvedDocuments: integer("approved_documents").default(0),
  scoringMethod: varchar("scoring_method", { length: 50 }).default('automated'),
  triggerEvent: varchar("trigger_event", { length: 100 }),
  notes: text("notes"),
  scoredAt: timestamp("scored_at").defaultNow(),
});
export const insertComplianceScoreHistorySchema = createInsertSchema(complianceScoreHistory).omit({ id: true, scoredAt: true });
export type InsertComplianceScoreHistory = z.infer<typeof insertComplianceScoreHistorySchema>;
export type ComplianceScoreHistory = typeof complianceScoreHistory.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// REGULATORY VIOLATIONS — WORM-Locked Hard Block Override Records
// Every time a hard block (expired license, no firearms qual, wrong
// license class) is manually overridden, an immutable record is created
// here. No UPDATE or DELETE is ever permitted on these rows.
// ═══════════════════════════════════════════════════════════════

export const regulatoryViolations = pgTable("regulatory_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  officerId: varchar("officer_id").notNull(),
  overrideByUserId: varchar("override_by_user_id").notNull(),
  violationType: varchar("violation_type", { length: 100 }).notNull(),
  shiftId: varchar("shift_id"),
  siteId: varchar("site_id"),
  clientId: varchar("client_id"),
  officerLicenseNumber: varchar("officer_license_number", { length: 100 }),
  licenseExpirationDate: date("license_expiration_date"),
  shiftDate: date("shift_date"),
  shiftStartTime: varchar("shift_start_time", { length: 10 }),
  shiftEndTime: varchar("shift_end_time", { length: 10 }),
  overrideReason: text("override_reason").notNull(),
  overrideTimestamp: timestamp("override_timestamp").notNull().defaultNow(),
  wasCorreeted: boolean("was_corrected").default(false),
  correctionTimestamp: timestamp("correction_timestamp"),
  stateLicenseAuthority: varchar("state_license_authority", { length: 200 }),
  regulatoryReference: varchar("regulatory_reference", { length: 500 }),
  stateCode: varchar("state_code", { length: 2 }),
  // WORM lock — this row can never be updated or deleted. Always true.
  isWormLocked: boolean("is_worm_locked").notNull().default(true),
  // Notification tracking
  ownerNotifiedAt: timestamp("owner_notified_at"),
  ownerNotificationEmail: varchar("owner_notification_email", { length: 255 }),
  reportIncluded: boolean("report_included").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("regulatory_violations_workspace_idx").on(table.workspaceId),
  index("regulatory_violations_officer_idx").on(table.officerId),
  index("regulatory_violations_shift_idx").on(table.shiftId),
  index("regulatory_violations_type_idx").on(table.violationType),
  index("regulatory_violations_created_idx").on(table.createdAt),
]);

export const insertRegulatoryViolationSchema = createInsertSchema(regulatoryViolations).omit({
  id: true,
  createdAt: true,
  isWormLocked: true,
});
export type InsertRegulatoryViolation = z.infer<typeof insertRegulatoryViolationSchema>;
export type RegulatoryViolation = typeof regulatoryViolations.$inferSelect;

// ── Auditor Portal Verification Requests (6-step flow) ────────────────────
// A public-facing request from a state auditor to access a specific org.
// Requires email domain verification + PDF analysis + org_owner 24h notice.

export const auditorVerificationRequests = pgTable("auditor_verification_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  step: integer("step").notNull().default(1),
  // Step 1 — Company lookup
  companyLicenseNumber: varchar("company_license_number", { length: 100 }).notNull(),
  // Step 2 — Auditor credentials
  auditorFullName: varchar("auditor_full_name", { length: 200 }),
  auditorAgencyName: varchar("auditor_agency_name", { length: 200 }),
  auditorEmail: varchar("auditor_email", { length: 255 }),
  auditorBadgeNumber: varchar("auditor_badge_number", { length: 100 }),
  auditPurpose: varchar("audit_purpose", { length: 50 }),
  authorizationDocUrl: varchar("authorization_doc_url", { length: 500 }),
  // Step 3 — Trinity verification
  emailDomainVerified: boolean("email_domain_verified").default(false),
  pdfVerified: boolean("pdf_verified").default(false),
  pdfExtractedName: varchar("pdf_extracted_name", { length: 200 }),
  pdfExtractedLicenseNumber: varchar("pdf_extracted_license_number", { length: 100 }),
  pdfExtractedDate: date("pdf_extracted_date"),
  verificationNotes: text("verification_notes"),
  status: varchar("status", { length: 50 }).notNull().default('pending'),
  // Step 4 — Org_owner notification & dispute window
  ownerNotifiedAt: timestamp("owner_notified_at"),
  ownerDisputedAt: timestamp("owner_disputed_at"),
  ownerDisputeReason: text("owner_dispute_reason"),
  disputeResolvedAt: timestamp("dispute_resolved_at"),
  accessGrantedAt: timestamp("access_granted_at"),
  // Step 5 — Auditor account
  auditorAccountId: varchar("auditor_account_id"),
  tempPasswordSentAt: timestamp("temp_password_sent_at"),
  // Step 6 — Completion
  auditReportUrl: varchar("audit_report_url", { length: 500 }),
  auditReportUploadedAt: timestamp("audit_report_uploaded_at"),
  trinityCorrectiveActionPlan: text("trinity_corrective_action_plan"),
  correctiveActionSentAt: timestamp("corrective_action_sent_at"),
  // Expiry
  accessExpiresAt: timestamp("access_expires_at"),
  autoDeactivatedAt: timestamp("auto_deactivated_at"),
  stateCode: varchar("state_code", { length: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("auditor_verif_workspace_idx").on(table.workspaceId),
  index("auditor_verif_email_idx").on(table.auditorEmail),
  index("auditor_verif_status_idx").on(table.status),
]);

export const insertAuditorVerificationRequestSchema = createInsertSchema(auditorVerificationRequests).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAuditorVerificationRequest = z.infer<typeof insertAuditorVerificationRequestSchema>;
export type AuditorVerificationRequest = typeof auditorVerificationRequests.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// PHASE B — SMS Consent System (Bryan-approved, 2026 sprint)
// ═══════════════════════════════════════════════════════════════

export const smsConsent = pgTable("sms_consent", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  // Consent status
  consentGiven: boolean("consent_given").notNull().default(false),
  consentGivenAt: timestamp("consent_given_at"),
  consentIpAddress: varchar("consent_ip_address", { length: 45 }),
  consentMethod: varchar("consent_method", { length: 50 }).default('onboarding_form'),
  // Opt-out tracking
  optOutAt: timestamp("opt_out_at"),
  optOutMethod: varchar("opt_out_method", { length: 50 }), // reply_stop | user_settings
  // Alert level
  emergencyAlertsOnly: boolean("emergency_alerts_only").notNull().default(false),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sms_consent_user_idx").on(table.userId),
  index("sms_consent_phone_idx").on(table.phoneNumber),
  index("sms_consent_workspace_idx").on(table.workspaceId),
]);

export const smsAttemptLog = pgTable("sms_attempt_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  workspaceId: varchar("workspace_id"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  messageType: varchar("message_type", { length: 100 }).notNull(),
  sent: boolean("sent").notNull().default(false),
  consentVerified: boolean("consent_verified").notNull().default(false),
  reasonNotSent: varchar("reason_not_sent", { length: 200 }),
  twilioMessageId: varchar("twilio_message_id"),
  sentAt: timestamp("sent_at").defaultNow(),
}, (table) => [
  index("sms_attempt_log_user_idx").on(table.userId),
  index("sms_attempt_log_sent_at_idx").on(table.sentAt),
]);

// ═══════════════════════════════════════════════════════════════
// PHASE C — Emergency Events (Bryan-approved, 2026 sprint)
// ═══════════════════════════════════════════════════════════════

export const emergencyEvents = pgTable("emergency_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  officerId: varchar("officer_id").notNull(),
  // Panic trigger data
  panicActivatedAt: timestamp("panic_activated_at").notNull().defaultNow(),
  gpsLatitude: doublePrecision("gps_latitude"),
  gpsLongitude: doublePrecision("gps_longitude"),
  gpsAccuracyMeters: doublePrecision("gps_accuracy_meters"),
  siteId: varchar("site_id"),
  siteAddress: text("site_address"),
  // Notification targets
  onCallSupervisorId: varchar("on_call_supervisor_id"),
  onCallSupervisorPhone: varchar("on_call_supervisor_phone", { length: 20 }),
  managerIds: jsonb("manager_ids").$type<string[]>().default(sql`'[]'::jsonb`),
  ownerId: varchar("owner_id"),
  // Shift context
  lastCheckInAt: timestamp("last_check_in_at"),
  activeShiftId: varchar("active_shift_id"),
  // Emergency chatroom
  emergencyChatroomId: varchar("emergency_chatroom_id"),
  // Resolution tracking
  firstAcknowledgmentAt: timestamp("first_acknowledgment_at"),
  firstAcknowledgedBy: varchar("first_acknowledged_by"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  responseTimeSeconds: integer("response_time_seconds"),
  // Comms log
  smsAttempts: jsonb("sms_attempts").$type<Array<{
    targetId: string; phone: string; sent: boolean; sentAt: string; reason?: string;
  }>>().default(sql`'[]'::jsonb`),
  escalationCount: integer("escalation_count").notNull().default(0),
  // Status
  status: varchar("status", { length: 30 }).notNull().default('active'), // active | acknowledged | resolved
  incidentReportId: varchar("incident_report_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("emergency_events_workspace_idx").on(table.workspaceId),
  index("emergency_events_officer_idx").on(table.officerId),
  index("emergency_events_status_idx").on(table.status),
  index("emergency_events_activated_idx").on(table.panicActivatedAt),
]);

export type EmergencyEvent = typeof emergencyEvents.$inferSelect;
export type SmsConsent = typeof smsConsent.$inferSelect;
export type SmsAttemptLog = typeof smsAttemptLog.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// state_regulatory_config
// Multi-state architecture prep. Stores licensing authority, license types,
// CE requirements, and renewal periods per state. HelpAI and license
// verification pull from this table instead of hardcoded Texas logic.
// Seeded with Texas at launch. Other states added as markets expand.
// ─────────────────────────────────────────────────────────────────────────────
export const stateRegulatoryConfig = pgTable("state_regulatory_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateCode: varchar("state_code", { length: 2 }).notNull().unique(), // TX, CA, FL, etc.
  stateName: varchar("state_name", { length: 100 }).notNull(),
  licensingAuthority: varchar("licensing_authority", { length: 200 }).notNull(),
  licensingAuthorityUrl: text("licensing_authority_url"),
  licenseTypes: jsonb("license_types").$type<Array<{
    code: string;
    name: string;
    description: string;
    armedAllowed: boolean;
    renewalPeriodMonths: number;
    initialTrainingHours: number;
  }>>().default(sql`'[]'::jsonb`),
  ceRequirements: jsonb("ce_requirements").$type<{
    hoursPerRenewal: number;
    armedAdditionalHours: number;
    courseTypes: string[];
    notes: string;
  }>().default(sql`'{}'::jsonb`),
  renewalPeriodMonths: integer("renewal_period_months").default(24),
  fingerprintRequired: boolean("fingerprint_required").default(true),
  backgroundCheckRequired: boolean("background_check_required").default(true),
  minimumAge: integer("minimum_age").default(18),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("state_reg_code_idx").on(table.stateCode),
  index("state_reg_active_idx").on(table.active),
]);
export const insertStateRegulatoryConfigSchema = createInsertSchema(stateRegulatoryConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStateRegulatoryConfig = z.infer<typeof insertStateRegulatoryConfigSchema>;
export type StateRegulatoryConfig = typeof stateRegulatoryConfig.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// post_requirements
// Defines credential requirements per post/site. Used to block shift assignment
// when the assigned officer's credentials don't match the post requirements.
// ─────────────────────────────────────────────────────────────────────────────
export const postRequirements = pgTable("post_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  postName: varchar("post_name", { length: 200 }).notNull(),
  postCode: varchar("post_code", { length: 50 }),
  requireArmed: boolean("require_armed").default(false),
  requiredLicenseTypes: jsonb("required_license_types").$type<string[]>().default(sql`'[]'::jsonb`),
  requiredCertifications: jsonb("required_certifications").$type<Array<{
    name: string;
    required: boolean;
  }>>().default(sql`'[]'::jsonb`),
  minimumExperienceMonths: integer("minimum_experience_months").default(0),
  minimumYearsOld: integer("minimum_years_old").default(18),
  uniformRequired: varchar("uniform_required", { length: 100 }),
  equipmentRequired: jsonb("equipment_required").$type<string[]>().default(sql`'[]'::jsonb`),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("post_req_workspace_idx").on(table.workspaceId),
  index("post_req_site_idx").on(table.siteId),
  index("post_req_active_idx").on(table.active),
]);
export const insertPostRequirementSchema = createInsertSchema(postRequirements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPostRequirement = z.infer<typeof insertPostRequirementSchema>;
export type PostRequirement = typeof postRequirements.$inferSelect;

export * from './extended';
