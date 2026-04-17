/**
 * Phase 17C — Trinity Workflow Orchestration Verification Tests
 * =============================================================
 * Static-data simulation suite covering every fix shipped on
 * `claude/test-trinity-workflows-ev4nK`:
 *
 *   1. Amount-threshold approval gate (financialApprovalThresholds)
 *   2. Workspace-scoped advisory lock key derivation
 *   3. Sensitive-key redaction in logActionAudit
 *   4. End-to-end registry shape (createInvoice → addLineItems →
 *      sendInvoice 3-step chain via the executor)
 *
 * Tests are pure-function / deterministic — no DB connections, no
 * network. They exercise the helpers and contract surfaces directly
 * with simulated payloads.
 */

import { describe, it, expect } from 'vitest';
import {
  requiresFinancialApproval,
  actorMeetsApprovalRequirement,
  DEFAULT_FINANCIAL_THRESHOLDS,
} from '../../server/services/ai-brain/financialApprovalThresholds';

// ─── Audit 3 — Amount-threshold approval gate ────────────────────────────────

describe('Phase 17C / Audit 3 — financialApprovalThresholds', () => {
  it('auto-approves a $3,000 invoice (below manager threshold)', () => {
    const decision = requiresFinancialApproval(3_000);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.requiredRole).toBeNull();
    expect(decision.riskLevel).toBe('medium');
  });

  it('auto-approves a $100 invoice as low risk', () => {
    const decision = requiresFinancialApproval(100);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.riskLevel).toBe('low');
  });

  it('requires manager approval for a $7,500 invoice', () => {
    const decision = requiresFinancialApproval(7_500);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.requiredRole).toBe('manager');
    expect(decision.riskLevel).toBe('high');
    expect(decision.threshold).toBe(DEFAULT_FINANCIAL_THRESHOLDS.managerThreshold);
  });

  it('requires owner approval for a $15,000 invoice', () => {
    const decision = requiresFinancialApproval(15_000);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.requiredRole).toBe('org_owner');
    expect(decision.riskLevel).toBe('high');
  });

  it('requires sysop approval for a $75,000 invoice', () => {
    const decision = requiresFinancialApproval(75_000);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.requiredRole).toBe('sysop');
    expect(decision.riskLevel).toBe('critical');
  });

  it('treats numeric strings the same as numbers', () => {
    expect(requiresFinancialApproval('7500').requiredRole).toBe('manager');
    expect(requiresFinancialApproval('75000').requiredRole).toBe('sysop');
  });

  it('ignores zero and non-finite amounts', () => {
    expect(requiresFinancialApproval(0).requiresApproval).toBe(false);
    expect(requiresFinancialApproval(null).requiresApproval).toBe(false);
    expect(requiresFinancialApproval(undefined).requiresApproval).toBe(false);
    expect(requiresFinancialApproval('not-a-number').requiresApproval).toBe(false);
  });

  it('respects per-call threshold overrides', () => {
    const decision = requiresFinancialApproval(2_000, { managerThreshold: 1_000 });
    expect(decision.requiresApproval).toBe(true);
    expect(decision.requiredRole).toBe('manager');
  });
});

describe('Phase 17C / Audit 3 — actorMeetsApprovalRequirement', () => {
  it('returns true when no requirement', () => {
    expect(actorMeetsApprovalRequirement('staff', null)).toBe(true);
  });

  it('returns false when actor missing and approval needed', () => {
    expect(actorMeetsApprovalRequirement(undefined, 'manager')).toBe(false);
  });

  it('staff cannot approve manager-required action', () => {
    expect(actorMeetsApprovalRequirement('staff', 'manager')).toBe(false);
  });

  it('manager can approve manager-required action', () => {
    expect(actorMeetsApprovalRequirement('manager', 'manager')).toBe(true);
  });

  it('org_owner can approve manager-required action (hierarchy)', () => {
    expect(actorMeetsApprovalRequirement('org_owner', 'manager')).toBe(true);
  });

  it('manager cannot approve sysop-required action', () => {
    expect(actorMeetsApprovalRequirement('manager', 'sysop')).toBe(false);
  });

  it('sysop can approve sysop-required action', () => {
    expect(actorMeetsApprovalRequirement('sysop', 'sysop')).toBe(true);
  });

  it('root_admin can approve any required role', () => {
    expect(actorMeetsApprovalRequirement('root_admin', 'sysop')).toBe(true);
    expect(actorMeetsApprovalRequirement('root_admin', 'org_owner')).toBe(true);
    expect(actorMeetsApprovalRequirement('root_admin', 'manager')).toBe(true);
  });
});

// ─── Audit 4 — Workspace-scoped advisory lock keys ───────────────────────────

// Replicate the inline helper that ships in `payrollSubagent.ts` so we can
// validate its determinism + collision properties without spinning up the
// subagent (which pulls in DB modules).
const PAYROLL_AUTO_CLOSE_BASE = 1006;
function payrollLockKeyFor(workspaceId: string): number {
  let h = 0;
  for (let i = 0; i < workspaceId.length; i++) {
    h = (h * 31 + workspaceId.charCodeAt(i)) | 0;
  }
  return (PAYROLL_AUTO_CLOSE_BASE * 100000) + (Math.abs(h) % 100000);
}

describe('Phase 17C / Audit 4 — workspace-scoped advisory lock keys', () => {
  it('produces a stable key for the same workspaceId', () => {
    const k1 = payrollLockKeyFor('37a04d24-51bd-4856-9faa-d26a2fe82094');
    const k2 = payrollLockKeyFor('37a04d24-51bd-4856-9faa-d26a2fe82094');
    expect(k1).toBe(k2);
  });

  it('produces different keys for different workspaces', () => {
    const a = payrollLockKeyFor('workspace-a');
    const b = payrollLockKeyFor('workspace-b');
    expect(a).not.toBe(b);
  });

  it('keeps keys inside positive 32-bit safe range', () => {
    const samples = [
      'workspace-a',
      'workspace-b',
      '37a04d24-51bd-4856-9faa-d26a2fe82094',
      'acme-security-services',
      '🔒-emoji-workspace',
    ];
    for (const ws of samples) {
      const k = payrollLockKeyFor(ws);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(2 ** 31);
    }
  });

  it('does not collide with reserved single-purpose LOCK_KEYS slots (1–100)', () => {
    // Workspace lock keys live in the 1006_xxxxx range; never touch low-N reserved keys.
    for (const ws of ['a', 'b', 'c', 'd', 'e']) {
      expect(payrollLockKeyFor(ws)).toBeGreaterThan(100);
    }
  });

  it('hashes 1000 random workspace ids without runaway collisions', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      seen.add(payrollLockKeyFor(`ws-${i}-${Math.random()}`));
    }
    // Worst-case 100k slots; 1000 random insertions into 100k buckets should yield
    // ~995+ unique keys (birthday paradox). We accept ≥990 to keep the test stable.
    expect(seen.size).toBeGreaterThanOrEqual(990);
  });
});

// ─── Audit 6 — Sensitive-key redaction in logActionAudit ─────────────────────

import { logActionAudit, type ActionAuditInput } from '../../server/services/ai-brain/actionAuditLogger';

// Hijack `db.insert(...).values(...)` so the test never touches Postgres but
// captures the row that the helper *would* persist.
import * as dbModule from '../../server/db';

interface CapturedInsert { table: any; values: any }
function installInsertCapture(): { rows: CapturedInsert[]; restore: () => void } {
  const original = (dbModule as any).db.insert;
  const rows: CapturedInsert[] = [];
  (dbModule as any).db.insert = (table: any) => ({
    values: async (values: any) => {
      rows.push({ table, values });
      return undefined;
    },
  });
  return {
    rows,
    restore: () => { (dbModule as any).db.insert = original; },
  };
}

describe('Phase 17C / Audit 6 — actionAuditLogger.logActionAudit', () => {
  it('persists a sanitised row for a successful mutation', async () => {
    const cap = installInsertCapture();
    try {
      const input: ActionAuditInput = {
        actionId: 'billing.invoice_create',
        workspaceId: 'ws-1',
        userId: 'user-1',
        userRole: 'manager',
        platformRole: null,
        entityType: 'invoice',
        entityId: 'inv-123',
        success: true,
        message: 'Invoice created',
        payload: { clientId: 'c-1', token: 'super-secret-token', password: 'leakme' },
        durationMs: 42,
      };
      await logActionAudit(input);
      expect(cap.rows).toHaveLength(1);
      const row = cap.rows[0]!.values;
      expect(row.action).toBe('action:billing.invoice_create');
      expect(row.success).toBe(true);
      expect(row.entityType).toBe('invoice');
      expect(row.entityId).toBe('inv-123');
      expect(row.payload.clientId).toBe('c-1');
      expect(row.payload.token).toBe('[REDACTED]');
      expect(row.payload.password).toBe('[REDACTED]');
      expect(row.metadata.durationMs).toBe(42);
      expect(row.actorType).toBe('trinity');
    } finally {
      cap.restore();
    }
  });

  it('persists a row for a failed mutation with errorMessage', async () => {
    const cap = installInsertCapture();
    try {
      await logActionAudit({
        actionId: 'compliance.escalate',
        workspaceId: 'ws-2',
        userId: 'user-9',
        success: false,
        errorMessage: 'service unavailable',
        durationMs: 17,
      });
      expect(cap.rows).toHaveLength(1);
      const row = cap.rows[0]!.values;
      expect(row.success).toBe(false);
      expect(row.errorMessage).toBe('service unavailable');
      expect(row.actorType).toBe('trinity');
    } finally {
      cap.restore();
    }
  });

  it('redacts deeply nested ssn / credit_card keys', async () => {
    const cap = installInsertCapture();
    try {
      await logActionAudit({
        actionId: 'employees.create',
        workspaceId: 'ws-3',
        success: true,
        payload: {
          name: 'Test',
          identity: { ssn: '111-22-3333', credit_card: '4111111111111111' },
          nested: { deep: { auth: 'Bearer xxx' } },
        },
      });
      const row = cap.rows[0]!.values;
      expect(row.payload.name).toBe('Test');
      expect(row.payload.identity.ssn).toBe('[REDACTED]');
      expect(row.payload.identity.credit_card).toBe('[REDACTED]');
      expect(row.payload.nested.deep.auth).toBe('[REDACTED]');
    } finally {
      cap.restore();
    }
  });

  it('does not throw when db.insert fails (non-fatal)', async () => {
    const original = (dbModule as any).db.insert;
    (dbModule as any).db.insert = () => ({
      values: async () => { throw new Error('db down'); },
    });
    try {
      await expect(logActionAudit({
        actionId: 'time_tracking.clock_out_officer',
        workspaceId: 'ws-4',
        success: true,
      })).resolves.toBeUndefined();
    } finally {
      (dbModule as any).db.insert = original;
    }
  });
});

// ─── Audit 1 — End-to-end multi-step invoice workflow contract ───────────────

describe('Phase 17C / Audit 1 — invoice 3-step workflow shape', () => {
  it('all three step actions are registered with helpaiOrchestrator', async () => {
    const { helpaiOrchestrator } = await import('../../server/services/helpai/platformActionHub');
    // actionRegistry registers create + add_line_items via its constructor.
    await import('../../server/services/ai-brain/actionRegistry');
    // trinityInvoiceEmailActions exposes an explicit register fn (not auto-run on import).
    const { registerInvoiceEmailActions } = await import(
      '../../server/services/ai-brain/trinityInvoiceEmailActions'
    );
    if (!helpaiOrchestrator.getAction('billing.invoice_send')) {
      registerInvoiceEmailActions();
    }

    expect(helpaiOrchestrator.getAction('billing.invoice_create')).toBeDefined();
    expect(helpaiOrchestrator.getAction('billing.invoice_add_line_items')).toBeDefined();
    expect(helpaiOrchestrator.getAction('billing.invoice_send')).toBeDefined();
  });

  it('billing.invoice_add_line_items has the required role guard', async () => {
    const { helpaiOrchestrator } = await import('../../server/services/helpai/platformActionHub');
    await import('../../server/services/ai-brain/actionRegistry');
    const handler = helpaiOrchestrator.getAction('billing.invoice_add_line_items');
    expect(handler).toBeDefined();
    expect(handler!.requiredRoles).toContain('manager');
    expect(handler!.requiredRoles).toContain('owner');
  });

  it('billing.invoice_add_line_items rejects items on a non-draft invoice (status guard)', async () => {
    // Patch the underlying Drizzle db object in place — the action handler
    // captures `db` once at module load, so we mutate the live singleton
    // rather than the ESM namespace.
    const { db: liveDb } = await import('../../server/db');
    const originalSelect = (liveDb as any).select;
    const originalTransaction = (liveDb as any).transaction;
    (liveDb as any).select = () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'inv-1', workspaceId: 'ws-1', status: 'sent', total: '500' }],
        }),
      }),
    });
    (liveDb as any).transaction = async (fn: any) => fn({
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    });

    try {
      const { helpaiOrchestrator } = await import('../../server/services/helpai/platformActionHub');
      await import('../../server/services/ai-brain/actionRegistry');
      const handler = helpaiOrchestrator.getAction('billing.invoice_add_line_items');
      expect(handler).toBeDefined();
      const result = await handler!.handler({
        actionId: 'billing.invoice_add_line_items',
        category: 'invoicing',
        name: 'Add Invoice Line Items',
        description: '',
        // bypassForSystemActor: true is set inside the handler; system-actor
        // detection treats null userId as system, so we send userId: null.
        payload: {
          invoiceId: 'inv-1',
          items: [{ description: 'Patrol', quantity: '5', unitPrice: '50' }],
        },
        workspaceId: 'ws-1',
        userId: null as any,
        userRole: 'manager',
        platformRole: null,
        priority: 'normal' as any,
        requiresConfirmation: false,
        isTestMode: true,
        metadata: {},
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain("status 'sent'");
    } finally {
      (liveDb as any).select = originalSelect;
      (liveDb as any).transaction = originalTransaction;
    }
  });
});

// ─── Audit 3 — Amount-threshold gate is enforced inside billing.invoice_create ─

describe('Phase 17C / Audit 3 — amount threshold enforced by billing.invoice_create', () => {
  it('refuses a $7,500 invoice from a staff actor (manager threshold)', async () => {
    const { db: liveDb } = await import('../../server/db');
    const originalInsert = (liveDb as any).insert;
    (liveDb as any).insert = () => ({
      values: () => ({ returning: async () => [{ id: 'inv-new' }] }),
    });

    try {
      const { helpaiOrchestrator } = await import('../../server/services/helpai/platformActionHub');
      await import('../../server/services/ai-brain/actionRegistry');
      const handler = helpaiOrchestrator.getAction('billing.invoice_create');
      expect(handler).toBeDefined();
      const result = await handler!.handler({
        actionId: 'billing.invoice_create',
        category: 'invoicing',
        name: 'Create Invoice',
        description: '',
        payload: { clientId: 'c-1', amount: 7500 },
        workspaceId: 'ws-1',
        userId: null as any,
        userRole: 'staff',
        platformRole: null,
        priority: 'normal' as any,
        requiresConfirmation: false,
        isTestMode: true,
        metadata: {},
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Approval required');
      expect(result.message).toContain('manager');
    } finally {
      (liveDb as any).insert = originalInsert;
    }
  });

  it('allows a $7,500 invoice when actor is org_owner (above manager threshold)', async () => {
    const { db: liveDb } = await import('../../server/db');
    const originalInsert = (liveDb as any).insert;
    let capturedInsert: any = null;
    (liveDb as any).insert = (table: any) => ({
      values: (vals: any) => ({
        returning: async () => {
          capturedInsert = { table, vals };
          return [{ id: 'inv-new', ...vals }];
        },
      }),
    });

    try {
      const { helpaiOrchestrator } = await import('../../server/services/helpai/platformActionHub');
      await import('../../server/services/ai-brain/actionRegistry');
      const handler = helpaiOrchestrator.getAction('billing.invoice_create');
      const result = await handler!.handler({
        actionId: 'billing.invoice_create',
        category: 'invoicing',
        name: 'Create Invoice',
        description: '',
        payload: { clientId: 'c-1', amount: 7500 },
        workspaceId: 'ws-1',
        userId: null as any,
        userRole: 'org_owner',
        platformRole: null,
        priority: 'normal' as any,
        requiresConfirmation: false,
        isTestMode: true,
        metadata: {},
      });
      expect(result.success).toBe(true);
      expect(capturedInsert).not.toBeNull();
    } finally {
      (liveDb as any).insert = originalInsert;
    }
  });
});
