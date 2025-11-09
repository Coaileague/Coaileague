/**
 * Scheduling Utilities for Autonomous Automation
 * 
 * Provides anchor-based biweekly calculations to fix month-boundary drift.
 * All dates are handled in UTC unless specified otherwise.
 */

import { startOfDay, differenceInCalendarDays, addDays, subDays } from 'date-fns';

/**
 * Check if a biweekly job should run today based on anchor date
 * 
 * @param anchor - The anchor date (last successful run or initial seed date)
 * @param targetDayOfWeek - Configured day of week (0=Sunday, 6=Saturday)
 * @param today - Today's date (defaults to now)
 * @returns true if the job should run today
 */
export function shouldRunBiweekly(
  anchor: Date | null | undefined,
  targetDayOfWeek: number,
  today: Date = new Date()
): boolean {
  // Guard: Anchor must be set
  if (!anchor) {
    console.log('   ⚠️  Biweekly anchor not set - skipping');
    return false;
  }

  // Normalize dates to start of day (UTC)
  const todayStart = startOfDay(today);
  const anchorStart = startOfDay(anchor);

  // Guard: Anchor in future - reset needed (edge case)
  if (anchorStart > todayStart) {
    console.log('   ⚠️  Biweekly anchor is in the future - needs reset');
    return false;
  }

  // Guard: Check day of week matches
  const todayDayOfWeek = todayStart.getDay();
  if (todayDayOfWeek !== targetDayOfWeek) {
    return false;
  }

  // Calculate weeks since anchor
  const daysSinceAnchor = differenceInCalendarDays(todayStart, anchorStart);
  const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);

  // Run on even weeks (0, 2, 4, 6...)
  const shouldRun = weeksSinceAnchor % 2 === 0;

  // Log for debugging
  if (shouldRun) {
    console.log(`   ✅ Biweekly match: ${daysSinceAnchor} days / ${weeksSinceAnchor} weeks since anchor`);
  }

  return shouldRun;
}

/**
 * Seed an anchor date for a biweekly schedule
 * 
 * Seeds anchor 14 days before the most recent occurrence of the target weekday.
 * This ensures the first biweekly run happens on the very next occurrence (not delayed 2 weeks).
 * 
 * Example: If today is Tuesday and target is Monday:
 * - Most recent Monday is 1 day ago
 * - Anchor is set to 15 days ago (1 + 14)
 * - Next Monday is 7 days from last Monday = week 2 since anchor (even, will run) ✓
 * 
 * @param targetDayOfWeek - Configured day of week (0=Sunday, 6=Saturday)
 * @param referenceDate - Date to seed from (defaults to today)
 * @returns The calculated anchor date
 */
export function seedAnchor(
  targetDayOfWeek: number,
  referenceDate: Date = new Date()
): Date {
  const refStart = startOfDay(referenceDate);
  const refDayOfWeek = refStart.getDay();

  // Calculate days to subtract to reach target weekday
  let daysToSubtract = refDayOfWeek - targetDayOfWeek;
  if (daysToSubtract < 0) {
    daysToSubtract += 7; // Go back to previous week
  }

  // Seed 14 days before most recent occurrence to ensure next occurrence runs
  const anchor = subDays(refStart, daysToSubtract + 14);
  
  console.log(`   🌱 Seeding biweekly anchor: ${anchor.toISOString()} (target weekday: ${targetDayOfWeek})`);
  console.log(`   (Seeded 2 weeks back so next occurrence runs immediately)`);
  
  return anchor;
}

/**
 * Advance an anchor date by 14 days (2 weeks)
 * 
 * Called after successful biweekly job execution to prepare for next run.
 * 
 * @param currentAnchor - Current anchor date
 * @returns New anchor date (14 days forward)
 */
export function advanceAnchor(currentAnchor: Date): Date {
  const newAnchor = addDays(currentAnchor, 14);
  console.log(`   📅 Advancing biweekly anchor: ${currentAnchor.toISOString()} → ${newAnchor.toISOString()}`);
  return newAnchor;
}

/**
 * Detect if an anchor has drifted too far from expected schedule
 * 
 * Logs a warning if the anchor is more than 30 days behind today.
 * This helps identify workspaces with stale automation.
 * 
 * @param anchor - The anchor date to check
 * @param today - Today's date (defaults to now)
 * @returns true if drift detected
 */
export function detectAnchorDrift(
  anchor: Date | null | undefined,
  today: Date = new Date()
): boolean {
  if (!anchor) return false;

  const todayStart = startOfDay(today);
  const anchorStart = startOfDay(anchor);
  const daysBehind = differenceInCalendarDays(todayStart, anchorStart);

  if (daysBehind > 30) {
    console.log(`   ⚠️  DRIFT DETECTED: Anchor is ${daysBehind} days behind (>30 days)`);
    return true;
  }

  return false;
}
