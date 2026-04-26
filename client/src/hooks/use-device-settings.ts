/**
 * Universal Device Settings Hook
 * 
 * Detects device capabilities and loads optimized settings for:
 * - Animation density
 * - Graphics quality
 * - Layout preferences
 * - Trinity mascot configuration
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface OptimizedSettings {
  animationDensity: 'full' | 'reduced' | 'minimal' | 'none';
  animationFps: number;
  enableParticles: boolean;
  enableTransitions: boolean;
  imageQuality: 'high' | 'medium' | 'low';
  enableBlur: boolean;
  enableShadows: boolean;
  compactMode: boolean;
  touchOptimized: boolean;
  minTapTargetSize: number;
  prefetchEnabled: boolean;
  lazyLoadThreshold: number;
  cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
  trinitySize: number;
  trinityAnimationLevel: 'full' | 'reduced' | 'static';
  trinityIdleDelay: number;
  quickFixCompactCards: boolean;
  quickFixShowDescriptions: boolean;
  quickFixAutoRefresh: boolean;
}

interface DeviceCapabilities {
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  touchSupport: boolean;
  cpuCores?: number;
  memoryGb?: number;
  connectionType?: string;
}

interface DeviceSettingsResult {
  deviceType: 'desktop' | 'tablet' | 'mobile';
  platform: string;
  browser: string;
  settings: OptimizedSettings;
  capabilities: DeviceCapabilities;
  isLoading: boolean;
  refetch: () => void;
}

// Default settings for SSR/initial render
const DEFAULT_SETTINGS: OptimizedSettings = {
  animationDensity: 'full',
  animationFps: 60,
  enableParticles: true,
  enableTransitions: true,
  imageQuality: 'high',
  enableBlur: true,
  enableShadows: true,
  compactMode: false,
  touchOptimized: false,
  minTapTargetSize: 24,
  prefetchEnabled: true,
  lazyLoadThreshold: 500,
  cacheStrategy: 'aggressive',
  trinitySize: 100,
  trinityAnimationLevel: 'full',
  trinityIdleDelay: 3000,
  quickFixCompactCards: false,
  quickFixShowDescriptions: true,
  quickFixAutoRefresh: true,
};

// Client-side capability detection
function detectCapabilities(): DeviceCapabilities {
  if (typeof window === 'undefined') {
    return {
      screenWidth: 1920,
      screenHeight: 1080,
      devicePixelRatio: 1,
      touchSupport: false,
    };
  }

  const nav = navigator as any;
  
  return {
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    cpuCores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    connectionType: nav.connection?.effectiveType,
  };
}

// Detect device type from screen size
function detectDeviceType(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function useDeviceSettings(): DeviceSettingsResult {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities>(() => detectCapabilities());
  const [deviceType, setDeviceType] = useState<'desktop' | 'tablet' | 'mobile'>(() => detectDeviceType());

  // Fetch settings from server
  const { data, isLoading, refetch } = useQuery<{
    success: boolean;
    deviceType: string;
    platform: string;
    browser: string;
    settings: OptimizedSettings;
  }>({
    queryKey: ['/api/device/settings'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Update capabilities on resize
  useEffect(() => {
    const handleResize = () => {
      setCapabilities(detectCapabilities());
      setDeviceType(detectDeviceType());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Send detailed capabilities to server
  useEffect(() => {
    const sendCapabilities = async () => {
      try {
        await fetch('/api/device/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capabilities),
          credentials: 'include',
        });
      } catch (error) {
        // Silent fail - settings will still work from client detection
      }
    };

    // Debounce sending
    const timeout = setTimeout(sendCapabilities, 1000);
    return () => clearTimeout(timeout);
  }, [capabilities]);

  return {
    deviceType: (data?.deviceType as 'desktop' | 'tablet' | 'mobile') || deviceType,
    platform: data?.platform || 'unknown',
    browser: data?.browser || 'unknown',
    settings: data?.settings || DEFAULT_SETTINGS,
    capabilities,
    isLoading,
    refetch,
  };
}

// Quick hook for just checking mobile
export function useIsCompact(): boolean {
  const { settings } = useDeviceSettings();
  return settings.compactMode;
}

// Hook for animation settings
export function useAnimationSettings() {
  const { settings } = useDeviceSettings();
  
  return {
    density: settings.animationDensity,
    fps: settings.animationFps,
    enableParticles: settings.enableParticles,
    enableTransitions: settings.enableTransitions,
    enableBlur: settings.enableBlur,
    enableShadows: settings.enableShadows,
  };
}

// Hook for Trinity mascot settings
export function useTrinitySettings() {
  const { settings, deviceType } = useDeviceSettings();
  
  return {
    size: settings.trinitySize,
    animationLevel: settings.trinityAnimationLevel,
    idleDelay: settings.trinityIdleDelay,
    deviceType,
  };
}

export default useDeviceSettings;
