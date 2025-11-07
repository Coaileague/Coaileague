import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface ShiftWebSocketMessage {
  type: 'shift_created' | 'shift_updated' | 'shift_deleted' | 'shift_updates_subscribed' | 'error';
  shift?: any;
  shiftId?: string;
  timestamp?: string;
  workspaceId?: string;
  message?: string;
}

export function useShiftWebSocket(userId: string | undefined, workspaceId: string | undefined) {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  const MIN_RECONNECT_INTERVAL = 1000;
  const lastConnectAttemptRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (!userId || !workspaceId) return;

    // Rate limit connection attempts
    const now = Date.now();
    if (now - lastConnectAttemptRef.current < MIN_RECONNECT_INTERVAL) {
      console.log('⚠️ Shift WS: Connection rate limited, waiting...');
      return;
    }
    lastConnectAttemptRef.current = now;

    // Prevent duplicate connections
    if (isConnectingRef.current) {
      console.log('⚠️ Shift WS: Already connecting, aborting duplicate');
      return;
    }

    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
        console.log(`⚠️ Shift WS: WebSocket exists (state: ${state}), aborting duplicate`);
        return;
      }
    }

    console.log('🔌 Creating shift WebSocket connection for workspace:', workspaceId);
    isConnectingRef.current = true;

    // Clean up existing connection
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsHost = window.location.host;
      const wsUrl = `${protocol}://${wsHost}/ws/chat`; // Using same path as chat for now
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('📡 Shift WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false;

        // Subscribe to shift updates for this workspace
        ws.send(JSON.stringify({
          type: 'join_shift_updates',
          userId,
          workspaceId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data: ShiftWebSocketMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'shift_updates_subscribed':
              console.log('✅ Subscribed to shift updates for workspace:', data.workspaceId);
              break;

            case 'shift_created':
              console.log('📅 New shift created:', data.shift?.title);
              // Invalidate shifts query to refetch data
              queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
              toast({
                title: "New Shift Created",
                description: data.shift?.title || "A new shift has been added to the schedule",
                variant: "info" as any,
              });
              break;

            case 'shift_updated':
              console.log('✏️ Shift updated:', data.shift?.title);
              queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
              queryClient.invalidateQueries({ queryKey: ["/api/shifts", data.shift?.id] });
              toast({
                title: "Shift Updated",
                description: data.shift?.title || "A shift has been modified",
                variant: "info" as any,
              });
              break;

            case 'shift_deleted':
              console.log('🗑️ Shift deleted:', data.shiftId);
              queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
              toast({
                title: "Shift Removed",
                description: "A shift has been deleted from the schedule",
                variant: "warning" as any,
              });
              break;

            case 'error':
              const errorMessage = data.message || 'An error occurred';
              console.error('Shift WebSocket error:', errorMessage);
              setError(errorMessage);
              break;

            default:
              // Ignore other message types (chat messages, etc.)
              break;
          }
        } catch (err) {
          console.error('Failed to parse shift WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('📡 Shift WebSocket disconnected');
        setIsConnected(false);
        isConnectingRef.current = false;

        // Attempt to reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Shift WS: Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
          connect();
        }, delay);
      };

      ws.onerror = (error) => {
        console.error('Shift WebSocket error:', error);
        setError('Connection error');
        isConnectingRef.current = false;
      };
    } catch (err) {
      console.error('Failed to create shift WebSocket:', err);
      setError('Failed to connect');
      isConnectingRef.current = false;
    }
  }, [userId, workspaceId, toast]);

  // Connect on mount and when userId/workspaceId changes
  useEffect(() => {
    if (userId && workspaceId) {
      connect();
    }

    // CRITICAL: Cleanup on unmount AND when userId/workspaceId changes
    // This prevents duplicate subscriptions and memory leaks
    return () => {
      console.log('🔌 Cleaning up shift WebSocket (unmount or user/workspace change)');
      
      // Clear reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Close existing connection
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.log('🔌 Closing shift WebSocket connection');
          wsRef.current.close();
        }
        wsRef.current = null; // Clear reference
      }
      
      // Reset connection state
      isConnectingRef.current = false;
      setIsConnected(false);
      setError(null);
    };
  }, [userId, workspaceId, connect]);

  return {
    isConnected,
    error,
    reconnect: connect,
  };
}
