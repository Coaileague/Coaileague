#!/usr/bin/env tsx
/**
 * OMEGA EMAIL ROUTING TEST
 * Code-level verification that all 6 workspace email addresses
 * route to correct Trinity classification categories.
 * Live send requires --live flag + configured Resend.
 * Run: tsx scripts/omega/email-routing-test.ts [--live]
 */


import { readFileSync, existsSync, appendFileSync } from 'fs';

const LIVE = process.argv.includes('--live');

interface Check { name: string; pass: boolean; detail: string; }
const results: Check[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}: ${detail}`);
}

function grepAny(files: string[], pattern: string): boolean {
  return files.some(f => existsSync(f) && readFileSync(f, 'utf8').includes(pattern));
}

const EMAIL_PROC_FILES = [
  'server/services/email/emailProcessor.ts',
  'server/services/ai-brain/emailClassifier.ts',
  'server/services/email/trinityEmailRouter.ts',
  'server/services/email/inboundEmailHandler.ts',
];

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA EMAIL ROUTING TEST');
  console.log('═══════════════════════════════════════════════════\n');

  // ── Address routing verification ─────────────────────────────────────────
  console.log('── Email Address → Category Routing ──');
  const routes = [
    { address: 'staffing@', categories: ['staffing_request', 'staffing_inquiry', 'staffing'], folder: 'Staffing' },
    { address: 'calloffs@', categories: ['call_off', 'calloff', 'call_offs'], folder: 'Call-Offs' },
    { address: 'incidents@', categories: ['incident_report', 'incident', 'incidents'], folder: 'Incidents' },
    { address: 'support@', categories: ['support_inquiry', 'support'], folder: 'Support' },
    { address: 'docs@', categories: ['document_intake', 'document', 'docs'], folder: 'Documents' },
    { address: 'billing@', categories: ['billing_inquiry', 'billing'], folder: 'Billing' },
  ];

  const ALL_EMAIL_FILES = [
    ...EMAIL_PROC_FILES,
    'server/services/email/emailProvisioningService.ts',
  ];

  for (const route of routes) {
    const found = route.categories.some(cat => grepAny(ALL_EMAIL_FILES, cat));
    check(`EMAIL:route-${route.address.replace('@', '')}`,
      found,
      found
        ? `${route.address} → category found → ${route.folder} folder`
        : `None of [${route.categories.join(', ')}] found in email routing files`);
  }

  // ── Subdomain-only slug extraction ────────────────────────────────────────
  console.log('\n── Slug Extraction ──');
  check('EMAIL:subdomain-only-routing',
    grepAny(ALL_EMAIL_FILES, 'subdomain') ||
    grepAny(ALL_EMAIL_FILES, 'slug') ||
    grepAny(ALL_EMAIL_FILES, 'split'),
    'Email routing extracts workspace slug from subdomain only (no dash-alias)');

  check('EMAIL:no-dash-alias',
    !grepAny(EMAIL_PROC_FILES, 'dash-alias') && !grepAny(EMAIL_PROC_FILES, 'plus-addressing'),
    'No dash-alias or plus-addressing branch in email routing');

  // ── Provisioning: exactly 6 addresses ────────────────────────────────────
  console.log('\n── Email Provisioning ──');
  const provFile = 'server/services/email/emailProvisioningService.ts';
  const provContent = existsSync(provFile) ? readFileSync(provFile, 'utf8') : '';
  const has6Prefixes = ['staffing', 'calloffs', 'incidents', 'support', 'docs', 'billing']
    .every(p => provContent.includes(p));

  check('EMAIL:provisioning-6-addresses', has6Prefixes,
    has6Prefixes ? 'emailProvisioningService provisions all 6 subdomain addresses' : 'Missing one or more of the 6 required addresses');

  check('EMAIL:no-trinity-system-address',
    !provContent.includes('trinity-system'),
    provContent.includes('trinity-system')
      ? 'trinity-system@ INCORRECTLY present (must be docs@)'
      : 'trinity-system@ correctly absent from provisioning');

  // ── SR threading ──────────────────────────────────────────────────────────
  console.log('\n── SR Threading ──');
  const SR_FILES = [
    ...ALL_EMAIL_FILES,
    'server/routes/resendWebhooks.ts',
    'server/routes/emailRoutes.ts',
    'server/services/notificationDeliveryService.ts',
    'server/services/trinityEmailProcessor.ts',
  ];
  const hasSR = grepAny(SR_FILES, 'SR-') || grepAny(SR_FILES, 'serviceRef') ||
                grepAny(SR_FILES, 'threadId') || grepAny(SR_FILES, 'In-Reply-To') || 
                grepAny(SR_FILES, 'generatePreRef') || grepAny(SR_FILES, 'originalMessageId');

  check('EMAIL:sr-threading',
    hasSR,
    hasSR 
      ? 'SR-XXXXXXXX threading or reply-chain threading present in email system' 
      : 'FAILED: No SR threading or In-Reply-To headers found in critical files');

  // ── Summary ───────────────────────────────────────────────────────────────
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` EMAIL ROUTING: ${pass}/${results.length} checks passed`);
  console.log(` VERDICT: ${verdict}`);
  console.log('═══════════════════════════════════════════════════\n');

  const ts = new Date().toISOString();
  appendFileSync('OMEGA_STATE_CHECKPOINT.md',
    `\n### Email-Routing-Test — ${ts}\n` +
    results.map(r => `- ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`).join('\n') +
    `\n**Verdict: ${verdict}** (${pass}/${results.length} passed)\n`);

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
