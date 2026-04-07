/**
 * ACTION COMPATIBILITY SHIMS — Phase 1 Consolidation
 * ====================================================
 * Backward-compatible action ID redirects for renamed/merged/deleted actions.
 * Every shim forwards the old action ID to the new canonical action via executeAction.
 *
 * Callers using old IDs continue to work transparently.
 * Shims should be removed once all callers have been updated.
 *
 * Registered AFTER all canonical actions so the new IDs exist first.
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('actionCompatibilityShims');

function shimAction(oldId: string, newId: string, description: string): void {
  helpaiOrchestrator.registerAction({
    actionId: oldId,
    name: `[SHIM] ${oldId} → ${newId}`,
    category: 'automation' as any,
    description: `Compatibility shim: ${description}. Forwards to ${newId}.`,
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const result = await helpaiOrchestrator.executeAction({
        ...request,
        actionId: newId,
        name: request.name || newId,
      });
      return {
        ...result,
        actionId: oldId, // Preserve original action ID in response
      };
    },
  });
}

export function registerActionCompatibilityShims(): void {
  // =========================================================================
  // STEP 2 — Orphaned domain duplicate
  // =========================================================================
  // platform_roles.assign → uacp.assign_platform_role (true duplicate, deleted)
  shimAction('platform_roles.assign', 'uacp.assign_platform_role', 'Duplicate of uacp.assign_platform_role');

  // =========================================================================
  // STEP 3 — Single-action orphan domain merges
  // =========================================================================
  // employee.* → employees.* (singular → plural domain merge)
  shimAction('employee.track_milestones', 'employees.track_milestones', 'employee domain merged into employees');
  shimAction('employee.flag_anniversary', 'employees.flag_anniversary', 'employee domain merged into employees');
  shimAction('employee.flag_promotion_eligibility', 'employees.flag_promotion_eligibility', 'employee domain merged into employees');

  // shift.execute_swap → scheduling.execute_swap
  shimAction('shift.execute_swap', 'scheduling.execute_swap', 'shift domain merged into scheduling');

  // external.flag_external_risk → security.flag_external_risk
  shimAction('external.flag_external_risk', 'security.flag_external_risk', 'external risk flagging merged into security');

  // system.monitoring_dashboard → diagnostics.monitoring_dashboard
  shimAction('system.monitoring_dashboard', 'diagnostics.monitoring_dashboard', 'system monitoring merged into diagnostics');

  // =========================================================================
  // STEP 4 — Split domain merges
  // =========================================================================
  // testing.* → test.* (unified test domain)
  shimAction('testing.schedule_drug_test', 'test.schedule_drug_test', 'testing domain merged into test');
  shimAction('testing.record_result', 'test.record_result', 'testing domain merged into test');
  shimAction('testing.flag_failed_test', 'test.flag_failed_test', 'testing domain merged into test');
  shimAction('testing.generate_random_selection', 'test.generate_random_selection', 'testing domain merged into test');
  shimAction('testing.check_client_requirements', 'test.check_client_requirements', 'testing domain merged into test');

  // time.* → time_tracking.* (unified time_tracking domain)
  shimAction('time.watch_clock_ins', 'time_tracking.watch_clock_ins', 'time domain merged into time_tracking');
  shimAction('time.monitor_coverage', 'time_tracking.monitor_coverage', 'time domain merged into time_tracking');
  shimAction('time.alert_on_absence', 'time_tracking.alert_on_absence', 'time domain merged into time_tracking');
  shimAction('time.clock_out_officer', 'time_tracking.clock_out_officer', 'time domain merged into time_tracking');

  // bulk.* → employees.* (bulk domain merged into employees)
  shimAction('bulk.import_employees', 'employees.import', 'bulk domain merged into employees');
  shimAction('bulk.export_employees', 'employees.export', 'bulk domain merged into employees');

  // =========================================================================
  // STEP 5 — Scheduling notify actions (now → notify.send after Phase 2)
  // =========================================================================
  shimAction('scheduling.notify_shift_created', 'notify.send', 'Scheduling notify consolidated into notify.send');
  shimAction('scheduling.notify_shift_updated', 'notify.send', 'Scheduling notify consolidated into notify.send');
  shimAction('scheduling.notify_shift_deleted', 'notify.send', 'Scheduling notify consolidated into notify.send');
  shimAction('scheduling.notify_schedule_published', 'notify.send', 'Scheduling notify consolidated into notify.send');
  shimAction('scheduling.notify_shift_swap', 'notify.send', 'Scheduling notify consolidated into notify.send');
  shimAction('scheduling.notify_automation_change', 'notify.send', 'Scheduling notify consolidated into notify.send');

  // =========================================================================
  // PHASE 2 — Billing domain consolidation (32 → ~13)
  // =========================================================================
  // billing.invoice replaces invoices_get + invoices_list
  shimAction('billing.invoices_get', 'billing.invoice', 'Billing invoices_get consolidated into billing.invoice');
  shimAction('billing.invoices_list', 'billing.invoice', 'Billing invoices_list consolidated into billing.invoice');

  // billing.invoice_generate replaces draft_invoices
  shimAction('billing.draft_invoices', 'billing.invoice_generate', 'Billing draft_invoices renamed to invoice_generate');

  // billing.invoice_pdf replaces generate_invoice_pdf
  shimAction('billing.generate_invoice_pdf', 'billing.invoice_pdf', 'Billing generate_invoice_pdf renamed to invoice_pdf');

  // billing.invoice_send replaces send_invoice + send_invoice_email + send_invoice_bulk + mark_invoice_sent
  shimAction('billing.send_invoice', 'billing.invoice_send', 'Billing send_invoice consolidated into invoice_send');
  shimAction('billing.send_invoice_email', 'billing.invoice_send', 'Billing send_invoice_email consolidated into invoice_send');
  shimAction('billing.send_invoice_bulk', 'billing.invoice_send', 'Billing send_invoice_bulk consolidated into invoice_send');
  shimAction('billing.mark_invoice_sent', 'billing.invoice_send', 'Billing mark_invoice_sent consolidated into invoice_send');

  // billing.invoice_status replaces mark_invoice_paid + check_invoices_overdue
  shimAction('billing.mark_invoice_paid', 'billing.invoice_status', 'Billing mark_invoice_paid consolidated into invoice_status');
  shimAction('billing.check_invoices_overdue', 'billing.invoice_status', 'Billing check_invoices_overdue consolidated into invoice_status');

  // billing.invoice_summary replaces invoices_summary
  shimAction('billing.invoices_summary', 'billing.invoice_summary', 'Billing invoices_summary renamed to invoice_summary');

  // billing.analyze replaces all bi_* actions + learn_preference
  shimAction('billing.bi_deep_analysis', 'billing.analyze', 'Billing BI deep_analysis consolidated into analyze');
  shimAction('billing.bi_learn_invoice_patterns', 'billing.analyze', 'Billing BI consolidated into analyze');
  shimAction('billing.bi_scan_payroll_patterns', 'billing.analyze', 'Billing BI consolidated into analyze');
  shimAction('billing.bi_scan_schedule_patterns', 'billing.analyze', 'Billing BI consolidated into analyze');
  shimAction('billing.bi_search_invoices', 'billing.analyze', 'Billing BI consolidated into analyze');
  shimAction('billing.learn_preference', 'billing.settings', 'Billing learn_preference consolidated into settings');

  // billing.sync_qb replaces push_to_qb + bi_prepare_for_qb + qb_connection_status
  shimAction('billing.push_to_qb', 'billing.sync_qb', 'Billing push_to_qb consolidated into sync_qb');
  shimAction('billing.bi_prepare_for_qb', 'billing.sync_qb', 'Billing bi_prepare_for_qb consolidated into sync_qb');
  shimAction('billing.qb_connection_status', 'billing.sync_qb', 'Billing qb_connection_status consolidated into sync_qb');

  // billing.settings replaces all get/set/list client/workspace settings
  shimAction('billing.get_workspace_settings', 'billing.settings', 'Billing settings consolidated');
  shimAction('billing.set_workspace_settings', 'billing.settings', 'Billing settings consolidated');
  shimAction('billing.get_client_settings', 'billing.settings', 'Billing settings consolidated');
  shimAction('billing.set_client_settings', 'billing.settings', 'Billing settings consolidated');
  shimAction('billing.list_client_settings', 'billing.settings', 'Billing settings consolidated');

  // payroll.draft replaces billing.draft_payroll
  shimAction('billing.draft_payroll', 'payroll.draft', 'Billing draft_payroll moved to payroll.draft');

  // =========================================================================
  // PHASE 2 — Notify domain consolidation (9 → 3)
  // =========================================================================
  // notify.send now handles all send variants
  shimAction('notify.send_priority', 'notify.send', 'Notify send_priority consolidated into notify.send');
  shimAction('notify.send_critical', 'notify.send', 'Notify send_critical consolidated into notify.send');
  shimAction('notify.send_platform_update', 'notify.send', 'Notify send_platform_update consolidated into notify.send');

  // notify.broadcast replaces broadcast_message + bulk_by_role
  shimAction('notify.broadcast_message', 'notify.broadcast', 'Notify broadcast_message renamed to notify.broadcast');
  shimAction('notify.bulk_by_role', 'notify.broadcast', 'Notify bulk_by_role consolidated into notify.broadcast');

  // notify.manage replaces clear_all + mark_all_read + get_stats
  shimAction('notify.clear_all', 'notify.manage', 'Notify clear_all consolidated into notify.manage');
  shimAction('notify.mark_all_read', 'notify.manage', 'Notify mark_all_read consolidated into notify.manage');
  shimAction('notify.get_stats', 'notify.manage', 'Notify get_stats consolidated into notify.manage');

  // =========================================================================
  // PHASE 2 — Onboarding domain consolidation (17 → 7)
  // =========================================================================
  // onboarding.invite replaces send/resend/revoke invitation + client welcome
  shimAction('onboarding.send_invitation', 'onboarding.invite', 'Onboarding send_invitation consolidated into invite');
  shimAction('onboarding.resend_invitation', 'onboarding.invite', 'Onboarding resend consolidated into invite');
  shimAction('onboarding.revoke_invitation', 'onboarding.invite', 'Onboarding revoke consolidated into invite');
  shimAction('onboarding.send_client_welcome', 'onboarding.invite', 'Onboarding client_welcome consolidated into invite');

  // onboarding.provision replaces provision_workspace + setup_defaults
  shimAction('onboarding.provision_workspace', 'onboarding.provision', 'Onboarding provision_workspace renamed');
  shimAction('onboarding.setup_defaults', 'onboarding.provision', 'Onboarding setup_defaults consolidated into provision');

  // onboarding.configure replaces get_routing_config + validate_routing + connect_integration
  shimAction('onboarding.get_routing_config', 'onboarding.configure', 'Onboarding get_routing consolidated into configure');
  shimAction('onboarding.validate_routing', 'onboarding.configure', 'Onboarding validate_routing consolidated into configure');
  shimAction('onboarding.connect_integration', 'onboarding.configure', 'Onboarding connect_integration consolidated into configure');

  // onboarding.migrate replaces migrate_data + apply_auto_fixes
  shimAction('onboarding.migrate_data', 'onboarding.migrate', 'Onboarding migrate_data renamed');
  shimAction('onboarding.apply_auto_fixes', 'onboarding.migrate', 'Onboarding apply_auto_fixes consolidated into migrate');

  // onboarding.track replaces track_progress + get_checklist + get_platform_status
  shimAction('onboarding.track_progress', 'onboarding.track', 'Onboarding track_progress renamed');
  shimAction('onboarding.get_checklist', 'onboarding.track', 'Onboarding get_checklist consolidated into track');
  shimAction('onboarding.get_platform_status', 'onboarding.track', 'Onboarding get_platform_status consolidated into track');

  // onboarding.recommend replaces recommend_features + gather_billing_preferences
  shimAction('onboarding.recommend_features', 'onboarding.recommend', 'Onboarding recommend_features renamed');
  shimAction('onboarding.gather_billing_preferences', 'onboarding.recommend', 'Onboarding gather_billing_preferences consolidated into recommend');

  // onboarding.diagnose replaces run_diagnostics
  shimAction('onboarding.run_diagnostics', 'onboarding.diagnose', 'Onboarding run_diagnostics renamed to diagnose');

  const shimCount = 26 + 27 + 8 + 14; // Phase 1 + Billing + Notify + Onboarding
  log.info(`[Action Compatibility Shims] Registered ${shimCount} backward-compatible action redirects (Phase 1: 26, Phase 2: 49)`);
}
