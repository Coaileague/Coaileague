// ═══════════════════════════════════════════════════════════════
// Domain 2 of 15: Orgs & Workspaces
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 29

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, char, index, uniqueIndex, primaryKey, unique, check, interval } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  accountStateEnum,
  businessCategoryEnum,
  featureUpdateCategoryEnum,
  featureUpdateStatusEnum,
  integrationCategoryEnum,
  inviteStatusEnum,
  onboardingStatusEnum,
  onboardingStepEnum,
  onboardingTaskStatusEnum,
  rewardStatusEnum,
  rewardTypeEnum,
  taskCreatorEnum,
  taxClassificationEnum,
  workspaceRoleEnum,
} from '../../enums';

export const userOnboarding = pgTable("user_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull().unique(),

  // Progress tracking
  completedSteps: text("completed_steps").array().default(sql`ARRAY[]::text[]`), // Array of completed step IDs
  currentStep: varchar("current_step"), // Current active step ID
  totalSteps: integer("total_steps").default(20), // Total number of onboarding steps
  progressPercentage: integer("progress_percentage").default(0), // 0-100%

  // Status
  hasSkipped: boolean("has_skipped").default(false), // User clicked "Skip Tour"
  hasCompleted: boolean("has_completed").default(false), // 100% completion
  lastViewedAt: timestamp("last_viewed_at"), // Last time onboarding was opened

  // Module-specific progress (for 4 OS Families)
  communicationProgress: integer("communication_progress").default(0), // 0-100%
  operationsProgress: integer("operations_progress").default(0), // 0-100%
  growthProgress: integer("growth_progress").default(0), // 0-100%
  platformProgress: integer("platform_progress").default(0), // 0-100%

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  progressData: jsonb("progress_data").default('{}'),
  onboardingType: varchar("onboarding_type"),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  role: varchar("role").default("member"),
  status: varchar("status").default("active"),
  joinedAt: timestamp("joined_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const onboardingInvites = pgTable("onboarding_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),

  email: varchar("email").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  role: varchar("role"), // Job title/role for the invited employee
  workspaceRole: workspaceRoleEnum("workspace_role").default("staff"), // Permission level
  position: varchar("position"), // SecurityPosition: unarmed_guard, armed_guard, ppo, supervisor
  offeredPayRate: decimal("offered_pay_rate", { precision: 10, scale: 2 }), // Offered hourly pay rate

  inviteToken: varchar("invite_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),

  // Enhanced tracking fields
  status: inviteStatusEnum("status").default("sent").notNull(),
  openedAt: timestamp("opened_at"), // When invite link was first clicked
  acceptedAt: timestamp("accepted_at"),
  isUsed: boolean("is_used").default(false),
  
  // Resend tracking
  resentCount: integer("resent_count").default(0),
  lastResentAt: timestamp("last_resent_at"),
  
  // Notification preferences
  sendEmailOnCreate: boolean("send_email_on_create").default(true),
  reminderSentAt: timestamp("reminder_sent_at"),

  sentBy: varchar("sent_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("onboarding_invites_workspace_idx").on(table.workspaceId),
  emailIdx: index("onboarding_invites_email_idx").on(table.email),
  statusIdx: index("onboarding_invites_status_idx").on(table.status),
  tokenIdx: index("onboarding_invites_token_idx").on(table.inviteToken),
}));

export const onboardingApplications = pgTable("onboarding_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  inviteId: varchar("invite_id"),

  // Generated employee number
  employeeNumber: varchar("employee_number").unique(),

  // Personal Information
  firstName: varchar("first_name").notNull(),
  middleName: varchar("middle_name"),
  lastName: varchar("last_name").notNull(),
  dateOfBirth: timestamp("date_of_birth"),
  ssn: varchar("ssn"), // Encrypted in production

  // Contact
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),

  // Emergency Contact
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  emergencyContactRelation: varchar("emergency_contact_relation"),

  // Tax Classification
  taxClassification: taxClassificationEnum("tax_classification"),

  // Payroll Information (W-4 employees only)
  bankName: varchar("bank_name"),
  routingNumber: varchar("routing_number"), // Encrypted in production
  accountNumber: varchar("account_number"), // Encrypted in production
  accountType: varchar("account_type"), // 'checking' or 'savings'

  // W-4 Tax Withholding
  filingStatus: varchar("filing_status"), // 'single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'
  multipleJobs: varchar("multiple_jobs"), // 'yes' or 'no'
  dependentsAmount: varchar("dependents_amount"), // Dollar amount for dependent credits
  otherIncome: varchar("other_income"), // Other income not from jobs
  deductions: varchar("deductions"), // Deductions beyond standard
  extraWithholding: varchar("extra_withholding"), // Extra amount to withhold per paycheck

  // Position (SecurityPosition: unarmed_guard | armed_guard | ppo | supervisor)
  // Drives which documents are required by employeeDocumentOnboardingService
  position: varchar("position"),

  // Work Availability (for AI scheduling)
  availableMonday: boolean("available_monday").default(true),
  availableTuesday: boolean("available_tuesday").default(true),
  availableWednesday: boolean("available_wednesday").default(true),
  availableThursday: boolean("available_thursday").default(true),
  availableFriday: boolean("available_friday").default(true),
  availableSaturday: boolean("available_saturday").default(false),
  availableSunday: boolean("available_sunday").default(false),
  preferredShiftTime: varchar("preferred_shift_time"), // 'morning', 'afternoon', 'evening', 'night'
  maxHoursPerWeek: integer("max_hours_per_week"),
  availabilityNotes: text("availability_notes"),

  // Onboarding Status
  currentStep: onboardingStepEnum("current_step").default("personal_info"),
  status: onboardingStatusEnum("status").default("in_progress"),
  completedAt: timestamp("completed_at"),

  // Tracking
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const onboardingWorkflowTemplates = pgTable("onboarding_workflow_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Template metadata
  name: varchar("name").notNull(), // e.g., "Security Guard Onboarding", "Office Manager Onboarding"
  description: text("description"),
  industry: varchar("industry"), // 'security', 'construction', 'healthcare', 'office', 'general'
  roleType: varchar("role_type"), // 'employee', 'contractor', 'temporary'

  // Workflow steps configuration
  steps: jsonb("steps").notNull().$type<Array<{
    stepId: string;
    stepName: string;
    stepOrder: number;
    stepType: 'personal_info' | 'tax_forms' | 'documents' | 'certifications' | 'signatures' | 'custom_form';
    isRequired: boolean;
    requiredDocuments?: string[]; // ['government_id', 'ssn_card', 'i9', 'w4', 'direct_deposit']
    requiredCertifications?: string[]; // ['guard_card', 'cpr', 'first_aid']
    requiredSignatures?: string[]; // ['employee_handbook', 'confidentiality', 'code_of_conduct']
    approvalRequired?: boolean;
    approverRole?: 'owner' | 'manager' | 'hr'; 
    customFields?: Array<{
      fieldName: string;
      fieldType: 'text' | 'number' | 'date' | 'file' | 'signature';
      isRequired: boolean;
      options?: string[];
    }>;
  }>>(),

  // Compliance tracking
  complianceRequirements: jsonb("compliance_requirements").$type<{
    i9Required: boolean;
    i9VerificationDeadline: number; // Days from hire date
    backgroundCheckRequired: boolean;
    drugTestRequired: boolean;
    minimumDocuments: number;
    retentionPeriodYears: number; // Default: 7
  }>(),

  // Usage stats
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Default for new employees
  usageCount: integer("usage_count").default(0),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const featureFlags = pgTable("feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),

  // Tier-based features (aligned with pricing)
  tier: varchar("tier").notNull().default("basic"), // 'basic', 'professional', 'premium', 'enterprise'

  // Core Features (Basic Tier - $49/month)
  hasEmployeeManagement: boolean("has_employee_management").default(true),
  hasClientManagement: boolean("has_client_management").default(true),
  hasBasicScheduling: boolean("has_basic_scheduling").default(true),
  hasTimeTracking: boolean("has_time_tracking").default(true),

  // Professional Features (Professional Tier - $149/month)
  hasInvoiceGeneration: boolean("has_invoice_generation").default(false),
  hasAnalyticsDashboard: boolean("has_analytics_dashboard").default(false),
  hasEmployeeOnboarding: boolean("has_employee_onboarding").default(false),

  // Premium Features (Premium Tier - $299/month)
  hasReportManagementSystem: boolean("has_report_management_system").default(false),
  hasGpsTracking: boolean("has_gps_tracking").default(false),
  hasAdvancedRbac: boolean("has_advanced_rbac").default(false),
  hasComplianceTools: boolean("has_compliance_tools").default(false),

  // Enterprise Features (Enterprise Tier - $599/month)
  hasWhiteLabelRms: boolean("has_white_label_rms").default(false),
  hasCustomBranding: boolean("has_custom_branding").default(false),
  hasApiAccess: boolean("has_api_access").default(false),
  hasSsoIntegration: boolean("has_sso_integration").default(false),
  hasDedicatedSupport: boolean("has_dedicated_support").default(false),

  // Add-on Features (Additional cost)
  hasAutomatedPayroll: boolean("has_automated_payroll").default(false), // +$99/month
  hasSmsNotifications: boolean("has_sms_notifications").default(false), // +$29/month
  hasAdvancedAnalytics: boolean("has_advanced_analytics").default(false), // +$79/month

  // Usage limits
  maxEmployees: integer("max_employees").default(5),
  maxClients: integer("max_clients").default(10),
  maxReportsPerMonth: integer("max_reports_per_month").default(10),
  maxStorageGb: integer("max_storage_gb").default(5),

  // Billing integration
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  billingCycle: varchar("billing_cycle").default("monthly"), // 'monthly', 'annual'
  trialEndsAt: timestamp("trial_ends_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const integrationMarketplace = pgTable("integration_marketplace", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),

  // Integration identity
  name: varchar("name").notNull(), // "QuickBooks Online", "Salesforce CRM"
  slug: varchar("slug").unique().notNull(), // "quickbooks-online", "salesforce"
  category: integrationCategoryEnum("category").notNull(),
  provider: varchar("provider").notNull(), // "Intuit", "Salesforce Inc."
  logoUrl: varchar("logo_url"),

  // Integration details
  description: text("description"),
  longDescription: text("long_description"),
  websiteUrl: varchar("website_url"),
  documentationUrl: varchar("documentation_url"),

  // Technical specifications
  authType: varchar("auth_type").notNull(), // 'oauth2', 'api_key', 'basic', 'custom'
  authConfig: jsonb("auth_config").$type<{
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    apiKeyName?: string;
    customInstructions?: string;
  }>(),

  // Supported features
  supportedFeatures: jsonb("supported_features").$type<string[]>().default(sql`'[]'`), // ['sync_employees', 'sync_invoices', 'webhooks']
  webhookSupport: boolean("webhook_support").default(false),
  bidirectionalSync: boolean("bidirectional_sync").default(false),

  // Marketplace metadata
  isCertified: boolean("is_certified").default(false), // Official CoAIleague™ certification
  isDeveloperSubmitted: boolean("is_developer_submitted").default(false),
  installCount: integer("install_count").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }), // 0.00 - 5.00
  reviewCount: integer("review_count").default(0),

  // Developer information (for third-party integrations)
  developerId: varchar("developer_id"),
  developerEmail: varchar("developer_email"),
  developerWebhookUrl: varchar("developer_webhook_url"),

  // Status
  isActive: boolean("is_active").default(true),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categorySlugIndex: index("integration_marketplace_category_slug_idx").on(table.category, table.slug),
  certifiedActiveIndex: index("integration_marketplace_certified_active_idx").on(table.isCertified, table.isActive),
  installCountIndex: index("integration_marketplace_install_count_idx").on(table.installCount),
}));

export const integrationConnections = pgTable("integration_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  integrationId: varchar("integration_id").notNull(),

  // Connection identity
  connectionName: varchar("connection_name"), // User-friendly name "Production QuickBooks"
  externalAccountId: varchar("external_account_id"), // External system's account identifier
  externalAccountName: varchar("external_account_name"), // "Acme Corp - QuickBooks"

  // Authentication
  authType: varchar("auth_type").notNull(), // 'oauth2', 'api_key', 'basic'
  accessToken: text("access_token"), // Encrypted OAuth access token
  refreshToken: text("refresh_token"), // Encrypted OAuth refresh token
  tokenExpiry: timestamp("token_expiry"),
  apiKey: text("api_key"), // Encrypted API key (for API key auth)
  apiSecret: text("api_secret"), // Encrypted API secret

  // Configuration
  syncConfig: jsonb("sync_config").$type<{
    syncDirection?: 'pull' | 'push' | 'bidirectional';
    syncFrequency?: 'realtime' | 'hourly' | 'daily' | 'manual';
    enabledFeatures?: string[];
    fieldMappings?: Record<string, string>;
  }>(),

  // Sync status
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status"), // 'success', 'failed', 'partial'
  lastSyncError: text("last_sync_error"),
  nextSyncAt: timestamp("next_sync_at"),
  totalSyncCount: integer("total_sync_count").default(0),
  failedSyncCount: integer("failed_sync_count").default(0),

  // Health monitoring
  isHealthy: boolean("is_healthy").default(true),
  healthCheckAt: timestamp("health_check_at"),
  healthCheckError: text("health_check_error"),

  // Connection status
  isActive: boolean("is_active").default(true),
  connectedAt: timestamp("connected_at").defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),

  // Audit
  connectedByUserId: varchar("connected_by_user_id"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIntegrationIndex: index("integration_connections_workspace_integration_idx").on(table.workspaceId, table.integrationId),
  activeHealthIndex: index("integration_connections_active_health_idx").on(table.isActive, table.isHealthy),
  nextSyncIndex: index("integration_connections_next_sync_idx").on(table.nextSyncAt, table.isActive),
}));

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Subscription identity
  name: varchar("name").notNull(), // "Slack Shift Notifications"
  description: text("description"),
  targetUrl: varchar("target_url").notNull(), // External endpoint to call

  // Event configuration
  events: jsonb("events").$type<string[]>().notNull(), // ['shift.created', 'invoice.paid', 'employee.hired']
  filters: jsonb("filters").$type<Record<string, any>>(), // Filter conditions: {department: 'sales', status: 'active'}

  // Authentication for outgoing webhooks
  authType: varchar("auth_type"), // 'none', 'basic', 'bearer', 'custom_header'
  authConfig: jsonb("auth_config").$type<{
    username?: string;
    password?: string;
    token?: string;
    customHeaders?: Record<string, string>;
  }>(),

  // Delivery settings
  retryPolicy: varchar("retry_policy").default('exponential'), // 'none', 'linear', 'exponential'
  maxRetries: integer("max_retries").default(3),
  timeoutSeconds: integer("timeout_seconds").default(30),

  // Health monitoring
  isHealthy: boolean("is_healthy").default(true),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  consecutiveFailures: integer("consecutive_failures").default(0),

  // Statistics
  totalDeliveries: integer("total_deliveries").default(0),
  successfulDeliveries: integer("successful_deliveries").default(0),
  failedDeliveries: integer("failed_deliveries").default(0),

  // Status
  isActive: boolean("is_active").default(true),
  pausedReason: text("paused_reason"),

  // Audit
  createdByUserId: varchar("created_by_user_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceActiveIndex: index("webhook_subscriptions_workspace_active_idx").on(table.workspaceId, table.isActive),
  eventIndex: index("webhook_subscriptions_event_idx").on(table.events),
  healthIndex: index("webhook_subscriptions_health_idx").on(table.isHealthy, table.consecutiveFailures),
}));

export const promotionalBanners = pgTable("promotional_banners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Banner content
  message: text("message").notNull(), // Main promotional message
  ctaText: varchar("cta_text", { length: 100 }), // Call-to-action button text (optional)
  ctaLink: varchar("cta_link", { length: 500 }), // CTA button link (optional)

  // Display settings
  isActive: boolean("is_active").default(false), // Only one banner can be active at a time
  priority: integer("priority").default(0), // Higher priority shown first if multiple active

  // Tracking
  createdBy: varchar("created_by").notNull(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeIndex: index("promotional_banners_active_idx").on(table.isActive, table.priority),
}));

export const onboardingTemplates = pgTable("onboarding_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Template details
  name: varchar("name").notNull(),
  description: text("description"),
  departmentName: varchar("department_name"), // Department name (no FK)
  roleTemplateId: varchar("role_template_id"),

  // Timeline
  durationDays: integer("duration_days").default(30), // Typical onboarding length

  // Status
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const onboardingTasks = pgTable("onboarding_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  templateId: varchar("template_id").notNull(),

  // Task details
  title: varchar("title").notNull(),
  description: text("description"),
  taskType: varchar("task_type").notNull(), // 'document', 'training', 'meeting', 'equipment', 'access', 'orientation'

  // Assignment
  assignedTo: varchar("assigned_to"), // 'new_hire', 'manager', 'hr', 'it', specific_user_id
  dayOffset: integer("day_offset").default(0), // Day # in onboarding (0 = first day)

  // Requirements
  isRequired: boolean("is_required").default(true),
  requiresDocument: boolean("requires_document").default(false),
  requiresSignature: boolean("requires_signature").default(false),

  // Ordering
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationOnboarding = pgTable("organization_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  
  // Setup progress
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").default(8),
  isCompleted: boolean("is_completed").default(false),
  
  // Step completion tracking
  step1CompanyInfo: boolean("step1_company_info").default(false),
  step2BillingInfo: boolean("step2_billing_info").default(false),
  step3RolesPermissions: boolean("step3_roles_permissions").default(false),
  step4InviteEmployees: boolean("step4_invite_employees").default(false),
  step5AddCustomers: boolean("step5_add_customers").default(false),
  step6ConfigurePayroll: boolean("step6_configure_payroll").default(false),
  step7SetupIntegrations: boolean("step7_setup_integrations").default(false),
  step8ReviewLaunch: boolean("step8_review_launch").default(false),
  
  // Completion tracking
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  
  // Skip tracking
  skippedSteps: text("skipped_steps").array().default(sql`ARRAY[]::text[]`),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("organization_onboarding_workspace_idx").on(table.workspaceId),
  completedIdx: index("organization_onboarding_completed_idx").on(table.isCompleted),
}));

export const organizationRoomOnboarding = pgTable("organization_room_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  
  // Progress tracking
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").default(4),
  isCompleted: boolean("is_completed").default(false),
  
  // Step completion
  step1RoomName: boolean("step1_room_name").default(false), // Name the room
  step2Channels: boolean("step2_channels").default(false),  // Add sub-channels
  step3Members: boolean("step3_members").default(false),    // Assign roles
  step4Settings: boolean("step4_settings").default(false),  // Configure settings
  
  // Onboarding data (collected during flow)
  roomNameInput: varchar("room_name_input"),
  channelsInput: text("channels_input").array().default(sql`ARRAY[]::text[]`), // Array of channel names
  guestAccessEnabled: boolean("guest_access_enabled").default(true),
  
  // Completion
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("org_room_onboarding_workspace_idx").on(table.workspaceId),
  completedIdx: index("org_room_onboarding_completed_idx").on(table.isCompleted),
}));

export const workspaceAddons = pgTable("workspace_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  addonId: varchar("addon_id").notNull(),
  
  // Subscription status
  status: varchar("status").notNull().default('active'), // 'active', 'suspended', 'cancelled'
  
  // Purchase info
  purchasedBy: varchar("purchased_by").notNull(), // User who activated
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  
  // Billing
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id"), // Stripe subscription item ID
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  
  // Token usage tracking (for hybrid pricing with monthly allowances)
  monthlyTokensUsed: decimal("monthly_tokens_used", { precision: 15, scale: 2 }).default("0"),
  lastUsageResetAt: timestamp("last_usage_reset_at").defaultNow(),
  
  // Cancellation
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by"),
  cancellationReason: text("cancellation_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  startsAt: timestamp("starts_at"),
}, (table) => ({
  workspaceIdx: index("workspace_addons_workspace_idx").on(table.workspaceId),
  addonIdx: index("workspace_addons_addon_idx").on(table.addonId),
  statusIdx: index("workspace_addons_status_idx").on(table.status),
  uniqueWorkspaceAddon: uniqueIndex("unique_workspace_addon").on(table.workspaceId, table.addonId),
}));

export const featureUpdates = pgTable("feature_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Content
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  category: featureUpdateCategoryEnum("category").notNull(),
  isMajor: boolean("is_major").default(false), // Only major updates show in badge
  
  // Optional links
  learnMoreUrl: varchar("learn_more_url"),
  documentationUrl: varchar("documentation_url"),
  
  // Lifecycle management
  status: featureUpdateStatusEnum("status").notNull().default('draft'),
  releaseAt: timestamp("release_at"), // When to make visible (null = immediate)
  expireAt: timestamp("expire_at"),   // When to hide (null = never expire)
  
  // Admin metadata
  createdBy: varchar("created_by"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("feature_updates_status_idx").on(table.status),
  index("feature_updates_release_idx").on(table.releaseAt),
  index("feature_updates_major_idx").on(table.isMajor),
]);

export const featureUpdateReceipts = pgTable("feature_update_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User tracking (workspace-scoped)
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  featureUpdateId: varchar("feature_update_id").notNull(),
  
  // Interaction tracking
  viewedAt: timestamp("viewed_at"), // When user first saw it
  dismissedAt: timestamp("dismissed_at"), // When user dismissed it
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("feature_receipts_user_idx").on(table.userId),
  index("feature_receipts_workspace_idx").on(table.workspaceId),
  index("feature_receipts_update_idx").on(table.featureUpdateId),
  // Ensure one receipt per user+workspace+update
  index("feature_receipts_unique_idx").on(table.userId, table.workspaceId, table.featureUpdateId),
]);

export const orgInvitations = pgTable("org_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  email: varchar("email").notNull(),
  organizationName: varchar("organization_name").notNull(),
  contactName: varchar("contact_name"),
  status: varchar("status").default("pending"),
  invitationToken: varchar("invitation_token").unique(),
  invitationTokenExpiry: timestamp("invitation_token_expiry"),
  uniqueInviteCode: varchar("unique_invite_code", { length: 20 }).unique(),
  acceptedWorkspaceId: varchar("accepted_workspace_id"),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: varchar("accepted_by"),
  sentBy: varchar("sent_by"),
  sentAt: timestamp("sent_at").defaultNow(),
  onboardingProgress: integer("onboarding_progress").default(0),
  completedSteps: text("completed_steps").array().default(sql`ARRAY[]::text[]`),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("org_invitations_email_idx").on(table.email),
  index("org_invitations_status_idx").on(table.status),
]);

export const interactiveOnboardingState = pgTable("interactive_onboarding_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  
  // Step tracking
  stepId: varchar("step_id", { length: 100 }).notNull(),
  stepTitle: varchar("step_title", { length: 200 }),
  stepOrder: integer("step_order").default(0),
  
  // Status
  completed: boolean("completed").default(false),
  skipped: boolean("skipped").default(false),
  completedAt: timestamp("completed_at"),
  skippedAt: timestamp("skipped_at"),
  
  // AI suggestions
  aiSuggestion: text("ai_suggestion"),
  aiSuggestionGeneratedAt: timestamp("ai_suggestion_generated_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ios_user_idx").on(table.userId),
  index("ios_workspace_idx").on(table.workspaceId),
  index("ios_step_idx").on(table.stepId),
  uniqueIndex("ios_user_workspace_step_unique").on(table.userId, table.workspaceId, table.stepId),
]);

export const orgDocuments = pgTable("org_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  uploadedBy: varchar("uploaded_by"),
  
  category: varchar("category", { length: 50 }).notNull(), // 'client_contract', 'employee_handbook', 'sop', 'training_material', 'form', 'proposal', 'shared'
  fileName: varchar("file_name").notNull(),
  filePath: text("file_path").notNull(), // Storage path
  fileSizeBytes: integer("file_size_bytes"),
  fileType: varchar("file_type", { length: 50 }), // 'pdf', 'docx', 'jpg', etc.
  
  description: text("description"),
  requiresSignature: boolean("requires_signature").default(false),
  version: integer("version").default(1),
  replacesDocumentId: varchar("replaces_document_id"),
  
  // Signature tracking
  signatureRequired: varchar("signature_required", { length: 30 }), // 'all_employees', 'specific_users', 'external'
  totalSignaturesRequired: integer("total_signatures_required").default(0),
  signaturesCompleted: integer("signatures_completed").default(0),
  
  // PDF field placement: [{page, xPct, yPct, widthPct, heightPct, type, recipientIndex, label}]
  signatureFields: jsonb("signature_fields").$type<Array<{ id: string; page: number; xPct: number; yPct: number; widthPct: number; heightPct: number; type: "signature" | "initial" | "date" | "text"; recipientIndex: number; label?: string }>>(),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),

  accessConfig: jsonb("access_config").default('{}'),
  signatureData: jsonb("signature_data").default('{}'),
}, (table) => [
  index("org_documents_workspace_idx").on(table.workspaceId),
  index("org_documents_category_idx").on(table.category),
  index("org_documents_uploaded_by_idx").on(table.uploadedBy),
  index("org_documents_requires_sig_idx").on(table.requiresSignature),
]);

export const orgDocumentAccess = pgTable("org_document_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull(),
  userId: varchar("user_id"),
  
  viewedAt: timestamp("viewed_at").defaultNow(),
  signedAt: timestamp("signed_at"),
  ipAddress: varchar("ip_address", { length: 45 }),

  workspaceId: varchar("workspace_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("org_doc_access_document_idx").on(table.documentId),
  index("org_doc_access_user_idx").on(table.userId),
]);

export const industryServiceTemplates = pgTable("industry_service_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  industryKey: varchar("industry_key", { length: 50 }).notNull(), // security, cleaning, home_health, hvac, plumbing, painting, landscaping, electrical
  serviceName: varchar("service_name", { length: 200 }).notNull(),
  serviceCode: varchar("service_code", { length: 50 }), // Industry standard code if applicable
  description: text("description"),
  defaultRate: decimal("default_rate", { precision: 10, scale: 2 }),
  rateType: varchar("rate_type", { length: 20 }).default("hourly"), // hourly, flat, per_unit
  unitLabel: varchar("unit_label", { length: 50 }), // hour, visit, sqft, job
  qboItemType: varchar("qbo_item_type", { length: 30 }).default("Service"), // Service, NonInventory
  taxable: boolean("taxable").default(false),
  evvRequired: boolean("evv_required").default(false), // For home health services
  evvBillingCode: varchar("evv_billing_code", { length: 20 }), // EVV code if applicable
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("industry_templates_industry_idx").on(table.industryKey),
  index("industry_templates_active_idx").on(table.isActive),
]);

export const workspaceServiceCatalog = pgTable("workspace_service_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  templateId: varchar("template_id"), // Source template if any
  serviceName: varchar("service_name", { length: 200 }).notNull(),
  serviceCode: varchar("service_code", { length: 50 }),
  description: text("description"),
  defaultRate: decimal("default_rate", { precision: 10, scale: 2 }),
  rateType: varchar("rate_type", { length: 20 }).default("hourly"),
  unitLabel: varchar("unit_label", { length: 50 }),
  // QuickBooks mapping
  qboItemId: varchar("qbo_item_id", { length: 100 }),
  qboItemSyncToken: varchar("qbo_item_sync_token", { length: 50 }),
  qboLastSynced: timestamp("qbo_last_synced"),
  // EVV for home health
  evvRequired: boolean("evv_required").default(false),
  evvBillingCode: varchar("evv_billing_code", { length: 20 }),
  taxable: boolean("taxable").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("workspace_catalog_workspace_idx").on(table.workspaceId),
  index("workspace_catalog_qbo_idx").on(table.qboItemId),
  index("workspace_catalog_evv_idx").on(table.evvBillingCode),
]);

export const orgFeatures = pgTable("org_features", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  featureKey: varchar("feature_key", { length: 100 }).notNull(),
  
  // Status: 'included', 'included_monitored', 'addon', 'disabled'
  status: varchar("status", { length: 30 }).notNull().default('included'),
  
  // Limits and usage
  usageLimit: integer("usage_limit"),
  currentUsage: integer("current_usage").default(0),
  overageAllowed: boolean("overage_allowed").default(false),
  
  // Source: 'tier', 'addon', 'promotional'
  source: varchar("source", { length: 20 }).default('tier'),
  addonId: varchar("addon_id"),
  
  enabledAt: timestamp("enabled_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("org_features_workspace_idx").on(table.workspaceId),
  index("org_features_key_idx").on(table.featureKey),
]);

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull(),

  // ============================================================================
  // UNIVERSAL IDENTIFICATION SYSTEM — Phase 57
  // Human-readable org ID for voice, documents, support, and Trinity resolution
  // Format: ORG-[STATE]-[NNNNN]  e.g. ORG-TX-00142
  // ============================================================================
  orgId: varchar("org_id").unique(), // e.g. ORG-TX-00142 — canonical human-readable ID

  // Unique organization identifiers for support tracking
  organizationId: varchar("organization_id").unique(), // Format: wfosupport-#########
  organizationSerial: varchar("organization_serial").unique(), // Format: ORG-XXXX-XXXX (Enterprise license key for tier unlocking)

  // Workspace type - distinguishes platform support orgs from regular business orgs
  workspaceType: varchar("workspace_type").default("business"), // 'business' (default) | 'platform_support' | 'internal'
  isPlatformSupport: boolean("is_platform_support").default(false), // Quick check for platform support workspace

  // Business information
  companyName: varchar("company_name"),
  businessCategory: businessCategoryEnum("business_category").default("general"), // Industry type
  industryDescription: text("industry_description"), // Additional context
  taxId: varchar("tax_id"),
  address: text("address"),
  phone: varchar("phone"),
  website: varchar("website"),
  logoUrl: varchar("logo_url"),
  brandColor: varchar("brand_color"),

  // State licensing for regulated industries (security, healthcare, etc.)
  stateLicenseNumber: varchar("state_license_number"), // e.g., C11608501 for Texas PSB
  stateLicenseState: varchar("state_license_state"), // State code (TX, CA, FL, NY)
  stateLicenseExpiry: timestamp("state_license_expiry"), // When license expires
  stateLicenseDocumentId: varchar("state_license_document_id"), // Reference to uploaded license document
  stateLicenseVerified: boolean("state_license_verified").default(false), // Trinity AI verification status
  stateLicenseVerifiedAt: timestamp("state_license_verified_at"), // When Trinity verified the license

  // Subscription & billing
  subscriptionTier: varchar("subscription_tier").default("free"), // 'free', 'starter', 'professional', 'enterprise'
  subscriptionStatus: varchar("subscription_status").default("active"), // 'active', 'suspended', 'cancelled'
  maxEmployees: integer("max_employees").default(5),
  maxClients: integer("max_clients").default(10),

  // ============================================================================
  // FOUNDER EXEMPTION — PERMANENT PLATFORM RULE (Statewide Protective Services)
  // founderExemption: workspace is the founding client — enterprise forever, no charges
  // billingExempt: skips ALL Stripe charges, credit deductions, and seat limits
  // These flags must NEVER be unset by any automated process. Human-only.
  // ============================================================================
  founderExemption: boolean("founder_exemption").default(false),
  billingExempt: boolean("billing_exempt").default(false),

  // ============================================================================
  // COPILOT AUTOMATION GOVERNANCE (99% Automation / 1% Human Approval)
  // AI makes errors - every org must designate an approver for automated actions
  // ============================================================================
  designatedApproverId: varchar("designated_approver_id"), // User who approves automated actions
  automationApprovalMode: varchar("automation_approval_mode").default("designated"), // 'designated' | 'owner_only' | 'any_manager'
  automationConsentAccepted: boolean("automation_consent_accepted").default(false), // Org accepted AI copilot terms
  
  // ============================================================================
  // VIEW MODE SETTINGS - Pro View vs Easy/Simple Mode
  // Controls UI complexity per org (can be overridden per employee)
  // ============================================================================
  defaultViewMode: varchar("default_view_mode").default("auto"), // 'auto' | 'simple' | 'pro'
  forceSimpleMode: boolean("force_simple_mode").default(false), // If true, all users see simple mode
  automationConsentAcceptedAt: timestamp("automation_consent_accepted_at"),
  automationConsentAcceptedBy: varchar("automation_consent_accepted_by"), // User ID who accepted

  // Stripe Connect for payment processing
  stripeAccountId: varchar("stripe_account_id"), // Connected account ID
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),

  // Platform fee
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 2 }).default("3.00"),

  // Account control & admin actions
  // Deactivation (unified access control - support staff only for orgs)
  isDeactivated: boolean("is_deactivated").default(false),
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by"),
  deactivationReason: text("deactivation_reason"),

  isSuspended: boolean("is_suspended").default(false), // General suspension
  suspendedReason: text("suspended_reason"), // Why suspended
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by"), // Admin user ID who suspended

  isFrozen: boolean("is_frozen").default(false), // Freeze for non-payment
  frozenReason: text("frozen_reason"),
  frozenAt: timestamp("frozen_at"),
  frozenBy: varchar("frozen_by"),

  isLocked: boolean("is_locked").default(false), // Emergency lock
  lockedReason: text("locked_reason"),
  lockedAt: timestamp("locked_at"),
  lockedBy: varchar("locked_by"),

  // ============================================================================
  // INVESTIGATION SERVICE CONTROLS - ROOT/SUPPORT Staff Only
  // Per-workspace service suspension for investigations/compliance
  // ============================================================================
  
  // Trinity Mascot Control
  trinitySuspended: boolean("trinity_suspended").default(false),
  trinitySuspendedReason: text("trinity_suspended_reason"),
  trinitySuspendedAt: timestamp("trinity_suspended_at"),
  trinitySuspendedBy: varchar("trinity_suspended_by"),
  
  // Chat Service Control  
  chatSuspended: boolean("chat_suspended").default(false),
  chatSuspendedReason: text("chat_suspended_reason"),
  chatSuspendedAt: timestamp("chat_suspended_at"),
  chatSuspendedBy: varchar("chat_suspended_by"),
  
  // Automation Service Control (disables all scheduled jobs for this workspace)
  automationsSuspended: boolean("automations_suspended").default(false),
  automationsSuspendedReason: text("automations_suspended_reason"),
  automationsSuspendedAt: timestamp("automations_suspended_at"),
  automationsSuspendedBy: varchar("automations_suspended_by"),
  
  // AI Brain Service Control (disables HelpAI/AI features for this workspace)
  aiBrainSuspended: boolean("ai_brain_suspended").default(false),
  aiBrainSuspendedReason: text("ai_brain_suspended_reason"),
  aiBrainSuspendedAt: timestamp("ai_brain_suspended_at"),
  aiBrainSuspendedBy: varchar("ai_brain_suspended_by"),

  // AI Feature Trials & Activation (Subscriber Pays All Model)
  // Scheduling Platform AI Auto-Scheduling
  scheduleosTrialStartedAt: timestamp("scheduleos_trial_started_at"), // 7-day free trial
  scheduleosActivatedAt: timestamp("scheduleos_activated_at"), // Payment confirmed, feature unlocked
  scheduleosActivatedBy: varchar("scheduleos_activated_by"), // User ID who activated (Owner/Manager only)
  scheduleosPaymentMethod: varchar("scheduleos_payment_method"), // 'stripe_subscription' | 'stripe_card'
  scheduleosPaymentIntentId: varchar("scheduleos_payment_intent_id"), // Stripe Payment Intent ID to prevent reuse

  // Future AI Features (following same pattern)
  hireosTrialStartedAt: timestamp("hireos_trial_started_at"),
  hireosActivatedAt: timestamp("hireos_activated_at"),
  hireosActivatedBy: varchar("hireos_activated_by"),

  // ============================================================================
  // MASTER KEYS - ROOT-ONLY ORGANIZATION MANAGEMENT
  // ============================================================================

  // Feature Toggles (ROOT can enable/disable individual OS modules)
  featureScheduleosEnabled: boolean("feature_scheduleos_enabled").default(false), // AI automation defaults OFF - must be explicitly activated
  featureTimeosEnabled: boolean("feature_timeos_enabled").default(true),
  featurePayrollosEnabled: boolean("feature_payrollos_enabled").default(false), // In dev
  featureBillosEnabled: boolean("feature_billos_enabled").default(true),
  featureHireosEnabled: boolean("feature_hireos_enabled").default(true),
  featureReportosEnabled: boolean("feature_reportos_enabled").default(true),
  featureAnalyticsosEnabled: boolean("feature_analyticsos_enabled").default(true),
  featureSupportosEnabled: boolean("feature_supportos_enabled").default(true),
  featureCommunicationosEnabled: boolean("feature_communicationos_enabled").default(true),

  // Billing Overrides (ROOT can give free/discounted service)
  billingOverrideType: varchar("billing_override_type"), // 'free', 'discount', 'custom', null = normal
  billingOverrideDiscountPercent: integer("billing_override_discount_percent"), // 0-100
  billingOverrideCustomPrice: decimal("billing_override_custom_price", { precision: 10, scale: 2 }), // Fixed monthly price
  billingOverrideReason: text("billing_override_reason"), // Why override applied
  billingOverrideAppliedBy: varchar("billing_override_applied_by"), // ROOT user ID
  billingOverrideAppliedAt: timestamp("billing_override_applied_at"),
  billingOverrideExpiresAt: timestamp("billing_override_expires_at"), // Auto-revert date

  // ============================================================================
  // GAP FIXES - CONFIGURABLE SETTINGS (Gap #6, #7, #8)
  // ============================================================================
  
  // HelpAI Bot Configuration (Gap #7)
  enableHelpOSBot: boolean("enable_helpos_bot").default(true), // Allow disabling bot per workspace
  
  // ============================================================================
  // STAFFING EMAIL ROUTING (Only ONE workspace can claim the generic staffing email)
  // Generic emails to staffing@coaileague.com route to the claiming workspace
  // ============================================================================
  staffingEmail: varchar("staffing_email"), // Actual email address used for staffing correspondence
  hasStaffingEmailClaim: boolean("has_staffing_email_claim").default(false), // Only 1 workspace can have this true
  staffingEmailClaimedAt: timestamp("staffing_email_claimed_at"),
  staffingEmailClaimedBy: varchar("staffing_email_claimed_by"), // User ID who claimed it

  
  // Trinity Diagnostic & Recovery Tools Access
  trinityDiagnosticsEnabled: boolean("trinity_diagnostics_enabled").default(true), // Allow org owners to enable/disable Trinity AI recovery tools
  trinityDiagnosticsEnabledAt: timestamp("trinity_diagnostics_enabled_at"),
  trinityDiagnosticsEnabledBy: varchar("trinity_diagnostics_enabled_by"), // User who last changed this setting
  
  // Client Tax Rate Configuration (Gap #8)
  defaultTaxRate: decimal("default_tax_rate", { precision: 5, scale: 4 }).default("0.08875"), // Default 8.875%
  taxJurisdiction: varchar("tax_jurisdiction"), // State/country for tax lookup

  // ============================================================================
  // INVOICE FINANCIAL CONFIGURATION
  // Required for invoice pipeline: send → pay → close → records
  // ============================================================================
  invoicePrefix: varchar("invoice_prefix", { length: 10 }).default("INV"),            // Prefix for invoice numbers (e.g. INV, SGA, SEC)
  invoiceNextNumber: integer("invoice_next_number").default(1000),                     // Auto-increment sequence for invoice numbering
  lateFeePercentage: decimal("late_fee_percentage", { precision: 5, scale: 2 }).default("0"), // % late fee applied after due date
  lateFeeDays: integer("late_fee_days").default(30),                                   // Days grace period before late fee applies
  billingEmail: varchar("billing_email", { length: 255 }),                             // FROM address used when sending invoices to clients
  paymentTermsDays: integer("payment_terms_days").default(30),                         // Net days for payment (Net 30 = 30, Net 15 = 15)
  companyCity: varchar("company_city", { length: 100 }),                               // City for invoice header / billing address
  companyState: varchar("company_state", { length: 50 }),                              // State for invoice header / billing address
  companyZip: varchar("company_zip", { length: 20 }),                                  // ZIP for invoice header / billing address

  // ============================================================================
  // PAYROLL FINANCIAL CONFIGURATION
  // Required for payroll pipeline: hours → calculate → tax → deposit → records
  // ============================================================================
  stateUnemploymentRate: decimal("state_unemployment_rate", { precision: 5, scale: 4 }).default("0.027"), // Employer SUI rate (e.g. 2.7%)
  workerCompRate: decimal("worker_comp_rate", { precision: 5, scale: 4 }).default("0.015"),               // Worker's comp rate (e.g. 1.5%)
  payrollBankName: varchar("payroll_bank_name", { length: 100 }),                      // Company bank used to fund payroll
  payrollBankRouting: varchar("payroll_bank_routing", { length: 20 }),                 // ABA routing number for payroll ACH
  payrollBankAccount: varchar("payroll_bank_account", { length: 50 }),                 // Account number for payroll funding
  payrollMemo: varchar("payroll_memo", { length: 255 }),                               // Default memo/description on payroll transactions

  // Plaid Integration for payroll direct deposit
  plaidAccessTokenEncrypted: text("plaid_access_token_encrypted"),  // AES-256-GCM encrypted Plaid access token
  plaidItemId: varchar("plaid_item_id"),                            // Plaid Item ID for this workspace bank connection
  plaidAccountLast4: varchar("plaid_account_last4", { length: 4 }), // Last 4 digits of connected bank account

  // Organization owner name (display name, may differ from company name)
  ownerName: varchar("owner_name"),

  // Payroll & billing scheduling shorthand
  payrollCycle: varchar("payroll_cycle"), // weekly, biweekly, semimonthly, monthly

  // Labor Law Jurisdiction (Break Scheduling Compliance)
  laborLawJurisdiction: varchar("labor_law_jurisdiction").default('US-FEDERAL'), // State/country code for break rules (e.g., 'CA', 'NY', 'TX', 'US-FEDERAL')
  autoBreakSchedulingEnabled: boolean("auto_break_scheduling_enabled").default(true), // Enable automatic break scheduling
  breakComplianceAlerts: boolean("break_compliance_alerts").default(true), // Send alerts for compliance violations
  
  // Industry Benchmarking (Gap #5)
  industry: varchar("industry"), // For benchmark comparisons
  companySize: varchar("company_size"), // 'small', 'medium', 'large', 'enterprise'

  // ============================================================================
  // HIERARCHICAL INDUSTRY TAXONOMY (3-Level Classification)
  // Used for Trinity onboarding orchestration, compliance templates, and ABAC policies
  // ============================================================================
  
  sectorId: varchar("sector_id"), // Level 1: e.g., 'construction', 'healthcare', 'security'
  industryGroupId: varchar("industry_group_id"), // Level 2: e.g., 'specialty_contractors', 'guard_services'
  subIndustryId: varchar("sub_industry_id"), // Level 3: e.g., 'electrician', 'plumber', 'armed_guard'
  
  industryTaxonomyVersion: varchar("industry_taxonomy_version"), // Version of taxonomy used for selection
  industrySelectedAt: timestamp("industry_selected_at"), // When industry was selected
  industrySelectedBy: varchar("industry_selected_by"), // User who selected the industry
  
  industryComplianceTemplates: text("industry_compliance_templates").array().default(sql`ARRAY[]::text[]`), // Active compliance templates
  industryCertifications: text("industry_certifications").array().default(sql`ARRAY[]::text[]`), // Required certifications for this industry
  
  industryOnboardingComplete: boolean("industry_onboarding_complete").default(false), // Industry-specific onboarding complete
  industryVerifiedBy: varchar("industry_verified_by"), // User/AI that verified industry classification
  industryVerifiedAt: timestamp("industry_verified_at"),
  
  // Custom Industry Support (for "Other / My Industry Not Listed" sector)
  customIndustryName: varchar("custom_industry_name"), // User-defined industry name when using "Other/Custom"
  customIndustryDescription: text("custom_industry_description"), // User-defined industry description

  // Manual Adjustments & Notes
  adminNotes: text("admin_notes"), // ROOT private notes about this org
  adminFlags: text("admin_flags").array().default(sql`ARRAY[]::text[]`), // Tags: 'vip', 'watchlist', 'partner', 'delinquent'
  lastAdminAction: text("last_admin_action"), // Description of last ROOT action
  lastAdminActionBy: varchar("last_admin_action_by"), // ROOT user ID
  lastAdminActionAt: timestamp("last_admin_action_at"),

  // ============================================================================
  // ADVANCED BILLING & ACCOUNT STATE MANAGEMENT
  // ============================================================================
  
  // Account state (subscription enforcement)
  accountState: varchar("account_state").default('active'), // Maps to accountStateEnum but stored as varchar for flexibility
  accountSuspensionReason: text("account_suspension_reason"),
  accountSuspendedAt: timestamp("account_suspended_at"),
  supportTicketId: varchar("support_ticket_id"), // For support intervention tracking
  
  // Billing schedule
  nextInvoiceAt: timestamp("next_invoice_at"), // When next invoice will be generated
  lastInvoiceGeneratedAt: timestamp("last_invoice_generated_at"),
  billingCycleDay: integer("billing_cycle_day").default(1), // Day of week for weekly billing (0=Sunday, 1=Monday, etc.)
  
  // Billing preferences
  billingPreferences: jsonb("billing_preferences"), // { autoPayEnabled, paymentTerms, reminderDays, etc. }
  
  // Usage limits & overages
  monthlyEmployeeOverages: integer("monthly_employee_overages").default(0), // Employees above plan limit
  lastOverageCheckAt: timestamp("last_overage_check_at"),

  // ============================================================================
  // AUTOMATION SETTINGS - Organization-Level Schedule Configuration
  // ============================================================================
  
  // Billing Platform Invoicing Automation
  autoInvoicingEnabled: boolean("auto_invoicing_enabled").default(true), // Enable/disable auto-invoice generation
  invoiceSchedule: varchar("invoice_schedule").default('monthly'), // 'weekly', 'biweekly', 'semi-monthly', 'monthly', 'net30', 'custom'
  invoiceCustomDays: integer("invoice_custom_days"), // For 'custom' schedule (e.g., every 10 days)
  invoiceDayOfWeek: integer("invoice_day_of_week"), // 0-6 for weekly/biweekly (0=Sunday)
  invoiceDayOfMonth: integer("invoice_day_of_month").default(1), // 1-31 for monthly/semi-monthly
  
  // Payroll Platform Payroll Automation
  autoPayrollEnabled: boolean("auto_payroll_enabled").default(true), // Enable/disable auto-payroll processing
  autoSubmitPayroll: boolean("auto_submit_payroll").default(false), // SAFETY MODE: Auto-submit to Gusto (defaults to manual approval)
  payrollSchedule: varchar("payroll_schedule").default('biweekly'), // 'weekly', 'biweekly', 'semi-monthly', 'monthly', 'custom'
  payrollCustomDays: integer("payroll_custom_days"), // For 'custom' schedule
  payrollDayOfWeek: integer("payroll_day_of_week").default(1), // 0-6 for weekly/biweekly (1=Monday)
  payrollDayOfMonth: integer("payroll_day_of_month").default(1), // 1-31 for monthly (process day)
  payrollCutoffDay: integer("payroll_cutoff_day").default(15), // 1-31 for semi-monthly (second pay date)
  
  // Scheduling Platform Schedule Generation Automation
  autoSchedulingEnabled: boolean("auto_scheduling_enabled").default(true), // Enable/disable auto-schedule generation
  scheduleGenerationInterval: varchar("schedule_generation_interval").default('weekly'), // 'weekly', 'biweekly', 'monthly', 'custom'
  scheduleCustomDays: integer("schedule_custom_days"), // For 'custom' interval
  scheduleAdvanceNoticeDays: integer("schedule_advance_notice_days").default(7), // How many days in advance to generate (default 7)
  scheduleDayOfWeek: integer("schedule_day_of_week").default(0), // 0-6 for weekly/biweekly (0=Sunday)
  scheduleDayOfMonth: integer("schedule_day_of_month"), // 1-31 for monthly

  // Biweekly Anchor Dates - Fix month-boundary drift
  invoiceBiweeklyAnchor: timestamp("invoice_biweekly_anchor", { withTimezone: true }), // Last biweekly invoice anchor date
  scheduleBiweeklyAnchor: timestamp("schedule_biweekly_anchor", { withTimezone: true }), // Last biweekly schedule anchor date
  payrollBiweeklyAnchor: timestamp("payroll_biweekly_anchor", { withTimezone: true }), // Last biweekly payroll anchor date

  // Last Run Tracking - Enables custom intervals and prevents duplicate runs
  lastInvoiceRunAt: timestamp("last_invoice_run_at", { withTimezone: true }),
  lastScheduleRunAt: timestamp("last_schedule_run_at", { withTimezone: true }),
  lastPayrollRunAt: timestamp("last_payroll_run_at", { withTimezone: true }),

  // ============================================================================
  // OVERTIME & RATE CONFIGURATION
  // ============================================================================
  
  // Overtime Rules
  enableDailyOvertime: boolean("enable_daily_overtime").default(false), // Enable 8-hour daily OT threshold
  dailyOvertimeThreshold: decimal("daily_overtime_threshold", { precision: 5, scale: 2 }).default("8.00"), // Hours per day before OT
  weeklyOvertimeThreshold: decimal("weekly_overtime_threshold", { precision: 5, scale: 2 }).default("40.00"), // Hours per week before OT (FLSA standard)
  
  // Default Rates (fallback when employee/client rates not configured)
  defaultBillableRate: decimal("default_billable_rate", { precision: 10, scale: 2 }), // Default billing rate for client invoices
  defaultHourlyRate: decimal("default_hourly_rate", { precision: 10, scale: 2 }), // Default pay rate for employees

  // ============================================================================
  // HOLIDAY CALENDAR & RATE MULTIPLIERS
  // ============================================================================

  // Timezone for local date calculations (IANA format, e.g., "America/New_York")
  // Used for holiday detection and shift segmentation at midnight boundaries
  timezone: varchar("timezone").default("America/New_York"),

  // Holiday Calendar (array of ISO dates with optional metadata)
  // Format: [{"date": "2025-12-25", "name": "Christmas", "billMultiplier": 2.5, "payMultiplier": 2.0}]
  holidayCalendar: jsonb("holiday_calendar").default('[]'),

  // Overtime Multipliers (default 1.5x for billing and pay)
  overtimeBillableMultiplier: decimal("overtime_billable_multiplier", { precision: 5, scale: 2 }).default("1.50"),
  overtimePayMultiplier: decimal("overtime_pay_multiplier", { precision: 5, scale: 2 }).default("1.50"),

  // Holiday Multipliers (default 2.0x for billing and pay)
  holidayBillableMultiplier: decimal("holiday_billable_multiplier", { precision: 5, scale: 2 }).default("2.00"),
  holidayPayMultiplier: decimal("holiday_pay_multiplier", { precision: 5, scale: 2 }).default("2.00"),

  // ============================================================================
  // SALES/ONBOARDING PIPELINE (Gamification & Rewards)
  // ============================================================================
  
  // Pipeline status tracking
  pipelineStatus: varchar("pipeline_status").default('invited'), // 'invited', 'email_opened', 'trial_started', 'trial_active', 'trial_expired', 'accepted', 'rejected', 'churned'
  pipelineStatusUpdatedAt: timestamp("pipeline_status_updated_at"),
  invitedAt: timestamp("invited_at"),
  inviteEmailOpenedAt: timestamp("invite_email_opened_at"),
  
  // Trial tracking
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialDays: integer("trial_days").default(14), // 14-day default trial
  trialCreditsUsed: integer("trial_credits_used").default(0), // Credits consumed during trial
  
  // Onboarding progress
  onboardingCompletionPercent: integer("onboarding_completion_percent").default(0), // 0-100
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  totalOnboardingPoints: integer("total_onboarding_points").default(0), // Gamification points earned
  
  // ============================================================================
  // COMPREHENSIVE ONBOARDING STEPS & AUTOMATION UNLOCK
  // ============================================================================
  
  // Step-by-step completion tracking (JSONB for flexibility)
  // Format: { profile: true, payment: true, org_setup: false, employees: false, ... }
  onboardingStepsCompleted: jsonb("onboarding_steps_completed").default('{}'),
  
  // Required steps for full automation unlock
  // profile, payment, org_setup, first_employee, first_schedule, first_client, role_invites, api_integrations
  onboardingFullyComplete: boolean("onboarding_fully_complete").default(false), // All required steps done
  onboardingFullyCompleteAt: timestamp("onboarding_fully_complete_at"),
  
  // Automation feature gating - LOCKED until onboarding complete
  automationUnlocked: boolean("automation_unlocked").default(false), // Master automation unlock
  automationUnlockedAt: timestamp("automation_unlocked_at"),
  automationUnlockedBy: varchar("automation_unlocked_by"), // User who completed final step
  
  // First-time signup discount (10% off for completing onboarding)
  isFirstTimeOrg: boolean("is_first_time_org").default(true), // First org for this owner
  discountEligible: boolean("discount_eligible").default(true), // Eligible for 10% off
  discountRedeemed: boolean("discount_redeemed").default(false), // Already used discount
  discountRedeemedAt: timestamp("discount_redeemed_at"),
  discountCode: varchar("discount_code"), // Unique discount code
  discountPercentage: integer("discount_percentage").default(10), // Default 10% off
  
  // Business Buddy AI Credits
  businessBuddyEnabled: boolean("business_buddy_enabled").default(true), // Org can use Business Buddy
  businessBuddyCreditsBalance: integer("business_buddy_credits_balance").default(100), // Starting credits
  businessBuddyCreditsUsed: integer("business_buddy_credits_used").default(0), // Total consumed
  businessBuddyLastUsedAt: timestamp("business_buddy_last_used_at"),
  businessBuddySpawnedFor: text("business_buddy_spawned_for").array().default(sql`ARRAY[]::text[]`), // User IDs buddy is visible for
  
  // AI Usage Tracking & Billing
  aiUsageThisWeek: integer("ai_usage_this_week").default(0), // Tokens/calls this billing week
  aiUsageAllTime: integer("ai_usage_all_time").default(0), // Lifetime usage
  aiOverageChargedAt: timestamp("ai_overage_charged_at"), // Last overage billing
  aiOverageAmount: decimal("ai_overage_amount", { precision: 10, scale: 2 }).default("0.00"), // Pending overage charges
  
  // Conversion tracking
  acceptedAt: timestamp("accepted_at"), // When they subscribed
  rejectedAt: timestamp("rejected_at"), // When they declined
  rejectionReason: text("rejection_reason"),

  // ============================================================================
  // SUPPORT-ASSISTED ONBOARDING
  // Enables platform support staff to create and configure orgs on behalf of users
  // who cannot do so themselves (disability, time constraints, etc.)
  // ============================================================================
  
  // Assisted onboarding metadata
  assistedOnboardingBy: varchar("assisted_onboarding_by"), // Support staff userId who created this org
  assistedOnboardingAt: timestamp("assisted_onboarding_at"), // When assisted onboarding started
  assistedOnboardingNotes: text("assisted_onboarding_notes"), // Internal notes from support
  
  // Target user information (who will receive this org)
  targetUserEmail: varchar("target_user_email"), // Email of user who will receive ownership
  targetUserName: varchar("target_user_name"), // Name of the target user for personalization
  targetUserPhone: varchar("target_user_phone"), // Optional contact number
  
  // Handoff workflow status
  handoffStatus: varchar("handoff_status"), // 'pending_setup' | 'ready_for_handoff' | 'handoff_sent' | 'handoff_complete' | 'handoff_expired'
  handoffToken: varchar("handoff_token"), // Secure token for handoff link
  handoffTokenExpiry: timestamp("handoff_token_expiry"), // Token expiration (72 hours)
  handoffSentAt: timestamp("handoff_sent_at"), // When handoff email was sent
  handoffCompletedAt: timestamp("handoff_completed_at"), // When user accepted ownership
  handoffCompletedBy: varchar("handoff_completed_by"), // User ID who completed handoff
  
  // Document extraction tracking (Trinity AI integration)
  assistedDocsUploaded: integer("assisted_docs_uploaded").default(0), // Count of docs uploaded
  assistedDocsProcessed: integer("assisted_docs_processed").default(0), // Count of docs processed by AI
  assistedDataExtracted: jsonb("assisted_data_extracted"), // AI-extracted business data
  assistedExtractionStatus: varchar("assisted_extraction_status"), // 'pending' | 'processing' | 'complete' | 'failed'

  // ============================================================================
  // ORG CODE - INBOUND EMAIL ROUTING
  // Used for plus-addressing: staffing+ORGCODE@coaileague.com
  // ============================================================================
  orgCode: varchar("org_code").unique(), // Unique 3-12 char alphanumeric code (e.g., "STATEWIDE", "ACME123")
  orgCodeStatus: varchar("org_code_status").default("active"), // 'active' | 'reserved' | 'suspended' | 'released'
  orgCodeClaimedAt: timestamp("org_code_claimed_at"), // When the org code was first claimed
  orgCodeReleasedAt: timestamp("org_code_released_at"), // When org code was released (if cancelled)

  // ============================================================================
  // SUB-ORGANIZATION HIERARCHY (Multi-State / Multi-Branch Operations)
  // Org owners operating in many states can create sub-orgs under the main branch.
  // Sub-orgs share the parent's subscription tier, credit pool, and caps.
  // ============================================================================
  parentWorkspaceId: varchar("parent_workspace_id"), // Self-referencing: parent org ID (null = root org)
  isSubOrg: boolean("is_sub_org").default(false), // Quick check for sub-org status
  subOrgLabel: varchar("sub_org_label"), // Display label (e.g., "Dallas Branch", "Houston Office")
  operatingStates: text("operating_states").array().default(sql`ARRAY[]::text[]`), // States this org operates in (e.g., ['TX','CA','FL'])
  primaryOperatingState: varchar("primary_operating_state"), // Primary state code for this org/branch

  // Consolidated billing for sub-orgs
  consolidatedBillingEnabled: boolean("consolidated_billing_enabled").default(false), // Parent pays for all sub-orgs
  subOrgAddonCount: integer("sub_org_addon_count").default(0), // Number of active sub-orgs (cached on parent)
  subOrgCreditPoolShared: boolean("sub_org_credit_pool_shared").default(true), // Sub-orgs share parent credit pool
  subOrgCreatedAt: timestamp("sub_org_created_at"), // When this sub-org was added
  subOrgCreatedBy: varchar("sub_org_created_by"), // Who created this sub-org

  // ============================================================================
  // CONSOLIDATED CONFIG BLOBS (formerly separate satellite tables)
  // These replaced workspace_billing_settings, workspace_branding, workspace_sso_configs,
  // workspace_automation_policies, workspace_governance_policies, workspace_themes,
  // workspace_feature_states, workspace_currency_settings
  // ============================================================================
  billingSettingsBlob: jsonb("billing_settings_blob").default({}),
  brandingBlob: jsonb("branding_blob").default({}),
  ssoConfigBlob: jsonb("sso_config_blob").default({}),
  automationPolicyBlob: jsonb("automation_policy_blob").default({}),
  governancePolicyBlob: jsonb("governance_policy_blob").default({}),
  themeConfigBlob: jsonb("theme_config_blob").default({}),
  featureStatesBlob: jsonb("feature_states_blob").default({}),
  currencySettingsBlob: jsonb("currency_settings_blob").default({}),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  invoiceGenerationDay: integer("invoice_generation_day").default(1),
  payrollProcessDay: integer("payroll_process_day").default(1),
  scheduleGenerationDay: integer("schedule_generation_day").default(0),
  primaryCurrency: varchar("primary_currency"),
  currentCreditBalance: integer("current_credit_balance").default(0),
  monthlyCreditAllocation: integer("monthly_credit_allocation").default(0),
  billingCycle: varchar("billing_cycle"),
});

export const workspaceThemes = pgTable("workspace_themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),

  // Theming tier - determines what can be customized
  tier: varchar("tier").default("standard"), // 'standard', 'professional', 'white_label'

  // Color customization (HSL format: "H S% L%")
  primaryColor: varchar("primary_color"),
  secondaryColor: varchar("secondary_color"),
  successColor: varchar("success_color"),
  warningColor: varchar("warning_color"),
  errorColor: varchar("error_color"),

  // Logo & branding assets
  logoUrl: text("logo_url"),
  logoUrlInverted: text("logo_url_inverted"),
  faviconUrl: text("favicon_url"),
  loginBackgroundUrl: text("login_background_url"),

  // Typography
  fontFamily: varchar("font_family"),

  // Domain settings (Enterprise tier only)
  customDomain: varchar("custom_domain"),
  customEmailDomain: varchar("custom_email_domain"),

  // Branding removals (Enterprise tier only)
  removePoweredBy: boolean("remove_powered_by").default(false),
  removeClockworkLogo: boolean("remove_clockwork_logo").default(false),
  removeWatermarks: boolean("remove_watermarks").default(false),

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaceInvites = pgTable("workspace_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Invitation details
  inviteCode: varchar("invite_code").notNull().unique(),
  inviterUserId: varchar("inviter_user_id").notNull(),
  
  // Invitee information
  inviteeEmail: varchar("invitee_email"),
  inviteeRole: varchar("invitee_role").default("staff"),
  
  // Status tracking
  status: varchar("status").default("pending"),
  acceptedByUserId: varchar("accepted_by_user_id"),
  acceptedAt: timestamp("accepted_at"),
  
  // Expiry
  expiresAt: timestamp("expires_at").notNull(),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Recovered unmapped tables ─────────────────────────────────────────────

export const onboardingChecklists = pgTable("onboarding_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  applicationId: varchar("application_id").notNull(),
  employeeId: varchar("employee_id"),
  templateId: varchar("template_id"),

  // Progress tracking
  checklistItems: jsonb("checklist_items").notNull().$type<Array<{
    itemId: string;
    itemName: string;
    itemType: 'document' | 'signature' | 'certification' | 'form' | 'task';
    isRequired: boolean;
    isCompleted: boolean;
    completedAt?: Date;
    completedBy?: string;
    documentId?: string; // Link to employeeDocuments
    notes?: string;
  }>>(),

  overallProgress: integer("overall_progress").default(0), // 0-100%

  // Compliance deadlines
  i9DeadlineDate: timestamp("i9_deadline_date"), // 3 business days from hire
  onboardingCompletedAt: timestamp("onboarding_completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_onboarding_checklist_employee").on(table.employeeId),
  index("idx_onboarding_checklist_application").on(table.applicationId),
]);

export const orgOnboardingTasks = pgTable(
  "org_onboarding_tasks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull(),
    
    // Task definition
    title: varchar("title").notNull(),
    description: text("description"),
    category: varchar("category").default("setup"), // 'setup', 'configuration', 'engagement', 'billing'
    
    // Status tracking
    status: onboardingTaskStatusEnum("status").default('pending'),
    
    // Progress (for multi-step tasks)
    currentProgress: integer("current_progress").default(0), // e.g., 0
    targetProgress: integer("target_progress").default(1),   // e.g., 3 users invited
    progressUnit: varchar("progress_unit"),                  // e.g., "users", "automations"
    
    // Points/weight for gamification
    points: integer("points").default(10),
    displayOrder: integer("display_order").default(0),
    
    // Task creator and AI context
    createdBy: taskCreatorEnum("created_by").default('system'),
    aiSuggestionId: varchar("ai_suggestion_id"), // Reference to AI suggestion if generated by Gemini
    aiContext: jsonb("ai_context"),               // Context used for AI task generation
    
    // Completion tracking
    completedAt: timestamp("completed_at"),
    completedBy: varchar("completed_by"),
    
    // Validation
    validationRule: varchar("validation_rule"),   // e.g., 'user_count >= 3', 'automation_created'
    systemEvent: varchar("system_event"),         // Event that triggers completion check
    
    // Required for discount unlock
    requiredForReward: boolean("required_for_reward").default(true),
    
    createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("onboarding_task_workspace_idx").on(table.workspaceId),
    index("onboarding_task_status_idx").on(table.status),
    index("onboarding_task_category_idx").on(table.category),
    index("onboarding_task_order_idx").on(table.displayOrder),
  ]
);

export const orgRewards = pgTable(
  "org_rewards",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull(),
    
    // Reward definition
    type: rewardTypeEnum("type").notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    
    // Discount value
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),  // e.g., 10.00 for 10%
    discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),   // Fixed amount alternative
    
    // Status
    status: rewardStatusEnum("status").default('locked'),
    
    // Stripe integration
    stripeCouponId: varchar("stripe_coupon_id"),      // Coupon created in Stripe
    stripePromotionCodeId: varchar("stripe_promotion_code_id"), // Promo code for checkout
    promoCode: varchar("promo_code"),                 // User-facing promo code
    
    // Unlock conditions
    unlockCondition: varchar("unlock_condition"),     // e.g., 'all_tasks_completed'
    
    // Timestamps
    unlockedAt: timestamp("unlocked_at"),
    appliedAt: timestamp("applied_at"),
    appliedToInvoiceId: varchar("applied_to_invoice_id"),
    
    // Expiration
    expiresAt: timestamp("expires_at"),
    
    createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("org_rewards_workspace_idx").on(table.workspaceId),
    index("org_rewards_type_idx").on(table.type),
    index("org_rewards_status_idx").on(table.status),
    index("org_rewards_promo_idx").on(table.promoCode),
  ]
);


// ── workspace_role_labels ────────────────────────────────────────────────────
// Per-org display name overrides for canonical workspace roles.
// The RBAC role identifier (workspaceRoleEnum) NEVER changes — only the label
// shown to end users changes. Org owners can rename roles to match their culture
// (e.g., "employee" → "Security Officer", "manager" → "Shift Supervisor").
// Falls back to platform default if no custom label exists.
export const workspaceRoleLabels = pgTable("workspace_role_labels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  role: workspaceRoleEnum("role").notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
}, (table) => [
  uniqueIndex("workspace_role_labels_ws_role_idx").on(table.workspaceId, table.role),
  index("workspace_role_labels_ws_idx").on(table.workspaceId),
]);

// ── workspace_onboarding_states ─────────────────────────────────────────────
// Persists step-by-step onboarding state for each workspace.
// Written by onboardingStateMachine.ts with graceful fallback.
export const workspaceOnboardingStates = pgTable("workspace_onboarding_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  currentStep: varchar("current_step", { length: 100 }),
  completedSteps: jsonb("completed_steps").$type<string[]>().default(sql`'[]'::jsonb`),
  stateData: jsonb("state_data"),
  isComplete: boolean("is_complete").default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ws_onboarding_workspace_idx").on(table.workspaceId),
]);

// ── tos_agreements ──────────────────────────────────────────────────────────
// Immutable record of every Terms of Service + AI Disclaimer acknowledgment.
// These records are LEGALLY PROTECTED — they must never be deleted or altered
// once signed. Only CoAIleague support staff may view/download/print them.
// Stored permanently and linked to the SPS document safe as a sealed artifact.
export const tosAgreements = pgTable("tos_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Who signed
  workspaceId: varchar("workspace_id"),        // null until workspace is created (pre-registration)
  userId: varchar("user_id"),                   // null for pre-auth org registration flow
  email: varchar("email", { length: 255 }).notNull(),

  // Agreement type
  agreementType: varchar("agreement_type", { length: 50 }).notNull(), // 'org_registration' | 'user_onboarding'
  tosVersion: varchar("tos_version", { length: 20 }).notNull().default('2026-03-01'),

  // Signature capture
  fullName: varchar("full_name", { length: 255 }).notNull(),
  initials: varchar("initials", { length: 10 }).notNull(),

  // Audit trail
  agreedAt: timestamp("agreed_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 100 }),
  userAgent: text("user_agent"),

  // Document safe reference (once sealed)
  documentSafeRef: varchar("document_safe_ref"),

  // Linked org/invite context
  orgName: varchar("org_name", { length: 255 }),
  inviteToken: varchar("invite_token"),
}, (table) => [
  index("tos_agreements_workspace_idx").on(table.workspaceId),
  index("tos_agreements_user_idx").on(table.userId),
  index("tos_agreements_email_idx").on(table.email),
  index("tos_agreements_type_idx").on(table.agreementType),
]);

// NOTE: orgOnboardingTasks and orgRewards are defined earlier in this file (lines ~1431, ~1481).
// Do not re-declare them here.

// ── Phase 9B: Workspace Permission Matrix ────────────────────────────────────
// Operator-controlled feature access overrides per role per workspace.
// Falls back to featureRegistry.ts defaults when no record exists.
// org_owner and co_owner are NEVER blocked by this table (enforced in middleware).
export const workspacePermissions = pgTable("workspace_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  featureKey: varchar("feature_key", { length: 100 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("wp_workspace_idx").on(table.workspaceId),
  index("wp_role_idx").on(table.role),
  unique("wp_workspace_role_feature_unique").on(table.workspaceId, table.role, table.featureKey),
]);

export type WorkspacePermission = typeof workspacePermissions.$inferSelect;
export type InsertWorkspacePermission = typeof workspacePermissions.$inferInsert;

export * from './extended';
