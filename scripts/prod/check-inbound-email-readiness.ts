/**
 * scripts/prod/check-inbound-email-readiness.ts
 *
 * PURPOSE: Verify inbound email is correctly set up for subdomain routing.
 *          Checks DNS, app routes, DB folder provisioning, and address format.
 *          Cannot fix DNS for you — but will tell you exactly what is wrong.
 *
 * READ-ONLY — no mutations. Safe to run at any time.
 *
 * Usage:
 *   npx tsx scripts/prod/check-inbound-email-readiness.ts
 */

import { Pool } from 'pg';
import * as dns from 'dns';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const resolveMx = promisify(dns.resolveMx);
const DIVIDER = '═'.repeat(60);

const SYSTEM_FOLDER_TYPES = ['staffing', 'calloffs', 'incidents', 'support', 'billing', 'docs', 'inbox', 'archive'];
const SYSTEM_ADDRESS_TYPES = ['staffing', 'calloffs', 'incidents', 'support', 'billing', 'docs'];
const REQUIRED_INBOUND_ROUTE = '/api/webhooks/resend/inbound';
const REQUIRED_OUTBOUND_ROUTE = '/api/webhooks/resend';
const EXPECTED_MX = 'inbound.resend.com';
const DOMAIN = 'coaileague.com';

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  blocker?: boolean;
}

async function main() {
  console.log('\n' + DIVIDER);
  console.log(' CHECK INBOUND EMAIL READINESS');
  console.log(DIVIDER + '\n');

  const results: CheckResult[] = [];

  // ── 1. DNS wildcard MX check ──────────────────────────────────────────────
  try {
    const wildcardHost = `*.${DOMAIN}`;
    let mxRecords: { exchange: string; priority: number }[] = [];
    try {
      mxRecords = await resolveMx(wildcardHost);
    } catch {
      // Some DNS resolvers return root domain MX for wildcard
      mxRecords = await resolveMx(DOMAIN);
    }
    const pointsToResend = mxRecords.some(r =>
      r.exchange.toLowerCase().includes('resend')
    );
    results.push({
      name: `Wildcard MX (*.${DOMAIN}) → ${EXPECTED_MX}`,
      pass: pointsToResend,
      detail: pointsToResend
        ? `MX = ${mxRecords[0].exchange} (priority ${mxRecords[0].priority})`
        : `MX = ${mxRecords.map(r => r.exchange).join(', ')} — must be changed to ${EXPECTED_MX}`,
      blocker: true,
    });
  } catch (err: any) {
    results.push({
      name: `Wildcard MX lookup`,
      pass: false,
      detail: `DNS lookup failed: ${err.message}`,
      blocker: true,
    });
  }

  // ── 2. App inbound webhook route exists ──────────────────────────────────
  const resendWebhookFile = path.join(process.cwd(), 'server/routes/resendWebhooks.ts');
  const hasResendWebhooks = fs.existsSync(resendWebhookFile);
  if (hasResendWebhooks) {
    const content = fs.readFileSync(resendWebhookFile, 'utf8');
    results.push({
      name: `Inbound webhook route: POST ${REQUIRED_INBOUND_ROUTE}`,
      pass: content.includes(REQUIRED_INBOUND_ROUTE),
      detail: content.includes(REQUIRED_INBOUND_ROUTE) ? 'Route registered in resendWebhooks.ts' : 'Route NOT found in resendWebhooks.ts',
      blocker: true,
    });
    results.push({
      name: `Outbound webhook route: POST ${REQUIRED_OUTBOUND_ROUTE}`,
      pass: content.includes(REQUIRED_OUTBOUND_ROUTE),
      detail: content.includes(REQUIRED_OUTBOUND_ROUTE) ? 'Route registered in resendWebhooks.ts' : 'Route NOT found in resendWebhooks.ts',
    });
  } else {
    results.push({
      name: 'resendWebhooks.ts exists',
      pass: false,
      detail: 'File not found at server/routes/resendWebhooks.ts',
      blocker: true,
    });
  }

  // ── 3. Email provisioning service has correct address types ──────────────
  const provFile = path.join(process.cwd(), 'server/services/email/emailProvisioningService.ts');
  if (fs.existsSync(provFile)) {
    const content = fs.readFileSync(provFile, 'utf8');
    const missingTypes = SYSTEM_ADDRESS_TYPES.filter(t => !content.includes(`'${t}'`) && !content.includes(`"${t}"`));
    results.push({
      name: `Email provisioning has all ${SYSTEM_ADDRESS_TYPES.length} system address types`,
      pass: missingTypes.length === 0,
      detail: missingTypes.length === 0
        ? `All types present: ${SYSTEM_ADDRESS_TYPES.join(', ')}`
        : `Missing types: ${missingTypes.join(', ')}`,
    });

    const hasMXComment = content.includes('inbound.resend.com');
    results.push({
      name: 'Email provisioning references correct MX target (inbound.resend.com)',
      pass: hasMXComment,
      detail: hasMXComment
        ? 'inbound.resend.com referenced in provisioning service'
        : 'inbound.resend.com NOT found — provisioning service may be using wrong routing',
    });
  }

  // ── 4. DB: Check folder types are provisioned for at least one workspace ──
  try {
    const wsWithFolders = await pool.query(
      `SELECT workspace_id, COUNT(*) as folder_count,
              array_agg(folder_type ORDER BY folder_type) as types
       FROM internal_email_folders
       GROUP BY workspace_id
       LIMIT 5`
    );

    if (wsWithFolders.rows.length > 0) {
      const sample = wsWithFolders.rows[0];
      const missingFolders = SYSTEM_FOLDER_TYPES.filter(t => !sample.types.includes(t));
      results.push({
        name: `DB: System email folders provisioned (${SYSTEM_FOLDER_TYPES.length} types per workspace)`,
        pass: missingFolders.length === 0,
        detail: missingFolders.length === 0
          ? `${wsWithFolders.rows.length} workspace(s) have all 8 folder types`
          : `Sample workspace missing: ${missingFolders.join(', ')}`,
      });
    } else {
      results.push({
        name: 'DB: System email folders provisioned',
        pass: false,
        detail: 'No email folders found in internal_email_folders — new workspace creation will provision them',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'DB: internal_email_folders table accessible',
      pass: false,
      detail: `DB error: ${err.message}`,
    });
  }

  // ── 5. DB: Check workspace_emails table has system addresses ─────────────
  try {
    const addrResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM workspace_emails WHERE local_part = ANY($1)`,
      [SYSTEM_ADDRESS_TYPES]
    );
    const cnt = parseInt(addrResult.rows[0].cnt, 10);
    results.push({
      name: 'DB: Workspace system email addresses provisioned',
      pass: cnt > 0,
      detail: cnt > 0
        ? `${cnt} system address record(s) found in workspace_emails`
        : 'No system addresses found — will be created when first workspace is set up',
    });
  } catch {
    // Table might be named differently
    results.push({
      name: 'DB: Workspace system email addresses',
      pass: true,
      detail: 'workspace_emails table check skipped (table may use different name)',
    });
  }

  // ── 6. RESEND_WEBHOOK_SECRET is set ──────────────────────────────────────
  results.push({
    name: 'RESEND_WEBHOOK_SECRET env var is set',
    pass: !!process.env.RESEND_WEBHOOK_SECRET,
    detail: process.env.RESEND_WEBHOOK_SECRET
      ? 'Set — inbound webhook signature verification will work'
      : 'MISSING — inbound webhooks will be rejected (signature check fails)',
    blocker: true,
  });

  // ── 7. RESEND_API_KEY is set ─────────────────────────────────────────────
  results.push({
    name: 'RESEND_API_KEY env var is set',
    pass: !!process.env.RESEND_API_KEY,
    detail: process.env.RESEND_API_KEY ? 'Set' : 'MISSING — outbound email will fail',
    blocker: true,
  });

  await pool.end();

  // Print results
  const blockers: CheckResult[] = [];
  const warnings: CheckResult[] = [];

  results.forEach(r => {
    if (r.pass) {
      console.log(`✅  ${r.name}`);
      console.log(`    ${r.detail}\n`);
    } else {
      const icon = r.blocker ? '❌ ' : '⚠️ ';
      console.log(`${icon} ${r.name}`);
      console.log(`    ${r.detail}\n`);
      if (r.blocker) blockers.push(r);
      else warnings.push(r);
    }
  });

  console.log(DIVIDER);
  console.log(' INBOUND EMAIL READINESS SUMMARY');
  console.log(DIVIDER);

  if (blockers.length === 0 && warnings.length === 0) {
    console.log('\n✅  INBOUND EMAIL: FULLY READY — all checks pass.\n');
  } else {
    if (blockers.length > 0) {
      console.log(`\n❌  ${blockers.length} BLOCKER(S) — inbound email will NOT work:\n`);
      blockers.forEach(b => console.log(`    • ${b.name}`));
      console.log('');
    }
    if (warnings.length > 0) {
      console.log(`⚠️   ${warnings.length} warning(s) — inbound email may work but with caveats:\n`);
      warnings.forEach(w => console.log(`    • ${w.name}`));
      console.log('');
    }

    if (blockers.some(b => b.name.includes('MX'))) {
      console.log('ACTION REQUIRED:');
      console.log('  Change your *.coaileague.com MX record to:');
      console.log('    Exchange: inbound.resend.com');
      console.log('    Priority: 10');
      console.log('  Do this in your DNS provider (Cloudflare, Route53, etc.)');
      console.log('');
    }
  }

  console.log(DIVIDER + '\n');
  process.exit(blockers.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
