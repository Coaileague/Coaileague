import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import QRCode from 'qrcode';
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

    if ((updateData as Record<string,unknown>).status === 'completed') {
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
            officerId: (tour as Record<string,unknown>).assignedEmployeeId || null,
          });
        } catch (e: unknown) {
          log.warn('[GuardTour] PDF generation failed:', (e instanceof Error ? e.message : String(e)) || String(e));
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

    // ── Wave 21A: CAD ↔ Patrol bridge ─────────────────────────────────────
    // Fire non-blocking patrol_scan broadcast so:
    //   1. CAD board flashes officer dot green at checkpoint GPS
    //   2. HelpAI posts confirmation to active shift room
    //   3. cad_event_log records the checkpoint scan for audit trail
    (async () => {
      try {
        // Fetch checkpoint details for the broadcast
        const [cp] = await db.select({
          name: guardTourCheckpoints.name,
          latitude: guardTourCheckpoints.latitude,
          longitude: guardTourCheckpoints.longitude,
        }).from(guardTourCheckpoints)
          .where(eq(guardTourCheckpoints.id, validated.checkpointId)).limit(1);

        // Fetch officer name
        const { pool } = await import('../../db');
        const empRow = await pool.query(
          `SELECT first_name || ' ' || last_name AS name, shift_id
           FROM employees WHERE id = $1 LIMIT 1`,
          [validated.employeeId]
        );
        const officerName = empRow.rows[0]?.name || 'Officer';

        // Broadcast to CAD board — officer dot flashes green
        const { broadcastToWorkspace } = await import('../../websocket');
        await broadcastToWorkspace(workspaceId, {
          type: 'patrol_scan',
          data: {
            scanId: scan.id,
            checkpointId: validated.checkpointId,
            checkpointName: cp?.name || 'Checkpoint',
            employeeId: validated.employeeId,
            officerName,
            latitude: cp?.latitude || validated.latitude,
            longitude: cp?.longitude || validated.longitude,
            scannedAt: scan.scannedAt,
            tourId: validated.tourId,
          },
        });

        // Log to cad_event_log for audit trail
        await pool.query(
          `INSERT INTO cad_event_log
           (workspace_id, event_type, priority, description, latitude, longitude, related_entity_id, created_at)
           VALUES ($1, 'patrol_checkpoint', 1, $2, $3, $4, $5, NOW())`,
          [
            workspaceId,
            `${officerName} cleared ${cp?.name || 'checkpoint'} during patrol`,
            cp?.latitude ? String(cp.latitude) : null,
            cp?.longitude ? String(cp.longitude) : null,
            scan.id,
          ]
        );

        // HelpAI shift room notification — "Unit X cleared Checkpoint Y"
        if (empRow.rows[0]?.shift_id) {
          // Find the shift room for this officer's active shift
          const roomRow = await pool.query(
            `SELECT cr.id FROM conversations cr
             JOIN shifts s ON s.id = $2
             WHERE cr.workspace_id = $1 AND cr.shift_id = $2
             LIMIT 1`,
            [workspaceId, empRow.rows[0].shift_id]
          );
          if (roomRow.rows[0]?.id) {
            await broadcastToWorkspace(workspaceId, {
              type: 'helpai_patrol_scan',
              data: {
                roomId: roomRow.rows[0].id,
                officerName,
                checkpointName: cp?.name || 'checkpoint',
                scannedAt: scan.scannedAt,
                message: `✅ ${officerName} cleared **${cp?.name || 'checkpoint'}** — ${new Date(scan.scannedAt).toLocaleTimeString()}`,
              },
            });
          }
        }
      } catch (cadErr: unknown) {
        log.warn('[GuardTour] CAD broadcast failed (non-blocking):',
          cadErr instanceof Error ? cadErr.message : String(cadErr));
      }
    })();
    // ── END CAD bridge ──────────────────────────────────────────────────────

    // Deduct 1 credit per checkpoint scan (GPS/QR/NFC patrol verification)
    tokenManager.recordUsage({
      workspaceId,
      userId: (req as AuthenticatedRequest).user?.id || 'system',
      featureKey: 'guard_tour_scan',
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

// ── Wave 21A: QR Code generation ─────────────────────────────────────────────
// Returns a QR code PNG for a single checkpoint. The QR payload encodes:
//   { v: 1, w: workspaceId, c: checkpointId, t: tourId, n: name }
// workspaceId is embedded in the QR — scans ALWAYS route to the correct tenant.
// Guards scan → guardTourScans POST → NFC integrity check → CAD broadcast.
router.get("/checkpoints/:id/qr", requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const checkpointId = req.params.id;

    const [cp] = await db.select().from(guardTourCheckpoints)
      .where(and(
        eq(guardTourCheckpoints.id, checkpointId),
        eq(guardTourCheckpoints.workspaceId, workspaceId)
      )).limit(1);

    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    // Encode workspace + checkpoint into QR — prevents cross-tenant scan confusion
    const payload = JSON.stringify({
      v: 1,                           // payload version
      w: workspaceId,                 // workspace (tenant) ID — isolates scans
      c: cp.id,                       // checkpoint ID
      t: cp.tourId,                   // tour ID
      n: cp.name,                     // human-readable checkpoint name
      nfc: cp.nfcTagId || null,       // optional NFC tag ID for anti-spoof
    });

    // Generate QR as PNG buffer
    const qrPng = await QRCode.toBuffer(payload, {
      type: "png",
      width: 300,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "H",    // High — survives dirt/damage on laminated tags
    });

    // Also store the QR code value on the checkpoint for reference
    await db.update(guardTourCheckpoints)
      .set({ qrCode: payload, updatedAt: new Date() })
      .where(eq(guardTourCheckpoints.id, checkpointId));

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Disposition", `inline; filename="checkpoint-${cp.name.replace(/[^a-z0-9]/gi, '-')}.png"`);
    res.send(qrPng);
  } catch (err: unknown) {
    log.error("QR generation failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "QR generation failed" });
  }
});

// ── Wave 21A: Print sheet — all checkpoints for a tour ───────────────────────
// GET /tours/:tourId/print-qr → JSON array of {checkpoint, qrDataUrl}
// Frontend renders the print-ready sheet.
router.get("/tours/:tourId/print-qr", requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const tourId = req.params.tourId;

    const checkpoints = await db.select().from(guardTourCheckpoints)
      .where(and(
        eq(guardTourCheckpoints.tourId, tourId),
        eq(guardTourCheckpoints.workspaceId, workspaceId)
      ))
      .orderBy(guardTourCheckpoints.sortOrder);

    if (!checkpoints.length) return res.status(404).json({ error: "No checkpoints found" });

    // Generate data URLs for all checkpoints
    const sheets = await Promise.all(checkpoints.map(async (cp) => {
      const payload = JSON.stringify({
        v: 1, w: workspaceId, c: cp.id, t: cp.tourId, n: cp.name, nfc: cp.nfcTagId || null,
      });
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 250, margin: 2,
        color: { dark: "#111827", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      return { id: cp.id, name: cp.name, description: cp.description, dataUrl };
    }));

    res.json({ tourId, sheets, workspaceId });
  } catch (err: unknown) {
    log.error("Print QR generation failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Print QR generation failed" });
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
