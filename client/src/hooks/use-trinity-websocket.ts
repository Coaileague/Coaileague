// Stub — use-trinity-websocket removed; real-time handled by trinityChatService
export interface TrinityStreamEvent { type: string; data?: any; }
export function useTrinityWebSocket(_wsId?: string) { return { events: [], isConnected: false }; }
