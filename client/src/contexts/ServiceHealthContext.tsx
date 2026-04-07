import { secureFetch } from "@/lib/csrf";
import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { HealthSummary, ServiceHealth, ServiceIncidentReportPayload } from '@shared/healthTypes';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// SERVICE HEALTH CONTEXT
// ============================================================================
// Provides real-time service health monitoring across the application
// Features:
// - Smart polling (30s for healthy, 5s for degraded/down)
// - Critical vs non-critical service awareness
// - Incident reporting with screenshot upload
// - Platform-wide health state management

interface ServiceHealthContextValue {
  // Overall health state
  healthSummary: HealthSummary | undefined;
  isHealthy: boolean;
  isLoading: boolean;
  error: Error | null;
  
  // Service-specific queries
  getServiceHealth: (serviceKey: string) => ServiceHealth | undefined;
  
  // Incident reporting
  reportIncident: (payload: ServiceIncidentReportPayload, screenshot?: File) => Promise<void>;
  isReportingIncident: boolean;
}

const ServiceHealthContext = createContext<ServiceHealthContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface ServiceHealthProviderProps {
  children: ReactNode;
  enablePolling?: boolean;
}

export function ServiceHealthProvider({ children, enablePolling = true }: ServiceHealthProviderProps) {
  const { isAuthenticated } = useAuth();

  // Query health summary with smart polling
  const {
    data: healthSummary,
    isLoading,
    error,
    refetch,
    status,
    dataUpdatedAt,
  } = useQuery<HealthSummary>({
    queryKey: ['/api/health/summary'],
    // Explicit queryFn to ensure health data is fetched correctly
    queryFn: async () => {
      try {
        const response = await secureFetch('/api/health/summary', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            return null as any;
          }
          const errorText = await response.text();
          console.error('[ServiceHealth] Health endpoint returned non-ok status:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          });
          throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
        }
        
        const data: HealthSummary = await response.json();
        return data;
      } catch (err) {
        console.error('[ServiceHealth] Failed to fetch health summary:', err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    enabled: isAuthenticated,
    // Smart refetch interval based on health status
    refetchInterval: (query) => {
      if (!enablePolling || !isAuthenticated) {
        return false;
      }
      
      const data = query.state.data;
      
      if (!data) {
        return false;
      }
      
      // If any service is down or degraded, poll more frequently
      if (data.overall === 'down' || data.overall === 'degraded') {
        return 5000; // 5s for failures
      }
      
      return 30000; // 30s for healthy
    },
    // TanStack Query v5 requires staleTime to be a number, not a callback
    // Using conservative 5s to ensure fresh data for critical services
    staleTime: 5000,
    refetchOnWindowFocus: isAuthenticated,
    retry: false,
  });

  // Log errors and data issues
  if (error) {
    console.error('[ServiceHealth] Query failed with error:', {
      errorMessage: error instanceof Error ? error.message : String(error),
      status,
      dataUpdatedAt,
    });
  }

  // Validate data structure when received
  if (healthSummary && (!healthSummary.overall || !Array.isArray(healthSummary.services))) {
    console.error('[ServiceHealth] Invalid health summary structure received:', healthSummary);
  }

  // Determine if platform is healthy based on critical services
  const isHealthy = healthSummary?.overall === 'operational' || healthSummary?.overall === 'degraded';

  // Get individual service health from summary
  const getServiceHealth = (serviceKey: string): ServiceHealth | undefined => {
    if (!healthSummary?.services) {
      console.warn(`[ServiceHealth] Attempted to get service '${serviceKey}' health but services array is undefined`);
      return undefined;
    }
    return healthSummary.services.find((s) => s.service === serviceKey);
  };

  // Incident reporting mutation
  const reportIncidentMutation = useMutation({
    mutationFn: async ({ payload, screenshot }: { payload: ServiceIncidentReportPayload; screenshot?: File }) => {
      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('serviceKey', payload.serviceKey);
      formData.append('errorType', payload.errorType);
      
      if (payload.userMessage) {
        formData.append('userMessage', payload.userMessage);
      }
      if (payload.errorMessage) {
        formData.append('errorMessage', payload.errorMessage);
      }
      if (payload.stackTrace) {
        formData.append('stackTrace', payload.stackTrace);
      }
      if (payload.metadata) {
        formData.append('metadata', JSON.stringify(payload.metadata));
      }
      if (screenshot) {
        formData.append('screenshot', screenshot);
      }

      // Use secureFetch for multipart/form-data
      const response = await secureFetch('/api/support/service-incidents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Refetch health summary after incident report
      queryClient.invalidateQueries({ queryKey: ['/api/health/summary'] });
    },
  });

  const contextValue: ServiceHealthContextValue = {
    healthSummary,
    isHealthy,
    isLoading,
    error: error as Error | null,
    getServiceHealth,
    reportIncident: async (payload, screenshot) => {
      await reportIncidentMutation.mutateAsync({ payload, screenshot });
    },
    isReportingIncident: reportIncidentMutation.isPending,
  };

  return (
    <ServiceHealthContext.Provider value={contextValue}>
      {children}
    </ServiceHealthContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useServiceHealth() {
  const context = useContext(ServiceHealthContext);
  if (context === undefined) {
    throw new Error('useServiceHealth must be used within a ServiceHealthProvider');
  }
  return context;
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

// Hook to check if a specific service is operational
export function useServiceStatus(serviceKey: string) {
  const { getServiceHealth } = useServiceHealth();
  const health = getServiceHealth(serviceKey);
  
  return {
    isOperational: health?.status === 'operational',
    isDegraded: health?.status === 'degraded',
    isDown: health?.status === 'down',
    isCritical: health?.isCritical ?? false,
    message: health?.message,
    latencyMs: health?.latencyMs,
  };
}

// Hook to get critical services status
export function useCriticalServicesHealth() {
  const { healthSummary } = useServiceHealth();
  
  const criticalServices = healthSummary?.services.filter((s) => s.isCritical) ?? [];
  const allCriticalOperational = criticalServices.every((s) => s.status === 'operational');
  const anyCriticalDown = criticalServices.some((s) => s.status === 'down');
  
  return {
    criticalServices,
    allCriticalOperational,
    anyCriticalDown,
    criticalServicesCount: criticalServices.length,
  };
}
