/**
 * scripts/prod/post-config-smoke.ts
 *
 * PURPOSE: Final smoke test — run AFTER you have set all env vars and DNS.
 *          Verifies health endpoint, CORS, Statewide exemption, billing,
 *          inbound email routes, and prints a "launch blockers remaining" tally.
 *
 * READ-ONLY — no mutations.
 *
 * Usage:
 *   npx tsx scripts/prod/post-config-smoke.ts
 *   # Or via npm: npm run prod:finalize
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DIVIDER = '═'.repeat(60);

interface SmokeResult {
  name: string;
  pass: boolean;
  detail: string;
  blocker: boolean;
}

function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function getLocalServerUrl(): string {
  return 'http://localhost:5000';
}

async function main() {
  console.log('\n' + DIVIDER);
  console.log(' POST-CONFIG SMOKE TEST');
  console.log(DIVIDER + '\n');

  const results: SmokeResult[] = [];
  const baseUrl = getLocalServerUrl();
  const tenantId = process.env.GRANDFATHERED_TENANT_ID;
  const ownerId = process.env.GRANDFATHERED_TENANT_OWNER_ID;
  const allowedOrigins = process.env.ALLOWED_ORIGINS;

  // ── 1. Health endpoint returns 200 and status=healthy ─────────────────────
  try {
    const { status, body } = await httpGet(`${baseUrl}/health`);
    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch {}
    const isHealthy = status === 200 && parsed.status === 'healthy';
    results.push({
      name: 'Health endpoint returns HTTP 200 with status=healthy',
      pass: isHealthy,
      detail: `HTTP ${status} | status="${parsed.status}" | nds=${parsed.nds} | trinity=${parsed.trinity} | queueWorkers=${parsed.queueWorkers}`,
      blocker: true,
    });

    if (parsed.status === 'healthy') {
      results.push({
        name: 'NDS (Notification Delivery Service) is healthy',
        pass: !!parsed.nds,
        detail: `nds=${parsed.nds}`,
        blocker: false,
      });
      results.push({
        name: 'Trinity AI is healthy',
        pass: !!parsed.trinity,
        detail: `trinity=${parsed.trinity}`,
        blocker: false,
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Health endpoint reachable',
      pass: false,
      detail: `Cannot reach ${baseUrl}/health — ${err.message}`,
      blocker: true,
    });
  }

  // ── 2. CORS origin is configured ─────────────────────────────────────────
  results.push({
    name: 'ALLOWED_ORIGINS env var is set',
    pass: !!allowedOrigins,
    detail: allowedOrigins
      ? `ALLOWED_ORIGINS=${allowedOrigins}`
      : 'Not set — CORS falls back to Replit domain patterns (not fully locked down)',
    blocker: true,
  });

  if (allowedOrigins) {
    const hasHttps = allowedOrigins.startsWith('https://');
    results.push({
      name: 'ALLOWED_ORIGINS starts with https://',
      pass: hasHttps,
      detail: hasHttps ? 'OK' : `"${allowedOrigins}" should start with https://`,
      blocker: false,
    });
  }

  // ── 3. Statewide env vars are set ────────────────────────────────────────
  results.push({
    name: 'GRANDFATHERED_TENANT_ID is set',
    pass: !!tenantId,
    detail: tenantId ? `Set (${tenantId.substring(0, 8)}...)` : 'MISSING — Statewide has no billing shield',
    blocker: true,
  });

  results.push({
    name: 'GRANDFATHERED_TENANT_OWNER_ID is set',
    pass: !!ownerId,
    detail: ownerId ? `Set (${ownerId.substring(0, 8)}...)` : 'MISSING',
    blocker: true,
  });

  // ── 4. Statewide exemption is active in DB ────────────────────────────────
  if (tenantId) {
    try {
      const wsResult = await pool.query(
        `SELECT billing_exempt, founder_exemption, account_state, subscription_tier
         FROM workspaces WHERE id = $1`,
        [tenantId]
      );
      if (wsResult.rows.length > 0) {
        const ws = wsResult.rows[0];
        const exempt = !!(ws.billing_exempt || ws.founder_exemption);
        results.push({
          name: 'Statewide workspace has billing exemption in DB',
          pass: exempt,
          detail: `billing_exempt=${ws.billing_exempt}, founder_exemption=${ws.founder_exemption}, tier=${ws.subscription_tier}`,
          blocker: true,
        });
        results.push({
          name: 'Statewide account_state=active',
          pass: ws.account_state === 'active',
          detail: `account_state=${ws.account_state}`,
          blocker: true,
        });
      } else {
        results.push({
          name: 'Statewide workspace found in DB',
          pass: false,
          detail: `No workspace found for ID ${tenantId}`,
          blocker: true,
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Statewide DB check',
        pass: false,
        detail: `DB error: ${err.message}`,
        blocker: true,
      });
    }
  }

  // ── 5. Inbound email routes exist ────────────────────────────────────────
  const resendWebhookFile = path.join(process.cwd(), 'server/routes/resendWebhooks.ts');
  if (fs.existsSync(resendWebhookFile)) {
    const content = fs.readFileSync(resendWebhookFile, 'utf8');
    results.push({
      name: 'Inbound email route /api/webhooks/resend/inbound registered',
      pass: content.includes('/api/webhooks/resend/inbound'),
      detail: content.includes('/api/webhooks/resend/inbound') ? 'Route present in code' : 'Route NOT found',
      blocker: false,
    });
  }

  // ── 6. Stripe live keys configured ───────────────────────────────────────
  const stripeKey = process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
  results.push({
    name: 'Stripe live secret key is set',
    pass: stripeKey.startsWith('sk_live_'),
    detail: stripeKey.startsWith('sk_live_')
      ? `sk_live_... (${stripeKey.substring(0, 12)}...)`
      : stripeKey.startsWith('sk_test_')
        ? 'Using TEST key — switch to sk_live_ before go-live'
        : 'No Stripe key found',
    blocker: true,
  });

  // ── 7. Twilio configured ─────────────────────────────────────────────────
  results.push({
    name: 'TWILIO_PHONE_NUMBER_SID is set',
    pass: !!process.env.TWILIO_PHONE_NUMBER_SID,
    detail: process.env.TWILIO_PHONE_NUMBER_SID
      ? process.env.TWILIO_PHONE_NUMBER_SID
      : 'Not set — set to PN1a8a6a40ffab11a8b4d1b71203a7261a',
    blocker: false,
  });

  // ── 8. NODE_ENV=production ────────────────────────────────────────────────
  results.push({
    name: 'NODE_ENV=production',
    pass: process.env.NODE_ENV === 'production',
    detail: `NODE_ENV=${process.env.NODE_ENV}`,
    blocker: true,
  });

  // ── 9. No missing required env vars ──────────────────────────────────────
  const requiredVars = ['SESSION_SECRET', 'JWT_SECRET', 'DATABASE_URL', 'RESEND_API_KEY'];
  const missingRequired = requiredVars.filter(v => !process.env[v]);
  results.push({
    name: 'Core env vars all set (SESSION_SECRET, JWT_SECRET, DATABASE_URL, RESEND_API_KEY)',
    pass: missingRequired.length === 0,
    detail: missingRequired.length === 0 ? 'All set' : `Missing: ${missingRequired.join(', ')}`,
    blocker: true,
  });

  await pool.end();

  // ── Print all results ─────────────────────────────────────────────────────
  const blockers: SmokeResult[] = [];
  const warnings: SmokeResult[] = [];

  results.forEach(r => {
    if (r.pass) {
      console.log(`✅  ${r.name}`);
      console.log(`    ${r.detail}\n`);
    } else if (r.blocker) {
      console.log(`❌  ${r.name}`);
      console.log(`    ${r.detail}\n`);
      blockers.push(r);
    } else {
      console.log(`⚠️   ${r.name}`);
      console.log(`    ${r.detail}\n`);
      warnings.push(r);
    }
  });

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n' + DIVIDER);
  console.log(' LAUNCH BLOCKERS REMAINING');
  console.log(DIVIDER);

  if (blockers.length === 0) {
    console.log('\n🚀  ALL CLEAR — No launch blockers remaining.\n');
    console.log('    You are ready to go live.\n');
  } else {
    console.log(`\n❌  ${blockers.length} BLOCKER(S) — resolve before going live:\n`);
    blockers.forEach((b, i) => console.log(`    ${i + 1}. ${b.name}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️   ${warnings.length} non-blocking item(s) to address soon:\n`);
    warnings.forEach(w => console.log(`    • ${w.name}`));
    console.log('');
  }

  console.log(DIVIDER + '\n');
  process.exit(blockers.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
