/**
 * TRINITY AGENT HEALTH MONITOR
 * ==============================
 * Tracks the availability of all three Trinity agents (GPT, Gemini, Claude)
 * and exposes the current degradation level so the triad orchestrator can
 * route intelligently when one or more providers are down.
 *
 * Degradation levels:
 *   FULL    → all 3 agents healthy (GPT + Gemini + Claude)
 *   REDUCED → 2 agents available (automatic rerouting, no user impact)
 *   MINIMAL → 1 agent available (flagged internally, still functional)
 *   DOWN    → 0 agents available (emergency fallback response only)
 *
 * Health is inferred from modelRouter's cooldown state — no extra API calls.
 */

import { modelRouter, type ModelName } from './providers/modelRouter';
import { createLogger } from '../../lib/logger';

const log = createLogger('AgentHealthMonitor');

export type DegradationLevel = 'FULL' | 'REDUCED' | 'MINIMAL' | 'DOWN';

export interface AgentAvailability {
  gpt: boolean;       // any OpenAI model available
  gemini: boolean;    // any Google model available
  claude: boolean;    // any Anthropic model available
}

export interface TriadHealth {
  level: DegradationLevel;
  agents: AgentAvailability;
  availableCount: number;
  downAgents: string[];
  checkedAt: Date;
}

// Which models belong to which agent
const GPT_MODELS: ModelName[] = ['gpt4o', 'gpt4o_mini'];
const GEMINI_MODELS: ModelName[] = ['gemini_pro', 'gemini_flash'];
const CLAUDE_MODELS: ModelName[] = ['claude_sonnet', 'claude_haiku'];

const CHECK_INTERVAL_MS = 30_000;
let lastHealth: TriadHealth | null = null;
let monitorInterval: NodeJS.Timeout | null = null;

function hasApiKey(models: ModelName[]): boolean {
  const status = modelRouter.getModelStatus();
  const envMap: Record<ModelName, string> = {
    gpt4o: 'OPENAI_API_KEY',
    gpt4o_mini: 'OPENAI_API_KEY',
    gemini_pro: 'GEMINI_API_KEY',
    gemini_flash: 'GEMINI_API_KEY',
    claude_sonnet: 'ANTHROPIC_API_KEY',
    claude_haiku: 'ANTHROPIC_API_KEY',
  };
  return models.some(m => {
    const key = envMap[m];
    return Boolean(process.env[key]);
  });
}

function isModelGroupAvailable(models: ModelName[]): boolean {
  if (!hasApiKey(models)) return false;
  const status = modelRouter.getModelStatus();
  // Available if at least one model in the group is NOT in cooldown
  return models.some(m => {
    const s = status[m];
    return s && s.cooldownUntil === null;
  });
}

function computeHealth(): TriadHealth {
  const gpt = isModelGroupAvailable(GPT_MODELS);
  const gemini = isModelGroupAvailable(GEMINI_MODELS);
  const claude = isModelGroupAvailable(CLAUDE_MODELS);

  const agents: AgentAvailability = { gpt, gemini, claude };
  const availableCount = [gpt, gemini, claude].filter(Boolean).length;
  const downAgents = [
    !gpt && 'GPT (OpenAI)',
    !gemini && 'Gemini (Google)',
    !claude && 'Claude (Anthropic)',
  ].filter(Boolean) as string[];

  let level: DegradationLevel;
  if (availableCount === 3) level = 'FULL';
  else if (availableCount === 2) level = 'REDUCED';
  else if (availableCount === 1) level = 'MINIMAL';
  else level = 'DOWN';

  if (level !== 'FULL') {
    log.warn(`[AgentHealthMonitor] Degradation=${level} — down: ${downAgents.join(', ') || 'none'}`);
  }

  return { level, agents, availableCount, downAgents, checkedAt: new Date() };
}

export function getTriadHealth(): TriadHealth {
  if (!lastHealth || Date.now() - lastHealth.checkedAt.getTime() > CHECK_INTERVAL_MS) {
    lastHealth = computeHealth();
  }
  return lastHealth;
}

export function forceHealthRefresh(): TriadHealth {
  lastHealth = computeHealth();
  return lastHealth;
}

/**
 * Determine which agents to run given current health + complexity.
 * Returns an ordered list of agents to invoke for this turn.
 */
export function selectActiveAgents(
  health: TriadHealth,
  requiresReasoner: boolean,
  requiresJudge: boolean,
): Array<'gpt' | 'gemini' | 'claude'> {
  const { agents } = health;

  if (health.level === 'DOWN') return [];

  // Build the ideal triad based on complexity, then filter by availability
  const ideal: Array<'gpt' | 'gemini' | 'claude'> = [
    'gpt',                                    // always the workhorse
    ...(requiresReasoner ? ['gemini' as const] : []),
    ...(requiresJudge ? ['claude' as const] : []),
  ];

  const active = ideal.filter(a => agents[a]);

  // If we lost the workhorse but others are up, pick the best available as primary
  if (!agents.gpt && active.length === 0) {
    if (agents.gemini) active.push('gemini');
    else if (agents.claude) active.push('claude');
  }

  return active;
}

export function startHealthMonitor(): void {
  if (monitorInterval) return;
  lastHealth = computeHealth();
  monitorInterval = setInterval(() => {
    lastHealth = computeHealth();
  }, CHECK_INTERVAL_MS);
  log.info('[AgentHealthMonitor] Started. Initial state:', lastHealth?.level);
}

export function stopHealthMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

// Auto-start on module load
startHealthMonitor();
