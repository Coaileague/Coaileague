import { z } from 'zod';
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db, pool } from "../db";
import {
  equipmentItems,
  equipmentAssignments,
  equipmentMaintenanceLogs,
  insertEquipmentItemSchema,
  insertEquipmentAssignmentSchema,
  insertEquipmentMaintenanceLogSchema,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { tokenManager } from "../services/billing/tokenManager";
import type { PoolClient } from "pg";
import { createLogger } from '../lib/logger';
const log = createLogger('EquipmentRoutes');


async function findOrCreateDraftPayrollRun(
  client: PoolClient,
  workspaceId: string
): Promise<string> {
  const existingRun = await client.query(
    `SELECT id FROM payroll_runs
     WHERE workspace_id = $1 AND status = 'draft'
     ORDER BY period_end DESC LIMIT 1`,
    [workspaceId]
  );
  if (existingRun.rows.length > 0) {
    return existingRun.rows[0].id;
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const newRun = await client.query(
    `INSERT INTO payroll_runs (id, workspace_id, period_start, period_end, status, run_type, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'draft', 'regular', NOW(), NOW())
     ON CONFLICT ON CONSTRAINT uq_payroll_runs_workspace_period DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [workspaceId, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return newRun.rows[0].id;
}

async function findOrCreatePayrollEntryForDeduction(
  client: PoolClient,
  employeeId: string,
  workspaceId: string
): Promise<string> {
  const openEntry = await client.query(
    `SELECT pe.id FROM payroll_entries pe
     JOIN payroll_runs pr ON pe.payroll_run_id = pr.id
     WHERE pe.employee_id = $1 AND pe.workspace_id = $2
       AND pr.status IN ('draft', 'pending', 'processing')
     ORDER BY pr.period_end DESC LIMIT 1`,
    [employeeId, workspaceId]
  );
  if (openEntry.rows.length > 0) {
    return openEntry.rows[0].id;
  }

  const payrollRunId = await findOrCreateDraftPayrollRun(client, workspaceId);
  const newEntry = await client.query(
    `INSERT INTO payroll_entries (id, payroll_run_id, employee_id, workspace_id, hourly_rate, notes, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, '0.00', 'Auto-created for equipment deduction', NOW(), NOW())
     RETURNING id`,
    [payrollRunId, employeeId, workspaceId]
  );
  return newEntry.rows[0].id;
}

const VALID_CONDITIONS = ["new", "excellent", "good", "fair", "poor", "damaged"] as const;

const router = Router();

async function listEquipmentItems(req: import("express").Request, res: import("express").Response) {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });
    const items = await db.select().from(equipmentItems).where(eq(equipmentItems.workspaceId, workspaceId)).orderBy(desc(equipmentItems.createdAt));
    res.json(items);
  } catch (error: unknown) {
    log.error("Error fetching equipment items:", error);
    res.status(500).json({ error: "Failed to fetch equipment items" });
  }
}

async function createEquipmentItem(req: import("express").Request, res: import("express").Response) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to add equipment" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });
    // Tier-2 Zod guard: passthrough strip avoids prototype pollution
    const validated = insertEquipmentItemSchema.parse({ ...req.body, workspaceId });
    const [item] = await db.insert(equipmentItems).values(validated).returning();
    res.status(201).json(item);
  } catch (error: unknown) {
    log.error("Error creating equipment item:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create equipment item" });
  }
}

router.get("/", listEquipmentItems);
router.post("/", createEquipmentItem);

async function processEquipmentAssignment(req: import("express").Request, res: import("express").Response) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to assign equipment" });
    }
    const workspaceId = authReq.workspaceId;
    const userId = authReq.user?.id;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    if (req.body.conditionAtCheckout && !VALID_CONDITIONS.includes(req.body.conditionAtCheckout)) {
      return res.status(400).json({ error: `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(', ')}` });
    }

    const validated = insertEquipmentAssignmentSchema.parse({ ...req.body, workspaceId, assignedBy: userId });
    const [assignment] = await db.insert(equipmentAssignments).values(validated).returning();
    await db.update(equipmentItems).set({ status: "assigned", updatedAt: new Date() })
      .where(and(eq(equipmentItems.id, validated.equipmentItemId), eq(equipmentItems.workspaceId, workspaceId)));

    tokenManager.recordUsage({
      workspaceId, userId: userId || 'system', featureKey: 'equipment_checkout',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      featureName: 'Equipment Checkout', description: `Equipment item ${validated.equipmentItemId} checked out`,
      amountOverride: 1, relatedEntityType: 'equipment_assignment', relatedEntityId: assignment.id,
    }).catch((err: Error) => { log.error('[Equipment] Checkout credit deduction failed (non-blocking):', err.message); });

    res.status(201).json(assignment);
  } catch (error: unknown) {
    log.error("Error assigning equipment:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to assign equipment" });
  }
}

router.post("/:id/assign", (req, res) => {
  req.body.equipmentItemId = req.body.equipmentItemId || req.params.id;
  processEquipmentAssignment(req, res);
});

async function processEquipmentReturn(
  assignmentId: string,
  workspaceId: string,
  userId: string,
  condition: string,
  notes?: string,
  deductionAmount?: number
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkResult = await client.query(
      `SELECT id, actual_return_date, is_lost, equipment_item_id, employee_id FROM equipment_assignments WHERE id = $1 AND workspace_id = $2`,
      [assignmentId, workspaceId]
    );
    if (checkResult.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    const existing = checkResult.rows[0];
    if (existing.actual_return_date) { await client.query('ROLLBACK'); return { _alreadyReturned: true }; }
    if (existing.is_lost) { await client.query('ROLLBACK'); return { _isLost: true }; }

    const itemLookup = await client.query(
      `SELECT purchase_cost, name FROM equipment_items WHERE id = $1 AND workspace_id = $2`,
      [existing.equipment_item_id, workspaceId]
    );
    const itemInfo = itemLookup.rows[0];

    const isDamaged = condition === 'damaged' || condition === 'poor';
    let effectiveDeduction = deductionAmount ?? 0;
    if (isDamaged && effectiveDeduction === 0 && itemInfo?.purchase_cost) {
      effectiveDeduction = parseFloat(itemInfo.purchase_cost) * 0.5;
    }

    const assignmentResult = await client.query(
      `UPDATE equipment_assignments
       SET actual_return_date = NOW(), deduction_amount = $1, condition = $2, damage_notes = $3, updated_at = NOW()
       WHERE id = $4 AND workspace_id = $5 RETURNING *`,
      [effectiveDeduction, condition, notes || '', assignmentId, workspaceId]
    );
    const assignment = assignmentResult.rows[0];

    if (effectiveDeduction > 0 && assignment.employee_id) {
      const payrollEntryId = await findOrCreatePayrollEntryForDeduction(client, assignment.employee_id, workspaceId);
      await client.query(
        `INSERT INTO payroll_deductions (id, payroll_entry_id, employee_id, workspace_id, deduction_type, description, amount, is_pre_tax, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'equipment_damage', $4, $5, false, NOW(), NOW())`,
        [payrollEntryId, assignment.employee_id, workspaceId, `Equipment return deduction: ${itemInfo?.name || 'Unknown'} - ${notes || condition}`, effectiveDeduction]
      );
    }

    const newStatus = isDamaged ? 'maintenance' : 'available';
    await client.query(
      `UPDATE equipment_items SET status = $1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3`,
      [newStatus, assignment.equipment_item_id, workspaceId]
    );

    await client.query('COMMIT');

    tokenManager.recordUsage({
      workspaceId, userId: userId || 'system', featureKey: 'equipment_return',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      featureName: 'Equipment Return', description: `Equipment item ${assignment.equipment_item_id} returned`,
      amountOverride: 1, relatedEntityType: 'equipment_assignment', relatedEntityId: assignment.id,
    }).catch((err: Error) => { log.error('[Equipment] Return credit deduction failed (non-blocking):', err.message); });

    return assignment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

router.post("/:id/return", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to process equipment returns" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const lookupResult = await db.$client.query(
      `SELECT ea.id FROM equipment_assignments ea
       WHERE ea.equipment_item_id = $1 AND ea.workspace_id = $2 AND ea.actual_return_date IS NULL
       ORDER BY ea.checkout_date DESC LIMIT 1`,
      [req.params.id, workspaceId]
    );
    if (lookupResult.rows.length === 0) {
      return res.status(404).json({ error: "No active assignment found for this item" });
    }

    const result = await processEquipmentReturn(
      lookupResult.rows[0].id, workspaceId,
      authReq.user?.id || 'system',
      req.body.condition || "good", req.body.notes,
      req.body.deductionAmount ? parseFloat(req.body.deductionAmount) : undefined
    );
    if (!result) return res.status(404).json({ error: "Assignment not found" });
    if ('_alreadyReturned' in result) return res.status(409).json({ error: "Assignment already returned" });
    if ('_isLost' in result) return res.status(409).json({ error: "Cannot return equipment marked as lost" });
    res.json({ success: true, assignment: result });
  } catch (error: unknown) {
    log.error("Error returning equipment:", error);
    res.status(500).json({ error: "Failed to return equipment" });
  }
});

router.get("/items", listEquipmentItems);
router.post("/items", createEquipmentItem);

router.get("/items/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [item] = await db
      .select()
      .from(equipmentItems)
      .where(and(eq(equipmentItems.id, req.params.id), eq(equipmentItems.workspaceId, workspaceId)));

    if (!item) return res.status(404).json({ error: "Equipment item not found" });
    res.json(item);
  } catch (error: unknown) {
    log.error("Error fetching equipment item:", error);
    res.status(500).json({ error: "Failed to fetch equipment item" });
  }
});

router.patch("/items/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to update equipment items" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const { workspaceId: _, id: __, ...updateData } = req.body;
    const [updated] = await db
      .update(equipmentItems)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(equipmentItems.id, req.params.id), eq(equipmentItems.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Equipment item not found" });
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating equipment item:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to update equipment item" });
  }
});

router.delete("/items/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete equipment items" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [deleted] = await db
      .delete(equipmentItems)
      .where(and(eq(equipmentItems.id, req.params.id), eq(equipmentItems.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Equipment item not found" });
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Error deleting equipment item:", error);
    res.status(500).json({ error: "Failed to delete equipment item" });
  }
});

router.get("/assignments", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const equipmentItemId = req.query.equipmentItemId as string | undefined;
    const employeeId = req.query.employeeId as string | undefined;

    let conditions = [eq(equipmentAssignments.workspaceId, workspaceId)];
    if (equipmentItemId) conditions.push(eq(equipmentAssignments.equipmentItemId, equipmentItemId));
    if (employeeId) conditions.push(eq(equipmentAssignments.employeeId, employeeId));

    const assignments = await db
      .select()
      .from(equipmentAssignments)
      .where(and(...conditions))
      .orderBy(desc(equipmentAssignments.createdAt));

    res.json(assignments);
  } catch (error: unknown) {
    log.error("Error fetching equipment assignments:", error);
    res.status(500).json({ error: "Failed to fetch equipment assignments" });
  }
});

router.post("/assignments", processEquipmentAssignment);

router.post("/assignments/:id/return", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to process equipment returns" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const result = await processEquipmentReturn(
      req.params.id, workspaceId,
      authReq.user?.id || 'system',
      req.body.condition || "good", req.body.notes,
      req.body.deductionAmount ? parseFloat(req.body.deductionAmount) : undefined
    );
    if (!result) return res.status(404).json({ error: "Assignment not found" });
    if ('_alreadyReturned' in result) return res.status(409).json({ error: "Assignment already returned" });
    if ('_isLost' in result) return res.status(409).json({ error: "Cannot return equipment marked as lost" });
    res.json({ success: true, assignment: result });
  } catch (error: unknown) {
    log.error("Error returning equipment:", error);
    res.status(500).json({ error: "Failed to process equipment return" });
  }
});

router.get("/maintenance", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const equipmentItemId = req.query.equipmentItemId as string | undefined;
    let conditions = [eq(equipmentMaintenanceLogs.workspaceId, workspaceId)];
    if (equipmentItemId) conditions.push(eq(equipmentMaintenanceLogs.equipmentItemId, equipmentItemId));

    const logs = await db
      .select()
      .from(equipmentMaintenanceLogs)
      .where(and(...conditions))
      .orderBy(desc(equipmentMaintenanceLogs.createdAt));

    res.json(logs);
  } catch (error: unknown) {
    log.error("Error fetching maintenance logs:", error);
    res.status(500).json({ error: "Failed to fetch maintenance logs" });
  }
});

router.post("/maintenance", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to log equipment maintenance" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const validated = insertEquipmentMaintenanceLogSchema.parse({ ...req.body, workspaceId });
    const [log] = await db.insert(equipmentMaintenanceLogs).values(validated).returning();

    await db
      .update(equipmentItems)
      .set({ status: "maintenance", updatedAt: new Date() })
      .where(and(eq(equipmentItems.id, validated.equipmentItemId), eq(equipmentItems.workspaceId, workspaceId)));

    res.status(201).json(log);
  } catch (error: unknown) {
    log.error("Error creating maintenance log:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create maintenance log" });
  }
});

router.post("/report-lost/:assignmentId", async (req, res) => {
  const client = await pool.connect();
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to report lost equipment" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const { assignmentId } = req.params;

    await client.query('BEGIN');
    try {
      const checkResult = await client.query(
        `SELECT is_lost, actual_return_date FROM equipment_assignments WHERE id = $1 AND workspace_id = $2`,
        [assignmentId, workspaceId]
      );
      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "Assignment not found" });
      }
      if (checkResult.rows[0].is_lost) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: "Assignment already marked as lost" });
      }
      if (checkResult.rows[0].actual_return_date) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: "Assignment already returned" });
      }

      const assignmentResult = await client.query(
        `UPDATE equipment_assignments SET is_lost = true, updated_at = NOW()
         WHERE id = $1 AND workspace_id = $2 RETURNING *`,
        [assignmentId, workspaceId]
      );

      const assignment = assignmentResult.rows[0];

      const itemResult = await client.query(
        `UPDATE equipment_items SET status = 'lost', updated_at = NOW()
         WHERE id = $1 AND workspace_id = $2 RETURNING purchase_cost, name`,
        [assignment.equipment_item_id, workspaceId]
      );
      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "Equipment item not found" });
      }

      const item = itemResult.rows[0];
      const deductionAmount = item?.purchase_cost ? parseFloat(item.purchase_cost) : 0;
      if (deductionAmount > 0) {
        const payrollEntryId = await findOrCreatePayrollEntryForDeduction(client, assignment.employee_id, workspaceId);
        await client.query(
          `INSERT INTO payroll_deductions (id, payroll_entry_id, employee_id, workspace_id, deduction_type, description, amount, is_pre_tax, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'equipment_lost', $4, $5, false, NOW(), NOW())`,
          [payrollEntryId, assignment.employee_id, workspaceId, `Lost equipment: ${item.name || 'Unknown item'}`, deductionAmount]
        );

        await client.query(
          `UPDATE equipment_assignments SET deduction_amount = $1 WHERE id = $2`,
          [deductionAmount, assignmentId]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, assignment, deductionAmount });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (error: unknown) {
    log.error("Error reporting lost equipment:", error);
    res.status(500).json({ error: "Failed to report lost equipment" });
  } finally {
    client.release();
  }
});

router.post("/report-damage/:assignmentId", async (req, res) => {
  const client = await pool.connect();
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to report equipment damage" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const { assignmentId } = req.params;
    const { damageNotes, condition, deductionAmount } = req.body;

    if (!damageNotes) {
      return res.status(400).json({ error: "damageNotes is required" });
    }

    await client.query('BEGIN');
    try {
      const checkResult = await client.query(
        `SELECT is_lost, actual_return_date, deduction_amount FROM equipment_assignments WHERE id = $1 AND workspace_id = $2`,
        [assignmentId, workspaceId]
      );
      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "Assignment not found" });
      }
      if (checkResult.rows[0].is_lost) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: "Cannot report damage on lost equipment" });
      }
      if (checkResult.rows[0].deduction_amount && parseFloat(checkResult.rows[0].deduction_amount) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: "A deduction has already been recorded for this assignment" });
      }

      const result = await client.query(
        `UPDATE equipment_assignments SET damage_notes = $1, condition = $2, deduction_amount = $3, updated_at = NOW()
         WHERE id = $4 AND workspace_id = $5 RETURNING *`,
        [damageNotes, condition || 'damaged', deductionAmount || null, assignmentId, workspaceId]
      );

      const assignment = result.rows[0];

      const itemResult = await client.query(
        `SELECT purchase_cost, name FROM equipment_items WHERE id = $1 AND workspace_id = $2`,
        [assignment.equipment_item_id, workspaceId]
      );
      const item = itemResult.rows[0];
      const effectiveDeduction = deductionAmount ? parseFloat(deductionAmount) : (item?.purchase_cost ? parseFloat(item.purchase_cost) * 0.5 : 0);

      if (effectiveDeduction > 0) {
        const payrollEntryId = await findOrCreatePayrollEntryForDeduction(client, assignment.employee_id, workspaceId);
        await client.query(
          `INSERT INTO payroll_deductions (id, payroll_entry_id, employee_id, workspace_id, deduction_type, description, amount, is_pre_tax, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'equipment_damage', $4, $5, false, NOW(), NOW())`,
          [payrollEntryId, assignment.employee_id, workspaceId, `Damaged equipment: ${item?.name || 'Unknown item'} - ${damageNotes}`, effectiveDeduction]
        );

        await client.query(
          `UPDATE equipment_assignments SET deduction_amount = $1 WHERE id = $2`,
          [effectiveDeduction, assignmentId]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, assignment: result.rows[0], deductionAmount: effectiveDeduction });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (error: unknown) {
    log.error("Error reporting equipment damage:", error);
    res.status(500).json({ error: "Failed to report equipment damage" });
  } finally {
    client.release();
  }
});

router.post("/return-with-deduction/:assignmentId", async (req, res) => {
  const client = await pool.connect();
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to process equipment return with deduction" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const { assignmentId } = req.params;
    const { condition, damageNotes, deductionAmount } = req.body;

    await client.query('BEGIN');
    try {
      const checkResult = await client.query(
        `SELECT actual_return_date, is_lost FROM equipment_assignments WHERE id = $1 AND workspace_id = $2`,
        [assignmentId, workspaceId]
      );
      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "Assignment not found" });
      }
      if (checkResult.rows[0].actual_return_date) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: "Assignment already returned" });
      }
      if (checkResult.rows[0].is_lost) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: "Cannot return equipment that is marked as lost" });
      }

      const itemLookup = await client.query(
        `SELECT purchase_cost, name FROM equipment_items WHERE id = (
           SELECT equipment_item_id FROM equipment_assignments WHERE id = $1 AND workspace_id = $2
         )`,
        [assignmentId, workspaceId]
      );
      const itemInfo = itemLookup.rows[0];

      const returnCondition = condition || 'fair';
      const isDamaged = returnCondition === 'damaged' || returnCondition === 'poor';
      let effectiveDeduction = deductionAmount ? parseFloat(deductionAmount) : 0;
      if (isDamaged && effectiveDeduction === 0 && itemInfo?.purchase_cost) {
        effectiveDeduction = parseFloat(itemInfo.purchase_cost) * 0.5;
      }

      const assignmentResult = await client.query(
        `UPDATE equipment_assignments
         SET actual_return_date = NOW(), deduction_amount = $1, condition = $2, damage_notes = $3, updated_at = NOW()
         WHERE id = $4 AND workspace_id = $5 RETURNING *`,
        [effectiveDeduction, returnCondition, damageNotes || '', assignmentId, workspaceId]
      );

      const assignment = assignmentResult.rows[0];

      if (effectiveDeduction > 0) {
        const payrollEntryId = await findOrCreatePayrollEntryForDeduction(client, assignment.employee_id, workspaceId);
        await client.query(
          `INSERT INTO payroll_deductions (id, payroll_entry_id, employee_id, workspace_id, deduction_type, description, amount, is_pre_tax, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'equipment_damage', $4, $5, false, NOW(), NOW())`,
          [payrollEntryId, assignment.employee_id, workspaceId, `Equipment return deduction: ${itemInfo?.name || 'Unknown'} - ${damageNotes || returnCondition}`, effectiveDeduction]
        );
      }

      const newStatus = (condition === 'damaged' || condition === 'poor') ? 'maintenance' : 'available';
      const itemUpdateResult = await client.query(
        `UPDATE equipment_items SET status = $1, updated_at = NOW()
         WHERE id = $2 AND workspace_id = $3`,
        [newStatus, assignment.equipment_item_id, workspaceId]
      );
      if (itemUpdateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "Equipment item not found during return" });
      }

      await client.query('COMMIT');
      res.json({ success: true, assignment });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (error: unknown) {
    log.error("Error processing equipment return with deduction:", error);
    res.status(500).json({ error: "Failed to process equipment return with deduction" });
  } finally {
    client.release();
  }
});

router.get("/officer/:employeeId", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const isSelf = authReq.employeeId === req.params.employeeId;
    if (!isSelf && !hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to view other officers' equipment" });
    }

    const { employeeId } = req.params;

    const result = await db.$client.query(
      `SELECT ea.*, ei.name AS item_name, ei.serial_number AS item_serial_number,
              ei.category AS item_category, ei.status AS item_status,
              ei.description AS item_description, ei.purchase_cost AS item_purchase_cost
       FROM equipment_assignments ea
       JOIN equipment_items ei ON ea.equipment_item_id = ei.id
       WHERE ea.employee_id = $1 AND ea.workspace_id = $2
       ORDER BY ea.checkout_date DESC`,
      [employeeId, workspaceId]
    );

    res.json(result.rows);
  } catch (error: unknown) {
    log.error("Error fetching officer equipment:", error);
    res.status(500).json({ error: "Failed to fetch officer equipment" });
  }
});

router.get("/overdue", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const result = await db.$client.query(
      `SELECT ea.*, ei.name AS item_name, ei.serial_number AS item_serial_number,
              ei.category AS item_category, ei.status AS item_status
       FROM equipment_assignments ea
       JOIN equipment_items ei ON ea.equipment_item_id = ei.id
       WHERE ea.expected_return_date < NOW()
         AND ea.actual_return_date IS NULL
         AND ea.workspace_id = $1
       ORDER BY ea.expected_return_date ASC`,
      [workspaceId]
    );

    res.json(result.rows);
  } catch (error: unknown) {
    log.error("Error fetching overdue equipment:", error);
    res.status(500).json({ error: "Failed to fetch overdue equipment" });
  }
});

router.get("/low-inventory", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const result = await db.$client.query(
      `SELECT category, COUNT(*) FILTER (WHERE status = 'available') AS available_count,
              COUNT(*) AS total_count,
              MIN(COALESCE(low_inventory_threshold, 5)) AS threshold
       FROM equipment_items
       WHERE workspace_id = $1
       GROUP BY category
       HAVING COUNT(*) FILTER (WHERE status = 'available') < MIN(COALESCE(low_inventory_threshold, 5))
       ORDER BY category`,
      [workspaceId]
    );

    res.json(result.rows);
  } catch (error: unknown) {
    log.error("Error fetching low inventory equipment:", error);
    res.status(500).json({ error: "Failed to fetch low inventory equipment" });
  }
});

router.get("/assignments/:officerId", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const { officerId } = req.params;
    const userId = authReq.user?.id;
    const isManager = hasManagerAccess(authReq.workspaceRole || '');

    if (!isManager) {
      const selfCheck = await db.$client.query(
        `SELECT id FROM employees WHERE id = $1 AND (user_id = $2 OR id = $2) AND workspace_id = $3 LIMIT 1`,
        [officerId, userId, workspaceId]
      );
      if (selfCheck.rows.length === 0) {
        return res.status(403).json({ error: "You can only view your own equipment" });
      }
    }

    const result = await db.$client.query(
      `SELECT ea.*, ei.name AS item_name, ei.serial_number, ei.category, ei.status AS item_status
       FROM equipment_assignments ea
       JOIN equipment_items ei ON ei.id = ea.equipment_item_id
       WHERE ea.employee_id = $1 AND ea.workspace_id = $2
       ORDER BY ea.checkout_date DESC`,
      [officerId, workspaceId]
    );

    res.json(result.rows);
  } catch (error: unknown) {
    log.error("Error fetching officer assignments:", error);
    res.status(500).json({ error: "Failed to fetch officer assignments" });
  }
});

router.post("/:itemId/report-lost", async (req, res) => {
  const client = await pool.connect();
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to report lost equipment" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const { itemId } = req.params;

    await client.query('BEGIN');
    const assignmentLookup = await client.query(
      `SELECT id, employee_id, is_lost, actual_return_date FROM equipment_assignments
       WHERE equipment_item_id = $1 AND workspace_id = $2 AND actual_return_date IS NULL AND is_lost IS NOT TRUE
       ORDER BY checkout_date DESC LIMIT 1`,
      [itemId, workspaceId]
    );
    if (assignmentLookup.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "No active assignment found for this item" });
    }

    const assignmentId = assignmentLookup.rows[0].id;

    await client.query(
      `UPDATE equipment_assignments SET is_lost = true, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
      [assignmentId, workspaceId]
    );

    const itemResult = await client.query(
      `UPDATE equipment_items SET status = 'lost', updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 RETURNING purchase_cost, name`,
      [itemId, workspaceId]
    );
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Equipment item not found" });
    }

    const item = itemResult.rows[0];
    const deductionAmount = item?.purchase_cost ? parseFloat(item.purchase_cost) : 0;
    if (deductionAmount > 0) {
      const payrollEntryId = await findOrCreatePayrollEntryForDeduction(client, assignmentLookup.rows[0].employee_id, workspaceId);
      await client.query(
        `INSERT INTO payroll_deductions (id, payroll_entry_id, employee_id, workspace_id, deduction_type, description, amount, is_pre_tax, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'equipment_lost', $4, $5, false, NOW(), NOW())`,
        [payrollEntryId, assignmentLookup.rows[0].employee_id, workspaceId, `Lost equipment: ${item.name || 'Unknown item'}`, deductionAmount]
      );
      await client.query(
        `UPDATE equipment_assignments SET deduction_amount = $1 WHERE id = $2`,
        [deductionAmount, assignmentId]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, assignmentId, deductionAmount });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    log.error("Error reporting lost equipment by item:", error);
    res.status(500).json({ error: "Failed to report lost equipment" });
  } finally {
    client.release();
  }
});

export default router;
