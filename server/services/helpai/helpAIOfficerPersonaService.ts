/**
 * HELPAI OFFICER PERSONA SERVICE
 * ================================
 * HelpAI knows who she's talking to before the first word.
 *
 * When an officer opens their shift room, HelpAI pulls a rich profile:
 *   - Name, certification status, reliability score
 *   - Last 7 days of shifts (load, OT, calloffs)
 *   - Communication preferences learned from past interactions
 *   - Emotional baseline and distress history
 *   - Common requests and struggles
 *
 * This 200-token context packet makes every interaction personal.
 * She adapts to introverts, Spanish speakers, officers who prefer
 * short answers — not because she's pretending, but because she
 * actually built that model of the person over time.
 *
 * Biological analog: The way a good supervisor unconsciously adjusts
 * how they talk to each person on their team.
 */

import { db, pool } from '../../db';
import { helpaiOfficerProfiles } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('HelpAIOfficerPersona');

export interface OfficerPersonaContext {
  displayName: string;
  preferredStyle: string;
  preferredLanguage: string;
  commonStruggles: string[];
  stressSignals: string[];
  distressHistory: number;
  lastEmotionalState: string;
  observationNotes: string;
  shiftLoad: string;          // e.g. "heavy week — 48hrs, 2 OT shifts"
  certStatus: string;         // e.g. "license expires in 14 days"
  reliabilityScore: string;   // e.g. "98% — excellent"
}

// ── Profile retrieval ─────────────────────────────────────────────────────────

export async function getOfficerPersona(
  officerId: string,
  workspaceId: string
): Promise<OfficerPersonaContext | null> {
  try {
    const [profile] = await db.select()
      .from(helpaiOfficerProfiles)
      .where(and(
        eq(helpaiOfficerProfiles.officerId, officerId),
        eq(helpaiOfficerProfiles.workspaceId, workspaceId)
      ))
      .limit(1);

    // Pull live shift data
    const shiftLoad = await getShiftLoad(officerId, workspaceId);
    const certStatus = await getCertStatus(officerId, workspaceId);
    const reliabilityScore = await getReliabilityScore(officerId, workspaceId);

    // Get officer name
    const nameRow = await pool.query(
      `SELECT first_name, last_name FROM employees WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [officerId, workspaceId]
    );
    const employee = nameRow.rows[0];
    const displayName = employee
      ? `${employee.first_name} ${employee.last_name}`.trim()
      : 'Officer';

    return {
      displayName,
      preferredStyle: profile?.preferredStyle ?? 'balanced',
      preferredLanguage: profile?.preferredLanguage ?? 'en',
      commonStruggles: profile?.commonStruggles ? JSON.parse(profile.commonStruggles) : [],
      stressSignals: profile?.stressSignals ? JSON.parse(profile.stressSignals) : [],
      distressHistory: profile?.distressHistory ?? 0,
      lastEmotionalState: profile?.lastEmotionalState ?? 'neutral',
      observationNotes: profile?.observationNotes ?? '',
      shiftLoad,
      certStatus,
      reliabilityScore,
    };
  } catch (err: any) {
    log.warn('[OfficerPersona] Failed to load persona (non-fatal):', err?.message);
    return null;
  }
}

// ── Build the HelpAI system prompt injection from persona ─────────────────────

export function buildPersonaPrompt(persona: OfficerPersonaContext): string {
  const lines: string[] = [
    `OFFICER CONTEXT — You are talking to ${persona.displayName}.`,
  ];

  // Communication style
  if (persona.preferredStyle === 'brief') {
    lines.push('They prefer SHORT answers. Get to the point fast. Skip preamble.');
  } else if (persona.preferredStyle === 'detailed') {
    lines.push('They prefer detailed explanations. Walk them through things step by step.');
  } else {
    lines.push('Match their energy — friendly but professional.');
  }

  // Language
  if (persona.preferredLanguage === 'es') {
    lines.push('Respond in Spanish. They communicate more comfortably in Spanish.');
  }

  // Current operational state
  if (persona.shiftLoad) {
    lines.push(`Shift load: ${persona.shiftLoad}`);
  }
  if (persona.certStatus) {
    lines.push(`Certification: ${persona.certStatus}`);
  }
  if (persona.reliabilityScore) {
    lines.push(`Reliability: ${persona.reliabilityScore}`);
  }

  // Emotional baseline
  if (persona.lastEmotionalState !== 'neutral') {
    lines.push(`Recent emotional state: ${persona.lastEmotionalState} — adjust your tone accordingly.`);
  }
  if (persona.distressHistory > 2) {
    lines.push(`This officer has had ${persona.distressHistory} prior distress events. Be especially attentive to stress signals.`);
  }

  // Known patterns
  if (persona.commonStruggles.length > 0) {
    lines.push(`Common struggles: ${persona.commonStruggles.join(', ')}. Anticipate these before they ask.`);
  }

  // Observer notes
  if (persona.observationNotes) {
    lines.push(`Notes from past interactions: ${persona.observationNotes}`);
  }

  return lines.join('\n');
}

// ── Profile update — called after each shift room session ────────────────────

export async function updateOfficerProfile(opts: {
  officerId: string;
  workspaceId: string;
  detectedStyle?: string;
  detectedLanguage?: string;
  emotionalState?: string;
  requestTypes?: string[];
  wasDistress?: boolean;
  observationUpdate?: string;
}): Promise<void> {
  try {
    const [existing] = await db.select()
      .from(helpaiOfficerProfiles)
      .where(and(
        eq(helpaiOfficerProfiles.officerId, opts.officerId),
        eq(helpaiOfficerProfiles.workspaceId, opts.workspaceId)
      ))
      .limit(1);

    const now = new Date();

    if (existing) {
      const updates: Record<string, any> = {
        lastInteractionAt: now,
        totalInteractions: (existing.totalInteractions ?? 0) + 1,
        updatedAt: now,
      };
      if (opts.detectedStyle) updates.preferredStyle = opts.detectedStyle;
      if (opts.detectedLanguage) updates.preferredLanguage = opts.detectedLanguage;
      if (opts.emotionalState) updates.lastEmotionalState = opts.emotionalState;
      if (opts.wasDistress) updates.distressHistory = (existing.distressHistory ?? 0) + 1;
      if (opts.observationUpdate) {
        // Append to observation notes, keep last 150 tokens (~600 chars)
        const prev = existing.observationNotes ?? '';
        updates.observationNotes = (`${prev} ${opts.observationUpdate}`).slice(-600).trim();
      }
      if (opts.requestTypes?.length) {
        const prev: string[] = existing.commonRequests ? JSON.parse(existing.commonRequests) : [];
        const merged = [...new Set([...prev, ...opts.requestTypes])].slice(0, 10);
        updates.commonRequests = JSON.stringify(merged);
      }

      await db.update(helpaiOfficerProfiles)
        .set(updates)
        .where(and(
          eq(helpaiOfficerProfiles.officerId, opts.officerId),
          eq(helpaiOfficerProfiles.workspaceId, opts.workspaceId)
        ));
    } else {
      // Create new profile
      await db.insert(helpaiOfficerProfiles).values({
        officerId: opts.officerId,
        workspaceId: opts.workspaceId,
        preferredStyle: opts.detectedStyle ?? 'balanced',
        preferredLanguage: opts.detectedLanguage ?? 'en',
        lastEmotionalState: opts.emotionalState ?? 'neutral',
        distressHistory: opts.wasDistress ? 1 : 0,
        totalInteractions: 1,
        lastInteractionAt: now,
        observationNotes: opts.observationUpdate ?? '',
        commonRequests: opts.requestTypes ? JSON.stringify(opts.requestTypes) : null,
      });
    }
  } catch (err: any) {
    log.warn('[OfficerPersona] Profile update failed (non-fatal):', err?.message);
  }
}

// ── Live data helpers ─────────────────────────────────────────────────────────

async function getShiftLoad(officerId: string, workspaceId: string): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as shift_count,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (end_time::time - start_time::time)) / 3600
        ), 0) as total_hours,
        COUNT(*) FILTER (WHERE is_overtime = true) as ot_count
      FROM shifts
      WHERE employee_id = $1 AND workspace_id = $2
        AND date >= CURRENT_DATE - 7
    `, [officerId, workspaceId]);

    const row = result.rows[0];
    if (!row || Number(row.shift_count) === 0) return '';
    const hrs = Math.round(Number(row.total_hours));
    const otStr = Number(row.ot_count) > 0 ? `, ${row.ot_count} OT` : '';
    const load = hrs > 40 ? 'heavy week' : hrs > 24 ? 'normal week' : 'light week';
    return `${load} — ${hrs}hrs${otStr}`;
  } catch { return ''; }
}

async function getCertStatus(officerId: string, workspaceId: string): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT license_expiration_date FROM employees
      WHERE id = $1 AND workspace_id = $2 LIMIT 1
    `, [officerId, workspaceId]);
    const row = result.rows[0];
    if (!row?.license_expiration_date) return '';
    const daysLeft = Math.ceil(
      (new Date(row.license_expiration_date).getTime() - Date.now()) / 86400000
    );
    if (daysLeft < 0) return '⚠️ License EXPIRED';
    if (daysLeft <= 30) return `⚠️ License expires in ${daysLeft} days`;
    return 'License current';
  } catch { return ''; }
}

async function getReliabilityScore(officerId: string, workspaceId: string): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('completed','clocked_out')) as completed
      FROM shifts
      WHERE employee_id = $1 AND workspace_id = $2
        AND date >= CURRENT_DATE - 90
    `, [officerId, workspaceId]);
    const row = result.rows[0];
    if (!row || Number(row.total) === 0) return '';
    const pct = Math.round((Number(row.completed) / Number(row.total)) * 100);
    const grade = pct >= 97 ? 'excellent' : pct >= 90 ? 'good' : pct >= 80 ? 'fair' : 'needs attention';
    return `${pct}% — ${grade}`;
  } catch { return ''; }
}
