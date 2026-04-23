import { Router } from "express";
import { db } from "../db";
import {
  chatConversations,
  chatParticipants,
  chatMessages,
  conversationUserState,
  blockedContacts,
  messageDeletedFor,
  roomEvents,
  users,
  messageReactions,
  messageReadReceipts,
} from "@shared/schema";
import { eq, and, or, sql, inArray, desc, isNull, ilike } from "drizzle-orm";
import { AuthenticatedRequest } from "../rbac";
import { requireAuth } from "../auth";
import rateLimit from "express-rate-limit";
import { supportRooms, organizationChatRooms } from "@shared/schema";
import { broadcastUserScopedNotification } from "../websocket";
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
import { validateWebhookUrl } from '../services/webhookDeliveryService';
const log = createLogger('ChatManagement');


const router = Router();
router.use(requireAuth);

const managementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many chat management operations, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

async function resolveConversationId(idOrRoomId: string): Promise<string> {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(eq(chatConversations.id, idOrRoomId))
    .limit(1);
  if (conversation) return conversation.id;

  const [room] = await db
    .select({ conversationId: supportRooms.conversationId })
    .from(supportRooms)
    .where(eq(supportRooms.id, idOrRoomId))
    .limit(1);
  if (room?.conversationId) return room.conversationId;

  const [orgRoom] = await db
    .select({ conversationId: organizationChatRooms.conversationId })
    .from(organizationChatRooms)
    .where(eq(organizationChatRooms.id, idOrRoomId))
    .limit(1);
  if (orgRoom?.conversationId) return orgRoom.conversationId;

  return idOrRoomId;
}

async function verifyParticipant(conversationId: string, userId: string): Promise<boolean> {
  const [participant] = await db
    .select({ id: chatParticipants.id })
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.conversationId, conversationId),
        eq(chatParticipants.participantId, userId),
      )
    )
    .limit(1);
  
  if (participant) return true;

  const [conversation] = await db
    .select({ id: chatConversations.id, workspaceId: chatConversations.workspaceId, conversationType: chatConversations.conversationType })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  if (!conversation || !conversation.workspaceId) return false;

  const { storage } = await import("../storage");
  const workspace = await storage.getWorkspaceByOwnerId(userId);
  const memberWorkspace = workspace || await storage.getWorkspaceByMembership(userId);

  if (memberWorkspace && memberWorkspace.id === conversation.workspaceId) {
    const userInfo = await storage.getUserDisplayInfo(userId);
    const displayName = userInfo
      ? `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim() || 'User'
      : 'User';
    await db.insert(chatParticipants).values({
      conversationId,
      workspaceId: conversation.workspaceId,
      participantId: userId,
      participantName: displayName,
      participantEmail: userInfo?.email || null,
      participantRole: 'member',
      canSendMessages: true,
      canViewHistory: true,
      canInviteOthers: false,
      isActive: true,
    }).onConflictDoNothing();
    return true;
  }

  return false;
}

// ============================================================================
// HIDE CONVERSATION - POST /api/chat/manage/conversations/:id/hide
// ============================================================================
router.post(
  "/conversations/:id/hide",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId || null;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!(await verifyParticipant(conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of this conversation" });
      }

      await db
        .insert(conversationUserState)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values({
          conversationId,
          userId,
          workspaceId,
          isHidden: true,
          hiddenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [conversationUserState.conversationId, conversationUserState.userId],
          set: {
            isHidden: true,
            hiddenAt: new Date(),
            updatedAt: new Date(),
          },
        });

      res.json({ success: true, message: "Conversation hidden" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error hiding conversation:", error);
      res.status(500).json({ error: "Failed to hide conversation" });
    }
  }
);

// ============================================================================
// UNHIDE CONVERSATION - POST /api/chat/manage/conversations/:id/unhide
// ============================================================================
router.post(
  "/conversations/:id/unhide",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId ?? '';

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!(await verifyParticipant(conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of this conversation" });
      }

      await db
        .insert(conversationUserState)
        .values({
          conversationId,
          userId,
          workspaceId,
          isHidden: false,
        })
        .onConflictDoUpdate({
          target: [conversationUserState.conversationId, conversationUserState.userId],
          set: {
            isHidden: false,
            hiddenAt: null,
            updatedAt: new Date(),
          },
        });

      res.json({ success: true, message: "Conversation unhidden" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error unhiding conversation:", error);
      res.status(500).json({ error: "Failed to unhide conversation" });
    }
  }
);

// ============================================================================
// LEAVE CONVERSATION - POST /api/chat/manage/conversations/:id/leave
// ============================================================================
router.post(
  "/conversations/:id/leave",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId || null;
      const userName = `${authReq.user?.firstName || ""} ${authReq.user?.lastName || ""}`.trim() || "User";

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!(await verifyParticipant(conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of this conversation" });
      }

      // D04: Atomic leave-conversation — state flag + participant mark + audit event
      await db.transaction(async (tx) => {
        await tx
          .insert(conversationUserState)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .values({
            conversationId,
            userId,
            workspaceId,
            hasLeft: true,
            isHidden: true,
            leftAt: new Date(),
            hiddenAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [conversationUserState.conversationId, conversationUserState.userId],
            set: {
              hasLeft: true,
              isHidden: true,
              leftAt: new Date(),
              hiddenAt: new Date(),
              updatedAt: new Date(),
            },
          });

        await tx
          .update(chatParticipants)
          .set({ isActive: false, leftAt: new Date() })
          .where(
            and(
              eq(chatParticipants.conversationId, conversationId),
              eq(chatParticipants.participantId, userId)
            )
          );

        await tx.insert(roomEvents).values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId,
          conversationId,
          actorId: userId,
          actorName: userName,
          actorRole: "member",
          eventType: "user_left",
          description: `${userName} left the conversation`,
        });
      });

      try {
        const otherParticipants = await db
          .select({ participantId: chatParticipants.participantId })
          .from(chatParticipants)
          .where(and(
            eq(chatParticipants.conversationId, conversationId),
            eq(chatParticipants.isActive, true),
          ));
        for (const p of otherParticipants) {
          if (p.participantId !== userId) {
            broadcastUserScopedNotification(p.participantId, {
              type: 'room_status_changed',
              conversationId,
              event: 'user_left',
              userId,
              userName,
            });
          }
        }
      } catch (err: any) {
        log.warn('[ChatManagement] Non-critical error in management action', { error: err.message });
      }

      res.json({ success: true, message: "Left conversation" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error leaving conversation:", error);
      res.status(500).json({ error: "Failed to leave conversation" });
    }
  }
);

// ============================================================================
// ARCHIVE CONVERSATION - POST /api/chat/manage/conversations/:id/archive
// ============================================================================
router.post(
  "/conversations/:id/archive",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId ?? '';

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!(await verifyParticipant(conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of this conversation" });
      }

      await db
        .insert(conversationUserState)
        .values({
          conversationId,
          userId,
          workspaceId,
          isArchived: true,
          archivedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [conversationUserState.conversationId, conversationUserState.userId],
          set: {
            isArchived: true,
            archivedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      res.json({ success: true, message: "Conversation archived" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error archiving conversation:", error);
      res.status(500).json({ error: "Failed to archive conversation" });
    }
  }
);

// ============================================================================
// MUTE CONVERSATION - POST /api/chat/manage/conversations/:id/mute
// ============================================================================
router.post(
  "/conversations/:id/mute",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId ?? '';

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!(await verifyParticipant(conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of this conversation" });
      }

      const { muted } = req.body;
      const isMuted = muted !== false;

      await db
        .insert(conversationUserState)
        .values({
          conversationId,
          userId,
          workspaceId,
          isMuted,
        })
        .onConflictDoUpdate({
          target: [conversationUserState.conversationId, conversationUserState.userId],
          set: {
            isMuted,
            updatedAt: new Date(),
          },
        });

      res.json({ success: true, muted: isMuted });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error muting conversation:", error);
      res.status(500).json({ error: "Failed to mute conversation" });
    }
  }
);

// ============================================================================
// GET CONVERSATION STATE - GET /api/chat/manage/conversations/states
// ============================================================================
router.get(
  "/conversations/states",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const states = await db
        .select()
        .from(conversationUserState)
        .where(eq(conversationUserState.userId, userId));

      res.json({ success: true, states });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error fetching conversation states:", error);
      res.status(500).json({ error: "Failed to fetch conversation states" });
    }
  }
);

// ============================================================================
// BLOCK USER - POST /api/chat/manage/block
// ============================================================================
router.post(
  "/block",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;
      const { blockedUserId, reason } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace context required" });
      }

      if (!blockedUserId) {
        return res.status(400).json({ error: "blockedUserId is required" });
      }

      if (blockedUserId === userId) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }

      const [targetUser] = await db
        .select({ id: users.id, platformRole: users.role })
        .from(users)
        .where(eq(users.id, blockedUserId))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const supportRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
      if (targetUser.platformRole && supportRoles.includes(targetUser.platformRole)) {
        return res.status(403).json({ error: "Support staff cannot be blocked" });
      }

      await db
        .insert(blockedContacts)
        .values({ workspaceId, blockerId: userId, blockedUserId, reason })
        .onConflictDoNothing();

      broadcastUserScopedNotification(blockedUserId, {
        type: 'room_status_changed',
        event: 'user_blocked',
        blockedBy: userId,
      });

      res.json({ success: true, message: "User blocked" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error blocking user:", error);
      res.status(500).json({ error: "Failed to block user" });
    }
  }
);

// ============================================================================
// UNBLOCK USER - POST /api/chat/manage/unblock
// ============================================================================
router.post(
  "/unblock",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      const { blockedUserId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!blockedUserId) {
        return res.status(400).json({ error: "blockedUserId is required" });
      }

      await db
        .delete(blockedContacts)
        .where(
          and(
            eq(blockedContacts.blockerId, userId),
            eq(blockedContacts.blockedUserId, blockedUserId)
          )
        );

      broadcastUserScopedNotification(blockedUserId, {
        type: 'room_status_changed',
        event: 'user_unblocked',
        unblockedBy: userId,
      });

      res.json({ success: true, message: "User unblocked" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error unblocking user:", error);
      res.status(500).json({ error: "Failed to unblock user" });
    }
  }
);

// ============================================================================
// GET BLOCKED USERS - GET /api/chat/manage/blocked
// ============================================================================
router.get(
  "/blocked",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const blocked = await db
        .select({
          id: blockedContacts.id,
          blockedUserId: blockedContacts.blockedUserId,
          reason: blockedContacts.reason,
          createdAt: blockedContacts.createdAt,
          blockedUserName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        })
        .from(blockedContacts)
        .leftJoin(users, eq(blockedContacts.blockedUserId, users.id))
        .where(eq(blockedContacts.blockerId, userId));

      res.json({ success: true, blocked });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error fetching blocked users:", error);
      res.status(500).json({ error: "Failed to fetch blocked users" });
    }
  }
);

// ============================================================================
// DELETE MESSAGE FOR SELF - POST /api/chat/manage/messages/:id/delete-for-me
// ============================================================================
router.post(
  "/messages/:id/delete-for-me",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [message] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (!(await verifyParticipant(message.conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of this conversation" });
      }

      await db
        .insert(messageDeletedFor)
        .values({ messageId, userId })
        .onConflictDoNothing();

      res.json({ success: true, message: "Message hidden for you" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error deleting message for self:", error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  }
);

// ============================================================================
// DELETE MESSAGE FOR EVERYONE - POST /api/chat/manage/messages/:id/delete-for-everyone
// ============================================================================
router.post(
  "/messages/:id/delete-for-everyone",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const userId = authReq.user?.id;
      const workspaceRole = (authReq as any).workspaceRole;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [message] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      const isOwner = message.senderId === userId;
      const isManager = workspaceRole && ["org_owner", "co_owner", "org_admin"].includes(workspaceRole);
      const platformRole = (authReq.user)?.platformRole;
      const isSupport = platformRole && ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"].includes(platformRole);

      if (!isOwner && !isManager && !isSupport) {
        return res.status(403).json({ error: "Only the sender, room managers, or support staff can delete messages for everyone" });
      }

      await db
        .update(chatMessages)
        .set({
          isDeletedForEveryone: true,
          deletedForEveryoneAt: new Date(),
          deletedForEveryoneBy: userId,
          message: "This message was deleted",
          updatedAt: new Date(),
        })
        .where(eq(chatMessages.id, messageId));

      res.json({ success: true, message: "Message deleted for everyone" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error deleting message for everyone:", error);
      res.status(500).json({ error: "Failed to delete message for everyone" });
    }
  }
);

// ============================================================================
// TRANSFER ROOM OWNERSHIP - POST /api/chat/manage/rooms/:roomId/transfer-ownership
// ============================================================================
router.post(
  "/rooms/:roomId/transfer-ownership",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const { newOwnerId } = req.body;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;
      const userName = `${authReq.user?.firstName || ""} ${authReq.user?.lastName || ""}`.trim() || "User";

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace context required" });
      }

      if (!newOwnerId) {
        return res.status(400).json({ error: "newOwnerId is required" });
      }

      const [currentOwner] = await db
        .select()
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.participantId, userId),
            eq(chatParticipants.participantRole, "owner"),
            eq(chatParticipants.isActive, true)
          )
        )
        .limit(1);

      const workspaceRole = (authReq as any).workspaceRole;
      const isWorkspaceAdmin = workspaceRole && ["org_owner", "co_owner", "manager", "org_manager"].includes(workspaceRole);

      if (!currentOwner && !isWorkspaceAdmin) {
        return res.status(403).json({ error: "Only the room owner or workspace admin can transfer ownership" });
      }

      const [newOwnerParticipant] = await db
        .select()
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.participantId, newOwnerId),
            eq(chatParticipants.isActive, true)
          )
        )
        .limit(1);

      if (!newOwnerParticipant) {
        return res.status(404).json({ error: "New owner must be an active participant in the room" });
      }

      // D04: Atomic ownership transfer — demote, promote, audit log all-or-nothing
      await db.transaction(async (tx) => {
        if (currentOwner) {
          await tx
            .update(chatParticipants)
            .set({ participantRole: "admin" })
            .where(eq(chatParticipants.id, currentOwner.id));
        }

        await tx
          .update(chatParticipants)
          .set({ participantRole: "owner" })
          .where(eq(chatParticipants.id, newOwnerParticipant.id));

        await tx.insert(roomEvents).values({
          workspaceId,
          conversationId: roomId,
          actorId: userId,
          actorName: userName,
          actorRole: "owner",
          eventType: "ownership_transferred",
          description: `${userName} transferred ownership to ${newOwnerParticipant.participantName}`,
          eventPayload: JSON.stringify({ newOwnerId, previousOwnerId: userId }),
        });
      });

      res.json({ success: true, message: "Ownership transferred" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error transferring ownership:", error);
      res.status(500).json({ error: "Failed to transfer ownership" });
    }
  }
);

// ============================================================================
// UPDATE PARTICIPANT ROLE - POST /api/chat/manage/rooms/:roomId/update-role
// ============================================================================
router.post(
  "/rooms/:roomId/update-role",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const { participantId, role } = req.body;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;
      const userName = `${authReq.user?.firstName || ""} ${authReq.user?.lastName || ""}`.trim() || "User";

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace context required" });
      }

      if (!participantId || !role) {
        return res.status(400).json({ error: "participantId and role are required" });
      }

      const validRoles = ["admin", "member", "guest"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      }

      const [requester] = await db
        .select()
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.participantId, userId),
            eq(chatParticipants.isActive, true)
          )
        )
        .limit(1);

      const workspaceRole = (authReq as any).workspaceRole;
      const isWorkspaceAdmin = workspaceRole && ["org_owner", "co_owner", "manager", "org_manager"].includes(workspaceRole);
      const isRoomOwnerOrAdmin = requester && ["owner", "admin"].includes(requester.participantRole);

      if (!isRoomOwnerOrAdmin && !isWorkspaceAdmin) {
        return res.status(403).json({ error: "Only room owner/admin or workspace admin can update roles" });
      }

      // D04: Atomic role update — role change + audit log must succeed together
      await db.transaction(async (tx) => {
        await tx
          .update(chatParticipants)
          .set({ participantRole: role, updatedAt: new Date() })
          .where(
            and(
              eq(chatParticipants.conversationId, roomId),
              eq(chatParticipants.participantId, participantId),
              eq(chatParticipants.isActive, true)
            )
          );

        await tx.insert(roomEvents).values({
          workspaceId,
          conversationId: roomId,
          actorId: userId,
          actorName: userName,
          actorRole: requester?.participantRole || "admin",
          eventType: "role_updated",
          description: `${userName} updated role to ${role}`,
          eventPayload: JSON.stringify({ participantId, newRole: role }),
        });
      });

      res.json({ success: true, message: `Role updated to ${role}` });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error updating role:", error);
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

// ============================================================================
// CREATE NEW DM - POST /api/chat/manage/dm/create
// ============================================================================
router.post(
  "/dm/create",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;
      const userName = `${authReq.user?.firstName || ""} ${authReq.user?.lastName || ""}`.trim() || "User";
      const { recipientId } = req.body;

      if (!userId || !workspaceId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!recipientId) {
        return res.status(400).json({ error: "recipientId is required" });
      }

      // DM RULE: End-users cannot directly DM support agents or system bots
      // Only support staff / platform admins can initiate DMs to anyone
      const senderPlatformRole = (authReq.user)?.platformRole || authReq.user?.role;
      const senderIsStaff = senderPlatformRole && [
        "root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"
      ].includes(senderPlatformRole);

      if (!senderIsStaff) {
        const [recipientUser] = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, recipientId))
          .limit(1);

        if (recipientUser) {
          const protectedRoles = [
            "root_admin", "deputy_admin", "sysop", "support_manager",
            "support_agent", "system_bot"
          ];
          if (recipientUser.role && protectedRoles.includes(recipientUser.role)) {
            return res.status(403).json({
              error: "DM_RESTRICTED",
              message: "You cannot directly message support staff. Please use the HelpDesk for support requests."
            });
          }
        }
      }

      const isBlocked = await db
        .select()
        .from(blockedContacts)
        .where(
          or(
            and(eq(blockedContacts.blockerId, userId), eq(blockedContacts.blockedUserId, recipientId)),
            and(eq(blockedContacts.blockerId, recipientId), eq(blockedContacts.blockedUserId, userId))
          )
        )
        .limit(1);

      if (isBlocked.length > 0) {
        return res.status(403).json({ error: "Cannot create conversation with blocked user" });
      }

      const [recipient] = await db
        .select()
        .from(users)
        .where(eq(users.id, recipientId))
        .limit(1);

      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }

      const recipientName = `${recipient.firstName || ""} ${recipient.lastName || ""}`.trim() || recipient.email || "User";

      const existingDMs = await db
        .select({ id: chatConversations.id, status: chatConversations.status, closedAt: chatConversations.closedAt })
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.workspaceId, workspaceId),
            eq(chatConversations.conversationType, "dm_user"),
            or(
              and(
                eq(chatConversations.customerId, userId),
                eq(chatConversations.supportAgentId, recipientId)
              ),
              and(
                eq(chatConversations.customerId, recipientId),
                eq(chatConversations.supportAgentId, userId)
              )
            )
          )
        )
        .limit(1);

      if (existingDMs.length > 0) {
        // DM RULE: If a support agent closed this DM, end-users cannot reopen it
        // This prevents harassment — only staff can reopen closed DM conversations
        const existingDM = existingDMs[0];
        if (existingDM.status === 'closed' && existingDM.closedAt && !senderIsStaff) {
          return res.status(403).json({
            error: "DM_CLOSED",
            message: "This conversation was closed and cannot be reopened. Please use the HelpDesk for new support requests."
          });
        }

        await db
          .insert(conversationUserState)
          .values({
            conversationId: existingDMs[0].id,
            userId,
            workspaceId,
            isHidden: false,
            hasLeft: false,
          })
          .onConflictDoUpdate({
            target: [conversationUserState.conversationId, conversationUserState.userId],
            set: {
              isHidden: false,
              hasLeft: false,
              hiddenAt: null,
              leftAt: null,
              updatedAt: new Date(),
            },
          });

        return res.json({ success: true, conversationId: existingDMs[0].id, existing: true });
      }

      // D04: Atomic DM creation — conversation + both participants must succeed together.
      // Without both participants, the conversation is unreachable.
      const newConversation = await db.transaction(async (tx) => {
        const [conv] = await tx
          .insert(chatConversations)
          .values({
            workspaceId,
            customerId: userId,
            customerName: userName,
            supportAgentId: recipientId,
            supportAgentName: recipientName,
            subject: `DM: ${userName} & ${recipientName}`,
            status: "active",
            conversationType: "dm_user",
            visibility: "private",
          })
          .returning();

        await tx.insert(chatParticipants).values([
          {
            conversationId: conv.id,
            workspaceId,
            participantId: userId,
            participantName: userName,
            participantRole: "owner",
            canSendMessages: true,
            canViewHistory: true,
            canInviteOthers: false,
            isActive: true,
            joinedAt: new Date(),
          },
          {
            conversationId: conv.id,
            workspaceId,
            participantId: recipientId,
            participantName: recipientName,
            participantRole: "member",
            canSendMessages: true,
            canViewHistory: true,
            canInviteOthers: false,
            isActive: true,
            joinedAt: new Date(),
          },
        ]);

        return conv;
      });

      res.json({ success: true, conversationId: newConversation.id, existing: false });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error creating DM:", error);
      res.status(500).json({ error: "Failed to create DM conversation" });
    }
  }
);

// ============================================================================
// CLOSE DM CONVERSATION - POST /api/chat/manage/dm/close
// Support agents/staff close a DM with an end-user.
// Once closed, the end-user can no longer chat in or reopen this conversation.
// ============================================================================
router.post(
  "/dm/close",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;
      const { conversationId } = req.body;

      if (!userId || !workspaceId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!conversationId) {
        return res.status(400).json({ error: "conversationId is required" });
      }

      const closerPlatformRole = (authReq.user)?.platformRole || authReq.user?.role;
      const closerIsStaff = closerPlatformRole && [
        "root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"
      ].includes(closerPlatformRole);

      const closerWorkspaceRole = authReq.workspaceRole;
      const closerIsManager = closerWorkspaceRole && [
        "org_owner", "co_owner", "org_admin", "department_manager", "supervisor"
      ].includes(closerWorkspaceRole);

      if (!closerIsStaff && !closerIsManager) {
        return res.status(403).json({
          error: "DM_CLOSE_UNAUTHORIZED",
          message: "Only support staff or managers can close DM conversations."
        });
      }

      const [conversation] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, conversationId),
            eq(chatConversations.workspaceId, workspaceId),
            inArray(chatConversations.conversationType, ["dm_user", "dm_support", "dm_bot"])
          )
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "DM conversation not found" });
      }

      if (conversation.status === 'closed') {
        return res.json({ success: true, message: "Conversation is already closed" });
      }

      // D04: Atomic close — state flip + system message together
      const closerName = `${authReq.user?.firstName || ""} ${authReq.user?.lastName || ""}`.trim() || "Support";
      await db.transaction(async (tx) => {
        await tx
          .update(chatConversations)
          .set({
            status: "closed",
            closedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(chatConversations.id, conversationId));

        await tx.insert(chatMessages).values({
          conversationId,
          senderId: userId,
          senderName: "System",
          senderType: "system",
          message: `This conversation was closed by ${closerName}. No further messages can be sent.`,
          isSystemMessage: true,
          isEncrypted: false,
        });
      });

      res.json({ success: true, message: "DM conversation closed successfully" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error closing DM:", error);
      res.status(500).json({ error: "Failed to close DM conversation" });
    }
  }
);

// ============================================================================
// CREATE NEW GROUP ROOM - POST /api/chat/manage/rooms/create
// ============================================================================
router.post(
  "/rooms/create",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;
      const userName = `${authReq.user?.firstName || ""} ${authReq.user?.lastName || ""}`.trim() || "User";
      const { name, participantIds, description } = req.body;

      if (!userId || !workspaceId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Room name is required" });
      }

      // Guard: prevent creation of reserved platform room names
      const RESERVED_ROOM_NAMES = ['help desk', 'helpdesk', 'help-desk'];
      const SUPPORT_EXEMPT_ROLES = [
        'root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'org_admin', 'org_owner',
      ];
      const _nameLC = name.trim().toLowerCase();
      const _isReserved = RESERVED_ROOM_NAMES.some(r => _nameLC === r || _nameLC.startsWith(r));
      const _platformRole = (authReq.user)?.platformRole || (authReq.user)?.role || '';
      const _isExempt = SUPPORT_EXEMPT_ROLES.includes(authReq.workspaceRole || '') ||
                        SUPPORT_EXEMPT_ROLES.includes(_platformRole);
      if (_isReserved && !_isExempt) {
        log.warn(`[ChatManagement] Blocked reserved room name "${name}" by user ${userId} (role: ${authReq.workspaceRole})`);
        return res.status(403).json({
          error: 'This room name is reserved for the platform support team. Please choose a different name.',
          code: 'RESERVED_ROOM_NAME',
        });
      }

      const allParticipantIds = [userId, ...(participantIds || [])];
      const uniqueIds = [...new Set(allParticipantIds)];

      // Pre-resolve participant user rows before the transaction (read-only).
      const participantUsers = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(inArray(users.id, uniqueIds));

      // D04: Atomic room creation — conversation + participants + audit event all-or-nothing.
      // Without participants, the room is unreachable; without the audit event,
      // the timeline is inconsistent.
      const newConversation = await db.transaction(async (tx) => {
        const [conv] = await tx
          .insert(chatConversations)
          .values({
            workspaceId,
            customerId: userId,
            customerName: userName,
            subject: name.trim(),
            status: "active",
            conversationType: "open_chat",
            visibility: "workspace",
          })
          .returning();

        const participantValues = participantUsers.map((u) => ({
          conversationId: conv.id,
          workspaceId,
          participantId: u.id,
          participantName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "User",
          participantRole: u.id === userId ? "owner" : "member",
          canSendMessages: true,
          canViewHistory: true,
          canInviteOthers: u.id === userId,
          isActive: true,
          joinedAt: new Date(),
        }));

        if (participantValues.length > 0) {
          await tx.insert(chatParticipants).values(participantValues as any);
        }

        await tx.insert(roomEvents).values({
          workspaceId,
          conversationId: conv.id,
          actorId: userId,
          actorName: userName,
          actorRole: "owner",
          eventType: "room_created",
          description: `${userName} created room "${name.trim()}"`,
          eventPayload: JSON.stringify({ participantCount: uniqueIds.length }),
        });

        return conv;
      });

      res.json({
        success: true,
        conversationId: newConversation.id,
        name: name.trim(),
        participantCount: uniqueIds.length,
      });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error creating room:", error);
      res.status(500).json({ error: "Failed to create room" });
    }
  }
);

// ============================================================================
// GET ROOM PARTICIPANTS - GET /api/chat/manage/rooms/:roomId/participants
// ============================================================================
router.get(
  "/rooms/:roomId/participants",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const participants = await db
        .select({
          id: chatParticipants.id,
          participantId: chatParticipants.participantId,
          participantName: chatParticipants.participantName,
          participantRole: chatParticipants.participantRole,
          canSendMessages: chatParticipants.canSendMessages,
          isActive: chatParticipants.isActive,
          joinedAt: chatParticipants.joinedAt,
          email: users.email,
        })
        .from(chatParticipants)
        .leftJoin(users, eq(chatParticipants.participantId, users.id))
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.isActive, true)
          )
        );

      res.json({ success: true, participants });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error fetching participants:", error);
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  }
);

// ============================================================================
// SEARCH USERS FOR DM/INVITE - GET /api/chat/manage/users/search
// ============================================================================
router.get(
  "/users/search",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;
      const query = (req.query.q as string || "").trim();

      if (!userId || !workspaceId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (query.length < 2) {
        return res.json({ success: true, users: [] });
      }

      const searchResults = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(
          and(
            sql`(${users.firstName} || ' ' || ${users.lastName} ILIKE ${'%' + query + '%'} OR ${users.email} ILIKE ${'%' + query + '%'})`,
            sql`${users.id} != ${userId}`
          )
        )
        .limit(20);

      const blockedByMe = await db
        .select({ blockedUserId: blockedContacts.blockedUserId })
        .from(blockedContacts)
        .where(eq(blockedContacts.blockerId, userId));

      const blockedIds = new Set(blockedByMe.map((b) => b.blockedUserId));

      // DM RULE: Hide support staff and system bots from search for non-staff users
      const searcherPlatformRole = (authReq.user)?.platformRole || authReq.user?.role;
      const searcherIsStaff = searcherPlatformRole && [
        "root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"
      ].includes(searcherPlatformRole);

      const protectedRolesForDM = new Set([
        "root_admin", "deputy_admin", "sysop", "support_manager",
        "support_agent", "system_bot"
      ]);

      const filtered = searchResults.filter((u) => {
        if (blockedIds.has(u.id)) return false;
        if (!searcherIsStaff && u.role && protectedRolesForDM.has(u.role)) return false;
        return true;
      });

      res.json({
        success: true,
        users: filtered.map((u) => ({
          id: u.id,
          name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
          email: u.email,
        })),
      });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error searching users:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  }
);

// ============================================================================
// REACTIONS - POST /api/chat/manage/messages/:id/reactions
// ============================================================================
router.post(
  "/messages/:id/reactions",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const { emoji } = req.body;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!emoji || typeof emoji !== "string" || emoji.length > 50) {
        return res.status(400).json({ error: "Valid emoji required" });
      }

      const [message] = await db
        .select({ conversationId: chatMessages.conversationId })
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (!(await verifyParticipant(message.conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant" });
      }

      const [existing] = await db
        .select({ id: messageReactions.id })
        .from(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.userId, userId),
            eq(messageReactions.emoji, emoji)
          )
        )
        .limit(1);

      if (existing) {
        await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
        res.json({ success: true, action: "removed" });
      } else {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(messageReactions).values({ messageId, userId, emoji });
        res.json({ success: true, action: "added" });
      }
    } catch (error: unknown) {
      log.error("[ChatManagement] Error toggling reaction:", error);
      res.status(500).json({ error: "Failed to toggle reaction" });
    }
  }
);

// ============================================================================
// GET REACTIONS - GET /api/chat/manage/messages/:id/reactions
// ============================================================================
router.get(
  "/messages/:id/reactions",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const reactions = await db
        .select({
          id: messageReactions.id,
          emoji: messageReactions.emoji,
          userId: messageReactions.userId,
          userName: users.firstName,
          userLastName: users.lastName,
          createdAt: messageReactions.createdAt,
        })
        .from(messageReactions)
        .leftJoin(users, eq(messageReactions.userId, users.id))
        .where(eq(messageReactions.messageId, messageId));

      const grouped: Record<string, { emoji: string; count: number; users: { id: string; name: string }[]; hasReacted: boolean }> = {};
      for (const r of reactions) {
        if (!grouped[r.emoji]) {
          grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [], hasReacted: false };
        }
        grouped[r.emoji].count++;
        grouped[r.emoji].users.push({
          id: r.userId,
          name: `${r.userName || ""} ${r.userLastName || ""}`.trim() || "User",
        });
        if (r.userId === userId) {
          grouped[r.emoji].hasReacted = true;
        }
      }

      res.json({ success: true, reactions: Object.values(grouped) });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error getting reactions:", error);
      res.status(500).json({ error: "Failed to get reactions" });
    }
  }
);

// ============================================================================
// BATCH REACTIONS - GET /api/chat/manage/conversations/:id/reactions
// ============================================================================
router.get(
  "/conversations/:id/reactions",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const reactions = await db
        .select({
          messageId: messageReactions.messageId,
          emoji: messageReactions.emoji,
          userId: messageReactions.userId,
          userName: users.firstName,
          userLastName: users.lastName,
        })
        .from(messageReactions)
        .innerJoin(chatMessages, eq(messageReactions.messageId, chatMessages.id))
        .leftJoin(users, eq(messageReactions.userId, users.id))
        .where(eq(chatMessages.conversationId, conversationId));

      const byMessage: Record<string, Record<string, { emoji: string; count: number; users: { id: string; name: string }[]; hasReacted: boolean }>> = {};
      for (const r of reactions) {
        if (!byMessage[r.messageId]) byMessage[r.messageId] = {};
        if (!byMessage[r.messageId][r.emoji]) {
          byMessage[r.messageId][r.emoji] = { emoji: r.emoji, count: 0, users: [], hasReacted: false };
        }
        byMessage[r.messageId][r.emoji].count++;
        byMessage[r.messageId][r.emoji].users.push({
          id: r.userId,
          name: `${r.userName || ""} ${r.userLastName || ""}`.trim() || "User",
        });
        if (r.userId === userId) {
          byMessage[r.messageId][r.emoji].hasReacted = true;
        }
      }

      const result: Record<string, any[]> = {};
      for (const [msgId, emojis] of Object.entries(byMessage)) {
        result[msgId] = Object.values(emojis);
      }

      res.json({ success: true, reactions: result });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error getting batch reactions:", error);
      res.status(500).json({ error: "Failed to get reactions" });
    }
  }
);

// ============================================================================
// EDIT MESSAGE - PATCH /api/chat/manage/messages/:id/edit
// ============================================================================
router.patch(
  "/messages/:id/edit",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const { message } = req.body;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "Message content required" });
      }

      const [msg] = await db
        .select({ senderId: chatMessages.senderId, conversationId: chatMessages.conversationId, createdAt: chatMessages.createdAt })
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);

      if (!msg) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (msg.senderId !== userId) {
        return res.status(403).json({ error: "You can only edit your own messages" });
      }

      const fiveMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      if (msg.createdAt && msg.createdAt < fiveMinutesAgo) {
        return res.status(400).json({ error: "Messages can only be edited within 15 minutes" });
      }

      await db
        .update(chatMessages)
        .set({
          message: message.trim(),
          isEdited: true,
          editedAt: new Date(),
        })
        .where(eq(chatMessages.id, messageId));

      res.json({ success: true, message: "Message edited" });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error editing message:", error);
      res.status(500).json({ error: "Failed to edit message" });
    }
  }
);

// ============================================================================
// FORWARD MESSAGE - POST /api/chat/manage/messages/:id/forward
// ============================================================================
router.post(
  "/messages/:id/forward",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const { targetConversationId } = req.body;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!targetConversationId) {
        return res.status(400).json({ error: "Target conversation required" });
      }

      const [originalMsg] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);

      if (!originalMsg) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (!(await verifyParticipant(originalMsg.conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of source conversation" });
      }

      if (!(await verifyParticipant(targetConversationId, userId))) {
        return res.status(403).json({ error: "Not a participant of target conversation" });
      }

      const user = authReq.user;
      const { formatUserDisplayNameForChat } = await import('../utils/formatUserDisplayName');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userPlatformRole = await storage.getUserPlatformRole(userId);
      const senderName = formatUserDisplayNameForChat({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        firstName: user.firstName,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        lastName: user.lastName,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        email: user.email || undefined,
        platformRole: userPlatformRole || undefined,
      });

      const forwardedContent = `[Forwarded from ${originalMsg.senderName || "Unknown"}]\n${originalMsg.message}`;

      const [forwarded] = await db
        .insert(chatMessages)
        .values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: workspaceId,
          conversationId: targetConversationId,
          senderId: userId,
          senderName,
          senderType: "customer",
          message: forwardedContent,
          messageType: originalMsg.messageType || "text",
          attachmentUrl: originalMsg.attachmentUrl,
          attachmentName: originalMsg.attachmentName,
          attachmentType: originalMsg.attachmentType,
          attachmentSize: originalMsg.attachmentSize,
        })
        .returning({ id: chatMessages.id });

      res.json({ success: true, forwardedMessageId: forwarded.id });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error forwarding message:", error);
      res.status(500).json({ error: "Failed to forward message" });
    }
  }
);

// ============================================================================
// IN-CONVERSATION SEARCH - GET /api/chat/manage/conversations/:id/search
// ============================================================================
router.get(
  "/conversations/:id/search",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const { q } = req.query;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!q || typeof q !== "string" || q.trim().length < 2) {
        return res.json({ success: true, messages: [] });
      }

      if (!(await verifyParticipant(conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant" });
      }

      const results = await db
        .select({
          id: chatMessages.id,
          message: chatMessages.message,
          senderName: chatMessages.senderName,
          senderId: chatMessages.senderId,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conversationId),
            eq(chatMessages.isDeletedForEveryone, false),
            sql`${chatMessages.message} ILIKE ${'%' + q.trim() + '%'}`
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(50);

      res.json({ success: true, messages: results });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error searching messages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  }
);

// ============================================================================
// PIN MESSAGE - POST /api/chat/manage/messages/:id/pin
// ============================================================================
router.post(
  "/messages/:id/pin",
  managementLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [msg] = await db
        .select({ conversationId: chatMessages.conversationId, formattedContent: chatMessages.formattedContent })
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);

      if (!msg) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (!(await verifyParticipant(msg.conversationId, userId))) {
        return res.status(403).json({ error: "Not a participant" });
      }

      const isPinned = msg.formattedContent === "pinned";
      const user = authReq.user;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User";

      // D04: Atomic pin toggle — message update + audit event together
      await db.transaction(async (tx) => {
        await tx
          .update(chatMessages)
          .set({ formattedContent: isPinned ? null : "pinned" })
          .where(eq(chatMessages.id, messageId));

        await tx.insert(roomEvents).values({
          workspaceId: workspaceId || "system",
          conversationId: msg.conversationId,
          actorId: userId,
          actorName: userName,
          actorRole: "member",
          eventType: isPinned ? "message_unpinned" : "message_pinned",
          description: `${userName} ${isPinned ? "unpinned" : "pinned"} a message`,
        });
      });

      res.json({ success: true, pinned: !isPinned });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error pinning message:", error);
      res.status(500).json({ error: "Failed to pin message" });
    }
  }
);

// ============================================================================
// GET PINNED MESSAGES - GET /api/chat/manage/conversations/:id/pinned
// ============================================================================
router.get(
  "/conversations/:id/pinned",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const conversationId = await resolveConversationId(req.params.id);
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const pinned = await db
        .select({
          id: chatMessages.id,
          message: chatMessages.message,
          senderName: chatMessages.senderName,
          senderId: chatMessages.senderId,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conversationId),
            eq(chatMessages.formattedContent, "pinned")
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(20);

      res.json({ success: true, messages: pinned });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error getting pinned messages:", error);
      res.status(500).json({ error: "Failed to get pinned messages" });
    }
  }
);

// ============================================================================
// GET PARENT MESSAGE - GET /api/chat/manage/messages/:id/parent
// ============================================================================
router.get(
  "/messages/:id/parent",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { id: messageId } = req.params;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [msg] = await db
        .select({
          id: chatMessages.id,
          message: chatMessages.message,
          senderName: chatMessages.senderName,
          senderId: chatMessages.senderId,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);

      if (!msg) {
        return res.status(404).json({ error: "Message not found" });
      }

      res.json({ success: true, message: msg });
    } catch (error: unknown) {
      log.error("[ChatManagement] Error getting parent message:", error);
      res.status(500).json({ error: "Failed to get parent message" });
    }
  }
);

// ============================================================================
// LINK PREVIEW - POST /api/chat/manage/link-preview
// ============================================================================
router.post(
  "/link-preview",
  managementLimiter,
  async (req, res) => {
    try {
      const { url } = req.body;
      const userId = (req as AuthenticatedRequest).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL required" });
      }

      // SSRF protection: reject URLs targeting private/internal IP ranges
      try {
        await validateWebhookUrl(url);
      } catch {
        return res.json({ success: true, preview: null });
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": `${PLATFORM.name}-LinkPreview/1.0` },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return res.json({ success: true, preview: null });
        }

        const html = await response.text();
        const getMetaContent = (property: string): string | null => {
          const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
          const match = html.match(regex);
          if (match) return match[1];
          const regex2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i");
          const match2 = html.match(regex2);
          return match2 ? match2[1] : null;
        };

        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = getMetaContent("og:title") || (titleMatch ? titleMatch[1].trim() : null);
        const description = getMetaContent("og:description") || getMetaContent("description");
        const image = getMetaContent("og:image");
        const siteName = getMetaContent("og:site_name");

        res.json({
          success: true,
          preview: title ? { title, description, image, siteName, url } : null,
        });
      } catch {
        res.json({ success: true, preview: null });
      }
    } catch (error: unknown) {
      log.error("[ChatManagement] Error fetching link preview:", error);
      res.status(500).json({ error: "Failed to fetch link preview" });
    }
  }
);

export default router;
