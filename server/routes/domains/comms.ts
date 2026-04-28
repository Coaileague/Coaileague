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
import { mountWorkspaceRoutes } from "./routeMounting";
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
// NOTE: voiceRouter + /api/voice/* and /api/sms/{inbound,status} aliases are
// mounted in server/routes.ts BEFORE domain mounts. They cannot live here
// because mountBillingRoutes/etc. register `app.use("/api", requireAuth, ...)`
// catch-alls that fire before mountCommsRoutes runs — the catch-all would 401
// Twilio's unauthenticated webhook POSTs.

export function mountCommsRoutes(app: Express): void {
  // notificationsRouter defines its own full /api/notifications/* paths internally
  // and applies requireAuth on every individual route handler.
  app.use(notificationsRouter);

  mountWorkspaceRoutes(app, [
    ["/api/broadcasts", broadcastRouter],
  ]);
  // /api/announcements is a canonical alias for /api/broadcasts (same router, same auth).
  mountWorkspaceRoutes(app, [
    ["/api/announcements", broadcastRouter],
    ["/api/bridges", messageBridgeRouter],
  ]);
  app.use("/api/mascot", mascotRouter);
  mountWorkspaceRoutes(app, [
    ["/api/emails", emailRouter],
  ]);
  // emailUnsubscribeRouter handles /api/email/unsubscribe — intentionally public (no auth).
  app.use("/api/email", emailUnsubscribeRouter);
  mountWorkspaceRoutes(app, [
    ["/api/internal-email", internalEmailRouter],
    ["/api/sms", smsRouter],
  ]);
  // MOUNT ORDER: specific sub-paths of /api/chat MUST come before general /api/chat catch-alls.
  mountWorkspaceRoutes(app, [
    ["/api/chat/upload", chatUploadsRouter],
    ["/api/email-attachments", emailAttachmentsRouter],
  ]);
  app.use("/api/chat/rooms", requireAuth, attachWorkspaceIdOptional, chatRoomsRouter);
  app.use("/api/chat/manage", requireAuth, attachWorkspaceIdOptional, chatManagementRouter);
  // chatroomCommandRouter defines its own full /api/chat/* paths internally with per-route auth.
  app.use(chatroomCommandRouter);
  mountWorkspaceRoutes(app, [
    ["/api", commInlineRouter],
  ]);
  // chatInlineRouter applies router.use(requireAuth) at the top — mount-level guard added as defense-in-depth.
  app.use("/api/chat", requireAuth, chatInlineRouter);
  // commOsRouter applies requireAuth on every route — mount-level guard added as defense-in-depth.
  app.use("/api/comm-os", requireAuth, commOsRouter);
  // privateMessageRouter applies requireAuth on every route — mount-level guard added as defense-in-depth.
  app.use("/api/private-messages", requireAuth, privateMessageRouter);
  app.use("/api/seasonal", seasonalRouter);
  registerExternalEmailRoutes(app, requireAuth, ensureWorkspaceAccess);
  // Phase 35C — DockChat bot commands + room management
  mountWorkspaceRoutes(app, [
    ["/api/chat/dock", dockChatRouter],
  ]);
}
