/**
 * Typed ChatDock event protocol.
 *
 * This module is intentionally not wired into the live WebSocket hub yet. It
 * mirrors today's event names so a later adapter can validate/shape payloads
 * without changing public WebSocket behavior during the service-layer closeout.
 */

export const CHAT_DOCK_CLIENT_EVENT_TYPES = [
  'join_conversation',
  'leave_conversation',
  'send_message',
  'typing',
  'mark_read',
  'command',
] as const;

export const CHAT_DOCK_SERVER_EVENT_TYPES = [
  'conversation_joined',
  'conversation_history',
  'new_message',
  'private_message',
  'user_typing',
  'system_message',
  'user_list_update',
  'status_change',
  'read_receipt',
  'participants_update',
  'voice_granted',
  'voice_pending',
  'voice_removed',
  'command_ack',
  'ticket_closed',
  'error',
] as const;

export type ChatDockClientEventType = typeof CHAT_DOCK_CLIENT_EVENT_TYPES[number];
export type ChatDockServerEventType = typeof CHAT_DOCK_SERVER_EVENT_TYPES[number];

export type ChatDockActorType = 'staff' | 'subscriber' | 'org_user' | 'guest' | 'bot' | 'system';
export type ChatDockMessageType = 'text' | 'file' | 'system' | 'image' | 'video' | 'audio' | 'voice';

export interface ChatDockActor {
  userId: string;
  userName: string;
  userType?: ChatDockActorType;
  workspaceId?: string | null;
  role?: string | null;
}

export interface ChatDockAttachment {
  url: string;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  thumbnailUrl?: string | null;
}

export interface ChatDockMessageEnvelope {
  id: string;
  workspaceId: string | null;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  senderType: ChatDockActorType | string;
  message: string;
  messageType: ChatDockMessageType | string;
  recipientId?: string | null;
  parentMessageId?: string | null;
  threadId?: string | null;
  mentions?: string[];
  attachment?: ChatDockAttachment | null;
  isPrivateMessage?: boolean;
  isSystemMessage?: boolean;
  isEdited?: boolean;
  isDeletedForEveryone?: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ChatDockOnlineUser {
  id: string;
  name: string;
  userType: 'staff' | 'subscriber' | 'org_user' | 'guest';
  status?: 'online' | 'away' | 'busy';
  role?: string | null;
}

export interface ChatDockEventBase<TType extends string> {
  type: TType;
  conversationId?: string;
  workspaceId?: string | null;
  requestId?: string;
  sentAt?: string;
}

export interface ChatDockJoinConversationEvent extends ChatDockEventBase<'join_conversation'> {
  conversationId: string;
  actor: ChatDockActor;
}

export interface ChatDockLeaveConversationEvent extends ChatDockEventBase<'leave_conversation'> {
  conversationId: string;
  actor: ChatDockActor;
}

export interface ChatDockSendMessageEvent extends ChatDockEventBase<'send_message'> {
  conversationId: string;
  actor: ChatDockActor;
  message: string;
  messageType?: ChatDockMessageType;
  recipientId?: string | null;
  parentMessageId?: string | null;
  threadId?: string | null;
  mentions?: string[];
  attachment?: ChatDockAttachment | null;
}

export interface ChatDockTypingEvent extends ChatDockEventBase<'typing'> {
  conversationId: string;
  actor: ChatDockActor;
  isTyping: boolean;
}

export interface ChatDockMarkReadEvent extends ChatDockEventBase<'mark_read'> {
  conversationId: string;
  actor: ChatDockActor;
  messageId: string;
}

export interface ChatDockCommandEvent extends ChatDockEventBase<'command'> {
  conversationId?: string;
  actor: ChatDockActor;
  commandId?: string;
  command: string;
  args?: Record<string, unknown>;
}

export type ChatDockClientEvent =
  | ChatDockJoinConversationEvent
  | ChatDockLeaveConversationEvent
  | ChatDockSendMessageEvent
  | ChatDockTypingEvent
  | ChatDockMarkReadEvent
  | ChatDockCommandEvent;

export type ChatDockServerEvent =
  | (ChatDockEventBase<'conversation_joined'> & { conversationId: string; messages?: ChatDockMessageEnvelope[] })
  | (ChatDockEventBase<'conversation_history'> & { conversationId: string; messages: ChatDockMessageEnvelope[] })
  | (ChatDockEventBase<'new_message'> & { conversationId: string; message: ChatDockMessageEnvelope })
  | (ChatDockEventBase<'private_message'> & { conversationId: string; message: ChatDockMessageEnvelope })
  | (ChatDockEventBase<'user_typing'> & {
      conversationId: string;
      userId: string;
      isTyping: boolean;
      typingUserName?: string;
      typingUserIsStaff?: boolean;
    })
  | (ChatDockEventBase<'system_message'> & { conversationId?: string; message: ChatDockMessageEnvelope | string })
  | (ChatDockEventBase<'user_list_update'> & { users: ChatDockOnlineUser[]; count: number })
  | (ChatDockEventBase<'status_change'> & {
      userId: string;
      userName?: string;
      status: 'online' | 'away' | 'busy';
    })
  | (ChatDockEventBase<'read_receipt'> & {
      conversationId: string;
      messageId: string;
      readBy: string;
      readByName: string;
      readAt: string;
    })
  | (ChatDockEventBase<'participants_update'> & { conversationId: string; participants: ChatDockOnlineUser[] })
  | (ChatDockEventBase<'voice_granted'> & { conversationId: string; staffName?: string })
  | (ChatDockEventBase<'voice_pending'> & { conversationId: string; reason?: string })
  | (ChatDockEventBase<'voice_removed'> & { conversationId: string; reason?: string })
  | (ChatDockEventBase<'command_ack'> & {
      conversationId?: string;
      commandId?: string;
      action?: string;
      success: boolean;
      error?: string;
    })
  | (ChatDockEventBase<'ticket_closed'> & { conversationId: string; ticketId?: string; reason?: string })
  | (ChatDockEventBase<'error'> & { error: string; temporaryError?: boolean });

export function isChatDockClientEventType(type: unknown): type is ChatDockClientEventType {
  return typeof type === 'string' && (CHAT_DOCK_CLIENT_EVENT_TYPES as readonly string[]).includes(type);
}

export function isChatDockServerEventType(type: unknown): type is ChatDockServerEventType {
  return typeof type === 'string' && (CHAT_DOCK_SERVER_EVENT_TYPES as readonly string[]).includes(type);
}

export function isChatDockClientEvent(value: unknown): value is ChatDockClientEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown };
  return isChatDockClientEventType(candidate.type);
}

export function stampChatDockServerEvent<TEvent extends ChatDockServerEvent>(
  event: TEvent,
  now: Date = new Date(),
): TEvent & { sentAt: string } {
  return {
    ...event,
    sentAt: event.sentAt ?? now.toISOString(),
  };
}
