import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@shared/schema";

const MAIN_ROOM_ID = 'main-chatroom-workforceos';

interface OnlineUser {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface WebSocketMessage {
  type: 'conversation_history' | 'new_message' | 'user_typing' | 'error' | 'system_message' | 'user_list_update';
  messages?: ChatMessage[];
  message?: ChatMessage | string;
  userId?: string;
  isTyping?: boolean;
  // HelpDesk error fields
  requiresTicket?: boolean;
  roomStatus?: string;
  statusMessage?: string;
  temporaryError?: boolean;
  // User list
  users?: OnlineUser[];
  count?: number;
}

export function useChatroomWebSocket(userId: string | undefined, userName: string = 'User') {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
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

  const connect = useCallback(() => {
    if (!userId) return;
    
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
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false; // Connection established

        // Join the main chatroom
        ws.send(JSON.stringify({
          type: 'join_conversation',
          conversationId: MAIN_ROOM_ID,
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
                const systemMsg: ChatMessage = {
                  id: `system-${Date.now()}`,
                  createdAt: new Date(),
                  conversationId: 'main-chatroom-workforceos',
                  senderId: null,
                  senderName: 'System',
                  senderType: 'system',
                  message: data.message,
                  messageType: 'text',
                  isSystemMessage: true,
                  attachmentUrl: null,
                  attachmentName: null,
                  isRead: null,
                  readAt: null,
                };
                setMessages((prev) => [...prev, systemMsg]);
              }
              break;

            case 'user_typing':
              // Handle typing indicators
              if (data.userId && data.isTyping !== undefined) {
                setTypingUsers((prev) => {
                  const next = new Set(prev);
                  
                  if (data.isTyping) {
                    next.add(data.userId!);
                    
                    // Auto-remove after 3 seconds
                    const existing = typingTimeoutRef.current.get(data.userId!);
                    if (existing) clearTimeout(existing);
                    
                    const timeout = setTimeout(() => {
                      setTypingUsers((p) => {
                        const n = new Set(p);
                        n.delete(data.userId!);
                        return n;
                      });
                      typingTimeoutRef.current.delete(data.userId!);
                    }, 3000);
                    
                    typingTimeoutRef.current.set(data.userId!, timeout);
                  } else {
                    next.delete(data.userId!);
                    const existing = typingTimeoutRef.current.get(data.userId!);
                    if (existing) {
                      clearTimeout(existing);
                      typingTimeoutRef.current.delete(data.userId!);
                    }
                  }
                  
                  return next;
                });
              }
              break;

            case 'user_list_update':
              // Handle real-time user presence updates
              if (data.users && Array.isArray(data.users)) {
                console.log('👥 User list updated:', data.users.length, 'online');
                setOnlineUsers(data.users);
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
        
        // Attempt to reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
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
      setError('Failed to connect');
      isConnectingRef.current = false; // Reset on error
    }
  }, [userId]);

  // Send a message
  const sendMessage = useCallback((messageText: string, senderName: string, senderType: 'customer' | 'support' | 'system' = 'support') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to chat server');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      conversationId: MAIN_ROOM_ID,
      message: messageText,
      senderName: senderName,
      senderType: senderType,
    }));
  }, []);
  
  // Send typing indicator
  const sendTyping = useCallback((isTyping: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !userId) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      userId: userId,
      isTyping: isTyping,
    }));
  }, [userId]);

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

  return {
    messages,
    sendMessage,
    sendTyping,
    typingUsers,
    onlineUsers,
    isConnected,
    error,
    reconnect: connect,
    // HelpDesk access control
    requiresTicket,
    roomStatus,
    statusMessage,
    temporaryError,
    clearAccessError,
  };
}
