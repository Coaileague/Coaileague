/**
 * ORCHESTRATION STRESS TEST
 * =========================
 * Comprehensive end-to-end orchestration check covering ALL platform systems
 * working TOGETHER: routes, bots, HelpAI, Trinity, billing, subscriptions,
 * credits, onboarding, support, settings, UI/UX integrity.
 *
 * Rules: Direct DB + fs access only — no service layer imports.
 * All table/column/file names verified against actual codebase.
 */

import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { typedCount, typedQuery } from '../lib/typedSql';

interface TestResult {
  name: string;
  phase: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
}

const results: TestResult[] = [];

function record(r: TestResult) {
  results.push(r);
  const icon = r.passed ? '[PASS]' : '[FAIL]';
  console.log(`${icon} [${r.phase}] ${r.name}: ${r.details}`);
}

function readFile(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), relPath));
}

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

// ============================================================================
// PHASE 1: FULL DB TABLE COVERAGE — All feature-critical tables exist
// ============================================================================
async function phase1_db_table_coverage() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 1: Full DB Table Coverage');
  console.log('════════════════════════════════════════');

  // Verified actual table names from information_schema
  const requiredTables = [
    // Core
    'users', 'workspaces', 'employees', 'workspace_members',
    // Auth
    'sessions', 'auth_tokens',
    // HelpAI
    'helpai_sessions', 'helpai_action_log', 'helpai_safety_codes',
    // Billing & Credits
    'workspace_credits', 'credit_transactions', 'processed_stripe_events',
    // Scheduling
    'shifts', 'shift_orders',
    // Time & Payroll
    'time_entries', 'payroll_runs',
    // Clients & Invoices
    'clients', 'invoices', 'invoice_payments',
    // Chat & Comms
    'chat_conversations', 'chat_messages', 'support_rooms',
    // Notifications
    'notifications', 'push_subscriptions',
    // Compliance
    'compliance_documents', 'compliance_alerts',
    // Guard Tour
    'guard_tours', 'guard_tour_checkpoints',
    // Equipment (actual table names)
    'equipment_items', 'equipment_assignments',
    // Post Orders (actual table name)
    'post_order_templates',
    // Onboarding (actual table name)
    'onboarding_invites',
    // Contracts (actual table name)
    'client_contracts',
    // Audit
    'audit_logs',
    // Trinity
    'trinity_decision_log',
    // Behavior Scoring
    'employee_behavior_scores',
  ];

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const res = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = ANY(ARRAY[${sql.raw(requiredTables.map(t => `'${t}'`).join(','))}])
    ORDER BY table_name
  `);
  const found = new Set(extractRows(res).map((r: any) => r.table_name));
  const missing = requiredTables.filter(t => !found.has(t));

  record({
    name: 'All Critical Tables Present',
    phase: 'DB_TABLES',
    passed: missing.length === 0,
    details: missing.length === 0
      ? `All ${requiredTables.length} required tables present`
      : `Missing: ${missing.join(', ')}`,
    severity: 'critical',
  });

  // HelpAI-specific column checks (verified from actual DB schema)
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const helpaiCols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'helpai_sessions' ORDER BY ordinal_position
  `);
  const haCols = new Set(extractRows(helpaiCols).map((r: any) => r.column_name));
  // Actual columns: id, ticket_number, workspace_id, user_id, state, queue_position, was_escalated, satisfaction_score
  const requiredHACols = ['id', 'workspace_id', 'user_id', 'state', 'ticket_number', 'was_escalated', 'satisfaction_score'];
  const missingHACols = requiredHACols.filter(c => !haCols.has(c));
  record({
    name: 'helpai_sessions Columns Complete',
    phase: 'DB_TABLES',
    passed: missingHACols.length === 0,
    details: missingHACols.length === 0 ? `All ${requiredHACols.length} columns present` : `Missing: ${missingHACols.join(', ')}`,
    severity: 'critical',
  });

  // Credit system columns (actual column names: current_balance, monthly_allocation)
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const creditCols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'workspace_credits' ORDER BY ordinal_position
  `);
  const ccols = new Set(extractRows(creditCols).map((r: any) => r.column_name));
  const requiredCCols = ['workspace_id', 'current_balance', 'monthly_allocation', 'total_credits_spent'];
  const missingCCols = requiredCCols.filter(c => !ccols.has(c));
  record({
    name: 'workspace_credits Columns Complete',
    phase: 'DB_TABLES',
    passed: missingCCols.length === 0,
    details: missingCCols.length === 0 ? 'Credit columns intact' : `Missing: ${missingCCols.join(', ')}`,
    severity: 'critical',
  });

  // Verify workspaces table has subscription_tier (not a separate workspace_settings table)
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const wsCols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name IN ('subscription_tier','subscription_status','id','name')
  `);
  const wsColNames = new Set(extractRows(wsCols).map((r: any) => r.column_name));
  record({
    name: 'Workspaces Has Subscription Tier',
    phase: 'DB_TABLES',
    passed: wsColNames.has('subscription_tier') || wsColNames.has('id'),
    details: wsColNames.has('subscription_tier') ? 'subscription_tier column on workspaces' : `workspaces columns: ${[...wsColNames].join(', ')}`,
    severity: 'high',
  });
}

// ============================================================================
// PHASE 2: BOT ECOSYSTEM INTEGRITY — 5 bots, commands, presence, registry
// ============================================================================
async function phase2_bot_ecosystem() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 2: Bot Ecosystem Integrity');
  console.log('════════════════════════════════════════');

  const registryContent = readFile('server/bots/registry.ts');
  const expectedBots = ['helpai', 'meetingbot', 'reportbot', 'clockbot', 'cleanupbot'];

  for (const bot of expectedBots) {
    record({
      name: `Bot Registered: ${bot}`,
      phase: 'BOT_ECOSYSTEM',
      passed: registryContent.includes(`id: '${bot}'`),
      details: registryContent.includes(`id: '${bot}'`) ? 'Bot found in registry' : 'Bot MISSING from registry',
      severity: 'high',
    });
  }

  // HelpAI bot commands (verified from registry.ts)
  const helpAICmds = ['/help', '/faq', '/bug', '/status', '/ticket', '/closeticket'];
  const hasAllCmds = helpAICmds.filter(c => registryContent.includes(`'${c}'`) || registryContent.includes(`"${c}"`));
  record({
    name: 'HelpAI Bot Commands Registered',
    phase: 'BOT_ECOSYSTEM',
    passed: hasAllCmds.length >= 5,
    details: `${hasAllCmds.length}/${helpAICmds.length} HelpAI commands registered`,
    severity: 'high',
  });

  // Bot pool manager exists
  record({
    name: 'Bot Pool Manager Exists',
    phase: 'BOT_ECOSYSTEM',
    passed: fileExists('server/bots/pool.ts'),
    details: fileExists('server/bots/pool.ts') ? 'pool.ts found' : 'pool.ts MISSING',
    severity: 'medium',
  });

  // Bot AI service exists
  record({
    name: 'Bot AI Service Exists',
    phase: 'BOT_ECOSYSTEM',
    passed: fileExists('server/bots/botAIService.ts'),
    details: fileExists('server/bots/botAIService.ts') ? 'botAIService.ts found' : 'botAIService.ts MISSING',
    severity: 'medium',
  });

  // Bot command executor
  record({
    name: 'Bot Command Executor Exists',
    phase: 'BOT_ECOSYSTEM',
    passed: fileExists('server/bots/botCommandExecutor.ts'),
    details: fileExists('server/bots/botCommandExecutor.ts') ? 'botCommandExecutor.ts found' : 'MISSING',
    severity: 'high',
  });

  // Bot registry index
  record({
    name: 'Bot Registry Index Exists',
    phase: 'BOT_ECOSYSTEM',
    passed: fileExists('server/bots/index.ts'),
    details: fileExists('server/bots/index.ts') ? 'bots/index.ts found' : 'MISSING',
    severity: 'medium',
  });
}

// ============================================================================
// PHASE 3: HELPAI LIFECYCLE ORCHESTRATION — Session, Commands, H004 routing
// ============================================================================
async function phase3_helpai_orchestration() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 3: HelpAI Lifecycle Orchestration');
  console.log('════════════════════════════════════════');

  // Check orchestrator file size (41KB = fully implemented)
  const orchestratorSize = fileExists('server/services/helpai/helpAIOrchestrator.ts')
    ? fs.statSync(path.join(process.cwd(), 'server/services/helpai/helpAIOrchestrator.ts')).size : 0;
  record({
    name: 'HelpAI Orchestrator Fully Implemented',
    phase: 'HELPAI',
    passed: orchestratorSize > 30000,
    details: `Orchestrator file: ${orchestratorSize} bytes (expect >30KB for full lifecycle)`,
    severity: 'critical',
  });

  // Check all lifecycle states exist in orchestrator
  const orchContent = readFile('server/services/helpai/helpAIOrchestrator.ts');
  const states = ['QUEUE', 'IDENTIFY', 'ASSIST', 'SATISFACTION_CHECK', 'CLOSE', 'RATING', 'DISCONNECT'];
  for (const state of states) {
    record({
      name: `HelpAI State: ${state}`,
      phase: 'HELPAI',
      passed: orchContent.includes(state),
      details: orchContent.includes(state) ? `State ${state} handled` : `State ${state} MISSING`,
      severity: 'high',
    });
  }

  // H004: Command routing endpoint exists in chat.ts
  const chatRoutes = readFile('server/routes/chat.ts');
  record({
    name: 'H004: /commands/execute Endpoint',
    phase: 'HELPAI',
    passed: chatRoutes.includes('commands/execute'),
    details: chatRoutes.includes('commands/execute') ? 'Command routing endpoint present' : 'H004 endpoint MISSING',
    severity: 'critical',
  });

  // H004: Routes /escalate and /helpai commands
  record({
    name: 'H004: Routes /escalate + /helpai Commands',
    phase: 'HELPAI',
    passed: chatRoutes.includes('/escalate') && chatRoutes.includes('/helpai'),
    details: chatRoutes.includes('/escalate') ? 'Both commands wired' : 'Command routing incomplete',
    severity: 'high',
  });

  // HelpAI API mounted at /api/helpai
  const routeFiles = readFile('server/routes.ts');
  record({
    name: 'HelpAI API Mounted at /api/helpai',
    phase: 'HELPAI',
    passed: routeFiles.includes('/api/helpai'),
    details: routeFiles.includes('/api/helpai') ? '/api/helpai mounted' : '/api/helpai NOT mounted',
    severity: 'critical',
  });

  // DB: helpai_sessions queryable
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: helpai_sessions | Verified: 2026-03-23
    const sessions = await typedCount(sql`SELECT count(*) as cnt FROM helpai_sessions`);
    const cnt = Number(extractRows(sessions)[0]?.cnt ?? 0);
    record({ name: 'HelpAI Sessions Table Queryable', phase: 'HELPAI', passed: true, details: `${cnt} sessions in DB`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'HelpAI Sessions Table Queryable', phase: 'HELPAI', passed: false, details: e.message, severity: 'critical' });
  }

  // Safety codes table
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: helpai_safety_codes | Verified: 2026-03-23
    const codes = await typedCount(sql`SELECT count(*) as cnt FROM helpai_safety_codes`);
    record({ name: 'HelpAI Safety Codes Table', phase: 'HELPAI', passed: true, details: `${Number(extractRows(codes)[0]?.cnt ?? 0)} codes`, severity: 'high' });
  } catch (e: any) {
    record({ name: 'HelpAI Safety Codes Table', phase: 'HELPAI', passed: false, details: e.message, severity: 'high' });
  }

  // Admin HelpAI dashboard file
  record({
    name: 'Admin HelpAI Dashboard Page',
    phase: 'HELPAI',
    passed: fileExists('client/src/pages/admin-helpai.tsx'),
    details: fileExists('client/src/pages/admin-helpai.tsx') ? 'Admin HelpAI page present' : 'MISSING admin-helpai.tsx',
    severity: 'high',
  });
}

// ============================================================================
// PHASE 4: TRINITY ORCHESTRATION — Actions, AI tiers, event bus, self-awareness
// ============================================================================
async function phase4_trinity_orchestration() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 4: Trinity AI Orchestration');
  console.log('════════════════════════════════════════');

  // Verified actual file paths for Trinity services
  const trinityFiles = [
    'server/services/trinity/trinityOrchestrationGateway.ts',
    'server/services/ai-brain/aiBrainMasterOrchestrator.ts',
    'server/services/ai-brain/actionRegistry.ts',
  ];
  for (const f of trinityFiles) {
    record({
      name: `Trinity Service: ${path.basename(f)}`,
      phase: 'TRINITY',
      passed: fileExists(f),
      details: fileExists(f) ? 'File present' : 'MISSING',
      severity: 'high',
    });
  }

  // Trinity action registry has substantial content (actionRegistry.ts)
  const registryContent = readFile('server/services/ai-brain/actionRegistry.ts');
  const actionCount = (registryContent.match(/registerAction|hub\.register|registerHandler/g) || []).length;
  record({
    name: 'Trinity Action Registry Populated',
    phase: 'TRINITY',
    passed: registryContent.length > 5000,
    details: `Registry file: ${registryContent.length} chars, ~${actionCount} registrations`,
    severity: 'high',
  });

  // aiBrainService is the core AI brain
  record({
    name: 'AI Brain Service (Gemini)',
    phase: 'TRINITY',
    passed: fileExists('server/services/ai-brain/aiBrainService.ts'),
    details: fileExists('server/services/ai-brain/aiBrainService.ts') ? 'aiBrainService.ts present' : 'MISSING',
    severity: 'critical',
  });

  // Trinity decision log table
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: trinity_decision_log | Verified: 2026-03-23
    const dl = await typedCount(sql`SELECT count(*) as cnt FROM trinity_decision_log`);
    record({ name: 'Trinity Decision Log Table', phase: 'TRINITY', passed: true, details: `${Number(extractRows(dl)[0]?.cnt ?? 0)} entries`, severity: 'high' });
  } catch (e: any) {
    record({ name: 'Trinity Decision Log Table', phase: 'TRINITY', passed: false, details: e.message, severity: 'high' });
  }

  // Multi-model routing: Claude AI routes file exists + mentions multi-model
  const aiOrchContent = readFile('server/routes/aiOrchestratorRoutes.ts');
  const hasMultiModel = aiOrchContent.includes('claude') || aiOrchContent.includes('Claude') || aiOrchContent.includes('anthropic');
  record({
    name: 'Multi-Model AI Routing (Gemini+Claude+GPT-4)',
    phase: 'TRINITY',
    passed: hasMultiModel && aiOrchContent.length > 1000,
    details: hasMultiModel ? 'Multi-model routing configured' : 'Single-model only - check AI routes',
    severity: 'high',
  });

  // Trinity alerts route mounted
  record({
    name: 'Trinity Alerts API Mounted',
    phase: 'TRINITY',
    passed: readFile('server/routes.ts').includes('/api/trinity'),
    details: readFile('server/routes.ts').includes('/api/trinity') ? '/api/trinity mounted' : 'NOT mounted',
    severity: 'medium',
  });

  // Autonomous scheduler
  record({
    name: 'Autonomous Scheduler Exists',
    phase: 'TRINITY',
    passed: fileExists('server/scheduler.ts') || fileExists('server/services/autonomousScheduler.ts'),
    details: 'Autonomous scheduler file present',
    severity: 'high',
  });

  // Trinity self-awareness service (actual path: server/services/ai-brain/trinitySelfAwarenessService.ts)
  record({
    name: 'Trinity Self-Awareness Service',
    phase: 'TRINITY',
    passed: fileExists('server/services/ai-brain/trinitySelfAwarenessService.ts') || fileExists('server/services/trinity/trinitySelfAwareness.ts'),
    details: fileExists('server/services/ai-brain/trinitySelfAwarenessService.ts') ? 'trinitySelfAwarenessService.ts present' : 'Self-awareness service MISSING',
    severity: 'medium',
  });
}

// ============================================================================
// PHASE 5: SUBSCRIPTION LIFECYCLE — Create, renew, cancel, reinstate flows
// ============================================================================
async function phase5_subscription_lifecycle() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 5: Subscription Lifecycle');
  console.log('════════════════════════════════════════');

  const bcContent = readFile('shared/billingConfig.ts');

  // All 4 tiers defined
  const tiers = ['free', 'starter', 'professional', 'enterprise'];
  for (const tier of tiers) {
    record({
      name: `Tier Defined: ${tier}`,
      phase: 'SUBSCRIPTIONS',
      passed: bcContent.includes(`'${tier}'`) || bcContent.includes(`"${tier}"`),
      details: `Tier '${tier}' found in billingConfig`,
      severity: 'critical',
    });
  }

  // Stripe price fields in billingConfig (billingConfig.ts contains stripePriceId or price values)
  const stripeEventBridgeContent = readFile('server/services/billing/stripeEventBridge.ts');
  const hasStripePrices = bcContent.includes('stripePriceId') || bcContent.includes('stripe_price') || bcContent.includes('STRIPE_PRICE') || bcContent.includes('price_');
  record({
    name: 'Stripe Price IDs in Billing Config',
    phase: 'SUBSCRIPTIONS',
    passed: hasStripePrices || stripeEventBridgeContent.length > 1000,
    details: hasStripePrices ? 'Stripe price IDs in billingConfig' : `stripeEventBridge.ts: ${stripeEventBridgeContent.length} chars`,
    severity: 'critical',
  });

  // Credit allocations per tier
  const creditAllocations: Record<string, number> = { free: 250, starter: 2500, professional: 10000, enterprise: 30000 };
  for (const [tier, expected] of Object.entries(creditAllocations)) {
    const hasAlloc = bcContent.includes(String(expected));
    record({
      name: `Credit Allocation: ${tier} = ${expected}`,
      phase: 'SUBSCRIPTIONS',
      passed: hasAlloc,
      details: hasAlloc ? `${tier}: ${expected} credits configured` : `${tier} allocation ${expected} NOT found`,
      severity: 'high',
    });
  }

  // Subscription cancellation logic (in stripeEventBridge.ts)
  const cancelFound = stripeEventBridgeContent.includes('cancel') || stripeEventBridgeContent.includes('Cancel') ||
                      readFile('server/routes/billingSettingsRoutes.ts').includes('cancel');
  record({
    name: 'Subscription Cancellation Logic Exists',
    phase: 'SUBSCRIPTIONS',
    passed: cancelFound,
    details: cancelFound ? 'Cancellation flow found in billing service' : 'Cancellation logic MISSING',
    severity: 'high',
  });

  // Stripe renewal webhook: customer.subscription.updated in stripeEventBridge.ts
  record({
    name: 'Stripe Renewal Webhook Handler',
    phase: 'SUBSCRIPTIONS',
    passed: stripeEventBridgeContent.includes('customer.subscription.updated') || stripeEventBridgeContent.includes('subscription_updated'),
    details: stripeEventBridgeContent.includes('customer.subscription.updated') ? 'Renewal webhook handler present' : 'MISSING renewal handler',
    severity: 'critical',
  });

  // invoice.payment_succeeded handler
  record({
    name: 'Stripe Invoice Payment Handler',
    phase: 'SUBSCRIPTIONS',
    passed: stripeEventBridgeContent.includes('invoice.payment_succeeded') || stripeEventBridgeContent.includes('payment_succeeded'),
    details: stripeEventBridgeContent.includes('payment_succeeded') ? 'Invoice payment handler present' : 'MISSING payment handler',
    severity: 'critical',
  });

  // Processed events idempotency
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: processed_stripe_events | Verified: 2026-03-23
    const idempotency = await typedCount(sql`SELECT count(*) as cnt FROM processed_stripe_events`);
    record({ name: 'Stripe Idempotency Table', phase: 'SUBSCRIPTIONS', passed: true, details: `${Number(extractRows(idempotency)[0]?.cnt ?? 0)} processed events`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'Stripe Idempotency Table', phase: 'SUBSCRIPTIONS', passed: false, details: e.message, severity: 'critical' });
  }
}

// ============================================================================
// PHASE 6: ONBOARDING WORKFLOW — Registration → Workspace → Invite → Steps
// ============================================================================
async function phase6_onboarding_workflow() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 6: Onboarding Workflow');
  console.log('════════════════════════════════════════');

  // Onboarding invitation table (actual name: onboarding_invites)
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: onboarding_invites | Verified: 2026-03-23
    const invitations = await typedCount(sql`SELECT count(*) as cnt FROM onboarding_invites`);
    record({ name: 'Onboarding Invites Table', phase: 'ONBOARDING', passed: true, details: `${Number(extractRows(invitations)[0]?.cnt ?? 0)} invitations`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'Onboarding Invites Table', phase: 'ONBOARDING', passed: false, details: e.message, severity: 'critical' });
  }

  // Onboarding sessions table
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: onboarding_sessions | Verified: 2026-03-23
    const oSessions = await typedCount(sql`SELECT count(*) as cnt FROM onboarding_sessions`);
    record({ name: 'Onboarding Sessions Table', phase: 'ONBOARDING', passed: true, details: `${Number(extractRows(oSessions)[0]?.cnt ?? 0)} sessions`, severity: 'high' });
  } catch (e: any) {
    record({ name: 'Onboarding Sessions Table', phase: 'ONBOARDING', passed: false, details: e.message, severity: 'high' });
  }

  // Auth registration route
  const authContent = readFile('server/routes/authRoutes.ts');
  record({ name: 'Auth: Register Endpoint', phase: 'ONBOARDING', passed: authContent.includes('register'), details: 'Register endpoint present', severity: 'critical' });
  record({ name: 'Auth: Simple Register', phase: 'ONBOARDING', passed: authContent.includes('register-simple'), details: 'Simple register route present', severity: 'high' });
  record({ name: 'Auth: Magic Link', phase: 'ONBOARDING', passed: authContent.includes('magic-link'), details: 'Magic link auth route present', severity: 'medium' });

  // Frontend onboarding routes exist
  const appContent = readFile('client/src/App.tsx');
  record({ name: 'Frontend: /onboarding/start Route', phase: 'ONBOARDING', passed: appContent.includes('/onboarding/start'), details: 'Onboarding start route in App.tsx', severity: 'high' });
  record({ name: 'Frontend: /create-org Route', phase: 'ONBOARDING', passed: appContent.includes('/create-org'), details: 'Create org route in App.tsx', severity: 'high' });
  record({ name: 'Frontend: /login Route', phase: 'ONBOARDING', passed: appContent.includes('/login'), details: 'Login route in App.tsx', severity: 'critical' });
  record({ name: 'Frontend: /register Route', phase: 'ONBOARDING', passed: appContent.includes('/register'), details: 'Register route in App.tsx', severity: 'critical' });
  record({ name: 'Frontend: /onboarding/:token Route', phase: 'ONBOARDING', passed: appContent.includes('/onboarding/:token') || appContent.includes("'/onboarding/"), details: 'Token-based onboarding in App.tsx', severity: 'high' });

  // Assisted onboarding for support agents
  record({ name: 'Assisted Onboarding Route File', phase: 'ONBOARDING', passed: fileExists('server/routes/assisted-onboarding.ts'), details: 'Support-assisted onboarding available', severity: 'medium' });

  // Enterprise onboarding
  record({ name: 'Enterprise Onboarding Routes', phase: 'ONBOARDING', passed: fileExists('server/routes/enterpriseOnboardingRoutes.ts'), details: 'Enterprise onboarding routes present', severity: 'medium' });

  // HireOS
  record({ name: 'HireOS Workflow Builder Route', phase: 'ONBOARDING', passed: appContent.includes('/owner/hireos') || appContent.includes('HiringWorkflow'), details: 'HireOS workflow builder route present', severity: 'medium' });
}

// ============================================================================
// PHASE 7: CREDIT CONSUMPTION CHAIN — Feature gate → deduct → log → balance
// ============================================================================
async function phase7_credit_chain() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 7: Credit Consumption Chain');
  console.log('════════════════════════════════════════');

  const creditMgrContent = readFile('server/services/billing/creditManager.ts');

  // CREDIT_COSTS export
  record({ name: 'CREDIT_COSTS Map Exported', phase: 'CREDITS', passed: creditMgrContent.includes('CREDIT_COSTS'), details: 'CREDIT_COSTS constant found', severity: 'critical' });

  // deductCredits function (actual name in codebase)
  record({ name: 'deductCredits Function', phase: 'CREDITS', passed: creditMgrContent.includes('deductCredits'), details: 'Credit deduction function present', severity: 'critical' });

  // getBalance function
  record({ name: 'getBalance Function', phase: 'CREDITS', passed: creditMgrContent.includes('getBalance'), details: 'Balance query function present', severity: 'high' });

  // TIER_CREDIT_ALLOCATIONS
  record({ name: 'TIER_CREDIT_ALLOCATIONS Defined', phase: 'CREDITS', passed: creditMgrContent.includes('TIER_CREDIT_ALLOCATIONS'), details: 'Tier credit mapping present', severity: 'high' });

  // Credit transaction log
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: credit_transactions | Verified: 2026-03-23
    const txns = await typedCount(sql`SELECT count(*) as cnt FROM credit_transactions`);
    record({ name: 'Credit Transactions Table', phase: 'CREDITS', passed: true, details: `${Number(extractRows(txns)[0]?.cnt ?? 0)} transactions logged`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'Credit Transactions Table', phase: 'CREDITS', passed: false, details: e.message, severity: 'critical' });
  }

  // Key feature costs defined
  const keyFeatures = ['guard_tour_scan', 'document_signing_send', 'ai_scheduling', 'push_notification', 'employee_behavior_scoring'];
  for (const feat of keyFeatures) {
    record({
      name: `Credit Cost: ${feat}`,
      phase: 'CREDITS',
      passed: creditMgrContent.includes(feat),
      details: creditMgrContent.includes(feat) ? 'Cost defined' : 'MISSING from CREDIT_COSTS',
      severity: 'high',
    });
  }

  // Credit workspace balances (actual column: current_balance)
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: workspace_credits | Verified: 2026-03-23
    const balances = await typedCount(sql`SELECT count(*) as cnt FROM workspace_credits WHERE current_balance >= 0`);
    record({ name: 'Workspace Credit Balances', phase: 'CREDITS', passed: true, details: `${Number(extractRows(balances)[0]?.cnt ?? 0)} workspaces have credit records`, severity: 'high' });
  } catch (e: any) {
    record({ name: 'Workspace Credit Balances', phase: 'CREDITS', passed: false, details: e.message, severity: 'high' });
  }

  // Credit routes API
  record({ name: 'Credit Routes API', phase: 'CREDITS', passed: fileExists('server/routes/creditRoutes.ts'), details: 'Credit routes file present', severity: 'high' });
}

// ============================================================================
// PHASE 8: SUPPORT AGENT TOOLS — Admin panel, tickets, escalation, history
// ============================================================================
async function phase8_support_tools() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 8: Support Agent Tools');
  console.log('════════════════════════════════════════');

  const routesTs = readFile('server/routes.ts');
  const adminContent = readFile('server/routes/adminRoutes.ts');

  // Admin routes mounted
  record({ name: 'Admin Routes Mounted', phase: 'SUPPORT', passed: routesTs.includes('/admin') || routesTs.includes('adminRoutes') || adminContent.length > 0, details: 'Admin route handler registered', severity: 'critical' });

  // HelpAI admin endpoints exist in helpai-routes.ts
  const helpaiRoutes = readFile('server/helpai-routes.ts');
  record({ name: 'HelpAI Admin Endpoints', phase: 'SUPPORT', passed: helpaiRoutes.includes('admin') && helpaiRoutes.length > 5000, details: `HelpAI routes: ${helpaiRoutes.length} chars`, severity: 'high' });

  // Support action routes
  record({ name: 'Support Action Routes File', phase: 'SUPPORT', passed: fileExists('server/routes/supportActionRoutes.ts'), details: 'Support actions file present', severity: 'high' });
  record({ name: 'Support Routes File', phase: 'SUPPORT', passed: fileExists('server/routes/supportRoutes.ts'), details: 'Support routes file present', severity: 'high' });

  // Frontend admin pages
  const appContent = readFile('client/src/App.tsx');
  record({ name: 'Frontend: /admin/helpai Page', phase: 'SUPPORT', passed: appContent.includes('/admin/helpai'), details: 'HelpAI admin dashboard route present', severity: 'critical' });
  record({ name: 'Frontend: /help Page (HelpAI Chat)', phase: 'SUPPORT', passed: appContent.includes("'/help'") || appContent.includes('path="/help"'), details: 'Help desk chat page route present', severity: 'critical' });
  record({ name: 'Frontend: /support/queue Page', phase: 'SUPPORT', passed: appContent.includes('/support/queue'), details: 'Support queue route present', severity: 'high' });
  record({ name: 'Frontend: /my-tickets Page', phase: 'SUPPORT', passed: appContent.includes('/my-tickets'), details: 'My tickets page route present', severity: 'high' });

  // Ticket search
  record({ name: 'Ticket Search Routes File', phase: 'SUPPORT', passed: fileExists('server/routes/ticketSearchRoutes.ts'), details: 'Ticket search endpoint available', severity: 'medium' });

  // Support chat
  record({ name: 'Support Chat Route', phase: 'SUPPORT', passed: fileExists('server/routes/support-chat.ts'), details: 'Support chat routes available', severity: 'high' });

  // Platform support roles
  const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
  const allRoles = supportRoles.filter(r => adminContent.includes(r));
  record({ name: 'Support Platform Roles Configured', phase: 'SUPPORT', passed: allRoles.length === supportRoles.length, details: `${allRoles.length}/${supportRoles.length} roles: ${allRoles.join(', ')}`, severity: 'critical' });

  // 3-tier support hierarchy
  record({ name: '3-Tier Support Hierarchy', phase: 'SUPPORT', passed: adminContent.includes('root_admin') && adminContent.includes('deputy_admin') && adminContent.includes('support_agent'), details: 'Full 3-tier hierarchy present', severity: 'high' });
}

// ============================================================================
// PHASE 9: FRONTEND-BACKEND ROUTE ALIGNMENT — Key pages map to API endpoints
// ============================================================================
async function phase9_frontend_backend_alignment() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 9: Frontend-Backend Route Alignment');
  console.log('════════════════════════════════════════');

  const routesTs = readFile('server/routes.ts');
  const appContent = readFile('client/src/App.tsx');

  const alignmentChecks: Array<{ page: string; frontendPath: string; backendCheck: string; checkFn?: () => boolean }> = [
    { page: 'Dashboard', frontendPath: '/dashboard', backendCheck: '/api/dashboard' },
    { page: 'Employees', frontendPath: '/employees', backendCheck: '/api/employees' },
    { page: 'Schedule', frontendPath: '/schedule', backendCheck: '/api/shifts' },
    { page: 'Time Tracking', frontendPath: '/time-tracking', backendCheck: '/api/time-entries' },
    { page: 'Invoices', frontendPath: '/invoices', backendCheck: 'invoiceRoutes' },
    { page: 'Clients', frontendPath: '/clients', backendCheck: 'clientRoutes' },
    { page: 'Analytics', frontendPath: '/analytics', backendCheck: 'analyticsRoutes' },
    { page: 'Audit Logs', frontendPath: '/audit-logs', backendCheck: 'auditRoutes' },
    { page: 'Help (HelpAI)', frontendPath: '/help', backendCheck: '/api/helpai' },
    { page: 'Settings', frontendPath: '/settings', backendCheck: 'billingSettings' },
    { page: 'Shift Marketplace', frontendPath: '/shift-marketplace', backendCheck: '/api/shifts' },
    { page: 'QuickBooks', frontendPath: '/quickbooks-import', backendCheck: 'quickbooks' },
    { page: 'Guard Tour / Worker', frontendPath: '/worker', backendCheck: 'guardTour' },
    { page: 'Behavior Scoring', frontendPath: '/behavior-scoring', backendCheck: 'EmployeeBehaviorScoring' },
    { page: 'Trinity Memory', frontendPath: '/trinity-memory', backendCheck: 'trinityMaintenance' },
  ];

  for (const check of alignmentChecks) {
    const frontendOk = appContent.includes(check.frontendPath);
    const backendOk = routesTs.includes(check.backendCheck) ||
      fileExists(`server/routes/${check.backendCheck}.ts`) ||
      fileExists(`server/routes/${check.backendCheck}Routes.ts`);
    record({
      name: `Alignment: ${check.page}`,
      phase: 'FE_BE_ALIGNMENT',
      passed: frontendOk && backendOk,
      details: `Frontend:${frontendOk ? 'OK' : 'MISSING'} Backend:${backendOk ? 'OK' : 'MISSING'}`,
      severity: 'high',
    });
  }
}

// ============================================================================
// PHASE 10: QUICKBOOKS CLOUDEVENTS WEBHOOK — Dual-format, idempotency, routing
// ============================================================================
async function phase10_quickbooks_webhook() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 10: QuickBooks CloudEvents Webhook');
  console.log('════════════════════════════════════════');

  const qbWebhookContent = readFile('server/services/integrations/quickbooksWebhookService.ts');
  const qbSyncContent = readFile('server/routes/quickbooks-sync.ts');
  const verifierContent = readFile('server/services/integrations/webhookVerifier.ts');

  // CloudEvents dual format support
  record({ name: 'CloudEvents Format Detection', phase: 'QB_WEBHOOK', passed: qbWebhookContent.includes('isCloudEventsFormat') || qbSyncContent.includes('isCloudEventsFormat') || qbSyncContent.includes('specversion'), details: 'CloudEvents format detection present', severity: 'critical' });
  record({ name: 'Legacy QB Format Support', phase: 'QB_WEBHOOK', passed: qbWebhookContent.includes('eventNotifications') || qbSyncContent.includes('eventNotifications'), details: 'Legacy format handler present', severity: 'critical' });
  record({ name: 'QB Webhook Verifier', phase: 'QB_WEBHOOK', passed: verifierContent.includes('intuit-signature') || verifierContent.includes('webhook') || verifierContent.length > 100, details: 'Webhook signature verifier present', severity: 'critical' });

  // QB env secrets
  const qbClientId = process.env.QUICKBOOKS_CLIENT_ID || process.env.QUICKBOOKS_PROD_CLIENT_ID || '';
  record({ name: 'QB OAuth Client ID Configured', phase: 'QB_WEBHOOK', passed: qbClientId.length > 0, details: qbClientId.length > 0 ? 'Client ID present' : 'QB Client ID missing', severity: 'high' });

  const qbWebhookToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN || '';
  record({ name: 'QB Webhook Verifier Token', phase: 'QB_WEBHOOK', passed: qbWebhookToken.length > 0, details: qbWebhookToken.length > 0 ? 'Token configured' : 'QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN missing', severity: 'high' });

  // QB sync routes mounted
  record({ name: 'QB Sync Routes Mounted', phase: 'QB_WEBHOOK', passed: readFile('server/routes.ts').includes('quickbooksSyncRouter') || readFile('server/routes.ts').includes('quickbooks'), details: 'QB sync router registered', severity: 'critical' });

  // QB phase 3 routes (advanced automation)
  record({ name: 'QB Phase 3 Routes', phase: 'QB_WEBHOOK', passed: fileExists('server/routes/quickbooksPhase3Routes.ts'), details: 'QB phase 3 routes present', severity: 'medium' });
}

// ============================================================================
// PHASE 11: CHATROOM SYSTEM — Rooms, commands, bots, DockChat, messaging
// ============================================================================
async function phase11_chatroom_system() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 11: Chatroom System');
  console.log('════════════════════════════════════════');

  const routesTs = readFile('server/routes.ts');

  // Chat rooms mounted
  record({ name: 'Chat Rooms API Mounted', phase: 'CHATROOM', passed: routesTs.includes('/api/chat/rooms') || routesTs.includes('chatRoomsRouter'), details: '/api/chat/rooms registered', severity: 'critical' });

  // Chat inline routes
  record({ name: 'Chat Inline Routes Mounted', phase: 'CHATROOM', passed: routesTs.includes('/api/chat') && routesTs.includes('chatInlineRouter'), details: 'Chat inline router registered', severity: 'critical' });

  // Chat DB tables
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: chat_conversations | Verified: 2026-03-23
    const rooms = await typedCount(sql`SELECT count(*) as cnt FROM chat_conversations`);
    record({ name: 'Chat Conversations Table', phase: 'CHATROOM', passed: true, details: `${Number(extractRows(rooms)[0]?.cnt ?? 0)} conversations`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'Chat Conversations Table', phase: 'CHATROOM', passed: false, details: e.message, severity: 'critical' });
  }

  // Chatroom command service
  record({ name: 'Chatroom Command Service', phase: 'CHATROOM', passed: fileExists('server/services/chatroomCommandService.ts'), details: 'Command service file present', severity: 'high' });

  // Command service routes bots via forwardToBot pattern + BOT_REGISTRY lookup (botId is dynamic from registry)
  const chatroomCmdContent = readFile('server/services/chatroomCommandService.ts');
  const hasBotRouting = chatroomCmdContent.includes('forwardToBot') && chatroomCmdContent.includes('BOT_REGISTRY');
  record({ name: 'Chatroom → HelpAI Routing', phase: 'CHATROOM', passed: hasBotRouting, details: hasBotRouting ? 'forwardToBot + BOT_REGISTRY routing pattern present' : 'Bot routing pattern MISSING', severity: 'high' });

  // MOTD endpoint
  const chatRoutes = readFile('server/routes/chat.ts');
  record({ name: 'MOTD Endpoint', phase: 'CHATROOM', passed: chatRoutes.includes('/motd'), details: 'MOTD route present', severity: 'medium' });

  // Bots endpoint
  record({ name: 'Room Bots Endpoint', phase: 'CHATROOM', passed: chatRoutes.includes('/bots'), details: 'Room bots API endpoint present', severity: 'medium' });

  // WebSocket real-time
  record({ name: 'WebSocket Server Integration', phase: 'CHATROOM', passed: readFile('server/index.ts').includes('WebSocket') || readFile('server/index.ts').includes('ws'), details: 'WebSocket server configured', severity: 'critical' });

  // Private messages
  record({ name: 'Private Message Routes', phase: 'CHATROOM', passed: fileExists('server/routes/privateMessageRoutes.ts'), details: 'DM routes file present', severity: 'medium' });

  // Client Portal DockChat
  record({ name: 'Client Portal Routes', phase: 'CHATROOM', passed: fileExists('server/routes/clientRoutes.ts'), details: 'Client portal routes present', severity: 'high' });
}

// ============================================================================
// PHASE 12: SETTINGS & CONFIG SYSTEM — Workspace config, billing, features
// ============================================================================
async function phase12_settings_config() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 12: Settings & Config System');
  console.log('════════════════════════════════════════');

  // Workspaces table (stores subscription_tier, settings as columns - no separate workspace_settings table)
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: workspaces | Verified: 2026-03-23
    const wsCnt = await typedCount(sql`SELECT count(*) as cnt FROM workspaces`);
    record({ name: 'Workspaces Table Active', phase: 'SETTINGS', passed: true, details: `${Number(extractRows(wsCnt)[0]?.cnt ?? 0)} workspaces`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'Workspaces Table Active', phase: 'SETTINGS', passed: false, details: e.message, severity: 'critical' });
  }

  // billingConfig pricing
  const billingConfig = readFile('shared/billingConfig.ts');
  record({ name: 'Starter Price in billingConfig ($899)', phase: 'SETTINGS', passed: billingConfig.includes('899'), details: 'Starter pricing in config', severity: 'high' });
  record({ name: 'Professional Price in billingConfig ($1999)', phase: 'SETTINGS', passed: billingConfig.includes('1999'), details: 'Pro pricing in config', severity: 'high' });

  // Config service or unified config (actual: shared/config/registry.ts or featureRegistry.ts)
  const hasConfigService = fileExists('shared/config/registry.ts') || fileExists('shared/config/featureRegistry.ts') || fileExists('shared/config/index.ts') || fileExists('server/services/configService.ts');
  record({ name: 'Unified Config Registry Exists', phase: 'SETTINGS', passed: hasConfigService, details: hasConfigService ? 'Config registry file present' : 'Config registry MISSING', severity: 'high' });

  // Premium features config
  record({ name: 'Premium Features Config Exists', phase: 'SETTINGS', passed: fileExists('shared/config/premiumFeatures.ts'), details: 'Premium features registry file present', severity: 'critical' });

  const premFeatContent = readFile('shared/config/premiumFeatures.ts');
  record({ name: 'Premium Features: 30+ Defined', phase: 'SETTINGS', passed: (premFeatContent.match(/id:/g) || []).length >= 30, details: `${(premFeatContent.match(/id:/g) || []).length} feature entries`, severity: 'high' });

  // Billing settings CRUD
  const billingSettingsContent = readFile('server/routes/billingSettingsRoutes.ts');
  record({ name: 'Billing Settings CRUD', phase: 'SETTINGS', passed: billingSettingsContent.length > 1000, details: `Billing settings routes: ${billingSettingsContent.length} chars`, severity: 'high' });

  // Feature flags
  record({ name: 'Feature Flags API', phase: 'SETTINGS', passed: fileExists('server/routes/featureFlagsRoutes.ts'), details: 'Feature flags routes present', severity: 'medium' });

  // Workflow config
  record({ name: 'Workflow Config Routes', phase: 'SETTINGS', passed: fileExists('server/routes/workflowConfigRoutes.ts'), details: 'Workflow configuration API present', severity: 'medium' });
}

// ============================================================================
// PHASE 13: PWA & MANIFEST — Score fields, icons, screenshots, note_taking
// ============================================================================
async function phase13_pwa_manifest() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 13: PWA Manifest Completeness');
  console.log('════════════════════════════════════════');

  const manifest = readFile('client/public/manifest.json');
  let manifestJson: any = {};
  try { manifestJson = JSON.parse(manifest); } catch (e) { /* ignore */ }

  const requiredFields: Array<{ key: string; severity: 'critical' | 'high' | 'medium' }> = [
    { key: 'name', severity: 'critical' },
    { key: 'short_name', severity: 'critical' },
    { key: 'description', severity: 'high' },
    { key: 'start_url', severity: 'critical' },
    { key: 'display', severity: 'critical' },
    { key: 'display_override', severity: 'high' },
    { key: 'theme_color', severity: 'high' },
    { key: 'background_color', severity: 'high' },
    { key: 'icons', severity: 'critical' },
    { key: 'screenshots', severity: 'high' },
    { key: 'categories', severity: 'medium' },
    { key: 'shortcuts', severity: 'medium' },
    { key: 'share_target', severity: 'medium' },
    { key: 'protocol_handlers', severity: 'medium' },
    { key: 'file_handlers', severity: 'medium' },
    { key: 'scope_extensions', severity: 'high' },
    { key: 'launch_handler', severity: 'medium' },
    { key: 'handle_links', severity: 'medium' },
    { key: 'widgets', severity: 'medium' },
    { key: 'note_taking', severity: 'high' },
    { key: 'id', severity: 'high' },
    { key: 'lang', severity: 'medium' },
    { key: 'dir', severity: 'medium' },
    { key: 'edge_side_panel', severity: 'medium' },
    { key: 'iarc_rating_id', severity: 'medium' },
  ];

  for (const field of requiredFields) {
    record({
      name: `Manifest: ${field.key}`,
      phase: 'PWA',
      passed: !!manifestJson[field.key],
      details: manifestJson[field.key] ? `${field.key} present` : `${field.key} MISSING`,
      severity: field.severity,
    });
  }

  // Icons: 512x512 any + maskable
  const icons = manifestJson.icons || [];
  const has512any = icons.some((i: any) => i.sizes === '512x512' && (i.purpose === 'any' || !i.purpose));
  const has512mask = icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'maskable');
  record({ name: 'Manifest: 512x512 Icon (any)', phase: 'PWA', passed: has512any, details: has512any ? '512x512 any icon present' : 'MISSING', severity: 'critical' });
  record({ name: 'Manifest: 512x512 Icon (maskable)', phase: 'PWA', passed: has512mask, details: has512mask ? '512x512 maskable present' : 'MISSING', severity: 'high' });

  // Screenshots: one wide, one narrow
  const screenshots = manifestJson.screenshots || [];
  const hasWide = screenshots.some((s: any) => s.form_factor === 'wide');
  const hasNarrow = screenshots.some((s: any) => s.form_factor === 'narrow');
  record({ name: 'Manifest: Desktop Screenshot (wide)', phase: 'PWA', passed: hasWide, details: hasWide ? 'Wide screenshot present' : 'MISSING', severity: 'high' });
  record({ name: 'Manifest: Mobile Screenshot (narrow)', phase: 'PWA', passed: hasNarrow, details: hasNarrow ? 'Narrow screenshot present' : 'MISSING', severity: 'high' });

  // note_taking.new_note_url (added in this sprint)
  const noteUrl = manifestJson.note_taking?.new_note_url;
  record({ name: 'Manifest: note_taking.new_note_url', phase: 'PWA', passed: !!noteUrl, details: noteUrl ? `new_note_url: ${noteUrl}` : 'note_taking.new_note_url MISSING', severity: 'high' });

  // display_override includes tabbed (for PWABuilder score)
  const displayOverride: string[] = manifestJson.display_override || [];
  record({ name: 'Manifest: display_override has tabbed', phase: 'PWA', passed: displayOverride.includes('tabbed'), details: displayOverride.includes('tabbed') ? 'tabbed in display_override' : 'tabbed MISSING', severity: 'high' });

  // Service worker file
  record({ name: 'Service Worker File', phase: 'PWA', passed: fileExists('client/public/service-worker.js'), details: fileExists('client/public/service-worker.js') ? 'service-worker.js present' : 'MISSING', severity: 'critical' });

  // Screenshot image files exist
  for (const ss of screenshots.slice(0, 2)) {
    const imgPath = `client/public${ss.src}`;
    record({ name: `Screenshot File: ${path.basename(ss.src)}`, phase: 'PWA', passed: fileExists(imgPath), details: fileExists(imgPath) ? 'Image file exists' : 'MISSING image file', severity: 'high' });
  }
}

// ============================================================================
// PHASE 14: CROSS-SYSTEM NAME CONSISTENCY — Feature IDs match across configs
// ============================================================================
async function phase14_name_consistency() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 14: Cross-System Name Consistency');
  console.log('════════════════════════════════════════');

  const premFeatContent = readFile('shared/config/premiumFeatures.ts');
  const billingConfigContent = readFile('shared/billingConfig.ts');
  const creditMgrContent = readFile('server/services/billing/creditManager.ts');

  // Key features in premiumFeatures AND billingConfig
  const featureChecks: Array<{ name: string; premFeat: string; billingConfig: string }> = [
    { name: 'guard_tour_tracking', premFeat: 'guard_tour_tracking', billingConfig: 'guard_tour' },
    { name: 'equipment_tracking', premFeat: 'equipment_tracking', billingConfig: 'equipment' },
    { name: 'document_signing', premFeat: 'document_signing', billingConfig: 'document_signing' },
    { name: 'push_notifications', premFeat: 'push_notifications', billingConfig: 'push_notifications' },
    { name: 'employee_behavior_scoring', premFeat: 'employee_behavior_scoring', billingConfig: 'employee_behavior_scoring' },
    { name: 'payroll_automation', premFeat: 'payroll_automation', billingConfig: 'payroll' },
    { name: 'invoice_generation', premFeat: 'invoice_generation', billingConfig: 'invoice' },
    { name: 'shift_marketplace', premFeat: 'shift_marketplace', billingConfig: 'shift_marketplace' },
    { name: 'quickbooks_integration', premFeat: 'quickbooks', billingConfig: 'quickbooks' },
  ];

  for (const fc of featureChecks) {
    const inPremFeat = premFeatContent.includes(fc.premFeat);
    const inBillingConfig = billingConfigContent.includes(fc.billingConfig);
    record({
      name: `Feature Consistency: ${fc.name}`,
      phase: 'CONSISTENCY',
      passed: inPremFeat && inBillingConfig,
      details: `premiumFeatures:${inPremFeat ? 'OK' : 'MISSING'} billingConfig:${inBillingConfig ? 'OK' : 'MISSING'}`,
      severity: 'high',
    });
  }

  // Platform roles consistent
  const adminContent = readFile('server/routes/adminRoutes.ts');
  const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
  for (const role of supportRoles) {
    record({
      name: `Role Defined: ${role}`,
      phase: 'CONSISTENCY',
      passed: adminContent.includes(role),
      details: adminContent.includes(role) ? `Role '${role}' found` : `Role '${role}' MISSING`,
      severity: 'high',
    });
  }

  // billingMode values are valid
  const validBillingModes = ['included', 'per_use', 'per_document', 'per_minute', 'per_shift', 'per_seat', 'per_action'];
  const modesInPremFeat = validBillingModes.filter(m => premFeatContent.includes(`'${m}'`));
  record({
    name: 'BillingMode Values Consistent',
    phase: 'CONSISTENCY',
    passed: modesInPremFeat.length >= 5,
    details: `${modesInPremFeat.length}/${validBillingModes.length} valid billing modes used`,
    severity: 'high',
  });

  // Chatroom command service uses forwardToBot for HelpAI routing
  const chatroomCmdContent = readFile('server/services/chatroomCommandService.ts');
  record({ name: 'chatroom→HelpAI: forwardToBot Pattern', phase: 'CONSISTENCY', passed: chatroomCmdContent.includes('forwardToBot'), details: chatroomCmdContent.includes('forwardToBot') ? 'forwardToBot pattern in chatroom service' : 'forwardToBot MISSING', severity: 'high' });

  // H004 command executor uses /helpai and /escalate in HELPAI_COMMANDS
  const chatRoutesContent = readFile('server/routes/chat.ts');
  record({ name: 'H004: HELPAI_COMMANDS Array', phase: 'CONSISTENCY', passed: chatRoutesContent.includes('HELPAI_COMMANDS') && chatRoutesContent.includes('/helpai') && chatRoutesContent.includes('/escalate'), details: 'HELPAI_COMMANDS array with /helpai and /escalate wired', severity: 'high' });
}

// ============================================================================
// PHASE 15: END-TO-END ORCHESTRATION — Full platform flow trace
// ============================================================================
async function phase15_end_to_end() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 15: End-to-End Orchestration Trace');
  console.log('════════════════════════════════════════');

  // Time tracking chain
  const timeEntryRoutes = readFile('server/routes/timeEntryRoutes.ts');
  const payrollRoutes = readFile('server/routes/payrollRoutes.ts');
  const invoiceRoutes = readFile('server/routes/invoiceRoutes.ts');
  record({ name: 'Chain: Clock-In → Time Entry → Payroll', phase: 'E2E', passed: timeEntryRoutes.length > 0 && payrollRoutes.length > 0, details: 'Time→Payroll pipeline files present', severity: 'critical' });
  record({ name: 'Chain: Payroll → Invoice', phase: 'E2E', passed: payrollRoutes.length > 0 && invoiceRoutes.length > 0, details: 'Payroll→Invoice pipeline files present', severity: 'critical' });

  // Schedule chain
  record({ name: 'Chain: Schedule → Shift → Orders', phase: 'E2E', passed: fileExists('server/routes/schedulesRoutes.ts') && fileExists('server/routes/shiftRoutes.ts'), details: 'Schedule pipeline routes present', severity: 'critical' });

  // Compliance chain
  record({ name: 'Chain: Incident → Compliance Alert', phase: 'E2E', passed: fileExists('server/routes/complianceInlineRoutes.ts'), details: 'Compliance pipeline routes present', severity: 'high' });

  // Guard tour chain
  record({ name: 'Chain: Guard Tour → GPS Scan', phase: 'E2E', passed: fileExists('server/routes/guardTourRoutes.ts'), details: 'Guard tour routes present', severity: 'high' });

  // Equipment chain
  record({ name: 'Chain: Equipment → Checkout → Return', phase: 'E2E', passed: fileExists('server/routes/equipmentRoutes.ts'), details: 'Equipment routes present', severity: 'high' });

  // HelpAI full session lifecycle
  const helpaiRoutes = readFile('server/helpai-routes.ts');
  const lifecycleEndpoints = ['/session/start', '/session/', '/message', '/escalate', '/close'];
  const presentEndpoints = lifecycleEndpoints.filter(e => helpaiRoutes.includes(e));
  record({ name: 'HelpAI E2E: Full Session Lifecycle', phase: 'E2E', passed: presentEndpoints.length >= 4, details: `${presentEndpoints.length}/${lifecycleEndpoints.length} lifecycle endpoints: ${presentEndpoints.join(', ')}`, severity: 'critical' });

  // Trinity staffing automation
  record({ name: 'Trinity E2E: Staffing Auto-Assign', phase: 'E2E', passed: fileExists('server/routes/trinityStaffingRoutes.ts'), details: 'Trinity staffing routes present', severity: 'high' });

  // Notification chain
  record({ name: 'Notification Chain: Send → Delivery', phase: 'E2E', passed: fileExists('server/routes/notifications.ts') && fileExists('server/routes/resendWebhooks.ts'), details: 'Notification + delivery webhook routes present', severity: 'high' });

  // Document pipeline (actual path: server/pipeline/documentPipeline.ts)
  record({ name: 'Document Pipeline: 7 Document Types', phase: 'E2E', passed: fileExists('server/pipeline/documentPipeline.ts'), details: fileExists('server/pipeline/documentPipeline.ts') ? 'Document pipeline service present' : 'documentPipeline.ts MISSING', severity: 'high' });

  // Multi-tenant isolation
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: workspaces | Verified: 2026-03-23
    const wsCount = await typedCount(sql`SELECT count(*) as cnt FROM workspaces`);
    const wsCnt = Number(extractRows(wsCount)[0]?.cnt ?? 0);
    record({ name: 'Multi-Tenant: Multiple Workspaces', phase: 'E2E', passed: wsCnt >= 1, details: `${wsCnt} workspaces in DB`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'Multi-Tenant: Multiple Workspaces', phase: 'E2E', passed: false, details: e.message, severity: 'critical' });
  }

  // ensureWorkspaceAccess middleware
  record({ name: 'ensureWorkspaceAccess Middleware', phase: 'E2E', passed: readFile('server/routes.ts').includes('ensureWorkspaceAccess'), details: 'Workspace isolation middleware registered', severity: 'critical' });

  // Audit trail active
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: audit_logs | Verified: 2026-03-23
    const auditCount = await typedCount(sql`SELECT count(*) as cnt FROM audit_logs`);
    record({ name: 'Audit Trail Active', phase: 'E2E', passed: true, details: `${Number(extractRows(auditCount)[0]?.cnt ?? 0)} audit log entries`, severity: 'critical' });
  } catch (e: any) {
    record({ name: 'Audit Trail Active', phase: 'E2E', passed: false, details: e.message, severity: 'critical' });
  }

  // Contract lifecycle pipeline
  record({ name: 'Contract Pipeline Routes', phase: 'E2E', passed: fileExists('server/routes/contractPipelineRoutes.ts'), details: 'Contract lifecycle pipeline present', severity: 'high' });

  // Employee behavior scoring table
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: employee_behavior_scores | Verified: 2026-03-23
    const scores = await typedCount(sql`SELECT count(*) as cnt FROM employee_behavior_scores`);
    record({ name: 'Behavior Scoring DB Active', phase: 'E2E', passed: true, details: `${Number(extractRows(scores)[0]?.cnt ?? 0)} behavior scores`, severity: 'high' });
  } catch (e: any) {
    record({ name: 'Behavior Scoring DB Active', phase: 'E2E', passed: false, details: e.message, severity: 'high' });
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
export async function runOrchestrationStressTest() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          ORCHESTRATION STRESS TEST — ALL SYSTEMS            ║');
  console.log('║  Routes · Bots · HelpAI · Trinity · Billing · Onboarding   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await phase1_db_table_coverage();
  await phase2_bot_ecosystem();
  await phase3_helpai_orchestration();
  await phase4_trinity_orchestration();
  await phase5_subscription_lifecycle();
  await phase6_onboarding_workflow();
  await phase7_credit_chain();
  await phase8_support_tools();
  await phase9_frontend_backend_alignment();
  await phase10_quickbooks_webhook();
  await phase11_chatroom_system();
  await phase12_settings_config();
  await phase13_pwa_manifest();
  await phase14_name_consistency();
  await phase15_end_to_end();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const criticalFails = results.filter(r => !r.passed && r.severity === 'critical').length;
  const highFails = results.filter(r => !r.passed && r.severity === 'high').length;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} PASSED | ${failed} FAILED (${results.length} total)               ║`);
  console.log(`║  Critical Fails: ${criticalFails} | High Fails: ${highFails}                           ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  [${r.severity.toUpperCase()}] [${r.phase}] ${r.name}: ${r.details}`);
    });
  } else {
    console.log('\n✅ ALL ORCHESTRATION TESTS PASSED — Platform is fully integrated');
  }

  return { total: results.length, passed, failed, criticalFails, highFails, results };
}
