/**
 * USE TRINITY STATE HOOK
 * ======================
 * Central state management for Trinity Agent UI.
 * Manages thinking steps, progress, business impact, and reversible actions.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTrinityWebSocket, TrinityStreamEvent } from './use-trinity-websocket';
import { secureFetch } from '@/lib/csrf';

export interface ThinkingStep {
  id: string;
  status: 'active' | 'complete' | 'error' | 'pending';
  message: string;
  timestamp: number;
}

export interface Progress {
  currentAction: string;
  completed: number;
  total: number;
  eta: number;
}

export interface BusinessImpact {
  cost: number;
  timeSaved: number;
  peopleAffected: number;
  compliance: 'checking' | 'compliant' | 'warning' | 'violation';
  complianceDetails?: string;
}

export interface CostTracking {
  labor: number;
  billing: number;
  budgetUsed: number;
  budgetTotal: number;
}

export interface ReversibleAction {
  id: string;
  description: string;
  reversible: boolean;
  timestamp: number;
}

export interface ConfidenceLevel {
  level: number;
  threshold: number;
}

export interface TrinityAgentState {
  isExecuting: boolean;
  thinkingSteps: ThinkingStep[];
  progress: Progress | null;
  businessImpact: BusinessImpact | null;
  costs: CostTracking | null;
  reversibleActions: ReversibleAction[];
  confidence: ConfidenceLevel | null;
  lastError: string | null;
  conversationId: string | null;
}

interface UseTrinityStateOptions {
  conversationId: string | null;
  onExecutionComplete?: (success: boolean) => void;
}

interface UseTrinityStateReturn extends TrinityAgentState {
  startExecution: () => void;
  stopExecution: () => void;
  clearSteps: () => void;
  undoAction: (actionId: string) => Promise<boolean>;
  isConnected: boolean;
}

export function useTrinityState(options: UseTrinityStateOptions): UseTrinityStateReturn {
  const { conversationId, onExecutionComplete } = options;
  const prevConversationIdRef = useRef(conversationId);
  
  const [state, setState] = useState<TrinityAgentState>({
    isExecuting: false,
    thinkingSteps: [],
    progress: null,
    businessImpact: null,
    costs: null,
    reversibleActions: [],
    confidence: null,
    lastError: null,
    conversationId
  });

  useEffect(() => {
    if (conversationId !== prevConversationIdRef.current) {
      prevConversationIdRef.current = conversationId;
      setState(prev => ({ ...prev, conversationId }));
    }
  }, [conversationId]);

  const handleEvent = useCallback((event: TrinityStreamEvent) => {
    const eventType = event.event.toLowerCase();
    
    switch (eventType) {
      case 'thinking_step':
        setState(prev => ({
          ...prev,
          thinkingSteps: [
            ...prev.thinkingSteps,
            {
              id: `step-${Date.now()}`,
              status: event.data.status,
              message: event.data.message,
              timestamp: event.timestamp
            }
          ]
        }));
        break;

      case 'progress':
        setState(prev => ({
          ...prev,
          progress: event.data
        }));
        break;

      case 'business_impact':
        setState(prev => ({
          ...prev,
          businessImpact: event.data
        }));
        break;

      case 'cost_update':
        setState(prev => ({
          ...prev,
          costs: event.data
        }));
        break;

      case 'undo_action':
        setState(prev => ({
          ...prev,
          reversibleActions: Array.isArray(event.data) 
            ? event.data.map((action: any) => ({
                ...action,
                timestamp: new Date(action.timestamp).getTime()
              }))
            : prev.reversibleActions
        }));
        break;

      case 'confidence':
        setState(prev => ({
          ...prev,
          confidence: event.data
        }));
        break;

      case 'error':
        setState(prev => ({
          ...prev,
          lastError: event.data.message
        }));
        break;
    }
  }, []);

  const { isConnected } = useTrinityWebSocket({
    conversationId: conversationId || '',
    enabled: !!conversationId,
    onEvent: handleEvent
  });

  const startExecution = useCallback(() => {
    setState(prev => ({
      ...prev,
      isExecuting: true,
      thinkingSteps: [],
      progress: null,
      lastError: null
    }));
  }, []);

  const stopExecution = useCallback(() => {
    setState(prev => ({
      ...prev,
      isExecuting: false
    }));
  }, []);

  const clearSteps = useCallback(() => {
    setState(prev => ({
      ...prev,
      thinkingSteps: [],
      progress: null,
      businessImpact: null,
      costs: null,
      reversibleActions: [],
      confidence: null,
      lastError: null
    }));
  }, []);

  const undoAction = useCallback(async (actionId: string): Promise<boolean> => {
    try {
      const response = await secureFetch(`/api/trinity/undo/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setState(prev => ({
          ...prev,
          reversibleActions: prev.reversibleActions.filter(a => a.id !== actionId)
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[useTrinityState] Undo failed:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (state.progress?.completed === state.progress?.total && state.progress?.total > 0) {
      stopExecution();
      onExecutionComplete?.(true);
    }
  }, [state.progress, stopExecution, onExecutionComplete]);

  return {
    ...state,
    startExecution,
    stopExecution,
    clearSteps,
    undoAction,
    isConnected
  };
}
