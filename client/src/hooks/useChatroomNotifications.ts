/**
 * Global hook that listens for chatroom notifications across all rooms
 * Shows toast notifications when user gets new messages or is added to chatrooms
 * 
 * Uses the unified WebSocketProvider bus instead of creating its own connection.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { useWebSocketBus } from '@/providers/WebSocketProvider';

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
  const bus = useWebSocketBus();
  const lastNotificationRef = useRef<Map<string, number>>(new Map());
  const hasSentJoinRef = useRef(false);
  
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!user?.id || !bus) return;

    const workspaceId = (user as any)?.currentWorkspaceId || (user as any)?.workspaceId || (user as any)?.defaultWorkspaceId;
    if (!workspaceId) return;

    const sendJoinNotifications = () => {
      if (!hasSentJoinRef.current && bus.isConnected()) {
        bus.send({ type: 'join_notifications' });
        hasSentJoinRef.current = true;
      }
    };

    sendJoinNotifications();

    const unsubConnect = bus.subscribe('__ws_connected', () => {
      hasSentJoinRef.current = false;
      sendJoinNotifications();
    });

    const handleNotification = (data: ChatroomNotification) => {
      if (['conversation_joined', 'notifications_subscribed', 'error', 'conversation_history', 'online_users'].includes(data.type)) {
        return;
      }
      
      const roomInvalidatingEvents = ['new_chatroom_message', 'user_added_to_chatroom', 'chatroom_invitation'];
      if (roomInvalidatingEvents.includes(data.type)) {
        queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms'] });
      }

      if (data.type === 'notification_new' && data.notification) {
        const notification = data.notification;
        
        const key = `notification-${notification.id}`;
        const lastTime = lastNotificationRef.current.get(key);
        if (lastTime && Date.now() - lastTime < 2000) return;
        lastNotificationRef.current.set(key, Date.now());

        toastRef.current({
          title: notification.title,
          description: notification.message,
        });

        if (notification.actionUrl) {
          setTimeout(() => window.location.href = notification.actionUrl!, 1500);
        }
        return;
      }

      if (data.type === 'new_chatroom_message' && data.chatroomId) {
        const key = `chatroom-msg-${data.chatroomId}`;
        const lastTime = lastNotificationRef.current.get(key);
        if (lastTime && Date.now() - lastTime < 2000) return;
        lastNotificationRef.current.set(key, Date.now());

        const currentPath = window.location.pathname;
        if (currentPath.includes(`/chatrooms/${data.chatroomId}`) || 
            currentPath.includes(`/chat/${data.chatroomId}`) ||
            currentPath.includes('/chatrooms') ||
            currentPath.includes('/chat')) {
          return;
        }

        toastRef.current({
          title: data.chatroomName || 'New Message',
          description: data.messagePreview || `${data.senderName} sent a message`,
        });
      }

      if (data.type === 'user_added_to_chatroom' && data.chatroomId) {
        const key = `chatroom-add-${data.chatroomId}`;
        const lastTime = lastNotificationRef.current.get(key);
        if (lastTime && Date.now() - lastTime < 5000) return;
        lastNotificationRef.current.set(key, Date.now());

        toastRef.current({
          title: `Added to ${data.chatroomName || 'Chatroom'}`,
          description: 'You\'ve been added to a new conversation',
        });
      }
    };

    const unsubs = [
      unsubConnect,
      bus.subscribe('new_chatroom_message', (data) => handleNotification(data)),
      bus.subscribe('user_added_to_chatroom', (data) => handleNotification(data)),
      bus.subscribe('chatroom_invitation', (data) => handleNotification(data)),
      bus.subscribe('notification_new', (data) => handleNotification(data)),
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
      hasSentJoinRef.current = false;
    };
  }, [user?.id, bus]);
}
