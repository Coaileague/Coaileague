/**
 * HEBBIAN LEARNING SERVICE
 * ========================
 * "Neurons that fire together, wire together."
 *
 * Implements Hebbian learning on top of the knowledge_relationships graph.
 * When two concepts co-activate (appear together in successful decisions or
 * semantic queries), the edge between them is strengthened. When connections
 * go unused over time, a forgetting-curve decay weakens them — exactly as the
 * human connectome prunes under-used synaptic pathways.
 *
 * Strength range: 0.0 (dormant) → 1.0 (essential pathway)
 * Learning rate:  +0.05 per co-activation
 * Decay rate:     −0.01 per 30-day period of inactivity (applied nightly)
 * Floor:          0.05  (connections never fully disappear; trace memory)
 * Ceiling:        0.98  (no absolute certainty)
 */

import { db } from '../../db';
import { knowledgeRelationships } from '@shared/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { typedCount, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('hebbianLearningService');

const LEARNING_RATE   = 0.05;
const DECAY_AMOUNT    = 0.01;   // per 30-day idle period
const STRENGTH_FLOOR  = 0.05;
const STRENGTH_CEILING = 0.98;
const DECAY_IDLE_DAYS = 30;

// In-process LRU-style activation queue (max 2 000 entries)
// Prevents DB thrash when the same edge fires many times per second
const pendingStrengthenings = new Map<string, { delta: number; lastSeen: number }>();
const FLUSH_INTERVAL_MS = 15_000; // flush to DB every 15 s

function edgeKey(sourceId: string, targetId: string) {
  return `${sourceId}::${targetId}`;
}

// ============================================================================
// CORE ACTIVATION
// ============================================================================

/**
 * Record that two knowledge entities co-activated.
 * Queued and flushed to DB in batches to avoid write storms.
 */
export function activateEdge(sourceId: string, targetId: string, delta = LEARNING_RATE): void {
  if (!sourceId || !targetId || sourceId === targetId) return;

  // Canonical ordering so (A→B) and (B→A) are the same bucket
  const key = edgeKey(sourceId, targetId);
  const existing = pendingStrengthenings.get(key) || { delta: 0, lastSeen: Date.now() };
  pendingStrengthenings.set(key, {
    delta: Math.min(existing.delta + delta, STRENGTH_CEILING - STRENGTH_FLOOR),
    lastSeen: Date.now(),
  });

  // Cap queue size
  if (pendingStrengthenings.size > 2000) {
    const oldest = Array.from(pendingStrengthenings.entries())
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      .slice(0, 200);
    for (const [k] of oldest) pendingStrengthenings.delete(k);
  }
}

/**
 * Strengthen all pairwise edges among a set of co-activated entity IDs.
 * Call this when an RL experience succeeds and you know which entities
 * were involved in the decision pathway.
 */
export function strengthenPath(entityIds: string[], delta = LEARNING_RATE): void {
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      activateEdge(entityIds[i], entityIds[j], delta);
    }
  }
}

/**
 * Weaken all pairwise edges among entities involved in a failed outcome.
 * Uses a smaller negative delta so failure learning is slower than success.
 */
export function weakenPath(entityIds: string[], delta = LEARNING_RATE * 0.5): void {
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      activateEdge(entityIds[i], entityIds[j], -delta);
    }
  }
}

// ============================================================================
// FLUSH TO DB
// ============================================================================

async function flushPendingActivations(): Promise<void> {
  if (pendingStrengthenings.size === 0) return;

  const batch = Array.from(pendingStrengthenings.entries());
  pendingStrengthenings.clear();

  let flushed = 0;
  for (const [key, { delta }] of batch) {
    const [sourceId, targetId] = key.split('::');
    try {
      await db.update(knowledgeRelationships).set({
        strength: sql`LEAST(${STRENGTH_CEILING}, GREATEST(${STRENGTH_FLOOR}, ${knowledgeRelationships.strength} + ${delta}))`,
        updatedAt: new Date(),
      }).where(and(eq(knowledgeRelationships.sourceId, sourceId), eq(knowledgeRelationships.targetId, targetId)));
      flushed++;
    } catch {
      // non-fatal — next flush will pick it up
    }
  }

  if (flushed > 0) {
    log.info(`[Hebbian] Flushed ${flushed} edge strength updates`);
  }
}

// ============================================================================
// NIGHTLY DECAY (forgetting curve)
// ============================================================================

/**
 * Apply forgetting-curve decay to all relationships that have not been
 * activated within the last DECAY_IDLE_DAYS days.
 * Relationships whose strength drops to the floor are left alive — trace memory.
 */
export async function runDecayCycle(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - DECAY_IDLE_DAYS * 24 * 60 * 60 * 1000);
    const result = await db.update(knowledgeRelationships).set({
      strength: sql`GREATEST(${STRENGTH_FLOOR}, ${knowledgeRelationships.strength} - ${DECAY_AMOUNT})`,
      updatedAt: new Date(),
    }).where(and(
      sql`(${knowledgeRelationships.updatedAt} IS NULL OR ${knowledgeRelationships.updatedAt} < ${cutoff})`,
      sql`${knowledgeRelationships.strength} > ${STRENGTH_FLOOR}`
    ));
    const affected = (result as any).rowCount ?? 0;
    log.info(`[Hebbian] Decay cycle complete — ${affected} edges weakened`);
    return affected;
  } catch (err: any) {
    log.warn('[Hebbian] Decay cycle failed (non-fatal):', (err instanceof Error ? err.message : String(err)));
    return 0;
  }
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Return the N strongest incoming + outgoing edges for an entity.
 */
export async function getStrongestEdges(
  entityId: string,
  limit = 10
): Promise<Array<{ sourceId: string; targetId: string; type: string; strength: number }>> {
  try {
    // CATEGORY C — Raw SQL retained: ORDER  BY | Tables: knowledge_relationships | Verified: 2026-03-23
    const rows = await typedQuery(sql`
      SELECT source_id, target_id, type, strength
      FROM   knowledge_relationships
      WHERE  source_id = ${entityId} OR target_id = ${entityId}
      ORDER  BY strength DESC
      LIMIT  ${limit}
    `);
    return (rows as any[]).map((r: any) => ({
      sourceId: r.source_id,
      targetId: r.target_id,
      type: r.type,
      strength: parseFloat(r.strength),
    }));
  } catch {
    return [];
  }
}

/**
 * Return a brief connectome health summary.
 */
export async function getConnectomeStats(): Promise<{
  totalEdges: number;
  avgStrength: number;
  strongEdges: number;
  dormantEdges: number;
}> {
  try {
    // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: knowledge_relationships | Verified: 2026-03-23
    const rowResult = await typedQuery(sql`
      SELECT
        COUNT(*)                                               AS total,
        ROUND(AVG(strength)::numeric, 3)                      AS avg_strength,
        COUNT(*) FILTER (WHERE strength > 0.7)                AS strong_edges,
        COUNT(*) FILTER (WHERE strength <= ${STRENGTH_FLOOR}) AS dormant_edges
      FROM knowledge_relationships
    `);
    const r = (rowResult as any[])[0] || {};
    return {
      totalEdges:   parseInt(r.total || '0'),
      avgStrength:  parseFloat(r.avg_strength || '0.5'),
      strongEdges:  parseInt(r.strong_edges || '0'),
      dormantEdges: parseInt(r.dormant_edges || '0'),
    };
  } catch {
    return { totalEdges: 0, avgStrength: 0.5, strongEdges: 0, dormantEdges: 0 };
  }
}

// ============================================================================
// AUTO-FLUSH TIMER
// ============================================================================

setInterval(() => {
  flushPendingActivations().catch((err: any) =>
    log.warn('[Hebbian] Flush error (non-fatal):', (err instanceof Error ? err.message : String(err)))
  );
}, FLUSH_INTERVAL_MS);

log.info('[Hebbian] Hebbian Learning Service initialized — flush every 15 s, decay daily');
