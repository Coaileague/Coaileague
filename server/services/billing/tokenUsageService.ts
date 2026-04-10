/**
 * TOKEN USAGE SERVICE — LAW 14 / CLASS A BLOCKER #17
 * =====================================================
 * Every AI action, email classification, voice interaction, and model API
 * call MUST write to token_usage_log. Untracked token consumption is a
 * billing integrity failure.
 *
 * CORE RULES (from OMEGA.md):
 * - NEVER block execution — always track, never gate
 * - Statewide (founderExemption): track but NEVER alert, NEVER bill, NEVER block
 * - 80% allowance  → NDS warning to org owner
 * - 100% allowance → overage tracking begins (no block)
 * - 200% allowance → NDS critical + flag for platform admin review (no block)
 * - token_usage_monthly is upserted atomically (SQL UPSERT for race safety)
 * - PLATFORM_WORKSPACE_ID is not a tenant workspace — skip monthly tracking
 */

import { db, pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { tokenUsageLog, workspaces, workspaceMembers } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { TOKEN_ALLOWANCES, TOKEN_ALERT_THRESHOLDS, TOKEN_OVERAGE_RATE_CENTS_PER_100K } from '../../../shared/billingConfig';
// founderExemption helper not needed — we read ws.founderExemption directly
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { PLATFORM_WORKSPACE_ID } from './billingConstants';

const log = createLogger('tokenUsageService');

export interface RecordTokenUsageParams {
  workspaceId: string;
  userId?: string | null;
  sessionId?: string | null;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
  actionType: string;
  featureName?: string | null;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getCurrentMonthYear(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getTokenAllowance(tier: string): number | null {
  return (TOKEN_ALLOWANCES as Record<string, number | null>)[tier] ?? TOKEN_ALLOWANCES['trial'] ?? 500_000;
}

async function getOrgOwnerUserId(workspaceId: string): Promise<string | null> {
  try {
    const [owner] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, 'org_owner'),
      ))
      .limit(1);
    return owner?.userId ?? null;
  } catch {
    return null;
  }
}

async function fireTokenAlert(
  workspaceId: string,
  level: 'warning' | 'critical',
  percentUsed: number,
  tokensUsed: number,
  allowance: number,
): Promise<void> {
  try {
    const ownerId = await getOrgOwnerUserId(workspaceId);
    if (!ownerId) return;

    const monthYear = getCurrentMonthYear();
    if (level === 'warning') {
      await NotificationDeliveryService.send({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        type: 'token_usage_warning',
        workspaceId,
        recipientUserId: ownerId,
        channel: 'in_app',
        subject: 'AI Token Allowance: 80% Used',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        body: `You have used ${percentUsed.toFixed(0)}% of your monthly AI token allowance. ` +
              `Overage billing applies beyond your limit of ${allowance.toLocaleString()} tokens.`,
        idempotencyKey: `token-warn-80-${workspaceId}-${monthYear}`,
      });
    } else {
      await NotificationDeliveryService.send({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        type: 'token_usage_critical',
        workspaceId,
        recipientUserId: ownerId,
        channel: 'in_app',
        subject: 'AI Token Allowance: 200% — Critical',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        body: `Your workspace has consumed ${percentUsed.toFixed(0)}% of your monthly AI token allowance ` +
              `(${tokensUsed.toLocaleString()} tokens used, allowance: ${allowance.toLocaleString()}). ` +
              `Overages are billed at $2.00 per 100,000 tokens. This workspace has been flagged for admin review.`,
        idempotencyKey: `token-critical-200-${workspaceId}-${monthYear}`,
      });
    }
  } catch (err: any) {
    log.warn('[TokenUsageService] Failed to fire token alert — non-blocking', { workspaceId, level, err: err?.message });
  }
}

// ============================================================================
// UPSERT token_usage_monthly — atomic SQL UPSERT for race safety
// Uses pool.query() directly for reliable complex SQL execution.
// ============================================================================
async function upsertMonthlyUsage(
  workspaceId: string,
  tokensTotal: number,
  allowance: number | null,
): Promise<{ totalTokensUsed: number; overageTokens: number; percentUsed: number }> {
  const monthYear = getCurrentMonthYear();
  const allowanceValue = allowance ?? 0;
  const overagePricePer100k = TOKEN_OVERAGE_RATE_CENTS_PER_100K ?? 200;

  // Use explicit ::bigint casts to resolve PostgreSQL "operator is not unique" for numeric params
  const tokensInt = Math.floor(tokensTotal);
  const allowanceInt = Math.floor(allowanceValue);
  const overageRate = Math.floor(overagePricePer100k);

  await pool.query(
    `INSERT INTO token_usage_monthly
       (id, workspace_id, month_year, total_tokens_used, allowance_tokens,
        overage_tokens, overage_amount_cents, status, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1::text, $2::text, $3::bigint, $4::bigint,
        GREATEST(0, $3::bigint - $4::bigint),
        GREATEST(0, CEIL(($3::numeric - $4::numeric) / 100000.0) * $5::bigint),
        'pending', NOW(), NOW())
     ON CONFLICT (workspace_id, month_year)
     DO UPDATE SET
       total_tokens_used    = token_usage_monthly.total_tokens_used + $3::bigint,
       allowance_tokens     = $4::bigint,
       overage_tokens       = GREATEST(0, token_usage_monthly.total_tokens_used + $3::bigint - $4::bigint),
       overage_amount_cents = GREATEST(0, CEIL(
                                (token_usage_monthly.total_tokens_used + $3::bigint - $4::bigint)::numeric
                                / 100000.0
                              ) * $5::bigint),
       updated_at           = NOW()`,
    [workspaceId, monthYear, tokensInt, allowanceInt, overageRate],
  );

  const result = await pool.query(
    `SELECT total_tokens_used, overage_tokens
     FROM token_usage_monthly
     WHERE workspace_id = $1 AND month_year = $2`,
    [workspaceId, monthYear],
  );

  const row = result.rows[0];
  const totalTokensUsed = Number(row?.total_tokens_used ?? tokensTotal);
  const overageTokens = Number(row?.overage_tokens ?? 0);
  const percentUsed = allowanceValue > 0 ? (totalTokensUsed / allowanceValue) * 100 : 0;

  return { totalTokensUsed, overageTokens, percentUsed };
}

// ============================================================================
// PRIMARY EXPORT — recordTokenUsage
// NEVER throws. All errors are caught and logged. Safe to fire-and-forget.
// ============================================================================
export async function recordTokenUsage(params: RecordTokenUsageParams): Promise<void> {
  const {
    workspaceId,
    userId,
    sessionId,
    modelUsed,
    tokensInput,
    tokensOutput,
    actionType,
    featureName,
  } = params;

  if (!workspaceId || !modelUsed || !actionType) {
    log.warn('[TokenUsageService] Missing required params — skipping token write', { workspaceId, modelUsed, actionType });
    return;
  }

  const tokensTotal = (tokensInput || 0) + (tokensOutput || 0);

  // STEP 1: Append to token_usage_log (append-only)
  try {
    await db.insert(tokenUsageLog).values({
      workspaceId,
      sessionId: sessionId ?? null,
      userId: userId ?? null,
      modelUsed,
      tokensInput: tokensInput || 0,
      tokensOutput: tokensOutput || 0,
      tokensTotal,
      actionType,
      featureName: featureName ?? null,
    });
  } catch (err: any) {
    log.error(`[TokenUsageService] Failed to write token_usage_log — non-blocking: ${err?.message}`, { workspaceId, actionType });
    return;
  }

  // STEP 2: Platform workspace check — not a real tenant, skip monthly tracking + alerts
  if (workspaceId === PLATFORM_WORKSPACE_ID || workspaceId === 'coaileague-platform-workspace') {
    log.info('[TokenUsageService] Platform workspace: log written, skipping monthly tracking', { workspaceId, tokensTotal });
    return;
  }

  // STEP 3: Fetch workspace record for tier + founderExemption check
  // IMPORTANT: billingExempt = skip Stripe charges (not token tracking)
  //            founderExemption = skip alerts + billing (grandfathered tenant only)
  let isFounderExempt = false;
  let tier = 'trial';
  try {
    const [ws] = await db
      .select({
        subscriptionTier: workspaces.subscriptionTier,
        founderExemption: workspaces.founderExemption,
        billingExempt: workspaces.billingExempt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (ws) {
      tier = ws.subscriptionTier ?? 'trial';
      // Only founderExemption (grandfathered tenant) suppresses alerts.
      // billingExempt alone (sandbox/dev) still gets monthly tracking but no Stripe charges.
      isFounderExempt = !!(ws?.founderExemption);
    }
  } catch (err: any) {
    log.warn(`[TokenUsageService] Could not fetch workspace tier — defaulting to trial, no alerts: ${err?.message}`, { workspaceId });
  }

  // STEP 4: Upsert token_usage_monthly (always, even for billingExempt sandboxes)
  // founderExempt workspaces get null allowance (track with no cap/alert)
  const allowance = isFounderExempt ? null : getTokenAllowance(tier);
  let usageStats: { totalTokensUsed: number; overageTokens: number; percentUsed: number } | null = null;
  try {
    usageStats = await upsertMonthlyUsage(workspaceId, tokensTotal, allowance);
  } catch (err: any) {
    log.error(`[TokenUsageService] Failed to upsert token_usage_monthly — non-blocking: ${err?.message}`, { workspaceId });
    return;
  }

  // STEP 5: founderExemption guard — Statewide: track but NEVER alert, NEVER bill
  if (isFounderExempt) {
    log.info('[TokenUsageService] Founder-exempt workspace: tracked, no alerts/billing', { workspaceId, tokensTotal, tier });
    return;
  }

  if (!allowance || !usageStats) return;

  const { percentUsed, totalTokensUsed } = usageStats;

  // STEP 6: Threshold alerts — NEVER block, always track
  try {
    if (percentUsed >= TOKEN_ALERT_THRESHOLDS.adminFlagPercent) {
      await fireTokenAlert(workspaceId, 'critical', percentUsed, totalTokensUsed, allowance);
      log.warn(`[TokenUsageService] Token usage at 200%+ — flagged for admin review`, { workspaceId, percentUsed, tier });
    } else if (percentUsed >= TOKEN_ALERT_THRESHOLDS.warningPercent) {
      await fireTokenAlert(workspaceId, 'warning', percentUsed, totalTokensUsed, allowance);
    }
  } catch (err: any) {
    log.warn(`[TokenUsageService] Alert dispatch failed — non-blocking: ${err?.message}`, { workspaceId });
  }
}

// ============================================================================
// ASYNC FIRE-AND-FORGET WRAPPER
// Use this from finalizeBilling() to never delay the AI execution path.
// ============================================================================
export function recordTokenUsageAsync(params: RecordTokenUsageParams): void {
  recordTokenUsage(params).catch((err: any) => {
    log.error(`[TokenUsageService] Unhandled error in async token write: ${err?.message}`, { workspaceId: params.workspaceId });
  });
}
