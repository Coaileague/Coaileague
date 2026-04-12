import { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

type MessageHandler = (data: any) => void;

export interface WebSocketBus {
  subscribe: (type: string, handler: MessageHandler) => () => void;
  subscribeAll: (handler: MessageHandler) => () => void;
  send: (message: any) => void;
  sendChatMessage: (message: Omit<any, 'clientId'>) => string;
  isConnected: () => boolean;
  getSocket: () => WebSocket | null;
}

const WebSocketContext = createContext<WebSocketBus | null>(null);

class WebSocketBusImpl implements WebSocketBus {
  private socket: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private globalHandlers: Set<MessageHandler> = new Set();
  private userId: string | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isConnectingFlag = false;
  private sendQueue: any[] = [];
  private disposed = false;
  // Auth is complete only after the server confirms ws_authenticated (or fallback fires).
  // isConnected() gates on this so that join_conversation is never sent before serverAuth is set.
  private authCompleteFlag = false;

  connect(userId: string) {
    if (this.disposed) return;
    if (this.isConnectingFlag) return;
    if (this.socket?.readyState === WebSocket.OPEN && this.userId === userId) return;

    if (this.socket && this.userId !== userId) {
      this.socket.close();
      this.socket = null;
    }

    this.userId = userId;
    this.isConnectingFlag = true;
    this.authCompleteFlag = false;

    // NOTE: Any "wss://localhost:undefined" errors in the browser console are from
    // Vite's HMR client (@vite/client), NOT from this application WebSocket.
    // That is a known Vite dev-mode artifact in Replit and does not affect production.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

    try {
      const ws = new WebSocket(wsUrl);
      this.socket = ws;

      ws.onopen = () => {
        this.isConnectingFlag = false;
        this.reconnectAttempts = 0;
        console.warn('[WS-Bus] Connected (single socket)');

        // Flush queued messages and signal all subscribers that WS is ready.
        // Called after server confirms auth (or after fallback timeout).
        const flushAndSignal = () => {
          this.authCompleteFlag = true;
          for (const msg of this.sendQueue) {
            ws.send(JSON.stringify(msg));
          }
          this.sendQueue = [];
          this.dispatch({ type: '__ws_connected' });
        };

        // Fetch a short-lived auth token via HTTP (always authenticated) and send it
        // over the WS so the server can set ws.serverAuth even if the session cookie
        // lookup failed at upgrade time (DB hiccup, cookie edge cases in Replit env).
        // We wait for the server to confirm auth before dispatching __ws_connected so
        // that join_notifications / join_conversation arrive with ws.serverAuth already set.
        // Content-Type header is required to pass the global 415 middleware guard.
        fetch('/api/auth/ws-token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
          .then(r => (r.ok ? r.json() : null))
          .then((data: any) => {
            if (!data?.token || ws.readyState !== WebSocket.OPEN) {
              // Not authenticated or WS closed — proceed immediately without auth
              flushAndSignal();
              return;
            }

            // Listen for the server's ws_authenticated / ws_auth_failed confirmation
            let authFallback: ReturnType<typeof setTimeout> | null = setTimeout(() => {
              authFallback = null;
              ws.removeEventListener('message', onAuthMsg);
              flushAndSignal();
            }, 3000);

            const onAuthMsg = (event: MessageEvent) => {
              try {
                const d = JSON.parse(event.data);
                if (d.type === 'ws_authenticated' || d.type === 'ws_auth_failed') {
                  ws.removeEventListener('message', onAuthMsg);
                  if (authFallback) { clearTimeout(authFallback); authFallback = null; }
                  flushAndSignal();
                }
              } catch {}
            };

            ws.addEventListener('message', onAuthMsg);
            ws.send(JSON.stringify({ type: 'ws_authenticate', token: data.token }));
          })
          .catch(() => flushAndSignal());
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification_delivery' && data.notificationId) {
            fetch(`/api/notifications/ack/${data.notificationId}`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            }).catch(err => console.warn('[WS] Failed to ack notification:', err));
          }
          // Server requested re-authentication (join arrived before serverAuth was set).
          // Silently re-fetch the ws-token and re-authenticate without user-visible error.
          if (data.type === 'ws_auth_required') {
            fetch('/api/auth/ws-token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
              .then(r => (r.ok ? r.json() : null))
              .then((tokenData: any) => {
                if (tokenData?.token && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'ws_authenticate', token: tokenData.token }));
                }
              })
              .catch(() => {});
            return;
          }
          // Server indicates the sync gap is too large to replay — do a full page reload
          // to ensure the client has the latest application state.
          if (data.type === 'full_refresh_required') {
            console.warn('[WS] full_refresh_required received — reloading page for fresh state.');
            window.location.reload();
            return;
          }
          this.dispatch(data);
        } catch {
        }
      };

      ws.onclose = (event) => {
        this.isConnectingFlag = false;
        this.authCompleteFlag = false;
        this.dispatch({ type: '__ws_disconnected' });

        if (!this.disposed && !event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          // T004: Exponential backoff with jitter
          const baseDelay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 30000);
          const jitter = Math.random() * 1000 - 500; // ±500ms jitter
          const delay = Math.max(0, baseDelay + jitter);
          
          this.reconnectAttempts++;
          
          this.reconnectTimeout = setTimeout(() => {
            if (this.userId) this.connect(this.userId);
          }, delay);
        }
      };

      ws.onerror = () => {
        this.isConnectingFlag = false;
      };
    } catch {
      this.isConnectingFlag = false;
    }
  }

  private dispatch(data: any) {
    const type = data.type;
    if (type) {
      const typeHandlers = this.handlers.get(type);
      if (typeHandlers) {
        typeHandlers.forEach(h => {
          try { h(data); } catch {}
        });
      }
    }
    this.globalHandlers.forEach(h => {
      try { h(data); } catch {}
    });
  }

  subscribe(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
      if (this.handlers.get(type)?.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  subscribeAll(handler: MessageHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  send(message: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.sendQueue.push(message);
    }
  }

  // Send a chat_message with an auto-generated clientId for delivery confirmation.
  // Returns the clientId so the caller can track ack status.
  sendChatMessage(message: Omit<any, 'clientId'>): string {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.send({ ...message, clientId });
    return clientId;
  }

  // Returns true only after auth has completed — prevents join_conversation from
  // racing ahead of ws_authenticate when a component mounts mid-auth-handshake.
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.authCompleteFlag;
  }

  getSocket(): WebSocket | null {
    return this.socket;
  }

  disconnect() {
    this.disposed = true;
    this.authCompleteFlag = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.handlers.clear();
    this.globalHandlers.clear();
    this.sendQueue = [];
  }
}

let globalBus: WebSocketBusImpl | null = null;

function getOrCreateBus(): WebSocketBusImpl {
  if (!globalBus) {
    globalBus = new WebSocketBusImpl();
  }
  return globalBus;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const busRef = useRef<WebSocketBusImpl>(getOrCreateBus());

  useEffect(() => {
    if (user?.id) {
      busRef.current.connect(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (globalBus) {
        globalBus.disconnect();
        globalBus = null;
      }
    };
  }, []);

  return (
    <WebSocketContext.Provider value={busRef.current}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketBus(): WebSocketBus {
  const bus = useContext(WebSocketContext);
  if (!bus) {
    return {
      subscribe: () => () => {},
      subscribeAll: () => () => {},
      send: () => {},
      sendChatMessage: () => '',
      isConnected: () => false,
      getSocket: () => null,
    };
  }
  return bus;
}

export function useWsSubscription(type: string | string[], handler: MessageHandler) {
  const bus = useWebSocketBus();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const stableHandler = useCallback((data: any) => {
    handlerRef.current(data);
  }, []);

  useEffect(() => {
    const types = Array.isArray(type) ? type : [type];
    const unsubs = types.map(t => bus.subscribe(t, stableHandler));
    return () => unsubs.forEach(u => u());
  }, [bus, type, stableHandler]);
}

export function useWsSend() {
  const bus = useWebSocketBus();
  return useCallback((message: any) => bus.send(message), [bus]);
}

export function useWsConnected(): boolean {
  const bus = useWebSocketBus();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsub1 = bus.subscribe('__ws_connected', () => setConnected(true));
    const unsub2 = bus.subscribe('__ws_disconnected', () => setConnected(false));
    setConnected(bus.isConnected());
    return () => { unsub1(); unsub2(); };
  }, [bus]);

  return connected;
}
