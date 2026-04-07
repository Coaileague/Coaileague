/**
 * Storage Quota Service — Option B: Category-based sub-limits
 *
 * Enforces per-category storage quotas per tier.
 * audit_reserve is a protected floor — uploads to that category are ALWAYS allowed.
 *
 * Three entry points:
 *   checkCategoryQuota()   — call BEFORE uploading, returns allowed/denied + reason
 *   recordStorageUsage()   — call AFTER successful upload to credit the bytes
 *   getStorageUsage()      — returns full category breakdown for dashboard
 *
 * Warning events (idempotent):
 *   emitStorageWarnings()  — fires NDS notification at 80% and 95% total usage,
 *                            each threshold fires at most once until usage drops below it
 */

import { db } from '../../db';
import { storageUsage, storageWarningState } from '@shared/schema';
import { workspaces } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { BILLING } from '@shared/billingConfig';
import { isBillingExcluded } from '../billing/billingConstants';
import { createLogger } from '../../lib/logger';

const log = createLogger('storageQuotaService');

export type StorageCategory = 'email' | 'documents' | 'media' | 'audit_reserve';

export interface QuotaCheckResult {
  allowed: boolean;
  category: StorageCategory;
  usedBytes: number;
  limitBytes: number;
  requestedBytes: number;
  usedPercent: number;
  reason?: string;
}

export interface WorkspaceStorageUsage {
  tier: string;
  categories: Record<StorageCategory, {
    usedBytes: number;
    limitBytes: number;
    usedPercent: number;
    usedGB: string;
    limitGB: string;
  }>;
  totalUsedBytes: number;
  totalLimitBytes: number;
  totalUsedPercent: number;
  overageBytes: Record<StorageCategory, number>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const GB = 1073741824;
const ALL_CATEGORIES: StorageCategory[] = ['email', 'documents', 'media', 'audit_reserve'];

function getTierQuotas(tier: string): Record<StorageCategory, number> | null {
  const key = tier as keyof typeof BILLING.storageQuotas;
  const quotas = BILLING.storageQuotas[key];
  if (!quotas || typeof quotas !== 'object' || !('email' in quotas)) return null;
  return quotas as Record<StorageCategory, number>;
}

async function getWorkspaceTier(workspaceId: string): Promise<string> {
  const [ws] = await db
    .select({ tier: workspaces.subscriptionTier })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return ws?.tier || 'trial';
}

async function getCurrentUsage(workspaceId: string, category: StorageCategory): Promise<number> {
  const [row] = await db
    .select({ bytesUsed: storageUsage.bytesUsed })
    .from(storageUsage)
    .where(and(
      eq(storageUsage.workspaceId, workspaceId),
      eq(storageUsage.category, category),
    ))
    .limit(1);
  return row?.bytesUsed ?? 0;
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Pre-upload check. Call before any file write.
 * Returns { allowed: true } for audit_reserve regardless of quota.
 */
export async function checkCategoryQuota(
  workspaceId: string,
  category: StorageCategory,
  requestedBytes: number,
): Promise<QuotaCheckResult> {
  // Audit reserve is always allowed — protected floor, never blocked
  if (category === 'audit_reserve') {
    const usedBytes = await getCurrentUsage(workspaceId, 'audit_reserve');
    return {
      allowed: true,
      category,
      usedBytes,
      limitBytes: -1,
      requestedBytes,
      usedPercent: 0,
    };
  }

  if (isBillingExcluded(workspaceId)) {
    return { allowed: true, category, usedBytes: 0, limitBytes: -1, requestedBytes, usedPercent: 0 };
  }

  const tier = await getWorkspaceTier(workspaceId);
  const quotas = getTierQuotas(tier);
  if (!quotas) {
    // Unknown tier — allow but log
    log.warn(`[StorageQuota] Unknown tier "${tier}" for workspace ${workspaceId} — allowing upload`);
    return { allowed: true, category, usedBytes: 0, limitBytes: -1, requestedBytes, usedPercent: 0 };
  }

  const limitBytes: number = quotas[category] as number;
  const usedBytes = await getCurrentUsage(workspaceId, category);
  const usedPercent = limitBytes > 0 ? Math.round((usedBytes / limitBytes) * 100) : 0;

  if (usedBytes + requestedBytes > limitBytes) {
    const overGB = ((usedBytes + requestedBytes - limitBytes) / GB).toFixed(2);
    return {
      allowed: false,
      category,
      usedBytes,
      limitBytes,
      requestedBytes,
      usedPercent,
      reason: `${category} quota exceeded — ${(usedBytes / GB).toFixed(2)} GB used of ${(limitBytes / GB).toFixed(2)} GB limit. This upload would exceed by ${overGB} GB. Upgrade your plan or purchase a storage add-on.`,
    };
  }

  return { allowed: true, category, usedBytes, limitBytes, requestedBytes, usedPercent };
}

/**
 * Post-upload accounting. Call after every successful file write.
 * Also triggers idempotent warning notifications at 80% and 95%.
 */
export async function recordStorageUsage(
  workspaceId: string,
  category: StorageCategory,
  bytes: number,
): Promise<void> {
  if (bytes <= 0) return;
  if (isBillingExcluded(workspaceId)) return;

  try {
    // Upsert: INSERT ... ON CONFLICT (workspace_id, category) DO UPDATE bytes_used += bytes
    await db.execute(
      sql`INSERT INTO storage_usage (workspace_id, category, bytes_used, updated_at)
          VALUES (${workspaceId}, ${category}, ${bytes}, NOW())
          ON CONFLICT (workspace_id, category)
          DO UPDATE SET bytes_used = storage_usage.bytes_used + ${bytes}, updated_at = NOW()`
    );

    // Fire threshold warnings asynchronously (non-blocking)
    emitStorageWarnings(workspaceId).catch((err) =>
      log.warn(`[StorageQuota] Warning emit failed for ${workspaceId}:`, err?.message)
    );
  } catch (err: any) {
    log.error(`[StorageQuota] recordStorageUsage failed ws=${workspaceId} cat=${category}:`, err?.message);
  }
}

/**
 * Decrement storage usage after a file is deleted.
 */
export async function releaseStorageUsage(
  workspaceId: string,
  category: StorageCategory,
  bytes: number,
): Promise<void> {
  if (bytes <= 0) return;
  if (isBillingExcluded(workspaceId)) return;
  try {
    await db.execute(
      sql`UPDATE storage_usage
          SET bytes_used = GREATEST(0, bytes_used - ${bytes}), updated_at = NOW()
          WHERE workspace_id = ${workspaceId} AND category = ${category}`
    );
    // Re-check warning thresholds (may need to clear a fired warning)
    emitStorageWarnings(workspaceId).catch(() => null);
  } catch (err: any) {
    log.warn(`[StorageQuota] releaseStorageUsage failed: ${err?.message}`);
  }
}

/**
 * Full category breakdown for the dashboard.
 */
export async function getStorageUsage(workspaceId: string): Promise<WorkspaceStorageUsage> {
  const tier = await getWorkspaceTier(workspaceId);
  const quotas = getTierQuotas(tier) ?? {
    email: 0, documents: 0, media: 0, audit_reserve: 0,
  };

  const rows = await db
    .select({ category: storageUsage.category, bytesUsed: storageUsage.bytesUsed })
    .from(storageUsage)
    .where(eq(storageUsage.workspaceId, workspaceId));

  const usageMap: Record<string, number> = {};
  for (const r of rows) usageMap[r.category] = r.bytesUsed ?? 0;

  const categories = {} as WorkspaceStorageUsage['categories'];
  let totalUsed = 0;
  let totalLimit = 0;
  const overageBytes = {} as Record<StorageCategory, number>;

  for (const cat of ALL_CATEGORIES) {
    const used = usageMap[cat] ?? 0;
    const limit: number = (quotas[cat] as number) ?? 0;
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    categories[cat] = {
      usedBytes: used,
      limitBytes: limit,
      usedPercent: pct,
      usedGB: (used / GB).toFixed(2),
      limitGB: limit > 0 ? (limit / GB).toFixed(2) : '∞',
    };
    if (cat !== 'audit_reserve') {
      totalUsed += used;
      totalLimit += limit;
    }
    overageBytes[cat] = Math.max(0, used - limit);
  }

  return {
    tier,
    categories,
    totalUsedBytes: totalUsed,
    totalLimitBytes: totalLimit,
    totalUsedPercent: totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0,
    overageBytes,
  };
}

/**
 * Idempotent warning events at 80% and 95%.
 * Fires at most once per threshold crossing.
 * Clears the fired state if usage drops below threshold.
 */
export async function emitStorageWarnings(workspaceId: string): Promise<void> {
  try {
    const usage = await getStorageUsage(workspaceId);
    const pct = usage.totalUsedPercent;

    for (const threshold of ['80', '95'] as const) {
      const pctVal = parseInt(threshold);
      const isOver = pct >= pctVal;

      const [existing] = await db
        .select({ id: storageWarningState.id, resetAt: storageWarningState.resetAt })
        .from(storageWarningState)
        .where(and(
          eq(storageWarningState.workspaceId, workspaceId),
          eq(storageWarningState.threshold, threshold),
        ))
        .limit(1);

      if (isOver && !existing) {
        // First crossing — fire warning and record
        await db.execute(
          sql`INSERT INTO storage_warning_state (workspace_id, threshold, fired_at)
              VALUES (${workspaceId}, ${threshold}, NOW())
              ON CONFLICT (workspace_id, threshold) DO NOTHING`
        );

        const [ws] = await db
          .select({ ownerId: workspaces.ownerId })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);

        if (ws?.ownerId) {
          const { NotificationDeliveryService } = await import('../notificationDeliveryService');
          const isCritical = threshold === '95';
          await NotificationDeliveryService.send({
            type: isCritical ? 'critical_system_alert' : 'billing_reminder',
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: isCritical
                ? 'Storage Nearly Full — Immediate Action Required'
                : 'Storage Usage at 80% — Upgrade Recommended',
              message: isCritical
                ? `Your workspace has used ${pct}% of its storage quota. Uploads will be rejected once you hit 100%. Upgrade your plan or purchase a storage add-on to avoid service interruption.`
                : `You have used ${pct}% of your storage quota. Consider upgrading your plan or purchasing a storage add-on to avoid hitting the limit.`,
            },
          }).catch(() => null);
          log.info(`[StorageQuota] Fired ${threshold}% warning for workspace ${workspaceId} (${pct}% used)`);
        }
      } else if (!isOver && existing && !existing.resetAt) {
        // Usage dropped below threshold — clear the warning so it fires again next time
        await db.execute(
          sql`UPDATE storage_warning_state SET reset_at = NOW()
              WHERE workspace_id = ${workspaceId} AND threshold = ${threshold}`
        );
        log.info(`[StorageQuota] Cleared ${threshold}% warning for workspace ${workspaceId} (${pct}% now)`);
      }
    }
  } catch (err: any) {
    log.warn(`[StorageQuota] emitStorageWarnings failed for ${workspaceId}:`, err?.message);
  }
}

/**
 * Calculate total storage overage in GB across all non-audit categories.
 * Used by the billing run to compute what to charge.
 */
export async function calculateStorageOverage(workspaceId: string): Promise<{
  overageGB: number;
  overageBytes: number;
  breakdownGB: Record<string, number>;
}> {
  const usage = await getStorageUsage(workspaceId);
  let totalOverageBytes = 0;
  const breakdownGB: Record<string, number> = {};

  for (const cat of ['email', 'documents', 'media'] as StorageCategory[]) {
    const overBytes = usage.overageBytes[cat] ?? 0;
    if (overBytes > 0) {
      breakdownGB[cat] = parseFloat((overBytes / GB).toFixed(3));
      totalOverageBytes += overBytes;
    }
  }

  return {
    overageGB: parseFloat((totalOverageBytes / GB).toFixed(3)),
    overageBytes: totalOverageBytes,
    breakdownGB,
  };
}

/**
 * Ensure the storage_usage and storage_warning_state tables exist.
 * Called at server startup (idempotent).
 */
export async function ensureStorageTables(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS storage_usage (
        workspace_id VARCHAR NOT NULL,
        category     VARCHAR NOT NULL,
        bytes_used   BIGINT NOT NULL DEFAULT 0,
        updated_at   TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (workspace_id, category)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS storage_warning_state (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR NOT NULL,
        threshold    VARCHAR NOT NULL,
        fired_at     TIMESTAMP DEFAULT NOW(),
        reset_at     TIMESTAMP,
        CONSTRAINT storage_warning_ws_thresh UNIQUE (workspace_id, threshold)
      )
    `);
    log.info('[StorageQuota] Tables ensured (storage_usage, storage_warning_state)');
  } catch (err: any) {
    log.warn('[StorageQuota] ensureStorageTables:', err?.message);
  }
}
