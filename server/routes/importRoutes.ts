/**
 * Import Routes — Wave 17 Unified
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin router. All logic lives in unifiedMigrationService.ts.
 * Replaces both the old importRoutes.ts (CSV-only string input) and
 * migration.ts (in-memory CSV jobs, no Excel, no AI column mapper).
 *
 * Mounted at: /api/import  (orgs.ts — already registered)
 *
 * Routes:
 *   POST   /api/import/parse             — upload file → Gemini → return jobId + preview
 *   GET    /api/import/jobs/:jobId       — get job status + all rows
 *   PUT    /api/import/jobs/:jobId/rows  — edit individual rows before commit
 *   POST   /api/import/jobs/:jobId/commit — commit approved rows
 *   DELETE /api/import/jobs/:jobId       — cancel job
 *   POST   /api/import/rollback/:batchId — undo a committed batch
 *   GET    /api/import/history           — audit trail of past imports
 */

import { Router } from "express";
import multer from "multer";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth";
import { createLogger } from "../lib/logger";
import {
  extractRawText, parseWithGemini, createJob, getJob,
  updateJobRows, cancelJob, commitJob, rollbackBatch, getImportHistory,
  acquireLock, releaseLock, getLock, ensureImportSchema,
  type ImportEntityType,
} from "../services/migration/unifiedMigrationService";

const log = createLogger("ImportRoutes");
const importRouter = Router();

// multer: memory storage, 25MB max, allow CSV/Excel/PDF
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv", "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/pdf",
    ];
    const ext = (file.originalname.split(".").pop() || "").toLowerCase();
    const allowedExt = ["csv", "xlsx", "xls", "pdf", "txt"];
    if (allowed.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Upload CSV, XLSX, XLS, or PDF."));
    }
  },
});

// Run schema bootstrap on startup (non-blocking)
ensureImportSchema().catch(() => {});

// ── POST /api/import/parse ───────────────────────────────────────────────────
// Accepts a file upload + entityType query param.
// Returns jobId, preview of first 10 rows, and summary counts.
importRouter.post("/parse", upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || "unknown";
    const entityType = (req.query.entityType || req.body.entityType || "employees") as ImportEntityType;

    if (!["employees", "clients", "shifts"].includes(entityType)) {
      return res.status(400).json({ error: "entityType must be employees, clients, or shifts" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Send a CSV, XLSX, or PDF as multipart field named 'file'." });
    }

    // Workspace lock — prevent concurrent imports
    if (!acquireLock(workspaceId, userId)) {
      const holder = getLock(workspaceId);
      return res.status(409).json({ error: "An import is already in progress for this workspace.", lockedBy: holder });
    }

    try {
      const rawText = extractRawText(req.file.buffer, req.file.mimetype, req.file.originalname);

      if (!rawText || rawText.length < 10) {
        return res.status(400).json({ error: "File appears to be empty or unreadable." });
      }

      // Gemini parses the file — returns confidence-scored rows
      const { rows, modelUsed } = await parseWithGemini({
        rawText, entityType, workspaceId, userId,
        fileName: req.file.originalname,
      });

      if (rows.length === 0) {
        return res.status(400).json({ error: "No records found in this file. Check that the file has data rows." });
      }

      const job = createJob({ workspaceId, userId, entityType, fileName: req.file.originalname, rows, modelUsed });

      return res.json({
        jobId: job.id,
        batchId: job.batchId,
        entityType: job.entityType,
        fileName: job.fileName,
        status: job.status,
        totalRows: job.totalRows,
        autoRows: job.autoRows,
        reviewRows: job.reviewRows,
        fixRows: job.fixRows,
        ghostRows: job.ghostRows,
        aiModelUsed: job.aiModelUsed,
        expiresAt: job.expiresAt,
        preview: job.rows.slice(0, 10).map(r => ({
          rowIndex: r.rowIndex, mapped: r.mapped, confidence: r.confidence,
          status: r.status, errors: r.errors, warnings: r.warnings, isGhost: r.isGhost,
        })),
      });
    } finally {
      releaseLock(workspaceId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[ImportRoutes] /parse error:", msg);
    return res.status(500).json({ error: "Parse failed: " + msg });
  }
});

// ── GET /api/import/jobs/:jobId ──────────────────────────────────────────────
importRouter.get("/jobs/:jobId", (req: AuthenticatedRequest, res: Response) => {
  const job = getJob(req.params.jobId, req.workspaceId!);
  if (!job) return res.status(404).json({ error: "Job not found or expired (2h TTL)." });
  return res.json({
    jobId: job.id, batchId: job.batchId, entityType: job.entityType,
    fileName: job.fileName, status: job.status,
    totalRows: job.totalRows, autoRows: job.autoRows,
    reviewRows: job.reviewRows, fixRows: job.fixRows, ghostRows: job.ghostRows,
    importedCount: job.importedCount, aiModelUsed: job.aiModelUsed,
    expiresAt: job.expiresAt,
    rows: job.rows.map(r => ({
      rowIndex: r.rowIndex, mapped: r.mapped, confidence: r.confidence,
      status: r.status, errors: r.errors, warnings: r.warnings, isGhost: r.isGhost,
    })),
  });
});

// ── PUT /api/import/jobs/:jobId/rows ────────────────────────────────────────
// Body: { updates: [{ rowIndex: number, mapped: { ...fields } }] }
importRouter.put("/jobs/:jobId/rows", (req: AuthenticatedRequest, res: Response) => {
  const { updates } = req.body as { updates: Array<{ rowIndex: number; mapped: Record<string, string | null> }> };
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: "updates must be a non-empty array." });
  }
  const job = updateJobRows(req.params.jobId, req.workspaceId!, updates);
  if (!job) return res.status(404).json({ error: "Job not found, expired, or not in ready state." });
  return res.json({
    jobId: job.id, status: job.status,
    totalRows: job.totalRows, autoRows: job.autoRows,
    reviewRows: job.reviewRows, fixRows: job.fixRows, ghostRows: job.ghostRows,
    message: updates.length + " row(s) updated.",
  });
});

// ── POST /api/import/jobs/:jobId/commit ─────────────────────────────────────
importRouter.post("/jobs/:jobId/commit", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || "unknown";

    if (!acquireLock(workspaceId, userId)) {
      return res.status(409).json({ error: "An import is already in progress for this workspace." });
    }

    try {
      const result = await commitJob(req.params.jobId, workspaceId, userId);
      return res.json({
        success: true,
        batchId: result.batchId,
        imported: result.imported,
        ghosts: result.ghosts,
        duplicates: result.duplicates,
        skipped: result.skipped,
        errors: result.errors,
        message: [
          result.imported > 0 ? result.imported + " record(s) imported." : "",
          result.ghosts > 0 ? result.ghosts + " incomplete record(s) created — self-complete invitations sent." : "",
          result.duplicates > 0 ? result.duplicates + " duplicate(s) skipped." : "",
          result.errors.length > 0 ? result.errors.length + " row(s) failed." : "",
        ].filter(Boolean).join(" "),
      });
    } finally {
      releaseLock(workspaceId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[ImportRoutes] /commit error:", msg);
    return res.status(500).json({ error: "Commit failed: " + msg });
  }
});

// ── DELETE /api/import/jobs/:jobId ──────────────────────────────────────────
importRouter.delete("/jobs/:jobId", (req: AuthenticatedRequest, res: Response) => {
  const cancelled = cancelJob(req.params.jobId, req.workspaceId!);
  if (!cancelled) return res.status(404).json({ error: "Job not found or already completed." });
  return res.json({ success: true, message: "Import job cancelled." });
});

// ── POST /api/import/rollback/:batchId ──────────────────────────────────────
importRouter.post("/rollback/:batchId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await rollbackBatch(req.params.batchId, req.workspaceId!);
    return res.json({ success: true, deleted: result.deleted, message: result.deleted + " records rolled back." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[ImportRoutes] /rollback error:", msg);
    return res.status(500).json({ error: "Rollback failed: " + msg });
  }
});

// ── GET /api/import/history ─────────────────────────────────────────────────
importRouter.get("/history", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await getImportHistory(req.workspaceId!);
    return res.json({ history });
  } catch (err: unknown) {
    log.error("[ImportRoutes] /history error:", err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: "Failed to load import history." });
  }
});

export default importRouter;
