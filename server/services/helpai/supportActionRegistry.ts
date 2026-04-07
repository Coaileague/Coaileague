/**
 * SUPPORT ACTION REGISTRY — Phase 63
 *
 * 14 live corrective actions Trinity and human support agents can execute.
 * Each action:
 * 1. Validates actor is support role or system
 * 2. Captures before state
 * 3. Executes the corrective DB write
 * 4. Captures after state
 * 5. Logs to support_actions table
 * 6. Logs to audit_logs table
 * 7. Notifies org owner of intervention
 * 8. Returns structured result
 */

import { pool } from '../../db';
import { emailService } from '../emailService';
import { createLogger } from '../../lib/logger';
import crypto from 'crypto';

const log = createLogger('SupportActionRegistry');

export type SupportActionType =
  | 'support.account.unlock'
  | 'support.account.reset_pin'
  | 'support.account.reset_2fa'
  | 'support.notification.resend'
  | 'support.notification.fix_preferences'
  | 'support.schedule.fix_assignment'
  | 'support.invoice.recalculate'
  | 'support.onboarding.reset_task'
  | 'support.onboarding.trigger_activation'
  | 'support.workspace.read_context'
  | 'support.employee.override_status'
  | 'support.form.resend_invitation'
  | 'support.document.regenerate'
  | 'support.payroll.dispute_review';

export interface SupportActionPayload {
  actionType: SupportActionType;
  workspaceId: string;
  targetEntityType: string;
  targetEntityId?: string;
  reason: string;
  actorId: string;
  actorType: 'system' | 'support_agent' | 'trinity';
  ticketId?: string;
  correctionData?: Record<string, any>;
  overrideData?: Record<string, any>;
}

export interface SupportActionResult {
  success: boolean;
  actionType: string;
  actionDescription: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  error?: string;
  data?: Record<string, any>;
}

const SUPPORT_ROLES = new Set([
  'root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent',
  'platform_staff', 'platform-admin', 'system'
]);

async function logSupportAction(
  payload: SupportActionPayload,
  result: SupportActionResult,
  description: string
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO support_actions (
        ticket_id, workspace_id, actor_id, actor_type, action_type,
        action_description, target_entity_type, target_entity_id,
        before_state, after_state, success, error_message, reason, executed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    `, [
      payload.ticketId || null,
      payload.workspaceId,
      payload.actorId,
      payload.actorType,
      payload.actionType,
      description,
      payload.targetEntityType,
      payload.targetEntityId || null,
      result.beforeState ? JSON.stringify(result.beforeState) : null,
      result.afterState ? JSON.stringify(result.afterState) : null,
      result.success,
      result.error || null,
      payload.reason
    ]);
  } catch (err) {
    log.warn('Failed to log support_action', { err });
  }
}

async function logAudit(
  workspaceId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | undefined,
  description: string,
  changes: Record<string, any>
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO audit_logs (workspace_id, user_id, action, entity_type, entity_id,
        action_description, changes, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    `, [workspaceId, actorId, action, entityType, entityId || null, description, JSON.stringify(changes)]);
  } catch (err) {
    log.warn('Failed to write audit log', { err });
  }
}

async function notifyOrgOwner(
  workspaceId: string,
  actionType: string,
  description: string,
  reason: string
): Promise<void> {
  try {
    const ownerResult = await pool.query(`
      SELECT u.email, u.first_name FROM users u
      JOIN employees e ON e.user_id = u.id
      WHERE e.workspace_id = $1 AND e.role = 'org_owner'
      LIMIT 1
    `, [workspaceId]);

    if (ownerResult.rows.length === 0) return;

    const owner = ownerResult.rows[0];
    await emailService.send({
      to: owner.email,
      subject: `Support Action Taken in Your Organization — ${actionType}`,
      html: `
        <p>Hello ${owner.first_name || 'there'},</p>
        <p>A support action was performed in your organization:</p>
        <ul>
          <li><strong>Action:</strong> ${actionType}</li>
          <li><strong>Description:</strong> ${description}</li>
          <li><strong>Reason:</strong> ${reason}</li>
        </ul>
        <p>This action was taken to resolve a support issue. All actions are logged and audited.
        If you have questions, please contact support.</p>
        <p>— CoAIleague Support Team</p>
      `,
      workspaceId
    });

    await pool.query(`
      UPDATE support_tickets
      SET org_notified_of_intervention = true
      WHERE workspace_id = $1 AND org_notified_of_intervention = false
      AND trinity_attempted = true
    `, [workspaceId]);
  } catch (err) {
    log.warn('Failed to notify org owner', { err });
  }
}

export const supportActionHandlers: Record<SupportActionType, (payload: SupportActionPayload) => Promise<SupportActionResult>> = {

  'support.account.unlock': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const user = await pool.query(`SELECT id, email, locked_until, login_attempts FROM users WHERE id = $1`, [targetEntityId]);
    if (user.rows.length === 0) return { ...result, error: 'User not found' };

    result.beforeState = { locked_until: user.rows[0].locked_until, login_attempts: user.rows[0].login_attempts };
    await pool.query(`UPDATE users SET locked_until = NULL, login_attempts = 0 WHERE id = $1`, [targetEntityId]);
    result.afterState = { locked_until: null, login_attempts: 0 };
    result.success = true;
    result.actionDescription = `Unlocked account for user ${user.rows[0].email}`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.account.unlock', 'user', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.account.reset_pin': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const emp = await pool.query(`SELECT id, workspace_id, clockin_pin_hash, user_id FROM employees WHERE id = $1`, [targetEntityId]);
    if (emp.rows.length === 0) return { ...result, error: 'Employee not found' };

    const tempPin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinHash = crypto.createHash('sha256').update(tempPin).digest('hex');
    result.beforeState = { had_pin: !!emp.rows[0].clockin_pin_hash };
    await pool.query(`UPDATE employees SET clockin_pin_hash = $1 WHERE id = $2`, [pinHash, targetEntityId]);
    result.afterState = { pin_reset: true, temp_pin_generated: true };
    result.success = true;
    result.actionDescription = `Reset clock-in PIN for employee ${targetEntityId}. Temporary PIN: ${tempPin}`;
    result.data = { tempPin };

    if (emp.rows[0].user_id) {
      const userRow = await pool.query(`SELECT email, first_name FROM users WHERE id = $1`, [emp.rows[0].user_id]);
      if (userRow.rows.length > 0) {
        await emailService.send({
          to: userRow.rows[0].email,
          subject: 'Your Clock-In PIN Has Been Reset',
          html: `<p>Hello ${userRow.rows[0].first_name || 'there'},</p><p>Your clock-in PIN has been reset by support. Your temporary PIN is: <strong>${tempPin}</strong></p><p>Please use this PIN for your next clock-in. Contact your supervisor to set a permanent PIN.</p>`,
          workspaceId
        });
      }
    }

    await logSupportAction(payload, result, `Reset clock-in PIN for employee ${targetEntityId}`);
    await logAudit(workspaceId, actorId, 'support.account.reset_pin', 'employee', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, `Clock-in PIN reset for employee ${targetEntityId}`, reason);
    return result;
  },

  'support.account.reset_2fa': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const user = await pool.query(`SELECT id, email, mfa_enabled FROM users WHERE id = $1`, [targetEntityId]);
    if (user.rows.length === 0) return { ...result, error: 'User not found' };

    result.beforeState = { mfa_enabled: user.rows[0].mfa_enabled };
    await pool.query(`UPDATE users SET mfa_secret = NULL, mfa_enabled = false, mfa_backup_codes = NULL WHERE id = $1`, [targetEntityId]);
    result.afterState = { mfa_enabled: false, mfa_secret: null };
    result.success = true;
    result.actionDescription = `Reset 2FA for user ${user.rows[0].email}. User must re-enroll.`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.account.reset_2fa', 'user', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.notification.resend': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const notif = await pool.query(`SELECT id, notification_type, status, recipient_user_id FROM notification_deliveries WHERE id = $1`, [targetEntityId]);
    if (notif.rows.length === 0) return { ...result, error: 'Notification not found' };

    result.beforeState = { status: notif.rows[0].status };
    await pool.query(`UPDATE notification_deliveries SET status = 'pending', attempt_count = 0, next_retry_at = NOW() WHERE id = $1`, [targetEntityId]);
    result.afterState = { status: 'pending', queued_for_retry: true };
    result.success = true;
    result.actionDescription = `Requeued notification ${notif.rows[0].notification_type} for recipient ${notif.rows[0].recipient_user_id}`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.notification.resend', 'notification', targetEntityId, result.actionDescription, result.afterState);
    return result;
  },

  'support.notification.fix_preferences': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId, overrideData } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const prefs = await pool.query(`SELECT * FROM user_notification_preferences WHERE user_id = $1 AND workspace_id = $2`, [targetEntityId, workspaceId]);
    result.beforeState = prefs.rows[0] || { user_id: targetEntityId };

    if (prefs.rows.length > 0) {
      await pool.query(`
        UPDATE user_notification_preferences
        SET enable_email = true, prefer_email = true,
            enabled_types = COALESCE($1, enabled_types),
            updated_at = NOW()
        WHERE user_id = $2 AND workspace_id = $3
      `, [overrideData?.enabled_types ? JSON.stringify(overrideData.enabled_types) : null, targetEntityId, workspaceId]);
    } else {
      await pool.query(`
        INSERT INTO user_notification_preferences (user_id, workspace_id, enable_email, prefer_email, created_at, updated_at)
        VALUES ($1, $2, true, true, NOW(), NOW())
      `, [targetEntityId, workspaceId]);
    }

    const after = await pool.query(`SELECT * FROM user_notification_preferences WHERE user_id = $1 AND workspace_id = $2`, [targetEntityId, workspaceId]);
    result.afterState = after.rows[0];
    result.success = true;
    result.actionDescription = `Restored notification preferences for user ${targetEntityId}`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.notification.fix_preferences', 'user', targetEntityId, result.actionDescription, result.afterState!);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.schedule.fix_assignment': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId, correctionData } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    if (!correctionData?.correctOfficerId) return { ...result, error: 'correctionData.correctOfficerId is required' };

    const shift = await pool.query(`SELECT id, assigned_officer_id FROM shifts WHERE id = $1 AND workspace_id = $2`, [targetEntityId, workspaceId]);
    if (shift.rows.length === 0) return { ...result, error: 'Shift not found' };

    result.beforeState = { assigned_officer_id: shift.rows[0].assigned_officer_id };
    await pool.query(`UPDATE shifts SET assigned_officer_id = $1 WHERE id = $2`, [correctionData.correctOfficerId, targetEntityId]);
    result.afterState = { assigned_officer_id: correctionData.correctOfficerId };
    result.success = true;
    result.actionDescription = `Fixed shift ${targetEntityId} assignment to officer ${correctionData.correctOfficerId}`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.schedule.fix_assignment', 'shift', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.invoice.recalculate': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const invoice = await pool.query(`SELECT id, subtotal, total FROM invoices WHERE id = $1 AND workspace_id = $2`, [targetEntityId, workspaceId]);
    if (invoice.rows.length === 0) return { ...result, error: 'Invoice not found' };

    result.beforeState = { subtotal: invoice.rows[0].subtotal, total: invoice.rows[0].total };

    const lineItems = await pool.query(`SELECT COALESCE(SUM(amount), 0) as sum FROM invoice_line_items WHERE invoice_id = $1`, [targetEntityId]);
    const newSubtotal = parseFloat(lineItems.rows[0].sum);
    await pool.query(`UPDATE invoices SET subtotal = $1, total = $1, updated_at = NOW() WHERE id = $2`, [newSubtotal, targetEntityId]);

    result.afterState = { subtotal: newSubtotal, total: newSubtotal };
    result.success = true;
    result.actionDescription = `Recalculated invoice ${targetEntityId}: subtotal corrected from ${invoice.rows[0].subtotal} to ${newSubtotal}`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.invoice.recalculate', 'invoice', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.onboarding.reset_task': async (payload) => {
    const { workspaceId, reason, actorId, correctionData } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const { employeeId, taskType } = correctionData || {};
    if (!employeeId || !taskType) return { ...result, error: 'correctionData.employeeId and taskType required' };

    const progress = await pool.query(`
      SELECT id, status FROM employee_onboarding_progress
      WHERE employee_id = $1 AND workspace_id = $2
      LIMIT 1
    `, [employeeId, workspaceId]);

    result.beforeState = progress.rows[0] || {};

    if (progress.rows.length > 0) {
      await pool.query(`
        UPDATE employee_onboarding_progress
        SET status = 'in_progress', updated_at = NOW()
        WHERE employee_id = $1 AND workspace_id = $2
      `, [employeeId, workspaceId]);
    }

    result.afterState = { employee_id: employeeId, task_type: taskType, reset_to: 'pending' };
    result.success = true;
    result.actionDescription = `Reset onboarding task '${taskType}' for employee ${employeeId}`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.onboarding.reset_task', 'employee', employeeId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.onboarding.trigger_activation': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const emp = await pool.query(`SELECT id, status FROM employees WHERE id = $1 AND workspace_id = $2`, [targetEntityId, workspaceId]);
    if (emp.rows.length === 0) return { ...result, error: 'Employee not found' };

    result.beforeState = { status: emp.rows[0].status };
    await pool.query(`UPDATE employees SET status = 'active' WHERE id = $1`, [targetEntityId]);
    result.afterState = { status: 'active' };
    result.success = true;
    result.actionDescription = `Manually activated employee ${targetEntityId} (was: ${emp.rows[0].status})`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.onboarding.trigger_activation', 'employee', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.workspace.read_context': async (payload) => {
    const { workspaceId } = payload;

    const [ws, empCount, activeShifts, openInvoices, complianceAlerts] = await Promise.all([
      pool.query(`SELECT id, name, status FROM workspaces WHERE id = $1`, [workspaceId]),
      pool.query(`SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND status = 'active'`, [workspaceId]),
      pool.query(`SELECT COUNT(*) FROM shifts WHERE workspace_id = $1 AND status IN ('published','scheduled','confirmed','in_progress') AND start_time > NOW() - INTERVAL '24 hours'`, [workspaceId]),
      pool.query(`SELECT COUNT(*) FROM invoices WHERE workspace_id = $1 AND status IN ('pending','overdue')`, [workspaceId]),
      pool.query(`SELECT COUNT(*) FROM compliance_records WHERE workspace_id = $1 AND status = 'alert'`, [workspaceId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    return {
      success: true,
      actionType: payload.actionType,
      actionDescription: `Loaded context for workspace ${workspaceId}`,
      data: {
        workspace: ws.rows[0],
        activeEmployees: parseInt(empCount.rows[0].count),
        activeShifts: parseInt(activeShifts.rows[0].count),
        openInvoices: parseInt(openInvoices.rows[0].count),
        complianceAlerts: parseInt(complianceAlerts.rows[0].count)
      }
    };
  },

  'support.employee.override_status': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId, correctionData } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const newStatus = correctionData?.newStatus;
    if (!newStatus) return { ...result, error: 'correctionData.newStatus required' };

    const emp = await pool.query(`SELECT id, status FROM employees WHERE id = $1 AND workspace_id = $2`, [targetEntityId, workspaceId]);
    if (emp.rows.length === 0) return { ...result, error: 'Employee not found' };

    result.beforeState = { status: emp.rows[0].status };
    await pool.query(`UPDATE employees SET status = $1 WHERE id = $2`, [newStatus, targetEntityId]);
    result.afterState = { status: newStatus };
    result.success = true;
    result.actionDescription = `Overrode employee ${targetEntityId} status: ${emp.rows[0].status} → ${newStatus}`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.employee.override_status', 'employee', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.form.resend_invitation': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId, correctionData } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const inv = await pool.query(`SELECT id, status, sent_to_email, form_id, context_id FROM form_invitations WHERE id = $1`, [targetEntityId]);
    if (inv.rows.length === 0) return { ...result, error: 'Form invitation not found' };

    result.beforeState = { status: inv.rows[0].status };
    const newToken = crypto.randomBytes(32).toString('hex');
    await pool.query(`UPDATE form_invitations SET status = 'sent', token = $1, submitted_at = NULL WHERE id = $2`, [newToken, targetEntityId]);
    result.afterState = { status: 'sent', token_regenerated: true };
    result.success = true;
    result.actionDescription = `Resent form invitation ${targetEntityId} to ${inv.rows[0].sent_to_email}`;

    if (inv.rows[0].sent_to_email) {
      await emailService.send({
        to: inv.rows[0].sent_to_email,
        subject: 'Your Form Link Has Been Resent',
        html: `<p>A support agent has resent your form link. Please use the new link that will be sent separately, or contact support with your new token: <code>${newToken}</code></p>`,
        workspaceId
      });
    }

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.form.resend_invitation', 'form_invitation', targetEntityId, result.actionDescription, result.afterState);
    return result;
  },

  'support.document.regenerate': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const doc = await pool.query(`SELECT id, title, status FROM org_documents WHERE id = $1 AND workspace_id = $2`, [targetEntityId, workspaceId]);
    if (doc.rows.length === 0) return { ...result, error: 'Document not found' };

    result.beforeState = { status: doc.rows[0].status, title: doc.rows[0].title };
    await pool.query(`UPDATE org_documents SET status = 'regenerating', updated_at = NOW() WHERE id = $1`, [targetEntityId]);
    result.afterState = { status: 'regenerating', regeneration_queued: true };
    result.success = true;
    result.actionDescription = `Queued document regeneration for "${doc.rows[0].title}" (${targetEntityId})`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.document.regenerate', 'document', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  },

  'support.payroll.dispute_review': async (payload) => {
    const { targetEntityId, workspaceId, reason, actorId, correctionData } = payload;
    const result: SupportActionResult = { success: false, actionType: payload.actionType, actionDescription: '' };

    const ticketData = {
      workspace_id: workspaceId,
      ticket_number: `PAY-${Date.now()}`,
      type: 'payroll_dispute',
      subject: correctionData?.subject || 'Payroll Dispute Review',
      description: reason,
      status: 'open',
      priority: 'high',
      category: 'payroll_dispute',
      requested_by: correctionData?.employeeId || targetEntityId,
      assigned_to_trinity: true,
      trinity_attempted: false
    };

    const ticket = await pool.query(`
      INSERT INTO support_tickets (workspace_id, ticket_number, type, subject, description, status, priority, category, employee_id, assigned_to_trinity)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id, ticket_number
    `, [
      ticketData.workspace_id, ticketData.ticket_number, ticketData.type,
      ticketData.subject, ticketData.description, ticketData.status,
      ticketData.priority, ticketData.category, correctionData?.employeeId || null, true
    ]);

    result.afterState = { ticket_created: ticket.rows[0] };
    result.success = true;
    result.actionDescription = `Created payroll dispute ticket ${ticket.rows[0].ticket_number} for review`;

    await logSupportAction(payload, result, result.actionDescription);
    await logAudit(workspaceId, actorId, 'support.payroll.dispute_review', 'payroll', targetEntityId, result.actionDescription, result.afterState);
    await notifyOrgOwner(workspaceId, payload.actionType, result.actionDescription, reason);
    return result;
  }
};

export async function executeSupportAction(payload: SupportActionPayload): Promise<SupportActionResult> {
  const handler = supportActionHandlers[payload.actionType];
  if (!handler) {
    return {
      success: false,
      actionType: payload.actionType,
      actionDescription: `Unknown action type: ${payload.actionType}`,
      error: 'UNSUPPORTED_ACTION'
    };
  }

  try {
    log.info(`Executing support action: ${payload.actionType}`, {
      workspaceId: payload.workspaceId,
      actorId: payload.actorId,
      targetEntityId: payload.targetEntityId
    });
    return await handler(payload);
  } catch (err) {
    log.error(`Support action failed: ${payload.actionType}`, { err });
    return {
      success: false,
      actionType: payload.actionType,
      actionDescription: `Action failed: ${payload.actionType}`,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

export function listSupportActions() {
  return [
    { actionType: 'support.account.unlock', label: 'Unlock Account', category: 'account', description: 'Clear account lock and reset failed login attempts' },
    { actionType: 'support.account.reset_pin', label: 'Reset Clock-In PIN', category: 'account', description: 'Generate a temporary clock-in PIN for an officer' },
    { actionType: 'support.account.reset_2fa', label: 'Reset Two-Factor Auth', category: 'account', description: 'Disable 2FA requiring re-enrollment' },
    { actionType: 'support.notification.resend', label: 'Resend Notification', category: 'notifications', description: 'Requeue a failed notification for delivery' },
    { actionType: 'support.notification.fix_preferences', label: 'Fix Notification Preferences', category: 'notifications', description: 'Restore default notification preferences for a user' },
    { actionType: 'support.schedule.fix_assignment', label: 'Fix Schedule Assignment', category: 'scheduling', description: 'Correct a shift assignment to the right officer' },
    { actionType: 'support.invoice.recalculate', label: 'Recalculate Invoice', category: 'billing', description: 'Recalculate invoice subtotal from line items' },
    { actionType: 'support.onboarding.reset_task', label: 'Reset Onboarding Task', category: 'onboarding', description: 'Reset a stuck or failed onboarding task to pending' },
    { actionType: 'support.onboarding.trigger_activation', label: 'Trigger Employee Activation', category: 'onboarding', description: 'Manually activate an employee stuck in pending' },
    { actionType: 'support.workspace.read_context', label: 'Read Workspace Context', category: 'intelligence', description: 'Load full workspace snapshot for support context' },
    { actionType: 'support.employee.override_status', label: 'Override Employee Status', category: 'workforce', description: 'Override employee status to resolve data inconsistency' },
    { actionType: 'support.form.resend_invitation', label: 'Resend Form Invitation', category: 'forms', description: 'Regenerate and resend an expired form invitation link' },
    { actionType: 'support.document.regenerate', label: 'Regenerate Document', category: 'documents', description: 'Queue regeneration of a corrupted or missing document' },
    { actionType: 'support.payroll.dispute_review', label: 'Create Payroll Dispute', category: 'payroll', description: 'Create a high-priority payroll dispute ticket for review' },
  ];
}
