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
  type: 'conversation_history' | 'new_message' | 'private_message' | 'user_typing' | 'error' | 'system_message' | 'user_list_update' | 'status_change' | 'kicked' | 'secure_request' | 'spectator_released' | 'secure_data_received' | 'banner_update' | 'voice_granted' | 'voice_removed' | 'command_ack' | 'read_receipt' | 'participants_update';
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
}

interface SecureRequestCallback {
  (request: { type: string; requestedBy: string; message?: string }): void;
}

interface ConnectionFailedCallback {
  (attemptCount: number): void;
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
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastConnectAttemptRef = useRef<number>(0);
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
      // Connect to WebSocket server
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // Fix: Use window.location.host for proper host/port resolution
      const wsHost = window.location.host;
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
            case 'conversation_history':
              // Clear chat on join - start fresh, don't show old messages
              setMessages([]);
              break;

            case 'new_message':
              if (data.message && typeof data.message !== 'string') {
                setMessages((prev) => [...prev, data.message as ChatMessage]);
              }
              break;

            case 'private_message':
              // Handle private DMs (e.g., HelpOS welcome messages)
              if (data.message && typeof data.message !== 'string') {
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
                const msgText: string = data.message;
                setMessages((prev) => [...prev, createSystemMessage(msgText, conversationId)]);
              }
              break;

            case 'user_typing':
              // Handle typing indicators - show who is typing (not yourself)
              if (data.userId && data.userId !== userId && data.isTyping !== undefined) {
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
              setIsSilenced(false);
              setJustGotVoice(true);
              setTimeout(() => setJustGotVoice(false), 5000);
              break;

            case 'voice_removed':
              // User was silenced/put in spectator mode
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
              if (data.message && typeof data.message !== 'string') {
                setMessages((prev) => [...prev, data.message as ChatMessage]);
              }
              break;

            case 'kicked':
              // User has been kicked from chat
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

              setMessages((prev) => [...prev, {
                ...createSystemMessage(secureDataSummary.trim(), conversationId),
                senderName: 'SecureChannel' // Override for secure data messages
              }]);
              break;

            case 'banner_update':
              // Staff updated the announcement banner
              if (data.bannerMessage) {
                setCustomBannerMessage(data.bannerMessage);
              }
              // Also add the update notification to chat
              if (data.message && typeof data.message !== 'string') {
                setMessages((prev) => [...prev, data.message as ChatMessage]);
              }
              break;

            case 'read_receipt':
              // Handle read receipts - track who read which message
              if (data.messageId && data.readBy && data.readByName) {
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
                setConversationParticipants((prev) => {
                  const next = new Map(prev);
                  next.set(data.conversationId!, data.participants!);
                  return next;
                });
              }
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
  }, [userId, conversationId]);

  // Send a message
  const sendMessage = useCallback((messageText: string, senderName: string, senderType: 'customer' | 'support' | 'system' = 'support') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to chat server');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      conversationId: conversationId,
      message: messageText,
      senderName: senderName,
      senderType: senderType,
    }));
  }, [conversationId]);

  // Send typing indicator
  const sendTyping = useCallback((isTyping: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !userId) {
      return;
    }

    // Determine if current user is staff
    const currentUser = onlineUsers.find(u => u.id === userId);
    const isStaff = currentUser?.userType === 'staff' || false;

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      userId: userId,
      userName: userName,
      isStaff: isStaff,
      isTyping: isTyping,
    }));
  }, [userId, userName, onlineUsers]);

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

  // Connect on mount and when userId changes
  useEffect(() => {
    if (userId) {
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
  }, [userId]); // Only userId - connect is stable enough via refs

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