/**
 * Platform Event Bus - Unified event system connecting all CoAIleague services
 * 
 * Connects: Chat Server, AI Brain, Notifications, Tickets, What's New
 * All features can emit events that automatically propagate to:
 * - Real-time WebSocket broadcasts
 * - Notification system
 * - What's New feed
 * - Audit logging
 */

import { db } from '../db';
import { platformUpdates, notifications, platformRoles, systemAuditLogs, employees } from '@shared/schema';
import { eq, and, inArray, gte, isNull } from 'drizzle-orm';
import { notificationEngine } from './universalNotificationEngine';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';

const log = createLogger('PlatformEventBus');

export type PlatformEventType = 
  | 'feature_released'
  | 'feature_updated'
  | 'bugfix_deployed'
  | 'security_patch'
  | 'announcement'
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_escalated'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'chat_message'
  | 'chat_user_joined'
  | 'chat_user_left'
  | 'chat_moderation'
  | 'automation_completed'
  | 'ai_brain_action'
  | 'ai_escalation'
  | 'ai_suggestion'
  | 'ai_error'
  | 'ai_timeout'
  | 'system_maintenance'
  | 'queue_update'
  | 'staff_action'
  // Schedule-specific events for real-time workforce notifications
  | 'schedule_published'
  | 'shift_created'
  | 'shift_updated'
  | 'shift_deleted'
  | 'shift_swap_requested'
  | 'shift_swap_approved'
  | 'shift_swap_denied'
  | 'shift_assigned'
  | 'shift_unassigned'
  // Trinity AI orchestration lifecycle events
  | 'trinity_scan_started'
  | 'trinity_scan_completed'
  | 'trinity_issue_detected'
  | 'trinity_fix_proposed'
  | 'trinity_fix_approved'
  | 'trinity_fix_rejected'
  | 'trinity_fix_applied'
  | 'trinity_diagnostic_started'
  | 'trinity_diagnostic_completed'
  | 'trinity_escalation_required'
  | 'trinity_self_healing'
  // Audit events
  | 'audit'
  // Autonomous fix pipeline events
  | 'approval_approved'
  | 'approval_rejected'
  | 'fix_applied'
  | 'fix_validated'
  | 'fix_escalated'
  | 'fix_exhausted'
  // Gap Intelligence scan events
  | 'gap_intelligence_scan'
  | 'billing'
  // Schedule import and analysis events
  | 'prior_schedules_imported'
  | 'schedule_analysis_requested'
  | 'employee_documents_required'
  | 'employee_task_created'
  | 'compliance_document_created'
  | 'compliance_document_updated'
  | 'compliance_document_deleted'
  | 'compliance_document_expired'
  | 'compliance_document_missing'
  | 'compliance_document_approved'
  | 'compliance_document_rejected'
  | 'compliance_suspension_triggered'
  | 'compliance_suspension_lifted'
  // Field Operations — RMS events
  | 'incident_report_filed'
  | 'incident_report_updated'
  | 'incident_escalated_to_dispatch'
  | 'dar_submitted'
  | 'dar_generated'                     // DAR auto-generated after shift ends
  | 'visitor_checked_in'
  | 'bolo_match_detected'
  | 'bolo_created'
  | 'vehicle_flagged'
  | 'wellness_sos_triggered'
  | 'wellness_missed_checkin'
  | 'rms_case_opened'
  | 'rms_case_closed'
  | 'evidence_transferred'
  | 'offline_form_synced'
  // Field Operations — CAD events
  | 'cad_call_created'
  | 'cad_call_dispatched'
  | 'cad_call_resolved'
  | 'unit_status_changed'
  // Field Operations — GPS / Officer events
  | 'officer_clocked_in'
  | 'officer_clocked_out'
  | 'geofence_departure'
  | 'geofence_return'
  | 'manual_override_submitted'
  // Field Operations — Safety events
  | 'panic_alert_triggered'
  | 'panic_alert_acknowledged'
  | 'panic_alert_resolved'
  // Document signing events
  | 'document_sent_for_signature'
  | 'document_fully_signed'
  // Form builder events
  | 'custom_form_created'
  | 'race_condition_prevented'
  | 'scheduler_job_failed'
  | 'quickbooks_connected'
  | 'quickbooks_flow_complete'
  | 'quickbooks_flow_initiated'
  | 'quickbooks_flow_error'
  | 'quickbooks_flow_reset'
  | 'quickbooks_oauth_complete'
  | 'partner_sync_complete'
  | 'employees_imported'
  | 'time_entries_approved'
  | 'hris_connected'
  | 'hris_disconnected'
  | 'hris_sync_completed'
  // ─── Financial lifecycle events (invoice + payroll + payments) ─────────────
  // These are canonical platform events. All invoice/payroll mutations MUST publish
  // these so Trinity and automation subscribers can react.
  | 'invoice_created'          // New invoice opened (AR debit)
  | 'invoice_sent'             // Invoice delivered to client
  | 'invoice_paid'             // Invoice fully paid (status → paid)
  | 'invoice_voided'           // Invoice voided (AR credit reversal)
  | 'invoice_cancelled'        // Invoice cancelled (AR credit reversal)
  | 'invoice_overdue'          // Invoice crossed due-date unpaid
  | 'invoice_disputed'         // Invoice disputed by client
  | 'invoice_dispute_resolved' // Invoice dispute resolved by manager
  | 'payment_received_partial' // Partial payment recorded on invoice
  | 'payroll_run_approved'     // Payroll run approved by manager
  | 'payroll_run_processed'    // Payroll run fully processed (net calc complete)
  | 'payroll_run_paid'         // Payroll run marked as paid (funds disbursed)
  | 'stripe_payment_received'  // Stripe webhook: invoice paid via Stripe
  | 'client.created'           // New client workspace entity created
  // ─── Orchestration lifecycle events ──────────────────────────────────────
  | 'orchestration_started'        // 7-step orchestration pipeline started
  | 'orchestration_completed'      // 7-step orchestration pipeline completed successfully
  | 'orchestration_failed'         // 7-step orchestration pipeline failed
  // ─── Workspace + employee lifecycle events ─────────────────────────────
  | 'workspace.created'            // New workspace created — triggers bootstrap automation
  | 'employee_activated'           // Employee account activated
  | 'employee_deactivated'         // Employee account deactivated
  | 'employee_hired'               // New employee hired/onboarded
  | 'employee_terminated'          // Employee terminated
  | 'employee_updated'             // Employee record updated
  // ─── Shift swap + coverage lifecycle events ────────────────────────────
  | 'shift_cancelled'              // Shift cancelled — coverage pipeline triggered
  | 'shift_swap_cancelled'         // Shift swap request cancelled
  // ─── Payroll orchestration events ────────────────────────────────────
  | 'payroll_run_created'          // New payroll run created by automation
  | 'payroll_run_disbursing'       // Payroll run entering disbursement — transfers being initiated
  | 'payroll_run_voided'           // Payroll run voided — funds clawed back or never disbursed
  | 'payroll_zero_rate_detected'   // Payroll has zero-rate employees — blocks processing
  | 'payroll_transfer_initiated'   // Individual ACH/Plaid transfer initiated for an employee
  | 'workspace_bank_disconnected'  // Org funding bank account disconnected — ACH payroll suspended
  // ─── Reconciliation + alerting events ────────────────────────────────
  | 'reconciliation_alert'         // Financial reconciliation discrepancy detected
  | 'coverage_gap_detected'        // No coverage found for an open shift
  // ─── Field Operations — DAR additional events ────────────────────────────
  | 'dar_verified'                 // Daily Activity Report verified by supervisor
  | 'dar_sent_to_client'           // DAR sent to client (email delivered)
  // ─── Scheduling orchestration lifecycle events ────────────────────────────
  | 'scheduling_session_complete'  // Scheduling session finalized (awaiting verification)
  // ─── Automation execution lifecycle events ────────────────────────────────
  | 'automation_execution_completed'   // Automation execution finished
  | 'automation_execution_failed'      // Automation execution failed (with retry info)
  | 'automation_pending_verification'  // Automation output pending human verification
  | 'automation_execution_verified'    // Automation output verified and accepted
  | 'automation_execution_rejected'    // Automation output rejected by verifier
  // ─── QuickBooks operation events ─────────────────────────────────────────
  | 'quickbooks_operation_completed'   // QB sync/write operation succeeded
  | 'quickbooks_operation_failed'      // QB sync/write operation failed
  // ─── Document pipeline events ─────────────────────────────────────────────
  | 'document_completed'               // Document pipeline: delivery confirmed, document stored
  | 'approval_requested'               // Document pipeline: approval workflow initiated
  // ─── Auth + subscription events ───────────────────────────────────────────
  | 'subscription_payment_blocked'     // Subscription payment blocked on login (billing enforcement)
  // ─── Workspace + subscription lifecycle events ────────────────────────────
  | 'workspace_suspended'             // Workspace suspended (payment failure, trial expiry, manual)
  | 'workspace_reactivated'           // Workspace reactivated after suspension
  | 'workspace_downgraded'            // Workspace tier downgraded (trial end, manual)
  | 'subscription_cancelled'          // Subscription set to cancel (immediate or at period end)
  // ─── Payment lifecycle events ─────────────────────────────────────────────
  | 'payment_succeeded'               // Stripe payment intent succeeded
  | 'payment_failed'                  // Stripe payment intent or invoice payment failed
  | 'invoice_payment_failed'          // Stripe invoice payment failed (grace period trigger)
  // ─── Rate limiting events ─────────────────────────────────────────────────
  | 'rate_limit_hit'                  // AI rate limit threshold exceeded for a workspace
  // ─── Employee lifecycle extended events ───────────────────────────────────
  | 'employee_role_changed'            // Employee title/role/position changed
  // ─── Content moderation events ────────────────────────────────────────────
  | 'content_moderation_alert'         // HelpAI critical content moderation flag
  // ─── Compliance & Labor Law events ────────────────────────────────────────
  | 'sla_breach'                       // SLA target missed — ops team notification
  | 'trinity_labor_law_flag'           // Trinity detected a labor law violation during action review
  | 'trinity_action_blocked'           // Trinity blocked an action due to compliance/policy
  | 'agent_escalation'                 // AI agent escalated to human supervisor (low confidence/critical)
  | 'schedule_escalation'              // LLM Judge blocked a schedule — needs human approval before publishing
  | 'ai_cost_alert'                    // AI operation unprofitable or below margin threshold
  // ─── Approval + Resume lifecycle events ───────────────────────────────────
  | 'job_resume_approved'              // Paused approval-gated job cleared for retry
  // ─── Infrastructure + contract + compliance pipeline events ──────────────
  | 'circuit_breaker_opened'           // Circuit breaker tripped — service failing, operations team alert
  | 'contract_executed'                // Contract fully countersigned — triggers billing setup + client creation
  | 'contract_proposal_sent'           // Proposal sent to client for review and e-signature
  | 'contract_proposal_accepted'       // Client accepted proposal — formal contract being generated
  | 'contract_proposal_declined'       // Client declined proposal
  | 'contract_changes_requested'       // Client requested changes to a proposal
  | 'document_bridged'                 // Compliance document bridged to employee record — confirmation required
  | 'approval_granted'                 // Approval gate cleared — downstream workflow resumes
  // ─── Financial reconciliation + platform health ────────────────────────────
  | 'reconciliation_alert'             // Payroll/invoice math discrepancy detected — blocks disbursement
  | 'subscription_payment_blocked'     // Workspace login blocked by payment enforcement layer
  | 'scheduler_job_failed'             // Background scheduler job failed — platform health degraded
  | 'coverage_gap_detected'            // Open shift has no coverage after pipeline exhausted all options
  // ─── AI / learning / meta-cognitive events ────────────────────────────────
  | 'agent_learning'                   // AI agent recorded a learning outcome
  | 'ai_command_logged'                // AI command execution logged
  | 'experience_recorded'              // RL experience persisted for future training
  | 'strategy_adapted'                 // AI strategy/model adapted based on feedback
  | 'risk_evaluation_completed'        // Pre-action risk evaluation completed
  | 'hotpatch_executed'                // Live hotpatch applied without restart
  | 'domain_supervisors_initialized'   // Domain supervisor services started
  // ─── API key lifecycle ────────────────────────────────────────────────────
  | 'api_key_created'                  // New API key issued
  | 'api_key_expiring'                 // API key approaching expiry window
  | 'api_key_revoked'                  // API key revoked immediately
  | 'api_key_rotated'                  // API key rotated to new value
  // ─── Approval gate extensions ─────────────────────────────────────────────
  | 'approval_escalated'               // Approval gate escalated to higher authority
  | 'approval_expired'                 // Approval gate timed out without decision
  // ─── Extended automation pipeline events ──────────────────────────────────
  | 'automation'                       // Generic automation event (legacy compat)
  | 'automation_approval_requested'    // Automation output pending approval before apply
  | 'automation_executed'              // Automation action successfully executed (user-facing)
  | 'automation_failed'                // Automation action failed after all retries
  | 'automation_failure_recorded'      // Internal: cumulative automation failure rate milestone (never user-facing)
  | 'orchestration_lifecycle'          // Internal orchestration started/completed telemetry (never user-facing)
  | 'websocket_cleanup_completed'      // Internal: WebSocket stale-connection cleanup cycle done (never user-facing)
  | 'shift_reminders_processed'        // Internal: shift reminder batch job completed (never user-facing)
  | 'daily_digest_completed'           // Internal: daily digest cron job completed (never user-facing)
  | 'automation_paused'                // Automation paused awaiting input or gate
  | 'automation_rejected'              // Automation output rejected by verifier
  | 'automation_settings_updated'      // Workspace automation settings changed
  | 'automation_triggers_configured'   // Automation trigger rules saved/updated
  // ─── Billing + subscription extended events ────────────────────────────────
  | 'billing_client_failed'            // Workspace billing client creation failed
  | 'billing_manual_edit_flagged'      // Manual billing edit flagged for review
  | 'billing_rate_missing'             // Required billing rate missing — blocks invoice
  | 'payroll_transfer_settled'         // Plaid ACH transfer settled — payroll funds delivered
  | 'payroll_transfer_failed'          // Plaid ACH transfer failed/returned
  | 'plaid_bank_connected'             // Org funding bank account connected via Plaid Link
  | 'plaid_bank_disconnected'          // Org funding bank account disconnected
  | 'plaid_employee_bank_linked'       // Employee direct deposit account linked via Plaid Link
  | 'plaid_webhook_received'           // Plaid webhook event received (transfer status push)
  | 'payroll_escalation'               // Payroll processing escalated for human review
  | 'payroll_manual_edit_flagged'      // Manual payroll edit flagged — audit required
  | 'paystub_generated'                // Employee pay stub generated and available
  | 'reactivation_failed'              // Workspace reactivation attempt failed
  | 'trial_converted'                  // Trial workspace converted to paid plan
  | 'trial_expiry_warning'             // Trial approaching end of grace period
  | 'trial_grace_period'               // Trial in grace period — services may degrade
  | 'trial_processing_complete'        // Trial-to-paid conversion fully processed
  | 'subscription_created'             // New Stripe subscription created
  | 'subscription_canceled'            // Stripe subscription canceled (alternate spelling)
  | 'client_created'                   // New client record created (manual, import, or auto from contract)
  | 'member_joined'                    // User accepted invite and joined a workspace
  | 'quickbooks_receipt_sync'          // QuickBooks receipt synced to ledger
  | 'quickbooks_sync_receipt'          // QB webhook sync receipt acknowledged
  // ─── Error + exception monitoring events ──────────────────────────────────
  | 'error_alert_triggered'            // System error threshold breached — alert fired
  | 'error_captured'                   // Unhandled exception captured by error boundary
  | 'exception_raised'                 // Business logic exception raised
  | 'exception_escalated'              // Exception escalated to support/ops
  | 'exception_resolved'               // Exception marked resolved
  | 'exception_auto_resolved'          // Exception auto-healed without human intervention
  | 'exception_sla_breached'           // Exception SLA window missed
  // ─── Notification pipeline events ─────────────────────────────────────────
  | 'notification_acknowledged'        // User acknowledged a system notification
  | 'notification_actioned'            // User acted on a notification CTA
  | 'notification_diagnostic'          // Notification system self-diagnostic result
  | 'notification_escalated'           // Notification escalated (no acknowledgment)
  | 'notification_failed'              // Notification delivery failed after retries
  // ─── Onboarding funnel events ─────────────────────────────────────────────
  | 'onboarding_started'               // New workspace onboarding flow initiated
  | 'onboarding_step_completed'        // Single onboarding step completed
  | 'onboarding_complete'              // Full onboarding flow completed (alias)
  | 'onboarding_completed'             // Full onboarding flow completed
  | 'onboarding_stalled'               // Onboarding stalled — no activity for threshold period
  | 'onboarding_deadline_warning'      // Onboarding deadline approaching
  | 'onboarding_abandoned'             // Onboarding abandoned after grace period
  // ─── Partner / integration lifecycle ──────────────────────────────────────
  | 'partner_created'                  // New partner/integration connection established
  | 'partner_deleted'                  // Partner connection removed
  | 'partner_reactivated'              // Suspended partner connection reactivated
  | 'partner_suspended'                // Partner connection suspended (auth failure, etc.)
  | 'integration_connected'            // Third-party integration connected successfully
  | 'integration_disconnected'         // Third-party integration disconnected/deauthorized
  // ─── Schedule lifecycle extensions ────────────────────────────────────────
  | 'schedule_lifecycle_created'       // Schedule object created (pre-publish)
  | 'schedule_submitted_for_review'    // Schedule submitted for manager approval
  | 'schedule_approved'                // Schedule approved by manager
  | 'schedule_rejected'                // Schedule rejected — needs revision
  | 'shift_swap_expired'               // Shift swap request expired without response
  | 'shift_swap_rejected'              // Shift swap request rejected
  // ─── Support + ticketing extensions ───────────────────────────────────────
  | 'support_action'                   // Support action performed on workspace
  | 'support_action_approved'          // Support action approved by gatekeeper
  | 'support_action_approval_consumed' // Support approval token consumed
  | 'support_action_abuse_alert'       // Suspected support action abuse detected
  | 'support_ticket_resolved'          // Support ticket closed/resolved
  // ─── Team + workforce lifecycle events ────────────────────────────────────
  | 'team_formed'                      // New crew/team assembled for assignment
  | 'team_completed'                   // Team assignment completed/dissolved
  | 'time_entries_pending_review'      // Time entries batch awaiting manager review
  | 'client_incident_notification'     // Incident notification sent to client
  | 'work_order_completed'             // Work order/post order marked complete
  | 'invoice_overdue_escalated'        // Invoice escalated to collections after overdue threshold
  | 'employee.updated'                 // Employee record updated (dot-notation compat)
  | 'workspace.updated'                // Workspace settings/metadata updated (dot-notation compat)
  // ─── GPS / field monitoring extensions ────────────────────────────────────
  | 'photo_geofence_violation'         // Officer photo clock-in outside allowed geofence
  | 'geofence_override_required'       // Geofence exception requiring supervisor approval
  | 'geofence_override_resolved'       // Geofence override approved or denied
  | 'habitual_clockin_issue'           // Pattern of clock-in violations for same officer
  // ─── Trinity autonomous change management ────────────────────────────────
  | 'trinity_change_proposed'          // Trinity proposed a platform change for review
  | 'trinity_change_approved'          // Trinity change approved by operator
  | 'trinity_change_rejected'          // Trinity change rejected
  | 'trinity_changes_applied'          // Trinity changes committed to platform
  | 'trinity_changes_rolled_back'      // Trinity changes rolled back after failure
  | 'trinity_circuit_breaker_tripped'  // Trinity circuit breaker opened — AI throttled
  | 'trinity_circuit_breaker_reset'    // Trinity circuit breaker reset — AI resumed
  | 'trinity_rules_updated'            // Trinity governance rules updated
  | 'trinity_automation_request_sync'  // Trinity automation request synced to workspace
  | 'trinity_automation_settings_sync' // Trinity automation settings propagated
  | 'trinity_sandbox_execution_complete'// Trinity sandbox test execution completed
  // ─── UI / frontend control events ────────────────────────────────────────
  | 'ui_control_update'                // Frontend UI control state pushed from server
  | 'incident_created'                 // New incident report created (RMS alias)
  | 'addon_activated'                  // Feature addon plan activated for workspace
  | 'addon_cancelled'                  // Feature addon plan cancelled
  | 'feature_blocked'                  // Workspace blocked from using a feature due to tier limit
  | 'quota_exceeded'                   // Workspace exceeded a resource/API quota limit
  | 'credit_warning'                   // Workspace credit balance low — proactive alert
  | 'billing_alert'                    // Billing anomaly or threshold breach detected
  // ─── Stripe webhook canonical events ─────────────────────────────────────
  | 'subscription_updated'             // Stripe subscription tier/status updated (plan change)
  | 'subscription_activated'           // Stripe checkout completed — workspace subscription activated
  | 'payment_refunded'                 // Stripe charge refunded (full or partial)
  | 'refund_issued'                    // Invoice/payment refund issued (canonical audit event)
  | 'payment_received'                 // Payment received on an invoice (canonical audit event)
  | 'chargeback_received'              // Stripe chargeback / dispute received
  // ─── Invoice financial lifecycle (client invoicing) ───────────────────────
  | 'invoice_generated'                // Subscription invoice generated for billing period
  | 'late_fee_applied'                 // Late fee applied to overdue invoice
  | 'credit_memo_created'              // Credit memo issued against an existing invoice
  // ─── Shift lifecycle events ──────────────────────────────────────────────
  | 'shift_started'                    // Shift started — chatroom opened, field monitoring active
  | 'shift_completed'                  // Shift completed — chatroom closed, DAR generated
  // ─── Infrastructure recovery events ─────────────────────────────────────
  | 'circuit_breaker_recovered'        // Circuit breaker recovered from OPEN state — service restored
  // ─── Orchestration approval lifecycle ────────────────────────────────────
  | 'orchestration_pending_approval'   // Orchestration payload staged and awaiting human approval
  | 'orchestration_rejected'           // Orchestration payload rejected by approver
  // ─── Upsell + gating events ──────────────────────────────────────────────
  | 'upsell_triggered'                 // Upsell prompt fired for a gated feature below required tier
  // ─── RMS extended events ─────────────────────────────────────────────────
  | 'dar_approved'                     // Daily Activity Report approved by supervisor
  | 'evidence_created'                 // New evidence item logged into RMS
  | 'incident_supervisor_signed'       // Incident report reviewed/signed by supervisor
  // ─── Execution pipeline + compliance + broadcast events ──────────────────
  | 'human_review_required'            // Execution pipeline exhausted retries — human escalation required
  | 'compliance_onboarding_overdue'    // Employee onboarding document deadline exceeded
  | 'broadcast_created'                // Org-wide broadcast message created and delivered to staff
  // ─── Training + certification lifecycle events ────────────────────────────
  | 'training_certificate_earned'      // Officer earned a training certificate
  | 'training_intervention_required'   // Officer failed training or needs remediation
  | 'training_certificate_expired'     // Officer certification reached expiry date
  // ─── Client lifecycle extended events ────────────────────────────────────
  | 'client_deactivated'               // Client account deactivated — future shifts cancelled
  | 'client_reactivated'               // Client account reactivated — resuming billing
  // ─── Bid + proposal pipeline events ──────────────────────────────────────
  | 'bid_submitted'                    // Bid/proposal submitted or moved to a new pipeline stage
  | 'proposal_won'                     // Deal marked as won — trigger contract workflow
  | 'proposal_lost'                    // Deal marked as lost — record loss reason
  | 'service_event'                    // Internal service-to-service platform event (trinityPlatformConnector)
  | 'tcole_compliance_warning'         // Phase 35K: Officer below required annual TCOLE hours

export type EventCategory =
  | 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement'
  | 'maintenance' | 'diagnostic' | 'support' | 'ai_brain' | 'error'
  | 'schedule' | 'scheduling' | 'trinity' | 'automation' | 'integration'
  | 'fix' | 'hotpatch' | 'deprecation' | 'system' | 'incident'
  | 'outage' | 'recovery' | 'maintenance_update' | 'maintenance_postmortem'
  | 'payroll' | 'coverage' | 'staffing' | 'billing' | 'live_sync'
  | 'operations' | 'ai_action'
  // Extended operational categories — all have corresponding DB enum values
  | 'analytics' | 'user_assistance' | 'invoicing' | 'workforce' | 'compliance'
  | 'field_operations' | 'safety' | 'training' | 'time_tracking' | 'hr'
  | 'notifications' | 'health' | 'integrations' | 'performance' | 'documents'
  | 'platform_service';           // Internal service-to-service event category

// Event visibility levels - must match update_visibility enum in database
// Workspace-role visibility (who inside an org sees this notification):
//   org_leadership → org_owner + co_owner only (org leadership; replaces the old, semantically-ambiguous 'admin')
//   manager        → org_owner + co_owner + department_manager
//   supervisor     → all of the above + supervisor
//   staff / all    → everyone in the workspace
// Platform-staff visibility (separate channel, not workspace-member routing):
//   platform_staff → CoAIleague support/platform team (root_admin, deputy_admin, sysop, support_*)
//   admin          → DEPRECATED alias kept for DB backward-compat; treated as org_leadership in routing
export type EventVisibility = 'all' | 'staff' | 'supervisor' | 'manager' | 'org_leadership' | 'platform_staff' | 'admin';

export interface PlatformEvent {
  type: PlatformEventType;
  category: EventCategory;
  title: string;
  description: string;
  version?: string;
  workspaceId?: string; // null = global/platform-wide, set = workspace-specific
  userId?: string;
  eventType?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  source?: string;
  timestamp?: string | Date;
  data?: Record<string, any>;
  metadata?: Record<string, any> & {
    conversationId?: string;
    roomSlug?: string;
    ticketId?: string;
    ticketNumber?: string;
    messageId?: string;
    targetUserId?: string;
    audience?: 'room' | 'workspace' | 'user' | 'staff' | 'all';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    chatEventType?: string;
    payrollRunId?: string;
  };
  payload?: Record<string, any>;
  priority?: number;
  isNew?: boolean;
  learnMoreUrl?: string;
  visibility?: EventVisibility; // RBAC: who can see this update
}

export interface EventSubscriber {
  id?: string;
  name: string;
  handler: (event: PlatformEvent) => Promise<void>;
}

class PlatformEventBus {
  private subscribers: Map<string, EventSubscriber[]> = new Map();
  private wsHandler: ((event: PlatformEvent) => void) | null = null;
  private internalListeners: Map<string, ((payload: any) => void)[]> = new Map();

  /**
   * Register the WebSocket broadcast handler
   */
  setWebSocketHandler(handler: (event: PlatformEvent) => void) {
    this.wsHandler = handler;
    log.info('WebSocket handler registered');
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType: PlatformEventType | '*', subscriber: EventSubscriber) {
    const key = eventType === '*' ? 'all' : eventType;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key)!.push(subscriber);
    log.verbose('Subscriber registered', { subscriberName: subscriber.name, eventType });
  }

  /**
   * Lightweight internal event emitter for service-to-service communication
   * Does NOT persist to database or trigger notifications
   */
  emit(eventName: string, payload: any) {
    const listeners = this.internalListeners.get(eventName) || [];
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        log.error('Internal listener error', { eventName, error: String(error) });
      }
    }
  }

  /**
   * Register a lightweight internal listener
   */
  on(eventName: string, listener: (payload: any) => void) {
    if (!this.internalListeners.has(eventName)) {
      this.internalListeners.set(eventName, []);
    }
    this.internalListeners.get(eventName)!.push(listener);
    log.verbose('Internal listener registered', { eventName });
  }

  /**
   * Publish a platform event - propagates to all connected systems
   */
  async publish(event: PlatformEvent): Promise<void> {
    const timestamp = new Date().toISOString();
    log.verbose('Event published', { eventType: event.type, title: event.title });

    // Use scheduleNonBlocking so event publishing doesn't block the main execution flow
    scheduleNonBlocking('platform-event-bus.publish', async () => {
      // THALAMUS — Universal Sensory Gateway (fire-and-forget, never blocks publish)
      // Every platform event passes through the thalamus for classification and logging.
      try {
        const { trinityThalamus } = await import('./ai-brain/trinityThalamusService');
        const eventPayload: Record<string, any> = {
          type: event.type,
          event: event.type,
          category: event.category,
          title: event.title,
          ...(event.metadata || {}),
          ...(event.payload || {}),
        };
        await trinityThalamus.processPlatformEvent(
          eventPayload,
          event.workspaceId,
          event.userId || (event.metadata as any)?.userId,
        );
      } catch (err: any) {
        log.warn('[platformEventBus] Thalamus processing failed:', err.message);
      }

      // Internal emit for direct listeners (added for trinity orchestration)
      this.emit(event.type, { ...event.metadata, workspaceId: event.workspaceId, title: event.title, description: event.description });

      try {
        // 1. Store in What's New feed (persisted to database)
        await this.storeInWhatsNew(event);

        // 2. Notify all subscribers
        const allSubscribers = this.subscribers.get('all') || [];
        const typeSubscribers = this.subscribers.get(event.type) || [];
        
        // Use Promise.allSettled for parallel subscriber execution without cascading failure
        await Promise.allSettled([...allSubscribers, ...typeSubscribers].map(async (subscriber) => {
          try {
            await this.executeWithRetry(subscriber, event);
          } catch (error: any) {
            log.error(`[PlatformEventBus] Subscriber ${subscriber.name} failed:`, error.message);
          }
        }));

        // 5. Log to audit trail
        await this.logAudit(event, timestamp);

      } catch (error: any) {
        log.error('Error processing event', { error: String(error), eventType: event.type });
        
        // Circular dependency protection: only log error if not already an error event
        if (event.type !== 'ai_error' && event.type !== 'error_captured') {
          try {
            const { monitoringService } = await import('../monitoring');
            monitoringService.logError(error, {
              additionalData: { 
                eventType: event.type, 
                workspaceId: event.workspaceId
              }
            });
          } catch { /* ignore monitoring failures */ }
        }
      }
    });
  }

  /**
   * Store event in What's New database table via UniversalNotificationEngine
   * SINGLE SOURCE OF TRUTH: Routes all platform updates through Trinity
   * - Uses Trinity AI enrichment for contextual descriptions
   * - Includes smart deduplication
   * - Handles WebSocket broadcasts automatically
   */
  // Event types that are internal system/AI lifecycle events.
  // These should NEVER surface in the What's New feed or user notifications.
  private static readonly SYSTEM_INTERNAL_EVENT_TYPES = new Set<string>([
    // Agent / UACP lifecycle — purely internal
    'agent_registered',
    'agent_suspended',
    'agent_reactivated',
    'agent_token_issued',
    // Trinity AI scanning and diagnostic pipeline
    'trinity_scan_started',
    'trinity_scan_completed',
    'trinity_diagnostic_started',
    'trinity_diagnostic_completed',
    'trinity_fix_proposed',
    'trinity_fix_approved',
    'trinity_fix_rejected',
    'trinity_fix_escalated',
    'trinity_fix_exhausted',
    'trinity_fix_applied',
    'trinity_self_healing',
    'fix_applied',
    'fix_validated',
    // AI brain internal actions
    'ai_brain_action',
    'race_condition_prevented',
    'queue_update',
    'gap_intelligence_scan',
    // Reinforcement learning — internal AI training events, never user-facing
    'experience_recorded',
    'strategy_adapted',
    'strategy_proposed',
    // Knowledge graph / agent learning — internal AI self-improvement, never user-facing
    'agent_learning',
    'agent_skill_update',
    'agent_behavior_update',
    'knowledge_entity_added',
    'knowledge_entity_updated',
    'knowledge_entity_removed',
    // Cron job completions and orchestration machinery — internal infrastructure telemetry
    'automation_completed',
    'automation_failed',
    // Infrastructure / cron job telemetry — never user-facing
    'websocket_cleanup_completed',
    'shift_reminders_processed',
    'daily_digest_completed',
    'automation_failure_recorded',
    // Orchestration lifecycle telemetry — published by universalStepLogger at start/end of every
    // orchestration run. These are internal plumbing signals for Trinity learning and monitoring.
    // They must NEVER surface in the What's New feed — use automation_executed (user-facing)
    // from trinityAutomationToggle.ts for human-meaningful automation completion events.
    'orchestration_lifecycle',
    // Gamification internal events — not user-facing What's New material
    'gamification_xp_awarded',
    'gamification_badge_earned',
    'feature_explored',
    // Chat and field operations — real-time ops events, not What's New material
    'chat_user_joined',
    'chat_user_left',
    'chat_message',
    'unit_status_changed',
    'officer_clocked_in',
    'officer_clocked_out',
    'geofence_return',
    'geofence_departure',
    // Access control internal events
    'access_control_event',
    'permission_changed',
  ]);

  private async storeInWhatsNew(event: PlatformEvent): Promise<void> {
    try {
      // Skip events with no title — they are internal signaling events not meant for display
      if (!event.title || String(event.title).trim() === '' || event.title === 'undefined') {
        return;
      }

      // Skip internal system events — these are AI/infrastructure lifecycle events
      // that are meaningless (and often alarming) to end users.
      if (PlatformEventBus.SYSTEM_INTERNAL_EVENT_TYPES.has(event.type)) {
        log.verbose('Skipping internal system event (not user-facing)', { eventType: event.type, title: event.title });
        return;
      }

      // Route through UniversalNotificationEngine - THE SINGLE SOURCE
      // This provides:
      // 1. Trinity AI enrichment (structured Problem → Issue → Solution → Outcome)
      // 2. Smart deduplication (24h title-based)
      // 3. Proper platform update storage
      // 4. Automatic WebSocket broadcast
      const result = await notificationEngine.sendPlatformUpdate({
        title: event.title,
        description: event.description,
        category: event.category as any,
        workspaceId: event.workspaceId,
        priority: event.priority || 1,
        learnMoreUrl: event.learnMoreUrl,
        metadata: {
          ...event.metadata,
          sourceType: 'trinity',
          eventType: event.type,
          version: event.version,
          visibility: event.visibility || 'all',
        },
      });
      
      if (result.success) {
        if (result.isDuplicate) {
          log.info('Duplicate detected via Trinity, skipping', { title: event.title });
        } else {
          const scope = event.workspaceId ? `workspace:${event.workspaceId}` : 'global';
          log.info('Trinity-enriched update stored', { scope, title: event.title, id: result.id });
        }
      } else {
        log.warn('Trinity update failed', { title: event.title });
      }
    } catch (error) {
      log.error('Failed to store Trinity update', { error: String(error) });
    }
  }

  /**
   * Create notifications for platform events
   * Routes ALL notifications through UniversalNotificationEngine for Trinity AI enrichment
   * - Global events (no workspaceId): notify platform admins via sendPlatformNotification
   * - Workspace events (workspaceId set): notify by RBAC roles via sendNotificationToRoles
   */
  private async createNotifications(event: PlatformEvent): Promise<void> {
    try {
      
      // Global platform announcements (no workspaceId) - notify platform admins via unified engine
      if (!event.workspaceId && (event.category === 'announcement' || event.category === 'security')) {
        await notificationEngine.sendPlatformNotification({
          title: event.title,
          message: event.description,
          type: 'system',
          priority: event.priority === 3 ? 'critical' : event.priority === 2 ? 'high' : 'medium',
          actionUrl: event.learnMoreUrl || '/updates',
          targetRoles: ['root_admin', 'deputy_admin', 'support_manager'],
          metadata: { 
            category: event.category, 
            version: event.version,
            eventType: event.type,
          },
        });
        log.info('Routed platform notification through Trinity', { title: event.title });
      }

      // Workspace-specific events - notify by RBAC roles via unified engine
      if (event.workspaceId) {
        // Map visibility to which workspace member roles should receive notifications.
        // 'admin' is kept as a backward-compat alias for 'org_leadership'.
        // 'platform_staff' events are delivered through a separate platform channel, not workspace-role routing.
        const getRecipientRoles = (visibility: string): string[] => {
          switch (visibility) {
            case 'org_leadership':
            case 'admin':             // deprecated alias — treated as org_leadership
              return ['org_owner', 'co_owner'];
            case 'platform_staff':
              return [];              // platform staff are notified via their own platform channel
            case 'manager':
              return ['org_owner', 'co_owner', 'department_manager'];
            case 'supervisor':
              return ['org_owner', 'co_owner', 'department_manager', 'supervisor'];
            case 'staff':
            case 'all':
            default:
              return ['org_owner', 'co_owner', 'department_manager', 'supervisor', 'staff', 'auditor', 'contractor'];
          }
        };
        
        const recipientRoles = getRecipientRoles(event.visibility || 'all');
        
        await notificationEngine.sendNotification({
          workspaceId: event.workspaceId,
          roles: recipientRoles,
          title: event.title,
          message: event.description,
          type: 'system',
          priority: event.priority === 3 ? 'critical' : event.priority === 2 ? 'high' : 'medium',
          actionUrl: event.learnMoreUrl || '/updates',
          metadata: { 
            ...event.metadata, 
            category: event.category, 
            visibility: event.visibility,
            eventType: event.type,
          },
        });
        log.info('Routed workspace notification through Trinity', { visibility: event.visibility || 'all', title: event.title });
      }
    } catch (error) {
      log.error('Failed to create notifications', { error: String(error) });
    }
  }

  private async executeWithRetry(subscriber: EventSubscriber, event: PlatformEvent): Promise<void> {
    const maxRetries = 3;
    const baseDelayMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await subscriber.handler(event);
        return;
      } catch (err) {
        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          log.warn('Subscriber failed, retrying', { subscriberName: subscriber.name, attempt, maxRetries, delayMs });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          log.error('Subscriber failed after all retries', { subscriberName: subscriber.name, maxRetries, error: String(err) });
          this.persistDeadLetter(event, subscriber.name, err, maxRetries);
        }
      }
    }
  }

  private persistDeadLetter(event: PlatformEvent, subscriberName: string, error: unknown, retryCount?: number): void {
    try {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      db.insert(systemAuditLogs).values({
        userId: event.userId || null,
        action: 'event_bus_dead_letter',
        entityType: 'dead_letter',
        entityId: `${event.type}:${subscriberName}`,
        workspaceId: this.sanitizeWorkspaceIdForAudit(event.workspaceId),
        changes: {
          eventType: event.type,
          eventTitle: event.title,
          subscriberName,
          errorMessage: errorMsg,
          errorStack: errorStack?.substring(0, 500),
          retryCount: retryCount ?? 0,
          timestamp: new Date().toISOString(),
        },
        metadata: { category: event.category, priority: event.priority, retriesExhausted: retryCount ?? 0 },
        ipAddress: 'system-eventbus-deadletter',
      }).catch(dbErr => {
        log.error('Dead-letter DB persist failed', { error: String(dbErr) });
      });
    } catch (e) {
      log.error('Dead-letter persist error', { error: String(e) });
    }
  }

  /**
   * Sentinel workspace IDs that look like strings but are NOT real FK-valid workspace IDs.
   * These are used as billing/routing tags in AI services but must be converted to null
   * before any insert into tables that FK-reference the workspaces table.
   * NOTE: 'system' is intentionally excluded — it IS a real workspace in the database.
   * NOTE: 'PLATFORM_COST_CENTER' is a virtual billing cost center, not a real workspace row.
   */
  private static readonly SYSTEM_SENTINELS = new Set(['platform', 'trinity', 'none', '', 'PLATFORM_COST_CENTER']);

  private sanitizeWorkspaceId(id: string | undefined | null): string | null {
    if (!id || PlatformEventBus.SYSTEM_SENTINELS.has(id)) return null;
    return id;
  }

  private sanitizeWorkspaceIdForAudit(id: string | undefined | null): string {
    if (!id || PlatformEventBus.SYSTEM_SENTINELS.has(id)) return 'system';
    return id;
  }

  private async logAudit(event: PlatformEvent, timestamp: string): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: event.userId,
        action: `platform_event_${event.type}`,
        entityType: 'platform_event',
        entityId: event.title,
        workspaceId: this.sanitizeWorkspaceIdForAudit(event.workspaceId),
        changes: {
          type: event.type,
          category: event.category,
          title: event.title,
          description: event.description,
          version: event.version,
          timestamp,
        },
        metadata: event.metadata,
        ipAddress: 'system-eventbus',
      });
    } catch (error) {
      // Audit logging failures shouldn't break the event flow
      log.error('Audit log failed', { error: String(error) });
    }
  }
}

// Singleton instance
export const platformEventBus = new PlatformEventBus();

/**
 * Helper function to publish platform updates from any feature
 * Use this when a feature is released, updated, or patched
 * 
 * @param workspaceId - null/undefined for global updates, set for workspace-specific
 * @param visibility - 'all' | 'staff' | 'supervisor' | 'manager' | 'admin' controls RBAC
 */
export async function publishPlatformUpdate(params: {
  type: PlatformEventType;
  category: EventCategory;
  title: string;
  description: string;
  version?: string;
  workspaceId?: string;
  userId?: string;
  learnMoreUrl?: string;
  priority?: number;
  metadata?: Record<string, any>;
  visibility?: EventVisibility;
}): Promise<void> {
  await platformEventBus.publish({
    ...params,
    isNew: true,
  });
}

/**
 * Helper to announce a new feature
 */
export async function announceNewFeature(
  title: string,
  description: string,
  version?: string,
  learnMoreUrl?: string
): Promise<void> {
  await publishPlatformUpdate({
    type: 'feature_released',
    category: 'feature',
    title,
    description,
    version,
    learnMoreUrl,
    priority: 1,
  });
}

/**
 * Helper to announce a bug fix
 */
export async function announceBugfix(
  title: string,
  description: string,
  version?: string
): Promise<void> {
  await publishPlatformUpdate({
    type: 'bugfix_deployed',
    category: 'bugfix',
    title,
    description,
    version,
    priority: 3,
  });
}

/**
 * Helper to announce a security patch
 */
export async function announceSecurityPatch(
  title: string,
  description: string,
  version?: string
): Promise<void> {
  await publishPlatformUpdate({
    type: 'security_patch',
    category: 'security',
    title,
    description,
    version,
    priority: 1,
  });
}

/**
 * Helper to announce automation completion
 */
export async function announceAutomationComplete(
  workspaceId: string,
  title: string,
  description: string,
  metadata?: Record<string, any>
): Promise<void> {
  await publishPlatformUpdate({
    type: 'automation_completed',
    category: 'improvement',
    title,
    description,
    workspaceId,
    metadata,
    priority: 2,
  });
}

// ============================================================================
// SCHEDULE LIVE NOTIFICATIONS - Real-time workforce schedule updates
// ============================================================================

export interface ScheduleChangeEvent {
  workspaceId: string;
  affectedEmployeeIds: string[];
  shiftId?: string;
  shiftDate?: string;
  shiftTime?: string;
  changedBy: string;
  changedByRole: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Publish schedule change to affected employees immediately
 * Used when schedules are published, shifts created/updated/deleted
 */
export async function publishScheduleChange(
  eventType: 'schedule_published' | 'shift_created' | 'shift_updated' | 'shift_deleted' | 'shift_assigned' | 'shift_unassigned',
  params: ScheduleChangeEvent & { title: string; description: string }
): Promise<void> {
  await publishPlatformUpdate({
    type: eventType,
    category: 'schedule',
    title: params.title,
    description: params.description,
    workspaceId: params.workspaceId,
    userId: params.changedBy,
    visibility: 'all',
    priority: 1,
    metadata: {
      affectedEmployeeIds: params.affectedEmployeeIds,
      shiftId: params.shiftId,
      shiftDate: params.shiftDate,
      shiftTime: params.shiftTime,
      changedByRole: params.changedByRole,
      reason: params.reason,
      ...params.metadata,
    },
  });
  log.info('Schedule change notified employees', { eventType, employeeCount: params.affectedEmployeeIds.length });
}

/**
 * Notify employees when a schedule is published
 */
export async function notifySchedulePublished(params: {
  workspaceId: string;
  weekStart: string;
  weekEnd: string;
  affectedEmployeeIds: string[];
  publishedBy: string;
  publishedByRole: string;
  totalShifts: number;
}): Promise<void> {
  await publishScheduleChange('schedule_published', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: params.affectedEmployeeIds,
    changedBy: params.publishedBy,
    changedByRole: params.publishedByRole,
    title: 'Schedule Published',
    description: `Your schedule for ${params.weekStart} - ${params.weekEnd} is now available. ${params.totalShifts} shifts assigned.`,
    metadata: {
      weekStart: params.weekStart,
      weekEnd: params.weekEnd,
      totalShifts: params.totalShifts,
    },
  });
}

/**
 * Notify employee when a shift is created/assigned to them
 */
export async function notifyShiftCreated(params: {
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftDate: string;
  shiftTime: string;
  createdBy: string;
  createdByRole: string;
}): Promise<void> {
  await publishScheduleChange('shift_created', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: [params.employeeId],
    shiftId: params.shiftId,
    shiftDate: params.shiftDate,
    shiftTime: params.shiftTime,
    changedBy: params.createdBy,
    changedByRole: params.createdByRole,
    title: 'New Shift Assigned',
    description: `You have a new shift on ${params.shiftDate} at ${params.shiftTime}`,
  });
}

/**
 * Notify employee when their shift is updated
 */
export async function notifyShiftUpdated(params: {
  workspaceId: string;
  employeeId: string;
  shiftId: string;
  shiftDate: string;
  shiftTime: string;
  changedBy: string;
  changedByRole: string;
  changes: string;
}): Promise<void> {
  await publishScheduleChange('shift_updated', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: [params.employeeId],
    shiftId: params.shiftId,
    shiftDate: params.shiftDate,
    shiftTime: params.shiftTime,
    changedBy: params.changedBy,
    changedByRole: params.changedByRole,
    title: 'Shift Updated',
    description: `Your shift on ${params.shiftDate} has been updated: ${params.changes}`,
    metadata: { changes: params.changes },
  });
}

/**
 * Notify employee when their shift is deleted
 */
export async function notifyShiftDeleted(params: {
  workspaceId: string;
  employeeId: string;
  shiftId: string;
  shiftDate: string;
  shiftTime: string;
  deletedBy: string;
  deletedByRole: string;
  reason?: string;
}): Promise<void> {
  await publishScheduleChange('shift_deleted', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: [params.employeeId],
    shiftId: params.shiftId,
    shiftDate: params.shiftDate,
    shiftTime: params.shiftTime,
    changedBy: params.deletedBy,
    changedByRole: params.deletedByRole,
    reason: params.reason,
    title: 'Shift Removed',
    description: `Your shift on ${params.shiftDate} at ${params.shiftTime} has been removed${params.reason ? `: ${params.reason}` : ''}`,
  });
}

/**
 * Notify employees about shift swap requests/approvals
 */
export async function notifyShiftSwap(
  eventType: 'shift_swap_requested' | 'shift_swap_approved' | 'shift_swap_denied',
  params: {
    workspaceId: string;
    requesterId: string;
    targetEmployeeId?: string;
    shiftId: string;
    shiftDate: string;
    actionBy: string;
    actionByRole: string;
    reason?: string;
  }
): Promise<void> {
  const titles: Record<string, string> = {
    shift_swap_requested: 'Shift Swap Request',
    shift_swap_approved: 'Shift Swap Approved',
    shift_swap_denied: 'Shift Swap Denied',
  };

  const affectedIds = [params.requesterId];
  if (params.targetEmployeeId) affectedIds.push(params.targetEmployeeId);

  await publishPlatformUpdate({
    type: eventType,
    category: 'schedule',
    title: titles[eventType],
    description: `Shift swap for ${params.shiftDate}${params.reason ? `: ${params.reason}` : ''}`,
    workspaceId: params.workspaceId,
    userId: params.actionBy,
    visibility: 'all',
    priority: 1,
    metadata: {
      affectedEmployeeIds: affectedIds,
      shiftId: params.shiftId,
      shiftDate: params.shiftDate,
      requesterId: params.requesterId,
      targetEmployeeId: params.targetEmployeeId,
      actionByRole: params.actionByRole,
      reason: params.reason,
    },
  });
}

// ============================================================================
// TRINITY AI ORCHESTRATION LIFECYCLE EVENTS
// ============================================================================

export interface TrinityLifecycleParams {
  workspaceId?: string;
  triggeredBy?: string;
  executionId?: string;
  scanType?: 'visual' | 'log' | 'schema' | 'code' | 'full_diagnostic';
  issueCount?: number;
  severity?: 'healthy' | 'warning' | 'error' | 'critical';
  fixId?: string;
  fixDescription?: string;
  affectedFiles?: string[];
  reason?: string;
  metadata?: Record<string, any>;
}

export async function publishTrinityScanStarted(params: TrinityLifecycleParams): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_scan_started',
    category: 'trinity',
    title: 'System Scan Started',
    description: `I've initiated a ${params.scanType || 'system'} scan`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: 3,
    metadata: {
      executionId: params.executionId,
      scanType: params.scanType,
      ...params.metadata,
    },
  });
}

export async function publishTrinityScanCompleted(params: TrinityLifecycleParams & {
  issueCount: number;
  durationMs?: number;
}): Promise<void> {
  const severityText = params.severity === 'healthy' ? 'No issues found' : 
    `${params.issueCount} issue(s) detected (${params.severity})`;
  
  await publishPlatformUpdate({
    type: 'trinity_scan_completed',
    category: 'trinity',
    title: 'Scan Completed',
    description: `${params.scanType || 'System'} scan completed. ${severityText}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: params.severity === 'critical' ? 1 : params.severity === 'error' ? 2 : 3,
    metadata: {
      executionId: params.executionId,
      scanType: params.scanType,
      issueCount: params.issueCount,
      severity: params.severity,
      durationMs: params.durationMs,
      ...params.metadata,
    },
  });
}

export async function publishTrinityIssueDetected(params: TrinityLifecycleParams & {
  issueTitle: string;
  issueDescription: string;
  issueCategory?: string;
  confidence?: number;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_issue_detected',
    category: 'trinity',
    title: `Issue Detected: ${params.issueTitle}`,
    description: params.issueDescription,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: params.severity === 'critical' ? 1 : 2,
    metadata: {
      executionId: params.executionId,
      issueCategory: params.issueCategory,
      confidence: params.confidence,
      severity: params.severity,
      affectedFiles: params.affectedFiles,
      ...params.metadata,
    },
  });
}

export async function publishTrinityFixProposed(params: TrinityLifecycleParams & {
  fixId: string;
  fixDescription: string;
  requiresApproval: boolean;
  estimatedImpact?: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_fix_proposed',
    category: 'trinity',
    title: 'Fix Proposed',
    description: params.fixDescription,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: 1,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      requiresApproval: params.requiresApproval,
      estimatedImpact: params.estimatedImpact,
      affectedFiles: params.affectedFiles,
      ...params.metadata,
    },
  });
  log.info('Fix proposed', { fixId: params.fixId, fixDescription: params.fixDescription });
}

export async function publishTrinityFixApproved(params: TrinityLifecycleParams & {
  fixId: string;
  approvedBy: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_fix_approved',
    category: 'trinity',
    title: 'Fix Approved',
    description: `Fix ${params.fixId} approved by ${params.approvedBy}`,
    workspaceId: params.workspaceId,
    userId: params.approvedBy,
    visibility: 'org_leadership',
    priority: 2,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      approvedBy: params.approvedBy,
      ...params.metadata,
    },
  });
}

export async function publishTrinityFixRejected(params: TrinityLifecycleParams & {
  fixId: string;
  rejectedBy: string;
  reason?: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_fix_rejected',
    category: 'trinity',
    title: 'Fix Rejected',
    description: `Fix ${params.fixId} rejected${params.reason ? `: ${params.reason}` : ''}`,
    workspaceId: params.workspaceId,
    userId: params.rejectedBy,
    visibility: 'org_leadership',
    priority: 2,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      rejectedBy: params.rejectedBy,
      reason: params.reason,
      ...params.metadata,
    },
  });
}

export async function publishTrinityFixApplied(params: TrinityLifecycleParams & {
  fixId: string;
  success: boolean;
  commitHash?: string;
  errorMessage?: string;
}): Promise<void> {
  const title = params.success ? 'Fix Applied' : 'Fix Failed';
  const description = params.success 
    ? `Fix ${params.fixId} successfully applied${params.commitHash ? ` (commit: ${params.commitHash.slice(0, 7)})` : ''}`
    : `Fix ${params.fixId} failed: ${params.errorMessage || 'Unknown error'}`;

  await publishPlatformUpdate({
    type: 'trinity_fix_applied',
    category: 'trinity',
    title,
    description,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: params.success ? 2 : 1,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      success: params.success,
      commitHash: params.commitHash,
      errorMessage: params.errorMessage,
      affectedFiles: params.affectedFiles,
      ...params.metadata,
    },
  });
}

export async function publishTrinityDiagnosticStarted(params: TrinityLifecycleParams & {
  targetUrl?: string;
  diagnosticScope: string[];
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_diagnostic_started',
    category: 'trinity',
    title: 'Diagnostic Started',
    description: `Full platform diagnostic initiated for: ${params.diagnosticScope.join(', ')}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: 3,
    metadata: {
      executionId: params.executionId,
      targetUrl: params.targetUrl,
      diagnosticScope: params.diagnosticScope,
      ...params.metadata,
    },
  });
}

export async function publishTrinityDiagnosticCompleted(params: TrinityLifecycleParams & {
  visualIssues: number;
  logIssues: number;
  visualScore: number;
  recommendedActions: string[];
}): Promise<void> {
  const totalIssues = params.visualIssues + params.logIssues;
  const healthStatus = params.severity || 'healthy';
  
  await publishPlatformUpdate({
    type: 'trinity_diagnostic_completed',
    category: 'trinity',
    title: 'Diagnostic Completed',
    description: `Diagnostic complete: ${totalIssues} issue(s) found. Visual score: ${params.visualScore}/100. Status: ${healthStatus}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: healthStatus === 'critical' ? 1 : healthStatus === 'error' ? 2 : 3,
    metadata: {
      executionId: params.executionId,
      visualIssues: params.visualIssues,
      logIssues: params.logIssues,
      visualScore: params.visualScore,
      severity: healthStatus,
      recommendedActions: params.recommendedActions,
      ...params.metadata,
    },
  });
}

export async function publishTrinityEscalationRequired(params: TrinityLifecycleParams & {
  escalationReason: string;
  escalatedTo: string[];
  contextSummary: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_escalation_required',
    category: 'trinity',
    title: 'Escalation Required',
    description: `Human intervention needed: ${params.escalationReason}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: 1,
    metadata: {
      executionId: params.executionId,
      escalationReason: params.escalationReason,
      escalatedTo: params.escalatedTo,
      contextSummary: params.contextSummary,
      severity: params.severity || 'high',
      ...params.metadata,
    },
  });
}

export async function publishTrinitySelfHealing(params: TrinityLifecycleParams & {
  healingType: 'workflow_restart' | 'cache_clear' | 'service_restart' | 'config_fix' | 'dependency_update';
  targetService?: string;
  success: boolean;
}): Promise<void> {
  const title = params.success ? 'Self-Healing Successful' : 'Self-Healing Failed';
  const description = params.success
    ? `Automatically resolved: ${params.healingType.replace(/_/g, ' ')}${params.targetService ? ` for ${params.targetService}` : ''}`
    : `Self-healing attempt failed: ${params.healingType.replace(/_/g, ' ')}`;

  await publishPlatformUpdate({
    type: 'trinity_self_healing',
    category: 'trinity',
    title,
    description,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'org_leadership',
    priority: params.success ? 3 : 2,
    metadata: {
      executionId: params.executionId,
      healingType: params.healingType,
      targetService: params.targetService,
      success: params.success,
      ...params.metadata,
    },
  });
}
