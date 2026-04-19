import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import {
  vehicles,
  vehicleAssignments,
  vehicleMaintenance,
  insertVehicleSchema,
  insertVehicleAssignmentSchema,
  insertVehicleMaintenanceSchema,
} from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { requireAuth } from "../auth";
import { createLogger } from '../lib/logger';
const log = createLogger('VehicleRoutes');


const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const items = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.workspaceId, workspaceId))
      .orderBy(desc(vehicles.updatedAt));

    res.json(items);
  } catch (error: unknown) {
    log.error("Error fetching vehicles:", error);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

router.get("/assignments/list", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const vehicleId = req.query.vehicleId as string | undefined;
    const employeeId = req.query.employeeId as string | undefined;

    let conditions = [eq(vehicleAssignments.workspaceId, workspaceId)];
    if (vehicleId) conditions.push(eq(vehicleAssignments.vehicleId, vehicleId));
    if (employeeId) conditions.push(eq(vehicleAssignments.employeeId, employeeId));

    const assignments = await db
      .select()
      .from(vehicleAssignments)
      .where(and(...conditions))
      .orderBy(desc(vehicleAssignments.updatedAt));

    res.json(assignments);
  } catch (error: unknown) {
    log.error("Error fetching vehicle assignments:", error);
    res.status(500).json({ error: "Failed to fetch vehicle assignments" });
  }
});

router.get("/maintenance/list", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const vehicleId = req.query.vehicleId as string | undefined;
    let conditions = [eq(vehicleMaintenance.workspaceId, workspaceId)];
    if (vehicleId) conditions.push(eq(vehicleMaintenance.vehicleId, vehicleId));

    const logs = await db
      .select()
      .from(vehicleMaintenance)
      .where(and(...conditions))
      .orderBy(desc(vehicleMaintenance.date));

    res.json(logs);
  } catch (error: unknown) {
    log.error("Error fetching vehicle maintenance logs:", error);
    res.status(500).json({ error: "Failed to fetch vehicle maintenance logs" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [item] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.workspaceId, workspaceId)));

    if (!item) return res.status(404).json({ error: "Vehicle not found" });
    res.json(item);
  } catch (error: unknown) {
    log.error("Error fetching vehicle:", error);
    res.status(500).json({ error: "Failed to fetch vehicle" });
  }
});

router.post("/", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const validated = insertVehicleSchema.parse({ ...req.body, workspaceId });
    const [item] = await db.insert(vehicles).values(validated).returning();

    const wss = req.app?.get?.("wss");
    if (wss) {
      const msg = JSON.stringify({ type: "vehicle_created", payload: item });
      wss.clients?.forEach?.((c: any) => { if (c.readyState === 1) c.send(msg); });
    }

    res.status(201).json(item);
  } catch (error: unknown) {
    log.error("Error creating vehicle:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create vehicle" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to update vehicles" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const { workspaceId: _, id: __, ...updateData } = req.body;
    const [updated] = await db
      .update(vehicles)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Vehicle not found" });

    const wss = req.app?.get?.("wss");
    if (wss) {
      const msg = JSON.stringify({ type: "vehicle_updated", payload: updated });
      wss.clients?.forEach?.((c: any) => { if (c.readyState === 1) c.send(msg); });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating vehicle:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to update vehicle" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!hasManagerAccess(authReq.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete vehicles" });
    }
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [deleted] = await db
      .delete(vehicles)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Vehicle not found" });

    const wss = req.app?.get?.("wss");
    if (wss) {
      const msg = JSON.stringify({ type: "vehicle_deleted", payload: { id: req.params.id } });
      wss.clients?.forEach?.((c: any) => { if (c.readyState === 1) c.send(msg); });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Error deleting vehicle:", error);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

router.post("/assignments", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const validated = insertVehicleAssignmentSchema.parse({ ...req.body, workspaceId });
    const [assignment] = await db.insert(vehicleAssignments).values(validated).returning();

    await db
      .update(vehicles)
      .set({ assignedEmployeeId: validated.employeeId, updatedAt: new Date() })
      .where(and(eq(vehicles.id, validated.vehicleId), eq(vehicles.workspaceId, workspaceId)));

    const wss = req.app?.get?.("wss");
    if (wss) {
      const msg = JSON.stringify({ type: "vehicle_assigned", payload: assignment });
      wss.clients?.forEach?.((c: any) => { if (c.readyState === 1) c.send(msg); });
    }

    res.status(201).json(assignment);
  } catch (error: unknown) {
    log.error("Error creating vehicle assignment:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create vehicle assignment" });
  }
});

router.post("/assignments/:id/return", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const endMileage = req.body.endMileage;
    const notes = req.body.notes;

    const [assignment] = await db
      .update(vehicleAssignments)
      .set({ returnDate: new Date(), endMileage, notes, updatedAt: new Date() })
      .where(and(eq(vehicleAssignments.id, req.params.id), eq(vehicleAssignments.workspaceId, workspaceId)))
      .returning();

    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    await db
      .update(vehicles)
      .set({ assignedEmployeeId: null, currentMileage: endMileage || undefined, updatedAt: new Date() })
      .where(and(eq(vehicles.id, assignment.vehicleId), eq(vehicles.workspaceId, workspaceId)));

    const wss = req.app?.get?.("wss");
    if (wss) {
      const msg = JSON.stringify({ type: "vehicle_returned", payload: assignment });
      wss.clients?.forEach?.((c: any) => { if (c.readyState === 1) c.send(msg); });
    }

    res.json(assignment);
  } catch (error: unknown) {
    log.error("Error returning vehicle:", error);
    res.status(500).json({ error: "Failed to process vehicle return" });
  }
});

router.post("/maintenance", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const validated = insertVehicleMaintenanceSchema.parse({ ...req.body, workspaceId });
    const [log] = await db.insert(vehicleMaintenance).values(validated).returning();

    await db
      .update(vehicles)
      .set({ status: "maintenance", updatedAt: new Date() })
      .where(and(eq(vehicles.id, validated.vehicleId), eq(vehicles.workspaceId, workspaceId)));

    const wss = req.app?.get?.("wss");
    if (wss) {
      const msg = JSON.stringify({ type: "vehicle_maintenance_logged", payload: log });
      wss.clients?.forEach?.((c: any) => { if (c.readyState === 1) c.send(msg); });
    }

    res.status(201).json(log);
  } catch (error: unknown) {
    log.error("Error creating vehicle maintenance log:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create vehicle maintenance log" });
  }
});

/**
 * GET /api/vehicles/compliance — Readiness Section 14
 * The vehicles table already tracks insuranceExpiry + registrationExpiry
 * but nothing surfaced the alerts. This endpoint buckets every vehicle
 * into expired / expiring-30d / expiring-90d / ok / unknown and returns
 * a rollup plus the per-vehicle detail.
 */
router.get("/compliance", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.workspaceId, workspaceId));

    type Bucket = 'expired' | 'expiring_30d' | 'expiring_90d' | 'ok' | 'unknown';
    const bucket = (date: Date | null): Bucket => {
      if (!date) return 'unknown';
      if (date < now) return 'expired';
      if (date < in30) return 'expiring_30d';
      if (date < in90) return 'expiring_90d';
      return 'ok';
    };

    const enriched = rows.map((v) => ({
      id: v.id,
      licensePlate: v.licensePlate,
      make: v.make,
      model: v.model,
      assignedEmployeeId: v.assignedEmployeeId,
      insurance: {
        expiresAt: v.insuranceExpiry,
        bucket: bucket(v.insuranceExpiry ? new Date(v.insuranceExpiry) : null),
      },
      registration: {
        expiresAt: v.registrationExpiry,
        bucket: bucket(v.registrationExpiry ? new Date(v.registrationExpiry) : null),
      },
    }));

    const summary = {
      total: rows.length,
      insuranceExpired:      enriched.filter((v) => v.insurance.bucket === 'expired').length,
      insuranceExpiring30d:  enriched.filter((v) => v.insurance.bucket === 'expiring_30d').length,
      insuranceMissing:      enriched.filter((v) => v.insurance.bucket === 'unknown').length,
      registrationExpired:   enriched.filter((v) => v.registration.bucket === 'expired').length,
      registrationExpiring30d: enriched.filter((v) => v.registration.bucket === 'expiring_30d').length,
      registrationMissing:   enriched.filter((v) => v.registration.bucket === 'unknown').length,
    };

    res.json({ summary, vehicles: enriched });
  } catch (error: unknown) {
    log.error("Error computing vehicle compliance:", error);
    res.status(500).json({ error: "Failed to compute vehicle compliance" });
  }
});

export default router;
