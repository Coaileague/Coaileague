/**
 * PHASE 46 — HOLIDAY CALENDAR SERVICE
 *
 * Manages federal holidays, state-specific holidays, and custom workspace holidays.
 * All times stored in UTC. Holiday differential pay triggers based on confirmed
 * holiday dates for the post's state.
 *
 * Rules:
 * - Holiday changes only affect future shifts (locked payroll periods unaffected)
 * - Federal holidays pre-populated for current + next year on startup
 * - State holidays populated from stateRegulatoryKnowledgeBase
 * - December 1st cron auto-populates next year's holidays
 * - IANA timezone validated on save
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';
const log = createLogger('holidayService');

let decemberHolidayCron: ReturnType<typeof setInterval> | null = null;


// ─── IANA Timezone Validation ─────────────────────────────────────────────────

const IANA_TIMEZONE_CACHE = new Set<string>();

/**
 * Validate an IANA timezone string (e.g. "America/Chicago")
 * Uses Intl.DateTimeFormat which validates against the IANA database.
 */
export function isValidIANATimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  if (IANA_TIMEZONE_CACHE.has(tz)) return true;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    IANA_TIMEZONE_CACHE.add(tz);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a UTC Date to local time string in a given IANA timezone
 */
export function utcToLocalString(date: Date, timezone: string): string {
  if (!isValidIANATimezone(timezone)) timezone = 'America/Chicago';
  return date.toLocaleString('en-US', { timeZone: timezone });
}

/**
 * Get the Sunday midnight boundary (start of workweek) in a given timezone,
 * expressed as UTC for DB queries.
 */
export function getWorkweekStartUTC(referenceDate: Date, timezone: string): Date {
  if (!isValidIANATimezone(timezone)) timezone = 'America/Chicago';
  
  // Get the date in the local timezone
  const localStr = referenceDate.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const [year, month, day] = localStr.split('-').map(Number);
  
  // Create midnight in local timezone
  const localMidnight = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);
  
  // Walk back to Sunday
  const dayOfWeek = new Date(referenceDate.toLocaleString('en-US', { timeZone: timezone })).getDay();
  const sundayMidnightLocal = new Date(localMidnight.getTime() - dayOfWeek * 86400000);
  
  // Convert back using timezone offset
  const offset = getTimezoneOffsetMs(sundayMidnightLocal, timezone);
  return new Date(sundayMidnightLocal.getTime() + offset);
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = date.toLocaleString('en-US', { timeZone: timezone });
  return new Date(utcStr).getTime() - new Date(localStr).getTime();
}

// ─── Federal Holidays ─────────────────────────────────────────────────────────

interface HolidayDef {
  name: string;
  type: 'federal' | 'state' | 'custom';
  stateCode?: string;
  appliesTo: boolean;
}

function getFederalHolidays(year: number): Array<{ date: string } & HolidayDef> {
  // US Federal Holidays (fixed and observed rules)
  const fixed: Array<{ month: number; day: number; name: string }> = [
    { month: 1,  day: 1,  name: "New Year's Day" },
    { month: 7,  day: 4,  name: "Independence Day" },
    { month: 11, day: 11, name: "Veterans Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ];

  const results: Array<{ date: string } & HolidayDef> = [];

  // Fixed holidays (with Saturday→Friday / Sunday→Monday shift for observed)
  for (const h of fixed) {
    const d = new Date(year, h.month - 1, h.day);
    const dow = d.getDay();
    let observed = new Date(d);
    if (dow === 6) observed = new Date(year, h.month - 1, h.day - 1); // Sat→Fri
    if (dow === 0) observed = new Date(year, h.month - 1, h.day + 1); // Sun→Mon
    results.push({
      date: observed.toISOString().split('T')[0],
      name: h.name,
      type: 'federal',
      appliesTo: true,
    });
  }

  // MLK Day — 3rd Monday in January
  results.push({ date: nthWeekday(year, 1, 1, 3), name: "Martin Luther King Jr. Day", type: 'federal', appliesTo: true });
  // Presidents Day — 3rd Monday in February
  results.push({ date: nthWeekday(year, 2, 1, 3), name: "Presidents' Day", type: 'federal', appliesTo: true });
  // Memorial Day — last Monday in May
  results.push({ date: lastWeekday(year, 5, 1), name: "Memorial Day", type: 'federal', appliesTo: true });
  // Juneteenth — June 19 (observed)
  const juneteenth = new Date(year, 5, 19);
  const jdow = juneteenth.getDay();
  let jObs = new Date(juneteenth);
  if (jdow === 6) jObs = new Date(year, 5, 18);
  if (jdow === 0) jObs = new Date(year, 5, 20);
  results.push({ date: jObs.toISOString().split('T')[0], name: "Juneteenth National Independence Day", type: 'federal', appliesTo: true });
  // Labor Day — 1st Monday in September
  results.push({ date: nthWeekday(year, 9, 1, 1), name: "Labor Day", type: 'federal', appliesTo: true });
  // Columbus Day — 2nd Monday in October
  results.push({ date: nthWeekday(year, 10, 1, 2), name: "Columbus Day", type: 'federal', appliesTo: true });
  // Thanksgiving — 4th Thursday in November
  results.push({ date: nthWeekday(year, 11, 4, 4), name: "Thanksgiving Day", type: 'federal', appliesTo: true });

  return results;
}

/** nth occurrence of weekday (0=Sun … 6=Sat) in given month/year. weekNum is 1-based. */
function nthWeekday(year: number, month: number, weekday: number, weekNum: number): string {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) break;
    if (d.getDay() === weekday) {
      count++;
      if (count === weekNum) return d.toISOString().split('T')[0];
    }
  }
  return '';
}

/** Last occurrence of weekday in given month/year. */
function lastWeekday(year: number, month: number, weekday: number): string {
  for (let day = 31; day >= 1; day--) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) continue;
    if (d.getDay() === weekday) return d.toISOString().split('T')[0];
  }
  return '';
}

// ─── State Holidays ──────────────────────────────────────────────────────────

function getStateHolidays(year: number): Array<{ date: string } & HolidayDef> {
  const results: Array<{ date: string } & HolidayDef> = [];
  
  // CA: César Chávez Day — March 31
  const czD = new Date(year, 2, 31);
  const czDow = czD.getDay();
  let czObs = new Date(czD);
  if (czDow === 6) czObs = new Date(year, 2, 30);
  if (czDow === 0) czObs = new Date(year, 3, 1);
  results.push({ date: czObs.toISOString().split('T')[0], name: "César Chávez Day", type: 'state', stateCode: 'CA', appliesTo: true });

  // TX: Texas Independence Day — March 2
  results.push({ date: `${year}-03-02`, name: "Texas Independence Day", type: 'state', stateCode: 'TX', appliesTo: true });
  // TX: San Jacinto Day — April 21
  results.push({ date: `${year}-04-21`, name: "San Jacinto Day", type: 'state', stateCode: 'TX', appliesTo: true });
  // TX: Emancipation Day (Juneteenth TX observed) — June 19
  results.push({ date: `${year}-06-19`, name: "Emancipation Day in Texas", type: 'state', stateCode: 'TX', appliesTo: true });

  // FL: Pascua Florida Day — April 2
  results.push({ date: `${year}-04-02`, name: "Pascua Florida Day", type: 'state', stateCode: 'FL', appliesTo: true });
  // FL: Confederate Memorial Day — April 26
  results.push({ date: `${year}-04-26`, name: "Confederate Memorial Day", type: 'state', stateCode: 'FL', appliesTo: true });

  // NY: Election Day — 1st Tuesday after 1st Monday in November
  const electionDay = getElectionDay(year);
  results.push({ date: electionDay, name: "Election Day", type: 'state', stateCode: 'NY', appliesTo: true });

  // IL: Lincoln's Birthday — February 12
  results.push({ date: `${year}-02-12`, name: "Lincoln's Birthday", type: 'state', stateCode: 'IL', appliesTo: true });
  // IL: Casimir Pulaski Day — 1st Monday in March
  results.push({ date: nthWeekday(year, 3, 1, 1), name: "Casimir Pulaski Day", type: 'state', stateCode: 'IL', appliesTo: true });

  // GA: Robert E. Lee's Birthday — Friday after Thanksgiving
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const tgDate = new Date(thanksgiving);
  const gaDay = new Date(tgDate.getTime() + 86400000);
  results.push({ date: gaDay.toISOString().split('T')[0], name: "Robert E. Lee's Birthday", type: 'state', stateCode: 'GA', appliesTo: true });

  // WA: Washington's Birthday — 3rd Monday in February (Presidents Day)
  results.push({ date: nthWeekday(year, 2, 1, 3), name: "Washington's Birthday", type: 'state', stateCode: 'WA', appliesTo: true });

  // AZ: Arizona Admission Day — February 14
  results.push({ date: `${year}-02-14`, name: "Arizona Admission Day", type: 'state', stateCode: 'AZ', appliesTo: true });

  // CO: César Chávez Day — March 31
  results.push({ date: `${year}-03-31`, name: "César Chávez Day", type: 'state', stateCode: 'CO', appliesTo: true });

  // NV: Nevada Day — last Friday in October
  results.push({ date: lastWeekday(year, 10, 5), name: "Nevada Day", type: 'state', stateCode: 'NV', appliesTo: true });

  // MA: Patriots' Day — 3rd Monday in April
  results.push({ date: nthWeekday(year, 4, 1, 3), name: "Patriots' Day", type: 'state', stateCode: 'MA', appliesTo: true });

  return results;
}

function getElectionDay(year: number): string {
  // First Monday in November
  const firstMonday = nthWeekday(year, 11, 1, 1);
  const d = new Date(firstMonday);
  // Tuesday after first Monday
  const tuesday = new Date(d.getTime() + 86400000);
  return tuesday.toISOString().split('T')[0];
}

// ─── Database Operations ─────────────────────────────────────────────────────

/**
 * Pre-populate federal and state holidays for a given year across all workspaces.
 * Uses INSERT … ON CONFLICT DO NOTHING to be idempotent.
 */
export async function populateHolidaysForYear(year: number): Promise<void> {
  const federal = getFederalHolidays(year);
  const state = getStateHolidays(year);
  const all = [...federal, ...state];

  // Get all workspace IDs (exclude cancelled/suspended)
  const { rows: workspaces } = await pool.query(
    `SELECT id FROM workspaces WHERE (subscription_status NOT IN ('cancelled', 'suspended') OR subscription_status IS NULL) AND (workspace_type IS NULL OR workspace_type != 'trial_expired') LIMIT 5000`
  );
  
  for (const ws of workspaces) {
    for (const h of all) {
      await pool.query(
        `INSERT INTO workspace_holidays (id, workspace_id, name, date, holiday_type, state_code, applies_to_differential)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [ws.id, h.name, h.date, h.type, h.stateCode || null, h.appliesTo]
      );
    }
  }
  log.info(`[HolidayService] Populated ${all.length} holidays for year ${year} across ${workspaces.length} workspaces`);
}

/**
 * Initialize holidays for current year and next year on startup.
 * Called once from routes.ts.
 */
export async function initializeHolidays(): Promise<void> {
  try {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    // Check if holidays already exist for this year to avoid re-running
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM workspace_holidays WHERE EXTRACT(YEAR FROM date) = $1 AND holiday_type != 'custom'`,
      [currentYear]
    );
    
    if (parseInt(rows[0].count) === 0) {
      await populateHolidaysForYear(currentYear);
    }
    
    // Always ensure next year is populated
    const { rows: nextYearRows } = await pool.query(
      `SELECT COUNT(*) as count FROM workspace_holidays WHERE EXTRACT(YEAR FROM date) = $1 AND holiday_type != 'custom'`,
      [nextYear]
    );
    
    if (parseInt(nextYearRows[0].count) === 0) {
      await populateHolidaysForYear(nextYear);
    }
    
    log.info(`[HolidayService] Holiday initialization complete for ${currentYear} and ${nextYear}`);
  } catch (err: unknown) {
    // OBSERVABILITY (Phase 1 Domain 1): the previous `err.message`-only
    // log hid the root cause of "Initialization failed (non-fatal)".
    // Surface the full PG error context so we can diagnose it without
    // another round-trip through production logs.
    log.error('[HolidayService] Initialization failed (non-fatal)', {
      message: err instanceof Error ? err.message : String(err),
      code: err?.code,
      detail: err?.detail,
      column: err?.column,
      constraint: err?.constraint,
      table: err?.table,
      schema: err?.schema,
      where: err?.where,
      routine: err?.routine,
      stack: err?.stack?.split('\n').slice(0, 8).join(' | '),
    });
  }
}

/**
 * Check if a given date is a holiday for a workspace (using the post's state).
 * Used by payroll to determine if holiday differential pay applies.
 */
export async function isHolidayForWorkspace(
  workspaceId: string,
  date: Date,
  stateCode?: string
): Promise<boolean> {
  const dateStr = date.toISOString().split('T')[0];
  
  const { rows } = await pool.query(
    `SELECT id FROM workspace_holidays 
     WHERE workspace_id = $1 
     AND date = $2 
     AND applies_to_differential = true
     AND (state_code IS NULL OR state_code = $3)
     LIMIT 1`,
    [workspaceId, dateStr, stateCode || null]
  );
  
  return rows.length > 0;
}

/**
 * Register December 1st cron for next-year holiday auto-population.
 * Called from cronInit on application startup.
 */
export function registerDecemberHolidayCron(): void {
  if (decemberHolidayCron) return;

  const checkAndRun = () => {
    const now = new Date();
    // Run on December 1st between 02:00 and 03:00 UTC
    if (now.getUTCMonth() === 11 && now.getUTCDate() === 1 && now.getUTCHours() === 2) {
      const nextYear = now.getUTCFullYear() + 1;
      log.info(`[HolidayService] December 1st cron: populating holidays for ${nextYear}`);
      populateHolidaysForYear(nextYear).catch(err =>
        log.error('[HolidayService] December cron failed:', err.message)
      );
    }
  };

  // Check every hour
  decemberHolidayCron = setInterval(checkAndRun, 3600000);
  decemberHolidayCron.unref();
  log.info('[HolidayService] December 1st holiday cron registered');
}

export function stopDecemberHolidayCron(): void {
  if (!decemberHolidayCron) return;
  clearInterval(decemberHolidayCron);
  decemberHolidayCron = null;
}

/**
 * Get holidays for a workspace (paginated).
 */
export async function getWorkspaceHolidays(
  workspaceId: string,
  year?: number
): Promise<any[]> {
  let query = `SELECT * FROM workspace_holidays WHERE workspace_id = $1`;
  const params: any[] = [workspaceId];
  
  if (year) {
    query += ` AND EXTRACT(YEAR FROM date) = $2`;
    params.push(year);
  }
  
  query += ` ORDER BY date ASC`;
  
  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Create a custom holiday for a workspace.
 */
export async function createWorkspaceHoliday(params: {
  workspaceId: string;
  name: string;
  date: string;
  holidayType: 'federal' | 'state' | 'custom';
  stateCode?: string;
  appliesToDifferential: boolean;
  createdBy: string;
}): Promise<unknown> {
  const { rows } = await pool.query(
    `INSERT INTO workspace_holidays (id, workspace_id, name, date, holiday_type, state_code, applies_to_differential, created_by)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.workspaceId,
      params.name,
      params.date,
      params.holidayType,
      params.stateCode || null,
      params.appliesToDifferential,
      params.createdBy,
    ]
  );
  return rows[0];
}

/**
 * Update a workspace holiday (only future holidays — locked payroll unaffected).
 */
export async function updateWorkspaceHoliday(
  id: string,
  workspaceId: string,
  updates: Partial<{
    name: string;
    date: string;
    stateCode: string;
    appliesToDifferential: boolean;
  }>
): Promise<unknown> {
  // Only update future holidays (date >= today)
  const today = new Date().toISOString().split('T')[0];
  
  const fields: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (updates.name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(updates.name); }
  if (updates.date !== undefined) { fields.push(`date = $${paramIdx++}`); values.push(updates.date); }
  if (updates.stateCode !== undefined) { fields.push(`state_code = $${paramIdx++}`); values.push(updates.stateCode); }
  if (updates.appliesToDifferential !== undefined) { fields.push(`applies_to_differential = $${paramIdx++}`); values.push(updates.appliesToDifferential); }

  if (fields.length === 0) throw new Error('No fields to update');

  values.push(id, workspaceId, today);
  const { rows } = await pool.query(
    `UPDATE workspace_holidays SET ${fields.join(', ')}
     WHERE id = $${paramIdx} AND workspace_id = $${paramIdx + 1} AND date >= $${paramIdx + 2}
     RETURNING *`,
    values
  );
  return rows[0] || null;
}

/**
 * Delete a workspace holiday (only future holidays — locked payroll unaffected).
 */
export async function deleteWorkspaceHoliday(id: string, workspaceId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const { rowCount } = await pool.query(
    `DELETE FROM workspace_holidays WHERE id = $1 AND workspace_id = $2 AND holiday_type = 'custom' AND date >= $3`,
    [id, workspaceId, today]
  );
  return (rowCount ?? 0) > 0;
}
