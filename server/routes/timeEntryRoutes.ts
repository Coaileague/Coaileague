import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireManager, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { createFilterContext, canViewPayRates } from "../utils/sensitiveFieldFilter";
import { db } from "../db";
import {
  timeEntries as timeEntriesTable,
  employees,
  stagedShifts,
  clients,
  insertTimeEntrySchema
} from '@shared/schema';
import { eq, and, desc, gte, lte, inArray, sql, isNull, or, lt } from "drizzle-orm";
import { z } from "zod";
import { notifyTimesheetRejected } from "../services/automation/notificationEventCoverage";
import { platformEventBus } from "../services/platformEventBus";
import { typedPoolExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('TimeEntryRoutes');


const router = Router();

  router.get('/export/csv', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const workspaceId = workspace.id;
      const { startDate, endDate, clientId } = req.query;

      let query = db.select().from(timeEntriesTable).where(eq(timeEntriesTable.workspaceId, workspaceId));

      const entries = await query.orderBy(desc(timeEntriesTable.clockIn));

      // Generate CSV — pay rate columns are owner-only
      const ctx = createFilterContext(req);
      const showPayRates = canViewPayRates(ctx);
      const csvHeader = showPayRates
        ? 'Employee ID,Client ID,Clock In,Clock Out,Total Hours,Hourly Rate,Total Amount,Status,Billable\n'
        : 'Employee ID,Client ID,Clock In,Clock Out,Total Hours,Status,Billable\n';
      const csvRows = entries.map((e: any) => {
        const base = `${e.employeeId},${e.clientId || ''},${format(new Date(e.clockIn), 'yyyy-MM-dd HH:mm')},${e.clockOut ? format(new Date(e.clockOut), 'yyyy-MM-dd HH:mm') : ''},${e.totalHours || ''}`;
        if (showPayRates) {
          return `${base},${e.hourlyRate || ''},${e.totalAmount || ''},${e.status || 'pending'},${e.billableToClient ? 'Yes' : 'No'}`;
        }
        return `${base},${e.status || 'pending'},${e.billableToClient ? 'Yes' : 'No'}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="time-entries-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
      res.send(csvHeader + csvRows);
    } catch (error: unknown) {
      log.error("Error exporting time entries CSV:", error);
      res.status(500).json({ message: "Failed to export time entries" });
    }
  });

  router.get('/', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);
      const offset = (page - 1) * limit;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(timeEntriesTable)
        .where(eq(timeEntriesTable.workspaceId, workspace.id));
      
      const total = countResult?.count || 0;

      const entries = await storage.getTimeEntriesByWorkspace(workspace.id, limit, offset);

      res.set('X-Total-Count', String(total));

      res.json({
        data: entries,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      log.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  router.post('/', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const validated = insertTimeEntrySchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      // OVERLAP PREVENTION: Atomic check + insert using advisory lock per employee
      const overlapOrEntry = await db.transaction(async (tx) => {
        if (validated.employeeId && validated.clockIn) {
          // Advisory lock keyed on employee ID to serialize time entry creation per employee
          const empLockKey = `time_entry:${validated.employeeId}`;
          const empLockHash = Array.from(empLockKey).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${empLockHash})`);

          const clockInTime = new Date(validated.clockIn);
          const clockOutTime = validated.clockOut ? new Date(validated.clockOut) : null;

          const overlapConditions: any[] = [
            eq(timeEntriesTable.workspaceId, workspace.id),
            eq(timeEntriesTable.employeeId, validated.employeeId),
          ];

          if (clockOutTime) {
            overlapConditions.push(
              sql`${timeEntriesTable.clockIn} < ${clockOutTime}`,
              or(
                isNull(timeEntriesTable.clockOut),
                sql`${timeEntriesTable.clockOut} > ${clockInTime}`
              )!
            );
          } else {
            overlapConditions.push(
              or(
                isNull(timeEntriesTable.clockOut),
                sql`${timeEntriesTable.clockOut} > ${clockInTime}`
              )!
            );
          }

          const [overlap] = await tx.select({ id: timeEntriesTable.id })
            .from(timeEntriesTable)
            .where(and(...overlapConditions))
            .limit(1);

          if (overlap) {
            return { overlapping: true, conflictId: overlap.id } as const;
          }
        }

        const [entry] = await tx.insert(timeEntriesTable)
          .values(validated as any)
          .returning();
        return { overlapping: false, entry } as const;
      });

      if (overlapOrEntry.overlapping) {
        return res.status(409).json({
          message: "This time entry overlaps with an existing entry for this employee",
          code: 'OVERLAPPING_TIME_ENTRY',
          conflictingEntryId: overlapOrEntry.conflictId,
        });
      }

      const entry = overlapOrEntry.entry;

      // Fetch officer name for CAD — employee[0] is not in scope in this handler
      const [officerRecord] = await db
        .select({ firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, validated.employeeId!))
        .limit(1);
      const officerName = officerRecord
        ? `${officerRecord.firstName} ${officerRecord.lastName}`
        : validated.employeeId!;

      // GPS from request body — gpsLatitude/gpsLongitude are not declared in this scope
      const cadLatitude = req.body.latitude != null ? parseFloat(req.body.latitude) : undefined;
      const cadLongitude = req.body.longitude != null ? parseFloat(req.body.longitude) : undefined;

      // Auto-provision CAD Unit when officer clocks in
      try {
        const { autoProvisionCADUnit } = await import('../services/officerStatusService');
        await autoProvisionCADUnit(
          validated.employeeId!,
          officerName,
          workspace.id,
          validated.shiftId || null,
          validated.siteId || null,
          undefined,
          cadLatitude,
          cadLongitude
        );
      } catch (cadErr: unknown) {
        log.error("[Clock-In] CAD auto-provision failed:", cadErr.message);
      }

      broadcastToWorkspace(workspace.id, { type: 'time_entries_updated', data: { action: 'updated' } });
      res.json(entry);
    } catch (error: unknown) {
      log.error("Error creating time entry:", error);
      res.status(400).json({ message: "Failed to create time entry" });
    }
  });

  router.patch('/:id/approve', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const timeEntry = await storage.getTimeEntry(req.params.id, workspaceId);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // Prevent self-approval
      const employee = await db.select().from(employees).where(
        and(
          eq(employees.id, timeEntry.employeeId),
          eq(employees.workspaceId, workspaceId)
        )
      ).limit(1);

      if (employee.length > 0 && employee[0].userId === userId) {
        return res.status(403).json({ message: "Cannot approve your own time entries" });
      }

      if (timeEntry.status !== 'pending') {
        return res.status(409).json({ message: `Cannot approve entry with status '${timeEntry.status}'` });
      }

      const [updated] = await db
        .update(timeEntriesTable)
        .set({
          status: 'approved',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(timeEntriesTable.id, req.params.id),
            eq(timeEntriesTable.workspaceId, workspaceId),
            eq(timeEntriesTable.status, 'pending')
          )
        )
        .returning();

      if (!updated) {
        return res.status(409).json({ message: "Time entry was already processed by another request" });
      }

      broadcastToWorkspace(workspaceId, { type: 'time_entries_updated', data: { action: 'updated' } });

      // Fire automation event — triggers invoice creation + payroll processing pipeline
      platformEventBus.publish({
        type: 'time_entries_approved',
        workspaceId,
        payload: { count: 1, entryIds: [updated.id], approvedBy: userId },
        metadata: { source: 'timeEntryRoutes.single_approve' },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.json(updated);
    } catch (error: unknown) {
      log.error("Error approving time entry:", error);
      res.status(500).json({ message: "Failed to approve time entry" });
    }
  });

  router.patch('/:id/reject', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { reason } = req.body;
      
      const timeEntry = await storage.getTimeEntry(req.params.id, workspaceId);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // Prevent self-rejection
      const employee = await db.select().from(employees).where(
        and(
          eq(employees.id, timeEntry.employeeId),
          eq(employees.workspaceId, workspaceId)
        )
      ).limit(1);

      if (employee.length > 0 && employee[0].userId === userId) {
        return res.status(403).json({ message: "Cannot reject your own time entries" });
      }

      const [updated] = await db
        .update(timeEntriesTable)
        .set({
          status: 'rejected',
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: reason,
          notes: reason ? `Rejected: ${reason}` : timeEntry.notes,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(timeEntriesTable.id, req.params.id),
            eq(timeEntriesTable.workspaceId, workspaceId),
            eq(timeEntriesTable.status, 'pending')
          )
        )
        .returning();

      if (!updated) {
        return res.status(409).json({ message: "Time entry has already been processed" });
      }

      broadcastToWorkspace(workspaceId, { type: 'time_entries_updated', data: { action: 'updated' } });

      const rejectorName = req.user?.fullName || 'a manager';
      notifyTimesheetRejected({
        workspaceId,
        timeEntryId: req.params.id,
        employeeId: timeEntry.employeeId,
        rejectedByName: rejectorName,
        reason,
        date: timeEntry.clockIn ? new Date(timeEntry.clockIn).toLocaleDateString() : undefined,
      }).catch(err => log.error('[TimeEntryRoutes] Notification error:', err));

      res.json(updated);
    } catch (error: unknown) {
      log.error("Error rejecting time entry:", error);
      res.status(500).json({ message: "Failed to reject time entry" });
    }
  });

  router.get('/pending', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId, clientId, startDate, endDate, hasGps, hasPhoto } = req.query;

      // Build query with filters
      let query = db
        .select({
          timeEntry: timeEntriesTable,
          employee: employees,
          client: clients,
        })
        .from(timeEntriesTable)
        .leftJoin(employees, eq(timeEntriesTable.employeeId, employees.id))
        .leftJoin(clients, eq(timeEntriesTable.clientId, clients.id))
        .where(
          and(
            eq(timeEntriesTable.workspaceId, workspaceId),
            eq(timeEntriesTable.status, 'pending'),
            employeeId ? eq(timeEntriesTable.employeeId, employeeId as string) : undefined,
            clientId ? eq(timeEntriesTable.clientId, clientId as string) : undefined,
            startDate ? gte(timeEntriesTable.clockIn, new Date(startDate as string)) : undefined,
            endDate ? lte(timeEntriesTable.clockIn, new Date(endDate as string)) : undefined
          )
        )
        .orderBy(desc(timeEntriesTable.clockIn));

      const results = await query;

      // Filter by verification status if requested
      let filtered = results;
      if (hasGps === 'true') {
        filtered = filtered.filter(r => r.timeEntry.clockInLatitude !== null);
      }
      if (hasPhoto === 'true') {
        filtered = filtered.filter(r => r.timeEntry.clockInPhotoUrl !== null);
      }

      res.json(filtered);
    } catch (error: unknown) {
      log.error("Error fetching pending time entries:", error);
      res.status(500).json({ message: "Failed to fetch pending time entries" });
    }
  });

  router.post('/bulk-approve', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { timeEntryIds } = req.body;

      if (!Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
        return res.status(400).json({ message: "timeEntryIds must be a non-empty array" });
      }

      // Prevent self-approval: get all employee IDs for the time entries
      const entries = await db
        .select()
        .from(timeEntriesTable)
        .where(
          and(
            eq(timeEntriesTable.workspaceId, workspaceId),
            inArray(timeEntriesTable.id, timeEntryIds)
          )
        );

      const employeeIds = [...new Set(entries.map(e => e.employeeId))];
      
      // Check if any of these employees are the current user
      const userEmployees = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, workspaceId),
            eq(employees.userId, userId),
            inArray(employees.id, employeeIds)
          )
        );

      if (userEmployees.length > 0) {
        return res.status(403).json({ 
          message: "Cannot approve your own time entries",
          selfApprovalCount: userEmployees.length
        });
      }

      // Bulk approve all valid entries
      const updated = await db
        .update(timeEntriesTable)
        .set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(timeEntriesTable.workspaceId, workspaceId),
            inArray(timeEntriesTable.id, timeEntryIds),
            eq(timeEntriesTable.status, 'pending') // Only approve pending entries
          )
        )
        .returning();

      broadcastToWorkspace(workspaceId, { type: 'time_entries_updated', data: { action: 'updated' } });

      // Audit trail: log bulk approval as a single event with all entry IDs (Phase 10 requirement)
      if (updated.length > 0) {
        try {
          await storage.createAuditLog({
            workspaceId,
            userId,
            action: 'bulk_approve',
            entityType: 'time_entry',
            entityId: updated[0].id,
            description: `Bulk approved ${updated.length} time entr${updated.length === 1 ? 'y' : 'ies'}`,
            metadata: {
              entryIds: updated.map(e => e.id),
              count: updated.length,
              approvedBy: userId,
              source: 'timeEntryRoutes.bulk_approve',
            },
          });
        } catch (auditErr: unknown) {
          log.warn('[TimeEntry] Bulk approve audit log failed (non-blocking):', auditErr.message);
        }

        // Fire automation event — triggers invoice creation + payroll processing pipeline
        platformEventBus.publish({
          type: 'time_entries_approved',
          workspaceId,
          payload: { count: updated.length, entryIds: updated.map(e => e.id), approvedBy: userId },
          metadata: { source: 'timeEntryRoutes.bulk_approve' },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }

      const gpsWarnings = updated
        .filter(e => !e.clockInLatitude && !e.clockInLongitude)
        .map(e => e.id);

      res.json({
        approved: updated.length,
        entries: updated,
        gpsWarnings: gpsWarnings.length > 0
          ? {
              count: gpsWarnings.length,
              entryIds: gpsWarnings,
              message: `${gpsWarnings.length} approved entr${gpsWarnings.length === 1 ? 'y' : 'ies'} had no GPS coordinates. Manager review recommended before payroll run.`,
            }
          : null,
      });
    } catch (error: unknown) {
      log.error("Error bulk approving time entries:", error);
      res.status(500).json({ message: "Failed to bulk approve time entries" });
    }
  });

  router.get('/post-order-quiz/:shiftId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      const { postOrderQuizService } = await import('../services/fieldOperations/postOrderQuizService');
      const quiz = await postOrderQuizService.getQuizForShift(req.params.shiftId, workspace.id);
      if (!quiz) return res.json({ required: false, quiz: null });

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) return res.status(403).json({ message: "No employee record" });

      const alreadyPassed = await postOrderQuizService.hasPassedQuiz(req.params.shiftId, employee.id, workspace.id);
      res.json({ required: !alreadyPassed, quiz: alreadyPassed ? null : quiz });
    } catch (error: unknown) {
      log.error("Error fetching post-order quiz:", error);
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  router.post('/post-order-quiz/:shiftId/submit', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) return res.status(403).json({ message: "No employee record" });

      const { postOrderQuizService } = await import('../services/fieldOperations/postOrderQuizService');
      const result = await postOrderQuizService.validateQuizAnswers(
        req.params.shiftId, workspace.id, employee.id, req.body.answers || {}
      );

      res.json(result);
    } catch (error: unknown) {
      log.error("Error submitting post-order quiz:", error);
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  router.post('/gps-ping', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) return res.status(403).json({ message: "No employee record" });

      const { latitude, longitude, accuracy } = req.body;
      if (!latitude || !longitude) return res.status(400).json({ message: "GPS coordinates required" });

      const [activeEntry] = await db.select({ id: timeEntriesTable.id })
        .from(timeEntriesTable)
        .where(and(
          eq(timeEntriesTable.workspaceId, workspace.id),
          eq(timeEntriesTable.employeeId, employee.id),
          isNull(timeEntriesTable.clockOut)
        ))
        .limit(1);

      if (!activeEntry) return res.status(404).json({ message: "No active clock-in session" });

      await db.update(timeEntriesTable)
        .set({ lastGpsPingAt: new Date(), lastGpsPingLat: latitude, lastGpsPingLng: longitude })
        .where(eq(timeEntriesTable.id, activeEntry.id));

      res.json({ success: true, pingedAt: new Date().toISOString() });
    } catch (error: unknown) {
      log.error("Error processing GPS ping:", error);
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  router.post('/manual-override', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) return res.status(403).json({ message: "No employee record" });

      const { shiftId, siteId, siteName, reasonCode, reasonDetail } = req.body;
      const validReasonCodes = ["vehicle_breakdown","signal_loss","reassigned_site","emergency_response","other"];
      
      if (!reasonCode || !validReasonCodes.includes(reasonCode)) {
        return res.status(400).json({ message: "Valid reasonCode required" });
      }
      if (!reasonDetail) {
        return res.status(400).json({ message: "reasonDetail required" });
      }

      const id = (await import('crypto')).randomUUID();
      const employeeName = `${employee.firstName} ${employee.lastName || ''}`.trim();

      // CATEGORY C — Genuine schema mismatch: employee_name, site_id, site_name, reason_code, reason_detail columns not in Drizzle schema for manual_clockin_overrides
      await typedPoolExec(
        `INSERT INTO manual_clockin_overrides (id, workspace_id, employee_id, employee_name, shift_id, site_id, site_name, reason_code, reason_detail, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
        [id, workspace.id, employee.id, employeeName, shiftId||null, siteId||null, siteName||null, reasonCode, reasonDetail]);
      
      const { platformEventBus } = await import('../services/platformEventBus');
      await platformEventBus.publish({
        type: 'manual_override_submitted',
        category: 'ai_brain',
        title: 'Manual Clock-In Override',
        description: `Officer ${employeeName} submitted a manual override: ${reasonCode}`,
        workspaceId: workspace.id,
        metadata: { employeeId: employee.id, employeeName, shiftId, siteId, siteName, reasonCode, reasonDetail }
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.status(201).json({ id, message: "Override submitted — supervisor notified." });
    } catch (error: unknown) {
      log.error("Error processing manual override:", error);
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  router.patch('/:id/clock-out', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const timeEntry = await storage.getTimeEntry(req.params.id, workspace.id);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // D6-GAP-FIX: Guard against clock-out on an already-closed time entry.
      // Without this check an officer could call clock-out twice, overwriting the
      // original clock-out time and corrupting total hours / total amount.
      if (timeEntry.clockOut) {
        return res.status(409).json({
          message: "Already clocked out. This shift has already ended.",
          code: 'ALREADY_CLOCKED_OUT',
          clockOutAt: timeEntry.clockOut,
        });
      }

      // GEO-COMPLIANCE: Capture IP address from request
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection.remoteAddress;
      
      // GEO-COMPLIANCE: Extract GPS coordinates from request
      const { gpsLatitude, gpsLongitude, gpsAccuracy } = req.body;
      
      // Validate GPS accuracy (must be <= 50m for compliance)
      if (gpsAccuracy && parseFloat(gpsAccuracy) > 50) {
        return res.status(400).json({ 
          message: "GPS accuracy too low. Please ensure location services are enabled and try again in an area with better signal.",
          requiredAccuracy: 50,
          currentAccuracy: gpsAccuracy
        });
      }

      const clockOut = new Date();
      const clockIn = new Date(timeEntry.clockIn);
      const totalHours = ((clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2);
      
      const hourlyRate = timeEntry.hourlyRate || "0";
      const totalAmount = (parseFloat(totalHours) * parseFloat(hourlyRate as string)).toFixed(2);

      const updated = await storage.updateTimeEntry(req.params.id, workspace.id, {
        clockOut: clockOut.toISOString(),
        totalHours,
        totalAmount,
        clockOutIpAddress: ipAddress,
        clockOutLatitude: gpsLatitude,
        clockOutLongitude: gpsLongitude,
        clockOutAccuracy: gpsAccuracy,
      });

      // GEO-COMPLIANCE: Detect IP anomaly (different IP between clock-in and clock-out)
      if (timeEntry.clockInIpAddress && ipAddress) {
        await GeoComplianceService.detectIPAnomaly(
          req.params.id,
          workspace.id,
          timeEntry.employeeId,
          timeEntry.clockInIpAddress,
          ipAddress
        );
      }

      broadcastToWorkspace(workspace.id, { type: 'time_entries_updated', data: { action: 'updated' } });

      // Dual-emit law: clock-out is a significant workforce event Trinity must hear
      platformEventBus.publish({
        type: 'officer_clocked_out',
        category: 'schedule',
        title: 'Officer Clocked Out',
        description: `Officer clocked out — ${totalHours}h logged`,
        workspaceId: workspace.id,
        userId,
        metadata: {
          timeEntryId: req.params.id,
          employeeId: timeEntry.employeeId,
          shiftId: timeEntry.shiftId,
          totalHours: parseFloat(totalHours),
          totalAmount: parseFloat(totalAmount),
          clockOut: clockOut.toISOString(),
        },
        visibility: 'supervisor',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.json(updated);
    } catch (error: unknown) {
      log.error("Error clocking out:", error);
      res.status(400).json({ message: "Failed to clock out" });
    }
  });

  router.post('/:id/start-break', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const timeEntry = await storage.getTimeEntry(req.params.id, workspace.id);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      if (timeEntry.clockOut) {
        return res.status(400).json({ message: "Cannot start break on a completed time entry" });
      }

      if (timeEntry.status !== 'active') {
        return res.status(400).json({ message: `Cannot start break — time entry status is '${timeEntry.status}', must be 'active'` });
      }

      const { breakType } = req.body;
      const updated = await storage.updateTimeEntry(req.params.id, workspace.id, {
        status: 'on_break',
        breakStartTime: new Date().toISOString(),
        breakType: breakType || 'rest',
      });

      broadcastToWorkspace(workspace.id, { type: 'time_entries_updated', data: { action: 'updated' } });
      res.json(updated);
    } catch (error: unknown) {
      log.error("Error starting break:", error);
      res.status(400).json({ message: "Failed to start break" });
    }
  });

  router.post('/:id/end-break', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const timeEntry = await storage.getTimeEntry(req.params.id, workspace.id);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      const breakEnd = new Date();
      const breakStart = timeEntry.breakStartTime ? new Date(timeEntry.breakStartTime) : breakEnd;
      const breakMinutes = Math.round((breakEnd.getTime() - breakStart.getTime()) / (1000 * 60));
      const existingBreakMinutes = parseInt(String(timeEntry.totalBreakMinutes || '0'), 10);

      const updated = await storage.updateTimeEntry(req.params.id, workspace.id, {
        status: 'active',
        breakEndTime: breakEnd.toISOString(),
        totalBreakMinutes: String(existingBreakMinutes + breakMinutes),
      });

      broadcastToWorkspace(workspace.id, { type: 'time_entries_updated', data: { action: 'updated' } });
      res.json(updated);
    } catch (error: unknown) {
      log.error("Error ending break:", error);
      res.status(400).json({ message: "Failed to end break" });
    }
  });

  router.get('/unbilled/:clientId', requireAuth, async (req: any, res) => {


    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = req.workspaceId ? { id: req.workspaceId } : (await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId));
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const unbilledEntries = await storage.getUnbilledTimeEntries(workspace.id, req.params.clientId);
      res.json(unbilledEntries);
    } catch (error) {
      log.error("Error fetching unbilled time entries:", error);
      res.status(500).json({ message: "Failed to fetch unbilled time entries" });
    }
  });

router.post("/calculate-hours", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, startDate, endDate } = req.body;
    if (!employeeId || !startDate || !endDate) return res.status(400).json({ error: 'employeeId, startDate, endDate required' });

    const hours = await calculatePayrollHours(employeeId, new Date(startDate), new Date(endDate));
    res.json({ success: true, data: hours });
  } catch (error: unknown) {
    log.error('Error calculating payroll hours:', error);
    res.status(500).json({ error: "An internal error occurred" });
  }
});

export default router;
