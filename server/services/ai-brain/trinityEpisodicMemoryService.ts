/**
 * TRINITY EPISODIC MEMORY SERVICE
 * =================================
 * Trinity remembers past conversations and injects relevant memories into
 * her context window before responding. This closes the cross-session amnesia gap.
 *
 * Biological analog: The hippocampus encodes episodic memories (specific events)
 * and retrieves relevant ones when a familiar context is encountered. We simulate
 * this with: compress → store → retrieve-by-relevance → inject into prompt.
 *
 * The key constraint: LLM calls are stateless. We compensate by building a
 * "notebook" that Trinity reads before every interaction.
 *
 * Flow:
 *   1. After conversation ends → compress to summary → store in trinityEpisodicMemory
 *   2. Before new message → search for relevant past memories → prepend to context
 *   3. Nightly: compress old Level-0 entries to Level-1 (shorter but preserved)
 */

import { db } from '../../db';
import { trinityEpisodicMemory, trinityWorkingMemory, trinityDeliberationLog } from '@shared/schema';
import { eq, and, desc, gte, lt, sql } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
import { createHash } from 'crypto';

const log = createLogger('TrinityEpisodicMemory');

const MAX_CONTEXT_MEMORIES = 5;       // Max memories injected per prompt
const MAX_SUMMARY_TOKENS = 200;       // Approx tokens per memory (chars / 4)
const WORKING_MEMORY_TTL_HOURS = 24;

// ── Working memory ────────────────────────────────────────────────────────────

export async function appendWorkingMemory(opts: {
  workspaceId: string;
  eventType: string;
  eventSummary: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  emotionalContext?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + WORKING_MEMORY_TTL_HOURS * 3600 * 1000);
    await db.insert(trinityWorkingMemory).values({
      workspaceId: opts.workspaceId,
      eventType: opts.eventType,
      eventSummary: opts.eventSummary.slice(0, 500),
      entityType: opts.entityType,
      entityId: opts.entityId,
      entityName: opts.entityName,
      emotionalContext: opts.emotionalContext,
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      expiresAt,
    });
  } catch (err: unknown) {
    log.warn('[WorkingMemory] Append failed (non-fatal):', err?.message);
  }
}

export async function getTodayWorkingMemory(workspaceId: string): Promise<string> {
  try {
    const cutoff = new Date(Date.now() - WORKING_MEMORY_TTL_HOURS * 3600 * 1000);
    const entries = await db.select()
      .from(trinityWorkingMemory)
      .where(and(
        eq(trinityWorkingMemory.workspaceId, workspaceId),
        gte(trinityWorkingMemory.happenedAt, cutoff)
      ))
      .orderBy(desc(trinityWorkingMemory.happenedAt))
      .limit(20);

    if (!entries.length) return '';

    const lines = entries.map(e =>
      `[${e.happenedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}] ${e.eventType}: ${e.eventSummary}${e.entityName ? ` (${e.entityName})` : ''}${e.emotionalContext ? ` — emotional: ${e.emotionalContext}` : ''}`
    );

    return `TODAY'S OPERATIONAL LOG (last ${entries.length} events):\n${lines.join('\n')}`;
  } catch (err: unknown) {
    log.warn('[WorkingMemory] Read failed (non-fatal):', err?.message);
    return '';
  }
}

// ── Episodic memory store ─────────────────────────────────────────────────────

export async function storeEpisodicMemory(opts: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  summary: string;
  keyFacts?: string[];
  emotionalTone?: string;
  topicsDiscussed?: string[];
  actionsTaken?: string[];
  importanceScore?: number;
  conversationId?: string;
}): Promise<void> {
  try {
    // Compress summary to token budget
    const summary = opts.summary.slice(0, MAX_SUMMARY_TOKENS * 4);

    await db.insert(trinityEpisodicMemory).values({
      workspaceId: opts.workspaceId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      summary,
      keyFacts: opts.keyFacts ? JSON.stringify(opts.keyFacts) : null,
      emotionalTone: opts.emotionalTone,
      topicsDiscussed: opts.topicsDiscussed ? JSON.stringify(opts.topicsDiscussed) : null,
      actionsTaken: opts.actionsTaken ? JSON.stringify(opts.actionsTaken) : null,
      importanceScore: String(opts.importanceScore ?? 0.5),
      episodeDate: new Date(),
      conversationId: opts.conversationId,
    });

    log.info(`[EpisodicMemory] Stored for ${opts.entityType}:${opts.entityId} in ws:${opts.workspaceId}`);
  } catch (err: unknown) {
    log.warn('[EpisodicMemory] Store failed (non-fatal):', err?.message);
  }
}

// ── Memory retrieval for prompt injection ────────────────────────────────────

export async function getRelevantMemories(opts: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  topic?: string;
  limit?: number;
}): Promise<string> {
  try {
    const limit = opts.limit ?? MAX_CONTEXT_MEMORIES;

    // Retrieve recent memories for this entity, ordered by importance then recency
    const memories = await db.select()
      .from(trinityEpisodicMemory)
      .where(and(
        eq(trinityEpisodicMemory.workspaceId, opts.workspaceId),
        eq(trinityEpisodicMemory.entityType, opts.entityType),
        eq(trinityEpisodicMemory.entityId, opts.entityId),
      ))
      .orderBy(desc(trinityEpisodicMemory.importanceScore), desc(trinityEpisodicMemory.episodeDate))
      .limit(limit);

    if (!memories.length) return '';

    const formatted = memories.map(m => {
      const date = m.episodeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const facts = m.keyFacts ? ` Key facts: ${JSON.parse(m.keyFacts).join('; ')}.` : '';
      const tone = m.emotionalTone ? ` Emotional tone: ${m.emotionalTone}.` : '';
      return `[${date}] ${m.summary}${facts}${tone}`;
    });

    return `MEMORY OF PAST INTERACTIONS (most relevant):\n${formatted.join('\n')}`;
  } catch (err: unknown) {
    log.warn('[EpisodicMemory] Retrieval failed (non-fatal):', err?.message);
    return '';
  }
}

// ── Context builder — assembles full memory context for Trinity ───────────────

export async function buildTrinityMemoryContext(opts: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  includeWorkingMemory?: boolean;
}): Promise<string> {
  const parts: string[] = [];

  try {
    // Working memory (today's operational log)
    if (opts.includeWorkingMemory !== false) {
      const working = await getTodayWorkingMemory(opts.workspaceId);
      if (working) parts.push(working);
    }

    // Episodic memories (past conversations with this person)
    const episodic = await getRelevantMemories({
      workspaceId: opts.workspaceId,
      entityType: opts.entityType,
      entityId: opts.entityId,
    });
    if (episodic) parts.push(episodic);

    return parts.join('\n\n');
  } catch (err: unknown) {
    log.warn('[MemoryContext] Build failed (non-fatal):', err?.message);
    return '';
  }
}

// ── Deliberation log ──────────────────────────────────────────────────────────

export async function recordDeliberation(opts: {
  workspaceId: string;
  actionType: string;
  actionDescription: string;
  whatIKnow: string;
  myOptions: string;
  myDecision: string;
  confidenceScore?: number;
  actionId?: string;
}): Promise<string> {
  try {
    const [record] = await db.insert(trinityDeliberationLog).values({
      workspaceId: opts.workspaceId,
      actionType: opts.actionType,
      actionDescription: opts.actionDescription.slice(0, 500),
      whatIKnow: opts.whatIKnow.slice(0, 2000),
      myOptions: opts.myOptions.slice(0, 2000),
      myDecision: opts.myDecision.slice(0, 2000),
      confidenceScore: opts.confidenceScore ? String(opts.confidenceScore) : null,
      actionId: opts.actionId,
    }).returning({ id: trinityDeliberationLog.id });

    return record.id;
  } catch (err: unknown) {
    log.warn('[Deliberation] Log failed (non-fatal):', err?.message);
    return '';
  }
}

// ── Nightly memory compression ────────────────────────────────────────────────
// Called by the overnight job — compresses Level-0 entries older than 7 days

export async function compressOldMemories(workspaceId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const old = await db.select()
      .from(trinityEpisodicMemory)
      .where(and(
        eq(trinityEpisodicMemory.workspaceId, workspaceId),
        eq(trinityEpisodicMemory.compressionLevel, 0),
        lt(trinityEpisodicMemory.episodeDate, cutoff)
      ))
      .limit(50);

    for (const entry of old) {
      // Compress: keep first 100 chars of summary + key facts only
      const compressed = entry.summary.slice(0, 100) + (entry.keyFacts ? ` [facts: ${JSON.parse(entry.keyFacts).slice(0, 3).join(', ')}]` : '');
      await db.update(trinityEpisodicMemory)
        .set({ summary: compressed, compressionLevel: 1, updatedAt: new Date() })
        .where(eq(trinityEpisodicMemory.id, entry.id));
    }

    // Purge Level-1 entries older than 90 days (only after they're compressed)
    const purgeCutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    await db.delete(trinityEpisodicMemory)
      .where(and(
        eq(trinityEpisodicMemory.workspaceId, workspaceId),
        eq(trinityEpisodicMemory.compressionLevel, 2),
        lt(trinityEpisodicMemory.episodeDate, purgeCutoff)
      ));

    // Expire working memory
    await db.delete(trinityWorkingMemory)
      .where(and(
        eq(trinityWorkingMemory.workspaceId, workspaceId),
        lt(trinityWorkingMemory.expiresAt, new Date())
      ));

    log.info(`[MemoryCompressor] Compressed ${old.length} memories for ws:${workspaceId}`);
  } catch (err: unknown) {
    log.warn('[MemoryCompressor] Compression failed (non-fatal):', err?.message);
  }
}
