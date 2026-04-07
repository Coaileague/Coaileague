#!/usr/bin/env tsx
/**
 * OMEGA VERIFY-WEBHOOKS
 * Confirms all webhook registrations are correct by fetching current
 * config from each provider and comparing against expected values.
 *
 * Run any time — especially after a domain change or redeployment.
 * Run: tsx scripts/omega/verify-webhooks.ts
 */

import { appendFileSync } from 'fs';

const APP_URL = (process.env.APP_URL || process.env.BASE_URL || '').replace(/\/$/, '');

const STRIPE_SECRET      = process.env.STRIPE_SECRET_KEY      || '';
const STRIPE_LIVE_SECRET = process.env.STRIPE_LIVE_SECRET_KEY || '';
const RESEND_API_KEY     = process.env.RESEND_API_KEY         || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID     || '';
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN      || '';
const TWILIO_PHONE_SID   = process.env.TWILIO_PHONE_NUMBER_SID || '';
const PLAID_CLIENT_ID    = process.env.PLAID_CLIENT_ID        || '';
const PLAID_SECRET       = process.env.PLAID_SECRET           || '';

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
];

interface Row { provider: string; check: string; status: 'VERIFIED' | 'MISSING' | 'MISMATCH' | 'MANUAL CHECK' | 'BLOCKED' | 'SKIP'; detail: string; }
const rows: Row[] = [];

function row(provider: string, chk: string, status: Row['status'], detail = '') {
  rows.push({ provider, check: chk, status, detail });
  const icon = status === 'VERIFIED' ? '✅' : (status === 'MANUAL CHECK' || status === 'SKIP') ? '⚠️ ' : '❌';
  console.log(`${icon} ${provider.padEnd(12)} ${chk.padEnd(30)} ${status}  ${detail}`);
}

// ── Stripe ───────────────────────────────────────────────────────────────────

async function verifyStripe(secretKey: string, label: string): Promise<void> {
  if (!secretKey) {
    row('Stripe', `${label} webhook URL`, 'MISSING', 'No secret key set');
    row('Stripe', `${label} webhook events (9)`, 'MISSING', 'No secret key set');
    return;
  }

  const targetUrl = `${APP_URL}/api/stripe/webhook`;

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any });

    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const found = endpoints.data.find(e => e.url === targetUrl);

    if (!found) {
      row('Stripe', `${label} webhook URL`, 'MISSING', `Not found at ${targetUrl}`);
      row('Stripe', `${label} webhook events (9)`, 'MISSING', 'Endpoint missing');
      return;
    }

    row('Stripe', `${label} webhook URL`, 'VERIFIED', `id: ${found.id} (${found.status})`);

    // Verify all 9 events are subscribed
    const missingEvents = STRIPE_EVENTS.filter(e => !found.enabled_events.includes(e));
    if (missingEvents.length === 0) {
      row('Stripe', `${label} webhook events (9)`, 'VERIFIED', `All ${STRIPE_EVENTS.length} events subscribed`);
    } else {
      row('Stripe', `${label} webhook events (9)`, 'MISMATCH',
        `Missing: ${missingEvents.join(', ')}`);
    }
  } catch (err: any) {
    row('Stripe', `${label} webhook URL`, 'MISSING', `API error: ${err.message}`);
    row('Stripe', `${label} webhook events (9)`, 'MISSING', `API error: ${err.message}`);
  }
}

// ── Resend ───────────────────────────────────────────────────────────────────

async function verifyResend(): Promise<void> {
  const outboundUrl = `${APP_URL}/api/webhooks/resend`;
  const inboundUrl  = `${APP_URL}/api/webhooks/resend/inbound`;

  if (!RESEND_API_KEY) {
    row('Resend', 'Outbound webhook', 'MISSING', 'RESEND_API_KEY not set');
    row('Resend', 'Inbound webhook',  'MISSING', 'RESEND_API_KEY not set');
    return;
  }

  try {
    const resp = await fetch('https://api.resend.com/webhooks', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });

    if (!resp.ok) {
      row('Resend', 'Outbound webhook', 'MISSING', `API error: HTTP ${resp.status}`);
      row('Resend', 'Inbound webhook',  'MISSING', `API error: HTTP ${resp.status}`);
      return;
    }

    const data = await resp.json() as { data?: Array<{ url: string }> };
    const registeredUrls = (data.data || []).map((w: any) => w.url);

    const outboundFound = registeredUrls.includes(outboundUrl);
    const inboundFound  = registeredUrls.includes(inboundUrl);

    row('Resend', 'Outbound webhook', outboundFound ? 'VERIFIED' : 'MISSING',
      outboundFound ? outboundUrl : `Not registered: ${outboundUrl}`);
    row('Resend', 'Inbound webhook', inboundFound ? 'VERIFIED' : 'MISSING',
      inboundFound ? inboundUrl : `Not registered: ${inboundUrl}`);
  } catch (err: any) {
    row('Resend', 'Outbound webhook', 'MISSING', `Network error: ${err.message}`);
    row('Resend', 'Inbound webhook',  'MISSING', `Network error: ${err.message}`);
  }
}

// ── Twilio ───────────────────────────────────────────────────────────────────

async function verifyTwilio(): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_SID) {
    const missing = [
      !TWILIO_ACCOUNT_SID && 'TWILIO_ACCOUNT_SID',
      !TWILIO_AUTH_TOKEN  && 'TWILIO_AUTH_TOKEN',
      !TWILIO_PHONE_SID   && 'TWILIO_PHONE_NUMBER_SID',
    ].filter(Boolean).join(', ');
    for (const lbl of ['Voice URL', 'Voice status callback', 'SMS URL', 'SMS status callback']) {
      row('Twilio', lbl, 'MISSING', `Missing: ${missing}`);
    }
    return;
  }

  const expected = {
    voiceUrl:       `${APP_URL}/api/voice/inbound`,
    statusCallback: `${APP_URL}/api/voice/status-callback`,
    smsUrl:         `${APP_URL}/api/sms/inbound`,
    smsStatusCallback: `${APP_URL}/api/sms/status`,
  };

  const checks: Array<{ label: string; field: string }> = [
    { label: 'Voice URL',            field: 'voiceUrl' },
    { label: 'Voice status callback', field: 'statusCallback' },
    { label: 'SMS URL',              field: 'smsUrl' },
    { label: 'SMS status callback',  field: 'smsStatusCallback' },
  ];

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const phoneNumber = await client.incomingPhoneNumbers(TWILIO_PHONE_SID).fetch();
    const pn = phoneNumber as any;

    for (const c of checks) {
      const actual   = pn[c.field] || '';
      const expected_val = (expected as any)[c.field];
      const match    = actual === expected_val;
      row('Twilio', c.label, match ? 'VERIFIED' : 'MISMATCH',
        match ? actual : `Expected: ${expected_val} | Got: ${actual}`);
    }
  } catch (err: any) {
    for (const c of checks) {
      row('Twilio', c.label, 'MISSING', `SDK error: ${err.message}`);
    }
  }
}

// ── Plaid ────────────────────────────────────────────────────────────────────

async function verifyPlaid(): Promise<void> {
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    row('Plaid', 'API connectivity', 'BLOCKED', '[BRYAN ACTION REQUIRED] PLAID_CLIENT_ID / PLAID_SECRET not set');
    return;
  }

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
    row('Plaid', 'API connectivity', resp.ok ? 'VERIFIED' : 'MISSING',
      resp.ok ? 'Plaid sandbox reachable — keys valid' : `HTTP ${resp.status}`);
  } catch (err: any) {
    row('Plaid', 'API connectivity', 'MISSING', `Network error: ${err.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' OMEGA VERIFY-WEBHOOKS');
  console.log('══════════════════════════════════════════════════════════════\n');

  if (!APP_URL) {
    console.error('❌ APP_URL (or BASE_URL) is required');
    process.exit(1);
  }

  console.log(`Verifying against APP_URL: ${APP_URL}\n`);
  console.log(` ${'Provider'.padEnd(12)} ${'Check'.padEnd(30)} Status`);
  console.log(` ${'─'.repeat(12)} ${'─'.repeat(30)} ─────────────`);

  // Stripe
  await verifyStripe(STRIPE_SECRET, 'Test');
  await verifyStripe(STRIPE_LIVE_SECRET, 'Live');

  // Resend
  await verifyResend();

  // Twilio
  await verifyTwilio();

  // QuickBooks — cannot verify via API
  row('QuickBooks', 'Redirect URI', 'MANUAL CHECK',
    `Verify manually: ${APP_URL}/api/integrations/quickbooks/callback`);

  // Plaid
  await verifyPlaid();

  // ── Results ──────────────────────────────────────────────────────────────────
  const verified   = rows.filter(r => r.status === 'VERIFIED').length;
  const failures   = rows.filter(r => r.status === 'MISSING' || r.status === 'MISMATCH').length;
  const manual     = rows.filter(r => r.status === 'MANUAL CHECK' || r.status === 'BLOCKED').length;
  const verdict    = failures === 0 ? 'PASS' : 'FAIL';

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(` VERIFY-WEBHOOKS: ${verified} VERIFIED | ${failures} FAILED | ${manual} manual/pending`);
  console.log(` VERDICT: ${verdict}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failures > 0) {
    console.log('❌ MISSING or MISMATCH items found. Run setup-webhooks.ts to fix.\n');
  }

  const ts = new Date().toISOString();
  const evidence = [
    `\n## Verify-Webhooks — ${ts}`,
    `| Provider | Check | Status | Detail |`,
    `|----------|-------|--------|--------|`,
    ...rows.map(r => `| ${r.provider} | ${r.check} | ${r.status} | ${r.detail} |`),
    `\n**Verdict: ${verdict}** (${verified} verified, ${failures} failed, ${manual} manual)**`,
  ].join('\n');

  appendFileSync('OMEGA_STATE_CHECKPOINT.md', evidence + '\n');

  if (failures > 0) process.exit(1);
}

run().catch(err => {
  console.error('Uncaught verify error:', err);
  process.exit(1);
});
