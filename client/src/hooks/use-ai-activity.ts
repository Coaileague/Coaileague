/**
 * useAIActivity - Subscribe to real-time AI activity events from the server
 * 
 * This hook receives WebSocket broadcasts of AI activity and provides
 * the current AI state for Trinity mascot mode mapping.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MascotMode } from '@/config/mascotConfig';

export type AIActivityState = 
  | 'IDLE'
  | 'SEARCHING'
  | 'THINKING'
  | 'ANALYZING'
  | 'CODING'
  | 'UPLOADING'
  | 'LISTENING'
  | 'SUCCESS'
  | 'ERROR'
  | 'ADVISING';

export interface AIActivityEvent {
  type: 'ai_activity';
  state: AIActivityState;
  source: string;
  workspaceId?: string;
  userId?: string;
  message?: string;
  progress?: number;
  timestamp: string;
}

interface AIActivityOptions {
  workspaceId?: string;
  userId?: string;
  autoResetDelay?: number;
}

const STATE_TO_MODE_MAP: Record<AIActivityState, MascotMode> = {
  IDLE: 'IDLE',
  SEARCHING: 'SEARCHING',
  THINKING: 'THINKING',
  ANALYZING: 'ANALYZING',
  CODING: 'CODING',
  UPLOADING: 'UPLOADING',
  LISTENING: 'LISTENING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  ADVISING: 'ADVISING',
};

export function useAIActivity(options: AIActivityOptions = {}) {
  const { workspaceId, userId, autoResetDelay = 5000 } = options;
  
  const [activityState, setActivityState] = useState<AIActivityState>('IDLE');
  const [lastEvent, setLastEvent] = useState<AIActivityEvent | null>(null);
  const [isActive, setIsActive] = useState(false);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleActivity = useCallback((event: AIActivityEvent) => {
    if (workspaceId && event.workspaceId && event.workspaceId !== workspaceId) {
      return;
    }
    if (userId && event.userId && event.userId !== userId) {
      return;
    }

    setActivityState(event.state);
    setLastEvent(event);
    setIsActive(event.state !== 'IDLE');

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }

    if (event.state !== 'IDLE' && event.state !== 'SUCCESS' && event.state !== 'ERROR') {
      resetTimeoutRef.current = setTimeout(() => {
        setActivityState('IDLE');
        setIsActive(false);
      }, autoResetDelay);
    }
  }, [workspaceId, userId, autoResetDelay]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ai_activity') {
          handleActivity(data as AIActivityEvent);
        }
      } catch {
      }
    };

    const existingWs = (window as any).__coaileague_ws;
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      existingWs.addEventListener('message', handleMessage);
      wsRef.current = existingWs;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connectWs = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      
      const ws = new WebSocket(wsUrl);
      ws.addEventListener('message', handleMessage);
      ws.addEventListener('close', () => {
        setTimeout(connectWs, 3000);
      });
      wsRef.current = ws;
      (window as any).__coaileague_ws = ws;
    };

    if (!wsRef.current) {
      connectWs();
    }

    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, [handleActivity]);

  const mascotMode: MascotMode = STATE_TO_MODE_MAP[activityState] || 'IDLE';

  return {
    activityState,
    mascotMode,
    lastEvent,
    isActive,
    source: lastEvent?.source,
    message: lastEvent?.message,
    progress: lastEvent?.progress,
  };
}

export default useAIActivity;
