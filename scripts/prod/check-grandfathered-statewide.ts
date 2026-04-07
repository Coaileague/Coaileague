/**
 * scripts/prod/check-grandfathered-statewide.ts
 *
 * PURPOSE: Verify Statewide workspace (GRANDFATHERED_TENANT_ID) is correctly
 *          protected — exempt from billing, no trial countdown, no lockout,
 *          no paid-tenant prompts.
 *
 * READ-ONLY — no mutations whatsoever.
 *
 * Usage:
 *   npx tsx scripts/prod/check-grandfathered-statewide.ts
 */

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DIVIDER = '═'.repeat(60);

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

async function main() {
  console.log('\n' + DIVIDER);
  console.log(' CHECK GRANDFATHERED STATEWIDE PROTECTION');
  console.log(DIVIDER + '\n');

  const tenantId = process.env.GRANDFATHERED_TENANT_ID;
  const ownerId  = process.env.GRANDFATHERED_TENANT_OWNER_ID;

  if (!tenantId) {
    console.error('❌  GRANDFATHERED_TENANT_ID is not set.');
    console.error('    Run scripts/prod/get-statewide-ids.ts first to find the UUID,');
    console.error('    then set the env var and re-run this script.');
    process.exit(1);
  }

  const results: CheckResult[] = [];

  try {
    // 1. Workspace exists
    const wsResult = await pool.query(
      `SELECT id, name, company_name, owner_id, billing_exempt, founder_exemption,
              subscription_tier, account_state, is_suspended, is_locked, is_frozen,
              trial_ends_at, trial_expired_at, workspace_state, subscription_status
       FROM workspaces WHERE id = $1`,
      [tenantId]
    );

    if (wsResult.rows.length === 0) {
      console.error(`❌  No workspace found for GRANDFATHERED_TENANT_ID=${tenantId}`);
      console.error('    Verify this UUID is correct in the production database.');
      process.exit(1);
    }

    const ws = wsResult.rows[0];
    console.log(`Statewide workspace: "${ws.name}" (${ws.id})\n`);

    // 2. Billing exempt flag
    results.push({
      name: 'billing_exempt OR founder_exemption is set',
      pass: !!(ws.billing_exempt || ws.founder_exemption),
      detail: `billing_exempt=${ws.billing_exempt}, founder_exemption=${ws.founder_exemption}`,
    });

    // 3. Not suspended
    results.push({
      name: 'Workspace is NOT suspended',
      pass: !ws.is_suspended,
      detail: `is_suspended=${ws.is_suspended}`,
    });

    // 4. Not locked
    results.push({
      name: 'Workspace is NOT locked',
      pass: !ws.is_locked,
      detail: `is_locked=${ws.is_locked}`,
    });

    // 5. Not frozen
    results.push({
      name: 'Workspace is NOT frozen',
      pass: !ws.is_frozen,
      detail: `is_frozen=${ws.is_frozen}`,
    });

    // 6. Account state is active
    results.push({
      name: 'account_state is active',
      pass: ws.account_state === 'active',
      detail: `account_state=${ws.account_state}`,
    });

    // 7. Subscription status is not suspended/cancelled
    const badStatuses = ['suspended', 'cancelled', 'past_due', 'hard_locked'];
    results.push({
      name: 'subscription_status is not suspended/cancelled',
      pass: !badStatuses.includes(ws.subscription_status),
      detail: `subscription_status=${ws.subscription_status}`,
    });

    // 8. No expired trial
    const trialExpired = ws.trial_expired_at !== null;
    results.push({
      name: 'No expired trial recorded',
      pass: !trialExpired,
      detail: trialExpired ? `trial_expired_at=${ws.trial_expired_at}` : 'trial_expired_at=null (good)',
    });

    // 9. Subscription tier is enterprise (founder tier)
    results.push({
      name: 'subscription_tier is enterprise (expected for founder)',
      pass: ws.subscription_tier === 'enterprise',
      detail: `subscription_tier=${ws.subscription_tier}`,
    });

    // 10. Owner ID matches env var
    if (ownerId) {
      results.push({
        name: 'workspace.owner_id matches GRANDFATHERED_TENANT_OWNER_ID',
        pass: ws.owner_id === ownerId,
        detail: `DB owner_id=${ws.owner_id}, env var=${ownerId}`,
      });
    } else {
      results.push({
        name: 'GRANDFATHERED_TENANT_OWNER_ID is set',
        pass: false,
        detail: 'env var not set',
      });
    }

    // 11. No active billing subscription in Stripe subscriptions table
    const subResult = await pool.query(
      `SELECT status, stripe_subscription_id, trial_ends_at
       FROM subscriptions WHERE workspace_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );

    if (subResult.rows.length > 0) {
      const sub = subResult.rows[0];
      const hasStripeId = !!sub.stripe_subscription_id;
      results.push({
        name: 'No live Stripe subscription ID (founder is not a paying sub)',
        pass: !hasStripeId,
        detail: hasStripeId
          ? `stripe_subscription_id=${sub.stripe_subscription_id} — this should be null for founder`
          : 'stripe_subscription_id=null (correct)',
      });
      results.push({
        name: 'Subscriptions record status is trial or exempt (not past_due)',
        pass: !['past_due', 'suspended', 'cancelled'].includes(sub.status),
        detail: `status=${sub.status}`,
      });
    } else {
      results.push({
        name: 'Subscriptions record exists for workspace',
        pass: false,
        detail: 'No record in subscriptions table — run workspace creation again or seed a trial record',
      });
    }

    // 12. Verify no outbound billing events for this workspace
    const billingEvents = await pool.query(
      `SELECT COUNT(*) as cnt FROM financial_processing_fees WHERE workspace_id = $1`,
      [tenantId]
    );
    const feeCount = parseInt(billingEvents.rows[0].cnt, 10);
    results.push({
      name: 'No financial_processing_fees charged to Statewide',
      pass: feeCount === 0,
      detail: `Found ${feeCount} fee record(s) — should be 0`,
    });

    const revenueEvents = await pool.query(
      `SELECT COUNT(*) as cnt FROM platform_revenue WHERE workspace_id = $1`,
      [tenantId]
    );
    const revCount = parseInt(revenueEvents.rows[0].cnt, 10);
    results.push({
      name: 'No platform_revenue records for Statewide',
      pass: revCount === 0,
      detail: `Found ${revCount} revenue record(s) — should be 0`,
    });

  } finally {
    await pool.end();
  }

  // Print results
  const failures: CheckResult[] = [];
  results.forEach(r => {
    if (r.pass) {
      console.log(`✅  ${r.name}`);
      console.log(`    ${r.detail}\n`);
    } else {
      console.log(`❌  ${r.name}`);
      console.log(`    ${r.detail}\n`);
      failures.push(r);
    }
  });

  console.log(DIVIDER);
  console.log(' SUMMARY');
  console.log(DIVIDER);

  if (failures.length === 0) {
    console.log('\n✅  STATEWIDE PROTECTION: FULLY VERIFIED — all checks pass.\n');
  } else {
    console.log(`\n❌  ${failures.length} protection check(s) FAILED:\n`);
    failures.forEach(f => console.log(`    • ${f.name}`));
    console.log('');
    process.exit(1);
  }

  console.log(DIVIDER + '\n');
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
