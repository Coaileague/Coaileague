/**
 * Trinity Tax Deadline Monitor
 * =============================
 * Daily sweep that alerts org owners ahead of federal tax filing deadlines:
 *
 *   30 days out → in-app brief to owner + managers
 *   14 days out → urgent in-app + SMS to owner
 *   7  days out → critical in-app + SMS + email to owner + all managers
 *
 * Deadlines covered (sourced from taxFilingAssistanceService):
 *   - W-2 distribution:  Jan 31
 *   - 1099-NEC distribution: Jan 31
 *   - 941 quarterly (Q1/Q2/Q3/Q4)
 *   - 940 annual FUTA: Jan 31
 *
 * Registered from autonomousScheduler.ts (Trinity Tax Deadline Monitor)
 * via a daily 6 AM cron.
 */

import { db } from '../../../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { sendSMSToEmployee } from '../../smsService';
import { createLogger } from '../../../lib/logger';
import {
  logWorkflowStart,
  logWorkflowStep,
  logWorkflowComplete,
} from './workflowLogger';

const log = createLogger('taxDeadlineMonitor');

const WORKFLOW_NAME = 'tax_deadline_monitor';

type Severity = 'info' | 'warn' | 'urgent';

interface DeadlineWindow {
  daysBefore: number;
  severity: Severity;
  sms: boolean;
  email: boolean;
}

const WINDOWS: DeadlineWindow[] = [
  { daysBefore: 30, severity: 'info',   sms: false, email: false },
  { daysBefore: 14, severity: 'warn',   sms: true,  email: false },
  { daysBefore: 7,  severity: 'urgent', sms: true,  email: true  },
  { daysBefore: 1,  severity: 'urgent', sms: true,  email: true  },
];

export interface TaxDeadlineSweepResult {
  scanned: number;
  notified: number;
  errors: string[];
}

export async function runTaxDeadlineMonitor(): Promise<TaxDeadlineSweepResult> {
  const record = await logWorkflowStart({
    workflowName: WORKFLOW_NAME,
    workspaceId: 'platform',
    triggerSource: 'cron_tax_deadline_daily',
  });

  const result: TaxDeadlineSweepResult = {
    scanned: 0,
    notified: 0,
    errors: [],
  };

  try {
    const { taxFilingAssistanceService } = await import('../../taxFilingAssistanceService');
    const year = new Date().getFullYear();
    const deadlines = taxFilingAssistanceService.getFilingDeadlines(year - 1);

    // Find deadlines that fall exactly in one of our alert windows
    const alertWindows = deadlines.filter(d =>
      WINDOWS.some(w => d.daysUntilDue === w.daysBefore)
    );

    if (alertWindows.length === 0) {
      await logWorkflowComplete(record, {
        success: true,
        summary: 'No deadlines in alert windows today',
        result: { scanned: 0, notified: 0 },
      });
      return result;
    }

    // Iterate active workspaces
    const activeWorkspaces = await db
      .select({ id: workspaces.id, ownerId: workspaces.ownerId, companyName: workspaces.companyName })
      .from(workspaces)
      .where(eq(workspaces.subscriptionStatus, 'active'));

    result.scanned = activeWorkspaces.length;

    for (const ws of activeWorkspaces) {
      if (!ws.ownerId) continue;

      for (const dl of alertWindows) {
        const window = WINDOWS.find(w => w.daysBefore === dl.daysUntilDue);
        if (!window) continue;

        const subject = window.daysBefore <= 7
          ? `URGENT: ${dl.description} due in ${dl.daysUntilDue} day${dl.daysUntilDue === 1 ? '' : 's'}`
          : `${dl.description} due in ${dl.daysUntilDue} days`;

        try {
          await NotificationDeliveryService.send({
            type: 'tax.deadline_reminder' as any,
            workspaceId: ws.id,
            recipientUserId: ws.ownerId,
            channel: 'in_app' as any,
            subject,
            body: {
              formType: dl.formType,
              deadline: dl.deadline,
              daysUntilDue: dl.daysUntilDue,
              severity: window.severity,
              description: dl.description,
              filingInstructions: dl.filingInstructions,
              portalUrl: dl.irsPortalUrl,
              taxCenterUrl: '/payroll/tax-center',
            },
            idempotencyKey: `tax-deadline-${ws.id}-${dl.formType}-${dl.deadline}-${window.daysBefore}`,
          });
          result.notified += 1;
        } catch (err: any) {
          log.warn('[taxDeadlineMonitor] notification failed', { workspaceId: ws.id, err: err?.message });
          result.errors.push(`${ws.id}:${dl.formType}:${err?.message}`);
        }

        // Urgent channels — SMS to owner (look up owner's employee record)
        if (window.sms) {
          try {
            const { pool } = await import('../../../db');
            const r = await pool.query(
              `SELECT id, phone FROM employees
                WHERE workspace_id = $1 AND user_id = $2 AND phone IS NOT NULL
                LIMIT 1`,
              [ws.id, ws.ownerId],
            );
            const ownerEmployee = r.rows[0];
            if (ownerEmployee?.id && ownerEmployee?.phone) {
              const smsBody = window.daysBefore <= 7
                ? `URGENT: ${dl.description} is due ${dl.deadline} (${dl.daysUntilDue}d). Review in CoAIleague Tax Center. — Trinity`
                : `Reminder: ${dl.description} is due ${dl.deadline}. CoAIleague has generated your forms — review in Tax Center. — Trinity`;
              await sendSMSToEmployee(
                ownerEmployee.id,
                smsBody,
                `tax_deadline_${window.daysBefore}d`,
                ws.id,
              );
            }
          } catch (err: any) {
            log.warn('[taxDeadlineMonitor] SMS failed', { workspaceId: ws.id, err: err?.message });
          }
        }
      }

      await logWorkflowStep(
        record,
        'notify',
        true,
        `workspace=${ws.id} deadlines=${alertWindows.length}`,
      );
    }

    await logWorkflowComplete(record, {
      success: result.errors.length === 0,
      summary: `Notified ${result.notified} owners across ${result.scanned} workspaces`,
      result: {
        scanned: result.scanned,
        notified: result.notified,
        errors: result.errors.length,
      },
    });
    return result;
  } catch (err: any) {
    log.error('[taxDeadlineMonitor] sweep failed', { err: err?.message });
    result.errors.push(err?.message || String(err));
    await logWorkflowComplete(record, {
      success: false,
      errorMessage: err?.message || String(err),
      result: {
        scanned: result.scanned,
        notified: result.notified,
        errors: result.errors.length,
      },
    });
    return result;
  }
}

