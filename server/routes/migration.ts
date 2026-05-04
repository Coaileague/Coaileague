/**
 * Migration Routes — Wave 17 STUBBED
 * All functionality has been consolidated into the Unified Migration Service.
 * Endpoint: /api/import (importRoutes.ts → unifiedMigrationService.ts)
 *
 * These stubs redirect callers to the new unified API with helpful messages.
 * The router is still mounted at /api/migration for backward compatibility.
 */

import { Router, type Request, type Response } from "express";
import type { AuthenticatedRequest } from "../auth";
export const migrationRouter = Router();

const REDIRECT_MSG = {
  message: "This endpoint has been consolidated into the Unified Migration Service.",
  newEndpoint: "/api/import",
  docs: {
    parse:   "POST /api/import/parse       — upload CSV/XLSX/PDF file",
    jobs:    "GET  /api/import/jobs/:jobId  — check job status + rows",
    edit:    "PUT  /api/import/jobs/:jobId/rows — edit rows before commit",
    commit:  "POST /api/import/jobs/:jobId/commit — approve and commit",
    cancel:  "DELETE /api/import/jobs/:jobId",
    rollback:"POST /api/import/rollback/:batchId",
    history: "GET  /api/import/history",
  },
};

migrationRouter.post("/upload",           (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
migrationRouter.get("/analyze/:jobId",    (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
migrationRouter.post("/import/:jobId",    (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
migrationRouter.get("/jobs",              (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
migrationRouter.get("/records/:jobId",    (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
migrationRouter.post("/ai-map/:jobId",    (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
migrationRouter.post("/promote/:jobId",   (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
migrationRouter.post("/cancel/:jobId",    (_req: Request, res: Response) => res.status(301).json(REDIRECT_MSG));
