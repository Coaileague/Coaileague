/**
 * USE SESSION SYNC HOOK
 * =====================
 * React hook for real-time multi-device session synchronization.
 * Automatically invalidates TanStack Query caches when data changes
 * are detected from other devices.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';

interface SyncEvent {
  type: string;
  action: 'create' | 'update' | 'delete' | 'refresh';
  resource: string;
  resourceId?: string;
  workspaceId?: string;
  data?: Record<string, any>;
  queryKeys?: string[];
  timestamp: string;
}

interface SessionSyncOptions {
  onSync?: (event: SyncEvent) => void;
  autoInvalidate?: boolean;
  debugMode?: boolean;
}

export function useSessionSync(options: SessionSyncOptions = {}) {
  const { onSync, autoInvalidate = true, debugMode = false } = options;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const isConnectedRef = useRef(false);

  const log = useCallback((message: string, data?: any) => {
    if (debugMode) {
      console.log(`[SessionSync] ${message}`, data || '');
    }
  }, [debugMode]);

  const handleSyncEvent = useCallback((event: SyncEvent) => {
    log('Received sync event', event);

    // Call custom handler if provided
    if (onSync) {
      onSync(event);
    }

    // Auto-invalidate queries if enabled
    if (autoInvalidate && event.queryKeys && event.queryKeys.length > 0) {
      for (const queryKey of event.queryKeys) {
        log(`Invalidating query: ${queryKey}`);
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      }
    }

    // Handle specific sync types
    switch (event.type) {
      case 'data_sync':
      case 'query_invalidate':
        // Already handled above
        break;
      case 'shift_update':
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
        break;
      case 'timesheet_update':
        queryClient.invalidateQueries({ queryKey: ['/api/timesheets'] });
        queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
        break;
      case 'payroll_update':
        queryClient.invalidateQueries({ queryKey: ['/api/payroll'] });
        break;
      case 'notification_update':
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        break;
      case 'approval_required':
      case 'approval_completed':
        queryClient.invalidateQueries({ queryKey: ['/api/approvals'] });
        break;
      case 'ai_action_complete':
        // Refresh relevant AI-related queries
        queryClient.invalidateQueries({ queryKey: ['/api/ai-brain'] });
        break;
    }
  }, [queryClient, onSync, autoInvalidate, log]);

  const connectWebSocket = useCallback(() => {
    if (!user?.id || isConnectedRef.current) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      log('Connecting to WebSocket for session sync...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectedRef.current = true;
        log('WebSocket connected for session sync');
        
        // Send device info for session tracking
        const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
        ws.send(JSON.stringify({
          type: 'session_sync_register',
          deviceType,
          timestamp: new Date().toISOString(),
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'session_sync' && message.payload) {
            handleSyncEvent(message.payload as SyncEvent);
          }
        } catch (err) {
          // Not a session sync message, ignore
        }
      };

      ws.onclose = () => {
        isConnectedRef.current = false;
        log('WebSocket disconnected, will reconnect...');
        
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };

      ws.onerror = (error) => {
        log('WebSocket error', error);
      };

    } catch (error) {
      log('Failed to connect WebSocket', error);
    }
  }, [user?.id, handleSyncEvent, log]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      isConnectedRef.current = false;
    };
  }, [connectWebSocket]);

  // Manual invalidation helper
  const invalidateQueries = useCallback((queryKeys: string[]) => {
    for (const key of queryKeys) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  return {
    isConnected: isConnectedRef.current,
    invalidateQueries,
  };
}

export default useSessionSync;
