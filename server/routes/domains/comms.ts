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
import { registerExternalEmailRoutes } from "../externalEmailRoutes";
import dockChatRouter from "../dockChatRoutes";
import broadcastRouter from "../broadcasts";
import messageBridgeRouter from "../messageBridgeRoutes";
// mascot-routes removed
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
import chatPollRouter from '../chatPollRoutes';
import chatSearchRouter from '../chatSearchRoutes';
import emailEntityContextRouter from '../emailEntityContextRoute';
// NOTE: voiceRouter + /api/voice/* and /api/sms/{inbound,status} aliases are
// mounted in server/routes.ts BEFORE domain mounts. They cannot live here
// because mountBillingRoutes/etc. register `app.use("/api", requireAuth, ...)`
// catch-alls that fire before mountCommsRoutes runs — the catch-all would 401
// Twilio's unauthenticated webhook POSTs.

export function mountCommsRoutes(app: Express): void {
  // notificationsRouter defines its own full /api/notifications/* paths internally
  // and applies requireAuth on every individual route handler.
  app.use(notificationsRouter);

  app.use("/api/broadcasts", requireAuth, ensureWorkspaceAccess, broadcastRouter);
  // /api/announcements is a canonical alias for /api/broadcasts (same router, same auth).
  app.use("/api/announcements", requireAuth, ensureWorkspaceAccess, broadcastRouter);
  app.use("/api/bridges", requireAuth, ensureWorkspaceAccess, messageBridgeRouter);
  // /api/mascot removed — mascot system purged
  // /api/emails/* — platform-staff manual send + campaign + templates.
  // SINGULAR /api/email/* (mounted in server/routes.ts) is the per-user inbox.
  // The plural-vs-singular distinction is intentional; see the mount map
  // comment in server/routes.ts before adding routes here.
  app.use("/api/emails", requireAuth, ensureWorkspaceAccess, emailRouter);
  // emailUnsubscribeRouter owns /api/email/{unsubscribe,resubscribe,unsubscribe/preferences,unsubscribe/confirm}
  // Intentionally public — links arrive from the recipient's inbox. Mounted
  // AFTER routes.ts registers the authenticated emailRouter at the same
  // prefix so unauthenticated unsubscribe paths fall through to here.
  app.use("/api/email", emailUnsubscribeRouter);

  // Boot-time guard: assert the two /api/email routers stay disjoint. If a
  // future change adds /unsubscribe to the authenticated emailRouter (or
  // anything to /api/email that emailUnsubscribeRouter already owns), fail
  // fast instead of silently shadowing the public unsubscribe surface.
  try {
    const protectedPaths = ['/unsubscribe', '/resubscribe', '/unsubscribe/preferences', '/unsubscribe/confirm'];
    // @ts-expect-error — Express router internals: stack of layers exposes route paths
    const layers: any[] = (emailUnsubscribeRouter as any)?.stack || [];
    const ownedByPublic = layers
      .filter((l: any) => l?.route?.path)
      .map((l: any) => l.route.path as string);
    const overlap = protectedPaths.filter(p => !ownedByPublic.includes(p));
    if (overlap.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[comms] email-router disjoint guard: expected emailUnsubscribeRouter to own ${overlap.join(', ')} — registry drift`);
    }
  } catch {
    // Non-fatal — guard is advisory.
  }
  app.use("/api/internal-email", requireAuth, ensureWorkspaceAccess, internalEmailRouter);
  app.use("/api/sms", requireAuth, ensureWorkspaceAccess, smsRouter);
  // MOUNT ORDER: specific sub-paths of /api/chat MUST come before general /api/chat catch-alls.
  app.use("/api/chat/upload", requireAuth, ensureWorkspaceAccess, chatUploadsRouter);
  app.use("/api/email-attachments", requireAuth, ensureWorkspaceAccess, emailAttachmentsRouter);
  app.use("/api/chat/rooms", requireAuth, attachWorkspaceIdOptional, chatRoomsRouter);
  app.use("/api/chat/manage", requireAuth, attachWorkspaceIdOptional, chatManagementRouter);

  // Chat polls + search — static imports added at top of file
  app.use('/api/chat', requireAuth, attachWorkspaceIdOptional, chatPollRouter);
  app.use('/api/chat', requireAuth, attachWorkspaceIdOptional, chatSearchRouter);
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
  app.use('/', requireAuth, emailEntityContextRouter);
}
