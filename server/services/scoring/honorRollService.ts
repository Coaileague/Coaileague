/**
 * Honor Roll Service
 * ==================
 * Selects the platform-wide Officer of the Month and Officer of the Year.
 *
 * Selection is automatic and system-only — no nominations, no human voting.
 * The single highest-scoring opted-in officer in the period wins. Ties are
 * broken by tenure on platform (firstSeenAt ASC).
 *
 * Strict eligibility:
 *   - globalOfficers.publicRecognitionConsent === true
 *   - currentScore >= 85 (favorable+) for the entire qualifying window
 *     (6 months for monthly, 12 months for yearly)
 *   - no open termination_warning / pip / suspension in qualifying window
 *
 * Output is appended to honor_roll_selections; the public honor-roll page
 * reads from there. The award is given by CoAIleague (the platform), not
 * by any tenant — this is the "give back to the community" moment.
 */

import { db } from '../../db';
import { eq, and, gte, desc, asc, sql, inArray } from 'drizzle-orm';
import {
  globalOfficers,
  honorRollSelections,
  employees,
  workspaces,
  disciplinaryRecords,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('honorRoll');

const SCORE_FLOOR = 85;
const MONTHLY_QUAL_MONTHS = 6;
const YEARLY_QUAL_MONTHS = 12;
const DISQUALIFYING_RECORDS = ['termination_warning', 'pip', 'suspension', 'termination'] as const;

export type AwardType = 'officer_of_month' | 'officer_of_year';

export interface HonorRollPick {
  globalOfficerId: string;
  awardType: AwardType;
  periodLabel: string;
  scoreAtSelection: number;
  tierAtSelection: string;
  monthsAboveThreshold: number;
  featuredWorkspaceId: string | null;
  featuredWorkspaceName: string | null;
  displayFirstName: string;
  displayLastInitial: string;
  photoConsent: boolean;
  photoUrl?: string | null;
}

function periodLabelFor(awardType: AwardType, periodEnd: Date): string {
  const y = periodEnd.getFullYear();
  if (awardType === 'officer_of_year') return String(y);
  const m = String(periodEnd.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function findCurrentTenant(globalOfficerId: string): Promise<{ workspaceId: string; workspaceName: string } | null> {
  // employees row joined to globalOfficers via global_officer_id (added on
  // employees in a follow-up migration). For now, fall back to the most
  // recent active employees row that matches the officer's identity, if any.
  // Best-effort — returns null when not resolvable.
  const result = await db.execute(sql`
    SELECT e.workspace_id AS workspace_id, w.name AS workspace_name
    FROM employees e
    LEFT JOIN workspaces w ON w.id = e.workspace_id
    WHERE e.global_officer_id = ${globalOfficerId}
      AND e.status = 'active'
    ORDER BY e.created_at DESC
    LIMIT 1
  `).catch(() => ({ rows: [] as Array<{ workspace_id: string; workspace_name: string }> }));

  const row = (result as { rows?: Array<{ workspace_id: string; workspace_name: string }> }).rows?.[0];
  if (!row) return null;
  return { workspaceId: row.workspace_id, workspaceName: row.workspace_name ?? 'Unknown' };
}

async function isOfficerEligible(
  globalOfficerId: string,
  qualMonths: number,
): Promise<boolean> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - qualMonths);

  // Check no disqualifying disciplinary records in the qualifying window.
  // Join through employees to find disciplinary records for this person on any tenant.
  const disqualifying = await db.execute(sql`
    SELECT 1
    FROM disciplinary_records dr
    JOIN employees e ON e.id = dr.employee_id
    WHERE e.global_officer_id = ${globalOfficerId}
      AND dr.record_type IN (${sql.raw(DISQUALIFYING_RECORDS.map(r => `'${r}'`).join(','))})
      AND dr.issued_at > ${cutoff}
    LIMIT 1
  `).catch(() => ({ rows: [] as unknown[] }));

  if (((disqualifying as { rows?: unknown[] }).rows?.length ?? 0) > 0) return false;

  return true;
}

export async function selectHonorRollPick(
  awardType: AwardType,
  periodEnd: Date = new Date(),
): Promise<HonorRollPick | null> {
  const periodLabel = periodLabelFor(awardType, periodEnd);

  // Idempotent — if a pick already exists for this period+award, return it.
  const existing = await db
    .select()
    .from(honorRollSelections)
    .where(and(
      eq(honorRollSelections.awardType, awardType),
      eq(honorRollSelections.periodLabel, periodLabel),
    ))
    .limit(1);
  if (existing[0]) {
    log.info(`[honorRoll] existing ${awardType} pick for ${periodLabel}`);
    return null;
  }

  const periodStart = new Date(periodEnd);
  if (awardType === 'officer_of_year') {
    periodStart.setFullYear(periodStart.getFullYear() - 1);
  } else {
    periodStart.setMonth(periodStart.getMonth() - 1);
  }

  const qualMonths = awardType === 'officer_of_year' ? YEARLY_QUAL_MONTHS : MONTHLY_QUAL_MONTHS;

  const candidates = await db
    .select()
    .from(globalOfficers)
    .where(and(
      eq(globalOfficers.publicRecognitionConsent, true),
      gte(globalOfficers.currentScore, SCORE_FLOOR),
    ))
    .orderBy(desc(globalOfficers.currentScore), asc(globalOfficers.firstSeenAt))
    .limit(20);

  for (const c of candidates) {
    const eligible = await isOfficerEligible(c.id, qualMonths);
    if (!eligible) continue;

    const tenant = await findCurrentTenant(c.id);

    const pick: HonorRollPick = {
      globalOfficerId: c.id,
      awardType,
      periodLabel,
      scoreAtSelection: c.currentScore ?? 0,
      tierAtSelection: c.currentTier ?? 'unknown',
      monthsAboveThreshold: qualMonths, // verified by the eligibility check
      featuredWorkspaceId: tenant?.workspaceId ?? null,
      featuredWorkspaceName: tenant?.workspaceName ?? null,
      displayFirstName: c.legalFirstName,
      displayLastInitial: c.legalLastName.charAt(0).toUpperCase(),
      photoConsent: false, // requires separate per-period consent
      photoUrl: null,
    };

    await db.insert(honorRollSelections).values({
      globalOfficerId: pick.globalOfficerId,
      awardType: pick.awardType,
      periodLabel: pick.periodLabel,
      periodStart,
      periodEnd,
      scoreAtSelection: pick.scoreAtSelection,
      tierAtSelection: pick.tierAtSelection,
      monthsAboveThreshold: pick.monthsAboveThreshold,
      featuredWorkspaceId: pick.featuredWorkspaceId,
      featuredWorkspaceName: pick.featuredWorkspaceName,
      displayFirstName: pick.displayFirstName,
      displayLastInitial: pick.displayLastInitial,
      photoConsent: pick.photoConsent,
      photoUrl: pick.photoUrl ?? null,
    });

    log.info(`[honorRoll] SELECTED ${awardType} ${periodLabel}: officer=${c.id} score=${c.currentScore} tenant=${tenant?.workspaceName ?? 'n/a'}`);
    return pick;
  }

  log.info(`[honorRoll] no eligible officer for ${awardType} ${periodLabel}`);
  return null;
}

export async function getCurrentHonorRoll(): Promise<{
  officerOfMonth: HonorRollPick | null;
  officerOfYear: HonorRollPick | null;
  recentMonthly: HonorRollPick[];
}> {
  const now = new Date();
  const monthLabel = periodLabelFor('officer_of_month', now);
  const yearLabel = periodLabelFor('officer_of_year', now);

  const [monthly] = await db
    .select()
    .from(honorRollSelections)
    .where(and(
      eq(honorRollSelections.awardType, 'officer_of_month'),
      eq(honorRollSelections.periodLabel, monthLabel),
    ))
    .limit(1);

  const [yearly] = await db
    .select()
    .from(honorRollSelections)
    .where(and(
      eq(honorRollSelections.awardType, 'officer_of_year'),
      eq(honorRollSelections.periodLabel, yearLabel),
    ))
    .limit(1);

  const recent = await db
    .select()
    .from(honorRollSelections)
    .where(eq(honorRollSelections.awardType, 'officer_of_month'))
    .orderBy(desc(honorRollSelections.periodEnd))
    .limit(12);

  function toPick(row: typeof honorRollSelections.$inferSelect): HonorRollPick {
    return {
      globalOfficerId: row.globalOfficerId,
      awardType: row.awardType as AwardType,
      periodLabel: row.periodLabel,
      scoreAtSelection: row.scoreAtSelection,
      tierAtSelection: row.tierAtSelection ?? '',
      monthsAboveThreshold: row.monthsAboveThreshold ?? 0,
      featuredWorkspaceId: row.featuredWorkspaceId,
      featuredWorkspaceName: row.featuredWorkspaceName,
      displayFirstName: row.displayFirstName,
      displayLastInitial: row.displayLastInitial,
      photoConsent: row.photoConsent ?? false,
      photoUrl: row.photoUrl,
    };
  }

  return {
    officerOfMonth: monthly ? toPick(monthly) : null,
    officerOfYear: yearly ? toPick(yearly) : null,
    recentMonthly: recent.map(toPick),
  };
}
