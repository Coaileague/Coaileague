#!/usr/bin/env tsx
/**
 * OMEGA SETUP-WEBHOOKS
 * Registers webhooks with Stripe, Resend, and Twilio via their APIs.
 * QuickBooks and Plaid require Bryan manual action — flagged clearly.
 *
 * Fully idempotent — safe to run multiple times without creating duplicates.
 * Never writes secrets to any file. Logs to console only when first created.
 *
 * Run: tsx scripts/omega/setup-webhooks.ts [--dry-run]
 */

import { appendFileSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const APP_URL = (process.env.APP_URL || process.env.BASE_URL || '').replace(/\/$/, '');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_LIVE_SECRET = process.env.STRIPE_LIVE_SECRET_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER_SID = process.env.TWILIO_PHONE_NUMBER_SID || '';
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_WEBHOOK_SECRET = process.env.PLAID_WEBHOOK_SECRET || '';

interface Check { name: string; pass: boolean; detail: string; action: string; }
const results: Check[] = [];

function check(name: string, pass: boolean, detail: string, action = '') {
  results.push({ name, pass, detail, action });
  console.log(`${pass ? '✅' : '❌'} ${name}: ${detail}`);
}

function box(...lines: string[]) {
  const width = Math.max(...lines.map(l => l.length), 54);
  const border = '═'.repeat(width + 2);
  console.log(`\n╔${border}╗`);
  for (const line of lines) console.log(`║ ${line.padEnd(width)} ║`);
  console.log(`╚${border}╝\n`);
}

const STRIPE_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'customer.updated',
  'charge.refunded',
] as const;

// ── Stripe ──────────────────────────────────────────────────────────────────

async function setupStripeWebhook(secretKey: string, label: string): Promise<void> {
  const endpointUrl = `${APP_URL}/api/stripe/webhook`;
  const envVarName = label === 'live' ? 'STRIPE_LIVE_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET';

  if (DRY_RUN) {
    check(`STRIPE:${label}`, true, `DRY-RUN: Would register ${endpointUrl} for ${STRIPE_EVENTS.length} events`, '');
    return;
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any });

    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const found = existing.data.find(e => e.url === endpointUrl);

    if (found) {
      check(`STRIPE:${label}`, true, `Already registered — id: ${found.id} (${found.status})`, '');
      console.log(`   ℹ️  Stripe ${label} webhook already registered — skipping`);
    } else {
      const endpoint = await stripe.webhookEndpoints.create({
        url: endpointUrl,
        enabled_events: STRIPE_EVENTS as unknown as any[],
        description: `CoAIleague ${label} webhook`,
      });
      check(`STRIPE:${label}`, true, `Registered — id: ${endpoint.id}`, 'Copy signing secret to env');
      box(
        `STRIPE ${label.toUpperCase()} WEBHOOK SECRET (copy now):`,
        `  ${endpoint.secret}`,
        `→ Add to env: ${envVarName}`,
      );
    }
  } catch (err: any) {
    check(`STRIPE:${label}`, false, `Stripe API error: ${err.message}`, 'Fix and re-run');
  }
}

// ── Resend ───────────────────────────────────────────────────────────────────

async function setupResendWebhooks(): Promise<void> {
  if (!RESEND_API_KEY) {
    check('RESEND:outbound', false, 'RESEND_API_KEY not set', '[BRYAN ACTION REQUIRED]');
    check('RESEND:inbound', false, 'RESEND_API_KEY not set', '[BRYAN ACTION REQUIRED]');
    return;
  }

  const outboundUrl = `${APP_URL}/api/webhooks/resend`;
  const inboundUrl  = `${APP_URL}/api/webhooks/resend/inbound`;
  const domain = new URL(APP_URL).hostname;

  if (DRY_RUN) {
    check('RESEND:outbound', true, `DRY-RUN: Would register ${outboundUrl}`, '');
    check('RESEND:inbound',  true, `DRY-RUN: Would register ${inboundUrl}`, '');
    check('RESEND:dns-mx', false, 'DNS MX record required', '[BRYAN ACTION REQUIRED]');
    printResendDnsBox(domain);
    return;
  }

  // List existing webhooks
  let existingUrls: string[] = [];
  try {
    const listResp = await fetch('https://api.resend.com/webhooks', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (listResp.ok) {
      const data = await listResp.json() as { data?: Array<{ url: string }> };
      existingUrls = (data.data || []).map((w: any) => w.url);
    }
  } catch {
    console.warn('  ⚠️  Could not list Resend webhooks — proceeding with registration');
  }

  // Outbound events webhook
  if (existingUrls.includes(outboundUrl)) {
    check('RESEND:outbound', true, 'Already registered — skipping', '');
    console.log('   ℹ️  Resend outbound webhook already registered — skipping');
  } else {
    try {
      const resp = await fetch('https://api.resend.com/webhooks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: outboundUrl,
          events: ['email.bounced', 'email.delivered', 'email.complained'],
        }),
      });
      const ok = resp.status === 200 || resp.status === 201;
      check('RESEND:outbound', ok,
        ok ? `REGISTERED: ${outboundUrl}` : `Failed: HTTP ${resp.status}`,
        ok ? '' : 'Check RESEND_API_KEY and re-run');
    } catch (err: any) {
      check('RESEND:outbound', false, `Network error: ${err.message}`, 'Fix and re-run');
    }
  }

  // Inbound email webhook
  if (existingUrls.includes(inboundUrl)) {
    check('RESEND:inbound', true, 'Already registered — skipping', '');
    console.log('   ℹ️  Resend inbound webhook already registered — skipping');
  } else {
    try {
      const resp = await fetch('https://api.resend.com/webhooks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: inboundUrl,
          events: ['email.received'],
        }),
      });
      const ok = resp.status === 200 || resp.status === 201;
      check('RESEND:inbound', ok,
        ok ? `REGISTERED: ${inboundUrl}` : `Failed: HTTP ${resp.status}`,
        ok ? '' : 'Check RESEND_API_KEY and re-run');
    } catch (err: any) {
      check('RESEND:inbound', false, `Network error: ${err.message}`, 'Fix and re-run');
    }
  }

  // Always print DNS instruction regardless of registration status
  printResendDnsBox(domain);
  check('RESEND:dns-mx', false, 'MX record must be added manually', '[BRYAN ACTION REQUIRED] Add MX → inbound.resend.com');
}

function printResendDnsBox(domain: string) {
  box(
    'MANUAL DNS ACTION REQUIRED:',
    'Add MX record to your DNS provider:',
    '  Name/Host:  @ (or your domain root)',
    '  Priority:   10',
    '  Value:      inbound.resend.com',
    `  Domain:     ${domain}`,
    'Without this record, inbound email routing will not work.',
  );
}

// ── Twilio ───────────────────────────────────────────────────────────────────

async function setupTwilioWebhooks(): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER_SID) {
    const missing = [
      !TWILIO_ACCOUNT_SID && 'TWILIO_ACCOUNT_SID',
      !TWILIO_AUTH_TOKEN  && 'TWILIO_AUTH_TOKEN',
      !TWILIO_PHONE_NUMBER_SID && 'TWILIO_PHONE_NUMBER_SID',
    ].filter(Boolean).join(', ');
    check('TWILIO:configure', false, `Missing: ${missing}`, '[BRYAN ACTION REQUIRED]');
    box(
      '[BRYAN ACTION REQUIRED — Twilio]',
      `Missing environment variables: ${missing}`,
      'Get from: https://console.twilio.com',
      'Then re-run this script.',
    );
    return;
  }

  const voiceUrl      = `${APP_URL}/api/voice/inbound`;
  const voiceCallback = `${APP_URL}/api/voice/status-callback`;
  const smsUrl        = `${APP_URL}/api/sms/inbound`;
  const smsCallback   = `${APP_URL}/api/sms/status`;

  if (DRY_RUN) {
    console.log('  DRY-RUN: Would set Twilio phone number URLs to:');
    console.log(`    Voice URL:      ${voiceUrl}`);
    console.log(`    Voice Callback: ${voiceCallback}`);
    console.log(`    SMS URL:        ${smsUrl}`);
    console.log(`    SMS Callback:   ${smsCallback}`);
    check('TWILIO:configure', true, 'DRY-RUN: Would configure phone number URLs', '');
    return;
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    // Update the phone number with all 4 webhook URLs
    await client.incomingPhoneNumbers(TWILIO_PHONE_NUMBER_SID).update({
      voiceUrl,
      voiceMethod: 'POST',
      statusCallback: voiceCallback,
      statusCallbackMethod: 'POST',
      smsUrl,
      smsMethod: 'POST',
      smsStatusCallback: smsCallback,
      smsStatusCallbackMethod: 'POST',
    } as any);

    // Fetch back and verify all 4 URLs match exactly
    const phoneNumber = await client.incomingPhoneNumbers(TWILIO_PHONE_NUMBER_SID).fetch();
    const pn = phoneNumber as any;

    const verifications = [
      { label: 'Voice URL     ', expected: voiceUrl,      actual: pn.voiceUrl },
      { label: 'Voice Callback', expected: voiceCallback,  actual: pn.statusCallback },
      { label: 'SMS URL       ', expected: smsUrl,         actual: pn.smsUrl },
      { label: 'SMS Callback  ', expected: smsCallback,    actual: pn.smsStatusCallback },
    ];

    let allMatch = true;
    for (const v of verifications) {
      const match = v.actual === v.expected;
      if (!match) allMatch = false;
      console.log(`   ${v.label}: ${v.actual} — ${match ? 'CONFIRMED' : 'MISMATCH'}`);
    }

    if (allMatch) {
      check('TWILIO:configure', true, 'All 4 URLs set and confirmed on phone number', '');
    } else {
      check('TWILIO:configure', false, 'One or more URL mismatches detected — see above', 'Re-run after checking SID');
      process.exitCode = 1;
    }
  } catch (err: any) {
    check('TWILIO:configure', false, `Twilio SDK error: ${err.message}`, 'Verify SID and auth token');
  }
}

// ── QuickBooks ───────────────────────────────────────────────────────────────

function printQuickBooksInstructions() {
  box(
    '[MANUAL ACTION — QuickBooks Developer Console]',
    '1. Go to: https://developer.intuit.com',
    '2. Select your app → Keys and credentials',
    '3. Under Redirect URIs, add:',
    `   ${APP_URL}/api/integrations/quickbooks/callback`,
    '4. Save changes',
    'This cannot be done via API — must be done manually.',
  );
  check('QB:redirect-uri', false,
    `[BRYAN ACTION REQUIRED] Add ${APP_URL}/api/integrations/quickbooks/callback`,
    '[BRYAN ACTION REQUIRED]');
}

// ── Plaid ────────────────────────────────────────────────────────────────────

async function checkPlaid(): Promise<void> {
  const missing = [
    !PLAID_CLIENT_ID    && 'PLAID_CLIENT_ID',
    !PLAID_SECRET       && 'PLAID_SECRET',
    !PLAID_WEBHOOK_SECRET && 'PLAID_WEBHOOK_SECRET',
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    box(
      '[BRYAN ACTION REQUIRED — Plaid]',
      'Missing environment variables:',
      ...missing.map(v => `  • ${v}`),
      'Get production keys from: https://dashboard.plaid.com',
      'Add to environment, then re-run this script.',
    );
    check('PLAID:keys', false, `Missing: ${missing.join(', ')}`, '[BRYAN ACTION REQUIRED]');
    return;
  }

  // Keys present — ping Plaid sandbox to validate
  try {
    const resp = await fetch('https://sandbox.plaid.com/institutions/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        count: 1,
        offset: 0,
        country_codes: ['US'],
      }),
    });
    if (resp.ok) {
      check('PLAID:sandbox', true, 'Plaid sandbox reachable — keys are valid', '');
      console.log('   ℹ️  Set PLAID_ENV=production when ready for live transfers');
    } else {
      const body = await resp.json().catch(() => ({})) as any;
      check('PLAID:sandbox', false, `Plaid returned HTTP ${resp.status}: ${body?.error_message || 'unknown'}`, 'Verify Plaid keys');
    }
  } catch (err: any) {
    check('PLAID:sandbox', false, `Network error: ${err.message}`, 'Check connectivity');
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` OMEGA SETUP-WEBHOOKS ${DRY_RUN ? '(DRY-RUN)' : '(LIVE)'}`);
  console.log('══════════════════════════════════════════════════════\n');

  // ── Required env check ─────────────────────────────────────────────────────
  const required: Record<string, string> = {
    'APP_URL (or BASE_URL)': APP_URL,
    STRIPE_SECRET_KEY: STRIPE_SECRET,
    RESEND_API_KEY,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER_SID,
  };
  const missingRequired = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missingRequired.length > 0) {
    console.error('❌ Missing required environment variables:');
    for (const v of missingRequired) console.error(`   • ${v}`);
    console.error('\nSet these variables and re-run. No partial registration attempted.');
    process.exit(1);
  }

  console.log(`Using APP_URL: ${APP_URL}\n`);

  // ── Stripe test ─────────────────────────────────────────────────────────────
  console.log('── Stripe (Test) ──');
  await setupStripeWebhook(STRIPE_SECRET, 'test');

  // ── Stripe live ─────────────────────────────────────────────────────────────
  console.log('\n── Stripe (Live) ──');
  if (STRIPE_LIVE_SECRET) {
    await setupStripeWebhook(STRIPE_LIVE_SECRET, 'live');
  } else {
    check('STRIPE:live', false, 'STRIPE_LIVE_SECRET_KEY not set', '[BRYAN ACTION REQUIRED]');
    box(
      '[BRYAN ACTION REQUIRED — Stripe Live]',
      'STRIPE_LIVE_SECRET_KEY not set.',
      'Add live key, then re-run to register live webhook.',
    );
  }

  // ── Resend ──────────────────────────────────────────────────────────────────
  console.log('\n── Resend ──');
  await setupResendWebhooks();

  // ── Twilio ──────────────────────────────────────────────────────────────────
  console.log('\n── Twilio ──');
  await setupTwilioWebhooks();

  // ── QuickBooks ──────────────────────────────────────────────────────────────
  console.log('\n── QuickBooks (Manual Action Required) ──');
  printQuickBooksInstructions();

  // ── Plaid ───────────────────────────────────────────────────────────────────
  console.log('\n── Plaid ──');
  await checkPlaid();

  // ── Summary table ───────────────────────────────────────────────────────────
  const pass     = results.filter(r => r.pass).length;
  const fail     = results.filter(r => !r.pass).length;
  const bryanCnt = results.filter(r => r.detail.includes('BRYAN ACTION REQUIRED') || r.action.includes('BRYAN ACTION REQUIRED')).length;
  const codeFail = fail - bryanCnt;
  const verdict  = codeFail === 0 ? 'PASS (Bryan items pending)' : 'FAIL';

  const stripeStatus = results.find(r => r.name === 'STRIPE:test')?.pass ? 'REGISTERED/SKIPPED' : 'FAILED';
  const resendStatus = (results.find(r => r.name === 'RESEND:outbound')?.pass && results.find(r => r.name === 'RESEND:inbound')?.pass) ? 'REGISTERED/SKIPPED' : 'FAILED/PARTIAL';
  const twilioStatus = results.find(r => r.name === 'TWILIO:configure')?.pass ? 'CONFIGURED' : 'FAILED/PENDING';
  const plaidStatus  = results.find(r => r.name === 'PLAID:sandbox')?.pass ? 'OK' : (results.find(r => r.name === 'PLAID:keys') ? 'BLOCKED' : 'UNKNOWN');

  console.log('\n══════════════════════════════════════════════════════');
  console.log(' WEBHOOK SETUP COMPLETE');
  console.log('══════════════════════════════════════════════════════');
  console.log(' Provider      Status                  Action Required');
  console.log(' ─────────────────────────────────────────────────────');
  console.log(` Stripe        ${stripeStatus.padEnd(22)}  Copy secrets to env`);
  console.log(` Resend        ${resendStatus.padEnd(22)}  Add MX record to DNS`);
  console.log(` Twilio        ${twilioStatus.padEnd(22)}  ${twilioStatus === 'CONFIGURED' ? 'None' : 'See errors above'}`);
  console.log(' QuickBooks    MANUAL REQUIRED          See instructions above');
  console.log(` Plaid         ${plaidStatus.padEnd(22)}  ${plaidStatus === 'OK' ? 'None' : '[BRYAN ACTION REQUIRED]'}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` ${pass}/${results.length} done | ${bryanCnt} Bryan items pending | Verdict: ${verdict}`);
  console.log('══════════════════════════════════════════════════════\n');

  const ts = new Date().toISOString();
  const evidence = [
    `\n## Webhook Setup — ${ts}`,
    `- Stripe Test: ${stripeStatus}`,
    `- Stripe Live: ${results.find(r => r.name === 'STRIPE:live')?.pass ? 'REGISTERED/SKIPPED' : 'PENDING/FAILED'}`,
    `- Resend: ${resendStatus}`,
    `- Twilio: ${twilioStatus}`,
    `- QuickBooks: MANUAL REQUIRED`,
    `- Plaid: ${plaidStatus}`,
    `- **Verdict: ${verdict}**`,
  ].join('\n');

  appendFileSync('OMEGA_STATE_CHECKPOINT.md', evidence + '\n');

  if (codeFail > 0) process.exit(1);
}

run().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
