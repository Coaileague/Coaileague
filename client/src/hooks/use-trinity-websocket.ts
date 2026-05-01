// Stub — use-trinity-websocket removed; real-time handled by trinityChatService
export interface TrinityStreamEvent { type: string; data?: unknown; }
export function useTrinityWebSocket(_wsId?: string) { return { events: [], isConnected: false }; }
