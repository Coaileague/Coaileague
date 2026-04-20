/**
 * Trinity Form Actions
 *
 * Registers three actions on the helpai orchestrator:
 *   form.prefill       — return pre-populated field values from context (employee/shift/client)
 *   form.auto_submit   — programmatically submit a draft submission on behalf of an officer
 *   form.query_status  — check submission status for compliance audits
 *
 * Each action is tenant-scoped (workspaceId required) per Section G of TRINITY.md.
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import {
  customForms,
  customFormSubmissions,
  formSignatures,
  employees,
  shifts,
  clients,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { universalAudit } from '../universalAuditService';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { createLogger } from '../../lib/logger';

const log = createLogger('trinityFormActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity form action: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const data = await fn(req.params || {});
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: true, data };
      } catch (err: any) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: false, error: err?.message || 'Unknown error' };
      }
    },
  };
}

export function registerFormActions() {
  /**
   * form.prefill
   * Returns a pre-populated field-value map for a form definition, resolved
   * from the officer's employee record, current/upcoming shift, and client.
   *
   * Params: { workspaceId, formId, employeeId?, shiftId? }
   * Returns: { fields: Record<string, string> }
   */
  helpaiOrchestrator.registerAction(
    mkAction('form.prefill', async (params) => {
      const { workspaceId, formId, employeeId, shiftId } = params as {
        workspaceId: string;
        formId: string;
        employeeId?: string;
        shiftId?: string;
      };

      if (!workspaceId || !formId) return { error: 'workspaceId and formId are required' };

      const [form] = await db
        .select()
        .from(customForms)
        .where(and(eq(customForms.id, formId), eq(customForms.workspaceId, workspaceId)));

      if (!form) return { error: 'Form not found' };

      const prefillRules = (form.prefillRules as Record<string, string> | null) || {};
      const prefilled: Record<string, string> = {};

      // Resolve employee context
      let emp: any = null;
      if (employeeId) {
        const [row] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));
        emp = row || null;
      }

      // Resolve shift context
      let shift: any = null;
      let client: any = null;
      if (shiftId) {
        const [shiftRow] = await db
          .select()
          .from(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)));
        shift = shiftRow || null;

        if (shift?.clientId) {
          const [clientRow] = await db
            .select()
            .from(clients)
            .where(and(eq(clients.id, shift.clientId), eq(clients.workspaceId, workspaceId)));
          client = clientRow || null;
        }
      }

      // Apply prefill rules — maps field names to context paths
      const context: Record<string, string | null> = {
        'employee.fullName': emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : null,
        'employee.email': emp?.email || null,
        'employee.phone': emp?.phone || null,
        'employee.badgeNumber': emp?.badgeNumber || emp?.employeeId || null,
        'shift.clientName': client?.name || shift?.location || null,
        'shift.location': shift?.location || null,
        'shift.startTime': shift?.startTime ? new Date(shift.startTime).toISOString() : null,
        'shift.endTime': shift?.endTime ? new Date(shift.endTime).toISOString() : null,
        'now': new Date().toISOString(),
        'date': new Date().toISOString().slice(0, 10),
      };

      for (const [fieldName, contextPath] of Object.entries(prefillRules)) {
        const value = context[contextPath];
        if (value !== null && value !== undefined) {
          prefilled[fieldName] = value;
        }
      }

      log.info(`[trinityFormActions] form.prefill: form=${formId} employee=${employeeId} shift=${shiftId} → ${Object.keys(prefilled).length} fields`);
      return { formId, fields: prefilled };
    })
  );

  /**
   * form.auto_submit
   * Submits a draft customFormSubmission on behalf of Trinity when an officer
   * has not submitted within the required window (e.g. 24h after incident).
   *
   * Params: { workspaceId, submissionId, reason? }
   * Returns: { submissionId, status, submittedAt }
   */
  helpaiOrchestrator.registerAction(
    mkAction('form.auto_submit', async (params) => {
      const { workspaceId, submissionId, reason } = params as {
        workspaceId: string;
        submissionId: string;
        reason?: string;
      };

      if (!workspaceId || !submissionId) return { error: 'workspaceId and submissionId are required' };

      const [submission] = await db
        .select()
        .from(customFormSubmissions)
        .where(and(
          eq(customFormSubmissions.id, submissionId),
          eq(customFormSubmissions.workspaceId, workspaceId),
        ));

      if (!submission) return { error: 'Submission not found' };

      if (!['draft', 'completed'].includes(submission.status || '')) {
        return { error: `Cannot auto-submit — status is "${submission.status}"` };
      }

      const [form] = await db
        .select()
        .from(customForms)
        .where(and(eq(customForms.id, submission.formId), eq(customForms.workspaceId, workspaceId)));

      const now = new Date();

      const [updated] = await db
        .update(customFormSubmissions)
        .set({ status: 'submitted', submittedAt: now, updatedAt: now })
        .where(and(
          eq(customFormSubmissions.id, submissionId),
          eq(customFormSubmissions.workspaceId, workspaceId),
        ))
        .returning();

      // Record Trinity's "signature" as a system audit entry
      await db.insert(formSignatures).values({
        submissionId,
        workspaceId,
        signedBy: 'trinity',
        signatureType: 'trinity',
        signatureData: `Auto-submitted by Trinity${reason ? `: ${reason}` : ''}`,
        ipAddress: '127.0.0.1',
      });

      await universalAudit.log({
        workspaceId,
        actorId: 'trinity',
        actorType: 'trinity',
        action: 'form.auto_submitted',
        entityType: 'form_submission',
        entityId: submissionId,
        entityName: form?.name || submission.formId,
        changeType: 'update',
        metadata: { reason, previousStatus: submission.status },
      });

      // Notify the approver if routing rules exist
      const routingRules = (form?.routingRules as any) || {};
      if (routingRules?.approverUserId) {
        try {
          await NotificationDeliveryService.send({
            type: 'document_requires_signature',
            workspaceId,
            recipientUserId: routingRules.approverUserId,
            channel: 'in_app',
            subject: `[Trinity] Auto-submitted form needs review: ${form?.name || ''}`,
            body: {
              message: `Trinity auto-submitted a "${form?.name}" form (${reason || 'deadline reached'}). Review required.`,
              submissionId,
              autoSubmitted: true,
            },
          });
        } catch (notifErr: any) {
          log.warn('[trinityFormActions] Notification failed (non-fatal):', notifErr?.message);
        }
      }

      log.info(`[trinityFormActions] form.auto_submit: submission=${submissionId} workspace=${workspaceId} reason="${reason}"`);
      return { submissionId, status: updated.status, submittedAt: updated.submittedAt };
    })
  );

  /**
   * form.query_status
   * Returns submission status and compliance summary for a workspace.
   *
   * Params: { workspaceId, formId?, employeeId?, status? }
   * Returns: { total, byStatus, items[] }
   */
  helpaiOrchestrator.registerAction(
    mkAction('form.query_status', async (params) => {
      const { workspaceId, formId, employeeId, status } = params as {
        workspaceId: string;
        formId?: string;
        employeeId?: string;
        status?: string;
      };

      if (!workspaceId) return { error: 'workspaceId is required' };

      const conditions: any[] = [eq(customFormSubmissions.workspaceId, workspaceId)];
      if (formId) conditions.push(eq(customFormSubmissions.formId, formId));
      if (employeeId) conditions.push(eq(customFormSubmissions.submittedBy, employeeId));
      if (status) conditions.push(eq(customFormSubmissions.status, status));

      const rows = await db
        .select({
          id: customFormSubmissions.id,
          formId: customFormSubmissions.formId,
          submittedBy: customFormSubmissions.submittedBy,
          status: customFormSubmissions.status,
          submittedAt: customFormSubmissions.submittedAt,
          approvedAt: customFormSubmissions.approvedAt,
          rejectedAt: customFormSubmissions.rejectedAt,
          expiryDate: customFormSubmissions.expiryDate,
        })
        .from(customFormSubmissions)
        .where(and(...conditions))
        .orderBy(desc(customFormSubmissions.submittedAt))
        .limit(100);

      const byStatus: Record<string, number> = {};
      for (const r of rows) {
        const s = r.status || 'unknown';
        byStatus[s] = (byStatus[s] || 0) + 1;
      }

      return {
        workspaceId,
        total: rows.length,
        byStatus,
        items: rows,
      };
    })
  );

  log.info('[trinityFormActions] Registered 3 form actions: form.prefill, form.auto_submit, form.query_status');
}
