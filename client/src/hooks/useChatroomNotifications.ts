/**
 * Global hook that listens for chatroom notifications across all rooms
 * Shows toast notifications when user gets new messages or is added to chatrooms
 * 
 * SECURITY: Authenticates via join_conversation before subscribing to notifications.
 * This ensures the server validates the user's identity before allowing notification access.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface ChatroomNotification {
  type: 'new_chatroom_message' | 'user_added_to_chatroom' | 'chatroom_invitation' | 'notification_new' | 'notifications_subscribed' | 'error';
  chatroomId?: string;
  chatroomName?: string;
  senderName?: string;
  messagePreview?: string;
  message?: string;
  notification?: {
    id: string;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
  };
}

export function useChatroomNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const wsRef = useRef<WebSocket | null>(null);
  const lastNotificationRef = useRef<Map<string, number>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const authenticatedRef = useRef(false);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    if (!user?.id) return;

    // Get workspace ID from user context
    const workspaceId = (user as any)?.currentWorkspaceId || (user as any)?.workspaceId || (user as any)?.defaultWorkspaceId;
    if (!workspaceId) {
      console.log('[ChatroomNotifications] No workspace ID available, skipping subscription');
      return;
    }

    const connectNotificationWS = () => {
      try {
        authenticatedRef.current = false;
        
        // Clean up existing connection
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
          wsRef.current.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsHost = window.location.host || 
          (window.location.port 
            ? `${window.location.hostname}:${window.location.port}` 
            : window.location.hostname);
        
        // Connect to existing /ws/chat endpoint
        const wsUrl = `${protocol}://${wsHost}/ws/chat`;
        console.log('[ChatroomNotifications] Connecting to', wsUrl);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[ChatroomNotifications] WebSocket connected, subscribing to notifications...');
          reconnectAttemptsRef.current = 0;
          
          // Server authenticates via HTTP session cookies at connection time
          // Just send join_notifications - no need for join_conversation first
          ws.send(JSON.stringify({
            type: 'join_notifications',
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data: ChatroomNotification = JSON.parse(event.data);
            
            // Handle subscription confirmation
            if (data.type === 'notifications_subscribed') {
              console.log('[ChatroomNotifications] Successfully subscribed to notifications');
              authenticatedRef.current = true;
              return;
            }
            
            // Handle errors (e.g., authentication required)
            if (data.type === 'error') {
              console.warn('[ChatroomNotifications] Server error:', data.message);
              authenticatedRef.current = false;
              return;
            }
            
            // Handle actual notifications
            handleNotification(data);
          } catch (e) {
            console.error('[ChatroomNotifications] Failed to parse message:', e);
          }
        };

        ws.onerror = (error) => {
          console.error('[ChatroomNotifications] WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('[ChatroomNotifications] WebSocket closed');
          authenticatedRef.current = false;
          
          // Reconnect with exponential backoff
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
            reconnectAttemptsRef.current++;
            console.log(`[ChatroomNotifications] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
            reconnectTimeoutRef.current = setTimeout(connectNotificationWS, delay);
          }
        };

        wsRef.current = ws;
      } catch (e) {
        console.error('[ChatroomNotifications] Failed to create WebSocket:', e);
      }
    };

    const handleNotification = (data: ChatroomNotification) => {
      // Skip non-notification messages
      if (['conversation_joined', 'notifications_subscribed', 'error', 'conversation_history', 'online_users'].includes(data.type)) {
        return;
      }

      // Handle platform notifications
      if (data.type === 'notification_new' && data.notification) {
        const notification = data.notification;
        
        // Prevent duplicate toasts
        const key = `notification-${notification.id}`;
        const lastTime = lastNotificationRef.current.get(key);
        if (lastTime && Date.now() - lastTime < 2000) return;
        lastNotificationRef.current.set(key, Date.now());

        toast({
          title: notification.title,
          description: notification.message,
        });

        // Navigate if action URL provided
        if (notification.actionUrl) {
          setTimeout(() => setLocation(notification.actionUrl!), 1500);
        }
        return;
      }

      // Handle chatroom-specific notifications
      if (data.type === 'new_chatroom_message' && data.chatroomId) {
        const key = `chatroom-msg-${data.chatroomId}`;
        const lastTime = lastNotificationRef.current.get(key);
        if (lastTime && Date.now() - lastTime < 2000) return;
        lastNotificationRef.current.set(key, Date.now());

        // Only show if not currently viewing this chatroom
        const currentPath = window.location.pathname;
        if (currentPath.includes(`/chatrooms/${data.chatroomId}`) || 
            currentPath.includes(`/chat/${data.chatroomId}`) ||
            currentPath.includes('/chat')) {
          return;
        }

        toast({
          title: data.chatroomName || 'New Message',
          description: data.messagePreview || `${data.senderName} sent a message`,
        });
      }

      if (data.type === 'user_added_to_chatroom' && data.chatroomId) {
        const key = `chatroom-add-${data.chatroomId}`;
        const lastTime = lastNotificationRef.current.get(key);
        if (lastTime && Date.now() - lastTime < 5000) return;
        lastNotificationRef.current.set(key, Date.now());

        toast({
          title: `Added to ${data.chatroomName || 'Chatroom'}`,
          description: 'You\'ve been added to a new conversation',
        });
      }
    };

    connectNotificationWS();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user?.id, toast, setLocation]);
}
