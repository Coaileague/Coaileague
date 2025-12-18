/**
 * Notification Preferences Hook
 * 
 * Manages customizable notification sounds and vibration patterns.
 * Supports both desktop (Web Audio) and mobile (Vibration API) devices.
 * Uses database persistence with real-time sync via WebSocket.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from './use-mobile';
import { apiRequest } from '@/lib/queryClient';

export type NotificationSound = 
  | 'default'
  | 'gentle'
  | 'urgent'
  | 'chime'
  | 'bubble'
  | 'ping'
  | 'trinity'
  | 'silent';

export type VibrationPattern = 
  | 'none'
  | 'short'
  | 'long'
  | 'double'
  | 'pulse'
  | 'urgent'
  | 'custom';

export type NotificationType = 
  | 'message'
  | 'alert'
  | 'approval'
  | 'reminder'
  | 'trinity'
  | 'critical';

export interface NotificationPreferences {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  volume: number;
  sounds: Record<NotificationType, NotificationSound>;
  vibrations: Record<NotificationType, VibrationPattern>;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
  volume: 0.7,
  sounds: {
    message: 'bubble',
    alert: 'urgent',
    approval: 'chime',
    reminder: 'gentle',
    trinity: 'trinity',
    critical: 'urgent',
  },
  vibrations: {
    message: 'short',
    alert: 'double',
    approval: 'short',
    reminder: 'short',
    trinity: 'pulse',
    critical: 'urgent',
  },
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

const VIBRATION_PATTERNS: Record<VibrationPattern, number[]> = {
  none: [],
  short: [100],
  long: [400],
  double: [100, 50, 100],
  pulse: [50, 30, 50, 30, 50],
  urgent: [200, 100, 200, 100, 200],
  custom: [150, 50, 150],
};

const SOUND_FREQUENCIES: Record<NotificationSound, { freq: number[]; duration: number[] }> = {
  default: { freq: [523, 659], duration: [0.1, 0.15] },
  gentle: { freq: [392, 440], duration: [0.2, 0.25] },
  urgent: { freq: [880, 1047, 880], duration: [0.08, 0.08, 0.12] },
  chime: { freq: [523, 659, 784], duration: [0.1, 0.1, 0.2] },
  bubble: { freq: [440, 660], duration: [0.05, 0.1] },
  ping: { freq: [1047], duration: [0.15] },
  trinity: { freq: [659, 784, 880, 784], duration: [0.08, 0.08, 0.1, 0.15] },
  silent: { freq: [], duration: [] },
};

export interface UseNotificationPreferencesReturn {
  preferences: NotificationPreferences;
  updatePreferences: (updates: Partial<NotificationPreferences>) => void;
  playSound: (type: NotificationType) => void;
  vibrate: (type: NotificationType) => void;
  notify: (type: NotificationType) => void;
  testSound: (sound: NotificationSound) => void;
  testVibration: (pattern: VibrationPattern) => void;
  isQuietHours: boolean;
  supportsVibration: boolean;
}

export function useNotificationPreferences(): UseNotificationPreferencesReturn {
  const isMobile = useIsMobile();
  const audioContextRef = useRef<AudioContext | null>(null);
  const queryClient = useQueryClient();
  
  // Fetch preferences from API with fallback to localStorage
  const { data: apiPreferences } = useQuery({
    queryKey: ['/api/experience/notification-preferences'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
  
  // Local state for immediate updates
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
    
    const saved = localStorage.getItem('notificationPreferences');
    if (saved) {
      try {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_PREFERENCES;
      }
    }
    return DEFAULT_PREFERENCES;
  });
  
  // Mutation to save preferences to API
  const saveMutation = useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      return apiRequest('/api/experience/notification-preferences', {
        method: 'POST',
        body: JSON.stringify(prefs),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/experience/notification-preferences'] });
    },
  });
  
  // Sync API preferences when they load
  useEffect(() => {
    if (apiPreferences?.preferences) {
      setPreferences(prev => ({ ...prev, ...apiPreferences.preferences }));
    }
  }, [apiPreferences]);
  
  // Cross-tab sync via BroadcastChannel with origin tracking to prevent infinite loops
  const tabIdRef = useRef<string>(Math.random().toString(36).substring(7));
  const lastReceivedRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    
    const channel = new BroadcastChannel('notification-preferences');
    
    channel.onmessage = (event) => {
      const { preferences: newPrefs, originTabId, timestamp } = event.data || {};
      // Only apply if from different tab and not our own broadcast
      if (newPrefs && originTabId && originTabId !== tabIdRef.current) {
        // Deduplicate by timestamp to prevent re-processing same update
        if (timestamp && timestamp !== lastReceivedRef.current) {
          lastReceivedRef.current = timestamp;
          setPreferences(prev => ({ ...prev, ...newPrefs }));
        }
      }
    };
    
    return () => channel.close();
  }, []);
  
  // Broadcast local preference changes to other tabs (only on user-initiated updates)
  const broadcastPreferences = useCallback((prefs: NotificationPreferences) => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    
    const channel = new BroadcastChannel('notification-preferences');
    channel.postMessage({
      preferences: prefs,
      originTabId: tabIdRef.current,
      timestamp: Date.now().toString(),
    });
    channel.close();
  }, []);

  const supportsVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  useEffect(() => {
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  // Persist to localStorage for offline access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
    }
  }, [preferences]);

  const isQuietHours = (() => {
    if (!preferences.quietHoursEnabled) return false;
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = preferences.quietHoursStart.split(':').map(Number);
    const [endH, endM] = preferences.quietHoursEnd.split(':').map(Number);
    
    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;
    
    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      return currentTime >= startTime || currentTime < endTime;
    }
  })();

  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setPreferences(prev => {
      const newPrefs = { ...prev, ...updates };
      // Save to API
      saveMutation.mutate(newPrefs);
      // Broadcast to other tabs for cross-tab sync
      broadcastPreferences(newPrefs);
      return newPrefs;
    });
  }, [saveMutation, broadcastPreferences]);

  const playSound = useCallback((type: NotificationType) => {
    if (!preferences.soundEnabled || isQuietHours) return;
    
    const context = audioContextRef.current;
    if (!context) return;
    
    const soundType = preferences.sounds[type] || 'default';
    const config = SOUND_FREQUENCIES[soundType];
    
    if (config.freq.length === 0) return;

    if (context.state === 'suspended') {
      context.resume();
    }

    let startTime = context.currentTime;
    
    config.freq.forEach((freq, index) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      oscillator.frequency.setValueAtTime(freq, startTime);
      oscillator.type = 'sine';
      
      const duration = config.duration[index] || 0.1;
      gainNode.gain.setValueAtTime(preferences.volume * 0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
      
      startTime += duration * 0.8;
    });
  }, [preferences, isQuietHours]);

  const vibrate = useCallback((type: NotificationType) => {
    if (!preferences.vibrationEnabled || !supportsVibration || isQuietHours) return;
    
    const pattern = preferences.vibrations[type] || 'short';
    const vibrationPattern = VIBRATION_PATTERNS[pattern];
    
    if (vibrationPattern.length > 0) {
      navigator.vibrate(vibrationPattern);
    }
  }, [preferences, supportsVibration, isQuietHours]);

  const notify = useCallback((type: NotificationType) => {
    playSound(type);
    if (isMobile) {
      vibrate(type);
    }
  }, [playSound, vibrate, isMobile]);

  const testSound = useCallback((sound: NotificationSound) => {
    const context = audioContextRef.current;
    if (!context) return;
    
    const config = SOUND_FREQUENCIES[sound];
    if (config.freq.length === 0) return;

    if (context.state === 'suspended') {
      context.resume();
    }

    let startTime = context.currentTime;
    
    config.freq.forEach((freq, index) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      oscillator.frequency.setValueAtTime(freq, startTime);
      const duration = config.duration[index] || 0.1;
      gainNode.gain.setValueAtTime(0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
      
      startTime += duration * 0.8;
    });
  }, []);

  const testVibration = useCallback((pattern: VibrationPattern) => {
    if (!supportsVibration) return;
    
    const vibrationPattern = VIBRATION_PATTERNS[pattern];
    if (vibrationPattern.length > 0) {
      navigator.vibrate(vibrationPattern);
    }
  }, [supportsVibration]);

  return {
    preferences,
    updatePreferences,
    playSound,
    vibrate,
    notify,
    testSound,
    testVibration,
    isQuietHours,
    supportsVibration,
  };
}
