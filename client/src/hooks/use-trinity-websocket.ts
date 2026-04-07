/**
 * USE TRINITY WEBSOCKET HOOK
 * ==========================
 * Uses the shared WebSocketBus for Trinity Agent streaming events.
 * No separate WebSocket connection — everything flows through the
 * universal chat server via WebSocketProvider.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocketBus } from '@/providers/WebSocketProvider';

export interface TrinityStreamEvent {
  event: string;
  data: any;
  timestamp: number;
}

interface UseTrinityWebSocketOptions {
  conversationId: string;
  enabled?: boolean;
  onEvent?: (event: TrinityStreamEvent) => void;
}

interface UseTrinityWebSocketReturn {
  isConnected: boolean;
  lastEvent: TrinityStreamEvent | null;
  send: (message: any) => void;
  disconnect: () => void;
}

const TRINITY_EVENT_PREFIXES = ['trinity_agent_', 'trinity_stream'];
const TRINITY_EVENT_KEYWORDS = ['thinking', 'progress', 'business_impact', 'cost', 'undo', 'confidence', 'error'];

function isTrinityEvent(data: any): boolean {
  const type = data.type || '';
  const event = data.event || '';

  if (TRINITY_EVENT_PREFIXES.some(p => type.startsWith(p) || type === p)) return true;

  const eventLower = event.toLowerCase();
  if (TRINITY_EVENT_KEYWORDS.some(k => eventLower.includes(k))) return true;

  return false;
}

export function useTrinityWebSocket(options: UseTrinityWebSocketOptions): UseTrinityWebSocketReturn {
  const { conversationId, enabled = true, onEvent } = options;
  const bus = useWebSocketBus();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<TrinityStreamEvent | null>(null);
  const onEventRef = useRef(onEvent);
  const subscribedRef = useRef(false);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !conversationId || !bus) return;

    const unsubs: (() => void)[] = [];

    const sendSubscribe = () => {
      if (bus.isConnected() && !subscribedRef.current) {
        bus.send({
          type: 'trinity_agent_subscribe',
          conversationId,
        });
        subscribedRef.current = true;
      }
    };

    unsubs.push(bus.subscribe('__ws_connected', () => {
      setIsConnected(true);
      subscribedRef.current = false;
      sendSubscribe();
    }));

    unsubs.push(bus.subscribe('__ws_disconnected', () => {
      setIsConnected(false);
      subscribedRef.current = false;
    }));

    if (bus.isConnected()) {
      setIsConnected(true);
      sendSubscribe();
    }

    unsubs.push(bus.subscribeAll((data: any) => {
      if (!isTrinityEvent(data)) return;

      const streamEvent: TrinityStreamEvent = {
        event: data.event || data.type,
        data: data.data || data,
        timestamp: data.timestamp || Date.now(),
      };
      setLastEvent(streamEvent);
      onEventRef.current?.(streamEvent);
    }));

    return () => {
      unsubs.forEach(u => u());
      subscribedRef.current = false;
    };
  }, [bus, conversationId, enabled]);

  const send = useCallback((message: any) => {
    bus.send(message);
  }, [bus]);

  const disconnect = useCallback(() => {
    subscribedRef.current = false;
  }, []);

  return {
    isConnected,
    lastEvent,
    send,
    disconnect,
  };
}

export function useTrinityEvent<T = any>(
  eventType: string,
  callback?: (data: T) => void
): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (callback && data) {
      callback(data);
    }
  }, [data, callback]);

  return data;
}
