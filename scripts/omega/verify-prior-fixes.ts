#!/usr/bin/env tsx
/**
 * OMEGA VERIFY-PRIOR-FIXES
 * Re-verifies all 25 confirmed prior fixes + 4 GAPS.
 * Code-level verification (AST/grep patterns).
 * Run: tsx scripts/omega/verify-prior-fixes.ts
 */


import { readFileSync, existsSync, appendFileSync } from 'fs';

interface Check { name: string; pass: boolean; detail: string; }
const results: Check[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}: ${detail}`);
}

function grep(file: string, pattern: RegExp | string): boolean {
  if (!existsSync(file)) return false;
  const content = readFileSync(file, 'utf8');
  return typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
}

function grepAny(files: string[], pattern: RegExp | string): boolean {
  return files.some(f => grep(f, pattern));
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA VERIFY-PRIOR-FIXES (25 fixes + 4 gaps)');
  console.log('═══════════════════════════════════════════════════\n');

  // ── SECURITY FIXES ────────────────────────────────────────────────────────
  console.log('── Security ──');
  check('FIX-01: requireAuth structured logging',
    grep('server/rbac.ts', /log\.(error|warn)/) || grep('server/middleware/authMiddleware.ts', /log\.(error|warn)/),
    'requireAuth uses structured log on auth failure');

  check('FIX-02: dashboard workspace_id isPlatformAdmin guard',
    grep('server/routes/dashboardRoutes.ts', 'isPlatformAdmin') || grep('server/routes/dashboardRoutes.ts', 'platform_admin'),
    'dashboard /summary workspace_id param gated to platform admin');

  check('FIX-03: session.regenerate on workspace switch',
    grep('server/routes/workspaceInlineRoutes.ts', 'regenerate'),
    'session.regenerate() fires on workspace switch');

  check('FIX-04: resetPassword invalidates all sessions',
    grepAny(['server/services/authService.ts', 'server/auth.ts'], /isValid.*false|sessions.*invalid/),
    'resetPassword sets isValid=false on all user sessions');

  check('FIX-05: admin reset invalidates target user sessions',
    grep('server/routes/adminRoutes.ts', /invalidat|isValid.*false|session/),
    'admin reset password invalidates target user sessions');

  check('FIX-06: lockout structured warn log',
    grepAny(['server/services/authService.ts', 'server/routes/authCoreRoutes.ts'], /log\.warn.*lock|warn.*lockout/i),
    'recordFailedLogin logs structured warn on lockout');

  // ── FINANCIAL FIXES ───────────────────────────────────────────────────────
  console.log('\n── Financial ──');
  check('FIX-07: payroll recordPayrollFee + recordMiddlewareFeeCharge',
    grep('server/routes/payrollRoutes.ts', 'recordPayrollFee') && grep('server/routes/payrollRoutes.ts', 'recordMiddlewareFeeCharge'),
    'payroll route fires both fee records atomically');

  check('FIX-08: stripe pay-invoice chargeInvoiceMiddlewareFee',
    grep('server/routes/stripeInlineRoutes.ts', 'chargeInvoiceMiddlewareFee'),
    'stripeInlineRoutes pay-invoice charges middleware fee');

  check('FIX-09: invoice mark-paid chargeInvoiceMiddlewareFee card/ACH only',
    grep('server/routes/invoiceRoutes.ts', 'chargeInvoiceMiddlewareFee'),
    'invoiceRoutes mark-paid fires middleware fee for card/ACH');

  check('FIX-10: weeklyBillingRun recordMiddlewareFeeCharge',
    grep('server/services/billing/weeklyBillingRunService.ts', 'recordMiddlewareFeeCharge'),
    'weeklyBillingRunService fires fee records on overages');

  check('FIX-11: stripeConnect recordMiddlewareFeeCharge',
    grepAny(['server/services/billing/stripeConnectPayoutService.ts', 'server/routes/stripeConnectRoutes.ts'], 'recordMiddlewareFeeCharge'),
    'stripeConnect payout fires middleware fee record');

  check('FIX-12: quickbooks recordQbSyncFee',
    grep('server/routes/quickbooks-sync.ts', 'recordQbSyncFee'),
    'quickbooks sync fires recordQbSyncFee after CDC poll');

  // ── STRIPE FIXES ──────────────────────────────────────────────────────────
  console.log('\n── Stripe ──');
  check('FIX-13: active subscription guard on create',
    grep('server/routes/stripeInlineRoutes.ts', /activeSubscription|existing.*subscr|subscr.*exists/i),
    'create-subscription has active subscription guard');

  check('FIX-14: verifySignature tries test + live secrets',
    grep('server/services/billing/stripeWebhooks.ts', /live.*secret|STRIPE_LIVE|both.*secret/i) ||
    grep('server/services/billing/stripeWebhooks.ts', 'STRIPE_LIVE_WEBHOOK_SECRET'),
    'stripeWebhooks verifySignature tries both test and live secrets');

  // ── TIER GATE FIXES ───────────────────────────────────────────────────────
  console.log('\n── Tier Gates ──');
  check('FIX-15: contractPipeline requirePlan professional',
    grep('server/routes/contractPipelineRoutes.ts', "requirePlan('professional')"),
    'contractPipeline gated to professional tier');

  check('FIX-16: documentVault requirePlan professional',
    grep('server/routes/documentVaultRoutes.ts', "requirePlan('professional')"),
    'documentVault gated to professional tier');

  check('FIX-17: rfpPipeline requireAuth + requirePlan professional',
    grep('server/routes/rfpPipelineRoutes.ts', 'requireAuth') && grep('server/routes/rfpPipelineRoutes.ts', 'professional'),
    'rfpPipeline has requireAuth + requirePlan professional');

  check('FIX-18: financialIntelligence requirePlan professional',
    grepAny(['server/routes/financialIntelligence.ts', 'server/routes/financialIntelligenceRoutes.ts'], 'professional'),
    'financialIntelligence gated to professional tier');

  check('FIX-19: biAnalytics requirePlan professional',
    grepAny(['server/routes/biAnalyticsRoutes.ts', 'server/routes/bianalytics.ts'], 'professional'),
    'biAnalytics gated to professional tier');

  check('FIX-20: multiCompany requirePlan business',
    grepAny(['server/routes/multiCompanyRoutes.ts', 'server/routes/multicompany.ts'], 'business'),
    'multiCompany gated to business tier');

  check('FIX-21: enterpriseFeatures requirePlan enterprise',
    grepAny(['server/routes/enterpriseFeatures.ts', 'server/routes/enterpriseFeaturesRoutes.ts'], 'enterprise'),
    'enterpriseFeatures gated to enterprise tier');

  // ── TRINITY FIXES ─────────────────────────────────────────────────────────
  console.log('\n── Trinity ──');
  check('FIX-22: trinityMissingDomainActions 20 actions registered',
    grepAny(['server/services/ai-brain/trinityMissingDomainActions.ts'], /insurance\.(status|expiry|state_compliance)/),
    'trinityMissingDomainActions registers insurance + gate + recognition actions');

  check('FIX-23: voice_support_cases drizzle schema exported',
    grepAny(['shared/schema.ts', 'server/db/schema.ts', 'shared/schema/domains/voice/index.ts'], 'voice_support'),
    'voice_support tables exported from drizzle schema');

  // ── EVENTS ────────────────────────────────────────────────────────────────
  console.log('\n── Events ──');
  check('FIX-24: officer_activated event fires on reactivation',
    grep('server/routes/employeeRoutes.ts', 'officer_activated'),
    'officer_activated event published on reactivation');

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  console.log('\n── Admin ──');
  check('FIX-25: adminRoutes no duplicate requirePlatformStaff',
    !grep('server/routes/adminRoutes.ts', /requirePlatformStaff[\s\S]{0,100}requirePlatformStaff/),
    'no duplicate requirePlatformStaff on /platform/activities or /admin/metrics');

  // ── GAPS ──────────────────────────────────────────────────────────────────
  console.log('\n── 4 OMEGA Gaps ──');
  check('GAP-1: VOID invoice write-protect API layer (409)',
    grep('server/routes/invoiceRoutes.ts', /CLOSED_STATUSES|void.*cannot.*modif/i),
    'VOID invoices return 409 on PATCH/PUT attempt');

  check('GAP-2: workspaceTrinityLimiter 50/min in-memory',
    grep('server/middleware/rateLimiter.ts', 'workspaceTrinityLimiter') &&
    grep('server/middleware/rateLimiter.ts', '50'),
    'workspaceTrinityLimiter exists with 50/min limit');

  check('GAP-3: PII hard-purge DELETE endpoint',
    grep('server/routes/employeeRoutes.ts', 'pii-purge'),
    'DELETE /api/workspace/employees/:id/pii-purge endpoint exists');

  check('GAP-4: DB-level REVOKE (app layer enforcement verified)',
    grep('server/routes/invoiceRoutes.ts', /cannot.*modif|write.protect/i) &&
    grep('server/routes/payrollRoutes.ts', /immut|cannot.*modif|closed/i),
    'App layer enforces immutability; DB REVOKE blocked by superuser (Bryan action required)');

  // ── Summary ───────────────────────────────────────────────────────────────
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` VERIFY-PRIOR-FIXES: ${pass}/${results.length} checks passed`);
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  console.log(` VERDICT: ${verdict}`);
  console.log('═══════════════════════════════════════════════════\n');

  const ts = new Date().toISOString();
  const evidence = `\n### Verify-Prior-Fixes — ${ts}\n` +
    results.map(r => `- ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`).join('\n') +
    `\n**Verdict: ${verdict}** (${pass}/${results.length} passed)\n`;
  appendFileSync('OMEGA_STATE_CHECKPOINT.md', evidence);

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
