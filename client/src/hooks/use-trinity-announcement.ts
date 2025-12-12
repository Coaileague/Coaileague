/**
 * useTrinityAnnouncement Hook
 * 
 * Replaces toast notifications with Trinity AI announcements.
 * Trinity verbally announces action results to users instead of generic toast boxes.
 * 
 * Uses the same API pattern as useToast for easy migration.
 */

import { useEffect, useState, useCallback } from 'react';

export type AnnouncementType = 'success' | 'error' | 'info' | 'warning' | 'celebration';

export interface TrinityAnnouncement {
  id: string;
  title?: string;
  message: string;
  type: AnnouncementType;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
  timestamp: number;
}

interface AnnouncementState {
  announcements: TrinityAnnouncement[];
  current: TrinityAnnouncement | null;
}

const ANNOUNCEMENT_DURATION = 5000;
const ANNOUNCEMENT_QUEUE_LIMIT = 5;

let announcementCount = 0;

function generateId(): string {
  announcementCount = (announcementCount + 1) % Number.MAX_SAFE_INTEGER;
  return `trinity-${announcementCount}-${Date.now()}`;
}

const listeners: Array<(state: AnnouncementState) => void> = [];
let memoryState: AnnouncementState = { announcements: [], current: null };

function dispatch(announcement: TrinityAnnouncement | null, action: 'add' | 'dismiss' | 'clear') {
  switch (action) {
    case 'add':
      if (announcement) {
        const newAnnouncements = [announcement, ...memoryState.announcements].slice(0, ANNOUNCEMENT_QUEUE_LIMIT);
        memoryState = {
          announcements: newAnnouncements,
          current: memoryState.current || announcement,
        };
      }
      break;
    case 'dismiss':
      if (announcement) {
        const filtered = memoryState.announcements.filter(a => a.id !== announcement.id);
        memoryState = {
          announcements: filtered,
          current: memoryState.current?.id === announcement.id ? filtered[0] || null : memoryState.current,
        };
      }
      break;
    case 'clear':
      memoryState = { announcements: [], current: null };
      break;
  }
  
  listeners.forEach(listener => listener(memoryState));
}

export interface TrinityAnnounceOptions {
  title?: string;
  message: string;
  type?: AnnouncementType;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

export function trinityAnnounce(options: TrinityAnnounceOptions) {
  const announcement: TrinityAnnouncement = {
    id: generateId(),
    title: options.title,
    message: options.message,
    type: options.type || 'info',
    action: options.action,
    duration: options.duration || ANNOUNCEMENT_DURATION,
    timestamp: Date.now(),
  };
  
  dispatch(announcement, 'add');
  
  window.dispatchEvent(new CustomEvent('trinity_announce', {
    detail: announcement,
  }));
  
  if (announcement.duration && announcement.duration > 0) {
    setTimeout(() => {
      dismissAnnouncement(announcement.id);
    }, announcement.duration);
  }
  
  return {
    id: announcement.id,
    dismiss: () => dismissAnnouncement(announcement.id),
  };
}

export function dismissAnnouncement(id: string) {
  const announcement = memoryState.announcements.find(a => a.id === id);
  if (announcement) {
    dispatch(announcement, 'dismiss');
    window.dispatchEvent(new CustomEvent('trinity_dismiss', {
      detail: { id },
    }));
  }
}

export function clearAllAnnouncements() {
  dispatch(null, 'clear');
  window.dispatchEvent(new CustomEvent('trinity_clear'));
}

export function useTrinityAnnouncement() {
  const [state, setState] = useState<AnnouncementState>(memoryState);
  
  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);
  
  const announce = useCallback((options: TrinityAnnounceOptions) => {
    return trinityAnnounce(options);
  }, []);
  
  const success = useCallback((message: string, title?: string) => {
    return trinityAnnounce({ message, title, type: 'success' });
  }, []);
  
  const error = useCallback((message: string, title?: string) => {
    return trinityAnnounce({ message, title, type: 'error', duration: 8000 });
  }, []);
  
  const info = useCallback((message: string, title?: string) => {
    return trinityAnnounce({ message, title, type: 'info' });
  }, []);
  
  const warning = useCallback((message: string, title?: string) => {
    return trinityAnnounce({ message, title, type: 'warning', duration: 7000 });
  }, []);
  
  const celebration = useCallback((message: string, title?: string) => {
    return trinityAnnounce({ message, title, type: 'celebration', duration: 6000 });
  }, []);
  
  return {
    ...state,
    announce,
    success,
    error,
    info,
    warning,
    celebration,
    dismiss: dismissAnnouncement,
    clearAll: clearAllAnnouncements,
  };
}

export const trinitySuccess = (message: string, title?: string) => 
  trinityAnnounce({ message, title, type: 'success' });

export const trinityError = (message: string, title?: string) => 
  trinityAnnounce({ message, title, type: 'error', duration: 8000 });

export const trinityInfo = (message: string, title?: string) => 
  trinityAnnounce({ message, title, type: 'info' });

export const trinityWarning = (message: string, title?: string) => 
  trinityAnnounce({ message, title, type: 'warning', duration: 7000 });

export const trinityCelebration = (message: string, title?: string) => 
  trinityAnnounce({ message, title, type: 'celebration', duration: 6000 });
