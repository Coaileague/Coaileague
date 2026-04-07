import { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { FEATURE_TOGGLES, isFeatureEnabled } from '@/config/featureToggles';
import { SEASONAL_THEMES, getCurrentSeasonalTheme, getThemeConfig, type SeasonalTheme, type SeasonalThemeConfig } from '@/config/seasonalThemes';
import { useAuth } from '@/hooks/useAuth';

interface PlatformConfig {
  [domain: string]: {
    [key: string]: any;
  };
}

interface UniversalConfigContextValue {
  config: PlatformConfig;
  isLoading: boolean;
  isError: boolean;
  getConfigValue: (domain: string, key: string, fallback?: any) => any;
  getFeatureFlag: (path: string) => boolean;
  getSeasonalTheme: () => { theme: SeasonalTheme; config: SeasonalThemeConfig; enabled: boolean };
  getThemeValue: (key: string, fallback?: any) => any;
  invalidate: () => void;
}

const UniversalConfigContext = createContext<UniversalConfigContextValue | null>(null);

export function UniversalConfigProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const wsListenerRef = useRef(false);
  const { isAuthenticated } = useAuth();

  const { data, isLoading, isError } = useQuery<{ success: boolean; config: PlatformConfig }>({
    queryKey: ['/api/platform/config'],
    staleTime: 60000,
    refetchInterval: isAuthenticated ? 300000 : false,
    enabled: isAuthenticated,
    retry: false,
  });

  const config = data?.config || {};

  useEffect(() => {
    if (wsListenerRef.current) return;
    wsListenerRef.current = true;

    const handleWsMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'config:update' || msg.type === 'config_update') {
          queryClient.invalidateQueries({ queryKey: ['/api/platform/config'] });
        }
      } catch {}
    };

    const findAndListenToWs = () => {
      const existingWs = (window as any).__platformWs || (window as any).__ws;
      if (existingWs && existingWs.readyState === WebSocket.OPEN) {
        existingWs.addEventListener('message', handleWsMessage);
      }
    };

    findAndListenToWs();
    const interval = setInterval(findAndListenToWs, 5000);

    return () => {
      clearInterval(interval);
      wsListenerRef.current = false;
    };
  }, [queryClient]);

  const getConfigValue = useCallback((domain: string, key: string, fallback?: any) => {
    const domainConfig = config[domain];
    if (domainConfig && key in domainConfig) {
      return domainConfig[key];
    }
    return fallback;
  }, [config]);

  const getFeatureFlag = useCallback((path: string): boolean => {
    const dbValue = getConfigValue('feature', path);
    if (dbValue !== undefined) {
      return Boolean(dbValue);
    }
    return isFeatureEnabled(path);
  }, [getConfigValue]);

  const getSeasonalTheme = useCallback(() => {
    const enabled = getConfigValue('seasonal', 'enabled', false);
    const overrideTheme = getConfigValue('seasonal', 'currentTheme');
    const autoDetect = getConfigValue('seasonal', 'autoDetect', true);

    let theme: SeasonalTheme = 'default';
    if (enabled) {
      if (overrideTheme && overrideTheme !== 'default') {
        theme = overrideTheme as SeasonalTheme;
      } else if (autoDetect) {
        theme = getCurrentSeasonalTheme();
      }
    }

    return {
      theme,
      config: getThemeConfig(theme),
      enabled: Boolean(enabled),
    };
  }, [getConfigValue]);

  const getThemeValue = useCallback((key: string, fallback?: any) => {
    return getConfigValue('theme', key, fallback);
  }, [getConfigValue]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/platform/config'] });
  }, [queryClient]);

  const value: UniversalConfigContextValue = {
    config,
    isLoading,
    isError,
    getConfigValue,
    getFeatureFlag,
    getSeasonalTheme,
    getThemeValue,
    invalidate,
  };

  return (
    <UniversalConfigContext.Provider value={value}>
      {children}
    </UniversalConfigContext.Provider>
  );
}

export function useUniversalConfig(): UniversalConfigContextValue {
  const ctx = useContext(UniversalConfigContext);
  if (!ctx) {
    return {
      config: {},
      isLoading: false,
      isError: false,
      getConfigValue: (_d: string, _k: string, fallback?: any) => fallback,
      getFeatureFlag: (path: string) => isFeatureEnabled(path),
      getSeasonalTheme: () => ({
        theme: 'default' as SeasonalTheme,
        config: getThemeConfig('default'),
        enabled: false,
      }),
      getThemeValue: (_k: string, fallback?: any) => fallback,
      invalidate: () => {},
    };
  }
  return ctx;
}

export function useFeatureFlag(path: string): boolean {
  const { getFeatureFlag } = useUniversalConfig();
  return getFeatureFlag(path);
}
