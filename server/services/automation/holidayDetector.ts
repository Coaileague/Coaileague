/**
 * Holiday Detection Utility
 * 
 * Provides timezone-aware holiday detection for time entries.
 * Uses workspace holiday calendar to determine if a given date is a holiday.
 */

interface HolidayEntry {
  date: string; // ISO date format "YYYY-MM-DD"
  name: string;
  billMultiplier?: number;
  payMultiplier?: number;
}

/**
 * Check if a given date falls on a holiday
 * 
 * @param date - The date to check (typically clockIn or clockOut)
 * @param holidayCalendar - Workspace holiday calendar (array of holiday entries)
 * @param timezone - Workspace timezone (IANA format, e.g., "America/New_York")
 * @returns true if the date is a holiday, false otherwise
 */
export function isHolidayDate(
  date: Date,
  holidayCalendar: HolidayEntry[] | null | undefined,
  timezone: string = "America/New_York"
): boolean {
  if (!holidayCalendar || holidayCalendar.length === 0) {
    return false;
  }

  // Convert date to workspace timezone and extract date portion
  // Format: "YYYY-MM-DD"
  const dateInWorkspaceTimezone = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

  // Check if this date matches any holiday in the calendar
  return holidayCalendar.some(holiday => holiday.date === dateInWorkspaceTimezone);
}

/**
 * Get holiday entry for a given date (if it exists)
 * 
 * @param date - The date to check
 * @param holidayCalendar - Workspace holiday calendar
 * @param timezone - Workspace timezone
 * @returns HolidayEntry if found, null otherwise
 */
export function getHolidayEntry(
  date: Date,
  holidayCalendar: HolidayEntry[] | null | undefined,
  timezone: string = "America/New_York"
): HolidayEntry | null {
  if (!holidayCalendar || holidayCalendar.length === 0) {
    return null;
  }

  const dateInWorkspaceTimezone = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

  return holidayCalendar.find(holiday => holiday.date === dateInWorkspaceTimezone) || null;
}
