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
  const wsRef = useRef<WebSocket | null>(null);

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

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimeout: NodeJS.Timeout | null = null;

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

    const connect = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('[AnimationContext] Connected to main WebSocket for animation broadcasts');
          reconnectAttempts = 0;
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type?.startsWith('animation:')) {
              handleRemoteCommand(data);
            }
          } catch (err) {
            // Silently ignore non-animation messages
          }
        };

        wsRef.current.onerror = () => {
          // Silent error handling
        };

        wsRef.current.onclose = (event) => {
          // Only reconnect if it was an unexpected close
          if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
            console.log('[AnimationContext] WebSocket closed unexpectedly, reconnecting...');
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connect, 5000 * reconnectAttempts);
          } else {
            console.log('[AnimationContext] WebSocket closed cleanly');
          }
        };
      } catch (err) {
        console.error('[AnimationContext] Failed to create WebSocket:', err);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [show, hide, update, setTheme, forceUpdate]);

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
