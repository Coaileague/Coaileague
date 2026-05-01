/**
 * ChatDock Runtime Verification — Sandbox Postgres + Test Keys
 * ────────────────────────────────────────────────────────────
 * Boots the real chat backend routers against a sandbox Postgres,
 * seeds two simulated employees + a workspace + a manager + a peer DM,
 * then exercises every ChatDock endpoint over HTTP and reports per-call
 * status, body, and DB state. Surfaces silent failures (5xx swallowed
 * by .catch(() => null), schema mismatches, missing routes).
 *
 * Usage (DATABASE_URL must point at a sandbox database that has the
 * full Drizzle schema pushed via `drizzle-kit push`):
 *
 *   DATABASE_URL='postgres://coai:coai_test@127.0.0.1:5432/coai_chatdock_sandbox' \
 *     SESSION_SECRET=test-only-secret \
 *     NODE_ENV=development \
 *     npx tsx scripts/verify-chatdock/runtime-verify.ts
 *
 * Output:
 *   - Console (live)
 *   - sim_output/chatdock-runtime-verify.json
 */
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { db } from "../../server/db";
import {
  users,
  workspaces,
  employees,
  chatConversations,
  chatMessages,
  chatParticipants,
  conversationUserState,
  messageReactions,
  messageDeletedFor,
  blockedContacts,
} from "../../shared/schema";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { eq, and } from "drizzle-orm";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Defer router imports until after env is verified (they touch process.env.DATABASE_URL).
import chatManagementRouter from "../../server/routes/chat-management";
import chatRoomsRouter from "../../server/routes/chat-rooms";
import chatInlineRouter from "../../server/routes/chatInlineRoutes";
import chatroomCommandRouter from "../../server/routes/chat";
import { attachWorkspaceIdOptional } from "../../server/rbac";

// ─────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────
const FIXTURE = {
  workspaceId: "ws-chatdock-sandbox",
  workspaceName: "ChatDock Sandbox",
  manager: {
    id: "usr-chatdock-manager",
    email: "manager@chatdock.test",
    firstName: "Maya",
    lastName: "Manager",
    employeeId: "emp-chatdock-manager",
  },
  peer: {
    id: "usr-chatdock-peer",
    email: "peer@chatdock.test",
    firstName: "Pat",
    lastName: "Peer",
    employeeId: "emp-chatdock-peer",
  },
  bystander: {
    id: "usr-chatdock-bystander",
    email: "bystander@chatdock.test",
    firstName: "Sam",
    lastName: "Bystander",
    employeeId: "emp-chatdock-bystander",
  },
};
type FixUser = typeof FIXTURE.manager;

// ─────────────────────────────────────────────────────────────────────────
// Pretty test runner
// ─────────────────────────────────────────────────────────────────────────
type Result = {
  name: string;
  pass: boolean;
  status?: number;
  detail?: string;
  payload?: unknown;
};
const RESULTS: Result[] = [];
let CURRENT_USER: FixUser = FIXTURE.manager;
let SERVER_URL = "";

function rec(r: Result) {
  RESULTS.push(r);
  const icon = r.pass ? "✓" : "✗";
  const status = r.status !== undefined ? ` [${r.status}]` : "";
  const detail = r.detail ? ` — ${r.detail}` : "";
  console.log(`  ${icon}${status} ${r.name}${detail}`);
}

async function callApi(
  method: string,
  pathStr: string,
  body?: unknown,
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${SERVER_URL}${pathStr}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-as-user-id": CURRENT_USER.id,
      "x-as-workspace-id": FIXTURE.workspaceId,
      "x-as-workspace-role": "org_owner",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

function asUser(u: FixUser): void {
  CURRENT_USER = u;
}

// ─────────────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("\n[seed] preparing sandbox fixtures…");

  // Idempotent cleanup of prior runs
  const fixIds = [FIXTURE.manager.id, FIXTURE.peer.id, FIXTURE.bystander.id];
  await db.delete(messageReactions).where(eq(messageReactions.workspaceId, FIXTURE.workspaceId));
  await db.delete(chatMessages).where(eq(chatMessages.workspaceId, FIXTURE.workspaceId));
  await db.delete(conversationUserState).where(eq(conversationUserState.workspaceId, FIXTURE.workspaceId));
  await db.delete(chatParticipants).where(eq(chatParticipants.workspaceId, FIXTURE.workspaceId));
  await db.delete(chatConversations).where(eq(chatConversations.workspaceId, FIXTURE.workspaceId));
  await db.delete(blockedContacts).where(eq(blockedContacts.workspaceId, FIXTURE.workspaceId));
  await db.delete(employees).where(eq(employees.workspaceId, FIXTURE.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, FIXTURE.workspaceId));
  for (const id of fixIds) {
    await db.delete(users).where(eq(users.id, id));
  }

  const passwordHash = await bcrypt.hash("Sandb0xT3st!", 12);
  // Users first — workspaces.owner_id references users.id.
  for (const u of [FIXTURE.manager, FIXTURE.peer, FIXTURE.bystander]) {
    await db.insert(users).values({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      passwordHash,
      emailVerified: true,
      currentWorkspaceId: FIXTURE.workspaceId,
      role: "employee",
    } as any).onConflictDoNothing();
  }

  await db.insert(workspaces).values({
    id: FIXTURE.workspaceId,
    name: FIXTURE.workspaceName,
    plan: "free",
    ownerId: FIXTURE.manager.id,
  } as any).onConflictDoNothing();

  for (const u of [FIXTURE.manager, FIXTURE.peer, FIXTURE.bystander]) {
    await db.insert(employees).values({
      id: u.employeeId,
      workspaceId: FIXTURE.workspaceId,
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      status: "active",
      isActive: true,
      workspaceRole: u === FIXTURE.manager ? "org_owner" : "employee",
    } as any).onConflictDoNothing();
  }

  console.log(`[seed] users=${fixIds.length}, workspace=${FIXTURE.workspaceId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Test plan
// ─────────────────────────────────────────────────────────────────────────
async function runTests() {
  const ctx: { dmId?: string; roomId?: string; messageId?: string; peerMessageId?: string } = {};

  console.log("\n[stage 1] List rooms (manager) — fresh workspace should be empty");
  asUser(FIXTURE.manager);
  {
    const r = await callApi("GET", "/api/chat/rooms");
    rec({ name: "GET /api/chat/rooms returns 200", pass: r.status === 200, status: r.status, detail: `rooms=${(r.json?.rooms || r.json || []).length ?? 0}` });
  }

  console.log("\n[stage 2] Search users (manager looking for peer)");
  {
    const r = await callApi("GET", `/api/chat/manage/users/search?q=${encodeURIComponent("peer")}`);
    const found = Array.isArray(r.json) ? r.json.some((u: any) => u.id === FIXTURE.peer.id)
                : r.json?.users?.some((u: any) => u.id === FIXTURE.peer.id);
    rec({ name: "Manager search finds peer in workspace", pass: r.status === 200 && !!found, status: r.status, detail: `result_count=${(Array.isArray(r.json) ? r.json.length : r.json?.users?.length) || 0}` });
  }

  console.log("\n[stage 3] Manager opens DM with peer");
  {
    const r = await callApi("POST", "/api/chat/manage/dm/create", { recipientId: FIXTURE.peer.id });
    ctx.dmId = r.json?.conversationId;
    rec({ name: "POST /api/chat/manage/dm/create returns 200 + conversationId", pass: r.status === 200 && !!ctx.dmId, status: r.status, detail: ctx.dmId ? `conversationId=${ctx.dmId}` : `body=${r.text.slice(0, 200)}` });
  }

  console.log("\n[stage 4] Manager creates a group room with peer + bystander");
  {
    const r = await callApi("POST", "/api/chat/manage/rooms/create", {
      name: "Sandbox Standup",
      participantIds: [FIXTURE.peer.id, FIXTURE.bystander.id],
      description: "Daily sync",
    });
    ctx.roomId = r.json?.conversationId;
    rec({ name: "Group room creation returns conversationId", pass: r.status === 200 && !!ctx.roomId, status: r.status, detail: ctx.roomId ? `conversationId=${ctx.roomId} participantCount=${r.json?.participantCount}` : `body=${r.text.slice(0, 200)}` });
  }

  console.log("\n[stage 5] Get group room participants — must list all three");
  if (ctx.roomId) {
    const r = await callApi("GET", `/api/chat/manage/rooms/${ctx.roomId}/participants`);
    const participants = r.json?.participants || r.json || [];
    const ids = new Set(participants.map((p: any) => p.participantId));
    const allPresent = ids.has(FIXTURE.manager.id) && ids.has(FIXTURE.peer.id) && ids.has(FIXTURE.bystander.id);
    rec({ name: "Participants endpoint returns all 3 seeded users", pass: r.status === 200 && allPresent, status: r.status, detail: `count=${participants.length} ids=${[...ids].join(",")}` });
  }

  console.log("\n[stage 6] Direct DB write of two messages (simulates WS chat_message persistence)");
  if (ctx.dmId) {
    const [m1] = await db.insert(chatMessages).values({
      workspaceId: FIXTURE.workspaceId,
      conversationId: ctx.dmId,
      senderId: FIXTURE.manager.id,
      senderName: `${FIXTURE.manager.firstName} ${FIXTURE.manager.lastName}`,
      senderType: "support",
      message: "Hey Pat — got a minute to review the schedule?",
      messageType: "text",
    } as any).returning();
    const [m2] = await db.insert(chatMessages).values({
      workspaceId: FIXTURE.workspaceId,
      conversationId: ctx.dmId,
      senderId: FIXTURE.peer.id,
      senderName: `${FIXTURE.peer.firstName} ${FIXTURE.peer.lastName}`,
      senderType: "customer",
      message: "Sure — I'll be free in 15 minutes 👍",
      messageType: "text",
    } as any).returning();
    ctx.messageId = m1.id;
    ctx.peerMessageId = m2.id;
    rec({ name: "Two DM messages persisted via Drizzle", pass: !!m1.id && !!m2.id, detail: `manager_msg=${m1.id} peer_msg=${m2.id}` });
  }

  console.log("\n[stage 7] Manager reacts to peer's message with 👍");
  if (ctx.peerMessageId) {
    const r = await callApi("POST", `/api/chat/manage/messages/${ctx.peerMessageId}/reactions`, { emoji: "👍" });
    rec({ name: "POST reactions returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const reactions = await db.select().from(messageReactions).where(eq(messageReactions.messageId, ctx.peerMessageId));
    rec({ name: "Reaction row persisted in message_reactions", pass: reactions.length === 1 && reactions[0].emoji === "👍", detail: `rows=${reactions.length}` });
  }

  console.log("\n[stage 8] Peer reads conversation reactions feed");
  if (ctx.dmId && ctx.peerMessageId) {
    asUser(FIXTURE.peer);
    const r = await callApi("GET", `/api/chat/manage/conversations/${ctx.dmId}/reactions`);
    const reactionsByMsg = r.json?.reactions || {};
    const peerEntry = reactionsByMsg[ctx.peerMessageId] as Array<{ emoji: string; count: number }> | undefined;
    const has = Array.isArray(peerEntry) && peerEntry.some(e => e.emoji === "👍" && e.count >= 1);
    rec({
      name: "Conversation reactions feed reflects manager's 👍",
      pass: r.status === 200 && has,
      status: r.status,
      detail: peerEntry ? JSON.stringify(peerEntry) : `keys=${Object.keys(reactionsByMsg).join(",") || "(empty)"}`,
    });
  }

  console.log("\n[stage 9] Peer edits their own message");
  if (ctx.peerMessageId) {
    asUser(FIXTURE.peer);
    const r = await callApi("PATCH", `/api/chat/manage/messages/${ctx.peerMessageId}/edit`, { message: "Sure — free now actually 🚀" });
    rec({ name: "Peer edits own message", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, ctx.peerMessageId));
    rec({ name: "Edited message persisted (isEdited=true, message updated)", pass: !!row?.isEdited && (row?.message || "").includes("free now"), detail: `isEdited=${row?.isEdited} message="${row?.message?.slice(0, 60)}"` });
  }

  console.log("\n[stage 10] Manager pins their own message + verifies pinned feed");
  if (ctx.messageId && ctx.dmId) {
    asUser(FIXTURE.manager);
    const r = await callApi("POST", `/api/chat/manage/messages/${ctx.messageId}/pin`);
    rec({ name: "POST pin returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const r2 = await callApi("GET", `/api/chat/manage/conversations/${ctx.dmId}/pinned`);
    const list = r2.json?.messages || r2.json?.pinned || r2.json || [];
    rec({ name: "Pinned feed contains the pinned message", pass: r2.status === 200 && Array.isArray(list) && list.some((m: any) => (m.id || m.messageId) === ctx.messageId), status: r2.status, detail: `count=${Array.isArray(list) ? list.length : "(non-array)"}` });
  }

  console.log("\n[stage 11] Conversation full-text search ('schedule')");
  if (ctx.dmId) {
    asUser(FIXTURE.manager);
    const r = await callApi("GET", `/api/chat/manage/conversations/${ctx.dmId}/search?q=${encodeURIComponent("schedule")}`);
    const list = r.json?.messages || r.json?.results || r.json || [];
    rec({ name: "Search returns ≥1 hit for 'schedule'", pass: r.status === 200 && Array.isArray(list) && list.length >= 1, status: r.status, detail: `hits=${Array.isArray(list) ? list.length : "(non-array)"}` });
  }

  console.log("\n[stage 12] Manager mutes the DM");
  if (ctx.dmId) {
    asUser(FIXTURE.manager);
    const r = await callApi("POST", `/api/chat/manage/conversations/${ctx.dmId}/mute`, { muted: true });
    rec({ name: "POST mute conversation returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const [state] = await db.select().from(conversationUserState).where(and(eq(conversationUserState.conversationId, ctx.dmId), eq(conversationUserState.userId, FIXTURE.manager.id)));
    rec({ name: "conversation_user_state.is_muted=true persisted", pass: !!state?.isMuted, detail: `state=${JSON.stringify(state ? { isMuted: state.isMuted, isHidden: state.isHidden } : null)}` });
  }

  console.log("\n[stage 13] Bystander hides the group room from their own list");
  if (ctx.roomId) {
    asUser(FIXTURE.bystander);
    const r = await callApi("POST", `/api/chat/manage/conversations/${ctx.roomId}/hide`);
    rec({ name: "Bystander hide returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const r2 = await callApi("GET", "/api/chat/rooms");
    const rooms = r2.json?.rooms || r2.json || [];
    const hidden = !rooms.some((rm: any) => (rm.roomId || rm.id) === ctx.roomId);
    rec({ name: "After hide, bystander's room list excludes the hidden room", pass: hidden, detail: `room_count=${rooms.length} hiddenRoom=${ctx.roomId}` });
  }

  console.log("\n[stage 14] Mark-as-read (manager) on the DM");
  if (ctx.dmId) {
    asUser(FIXTURE.manager);
    const r = await callApi("POST", "/api/chat/mark-as-read", { conversationId: ctx.dmId });
    rec({ name: "POST mark-as-read returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
  }

  console.log("\n[stage 15] Block / unblock cycle (manager blocks bystander, then unblocks)");
  asUser(FIXTURE.manager);
  {
    const r = await callApi("POST", "/api/chat/manage/block", { blockedUserId: FIXTURE.bystander.id });
    rec({ name: "POST block returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const blocks = await db.select().from(blockedContacts).where(eq(blockedContacts.blockerId, FIXTURE.manager.id));
    rec({ name: "blocked_contacts row persisted", pass: blocks.some(b => b.blockedUserId === FIXTURE.bystander.id), detail: `rows=${blocks.length}` });
  }
  {
    const r = await callApi("POST", "/api/chat/manage/unblock", { blockedUserId: FIXTURE.bystander.id });
    rec({ name: "POST unblock returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const blocks = await db.select().from(blockedContacts).where(and(eq(blockedContacts.blockerId, FIXTURE.manager.id), eq(blockedContacts.blockedUserId, FIXTURE.bystander.id)));
    rec({ name: "blocked_contacts row removed after unblock", pass: blocks.length === 0, detail: `rows=${blocks.length}` });
  }

  console.log("\n[stage 16] Manager forwards their pinned message to the group room");
  if (ctx.messageId && ctx.roomId) {
    asUser(FIXTURE.manager);
    const r = await callApi("POST", `/api/chat/manage/messages/${ctx.messageId}/forward`, { targetConversationId: ctx.roomId });
    rec({ name: "POST forward returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const groupMessages = await db.select().from(chatMessages).where(eq(chatMessages.conversationId, ctx.roomId));
    rec({ name: "Forwarded message lands in the group room", pass: groupMessages.some(m => m.message?.includes("schedule")), detail: `group_msg_count=${groupMessages.length}` });
  }

  console.log("\n[stage 17] Link preview probe — server must not return a usable preview for loopback URLs (SSRF guard)");
  asUser(FIXTURE.manager);
  {
    const r = await callApi("POST", "/api/chat/manage/link-preview", { url: "http://127.0.0.1:80/admin" });
    // Server may return 200 with preview=null (graceful fallback) OR 4xx with an error.
    // Either is acceptable. What is NOT acceptable is a populated preview pointing at the loopback URL.
    const populated = r.json?.preview && (r.json.preview.title || r.json.preview.image);
    rec({
      name: "Link-preview does not return a populated preview for loopback URL",
      pass: !populated,
      status: r.status,
      detail: r.text.slice(0, 200),
    });
  }

  console.log("\n[stage 18] Manager's delete-for-me on their own DM message");
  if (ctx.messageId) {
    asUser(FIXTURE.manager);
    const r = await callApi("POST", `/api/chat/manage/messages/${ctx.messageId}/delete-for-me`);
    rec({ name: "POST delete-for-me returns 2xx", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const rows = await db.select().from(messageDeletedFor).where(and(
      eq(messageDeletedFor.messageId, ctx.messageId),
      eq(messageDeletedFor.userId, FIXTURE.manager.id),
    ));
    rec({ name: "message_deleted_for row persisted (per-user soft delete)", pass: rows.length === 1, detail: `rows=${rows.length}` });
  }

  console.log("\n[stage 19] Trinity auto-react probe — previously a 404 ghost endpoint");
  if (ctx.dmId) {
    asUser(FIXTURE.manager);
    // Drop a fresh user message so trinity-react has something to react to.
    const [trigger] = await db.insert(chatMessages).values({
      workspaceId: FIXTURE.workspaceId,
      conversationId: ctx.dmId,
      senderId: FIXTURE.manager.id,
      senderName: `${FIXTURE.manager.firstName} ${FIXTURE.manager.lastName}`,
      senderType: "support",
      message: "@Trinity please summarize today's shifts",
      messageType: "text",
    } as any).returning();

    const r = await callApi("POST", `/api/chat/manage/messages/${ctx.dmId}/trinity-react`, { emoji: "✅", source: "trinity_auto" });
    rec({ name: "POST trinity-react returns 2xx (no longer a ghost endpoint)", pass: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 200) });
    const reactRows = await db.select().from(messageReactions).where(and(
      eq(messageReactions.messageId, trigger.id),
      eq(messageReactions.emoji, "✅"),
    ));
    rec({ name: "Trinity ✅ reaction persisted on the user's message", pass: reactRows.length === 1, detail: `rows=${reactRows.length}` });
  }

  console.log("\n[stage 20] Re-list rooms (manager) — should now contain the group room + DM");
  asUser(FIXTURE.manager);
  {
    const r = await callApi("GET", "/api/chat/rooms");
    const rooms = r.json?.rooms || r.json || [];
    const ids = new Set(rooms.map((rm: any) => rm.roomId || rm.id));
    rec({ name: "Manager's room list contains the DM and the group room", pass: r.status === 200 && (!ctx.dmId || ids.has(ctx.dmId)) && (!ctx.roomId || ids.has(ctx.roomId)), status: r.status, detail: `rooms=${rooms.length} ids=${[...ids].join(",")}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Server bootstrap
// ─────────────────────────────────────────────────────────────────────────
async function bootServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(session({
    secret: process.env.SESSION_SECRET || "test-only-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));

  // Test-driver shim: read x-as-user-id / x-as-workspace-id / x-as-workspace-role
  // BEFORE requireAuth runs.  This populates the session so the real requireAuth +
  // attachWorkspaceIdOptional middlewares accept the request without an HTTP login flow.
  app.use((req, _res, next) => {
    const u = req.get("x-as-user-id");
    const w = req.get("x-as-workspace-id");
    const r = req.get("x-as-workspace-role");
    if (u) {
      (req.session as any).userId = u;
      if (w) (req.session as any).workspaceId = w;
      if (r) (req.session as any).workspaceRole = r;
    }
    next();
  });

  app.use("/api/chat/manage", attachWorkspaceIdOptional, chatManagementRouter);
  app.use("/api/chat/rooms", attachWorkspaceIdOptional, chatRoomsRouter);
  app.use("/api/chat", attachWorkspaceIdOptional, chatInlineRouter);
  app.use(chatroomCommandRouter); // defines its own /api/chat/* paths inline

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("bad address"));
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
        close: () => new Promise<void>(r => server.close(() => r())),
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(2);
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ChatDock Runtime Verification — Sandbox Postgres + Test Keys ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ":***@")}`);

  await seed();

  const { url, close } = await bootServer();
  SERVER_URL = url;
  console.log(`[server] listening at ${url}`);

  let exitCode = 0;
  try {
    await runTests();
  } catch (err: any) {
    console.error("\n[fatal] uncaught error in test run:", err?.stack || err);
    exitCode = 1;
  } finally {
    await close();
  }

  const passed = RESULTS.filter(r => r.pass).length;
  const failed = RESULTS.filter(r => !r.pass).length;
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Summary: ${passed} passed, ${failed} failed, ${RESULTS.length} total`);
  console.log("═══════════════════════════════════════════════════════════════");

  // Persist a JSON receipt
  const outDir = path.resolve(__dirname, "..", "..", "sim_output");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "chatdock-runtime-verify.json"),
    JSON.stringify({
      ranAt: new Date().toISOString(),
      database: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ":***@"),
      passed, failed, total: RESULTS.length,
      results: RESULTS,
    }, null, 2),
  );

  if (failed > 0) exitCode = 1;
  process.exit(exitCode);
}

main().catch(err => {
  console.error("[bootstrap] fatal:", err);
  process.exit(1);
});
