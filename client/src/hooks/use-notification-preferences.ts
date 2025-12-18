/**
 * Notification Preferences Hook
 * 
 * Manages customizable notification sounds and vibration patterns.
 * Supports both desktop (Web Audio) and mobile (Vibration API) devices.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useIsMobile } from './use-mobile';

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

  const supportsVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  useEffect(() => {
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

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
    setPreferences(prev => ({ ...prev, ...updates }));
  }, []);

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
