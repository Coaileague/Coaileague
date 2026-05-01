/**
 * Trinity WebSocket Service — streams Trinity AI responses to connected clients
 * Uses the real WebSocket infrastructure already running in ChatServerHub
 */
import { createLogger } from '../../../lib/logger';
const log = createLogger('TrinityWebSocketService');

type TrinityStreamEvent =
  | { type: 'ai_message_start'; messageId: string; workspaceId: string }
  | { type: 'ai_token'; messageId: string; token: string; batchIndex: number }
  | { type: 'ai_tool_call'; messageId: string; toolName: string; input: unknown }
  | { type: 'ai_tool_result'; messageId: string; toolName: string; result: unknown }
  | { type: 'ai_message_end'; messageId: string; totalTokens: number }
  | { type: 'ai_error'; messageId: string; error: string };

// Singleton broadcast function registered by the WebSocket server
let _broadcastFn: ((workspaceId: string, event: TrinityStreamEvent) => void) | null = null;

export const trinityWebSocketService = {
  register(broadcastFn: (workspaceId: string, event: TrinityStreamEvent) => void) {
    _broadcastFn = broadcastFn;
    log.info('[TrinityWS] Broadcast function registered');
  },

  broadcast(workspaceId: string, event: TrinityStreamEvent) {
    if (!_broadcastFn) {
      log.debug('[TrinityWS] No broadcast function registered — skipping');
      return;
    }
    try {
      _broadcastFn(workspaceId, event);
    } catch (err: unknown) {
      log.warn(`[TrinityWS] Broadcast failed: ${err?.message}`);
    }
  },

  async streamResponse(workspaceId: string, prompt: string, onToken?: (token: string) => void): Promise<string> {
    const { claudeService } = await import('../trinity-orchestration/claudeService');
    const messageId = `trinity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.broadcast(workspaceId, { type: 'ai_message_start', messageId, workspaceId });

    const response = await claudeService.call(prompt);
    const tokens = response.split(' ');
    let batchIndex = 0;

    // Emit tokens in batches of 3 (30-60ms cadence)
    for (let i = 0; i < tokens.length; i += 3) {
      const batch = tokens.slice(i, i + 3).join(' ') + ' ';
      this.broadcast(workspaceId, { type: 'ai_token', messageId, token: batch, batchIndex: batchIndex++ });
      if (onToken) onToken(batch);
      await new Promise(r => setTimeout(r, 40));
    }

    this.broadcast(workspaceId, { type: 'ai_message_end', messageId, totalTokens: tokens.length });
    return response;
  },
};
