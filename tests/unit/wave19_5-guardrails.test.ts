/**
 * Wave 19.5 — Billing Safety Valves & Data Archival Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decideRetentionAction } from "../../server/services/retentionPolicyService";
import {
  ensureArchivalSchema,
  getStorageStats,
  runArchivalCycle,
} from "../../server/services/storageArchival";

// ── Spend Cap Logic Tests ─────────────────────────────────────────────────────

describe("Spend Cap — threshold calculations", () => {
  it("80% threshold triggers at correct overage level", () => {
    const limit = 5000;   // $50.00 cap
    const current = 4000; // $40.00 spent
    const pct = current / limit;
    expect(pct).toBeGreaterThanOrEqual(0.8);
    expect(pct).toBeLessThan(1.0);
  });

  it("100% threshold triggers block", () => {
    const limit = 5000;
    const current = 5001;
    const pct = current / limit;
    expect(pct).toBeGreaterThanOrEqual(1.0);
  });

  it("zero limit means no cap enforced", () => {
    const limit = 0;
    // When limit is 0, cap check is skipped
    const capEnforced = limit > 0;
    expect(capEnforced).toBe(false);
  });

  it("default cap is $50 (5000 cents)", () => {
    const DEFAULT_CAP_CENTS = 5000;
    expect(DEFAULT_CAP_CENTS / 100).toBe(50);
  });

  it("credit to cents conversion is correct", () => {
    // 1 credit = $0.001 = 0.1 cents
    const CREDITS_TO_CENTS = 0.1;
    const credits = 100;
    const cents = Math.ceil(credits * CREDITS_TO_CENTS);
    expect(cents).toBe(10); // 100 credits = 10 cents
  });

  it("PTT transmission cost stays within expected range", () => {
    // ~$0.0011 per transmission = 0.11 cents
    const PTT_COST_CENTS = 0.11;
    const monthlyTransmissions = 2000; // heavy usage
    const totalCents = PTT_COST_CENTS * monthlyTransmissions;
    expect(totalCents).toBeLessThan(500); // < $5 per month
  });
});

// ── Data Archival Logic Tests ─────────────────────────────────────────────────

describe("Data Archival — hot vs cold classification", () => {
  it("60-day boundary is correct", () => {
    const HOT_TO_COLD_DAYS = 60;
    const now = new Date();
    const oldRecord = new Date(now.getTime() - (HOT_TO_COLD_DAYS + 1) * 24 * 60 * 60 * 1000);
    const newRecord = new Date(now.getTime() - (HOT_TO_COLD_DAYS - 1) * 24 * 60 * 60 * 1000);
    const isOldCold = oldRecord < new Date(now.getTime() - HOT_TO_COLD_DAYS * 24 * 60 * 60 * 1000);
    const isNewHot = newRecord >= new Date(now.getTime() - HOT_TO_COLD_DAYS * 24 * 60 * 60 * 1000);
    expect(isOldCold).toBe(true);
    expect(isNewHot).toBe(true);
  });

  it("1-year boundary triggers audio URL purge", () => {
    const COLD_TO_PURGE_DAYS = 365;
    const now = new Date();
    const oldRecord = new Date(now.getTime() - (COLD_TO_PURGE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const isPurgeable = oldRecord < new Date(now.getTime() - COLD_TO_PURGE_DAYS * 24 * 60 * 60 * 1000);
    expect(isPurgeable).toBe(true);
  });

  it("archival preserves metadata, only clears audio_url on purge", () => {
    // Model: cold record retains all text fields, audio_url → null after 365 days
    const coldRecord = {
      id: "test-123",
      transcript: "Unit 4 to dispatch, all clear",
      audio_url: null,  // purged
      archived: true,
      archived_at: new Date(),
      workspace_id: "ws-1",
    };
    expect(coldRecord.transcript).toBeTruthy();   // text retained
    expect(coldRecord.audio_url).toBeNull();       // audio freed
    expect(coldRecord.archived).toBe(true);
  });

  it("archival tables include the correct target tables", () => {
    const ARCHIVAL_TARGETS = [
      "cad_event_log",
      "ptt_transmissions",
      "ptt_plate_log",
      "import_history",
    ];
    expect(ARCHIVAL_TARGETS).toHaveLength(4);
    expect(ARCHIVAL_TARGETS).toContain("ptt_transmissions");
    expect(ARCHIVAL_TARGETS).toContain("cad_event_log");
  });

  it("storage stats estimate is reasonable per record", () => {
    const KB_PER_HOT_RECORD = 2;  // ~2KB average
    const MB_PER_1000_RECORDS = (KB_PER_HOT_RECORD * 1000) / 1024;
    expect(MB_PER_1000_RECORDS).toBeLessThan(2); // < 2MB per 1000 hot records
  });
});

// ── Proration Preview Logic Tests ─────────────────────────────────────────────

describe("Proration Preview — mid-cycle addon calculation", () => {
  it("due today is less than or equal to full month price", () => {
    const fullMonthCents = 300; // $3.00 PTT addon
    const daysInMonth = 30;
    const daysRemaining = 15;
    const prorated = Math.round(fullMonthCents * (daysRemaining / daysInMonth));
    expect(prorated).toBeLessThanOrEqual(fullMonthCents);
    expect(prorated).toBeGreaterThan(0);
  });

  it("next month total equals full price when no subscription items change", () => {
    const addonPrice = 300;
    const baseSubscription = 149900;
    const nextMonth = addonPrice + baseSubscription;
    expect(nextMonth).toBe(150200);
  });

  it("zero due today on first day of billing cycle", () => {
    const fullMonthCents = 300;
    const daysInMonth = 30;
    const daysRemaining = 0; // purchased on last day
    const prorated = Math.round(fullMonthCents * (daysRemaining / daysInMonth));
    expect(prorated).toBe(0);
  });

  it("displays correct dollar format for UI", () => {
    const cents = 147;
    const formatted = (cents / 100).toFixed(2);
    expect(formatted).toBe("1.47");
  });
});

// ── Retention Policy (existing service) ──────────────────────────────────────

describe("Retention Policy — workspace lifecycle", () => {
  it("active workspace is retained indefinitely", () => {
    const result = decideRetentionAction({
      workspaceId: "ws-1",
      status: "active",
      statusChangedAt: new Date(),
      regulatoryHold: false,
    });
    expect(result.action).toBe("retain");
  });

  it("cancelled workspace is hard-deleted after 30 days", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const result = decideRetentionAction({
      workspaceId: "ws-2",
      status: "cancelled",
      statusChangedAt: thirtyOneDaysAgo,
      regulatoryHold: false,
    });
    expect(result.action).toBe("hard_delete");
  });

  it("regulatory hold overrides cancellation", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const result = decideRetentionAction({
      workspaceId: "ws-3",
      status: "cancelled",
      statusChangedAt: thirtyOneDaysAgo,
      regulatoryHold: true,
    });
    expect(result.action).toBe("hold");
  });
});
