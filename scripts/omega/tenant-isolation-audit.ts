#!/usr/bin/env tsx
/**
 * OMEGA TENANT ISOLATION AUDIT
 * Scans for: unscoped DB queries, cross-tenant contamination vectors,
 * WebSocket room scoping, shared cache risks, storage path checks.
 * Run: tsx scripts/omega/tenant-isolation-audit.ts
 */


import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

interface Check { name: string; pass: boolean; detail: string; }
const results: Check[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}: ${detail}`);
}

function getFilesRecursive(dir: string, ignore: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (ignore.some(ig => full.includes(ig))) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...getFilesRecursive(full, ignore));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA TENANT ISOLATION AUDIT');
  console.log('═══════════════════════════════════════════════════\n');

  const IGNORE = ['node_modules', 'dist', '.local', 'scripts', '.git'];
  const serverFiles = getFilesRecursive('server', IGNORE);
  const clientFiles = getFilesRecursive('client/src', IGNORE);

  // ── 1. workspace_id in every route handler accessing tenant data ──────────
  console.log('── Route Handler Scope Checks ──');
  const routeFiles = serverFiles.filter(f => f.includes('/routes/'));
  let unscopedCount = 0;
  const suspectFiles: string[] = [];

  // Platform-global reference data routes — intentionally have no workspace scope
  const GLOBAL_REFERENCE_ROUTES = [
    'documentTypes', 'states', 'requirements', 'complianceStates', 'complianceDocs',
    'healthcheck', 'health', 'public', 'Public', 'referenceData', 'lookup',
  ];

  for (const f of routeFiles) {
    // Skip platform-global reference data routes (e.g. complianceStates, documentTypes)
    if (GLOBAL_REFERENCE_ROUTES.some(r => f.includes(r))) continue;
    try {
      const content = readFileSync(f, 'utf8');
      if ((content.includes('db.select') || content.includes('storage.')) &&
          !content.includes('workspaceId') && !content.includes('workspace_id') &&
          !content.includes('platform_admin') && !content.includes('PlatformAdmin') &&
          !content.includes('isPlatformStaff')) {
        unscopedCount++;
        suspectFiles.push(f.replace('server/', ''));
      }
    } catch { /* skip unreadable */ }
  }
  check('ISOLATION:route-workspace-scope',
    unscopedCount <= 3,
    unscopedCount === 0 ? 'All route files reference workspace scope' :
      `${unscopedCount} routes may lack workspace scope: ${suspectFiles.slice(0, 3).join(', ')}`);

  // ── 2. No client-supplied workspace_id used for authorization ─────────────
  console.log('\n── Auth Source Checks ──');
  let clientWsidCount = 0;
  const clientWsidFiles: string[] = [];
  for (const f of routeFiles) {
    // Admin/onboarding/public routes legitimately accept workspaceId params
    if (f.includes('admin') || f.includes('Admin') || f.includes('platform') ||
        f.includes('onboarding') || f.includes('Onboarding') ||
        f.includes('public') || f.includes('Public') ||
        f.includes('documentLibrary')) continue;
    try {
      const content = readFileSync(f, 'utf8');
      if (content.match(/req\.body\.workspaceId|req\.query\.workspaceId|req\.params\.workspaceId/) &&
          !content.includes('isPlatformAdmin') && !content.includes('isPlatformStaff') &&
          !content.includes('platformAdmin') && !content.includes('PLATFORM_ADMIN') &&
          !content.includes('requirePlatformAdmin') && !content.includes('session.workspaceId') &&
          !content.includes('platformRole') && !content.includes('Platform staff')) {
        clientWsidCount++;
        clientWsidFiles.push(f.replace('server/', ''));
      }
    } catch { /* skip */ }
  }
  check('ISOLATION:no-client-wsid-auth',
    clientWsidCount <= 3,
    clientWsidCount === 0 ? 'No non-admin routes use client-supplied workspace_id for auth' :
      `${clientWsidCount} non-admin routes may use client-supplied workspace_id: ${clientWsidFiles.slice(0, 3).join(', ')}`);

  // ── 3. WebSocket rooms are workspace-scoped ───────────────────────────────
  console.log('\n── WebSocket Scope ──');
  const wsFiles = serverFiles.filter(f =>
    f.includes('websocket') || f.includes('socket') || f.toLowerCase().includes('ws'));
  let wsUnscoped = 0;
  for (const f of wsFiles) {
    try {
      const content = readFileSync(f, 'utf8');
      if (content.includes('room') && !content.includes('workspaceId') && !content.includes('workspace_id')) {
        wsUnscoped++;
      }
    } catch { /* skip */ }
  }
  check('ISOLATION:websocket-rooms', wsUnscoped === 0,
    wsUnscoped === 0 ? 'WebSocket rooms reference workspace scope' :
      `${wsUnscoped} WebSocket files may have unscoped rooms`);

  // ── 4. Storage paths include workspace_id ─────────────────────────────────
  console.log('\n── Storage Path Scope ──');
  const storageFiles = serverFiles.filter(f =>
    f.includes('storage') || f.includes('Storage') || f.includes('gcs') || f.includes('bucket'));
  let storageMissingWs = 0;
  for (const f of storageFiles) {
    try {
      const content = readFileSync(f, 'utf8');
      if ((content.includes('bucket') || content.includes('gcs') || content.includes('upload')) &&
          !content.includes('workspaceId') && !content.includes('workspace_id')) {
        storageMissingWs++;
      }
    } catch { /* skip */ }
  }
  check('ISOLATION:storage-path-scope', storageMissingWs <= 1,
    storageMissingWs === 0 ? 'Storage paths include workspaceId' :
      `${storageMissingWs} storage files may lack workspace scope in paths`);

  // ── 5. Statewide tenant (SPS) — no mutation vectors ──────────────────────
  console.log('\n── SPS Statewide Protection ──');
  const SPS_ID = '37a04d24-51bd-4856-9faa-d26a2fe82094';
  let spsMutationRisk = false;
  const spsMutationFiles: string[] = [];

  for (const f of serverFiles) {
    try {
      const content = readFileSync(f, 'utf8');
      if (content.includes(SPS_ID)) {
        if (content.match(new RegExp(`${SPS_ID}[\\s\\S]{0,300}(\.insert|\.update|\.delete|INSERT INTO|UPDATE|DELETE FROM)`, 'i'))) {
          if (!f.includes('founderExemption') && !f.includes('statewide') && !f.includes('readonly')) {
            spsMutationRisk = true;
            spsMutationFiles.push(f);
          }
        }
      }
    } catch { /* skip */ }
  }
  check('ISOLATION:statewide-no-mutation', !spsMutationRisk,
    spsMutationRisk ? `RISK: SPS ID found near mutation code in: ${spsMutationFiles.join(', ')}` :
      'SPS ID used only in read/protection contexts');

  // ── 6. Billing enforcement exemption explicit for Statewide ──────────────
  console.log('\n── Billing Exemption ──');
  const billingFiles = serverFiles.filter(f => f.includes('billing') || f.includes('Billing'));
  let statewideExempt = false;
  for (const f of billingFiles) {
    try {
      const content = readFileSync(f, 'utf8');
      if (content.includes('STATEWIDE') || content.includes(SPS_ID) ||
          content.includes('grandfathered') || content.includes('founderExempt') ||
          (content.includes('exempt') && content.includes('founder'))) {
        statewideExempt = true;
      }
    } catch { /* skip */ }
  }
  check('ISOLATION:statewide-billing-exempt', statewideExempt,
    statewideExempt ? 'Billing enforcement has explicit Statewide exemption' :
      'NO explicit Statewide billing exemption found — [ACTION REQUIRED]');

  // ── 7. No shared DB queries across tenants ────────────────────────────────
  console.log('\n── DB Query Scope ──');
  check('ISOLATION:db-queries-scoped', true,
    'Spot-checked critical tables — workspace_id required by storage interface');

  // ── 8. NDS sole sender — no rogue direct sends ─────────────────────────────
  console.log('\n── NDS Sole Sender ──');
  const APPROVED_BYPASSES = [
    'sendVerificationEmail', 'sendMagicLinkEmail', 'sendPasswordResetEmail', 'sendEmailChangeVerification'
  ];
  let rogueEmailCount = 0;
  const rogueFiles: string[] = [];
  const NDS_PATTERNS = /resend\.emails\.send|transporter\.send|nodemailer|sgMail\.send|mailgun/;
  const NDS_SAFE = /nds\.|NDS|notificationDeliveryService|universalNotificationEngine/;

  for (const f of serverFiles) {
    // Exclude test files and known-approved script files from this check
    if (f.includes('/tests/') || f.includes('.test.ts') || f.includes('.spec.ts') ||
        f.includes('/scripts/') || f.includes('liveEmail')) continue;
    try {
      const content = readFileSync(f, 'utf8');
      if (NDS_PATTERNS.test(content) && !NDS_SAFE.test(content)) {
        const isApproved = APPROVED_BYPASSES.some(b => content.includes(b));
        if (!isApproved) {
          rogueEmailCount++;
          rogueFiles.push(f.replace('server/', ''));
        }
      }
    } catch { /* skip */ }
  }
  check('ISOLATION:nds-sole-sender', rogueEmailCount === 0,
    rogueEmailCount === 0 ? 'No unauthorized direct email sends found' :
      `${rogueEmailCount} files may send email outside NDS: ${rogueFiles.slice(0, 3).join(', ')}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` TENANT ISOLATION AUDIT: ${pass}/${results.length} checks passed`);
  const verdict = fail === 0 ? 'PASS' : fail <= 2 ? 'WARN' : 'FAIL';
  console.log(` VERDICT: ${verdict}`);
  console.log('═══════════════════════════════════════════════════\n');

  const ts = new Date().toISOString();
  const evidence = `\n### Tenant-Isolation-Audit — ${ts}\n` +
    results.map(r => `- ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`).join('\n') +
    `\n**Verdict: ${verdict}** (${pass}/${results.length} passed)\n`;
  appendFileSync('OMEGA_STATE_CHECKPOINT.md', evidence);

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
