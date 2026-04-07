// Domain Communications — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/emails, /api/sms, /api/chat/*, /api/broadcasts, /api/bridges,
//   /api/mascot, /api/seasonal, /api/alerts/*, /api/push/*, /api/chatserver/*, /api/voice/*
//
// WEBHOOK NOTE: resendWebhooksRouter, twilioWebhooksRouter, and messageBridgeWebhookRouter
// are registered in server/routes.ts (lines 277-279) BEFORE all domain mounts so they
// are never intercepted by auth middleware. Do NOT re-register them here.
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { attachWorkspaceIdOptional } from "../../rbac";
import { createLogger } from "../../lib/logger";
const log = createLogger('CommsRoutes');
import { registerExternalEmailRoutes } from "../externalEmailRoutes";
import dockChatRouter from "../dockChatRoutes";
import broadcastRouter from "../broadcasts";
import messageBridgeRouter from "../messageBridgeRoutes";
import mascotRouter from "../mascot-routes";
import emailRouter from "../emails";
import emailUnsubscribeRouter from "../emailUnsubscribe";
import internalEmailRouter from "../internalEmails";
import { smsRouter } from "../smsRoutes";
import chatUploadsRouter from "../chat-uploads";
import emailAttachmentsRouter from "../email-attachments";
import chatRoomsRouter from "../chat-rooms";
import chatManagementRouter from "../chat-management";
import chatroomCommandRouter from "../chat";
import commInlineRouter from "../commInlineRoutes";
import chatInlineRouter from "../chatInlineRoutes";
import commOsRouter from "../commOsRoutes";
import privateMessageRouter from "../privateMessageRoutes";
import notificationsRouter from "../notifications";
import seasonalRouter from "../seasonalRoutes";
import { voiceRouter, initializeVoiceTables } from "../voiceRoutes";

export function mountCommsRoutes(app: Express): void {
  // Phase 56 — Trinity Voice Phone System: initialize tables, then mount router
  // Twilio webhook routes (/inbound, /status-callback, etc.) are exempt from auth
  // via the global form-encoded bypass in server/index.ts (path starts with /api/voice/).
  // Management routes inside voiceRouter apply requireAuth + plan check internally.
  initializeVoiceTables().catch((err: any) => {
    log.warn('[VoiceInit] Table init warning (non-fatal):', err?.message);
  });
  app.use("/api/voice", voiceRouter);

  // Twilio SMS webhook aliases — public, Twilio HMAC validated by twilioSignatureMiddleware.
  // Twilio console expects /api/sms/inbound and /api/sms/status.
  // These forward internally to the voiceRouter's sms-inbound / sms-status handlers.
  // MUST be registered BEFORE the authenticated /api/sms router below.
  app.post("/api/sms/inbound", (req: any, res: any, next: any) => {
    req.url = '/sms-inbound';
    voiceRouter(req, res, next);
  });
  app.post("/api/sms/status", (req: any, res: any, next: any) => {
    req.url = '/sms-status';
    voiceRouter(req, res, next);
  });

  // notificationsRouter defines its own full /api/notifications/* paths internally
  // and applies requireAuth on every individual route handler.
  app.use(notificationsRouter);

  app.use("/api/broadcasts", requireAuth, ensureWorkspaceAccess, broadcastRouter);
  // /api/announcements is a canonical alias for /api/broadcasts (same router, same auth).
  app.use("/api/announcements", requireAuth, ensureWorkspaceAccess, broadcastRouter);
  app.use("/api/bridges", requireAuth, ensureWorkspaceAccess, messageBridgeRouter);
  app.use("/api/mascot", mascotRouter);
  app.use("/api/emails", requireAuth, ensureWorkspaceAccess, emailRouter);
  // emailUnsubscribeRouter handles /api/email/unsubscribe — intentionally public (no auth).
  app.use("/api/email", emailUnsubscribeRouter);
  app.use("/api/internal-email", requireAuth, ensureWorkspaceAccess, internalEmailRouter);
  app.use("/api/sms", requireAuth, ensureWorkspaceAccess, smsRouter);
  // MOUNT ORDER: specific sub-paths of /api/chat MUST come before general /api/chat catch-alls.
  app.use("/api/chat/upload", requireAuth, ensureWorkspaceAccess, chatUploadsRouter);
  app.use("/api/email-attachments", requireAuth, ensureWorkspaceAccess, emailAttachmentsRouter);
  app.use("/api/chat/rooms", requireAuth, attachWorkspaceIdOptional, chatRoomsRouter);
  app.use("/api/chat/manage", requireAuth, attachWorkspaceIdOptional, chatManagementRouter);
  // chatroomCommandRouter defines its own full /api/chat/* paths internally with per-route auth.
  app.use(chatroomCommandRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, commInlineRouter);
  // chatInlineRouter applies router.use(requireAuth) at the top — mount-level guard added as defense-in-depth.
  app.use("/api/chat", requireAuth, chatInlineRouter);
  // commOsRouter applies requireAuth on every route — mount-level guard added as defense-in-depth.
  app.use("/api/comm-os", requireAuth, commOsRouter);
  // privateMessageRouter applies requireAuth on every route — mount-level guard added as defense-in-depth.
  app.use("/api/private-messages", requireAuth, privateMessageRouter);
  app.use("/api/seasonal", seasonalRouter);
  registerExternalEmailRoutes(app, requireAuth, ensureWorkspaceAccess);
  // Phase 35C — DockChat bot commands + room management
  app.use("/api/chat/dock", requireAuth, ensureWorkspaceAccess, dockChatRouter);
}
