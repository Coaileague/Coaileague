/**
 * Force Refresh Provider - Listens for WebSocket force-refresh events
 * Wraps the app to automatically invalidate React Query caches when
 * support staff push updates via the command console.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface ForceRefreshEvent {
  type: 'force_refresh';
  refreshType: string;
  payload: {
    action: string;
    message?: string;
    severity?: 'info' | 'warning' | 'error' | 'success';
    duration?: number;
    cacheKeys?: string[];
    title?: string;
    enabled?: boolean;
  };
  timestamp: string;
}

export function ForceRefreshProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleForceRefresh = useCallback((event: ForceRefreshEvent) => {
    const { refreshType, payload } = event;
    
    console.log('[ForceRefresh] Received:', refreshType, payload);

    switch (refreshType) {
      case 'whats_new':
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/new-features'] });
        
        if (payload.title) {
          toast({
            title: 'New Update Available',
            description: payload.title,
            duration: 5000,
          });
        }
        break;

      case 'notifications':
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
        
        if (payload.title) {
          toast({
            title: 'New Notification',
            description: payload.title,
            duration: 5000,
          });
        }
        break;

      case 'health':
        queryClient.invalidateQueries({ queryKey: ['/api/health'] });
        queryClient.invalidateQueries({ queryKey: ['/api/health/summary'] });
        break;

      case 'system_message':
        if (payload.message) {
          toast({
            title: 'System Message',
            description: payload.message,
            variant: payload.severity === 'error' ? 'destructive' : 'default',
            duration: payload.duration || 10000,
          });
        }
        break;

      case 'maintenance':
        if (payload.message) {
          toast({
            title: payload.enabled ? 'Maintenance Mode' : 'Maintenance Complete',
            description: payload.message,
            variant: payload.enabled ? 'destructive' : 'default',
            duration: 15000,
          });
        }
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
  }, [queryClient, toast]);

  const handleMascotDirective = useCallback((payload: any) => {
    console.log('[ForceRefresh] Mascot directive update:', payload);
    
    // Immediately update the query cache with the new directive
    queryClient.setQueryData(['/api/mascot/holiday/directives'], {
      success: true,
      seasonId: payload?.seasonId || 'christmas',
      holidayDecor: payload?.holidayDecor,
      motionProfile: payload?.motionProfile,
      latestDirective: null,
      timestamp: payload?.timestamp || new Date().toISOString(),
    });
    
    // Also trigger a background refetch for consistency
    queryClient.invalidateQueries({ queryKey: ['/api/mascot/holiday/directives'] });
  }, [queryClient]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[ForceRefresh] WebSocket connected');
        wsRef.current?.send(JSON.stringify({ type: 'join_platform_updates' }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'force_refresh') {
            handleForceRefresh(data as ForceRefreshEvent);
          }
          
          // Handle LIVE platform updates (What's New)
          if (data.type === 'platform_update' && data.update) {
            console.log('[ForceRefresh] LIVE platform update:', data.update.title);
            const update = data.update;
            
            // Insert directly into cache for immediate display
            queryClient.setQueryData(["/api/notifications/combined"], (oldData: any) => {
              if (!oldData) return oldData;
              const newUpdate = {
                id: `live-${Date.now()}`,
                title: update.title,
                description: update.endUserSummary || update.description,
                category: update.category,
                version: update.version,
                badge: update.badge || 'NEW',
                isNew: true,
                isViewed: false,
                createdAt: data.timestamp || new Date().toISOString(),
                // Enhanced metadata
                detailedCategory: update.detailedCategory,
                sourceType: update.sourceType,
                sourceName: update.sourceName,
                endUserSummary: update.endUserSummary,
                brokenDescription: update.brokenDescription,
                impactDescription: update.impactDescription,
              };
              return {
                ...oldData,
                platformUpdates: [newUpdate, ...(oldData.platformUpdates || [])],
                unreadPlatformUpdates: (oldData.unreadPlatformUpdates || 0) + 1,
                totalUnread: (oldData.totalUnread || 0) + 1,
              };
            });
            
            // Also invalidate whats-new queries
            queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
            queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
            
            // Show toast
            toast({
              title: 'New Update Available',
              description: update.title,
              duration: 5000,
            });
          }
          
          if (data.type === 'platform_event' && data.payload) {
            const payload = data.payload;
            if (payload.type?.startsWith('feature_') || payload.type === 'announcement') {
              handleForceRefresh({
                type: 'force_refresh',
                refreshType: 'whats_new',
                payload: { action: 'new_update', title: payload.title },
                timestamp: new Date().toISOString(),
              });
            }
          }
          
          if (data.type === 'mascot.directive.updated') {
            handleMascotDirective(data.payload);
          }
        } catch (error) {
          console.error('[ForceRefresh] Parse error:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        // Only reconnect if it was an unexpected close (not user-initiated)
        if (!event.wasClean) {
          console.log('[ForceRefresh] WebSocket closed unexpectedly, reconnecting in 10s...');
          reconnectTimeoutRef.current = setTimeout(() => connect(), 10000);
        } else {
          console.log('[ForceRefresh] WebSocket closed cleanly');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[ForceRefresh] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[ForceRefresh] Connection error:', error);
      reconnectTimeoutRef.current = setTimeout(() => connect(), 5000);
    }
  }, [handleForceRefresh, handleMascotDirective]);

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

  return <>{children}</>;
}

export default ForceRefreshProvider;
