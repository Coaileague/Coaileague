import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@shared/schema";

const MAIN_ROOM_ID = 'main-chatroom-workforceos';

interface WebSocketMessage {
  type: 'conversation_history' | 'new_message' | 'user_typing' | 'error';
  messages?: ChatMessage[];
  message?: ChatMessage;
  userId?: string;
  isTyping?: boolean;
  error?: string;
}

export function useChatroomWebSocket(userId: string | undefined, userName: string = 'User') {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!userId) return;

    // Clean up existing connection
    if (wsRef.current) {
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
              if (data.messages) {
                setMessages(data.messages);
              }
              break;

            case 'new_message':
              if (data.message) {
                setMessages((prev) => [...prev, data.message!]);
              }
              break;

            case 'error':
              console.error('WebSocket error:', data.error);
              setError(data.error || 'An error occurred');
              break;

            case 'user_typing':
              // Handle typing indicators if needed
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        
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
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect');
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

  // Connect on mount and when userId changes
  useEffect(() => {
    if (userId) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, userId]);

  return {
    messages,
    sendMessage,
    isConnected,
    error,
    reconnect: connect,
  };
}
