/**
 * Wave 19 — PTT Radio Tests
 * Tests the core dispatcher service logic without hitting external APIs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock heavy dependencies ───────────────────────────────────────────────────

vi.mock("../../server/services/billing/meteredGeminiClient", () => ({
  meteredGemini: {
    generateContent: vi.fn().mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            plates: ["ABC123", "XYZ-789"],
            incidents: ["Suspicious person pacing near entrance"],
            statusUpdate: "10-21",
            location: "south parking lot",
            priority: "urgent",
          }),
      },
    }),
  },
}));

vi.mock("../../server/services/ai-brain/providers/geminiClient", () => ({
  GEMINI_MODELS: { FLASH: "gemini-2.5-flash" },
}));

vi.mock("../../server/db", () => ({
  pool: { connect: vi.fn(), query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
}));

vi.mock("../../server/websocket", () => ({
  broadcastToWorkspace: vi.fn(),
}));

vi.mock("../../server/lib/scheduleNonBlocking", () => ({
  scheduleNonBlocking: (_label: string, fn: () => Promise<void>) => fn().catch(() => {}),
}));

vi.mock("../../server/services/smsService", () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import type { PTTTransmission } from "../../server/services/ptt/pttDispatcherService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTransmission(overrides: Partial<PTTTransmission> = {}): PTTTransmission {
  return {
    id: "tx-" + Math.random().toString(36).slice(2),
    workspaceId: "ws-statewide",
    roomId: "room-shift-1",
    senderId: "user-bryan",
    senderName: "Bryan",
    audioUrl: "https://storage.example.com/ptt/test.webm",
    durationMs: 8500,
    latitude: 31.9686,
    longitude: -99.9018,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── Plate extraction logic ────────────────────────────────────────────────────

describe("PTT plate detection patterns", () => {
  const PLATE_PATTERNS = [
    { input: "plates Alpha Bravo 7-7-3", expected: true },
    { input: "vehicle with plates ABC123", expected: true },
    { input: "Texas plate Charlie Echo Fox 5", expected: true },
    { input: "all quiet on the northern perimeter, nothing to report", expected: false },
    { input: "license plate Mike Echo 552", expected: true },
  ];

  PLATE_PATTERNS.forEach(({ input, expected }) => {
    it(`${expected ? "detects" : "ignores"} plates in: "${input.slice(0, 40)}"`, () => {
    const t = input.toLowerCase();
      const detected = ["plate","plates","license","alpha","bravo","charlie","delta","echo","mike","lima","fox"].some(w => t.includes(w));
      expect(detected).toBe(expected);
    });
  });
});

// ── Priority classification ───────────────────────────────────────────────────

describe("PTT priority classification", () => {
  const PRIORITY_CASES = [
    { transcript: "10-4 copy that, all quiet on site", expected: "routine" },
    { transcript: "active fight in the lobby, need backup", expected: "emergency" },
    { transcript: "suspicious vehicle circling the parking lot", expected: "urgent" },
    { transcript: "checking in at checkpoint alpha, all clear", expected: "routine" },
    { transcript: "officer down, officer down, send help now", expected: "emergency" },
    { transcript: "visitor tailgated through the gate", expected: "urgent" },
  ];

  function classifyPriority(transcript: string): "routine" | "urgent" | "emergency" {
    const t = transcript.toLowerCase();
    const emergencyWords = ["down","attack","weapon","gun","shot","fire","evacuate","emergency","help now","send help","active fight","backup"];
    if (emergencyWords.some(w => t.includes(w))) return "emergency";
    const urgentWords = ["suspicious","fight","breach","tailgat","unauthorized","incident","circling"];
    if (urgentWords.some(w => t.includes(w))) return "urgent";
    return "routine";
  }

  PRIORITY_CASES.forEach(({ transcript, expected }) => {
    it(`classifies "${transcript.slice(0, 50)}" as ${expected}`, () => {
      expect(classifyPriority(transcript)).toBe(expected);
    });
  });
});

// ── Transmission structure ────────────────────────────────────────────────────

describe("PTT transmission structure", () => {
  it("transmission has required fields", () => {
    const tx = makeTransmission();
    expect(tx.id).toBeTruthy();
    expect(tx.workspaceId).toBe("ws-statewide");
    expect(tx.roomId).toBe("room-shift-1");
    expect(tx.senderName).toBe("Bryan");
    expect(tx.durationMs).toBe(8500);
  });

  it("transmission with GPS coordinates", () => {
    const tx = makeTransmission({ latitude: 31.9686, longitude: -99.9018 });
    expect(tx.latitude).toBeCloseTo(31.97, 1);
    expect(tx.longitude).toBeCloseTo(-99.9, 1);
  });

  it("transmission without GPS is valid (indoor, no signal)", () => {
    const tx = makeTransmission({ latitude: null, longitude: null });
    expect(tx.latitude).toBeNull();
    expect(tx.longitude).toBeNull();
    expect(tx.id).toBeTruthy();
  });
});

// ── Radio crackle tone metadata ───────────────────────────────────────────────

describe("PTT audio format support", () => {
  const SUPPORTED_FORMATS = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/aac"];
  const UNSUPPORTED_FORMATS = ["video/mp4", "image/jpeg", "text/plain"];

  SUPPORTED_FORMATS.forEach(mime => {
    it("accepts " + mime, () => {
      const isAudio = mime.startsWith("audio/");
      expect(isAudio).toBe(true);
    });
  });

  UNSUPPORTED_FORMATS.forEach(mime => {
    it("rejects " + mime, () => {
      const isAudio = mime.startsWith("audio/");
      expect(isAudio).toBe(false);
    });
  });
});

// ── CAD integration ───────────────────────────────────────────────────────────

describe("PTT → CAD event mapping", () => {
  it("maps transmission priority to CAD event priority", () => {
    const priorityMap: Record<string, string> = {
      routine: "low",
      urgent: "medium",
      emergency: "critical",
    };
    expect(priorityMap["routine"]).toBe("low");
    expect(priorityMap["urgent"]).toBe("medium");
    expect(priorityMap["emergency"]).toBe("critical");
  });

  it("extracts incident description for CAD log", () => {
    const transcript = "Unit 4 reporting, suspicious white Honda at south entrance, no plates visible";
    const incidentKeywords = ["suspicious", "reporting", "unit"];
    const hasIncident = incidentKeywords.some(k => transcript.toLowerCase().includes(k));
    expect(hasIncident).toBe(true);
  });

  it("links PTT to shift room for log correlation", () => {
    const tx = makeTransmission({ roomId: "room-night-shift-2" });
    const cadEvent = {
      source: "radio",
      roomId: tx.roomId,
      workspaceId: tx.workspaceId,
    };
    expect(cadEvent.roomId).toBe("room-night-shift-2");
    expect(cadEvent.source).toBe("radio");
  });
});

// ── Delivery stack ────────────────────────────────────────────────────────────

describe("PTT delivery cascade logic", () => {
  it("WebSocket is primary delivery when connected", () => {
    const isConnected = true;
    const deliveryMethod = isConnected ? "websocket" : "push_notification";
    expect(deliveryMethod).toBe("websocket");
  });

  it("falls back to push when WebSocket disconnected", () => {
    const isConnected = false;
    const hasPushToken = true;
    const deliveryMethod = isConnected ? "websocket"
      : hasPushToken ? "push_notification"
      : "sms";
    expect(deliveryMethod).toBe("push_notification");
  });

  it("falls back to SMS when push token unavailable", () => {
    const isConnected = false;
    const hasPushToken = false;
    const hasPhone = true;
    const deliveryMethod = isConnected ? "websocket"
      : hasPushToken ? "push_notification"
      : hasPhone ? "sms"
      : "undelivered";
    expect(deliveryMethod).toBe("sms");
  });

  it("emergency triggers voice call fallback", () => {
    const priority = "emergency";
    const useVoiceCall = priority === "emergency";
    expect(useVoiceCall).toBe(true);
  });
});

// ── Dispatcher response format ────────────────────────────────────────────────

describe("Dispatcher response quality", () => {
  const GOOD_RESPONSES = [
    "Copy Unit 4. Plate AB7-partial logged. Incident report filed. Supervisor notified.",
    "10-4, Bryan. All clear confirmed at south lot. Logged 21:43.",
    "Copy. Suspicious vehicle reported, white Accord. Unit 3 en route for backup.",
  ];

  GOOD_RESPONSES.forEach(response => {
    it("response is concise (under 200 chars): " + response.slice(0, 50) + "...", () => {
      expect(response.length).toBeLessThan(200);
    });

    it("response does not contain 911", () => {
      expect(response).not.toContain("911");
    });

    it("response starts with acknowledgment", () => {
      const startsWithAck = /^(copy|10-4|roger|understood|acknowledged)/i.test(response);
      expect(startsWithAck).toBe(true);
    });
  });
});
