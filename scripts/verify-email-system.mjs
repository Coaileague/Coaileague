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

// ─── Outbound send loop integrity ────────────────────────────────────────────
section('Outbound send loop integrity');
{
  const src = readFile('server/email.ts');
  const truthful = /if \(!result\.success\)\s*\{[^}]*return\s*\{[^}]*success:\s*false[^}]*error:/.test(src);
  record('server sendEmail propagates failure with reason', truthful, '', 'high');
  const lazyInits = /await getUncachableResendClient\(\)/.test(src);
  record('server sendEmail lazy-initialises Resend client (avoids first-call silent skip)', lazyInits);
}
{
  const src = readFile('server/routes/externalEmailRoutes.ts');
  const checksSuccess = /if \(!result\.success\)\s*\{[\s\S]{0,400}status:\s*'failed'/.test(src);
  const returnsFailure = /return res\.status\(502\)\.json\(\{[\s\S]{0,200}success:\s*false/.test(src);
  record('/api/external-emails/:id/send checks result.success', checksSuccess, '', 'high');
  record('/api/external-emails/:id/send returns 502 when delivery fails', returnsFailure);
}

// ─── Trinity staffing workflow loop ──────────────────────────────────────────
// The full inbound→Trinity→outbound chain must remain wired:
//   1. Resend webhook receives staffing email
//   2. Trinity AI greeting fires back to sender
//   3. inboundOpportunityAgent claims a shift
//   4. Winner: sendStaffingOnboardingInvitation fires
//   5. Loser:  staffingClaimService.sendDropNotifications fires
section('Trinity staffing workflow loop');
{
  const webhook = readFile('server/routes/resendWebhooks.ts');
  record('Resend webhook fires Trinity AI greeting',
    /emailService\.sendTrinityAIGreeting\(/.test(webhook));
  record('Resend webhook hands off to inboundOpportunityAgent',
    /inboundOpportunityAgent\.processInboundEmail\(/.test(webhook));

  const agent = readFile('server/services/inboundOpportunityAgent.ts');
  record('inboundOpportunityAgent sends onboarding invitation on win',
    /emailService\.sendStaffingOnboardingInvitation\(/.test(agent), '', 'high');
  record('inboundOpportunityAgent dispatches drop notifications on loss',
    /staffingClaimService\.sendDropNotifications\(/.test(agent), '', 'high');

  const inbound = readFile('server/services/trinity/trinityInboundEmailProcessor.ts');
  record('processStaffing routes calloffs to processCalloff',
    /wantsCalloff[\s\S]{0,200}processCalloff\(/.test(inbound));
  record('processStaffing triggers trinityAutonomousScheduler',
    /trinityAutonomousScheduler\.executeAutonomousScheduling\(/.test(inbound));
  record('processStaffing logs failures with needsReview flag',
    /needsReview:\s*true,\s*reviewReason:/.test(inbound));
}

// ─── Inbound webhook security ────────────────────────────────────────────────
section('Inbound webhook security');
{
  const src = readFile('server/routes/resendWebhooks.ts');
  record('Resend webhook verifies Svix signature',
    /Svix\b|svix-signature/i.test(src) && /timingSafeEqual|timingsafeequal/i.test(src),
    '', 'high');
  record('Resend webhook rejects requests with missing Svix headers',
    /Missing Svix headers/.test(src));
  record('Resend webhook tolerates timestamp drift bound',
    /timestamp/i.test(src));
}

// ─── Front-end loop polish ───────────────────────────────────────────────────
section('Front-end loop polish');
{
  const src = readFile('client/src/components/email/EmailHubCanvas.tsx');
  record('inbox query throws on non-OK responses',
    /Inbox request failed: HTTP/.test(src), '', 'high');
  record('inbox surfaces error state with retry button',
    /data-testid="state-inbox-error"/.test(src) && /data-testid="button-inbox-retry"/.test(src));
  record('inbox empty state has stable testid',
    /data-testid="state-inbox-empty"/.test(src));
  record('inbox loading skeleton has aria-busy',
    /aria-busy="true"/.test(src) || /aria-busy=\{true\}/.test(src));
  record('apiRequest throws on non-2xx (throwIfResNotOk wired)',
    /throwIfResNotOk\(res\)/.test(readFile('client/src/lib/queryClient.ts')));
  record('GlobalMutationErrorHandler subscribes to mutation cache',
    /getMutationCache\(\)\.subscribe/.test(readFile('client/src/components/GlobalMutationErrorHandler.tsx')));
  record('forward composer guards against blank body',
    /\(Original message had no readable body/.test(src));
}

// ─── Single-call external send (no orphan-draft race) ────────────────────────
section('Single-call external send');
{
  const src = readFile('server/routes/externalEmailRoutes.ts');
  record('POST /api/external-emails/send endpoint exists',
    /router\.post\(["']\/send["']/.test(src), '', 'high');
  record('single-call endpoint inserts and dispatches in one handler',
    /router\.post\(["']\/send["'][\s\S]{0,2000}db\.insert\(externalEmailsSent\)[\s\S]{0,2000}sendEmail\(/.test(src));
  record('single-call endpoint marks row failed on Resend rejection',
    /router\.post\(["']\/send["'][\s\S]{0,3000}status:\s*'failed'[\s\S]{0,500}return res\.status\(502\)/.test(src));
}
{
  const src = readFile('client/src/components/email/EmailHubCanvas.tsx');
  record('compose UI uses single-call /api/external-emails/send',
    /apiRequest\('POST',\s*'\/api\/external-emails\/send'/.test(src), '', 'high');
  record('compose UI no longer fires the legacy two-call sequence',
    !/external-emails\/\$\{resData\.id\}\/send/.test(src));
}

// ─── Optimistic UI mutations ─────────────────────────────────────────────────
section('Optimistic UI mutations');
{
  const src = readFile('client/src/components/email/EmailHubCanvas.tsx');
  const hasSnapshot = /const snapshotInboxes = \(\): CacheSnapshot/.test(src);
  const hasRestore = /const restoreInboxes = \(snap: CacheSnapshot\)/.test(src);
  const hasRemove = /const removeFromCache = \(emailId: string\)/.test(src);
  const hasUpdate = /const updateInCache = \(emailId: string/.test(src);
  record('optimistic helpers (snapshot/restore/remove/update) defined',
    hasSnapshot && hasRestore && hasRemove && hasUpdate);

  // Each mutation must have onMutate (apply optimistic change) AND
  // onError that calls restoreInboxes(ctx.snap) for proper rollback.
  const mutations = ['archiveMutation', 'deleteMutation', 'starMutation'];
  for (const m of mutations) {
    const block = src.slice(src.indexOf(`const ${m} = useMutation`), src.indexOf(`const ${m} = useMutation`) + 2500);
    const hasOnMutate = /onMutate:\s*async/.test(block);
    const cancelsQueries = /queryClient\.cancelQueries/.test(block);
    const rollsBack = /restoreInboxes\(ctx\.snap\)/.test(block);
    record(`${m} applies optimistic update`, hasOnMutate && cancelsQueries);
    record(`${m} rolls back cache on error`, rollsBack, '', 'high');
  }
}

// ─── Template per-category split ─────────────────────────────────────────────
section('Template per-category split');
{
  const idx = readFile('server/services/email/templates/index.ts');
  record('templates barrel exports combined emailTemplates',
    /export const emailTemplates = \{/.test(idx));
  record('templates barrel re-exports each category',
    /accountTemplates/.test(idx) && /billingTemplates/.test(idx) &&
    /supportTemplates/.test(idx) && /onboardingTemplates/.test(idx) &&
    /schedulingTemplates/.test(idx));

  for (const [file, expected] of [
    ['account', ['verification', 'passwordReset', 'employeeTemporaryPassword', 'accountDeactivation']],
    ['billing', ['subscriptionWelcome', 'subscriptionCancellation', 'paymentFailed']],
    ['support', ['supportTicketConfirmation', 'reportDelivery', 'maintenanceNotification']],
    ['onboarding', ['managerOnboardingNotification', 'clientWelcome', 'newMemberWelcome',
                    'employeeInvitation', 'supportRoleBriefing', 'onboardingComplete',
                    'organizationInvitation', 'publicLeadWelcome', 'assistedOnboardingHandoff']],
    ['scheduling', ['inboundOpportunityNotification', 'shiftOfferNotification']],
  ]) {
    const src = readFile(`server/services/email/templates/${file}.ts`);
    const allFound = expected.every(name => new RegExp(`^\\s+${name}: \\(data:`, 'm').test(src));
    record(`templates/${file}.ts contains [${expected.join(', ')}]`, allFound);
  }

  // emailService.ts must import from the new barrel and not redefine the const inline.
  const svc = readFile('server/services/emailService.ts');
  record('emailService imports emailTemplates from new barrel',
    /import \{ emailTemplates \} from "\.\/email\/templates"/.test(svc), '', 'high');
  record('emailService no longer defines inline emailTemplates const',
    !/^const emailTemplates = \{/m.test(svc));

  // Every template referenced in emailService.ts must still resolve.
  const callers = [...svc.matchAll(/emailTemplates\.([a-zA-Z]+)/g)].map(m => m[1]);
  const available = new Set();
  for (const file of ['account','billing','support','onboarding','scheduling']) {
    const src = readFile(`server/services/email/templates/${file}.ts`);
    for (const m of src.matchAll(/^\s+([a-zA-Z]+): \(data:/gm)) available.add(m[1]);
  }
  const missing = callers.filter(c => !available.has(c));
  record('every emailTemplates.X caller resolves to a defined template',
    missing.length === 0,
    missing.length ? `missing: ${[...new Set(missing)].join(', ')}` : `${callers.length} call sites, all resolve`,
    'high');
}

// ─── Auth & retry-queue use canonical wrapper ───────────────────────────────
section('Auth & retry-queue use canonical wrapper');
{
  const auth = readFile('server/services/authService.ts');
  // Each of the 4 auth emails (verification, magic-link, change-confirm,
  // change-security-notice) used to call client.emails.send directly. They
  // now MUST flow through sendCanSpamCompliantEmail with skipUnsubscribeCheck.
  const calls = (auth.match(/await sendCanSpamCompliantEmail\(/g) || []).length;
  record('authService routes ≥4 emails through sendCanSpamCompliantEmail',
    calls >= 4, `found ${calls} calls`, 'high');
  // The 4 direct client.emails.send calls in authService should be gone.
  const directCalls = (auth.match(/client\.emails\.send\(/g) || []).length;
  record('authService no longer issues direct client.emails.send calls',
    directCalls === 0, directCalls ? `still has ${directCalls}` : '', 'high');

  const svc = readFile('server/services/emailService.ts');
  // Retry queue must use the wrapper too — preserves hard-bounce suppression
  // across retries.
  record('emailService retry queue uses sendCanSpamCompliantEmail',
    /\/\/ Routed through sendCanSpamCompliantEmail so retries inherit/.test(svc) &&
    /this\.retryQueue\.delete\(job\.id\)/.test(svc));
  record('emailService retry queue drops hard-bounced retries instead of rescheduling',
    /Retry dropped \(suppressed\)/.test(svc));
}

// ─── Mobile-responsive wrapper for inline templates ─────────────────────────
section('Mobile wrapper for inline-HTML templates');
{
  const wrap = readFile('server/services/email/wrapInlineEmailHtml.ts');
  record('wrapInlineEmailHtml exists and exports the helper',
    /export function wrapInlineEmailHtml/.test(wrap));
  record('wrapper injects viewport meta',
    /<meta name="viewport"/.test(wrap));
  record('wrapper injects mobile @media block',
    /@media only screen and \(max-width: 600px\)/.test(wrap));
  record('wrapper collapses 600/640px legacy containers on phones',
    /max-width:6\d\d/.test(wrap) && /max-width: 100% !important/.test(wrap));
  record('wrapper collapses 32px gutters to 18px on phones',
    /padding: 18px 16px !important/.test(wrap));
  record('wrapper scales h1 down on phones',
    /font-size: 21px !important/.test(wrap));
  record('wrapper turns CTA buttons into block on phones',
    /a\[style\*="padding:14px [^"]*"\][\s\S]{0,400}display: block !important/.test(wrap));

  const svc = readFile('server/services/emailService.ts');
  // Every const html = `…`; in emailService.ts must be wrapped.
  const wrapped = (svc.match(/const html = wrapInlineEmailHtml\(`/g) || []).length;
  const unwrapped = (svc.match(/^    const html = `\s*$/gm) || []).length;
  record('all inline-HTML templates in emailService.ts are wrapped',
    wrapped >= 12 && unwrapped === 0,
    `wrapped=${wrapped}, unwrapped=${unwrapped}`,
    'high');

  const inb = readFile('server/routes/inboundEmailRoutes.ts');
  record('buildForwardHtml wraps its return value', /wrapInlineEmailHtml\(`/.test(inb));
}

// ─── Front-end: undo toast + a11y + keyboard shortcuts ──────────────────────
section('Front-end UX polish');
{
  const src = readFile('client/src/components/email/EmailHubCanvas.tsx');
  record('archive mutation offers Undo action',
    /archiveMutation = useMutation\(\{[\s\S]{0,2500}label:\s*'Undo'/.test(src));
  record('delete mutation offers Undo action',
    /deleteMutation = useMutation\(\{[\s\S]{0,2500}label:\s*'Undo'/.test(src));
  record('icon buttons carry aria-label',
    /aria-label="Refresh inbox"/.test(src) &&
    /aria-label="Reply \(r\)"/.test(src) &&
    /aria-label="Forward \(f\)"/.test(src));
  record('star button reflects state with aria-pressed',
    /aria-pressed=\{email\.isStarred\}/.test(src));
  record('keyboard shortcuts effect listens on window',
    /window\.addEventListener\('keydown', handler\)/.test(src));
  record('keyboard handler ignores typing in inputs/textareas',
    /isTyping/.test(src) && /tag === 'input'/.test(src));
  record('keyboard shortcuts cover j / k / r / f / e / # / s / c / \/',
    [/case 'j'/, /case 'k'/, /case 'r'/, /case 'f'/, /case 'e'/, /case '#'/, /case 's'/, /case 'c'/, /case '\/'/].every(re => re.test(src)));

  // setTimeout(200) hack must be gone from the send mutation
  const before = src.indexOf('const sendEmailMutation');
  const after = src.indexOf('const isLoading', before);
  const sendBlock = src.slice(before, after > 0 ? after : before + 4000);
  const fixedDelays = (sendBlock.match(/setTimeout\(r,\s*200\)/g) || []).length;
  record('sendEmailMutation no longer uses fixed 200ms artificial delays',
    fixedDelays === 0,
    fixedDelays ? `still has ${fixedDelays} fixed setTimeouts in send block` : '',
    'high');

  // useToast forwards action prop to UniversalToast
  const useToast = readFile('client/src/hooks/use-toast.ts');
  record('useToast forwards action prop to UniversalToast',
    /validAction/.test(useToast) && /label.*onClick/.test(useToast));
}

// isLoadError per-feed correctness
{
  const src = readFile('client/src/components/email/EmailHubCanvas.tsx');
  record('isLoadError fires on either feed (per-feed correctness)',
    /Boolean\(internalError \|\| externalError\)/.test(src), '', 'high');
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
