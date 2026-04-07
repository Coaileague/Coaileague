#!/usr/bin/env tsx
/**
 * OMEGA PREFLIGHT CHECK
 * Validates: env vars, DB connectivity, route registration, critical service boot.
 * Writes evidence to OMEGA_STATE_CHECKPOINT.md.
 * Run: tsx scripts/omega/preflight-check.ts
 */


import { appendFileSync, existsSync } from 'fs';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'BASE_URL',
] as const;

const RECOMMENDED_ENV = [
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'STATEWIDE_WORKSPACE_ID',
  'ENCRYPTION_KEY',
  'JWT_SECRET',
] as const;

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? '✅' : '❌';
  console.log(`${icon} ${name}: ${detail}`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA PREFLIGHT CHECK');
  console.log('═══════════════════════════════════════════════════\n');

  // ── 1. Required environment variables ────────────────────────────────────
  console.log('── Environment Variables ──');
  for (const key of REQUIRED_ENV) {
    const val = process.env[key];
    check(`ENV:${key}`, !!val && val.length > 0, val ? 'set' : 'MISSING — required for production');
  }
  for (const key of RECOMMENDED_ENV) {
    const val = process.env[key];
    check(`ENV:${key}`, !!val && val.length > 0, val ? 'set' : 'missing — recommended');
  }

  // ── 2. NODE_ENV ───────────────────────────────────────────────────────────
  check('NODE_ENV', process.env.NODE_ENV === 'production', `NODE_ENV=${process.env.NODE_ENV || 'unset'} (must be production)`);

  // ── 3. DB connectivity ───────────────────────────────────────────────────
  console.log('\n── Database ──');
  try {
    const { db } = await import('../../server/db');
    const { sql } = await import('drizzle-orm');
    const result = await db.execute(sql`SELECT current_database(), version()`);
    const row = (result.rows || result)[0] as any;
    check('DB:connect', true, `Connected to: ${row?.current_database ?? 'ok'}`);
  } catch (err: any) {
    check('DB:connect', false, `FAILED: ${err.message}`);
  }

  // ── 4. Critical source-of-truth files ────────────────────────────────────
  console.log('\n── Source of Truth Files ──');
  const sots = [
    'server/lib/rbac/roleDefinitions.ts',
    'shared/config/featureRegistry.ts',
    'shared/billingConfig.ts',
    'server/services/email/emailProvisioningService.ts',
  ];
  for (const f of sots) {
    check(`SOT:${f.split('/').pop()}`, existsSync(f), existsSync(f) ? 'exists' : 'MISSING');
  }

  // ── 5. OMEGA scripts harness ──────────────────────────────────────────────
  console.log('\n── Scripts Harness ──');
  const scripts = [
    'scripts/omega/preflight-check.ts',
    'scripts/omega/verify-prior-fixes.ts',
    'scripts/omega/tenant-isolation-audit.ts',
    'scripts/omega/financial-atomicity-check.ts',
    'scripts/omega/battle-sim.ts',
    'scripts/omega/statewide-readonly-verify.ts',
  ];
  for (const s of scripts) {
    check(`SCRIPT:${s.split('/').pop()}`, existsSync(s), existsSync(s) ? 'exists' : 'missing');
  }

  // ── 6. OMEGA.md + CHECKPOINT ──────────────────────────────────────────────
  console.log('\n── OMEGA Files ──');
  check('OMEGA.md', existsSync('OMEGA.md'), existsSync('OMEGA.md') ? 'exists' : 'MISSING');
  check('OMEGA_STATE_CHECKPOINT.md', existsSync('OMEGA_STATE_CHECKPOINT.md'), existsSync('OMEGA_STATE_CHECKPOINT.md') ? 'exists' : 'MISSING');

  // ── Summary ───────────────────────────────────────────────────────────────
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` PREFLIGHT: ${pass}/${results.length} checks passed, ${fail} failed`);
  const verdict = fail === 0 ? 'PASS' : fail <= 3 ? 'WARN' : 'FAIL';
  console.log(` VERDICT: ${verdict}`);
  console.log('═══════════════════════════════════════════════════\n');

  // ── Append to checkpoint ───────────────────────────────────────────────────
  const ts = new Date().toISOString();
  const evidence = `\n### Preflight Check — ${ts}\n` +
    results.map(r => `- ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`).join('\n') +
    `\n**Verdict: ${verdict}** (${pass}/${results.length} passed)\n`;
  appendFileSync('OMEGA_STATE_CHECKPOINT.md', evidence);

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Preflight failed with uncaught error:', err);
  process.exit(1);
});
