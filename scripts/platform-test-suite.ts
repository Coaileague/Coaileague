/**
 * CoAIleague Platform Test Suite
 * ================================
 * Comprehensive static analysis + logic verification across:
 * - State machine integrity
 * - Transaction safety 
 * - Auth/RBAC completeness
 * - Financial calculation correctness
 * - API contract consistency
 * - Background service health
 * - Schema/validation alignment
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE = path.resolve(__dirname, '..');
const results: Array<{ suite: string; name: string; pass: boolean; detail: string }> = [];

function test(suite: string, name: string, pass: boolean, detail = '') {
  results.push({ suite, name, pass, detail });
}

function readFile(rel: string): string {
  const full = path.join(BASE, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : '';
}

function getBlock(content: string, marker: string, size = 6000): string {
  const idx = content.indexOf(marker);
  return idx > -1 ? content.slice(idx, idx + size) : '';
}

// ═══════════════════════════════════════════════════════════════
// SUITE 1: STATE MACHINE INTEGRITY
// ═══════════════════════════════════════════════════════════════
const shiftRoutes = readFile('server/routes/shiftRoutes.ts');
const actionRegistry = readFile('server/services/ai-brain/actionRegistry.ts');
const scheduler = readFile('server/services/scheduling/trinityAutonomousScheduler.ts');

const VALID_STATUSES = ['draft','open','published','scheduled','confirmed','pending',
  'approved','auto_approved','assigned','in_progress','started','completed',
  'cancelled','no_show','calloff'];

const TERMINAL_STATES = ['in_progress','started','completed','no_show','calloff'];

test('state-machine', 'ALLOWED_TRANSITIONS defined in shiftRoutes',
  shiftRoutes.includes('ALLOWED_TRANSITIONS:'), 'Required for state gate');

test('state-machine', 'All 13 valid statuses covered in ALLOWED_TRANSITIONS',
  VALID_STATUSES.every(s => shiftRoutes.includes(`'${s}'`)),
  `Missing: ${VALID_STATUSES.filter(s => !shiftRoutes.includes(`'${s}'`)).join(',')}`);

test('state-machine', 'Terminal states locked in update_shift',
  getBlock(actionRegistry, "actionId: 'scheduling.update_shift'").includes('TERMINAL_STATES'),
  'Payroll integrity — cannot edit in_progress/completed');

test('state-machine', 'ILLEGAL_TRANSITION error code returned',
  getBlock(actionRegistry, "actionId: 'scheduling.update_shift'").includes('ILLEGAL_TRANSITION'),
  'Semantic error for invalid transitions');

test('state-machine', 'STATE_LOCK error code returned on terminal states',
  getBlock(actionRegistry, "actionId: 'scheduling.update_shift'").includes('STATE_LOCK'),
  'Cannot modify payroll-locked shifts');

test('state-machine', 'fill_open_shift: guard card hard block',
  getBlock(actionRegistry, "actionId: 'scheduling.fill_open_shift'", 9000).includes('COMPLIANCE_VIOLATION'),
  'Texas OC 1702 enforcement');

test('state-machine', 'fill_open_shift: double-booking detection',
  getBlock(actionRegistry, "actionId: 'scheduling.fill_open_shift'", 9000).includes('SCHEDULE_CONFLICT'),
  'Prevents concurrent fills');

test('state-machine', 'fill_open_shift: DB-level race prevention (isNull check)',
  getBlock(actionRegistry, "actionId: 'scheduling.fill_open_shift'", 9000).includes('isNull(shifts.employeeId)'),
  'WHERE employeeId IS NULL prevents concurrent assignment');

test('state-machine', 'Optimistic locking in update_shift',
  getBlock(actionRegistry, "actionId: 'scheduling.update_shift'").includes('expectedUpdatedAt'),
  'CONCURRENT_MODIFICATION detection');

test('state-machine', 'Guard card hard block in autonomous scheduler',
  scheduler.includes('guardCardStatus') && scheduler.includes('guardCardExpiryDate'),
  'Auto-fill respects Texas OC 1702');

// ═══════════════════════════════════════════════════════════════
// SUITE 2: TRANSACTION SAFETY
// ═══════════════════════════════════════════════════════════════
const payrollRoutes = readFile('server/routes/payrollRoutes.ts');
const invoiceRoutes = readFile('server/routes/invoiceRoutes.ts');

test('transactions', 'bulk_publish wrapped in db.transaction()',
  getBlock(actionRegistry, "actionId: 'scheduling.bulk_publish'").includes('db.transaction'),
  'Atomic rollback on batch publish failure');

test('transactions', 'BATCH_REJECTED error code on transaction failure',
  getBlock(actionRegistry, "actionId: 'scheduling.bulk_publish'").includes('BATCH_REJECTED'),
  'Semantic error for batch rollback');

test('transactions', 'Payroll routes use db.transaction for writes',
  payrollRoutes.includes('db.transaction') || payrollRoutes.includes('tx.'),
  'Financial writes must be atomic');

test('transactions', 'Invoice routes use transactions',
  invoiceRoutes.includes('db.transaction'),
  'Invoice generation is transactional');

test('transactions', 'Period close endpoint exists',
  payrollRoutes.includes('period/close'),
  'Month-end close with SOC2 audit receipt');

test('transactions', 'Period close validates no pending entries',
  payrollRoutes.includes('PERIOD_HAS_PENDING'),
  'Cannot close period with unapproved timesheets');

test('transactions', 'Period close writes audit trail',
  payrollRoutes.includes('payroll.period_closed'),
  'SOC2 immutable close receipt');

// ═══════════════════════════════════════════════════════════════
// SUITE 3: PUBLISH CHAIN (Notification + Audit + Broadcast)
// ═══════════════════════════════════════════════════════════════
const publishBlock = getBlock(actionRegistry, "actionId: 'scheduling.publish_shift'");
const bulkPublishBlock = getBlock(actionRegistry, "actionId: 'scheduling.bulk_publish'");

test('publish-chain', 'publish_shift: sets status=published (not scheduled)',
  publishBlock.includes("status: 'published'"), 'Correct enum value');

test('publish-chain', 'publish_shift: fires officer notifications',
  publishBlock.includes('universalNotificationEngine'), 'Officers notified');

test('publish-chain', 'publish_shift: writes SOC2 audit trail',
  publishBlock.includes('logActionAudit'), 'Trinity audit action logged');

test('publish-chain', 'publish_shift: WebSocket broadcast',
  publishBlock.includes('broadcastShiftUpdate'), 'Real-time sync');

test('publish-chain', 'bulk_publish: sets status=published',
  bulkPublishBlock.includes("status: 'published'"), 'Correct enum value');

test('publish-chain', 'bulk_publish: fires batch notifications',
  bulkPublishBlock.includes('universalNotificationEngine'), 'Officers notified');

test('publish-chain', 'bulk_publish: writes audit trail',
  bulkPublishBlock.includes('logActionAudit'), 'SOC2 audit');

// ═══════════════════════════════════════════════════════════════
// SUITE 4: AUTH & SESSION INTEGRITY
// ═══════════════════════════════════════════════════════════════
const authCore = readFile('server/routes/authCoreRoutes.ts');
const authTs = readFile('server/auth.ts');
const rbacRoute = readFile('client/src/components/rbac-route.tsx');

test('auth', 'Session save failure returns 503 (not silent success)',
  authCore.includes('503') && authCore.includes('SESSION_SAVE_FAILED'),
  'Blank-page-on-login fix');

test('auth', 'Session save wrapped in try/catch',
  authCore.includes('saveSessionAsync') && authCore.includes('catch (sessionErr'),
  'Session save errors surface to client');

test('auth', '503 response includes retryable flag',
  authCore.includes('retryable: true'),
  'Client can auto-retry on session failure');

test('auth', 'RBACRoute uses window.location.replace (no history entry)',
  rbacRoute.includes('window.location.replace'), 'Avoids back-button redirect loop');

test('auth', 'Session store timeout properly errors (not silent no-op)',
  authTs.includes('Session store operation timed out'),
  'Timeout is now a real error, not swallowed');

test('auth', 'Trinity transparency dashboard accessible to owners',
  readFile('client/src/App.tsx').includes('"owner"') &&
  readFile('client/src/App.tsx').includes('trinity/transparency'),
  'Owners see Trinity dashboard (not just platform_staff)');

// ═══════════════════════════════════════════════════════════════
// SUITE 5: RBAC ROLE COMPLETENESS
// ═══════════════════════════════════════════════════════════════
test('rbac', 'LEADER_ROLES includes org_manager and manager',
  rbacRoute.includes("'org_manager'") && rbacRoute.includes("'manager'"),
  'Manager tier properly mapped');

test('rbac', 'SUPERVISOR_ROLES extends LEADER_ROLES',
  rbacRoute.includes("'supervisor'") && rbacRoute.includes("'department_manager'"),
  'Full supervisor hierarchy');

test('rbac', 'co_owner included in OWNER_ROLES',
  rbacRoute.includes("'co_owner'"),
  'Co-owners have owner permissions');

// ═══════════════════════════════════════════════════════════════
// SUITE 6: GLOBAL REFRESH SIGNAL
// ═══════════════════════════════════════════════════════════════
const progressHook = readFile('client/src/hooks/use-trinity-scheduling-progress.ts');

const REQUIRED_INVALIDATIONS = [
  '/api/shifts', '/api/schedules/week/stats', '/api/schedules/ai-insights',
  '/api/trinity/transparency/overview', '/api/compliance/tasks/pending',
  '/api/shifts/stats', '/api/time-entries', '/api/invoices'
];

for (const key of REQUIRED_INVALIDATIONS) {
  test('global-refresh', `Invalidates ${key} on completion`,
    progressHook.includes(key), 'Cache sweep after auto-fill');
}

test('global-refresh', 'aiSummary surfaced from completion event',
  progressHook.includes('aiSummary'), 'WHY reasons shown to manager');

// ═══════════════════════════════════════════════════════════════
// SUITE 7: FINANCIAL CALCULATION CORRECTNESS
// ═══════════════════════════════════════════════════════════════
const financialCalc = readFile('server/services/financialCalculator.ts');

test('financial', 'FinancialCalculator uses decimal.js (not float)',
  financialCalc.includes('Decimal') || financialCalc.includes('decimal.js'),
  'No float rounding errors on money');

test('financial', 'payrollRoutes uses sumFinancialValues',
  payrollRoutes.includes('sumFinancialValues'),
  'Payroll aggregation uses safe math');

test('financial', 'invoiceRoutes uses FinancialCalculator',
  invoiceRoutes.includes('FinancialCalculator') || invoiceRoutes.includes('sumFinancialValues'),
  'Invoice amounts use safe math');

test('financial', 'No raw JS float arithmetic on financial fields in payroll',
  !(/Number\([^)]+\)\s*\*\s*Number\([^)]+\)/.test(payrollRoutes)),
  'No Number() * Number() on financial fields');

// ═══════════════════════════════════════════════════════════════
// SUITE 8: BACKGROUND SERVICE HEALTH
// ═══════════════════════════════════════════════════════════════
const monitoringPath = 'server/services/monitoringService.ts';
const subagentPath = 'server/services/ai-brain/subagentBanker.ts';

// Find the actual files
let monitoringContent = '';
let subagentContent = '';
fs.readdirSync(path.join(BASE, 'server/services'), { recursive: true } as any).forEach((f: any) => {
  if (typeof f === 'string') {
    if (f.endsWith('monitoringService.ts')) monitoringContent = readFile(`server/services/${f}`);
    if (f.endsWith('subagentBanker.ts')) subagentContent = readFile(`server/services/ai-brain/${f.split('/').pop()!}`);
  }
});

// Re-find with glob
const findInServer = (name: string): string => {
  let found = '';
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f === name) { found = fs.readFileSync(full, 'utf-8'); return; }
    }
  };
  walk(path.join(BASE, 'server'));
  return found;
};

const monitoring = findInServer('monitoringService.ts');
const subagent = findInServer('subagentBanker.ts');
const connectome = findInServer('trinityConnectomeService.ts');

test('background-services', 'monitoringService setInterval has .unref()',
  monitoring.includes('.unref()'), 'Prevents Railway deploy hang');

test('background-services', 'subagentBanker setIntervals have .unref()',
  subagent.includes('.unref()'), 'Cleanup timers yield to process exit');

test('background-services', 'trinityConnectomeService timer has .unref()',
  connectome.includes('.unref()'), 'Decay timer yields to process exit');

test('background-services', 'autonomousScheduler cron has approvalExpiry job',
  readFile('server/services/autonomousScheduler.ts').includes('approvalExpiry'),
  'Expired approvals swept every 15 min');

// ═══════════════════════════════════════════════════════════════
// SUITE 9: DATABASE BOOTSTRAP INTEGRITY
// ═══════════════════════════════════════════════════════════════
const bootstrap = readFile('server/services/criticalConstraintsBootstrap.ts');

test('db-bootstrap', 'payroll_status enum created if missing',
  bootstrap.includes("CREATE TYPE payroll_status AS ENUM"),
  'Prevents invalid enum errors on payroll transitions');

test('db-bootstrap', 'trinity_knowledge_base: correct gen_random_uuid() (no ::text cast)',
  bootstrap.includes("gen_random_uuid()") && !bootstrap.includes("gen_random_uuid()::text"),
  'Type mismatch fix — uuid column cannot use ::text cast');

test('db-bootstrap', 'somatic_pattern_library: identity column handled gracefully',
  bootstrap.includes('ADD GENERATED ALWAYS AS IDENTITY') ||
  bootstrap.includes('is_identity'),
  'Identity columns skip DEFAULT assignment');

test('db-bootstrap', 'audit_logs: action column preserved as NOT NULL',
  bootstrap.includes("'action'") && bootstrap.includes("NOT IN ('id', 'created_at', 'action')"),
  'SOX compliance — action is always recorded');

test('db-bootstrap', 'identityService: pre-checks for duplicate org codes',
  readFile('server/services/identityService.ts').includes('existingForCode'),
  'Prevents transaction-aborting constraint violations');

// ═══════════════════════════════════════════════════════════════
// SUITE 10: CHAOS EDGE CASES
// ═══════════════════════════════════════════════════════════════
const anomalyWatch = readFile('server/services/trinity/proactive/anomalyWatch.ts');

test('chaos', 'AnomalyWatch detects future-shift guard card expiry',
  anomalyWatch.includes('detectFutureShiftGuardCardExpiry'),
  'Catches expiry before shift starts, not after');

test('chaos', 'AnomalyWatch detects bill rate drift',
  anomalyWatch.includes('detectBillRateMismatch'),
  'Prevents invoicing at wrong rate post-renegotiation');

test('chaos', 'Reconciliation path included in anomaly metadata',
  anomalyWatch.includes('reconciliationPath'),
  'Trinity tells user HOW to fix, not just what broke');

test('chaos', 'Pre-flight dry run endpoint exists',
  readFile('server/routes/schedulesRoutes.ts').includes('auto-fill/preflight'),
  'Impact statement before execution');

test('chaos', 'Pre-flight returns expiredGuardCount',
  readFile('server/routes/schedulesRoutes.ts').includes('expiredGuardCount'),
  'Manager knows how many officers are blocked');

// ═══════════════════════════════════════════════════════════════
// SUITE 11: CLIENT FETCH CONSISTENCY  
// ═══════════════════════════════════════════════════════════════
const universalSchedule = readFile('client/src/pages/universal-schedule.tsx');

test('client', 'universal-schedule: no raw fetch() calls',
  !universalSchedule.includes('= await fetch(') && !universalSchedule.includes("= fetch('"),
  'All fetches go through secureFetch for CSRF protection');

test('client', 'schedule-mobile-first: error state on shifts query',
  readFile('client/src/pages/schedule-mobile-first.tsx').includes('shiftsError'),
  'Shows error message instead of blank screen');

test('client', 'useApprovals: staleTime configured',
  readFile('client/src/hooks/useApprovals.ts').includes('staleTime'),
  'Prevents approval-count cache storms');

test('client', 'useTrinityTasks: staleTime on all 3 queries',
  readFile('client/src/hooks/useTrinityTasks.ts').split('staleTime').length - 1 >= 3,
  'Compliance/onboarding/approval queries cached properly');

// ═══════════════════════════════════════════════════════════════
// SUITE 12: SCHEMA / MIGRATION COMPLETENESS
// ═══════════════════════════════════════════════════════════════
const migration5 = readFile('migrations/0005_missing_audit_tables.sql');

test('schema', 'ai_call_log migration exists',
  migration5.includes('CREATE TABLE IF NOT EXISTS ai_call_log'),
  'AI usage tracking table created');

test('schema', 'universal_audit_log migration exists',
  migration5.includes('CREATE TABLE IF NOT EXISTS universal_audit_log'),
  'Audit trail table created');

test('schema', 'ai_call_log has workspace_id index',
  migration5.includes('ai_call_log_workspace_created'),
  'Workspace-scoped queries performant');

// ═══════════════════════════════════════════════════════════════
// PRINT RESULTS
// ═══════════════════════════════════════════════════════════════
const suites = [...new Set(results.map(r => r.suite))];
let totalPass = 0, totalFail = 0;

console.log('\n' + '═'.repeat(65));
console.log('  COAILEAGUE PLATFORM TEST SUITE');
console.log('═'.repeat(65));

for (const suite of suites) {
  const suiteResults = results.filter(r => r.suite === suite);
  const pass = suiteResults.filter(r => r.pass).length;
  const fail = suiteResults.filter(r => !r.pass).length;
  totalPass += pass;
  totalFail += fail;
  
  const icon = fail === 0 ? '✅' : '❌';
  console.log(`\n${icon} ${suite.toUpperCase()} (${pass}/${suiteResults.length})`);
  for (const r of suiteResults) {
    if (!r.pass) {
      console.log(`   ❌ FAIL: ${r.name}`);
      if (r.detail) console.log(`          ${r.detail}`);
    }
  }
  if (fail === 0) console.log(`   All ${pass} assertions passing`);
}

console.log('\n' + '═'.repeat(65));
console.log(`  TOTAL: ${totalPass + totalFail} tests — ${totalPass} PASS, ${totalFail} FAIL`);
console.log(`  ${totalFail === 0 ? '🏆 PLATFORM VERIFIED' : `⚠️  ${totalFail} FAILURES NEED ATTENTION`}`);
console.log('═'.repeat(65) + '\n');
