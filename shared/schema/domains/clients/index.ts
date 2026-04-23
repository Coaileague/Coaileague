// ═══════════════════════════════════════════════════════════════
// Domain 10 of 15: Clients & Sites
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 16

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, real, date, time, index, uniqueIndex, primaryKey, unique, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  clientContractAuditActionEnum,
  clientContractDocTypeEnum,
  clientContractStatusEnum,
  clientDeactivationReasonEnum,
  clientPortalReportStatusEnum,
  clientPortalReportTypeEnum,
  clientPortalSentimentEnum,
  collectionsStatusEnum,
  partnerConnectionStatusEnum,
  partnerTypeEnum,
  shiftOrderPhotoFrequencyEnum,
  shiftOrderPriorityEnum,
} from '../../enums';

export const clientPortalInviteTokens = pgTable("client_portal_invite_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tokenIdx: index("client_portal_invite_tokens_token_idx").on(table.token),
  clientIdx: index("client_portal_invite_tokens_client_idx").on(table.clientId),
}));

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"), // Link client to user account
  
  // ============================================================================
  // UNIVERSAL IDENTIFICATION SYSTEM — Phase 57
  // Format: CLT-[ORG_SHORT]-[NNNNN]  e.g. CLT-ACM-00891
  // ============================================================================
  clientNumber: varchar("client_number"), // e.g. CLT-ACM-00891 — canonical human-readable ID
  // Phase 23 — identity PIN. bcrypt hash of a 4–8 digit code the client sets
  // during onboarding. Required secondary factor when a client identifies
  // themselves to Trinity or a support agent by clientNumber.
  clientPinHash: varchar("client_pin_hash"),

  // External ID (CLI-XXXX-NNNNN format)
  clientCode: varchar("client_code"),
  quickbooksClientId: varchar("quickbooks_client_id"), // External QB client ID for billing sync
  qboSyncToken: varchar("qbo_sync_token"), // QuickBooks sync token for change detection
  quickbooksSyncStatus: varchar("quickbooks_sync_status").default("pending"), // pending, synced, error, orphaned
  quickbooksLastSync: timestamp("quickbooks_last_sync"), // Last successful sync timestamp
  quickbooksRealmId: varchar("quickbooks_realm_id"), // QB company realmId - scopes IDs per environment

  // Client information
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  companyName: varchar("company_name"),
  category: varchar("category").default("other"),
  email: varchar("email"),
  phone: varchar("phone"),
  
  // Enhanced address for Trinity scheduling (driving distance calculations)
  address: text("address"), // Full formatted address or street line 1
  addressLine2: varchar("address_line_2"), // Suite, unit, building number
  city: varchar("city"),
  state: varchar("state"),
  postalCode: varchar("postal_code"),
  zipCode: varchar("zip_code"), // Legacy field — same data as postalCode; kept for backward compatibility
  country: varchar("country").default("US"),

  // Job site location (for geo-compliance and Trinity driving distance)
  latitude: decimal("latitude", { precision: 10, scale: 7 }), // Job site GPS latitude
  longitude: decimal("longitude", { precision: 10, scale: 7 }), // Job site GPS longitude

  // Contract and Billing (for Trinity scheduling and invoicing)
  contractRate: decimal("contract_rate", { precision: 10, scale: 2 }), // Base billing rate per hour
  billableHourlyRate: decimal("billable_hourly_rate", { precision: 10, scale: 2 }), // Canonical per-hour bill rate for immutable billing flows
  contractRateType: varchar("contract_rate_type").default("hourly"), // 'hourly', 'daily', 'weekly', 'monthly', 'project'
  billingEmail: varchar("billing_email"),                              // Where invoices are emailed
  taxId: varchar("tax_id"),                                            // Client EIN/tax ID for records
  isTaxExempt: boolean("is_tax_exempt").default(false),
  taxExemptCertificate: varchar("tax_exempt_certificate"),             // Certificate number if tax exempt
  stripeCustomerId: varchar("stripe_customer_id"),                     // Stripe customer ID for automated billing
  preferredPaymentMethod: varchar("preferred_payment_method").default("invoice"), // 'invoice', 'ach', 'check', 'wire', 'credit_card'
  autoSendInvoice: boolean("auto_send_invoice").default(true),         // Auto-email invoice when generated
  paymentTermsDays: integer("payment_terms_days").default(30),         // Net days for payment (e.g. 30 = Net 30)
  billingFrequency: varchar("billing_frequency").default("monthly"),    // Canonical billing cadence used by persistence-safe invoice settings
  billingCycle: varchar("billing_cycle").default("monthly"),           // 'weekly' | 'biweekly' | 'monthly' — invoice generation frequency per client

  // Client-Specific Rate Multiplier Overrides (for enterprise contracts)
  // If set, these override workspace defaults for this client's billing
  clientOvertimeMultiplier: decimal("client_overtime_multiplier", { precision: 5, scale: 2 }), // Override workspace OT multiplier
  clientHolidayMultiplier: decimal("client_holiday_multiplier", { precision: 5, scale: 2 }), // Override workspace holiday multiplier

  // Security Industry: Post Orders & POC (Point of Contact)
  postOrders: text("post_orders"), // Post orders / standing instructions for security sites
  pocName: varchar("poc_name"), // Point of Contact name at client site
  pocPhone: varchar("poc_phone"), // POC phone number
  pocEmail: varchar("poc_email"), // POC email address
  pocTitle: varchar("poc_title"), // POC job title

  // Accounts Payable (AP) Contact — who receives invoices / processes payments
  // Separate from POC (on-site contact) to correctly route billing communication
  apContactName: varchar("ap_contact_name"),   // AP dept contact full name
  apContactEmail: varchar("ap_contact_email"), // Email for invoice delivery
  apContactPhone: varchar("ap_contact_phone"), // AP dept phone

  // Signed contract document — URL to uploaded contract file (object storage)
  contractFileUrl: varchar("contract_file_url"), // Link to executed signed contract PDF

  // ============================================================================
  // AGENCY / SUBCONTRACT HIERARCHY
  // For security companies that subcontract from larger agencies
  // ============================================================================
  
  // Parent Agency (who you subcontract from)
  parentAgencyId: varchar("parent_agency_id"), // References another client who is the parent agency
  isAgency: boolean("is_agency").default(false), // True if this client is an agency you subcontract from
  
  // Agency billing references
  agencyClientNumber: varchar("agency_client_number"), // Their internal client number for you
  agencyPONumber: varchar("agency_po_number"), // Their purchase order number
  agencyContractNumber: varchar("agency_contract_number"), // Their contract number
  
  // Agency's end-client reference (for pass-through billing)
  agencyEndClientName: varchar("agency_end_client_name"), // The agency's customer name
  agencyEndClientId: varchar("agency_end_client_id"), // The agency's customer ID in their system
  agencyBillingInstructions: text("agency_billing_instructions"), // Special agency billing requirements
  
  // ──────────────────────────────────────────────────────────────────────────
  // TRINITY SCHEDULING INTELLIGENCE — Security Site Requirements
  // These fields define what Trinity must match when assigning officers.
  // ──────────────────────────────────────────────────────────────────────────

  // Armed/Unarmed requirement for this site
  requiresArmed: boolean("requires_armed").default(false), // Site requires armed officers only

  // Profitability — per-service-type bill rates (private; owner + Trinity only)
  // If set, these override contractRate for Trinity profitability calculations.
  armedBillRate: decimal("armed_bill_rate", { precision: 10, scale: 2 }), // $ per hour for armed officers
  unarmedBillRate: decimal("unarmed_bill_rate", { precision: 10, scale: 2 }), // $ per hour for unarmed officers
  overtimeBillRate: decimal("overtime_bill_rate", { precision: 10, scale: 2 }), // $ per hour OT billing (if different from rate × multiplier)

  // License requirements — Trinity validates officer licenses match before assigning
  // Example values: 'guard_card', 'psb_license', 'armed_license', 'cpr', 'first_aid'
  requiredLicenseTypes: text("required_license_types").array(),

  // Minimum officer quality threshold — Trinity will not assign officers below this score
  minOfficerSchedulingScore: integer("min_officer_scheduling_score").default(0),

  // Scheduling preferences (for Trinity auto-scheduling)
  preferredEmployees: text("preferred_employees").array(),
  requiredCertifications: text("required_certifications").array(),
  minimumStaffing: integer("minimum_staffing"),
  maxDrivingDistance: integer("max_driving_distance"),

  // Coverage Schedule — defines WHEN this client needs security coverage
  // Trinity uses this to generate shifts only during required windows
  coverageType: varchar("coverage_type").default("custom"), // '24_7', 'business_hours', 'custom'
  daysOfService: text("days_of_service").array(), // Canonical service days for Trinity hard constraints
  numberOfGuards: integer("number_of_guards"), // Canonical guard count hard constraint for Trinity scheduling
  coverageDays: text("coverage_days").array(), // ['monday','tuesday',...] — null = every day
  coverageStartTime: varchar("coverage_start_time"), // 'HH:mm' — null = 00:00
  coverageEndTime: varchar("coverage_end_time"), // 'HH:mm' — null = 23:59
  coverageTimezone: varchar("coverage_timezone").default("America/New_York"),
  coverageNotes: text("coverage_notes"), // Free-form notes Trinity reads for special instructions

  // Status
  isActive: boolean("is_active").default(true),
  notes: text("notes"),

  // Deactivation tracking
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by"),
  deactivationReason: clientDeactivationReasonEnum("deactivation_reason"),
  deactivationNotes: text("deactivation_notes"),

  // Reactivation tracking
  reactivatedAt: timestamp("reactivated_at"),
  reactivatedBy: varchar("reactivated_by"),

  // Collections pipeline
  collectionsStatus: collectionsStatusEnum("collections_status").default("none"),
  collectionsStartedAt: timestamp("collections_started_at"),
  lastCollectionEmailAt: timestamp("last_collection_email_at"),
  collectionAttemptCount: integer("collection_attempt_count").default(0),

  // Visual branding (for schedule display)
  color: varchar("color").default("#3b82f6"), // Brand color for calendar display (vibrant blue default)

  // Sync tracking
  lastQboSyncAt: timestamp("last_qbo_sync_at"), // Last synced from QuickBooks
  qboSyncStatus: varchar("qbo_sync_status"), // 'synced', 'pending', 'error'

  // ============================================================================
  // STRATEGIC BUSINESS OPTIMIZATION - Profit-First AI Decision Making
  // ============================================================================
  
  // Client Tiering (Strategic Prioritization)
  strategicTier: varchar("strategic_tier").default("standard"), // 'enterprise', 'premium', 'standard', 'trial'
  tierScore: decimal("tier_score", { precision: 5, scale: 2 }).default("50.00"), // 0-100, higher = more valuable
  
  // Financial Value Metrics
  monthlyRevenue: decimal("monthly_revenue", { precision: 12, scale: 2 }).default("0.00"), // Average monthly billing
  lifetimeValue: decimal("lifetime_value", { precision: 14, scale: 2 }).default("0.00"), // Total revenue since client start
  paymentHistory: varchar("payment_history").default("good"), // 'excellent', 'good', 'delayed', 'problematic'
  averageProfitMargin: decimal("average_profit_margin", { precision: 5, scale: 2 }).default("30.00"), // Percentage
  
  // Relationship Metrics
  clientSince: timestamp("client_since"), // When they became a client
  satisfactionScore: decimal("satisfaction_score", { precision: 5, scale: 2 }).default("80.00"), // 0-100 based on surveys/feedback
  complaintsReceived: integer("complaints_received").default(0), // Client complained about service
  praiseReceived: integer("praise_received").default(0), // Client praised service
  renewalProbability: decimal("renewal_probability", { precision: 5, scale: 2 }).default("75.00"), // 0-100, predicted renewal likelihood
  
  // Strategic Flags (for profit-first AI decisions)
  isLegacyClient: boolean("is_legacy_client").default(false), // Been with us 2+ years
  isHighValue: boolean("is_high_value").default(false), // Top 20% revenue generators
  isAtRisk: boolean("is_at_risk").default(false), // Satisfaction declining, may churn
  isGrowthAccount: boolean("is_growth_account").default(false), // Expanding, more sites coming
  profitabilityTrend: varchar("profitability_trend").default("stable"), // 'increasing', 'stable', 'decreasing'
  
  // Difficulty & Risk Assessment
  siteDifficultyLevel: varchar("site_difficulty_level").default("moderate"), // 'easy', 'moderate', 'difficult', 'high-risk'

  // Geofencing (per-site configurable radius for GPS clock-in verification)
  geofenceRadiusMeters: integer("geofence_radius_meters").default(100),

  // ─── PASS 1 AUDIT — Client Data Completeness ──────────────────────────────

  // Billing address (separate from the service/work site address)
  billingAddress: text("billing_address"),
  billingPostalCode: varchar("billing_postal_code"),

  // Work / Service site address (separate from billing address)
  workLocationAddress: text("work_location_address"),
  workLocationCity: varchar("work_location_city"),
  workLocationState: varchar("work_location_state"),
  workLocationPostalCode: varchar("work_location_postal_code"),

  // Primary contact (business decision-maker; different from AP contact and on-site POC)
  primaryContactName: varchar("primary_contact_name"),
  primaryContactPhone: varchar("primary_contact_phone"),
  primaryContactEmail: varchar("primary_contact_email"),

  // Security service classification
  serviceType: varchar("service_type"), // 'level2_unarmed' | 'level3_armed' | 'level4_ppo'
  officersRequired: integer("officers_required"), // How many officers this site needs

  // PPO (Personal Protection Officer) billing rate — distinct from armed/unarmed
  ppoBillRate: decimal("ppo_bill_rate", { precision: 10, scale: 2 }),

  // Invoice routing — separate from general billingEmail (may go to AP dept directly)
  invoiceDeliveryEmail: varchar("invoice_delivery_email"),

  // Proposal lifecycle (pre-contract)
  proposalSignedAt: timestamp("proposal_signed_at"),
  proposalDocumentId: varchar("proposal_document_id"),

  // Contract lifecycle (post-proposal)
  contractSignedAt: timestamp("contract_signed_at"),
  contractDocumentId: varchar("contract_document_id"),

  // Responsible party identity verification
  responsiblePartyIdDocumentId: varchar("responsible_party_id_document_id"),

  // Client onboarding pipeline status
  clientOnboardingStatus: varchar("client_onboarding_status").default("incomplete"), // 'incomplete' | 'pending_signature' | 'active'

  // Client portal self-service access
  portalAccessEnabled: boolean("portal_access_enabled").default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  riskFactors: jsonb("risk_factors").default('[]'),
  lastRiskAssessment: timestamp("last_risk_assessment"),
  contractValue: decimal("contract_value"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  paymentReliabilityScore: decimal("payment_reliability_score"),
  avgPaymentDays: integer("avg_payment_days").default(30),
  npsScore: integer("nps_score").default(0),
  lastSatisfactionSurvey: timestamp("last_satisfaction_survey"),
  assignedEmployees: integer("assigned_employees").default(0),
  totalShiftsScheduled: integer("total_shifts_scheduled").default(0),
  totalHoursWorked: decimal("total_hours_worked"),
  lastServiceDate: date("last_service_date"),
  serviceFrequency: varchar("service_frequency"),
  clientTenureMonths: integer("client_tenure_months").default(0),
  communicationPreference: varchar("communication_preference"),
  accountManagerId: varchar("account_manager_id"),
  lastContactDate: timestamp("last_contact_date"),
  growthPotential: varchar("growth_potential"),
  upsellOpportunities: jsonb("upsell_opportunities").default('[]'),
  churnRiskScore: decimal("churn_risk_score"),
  churnRiskFactors: jsonb("churn_risk_factors").default('[]'),
  schedulingPriority: integer("scheduling_priority").default(50),
  billingPriority: integer("billing_priority").default(50),
  supportPriority: integer("support_priority").default(50),
  parentClientId: text("parent_client_id"),
  isSubClient: boolean("is_sub_client").default(false),
  billingSettings: jsonb("billing_settings").default('{}'),
  billingCity: varchar("billing_city"),
  billingState: varchar("billing_state"),
  billingZip: varchar("billing_zip"),
  // TRINITY.md Section R / Law P1 — soft delete (no hard delete on clients)
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
}, (table) => ({
  // Add index on userId for performance
  userIdIdx: index("clients_user_id_idx").on(table.userId),
  // Add index on quickbooksClientId for sync lookups
  qboClientIdIdx: index("clients_qbo_client_id_idx").on(table.quickbooksClientId),
  // Strategic optimization indexes
  strategicTierIdx: index("clients_strategic_tier_idx").on(table.strategicTier),
  tierScoreIdx: index("clients_tier_score_idx").on(table.tierScore),
  atRiskIdx: index("clients_at_risk_idx").on(table.isAtRisk),
  workspaceIdx: index("clients_workspace_idx").on(table.workspaceId),
}));


export const subClients = pgTable("sub_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  parentClientId: varchar("parent_client_id").notNull(),

  // Basic Info
  name: varchar("name").notNull(),
  clientJobId: varchar("client_job_id"), // Client's internal reference (e.g., "P2406-010125")
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),

  // Service Location
  locationName: varchar("location_name"),
  locationAddressLine1: varchar("location_address_line1"),
  locationAddressLine2: varchar("location_address_line2"),
  locationCity: varchar("location_city"),
  locationState: varchar("location_state"),
  locationZip: varchar("location_zip"),

  // Geofencing (for GPS clock-in verification)
  geofenceLat: decimal("geofence_lat", { precision: 10, scale: 7 }),
  geofenceLng: decimal("geofence_lng", { precision: 10, scale: 7 }),
  geofenceRadiusMeters: integer("geofence_radius_meters").default(100),

  // Billing Settings (overrides parent client if set)
  billRate: decimal("bill_rate", { precision: 10, scale: 2 }),
  overtimeRate: decimal("overtime_rate", { precision: 10, scale: 2 }),
  holidayRate: decimal("holiday_rate", { precision: 10, scale: 2 }),
  minimumHours: decimal("minimum_hours", { precision: 5, scale: 2 }),

  // Service Schedule
  defaultScheduleDescription: text("default_schedule_description"),

  // QuickBooks Integration
  qbSubCustomerId: varchar("qb_sub_customer_id"),
  qbSyncedAt: timestamp("qb_synced_at"),

  // Status
  status: varchar("status").default("active"), // active, paused, completed
  contractStartDate: timestamp("contract_start_date"),
  contractEndDate: timestamp("contract_end_date"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const postOrderTemplates = pgTable("post_order_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  priority: shiftOrderPriorityEnum("priority").default('normal'),
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),
  requiresSignature: boolean("requires_signature").default(false),
  requiresPhotos: boolean("requires_photos").default(false),
  photoFrequency: shiftOrderPhotoFrequencyEnum("photo_frequency"),
  photoInstructions: text("photo_instructions"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("post_order_templates_workspace_idx").on(table.workspaceId),
]);

export const clientRates = pgTable("client_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),

  // Billing configuration
  billableRate: decimal("billable_rate", { precision: 10, scale: 2 }).notNull(), // Hourly rate for this client
  description: text("description"), // e.g., "Standard hourly rate", "Premium weekend rate"
  isActive: boolean("is_active").default(true),

  // Subscription billing (hybrid model)
  hasSubscription: boolean("has_subscription").default(false),
  subscriptionAmount: decimal("subscription_amount", { precision: 10, scale: 2 }),
  subscriptionFrequency: varchar("subscription_frequency"), // 'monthly', 'quarterly', 'annual'
  subscriptionStartDate: timestamp("subscription_start_date"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),

  // Contact info
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  fullName: varchar("full_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  title: varchar("title"),

  // Company
  companyName: varchar("company_name").notNull(),
  companyDomain: varchar("company_domain"),

  // Source & confidence
  source: varchar("source").default("manual"), // 'manual', 'enrichment', 'linkedin', etc.
  confidenceScore: integer("confidence_score").default(50), // 0-100%

  // Consent tracking
  consentGiven: boolean("consent_given").default(false),
  consentSource: varchar("consent_source"),
  consentDate: timestamp("consent_date"),

  // Status
  status: varchar("status").default("active"), // 'active', 'bounced', 'unsubscribed', 'invalid'

  // Relationships
  leadId: varchar("lead_id"),

  // Notes
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const partnerConnections = pgTable("partner_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Partner identification (use enum for data integrity)
  partnerType: partnerTypeEnum("partner_type").notNull(),
  partnerName: varchar("partner_name").notNull(), // Display name
  
  // OAuth credentials (encrypted at rest in production via application layer)
  accessToken: text("access_token").notNull(), // OAuth access token
  refreshToken: text("refresh_token"), // OAuth refresh token (if applicable)
  tokenType: varchar("token_type").default('Bearer'), // Usually 'Bearer'
  expiresAt: timestamp("expires_at"), // When access token expires
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"), // QuickBooks provides refresh token expiry
  
  // Scopes and permissions
  scopes: text("scopes").array().default(sql`ARRAY[]::text[]`), // OAuth scopes granted
  
  // Connection status (use enum for data integrity)
  status: partnerConnectionStatusEnum("status").notNull().default('connected'),
  lastSyncAt: timestamp("last_sync_at"), // Last successful API call
  lastErrorAt: timestamp("last_error_at"), // Last error encountered
  lastError: text("last_error"), // Error message
  
  // Webhook configuration (for receiving real-time updates from partner)
  webhookSecret: text("webhook_secret"), // Secret for validating incoming webhooks (encrypted)
  webhookUrl: varchar("webhook_url"), // Registered webhook URL
  webhookEnabled: boolean("webhook_enabled").default(false),
  
  // Partner-specific metadata
  realmId: varchar("realm_id"), // QuickBooks company ID
  companyId: varchar("company_id"), // Gusto company ID
  metadata: jsonb("metadata"), // Additional partner-specific data
  
  // Connection management
  connectedBy: varchar("connected_by"),
  connectedAt: timestamp("connected_at").defaultNow(),
  disconnectedBy: varchar("disconnected_by"),
  disconnectedAt: timestamp("disconnected_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("partner_connections_workspace_idx").on(table.workspaceId),
  partnerIdx: index("partner_connections_partner_idx").on(table.partnerType),
  statusIdx: index("partner_connections_status_idx").on(table.status),
  uniqueWorkspacePartner: uniqueIndex("unique_workspace_partner").on(table.workspaceId, table.partnerType),
}));

export const partnerSyncLogs = pgTable("partner_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  partnerConnectionId: varchar("partner_connection_id").notNull(),
  jobType: varchar("job_type").notNull(),
  entityType: varchar("entity_type"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  status: varchar("status").notNull().default('running'),
  itemsProcessed: integer("items_processed").default(0),
  itemsCreated: integer("items_created").default(0),
  itemsUpdated: integer("items_updated").default(0),
  itemsFailed: integer("items_failed").default(0),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  triggeredBy: varchar("triggered_by"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Can belong to client OR sub-client
  clientId: varchar("client_id"),
  subClientId: varchar("sub_client_id"),
  
  // Site Info
  name: varchar("name", { length: 255 }).notNull(),
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),

  // Site coordinates — actual map pin location
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Geofencing
  geofenceLat: decimal("geofence_lat", { precision: 10, scale: 7 }),
  geofenceLng: decimal("geofence_lng", { precision: 10, scale: 7 }),
  geofenceRadiusMeters: integer("geofence_radius_meters").default(100),
  
  // Site-specific billing (overrides client/sub-client if set)
  billRate: decimal("bill_rate", { precision: 10, scale: 2 }),
  
  // Site requirements
  requiresPhotoVerification: boolean("requires_photo_verification").default(false),
  requiresGpsVerification: boolean("requires_gps_verification").default(true),
  specialInstructions: text("special_instructions"),
  
  // QuickBooks
  qbLocationId: varchar("qb_location_id", { length: 100 }),
  qbSyncedAt: timestamp("qb_synced_at"),
  
  status: varchar("status", { length: 50 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  siteType: varchar("site_type"),
  certificationData: jsonb("certification_data").default('{}'),
}, (table) => [
  index("sites_workspace_idx").on(table.workspaceId),
  index("sites_client_idx").on(table.clientId),
  index("sites_sub_client_idx").on(table.subClientId),
]);

export const siteContacts = pgTable("site_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id").notNull(),
  
  // Contact Info
  name: varchar("name", { length: 255 }).notNull(),
  title: varchar("title", { length: 100 }), // e.g., "Site Manager", "Security Supervisor"
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  
  // Contact type
  isPrimary: boolean("is_primary").default(false),
  isEmergency: boolean("is_emergency").default(false),
  
  // Availability
  availableHours: varchar("available_hours", { length: 100 }), // e.g., "9AM-5PM Mon-Fri"
  notes: text("notes"),
  
  status: varchar("status", { length: 50 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("site_contacts_site_idx").on(table.siteId),
  index("site_contacts_workspace_idx").on(table.workspaceId),
]);

export const businessLocations = pgTable("business_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 20 }), // Short code like "NYC-01"
  locationType: varchar("location_type", { length: 30 }).default("branch"), // headquarters, branch, franchise, satellite
  parentLocationId: varchar("parent_location_id"), // For hierarchical rollups
  // Address
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  postalCode: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 50 }).default("USA"),
  // QuickBooks mapping
  qboClassId: varchar("qbo_class_id", { length: 100 }), // QBO Class for location tracking
  qboLocationId: varchar("qbo_location_id", { length: 100 }), // QBO Location entity
  qboDepartmentId: varchar("qbo_department_id", { length: 100 }),
  // Manager
  managerId: varchar("manager_id"),
  // Status
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("locations_workspace_idx").on(table.workspaceId),
  index("locations_qbo_class_idx").on(table.qboClassId),
  index("locations_parent_idx").on(table.parentLocationId),
]);

export const clientContracts = pgTable("client_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  docType: clientContractDocTypeEnum("doc_type").notNull(),
  parentDocumentId: varchar("parent_document_id"),
  templateId: varchar("template_id"),
  clientId: varchar("client_id"),
  clientName: varchar("client_name", { length: 200 }),
  clientEmail: varchar("client_email", { length: 255 }),
  title: varchar("title", { length: 300 }).notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  services: jsonb("services").default([]),
  billingTerms: jsonb("billing_terms").default({}),
  totalValue: decimal("total_value", { precision: 14, scale: 2 }),
  status: clientContractStatusEnum("status").notNull().default('draft'),
  statusChangedAt: timestamp("status_changed_at").defaultNow(),
  statusChangedBy: varchar("status_changed_by"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  executedAt: timestamp("executed_at"),
  expiresAt: timestamp("expires_at"),
  effectiveDate: date("effective_date"),
  termEndDate: date("term_end_date"),
  contentHash: varchar("content_hash", { length: 64 }),
  lockedAt: timestamp("locked_at"),
  requiresWitness: boolean("requires_witness").default(false),
  requiresNotary: boolean("requires_notary").default(false),
  specialTerms: text("special_terms"),
  declineReason: text("decline_reason"),
  changesRequested: text("changes_requested"),
  viewCount: integer("view_count").default(0),
  remindersSent: integer("reminders_sent").default(0),
  lastReminderAt: timestamp("last_reminder_at"),
  // Dual-signature & ID verification fields (shift proposal pipeline)
  proposalId: varchar("proposal_id"),
  clientInitials: jsonb("client_initials").default({}),
  governmentIdUrl: text("government_id_url"),
  governmentIdType: varchar("government_id_type"),
  orgSignedByName: varchar("org_signed_by_name"),
  orgSignedAt: timestamp("org_signed_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  accessConfig: jsonb("access_config").default('{}'),
  pipelineUsage: jsonb("pipeline_usage").default('{}'),
  amendmentData: jsonb("amendment_data").default('{}'),
  milestoneData: jsonb("milestone_data").default('{}'),
  renewalData: jsonb("renewal_data").default('{}'),
  documentData: jsonb("document_data").default('{}'),
  version: integer("version").default(1),
  renewalNoticeDays: integer("renewal_notice_days").default(90),
  autoRenew: boolean("auto_renew").default(false),
  renewalProposedAt: timestamp("renewal_proposed_at"),
  renewalStatus: varchar("renewal_status"),
  annualValue: decimal("annual_value"),
}, (table) => [
  index("client_contract_workspace_idx").on(table.workspaceId),
  index("client_contract_client_idx").on(table.clientId),
  index("client_contract_status_idx").on(table.status),
  index("client_contract_type_idx").on(table.docType),
  index("client_contract_expires_idx").on(table.expiresAt),
]);

export const clientContractAuditLog = pgTable("client_contract_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull(),
  action: clientContractAuditActionEnum("action").notNull(),
  actionDescription: text("action_description"),
  actorId: varchar("actor_id"),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  actorName: varchar("actor_name", { length: 200 }),
  actorEmail: varchar("actor_email", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  geolocation: jsonb("geolocation"),
  metadata: jsonb("metadata").default({}),
  previousStatus: varchar("previous_status", { length: 50 }),
  newStatus: varchar("new_status", { length: 50 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),


  workspaceId: varchar("workspace_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("client_audit_contract_idx").on(table.contractId),
  index("client_audit_action_idx").on(table.action),
  index("client_audit_time_idx").on(table.timestamp),
]);

export const clientContractAccessTokens = pgTable("client_contract_access_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  contractId: varchar("contract_id"),
  clientId: varchar("client_id"),
  token: varchar("token").unique().notNull(),
  tokenType: varchar("token_type").default('view'),
  recipientEmail: varchar("recipient_email"),
  permissions: jsonb("permissions").default(sql`'[]'::jsonb`),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  useCount: integer("use_count").default(0),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("client_token_contract_idx").on(table.contractId),
  index("client_token_email_idx").on(table.recipientEmail),
  index("client_token_expires_idx").on(table.expiresAt),
]);

export const clientContractPipelineUsage = pgTable("client_contract_pipeline_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  periodStart: varchar("period_start").notNull(),
  periodEnd: varchar("period_end"),
  quotaLimit: integer("quota_limit").default(0),
  quotaUsed: integer("quota_used").default(0),
  overageCount: integer("overage_count").default(0),
  overageCreditsCharged: integer("overage_credits_charged").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("client_usage_workspace_idx").on(table.workspaceId),
  uniqueIndex("client_usage_unique_idx").on(table.workspaceId, table.periodStart),
]);

export const clientPortalAccess = pgTable("client_portal_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  accessToken: text("access_token").notNull().unique(),
  email: varchar("email"),
  portalName: varchar("portal_name"),
  logoUrl: varchar("logo_url"),
  primaryColor: varchar("primary_color").default("#0f172a"),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  lastAccessedAt: timestamp("last_accessed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("client_portal_access_workspace_idx").on(table.workspaceId),
  index("client_portal_access_token_idx").on(table.accessToken),
  index("client_portal_access_client_idx").on(table.clientId),
]);

export const clientPortalReports = pgTable("client_portal_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Links
  sessionId: varchar("session_id"),
  workspaceId: varchar("workspace_id"),
  clientId: varchar("client_id"),
  submittedByName: varchar("submitted_by_name"),
  submittedByEmail: varchar("submitted_by_email"),

  // Report content
  reportType: clientPortalReportTypeEnum("report_type").notNull().default("complaint"),
  severity: varchar("severity").notNull().default("medium"),  // low | medium | high | critical
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  evidenceText: text("evidence_text"),         // Additional written evidence
  evidenceUrls: jsonb("evidence_urls"),        // Array of attachment URLs

  // AI analysis
  sentimentScore: decimal("sentiment_score", { precision: 4, scale: 3 }),  // -1.0 to 1.0
  sentimentLabel: clientPortalSentimentEnum("sentiment_label"),
  frustrationSignals: integer("frustration_signals").default(0),
  satisfactionSignals: integer("satisfaction_signals").default(0),
  aiSummary: text("ai_summary"),              // AI-generated summary for org
  recommendedActions: jsonb("recommended_actions"),  // Array of suggested fix steps
  conversationTurns: integer("conversation_turns").default(0),
  creditsUsed: integer("credits_used").default(10),

  // Org resolution tracking
  status: clientPortalReportStatusEnum("status").notNull().default("open"),
  orgResponseNote: text("org_response_note"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: varchar("resolved_by_user_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("cpr_workspace_idx").on(table.workspaceId),
  index("cpr_client_idx").on(table.clientId),
  index("cpr_status_idx").on(table.status),
  index("cpr_type_idx").on(table.reportType),
  index("cpr_created_idx").on(table.createdAt),
]);

export const siteBriefings = pgTable("site_briefings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  siteName: varchar("site_name", { length: 255 }).notNull(),
  siteAddress: text("site_address"),

  emergencyContacts: jsonb("emergency_contacts").$type<Array<{
    name: string;
    role: string;
    phone: string;
    priority: number;
  }>>().default([]),

  accessCodes: jsonb("access_codes").$type<Array<{
    label: string;
    code: string;
    notes?: string;
  }>>().default([]),

  specialInstructions: text("special_instructions"),
  postOrders: text("post_orders"),

  nearestHospital: jsonb("nearest_hospital").$type<{
    name: string;
    address: string;
    phone?: string;
    distanceMiles?: number;
  }>(),

  nearestPoliceStation: jsonb("nearest_police_station").$type<{
    name: string;
    address: string;
    phone?: string;
  }>(),

  nearestFireStation: jsonb("nearest_fire_station").$type<{
    name: string;
    address: string;
    phone?: string;
  }>(),

  hazards: text("hazards"),
  parkingInstructions: text("parking_instructions"),
  uniformRequirements: text("uniform_requirements"),
  keyInfo: text("key_info"),

  status: varchar("status", { length: 30 }).default("active"),
  lastUpdatedBy: varchar("last_updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("site_briefings_workspace_idx").on(table.workspaceId),
  index("site_briefings_site_idx").on(table.siteId),
]);

export const slaContracts = pgTable("sla_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id"),
  clientName: varchar("client_name").notNull(),
  siteId: varchar("site_id"),
  siteName: varchar("site_name"),
  contractName: varchar("contract_name").notNull(),
  responseTimeMinutes: integer("response_time_minutes").default(15),
  minCoverageHoursDaily: numeric("min_coverage_hours_daily"),
  minOfficersPerShift: integer("min_officers_per_shift").default(1),
  supervisorInspectionHours: integer("supervisor_inspection_hours").default(24),
  patrolIntervalMinutes: integer("patrol_interval_minutes").default(60),
  incidentReportHours: integer("incident_report_hours").default(4),
  darSubmissionHours: integer("dar_submission_hours").default(2),
  isActive: boolean("is_active").default(true),
  breachCount: integer("breach_count").default(0),
  lastBreachAt: timestamp("last_breach_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sla_contracts_workspace_idx").on(table.workspaceId),
  index("sla_contracts_client_idx").on(table.clientId),
]);

export const partnerDataMappings = pgTable("partner_data_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  partnerConnectionId: varchar("partner_connection_id").notNull(),
  partnerType: varchar("partner_type").notNull(),
  entityType: varchar("entity_type").notNull(),
  coaileagueEntityId: varchar("coaileague_entity_id").notNull(),
  partnerEntityId: varchar("partner_entity_id"),
  partnerEntityName: varchar("partner_entity_name"),
  syncStatus: varchar("sync_status").default("pending"),
  matchConfidence: varchar("match_confidence"),
  lastSyncAt: timestamp("last_sync_at"),
  mappingSource: varchar("mapping_source").default("auto"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("partner_data_mappings_workspace_idx").on(table.workspaceId),
  index("partner_data_mappings_entity_idx").on(table.workspaceId, table.partnerType, table.entityType, table.coaileagueEntityId),
]);

export const partnerInvoiceIdempotency = pgTable("partner_invoice_idempotency", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  partnerConnectionId: varchar("partner_connection_id"),
  requestId: varchar("request_id").notNull(),
  partnerInvoiceId: varchar("partner_invoice_id"),
  partnerInvoiceNumber: varchar("partner_invoice_number"),
  status: varchar("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("partner_invoice_idempotency_ws_idx").on(table.workspaceId),
  uniqueIndex("partner_invoice_idempotency_unique").on(table.workspaceId, table.requestId),
]);

export const invoiceLifecycleStates = pgTable("invoice_lifecycle_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  cycleKey: varchar("cycle_key").notNull(),
  clientId: varchar("client_id").notNull(),
  dedupeKey: varchar("dedupe_key"),
  approvalMode: varchar("approval_mode").default("auto_send"),
  currentState: varchar("current_state").default("computed"),
  stateHistory: jsonb("state_history").$type<string[]>().default([]),
  riskSignals: jsonb("risk_signals").$type<string[]>().default([]),
  invoiceTotal: varchar("invoice_total"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("invoice_lifecycle_ws_idx").on(table.workspaceId),
  index("invoice_lifecycle_cycle_idx").on(table.workspaceId, table.cycleKey, table.clientId),
]);

export const partnerManualReviewQueue = pgTable("partner_manual_review_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  partnerConnectionId: varchar("partner_connection_id").notNull(),
  entityType: varchar("entity_type").notNull(),
  coaileagueEntityId: varchar("coaileague_entity_id").notNull(),
  coaileagueEntityName: varchar("coaileague_entity_name"),
  coaileagueEntityEmail: varchar("coaileague_entity_email"),
  candidateMatches: jsonb("candidate_matches").notNull().default(sql`'[]'::jsonb`),
  status: varchar("status").notNull().default('pending'),
  resolvedMappingId: varchar("resolved_mapping_id"),
  resolution: varchar("resolution"),
  assignedTo: varchar("assigned_to"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("partner_review_workspace_idx").on(table.workspaceId),
  index("partner_review_connection_idx").on(table.partnerConnectionId),
  index("partner_review_status_idx").on(table.status),
  index("partner_review_entity_idx").on(table.entityType, table.coaileagueEntityId),
]);

// ============================================================================
// Client Collections Log — audit trail for every collections outreach attempt
// ============================================================================
export const clientCollectionsLog = pgTable("client_collections_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  attemptType: varchar("attempt_type", { length: 50 }).notNull(), // 'automated_email', 'manual_email', 'phone_call', 'written_notice', 'escalation'
  sentAt: timestamp("sent_at").defaultNow(),
  sentToEmail: varchar("sent_to_email", { length: 255 }),
  subject: varchar("subject", { length: 500 }),
  bodySummary: text("body_summary"),
  documentUrl: text("document_url"),
  outstandingAmount: decimal("outstanding_amount", { precision: 12, scale: 2 }),
  responseReceived: boolean("response_received").default(false),
  responseNotes: text("response_notes"),
  createdBy: varchar("created_by", { length: 255 }).default("trinity-system"),
}, (table) => [
  index("collections_log_workspace_idx").on(table.workspaceId),
  index("collections_log_client_idx").on(table.clientId),
  index("collections_log_sent_at_idx").on(table.sentAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// client_service_requests
// Client-initiated requests: extra coverage, site walk, service change, etc.
// HelpAI acknowledges on submit. Management is notified via notification system.
// ─────────────────────────────────────────────────────────────────────────────
export const clientServiceRequests = pgTable("client_service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  requestType: varchar("request_type", { length: 50 }).notNull(),
  // extra_coverage | site_walk | service_change | emergency_coverage | billing_inquiry | other
  siteId: varchar("site_id"),
  description: text("description").notNull(),
  requestedDate: timestamp("requested_date", { withTimezone: true }),
  urgency: varchar("urgency", { length: 20 }).default("normal"), // low | normal | high | urgent
  status: varchar("status", { length: 30 }).default("submitted"),
  // submitted | acknowledged | in_review | approved | declined | completed
  submittedBy: varchar("submitted_by"), // client user or client contact name
  submittedByEmail: varchar("submitted_by_email"),
  assignedTo: varchar("assigned_to"), // workspace manager user_id
  internalNotes: text("internal_notes"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  // Phase 9 — back-link to the support ticket auto-created on submission
  supportTicketId: varchar("support_ticket_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("svc_req_workspace_idx").on(table.workspaceId),
  index("svc_req_client_idx").on(table.clientId),
  index("svc_req_status_idx").on(table.status),
  index("svc_req_created_idx").on(table.createdAt),
]);
export const insertClientServiceRequestSchema = createInsertSchema(clientServiceRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClientServiceRequest = z.infer<typeof insertClientServiceRequestSchema>;
export type ClientServiceRequest = typeof clientServiceRequests.$inferSelect;

export * from './extended';
