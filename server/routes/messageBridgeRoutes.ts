import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import {
  channelBridges,
  bridgeConversations,
  bridgeMessages,
  insertChannelBridgeSchema,
} from "@shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { z } from "zod";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { messageBridgeService } from "../services/MessageBridgeService";
import { createLogger } from "../lib/logger";

const log = createLogger("MessageBridgeRoutes");

const MANAGER_ROLES = ["org_owner", "co_owner", "manager", "department_manager", "supervisor", "root_admin", "sysop"];

function hasManagerRole(req: any): boolean {
  const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole;
  if (MANAGER_ROLES.includes(role)) return true;
  if (process.env.NODE_ENV !== 'production' && req.user?.id?.startsWith("dev-owner")) return true;
  return false;
}

const router = Router();

const webhookRouter = Router();

webhookRouter.post("/api/bridges/webhook/:channelType/:bridgeId", async (req, res) => {
  try {
    const { channelType, bridgeId } = req.params;
    // Prefer x-webhook-secret header to keep credentials out of server access logs.
    // Query-param ?secret= is retained for backward compatibility with existing webhook URLs
    // registered with SMS/email providers (Twilio etc. embed the URL at registration time).
    const secret = (req.headers['x-webhook-secret'] as string) || (req.query.secret as string);

    if (!secret) {
      log.warn("Webhook request missing secret", { channelType, bridgeId });
      return res.status(401).json({ error: "Unauthorized" });
    }

    const bridge = await messageBridgeService.findBridgeByWebhookSecret(secret, channelType as any);
    if (!bridge || bridge.id !== bridgeId) {
      log.warn("Webhook auth failed: invalid secret or bridge mismatch", { channelType, bridgeId });
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (channelType === "sms") {
      const { From, Body, MessageSid, To, NumMedia } = req.body;
      if (!From || !Body) {
        return res.status(400).json({ error: "Missing required fields: From, Body" });
      }

      await messageBridgeService.receiveInbound({
        bridgeId: bridge.id,
        channelType: "sms",
        senderIdentity: From,
        message: Body,
        externalMessageId: MessageSid || undefined,
        metadata: { to: To, numMedia: NumMedia, raw: req.body },
      });

      log.info("SMS webhook processed", { from: From, bridgeId: bridge.id });
      return res.type("text/xml").send("<Response></Response>");
    }

    if (channelType === "whatsapp") {
      const { From, Body, MessageSid, To, NumMedia, ProfileName } = req.body;
      if (!From || !Body) {
        return res.status(400).json({ error: "Missing required fields: From, Body" });
      }

      const senderIdentity = From.replace("whatsapp:", "");

      await messageBridgeService.receiveInbound({
        bridgeId: bridge.id,
        channelType: "whatsapp",
        senderIdentity,
        message: Body,
        externalMessageId: MessageSid || undefined,
        senderDisplayName: ProfileName || undefined,
        metadata: { to: To, numMedia: NumMedia, profileName: ProfileName, raw: req.body },
      });

      log.info("WhatsApp webhook processed", { from: senderIdentity, bridgeId: bridge.id });
      return res.type("text/xml").send("<Response></Response>");
    }

    if (channelType === "email") {
      const { from, subject, text, html, to, messageId } = req.body;
      const senderEmail = typeof from === "string" ? from : from?.address || from?.email;
      const senderName = typeof from === "object" ? from?.name : undefined;
      const messageBody = text || html || "";

      if (!senderEmail || !messageBody) {
        return res.status(400).json({ error: "Missing required fields: from, text/html" });
      }

      const result = await messageBridgeService.receiveInbound({
        bridgeId: bridge.id,
        channelType: "email",
        senderIdentity: senderEmail,
        message: messageBody,
        externalMessageId: messageId || undefined,
        senderDisplayName: senderName || undefined,
        metadata: { subject, to, raw: req.body },
      });

      log.info("Email webhook processed", { from: senderEmail, bridgeId: bridge.id });
      return res.json({ success: true, bridgeConversationId: result.bridgeConversation.id });
    }

    return res.status(400).json({ error: `Unsupported channel type: ${channelType}` });
  } catch (error: unknown) {
    log.error("Webhook error", { error: sanitizeError(error), channelType: req.params.channelType });
    const channelType = req.params.channelType;
    if (channelType === "sms" || channelType === "whatsapp") {
      return res.status(200).type("text/xml").send("<Response></Response>");
    }
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/channels", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const channels = await db.select().from(channelBridges)
      .where(eq(channelBridges.workspaceId, workspaceId))
      .orderBy(desc(channelBridges.createdAt));

    const sanitized = channels.map(ch => ({
      ...ch,
      webhookSecret: undefined,
      providerConfig: undefined,
    }));

    res.json(sanitized);
  } catch (error: unknown) {
    log.error("List channels error", { error: sanitizeError(error) });
    res.status(500).json({ error: "Failed to list bridge channels" });
  }
});

const createChannelSchema = z.object({
  channelType: z.enum(["sms", "whatsapp", "email", "messenger"]),
  displayName: z.string().min(1).max(255),
  providerConfig: z.record(z.any()).optional(),
  phoneNumber: z.string().max(20).optional(),
  emailAddress: z.string().email().max(255).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

router.post("/channels", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = createChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const webhookSecret = messageBridgeService.generateWebhookSecret();

    const [channel] = await db.insert(channelBridges).values({
      workspaceId,
      channelType: parsed.data.channelType,
      displayName: parsed.data.displayName,
      providerConfig: parsed.data.providerConfig || {},
      phoneNumber: parsed.data.phoneNumber || null,
      emailAddress: parsed.data.emailAddress || null,
      status: parsed.data.status || "inactive",
      webhookSecret,
      webhookUrl: "pending",
      createdBy: req.user?.id || null,
    }).returning();

    const webhookBase = process.env.APP_URL || `https://${req.get("host")}`;
    const webhookUrl = `${webhookBase}/api/bridges/webhook/${parsed.data.channelType}/${channel.id}?secret=${webhookSecret}`;

    await db.update(channelBridges)
      .set({ webhookUrl })
      .where(eq(channelBridges.id, channel.id));

    res.status(201).json({
      ...channel,
      webhookUrl,
      webhookSecret: undefined,
      providerConfig: undefined,
    });
  } catch (error: unknown) {
    log.error("Create channel error", { error: sanitizeError(error) });
    res.status(500).json({ error: "Failed to create bridge channel" });
  }
});

const updateChannelSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  providerConfig: z.record(z.any()).optional(),
  phoneNumber: z.string().max(20).optional(),
  emailAddress: z.string().email().max(255).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

router.patch("/channels/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db.select().from(channelBridges).where(
      and(eq(channelBridges.id, req.params.id), eq(channelBridges.workspaceId, workspaceId))
    );
    if (!existing) return res.status(404).json({ error: "Channel not found" });

    const parsed = updateChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) updateData[key] = value;
    }

    const [updated] = await db.update(channelBridges)
      .set(updateData)
      .where(and(eq(channelBridges.id, req.params.id), eq(channelBridges.workspaceId, workspaceId)))
      .returning();

    res.json({
      ...updated,
      webhookSecret: undefined,
      providerConfig: undefined,
    });
  } catch (error: unknown) {
    log.error("Update channel error", { error: sanitizeError(error) });
    res.status(500).json({ error: "Failed to update bridge channel" });
  }
});

router.delete("/channels/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db.select().from(channelBridges).where(
      and(eq(channelBridges.id, req.params.id), eq(channelBridges.workspaceId, workspaceId))
    );
    if (!existing) return res.status(404).json({ error: "Channel not found" });

    const [convCount] = await db.select({ total: count() })
      .from(bridgeConversations)
      .where(eq(bridgeConversations.bridgeId, req.params.id));

    if ((convCount?.total || 0) > 0) {
      const [deactivated] = await db.update(channelBridges)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(and(eq(channelBridges.id, req.params.id), eq(channelBridges.workspaceId, workspaceId)))
        .returning();

      return res.json({
        message: "Channel has conversations and was deactivated instead of deleted",
        channel: { ...deactivated, webhookSecret: undefined, providerConfig: undefined },
      });
    }

    await db.delete(channelBridges).where(
      and(eq(channelBridges.id, req.params.id), eq(channelBridges.workspaceId, workspaceId))
    );
    res.json({ message: "Channel deleted successfully" });
  } catch (error: unknown) {
    log.error("Delete channel error", { error: sanitizeError(error) });
    res.status(500).json({ error: "Failed to delete bridge channel" });
  }
});

router.get("/conversations", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const conversations = await messageBridgeService.getBridgeConversations(workspaceId, limit, offset);

    const [totalResult] = await db.select({ total: count() })
      .from(bridgeConversations)
      .where(eq(bridgeConversations.workspaceId, workspaceId));

    res.json({ items: conversations, total: totalResult?.total || 0, limit, offset });
  } catch (error: unknown) {
    log.error("List conversations error", { error: sanitizeError(error) });
    res.status(500).json({ error: "Failed to list bridge conversations" });
  }
});

router.get("/conversations/:id/messages", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [conv] = await db.select().from(bridgeConversations).where(
      and(eq(bridgeConversations.id, req.params.id), eq(bridgeConversations.workspaceId, workspaceId))
    );
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const messages = await messageBridgeService.getBridgeMessages(req.params.id, limit, offset);

    const [totalResult] = await db.select({ total: count() })
      .from(bridgeMessages)
      .where(eq(bridgeMessages.bridgeConversationId, req.params.id));

    res.json({ items: messages, total: totalResult?.total || 0, limit, offset });
  } catch (error: unknown) {
    log.error("List messages error", { error: sanitizeError(error) });
    res.status(500).json({ error: "Failed to list bridge messages" });
  }
});

const sendMessageSchema = z.object({
  bridgeConversationId: z.string().min(1),
  message: z.string().min(1),
  channelType: z.enum(["sms", "whatsapp", "email", "messenger"]),
  attachmentUrl: z.string().optional(),
});

router.post("/send", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const result = await messageBridgeService.sendOutbound({
      bridgeConversationId: parsed.data.bridgeConversationId,
      workspaceId,
      message: parsed.data.message,
      channelType: parsed.data.channelType,
      senderId: req.user?.id || undefined,
      senderName: req.user?.firstName
        ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
        : req.user?.email || "Support",
      attachmentUrl: parsed.data.attachmentUrl || undefined,
    });

    res.json({
      success: true,
      bridgeMessage: result.bridgeMessage,
      deliveryStatus: result.deliveryStatus,
    });
  } catch (error: unknown) {
    log.error("Send message error", { error: sanitizeError(error) });
    res.status(500).json({ error: "Failed to send bridge message" });
  }
});

export const messageBridgeWebhookRouter = webhookRouter;
export default router;
