/**
 * TRINITY CONNECTOME SERVICE
 * ==========================
 * The architectural backbone that maps every Trinity subsystem to a formal
 * brain region, wires those regions through a Global Workspace broadcast bus,
 * and surfaces Trinity's live Self-Model so it can inject self-awareness into
 * every chat response.
 *
 * BRAIN REGION → SERVICE MAPPING
 * ─────────────────────────────────────────────────────────────────────────
 * PREFRONTAL_CORTEX   metaCognitionService          reasoning, inhibition
 * HIPPOCAMPUS         sharedKnowledgeGraph          long-term memory
 *                     + trinityMemoryService
 * AMYGDALA            trinityOrgContextBuilder      urgency / threat priority
 *                     + platformEventBus alerts
 * WERNICKE_BROCA      trinityPersona + LLM layer    language production
 * CEREBELLUM          ReportBot, ClockBot,          habit/pattern execution
 *                     MeetingBot, HelpAI
 * BASAL_GANGLIA       reinforcementLearningLoop     reward gating
 * GLOBAL_WORKSPACE    aiBrainMasterOrchestrator     broadcast synthesis
 *
 * GLOBAL WORKSPACE THEORY (GWT)
 * When a brain region completes a significant computation it broadcasts its
 * output to the Global Workspace.  All other regions receive the broadcast
 * and can update their state accordingly — exactly as Baars' GWT model.
 *
 * SELF-MODEL
 * Before every Trinity chat response, buildSelfModelBlock() queries the
 * trinity_self_awareness table and returns a compact narrative that is
 * appended to the system prompt — giving Trinity a dynamic sense of its own
 * current knowledge, capabilities, and confidence levels.
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { getConnectomeStats } from './hebbianLearningService';
import { typedQuery } from '../../lib/typedSql';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityConnectomeService');

// ============================================================================
// BRAIN REGION REGISTRY
// ============================================================================

export type BrainRegion =
  | 'PREFRONTAL_CORTEX'
  | 'HIPPOCAMPUS'
  | 'AMYGDALA'
  | 'WERNICKE_BROCA'
  | 'CEREBELLUM'
  | 'BASAL_GANGLIA'
  | 'GLOBAL_WORKSPACE';

export interface BrainRegionDescriptor {
  region: BrainRegion;
  services: string[];
  role: string;
  description: string;
  activationLevel: number;   // 0.0 – 1.0, updated at runtime
  lastFiredAt?: Date;
}

const BRAIN_REGION_MAP: Map<BrainRegion, BrainRegionDescriptor> = new Map([
  ['PREFRONTAL_CORTEX', {
    region: 'PREFRONTAL_CORTEX',
    services: ['metaCognitionService', 'trinityConfidenceTracker'],
    role: 'Executive Reasoning & Decision Arbitration',
    description: 'Runs the Tri-AI Orchestration (Gemini + Claude + GPT). Synthesises conflicting model outputs, enforces confidence thresholds, and escalates to human review when confidence < 0.6.',
    activationLevel: 0.0,
  }],
  ['HIPPOCAMPUS', {
    region: 'HIPPOCAMPUS',
    services: ['sharedKnowledgeGraph', 'trinityMemoryService', 'trinityContextManager'],
    role: 'Long-Term Memory & Episodic Recall',
    description: 'Persists and retrieves knowledge entities/relationships (connectome). Builds user memory profiles and surfaces historical patterns through semantic graph queries.',
    activationLevel: 0.0,
  }],
  ['AMYGDALA', {
    region: 'AMYGDALA',
    services: ['trinityOrgContextBuilder', 'trinityAnomalyDetector', 'trinityAutonomousNotifier'],
    role: 'Urgency Detection & Threat Prioritisation',
    description: 'Evaluates incoming platform events for urgency signals (missed punches, SLA breaches, security incidents). Routes high-priority signals to the top of the Global Workspace queue.',
    activationLevel: 0.0,
  }],
  ['WERNICKE_BROCA', {
    region: 'WERNICKE_BROCA',
    services: ['trinityPersona', 'trinityChatService', 'trinityContentGuardrails'],
    role: 'Language Comprehension & Production',
    description: 'Composes and validates Trinity\'s final natural-language responses. Applies persona rules, content guardrails, and tone calibration. Receives the Global Workspace broadcast and serialises it into human-readable text.',
    activationLevel: 0.0,
  }],
  ['CEREBELLUM', {
    region: 'CEREBELLUM',
    services: ['ReportBot', 'ClockBot', 'MeetingBot', 'HelpAI', 'shiftChatroomBotProcessor'],
    role: 'Habit-Based Pattern Execution',
    description: 'Executes practiced, domain-specific workflows without conscious deliberation: incident reports, DAR generation, clock-in/out verification, scheduling. Outputs are broadcast to HIPPOCAMPUS for memory consolidation.',
    activationLevel: 0.0,
  }],
  ['BASAL_GANGLIA', {
    region: 'BASAL_GANGLIA',
    services: ['reinforcementLearningLoop', 'trinityActionReasoner'],
    role: 'Reward Gating & Strategy Adaptation',
    description: 'Records every action-outcome pair. Positive outcomes (+1.0 reward) trigger Hebbian strengthening on the decision pathway. Negative outcomes (−0.5 penalty) weaken those edges. Proposes StrategyAdaptations when success rate < 50%.',
    activationLevel: 0.0,
  }],
  ['GLOBAL_WORKSPACE', {
    region: 'GLOBAL_WORKSPACE',
    services: ['aiBrainMasterOrchestrator', 'trinityOrchestrationGateway'],
    role: 'Broadcast Synthesis & Cross-Region Integration',
    description: 'The central broadcast bus. When any brain region completes a significant computation, it publishes to the Global Workspace. All other regions subscribe and update their activation levels. The Master Orchestrator is the concrete implementation.',
    activationLevel: 0.0,
  }],
]);

// ============================================================================
// GLOBAL WORKSPACE BROADCAST
// ============================================================================

interface GlobalWorkspaceMessage {
  fromRegion: BrainRegion;
  eventType: string;
  payload: Record<string, any>;
  workspaceId?: string;
  confidence: number;
  timestamp: Date;
}

/**
 * A brain region calls this when it has completed a significant computation.
 * All other regions receive the broadcast via platformEventBus.
 * The GLOBAL_WORKSPACE region's activation is updated to reflect the activity.
 */
export function broadcastToGlobalWorkspace(
  fromRegion: BrainRegion,
  eventType: string,
  payload: Record<string, any>,
  workspaceId?: string,
  confidence = 0.8
): void {
  // Update activation of the originating region
  const descriptor = BRAIN_REGION_MAP.get(fromRegion);
  if (descriptor) {
    descriptor.activationLevel = Math.min(1.0, descriptor.activationLevel + 0.1);
    descriptor.lastFiredAt = new Date();
    BRAIN_REGION_MAP.set(fromRegion, descriptor);
  }

  // Update Global Workspace activation
  const gw = BRAIN_REGION_MAP.get('GLOBAL_WORKSPACE')!;
  gw.activationLevel = Math.min(1.0, gw.activationLevel + 0.05);
  gw.lastFiredAt = new Date();
  BRAIN_REGION_MAP.set('GLOBAL_WORKSPACE', gw);

  const message: GlobalWorkspaceMessage = {
    fromRegion,
    eventType,
    payload,
    workspaceId,
    confidence,
    timestamp: new Date(),
  };

  // Propagate via lightweight internal event bus so all subscribed brain regions
  // receive the broadcast synchronously without DB persistence or notification overhead.
  // Use platformEventBus.emit() (not publish()) — these are service-to-service
  // internal signals, NOT user-facing platform events.
  platformEventBus.emit(`brain.${fromRegion.toLowerCase()}.${eventType}`, message);
  // Also emit on the wildcard channel so any subscriber watching all brain events can react
  platformEventBus.emit('brain.global_workspace', message);

  if (process.env.NODE_ENV !== 'production') {
    log.info(`[Global Workspace] ${fromRegion} → ${eventType} (confidence: ${confidence.toFixed(2)})`);
  }
}

/**
 * Called by CEREBELLUM (bots) after completing a domain workflow.
 * Publishes the result to the connectome so HIPPOCAMPUS can consolidate it.
 */
export function cerebellumBroadcast(
  botName: string,
  action: string,
  result: Record<string, any>,
  workspaceId?: string
): void {
  broadcastToGlobalWorkspace(
    'CEREBELLUM',
    `${botName}.${action}.completed`,
    { botName, action, result },
    workspaceId,
    0.9
  );
}

// ============================================================================
// SELF-MODEL: Query trinity_self_awareness before every chat response
// ============================================================================

const SELF_MODEL_CACHE: Map<string, { block: string; builtAt: number }> = new Map();
const SELF_MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Query the trinity_self_awareness table and build a compact self-model
 * narrative for injection into Trinity's system prompt.
 *
 * This gives Trinity a dynamic sense of:
 * - What domains she's most/least confident in (from confidence scores)
 * - Current known organisational facts (from fact_value entries)
 * - Her own capabilities and current state
 */
export async function buildSelfModelBlock(workspaceId: string): Promise<string> {
  const cacheKey = workspaceId;
  const cached = SELF_MODEL_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.builtAt < SELF_MODEL_CACHE_TTL) {
    return cached.block;
  }

  try {
    // CATEGORY C — Raw SQL retained: ORDER  BY | Tables: trinity_self_awareness | Verified: 2026-03-23
    const rows = await typedQuery(sql`
      SELECT category, subcategory, fact_key, fact_value, confidence, fact_type
      FROM   trinity_self_awareness
      WHERE  workspace_id = ${workspaceId}
        AND  is_active = true
      ORDER  BY
        CASE category
          WHEN 'CAPABILITIES'    THEN 1
          WHEN 'CONFIDENCE'      THEN 2
          WHEN 'KNOWLEDGE_STATE' THEN 3
          WHEN 'LIMITATIONS'     THEN 4
          ELSE 5
        END,
        (confidence::numeric) DESC
      LIMIT 60
    `);

    const facts: Array<{
      category: string;
      subcategory: string;
      fact_key: string;
      fact_value: string;
      confidence: string;
      fact_type: string;
    }> = (rows as any[]) || [];

    if (facts.length === 0) {
      const block = '';
      SELF_MODEL_CACHE.set(cacheKey, { block, builtAt: Date.now() });
      return block;
    }

    // Group by category
    const byCategory = new Map<string, typeof facts>();
    for (const f of facts) {
      const cat = f.category || 'GENERAL';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(f);
    }

    const lines: string[] = [
      '=== TRINITY SELF-MODEL (live from self-awareness layer) ===',
      'These are facts Trinity currently holds about herself and this workspace.',
      'Use them to calibrate your confidence, surface relevant capabilities, and avoid claiming knowledge you do not have.',
    ];

    for (const [cat, entries] of byCategory.entries()) {
      lines.push(`\n[${cat.replace(/_/g, ' ')}]`);
      for (const e of entries.slice(0, 12)) {
        const conf = e.confidence ? ` (confidence: ${parseFloat(e.confidence).toFixed(2)})` : '';
        lines.push(`• ${e.fact_key}: ${e.fact_value}${conf}`);
      }
    }

    // Add connectome health
    try {
      const stats = await getConnectomeStats();
      lines.push('\n[CONNECTOME HEALTH]');
      lines.push(`• Total knowledge edges: ${stats.totalEdges}`);
      lines.push(`• Average connection strength: ${stats.avgStrength.toFixed(3)}`);
      lines.push(`• Strong pathways (>0.7): ${stats.strongEdges}`);
    } catch { /* non-fatal */ }

    lines.push('=== END SELF-MODEL ===');

    const block = lines.join('\n');
    SELF_MODEL_CACHE.set(cacheKey, { block, builtAt: Date.now() });
    return block;
  } catch (err: any) {
    log.warn('[Connectome] Self-model build failed (non-fatal):', (err instanceof Error ? err.message : String(err)));
    return '';
  }
}

/**
 * Invalidate the self-model cache for a workspace.
 * Call this when trinity_self_awareness records change.
 */
export function invalidateSelfModelCache(workspaceId: string): void {
  SELF_MODEL_CACHE.delete(workspaceId);
}

// ============================================================================
// BRAIN STATE SNAPSHOT
// ============================================================================

export interface BrainStateSnapshot {
  timestamp: Date;
  regions: BrainRegionDescriptor[];
  dominantRegion: BrainRegion | null;
  globalActivation: number;
  connectome: {
    totalEdges: number;
    avgStrength: number;
    strongEdges: number;
    dormantEdges: number;
  };
}

/**
 * Return a snapshot of all brain region activation levels.
 * Useful for diagnostics and admin dashboards.
 */
export async function getBrainStateSnapshot(): Promise<BrainStateSnapshot> {
  const regions = Array.from(BRAIN_REGION_MAP.values());
  const dominantRegion = regions.reduce(
    (max, r) => (r.activationLevel > (max?.activationLevel || 0) ? r : max),
    null as BrainRegionDescriptor | null
  );

  const connectome = await getConnectomeStats().catch(() => ({
    totalEdges: 0, avgStrength: 0.5, strongEdges: 0, dormantEdges: 0,
  }));

  const globalActivation = regions.reduce((sum, r) => sum + r.activationLevel, 0) / regions.length;

  return {
    timestamp: new Date(),
    regions,
    dominantRegion: dominantRegion?.region || null,
    globalActivation,
    connectome,
  };
}

/**
 * Get the descriptor for a specific brain region.
 */
export function getBrainRegion(region: BrainRegion): BrainRegionDescriptor | undefined {
  return BRAIN_REGION_MAP.get(region);
}

/**
 * Get all brain region descriptors.
 */
export function getAllBrainRegions(): BrainRegionDescriptor[] {
  return Array.from(BRAIN_REGION_MAP.values());
}

// ============================================================================
// ACTIVATION DECAY (gradual cooldown when regions stop firing)
// ============================================================================

setInterval(() => {
  for (const [region, descriptor] of BRAIN_REGION_MAP.entries()) {
    if (descriptor.activationLevel > 0) {
      descriptor.activationLevel = Math.max(0, descriptor.activationLevel - 0.02);
      BRAIN_REGION_MAP.set(region, descriptor);
    }
  }
}, 10_000); // cool down 0.02/10s when idle

log.info('[Connectome] Trinity Connectome Service initialized — brain region registry active');
