import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface EnhancedNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
  // Enhanced metadata fields for end-user display
  detailedCategory?: string;
  sourceType?: string;
  sourceName?: string;
  endUserSummary?: string;
  brokenDescription?: string;
  impactDescription?: string;
  badge?: string;
  category?: string;
}

interface PlatformUpdate {
  type: string;
  category: string;
  title: string;
  description: string;
  version?: string;
  isNew?: boolean;
  // Enhanced metadata fields
  detailedCategory?: string;
  sourceType?: string;
  sourceName?: string;
  endUserSummary?: string;
  brokenDescription?: string;
  impactDescription?: string;
  badge?: string;
}

interface NotificationWebSocketMessage {
  type: 'notification_new' | 'notification_read' | 'notification_read_bulk' | 'notification_count_updated' | 'notifications_subscribed' | 'platform_update' | 'all_notifications_cleared' | 'whats_new_cleared' | 'whats_new_viewed' | 'error';
  notification?: EnhancedNotification & { counts?: { notifications: number; platformUpdates: number; total: number; lastUpdated: string } };
  update?: PlatformUpdate;
  updateId?: string;
  unreadCount?: number;
  timestamp?: string;
  workspaceId?: string;
  message?: string;
  cleared?: { platformUpdates: number; notifications: number; alerts: number };
  markedRead?: { platformUpdates: number; notifications: number; alerts: number };
  counts?: { notifications: number; platformUpdates: number; total: number; lastUpdated: string };
  count?: number;
  source?: string;
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
      let wsHost = window.location.host || 
        (window.location.port 
          ? `${window.location.hostname}:${window.location.port}` 
          : window.location.hostname);
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
              console.log('🔔 New notification received (LIVE):', data.notification?.title);
              
              // LIVE UPDATE: Insert notification directly into cache
              if (data.notification) {
                queryClient.setQueryData(["/api/notifications/combined"], (oldData: any) => {
                  if (!oldData) return oldData;
                  const newNotification = {
                    ...data.notification,
                    isRead: false,
                    createdAt: data.timestamp || new Date().toISOString(),
                  };
                  return {
                    ...oldData,
                    notifications: [newNotification, ...(oldData.notifications || [])],
                    unreadNotifications: (oldData.unreadNotifications || 0) + 1,
                    totalUnread: (oldData.totalUnread || 0) + 1,
                  };
                });
                
                // Also invalidate to ensure sync
                queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              }
              
              // Update unread count
              if (data.unreadCount !== undefined) {
                setUnreadCount(data.unreadCount);
              }
              
              // Show toast notification with enhanced info
              if (data.notification) {
                const description = data.notification.endUserSummary || data.notification.message;
                toast({
                  title: data.notification.title,
                  description,
                  variant: "info" as any,
                });
              }
              break;

            case 'platform_update':
              console.log('📣 Platform update received (LIVE):', data.update?.title);
              
              // LIVE UPDATE: Insert platform update directly into What's New cache
              if (data.update) {
                queryClient.setQueryData(["/api/notifications/combined"], (oldData: any) => {
                  if (!oldData) return oldData;
                  const newUpdate = {
                    id: `live-${Date.now()}`,
                    title: data.update!.title,
                    description: data.update!.endUserSummary || data.update!.description,
                    category: data.update!.category,
                    version: data.update!.version,
                    badge: data.update!.badge || 'NEW',
                    isNew: true,
                    isViewed: false,
                    createdAt: data.timestamp || new Date().toISOString(),
                    // Enhanced metadata
                    detailedCategory: data.update!.detailedCategory,
                    sourceType: data.update!.sourceType,
                    sourceName: data.update!.sourceName,
                    endUserSummary: data.update!.endUserSummary,
                    brokenDescription: data.update!.brokenDescription,
                    impactDescription: data.update!.impactDescription,
                  };
                  return {
                    ...oldData,
                    platformUpdates: [newUpdate, ...(oldData.platformUpdates || [])],
                    unreadPlatformUpdates: (oldData.unreadPlatformUpdates || 0) + 1,
                    totalUnread: (oldData.totalUnread || 0) + 1,
                  };
                });
                
                // Also invalidate to ensure sync - include all notification and whats-new endpoints
                queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
                queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
                queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
                queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
                queryClient.invalidateQueries({ queryKey: ["/api/whats-new/new-features"] });
                
                // Dispatch event for WhatsNewBadge and NotificationsPopover components
                window.dispatchEvent(new CustomEvent('platform_update', { detail: data.update }));
                
                // Show toast for platform update
                toast({
                  title: "New Update Available",
                  description: data.update.title,
                  variant: "info" as any,
                });
              }
              break;

            case 'whats_new_viewed':
              console.log('👁️ What\'s New item viewed:', data.updateId);
              // Invalidate all whats-new queries to sync view state across tabs
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
              // Dispatch event for WhatsNewBadge component
              window.dispatchEvent(new CustomEvent('whats_new_viewed', { detail: data }));
              break;

            case 'notification_read':
              console.log('📖 Notification marked as read');
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
              if (data.unreadCount !== undefined) {
                setUnreadCount(data.unreadCount);
              }
              break;

            case 'notification_read_bulk':
              console.log('🧹 All notifications cleared:', data.cleared);
              // Clear all cached notification data optimistically
              queryClient.setQueryData(["/api/notifications/combined"], (oldData: any) => {
                if (!oldData) return oldData;
                return {
                  ...oldData,
                  notifications: oldData.notifications?.map((n: any) => ({ ...n, isRead: true })) || [],
                  platformUpdates: oldData.platformUpdates?.map((u: any) => ({ ...u, isViewed: true })) || [],
                  maintenanceAlerts: oldData.maintenanceAlerts?.map((a: any) => ({ ...a, isAcknowledged: true })) || [],
                  unreadNotifications: 0,
                  unreadPlatformUpdates: 0,
                  unreadAlerts: 0,
                  totalUnread: 0,
                };
              });
              setUnreadCount(0);
              // Invalidate all notification caches to refresh from server
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
              break;

            case 'notification_count_updated':
              console.log('🔢 Notification count updated:', data.unreadCount, data.counts);
              if (data.unreadCount !== undefined) {
                setUnreadCount(data.unreadCount);
              }
              // Handle clear_all source - optimistically clear cache
              if (data.source === 'clear_all' || (data.counts && data.counts.total === 0)) {
                console.log('🧹 Clear all detected via notification_count_updated');
                queryClient.setQueryData(["/api/notifications/combined"], (oldData: any) => {
                  if (!oldData) return oldData;
                  return {
                    ...oldData,
                    notifications: oldData.notifications?.map((n: any) => ({ ...n, isRead: true })) || [],
                    platformUpdates: oldData.platformUpdates?.map((u: any) => ({ ...u, isViewed: true })) || [],
                    maintenanceAlerts: oldData.maintenanceAlerts?.map((a: any) => ({ ...a, isAcknowledged: true })) || [],
                    unreadNotifications: 0,
                    unreadPlatformUpdates: 0,
                    unreadAlerts: 0,
                    totalUnread: 0,
                  };
                });
                setUnreadCount(0);
              }
              // Dispatch event for useNotificationState hook
              const countUpdateEvent = new CustomEvent('notification_count_updated', {
                detail: {
                  counts: data.counts || (data as any).notification?.counts || {
                    notifications: (data as any).notification?.notifications || 0,
                    platformUpdates: (data as any).notification?.platformUpdates || 0,
                    total: data.unreadCount || 0,
                    lastUpdated: new Date().toISOString(),
                  },
                },
              });
              window.dispatchEvent(countUpdateEvent);
              // Refresh combined data to get accurate counts
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-counts"] });
              break;

            case 'all_notifications_cleared':
              console.log('🧹 All notifications cleared broadcast received:', data.markedRead);
              // Optimistically mark all as read in cache
              queryClient.setQueryData(["/api/notifications/combined"], (oldData: any) => {
                if (!oldData) return oldData;
                return {
                  ...oldData,
                  notifications: oldData.notifications?.map((n: any) => ({ ...n, isRead: true })) || [],
                  platformUpdates: oldData.platformUpdates?.map((u: any) => ({ ...u, isViewed: true })) || [],
                  maintenanceAlerts: oldData.maintenanceAlerts?.map((a: any) => ({ ...a, isAcknowledged: true })) || [],
                  unreadNotifications: 0,
                  unreadPlatformUpdates: 0,
                  unreadAlerts: 0,
                  totalUnread: 0,
                };
              });
              setUnreadCount(0);
              // Clear localStorage acknowledgments since server has cleared
              localStorage.removeItem('notifications-acknowledged');
              localStorage.removeItem('alerts-acknowledged');
              localStorage.removeItem('whats-new-acknowledged');
              // Invalidate all caches
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
              // Dispatch event for WhatsNewBadge component
              window.dispatchEvent(new CustomEvent('whats_new_cleared', { detail: data }));
              break;

            case 'whats_new_cleared':
              console.log('🧹 What\'s New cleared broadcast received:', data.count);
              // Update what's new count
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
              // Also clear localStorage
              localStorage.removeItem('whats-new-acknowledged');
              // Dispatch event for WhatsNewBadge component
              window.dispatchEvent(new CustomEvent('whats_new_cleared', { detail: data }));
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

      ws.onclose = (event) => {
        console.log('🔔 Notification WebSocket disconnected', event.wasClean ? '(clean)' : '(unexpected)');
        setIsConnected(false);
        isConnectingRef.current = false;

        // Only reconnect if it was an unexpected close and we haven't exceeded max attempts
        if (!event.wasClean && reconnectAttemptsRef.current < 5) {
          const delay = Math.min(5000 * Math.pow(2, reconnectAttemptsRef.current), 60000);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Notification WS: Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
            connect();
          }, delay);
        }
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
