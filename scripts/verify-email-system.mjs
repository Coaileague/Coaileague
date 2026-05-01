#!/usr/bin/env node
/**
 * VERIFY EMAIL SYSTEM — End-to-end wiring + live Resend send
 *
 * What it does (all of these must pass):
 *  1. Static wiring audit — confirms every import, export, and route mount in
 *     the email stack actually resolves to a real symbol/file. Catches broken
 *     pages/buttons that import a missing function.
 *  2. Silent-failure scan — flags code paths that swallow Resend errors and
 *     return success anyway.
 *  3. Live Resend round-trip — using a Resend test API key (re_test_… or any
 *     valid key), POSTs an email through the real https://api.resend.com/emails
 *     endpoint to delivered@resend.dev. Resend returns a real message id; we
 *     fail loudly if the API rejects the call.
 *
 * Why REST and not the SDK? The SDK isn't installed in every environment
 * (no node_modules in the verifier sandbox). Native fetch on Node 20+
 * talks to the same endpoint the SDK does, so the contract is identical.
 *
 * Run:
 *   RESEND_API_KEY=re_test_xxxxxxxxxxxxxxxxxx \
 *   RESEND_FROM_EMAIL=onboarding@resend.dev \
 *   node scripts/verify-email-system.mjs
 *
 * Without RESEND_API_KEY the static audit still runs and a connectivity probe
 * verifies api.resend.com is reachable; the script exits 0 only when no
 * high-severity check fails, so a missing key is reported as a WARN rather
 * than a hard FAIL. Set RESEND_API_KEY to upgrade the run to a real send.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Console helpers ─────────────────────────────────────────────────────────
const RED = '\x1b[31m', GRN = '\x1b[32m', YEL = '\x1b[33m', BLU = '\x1b[34m', DIM = '\x1b[2m', RST = '\x1b[0m';
const checks = [];
function record(name, pass, detail, severity = 'high') {
  checks.push({ name, pass, detail, severity });
  const tag = pass ? `${GRN}PASS${RST}` : (severity === 'low' ? `${YEL}WARN${RST}` : `${RED}FAIL${RST}`);
  console.log(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}
function section(title) {
  console.log(`\n${BLU}── ${title} ──${RST}`);
}

// ─── Static wiring audit ─────────────────────────────────────────────────────
function readFile(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}
function fileExists(rel) {
  const p = resolve(ROOT, rel);
  return existsSync(p) && statSync(p).isFile();
}

section('Static wiring audit');

// 1. Resend dependency declared
const pkg = JSON.parse(readFile('package.json'));
record(
  'package.json declares resend',
  !!pkg.dependencies?.resend || !!pkg.devDependencies?.resend,
  pkg.dependencies?.resend ? `version ${pkg.dependencies.resend}` : 'missing'
);

// 2. Core files exist
const CORE_FILES = [
  'server/email.ts',
  'server/services/emailCore.ts',
  'server/services/emailService.ts',
  'server/services/emailAutomation.ts',
  'server/services/emailTemplateBase.ts',
  'server/routes/email/emailRoutes.ts',
  'server/routes/emails.ts',
  'server/routes/externalEmailRoutes.ts',
  'server/routes/inboundEmailRoutes.ts',
  'server/routes/internalEmails.ts',
  'server/routes/emailUnsubscribe.ts',
  'server/routes/email-attachments.ts',
  'server/routes/emailEntityContextRoute.ts',
  'server/routes/domains/comms.ts',
  'server/config/platformConfig.ts',
];
for (const f of CORE_FILES) record(`exists ${f}`, fileExists(f));

// 3. Imports resolve — server/email.ts → ./services/emailCore
const emailBarrel = readFile('server/email.ts');
record(
  'server/email.ts re-exports from ./services/emailCore',
  /export \* from ['"]\.\/services\/emailCore['"]/.test(emailBarrel)
);
record(
  'server/email.ts exports sendEmail',
  /export async function sendEmail\(/.test(emailBarrel)
);

// 4. emailCore exports the canonical send + status helpers
const emailCore = readFile('server/services/emailCore.ts');
const REQUIRED_EXPORTS = [
  'sendCanSpamCompliantEmail',
  'getUncachableResendClient',
  'isResendConfigured',
  'isHardBounced',
  'isEmailUnsubscribed',
];
for (const name of REQUIRED_EXPORTS) {
  record(
    `emailCore exports ${name}`,
    new RegExp(`export\\s+(?:async\\s+)?(?:function|const|interface)\\s+${name}\\b`).test(emailCore)
  );
}

// 5. Resend SDK imported in the right place
record(
  'emailCore imports Resend SDK',
  /import\s*\{\s*Resend\s*\}\s*from\s*['"]resend['"]/.test(emailCore)
);

// 6. Routes mount-point audit
const routesTs = readFile('server/routes.ts');
record(
  '/api/email mounted in server/routes.ts',
  /app\.use\(['"]\/api\/email['"],\s*emailRouter\)/.test(routesTs)
);
record(
  '/api/inbound/email mounted',
  /app\.use\(['"]\/api\/inbound\/email['"],\s*inboundEmailRouter\)/.test(routesTs)
);

const commsDomain = readFile('server/routes/domains/comms.ts');
const COMMS_MOUNTS = [
  ['/api/emails', /app\.use\(["']\/api\/emails["'],[^)]*emailRouter\)/],
  ['/api/email (unsubscribe public)', /app\.use\(["']\/api\/email["'],\s*emailUnsubscribeRouter\)/],
  ['/api/internal-email', /app\.use\(["']\/api\/internal-email["'],[^)]*internalEmailRouter\)/],
  ['/api/email-attachments', /app\.use\(["']\/api\/email-attachments["'],[^)]*emailAttachmentsRouter\)/],
  ['registerExternalEmailRoutes call', /registerExternalEmailRoutes\(app/],
];
for (const [name, re] of COMMS_MOUNTS) record(`comms mounts ${name}`, re.test(commsDomain));

// 7. Front-end ↔ back-end contract — every front-end URL should hit a real route
const FRONT_TO_BACK = [
  ['/api/external-emails',           /router\.(get|post|patch|delete)\(["']\/["']/, 'externalEmailRoutes.ts'],
  ['/api/external-emails/:id/send',  /router\.post\(["']\/:id\/send["']/, 'externalEmailRoutes.ts'],
  ['/api/external-emails/enhance',   /router\.post\(["']\/enhance["']/, 'externalEmailRoutes.ts'],
  ['/api/external-emails/analyze',   /router\.post\(["']\/analyze["']/, 'externalEmailRoutes.ts'],
  ['/api/external-emails/reply-suggestions', /router\.post\(["']\/reply-suggestions["']/, 'externalEmailRoutes.ts'],
  ['/api/email/addresses/mine',      /emailRouter\.get\(['"]\/addresses\/mine['"]/, 'email/emailRoutes.ts'],
  ['/api/email/inbox',               /emailRouter\.get\(['"]\/inbox['"]/, 'email/emailRoutes.ts'],
  ['/api/email/send',                /emailRouter\.post\(['"]\/send['"]/, 'email/emailRoutes.ts'],
  ['/api/email/entity-context',      /(get|router\.get)\(['"][^'"]*entity-context/, 'emailEntityContextRoute.ts'],
  ['/api/email/unsubscribe',         /(get|post|router\.(get|post))\(['"][^'"]*\/?unsubscribe/, 'emailUnsubscribe.ts'],
];
for (const [url, re, file] of FRONT_TO_BACK) {
  const src = readFile(`server/routes/${file}`);
  record(
    `wired ${url} → ${file}`,
    !!src && re.test(src)
  );
}

// 8. Front-end calls reference real endpoints
const hubCanvas = readFile('client/src/components/email/EmailHubCanvas.tsx');
const FRONT_END_CALLS = [
  '/api/internal-email/inbox',
  '/api/internal-email/folders',
  '/api/internal-email/send',
  '/api/external-emails',
  '/api/external-emails/enhance',
  '/api/email-attachments/upload',
  '/api/email/addresses/mine',
  '/api/email/entity-context',
];
for (const url of FRONT_END_CALLS) {
  record(`front-end calls ${url}`, hubCanvas.includes(url));
}

// ─── Silent failure scan ─────────────────────────────────────────────────────
section('Silent failure scan');

// /api/email/send handler must surface Resend errors instead of swallowing them
{
  const src = readFile('server/routes/email/emailRoutes.ts');
  const detectsErrorField = /if \(resendResult\?\.error\)/.test(src);
  const tracksError = /sendError\s*=\s*[^\n]*resendResult\.error/.test(src) ||
                      /sendError\s*=\s*sendErr/.test(src);
  const surfacesFailure = /if \(sendError\) \{\s*return res\.status\(\d+\)/.test(src);
  const guardsCounter = /if \(sendError\) \{[^}]*\}\s*\n\s*\/\/[^\n]*\n\s*await pool\.query\([^)]*emails_sent_this_period/.test(src) ||
                        /if \(sendError\) \{[\s\S]{0,400}return res\.status\(\d+\)[\s\S]{0,200}\}\s*\n\s*\/\/[^\n]*\n\s*await pool\.query/.test(src);
  record('/api/email/send detects Resend.error field', detectsErrorField);
  record('/api/email/send tracks send failures in a variable', tracksError);
  record('/api/email/send returns non-2xx when delivery fails', surfacesFailure);
  record('/api/email/send only increments counter on success', guardsCounter,
         guardsCounter ? '' : 'fair-use counter may increment on failed sends',
         'high');
}

// emailService._deliver returns sendResult.success, never coerces
{
  const src = readFile('server/services/emailService.ts');
  const ok = /if \(sendResult\.success\)/.test(src) && /return \{ success: false, error/.test(src);
  record('emailService._deliver propagates failures', ok);
}

// emailCore.sendCanSpamCompliantEmail returns explicit success boolean
{
  const src = readFile('server/services/emailCore.ts');
  const allBranchesSetSuccess =
    /return \{ success: false, reason:/.test(src) &&
    /return \{ success: true, data: result \}/.test(src) &&
    /return \{ success: false, error \}/.test(src);
  record('sendCanSpamCompliantEmail returns explicit success on all branches', allBranchesSetSuccess);
}

// dev-mode noop client only fires in non-production
{
  const src = readFile('server/services/emailCore.ts');
  const guarded = /if \(isProd\) \{\s*log\.error\(`\[EMAIL\] PRODUCTION ERROR/.test(src) &&
                  /throw new Error\('Email delivery unavailable: Resend is not configured in production/.test(src);
  record('production never returns synthetic dev-* message ids', guarded);
}

// ─── Mobile responsiveness scan ──────────────────────────────────────────────
section('Mobile responsiveness scan');
{
  const src = readFile('server/services/emailTemplateBase.ts');
  record('emailLayout includes viewport meta',
    /<meta name="viewport" content="width=device-width,initial-scale=1"/.test(src));
  record('emailLayout injects @media query block',
    /@media only screen and \(max-width:\s*600px\)/.test(src));
  record('mobile rule collapses container to 100% width',
    /\.cl-container\s*\{[^}]*width:100% !important[^}]*max-width:100% !important/.test(src));
  record('mobile rule shrinks 32px gutter to 16px',
    /\.cl-px[^{]*\{[^}]*padding-left:16px !important[^}]*padding-right:16px !important/.test(src));
  record('mobile rule scales down h1',
    /\.cl-h1\s*\{[^}]*font-size:21px !important/.test(src));
  record('mobile rule stacks infoCard label/value',
    /\.cl-card-label,\s*\.cl-card-value\s*\{[^}]*display:block !important[^}]*width:100% !important/.test(src));
  record('mobile rule turns CTA into block-level button',
    /\.cl-cta-wrap a\s*\{[^}]*display:block !important[^}]*padding:14px 20px !important/.test(src));
  record('emailHeader emits cl-h1 / cl-px / cl-px-y classes',
    /class="cl-px"/.test(src) && /class="cl-px-y"/.test(src) && /class="cl-h1"/.test(src));
  record('emailBody emits cl-body class',
    /class="cl-body"/.test(src));
  record('infoCard emits cl-card-label / cl-card-value classes',
    /class="cl-card-label"/.test(src) && /class="cl-card-value"/.test(src));
  record('infoCard value column uses word-break for long content',
    /word-wrap:break-word;word-break:break-word/.test(src));
  record('alertBox emits cl-alert class',
    /class="cl-alert"/.test(src));
  record('ctaButton emits cl-cta-wrap class',
    /class="cl-cta-wrap"/.test(src));
}

// ─── Forward composer body content ───────────────────────────────────────────
section('Forward composer body content');
{
  const src = readFile('client/src/components/email/EmailHubCanvas.tsx');
  // External-emails mapper must surface bodyText and bodyHtml from the API row
  // so downstream consumers (forward, reply, AI summary) get real content.
  const mapperHydrates =
    /bodyText:\s*item\.email\?\.bodyText\s*\?\?\s*null/.test(src) &&
    /bodyHtml:\s*item\.email\?\.bodyHtml\s*\?\?\s*null/.test(src);
  record('external-email mapper hydrates bodyText AND bodyHtml from API', mapperHydrates,
    mapperHydrates ? '' : 'mapper still hardcodes bodyText: null — forward bodies will be blank for HTML-only emails',
    'high');

  // Forward composer must fall back to bodyHtml when bodyText is missing.
  const forwardFallsBack =
    /forwardFrom\.bodyHtml/.test(src) &&
    /Forwarded message/.test(src) &&
    /forwardFrom\.bodyText/.test(src);
  record('forward composer falls back to bodyHtml when bodyText empty',
    forwardFallsBack, '', 'high');

  // Forward composer must include From/Date/Subject headers so the recipient
  // can see what was forwarded.
  const includesHeaders =
    /`From: \$\{fromLine\}`/.test(src) &&
    /`Date: \$\{dateLine\}`/.test(src) &&
    /`Subject: \$\{forwardFrom\.subject/.test(src) &&
    /`To: \$\{toLine\}`/.test(src);
  record('forward composer includes From / Date / Subject / To header lines', includesHeaders);

  // Forward composer must never produce a literally-empty body
  const guardsBlankBody =
    /\(Original message had no readable body/.test(src);
  record('forward composer fallback prevents literally-empty body', guardsBlankBody);
}

// Inbound forwards from inboundEmailRoutes also use buildForwardHtml
{
  const src = readFile('server/routes/inboundEmailRoutes.ts');
  const usesBuilder = /buildForwardHtml\(\{/.test(src);
  const builderHandlesEmpty = /\(Original message had no text or HTML body/.test(src);
  record('inbound forwards route through buildForwardHtml', usesBuilder);
  record('buildForwardHtml emits explicit notice for empty bodies', builderHandlesEmpty);
}

// ─── Live Resend round-trip (REST API, no SDK required) ──────────────────────
section('Live Resend send (REST round-trip)');

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const toEmail = process.env.VERIFY_TO || 'delivered@resend.dev';

if (!apiKey) {
  record(
    'RESEND_API_KEY present',
    false,
    'env var not set — cannot perform live send. Provide a Resend test key (re_test_…) and re-run.',
    'low'
  );
  // Even without a key, prove the egress path to api.resend.com is open and
  // that Resend recognises the request shape. A 401 with a structured
  // validation_error body confirms the wire-level contract is sound.
  try {
    const probe = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer re_test_invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [toEmail], subject: 'probe', html: '<p>probe</p>' }),
    });
    const probeBody = await probe.json().catch(() => ({}));
    const isExpected401 = probe.status === 401 && probeBody?.name === 'validation_error';
    record(
      'Resend API reachable (connectivity probe)',
      isExpected401,
      isExpected401
        ? `HTTP 401 validation_error — egress to api.resend.com confirmed; supply a real key for end-to-end send`
        : `unexpected response: HTTP ${probe.status} ${JSON.stringify(probeBody).slice(0, 200)}`,
      'high'
    );
  } catch (err) {
    record('Resend API reachable (connectivity probe)', false, err.message, 'high');
  }
} else {
  const isTestKey = apiKey.startsWith('re_test_');
  console.log(`  ${DIM}using ${isTestKey ? 'test' : 'live'} key, from=${fromEmail}, to=${toEmail}${RST}`);

  const subject = `CoAIleague email verification — ${new Date().toISOString()}`;
  const html = `
    <h2>CoAIleague email verification</h2>
    <p>This is a real email fired through the same Resend API the platform uses.</p>
    <ul>
      <li><strong>From:</strong> ${fromEmail}</li>
      <li><strong>To:</strong> ${toEmail}</li>
      <li><strong>When:</strong> ${new Date().toISOString()}</li>
      <li><strong>Key type:</strong> ${isTestKey ? 'test (re_test_…)' : 'live'}</li>
    </ul>
    <p>If you see this with a Resend message id, the wiring is real.</p>
  `;
  const text = 'CoAIleague email verification — see HTML version.';

  try {
    const t0 = Date.now();
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
        text,
      }),
    });
    const elapsed = Date.now() - t0;
    const bodyText = await resp.text();
    let body;
    try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText }; }

    if (!resp.ok) {
      record(
        'Resend API accepted the send',
        false,
        `HTTP ${resp.status} ${resp.statusText} in ${elapsed}ms — body: ${bodyText.slice(0, 400)}`,
        'high'
      );
    } else if (!body?.id) {
      record(
        'Resend returned a message id',
        false,
        `HTTP 200 but no id in response: ${bodyText.slice(0, 400)}`,
        'high'
      );
    } else {
      record(
        'Resend API accepted the send',
        true,
        `HTTP ${resp.status} in ${elapsed}ms`
      );
      record(
        'Resend returned a message id',
        true,
        `id=${body.id}`
      );
      console.log(`\n${GRN}  ✓ proof-of-delivery message id: ${body.id}${RST}`);
      console.log(`  ${DIM}  (test addresses delivered@resend.dev are accepted but not delivered to a real inbox)${RST}`);
    }
  } catch (err) {
    record(
      'Resend API reachable',
      false,
      `network/runtime error: ${err.message}`,
      'high'
    );
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
section('Summary');
const passed = checks.filter(c => c.pass).length;
const failed = checks.filter(c => !c.pass);
const failedHigh = failed.filter(c => c.severity !== 'low');
console.log(`  ${passed}/${checks.length} checks passed`);
if (failedHigh.length) {
  console.log(`\n${RED}FAILED:${RST}`);
  for (const c of failedHigh) console.log(`  - ${c.name} — ${c.detail || 'see above'}`);
}

process.exit(failedHigh.length === 0 ? 0 : 1);
