/**
 * Force Refresh Provider - Listens for WebSocket force-refresh events
 * Wraps the app to automatically invalidate React Query caches when
 * support staff push updates via the command console.
 * 
 * Uses unified WebSocketProvider instead of creating its own connection.
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useWebSocketBus } from '@/providers/WebSocketProvider';

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
  const bus = useWebSocketBus();

  const handleForceRefresh = useCallback((event: ForceRefreshEvent) => {
    const { refreshType, payload } = event;
    
    switch (refreshType) {
      case 'whats_new':
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
        queryClient.invalidateQueries({ queryKey: ['/api/whats-new/new-features'] });
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

      case 'test_broadcast':
        toast({
          title: 'Broadcast Test Received',
          description: payload.message || 'WebSocket broadcast working!',
          duration: 5000,
        });
        break;
    }
  }, [queryClient, toast]);

  const handleMascotDirective = useCallback((payload) => {
    queryClient.setQueryData(['/api/mascot/holiday/directives'], {
      success: true,
      seasonId: payload?.seasonId || 'christmas',
      holidayDecor: payload?.holidayDecor,
      motionProfile: payload?.motionProfile,
      latestDirective: null,
      timestamp: payload?.timestamp || new Date().toISOString(),
    });
    
    queryClient.invalidateQueries({ queryKey: ['/api/mascot/holiday/directives'] });
  }, [queryClient]);

  useEffect(() => {
    const sendJoin = () => {
      bus.send({ type: 'join_platform_updates' });
      bus.send({ type: 'join_shift_updates' });
    };
    if (bus.isConnected()) sendJoin();
    const unsubConnect = bus.subscribe('__ws_connected', sendJoin);

    const unsubs = [
      unsubConnect,
      bus.subscribe('force_refresh', (data) => {
        handleForceRefresh(data as ForceRefreshEvent);
      }),
      bus.subscribe('platform_update', (data) => {
        if (data.update) {
          queryClient.setQueryData(["/api/notifications/combined"], (oldData) => {
            if (!oldData) return oldData;
            const newUpdate = {
              id: `live-${Date.now()}`,
              title: data.update.title,
              description: data.update.description,
              category: data.update.category,
              version: data.update.version,
              badge: data.update.badge || 'NEW',
              isNew: true,
              isViewed: false,
              createdAt: data.timestamp || new Date().toISOString(),
              detailedCategory: data.update.detailedCategory,
              sourceType: data.update.sourceType,
              sourceName: data.update.sourceName,
              brokenDescription: data.update.brokenDescription,
              impactDescription: data.update.impactDescription,
            };
            return {
              ...oldData,
              platformUpdates: [newUpdate, ...(oldData.platformUpdates || [])],
              unreadPlatformUpdates: (oldData.unreadPlatformUpdates || 0) + 1,
              totalUnread: (oldData.totalUnread || 0) + 1,
            };
          });
          
          queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
          queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
        }
      }),
      bus.subscribe('platform_event', (data) => {
        if (data.payload) {
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
      }),
      bus.subscribe('mascot.directive.updated', (data) => {
        handleMascotDirective(data.payload);
      }),
      bus.subscribe('schedule_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('schedules_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('shift_created', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('shift_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('shift_deleted', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('employees_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
        queryClient.invalidateQueries({ queryKey: ['/api/employees/me'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
        queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      }),
      bus.subscribe('clients_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
        queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      }),
      bus.subscribe('invoices_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing'] });
      }),
      bus.subscribe('time_entries_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
        queryClient.invalidateQueries({ queryKey: ['/api/timesheet'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('payroll_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/payroll'] });
        queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('data_migrated', (data) => {
        queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
        queryClient.invalidateQueries({ queryKey: ['/api/employees/me'] });
        queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
        queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
        queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
        queryClient.invalidateQueries({ queryKey: ['/api/payroll'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing'] });
        const source = data.source || 'system';
        const empCount = data.importedEmployees || 0;
        const clientCount = data.importedClients || 0;
        toast({
          title: 'Data Import Complete',
          description: `${empCount} employees and ${clientCount} clients imported from ${source}`,
          duration: 6000,
        });
      }),
      bus.subscribe('broadcast_message', (data) => {
        queryClient.invalidateQueries({ queryKey: ['/api/broadcasts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      }),
      bus.subscribe('shift_acknowledged', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('shift_denied', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('shift_status_changed', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      }),
      bus.subscribe('compliance_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
        queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('pto_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/pto'] });
        queryClient.invalidateQueries({ queryKey: ['/api/time-off-requests'] });
        queryClient.invalidateQueries({ queryKey: ['/api/time-off/pending-count'] });
      }),
      bus.subscribe('invoice_created', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing'] });
      }),
      bus.subscribe('subscription_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/billing'] });
        queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/usage'] });
      }),
      bus.subscribe('subscription_cancelled', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/billing'] });
        queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
      }),
      bus.subscribe('shift_swap_requested', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('shift_swap_approved', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
      bus.subscribe('shift_swap_rejected', () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduling'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }),
    ];

    return () => {
      unsubs.forEach(u => u());
    };
  }, [bus, handleForceRefresh, handleMascotDirective, queryClient, toast]);

  return <>{children}</>;
}

export default ForceRefreshProvider;
