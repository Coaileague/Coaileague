/**
 * unifiedGeminiClient — canonical re-export adapter for all Gemini usage.
 *
 * Any code doing `import { unifiedGeminiClient } from './unifiedGeminiClient'`
 * receives the single platform-wide UnifiedGeminiClient instance (geminiClient)
 * from providers/geminiClient.ts, which already has metered billing, RBAC,
 * anti-yap, and thinking-level controls built in.
 *
 * ModelTier maps human-readable names to the GEMINI_MODELS keys so callers
 * can select tiers without hard-coding model strings.
 */

import { geminiClient } from './providers/geminiClient';

import { createLogger } from '../../lib/logger';
const log = createLogger('unifiedGeminiClient');

export { geminiClient as unifiedGeminiClient };

export const ModelTier = {
  FLASH:        'SIMPLE',         // gemini-2.0-flash       — fast / low-cost
  FLASH_CONV:   'CONVERSATIONAL', // gemini-2.5-flash       — balanced speed+quality
  PRO:          'COMPLIANCE',     // gemini-2.5-pro         — deep reasoning
  BRAIN:        'BRAIN',          // gemini-3-pro-preview   — master intelligence
  ORCHESTRATOR: 'ORCHESTRATOR',   // gemini-3-pro-preview   — orchestration tasks
} as const;

export type ModelTierKey = keyof typeof ModelTier;
