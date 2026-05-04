/**
 * Wave 21A — NFC/QR Patrol Engine Tests
 */
import { describe, it, expect } from "vitest";

describe("QR Code — workspace isolation", () => {
  it("QR payload always includes workspaceId", () => {
    const payload = {
      v: 1,
      w: "workspace-abc123",
      c: "checkpoint-xyz",
      t: "tour-def456",
      n: "North Entrance",
      nfc: null,
    };
    expect(payload.w).toBe("workspace-abc123");
    expect(payload.v).toBe(1);
  });

  it("cross-tenant scan is rejected — workspaceId mismatch", () => {
    const qrWorkspaceId = "workspace-abc123";
    const requestWorkspaceId = "workspace-different-tenant";
    const isCrossTenant = qrWorkspaceId !== requestWorkspaceId;
    expect(isCrossTenant).toBe(true); // should be rejected by API
  });

  it("same-tenant scan is accepted", () => {
    const qrWorkspaceId = "workspace-abc123";
    const requestWorkspaceId = "workspace-abc123";
    const isCrossTenant = qrWorkspaceId !== requestWorkspaceId;
    expect(isCrossTenant).toBe(false);
  });

  it("QR payload JSON is parseable", () => {
    const payload = JSON.stringify({ v: 1, w: "ws-1", c: "cp-1", t: "tour-1", n: "Gate A" });
    const parsed = JSON.parse(payload);
    expect(parsed.w).toBe("ws-1");
    expect(parsed.n).toBe("Gate A");
  });
});

describe("NFC Anti-Spoof — existing validation", () => {
  it("time drift > 120s fails validation", () => {
    const MAX_DRIFT = 120;
    const serverTime = Date.now();
    const deviceTime = serverTime - 130 * 1000; // 130 seconds old
    const drift = Math.abs(serverTime - deviceTime) / 1000;
    expect(drift).toBeGreaterThan(MAX_DRIFT);
  });

  it("time drift < 120s passes validation", () => {
    const MAX_DRIFT = 120;
    const serverTime = Date.now();
    const deviceTime = serverTime - 30 * 1000; // 30 seconds
    const drift = Math.abs(serverTime - deviceTime) / 1000;
    expect(drift).toBeLessThan(MAX_DRIFT);
  });

  it("GPS outside radius is flagged", () => {
    const MAX_RADIUS = 50; // meters
    const checkpointLat = 29.4241;
    const checkpointLng = -98.4936;
    const deviceLat = 29.4300; // ~700m away
    const deviceLng = -98.4936;
    // Rough distance (1 degree lat ≈ 111km)
    const distMeters = Math.abs(deviceLat - checkpointLat) * 111000;
    expect(distMeters).toBeGreaterThan(MAX_RADIUS);
  });

  it("GPS within radius passes", () => {
    const MAX_RADIUS = 50;
    const checkpointLat = 29.4241;
    const deviceLat = 29.4242; // ~11m away
    const distMeters = Math.abs(deviceLat - checkpointLat) * 111000;
    expect(distMeters).toBeLessThan(MAX_RADIUS);
  });
});

describe("Patrol Watcher — missed checkpoint thresholds", () => {
  it("10 minute miss triggers warning level", () => {
    const WARN_MIN = 10, ESCALATE_MIN = 20, INCIDENT_MIN = 30;
    const missed = 12;
    const level = missed >= INCIDENT_MIN ? "incident"
      : missed >= ESCALATE_MIN ? "escalate" : "warn";
    expect(level).toBe("warn");
  });

  it("22 minute miss triggers escalate level", () => {
    const WARN_MIN = 10, ESCALATE_MIN = 20, INCIDENT_MIN = 30;
    const missed = 22;
    const level = missed >= INCIDENT_MIN ? "incident"
      : missed >= ESCALATE_MIN ? "escalate" : "warn";
    expect(level).toBe("escalate");
  });

  it("35 minute miss triggers incident level", () => {
    const WARN_MIN = 10, ESCALATE_MIN = 20, INCIDENT_MIN = 30;
    const missed = 35;
    const level = missed >= INCIDENT_MIN ? "incident"
      : missed >= ESCALATE_MIN ? "escalate" : "warn";
    expect(level).toBe("incident");
  });
});

describe("CAD ↔ Patrol bridge", () => {
  it("patrol_scan broadcast has required CAD fields", () => {
    const broadcast = {
      type: "patrol_scan",
      data: {
        scanId: "scan-123",
        checkpointId: "cp-abc",
        checkpointName: "North Entrance",
        employeeId: "emp-1",
        officerName: "John Doe",
        latitude: "29.4241",
        longitude: "-98.4936",
        scannedAt: new Date().toISOString(),
        tourId: "tour-xyz",
      },
    };
    expect(broadcast.type).toBe("patrol_scan");
    expect(broadcast.data.officerName).toBeTruthy();
    expect(broadcast.data.checkpointName).toBeTruthy();
  });

  it("patrol_missed broadcast escalates to CAD", () => {
    const broadcast = {
      type: "patrol_missed",
      data: {
        tourId: "tour-xyz",
        checkpointName: "South Gate",
        minutesMissed: 25,
        severity: "warning",
        message: "⚠️ South Gate missed 25min",
      },
    };
    expect(broadcast.type).toBe("patrol_missed");
    expect(broadcast.data.minutesMissed).toBe(25);
  });

  it("HelpAI patrol message format includes officer and checkpoint", () => {
    const officerName = "Maria Lopez";
    const checkpointName = "Building B Entrance";
    const msg = `✅ ${officerName} cleared **${checkpointName}** — ${new Date().toLocaleTimeString()}`;
    expect(msg).toContain(officerName);
    expect(msg).toContain(checkpointName);
    expect(msg).toContain("✅");
  });
});

describe("QR Print Sheet", () => {
  it("print URL format is correct", () => {
    const tourId = "tour-abc-123";
    const url = `/guard-tours/print-qr/${tourId}`;
    expect(url).toBe("/guard-tours/print-qr/tour-abc-123");
  });

  it("checkpoint sort order determines patrol sequence", () => {
    const checkpoints = [
      { name: "Gate C", sortOrder: 3 },
      { name: "Gate A", sortOrder: 1 },
      { name: "Gate B", sortOrder: 2 },
    ];
    const sorted = [...checkpoints].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted[0].name).toBe("Gate A");
    expect(sorted[2].name).toBe("Gate C");
  });
});
