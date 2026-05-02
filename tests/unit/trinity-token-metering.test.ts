/**
 * UNIT TESTS — Phase 16A: Trinity Token Metering
 *
 * Tests the pure business-logic functions that power
 * trinityTokenMeteringService.ts. Functions are defined inline here
 * (matching the project's unit-test pattern) so the test module never
 * touches server/db.ts or any I/O layer.
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror of billingConstants.isBillingExcluded (no DB dependency) ─────────

const NON_BILLING_IDS = new Set([
  'coaileague-platform-workspace',
  'system',
  'PLATFORM_SUPPORT_POOL',
  'platform',
  'platform-system',
  'platform-unattributed',
  'PLATFORM_COST_CENTER',
]);

function isBillingExcluded(workspaceId: string | null | undefined): boolean {
  if (!workspaceId) return true;
  return NON_BILLING_IDS.has(workspaceId);
}

// ─── Mirror of the token-cost table from trinityTokenMeteringService ─────────

type TokenModel = 'claude' | 'gemini' | 'openai' | 'pinecone';

const TOKEN_COSTS: Record<TokenModel, number> = {
  claude: 0.003,    // $3 per 1M tokens
  gemini: 0.0005,   // $0.50 per 1M tokens
  openai: 0.002,    // $2 per 1M tokens
  pinecone: 0.10,   // $0.10 per 1K vector queries
};

function calculateTokenCost(tokens: number, model: TokenModel): number {
  return (tokens / 1000) * TOKEN_COSTS[model];
}

// GRANDFATHERED_TENANT_ID comes from env — undefined in test env (safe)
const GRANDFATHERED_TENANT_ID = process.env.GRANDFATHERED_TENANT_ID || null;

function isFreeForTrinity(workspaceId: string | null | undefined): boolean {
  if (isBillingExcluded(workspaceId)) return true;
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return true;
  return false;
}

function getTrinityBillingStatus(workspaceId: string): 'free' | 'billable' | 'grandfathered' {
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return 'grandfathered';
  if (isBillingExcluded(workspaceId)) return 'free';
  return 'billable';
}

// ─── Free-Tenancy Detection ──────────────────────────────────────────────────

describe('isFreeForTrinity', () => {
  it('returns true for the platform workspace', () => {
    expect(isFreeForTrinity('coaileague-platform-workspace')).toBe(true);
  });

  it('returns true for the system workspace', () => {
    expect(isFreeForTrinity('system')).toBe(true);
  });

  it('returns true for PLATFORM_SUPPORT_POOL', () => {
    expect(isFreeForTrinity('PLATFORM_SUPPORT_POOL')).toBe(true);
  });

  it('returns true for legacy platform aliases', () => {
    expect(isFreeForTrinity('platform')).toBe(true);
    expect(isFreeForTrinity('platform-system')).toBe(true);
    expect(isFreeForTrinity('platform-unattributed')).toBe(true);
    expect(isFreeForTrinity('PLATFORM_COST_CENTER')).toBe(true);
  });

  it('returns false for a regular tenant workspace', () => {
    expect(isFreeForTrinity('some-tenant-workspace-id')).toBe(false);
  });

  it('returns true for null (safe guard via isBillingExcluded)', () => {
    expect(isFreeForTrinity(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isFreeForTrinity(undefined)).toBe(true);
  });
});

// ─── Cost Calculation ────────────────────────────────────────────────────────

describe('calculateTokenCost', () => {
  it('calculates Claude cost at $3 per 1M tokens', () => {
    expect(calculateTokenCost(1_000_000, 'claude')).toBeCloseTo(3.0, 4);
  });

  it('calculates Gemini cost at $0.50 per 1M tokens', () => {
    expect(calculateTokenCost(1_000_000, 'gemini')).toBeCloseTo(0.5, 4);
  });

  it('calculates OpenAI cost at $2 per 1M tokens', () => {
    expect(calculateTokenCost(1_000_000, 'openai')).toBeCloseTo(2.0, 4);
  });

  it('calculates Pinecone cost at $0.10 per 1K queries (1K queries = $0.10)', () => {
    // Rate is 0.10 per-1K, so 1K queries = $0.10
    expect(calculateTokenCost(1_000, 'pinecone')).toBeCloseTo(0.10, 4);
  });

  it('returns 0 for zero tokens', () => {
    expect(calculateTokenCost(0, 'claude')).toBe(0);
  });

  it('scales linearly — 1000 tokens = cost-per-1k rate', () => {
    expect(calculateTokenCost(1000, 'claude')).toBeCloseTo(TOKEN_COSTS.claude, 6);
  });

  it('scales linearly — 1500 tokens = 1.5× the 1000-token cost', () => {
    const base = calculateTokenCost(1000, 'gemini');
    const larger = calculateTokenCost(1500, 'gemini');
    expect(larger).toBeCloseTo(base * 1.5, 6);
  });
});

// ─── Billing Status Label ─────────────────────────────────────────────────────

describe('getTrinityBillingStatus', () => {
  it('returns "free" for platform workspace', () => {
    expect(getTrinityBillingStatus('coaileague-platform-workspace')).toBe('free');
  });

  it('returns "free" for system workspace', () => {
    expect(getTrinityBillingStatus('system')).toBe('free');
  });

  it('returns "billable" for a standard tenant', () => {
    expect(getTrinityBillingStatus('acme-security-tenant-xyz')).toBe('billable');
  });

  it('returns "billable" for a newly created workspace', () => {
    expect(getTrinityBillingStatus('new-ws-abc123')).toBe('billable');
  });
});

// ─── TOKEN_COSTS contract ─────────────────────────────────────────────────────

describe('TOKEN_COSTS', () => {
  const models: TokenModel[] = ['claude', 'gemini', 'openai', 'pinecone'];

  it('has a positive rate for every supported model', () => {
    for (const model of models) {
      expect(TOKEN_COSTS[model]).toBeGreaterThan(0);
    }
  });

  it('claude is more expensive per token than gemini', () => {
    expect(TOKEN_COSTS.claude).toBeGreaterThan(TOKEN_COSTS.gemini);
  });
});

// ─── Billing decision integration ────────────────────────────────────────────

describe('shouldBill + cost decision', () => {
  function decideBilling(workspaceId: string, tokens: number, model: TokenModel) {
    const shouldBill = !isFreeForTrinity(workspaceId);
    const cost = shouldBill ? calculateTokenCost(tokens, model) : 0;
    return { shouldBill, cost };
  }

  it('billable tenant is charged for Claude tokens', () => {
    const { shouldBill, cost } = decideBilling('tenant-abc', 1500, 'claude');
    expect(shouldBill).toBe(true);
    expect(cost).toBeCloseTo(0.0045, 5); // 1.5 × 0.003
  });

  it('platform workspace pays $0', () => {
    const { shouldBill, cost } = decideBilling('coaileague-platform-workspace', 1_000_000, 'claude');
    expect(shouldBill).toBe(false);
    expect(cost).toBe(0);
  });

  it('system workspace pays $0', () => {
    const { shouldBill, cost } = decideBilling('system', 500_000, 'gemini');
    expect(shouldBill).toBe(false);
    expect(cost).toBe(0);
  });
});
