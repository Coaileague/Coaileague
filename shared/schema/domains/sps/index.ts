// ═══════════════════════════════════════════════════════════════
// Domain 16: SPS Document Management System
// ═══════════════════════════════════════════════════════════════
// Tables: sps_documents, sps_negotiation_threads, sps_negotiation_messages,
//         sps_document_safe, sps_state_requirements
// Routes: /api/sps/*, /api/public/sps/*
// Purpose: DocuSign-style document execution for Statewide Protective Services

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ── sps_documents ─────────────────────────────────────────────────────────────
// Primary document record for both employee packets and client contracts.
// Stores all party info, form data (JSONB), signatures (JSONB), and audit log.
export const spsDocuments = pgTable('sps_documents', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),

  documentType: text('document_type').notNull(), // 'employee_packet' | 'client_contract' | 'proposal'
  documentNumber: text('document_number').unique().notNull(), // EMP-2025-0042, CON-2025-0017, PRO-2025-0003
  status: text('status').notNull().default('draft'), // draft|sent|viewed|partially_signed|completed|voided|expired

  // Access token for external signing (JWT, hashed)
  accessToken: text('access_token'),
  accessTokenHash: text('access_token_hash'),
  expiresAt: timestamp('expires_at'),

  // Parties
  orgSignerName: text('org_signer_name'),
  orgSignerEmail: text('org_signer_email'),
  recipientName: text('recipient_name').notNull(),
  recipientEmail: text('recipient_email').notNull(),

  // Employee-specific fields
  employeeDob: date('employee_dob'),
  employeePob: text('employee_pob'), // place of birth
  employeeSsnLast4: text('employee_ssn_last4'), // last 4 only in plaintext
  employeeSsnEncrypted: text('employee_ssn_encrypted'), // AES-256 encrypted full SSN
  employeeAddress: text('employee_address'),
  employeePhone: text('employee_phone'),
  guardLicenseNumber: text('guard_license_number'),
  guardLicenseExpiry: date('guard_license_expiry'),
  guardLicenseType: text('guard_license_type'), // commissioned|non_commissioned|armed|unarmed
  assignmentSite: text('assignment_site'),
  assignmentAddress: text('assignment_address'),
  hireDate: date('hire_date'),
  position: text('position'),
  payRate: decimal('pay_rate', { precision: 8, scale: 2 }),
  uniformSize: text('uniform_size'),

  // Client-specific fields
  clientCompanyName: text('client_company_name'),
  clientAddress: text('client_address'),
  clientContactName: text('client_contact_name'),
  clientEin: text('client_ein'),
  serviceType: text('service_type'), // armed|unarmed|ppo|patrol|mixed|event
  ratePrimary: decimal('rate_primary', { precision: 8, scale: 2 }),
  rateAdditional: decimal('rate_additional', { precision: 8, scale: 2 }),
  serviceLocation: text('service_location'),
  serviceHours: text('service_hours'),
  contractStartDate: date('contract_start_date'),
  contractTerm: text('contract_term'),
  officersRequired: integer('officers_required'),

  // All form fields as JSON (section-keyed)
  formData: jsonb('form_data').default({}),

  // Signatures: { field_id: { svgData, timestamp, ip, userAgent, typed } }
  signatures: jsonb('signatures').default({}),
  // Initials: { field_id: { svgData, timestamp, ip } }
  initials: jsonb('initials').default({}),

  // Audit trail: [{ action, field_id, timestamp, ip, userAgent }]
  auditLog: jsonb('audit_log').default([]),

  // ID Verification
  idUploadUrl: text('id_upload_url'),
  idVerificationStatus: text('id_verification_status').default('pending'), // pending|verified|failed|manual_review
  idVerificationData: jsonb('id_verification_data').default({}), // Trinity scan results

  // State compliance
  stateCode: text('state_code').default('TX'),

  // Linked negotiation thread (for contracts generated from proposals)
  negotiationThreadId: varchar('negotiation_thread_id'),

  // Timestamps
  sentAt: timestamp('sent_at'),
  viewedAt: timestamp('viewed_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── sps_negotiation_threads ────────────────────────────────────────────────────
// Client ↔ Org proposal negotiation threads (before contract generation).
export const spsNegotiationThreads = pgTable('sps_negotiation_threads', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),

  documentId: varchar('document_id'), // linked sps_documents proposal record
  proposalNumber: text('proposal_number').unique().notNull(), // PRO-2025-0003

  clientName: text('client_name').notNull(),
  clientEmail: text('client_email').notNull(),
  clientPhone: text('client_phone'),
  clientCompanyName: text('client_company_name'),
  serviceLocation: text('service_location'),

  // Proposal details snapshot
  proposalData: jsonb('proposal_data').default({}), // rates, services, schedule, legal block

  // Negotiation status
  status: text('status').notNull().default('active'), // active|agreed|declined|converted_to_contract|expired

  // Final agreed terms snapshot (populated on agreement detection)
  agreedTerms: jsonb('agreed_terms').default({}),

  // Public access token for client to reply (no login required)
  clientAccessToken: text('client_access_token'),

  // Agreement detection flag
  agreementDetected: boolean('agreement_detected').default(false),
  agreementDetectedAt: timestamp('agreement_detected_at'),

  // Converted contract reference
  contractDocumentId: varchar('contract_document_id'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── sps_negotiation_messages ───────────────────────────────────────────────────
// Individual messages in a negotiation thread.
export const spsNegotiationMessages = pgTable('sps_negotiation_messages', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar('thread_id').notNull(), // FK → sps_negotiation_threads.id

  senderType: text('sender_type').notNull(), // 'org' | 'client'
  senderName: text('sender_name').notNull(),
  senderEmail: text('sender_email').notNull(),

  // Message content
  messageRaw: text('message_raw').notNull(), // original typed message
  messageAiEnhanced: text('message_ai_enhanced'), // Trinity-polished version
  aiSuggestionUsed: boolean('ai_suggestion_used').default(false),

  // Extracted terms from client messages (Trinity NLP)
  proposedTerms: jsonb('proposed_terms').default({}), // { rates, schedule, officerCount, specialRequests }

  // Agreement signal detected in this message
  agreementSignalDetected: boolean('agreement_signal_detected').default(false),

  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── sps_document_safe ─────────────────────────────────────────────────────────
// Sealed/completed documents storage (references to object storage URLs).
export const spsDocumentSafe = pgTable('sps_document_safe', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  documentId: varchar('document_id').notNull(), // FK → sps_documents.id

  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(), // storage URL or data URI
  fileType: text('file_type').notNull(), // signed_packet|signed_contract|id_upload|guard_card|supporting_doc|proposal_pdf
  fileSize: integer('file_size'), // bytes
  mimeType: text('mime_type'),

  uploadedBy: text('uploaded_by'),
  metadata: jsonb('metadata').default({}),

  // SHA-256 integrity hash
  integrityHash: text('integrity_hash'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── sps_state_requirements ────────────────────────────────────────────────────
// State regulatory requirements lookup table.
// Pre-seeded with Texas (TX) requirements.
export const spsStateRequirements = pgTable('sps_state_requirements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  stateCode: text('state_code').notNull(), // 'TX', 'CA', etc.
  documentType: text('document_type').notNull(), // 'employee_packet' | 'client_contract'

  requiredFields: jsonb('required_fields').notNull().default([]), // string[]
  requiredDocuments: jsonb('required_documents').notNull().default([]), // string[]

  regulatoryBody: text('regulatory_body'),
  licenseRenewalPeriodMonths: integer('license_renewal_period_months'),
  agencyLicenseNumber: text('agency_license_number'), // C11608501 for SPS
  topsPortalUrl: text('tops_portal_url'),
  notes: text('notes'),
  effectiveDate: date('effective_date'),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Insert Schemas ─────────────────────────────────────────────────────────────
export const insertSpsDocumentSchema = createInsertSchema(spsDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpsDocument = z.infer<typeof insertSpsDocumentSchema>;
export type SpsDocument = typeof spsDocuments.$inferSelect;

export const insertSpsNegotiationThreadSchema = createInsertSchema(spsNegotiationThreads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpsNegotiationThread = z.infer<typeof insertSpsNegotiationThreadSchema>;
export type SpsNegotiationThread = typeof spsNegotiationThreads.$inferSelect;

export const insertSpsNegotiationMessageSchema = createInsertSchema(spsNegotiationMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertSpsNegotiationMessage = z.infer<typeof insertSpsNegotiationMessageSchema>;
export type SpsNegotiationMessage = typeof spsNegotiationMessages.$inferSelect;

export const insertSpsDocumentSafeSchema = createInsertSchema(spsDocumentSafe).omit({
  id: true,
  createdAt: true,
});
export type InsertSpsDocumentSafe = z.infer<typeof insertSpsDocumentSafeSchema>;
export type SpsDocumentSafe = typeof spsDocumentSafe.$inferSelect;

export const insertSpsStateRequirementSchema = createInsertSchema(spsStateRequirements).omit({
  id: true,
  updatedAt: true,
});
export type InsertSpsStateRequirement = z.infer<typeof insertSpsStateRequirementSchema>;
export type SpsStateRequirement = typeof spsStateRequirements.$inferSelect;

export * from './extended';
