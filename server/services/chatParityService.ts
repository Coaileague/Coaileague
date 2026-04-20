/**
 * Chat Parity Service - Canonical Logic for WhatsApp/Messenger/IRCX Parity
 * =========================================================================
 * Implements all parity gaps identified against spec:
 * 
 * Gap 1: Platform credit pool funding for help desk (always platform-absorbed)
 * Gap 2: DM delete-for-me-only (WhatsApp/Messenger style)
 * Gap 3: Ticket requirement for support room entry
 * Gap 4: HelpAI self-spawning moderation bot
 * Gap 5: Room closure RBAC enforcement (org_owner/co_owner/manager only)
 * Gap 6: Cross-org join exception for parent-org managers
 * Gap 7: Room nuke/reset capability
 * Gap 8: system_bug escalation to root/deputy_root
 * 
 * Additional DM enhancements:
 * - Group DMs for parent org + sub-orgs (same org family only)
 * - No cross-org DMs except support/system bots
 * - Closed conversation muting (endusers can't chat, agent can reopen)
 */

import { db } from '../db';
import { 
  chatMessages, 
  chatConversations, 
  chatParticipants,
  supportTickets,
  roomEvents,
  users,
  workspaces,
  type ChatConversation,
  type ChatMessage,
} from '@shared/schema';
import { eq, and, or, sql, inArray, desc } from 'drizzle-orm';
import { SUPPORT_POOL_FEATURES } from './billing/tokenManager';
import { PLATFORM_SUPPORT_POOL_ID } from './billing/billingConstants';
import { createLogger } from '../lib/logger';
const log = createLogger('chatParityService');


const MANAGEMENT_ROLES = new Set([
  'org_owner', 'co_owner', 'org_admin', 'org_manager',
  'manager', 'department_manager', 'supervisor',
]);

const PLATFORM_STAFF_ROLES = new Set([
  'root_admin', 'deputy_admin', 'sysop', 'support_agent', 
  'support_manager', 'compliance_officer',
]);

const SYSTEM_BOT_SENDER_TYPES = new Set(['system', 'bot']);

export class ChatParityService {
  private static instance: ChatParityService;

  static getInstance(): ChatParityService {
    if (!ChatParityService.instance) {
      ChatParityService.instance = new ChatParityService();
    }
    return ChatParityService.instance;
  }

  // =========================================================================
  // GAP 1: Help desk always funded by platform pool
  // =========================================================================

  isHelpDeskFeature(featureKey: string): boolean {
    return SUPPORT_POOL_FEATURES.has(featureKey) ||
      featureKey.startsWith('helpai_') ||
      featureKey.startsWith('helpdesk_') ||
      featureKey.startsWith('bot_helpai_') ||
      featureKey === 'support_pool_chat' ||
      featureKey === 'support_pool_ticket';
  }

  getHelpDeskBillingTarget(): string {
    return PLATFORM_SUPPORT_POOL_ID;
  }

  shouldBypassOrgCredits(featureKey: string, roomMode?: string): boolean {
    if (this.isHelpDeskFeature(featureKey)) return true;
    if (roomMode === 'sup') return true;
    return false;
  }

  // =========================================================================
  // GAP 2: DM delete-for-me-only (WhatsApp/Messenger parity)
  // =========================================================================

  async deleteMessageForUser(
    messageId: string, 
    userId: string, 
    conversationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [message] = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, messageId),
            eq(chatMessages.conversationId, conversationId)
          )
        )
        .limit(1);

      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      const currentDeletedFor = (message.deletedForUserIds as string[]) || [];
      if (currentDeletedFor.includes(userId)) {
        return { success: true };
      }

      const updatedDeletedFor = [...currentDeletedFor, userId];

      await db
        .update(chatMessages)
        .set({
          deletedForUserIds: updatedDeletedFor,
          updatedAt: new Date(),
        })
        .where(eq(chatMessages.id, messageId));

      return { success: true };
    } catch (error: any) {
      log.error(`[ChatParity] deleteMessageForUser failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  async deleteMessageForEveryone(
    messageId: string, 
    userId: string, 
    conversationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [message] = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, messageId),
            eq(chatMessages.conversationId, conversationId)
          )
        )
        .limit(1);

      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      if (message.senderId !== userId) {
        return { success: false, error: 'Can only delete your own messages for everyone' };
      }

      await db
        .update(chatMessages)
        .set({
          isDeletedForEveryone: true,
          deletedForEveryoneAt: new Date(),
          deletedForEveryoneBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(chatMessages.id, messageId));

      return { success: true };
    } catch (error: any) {
      log.error(`[ChatParity] deleteMessageForEveryone failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  isMessageVisibleToUser(message: any, userId: string): boolean {
    if (message.isDeletedForEveryone) return false;
    const deletedFor = (message.deletedForUserIds as string[]) || [];
    if (deletedFor.includes(userId)) return false;
    return true;
  }

  // =========================================================================
  // GAP 3: Ticket requirement for support room entry
  // =========================================================================

  async verifyTicketForSupportEntry(
    userId: string, 
    roomId: string
  ): Promise<{ hasTicket: boolean; ticketNumber?: string; ticketId?: string }> {
    try {
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(
          and(
            eq(supportTickets.escalatedBy, userId),
            or(
              eq(supportTickets.status, 'open'),
              eq(supportTickets.status, 'in_progress')
            )
          )
        )
        .orderBy(desc(supportTickets.createdAt))
        .limit(1);

      if (ticket) {
        return { hasTicket: true, ticketNumber: ticket.ticketNumber, ticketId: ticket.id };
      }

      return { hasTicket: false };
    } catch (error: any) {
      log.error(`[ChatParity] verifyTicketForSupportEntry failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { hasTicket: false };
    }
  }

  async autoCreateTicketForSupportEntry(
    userId: string, 
    userName: string, 
    workspaceId: string,
    subject?: string
  ): Promise<{ ticketNumber: string; ticketId: string } | null> {
    try {
      const crypto = await import('crypto');
      const ticketNumber = `TKT-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      
      const [ticket] = await db
        .insert(supportTickets)
        .values({
          workspaceId,
          ticketNumber,
          type: 'support',
          subject: subject || 'Support Request (Auto-Created)',
          description: `Auto-created ticket for ${userName} entering support room`,
          status: 'open',
          priority: 'medium',
          requestedBy: userName,
          escalatedBy: userId,
        })
        .returning();

      if (ticket) {
        log.info(`[ChatParity] Auto-created ticket ${ticketNumber} for user ${userId}`);
        return { ticketNumber: ticket.ticketNumber, ticketId: ticket.id };
      }
      return null;
    } catch (error: any) {
      log.error(`[ChatParity] autoCreateTicketForSupportEntry failed: ${(error instanceof Error ? error.message : String(error))}`);
      return null;
    }
  }

  // =========================================================================
  // GAP 4: HelpAI self-spawning moderator bot
  // =========================================================================

  async executeModeratorAction(params: {
    targetRoomId: string;
    workspaceId: string;
    action: 'close' | 'suspend' | 'mute_all' | 'nuke';
    reason: string;
    triggeredBy: string;
    broadcastFn?: (roomId: string, message: any) => void;
  }): Promise<{ success: boolean; systemMessage?: string }> {
    const botId = `helpai-moderator-${Date.now().toString(36)}`;
    const botName = 'HelpAI Moderator';

    try {
      log.info(`[ChatParity] HelpAI moderator bot ${botId} spawned for ${params.action} on room ${params.targetRoomId}`);

      let systemMessage = '';

      switch (params.action) {
        case 'close':
          systemMessage = `This room has been closed by the system. Reason: ${params.reason}`;
          await this.closeRoomInternal(params.targetRoomId, params.workspaceId, botName, params.reason);
          break;
        case 'suspend':
          systemMessage = `This room has been suspended. Reason: ${params.reason}. Contact support for assistance.`;
          await this.suspendRoom(params.targetRoomId, params.workspaceId, params.reason);
          break;
        case 'mute_all':
          systemMessage = `All users have been muted in this room. Reason: ${params.reason}`;
          await this.muteAllEndUsers(params.targetRoomId, params.workspaceId, botId, params.reason);
          break;
        case 'nuke':
          systemMessage = `This room has been reset by the system. Reason: ${params.reason}. All previous messages have been archived.`;
          await this.nukeRoom(params.targetRoomId, params.workspaceId, botId, params.reason);
          break;
      }

      await this.postNonRespondableSystemMessage(
        params.targetRoomId,
        systemMessage,
        botName
      );

      if (params.broadcastFn) {
        params.broadcastFn(params.targetRoomId, {
          type: 'system_announcement',
          roomId: params.targetRoomId,
          message: systemMessage,
          action: params.action,
          respondable: false,
          botId,
          timestamp: Date.now(),
        });
      }

      log.info(`[ChatParity] HelpAI moderator bot ${botId} completed ${params.action} and left room`);
      return { success: true, systemMessage };
    } catch (error: any) {
      log.error(`[ChatParity] Moderator action failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false };
    }
  }

  private async postNonRespondableSystemMessage(
    conversationId: string,
    message: string,
    senderName: string
  ): Promise<void> {
    await db.insert(chatMessages).values({
      conversationId,
      senderName,
      senderType: 'system',
      message,
      messageType: 'system',
      isSystemMessage: true,
      isNonRespondable: true,
    });
  }

  private async closeRoomInternal(
    roomId: string, 
    workspaceId: string, 
    actorName: string, 
    reason: string
  ): Promise<void> {
    await db
      .update(chatConversations)
      .set({
        status: 'closed',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatConversations.id, roomId),
          eq(chatConversations.workspaceId, workspaceId)
        )
      );

    await db.insert(roomEvents).values({
      workspaceId,
      conversationId: roomId,
      actorId: 'system',
      actorName,
      actorRole: 'system',
      eventType: 'room_closed',
      description: `Room closed by ${actorName}: ${reason}`,
      eventPayload: JSON.stringify({ reason, initiatorType: 'system' }),
      ipAddress: 'system-moderator',
    });
  }

  private async suspendRoom(
    roomId: string, 
    workspaceId: string, 
    reason: string
  ): Promise<void> {
    await db
      .update(chatConversations)
      .set({
        status: 'closed',
        closedAt: new Date(),
        isMutedForEndUsers: true,
        mutedAt: new Date(),
        muteReason: `Suspended: ${reason}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatConversations.id, roomId),
          eq(chatConversations.workspaceId, workspaceId)
        )
      );
  }

  // =========================================================================
  // GAP 5: Room closure RBAC enforcement
  // =========================================================================

  canCloseRoom(
    userRole: string, 
    platformRole: string | null,
    roomType: string
  ): { allowed: boolean; reason?: string } {
    if (PLATFORM_STAFF_ROLES.has(platformRole || '')) {
      return { allowed: true };
    }

    if (MANAGEMENT_ROLES.has(userRole)) {
      return { allowed: true };
    }

    if (roomType === 'shift_chat' || roomType === 'meeting') {
      return { allowed: false, reason: 'Shift and meeting rooms are managed by the system' };
    }

    return { 
      allowed: false, 
      reason: 'Only org owners, co-owners, managers, or platform staff can close rooms' 
    };
  }

  // =========================================================================
  // GAP 6: Cross-org join exception for parent-org managers
  // =========================================================================

  async canJoinRoom(params: {
    userId: string;
    userOrgId: string;
    userRole: string;
    platformRole: string | null;
    targetRoomOrgId: string;
    targetRoomMode: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    if (PLATFORM_STAFF_ROLES.has(params.platformRole || '')) {
      return { allowed: true };
    }

    if (params.targetRoomMode === 'sup') {
      return { allowed: true };
    }

    if (params.userOrgId === params.targetRoomOrgId) {
      return { allowed: true };
    }

    if (MANAGEMENT_ROLES.has(params.userRole)) {
      const isParentOrgManager = await this.isParentOrgManager(
        params.userId, 
        params.userOrgId, 
        params.targetRoomOrgId
      );
      if (isParentOrgManager) {
        return { allowed: true };
      }
    }

    return { 
      allowed: false, 
      reason: 'Cross-organization room access is not permitted. Only parent-org managers can join sub-org rooms.' 
    };
  }

  private async isParentOrgManager(
    userId: string, 
    userOrgId: string, 
    targetOrgId: string
  ): Promise<boolean> {
    try {
      const [targetWorkspace] = await db
        .select({ 
          id: workspaces.id, 
          parentOrgId: sql<string>`${workspaces}.parent_org_id` 
        })
        .from(workspaces)
        .where(eq(workspaces.id, targetOrgId))
        .limit(1);

      if (targetWorkspace && (targetWorkspace as any).parentOrgId === userOrgId) {
        return true;
      }

      return false;
    } catch (error) {
      log.error(`[ChatParity] isParentOrgManager check failed:`, error);
      return false;
    }
  }

  // =========================================================================
  // GAP 7: Room nuke/reset capability
  // =========================================================================

  async nukeRoom(
    roomId: string, 
    workspaceId: string, 
    actorId: string, 
    reason: string
  ): Promise<{ success: boolean; archivedMessageCount: number }> {
    try {
      const messages = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, roomId));

      const archivedCount = messages.length;

      if (archivedCount > 0) {
        await db
          .update(chatMessages)
          .set({
            isDeletedForEveryone: true,
            deletedForEveryoneAt: new Date(),
            deletedForEveryoneBy: actorId,
            updatedAt: new Date(),
          })
          .where(eq(chatMessages.conversationId, roomId));
      }

      await db
        .update(chatParticipants)
        .set({
          isActive: false,
          leftAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chatParticipants.conversationId, roomId));

      await db
        .update(chatConversations)
        .set({
          status: 'active',
          closedAt: null,
          isMutedForEndUsers: false,
          mutedAt: null,
          mutedBy: null,
          muteReason: null,
          updatedAt: new Date(),
        })
        .where(eq(chatConversations.id, roomId));

      await db.insert(roomEvents).values({
        workspaceId,
        conversationId: roomId,
        actorId,
        actorName: 'System',
        actorRole: 'support_agent',
        eventType: 'room_nuked',
        description: `Room nuked and reset: ${reason}. ${archivedCount} messages archived.`,
        eventPayload: JSON.stringify({ 
          reason, 
          archivedMessageCount: archivedCount,
          nukedAt: new Date().toISOString(),
        }),
        ipAddress: 'system-nuke',
      });

      log.info(`[ChatParity] Room ${roomId} nuked: ${archivedCount} messages archived, participants cleared, room reset to active`);
      return { success: true, archivedMessageCount: archivedCount };
    } catch (error: any) {
      log.error(`[ChatParity] nukeRoom failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, archivedMessageCount: 0 };
    }
  }

  // =========================================================================
  // GAP 8: system_bug escalation to root/deputy_root
  // =========================================================================

  async escalateSystemBug(params: {
    workspaceId: string;
    reportedBy: string;
    reportedByName: string;
    description: string;
    errorContext?: string;
    sessionId?: string;
    conversationId?: string;
  }): Promise<{ ticketId: string; ticketNumber: string } | null> {
    try {
      const crypto = await import('crypto');
      const ticketNumber = `BUG-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const [ticket] = await db
        .insert(supportTickets)
        .values({
          workspaceId: params.workspaceId,
          ticketNumber,
          type: 'support',
          subject: `System Bug Report: ${params.description.substring(0, 100)}`,
          description: params.description,
          status: 'open',
          priority: 'urgent',
          requestedBy: params.reportedByName,
          isEscalated: true,
          escalatedAt: new Date(),
          escalatedBy: params.reportedBy,
          escalatedReason: `System bug requiring code changes - auto-escalated to root/deputy_root. ${params.errorContext || ''}`.trim(),
          platformNotes: params.errorContext ? 
            `Error Context: ${params.errorContext}\nSession: ${params.sessionId || 'N/A'}` : 
            undefined,
        })
        .returning();

      if (ticket) {
        log.info(`[ChatParity] System bug escalated to root: ${ticketNumber} - ${params.description.substring(0, 80)}`);
        return { ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
      }

      return null;
    } catch (error: any) {
      log.error(`[ChatParity] escalateSystemBug failed: ${(error instanceof Error ? error.message : String(error))}`);
      return null;
    }
  }

  // =========================================================================
  // DM ENHANCEMENTS: Group DMs, cross-org restrictions, closed conversation muting
  // =========================================================================

  async canStartDM(params: {
    initiatorId: string;
    initiatorOrgId: string;
    initiatorRole: string;
    initiatorPlatformRole: string | null;
    targetUserId: string;
    targetOrgId: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    if (PLATFORM_STAFF_ROLES.has(params.initiatorPlatformRole || '')) {
      return { allowed: true };
    }

    if (params.initiatorOrgId === params.targetOrgId) {
      return { allowed: true };
    }

    if (MANAGEMENT_ROLES.has(params.initiatorRole)) {
      const isParent = await this.isParentOrgManager(
        params.initiatorId,
        params.initiatorOrgId,
        params.targetOrgId
      );
      if (isParent) return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Cross-organization direct messaging is not permitted. Only parent-org managers and platform staff can DM across organizations.',
    };
  }

  async canStartGroupDM(params: {
    initiatorId: string;
    initiatorOrgId: string;
    initiatorRole: string;
    initiatorPlatformRole: string | null;
    participantOrgIds: string[];
  }): Promise<{ allowed: boolean; reason?: string }> {
    if (PLATFORM_STAFF_ROLES.has(params.initiatorPlatformRole || '')) {
      return { allowed: true };
    }

    const uniqueOrgs = new Set(participantOrgIdsToCheck(params.initiatorOrgId, params.participantOrgIds));
    
    if (uniqueOrgs.size <= 1) {
      return { allowed: true };
    }

    if (MANAGEMENT_ROLES.has(params.initiatorRole)) {
      for (const orgId of uniqueOrgs) {
        if (orgId === params.initiatorOrgId) continue;
        const isParent = await this.isParentOrgManager(
          params.initiatorId,
          params.initiatorOrgId,
          orgId
        );
        if (!isParent) {
          return {
            allowed: false,
            reason: `Cannot create group DM with members from ${orgId} - not a sub-organization`,
          };
        }
      }
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Group DMs across organizations are only available to parent-org management.',
    };
  }

  async createGroupDM(params: {
    workspaceId: string;
    creatorId: string;
    creatorName: string;
    participantIds: string[];
    participantNames: string[];
    parentOrgId?: string;
    allowedOrgIds?: string[];
    subject?: string;
  }): Promise<ChatConversation | null> {
    try {
      const [conversation] = await db
        .insert(chatConversations)
        .values({
          workspaceId: params.workspaceId,
          customerId: params.creatorId,
          customerName: params.creatorName,
          subject: params.subject || 'Group Message',
          status: 'active',
          conversationType: 'dm_group',
          visibility: 'private',
          parentOrgId: params.parentOrgId,
          allowedOrgIds: params.allowedOrgIds || [],
          isEncrypted: true,
        })
        .returning();

      if (!conversation) return null;

      const allParticipants = [params.creatorId, ...params.participantIds];
      const allNames = [params.creatorName, ...params.participantNames];

      for (let i = 0; i < allParticipants.length; i++) {
        await db.insert(chatParticipants).values({
          conversationId: conversation.id,
          workspaceId: params.workspaceId,
          participantId: allParticipants[i],
          participantName: allNames[i] || 'Unknown',
          participantRole: allParticipants[i] === params.creatorId ? 'owner' : 'member',
          canSendMessages: true,
          canViewHistory: true,
          invitedBy: params.creatorId,
          isActive: true,
        });
      }

      log.info(`[ChatParity] Group DM created: ${conversation.id} with ${allParticipants.length} participants`);
      return conversation;
    } catch (error: any) {
      log.error(`[ChatParity] createGroupDM failed: ${(error instanceof Error ? error.message : String(error))}`);
      return null;
    }
  }

  // =========================================================================
  // CLOSED CONVERSATION MUTING
  // =========================================================================

  async muteAllEndUsers(
    conversationId: string, 
    workspaceId: string, 
    actorId: string, 
    reason: string
  ): Promise<void> {
    await db
      .update(chatConversations)
      .set({
        isMutedForEndUsers: true,
        mutedAt: new Date(),
        mutedBy: actorId,
        muteReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.workspaceId, workspaceId)
        )
      );
  }

  async unmuteEndUsers(
    conversationId: string, 
    workspaceId: string
  ): Promise<void> {
    await db
      .update(chatConversations)
      .set({
        isMutedForEndUsers: false,
        mutedAt: null,
        mutedBy: null,
        muteReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.workspaceId, workspaceId)
        )
      );
  }

  canUserSendMessage(params: {
    conversationStatus: string;
    isMutedForEndUsers: boolean;
    userRole: string;
    platformRole: string | null;
    senderType: string;
  }): { allowed: boolean; reason?: string } {
    if (SYSTEM_BOT_SENDER_TYPES.has(params.senderType)) {
      return { allowed: true };
    }

    if (PLATFORM_STAFF_ROLES.has(params.platformRole || '')) {
      return { allowed: true };
    }

    if (params.conversationStatus === 'closed') {
      if (MANAGEMENT_ROLES.has(params.userRole)) {
        return { allowed: true };
      }
      return { 
        allowed: false, 
        reason: 'This conversation has been closed. You are unable to send further messages. A support agent can reopen it if needed.' 
      };
    }

    if (params.isMutedForEndUsers) {
      if (MANAGEMENT_ROLES.has(params.userRole)) {
        return { allowed: true };
      }
      return { 
        allowed: false, 
        reason: 'You are currently muted in this conversation. A support agent can unmute you.' 
      };
    }

    return { allowed: true };
  }

  async reopenConversation(
    conversationId: string, 
    workspaceId: string, 
    actorId: string, 
    actorName: string, 
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db
        .update(chatConversations)
        .set({
          status: 'active',
          closedAt: null,
          isMutedForEndUsers: false,
          mutedAt: null,
          mutedBy: null,
          muteReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(chatConversations.id, conversationId),
            eq(chatConversations.workspaceId, workspaceId)
          )
        );

      await db.insert(roomEvents).values({
        workspaceId,
        conversationId,
        actorId,
        actorName,
        actorRole: 'support',
        eventType: 'room_reopened',
        description: `Conversation reopened by ${actorName}${reason ? `: ${reason}` : ''}`,
        eventPayload: JSON.stringify({ reason, reopenedAt: new Date().toISOString() }),
        ipAddress: 'system-reopen',
      });

      await this.postNonRespondableSystemMessage(
        conversationId,
        `This conversation has been reopened by ${actorName}. You may now send messages again.`,
        'System'
      );

      log.info(`[ChatParity] Conversation ${conversationId} reopened by ${actorName}`);
      return { success: true };
    } catch (error: any) {
      log.error(`[ChatParity] reopenConversation failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  async closeConversationWithMute(
    conversationId: string,
    workspaceId: string,
    actorId: string,
    actorName: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db
        .update(chatConversations)
        .set({
          status: 'closed',
          closedAt: new Date(),
          isMutedForEndUsers: true,
          mutedAt: new Date(),
          mutedBy: actorId,
          muteReason: reason || 'Conversation closed by agent',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(chatConversations.id, conversationId),
            eq(chatConversations.workspaceId, workspaceId)
          )
        );

      await db.insert(roomEvents).values({
        workspaceId,
        conversationId,
        actorId,
        actorName,
        actorRole: 'support',
        eventType: 'room_closed',
        description: `Conversation closed by ${actorName}${reason ? `: ${reason}` : ''}. End users muted.`,
        eventPayload: JSON.stringify({ 
          reason, 
          closedAt: new Date().toISOString(),
          endUsersMuted: true,
        }),
        ipAddress: 'system-close',
      });

      await this.postNonRespondableSystemMessage(
        conversationId,
        `This conversation has been closed${reason ? `: ${reason}` : ''}. You are unable to send further messages. If you need additional help, please create a new support ticket.`,
        actorName
      );

      return { success: true };
    } catch (error: any) {
      log.error(`[ChatParity] closeConversationWithMute failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }
}

function participantOrgIdsToCheck(initiatorOrgId: string, participantOrgIds: string[]): string[] {
  return [...new Set([initiatorOrgId, ...participantOrgIds])];
}

export const chatParityService = ChatParityService.getInstance();

log.info('[ChatParity] Chat Parity Service initialized - WhatsApp/Messenger/IRCX canonical logic active');
