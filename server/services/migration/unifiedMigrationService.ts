/**
 * Unified Migration Service — Wave 17
 * ONE service. Replaces importRoutes.ts + migration.ts fragmentation.
 *
 * PIPELINE: Upload → Parse (AI) → Preview (confidence-scored) → Commit
 * FORMATS:  CSV | XLSX/XLS | PDF
 * ENTITIES: employees | clients | shifts
 *
 * FEATURES:
 *   - Gemini Flash parses ANY messy file (GetSling, TrackTik, ADP, Gusto)
 *   - Confidence scoring per row: auto≥90, review 50-89, fix<50
 *   - Ghost Employee bridge: missing fields → incomplete status + self-complete token
 *   - Workspace-scoped import lock (no concurrent imports)
 *   - Persistent import_history audit trail with batch rollback ID
 *   - Shift import: parses natural-language schedules
 */

import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { pool } from "../../db";
import { meteredGemini } from "../billing/meteredGeminiClient";
import { GEMINI_MODELS } from "../ai-brain/providers/geminiClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("UnifiedMigration");

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImportEntityType = "employees" | "clients" | "shifts";
export type JobStatus = "parsing" | "ready" | "importing" | "completed" | "failed" | "cancelled";

export interface ImportRow {
  rowIndex: number;
  raw: Record<string, string>;
  mapped: Record<string, string | null>;
  confidence: number;
  errors: string[];
  warnings: string[];
  status: "auto" | "review" | "fix" | "approved" | "skipped";
  isGhost: boolean;
}

export interface ImportJob {
  id: string;
  workspaceId: string;
  userId: string;
  entityType: ImportEntityType;
  fileName: string;
  status: JobStatus;
  rows: ImportRow[];
  totalRows: number;
  autoRows: number;
  reviewRows: number;
  fixRows: number;
  ghostRows: number;
  importedCount: number;
  batchId: string;
  aiModelUsed: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CommitResult {
  batchId: string;
  imported: number;
  ghosts: number;
  skipped: number;
  duplicates: number;
  errors: Array<{ rowIndex: number; error: string }>;
}

// ── Job store (2h TTL) ────────────────────────────────────────────────────────

const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const jobs = new Map<string, ImportJob>();
const importLocks = new Map<string, string>();

function evictExpiredJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.expiresAt.getTime() < now) jobs.delete(id);
  }
}

export function acquireLock(workspaceId: string, userId: string): boolean {
  if (importLocks.has(workspaceId)) return false;
  importLocks.set(workspaceId, userId);
  return true;
}
export function releaseLock(workspaceId: string): void { importLocks.delete(workspaceId); }
export function getLock(workspaceId: string): string | undefined { return importLocks.get(workspaceId); }

// ── File extraction ───────────────────────────────────────────────────────────

export function extractRawText(buffer: Buffer, mimetype: string, filename: string): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (mimetype === "text/csv" || mimetype === "text/plain" || ext === "csv" || ext === "txt") {
    return buffer.toString("utf-8");
  }
  if (mimetype.includes("spreadsheet") || mimetype.includes("excel") || ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(sheet);
  }
  if (mimetype === "application/pdf" || ext === "pdf") {
    return "__PDF_BASE64__:" + buffer.toString("base64");
  }
  return buffer.toString("utf-8");
}

// ── Gemini AI parser ──────────────────────────────────────────────────────────

const ENTITY_SCHEMAS: Record<ImportEntityType, string> = {
  employees: `{ "firstName":"string","lastName":"string","email":"string|null","phone":"E.164|null","position":"string|null","hourlyRate":"number|null","employeeNumber":"string|null","department":"string|null","hireDate":"ISO date|null","stateLicenseNumber":"string|null" }`,
  clients: `{ "companyName":"string|null","firstName":"string","lastName":"string|null","email":"string|null","phone":"string|null","address":"string|null","city":"string|null","state":"string|null","billingRate":"number|null","siteName":"string|null" }`,
  shifts: `{ "siteName":"string","startTime":"HH:MM 24h","endTime":"HH:MM 24h","daysOfWeek":"array of day names","positionRequired":"string|null","employeeName":"string|null","startDate":"ISO date|null","notes":"string|null" }`,
};

export async function parseWithGemini(params: {
  rawText: string;
  entityType: ImportEntityType;
  workspaceId: string;
  userId: string;
  fileName: string;
}): Promise<{ rows: ImportRow[]; modelUsed: string }> {
  const { rawText, entityType, workspaceId, userId, fileName } = params;

  const systemPrompt = [
    "You are an expert data migration assistant for CoAIleague, a security workforce management platform.",
    "Parse exported data from ANY security software (GetSling, TrackTik, ADP, Gusto, Deputy, When I Work, QuickBooks).",
    "Return ONLY valid JSON. No markdown, no explanation.",
    "Assign confidence 0-100 per row. For phone: normalize to E.164 (+1XXXXXXXXXX).",
    "Split 'Smith, John' or 'John Smith' name formats correctly.",
    "For shifts: parse 'Mon/Wed/Fri 6AM-2PM' into structured fields.",
    "Schema for each row: " + ENTITY_SCHEMAS[entityType],
    "Return: { rows: [{ rowIndex, mapped, confidence, warnings, isDuplicate }], detectedSource, columnNotes }",
  ].join(" ");

  const userPrompt = rawText.startsWith("__PDF_BASE64__:")
    ? "Parse this PDF and extract all " + entityType + " records."
    : "File: " + fileName + "\n\nDATA:\n" + rawText.slice(0, 120000);

  const result = await meteredGemini.generateContent({
    model: GEMINI_MODELS.FLASH,
    systemInstruction: systemPrompt,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    workspaceId,
    userId,
    feature: "migration_parse",
  });

  const text = result.response.text().trim()
    .replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(text) as {
    rows: Array<{ rowIndex: number; mapped: Record<string, string | null | number>; confidence: number; warnings: string[]; isDuplicate: boolean }>;
  };

  const rows: ImportRow[] = parsed.rows.map((r, i) => {
    const confidence = Math.max(0, Math.min(100, r.confidence || 0));
    const mapped = normalizeValues(r.mapped);
    const errors = validateMapped(mapped, entityType);
    const warnings = r.warnings || [];
    if (r.isDuplicate) warnings.push("Possible duplicate within this file");

    const isGhost = errors.length > 0 && entityType === "employees" &&
      Boolean(mapped.firstName) && Boolean(mapped.lastName) &&
      (!mapped.email || !mapped.phone);

    const status = (errors.length > 0 && !isGhost) ? "fix"
      : confidence >= 90 ? "auto"
      : confidence >= 50 ? "review"
      : "fix";

    return { rowIndex: r.rowIndex || i + 1, raw: {}, mapped, confidence, errors, warnings, status, isGhost };
  });

  log.info("[Migration] Gemini parsed " + rows.length + " " + entityType + " rows from " + fileName);
  return { rows, modelUsed: GEMINI_MODELS.FLASH };
}

// ── Normalization + validation ────────────────────────────────────────────────

function normalizeValues(mapped: Record<string, string | null | number>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(mapped)) {
    if (v === null || v === undefined) { out[k] = null; continue; }
    const s = String(v).trim();
    if ((k === "phone") && s) {
      const digits = s.replace(/\D/g, "");
      if (digits.length === 10) out[k] = "+1" + digits;
      else if (digits.length === 11 && digits[0] === "1") out[k] = "+" + digits;
      else out[k] = s || null;
    } else {
      out[k] = s || null;
    }
  }
  return out;
}

function validateMapped(mapped: Record<string, string | null>, entityType: ImportEntityType): string[] {
  const errors: string[] = [];
  if (entityType === "employees") {
    if (!mapped.firstName) errors.push("Missing first name");
    if (!mapped.lastName) errors.push("Missing last name");
    if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) errors.push("Invalid email");
    if (mapped.hourlyRate && isNaN(parseFloat(mapped.hourlyRate))) errors.push("Invalid hourly rate");
  }
  if (entityType === "clients") {
    if (!mapped.firstName && !mapped.companyName) errors.push("Missing contact name or company name");
    if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) errors.push("Invalid email");
  }
  if (entityType === "shifts") {
    if (!mapped.siteName) errors.push("Missing site name");
    if (!mapped.startTime) errors.push("Missing start time");
    if (!mapped.endTime) errors.push("Missing end time");
    if (!mapped.daysOfWeek) errors.push("Missing days of week");
  }
  return errors;
}

// ── Job management ────────────────────────────────────────────────────────────

export function createJob(params: { workspaceId: string; userId: string; entityType: ImportEntityType; fileName: string; rows: ImportRow[]; modelUsed: string }): ImportJob {
  evictExpiredJobs();
  const { workspaceId, userId, entityType, fileName, rows, modelUsed } = params;
  const autoRows   = rows.filter(r => r.status === "auto").length;
  const reviewRows = rows.filter(r => r.status === "review").length;
  const fixRows    = rows.filter(r => r.status === "fix").length;
  const ghostRows  = rows.filter(r => r.isGhost).length;
  const now = new Date();
  const job: ImportJob = {
    id: randomUUID(), workspaceId, userId, entityType, fileName, status: "ready",
    rows, totalRows: rows.length, autoRows, reviewRows, fixRows, ghostRows,
    importedCount: 0, batchId: randomUUID(), aiModelUsed: modelUsed,
    createdAt: now, expiresAt: new Date(now.getTime() + JOB_TTL_MS),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(jobId: string, workspaceId: string): ImportJob | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (job.workspaceId !== workspaceId) return null;
  if (job.expiresAt.getTime() < Date.now()) { jobs.delete(jobId); return null; }
  return job;
}

export function updateJobRows(jobId: string, workspaceId: string, updates: Array<{ rowIndex: number; mapped: Record<string, string | null> }>): ImportJob | null {
  const job = getJob(jobId, workspaceId);
  if (!job || job.status !== "ready") return null;
  for (const upd of updates) {
    const row = job.rows.find(r => r.rowIndex === upd.rowIndex);
    if (!row) continue;
    row.mapped = { ...row.mapped, ...upd.mapped };
    row.errors = validateMapped(row.mapped, job.entityType);
    // Ghost: employee has name but cannot be contacted (missing both email AND phone)
    row.isGhost = job.entityType === "employees" &&
      Boolean(row.mapped.firstName) && Boolean(row.mapped.lastName) &&
      !row.mapped.email && !row.mapped.phone;
    row.status = row.errors.length === 0 ? "approved" : row.isGhost ? "review" : "fix";
  }
  job.autoRows   = job.rows.filter(r => r.status === "auto").length;
  job.reviewRows = job.rows.filter(r => r.status === "review" || r.status === "approved").length;
  job.fixRows    = job.rows.filter(r => r.status === "fix").length;
  job.ghostRows  = job.rows.filter(r => r.isGhost).length;
  return job;
}

export function cancelJob(jobId: string, workspaceId: string): boolean {
  const job = getJob(jobId, workspaceId);
  if (!job) return false;
  job.status = "cancelled";
  jobs.delete(jobId);
  return true;
}

// ── Commit ────────────────────────────────────────────────────────────────────

export async function commitJob(jobId: string, workspaceId: string, userId: string): Promise<CommitResult> {
  const job = getJob(jobId, workspaceId);
  if (!job) throw new Error("Job not found or expired");
  if (job.status === "completed") throw new Error("Already committed");
  if (job.status === "importing") throw new Error("Commit in progress");

  job.status = "importing";
  const result: CommitResult = { batchId: job.batchId, imported: 0, ghosts: 0, skipped: 0, duplicates: 0, errors: [] };
  const eligible = job.rows.filter(r => r.status === "auto" || r.status === "review" || r.status === "approved" || r.isGhost);
  if (eligible.length === 0) { job.status = "failed"; throw new Error("No eligible rows. Fix errors first."); }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of eligible) {
      try {
        if (job.entityType === "employees") {
          const r = await commitEmployee(client, row, workspaceId, job.batchId);
          if (r === "duplicate") result.duplicates++;
          else if (r === "ghost") result.ghosts++;
          else result.imported++;
        } else if (job.entityType === "clients") {
          const r = await commitClient(client, row, workspaceId, job.batchId);
          if (r === "duplicate") result.duplicates++;
          else result.imported++;
        } else if (job.entityType === "shifts") {
          await commitShift(client, row, workspaceId, job.batchId);
          result.imported++;
        }
      } catch (rowErr: unknown) {
        result.errors.push({ rowIndex: row.rowIndex, error: rowErr instanceof Error ? rowErr.message : String(rowErr) });
      }
    }
    await client.query(
      "INSERT INTO import_history (id,workspace_id,user_id,batch_id,entity_type,file_name,total_rows,imported_count,ghost_count,duplicate_count,error_count,ai_model_used,status,created_at) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) ON CONFLICT DO NOTHING",
      [workspaceId, userId, job.batchId, job.entityType, job.fileName, job.totalRows, result.imported, result.ghosts, result.duplicates, result.errors.length, job.aiModelUsed, result.errors.length === 0 ? "completed" : "partial"]
    );
    await client.query("COMMIT");
  } catch (txErr) {
    await client.query("ROLLBACK");
    job.status = "failed";
    throw txErr;
  } finally { client.release(); }

  job.status = "completed";
  job.importedCount = result.imported + result.ghosts;
  return result;
}

type DbClient = Awaited<ReturnType<typeof pool.connect>>;

async function commitEmployee(client: DbClient, row: ImportRow, workspaceId: string, batchId: string): Promise<"imported" | "ghost" | "duplicate"> {
  const m = row.mapped;
  if (m.email) {
    const ex = await client.query("SELECT id FROM employees WHERE workspace_id=$1 AND email=$2 LIMIT 1", [workspaceId, m.email]);
    if (ex.rowCount && ex.rowCount > 0) return "duplicate";
  }
  const isGhost = row.isGhost || (!m.email && !m.phone);
  const completionToken = isGhost ? randomUUID() : null;
  await client.query(
    "INSERT INTO employees (id,workspace_id,first_name,last_name,email,phone,role,hourly_rate,employee_number,is_active,onboarding_status,completion_token,import_batch_id,created_at,updated_at) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,NOW(),NOW()) ON CONFLICT (workspace_id,email) WHERE email IS NOT NULL DO NOTHING",
    [workspaceId, m.firstName || "Unknown", m.lastName || "", m.email || null, m.phone || null, m.position || null, m.hourlyRate ? parseFloat(m.hourlyRate).toFixed(2) : null, m.employeeNumber || null, isGhost ? "pending" : "invited", completionToken, batchId]
  );
  if (isGhost && m.phone) {
    const completeUrl = "https://coaileague.com/complete/" + completionToken;
    const { sendSMS } = await import("../smsService");
    sendSMS({ to: m.phone, body: "Your employer has added you to CoAIleague. Complete your profile: " + completeUrl, workspaceId, type: "system_alert" }).catch(() => {});
  }
  return isGhost ? "ghost" : "imported";
}

async function commitClient(client: DbClient, row: ImportRow, workspaceId: string, batchId: string): Promise<"imported" | "duplicate"> {
  const m = row.mapped;
  if (m.email) {
    const ex = await client.query("SELECT id FROM clients WHERE workspace_id=$1 AND email=$2 LIMIT 1", [workspaceId, m.email]);
    if (ex.rowCount && ex.rowCount > 0) return "duplicate";
  }
  await client.query(
    "INSERT INTO clients (id,workspace_id,first_name,last_name,company_name,email,phone,address,city,state,import_batch_id,created_at,updated_at) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) ON CONFLICT DO NOTHING",
    [workspaceId, m.firstName || "Unknown", m.lastName || null, m.companyName || null, m.email || null, m.phone || null, m.address || null, m.city || null, m.state || null, batchId]
  );
  return "imported";
}

async function commitShift(client: DbClient, row: ImportRow, workspaceId: string, batchId: string): Promise<void> {
  const m = row.mapped;
  let siteId: string | null = null;
  if (m.siteName) {
    const sr = await client.query("SELECT id FROM sites WHERE workspace_id=$1 AND LOWER(name) ILIKE $2 LIMIT 1", [workspaceId, "%" + m.siteName.toLowerCase() + "%"]);
    siteId = sr.rows[0]?.id || null;
  }
  let employeeId: string | null = null;
  if (m.employeeName) {
    const parts = m.employeeName.trim().split(/\s+/);
    const er = await client.query("SELECT id FROM employees WHERE workspace_id=$1 AND (LOWER(first_name) ILIKE $2 OR LOWER(first_name||' '||last_name) ILIKE $3) AND is_active=true LIMIT 1", [workspaceId, "%" + (parts[0] || "").toLowerCase() + "%", "%" + m.employeeName.toLowerCase() + "%"]);
    employeeId = er.rows[0]?.id || null;
  }
  const today = new Date();
  const [sh, sm] = (m.startTime || "08:00").split(":").map(Number);
  const [eh, em] = (m.endTime || "16:00").split(":").map(Number);
  const startDate = m.startDate ? new Date(m.startDate) : today;
  startDate.setHours(sh, sm, 0, 0);
  const endDate = new Date(startDate);
  endDate.setHours(eh, em, 0, 0);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
  await client.query(
    "INSERT INTO shifts (id,workspace_id,site_id,assigned_employee_id,start_time,end_time,position_required,notes,status,import_batch_id,created_at,updated_at) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,'draft',$8,NOW(),NOW())",
    [workspaceId, siteId, employeeId, startDate.toISOString(), endDate.toISOString(), m.positionRequired || null, m.notes || (m.daysOfWeek ? "Recurring: " + m.daysOfWeek : null), batchId]
  );
}

// ── Rollback ──────────────────────────────────────────────────────────────────

export async function rollbackBatch(batchId: string, workspaceId: string): Promise<{ deleted: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let deleted = 0;
    for (const table of ["employees", "clients", "shifts"]) {
      const r = await client.query("DELETE FROM " + table + " WHERE workspace_id=$1 AND import_batch_id=$2", [workspaceId, batchId]);
      deleted += r.rowCount || 0;
    }
    await client.query("UPDATE import_history SET status='rolled_back',updated_at=NOW() WHERE batch_id=$1 AND workspace_id=$2", [batchId, workspaceId]);
    await client.query("COMMIT");
    log.info("[Migration] Rolled back batch " + batchId + ": " + deleted + " records deleted");
    return { deleted };
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ── History ───────────────────────────────────────────────────────────────────

export async function getImportHistory(workspaceId: string): Promise<unknown[]> {
  const { rows } = await pool.query(
    "SELECT id,batch_id,entity_type,file_name,total_rows,imported_count,ghost_count,duplicate_count,error_count,ai_model_used,status,created_at FROM import_history WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50",
    [workspaceId]
  );
  return rows;
}

// ── Schema bootstrap ──────────────────────────────────────────────────────────

export async function ensureImportSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS import_history (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id VARCHAR NOT NULL,
        user_id VARCHAR,
        batch_id VARCHAR NOT NULL UNIQUE,
        entity_type VARCHAR NOT NULL,
        file_name VARCHAR,
        total_rows INTEGER DEFAULT 0,
        imported_count INTEGER DEFAULT 0,
        ghost_count INTEGER DEFAULT 0,
        duplicate_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        ai_model_used VARCHAR,
        status VARCHAR NOT NULL DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS import_history_workspace_idx ON import_history(workspace_id, created_at DESC);
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS import_batch_id VARCHAR;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS completion_token VARCHAR;
      ALTER TABLE clients   ADD COLUMN IF NOT EXISTS import_batch_id VARCHAR;
      ALTER TABLE shifts    ADD COLUMN IF NOT EXISTS import_batch_id VARCHAR;
    `);
    log.info("[Migration] Import schema ensured");
  } catch (err: unknown) {
    log.warn("[Migration] Schema ensure failed (non-fatal):", err instanceof Error ? err.message : String(err));
  } finally { client.release(); }
}
