import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useWebSocketBus } from "@/providers/WebSocketProvider";

function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createSystemMessage(message: string, conversationId: string): ChatMessage {
  return {
    id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    isEncrypted: false,
    encryptionIv: null,
    conversationId,
    senderId: null,
    senderName: 'System',
    senderType: 'system',
    message,
    messageType: 'text',
    isSystemMessage: true,
    isPrivateMessage: false,
    recipientId: null,
    parentMessageId: null,
    threadId: null,
    replyCount: 0,
    attachmentUrl: null,
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    attachmentThumbnail: null,
    isFormatted: false,
    formattedContent: null,
    mentions: [],
    visibleToStaffOnly: false,
    isRead: false,
    readAt: null,
    isEdited: false,
    editedAt: null,
    sentiment: null,
    sentimentScore: null,
    sentimentConfidence: null,
    urgencyLevel: null,
    sentimentAnalyzedAt: null,
    shouldEscalate: false,
    workspaceId: null,
    isDeletedForEveryone: false,
    deletedForEveryoneAt: null,
    deletedForEveryoneBy: null,
  } as unknown as ChatMessage;
}

interface OnlineUser {
  id: string;
  name: string;
  role: string;
  platformRole?: string;
  status: 'online' | 'away' | 'busy';
  userType: 'staff' | 'subscriber' | 'org_user' | 'guest';
}

interface WebSocketMessage {
  type: 'conversation_joined' | 'conversation_history' | 'new_message' | 'private_message' | 'user_typing' | 'error' | 'system_message' | 'user_list_update' | 'status_change' | 'kicked' | 'secure_request' | 'spectator_released' | 'secure_data_received' | 'banner_update' | 'voice_granted' | 'voice_pending' | 'voice_removed' | 'command_ack' | 'read_receipt' | 'participants_update' | 'escalation_redirect' | 'ticket_closed' | 'ws_authenticated' | 'ws_auth_required';
  messages?: ChatMessage[];
  message?: ChatMessage | string;
  userId?: string;
  isTyping?: boolean;
  typingUserName?: string;
  typingUserIsStaff?: boolean;
  messageId?: string;
  readBy?: string;
  readByName?: string;
  readAt?: string;
  participants?: OnlineUser[];
  conversationId?: string;
  requiresTicket?: boolean;
  roomStatus?: string;
  statusMessage?: string;
  temporaryError?: boolean;
  users?: OnlineUser[];
  count?: number;
  status?: 'online' | 'away' | 'busy';
  userName?: string;
  reason?: string;
  requestType?: string;
  requestedBy?: string;
  releasedBy?: string;
  fromUser?: string;
  fromUserId?: string;
  data?: any;
  bannerMessage?: string;
  staffName?: string;
  commandId?: string;
  action?: string;
  success?: boolean;
  error?: string;
  targetUserId?: string;
  targetName?: string;
  targetRoom?: string;
  ticketId?: string;
}

interface SecureRequestCallback {
  (request: { type: string; requestedBy: string; message?: string }): void;
}

interface ConnectionFailedCallback {
  (attemptCount: number): void;
}

function isForActiveConversation(
  activeConversationId: string,
  requestedId: string | null,
  joinedId: string | null,
  data: WebSocketMessage | { conversationId?: string },
  message?: ChatMessage | string
): boolean {
  const acceptableIds = new Set<string>();
  if (activeConversationId) acceptableIds.add(activeConversationId);
  if (requestedId) acceptableIds.add(requestedId);
  if (joinedId) acceptableIds.add(joinedId);
  if (acceptableIds.size === 0) return false;

  if (message && typeof message !== 'string' && 'conversationId' in message) {
    return acceptableIds.has(message.conversationId);
  }
  if (data.conversationId) {
    return acceptableIds.has(data.conversationId);
  }
  return false;
}

export function useChatroomWebSocket(
  userId: string | undefined,
  userName: string = 'User',
  conversationId: string = 'main-chatroom-coaileague',
  onSecureRequest?: SecureRequestCallback,
  onConnectionFailed?: ConnectionFailedCallback
) {
  const { toast } = useToast();
  const bus = useWebSocketBus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [typingUserInfo, setTypingUserInfo] = useState<{ name: string; isStaff: boolean } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [customBannerMessage, setCustomBannerMessage] = useState<string | null>(null);
  const [justGotVoice, setJustGotVoice] = useState(false);
  const [isSilenced, setIsSilenced] = useState(false);
  const [resolvedConversationId, setResolvedConversationId] = useState<string>(conversationId);
  const [readReceipts, setReadReceipts] = useState<Map<string, { readBy: string; readByName: string; readAt: Date }>>(new Map());
  const [conversationParticipants, setConversationParticipants] = useState<Map<string, OnlineUser[]>>(new Map());
  const [requiresTicket, setRequiresTicket] = useState(false);
  const [roomStatus, setRoomStatus] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [temporaryError, setTemporaryError] = useState(false);
  const [ticketClosed, setTicketClosed] = useState(false);
  const [ticketClosedReason, setTicketClosedReason] = useState<string | null>(null);
  const [isInTriage, setIsInTriage] = useState(false);

  const toastRef = useRef(toast);
  toastRef.current = toast;
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const resolvedConversationIdRef = useRef<string>(conversationId);
  const conversationIdRef = useRef<string>(conversationId);
  const userIdRef = useRef<string | undefined>(userId);
  const requestedConversationIdRef = useRef<string | null>(null);
  const joinedConversationIdRef = useRef<string | null>(null);
  const isJoinedRef = useRef(false);
  const lastConnectedConversationRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);
  const onSecureRequestRef = useRef(onSecureRequest);
  const onConnectionFailedRef = useRef(onConnectionFailed);

  useEffect(() => {
    conversationIdRef.current = conversationId;
    userIdRef.current = userId;
  }, [conversationId, userId]);

  useEffect(() => {
    onSecureRequestRef.current = onSecureRequest;
    onConnectionFailedRef.current = onConnectionFailed;
  }, [onSecureRequest, onConnectionFailed]);

  const checkFilter = useCallback((data: WebSocketMessage | { conversationId?: string }, message?: ChatMessage | string): boolean => {
    return isForActiveConversation(
      resolvedConversationIdRef.current,
      requestedConversationIdRef.current,
      joinedConversationIdRef.current,
      data,
      message
    );
  }, []);

  const sendJoin = useCallback(() => {
    const cId = conversationIdRef.current;
    const uId = userIdRef.current;
    if (!cId || !uId || cId === '' || cId === 'undefined' || cId === 'null') return;

    isJoinedRef.current = false;
    requestedConversationIdRef.current = cId;
    bus.send({
      type: 'join_conversation',
      conversationId: cId,
      userId: uId,
    });
  }, [bus]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(bus.subscribe('__ws_connected', () => {
      setIsConnected(true);
      setError(null);
      sendJoin();
    }));

    unsubs.push(bus.subscribe('__ws_disconnected', () => {
      setIsConnected(false);
      joinedConversationIdRef.current = null;
      requestedConversationIdRef.current = null;
      isJoinedRef.current = false;
    }));

    if (bus.isConnected()) {
      setIsConnected(true);
      sendJoin();
    }

    unsubs.push(bus.subscribeAll((data) => {
      switch (data.type) {
        case 'conversation_joined':
          if (data.conversationId) {
            resolvedConversationIdRef.current = data.conversationId;
            setResolvedConversationId(data.conversationId);
            joinedConversationIdRef.current = data.conversationId;
            isJoinedRef.current = true;
            setError(null);
          }
          break;

        case 'conversation_history': {
          const activeConvId = resolvedConversationIdRef.current;
          if (data.messages && Array.isArray(data.messages)) {
            const filtered = data.messages
              .filter((msg: ChatMessage) => isForActiveConversation(activeConvId, requestedConversationIdRef.current, joinedConversationIdRef.current, data, msg))
              .map((msg: ChatMessage) => ({
                ...msg,
                createdAt: msg.createdAt instanceof Date ? msg.createdAt : (msg.createdAt ? new Date(msg.createdAt) : new Date()),
              }));
            setMessages(filtered);
          } else {
            setMessages([]);
          }
          break;
        }

        case 'new_message':
          if (data.message && typeof data.message !== 'string') {
            if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data, data.message as ChatMessage)) {
              break;
            }
            const newMsg = data.message as ChatMessage;
            setMessages((prev) => {
              if (newMsg.id && prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          break;

        case 'private_message':
          if (data.message && typeof data.message !== 'string') {
            if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data, data.message as ChatMessage)) {
              break;
            }
            const privMsg = data.message as ChatMessage;
            setMessages((prev) => {
              if (privMsg.id && prev.some(m => m.id === privMsg.id)) return prev;
              return [...prev, privMsg];
            });
          }
          break;

        case 'ws_authenticated':
          // Server confirmed auth (either from session or token fallback).
          // Clear any transient auth/connection errors and retry join if needed.
          setError(null);
          if (!isJoinedRef.current && requestedConversationIdRef.current) {
            sendJoin();
          }
          break;

        case 'error': {
          const errorMessage = typeof data.message === 'string' ? data.message : 'An error occurred';

          if ((data as any).errorType === 'VOICE_REQUIRED') {
            setIsSilenced(true);
            toastRef.current({
              title: 'Voice Required',
              description: 'Please wait for HelpAI to grant you voice before sending messages.',
              variant: 'default',
            });
            break;
          }

          // Ignore transient auth errors emitted during WebSocket handshake — the
          // WebSocketProvider handles re-authentication; surfacing these to the UI
          // as a persistent banner is misleading.
          const isTransientAuthError =
            errorMessage.includes('Authentication required') ||
            errorMessage.includes('Please log in') ||
            errorMessage.includes('Unauthorized') ||
            (data as any).requiresAuth === true;

          if (isTransientAuthError) {
            break;
          }

          setError(errorMessage);

          if (data.requiresTicket) setRequiresTicket(true);
          if (data.roomStatus) setRoomStatus(data.roomStatus);
          if (data.statusMessage) setStatusMessage(data.statusMessage);
          if (data.temporaryError) setTemporaryError(true);
          break;
        }

        case 'system_message':
          if (data.message && typeof data.message === 'string') {
            if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) {
              break;
            }
            const msgText: string = data.message;
            const messageConvId = data.conversationId || conversationIdRef.current;
            setMessages((prev) => [...prev, createSystemMessage(msgText, messageConvId)]);
          }
          break;

        case 'user_typing':
          if (data.userId && data.userId !== userIdRef.current && data.isTyping !== undefined) {
            if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) {
              break;
            }

            if (data.isTyping && data.typingUserName) {
              setTypingUserInfo({
                name: data.typingUserName,
                isStaff: data.typingUserIsStaff || false
              });

              const timeout = setTimeout(() => {
                setTypingUserInfo(null);
              }, 3000);

              const existing = typingTimeoutRef.current.get(data.userId);
              if (existing) clearTimeout(existing);
              typingTimeoutRef.current.set(data.userId, timeout);
            } else {
              setTypingUserInfo(null);
              const existing = typingTimeoutRef.current.get(data.userId);
              if (existing) {
                clearTimeout(existing);
                typingTimeoutRef.current.delete(data.userId);
              }
            }

            setTypingUsers((prev) => {
              const next = new Set(prev);
              if (data.isTyping) {
                next.add(data.userId!);
              } else {
                next.delete(data.userId!);
              }
              return next;
            });
          }
          break;

        case 'voice_pending':
          if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
          setIsInTriage(true);
          setIsSilenced(false);
          break;

        case 'voice_granted':
          if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
          setIsSilenced(false);
          setIsInTriage(false);
          setJustGotVoice(true);
          const voiceTimeout = setTimeout(() => {
            setJustGotVoice(false);
          }, 5000);
          unsubs.push(() => clearTimeout(voiceTimeout));
          break;

        case 'voice_removed':
          if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
          setIsSilenced(true);
          setIsInTriage(false);
          setJustGotVoice(false);
          break;

        case 'ticket_closed':
          if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
          setTicketClosed(true);
          setTicketClosedReason(typeof data.message === 'string' ? data.message : 'Your support session has ended.');
          setIsInTriage(false);
          setIsSilenced(true);
          toastRef.current({
            title: 'Session Complete',
            description: typeof data.message === 'string' ? data.message : 'Your support session has ended.',
          });
          break;

        case 'room_status_changed': {
          const statusRoomId = data.roomId;
          const activeConvId = resolvedConversationIdRef.current || requestedConversationIdRef.current || joinedConversationIdRef.current;
          if (statusRoomId && statusRoomId === activeConvId) {
            if (data.status === 'closed') {
              setRoomStatus('closed');
              const closedBy = data.closedBy || 'a manager';
              const reason = data.reason ? `: ${data.reason}` : '';
              setMessages((prev) => [...prev, createSystemMessage(`Room closed by ${closedBy}${reason}. No new messages can be sent until reopened.`, activeConvId || '')]);
              toastRef.current({
                title: 'Room Closed',
                description: `This room has been closed by ${closedBy}${reason}`,
              });
            } else if (data.status === 'active') {
              setRoomStatus('open');
              const reopenedBy = data.reopenedBy || 'a manager';
              setMessages((prev) => [...prev, createSystemMessage(`Room reopened by ${reopenedBy}. You can send messages again.`, activeConvId || '')]);
              toastRef.current({
                title: 'Room Reopened',
                description: `This room has been reopened by ${reopenedBy}`,
              });
            }
          }
          break;
        }

        case 'command_ack':
          if (data.success) {
            const successMessage = typeof data.message === 'string' ? data.message : `${data.targetName || 'User'} • Action completed successfully`;
            toastRef.current({
              title: `✓ ${data.action === 'kick_user' ? 'User Removed' : 'Action Complete'}`,
              description: successMessage,
            });
          } else {
            const cmdErrorMessage = typeof data.message === 'string' ? data.message : `Could not complete ${data.action}`;
            toastRef.current({
              title: `❌ Action Failed`,
              description: cmdErrorMessage,
              variant: "destructive",
            });
          }
          break;

        case 'user_list_update': {
          const matchesSlug = isForActiveConversation(conversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data);
          const matchesResolved = isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data);
          if (!matchesSlug && !matchesResolved) break;
          if (data.users && Array.isArray(data.users)) {
            const uniqueUsersMap = new Map<string, OnlineUser>();
            data.users.forEach((user: OnlineUser) => {
              uniqueUsersMap.set(user.id, user);
            });
            setOnlineUsers(Array.from(uniqueUsersMap.values()));
          }
          break;
        }

        case 'status_change':
          if (data.message && typeof data.message !== 'string') {
            if (isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data, data.message as ChatMessage)) {
              const statusMsg = data.message as ChatMessage;
              setMessages((prev) => {
                if (statusMsg.id && prev.some(m => m.id === statusMsg.id)) return prev;
                return [...prev, statusMsg];
              });
            }
          }
          break;

        case 'kicked':
          if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
          {
            const kickMessage = typeof data.message === 'string' ? data.message : 'You have been removed from the chat';
            setError(kickMessage);
            setIsConnected(false);
            toastRef.current({
              title: "Removed from chat",
              description: `Reason: ${data.reason || 'violation of chat rules'}`,
              variant: "destructive",
            });
          }
          break;

        case 'secure_request':
          if (onSecureRequestRef.current && (data as any).requestType) {
            onSecureRequestRef.current({
              type: (data as any).requestType,
              requestedBy: (data as any).requestedBy || 'Support Staff',
              message: (data as any).message,
            });
          }
          break;

        case 'spectator_released':
          setMessages((prev) => [...prev, createSystemMessage(
            `${(data as any).releasedBy} has released you from hold. You can now chat.`,
            conversationIdRef.current
          )]);
          break;

        case 'secure_data_received': {
          if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
          const secureData = (data as any).data;
          let secureDataSummary = `🔒 Secure Data from ${(data as any).fromUser}:\n`;
          if (secureData.email) secureDataSummary += `📧 Email: ${secureData.email}\n`;
          if (secureData.accountId) secureDataSummary += `🆔 Account ID: ${secureData.accountId}\n`;
          if (secureData.verification) secureDataSummary += `✓ Verification: ${secureData.verification}\n`;
          if (secureData.fullName) secureDataSummary += `📝 Full Name: ${secureData.fullName}\n`;
          if (secureData.agreed) secureDataSummary += `✅ Agreed to terms\n`;
          if (secureData.response) secureDataSummary += `💬 Response: ${secureData.response}\n`;
          if (secureData.notes) secureDataSummary += `📋 Notes: ${secureData.notes}\n`;
          if (secureData.description) secureDataSummary += `📝 Description: ${secureData.description}\n`;
          if (secureData.file) secureDataSummary += `📎 File uploaded: ${secureData.file.name || 'document'}\n`;

          const secureMessageConvId = data.conversationId || conversationIdRef.current;
          setMessages((prev) => [...prev, {
            ...createSystemMessage(secureDataSummary.trim(), secureMessageConvId),
            senderName: 'SecureChannel'
          }]);
          break;
        }

        case 'banner_update':
          if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
          if (data.bannerMessage) {
            setCustomBannerMessage(data.bannerMessage);
          }
          if (data.message && typeof data.message !== 'string') {
            if (isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data, data.message as ChatMessage)) {
              setMessages((prev) => [...prev, data.message as ChatMessage]);
            }
          }
          break;

        case 'read_receipt':
          if (data.messageId && data.readBy && data.readByName) {
            if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
            setReadReceipts((prev) => {
              const next = new Map(prev);
              next.set(data.messageId!, {
                readBy: data.readBy!,
                readByName: data.readByName!,
                readAt: data.readAt ? new Date(data.readAt) : new Date(),
              });
              return next;
            });
          }
          break;

        case 'participants_update':
          if (data.conversationId && data.participants) {
            if (!isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, data)) break;
            setConversationParticipants((prev) => {
              const next = new Map(prev);
              next.set(data.conversationId!, data.participants!);
              return next;
            });
          }
          break;

        case 'escalation_redirect':
          if (data.message) {
            toastRef.current({
              title: "Connecting you with support team",
              description: typeof data.message === 'string' ? data.message : 'Redirecting to HelpDesk...',
              duration: 3000,
            });
          }
          const redirectTimeout = setTimeout(() => {
            if (data.targetRoom) {
              window.location.href = `/chatrooms`;
            }
          }, 1500);
          unsubs.push(() => clearTimeout(redirectTimeout));
          break;

        case 'irc_event':
          switch (data.event) {
            case 'irc:join':
              if (data.roomId && isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, { conversationId: data.roomId })) {
                setConversationParticipants((prev) => {
                  const next = new Map(prev);
                  const existing = next.get(data.roomId) || [];
                  if (!existing.find((p) => p.id === data.userId)) {
                    next.set(data.roomId, [...existing, {
                      id: data.userId,
                      name: data.userName,
                      role: data.userRole || 'guest',
                      status: 'online',
                      userType: data.userType || 'guest',
                    }]);
                  }
                  return next;
                });
              }
              break;

            case 'irc:part':
              if (data.roomId && isForActiveConversation(resolvedConversationIdRef.current, requestedConversationIdRef.current, joinedConversationIdRef.current, { conversationId: data.roomId })) {
                setConversationParticipants((prev) => {
                  const next = new Map(prev);
                  const existing = next.get(data.roomId) || [];
                  next.set(data.roomId, existing.filter((p) => p.id !== data.userId));
                  return next;
                });
              }
              break;

            case 'irc:typing':
              if (data.roomId && data.userId !== userIdRef.current) {
                // @ts-expect-error — TS migration: fix in refactoring sprint
                setTypingUsers((prev) => {
                  const key = `${data.roomId}:${data.conversationId || data.roomId}`;
                  const current = prev instanceof Map ? (prev.get(key) || new Set()) : new Set();
                  current.add(data.userId);
                  return new Map(prev instanceof Map ? prev : []).set(key, current);
                });
              }
              break;

            case 'irc:typing_stop':
              if (data.roomId) {
                setTypingUsers((prev) => {
                  const key = `${data.roomId}:${data.conversationId || data.roomId}`;
                  const current = prev instanceof Map ? prev.get(key) : null;
                  if (current) {
                    current.delete(data.userId);
                    return new Map(prev instanceof Map ? prev : []).set(key, current);
                  }
                  return prev;
                });
              }
              break;

            case 'irc:away':
            case 'irc:back':
              setConversationParticipants((prev) => {
                const next = new Map(prev);
                if (data.roomId) {
                  const participants = next.get(data.roomId);
                  if (participants) {
                    const updated = participants.map((p) =>
                      p.id === data.userId ? { ...p, status: data.status } : p
                    );
                    next.set(data.roomId, updated);
                  }
                } else {
                  for (const [roomId, participants] of next.entries()) {
                    const updated = participants.map((p) =>
                      p.id === data.userId ? { ...p, status: data.status } : p
                    );
                    next.set(roomId, updated);
                  }
                }
                return next;
              });
              break;

            case 'irc:names_reply':
              if (data.roomId && data.users) {
                setConversationParticipants((prev) => {
                  const next = new Map(prev);
                  next.set(data.roomId, data.users.map((u) => ({
                    id: u.userId,
                    name: u.userName,
                    role: u.role || 'guest',
                    status: u.status || 'online',
                  })));
                  return next;
                });
              }
              break;

            case 'irc:sync':
              break;

            case 'irc:kick':
              if (data.userId === userIdRef.current) {
                toastRef.current({
                  title: "You were removed from the room",
                  description: data.reason || "You have been removed by a moderator",
                  variant: "destructive",
                });
              }
              break;

            case 'irc:ack':
              break;

            case 'irc:notice':
            case 'irc:system':
            case 'irc:motd':
              if (!data.roomId || data.roomId === resolvedConversationIdRef.current || data.roomId === conversationIdRef.current) {
                const systemMessage = {
                  id: data.messageId || `${data.event}-${Date.now()}`,
                  conversationId: resolvedConversationIdRef.current || data.roomId || 'system',
                  senderId: data.senderId || 'system',
                  senderName: data.senderName || 'System',
                  senderType: 'system' as const,
                  message: data.content || '',
                  messageType: 'text',
                  createdAt: data.timestamp || new Date().toISOString(),
                  isSystemMessage: true,
                };

                setMessages((prev) => {
                  if (prev.some(m => m.id === systemMessage.id)) return prev;
                  return [...prev, systemMessage];
                });
              }
              break;

            case 'irc:privmsg': {
              const matchesResolvedPm = data.roomId === resolvedConversationIdRef.current;
              const matchesOriginalPm = data.roomId === conversationIdRef.current;
              const isForThisConversation = data.roomId && (matchesResolvedPm || matchesOriginalPm);

              if (isForThisConversation) {
                const isPrivateForUs = !data.isPrivate || data.recipientId === userIdRef.current;

                if (isPrivateForUs) {
                  const ircMessage = {
                    id: data.messageId || `irc-${Date.now()}`,
                    conversationId: resolvedConversationIdRef.current || data.roomId,
                    senderId: data.senderId || data.botId || 'system',
                    senderName: data.senderName || data.botName || 'System',
                    senderType: data.metadata?.isBot ? 'bot' : 'user',
                    message: data.content || '',
                    messageType: 'text',
                    createdAt: data.timestamp || new Date().toISOString(),
                    isBot: data.metadata?.isBot || false,
                    metadata: data.metadata,
                  };

                  setMessages((prev) => {
                    if (prev.some(m => m.id === ircMessage.id)) return prev;
                    return [...prev, ircMessage];
                  });
                }
              }
              break;
            }
          }
          break;
      }
    }));

    return () => {
      unsubs.forEach(u => u());
      typingTimeoutRef.current.forEach(t => clearTimeout(t));
      typingTimeoutRef.current.clear();
    };
  }, [bus, sendJoin, checkFilter]);

  useEffect(() => {
    if (!userId || !conversationId) return;
    if (!conversationId || conversationId === '' || conversationId === 'undefined' || conversationId === 'null') return;

    const isConversationSwitch = hasInitializedRef.current && lastConnectedConversationRef.current !== conversationId;

    if (hasInitializedRef.current && lastConnectedConversationRef.current === conversationId) {
      return;
    }

    if (isConversationSwitch) {
      bus.send({
        type: 'leave_conversation',
        userId: userId,
      });
      isJoinedRef.current = false;
      joinedConversationIdRef.current = null;

      setMessages([]);
      setOnlineUsers([]);
      setConversationParticipants(new Map());
      setReadReceipts(new Map());
    }

    hasInitializedRef.current = true;
    lastConnectedConversationRef.current = conversationId;

    sendJoin();

    const cleanupConversationId = conversationId;
    const cleanupUserId = userId;
    return () => {
      if (bus.isConnected() && cleanupUserId && cleanupConversationId) {
        bus.send({
          type: 'leave_conversation',
          conversationId: cleanupConversationId,
          userId: cleanupUserId,
        });
      }
      isJoinedRef.current = false;
      joinedConversationIdRef.current = null;
    };
  }, [userId, conversationId, bus, sendJoin]);

  const sendMessage = useCallback((messageText: string, senderName: string, senderType: 'customer' | 'support' | 'system' = 'support', attachment?: { url: string; name: string; type?: string; size?: number }) => {
    if (!bus.isConnected()) {
      setError('Not connected to chat server');
      return;
    }

    const targetConversationId = resolvedConversationIdRef.current || conversationId;

    if (!isJoinedRef.current) {
      setError('Chat is connecting... please try again in a moment');
      return;
    }

    if (!targetConversationId) {
      setError('Chat not initialized');
      return;
    }

    const payload: any = {
      type: 'chat_message',
      conversationId: targetConversationId,
      message: messageText,
      senderName: senderName,
      senderType: senderType,
    };

    if (attachment) {
      payload.attachmentUrl = attachment.url;
      payload.attachmentName = attachment.name;
      payload.attachmentType = attachment.type || 'document';
      payload.attachmentSize = attachment.size;
      payload.messageType = attachment.type === 'image' ? 'image' : attachment.type === 'video' ? 'video' : attachment.type === 'audio' ? 'audio' : 'file';
    }

    bus.send(payload);
  }, [conversationId, bus]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!bus.isConnected() || !userId) return;

    const currentUser = onlineUsers.find(u => u.id === userId);
    const isStaff = currentUser?.userType === 'staff' || false;

    const targetConversationId = resolvedConversationIdRef.current || conversationId;
    if (!targetConversationId) return;

    bus.send({
      type: 'typing',
      conversationId: targetConversationId,
      userId: userId,
      userName: userName,
      isStaff: isStaff,
      isTyping: isTyping,
    });
  }, [userId, userName, onlineUsers, conversationId, bus]);

  const sendStatusChange = useCallback((status: 'online' | 'away' | 'busy') => {
    if (!bus.isConnected() || !userId) return;

    bus.send({
      type: 'status_change',
      userId: userId,
      status: status,
    });
  }, [userId, bus]);

  const silenceUser = useCallback((targetUserId: string, duration?: number, reason?: string) => {
    if (!bus.isConnected()) return;

    const commandId = generateCommandId();
    bus.send({
      type: 'silence_user',
      targetUserId: targetUserId,
      duration: duration || 5,
      reason: reason || 'Chat violation',
      commandId: commandId,
    });
  }, [bus]);

  const giveVoice = useCallback((targetUserId: string) => {
    if (!bus.isConnected()) return;

    const commandId = generateCommandId();
    bus.send({
      type: 'give_voice',
      targetUserId: targetUserId,
      commandId: commandId,
    });
  }, [bus]);

  const kickUser = useCallback((targetUserId: string, reason?: string) => {
    if (!bus.isConnected()) return;

    const commandId = generateCommandId();
    bus.send({
      type: 'kick_user',
      targetUserId: targetUserId,
      reason: reason || 'violation of chat rules',
      commandId: commandId,
    });
  }, [bus]);

  const sendRawMessage = useCallback((data) => {
    if (!bus.isConnected()) return;

    if (typeof data === 'string') {
      const socket = bus.getSocket();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    } else {
      bus.send(data);
    }
  }, [bus]);

  const clearAccessError = useCallback(() => {
    setError(null);
    setRequiresTicket(false);
    setRoomStatus(null);
    setStatusMessage(null);
    setTemporaryError(false);
  }, []);

  const reconnect = useCallback(async () => {
    isJoinedRef.current = false;
    joinedConversationIdRef.current = null;
    requestedConversationIdRef.current = null;
    setIsConnected(false);
    setError(null);

    await new Promise(resolve => setTimeout(resolve, 300));

    sendJoin();

    toastRef.current({
      title: "Chat reconnecting...",
      description: "Re-establishing connection to chat server",
    });
  }, [sendJoin]);

  return {
    messages,
    sendMessage,
    sendTyping,
    sendStatusChange,
    kickUser,
    silenceUser,
    giveVoice,
    sendRawMessage,
    typingUsers,
    typingUserInfo,
    onlineUsers,
    isConnected,
    isSilenced,
    isInTriage,
    justGotVoice,
    ticketClosed,
    ticketClosedReason,
    error,
    reconnect,
    requiresTicket,
    roomStatus,
    statusMessage,
    temporaryError,
    clearAccessError,
    customBannerMessage,
    readReceipts,
    conversationParticipants,
  };
}
