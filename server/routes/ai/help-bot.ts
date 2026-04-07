/**
 * server/routes/ai/help-bot.ts
 *
 * Re-export shim — chat.ts imports `HelpBotService` from './ai/help-bot'
 * while the real implementation lives in services/helpai/helpAIBotService.ts.
 */

export { HelpBotService } from '../../services/helpai/helpAIBotService';
