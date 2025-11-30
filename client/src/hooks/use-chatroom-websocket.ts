import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const MAX_RETRIES = 5; // Maximum reconnection attempts before giving up

// IRC-style command ID generator
function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to create properly typed system messages
function createSystemMessage(message: string, conversationId: string): ChatMessage {
  return {
    id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date(),
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
  };
}

interface OnlineUser {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'away' | 'busy';
  userType: 'staff' | 'subscriber' | 'org_user' | 'guest';
}

interface WebSocketMessage {
  type: 'conversation_joined' | 'conversation_history' | 'new_message' | 'private_message' | 'user_typing' | 'error' | 'system_message' | 'user_list_update' | 'status_change' | 'kicked' | 'secure_request' | 'spectator_released' | 'secure_data_received' | 'banner_update' | 'voice_granted' | 'voice_removed' | 'command_ack' | 'read_receipt' | 'participants_update' | 'escalation_redirect';
  messages?: ChatMessage[];
  message?: ChatMessage | string;
  userId?: string;
  isTyping?: boolean;
  typingUserName?: string;
  typingUserIsStaff?: boolean;
  // Read receipt fields
  messageId?: string;
  readBy?: string;
  readByName?: string;
  readAt?: string;
  // Participant fields
  participants?: OnlineUser[];
  conversationId?: string;
  // HelpDesk error fields
  requiresTicket?: boolean;
  roomStatus?: string;
  statusMessage?: string;
  temporaryError?: boolean;
  // User list
  users?: OnlineUser[];
  count?: number;
  // Status updates
  status?: 'online' | 'away' | 'busy';
  userName?: string;
  // Kick
  reason?: string;
  // Secure request fields
  requestType?: string;
  requestedBy?: string;
  // Spectator/release fields
  releasedBy?: string;
  // Secure data fields
  fromUser?: string;
  fromUserId?: string;
  data?: any;
  // Banner update fields
  bannerMessage?: string;
  staffName?: string;
  // IRC-style command acknowledgment fields
  commandId?: string;
  action?: string;
  success?: boolean;
  error?: string;
  targetUserId?: string;
  targetName?: string;
  // Escalation redirect fields
  targetRoom?: string;
  ticketId?: string;
}

interface SecureRequestCallback {
  (request: { type: string; requestedBy: string; message?: string }): void;
}

interface ConnectionFailedCallback {
  (attemptCount: number): void;
}

// Helper function to check if an event belongs to the active conversation
function isForActiveConversation(
  activeConversationId: string,
  data: WebSocketMessage,
  message?: ChatMessage | string
): boolean {
  // For message objects, prefer message.conversationId
  if (message && typeof message !== 'string' && 'conversationId' in message) {
    return message.conversationId === activeConversationId;
  }
  // For metadata events, check data.conversationId
  if (data.conversationId) {
    return data.conversationId === activeConversationId;
  }
  // If no conversationId is present, reject to prevent cross-room bleed (strict security)
  console.warn('[Chat Security] Event received without conversationId - rejecting to prevent cross-room data bleed', data.type);
  return false;
}

export function useChatroomWebSocket(
  userId: string | undefined, 
  userName: string = 'User',
  conversationId: string = 'main-chatroom-workforceos', // Default to main room for backward compatibility
  onSecureRequest?: SecureRequestCallback,
  onConnectionFailed?: ConnectionFailedCallback
) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [typingUserInfo, setTypingUserInfo] = useState<{ name: string; isStaff: boolean } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [customBannerMessage, setCustomBannerMessage] = useState<string | null>(null);
  const [justGotVoice, setJustGotVoice] = useState(false);
  const [isSilenced, setIsSilenced] = useState(false);
  // Track the resolved conversation UUID from backend (may differ from slug parameter)
  const [resolvedConversationId, setResolvedConversationId] = useState<string>(conversationId);
  // Premium chat features
  const [readReceipts, setReadReceipts] = useState<Map<string, { readBy: string; readByName: string; readAt: Date }>>(new Map());
  const [conversationParticipants, setConversationParticipants] = useState<Map<string, OnlineUser[]>>(new Map());
  // HelpDesk access control state
  const [requiresTicket, setRequiresTicket] = useState(false);
  const [roomStatus, setRoomStatus] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [temporaryError, setTemporaryError] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false); // Track if connection is in progress
  const isManualSwitchRef = useRef(false); // Track if we're manually switching conversations
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastConnectAttemptRef = useRef<number>(0);
  const resolvedConversationIdRef = useRef<string>(conversationId); // Synchronous tracking for security checks
  const MIN_RECONNECT_INTERVAL = 1000; // Minimum 1 second between attempts

  const connect = useCallback(() => {
    if (!userId) return;

    // Rate limit connection attempts
    const now = Date.now();
    if (now - lastConnectAttemptRef.current < MIN_RECONNECT_INTERVAL) {
      console.log('⚠️ Connection rate limited, waiting...');
      return;
    }
    lastConnectAttemptRef.current = now;

    // STRICT duplicate connection prevention
    if (isConnectingRef.current) {
      console.log('⚠️ Already connecting, aborting duplicate');
      return;
    }

    if (wsRef.current) {
      const state = wsRef.current.readyState;
      // Block if CONNECTING (0) or OPEN (1) - only allow if CLOSING (2) or CLOSED (3)
      if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
        console.log(`⚠️ WebSocket exists (state: ${state}), aborting duplicate`);
        return;
      }
    }

    console.log('🔌 Creating new WebSocket connection for user:', userId);
    isConnectingRef.current = true;

    // Clean up existing connection if any
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    try {
      // Connect to WebSocket server with fallback for port detection
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // Fallback: if window.location.host is undefined, construct from hostname + port
      const wsHost = window.location.host || 
        (window.location.port 
          ? `${window.location.hostname}:${window.location.port}` 
          : window.location.hostname);
      const wsUrl = `${protocol}://${wsHost}/ws/chat`;
      console.log('🔗 Attempting WebSocket connection to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      console.log('✅ WebSocket object created, state:', ws.readyState);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false; // Connection established
        isManualSwitchRef.current = false; // Reset flag after successful connection

        // Join the specified conversation
        ws.send(JSON.stringify({
          type: 'join_conversation',
          conversationId: conversationId,
          userId: userId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'conversation_joined':
              // Backend acknowledged successful join with resolved conversation UUID
              console.log('✅ Join acknowledged:', data.conversationId);
              // Update local conversation ID to the resolved UUID from backend
              // Use BOTH ref (synchronous) and state (for UI) to handle race conditions
              if (data.conversationId) {
                resolvedConversationIdRef.current = data.conversationId; // Synchronous for immediate security checks
                setResolvedConversationId(data.conversationId); // Async for UI reactivity
              }
              // Stop any reconnection attempts - we're successfully joined
              reconnectAttemptsRef.current = 0;
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = undefined;
              }
              break;

            case 'conversation_history':
              // Load conversation history for the active room
              // CRITICAL: Use ref (synchronous) not state (async) to avoid race condition
              const activeConvId = resolvedConversationIdRef.current;
              console.log('📜 Received conversation_history:', {
                totalMessages: data.messages?.length || 0,
                conversationId: data.conversationId,
                activeConversationId: activeConvId,
                firstMessage: data.messages?.[0],
              });
              if (data.messages && Array.isArray(data.messages)) {
                // Filter messages for active conversation and normalize timestamps
                const filtered = data.messages
                  .filter(msg => isForActiveConversation(activeConvId, data, msg))
                  .map(msg => ({
                    ...msg,
                    createdAt: msg.createdAt instanceof Date ? msg.createdAt : (msg.createdAt ? new Date(msg.createdAt) : new Date()),
                  }));
                console.log('📜 Filtered messages:', {
                  before: data.messages.length,
                  after: filtered.length,
                  sample: filtered[0],
                });
                setMessages(filtered);
              } else {
                // No history available - start with empty state
                console.log('📜 No history available, starting with empty state');
                setMessages([]);
              }
              break;

            case 'new_message':
              if (data.message && typeof data.message !== 'string') {
                // Filter by conversationId to prevent message bleed (use ref for sync access)
                if (!isForActiveConversation(resolvedConversationIdRef.current, data, data.message as ChatMessage)) {
                  break;
                }
                setMessages((prev) => [...prev, data.message as ChatMessage]);
              }
              break;

            case 'private_message':
              // Handle private DMs (e.g., HelpAI welcome messages)
              if (data.message && typeof data.message !== 'string') {
                // Filter by conversationId to prevent message bleed (use ref for sync access)
                if (!isForActiveConversation(resolvedConversationIdRef.current, data, data.message as ChatMessage)) {
                  break;
                }
                setMessages((prev) => [...prev, data.message as ChatMessage]);
              }
              break;

            case 'error':
              const errorMessage = typeof data.message === 'string' ? data.message : 'An error occurred';
              console.error('WebSocket error:', errorMessage);
              setError(errorMessage);

              // Extract HelpDesk access control fields
              if (data.requiresTicket) {
                setRequiresTicket(true);
              }
              if (data.roomStatus) {
                setRoomStatus(data.roomStatus);
              }
              if (data.statusMessage) {
                setStatusMessage(data.statusMessage);
              }
              if (data.temporaryError) {
                setTemporaryError(true);
              }
              break;

            case 'system_message':
              // Handle system messages (e.g., help command response)
              if (data.message && typeof data.message === 'string') {
                // Filter by conversationId to prevent message bleed
                if (!isForActiveConversation(resolvedConversationId, data)) {
                  break;
                }
                const msgText: string = data.message;
                // Use payload's conversationId if available, otherwise use hook parameter
                const messageConvId = data.conversationId || conversationId;
                setMessages((prev) => [...prev, createSystemMessage(msgText, messageConvId)]);
              }
              break;

            case 'user_typing':
              // Handle typing indicators - show who is typing (not yourself)
              if (data.userId && data.userId !== userId && data.isTyping !== undefined) {
                // Filter by conversationId to prevent cross-room typing indicators
                if (!isForActiveConversation(resolvedConversationId, data)) {
                  break;
                }
                
                if (data.isTyping && data.typingUserName) {
                  // Set typing user info for display
                  setTypingUserInfo({
                    name: data.typingUserName,
                    isStaff: data.typingUserIsStaff || false
                  });

                  // Auto-clear after 3 seconds
                  const timeout = setTimeout(() => {
                    setTypingUserInfo(null);
                  }, 3000);

                  // Clear any existing timeout
                  const existing = typingTimeoutRef.current.get(data.userId);
                  if (existing) clearTimeout(existing);
                  typingTimeoutRef.current.set(data.userId, timeout);
                } else {
                  // Clear typing indicator
                  setTypingUserInfo(null);
                  const existing = typingTimeoutRef.current.get(data.userId);
                  if (existing) {
                    clearTimeout(existing);
                    typingTimeoutRef.current.delete(data.userId);
                  }
                }

                // Still track in set for compatibility
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

            case 'voice_granted':
              // User was granted voice permission
              // Filter by conversationId to prevent cross-room moderation bleed
              if (!isForActiveConversation(resolvedConversationId, data)) {
                break;
              }
              setIsSilenced(false);
              setJustGotVoice(true);
              setTimeout(() => setJustGotVoice(false), 5000);
              break;

            case 'voice_removed':
              // User was silenced/put in spectator mode
              // Filter by conversationId to prevent cross-room moderation bleed
              if (!isForActiveConversation(resolvedConversationId, data)) {
                break;
              }
              setIsSilenced(true);
              setJustGotVoice(false);
              break;

            case 'command_ack':
              // IRC-style command acknowledgment from server
              if (data.success) {
                // Command succeeded - show success toast
                const successMessage = typeof data.message === 'string' ? data.message : `${data.targetName || 'User'} • Action completed successfully`;
                toast({
                  title: `✓ ${data.action === 'kick_user' ? 'User Removed' : 'Action Complete'}`,
                  description: successMessage,
                });
              } else {
                // Command failed - show error toast
                const errorMessage = typeof data.message === 'string' ? data.message : `Could not complete ${data.action}`;
                toast({
                  title: `❌ Action Failed`,
                  description: errorMessage,
                  variant: "destructive",
                });
              }
              break;

            case 'user_list_update':
              // Handle real-time user presence updates
              // Filter by conversationId to prevent cross-room roster bleed
              // Accept BOTH the original slug AND resolved UUID (from ref for synchronous access)
              const matchesSlug = isForActiveConversation(conversationId, data);
              const matchesResolved = isForActiveConversation(resolvedConversationIdRef.current, data);
              if (!matchesSlug && !matchesResolved) {
                console.warn('[Chat Security] user_list_update rejected - conversationId mismatch', {
                  expected: { slug: conversationId, resolved: resolvedConversationIdRef.current },
                  received: data.conversationId
                });
                break;
              }
              if (data.users && Array.isArray(data.users)) {
                // Deduplicate users by ID - keep only the last occurrence of each user
                const uniqueUsersMap = new Map<string, OnlineUser>();
                data.users.forEach(user => {
                  uniqueUsersMap.set(user.id, user);
                });
                const deduplicatedUsers = Array.from(uniqueUsersMap.values());
                console.log('👥 User list updated:', deduplicatedUsers.length, 'online');
                setOnlineUsers(deduplicatedUsers);
              }
              break;

            case 'status_change':
              // Filter by conversationId to prevent cross-room status updates
              if (data.message && typeof data.message !== 'string') {
                if (isForActiveConversation(resolvedConversationId, data, data.message as ChatMessage)) {
                  setMessages((prev) => [...prev, data.message as ChatMessage]);
                }
              }
              break;

            case 'kicked':
              // User has been kicked from chat
              // Filter by conversationId to prevent cross-room kick events
              if (!isForActiveConversation(resolvedConversationId, data)) {
                break;
              }
              const kickMessage = typeof data.message === 'string' ? data.message : 'You have been removed from the chat';
              setError(kickMessage);
              setIsConnected(false);
              if (wsRef.current) {
                wsRef.current.close();
              }
              alert(`⚠️ Removed from chat\n\nReason: ${data.reason || 'violation of chat rules'}`);
              break;

            case 'secure_request':
              // Staff requested secure information from this user
              if (onSecureRequest && (data as any).requestType) {
                onSecureRequest({
                  type: (data as any).requestType,
                  requestedBy: (data as any).requestedBy || 'Support Staff',
                  message: (data as any).message,
                });
              }
              break;

            case 'spectator_released':
              // User was released from hold/spectator mode
              setMessages((prev) => [...prev, createSystemMessage(
                `${(data as any).releasedBy} has released you from hold. You can now chat.`,
                conversationId
              )]);
              break;

            case 'secure_data_received':
              // Staff received secure data from a user - show in chat as formatted message
              // Filter by conversationId to prevent message bleed
              if (!isForActiveConversation(resolvedConversationId, data)) {
                break;
              }
              const secureData = (data as any).data;
              let secureDataSummary = `🔒 Secure Data from ${(data as any).fromUser}:\n`;

              // Format the secure data safely for display
              if (secureData.email) secureDataSummary += `📧 Email: ${secureData.email}\n`;
              if (secureData.accountId) secureDataSummary += `🆔 Account ID: ${secureData.accountId}\n`;
              if (secureData.verification) secureDataSummary += `✓ Verification: ${secureData.verification}\n`;
              if (secureData.fullName) secureDataSummary += `📝 Full Name: ${secureData.fullName}\n`;
              if (secureData.agreed) secureDataSummary += `✅ Agreed to terms\n`;
              if (secureData.response) secureDataSummary += `💬 Response: ${secureData.response}\n`;
              if (secureData.notes) secureDataSummary += `📋 Notes: ${secureData.notes}\n`;
              if (secureData.description) secureDataSummary += `📝 Description: ${secureData.description}\n`;
              if (secureData.file) secureDataSummary += `📎 File uploaded: ${secureData.file.name || 'document'}\n`;

              const messageConvId = data.conversationId || conversationId;
              setMessages((prev) => [...prev, {
                ...createSystemMessage(secureDataSummary.trim(), messageConvId),
                senderName: 'SecureChannel' // Override for secure data messages
              }]);
              break;

            case 'banner_update':
              // Staff updated the announcement banner
              // Filter by conversationId to prevent cross-room updates
              if (!isForActiveConversation(resolvedConversationId, data)) {
                break;
              }
              if (data.bannerMessage) {
                setCustomBannerMessage(data.bannerMessage);
              }
              // Also add the update notification to chat
              if (data.message && typeof data.message !== 'string') {
                if (isForActiveConversation(resolvedConversationId, data, data.message as ChatMessage)) {
                  setMessages((prev) => [...prev, data.message as ChatMessage]);
                }
              }
              break;

            case 'read_receipt':
              // Handle read receipts - track who read which message
              if (data.messageId && data.readBy && data.readByName) {
                // Filter by conversationId to prevent cross-room read receipt bleed
                if (!isForActiveConversation(resolvedConversationId, data)) {
                  break;
                }
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
              // Handle conversation participant updates
              if (data.conversationId && data.participants) {
                // Filter by conversationId - only update if it matches active conversation
                if (!isForActiveConversation(resolvedConversationId, data)) {
                  break;
                }
                setConversationParticipants((prev) => {
                  const next = new Map(prev);
                  next.set(data.conversationId!, data.participants!);
                  return next;
                });
              }
              break;

            case 'escalation_redirect':
              // HelpAI bot escalated - redirect user to main HelpDesk where staff can help
              console.log('🔄 Bot escalation - redirecting to main HelpDesk');
              if (data.message) {
                toast({
                  title: "Connecting you with support team",
                  description: typeof data.message === 'string' ? data.message : 'Redirecting to HelpDesk...',
                  duration: 3000,
                });
              }
              // Redirect to main HelpDesk room after a short delay (let user see the message)
              setTimeout(() => {
                if (data.targetRoom) {
                  // Use window.location to ensure a full navigation to the HelpDesk
                  window.location.href = `/helpdesk`;
                }
              }, 1500);
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        isConnectingRef.current = false; // Reset connection flag

        // Skip auto-reconnect if this is a manual conversation switch
        if (isManualSwitchRef.current) {
          console.log('⚠️ Skipping auto-reconnect (manual conversation switch)');
          return;
        }

        // Check if we've exceeded max retry attempts
        if (reconnectAttemptsRef.current >= MAX_RETRIES) {
          console.error(`❌ Failed to connect after ${MAX_RETRIES} attempts`);
          setError(`Unable to connect to chat server after ${MAX_RETRIES} attempts`);
          
          // Call the failure callback if provided
          if (onConnectionFailed) {
            onConnectionFailed(reconnectAttemptsRef.current);
          }
          return; // Stop trying to reconnect
        }

        // Attempt to reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current}/${MAX_RETRIES})`);
          connect();
        }, delay);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error');
        isConnectingRef.current = false; // Reset on error
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      console.error('Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      setError(err instanceof Error ? err.message : 'Failed to connect');
      isConnectingRef.current = false; // Reset on error
    }
  }, [userId, conversationId, userName]);

  // Send a message
  const sendMessage = useCallback((messageText: string, senderName: string, senderType: 'customer' | 'support' | 'system' = 'support') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to chat server');
      return;
    }

    // Use resolved conversation ID (UUID) if available, otherwise fall back to conversationId
    // The backend will handle slug-to-UUID resolution if needed
    const targetConversationId = resolvedConversationIdRef.current || conversationId;
    
    if (!targetConversationId) {
      console.warn('[Chat] No conversation ID available');
      setError('Chat not initialized');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      conversationId: targetConversationId,
      message: messageText,
      senderName: senderName,
      senderType: senderType,
    }));
  }, [conversationId]); // Include dependency to avoid stale closures

  // Send typing indicator
  const sendTyping = useCallback((isTyping: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !userId) {
      return;
    }

    // Determine if current user is staff
    const currentUser = onlineUsers.find(u => u.id === userId);
    const isStaff = currentUser?.userType === 'staff' || false;

    // Use resolved conversation ID (UUID) if available, otherwise fall back to conversationId
    const targetConversationId = resolvedConversationIdRef.current || conversationId;
    if (!targetConversationId) {
      return; // Silently skip typing indicator if no conversation ID
    }

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      conversationId: targetConversationId,
      userId: userId,
      userName: userName,
      isStaff: isStaff,
      isTyping: isTyping,
    }));
  }, [userId, userName, onlineUsers, conversationId]); // Keep dependencies to avoid stale closures

  // Send status change
  const sendStatusChange = useCallback((status: 'online' | 'away' | 'busy') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !userId) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'status_change',
      userId: userId,
      status: status,
    }));
  }, [userId]);

  // Silence a user (staff only) - IRC-style with command ID for acknowledgment
  const silenceUser = useCallback((targetUserId: string, duration?: number, reason?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const commandId = generateCommandId();
    wsRef.current.send(JSON.stringify({
      type: 'silence_user',
      targetUserId: targetUserId,
      duration: duration || 5,
      reason: reason || 'Chat violation',
      commandId: commandId, // IRC-style command tracking
    }));
  }, []);

  // Give voice to a user (staff only) - IRC-style with command ID for acknowledgment
  const giveVoice = useCallback((targetUserId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const commandId = generateCommandId();
    wsRef.current.send(JSON.stringify({
      type: 'give_voice',
      targetUserId: targetUserId,
      commandId: commandId, // IRC-style command tracking
    }));
  }, []);

  // Kick a user (staff only) - IRC-style with command ID for acknowledgment
  const kickUser = useCallback((targetUserId: string, reason?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const commandId = generateCommandId();
    wsRef.current.send(JSON.stringify({
      type: 'kick_user',
      targetUserId: targetUserId,
      reason: reason || 'violation of chat rules',
      commandId: commandId, // IRC-style command tracking
    }));
  }, []);

  // Send raw WebSocket message (for custom actions)
  // Accepts string commands OR object payloads
  const sendRawMessage = useCallback((data: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // If data is already a string, send as-is (for backward compatibility)
    // Otherwise, JSON stringify objects
    if (typeof data === 'string') {
      wsRef.current.send(data);
    } else {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Connect on mount and when userId or conversationId changes
  useEffect(() => {
    if (userId) {
      // If switching conversations, send leave_conversation and close existing connection
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.OPEN) {
          // Send explicit leave_conversation to prevent stale socket events
          console.log(`📤 Leaving previous conversation before switching to: ${conversationId}`);
          try {
            wsRef.current.send(JSON.stringify({
              type: 'leave_conversation',
              userId: userId,
            }));
          } catch (err) {
            console.warn('Failed to send leave_conversation:', err);
          }
        }
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.log(`🔌 Closing WebSocket for conversation switch to: ${conversationId}`);
          isManualSwitchRef.current = true; // Set flag to suppress auto-reconnect
          wsRef.current.close();
          wsRef.current = null;
          isConnectingRef.current = false;
        }
      }
      
      // Clear state for new conversation
      setMessages([]);
      setOnlineUsers([]);
      setConversationParticipants(new Map());
      setReadReceipts(new Map());
      
      // Connect to new conversation (flag will be reset in onopen)
      connect();
    }

    // Cleanup on unmount - PROPERLY close connection
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        // Close if CONNECTING or OPEN
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.log('🔌 Closing WebSocket on cleanup');
          wsRef.current.close();
        }
        // Reset connection flag so next mount can connect
        isConnectingRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, conversationId]); // Reconnect when either userId or conversationId changes

  // Clear access error state (call after successful ticket verification)
  const clearAccessError = useCallback(() => {
    setError(null);
    setRequiresTicket(false);
    setRoomStatus(null);
    setStatusMessage(null);
    setTemporaryError(false);
  }, []);

  // Reconnect function for manual resets (IRC /hop-style)
  const reconnect = useCallback(async () => {
    console.log('🔄 Manual reconnect triggered');
    
    // Clear existing connection
    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        console.log('Closing existing connection for reconnect');
        wsRef.current.close(1000, 'Manual reconnect');
      }
    }
    
    // Clear reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Reset flags and retry counter for manual reconnect
    isConnectingRef.current = false;
    reconnectAttemptsRef.current = 0; // Reset retry counter
    setIsConnected(false);
    setError(null);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Reconnect
    connect();
    
    toast({
      title: "Chat reconnecting...",
      description: "Re-establishing connection to chat server",
    });
  }, [connect, toast]);

  return {
    messages,
    sendMessage,
    sendTyping,
    sendStatusChange,
    // IRC-style moderation commands with command acknowledgments
    kickUser,
    silenceUser,
    giveVoice,
    sendRawMessage,
    typingUsers,
    typingUserInfo,
    onlineUsers,
    isConnected,
    isSilenced,
    justGotVoice,
    error,
    reconnect, // Enhanced reconnect with feedback
    // HelpDesk access control
    requiresTicket,
    roomStatus,
    statusMessage,
    temporaryError,
    clearAccessError,
    // Banner updates
    customBannerMessage,
    // Premium chat features
    readReceipts,
    conversationParticipants,
  };
}