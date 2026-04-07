import { db } from '../db';
import { chatConversations, roomEvents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { executionPipeline } from './executionPipeline';
import { WebSocket } from 'ws';
import { chatParityService } from './chatParityService';
import { createLogger } from '../lib/logger';
const log = createLogger('roomLifecycleService');


interface RoomLifecycleParams {
  roomId: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  reason?: string;
  initiatorType?: 'user' | 'system' | 'cron';
  ipAddress?: string;
  userAgent?: string;
}

interface RoomLifecycleResult {
  roomId: string;
  previousStatus: string;
  newStatus: string;
  action: string;
  closedAt?: string;
  reopenedAt?: string;
}

let broadcastToRoom: ((roomId: string, message: any) => void) | null = null;

export function registerRoomBroadcaster(fn: (roomId: string, message: any) => void) {
  broadcastToRoom = fn;
}

export async function closeRoom(params: RoomLifecycleParams): Promise<{ success: boolean; result?: RoomLifecycleResult; error?: string }> {
  const result = await executionPipeline.execute<RoomLifecycleResult>(
    {
      workspaceId: params.workspaceId,
      operationType: 'room_lifecycle',
      operationName: 'room_close',
      initiator: params.actorId,
      initiatorType: params.initiatorType || 'user',
      skipCreditCheck: true,
      payload: {
        roomId: params.roomId,
        reason: params.reason,
        actorName: params.actorName,
        actorRole: params.actorRole,
      },
    },
    {
      fetch: async (ctx) => {
        const [conversation] = await db
          .select()
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.id, params.roomId),
              eq(chatConversations.workspaceId, params.workspaceId)
            )
          )
          .limit(1);

        if (!conversation) {
          throw new Error('Room not found in this workspace');
        }

        return { conversation };
      },

      validate: async (ctx, fetchedData) => {
        const conv = fetchedData.conversation;
        const errors: string[] = [];

        if (conv.status === 'closed') {
          errors.push('Room is already closed');
        }
        if (conv.status === 'archived') {
          errors.push('Cannot close an archived room');
        }

        if (params.initiatorType !== 'system' && params.initiatorType !== 'cron') {
          const rbacCheck = chatParityService.canCloseRoom(
            params.actorRole,
            null,
            conv.conversationType
          );
          if (!rbacCheck.allowed) {
            errors.push(rbacCheck.reason || 'Insufficient permissions to close this room');
          }
        }

        return { valid: errors.length === 0, errors };
      },

      process: async (ctx, fetchedData) => {
        const conv = fetchedData.conversation;
        const now = new Date();

        await db
          .update(chatConversations)
          .set({
            status: 'closed',
            closedAt: now,
            updatedAt: now,
          })
          .where(eq(chatConversations.id, params.roomId));

        await db.insert(roomEvents).values({
          workspaceId: params.workspaceId,
          conversationId: params.roomId,
          actorId: params.actorId,
          actorName: params.actorName,
          actorRole: params.actorRole,
          eventType: 'room_closed',
          description: `Room closed by ${params.actorName}${params.reason ? `: ${params.reason}` : ''}`,
          eventPayload: JSON.stringify({
            previousStatus: conv.status,
            reason: params.reason,
            closedAt: now.toISOString(),
            initiatorType: params.initiatorType || 'user',
            executionId: ctx.executionId,
          }),
          ipAddress: params.ipAddress || 'system-lifecycle',
          userAgent: params.userAgent,
        });

        return {
          roomId: params.roomId,
          previousStatus: conv.status,
          newStatus: 'closed',
          action: 'close',
          closedAt: now.toISOString(),
        };
      },

      mutate: async (ctx, processResult) => {
        return { tables: ['chat_conversations', 'room_events'], recordsChanged: 2 };
      },

      confirm: async (ctx, mutationDetails) => {
        const [verify] = await db
          .select({ status: chatConversations.status })
          .from(chatConversations)
          .where(eq(chatConversations.id, params.roomId))
          .limit(1);
        return verify?.status === 'closed';
      },

      notify: async (ctx, processResult) => {
        const notifications: string[] = [];

        if (broadcastToRoom) {
          broadcastToRoom(params.roomId, {
            type: 'room_status_changed',
            roomId: params.roomId,
            status: 'closed',
            closedBy: params.actorName,
            reason: params.reason,
            closedAt: processResult.closedAt,
          });
          notifications.push('websocket_broadcast');
        }

        log.info(`[RoomLifecycle] Room ${params.roomId} closed by ${params.actorName}`);
        notifications.push('console_log');
        return notifications;
      },
    }
  );

  if (!result.success) {
    return { success: false, error: result.error?.message || 'Failed to close room' };
  }

  return { success: true, result: result.result };
}

export async function reopenRoom(params: RoomLifecycleParams): Promise<{ success: boolean; result?: RoomLifecycleResult; error?: string }> {
  const result = await executionPipeline.execute<RoomLifecycleResult>(
    {
      workspaceId: params.workspaceId,
      operationType: 'room_lifecycle',
      operationName: 'room_reopen',
      initiator: params.actorId,
      initiatorType: params.initiatorType || 'user',
      skipCreditCheck: true,
      payload: {
        roomId: params.roomId,
        reason: params.reason,
        actorName: params.actorName,
        actorRole: params.actorRole,
      },
    },
    {
      fetch: async (ctx) => {
        const [conversation] = await db
          .select()
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.id, params.roomId),
              eq(chatConversations.workspaceId, params.workspaceId)
            )
          )
          .limit(1);

        if (!conversation) {
          throw new Error('Room not found in this workspace');
        }

        return { conversation };
      },

      validate: async (ctx, fetchedData) => {
        const conv = fetchedData.conversation;
        const errors: string[] = [];

        if (conv.status === 'active' || conv.status === 'open') {
          errors.push('Room is already open');
        }
        if (conv.status === 'archived') {
          errors.push('Cannot reopen an archived room. Create a new room instead.');
        }

        return { valid: errors.length === 0, errors };
      },

      process: async (ctx, fetchedData) => {
        const conv = fetchedData.conversation;
        const now = new Date();

        await db
          .update(chatConversations)
          .set({
            status: 'active',
            closedAt: null,
            updatedAt: now,
          })
          .where(eq(chatConversations.id, params.roomId));

        await db.insert(roomEvents).values({
          workspaceId: params.workspaceId,
          conversationId: params.roomId,
          actorId: params.actorId,
          actorName: params.actorName,
          actorRole: params.actorRole,
          eventType: 'room_reopened',
          description: `Room reopened by ${params.actorName}${params.reason ? `: ${params.reason}` : ''}`,
          eventPayload: JSON.stringify({
            previousStatus: conv.status,
            reason: params.reason,
            reopenedAt: now.toISOString(),
            initiatorType: params.initiatorType || 'user',
            executionId: ctx.executionId,
          }),
          ipAddress: params.ipAddress || 'system-lifecycle',
          userAgent: params.userAgent,
        });

        return {
          roomId: params.roomId,
          previousStatus: conv.status,
          newStatus: 'active',
          action: 'reopen',
          reopenedAt: now.toISOString(),
        };
      },

      mutate: async (ctx, processResult) => {
        return { tables: ['chat_conversations', 'room_events'], recordsChanged: 2 };
      },

      confirm: async (ctx, mutationDetails) => {
        const [verify] = await db
          .select({ status: chatConversations.status })
          .from(chatConversations)
          .where(eq(chatConversations.id, params.roomId))
          .limit(1);
        return verify?.status === 'active';
      },

      notify: async (ctx, processResult) => {
        const notifications: string[] = [];

        if (broadcastToRoom) {
          broadcastToRoom(params.roomId, {
            type: 'room_status_changed',
            roomId: params.roomId,
            status: 'active',
            reopenedBy: params.actorName,
            reason: params.reason,
            reopenedAt: processResult.reopenedAt,
          });
          notifications.push('websocket_broadcast');
        }

        log.info(`[RoomLifecycle] Room ${params.roomId} reopened by ${params.actorName}`);
        notifications.push('console_log');
        return notifications;
      },
    }
  );

  if (!result.success) {
    return { success: false, error: result.error?.message || 'Failed to reopen room' };
  }

  return { success: true, result: result.result };
}

export async function autoCloseRoom(roomId: string, workspaceId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  return closeRoom({
    roomId,
    workspaceId,
    actorId: 'system',
    actorName: 'CoAIleague Automation',
    actorRole: 'system',
    reason,
    initiatorType: 'cron',
  });
}
