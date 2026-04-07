// Shared Enum Definitions — CoAIleague
// All pgEnum definitions for the entire platform live here.
// Domain files import from this file — never redefine enums in domain files.

import { pgEnum } from 'drizzle-orm/pg-core';

export const platformRoleEnum = pgEnum('platform_role', [
  'root_admin',         // Creator - Highest authority, full destructive access
  'deputy_admin',       // Ops Chief - Full ops control (no destructive), day-to-day platform management
  'sysop',             // System Administrator - Backend, deployment, diagnostics, service restarts
  'support_manager',    // Support Lead - Manages support team, ticket assignment, client escalations
  'support_agent',      // Support Staff - Handles client tickets, assists organizations
  'compliance_officer', // Compliance & AI Oversight - Audits, documentation, AI governance
  'none'               // Regular subscriber user (not platform staff)
]);
export const leaderCapabilityEnum = pgEnum('leader_capability', [
  'view_reports',           // Access analytics and reports
  'manage_employees_basic', // Reset passwords, unlock accounts, update contact info
  'manage_schedules',       // Approve swaps, adjust time entries (within limits)
  'escalate_support',       // Create support tickets to platform staff
  'view_audit_logs',        // View organization audit trail
  'manage_security_flags'   // Handle basic security issues
]);
export const leaderActionEnum = pgEnum('leader_action', [
  'reset_password',
  'unlock_account',
  'update_employee_contact',
  'approve_schedule_swap',
  'adjust_time_entry',
  'flag_security_issue',
  'create_support_ticket',
  'export_report'
]);
export const escalationStatusEnum = pgEnum('escalation_status', [
  'open',
  'in_progress',
  'resolved',
  'closed'
]);
export const escalationCategoryEnum = pgEnum('escalation_category', [
  'billing',
  'compliance',
  'technical_issue',
  'security',
  'feature_request',
  'data_correction',
  'other'
]);
export const benefitTypeEnum = pgEnum('benefit_type', [
  'health_insurance',
  'dental_insurance', 
  'vision_insurance',
  'life_insurance',
  '401k',
  'pto_vacation',
  'sick_leave',
  'bonus',
  'equity',
  'other'
]);
export const benefitStatusEnum = pgEnum('benefit_status', ['pending', 'active', 'expired', 'cancelled']);
export const reviewStatusEnum = pgEnum('review_status', ['draft', 'in_progress', 'completed', 'cancelled']);
export const reviewTypeEnum = pgEnum('review_type', ['annual', 'quarterly', 'probation', '90_day', 'promotion', 'pip']);
export const ptoStatusEnum = pgEnum('pto_status', ['pending', 'approved', 'denied', 'cancelled']);
export const ptoTypeEnum = pgEnum('pto_type', ['vacation', 'sick', 'personal', 'bereavement', 'unpaid']);
export const terminationTypeEnum = pgEnum('termination_type', ['voluntary', 'involuntary', 'retirement', 'layoff', 'end_of_contract']);
export const terminationStatusEnum = pgEnum('termination_status', ['pending', 'in_progress', 'completed']);
export const shiftStatusEnum = pgEnum('shift_status', ['draft', 'published', 'scheduled', 'in_progress', 'completed', 'cancelled', 'confirmed', 'pending', 'approved', 'auto_approved']);
export const shiftCategoryEnum = pgEnum('shift_category', [
  'general',        // Default - uses client/employee color
  'tech_support',   // Royal blue (#3b82f6)
  'field_ops',      // Vibrant blue (#2563eb)
  'healthcare',     // Sky blue (#0ea5e9)
  'training',       // Blue (#1d4ed8)
  'emergency',      // Magenta/Purple (#a855f7)
  'admin',          // Purple (#8b5cf6)
  'security',       // Teal/Cyan (#14b8a6)
]);
export const trainingDifficultyEnum = pgEnum('training_difficulty', ['easy', 'medium', 'hard', 'meta', 'extreme']);
export const recurrencePatternEnum = pgEnum('recurrence_pattern', ['daily', 'weekly', 'biweekly', 'monthly']);
export const dayOfWeekEnum = pgEnum('day_of_week', ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
export const swapRequestStatusEnum = pgEnum('swap_request_status', ['pending', 'approved', 'rejected', 'cancelled', 'expired']);
export const shiftAcknowledgmentTypeEnum = pgEnum('shift_acknowledgment_type', ['post_order', 'special_order', 'safety_notice', 'site_instruction']);
export const securityIncidentTypeEnum = pgEnum('security_incident_type', [
  'suspicious_person',
  'suspicious_vehicle',
  'property_damage',
  'medical_emergency',
  'fire_safety',
  'theft',
  'other'
]);
export const securityIncidentSeverityEnum = pgEnum('security_incident_severity', [
  'low',
  'medium',
  'high',
  'critical'
]);
export const securityIncidentStatusEnum = pgEnum('security_incident_status', [
  'open',
  'investigating',
  'resolved',
  'escalated',
  'closed'
]);
export const breakTypeEnum = pgEnum('break_type', [
  'meal', // Meal break (typically 30-60 minutes)
  'rest', // Rest break (typically 10-15 minutes)
  'personal', // Personal break
  'emergency' // Emergency/unscheduled break
]);
export const auditActionTypeEnum = pgEnum('audit_action_type', [
  'clock_in',
  'clock_out',
  'start_break',
  'end_break',
  'edit_time',
  'approve_time',
  'reject_time',
  'delete_time',
  'manual_entry',
  'system_adjustment'
]);
export const shiftOrderPriorityEnum = pgEnum('shift_order_priority', ['normal', 'high', 'urgent']);
export const shiftOrderPhotoFrequencyEnum = pgEnum('shift_order_photo_frequency', ['hourly', 'per_shift', 'per_task', 'at_completion', 'custom']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'void', 'pending', 'refunded', 'partial', 'failed', 'disputed']);
export const reminderTypeEnum = pgEnum('reminder_type', ['7_day', '14_day', '30_day', 'custom']);
export const taxFormTypeEnum = pgEnum('tax_form_type', ['w4', 'w2', '1099', '940', '941']);
export const jobPostingStatusEnum = pgEnum('job_posting_status', ['draft', 'active', 'closed', 'filled']);
export const applicationStatusEnum = pgEnum('application_status', ['pending', 'reviewed', 'interviewed', 'offered', 'hired', 'rejected']);
export const documentTypeEnum = pgEnum('document_type', ['certification', 'license', 'contract', 'policy', 'id', 'other']);
export const onboardingStatusEnum = pgEnum('onboarding_status', ['not_started', 'invited', 'in_progress', 'pending_review', 'completed', 'rejected']);
export const taxClassificationEnum = pgEnum('tax_classification', ['w4_employee', 'w9_contractor']);
export const onboardingStepEnum = pgEnum('onboarding_step', [
  'personal_info', 'tax_selection', 'tax_forms', 'contract_signature', 
  'document_upload', 'work_availability', 'certifications', 'acknowledgements', 'completed'
]);
export const inviteStatusEnum = pgEnum('invite_status', ['sent', 'opened', 'accepted', 'expired', 'revoked']);
export const documentSignatureStatusEnum = pgEnum('signature_status', ['pending', 'signed', 'declined']);
export const documentTypeSignatureEnum = pgEnum('document_type_signature', [
  'employee_contract', 'contractor_agreement', 'sop_acknowledgement',
  'offer_letter', 'liability_waiver', 'uniform_acknowledgment',
  'drug_free_policy', 'handbook', 'confidentiality', 'i9_form', 'w4_form', 'w9_form',
  'employee_packet_unarmed', 'employee_packet_armed', 'employee_packet_ppo',
  'tx_service_contract',
  // Pass 1 additions — onboarding pipeline completeness
  'application',
  'state_id_front',
  'state_id_back',
  'social_security_card',
  'reference_check',
  'post_orders_acknowledgment',
  'service_proposal',
  'services_contract',
  'responsible_party_id',
  'onboarding_packet',
  'direct_deposit_authorization',
  'uniform_equipment_issuance',
  'guard_card_acknowledgment',
  'drug_free_acknowledgment',
]);
export const certificationStatusEnum = pgEnum('certification_status', ['pending', 'verified', 'expired', 'invalid']);
export const i9StatusEnum = pgEnum('i9_status', ['pending', 'verified', 'reverification_required', 'expired', 'invalid']);
export const policyStatusEnum = pgEnum('policy_status', ['draft', 'published', 'archived']);
export const employeeDocumentTypeEnum = pgEnum('employee_document_type', [
  'government_id', 'passport', 'ssn_card', 'birth_certificate',
  'i9_form', 'w4_form', 'w9_form', 'direct_deposit_form',
  'employee_handbook_signed', 'confidentiality_agreement', 'code_of_conduct',
  'certification', 'license', 'training_certificate',
  'background_check', 'drug_test', 'physical_exam',
  'emergency_contact_form', 'uniform_agreement', 'vehicle_insurance',
  'custom_document',
  'cover_sheet', 'employment_application', 'employee_photograph',
  'guard_card', 'guard_card_copy', 'zero_policy_drug_form',
  'fingerprint_receipt', 'level_ii_training', 'level_iii_training',
  'photo_id_copy', 'social_security_card', 'cpr_first_aid_cert',
  'tax_form', 'policy_acknowledgment', 'firearms_permit',
  'firearms_qualification', 'psychological_evaluation',
  'supervisor_training', 'continuing_education',
  'manager_card', 'representative_card', 'owner_operator_license'
]);

export const operatorCredentialTypeEnum = pgEnum('operator_credential_type', [
  'guard_card_unarmed',
  'guard_card_armed',
  'manager_card',
  'representative_card',
  'owner_operator_license',
]);

export const complianceEnrollmentStatusEnum = pgEnum('compliance_enrollment_status', [
  'pending',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'expired',
  'waived',
]);
export const employeeDocumentStatusEnum = pgEnum('employee_document_status', [
  'pending_upload', 'uploaded', 'pending_review', 'approved', 'rejected', 'expired', 'archived'
]);
export const auditActionEnum = pgEnum('audit_action', [
  // Legacy workspace actions
  'create', 'update', 'delete', 
  'login', 'logout', 
  'clock_in', 'clock_out',
  'generate_invoice', 'payment_received',
  'assign_manager', 'remove_manager',

  // Audit System Chat moderation actions
  'kick_user',
  'silence_user',
  'give_voice',
  'remove_voice',
  'ban_user',
  'unban_user',

  // Audit System Account management actions
  'reset_password',
  'unlock_account',
  'lock_account',
  'change_role',
  'change_permissions',

  // Audit System Workspace actions
  'transfer_ownership',
  'impersonate_user',

  // Audit System Data actions
  'export_data',
  'import_data',
  'delete_data',
  'restore_data',

  // Audit System actions
  'update_motd',
  'update_banner',
  'change_settings',
  'view_audit_logs',

  // Audit System Support actions
  'escalate_ticket',
  'transfer_ticket',
  'view_documents',
  'request_secure_info',
  'release_spectator',

  // Autonomous Automation actions (Billing Platform, Scheduling Platform, Payroll Platform)
  'automation_job_start',
  'automation_job_complete',
  'automation_job_error',
  'automation_artifact_generated',

  // Scheduler job actions
  'scheduler_job_completed',
  'scheduler_job_failed',

  // Workspace / org lifecycle
  'workspace_created',
  'coi_request',
  'contract_renewal_request',

  // Batch / status operations
  'approve',
  'reject',
  'bulk_update',
  'deactivate',
  'activate',

  // Scheduling & staffing
  'coverage_requested',
  'shift_unassigned',
  'shift_assigned',

  // Payroll & invoicing
  'payroll_approved',
  'invoice_created',
  'invoice_sent',
  'invoice_paid',

  // Automation notifications
  'schedule_notification',
  'coverage_triggered',
  'payroll_run_started',
  'payroll_run_completed',
  'alert_created',
  'alert_resolved',

  // Other
  'other'
]);
export const payrollStatusEnum = pgEnum('payroll_status', ['draft', 'pending', 'approved', 'processed', 'disbursing', 'paid', 'completed', 'partial']);
export const supportActionSeverityEnum = pgEnum('support_action_severity', [
  'read',    // View-only access
  'write',   // Modifications that can be undone
  'delete',  // Destructive actions (soft or hard delete)
]);
export const supportSessionScopeEnum = pgEnum('support_session_scope', [
  'view_data',           // Read-only access
  'edit_user',           // Modify user data
  'fix_trinity',         // Debug/reset Trinity
  'billing_support',     // Billing adjustments
  'data_export',         // Export org data
  'emergency_rollback',  // Rollback to safe point
  'full_control',        // Root admin complete access
  'read_only',           // DB-synced
  'full_access',         // DB-synced
  'emergency',           // DB-synced
]);
export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected', 'expired', 'executed', 'cancelled', 'auto_approved']);
export const noticeTypeEnum = pgEnum('notice_type', ['resignation', 'role_change', 'termination']);
export const noticeStatusEnum = pgEnum('notice_status', ['submitted', 'acknowledged', 'completed', 'cancelled']);
export const subscriptionPlanEnum = pgEnum('subscription_plan', ['free', 'trial', 'starter', 'professional', 'business', 'enterprise', 'strategic']);
export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'annual']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['trial', 'active', 'past_due', 'cancelled', 'suspended']);
export const faqSourceTypeEnum = pgEnum('faq_source_type', [
  'manual',           // Manually created by support staff
  'ai_learned',       // Auto-created from successful AI interactions
  'ticket_resolution', // Created from resolved support tickets
  'feature_update',   // Created/updated due to feature changes
  'gap_detection',    // Created to fill detected knowledge gap
  'import'            // Imported from external source
]);
export const faqStatusEnum = pgEnum('faq_status', [
  'draft',            // Not yet published
  'published',        // Live and serving users
  'needs_review',     // Flagged for review (stale, low confidence)
  'needs_update',     // Flagged for update (feature changed, issues reported)
  'archived',         // No longer active but kept for history
  'deprecated'        // Replaced by newer FAQ
]);
export const serviceStatusEnum = pgEnum('service_status', ['operational', 'degraded', 'down']);
export const serviceKeyEnum = pgEnum('service_key', ['database', 'chat_websocket', 'gemini_ai', 'object_storage', 'stripe', 'email']);
export const errorTypeEnum = pgEnum('error_type', ['connection_failed', 'timeout', 'server_error', 'unknown']);
export const incidentStatusEnum = pgEnum('incident_status', ['submitted', 'triaged', 'resolved', 'dismissed']);
export const ruleTypeEnum = pgEnum('rule_type', ['payroll', 'scheduling', 'time_tracking', 'billing']);
export const ruleStatusEnum = pgEnum('rule_status', ['active', 'inactive', 'testing']);
export const integrationCategoryEnum = pgEnum('integration_category', [
  'accounting', // QuickBooks, Xero, NetSuite
  'erp', // SAP, Oracle, Microsoft Dynamics
  'crm', // Salesforce, HubSpot, Pipedrive
  'hris', // ADP, Workday, BambooHR
  'communication', // Slack, Microsoft Teams, Discord
  'productivity', // Google Workspace, Microsoft 365
  'analytics', // Tableau, Power BI, Looker
  'storage', // Dropbox, Box, OneDrive
  'custom' // Third-party developer integrations
]);
export const expenseStatusEnum = pgEnum('expense_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
  'cancelled'
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded',
  'paid',
  'cancelled'
]);
export const payoutMethodEnum = pgEnum('payout_method', [
  'stripe_connect', 'direct_deposit', 'check', 'manual'
]);
export const payoutStatusEnum = pgEnum('payout_status', [
  'pending', 'processing', 'completed', 'failed', 'reversed'
]);
export const paymentReminderTypeEnum = pgEnum('payment_reminder_type', [
  'upcoming_due', 'due_today', 'overdue_3d', 'overdue_7d', 'overdue_14d', 'overdue_30d', 'final_notice'
]);
export const reminderChannelEnum = pgEnum('reminder_channel', [
  'email', 'sms', 'platform'
]);
export const availabilityStatusEnum = pgEnum('availability_status', [
  'available',
  'unavailable',
  'preferred',
  'limited'
]);
export const shiftActionTypeEnum = pgEnum('shift_action_type', [
  'accept',
  'deny',
  'switch_request',
  'cover_request'
]);
export const shiftActionStatusEnum = pgEnum('shift_action_status', [
  'pending',
  'approved',
  'denied',
  'completed',
  'canceled',
  'cancelled',  // DB-synced (both spellings exist in DB)
]);
export const timesheetEditRequestStatusEnum = pgEnum('timesheet_edit_request_status', [
  'pending',
  'approved',
  'denied',
  'applied'
]);
export const contractDocumentTypeEnum = pgEnum('contract_document_type', [
  'i9', // Employment Eligibility Verification
  'w4', // Employee's Withholding Certificate
  'w9', // Contractor Tax Information
  'nda', // Non-Disclosure Agreement
  'employment_agreement',
  'contractor_agreement',
  'handbook_acknowledgment',
  'policy_acknowledgment',
  'direct_deposit_authorization',
  'background_check_consent',
  'drug_test_consent',
  'other'
]);
export const roomStatusEnum = pgEnum('room_status', [
  'active',      // Room is open and operational
  'suspended',   // Room is frozen/locked by support staff
  'closed',      // Room is permanently closed
]);
export const roomMemberRoleEnum = pgEnum('room_member_role', [
  'owner',       // Organization creator - full control
  'admin',       // Leadership/management - can manage room
  'member',      // Regular employee/user
  'guest',       // End customer - limited access
]);
export const platformUpdateCategoryEnum = pgEnum('platform_update_category', [
  'feature',               // New feature release
  'improvement',           // Enhancement to existing feature
  'bugfix',                // Bug fix
  'security',              // Security patch
  'announcement',          // Platform announcement
  'maintenance',           // System maintenance, scheduled downtime
  'diagnostic',            // Trinity diagnostics, system health
  'support',               // Support requests, help desk
  'ai_brain',              // AI Brain messages, orchestration updates
  'error',                 // System errors, issues, incidents
  // Extended system categories (for System tab "Clear All" support)
  'fix',                   // Quick fixes, patches
  'hotpatch',              // Live hotpatches
  'deprecation',           // Deprecation notices
  'system',                // General system notifications
  'incident',              // Incident reports
  'outage',                // Service outage alerts
  'recovery',              // Recovery notifications
  'maintenance_update',    // Maintenance status updates
  'maintenance_postmortem',// Post-incident analysis
  'automation',            // Automated workflow completions
  // DB-synced operational categories
  'scheduling',
  'schedule',
  'trinity',
  'payroll',
  'coverage',
  'staffing',
  'billing',
  'live_sync',
  'operations',
  'integration',
  'ai_action',
  // Extended operational categories (added to DB enum via ALTER TYPE)
  'analytics',             // Analytics reports, metrics, KPI events
  'user_assistance',       // Onboarding, help, guided flows
  'invoicing',             // Invoice lifecycle events (alias for billing context)
  'workforce',             // Workforce management events
  'compliance',            // Compliance checks, document expiry, audits
  'field_operations',      // RMS, CAD, GPS, field officer events
  'safety',                // Safety incidents, panic alerts
  'training',              // Training completion, certification events
  'time_tracking',         // Clock-in/out, timesheet events
  'hr',                    // HR lifecycle events (hire, terminate, role change)
  'notifications',         // Notification system self-diagnostics
  'health',                // Platform health, DB health checks
  'integrations',          // Third-party integrations (QB, Plaid, etc.) — alias of 'integration'
  'performance',           // Performance metrics, latency alerts
  'documents',             // Document pipeline, contract, e-sign events
  'platform_service',      // Internal service-to-service events (trinityPlatformConnector)
]);
export const updateVisibilityEnum = pgEnum('update_visibility', [
  'all',           // Everyone can see (default)
  'staff',         // Staff and above
  'supervisor',    // Supervisors and above
  'manager',       // Managers and above
  'admin',         // Admins and owners only
  'platform_staff' // Platform staff only (root, deputy, sysop)
]);
export const notificationScopeEnum = pgEnum('notification_scope', [
  'workspace',  // Tenant-scoped notification (requires workspaceId)
  'user',       // User-scoped notification (no workspace required, for global admins)
  'global',     // Platform-wide notification (broadcast to all users)
]);
export const notificationCategoryEnum = pgEnum('notification_category', [
  'system',       // Platform maintenance, known issues, services down
  'chat',         // Chat server notifications, mentions, DMs
  'whats_new',    // Platform updates, patches, new features (AI-summarized)
  'alerts',       // Important alerts requiring attention
  'activity',     // General activity (shifts, timesheets, approvals)
  'system_fix',   // Platform fix/patch applied (DB-synced)
  'hotpatch',     // Live hotpatch notification (DB-synced)
  'admin_action', // Admin-initiated action notification (DB-synced)
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  // ── PERSONAL (employee-level) ──────────────────────────────────────────────
  'shift_assigned',              // New shift assigned to user
  'shift_changed',               // Shift details changed (time, location, etc.)
  'shift_cancelled',             // Shift was cancelled
  'shift_unassigned',            // Shift removed from user
  'shift_reminder',              // Upcoming shift reminder
  'shift_offer',                 // Shift offered to employee
  'pto_approved',                // PTO request approved
  'pto_denied',                  // PTO request denied
  'timesheet_approved',          // Timesheet approved
  'timesheet_rejected',          // Timesheet rejected
  'pay_stub_available',          // Pay stub ready for employee to view
  'document_uploaded',           // New document uploaded for user
  'document_expiring',           // Document expiring soon
  'document_signature_request',  // Document awaiting employee signature
  'document_signed',             // Document signed by counterparty
  'document_fully_executed',     // All parties signed — document complete
  'document_signature_reminder', // Reminder to sign pending document
  'profile_updated',             // Profile updated by admin
  'form_assigned',               // New form/paperwork assigned
  'officer_deactivated',         // Officer account deactivated
  'clock_in_reminder',           // Clock-in reminder for shift
  'mention',                     // User mentioned in chat/comment

  // ── SCHEDULING / OPERATIONS ───────────────────────────────────────────────
  'schedule_change',             // Schedule changed by manager
  'schedule_notification',       // General schedule notification
  'coverage_offer',              // Coverage offered for open shift
  'coverage_requested',          // Coverage requested for a shift
  'coverage_filled',             // Open shift coverage filled
  'coverage_expired',            // Coverage offer expired unfilled
  'ai_schedule_ready',           // AI-generated schedule ready for approval

  // ── PAYROLL / FINANCIAL (management) ─────────────────────────────────────
  'payroll_processed',           // Payroll run processed
  'payroll_pending',             // Payroll run pending approval
  'payroll_payment_method',      // Employee payment method notification (ACH/check/wire/cash)
  'invoice_generated',           // Invoice generated for client
  'invoice_paid',                // Invoice paid
  'invoice_overdue',             // Invoice payment overdue
  'invoice_auto_sent',           // Invoice auto-sent after 24h review window
  'payment_received',            // Payment received from client
  'payment_overdue',             // Payment overdue from client
  'timesheet_submission_reminder', // Reminder for employees to submit timesheets before pay period close

  // ── CREDIT / BILLING (executive) ─────────────────────────────────────────
  'credit_warning',              // AI credit balance low — org owner alert

  // ── COMPLIANCE / MANAGEMENT ALERTS ───────────────────────────────────────
  'compliance_alert',            // Compliance issue detected
  'deadline_approaching',        // Deadline approaching for approval/action
  'dispute_filed',               // Timesheet or pay dispute filed
  'staffing_escalation',         // Staffing issue escalated to manager
  'staffing_critical_escalation', // Critical staffing issue escalated to owner
  'critical_alert',              // Critical alert requiring immediate action
  'issue_detected',              // Issue detected in automated monitoring
  'action_required',             // Action required by operator
  'approval_required',           // Approval required for pending item

  // ── AI / SYSTEM ACTIONS ───────────────────────────────────────────────────
  'ai_approval_needed',          // AI Brain needs approval for workflow
  'ai_action_completed',         // AI Brain completed automated action
  'trinity_autonomous_alert',    // Trinity AI autonomous action notification
  'trinity_welcome',             // Trinity onboarding welcome message
  'scheduler_job_failed',        // Automated scheduler job failed

  // ── PLATFORM NOTIFICATIONS ────────────────────────────────────────────────
  'platform_maintenance',        // Platform going down for maintenance
  'known_issue',                 // Known issue being investigated
  'service_down',                // Service outage notification
  'service_restored',            // Service restored notification
  'platform_update',             // New platform update/patch deployed
  'feature_release',             // New feature released

  // ── SYSTEM / MISC ─────────────────────────────────────────────────────────
  'system',                      // Generic system notification
  'welcome_org',                 // Welcome message for new organization
  'welcome_employee',            // Welcome message for new employee
  'support_escalation',          // HelpAI bot escalated ticket to human support
  'bundled_notification',        // Batched/digest bundle of multiple alerts
  'error',                       // Generic error notification
  'compliance',                  // Compliance notification (alias for compliance_alert)
  // ── BILLING / SUBSCRIPTION (added to DB via ALTER TYPE) ───────────────────
  'invoice_draft_ready',         // Invoice draft ready for manager review
  'invoice_draft_reminder',      // Reminder for invoice draft not yet sent
  'invoice_refunded',            // Invoice refunded to client
  'subscription_upgraded',       // Subscription tier upgraded
  'subscription_downgraded',     // Subscription tier downgraded
  'subscription_cancelled',      // Subscription cancelled
  'subscription_payment_failed', // Subscription payment failed
  'subscription_activated',      // Subscription activated after checkout
  // ── PAYROLL EXTENDED ──────────────────────────────────────────────────────
  'payroll_draft_ready',         // Payroll draft ready for manager review
  'payroll_readiness_alert',     // Payroll readiness issue detected (zero rates, etc.)
  'payroll_tracking_error',      // Error tracking payroll payout (Stripe/Plaid)
  'payroll_auto_close',          // Payroll run auto-closed after review window
  // ── TAX / COMPLIANCE ──────────────────────────────────────────────────────
  'form_1099_filing_required',   // 1099 contractor filing threshold reached
  'compliance_action_required',  // Compliance action needed from manager
  'license_expiring',            // Security license expiring soon
  'certification_expiring',      // Employee certification expiring
  // ── TIMESHEET ─────────────────────────────────────────────────────────────
  'timesheet_approval_reminder', // Manager reminder to approve pending timesheets
  'timesheet_resubmission_required', // Employee must resubmit corrected timesheet
  // ── AI / REPORTING ────────────────────────────────────────────────────────
  'trinity_financial_briefing',  // Trinity-generated financial briefing
  'milestone_alert',             // Business milestone achieved or approaching
  // ── PAYROLL (extended) ────────────────────────────────────────────────────
  'payroll_disbursed',            // Individual employee paycheck disbursed notification
  // ── INTERNAL COMMS & CONFIRMATION ─────────────────────────────────────────
  'internal_email_received',      // In-app email thread notification
  'shift_confirmation_required',  // Guard must confirm acceptance
  'shift_confirmed',              // Guard confirmed shift
  'dar_required',                 // Daily Activity Report reminder
  // ── SHIFT ESCALATION (unassigned shift coverage alerts) ───────────────────
  'shift_escalation_warning_72h',  // Unassigned shift ≤72h away (warning level)
  'shift_escalation_urgent_24h',   // Unassigned shift ≤24h away (urgent level)
  'shift_escalation_critical_4h',  // Unassigned shift ≤4h away (critical level)
  // ── SHIFT CONFIRMATION FLOW ────────────────────────────────────────────────
  'shift_confirmation',            // Officer must confirm shift acceptance
  'shift_declined_alert',          // Officer declined assigned shift
  'unconfirmed_shifts_alert',      // Manager: officers have not confirmed shifts
  // ── SYSTEM / PLATFORM ALERTS ──────────────────────────────────────────────
  'system_update',                 // Platform system update notification
  'system_alert',                  // Critical system alert requiring attention
  // ── SCHEDULE LIFECYCLE ────────────────────────────────────────────────────
  'schedule_published',            // Schedule published and visible to officers
  'calloff_alert',                 // Officer called off — shift needs coverage
  // ── PAYROLL EXTENDED (transfer tracking) ──────────────────────────────────
  'payroll_approved',              // Payroll run approved by manager
  'payroll_initiated',             // Payroll run initiated for processing
  'payroll_transfer_settled',      // Payroll ACH transfer settled successfully
  'payroll_transfer_failed',       // Payroll ACH transfer failed
  'payroll_alert',                 // General payroll alert for manager
  'plaid_transfer_updated',        // Plaid ACH transfer status updated
  // ── TIMESHEET (alias) ────────────────────────────────────────────────────
  'timesheets_approved',           // Alias: timesheets approved and ready for payroll
  // ── BILLING / SUBSCRIPTION EXTENDED ──────────────────────────────────────
  'billing_alert',                 // Billing alert for workspace owner
  'subscription_updated',          // Subscription details updated
  'stripe_payment_received',       // Stripe payment received for subscription
  'invoices_updated',              // Invoice batch updated via webhook
  'payment_refunded',              // Payment refunded to client
  // ── TRIAL / REACTIVATION LIFECYCLE ───────────────────────────────────────
  'trial_converted',               // Trial workspace converted to paid plan
  'trial_expiry_warning',          // Trial expiring soon
  'trial_grace_period',            // Trial in grace period before suspension
  'workspace_downgraded',          // Workspace plan downgraded
  'workspace_suspended',           // Workspace suspended due to non-payment
  'workspace_reactivated',         // Workspace reactivated after suspension
  'reactivation_failed',           // Workspace reactivation attempt failed
  // ── COMPLIANCE / POLICY ───────────────────────────────────────────────────
  'compliance_violation',          // Compliance violation detected
  'compliance_hold',               // Record placed on compliance hold
  'employee_terminated',           // Employee termination notification
  // ── SAFETY ────────────────────────────────────────────────────────────────
  'panic_alert',                   // Officer panic button triggered
  // ── TASK / DELEGATION ────────────────────────────────────────────────────
  'task_delegation',               // Task delegated to another team member
  'task_escalation',               // Task escalated to supervisor
  // ── OPERATIONAL ────────────────────────────────────────────────────────────
  'sla_breach',                    // SLA breach detected on client or shift
  'drug_test',                     // Drug test notification for officer
  'settings_change_impact',        // Settings change affects operations
  // ── ATTENDANCE / CLOCKING ─────────────────────────────────────────────────
  'missed_clock_in',               // Officer did not clock in for scheduled shift
  'missed_clock_in_alert',         // Escalated missed clock-in alert for supervisor
  // ── REPORTING / SUMMARIES ─────────────────────────────────────────────────
  'monthly_summary',               // Monthly operational summary notification
  'alert',                         // Generic alert notification
  // ── COMMUNICATIONS ────────────────────────────────────────────────────────
  'scheduled_email',               // Scheduled email digest or campaign
  // ── CONTRACTS / COMPLIANCE ────────────────────────────────────────────────
  'contract_executed',             // Contract fully executed by all parties
  'regulatory_violation',          // Regulatory violation detected or reported
  // ── TRINITY AI BRAIN / PROACTIVE ──────────────────────────────────────────
  'trinity_recognition',           // Trinity recognition event for employee
  'trinity_recognition_pending',   // Trinity recognition pending manager approval
  'trinity_fto_suggestion',        // Trinity FTO assignment suggestion
  'trinity_ootm_nomination',       // Trinity Officer of the Month nomination
  'trinity_raise_suggestion',      // Trinity pay raise suggestion
  'trinity_action_blocked',        // Trinity autonomous action blocked by gate
  'helpai_proactive',              // HelpAI proactive insight
  'cognitive_overload',            // Cognitive overload detected for user
  'social_graph_insight',          // Social graph relationship insight
  'disciplinary_pattern',          // Disciplinary pattern detected
  'external_risk',                 // External risk signal detected
  'bot_reply',                     // Bot reply notification
  'mascot_orchestration',          // Mascot orchestration event
  // ── AGENT / ORCHESTRATION ─────────────────────────────────────────────────
  'agent_escalation',              // AI agent escalated to human
  'schedule_escalation',           // Schedule issue escalated
  'orchestration_update',          // Workflow orchestration status update
  'migration_complete',            // Data migration completed
  'ai_cost_alert',                 // AI credit cost alert
  'circuit_breaker_opened',        // Service circuit breaker tripped
  // ── COMPLIANCE EXTENDED ───────────────────────────────────────────────────
  'compliance_approved',           // Compliance item approved
  'compliance_rejected',           // Compliance item rejected
  'compliance_warning',            // Compliance warning issued
  'audit_report_uploaded',         // Audit report uploaded by regulator
  'audit_access_request',          // Regulator requested audit access
  // ── CLIENT / ONBOARDING ───────────────────────────────────────────────────
  'client_created',                // New client created in workspace
  'client_invited',                // Client invited to portal
  'client_data_incomplete',        // Client profile data incomplete
  'onboarding',                    // General onboarding notification
  'employee_hired',                // New employee hired
  // ── BILLING / PAYMENTS EXTENDED ───────────────────────────────────────────
  'chargeback_received',           // Stripe chargeback received
  'stripe_payment_confirmed',      // Stripe payment confirmed
  'subscription_payment_blocked',  // Subscription payment blocked
  'invoice_created',               // Invoice created
  'invoice_overdue_alert',         // Invoice overdue escalation alert
  'invoice_paid_confirmation',     // Invoice payment confirmed
  'payroll_disbursement_confirmed', // Payroll disbursement confirmed
  'payroll_run_voided',            // Payroll run voided
  'paystub_generated',             // Pay stub generated for employee
  'reconciliation_alert',          // Financial reconciliation alert
  // ── QUICKBOOKS SYNC ───────────────────────────────────────────────────────
  'qb_sync_failed',                // QuickBooks sync failed
  'qb_payroll_sync_failed',        // QuickBooks payroll sync failed
  // ── OPERATIONAL EXTENDED ──────────────────────────────────────────────────
  'security_alert',                // Security-related alert
  'maintenance_alert_created',     // Maintenance alert created
  'emergency',                     // Emergency notification
  'incident',                      // Incident report notification
  'coverage_gap_detected',         // Shift coverage gap detected
  'geofence_override_required',    // Geofence override needs approval
  'document_bridged',              // Document bridged to compliance system
  'content_moderation_alert',      // Content moderation flag
  'shift_cancelled_alert',         // Shift cancelled — coverage needed
  // ── APPROVALS / REQUESTS ──────────────────────────────────────────────────
  'approval_needed',               // Approval needed from manager
  'request_approved',              // Request approved
  'request_denied',                // Request denied
  // ── GENERAL PURPOSE ───────────────────────────────────────────────────────
  'announcement',                  // General announcement
  'info',                          // Informational notification
  'internal',                      // Internal system notification
  'document',                      // Document-related notification
  'new_staffing_inquiry',          // New staffing inquiry received
  'support_resolved',              // Support ticket resolved
  'pay_rate_change',               // Pay rate changed for employee
  'pto_updated',                   // PTO balance or request updated
]);
export const digestFrequencyEnum = pgEnum('digest_frequency', [
  'realtime',   // Send individual notifications immediately (default)
  '15min',      // Batch and summarize every 15 minutes
  '1hour',      // Batch and summarize every hour
  '4hours',     // Batch and summarize every 4 hours
  'daily',      // Once per day summary (morning)
  'never',      // Disable all notifications
]);
export const shiftReminderTimingEnum = pgEnum('shift_reminder_timing', [
  '15min',    // 15 minutes before
  '30min',    // 30 minutes before
  '1hour',    // 1 hour before
  '2hours',   // 2 hours before
  '4hours',   // 4 hours before
  '12hours',  // 12 hours before (half day)
  '24hours',  // 24 hours before
  '48hours',  // 48 hours before
  'custom',   // Custom minutes set in shiftReminderCustomMinutes
]);
export const summaryFrequencyEnum = pgEnum('summary_frequency', [
  'daily',     // Every day at configured time
  'weekly',    // Once per week
  'biweekly',  // Every two weeks
  'monthly',   // Once per month
]);
export const maintenanceAlertSeverityEnum = pgEnum('maintenance_alert_severity', [
  'info',       // Informational - no service impact expected
  'warning',    // Planned maintenance - some services may be affected
  'critical',   // Critical - significant service disruption expected
]);
export const maintenanceAlertStatusEnum = pgEnum('maintenance_alert_status', [
  'scheduled',   // Alert is scheduled but not yet started
  'in_progress', // Maintenance is currently in progress
  'completed',   // Maintenance has been completed
  'cancelled',   // Maintenance was cancelled
]);
export const accountStateEnum = pgEnum('account_state', [
  'active',           // Account in good standing
  'trial',            // Free trial period
  'payment_failed',   // Payment method declined
  'suspended',        // Auto-suspended due to non-payment
  'requires_support', // Requires support intervention to reactivate
  'cancelled',        // Subscription cancelled by user
  'terminated',       // Permanently terminated by platform
  'maintenance',      // Set to maintenance mode by platform staff
  'deactivated',      // Deactivated by platform staff
]);
export const operationTypeEnum = pgEnum('operation_type', [
  'invoice_generation',
  'payroll_run', 
  'timesheet_ingest',
  'schedule_generation',
  'payment_processing',
  'shift_reminder',
  'cert_expiry_notify',
  'daily_digest',
  'coverage_pipeline',
]);
export const idempotencyStatusEnum = pgEnum('idempotency_status', [
  'processing',
  'completed',
  'failed',
  'pending_approval',
]);
export const partnerTypeEnum = pgEnum('partner_type', [
  'quickbooks', // QuickBooks Online
  'gusto', // Gusto Payroll
  'stripe', // Stripe (for reference, already integrated)
  'other', // Future partners
]);
export const partnerConnectionStatusEnum = pgEnum('partner_connection_status', [
  'connected', // Active connection
  'disconnected', // Manually disconnected
  'expired', // Tokens expired
  'error', // Connection error
]);
export const migrationStatusEnum = pgEnum("migration_status", [
  'running',
  'completed', 
  'failed',
  'cancelled',
  'cancel_requested'
]);
export const quickbooksFlowStageEnum = pgEnum('quickbooks_flow_stage', [
  'oauth_initiated',
  'oauth_completed',
  'initial_sync_running',
  'initial_sync_complete',
  'data_mapping_running',
  'data_mapping_complete',
  'employees_importing',
  'employees_imported',
  'schedule_generating',
  'schedule_generated',
  'automation_configuring',
  'automation_configured',
  'flow_complete',
  'flow_failed',
]);
export const invoiceLifecycleStateEnum = pgEnum('invoice_lifecycle_state', [
  'computed',           // Hours + rules applied, payload ready
  'composed',           // Invoice payload created with deterministic hash
  'ready_to_execute',   // Idempotency guard passed
  'draft_created',      // Invoice created in QBO as draft
  'approval_pending',   // Awaiting human approval
  'approved',           // Human approved, ready to send
  'sent',               // Invoice sent to customer
  'paid',               // Payment received
  'failed',             // Terminal failure state
  'cancelled',          // Manually cancelled
]);
export const oversightEntityTypeEnum = pgEnum('oversight_entity_type', [
  'invoice',
  'expense',
  'timesheet',
  'shift',
  'payroll_run',
  'dispute',
  'time_entry',
]);
export const oversightStatusEnum = pgEnum('oversight_status', [
  'pending',      // Awaiting review
  'approved',     // Human approved
  'rejected',     // Human rejected
  'auto_resolved' // Automatically resolved by rules
]);
export const externalIdEntityTypeEnum = pgEnum('external_id_entity_type', [
  'org',
  'employee',
  'user',
  'support',
  'client',
]);
export const idSequenceKindEnum = pgEnum('id_sequence_kind', [
  'employee',
  'ticket',
  'client',
]);
export const featureUpdateStatusEnum = pgEnum('feature_update_status', [
  'draft',      // Being prepared by admin
  'scheduled',  // Scheduled for future release
  'active',     // Currently active and visible
  'expired',    // Past expiration date
  'archived'    // Manually archived
]);
export const featureUpdateCategoryEnum = pgEnum('feature_update_category', [
  'new',         // New feature
  'improvement', // Feature improvement
  'fix',         // Bug fix
  'security',    // Security update
  'maintenance'  // Maintenance or infrastructure
]);
export const aiBrainJobStatusEnum = pgEnum('ai_brain_job_status', [
  'pending',      // Queued, waiting to execute
  'running',      // Currently executing
  'completed',    // Successfully completed
  'failed',       // Execution failed
  'cancelled',    // User or system cancelled
  'requires_approval' // Needs human review
]);
export const aiBrainJobPriorityEnum = pgEnum('ai_brain_job_priority', [
  'low',
  'normal',
  'high',
  'critical'
]);
export const aiBrainSkillEnum = pgEnum('ai_brain_skill', [
  'scheduleos_generation',    // Schedule generation
  'scheduleos_migration',     // Schedule migration via vision
  'billos_invoice_review',    // Invoice review and approval
  'billos_payroll_review',    // Payroll review and approval
  'auditos_compliance',       // Compliance auditing
  'intelligenceos_prediction',// Predictive analytics
  'helpos_support',           // Customer support chat
  'disputeos_resolution',     // Dispute resolution
  'talentos_scoring',         // Employee scoring
  'marketingos_campaign',     // Marketing automation
  'business_insight',         // Business insights (sales, finance, operations, automation, growth)
  'platform_recommendation',  // Platform feature recommendations (self-selling)
  'faq_update',               // FAQ learning and updates
  'helpai_faq_search',        // HelpAI FAQ search for support questions
  'helpai_response',          // HelpAI response generation for user messages
]);
export const monitoringScopeEnum = pgEnum('monitoring_scope', [
  'global',
  'workspace'
]);
export const monitoringTypeEnum = pgEnum('monitoring_type', [
  'credential_expiry',
  'contract_expiry',
  'payment_issue',
  'schedule_conflict',
  'compliance_violation',
  'timecard_anomaly'
]);
export const monitoringStatusEnum = pgEnum('monitoring_status', [
  'active',
  'paused',
  'failed'
]);
export const alertTypeEnum = pgEnum('alert_type', [
  'credential_expiry',
  'contract_expiry',
  'payment_issue',
  'schedule_conflict',
  'compliance_violation',
  'timecard_anomaly',
  'system_alert',
  'overtime',
  'low_coverage',
  'payment_overdue',
  'shift_unfilled',
  'clock_anomaly',
  'budget_exceeded',
  'approval_pending',
  // Extended alert types (DB-synced)
  'overtime_violation',
  'credential_expiry_30d',
  'credential_expiry_7d',
  'credential_expired',
  'budget_threshold',
  'forecast_spike',
  'pattern_anomaly',
  'missing_break',
  'shift_compliance',
  'schedule_gap',
  'client_payment_overdue',
  'invoice_past_due',
  'payment_failed',
  'manual_override',
]);
export const alertSeverityEnum = pgEnum('alert_severity', [
  'low',
  'medium',
  'high',
  'critical'
]);
export const alertChannelEnum = pgEnum('alert_channel', [
  'helpos',
  'email',
  'sms',
  'in_app'
]);
export const alertStatusEnum = pgEnum('alert_status', [
  'queued',
  'dispatched',
  'acknowledged',
  'resolved'
]);
export const notificationDeliveryStatusEnum = pgEnum('notification_delivery_status', [
  'pending',
  'sent',
  'delivered',
  'failed'
]);
export const actorTypeEnum = pgEnum('actor_type', [
  'END_USER',         // Regular workspace user
  'SUPPORT_STAFF',    // Support team member (root_admin, deputy_admin, support_manager)
  'AI_AGENT',         // Gemini AI Brain or autonomous system
  'SYSTEM',           // System-initiated action (cron job, webhook, etc.)
]);
export const eventStatusEnum = pgEnum('event_status', [
  'pending',     // Event logged, not yet committed
  'prepared',    // Event prepared for processing (for schedule events)
  'committed',   // Event successfully committed to database
  'failed',      // Event failed to commit
  'rolled_back', // Event was rolled back
  'in_progress', // Event currently processing (DB-synced)
  'completed',   // Event fully completed (DB-synced)
]);
export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'monthly_allocation',     // Monthly tier-based credit refill
  'purchase',               // User purchased credit pack
  'deduction',              // AI automation consumed credits (main pool)
  'addon_deduction',        // AI automation consumed credits (paid from addon allotment, main pool untouched)
  'refund',                 // Credit refund (e.g., failed automation)
  'bonus',                  // Promotional credits
  'adjustment',             // Admin manual adjustment
  'expiration',             // Credits expired
  'monthly_reset',          // Monthly reset cycle (creditBalanceService)
  'recycled_to_platform',   // Forfeited credits swept to platform pool at cycle end
  'recycled_received',      // Platform workspace received recycled credits from tenants
  'overage_charge',         // Soft-cap overage billed via Stripe; balance reset to 0
]);
export const checkpointStatusEnum = pgEnum('checkpoint_status', [
  'paused',     // Automation paused due to insufficient credits
  'resumed',    // Automation resumed after credit purchase
  'expired',    // Checkpoint expired (24h limit)
  'cancelled',  // User cancelled the checkpoint
  'failed',     // Checkpoint failed (DB-synced)
]);
export const emailFolderTypeEnum = pgEnum("email_folder_type", [
  "inbox", "sent", "drafts", "trash", "archive", "spam", "starred", "custom",
  "support", "billing", "staffing", "calloffs", "incidents", "docs", "trinity"
]);
export const emailPriorityEnum = pgEnum("email_priority", [
  "low", "normal", "high", "urgent"
]);
export const internalEmailStatusEnum = pgEnum("internal_email_status", [
  "draft", "sent", "delivered", "read", "archived", "deleted"
]);
export const gustoSyncStatusEnum = pgEnum('gusto_sync_status', ['pending', 'syncing', 'completed', 'failed', 'partial']);
export const achievementCategoryEnum = pgEnum('achievement_category', [
  'attendance', 'performance', 'teamwork', 'learning', 'milestone', 'special'
]);
export const schedulerPoolTypeEnum = pgEnum('scheduler_pool_type', ['org', 'global']);
export const scoringEventTypeEnum = pgEnum('scoring_event_type', [
  'clock_in_on_time', 'clock_in_late', 'clock_out_on_time', 'clock_out_early', 'clock_out_late',
  'shift_completed', 'shift_perfect', 'shift_no_show', 'shift_call_off', 'shift_call_off_late',
  'shift_accepted', 'shift_rejected', 'shift_dropped',
  'client_positive_feedback', 'client_negative_feedback', 'client_neutral_feedback',
  'overtime_compliance', 'overtime_violation',
  'certification_added', 'certification_expired', 'certification_renewed',
  'training_completed', 'skill_verified',
  'manual_adjustment'
]);
export const personalityTagCategoryEnum = pgEnum('personality_tag_category', [
  'work_style', 'communication', 'energy_level', 'experience_type', 'special_skills'
]);
export const poolFailureTypeEnum = pgEnum('pool_failure_type', ['hard', 'soft', 'threshold']);
export const pipelineStatusEnum = pgEnum('pipeline_status', [
  'invited',           // Initial invite sent
  'email_opened',      // Invite email was opened
  'trial_started',     // Trial period began
  'trial_active',      // Actively using trial
  'trial_expired',     // Trial ended without conversion
  'accepted',          // Subscribed to paid plan
  'rejected',          // Declined after trial
  'churned',           // Cancelled after being accepted
]);
export const onboardingTaskStatusEnum = pgEnum('onboarding_task_status', [
  'pending',           // Not started
  'in_progress',       // Started but not complete
  'completed',         // Fully completed
  'skipped',           // User chose to skip
]);
export const rewardStatusEnum = pgEnum('reward_status', [
  'locked',            // Not yet earned
  'unlocked',          // Earned but not applied
  'applied',           // Applied to invoice/checkout
  'expired',           // Reward expired before use
]);
export const rewardTypeEnum = pgEnum('reward_type', [
  'onboarding_discount_10',     // 10% off first subscription
  'referral_bonus',             // Referral credit
  'early_adopter',              // Early adopter discount
  'loyalty_bonus',              // Long-term customer bonus
]);
export const taskCreatorEnum = pgEnum('task_creator', [
  'system',            // Auto-generated by platform
  'ai',                // Generated by Gemini AI
  'admin',             // Created by platform admin
]);
export const feedbackTypeEnum = pgEnum('feedback_type', [
  'bug',
  'feature_request',
  'improvement',
  'general',
  'bug_report',  // DB-synced
  'complaint',   // DB-synced
]);
export const feedbackPriorityEnum = pgEnum('feedback_priority', [
  'low',
  'medium',
  'high',
  'critical',  // DB-synced
]);
export const feedbackStatusEnum = pgEnum('feedback_status', [
  'new',
  'under_review',
  'planned',
  'in_progress',
  'completed',
  'closed',
  'declined',   // DB-synced
  'duplicate',  // DB-synced
]);
export const codeChangeStatusEnum = pgEnum('code_change_status', [
  'pending',      // Awaiting review
  'approved',     // Approved, ready to apply
  'rejected',     // Rejected by reviewer
  'applied',      // Successfully applied to codebase
  'failed',       // Failed to apply
  'expired',      // Expired without action
]);
export const codeChangeTypeEnum = pgEnum('code_change_type', [
  'create',       // Create new file
  'modify',       // Modify existing file
  'delete',       // Delete file
  'rename',       // Rename file
]);
export const platformScanStatusEnum = pgEnum("platform_scan_status", [
  'running',
  'completed', 
  'failed'
]);
export const changeSeverityEnum = pgEnum("change_severity", [
  'critical',   // Breaking changes, security fixes
  'major',      // New features, significant improvements
  'minor',      // Bug fixes, small enhancements
  'patch',      // Hotfixes, typo corrections
  'info'        // Informational updates
]);
export const changeSourceTypeEnum = pgEnum("change_source_type", [
  'system',           // Platform system process
  'ai_brain',         // AI Brain automation
  'support_staff',    // Human support staff
  'developer',        // Developer/engineering team
  'automated_job',    // Scheduled automation job
  'user_request',     // User-initiated feature request
  'external_service', // Third-party integration
  'scheduled_job',    // DB-synced
  'admin_action',     // DB-synced
  'user_action',      // DB-synced
  'external_api',     // DB-synced
  'webhook',          // DB-synced
]);
export const changeDetailedCategoryEnum = pgEnum("change_detailed_category", [
  'feature',          // New feature added
  'service',          // Service modification
  'bot_automation',   // AI/bot automation changes
  'bugfix',           // Bug fix - something was broken
  'security',         // Security update
  'improvement',      // Enhancement to existing feature
  'deprecation',      // Feature removal or deprecation
  'hotpatch',         // Urgent fix
  'integration',      // Third-party integration change
  'ui_update',        // Frontend/UI change
  'backend_update',   // Backend/API change
  'performance',      // Performance optimization
  'documentation',    // Documentation update
  'maintenance',      // System/platform maintenance
  'diagnostic',       // Diagnostic/troubleshooting update
  'support'           // Support-related update
]);
export const motionPatternTypeEnum = pgEnum('motion_pattern_type', [
  'TRIAD_SYNCHRONIZED',    // All 3 stars rotate together in formation
  'DUAL_COUNTER_ROTATION', // Two stars orbit opposite directions
  'CENTRAL_ORBIT',         // Two stars orbit around the third
  'INDIVIDUAL_NOISE',      // Each star moves independently with noise
  'SEQUENCE_SCRIPTED',     // Choreographed sequence of movements
]);
export const quickFixRiskTierEnum = pgEnum('quick_fix_risk_tier', [
  'safe',      // Can be executed by any platform staff
  'moderate',  // Requires supervisor+ or approval code
  'elevated',  // Requires manager+ or dual approval
  'critical',  // Root admin only
]);
export const checkpointSyncStateEnum = pgEnum("checkpoint_sync_state", [
  "pending",
  "synced",
  "failed",
  "stale"
]);
export const subagentDomainEnum = pgEnum('subagent_domain', [
  'scheduling',      // Shift management, availability, calendar sync
  'payroll',         // Pay runs, deductions, tax calculations
  'invoicing',       // Invoice generation, billing, client payments
  'compliance',      // Certifications, labor law, break enforcement
  'notifications',   // Alert routing, email, SMS, WebSocket
  'analytics',       // Metrics, reports, KPI tracking
  'gamification',    // Achievements, points, leaderboards
  'communication',   // Chat, helpdesk, support tickets
  'health',          // System monitoring, performance checks
  'testing',         // Automated tests, validation
  'deployment',      // Code commits, releases, migrations
  'recovery',        // Session recovery, rollback, checkpoints
  'orchestration',   // Workflow coordination, chain execution
  'security',        // RBAC, audit, access control
  'escalation',      // Critical issue escalation, runbook execution
  'automation',      // Scheduled jobs, diagnostics, platform animations
  'lifecycle',       // Employee lifecycle: probation, renewals, anniversaries
  'assist',          // User assistance: feature discovery, troubleshooting
  'filesystem',      // File operations: read, write, edit, search
  'workflow',        // Durable workflows: registration, execution, monitoring
  'onboarding',      // Employee onboarding: diagnostics, routing config
  'expense',         // Expense management: receipt OCR, categorization
  'pricing',         // Dynamic pricing: analysis, competitiveness, simulations
  'data_migration',  // Data migration: org onboarding, bulk import, hierarchy assignment
  'scoring',         // Trust scoring: graduated approval system, accuracy tracking, auto-approval
]);
export const subagentStatusEnum = pgEnum('subagent_status', [
  'idle',
  'preparing',
  'executing',
  'validating',
  'escalating',
  'completed',
  'failed',
  'derailed',
]);
export const automationLevelEnum = pgEnum("automation_level", [
  "hand_held",       // 0-40% confidence: All actions require explicit user confirmation
  "graduated",       // 41-75% confidence: Routine auto-execute, high-risk requires confirmation
  "full_automation", // 76-100% confidence: All actions auto-execute with notifications
]);// workspaceAutomationPolicies merged into workspaces.automation_policy_blob
export const workboardRequestTypeEnum = pgEnum('workboard_request_type', [
  'voice_command',     // Mobile voice command via Trinity
  'chat',              // HelpAI/Trinity chat message
  'direct_api',        // Direct API call
  'automation',        // Scheduled automation trigger
  'escalation',        // Escalated from another task
  'system'             // System-initiated task
]);
export const workboardTaskStatusEnum = pgEnum('workboard_task_status', [
  'pending',           // Waiting to be processed
  'queued',            // Queued for processing
  'analyzing',         // SubagentSupervisor analyzing intent
  'assigned',          // Assigned to a subagent
  'in_progress',       // Subagent actively working
  'awaiting_approval', // Requires human approval
  'completed',         // Successfully completed
  'failed',            // Failed with error
  'cancelled',         // Cancelled by user or system
  'escalated'          // Escalated to support
]);
export const workboardPriorityEnum = pgEnum('workboard_priority', [
  'critical',   // Immediate attention required
  'high',       // Priority processing
  'normal',     // Standard queue position
  'low',        // Background processing
  'scheduled'   // Scheduled for later
]);
export const executionModeEnum = pgEnum('execution_mode', [
  'normal',       // Standard sequential processing
  'trinity_fast'  // Premium parallel execution using credits
]);
export const entityTypeEnum = pgEnum("entity_type", [
  "human", // Regular user
  "bot", // Automated bot
  "subagent", // AI subagent
  "trinity", // Trinity AI orchestrator
  "service", // Platform service
  "external", // External integration
  "automation", // Automated system (DB-synced)
  "external_integration", // External system integration (DB-synced)
]);
export const agentStatusEnum = pgEnum("agent_status", [
  "active",
  "suspended",
  "revoked",
  "pending_approval",
  "maintenance",
  "decommissioned",
]);
export const policyEffectEnum = pgEnum("policy_effect", [
  "allow",
  "deny",
  "require_approval",
]);
export const knowledgeEntityTypeEnum = pgEnum("knowledge_entity_type", [
  "concept", "rule", "pattern", "fact", "procedure", 
  "constraint", "insight", "error_pattern", "success_pattern",
  "preference", "relationship", "anomaly", "decision",  // DB-synced
]);
export const knowledgeDomainEnum = pgEnum("knowledge_domain", [
  "scheduling", "payroll", "compliance", "invoicing", "employees",
  "clients", "automation", "security", "performance", "general",
  "onboarding", "analytics", "communication", "time_tracking",  // DB-synced
]);
export const knowledgeRelationTypeEnum = pgEnum("knowledge_relation_type", [
  "depends_on", "implies", "contradicts", "similar_to", "derived_from",
  "applies_to", "causes", "prevents", "requires", "enables"
]);
export const a2aAgentRoleEnum = pgEnum("a2a_agent_role", [
  "orchestrator", "specialist", "validator", "executor", "observer",
  "coordinator", "analyst", "monitor",
]);
export const a2aAgentStatusEnum = pgEnum("a2a_agent_status", [
  "active", "busy", "offline", "suspended", "maintenance"
]);
export const a2aMessageTypeEnum = pgEnum("a2a_message_type", [
  "request", "response", "broadcast", "negotiation", "validation_request",
  "validation_result", "knowledge_share", "error_report", "status_update", "handoff"
]);
export const a2aMessagePriorityEnum = pgEnum("a2a_message_priority", [
  "critical", "high", "normal", "low"
]);
export const a2aMessageStatusEnum = pgEnum("a2a_message_status", [
  "pending", "delivered", "acknowledged", "processed", "expired", "failed"
]);
export const automationGovernanceStatusEnum = pgEnum('automation_governance_status', [
  'pending',
  'approved',
  'rejected',
  'executed',
  'failed',
  'rolled_back',
]);
export const trinityTrustLevelEnum = pgEnum('trinity_trust_level', [
  'new',
  'learning', 
  'established',
  'expert'
]);
export const orchestrationPhaseEnum = pgEnum('orchestration_phase', [
  'intake',          // Received, parsing (WorkOrder intake)
  'planning',        // Decomposing (WorkOrder decomposition)
  'validating',      // Pre-flight checks (ExecutionManifest preflight)
  'executing',       // Running steps (ExecutionManifest execution)
  'reflecting',      // Post-execution analysis (Self-reflection)
  'committing',      // Finalizing results
  'completed',       // Successfully done
  'failed',          // Execution failed
  'rolled_back',     // Undone after failure
  'escalated'        // Handed to human
]);
export const permissionResultEnum = pgEnum('permission_result', [
  'pending',         // Not yet checked
  'granted',         // All permissions granted
  'partial',         // Some permissions granted
  'denied',          // Permission denied
  'bypassed'         // Admin/AI bypass applied
]);
export const componentDomainEnum = pgEnum('component_domain', [
  'schema',              // Database schema definitions
  'service',             // Backend services
  'handler',             // Request handlers
  'hook',                // React hooks
  'page',                // Frontend pages
  'component',           // UI components
  'manager',             // State managers
  'loader',              // Loading/async components
  'utility',             // Utility functions
  'asset',               // Static assets (images, fonts, etc.)
  'config',              // Configuration files
  'test',                // Test files
  'subagent',            // AI Brain subagents
  'orchestration',       // Orchestration services
  // DB-synced extended values
  'frontend_page',
  'frontend_component',
  'frontend_hook',
  'frontend_lib',
  'backend_route',
  'backend_service',
  'backend_middleware',
  'backend_lib',
  'ai_brain_action',
  'ai_brain_subagent',
  'ai_brain_service',
  'shared_schema',
  'shared_type',
  'shared_util',
  'automation_job',
  'documentation',
]);
export const componentCriticalityEnum = pgEnum('component_criticality', [
  'critical',   // System-breaking if fails
  'core',       // Core functionality
  'feature',    // Feature-level importance
  'utility',    // Helper/utility level
  'cosmetic',   // UI/UX only
]);
export const gapSeverityEnum = pgEnum('gap_severity', [
  'critical',   // System-breaking, immediate fix needed
  'high',       // Major functionality affected
  'medium',     // Feature affected but workarounds exist
  'low',        // Minor issues or improvements
  'info',       // Informational findings
  'warning',    // DB-synced
  'error',      // DB-synced
  'blocker',    // DB-synced
]);
export const gapTypeEnum = pgEnum('gap_type', [
  'typescript_error',   // TypeScript compilation errors
  'schema_mismatch',    // Database schema mismatches
  'code_quality',       // Code quality issues
  'missing_handler',    // Missing route/handler
  'missing_hook',       // Missing or broken hook
  'missing_component',  // Missing UI component
  'orphaned_file',      // Unused/orphaned file
  'security_issue',     // Security vulnerability
  'performance_issue',  // Performance bottleneck
  'accessibility',      // A11y violations
  'visual_anomaly',     // Visual QA findings
  'log_error',          // Errors detected in logs
  'integration_gap',    // Missing integration
  'capability_gap',     // Missing AI capability
]);
export const workflowApprovalStatusEnum = pgEnum('workflow_approval_status', [
  'pending',     // Awaiting approval
  'approved',    // Approved by authorized user
  'rejected',    // Rejected by authorized user
  'expired',     // Approval window expired
  'executed',    // Fix has been applied
  'failed',      // Fix execution failed
  'rolled_back', // Fix was rolled back
]);
export const aiBrainActorTypeEnum = pgEnum("ai_brain_actor_type", [
  "trinity", "end_user", "support", "automation", "system"
]);
export const complianceReportTypeEnum = pgEnum('compliance_report_type', [
  'labor_law_violations',      // FLSA, DOL violations
  'tax_remittance',            // IRS/State tax withholding proof
  'time_entry_audit',          // 7-year retention audit log
  'osha_safety',               // OSHA workplace safety incidents
  'eeo_demographics',          // Equal Employment Opportunity
  'aca_healthcare',            // Affordable Care Act compliance
  'i9_verification',           // I-9 work authorization
  'break_compliance',          // State-specific meal/rest break laws
  'overtime_summary',          // Weekly overtime tracking
  'certification_expiry',      // Expiring licenses/certifications
  'payroll_summary',           // Pay period summaries
  'contractor_1099',           // 1099 contractor payments
]);
export const complianceReportStatusEnum = pgEnum('compliance_report_status', [
  'generating',                // Report generation in progress
  'completed',                 // Successfully generated
  'failed',                    // Generation failed
  'archived',                  // Archived for long-term storage
]);
export const serviceTypeEnum = pgEnum('service_type', [
  'armed_guard',
  'unarmed_guard', 
  'patrol',
  'surveillance',
  'escort',
  'event_security',
  'executive_protection',
  'loss_prevention',
  'alarm_response',
  'fire_watch',
  'access_control',
  'concierge',
  'custom'
]);
export const equipmentStatusEnum = pgEnum('equipment_status', [
  'available', 'assigned', 'maintenance', 'retired', 'lost'
]);
export const equipmentCategoryEnum = pgEnum('equipment_category', [
  'radio', 'vehicle', 'weapon', 'uniform', 'tool', 'technology', 'safety', 'other'
]);
export const financialSnapshotGranularityEnum = pgEnum('financial_snapshot_granularity', [
  'weekly', 'monthly', 'quarterly', 'annual', 'custom'
]);
export const financialSnapshotSourceEnum = pgEnum('financial_snapshot_source', [
  'platform', 'quickbooks', 'hybrid'
]);
export const qbTransactionTypeEnum = pgEnum('qb_transaction_type', [
  'invoice', 'payment', 'expense', 'journal', 'bill', 'credit_memo', 'deposit'
]);
export const financialAlertCategoryEnum = pgEnum('financial_alert_category', [
  'ar_aging', 'margin', 'payroll', 'expense', 'cash_flow', 
  'client_profit', 'sync', 'compliance', 'forecast'
]);
export const financialAlertSeverityEnum = pgEnum('financial_alert_severity', [
  'info', 'warning', 'critical'
]);
export const complianceStateStatusEnum = pgEnum('compliance_state_status', ['active', 'inactive', 'pending_review']);
export const complianceDocStatusEnum = pgEnum('compliance_doc_status', ['pending', 'submitted', 'approved', 'rejected', 'expired', 'locked']);
export const complianceApprovalStatusEnum = pgEnum('compliance_approval_status', ['pending', 'in_review', 'approved', 'rejected', 'escalated']);
export const complianceDocImageTypeEnum = pgEnum('compliance_doc_image_type', ['front_only', 'front_back', 'single_page', 'multi_page']);
export const regulatorAccessLevelEnum = pgEnum('regulator_access_level', ['view_only', 'audit', 'full_access']);
export const clientContractDocTypeEnum = pgEnum('client_contract_doc_type', [
  'proposal',      // Initial proposal sent to client
  'contract',      // Formal contract after proposal acceptance
  'amendment',     // Amendment to existing contract
  'addendum',      // Additional terms/exhibits
]);
export const clientContractStatusEnum = pgEnum('client_contract_status', [
  'draft',              // Being created/edited
  'sent',               // Sent to client
  'viewed',             // Client has viewed
  'accepted',           // Client accepted proposal
  'changes_requested',  // Client requested modifications
  'declined',           // Client declined
  'pending_signatures', // Awaiting signatures
  'partially_signed',   // One party has signed
  'executed',           // Fully signed and binding
  'expired',            // Past expiration
  'terminated',         // Terminated early
  'archived',           // Long-term storage
]);
export const clientSignatureTypeEnum = pgEnum('client_signature_type', [
  'typed',     // Typed legal name + consent
  'drawn',     // Touch/mouse drawn signature
  'uploaded',  // Uploaded image
]);
export const clientSignerRoleEnum = pgEnum('client_signer_role', [
  'company',   // Org owner/representative
  'client',    // Client party
  'witness',   // Optional witness
  'notary',    // Optional notary
]);
export const clientContractAuditActionEnum = pgEnum('client_contract_audit_action', [
  'created', 'updated', 'sent', 'viewed', 'downloaded',
  'accepted', 'declined', 'changes_requested', 'signed',
  'executed', 'amended', 'terminated', 'archived', 'searched',
  'reminder_sent', 'access_granted', 'access_revoked',
]);
export const shiftCoverageStatusEnum = pgEnum("shift_coverage_status", [
  "open",           // Actively seeking coverage
  "accepted",       // An employee accepted
  "expired",        // Timed out with no acceptances
  "escalated",      // Escalated to org owner
  "cancelled",      // Manually cancelled
]);
export const coverageOfferStatusEnum = pgEnum("coverage_offer_status", [
  "pending",     // Waiting for employee response
  "accepted",    // Employee accepted (only one can win)
  "declined",    // Employee declined
  "expired",     // No response before timeout
  "superseded",  // Another employee accepted first
]);
export const aiProviderEnum = pgEnum("ai_provider", [
  'openai',    // GPT-4, GPT-4o, GPT-3.5
  'anthropic', // Claude models
  'google',    // Gemini models
]);
export const aiModelTierEnum = pgEnum("ai_model_tier", [
  'worker',      // Tier 1: Simple tasks, high volume, cheap (GPT-3.5, GPT-4o-mini)
  'operations',  // Tier 2: Real-time ops, scheduling (Gemini Flash/Pro)
  'strategic',   // Tier 3: Complex reasoning, RFPs, contracts (Claude, GPT-4)
]);
export const aiTaskStatusEnum = pgEnum("ai_task_status", [
  'pending',      // Queued, waiting for processing
  'processing',   // Currently being executed
  'completed',    // Successfully completed
  'failed',       // All attempts failed
  'escalated',    // Escalated to human review
  'cancelled',    // Cancelled by user/system
]);
export const aiExecutionStatusEnum = pgEnum("ai_execution_status", [
  'success',        // Completed successfully
  'failed',         // Failed with error
  'timeout',        // Timed out
  'rate_limited',   // Hit rate limit
  'low_confidence', // Completed but with low confidence
]);
export const guardTourStatusEnum = pgEnum('guard_tour_status', [
  'active', 'paused', 'archived'
]);
export const guardTourScanStatusEnum = pgEnum('guard_tour_scan_status', [
  'completed', 'missed', 'late', 'skipped'
]);
export const clientPortalReportTypeEnum = pgEnum("client_portal_report_type", [
  "billing_discrepancy",
  "staff_issue",
  "complaint",
  "violation",
  "service_quality",
  "other",
]);
export const clientPortalReportStatusEnum = pgEnum("client_portal_report_status", [
  "open",
  "acknowledged",
  "in_review",
  "resolved",
  "dismissed",
]);
export const clientPortalSentimentEnum = pgEnum("client_portal_sentiment", [
  "positive",
  "neutral",
  "concerned",
  "frustrated",
  "angry",
]);

export const clientDeactivationReasonEnum = pgEnum('client_deactivation_reason', [
  'non_payment',
  'legal_issue',
  'contract_terminated',
  'contract_non_renewal',
  'lawsuit',
  'unable_to_staff',
  'does_not_meet_billing_requirements',
  'does_not_meet_hourly_requirements',
  'other',
  'no_reason_provided',
]);

export const collectionsStatusEnum = pgEnum('collections_status', [
  'none',
  'pending_decision',
  'active',
  'resolved',
  'written_off',
]);
export const complianceEntityTypeEnum = pgEnum('compliance_entity_type', [
  'organization', 'officer',
]);
export const enforcementDocTypeEnum = pgEnum('enforcement_doc_type', [
  'coi',                // Certificate of Insurance
  'state_license',      // State operating license / certificate
  'guard_card',         // Unarmed guard card
  'armed_guard_card',   // Armed guard card
  'i9',
  'w4',
  'w9',
  'training_cert',
  'background_check',
  'other',
]);
export const freezePhaseEnum = pgEnum('freeze_phase', [
  'auto_14day',        // Automatically frozen at day 14
  'appeal_extension',  // Re-frozen after appeal deadline passed
  'manual_support',    // Frozen by support staff
]);
export const freezeStatusEnum = pgEnum('freeze_status', [
  'active',
  'lifted',
  'pending_appeal',
  'pending_support',
]);
export const appealStatusEnum = pgEnum('appeal_status', [
  'submitted',
  'approved',
  'denied',
  'expired',
]);
export const auditDocRequestStatusEnum = pgEnum('audit_doc_request_status', [
  'requested',
  'submitted',
  'passed',
  'passed_with_conditions',
  'failed',
]);
export const auditFindingTypeEnum = pgEnum('audit_finding_type', [
  'violation',
  'warning',
  'fine',
  'commendation',
  'condition',
]);
export const vehicleStatusEnum = pgEnum('vehicle_status', [
  'active', 'inactive', 'maintenance', 'retired'
]);
export const tokenTypeEnum = pgEnum("token_type", [
  "magic_link",
  "password_reset", 
  "email_verify",
  "session"
]);
export const businessCategoryEnum = pgEnum('business_category', [
  'general', // Default - basic forms only
  'security', // Security guards, surveillance - DAR, incident reports
  'healthcare', // Healthcare providers - patient logs, incident reports, compliance forms
  'construction', // Construction companies - safety checklists, OJT forms, equipment logs
  'cleaning', // Cleaning services - inspection checklists, supply logs
  'hospitality', // Hotels, restaurants - service logs, maintenance reports
  'retail', // Retail stores - inventory logs, shift reports
  'transportation', // Logistics, delivery - vehicle logs, route reports
  'manufacturing', // Factories - production logs, quality control
  'education', // Schools, training centers - attendance, assessment forms
  'custom' // Fully custom forms configured by admin
]);
export const workspaceRoleEnum = pgEnum('workspace_role', [
  'org_owner',          // Tier 1: Organization Owner - Top authority, full tenant control, billing, can delete org
  'co_owner',           // Tier 1: Co-Owner - Delegated authority, access controlled by owner (0-1 per org)
  'org_admin',          // Tier 2: Office Administrator - Administrative access, no financial, no scheduling authority
  'org_manager',        // Tier 2: Org Manager - Organization-wide management, broad operational access
  'manager',            // Tier 2: Manager - Schedule/payroll/client management, Trinity AI access
  'department_manager', // Tier 2: Department Manager - Department tasks, staff, and reports (legacy alias: manager)
  'supervisor',         // Tier 3: Supervisor - Team oversight, timesheet approval, no Trinity/payroll
  'staff',              // Tier 4: Employee - Clock in/out, view own schedule/pay, basic access
  'employee',           // Tier 4: Alias for staff
  'auditor',            // Read-only access to compliance data, scoped to one org, time-limited
  'contractor'          // Limited access to specific tasks/projects only
]);

// ── DB-ONLY ENUM TYPES (exist in DB but were missing from Drizzle) ──────────

export const trinityRiskLevelEnum = pgEnum('trinity_risk_level', [
  'low', 'medium', 'high', 'critical'
]);

export const trinityStepStatusEnum = pgEnum('trinity_step_status', [
  'pending', 'in_progress', 'completed', 'failed', 'skipped', 'retrying'
]);

export const trinityTaskPhaseEnum = pgEnum('trinity_task_phase', [
  'intake', 'plan', 'preflight', 'act', 'validate', 'reflect', 'commit', 'report'
]);

export const trinityTaskStatusEnum = pgEnum('trinity_task_status', [
  'pending', 'planning', 'plan_ready', 'executing', 'validating',
  'reflecting', 'completed', 'failed', 'escalated', 'cancelled'
]);

export const automationLevelEnumDb = pgEnum('automation_level_enum', [
  'HAND_HELD', 'GRADUATED', 'FULL_AUTOMATION'
]);

export const migrationDocumentTypeEnum = pgEnum('migration_document_type', [
  'employees', 'payroll', 'schedules', 'invoices', 'timesheets', 'clients', 'other'
]);

export const migrationJobStatusEnum = pgEnum('migration_job_status', [
  'uploaded', 'analyzing', 'reviewed', 'importing', 'completed', 'failed', 'cancelled'
]);

export const relationshipTypeEnum = pgEnum('relationship_type', [
  'causes', 'prevents', 'requires', 'suggests', 'contradicts',
  'extends', 'modifies', 'depends_on', 'related_to'
]);

export const rlOutcomeEnum = pgEnum('rl_outcome', [
  'success', 'partial_success', 'failure', 'timeout', 'skipped'
]);
