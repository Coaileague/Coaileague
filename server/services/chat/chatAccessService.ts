/**
 * chatAccessService.ts — Centralized Conversation Access
 * =======================================================
 * Route files (chat-management.ts, chat-rooms.ts, privateMessageRoutes.ts)
 * defer to these helpers instead of each doing their own partial
 * participant/membership lookup.
 *
 * Codex handoff: fixes old bug where room-admin checks could drift
 * from actual participant-role rules.
 */

import { db } from '../../db';
import { chatRooms, chatRoomMembers, privateMessageConversations, privateMessageParticipants } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { isSupportStaffRole, canManageDirectMessageLifecycle } from './chatPolicyService';

export type ConversationType = 'room' | 'dm';

export interface ConversationTarget {
  type: ConversationType;
  id: string;
  workspaceId: string | null;
  ownerId: string | null;
  roomType?: string | null;
  participantIds?: string[];
}

// ── Resolve a conversation by ID ───────────────────────────────────────────

/**
 * Resolves a conversation (room or DM) by its ID.
 * Returns null if not found. Used by all access checks as the first step.
 */
export async function resolveConversationTarget(
  conversationId: string,
): Promise<ConversationTarget | null> {
  // Try as a chat room first
  const [room] = await db
    .select({
      id: chatRooms.id,
      workspaceId: chatRooms.workspaceId,
      ownerId: chatRooms.createdBy,
      roomType: chatRooms.roomType,
    })
    .from(chatRooms)
    .where(eq(chatRooms.id, conversationId))
    .limit(1);

  if (room) {
    return {
      type: 'room',
      id: room.id,
      workspaceId: room.workspaceId,
      ownerId: room.ownerId,
      roomType: room.roomType,
    };
  }

  // Try as a private message conversation
  try {
    const [dm] = await db
      .select({ id: privateMessageConversations.id })
      .from(privateMessageConversations)
      .where(eq(privateMessageConversations.id, conversationId))
      .limit(1);

    if (dm) {
      const participants = await db
        .select({ userId: privateMessageParticipants.userId })
        .from(privateMessageParticipants)
        .where(eq(privateMessageParticipants.conversationId, conversationId));

      return {
        type: 'dm',
        id: conversationId,
        workspaceId: null,
        ownerId: null,
        participantIds: participants.map(p => p.userId),
      };
    }
  } catch {
    // privateMessageConversations table might not exist yet
  }

  return null;
}

// ── Access checks ─────────────────────────────────────────────────────────

/**
 * Ensures the actor can participate in the given conversation.
 * Returns an error string if access is denied, null if allowed.
 */
export async function ensureConversationParticipantAccess(
  conversationId: string,
  actorId: string,
  actorRole: string | null | undefined,
  actorWorkspaceId: string | null | undefined,
): Promise<{ allowed: boolean; reason?: string; target?: ConversationTarget }> {
  const target = await resolveConversationTarget(conversationId);
  if (!target) {
    return { allowed: false, reason: 'Conversation not found' };
  }

  // Support staff can always participate
  if (isSupportStaffRole(actorRole)) {
    return { allowed: true, target };
  }

  if (target.type === 'room') {
    // Workspace-scoped rooms: actor must be in the same workspace
    if (target.workspaceId && actorWorkspaceId && target.workspaceId !== actorWorkspaceId) {
      return { allowed: false, reason: 'This room belongs to a different workspace' };
    }
    // Check membership
    const [member] = await db
      .select({ userId: chatRoomMembers.userId })
      .from(chatRoomMembers)
      .where(and(
        eq(chatRoomMembers.roomId, conversationId),
        eq(chatRoomMembers.userId, actorId),
      ))
      .limit(1);
    if (!member) {
      return { allowed: false, reason: 'Not a member of this room' };
    }
    return { allowed: true, target };
  }

  if (target.type === 'dm') {
    const isParticipant = target.participantIds?.includes(actorId);
    if (!isParticipant) {
      return { allowed: false, reason: 'Not a participant in this conversation' };
    }
    return { allowed: true, target };
  }

  return { allowed: false, reason: 'Unknown conversation type' };
}

/**
 * Returns whether the actor can manage (edit/delete/close/reopen) a conversation.
 */
export async function canManageConversation(
  conversationId: string,
  actorId: string,
  actorRole: string | null | undefined,
): Promise<{ allowed: boolean; reason?: string }> {
  // Support staff can always manage
  if (isSupportStaffRole(actorRole)) {
    return { allowed: true };
  }

  const target = await resolveConversationTarget(conversationId);
  if (!target) {
    return { allowed: false, reason: 'Conversation not found' };
  }

  if (target.type === 'dm') {
    return canManageDirectMessageLifecycle(actorRole, actorId, target.participantIds ?? []);
  }

  // For rooms: owner or manager
  if (target.ownerId === actorId) return { allowed: true };
  if (['org_owner', 'co_owner', 'manager', 'supervisor'].includes(actorRole ?? '')) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Not authorized to manage this conversation' };
}
