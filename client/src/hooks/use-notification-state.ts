/**
 * useNotificationState - Unified notification state management hook
 * 
 * Provides:
 * - Unified unread counts for notifications + platform updates
 * - Mark as read with automatic count decrement
 * - Clear all functionality
 * - Real-time WebSocket sync
 * - Animation state control (disabled at zero)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface UnreadCounts {
  notifications: number;
  platformUpdates: number;
  total: number;
  lastUpdated: string;
}

interface MarkReadResult {
  success: boolean;
  counts: UnreadCounts;
}

interface ClearAllResult {
  success: boolean;
  counts: UnreadCounts;
}

export function useNotificationState(userId: string | undefined, workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  
  const { data: counts, isLoading, error, refetch } = useQuery<UnreadCounts>({
    queryKey: ['/api/notifications/unread-counts'],
    enabled: !!userId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const defaultCounts: UnreadCounts = useMemo(() => ({
    notifications: 0,
    platformUpdates: 0,
    total: 0,
    lastUpdated: new Date().toISOString(),
  }), []);

  const currentCounts = counts || defaultCounts;

  const shouldAnimate = currentCounts.total > 0;
  const shouldAnimateNotifications = currentCounts.notifications > 0;
  const shouldAnimatePlatformUpdates = currentCounts.platformUpdates > 0;

  const markNotificationReadMutation = useMutation<MarkReadResult, Error, string>({
    mutationFn: async (notificationId: string) => {
      const response = await apiRequest('POST', `/api/notifications/${notificationId}/mark-read`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/notifications/unread-counts'], data.counts);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      // Sync Trinity with fresh notification counts
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/context'] });
    },
  });

  const markPlatformUpdateViewedMutation = useMutation<MarkReadResult, Error, { updateId: string; viewSource?: string }>({
    mutationFn: async ({ updateId, viewSource }) => {
      const response = await apiRequest('POST', `/api/platform-updates/${updateId}/mark-viewed`, { viewSource });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/notifications/unread-counts'], data.counts);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
    },
  });

  const clearAllMutation = useMutation<ClearAllResult, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/notifications/clear-all');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/notifications/unread-counts'], data.counts);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
      // Sync Trinity with fresh notification counts instantly
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/context'] });
    },
  });

  const syncCountsMutation = useMutation<{ success: boolean; counts: UnreadCounts }, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/notifications/sync-counts');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/notifications/unread-counts'], data.counts);
    },
  });

  const markNotificationRead = useCallback(
    (notificationId: string) => markNotificationReadMutation.mutate(notificationId),
    [markNotificationReadMutation]
  );

  const markPlatformUpdateViewed = useCallback(
    (updateId: string, viewSource?: string) => 
      markPlatformUpdateViewedMutation.mutate({ updateId, viewSource }),
    [markPlatformUpdateViewedMutation]
  );

  const clearAll = useCallback(() => clearAllMutation.mutate(), [clearAllMutation]);

  const syncCounts = useCallback(() => syncCountsMutation.mutate(), [syncCountsMutation]);

  useEffect(() => {
    const handleCountUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const data = customEvent.detail;
      if (data?.counts) {
        queryClient.setQueryData(['/api/notifications/unread-counts'], data.counts);
      }
    };

    window.addEventListener('notification_count_updated', handleCountUpdate as EventListener);
    return () => {
      window.removeEventListener('notification_count_updated', handleCountUpdate as EventListener);
    };
  }, [queryClient]);

  return {
    counts: currentCounts,
    isLoading,
    error: error as Error | null,
    
    shouldAnimate,
    shouldAnimateNotifications,
    shouldAnimatePlatformUpdates,
    
    markNotificationRead,
    markPlatformUpdateViewed,
    clearAll,
    syncCounts,
    refetch,
    
    isMarkingRead: markNotificationReadMutation.isPending,
    isClearing: clearAllMutation.isPending,
    isSyncing: syncCountsMutation.isPending,
  };
}

export type NotificationState = ReturnType<typeof useNotificationState>;
