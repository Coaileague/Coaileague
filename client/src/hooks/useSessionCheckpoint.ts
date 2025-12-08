/**
 * useSessionCheckpoint - Frontend hook for session state checkpointing
 * 
 * Automatically saves user state in phases, enabling session recovery
 * after unexpected disconnections. Integrated with Trinity AI Brain.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useLocation } from 'wouter';

interface CheckpointPayload {
  formData?: Record<string, any>;
  pageState?: Record<string, any>;
  userInputs?: Record<string, any>;
  customData?: Record<string, any>;
}

interface SessionCheckpoint {
  id: string;
  userId: string;
  sessionId: string;
  phaseKey: string;
  payload: CheckpointPayload;
  contextSummary: string;
  pageRoute: string;
  savedAt: string;
  isRecovered: boolean;
}

interface UseSessionCheckpointOptions {
  phaseKey: string;
  autoSaveInterval?: number;
  onRecoveryAvailable?: (checkpoints: SessionCheckpoint[]) => void;
  enabled?: boolean;
}

// Generate a unique session ID for this browser session
function getSessionId(): string {
  let sessionId = sessionStorage.getItem('coaileague-session-id');
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem('coaileague-session-id', sessionId);
  }
  return sessionId;
}

export function useSessionCheckpoint(options: UseSessionCheckpointOptions) {
  const { phaseKey, autoSaveInterval = 30000, onRecoveryAvailable, enabled = true } = options;
  const [location] = useLocation();
  const [currentCheckpointId, setCurrentCheckpointId] = useState<string | null>(null);
  const [actionHistory, setActionHistory] = useState<any[]>([]);
  const pendingPayloadRef = useRef<CheckpointPayload | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const sessionId = getSessionId();

  // Check for recoverable checkpoints on mount
  const { data: recoverableData } = useQuery({
    queryKey: ['/api/session-checkpoints/recoverable'],
    enabled: enabled,
    staleTime: 60000,
  });

  // Notify about recoverable checkpoints
  useEffect(() => {
    if (recoverableData?.hasRecoverable && onRecoveryAvailable) {
      onRecoveryAvailable(recoverableData.checkpoints);
    }
  }, [recoverableData, onRecoveryAvailable]);

  // Create checkpoint mutation
  const createCheckpointMutation = useMutation({
    mutationFn: async (payload: CheckpointPayload) => {
      const response = await apiRequest('POST', '/api/session-checkpoints', {
        sessionId,
        phaseKey,
        payload,
        pageRoute: location,
        contextSummary: `User working on ${phaseKey} at ${location}`,
        actionHistory: actionHistory.slice(-20),
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.checkpoint?.id) {
        setCurrentCheckpointId(data.checkpoint.id);
        lastSaveTimeRef.current = Date.now();
        console.log('[SessionCheckpoint] Created checkpoint:', data.checkpoint.id);
      }
    },
  });

  // Update checkpoint mutation
  const updateCheckpointMutation = useMutation({
    mutationFn: async ({ checkpointId, payload }: { checkpointId: string; payload: CheckpointPayload }) => {
      const response = await apiRequest('PATCH', `/api/session-checkpoints/${checkpointId}`, {
        payload,
        contextSummary: `User working on ${phaseKey} at ${location}`,
        actionHistory: actionHistory.slice(-20),
      });
      return response.json();
    },
    onSuccess: () => {
      lastSaveTimeRef.current = Date.now();
    },
  });

  // Finalize checkpoint mutation (graceful session end)
  const finalizeCheckpointMutation = useMutation({
    mutationFn: async (checkpointId: string) => {
      const response = await apiRequest('POST', `/api/session-checkpoints/${checkpointId}/finalize`);
      return response.json();
    },
    onSuccess: () => {
      setCurrentCheckpointId(null);
      console.log('[SessionCheckpoint] Finalized checkpoint');
    },
  });

  // Complete recovery mutation
  const completeRecoveryMutation = useMutation({
    mutationFn: async ({ requestId, userFeedback }: { requestId: string; userFeedback?: string }) => {
      const response = await apiRequest('POST', `/api/session-checkpoints/recovery/${requestId}/complete`, {
        newSessionId: sessionId,
        userFeedback,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/session-checkpoints/recoverable'] });
      console.log('[SessionCheckpoint] Recovery completed:', data);
    },
  });

  // Save checkpoint (create or update)
  const saveCheckpoint = useCallback((payload: CheckpointPayload, immediate = false) => {
    if (!enabled) return;
    
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    
    // Debounce saves unless immediate
    if (!immediate && timeSinceLastSave < 5000) {
      pendingPayloadRef.current = payload;
      return;
    }

    if (currentCheckpointId) {
      updateCheckpointMutation.mutate({ checkpointId: currentCheckpointId, payload });
    } else {
      createCheckpointMutation.mutate(payload);
    }
    
    pendingPayloadRef.current = null;
  }, [enabled, currentCheckpointId, createCheckpointMutation, updateCheckpointMutation]);

  // Record user action
  const recordAction = useCallback((action: string, details?: any) => {
    setActionHistory(prev => [
      ...prev.slice(-19),
      { action, details, timestamp: new Date().toISOString() }
    ]);
  }, []);

  // Finalize current checkpoint (call on logout or explicit save)
  const finalizeCheckpoint = useCallback(() => {
    if (currentCheckpointId) {
      finalizeCheckpointMutation.mutate(currentCheckpointId);
    }
  }, [currentCheckpointId, finalizeCheckpointMutation]);

  // Auto-save interval
  useEffect(() => {
    if (!enabled || autoSaveInterval <= 0) return;

    const intervalId = setInterval(() => {
      if (pendingPayloadRef.current) {
        saveCheckpoint(pendingPayloadRef.current, true);
      }
    }, autoSaveInterval);

    return () => clearInterval(intervalId);
  }, [enabled, autoSaveInterval, saveCheckpoint]);

  // Save on visibility change (user switching tabs)
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingPayloadRef.current) {
        saveCheckpoint(pendingPayloadRef.current, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, saveCheckpoint]);

  // Save on beforeunload (user closing tab)
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = () => {
      if (pendingPayloadRef.current && currentCheckpointId) {
        // Use sendBeacon for reliable delivery during unload
        const data = JSON.stringify({
          payload: pendingPayloadRef.current,
          contextSummary: `User leaving ${phaseKey} at ${location}`,
        });
        navigator.sendBeacon(`/api/session-checkpoints/${currentCheckpointId}`, data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, currentCheckpointId, phaseKey, location]);

  return {
    // State
    checkpointId: currentCheckpointId,
    hasRecoverableCheckpoints: recoverableData?.hasRecoverable || false,
    recoverableCheckpoints: recoverableData?.checkpoints || [],
    isSaving: createCheckpointMutation.isPending || updateCheckpointMutation.isPending,
    
    // Actions
    saveCheckpoint,
    recordAction,
    finalizeCheckpoint,
    completeRecovery: completeRecoveryMutation.mutate,
    
    // Session info
    sessionId,
  };
}

export default useSessionCheckpoint;
