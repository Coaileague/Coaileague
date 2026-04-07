/**
 * Offline Indicator - Shows connection status and pending sync count
 * Displays banner when offline with queued request count
 */

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPendingCount, syncPendingRequests } from '@/lib/offlineQueue';
import { queryClient } from '@/lib/queryClient';
import { haptics } from '@/lib/haptics';

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      haptics.warning();
    };
    
    const handleOnline = async () => {
      setIsOffline(false);
      setIsSyncing(true);
      
      const result = await syncPendingRequests();
      
      setIsSyncing(false);
      if (result.synced > 0) {
        setJustSynced(true);
        haptics.success();
        queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
        setTimeout(() => setJustSynced(false), 3000);
      }
      
      updatePendingCount();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const updatePendingCount = async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  };

  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isOffline && !isSyncing && !justSynced && pendingCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[9999] px-4 py-2 text-sm font-medium text-center transition-all duration-300',
        'safe-area-top',
        isOffline
          ? 'bg-gray-700 text-white'
          : isSyncing
          ? 'bg-blue-600 text-white'
          : justSynced
          ? 'bg-green-600 text-white'
          : 'bg-amber-500 text-black',
        className
      )}
      data-testid="offline-indicator"
    >
      <div className="flex items-center justify-center gap-2">
        {isOffline ? (
          <>
            <WifiOff className="h-4 w-4" />
            <span>
              You're offline. Changes will sync when connected.
              {pendingCount > 0 && ` (${pendingCount} pending)`}
            </span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Syncing pending changes...</span>
          </>
        ) : justSynced ? (
          <>
            <CheckCircle className="h-4 w-4" />
            <span>All changes synced!</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <RefreshCw className="h-4 w-4" />
            <span>{pendingCount} changes pending sync</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export default OfflineIndicator;
