/**
 * Shift Completion Bridge
 *
 * Fills the critical gap in Trinity's revenue pipeline:
 *   Assigned shifts that end with no guard clock-in/out → invisible to billing & payroll forever
 *
 * Every 30 minutes this bridge scans for assigned shifts whose scheduled end time
 * has passed by > 30 minutes and have NO linked time entry. For each one it:
 *   1. Creates a pending time entry using the shift's scheduled hours
 *   2. If the workspace has auto-invoicing enabled, auto-approves the entry so billing can fire
 *   3. If not auto-approved, notifies managers to review
 *   4. After any approvals, fires time_entries_approved so billing + payroll triggers run
 *
 * This complements the existing autoClockOut job which closes entries that DO have
 * a clock-in but are missing a clock-out. This bridge handles the case where the
 * guard never clocked in at all.
 */

import { db } from '../../db';
import {
  shifts,
  timeEntries,
  workspaces,
} from '@shared/schema';
import {
  and,
  eq,
  isNotNull,
  lt,
  sql,
} from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { automationOrchestration } from '../orchestration/automationOrchestration';
import { createLogger } from '../../lib/logger';
const log = createLogger('shiftCompletionBridge');


const GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 min after shift end before we create entry

// G11 FIX: module-level concurrency guard.
// runShiftCompletionBridge is called by the cron scheduler every 30 min.
// If a full scan across all workspaces takes longer than 30 min (e.g. large DB),
// the next cron tick would start a second concurrent run — both would find the same
// unmatched shifts and insert duplicate pending time entries.
let _bridgeRunning = false;

export interface ShiftBridgeResult {
  workspacesScanned: number;
  shiftsWithNoEntry: number;
  timeEntriesCreated: number;
  autoApproved: number;
  errors: string[];
}

export async function runShiftCompletionBridge(): Promise<ShiftBridgeResult> {
  if (_bridgeRunning) {
    log.warn('[ShiftCompletionBridge] Previous run still in progress — skipping tick to prevent duplicate time entry creation');
    return { workspacesScanned: 0, shiftsWithNoEntry: 0, timeEntriesCreated: 0, autoApproved: 0, errors: ['skipped: previous run in progress'] };
  }
  _bridgeRunning = true;

  try {
    return await automationOrchestration.executeAutomation(
      {
        domain: 'time_tracking',
        automationName: 'shift-completion-bridge-cycle',
        automationType: 'scheduled_task',
        triggeredBy: 'cron',
        billable: false,
      },
      async (ctx) => {
        const now = new Date();
        const cutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

        const result: ShiftBridgeResult = {
          workspacesScanned: 0,
          shiftsWithNoEntry: 0,
          timeEntriesCreated: 0,
          autoApproved: 0,
          errors: [],
        };

        const activeWorkspaces = await db
          .select({
            id: workspaces.id,
            name: workspaces.name,
            autoInvoicingEnabled: workspaces.autoInvoicingEnabled,
            defaultBillableRate: workspaces.defaultBillableRate,
            defaultHourlyRate: workspaces.defaultHourlyRate,
          })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.isSuspended, false),
              eq(workspaces.isFrozen, false),
              eq(workspaces.isLocked, false),
              eq(workspaces.subscriptionStatus, 'active'),
            ),
          );

        result.workspacesScanned = activeWorkspaces.length;

        for (const workspace of activeWorkspaces) {
          try {
            await processWorkspace(workspace, cutoff, result);
          } catch (wsErr: any) {
            const msg = `[ShiftBridge] Workspace ${workspace.id} error: ${wsErr.message}`;
            log.error(msg);
            result.errors.push(msg);
          }
        }

        if (result.timeEntriesCreated > 0) {
          log.info(
            `[ShiftBridge] Complete — ${result.timeEntriesCreated} time entries created, ` +
            `${result.autoApproved} auto-approved across ${result.workspacesScanned} workspaces`,
          );
        }

        return result;
      }
    ).then(res => res.data || { workspacesScanned: 0, shiftsWithNoEntry: 0, timeEntriesCreated: 0, autoApproved: 0, errors: [res.error || 'Unknown orchestration error'] });
  } finally {
    // G11 FIX: always release the lock so the next scheduled tick can proceed
    _bridgeRunning = false;
  }
}

async function processWorkspace(
  workspace: {
    id: string;
    name: string | null;
    autoInvoicingEnabled: boolean | null;
    defaultBillableRate: string | null;
    defaultHourlyRate: string | null;
  },
  cutoff: Date,
  result: ShiftBridgeResult,
): Promise<void> {
  // Find all shift IDs that already have at least one time entry
  const shiftsWithEntries = await db
    .select({ shiftId: timeEntries.shiftId })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspace.id),
        isNotNull(timeEntries.shiftId),
      ),
    );

  const coveredShiftIds = new Set(
    shiftsWithEntries.map(r => r.shiftId).filter(Boolean) as string[],
  );

  // Find assigned shifts that ended before the cutoff with no linked entry
  const uncoveredShifts = await db
    .select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      clientId: shifts.clientId,
      subClientId: shifts.subClientId,
      siteId: shifts.siteId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      billRate: shifts.billRate,
      payRate: shifts.payRate,
      contractRate: shifts.contractRate,
      billableToClient: shifts.billableToClient,
      title: shifts.title,
      status: shifts.status,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.workspaceId, workspace.id),
        isNotNull(shifts.employeeId),
        lt(shifts.endTime, cutoff),
        // Only published/assigned shifts — not draft training shifts
        sql`${shifts.status} NOT IN ('draft', 'cancelled')`,
        eq(shifts.isTrainingShift, false),
      ),
    );

  const missing = uncoveredShifts.filter(s => !coveredShiftIds.has(s.id));
  result.shiftsWithNoEntry += missing.length;

  if (missing.length === 0) return;

  // Auto-approve when workspace has auto-invoicing enabled (reasonable proxy for
  // "this workspace trusts automated data enough to bill without manual review")
  const shouldAutoApprove = workspace.autoInvoicingEnabled === true;
  const now = new Date();

  const approvedEntryIds: string[] = [];

  for (const shift of missing) {
    try {
      if (!shift.employeeId) continue;

      const startTime = new Date(shift.startTime);
      const endTime = new Date(shift.endTime);
      const totalMs = endTime.getTime() - startTime.getTime();
      const totalHours = Math.max(0, totalMs / (1000 * 60 * 60));

      if (totalHours <= 0) continue;

      const capturedBillRate =
        shift.billRate ||
        shift.contractRate ||
        workspace.defaultBillableRate ||
        null;

      const capturedPayRate =
        shift.payRate ||
        workspace.defaultHourlyRate ||
        null;

      // Compute pre-stored amounts so ledger queries never need to recalculate
      const billRateNum = capturedBillRate ? parseFloat(String(capturedBillRate)) : 0;
      const payRateNum = capturedPayRate ? parseFloat(String(capturedPayRate)) : 0;
      const billableAmount = billRateNum > 0 ? parseFloat((totalHours * billRateNum).toFixed(2)) : null;
      const payableAmount = payRateNum > 0 ? parseFloat((totalHours * payRateNum).toFixed(2)) : null;
      const totalAmount = billableAmount;

      const status = shouldAutoApprove ? 'approved' : 'pending';
      const notes =
        `[SHIFT-BRIDGE] Auto-created from scheduled shift "${shift.title || shift.id}". ` +
        `Guard had no clock-in/out recorded. Scheduled hours used. ` +
        (shouldAutoApprove
          ? 'Auto-approved per workspace auto-invoicing setting.'
          : 'Pending manager review and approval.');

      const [inserted] = await db
        .insert(timeEntries)
        .values({
          workspaceId: workspace.id,
          shiftId: shift.id,
          employeeId: shift.employeeId,
          clientId: shift.clientId,
          subClientId: shift.subClientId,
          siteId: shift.siteId,
          clockIn: startTime,
          clockOut: endTime,
          totalHours: totalHours.toFixed(4),
          capturedBillRate,
          capturedPayRate,
          billableAmount: billableAmount !== null ? String(billableAmount) : null,
          payableAmount: payableAmount !== null ? String(payableAmount) : null,
          totalAmount: totalAmount !== null ? String(totalAmount) : null,
          regularHours: totalHours.toFixed(4),
          billableToClient: (shift.billableToClient ?? true) && !!shift.clientId,
          status,
          approvedAt: shouldAutoApprove ? now : null,
          notes,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: timeEntries.id });

      result.timeEntriesCreated++;

      if (shouldAutoApprove && inserted?.id) {
        result.autoApproved++;
        approvedEntryIds.push(inserted.id);
      }
    } catch (shiftErr: any) {
      const msg = `[ShiftBridge] Failed to create entry for shift ${shift.id}: ${shiftErr.message}`;
      log.error(msg);
      result.errors.push(msg);
    }
  }

  // Notify managers about pending entries that need review via event bus
  if (result.timeEntriesCreated > 0 && !shouldAutoApprove) {
    try {
      await platformEventBus.publish({
        type: 'time_entries_pending_review',
        category: 'automation',
        workspaceId: workspace.id,
        title: 'Time Entries Require Manager Review',
        description:
          `${missing.length} completed shift(s) had no clock-in/out recorded. ` +
          `Pending time entries have been created from scheduled hours. ` +
          `Review and approve in Time Tracking to enable invoicing and payroll.`,
        payload: { count: missing.length, source: 'shift_completion_bridge' },
        metadata: { source: 'ShiftCompletionBridge', actionUrl: '/time-tracking' },
      });
    } catch (notifyErr: any) {
      log.warn(`[ShiftBridge] Notification event failed for workspace ${workspace.id}:`, notifyErr.message);
    }
  }

  // Fire time_entries_approved event when auto-approved entries were created
  // This triggers billing + payroll pipelines immediately
  if (approvedEntryIds.length > 0) {
    try {
      await platformEventBus.publish({
        type: 'time_entries_approved',
        category: 'automation',
        workspaceId: workspace.id,
        title: 'Shift Completion Bridge — Entries Auto-Approved',
        description: `${approvedEntryIds.length} time entries auto-created and approved from completed shifts. Billing and payroll triggers will now fire.`,
        payload: {
          entryIds: approvedEntryIds,
          source: 'shift_completion_bridge',
          count: approvedEntryIds.length,
        },
        metadata: { source: 'ShiftCompletionBridge' },
      });
    } catch (eventErr: any) {
      log.warn(`[ShiftBridge] Event publish failed for workspace ${workspace.id}:`, eventErr.message);
    }
  }
}
