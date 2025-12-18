/**
 * Haptic Feedback Hook
 * 
 * Provides haptic/vibration feedback for critical actions on mobile devices.
 * Uses the Vibration API with fallback patterns for different action types.
 */

import { useCallback, useMemo, useState } from 'react';
import { useIsMobile } from './use-mobile';

export type HapticIntensity = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type HapticType = 
  | 'impact'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error'
  | 'notification'
  | 'critical';

interface HapticPattern {
  pattern: number[];
  intensity: HapticIntensity;
}

const HAPTIC_PATTERNS: Record<HapticType, HapticPattern> = {
  impact: { pattern: [10], intensity: 'medium' },
  selection: { pattern: [5], intensity: 'light' },
  success: { pattern: [20, 50, 20], intensity: 'medium' },
  warning: { pattern: [50, 30, 50], intensity: 'heavy' },
  error: { pattern: [100, 50, 100, 50, 100], intensity: 'rigid' },
  notification: { pattern: [30, 20, 30], intensity: 'medium' },
  critical: { pattern: [200, 100, 200, 100, 200, 100, 200], intensity: 'rigid' },
};

const INTENSITY_MULTIPLIER: Record<HapticIntensity, number> = {
  light: 0.5,
  soft: 0.75,
  medium: 1,
  heavy: 1.5,
  rigid: 2,
};

export interface UseHapticFeedbackReturn {
  triggerHaptic: (type: HapticType) => void;
  triggerCustomHaptic: (pattern: number[]) => void;
  isSupported: boolean;
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
  hapticImpact: () => void;
  hapticSelection: () => void;
  hapticSuccess: () => void;
  hapticWarning: () => void;
  hapticError: () => void;
  hapticNotification: () => void;
  hapticCritical: () => void;
}

export function useHapticFeedback(): UseHapticFeedbackReturn {
  const isMobile = useIsMobile();
  const [enabledState, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('hapticEnabled');
    return saved !== 'false';
  });
  
  const isSupported = useMemo(() => {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }, []);

  const isEnabled = enabledState;

  const setEnabled = useCallback((enabled: boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hapticEnabled', String(enabled));
    }
    setEnabledState(enabled);
  }, []);

  const triggerHaptic = useCallback((type: HapticType) => {
    if (!isSupported || !isEnabled || !isMobile) return;
    
    const { pattern, intensity } = HAPTIC_PATTERNS[type];
    const multiplier = INTENSITY_MULTIPLIER[intensity];
    
    const adjustedPattern = pattern.map(duration => 
      Math.round(duration * multiplier)
    );
    
    try {
      navigator.vibrate(adjustedPattern);
    } catch (error) {
      console.warn('[Haptic] Vibration failed:', error);
    }
  }, [isSupported, isEnabled, isMobile]);

  const triggerCustomHaptic = useCallback((pattern: number[]) => {
    if (!isSupported || !isEnabled || !isMobile) return;
    
    try {
      navigator.vibrate(pattern);
    } catch (error) {
      console.warn('[Haptic] Custom vibration failed:', error);
    }
  }, [isSupported, isEnabled, isMobile]);

  const hapticImpact = useCallback(() => triggerHaptic('impact'), [triggerHaptic]);
  const hapticSelection = useCallback(() => triggerHaptic('selection'), [triggerHaptic]);
  const hapticSuccess = useCallback(() => triggerHaptic('success'), [triggerHaptic]);
  const hapticWarning = useCallback(() => triggerHaptic('warning'), [triggerHaptic]);
  const hapticError = useCallback(() => triggerHaptic('error'), [triggerHaptic]);
  const hapticNotification = useCallback(() => triggerHaptic('notification'), [triggerHaptic]);
  const hapticCritical = useCallback(() => triggerHaptic('critical'), [triggerHaptic]);

  return {
    triggerHaptic,
    triggerCustomHaptic,
    isSupported,
    isEnabled,
    setEnabled,
    hapticImpact,
    hapticSelection,
    hapticSuccess,
    hapticWarning,
    hapticError,
    hapticNotification,
    hapticCritical,
  };
}
