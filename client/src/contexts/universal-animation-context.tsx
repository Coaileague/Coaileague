// DEPRECATED: This animation system has been consolidated into Canvas Hub TransitionLoader.
// All transitions should use useTransitionLoader() from '@/components/canvas-hub/TransitionLoader'
// This file is preserved for reference only and will be removed in a future cleanup.

/**
 * UniversalAnimationContext - Global animation state management
 * 
 * Features:
 * - Centralized animation control for entire workspace
 * - AI Brain integration for dynamic animation updates
 * - Support console WebSocket control
 * - Seasonal theme auto-detection
 * - Route transition integration
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { UniversalAnimationEngine, type AnimationMode, type SeasonalTheme, type AnimationEngineState } from '@/components/universal-animation-engine';
import { getCurrentSeasonalTheme, ANIMATION_CONTROL_CONFIG, getOrchestratorMessages } from '@/config/animationConfig';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocketBus } from '@/providers/WebSocketProvider';

interface AnimationRequest {
  mode: AnimationMode;
  mainText?: string;
  subText?: string;
  duration?: number;
  progress?: number;
  seasonalTheme?: SeasonalTheme;
  onComplete?: () => void;
  source?: 'user' | 'ai-brain' | 'support' | 'system';
}

interface AnimationContextValue {
  show: (request: AnimationRequest) => void;
  hide: () => void;
  update: (updates: Partial<AnimationRequest>) => void;
  setProgress: (progress: number) => void;
  isVisible: boolean;
  currentState: AnimationEngineState;
  currentTheme: SeasonalTheme;
  setTheme: (theme: SeasonalTheme) => void;
  triggerNavigation: (targetPath: string, options?: NavigationAnimationOptions) => void;
  forceUpdate: (state: Partial<AnimationEngineState>) => void;
  lock: () => void;
  unlock: () => void;
  isLocked: boolean;
}

interface NavigationAnimationOptions {
  mode?: AnimationMode;
  duration?: number;
  mainText?: string;
}

export const AnimationContext = createContext<AnimationContextValue | null>(null);

export function UniversalAnimationProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<SeasonalTheme>(() => getCurrentSeasonalTheme());
  const [state, setState] = useState<AnimationEngineState>({
    mode: 'warp',
    progress: 0,
    mainText: 'Loading',
    subText: 'Please wait...',
    seasonalTheme: currentTheme,
    isActive: false
  });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);


  useEffect(() => {
    setCurrentTheme(getCurrentSeasonalTheme());
  }, []);

  const show = useCallback((request: AnimationRequest) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const theme = request.seasonalTheme || currentTheme;

    setState({
      mode: request.mode,
      progress: request.progress || 0,
      mainText: request.mainText || getModeLabel(request.mode),
      subText: request.subText || 'Please wait...',
      seasonalTheme: theme,
      isActive: true
    });

    onCompleteRef.current = request.onComplete || null;
    setIsVisible(true);

    if (request.duration && request.duration > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setState(prev => ({ ...prev, isActive: false }));
        if (onCompleteRef.current) {
          onCompleteRef.current();
          onCompleteRef.current = null;
        }
      }, request.duration);
    }
  }, [currentTheme]);

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setIsVisible(false);
    setState(prev => ({ ...prev, isActive: false }));

    if (onCompleteRef.current) {
      onCompleteRef.current();
      onCompleteRef.current = null;
    }
  }, []);

  const update = useCallback((updates: Partial<AnimationRequest>) => {
    setState(prev => ({
      ...prev,
      mode: updates.mode || prev.mode,
      mainText: updates.mainText || prev.mainText,
      subText: updates.subText || prev.subText,
      progress: updates.progress !== undefined ? updates.progress : prev.progress,
      seasonalTheme: updates.seasonalTheme || prev.seasonalTheme
    }));
  }, []);

  const setProgress = useCallback((progress: number) => {
    setState(prev => ({
      ...prev,
      progress: Math.max(0, Math.min(1, progress))
    }));
  }, []);

  const setTheme = useCallback((theme: SeasonalTheme) => {
    setCurrentTheme(theme);
    setState(prev => ({ ...prev, seasonalTheme: theme }));
  }, []);

  const forceUpdate = useCallback((newState: Partial<AnimationEngineState>) => {
    if (newState.isActive !== undefined) {
      setIsVisible(newState.isActive);
    }
    setState(prev => ({ ...prev, ...newState }));
  }, []);

  const bus = useWebSocketBus();

  useEffect(() => {
    if (!bus) return;

    const handleRemoteCommand = (data: any) => {
      switch (data.type) {
        case 'animation:show':
          show({
            mode: data.mode || 'warp',
            mainText: data.mainText,
            subText: data.subText,
            duration: data.duration,
            seasonalTheme: data.seasonalTheme,
            source: data.source || 'support'
          });
          break;
        case 'animation:hide':
          hide();
          break;
        case 'animation:update':
          update(data.updates);
          break;
        case 'animation:theme':
          setTheme(data.theme);
          break;
        case 'animation:force':
          forceUpdate(data.state);
          break;
      }
    };

    const unsub = bus.subscribeAll((data: any) => {
      if (data.type?.startsWith('animation:')) {
        handleRemoteCommand(data);
      }
    });

    return () => { unsub(); };
  }, [bus, show, hide, update, setTheme, forceUpdate]);

  const triggerNavigation = useCallback((targetPath: string, options?: NavigationAnimationOptions) => {
    const mode = options?.mode || 'warp';
    const duration = options?.duration || 1200;
    const mainText = options?.mainText || 'Navigating';

    show({
      mode,
      mainText,
      subText: 'Loading workspace...',
      duration,
      source: 'system',
      onComplete: () => {
        setLocation(targetPath);
      }
    });
  }, [show, setLocation]);

  const handleClick = useCallback(() => {
    if (ANIMATION_CONTROL_CONFIG.autoDismissOnClick) {
      hide();
    }
  }, [hide]);

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const value: AnimationContextValue = {
    show,
    hide,
    update,
    setProgress,
    isVisible,
    currentState: state,
    currentTheme,
    setTheme,
    triggerNavigation,
    forceUpdate
  };

  return (
    <AnimationContext.Provider value={value}>
      {children}
      <UniversalAnimationEngine
        isVisible={isVisible}
        mode={state.mode}
        mainText={state.mainText}
        subText={state.subText}
        progress={state.progress}
        seasonalTheme={state.seasonalTheme}
        onComplete={hide}
        onClick={handleClick}
      />
    </AnimationContext.Provider>
  );
}

export function useUniversalAnimation() {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useUniversalAnimation must be used within UniversalAnimationProvider');
  }
  return context;
}

function getModeLabel(mode: AnimationMode): string {
  const labels: Record<AnimationMode, string> = {
    idle: 'Standby',
    search: 'Searching',
    analyze: 'Analyzing',
    voice: 'Listening',
    warp: 'Loading',
    success: 'Complete',
    error: 'Error'
  };
  return labels[mode] || 'Loading';
}

export type { AnimationRequest, AnimationContextValue, NavigationAnimationOptions };
