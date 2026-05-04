/**
 * PTT Routes — Wave 19
 * Mounted at /api/ptt
 *
 * POST /api/ptt/transmit        — upload audio → transcribe → dispatch
 * GET  /api/ptt/transmissions   — room transmission history
 * GET  /api/ptt/plates          — plate log for workspace
 * GET  /api/ptt/shift-log/:roomId — full shift radio log
 * GET  /api/ptt/cad-feed        — unified CAD event stream for Matrix Ticker
 */

import { Router } from "express";
import multer from "multer";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth";
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { createLogger } from "../lib/logger";
import { pool } from "../db";
import { randomUUID } from "crypto";
import { processPTTTransmission, ensurePTTSchema } from "../services/ptt/pttDispatcherService";
import { transcribeVoiceMessage } from "../services/chat/voiceTranscriptionService";

const log = createLogger("PTTRoutes");
export const pttRouter = Router();

// multer: memory, 20MB, audio only
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith("audio/") ||
      ["webm","opus","ogg","mp4","mp3","wav","m4a"].includes(
        (file.originalname.split(".").pop() || "").toLowerCase()
      );
    ok ? cb(null, true) : cb(new Error("Audio files only"));
  },
});

ensurePTTSchema().catch(() => {});

// ── POST /api/ptt/transmit ────────────────────────────────────────────────────
// Main endpoint. Officer releases PTT → client uploads audio here.
// Returns dispatcher response + extract within ~2s.
pttRouter.post(
  "/transmit",
  requireAuth,
  ensureWorkspaceAccess,
  audioUpload.single("audio"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user?.id || "unknown";
      const {
        roomId, senderName, durationMs,
        latitude, longitude,
      } = req.body as {
        roomId: string;
        senderName: string;
        durationMs?: string;
        latitude?: string;
        longitude?: string;
      };

      if (!req.file) {
        return res.status(400).json({ error: "Audio file required" });
      }
      if (!roomId) {
        return res.status(400).json({ error: "roomId required" });
      }

      // 1. Upload audio to object storage (same pattern as chat-uploads)
      const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      const filename = "ptt-" + randomUUID() + "." +
        (req.file.originalname.split(".").pop() || "webm");
      let audioUrl = "";
      if (BUCKET_ID) {
        try {
          const { Storage } = await import("@google-cloud/storage");
          const storage = new Storage();
          const bucket = storage.bucket(BUCKET_ID);
          const storagePath = "public/ptt-audio/" + workspaceId + "/" + filename;
          const blob = bucket.file(storagePath);
          await new Promise<void>((resolve, reject) => {
            const stream = blob.createWriteStream({
              resumable: false,
              metadata: { contentType: req.file!.mimetype },
              public: true,
            });
            stream.on("error", reject);
            stream.on("finish", resolve);
            stream.end(req.file!.buffer);
          });
          audioUrl = "https://storage.googleapis.com/" + BUCKET_ID + "/" + storagePath;
        } catch (uploadErr: unknown) {
          log.warn("[PTT] GCS upload failed, using data URL fallback:", uploadErr instanceof Error ? uploadErr.message : String(uploadErr));
          // Fallback: store as base64 data URL (dev/test only)
          audioUrl = "data:" + req.file.mimetype + ";base64," + req.file.buffer.toString("base64");
        }
      } else {
        // No GCS configured — use data URL (development)
        audioUrl = "data:" + req.file.mimetype + ";base64," + req.file.buffer.toString("base64");
        log.warn("[PTT] No GCS bucket configured — using inline data URL");
      }

      // 2. Transcribe via Whisper (fast — ~800ms for 10s audio)
      const transcript = await transcribeVoiceMessage(audioUrl) ||
        "[Audio — transcription unavailable]";

      // 3. Look up employee record for GPS logging
      let employeeId: string | null = null;
      try {
        const { rows } = await pool.query(
          "SELECT id FROM employees WHERE user_id=$1 AND workspace_id=$2 AND is_active=true LIMIT 1",
          [userId, workspaceId]
        );
        employeeId = rows[0]?.id || null;
      } catch { /* non-fatal */ }

      // 4. Build transmission record
      const transmissionId = randomUUID();
      const lat = latitude ? parseFloat(latitude) : null;
      const lng = longitude ? parseFloat(longitude) : null;
      const transmission = {
        id: transmissionId,
        workspaceId,
        roomId,
        senderId: userId,
        senderName: senderName || "Unknown",
        audioUrl,
        durationMs: parseInt(durationMs || "0"),
        latitude: lat,
        longitude: lng,
        createdAt: new Date(),
      };

      // 5. Run full dispatcher pipeline
      const { dispatcherResponse, extract } = await processPTTTransmission({
        transmission,
        transcript,
        employeeId,
      });

      // 6. Persist transmission record
      await pool.query(
        `INSERT INTO ptt_transmissions
           (id,workspace_id,room_id,sender_id,sender_name,audio_url,
            duration_ms,transcript,dispatcher_response,extract_data,
            latitude,longitude,priority,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,NOW())`,
        [
          transmissionId, workspaceId, roomId, userId,
          senderName || "Unknown", audioUrl,
          parseInt(durationMs || "0"),
          transcript, dispatcherResponse,
          JSON.stringify(extract),
          lat, lng, extract.priority,
        ]
      );

      return res.json({
        transmissionId,
        audioUrl,
        transcript,
        dispatcherResponse,
        priority: extract.priority,
        plates: extract.plates,
        statusUpdate: extract.statusUpdate,
        location: extract.location,
        incidentCount: extract.incidents.length,
        timestamp: new Date().toISOString(),
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[PTT] /transmit error:", msg);
      return res.status(500).json({
        error: "Transmission failed: " + msg,
        // Always return a dispatcher response so the room shows something
        dispatcherResponse: "Copy. Transmission received — processing issue on our end.",
      });
    }
  }
);

// ── GET /api/ptt/transmissions ────────────────────────────────────────────────
pttRouter.get("/transmissions", requireAuth, ensureWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    const { roomId, limit = "50" } = req.query as { roomId?: string; limit?: string };
    const workspaceId = req.workspaceId!;
    try {
      const where = roomId
        ? "WHERE workspace_id=$1 AND room_id=$2"
        : "WHERE workspace_id=$1";
      const params = roomId ? [workspaceId, roomId] : [workspaceId];
      const { rows } = await pool.query(
        `SELECT id,room_id,sender_name,transcript,dispatcher_response,
                extract_data,priority,latitude,longitude,duration_ms,created_at
         FROM ptt_transmissions ${where}
         ORDER BY created_at DESC LIMIT ${Math.min(parseInt(limit), 200)}`,
        params
      );
      return res.json({ transmissions: rows });
    } catch (err: unknown) {
      return res.status(500).json({ error: "Failed to fetch transmissions" });
    }
  }
);

// ── GET /api/ptt/plates ───────────────────────────────────────────────────────
pttRouter.get("/plates", requireAuth, ensureWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id,plate_fragment,full_context,reporter_name,
                latitude,longitude,logged_at
         FROM ptt_plate_log WHERE workspace_id=$1
         ORDER BY logged_at DESC LIMIT 100`,
        [req.workspaceId!]
      );
      return res.json({ plates: rows });
    } catch {
      return res.status(500).json({ error: "Failed to fetch plate log" });
    }
  }
);

// ── GET /api/ptt/shift-log/:roomId ───────────────────────────────────────────
// Full chronological shift radio log — HelpAI summary generated at end of shift
pttRouter.get("/shift-log/:roomId", requireAuth, ensureWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;
    const workspaceId = req.workspaceId!;
    try {
      const { rows } = await pool.query(
        `SELECT sender_name, transcript, dispatcher_response,
                extract_data, priority, created_at
         FROM ptt_transmissions
         WHERE workspace_id=$1 AND room_id=$2
           AND created_at >= NOW() - INTERVAL '12 hours'
         ORDER BY created_at ASC`,
        [workspaceId, roomId]
      );

      // Generate plain-language shift summary via Gemini
      let summary = "";
      if (rows.length > 0) {
        try {
          const { meteredGemini } = await import("../services/billing/meteredGeminiClient");
          const { GEMINI_MODELS } = await import("../services/ai-brain/providers/geminiClient");
          const logText = rows.map((r: Record<string,unknown>) =>
            "[" + new Date(r.created_at as string).toLocaleTimeString() + "] " +
            r.sender_name + ": " + r.transcript
          ).join("\n");
          const result = await meteredGemini.generateContent({
            model: GEMINI_MODELS.FLASH,
            systemInstruction: "Summarize this security shift radio log in 3-5 bullet points. Be concise and professional.",
            contents: [{ role: "user", parts: [{ text: logText }] }],
            workspaceId, userId: req.user?.id || "system",
            feature: "ptt_shift_summary",
          });
          summary = result.response.text().trim();
        } catch { /* non-fatal */ }
      }

      return res.json({
        roomId, transmissionCount: rows.length,
        transmissions: rows,
        summary: summary || "No summary available.",
      });
    } catch {
      return res.status(500).json({ error: "Failed to fetch shift log" });
    }
  }
);

// ── GET /api/ptt/cad-feed ─────────────────────────────────────────────────────
// Unified CAD event stream — powers the Matrix Ticker beside the map
pttRouter.get("/cad-feed", requireAuth, ensureWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    const { limit = "100", since } = req.query as { limit?: string; since?: string };
    const workspaceId = req.workspaceId!;
    try {
      const sinceClause = since ? "AND created_at > $2" : "";
      const params: (string | Date)[] = since
        ? [workspaceId, new Date(since)]
        : [workspaceId];
      const { rows } = await pool.query(
        `SELECT id,event_type,source,actor_name,description,
                metadata,priority,latitude,longitude,created_at
         FROM cad_event_log
         WHERE workspace_id=$1 ${sinceClause}
         ORDER BY created_at DESC
         LIMIT ${Math.min(parseInt(limit), 500)}`,
        params
      );
      return res.json({ events: rows, count: rows.length });
    } catch {
      return res.status(500).json({ error: "Failed to fetch CAD feed" });
    }
  }
);
