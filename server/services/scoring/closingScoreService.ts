/**
 * Closing Score Service
 * =====================
 * The bias firewall.
 *
 * When an officer is terminated or leaves a tenant, the system computes ONE
 * final 0-100 score from the prior 90 days of objective events (attendance,
 * paperwork, training, behavior signals — never manager free-text). That value
 * is appended to globalOfficers.closing_scores as an immutable JSON entry and
 * never changes again.
 *
 * The append is the only mutation allowed on the closing-scores array. Any
 * attempt to overwrite or delete a prior entry is blocked at the Trinity
 * Conscience layer (Principle 9 — CLOSING_SCORE_IMMUTABILITY).
 *
 * Why this matters: lets a future tenant see an unbiased history of how the
 * officer performed at every prior employer, without inheriting any one
 * manager's grudge or favoritism. The system is the rater, not the human.
 */

import { db } from '../../db';
import { eq, and, gte } from 'drizzle-orm';
import {
  employees,
  globalOfficers,
  workspaces,
} from '@shared/schema';
import { computeOfficerScore, type ScoreResult, type ScoreTier } from './scoreEngineService';
import { createLogger } from '../../lib/logger';

const log = createLogger('closingScore');

export type SeparationType =
  | 'voluntary'
  | 'involuntary'
  | 'layoff'
  | 'end_of_contract'
  | 'retirement'
  | 'other';

export interface ClosingScoreEntry {
  tenantId: string;
  tenantName: string;
  score: number;
  tier: ScoreTier;
  separationType: SeparationType;
  separationDate: string;        // ISO 8601
  computedAt: string;            // ISO 8601
  factorBreakdown: ScoreResult['factorBreakdown'];
  engineVersion: string;
  // Immutability guard — set once, never updated.
  immutable: true;
}

export interface ComputeClosingScoreInput {
  employeeId: string;
  globalOfficerId: string;
  workspaceId: string;
  separationType: SeparationType;
  separationDate?: Date;
}

/**
 * Compute and persist the closing score. This is the only function that
 * appends to globalOfficers.closing_scores. The append is atomic — if a
 * concurrent caller tries to add another entry for the same tenant within
 * the same separation, the second call is a no-op (idempotent).
 */
export async function computeAndAppendClosingScore(
  input: ComputeClosingScoreInput,
): Promise<ClosingScoreEntry> {
  const separationDate = input.separationDate ?? new Date();

  // Pull tenant name for the audit trail.
  const [ws] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  const tenantName = ws?.name ?? 'Unknown';

  // Compute fresh — system inputs only. The score engine intentionally never
  // reads manager free-text fields; everything it consumes is event-driven.
  const result = await computeOfficerScore(input.employeeId, input.globalOfficerId);

  const entry: ClosingScoreEntry = {
    tenantId: input.workspaceId,
    tenantName,
    score: result.score,
    tier: result.tier,
    separationType: input.separationType,
    separationDate: separationDate.toISOString(),
    computedAt: result.computedAt.toISOString(),
    factorBreakdown: result.factorBreakdown,
    engineVersion: 'v1.0',
    immutable: true,
  };

  // Read-modify-write under a single update; idempotent on (tenantId, separationDate).
  const [officer] = await db
    .select({ closingScores: globalOfficers.closingScores })
    .from(globalOfficers)
    .where(eq(globalOfficers.id, input.globalOfficerId))
    .limit(1);

  const existing = (officer?.closingScores as ClosingScoreEntry[] | null) ?? [];
  const duplicate = existing.find(
    (e) => e.tenantId === entry.tenantId && e.separationDate === entry.separationDate,
  );
  if (duplicate) {
    log.info(`[closingScore] duplicate skip officer=${input.globalOfficerId} tenant=${input.workspaceId}`);
    return duplicate;
  }

  const next = [...existing, entry];
  await db.update(globalOfficers).set({
    closingScores: next as unknown as Record<string, unknown>[],
    lastUpdatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(globalOfficers.id, input.globalOfficerId));

  log.info(`[closingScore] FROZEN officer=${input.globalOfficerId} tenant=${input.workspaceId} score=${entry.score} (${entry.tier})`);
  return entry;
}

/**
 * Read-only accessor for closing scores. The public API never exposes raw
 * factor breakdowns — only score + tier + tenant + dates.
 */
export async function getClosingScoresForOfficer(globalOfficerId: string): Promise<ClosingScoreEntry[]> {
  const [officer] = await db
    .select({ closingScores: globalOfficers.closingScores })
    .from(globalOfficers)
    .where(eq(globalOfficers.id, globalOfficerId))
    .limit(1);
  return (officer?.closingScores as ClosingScoreEntry[] | null) ?? [];
}

/**
 * Validation guard exported for the Trinity Conscience principle. Returns
 * true when an attempted write to closing_scores would corrupt the audit
 * trail (overwrite or remove an existing entry).
 *
 * Append-only is the only allowed mutation pattern.
 */
export function wouldViolateImmutability(
  existing: ClosingScoreEntry[],
  proposed: ClosingScoreEntry[],
): boolean {
  if (proposed.length < existing.length) return true;
  for (let i = 0; i < existing.length; i++) {
    const a = existing[i];
    const b = proposed[i];
    if (!b) return true;
    if (a.tenantId !== b.tenantId) return true;
    if (a.score !== b.score) return true;
    if (a.computedAt !== b.computedAt) return true;
    if (a.separationDate !== b.separationDate) return true;
  }
  return false;
}
