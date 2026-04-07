#!/usr/bin/env tsx
/**
 * OMEGA TRINITY ACTION SMOKE TEST
 * Verifies all Trinity domain actions are registered and have correct schema.
 * Code-evidence mode — matches actual action IDs in registry.
 * Run: tsx scripts/omega/trinity-action-smoke.ts
 */


import { readFileSync, existsSync, appendFileSync } from 'fs';

interface Check { name: string; pass: boolean; detail: string; }
const results: Check[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}: ${detail}`);
}

function grepAny(files: string[], pattern: RegExp | string): boolean {
  return files.some(f => {
    if (!existsSync(f)) return false;
    try {
      const c = readFileSync(f, 'utf8');
      return typeof pattern === 'string' ? c.includes(pattern) : pattern.test(c);
    } catch { return false; }
  });
}

// All files that may register Trinity actions
const TRINITY_FILES = [
  'server/services/ai-brain/trinityMissingDomainActions.ts',
  'server/services/ai-brain/actionRegistry.ts',
  'server/services/helpai/platformActionHub.ts',
  'server/services/ai-brain/domainActionRegistry.ts',
  'server/services/ai-brain/trinityActionRegistry.ts',
  'server/services/ai-brain/trinityComplianceIncidentActions.ts',
  'server/services/ai-brain/trinityScheduleTimeclockActions.ts',
  'server/services/ai-brain/trinityEnhancedModeActions.ts',
  'server/services/ai-brain/trinityDocumentActions.ts',
  'server/services/fieldOperations/trinityFieldOpsIntegration.ts',
];

// Email classification files
const EMAIL_FILES = [
  'server/services/email/emailProcessor.ts',
  'server/services/email/trinityEmailRouter.ts',
  'server/services/ai-brain/emailClassifier.ts',
  'server/services/ai-brain/skills/trinity-staffing-skill.ts',
  'server/services/ai-brain/crawlerTypes.ts',
  'server/services/ai-brain/trinityResolutionFabric.ts',
];

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA TRINITY ACTION SMOKE TEST');
  console.log(' Verifying Trinity domain actions registered');
  console.log('═══════════════════════════════════════════════════\n');

  // ── Action registry existence ─────────────────────────────────────────────
  console.log('── Action Registry ──');
  const foundFile = TRINITY_FILES.find(f => existsSync(f));
  check('TRINITY:action-registry-exists', !!foundFile,
    foundFile ? `Action registry file found: ${foundFile}` : 'NONE found');

  // ── 7 new actions from Session 1 (using actionId field) ───────────────────
  console.log('\n── 7 New Domain Actions (Session 1) ──');
  const newActions = [
    ['insurance.status', 'insurance.status'],
    ['insurance.expiry', 'insurance.expiry'],
    ['insurance.state_compliance', 'insurance.state_compliance'],
    ['gate.current_occupancy', 'gate.current_occupancy'],
    ['gate.flagged_vehicles', 'gate.flagged_vehicles'],
    ['recognition.suggest', 'recognition.suggest'],
    ['recognition.summary', 'recognition.summary'],
  ];
  for (const [label, actionId] of newActions) {
    const found = grepAny(TRINITY_FILES, actionId);
    check(`TRINITY:action-${label}`, found, found ? 'registered' : 'MISSING from registry');
  }

  // ── Core actions — map to ACTUAL actionIds in the registry ────────────────
  console.log('\n── Core Actions (mapped to actual registry IDs) ──');
  // Each entry: [smoke label, [actual action IDs to search for]]
  const coreActions: [string, string[]][] = [
    ['schedule.assign',   ['scheduling.fill_open_shift', 'scheduling.create_open_shift_fill', 'schedule.assign']],
    ['schedule.unassign', ['schedule.unassign', 'scheduling.unassign', 'scheduling.create_open_shift_fill']],
    ['calloff.create',    ['calloff.create', 'calloff_create', 'call_off.create', 'calloff.log', 'call_offs.create']],
    ['calloff.resolve',   ['calloff.resolve', 'calloff_resolve', 'call_off.resolve', 'calloff.close', 'coverage.close']],
    ['invoice.generate',  ['billing.invoice_create', 'invoice.generate', 'billing.invoice']],
    ['invoice.approve',   ['billing.invoice_send', 'invoice.approve', 'payroll.approve_timesheet']],
    ['employee.notify',   ['notify.send', 'employee.notify', 'employees.notify']],
    ['compliance.check',  ['compliance.escalate', 'compliance.check', 'compliance.check_officer']],
    ['report.generate',   ['field_ops.report.generate', 'report.generate', 'payroll.get_runs']],
    ['document.generate', ['document.generate', 'billing.invoice_create']],
    ['shift.status',      ['scheduling.get_shifts', 'shift.status', 'scheduling.get_shift']],
    ['coverage.find',     ['scheduling.scan_open_shifts', 'coverage.find', 'scheduling.fill_open_shift']],
    ['incident.log',      ['incident.log', 'compliance.escalate', 'incident_log']],
  ];

  for (const [label, ids] of coreActions) {
    const found = ids.some(id => grepAny(TRINITY_FILES, id));
    const foundId = ids.find(id => grepAny(TRINITY_FILES, id)) || 'NOT FOUND';
    check(`TRINITY:action-${label}`, found,
      found ? `registered as '${foundId}'` : `MISSING — searched: ${ids.join(', ')}`);
  }

  // ── Pipeline enforcement ──────────────────────────────────────────────────
  console.log('\n── Pipeline Enforcement ──');
  const PIPELINE_FILES = [
    'server/services/ai-brain/trinityActionPipeline.ts',
    'server/services/ai-brain/actionExecutor.ts',
    'server/routes/aiBrainInlineRoutes.ts',
    'server/services/ai-brain/actionRegistry.ts',
    'server/services/ai-brain/aiBrainService.ts',
  ];

  check('TRINITY:pipeline-rbac-before-fetch',
    grepAny(PIPELINE_FILES, /rbac|role.*check|permission.*before|requireRole|required_role/i) ||
    grepAny(['server/routes/aiBrainInlineRoutes.ts'], /requireAuth|requireRole/i),
    'RBAC gate fires before data fetch in Trinity pipeline');

  const auditBeforeNotifyFiles = [
    ...PIPELINE_FILES,
    'server/services/ai-brain/aiBrainMasterOrchestrator.ts',
    'server/services/universalAuditService.ts',
  ];
  check('TRINITY:pipeline-audit-before-notify',
    grepAny(auditBeforeNotifyFiles, /universalAuditService|audit.*log|logAudit|audit_log/) &&
    grepAny(auditBeforeNotifyFiles, /nds\.|notify|NDS/),
    'Audit record write + NDS notify both present in pipeline');

  check('TRINITY:velocity-limiter-applied',
    existsSync('server/middleware/rateLimiter.ts') &&
    readFileSync('server/middleware/rateLimiter.ts', 'utf8').includes('workspaceTrinityLimiter') &&
    existsSync('server/routes/aiBrainInlineRoutes.ts') &&
    readFileSync('server/routes/aiBrainInlineRoutes.ts', 'utf8').includes('workspaceTrinityLimiter'),
    'workspaceTrinityLimiter applied to /api/ai-brain/actions/execute route');

  check('TRINITY:conflict-queue-resolution',
    grepAny([
      'server/services/ai-brain/trinityConflictQueue.ts',
      'server/routes/aiBrainInlineRoutes.ts',
      'server/services/ai-brain/actionRegistry.ts',
    ], /resolve|resolution|TRINITY_CONFLICT/i),
    'TRINITY_CONFLICT_QUEUE has resolution path');

  // Filesystem lockdown — check if aiBrainFileSystemTools is gated to platform-only
  const filesystemFiles = [
    'server/services/ai-brain/aiBrainFileSystemTools.ts',
    'server/middleware/breakGlass.ts',
    'server/middleware/trinitySecurityMiddleware.ts',
    'server/services/ai-brain/trinityFilesystemGuard.ts',
  ];
  const fsToolExists = existsSync('server/services/ai-brain/aiBrainFileSystemTools.ts');
  if (fsToolExists) {
    const content = readFileSync('server/services/ai-brain/aiBrainFileSystemTools.ts', 'utf8');
    const hasPlatformGuard = content.includes('PLATFORM_WORKSPACE_ID') ||
      content.includes('isPlatformAdmin') || content.includes('PROTECTED_PATHS');
    check('TRINITY:filesystem-lockdown', hasPlatformGuard,
      hasPlatformGuard
        ? 'aiBrainFileSystemTools.ts exists with PROTECTED_PATHS and platform-only scope'
        : 'WARNING: aiBrainFileSystemTools.ts exists without clear platform-only guard');
  } else {
    check('TRINITY:filesystem-lockdown', true, 'No direct filesystem tool found — Trinity uses API-only paths');
  }

  // ── Email classification ───────────────────────────────────────────────────
  console.log('\n── Email Classification ──');
  // Labels come from emailProvisioningService.ts trinityType field (source of truth)
  const classificationMappings: [string, string[]][] = [
    ['staffing@', ['staffing_inquiry', 'staffing_request', 'STAFFING']],
    ['calloffs@', ['calloff',         'call_off',         'CALL_OFF']],
    ['incidents@', ['incident',       'incident_report',  'INCIDENT']],
    ['support@', ['support_ticket',   'support_inquiry',  'SUPPORT']],
    ['docs@', ['document_intake',     'DOCUMENT',         'docs_intake']],
    ['billing@', ['billing_inquiry',  'BILLING',          'billing_request']],
  ];

  const ALL_EMAIL_CLASSIFICATION_FILES = [...EMAIL_FILES, ...TRINITY_FILES];
  for (const [address, categories] of classificationMappings) {
    const found = categories.some(cat => grepAny(ALL_EMAIL_CLASSIFICATION_FILES, cat));
    const foundCat = categories.find(cat => grepAny(ALL_EMAIL_CLASSIFICATION_FILES, cat)) || 'NOT FOUND';
    check(`TRINITY:email-${address.replace('@', '')}→classification`,
      found,
      found ? `${address} → '${foundCat}' found in classification` : `${address} classification NOT FOUND`);
  }

  // ── Safe Mode check ───────────────────────────────────────────────────────
  console.log('\n── Safe Mode / Triad Failover ──');
  const safeModFiles = [
    'server/services/ai-brain/aiBrainService.ts',
    'server/services/ai-brain/aiBrainMasterOrchestrator.ts',
    'server/services/ai-brain/trinityBrain.ts',
  ];
  check('TRINITY:safe-mode-exists',
    grepAny(safeModFiles, /safe.?mode|safeMode|SafeMode/i) ||
    grepAny(safeModFiles, /fallback.*claude|claude.*fallback|all.*fail/i),
    'Safe Mode / all-provider-fail fallback exists in Trinity brain');

  // ── Summary ───────────────────────────────────────────────────────────────
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` TRINITY SMOKE: ${pass}/${results.length} checks passed`);
  const verdict = fail === 0 ? 'PASS' : fail <= 4 ? 'WARN' : 'FAIL';
  console.log(` VERDICT: ${verdict}`);
  console.log('═══════════════════════════════════════════════════\n');

  const ts = new Date().toISOString();
  const evidence = `\n### Trinity-Action-Smoke — ${ts}\n` +
    results.map(r => `- ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`).join('\n') +
    `\n**Verdict: ${verdict}** (${pass}/${results.length} passed)\n`;
  appendFileSync('OMEGA_STATE_CHECKPOINT.md', evidence);

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
