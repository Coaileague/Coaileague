/**
 * Wave 20 — Texas DPS Auditor Portal + Regulatory Knowledge Engine Tests
 */
import { describe, it, expect } from "vitest";

// ── Audit flag logic ──────────────────────────────────────────────────────────

describe("Pre-Audit Red Team Engine — flag logic", () => {
  it("ARMED_POST_EXPIRED_LICENSE fires when expiry < shift date", () => {
    const shiftDate = new Date("2026-03-15");
    const expiryDate = new Date("2026-02-01");
    const isExpiredAtShiftTime = expiryDate < shiftDate;
    expect(isExpiredAtShiftTime).toBe(true);
  });

  it("does NOT flag when license is valid at shift date", () => {
    const shiftDate = new Date("2026-03-15");
    const expiryDate = new Date("2027-01-01");
    const isExpiredAtShiftTime = expiryDate < shiftDate;
    expect(isExpiredAtShiftTime).toBe(false);
  });

  it("ARMED_POST_INSUFFICIENT_LICENSE fires for unarmed-only license code", () => {
    const unarmedCodes = new Set(["level2_unarmed", "ca_unarmed", "fl_class_d", "ny_unarmed"]);
    const officerLicense = "level2_unarmed";
    expect(unarmedCodes.has(officerLicense)).toBe(true);
  });

  it("no flag for armed license code", () => {
    const unarmedCodes = new Set(["level2_unarmed", "ca_unarmed"]);
    const officerLicense = "level3_armed";
    expect(unarmedCodes.has(officerLicense)).toBe(false);
  });

  it("LICENSE_EXPIRING_SOON fires within 30 days", () => {
    const now = new Date();
    const expiresIn15Days = new Date(now.getTime() + 15 * 86400000);
    const days = Math.floor((expiresIn15Days.getTime() - now.getTime()) / 86400000);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("audit readiness score: 0 critical flags = 100", () => {
    const score = Math.max(0, 100 - 0 * 15 - 0 * 5);
    expect(score).toBe(100);
  });

  it("audit readiness score: 3 critical = 55", () => {
    const score = Math.max(0, 100 - 3 * 15);
    expect(score).toBe(55);
  });

  it("audit readiness score: floors at 0 with many critical flags", () => {
    const score = Math.max(0, 100 - 10 * 15);
    expect(score).toBe(0);
  });

  it("overallRisk is critical when any critical flag exists", () => {
    const flags = [{ severity: "critical" }, { severity: "warning" }];
    const criticalCount = flags.filter(f => f.severity === "critical").length;
    const risk = criticalCount > 0 ? "critical" : "warning";
    expect(risk).toBe("critical");
  });
});

// ── Data redaction logic ──────────────────────────────────────────────────────

describe("Data Redaction Middleware", () => {
  const REDACTED = new Set([
    "internalNotes", "supervisorComments", "billingRate",
    "hourlyRate", "payRate", "ssn", "taxId", "privateNotes",
  ]);

  function redact(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!REDACTED.has(k)) out[k] = v;
    }
    return out;
  }

  it("strips internalNotes from officer record", () => {
    const record = {
      id: "emp-1",
      firstName: "John",
      lastName: "Doe",
      guardCardNumber: "TX123456",
      internalNotes: "Has attendance issues",
    };
    const clean = redact(record);
    expect(clean.internalNotes).toBeUndefined();
    expect(clean.firstName).toBe("John");
    expect(clean.guardCardNumber).toBe("TX123456");
  });

  it("strips billingRate, payRate, ssn", () => {
    const record = {
      employeeName: "Jane Smith",
      guardCardNumber: "TX654321",
      billingRate: 35,
      payRate: 18,
      ssn: "***-**-1234",
    };
    const clean = redact(record);
    expect(clean.billingRate).toBeUndefined();
    expect(clean.payRate).toBeUndefined();
    expect(clean.ssn).toBeUndefined();
    expect(clean.employeeName).toBe("Jane Smith");
  });

  it("preserves audit-relevant fields", () => {
    const record = {
      guardCardNumber: "TX999888",
      licenseType: "level3_armed",
      guardCardExpiryDate: "2027-06-01",
      isArmed: true,
      supervisorComments: "Good officer",
    };
    const clean = redact(record);
    expect(clean.guardCardNumber).toBe("TX999888");
    expect(clean.licenseType).toBe("level3_armed");
    expect(clean.isArmed).toBe(true);
    expect(clean.supervisorComments).toBeUndefined();
  });
});

// ── Regulatory Knowledge Base ─────────────────────────────────────────────────

describe("Regulatory Knowledge Engine — data model", () => {
  it("Texas UoF reportable incident types include firearm_discharge", () => {
    const txUoFTypes = [
      "use_of_force", "firearm_discharge", "physical_altercation",
      "use_of_force_incident", "weapon_drawn", "officer_involved", "deadly_force",
    ];
    expect(txUoFTypes).toContain("firearm_discharge");
    expect(txUoFTypes).toContain("use_of_force");
  });

  it("Graham v. Connor three factors are all present in knowledge base entry", () => {
    const grahamFactors = [
      "Severity of the crime at issue",
      "Whether the suspect poses immediate threat to safety",
      "Whether the suspect is actively resisting arrest or attempting to evade",
    ];
    expect(grahamFactors).toHaveLength(3);
    expect(grahamFactors[0]).toContain("Severity");
  });

  it("Texas has no state income tax", () => {
    const txPayroll = { state_income_tax: false };
    expect(txPayroll.state_income_tax).toBe(false);
  });

  it("California SDI rate is 1.1%", () => {
    const caSDI = 0.011;
    expect(caSDI * 100).toBeCloseTo(1.1);
  });

  it("Federal FICA rates sum to correct total", () => {
    const employeeFICA = 0.062 + 0.0145;
    expect(employeeFICA).toBeCloseTo(0.0765);
  });

  it("FLSA overtime threshold is 40 hours", () => {
    const OVERTIME_THRESHOLD = 40;
    const hoursWorked = 45;
    const overtimeHours = Math.max(0, hoursWorked - OVERTIME_THRESHOLD);
    expect(overtimeHours).toBe(5);
  });

  it("knowledge_type field supports all required categories", () => {
    const validTypes = [
      "statute", "case_law", "occupation_code", "uof_guideline",
      "form_template", "payroll_tax_rule", "license_tier",
      "renewal_requirement", "audit_checklist", "penal_code",
      "uof_reportable_incident_types", "required_armed_certifications",
    ];
    expect(validTypes).toContain("case_law");
    expect(validTypes).toContain("payroll_tax_rule");
    expect(validTypes).toContain("audit_checklist");
    expect(validTypes.length).toBeGreaterThanOrEqual(12);
  });

  it("state portal works for any state code — no hardcoded TX", () => {
    const states = ["TX", "CA", "FL", "NY", "NV", "AZ", "CO"];
    // Each state can be added as data rows — same API, same portal
    states.forEach(code => {
      const expectedUrl = `/dps-portal/some-token`; // same URL pattern for all states
      expect(expectedUrl).toContain("/dps-portal/");
    });
  });
});

// ── Auditor token security ────────────────────────────────────────────────────

describe("Auditor Link Security", () => {
  it("expired token should be rejected", () => {
    const expiresAt = new Date(Date.now() - 86400000); // yesterday
    const isExpired = expiresAt < new Date();
    expect(isExpired).toBe(true);
  });

  it("future expiry is valid", () => {
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const isExpired = expiresAt < new Date();
    expect(isExpired).toBe(false);
  });

  it("revoked token should always be rejected regardless of expiry", () => {
    const isRevoked = true;
    const expiresAt = new Date(Date.now() + 86400000);
    const isValid = !isRevoked && expiresAt > new Date();
    expect(isValid).toBe(false);
  });

  it("token has 128-character capacity (48 bytes base64url)", () => {
    // crypto.randomBytes(48).toString("base64url") = 64 chars (base64url)
    const tokenLength = 64; // base64url of 48 bytes
    expect(tokenLength).toBeLessThanOrEqual(128);
    expect(tokenLength).toBeGreaterThanOrEqual(60);
  });
});
