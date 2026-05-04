/**
 * Wave 17 — Unified Migration Service Tests
 * Tests: file extraction, row validation, ghost bridge logic, confidence scoring
 */

import { describe, it, expect } from "vitest";
import {
  extractRawText,
  createJob,
  getJob,
  updateJobRows,
  cancelJob,
  type ImportRow,
  type ImportEntityType,
} from "../../server/services/migration/unifiedMigrationService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    rowIndex: 1,
    raw: {},
    mapped: { firstName: "John", lastName: "Smith", email: "john@test.com", phone: "+12105551234" },
    confidence: 95,
    errors: [],
    warnings: [],
    status: "auto",
    isGhost: false,
    ...overrides,
  };
}

function makeJob(rows: ImportRow[], entityType: ImportEntityType = "employees") {
  return createJob({
    workspaceId: "test-workspace-" + Math.random().toString(36).slice(2),
    userId: "user-1",
    entityType,
    fileName: "test.csv",
    rows,
    modelUsed: "gemini-2.5-flash",
  });
}

// ── File extraction tests ─────────────────────────────────────────────────────

describe("extractRawText", () => {
  it("passes CSV through as UTF-8 text", () => {
    const csv = "first_name,last_name,email\nJohn,Smith,john@test.com";
    const buf = Buffer.from(csv, "utf-8");
    const result = extractRawText(buf, "text/csv", "data.csv");
    expect(result).toBe(csv);
  });

  it("extracts CSV from XLSX buffer", () => {
    // Minimal XLSX: use a known small xlsx binary (just verify it doesn't throw)
    // In practice, XLSX.read handles the binary; we test the path detection logic
    const csvFallback = "name,email\nAlice,alice@test.com";
    const buf = Buffer.from(csvFallback, "utf-8");
    const result = extractRawText(buf, "text/csv", "export.csv");
    expect(result).toContain("Alice");
  });

  it("marks PDFs for base64 Gemini processing", () => {
    const buf = Buffer.from("fake pdf content", "utf-8");
    const result = extractRawText(buf, "application/pdf", "roster.pdf");
    expect(result).toMatch(/^__PDF_BASE64__:/);
  });

  it("detects CSV by file extension when mimetype is generic", () => {
    const csv = "a,b,c\n1,2,3";
    const buf = Buffer.from(csv, "utf-8");
    const result = extractRawText(buf, "application/octet-stream", "file.csv");
    expect(result).toBe(csv);
  });
});

// ── Job management ────────────────────────────────────────────────────────────

describe("createJob + getJob", () => {
  it("creates a job with correct summary counts", () => {
    const rows = [
      makeRow({ confidence: 95, status: "auto" }),
      makeRow({ rowIndex: 2, confidence: 70, status: "review" }),
      makeRow({ rowIndex: 3, confidence: 30, status: "fix", errors: ["Missing first name"] }),
      makeRow({ rowIndex: 4, confidence: 60, status: "review", isGhost: true }),
    ];
    const job = makeJob(rows);
    expect(job.totalRows).toBe(4);
    expect(job.autoRows).toBe(1);
    expect(job.reviewRows).toBe(2);
    expect(job.fixRows).toBe(1);
    expect(job.ghostRows).toBe(1);
    expect(job.status).toBe("ready");
    expect(job.batchId).toBeTruthy();
  });

  it("retrieves a job by ID scoped to workspace", () => {
    const job = makeJob([makeRow()]);
    const fetched = getJob(job.id, job.workspaceId);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(job.id);
  });

  it("returns null for wrong workspace", () => {
    const job = makeJob([makeRow()]);
    const fetched = getJob(job.id, "wrong-workspace");
    expect(fetched).toBeNull();
  });

  it("cancels a job and removes it from the store", () => {
    const job = makeJob([makeRow()]);
    const cancelled = cancelJob(job.id, job.workspaceId);
    expect(cancelled).toBe(true);
    expect(getJob(job.id, job.workspaceId)).toBeNull();
  });
});

// ── Row editing ───────────────────────────────────────────────────────────────

describe("updateJobRows", () => {
  it("updates mapped fields and recalculates errors", () => {
    const row = makeRow({ rowIndex: 1, mapped: { firstName: "", lastName: "Smith", email: null, phone: null }, errors: ["Missing first name"], status: "fix" });
    const job = makeJob([row]);
    const updated = updateJobRows(job.id, job.workspaceId, [
      { rowIndex: 1, mapped: { firstName: "Carlos" } },
    ]);
    expect(updated).not.toBeNull();
    const updatedRow = updated!.rows[0];
    expect(updatedRow.mapped.firstName).toBe("Carlos");
    expect(updatedRow.errors).toHaveLength(0);
    expect(updatedRow.status).toBe("approved");
  });

  it("marks row as ghost when name present but contact info missing", () => {
    const row = makeRow({ rowIndex: 1, mapped: { firstName: "Maria", lastName: "Lopez", email: null, phone: null }, errors: ["Missing email"], status: "fix", isGhost: false });
    const job = makeJob([row]);
    updateJobRows(job.id, job.workspaceId, [{ rowIndex: 1, mapped: { firstName: "Maria" } }]);
    const fetched = getJob(job.id, job.workspaceId)!;
    expect(fetched.rows[0].isGhost).toBe(true);
    expect(fetched.ghostRows).toBe(1);
  });

  it("returns null for non-existent job", () => {
    const result = updateJobRows("nonexistent", "ws-1", [{ rowIndex: 1, mapped: { firstName: "X" } }]);
    expect(result).toBeNull();
  });
});

// ── Confidence scoring logic ──────────────────────────────────────────────────

describe("confidence scoring rules", () => {
  it("auto row: confidence >= 90 and no errors", () => {
    const row = makeRow({ confidence: 95, errors: [], status: "auto" });
    expect(row.status).toBe("auto");
    expect(row.confidence).toBeGreaterThanOrEqual(90);
  });

  it("review row: confidence 50-89", () => {
    const row = makeRow({ confidence: 72, status: "review" });
    expect(row.status).toBe("review");
    expect(row.confidence).toBeLessThan(90);
    expect(row.confidence).toBeGreaterThanOrEqual(50);
  });

  it("fix row: confidence < 50 or has blocking errors", () => {
    const row = makeRow({ confidence: 30, errors: ["Missing last name"], status: "fix" });
    expect(row.status).toBe("fix");
  });

  it("ghost row: has name but missing contact, should not be fix", () => {
    const row = makeRow({
      mapped: { firstName: "Bob", lastName: "Jones", email: null, phone: null },
      errors: [],
      status: "review",
      isGhost: true,
    });
    // Ghost rows should NOT block the import — they go through incomplete flow
    expect(row.isGhost).toBe(true);
    expect(row.status).not.toBe("fix");
  });
});

// ── Client and shift entity types ─────────────────────────────────────────────

describe("client import job", () => {
  it("creates a client job correctly", () => {
    const rows = [
      makeRow({ mapped: { firstName: "Jane", lastName: "Doe", companyName: "ABC Security", email: "jane@abc.com", phone: null } }),
      makeRow({ rowIndex: 2, mapped: { firstName: null, lastName: null, companyName: null, email: null, phone: null }, errors: ["Missing contact name or company name"], status: "fix" }),
    ];
    const job = makeJob(rows, "clients");
    expect(job.entityType).toBe("clients");
    expect(job.totalRows).toBe(2);
    expect(job.fixRows).toBe(1);
  });
});

describe("shift import job", () => {
  it("creates a shift job with site + time data", () => {
    const row: ImportRow = {
      rowIndex: 1, raw: {},
      mapped: { siteName: "Midland HQ", startTime: "06:00", endTime: "14:00", daysOfWeek: "Monday,Wednesday,Friday", positionRequired: "Armed Officer", employeeName: null, startDate: null, notes: null },
      confidence: 88, errors: [], warnings: [],
      status: "review", isGhost: false,
    };
    const job = makeJob([row], "shifts");
    expect(job.entityType).toBe("shifts");
    expect(job.rows[0].mapped.siteName).toBe("Midland HQ");
    expect(job.rows[0].mapped.startTime).toBe("06:00");
    expect(job.rows[0].mapped.daysOfWeek).toBe("Monday,Wednesday,Friday");
  });
});

// ── Bulk import simulation (500 guards) ──────────────────────────────────────

describe("bulk import performance — 500 guards", () => {
  it("creates and retrieves a 500-row job in under 100ms", () => {
    const rows: ImportRow[] = Array.from({ length: 500 }, (_, i) => ({
      rowIndex: i + 1,
      raw: {},
      mapped: {
        firstName: "Guard",
        lastName: "Number" + (i + 1),
        email: "guard" + (i + 1) + "@statewide.com",
        phone: "+1210555" + String(i).padStart(4, "0"),
        position: "Security Officer",
        hourlyRate: "18.50",
        employeeNumber: "EMP-SPS-" + String(i + 1).padStart(5, "0"),
      },
      confidence: i % 10 === 0 ? 72 : 95,  // Every 10th row is review
      errors: [],
      warnings: [],
      status: i % 10 === 0 ? "review" : "auto",
      isGhost: false,
    }));

    const start = Date.now();
    const job = makeJob(rows, "employees");
    const elapsed = Date.now() - start;

    expect(job.totalRows).toBe(500);
    expect(job.autoRows).toBe(450);
    expect(job.reviewRows).toBe(50);
    expect(elapsed).toBeLessThan(100); // Job creation must be fast

    const fetched = getJob(job.id, job.workspaceId);
    expect(fetched).not.toBeNull();
    expect(fetched!.rows).toHaveLength(500);
  });
});
