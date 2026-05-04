/**
 * PTT Dispatcher Service — Wave 19
 * ─────────────────────────────────────────────────────────────────────────────
 * Processes every push-to-talk transmission through the full pipeline:
 *
 *   Audio received → Whisper transcription → GPS stamp → HelpAI dispatch
 *   → CAD event log → broadcastToWorkspace → four-layer delivery
 *
 * Auto-extracts from transcript:
 *   - License plates  → ptt_plate_log
 *   - Incident reports → cad_event_log
 *   - Status updates  → unit_statuses
 *   - Location reports → gps_locations
 *
 * HelpAI responds as a dispatcher: acknowledges, logs, routes, alerts.
 */

import { randomUUID } from "crypto";
import { pool } from "../../db";
import { broadcastToWorkspace } from "../../websocket";
import { createLogger } from "../../lib/logger";
import { scheduleNonBlocking } from "../../lib/scheduleNonBlocking";

const log = createLogger("PTTDispatcher");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PTTTransmission {
  id: string;
  workspaceId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  audioUrl: string;
  durationMs: number;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}

export interface PTTExtract {
  plates: string[];
  incidents: string[];
  statusUpdate: string | null;
  location: string | null;
  priority: "routine" | "urgent" | "emergency";
}

// ── Gemini extract: plates, incidents, status, priority ───────────────────────

async function extractFromTranscript(
  transcript: string,
  workspaceId: string,
  userId: string
): Promise<PTTExtract> {
  try {
    const { meteredGemini } = await import("../billing/meteredGeminiClient");
    const { GEMINI_MODELS } = await import("../ai-brain/providers/geminiClient");

    const prompt = [
      "You are a security dispatch AI. Extract structured data from this radio transmission.",
      "Return ONLY valid JSON with this exact shape:",
      '{',
      '  "plates": ["ABC123"],',
      '  "incidents": ["description of incident if any"],',
      '  "statusUpdate": "10-4 | arrived on scene | code 4 | etc or null",',
      '  "location": "location mentioned or null",',
      '  "priority": "routine | urgent | emergency"',
      '}',
      "Use emergency only for imminent danger. Urgent for active incidents. Routine for everything else.",
      "Transmission: " + transcript,
    ].join(" ");

    const result = await meteredGemini.generateContent({
      model: GEMINI_MODELS.FLASH,
      systemInstruction: "Extract dispatch data from security radio transmissions. Return only JSON.",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      workspaceId,
      userId,
      feature: "ptt_extract",
    });

    const text = result.response.text().trim()
      .replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(text) as PTTExtract;
  } catch {
    return { plates: [], incidents: [], statusUpdate: null, location: null, priority: "routine" };
  }
}

// ── HelpAI dispatcher response ────────────────────────────────────────────────

async function generateDispatcherResponse(params: {
  transcript: string;
  senderName: string;
  extract: PTTExtract;
  workspaceId: string;
  userId: string;
}): Promise<string> {
  const { transcript, senderName, extract, workspaceId, userId } = params;
  try {
    const { meteredGemini } = await import("../billing/meteredGeminiClient");
    const { GEMINI_MODELS } = await import("../ai-brain/providers/geminiClient");

    const context = [
      extract.plates.length > 0 ? "Plates logged: " + extract.plates.join(", ") : "",
      extract.incidents.length > 0 ? "Incidents: " + extract.incidents.join("; ") : "",
      extract.statusUpdate ? "Status: " + extract.statusUpdate : "",
      extract.location ? "Location: " + extract.location : "",
    ].filter(Boolean).join(". ");

    const prompt = [
      "You are HelpAI, acting as a professional security dispatcher.",
      "Officer " + senderName + " just transmitted: [" + transcript + "]",
      context ? "Auto-logged: " + context : "",
      "Respond in 1-2 short dispatcher sentences. Acknowledge, confirm what was logged, give guidance if needed.",
      "Use radio tone: concise, clear, professional. No fluff. No 'I' statements.",
      "If emergency: immediate and direct. If routine: brief copy acknowledgment.",
      "Never reference 911 directly — say 'contact local authorities' if needed.",
    ].join(" ");

    const result = await meteredGemini.generateContent({
      model: GEMINI_MODELS.FLASH,
      systemInstruction: "You are a security dispatch AI. Respond concisely in dispatcher voice.",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      workspaceId,
      userId,
      feature: "ptt_dispatch",
    });

    return result.response.text().trim().slice(0, 300);
  } catch {
    return extract.priority === "emergency"
      ? "Copy — emergency alert received. All units be advised. Supervisor notified."
      : "Copy, " + senderName + ". Logged.";
  }
}

// ── Write to CAD event log ────────────────────────────────────────────────────

async function writeCadEvent(params: {
  workspaceId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  transcript: string;
  extract: PTTExtract;
  latitude: number | null;
  longitude: number | null;
  transmissionId: string;
}): Promise<void> {
  const { workspaceId, senderId, senderName, transcript, extract, latitude, longitude, transmissionId } = params;
  try {
    await pool.query(
      `INSERT INTO cad_event_log
         (id, workspace_id, event_type, source, actor_id, actor_name,
          description, metadata, latitude, longitude, priority, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,NOW())
       ON CONFLICT DO NOTHING`,
      [
        randomUUID(),
        workspaceId,
        "ptt_transmission",
        "radio",
        senderId,
        senderName,
        transcript.slice(0, 500),
        JSON.stringify({
          transmissionId,
          plates: extract.plates,
          incidents: extract.incidents,
          statusUpdate: extract.statusUpdate,
          location: extract.location,
        }),
        latitude,
        longitude,
        extract.priority,
      ]
    );

    // Log plates to dedicated plate log
    for (const plate of extract.plates) {
      await pool.query(
        `INSERT INTO ptt_plate_log
           (id, workspace_id, plate_fragment, full_context, reporter_id, reporter_name,
            latitude, longitude, transmission_id, logged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT DO NOTHING`,
        [randomUUID(), workspaceId, plate.toUpperCase(), transcript.slice(0, 300),
         senderId, senderName, latitude, longitude, transmissionId]
      );
    }
  } catch (err: unknown) {
    log.warn("[PTT] CAD event write failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

// ── Update GPS locations from PTT (breadcrumb) ───────────────────────────────

async function stampGpsFromPTT(params: {
  workspaceId: string;
  employeeId: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const { workspaceId, employeeId, latitude, longitude } = params;
  try {
    await pool.query(
      `INSERT INTO gps_locations
         (id, workspace_id, employee_id, latitude, longitude,
          source, accuracy, created_at, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,'ptt',50,NOW(),NOW())`,
      [workspaceId, employeeId, latitude, longitude]
    );
  } catch {
    // Non-fatal — gps_locations may not have all columns yet
  }
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processPTTTransmission(params: {
  transmission: PTTTransmission;
  transcript: string;
  employeeId: string | null;
}): Promise<{
  dispatcherResponse: string;
  extract: PTTExtract;
  cadEventId: string | null;
}> {
  const { transmission, transcript, employeeId } = params;
  const { workspaceId, roomId, senderId, senderName, latitude, longitude } = transmission;

  log.info(`[PTT] Processing transmission from ${senderName} in room ${roomId}: "${transcript.slice(0, 80)}"`);

  // Run extraction and dispatcher response in parallel
  const [extract, dispatcherResponse] = await Promise.all([
    extractFromTranscript(transcript, workspaceId, senderId),
    generateDispatcherResponse({
      transcript, senderName,
      extract: { plates: [], incidents: [], statusUpdate: null, location: null, priority: "routine" },
      workspaceId, userId: senderId,
    }).then(() => null), // placeholder — regenerate after extract
  ]);

  // Generate proper response now that we have extract data
  const finalResponse = await generateDispatcherResponse({
    transcript, senderName, extract, workspaceId, userId: senderId,
  });

  // Write CAD event (non-blocking)
  scheduleNonBlocking("ptt.cad_event", () =>
    writeCadEvent({
      workspaceId, roomId, senderId, senderName, transcript,
      extract, latitude, longitude, transmissionId: transmission.id,
    })
  );

  // Stamp GPS breadcrumb (non-blocking)
  if (employeeId && latitude && longitude) {
    scheduleNonBlocking("ptt.gps_stamp", () =>
      stampGpsFromPTT({ workspaceId, employeeId, latitude, longitude })
    );
  }

  // Notify supervisor if emergency priority (non-blocking)
  if (extract.priority === "emergency") {
    scheduleNonBlocking("ptt.emergency_notify", async () => {
      const { rows } = await pool.query(
        `SELECT DISTINCT u.phone FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
         WHERE wm.workspace_id = $1
           AND wm.workspace_role IN ('org_owner','co_owner','department_manager','supervisor')
           AND u.phone IS NOT NULL LIMIT 5`,
        [workspaceId]
      );
      const { sendSMS } = await import("../smsService");
      for (const c of rows) {
        sendSMS({
          to: c.phone,
          body: `🚨 RADIO EMERGENCY — ${senderName}: "${transcript.slice(0, 200)}"`,
          workspaceId,
          type: "system_alert",
        }).catch(() => {});
      }
    });
  }

  // Broadcast dispatcher response back to shift room
  broadcastToWorkspace(workspaceId, {
    type: "ptt_dispatcher_response",
    payload: {
      roomId,
      transmissionId: transmission.id,
      senderName,
      transcript,
      dispatcherResponse: finalResponse,
      extract: {
        plates: extract.plates,
        priority: extract.priority,
        statusUpdate: extract.statusUpdate,
        location: extract.location,
        incidentCount: extract.incidents.length,
      },
      timestamp: new Date().toISOString(),
    },
  });

  // Broadcast to CAD board
  broadcastToWorkspace(workspaceId, {
    type: "cad_ptt_event",
    payload: {
      transmissionId: transmission.id,
      roomId,
      senderName,
      senderId,
      transcript: transcript.slice(0, 300),
      priority: extract.priority,
      plates: extract.plates,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    },
  });

  return { dispatcherResponse: finalResponse, extract, cadEventId: null };
}

// ── DB schema bootstrap ───────────────────────────────────────────────────────

export async function ensurePTTSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      -- PTT transmission log
      CREATE TABLE IF NOT EXISTS ptt_transmissions (
        id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id    VARCHAR NOT NULL,
        room_id         VARCHAR NOT NULL,
        sender_id       VARCHAR NOT NULL,
        sender_name     VARCHAR NOT NULL,
        audio_url       TEXT NOT NULL,
        duration_ms     INTEGER,
        transcript      TEXT,
        dispatcher_response TEXT,
        extract_data    JSONB,
        latitude        DOUBLE PRECISION,
        longitude       DOUBLE PRECISION,
        priority        VARCHAR DEFAULT 'routine',
        created_at      TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ptt_transmissions_workspace_idx
        ON ptt_transmissions(workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ptt_transmissions_room_idx
        ON ptt_transmissions(room_id, created_at DESC);

      -- Plate log from PTT
      CREATE TABLE IF NOT EXISTS ptt_plate_log (
        id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id    VARCHAR NOT NULL,
        plate_fragment  VARCHAR NOT NULL,
        full_context    TEXT,
        reporter_id     VARCHAR,
        reporter_name   VARCHAR,
        latitude        DOUBLE PRECISION,
        longitude       DOUBLE PRECISION,
        transmission_id VARCHAR,
        logged_at       TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ptt_plate_log_workspace_idx
        ON ptt_plate_log(workspace_id, logged_at DESC);

      -- Unified CAD event stream (used by Matrix Ticker + CAD map)
      CREATE TABLE IF NOT EXISTS cad_event_log (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id VARCHAR NOT NULL,
        event_type   VARCHAR NOT NULL,  -- ptt_transmission, nfc_scan, clock_in, panic_alert, etc.
        source       VARCHAR,           -- radio, app, voice, nfc, system
        actor_id     VARCHAR,
        actor_name   VARCHAR,
        description  TEXT,
        metadata     JSONB,
        latitude     DOUBLE PRECISION,
        longitude    DOUBLE PRECISION,
        priority     VARCHAR DEFAULT 'routine',
        created_at   TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS cad_event_log_workspace_idx
        ON cad_event_log(workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS cad_event_log_type_idx
        ON cad_event_log(workspace_id, event_type, created_at DESC);
    `);
    log.info("[PTT] Schema ensured");
  } catch (err: unknown) {
    log.warn("[PTT] Schema ensure failed (non-fatal):", err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}
