import { Router } from "express";
import { db } from "../db";
import { 
  chatConversations, 
  chatParticipants, 
  roomEvents,
  shifts,
  users,
  supportRooms,
  organizationChatRooms,
  organizationRoomMembers,
} from "@shared/schema";
import { eq, and, or, sql, inArray, count } from "drizzle-orm";
import { AuthenticatedRequest } from "../rbac";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiting for room operations
const roomLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 operations per window
  message: "Too many room operations, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Helper: Create room event audit record
 */
async function createRoomEvent(
  workspaceId: string,
  conversationId: string,
  actorId: string,
  actorName: string,
  actorRole: string,
  eventType: string,
  description: string,
  eventPayload?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
) {
  await db.insert(roomEvents).values({
    workspaceId,
    conversationId,
    actorId,
    actorName,
    actorRole,
    eventType,
    description,
    eventPayload: eventPayload ? JSON.stringify(eventPayload) : null,
    ipAddress,
    userAgent,
  });
}

/**
 * Helper: Verify user can manage room (owner/admin/workspace admin)
 */
async function canManageRoom(
  conversationId: string,
  userId: string,
  workspaceId: string,
  workspaceRole?: string
): Promise<boolean> {
  // Workspace owner/admin can manage all rooms
  if (workspaceRole && ["owner", "admin"].includes(workspaceRole)) {
    return true;
  }

  // Check if user is active room owner/admin
  const [participant] = await db
    .select()
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.conversationId, conversationId),
        eq(chatParticipants.participantId, userId),
        eq(chatParticipants.isActive, true), // CRITICAL: Must be active
        inArray(chatParticipants.participantRole, ["owner", "admin"])
      )
    )
    .limit(1);

  return !!participant;
}

// ============================================================================
// CREATE ROOM - POST /api/chat/rooms
// ============================================================================
router.post(
  "/",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { 
        subject, 
        conversationType, 
        visibility, 
        shiftId, 
        autoCloseAt,
        helpdeskTicketId,
        participants 
      } = req.body;

      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      // Validate conversation type
      const validTypes = ['open_chat', 'shift_chat', 'dm_user', 'dm_support', 'dm_bot'];
      if (conversationType && !validTypes.includes(conversationType)) {
        return res.status(400).json({ error: "Invalid conversation type" });
      }

      // Validate visibility
      const validVisibilities = ['workspace', 'public', 'private'];
      if (visibility && !validVisibilities.includes(visibility)) {
        return res.status(400).json({ error: "Invalid visibility" });
      }

      // Only owner/admin can create public rooms
      if (visibility === 'public' && !["owner", "admin"].includes(authReq.workspaceRole || "")) {
        return res.status(403).json({ error: "Only workspace owners/admins can create public rooms" });
      }

      // If shift-based, verify shift exists and belongs to workspace
      let shiftData = null;
      if (shiftId) {
        const [shift] = await db
          .select()
          .from(shifts)
          .where(
            and(
              eq(shifts.id, shiftId),
              eq(shifts.workspaceId, workspaceId)
            )
          )
          .limit(1);

        if (!shift) {
          return res.status(404).json({ error: "Shift not found or not in your workspace" });
        }

        shiftData = shift;

        // Auto-set conversationType and autoCloseAt for shift-based rooms
        if (!conversationType) {
          req.body.conversationType = 'shift_chat';
        }
        if (!autoCloseAt && shift.endTime) {
          req.body.autoCloseAt = shift.endTime;
        }
      }

      // Create the conversation
      const [conversation] = await db
        .insert(chatConversations)
        .values({
          workspaceId,
          subject: subject || (shiftData ? `Shift: ${shiftData.title}` : "New Workroom"),
          conversationType: req.body.conversationType || conversationType || 'open_chat',
          visibility: visibility || 'workspace',
          status: 'active',
          shiftId: shiftId || null,
          autoCloseAt: req.body.autoCloseAt || autoCloseAt || null,
          helpdeskTicketId: helpdeskTicketId || null,
          customerId: userId, // Creator
          customerName: userName,
        })
        .returning();

      // Add creator as room owner
      await db.insert(chatParticipants).values({
        conversationId: conversation.id,
        workspaceId,
        participantId: userId,
        participantName: userName,
        participantEmail: authReq.user?.email,
        participantRole: 'owner',
        canSendMessages: true,
        canViewHistory: true,
        canInviteOthers: true,
        joinedAt: new Date(),
        isActive: true,
      });

      // Add additional participants if provided
      if (participants && Array.isArray(participants) && participants.length > 0) {
        const participantRecords = await Promise.all(
          participants.map(async (participantId: string) => {
            // Get participant info
            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, participantId))
              .limit(1);

            if (!user) return null;

            return {
              conversationId: conversation.id,
              workspaceId,
              participantId: user.id,
              participantName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email!,
              participantEmail: user.email,
              participantRole: 'member',
              canSendMessages: true,
              canViewHistory: true,
              canInviteOthers: false,
              invitedBy: userId,
              joinedAt: new Date(),
              isActive: true,
            };
          })
        );

        const validParticipants = participantRecords.filter(p => p !== null);
        if (validParticipants.length > 0) {
          await db.insert(chatParticipants).values(validParticipants);
        }
      }

      // Create audit event
      await createRoomEvent(
        workspaceId,
        conversation.id,
        userId,
        userName,
        authReq.workspaceRole || "employee",
        "room_created",
        `${userName} created workroom: ${conversation.subject}`,
        {
          conversationType: conversation.conversationType,
          visibility: conversation.visibility,
          shiftId: shiftId || undefined,
          participantCount: participants?.length || 0,
        },
        authReq.ip,
        authReq.get("user-agent")
      );

      res.status(201).json({
        success: true,
        conversation: {
          id: conversation.id,
          subject: conversation.subject,
          conversationType: conversation.conversationType,
          visibility: conversation.visibility,
          shiftId: conversation.shiftId,
          autoCloseAt: conversation.autoCloseAt,
        },
      });
    } catch (error: any) {
      console.error("Error creating room:", error);
      res.status(500).json({ error: "Failed to create room" });
    }
  }
);

// ============================================================================
// LIST ROOMS - GET /api/chat/rooms (Enhanced with all room types)
// ============================================================================
// Returns: { roomId, name, slug, type, participantsCount, lastMessageAt, status }
router.get(
  "/",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      const rooms: any[] = [];

      // ========================================================================
      // 1. SUPPORT ROOMS (type: 'support')
      // ========================================================================
      try {
        const supportRoomsList = await db
          .select({
            id: supportRooms.id,
            slug: supportRooms.slug,
            name: supportRooms.name,
            status: supportRooms.status,
            conversationId: supportRooms.conversationId,
            lastMessageAt: chatConversations.lastMessageAt,
          })
          .from(supportRooms)
          .leftJoin(
            chatConversations,
            eq(supportRooms.conversationId, chatConversations.id)
          )
          .where(
            or(
              eq(supportRooms.workspaceId, workspaceId),
              eq(supportRooms.workspaceId, null) // Platform-wide support rooms
            )
          );

        for (const room of supportRoomsList) {
          // Count participants from associated conversation
          let participantsCount = 0;
          if (room.conversationId) {
            const [countResult] = await db
              .select({ count: count() })
              .from(chatParticipants)
              .where(
                and(
                  eq(chatParticipants.conversationId, room.conversationId),
                  eq(chatParticipants.isActive, true)
                )
              );
            participantsCount = countResult?.count || 0;
          }

          rooms.push({
            roomId: room.id,
            name: room.name,
            slug: room.slug,
            type: 'support',
            participantsCount,
            lastMessageAt: room.lastMessageAt,
            status: room.status,
            roomType: 'support_room',
          });
        }
      } catch (error) {
        console.error("[GET /api/chat/rooms] Error fetching support rooms:", error);
      }

      // ========================================================================
      // 2. ORGANIZATION CHAT ROOMS (type: 'org')
      // ========================================================================
      try {
        const orgRooms = await db
          .select({
            id: organizationChatRooms.id,
            roomSlug: organizationChatRooms.roomSlug,
            roomName: organizationChatRooms.roomName,
            status: organizationChatRooms.status,
            conversationId: organizationChatRooms.conversationId,
            lastMessageAt: chatConversations.lastMessageAt,
          })
          .from(organizationChatRooms)
          .leftJoin(
            chatConversations,
            eq(organizationChatRooms.conversationId, chatConversations.id)
          )
          .where(eq(organizationChatRooms.workspaceId, workspaceId));

        for (const room of orgRooms) {
          // Count participants from organization room members
          const [countResult] = await db
            .select({ count: count() })
            .from(organizationRoomMembers)
            .where(eq(organizationRoomMembers.roomId, room.id));
          const participantsCount = countResult?.count || 0;

          rooms.push({
            roomId: room.id,
            name: room.roomName,
            slug: room.roomSlug,
            type: 'org',
            participantsCount,
            lastMessageAt: room.lastMessageAt,
            status: room.status,
            roomType: 'organization_room',
          });
        }
      } catch (error) {
        console.error("[GET /api/chat/rooms] Error fetching org rooms:", error);
      }

      // ========================================================================
      // 3. GENERAL CHAT CONVERSATIONS (work, meeting rooms)
      // ========================================================================
      try {
        const generalRooms = await db
          .select({
            conversation: chatConversations,
            participant: chatParticipants,
          })
          .from(chatConversations)
          .leftJoin(
            chatParticipants,
            and(
              eq(chatConversations.id, chatParticipants.conversationId),
              eq(chatParticipants.participantId, userId),
              eq(chatParticipants.isActive, true)
            )
          )
          .where(
            and(
              eq(chatConversations.workspaceId, workspaceId),
              eq(chatConversations.status, 'active'),
              // Exclude shift chats and support chats
              inArray(chatConversations.conversationType, ['open_chat', 'dm_user']),
              or(
                // User is an active participant
                and(
                  eq(chatParticipants.participantId, userId),
                  eq(chatParticipants.isActive, true)
                ),
                // Room is public or workspace-visible
                inArray(chatConversations.visibility, ['public', 'workspace'])
              )
            )
          );

        for (const item of generalRooms) {
          const conv = item.conversation;
          // Count participants from chat participants
          const [countResult] = await db
            .select({ count: count() })
            .from(chatParticipants)
            .where(
              and(
                eq(chatParticipants.conversationId, conv.id),
                eq(chatParticipants.isActive, true)
              )
            );
          const participantsCount = countResult?.count || 0;

          // Determine room type (work vs meeting)
          // If subject contains "meeting", "team", or explicit markers, type is 'meeting'
          let roomType = 'work';
          if (
            conv.subject &&
            /meeting|stand.?up|team|sync|huddle/i.test(conv.subject)
          ) {
            roomType = 'meeting';
          }

          rooms.push({
            roomId: conv.id,
            name: conv.subject || 'Untitled',
            slug: conv.id.toLowerCase().slice(0, 20), // Use ID prefix as slug for general rooms
            type: roomType,
            participantsCount,
            lastMessageAt: conv.lastMessageAt,
            status: conv.status,
            roomType: 'conversation',
            isParticipant: !!item.participant,
            participantRole: item.participant?.participantRole || null,
          });
        }
      } catch (error) {
        console.error("[GET /api/chat/rooms] Error fetching general rooms:", error);
      }

      // Sort by last message time (most recent first)
      rooms.sort((a, b) => {
        const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return timeB - timeA;
      });

      res.json({
        success: true,
        rooms,
        totalRooms: rooms.length,
      });
    } catch (error: any) {
      console.error("[GET /api/chat/rooms] Error listing rooms:", error);
      res.status(500).json({ error: "Failed to list rooms" });
    }
  }
);

// ============================================================================
// JOIN ROOM - POST /api/chat/rooms/:roomId/join
// ============================================================================
router.post(
  "/:roomId/join",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = authReq.params;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      // Get conversation
      const [conversation] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, roomId),
            eq(chatConversations.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Room not found" });
      }

      // Check if room is joinable (not private unless already invited)
      if (conversation.visibility === 'private') {
        // Check if user was invited (including inactive invitations)
        const [invitation] = await db
          .select()
          .from(chatParticipants)
          .where(
            and(
              eq(chatParticipants.conversationId, roomId),
              eq(chatParticipants.participantId, userId)
            )
          )
          .limit(1);

        if (!invitation) {
          return res.status(403).json({ error: "Cannot join private room without invitation" });
        }

        // Update invitation to mark as joined
        await db
          .update(chatParticipants)
          .set({ joinedAt: new Date(), isActive: true })
          .where(eq(chatParticipants.id, invitation.id));

        // Create audit event
        await createRoomEvent(
          workspaceId,
          roomId,
          userId,
          userName,
          authReq.workspaceRole || "employee",
          "user_joined",
          `${userName} joined the room`,
          { participantRole: invitation.participantRole },
          authReq.ip,
          authReq.get("user-agent")
        );

        return res.json({ success: true, message: "Joined room successfully" });
      }

      // Check if already an active participant
      const [existing] = await db
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

      if (existing) {
        return res.status(400).json({ error: "Already a member of this room" });
      }

      // Check if user previously left - allow rejoin by reactivating
      const [previous] = await db
        .select()
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.participantId, userId),
            eq(chatParticipants.isActive, false)
          )
        )
        .limit(1);

      if (previous) {
        // Reactivate previous membership
        await db
          .update(chatParticipants)
          .set({ 
            joinedAt: new Date(), 
            isActive: true,
            leftAt: null 
          })
          .where(eq(chatParticipants.id, previous.id));

        // Create audit event
        await createRoomEvent(
          workspaceId,
          roomId,
          userId,
          userName,
          authReq.workspaceRole || "employee",
          "user_rejoined",
          `${userName} rejoined the room`,
          { participantRole: previous.participantRole },
          authReq.ip,
          authReq.get("user-agent")
        );

        return res.json({ success: true, message: "Rejoined room successfully" });
      }

      // Add as participant
      await db.insert(chatParticipants).values({
        conversationId: roomId,
        workspaceId,
        participantId: userId,
        participantName: userName,
        participantEmail: authReq.user?.email,
        participantRole: 'member',
        canSendMessages: true,
        canViewHistory: true,
        canInviteOthers: false,
        joinedAt: new Date(),
        isActive: true,
      });

      // Create audit event
      await createRoomEvent(
        workspaceId,
        roomId,
        userId,
        userName,
        authReq.workspaceRole || "employee",
        "user_joined",
        `${userName} joined the room`,
        { participantRole: 'member' },
        authReq.ip,
        authReq.get("user-agent")
      );

      res.json({ success: true, message: "Joined room successfully" });
    } catch (error: any) {
      console.error("Error joining room:", error);
      res.status(500).json({ error: "Failed to join room" });
    }
  }
);

// ============================================================================
// ADD PARTICIPANTS - POST /api/chat/rooms/:roomId/participants
// ============================================================================
router.post(
  "/:roomId/participants",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = authReq.params;
      const { participantIds, role } = req.body;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ error: "participantIds array required" });
      }

      // Verify room exists and user can manage it
      const [conversation] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, roomId),
            eq(chatConversations.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Room not found" });
      }

      // Check permissions
      const canManage = await canManageRoom(roomId, userId, workspaceId, authReq.workspaceRole);
      if (!canManage) {
        return res.status(403).json({ error: "Only room admins/owners can add participants" });
      }

      // Add participants
      const addedParticipants = [];
      for (const participantId of participantIds) {
        // Check if already a participant
        const [existing] = await db
          .select()
          .from(chatParticipants)
          .where(
            and(
              eq(chatParticipants.conversationId, roomId),
              eq(chatParticipants.participantId, participantId)
            )
          )
          .limit(1);

        if (existing) continue; // Skip if already participant

        // Get user info
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, participantId))
          .limit(1);

        if (!user) continue; // Skip if user not found

        await db.insert(chatParticipants).values({
          conversationId: roomId,
          workspaceId,
          participantId: user.id,
          participantName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email!,
          participantEmail: user.email,
          participantRole: role || 'member',
          canSendMessages: true,
          canViewHistory: true,
          canInviteOthers: role === 'admin',
          invitedBy: userId,
          isActive: true,
        });

        addedParticipants.push(user.id);
      }

      // Create audit event
      if (addedParticipants.length > 0) {
        await createRoomEvent(
          workspaceId,
          roomId,
          userId,
          userName,
          authReq.workspaceRole || "employee",
          "participants_added",
          `${userName} added ${addedParticipants.length} participant(s)`,
          { participantIds: addedParticipants, role: role || 'member' },
          authReq.ip,
          authReq.get("user-agent")
        );
      }

      res.json({ 
        success: true, 
        added: addedParticipants.length,
        message: `Added ${addedParticipants.length} participant(s)` 
      });
    } catch (error: any) {
      console.error("Error adding participants:", error);
      res.status(500).json({ error: "Failed to add participants" });
    }
  }
);

// ============================================================================
// REMOVE PARTICIPANT - DELETE /api/chat/rooms/:roomId/participants/:participantId
// ============================================================================
router.delete(
  "/:roomId/participants/:participantId",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId, participantId } = authReq.params;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      // Verify room exists
      const [conversation] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, roomId),
            eq(chatConversations.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Room not found" });
      }

      // Get participant record
      const [participant] = await db
        .select()
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.participantId, participantId)
          )
        )
        .limit(1);

      if (!participant) {
        return res.status(404).json({ error: "Participant not found in this room" });
      }

      // Check permissions - user can remove themselves OR be room admin/owner
      const isSelf = userId === participantId;
      const canManage = await canManageRoom(roomId, userId, workspaceId, authReq.workspaceRole);

      if (!isSelf && !canManage) {
        return res.status(403).json({ error: "Only room admins/owners can remove participants" });
      }

      // Cannot remove room owner
      if (participant.participantRole === 'owner' && !isSelf) {
        return res.status(403).json({ error: "Cannot remove room owner" });
      }

      // Mark participant as left (soft delete for audit trail)
      await db
        .update(chatParticipants)
        .set({ 
          leftAt: new Date(), 
          isActive: false 
        })
        .where(eq(chatParticipants.id, participant.id));

      // Create audit event
      await createRoomEvent(
        workspaceId,
        roomId,
        userId,
        userName,
        authReq.workspaceRole || "employee",
        isSelf ? "user_left" : "user_removed",
        isSelf 
          ? `${userName} left the room`
          : `${userName} removed ${participant.participantName} from the room`,
        { 
          removedParticipantId: participantId, 
          removedParticipantName: participant.participantName 
        },
        authReq.ip,
        authReq.get("user-agent")
      );

      res.json({ success: true, message: "Participant removed successfully" });
    } catch (error: any) {
      console.error("Error removing participant:", error);
      res.status(500).json({ error: "Failed to remove participant" });
    }
  }
);

// ============================================================================
// BULK JOIN ROOMS - POST /api/chat/rooms/join-bulk
// ============================================================================
router.post(
  "/join-bulk",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomIds } = req.body;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
        return res.status(400).json({ error: "Invalid room IDs" });
      }

      const results = [];
      const errors = [];

      for (const roomId of roomIds) {
        try {
          // Check if room exists and user is not already a participant
          const [existingParticipant] = await db
            .select()
            .from(chatParticipants)
            .where(
              and(
                eq(chatParticipants.conversationId, roomId),
                eq(chatParticipants.participantId, userId)
              )
            )
            .limit(1);

          if (existingParticipant) {
            results.push({
              roomId,
              status: 'already_joined',
              message: 'Already a participant',
            });
            continue;
          }

          // Get room details
          const [room] = await db
            .select()
            .from(chatConversations)
            .where(
              and(
                eq(chatConversations.id, roomId),
                eq(chatConversations.workspaceId, workspaceId)
              )
            )
            .limit(1);

          if (!room) {
            errors.push({
              roomId,
              error: 'Room not found',
            });
            continue;
          }

          // Add user as participant
          await db.insert(chatParticipants).values({
            conversationId: roomId,
            workspaceId,
            participantId: userId,
            participantName: userName,
            participantEmail: authReq.user?.email,
            participantRole: 'member',
            canSendMessages: true,
            canViewHistory: true,
            canInviteOthers: false,
            joinedAt: new Date(),
            isActive: true,
          });

          // Create audit event
          await createRoomEvent(
            workspaceId,
            roomId,
            userId,
            userName,
            authReq.workspaceRole || "employee",
            "user_joined",
            `${userName} joined the room`,
            {},
            authReq.ip,
            authReq.get("user-agent")
          );

          results.push({
            roomId,
            status: 'joined',
            message: 'Successfully joined room',
          });
        } catch (error: any) {
          errors.push({
            roomId,
            error: error.message || 'Failed to join room',
          });
        }
      }

      res.json({
        success: errors.length === 0,
        results,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Error bulk joining rooms:", error);
      res.status(500).json({ error: "Failed to join rooms" });
    }
  }
);

export default router;
