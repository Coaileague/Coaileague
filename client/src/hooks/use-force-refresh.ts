/**
 * Force Refresh Hook - Listens for WebSocket force-refresh events
 * Automatically invalidates React Query caches when support staff push updates
 * 
 * Supports: What's New, Notifications, Health, System Messages, Cache Invalidation
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export interface ForceRefreshEvent {
  type: 'force_refresh';
  refreshType: 'whats_new' | 'notifications' | 'health' | 'system_message' | 'maintenance' | 'cache_invalidation';
  payload: {
    action: string;
    message?: string;
    severity?: 'info' | 'warning' | 'error' | 'success';
    duration?: number;
    dismissible?: boolean;
    cacheKeys?: string[];
    updateId?: string;
    title?: string;
    badge?: string;
    reason?: string;
    enabled?: boolean;
    estimatedDuration?: string;
    timestamp?: string;
  };
  timestamp: string;
}

interface UseForceRefreshOptions {
  onWhatsNewUpdate?: (payload: ForceRefreshEvent['payload']) => void;
  onNotificationUpdate?: (payload: ForceRefreshEvent['payload']) => void;
  onSystemMessage?: (payload: ForceRefreshEvent['payload']) => void;
  onMaintenanceMode?: (payload: ForceRefreshEvent['payload']) => void;
  showToasts?: boolean;
}

export function useForceRefresh(options: UseForceRefreshOptions = {}) {
  const { 
    onWhatsNewUpdate, 
    onNotificationUpdate, 
    onSystemMessage, 
    onMaintenanceMode,
    showToasts = true,
  } = options;
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);

  const handleForceRefresh = useCallback((event: ForceRefreshEvent) => {
    const { refreshType, payload } = event;
    
    console.log('[ForceRefresh] Received:', refreshType, payload);

    switch (refreshType) {
      case 'whats_new':
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/new-features'] });
        
        if (showToasts && payload.title) {
          toast({
            title: 'New Update Available',
            description: payload.title,
            duration: 5000,
          });
        }
        
        onWhatsNewUpdate?.(payload);
        break;

      case 'notifications':
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
        
        if (showToasts && payload.title) {
          toast({
            title: 'New Notification',
            description: payload.title,
            duration: 5000,
          });
        }
        
        onNotificationUpdate?.(payload);
        break;

      case 'health':
        queryClient.invalidateQueries({ queryKey: ['/api/health'] });
        queryClient.invalidateQueries({ queryKey: ['/api/health/summary'] });
        break;

      case 'system_message':
        if (showToasts && payload.message) {
          toast({
            title: 'System Message',
            description: payload.message,
            variant: payload.severity === 'error' ? 'destructive' : 'default',
            duration: payload.duration || 10000,
          });
        }
        
        onSystemMessage?.(payload);
        break;

      case 'maintenance':
        if (showToasts && payload.message) {
          toast({
            title: payload.enabled ? 'Maintenance Mode' : 'Maintenance Complete',
            description: payload.message,
            variant: payload.enabled ? 'destructive' : 'default',
            duration: 15000,
          });
        }
        
        onMaintenanceMode?.(payload);
        break;

      case 'cache_invalidation':
        if (payload.cacheKeys && Array.isArray(payload.cacheKeys)) {
          for (const key of payload.cacheKeys) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
        } else {
          queryClient.invalidateQueries();
        }
        break;
    }
  }, [queryClient, toast, showToasts, onWhatsNewUpdate, onNotificationUpdate, onSystemMessage, onMaintenanceMode]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        isConnectedRef.current = true;
        console.log('[ForceRefresh] WebSocket connected');
        
        wsRef.current?.send(JSON.stringify({
          type: 'join_platform_updates',
        }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'force_refresh') {
            handleForceRefresh(data as ForceRefreshEvent);
          }
          
          if (data.type === 'platform_event' && data.payload) {
            const payload = data.payload;
            if (payload.type?.startsWith('feature_') || payload.type === 'announcement') {
              handleForceRefresh({
                type: 'force_refresh',
                refreshType: 'whats_new',
                payload: {
                  action: 'new_update',
                  title: payload.title,
                },
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          console.error('[ForceRefresh] Parse error:', error);
        }
      };

      wsRef.current.onclose = () => {
        isConnectedRef.current = false;
        console.log('[ForceRefresh] WebSocket closed, reconnecting...');
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      wsRef.current.onerror = (error) => {
        console.error('[ForceRefresh] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[ForceRefresh] Connection error:', error);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [handleForceRefresh]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const forceRefreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
    queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['/api/health'] });
  }, [queryClient]);

  return {
    isConnected: isConnectedRef.current,
    forceRefreshAll,
  };
}

export default useForceRefresh;
