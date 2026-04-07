/**
 * Bot Ecosystem Index - Exports all bot-related modules
 */

export * from './registry';
export * from './pool';
export * from './botCommandExecutor';

import { createLogger } from '../lib/logger';
const log = createLogger('bots');
import { BOT_REGISTRY } from './registry';
import { botPool } from './pool';
import { botCommandExecutor } from './botCommandExecutor';

log.info('[BotEcosystem] Bot ecosystem initialized with', Object.keys(BOT_REGISTRY).length, 'registered bots');

export { BOT_REGISTRY, botPool, botCommandExecutor };
