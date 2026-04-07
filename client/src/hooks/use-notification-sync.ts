/**
 * Cross-Tab Notification Sync Hook
 * 
 * Prevents duplicate notifications across browser tabs using:
 * - BroadcastChannel API for real-time sync
 * - localStorage fallback for older browsers
 * - Deduplication by notification hash (type + resource ID + timestamp bucket)
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { queryClient } from '@/lib/queryClient';

interface SyncMessage {
  type: 'notification_read' | 'notification_cleared' | 'notifications_clear_all' | 'notification_new';
  notificationId?: string;
  notificationIds?: string[];
  hash?: string;
  timestamp: number;
}

const CHANNEL_NAME = 'coaileague_notifications_sync';
const STORAGE_KEY = 'coaileague_notification_sync';
const SEEN_HASHES_KEY = 'coaileague_seen_notification_hashes';
const HASH_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a unique hash for a notification to detect duplicates
 */
function generateNotificationHash(notification: {
  type?: string;
  title?: string;
  category?: string;
  createdAt?: string;
  relatedEntityId?: string;
}): string {
  const parts = [
    notification.type || 'unknown',
    notification.category || 'general',
    notification.relatedEntityId || '',
    // Bucket by 5-minute windows to catch near-duplicates
    notification.createdAt 
      ? Math.floor(new Date(notification.createdAt).getTime() / (5 * 60 * 1000)).toString()
      : Date.now().toString(),
  ];
  
  // Simple hash function
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Get seen notification hashes from localStorage
 */
function getSeenHashes(): Map<string, number> {
  try {
    const stored = localStorage.getItem(SEEN_HASHES_KEY);
    if (!stored) return new Map();
    
    const parsed = JSON.parse(stored);
    const now = Date.now();
    const result = new Map<string, number>();
    
    // Filter out expired hashes
    for (const [hash, timestamp] of Object.entries(parsed)) {
      if (now - (timestamp as number) < HASH_TTL) {
        result.set(hash, timestamp as number);
      }
    }
    
    return result;
  } catch {
    return new Map();
  }
}

const MAX_HASH_ENTRIES = 200;

/**
 * Save seen hashes to localStorage
 */
function saveSeenHashes(hashes: Map<string, number>): void {
  try {
    const obj: Record<string, number> = {};
    // Sort by timestamp and keep only the most recent ones
    const sortedEntries = Array.from(hashes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_HASH_ENTRIES);
    
    sortedEntries.forEach(([hash, timestamp]) => {
      obj[hash] = timestamp;
    });
    localStorage.setItem(SEEN_HASHES_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if a notification has been seen (deduplicate)
 */
export function isNotificationDuplicate(notification: {
  type?: string;
  title?: string;
  category?: string;
  createdAt?: string;
  relatedEntityId?: string;
}): boolean {
  const hash = generateNotificationHash(notification);
  const seenHashes = getSeenHashes();
  return seenHashes.has(hash);
}

/**
 * Mark a notification as seen
 */
export function markNotificationSeen(notification: {
  type?: string;
  title?: string;
  category?: string;
  createdAt?: string;
  relatedEntityId?: string;
}): void {
  const hash = generateNotificationHash(notification);
  const seenHashes = getSeenHashes();
  seenHashes.set(hash, Date.now());
  saveSeenHashes(seenHashes);
}

/**
 * Hook for cross-tab notification synchronization
 */
export function useNotificationSync() {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [lastSync, setLastSync] = useState<number>(Date.now());
  
  // Broadcast a sync message to other tabs
  const broadcast = useCallback((message: Omit<SyncMessage, 'timestamp'>) => {
    const fullMessage: SyncMessage = {
      ...message,
      timestamp: Date.now(),
    };
    
    // Try BroadcastChannel first
    if (channelRef.current) {
      try {
        channelRef.current.postMessage(fullMessage);
      } catch {
        // Fall back to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fullMessage));
      }
    } else {
      // Use localStorage as fallback
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fullMessage));
    }
  }, []);
  
  // Handle incoming sync messages
  const handleMessage = useCallback((message: SyncMessage) => {
    // Ignore old messages (more than 5 seconds old)
    if (Date.now() - message.timestamp > 5000) return;
    
    switch (message.type) {
      case 'notification_read':
      case 'notification_cleared':
        // Invalidate cache to refresh notification list
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
        setLastSync(Date.now());
        break;
        
      case 'notifications_clear_all':
        // Clear all and refresh
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
        setLastSync(Date.now());
        break;
        
      case 'notification_new':
        // Mark as seen to prevent duplicate rendering
        if (message.hash) {
          const seenHashes = getSeenHashes();
          seenHashes.set(message.hash, Date.now());
          saveSeenHashes(seenHashes);
        }
        // Refresh to show new notification
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
        setLastSync(Date.now());
        break;
    }
  }, []);
  
  // Setup BroadcastChannel and localStorage listener
  useEffect(() => {
    // Try to create BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channelRef.current = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current.onmessage = (event) => {
          handleMessage(event.data as SyncMessage);
        };
      } catch {
        // BroadcastChannel not supported
      }
    }
    
    // Also listen to localStorage for fallback
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          const message = JSON.parse(event.newValue) as SyncMessage;
          handleMessage(message);
        } catch {
          // Invalid message
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [handleMessage]);
  
  // Sync functions to call when user takes action
  const syncNotificationRead = useCallback((notificationId: string) => {
    broadcast({ type: 'notification_read', notificationId });
  }, [broadcast]);
  
  const syncNotificationCleared = useCallback((notificationId: string) => {
    broadcast({ type: 'notification_cleared', notificationId });
  }, [broadcast]);
  
  const syncClearAll = useCallback(() => {
    broadcast({ type: 'notifications_clear_all' });
  }, [broadcast]);
  
  const syncNewNotification = useCallback((notification: {
    type?: string;
    title?: string;
    category?: string;
    createdAt?: string;
    relatedEntityId?: string;
  }) => {
    const hash = generateNotificationHash(notification);
    markNotificationSeen(notification);
    broadcast({ type: 'notification_new', hash });
  }, [broadcast]);
  
  return {
    lastSync,
    syncNotificationRead,
    syncNotificationCleared,
    syncClearAll,
    syncNewNotification,
    isNotificationDuplicate,
    markNotificationSeen,
  };
}

export default useNotificationSync;
