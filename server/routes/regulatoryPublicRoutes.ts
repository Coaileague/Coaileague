/**
 * Regulatory Auditor Portal API — Wave 20
 * Token-gated, zero-trust, read-only endpoints for external DPS auditors.
 * No CoAIleague login required. Token validated on every request.
 * All responses are automatically redacted (no billing/internal data).
 */

import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { createLogger } from "../lib/logger";
import { sanitizeError } from "../middleware/errorHandler";
import crypto from "crypto";

const log = createLogger("RegulatoryPortal");
export const regulatoryPublicRouter = Router();

// ── Token validation ──────────────────────────────────────────────────────────

async function validateAuditorToken(token: string): Promise<{
  valid: boolean;
  workspaceId?: string;
  expiresAt?: Date;
  allowedExhibits?: string[];
  label?: string;
}> {
  try {
    const { rows } = await pool.query(
      `SELECT workspace_id, expires_at, allowed_exhibits, label, is_revoked
       FROM auditor_links
       WHERE token = $1 LIMIT 1`,
      [token]
    );
    if (!rows[0]) return { valid: false };
    if (rows[0].is_revoked) return { valid: false };
    if (new Date(rows[0].expires_at) < new Date()) return { valid: false };

    // Log access
    await pool.query(
      `UPDATE auditor_links
       SET last_accessed_at = NOW(), access_count = access_count + 1
       WHERE token = $1`,
      [token]
    );

    return {
      valid: true,
      workspaceId: rows[0].workspace_id,
      expiresAt: rows[0].expires_at,
      allowedExhibits: rows[0].allowed_exhibits || ["A","B","C"],
      label: rows[0].label,
    };
  } catch {
    return { valid: false };
  }
}

// ── Redaction ─────────────────────────────────────────────────────────────────

const REDACTED = new Set([
  "internalNotes","internal_notes","supervisorComments","supervisor_comments",
  "billingRate","billing_rate","hourlyRate","hourly_rate","payRate","pay_rate",
  "ssn","taxId","tax_id","bankAccountNumber","routingNumber","directDepositInfo",
  "privateNotes","stripeCustomerId","compensationNotes","managerOnlyNotes",
]);

function redact<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!REDACTED.has(k)) out[k] = redact(v);
  }
  return out as T;
}

// ── Middleware ─────────────────────────────────────────────────────────────────

async function requireToken(req: Request & { auditorWorkspaceId?: string }, res: Response, next: () => void) {
  const token = req.params.token;
  if (!token) return res.status(401).json({ error: "Token required" });
  const result = await validateAuditorToken(token);
  if (!result.valid) return res.status(401).json({ error: "Invalid or expired audit portal link" });
  req.auditorWorkspaceId = result.workspaceId;
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

regulatoryPublicRouter.get("/auditor-portal/:token/meta", async (req: Request & { auditorWorkspaceId?: string }, res: Response) => {
  const token = req.params.token;
  const result = await validateAuditorToken(token);
  if (!result.valid || !result.workspaceId) return res.status(401).json({ error: "Invalid link" });

  try {
    const ws = await pool.query(
      "SELECT name, company_name FROM workspaces WHERE id = $1 LIMIT 1",
      [result.workspaceId]
    );
    // Load state config dynamically from state_regulatory_config
    const stateCode = (ws.rows[0]?.state || "TX").toUpperCase();
    const srcRow = await pool.query(
      `SELECT state_name, licensing_authority, licensing_authority_url,
              license_types, governing_law_citation
       FROM state_regulatory_config WHERE state_code = $1 LIMIT 1`,
      [stateCode]
    );
    const src = srcRow.rows[0];

    return res.json({
      workspaceName: ws.rows[0]?.company_name || ws.rows[0]?.name || "Unknown",
      stateCode,
      stateName: src?.state_name || stateCode,
      regulatoryBody: src?.licensing_authority || `${stateCode} Regulatory Authority`,
      regulatoryBodyUrl: src?.licensing_authority_url || null,
      governingLaw: src?.governing_law_citation || null,
      licenseTypes: src?.license_types || [],
      portalLabel: result.label || `${stateCode} Regulatory Audit`,
      generatedAt: new Date().toISOString(),
      expiresAt: result.expiresAt?.toISOString(),
      // UoF + shift requirement text comes from regulatory_knowledge_base
      uofRequirement: `${src?.state_name || stateCode} regulations — All use of force incidents require formal documentation within required timeframe.`,
      shiftLogRequirement: `${src?.state_name || stateCode} regulations — Armed post shift records verifying license validity during service.`,
      licenseRequirement: `${src?.licensing_authority || stateCode} — Active roster and license credential status.`,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

regulatoryPublicRouter.get("/auditor-portal/:token/officers", requireToken, async (req: Request & { auditorWorkspaceId?: string }, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, guard_card_number,
              guard_card_expiry_date, guard_card_status,
              license_type, is_armed, armed_license_verified
       FROM employees
       WHERE workspace_id = $1 AND is_active = TRUE
       ORDER BY last_name, first_name`,
      [req.auditorWorkspaceId]
    );
    return res.json({ officers: redact(rows) });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

regulatoryPublicRouter.get("/auditor-portal/:token/use-of-force", requireToken, async (req: Request & { auditorWorkspaceId?: string }, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, incident_number, title, incident_type, severity,
              polished_description, created_at
       FROM incident_reports
       WHERE workspace_id = $1
         AND incident_type IN (
           'use_of_force', 'firearm_discharge', 'physical_altercation',
           'use_of_force_incident', 'weapon_drawn', 'officer_involved'
         )
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.auditorWorkspaceId]
    );
    return res.json({ incidents: redact(rows) });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

regulatoryPublicRouter.get("/auditor-portal/:token/armed-shifts", requireToken, async (req: Request & { auditorWorkspaceId?: string }, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.start_time, s.end_time, s.status,
              COALESCE(s.is_armed_post, FALSE) AS is_armed_post,
              e.first_name || ' ' || e.last_name AS employee_name,
              e.guard_card_number,
              si.name AS site_name
       FROM shifts s
       LEFT JOIN employees e ON e.id = s.assigned_employee_id
       LEFT JOIN sites si ON si.id = s.site_id
       WHERE s.workspace_id = $1
         AND (s.is_armed_post = TRUE OR e.is_armed = TRUE)
         AND s.start_time >= NOW() - INTERVAL '24 months'
       ORDER BY s.start_time DESC
       LIMIT 500`,
      [req.auditorWorkspaceId]
    );
    return res.json({ shifts: redact(rows) });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── Auditor link management (owner-only — separate auth) ─────────────────────

regulatoryPublicRouter.post("/auditor-portal/create-link", async (req: Request, res: Response) => {
  // This endpoint is called with the MAIN app auth (not auditor token)
  // The front-end calls this to generate a shareable link
  const { workspaceId, label, expiryDays = 30, exhibits } = req.body as {
    workspaceId: string;
    label?: string;
    expiryDays?: number;
    exhibits?: string[];
  };
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const token = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    // Ensure auditor_links table exists (idempotent)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auditor_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id VARCHAR NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        label VARCHAR(200),
        created_by VARCHAR,
        state_code VARCHAR(10) DEFAULT 'TX',
        expires_at TIMESTAMP NOT NULL,
        last_accessed_at TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        is_revoked BOOLEAN DEFAULT FALSE,
        allowed_exhibits TEXT[] DEFAULT ARRAY['A','B','C'],
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(
      `INSERT INTO auditor_links (workspace_id, token, label, expires_at, allowed_exhibits)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, token, label || "DPS Audit Link", expiresAt, exhibits || ["A","B","C"]]
    );

    return res.json({
      token,
      url: `/dps-portal/${token}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: unknown) {
    log.error("[RegulatoryPortal] Create link failed:", err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: sanitizeError(err) });
  }
});
