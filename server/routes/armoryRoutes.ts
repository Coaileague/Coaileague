/**
 * Armory Routes — Readiness Section 2
 * ======================================
 * Closes the armory gaps identified in STATEWIDE_READINESS_AUDIT.md:
 *   - weapon_inspections       (CRUD)
 *   - weapon_qualifications    (CRUD, plus officer status)
 *   - ammo_inventory           (CRUD)
 *   - ammo_transactions        (append-only ledger)
 *
 * Every mutation writes audit_logs via logActionAudit (CLAUDE §L).
 * Every query filters by workspace_id (CLAUDE §G tenant isolation).
 * Every table has a workspace_id index (CLAUDE §D).
 */

import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import {
  weaponInspections,
  weaponQualifications,
  ammoInventory,
  ammoTransactions,
  insertWeaponInspectionSchema,
  insertWeaponQualificationSchema,
  insertAmmoInventorySchema,
  insertAmmoTransactionSchema,
} from '@shared/schema';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { logActionAudit } from '../services/ai-brain/actionAuditLogger';
import { sanitizeError } from '../middleware/errorHandler';
import { createLogger } from '../lib/logger';

const log = createLogger('ArmoryRoutes');

const router = Router();

// ─────────────────────────────────────────────────────────────
// Weapon Inspections
// ─────────────────────────────────────────────────────────────

router.get('/inspections', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const weaponId = typeof req.query.weaponId === 'string' ? req.query.weaponId : undefined;
    const rows = await db
      .select()
      .from(weaponInspections)
      .where(
        weaponId
          ? and(eq(weaponInspections.workspaceId, workspaceId), eq(weaponInspections.weaponId, weaponId))
          : eq(weaponInspections.workspaceId, workspaceId),
      )
      .orderBy(desc(weaponInspections.inspectedAt))
      .limit(500);
    res.json(rows);
  } catch (err) {
    log.error('list inspections failed', err);
    res.status(500).json({ error: 'Failed to list inspections' });
  }
});

router.post('/inspections', async (req: Request, res: Response) => {
  const start = Date.now();
  const authReq = req as AuthenticatedRequest;
  const workspaceId = authReq.workspaceId;
  const userId = authReq.user?.id;

  try {
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to log weapon inspection' });
    }
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const validated = insertWeaponInspectionSchema.parse({ ...req.body, workspaceId });
    // cast: jsonb<string[]> column vs zod-inferred jsonb (common drizzle-zod mismatch)
    const [row] = await db.insert(weaponInspections).values(validated as typeof weaponInspections.$inferInsert).returning();

    await logActionAudit({
      actionId: 'armory.weapon_inspection.create',
      workspaceId,
      userId,
      userRole: authReq.workspaceRole,
      platformRole: authReq.platformRole,
      entityType: 'weapon_inspection',
      entityId: row?.id ?? null,
      success: true,
      changesAfter: row as any,
      durationMs: Date.now() - start,
    });

    res.status(201).json(row);
  } catch (err) {
    await logActionAudit({
      actionId: 'armory.weapon_inspection.create',
      workspaceId,
      userId,
      entityType: 'weapon_inspection',
      success: false,
      errorMessage: (err as Error)?.message,
      payload: req.body,
      durationMs: Date.now() - start,
    });
    log.error('create inspection failed', err);
    res.status(400).json({ error: sanitizeError(err) || 'Failed to create inspection' });
  }
});

// ─────────────────────────────────────────────────────────────
// Weapon Qualifications
// ─────────────────────────────────────────────────────────────

router.get('/qualifications', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
    const rows = await db
      .select()
      .from(weaponQualifications)
      .where(
        employeeId
          ? and(
              eq(weaponQualifications.workspaceId, workspaceId),
              eq(weaponQualifications.employeeId, employeeId),
            )
          : eq(weaponQualifications.workspaceId, workspaceId),
      )
      .orderBy(desc(weaponQualifications.expiresAt))
      .limit(500);
    res.json(rows);
  } catch (err) {
    log.error('list qualifications failed', err);
    res.status(500).json({ error: 'Failed to list qualifications' });
  }
});

router.post('/qualifications', async (req: Request, res: Response) => {
  const start = Date.now();
  const authReq = req as AuthenticatedRequest;
  const workspaceId = authReq.workspaceId;
  const userId = authReq.user?.id;

  try {
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to record qualification' });
    }
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const validated = insertWeaponQualificationSchema.parse({ ...req.body, workspaceId });
    const [row] = await db.insert(weaponQualifications).values(validated).returning();

    await logActionAudit({
      actionId: 'armory.weapon_qualification.create',
      workspaceId,
      userId,
      userRole: authReq.workspaceRole,
      platformRole: authReq.platformRole,
      entityType: 'weapon_qualification',
      entityId: row?.id ?? null,
      success: true,
      changesAfter: row as any,
      durationMs: Date.now() - start,
    });

    res.status(201).json(row);
  } catch (err) {
    await logActionAudit({
      actionId: 'armory.weapon_qualification.create',
      workspaceId,
      userId,
      entityType: 'weapon_qualification',
      success: false,
      errorMessage: (err as Error)?.message,
      payload: req.body,
      durationMs: Date.now() - start,
    });
    log.error('create qualification failed', err);
    res.status(400).json({ error: sanitizeError(err) || 'Failed to record qualification' });
  }
});

// Qualification rollup per officer — active, expiring-soon (30 days), expired.
router.get('/qualifications/status/:employeeId', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const employeeId = req.params.employeeId;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(weaponQualifications)
      .where(
        and(
          eq(weaponQualifications.workspaceId, workspaceId),
          eq(weaponQualifications.employeeId, employeeId),
          eq(weaponQualifications.status, 'active'),
        ),
      );

    const status = rows.map((r) => {
      let state: 'active' | 'expiring_soon' | 'expired' = 'active';
      if (!r.expiresAt) state = 'active';
      else if (r.expiresAt < now) state = 'expired';
      else if (r.expiresAt < in30) state = 'expiring_soon';
      return { ...r, state };
    });

    res.json({
      employeeId,
      qualifications: status,
      summary: {
        total: status.length,
        active: status.filter((s) => s.state === 'active').length,
        expiringSoon: status.filter((s) => s.state === 'expiring_soon').length,
        expired: status.filter((s) => s.state === 'expired').length,
      },
    });
  } catch (err) {
    log.error('qualification status failed', err);
    res.status(500).json({ error: 'Failed to fetch qualification status' });
  }
});

// ─────────────────────────────────────────────────────────────
// Ammo Inventory
// ─────────────────────────────────────────────────────────────

router.get('/ammo', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const rows = await db
      .select()
      .from(ammoInventory)
      .where(eq(ammoInventory.workspaceId, workspaceId))
      .orderBy(desc(ammoInventory.createdAt));
    res.json(rows);
  } catch (err) {
    log.error('list ammo inventory failed', err);
    res.status(500).json({ error: 'Failed to list ammo inventory' });
  }
});

router.post('/ammo', async (req: Request, res: Response) => {
  const start = Date.now();
  const authReq = req as AuthenticatedRequest;
  const workspaceId = authReq.workspaceId;
  const userId = authReq.user?.id;

  try {
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const validated = insertAmmoInventorySchema.parse({ ...req.body, workspaceId });
    const [row] = await db.insert(ammoInventory).values(validated).returning();

    await logActionAudit({
      actionId: 'armory.ammo_inventory.create',
      workspaceId,
      userId,
      userRole: authReq.workspaceRole,
      platformRole: authReq.platformRole,
      entityType: 'ammo_inventory',
      entityId: row?.id ?? null,
      success: true,
      changesAfter: row as any,
      durationMs: Date.now() - start,
    });

    res.status(201).json(row);
  } catch (err) {
    await logActionAudit({
      actionId: 'armory.ammo_inventory.create',
      workspaceId,
      userId,
      entityType: 'ammo_inventory',
      success: false,
      errorMessage: (err as Error)?.message,
      payload: req.body,
      durationMs: Date.now() - start,
    });
    log.error('create ammo inventory failed', err);
    res.status(400).json({ error: sanitizeError(err) || 'Failed to create ammo inventory' });
  }
});

// Ammo transaction — atomic inventory mutation + ledger row.
// Every transaction records the new quantity_after so the ledger is replayable.
router.post('/ammo/:id/transaction', async (req: Request, res: Response) => {
  const start = Date.now();
  const authReq = req as AuthenticatedRequest;
  const workspaceId = authReq.workspaceId;
  const userId = authReq.user?.id;
  const ammoId = req.params.id;

  try {
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const delta = Number(req.body.quantity);
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ error: 'quantity must be a non-zero integer (negative for issue, positive for receive/return)' });
    }
    const txType = String(req.body.transactionType || '');
    const allowed = ['receive', 'issue', 'return', 'expended', 'damaged', 'audit_adjustment'];
    if (!allowed.includes(txType)) {
      return res.status(400).json({ error: `transactionType must be one of: ${allowed.join(', ')}` });
    }

    const row = await db.transaction(async (tx) => {
      // Atomic inventory mutation scoped to workspace (CLAUDE §G).
      const updateResult = await tx.execute(sql`
        UPDATE ammo_inventory
        SET quantity_on_hand = quantity_on_hand + ${delta},
            updated_at = NOW()
        WHERE id = ${ammoId}
          AND workspace_id = ${workspaceId}
          AND (quantity_on_hand + ${delta}) >= 0
        RETURNING quantity_on_hand
      `);
      const updated = (updateResult as any).rows?.[0];
      if (!updated) {
        throw new Error('Inventory not found for workspace, or would go negative');
      }

      const validated = insertAmmoTransactionSchema.parse({
        workspaceId,
        ammoInventoryId: ammoId,
        transactionType: txType,
        quantity: delta,
        quantityAfter: updated.quantity_on_hand,
        employeeId: req.body.employeeId ?? null,
        relatedQualificationId: req.body.relatedQualificationId ?? null,
        relatedShiftId: req.body.relatedShiftId ?? null,
        reason: req.body.reason ?? null,
        performedByUserId: userId ?? null,
      });
      const [inserted] = await tx.insert(ammoTransactions).values(validated).returning();
      return inserted;
    });

    await logActionAudit({
      actionId: 'armory.ammo_transaction.create',
      workspaceId,
      userId,
      userRole: authReq.workspaceRole,
      platformRole: authReq.platformRole,
      entityType: 'ammo_transaction',
      entityId: row?.id ?? null,
      success: true,
      changesAfter: row as any,
      durationMs: Date.now() - start,
    });

    res.status(201).json(row);
  } catch (err) {
    await logActionAudit({
      actionId: 'armory.ammo_transaction.create',
      workspaceId,
      userId,
      entityType: 'ammo_transaction',
      success: false,
      errorMessage: (err as Error)?.message,
      payload: req.body,
      durationMs: Date.now() - start,
    });
    log.error('ammo transaction failed', err);
    res.status(400).json({ error: sanitizeError(err) || 'Failed to record ammo transaction' });
  }
});

router.get('/ammo/:id/transactions', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const rows = await db
      .select()
      .from(ammoTransactions)
      .where(
        and(
          eq(ammoTransactions.workspaceId, workspaceId),
          eq(ammoTransactions.ammoInventoryId, req.params.id),
        ),
      )
      .orderBy(desc(ammoTransactions.createdAt))
      .limit(500);
    res.json(rows);
  } catch (err) {
    log.error('list ammo transactions failed', err);
    res.status(500).json({ error: 'Failed to list ammo transactions' });
  }
});

// ─────────────────────────────────────────────────────────────
// Armory dashboard summary — one-shot panel data for UI.
// ─────────────────────────────────────────────────────────────

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [expiringQuals, inspectionsDue, lowAmmo] = await Promise.all([
      db
        .select()
        .from(weaponQualifications)
        .where(
          and(
            eq(weaponQualifications.workspaceId, workspaceId),
            eq(weaponQualifications.status, 'active'),
            lte(weaponQualifications.expiresAt, in30),
            gte(weaponQualifications.expiresAt, now),
          ),
        )
        .limit(100),
      db
        .select()
        .from(weaponInspections)
        .where(
          and(
            eq(weaponInspections.workspaceId, workspaceId),
            lte(weaponInspections.nextInspectionDue, now),
          ),
        )
        .limit(100),
      db.execute(sql`
        SELECT id, caliber, quantity_on_hand, reorder_threshold
        FROM ammo_inventory
        WHERE workspace_id = ${workspaceId}
          AND reorder_threshold > 0
          AND quantity_on_hand <= reorder_threshold
      `),
    ]);

    res.json({
      expiringQualifications: expiringQuals,
      inspectionsOverdue: inspectionsDue,
      lowAmmo: (lowAmmo as any).rows || [],
    });
  } catch (err) {
    log.error('armory summary failed', err);
    res.status(500).json({ error: 'Failed to build armory summary' });
  }
});

export default router;
