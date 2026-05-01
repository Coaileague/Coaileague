import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { employees, clients, workspaceInvites } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from 'crypto';
import { emailService } from '../services/emailService';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
const log = createLogger('ImportRoutes');


const router = Router();

const workspaceImportLocks = new Map<string, { userId: string; startedAt: number }>();
const IMPORT_LOCK_TTL_MS = 10 * 60 * 1000;

function acquireImportLock(workspaceId: string, userId: string): { acquired: boolean; holder?: string } {
  const existing = workspaceImportLocks.get(workspaceId);
  if (existing && Date.now() - existing.startedAt < IMPORT_LOCK_TTL_MS && existing.userId !== userId) {
    return { acquired: false, holder: existing.userId };
  }
  workspaceImportLocks.set(workspaceId, { userId, startedAt: Date.now() });
  return { acquired: true };
}

function releaseImportLock(workspaceId: string) {
  workspaceImportLocks.delete(workspaceId);
}

interface ParsedEmployee {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  team: string | null;
  hourlyRate: number | null;
  hireDate: string | null;
  errors: string[];
}

interface CsvPreviewResult {
  success: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  parsedEmployees: ParsedEmployee[];
  headers: string[];
  columnMapping: Record<string, string>;
}

const KNOWN_HEADERS: Record<string, string> = {
  "first_name": "firstName",
  "firstname": "firstName",
  "first name": "firstName",
  "fname": "firstName",
  "last_name": "lastName",
  "lastname": "lastName",
  "last name": "lastName",
  "lname": "lastName",
  "name": "fullName",
  "full_name": "fullName",
  "fullname": "fullName",
  "full name": "fullName",
  "email": "email",
  "email_address": "email",
  "emailaddress": "email",
  "e-mail": "email",
  "phone": "phone",
  "phone_number": "phone",
  "phonenumber": "phone",
  "mobile": "phone",
  "cell": "phone",
  "position": "position",
  "title": "position",
  "job_title": "position",
  "jobtitle": "position",
  "role": "position",
  "job title": "position",
  "team": "team",
  "department": "team",
  "dept": "team",
  "group": "team",
  "hourly_rate": "hourlyRate",
  "hourlyrate": "hourlyRate",
  "hourly rate": "hourlyRate",
  "rate": "hourlyRate",
  "pay_rate": "hourlyRate",
  "payrate": "hourlyRate",
  "pay rate": "hourlyRate",
  "wage": "hourlyRate",
  "hire_date": "hireDate",
  "hiredate": "hireDate",
  "hire date": "hireDate",
  "start_date": "hireDate",
  "startdate": "hireDate",
  "start date": "hireDate",
  "date_hired": "hireDate",
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSVContent(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCSVLine(line));

  return { headers, rows };
}

function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (KNOWN_HEADERS[normalized]) {
      mapping[header] = KNOWN_HEADERS[normalized];
    }
  }
  return mapping;
}

function parseEmployeeRow(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
  rowNumber: number
): ParsedEmployee {
  const errors: string[] = [];
  const mapped: Record<string, string> = {};

  for (let i = 0; i < headers.length; i++) {
    const target = mapping[headers[i]];
    if (target && i < row.length) {
      mapped[target] = row[i];
    }
  }

  let firstName = mapped.firstName || "";
  let lastName = mapped.lastName || "";

  if (!firstName && !lastName && mapped.fullName) {
    const parts = mapped.fullName.trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  if (!firstName && !lastName) {
    errors.push("Missing first and last name");
  } else if (!firstName) {
    errors.push("Missing first name");
  } else if (!lastName) {
    errors.push("Missing last name");
  }

  const email = mapped.email?.trim() || null;
  if (email && !isValidEmail(email)) {
    errors.push("Invalid email format");
  }

  let hourlyRate: number | null = null;
  if (mapped.hourlyRate) {
    const cleaned = mapped.hourlyRate.replace(/[$,]/g, "").trim();
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || parsed < 0) {
      errors.push("Invalid hourly rate");
    } else {
      hourlyRate = parsed;
    }
  }

  return {
    rowNumber,
    firstName,
    lastName,
    email,
    phone: mapped.phone?.trim() || null,
    position: mapped.position?.trim() || null,
    team: mapped.team?.trim() || null,
    hourlyRate,
    hireDate: mapped.hireDate?.trim() || null,
    errors,
  };
}

const csvImportSchema = z.object({
  csvContent: z.string().min(1, "CSV content is required"),
});

router.post("/employees/preview", async (req: Request, res: Response) => {
  try {
    const parsed = csvImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid request",
      });
    }

    const { csvContent } = parsed.data;
    const { headers, rows } = parseCSVContent(csvContent);

    if (headers.length === 0) {
      return res.status(400).json({
        success: false,
        error: "CSV appears to be empty or has no headers",
      });
    }

    const columnMapping = detectColumnMapping(headers);

    if (!Object.values(columnMapping).includes("firstName") && !Object.values(columnMapping).includes("fullName")) {
      return res.status(400).json({
        success: false,
        error: "Could not detect a name column. Expected headers like: first_name, last_name, name, full_name",
        detectedHeaders: headers,
      });
    }

    const parsedEmployees: ParsedEmployee[] = rows.map((row, index) =>
      parseEmployeeRow(row, headers, columnMapping, index + 1)
    );

    const validRows = parsedEmployees.filter((e) => e.errors.length === 0).length;
    const invalidRows = parsedEmployees.filter((e) => e.errors.length > 0).length;

    const result: CsvPreviewResult = {
      success: true,
      totalRows: parsedEmployees.length,
      validRows,
      invalidRows,
      parsedEmployees,
      headers,
      columnMapping,
    };

    return res.json(result);
  } catch (error: unknown) {
    log.error("[ImportRoutes] Preview failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to parse CSV: " + sanitizeError(error),
    });
  }
});

router.post("/employees", async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace context required" });
    }

    const lockResult = acquireImportLock(workspaceId, userId || "anonymous");
    if (!lockResult.acquired) {
      return res.status(409).json({
        success: false,
        error: "An import is already in progress for this workspace. Please wait for it to complete.",
        lockedBy: lockResult.holder,
      });
    }

    const parsed = csvImportSchema.safeParse(req.body);
    if (!parsed.success) {
      releaseImportLock(workspaceId);
      return res.status(400).json({
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid request",
      });
    }

    const { csvContent } = parsed.data;
    const { headers, rows } = parseCSVContent(csvContent);

    if (headers.length === 0) {
      return res.status(400).json({ success: false, error: "CSV appears to be empty" });
    }

    const columnMapping = detectColumnMapping(headers);

    if (!Object.values(columnMapping).includes("firstName") && !Object.values(columnMapping).includes("fullName")) {
      return res.status(400).json({
        success: false,
        error: "Could not detect a name column",
      });
    }

    const parsedEmployees = rows.map((row, index) =>
      parseEmployeeRow(row, headers, columnMapping, index + 1)
    );

    const validEmployees = parsedEmployees.filter((e) => e.errors.length === 0);
    const skippedRows = parsedEmployees.filter((e) => e.errors.length > 0);

    let imported = 0;
    let invited = 0;
    let skippedDuplicates = 0;
    const importErrors: string[] = [];
    const missingEmailRows: number[] = [];

    const workspace = await storage.getWorkspace(workspaceId).catch(() => null);
    const workspaceName = workspace?.name || 'Your Organization';
    const inviterUserId = userId || 'system';

    for (const emp of validEmployees) {
      try {
        if (emp.email) {
          const existing = await db
            .select()
            .from(employees)
            .where(and(eq(employees.workspaceId, workspaceId), eq(employees.email, emp.email)))
            .limit(1);

          if (existing.length > 0) {
            skippedDuplicates++;
            continue;
          }
        } else {
          missingEmailRows.push(emp.rowNumber);
        }

        const onboardingStatus = emp.email ? 'invited' : 'pending';

        await db.insert(employees).values({
          workspaceId,
          firstName: emp.firstName || "Unknown",
          lastName: emp.lastName || "",
          email: emp.email || null,
          phone: emp.phone || null,
          role: emp.position || null,
          hourlyRate: emp.hourlyRate?.toString() || null,
          isActive: true,
          onboardingStatus,
        } as any);
        imported++;

        // For employees with email, create a workspace invite and send onboarding email
        if (emp.email) {
          try {
            const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            await db.insert(workspaceInvites).values({
              workspaceId,
              inviteCode,
              inviterUserId,
              inviteeEmail: emp.email,
              inviteeFirstName: emp.firstName || null,
              inviteeLastName: emp.lastName || null,
              inviteeRole: 'employee',
              status: 'pending',
              expiresAt,
            } as any);

            await emailService.sendEmployeeInvitation(workspaceId, emp.email, inviteCode, {
              firstName: emp.firstName || 'there',
              inviterName: workspaceName,
              workspaceName,
              roleName: 'Team Member',
              expiresInDays: 7,
            });

            invited++;
          } catch (inviteErr: any) {
            log.warn(`[ImportRoutes] Invite/email failed for row ${emp.rowNumber}:`, inviteErr?.message);
          }
        }
      } catch (error: unknown) {
        importErrors.push(`Row ${emp.rowNumber}: ${sanitizeError(error)}`);
      }
    }

    releaseImportLock(workspaceId);
    return res.json({
      success: importErrors.length === 0,
      imported,
      invited,
      skippedDuplicates,
      skippedInvalid: skippedRows.length,
      totalRows: parsedEmployees.length,
      errors: importErrors,
      missingEmailRows,
      invalidRows: skippedRows.map((e) => ({
        rowNumber: e.rowNumber,
        errors: e.errors,
        firstName: e.firstName,
        lastName: e.lastName,
      })),
    });
  } catch (error: unknown) {
    releaseImportLock(workspaceId);
    log.error("[ImportRoutes] Import failed:", error);
    return res.status(500).json({
      success: false,
      error: "Import failed: " + sanitizeError(error),
    });
  }
});

// ============================================================================
// CLIENT IMPORT — CSV helpers
// ============================================================================

const CLIENT_KNOWN_HEADERS: Record<string, string> = {
  "first_name": "firstName", "firstname": "firstName", "first name": "firstName", "fname": "firstName",
  "last_name": "lastName", "lastname": "lastName", "last name": "lastName", "lname": "lastName",
  "name": "fullName", "full_name": "fullName", "fullname": "fullName", "full name": "fullName",
  "contact_name": "fullName", "contact name": "fullName",
  "company_name": "companyName", "company": "companyName", "business_name": "companyName",
  "site_name": "companyName", "client_name": "companyName", "organization": "companyName",
  "email": "email", "email_address": "email", "billing_email": "email", "e-mail": "email",
  "phone": "phone", "phone_number": "phone", "mobile": "phone", "office_phone": "phone",
  "address": "address", "street": "address", "street_address": "address", "site_address": "address",
  "address_line_2": "addressLine2", "suite": "addressLine2", "unit": "addressLine2",
  "city": "city", "state": "state", "zip": "postalCode", "zip_code": "postalCode", "postal_code": "postalCode",
  "contract_rate": "contractRate", "rate": "contractRate", "billing_rate": "contractRate",
  "hourly_rate": "contractRate", "contract_rate_type": "contractRateType",
  "poc_name": "pocName", "poc_phone": "pocPhone", "poc_email": "pocEmail",
  "notes": "postOrders", "post_orders": "postOrders", "instructions": "postOrders",
};

interface ParsedClient {
  rowNumber: number;
  firstName: string;
  lastName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  contractRate: number | null;
  pocName: string | null;
  pocPhone: string | null;
  pocEmail: string | null;
  errors: string[];
}

interface ClientCsvPreviewResult {
  success: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  parsedClients: ParsedClient[];
  headers: string[];
  columnMapping: Record<string, string>;
}

function detectClientColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (CLIENT_KNOWN_HEADERS[normalized]) {
      mapping[header] = CLIENT_KNOWN_HEADERS[normalized];
    }
  }
  return mapping;
}

function parseClientRow(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
  rowNumber: number
): ParsedClient {
  const errors: string[] = [];
  const mapped: Record<string, string> = {};

  for (let i = 0; i < headers.length; i++) {
    const target = mapping[headers[i]];
    if (target && i < row.length) {
      mapped[target] = row[i];
    }
  }

  let firstName = mapped.firstName || "";
  let lastName = mapped.lastName || "";
  const companyName = mapped.companyName?.trim() || null;

  if (!firstName && !lastName && mapped.fullName) {
    const parts = mapped.fullName.trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  if (!firstName && !lastName && !companyName) {
    errors.push("Missing name or company name");
  }

  const email = mapped.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Invalid email format");
  }

  let contractRate: number | null = null;
  if (mapped.contractRate) {
    const cleaned = mapped.contractRate.replace(/[$,]/g, "").trim();
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed >= 0) contractRate = parsed;
    else errors.push("Invalid contract rate");
  }

  return {
    rowNumber,
    firstName: firstName || "Contact",
    lastName: lastName || (companyName || ""),
    companyName,
    email,
    phone: mapped.phone?.trim() || null,
    address: mapped.address?.trim() || null,
    city: mapped.city?.trim() || null,
    state: mapped.state?.trim() || null,
    postalCode: mapped.postalCode?.trim() || null,
    contractRate,
    pocName: mapped.pocName?.trim() || null,
    pocPhone: mapped.pocPhone?.trim() || null,
    pocEmail: mapped.pocEmail?.trim() || null,
    errors,
  };
}

const csvClientSchema = z.object({
  csvContent: z.string().min(1, "CSV content is required"),
});

// POST /clients/preview — dry-run, no DB writes
router.post("/clients/preview", async (req: Request, res: Response) => {
  try {
    const parsed = csvClientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || "Invalid request" });
    }

    const { csvContent } = parsed.data;
    const { headers, rows } = parseCSVContent(csvContent);

    if (headers.length === 0) {
      return res.status(400).json({ success: false, error: "CSV appears to be empty or has no headers" });
    }

    const columnMapping = detectClientColumnMapping(headers);

    const parsedClients: ParsedClient[] = rows.map((row, index) =>
      parseClientRow(row, headers, columnMapping, index + 1)
    );

    const validRows = parsedClients.filter((c) => c.errors.length === 0).length;
    const invalidRows = parsedClients.filter((c) => c.errors.length > 0).length;

    const result: ClientCsvPreviewResult = {
      success: true,
      totalRows: parsedClients.length,
      validRows,
      invalidRows,
      parsedClients,
      headers,
      columnMapping,
    };

    return res.json(result);
  } catch (error: unknown) {
    log.error("[ImportRoutes] Client preview failed:", error);
    return res.status(500).json({ success: false, error: "Failed to parse CSV: " + sanitizeError(error) });
  }
});

// POST /clients — execute client import
router.post("/clients", async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  const userId = req.user?.id;

  try {
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace context required" });
    }

    const lockKey = `clients_${workspaceId}`;
    const lockResult = acquireImportLock(lockKey, userId || "anonymous");
    if (!lockResult.acquired) {
      return res.status(409).json({
        success: false,
        error: "A client import is already in progress. Please wait.",
        lockedBy: lockResult.holder,
      });
    }

    const parsed = csvClientSchema.safeParse(req.body);
    if (!parsed.success) {
      releaseImportLock(lockKey);
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || "Invalid request" });
    }

    const { csvContent } = parsed.data;
    const { headers, rows } = parseCSVContent(csvContent);

    if (headers.length === 0) {
      releaseImportLock(lockKey);
      return res.status(400).json({ success: false, error: "CSV appears to be empty" });
    }

    const columnMapping = detectClientColumnMapping(headers);
    const parsedClients = rows.map((row, index) => parseClientRow(row, headers, columnMapping, index + 1));

    const validClients = parsedClients.filter((c) => c.errors.length === 0);
    const skippedRows = parsedClients.filter((c) => c.errors.length > 0);

    let imported = 0;
    let skippedDuplicates = 0;
    const importErrors: string[] = [];

    for (const client of validClients) {
      try {
        if (client.email) {
          const existing = await db
            .select({ id: clients.id })
            .from(clients)
            .where(and(eq(clients.workspaceId, workspaceId), eq(clients.email, client.email)))
            .limit(1);
          if (existing.length > 0) { skippedDuplicates++; continue; }
        }

        await db.insert(clients).values({
          workspaceId,
          firstName: client.firstName,
          lastName: client.lastName,
          companyName: client.companyName || null,
          email: client.email || null,
          phone: client.phone || null,
          address: client.address || null,
          city: client.city || null,
          state: client.state || null,
          postalCode: client.postalCode || null,
          contractRate: client.contractRate?.toString() || null,
          pocName: client.pocName || null,
          pocPhone: client.pocPhone || null,
          pocEmail: client.pocEmail || null,
          isActive: true,
        } as any);
        imported++;
      } catch (error: unknown) {
        importErrors.push(`Row ${client.rowNumber}: ${sanitizeError(error)}`);
      }
    }

    releaseImportLock(lockKey);
    return res.json({
      success: importErrors.length === 0,
      imported,
      skippedDuplicates,
      skippedInvalid: skippedRows.length,
      totalRows: parsedClients.length,
      errors: importErrors,
      invalidRows: skippedRows.map((c) => ({
        rowNumber: c.rowNumber,
        errors: c.errors,
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.companyName,
      })),
    });
  } catch (error: unknown) {
    if (workspaceId) releaseImportLock(`clients_${workspaceId}`);
    log.error("[ImportRoutes] Client import failed:", error);
    return res.status(500).json({ success: false, error: "Import failed: " + sanitizeError(error) });
  }
});

export default router;

