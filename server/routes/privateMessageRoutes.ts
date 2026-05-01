import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { uploadFileToObjectStorage } from "../objectStorage";
import { db } from "../db";
import { chatConversations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from '../lib/logger';

import { isProtectedDirectMessageRole, isSupportStaffRole, canManageDirectMessageLifecycle } from '../services/chat/chatPolicyService';
import { broadcastToUser } from '../websocket';
const log = createLogger('PrivateMessageRoutes');


const router = Router();

// ── Shared recipient validation (Copilot handoff: unified DM access) ─────────
async function validatePrivateMessageRecipient(
  senderId: string,
  recipientId: string,
  workspaceId: string | undefined
): Promise<{ valid: boolean; error?: string }> {
  // Block self-DMs
  if (senderId === recipientId) {
    return { valid: false, error: 'Cannot send a direct message to yourself' };
  }
  // Block cross-workspace DMs (recipient must be in same workspace)
  if (workspaceId) {
    const recipientMember = await storage.getWorkspaceMemberByUserId(recipientId);
    if (recipientMember && recipientMember.workspaceId !== workspaceId) {
      return { valid: false, error: 'Recipient is not in your workspace' };
    }
  }
  return { valid: true };
}


router.get('/conversations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    const conversations = await storage.getPrivateMessageConversations(userId, workspaceId);
    res.json(conversations);
  } catch (error: unknown) {
    log.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
});

router.get('/:conversationId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const conversationId = req.params.conversationId;

    const messages = await storage.getPrivateMessages(userId, conversationId);
    res.json(messages);
  } catch (error: unknown) {
    log.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

router.post('/upload', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    const getRawBody = (await import('raw-body')).default;
    const buffer = await getRawBody(req);
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ message: "No file provided" });
    }

    // STORAGE QUOTA CHECK: Enforce media quota before writing to object storage
    const { checkCategoryQuota, recordStorageUsage } = await import('../services/storage/storageQuotaService');
    const quotaCheck = await checkCategoryQuota(workspaceId, 'media', buffer.length);
    if (!quotaCheck.allowed) {
      return res.status(507).json({
        message: `Storage quota exceeded for media uploads. Used: ${Math.round(quotaCheck.usedBytes / 1048576)}MB of ${Math.round(quotaCheck.limitBytes / 1048576)}MB.`,
        code: 'STORAGE_QUOTA_EXCEEDED',
        usedBytes: quotaCheck.usedBytes,
        limitBytes: quotaCheck.limitBytes,
      });
    }

    const fileId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const fileExt = contentType.split('/')[1] || 'bin';
    
    const disposition = req.headers['content-disposition'] || '';
    const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
    const originalName = filenameMatch ? filenameMatch[1] : `file-${fileId}.${fileExt}`;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');

    await uploadFileToObjectStorage({
      objectPath: `/objects/private-messages/${workspaceId}/${fileId}.${fileExt}`,
      buffer,
      metadata: {
        contentType,
        metadata: {
          workspaceId,
          uploadedBy: req.user.id,
          timestamp: new Date().toISOString(),
          originalFileName: sanitizedName,
        },
      },
    });

    const fileUrl = `/objects/private-messages/${workspaceId}/${fileId}.${fileExt}`;

    // Record usage AFTER successful upload — never skipped
    recordStorageUsage(workspaceId, 'media', buffer.length).catch((usageErr: unknown) => {
      log.warn('[PrivateMessages] Failed to record storage usage after upload (non-blocking):', usageErr instanceof Error ? usageErr.message : String(usageErr));
    });

    res.json({ 
      fileUrl, 
      fileName: sanitizedName,
      fileSize: buffer.length 
    });
  } catch (error: unknown) {
    log.error("Error uploading file:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to upload file" });
  }
});

router.post('/send', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    const { recipientId, message, attachmentUrl, attachmentName } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    if (!recipientId || (!message && !attachmentUrl)) {
      return res.status(400).json({ message: "Recipient and message or attachment are required" });
    }

    const conversation = await storage.getOrCreatePrivateConversation(workspaceId, userId, recipientId);

    const { formatUserDisplayNameForChat } = await import('../utils/formatUserDisplayName');
    const pmSenderPlatformRole = await storage.getUserPlatformRole(userId);
    const senderName = formatUserDisplayNameForChat({
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email || undefined,
      platformRole: pmSenderPlatformRole || undefined,
    });

    const sentMessage = await storage.sendPrivateMessage({
      workspaceId,
      conversationId: conversation.id,
      senderId: userId,
      senderName,
      recipientId,
      message: message?.trim() || '[File attached]',
      attachmentUrl,
      attachmentName,
    });

    
      // Broadcast to both participants via WebSocket for socket-first live updates
      try {
        const { broadcastToUser } = await import('../websocket');
        const wsPayload = {
          type: 'private_message_received',
          conversationId: newMessage?.conversationId,
          message: newMessage,
        };
        if (recipientId) broadcastToUser(recipientId, wsPayload);
        if (userId) broadcastToUser(userId, wsPayload);
      } catch (_wsErr) {
        // WebSocket broadcast is best-effort — REST response still succeeds
      }
      res.json(sentMessage);
  } catch (error: unknown) {
    log.error("Error sending message:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

router.post('/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    const { recipientId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    if (!recipientId) {
      return res.status(400).json({ message: "Recipient is required" });
    }

    const conversation = await storage.getOrCreatePrivateConversation(workspaceId, userId, recipientId);

    res.json({ conversationId: conversation.id });
  } catch (error: unknown) {
    log.error("Error starting conversation:", error);
    res.status(500).json({ message: "Failed to start conversation" });
  }
});

router.post('/:conversationId/mark-read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const conversationId = req.params.conversationId;

    await storage.markPrivateMessagesAsRead(conversationId, userId);

    res.json({ message: "Messages marked as read" });
  } catch (error: unknown) {
    log.error("Error marking messages as read:", error);
    res.status(500).json({ message: "Failed to mark messages as read" });
  }
});

router.post('/:conversationId/messages/:messageId/delete-for-me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { conversationId, messageId } = req.params;

    // Workspace isolation: verify the conversation belongs to the requester's workspace
    const workspaceId = req.workspaceId;
    if (workspaceId) {
      const [conv] = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.workspaceId, workspaceId)))
        .limit(1);
      if (!conv) return res.status(403).json({ message: 'Unauthorized' });
    }

    const success = await storage.deleteMessageForUser(messageId, userId, conversationId);

    if (success) {
      res.json({ message: 'Message deleted for you' });
    } else {
      res.status(400).json({ message: 'Failed to delete message' });
    }
  } catch (error: unknown) {
    log.error("Error deleting message for user:", error);
    res.status(500).json({ message: "Failed to delete message" });
  }
});

router.post('/:conversationId/messages/:messageId/delete-for-everyone', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { conversationId, messageId } = req.params;

    // Workspace isolation: verify the conversation belongs to the requester's workspace
    const workspaceId = req.workspaceId;
    if (workspaceId) {
      const [conv] = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.workspaceId, workspaceId)))
        .limit(1);
      if (!conv) return res.status(403).json({ message: 'Unauthorized' });
    }

    const success = await storage.deleteMessageForEveryone(messageId, userId, conversationId);

    if (success) {
      res.json({ message: 'Message deleted for everyone' });
    } else {
      res.status(400).json({ message: 'Failed to delete message - you can only delete your own messages for everyone' });
    }
  } catch (error: unknown) {
    log.error("Error deleting message for everyone:", error);
    res.status(500).json({ message: "Failed to delete message" });
  }
});

router.post('/group', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'No workspace found' });

    const { participantIds, participantNames, subject, parentOrgId, allowedOrgIds } = req.body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
      return res.status(400).json({ message: 'At least one participant is required' });
    }

    const { chatParityService } = await import('../services/chatParityService');

    const participantOrgIds = allowedOrgIds || [workspaceId];
    const userRole = req.user?.role || 'employee';
    const platformRole = (req.user)?.platformRole || null;

    const groupCheck = await chatParityService.canStartGroupDM({
      initiatorId: userId,
      initiatorOrgId: workspaceId,
      initiatorRole: userRole,
      initiatorPlatformRole: platformRole,
      participantOrgIds,
    });

    if (!groupCheck.allowed) {
      return res.status(403).json({ message: groupCheck.reason });
    }

    const conversation = await chatParityService.createGroupDM({
      workspaceId,
      creatorId: userId,
      creatorName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
      participantIds,
      participantNames: participantNames || [],
      parentOrgId,
      allowedOrgIds: participantOrgIds,
      subject,
    });

    if (conversation) {
      res.json(conversation);
    } else {
      res.status(500).json({ message: 'Failed to create group conversation' });
    }
  } catch (error: unknown) {
    log.error("Error creating group DM:", error);
    res.status(500).json({ message: "Failed to create group conversation" });
  }
});

export default router;
