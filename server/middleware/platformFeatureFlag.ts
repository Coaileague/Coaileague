/**
 * PHASE 51 — PLATFORM FEATURE FLAG MIDDLEWARE
 *
 * Checks platform-level feature flags (global, rollout%, tier, workspace-specific).
 * Distinct from workspace-level featureFlags table (per-workspace boolean features).
 *
 * Resolution order:
 * 1. Is flag enabled globally? → allow
 * 2. Is workspace in enabled_for_workspaces list? → allow
 * 3. Is rollout_percentage > 0? → hash workspace ID to [0,100), allow if below threshold
 * 4. Is workspace tier >= minimum_tier? → allow
 * 5. Otherwise → deny
 *
 * Result cached 5-minute TTL per (flagKey × workspaceId).
 */

import { pool } from '../db';

// ─── Cache ────────────────────────────────────────────────────────────────────
interface CachedFlag {
  enabled: boolean;
  expiresAt: number;
}

const flagCache = new Map<string, CachedFlag>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(flagKey: string, workspaceId: string): string {
  return `${flagKey}:${workspaceId}`;
}

// Tier hierarchy for minimum_tier comparisons
const TIER_ORDER: Record<string, number> = {
  basic: 0,
  professional: 1,
  business: 2,
  premium: 3,
  enterprise: 4,
};

/**
 * Hash a workspace ID to a consistent integer in [0, 100).
 * Deterministic: same workspace always lands in the same bucket.
 */
function workspaceHashBucket(workspaceId: string): number {
  let hash = 0;
  for (let i = 0; i < workspaceId.length; i++) {
    hash = (hash * 31 + workspaceId.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 100;
}

/**
 * Check if a platform feature flag is enabled for a given workspace.
 * Result is cached for 5 minutes.
 *
 * @param flagKey   The platform flag key (e.g. 'new_invoice_ui')
 * @param workspaceId  The workspace to check
 * @param workspaceTier  Current workspace tier (for minimum_tier check)
 * @returns true if the feature should be enabled for this workspace
 */
export async function checkPlatformFeatureFlag(
  flagKey: string,
  workspaceId: string,
  workspaceTier = 'basic'
): Promise<boolean> {
  const cacheKey = getCacheKey(flagKey, workspaceId);
  const cached = flagCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;

  try {
    const { rows } = await pool.query(
      `SELECT enabled_globally, enabled_for_workspaces, rollout_percentage, minimum_tier
       FROM platform_feature_flags WHERE flag_key = $1 LIMIT 1`,
      [flagKey]
    );

    if (!rows[0]) {
      // Flag not found → disabled by default
      flagCache.set(cacheKey, { enabled: false, expiresAt: Date.now() + CACHE_TTL_MS });
      return false;
    }

    const flag = rows[0];
    let enabled = false;

    // 1. Global enable
    if (flag.enabled_globally) {
      enabled = true;
    }
    // 2. Workspace-specific allow-list
    else if (flag.enabled_for_workspaces?.includes(workspaceId)) {
      enabled = true;
    }
    // 3. Rollout percentage
    else if (flag.rollout_percentage > 0) {
      const bucket = workspaceHashBucket(workspaceId);
      if (bucket < flag.rollout_percentage) {
        enabled = true;
      }
    }

    // 4. Minimum tier check (additional gate — must meet tier even if above conditions pass)
    if (enabled && flag.minimum_tier && flag.minimum_tier !== 'basic') {
      const requiredTierLevel = TIER_ORDER[flag.minimum_tier] ?? 0;
      const workspaceTierLevel = TIER_ORDER[workspaceTier] ?? 0;
      if (workspaceTierLevel < requiredTierLevel) {
        enabled = false;
      }
    }

    flagCache.set(cacheKey, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  } catch {
    // Fail open on DB error
    return false;
  }
}

/**
 * Invalidate the flag cache for a specific flag (call after admin updates a flag).
 */
export function invalidateFlagCache(flagKey: string): void {
  for (const key of flagCache.keys()) {
    if (key.startsWith(`${flagKey}:`)) flagCache.delete(key);
  }
}

// ─── Admin Management API Helpers ─────────────────────────────────────────────

export async function listPlatformFlags(): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM platform_feature_flags ORDER BY flag_key ASC`
  );
  return rows;
}

export async function upsertPlatformFlag(params: {
  flagKey: string;
  description?: string;
  enabledGlobally?: boolean;
  enabledForWorkspaces?: string[];
  rolloutPercentage?: number;
  minimumTier?: string;
  createdBy?: string;
}): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO platform_feature_flags
       (id, flag_key, description, enabled_globally, enabled_for_workspaces, rollout_percentage, minimum_tier, created_by, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (flag_key) DO UPDATE SET
       description = COALESCE($2, platform_feature_flags.description),
       enabled_globally = COALESCE($3, platform_feature_flags.enabled_globally),
       enabled_for_workspaces = COALESCE($4, platform_feature_flags.enabled_for_workspaces),
       rollout_percentage = COALESCE($5, platform_feature_flags.rollout_percentage),
       minimum_tier = COALESCE($6, platform_feature_flags.minimum_tier),
       updated_at = now()
     RETURNING *`,
    [
      params.flagKey,
      params.description ?? null,
      params.enabledGlobally ?? false,
      params.enabledForWorkspaces ?? [],
      params.rolloutPercentage ?? 0,
      params.minimumTier ?? 'basic',
      params.createdBy ?? null,
    ]
  );
  invalidateFlagCache(params.flagKey);
  return rows[0];
}
