import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import {
  guardTours,
  guardTourCheckpoints,
  guardTourScans,
  insertGuardTourSchema,
  insertGuardTourCheckpointSchema,
  insertGuardTourScanSchema,
} from "@shared/schema";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { eq, and, desc, asc } from "drizzle-orm";
import { tokenManager } from "../services/billing/tokenManager";
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('GuardTourRoutes');


const router = Router();

router.get("/tours", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const tours = await db
      .select()
      .from(guardTours)
      .where(eq(guardTours.workspaceId, workspaceId))
      .orderBy(desc(guardTours.createdAt));

    res.json(tours);
  } catch (error: unknown) {
    log.error("Error fetching guard tours:", error);
    res.status(500).json({ error: "Failed to fetch guard tours" });
  }
});

router.get("/tours/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [tour] = await db
      .select()
      .from(guardTours)
      .where(and(eq(guardTours.id, req.params.id), eq(guardTours.workspaceId, workspaceId)));

    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const checkpoints = await db
      .select()
      .from(guardTourCheckpoints)
      .where(eq(guardTourCheckpoints.tourId, tour.id))
      .orderBy(guardTourCheckpoints.sortOrder);

    res.json({ ...tour, checkpoints });
  } catch (error: unknown) {
    log.error("Error fetching guard tour:", error);
    res.status(500).json({ error: "Failed to fetch guard tour" });
  }
});

router.post("/tours", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const validated = insertGuardTourSchema.parse({
      ...req.body,
      workspaceId,
      createdBy: userId,
    });

    const [tour] = await db.insert(guardTours).values(validated).returning();
    res.status(201).json(tour);
  } catch (error: unknown) {
    log.error("Error creating guard tour:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create guard tour" });
  }
});

router.patch("/tours/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to update guard tours" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { workspaceId: _, id: __, ...updateData } = req.body;
    const [updated] = await db
      .update(guardTours)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(guardTours.id, req.params.id), eq(guardTours.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Tour not found" });

    if ((updateData as any).status === 'completed') {
      (async () => {
        try {
          const { reportBotPdfService } = await import('../services/bots/reportBotPdfService');
          const [tour] = await db
            .select()
            .from(guardTours)
            .where(and(eq(guardTours.id, req.params.id), eq(guardTours.workspaceId, workspaceId)))
            .limit(1);
          if (!tour) return;

          const scans = await db.select()
            .from(guardTourScans)
            .where(and(
              eq(guardTourScans.tourId, req.params.id),
              eq(guardTourScans.workspaceId, workspaceId),
            ))
            .orderBy(asc(guardTourScans.scannedAt));

          const checkpoints = await db.select()
            .from(guardTourCheckpoints)
            .where(and(
              eq(guardTourCheckpoints.tourId, req.params.id),
              eq(guardTourCheckpoints.workspaceId, workspaceId),
            ))
            .orderBy(asc(guardTourCheckpoints.sortOrder));

          await reportBotPdfService.generateGuardTourReport({
            tourId: req.params.id,
            workspaceId,
            scans,
            checkpoints,
            completedAt: new Date(),
            officerId: (tour as any).assignedEmployeeId || null,
          });
        } catch (e: any) {
          log.warn('[GuardTour] PDF generation failed:', e?.message || String(e));
        }
      })();
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating guard tour:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to update guard tour" });
  }
});

router.delete("/tours/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete guard tours" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [deleted] = await db
      .delete(guardTours)
      .where(and(eq(guardTours.id, req.params.id), eq(guardTours.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Tour not found" });
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Error deleting guard tour:", error);
    res.status(500).json({ error: "Failed to delete guard tour" });
  }
});

router.get("/tours/:tourId/checkpoints", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const checkpoints = await db
      .select()
      .from(guardTourCheckpoints)
      .where(
        and(
          eq(guardTourCheckpoints.tourId, req.params.tourId),
          eq(guardTourCheckpoints.workspaceId, workspaceId)
        )
      )
      .orderBy(guardTourCheckpoints.sortOrder);

    res.json(checkpoints);
  } catch (error: unknown) {
    log.error("Error fetching checkpoints:", error);
    res.status(500).json({ error: "Failed to fetch checkpoints" });
  }
});

router.post("/tours/:tourId/checkpoints", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const validated = insertGuardTourCheckpointSchema.parse({
      ...req.body,
      tourId: req.params.tourId,
      workspaceId,
    });

    const [checkpoint] = await db.insert(guardTourCheckpoints).values(validated).returning();
    res.status(201).json(checkpoint);
  } catch (error: unknown) {
    log.error("Error creating checkpoint:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create checkpoint" });
  }
});

router.patch("/checkpoints/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to update checkpoints" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { workspaceId: _, id: __, tourId: ___, ...updateData } = req.body;
    const [updated] = await db
      .update(guardTourCheckpoints)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(guardTourCheckpoints.id, req.params.id), eq(guardTourCheckpoints.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Checkpoint not found" });
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating checkpoint:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to update checkpoint" });
  }
});

router.delete("/checkpoints/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete checkpoints" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [deleted] = await db
      .delete(guardTourCheckpoints)
      .where(and(eq(guardTourCheckpoints.id, req.params.id), eq(guardTourCheckpoints.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Checkpoint not found" });
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Error deleting checkpoint:", error);
    res.status(500).json({ error: "Failed to delete checkpoint" });
  }
});

router.post("/scans", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const validated = insertGuardTourScanSchema.parse({
      ...req.body,
      workspaceId,
    });

    const [scan] = await db.insert(guardTourScans).values(validated).returning();

    // Deduct 1 credit per checkpoint scan (GPS/QR/NFC patrol verification)
    // Best-effort — never block a scan on a credit error
    tokenManager.recordUsage({
      workspaceId,
      userId: (req as AuthenticatedRequest).user?.id || 'system',
      featureKey: 'guard_tour_scan',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      featureName: 'GPS/QR/NFC Patrol Scan',
      description: `Checkpoint scan recorded for tour ${validated.tourId}`,
      relatedEntityType: 'guard_tour_scan',
      relatedEntityId: scan.id,
    }).catch((err: Error) => { log.error('[GuardTour] Scan credit deduction failed (non-blocking):', err.message); });

    res.status(201).json(scan);
  } catch (error: unknown) {
    log.error("Error recording scan:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to record scan" });
  }
});

router.get("/tours/:tourId/scans", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const scans = await db
      .select()
      .from(guardTourScans)
      .where(
        and(
          eq(guardTourScans.tourId, req.params.tourId),
          eq(guardTourScans.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(guardTourScans.scannedAt));

    res.json(scans);
  } catch (error: unknown) {
    log.error("Error fetching scans:", error);
    res.status(500).json({ error: "Failed to fetch scans" });
  }
});

export default router;
