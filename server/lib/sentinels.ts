/**
 * Platform Sentinel Identifiers
 *
 * Well-known IDs that exist on every CoAIleague deployment by design.
 * Centralized here so the literal strings appear exactly once in the
 * codebase. Per TRINITY.md Section I (Multi-Tenant Universalization),
 * any literal ID outside this file is a bug.
 *
 * Sentinels are NOT tenant identifiers — they are platform-level
 * fixtures: the root admin user, the platform workspace, system actors
 * like Trinity and HelpAI. They are seeded by productionSeed.ts and
 * referenced by privacy masks, RBAC bypasses, and audit attribution.
 */

/** Well-known root admin user ID — seeded by productionSeed.ts */
export const ROOT_USER_SENTINEL_ID = 'root-user-00000000';

/** System actor identifiers that bypass per-user privacy masking and RBAC */
export const SYSTEM_ACTOR_IDS = [
  ROOT_USER_SENTINEL_ID,
  'trinity',
  'system',
  'support',
] as const;

/**
 * Returns true if the given user ID is a platform-level sentinel rather
 * than a real workspace user. Use this in any code path that needs to
 * grant or restrict access to system actors.
 */
export function isPlatformSentinelUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return SYSTEM_ACTOR_IDS.includes(userId as any);
}
