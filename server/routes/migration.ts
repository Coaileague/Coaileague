/**
 * CoAIleague Data Migration API — Employee CSV Import
 *
 * End-to-end pipeline:
 *   POST   /api/migration/upload          Accept CSV, parse + validate, return jobId + preview
 *   POST   /api/migration/analyze/:jobId  Re-analyze/inspect an uploaded job
 *   POST   /api/migration/import/:jobId   Confirm and write employees to DB
 *   GET    /api/migration/jobs            List recent import jobs for this workspace
 *   GET    /api/migration/records/:jobId  Get full record list for a job
 *   POST   /api/migration/cancel/:jobId   Discard an in-progress job
 *
 * Jobs are held in-memory for 2 hours, then auto-expired.
 * Supported CSV columns (case-insensitive):
 *   first_name, last_name, email, phone, role / job_title,
 *   hourly_rate, employee_number, pay_type, workspace_role
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { platformEventBus } from "../services/platformEventBus";
import { localVirusScan } from "../middleware/virusScan";
import { typedExec, typedQuery } from '../lib/typedSql';
import { users as usersTable, employees as employeesTable, workspaceMembers } from '@shared/schema';
import { createLogger } from '../lib/logger';
const log = createLogger('Migration');


export const migrationRouter = Router();
migrationRouter.use(requireAuth as any);
migrationRouter.use(ensureWorkspaceAccess as any);

// ─── IN-MEMORY JOB STORE ─────────────────────────────────────────────────────

interface MigrationRecord {
  row: number;
  data: Record<string, string>;
  mapped: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role?: string;
    hourlyRate?: string;
    employeeNumber?: string;
    payType?: string;
    workspaceRole?: string;
  };
  errors: string[];
  isValid: boolean;
}

interface MigrationJob {
  id: string;
  workspaceId: string;
  fileName: string;
  status: "pending" | "ready" | "importing" | "completed" | "cancelled" | "failed";
  totalRows: number;
  validRows: number;
  errorRows: number;
  importedCount?: number;
  records: MigrationRecord[];
  detectedColumns: string[];
  createdAt: Date;
  expiresAt: Date;
  error?: string;
}

const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const jobs = new Map<string, MigrationJob>();

function cleanExpiredJobs() {
  const now = new Date();
  for (const [id, job] of jobs.entries()) {
    if (job.expiresAt < now) jobs.delete(id);
  }
}

// ─── CSV PARSER ──────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === "," && !inQuote) {
        cols.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

const COLUMN_ALIASES: Record<string, keyof MigrationRecord["mapped"]> = {
  first_name: "firstName",   firstname: "firstName",    "first name": "firstName",
  last_name:  "lastName",    lastname:  "lastName",     "last name":  "lastName",
  email:      "email",       email_address: "email",
  phone:      "phone",       phone_number: "phone",     mobile: "phone",
  role:       "role",        job_title: "role",         title: "role",   position: "role",
  hourly_rate: "hourlyRate", rate: "hourlyRate",        pay_rate: "hourlyRate", wage: "hourlyRate",
  employee_number: "employeeNumber", emp_number: "employeeNumber", employee_id: "employeeNumber",
  pay_type:   "payType",     payment_type: "payType",
  workspace_role: "workspaceRole", access_level: "workspaceRole",
};

function mapColumns(headers: string[]): Record<number, keyof MigrationRecord["mapped"]> {
  const mapping: Record<number, keyof MigrationRecord["mapped"]> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i].toLowerCase().replace(/\s+/g, "_");
    const mapped = COLUMN_ALIASES[key];
    if (mapped) mapping[i] = mapped;
  }
  return mapping;
}

function validateRecord(mapped: MigrationRecord["mapped"]): string[] {
  const errors: string[] = [];
  if (!mapped.firstName?.trim()) errors.push("first_name is required");
  if (!mapped.lastName?.trim())  errors.push("last_name is required");
  if (!mapped.email?.trim())     errors.push("email is required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) errors.push("email format invalid");
  if (mapped.hourlyRate && isNaN(parseFloat(mapped.hourlyRate))) errors.push("hourly_rate must be numeric");
  if (mapped.payType && !["hourly", "salary"].includes(mapped.payType.toLowerCase()))
    errors.push("pay_type must be 'hourly' or 'salary'");
  if (mapped.workspaceRole && !["employee", "manager", "org_owner"].includes(mapped.workspaceRole.toLowerCase()))
    errors.push("workspace_role must be employee/manager/org_owner");
  return errors;
}

function buildJob(csvText: string, workspaceId: string, fileName: string): MigrationJob {
  const rows = parseCSV(csvText);
  const headers = rows.length > 0 ? rows[0] : [];
  const colMap = mapColumns(headers);
  const records: MigrationRecord[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const data: Record<string, string> = {};
    headers.forEach((h, i) => { data[h] = row[i] || ""; });
    const mapped: MigrationRecord["mapped"] = { firstName: "", lastName: "", email: "" };
    for (const [idx, field] of Object.entries(colMap)) {
      (mapped as any)[field] = (row[parseInt(idx)] || "").trim();
    }
    const errors = validateRecord(mapped);
    records.push({ row: r, data, mapped, errors, isValid: errors.length === 0 });
  }
  const valid   = records.filter(r => r.isValid).length;
  const invalid = records.length - valid;
  const now = new Date();
  return {
    id: randomUUID(), workspaceId, fileName,
    status: records.length === 0 ? "failed" : "ready",
    totalRows: records.length, validRows: valid, errorRows: invalid,
    records, detectedColumns: headers,
    createdAt: now, expiresAt: new Date(now.getTime() + JOB_TTL_MS),
  };
}

// ─── MULTER SETUP ────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ["text/csv", "application/vnd.ms-excel", "text/plain"];
    const isCsvExtension = file.originalname.toLowerCase().endsWith(".csv");
    if (allowedMimeTypes.includes(file.mimetype) || isCsvExtension) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted"));
    }
  },
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────

migrationRouter.post("/upload", upload.single("file"), localVirusScan, (req: any, res: any) => {
  try {
    cleanExpiredJobs();
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Send a CSV as multipart field named 'file'." });
    }
    const workspaceId: string = req.workspaceId!;
    const csvText = req.file.buffer.toString("utf-8");
    const job = buildJob(csvText, workspaceId, req.file.originalname);
    if (job.totalRows === 0) {
      return res.status(400).json({ error: "CSV has no data rows. Ensure the first row is a header row." });
    }
    jobs.set(job.id, job);
    res.json({
      jobId: job.id, fileName: job.fileName,
      totalRows: job.totalRows, validRows: job.validRows, errorRows: job.errorRows,
      detectedColumns: job.detectedColumns, status: job.status,
      preview: job.records.slice(0, 5).map(r => ({
        row: r.row, mapped: r.mapped, errors: r.errors, isValid: r.isValid,
      })),
      message: job.errorRows > 0
        ? `${job.validRows} rows ready to import, ${job.errorRows} row(s) have validation errors.`
        : `All ${job.validRows} rows validated and ready to import.`,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

migrationRouter.post("/analyze/:jobId", (req: any, res: any) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired (jobs expire after 2 hours)" });
  if (job.workspaceId !== req.workspaceId) return res.status(403).json({ error: "Access denied" });
  res.json({
    jobId: job.id, status: job.status,
    totalRows: job.totalRows, validRows: job.validRows, errorRows: job.errorRows,
    detectedColumns: job.detectedColumns,
    records: job.records.map(r => ({ row: r.row, mapped: r.mapped, errors: r.errors, isValid: r.isValid })),
  });
});

migrationRouter.post("/import/:jobId", async (req: any, res: any) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });
  if (job.workspaceId !== req.workspaceId) return res.status(403).json({ error: "Access denied" });
  if (job.status === "completed")  return res.status(409).json({ error: "Job already completed", importedCount: job.importedCount });
  if (job.status === "cancelled")  return res.status(409).json({ error: "Job was cancelled" });
  if (job.status === "importing")  return res.status(409).json({ error: "Import already in progress" });
  if (job.status === "failed" && job.error) return res.status(400).json({ error: job.error });

  const rows = job.records.filter(r => r.isValid);
  if (rows.length === 0) return res.status(400).json({ error: "No valid rows to import. Fix validation errors and re-upload." });

  job.status = "importing";
  let importedCount = 0;
  const importErrors: Array<{ row: number; error: string }> = [];

  try {
    for (const record of rows) {
      const { firstName, lastName, email, phone, role, hourlyRate, employeeNumber, payType, workspaceRole } = record.mapped;
      const empId  = randomUUID();
      const userId = randomUUID();
      const wsRole    = workspaceRole?.toLowerCase() || "employee";
      const payTypeVal = payType?.toLowerCase() || "hourly";
      const rateVal   = hourlyRate ? parseFloat(hourlyRate).toFixed(2) : "18.00";
      try {
        // CATEGORY C — Raw SQL retained: LIMIT | Tables: users | Verified: 2026-03-23
        const existing = await typedQuery(sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`);
        const finalUserId = (existing[0] as any)?.id || userId;
        if (!existing.length) {
          // Converted to Drizzle ORM: ON CONFLICT
          await db.insert(usersTable).values({
            id: userId,
            email,
            firstName,
            lastName,
            role: 'user',
            emailVerified: false,
            currentWorkspaceId: job.workspaceId,
            createdAt: sql`now()`,
            updatedAt: sql`now()`,
            loginAttempts: 0,
            mfaEnabled: false,
          }).onConflictDoNothing();
        }
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(employeesTable).values({
          id: empId,
          workspaceId: job.workspaceId,
          userId: finalUserId,
          firstName,
          lastName,
          email,
          phone: phone || null,
          role: role || "Security Officer",
          hourlyRate: rateVal,
          employeeNumber: employeeNumber || null,
          onboardingStatus: 'not_started',
          payType: payTypeVal,
          workspaceRole: wsRole as any,
          quickbooksSyncStatus: 'pending',
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }).onConflictDoNothing();
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(workspaceMembers).values({
          id: randomUUID(),
          userId: finalUserId,
          workspaceId: job.workspaceId,
          role: wsRole,
          status: 'active',
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }).onConflictDoNothing();
        importedCount++;
      } catch (rowErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        importErrors.push({ row: record.row, error: rowErr.message });
      }
    }
    job.status = importErrors.length === rows.length ? "failed" : "completed";
    job.importedCount = importedCount;

    if (job.status === "completed" && importedCount > 0) {
      platformEventBus.publish({
        type: 'employees_imported',
        category: 'automation',
        title: `${importedCount} Employee${importedCount !== 1 ? 's' : ''} Imported`,
        description: `Bulk CSV import completed: ${importedCount} of ${rows.length} employee${rows.length !== 1 ? 's' : ''} imported into workspace`,
        workspaceId: job.workspaceId,
        metadata: { importedCount, totalAttempted: rows.length, failedCount: importErrors.length, jobId: job.id },
      }).catch((err: Error) => log.error('[Migration] employees_imported publish failed:', sanitizeError(err)));
    }

    res.json({
      jobId: job.id, status: job.status, importedCount,
      totalAttempted: rows.length, errors: importErrors,
      message: importErrors.length === 0
        ? `Successfully imported ${importedCount} employee(s) into your workspace.`
        : `Imported ${importedCount} of ${rows.length} employees. ${importErrors.length} row(s) failed.`,
    });
  } catch (err: unknown) {
    job.status = "failed";
    job.error = sanitizeError(err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

migrationRouter.get("/jobs", (req: any, res: any) => {
  cleanExpiredJobs();
  const workspaceId: string = req.workspaceId!;
  const workspaceJobs = Array.from(jobs.values())
    .filter(j => j.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(j => ({
      jobId: j.id, fileName: j.fileName, status: j.status,
      totalRows: j.totalRows, validRows: j.validRows, errorRows: j.errorRows,
      importedCount: j.importedCount, createdAt: j.createdAt, expiresAt: j.expiresAt,
    }));
  res.json({ jobs: workspaceJobs });
});

migrationRouter.get("/records/:jobId", (req: any, res: any) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });
  if (job.workspaceId !== req.workspaceId) return res.status(403).json({ error: "Access denied" });
  res.json({
    jobId: job.id, status: job.status,
    records: job.records.map(r => ({ row: r.row, mapped: r.mapped, errors: r.errors, isValid: r.isValid })),
  });
});

migrationRouter.post("/cancel/:jobId", (req: any, res: any) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });
  if (job.workspaceId !== req.workspaceId) return res.status(403).json({ error: "Access denied" });
  if (job.status === "completed") return res.status(409).json({ error: "Cannot cancel a completed job" });
  job.status = "cancelled";
  jobs.delete(job.id);
  res.json({ success: true, message: "Import job cancelled" });
});
