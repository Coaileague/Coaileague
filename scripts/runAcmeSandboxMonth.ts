#!/usr/bin/env tsx
/**
 * ACME Sandbox Month — CLI Entrypoint
 * ====================================
 * Standalone runner so you can drive the full ACME simulation without
 * bringing up the Express server. Persists everything to the same DB +
 * artifact directory the in-process /api/sandbox/acme/run endpoint uses,
 * so logging in afterwards (as the regulatory auditor) shows the same
 * world.
 *
 * Usage:
 *   npx tsx scripts/runAcmeSandboxMonth.ts
 *
 * Environment knobs:
 *   SANDBOX_AUDITOR_EMAIL     override default inspector email
 *   SANDBOX_AUDITOR_PASSWORD  override default inspector password
 *   PLAID_ENV                 default 'sandbox'
 *   EMAIL_SIMULATION_MODE     'true' to mute outbound mail
 *   STRIPE_WEBHOOK_SECRET     used by the in-process Stripe handler
 */

import { runAcmeMonthSimulation } from '../server/services/sandbox/acmeMonthOrchestrator';
import { formatTelemetryAsLog } from '../server/services/sandbox/acmeChaosRunner';

async function main() {
  // Force email/SMS to simulation mode for safety. The platform's email
  // service already gates real sends behind isProduction(), but we set
  // this explicitly so the run is reproducible across machines.
  process.env.EMAIL_SIMULATION_MODE = process.env.EMAIL_SIMULATION_MODE || 'true';
  process.env.PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

  console.log('\n============================================');
  console.log('ACME Sandbox Month — Simulation harness');
  console.log('============================================\n');
  console.log(`PLAID_ENV              = ${process.env.PLAID_ENV}`);
  console.log(`EMAIL_SIMULATION_MODE  = ${process.env.EMAIL_SIMULATION_MODE}`);
  console.log(`STRIPE_WEBHOOK_SECRET  = ${process.env.STRIPE_WEBHOOK_SECRET ? 'set' : 'not set (handler will skip signature verify)'}`);
  console.log();

  const result = await runAcmeMonthSimulation();

  console.log('\n' + formatTelemetryAsLog(result.telemetry));

  console.log('\n---------- ARTIFACTS WRITTEN ----------');
  for (const a of result.artifacts) {
    console.log(`  [${a.artifactType.padEnd(14)}] ${a.title}`);
    console.log(`     disk : ${a.diskPath}`);
    console.log(`     api  : ${a.publicUrl}`);
  }

  console.log('\n---------- REGULATORY AUDITOR LOGIN ----------');
  console.log(`  email     : ${result.auditor.email}`);
  console.log(`  password  : ${result.auditor.password}`);
  console.log(`  loginUrl  : ${result.auditor.loginUrl}`);
  console.log(`  auditId   : ${result.auditor.auditId}`);
  console.log(`  notes     : ${result.auditor.notes.join('; ')}`);

  console.log('\n---------- TELEMETRY FILES ----------');
  console.log(`  log  : ${result.telemetryFiles.logPath}`);
  console.log(`  json : ${result.telemetryFiles.jsonPath}`);

  console.log(`\nDuration: ${result.durationMs} ms`);
  console.log(`Verdict : ${result.telemetry.verdict}`);
  console.log();

  // Exit non-zero so CI catches gaps, but never break in INSUFFICIENT_DATA
  // (that just means the seed didn't have what the chaos tests need yet).
  if (result.telemetry.verdict === 'GAPS_FOUND') process.exit(2);
  process.exit(0);
}

main().catch((err) => {
  console.error('[ACME] simulation failed:', err);
  process.exit(1);
});
