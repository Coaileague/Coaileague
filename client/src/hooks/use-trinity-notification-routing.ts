/**
 * Trinity Notification Routing Hook
 * 
 * Connects the ThoughtManager's proactive insights to the notification system.
 * AI insights and task suggestions are routed to the notification bell
 * instead of appearing as floating mascot bubbles.
 */

import { useEffect, useCallback } from 'react';
import { thoughtManager, type TrinityNotificationCallback } from '@/lib/mascot/ThoughtManager';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';

interface UseTrinityNotificationRoutingOptions {
  enabled?: boolean;
  userId?: string;
  workspaceId?: string;
}

export function useTrinityNotificationRouting({
  enabled = true,
  userId,
  workspaceId,
}: UseTrinityNotificationRoutingOptions = {}) {
  const { toast } = useToast();

  const handleNotification: TrinityNotificationCallback = useCallback(
    async (notification) => {
      try {
        // Post notification to the backend to store it in the notification system
        if (userId && workspaceId) {
          await apiRequest('POST', '/api/notifications', {
            title: notification.title,
            message: notification.message,
            priority: notification.priority,
            category: 'updates',
            type: 'trinity_insight',
            metadata: {
              ...notification.metadata,
              source: notification.source,
            },
          });
          
          // Invalidate notifications query to refresh the bell
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
        }
        
        // Also show a brief toast for immediate visibility
        toast({
          title: notification.title,
          description: notification.message.length > 100 
            ? notification.message.substring(0, 97) + '...' 
            : notification.message,
          duration: 5000,
        });
      } catch (error) {
        console.warn('[TrinityNotificationRouting] Failed to route notification:', error);
        // Fall back to just showing toast
        toast({
          title: notification.title,
          description: notification.message.length > 100 
            ? notification.message.substring(0, 97) + '...' 
            : notification.message,
          duration: 5000,
        });
      }
    },
    [userId, workspaceId, toast]
  );

  useEffect(() => {
    if (enabled) {
      thoughtManager.setNotificationCallback(handleNotification);
      thoughtManager.setRouteToNotifications(true);
    } else {
      thoughtManager.setNotificationCallback(null);
      thoughtManager.setRouteToNotifications(false);
    }

    return () => {
      thoughtManager.setNotificationCallback(null);
    };
  }, [enabled, handleNotification]);

  return {
    setEnabled: (value: boolean) => {
      thoughtManager.setRouteToNotifications(value);
    },
  };
}
