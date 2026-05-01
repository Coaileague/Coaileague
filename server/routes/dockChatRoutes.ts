/**
 * Phase 35C — DockChat: Internal Communications
 * Routes: /api/chat/dock/*, extending existing /api/chat/rooms infrastructure
 * Reuses organization_chat_rooms, chat_messages, organization_room_members tables.
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { pool } from "../db";
// platformActionHub not used in DockChat routes (bot commands are inline handlers)
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { createNotification } from "../services/notificationService";

const router = Router();

function getQueryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const BOT_COMMANDS = [
  { prefix: "/schedule", description: "Check your upcoming schedule", minRole: "staff" },
  { prefix: "/calloff", description: "Submit a call-off request", minRole: "staff" },
  { prefix: "/incident", description: "File a quick incident report", minRole: "staff" },
  { prefix: "/roster", description: "View today's roster", minRole: "staff" },
  { prefix: "/help", description: "List all available commands", minRole: "staff" },
  { prefix: "/trinity", description: "Ask Trinity anything", minRole: "staff" },
];

// ── ROOMS ──────────────────────────────────────────────────────────────────

router.get("/rooms", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid) return res.status(400).json({ error: "Workspace required" });

    // Get rooms user is a member of (or all rooms for managers)
    const { rows } = await pool.query(
      `SELECT r.*, 
        (SELECT COUNT(*) FROM chat_messages m 
         WHERE m.workspace_id = r.workspace_id 
           AND m.conversation_id = r.conversation_id
           AND m.created_at > COALESCE(rm.last_active_at, '1970-01-01')) AS unread_count,
        (SELECT content FROM chat_messages m2 
         WHERE m2.workspace_id = r.workspace_id 
           AND m2.conversation_id = r.conversation_id
         ORDER BY m2.created_at DESC LIMIT 1) AS last_message
       FROM organization_chat_rooms r
       LEFT JOIN organization_room_members rm ON rm.room_id = r.id AND rm.user_id = $2
       WHERE r.workspace_id = $1 AND r.status = 'active'
         AND (rm.user_id IS NOT NULL OR $3)
       ORDER BY r.created_at DESC`,
      [wid, uid, false]
    );
    res.json(rows);
  } catch (err: unknown) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/rooms", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Workspace and auth required" });
    const { roomName, description, roomType, memberIds } = req.body;
    if (!roomName) return res.status(400).json({ error: "roomName required" });

    const slug = roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { rows } = await pool.query(
      `INSERT INTO organization_chat_rooms (workspace_id, room_name, room_slug, description, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [wid, roomName, `${slug}-${Date.now()}`, description || null, uid]
    );
    const room = rows[0];

    // Add creator as owner
    await pool.query(
      `INSERT INTO organization_room_members (room_id, user_id, workspace_id, role, is_approved)
       VALUES ($1,$2,$3,'owner',true) ON CONFLICT DO NOTHING`,
      [room.id, uid, wid]
    );

    // Add other members
    if (Array.isArray(memberIds)) {
      for (const memberId of memberIds) {
        if (memberId !== uid) {
          await pool.query(
            `INSERT INTO organization_room_members (room_id, user_id, workspace_id, role, is_approved)
             VALUES ($1,$2,$3,'member',true) ON CONFLICT DO NOTHING`,
            [room.id, memberId, wid]
          );
        }
      }
    }
    res.status(201).json(room);
  } catch (err: unknown) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── MESSAGES ───────────────────────────────────────────────────────────────

router.get("/rooms/:roomId/messages", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { roomId } = req.params;
    const page = Number.parseInt(getQueryString(req.query.page) || "1", 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    // Get conversation_id from the room
    const room = await pool.query(
      `SELECT conversation_id FROM organization_chat_rooms WHERE id=$1 AND workspace_id=$2`,
      [roomId, wid]
    );

    let messages: any[] = [];
    if (room.rows[0]?.conversation_id) {
      const { rows } = await pool.query(
        `SELECT m.*, u.first_name, u.last_name FROM chat_messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.workspace_id=$1 AND m.conversation_id=$2
         ORDER BY m.created_at DESC LIMIT $3 OFFSET $4`,
        [wid, room.rows[0].conversation_id, limit, offset]
      );
      messages = rows;
    }

    // Also fetch direct messages using room_id pattern
    const { rows: roomMsgs } = await pool.query(
      `SELECT * FROM chat_messages WHERE workspace_id=$1 AND (metadata->>'room_id')=$2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [wid, roomId, limit, offset]
    );

    const combined = [...messages, ...roomMsgs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    res.json({ messages: combined.reverse(), page, limit });
  } catch (err: unknown) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/rooms/:roomId/messages", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { roomId } = req.params;
    const { content, messageType, clientMessageId } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });

    // CD-5: Room status gate — block posting to archived/closed rooms
    const roomCheck = await pool.query(
      `SELECT status, conversation_type FROM chat_conversations
       WHERE (id = $1 OR metadata->>'room_id' = $1) AND workspace_id = $2 LIMIT 1`,
      [roomId, wid]
    );
    if (roomCheck.rows[0]?.status === 'closed') {
      return res.status(403).json({
        error: "This shift room has been archived. It is now read-only.",
        code: "ROOM_ARCHIVED",
      });
    }

    // Bot command handling
    if (content.startsWith("/")) {
      return handleBotCommand(req, res, roomId, content, wid, uid);
    }

    // CD-8: Idempotency key — client generates UUID per send attempt
    // ON CONFLICT DO NOTHING: if same clientMessageId arrives twice, return existing message
    const msgClientId = clientMessageId || null;

    // @Trinity mention
    if (content.includes("@Trinity") || content.includes("@trinity")) {
      const { rows } = await pool.query(
        `INSERT INTO chat_messages
           (workspace_id, sender_id, sender_type, content, message_type, metadata,
            client_message_id, delivery_status, sequence_number)
         VALUES ($1,$2,'user',$3,$4,$5,$6,'sent',
           (SELECT COALESCE(MAX(sequence_number),0)+1 FROM chat_messages
            WHERE workspace_id=$1 AND metadata->>'room_id'=$7))
         ON CONFLICT (client_message_id) DO NOTHING
         RETURNING *`,
        [wid, uid, content, messageType || "text",
         JSON.stringify({ room_id: roomId }), msgClientId, roomId]
      );
      if (rows.length === 0) {
        // Already inserted — find and return existing
        const existing = await pool.query(
          `SELECT * FROM chat_messages WHERE client_message_id=$1 LIMIT 1`,
          [msgClientId]
        );
        return res.status(200).json(existing.rows[0] || { success: true, deduplicated: true });
      }
      setImmediate(() => handleTrinityMention(wid, roomId, uid, content));
      return res.status(201).json(rows[0]);
    }

    // Standard message — CD-8 idempotency + CD-9 delivery_status + CD-7 sequence_number
    const { rows } = await pool.query(
      `INSERT INTO chat_messages
         (workspace_id, sender_id, sender_type, content, message_type, metadata,
          client_message_id, delivery_status, sequence_number)
       VALUES ($1,$2,'user',$3,$4,$5,$6,'sent',
         (SELECT COALESCE(MAX(sequence_number),0)+1 FROM chat_messages
          WHERE workspace_id=$1 AND metadata->>'room_id'=$7))
       ON CONFLICT (client_message_id) DO NOTHING
       RETURNING *`,
      [wid, uid, content, messageType || "text",
       JSON.stringify({ room_id: roomId }), msgClientId, roomId]
    );

    if (rows.length === 0) {
      const existing = await pool.query(
        `SELECT * FROM chat_messages WHERE client_message_id=$1 LIMIT 1`,
        [msgClientId]
      );
      return res.status(200).json(existing.rows[0] || { success: true, deduplicated: true });
    }

    // @mention notifications (fire-and-forget)
    const mentionMatches = content.match(/@(\w+)/g) || [];
    for (const mention of mentionMatches) {
      const mentionedUser = mention.slice(1);
      pool.query(`SELECT id FROM users WHERE username=$1 OR first_name=$2`, [mentionedUser, mentionedUser])
        .then(userRes => {
          if (userRes.rows[0]) {
            createNotification({
              userId: userRes.rows[0].id,
              workspaceId: wid,
              title: "You were mentioned",
              message: `${content.slice(0, 80)}`,
              type: "mention",
              actionUrl: `/dock-chat?room=${roomId}`,
              idempotencyKey: `mention-${rows[0].id}-${userRes.rows[0].id}`
            }).catch(() => null);
          }
        }).catch(() => null);
    }

    res.status(201).json(rows[0]);
  } catch (err: unknown) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/rooms/:roomId/broadcast", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { roomId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });

    const { rows } = await pool.query(
      `INSERT INTO chat_messages (workspace_id, sender_id, sender_type, content, message_type, metadata)
       VALUES ($1,$2,'user',$3,'announcement',$4) RETURNING *`,
      [wid, uid, content, JSON.stringify({ room_id: roomId, is_broadcast: true })]
    );

    // Notify all room members
    const members = await pool.query(
      `SELECT user_id FROM organization_room_members WHERE room_id=$1 AND workspace_id=$2 AND user_id != $3`,
      [roomId, wid, uid]
    );
    for (const m of members.rows) {
      await createNotification({
        userId: m.user_id,
        workspaceId: wid,
        title: "Broadcast Message",
        message: content.slice(0, 100),
        type: "broadcast",
        actionUrl: `/dock-chat?room=${roomId}`,
        idempotencyKey: `broadcast-${Date.now()}-${m.user_id}`
      }).catch(() => null);
    }
    res.status(201).json(rows[0]);
  } catch (err: unknown) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── DIRECT MESSAGES ─────────────────────────────────────────────────────────

router.get("/direct/:targetUserId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { targetUserId } = req.params;

    // Find or create DM room
    const existing = await pool.query(
      `SELECT r.* FROM organization_chat_rooms r
       JOIN organization_room_members m1 ON m1.room_id = r.id AND m1.user_id = $2
       JOIN organization_room_members m2 ON m2.room_id = r.id AND m2.user_id = $3
       WHERE r.workspace_id = $1 AND r.room_slug LIKE 'dm-%'
       LIMIT 1`,
      [wid, uid, targetUserId]
    );

    if (existing.rows[0]) {
      return res.json(existing.rows[0]);
    }

    // Create new DM room
    const slug = `dm-${[uid, targetUserId].sort().join("-")}`;
    const { rows } = await pool.query(
      `INSERT INTO organization_chat_rooms (workspace_id, room_name, room_slug, created_by)
       VALUES ($1,'Direct Message',$2,$3) RETURNING *`,
      [wid, slug, uid]
    );
    const room = rows[0];
    for (const memberId of [uid, targetUserId]) {
      await pool.query(
        `INSERT INTO organization_room_members (room_id, user_id, workspace_id, role, is_approved)
         VALUES ($1,$2,$3,'member',true) ON CONFLICT DO NOTHING`,
        [room.id, memberId, wid]
      );
    }
    res.status(201).json(room);
  } catch (err: unknown) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── BOT COMMANDS ────────────────────────────────────────────────────────────

router.get("/commands", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });

    // Return default + custom commands
    const { rows: custom } = await pool.query(
      `SELECT * FROM chat_bot_commands WHERE workspace_id=$1 AND is_enabled=true ORDER BY command_prefix`,
      [wid]
    );
    res.json({ builtin: BOT_COMMANDS, custom: custom });
  } catch (err: unknown) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── HELPERS ─────────────────────────────────────────────────────────────────

async function handleBotCommand(
  req: AuthenticatedRequest, res: any, roomId: string, content: string, wid: string, uid: string
) {
  const parts = content.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  let botResponse = "";

  switch (cmd) {
    case "/help":
      botResponse = "**Available Commands:**\n" + BOT_COMMANDS.map(c => `• ${c.prefix} — ${c.description}`).join("\n");
      break;
    case "/schedule": {
      const { rows: shifts } = await pool.query(
        `SELECT s.start_time, s.end_time, s.site_name
         FROM shifts s
         JOIN employees e ON e.user_id = $2
         WHERE s.workspace_id=$1 AND s.employee_id=e.id AND s.start_time >= NOW()
         ORDER BY s.start_time LIMIT 5`,
        [wid, uid]
      );
      botResponse = shifts.length > 0
        ? "**Your upcoming shifts:**\n" + shifts.map(s =>
            `• ${new Date(s.start_time).toLocaleString()} — ${s.site_name || "Site TBD"}`
          ).join("\n")
        : "No upcoming shifts found.";
      break;
    }
    case "/calloff":
      botResponse = "To submit a call-off, go to **My Shifts** in the shift trading section. A manager will be notified.";
      break;
    case "/incident":
      botResponse = "To file an incident report, go to **Field Ops → Incidents**. Need help? Type `/trinity how do I file an incident?`";
      break;
    case "/roster": {
      const { rows: roster } = await pool.query(
        `SELECT e.first_name, e.last_name, s.site_name
         FROM shifts s JOIN employees e ON e.id=s.employee_id
         WHERE s.workspace_id=$1 AND s.start_time::date = CURRENT_DATE`,
        [wid]
      );
      botResponse = roster.length > 0
        ? "**Today's roster:**\n" + roster.map(r => `• ${r.first_name} ${r.last_name} — ${r.site_name || "TBD"}`).join("\n")
        : "No shifts scheduled for today.";
      break;
    }
    case "/trinity": {
      const query = parts.slice(1).join(" ");
      if (!query) {
        botResponse = "Ask Trinity anything: `/trinity your question here`";
      } else {
        try {
          const { trinityChatService } = await import("../services/ai-brain/trinityChatService");
          const result = await trinityChatService.chat({
            userId: uid,
            workspaceId: wid,
            message: query,
            mode: "business",
            sessionId: `chatdock-${roomId}-${uid}`,
          });
          botResponse = (result?.response && typeof result.response === "string" && result.response.trim())
            ? result.response
            : "I was unable to process that request.";
        } catch (err: unknown) {
          botResponse = "Trinity is temporarily unavailable. Please try again shortly.";
        }
      }
      break;
    }
    default:
      botResponse = `Unknown command: ${cmd}. Type /help for available commands.`;
  }

  // Store user message
  await pool.query(
    `INSERT INTO chat_messages (workspace_id, sender_id, sender_type, content, message_type, metadata)
     VALUES ($1,$2,'user',$3,'command',$4)`,
    [wid, uid, content, JSON.stringify({ room_id: roomId })]
  );
  // Store bot response
  const { rows } = await pool.query(
    `INSERT INTO chat_messages (workspace_id, sender_id, sender_type, content, message_type, metadata)
     VALUES ($1,'bot','bot',$2,'text',$3) RETURNING *`,
    [wid, botResponse, JSON.stringify({ room_id: roomId, command: cmd })]
  );
  res.status(201).json({ userMessage: content, botResponse: rows[0] });
}

async function handleTrinityMention(wid: string, roomId: string, uid: string, content: string) {
  let response = "I was unable to process that request.";
  try {
    const { trinityChatService } = await import("../services/ai-brain/trinityChatService");
    const cleaned = content.replace(/@[Tt]rinity/g, "").trim();
    const result = await trinityChatService.chat({
      userId: uid,
      workspaceId: wid,
      message: cleaned,
      mode: "business",
      sessionId: `chatdock-${roomId}-${uid}`,
    });
    if (result?.response && typeof result.response === "string" && result.response.trim()) {
      response = result.response;
    }
  } catch (err: unknown) {
    try {
      const { createLogger } = await import("../lib/logger");
      createLogger("DockChatTrinity").warn("Trinity mention failed (non-fatal):", err?.message);
    } catch { /* non-fatal */ }
  }

  try {
    await pool.query(
      `INSERT INTO chat_messages (workspace_id, sender_id, sender_type, content, message_type, metadata)
       VALUES ($1,'trinity','trinity',$2,'text',$3)`,
      [wid, response, JSON.stringify({ room_id: roomId })]
    );
  } catch { /* non-fatal */ }
}

export default router;
