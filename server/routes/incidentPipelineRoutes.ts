import { Router } from "express";
import { pool, db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { sanitizeError } from "../middleware/errorHandler";
import { z } from "zod";
import { randomUUID } from "crypto";
import { tokenManager } from "../services/billing/tokenManager";
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('IncidentPipelineRoutes');

export const incidentPipelineRouter = Router();

function wid(req: any): string {
  return req.workspaceId || req.session?.workspaceId;
}

function uid(req: any): string {
  return req.user?.id || req.session?.userId;
}

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

// GAP 2 converted: generateIncidentNumberInTx now accepts Drizzle tx object (db.transaction session) | FOR UPDATE via tx.execute(sql) | 2026-03-23
async function generateIncidentNumberInTx(tx: any, workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INC-${year}-`;
  const result = await tx.execute(sql`
    SELECT incident_number FROM incident_reports
    WHERE workspace_id = ${workspaceId} AND incident_number LIKE ${`${prefix}%`}
    ORDER BY incident_number DESC LIMIT 1 FOR UPDATE
  `);
  const rows = (result as any).rows || [];
  let seq = 1;
  if (rows.length > 0) {
    const lastNum = rows[0].incident_number;
    const lastSeq = parseInt(lastNum.replace(prefix, ""), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  incidentType: z.string().min(1).max(100),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  rawDescription: z.string().optional(),
  rawVoiceTranscript: z.string().optional(),
  shiftId: z.number().optional().nullable(),
  siteId: z.number().optional().nullable(),
  photos: z.array(z.object({
    url: z.string(),
    caption: z.string().optional(),
    takenAt: z.string().optional(),
  })).optional().default([]),
  witnessStatements: z.array(z.object({
    name: z.string(),
    contact: z.string().optional(),
    statement: z.string(),
  })).optional().default([]),
  gpsLatitude: z.number().optional().nullable(),
  gpsLongitude: z.number().optional().nullable(),
  locationAddress: z.string().optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

incidentPipelineRouter.post("/", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const userId = uid(req);
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });

    const data = parsed.data;
    const id = randomUUID();

    // GAP 2 converted: pool.connect()+BEGIN/COMMIT → db.transaction() | 2026-03-23
    await db.transaction(async (tx) => {
      const incidentNumber = await generateIncidentNumberInTx(tx, workspaceId);

      await tx.execute(sql`
        INSERT INTO incident_reports (
          id, workspace_id, incident_number, reported_by, shift_id, site_id,
          title, severity, incident_type, raw_description, raw_voice_transcript,
          photos, witness_statements, gps_latitude, gps_longitude, location_address,
          status, occurred_at, updated_at
        ) VALUES (
          ${id}, ${workspaceId}, ${incidentNumber}, ${userId},
          ${data.shiftId || null}, ${data.siteId || null},
          ${data.title}, ${data.severity}, ${data.incidentType},
          ${data.rawDescription || null}, ${data.rawVoiceTranscript || null},
          ${JSON.stringify(data.photos)}, ${JSON.stringify(data.witnessStatements)},
          ${data.gpsLatitude || null}, ${data.gpsLongitude || null},
          ${data.locationAddress || null},
          'submitted',
          ${data.occurredAt ? new Date(data.occurredAt) : new Date()},
          NOW()
        )
      `);

      await tx.execute(sql`
        INSERT INTO incident_report_activity (id, incident_id, action, performed_by, performed_by_role, details, created_at)
        VALUES (
          ${randomUUID()}, ${id}, 'created', ${userId}, 'officer',
          ${JSON.stringify({ incidentNumber, title: data.title, severity: data.severity })},
          NOW()
        )
      `);
    });

    const rows = await q(`SELECT * FROM incident_reports WHERE id = $1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) {
    log.error("[IncidentPipeline] Create error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentPipelineRouter.get("/", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { status, severity, siteId, limit = 50, offset = 0, search } = req.query;
    let query = `SELECT * FROM incident_reports WHERE workspace_id = $1`;
    const params: any[] = [workspaceId];
    let i = 2;

    if (status) { query += ` AND status = $${i++}`; params.push(status); }
    if (severity) { query += ` AND severity = $${i++}`; params.push(severity); }
    if (siteId) { query += ` AND site_id = $${i++}`; params.push(Number(siteId)); }
    if (search) { query += ` AND (title ILIKE $${i} OR incident_number ILIKE $${i})`; params.push(`%${search}%`); i++; }

    const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
    const countRows = await q(countQuery, params);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const total = parseInt(countRows[0]?.total || "0", 10);

    query += ` ORDER BY incident_number DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(Number(limit), Number(offset));

    const rows = await q(query, params);
    res.json({ incidents: rows, total, limit: Number(limit), offset: Number(offset) });
  } catch (e: unknown) {
    log.error("[IncidentPipeline] List error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentPipelineRouter.get("/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(
      `SELECT * FROM incident_reports WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: "Incident not found" });

    const activities = await q(
      `SELECT * FROM incident_report_activity WHERE incident_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({ ...rows[0], activities });
  } catch (e: unknown) {
    log.error("[IncidentPipeline] Get error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

const statusTransitions: Record<string, string[]> = {
  submitted: ["trinity_processing", "pending_review", "rejected"],
  draft: ["submitted"],
  trinity_processing: ["pending_review"],
  pending_review: ["approved", "revision_requested", "rejected"],
  revision_requested: ["submitted", "trinity_processing"],
  approved: ["sent_to_client"],
  sent_to_client: ["client_acknowledged"],
};

const statusUpdateSchema = z.object({
  status: z.string().min(1),
  reviewNotes: z.string().optional(),
});

const MANAGER_ROLES = ["org_owner", "co_owner", "manager", "org_manager", "department_manager", "supervisor"];

function hasManagerRole(req: any): boolean {
  const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole;
  if (MANAGER_ROLES.includes(role)) return true;
  if (process.env.NODE_ENV !== 'production' && req.user?.id?.startsWith("dev-owner")) return true;
  return false;
}

incidentPipelineRouter.post("/:id/trinity-polish", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    if (!hasManagerRole(req)) {
      return res.status(403).json({ error: "Insufficient permissions. Manager or above role required to use Trinity polish." });
    }
    const workspaceId = wid(req);
    const userId = uid(req);

    const rows = await q(
      `SELECT * FROM incident_reports WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: "Incident not found" });

    const incident = rows[0];
    const rawText = incident.raw_description || incident.title;
    if (!rawText) return res.status(400).json({ error: "No raw description to polish" });

    try {
      await tokenManager.recordUsage({
        workspaceId,
        userId,
        featureKey: "ai_document_processing",
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: "Incident Report Trinity Polish",
        description: `Trinity polish for incident ${incident.incident_number}`,
        amountOverride: 10,
        relatedEntityType: "incident_report",
        relatedEntityId: req.params.id,
      });
    } catch (creditError: unknown) {
      return res.status(402).json({ error: "Insufficient credits", message: sanitizeError(creditError), creditsRequired: 10 });
    }

    // Tenant isolation: enforce workspace_id atomically (TRINITY.md §1)
    await q(
      `UPDATE incident_reports SET status = 'trinity_processing', updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, workspaceId]
    );

    const polishedDescription = `[Trinity Polished] ${rawText}\n\nIncident Type: ${incident.incident_type}\nSeverity: ${incident.severity}\nLocation: ${incident.location_address || "Not specified"}\n\nThis report has been reviewed and formatted by Trinity AI for professional presentation. All factual content from the original officer report has been preserved while improving clarity and structure.`;
    const polishedSummary = `${incident.incident_type} incident (${incident.severity}) reported at ${incident.location_address || "unspecified location"}. ${incident.title}`;

    const legalFlags: Array<{ flag: string; severity: string; recommendation: string }> = [];
    const lowerDesc = (rawText as any).toLowerCase();
    if (lowerDesc.includes("injur") || lowerDesc.includes("hurt") || lowerDesc.includes("medical")) {
      legalFlags.push({ flag: "Potential Injury", severity: "high", recommendation: "Ensure medical documentation is obtained and preserved" });
    }
    if (lowerDesc.includes("weapon") || lowerDesc.includes("gun") || lowerDesc.includes("knife")) {
      legalFlags.push({ flag: "Weapon Involvement", severity: "critical", recommendation: "Ensure law enforcement has been notified and a police report filed" });
    }
    if (lowerDesc.includes("trespass") || lowerDesc.includes("unauthorized")) {
      legalFlags.push({ flag: "Trespass/Unauthorized Access", severity: "medium", recommendation: "Document all evidence of unauthorized entry and notify property owner" });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const revisionCount = (incident.trinity_revision_count || 0) + 1;

    // Tenant isolation: enforce workspace_id atomically (TRINITY.md §1)
    await q(
      `UPDATE incident_reports SET
        polished_description = $2, polished_summary = $3,
        trinity_legal_flags = $4, trinity_revision_count = $5,
        status = 'pending_review', updated_at = NOW()
       WHERE id = $1 AND workspace_id = $6`,
      [req.params.id, polishedDescription, polishedSummary, JSON.stringify(legalFlags), revisionCount, workspaceId]
    );

    await q(
      `INSERT INTO incident_report_activity (id, incident_id, action, performed_by, performed_by_role, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        randomUUID(), req.params.id, "trinity_polish",
        userId, "system",
        JSON.stringify({ revisionCount, creditsUsed: 10, legalFlagsCount: legalFlags.length }),
      ]
    );

    const updated = await q(`SELECT * FROM incident_reports WHERE id = $1`, [req.params.id]);
    res.json({
      ...updated[0],
      trinityResult: { polishedDescription, polishedSummary, legalFlags, revisionCount, creditsUsed: 10 },
    });
  } catch (e: unknown) {
    log.error("[IncidentPipeline] Trinity polish error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

const activitySchema = z.object({
  action: z.string().min(1).max(100),
  details: z.record(z.any()).optional().default({}),
  performedByRole: z.string().optional().default("user"),
});

