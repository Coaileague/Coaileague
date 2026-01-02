import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface SimpleModeContextType {
  isSimpleMode: boolean;
  toggleSimpleMode: () => void;
  setSimpleMode: (value: boolean) => void;
  isLoading: boolean;
}

const SimpleModeContext = createContext<SimpleModeContextType | undefined>(undefined);

export function SimpleModeProvider({ children }: { children: ReactNode }) {
  const [localSimpleMode, setLocalSimpleMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('simpleMode');
    return stored === 'true';
  });

  const { data: user, isLoading: userLoading } = useQuery<{ simpleMode?: boolean }>({
    queryKey: ['/api/auth/me'],
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: async (simpleMode: boolean) => {
      return apiRequest('/api/user/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ simpleMode }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
  });

  useEffect(() => {
    if (user?.simpleMode !== undefined) {
      setLocalSimpleMode(user.simpleMode);
      localStorage.setItem('simpleMode', String(user.simpleMode));
    }
  }, [user?.simpleMode]);

  const setSimpleMode = useCallback((value: boolean) => {
    setLocalSimpleMode(value);
    localStorage.setItem('simpleMode', String(value));
    updatePreferenceMutation.mutate(value);
  }, [updatePreferenceMutation]);

  const toggleSimpleMode = useCallback(() => {
    setSimpleMode(!localSimpleMode);
  }, [localSimpleMode, setSimpleMode]);

  return (
    <SimpleModeContext.Provider 
      value={{ 
        isSimpleMode: localSimpleMode, 
        toggleSimpleMode, 
        setSimpleMode,
        isLoading: userLoading 
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
