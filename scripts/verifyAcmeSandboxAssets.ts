#!/usr/bin/env tsx
/**
 * ACME Sandbox — Asset Verifier (no DB required)
 * ===============================================
 * Exercises the pure-data portions of the ACME sandbox harness so we can
 * inspect the artifact + webhook payload shapes without standing up
 * Postgres. Useful as a smoke test in CI and as a proof-of-payload
 * inspection point for reviewers.
 *
 * Writes everything under `artifacts/acme-sandbox/dryrun/`.
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const OUT = path.resolve(process.cwd(), 'artifacts', 'acme-sandbox', 'dryrun');
const WATERMARK = '⚠ FAKE — SIMULATION ONLY — NOT A LEGAL DOCUMENT ⚠';

function svgEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildIdCardSvg(name: string, empNum: string, role: string): string {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colorHash = crypto.createHash('sha1').update(empNum).digest('hex').slice(0, 6);
  const expiresAt = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 340" width="540" height="340">
  <rect width="540" height="340" fill="#0d1b2a" rx="14"/>
  <rect x="8" y="8" width="524" height="324" fill="#1b263b" rx="10" stroke="#ff3366" stroke-width="3" stroke-dasharray="8 6"/>
  <rect x="20" y="20" width="500" height="36" fill="#ff3366"/>
  <text x="270" y="46" font-family="monospace" font-size="20" fill="#fff" text-anchor="middle" font-weight="bold">${svgEscape(WATERMARK)}</text>
  <text x="270" y="80" font-family="sans-serif" font-size="14" fill="#aab7c4" text-anchor="middle">ACME SECURITY SERVICES — SANDBOX BADGE</text>
  <circle cx="92" cy="180" r="56" fill="#${colorHash}"/>
  <text x="92" y="195" font-family="sans-serif" font-size="40" fill="#fff" text-anchor="middle" font-weight="bold">${svgEscape(initials)}</text>
  <text x="170" y="140" font-family="sans-serif" font-size="22" fill="#fff" font-weight="bold">${svgEscape(name)}</text>
  <text x="170" y="170" font-family="sans-serif" font-size="14" fill="#aab7c4">Officer #: ${svgEscape(empNum)}</text>
  <text x="170" y="190" font-family="sans-serif" font-size="14" fill="#aab7c4">Role: ${svgEscape(role)}</text>
  <text x="170" y="210" font-family="sans-serif" font-size="14" fill="#aab7c4">TX-PSP: SIM-${svgEscape(empNum)}</text>
  <text x="170" y="230" font-family="sans-serif" font-size="14" fill="#aab7c4">Expires: ${svgEscape(expiresAt)}</text>
  <g transform="rotate(-30 270 170)" opacity="0.18">
    <text x="270" y="170" font-family="sans-serif" font-size="60" fill="#ff3366" text-anchor="middle" font-weight="bold">FAKE • DEMO • FAKE • DEMO</text>
  </g>
</svg>`;
}

function buildPhotoSvg(caption: string, seed: string): string {
  const h = crypto.createHash('sha1').update(seed).digest('hex');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#${h.slice(0,6)}"/><stop offset="100%" stop-color="#${h.slice(6,12)}"/></linearGradient></defs>
  <rect width="800" height="500" fill="url(#g)"/>
  <rect x="0" y="0" width="800" height="48" fill="#000" opacity="0.65"/>
  <text x="400" y="32" font-family="monospace" font-size="20" fill="#ff3366" text-anchor="middle" font-weight="bold">${svgEscape(WATERMARK)}</text>
  <text x="400" y="260" font-family="sans-serif" font-size="36" fill="#fff" text-anchor="middle" font-weight="bold">${svgEscape(caption)}</text>
  <g transform="rotate(-25 400 250)" opacity="0.22">
    <text x="400" y="250" font-family="sans-serif" font-size="120" fill="#fff" text-anchor="middle" font-weight="bold">FAKE</text>
  </g>
</svg>`;
}

function stripeInvoicePayload(scenario: 'success' | 'declined') {
  const ts = Math.floor(Date.now() / 1000);
  return {
    id: `evt_sandbox_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    api_version: '2024-12-18.acacia',
    created: ts,
    livemode: false,
    type: scenario === 'success' ? 'invoice.payment_succeeded' : 'invoice.payment_failed',
    data: {
      object: {
        id: `in_sandbox_${crypto.randomBytes(8).toString('hex')}`,
        object: 'invoice',
        number: 'INV-ACM-2026-04-001',
        amount_paid: scenario === 'success' ? 672000 : 0,
        amount_due: 672000,
        amount_remaining: scenario === 'success' ? 0 : 672000,
        currency: 'usd',
        status: scenario === 'success' ? 'paid' : 'open',
        attempt_count: scenario === 'success' ? 1 : 4,
        next_payment_attempt: scenario === 'success' ? null : ts + 86400,
        metadata: {
          synapse_invoice_id: 'demo-invoice-pmc-week1',
          synapse_workspace_id: 'demo-workspace-00000000',
          source: 'acme_sandbox_simulation',
        },
      },
    },
  };
}

function plaidAchPayload(scenario: 'pending' | 'settled') {
  return {
    webhook_type: 'TRANSFER',
    webhook_code: 'TRANSFER_EVENTS_UPDATE',
    transfer_id: `transfer_sandbox_${crypto.randomBytes(8).toString('hex')}`,
    timestamp: new Date().toISOString(),
    environment: 'sandbox',
    event: {
      event_type: scenario,
      account_id: 'sandbox-account-acme-payroll',
      amount: '10453.32',
      iso_currency_code: 'USD',
      ach_class: 'ppd',
      metadata: {
        synapse_payroll_run_id: 'demo-payroll-run-week1',
        synapse_workspace_id: 'demo-workspace-00000000',
        source: 'acme_sandbox_simulation',
      },
    },
  };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const officers = [
    { name: 'Marcus Rodriguez',  empNum: 'ACM-001', role: 'Site Supervisor (TX-Lvl-III Armed)' },
    { name: 'Robert Washington', empNum: 'ACM-005', role: 'Senior Officer (TX-Lvl-III Armed)' },
    { name: 'David Kim',         empNum: 'ACM-003', role: 'Security Officer (Unarmed)' },
  ];

  for (const o of officers) {
    await fs.writeFile(path.join(OUT, `${o.empNum}-fake-id.svg`), buildIdCardSvg(o.name, o.empNum, o.role), 'utf8');
  }
  await fs.writeFile(
    path.join(OUT, 'site-pmc-main-lobby.svg'),
    buildPhotoSvg('Pacific Medical Center — Main Lobby', 'pmc-main'),
    'utf8'
  );

  const stripeSucceeded = stripeInvoicePayload('success');
  const stripeDeclined  = stripeInvoicePayload('declined');
  const plaidPending    = plaidAchPayload('pending');
  const plaidSettled    = plaidAchPayload('settled');

  await fs.writeFile(path.join(OUT, 'stripe-invoice-payment-succeeded.json'), JSON.stringify(stripeSucceeded, null, 2), 'utf8');
  await fs.writeFile(path.join(OUT, 'stripe-invoice-payment-failed.json'),    JSON.stringify(stripeDeclined,  null, 2), 'utf8');
  await fs.writeFile(path.join(OUT, 'plaid-transfer-events-pending.json'),    JSON.stringify(plaidPending,    null, 2), 'utf8');
  await fs.writeFile(path.join(OUT, 'plaid-transfer-events-settled.json'),    JSON.stringify(plaidSettled,    null, 2), 'utf8');

  // A dry-run telemetry log so the user can preview the format without DB.
  const telemetry = {
    workspaceId: 'demo-workspace-00000000',
    runStamp: new Date().toISOString(),
    finance: {
      totalInvoiced: 26880.0,
      totalCollected: 20160.0,
      outstanding: 6720.0,
      stripeFeeTotal: 779.65,
      platformFeeTotal: 806.4,
      invoiceCount: 4,
    },
    payroll: {
      totalEarned: 13440.0,
      totalDisbursed: 10453.32,
      overtimePremium: 240.0,
      payrollRunCount: 3,
      arrearsAdjustments: 0,
    },
    compliance: {
      expiredLicenseBlocks: 1,
      armedShiftsScheduled: 6,
      psychPendingFlags: 1,
      killSwitchTriggered: true,
    },
    tax: {
      estimatedFederal: 1612.8,
      estimatedState: 672.0,
      estimatedFICA: 1027.66,
      estimatedFUTA: 80.64,
      estimatedSUTA: 362.88,
      withheldTotal: 3312.46,
    },
    network: {
      httpErrorCount4xx: 0,
      httpErrorCount5xx: 0,
      failedWebhooks: 0,
      failedEmails: 0,
      failedSms: 0,
    },
    chaosResults: [
      { testCase: 'Arrears Math',  systematicResult: 'Invoiced=$26880, Payroll=$13440, Margin=50.0%, OT-hours=12.0', semanticOutcome: 'Bi-weekly payroll captured overtime premium correctly', gapFound: false },
      { testCase: 'Kill-Switch',   systematicResult: 'armed_shifts=6, blocks=1', semanticOutcome: 'Lvl-III commission expired mid-period; Trinity blocked re-assignment', gapFound: false },
      { testCase: 'Stripe Webhook', systematicResult: 'declined→open, success→paid', semanticOutcome: 'Synapse mirrored Stripe sandbox state on both decline + retry', gapFound: false },
      { testCase: 'AI Triage',     systematicResult: 'parsedLevel=TX-Lvl-III, psychPending=true, citations=1', semanticOutcome: 'Trinity refused illegal armed staffing, cited PSP-13', gapFound: false },
    ],
    verdict: 'PRODUCTION_READY' as const,
  };
  await fs.writeFile(path.join(OUT, 'telemetry-sample.json'), JSON.stringify(telemetry, null, 2), 'utf8');

  const log = [
    '========== HOLISTIC TELEMETRY LOG (DRY-RUN SAMPLE) ==========',
    `Workspace : ${telemetry.workspaceId}`,
    `Run stamp : ${telemetry.runStamp}`,
    `Verdict   : ${telemetry.verdict}`,
    '',
    `[FINANCE]    Invoiced=$${telemetry.finance.totalInvoiced.toFixed(2)}  Collected=$${telemetry.finance.totalCollected.toFixed(2)}  Outstanding=$${telemetry.finance.outstanding.toFixed(2)}  Fees=$${telemetry.finance.stripeFeeTotal.toFixed(2)}  N=${telemetry.finance.invoiceCount}`,
    `[PAYROLL]    Earned=$${telemetry.payroll.totalEarned.toFixed(2)}  Disbursed=$${telemetry.payroll.totalDisbursed.toFixed(2)}  OT-premium=$${telemetry.payroll.overtimePremium.toFixed(2)}  Runs=${telemetry.payroll.payrollRunCount}`,
    `[COMPLIANCE] expiredLicenseBlocks=${telemetry.compliance.expiredLicenseBlocks}  armedShiftsScheduled=${telemetry.compliance.armedShiftsScheduled}  killSwitchTriggered=${telemetry.compliance.killSwitchTriggered}`,
    `[TAX]        Fed=$${telemetry.tax.estimatedFederal.toFixed(2)}  State=$${telemetry.tax.estimatedState.toFixed(2)}  FICA=$${telemetry.tax.estimatedFICA.toFixed(2)}  FUTA=$${telemetry.tax.estimatedFUTA.toFixed(2)}  SUTA=$${telemetry.tax.estimatedSUTA.toFixed(2)}  Withheld=$${telemetry.tax.withheldTotal.toFixed(2)}`,
    `[NETWORK]    4xx=0  5xx=0  webhookFails=0  emailFails=0  smsFails=0`,
    '',
    '---------- CHAOS TEST TABLE ----------',
    '| Test Case        | Systematic Result | Semantic Outcome | Gap Found? |',
    '| :--------------- | :---------------- | :--------------- | :--------- |',
    ...telemetry.chaosResults.map(r =>
      `| ${r.testCase.padEnd(16)} | ${r.systematicResult} | ${r.semanticOutcome} | ${r.gapFound ? 'Yes' : 'No'} |`
    ),
  ].join('\n');
  await fs.writeFile(path.join(OUT, 'telemetry-sample.log'), log, 'utf8');

  console.log('Wrote dry-run assets to:', OUT);
  console.log('  - 3 fake officer ID SVGs');
  console.log('  - 1 fake site-photo SVG');
  console.log('  - 2 Stripe sandbox webhook payloads (succeeded + failed)');
  console.log('  - 2 Plaid sandbox webhook payloads (pending + settled)');
  console.log('  - 1 sample telemetry JSON + log');
  console.log('\n' + log);
}

main().catch(err => { console.error(err); process.exit(1); });
