import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db, pool } from "../db";
import { hasManagerAccess, resolveWorkspaceForUser, getUserPlatformRole, hasPlatformWideAccess } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('TerminationRoutes');


const router = Router();

async function requireManagerForTermination(req: any, res: any): Promise<{ workspace: any } | null> {
  const userId = req.user?.id || req.user?.claims?.sub;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
  const platformRole = await getUserPlatformRole(userId);
  if (hasPlatformWideAccess(platformRole)) {
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    if (!workspace) { res.status(404).json({ message: "Workspace not found" }); return null; }
    return { workspace };
  }
  const resolved = await resolveWorkspaceForUser(userId);
  if (!resolved.workspaceId || !resolved.role) { res.status(403).json({ message: "Workspace not found" }); return null; }
  if (!hasManagerAccess(resolved.role)) { res.status(403).json({ message: "Insufficient permissions — manager role or higher required" }); return null; }
  const workspace = await storage.getWorkspace(resolved.workspaceId);
  if (!workspace) { res.status(404).json({ message: "Workspace not found" }); return null; }
  return { workspace };
}

router.get("/terminations", requireAuth, async (req: any, res) => {
  try {
    const result = await requireManagerForTermination(req, res);
    if (!result) return;
    const { workspace } = result;

    const terminations = await storage.getEmployeeTerminationsByWorkspace(workspace.id);
    res.json(terminations);
  } catch (error) {
    log.error("Error fetching terminations:", error);
    res.status(500).json({ message: "Failed to fetch terminations" });
  }
});

router.post("/terminations", requireAuth, async (req: any, res) => {
  try {
    const result = await requireManagerForTermination(req, res);
    if (!result) return;
    const { workspace } = result;

    const { insertEmployeeTerminationSchema } = await import("@shared/schema");
    const validated = insertEmployeeTerminationSchema.parse({
      ...req.body,
      workspaceId: workspace.id,
    });

    // ── Trinity Deliberation Gate ───────────────────────────────────────────
    // Terminations are the highest-stakes destructive action. Trinity considers
    // tenure, reliability score, progressive-discipline record, and empathetic
    // impact; generated PIPs/warnings are persisted regardless of verdict to
    // create legal protection. Owners override via { deliberationApproved: true }.
    const deliberationApproved = req.body?.deliberationApproved === true;
    if (!deliberationApproved) {
      try {
        const { deliberate, persistDeliberationDocuments } =
          await import('../services/trinity/trinityDeliberation');
        const delibCtx = {
          requestType: 'terminate_employee' as const,
          requestedBy: req.user?.id || 'unknown',
          requestedByRole: (result as any)?.workspace?.role || '',
          workspaceId: workspace.id,
          targetId: validated.employeeId || undefined,
          targetType: 'employee' as const,
          rawCommand: validated.reason || 'Employee termination',
        };
        const deliberationResult = await deliberate(delibCtx);
        scheduleNonBlocking('termination.deliberation-docs', () =>
          persistDeliberationDocuments(deliberationResult, delibCtx),
        );
        if (['intervene', 'pause_and_warn'].includes(deliberationResult.verdict)) {
          return res.status(200).json({
            trinityIntervention: true,
            verdict: deliberationResult.verdict,
            headline: deliberationResult.headline,
            reasoning: deliberationResult.reasoning,
            empathyStatement: deliberationResult.empathyStatement,
            riskAssessment: deliberationResult.riskAssessment,
            alternatives: deliberationResult.alternatives,
            generatedDocuments: deliberationResult.generatedDocuments?.map(d => ({
              type: d.type, title: d.title, persisted: d.shouldPersist,
            })),
            overrideAvailable: true,
            overrideMessage: 'Resubmit with deliberationApproved: true to proceed.',
          });
        }
        if (deliberationResult.verdict === 'block') {
          return res.status(200).json({
            trinityIntervention: true,
            verdict: 'block',
            headline: deliberationResult.headline,
            reasoning: deliberationResult.reasoning,
            overrideAvailable: false,
          });
        }
      } catch (deliberationErr: any) {
        log.warn('[Termination] Deliberation failed (non-fatal):', deliberationErr?.message);
      }
    }

    const termination = await storage.createEmployeeTermination(validated);

    // Cross-tenant score persistence — when an employee departs, mark them
    // as members of the global pool so their score/reputation survives
    // into any next employer. Non-blocking: score writes should never
    // fail a termination.
    scheduleNonBlocking('termination.cross-tenant-score', async () => {
      if (!validated.employeeId) return;
      try {
        await pool.query(`
          UPDATE coaileague_profiles
             SET is_in_global_pool = TRUE,
                 is_active_in_current_org = FALSE,
                 departed_at = NOW(),
                 departure_reason = $1,
                 updated_at = NOW()
           WHERE employee_id = $2 AND workspace_id = $3
        `, [validated.reason || 'terminated', validated.employeeId, workspace.id]);
        log.info(`[CrossTenantScore] Score persisted to global pool for ${validated.employeeId}`);
      } catch (err: any) {
        log.warn('[CrossTenantScore] Persist failed (non-fatal):', err?.message);
      }
    });

    interface EquipmentChecklistItem { assignmentId: string; itemName: string; serialNumber: string | null; category: string; checkoutDate: string | null; expectedReturnDate: string | null; }
    let equipmentChecklist: EquipmentChecklistItem[] = [];
    try {
      const equipResult = await db.$client.query(
        `SELECT ea.id AS assignment_id, ei.name AS item_name, ei.serial_number, ei.category,
                ea.checkout_date, ea.expected_return_date
         FROM equipment_assignments ea
         JOIN equipment_items ei ON ea.equipment_item_id = ei.id
         WHERE ea.employee_id = $1 AND ea.workspace_id = $2 AND ea.actual_return_date IS NULL`,
        [validated.employeeId, workspace.id]
      );
      interface EquipmentInitRow { assignment_id: string; item_name: string; serial_number: string | null; category: string; checkout_date: string | null; expected_return_date: string | null; }
      equipmentChecklist = (equipResult.rows as EquipmentInitRow[]).map((r) => ({
        assignmentId: r.assignment_id,
        itemName: r.item_name,
        serialNumber: r.serial_number,
        category: r.category,
        checkoutDate: r.checkout_date,
        expectedReturnDate: r.expected_return_date,
      }));
      if (equipmentChecklist.length > 0) {
        log.info(`[Termination] Equipment checklist generated at initiation for employee ${validated.employeeId}: ${equipmentChecklist.length} unreturned item(s)`);
      }
    } catch (equipErr) {
      log.warn("[Termination] Equipment checklist generation failed (non-blocking):", equipErr);
    }

    res.status(201).json({ ...termination, equipmentChecklist });
  } catch (error: unknown) {
    log.error("Error creating termination:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create termination" });
  }
});

router.patch("/terminations/:id", requireAuth, async (req: any, res) => {
  try {
    const result = await requireManagerForTermination(req, res);
    if (!result) return;
    const { workspace } = result;

    const { id } = req.params;
    
    const { insertEmployeeTerminationSchema } = await import("@shared/schema");
    const validated = insertEmployeeTerminationSchema
      .partial()
      .omit({ workspaceId: true, employeeId: true })
      .parse(req.body);
    
    const updated = await storage.updateEmployeeTermination(id, workspace.id, validated);
    
    if (!updated) {
      return res.status(404).json({ message: "Termination not found" });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating termination:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update termination" });
  }
});

router.patch("/terminations/:id/complete", requireAuth, async (req: any, res) => {
  try {
    const result = await requireManagerForTermination(req, res);
    if (!result) return;
    const { workspace } = result;

    const actorUserId = req.user?.id || req.user?.claims?.sub;
    const { id } = req.params;
    const completed = await storage.completeTermination(id, workspace.id);
    
    if (!completed) {
      return res.status(404).json({ message: "Termination not found" });
    }

    const employeeId = completed.employeeId;

    // ── 1. Remove employee from all FUTURE scheduled shifts ──────────────────
    let affectedShiftCount = 0;
    if (employeeId) {
      try {
        const { db } = await import('../db');
        const { shifts } = await import('@shared/schema');
        const { eq, and, gte } = await import('drizzle-orm');
        const now = new Date();

        const futureShifts = await db.select({ id: shifts.id, assignedEmployeeIds: (shifts as any).assignedEmployeeIds })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspace.id),
            gte(shifts.startTime, now),
          ));

        const affectedShiftIds: string[] = [];
        for (const shift of futureShifts) {
          const isPrimary = (shift as any).employeeId === employeeId;
          const inAssigned = Array.isArray((shift as any).assignedEmployeeIds) &&
            (shift as any).assignedEmployeeIds.includes(employeeId);
          if (isPrimary || inAssigned) {
            affectedShiftIds.push(shift.id);
          }
        }

        for (const shiftId of affectedShiftIds) {
          const currentShift = futureShifts.find(s => s.id === shiftId);
          const newAssigned = Array.isArray((currentShift as any).assignedEmployeeIds)
            ? (currentShift as any).assignedEmployeeIds.filter((eid: string) => eid !== employeeId)
            : [];
          await db.update(shifts)
            .set({
              employeeId: (currentShift as any).employeeId === employeeId ? null : (currentShift as any).employeeId,
              assignedEmployeeIds: newAssigned,
            } as any)
            .where(eq(shifts.id, shiftId));
        }
        affectedShiftCount = affectedShiftIds.length;
        log.info(`[Termination] Removed employee ${employeeId} from ${affectedShiftCount} future shift(s)`);
      } catch (shiftCleanupErr: unknown) {
        log.error('[terminationRoutes] Failed to unassign terminated employee from future shifts (non-blocking):', (shiftCleanupErr instanceof Error ? shiftCleanupErr.message : String(shiftCleanupErr)));
      }
    }

    // ── 2. SESSION INVALIDATION — revoke all active sessions immediately ─────
    if (employeeId) {
      try {
        const { db } = await import('../db');
        const { sessions } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');
        const empRecord = await storage.getEmployee(employeeId, workspace.id);
        if (empRecord?.userId) {
          try {
            // @ts-expect-error — TS migration: fix in refactoring sprint
            await db.delete(sessions).where(eq(sessions.userId, empRecord.userId));
            log.info(`[Termination] Sessions invalidated for user ${empRecord.userId}`);
          } catch {
            log.warn('[Termination] sessions table may not support userId-based delete — skipping');
          }
        }
      } catch (sessionErr: unknown) {
        log.error('[terminationRoutes] Session invalidation failed (non-blocking):', (sessionErr instanceof Error ? sessionErr.message : String(sessionErr)));
      }
    }

    // ── 2b. 14-DAY DOCUMENT ACCESS WINDOW + TERMINATION EMAIL ────────────────
    if (employeeId) {
      try {
        const { db: dbInst } = await import('../db');
        const { employees: emps } = await import('@shared/schema');
        const { eq: eqOp } = await import('drizzle-orm');

        const empRecord = await storage.getEmployee(employeeId, workspace.id);
        const docAccessExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

        // Set document access expiry on the employee row
        await dbInst.execute(
          (await import('drizzle-orm')).sql`
            UPDATE employees
            SET document_access_expires_at = ${docAccessExpiresAt}
            WHERE id = ${employeeId} AND workspace_id = ${workspace.id}
          `
        );
        log.info(`[Termination] Document access window set until ${docAccessExpiresAt.toISOString()} for employee ${employeeId}`);

        // Send termination email to the employee
        if (empRecord?.email) {
          try {
            const { getUncachableResendClient } = await import('../services/emailCore');
            const { client, fromEmail } = await getUncachableResendClient();
            const expiryDateStr = docAccessExpiresAt.toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            });
            const employeeName = empRecord.firstName
              ? `${empRecord.firstName}${empRecord.lastName ? ' ' + empRecord.lastName : ''}`
              : 'Employee';

            await client.emails.send({
              from: fromEmail,
              to: empRecord.email,
              subject: 'Your Employment Has Been Terminated — Document Access Notice',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                  <div style="background: #1a1f3c; padding: 24px; text-align: center;">
                    <h1 style="color: #f4c430; margin: 0; font-size: 22px;">${PLATFORM.name}</h1>
                    <p style="color: #aaa; margin: 8px 0 0; font-size: 14px;">Workforce Management Platform</p>
                  </div>
                  <div style="padding: 32px 24px; background: #fff; border: 1px solid #e5e7eb;">
                    <p style="font-size: 16px; color: #333;">Dear ${employeeName},</p>
                    <p>We are writing to inform you that your employment has been formally terminated as of <strong>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.</p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                    <h2 style="font-size: 16px; color: #1a1f3c; margin-bottom: 8px;">Your Document Access Window</h2>
                    <p>You will retain <strong>read-only access</strong> to your employment records — including pay stubs, schedules, and documents — until:</p>
                    <div style="background: #f4f4f8; border-left: 4px solid #f4c430; padding: 12px 16px; margin: 16px 0; font-size: 18px; font-weight: bold; color: #1a1f3c;">
                      ${expiryDateStr}
                    </div>
                    <p style="color: #555; font-size: 14px;">After this date, your account will be fully deactivated and you will no longer be able to access the platform. We strongly recommend downloading any records you may need before this date.</p>
                    <p>During your access window, you may <strong>view and download</strong>:</p>
                    <ul style="color: #555; font-size: 14px; line-height: 1.8;">
                      <li>Pay stubs and payroll history</li>
                      <li>Work schedules and shift records</li>
                      <li>Employment documents on file</li>
                      <li>Time and attendance records</li>
                    </ul>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                    <p style="font-size: 13px; color: #999;">If you believe this termination was made in error or have questions about your final paycheck, please contact your HR administrator or manager immediately.</p>
                    <p style="font-size: 13px; color: #999;">This is an automated message. Please do not reply to this email.</p>
                  </div>
                  <div style="background: #f4f4f8; padding: 16px 24px; text-align: center; font-size: 12px; color: #999;">
                    <p style="margin: 0;">${PLATFORM.name} Workforce Management &bull; This message was sent to ${empRecord.email}</p>
                  </div>
                </div>
              `,
            });
            log.info(`[Termination] Termination email sent to ${empRecord.email}`);
          } catch (emailErr: unknown) {
            log.error('[terminationRoutes] Termination email send failed (non-blocking):', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
          }
        }
      } catch (graceErr: unknown) {
        log.error('[terminationRoutes] Grace period / email setup failed (non-blocking):', (graceErr instanceof Error ? graceErr.message : String(graceErr)));
      }
    }

    // ── 2c. EQUIPMENT RETURN CHECKLIST — flag unreturned equipment ──────────────
    let equipmentChecklist: { itemName: string; assignmentId: string; checkoutDate: string }[] = [];
    if (employeeId) {
      try {
        const unreturnedResult = await db.$client.query(
          `SELECT ea.id AS assignment_id, ei.name AS item_name, ea.checkout_date
           FROM equipment_assignments ea
           JOIN equipment_items ei ON ei.id = ea.equipment_item_id
           WHERE ea.employee_id = $1 AND ea.workspace_id = $2 AND ea.actual_return_date IS NULL`,
          [employeeId, workspace.id]
        );

        interface EquipmentChecklistRow { item_name: string; assignment_id: string; checkout_date: string | null; }
        const rows: EquipmentChecklistRow[] = unreturnedResult.rows;
        if (rows.length > 0) {
          equipmentChecklist = rows.map((r) => ({
            itemName: r.item_name,
            assignmentId: r.assignment_id,
            checkoutDate: r.checkout_date ? new Date(r.checkout_date).toISOString() : '',
          }));

          const checklistText = equipmentChecklist
            .map((item, idx) => `${idx + 1}. ${item.itemName} (assigned ${item.checkoutDate ? new Date(item.checkoutDate).toLocaleDateString() : 'N/A'})`)
            .join('; ');

          const noteAppend = `[EQUIPMENT CHECKLIST] ${equipmentChecklist.length} unreturned item(s) at termination: ${checklistText}`;

          await db.$client.query(
            `UPDATE employee_terminations
             SET notes = COALESCE(notes, '') || $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND workspace_id = $3`,
            ['\n' + noteAppend, id, workspace.id]
          );

          log.info(`[Termination] Equipment checklist generated: ${equipmentChecklist.length} unreturned item(s) for employee ${employeeId}`);
        } else {
          log.info(`[Termination] No unreturned equipment for employee ${employeeId}`);
        }
      } catch (equipErr: unknown) {
        log.error('[terminationRoutes] Equipment checklist generation failed (non-blocking):', (equipErr instanceof Error ? equipErr.message : String(equipErr)));
      }
    }

    // ── 3. FINAL TIMESHEET LOCK — lock all open time entries for supervisor review
    let lockedTimesheetEntries = 0;
    if (employeeId) {
      try {
        const { db } = await import('../db');
        const { timeEntries } = await import('@shared/schema');
        const { eq, and, sql: drizzleSql } = await import('drizzle-orm');

        const lockResult = await db.update(timeEntries)
          .set({ status: 'pending_approval', notes: `[FINAL] Locked on termination ${new Date().toISOString()} — requires supervisor approval` } as any)
          .where(and(
            eq(timeEntries.employeeId, employeeId),
            drizzleSql`${timeEntries.status} IN ('pending', 'in_progress', 'clocked_in')`
          ))
          .returning({ id: timeEntries.id });

        lockedTimesheetEntries = lockResult.length;

        if (lockedTimesheetEntries > 0) {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
          await universalAuditService.log({
            workspaceId: workspace.id,
            actorId: actorUserId || 'system',
            actorType: 'user',
            action: AUDIT_ACTIONS.EMPLOYEE_TIMESHEET_LOCKED,
            entityType: 'employee',
            entityId: employeeId,
            changeType: 'action',
            changes: { timesheetLocked: { old: 'open', new: 'pending_approval' } },
            metadata: { terminationId: id, lockedEntries: lockedTimesheetEntries, reason: 'termination_final_lock' },
            sourceRoute: 'PATCH /terminations/:id/complete',
          });
          log.info(`[Termination] Locked ${lockedTimesheetEntries} open time entries for final approval`);
        }
      } catch (timesheetErr: unknown) {
        log.error('[terminationRoutes] Timesheet lock failed (non-blocking):', (timesheetErr instanceof Error ? timesheetErr.message : String(timesheetErr)));
      }
    }

    // ── 4. FINAL PAYCHECK STAGING ────────────────────────────────────────────
    if (employeeId) {
      try {
        const { db } = await import('../db');
        const { sql: drizzleSql } = await import('drizzle-orm');

        await db.execute(drizzleSql`
          INSERT INTO payroll_staging (
            id, workspace_id, employee_id, pay_period_start, pay_period_end,
            status, notes, created_at, updated_at
          )
          SELECT
            gen_random_uuid()::text,
            ${workspace.id},
            ${employeeId},
            (CURRENT_DATE - INTERVAL '30 days')::timestamp,
            CURRENT_TIMESTAMP,
            'pending_final_approval',
            ${'Final paycheck staged on termination — cannot process until supervisor approves final timesheet'},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          WHERE NOT EXISTS (
            SELECT 1 FROM payroll_staging
            WHERE employee_id = ${employeeId}
            AND workspace_id = ${workspace.id}
            AND status = 'pending_final_approval'
          )
        `);

        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
        await universalAuditService.log({
          workspaceId: workspace.id,
          actorId: actorUserId || 'system',
          actorType: 'user',
          action: AUDIT_ACTIONS.EMPLOYEE_FINAL_PAYCHECK_STAGED,
          entityType: 'employee',
          entityId: employeeId,
          changeType: 'create',
          metadata: { terminationId: id, status: 'pending_final_approval', reason: 'termination_final_paycheck' },
          sourceRoute: 'PATCH /terminations/:id/complete',
        });
        log.info(`[Termination] Final paycheck staged for employee ${employeeId}`);
      } catch (paycheckErr: unknown) {
        log.warn('[terminationRoutes] Payroll staging table may not exist yet (non-blocking):', (paycheckErr instanceof Error ? paycheckErr.message : String(paycheckErr)));
      }
    }

    // ── 5. STRUCTURED TERMINATION AUDIT RECORD ───────────────────────────────
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
      await universalAuditService.log({
        workspaceId: workspace.id,
        actorId: actorUserId || 'system',
        actorType: 'user',
        action: AUDIT_ACTIONS.EMPLOYEE_TERMINATED,
        entityType: 'employee',
        entityId: employeeId || id,
        changeType: 'action',
        changes: {
          status: { old: 'active', new: 'terminated' },
          isActive: { old: true, new: false },
        },
        metadata: {
          terminationId: id,
          terminationType: completed.terminationType,
          terminationDate: completed.terminationDate,
          reason: completed.reason || completed.terminationType,
          shiftsRemovedCount: affectedShiftCount,
          timesheetEntriesLocked: lockedTimesheetEntries,
          sessionInvalidated: true,
          finalPaycheckStaged: true,
        },
        sourceRoute: 'PATCH /terminations/:id/complete',
      });
    } catch (auditErr: unknown) {
      log.error('[terminationRoutes] Structured audit write failed (non-blocking):', (auditErr instanceof Error ? auditErr.message : String(auditErr)));
    }

    // ── 6. PLATFORM EVENT ────────────────────────────────────────────────────
    platformEventBus.publish({
      type: 'employee_terminated',
      category: 'automation',
      title: 'Employee Terminated',
      description: `Employee termination ${id} completed in workspace ${workspace.id}`,
      workspaceId: workspace.id,
      metadata: {
        terminationId: id,
        employeeId: completed.employeeId,
        terminationType: completed.terminationType,
        terminationDate: completed.terminationDate,
        shiftsRemovedCount: affectedShiftCount,
        timesheetEntriesLocked: lockedTimesheetEntries,
        sessionInvalidated: true,
        finalPaycheckStaged: true,
      },
    }).catch((err: unknown) => log.error('[terminationRoutes] publish employee_terminated failed:', err instanceof Error ? err.message : String(err)));

    // ── 7. WEBHOOK EMISSION ──────────────────────────────────────────────────
    try {
      const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
      deliverWebhookEvent(workspace.id, 'officer.terminated', {
        officerId: completed.employeeId,
        terminationId: id,
        terminationType: completed.terminationType,
        terminationDate: completed.terminationDate,
        effectiveAt: new Date().toISOString()
      });
    } catch (webhookErr: unknown) {
      log.error('[terminationRoutes] Webhook emission failed:', (webhookErr instanceof Error ? webhookErr.message : String(webhookErr)));
    }

    res.json({
      ...completed,
      lifecycle: {
        shiftsRemovedCount: affectedShiftCount,
        timesheetEntriesLocked: lockedTimesheetEntries,
        sessionInvalidated: true,
        finalPaycheckStaged: true,
        equipmentChecklistItems: equipmentChecklist.length,
        equipmentChecklist,
      },
    });
  } catch (error: unknown) {
    log.error("Error completing termination:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to complete termination" });
  }
});

export default router;
