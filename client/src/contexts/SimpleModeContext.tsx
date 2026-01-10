import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

type ViewModePreference = 'inherit' | 'simple' | 'pro';
type ViewModeSource = 'user_fallback' | 'workspace_default' | 'workspace_forced' | 'employee_preference';

interface ViewModeResponse {
  effectiveMode: 'simple' | 'pro';
  source: ViewModeSource;
  isSimpleMode: boolean;
  workspaceId: string | null;
}

interface SimpleModeContextType {
  isSimpleMode: boolean;
  toggleSimpleMode: () => void;
  setSimpleMode: (value: boolean) => void;
  setViewModePreference: (preference: ViewModePreference) => void;
  isLoading: boolean;
  viewModeSource: ViewModeSource | null;
  isProView: boolean;
  currentWorkspaceId: string | null;
}

const SimpleModeContext = createContext<SimpleModeContextType | undefined>(undefined);

export function SimpleModeProvider({ children }: { children: ReactNode }) {
  const [localSimpleMode, setLocalSimpleMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('simpleMode');
    return stored === 'true';
  });
  const [viewModeSource, setViewModeSource] = useState<ViewModeSource | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  // Fetch effective view mode from server (workspace-aware)
  const { data: viewMode, isLoading: viewModeLoading } = useQuery<ViewModeResponse>({
    queryKey: ['/api/user/view-mode'],
    retry: false,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Mutation to update view mode preference
  const updatePreferenceMutation = useMutation({
    mutationFn: async (params: { simpleMode?: boolean; viewModePreference?: ViewModePreference }) => {
      return apiRequest('PATCH', '/api/user/preferences', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/view-mode'] });
    },
  });

  // Sync with server response
  useEffect(() => {
    if (viewMode) {
      setLocalSimpleMode(viewMode.isSimpleMode);
      setViewModeSource(viewMode.source);
      setCurrentWorkspaceId(viewMode.workspaceId);
      localStorage.setItem('simpleMode', String(viewMode.isSimpleMode));
      localStorage.setItem('viewModeWorkspace', viewMode.workspaceId || '');
    }
  }, [viewMode]);

  // Set simple mode with workspace-aware preference
  const setSimpleMode = useCallback((value: boolean) => {
    setLocalSimpleMode(value);
    localStorage.setItem('simpleMode', String(value));
    
    // Update both user-level and workspace-level preference
    const preference: ViewModePreference = value ? 'simple' : 'pro';
    updatePreferenceMutation.mutate({ 
      simpleMode: value,
      viewModePreference: preference 
    });
  }, [updatePreferenceMutation]);

  // Set workspace-specific view mode preference
  const setViewModePreference = useCallback((preference: ViewModePreference) => {
    const isSimple = preference === 'simple';
    setLocalSimpleMode(isSimple);
    localStorage.setItem('simpleMode', String(isSimple));
    
    updatePreferenceMutation.mutate({ viewModePreference: preference });
  }, [updatePreferenceMutation]);

  const toggleSimpleMode = useCallback(() => {
    setSimpleMode(!localSimpleMode);
  }, [localSimpleMode, setSimpleMode]);

  return (
    <SimpleModeContext.Provider 
      value={{ 
        isSimpleMode: localSimpleMode, 
        isProView: !localSimpleMode,
        toggleSimpleMode, 
        setSimpleMode,
        setViewModePreference,
        isLoading: viewModeLoading,
        viewModeSource,
        currentWorkspaceId,
      }}
    >
      {children}
    </SimpleModeContext.Provider>
  );
}

export function useSimpleMode() {
  const context = useContext(SimpleModeContext);
  if (context === undefined) {
    throw new Error('useSimpleMode must be used within a SimpleModeProvider');
  }
  return context;
}
