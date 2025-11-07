import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface NotificationWebSocketMessage {
  type: 'notification_new' | 'notification_read' | 'notification_count_updated' | 'notifications_subscribed' | 'error';
  notification?: any;
  unreadCount?: number;
  timestamp?: string;
  workspaceId?: string;
  message?: string;
}

export function useNotificationWebSocket(userId: string | undefined, workspaceId: string | undefined) {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  const MIN_RECONNECT_INTERVAL = 1000;
  const lastConnectAttemptRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (!userId || !workspaceId) return;

    // Rate limit connection attempts
    const now = Date.now();
    if (now - lastConnectAttemptRef.current < MIN_RECONNECT_INTERVAL) {
      console.log('⚠️ Notification WS: Connection rate limited, waiting...');
      return;
    }
    lastConnectAttemptRef.current = now;

    // Prevent duplicate connections
    if (isConnectingRef.current) {
      console.log('⚠️ Notification WS: Already connecting, aborting duplicate');
      return;
    }

    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
        console.log(`⚠️ Notification WS: WebSocket exists (state: ${state}), aborting duplicate`);
        return;
      }
    }

    console.log('🔔 Creating notification WebSocket connection for workspace:', workspaceId);
    isConnectingRef.current = true;

    // Clean up existing connection
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsHost = window.location.host;
      const wsUrl = `${protocol}://${wsHost}/ws/chat`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🔔 Notification WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false;

        // Subscribe to notifications for this user
        ws.send(JSON.stringify({
          type: 'join_notifications',
          userId,
          workspaceId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data: NotificationWebSocketMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'notifications_subscribed':
              console.log('✅ Subscribed to notifications for workspace:', data.workspaceId);
              if (data.unreadCount !== undefined) {
                setUnreadCount(data.unreadCount);
              }
              break;

            case 'notification_new':
              console.log('🔔 New notification received:', data.notification?.title);
              // Invalidate notifications query to refetch data
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              
              // Update unread count
              if (data.unreadCount !== undefined) {
                setUnreadCount(data.unreadCount);
              }
              
              // Show toast notification
              if (data.notification) {
                toast({
                  title: data.notification.title,
                  description: data.notification.message,
                  variant: "info" as any,
                });
              }
              break;

            case 'notification_read':
              console.log('📖 Notification marked as read');
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              if (data.unreadCount !== undefined) {
                setUnreadCount(data.unreadCount);
              }
              break;

            case 'notification_count_updated':
              console.log('🔢 Notification count updated:', data.unreadCount);
              if (data.unreadCount !== undefined) {
                setUnreadCount(data.unreadCount);
              }
              break;

            case 'error':
              const errorMessage = data.message || 'An error occurred';
              console.error('Notification WebSocket error:', errorMessage);
              setError(errorMessage);
              break;

            default:
              // Ignore other message types
              break;
          }
        } catch (err) {
          console.error('Failed to parse notification WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('🔔 Notification WebSocket disconnected');
        setIsConnected(false);
        isConnectingRef.current = false;

        // Attempt to reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Notification WS: Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
          connect();
        }, delay);
      };

      ws.onerror = (error) => {
        console.error('Notification WebSocket error:', error);
        setError('Connection error');
        isConnectingRef.current = false;
      };
    } catch (err) {
      console.error('Failed to create notification WebSocket:', err);
      setError('Failed to connect');
      isConnectingRef.current = false;
    }
  }, [userId, workspaceId, toast]);

  // Connect on mount and when userId/workspaceId changes
  useEffect(() => {
    if (userId && workspaceId) {
      connect();
    }

    // Cleanup on unmount AND when userId/workspaceId changes
    return () => {
      console.log('🔔 Cleaning up notification WebSocket (unmount or user/workspace change)');
      
      // Clear reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Close existing connection
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.log('🔔 Closing notification WebSocket connection');
          wsRef.current.close();
        }
        wsRef.current = null;
      }
      
      // Reset connection state
      isConnectingRef.current = false;
      setIsConnected(false);
      setError(null);
    };
  }, [userId, workspaceId, connect]);

  return {
    isConnected,
    unreadCount,
    error,
    reconnect: connect,
  };
}
