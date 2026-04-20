/**
 * Timezone Utilities — CoAIleague Canonical
 *
 * Per TRINITY.md §15 ("Timezone Architecture — The Silent Bug Killer"):
 *
 *   "The database stores ALL timestamps in UTC. No exceptions. No local
 *    time in the DB. Every `site` record stores its `timezone` (IANA
 *    format — e.g., 'America/Chicago'). Shift times are always stored in
 *    UTC and converted to the site's local timezone for display."
 *
 *   "A `toLocalTime(utcTimestamp, siteTimezone)` utility must be the only
 *    way timestamps are rendered in the UI or in communications. Direct
 *    `Date` formatting without timezone context is a bug."
 *
 * This module is the canonical utility. It uses the native Intl.DateTimeFormat
 * API so it works on both server and client without requiring date-fns-tz or
 * any other runtime dependency.
 *
 * Storage rules (enforced in the DB, not here):
 *   - All timestamp columns are `timestamptz` (UTC)
 *   - sites.coverage_timezone: IANA timezone for the site (e.g., 'America/Chicago')
 *   - workspaces.timezone: IANA timezone for the tenant (fallback when site tz is not set)
 *   - employees inherit timezone from the site they're punching at, or their
 *     primary workspace timezone if no site is active
 *
 * Display rules (enforced here):
 *   - Never call `.toLocaleString()` directly on a Date without passing a
 *     timezone. The browser's default timezone does NOT match the site.
 *   - Never do `new Date(utcString).toString()` — uses server time.
 *   - Always use one of the helpers below.
 */

const FALLBACK_TIMEZONE = 'America/Chicago'; // central US default if nothing else is set

// ── Validation ───────────────────────────────────────────────────────────────

/** Returns true if the given string is a valid IANA timezone identifier. */
export function isValidIANATimezone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false;
  try {
    // Intl throws RangeError for unknown timezones
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Resolves a timezone string with fallback cascade (provided → FALLBACK). */
export function resolveTimezone(tz: string | null | undefined): string {
  if (isValidIANATimezone(tz)) return tz;
  return FALLBACK_TIMEZONE;
}

// ── Core conversion ──────────────────────────────────────────────────────────

/**
 * Convert a UTC timestamp (Date or ISO string) to a formatted local string
 * in the given timezone. This is the PRIMARY utility — every UI and every
 * notification/email template should call this instead of toLocaleString.
 *
 * @example
 *   toLocalTime(shift.startTime, site.coverageTimezone)
 *   // → "Mar 15, 2026, 2:30 PM CDT"
 */
export function toLocalTime(
  utcTimestamp: Date | string | null | undefined,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  },
): string {
  if (!utcTimestamp) return '';
  const date = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
  if (isNaN(date.getTime())) return '';
  const tz = resolveTimezone(timezone);
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: tz }).format(date);
}

/** Date-only rendering (no time component). */
export function toLocalDate(
  utcTimestamp: Date | string | null | undefined,
  timezone: string | null | undefined,
): string {
  return toLocalTime(utcTimestamp, timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Time-only rendering (no date component). */
export function toLocalTimeOfDay(
  utcTimestamp: Date | string | null | undefined,
  timezone: string | null | undefined,
): string {
  return toLocalTime(utcTimestamp, timezone, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** ISO 8601 string with the local-time offset baked in (e.g. 2026-03-15T14:30:00-05:00). */
export function toLocalIsoString(
  utcTimestamp: Date | string | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!utcTimestamp) return '';
  const date = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
  if (isNaN(date.getTime())) return '';
  const tz = resolveTimezone(timezone);
  // Compose an ISO-ish string using parts for reliability across browsers
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  if (hour === '24') hour = '00'; // normalize Intl quirk
  const minute = get('minute');
  const second = get('second');
  const offsetRaw = get('timeZoneName') || 'GMT+00:00';
  // Intl returns "GMT+05:00" or "GMT-05:30" — normalize to "+05:00"
  const offset = offsetRaw.replace(/^GMT/, '').replace(/^([+-])(\d)(:)/, '$10$2$3') || '+00:00';
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

// ── Relative rendering (for Trinity voice, natural-language outputs) ─────────

/**
 * Human-friendly day label: "Today", "Tomorrow", "Yesterday", or day name
 * for dates within the week, falling back to toLocalDate.
 */
export function toRelativeDay(
  utcTimestamp: Date | string | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!utcTimestamp) return '';
  const date = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
  if (isNaN(date.getTime())) return '';
  const tz = resolveTimezone(timezone);

  // Get "today" in the target timezone as a YYYY-MM-DD key
  const keyOf = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  const target = keyOf(date);
  const now = new Date();
  const today = keyOf(now);
  const yesterday = keyOf(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const tomorrow = keyOf(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  if (target === today) return 'Today';
  if (target === tomorrow) return 'Tomorrow';
  if (target === yesterday) return 'Yesterday';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// ── Boundary helpers for payroll / scheduling math ───────────────────────────

/**
 * Returns the start of the given date in the target timezone, as a UTC Date.
 * Useful for payroll cutoffs where "start of day Monday in Chicago" must become
 * a precise UTC instant regardless of where the server is running.
 */
export function startOfDayInTimezone(
  utcTimestamp: Date | string,
  timezone: string | null | undefined,
): Date {
  const date = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
  const tz = resolveTimezone(timezone);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  // Construct midnight-in-timezone, then convert back to UTC
  const localMidnight = new Date(`${ymd}T00:00:00`);
  // localMidnight is parsed as the server's local time — adjust by the
  // difference between server offset and the target timezone offset
  const serverOffset = -localMidnight.getTimezoneOffset(); // minutes east of UTC
  const targetOffset = getTimezoneOffsetMinutes(tz, localMidnight);
  return new Date(localMidnight.getTime() - (targetOffset - serverOffset) * 60 * 1000);
}

/** Returns the UTC offset (in minutes) of the given timezone at the given instant. */
export function getTimezoneOffsetMinutes(
  timezone: string,
  at: Date = new Date(),
): number {
  const tz = resolveTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  // Parse "GMT+05:00" or "GMT-05:30"
  const match = /^GMT([+-])(\d{1,2}):(\d{2})$/.exec(parts);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  return sign * (hours * 60 + minutes);
}

// ── Convenience exports ──────────────────────────────────────────────────────

export const timezone = {
  toLocalTime,
  toLocalDate,
  toLocalTimeOfDay,
  toLocalIsoString,
  toRelativeDay,
  startOfDayInTimezone,
  getTimezoneOffsetMinutes,
  isValidIANATimezone,
  resolveTimezone,
  FALLBACK_TIMEZONE,
};
