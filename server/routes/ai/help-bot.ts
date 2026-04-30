/**
 * server/routes/ai/help-bot.ts — ACTIVE RE-EXPORT SHIM (do not delete)
 *
 * chat.ts dynamically imports `HelpBotService` from this path via:
 *   await import('./ai/help-bot')
 * Used by two live production routes:
 *   GET  /api/chat/help-bot/voice-grant  — generates voice-granted system message
 *   POST /api/chat/help-bot/respond      — generates HelpAI bot response
 *
 * The real implementation lives in services/helpai/helpAIBotService.ts.
 * This shim keeps chat.ts import paths clean and decoupled from the service layer.
 */

export { HelpBotService } from '../../services/helpai/helpAIBotService';
