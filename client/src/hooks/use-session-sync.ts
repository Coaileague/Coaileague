/**
 * USE SESSION SYNC HOOK
 * =====================
 * React hook for real-time multi-device session synchronization.
 * Automatically invalidates TanStack Query caches when data changes
 * are detected from other devices.
 * 
 * Uses unified WebSocketProvider instead of creating its own connection.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useWebSocketBus, useWsConnected } from '@/providers/WebSocketProvider';

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
  const { onSync, autoInvalidate = true } = options;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const bus = useWebSocketBus();
  const isConnected = useWsConnected();

  const handleSyncEvent = useCallback((event: SyncEvent) => {
    if (onSync) {
      onSync(event);
    }

    if (autoInvalidate && event.queryKeys && event.queryKeys.length > 0) {
      for (const queryKey of event.queryKeys) {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      }
    }

    switch (event.type) {
      case 'data_sync':
      case 'query_invalidate':
        break;
      case 'shift_update':
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
        break;
      case 'timesheet_update':
        queryClient.invalidateQueries({ queryKey: ['/api/timesheets'] });
        queryClient.invalidateQueries({ queryKey: ['/api/time-entries/entries'] });
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
        queryClient.invalidateQueries({ queryKey: ['/api/ai-brain'] });
        break;
    }
  }, [queryClient, onSync, autoInvalidate]);

  const handleSyncEventRef = useRef(handleSyncEvent);
  handleSyncEventRef.current = handleSyncEvent;

  useEffect(() => {
    if (!user?.id) return;

    const sendRegister = () => {
      const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
      bus.send({
        type: 'session_sync_register',
        deviceType,
        timestamp: new Date().toISOString(),
      });
    };
    if (bus.isConnected()) sendRegister();
    const unsubConnect = bus.subscribe('__ws_connected', sendRegister);

    const unsubSync = bus.subscribe('session_sync', (message) => {
      if (message.payload) {
        handleSyncEventRef.current(message.payload as SyncEvent);
      }
    });

    const unsubRbac = bus.subscribe('RBAC_ROLE_CHANGED', (message) => {
      if (message.payload) {
        const payload = message.payload;
        const currentUserId = user?.id;
        
        if (payload.userId === currentUserId) {
          queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
          queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/role'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          queryClient.invalidateQueries({ queryKey: ['/api/me'] });
          queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
        } else {
          queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
        }
      }
    });

    const unsubRoleUpdated = bus.subscribe('role_updated', (message) => {
      if (message.payload) {
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        queryClient.invalidateQueries({ queryKey: ['/api/me'] });
        queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user/role'] });
        queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      }
    });

    const unsubTrinityAccess = bus.subscribe('trinity_access_updated', (message) => {
      if (message.payload) {
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        queryClient.invalidateQueries({ queryKey: ['/api/trinity'] });
        queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      }
    });

    const unsubClockIn = bus.subscribe('officer_clocked_in', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
    });

    const unsubClockOut = bus.subscribe('officer_clocked_out', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll'] });
    });

    const unsubDarStatus = bus.subscribe('dar_status_changed', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rms/dars'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rms/stats'] });
    });

    const unsubVisitorAlert = bus.subscribe('visitor_never_left_alert', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rms/visitors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rms/stats'] });
    });

    return () => {
      unsubConnect();
      unsubSync();
      unsubRbac();
      unsubRoleUpdated();
      unsubTrinityAccess();
      unsubClockIn();
      unsubClockOut();
      unsubDarStatus();
      unsubVisitorAlert();
    };
  }, [bus, user?.id, queryClient]);

  const invalidateQueries = useCallback((queryKeys: string[]) => {
    for (const key of queryKeys) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  return {
    isConnected,
    invalidateQueries,
  };
}

export default useSessionSync;
