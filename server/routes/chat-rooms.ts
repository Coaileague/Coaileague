import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { broadcastToWorkspace } from "../websocket";
import { roomPresence } from "../services/ircEventRegistry";
import { 
  chatConversations, 
  chatParticipants, 
  chatMessages,
  roomEvents,
  messageReactions,
  typingIndicators,
  shifts,
  users,
  supportRooms,
  organizationChatRooms,
  organizationRoomMembers,
  workspaces,
  conversationUserState,
} from "@shared/schema";
import { eq, and, or, sql, inArray, notInArray, count, desc, gte, isNull, isNotNull, ne } from "drizzle-orm";
import { AuthenticatedRequest } from "../rbac";
import { ROLES, OWNER_ROLES, ADMIN_ROLES } from "@shared/platformConfig";
import rateLimit from "express-rate-limit";
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('ChatRooms');


const router = Router();

router.use(requireAuth);

async function getLastMessagePreview(conversationId: string | null): Promise<{ lastMessage: string | null; lastMessageSender: string | null }> {
  if (!conversationId) return { lastMessage: null, lastMessageSender: null };
  try {
    const [lastMsg] = await db
      .select({
        message: chatMessages.message,
        senderName: chatMessages.senderName,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);
    if (lastMsg) {
      const preview = (lastMsg.message || '').slice(0, 100);
      return { lastMessage: preview, lastMessageSender: lastMsg.senderName || null };
    }
  } catch (err) {
    log.warn('[Chat] Failed to get last message preview for conversation:', conversationId, err);
  }
  return { lastMessage: null, lastMessageSender: null };
}

async function getConversationUnreadCount(conversationId: string | null, userId: string): Promise<number> {
  if (!conversationId || !userId) return 0;
  try {
    const [result] = await db
      .select({ count: count() })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.conversationId, conversationId),
        isNull(chatMessages.readAt),
        ne(chatMessages.senderId, userId)
      ));
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

async function getLeftConversationIds(userId: string): Promise<Set<string>> {
  try {
    const leftRows = await db
      .select({ conversationId: conversationUserState.conversationId })
      .from(conversationUserState)
      .where(and(
        eq(conversationUserState.userId, userId),
        eq(conversationUserState.hasLeft, true)
      ));
    return new Set(leftRows.map(r => r.conversationId));
  } catch {
    return new Set();
  }
}

async function batchGetLastMessagePreviews(conversationIds: (string | null)[]): Promise<Map<string, { lastMessage: string; lastMessageSender: string | null }>> {
  const validIds = conversationIds.filter((id): id is string => !!id);
  const result = new Map<string, { lastMessage: string; lastMessageSender: string | null }>();
  if (validIds.length === 0) return result;
  const previews = await Promise.all(validIds.map(id => getLastMessagePreview(id).then(p => ({ id, ...p }))));
  for (const p of previews) {
    if (p.lastMessage) {
      result.set(p.id, { lastMessage: p.lastMessage, lastMessageSender: p.lastMessageSender });
    }
  }
  return result;
}

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
  // Workspace manager+ can manage all rooms
  if (workspaceRole && ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager'].includes(workspaceRole)) {
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
        inArray(chatParticipants.participantRole, [...ADMIN_ROLES])
      )
    )
    .limit(1);

  return !!participant;
}

/**
 * Helper: Resolve roomId/conversationId to actual conversationId
 * Supports multiple room types (support rooms, organization rooms, general conversations)
 */
async function resolveRoomToConversationId(
  roomId: string,
  workspaceId: string
): Promise<{ conversationId: string; roomType: 'support' | 'org' | 'conversation' } | null> {
  // Try support room first
  const [supportRoom] = await db
    .select()
    .from(supportRooms)
    .where(
      and(
        eq(supportRooms.id, roomId),
        or(
          eq(supportRooms.workspaceId, workspaceId),
          isNull(supportRooms.workspaceId), // Platform-wide support rooms (null)
          eq(supportRooms.workspaceId, 'system') // Platform-wide support rooms (system marker)
        )
      )
    )
    .limit(1);

  if (supportRoom && supportRoom.conversationId) {
    return { conversationId: supportRoom.conversationId, roomType: 'support' };
  }

  // Try organization room
  const [orgRoom] = await db
    .select()
    .from(organizationChatRooms)
    .where(
      and(
        eq(organizationChatRooms.id, roomId),
        eq(organizationChatRooms.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (orgRoom && orgRoom.conversationId) {
    return { conversationId: orgRoom.conversationId, roomType: 'org' };
  }

  // Try direct conversation (general chat)
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

  if (conversation) {
    return { conversationId: conversation.id, roomType: 'conversation' };
  }

  return null;
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
        log.error(`[ChatRoom CREATE] FAILED - No workspace context. userId: ${userId}, workspaceId: ${workspaceId}`);
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
      if (visibility === 'public' && !(ADMIN_ROLES as readonly string[]).includes(authReq.workspaceRole || "")) {
        return res.status(403).json({ error: "Only workspace owners/admins can create public rooms" });
      }

      // ─────────────────────────────────────────────────────────────────────
      // RESERVED ROOM NAME GUARD
      // These names are reserved for system-created platform rooms only.
      // Support agents and platform admins are exempt.
      // ─────────────────────────────────────────────────────────────────────
      const RESERVED_ROOM_NAMES = [
        'help desk', 'helpdesk', 'help-desk',
        // Add additional system room names here if needed
      ];
      const SUPPORT_EXEMPT_ROLES = [
        'root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent',
        'org_admin', 'org_owner',
      ];
      const requestedName = (subject || '').trim().toLowerCase();
      const isReservedName = RESERVED_ROOM_NAMES.some(
        r => requestedName === r || requestedName.startsWith(r)
      );
      const _userPlatformRole = (authReq.user as any)?.platformRole || (authReq.user as any)?.role || '';
      const isSupportExempt = SUPPORT_EXEMPT_ROLES.includes(authReq.workspaceRole || '') ||
                              SUPPORT_EXEMPT_ROLES.includes(_userPlatformRole);
      if (isReservedName && !isSupportExempt) {
        log.warn(`[ChatRoom CREATE] Blocked reserved room name "${subject}" by user ${userId} (role: ${authReq.workspaceRole})`);
        return res.status(403).json({
          error: 'This room name is reserved for the platform support team. Please choose a different name.',
          code: 'RESERVED_ROOM_NAME',
        });
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

      // Deduplication: Check if user already created a room with same name in last 30 seconds
      const roomName = subject || (shiftData ? `Shift: ${shiftData.title}` : "New Workroom");
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      const [existingRecent] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.workspaceId, workspaceId),
            eq(chatConversations.subject, roomName),
            eq(chatConversations.customerId, userId),
            gte(chatConversations.createdAt, thirtySecondsAgo)
          )
        )
        .limit(1);

      if (existingRecent) {
        return res.status(201).json({
          success: true,
          conversation: {
            id: existingRecent.id,
            subject: existingRecent.subject,
            conversationType: existingRecent.conversationType,
            visibility: existingRecent.visibility,
            shiftId: existingRecent.shiftId,
            autoCloseAt: existingRecent.autoCloseAt,
          },
          deduplicated: true,
        });
      }

      // Create the conversation
      const [conversation] = await db
        .insert(chatConversations)
        .values({
          workspaceId,
          subject: roomName,
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

      // Create organization chat room wrapper for org-isolated persistence
      const roomSlug = roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
      const uniqueSlug = `${roomSlug}-${conversation.id.slice(0, 8)}`;
      
      await db.insert(organizationChatRooms).values({
        workspaceId,
        roomName,
        roomSlug: uniqueSlug,
        conversationId: conversation.id,
        status: 'active',
        createdBy: userId,
      });

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

      // Send welcome system message for the new room
      const roomDisplayName = conversation.subject || roomName;
      const roomTypeLabel = conversation.conversationType === 'shift_chat' ? 'shift' : 'team';
      const welcomeText = `Welcome to ${roomDisplayName}! This ${roomTypeLabel} chat was created by ${userName}. Invite your team members and start collaborating.`;
      
      await storage.createChatMessage({
        conversationId: conversation.id,
        senderId: null,
        senderName: 'System',
        senderType: 'system',
        message: welcomeText,
        isSystemMessage: true,
      });

      // Auto-deploy bots based on room type
      const isMeetingRoom = /meeting|stand.?up|sync|huddle/i.test(roomName);
      const isFieldRoom = conversation.conversationType === 'shift_chat';
      const activeBots: string[] = [];

      try {
        const { botPool } = await import('../bots');
        const { BOT_REGISTRY } = await import('../bots/registry');

        if (isMeetingRoom) {
          await botPool.deployBot('meetingbot', conversation.id, workspaceId);
          activeBots.push('meetingbot');
          await storage.createChatMessage({
            conversationId: conversation.id,
            senderId: 'meetingbot',
            senderName: BOT_REGISTRY.meetingbot.name,
            senderType: 'bot',
            message: `MeetingBot has joined this room. I'll help record and summarize your meeting.\n\nAvailable commands:\n  /meetingstart [title] - Start recording\n  /meetingend - End meeting & generate summary\n  /actionitem <task> @user - Add action item\n  /decision <text> - Record a decision\n  /note <text> - Add a note\n\nType /meetingstart to begin!`,
            messageType: 'text',
          });
          log.info(`[BotDeploy] MeetingBot auto-deployed to room ${conversation.id}`);
        }

        if (isFieldRoom) {
          await botPool.deployBot('reportbot', conversation.id, workspaceId);
          activeBots.push('reportbot');
          await botPool.deployBot('clockbot', conversation.id, workspaceId);
          activeBots.push('clockbot');
          await storage.createChatMessage({
            conversationId: conversation.id,
            senderId: 'reportbot',
            senderName: BOT_REGISTRY.reportbot.name,
            senderType: 'bot',
            message: `ReportBot and ClockBot are active in this shift room.\n\nReport commands: /report, /incident <type>, /endreport, /analyzereports\nClock commands: /clockme <in|out>, /clockstatus\n\nType /help for the full list.`,
            messageType: 'text',
          });
          log.info(`[BotDeploy] ReportBot + ClockBot auto-deployed to shift room ${conversation.id}`);
        }

        // Merge active bots into existing room metadata (preserves modes, etc.)
        if (activeBots.length > 0) {
          const botMetaPatch = JSON.stringify({ activeBots, botDeployedAt: new Date().toISOString() });
          await db.update(chatConversations)
            .set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${botMetaPatch}::jsonb` })
            .where(eq(chatConversations.id, conversation.id));
        }
      } catch (botErr: unknown) {
        log.error('[BotDeploy] Auto-deploy failed (non-blocking):', (botErr as any)?.message);
      }

      // Create audit event
      await createRoomEvent(
        workspaceId,
        conversation.id,
        userId,
        userName,
        authReq.workspaceRole || ROLES.EMPLOYEE,
        "room_created",
        `${userName} created workroom: ${conversation.subject}`,
        {
          conversationType: conversation.conversationType,
          visibility: conversation.visibility,
          shiftId: shiftId || undefined,
          participantCount: participants?.length || 0,
          activeBots,
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
    } catch (error: unknown) {
      log.error("Error creating room:", error);
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
      const userId = authReq.user?.id || req.session?.userId || authReq.user?.email;

      const requireAuth = !!userId;

      const platformRole = (authReq.user as any)?.platformRole || (authReq.user as any)?.role;
      const { hasPlatformWideAccess } = await import('../rbac');
      const isPlatformAdmin = platformRole && hasPlatformWideAccess(platformRole);

      const leftConversationIds = requireAuth ? await getLeftConversationIds(userId!) : new Set<string>();

      const rooms: any[] = [];

      // ========================================================================
      // 1. SUPPORT ROOMS (type: 'support') - Always include platform-wide rooms
      // ========================================================================
      try {
        const isPlatformWide = or(
          isNull(supportRooms.workspaceId),
          eq(supportRooms.workspaceId, 'system')
        );
        const supportRoomConditions = isPlatformAdmin
          ? undefined
          : workspaceId
            ? or(
                eq(supportRooms.workspaceId, workspaceId),
                isPlatformWide
              )
            : isPlatformWide;

        const supportRoomsList = await db
          .select({
            id: supportRooms.id,
            slug: supportRooms.slug,
            name: supportRooms.name,
            description: supportRooms.description,
            status: supportRooms.status,
            statusMessage: supportRooms.statusMessage,
            workspaceId: supportRooms.workspaceId,
            conversationId: supportRooms.conversationId,
            lastMessageAt: chatConversations.lastMessageAt,
          })
          .from(supportRooms)
          .leftJoin(
            chatConversations,
            eq(supportRooms.conversationId, chatConversations.id)
          )
          .where(supportRoomConditions);

        for (const room of supportRoomsList) {
          const isPlatformWide = !room.workspaceId || room.workspaceId === 'system';

          // The universal Help Desk room (slug='helpdesk') is the canonical CoAIleague support room.
          // It is platform-wide and visible to ALL authenticated users — HelpAI is always present.
          // All other platform-wide rooms are still staff-only.
          const isUniversalHelpDesk = room.slug === 'helpdesk';
          if (isPlatformWide && !isPlatformAdmin && !isUniversalHelpDesk) continue;

          const userLeftThis = room.conversationId && leftConversationIds.has(room.conversationId);
          if (userLeftThis && !isPlatformWide) continue;

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
            const dbCount = countResult?.count || 0;
            // Override with live WebSocket presence count when available (more accurate)
            const liveCount = room.conversationId ? roomPresence.getMemberCount(room.conversationId) : 0;
            participantsCount = Math.max(dbCount, liveCount);
          }

          const preview = await getLastMessagePreview(room.conversationId);
          const unreadCount = requireAuth ? await getConversationUnreadCount(room.conversationId, userId!) : 0;

          rooms.push({
            roomId: room.id,
            name: room.name,
            slug: room.slug,
            type: 'support',
            description: room.description || 'Professional platform support available 24/7',
            participantsCount,
            lastMessageAt: room.lastMessageAt,
            lastMessage: preview.lastMessage,
            lastMessageSender: preview.lastMessageSender,
            unreadCount,
            status: room.status,
            statusMessage: room.statusMessage,
            roomType: 'support_room',
            isPlatformOwned: isPlatformWide,
            isPersistent: true,
          });
        }
      } catch (error) {
        log.error("[GET /api/chat/rooms] Error fetching support rooms:", error);
      }

      // ========================================================================
      // 1b. USER'S PERSONAL SUPPORT TICKET (dm_support) - End users only
      // Each user gets their own private support conversation. It stays visible
      // for 24 hours after the last message (WhatsApp-style: if ticket is open
      // and they rejoin, triage continues; otherwise fresh ticket on next visit).
      // Platform staff see the full shared queue above — they don't need this.
      // ========================================================================
      if (!isPlatformAdmin && requireAuth && userId) {
        try {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

          const userTickets = await db
            .select({
              id: chatConversations.id,
              subject: chatConversations.subject,
              status: chatConversations.status,
              lastMessageAt: chatConversations.lastMessageAt,
              createdAt: chatConversations.createdAt,
              workspaceId: chatConversations.workspaceId,
            })
            .from(chatConversations)
            .innerJoin(
              chatParticipants,
              and(
                eq(chatParticipants.conversationId, chatConversations.id),
                eq(chatParticipants.participantId, userId),
                eq(chatParticipants.isActive, true)
              )
            )
            .where(
              and(
                eq(chatConversations.conversationType, 'dm_support'),
                // Only show open/active tickets; closed/resolved ones are done
                sql`${chatConversations.status} NOT IN ('closed', 'resolved')`,
                // 24-hour freshness window: ticket must have activity or be newly created
                or(
                  gte(chatConversations.lastMessageAt, twentyFourHoursAgo),
                  gte(chatConversations.createdAt, twentyFourHoursAgo)
                )
              )
            )
            .orderBy(desc(chatConversations.lastMessageAt))
            .limit(1);

          for (const ticket of userTickets) {
            const preview = await getLastMessagePreview(ticket.id);
            const unreadCount = await getConversationUnreadCount(ticket.id, userId);
            rooms.push({
              roomId: ticket.id,
              name: 'My Support Ticket',
              slug: 'my-support-ticket',
              type: 'support',
              description: ticket.subject || 'Your open support session with HelpAI',
              participantsCount: 2,
              lastMessageAt: ticket.lastMessageAt,
              lastMessage: preview.lastMessage,
              lastMessageSender: preview.lastMessageSender,
              unreadCount,
              status: ticket.status,
              statusMessage: null,
              roomType: 'support_ticket',
              isPlatformOwned: true,
              isPersistent: false,
              isUserTicket: true,
              conversationType: 'dm_support',
            });
          }
        } catch (error) {
          log.error("[GET /api/chat/rooms] Error fetching user support ticket:", error);
        }
      }

      // ========================================================================
      // 2. ORGANIZATION CHAT ROOMS (type: 'org') - Workspace-scoped or all for platform admins
      // ========================================================================
      if (workspaceId || isPlatformAdmin) {
      try {
        const orgRoomCondition = isPlatformAdmin
          ? undefined
          : eq(organizationChatRooms.workspaceId, workspaceId!);

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
          .where(orgRoomCondition);

        for (const room of orgRooms) {
          if (!isPlatformAdmin && room.conversationId && leftConversationIds.has(room.conversationId)) continue;

          const [countResult] = await db
            .select({ count: count() })
            .from(organizationRoomMembers)
            .where(eq(organizationRoomMembers.roomId, room.id));
          const participantsCount = countResult?.count || 0;

          const preview = await getLastMessagePreview(room.conversationId);
          const unreadCount = await getConversationUnreadCount(room.conversationId, userId!);

          rooms.push({
            roomId: room.id,
            name: room.roomName,
            slug: room.roomSlug,
            type: 'org',
            description: 'Organization workspace chatroom',
            participantsCount,
            lastMessageAt: room.lastMessageAt,
            lastMessage: preview.lastMessage,
            lastMessageSender: preview.lastMessageSender,
            unreadCount,
            status: room.status,
            roomType: 'organization_room',
            isPlatformOwned: false,
            isPersistent: false,
            isDynamic: true,
          });
        }
      } catch (error) {
        log.error("[GET /api/chat/rooms] Error fetching org rooms:", error);
      }
      } // End of workspaceId check for org rooms

      // ========================================================================
      // 3. GENERAL CHAT CONVERSATIONS (work, meeting rooms) - Workspace-scoped or all for platform admins
      // ========================================================================
      if (workspaceId || isPlatformAdmin) {
      try {
        // Exclude any conversations already shown as support rooms (prevents duplicates)
        const supportRoomConvRows = await db
          .select({ conversationId: supportRooms.conversationId })
          .from(supportRooms)
          .where(isNotNull(supportRooms.conversationId));
        const supportConvIds = supportRoomConvRows
          .map(r => r.conversationId)
          .filter(Boolean) as string[];

        const generalRoomConditions = isPlatformAdmin
          ? and(
              eq(chatConversations.status, 'active'),
              inArray(chatConversations.conversationType, ['open_chat', 'dm_user', 'shift_chat']),
              supportConvIds.length > 0 ? notInArray(chatConversations.id, supportConvIds) : undefined,
            )
          : and(
              eq(chatConversations.workspaceId, workspaceId!),
              eq(chatConversations.status, 'active'),
              inArray(chatConversations.conversationType, ['open_chat', 'dm_user', 'shift_chat']),
              supportConvIds.length > 0 ? notInArray(chatConversations.id, supportConvIds) : undefined,
              or(
                and(
                  eq(chatParticipants.participantId, userId),
                  eq(chatParticipants.isActive, true)
                ),
                inArray(chatConversations.visibility, ['public', 'workspace'])
              )
            );

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
          .where(generalRoomConditions);

        for (const item of generalRooms) {
          const conv = item.conversation;
          if (!isPlatformAdmin && leftConversationIds.has(conv.id)) continue;
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

          const isDMConversation = conv.conversationType === 'dm_user';
          let roomType = isDMConversation ? 'dm' : 'work';
          if (
            !isDMConversation &&
            conv.subject &&
            /meeting|stand.?up|team|sync|huddle/i.test(conv.subject)
          ) {
            roomType = 'meeting';
          }

          const isShiftRoom = conv.conversationType === 'shift_chat';
          
          const preview = await getLastMessagePreview(conv.id);
          const unreadCount = await getConversationUnreadCount(conv.id, userId!);

          let displayName = conv.subject || 'Untitled';
          if (isDMConversation) {
            const otherParticipantId = conv.customerId === userId ? conv.supportAgentId : conv.customerId;
            if (otherParticipantId) {
              const [otherUser] = await db
                .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
                .from(users)
                .where(eq(users.id, otherParticipantId))
                .limit(1);
              if (otherUser) {
                displayName = `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || otherUser.email || 'User';
              }
            }
          }

          rooms.push({
            roomId: conv.id,
            name: displayName,
            slug: conv.id.toLowerCase().slice(0, 20),
            type: roomType,
            description: isShiftRoom 
              ? 'Shift coordination chat - closes when shift ends'
              : isDMConversation ? 'Direct message' : 'Team conversation',
            participantsCount,
            lastMessageAt: conv.lastMessageAt,
            lastMessage: preview.lastMessage,
            lastMessageSender: preview.lastMessageSender,
            unreadCount,
            status: conv.status,
            roomType: 'conversation',
            isParticipant: !!item.participant,
            participantRole: item.participant?.participantRole || null,
            isPlatformOwned: false,
            isPersistent: false,
            isDynamic: true,
            isShiftRoom,
            conversationType: conv.conversationType,
          });
        }
      } catch (error) {
        log.error("[GET /api/chat/rooms] Error fetching general rooms:", error);
      }
      } // End of workspaceId check for general rooms

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
    } catch (error: unknown) {
      log.error("[GET /api/chat/rooms] Error listing rooms:", error);
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
          authReq.workspaceRole || ROLES.EMPLOYEE,
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
          authReq.workspaceRole || ROLES.EMPLOYEE,
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
        authReq.workspaceRole || ROLES.EMPLOYEE,
        "user_joined",
        `${userName} joined the room`,
        { participantRole: 'member' },
        authReq.ip,
        authReq.get("user-agent")
      );

      res.json({ success: true, message: "Joined room successfully" });
    } catch (error: unknown) {
      log.error("Error joining room:", error);
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
          canInviteOthers: role === 'org_admin' || role === 'org_owner' || role === 'co_owner',
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
          authReq.workspaceRole || ROLES.EMPLOYEE,
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
    } catch (error: unknown) {
      log.error("Error adding participants:", error);
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
        authReq.workspaceRole || ROLES.EMPLOYEE,
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
    } catch (error: unknown) {
      log.error("Error removing participant:", error);
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
            authReq.workspaceRole || ROLES.EMPLOYEE,
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
        } catch (error: unknown) {
          errors.push({
            roomId,
            error: sanitizeError(error) || 'Failed to join room',
          });
        }
      }

      res.json({
        success: errors.length === 0,
        results,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: unknown) {
      log.error("Error bulk joining rooms:", error);
      res.status(500).json({ error: "Failed to join rooms" });
    }
  }
);

// ============================================================================
// GET ROOM STATS - GET /api/chat/rooms/:roomId/stats
// ============================================================================
// Returns: { participantsCount, lastActivity, messageCount, roomType, activitySummary }
router.get(
  "/:roomId/stats",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      // Get conversation with multi-tenant filtering
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

      // Check user has access to room
      const [userParticipant] = await db
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

      // Allow access if user is participant, or room is public/workspace-visible
      if (!userParticipant && !['public', 'workspace'].includes(conversation.visibility || 'workspace')) {
        return res.status(403).json({ error: "Access denied to this room" });
      }

      // Get participant statistics
      const [participantStats] = await db
        .select({ 
          activeCount: count(),
          totalCount: sql`COUNT(*) OVER () as total_count`
        })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.isActive, true)
          )
        )
        .limit(1);

      const activeParticipants = participantStats?.activeCount || 0;

      // Get total participants (including inactive)
      const [totalParticipantsResult] = await db
        .select({ count: count() })
        .from(chatParticipants)
        .where(eq(chatParticipants.conversationId, roomId));

      const totalParticipants = totalParticipantsResult?.count || 0;

      // Get message count and last activity
      const [messageStats] = await db
        .select({
          messageCount: count(),
          lastMessageAt: sql<string>`MAX(${chatMessages.createdAt})`
        })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, roomId));

      const messageCount = messageStats?.messageCount || 0;
      const lastMessageAt = messageStats?.lastMessageAt;

      // Determine room type based on conversation metadata
      let roomType = 'general';
      if (conversation.conversationType === 'shift_chat') {
        roomType = 'shift';
      } else if (conversation.conversationType === 'dm_user' || conversation.conversationType === 'dm_support') {
        roomType = 'direct';
      } else if (conversation.subject && /meeting|stand.?up|team|sync|huddle/i.test(conversation.subject)) {
        roomType = 'meeting';
      }

      // Get participant role distribution
      const participantRoles = await db
        .select({
          role: chatParticipants.participantRole,
          count: count()
        })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, roomId),
            eq(chatParticipants.isActive, true)
          )
        )
        .groupBy(chatParticipants.participantRole);

      const roleDistribution: Record<string, number> = {};
      for (const row of participantRoles) {
        roleDistribution[row.role || 'member'] = row.count;
      }

      // Get recent join/leave events
      const recentEvents = await db
        .select()
        .from(roomEvents)
        .where(
          and(
            eq(roomEvents.conversationId, roomId),
            inArray(roomEvents.eventType, ['user_joined', 'user_left', 'user_removed', 'user_rejoined'])
          )
        )
        .orderBy(desc(roomEvents.createdAt))
        .limit(10);

      // Calculate activity metrics
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [recentActivityCount] = await db
        .select({ count: count() })
        .from(roomEvents)
        .where(
          and(
            eq(roomEvents.conversationId, roomId),
            eq(roomEvents.eventType, 'message_sent')
          )
        );

      const [hourlyActivityCount] = await db
        .select({ count: count() })
        .from(roomEvents)
        .where(
          and(
            eq(roomEvents.conversationId, roomId),
            eq(roomEvents.eventType, 'message_sent'),
            gte(roomEvents.createdAt, oneHourAgo)
          )
        );

      const [dailyActivityCount] = await db
        .select({ count: count() })
        .from(roomEvents)
        .where(
          and(
            eq(roomEvents.conversationId, roomId),
            eq(roomEvents.eventType, 'message_sent'),
            gte(roomEvents.createdAt, oneDayAgo)
          )
        );

      res.json({
        success: true,
        roomId,
        roomName: conversation.subject || 'Untitled Room',
        roomType,
        conversationType: conversation.conversationType,
        visibility: conversation.visibility,
        status: conversation.status,
        priority: conversation.priority || 'normal',
        participants: {
          active: activeParticipants,
          total: totalParticipants,
          roleDistribution
        },
        messages: {
          total: messageCount,
          lastActivityAt: lastMessageAt || conversation.createdAt,
          activityLastHour: hourlyActivityCount?.count || 0,
          activityLast24Hours: dailyActivityCount?.count || 0
        },
        room: {
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          autoCloseAt: conversation.autoCloseAt,
          shiftId: conversation.shiftId || undefined
        },
        recentEvents: recentEvents.map(event => ({
          eventType: event.eventType,
          actorName: event.actorName,
          description: event.description,
          timestamp: event.createdAt
        }))
      });
    } catch (error: unknown) {
      log.error("Error fetching room stats:", error);
      res.status(500).json({ error: "Failed to fetch room statistics" });
    }
  }
);

// ============================================================================
// UPDATE ROOM - PATCH /api/chat/rooms/:roomId
// ============================================================================
// Allows updating: subject, visibility, status, priority
router.patch(
  "/:roomId",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const { subject, visibility, status, priority } = req.body;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      // Get conversation with multi-tenant filtering
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

      // Check permissions - only room owner/admin or workspace admin can update
      const canManage = await canManageRoom(roomId, userId, workspaceId, authReq.workspaceRole);
      if (!canManage) {
        return res.status(403).json({ error: "Only room admins/owners can update room settings" });
      }

      // Validate inputs if provided
      if (visibility && !['workspace', 'public', 'private'].includes(visibility)) {
        return res.status(400).json({ error: "Invalid visibility value" });
      }

      if (status && !['active', 'archived', 'closed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      if (priority && !['low', 'normal', 'high', 'urgent'].includes(priority)) {
        return res.status(400).json({ error: "Invalid priority value" });
      }

      // Build update object
      const updateData: any = {};
      const changes: string[] = [];

      if (subject !== undefined && subject !== null && subject !== conversation.subject) {
        updateData.subject = subject;
        changes.push(`subject changed from "${conversation.subject}" to "${subject}"`);
      }

      if (visibility && visibility !== conversation.visibility) {
        // Only workspace admin or owner can change visibility
        if (!(ADMIN_ROLES as readonly string[]).includes(authReq.workspaceRole || "")) {
          return res.status(403).json({ error: "Only workspace admins can change visibility" });
        }
        updateData.visibility = visibility;
        changes.push(`visibility changed from "${conversation.visibility}" to "${visibility}"`);
      }

      if (status && status !== conversation.status) {
        updateData.status = status;
        changes.push(`status changed from "${conversation.status}" to "${status}"`);
      }

      if (priority && priority !== conversation.priority) {
        updateData.priority = priority;
        changes.push(`priority changed from "${conversation.priority}" to "${priority}"`);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No changes to apply" });
      }

      // Update conversation
      updateData.updatedAt = new Date();
      await db
        .update(chatConversations)
        .set(updateData)
        .where(eq(chatConversations.id, roomId));

      // Create audit event
      await createRoomEvent(
        workspaceId,
        roomId,
        userId,
        userName,
        authReq.workspaceRole || ROLES.EMPLOYEE,
        "room_settings_updated",
        `${userName} updated room settings: ${changes.join(', ')}`,
        updateData,
        authReq.ip,
        authReq.get("user-agent")
      );

      res.json({
        success: true,
        message: "Room settings updated successfully",
        changes: changes.length,
        updatedFields: Object.keys(updateData)
      });
    } catch (error: unknown) {
      log.error("Error updating room:", error);
      res.status(500).json({ error: "Failed to update room" });
    }
  }
);

// ============================================================================
// DELETE ROOM - DELETE /api/chat/rooms/:roomId
// ============================================================================
// Hard deletes room and associated data with cascade
router.delete(
  "/:roomId",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";

      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }

      const resolved = await resolveRoomToConversationId(roomId, workspaceId);
      if (!resolved) {
        return res.status(404).json({ error: "Room not found" });
      }

      const conversationId = resolved.conversationId;

      const [conversation] = await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
        .limit(1);

      const isWorkspaceAdmin = (ADMIN_ROLES as readonly string[]).includes(authReq.workspaceRole || "");
      const user = authReq.user as any;
      const platformRole = user.platformRole || user.role;
      const { hasPlatformWideAccess } = await import('../rbac');

      if (!conversation) {
        if (!isWorkspaceAdmin && !hasPlatformWideAccess(platformRole)) {
          return res.status(403).json({ error: "Only workspace admins can clean up orphaned rooms" });
        }
        if (resolved.roomType === 'org') {
          await db.delete(organizationRoomMembers).where(eq(organizationRoomMembers.roomId, roomId));
          await db.delete(organizationChatRooms).where(eq(organizationChatRooms.id, roomId));
        }
        return res.json({
          success: true,
          message: "Orphaned room cleaned up successfully",
          deletedRoom: { id: roomId, name: 'Orphaned Room', participantCount: 0 }
        });
      }

      const canManage = await canManageRoom(conversationId, userId, workspaceId, authReq.workspaceRole);

      if (!canManage && !isWorkspaceAdmin && !hasPlatformWideAccess(platformRole)) {
        return res.status(403).json({ error: "Only workspace admins or room owners can delete rooms" });
      }

      const roomName = conversation.subject || 'Untitled Room';
      const participantCount = (await db
        .select({ count: count() })
        .from(chatParticipants)
        .where(eq(chatParticipants.conversationId, conversationId)))[0]?.count || 0;

      await db
        .delete(roomEvents)
        .where(eq(roomEvents.conversationId, conversationId));

      await db
        .delete(typingIndicators)
        .where(eq(typingIndicators.conversationId, conversationId));

      const messages = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conversationId));

      if (messages.length > 0) {
        const messageIds = messages.map(m => m.id);
        await db
          .delete(messageReactions)
          .where(inArray(messageReactions.messageId, messageIds));
      }

      await db
        .delete(chatMessages)
        .where(eq(chatMessages.conversationId, conversationId));

      await db
        .delete(chatParticipants)
        .where(eq(chatParticipants.conversationId, conversationId));

      if (resolved.roomType === 'org') {
        await db
          .delete(organizationRoomMembers)
          .where(eq(organizationRoomMembers.roomId, roomId));
        await db
          .delete(organizationChatRooms)
          .where(eq(organizationChatRooms.id, roomId));
      }

      await db
        .delete(chatConversations)
        .where(eq(chatConversations.id, conversationId));

      try {
        await createRoomEvent(
          workspaceId,
          conversationId,
          userId,
          userName,
          authReq.workspaceRole || ROLES.EMPLOYEE,
          "room_deleted",
          `${userName} deleted room: ${roomName} (${participantCount} participants)`,
          {
            roomName,
            participantCount,
            conversationType: conversation.conversationType,
            visibility: conversation.visibility
          },
          authReq.ip,
          authReq.get("user-agent")
        );
      } catch (auditErr) {
        log.warn("[Room Delete] Audit event failed (room already deleted):", auditErr);
      }

      broadcastToWorkspace(workspaceId, {
        type: 'room_deleted',
        roomId,
        conversationId,
        roomName,
        deletedBy: userId,
      });

      res.json({
        success: true,
        message: "Room deleted successfully",
        deletedRoom: {
          id: roomId,
          name: roomName,
          participantCount
        }
      });
    } catch (error: unknown) {
      log.error("Error deleting room:", error);
      res.status(500).json({ error: "Failed to delete room" });
    }
  }
);

// ============================================================================
// PLATFORM-WIDE ROOMS - GET /api/chat/rooms/platform/all (Support Staff Only)
// ============================================================================
// Returns all rooms across all workspaces for support staff moderation
router.get(
  "/platform/all",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.id;
      const platformRole = (authReq.user as any)?.platformRole || authReq.user?.role;

      if (!userId) {
        return res.status(403).json({ error: "Authentication required" });
      }

      // Only support staff can access platform-wide rooms
      const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
      if (!platformRole || !supportRoles.includes(platformRole)) {
        return res.status(403).json({ error: "Support staff access required" });
      }

      const { orgFilter, categoryFilter, search, status: statusFilter } = req.query;

      const rooms: any[] = [];

      // Get all active conversations across all workspaces
      let query = db
        .select({
          id: chatConversations.id,
          subject: chatConversations.subject,
          conversationType: chatConversations.conversationType,
          visibility: chatConversations.visibility,
          status: chatConversations.status,
          workspaceId: chatConversations.workspaceId,
          createdAt: chatConversations.createdAt,
          lastMessageAt: chatConversations.lastMessageAt,
          autoCloseAt: chatConversations.autoCloseAt,
          customerId: chatConversations.customerId,
          customerName: chatConversations.customerName,
        })
        .from(chatConversations)
        .where(
          statusFilter && statusFilter !== 'all'
            ? eq(chatConversations.status, statusFilter as string)
            : sql`1=1`
        );

      const allConversations = await query;

      for (const conv of allConversations) {
        // Apply org filter
        if (orgFilter && orgFilter !== 'all' && conv.workspaceId !== orgFilter) {
          continue;
        }

        // Apply category filter
        if (categoryFilter && categoryFilter !== 'all') {
          const typeMap: Record<string, string[]> = {
            'support': ['dm_support'],
            'shift': ['shift_chat'],
            'work': ['open_chat', 'dm_user'],
            'meeting': ['meeting'],
          };
          if (typeMap[categoryFilter as string] && !typeMap[categoryFilter as string].includes(conv.conversationType || '')) {
            continue;
          }
        }

        // Apply search filter
        if (search && typeof search === 'string' && search.trim()) {
          const searchLower = search.toLowerCase();
          const nameMatch = (conv.subject || '').toLowerCase().includes(searchLower);
          const creatorMatch = (conv.customerName || '').toLowerCase().includes(searchLower);
          if (!nameMatch && !creatorMatch) {
            continue;
          }
        }

        // Get participant count
        const [countResult] = await db
          .select({ count: count() })
          .from(chatParticipants)
          .where(
            and(
              eq(chatParticipants.conversationId, conv.id),
              eq(chatParticipants.isActive, true)
            )
          );

        rooms.push({
          id: conv.id,
          name: conv.subject || 'Untitled Room',
          conversationType: conv.conversationType,
          visibility: conv.visibility,
          status: conv.status,
          workspaceId: conv.workspaceId,
          participantsCount: countResult?.count || 0,
          createdAt: conv.createdAt,
          lastMessageAt: conv.lastMessageAt,
          autoCloseAt: conv.autoCloseAt,
          createdBy: conv.customerName || 'Unknown',
          createdById: conv.customerId,
        });
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
        filters: {
          orgFilter: orgFilter || 'all',
          categoryFilter: categoryFilter || 'all',
          search: search || '',
          statusFilter: statusFilter || 'all',
        }
      });
    } catch (error: unknown) {
      log.error("[GET /api/chat/rooms/platform/all] Error:", error);
      res.status(500).json({ error: "Failed to list platform rooms" });
    }
  }
);

// ============================================================================
// MODERATE ROOM - POST /api/chat/rooms/:roomId/moderate (Support Staff Only)
// ============================================================================
// Allows support staff to suspend, close, or take action on any room
router.post(
  "/:roomId/moderate",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const { action, reason } = req.body;
      const userId = authReq.user?.id;
      const platformRole = (authReq.user as any)?.platformRole || authReq.user?.role;
      const userName = (authReq.user as any)?.firstName && (authReq.user as any)?.lastName
        ? `${(authReq.user as any).firstName} ${(authReq.user as any).lastName}`
        : authReq.user?.email || "Support Staff";

      if (!userId) {
        return res.status(403).json({ error: "Authentication required" });
      }

      // Only support staff can moderate
      const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
      if (!platformRole || !supportRoles.includes(platformRole)) {
        return res.status(403).json({ error: "Support staff access required" });
      }

      // Validate action
      const validActions = ['suspend', 'close', 'reopen', 'archive', 'warn'];
      if (!action || !validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Valid actions: ${validActions.join(', ')}` });
      }

      // Get conversation (no workspace filter for support staff)
      const [conversation] = await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.id, roomId))
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Room not found" });
      }

      // Map action to status
      const actionStatusMap: Record<string, string> = {
        'suspend': 'suspended',
        'close': 'closed',
        'reopen': 'active',
        'archive': 'archived',
        'warn': conversation.status || 'active', // Warn doesn't change status
      };

      const newStatus = actionStatusMap[action];

      // Update conversation status
      if (action !== 'warn') {
        await db
          .update(chatConversations)
          .set({ 
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(chatConversations.id, roomId));
      }

      // Create audit event
      await createRoomEvent(
        conversation.workspaceId || 'platform',
        roomId,
        userId,
        userName,
        platformRole,
        `room_${action}`,
        `Support staff ${userName} performed ${action} on room: ${conversation.subject || 'Untitled'}${reason ? ` - Reason: ${reason}` : ''}`,
        {
          action,
          reason,
          previousStatus: conversation.status,
          newStatus,
          moderatorRole: platformRole,
        },
        authReq.ip,
        authReq.get("user-agent")
      );

      res.json({
        success: true,
        message: `Room ${action} successful`,
        room: {
          id: roomId,
          name: conversation.subject,
          previousStatus: conversation.status,
          newStatus,
          action,
          reason,
        }
      });
    } catch (error: unknown) {
      log.error("Error moderating room:", error);
      res.status(500).json({ error: "Failed to moderate room" });
    }
  }
);

// ============================================================================
// CLOSE ROOM - POST /api/chat/rooms/:roomId/close (Manager+ Only)
// ============================================================================
// Allows org owners and managers to force-close a room using 7-step pipeline
router.post(
  "/:roomId/close",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const { reason } = req.body;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;

      if (!userId) {
        return res.status(403).json({ error: "Authentication required" });
      }

      if (!workspaceId) {
        return res.status(403).json({ error: "Organization membership required" });
      }

      const resolved = await resolveRoomToConversationId(roomId, workspaceId);
      if (!resolved) {
        return res.status(404).json({ error: "Room not found" });
      }

      const user = authReq.user as any;
      const { hasManagerAccess } = await import('../rbac');
      const workspaceRole = authReq.workspaceRole || user.workspaceRole || 'employee';
      
      const platformRole = user.platformRole || user.role;
      const { hasPlatformWideAccess } = await import('../rbac');

      if (resolved.roomType === 'support') {
        if (!hasPlatformWideAccess(platformRole)) {
          return res.status(403).json({ error: "Only support staff can close platform channels" });
        }
      } else if (!hasManagerAccess(workspaceRole) && !hasPlatformWideAccess(platformRole)) {
        return res.status(403).json({ error: "Manager or higher role required to close rooms" });
      }

      const userName = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.email || "Manager";

      const { closeRoom } = await import('../services/roomLifecycleService');
      const result = await closeRoom({
        roomId: resolved.conversationId,
        workspaceId,
        actorId: userId,
        actorName: userName,
        actorRole: workspaceRole,
        reason: reason || undefined,
        initiatorType: 'user',
        ipAddress: authReq.ip,
        userAgent: authReq.get("user-agent"),
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      if (resolved.roomType === 'org') {
        await db.update(organizationChatRooms)
          .set({ status: 'suspended', suspendedReason: reason || 'Closed by manager' })
          .where(eq(organizationChatRooms.id, roomId));
      }

      res.json({
        success: true,
        message: "Room closed successfully",
        ...result.result,
      });
    } catch (error: unknown) {
      log.error("Error closing room:", error);
      res.status(500).json({ error: "Failed to close room" });
    }
  }
);

// ============================================================================
// REOPEN ROOM - POST /api/chat/rooms/:roomId/reopen (Manager+ Only)
// ============================================================================
// Allows org owners and managers to reopen a closed room using 7-step pipeline
router.post(
  "/:roomId/reopen",
  roomLimiter,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { roomId } = req.params;
      const { reason } = req.body;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId;

      if (!userId) {
        return res.status(403).json({ error: "Authentication required" });
      }

      if (!workspaceId) {
        return res.status(403).json({ error: "Organization membership required" });
      }

      const resolved = await resolveRoomToConversationId(roomId, workspaceId);
      if (!resolved) {
        return res.status(404).json({ error: "Room not found" });
      }

      const user = authReq.user as any;
      const { hasManagerAccess } = await import('../rbac');
      const workspaceRole = authReq.workspaceRole || user.workspaceRole || 'employee';
      
      const platformRole = user.platformRole || user.role;
      const { hasPlatformWideAccess } = await import('../rbac');

      if (resolved.roomType === 'support') {
        if (!hasPlatformWideAccess(platformRole)) {
          return res.status(403).json({ error: "Only support staff can reopen platform channels" });
        }
      } else if (!hasManagerAccess(workspaceRole) && !hasPlatformWideAccess(platformRole)) {
        return res.status(403).json({ error: "Manager or higher role required to reopen rooms" });
      }

      const userName = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.email || "Manager";

      const { reopenRoom } = await import('../services/roomLifecycleService');
      const result = await reopenRoom({
        roomId: resolved.conversationId,
        workspaceId,
        actorId: userId,
        actorName: userName,
        actorRole: workspaceRole,
        reason: reason || undefined,
        initiatorType: 'user',
        ipAddress: authReq.ip,
        userAgent: authReq.get("user-agent"),
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      if (resolved.roomType === 'org') {
        await db.update(organizationChatRooms)
          .set({ status: 'active', suspendedReason: null, suspendedAt: null, suspendedBy: null })
          .where(eq(organizationChatRooms.id, roomId));
      }

      res.json({
        success: true,
        message: "Room reopened successfully",
        ...result.result,
      });
    } catch (error: unknown) {
      log.error("Error reopening room:", error);
      res.status(500).json({ error: "Failed to reopen room" });
    }
  }
);

// ============================================================================
// GET WORKSPACES LIST - GET /api/chat/rooms/workspaces (Support Staff Only)
// ============================================================================
// Returns list of workspaces for filtering
router.get(
  "/workspaces",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const platformRole = (authReq.user as any)?.platformRole || authReq.user?.role;

      // Only support staff can access
      const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
      if (!platformRole || !supportRoles.includes(platformRole)) {
        return res.status(403).json({ error: "Support staff access required" });
      }

      const workspacesList = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.organizationId, // Use organizationId as slug
        })
        .from(workspaces)
        .where(eq(workspaces.subscriptionStatus, 'active'));

      res.json({
        success: true,
        workspaces: workspacesList,
      });
    } catch (error: unknown) {
      log.error("Error fetching workspaces:", error);
      res.status(500).json({ error: "Failed to fetch workspaces" });
    }
  }
);

// ============================================================================
// GET ALL ORG CHATROOMS - GET /api/chat/rooms/all-orgs (Support Staff Only)
// ============================================================================
router.get(
  "/all-orgs",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const platformRole = (authReq.user as any)?.platformRole || authReq.user?.role;
      const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
      
      if (!platformRole || !supportRoles.includes(platformRole)) {
        return res.status(403).json({ error: "Support staff access required" });
      }

      const rooms = await db
        .select({
          id: organizationChatRooms.id,
          name: organizationChatRooms.name,
          workspaceId: organizationChatRooms.workspaceId,
          roomType: organizationChatRooms.roomType,
          createdAt: organizationChatRooms.createdAt,
        })
        .from(organizationChatRooms)
        .leftJoin(workspaces, eq(organizationChatRooms.workspaceId, workspaces.id));

      const roomsWithDetails = await Promise.all(
        rooms.map(async (room) => {
          const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, room.workspaceId)).limit(1);
          const [memberResult] = await db.select({ count: count() }).from(organizationRoomMembers).where(eq(organizationRoomMembers.roomId, room.id));
          const [messageResult] = await db.select({ count: count() }).from(chatMessages).where(eq(chatMessages.conversationId, room.id));
          const [lastMessage] = await db.select({ createdAt: chatMessages.createdAt }).from(chatMessages).where(eq(chatMessages.conversationId, room.id)).orderBy(desc(chatMessages.createdAt)).limit(1);

          const lastActivityDate = lastMessage?.createdAt || room.createdAt;
          const idleThreshold = Date.now() - 30 * 60 * 1000;
          const status = lastActivityDate && new Date(lastActivityDate).getTime() > idleThreshold ? 'active' : 'idle';

          return {
            ...room,
            workspaceName: workspace?.name || 'Unknown',
            memberCount: memberResult?.count || 0,
            messageCount: messageResult?.count || 0,
            lastActivity: lastMessage?.createdAt,
            status,
          };
        })
      );

      res.json({ success: true, rooms: roomsWithDetails });
    } catch (error: unknown) {
      log.error("Error fetching all org chatrooms:", error);
      res.status(500).json({ error: "Failed to fetch chatrooms" });
    }
  }
);

// ============================================================================
// HELPAI TICKET CHECK - GET /api/chat/rooms/:roomId/tickets (Check open tickets on room entry)
// ============================================================================
router.get(
  "/:roomId/tickets",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.userId;
    const { roomId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { helpAIBotService } = await import("../services/helpai/helpAIBotService");
      
      const workspaceId = authReq.workspaceId;
      const ticketResult = await helpAIBotService.checkOpenTicketsForUser(userId, workspaceId);
      
      res.json({
        success: true,
        roomId,
        hasOpenTickets: ticketResult.hasOpenTickets,
        tickets: ticketResult.tickets,
        greeting: ticketResult.message,
      });
    } catch (error: unknown) {
      log.error("Error checking tickets:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to check tickets",
        greeting: "Welcome! How can I help you today?"
      });
    }
  }
);

// ============================================================================
// HELPAI USER ROLE VERIFICATION - GET /api/chat/rooms/:roomId/verify-role
// ============================================================================
router.get(
  "/:roomId/verify-role",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.userId;
    const workspaceId = authReq.workspaceId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { helpAIBotService } = await import("../services/helpai/helpAIBotService");
      
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: 'workspaceId required for role verification' });
      }
      const roleResult = await helpAIBotService.verifyUserOrgRole(userId, workspaceId);
      
      res.json({
        success: true,
        ...roleResult,
      });
    } catch (error: unknown) {
      log.error("Error verifying role:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to verify role",
        isVerified: false,
        role: null,
        canAccessQueue: false,
        canEscalate: false,
      });
    }
  }
);

// ============================================================================
// EXPORT CHAT HISTORY - GET /api/chat/rooms/:roomId/export (Support Staff Only)
// ============================================================================
router.get(
  "/:roomId/export",
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { roomId } = req.params;

    try {
      const platformRole = (authReq.user as any)?.platformRole || authReq.user?.role;
      const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
      
      if (!platformRole || !supportRoles.includes(platformRole)) {
        return res.status(403).json({ error: "Support staff access required" });
      }

      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, roomId))
        .orderBy(chatMessages.createdAt);

      const [room] = await db
        .select()
        .from(organizationChatRooms)
        .where(eq(organizationChatRooms.id, roomId))
        .limit(1);

      const exportData = {
        exportedAt: new Date().toISOString(),
        exportedBy: authReq.userId,
        roomId,
        roomName: room?.name || 'Unknown Room',
        messageCount: messages.length,
        messages: messages.map(m => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          content: m.content,
          messageType: m.messageType,
          createdAt: m.createdAt,
        })),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="chat-export-${roomId}-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error: unknown) {
      log.error("Error exporting chat history:", error);
      res.status(500).json({ error: "Failed to export chat history" });
    }
  }
);

// ============================================================================
// NUKE ROOM - POST /api/chat/rooms/:roomId/nuke (Platform Staff Only)
// Archives all messages, removes participants, resets room to clean state
// ============================================================================
router.post(
  "/:roomId/nuke",
  async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.userId;
      const userPlatformRole = authReq.platformRole;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const platformStaffRoles = ['root_admin', 'deputy_admin', 'sysop', 'platform_admin'];
      if (!platformStaffRoles.includes(userPlatformRole || '')) {
        return res.status(403).json({ error: "Only platform staff (root/deputy_admin) can nuke rooms" });
      }

      const { roomId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "Reason is required for room nuke" });
      }

      const [room] = await db
        .select({ workspaceId: chatConversations.workspaceId })
        .from(chatConversations)
        .where(eq(chatConversations.id, roomId))
        .limit(1);

      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      const { chatParityService } = await import('../services/chatParityService');

      const nukeResult = await chatParityService.nukeRoom(roomId, room.workspaceId, userId, reason);

      if (nukeResult.success) {
        res.json({
          message: "Room nuked and reset successfully",
          archivedMessageCount: nukeResult.archivedMessageCount,
        });
      } else {
        res.status(500).json({ error: "Failed to nuke room" });
      }
    } catch (error: unknown) {
      log.error("Error nuking room:", error);
      res.status(500).json({ error: "Failed to nuke room" });
    }
  }
);

// ============================================================================
// CLOSE WITH MUTE - POST /api/chat/rooms/:roomId/close-with-mute
// Closes conversation and mutes end users (agent/management only)
// ============================================================================
router.post(
  "/:roomId/close-with-mute",
  async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.userId;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { roomId } = req.params;
      const { reason } = req.body;

      const [room] = await db
        .select({ workspaceId: chatConversations.workspaceId })
        .from(chatConversations)
        .where(eq(chatConversations.id, roomId))
        .limit(1);

      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      const [user] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const actorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown';

      const { chatParityService } = await import('../services/chatParityService');
      const result = await chatParityService.closeConversationWithMute(
        roomId, room.workspaceId, userId, actorName, reason
      );

      if (result.success) {
        res.json({ message: "Conversation closed and end users muted" });
      } else {
        res.status(500).json({ error: result.error || "Failed to close conversation" });
      }
    } catch (error: unknown) {
      log.error("Error closing with mute:", error);
      res.status(500).json({ error: "Failed to close conversation" });
    }
  }
);

// ============================================================================
// SYSTEM BUG ESCALATION - POST /api/chat/rooms/escalate-system-bug
// Escalates system bugs directly to root/deputy_root
// ============================================================================
router.post(
  "/escalate-system-bug",
  async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.userId;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const workspaceId = authReq.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "No workspace found" });

      const { description, errorContext, sessionId, conversationId } = req.body;

      if (!description) {
        return res.status(400).json({ error: "Description is required" });
      }

      const [user] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown';

      const { chatParityService } = await import('../services/chatParityService');
      const result = await chatParityService.escalateSystemBug({
        workspaceId,
        reportedBy: userId,
        reportedByName: userName,
        description,
        errorContext,
        sessionId,
        conversationId,
      });

      if (result) {
        res.json({
          message: "System bug escalated to root administrators",
          ticketNumber: result.ticketNumber,
          ticketId: result.ticketId,
        });
      } else {
        res.status(500).json({ error: "Failed to create escalation ticket" });
      }
    } catch (error: unknown) {
      log.error("Error escalating system bug:", error);
      res.status(500).json({ error: "Failed to escalate system bug" });
    }
  }
);

export default router;
