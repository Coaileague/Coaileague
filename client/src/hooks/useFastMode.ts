/**
 * useFastMode - Hook for managing Fast Mode state across the application
 * 
 * Provides:
 * - Global Fast Mode toggle state
 * - Keyboard shortcut (Ctrl/Cmd + Shift + F)
 * - Credit balance checking
 * - Value comparison data
 * - Active task tracking
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface FastModeState {
  enabled: boolean;
  canEnable: boolean;
  creditBalance: number;
  minCreditsRequired: number;
  activeTasks: number;
  maxConcurrentTasks: number;
}

interface UseFastModeOptions {
  workspaceId?: string;
  enableKeyboardShortcut?: boolean;
  persistPreference?: boolean;
}

interface CreditData {
  balance: number;
}

interface FastModeStatusData {
  activeTasks: number;
  maxConcurrent: number;
}

interface ValueComparisonData {
  normalMode?: {
    avgExecutionTime?: number;
  };
  fastMode?: {
    avgExecutionTime?: number;
    parallelAgents?: number;
    slaGuarantee?: number;
    creditMultiplier?: number;
  };
}

interface UseFastModeReturn {
  // State
  fastModeEnabled: boolean;
  canUseFastMode: boolean;
  creditBalance: number;
  activeTasks: number;
  
  // Actions
  toggleFastMode: () => void;
  enableFastMode: () => void;
  disableFastMode: () => void;
  
  // Value comparison
  valueComparison: {
    timeSavedPercent: number;
    parallelAgents: number;
    slaGuarantee: number;
    creditMultiplier: number;
  } | null;
  
  // Loading state
  isLoading: boolean;
}

const FAST_MODE_STORAGE_KEY = 'trinity_fast_mode_enabled';
const MIN_CREDITS_REQUIRED = 10;

export function useFastMode(options: UseFastModeOptions = {}): UseFastModeReturn {
  const { 
    workspaceId, 
    enableKeyboardShortcut = true,
    persistPreference = true 
  } = options;
  
  const { toast } = useToast();
  
  // Initialize from localStorage if persisting
  const [fastModeEnabled, setFastModeEnabled] = useState(() => {
    if (persistPreference && typeof window !== 'undefined') {
      const stored = localStorage.getItem(FAST_MODE_STORAGE_KEY);
      return stored === 'true';
    }
    return false;
  });
  
  // Fetch credit balance
  const { data: creditData, isLoading: creditsLoading } = useQuery<CreditData>({
    queryKey: ['/api/billing/credits', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Fetch fast mode status
  const { data: fastModeStatus, isLoading: statusLoading } = useQuery<FastModeStatusData>({
    queryKey: ['/api/ai-brain/fast-mode/status', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 5000, // Refresh every 5 seconds when active
  });
  
  // Fetch value comparison
  const { data: valueData } = useQuery<ValueComparisonData>({
    queryKey: ['/api/ai-brain/fast-mode/value', workspaceId],
    enabled: !!workspaceId,
    staleTime: 60000, // Cache for 1 minute
  });
  
  const creditBalance = creditData?.balance || 0;
  const activeTasks = fastModeStatus?.activeTasks || 0;
  const maxConcurrentTasks = fastModeStatus?.maxConcurrent || 3;
  
  const canUseFastMode = useMemo(() => {
    return creditBalance >= MIN_CREDITS_REQUIRED && activeTasks < maxConcurrentTasks;
  }, [creditBalance, activeTasks, maxConcurrentTasks]);
  
  const valueComparison = useMemo(() => {
    if (!valueData) return null;
    
    const normalTime = valueData.normalMode?.avgExecutionTime || 25;
    const fastTime = valueData.fastMode?.avgExecutionTime || 10;
    
    return {
      timeSavedPercent: Math.round(((normalTime - fastTime) / normalTime) * 100),
      parallelAgents: valueData.fastMode?.parallelAgents || 4,
      slaGuarantee: valueData.fastMode?.slaGuarantee || 15,
      creditMultiplier: valueData.fastMode?.creditMultiplier || 2
    };
  }, [valueData]);
  
  // Persist preference
  useEffect(() => {
    if (persistPreference && typeof window !== 'undefined') {
      localStorage.setItem(FAST_MODE_STORAGE_KEY, String(fastModeEnabled));
    }
  }, [fastModeEnabled, persistPreference]);
  
  // Keyboard shortcut: Ctrl/Cmd + Shift + F
  useEffect(() => {
    if (!enableKeyboardShortcut) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFastMode();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcut, canUseFastMode, fastModeEnabled]);
  
  const toggleFastMode = useCallback(() => {
    if (!fastModeEnabled && !canUseFastMode) {
      toast({
        title: 'Cannot Enable Fast Mode',
        description: creditBalance < MIN_CREDITS_REQUIRED 
          ? `You need at least ${MIN_CREDITS_REQUIRED} credits. Current balance: ${creditBalance}`
          : `Maximum concurrent fast mode tasks reached (${activeTasks}/${maxConcurrentTasks})`,
        variant: 'destructive'
      });
      return;
    }
    
    const newState = !fastModeEnabled;
    setFastModeEnabled(newState);
    
    toast({
      title: newState ? 'Fast Mode Enabled' : 'Fast Mode Disabled',
      description: newState 
        ? 'Tasks will now use 2x credits for parallel execution'
        : 'Tasks will use normal sequential processing',
    });
  }, [fastModeEnabled, canUseFastMode, creditBalance, activeTasks, maxConcurrentTasks, toast]);
  
  const enableFastMode = useCallback(() => {
    if (!canUseFastMode) {
      toast({
        title: 'Cannot Enable Fast Mode',
        description: 'Insufficient credits or maximum concurrent tasks reached',
        variant: 'destructive'
      });
      return;
    }
    setFastModeEnabled(true);
  }, [canUseFastMode, toast]);
  
  const disableFastMode = useCallback(() => {
    setFastModeEnabled(false);
  }, []);
  
  return {
    fastModeEnabled,
    canUseFastMode,
    creditBalance,
    activeTasks,
    toggleFastMode,
    enableFastMode,
    disableFastMode,
    valueComparison,
    isLoading: creditsLoading || statusLoading
  };
}

export default useFastMode;
