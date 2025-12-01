/**
 * Global hook that listens for chatroom notifications across all rooms
 * Shows toast notifications when user gets new messages or is added to chatrooms
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface ChatroomNotification {
  type: 'new_chatroom_message' | 'user_added_to_chatroom' | 'chatroom_invitation';
  chatroomId: string;
  chatroomName: string;
  senderName?: string;
  messagePreview?: string;
  timestamp: number;
}

export function useChatroomNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const wsRef = useRef<WebSocket | null>(null);
  const lastNotificationRef = useRef<Map<string, number>>(new Map()); // Prevent duplicate toasts

  useEffect(() => {
    if (!user?.id) return;

    const connectNotificationWS = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsHost = window.location.host || 
          (window.location.port 
            ? `${window.location.hostname}:${window.location.port}` 
            : window.location.hostname);
        
        // Separate WebSocket for notifications (doesn't join specific room)
        const wsUrl = `${protocol}://${wsHost}/ws/notifications`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[ChatroomNotifications] WebSocket connected');
          // Send user ID to identify for notifications
          ws.send(JSON.stringify({
            type: 'subscribe_notifications',
            userId: user.id,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleNotification(data);
          } catch (e) {
            console.error('[ChatroomNotifications] Failed to parse message:', e);
          }
        };

        ws.onerror = (error) => {
          console.error('[ChatroomNotifications] WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('[ChatroomNotifications] WebSocket closed, reconnecting in 3s...');
          setTimeout(connectNotificationWS, 3000);
        };

        wsRef.current = ws;
      } catch (e) {
        console.error('[ChatroomNotifications] Failed to create WebSocket:', e);
        setTimeout(connectNotificationWS, 3000);
      }
    };

    const handleNotification = (notification: ChatroomNotification) => {
      // Prevent duplicate toasts within 2 seconds
      const key = `${notification.chatroomId}-${notification.type}`;
      const lastTime = lastNotificationRef.current.get(key);
      if (lastTime && Date.now() - lastTime < 2000) {
        return;
      }
      lastNotificationRef.current.set(key, Date.now());

      // Only show if not currently viewing this chatroom
      const currentPath = window.location.pathname;
      const isChatroomActive = currentPath.includes(`/chatrooms/${notification.chatroomId}`) || 
                               currentPath.includes(`/chat/${notification.chatroomId}`);
      
      if (isChatroomActive) return;

      if (notification.type === 'new_chatroom_message') {
        toast({
          title: `💬 ${notification.chatroomName}`,
          description: notification.messagePreview || `${notification.senderName} sent a message`,
        });
        // Auto-navigate after short delay
        setTimeout(() => setLocation(`/chatrooms/${notification.chatroomId}`), 1000);
      } else if (notification.type === 'user_added_to_chatroom' || notification.type === 'chatroom_invitation') {
        toast({
          title: `👥 Added to ${notification.chatroomName}`,
          description: 'Tap to join the conversation',
        });
        // Auto-navigate after short delay
        setTimeout(() => setLocation(`/chatrooms/${notification.chatroomId}`), 1500);
      }
    };

    connectNotificationWS();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user?.id, toast, setLocation]);
}
